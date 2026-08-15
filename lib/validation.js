const security = require('./security');

class ValidationError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

function requireObject(value, label = 'payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function requireString(value, label, maxLength = 100) {
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a string`);
  const clean = security.sanitizeString(value, maxLength);
  if (!clean) throw new ValidationError(`${label} is required`);
  return clean;
}

function optionalString(value, maxLength = 100) {
  return typeof value === 'string' ? security.sanitizeString(value, maxLength) : '';
}

function requirePrice(value, label = 'price') {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 50000) {
    throw new ValidationError(`${label} must be between 0.01 and 50,000`);
  }
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function optionalPercentage(value, label = 'percentage') {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new ValidationError(`${label} must be between 0 and 100`);
  }
  return Math.round(parsed * 100) / 100;
}

function validateItems(items, { allowEmpty = false, maxItems = 250 } = {}) {
  if (!Array.isArray(items)) throw new ValidationError('items must be an array');
  if (!allowEmpty && items.length === 0) throw new ValidationError('At least one item is required');
  if (items.length > maxItems) throw new ValidationError(`A bill cannot contain more than ${maxItems} items`);

  return items.map((rawItem, index) => {
    const item = requireObject(rawItem, `items[${index}]`);
    const claimedBy = Array.isArray(item.claimedBy)
      ? [...new Set(item.claimedBy.filter((id) => typeof id === 'string').map((id) => optionalString(id, 100)).filter(Boolean))].slice(0, 100)
      : [];
    return {
      id: optionalString(item.id, 100),
      name: requireString(item.name || 'Receipt Item', `items[${index}].name`, 80),
      price: requirePrice(item.price, `items[${index}].price`),
      category: optionalString(item.category || 'Other', 30) || 'Other',
      claimedBy,
    };
  });
}

function validateSessionAction(action, rawPayload) {
  const allowed = new Set([
    'TOGGLE_CLAIM',
    'SPLIT_EVERYONE',
    'ADD_ITEM',
    'EDIT_ITEM',
    'DELETE_ITEM',
    'TOGGLE_SETTLED',
    'SET_TIP',
    'SETTLE_ALL',
    'SET_PAYER',
  ]);
  if (!allowed.has(action)) throw new ValidationError('Unknown session action');
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};

  if (['TOGGLE_CLAIM', 'EDIT_ITEM', 'DELETE_ITEM'].includes(action)) {
    payload.itemId = requireString(payload.itemId, 'itemId', 100);
  }
  if (action === 'TOGGLE_CLAIM' || action === 'TOGGLE_SETTLED') {
    payload.memberId = requireString(payload.memberId, 'memberId', 100);
  }
  if (action === 'ADD_ITEM' || action === 'EDIT_ITEM') {
    payload.name = requireString(payload.name, 'name', 80);
    payload.price = requirePrice(payload.price);
    payload.category = optionalString(payload.category || 'Other', 30) || 'Other';
  }
  if (action === 'SET_TIP') payload.tipPercentage = optionalPercentage(payload.tipPercentage, 'tipPercentage');
  if (action === 'TOGGLE_SETTLED' && payload.settled !== undefined) payload.settled = Boolean(payload.settled);
  if (action === 'SET_PAYER') payload.payerId = optionalString(payload.payerId, 100) || 'each';
  return payload;
}

function validateReceiptBody(rawBody) {
  const body = requireObject(rawBody, 'request body');
  const hasImage = typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;
  const hasParsedBill = body.parsedBill && typeof body.parsedBill === 'object';
  const hasRawText = typeof body.rawText === 'string' && body.rawText.length > 0;

  if (!hasImage && !hasParsedBill && !hasRawText) {
    throw new ValidationError('A receipt image, manual bill, or raw OCR text is required');
  }
  if (hasImage && body.imageBase64.length > 14_000_000) throw new ValidationError('Receipt image is too large');

  const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  const mimeType = optionalString(body.mimeType || 'image/jpeg', 30).toLowerCase();
  if (hasImage && !allowedMimeTypes.has(mimeType)) throw new ValidationError('Unsupported receipt image type');

  return {
    imageBase64: hasImage ? body.imageBase64 : '',
    mimeType,
    hostName: optionalString(body.hostName || 'Host', 30) || 'Host',
    parsedBill: hasParsedBill ? body.parsedBill : null,
    customGeminiKey: optionalString(body.customGeminiKey, 200),
    rawText: hasRawText ? body.rawText : '',
  };
}

module.exports = {
  ValidationError,
  requireObject,
  requireString,
  optionalString,
  requirePrice,
  optionalPercentage,
  validateItems,
  validateSessionAction,
  validateReceiptBody,
};
