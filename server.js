/**
 * GOD'S WILL — Random Voice & Text Chat
 * Full-stack server: Express + Socket.IO (signaling + relay) + in-memory media store + admin API
 * Deploy target: Render (Web Service) / any Node host. See README.md
 */
'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Server } = require('socket.io');
const webpush = require('web-push');

/* ------------------------------------------------------------------ *
 * Config & persistence
 * ------------------------------------------------------------------ */
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const SUBS_FILE = path.join(DATA_DIR, 'push-subs.json');

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}

const DEFAULT_SETTINGS = {
  site: {
    name: "GOD'S WILL",
    shortName: 'GW',
    tagline: 'Talk to strangers by voice or text — free, anonymous, instant.',
    heroTitle: 'Talk to Strangers Online',
    heroHighlight: 'Chat by Voice or Text',
    about:
      "GOD'S WILL is a free random voice and text chat platform. No signup, no camera, no judgement — just press one button and start talking to real people from around the world. Built for clean, lag-free conversations with automatic background-noise removal, image sharing and voice notes.",
    badge: 'Free random voice & text chat — no signup needed',
    footerNote: 'No camera. No signup. Just your voice.',
    supportEmail: 'support@godswill.chat',
    facebook: '',
    instagram: '',
    reddit: '',
    x: '',
    announcementEnabled: true,
    announcement: 'Welcome to GOD\'S WILL 👋 Be respectful, report bad behaviour, and enjoy your chat!'
  },
  theme: {
    primary: '#6c5ce7',
    accent: '#00d4ff',
    primary2: '#8b7fff',
    mode: 'dark',
    radius: 18,
    glow: true,
    font: 'system',
    heroVisual: 'call',
    customCss: ''
  },
  features: {
    textChat: true,
    voiceCalls: true,
    images: true,
    voiceNotes: true,
    chatDuringCall: true,
    privateRooms: true,
    interests: true,
    reports: true,
    noiseFilterDefault: true,
    autoCompressImages: true,
    guestNicknames: true,
    typingIndicator: true,
    soundAlerts: true
  },
  limits: {
    maxOnline: 100,
    maxPerIp: 4,
    maxImageMB: 20,
    maxVoiceNoteMB: 20,
    maxVoiceNoteSec: 180,
    maxMsgLen: 2000,
    msgPerMinute: 40,
    uploadsPerMinute: 12,
    queueTimeoutSec: 300,
    cooldownSec: 3,
    fullMessage: 'All slots are busy right now 🙏 Please try again in a few minutes.',
    hdVoice: true,
    noiseGateDb: 9,
    offlineMessage: 'Stranger has left the chat.'
  },
  moderation: {
    profanityFilter: true,
    bannedWords: ['fuck', 'bitch', 'bastard', 'asshole', 'dick', 'slut', 'whore', 'porn', 'nude', 'sex chat', 'rape'],
    bannedIps: [],
    autoBanAfterReports: 0,
    allowLinks: true,
    linkWarning: 'Links are hidden for safety.'
  },
  security: {
    adminUser: 'admin',
    adminHash: null,
    sessionSecret: null,
    maintenance: false,
    maintenanceMessage: 'We are upgrading the servers right now. Please come back in a few minutes 🙏',
    sessionHours: 12
  },
  webrtc: {
    stun: 'stun:stun.l.google.com:19302',
    stun2: 'stun:stun1.l.google.com:19302',
    turnUrl: 'turn:openrelay.metered.ca:80',
    turnUser: 'openrelayproject',
    turnCred: 'openrelayproject',
    forceRelay: false
  },
  push: {
    enabled: true,
    vapidPublic: '',
    vapidPrivate: '',
    subject: 'mailto:admin@godswill.chat'
  }
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!patch || typeof patch !== 'object') return out;
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let saveTimer = null;

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      settings = deepMerge(settings, raw);
      console.log('[data] settings loaded from', SETTINGS_FILE);
      return;
    }
  } catch (e) {
    console.error('[data] settings load failed:', e.message);
  }
  // first run: seed secrets
  settings.security.sessionSecret = crypto.randomBytes(32).toString('hex');
  const initialPassword = process.env.ADMIN_PASSWORD || 'godswill123';
  settings.security.adminHash = hashPassword(initialPassword);
  console.log('=========================================================');
  console.log("  GOD'S WILL — first start");
  console.log('  Admin panel :  /admin');
  console.log('  Username    :  ' + settings.security.adminUser);
  console.log('  Password    :  ' + initialPassword + (process.env.ADMIN_PASSWORD ? '  (from ADMIN_PASSWORD)' : '  <-- CHANGE THIS in the admin panel!'));
  console.log('=========================================================');
  saveSettings();
}

function saveSettings() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    } catch (e) {
      console.error('[data] settings save failed:', e.message);
    }
  }, 250);
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */
const todayKey = () => new Date().toISOString().slice(0, 10);
let stats = { totals: { sessions: 0, msgs: 0, uploads: 0, calls: 0, callSeconds: 0, bytes: 0, reports: 0 }, peakOnline: 0, days: {} };

function loadStats() {
  try {
    if (fs.existsSync(STATS_FILE)) stats = Object.assign(stats, JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')));
  } catch (e) { console.error('[data] stats load failed:', e.message); }
}
let statsTimer = null;
function saveStats() {
  if (statsTimer) return;
  statsTimer = setTimeout(() => {
    statsTimer = null;
    try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch (_) {}
  }, 1000);
}
function day() {
  const k = todayKey();
  if (!stats.days[k]) stats.days[k] = { sessions: 0, msgs: 0, uploads: 0, calls: 0, callSeconds: 0, peakOnline: 0, reports: 0 };
  return stats.days[k];
}
function bump(key, by) {
  const n = Number(by || 1);
  stats.totals[key] = (stats.totals[key] || 0) + n;
  day()[key] = (day()[key] || 0) + n;
  saveStats();
}

/* ------------------------------------------------------------------ *
 * Security helpers
 * ------------------------------------------------------------------ */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return 'scrypt:' + salt + ':' + key;
}
function verifyPassword(pw, stored) {
  try {
    if (!stored) return false;
    const parts = String(stored).split(':');
    if (parts.length !== 3) return false;
    const key = crypto.scryptSync(String(pw), parts[1], 32);
    const expected = Buffer.from(parts[2], 'hex');
    return key.length === expected.length && crypto.timingSafeEqual(key, expected);
  } catch (_) { return false; }
}
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signToken(payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', settings.security.sessionSecret).update(body).digest('hex');
  return body + '.' + sig;
}
function verifyToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', settings.security.sessionSecret).update(body).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(expect, 'hex'), Buffer.from(sig, 'hex'))) return null;
    const payload = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch (_) { return null; }
}
function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  raw.split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
const ADMIN_COOKIE = 'gw_admin';
const clientIp = (req) => {
  const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  let ip = xf || req.socket.remoteAddress || '0.0.0.0';
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
};
const isBanned = (ip) => (settings.moderation.bannedIps || []).includes(ip);

/* ------------------------------------------------------------------ *
 * Web Push (VAPID) — Instagram-style phone notifications
 * ------------------------------------------------------------------ */
const pushSubs = new Map(); // endpoint -> {endpoint, keys, userId|null}
let pushReady = false;

function loadPushSubs() {
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const arr = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
      arr.forEach((s) => { if (s && s.endpoint) pushSubs.set(s.endpoint, s); });
      console.log('[push] loaded', pushSubs.size, 'subscriptions');
    }
  } catch (e) { console.error('[push] subs load failed:', e.message); }
}
let subsTimer = null;
function savePushSubs() {
  if (subsTimer) return;
  subsTimer = setTimeout(() => {
    subsTimer = null;
    try { fs.writeFileSync(SUBS_FILE, JSON.stringify([...pushSubs.values()], null, 2)); } catch (_) {}
  }, 500);
}

function initPush() {
  if (!settings.push.vapidPublic || !settings.push.vapidPrivate) {
    const keys = webpush.generateVAPIDKeys();
    settings.push.vapidPublic = keys.publicKey;
    settings.push.vapidPrivate = keys.privateKey;
    saveSettings();
    console.log('[push] generated new VAPID keys');
  }
  try {
    webpush.setVapidDetails(settings.push.subject || 'mailto:admin@godswill.chat', settings.push.vapidPublic, settings.push.vapidPrivate);
    pushReady = true;
    console.log('[push] ready — VAPID', settings.push.vapidPublic.slice(0, 18) + '…');
  } catch (e) {
    console.error('[push] init failed:', e.message);
  }
}

function pushPayload(user, payload) {
  if (!pushReady || !settings.push.enabled) return null;
  if (!user) return null;
  if (user.visible) return null; // tab is open on screen — in-app toasts handle it
  const sub = user.pushSub || pushSubs.get(user.pushEndpoint || '');
  if (!sub || !sub.endpoint) return null;
  return webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
    const code = err && (err.statusCode || err.code);
    if (code === 404 || code === 410) {
      pushSubs.delete(sub.endpoint);
      savePushSubs();
    }
  });
}

function pushAll(payload) {
  if (!pushReady || !settings.push.enabled) return;
  for (const sub of pushSubs.values()) {
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((err) => {
      const code = err && (err.statusCode || err.code);
      if (code === 404 || code === 410) { pushSubs.delete(sub.endpoint); savePushSubs(); }
    });
  }
}

/* ------------------------------------------------------------------ *
 * Text utilities
 * ------------------------------------------------------------------ */
const NICK_A = ['Grace', 'Faith', 'Hope', 'Mercy', 'Light', 'Peace', 'Joy', 'Blessed', 'Lion', 'Dove', 'Star', 'Shepherd', 'Cedar', 'Aurora', 'Ember', 'Nova'];
const NICK_B = ['Kid', 'Heart', 'Walker', 'Soul', 'Flame', 'Voice', 'Song', 'Path', 'Wing', 'River', 'Sky', 'Stone'];
function randomNick() {
  return NICK_A[Math.floor(Math.random() * NICK_A.length)] + '_' + Math.floor(1000 + Math.random() * 9000);
}
function cleanNick(nick) {
  // keep only letters, numbers, emoji/symbols and _ . - — strips < > / quotes, control chars, etc.
  let n = String(nick || '').replace(/[^\p{L}\p{N}\p{So}_ .\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 22);
  n = filterProfanity(n);
  return n || randomNick();
}
function cleanText(text, max) {
  let t = String(text == null ? '' : text).replace(/\u0000/g, '').slice(0, max);
  return t;
}
function filterProfanity(text) {
  if (!settings.moderation.profanityFilter) return text;
  let out = String(text);
  (settings.moderation.bannedWords || []).forEach((w) => {
    if (!w || String(w).trim().length < 2) return;
    const esc = String(w).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    try { out = out.replace(new RegExp(esc, 'gi'), (m) => '*'.repeat(m.length)); } catch (_) {}
  });
  return out;
}
const LINK_RE = /(https?:\/\/|www\.)\S+/gi;
function containsLink(t) { return /(https?:\/\/|www\.)\S+/i.test(String(t)); }

/* ------------------------------------------------------------------ *
 * In-memory media store (images / voice notes) — auto-expiring
 * ------------------------------------------------------------------ */
const MEDIA_TTL = (Number(process.env.MEDIA_TTL_MIN) || 45) * 60 * 1000;
const MEDIA_MAX_BYTES = (Number(process.env.MEDIA_MAX_GB) || 0.5) * 1024 * 1024 * 1024;
const media = new Map(); // id -> {buf, mime, size, name, kind, owner, expires}
let mediaBytes = 0;

function mediaCleanup() {
  const now = Date.now();
  for (const [id, m] of media) {
    if (m.expires < now) { media.delete(id); mediaBytes -= m.size; }
  }
  // if over cap, drop oldest
  if (mediaBytes > MEDIA_MAX_BYTES) {
    const sorted = [...media.entries()].sort((a, b) => a[1].created - b[1].created);
    for (const [id, m] of sorted) {
      if (mediaBytes <= MEDIA_MAX_BYTES * 0.8) break;
      media.delete(id); mediaBytes -= m.size;
    }
  }
}
setInterval(mediaCleanup, 60 * 1000).unref();

function putMedia({ buf, mime, name, kind, owner }) {
  mediaCleanup();
  const id = crypto.randomBytes(12).toString('hex');
  media.set(id, { buf, mime, name, kind, owner, size: buf.length, created: Date.now(), expires: Date.now() + MEDIA_TTL });
  mediaBytes += buf.length;
  return id;
}

/* ------------------------------------------------------------------ *
 * Realtime state
 * ------------------------------------------------------------------ */
const users = new Map();       // id -> user
const sockets = new Map();     // socketId -> userId
const queue = [];              // userIds waiting
const rooms = new Map();       // roomId -> room
const waitingRooms = new Map(); // code -> userId (private invite)
const blockedPairs = new Map(); // "a|b" -> expires
const events = [];             // admin activity log
const adminSockets = new Set();

function logEvent(type, text, extra) {
  const ev = Object.assign({ t: Date.now(), type, text }, extra || {});
  events.push(ev);
  if (events.length > 400) events.shift();
  for (const sid of adminSockets) io.to(sid).emit('admin:event', ev);
}

const onlineCount = () => users.size;
const roomList = () => [...rooms.values()];
const activeCalls = () => roomList().filter((r) => r.call && r.call.active).length;

function pairKey(a, b) { return [a, b].sort().join('|'); }
function isBlockedPair(a, b) {
  const k = pairKey(a, b);
  const exp = blockedPairs.get(k);
  if (!exp) return false;
  if (exp < Date.now()) { blockedPairs.delete(k); return false; }
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of blockedPairs) if (exp < now) blockedPairs.delete(k);
}, 5 * 60 * 1000).unref();

/* ------------------------------------------------------------------ *
 * ICE servers
 * ------------------------------------------------------------------ */
function iceServers() {
  const w = settings.webrtc;
  const list = [];
  if (w.stun) list.push({ urls: w.stun });
  if (w.stun2) list.push({ urls: w.stun2 });
  if (w.turnUrl) {
    const urls = String(w.turnUrl).split(',').map((s) => s.trim()).filter(Boolean);
    if (urls.length) list.push({ urls, username: w.turnUser || undefined, credential: w.turnCred || undefined });
  }
  return list;
}

/* ------------------------------------------------------------------ *
 * Express app
 * ------------------------------------------------------------------ */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// security headers (no X-Frame-Options: the app is embeddable in previews)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'microphone=(self), camera=(), geolocation=()');
  next();
});

// banned IP gate
app.use((req, res, next) => {
  const ip = clientIp(req);
  if (isBanned(ip)) return res.status(403).type('html').send('<h1 style="font-family:sans-serif">403 — Access blocked</h1><p style="font-family:sans-serif">Your access to this site has been blocked by an administrator.</p>');
  next();
});

// admin auth middleware
function requireAdmin(req, res, next) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  const payload = verifyToken(token);
  if (!payload || payload.u !== settings.security.adminUser) return res.status(401).json({ error: 'unauthorized' });
  req.admin = payload;
  next();
}

const loginAttempts = new Map();
function loginLimited(ip) {
  const rec = loginAttempts.get(ip) || { n: 0, until: 0 };
  if (rec.until > Date.now()) return true;
  return false;
}
function noteLoginFail(ip) {
  const rec = loginAttempts.get(ip) || { n: 0, until: 0 };
  rec.n += 1;
  if (rec.n >= 8) { rec.until = Date.now() + 10 * 60 * 1000; rec.n = 0; }
  loginAttempts.set(ip, rec);
}

/* -------- public API -------- */
function publicSettings() {
  return {
    site: settings.site,
    theme: settings.theme,
    features: settings.features,
    moderation: { allowLinks: settings.moderation.allowLinks, linkWarning: settings.moderation.linkWarning },
    limits: {
      maxImageMB: settings.limits.maxImageMB,
      maxVoiceNoteMB: settings.limits.maxVoiceNoteMB,
      maxVoiceNoteSec: settings.limits.maxVoiceNoteSec,
      maxMsgLen: settings.limits.maxMsgLen,
      maxOnline: settings.limits.maxOnline,
      noiseGateDb: settings.limits.noiseGateDb,
      hdVoice: settings.limits.hdVoice
    },
    maintenance: { on: !!settings.security.maintenance, message: settings.security.maintenanceMessage },
    push: { enabled: !!settings.push.enabled, vapidPublicKey: settings.push.vapidPublic || '' },
    ice: iceServers(),
    online: onlineCount(),
    capacity: settings.limits.maxOnline,
    full: onlineCount() >= settings.limits.maxOnline
  };
}

app.get('/api/public/settings', (req, res) => res.json(publicSettings()));
app.get('/api/public/stats', (req, res) => {
  const d = day();
  res.json({
    online: onlineCount(),
    capacity: settings.limits.maxOnline,
    inQueue: queue.length,
    chats: roomList().length,
    calls: activeCalls(),
    today: { sessions: d.sessions, msgs: d.msgs, calls: d.calls, uploads: d.uploads },
    uptimeSec: Math.round(process.uptime())
  });
});
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), online: onlineCount() }));

/* -------- push notifications -------- */
app.post('/api/push/subscribe', (req, res) => {
  const body = req.body || {};
  const sub = body.subscription;
  const sid = body.sid;
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({ error: 'bad_subscription' });
  }
  const rec = { endpoint: sub.endpoint, keys: sub.keys, userId: null };
  if (sid) {
    const uid = sockets.get(String(sid));
    if (uid && users.has(uid)) {
      rec.userId = uid;
      const u = users.get(uid);
      u.pushSub = rec;
      u.pushEndpoint = sub.endpoint;
    }
  }
  pushSubs.set(sub.endpoint, rec);
  savePushSubs();
  res.json({ ok: true, count: pushSubs.size });
});
app.post('/api/push/unsubscribe', (req, res) => {
  const ep = (req.body || {}).endpoint;
  if (ep) { pushSubs.delete(String(ep)); savePushSubs(); }
  res.json({ ok: true });
});

/* -------- media upload -------- */
const ALLOWED_IMAGE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;
const ALLOWED_AUDIO = /^audio\/(webm|ogg|mp4|mpeg|wav|x-wav|aac|m4a|opus)$/i;

app.post('/api/upload', (req, res) => {
  const sid = req.query.sid || req.headers['x-socket-id'];
  const user = sid ? users.get(sockets.get(String(sid)) || String(sid)) : null;
  if (!user) return res.status(401).json({ error: 'not_connected' });
  if (user.state !== 'chat') return res.status(400).json({ error: 'not_in_chat' });

  const now = Date.now();
  user.uploadTimes = (user.uploadTimes || []).filter((t) => now - t < 60000);
  if (user.uploadTimes.length >= settings.limits.uploadsPerMinute) return res.status(429).json({ error: 'rate_limited' });
  user.uploadTimes.push(now);

  const maxMB = Math.max(Number(settings.limits.maxImageMB) || 20, Number(settings.limits.maxVoiceNoteMB) || 20);
  const hardCap = Math.min(Math.max(maxMB, 1) * 1024 * 1024, 200 * 1024 * 1024);

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: hardCap, files: 1 } }).single('file');
  upload(req, res, (err) => {
    if (err) {
      const code = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(code).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'too_large' : 'upload_failed', maxMB });
    }
    if (!req.file) return res.status(400).json({ error: 'no_file' });
    const kind = String(req.body.kind || (req.file.mimetype.startsWith('audio') ? 'voice' : 'image'));
    const f = req.file;
    const lim = settings.limits;

    if (kind === 'image') {
      if (!settings.features.images) return res.status(403).json({ error: 'images_disabled' });
      if (!ALLOWED_IMAGE.test(f.mimetype)) return res.status(415).json({ error: 'bad_type' });
      if (f.size > lim.maxImageMB * 1024 * 1024) return res.status(413).json({ error: 'too_large', maxMB: lim.maxImageMB });
    } else {
      if (!settings.features.voiceNotes) return res.status(403).json({ error: 'voice_notes_disabled' });
      if (!ALLOWED_AUDIO.test(f.mimetype)) return res.status(415).json({ error: 'bad_type' });
      if (f.size > lim.maxVoiceNoteMB * 1024 * 1024) return res.status(413).json({ error: 'too_large', maxMB: lim.maxVoiceNoteMB });
    }

    const id = putMedia({ buf: f.buffer, mime: f.mimetype, name: f.originalname || '', kind, owner: user.id });
    user.uploadCount = (user.uploadCount || 0) + 1;
    bump('uploads');
    stats.totals.bytes += f.size;
    saveStats();
    logEvent('upload', `${user.nick} uploaded ${kind} (${(f.size / 1048576).toFixed(2)} MB)`, { userId: user.id });
    res.json({ id, url: '/u/' + id, kind, size: f.size, mime: f.mimetype, name: f.originalname || '' });
  });
});

app.get('/u/:id', (req, res) => {
  const m = media.get(req.params.id);
  if (!m) return res.status(404).send('Gone');
  res.setHeader('Content-Type', m.mime);
  res.setHeader('Cache-Control', 'private, max-age=600');
  res.setHeader('Content-Length', m.size);
  res.setHeader('Accept-Ranges', 'none');
  res.send(m.buf);
});

/* -------- admin API -------- */
app.post('/api/admin/login', (req, res) => {
  const ip = clientIp(req);
  if (loginLimited(ip)) return res.status(429).json({ error: 'too_many_attempts' });
  const body = req.body || {};
  const okUser = String(body.username || '') === String(settings.security.adminUser);
  const okPass = verifyPassword(String(body.password || ''), settings.security.adminHash);
  if (!okUser || !okPass) { noteLoginFail(ip); return res.status(401).json({ error: 'invalid_credentials' }); }
  loginAttempts.delete(ip);
  const hours = Number(settings.security.sessionHours) || 12;
  const token = signToken({ u: settings.security.adminUser, exp: Date.now() + hours * 3600 * 1000, ip });
  const secure = (req.headers['x-forwarded-proto'] || req.protocol) === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${hours * 3600}${secure}`);
  logEvent('admin', 'Admin login from ' + ip);
  res.json({ ok: true, user: settings.security.adminUser });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
app.get('/api/admin/session', requireAdmin, (req, res) => res.json({ ok: true, user: req.admin.u }));

function adminSnapshot() {
  const d = day();
  return {
    stats: {
      online: onlineCount(), peakOnline: Math.max(stats.peakOnline, onlineCount()),
      inQueue: queue.length, chats: roomList().length, calls: activeCalls(),
      waitingPrivate: waitingRooms.size,
      totals: stats.totals, today: d,
      uptimeSec: Math.round(process.uptime()),
      memMB: Math.round(process.memoryUsage().rss / 1048576),
      load: os.loadavg()[0].toFixed(2),
      mediaMB: Math.round(mediaBytes / 1048576),
      mediaFiles: media.size,
      pushSubs: pushSubs.size,
      capacity: settings.limits.maxOnline,
      maxOnlineFlag: onlineCount() >= settings.limits.maxOnline
    },
    users: [...users.values()].map((u) => ({
      id: u.id, nick: u.nick, state: u.state, mode: u.mode, peer: u.peerNick || null,
      ip: maskIp(u.ip), ipFull: u.ip, since: u.joinedAt, msgs: u.msgCount || 0,
      uploads: u.uploadCount || 0, reports: u.reports || 0, tags: u.tags || [],
      inCall: !!(u.callActive), callSec: u.callStartedAt ? Math.round((Date.now() - u.callStartedAt) / 1000) : 0
    })).sort((a, b) => b.since - a.since),
    rooms: roomList().map((r) => ({ id: r.id, type: r.type, members: r.members.map((m) => (users.get(m) || {}).nick || '?'), call: !!(r.call && r.call.active), createdAt: r.createdAt })),
    events: events.slice(-120).reverse(),
    settings
  };
}
function maskIp(ip) {
  const s = String(ip || '');
  if (s.includes('.')) { const p = s.split('.'); return p[0] + '.' + p[1] + '.*.*'; }
  return s.slice(0, 8) + '…';
}

app.get('/api/admin/snapshot', requireAdmin, (req, res) => res.json(adminSnapshot()));

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const patch = req.body && req.body.settings;
  if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'bad_body' });
  const incomingSecurity = patch.security || {};
  if (incomingSecurity.adminHash) delete incomingSecurity.adminHash; // never via this route
  settings = deepMerge(settings, patch);
  if (!settings.security.sessionSecret) settings.security.sessionSecret = crypto.randomBytes(32).toString('hex');
  saveSettings();
  broadcastSettings();
  logEvent('admin', 'Settings updated by admin');
  res.json({ ok: true, settings });
});

function broadcastSettings() {
  io.emit('settings:update', publicSettings());
}

app.post('/api/admin/password', requireAdmin, (req, res) => {
  const { current, next, username } = req.body || {};
  if (!verifyPassword(String(current || ''), settings.security.adminHash)) return res.status(403).json({ error: 'wrong_password' });
  if (!next || String(next).length < 6) return res.status(400).json({ error: 'weak_password' });
  settings.security.adminHash = hashPassword(String(next));
  if (username && String(username).trim()) settings.security.adminUser = String(username).trim().slice(0, 30);
  settings.security.sessionSecret = crypto.randomBytes(32).toString('hex'); // invalidate other sessions
  saveSettings();
  logEvent('admin', 'Admin credentials changed');
  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true, relogin: true });
});

app.post('/api/admin/broadcast', requireAdmin, (req, res) => {
  const text = cleanText((req.body || {}).text, 400);
  if (!text) return res.status(400).json({ error: 'empty' });
  io.emit('broadcast', { text: filterProfanity(text), at: Date.now() });
  pushAll({ title: '📢 ' + settings.site.name, body: filterProfanity(text), tag: 'gw-broadcast', kind: 'msg', url: '/app' });
  if ((req.body || {}).persist) { settings.site.announcement = text; settings.site.announcementEnabled = true; saveSettings(); broadcastSettings(); }
  logEvent('admin', 'Broadcast: ' + text.slice(0, 80));
  res.json({ ok: true });
});

app.post('/api/admin/push-test', requireAdmin, (req, res) => {
  if (!pushReady || !settings.push.enabled) return res.status(400).json({ error: 'push_disabled' });
  pushAll({
    title: settings.site.name,
    body: '🔔 Test notification — phone notifications are working!',
    tag: 'gw-test',
    kind: 'msg',
    url: '/app'
  });
  logEvent('admin', 'Push test sent to ' + pushSubs.size + ' subscribers');
  res.json({ ok: true, sent: pushSubs.size });
});

app.post('/api/admin/kick', requireAdmin, (req, res) => {
  const { id, reason } = req.body || {};
  const u = users.get(String(id));
  if (!u) return res.status(404).json({ error: 'not_found' });
  kickUser(u, reason || 'Kicked by admin', false);
  res.json({ ok: true });
});
app.post('/api/admin/ban', requireAdmin, (req, res) => {
  const { id, ip, reason } = req.body || {};
  let targetIp = ip;
  if (id) { const u = users.get(String(id)); if (u) targetIp = u.ip; }
  if (!targetIp) return res.status(400).json({ error: 'no_ip' });
  if (!settings.moderation.bannedIps.includes(targetIp)) settings.moderation.bannedIps.push(targetIp);
  saveSettings();
  for (const u of [...users.values()]) if (u.ip === targetIp) kickUser(u, reason || 'Banned by admin', true);
  logEvent('admin', 'Banned IP ' + targetIp);
  res.json({ ok: true, bannedIps: settings.moderation.bannedIps });
});
app.post('/api/admin/unban', requireAdmin, (req, res) => {
  const ip = String((req.body || {}).ip || '');
  settings.moderation.bannedIps = settings.moderation.bannedIps.filter((x) => x !== ip);
  saveSettings();
  logEvent('admin', 'Unbanned IP ' + ip);
  res.json({ ok: true, bannedIps: settings.moderation.bannedIps });
});
app.post('/api/admin/endcall', requireAdmin, (req, res) => {
  const u = users.get(String((req.body || {}).id || ''));
  if (!u || !u.roomId) return res.status(404).json({ error: 'not_found' });
  endCall(u.roomId, 'Ended by moderator');
  res.json({ ok: true });
});
app.post('/api/admin/message', requireAdmin, (req, res) => {
  const { id, text } = req.body || {};
  const u = users.get(String(id));
  if (!u) return res.status(404).json({ error: 'not_found' });
  io.to(u.socketId).emit('admin:notice', { text: cleanText(text, 300) || 'Please follow the community rules.' });
  res.json({ ok: true });
});
app.post('/api/admin/end-all', requireAdmin, (req, res) => {
  for (const r of roomList()) { endCall(r.id, 'All rooms closed by admin'); closeRoom(r.id, 'admin'); }
  queue.length = 0;
  io.emit('server:reset');
  logEvent('admin', 'All rooms closed by admin');
  res.json({ ok: true });
});
app.post('/api/admin/reset-stats', requireAdmin, (req, res) => {
  stats = { totals: { sessions: 0, msgs: 0, uploads: 0, calls: 0, callSeconds: 0, bytes: 0, reports: 0 }, peakOnline: onlineCount(), days: {} };
  saveStats();
  res.json({ ok: true });
});
app.get('/api/admin/export', requireAdmin, (req, res) => {
  const safe = JSON.parse(JSON.stringify(settings));
  if (safe.security) { delete safe.security.adminHash; delete safe.security.sessionSecret; } // never export secrets
  if (safe.push) { delete safe.push.vapidPrivate; } // private key stays on the server
  res.setHeader('Content-Disposition', 'attachment; filename="godswill-settings.json"');
  res.type('application/json').send(JSON.stringify(safe, null, 2));
});
app.post('/api/admin/import', requireAdmin, (req, res) => {
  const s = (req.body || {}).settings;
  if (!s || typeof s !== 'object') return res.status(400).json({ error: 'bad_body' });
  const keep = { adminHash: settings.security.adminHash, sessionSecret: settings.security.sessionSecret };
  settings = deepMerge(DEFAULT_SETTINGS, s);
  settings.security.adminHash = keep.adminHash;
  settings.security.sessionSecret = keep.sessionSecret;
  saveSettings(); broadcastSettings();
  res.json({ ok: true });
});

/* -------- pages & static --------
 * DUAL MODE:
 *  - public/ folder hai  -> normal structured mode
 *  - public/ nahi hai    -> FLAT mode (sab files server.js ke paas root me)
 *                           — mobile se GitHub upload ke liye (folders nahi chahiye)
 */
const HAS_PUBLIC = fs.existsSync(PUBLIC_DIR);
const FLAT_FILES = new Set([
  'index.html', 'app.html', 'admin.html', 'sw.js', 'manifest.json',
  'site.css', 'app.css', 'site.js', 'app.js', 'admin.js',
  'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
]);
function flatResolve(urlPath) {
  let p = String(urlPath || '').split('?')[0];
  try { p = decodeURIComponent(p); } catch (_) {}
  p = p.replace(/^\/(css|js|assets)\//, '/'); // /css/site.css -> /site.css
  const name = p.replace(/^\//, '');
  return FLAT_FILES.has(name) ? path.join(__dirname, name) : null; // whitelist only — secrets never exposed
}
const INDEX_HTML = HAS_PUBLIC ? path.join(PUBLIC_DIR, 'index.html') : path.join(__dirname, 'index.html');
const APP_HTML = HAS_PUBLIC ? path.join(PUBLIC_DIR, 'app.html') : path.join(__dirname, 'app.html');
const ADMIN_HTML = HAS_PUBLIC ? path.join(PUBLIC_DIR, 'admin.html') : path.join(__dirname, 'admin.html');

if (HAS_PUBLIC) {
  app.use(express.static(PUBLIC_DIR, {
    maxAge: '1h',
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (/\.(html?|css|js)$/.test(filePath) || filePath.endsWith('manifest.json')) {
        res.setHeader('Cache-Control', 'no-cache'); // pages/styles/scripts must be fresh after every deploy
      }
    }
  }));
} else {
  console.log('[server] FLAT MODE: public/ folder nahi mila — static files repo root se serve ho rahi hain');
  app.use((req, res, next) => {
    const file = flatResolve(req.path);
    if (!file) return next();
    if (/\.(html?|css|js)$/.test(file) || file.endsWith('manifest.json')) {
      res.setHeader('Cache-Control', 'no-cache'); // pages/styles/scripts always fresh
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    res.sendFile(file);
  });
}
app.get('/', (req, res) => res.sendFile(INDEX_HTML));
app.get('/app', (req, res) => res.sendFile(APP_HTML));
app.get('/chat', (req, res) => res.sendFile(APP_HTML));
app.get('/admin', (req, res) => res.sendFile(ADMIN_HTML));
app.use((req, res) => res.status(404).sendFile(INDEX_HTML));

/* ------------------------------------------------------------------ *
 * Socket.IO
 * ------------------------------------------------------------------ */
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 1e6,
  pingTimeout: 25000,
  cors: { origin: true, credentials: true },
  transports: ['polling', 'websocket']
});

function userBySocket(socket) { return users.get(sockets.get(socket.id)); }

function emitToUser(userId, event, data) {
  const u = users.get(userId);
  if (u && u.socketId) io.to(u.socketId).emit(event, data);
}

function publicUser(u) {
  return { id: u.id, nick: u.nick, tags: u.tags || [], mode: u.mode || 'both', muted: !!u.muted, noiseFilter: u.noiseFilter !== false, callActive: !!u.callActive };
}

io.use((socket, next) => {
  const ip = (socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.handshake.address || '';
  const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isBanned(clean)) return next(new Error('banned'));
  const sameIp = [...users.values()].filter((u) => u.ip === clean).length;
  socket.data.ip = clean || 'unknown';
  socket.data.sameIp = sameIp;
  next();
});

io.on('connection', (socket) => {
  const ip = socket.data.ip;
  const tooMany = [...users.values()].filter((u) => u.ip === ip).length >= settings.limits.maxPerIp;

  const user = {
    id: crypto.randomBytes(8).toString('hex'),
    socketId: socket.id,
    ip,
    nick: randomNick(),
    tags: [],
    mode: 'both',
    state: 'idle',
    roomId: null,
    joinedAt: Date.now(),
    msgTimes: [],
    uploadTimes: [],
    msgCount: 0,
    reports: 0,
    muted: false,
    visible: true,
    pushSub: null,
    pushEndpoint: null,
    noiseFilter: settings.features.noiseFilterDefault !== false
  };
  users.set(user.id, user);
  sockets.set(socket.id, user.id);
  bump('sessions');
  stats.peakOnline = Math.max(stats.peakOnline, onlineCount());
  day().peakOnline = Math.max(day().peakOnline || 0, onlineCount());
  saveStats();
  logEvent('join', `${user.nick} connected (${maskIp(ip)})`, { userId: user.id });

  socket.emit('welcome', {
    you: publicUser(user),
    settings: publicSettings(),
    stats: { online: onlineCount(), capacity: settings.limits.maxOnline },
    limited: tooMany,
    privateCode: null
  });

  io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });

  /* ---------- identity / prefs ---------- */
  socket.on('nick:set', (data) => {
    const nick = cleanNick((data || {}).nick);
    user.nick = nick;
    socket.emit('you:update', publicUser(user));
    if (user.roomId) emitToUser(peerIdOf(user), 'peer:update', publicUser(user));
  });

  socket.on('visibility', (data) => {
    user.visible = !!((data || {}).visible);
  });

  socket.on('prefs:set', (data) => {
    const d = data || {};
    if (Array.isArray(d.tags)) user.tags = d.tags.map((t) => cleanText(t, 18)).slice(0, 6);
    if (typeof d.muted === 'boolean') user.muted = d.muted;
    if (typeof d.noiseFilter === 'boolean') user.noiseFilter = d.noiseFilter;
    if (typeof d.mode === 'string') user.mode = ['text', 'voice', 'both'].includes(d.mode) ? d.mode : 'both';
    socket.emit('you:update', publicUser(user));
    if (user.roomId) emitToUser(peerIdOf(user), 'peer:update', publicUser(user));
  });

  /* ---------- matchmaking ---------- */
  socket.on('queue:find', (data) => {
    const d = data || {};
    if (settings.security.maintenance) return socket.emit('queue:error', { error: 'maintenance', message: settings.security.maintenanceMessage });
    if (onlineCount() > settings.limits.maxOnline) return socket.emit('queue:error', { error: 'full', message: settings.limits.fullMessage });
    if (tooMany) return socket.emit('queue:error', { error: 'ip_limit', message: 'Too many connections from your network. Please close other tabs.' });
    if (user.state === 'chat') return;
    if (typeof d.mode === 'string' && ['text', 'voice', 'both'].includes(d.mode)) user.mode = d.mode;
    if (Array.isArray(d.tags)) user.tags = d.tags.map((t) => cleanText(t, 18)).slice(0, 6);
    if (!settings.features.textChat && user.mode === 'text') return socket.emit('queue:error', { error: 'text_disabled', message: 'Text chat is temporarily disabled.' });
    if (!settings.features.voiceCalls && user.mode === 'voice') return socket.emit('queue:error', { error: 'voice_disabled', message: 'Voice calls are temporarily disabled.' });

    user.state = 'queued';
    user.queuedAt = Date.now();
    if (!queue.includes(user.id)) queue.push(user.id);
    socket.emit('queue:waiting', { position: queue.indexOf(user.id) + 1, since: user.queuedAt, mode: user.mode });
    logEvent('queue', `${user.nick} searching (${user.mode})`, { userId: user.id });
    tryMatch();
  });

  socket.on('queue:leave', () => {
    leaveQueue(user);
    socket.emit('queue:left', {});
  });

  socket.on('room:join', (data) => {
    if (!settings.features.privateRooms) return socket.emit('queue:error', { error: 'disabled', message: 'Private rooms are disabled.' });
    const code = String((data || {}).code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!code) return socket.emit('queue:error', { error: 'bad_code', message: 'Invalid invite code.' });
    if (user.state === 'chat' && user.roomId) return socket.emit('queue:error', { error: 'busy', message: 'You are already in a chat — press Next first.' });
    leaveQueue(user);
    const hostId = waitingRooms.get(code);
    if (hostId && hostId !== user.id && users.has(hostId)) {
      waitingRooms.delete(code);
      createRoom(users.get(hostId), user, 'private', false);
    } else {
      waitingRooms.set(code, user.id);
      user.state = 'waiting_room';
      user.privateCode = code;
      socket.emit('room:waiting', { code, link: roomLink(code) });
      logEvent('room', `${user.nick} created private room ${code}`, { userId: user.id });
    }
  });

  /* ---------- chat messages ---------- */
  socket.on('msg', (data) => {
    const d = data || {};
    if (user.state !== 'chat' || !user.roomId) return;
    const roomNow = rooms.get(user.roomId);
    if (roomNow && roomNow.call && roomNow.call.active && !settings.features.chatDuringCall) {
      return socket.emit('msg:error', { error: 'disabled', message: 'Chat during calls is currently disabled.' });
    }
    const now = Date.now();
    user.msgTimes = (user.msgTimes || []).filter((t) => now - t < 60000);
    if (user.msgTimes.length >= settings.limits.msgPerMinute) return socket.emit('msg:error', { error: 'rate_limited', message: 'You are sending messages too fast ⏳' });
    user.msgTimes.push(now);

    const peer = users.get(peerIdOf(user));
    if (!peer) return;

    if (d.kind === 'media') {
      const m = media.get(String(d.id || (String(d.url || '').split('/u/')[1] || '')));
      if (!m || m.owner !== user.id) return socket.emit('msg:error', { error: 'bad_media' });
      const out = {
        id: crypto.randomBytes(6).toString('hex'),
        from: user.id, kind: 'media', at: now,
        media: { id: d.id, url: '/u/' + d.id, mime: m.mime, size: m.size, name: m.name, mediaKind: m.kind, duration: Number(d.duration) || 0, w: Number(d.w) || 0, h: Number(d.h) || 0, compressed: !!d.compressed }
      };
      user.msgCount++; peer.msgCount++;
      bump('msgs');
      emitToUser(peer.id, 'msg', out);
      socket.emit('msg:ack', { id: out.id, at: now });
      pushPayload(peer, {
        title: settings.site.name,
        body: m.kind === 'voice' ? '🎤 ' + user.nick + ' sent a voice message' : '📷 ' + user.nick + ' sent a photo',
        tag: 'gw-msg',
        kind: 'msg',
        url: '/app'
      });
      return;
    }

    let text = cleanText(d.text, settings.limits.maxMsgLen);
    if (!text.trim()) return;
    if (containsLink(text) && !settings.moderation.allowLinks) {
      text = text.replace(LINK_RE, settings.moderation.linkWarning || '[link hidden]');
    }
    text = filterProfanity(text);
    const out = { id: crypto.randomBytes(6).toString('hex'), from: user.id, kind: 'text', text, at: now };
    user.msgCount++; peer.msgCount++;
    bump('msgs');
    emitToUser(peer.id, 'msg', out);
    socket.emit('msg:ack', { id: out.id, at: now });
    pushPayload(peer, {
      title: settings.site.name,
      body: '💬 ' + user.nick + ': ' + text.slice(0, 90),
      tag: 'gw-msg',
      kind: 'msg',
      url: '/app'
    });
  });

  socket.on('typing', (data) => {
    if (!settings.features.typingIndicator) return;
    if (user.state !== 'chat' || !user.roomId) return;
    const peerId = peerIdOf(user);
    if (peerId) emitToUser(peerId, 'typing', { from: user.id, on: !!(data || {}).on });
  });

  /* ---------- voice call ---------- */
  socket.on('call:invite', () => {
    if (!settings.features.voiceCalls) return socket.emit('call:error', { message: 'Voice calls are disabled right now.' });
    if (user.state !== 'chat' || !user.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room) return;
    if (room.call && room.call.active) return socket.emit('call:error', { message: 'A call is already running.' });
    const peerId = peerIdOf(user);
    if (!peerId) return;
    room.call = { active: false, pending: true, initiator: user.id, startedAt: null };
    emitToUser(peerId, 'call:incoming', { from: publicUser(user) });
    pushPayload(users.get(peerId), {
      title: '📞 Incoming voice call',
      body: user.nick + ' is calling you — tap to answer',
      tag: 'gw-call',
      kind: 'call',
      url: '/app'
    });
    logEvent('call', `${user.nick} invited ${(users.get(peerId) || {}).nick} to a voice call`);
  });

  socket.on('call:accept', () => {
    if (user.state !== 'chat' || !user.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room || !room.call) return;
    room.call.active = true;
    room.call.pending = false;
    room.call.startedAt = Date.now();
    const other = users.get(room.members.find((m) => m !== user.id));
    if (other) { other.callActive = true; other.callStartedAt = room.call.startedAt; }
    user.callActive = true; user.callStartedAt = room.call.startedAt;
    bump('calls');
    room.members.forEach((mid) => emitToUser(mid, 'call:start', { initiator: room.call.initiator, startedAt: room.call.startedAt }));
    logEvent('call', `Call started in room ${room.id}`);
  });

  socket.on('call:decline', () => {
    if (!user.roomId) return;
    const room = rooms.get(user.roomId);
    if (!room) return;
    if (room.call) room.call = null;
    const peerId = peerIdOf(user);
    if (peerId) emitToUser(peerId, 'call:declined', { by: user.nick });
  });

  socket.on('webrtc', (data) => {
    if (!user.roomId || user.state !== 'chat') return;
    const peerId = peerIdOf(user);
    if (!peerId) return;
    emitToUser(peerId, 'webrtc', data || {});
  });

  socket.on('call:end', () => {
    if (!user.roomId) return;
    endCall(user.roomId, (user.nick + ' ended the call'));
  });

  socket.on('call:state', (data) => {
    const d = data || {};
    if (typeof d.muted === 'boolean') user.muted = d.muted;
    if (typeof d.noiseFilter === 'boolean') user.noiseFilter = d.noiseFilter;
    const peerId = user.roomId ? peerIdOf(user) : null;
    if (peerId) emitToUser(peerId, 'peer:update', publicUser(user));
  });

  /* ---------- moderation ---------- */
  socket.on('report', (data) => {
    if (!settings.features.reports) return;
    const peerId = user.roomId ? peerIdOf(user) : null;
    const peer = peerId ? users.get(peerId) : null;
    const reason = cleanText((data || {}).reason, 140) || 'No reason given';
    bump('reports');
    if (peer) {
      peer.reports = (peer.reports || 0) + 1;
      const auto = Number(settings.moderation.autoBanAfterReports) || 0;
      if (auto > 0 && peer.reports >= auto) {
        if (!settings.moderation.bannedIps.includes(peer.ip)) settings.moderation.bannedIps.push(peer.ip);
        saveSettings();
        kickUser(peer, 'Auto-banned after multiple reports', true);
        logEvent('report', `AUTO-BAN ${peer.nick} after ${peer.reports} reports`);
      }
    }
    logEvent('report', `⚠️ ${user.nick} reported ${peer ? peer.nick : 'unknown'} — ${reason}`, { userId: user.id });
    socket.emit('toast', { kind: 'ok', text: 'Report sent to moderators. Thank you 🙏' });
    if (peer) io.to(peer.socketId || '').emit('admin:notice', { text: 'A user reported this chat. Please keep the conversation respectful.' });
  });

  socket.on('block', () => {
    const peerId = user.roomId ? peerIdOf(user) : null;
    if (peerId) blockedPairs.set(pairKey(user.id, peerId), Date.now() + 24 * 3600 * 1000);
    logEvent('report', `${user.nick} blocked ${(users.get(peerId) || {}).nick || 'stranger'}`);
    if (user.roomId) { const rid = user.roomId; endCall(rid, 'Chat blocked'); closeRoom(rid, 'blocked', 'blocked'); }
    socket.emit('toast', { kind: 'ok', text: 'User blocked. They cannot be matched with you again for 24 hours.' });
  });

  socket.on('next', () => {
    if (user.roomId) { const rid = user.roomId; endCall(rid, 'Stranger skipped'); closeRoom(rid, 'next'); }
    else leaveQueue(user);
    setTimeout(() => {
      if (!users.has(user.id)) return;
      user.state = 'idle';
      socket.emit('queue:auto', {});
    }, 350);
  });

  socket.on('invite:create', () => {
    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    user.privateCode = code;
    socket.emit('invite:created', { code, link: roomLink(code) });
  });

  /* ---------- admin realtime ---------- */
  socket.on('admin:auth', (data) => {
    const token = (data || {}).token || parseCookies({ headers: { cookie: socket.handshake.headers.cookie } })[ADMIN_COOKIE];
    const payload = verifyToken(token);
    const cookieToken = parseCookies({ headers: { cookie: socket.handshake.headers.cookie || '' } })[ADMIN_COOKIE];
    const ok = (payload && payload.u === settings.security.adminUser) || (verifyToken(cookieToken) ? true : false);
    if (!ok) return socket.emit('admin:denied', {});
    socket.data.admin = true;
    adminSockets.add(socket.id);
    socket.join('admins');
    socket.emit('admin:snapshot', adminSnapshot());
  });
  socket.on('disconnect', () => adminSockets.delete(socket.id));

  /* ---------- disconnect ---------- */
  socket.on('disconnect', () => {
    sockets.delete(socket.id);
    if (socket.data.admin) adminSockets.delete(socket.id);
    if (user.roomId) { const rid = user.roomId; endCall(rid, user.nick + ' disconnected'); closeRoom(rid, 'left'); }
    leaveQueue(user);
    if (waitingRooms.get(user.privateCode) === user.id) waitingRooms.delete(user.privateCode);
    users.delete(user.id);
    const endedCallSec = user.callStartedAt ? Math.round((Date.now() - user.callStartedAt) / 1000) : 0;
    if (endedCallSec) { stats.totals.callSeconds += endedCallSec; day().callSeconds += endedCallSec; saveStats(); }
    logEvent('leave', `${user.nick} disconnected`);
    io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });
  });
});

/* ------------------------------------------------------------------ *
 * Matching engine
 * ------------------------------------------------------------------ */
function roomLink(code) { return '/app?room=' + code; }

function compatible(a, b) {
  const am = a.mode || 'both', bm = b.mode || 'both';
  if (am === 'text' && bm === 'voice') return false;
  if (am === 'voice' && bm === 'text') return false;
  return true;
}
function scoreMatch(a, b) {
  let s = 0;
  const at = a.tags || [], bt = b.tags || [];
  for (const t of at) if (bt.includes(t)) s += 10;
  if (a.mode === b.mode) s += 3;
  return s;
}
function tryMatch() {
  if (queue.length < 2) return;
  let best = null;
  for (let i = 0; i < queue.length; i++) {
    const a = users.get(queue[i]);
    if (!a || a.state !== 'queued') { queue.splice(i, 1); i--; continue; }
    for (let j = i + 1; j < queue.length; j++) {
      const b = users.get(queue[j]);
      if (!b || b.state !== 'queued') { queue.splice(j, 1); j--; continue; }
      if (isBlockedPair(a.id, b.id)) continue;
      if (!compatible(a, b)) continue;
      const sc = scoreMatch(a, b);
      if (!best || sc > best.score) best = { a, b, score: sc, i, j };
    }
  }
  if (!best) return;
  queue.splice(best.j, 1);
  queue.splice(best.i, 1);
  const bothVoice = (best.a.mode === 'voice' || best.b.mode === 'voice');
  createRoom(best.a, best.b, 'random', bothVoice && settings.features.voiceCalls, bothVoice);
}

function createRoom(a, b, type, autoCall) {
  const id = crypto.randomBytes(6).toString('hex');
  const room = { id, type, members: [a.id, b.id], createdAt: Date.now(), call: null, twoParty: true };
  rooms.set(id, room);
  [a, b].forEach((u) => {
    u.state = 'chat'; u.roomId = id; u.peerNick = (u === a ? b.nick : a.nick); u.callActive = false; u.callStartedAt = null;
    u.partnerId = (u === a ? b.id : a.id);
  });
  const ri = queue.indexOf(a.id); if (ri > -1) queue.splice(ri, 1);
  const rj = queue.indexOf(b.id); if (rj > -1) queue.splice(rj, 1);

  const common = (a.tags || []).filter((t) => (b.tags || []).includes(t));
  const payload = (u, p) => ({
    room: { id, type, autoCall: !!autoCall, voice: !!(u.mode === 'voice' || p.mode === 'voice') },
    you: publicUser(u),
    peer: publicUser(p),
    commonTags: common,
    limits: { maxImageMB: settings.limits.maxImageMB, maxVoiceNoteMB: settings.limits.maxVoiceNoteMB, maxVoiceNoteSec: settings.limits.maxVoiceNoteSec, chatDuringCall: !!settings.features.chatDuringCall },
    callAllowed: !!settings.features.voiceCalls
  });
  emitToUser(a.id, 'match:found', payload(a, b));
  emitToUser(b.id, 'match:found', payload(b, a));
  pushPayload(a, { title: settings.site.name, body: '✨ You are now chatting with ' + b.nick, tag: 'gw-match', kind: 'msg', url: '/app' });
  pushPayload(b, { title: settings.site.name, body: '✨ You are now chatting with ' + a.nick, tag: 'gw-match', kind: 'msg', url: '/app' });
  logEvent('match', `${a.nick} ↔ ${b.nick} matched${common.length ? ' (shared: ' + common.join(', ') + ')' : ''}`, { userId: a.id });
  io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });

  if (autoCall) {
    room.call = { active: true, pending: false, initiator: a.id, startedAt: Date.now() };
    a.callActive = b.callActive = true;
    a.callStartedAt = b.callStartedAt = room.call.startedAt;
    bump('calls');
    setTimeout(() => {
      emitToUser(a.id, 'call:start', { initiator: a.id, startedAt: room.call.startedAt });
      emitToUser(b.id, 'call:start', { initiator: a.id, startedAt: room.call.startedAt });
    }, 500);
    logEvent('call', `Voice call auto-started: ${a.nick} ↔ ${b.nick}`);
  }
}

function peerIdOf(user) {
  const room = user.roomId ? rooms.get(user.roomId) : null;
  if (!room) return null;
  return room.members.find((m) => m !== user.id) || null;
}

function leaveQueue(user) {
  const i = queue.indexOf(user.id);
  if (i > -1) queue.splice(i, 1);
  if (user.state === 'queued') user.state = 'idle';
  if (user.state === 'waiting_room') { user.state = 'idle'; if (waitingRooms.get(user.privateCode) === user.id) waitingRooms.delete(user.privateCode); }
}

function endCall(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;
  const wasActive = room.call && (room.call.active || room.call.pending);
  if (!wasActive) return;
  const dur = room.call.startedAt ? Math.round((Date.now() - room.call.startedAt) / 1000) : 0;
  if (dur) { stats.totals.callSeconds += dur; day().callSeconds += dur; saveStats(); }
  room.call = null;
  room.members.forEach((mid) => {
    const u = users.get(mid);
    if (u) { u.callActive = false; u.callStartedAt = null; }
    emitToUser(mid, 'call:ended', { reason: reason || 'Call ended', duration: dur });
  });
  logEvent('call', `Call ended (${dur}s) — ${reason || ''}`);
  io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });
}

function closeRoom(roomId, why, extra) {
  const room = rooms.get(roomId);
  if (!room) return;
  rooms.delete(roomId);
  room.members.forEach((mid) => {
    const u = users.get(mid);
    if (!u) return;
    u.roomId = null; u.peerNick = null; u.partnerId = null; u.callActive = false; u.callStartedAt = null;
    if (u.state === 'chat') u.state = 'idle';
    emitToUser(mid, 'peer:left', { reason: why, message: why === 'blocked' ? 'You blocked this user.' : why === 'left' ? settings.limits.offlineMessage : 'Chat ended.' , extra: extra || null });
  });
  io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });
}

function kickUser(user, reason, banned) {
  if (!user) return;
  logEvent('admin', `${banned ? 'Banned' : 'Kicked'} ${user.nick} — ${reason}`);
  if (user.roomId) { const rid = user.roomId; endCall(rid, 'Moderator ended the session'); closeRoom(rid, 'moderator'); }
  leaveQueue(user);
  const socket = io.sockets.sockets.get(user.socketId);
  if (socket) {
    socket.emit('kicked', { reason: reason || (banned ? 'You have been banned.' : 'You were removed by a moderator.'), banned: !!banned });
    setTimeout(() => socket.disconnect(true), 400);
  }
}

/* ------------------------------------------------------------------ *
 * Periodic jobs
 * ------------------------------------------------------------------ */
// queue timeout (tell user nobody found yet)
setInterval(() => {
  const now = Date.now();
  for (const uid of [...queue]) {
    const u = users.get(uid);
    if (!u) { leaveQueue({ id: uid, state: 'queued' }); continue; }
    const waited = Math.round((now - (u.queuedAt || now)) / 1000);
    if (waited > 0 && waited % 20 === 0) emitToUser(uid, 'queue:tick', { waited });
    if (waited > settings.limits.queueTimeoutSec) {
      leaveQueue(u);
      emitToUser(uid, 'queue:timeout', { message: 'No one is available right now. Tap “Find someone” to try again.' });
    }
  }
}, 5000).unref();

// admin live snapshot
setInterval(() => {
  if (!adminSockets.size) return;
  const snap = adminSnapshot();
  for (const sid of adminSockets) io.to(sid).emit('admin:snapshot', snap);
}, 3000).unref();

// presence broadcast
setInterval(() => {
  io.emit('presence', { online: onlineCount(), capacity: settings.limits.maxOnline, chats: roomList().length, calls: activeCalls() });
}, 10000).unref();

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */
loadSettings();
loadStats();
loadPushSubs();
initPush();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] GOD'S WILL running on http://0.0.0.0:${PORT}`);
  console.log(`[server] capacity: ${settings.limits.maxOnline} users • max image ${settings.limits.maxImageMB}MB • max voice note ${settings.limits.maxVoiceNoteMB}MB`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log('[server] shutting down (' + sig + ')');
    try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2)); fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)); } catch (_) {}
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  });
}

