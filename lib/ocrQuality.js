const HEBREW_CHARACTER = /[\u0590-\u05ff]/;
const LATIN_CHARACTER = /[a-z]/i;
const LETTER_CHARACTER = /[a-z\u0590-\u05ff]/i;
const BIDI_CONTROL_CHARACTERS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const MOJIBAKE_MARKERS = /\ufffd|(?:Ã[^\x00-\x7f]|Â[^\x00-\x7f])|(?:×[^\x00-\x7f]){2,}|(?:Ø[^\x00-\x7f]){2,}|(?:Ù[^\x00-\x7f]){2,}/g;
const HEBREW_OCR_ACCEPTANCE_TARGET = 0.96;

function clampScore(value) {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function normalizeOcrName(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(BIDI_CONTROL_CHARACTERS, '')
    .replace(CONTROL_CHARACTERS, '')
    .replace(/\ufffd/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(value, pattern) {
  return [...String(value || '').matchAll(pattern)].length;
}

function inferDocumentLanguage(receipt, sourceText = '') {
  const declared = String(receipt?.documentLanguage || receipt?.language || '').toLowerCase();
  if (['hebrew', 'english', 'mixed'].includes(declared)) return declared;
  const itemText = Array.isArray(receipt?.items)
    ? receipt.items.map((item) => item?.name || '').join(' ')
    : '';
  const combined = `${sourceText || ''} ${receipt?.storeName || ''} ${itemText}`;
  const hebrew = countMatches(combined, /[\u0590-\u05ff]/g);
  const latin = countMatches(combined, /[a-z]/gi);
  if (hebrew >= 4 && latin >= 4) return 'mixed';
  if (hebrew >= 4) return 'hebrew';
  if (latin >= 4) return 'english';
  return 'unknown';
}

function assessOcrReadability(receipt, options = {}) {
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  const names = items.map((item) => normalizeOcrName(item?.name)).filter(Boolean);
  const joined = names.join(' ');
  const language = options.expectedLanguage || inferDocumentLanguage(receipt, options.sourceText);
  const letterCount = countMatches(joined, /[a-z\u0590-\u05ff]/gi);
  const hebrewCount = countMatches(joined, /[\u0590-\u05ff]/g);
  const latinCount = countMatches(joined, /[a-z]/gi);
  const mojibakeCount = countMatches(joined, MOJIBAKE_MARKERS);
  const originalNames = items.map((item) => String(item?.name || '')).join(' ');
  const replacementCount = countMatches(originalNames, /\ufffd/g);
  const controlCount = countMatches(originalNames, /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g);
  const punctuationRuns = countMatches(joined, /[^\p{L}\p{N}\s]{3,}/gu);
  const singleLetterTokens = joined
    .split(/\s+/)
    .filter((token) => token.length === 1 && LETTER_CHARACTER.test(token)).length;
  const lineWithLettersCount = names.filter((name) => LETTER_CHARACTER.test(name)).length;
  const hebrewLineCount = names.filter((name) => HEBREW_CHARACTER.test(name)).length;
  const hebrewCharacterRatio = letterCount ? hebrewCount / letterCount : 0;
  const latinCharacterRatio = letterCount ? latinCount / letterCount : 0;
  const hebrewLineRatio = names.length ? hebrewLineCount / names.length : 0;
  const recognitionConfidence = Number(options.confidence);
  const reasons = [];

  if (names.length === 0) reasons.push('no-readable-item-names');
  if (lineWithLettersCount < Math.min(2, names.length)) reasons.push('too-few-readable-lines');
  if (mojibakeCount > 0 || replacementCount > 0 || controlCount > 0) reasons.push('invalid-unicode-output');
  if (punctuationRuns > Math.max(1, Math.floor(names.length / 3))) reasons.push('punctuation-noise');
  if (singleLetterTokens > Math.max(2, Math.floor(names.length * 0.75))) reasons.push('fragmented-words');
  if (language === 'hebrew' && hebrewCharacterRatio < 0.55) reasons.push('hebrew-script-mismatch');
  if (language === 'hebrew' && hebrewLineRatio < 0.6) reasons.push('too-few-hebrew-item-lines');
  if (language === 'mixed' && hebrewCharacterRatio < 0.18) reasons.push('mixed-script-mismatch');
  if (language === 'english' && latinCharacterRatio < 0.55) reasons.push('english-script-mismatch');
  if (Number.isFinite(recognitionConfidence) && recognitionConfidence < 45) reasons.push('low-engine-confidence');

  let score = 1;
  score -= Math.min(0.7, mojibakeCount * 0.35);
  score -= Math.min(0.5, replacementCount * 0.35 + controlCount * 0.2);
  score -= Math.min(0.25, punctuationRuns * 0.08);
  if (language === 'hebrew') score -= Math.max(0, 0.72 - hebrewCharacterRatio) * 0.75;
  if (language === 'mixed') score -= Math.max(0, 0.25 - hebrewCharacterRatio) * 0.6;
  if (names.length < 2) score -= 0.1;
  if (Number.isFinite(recognitionConfidence) && recognitionConfidence < 70) {
    score -= (70 - recognitionConfidence) / 140;
  }

  const severeReasons = new Set([
    'no-readable-item-names',
    'invalid-unicode-output',
    'hebrew-script-mismatch',
    'too-few-hebrew-item-lines',
    'mixed-script-mismatch',
    'english-script-mismatch',
  ]);
  const readable = names.length > 0
    && !reasons.some((reason) => severeReasons.has(reason))
    && clampScore(score) >= 0.7;

  return {
    readable,
    score: clampScore(score),
    language,
    hebrewCharacterRatio: clampScore(hebrewCharacterRatio),
    hebrewLineRatio: clampScore(hebrewLineRatio),
    reasons: [...new Set(reasons)],
  };
}

function sanitizeReceiptNames(receipt) {
  if (!receipt || typeof receipt !== 'object') return receipt;
  return {
    ...receipt,
    storeName: normalizeOcrName(receipt.storeName),
    items: Array.isArray(receipt.items)
      ? receipt.items.map((item) => ({ ...item, name: normalizeOcrName(item?.name) }))
      : [],
  };
}

function normalizedNameForComparison(value) {
  return normalizeOcrName(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/gi, '');
}

function textSimilarity(first, second) {
  const left = [...normalizedNameForComparison(first)];
  const right = [...normalizedNameForComparison(second)];
  if (!left.length && !right.length) return 1;
  if (!left.length || !right.length) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return clampScore(1 - (previous[right.length] / Math.max(left.length, right.length)));
}

function evaluateReceiptAccuracy(expectedReceipt, actualReceipt) {
  const expectedItems = Array.isArray(expectedReceipt?.items) ? expectedReceipt.items : [];
  const actualItems = Array.isArray(actualReceipt?.items) ? actualReceipt.items : [];
  if (!expectedItems.length) return { accuracy: 0, correctRows: 0, expectedRows: 0, passed: false };
  let correctRows = 0;
  expectedItems.forEach((expected, index) => {
    const actual = actualItems[index];
    if (!actual) return;
    const expectedPrice = Math.round(Number(expected.price) * 100);
    const actualPrice = Math.round(Number(actual.price) * 100);
    if (expectedPrice === actualPrice && textSimilarity(expected.name, actual.name) >= 0.9) correctRows += 1;
  });
  const rowAccuracy = correctRows / Math.max(expectedItems.length, actualItems.length);
  return {
    accuracy: clampScore(rowAccuracy),
    correctRows,
    expectedRows: expectedItems.length,
    passed: rowAccuracy >= HEBREW_OCR_ACCEPTANCE_TARGET,
  };
}

function haveSamePurchasedRows(firstReceipt, secondReceipt) {
  const firstItems = Array.isArray(firstReceipt?.items) ? firstReceipt.items : [];
  const secondItems = Array.isArray(secondReceipt?.items) ? secondReceipt.items : [];
  if (!firstItems.length || firstItems.length !== secondItems.length) return false;
  return firstItems.every((item, index) => {
    const other = secondItems[index];
    return normalizedNameForComparison(item?.name) === normalizedNameForComparison(other?.name)
      && Math.round(Number(item?.price) * 100) === Math.round(Number(other?.price) * 100);
  });
}

function hasRequiredHebrewVerification(receipt) {
  const language = String(receipt?.ocr?.documentLanguage || receipt?.documentLanguage || inferDocumentLanguage(receipt)).toLowerCase();
  if (language !== 'hebrew' && language !== 'mixed') return true;
  const source = String(receipt?.ocr?.source || '');
  const status = String(receipt?.ocr?.nameVerificationStatus || '');
  if (source === 'gemini-vision') return status === 'exact-cross-model-agreement';
  if (source === 'client-tesseract') return status === 'dual-hebrew-pass-agreement';
  return false;
}

module.exports = {
  assessOcrReadability,
  evaluateReceiptAccuracy,
  HEBREW_OCR_ACCEPTANCE_TARGET,
  haveSamePurchasedRows,
  hasRequiredHebrewVerification,
  inferDocumentLanguage,
  normalizeOcrName,
  sanitizeReceiptNames,
  textSimilarity,
};
