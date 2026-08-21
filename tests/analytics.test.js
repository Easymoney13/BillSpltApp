const test = require('node:test');
const assert = require('node:assert/strict');
const { createBoundedDeliveryQueue, createEvent, hashIdentifier, sanitizeMetadata } = require('../lib/analytics');

test('analytics identifiers are pseudonymized deterministically', () => {
  assert.equal(hashIdentifier('user-123'), hashIdentifier('user-123'));
  assert.notEqual(hashIdentifier('user-123'), 'user-123');
  assert.equal(hashIdentifier(''), null);
});

test('analytics metadata drops personal and unknown fields', () => {
  const metadata = sanitizeMetadata({
    amount: 120.5,
    memberCount: 4,
    restaurantName: 'Private restaurant',
    email: 'person@example.com',
    route: '<script>/api</script>',
  });
  assert.deepEqual(metadata, { amount: 120.5, memberCount: 4, route: 'script/api/script' });
});

test('analytics events contain no raw user or session identifiers', () => {
  const event = createEvent('session_created', {
    userId: 'firebase-user',
    sessionId: 'sess-secret',
    metadata: { itemCount: 5 },
  });
  assert.equal(event.userHash.includes('firebase-user'), false);
  assert.equal(event.sessionHash.includes('sess-secret'), false);
  assert.equal(event.metadata.itemCount, 5);
});

test('unsupported analytics events are rejected', () => {
  assert.throws(() => createEvent('raw_personal_data', {}), /Unsupported analytics event/);
});

test('analytics delivery drops overflow instead of building an unbounded queue', async () => {
  const releases = [];
  const queue = createBoundedDeliveryQueue({
    maxPending: 3,
    maxConcurrent: 1,
    deliver: (value) => new Promise((resolve) => releases.push(() => resolve(value))),
  });
  const first = queue.enqueue('first');
  const second = queue.enqueue('second');
  const third = queue.enqueue('third');
  const overflow = queue.enqueue('overflow');

  assert.deepEqual(queue.state(), { active: 1, queued: 2, capacity: 3 });
  assert.equal(await overflow, false);
  releases.shift()();
  assert.equal(await first, 'first');
  await new Promise((resolve) => setImmediate(resolve));
  releases.shift()();
  assert.equal(await second, 'second');
  await new Promise((resolve) => setImmediate(resolve));
  releases.shift()();
  assert.equal(await third, 'third');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(queue.state(), { active: 0, queued: 0, capacity: 3 });
});
