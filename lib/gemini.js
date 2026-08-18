const { normalizeAmount, normalizeDiscount, isTotalOrTaxLine, reconcileReceipt } = require('./receiptMath');

// Pin stable model names so OCR behavior cannot silently change when a
// `latest` alias moves to a new release.
const DEFAULT_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const REQUEST_TIMEOUT_MS = 7_500;
const PIPELINE_TIMEOUT_MS = 12_500;

const RECEIPT_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    storeName: { type: 'STRING', description: 'Name of the store or restaurant exactly as printed' },
    date: { type: 'STRING', description: 'Date of transaction (YYYY-MM-DD)' },
    currency: { type: 'STRING', enum: ['NIS', 'USD', 'GBP', 'EUR'], description: 'Currency code' },
    subtotal: { type: 'NUMBER', description: 'Subtotal amount if explicitly printed' },
    tax: { type: 'NUMBER', description: 'Tax amount if explicitly printed' },
    service: { type: 'NUMBER', description: 'Service fee if explicitly printed' },
    discount: { type: 'NUMBER', description: 'Discount amount if explicitly printed' },
    receiptTotal: { type: 'NUMBER', description: 'Final amount due if readable' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: 'Item description exactly as printed, without quantity or price' },
          quantity: { type: 'NUMBER', description: 'Purchased quantity; default to 1 only when no quantity is printed' },
          unitPrice: { type: 'NUMBER', description: 'Price for one unit when shown or inferable from quantity and line total' },
          lineTotal: { type: 'NUMBER', description: 'Total charged for this full item row; this is the value used for splitting' },
          category: { type: 'STRING', enum: ['Food', 'Beverages', 'Dessert', 'Service', 'Other'], description: 'Item category' },
        },
        required: ['name', 'lineTotal'],
      },
    },
  },
  required: ['storeName', 'items'],
};

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
    const quantity = normalizeAmount(item?.quantity);
    const unitPrice = normalizeAmount(item?.unitPrice ?? item?.unit_price);
    const explicitLineTotal = normalizeAmount(
      item?.lineTotal ?? item?.line_total ?? item?.totalPrice ?? item?.total_price
    );
    const legacyPrice = normalizeAmount(item?.price);
    const calculatedLineTotal = quantity && unitPrice
      ? Math.round(quantity * unitPrice * 100) / 100
      : null;
    const price = explicitLineTotal ?? calculatedLineTotal ?? legacyPrice ?? unitPrice;
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name || price === null || price <= 0 || price > 50_000) return [];
    if (isTotalOrTaxLine(name)) return [];
    const quantitySuffix = quantity && quantity > 1 ? ` (${quantity}x)` : '';
    return [{
      id: `ocr_item_${index}`,
      name: `${name}${quantitySuffix}`,
      price,
      quantity: quantity || 1,
      unitPrice: unitPrice ?? (quantity && quantity > 0 ? Math.round((price / quantity) * 100) / 100 : price),
      lineTotal: price,
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
    discount: normalizeDiscount(parsed.discount),
    items,
  };
}

async function requestModel(modelName, apiKey, base64Images, mimeType, options = {}) {
  const images = Array.isArray(base64Images) ? base64Images : [base64Images];
  const passLabel = options.pass === 'verification'
    ? 'This is a cross-model verification read. Ignore any earlier answer and read only the pixels.'
    : 'This is the primary extraction read.';
  const prompt = `Analyze this restaurant receipt image and return the structured receipt JSON.

Read the complete physical image from top to bottom and preserve its two-dimensional layout. The receipt may be in Hebrew (right-to-left), English, or mixed text. Match an item name to the numeric values on the same visual row, even when the item is right-aligned and the price is left-aligned.

Rules:
- Extract every purchased item from every section of the receipt, including rows after divider lines.
- For each row, return the item name, quantity, unit price, and the full line total. lineTotal must be the complete amount charged for that row and is the value EasySplit will split.
- Preserve item names as printed. Remove obvious stray OCR glyphs, but never replace an uncertain name with a guessed product.
- Never include subtotal, total, VAT/tax, service, tip, discount, payment, cash, credit-card, change, table, waiter, or receipt-number lines as purchased items.
- Read receiptTotal, subtotal, tax, service, and discount only when they are explicitly visible. VAT may already be included in Israeli item prices.
- Do not invent an unreadable item or price and do not adjust prices merely to make the arithmetic match.
- A subtotal, tax, service, or discount is evidence only when its label and amount are visibly printed. Never use an adjustment merely because it makes the numbers balance.
- Multiple image parts, when supplied, are consecutive non-overlapping sections of one long receipt. Read them in order.
- Return numbers as decimal values without currency symbols.
${passLabel}`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1, options.timeoutMs || REQUEST_TIMEOUT_MS));

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          ...images.flatMap((data, index) => [
            { text: `Receipt image part ${index + 1} of ${images.length}.` },
            { inline_data: { mime_type: mimeType || 'image/jpeg', data } },
          ]),
        ] }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0,
          response_schema: RECEIPT_RESPONSE_SCHEMA,
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

function receiptQualityScore(receipt) {
  if (!receipt?.items?.length) return -Infinity;
  const reconciliation = reconcileReceipt(receipt);
  let score = 0;
  if (reconciliation.receiptTotal !== null) score += 10;
  if (reconciliation.status === 'matched') score += 60;
  if (reconciliation.status === 'matched_adjusted') score += 55;
  if (reconciliation.status === 'ambiguous_adjustments') score += 5;
  if (reconciliation.status === 'mismatch' && reconciliation.receiptTotal) {
    score -= Math.min(40, (reconciliation.difference / reconciliation.receiptTotal) * 100);
  }
  return score;
}

function normalizeLineIdentity(item) {
  return String(item?.name || '')
    .toLowerCase()
    .replace(/\(\s*\d+(?:\.\d+)?x\s*\)$/i, '')
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '')
    .trim();
}

function haveSameLineIdentities(first, second) {
  const firstItems = Array.isArray(first?.items) ? first.items : [];
  const secondItems = Array.isArray(second?.items) ? second.items : [];
  if (firstItems.length !== secondItems.length || firstItems.length === 0) return false;
  return firstItems.every((item, index) => (
    normalizeLineIdentity(item) === normalizeLineIdentity(secondItems[index])
  ));
}

function haveSameReceiptValues(first, second) {
  if (!haveSameLineIdentities(first, second)) return false;
  const textFields = ['storeName', 'date', 'currency'];
  if (!textFields.every((field) => String(first?.[field] || '').trim().toLowerCase() === String(second?.[field] || '').trim().toLowerCase())) return false;
  const amountFields = ['receiptTotal', 'subtotal', 'tax', 'service'];
  if (!amountFields.every((field) => normalizeAmount(first?.[field]) === normalizeAmount(second?.[field]))) return false;
  if (normalizeDiscount(first?.discount) !== normalizeDiscount(second?.discount)) return false;
  return first.items.every((item, index) => (
    normalizeAmount(item?.price) === normalizeAmount(second.items[index]?.price)
    && (normalizeAmount(item?.quantity) || 1) === (normalizeAmount(second.items[index]?.quantity) || 1)
    && normalizeAmount(item?.unitPrice) === normalizeAmount(second.items[index]?.unitPrice)
  ));
}

function selectBetterReceipt(first, second) {
  if (!first) return second;
  if (!second) return first;
  // Verification is evidence, not an arithmetic optimizer. Never replace the
  // primary pixel read merely because another read balances more neatly.
  return first;
}

async function parseReceiptImage(base64Image, mimeType = 'image/jpeg', customApiKey = '', options = {}) {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY || '';
  const rawImages = Array.isArray(base64Image) ? base64Image : [base64Image];
  const cleanImages = rawImages
    .filter((value) => typeof value === 'string')
    .map((value) => value.replace(/^data:[^;]+;base64,/, ''))
    .filter(Boolean)
    .slice(0, 6);
  if (!apiKey || cleanImages.length === 0) return null;
  const configuredModel = process.env.GEMINI_MODEL;
  const models = [...new Set([configuredModel, ...DEFAULT_MODELS].filter(Boolean))];
  const deadline = Date.now() + Math.max(3_000, options.pipelineTimeoutMs || PIPELINE_TIMEOUT_MS);
  let modelAttempts = 0;

  for (const modelName of models) {
    const remaining = deadline - Date.now();
    if (remaining < 1_000) break;
    try {
      modelAttempts += 1;
      const receipt = await requestModel(modelName, apiKey, cleanImages, mimeType, {
        pass: 'primary',
        timeoutMs: Math.min(REQUEST_TIMEOUT_MS, remaining),
      });
      if (!receipt) continue;

      const verificationBudget = deadline - Date.now();
      if (verificationBudget < 2_000) {
        return {
          ...receipt,
          ocr: { source: 'gemini-vision', modelName, modelAttempts, verificationStatus: 'deadline_reached' },
        };
      }
      const verificationModelName = models.find((candidate) => candidate !== modelName);
      if (!verificationModelName) {
        return {
          ...receipt,
          ocr: { source: 'gemini-vision', modelName, modelAttempts, verificationStatus: 'verification_unavailable' },
        };
      }
      modelAttempts += 1;
      const verifiedReceipt = await requestModel(verificationModelName, apiKey, cleanImages, mimeType, {
        pass: 'verification',
        timeoutMs: Math.min(5_000, verificationBudget),
      });
      const sameLines = haveSameLineIdentities(receipt, verifiedReceipt);
      const sameValues = haveSameReceiptValues(receipt, verifiedReceipt);
      const verificationStatus = !verifiedReceipt
        ? 'verification_failed'
        : (sameLines
          ? (sameValues ? 'cross_model_agreement' : 'value_disagreement')
          : 'row_disagreement');
      return {
        ...receipt,
        ocr: { source: 'gemini-vision', modelName, verificationModelName, modelAttempts, verificationStatus },
      };
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
- Keep item names faithful to the OCR input and remove only quantity prefixes or stray glyphs.
- Detect the transaction currency (NIS/USD/GBP/EUR). If Hebrew characters are present, default to NIS.
- Do not invent items or prices. If a line is unreadable or has no price, skip it.
- Do not treat subtotal, tax, discount, change, or cashier names as purchased items.
- Extract totals (subtotal, tax, service, discount, receiptTotal) when available.`;

  const configuredModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
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
          response_schema: RECEIPT_RESPONSE_SCHEMA,
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
  receiptQualityScore,
  haveSameLineIdentities,
  haveSameReceiptValues,
  selectBetterReceipt,
  parseReceiptImage,
  parseReceiptTextWithGemini,
};
