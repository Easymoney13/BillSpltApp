const { requireString } = require('./validation');

function processGroupBillAction(group, rawAction, rawPayload, actor) {
  if (!group || !actor) throw Object.assign(new Error('A valid group membership is required'), { statusCode: 401 });
  const action = requireString(rawAction, 'action', 40);
  const payload = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const billId = requireString(payload.billId, 'billId', 100);
  const updated = structuredClone(group);
  const bill = updated.bills?.find((candidate) => candidate.id === billId);
  if (!bill) throw Object.assign(new Error('Bill not found'), { statusCode: 404 });
  if (bill.status === 'settled') throw Object.assign(new Error('This bill is already settled'), { statusCode: 409 });
  const canManageBill = actor.isHost || bill.createdByMemberId === actor.id;

  if (action === 'TOGGLE_CLAIM') {
    const itemId = requireString(payload.itemId, 'itemId', 100);
    const item = bill.items?.find((candidate) => candidate.id === itemId);
    if (!item) throw Object.assign(new Error('Item not found'), { statusCode: 404 });
    const claimants = Array.isArray(item.claimedBy) ? item.claimedBy : [];
    const shouldClaim = payload.claimed !== undefined
      ? Boolean(payload.claimed)
      : !claimants.includes(actor.id);
    item.claimedBy = shouldClaim
      ? [...new Set([...claimants, actor.id])]
      : claimants.filter((id) => id !== actor.id);
  } else if (action === 'SET_PAYER') {
    if (!canManageBill) throw Object.assign(new Error('Only the bill creator or group host can change the payer'), { statusCode: 403 });
    const payerId = requireString(payload.payerId, 'payerId', 100);
    if (!updated.members.some((member) => member.id === payerId && member.active !== false)) {
      throw Object.assign(new Error('Payer is not an active group member'), { statusCode: 400 });
    }
    bill.payerId = payerId;
  } else if (action === 'SPLIT_ALL') {
    if (!canManageBill) throw Object.assign(new Error('Only the bill creator or group host can split every item'), { statusCode: 403 });
    const memberIds = updated.members.filter((member) => member.active !== false).map((member) => member.id);
    (bill.items || []).forEach((item) => { item.claimedBy = [...memberIds]; });
  } else {
    throw Object.assign(new Error('Unknown group bill action'), { statusCode: 400 });
  }

  updated.updatedAt = Date.now();
  return updated;
}

module.exports = { processGroupBillAction };
