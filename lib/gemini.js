const { normalizeAmount, isTotalOrTaxLine } = require('./receiptMath');

const DEFAULT_MODELS = ['gemini-flash-latest', 'gemini-2.5-flash'];
const REQUEST_TIMEOUT_MS = 20_000;

function parseJsonCandidate(text) {
  if (!text || typeof text !== 'string') return null;
  let cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleanText.indexOf('{');
  const end = cleanText.lastIndexOf('}');
  if (start !== -1 && end > start) cleanText = cleanText.slice(start, end + 1);
  try {
    return JSON.parse(cleanText);
  } catch (_) {
    try {
      return JSON.parse(cleanText.replace(/,\s*([\]}])/g, '$1').replace(/[\u0000-\u001F]+/g, ' '));
    } catch (_) {
      return null;
    }
  }
}

function normalizeReceipt(parsed, sourceText) {
  const rawItems = parsed?.items || parsed?.lineItems || parsed?.receiptItems || [];
  if (!Array.isArray(rawItems)) return null;
  const items = rawItems.flatMap((item, index) => {
    const price = normalizeAmount(item?.price);
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || price === null || price <= 0 || price > 50_000) return [];
    if (isTotalOrTaxLine(name)) return [];
    return [{
      id: `ocr_item_${index}`,
      name,
      price,
      category: typeof item.category === 'string' ? item.category : 'Other',
      claimedBy: [],
    }];
  });
  if (items.length === 0) return null;

  const hasHebrew = /[\u0590-\u05FF]/.test(sourceText || '');
  return {
    storeName: typeof parsed.storeName === 'string' ? parsed.storeName : 'Scanned Receipt',
    date: typeof parsed.date === 'string' ? parsed.date : new Date().toISOString().split('T')[0],
    currency: hasHebrew ? 'NIS' : (typeof parsed.currency === 'string' ? parsed.currency : 'NIS'),
    receiptTotal: normalizeAmount(parsed.receiptTotal ?? parsed.total),
    subtotal: normalizeAmount(parsed.subtotal),
    tax: normalizeAmount(parsed.tax),
    service: normalizeAmount(parsed.service),
    discount: normalizeAmount(parsed.discount),
    items,
  };
}

async function requestModel(modelName, apiKey, base64Image, mimeType) {
  const prompt = `You are a professional receipt OCR scanner. Analyze the receipt image and extract structured data in JSON.
Examine the ENTIRE receipt image from top to bottom.
The receipt may be written in Hebrew and can contain multiple sections divided by dashed lines "---", asterisks "***", or lines of dots. 
You MUST extract ALL purchased items from EVERY section. Do not stop parsing items when you encounter a divider line.

CRITICAL GUIDELINES:
- Extract all purchased line items (items). For each, extract its name, price, and category.
- If the receipt is in Hebrew, extract the item names in clean Hebrew.
- Correct obvious OCR text artifacts or spelling mistakes to sensible Hebrew words. For example:
  - If you see "E i P ביצה בהרכבה עצמית" or similar, correct it to "פיצה בהרכבה עצמית" (Pizza).
  - If you see "אייספסינלורה", correct it to "אייס פסיפלורה" (Passionfruit Ice).
  - If you see "קולהoen" or "פפסי קולה" with letters cut off, correct it to "פפסי קולה".
- Hebrew receipts have right-aligned item names and left-aligned prices. Align each item's name with the price on the same horizontal line.
- Omit the total line itself (e.g., "סה\"כ") from the items list.
- Do not invent items or prices. If a price is completely unreadable, omit that item.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType || 'image/jpeg', data: base64Image } },
        ] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0,
          response_schema: {
            type: 'OBJECT',
            properties: {
              storeName: { type: 'STRING', description: 'Name of the store or restaurant' },
              date: { type: 'STRING', description: 'Date of transaction (YYYY-MM-DD)' },
              currency: { type: 'STRING', enum: ['NIS', 'USD', 'GBP', 'EUR'], description: 'Currency code' },
              subtotal: { type: 'NUMBER', description: 'Subtotal amount' },
              tax: { type: 'NUMBER', description: 'Tax amount' },
              service: { type: 'NUMBER', description: 'Service fee or tips' },
              discount: { type: 'NUMBER', description: 'Discount applied' },
              receiptTotal: { type: 'NUMBER', description: 'Total paid amount' },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING', description: 'Item name' },
                    price: { type: 'NUMBER', description: 'Price of the item' },
                    category: { type: 'STRING', enum: ['Food', 'Beverages', 'Dessert', 'Service', 'Other'], description: 'Item category' }
                  },
                  required: ['name', 'price']
                }
              }
            },
            required: ['storeName', 'receiptTotal', 'items']
          }
        },
      }),
    });
    if (!response.ok) return null;
    const responseData = await response.json();
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    return normalizeReceipt(parseJsonCandidate(text), text);
  } finally {
    clearTimeout(timeout);
  }
}

async function parseReceiptImage(base64Image, mimeType = 'image/jpeg', customApiKey = '') {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey || typeof base64Image !== 'string') return null;
  const cleanBase64 = base64Image.replace(/^data:[^;]+;base64,/, '');
  if (!cleanBase64) return null;
  const configuredModel = process.env.GEMINI_MODEL;
  const models = [...new Set([configuredModel, ...DEFAULT_MODELS].filter(Boolean))];

  for (const modelName of models) {
    try {
      const receipt = await requestModel(modelName, apiKey, cleanBase64, mimeType);
      if (receipt) return receipt;
    } catch (err) {
      const reason = err?.name === 'AbortError' ? 'timed out' : 'failed';
      console.warn(`Receipt OCR ${reason} for ${modelName}`);
    }
  }
  return null;
}

async function parseReceiptTextWithGemini(rawText, customApiKey = '') {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey || typeof rawText !== 'string' || !rawText.trim()) return null;

  const prompt = `You are a receipt parsing assistant. You are given the raw OCR text output of a scanned receipt in English or Hebrew.
Your task is to reconstruct the receipt into structured JSON.
Examine the entire raw text from top to bottom. Reconstruct all items, their prices, and categories.

CRITICAL GUIDELINES:
- Extract ALL purchased line items. Do not stop parsing items when you encounter separator lines (e.g. "---", "___", "***", dots, or borders).
- Keep item names clean: remove quantity prefixes (e.g. "1", "2x") or duplicate numbers from the name.
- Correct spelling mistakes or OCR artifacts in Hebrew. For example:
  - If you see "E i P ביצה בהרכבה עצמית" or similar, correct it to "פיצה בהרכבה עצמית" (Pizza).
  - If you see "אייספסינלורה", correct it to "אייס פסיפלורה" (Passionfruit Ice).
  - If you see "קולהoen" or "oen קולה", correct it to "פפסי קולה".
- Detect the transaction currency (NIS/USD/GBP/EUR). If Hebrew characters are present, default to NIS.
- Do not invent items or prices. If a line is unreadable or has no price, skip it.
- Do not treat subtotal, tax, discount, change, or cashier names as purchased items.
- Extract totals (subtotal, tax, service, discount, receiptTotal) when available.`;

  const configuredModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(configuredModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { text: `Raw OCR Text:\n${rawText}` }
        ] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0,
          response_schema: {
            type: 'OBJECT',
            properties: {
              storeName: { type: 'STRING', description: 'Name of the store or restaurant' },
              date: { type: 'STRING', description: 'Date of transaction (YYYY-MM-DD)' },
              currency: { type: 'STRING', enum: ['NIS', 'USD', 'GBP', 'EUR'], description: 'Currency code' },
              subtotal: { type: 'NUMBER', description: 'Subtotal amount' },
              tax: { type: 'NUMBER', description: 'Tax amount' },
              service: { type: 'NUMBER', description: 'Service fee or tips' },
              discount: { type: 'NUMBER', description: 'Discount applied' },
              receiptTotal: { type: 'NUMBER', description: 'Total paid amount' },
              items: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    name: { type: 'STRING', description: 'Item name' },
                    price: { type: 'NUMBER', description: 'Price of the item' },
                    category: { type: 'STRING', enum: ['Food', 'Beverages', 'Dessert', 'Service', 'Other'], description: 'Item category' }
                  },
                  required: ['name', 'price']
                }
              }
            },
            required: ['storeName', 'receiptTotal', 'items']
          }
        },
      }),
    });
    if (!response.ok) return null;
    const responseData = await response.json();
    const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    return normalizeReceipt(parseJsonCandidate(text), text);
  } catch (err) {
    console.error('Error parsing receipt text with Gemini:', err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  DEFAULT_MODELS,
  normalizeReceipt,
  parseJsonCandidate,
  parseReceiptImage,
  parseReceiptTextWithGemini,
};
