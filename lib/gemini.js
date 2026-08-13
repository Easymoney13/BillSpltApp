const { normalizeAmount } = require('./receiptMath');

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
  const prompt = `You extract structured data from restaurant and retail receipts in English or Hebrew.
Return JSON only. Do not guess or invent an item or price. Omit any item whose price is unreadable.
Extract storeName, date (YYYY-MM-DD when readable), currency (NIS/USD/GBP/EUR), subtotal, tax, service, discount, receiptTotal, and every purchased line item.
Do not treat subtotal, total, tax, payment, change, or cashier metadata as purchased items.
Schema: {"storeName":"","date":"","currency":"NIS","subtotal":0,"tax":0,"service":0,"discount":0,"receiptTotal":0,"items":[{"name":"","price":0,"category":"Food|Beverages|Dessert|Service|Other"}]}`;
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
        generationConfig: { response_mime_type: 'application/json', temperature: 0 },
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

module.exports = {
  DEFAULT_MODELS,
  normalizeReceipt,
  parseJsonCandidate,
  parseReceiptImage,
};
