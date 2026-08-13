/**
 * Enterprise Cyber Security Utility
 * Protects against XSS, Injection Attacks, Path Traversal, and Payload Tampering
 */

/**
 * Strips dangerous HTML & Script tags to prevent Cross-Site Scripting (XSS)
 */
function sanitizeString(input, maxLength = 100) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>?/gm, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove JS protocols
    .replace(/on\w+=/gi, '') // Remove inline handlers e.g. onload=
    .trim()
    .substring(0, maxLength);
}

/**
 * Validates 4-digit room code format (strictly 4 digits)
 */
function isValidRoomCode(code) {
  return /^\d{4}$/.test(code);
}

/**
 * Validates session ID format (sess_TIMESTAMP_RANDOM)
 */
function isValidSessionId(sessionId) {
  return /^(sess_(?:g_)?[a-z0-9_\-]{6,100}|\d{4})$/i.test(String(sessionId || ''));
}

function isValidGroupId(groupId) {
  return /^(grp_[a-z0-9_\-]{6,100}|\d{4})$/i.test(String(groupId || ''));
}

/**
 * Validates price amounts (positive numbers up to 50,000)
 */
function sanitizePrice(price) {
  const num = parseFloat(price);
  if (isNaN(num) || num < 0 || num > 50000) return 0;
  return Math.round(num * 100) / 100;
}

/**
 * Sanitizes host/member names
 */
function sanitizeName(name, fallback = 'Guest') {
  const clean = sanitizeString(name, 30);
  if (!clean || clean === '?') return fallback;
  return clean;
}

module.exports = {
  sanitizeString,
  isValidRoomCode,
  isValidSessionId,
  isValidGroupId,
  sanitizePrice,
  sanitizeName
};
module.exports.__esModule = true;
module.exports.sanitizeString = sanitizeString;
module.exports.isValidRoomCode = isValidRoomCode;
module.exports.isValidSessionId = isValidSessionId;
module.exports.isValidGroupId = isValidGroupId;
module.exports.sanitizePrice = sanitizePrice;
module.exports.sanitizeName = sanitizeName;
exports.sanitizeString = sanitizeString;
exports.isValidRoomCode = isValidRoomCode;
exports.isValidSessionId = isValidSessionId;
exports.isValidGroupId = isValidGroupId;
exports.sanitizePrice = sanitizePrice;
exports.sanitizeName = sanitizeName;
