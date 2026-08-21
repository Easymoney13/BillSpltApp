const crypto = require('crypto');

const DEFAULT_ENDPOINT = 'https://easysplit-founders-dashboard.yoavjacoel.chatgpt.site/api/analytics/ingest';
const ALLOWED_EVENT_TYPES = new Set([
  'ocr_scan_started',
  'ocr_scan_succeeded',
  'ocr_scan_failed',
  'session_created',
  'participant_joined',
  'item_claim_toggled',
  'items_split_everyone',
  'receipt_corrected',
  'tip_selected',
  'member_settled_toggled',
  'session_completed',
  'user_synced',
  'product_error',
]);
const ALLOWED_METADATA_KEYS = new Set([
  'action', 'amount', 'category', 'correctionKind', 'currency', 'durationMs',
  'errorCode', 'httpStatus', 'itemCount', 'memberCount', 'ocrSource', 'outcome',
  'reconciliationStatus', 'route', 'tipPercentage',
]);
let warnedMissingConfig = false;

function createBoundedDeliveryQueue({ deliver, maxPending = 200, maxConcurrent = 2 }) {
  const queue = [];
  let active = 0;

  function drain() {
    while (active < maxConcurrent && queue.length > 0) {
      const entry = queue.shift();
      active += 1;
      Promise.resolve()
        .then(() => deliver(entry.value))
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active = Math.max(0, active - 1);
          drain();
        });
    }
  }

  function enqueue(value) {
    if (active + queue.length >= maxPending) return Promise.resolve(false);
    return new Promise((resolve, reject) => {
      queue.push({ value, resolve, reject });
      drain();
    });
  }

  return {
    enqueue,
    state: () => ({ active, queued: queue.length, capacity: maxPending }),
  };
}

function finiteNumber(value, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return undefined;
  return Math.min(max, Math.max(min, number));
}

function sanitizeMetadata(metadata = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(metadata || {})) {
    if (!ALLOWED_METADATA_KEYS.has(key) || value === undefined || value === null) continue;
    if (typeof value === 'number') {
      const clean = finiteNumber(value);
      if (clean !== undefined) safe[key] = clean;
    } else if (typeof value === 'boolean') {
      safe[key] = value;
    } else {
      safe[key] = String(value).replace(/[<>]/g, '').slice(0, 80);
    }
  }
  return safe;
}

function hashIdentifier(value) {
  if (!value) return null;
  const salt = process.env.EASYSPLIT_ANALYTICS_HASH_SALT
    || process.env.EASYSPLIT_ANALYTICS_SECRET
    || 'easysplit-local-analytics';
  return crypto.createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 32);
}

function createEvent(eventType, context = {}) {
  if (!ALLOWED_EVENT_TYPES.has(eventType)) throw new Error(`Unsupported analytics event: ${eventType}`);
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    eventType,
    occurredAt: Date.now(),
    source: 'easysplit-server',
    sessionHash: hashIdentifier(context.sessionId),
    userHash: hashIdentifier(context.userId),
    metadata: sanitizeMetadata(context.metadata),
  };
}

async function deliverEvent(event, fetchImpl = global.fetch) {
  const secret = process.env.EASYSPLIT_ANALYTICS_SECRET;
  const endpoint = process.env.EASYSPLIT_ANALYTICS_URL || DEFAULT_ENDPOINT;
  if (!secret || typeof fetchImpl !== 'function') {
    if (!warnedMissingConfig && process.env.NODE_ENV !== 'test') {
      warnedMissingConfig = true;
      console.warn('Analytics delivery is disabled until EASYSPLIT_ANALYTICS_SECRET is configured.');
    }
    return false;
  }
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Analytics ingestion returned ${response.status}`);
  return true;
}

const deliveryQueue = createBoundedDeliveryQueue({ deliver: deliverEvent });

function trackAnalyticsEvent(eventType, context = {}) {
  let event;
  try {
    event = createEvent(eventType, context);
  } catch (error) {
    console.warn('Analytics event was rejected:', error.message);
    return Promise.resolve(false);
  }
  return deliveryQueue.enqueue(event)
    .catch((error) => {
      console.warn('Analytics event delivery failed:', error.message);
      return false;
    });
}

module.exports = {
  ALLOWED_EVENT_TYPES,
  createBoundedDeliveryQueue,
  createEvent,
  hashIdentifier,
  sanitizeMetadata,
  trackAnalyticsEvent,
};
