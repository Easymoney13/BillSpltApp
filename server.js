process.on('uncaughtException', (err) => {
  console.error('Fatal uncaught exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Fatal unhandled rejection:', reason);
  process.exit(1);
});

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const next = require('next');

const dbModule = require('./lib/db');
const db = dbModule.db || dbModule.default || dbModule;

const geminiModule = require('./lib/gemini');
const parseReceiptImage = geminiModule.parseReceiptImage || geminiModule.default?.parseReceiptImage;
const parseReceiptTextWithGemini = geminiModule.parseReceiptTextWithGemini || geminiModule.default?.parseReceiptTextWithGemini;

const security = require('./lib/security');
const debtMinimizer = require('./lib/debtMinimizer');
const calculateDebtMinimization = debtMinimizer.calculateDebtMinimization;
const splitCents = debtMinimizer.splitCents;
const toCents = debtMinimizer.toCents;
const { createEntityId } = require('./lib/ids');
const { ValidationError, validateItems, validateReceiptBody } = require('./lib/validation');
const { processSessionAction } = require('./lib/sessionActions');
const {
  createRoomMember,
  findRoomMember,
  deduplicateRoomMembers,
  getRequestRoomToken,
  joinRoom,
  publicRoom,
} = require('./lib/roomAuth');
const { broadcastToRoom, subscribeClient } = require('./lib/realtimeRooms');
const { reconcileReceipt } = require('./lib/receiptMath');
const { processGroupBillAction } = require('./lib/groupActions');
const { trackAnalyticsEvent } = require('./lib/analytics');

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
const fullServiceAccountPath = path.resolve(process.cwd(), serviceAccountPath);

if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID || 'easysplit-24576',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
    console.log('✅ Firebase Admin SDK initialized successfully with Environment Variables.');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin with Environment Variables:', err.message);
  }
} else if (fs.existsSync(fullServiceAccountPath)) {
  try {
    const serviceAccount = require(fullServiceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized successfully with Service Account Key.');
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin with service account key:', err.message);
  }
} else {
  try {
    admin.initializeApp({
      projectId: 'easysplit-24576'
    });
    console.warn(`⚠️ Firebase Admin initialized with PROJECT_ID only. Verification will fail unless credentials are provided via environment variables or JSON file at: ${fullServiceAccountPath}`);
  } catch (err) {
    console.error('❌ Failed to initialize Firebase Admin fallback:', err.message);
  }
}

// Initialize Firestore database migration from local db.json if needed
if (typeof db.migrateLocalDbToFirestore === 'function') {
  db.migrateLocalDbToFirestore();
}

// Middleware to verify Firebase ID token in Authorization header
async function authenticateUser(req, res, nextMiddleware) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return nextMiddleware();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    nextMiddleware();
  } catch (err) {
    console.warn('⚠️ Invalid or expired Firebase ID token:', err.message);
    req.user = null;
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = process.env.PORT || 3000;

function getLocalNetworkIp() {
  try {
    const interfaces = require('os').networkInterfaces();
    for (const entries of Object.values(interfaces)) {
      for (const iface of entries || []) {
        if (iface.family === 'IPv4' && !iface.internal) return iface.address;
      }
    }
  } catch (err) {
    console.warn('Local network address is unavailable; using localhost.');
  }
  return 'localhost';
}

app.prepare().then(() => {
  const server = express();
  const httpServer = http.createServer(server);
  const wss = new WebSocket.Server({ noServer: true, maxPayload: 10_000 });

  httpServer.on('upgrade', (request, socket, head) => {
    if (request.url && !request.url.startsWith('/_next')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  server.use(express.json({ limit: '15mb' }));

  // 🛡️ Enterprise Security Headers Middleware
  server.use((req, res, nextMiddleware) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    nextMiddleware();
  });

  // 🛡️ Pass-through API Middleware
  server.use('/api/', (req, res, nextMiddleware) => {
    nextMiddleware();
  });

  function sendToRoom(type, id, payload) {
    broadcastToRoom(wss.clients, type, id, payload, WebSocket.OPEN);
  }

  function publicGroupWithDebt(group) {
    const cleanGroup = deduplicateRoomMembers(group);
    const debtData = calculateDebtMinimization(cleanGroup);
    return publicRoom({
      ...cleanGroup,
      balances: debtData.balances,
      minimizedTransactions: debtData.transactions,
      unassignedAmount: debtData.unassignedAmount || 0,
      isBalanced: debtData.isBalanced !== false,
    });
  }

  function authorizedRoomMember(req, room) {
    const found = findRoomMember(room, {
      uid: req.user?.uid,
      accessToken: getRequestRoomToken(req),
      name: req.user?.name || req.body?.name || req.body?.payload?.name,
    });
    if (found) return found;
    const reqMemberId = req.body?.payload?.memberId || req.body?.memberId;
    if (reqMemberId && Array.isArray(room?.members)) {
      const byId = room.members.find((m) => m.id === reqMemberId && m.active !== false);
      if (byId) return byId;
    }
    if (Array.isArray(room?.members) && room.members.length === 1 && room.members[0].active !== false) {
      return room.members[0];
    }
    return null;
  }

  function sendRouteError(res, err, fallbackMessage) {
    const status = Number.isInteger(err?.statusCode) ? err.statusCode : 500;
    if (status >= 500) console.error(fallbackMessage, err);
    return res.status(status).json({ error: status >= 500 ? fallbackMessage : err.message });
  }

  global.broadcastSessionState = async function (sessionId) {
    const session = await db.getSession(sessionId);
    if (!session) return;

    sendToRoom('session', session.id, {
      type: 'SESSION_UPDATE',
      session: publicRoom(session),
    });
  };

  global.broadcastGroupState = async function (groupId) {
    const group = await db.getGroup(groupId);
    if (!group) return;

    sendToRoom('group', group.id, {
      type: 'GROUP_UPDATE',
      group: publicGroupWithDebt(group),
    });
  };

  const avatarColors = ['#A3E635', '#38BDF8', '#F472B6', '#A78BFA', '#FBBF24', '#34D399'];
  function getRandomAvatarColor() {
    return avatarColors[Math.floor(Math.random() * avatarColors.length)];
  }

  const ocrRateBuckets = new Map();
  function ocrRateLimit(req, res, nextMiddleware) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = ocrRateBuckets.get(key);
    const bucket = !existing || now - existing.startedAt > 10 * 60 * 1000
      ? { startedAt: now, count: 0 }
      : existing;
    bucket.count += 1;
    ocrRateBuckets.set(key, bucket);
    if (ocrRateBuckets.size > 1000) {
      for (const [bucketKey, value] of ocrRateBuckets) {
        if (now - value.startedAt > 10 * 60 * 1000) ocrRateBuckets.delete(bucketKey);
      }
    }
    if (bucket.count > 10) {
      return res.status(429).json({ error: 'Too many receipt scans. Please wait a few minutes and try again.' });
    }
    return nextMiddleware();
  }

  async function parseReceiptRequest(req) {
    const {
      imageBase64,
      mimeType,
      parsedBill: clientParsed,
      customGeminiKey,
      rawText,
    } = validateReceiptBody(req.body);

    let parsedReceipt = null;
    if (rawText) {
      parsedReceipt = await parseReceiptTextWithGemini(rawText, customGeminiKey);
    } else if (imageBase64) {
      parsedReceipt = await parseReceiptImage(imageBase64, mimeType, customGeminiKey);
    }

    if ((!parsedReceipt?.items?.length) && clientParsed?.items?.length) parsedReceipt = clientParsed;
    if (!parsedReceipt?.items?.length) return null;

    const items = validateItems(parsedReceipt.items).map((item) => ({
      ...item,
      id: createEntityId('item'),
      claimedBy: [],
    }));
    const receipt = {
      storeName: security.sanitizeString(parsedReceipt.storeName || 'Scanned Receipt', 80),
      date: security.sanitizeString(parsedReceipt.date || new Date().toISOString().split('T')[0], 20),
      currency: security.sanitizeString(parsedReceipt.currency || 'NIS', 5).toUpperCase(),
      receiptTotal: parsedReceipt.receiptTotal ?? parsedReceipt.total ?? null,
      subtotal: parsedReceipt.subtotal ?? null,
      tax: parsedReceipt.tax ?? null,
      service: parsedReceipt.service ?? null,
      discount: parsedReceipt.discount ?? null,
      items,
    };
    receipt.reconciliation = reconcileReceipt(receipt);
    return receipt;
  }

  function getOcrSource(body) {
    if (body?.imageBase64) return 'server-image';
    if (body?.rawText) return 'client-raw-text';
    if (body?.parsedBill) return 'client-parsed';
    return 'unknown';
  }

  // REST API Routes

  // Parse a receipt and create a private real-time session.
  server.post('/api/receipt/parse', authenticateUser, ocrRateLimit, async (req, res) => {
    const startedAt = Date.now();
    const ocrSource = getOcrSource(req.body);
    void trackAnalyticsEvent('ocr_scan_started', {
      userId: req.user?.uid,
      metadata: { route: '/api/receipt/parse', ocrSource },
    });
    try {
      const receipt = await parseReceiptRequest(req);
      if (!receipt) {
        void trackAnalyticsEvent('ocr_scan_failed', {
          userId: req.user?.uid,
          metadata: {
            route: '/api/receipt/parse', ocrSource, outcome: 'not-readable',
            durationMs: Date.now() - startedAt, httpStatus: 400,
          },
        });
        return res.status(400).json({
          success: false,
          isNotBill: true,
          error: 'No readable receipt items and prices were detected.',
        });
      }
      void trackAnalyticsEvent('ocr_scan_succeeded', {
        userId: req.user?.uid,
        metadata: {
          route: '/api/receipt/parse', ocrSource, durationMs: Date.now() - startedAt,
          itemCount: receipt.items.length,
          reconciliationStatus: receipt.reconciliation?.status || 'unknown',
        },
      });
      return res.json({ success: true, receipt });
    } catch (err) {
      void trackAnalyticsEvent('ocr_scan_failed', {
        userId: req.user?.uid,
        metadata: {
          route: '/api/receipt/parse', ocrSource, outcome: 'error',
          durationMs: Date.now() - startedAt, httpStatus: err?.statusCode || 500,
          errorCode: err?.name || 'parse_error',
        },
      });
      return sendRouteError(res, err, 'Failed to parse receipt');
    }
  });

  server.post('/api/receipt/scan', authenticateUser, ocrRateLimit, async (req, res) => {
    const startedAt = Date.now();
    const ocrSource = getOcrSource(req.body);
    void trackAnalyticsEvent('ocr_scan_started', {
      userId: req.user?.uid,
      metadata: { route: '/api/receipt/scan', ocrSource },
    });
    try {
      const parsedReceipt = await parseReceiptRequest(req);
      if (!parsedReceipt) {
        void trackAnalyticsEvent('ocr_scan_failed', {
          userId: req.user?.uid,
          metadata: {
            route: '/api/receipt/scan', ocrSource, outcome: 'not-readable',
            durationMs: Date.now() - startedAt, httpStatus: 400,
          },
        });
        return res.status(400).json({
          success: false,
          isNotBill: true,
          error: "No receipt items or prices were detected in this image. Please upload or take a clear photo of a physical bill or receipt."
        });
      }

      const rawHostName = req.body?.hostName || (req.user ? req.user.name : 'Host');
      const host = createRoomMember({
        uid: req.user?.uid,
        name: rawHostName,
        isHost: true,
        avatarColor: '#A3E635',
      });

      const newSession = {
        id: createEntityId('sess'),
        code: await db.generateUniqueRoomCode(),
        storeName: security.sanitizeString(parsedReceipt.storeName || 'Scanned Receipt', 40),
        date: parsedReceipt.date || new Date().toISOString().split('T')[0],
        currency: security.sanitizeString(parsedReceipt.currency || 'NIS', 5),
        receiptTotal: parsedReceipt.receiptTotal,
        subtotal: parsedReceipt.subtotal,
        tax: parsedReceipt.tax,
        service: parsedReceipt.service,
        discount: parsedReceipt.discount,
        reconciliation: parsedReceipt.reconciliation,
        hostPhone: '',
        status: 'active',
        createdAt: Date.now(),
        members: [host.member],
        items: parsedReceipt.items,
      };

      await db.saveSession(newSession);

      const commonAnalyticsContext = {
        userId: req.user?.uid,
        sessionId: newSession.id,
        metadata: {
          route: '/api/receipt/scan', ocrSource, durationMs: Date.now() - startedAt,
          itemCount: newSession.items.length,
          memberCount: newSession.members.length,
          currency: newSession.currency,
          reconciliationStatus: newSession.reconciliation?.status || 'unknown',
        },
      };
      void trackAnalyticsEvent('ocr_scan_succeeded', commonAnalyticsContext);
      void trackAnalyticsEvent('session_created', commonAnalyticsContext);

      return res.json({
        success: true,
        sessionId: newSession.id,
        code: newSession.code,
        hostId: host.member.id,
        memberId: host.member.id,
        accessToken: host.accessToken,
        session: publicRoom(newSession),
      });
    } catch (err) {
      void trackAnalyticsEvent('ocr_scan_failed', {
        userId: req.user?.uid,
        metadata: {
          route: '/api/receipt/scan', ocrSource, outcome: 'error',
          durationMs: Date.now() - startedAt, httpStatus: err?.statusCode || 500,
          errorCode: err?.name || 'scan_error',
        },
      });
      return sendRouteError(res, err, 'Failed to parse receipt');
    }
  });

  server.get('/api/session/:idOrCode', async (req, res) => {
    const sanitizedId = security.sanitizeString(req.params.idOrCode, 50);
    const session = await db.getSession(sanitizedId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    return res.json({ session: publicRoom(session) });
  });

  server.post('/api/session/:idOrCode/join', authenticateUser, async (req, res) => {
    try {
      const session = await db.getSession(security.sanitizeString(req.params.idOrCode, 100));
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status === 'settled') return res.status(409).json({ error: 'This session is already closed' });

      const joined = joinRoom(session, {
        uid: req.user?.uid,
        accessToken: getRequestRoomToken(req),
        name: req.body?.name || req.user?.name || 'Guest',
        avatarColor: getRandomAvatarColor(),
      });
      if (joined.changed) await db.saveSession(session);
      if (joined.changed) {
        void trackAnalyticsEvent('participant_joined', {
          userId: req.user?.uid,
          sessionId: session.id,
          metadata: { memberCount: session.members.length },
        });
      }
      global.broadcastSessionState(session.id);
      return res.json({
        success: true,
        memberId: joined.member.id,
        accessToken: joined.accessToken,
        session: publicRoom(session),
      });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to join session');
    }
  });

  server.post('/api/session/action', authenticateUser, async (req, res) => {
    try {
      const { sessionId, action, payload } = req.body || {};
      const session = await db.getSession(security.sanitizeString(sessionId, 100));
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const actor = authorizedRoomMember(req, session);
      if (!actor) return res.status(401).json({ error: 'A valid room membership is required' });

      const updated = processSessionAction(session, action, payload, {
        uid: req.user?.uid,
        memberId: actor.id,
      });
      if (['ADD_ITEM', 'EDIT_ITEM', 'DELETE_ITEM'].includes(action) && updated.reconciliation) {
        updated.reconciliation = reconcileReceipt(updated);
      }

      const linkedGroup = updated.groupId ? await db.getGroup(updated.groupId) : null;
      const linkedBill = linkedGroup?.bills?.find((bill) => bill.id === updated.billId || bill.sessionId === updated.id);
      if (linkedBill) {
        linkedBill.items = updated.items;
        linkedBill.amount = updated.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
        if (action === 'SET_PAYER' || updated.payerId) {
          linkedBill.payerId = updated.payerId;
        }
        if (action === 'SETTLE_ALL') {
          linkedBill.status = 'settled';
          linkedBill.settledAt = updated.settledAt;
        }
      }

      const publicSession = publicRoom(updated);
      const subtotal = updated.items.reduce((sum, item) => sum + Number(item.price || 0), 0);
      const totalAmount = Math.round(subtotal * (1 + Number(updated.tipPercentage || 0) / 100) * 100) / 100;
      const historyItem = {
        id: updated.id,
        storeName: updated.storeName || 'Bill Session',
        date: updated.date || new Date().toISOString().split('T')[0],
        currency: updated.currency || 'NIS',
        totalAmount,
        membersCount: updated.members?.length || 1,
        members: publicSession.members || [],
        items: publicSession.items || [],
        tipPercentage: updated.tipPercentage || 0,
        settledAt: updated.settledAt || Date.now(),
        createdAt: updated.createdAt || Date.now(),
        ...(updated.groupId ? { groupId: updated.groupId } : {}),
        ...(updated.payerId ? { payerId: updated.payerId } : {}),
      };

      if (action === 'SETTLE_ALL') {
        if (linkedGroup && linkedBill) {
          await db.saveGroupAndSession(linkedGroup, updated);
          await db.addToHistory(historyItem);
        } else {
          await db.saveSessionAndHistory(updated, historyItem);
        }
      } else if (action === 'TOGGLE_SETTLED' && payload.settled === true) {
        if (linkedGroup && linkedBill) {
          await db.saveGroupAndSession(linkedGroup, updated);
          await db.addToHistory(historyItem);
        } else {
          await db.saveSessionAndHistory(updated, historyItem);
        }
      } else if (linkedGroup && linkedBill) {
        await db.saveGroupAndSession(linkedGroup, updated);
      } else {
        await db.saveSession(updated);
      }

      if (linkedGroup && linkedBill) global.broadcastGroupState(linkedGroup.id);

      global.broadcastSessionState(updated.id);

      const actionEventMap = {
        TOGGLE_CLAIM: 'item_claim_toggled',
        SPLIT_EVERYONE: 'items_split_everyone',
        ADD_ITEM: 'receipt_corrected',
        EDIT_ITEM: 'receipt_corrected',
        DELETE_ITEM: 'receipt_corrected',
        SET_TIP: 'tip_selected',
        SET_PAYER: 'payer_selected',
        TOGGLE_SETTLED: 'member_settled_toggled',
        SETTLE_ALL: 'session_completed',
      };
      const eventType = actionEventMap[action];
      if (eventType) {
        const actionItem = payload?.itemId ? updated.items.find((item) => item.id === payload.itemId) : null;
        void trackAnalyticsEvent(eventType, {
          userId: req.user?.uid,
          sessionId: updated.id,
          metadata: {
            action,
            amount: Math.round(subtotal * (1 + Number(updated.tipPercentage || 0) / 100) * 100) / 100,
            category: actionItem?.category,
            correctionKind: ['ADD_ITEM', 'EDIT_ITEM', 'DELETE_ITEM'].includes(action) ? action.toLowerCase() : undefined,
            currency: updated.currency,
            durationMs: action === 'SETTLE_ALL' ? Math.max(0, Number(updated.settledAt || Date.now()) - Number(updated.createdAt || Date.now())) : undefined,
            itemCount: updated.items.length,
            memberCount: updated.members.length,
            tipPercentage: updated.tipPercentage || 0,
          },
        });
      }
      return res.json({ success: true, session: publicRoom(updated) });
    } catch (err) {
      void trackAnalyticsEvent('product_error', {
        userId: req.user?.uid,
        sessionId: req.body?.sessionId,
        metadata: {
          route: '/api/session/action', action: req.body?.action,
          httpStatus: err?.statusCode || 500, errorCode: err?.name || 'session_action_error',
        },
      });
      return sendRouteError(res, err, 'Failed to update session');
    }
  });



  // GROUPS API ENDPOINTS

  // 1. Create Group
  server.post('/api/groups', authenticateUser, async (req, res) => {
    try {
      const { name, currency, hostName } = req.body;
      const cleanName = security.sanitizeString(name || 'Trip Group', 40);
      const rawHostName = hostName || (req.user ? req.user.name : 'Host');
      const host = createRoomMember({
        uid: req.user?.uid,
        name: rawHostName,
        isHost: true,
        avatarColor: '#A3E635',
      });

      const newGroup = {
        id: createEntityId('grp'),
        code: await db.generateUniqueRoomCode(),
        name: cleanName,
        currency: security.sanitizeString(currency || 'NIS', 5),
        createdAt: Date.now(),
        members: [host.member],
        bills: []
      };

      await db.saveGroup(newGroup);

      return res.json({
        success: true,
        groupId: newGroup.id,
        code: newGroup.code,
        hostId: host.member.id,
        memberId: host.member.id,
        accessToken: host.accessToken,
        group: publicGroupWithDebt(newGroup),
      });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to create group');
    }
  });

  // 2. Fetch Group by ID or 4-digit Code
  server.get('/api/groups/:idOrCode', async (req, res) => {
    const sanitizedId = security.sanitizeString(req.params.idOrCode, 50);
    const group = await db.getGroup(sanitizedId);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    return res.json({ group: publicGroupWithDebt(group) });
  });

  // 3. Join Group by Code
  server.post('/api/groups/join', authenticateUser, async (req, res) => {
    try {
      const { groupId, name } = req.body;
      const group = await db.getGroup(groupId);
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }

      const joined = joinRoom(group, {
        uid: req.user?.uid,
        accessToken: getRequestRoomToken(req),
        name: name || req.user?.name || 'Member',
        avatarColor: getRandomAvatarColor(),
      });
      if (joined.changed) await db.saveGroup(group);
      global.broadcastGroupState(group.id);

      return res.json({
        success: true,
        memberId: joined.member.id,
        accessToken: joined.accessToken,
        group: publicGroupWithDebt(group),
      });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to join group');
    }
  });

  server.post('/api/groups/:groupId/leave', authenticateUser, async (req, res) => {
    try {
      const group = await db.getGroup(security.sanitizeString(req.params.groupId, 100));
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const actor = authorizedRoomMember(req, group) || (group.members || []).find((m) => m.id === req.body?.memberId || m.name === req.user?.name);
      const targetMemberId = actor?.id || req.body?.memberId;
      if (!targetMemberId) return res.status(401).json({ error: 'A valid group membership is required' });
      
      const updated = await db.leaveGroup(group.id, targetMemberId);
      if (updated) {
        global.broadcastGroupState(group.id);
      }
      return res.json({ success: true, group: updated ? publicGroupWithDebt(updated) : null });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to leave group');
    }
  });

  server.delete('/api/groups/:groupId', authenticateUser, async (req, res) => {
    try {
      const group = await db.getGroup(security.sanitizeString(req.params.groupId, 100));
      if (!group) return res.status(404).json({ error: 'Group not found' });
      await db.deleteGroup(group.id);
      sendToRoom('group', group.id, { type: 'GROUP_DELETED', groupId: group.id });
      return res.json({ success: true });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to delete group');
    }
  });

  // 4. Add or Edit Bill in Group
  server.post('/api/groups/bill', authenticateUser, async (req, res) => {
    try {
      const { groupId, bill } = req.body;
      const group = await db.getGroup(security.sanitizeString(groupId, 100));
      if (!group) {
        return res.status(404).json({ error: 'Group not found' });
      }
      const actor = authorizedRoomMember(req, group);
      if (!actor) return res.status(401).json({ error: 'A valid group membership is required' });
      if (!bill || typeof bill !== 'object' || Array.isArray(bill)) {
        throw new ValidationError('A bill is required');
      }
      const billCurrency = security.sanitizeString(bill.currency || group.currency || 'NIS', 5).toUpperCase();
      const groupCurrency = security.sanitizeString(group.currency || 'NIS', 5).toUpperCase();
      if (billCurrency !== groupCurrency) {
        throw new ValidationError(`This group uses ${groupCurrency}. Convert the bill before adding a ${billCurrency} expense.`);
      }

      if (!Array.isArray(group.bills)) group.bills = [];

      const cleanTitle = security.sanitizeString(bill.title || 'Group Expense', 50);
      const groupHost = group.members.find((member) => member.isHost && member.active !== false)
        || group.members.find((member) => member.active !== false);
      const cleanPayerId = bill.payerId || groupHost?.id;
      if (!group.members.some((member) => member.id === cleanPayerId && member.active !== false)) {
        throw new ValidationError('The selected payer is not an active group member');
      }
      const billDate = security.sanitizeString(bill.date || new Date().toISOString().split('T')[0], 20);

      const memberIds = new Set(
        group.members.filter((member) => member.active !== false).map((member) => member.id)
      );
      const cleanItems = validateItems(Array.isArray(bill.items) ? bill.items : [], { allowEmpty: true })
        .map((item) => ({
          ...item,
          id: item.id || createEntityId('item'),
          claimedBy: item.claimedBy.filter((memberId) => memberIds.has(memberId)),
        }));

      const billId = bill.id || createEntityId('bill');
      const existingIdx = group.bills.findIndex((candidate) => candidate.id === billId);
      const existingBill = existingIdx > -1 ? group.bills[existingIdx] : null;
      if (existingBill?.status === 'settled') {
        return res.status(409).json({ error: 'A settled bill cannot be edited' });
      }
      if (existingBill && !actor.isHost && existingBill.createdByMemberId !== actor.id) {
        return res.status(403).json({ error: 'Only the bill creator or group host can edit this bill' });
      }
      const sourceSessionId = security.sanitizeString(bill.sourceSessionId || '', 100);
      const sourceSession = sourceSessionId ? await db.getSession(sourceSessionId) : null;
      if (sourceSessionId) {
        const sourceMember = sourceSession ? findRoomMember(sourceSession, {
          uid: req.user?.uid,
          accessToken: typeof bill.sourceSessionToken === 'string' ? bill.sourceSessionToken : '',
        }) : null;
        if (!sourceSession || !sourceMember?.isHost) {
          return res.status(403).json({ error: 'Only the source session host can attach this bill' });
        }
        if (sourceSession.status === 'settled') {
          return res.status(409).json({ error: 'A settled session cannot be attached or edited' });
        }
        if (sourceSession.groupId && (
          sourceSession.groupId !== group.id
          || (sourceSession.billId && sourceSession.billId !== billId)
        )) {
          return res.status(409).json({ error: 'This session is already attached to another group bill' });
        }
      }
      const sessionId = sourceSession?.id || existingBill?.sessionId || ('sess_g_' + billId);
      const itemsTotal = cleanItems.reduce((sum, item) => sum + item.price, 0);
      const requestedAmount = security.sanitizePrice(bill.amount);
      const cleanAmount = itemsTotal > 0 ? itemsTotal : requestedAmount;
      if (cleanAmount <= 0) throw new ValidationError('Bill amount must be greater than zero');
      const newBillRecord = {
        id: billId,
        sessionId,
        title: cleanTitle,
        date: billDate,
        amount: cleanAmount,
        payerId: cleanPayerId,
        items: cleanItems,
        currency: groupCurrency,
        createdByMemberId: existingBill?.createdByMemberId || actor.id,
        createdAt: existingBill?.createdAt || Date.now(),
        status: existingBill?.status || 'active',
      };

      if (existingIdx > -1) {
        group.bills[existingIdx] = newBillRecord;
      } else {
        group.bills.unshift(newBillRecord);
      }

      const existingSession = await db.getSession(sessionId);
      const liveSession = {
        id: sessionId,
        groupId: group.id,
        billId,
        code: existingSession?.code || await db.generateUniqueRoomCode(),
        storeName: cleanTitle,
        date: billDate,
        currency: group.currency || 'NIS',
        hostPhone: groupHost?.phone || '',
        status: 'active',
        members: group.members.map(m => ({
          id: m.id,
          name: m.name,
          phone: m.phone || '',
          isHost: m.isHost || false,
          settled: false,
          avatarColor: m.avatarColor || '#A3E635',
          accessTokenHash: m.accessTokenHash,
          active: m.active !== false,
        })),
        items: cleanItems,
        createdAt: existingSession?.createdAt || Date.now(),
      };
      await db.saveGroupAndSession(group, liveSession);

      if (global.broadcastGroupState) {
        global.broadcastGroupState(group.id);
      }

      return res.json({
        success: true,
        sessionId,
        billId,
        group: publicGroupWithDebt(group),
      });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to save group bill');
    }
  });

  server.post('/api/groups/bill/action', authenticateUser, async (req, res) => {
    try {
      const group = await db.getGroup(security.sanitizeString(req.body?.groupId, 100));
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const actor = authorizedRoomMember(req, group);
      if (!actor) return res.status(401).json({ error: 'A valid group membership is required' });
      const updated = processGroupBillAction(group, req.body?.action, req.body?.payload, actor);
      const bill = updated.bills.find((candidate) => candidate.id === req.body.payload.billId);
      const liveSession = bill?.sessionId ? await db.getSession(bill.sessionId) : null;
      if (liveSession) {
        liveSession.items = bill.items;
        await db.saveGroupAndSession(updated, liveSession);
        global.broadcastSessionState(liveSession.id);
      } else {
        await db.saveGroup(updated);
      }
      global.broadcastGroupState(updated.id);
      return res.json({ success: true, group: publicGroupWithDebt(updated) });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to update group bill');
    }
  });

  // Real-Time Currency Exchange Rates API
  let cachedRates = null;
  let lastRatesFetchTime = 0;

  server.get('/api/exchange-rates', async (req, res) => {
    try {
      const now = Date.now();
      if (cachedRates && now - lastRatesFetchTime < 30 * 60 * 1000) {
        return res.json({ success: true, rates: cachedRates, source: 'cached' });
      }

      const apiRes = await fetch('https://open.er-api.com/v6/latest/USD');
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data && data.rates) {
          const usdToNis = data.rates.ILS || 3.65;
          cachedRates = {
            ...data.rates,
            USD: 1.0,
            NIS: usdToNis,
            ILS: usdToNis,
            EUR: data.rates.EUR || 0.92,
            GBP: data.rates.GBP || 0.78
          };
          lastRatesFetchTime = now;
          console.log(`⚡ Live currency exchange rates updated: 1 USD = ${usdToNis.toFixed(2)} NIS, 1 GBP = ${(usdToNis / cachedRates.GBP).toFixed(2)} NIS, 1 EUR = ${(usdToNis / cachedRates.EUR).toFixed(2)} NIS`);
          return res.json({ success: true, rates: cachedRates, source: 'live' });
        }
      }
    } catch (err) {
      console.error('Error fetching real-time exchange rates, using fallback:', err.message);
    }

    const fallbackRates = {
      USD: 1.0,
      NIS: 3.65,
      ILS: 3.65,
      EUR: 0.92,
      GBP: 0.78
    };
    return res.json({ success: true, rates: cachedRates || fallbackRates, source: 'fallback' });
  });

  function isUserMember(memberList, userName, phone, userId) {
    if (!Array.isArray(memberList) || memberList.length === 0) return false;
    const cleanName = (userName || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (userId) {
      const match = memberList.some((member) => (member.id === userId || member.userId === userId || member.uid === userId) && member.active !== false);
      if (match) return true;
    }
    return memberList.some((member) => {
      if (member.active === false) return false;
      if (cleanName && (member.name || '').trim().toLowerCase() === cleanName) return true;
      if (cleanPhone && (member.phone || '').replace(/\D/g, '') === cleanPhone) return true;
      return false;
    });
  }

  function getUserMember(memberList, userName, phone, userId) {
    if (!Array.isArray(memberList) || memberList.length === 0) return null;
    const cleanName = (userName || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/\D/g, '');
    if (userId) {
      const match = memberList.find((member) => (member.id === userId || member.userId === userId || member.uid === userId) && member.active !== false);
      if (match) return match;
    }
    return memberList.find((member) => {
      if (member.active === false) return false;
      if (cleanName && (member.name || '').trim().toLowerCase() === cleanName) return true;
      if (cleanPhone && (member.phone || '').replace(/\D/g, '') === cleanPhone) return true;
      return false;
    }) || null;
  }

  function calculateUserShareForSession(itemsList, memberList, userId, userName, phone, tipPercentage = 0) {
    const items = Array.isArray(itemsList) ? itemsList : [];
    const members = Array.isArray(memberList) ? memberList : [];
    if (items.length === 0 || members.length === 0) return 0;

    const targetMember = userId ? members.find((member) => member.id === userId) : null;
    if (!targetMember) return 0;
    const validMemberIds = new Set(members.map((member) => member.id));
    let shareCents = 0;
    items.forEach((item) => {
      const claimantIds = [...new Set(
        (Array.isArray(item.claimedBy) ? item.claimedBy : []).filter((id) => validMemberIds.has(id))
      )];
      const targetShare = splitCents(toCents(item.price), claimantIds)
        .find((share) => share.memberId === targetMember.id);
      shareCents += targetShare?.cents || 0;
    });
    return Math.round(shareCents * (1 + Number(tipPercentage || 0) / 100)) / 100;
  }

  // POST /api/user/sync - Synchronize/register user account & settings
  server.post('/api/user/sync', authenticateUser, async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }

      const { uid, name, picture } = req.user;
      const { username, settings } = req.body;
      const finalName = username || name || 'User';

      const user = await db.findOrCreateUser(uid, finalName, '', settings || {});

      // Sync avatar URL from Google if available
      if (picture && user.avatarUrl !== picture) {
        user.avatarUrl = picture;
        await db.saveUser(user);
      }

      void trackAnalyticsEvent('user_synced', {
        userId: uid,
        metadata: { route: '/api/user/sync' },
      });

      return res.json({ success: true, user });
    } catch (err) {
      console.error('Error syncing user:', err);
      return res.status(500).json({ error: 'Failed to sync user' });
    }
  });

  // GET /api/user/groups - Get active groups for a specific user
  server.get('/api/user/groups', authenticateUser, async (req, res) => {
    try {
      let uid = null;
      let userName = '';
      let phone = '';

      if (req.user) {
        uid = req.user.uid;
        const user = await db.getUserByUid(uid);
        userName = user ? user.username : '';
        phone = user ? user.phone : '';
      } else {
        userName = security.sanitizeString(req.query.userName || '', 50);
        phone = security.sanitizeString(req.query.phone || '', 20);
      }

      const allGroups = Object.values(await db.getAllGroups() || {});
      const userGroups = allGroups.filter((g) => isUserMember(g.members, userName, phone, uid));

      return res.json({
        success: true,
        groups: userGroups.map((g) => ({
          id: g.id,
          code: g.code,
          name: g.name,
          currency: g.currency,
          membersCount: g.members ? g.members.length : 0
        }))
      });
    } catch (err) {
      console.error('Error fetching user groups:', err);
      return res.status(500).json({ error: 'Failed to fetch user groups' });
    }
  });

  // GET /api/history - Get user payments (strictly isolated by user identity)
  server.get('/api/history', authenticateUser, async (req, res) => {
    try {
      let uid = null;
      let userName = '';
      let phone = '';
      let hiddenHistoryIds = new Set();

      if (req.user) {
        uid = req.user.uid;
        const user = await db.getUserByUid(uid);
        userName = user ? user.username : '';
        phone = user ? user.phone : '';
        hiddenHistoryIds = new Set(Array.isArray(user?.hiddenHistoryIds) ? user.hiddenHistoryIds : []);
      } else {
        userName = security.sanitizeString(req.query.userName || '', 50);
        phone = security.sanitizeString(req.query.phone || '', 20);
      }

      const standaloneHistory = await db.getHistory() || [];
      const allGroups = Object.values(await db.getAllGroups() || {});
      const groupBillsHistory = [];

      // 1. Group Bills
      const userGroups = allGroups.filter((g) => isUserMember(g.members, userName, phone, uid));

      userGroups.forEach((group) => {
        if (Array.isArray(group.bills)) {
          const userMember = getUserMember(group.members, userName, phone, uid);
          const userId = userMember ? userMember.id : null;

          group.bills.forEach((bill) => {
            if (hiddenHistoryIds.has(bill.id)) return;
            const payerMember = Array.isArray(group.members)
              ? group.members.find((m) => m.id === bill.payerId || m.name === bill.payerId)
              : null;
            const payerName = bill.payerId === 'each'
              ? 'Each paid their own share'
              : (payerMember ? payerMember.name : (bill.payerId || 'Group Member'));

            let userShare = 0;
            const billItems = Array.isArray(bill.items) ? bill.items : [];
            if (billItems.length > 0 && userMember) {
              userShare = calculateUserShareForSession(billItems, group.members, userId, userName, phone);
            } else {
              const total = typeof bill.amount === 'number' ? bill.amount : parseFloat(bill.amount) || 0;
              userShare = total / (group.members.length || 1);
            }

            groupBillsHistory.push({
              id: bill.id || `group_bill_${Date.now()}_${Math.random()}`,
              storeName: bill.title || 'Group Bill',
              date: bill.date || new Date().toISOString().split('T')[0],
              totalAmount: typeof bill.amount === 'number' ? bill.amount : parseFloat(bill.amount) || 0,
              userShare: Math.round(userShare * 100) / 100,
              currency: bill.currency || group.currency || 'NIS',
              membersCount: group.members ? group.members.length : 2,
              isGroupBill: true,
              groupName: group.name,
              groupId: group.id,
              payerName: payerName,
              sessionId: bill.sessionId || `sess_g_${bill.id}`
            });
          });
        }
      });

      // 2. Standalone Session History
      const processedStandalone = [];

      for (const histItem of standaloneHistory) {
        if (hiddenHistoryIds.has(histItem.id)) continue;

        const liveSession = await db.getSession(histItem.id);

        const effectiveMembers = (liveSession && Array.isArray(liveSession.members) && liveSession.members.length > 0)
          ? liveSession.members
          : (Array.isArray(histItem.members) ? histItem.members : []);

        const effectiveItems = (liveSession && Array.isArray(liveSession.items) && liveSession.items.length > 0)
          ? liveSession.items
          : (Array.isArray(histItem.items) ? histItem.items : []);

        const isMember = isUserMember(effectiveMembers, userName, phone, uid);
        if (!isMember) continue;

        let userShare = typeof histItem.totalAmount === 'number' ? histItem.totalAmount : parseFloat(histItem.totalAmount) || 0;

        if (effectiveMembers.length > 0) {
          const userMem = getUserMember(effectiveMembers, userName, phone, uid);
          if (effectiveItems.length > 0 && userMem) {
            userShare = calculateUserShareForSession(effectiveItems, effectiveMembers, userMem.id, userName, phone);
          } else {
            userShare = userShare / effectiveMembers.length;
          }
        }

        processedStandalone.push({
          ...histItem,
          membersCount: effectiveMembers.length > 0 ? effectiveMembers.length : (histItem.membersCount || 1),
          userShare: Math.round(userShare * 100) / 100
        });
      }

      const combinedHistory = [...processedStandalone, ...groupBillsHistory];
      combinedHistory.sort((a, b) => {
        const timeA = a.createdAt || (a.date ? new Date(a.date).getTime() : 0);
        const timeB = b.createdAt || (b.date ? new Date(b.date).getTime() : 0);
        return timeB - timeA;
      });

      return res.json({ success: true, history: combinedHistory });
    } catch (err) {
      console.error('Error fetching history:', err);
      return res.status(500).json({ error: 'Failed to fetch history' });
    }
  });

  server.delete('/api/history/:id', authenticateUser, async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Authentication required' });
      const id = security.sanitizeString(req.params.id, 100);
      const user = await db.hideHistoryForUser(req.user.uid, id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete history' });
    }
  });

  // 5. Delete Bill from Group
  server.delete('/api/groups/bill/:groupId/:billId', authenticateUser, async (req, res) => {
    try {
      const groupId = security.sanitizeString(req.params.groupId, 50);
      const billId = security.sanitizeString(req.params.billId, 50);
      const existingGroup = await db.getGroup(groupId);
      if (!existingGroup) return res.status(404).json({ error: 'Group not found' });
      const actor = authorizedRoomMember(req, existingGroup);
      if (!actor) return res.status(401).json({ error: 'A valid group membership is required' });
      const bill = existingGroup.bills?.find((candidate) => candidate.id === billId);
      if (!bill) return res.status(404).json({ error: 'Bill not found' });
      if (!actor.isHost && bill.createdByMemberId !== actor.id) {
        return res.status(403).json({ error: 'Only the bill creator or group host can delete this bill' });
      }

      const group = await db.deleteGroupBill(groupId, billId);
      if (!group) {
        return res.status(404).json({ error: 'Group or bill not found' });
      }
      if (global.broadcastGroupState) {
        global.broadcastGroupState(group.id);
      }

      return res.json({
        success: true,
        group: publicGroupWithDebt(group),
      });
    } catch (err) {
      return sendRouteError(res, err, 'Failed to delete group bill');
    }
  });

  wss.on('connection', (ws) => {
    ws.subscriptions = new Set();
    ws.on('error', (err) => {
      console.warn('⚠️ WebSocket client connection error:', err.message);
    });

    ws.on('message', async (message) => {
      try {
        if (message.length > 10_000) {
          ws.close(1009, 'Message too large');
          return;
        }
        const data = JSON.parse(message.toString());
        const { type, sessionId, groupId, accessToken } = data;

        if (type === 'SUBSCRIBE_GROUP' && groupId) {
          const group = await db.getGroup(groupId);
          const member = group ? findRoomMember(group, { accessToken }) : null;
          if (!group || !member) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid group subscription' }));
            return;
          }
          subscribeClient(ws, 'group', group.id);
          ws.send(JSON.stringify({ type: 'GROUP_UPDATE', group: publicGroupWithDebt(group) }));
          return;
        }

        if (!sessionId || !security.isValidSessionId(sessionId)) return;

        if (type === 'SUBSCRIBE') {
          const session = await db.getSession(sessionId);
          const member = session ? findRoomMember(session, { accessToken }) : null;
          if (!session || !member) {
            ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid session subscription' }));
            return;
          }
          subscribeClient(ws, 'session', session.id);
          ws.send(JSON.stringify({ type: 'SESSION_UPDATE', session: publicRoom(session) }));
          return;
        }

        if (type === 'ACTION') {
          ws.send(JSON.stringify({ type: 'ERROR', error: 'Actions must use the authenticated API' }));
        }
      } catch (err) {
        ws.send(JSON.stringify({ type: 'ERROR', error: 'Invalid WebSocket message' }));
      }
    });
  });

  server.get('/api/network-ip', (req, res) => {
    res.json({ ip: getLocalNetworkIp(), port: PORT });
  });

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, '0.0.0.0', (err) => {
    if (err) throw err;
    const localIp = getLocalNetworkIp();
    console.log(`> 🚀 BillSplit Unified Server ready:`);
    console.log(`  - Local PC: http://localhost:${PORT}`);
    console.log(`  - Phone/Wi-Fi: http://${localIp}:${PORT}`);
    console.log(`> ⚡ WebSockets running on ws://${localIp}:${PORT}`);
  });
});
