const { reconcileReceipt } = require('./receiptMath');

function assessReceipt(receipt, { source = 'unknown', imageQuality = null, confirmedByUser = false } = {}) {
  const reconciliation = receipt?.reconciliation || reconcileReceipt(receipt);
  const reasons = [];
  if (!receipt?.items?.length) reasons.push('no-items');
  if (reconciliation.receiptTotal === null) reasons.push('missing-total');
  if (reconciliation.status === 'mismatch') reasons.push('total-mismatch');
  if (reconciliation.status === 'ambiguous_adjustments') reasons.push('unanchored-adjustments');
  if (reconciliation.status === 'matched_adjusted') reasons.push('proportional-adjustment-allocation');
  if (receipt?.ocr?.verificationStatus === 'row_disagreement') reasons.push('verification-row-disagreement');
  if (receipt?.ocr?.verificationStatus === 'value_disagreement') reasons.push('verification-value-disagreement');
  if (receipt?.ocr?.verificationStatus === 'verification_failed') reasons.push('verification-failed');
  if (receipt?.ocr?.verificationStatus === 'verification_unavailable') reasons.push('verification-unavailable');
  if (receipt?.ocr?.verificationStatus === 'deadline_reached') reasons.push('verification-deadline');
  if (receipt?.ocr?.verificationStatus === 'script_mismatch') reasons.push('ocr-script-mismatch');
  if (Number(receipt?.ocr?.readabilityScore) > 0 && Number(receipt.ocr.readabilityScore) < 0.8) reasons.push('low-text-readability');
  if (source === 'client-parsed' || source === 'client-tesseract') reasons.push('local-ocr-fallback');
  if (Array.isArray(imageQuality?.warnings)) reasons.push(...imageQuality.warnings);

  let level = 'low';
  if (reasons.some((reason) => [
    'no-items', 'missing-total', 'total-mismatch', 'unanchored-adjustments',
    'verification-row-disagreement', 'verification-value-disagreement',
    'verification-failed', 'verification-unavailable', 'verification-deadline', 'local-ocr-fallback',
    'ocr-script-mismatch', 'low-text-readability',
  ].includes(reason))) {
    level = 'high';
  } else if (reasons.length > 0 || reconciliation.status === 'matched_adjusted') {
    level = 'medium';
  }

  return {
    level,
    reasons: [...new Set(reasons)],
    requiresUserConfirmation: !confirmedByUser,
    confirmedByUser: Boolean(confirmedByUser),
  };
}

module.exports = { assessReceipt };
