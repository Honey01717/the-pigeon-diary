// ==========================================================================
// THE PIGEON DIARY – AIRTALK FRONTEND CONTROLLER (WITH REAL AI VOICE SPEECH,
// NOTIFICATIONS & 3-LINE MENU DRAWER)
// ==========================================================================

(() => {
  'use strict';

  // --- STATE ---
  let socket = null;
  let myProfile = null;
  let isInCall = false;
  let isInTextChat = false;
  let isSearching = false;
  let isTextSearching = false;
  let isMuted = false;
  let isAutoCallEnabled = false;
  let currentCallId = null;
  let callPartner = null;
  let isSimulatedBotCall = false;
  let isTextBotChat = false;
  let callTimerInterval = null;
  let callSeconds = 0;

  // WebRTC Audio Engine
  let peerConnection = null;
  let myLocalStream = null;
  let audioContext = null;
  let localAnalyser = null;
  let pendingIceCandidates = [];
  let isRemoteDescriptionSet = false;

  // STUN Servers
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' }
    ]
  };

  // Message Deduplication Shield
  const renderedMessageIds = new Set();

  // Voice Note Recorder State
  let mediaRecorder = null;
  let recordedAudioChunks = [];
  let recordTimerInterval = null;
  let recordingSeconds = 0;
  let pendingPhotoData = null;

  // Games State
  let tttBoard = Array(9).fill(null);
  let tttMySymbol = 'X';
  let tttGameOver = false;

  // Speech Recognition for AI Companion
  let speechRecognizer = null;
  let isAISpeaking = false;

  // Geolocation
  let detectedLocation = {
    countryCode: 'IN',
    countryName: 'India',
    countryFlag: '🇮🇳',
    isIpVerified: true
  };

  let onlineUsersGlobalList = [];
  let pendingFriendRequests = [];

  // Cached DOM Elements
  const el = {};

  function cacheDom() {
    // Views
    el.landingView = document.getElementById('landingView');
    el.voiceView = document.getElementById('voiceView');
    el.textView = document.getElementById('textView');

    // Landing View Elements
    el.landingOnlineCount = document.getElementById('landingOnlineCount');
    el.btnLandingMenu = document.getElementById('btnLandingMenu');
    el.btnStartVoiceHero = document.getElementById('btnStartVoiceHero');
    el.btnStartTextHero = document.getElementById('btnStartTextHero');
    el.btnGoToVoiceFromCard = document.getElementById('btnGoToVoiceFromCard');
    el.btnGoToTextFromCard = document.getElementById('btnGoToTextFromCard');

    // Voice View Elements
    el.voiceOnlineCount = document.getElementById('voiceOnlineCount');
    el.btnOpenFilters = document.getElementById('btnOpenFilters');
    el.btnOpenFriendsDrawer = document.getElementById('btnOpenFriendsDrawer');
    el.btnOpenGames = document.getElementById('btnOpenGames');
    el.btnVoiceHome = document.getElementById('btnVoiceHome');
    el.btnToggleInCallWhispers = document.getElementById('btnToggleInCallWhispers');
    el.whisperUnreadPulse = document.getElementById('whisperUnreadPulse');

    el.airtalkMainCircle = document.getElementById('airtalkMainCircle');
    el.speakingWave1 = document.getElementById('speakingWave1');
    el.speakingWave2 = document.getElementById('speakingWave2');
    el.voiceCallTimer = document.getElementById('voiceCallTimer');
    el.airtalkFloatingSubtitle = document.getElementById('airtalkFloatingSubtitle');
    el.subSenderName = document.getElementById('subSenderName');
    el.subMessageText = document.getElementById('subMessageText');
    el.voicePartnerPill = document.getElementById('voicePartnerPill');
    el.voicePartnerFlag = document.getElementById('voicePartnerFlag');
    el.voicePartnerName = document.getElementById('voicePartnerName');

    el.btnVoiceCallAction = document.getElementById('btnVoiceCallAction');
    el.iconVoiceCall = document.getElementById('iconVoiceCall');
    el.labelVoiceCall = document.getElementById('labelVoiceCall');
    el.btnVoiceMuteAction = document.getElementById('btnVoiceMuteAction');
    el.iconVoiceMute = document.getElementById('iconVoiceMute');
    el.labelVoiceMute = document.getElementById('labelVoiceMute');
    el.btnVoiceAddFriend = document.getElementById('btnVoiceAddFriend');
    el.btnVoiceReport = document.getElementById('btnVoiceReport');
    el.chkEnableAutoCall = document.getElementById('chkEnableAutoCall');
    el.btnOpenCallHistory = document.getElementById('btnOpenCallHistory');
    el.voiceHelperHint = document.getElementById('voiceHelperHint');
    el.btnVoiceTestBot = document.getElementById('btnVoiceTestBot');

    // Text View Elements
    el.textOnlineCount = document.getElementById('textOnlineCount');
    el.btnTextOpenFilters = document.getElementById('btnTextOpenFilters');
    el.btnTextOpenFriends = document.getElementById('btnTextOpenFriends');
    el.btnTextHome = document.getElementById('btnTextHome');
    el.textPartnerAvatar = document.getElementById('textPartnerAvatar');
    el.textPartnerTitle = document.getElementById('textPartnerTitle');
    el.textPartnerSubtitle = document.getElementById('textPartnerSubtitle');
    el.btnUpgradeTextToCall = document.getElementById('btnUpgradeTextToCall');
    el.btnTextAICompanion = document.getElementById('btnTextAICompanion');
    el.btnTextAddFriend = document.getElementById('btnTextAddFriend');
    el.btnTextNextStranger = document.getElementById('btnTextNextStranger');
    el.textMessagesContainer = document.getElementById('textMessagesContainer');
    el.textChatForm = document.getElementById('textChatForm');
    el.textChatInput = document.getElementById('textChatInput');
    el.btnSendText = document.getElementById('btnSendText');
    el.btnAttachPhoto = document.getElementById('btnAttachPhoto');
    el.imageFileInput = document.getElementById('imageFileInput');
    el.btnStartVoiceRecord = document.getElementById('btnStartVoiceRecord');
    el.voiceRecorderOverlay = document.getElementById('voiceRecorderOverlay');
    el.recordingTimer = document.getElementById('recordingTimer');
    el.btnCancelRecording = document.getElementById('btnCancelRecording');
    el.btnSendRecording = document.getElementById('btnSendRecording');
    el.photoPreviewBar = document.getElementById('photoPreviewBar');
    el.photoPreviewImg = document.getElementById('photoPreviewImg');
    el.photoCaptionInput = document.getElementById('photoCaptionInput');
    el.btnRemovePhoto = document.getElementById('btnRemovePhoto');
    el.btnSendPhoto = document.getElementById('btnSendPhoto');
    el.emojiChips = document.querySelectorAll('.emoji-chip');

    // In-Call Whispers Drawer
    el.inCallWhisperDrawer = document.getElementById('inCallWhisperDrawer');
    el.whisperDrawerCard = document.querySelector('.whisper-drawer-card');
    el.btnExpandWhisper = document.getElementById('btnExpandWhisper');
    el.iconExpandWhisper = document.getElementById('iconExpandWhisper');
    el.btnCloseWhisperDrawer = document.getElementById('btnCloseWhisperDrawer');
    el.whisperMessagesStream = document.getElementById('whisperMessagesStream');
    el.whisperChips = document.querySelectorAll('.w-chip');
    el.whisperInputForm = document.getElementById('whisperInputForm');
    el.whisperInput = document.getElementById('whisperInput');
    el.whisperPhotoPreviewBar = document.getElementById('whisperPhotoPreviewBar');
    el.whisperPhotoPreviewImg = document.getElementById('whisperPhotoPreviewImg');
    el.whisperPhotoCaptionInput = document.getElementById('whisperPhotoCaptionInput');
    el.btnWhisperRemovePhoto = document.getElementById('btnWhisperRemovePhoto');
    el.btnWhisperSendPhoto = document.getElementById('btnWhisperSendPhoto');
    el.whisperVoiceRecorderOverlay = document.getElementById('whisperVoiceRecorderOverlay');
    el.whisperRecordingTimer = document.getElementById('whisperRecordingTimer');
    el.btnWhisperCancelRecording = document.getElementById('btnWhisperCancelRecording');
    el.btnWhisperSendRecording = document.getElementById('btnWhisperSendRecording');
    el.whisperImageInput = document.getElementById('whisperImageInput');
    el.btnWhisperAttachPhoto = document.getElementById('btnWhisperAttachPhoto');
    el.btnWhisperVoiceRecord = document.getElementById('btnWhisperVoiceRecord');

    // Slide-out 3-Line Menu Drawer
    el.sideMenuDrawer = document.getElementById('sideMenuDrawer');
    el.sideMenuBackdrop = document.getElementById('sideMenuBackdrop');
    el.btnCloseSideMenu = document.getElementById('btnCloseSideMenu');
    el.menuItemVoiceChat = document.getElementById('menuItemVoiceChat');
    el.menuItemTextChat = document.getElementById('menuItemTextChat');
    el.menuItemAICompanion = document.getElementById('menuItemAICompanion');
    el.menuItemTextAI = document.getElementById('menuItemTextAI');
    el.menuItemFilters = document.getElementById('menuItemFilters');
    el.menuItemFriends = document.getElementById('menuItemFriends');
    el.menuItemGames = document.getElementById('menuItemGames');
    el.menuItemOnlineUsers = document.getElementById('menuItemOnlineUsers');

    // Audio Player
    el.remoteAudioStream = document.getElementById('remoteAudioStream');

    // Modals
    el.filtersModal = document.getElementById('filtersModal');
    el.btnCloseFiltersModal = document.getElementById('btnCloseFiltersModal');
    el.filterModalFlag = document.getElementById('filterModalFlag');
    el.filterModalCountryName = document.getElementById('filterModalCountryName');
    el.genderBtns = document.querySelectorAll('.gender-btn');
    el.prefCountrySelect = document.getElementById('prefCountrySelect');
    el.excludeCountrySelect = document.getElementById('excludeCountrySelect');
    el.interestChips = document.querySelectorAll('.interest-chip');
    el.btnSaveFilters = document.getElementById('btnSaveFilters');

    el.friendsDrawerModal = document.getElementById('friendsDrawerModal');
    el.btnCloseFriendsDrawer = document.getElementById('btnCloseFriendsDrawer');
    el.tabFriends = document.getElementById('tabFriends');
    el.tabRequests = document.getElementById('tabRequests');
    el.tabHistory = document.getElementById('tabHistory');
    el.friendsTabContent = document.getElementById('friendsTabContent');
    el.requestsTabContent = document.getElementById('requestsTabContent');
    el.historyTabContent = document.getElementById('historyTabContent');
    el.friendsList = document.getElementById('friendsList');
    el.emptyFriends = document.getElementById('emptyFriends');
    el.requestsList = document.getElementById('requestsList');
    el.emptyRequests = document.getElementById('emptyRequests');
    el.callHistoryList = document.getElementById('callHistoryList');
    el.friendsBadgeDot = document.getElementById('friendsBadgeDot');

    el.inCallGamesModal = document.getElementById('inCallGamesModal');
    el.btnCloseGamesModal = document.getElementById('btnCloseGamesModal');
    el.gameTabBtns = document.querySelectorAll('.game-tab-btn');
    el.gameArenaViews = document.querySelectorAll('.game-arena-view');
    el.tttCells = document.querySelectorAll('.ttt-cell');
    el.tttStatusText = document.getElementById('tttStatusText');
    el.btnResetTTT = document.getElementById('btnResetTTT');
    el.rpsCards = document.querySelectorAll('.rps-choice-card');
    el.rpsStatusText = document.getElementById('rpsStatusText');
    el.icebreakerQuestion = document.getElementById('icebreakerQuestion');
    el.btnNextIcebreaker = document.getElementById('btnNextIcebreaker');
    el.btnRollDice = document.getElementById('btnRollDice');
    el.myDiceResult = document.getElementById('myDiceResult');
    el.partnerDiceResult = document.getElementById('partnerDiceResult');

    el.friendRequestToast = document.getElementById('friendRequestToast');
    el.toastAvatar = document.getElementById('toastAvatar');
    el.toastNickname = document.getElementById('toastNickname');
    el.toastCountry = document.getElementById('toastCountry');
    el.btnAcceptFriend = document.getElementById('btnAcceptFriend');
    el.btnDeclineFriend = document.getElementById('btnDeclineFriend');

    el.onlineUsersModal = document.getElementById('onlineUsersModal');
    el.btnCloseUsersModal = document.getElementById('btnCloseUsersModal');
    el.modalOnlineCount = document.getElementById('modalOnlineCount');
    el.modalUsersGrid = document.getElementById('modalUsersGrid');

    el.lightboxModal = document.getElementById('lightboxModal');
    el.lightboxImg = document.getElementById('lightboxImg');
    el.lightboxCaption = document.getElementById('lightboxCaption');
    el.btnCloseLightbox = document.getElementById('btnCloseLightbox');
  }

  // --- NOTIFICATION PERMISSION & BACKGROUND PUSH DISPATCHER ---
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then((perm) => {
        if (perm === 'granted') {
          console.log('✅ Push Notifications enabled for Pigeon Diary!');
        }
      });
    }
  }

  function notifyUser(title, body, icon = '🕊️') {
    playSoundFX('message');

    if ('Notification' in window && Notification.permission === 'granted') {
      const options = {
        body: body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐦</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💌</text></svg>',
        vibrate: [200, 100, 200, 100, 200],
        tag: `pigeon-msg-${Date.now()}`,
        renotify: true,
        requireInteraction: false
      };

      // 1. Prefer Service Worker for OS-level background notifications (works outside browser!)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options).catch(() => {
            new Notification(title, options);
          });
        }).catch(() => {
          new Notification(title, options);
        });
      } else {
        try {
          new Notification(title, options);
        } catch (e) {}
      }
    }
  }

  // --- AUDIO CONTEXT UNLOCK ---
  function getAudioCtx() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  // --- SOUND EFFECTS ---
  function playSoundFX(type) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'click') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'connected') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(587.33, now + 0.1);
        osc.frequency.setValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'hangup') {
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'message') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1200, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {}
  }

  // --- IP GEOLOCATION ---
  async function detectUserIpLocation() {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        if (data.country_code) {
          detectedLocation = {
            countryCode: data.country_code,
            countryName: data.country_name || 'India',
            countryFlag: getFlagEmoji(data.country_code),
            isIpVerified: true
          };
        }
      }
    } catch (e) {}
    updateDetectedLocationUI();
  }

  function getFlagEmoji(code) {
    if (!code || code.length !== 2) return '🌍';
    const offset = 127397;
    return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
  }

  function updateDetectedLocationUI() {
    if (el.filterModalFlag) el.filterModalFlag.textContent = detectedLocation.countryFlag;
    if (el.filterModalCountryName) el.filterModalCountryName.textContent = detectedLocation.countryName;
  }

  // --- PERSISTENT GUEST PROFILE (No Initial Popup) ---
  function loadGuestProfile() {
    let saved = localStorage.getItem('pigeon_guest_profile');
    if (saved) {
      try {
        myProfile = JSON.parse(saved);
      } catch (e) {
        myProfile = null;
      }
    }

    if (!myProfile) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      myProfile = {
        nickname: `Pigeon_${randomSuffix}`,
        avatar: '🕊️',
        gender: 'male',
        country: detectedLocation.countryName,
        countryCode: detectedLocation.countryCode,
        countryFlag: detectedLocation.countryFlag,
        interests: ['Music', 'Travel', 'Deep Talk'],
        preferredGender: 'both',
        preferredCountries: [],
        excludedCountries: []
      };
      localStorage.setItem('pigeon_guest_profile', JSON.stringify(myProfile));
    }

    if (socket && socket.connected) {
      socket.emit('register-guest', myProfile);
    }
  }

  // --- VIEW SWITCHING ---
  function showView(viewName) {
    el.landingView.classList.add('hide');
    el.voiceView.classList.add('hide');
    el.textView.classList.add('hide');

    if (viewName === 'landing') {
      el.landingView.classList.remove('hide');
    } else if (viewName === 'voice') {
      el.voiceView.classList.remove('hide');
    } else if (viewName === 'text') {
      el.textView.classList.remove('hide');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- AI VOICE COMPANION (REAL SPEECH OUTPUT SYNTHESIS) ---
  function startAIVoiceCompanionCall() {
    getAudioCtx();
    showView('voice');

    isSimulatedBotCall = true;
    callPartner = {
      id: 'bot_aria',
      nickname: 'Aria_Sky (AI)',
      country: 'United States',
      countryFlag: '🇺🇸',
      avatar: '🤖'
    };

    setVoiceUIState('in_call');
    el.voicePartnerFlag.textContent = callPartner.countryFlag;
    el.voicePartnerName.textContent = callPartner.nickname;

    initLocalMicrophone();
    initSpeechRecognitionForAI();

    // Initial greeting aloud
    setTimeout(() => {
      aiSpeakAloud("Hello! Welcome to The Pigeon Diary. I can hear your voice clearly! How is your day going?");
    }, 800);
  }

  function aiSpeakAloud(text) {
    if (!('speechSynthesis' in window)) {
      showFloatingSubtitle('Aria_Sky (AI)', text);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.1;

      // Pick a clean English voice if available
      const voices = window.speechSynthesis.getVoices();
      const enVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Female') || v.name.includes('Natural') || v.name.includes('Google')));
      if (enVoice) utterance.voice = enVoice;

      utterance.onstart = () => {
        isAISpeaking = true;
        el.speakingWave1.classList.add('active');
        el.speakingWave2.classList.add('active');
        showFloatingSubtitle('Aria_Sky (AI)', text);
      };

      utterance.onend = () => {
        isAISpeaking = false;
        el.speakingWave1.classList.remove('active');
        el.speakingWave2.classList.remove('active');
      };

      utterance.onerror = () => {
        isAISpeaking = false;
        el.speakingWave1.classList.remove('active');
        el.speakingWave2.classList.remove('active');
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      showFloatingSubtitle('Aria_Sky (AI)', text);
    }
  }

  function initSpeechRecognitionForAI() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      speechRecognizer = new SpeechRec();
      speechRecognizer.continuous = true;
      speechRecognizer.interimResults = false;
      speechRecognizer.lang = 'en-US';

      speechRecognizer.onresult = (e) => {
        if (!isInCall || !isSimulatedBotCall || isAISpeaking) return;
        const transcript = e.results[e.results.length - 1][0].transcript.trim();
        if (transcript.length > 1) {
          handleUserSpeechToAI(transcript);
        }
      };

      speechRecognizer.onend = () => {
        if (isInCall && isSimulatedBotCall) {
          try { speechRecognizer.start(); } catch (e) {}
        }
      };

      speechRecognizer.start();
    } catch (e) {}
  }

  function handleUserSpeechToAI(userSpokenText) {
    const lower = userSpokenText.toLowerCase();
    let reply = "That's so interesting! Tell me more about it.";

    if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
      reply = "Hey there! It's so nice talking to you. How are you doing today?";
    } else if (lower.includes('how are you') || lower.includes('how r u')) {
      reply = "I'm doing wonderful, thank you! The Pigeon Diary is such a great place to connect. Where are you from?";
    } else if (lower.includes('name') || lower.includes('who are you')) {
      reply = "I'm Aria Sky, your AI Pigeon companion! I love voice chats and meeting new friends.";
    } else if (lower.includes('music') || lower.includes('song')) {
      reply = "Music connects us all! What is your favorite genre or artist?";
    } else if (lower.includes('bye') || lower.includes('goodbye')) {
      reply = "Aww, it was lovely talking to you! Have an amazing day ahead!";
    } else {
      const dynamicReplies = [
        `I hear you saying "${userSpokenText}"! That sounds fascinating!`,
        "Haha, absolutely! I really enjoy your voice.",
        "100% agree with you! What else do you like doing in your free time?",
        "That's so cool! Our voice connection is super smooth on Pigeon Diary."
      ];
      reply = dynamicReplies[Math.floor(Math.random() * dynamicReplies.length)];
    }

    setTimeout(() => {
      if (isInCall && isSimulatedBotCall) {
        aiSpeakAloud(reply);
      }
    }, 600);
  }

  // --- WEBRTC AUDIO & MICROPHONE ---
  async function initLocalMicrophone() {
    try {
      getAudioCtx();
      if (!myLocalStream) {
        myLocalStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });
        setupLocalVolumeMeter(myLocalStream);
      }
      return true;
    } catch (err) {
      console.warn('Microphone access denied:', err);
      return false;
    }
  }

  function setupLocalVolumeMeter(stream) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const src = ctx.createMediaStreamSource(stream);
      localAnalyser = ctx.createAnalyser();
      localAnalyser.fftSize = 64;
      src.connect(localAnalyser);

      const dataArray = new Uint8Array(localAnalyser.frequencyBinCount);
      let speakingDebounce = false;

      function checkVolume() {
        if (!isInCall || isMuted) {
          if (speakingDebounce) {
            speakingDebounce = false;
            if (socket) socket.emit('audio-speaking', { isSpeaking: false });
          }
          requestAnimationFrame(checkVolume);
          return;
        }

        localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;

        if (avg > 18) {
          if (!speakingDebounce) {
            speakingDebounce = true;
            if (socket) socket.emit('audio-speaking', { isSpeaking: true });
            if (!isSimulatedBotCall) {
              el.speakingWave1.classList.add('active');
              el.speakingWave2.classList.add('active');
            }
          }
        } else {
          if (speakingDebounce) {
            speakingDebounce = false;
            if (socket) socket.emit('audio-speaking', { isSpeaking: false });
            if (!isSimulatedBotCall) {
              el.speakingWave1.classList.remove('active');
              el.speakingWave2.classList.remove('active');
            }
          }
        }
        requestAnimationFrame(checkVolume);
      }
      checkVolume();
    } catch (e) {}
  }

  async function createPeerConnection(isInitiator, partnerId) {
    try {
      peerConnection = new RTCPeerConnection(rtcConfig);
      isRemoteDescriptionSet = false;
      pendingIceCandidates = [];

      if (myLocalStream) {
        myLocalStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, myLocalStream);
        });
      }

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          el.remoteAudioStream.srcObject = event.streams[0];
          el.remoteAudioStream.play().catch(e => console.log('Audio play error:', e));
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && partnerId && socket) {
          socket.emit('webrtc-ice-candidate', {
            targetId: partnerId,
            candidate: event.candidate
          });
        }
      };

      if (isInitiator) {
        const offer = await peerConnection.createOffer({ offerToReceiveAudio: true });
        await peerConnection.setLocalDescription(offer);
        if (socket) {
          socket.emit('webrtc-offer', {
            targetId: partnerId,
            offer
          });
        }
      }
    } catch (err) {
      console.error('PeerConnection Error:', err);
    }
  }

  async function handleRemoteOffer(offer, senderId) {
    try {
      if (!peerConnection) {
        await createPeerConnection(false, senderId);
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      isRemoteDescriptionSet = true;
      drainPendingIceCandidates();

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      if (socket) {
        socket.emit('webrtc-answer', {
          targetId: senderId,
          answer
        });
      }
    } catch (err) {
      console.error('Handle Remote Offer Error:', err);
    }
  }

  async function handleRemoteAnswer(answer) {
    try {
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        isRemoteDescriptionSet = true;
        drainPendingIceCandidates();
      }
    } catch (err) {
      console.error('Handle Remote Answer Error:', err);
    }
  }

  async function handleRemoteIceCandidate(candidate) {
    try {
      if (peerConnection && isRemoteDescriptionSet) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingIceCandidates.push(candidate);
      }
    } catch (err) {
      console.error('ICE Candidate Error:', err);
    }
  }

  function drainPendingIceCandidates() {
    if (!peerConnection || !isRemoteDescriptionSet) return;
    while (pendingIceCandidates.length > 0) {
      const c = pendingIceCandidates.shift();
      peerConnection.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
  }

  // --- CALL STATE & CONTROLS ---
  async function toggleVoiceCallState() {
    getAudioCtx();
    requestNotificationPermission();

    if (isInCall) {
      if (isSimulatedBotCall) {
        endCallState('you_hung_up');
        return;
      }
      if (socket) socket.emit('hang-up-call');
      endCallState('you_hung_up');
    } else if (isSearching) {
      if (socket) socket.emit('cancel-call-search');
      isSearching = false;
      setVoiceUIState('idle');
    } else {
      await initLocalMicrophone();
      isSearching = true;
      setVoiceUIState('searching');
      if (socket) socket.emit('start-call-search');
    }
  }

  function setVoiceUIState(state) {
    if (state === 'idle') {
      isInCall = false;
      isSearching = false;
      el.btnVoiceCallAction.classList.remove('in-call');
      el.iconVoiceCall.textContent = 'call';
      el.labelVoiceCall.textContent = 'Call';
      el.airtalkMainCircle.classList.remove('in-call');
      el.voiceCallTimer.classList.add('hide');
      el.voicePartnerPill.classList.add('hide');
      el.airtalkFloatingSubtitle.classList.add('hide');
      el.voiceHelperHint.innerHTML = 'Tap the <strong>Call</strong> button to call a new stranger';
      stopCallTimer();
    } else if (state === 'searching') {
      el.iconVoiceCall.textContent = 'close';
      el.labelVoiceCall.textContent = 'Cancel';
      el.voiceHelperHint.innerHTML = '🔍 Searching for an online stranger in room...';
    } else if (state === 'in_call') {
      isInCall = true;
      isSearching = false;
      el.btnVoiceCallAction.classList.add('in-call');
      el.iconVoiceCall.textContent = 'call_end';
      el.labelVoiceCall.textContent = 'Hang up';
      el.airtalkMainCircle.classList.add('in-call');
      el.voiceCallTimer.classList.remove('hide');
      el.voicePartnerPill.classList.remove('hide');
      el.voiceHelperHint.innerHTML = '🟢 Connected! Talk on mic or tap 💬 to whisper.';
      startCallTimer();
    }
  }

  function startCallTimer() {
    callSeconds = 0;
    el.voiceCallTimer.textContent = '00:00';
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const secs = String(callSeconds % 60).padStart(2, '0');
      el.voiceCallTimer.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopCallTimer() {
    clearInterval(callTimerInterval);
    callSeconds = 0;
  }

  function endCallState(reason) {
    playSoundFX('hangup');
    setVoiceUIState('idle');

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (speechRecognizer) {
      try { speechRecognizer.stop(); } catch (e) {}
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (el.remoteAudioStream) el.remoteAudioStream.srcObject = null;

    if (el.inCallWhisperDrawer) el.inCallWhisperDrawer.classList.add('hide');
    callPartner = null;
    isSimulatedBotCall = false;

    if (isAutoCallEnabled) {
      setTimeout(() => {
        if (!isInCall && !isSearching) {
          toggleVoiceCallState();
        }
      }, 1500);
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (myLocalStream) {
      myLocalStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }

    if (isMuted) {
      el.btnVoiceMuteAction.classList.add('muted');
      el.iconVoiceMute.textContent = 'mic_off';
      el.labelVoiceMute.textContent = 'Unmute';
      openInCallWhispers();
    } else {
      el.btnVoiceMuteAction.classList.remove('muted');
      el.iconVoiceMute.textContent = 'mic';
      el.labelVoiceMute.textContent = 'Mute';
    }
  }

  // --- FLOATING SUBTITLE ON CIRCLE ---
  let floatingSubtitleTimer = null;
  function showFloatingSubtitle(senderName, text) {
    el.subSenderName.textContent = senderName || 'Stranger';
    el.subMessageText.textContent = text;
    el.airtalkFloatingSubtitle.classList.remove('hide');

    clearTimeout(floatingSubtitleTimer);
    floatingSubtitleTimer = setTimeout(() => {
      el.airtalkFloatingSubtitle.classList.add('hide');
    }, 4500);
  }

  // --- IN-CALL WHISPERS (SPEAK & TYPE MODE) ---
  function openInCallWhispers() {
    el.inCallWhisperDrawer.classList.remove('hide');
    el.whisperUnreadPulse.classList.add('hide');
    el.whisperInput.focus();
  }

  function sendInCallWhisper(text) {
    if (!text || !isInCall) return;
    playSoundFX('message');

    const whisperObj = {
      id: `wh_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'text',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    renderWhisperItem(whisperObj, true);

    if (isSimulatedBotCall) {
      setTimeout(() => {
        if (!isInCall) return;
        const botReply = `I read your whisper: "${text}"! Keep typing, I am listening to you! 🎙️`;
        const botW = {
          id: `wh_bot_${Date.now()}`,
          senderName: 'Aria_Sky (AI)',
          type: 'text',
          text: botReply
        };
        renderWhisperItem(botW, false);
        aiSpeakAloud(botReply);
      }, 1000);
    } else if (socket) {
      socket.emit('send-incall-whisper', { type: 'text', text });
    }
  }

  function renderWhisperItem(w, isMine) {
    if (w.id && renderedMessageIds.has(w.id)) return;
    if (w.id) renderedMessageIds.add(w.id);

    const item = document.createElement('div');
    item.className = `whisper-msg-item ${isMine ? 'mine' : 'partner'}`;
    
    let bodyHtml = '';
    if (w.type === 'photo' && w.imageData) {
      bodyHtml = `
        <img src="${w.imageData}" class="whisper-photo-thumb" alt="Photo">
        ${w.caption ? `<small style="display:block;color:#e2e8f0;font-size:11px;margin-top:2px;">${w.caption}</small>` : ''}
      `;
    } else if (w.type === 'voice_clip' && w.audioData) {
      const dur = w.duration || 0;
      bodyHtml = `
        <div class="whisper-voice-tag">
          <span class="material-icons-round" style="font-size:16px;">play_circle</span>
          <span>Voice Clip (${dur}s)</span>
        </div>
      `;
    } else {
      bodyHtml = `<span>${w.text || ''}</span>`;
    }

    item.innerHTML = `<strong>${isMine ? 'You' : w.senderName}</strong>${bodyHtml}`;

    if (w.type === 'photo') {
      const imgEl = item.querySelector('.whisper-photo-thumb');
      if (imgEl) imgEl.addEventListener('click', () => openPhotoLightbox(w.imageData, w.caption));
    }
    if (w.type === 'voice_clip') {
      const tagEl = item.querySelector('.whisper-voice-tag');
      if (tagEl) tagEl.addEventListener('click', () => playVoiceClipAudio(w.audioData));
    }

    el.whisperMessagesStream.appendChild(item);
    el.whisperMessagesStream.scrollTop = el.whisperMessagesStream.scrollHeight;
  }

  // --- PHOTO COMPRESSION & LIGHTBOX ---
  let activePhotoData = null;
  let whisperActivePhotoData = null;

  function compressImageFile(file, maxWidth = 1024, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file || !file.type.startsWith('image/')) {
        return reject(new Error('Please select a valid image file.'));
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxWidth) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve(dataUrl);
        };
        img.onerror = () => reject(new Error('Failed to parse image file.'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsDataURL(file);
    });
  }

  function openPhotoLightbox(imgSrc, caption = '') {
    if (!el.lightboxModal || !el.lightboxImg) return;
    el.lightboxImg.src = imgSrc;
    if (el.lightboxCaption) el.lightboxCaption.textContent = caption || '';
    el.lightboxModal.classList.remove('hide');
  }

  // --- VOICE AUDIO RECORDING ENGINE (MediaRecorder) ---
  let isRecordingForWhisper = false;
  let voiceRecordTimerInterval = null;
  let voiceRecordSeconds = 0;
  let audioRecordedChunks = [];

  let currentPlayingAudio = null;
  let currentPlayingBtn = null;
  let currentPlayingWave = null;

  function playVoiceClipAudio(audioData, btnEl, waveEl) {
    if (currentPlayingAudio) {
      currentPlayingAudio.pause();
      if (currentPlayingBtn) {
        currentPlayingBtn.innerHTML = '<span class="material-icons-round">play_arrow</span>';
        currentPlayingBtn.classList.remove('playing');
      }
      if (currentPlayingWave) {
        currentPlayingWave.classList.remove('animating');
      }
      if (currentPlayingAudio.src === audioData) {
        currentPlayingAudio = null;
        currentPlayingBtn = null;
        currentPlayingWave = null;
        return;
      }
    }

    const audio = new Audio(audioData);
    currentPlayingAudio = audio;
    currentPlayingBtn = btnEl;
    currentPlayingWave = waveEl;

    if (btnEl) {
      btnEl.innerHTML = '<span class="material-icons-round">pause</span>';
      btnEl.classList.add('playing');
    }
    if (waveEl) {
      waveEl.classList.add('animating');
    }

    audio.onended = () => {
      if (btnEl) {
        btnEl.innerHTML = '<span class="material-icons-round">play_arrow</span>';
        btnEl.classList.remove('playing');
      }
      if (waveEl) {
        waveEl.classList.remove('animating');
      }
      currentPlayingAudio = null;
      currentPlayingBtn = null;
      currentPlayingWave = null;
    };

    audio.onerror = (e) => {
      console.log('Audio play error:', e);
      if (btnEl) {
        btnEl.innerHTML = '<span class="material-icons-round">play_arrow</span>';
        btnEl.classList.remove('playing');
      }
      if (waveEl) waveEl.classList.remove('animating');
      currentPlayingAudio = null;
    };

    audio.play().catch(e => console.log('Audio playback error:', e));
  }

  async function startAudioRecording(isWhisper = false) {
    try {
      getAudioCtx();
      isRecordingForWhisper = isWhisper;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('Your browser does not support microphone audio recording.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        const types = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
          'audio/aac',
          'audio/ogg;codecs=opus',
          'audio/ogg'
        ];
        for (const t of types) {
          if (MediaRecorder.isTypeSupported(t)) {
            mimeType = t;
            break;
          }
        }
      }

      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioRecordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioRecordedChunks.push(e.data);
        }
      };

      mediaRecorder.start(100);
      voiceRecordSeconds = 0;

      const timerEl = isWhisper ? el.whisperRecordingTimer : el.recordingTimer;
      const overlayEl = isWhisper ? el.whisperVoiceRecorderOverlay : el.voiceRecorderOverlay;
      if (timerEl) timerEl.textContent = '00:00';
      if (overlayEl) overlayEl.classList.remove('hide');

      clearInterval(voiceRecordTimerInterval);
      voiceRecordTimerInterval = setInterval(() => {
        voiceRecordSeconds++;
        const m = String(Math.floor(voiceRecordSeconds / 60)).padStart(2, '0');
        const s = String(voiceRecordSeconds % 60).padStart(2, '0');
        if (timerEl) timerEl.textContent = `${m}:${s}`;
        if (voiceRecordSeconds >= 60) {
          sendAudioRecording();
        }
      }, 1000);

    } catch (err) {
      console.error('Microphone recording error:', err);
      alert('Microphone permission is required to record voice clips. Please allow mic access in your browser settings.');
    }
  }

  function cancelAudioRecording() {
    clearInterval(voiceRecordTimerInterval);
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      if (mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
    }
    mediaRecorder = null;
    audioRecordedChunks = [];
    if (el.voiceRecorderOverlay) el.voiceRecorderOverlay.classList.add('hide');
    if (el.whisperVoiceRecorderOverlay) el.whisperVoiceRecorderOverlay.classList.add('hide');
  }

  function sendAudioRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
    clearInterval(voiceRecordTimerInterval);
    const duration = Math.max(voiceRecordSeconds, 1);

    mediaRecorder.onstop = () => {
      if (audioRecordedChunks.length === 0) return;
      const mime = mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(audioRecordedChunks, { type: mime });
      const reader = new FileReader();
      reader.onload = () => {
        const audioData = reader.target.result;
        if (isRecordingForWhisper) {
          sendInCallVoiceClip(audioData, duration);
        } else {
          sendTextVoiceClip(audioData, duration);
        }
      };
      reader.readAsDataURL(blob);

      if (mediaRecorder && mediaRecorder.stream) {
        mediaRecorder.stream.getTracks().forEach(t => t.stop());
      }
      mediaRecorder = null;
      audioRecordedChunks = [];
      if (el.voiceRecorderOverlay) el.voiceRecorderOverlay.classList.add('hide');
      if (el.whisperVoiceRecorderOverlay) el.whisperVoiceRecorderOverlay.classList.add('hide');
    };

    mediaRecorder.stop();
  }

  function sendTextPhoto(imageData, caption = '') {
    const photoObj = {
      id: `photo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'photo',
      imageData: imageData,
      caption: caption,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    renderMessageBubble(photoObj, true);

    if (isTextBotChat || !isInTextChat) {
      setTimeout(() => {
        const replies = [
          "Wow, lovely photo! 📸 Thanks for sharing that with me! ✨",
          "That's such a cool picture! Looks beautiful 💖",
          "Amazing capture! 🕊️ Tell me what this photo represents!"
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        const botMsg = {
          id: `msg_bot_${Date.now()}`,
          senderName: 'Aria_Sky (AI)',
          type: 'text',
          content: randomReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        renderMessageBubble(botMsg, false);
        notifyUser('🕊️ Aria_Sky (AI)', randomReply);
      }, 1000);
    } else if (socket) {
      socket.emit('send-photo', { imageData, caption });
    }
  }

  function sendTextVoiceClip(audioData, duration) {
    const voiceObj = {
      id: `voice_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'voice_clip',
      audioData: audioData,
      duration: duration,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    renderMessageBubble(voiceObj, true);

    if (isTextBotChat || !isInTextChat) {
      setTimeout(() => {
        const botReply = "I heard your voice note! 🎙️ Your voice sounds warm and friendly. Here is a voice response back to you! ✨";
        const botMsg = {
          id: `msg_bot_${Date.now()}`,
          senderName: 'Aria_Sky (AI)',
          type: 'text',
          content: botReply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        renderMessageBubble(botMsg, false);
        notifyUser('🕊️ Aria_Sky (AI)', botReply);
        aiSpeakAloud(botReply);
      }, 1200);
    } else if (socket) {
      socket.emit('send-voice-clip', { audioData, duration });
    }
  }

  function sendInCallPhoto(imageData, caption = '') {
    if (!isInCall) return;
    playSoundFX('message');
    const photoObj = {
      id: `wh_photo_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'photo',
      imageData: imageData,
      caption: caption,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    renderWhisperItem(photoObj, true);

    if (isSimulatedBotCall) {
      setTimeout(() => {
        if (!isInCall) return;
        const botReply = `I received your photo: ${caption || 'Picture'}! Looking great! 📸`;
        const botW = {
          id: `wh_bot_${Date.now()}`,
          senderName: 'Aria_Sky (AI)',
          type: 'text',
          text: botReply
        };
        renderWhisperItem(botW, false);
        aiSpeakAloud(botReply);
      }, 1000);
    } else if (socket) {
      socket.emit('send-incall-whisper', { type: 'photo', imageData, caption });
    }
  }

  function sendInCallVoiceClip(audioData, duration) {
    if (!isInCall) return;
    playSoundFX('message');
    const voiceObj = {
      id: `wh_voice_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'voice_clip',
      audioData: audioData,
      duration: duration,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    renderWhisperItem(voiceObj, true);

    if (isSimulatedBotCall) {
      setTimeout(() => {
        if (!isInCall) return;
        const botReply = "I heard your voice clip in whisper mode! Sounds super clear. 🎙️";
        const botW = {
          id: `wh_bot_${Date.now()}`,
          senderName: 'Aria_Sky (AI)',
          type: 'text',
          text: botReply
        };
        renderWhisperItem(botW, false);
        aiSpeakAloud(botReply);
      }, 1000);
    } else if (socket) {
      socket.emit('send-incall-whisper', { type: 'voice_clip', audioData, duration });
    }
  }

  // --- 1-ON-1 STRANGER TEXT CHAT MODE ---
  function startTextChatSearch() {
    isTextSearching = true;
    isTextBotChat = false;
    el.textPartnerTitle.textContent = 'Searching for a stranger...';
    el.textPartnerSubtitle.textContent = 'Matching with an online Pigeon 🕊️';
    if (socket) socket.emit('start-text-search');
  }

  function startAITextCompanionChat() {
    isTextSearching = false;
    isTextBotChat = true;
    isInTextChat = true;

    el.textPartnerAvatar.textContent = '🤖';
    el.textPartnerTitle.textContent = "You're chatting with Aria_Sky (AI Pigeon)";
    el.textPartnerSubtitle.textContent = '✨ AI Companion • Instant Replies';

    renderMessageBubble({
      id: `msg_ai_init_${Date.now()}`,
      senderName: 'Aria_Sky (AI)',
      type: 'text',
      content: 'Hey there! 🕊️ I am your AI Pigeon companion. You can chat with me, send photos, voice notes, or upgrade to a voice call anytime!',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }, false);
  }

  function sendTextMessage() {
    const text = el.textChatInput.value.trim();
    if (!text) return;

    const msgObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      type: 'text',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    renderMessageBubble(msgObj, true);
    el.textChatInput.value = '';

    if (isTextBotChat) {
      simulateAITextReply(text);
    } else if (socket) {
      socket.emit('send-chat-message', { content: text });
    }
  }

  function simulateAITextReply(userText) {
    setTimeout(() => {
      const lower = userText.toLowerCase();
      let reply = "That's awesome! Tell me more about your thoughts on that. 🕊️";

      if (lower.includes('hello') || lower.includes('hi') || lower.includes('hey')) {
        reply = "Hello friend! Great to connect with you in text chat. How's your day going? ✨";
      } else if (lower.includes('how are you')) {
        reply = "I'm doing fantastic! Ready to chat about music, travel, philosophy, or anything you like! 💖";
      } else if (lower.includes('pigeon') || lower.includes('sahil')) {
        reply = "The Pigeon Diary was crafted by MR. SAHIL to give everyone an anonymous, safe place to connect freely! 👑";
      }

      const botMsg = {
        id: `msg_bot_${Date.now()}`,
        senderName: 'Aria_Sky (AI)',
        type: 'text',
        content: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      renderMessageBubble(botMsg, false);
      notifyUser('🕊️ Aria_Sky (AI)', reply);
    }, 900);
  }

  // Carrier Pigeon Khat Delivery Animation
  function spawnCarrierPigeonAnimation(isMine) {
    playSoundFX('message');
    const bird = document.createElement('div');
    bird.className = `carrier-pigeon-flight ${isMine ? 'flying-out' : 'flying-in'}`;
    bird.innerHTML = `<span>🕊️</span><span>💌</span>`;
    document.body.appendChild(bird);
    setTimeout(() => {
      if (bird.parentNode) bird.parentNode.removeChild(bird);
    }, 1400);
  }

  // Render Message Bubble with Strict Deduplication
  function renderMessageBubble(msg, isMine) {
    if (msg.id && renderedMessageIds.has(msg.id)) {
      return;
    }
    if (msg.id) renderedMessageIds.add(msg.id);

    spawnCarrierPigeonAnimation(isMine);

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'partner'}`;
    
    let bodyHtml = '';
    if (msg.type === 'photo' && msg.imageData) {
      bodyHtml = `
        <div class="chat-photo-card">
          <img src="${msg.imageData}" alt="Shared Photo" class="chat-photo-img">
          ${msg.caption ? `<p class="chat-photo-caption">${msg.caption}</p>` : ''}
        </div>
      `;
    } else if (msg.type === 'voice_clip' && msg.audioData) {
      const dur = msg.duration || 0;
      const m = Math.floor(dur / 60);
      const s = String(dur % 60).padStart(2, '0');
      bodyHtml = `
        <div class="chat-voice-player">
          <button class="voice-play-btn" type="button"><span class="material-icons-round">play_arrow</span></button>
          <div class="voice-soundwaves">
            <span class="voice-bar"></span><span class="voice-bar"></span><span class="voice-bar"></span>
            <span class="voice-bar"></span><span class="voice-bar"></span><span class="voice-bar"></span>
            <span class="voice-bar"></span><span class="voice-bar"></span>
          </div>
          <span class="voice-duration-tag">${m}:${s}</span>
        </div>
      `;
    } else {
      bodyHtml = `<div class="bubble-content">${msg.content || msg.text || ''}</div>`;
    }

    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">${isMine ? 'You' : msg.senderName}</span>
        <span>${msg.timestamp || ''}</span>
      </div>
      ${bodyHtml}
      <span class="pigeon-delivery-status">${isMine ? '💌 Khat Delivered ✨' : '💌 Khat Received 🕊️'}</span>
    `;

    // Hook photo click for lightbox
    if (msg.type === 'photo') {
      const imgEl = bubble.querySelector('.chat-photo-img');
      if (imgEl) {
        imgEl.addEventListener('click', () => openPhotoLightbox(msg.imageData, msg.caption));
      }
    }

    // Hook voice play button
    if (msg.type === 'voice_clip') {
      const playBtn = bubble.querySelector('.voice-play-btn');
      const waveEl = bubble.querySelector('.voice-soundwaves');
      if (playBtn) {
        playBtn.addEventListener('click', () => playVoiceClipAudio(msg.audioData, playBtn, waveEl));
      }
    }

    el.textMessagesContainer.appendChild(bubble);
    el.textMessagesContainer.scrollTop = el.textMessagesContainer.scrollHeight;
  }

  // --- FRIENDS & PENDING REQUESTS MANAGEMENT ---
  function getFriendsList() {
    try {
      return JSON.parse(localStorage.getItem('pigeon_friends') || '[]');
    } catch (e) {
      return [];
    }
  }

  function addFriendToList(friend) {
    const list = getFriendsList();
    if (!list.some(f => f.nickname === friend.nickname)) {
      list.push({
        nickname: friend.nickname,
        country: friend.country,
        countryFlag: friend.countryFlag || '🌍',
        avatar: friend.avatar || '🕊️',
        addedAt: new Date().toLocaleDateString()
      });
      localStorage.setItem('pigeon_friends', JSON.stringify(list));
      renderSavedFriends();
    }
  }

  function renderSavedFriends() {
    const list = getFriendsList();
    el.tabFriends.textContent = `FRIENDS (${list.length})`;

    if (list.length === 0) {
      el.emptyFriends.classList.remove('hide');
      el.friendsList.classList.add('hide');
    } else {
      el.emptyFriends.classList.add('hide');
      el.friendsList.classList.remove('hide');
      el.friendsList.innerHTML = '';

      list.forEach(f => {
        const isOnline = onlineUsersGlobalList.some(u => u.nickname === f.nickname);
        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
          <div class="friend-top-row">
            <div class="friend-info">
              <span class="friend-avatar">${f.avatar}</span>
              <div>
                <div class="friend-name">${f.nickname}</div>
                <div class="friend-lastseen ${isOnline ? 'online' : ''}">${isOnline ? '🟢 Online now' : '🕒 Offline'}</div>
              </div>
            </div>
          </div>
          <div class="friend-actions-row">
            <button class="btn-friend-chat" data-nick="${f.nickname}">
              <span class="material-icons-round" style="font-size: 14px;">chat</span> Chat
            </button>
            <button class="btn-friend-call" data-nick="${f.nickname}">
              <span class="material-icons-round" style="font-size: 14px;">call</span> Call
            </button>
            <button class="btn-friend-remove" data-nick="${f.nickname}">
              <span class="material-icons-round" style="font-size: 14px;">delete</span>
            </button>
          </div>
        `;

        div.querySelector('.btn-friend-call').addEventListener('click', () => {
          getAudioCtx();
          if (!isOnline) {
            alert(`${f.nickname} is currently offline.`);
            return;
          }
          showView('voice');
          toggleVoiceCallState();
        });

        div.querySelector('.btn-friend-chat').addEventListener('click', () => {
          el.friendsDrawerModal.classList.add('hide');
          showView('text');
          el.textPartnerAvatar.textContent = f.avatar || '🕊️';
          el.textPartnerTitle.textContent = `Chatting with Friend: ${f.nickname}`;
        });

        div.querySelector('.btn-friend-remove').addEventListener('click', () => {
          if (confirm(`Remove ${f.nickname} from friends?`)) {
            let cur = getFriendsList().filter(x => x.nickname !== f.nickname);
            localStorage.setItem('pigeon_friends', JSON.stringify(cur));
            renderSavedFriends();
          }
        });

        el.friendsList.appendChild(div);
      });
    }
  }

  function renderPendingRequests() {
    const count = pendingFriendRequests.length;
    el.tabRequests.textContent = `REQUESTS (${count})`;
    if (el.friendsBadgeDot) {
      if (count > 0) el.friendsBadgeDot.classList.remove('hide');
      else el.friendsBadgeDot.classList.add('hide');
    }

    if (count === 0) {
      el.emptyRequests.classList.remove('hide');
      el.requestsList.classList.add('hide');
    } else {
      el.emptyRequests.classList.add('hide');
      el.requestsList.classList.remove('hide');
      el.requestsList.innerHTML = '';

      pendingFriendRequests.forEach((req, idx) => {
        const div = document.createElement('div');
        div.className = 'request-item';
        div.innerHTML = `
          <div class="request-top-row">
            <span class="request-avatar">${req.avatar || '🕊️'}</span>
            <div class="request-info">
              <span class="request-name">${req.nickname}</span>
              <span class="request-country">${req.countryFlag || '🌍'} ${req.country || 'Global'}</span>
            </div>
          </div>
          <div class="request-actions-row">
            <button class="btn-request-accept">Accept 💖</button>
            <button class="btn-request-decline">Decline ❌</button>
          </div>
        `;

        div.querySelector('.btn-request-accept').addEventListener('click', () => {
          acceptFriendRequest(req, idx);
        });
        div.querySelector('.btn-request-decline').addEventListener('click', () => {
          declineFriendRequest(req, idx);
        });

        el.requestsList.appendChild(div);
      });
    }
  }

  function acceptFriendRequest(req, idx) {
    playSoundFX('connected');
    if (socket) socket.emit('respond-friend-request', { toId: req.fromId, accepted: true });
    addFriendToList(req);
    pendingFriendRequests.splice(idx, 1);
    renderPendingRequests();
    el.friendRequestToast.classList.add('hide');
  }

  function declineFriendRequest(req, idx) {
    if (socket) socket.emit('respond-friend-request', { toId: req.fromId, accepted: false });
    pendingFriendRequests.splice(idx, 1);
    renderPendingRequests();
    el.friendRequestToast.classList.add('hide');
  }

  // --- MULTIPLAYER GAMES (AirTALK Style) ---
  function initGames() {
    el.gameTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.gameTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const game = btn.getAttribute('data-game');
        el.gameArenaViews.forEach(v => v.classList.add('hide'));
        const target = document.getElementById(`${game}View`);
        if (target) target.classList.remove('hide');
      });
    });

    // Tic-Tac-Toe
    el.tttCells.forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.getAttribute('data-index'));
        if (!tttBoard[idx] && !tttGameOver) {
          tttBoard[idx] = tttMySymbol;
          cell.textContent = tttMySymbol;
          if (socket) socket.emit('send-game-action', { game: 'ttt', move: idx, symbol: tttMySymbol });
          checkTTTWinner();
        }
      });
    });

    el.btnResetTTT.addEventListener('click', () => {
      tttBoard = Array(9).fill(null);
      tttGameOver = false;
      el.tttCells.forEach(c => c.textContent = '');
      el.tttStatusText.textContent = 'Your Turn (X)';
      if (socket) socket.emit('send-game-action', { game: 'ttt', action: 'reset' });
    });

    // RPS
    el.rpsCards.forEach(card => {
      card.addEventListener('click', () => {
        const choice = card.getAttribute('data-choice');
        el.rpsStatusText.textContent = `You picked ${choice}! Waiting for partner...`;
        if (socket) socket.emit('send-game-action', { game: 'rps', choice });
      });
    });

    // Dice
    el.btnRollDice.addEventListener('click', () => {
      const roll = Math.floor(Math.random() * 6) + 1;
      const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
      el.myDiceResult.textContent = diceEmojis[roll - 1];
      if (socket) socket.emit('send-game-action', { game: 'dice', roll });
    });
  }

  function checkTTTWinner() {
    const wins = [
      [0,1,2], [3,4,5], [6,7,8],
      [0,3,6], [1,4,7], [2,5,8],
      [0,4,8], [2,4,6]
    ];
    for (const [a, b, c] of wins) {
      if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
        tttGameOver = true;
        el.tttStatusText.textContent = `🎉 Winner: ${tttBoard[a]}!`;
        return;
      }
    }
    if (!tttBoard.includes(null)) {
      tttGameOver = true;
      el.tttStatusText.textContent = "🤝 It's a Draw!";
    }
  }

  // --- SOCKET.IO SETUP ---
  function setupSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('✅ Connected to Pigeon Diary Server:', socket.id);
      loadGuestProfile();
    });

    socket.on('lobby-state', (state) => {
      const activeCount = state.activeCount || 0;
      el.landingOnlineCount.textContent = activeCount;
      el.voiceOnlineCount.textContent = activeCount;
      el.textOnlineCount.textContent = activeCount;
      onlineUsersGlobalList = state.users || [];
      renderSavedFriends();
    });

    // Voice Call Matched
    socket.on('call-matched', async (data) => {
      callPartner = data.partner;
      isSimulatedBotCall = !!data.isSimulatedBot;

      playSoundFX('connected');
      notifyUser('🕊️ Pigeon Connected!', `You are now talking with ${callPartner.nickname}`);
      setVoiceUIState('in_call');
      el.voicePartnerFlag.textContent = callPartner.countryFlag || '🌍';
      el.voicePartnerName.textContent = callPartner.nickname || 'Stranger';

      if (isSimulatedBotCall) {
        return;
      }

      await createPeerConnection(data.isInitiator, callPartner.id);
    });

    // WebRTC Signaling
    socket.on('webrtc-offer', async (data) => {
      await handleRemoteOffer(data.offer, data.senderId);
    });

    socket.on('webrtc-answer', async (data) => {
      await handleRemoteAnswer(data.answer);
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      await handleRemoteIceCandidate(data.candidate);
    });

    // Partner Speaking Animation
    socket.on('partner-speaking', (data) => {
      if (data.isSpeaking) {
        el.speakingWave1.classList.add('active');
        el.speakingWave2.classList.add('active');
      } else {
        el.speakingWave1.classList.remove('active');
        el.speakingWave2.classList.remove('active');
      }
    });

    // Call Ended
    socket.on('call-ended', (data) => {
      endCallState(data.reason);
    });

    // In-Call Whispers
    socket.on('receive-incall-whisper', (whisper) => {
      renderWhisperItem(whisper, false);
      let preview = whisper.text || 'New whisper';
      if (whisper.type === 'photo') preview = '📸 Photo whisper';
      if (whisper.type === 'voice_clip') preview = '🎙️ Voice clip whisper';
      showFloatingSubtitle(whisper.senderName, preview);
      el.whisperUnreadPulse.classList.remove('hide');
      notifyUser(`💬 ${whisper.senderName}`, preview);
    });

    socket.on('incall-whisper-ack', (whisper) => {
      renderWhisperItem(whisper, true);
    });

    // Text Chat Matched
    socket.on('text-chat-matched', (data) => {
      isInTextChat = true;
      isTextSearching = false;
      callPartner = data.partner;
      el.textPartnerAvatar.textContent = callPartner.avatar || '🕊️';
      el.textPartnerTitle.textContent = `You're chatting with ${callPartner.countryFlag} ${callPartner.nickname}`;
      el.textPartnerSubtitle.textContent = `📍 ${callPartner.country} • IP Verified`;
      playSoundFX('connected');
      notifyUser('🕊️ Stranger Connected!', `You are now text chatting with ${callPartner.nickname}`);
    });

    socket.on('receive-chat-message', (msg) => {
      renderMessageBubble(msg, false);
      let desc = msg.content;
      if (msg.type === 'photo') desc = 'Sent a photo 📸';
      if (msg.type === 'voice_clip') desc = 'Sent a voice clip 🎙️';
      notifyUser(`💌 ${msg.senderName}`, desc || 'New message');
    });

    socket.on('message-sent-ack', (msg) => {
      renderMessageBubble(msg, true);
    });

    // Friend Request Received
    socket.on('received-friend-request', (data) => {
      pendingFriendRequests.push(data);
      renderPendingRequests();

      el.toastAvatar.textContent = data.avatar || '🕊️';
      el.toastNickname.textContent = data.nickname;
      el.toastCountry.textContent = `${data.countryFlag || '🌍'} ${data.country || 'Global'}`;
      el.friendRequestToast.classList.remove('hide');
      notifyUser('💖 Friend Request', `${data.nickname} wants to be your Pigeon Friend!`);
    });

    socket.on('friend-request-response', (data) => {
      if (data.accepted) {
        addFriendToList(data);
        alert(`💖 ${data.nickname} accepted your friend request! Added to Friends.`);
      }
    });
  }

  // --- EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    // Landing View Buttons (Screenshot 3)
    el.btnStartVoiceHero.addEventListener('click', () => {
      getAudioCtx();
      requestNotificationPermission();
      showView('voice');
      toggleVoiceCallState();
    });

    el.btnStartTextHero.addEventListener('click', () => {
      getAudioCtx();
      requestNotificationPermission();
      showView('text');
      startTextChatSearch();
    });

    el.btnGoToVoiceFromCard.addEventListener('click', () => {
      getAudioCtx();
      requestNotificationPermission();
      showView('voice');
    });

    el.btnGoToTextFromCard.addEventListener('click', () => {
      getAudioCtx();
      requestNotificationPermission();
      showView('text');
      startTextChatSearch();
    });

    // 3-Line Menu Drawer
    el.btnLandingMenu.addEventListener('click', () => {
      el.sideMenuDrawer.classList.remove('hide');
    });
    el.btnCloseSideMenu.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
    });
    el.sideMenuBackdrop.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
    });

    // Menu Navigation Items
    el.menuItemVoiceChat.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      showView('voice');
      toggleVoiceCallState();
    });
    el.menuItemTextChat.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      showView('text');
      startTextChatSearch();
    });
    el.menuItemAICompanion.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      startAIVoiceCompanionCall();
    });
    el.menuItemTextAI.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      showView('text');
      startAITextCompanionChat();
    });
    el.menuItemFilters.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      el.filtersModal.classList.remove('hide');
    });
    el.menuItemFriends.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      el.friendsDrawerModal.classList.remove('hide');
      renderSavedFriends();
      renderPendingRequests();
    });
    el.menuItemGames.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      el.inCallGamesModal.classList.remove('hide');
    });
    el.menuItemOnlineUsers.addEventListener('click', () => {
      el.sideMenuDrawer.classList.add('hide');
      el.onlineUsersModal.classList.remove('hide');
    });

    // Voice View Nav
    el.btnVoiceHome.addEventListener('click', () => {
      if (isInCall) {
        if (confirm('Leave current call and return to home?')) {
          if (isSimulatedBotCall) endCallState('you_hung_up');
          else if (socket) socket.emit('hang-up-call');
          showView('landing');
        }
      } else {
        showView('landing');
      }
    });

    el.btnTextHome.addEventListener('click', () => {
      if (isInTextChat) {
        if (confirm('Leave current text chat and return to home?')) {
          if (socket && !isTextBotChat) socket.emit('leave-text-chat');
          showView('landing');
        }
      } else {
        showView('landing');
      }
    });

    // Voice Controls
    el.btnVoiceCallAction.addEventListener('click', toggleVoiceCallState);
    el.btnVoiceMuteAction.addEventListener('click', toggleMute);

    el.btnVoiceAddFriend.addEventListener('click', () => {
      if (!isInCall) {
        alert('Connect to a call first to add partner as a friend!');
        return;
      }
      if (socket) socket.emit('send-friend-request');
      alert('💌 Friend request sent to partner!');
    });

    el.btnVoiceReport.addEventListener('click', () => {
      if (!isInCall) return;
      if (confirm('Report partner for inappropriate behavior?')) {
        if (socket) socket.emit('hang-up-call');
        endCallState('reported');
      }
    });

    el.chkEnableAutoCall.addEventListener('change', (e) => {
      isAutoCallEnabled = e.target.checked;
    });

    // In-Call Whispers Drawer
    el.btnToggleInCallWhispers.addEventListener('click', openInCallWhispers);
    el.btnCloseWhisperDrawer.addEventListener('click', () => {
      el.inCallWhisperDrawer.classList.add('hide');
    });

    if (el.btnExpandWhisper) {
      el.btnExpandWhisper.addEventListener('click', () => {
        const isExp = el.whisperDrawerCard.classList.toggle('expanded');
        if (el.iconExpandWhisper) {
          el.iconExpandWhisper.textContent = isExp ? 'fullscreen_exit' : 'fullscreen';
        }
      });
    }

    el.whisperInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = el.whisperInput.value.trim();
      if (text) {
        sendInCallWhisper(text);
        el.whisperInput.value = '';
      }
    });

    el.whisperChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-msg');
        if (text) sendInCallWhisper(text);
      });
    });

    // Text Chat Actions
    el.textChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendTextMessage();
    });

    // Photo Attachment Listeners (Text Chat)
    if (el.btnAttachPhoto && el.imageFileInput) {
      el.btnAttachPhoto.addEventListener('click', () => {
        el.imageFileInput.click();
      });

      el.imageFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const compressed = await compressImageFile(file);
          activePhotoData = compressed;
          el.photoPreviewImg.src = compressed;
          el.photoPreviewBar.classList.remove('hide');
          el.photoCaptionInput.focus();
        } catch (err) {
          alert(err.message || 'Error processing photo');
        }
        el.imageFileInput.value = '';
      });

      if (el.btnRemovePhoto) {
        el.btnRemovePhoto.addEventListener('click', () => {
          activePhotoData = null;
          el.photoPreviewBar.classList.add('hide');
          el.photoPreviewImg.src = '';
          el.photoCaptionInput.value = '';
        });
      }

      if (el.btnSendPhoto) {
        el.btnSendPhoto.addEventListener('click', () => {
          if (!activePhotoData) return;
          const caption = el.photoCaptionInput.value.trim();
          sendTextPhoto(activePhotoData, caption);
          activePhotoData = null;
          el.photoPreviewBar.classList.add('hide');
          el.photoPreviewImg.src = '';
          el.photoCaptionInput.value = '';
        });
      }
    }

    // Voice Recording Listeners (Text Chat)
    if (el.btnStartVoiceRecord) {
      el.btnStartVoiceRecord.addEventListener('click', () => {
        startAudioRecording(false);
      });
    }
    if (el.btnCancelRecording) {
      el.btnCancelRecording.addEventListener('click', cancelAudioRecording);
    }
    if (el.btnSendRecording) {
      el.btnSendRecording.addEventListener('click', sendAudioRecording);
    }

    // Photo Attachment Listeners (In-Call Whisper)
    if (el.btnWhisperAttachPhoto && el.whisperImageInput) {
      el.btnWhisperAttachPhoto.addEventListener('click', () => {
        el.whisperImageInput.click();
      });

      el.whisperImageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const compressed = await compressImageFile(file);
          whisperActivePhotoData = compressed;
          el.whisperPhotoPreviewImg.src = compressed;
          el.whisperPhotoPreviewBar.classList.remove('hide');
          el.whisperPhotoCaptionInput.focus();
        } catch (err) {
          alert(err.message || 'Error processing photo');
        }
        el.whisperImageInput.value = '';
      });

      if (el.btnWhisperRemovePhoto) {
        el.btnWhisperRemovePhoto.addEventListener('click', () => {
          whisperActivePhotoData = null;
          el.whisperPhotoPreviewBar.classList.add('hide');
          el.whisperPhotoPreviewImg.src = '';
          el.whisperPhotoCaptionInput.value = '';
        });
      }

      if (el.btnWhisperSendPhoto) {
        el.btnWhisperSendPhoto.addEventListener('click', () => {
          if (!whisperActivePhotoData) return;
          const caption = el.whisperPhotoCaptionInput.value.trim();
          sendInCallPhoto(whisperActivePhotoData, caption);
          whisperActivePhotoData = null;
          el.whisperPhotoPreviewBar.classList.add('hide');
          el.whisperPhotoPreviewImg.src = '';
          el.whisperPhotoCaptionInput.value = '';
        });
      }
    }

    // Voice Recording Listeners (In-Call Whisper)
    if (el.btnWhisperVoiceRecord) {
      el.btnWhisperVoiceRecord.addEventListener('click', () => {
        startAudioRecording(true);
      });
    }
    if (el.btnWhisperCancelRecording) {
      el.btnWhisperCancelRecording.addEventListener('click', cancelAudioRecording);
    }
    if (el.btnWhisperSendRecording) {
      el.btnWhisperSendRecording.addEventListener('click', sendAudioRecording);
    }

    el.btnTextNextStranger.addEventListener('click', () => {
      if (isTextBotChat) {
        startAITextCompanionChat();
      } else if (socket) {
        socket.emit('next-text-stranger');
        el.textMessagesContainer.innerHTML = '<div class="chat-system-notice"><span class="notice-icon">🕊️</span><p>Skipped! Searching for a new stranger...</p></div>';
      }
    });

    el.btnTextAICompanion.addEventListener('click', startAITextCompanionChat);

    el.btnUpgradeTextToCall.addEventListener('click', () => {
      showView('voice');
      toggleVoiceCallState();
    });

    el.btnTextAddFriend.addEventListener('click', () => {
      if (!isInTextChat) return;
      if (socket) socket.emit('send-friend-request');
      alert('💌 Friend request sent to partner!');
    });

    // Solo Bot Test Button (Real Voice Output Speaking)
    el.btnVoiceTestBot.addEventListener('click', () => {
      startAIVoiceCompanionCall();
    });

    // Modals Openers
    el.btnOpenFilters.addEventListener('click', () => el.filtersModal.classList.remove('hide'));
    el.btnTextOpenFilters.addEventListener('click', () => el.filtersModal.classList.remove('hide'));
    el.btnCloseFiltersModal.addEventListener('click', () => el.filtersModal.classList.add('hide'));

    el.btnOpenFriendsDrawer.addEventListener('click', () => {
      el.friendsDrawerModal.classList.remove('hide');
      renderSavedFriends();
      renderPendingRequests();
    });
    el.btnTextOpenFriends.addEventListener('click', () => {
      el.friendsDrawerModal.classList.remove('hide');
      renderSavedFriends();
      renderPendingRequests();
    });
    el.btnCloseFriendsDrawer.addEventListener('click', () => el.friendsDrawerModal.classList.add('hide'));

    el.btnOpenGames.addEventListener('click', () => el.inCallGamesModal.classList.remove('hide'));
    el.btnCloseGamesModal.addEventListener('click', () => el.inCallGamesModal.classList.add('hide'));

    // Friends Drawer Tabs Switching
    el.tabFriends.addEventListener('click', () => {
      el.tabFriends.classList.add('active');
      el.tabRequests.classList.remove('active');
      el.tabHistory.classList.remove('active');
      el.friendsTabContent.classList.remove('hide');
      el.requestsTabContent.classList.add('hide');
      el.historyTabContent.classList.add('hide');
    });

    el.tabRequests.addEventListener('click', () => {
      el.tabRequests.classList.add('active');
      el.tabFriends.classList.remove('active');
      el.tabHistory.classList.remove('active');
      el.requestsTabContent.classList.remove('hide');
      el.friendsTabContent.classList.add('hide');
      el.historyTabContent.classList.add('hide');
    });

    el.tabHistory.addEventListener('click', () => {
      el.tabHistory.classList.add('active');
      el.tabFriends.classList.remove('active');
      el.tabRequests.classList.remove('active');
      el.historyTabContent.classList.remove('hide');
      el.friendsTabContent.classList.add('hide');
      el.requestsTabContent.classList.add('hide');
    });

    // Friend Toast Actions
    el.btnAcceptFriend.addEventListener('click', () => {
      if (pendingFriendRequests.length > 0) {
        acceptFriendRequest(pendingFriendRequests[0], 0);
      }
    });
    el.btnDeclineFriend.addEventListener('click', () => {
      if (pendingFriendRequests.length > 0) {
        declineFriendRequest(pendingFriendRequests[0], 0);
      }
    });

    // Emojis
    el.emojiChips.forEach(chip => {
      chip.addEventListener('click', () => {
        el.textChatInput.value += chip.getAttribute('data-emoji');
        el.textChatInput.focus();
      });
    });

    // Lightbox
    el.btnCloseLightbox.addEventListener('click', () => el.lightboxModal.classList.add('hide'));
  }

  // --- INITIALIZATION ---
  async function initApp() {
    // Register Service Worker for OS-level background notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('✅ Pigeon Service Worker Active (Background Notifications Ready):', reg.scope);
      }).catch((err) => {
        console.log('SW Registration Notice:', err);
      });
    }

    cacheDom();
    await detectUserIpLocation();
    setupSocket();
    setupEventListeners();
    initGames();
    loadGuestProfile();
    renderSavedFriends();
    renderPendingRequests();
  }

  window.addEventListener('DOMContentLoaded', initApp);

})();
