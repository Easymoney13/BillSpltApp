const crypto = require('crypto');

function normalizeScanId(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  return /^[a-z0-9_-]{12,100}$/i.test(clean) ? clean : '';
}

function normalizeRecoveryToken(value) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  return /^[a-z0-9_-]{32,200}$/i.test(clean) ? clean : '';
}

function createStableScanEntityId(prefix, ownerKey, scanId) {
  const cleanScanId = normalizeScanId(scanId);
  if (!cleanScanId) return '';
  const safePrefix = String(prefix || 'scan').replace(/[^a-z0-9_]/gi, '').toLowerCase();
  const digest = crypto
    .createHash('sha256')
    .update(`${ownerKey || 'guest'}:${cleanScanId}`)
    .digest('hex')
    .slice(0, 24);
  return `${safePrefix}_${digest}`;
}

function createAsyncGate({ maxConcurrent = 4, maxQueue = 20, waitTimeoutMs = 2_500 } = {}) {
  let active = 0;
  const queue = [];

  function releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      active = Math.max(0, active - 1);
      drain();
    };
  }

  function drain() {
    while (active < maxConcurrent && queue.length > 0) {
      const queued = queue.shift();
      if (!queued || queued.expired) continue;
      clearTimeout(queued.timeout);
      active += 1;
      queued.resolve(releaseOnce());
    }
  }

  async function acquire() {
    if (active < maxConcurrent) {
      active += 1;
      return releaseOnce();
    }
    const liveQueued = queue.filter((entry) => !entry.expired).length;
    if (liveQueued >= maxQueue) {
      const error = new Error('Receipt scanning is busy. Please try again shortly.');
      error.statusCode = 503;
      throw error;
    }
    return new Promise((resolve, reject) => {
      const queued = { resolve, reject, expired: false, timeout: null };
      queued.timeout = setTimeout(() => {
        queued.expired = true;
        const queueIndex = queue.indexOf(queued);
        if (queueIndex >= 0) queue.splice(queueIndex, 1);
        const error = new Error('Receipt scanning is busy. Please try again shortly.');
        error.statusCode = 503;
        reject(error);
      }, waitTimeoutMs);
      queue.push(queued);
    });
  }

  return {
    acquire,
    state: () => ({ active, queued: queue.filter((entry) => !entry.expired).length }),
  };
}

function createExpiringPromiseCache({ ttlMs = 5 * 60_000, maxEntries = 200 } = {}) {
  const entries = new Map();

  function prune(now = Date.now()) {
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key);
    }
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  }

  async function run(key, operation) {
    if (!key) return operation();
    const now = Date.now();
    prune(now);
    const existing = entries.get(key);
    if (existing && existing.expiresAt > now) return existing.promise;
    const promise = Promise.resolve().then(operation);
    entries.set(key, { promise, expiresAt: now + ttlMs });
    try {
      return await promise;
    } catch (error) {
      entries.delete(key);
      throw error;
    }
  }

  return { run, size: () => entries.size, prune };
}

module.exports = {
  normalizeScanId,
  normalizeRecoveryToken,
  createStableScanEntityId,
  createAsyncGate,
  createExpiringPromiseCache,
};
