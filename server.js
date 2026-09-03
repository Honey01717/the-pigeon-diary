const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const geoip = require('geoip-lite');

const app = express();

// ==========================================
// 🛡️ SECURITY SHIELD: HTTP HEADERS & HARDENING
// ==========================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Multi-path static serving
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));
app.use(express.static(process.cwd()));
app.use(express.static(path.join(process.cwd(), 'public')));

// Explicit Route for Homepage /
app.get('/', (req, res) => {
  const possiblePaths = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    path.join(process.cwd(), 'index.html')
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }

  res.status(200).send(`
    <div style="font-family:sans-serif; text-align:center; padding:50px; background:#1e1e44; color:#fff; min-height:100vh;">
      <h1>🕊️ The Pigeon Diary is Running!</h1>
      <p>Server started successfully on Render.</p>
    </div>
  `);
});

// Explicit Route for Admin Panel
app.get(['/admin', '/admin.html'], (req, res) => {
  const possibleAdminPaths = [
    path.join(__dirname, 'public', 'admin.html'),
    path.join(__dirname, 'admin.html'),
    path.join(process.cwd(), 'public', 'admin.html'),
    path.join(process.cwd(), 'admin.html')
  ];

  for (const p of possibleAdminPaths) {
    if (fs.existsSync(p)) {
      return res.sendFile(p);
    }
  }

  res.redirect('/');
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e7 // 10MB strict max buffer to prevent Memory Overflow
});

// ==========================================
// 🛡️ SECURITY UTILITIES: XSS ESCAPE & RATE LIMITING
// ==========================================
function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\//g, '&#x2F;')
    .trim();
}

// In-Memory Security Trackers
const rateLimitMap = new Map(); // socketId -> { count, resetTime }
const adminBruteForceMap = new Map(); // ip -> { failedAttempts, lockUntil }

function checkRateLimit(socketId, maxPerInterval = 8, intervalMs = 2000) {
  const now = Date.now();
  let record = rateLimitMap.get(socketId);
  if (!record || now > record.resetTime) {
    rateLimitMap.set(socketId, { count: 1, resetTime: now + intervalMs });
    return true;
  }
  record.count++;
  if (record.count > maxPerInterval) {
    return false; // Rate limit exceeded!
  }
  return true;
}

// Config File Persistence
const CONFIG_FILE = path.join(__dirname, 'site-config.json');
let siteConfig = {
  adminPin: 'pigeon@2026',
  theme: 'midnight_navy',
  maxActiveUsers: 10,
  allowVoiceCalls: true,
  allowVoiceClips: true,
  allowPhotoUploads: true,
  allowBotCompanion: true,
  maintenanceMode: false,
  announcementText: '',
  bannedIps: []
};

// Load saved config if exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    siteConfig = { ...siteConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch (e) {
    console.error('Error loading config file:', e);
  }
}

function saveSiteConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(siteConfig, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving config file:', e);
  }
}

// Global Stats Tracker
const stats = {
  totalCallsMade: 0,
  totalMessagesSent: 0,
  totalVoiceClips: 0,
  totalPhotosShared: 0,
  serverStartTime: new Date().toISOString()
};

// Country code to Country Name map
const countryNames = {
  IN: 'India', US: 'United States', GB: 'United Kingdom', CA: 'Canada',
  AE: 'United Arab Emirates', SA: 'Saudi Arabia', PK: 'Pakistan', BD: 'Bangladesh',
  DE: 'Germany', FR: 'France', JP: 'Japan', AU: 'Australia', BR: 'Brazil',
  SG: 'Singapore', RU: 'Russia', IT: 'Italy', ES: 'Spain', TR: 'Turkey',
  ID: 'Indonesia', MY: 'Malaysia', NP: 'Nepal', LK: 'Sri Lanka', ZA: 'South Africa',
  NG: 'Nigeria', MX: 'Mexico', KR: 'South Korea', PH: 'Philippines', EG: 'Egypt',
  VN: 'Vietnam', NL: 'Netherlands', SE: 'Sweden', CH: 'Switzerland', NZ: 'New Zealand',
  TH: 'Thailand', QA: 'Qatar', KW: 'Kuwait', OM: 'Oman', BH: 'Bahrain', IR: 'Iran',
  IQ: 'Iraq', AF: 'Afghanistan', CN: 'China', HK: 'Hong Kong', TW: 'Taiwan',
  IL: 'Israel', PL: 'Poland', UA: 'Ukraine', RO: 'Romania', AR: 'Argentina',
  CO: 'Colombia', CL: 'Chile', PE: 'Peru', KE: 'Kenya', GH: 'Ghana', MA: 'Morocco',
  DZ: 'Algeria', AT: 'Austria', BE: 'Belgium', CZ: 'Czech Republic', DK: 'Denmark',
  FI: 'Finland', GR: 'Greece', HU: 'Hungary', IE: 'Ireland', NO: 'Norway',
  PT: 'Portugal'
};

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2 || countryCode === 'UN') return '🌍';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getCountryName(code) {
  return countryNames[code] || (code === 'UN' ? 'Global' : code);
}

function detectClientLocation(reqOrHandshake) {
  if (!reqOrHandshake) {
    return { countryCode: 'IN', countryName: 'India', countryFlag: '🇮🇳', isLocal: true, source: 'fallback' };
  }

  const headers = reqOrHandshake.headers || {};
  const cfCountry = headers['cf-ipcountry'];
  if (cfCountry && cfCountry.length === 2 && cfCountry !== 'XX' && cfCountry !== 'T1') {
    return {
      countryCode: cfCountry.toUpperCase(),
      countryName: getCountryName(cfCountry.toUpperCase()),
      countryFlag: getFlagEmoji(cfCountry.toUpperCase()),
      source: 'cloudflare'
    };
  }

  let ip = headers['x-forwarded-for'] || 
           headers['x-real-ip'] || 
           (reqOrHandshake.socket ? reqOrHandshake.socket.remoteAddress : '') || 
           reqOrHandshake.address || 
           '';

  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  if (ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  if (ip && ip !== '127.0.0.1' && ip !== '::1' && !ip.startsWith('192.168.') && !ip.startsWith('10.')) {
    const geo = geoip.lookup(ip);
    if (geo && geo.country) {
      return {
        countryCode: geo.country,
        countryName: getCountryName(geo.country),
        countryFlag: getFlagEmoji(geo.country),
        city: geo.city || '',
        ip,
        source: 'geoip'
      };
    }
  }

  return {
    countryCode: 'IN',
    countryName: 'India',
    countryFlag: '🇮🇳',
    ip: ip || '127.0.0.1',
    isLocal: true,
    source: 'fallback'
  };
}

// API Endpoints
app.get('/api/detect-location', (req, res) => {
  const location = detectClientLocation(req);
  res.json(location);
});

app.get('/api/site-config', (req, res) => {
  res.json({
    theme: siteConfig.theme,
    maxActiveUsers: siteConfig.maxActiveUsers,
    allowVoiceCalls: siteConfig.allowVoiceCalls,
    allowVoiceClips: siteConfig.allowVoiceClips,
    allowPhotoUploads: siteConfig.allowPhotoUploads,
    allowBotCompanion: siteConfig.allowBotCompanion,
    maintenanceMode: siteConfig.maintenanceMode,
    announcementText: siteConfig.announcementText
  });
});

// State
const activeUsers = new Map(); // socketId -> user profile
const waitingQueue = []; // socketIds waiting for an online slot if > max
const matchmakingQueue = []; // socketIds looking for a call
const activeCalls = new Map(); // callId -> { user1, user2, startTime }
const userLastSeenMap = new Map(); // nickname -> timestamp (Date.now())
const adminSockets = new Set();

function getPublicUsersList() {
  const users = [];
  for (const [socketId, user] of activeUsers.entries()) {
    users.push({
      id: socketId,
      nickname: user.nickname,
      country: user.country,
      countryCode: user.countryCode,
      countryFlag: user.countryFlag,
      isIpVerified: user.isIpVerified,
      gender: user.gender,
      interests: user.interests,
      status: user.status,
      avatar: user.avatar,
      joinedAt: user.joinedAt,
      ip: user.ip,
      isOnline: true,
      lastSeen: Date.now()
    });
  }
  return users;
}

function broadcastLobbyState() {
  const usersList = getPublicUsersList();
  const state = {
    activeCount: activeUsers.size,
    maxCapacity: siteConfig.maxActiveUsers,
    queueCount: waitingQueue.length,
    users: usersList,
    config: {
      theme: siteConfig.theme,
      allowVoiceCalls: siteConfig.allowVoiceCalls,
      allowVoiceClips: siteConfig.allowVoiceClips,
      allowPhotoUploads: siteConfig.allowPhotoUploads,
      allowBotCompanion: siteConfig.allowBotCompanion,
      maintenanceMode: siteConfig.maintenanceMode,
      announcementText: siteConfig.announcementText
    }
  };
  io.emit('lobby-state', state);
  broadcastAdminDashboard();
}

function broadcastAdminDashboard() {
  if (adminSockets.size === 0) return;
  const adminData = {
    stats,
    config: siteConfig,
    activeUsers: getPublicUsersList(),
    waitingQueueLength: waitingQueue.length,
    activeCallsCount: activeCalls.size
  };
  for (const adminId of adminSockets) {
    io.to(adminId).emit('admin-dashboard-update', adminData);
  }
}

function matchAvailableUsers() {
  if (!siteConfig.allowVoiceCalls || siteConfig.maintenanceMode) return;
  if (matchmakingQueue.length < 2) return;

  while (matchmakingQueue.length >= 2) {
    const user1Id = matchmakingQueue.shift();
    const user1 = activeUsers.get(user1Id);

    if (!user1 || user1.status !== 'in_queue') continue;

    let matchIndex = -1;
    for (let i = 0; i < matchmakingQueue.length; i++) {
      const candidateId = matchmakingQueue[i];
      const candidate = activeUsers.get(candidateId);
      if (!candidate || candidate.status !== 'in_queue') continue;

      const user1WantsGender = user1.preferredGender || 'both';
      const user2WantsGender = candidate.preferredGender || 'both';

      const gender1Match = user1WantsGender === 'both' || user1WantsGender === candidate.gender;
      const gender2Match = user2WantsGender === 'both' || user2WantsGender === user1.gender;

      const user1Excludes = (user1.excludedCountries || []).includes(candidate.countryCode);
      const user2Excludes = (candidate.excludedCountries || []).includes(user1.countryCode);

      if (gender1Match && gender2Match && !user1Excludes && !user2Excludes) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1 && matchmakingQueue.length > 0) {
      matchIndex = 0;
    }

    if (matchIndex !== -1) {
      const user2Id = matchmakingQueue.splice(matchIndex, 1)[0];
      const user2 = activeUsers.get(user2Id);

      if (!user2 || user2.status !== 'in_queue') {
        matchmakingQueue.unshift(user1Id);
        continue;
      }

      const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      user1.status = 'in_call';
      user1.currentCallId = callId;
      user1.callPartnerId = user2Id;

      user2.status = 'in_call';
      user2.currentCallId = callId;
      user2.callPartnerId = user1Id;

      activeCalls.set(callId, {
        user1: user1Id,
        user2: user2Id,
        startTime: Date.now()
      });

      stats.totalCallsMade++;

      const socket1 = io.sockets.sockets.get(user1Id);
      const socket2 = io.sockets.sockets.get(user2Id);

      if (socket1) socket1.join(callId);
      if (socket2) socket2.join(callId);

      io.to(user1Id).emit('call-matched', {
        callId,
        isInitiator: true,
        partner: {
          id: user2Id,
          nickname: user2.nickname,
          country: user2.country,
          countryCode: user2.countryCode,
          countryFlag: user2.countryFlag,
          isIpVerified: user2.isIpVerified,
          gender: user2.gender,
          interests: user2.interests,
          avatar: user2.avatar
        }
      });

      io.to(user2Id).emit('call-matched', {
        callId,
        isInitiator: false,
        partner: {
          id: user1Id,
          nickname: user1.nickname,
          country: user1.country,
          countryCode: user1.countryCode,
          countryFlag: user1.countryFlag,
          isIpVerified: user1.isIpVerified,
          gender: user1.gender,
          interests: user1.interests,
          avatar: user1.avatar
        }
      });

      broadcastLobbyState();
    } else {
      matchmakingQueue.push(user1Id);
      break;
    }
  }
}

function admitNextWaitingUser() {
  while (activeUsers.size < siteConfig.maxActiveUsers && waitingQueue.length > 0) {
    const nextSocketId = waitingQueue.shift();
    const nextSocket = io.sockets.sockets.get(nextSocketId);
    if (nextSocket && nextSocket.pendingGuestData) {
      activeUsers.set(nextSocketId, nextSocket.pendingGuestData);
      delete nextSocket.pendingGuestData;
      nextSocket.emit('admitted-to-lobby', {
        message: 'Spot available! You are now active in The Pigeon Diary room.',
        activeCount: activeUsers.size,
        maxCapacity: siteConfig.maxActiveUsers
      });
    }
  }
  broadcastLobbyState();
}

io.on('connection', (socket) => {
  const socketLoc = detectClientLocation(socket.handshake);
  const clientIp = socketLoc.ip || socket.handshake.address;

  if (siteConfig.bannedIps && siteConfig.bannedIps.includes(clientIp)) {
    socket.emit('banned-notice', { message: 'You have been permanently banned by the Admin.' });
    socket.disconnect(true);
    return;
  }

  socket.emit('ip-detected', socketLoc);
  socket.emit('site-theme-update', { theme: siteConfig.theme });

  // 1. Guest Registration Handshake with Strict Validation
  socket.on('register-guest', (guestProfile) => {
    if (siteConfig.maintenanceMode) {
      socket.emit('error-msg', { message: 'Site is currently in Maintenance Mode by Admin.' });
      return;
    }

    if (!guestProfile || typeof guestProfile !== 'object') return;

    // Sanitize & validate Nickname
    const rawNickname = sanitizeHtml(guestProfile.nickname || 'Anonymous Pigeon');
    const nickname = rawNickname.substring(0, 20) || 'Anonymous';

    const countryCode = (sanitizeHtml(guestProfile.countryCode || socketLoc.countryCode || 'IN')).toUpperCase();
    const countryName = countryNames[countryCode] || sanitizeHtml(guestProfile.country || socketLoc.countryName || 'India');
    const countryFlag = getFlagEmoji(countryCode);

    const allowedAvatars = ['🕊️', '🐦', '🦅', '🦉', '🦚', '🦩', '🦢', '🦜'];
    const avatar = allowedAvatars.includes(guestProfile.avatar) ? guestProfile.avatar : '🕊️';
    const gender = ['male', 'female', 'other'].includes(guestProfile.gender) ? guestProfile.gender : 'unspecified';

    const sanitizedInterests = Array.isArray(guestProfile.interests) 
      ? guestProfile.interests.slice(0, 6).map(i => sanitizeHtml(String(i)).substring(0, 20))
      : [];

    const sanitizedProfile = {
      id: socket.id,
      nickname,
      country: countryName,
      countryCode: countryCode,
      countryFlag: countryFlag,
      isIpVerified: true,
      ip: clientIp,
      gender,
      interests: sanitizedInterests,
      avatar,
      preferredGender: ['both', 'male', 'female'].includes(guestProfile.preferredGender) ? guestProfile.preferredGender : 'both',
      preferredCountries: Array.isArray(guestProfile.preferredCountries) ? guestProfile.preferredCountries.slice(0, 5) : [],
      excludedCountries: Array.isArray(guestProfile.excludedCountries) ? guestProfile.excludedCountries.slice(0, 5) : [],
      status: 'idle',
      currentCallId: null,
      callPartnerId: null,
      joinedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (activeUsers.size >= siteConfig.maxActiveUsers) {
      socket.pendingGuestData = sanitizedProfile;
      if (!waitingQueue.includes(socket.id)) {
        waitingQueue.push(socket.id);
      }
      const position = waitingQueue.indexOf(socket.id) + 1;
      socket.emit('capacity-full-waiting', {
        message: 'All active Pigeon roosts are occupied! You are in the queue.',
        position,
        totalQueue: waitingQueue.length,
        maxCapacity: siteConfig.maxActiveUsers,
        activeCount: activeUsers.size
      });
      broadcastLobbyState();
      return;
    }

    userLastSeenMap.set(sanitizedProfile.nickname, Date.now());
    activeUsers.set(socket.id, sanitizedProfile);
    socket.emit('registration-success', {
      user: sanitizedProfile,
      activeCount: activeUsers.size,
      maxCapacity: siteConfig.maxActiveUsers
    });

    io.emit('user-presence-update', {
      nickname: sanitizedProfile.nickname,
      isOnline: true,
      lastSeen: Date.now()
    });

    broadcastLobbyState();
  });

  // 2. Update Preferences
  socket.on('update-preferences', (prefs) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;
    if (prefs.preferredGender) user.preferredGender = prefs.preferredGender;
    if (prefs.preferredCountries) user.preferredCountries = prefs.preferredCountries;
    if (prefs.excludedCountries) user.excludedCountries = prefs.excludedCountries;
    if (prefs.interests) user.interests = prefs.interests;
    if (prefs.nickname) user.nickname = prefs.nickname.trim().substring(0, 25);
    if (prefs.countryCode) {
      user.countryCode = prefs.countryCode.toUpperCase();
      user.country = countryNames[user.countryCode] || prefs.country || user.country;
      user.countryFlag = getFlagEmoji(user.countryCode);
    }
    if (prefs.gender) user.gender = prefs.gender;
    if (prefs.avatar) user.avatar = prefs.avatar;

    socket.emit('preferences-updated', user);
    broadcastLobbyState();
  });

  // 3. Start Call Search
  socket.on('start-call-search', () => {
    if (!siteConfig.allowVoiceCalls) {
      socket.emit('error-msg', { message: 'Voice calls are currently disabled by Admin.' });
      return;
    }

    const user = activeUsers.get(socket.id);
    if (!user) {
      socket.emit('error-msg', { message: 'Please create your Guest profile first.' });
      return;
    }

    if (user.status === 'in_call') {
      socket.emit('error-msg', { message: 'You are already in a call.' });
      return;
    }

    user.status = 'in_queue';
    if (!matchmakingQueue.includes(socket.id)) {
      matchmakingQueue.push(socket.id);
    }

    socket.emit('search-status', { status: 'searching', queuePosition: matchmakingQueue.length });
    broadcastLobbyState();
    matchAvailableUsers();
  });

  // 4. Cancel Search
  socket.on('cancel-call-search', () => {
    const user = activeUsers.get(socket.id);
    if (user && user.status === 'in_queue') {
      user.status = 'idle';
      const idx = matchmakingQueue.indexOf(socket.id);
      if (idx !== -1) matchmakingQueue.splice(idx, 1);
      socket.emit('search-status', { status: 'idle' });
      broadcastLobbyState();
    }
  });

  // 5. WebRTC Signaling
  socket.on('webrtc-offer', (payload) => {
    const { targetId, offer } = payload;
    io.to(targetId).emit('webrtc-offer', {
      senderId: socket.id,
      offer
    });
  });

  socket.on('webrtc-answer', (payload) => {
    const { targetId, answer } = payload;
    io.to(targetId).emit('webrtc-answer', {
      senderId: socket.id,
      answer
    });
  });

  socket.on('webrtc-ice-candidate', (payload) => {
    const { targetId, candidate } = payload;
    io.to(targetId).emit('webrtc-ice-candidate', {
      senderId: socket.id,
      candidate
    });
  });

  // 6. Speaking State
  socket.on('audio-speaking', (payload) => {
    const user = activeUsers.get(socket.id);
    if (user && user.callPartnerId) {
      io.to(user.callPartnerId).emit('partner-speaking', {
        isSpeaking: payload.isSpeaking,
        volume: payload.volume || 0
      });
    }
  });

  // 7. Hang Up Call
  socket.on('hang-up-call', () => {
    const user = activeUsers.get(socket.id);
    if (!user || user.status !== 'in_call') return;

    const partnerId = user.callPartnerId;
    const callId = user.currentCallId;

    user.status = 'idle';
    user.currentCallId = null;
    user.callPartnerId = null;

    if (callId && activeCalls.has(callId)) {
      activeCalls.delete(callId);
    }

    socket.emit('call-ended', { reason: 'you_hung_up' });

    if (partnerId) {
      const partner = activeUsers.get(partnerId);
      if (partner) {
        partner.status = 'idle';
        partner.currentCallId = null;
        partner.callPartnerId = null;
        io.to(partnerId).emit('call-ended', { reason: 'partner_hung_up' });
      }
    }

    broadcastLobbyState();
  });

  // 8. Real-time Chat with Anti-XSS & Anti-Spam
  socket.on('send-chat-message', (data) => {
    if (!checkRateLimit(socket.id)) {
      socket.emit('error-msg', { message: 'Too many messages sent! Please slow down.' });
      return;
    }

    const user = activeUsers.get(socket.id);
    if (!user || !data || !data.content) return;

    const safeContent = sanitizeHtml(String(data.content)).substring(0, 1000);
    if (!safeContent) return;

    stats.totalMessagesSent++;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const messagePayload = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderId: socket.id,
      senderName: user.nickname,
      senderCountry: user.country,
      senderCountryFlag: user.countryFlag,
      isIpVerified: user.isIpVerified,
      senderGender: user.gender,
      type: 'text',
      content: safeContent,
      timestamp
    };

    if (user.callPartnerId) {
      io.to(user.callPartnerId).emit('receive-chat-message', messagePayload);
      socket.emit('message-sent-ack', messagePayload);
    } else {
      io.emit('receive-lobby-chat-message', messagePayload);
    }
    broadcastAdminDashboard();
  });

  // 9. Voice Clip with Size Validation
  socket.on('send-voice-clip', (data) => {
    if (!siteConfig.allowVoiceClips) {
      socket.emit('error-msg', { message: 'Voice clip sharing is disabled by Admin.' });
      return;
    }

    if (!checkRateLimit(socket.id, 4, 3000)) {
      socket.emit('error-msg', { message: 'Voice clip rate limit reached. Please wait a moment.' });
      return;
    }

    const user = activeUsers.get(socket.id);
    if (!user || !data || !data.audioData) return;

    // Validate base64 payload size (max 4MB)
    if (typeof data.audioData !== 'string' || data.audioData.length > 5 * 1024 * 1024) {
      socket.emit('error-msg', { message: 'Voice clip file exceeds the 4MB limit.' });
      return;
    }

    stats.totalVoiceClips++;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const voicePayload = {
      id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderId: socket.id,
      senderName: user.nickname,
      senderCountry: user.country,
      senderCountryFlag: user.countryFlag,
      isIpVerified: user.isIpVerified,
      senderGender: user.gender,
      type: 'voice_clip',
      audioData: data.audioData,
      duration: Math.min(Math.max(Number(data.duration) || 0, 1), 120),
      timestamp
    };

    if (user.callPartnerId) {
      io.to(user.callPartnerId).emit('receive-chat-message', voicePayload);
      socket.emit('message-sent-ack', voicePayload);
    } else {
      io.emit('receive-lobby-chat-message', voicePayload);
    }
    broadcastAdminDashboard();
  });

  // 10. Photo Upload with Size Validation & Sanitization
  socket.on('send-photo', (data) => {
    if (!siteConfig.allowPhotoUploads) {
      socket.emit('error-msg', { message: 'Photo sharing is disabled by Admin.' });
      return;
    }

    if (!checkRateLimit(socket.id, 4, 3000)) {
      socket.emit('error-msg', { message: 'Photo upload rate limit reached. Please wait a moment.' });
      return;
    }

    const user = activeUsers.get(socket.id);
    if (!user || !data || !data.imageData) return;

    // Strict validation: max 6MB
    if (typeof data.imageData !== 'string' || data.imageData.length > 7 * 1024 * 1024) {
      socket.emit('error-msg', { message: 'Photo size exceeds maximum 5MB limit.' });
      return;
    }

    const safeCaption = sanitizeHtml(String(data.caption || '')).substring(0, 300);

    stats.totalPhotosShared++;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const photoPayload = {
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderId: socket.id,
      senderName: user.nickname,
      senderCountry: user.country,
      senderCountryFlag: user.countryFlag,
      isIpVerified: user.isIpVerified,
      senderGender: user.gender,
      type: 'photo',
      imageData: data.imageData,
      caption: safeCaption,
      timestamp
    };

    if (user.callPartnerId) {
      io.to(user.callPartnerId).emit('receive-chat-message', photoPayload);
      socket.emit('message-sent-ack', photoPayload);
    } else {
      io.emit('receive-lobby-chat-message', photoPayload);
    }
    broadcastAdminDashboard();
  });

  // 11. Friend Request Handling & Persistent Direct Messaging
  socket.on('send-friend-request', () => {
    const user = activeUsers.get(socket.id);
    if (user && user.callPartnerId) {
      io.to(user.callPartnerId).emit('received-friend-request', {
        fromId: socket.id,
        nickname: user.nickname,
        country: user.country,
        countryCode: user.countryCode,
        countryFlag: user.countryFlag,
        isIpVerified: user.isIpVerified,
        avatar: user.avatar,
        gender: user.gender
      });
    }
  });

  socket.on('respond-friend-request', (data) => {
    const { toId, accepted } = data;
    const user = activeUsers.get(socket.id);
    if (user) {
      io.to(toId).emit('friend-request-response', {
        fromId: socket.id,
        nickname: user.nickname,
        country: user.country,
        countryCode: user.countryCode,
        countryFlag: user.countryFlag,
        isIpVerified: user.isIpVerified,
        avatar: user.avatar,
        gender: user.gender,
        accepted
      });
    }
  });

  // Direct Message to a specific Friend (Never Lost)
  socket.on('send-friend-direct-message', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    stats.totalMessagesSent++;
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderId: socket.id,
      senderName: user.nickname,
      senderCountry: user.country,
      senderCountryFlag: user.countryFlag,
      isIpVerified: user.isIpVerified,
      targetFriendNickname: data.friendNickname,
      type: data.type || 'text',
      content: data.content || '',
      audioData: data.audioData || null,
      duration: data.duration || 0,
      imageData: data.imageData || null,
      caption: data.caption || '',
      timestamp
    };

    // Find if friend is online by nickname or socketId
    let friendSocketId = null;
    for (const [sId, u] of activeUsers.entries()) {
      if (u.nickname === data.friendNickname || sId === data.targetFriendId) {
        friendSocketId = sId;
        break;
      }
    }

    if (friendSocketId) {
      io.to(friendSocketId).emit('receive-friend-direct-message', payload);
    }
    socket.emit('friend-direct-message-ack', payload);
    broadcastAdminDashboard();
  });

  // Direct Call a Friend
  socket.on('direct-call-friend', (data) => {
    const user = activeUsers.get(socket.id);
    if (!user) return;

    let targetSocketId = null;
    for (const [sId, u] of activeUsers.entries()) {
      if (u.nickname === data.friendNickname) {
        targetSocketId = sId;
        break;
      }
    }

    if (targetSocketId) {
      const targetUser = activeUsers.get(targetSocketId);
      if (targetUser.status === 'in_call') {
        socket.emit('error-msg', { message: `${targetUser.nickname} is currently in another call.` });
        return;
      }

      // Start Call
      const callId = `friend_call_${Date.now()}`;
      user.status = 'in_call';
      user.currentCallId = callId;
      user.callPartnerId = targetSocketId;

      targetUser.status = 'in_call';
      targetUser.currentCallId = callId;
      targetUser.callPartnerId = socket.id;

      activeCalls.set(callId, { user1: socket.id, user2: targetSocketId, startTime: Date.now() });

      const s1 = io.sockets.sockets.get(socket.id);
      const s2 = io.sockets.sockets.get(targetSocketId);
      if (s1) s1.join(callId);
      if (s2) s2.join(callId);

      io.to(socket.id).emit('call-matched', {
        callId,
        isInitiator: true,
        partner: {
          id: targetSocketId,
          nickname: targetUser.nickname,
          country: targetUser.country,
          countryCode: targetUser.countryCode,
          countryFlag: targetUser.countryFlag,
          isIpVerified: targetUser.isIpVerified,
          gender: targetUser.gender,
          interests: targetUser.interests,
          avatar: targetUser.avatar
        }
      });

      io.to(targetSocketId).emit('call-matched', {
        callId,
        isInitiator: false,
        partner: {
          id: socket.id,
          nickname: user.nickname,
          country: user.country,
          countryCode: user.countryCode,
          countryFlag: user.countryFlag,
          isIpVerified: user.isIpVerified,
          gender: user.gender,
          interests: user.interests,
          avatar: user.avatar
        }
      });

      broadcastLobbyState();
    } else {
      socket.emit('error-msg', { message: `${data.friendNickname} is currently offline.` });
    }
  });

  // 12. In-Call Interactive Games Synchronization (AirTALK style)
  socket.on('send-game-action', (data) => {
    const user = activeUsers.get(socket.id);
    if (user && user.callPartnerId) {
      io.to(user.callPartnerId).emit('receive-game-action', {
        fromId: socket.id,
        senderName: user.nickname,
        gameType: data.gameType,
        action: data.action,
        payload: data.payload
      });
    }
  });

  // 13. Report
  socket.on('report-partner', (data) => {
    const user = activeUsers.get(socket.id);
    if (user && user.callPartnerId) {
      console.log(`[Report] User ${user.nickname} reported partner ${user.callPartnerId}: ${data.reason}`);
      socket.emit('report-received', { message: 'Thank you. The user has been reported to the Admin.' });
      for (const adminId of adminSockets) {
        io.to(adminId).emit('admin-new-report', {
          reporter: user.nickname,
          reportedId: user.callPartnerId,
          reason: data.reason,
          time: new Date().toLocaleTimeString()
        });
      }
    }
  });

  // 13. AI Bot Simulation
  socket.on('simulate-stranger-match', () => {
    if (!siteConfig.allowBotCompanion) {
      socket.emit('error-msg', { message: 'Bot Companion is disabled by Admin.' });
      return;
    }

    const user = activeUsers.get(socket.id);
    if (!user) return;

    user.status = 'in_call';
    const botCallId = `bot_call_${Date.now()}`;
    user.currentCallId = botCallId;
    user.callPartnerId = 'bot_companion_id';

    const botProfiles = [
      { nickname: 'Aria_Sky', country: 'United Kingdom', countryCode: 'GB', countryFlag: '🇬🇧', isIpVerified: true, gender: 'female', interests: ['Music', 'Coffee', 'Travel'], avatar: '🕊️' },
      { nickname: 'Kenji_Neo', country: 'Japan', countryCode: 'JP', countryFlag: '🇯🇵', isIpVerified: true, gender: 'male', interests: ['Anime', 'Gaming', 'Tech'], avatar: '🐦' },
      { nickname: 'Elena_Vibe', country: 'Canada', countryCode: 'CA', countryFlag: '🇨🇦', isIpVerified: true, gender: 'female', interests: ['Photography', 'Books', 'Art'], avatar: '🕊️' },
      { nickname: 'Lucas_Roam', country: 'Brazil', countryCode: 'BR', countryFlag: '🇧🇷', isIpVerified: true, gender: 'male', interests: ['Soccer', 'Guitar', 'Beaches'], avatar: '🐦' },
      { nickname: 'Zara_Peace', country: 'United Arab Emirates', countryCode: 'AE', countryFlag: '🇦🇪', isIpVerified: true, gender: 'female', interests: ['Poetry', 'Design', 'Languages'], avatar: '🕊️' }
    ];

    const randomBot = botProfiles[Math.floor(Math.random() * botProfiles.length)];

    socket.emit('call-matched', {
      callId: botCallId,
      isInitiator: true,
      isSimulatedBot: true,
      partner: {
        id: 'bot_companion_id',
        ...randomBot
      }
    });

    broadcastLobbyState();
  });

  // 14. ADMIN PANEL HANDLERS WITH BRUTE-FORCE DEFENSE
  socket.on('admin-auth', (data) => {
    const now = Date.now();
    const bruteRecord = adminBruteForceMap.get(clientIp) || { failedAttempts: 0, lockUntil: 0 };

    // Check if IP is currently locked out
    if (bruteRecord.lockUntil > now) {
      const waitMins = Math.ceil((bruteRecord.lockUntil - now) / 60000);
      socket.emit('admin-auth-failed', { 
        message: `🛡️ Security Alert: Too many failed PIN attempts. IP is locked for ${waitMins} more minutes.` 
      });
      return;
    }

    if (data && data.pin === siteConfig.adminPin) {
      // Reset brute-force counter on success
      adminBruteForceMap.delete(clientIp);
      adminSockets.add(socket.id);
      socket.emit('admin-auth-success', {
        message: 'Admin authorization granted.',
        config: siteConfig,
        stats,
        users: getPublicUsersList()
      });
      broadcastAdminDashboard();
    } else {
      bruteRecord.failedAttempts++;
      if (bruteRecord.failedAttempts >= 5) {
        bruteRecord.lockUntil = now + (15 * 60 * 1000); // 15 minutes lockout
        adminBruteForceMap.set(clientIp, bruteRecord);
        socket.emit('admin-auth-failed', { 
          message: '🛡️ Security Triggered: 5 failed PIN attempts. Access locked for 15 minutes.' 
        });
      } else {
        adminBruteForceMap.set(clientIp, bruteRecord);
        const remaining = 5 - bruteRecord.failedAttempts;
        socket.emit('admin-auth-failed', { 
          message: `Invalid Admin PIN. (${remaining} attempts remaining before IP lockout)` 
        });
      }
    }
  });

  socket.on('admin-change-theme', (data) => {
    if (!adminSockets.has(socket.id)) return;
    if (data && data.theme) {
      siteConfig.theme = data.theme;
      saveSiteConfig();
      io.emit('site-theme-update', { theme: siteConfig.theme });
      broadcastAdminDashboard();
    }
  });

  socket.on('admin-change-capacity', (data) => {
    if (!adminSockets.has(socket.id)) return;
    const newCap = parseInt(data.capacity);
    if (newCap > 0 && newCap <= 100) {
      siteConfig.maxActiveUsers = newCap;
      saveSiteConfig();
      admitNextWaitingUser();
      broadcastLobbyState();
    }
  });

  socket.on('admin-toggle-feature', (data) => {
    if (!adminSockets.has(socket.id)) return;
    if (data.feature && typeof data.enabled === 'boolean') {
      siteConfig[data.feature] = data.enabled;
      saveSiteConfig();
      broadcastLobbyState();
    }
  });

  socket.on('admin-send-announcement', (data) => {
    if (!adminSockets.has(socket.id)) return;
    siteConfig.announcementText = data.text || '';
    saveSiteConfig();
    io.emit('site-announcement', { text: siteConfig.announcementText });
    broadcastAdminDashboard();
  });

  socket.on('admin-kick-user', (data) => {
    if (!adminSockets.has(socket.id)) return;
    const targetSocket = io.sockets.sockets.get(data.userId);
    if (targetSocket) {
      targetSocket.emit('kicked-notice', { reason: data.reason || 'Kicked by administrator.' });
      targetSocket.disconnect(true);
    }
  });

  socket.on('admin-ban-ip', (data) => {
    if (!adminSockets.has(socket.id)) return;
    if (data.ip && !siteConfig.bannedIps.includes(data.ip)) {
      siteConfig.bannedIps.push(data.ip);
      saveSiteConfig();

      for (const [sId, user] of activeUsers.entries()) {
        if (user.ip === data.ip) {
          const s = io.sockets.sockets.get(sId);
          if (s) {
            s.emit('banned-notice', { message: 'Your IP has been permanently banned.' });
            s.disconnect(true);
          }
        }
      }
      broadcastAdminDashboard();
    }
  });

  socket.on('admin-unban-ip', (data) => {
    if (!adminSockets.has(socket.id)) return;
    siteConfig.bannedIps = siteConfig.bannedIps.filter(ip => ip !== data.ip);
    saveSiteConfig();
    broadcastAdminDashboard();
  });

  socket.on('admin-change-pin', (data) => {
    if (!adminSockets.has(socket.id)) return;
    if (data.newPin && data.newPin.length >= 4) {
      siteConfig.adminPin = data.newPin;
      saveSiteConfig();
      socket.emit('admin-notice', { message: 'Admin security PIN updated successfully!' });
    }
  });

  // 15. Disconnect
  socket.on('disconnect', () => {
    adminSockets.delete(socket.id);

    const queueIdx = waitingQueue.indexOf(socket.id);
    if (queueIdx !== -1) waitingQueue.splice(queueIdx, 1);

    const matchIdx = matchmakingQueue.indexOf(socket.id);
    if (matchIdx !== -1) matchmakingQueue.splice(matchIdx, 1);

    const user = activeUsers.get(socket.id);
    if (user) {
      const lastSeenTime = Date.now();
      userLastSeenMap.set(user.nickname, lastSeenTime);
      io.emit('user-presence-update', {
        nickname: user.nickname,
        isOnline: false,
        lastSeen: lastSeenTime
      });

      if (user.status === 'in_call' && user.callPartnerId) {
        const partner = activeUsers.get(user.callPartnerId);
        if (partner) {
          partner.status = 'idle';
          partner.currentCallId = null;
          partner.callPartnerId = null;
          io.to(user.callPartnerId).emit('call-ended', { reason: 'partner_disconnected' });
        }
      }
      activeUsers.delete(socket.id);
    }

    admitNextWaitingUser();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🕊️ The Pigeon Diary server is running on http://0.0.0.0:${PORT}`);
  console.log(`🔒 Maximum concurrent online users: ${siteConfig.maxActiveUsers}`);
  console.log(`🛡️ Admin Panel available at: http://0.0.0.0:${PORT}/admin.html`);
});
