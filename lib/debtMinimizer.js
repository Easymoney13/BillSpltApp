function toCents(value) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round((parsed + Number.EPSILON) * 100);
}

function fromCents(value) {
  return Math.round(value) / 100;
}

function resolveMemberId(target, members) {
  if (!target) return null;
  const byId = members.find((member) => member.id === target);
  if (byId) return byId.id;

  // Legacy records sometimes stored a name. Accept it only when it is unique.
  const normalized = String(target).trim().toLowerCase();
  const matches = members.filter((member) => String(member.name || '').trim().toLowerCase() === normalized);
  return matches.length === 1 ? matches[0].id : null;
}

function splitCents(totalCents, memberIds) {
  if (totalCents <= 0 || memberIds.length === 0) return [];
  const base = Math.floor(totalCents / memberIds.length);
  let remainder = totalCents % memberIds.length;
  return memberIds.map((memberId) => {
    const cents = base + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
    return { memberId, cents };
  });
}

function greedyTransactions(entries) {
  const debtors = entries.filter((entry) => entry.cents < 0).map((entry) => ({ ...entry, cents: -entry.cents }));
  const creditors = entries.filter((entry) => entry.cents > 0).map((entry) => ({ ...entry }));
  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);
  const transactions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const cents = Math.min(debtor.cents, creditor.cents);
    if (cents > 0) transactions.push({ fromId: debtor.id, toId: creditor.id, cents });
    debtor.cents -= cents;
    creditor.cents -= cents;
    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }
  return transactions;
}

function exactTransactions(entries) {
  const active = entries.filter((entry) => entry.cents !== 0);
  if (active.length > 10) return greedyTransactions(active);
  const balances = active.map((entry) => entry.cents);
  let best = null;

  function search(transfers) {
    if (best && transfers.length >= best.length) return;
    const first = balances.findIndex((value) => value !== 0);
    if (first === -1) {
      best = transfers.map((transfer) => ({ ...transfer }));
      return;
    }

    const seen = new Set();
    for (let other = first + 1; other < balances.length; other += 1) {
      if (balances[first] * balances[other] >= 0 || seen.has(balances[other])) continue;
      seen.add(balances[other]);
      const firstBefore = balances[first];
      const otherBefore = balances[other];
      const cents = Math.min(Math.abs(firstBefore), Math.abs(otherBefore));
      const transfer = firstBefore < 0
        ? { fromId: active[first].id, toId: active[other].id, cents }
        : { fromId: active[other].id, toId: active[first].id, cents };

      balances[first] += firstBefore < 0 ? cents : -cents;
      balances[other] += otherBefore < 0 ? cents : -cents;
      transfers.push(transfer);
      search(transfers);
      transfers.pop();
      balances[first] = firstBefore;
      balances[other] = otherBefore;

      if (firstBefore + otherBefore === 0) break;
    }
  }

  search([]);
  return best || greedyTransactions(active);
}

function calculateDebtMinimization(group) {
  const members = Array.isArray(group?.members) ? group.members.filter((member) => member?.id) : [];
  const bills = Array.isArray(group?.bills) ? group.bills : [];
  const memberIds = members.map((member) => member.id);
  const records = new Map(memberIds.map((id) => [id, { paidCents: 0, shareCents: 0 }]));
  let unassignedCents = 0;
  let billAmountDifferenceCents = 0;

  bills.forEach((bill) => {
    const payerId = resolveMemberId(bill?.payerId, members) || memberIds[0];
    if (!payerId || !records.has(payerId)) return;
    const items = Array.isArray(bill?.items) ? bill.items : [];

    if (items.length === 0) {
      const billCents = toCents(bill?.amount);
      if (billCents === 0) return;
      records.get(payerId).paidCents += billCents;
      splitCents(billCents, memberIds).forEach(({ memberId, cents }) => {
        records.get(memberId).shareCents += cents;
      });
      return;
    }

    let itemTotalCents = 0;
    let assignedCents = 0;
    items.forEach((item) => {
      const itemCents = toCents(item?.price);
      itemTotalCents += itemCents;
      if (itemCents === 0) return;
      const claimantIds = [...new Set(
        (Array.isArray(item?.claimedBy) ? item.claimedBy : [])
          .map((claimant) => resolveMemberId(claimant, members))
          .filter(Boolean)
      )];
      if (claimantIds.length === 0) {
        unassignedCents += itemCents;
        return;
      }
      assignedCents += itemCents;
      splitCents(itemCents, claimantIds).forEach(({ memberId, cents }) => {
        records.get(memberId).shareCents += cents;
      });
    });

    records.get(payerId).paidCents += assignedCents;
    const declaredCents = toCents(bill?.amount);
    if (declaredCents > 0) billAmountDifferenceCents += Math.abs(declaredCents - itemTotalCents);
  });

  const balances = members.map((member) => {
    const record = records.get(member.id);
    const netCents = record.paidCents - record.shareCents;
    return {
      memberId: member.id,
      name: member.name || 'Member',
      totalPaid: fromCents(record.paidCents),
      totalShare: fromCents(record.shareCents),
      netBalance: fromCents(netCents),
      netCents,
    };
  });

  const balanceSumCents = balances.reduce((sum, balance) => sum + balance.netCents, 0);
  const rawTransactions = balanceSumCents === 0
    ? exactTransactions(balances.map((balance) => ({ id: balance.memberId, cents: balance.netCents })))
    : [];
  const memberById = new Map(members.map((member) => [member.id, member]));
  const transactions = rawTransactions.map((transaction) => ({
    fromId: transaction.fromId,
    fromName: memberById.get(transaction.fromId)?.name || 'Member',
    toId: transaction.toId,
    toName: memberById.get(transaction.toId)?.name || 'Member',
    toPhone: memberById.get(transaction.toId)?.phone || '',
    amount: fromCents(transaction.cents),
  }));

  return {
    balances: balances.map(({ netCents, ...balance }) => balance),
    transactions,
    unassignedAmount: fromCents(unassignedCents),
    billAmountDifference: fromCents(billAmountDifferenceCents),
    isBalanced: balanceSumCents === 0,
  };
}

module.exports = {
  calculateDebtMinimization,
  splitCents,
  toCents,
};
