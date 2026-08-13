const { createEntityId } = require('./ids');
const { validateSessionAction } = require('./validation');

const HOST_ACTIONS = new Set(['SPLIT_EVERYONE', 'ADD_ITEM', 'EDIT_ITEM', 'DELETE_ITEM', 'SET_TIP', 'SETTLE_ALL']);

function resolveActor(session, actor = {}) {
  const members = Array.isArray(session?.members) ? session.members : [];
  const byUid = actor.uid ? members.find((member) => member.id === actor.uid) : null;
  const byMemberId = actor.memberId ? members.find((member) => member.id === actor.memberId) : null;
  return byUid || byMemberId || null;
}

function canPerformSessionAction(session, action, actor = {}, payload = {}) {
  const member = resolveActor(session, actor);
  if (!member) return { allowed: false, reason: 'You are not a member of this session' };
  if (session.status === 'settled') return { allowed: false, reason: 'This session is already closed' };
  if (HOST_ACTIONS.has(action) && !member.isHost) return { allowed: false, reason: 'Only the host can perform this action' };
  if (action === 'TOGGLE_CLAIM' && payload.memberId !== member.id) {
    return { allowed: false, reason: 'You can only claim items for yourself' };
  }
  if (action === 'TOGGLE_SETTLED' && payload.memberId !== member.id && !member.isHost) {
    return { allowed: false, reason: 'You can only update your own payment status' };
  }
  return { allowed: true, member };
}

function processSessionAction(session, action, rawPayload, actor, now = Date.now) {
  if (!session || typeof session !== 'object') throw new Error('Session is required');
  const payload = validateSessionAction(action, rawPayload);
  const authorization = canPerformSessionAction(session, action, actor, payload);
  if (!authorization.allowed) {
    const error = new Error(authorization.reason);
    error.statusCode = authorization.reason.includes('closed') ? 409 : 403;
    throw error;
  }

  const updated = structuredClone(session);
  const items = Array.isArray(updated.items) ? updated.items : [];
  const members = Array.isArray(updated.members) ? updated.members : [];

  switch (action) {
    case 'TOGGLE_CLAIM': {
      const item = items.find((candidate) => candidate.id === payload.itemId);
      if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
      const claimants = Array.isArray(item.claimedBy) ? item.claimedBy : [];
      item.claimedBy = claimants.includes(payload.memberId)
        ? claimants.filter((id) => id !== payload.memberId)
        : [...claimants, payload.memberId];
      break;
    }
    case 'SPLIT_EVERYONE': {
      const ids = members.map((member) => member.id);
      items.forEach((item) => { item.claimedBy = [...ids]; });
      break;
    }
    case 'ADD_ITEM':
      items.push({
        id: createEntityId('item'),
        name: payload.name,
        price: payload.price,
        category: payload.category,
        claimedBy: [],
      });
      break;
    case 'EDIT_ITEM': {
      const item = items.find((candidate) => candidate.id === payload.itemId);
      if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
      item.name = payload.name;
      item.price = payload.price;
      item.category = payload.category;
      break;
    }
    case 'DELETE_ITEM': {
      const before = items.length;
      updated.items = items.filter((item) => item.id !== payload.itemId);
      if (updated.items.length === before) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
      break;
    }
    case 'TOGGLE_SETTLED': {
      const member = members.find((candidate) => candidate.id === payload.memberId);
      if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 });
      member.settled = payload.settled !== undefined ? payload.settled : !member.settled;
      break;
    }
    case 'SET_TIP':
      updated.tipPercentage = payload.tipPercentage;
      break;
    case 'SETTLE_ALL':
      updated.status = 'settled';
      updated.settledAt = now();
      break;
    default:
      throw new Error('Unsupported action');
  }

  updated.updatedAt = now();
  return updated;
}

module.exports = {
  HOST_ACTIONS,
  resolveActor,
  canPerformSessionAction,
  processSessionAction,
};
