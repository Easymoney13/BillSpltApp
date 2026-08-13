const test = require('node:test');
const assert = require('node:assert/strict');
const { createEvent, hashIdentifier, sanitizeMetadata } = require('../lib/analytics');

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
