const fs = require('fs');
const path = require('path');
const { createEntityId, createUniqueRoomCode } = require('./ids');

const DB_PATH = process.env.BILLSPLIT_DB_PATH
  ? path.resolve(process.env.BILLSPLIT_DB_PATH)
  : path.join(__dirname, '..', 'db.json');
const TMP_PATH = `${DB_PATH}.tmp`;

function ensureDbExists() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultData = { users: {}, sessions: {}, history: [], groups: {} };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

function readDb() {
  ensureDbExists();
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!parsed.users) parsed.users = {};
    if (!parsed.sessions) parsed.sessions = {};
    if (!parsed.history) parsed.history = [];
    if (!parsed.groups) parsed.groups = {};
    return parsed;
  } catch (err) {
    throw new Error(`Could not read the database safely: ${err.message}`);
  }
}

function writeDb(data) {
  try {
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(TMP_PATH, content, 'utf-8');
    fs.renameSync(TMP_PATH, DB_PATH);
  } catch (err) {
    try {
      if (fs.existsSync(TMP_PATH)) fs.unlinkSync(TMP_PATH);
    } catch (_) {
      // Preserve the original database error.
    }
    throw new Error(`Could not write the database safely: ${err.message}`);
  }
}

function getUserKey(username, phone) {
  const cleanName = (username || '').toString().trim().toLowerCase();
  const cleanPhone = (phone || '').toString().trim();
  if (cleanName && cleanPhone) return `${cleanName}_${cleanPhone}`;
  if (cleanName) return cleanName;
  if (cleanPhone) return cleanPhone;
  return null;
}

const db = {
  getUserByUid(uid) {
    if (!uid) return null;
    const data = readDb();
    if (!data.users) return null;
    return data.users[uid] || null;
  },

  getUser(username, phone) {
    const key = getUserKey(username, phone);
    if (!key) return null;
    const data = readDb();
    if (!data.users) return null;

    // Direct key lookup
    if (data.users[key]) return data.users[key];

    // Flexible lookup matching username or phone
    const cleanName = (username || '').toString().trim().toLowerCase();
    const cleanPhone = (phone || '').toString().trim();

    const found = Object.values(data.users).find((u) => {
      const uName = (u.username || '').trim().toLowerCase();
      const uPhone = (u.phone || '').trim();
      if (cleanName && uName === cleanName) return true;
      if (cleanPhone && uPhone === cleanPhone) return true;
      return false;
    });

    return found || null;
  },

  saveUser(user) {
    const key = user.id;
    if (!key) return null;
    const data = readDb();
    if (!data.users) data.users = {};

    data.users[key] = {
      ...user,
      updatedAt: Date.now()
    };
    writeDb(data);
    return data.users[key];
  },

  findOrCreateUser(uid, username, phone, settings = {}) {
    if (!uid) {
      // Legacy fallback
      const tempKey = getUserKey(username, phone) || `usr_temp_${Date.now()}`;
      const data = readDb();
      if (data.users && data.users[tempKey]) return data.users[tempKey];

      const legacyUser = {
        id: createEntityId('usr'),
        username: username || 'User',
        phone: phone || '',
        avatarColor: '#7C3AED',
        settings: {
          language: settings.language || 'en',
          currency: settings.currency || 'NIS',
          theme: settings.theme || 'dark',
          customGeminiKey: settings.customGeminiKey || '',
          ocrEngine: settings.ocrEngine || 'tesseract'
        },
        bills: [],
        groups: [],
        createdAt: Date.now()
      };
      this.saveUser(legacyUser);
      return legacyUser;
    }

    let user = this.getUserByUid(uid);
    const data = readDb();
    if (!data.users) data.users = {};

    if (!user) {
      // A display name is not an identity. Only migrate a legacy account when
      // there is an exact phone match; otherwise a same-name user could inherit
      // somebody else's data.
      const cleanPhone = (phone || '').toString().trim();
      const legacyEntry = cleanPhone
        ? Object.entries(data.users).find(([, candidate]) => (
          candidate?.id !== uid && (candidate?.phone || '').toString().trim() === cleanPhone
        ))
        : null;
      if (legacyEntry) {
        const [legacyKey, legacyUser] = legacyEntry;
        user = {
          ...legacyUser,
          id: uid,
          username: username || legacyUser.username,
          phone: phone || legacyUser.phone,
          updatedAt: Date.now()
        };
        delete data.users[legacyKey];
      } else {
        user = {
          id: uid,
          username: username || 'User',
          phone: phone || '',
          avatarColor: '#7C3AED',
          settings: {
            language: settings.language || 'en',
            currency: settings.currency || 'NIS',
            theme: settings.theme || 'light',
            customGeminiKey: settings.customGeminiKey || '',
            ocrEngine: settings.ocrEngine || 'tesseract'
          },
          bills: [],
          groups: [],
          createdAt: Date.now()
        };
      }
    } else {
      if (username) user.username = username;
      if (phone) user.phone = phone;
      if (settings && Object.keys(settings).length > 0) {
        user.settings = {
          ...(user.settings || {}),
          ...settings
        };
      }
      user.updatedAt = Date.now();
    }

    data.users[uid] = user;
    writeDb(data);
    return user;
  },

  updateUserSettings(uid, username, phone, newSettings) {
    const user = this.findOrCreateUser(uid, username, phone);
    if (user) {
      user.settings = {
        ...(user.settings || {}),
        ...newSettings
      };
      this.saveUser(user);
    }
    return user;
  },

  addUserBill(uid, username, phone, billRecord) {
    const user = this.findOrCreateUser(uid, username, phone);
    if (user) {
      if (!Array.isArray(user.bills)) user.bills = [];
      const existsIdx = user.bills.findIndex((b) => b.id === billRecord.id);
      if (existsIdx > -1) {
        user.bills[existsIdx] = { ...user.bills[existsIdx], ...billRecord };
      } else {
        user.bills.unshift(billRecord);
      }
      this.saveUser(user);
    }
    return user;
  },

  getSession(idOrCode) {
    const data = readDb();
    if (!data.sessions) return null;
    if (data.sessions[idOrCode]) return data.sessions[idOrCode];
    // Search by 4-digit code
    const found = Object.values(data.sessions).find(
      (s) => s.code === idOrCode || s.id === idOrCode
    );
    return found || null;
  },

  saveSession(session) {
    const data = readDb();
    if (!data.sessions) data.sessions = {};
    data.sessions[session.id] = {
      ...session,
      updatedAt: Date.now(),
    };
    writeDb(data);
    return data.sessions[session.id];
  },

  deleteSession(sessionId) {
    const data = readDb();
    if (!data.sessions?.[sessionId]) return false;
    delete data.sessions[sessionId];
    writeDb(data);
    return true;
  },

  getAllSessions() {
    const data = readDb();
    return data.sessions || {};
  },

  generateUniqueRoomCode() {
    return createUniqueRoomCode(readDb());
  },

  addToHistory(historyRecord) {
    const data = readDb();
    if (!data.history) data.history = [];
    const existingIndex = data.history.findIndex((history) => history.id === historyRecord.id);
    if (existingIndex === -1) {
      data.history.unshift(historyRecord);
    } else {
      data.history[existingIndex] = { ...data.history[existingIndex], ...historyRecord };
    }

    if (Array.isArray(historyRecord.members)) {
      historyRecord.members.forEach((m) => {
        const user = data.users?.[m.id];
        if (user) {
          if (!Array.isArray(user.bills)) user.bills = [];
          const billIndex = user.bills.findIndex((bill) => bill.id === historyRecord.id);
          if (billIndex === -1) user.bills.unshift(historyRecord);
          else user.bills[billIndex] = { ...user.bills[billIndex], ...historyRecord };
        }
      });
    }

    writeDb(data);
    return data.history;
  },

  saveSessionAndHistory(session, historyRecord) {
    const data = readDb();
    if (!data.sessions) data.sessions = {};
    if (!data.history) data.history = [];
    data.sessions[session.id] = { ...session, updatedAt: Date.now() };

    const existingIndex = data.history.findIndex((history) => history.id === historyRecord.id);
    if (existingIndex === -1) data.history.unshift(historyRecord);
    else data.history[existingIndex] = { ...data.history[existingIndex], ...historyRecord };

    if (Array.isArray(historyRecord.members)) {
      historyRecord.members.forEach((member) => {
        const user = data.users?.[member.id];
        if (!user) return;
        if (!Array.isArray(user.bills)) user.bills = [];
        const billIndex = user.bills.findIndex((bill) => bill.id === historyRecord.id);
        if (billIndex === -1) user.bills.unshift(historyRecord);
        else user.bills[billIndex] = { ...user.bills[billIndex], ...historyRecord };
      });
    }

    writeDb(data);
    return data.sessions[session.id];
  },

  getHistory() {
    const data = readDb();
    return data.history || [];
  },

  deleteHistory(id) {
    const data = readDb();
    if (!data.history) data.history = [];
    data.history = data.history.filter((h) => h.id !== id);

    // Delete from all user bill collections
    if (data.users) {
      Object.keys(data.users).forEach((k) => {
        if (Array.isArray(data.users[k].bills)) {
          data.users[k].bills = data.users[k].bills.filter((b) => b.id !== id);
        }
      });
    }

    writeDb(data);
    return data.history;
  },

  hideHistoryForUser(uid, historyId) {
    if (!uid || !historyId) return null;
    const data = readDb();
    const user = data.users?.[uid];
    if (!user) return null;
    if (!Array.isArray(user.hiddenHistoryIds)) user.hiddenHistoryIds = [];
    if (!user.hiddenHistoryIds.includes(historyId)) user.hiddenHistoryIds.push(historyId);
    user.updatedAt = Date.now();
    writeDb(data);
    return user;
  },

  getGroup(idOrCode) {
    const data = readDb();
    if (!data.groups) return null;
    if (data.groups[idOrCode]) return data.groups[idOrCode];
    const found = Object.values(data.groups).find(
      (g) => g.code === idOrCode || g.id === idOrCode
    );
    return found || null;
  },

  saveGroup(group) {
    const data = readDb();
    if (!data.groups) data.groups = {};
    data.groups[group.id] = {
      ...group,
      updatedAt: Date.now(),
    };

    if (Array.isArray(group.members) && data.users) {
      group.members.forEach((m) => {
        if (m.active === false) return;
        const u = data.users[m.id];
        if (u) {
          if (!Array.isArray(u.groups)) u.groups = [];
          if (!u.groups.includes(group.id)) u.groups.push(group.id);
          u.updatedAt = Date.now();
        }
      });
    }

    writeDb(data);
    return data.groups[group.id];
  },

  saveGroupAndSession(group, session) {
    const data = readDb();
    if (!data.groups) data.groups = {};
    if (!data.sessions) data.sessions = {};
    const updatedAt = Date.now();
    data.groups[group.id] = { ...group, updatedAt };
    data.sessions[session.id] = { ...session, updatedAt };
    if (Array.isArray(group.members) && data.users) {
      group.members.forEach((member) => {
        const user = data.users[member.id];
        if (!user || member.active === false) return;
        if (!Array.isArray(user.groups)) user.groups = [];
        if (!user.groups.includes(group.id)) user.groups.push(group.id);
        user.updatedAt = updatedAt;
      });
    }
    writeDb(data);
    return { group: data.groups[group.id], session: data.sessions[session.id] };
  },

  getAllGroups() {
    const data = readDb();
    return data.groups || {};
  },

  leaveGroup(groupId, memberId) {
    const data = readDb();
    const group = data.groups?.[groupId];
    const member = group?.members?.find((candidate) => candidate.id === memberId);
    if (!group || !member) return null;
    member.active = false;
    member.accessTokenHash = '';
    group.updatedAt = Date.now();

    (group.bills || []).forEach((bill) => {
      const session = data.sessions?.[bill.sessionId];
      const sessionMember = session?.members?.find((candidate) => candidate.id === memberId);
      if (sessionMember) {
        sessionMember.active = false;
        sessionMember.accessTokenHash = '';
        session.updatedAt = Date.now();
      }
    });
    const user = data.users?.[memberId];
    if (user?.groups) user.groups = user.groups.filter((id) => id !== groupId);
    writeDb(data);
    return group;
  },

  deleteGroup(groupId) {
    const data = readDb();
    const group = data.groups?.[groupId];
    if (!group) return null;
    (group.bills || []).forEach((bill) => {
      if (bill.sessionId && data.sessions) delete data.sessions[bill.sessionId];
    });
    delete data.groups[groupId];
    Object.values(data.users || {}).forEach((user) => {
      if (Array.isArray(user.groups)) user.groups = user.groups.filter((id) => id !== groupId);
    });
    writeDb(data);
    return group;
  },

  deleteGroupBill(groupId, billId) {
    const data = readDb();
    if (!data.groups || !data.groups[groupId]) return null;
    const group = data.groups[groupId];
    if (!Array.isArray(group.bills)) return null;
    const bill = group.bills.find((candidate) => candidate.id === billId);
    if (!bill) return null;
    group.bills = group.bills.filter((candidate) => candidate.id !== billId);
    if (bill.sessionId && data.sessions) delete data.sessions[bill.sessionId];
    group.updatedAt = Date.now();
    writeDb(data);
    return group;
  }
};

module.exports = db;
module.exports.db = db;
module.exports.default = db;
module.exports.__esModule = true;
