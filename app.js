// ==========================================================================
// THE PIGEON DIARY – AIRTALK FRONTEND CONTROLLER (BUG-FREE & ROCK-SOLID)
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
  let callTimerInterval = null;
  let callSeconds = 0;

  // WebRTC Audio Engine
  let peerConnection = null;
  let myLocalStream = null;
  let audioContext = null;
  let localAnalyser = null;
  let remoteAnalyser = null;
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
  let tttTurn = 'X';
  let tttGameOver = false;

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
    el.btnCloseWhisperDrawer = document.getElementById('btnCloseWhisperDrawer');
    el.whisperMessagesStream = document.getElementById('whisperMessagesStream');
    el.whisperChips = document.querySelectorAll('.w-chip');
    el.whisperInputForm = document.getElementById('whisperInputForm');
    el.whisperInput = document.getElementById('whisperInput');

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
      console.warn('Microphone access denied or not available:', err);
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
            el.speakingWave1.classList.add('active');
            el.speakingWave2.classList.add('active');
          }
        } else {
          if (speakingDebounce) {
            speakingDebounce = false;
            if (socket) socket.emit('audio-speaking', { isSpeaking: false });
            el.speakingWave1.classList.remove('active');
            el.speakingWave2.classList.remove('active');
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

      // Add local audio tracks
      if (myLocalStream) {
        myLocalStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, myLocalStream);
        });
      }

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          el.remoteAudioStream.srcObject = event.streams[0];
          el.remoteAudioStream.play().catch(e => console.log('Audio autoplay retry:', e));
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

    if (isInCall) {
      // Hang Up
      if (socket) socket.emit('hang-up-call');
      endCallState('you_hung_up');
    } else if (isSearching) {
      // Cancel Search
      if (socket) socket.emit('cancel-call-search');
      isSearching = false;
      setVoiceUIState('idle');
    } else {
      // Start Call Search
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
      // Open Whispers drawer automatically for Speak & Type mode!
      openInCallWhispers();
    } else {
      el.btnVoiceMuteAction.classList.remove('muted');
      el.iconVoiceMute.textContent = 'mic';
      el.labelVoiceMute.textContent = 'Mute';
    }
  }

  // --- FLOATING SUBTITLE ON CIRCLE (Screenshot 4) ---
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
      id: `wh_${Date.now()}_${Math.random()}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    renderWhisperItem(whisperObj, true);

    if (isSimulatedBotCall) {
      simulateBotWhisper(text);
    } else if (socket) {
      socket.emit('send-incall-whisper', { text });
    }
  }

  function renderWhisperItem(w, isMine) {
    const item = document.createElement('div');
    item.className = `whisper-msg-item ${isMine ? 'mine' : 'partner'}`;
    item.innerHTML = `<strong>${isMine ? 'You' : w.senderName}</strong><span>${w.text}</span>`;
    el.whisperMessagesStream.appendChild(item);
    el.whisperMessagesStream.scrollTop = el.whisperMessagesStream.scrollHeight;
  }

  function simulateBotWhisper(text) {
    setTimeout(() => {
      if (!isInCall) return;
      const replies = [
        "I hear you! Keep typing, I love listening to you! 🎙️",
        "Haha that is so funny! Tell me more! 😂",
        "100% agree with you! How's your day going? ✨",
        "Got your whisper crystal clear! You can unmute whenever you want too. 🎧"
      ];
      const rep = replies[Math.floor(Math.random() * replies.length)];
      const botW = {
        id: `wh_bot_${Date.now()}`,
        senderName: callPartner ? callPartner.nickname : 'Aria_Sky',
        text: rep
      };
      renderWhisperItem(botW, false);
      showFloatingSubtitle(botW.senderName, rep);
      playSoundFX('message');
    }, 1400);
  }

  // --- 1-ON-1 STRANGER TEXT CHAT MODE (Screenshot 5 & 6) ---
  function startTextChatSearch() {
    isTextSearching = true;
    el.textPartnerTitle.textContent = 'Searching for a stranger...';
    el.textPartnerSubtitle.textContent = 'Matching with an online Pigeon 🕊️';
    if (socket) socket.emit('start-text-search');
  }

  function sendTextMessage() {
    const text = el.textChatInput.value.trim();
    if (!text) return;

    const msgObj = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      senderCountryFlag: myProfile ? myProfile.countryFlag : '🕊️',
      type: 'text',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Render locally immediately
    renderMessageBubble(msgObj, true);
    el.textChatInput.value = '';

    if (socket) {
      socket.emit('send-chat-message', { content: text });
    }
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
      return; // Deduplicated!
    }
    if (msg.id) renderedMessageIds.add(msg.id);

    spawnCarrierPigeonAnimation(isMine);

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'partner'}`;
    bubble.innerHTML = `
      <div class="bubble-meta">
        <span class="bubble-sender">${isMine ? 'You' : msg.senderName}</span>
        <span>${msg.timestamp || ''}</span>
      </div>
      <div class="bubble-content">${msg.content}</div>
      <span class="pigeon-delivery-status">${isMine ? '💌 Khat Delivered ✨' : '💌 Khat Received 🕊️'}</span>
    `;

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

  // --- SOCKET.IO EVENT LISTENERS ---
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
      console.log('🔗 Voice Call Matched with partner:', data.partner);
      callPartner = data.partner;
      isSimulatedBotCall = !!data.isSimulatedBot;

      playSoundFX('connected');
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
      showFloatingSubtitle(whisper.senderName, whisper.text);
      el.whisperUnreadPulse.classList.remove('hide');
      playSoundFX('message');
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
    });

    socket.on('receive-chat-message', (msg) => {
      renderMessageBubble(msg, false);
    });

    // Friend Request Received
    socket.on('received-friend-request', (data) => {
      pendingFriendRequests.push(data);
      renderPendingRequests();

      el.toastAvatar.textContent = data.avatar || '🕊️';
      el.toastNickname.textContent = data.nickname;
      el.toastCountry.textContent = `${data.countryFlag || '🌍'} ${data.country || 'Global'}`;
      el.friendRequestToast.classList.remove('hide');
      playSoundFX('message');
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
      showView('voice');
      toggleVoiceCallState();
    });

    el.btnStartTextHero.addEventListener('click', () => {
      getAudioCtx();
      showView('text');
      startTextChatSearch();
    });

    el.btnGoToVoiceFromCard.addEventListener('click', () => {
      getAudioCtx();
      showView('voice');
    });

    el.btnGoToTextFromCard.addEventListener('click', () => {
      getAudioCtx();
      showView('text');
      startTextChatSearch();
    });

    // Voice View Nav
    el.btnVoiceHome.addEventListener('click', () => {
      if (isInCall) {
        if (confirm('Leave current call and return to home?')) {
          if (socket) socket.emit('hang-up-call');
          endCallState('you_hung_up');
          showView('landing');
        }
      } else {
        showView('landing');
      }
    });

    el.btnTextHome.addEventListener('click', () => {
      if (isInTextChat) {
        if (confirm('Leave current text chat and return to home?')) {
          if (socket) socket.emit('leave-text-chat');
          showView('landing');
        }
      } else {
        showView('landing');
      }
    });

    // Voice Controls (Screenshot 1 & 4)
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

    el.btnToggleInCallWhispers.addEventListener('click', openInCallWhispers);
    el.btnCloseWhisperDrawer.addEventListener('click', () => {
      el.inCallWhisperDrawer.classList.add('hide');
    });

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

    el.btnTextNextStranger.addEventListener('click', () => {
      if (socket) socket.emit('next-text-stranger');
      el.textMessagesContainer.innerHTML = '<div class="chat-system-notice"><span class="notice-icon">🕊️</span><p>Skipped! Searching for a new stranger...</p></div>';
    });

    el.btnUpgradeTextToCall.addEventListener('click', () => {
      showView('voice');
      toggleVoiceCallState();
    });

    el.btnTextAddFriend.addEventListener('click', () => {
      if (!isInTextChat) return;
      if (socket) socket.emit('send-friend-request');
      alert('💌 Friend request sent to partner!');
    });

    // Solo Bot Test Button
    el.btnVoiceTestBot.addEventListener('click', () => {
      getAudioCtx();
      if (socket) socket.emit('simulate-stranger-match');
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
