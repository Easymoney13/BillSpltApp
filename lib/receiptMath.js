function normalizeAmount(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round((parsed + Number.EPSILON) * 100) / 100;
}

function reconcileReceipt(receipt) {
  const itemTotal = Math.round(
    (Array.isArray(receipt?.items) ? receipt.items : [])
      .reduce((sum, item) => sum + (normalizeAmount(item?.price) || 0), 0) * 100
  ) / 100;
  const receiptTotal = normalizeAmount(receipt?.receiptTotal ?? receipt?.total);
  const subtotal = normalizeAmount(receipt?.subtotal);
  const tax = normalizeAmount(receipt?.tax) || 0;
  const service = normalizeAmount(receipt?.service) || 0;
  const discount = normalizeAmount(receipt?.discount) || 0;
  // VAT is included in displayed menu prices in many countries (including
  // Israel), while other receipts add tax after the subtotal. Service and
  // discount lines can likewise be informational or additional. Choose the
  // arithmetically valid interpretation that best matches the printed total
  // instead of always adding VAT a second time.
  const candidateTotals = [
    { mode: 'items', value: itemTotal },
    { mode: 'items_plus_service', value: itemTotal + service },
    { mode: 'items_plus_tax', value: itemTotal + tax },
    { mode: 'items_plus_tax_service', value: itemTotal + tax + service },
    { mode: 'items_minus_discount', value: itemTotal - discount },
    { mode: 'items_plus_service_minus_discount', value: itemTotal + service - discount },
    { mode: 'items_plus_tax_minus_discount', value: itemTotal + tax - discount },
    { mode: 'items_plus_tax_service_minus_discount', value: itemTotal + tax + service - discount },
  ].map((candidate) => ({
    ...candidate,
    value: Math.round(candidate.value * 100) / 100,
  }));
  const selectedCandidate = receiptTotal === null
    ? candidateTotals[candidateTotals.length - 1]
    : candidateTotals.reduce((best, candidate) => (
      Math.abs(candidate.value - receiptTotal) < Math.abs(best.value - receiptTotal) ? candidate : best
    ));
  const calculatedTotal = selectedCandidate.value;
  const totalDifference = receiptTotal === null
    ? null
    : Math.round(Math.abs(calculatedTotal - receiptTotal) * 100) / 100;
  const subtotalDifference = subtotal === null
    ? null
    : Math.round(Math.abs(itemTotal - subtotal) * 100) / 100;
  const totalTolerance = receiptTotal === null ? 0 : Math.max(0.5, receiptTotal * 0.01);
  const subtotalTolerance = subtotal === null ? 0 : Math.max(0.5, subtotal * 0.01);
  const totalMatches = totalDifference === null || totalDifference <= totalTolerance;
  const subtotalMatches = subtotalDifference === null || subtotalDifference <= subtotalTolerance;

  return {
    status: receiptTotal === null ? 'missing_total' : (totalMatches && subtotalMatches ? 'matched' : 'mismatch'),
    itemTotal,
    calculatedTotal,
    receiptTotal,
    subtotal,
    tax,
    service,
    discount,
    calculationMode: selectedCandidate.mode,
    difference: totalDifference,
    subtotalDifference,
    needsReview: receiptTotal === null || !totalMatches || !subtotalMatches,
  };
}

function isTotalOrTaxLine(name) {
  if (typeof name !== 'string') return false;
  const raw = name.toLowerCase().trim();
  const clean = raw.replace(/[\s'"“״”`׳.\-–—:;=_\/\\]+/g, '');

  const totalKeywords = [
    'total', 'subtotal', 'sub-total', 'grandtotal', 'balance', 'balancedue',
    'amountdue', 'totaldue', 'finaltotal', 'billtotal', 'checktotal', 'nettotal',
    'tax', 'vat', 'salestax', 'servicecharge', 'gratuity',
    'discount', 'coupon', 'credit',
    'cash', 'visa', 'mastercard', 'amex', 'creditcard', 'debitcard',
    'changedue', 'amountpaid', 'tendered',
    'לתשלום', 'סהכ', 'סחכ', 'סךהכל', 'סכהכל', 'סחיכ', 'סהיק', 'סהכחשבון', 'סכהכחשבון', 'סךהכלחשבון',
    'סכוםכולל', 'סךהכול', 'סךהכוללתשלום', 'סכוםלתשלום', 'סךלתשלום', 'חשבוןלתשלום', 'חשבוןסופי',
    'סהכבשח', 'סהכמחיר', 'סהכסופי', 'סהכלתשלום',
    'מעמ', 'דמישירות',
    'הנחה', 'זיכוי', 'שובר', 'קופון',
    'מזומן', 'כרטיסאשראי', 'אשראי', 'עודף', 'סכוםששולם',
    'חשבוןמס', 'חשבוניתמס', 'חשבון', 'חשבונית', 'חשבונ', 'תשלום', 'סכום'
  ];

  if (totalKeywords.some(keyword => clean.includes(keyword))) {
    return true;
  }

  const totalRegexes = [
    /\b(total|sub-?total|grand\s*total|amount\s*due|balance\s*due|final\s*total)\b/i,
    /\b(tax|vat|service\s*charge|gratuity)\b/i,
    /\b(cash\s*paid|change\s*due|visa|mastercard|amex|credit\s*card)\b/i,
    /(סה["״׳'`]?כ|סך\s*ה?כ[וֹ]?ל|ס[הח]כ)\s*(חשבון|לתשלום|סופי|כולל|בש["״]?ח)?/i,
    /(לתשלום|סכום\s*לתשלום|סך\s*לתשלום|חשבון\s*לתשלום)/i,
    /(מע["״׳'`]?מ|דמי\s*שירות|הנחה|זיכוי)/i,
  ];

  return totalRegexes.some(regex => regex.test(raw));
}

module.exports = { normalizeAmount, reconcileReceipt, isTotalOrTaxLine };

