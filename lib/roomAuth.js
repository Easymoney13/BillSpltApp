const { createAccessToken, createEntityId, hashAccessToken, tokenMatches } = require('./ids');
const security = require('./security');

function createRoomMember({ uid, name, isHost = false, avatarColor = '#A3E635' }) {
  const accessToken = createAccessToken();
  const member = {
    id: uid || createEntityId('member'),
    name: security.sanitizeName(name, isHost ? 'Host' : 'Member'),
    phone: '',
    isHost: Boolean(isHost),
    settled: false,
    avatarColor,
    accessTokenHash: hashAccessToken(accessToken),
  };
  return { member, accessToken };
}

function findRoomMember(room, { uid, accessToken } = {}) {
  const members = Array.isArray(room?.members) ? room.members.filter((member) => member.active !== false) : [];
  if (uid) {
    const member = members.find((candidate) => candidate.id === uid);
    if (member) return member;
  }
  if (accessToken) {
    return members.find((candidate) => tokenMatches(accessToken, candidate.accessTokenHash)) || null;
  }
  return null;
}

function joinRoom(room, { uid, accessToken, name, avatarColor }) {
  if (!room || !Array.isArray(room.members)) throw new Error('Room is invalid');

  const existing = findRoomMember(room, { uid, accessToken });
  if (existing && accessToken && tokenMatches(accessToken, existing.accessTokenHash)) {
    const cleanName = name ? security.sanitizeName(name, existing.name || 'Member') : existing.name;
    const changed = Boolean(cleanName && cleanName !== existing.name);
    if (changed) existing.name = cleanName;
    return { member: existing, accessToken, changed };
  }

  if (existing && uid && existing.id === uid) {
    const nextToken = createAccessToken();
    existing.accessTokenHash = hashAccessToken(nextToken);
    if (name) existing.name = security.sanitizeName(name, existing.name || 'Member');
    return { member: existing, accessToken: nextToken, changed: true };
  }

  if (uid) {
    const inactiveMember = room.members.find((member) => member.id === uid && member.active === false);
    if (inactiveMember) {
      const nextToken = createAccessToken();
      inactiveMember.active = true;
      inactiveMember.accessTokenHash = hashAccessToken(nextToken);
      inactiveMember.name = security.sanitizeName(name, inactiveMember.name || 'Member');
      return { member: inactiveMember, accessToken: nextToken, changed: true };
    }
  }

  const created = createRoomMember({
    uid,
    name,
    isHost: false,
    avatarColor,
  });
  room.members.push(created.member);
  return { ...created, changed: true };
}

function stripPrivateFields(value) {
  if (Array.isArray(value)) return value.map(stripPrivateFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['accessTokenHash', 'hostTokenHash'].includes(key))
      .map(([key, child]) => [key, stripPrivateFields(child)])
  );
}

function publicRoom(room) {
  return stripPrivateFields(room);
}

function getRequestRoomToken(req) {
  const value = req?.headers?.['x-room-token'];
  return Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : '');
}

module.exports = {
  createRoomMember,
  findRoomMember,
  joinRoom,
  publicRoom,
  getRequestRoomToken,
};
