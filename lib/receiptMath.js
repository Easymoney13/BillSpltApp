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
  const clean = name.toLowerCase().replace(/[\s'"“״”`׳:-]+/g, ''); // strip spaces, quotes, colons, hyphens
  const totalKeywords = [
    'total', 'subtotal', 'grandtotal', 'tax', 'vat', 'discount', 
    'לתשלום', 'סהכ', 'סחכ', 'סךהכל', 'סכהכל', 'סחיכ', 'סהיק',
    'מעמ', 'מזומן', 'אשראי', 'עודף'
  ];
  return totalKeywords.some(keyword => clean.includes(keyword));
}

module.exports = { normalizeAmount, reconcileReceipt, isTotalOrTaxLine };
