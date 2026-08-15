const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUniqueRoomCode, hashAccessToken, tokenMatches } = require('../lib/ids');
const { ValidationError, validateItems, validateSessionAction } = require('../lib/validation');
const { processSessionAction } = require('../lib/sessionActions');
const { createRoomMember, findRoomMember, joinRoom, publicRoom } = require('../lib/roomAuth');
const { broadcastToRoom, subscribeClient } = require('../lib/realtimeRooms');
const { calculateDebtMinimization, splitCents } = require('../lib/debtMinimizer');
const { normalizeReceipt, selectBetterReceipt } = require('../lib/gemini');
const { reconcileReceipt } = require('../lib/receiptMath');
const { processGroupBillAction } = require('../lib/groupActions');
const security = require('../lib/security');

function sampleSession() {
  return {
    id: 'sess_123456_abcdef',
    status: 'active',
    members: [
      { id: 'host-1', name: 'Alex', isHost: true },
      { id: 'member-1', name: 'Alex', isHost: false },
    ],
    items: [{ id: 'item-1', name: 'Pizza', price: 80, category: 'Food', claimedBy: [] }],
  };
}

test('room codes never reuse an occupied session or group code', () => {
  const data = { sessions: { a: { code: '1234' } }, groups: { b: { code: '5678' } } };
  const values = [1234, 5678, 9012];
  const result = createUniqueRoomCode(data, () => values.shift());
  assert.equal(result, '9012');
});

test('access token hashes compare without exposing the token', () => {
  const hash = hashAccessToken('secret-token');
  assert.equal(tokenMatches('secret-token', hash), true);
  assert.equal(tokenMatches('wrong-token', hash), false);
});

test('group live session ids pass validation', () => {
  assert.equal(security.isValidSessionId('sess_g_bill_123_abc'), true);
});

test('invalid prices are rejected rather than invented', () => {
  assert.throws(() => validateItems([{ name: 'Unreadable', price: 'not-a-price' }]), ValidationError);
});

test('unknown session actions are rejected', () => {
  assert.throws(() => validateSessionAction('BECOME_HOST', {}), ValidationError);
});

test('members with the same display name remain distinct', () => {
  const updated = processSessionAction(
    sampleSession(),
    'TOGGLE_CLAIM',
    { itemId: 'item-1', memberId: 'member-1' },
    { memberId: 'member-1' },
    () => 1000,
  );
  assert.deepEqual(updated.items[0].claimedBy, ['member-1']);
});

test('a guest cannot perform a host action', () => {
  assert.throws(
    () => processSessionAction(sampleSession(), 'DELETE_ITEM', { itemId: 'item-1' }, { memberId: 'member-1' }),
    /Only the host/,
  );
});

test('a guest cannot claim an item for somebody else', () => {
  assert.throws(
    () => processSessionAction(sampleSession(), 'TOGGLE_CLAIM', { itemId: 'item-1', memberId: 'host-1' }, { memberId: 'member-1' }),
    /only claim items for yourself/,
  );
});

test('closed sessions are immutable', () => {
  const session = sampleSession();
  session.status = 'settled';
  assert.throws(
    () => processSessionAction(session, 'SET_TIP', { tipPercentage: 10 }, { memberId: 'host-1' }),
    /already closed/,
  );
});

test('room tokens authenticate exactly one member and are never exposed publicly', () => {
  const first = createRoomMember({ name: 'Noa', isHost: true });
  const second = createRoomMember({ name: 'Noa' });
  const room = { members: [first.member, second.member] };

  assert.equal(findRoomMember(room, { accessToken: first.accessToken }).id, first.member.id);
  assert.equal(findRoomMember(room, { accessToken: second.accessToken }).id, second.member.id);
  assert.equal(JSON.stringify(publicRoom(room)).includes('accessTokenHash'), false);
});

test('joining with the same name creates a distinct member without a valid token', () => {
  const host = createRoomMember({ name: 'Dana', isHost: true });
  const room = { members: [host.member] };
  const joined = joinRoom(room, { name: 'Dana', avatarColor: '#38BDF8' });

  assert.notEqual(joined.member.id, host.member.id);
  assert.equal(room.members.length, 2);
  assert.equal(joined.member.isHost, false);
});

test('real-time broadcasts reach only subscribers of the matching room', () => {
  const sessionClient = { readyState: 1, sent: [], send(value) { this.sent.push(value); } };
  const otherSessionClient = { readyState: 1, sent: [], send(value) { this.sent.push(value); } };
  const groupClient = { readyState: 1, sent: [], send(value) { this.sent.push(value); } };
  subscribeClient(sessionClient, 'session', 'sess_one');
  subscribeClient(otherSessionClient, 'session', 'sess_two');
  subscribeClient(groupClient, 'group', 'grp_one');

  const recipients = broadcastToRoom(
    [sessionClient, otherSessionClient, groupClient],
    'session',
    'sess_one',
    { type: 'SESSION_UPDATE' }
  );

  assert.equal(recipients, 1);
  assert.equal(sessionClient.sent.length, 1);
  assert.equal(otherSessionClient.sent.length, 0);
  assert.equal(groupClient.sent.length, 0);
});

test('cent splitting preserves every cent deterministically', () => {
  const shares = splitCents(1001, ['a', 'b', 'c']);
  assert.deepEqual(shares.map((share) => share.cents), [334, 334, 333]);
  assert.equal(shares.reduce((sum, share) => sum + share.cents, 0), 1001);
});

test('group balances always sum to zero despite decimal rounding', () => {
  const result = calculateDebtMinimization({
    members: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ],
    bills: [{
      payerId: 'a',
      amount: 10.01,
      items: [{ price: 10.01, claimedBy: ['a', 'b', 'c'] }],
    }],
  });
  assert.equal(result.isBalanced, true);
  assert.equal(result.balances.reduce((sum, balance) => sum + Math.round(balance.netBalance * 100), 0), 0);
  assert.equal(result.transactions.reduce((sum, transaction) => sum + Math.round(transaction.amount * 100), 0), 667);
});

test('unassigned items are visible and never create phantom debt', () => {
  const result = calculateDebtMinimization({
    members: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    bills: [{ payerId: 'a', amount: 12, items: [
      { price: 7, claimedBy: ['a', 'b'] },
      { price: 5, claimedBy: [] },
    ] }],
  });
  assert.equal(result.unassignedAmount, 5);
  assert.equal(result.isBalanced, true);
  assert.equal(result.balances.reduce((sum, balance) => sum + Math.round(balance.netBalance * 100), 0), 0);
});

test('OCR drops unreadable prices instead of inventing a fallback amount', () => {
  const receipt = normalizeReceipt({
    storeName: 'Cafe',
    items: [
      { name: 'Coffee', price: 'unreadable' },
      { name: 'Cake', price: '18.50' },
    ],
  }, 'Cafe');
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].name, 'Cake');
  assert.equal(receipt.items[0].price, 18.5);
});

test('OCR uses the full line total when a receipt row contains multiple units', () => {
  const receipt = normalizeReceipt({
    storeName: 'Cafe',
    receiptTotal: 36,
    items: [{ name: 'Coffee', quantity: 3, unitPrice: 12, lineTotal: 36 }],
  }, 'Cafe');
  assert.equal(receipt.items[0].name, 'Coffee (3x)');
  assert.equal(receipt.items[0].price, 36);
});

test('OCR verification prefers an arithmetically reconciled second read', () => {
  const first = { receiptTotal: 100, items: [{ name: 'Meal', price: 60 }] };
  const second = { receiptTotal: 100, items: [{ name: 'Meal', price: 60 }, { name: 'Drink', price: 40 }] };
  assert.equal(selectBetterReceipt(first, second), second);
});

test('receipt reconciliation flags a meaningful mismatch for review', () => {
  const result = reconcileReceipt({
    receiptTotal: 100,
    subtotal: 90,
    tax: 5,
    service: 5,
    items: [{ price: 40 }, { price: 30 }],
  });
  assert.equal(result.status, 'mismatch');
  assert.equal(result.needsReview, true);
  assert.equal(result.difference, 20);
});

test('receipt reconciliation accepts matching totals with adjustments', () => {
  const result = reconcileReceipt({
    receiptTotal: 100,
    subtotal: 90,
    tax: 5,
    service: 5,
    items: [{ price: 45 }, { price: 45 }],
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.needsReview, false);
});

test('receipt reconciliation does not add VAT twice when it is already included', () => {
  const result = reconcileReceipt({
    receiptTotal: 100,
    tax: 15.25,
    items: [{ price: 60 }, { price: 40 }],
  });
  assert.equal(result.status, 'matched');
  assert.equal(result.calculatedTotal, 100);
  assert.equal(result.calculationMode, 'items');
});

test('group members can claim only for themselves without rewriting a bill', () => {
  const group = {
    members: [{ id: 'host', isHost: true }, { id: 'guest', isHost: false }],
    bills: [{ id: 'bill', createdByMemberId: 'host', items: [{ id: 'item', claimedBy: [] }] }],
  };
  const updated = processGroupBillAction(group, 'TOGGLE_CLAIM', { billId: 'bill', itemId: 'item' }, group.members[1]);
  assert.deepEqual(updated.bills[0].items[0].claimedBy, ['guest']);
  assert.deepEqual(group.bills[0].items[0].claimedBy, []);
});

test('group members cannot change somebody else’s bill payer', () => {
  const group = {
    members: [{ id: 'host', isHost: true }, { id: 'guest', isHost: false }],
    bills: [{ id: 'bill', createdByMemberId: 'host', payerId: 'host', items: [] }],
  };
  assert.throws(
    () => processGroupBillAction(group, 'SET_PAYER', { billId: 'bill', payerId: 'guest' }, group.members[1]),
    /Only the bill creator/
  );
});

test('settled group bills are immutable', () => {
  const group = {
    members: [{ id: 'host', isHost: true }],
    bills: [{ id: 'bill', status: 'settled', createdByMemberId: 'host', items: [{ id: 'item', claimedBy: [] }] }],
  };
  assert.throws(
    () => processGroupBillAction(group, 'TOGGLE_CLAIM', { billId: 'bill', itemId: 'item' }, group.members[0]),
    /already settled/
  );
});

test('inactive members cannot authenticate with their former room token', () => {
  const created = createRoomMember({ name: 'Former member' });
  created.member.active = false;
  assert.equal(findRoomMember({ members: [created.member] }, { accessToken: created.accessToken }), null);
});

test('session settlement persists the closed session and history in one database write', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'billsplit-db-test-'));
  const temporaryDbPath = path.join(temporaryDirectory, 'db.json');
  fs.writeFileSync(temporaryDbPath, JSON.stringify({
    users: {
      host: { id: 'host', username: 'Same Name', bills: [] },
      legacy: { id: 'legacy', username: 'Same Name', phone: '', bills: ['legacy-bill'] },
      inactive: { id: 'inactive', groups: [] },
    },
    sessions: {},
    history: [],
    groups: {},
  }));
  const previousPath = process.env.BILLSPLIT_DB_PATH;
  process.env.BILLSPLIT_DB_PATH = temporaryDbPath;
  delete require.cache[require.resolve('../lib/db')];
  const temporaryDb = require('../lib/db');

  const session = { id: 'sess_test_atomic', status: 'settled', members: [{ id: 'host' }] };
  const history = { id: session.id, members: session.members, totalAmount: 12.5 };
  temporaryDb.saveSessionAndHistory(session, history);
  const persisted = JSON.parse(fs.readFileSync(temporaryDbPath, 'utf8'));

  assert.equal(persisted.sessions[session.id].status, 'settled');
  assert.equal(persisted.history[0].id, session.id);
  assert.equal(persisted.users.host.bills[0].id, session.id);

  temporaryDb.hideHistoryForUser('host', session.id);
  const afterHide = JSON.parse(fs.readFileSync(temporaryDbPath, 'utf8'));
  assert.equal(afterHide.history[0].id, session.id);
  assert.deepEqual(afterHide.users.host.hiddenHistoryIds, [session.id]);

  temporaryDb.findOrCreateUser('new-firebase-uid', 'Same Name', '');
  const afterIdentitySync = JSON.parse(fs.readFileSync(temporaryDbPath, 'utf8'));
  assert.deepEqual(afterIdentitySync.users.legacy.bills, ['legacy-bill']);
  assert.equal(afterIdentitySync.users['new-firebase-uid'].id, 'new-firebase-uid');

  temporaryDb.saveGroup({
    id: 'grp-test',
    members: [{ id: 'inactive', active: false }],
    bills: [{ id: 'bill-test', sessionId: 'sess-bill-test' }],
  });
  temporaryDb.saveSession({ id: 'sess-bill-test' });
  temporaryDb.deleteGroupBill('grp-test', 'bill-test');
  const afterBillDelete = JSON.parse(fs.readFileSync(temporaryDbPath, 'utf8'));
  assert.deepEqual(afterBillDelete.users.inactive.groups, []);
  assert.equal(afterBillDelete.groups['grp-test'].bills.length, 0);
  assert.equal(afterBillDelete.sessions['sess-bill-test'], undefined);

  if (previousPath === undefined) delete process.env.BILLSPLIT_DB_PATH;
  else process.env.BILLSPLIT_DB_PATH = previousPath;
  delete require.cache[require.resolve('../lib/db')];
  fs.rmSync(temporaryDirectory, { recursive: true });
});

test('session SET_PAYER allows any member or each paid share', () => {
  const session = sampleSession();
  const updatedHost = processSessionAction(session, 'SET_PAYER', { payerId: 'member-1' }, { memberId: 'host-1' });
  assert.equal(updatedHost.payerId, 'member-1');

  const updatedEach = processSessionAction(session, 'SET_PAYER', { payerId: 'each' }, { memberId: 'member-1' });
  assert.equal(updatedEach.payerId, 'each');
});

