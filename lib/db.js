const fs = require('fs');
const path = require('path');
const { createEntityId, createUniqueRoomCode } = require('./ids');

const DB_PATH = process.env.BILLSPLIT_DB_PATH
  ? path.resolve(process.env.BILLSPLIT_DB_PATH)
  : path.join(__dirname, '..', 'db.json');
const TMP_PATH = `${DB_PATH}.tmp`;

const isTesting = process.env.NODE_ENV === 'test' || !!process.env.BILLSPLIT_DB_PATH;

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
    } catch (_) {}
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

let firestoreInstance = null;
function getFirestore() {
  if (!firestoreInstance) {
    const admin = require('firebase-admin');
    firestoreInstance = admin.firestore();
  }
  return firestoreInstance;
}

async function migrateLocalDbToFirestore() {
  if (isTesting) return;
  try {
    const db = getFirestore();
    const usersSnap = await db.collection('users').limit(1).get();
    if (!usersSnap.empty) {
      console.log('✅ Cloud Firestore already has data. Skipping migration.');
      return;
    }

    if (!fs.existsSync(DB_PATH)) {
      console.log('ℹ️ No local db.json found to migrate.');
      return;
    }

    console.log('⚡ Starting local db.json to Cloud Firestore migration...');
    const localData = readDb();

    // 1. Migrate Users
    if (localData.users && Object.keys(localData.users).length > 0) {
      const batch = db.batch();
      let count = 0;
      for (const user of Object.values(localData.users)) {
        if (!user || !user.id) continue;
        const userRef = db.collection('users').doc(user.id);
        const username_lowercase = (user.username || '').toString().trim().toLowerCase();
        batch.set(userRef, { ...user, username_lowercase });
        count++;
      }
      if (count > 0) {
        await batch.commit();
        console.log(`- Migrated ${count} users.`);
      }
    }

    // 2. Migrate Sessions
    if (localData.sessions && Object.keys(localData.sessions).length > 0) {
      const batch = db.batch();
      let count = 0;
      for (const session of Object.values(localData.sessions)) {
        if (!session || !session.id) continue;
        const sessionRef = db.collection('sessions').doc(session.id);
        batch.set(sessionRef, session);
        count++;
      }
      if (count > 0) {
        await batch.commit();
        console.log(`- Migrated ${count} sessions.`);
      }
    }

    // 3. Migrate Groups
    if (localData.groups && Object.keys(localData.groups).length > 0) {
      const batch = db.batch();
      let count = 0;
      for (const group of Object.values(localData.groups)) {
        if (!group || !group.id) continue;
        const groupRef = db.collection('groups').doc(group.id);
        batch.set(groupRef, group);
        count++;
      }
      if (count > 0) {
        await batch.commit();
        console.log(`- Migrated ${count} groups.`);
      }
    }

    // 4. Migrate History
    if (localData.history && localData.history.length > 0) {
      const batch = db.batch();
      let count = 0;
      for (const item of localData.history) {
        if (!item || !item.id) continue;
        const historyRef = db.collection('history').doc(item.id);
        batch.set(historyRef, item);
        count++;
      }
      if (count > 0) {
        await batch.commit();
        console.log(`- Migrated ${count} history items.`);
      }
    }

    console.log('⚡ Local db.json successfully migrated to Firestore!');
  } catch (err) {
    console.error('❌ Error during Firestore migration:', err);
  }
}

const db = {
  migrateLocalDbToFirestore,

  getUserByUid(uid) {
    if (isTesting) {
      if (!uid) return null;
      const data = readDb();
      return data.users[uid] || null;
    }
    return (async () => {
      if (!uid) return null;
      const doc = await getFirestore().collection('users').doc(uid).get();
      return doc.exists ? doc.data() : null;
    })();
  },

  getUser(username, phone) {
    if (isTesting) {
      const key = getUserKey(username, phone);
      if (!key) return null;
      const data = readDb();
      if (data.users[key]) return data.users[key];
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
    }
    return (async () => {
      const usersRef = getFirestore().collection('users');
      const cleanName = (username || '').toString().trim().toLowerCase();
      const cleanPhone = (phone || '').toString().trim();
      if (cleanPhone) {
        const snap = await usersRef.where('phone', '==', cleanPhone).limit(1).get();
        if (!snap.empty) return snap.docs[0].data();
      }
      if (cleanName) {
        const snap = await usersRef.where('username_lowercase', '==', cleanName).limit(1).get();
        if (!snap.empty) return snap.docs[0].data();
      }
      return null;
    })();
  },

  saveUser(user) {
    if (isTesting) {
      const key = user.id;
      if (!key) return null;
      const data = readDb();
      data.users[key] = { ...user, updatedAt: Date.now() };
      writeDb(data);
      return data.users[key];
    }
    return (async () => {
      const uid = user.id;
      if (!uid) return null;
      const username_lowercase = (user.username || '').toString().trim().toLowerCase();
      const data = {
        ...user,
        username_lowercase,
        updatedAt: Date.now()
      };
      await getFirestore().collection('users').doc(uid).set(data, { merge: true });
      return data;
    })();
  },

  findOrCreateUser(uid, username, phone, settings = {}) {
    if (isTesting) {
      if (!uid) {
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
      if (!user) {
        const cleanPhone = (phone || '').toString().trim();
        const cleanName = (username || '').toString().trim().toLowerCase();
        const legacyEntry = Object.entries(data.users).find(([, candidate]) => {
          if (!candidate) return false;
          if (candidate.id === uid) return false;
          if (!candidate.id.startsWith('usr_')) return false; // Must be a guest account
          if (cleanPhone && (candidate.phone || '').toString().trim() === cleanPhone) return true;
          if (cleanName && (candidate.username || '').toString().trim().toLowerCase() === cleanName) return true;
          return false;
        });
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
          user.settings = { ...(user.settings || {}), ...settings };
        }
        user.updatedAt = Date.now();
      }
      data.users[uid] = user;
      writeDb(data);
      return user;
    }
    return (async () => {
      if (!uid) {
        let legacyUser = await this.getUser(username, phone);
        if (legacyUser) return legacyUser;
        legacyUser = {
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
        await this.saveUser(legacyUser);
        return legacyUser;
      }
      let user = await this.getUserByUid(uid);
      if (!user) {
        const cleanPhone = (phone || '').toString().trim();
        const cleanName = (username || '').toString().trim().toLowerCase();
        let legacyUser = null;
        let legacyDocId = null;

        if (cleanPhone) {
          const snap = await getFirestore().collection('users').where('phone', '==', cleanPhone).limit(1).get();
          if (!snap.empty) {
            const doc = snap.docs[0];
            if (doc.id !== uid && doc.id.startsWith('usr_')) {
              legacyUser = doc.data();
              legacyDocId = doc.id;
            }
          }
        }

        if (!legacyUser && cleanName) {
          const snap = await getFirestore().collection('users').where('username_lowercase', '==', cleanName).limit(1).get();
          if (!snap.empty) {
            const doc = snap.docs[0];
            if (doc.id !== uid && doc.id.startsWith('usr_')) {
              legacyUser = doc.data();
              legacyDocId = doc.id;
            }
          }
        }

        if (legacyUser) {
          user = {
            ...legacyUser,
            id: uid,
            username: username || legacyUser.username,
            phone: phone || legacyUser.phone,
            updatedAt: Date.now()
          };
          if (legacyDocId) {
            await getFirestore().collection('users').doc(legacyDocId).delete();
          }
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
          user.settings = { ...(user.settings || {}), ...settings };
        }
      }
      await this.saveUser(user);
      return user;
    })();
  },

  updateUserSettings(uid, username, phone, newSettings) {
    if (isTesting) {
      const user = this.findOrCreateUser(uid, username, phone);
      if (user) {
        user.settings = { ...(user.settings || {}), ...newSettings };
        this.saveUser(user);
      }
      return user;
    }
    return (async () => {
      const user = await this.findOrCreateUser(uid, username, phone);
      if (user) {
        user.settings = { ...(user.settings || {}), ...newSettings };
        await this.saveUser(user);
      }
      return user;
    })();
  },

  addUserBill(uid, username, phone, billRecord) {
    if (isTesting) {
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
    }
    return (async () => {
      const user = await this.findOrCreateUser(uid, username, phone);
      if (user) {
        if (!Array.isArray(user.bills)) user.bills = [];
        const existsIdx = user.bills.findIndex((b) => b.id === billRecord.id);
        if (existsIdx > -1) {
          user.bills[existsIdx] = { ...user.bills[existsIdx], ...billRecord };
        } else {
          user.bills.unshift(billRecord);
        }
        await this.saveUser(user);
      }
      return user;
    })();
  },

  getSession(idOrCode) {
    if (isTesting) {
      const data = readDb();
      if (data.sessions[idOrCode]) return data.sessions[idOrCode];
      return Object.values(data.sessions).find((s) => s.code === idOrCode || s.id === idOrCode) || null;
    }
    return (async () => {
      if (!idOrCode) return null;
      const doc = await getFirestore().collection('sessions').doc(idOrCode).get();
      if (doc.exists) return doc.data();
      const snap = await getFirestore().collection('sessions').where('code', '==', idOrCode).limit(1).get();
      return snap.empty ? null : snap.docs[0].data();
    })();
  },

  saveSession(session) {
    if (isTesting) {
      const data = readDb();
      data.sessions[session.id] = { ...session, updatedAt: Date.now() };
      writeDb(data);
      return data.sessions[session.id];
    }
    return (async () => {
      const id = session.id;
      if (!id) return null;
      const data = { ...session, updatedAt: Date.now() };
      await getFirestore().collection('sessions').doc(id).set(data, { merge: true });
      return data;
    })();
  },

  deleteSession(sessionId) {
    if (isTesting) {
      const data = readDb();
      if (!data.sessions?.[sessionId]) return false;
      delete data.sessions[sessionId];
      writeDb(data);
      return true;
    }
    return (async () => {
      if (!sessionId) return false;
      await getFirestore().collection('sessions').doc(sessionId).delete();
      return true;
    })();
  },

  getAllSessions() {
    if (isTesting) {
      return readDb().sessions || {};
    }
    return (async () => {
      const snap = await getFirestore().collection('sessions').get();
      const sessions = {};
      snap.forEach((doc) => { sessions[doc.id] = doc.data(); });
      return sessions;
    })();
  },

  generateUniqueRoomCode() {
    if (isTesting) {
      return createUniqueRoomCode(readDb());
    }
    return (async () => {
      const db = getFirestore();
      let attempts = 0;
      while (attempts < 50) {
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const sSnap = await db.collection('sessions').where('code', '==', code).limit(1).get();
        if (sSnap.empty) {
          const gSnap = await db.collection('groups').where('code', '==', code).limit(1).get();
          if (gSnap.empty) return code;
        }
        attempts++;
      }
      return Math.floor(100000 + Math.random() * 900000).toString();
    })();
  },

  addToHistory(historyRecord) {
    if (isTesting) {
      const data = readDb();
      const existingIndex = data.history.findIndex((h) => h.id === historyRecord.id);
      if (existingIndex === -1) data.history.unshift(historyRecord);
      else data.history[existingIndex] = { ...data.history[existingIndex], ...historyRecord };
      if (Array.isArray(historyRecord.members)) {
        historyRecord.members.forEach((m) => {
          const user = data.users?.[m.id];
          if (user) {
            if (!Array.isArray(user.bills)) user.bills = [];
            const idx = user.bills.findIndex((b) => b.id === historyRecord.id);
            if (idx === -1) user.bills.unshift(historyRecord);
            else user.bills[idx] = { ...user.bills[idx], ...historyRecord };
          }
        });
      }
      writeDb(data);
      return data.history;
    }
    return (async () => {
      const id = historyRecord.id;
      if (!id) return [];
      const db = getFirestore();
      await db.collection('history').doc(id).set(historyRecord);
      if (Array.isArray(historyRecord.members)) {
        for (const member of historyRecord.members) {
          const userRef = db.collection('users').doc(member.id);
          const doc = await userRef.get();
          if (doc.exists) {
            const user = doc.data();
            if (!Array.isArray(user.bills)) user.bills = [];
            const idx = user.bills.findIndex((b) => b.id === historyRecord.id);
            if (idx === -1) user.bills.unshift(historyRecord);
            else user.bills[idx] = { ...user.bills[idx], ...historyRecord };
            await userRef.set(user, { merge: true });
          }
        }
      }
      return this.getHistory();
    })();
  },

  saveSessionAndHistory(session, historyRecord) {
    if (isTesting) {
      const data = readDb();
      data.sessions[session.id] = { ...session, updatedAt: Date.now() };
      const idx = data.history.findIndex((h) => h.id === historyRecord.id);
      if (idx === -1) data.history.unshift(historyRecord);
      else data.history[idx] = { ...data.history[idx], ...historyRecord };
      if (Array.isArray(historyRecord.members)) {
        historyRecord.members.forEach((m) => {
          const u = data.users?.[m.id];
          if (u) {
            if (!Array.isArray(u.bills)) u.bills = [];
            const bIdx = u.bills.findIndex((b) => b.id === historyRecord.id);
            if (bIdx === -1) u.bills.unshift(historyRecord);
            else u.bills[bIdx] = { ...u.bills[bIdx], ...historyRecord };
          }
        });
      }
      writeDb(data);
      return data.sessions[session.id];
    }
    return (async () => {
      const db = getFirestore();
      const batch = db.batch();
      batch.set(db.collection('sessions').doc(session.id), { ...session, updatedAt: Date.now() }, { merge: true });
      batch.set(db.collection('history').doc(historyRecord.id), historyRecord);
      await batch.commit();

      if (Array.isArray(historyRecord.members)) {
        for (const member of historyRecord.members) {
          const userRef = db.collection('users').doc(member.id);
          const doc = await userRef.get();
          if (doc.exists) {
            const user = doc.data();
            if (!Array.isArray(user.bills)) user.bills = [];
            const idx = user.bills.findIndex((b) => b.id === historyRecord.id);
            if (idx === -1) user.bills.unshift(historyRecord);
            else user.bills[idx] = { ...user.bills[idx], ...historyRecord };
            await userRef.set(user, { merge: true });
          }
        }
      }
      return session;
    })();
  },

  getHistory() {
    if (isTesting) {
      return readDb().history || [];
    }
    return (async () => {
      const snap = await getFirestore().collection('history').get();
      const list = [];
      snap.forEach((doc) => { list.push(doc.data()); });
      list.sort((a, b) => {
        const timeA = a.createdAt || (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt || (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });
      return list;
    })();
  },

  deleteHistory(id) {
    if (isTesting) {
      const data = readDb();
      data.history = (data.history || []).filter((h) => h.id !== id);
      Object.keys(data.users || {}).forEach((k) => {
        if (Array.isArray(data.users[k].bills)) {
          data.users[k].bills = data.users[k].bills.filter((b) => b.id !== id);
        }
      });
      writeDb(data);
      return data.history;
    }
    return (async () => {
      const db = getFirestore();
      await db.collection('history').doc(id).delete();
      const usersSnap = await db.collection('users').get();
      for (const doc of usersSnap.docs) {
        const user = doc.data();
        if (Array.isArray(user.bills)) {
          const filtered = user.bills.filter((b) => b.id !== id);
          if (filtered.length !== user.bills.length) {
            await db.collection('users').doc(doc.id).update({ bills: filtered });
          }
        }
      }
      return this.getHistory();
    })();
  },

  hideHistoryForUser(uid, historyId) {
    if (isTesting) {
      const data = readDb();
      const user = data.users?.[uid];
      if (!user) return null;
      if (!Array.isArray(user.hiddenHistoryIds)) user.hiddenHistoryIds = [];
      if (!user.hiddenHistoryIds.includes(historyId)) user.hiddenHistoryIds.push(historyId);
      user.updatedAt = Date.now();
      writeDb(data);
      return user;
    }
    return (async () => {
      if (!uid || !historyId) return null;
      const db = getFirestore();
      const userRef = db.collection('users').doc(uid);
      const doc = await userRef.get();
      if (!doc.exists) return null;
      const user = doc.data();
      if (!Array.isArray(user.hiddenHistoryIds)) user.hiddenHistoryIds = [];
      if (!user.hiddenHistoryIds.includes(historyId)) {
        user.hiddenHistoryIds.push(historyId);
        await userRef.update({ hiddenHistoryIds: user.hiddenHistoryIds, updatedAt: Date.now() });
      }
      return user;
    })();
  },

  getGroup(idOrCode) {
    if (isTesting) {
      const data = readDb();
      if (data.groups[idOrCode]) return data.groups[idOrCode];
      return Object.values(data.groups).find((g) => g.code === idOrCode || g.id === idOrCode) || null;
    }
    return (async () => {
      if (!idOrCode) return null;
      const doc = await getFirestore().collection('groups').doc(idOrCode).get();
      if (doc.exists) return doc.data();
      const snap = await getFirestore().collection('groups').where('code', '==', idOrCode).limit(1).get();
      return snap.empty ? null : snap.docs[0].data();
    })();
  },

  saveGroup(group) {
    if (isTesting) {
      const data = readDb();
      data.groups[group.id] = { ...group, updatedAt: Date.now() };
      if (Array.isArray(group.members)) {
        group.members.forEach((m) => {
          if (m.active === false) return;
          const u = data.users[m.id];
          if (u) {
            if (!Array.isArray(u.groups)) u.groups = [];
            if (!u.groups.includes(group.id)) u.groups.push(group.id);
          }
        });
      }
      writeDb(data);
      return data.groups[group.id];
    }
    return (async () => {
      const id = group.id;
      if (!id) return null;
      const db = getFirestore();
      const data = { ...group, updatedAt: Date.now() };
      await db.collection('groups').doc(id).set(data, { merge: true });
      if (Array.isArray(group.members)) {
        for (const member of group.members) {
          if (member.active === false) continue;
          const userRef = db.collection('users').doc(member.id);
          const doc = await userRef.get();
          if (doc.exists) {
            const u = doc.data();
            if (!Array.isArray(u.groups)) u.groups = [];
            if (!u.groups.includes(group.id)) {
              u.groups.push(group.id);
              await userRef.update({ groups: u.groups, updatedAt: Date.now() });
            }
          }
        }
      }
      return data;
    })();
  },

  saveGroupAndSession(group, session) {
    if (isTesting) {
      const data = readDb();
      const updatedAt = Date.now();
      data.groups[group.id] = { ...group, updatedAt };
      data.sessions[session.id] = { ...session, updatedAt };
      if (Array.isArray(group.members)) {
        group.members.forEach((m) => {
          const u = data.users[m.id];
          if (u && m.active !== false) {
            if (!Array.isArray(u.groups)) u.groups = [];
            if (!u.groups.includes(group.id)) u.groups.push(group.id);
          }
        });
      }
      writeDb(data);
      return { group: data.groups[group.id], session: data.sessions[session.id] };
    }
    return (async () => {
      const db = getFirestore();
      const batch = db.batch();
      const updatedAt = Date.now();
      batch.set(db.collection('groups').doc(group.id), { ...group, updatedAt }, { merge: true });
      batch.set(db.collection('sessions').doc(session.id), { ...session, updatedAt }, { merge: true });
      await batch.commit();

      if (Array.isArray(group.members)) {
        for (const member of group.members) {
          const userRef = db.collection('users').doc(member.id);
          const doc = await userRef.get();
          if (doc.exists && member.active !== false) {
            const u = doc.data();
            if (!Array.isArray(u.groups)) u.groups = [];
            if (!u.groups.includes(group.id)) {
              u.groups.push(group.id);
              await userRef.update({ groups: u.groups, updatedAt });
            }
          }
        }
      }
      return { group, session };
    })();
  },

  getAllGroups() {
    if (isTesting) {
      return readDb().groups || {};
    }
    return (async () => {
      const snap = await getFirestore().collection('groups').get();
      const groups = {};
      snap.forEach((doc) => { groups[doc.id] = doc.data(); });
      return groups;
    })();
  },

  leaveGroup(groupId, memberId) {
    if (isTesting) {
      const data = readDb();
      const group = data.groups?.[groupId];
      const member = group?.members?.find((m) => m.id === memberId);
      if (!group || !member) return null;
      member.active = false;
      member.accessTokenHash = '';
      group.updatedAt = Date.now();
      (group.bills || []).forEach((bill) => {
        const session = data.sessions?.[bill.sessionId];
        const sMember = session?.members?.find((m) => m.id === memberId);
        if (sMember) {
          sMember.active = false;
          sMember.accessTokenHash = '';
          session.updatedAt = Date.now();
        }
      });
      const user = data.users?.[memberId];
      if (user?.groups) user.groups = user.groups.filter((id) => id !== groupId);
      writeDb(data);
      return group;
    }
    return (async () => {
      const db = getFirestore();
      const groupRef = db.collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) return null;
      const group = groupDoc.data();
      const member = group.members?.find((m) => m.id === memberId);
      if (!member) return null;
      member.active = false;
      member.accessTokenHash = '';
      group.updatedAt = Date.now();

      if (Array.isArray(group.bills)) {
        for (const bill of group.bills) {
          if (bill.sessionId) {
            const sRef = db.collection('sessions').doc(bill.sessionId);
            const sDoc = await sRef.get();
            if (sDoc.exists) {
              const session = sDoc.data();
              const sMember = session.members?.find((m) => m.id === memberId);
              if (sMember) {
                sMember.active = false;
                sMember.accessTokenHash = '';
                await sRef.set(session, { merge: true });
              }
            }
          }
        }
      }
      await groupRef.set(group, { merge: true });

      const userRef = db.collection('users').doc(memberId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        const user = userDoc.data();
        if (user.groups) {
          user.groups = user.groups.filter((id) => id !== groupId);
          await userRef.update({ groups: user.groups });
        }
      }
      return group;
    })();
  },

  deleteGroup(groupId) {
    if (isTesting) {
      const data = readDb();
      const group = data.groups?.[groupId];
      if (!group) return null;
      (group.bills || []).forEach((b) => {
        if (b.sessionId && data.sessions) delete data.sessions[b.sessionId];
      });
      delete data.groups[groupId];
      Object.values(data.users || {}).forEach((u) => {
        if (Array.isArray(u.groups)) u.groups = u.groups.filter((id) => id !== groupId);
      });
      writeDb(data);
      return group;
    }
    return (async () => {
      const db = getFirestore();
      const groupRef = db.collection('groups').doc(groupId);
      const groupDoc = await groupRef.get();
      if (!groupDoc.exists) return null;
      const group = groupDoc.data();
      if (Array.isArray(group.bills)) {
        for (const bill of group.bills) {
          if (bill.sessionId) {
            await db.collection('sessions').doc(bill.sessionId).delete();
          }
        }
      }
      await groupRef.delete();
      const usersSnap = await db.collection('users').get();
      for (const doc of usersSnap.docs) {
        const user = doc.data();
        if (Array.isArray(user.groups)) {
          const filtered = user.groups.filter((id) => id !== groupId);
          if (filtered.length !== user.groups.length) {
            await db.collection('users').doc(doc.id).update({ groups: filtered });
          }
        }
      }
      return group;
    })();
  },

  deleteGroupBill(groupId, billId) {
    if (isTesting) {
      const data = readDb();
      if (!data.groups || !data.groups[groupId]) return null;
      const group = data.groups[groupId];
      if (!Array.isArray(group.bills)) return null;
      const bill = group.bills.find((b) => b.id === billId);
      if (!bill) return null;
      group.bills = group.bills.filter((b) => b.id !== billId);
      if (bill.sessionId && data.sessions) delete data.sessions[bill.sessionId];
      group.updatedAt = Date.now();
      writeDb(data);
      return group;
    }
    return (async () => {
      const db = getFirestore();
      const groupRef = db.collection('groups').doc(groupId);
      const doc = await groupRef.get();
      if (!doc.exists) return null;
      const group = doc.data();
      if (!Array.isArray(group.bills)) return null;
      const bill = group.bills.find((b) => b.id === billId);
      if (!bill) return null;
      group.bills = group.bills.filter((b) => b.id !== billId);
      if (bill.sessionId) {
        await db.collection('sessions').doc(bill.sessionId).delete();
      }
      group.updatedAt = Date.now();
      await groupRef.set(group, { merge: true });
      return group;
    })();
  }
};

module.exports = db;
module.exports.db = db;
module.exports.default = db;
module.exports.__esModule = true;
