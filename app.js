/**
 * THE PIGEON DIARY - Client Application
 * Exclusive 10-User Real-time Voice & Chat Platform with IP Geolocation
 */

(() => {
  'use strict';

  // --- STATE ---
  let socket = null;
  let myProfile = null;
  let detectedLocation = {
    countryCode: 'IN',
    countryName: 'India',
    countryFlag: '🇮🇳',
    city: 'Mumbai',
    isIpVerified: true
  };

  let myLocalStream = null;
  let peerConnection = null;
  let callPartner = null;
  let currentCallId = null;
  let isMuted = false;
  let isSoundEnabled = true;
  let isAutoCallEnabled = false;
  let isSearching = false;
  let isInCall = false;
  let isSimulatedBotCall = false;
  
  let callTimerInterval = null;
  let callSeconds = 0;

  let mediaRecorder = null;
  let recordedAudioChunks = [];
  let recordTimerInterval = null;
  let recordingSeconds = 0;
  let pendingPhotoData = null;

  let hangupTimeout = null;
  let audioContext = null;
  let analyser = null;
  let visualizerAnimFrame = null;

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // --- DOM ELEMENTS ---
  const el = {
    // Nav & Status
    onlineCount: document.getElementById('onlineCount'),
    maxCount: document.getElementById('maxCount'),
    poolOnlineCount: document.getElementById('poolOnlineCount'),
    capacityPill: document.getElementById('capacityPill'),
    navAvatar: document.getElementById('navAvatar'),
    navNickname: document.getElementById('navNickname'),
    navCountry: document.getElementById('navCountry'),
    navFlag: document.getElementById('navFlag'),
    navCountryName: document.getElementById('navCountryName'),
    btnEditProfile: document.getElementById('btnEditProfile'),
    btnToggleSound: document.getElementById('btnToggleSound'),
    soundIcon: document.getElementById('soundIcon'),
    btnViewOnlineUsers: document.getElementById('btnViewOnlineUsers'),

    // Sidebar IP Display
    sidebarFlag: document.getElementById('sidebarFlag'),
    sidebarCountryName: document.getElementById('sidebarCountryName'),
    sidebarCity: document.getElementById('sidebarCity'),

    // Arena Center
    callArena: document.getElementById('callArena'),
    partnerCard: document.getElementById('partnerCard'),
    partnerAvatar: document.getElementById('partnerAvatar'),
    partnerNickname: document.getElementById('partnerNickname'),
    partnerGenderTag: document.getElementById('partnerGenderTag'),
    partnerCountryBadge: document.getElementById('partnerCountryBadge'),
    partnerCountryFlag: document.getElementById('partnerCountryFlag'),
    partnerCountryName: document.getElementById('partnerCountryName'),
    partnerSpeakingStatus: document.getElementById('partnerSpeakingStatus'),
    partnerInterests: document.getElementById('partnerInterests'),
    partnerPulseRing: document.getElementById('partnerPulseRing'),
    
    radarContainer: document.getElementById('radarContainer'),
    centerHubCircle: document.getElementById('centerHubCircle'),
    hubEmoticon: document.getElementById('hubEmoticon'),
    hubStatusText: document.getElementById('hubStatusText'),
    audioVisualizerCanvas: document.getElementById('audioVisualizerCanvas'),

    callTimerPill: document.getElementById('callTimerPill'),
    callDuration: document.getElementById('callDuration'),

    // Action Controls
    idleControls: document.getElementById('idleControls'),
    searchingControls: document.getElementById('searchingControls'),
    inCallControls: document.getElementById('inCallControls'),
    btnStartCall: document.getElementById('btnStartCall'),
    btnTestWithBot: document.getElementById('btnTestWithBot'),
    btnCancelSearch: document.getElementById('btnCancelSearch'),
    btnToggleMute: document.getElementById('btnToggleMute'),
    muteIcon: document.getElementById('muteIcon'),
    muteLabel: document.getElementById('muteLabel'),
    btnHangUp: document.getElementById('btnHangUp'),
    btnConfirmHangUp: document.getElementById('btnConfirmHangUp'),
    btnAddFriend: document.getElementById('btnAddFriend'),
    btnReportPartner: document.getElementById('btnReportPartner'),
    btnToggleMobileChat: document.getElementById('btnToggleMobileChat'),
    chatUnreadDot: document.getElementById('chatUnreadDot'),

    chkAutoCall: document.getElementById('chkAutoCall'),
    btnOpenLobbyChat: document.getElementById('btnOpenLobbyChat'),
    btnHelpGuide: document.getElementById('btnHelpGuide'),

    // Filters Left Panel
    leftPanel: document.getElementById('leftPanel'),
    prefGenderBtns: document.querySelectorAll('.gender-btn'),
    prefCountrySelect: document.getElementById('prefCountrySelect'),
    excludeCountrySelect: document.getElementById('excludeCountrySelect'),
    interestsChips: document.querySelectorAll('.interest-chip'),
    tabFriends: document.getElementById('tabFriends'),
    tabHistory: document.getElementById('tabHistory'),
    friendsTabContent: document.getElementById('friendsTabContent'),
    historyTabContent: document.getElementById('historyTabContent'),
    friendsList: document.getElementById('friendsList'),
    emptyFriends: document.getElementById('emptyFriends'),
    callHistoryList: document.getElementById('callHistoryList'),

    // Dedicated In-Call Whispers Window (Speak & Type Mode)
    inCallWhisperWindow: document.getElementById('inCallWhisperWindow'),
    floatingPartnerBubble: document.getElementById('floatingPartnerBubble'),
    floatingSenderName: document.getElementById('floatingSenderName'),
    floatingBubbleText: document.getElementById('floatingBubbleText'),
    btnMinWhisper: document.getElementById('btnMinWhisper'),
    btnCloseWhisperWindow: document.getElementById('btnCloseWhisperWindow'),
    whisperMessagesStream: document.getElementById('whisperMessagesStream'),
    whisperChips: document.querySelectorAll('.w-chip'),
    whisperForm: document.getElementById('whisperForm'),
    whisperInput: document.getElementById('whisperInput'),
    btnSendWhisper: document.getElementById('btnSendWhisper'),

    // Right Panel & Chat
    rightPanel: document.getElementById('rightPanel'),
    chatHeaderAvatar: document.getElementById('chatHeaderAvatar'),
    chatTargetTitle: document.getElementById('chatTargetTitle'),
    chatCountryPill: document.getElementById('chatCountryPill'),
    btnChatBack: document.getElementById('btnChatBack'),
    btnCloseChatMobile: document.getElementById('btnCloseChatMobile'),
    chatMessagesContainer: document.getElementById('chatMessagesContainer'),
    chatInputForm: document.getElementById('chatInputForm'),
    chatTextInput: document.getElementById('chatTextInput'),
    btnSendText: document.getElementById('btnSendText'),
    imageFileInput: document.getElementById('imageFileInput'),
    btnStartVoiceRecord: document.getElementById('btnStartVoiceRecord'),
    voiceRecorderOverlay: document.getElementById('voiceRecorderOverlay'),
    recordingTimer: document.getElementById('recordingTimer'),
    btnCancelRecording: document.getElementById('btnCancelRecording'),
    btnSendRecording: document.getElementById('btnSendRecording'),
    photoPreviewBar: document.getElementById('photoPreviewBar'),
    photoPreviewImg: document.getElementById('photoPreviewImg'),
    photoCaptionInput: document.getElementById('photoCaptionInput'),
    btnRemovePhoto: document.getElementById('btnRemovePhoto'),
    btnSendPhoto: document.getElementById('btnSendPhoto'),
    emojiChips: document.querySelectorAll('.emoji-chip'),
    topicPills: document.querySelectorAll('.topic-pill'),

    // Modals
    guestModalBackdrop: document.getElementById('guestModalBackdrop'),
    btnCloseGuestModal: document.getElementById('btnCloseGuestModal'),
    guestProfileForm: document.getElementById('guestProfileForm'),
    guestNickname: document.getElementById('guestNickname'),
    modalDetectedFlag: document.getElementById('modalDetectedFlag'),
    modalDetectedCountryName: document.getElementById('modalDetectedCountryName'),
    btnToggleManualCountry: document.getElementById('btnToggleManualCountry'),
    manualCountryWrapper: document.getElementById('manualCountryWrapper'),
    guestCountrySelect: document.getElementById('guestCountrySelect'),
    avatarOptions: document.querySelectorAll('.avatar-option'),
    genderRadioPills: document.querySelectorAll('.gender-radio-pill'),

    capacityFullModal: document.getElementById('capacityFullModal'),
    queuePosNumber: document.getElementById('queuePosNumber'),

    onlineUsersModal: document.getElementById('onlineUsersModal'),
    modalOnlineCount: document.getElementById('modalOnlineCount'),
    modalUsersGrid: document.getElementById('modalUsersGrid'),
    btnCloseUsersModal: document.getElementById('btnCloseUsersModal'),

    lightboxModal: document.getElementById('lightboxModal'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    btnCloseLightbox: document.getElementById('btnCloseLightbox'),

    friendRequestToast: document.getElementById('friendRequestToast'),
    toastAvatar: document.getElementById('toastAvatar'),
    toastNickname: document.getElementById('toastNickname'),
    toastCountry: document.getElementById('toastCountry'),
    btnAcceptFriend: document.getElementById('btnAcceptFriend'),
    btnDeclineFriend: document.getElementById('btnDeclineFriend'),

    remoteAudioStream: document.getElementById('remoteAudioStream'),

    // In-Call Games & Live Chat
    btnOpenInCallGames: document.getElementById('btnOpenInCallGames'),
    btnOpenInCallChat: document.getElementById('btnOpenInCallChat'),
    inCallGamesModal: document.getElementById('inCallGamesModal'),
    btnCloseGamesModal: document.getElementById('btnCloseGamesModal'),
    gameTabBtns: document.querySelectorAll('.game-tab-btn'),
    gameArenaViews: document.querySelectorAll('.game-arena-view'),

    // Tic Tac Toe
    tttGrid: document.getElementById('tttGrid'),
    tttCells: document.querySelectorAll('.ttt-cell'),
    tttTurnBanner: document.getElementById('tttTurnBanner'),
    tttMyScore: document.getElementById('tttMyScore'),
    tttPartnerScore: document.getElementById('tttPartnerScore'),
    tttMyName: document.getElementById('tttMyName'),
    tttPartnerName: document.getElementById('tttPartnerName'),
    btnResetTTT: document.getElementById('btnResetTTT'),

    // Rock Paper Scissors
    rpsStatusBox: document.getElementById('rpsStatusBox'),
    rpsBtns: document.querySelectorAll('.rps-btn'),
    rpsResultReveal: document.getElementById('rpsResultReveal'),
    rpsMyChoiceEmoji: document.getElementById('rpsMyChoiceEmoji'),
    rpsPartnerChoiceEmoji: document.getElementById('rpsPartnerChoiceEmoji'),
    rpsWinnerVerdict: document.getElementById('rpsWinnerVerdict'),

    // Icebreaker
    ibCategory: document.getElementById('ibCategory'),
    ibQuestion: document.getElementById('ibQuestion'),
    btnNextIcebreaker: document.getElementById('btnNextIcebreaker'),

    // Dice
    myDiceCube: document.getElementById('myDiceCube'),
    partnerDiceCube: document.getElementById('partnerDiceCube'),
    diceVerdict: document.getElementById('diceVerdict'),
    btnRollDice: document.getElementById('btnRollDice')
  };

  // ==========================================================
  // IN-CALL GAMES CONTROLLER (AirTALK Style Multiplayer Games)
  // ==========================================================
  let tttBoard = Array(9).fill(null);
  let tttIsMyTurn = true;
  let tttMyScore = 0;
  let tttPartnerScore = 0;
  let tttGameOver = false;

  let rpsMyPick = null;
  let rpsPartnerPick = null;

  const icebreakerQuestions = [
    { cat: '🔥 Deep Question', q: 'If you could travel anywhere in the world tomorrow for free, where would you go and why?' },
    { cat: '☕ Casual Vibe', q: 'What is one song you never get tired of listening to?' },
    { cat: '🎭 Would You Rather', q: 'Would you rather speak all world languages or be able to talk to animals?' },
    { cat: '💡 Fun Trivia', q: 'What is the most adventurous or crazy thing you have ever done in your life?' },
    { cat: '🍕 Late Night Talk', q: 'What is your comfort food when you are stressed or celebrating?' },
    { cat: '🎬 Movie Night', q: 'If your life was a movie, what would the title and genre be?' },
    { cat: '✨ Superpower', q: 'If you had one superpower for 24 hours, what would it be?' },
    { cat: '📱 Digital Life', q: 'What is one app on your phone you cannot live without?' }
  ];
  let currentIbIndex = 0;

  function openGamesModal() {
    el.inCallGamesModal.classList.remove('hide');
    if (callPartner) {
      el.tttMyName.textContent = `${myProfile ? myProfile.nickname : 'You'} (🕊️)`;
      el.tttPartnerName.textContent = `${callPartner.nickname} (🐦)`;
    }
  }

  // 1. TIC-TAC-TOE
  function handleTTTMove(index, isMyAction) {
    if (tttGameOver || tttBoard[index] !== null) return;
    if (isMyAction && !tttIsMyTurn) {
      el.tttTurnBanner.textContent = "Wait for partner's turn!";
      return;
    }

    const symbol = isMyAction ? '🕊️' : '🐦';
    tttBoard[index] = symbol;
    el.tttCells[index].textContent = symbol;

    if (isMyAction) {
      socket.emit('send-game-action', {
        gameType: 'tictactoe',
        action: 'move',
        payload: { index }
      });
      tttIsMyTurn = false;
      el.tttTurnBanner.textContent = "Partner's Turn 🐦...";

      // Bot simulation move
      if (isSimulatedBotCall) {
        setTimeout(() => {
          if (!tttGameOver && isInCall) {
            const emptyCells = [];
            tttBoard.forEach((val, i) => { if (val === null) emptyCells.push(i); });
            if (emptyCells.length > 0) {
              const botPick = emptyCells[Math.floor(Math.random() * emptyCells.length)];
              handleTTTMove(botPick, false);
            }
          }
        }, 800);
      }
    } else {
      tttIsMyTurn = true;
      el.tttTurnBanner.textContent = "Your Turn! Pick a square 🕊️";
    }

    checkTTTWinner();
  }

  function checkTTTWinner() {
    const lines = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6]
    ];

    for (const [a, b, c] of lines) {
      if (tttBoard[a] && tttBoard[a] === tttBoard[b] && tttBoard[a] === tttBoard[c]) {
        tttGameOver = true;
        const winner = tttBoard[a];
        if (winner === '🕊️') {
          tttMyScore++;
          el.tttMyScore.textContent = tttMyScore;
          el.tttTurnBanner.textContent = "🎉 You Won this round!";
          playSoundFX('connected');
        } else {
          tttPartnerScore++;
          el.tttPartnerScore.textContent = tttPartnerScore;
          el.tttTurnBanner.textContent = "Partner Won this round!";
          playSoundFX('hangup');
        }
        return;
      }
    }

    if (!tttBoard.includes(null)) {
      tttGameOver = true;
      el.tttTurnBanner.textContent = "It's a Draw! 🤝";
    }
  }

  function resetTTTGame(broadcast) {
    tttBoard = Array(9).fill(null);
    tttGameOver = false;
    tttIsMyTurn = true;
    el.tttCells.forEach(cell => { cell.textContent = ''; });
    el.tttTurnBanner.textContent = "New Round! Your Turn 🕊️";

    if (broadcast) {
      socket.emit('send-game-action', {
        gameType: 'tictactoe',
        action: 'reset',
        payload: {}
      });
    }
  }

  // 2. ROCK PAPER SCISSORS
  function handleRPSChoice(choice) {
    rpsMyPick = choice;
    el.rpsStatusBox.textContent = `You chose ${getRpsEmoji(choice)}! Waiting for partner...`;

    socket.emit('send-game-action', {
      gameType: 'rps',
      action: 'choice',
      payload: { choice }
    });

    if (isSimulatedBotCall) {
      setTimeout(() => {
        const botChoices = ['rock', 'paper', 'scissors'];
        const botPick = botChoices[Math.floor(Math.random() * botChoices.length)];
        revealRPSResults(choice, botPick);
      }, 700);
    } else if (rpsPartnerPick) {
      revealRPSResults(rpsMyPick, rpsPartnerPick);
    }
  }

  function getRpsEmoji(c) {
    if (c === 'rock') return '✊';
    if (c === 'paper') return '✋';
    return '✌️';
  }

  function revealRPSResults(myPick, partnerPick) {
    el.rpsResultReveal.classList.remove('hide');
    el.rpsMyChoiceEmoji.textContent = getRpsEmoji(myPick);
    el.rpsPartnerChoiceEmoji.textContent = getRpsEmoji(partnerPick);

    if (myPick === partnerPick) {
      el.rpsWinnerVerdict.textContent = "It's a Tie! 🤝";
    } else if (
      (myPick === 'rock' && partnerPick === 'scissors') ||
      (myPick === 'paper' && partnerPick === 'rock') ||
      (myPick === 'scissors' && partnerPick === 'paper')
    ) {
      el.rpsWinnerVerdict.textContent = "🎉 You Won!";
      playSoundFX('connected');
    } else {
      el.rpsWinnerVerdict.textContent = "Partner Won! 🏆";
      playSoundFX('hangup');
    }

    rpsMyPick = null;
    rpsPartnerPick = null;
    setTimeout(() => {
      el.rpsStatusBox.textContent = "Pick your hand again!";
    }, 2000);
  }

  // 3. ICEBREAKER
  function pickNextIcebreaker(broadcast) {
    currentIbIndex = (currentIbIndex + 1) % icebreakerQuestions.length;
    const item = icebreakerQuestions[currentIbIndex];
    el.ibCategory.textContent = item.cat;
    el.ibQuestion.textContent = item.q;

    if (broadcast) {
      socket.emit('send-game-action', {
        gameType: 'icebreaker',
        action: 'next',
        payload: { index: currentIbIndex }
      });
    }
  }

  // 4. DICE DUEL
  function handleDiceRoll(isMyRoll) {
    const roll = Math.floor(Math.random() * 6) + 1;
    el.myDiceCube.textContent = `🎲 ${roll}`;
    el.diceVerdict.textContent = "You rolled! Waiting for partner...";

    socket.emit('send-game-action', {
      gameType: 'dice',
      action: 'roll',
      payload: { roll }
    });

    if (isSimulatedBotCall) {
      setTimeout(() => {
        const botRoll = Math.floor(Math.random() * 6) + 1;
        el.partnerDiceCube.textContent = `🎲 ${botRoll}`;
        if (roll > botRoll) {
          el.diceVerdict.textContent = `🎉 You Win! (${roll} vs ${botRoll})`;
          playSoundFX('connected');
        } else if (botRoll > roll) {
          el.diceVerdict.textContent = `Partner Wins! (${botRoll} vs ${roll})`;
        } else {
          el.diceVerdict.textContent = `It's a Tie! (${roll} each) 🤝`;
        }
      }, 700);
    }
  }

  // INCOMING GAME ACTIONS DISPATCHER
  function handleIncomingGameAction(data) {
    if (data.gameType === 'tictactoe') {
      if (data.action === 'move') {
        handleTTTMove(data.payload.index, false);
      } else if (data.action === 'reset') {
        resetTTTGame(false);
      }
    } else if (data.gameType === 'rps') {
      if (data.action === 'choice') {
        rpsPartnerPick = data.payload.choice;
        if (rpsMyPick) {
          revealRPSResults(rpsMyPick, rpsPartnerPick);
        } else {
          el.rpsStatusBox.textContent = "Partner made their pick! Your turn...";
        }
      }
    } else if (data.gameType === 'icebreaker') {
      if (data.action === 'next' && icebreakerQuestions[data.payload.index]) {
        currentIbIndex = data.payload.index;
        const item = icebreakerQuestions[currentIbIndex];
        el.ibCategory.textContent = item.cat;
        el.ibQuestion.textContent = item.q;
        openGamesModal();
        // Switch to icebreaker tab
        el.gameTabBtns.forEach(b => {
          if (b.getAttribute('data-game') === 'icebreaker') b.classList.add('active');
          else b.classList.remove('active');
        });
        el.gameArenaViews.forEach(v => v.classList.add('hide'));
        el.icebreakerView = document.getElementById('icebreakerView');
        if (el.icebreakerView) el.icebreakerView.classList.remove('hide');
      }
    } else if (data.gameType === 'dice') {
      if (data.action === 'roll') {
        el.partnerDiceCube.textContent = `🎲 ${data.payload.roll}`;
        el.diceVerdict.textContent = `Partner rolled ${data.payload.roll}! Tap Roll to compete.`;
      }
    }
  }

  let chatMode = 'lobby'; // 'lobby', 'call_partner', 'friend'
  let activeFriendNickname = null;
  let onlineUsersGlobalList = [];

  // --- AUDIO SYNTHESIZER ---
  function getAudioCtx() {
    if (!audioContext) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (AudioCtxClass) {
        audioContext = new AudioCtxClass();
      }
    }
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function playSoundFX(type) {
    if (!isSoundEnabled) return;
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'call_ring') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(480, now + 0.1);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'pigeon_flutter') {
        // Soft bird wing flap / whoosh flutter
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(380, now + 0.08);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.16);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.24);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'connected') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.12);
        osc.frequency.setValueAtTime(783.99, now + 0.24);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc.start(now);
        osc.stop(now + 0.45);
      } else if (type === 'hangup') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.setValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'message') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(1046.5, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Audio FX error:', e);
    }
  }

  // --- IP GEOLOCATION AUTO-DETECTION ---
  async function detectUserIpLocation() {
    try {
      // 1. Try server endpoint first
      const res = await fetch('/api/detect-location');
      if (res.ok) {
        const data = await res.json();
        if (data && data.countryCode) {
          detectedLocation = {
            countryCode: data.countryCode,
            countryName: data.countryName || 'India',
            countryFlag: data.countryFlag || '🇮🇳',
            city: data.city || 'IP Verified',
            isIpVerified: true
          };
          updateDetectedLocationUI();
          return;
        }
      }
    } catch (e) {
      console.log('Server IP detection fallback...');
    }

    // 2. Client-side fallback if server was on local test
    try {
      const publicRes = await fetch('https://ipwho.is/');
      if (publicRes.ok) {
        const pData = await publicRes.json();
        if (pData && pData.country_code) {
          detectedLocation = {
            countryCode: pData.country_code,
            countryName: pData.country,
            countryFlag: pData.flag ? pData.flag.emoji : '🌍',
            city: pData.city || '',
            isIpVerified: true
          };
          updateDetectedLocationUI();
        }
      }
    } catch (err) {
      console.warn('IP lookup fallback complete.');
      updateDetectedLocationUI();
    }
  }

  function updateDetectedLocationUI() {
    if (el.sidebarFlag) el.sidebarFlag.textContent = detectedLocation.countryFlag;
    if (el.sidebarCountryName) el.sidebarCountryName.textContent = detectedLocation.countryName;
    if (el.sidebarCity) el.sidebarCity.textContent = detectedLocation.city ? `City: ${detectedLocation.city}` : '📍 IP Geolocation Verified';

    if (el.modalDetectedFlag) el.modalDetectedFlag.textContent = detectedLocation.countryFlag;
    if (el.modalDetectedCountryName) el.modalDetectedCountryName.textContent = detectedLocation.countryName;

    if (el.navFlag) el.navFlag.textContent = detectedLocation.countryFlag;
    if (el.navCountryName) el.navCountryName.textContent = detectedLocation.countryName;
  }

  // --- INITIALIZATION ---
  async function initApp() {
    await detectUserIpLocation();
    setupSocket();
    setupEventListeners();
    loadProfileFromStorage();
    renderSavedFriends();
    renderCallHistory();
  }

  // --- SOCKET.IO SETUP ---
  function setupSocket() {
    socket = io();

    socket.on('connect', () => {
      console.log('✅ Connected to The Pigeon Diary server:', socket.id);
      if (myProfile) {
        socket.emit('register-guest', myProfile);
      }
    });

    socket.on('ip-detected', (loc) => {
      if (loc && loc.countryCode) {
        detectedLocation = {
          countryCode: loc.countryCode,
          countryName: loc.countryName,
          countryFlag: loc.countryFlag,
          city: loc.city || '',
          isIpVerified: true
        };
        updateDetectedLocationUI();
      }
    });

    socket.on('site-theme-update', (data) => {
      if (data && data.theme) {
        document.body.className = `pigeon-theme theme-${data.theme}`;
      }
    });

    socket.on('site-announcement', (data) => {
      const banner = document.getElementById('globalAnnouncementBanner');
      const bannerText = document.getElementById('announcementBannerText');
      if (data && data.text && data.text.trim()) {
        bannerText.textContent = data.text;
        banner.classList.remove('hide');
      } else {
        banner.classList.add('hide');
      }
    });

    socket.on('kicked-notice', (data) => {
      alert(`⚠️ You have been disconnected by the Admin: ${data.reason}`);
      window.location.reload();
    });

    socket.on('banned-notice', (data) => {
      alert(`🚫 ${data.message}`);
      window.location.reload();
    });

    socket.on('registration-success', (data) => {
      console.log('🎉 Guest registered successfully:', data.user);
      myProfile = data.user;
      updateProfileUI();
      el.guestModalBackdrop.classList.add('hide');
      el.capacityFullModal.classList.add('hide');
    });

    socket.on('capacity-full-waiting', (data) => {
      console.warn('Roost capacity full:', data);
      el.queuePosNumber.textContent = `#${data.position}`;
      el.capacityFullModal.classList.remove('hide');
    });

    socket.on('admitted-to-lobby', (data) => {
      el.capacityFullModal.classList.add('hide');
      el.guestModalBackdrop.classList.add('hide');
      updateProfileUI();
      addSystemChatMessage('🎉 Spot opened! You have been admitted to The Pigeon Diary roost.');
    });

    socket.on('lobby-state', (state) => {
      el.onlineCount.textContent = state.activeCount;
      el.maxCount.textContent = state.maxCapacity;
      el.poolOnlineCount.textContent = state.activeCount;
      el.modalOnlineCount.textContent = state.activeCount;
      onlineUsersGlobalList = state.users || [];
      renderOnlineUsersModal(state.users);
      renderSavedFriends(); // Update online/offline & Last Seen indicators
    });

    // Real-time Friend Presence & Last Seen Updates
    socket.on('user-presence-update', (data) => {
      updateFriendPresence(data.nickname, data.isOnline, data.lastSeen);
    });

    socket.on('search-status', (data) => {
      if (data.status === 'searching') {
        isSearching = true;
        setUIState('searching');
      } else {
        isSearching = false;
        if (!isInCall) setUIState('idle');
      }
    });

    // Call Matched
    socket.on('call-matched', async (data) => {
      console.log('🔗 Call Matched with partner:', data.partner);
      isInCall = true;
      isSearching = false;
      currentCallId = data.callId;
      callPartner = data.partner;
      isSimulatedBotCall = !!data.isSimulatedBot;

      playSoundFX('connected');
      startCallTimer();
      setUIState('in_call');
      updatePartnerUI(callPartner);

      setChatPartner(callPartner);
      addSystemChatMessage(`🕊️ Connected with ${callPartner.countryFlag} ${callPartner.nickname} (${callPartner.country} 📍 IP Verified)!`);

      saveCallToHistory(callPartner);

      if (isSimulatedBotCall) {
        startBotSimulationLoop();
        return;
      }

      await initWebRTCCall(data.isInitiator, callPartner.id);
    });

    // WebRTC Signaling
    socket.on('webrtc-offer', async (data) => {
      if (isSimulatedBotCall) return;
      await handleWebRTCOffer(data.offer, data.senderId);
    });

    socket.on('webrtc-answer', async (data) => {
      if (isSimulatedBotCall) return;
      await handleWebRTCAnswer(data.answer);
    });

    socket.on('webrtc-ice-candidate', async (data) => {
      if (isSimulatedBotCall) return;
      await handleWebRTCIceCandidate(data.candidate);
    });

    // Partner Speaking feedback
    socket.on('partner-speaking', (data) => {
      if (data.isSpeaking) {
        el.partnerPulseRing.classList.add('speaking');
        el.partnerSpeakingStatus.textContent = 'Speaking 🎙️';
        el.partnerSpeakingStatus.style.color = '#10b981';
      } else {
        el.partnerPulseRing.classList.remove('speaking');
        el.partnerSpeakingStatus.textContent = 'Listening 🎧';
        el.partnerSpeakingStatus.style.color = 'var(--primary-cyan)';
      }
    });

    // Call Ended
    socket.on('call-ended', (data) => {
      handleCallEnd(data.reason);
    });

    // Dedicated In-Call Live Whispers (Speak & Type Mode)
    socket.on('receive-incall-whisper', (whisper) => {
      playSoundFX('message');
      renderWhisperMsg(whisper, false);
      showFloatingWhisper(whisper.senderName, whisper.text);
      if (el.inCallWhisperWindow.classList.contains('hide')) {
        el.inCallWhisperWindow.classList.remove('hide');
      }
    });

    socket.on('incall-whisper-ack', (whisper) => {
      renderWhisperMsg(whisper, true);
    });

    // Chat Received
    socket.on('receive-chat-message', (msg) => {
      playSoundFX('message');
      renderMessageBubble(msg, false);
      if (window.innerWidth <= 1024 && !el.rightPanel.classList.contains('open')) {
        el.chatUnreadDot.classList.remove('hide');
      }
    });

    socket.on('message-sent-ack', (msg) => {
      renderMessageBubble(msg, true);
    });

    socket.on('receive-lobby-chat-message', (msg) => {
      if (!isInCall) {
        playSoundFX('message');
        renderMessageBubble(msg, msg.senderId === socket.id);
      }
    });

    // Friend Direct Messages (Persistent DM)
    socket.on('receive-friend-direct-message', (msg) => {
      saveMessageToFriendHistory(msg.senderName, msg, false);
      playSoundFX('message');
      if (chatMode === 'friend' && activeFriendNickname === msg.senderName) {
        renderMessageBubble(msg, false);
      } else {
        addSystemChatMessage(`💌 New private message from friend ${msg.senderCountryFlag || ''} <strong>${msg.senderName}</strong>! Click Friends tab to view.`);
        if (window.innerWidth <= 1024 && !el.rightPanel.classList.contains('open')) {
          el.chatUnreadDot.classList.remove('hide');
        }
      }
    });

    socket.on('friend-direct-message-ack', (msg) => {
      saveMessageToFriendHistory(msg.targetFriendNickname, msg, true);
      if (chatMode === 'friend' && activeFriendNickname === msg.targetFriendNickname) {
        renderMessageBubble(msg, true);
      }
    });

    // Friend Request Received
    socket.on('received-friend-request', (data) => {
      showFriendToast(data);
    });

    // In-Call Games Synchronization
    socket.on('receive-game-action', (data) => {
      handleIncomingGameAction(data);
    });

    socket.on('friend-request-response', (data) => {
      if (data.accepted) {
        addFriendToList(data);
        addSystemChatMessage(`💖 ${data.nickname} accepted your friend request! Added to friends list.`);
      } else {
        addSystemChatMessage(`ℹ️ ${data.nickname} declined the friend request.`);
      }
    });

    socket.on('report-received', (data) => {
      alert(`⚠️ ${data.message}`);
    });

    socket.on('error-msg', (data) => {
      alert(`Notice: ${data.message}`);
    });
  }

  // --- GUEST PROFILE MANAGEMENT (NO INITIAL POPUP & PERSISTENT) ---
  function loadProfileFromStorage() {
    let saved = localStorage.getItem('pigeon_guest_profile');
    
    if (saved) {
      try {
        myProfile = JSON.parse(saved);
      } catch (e) {
        myProfile = null;
      }
    }

    // If no profile saved, auto-generate a persistent guest profile without popup!
    if (!myProfile) {
      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      myProfile = {
        nickname: `Pigeon_${randomSuffix}`,
        avatar: '🕊️',
        gender: 'male',
        country: detectedLocation.countryName || 'India',
        countryCode: detectedLocation.countryCode || 'IN',
        countryFlag: detectedLocation.countryFlag || '🇮🇳',
        interests: ['Music', 'Travel', 'Talks'],
        preferredGender: 'both',
        preferredCountries: [],
        excludedCountries: []
      };
      localStorage.setItem('pigeon_guest_profile', JSON.stringify(myProfile));
    }

    updateProfileUI();
    el.guestNickname.value = myProfile.nickname || '';
    selectAvatarOption(myProfile.avatar || '🕊️');
    selectGenderPill(myProfile.gender || 'male');
    el.guestModalBackdrop.classList.add('hide'); // NEVER pop up on initial open

    if (socket && socket.connected) {
      socket.emit('register-guest', myProfile);
    }
  }

  function openGuestModal() {
    el.guestNickname.value = myProfile ? myProfile.nickname : '';
    el.guestModalBackdrop.classList.remove('hide');
  }

  function closeGuestModal() {
    el.guestModalBackdrop.classList.add('hide');
  }

  function updateProfileUI() {
    if (!myProfile) return;
    el.navNickname.textContent = myProfile.nickname || 'Guest Pigeon';
    el.navAvatar.textContent = myProfile.avatar || '🐦';
    if (el.navFlag) el.navFlag.textContent = myProfile.countryFlag || '🌍';
    if (el.navCountryName) el.navCountryName.textContent = myProfile.country || 'Global';
  }

  function getSelectedInterests() {
    const tags = [];
    document.querySelectorAll('.interest-chip.active').forEach(chip => {
      tags.push(chip.getAttribute('data-tag'));
    });
    return tags;
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    // Sound FX toggle
    el.btnToggleSound.addEventListener('click', () => {
      isSoundEnabled = !isSoundEnabled;
      el.soundIcon.textContent = isSoundEnabled ? 'volume_up' : 'volume_off';
      el.soundIcon.style.color = isSoundEnabled ? '#e2e8f0' : '#ef4444';
      if (isSoundEnabled) getAudioCtx();
    });

    // Profile Edit button
    el.btnEditProfile.addEventListener('click', () => {
      openGuestModal();
    });

    // Toggle manual country select
    if (el.btnToggleManualCountry) {
      el.btnToggleManualCountry.addEventListener('click', () => {
        el.manualCountryWrapper.classList.toggle('hide');
      });
    }

    if (el.guestCountrySelect) {
      el.guestCountrySelect.addEventListener('change', (e) => {
        const parts = e.target.value.split('|');
        detectedLocation = {
          countryCode: parts[0],
          countryName: parts[1],
          countryFlag: parts[2],
          isIpVerified: true
        };
        updateDetectedLocationUI();
      });
    }

    // Avatar selector
    el.avatarOptions.forEach(opt => {
      opt.addEventListener('click', () => {
        el.avatarOptions.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        opt.querySelector('input').checked = true;
      });
    });

    // Gender selector
    el.genderRadioPills.forEach(pill => {
      pill.addEventListener('click', () => {
        el.genderRadioPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        pill.querySelector('input').checked = true;
      });
    });

    // Guest Profile Submit
    el.guestProfileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      getAudioCtx();

      const nickname = el.guestNickname.value.trim();
      const avatarRadio = document.querySelector('input[name="guestAvatar"]:checked');
      const genderRadio = document.querySelector('input[name="guestGender"]:checked');
      const prefGenderRadio = document.querySelector('input[name="prefGender"]:checked');

      if (!nickname) return;

      myProfile = {
        nickname: nickname,
        countryCode: detectedLocation.countryCode,
        country: detectedLocation.countryName,
        countryFlag: detectedLocation.countryFlag,
        isIpVerified: true,
        avatar: avatarRadio ? avatarRadio.value : '🕊️',
        gender: genderRadio ? genderRadio.value : 'male',
        interests: getSelectedInterests(),
        preferredGender: prefGenderRadio ? prefGenderRadio.value : 'both',
        preferredCountries: el.prefCountrySelect.value ? [el.prefCountrySelect.value] : [],
        excludedCountries: el.excludeCountrySelect.value ? [el.excludeCountrySelect.value] : []
      };

      localStorage.setItem('pigeon_guest_profile', JSON.stringify(myProfile));
      updateProfileUI();
      el.guestModalBackdrop.classList.add('hide');

      if (socket) {
        socket.emit('register-guest', myProfile);
      }
    });

    // Gender filter buttons (left panel)
    el.prefGenderBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.prefGenderBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const input = btn.querySelector('input');
        if (input) input.checked = true;
        syncFilterPreferences();
      });
    });

    // Country select filters
    el.prefCountrySelect.addEventListener('change', syncFilterPreferences);
    el.excludeCountrySelect.addEventListener('change', syncFilterPreferences);

    // Interests chips toggle
    el.interestsChips.forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        syncFilterPreferences();
      });
    });

    // Tabs in Friends/Log card
    el.tabFriends.addEventListener('click', () => {
      el.tabFriends.classList.add('active');
      el.tabHistory.classList.remove('active');
      el.friendsTabContent.classList.remove('hide');
      el.historyTabContent.classList.add('hide');
    });

    el.tabHistory.addEventListener('click', () => {
      el.tabHistory.classList.add('active');
      el.tabFriends.classList.remove('active');
      el.historyTabContent.classList.remove('hide');
      el.friendsTabContent.classList.add('hide');
    });

    // View online users modal
    el.btnViewOnlineUsers.addEventListener('click', () => {
      el.onlineUsersModal.classList.remove('hide');
    });
    el.btnCloseUsersModal.addEventListener('click', () => {
      el.onlineUsersModal.classList.add('hide');
    });

    // Start Call Search Button
    el.btnStartCall.addEventListener('click', () => {
      getAudioCtx();
      startStrangerSearch();
    });

    // Test with Companion Bot
    el.btnTestWithBot.addEventListener('click', () => {
      getAudioCtx();
      if (!myProfile) {
        openGuestModal();
        return;
      }
      socket.emit('simulate-stranger-match');
    });

    // Cancel Search
    el.btnCancelSearch.addEventListener('click', () => {
      socket.emit('cancel-call-search');
      isSearching = false;
      setUIState('idle');
    });

    // Mute Button (With Live Typing Mode Feedback)
    el.btnToggleMute.addEventListener('click', () => {
      toggleMute();
      if (isMuted) {
        addSystemChatMessage('🔇 You are now Muted. Speak & Type mode active — use In-Call Whispers to type while listening!');
        openInCallWhisperWindow();
      } else {
        addSystemChatMessage('🎙️ Microphone unmuted.');
      }
    });

    // In-Call Live Chat Opener (Dedicated Call Whisper Overlay)
    el.btnOpenInCallChat.addEventListener('click', () => {
      if (!isInCall) {
        alert('Connect to a call first to use In-Call Live Whispers!');
        return;
      }
      openInCallWhisperWindow();
    });

    // In-Call Whisper Window Controls
    if (el.btnCloseWhisperWindow) {
      el.btnCloseWhisperWindow.addEventListener('click', () => {
        el.inCallWhisperWindow.classList.add('hide');
      });
    }

    if (el.btnMinWhisper) {
      el.btnMinWhisper.addEventListener('click', () => {
        el.inCallWhisperWindow.classList.toggle('minimized');
      });
    }

    if (el.whisperForm) {
      el.whisperForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = el.whisperInput.value.trim();
        if (text) {
          sendInCallWhisper(text);
          el.whisperInput.value = '';
        }
      });
    }

    if (el.whisperChips) {
      el.whisperChips.forEach(chip => {
        chip.addEventListener('click', () => {
          const text = chip.getAttribute('data-msg');
          if (text) {
            sendInCallWhisper(text);
          }
        });
      });
    }

    // In-Call Games Opener
    el.btnOpenInCallGames.addEventListener('click', () => {
      if (!isInCall) {
        alert('Please connect to a call first to play games with your partner!');
        return;
      }
      openGamesModal();
    });

    el.btnCloseGamesModal.addEventListener('click', () => {
      el.inCallGamesModal.classList.add('hide');
    });

    // Game Tab switching
    el.gameTabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        el.gameTabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetGame = btn.getAttribute('data-game');
        el.gameArenaViews.forEach(v => v.classList.add('hide'));
        const targetView = document.getElementById(`${targetGame}View`);
        if (targetView) targetView.classList.remove('hide');
      });
    });

    // Tic Tac Toe Grid Clicks
    el.tttCells.forEach(cell => {
      cell.addEventListener('click', () => {
        const idx = parseInt(cell.getAttribute('data-index'));
        handleTTTMove(idx, true);
      });
    });

    el.btnResetTTT.addEventListener('click', () => {
      resetTTTGame(true);
    });

    // Rock Paper Scissors
    el.rpsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.getAttribute('data-choice');
        handleRPSChoice(choice);
      });
    });

    // Icebreaker Next Card
    el.btnNextIcebreaker.addEventListener('click', () => {
      pickNextIcebreaker(true);
    });

    // Roll Dice
    el.btnRollDice.addEventListener('click', () => {
      handleDiceRoll(true);
    });

    // Hangup Button with "Sure?" confirmation
    el.btnHangUp.addEventListener('click', () => {
      el.btnConfirmHangUp.classList.remove('hide');
      clearTimeout(hangupTimeout);
      hangupTimeout = setTimeout(() => {
        el.btnConfirmHangUp.classList.add('hide');
      }, 4000);
    });

    el.btnConfirmHangUp.addEventListener('click', () => {
      el.btnConfirmHangUp.classList.add('hide');
      hangUpCall();
    });

    // Add Friend in call
    el.btnAddFriend.addEventListener('click', () => {
      if (!isInCall) return;
      socket.emit('send-friend-request');
      addSystemChatMessage('💌 Friend request sent to partner!');
      el.btnAddFriend.style.borderColor = '#10b981';
      el.btnAddFriend.style.color = '#10b981';
      setTimeout(() => {
        el.btnAddFriend.style.borderColor = '';
        el.btnAddFriend.style.color = '';
      }, 2500);
    });

    // Report partner
    el.btnReportPartner.addEventListener('click', () => {
      if (!isInCall) return;
      const reason = prompt('Please describe why you are reporting this user:');
      if (reason) {
        socket.emit('report-partner', { reason });
        hangUpCall();
      }
    });

    // Auto-call switch
    el.chkAutoCall.addEventListener('change', (e) => {
      isAutoCallEnabled = e.target.checked;
    });

    // Chat text submit
    el.chatInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      sendTextMessage();
    });

    // Quick emoji chips
    el.emojiChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const emoji = chip.getAttribute('data-emoji');
        el.chatTextInput.value += emoji;
        el.chatTextInput.focus();
      });
    });

    // Photo file input
    el.imageFileInput.addEventListener('change', handleImageSelect);
    el.btnRemovePhoto.addEventListener('click', clearPendingPhoto);
    el.btnSendPhoto.addEventListener('click', sendPhotoMessage);

    // Voice clip recording
    el.btnStartVoiceRecord.addEventListener('click', startVoiceRecording);
    el.btnCancelRecording.addEventListener('click', cancelVoiceRecording);
    el.btnSendRecording.addEventListener('click', finishAndSendVoiceRecording);

    // Mobile Chat Toggle & Back Buttons
    if (el.btnToggleMobileChat) {
      el.btnToggleMobileChat.addEventListener('click', () => {
        el.rightPanel.classList.toggle('open');
        el.chatUnreadDot.classList.add('hide');
      });
    }

    if (el.btnCloseChatMobile) {
      el.btnCloseChatMobile.addEventListener('click', () => {
        el.rightPanel.classList.remove('open');
      });
    }

    // Chat Back Button (Returns smoothly from Friend DM or closes side chat)
    if (el.btnChatBack) {
      el.btnChatBack.addEventListener('click', () => {
        if (chatMode === 'friend') {
          if (isInCall && callPartner) {
            setChatPartner(callPartner);
          } else {
            chatMode = 'lobby';
            activeFriendNickname = null;
            el.chatTargetTitle.textContent = 'Room Diary';
            el.chatCountryPill.textContent = '🕊️ 10-User Lounge';
            el.chatHeaderAvatar.textContent = '💬';
          }
        }
        el.rightPanel.classList.remove('open');
      });
    }

    // Close Guest Modal Button
    if (el.btnCloseGuestModal) {
      el.btnCloseGuestModal.addEventListener('click', () => {
        closeGuestModal();
      });
    }

    // AirTALK Topic Pills Click Handler
    if (el.topicPills) {
      el.topicPills.forEach(pill => {
        pill.addEventListener('click', () => {
          const msg = pill.getAttribute('data-msg') || pill.textContent.trim();
          el.chatTextInput.value = msg;
          el.rightPanel.classList.add('open');
          el.chatTextInput.focus();
          playSoundFX('click');
        });
      });
    }

    // Lobby Chat Switch
    el.btnOpenLobbyChat.addEventListener('click', () => {
      el.chatTargetTitle.textContent = 'Room Diary (Public)';
      el.chatCountryPill.textContent = '🕊️ 10-User Lounge';
      el.chatHeaderAvatar.textContent = '💬';
      if (window.innerWidth <= 1024) el.rightPanel.classList.add('open');
    });

    // Guidelines
    el.btnHelpGuide.addEventListener('click', () => {
      alert("🕊️ The Pigeon Diary Guidelines:\n\n1. Strictly 10 concurrent online pigeons.\n2. Location is automatically detected from your IP address.\n3. Always greet strangers politely.\n4. Toxic/vulgar speech results in an immediate ban.");
    });

    // Lightbox close & Modal Backdrop Dismissals
    el.btnCloseLightbox.addEventListener('click', () => {
      el.lightboxModal.classList.add('hide');
    });
    el.lightboxModal.addEventListener('click', (e) => {
      if (e.target === el.lightboxModal) el.lightboxModal.classList.add('hide');
    });
    if (el.onlineUsersModal) {
      el.onlineUsersModal.addEventListener('click', (e) => {
        if (e.target === el.onlineUsersModal) el.onlineUsersModal.classList.add('hide');
      });
    }
    if (el.inCallGamesModal) {
      el.inCallGamesModal.addEventListener('click', (e) => {
        if (e.target === el.inCallGamesModal) el.inCallGamesModal.classList.add('hide');
      });
    }
    if (el.guestModalBackdrop) {
      el.guestModalBackdrop.addEventListener('click', (e) => {
        if (e.target === el.guestModalBackdrop) el.guestModalBackdrop.classList.add('hide');
      });
    }

    // Friend Toast responses
    let pendingFriendFromId = null;
    function showFriendToast(data) {
      pendingFriendFromId = data.fromId;
      el.toastAvatar.textContent = data.avatar || '🕊️';
      el.toastNickname.textContent = data.nickname;
      el.toastCountry.textContent = `${data.countryFlag} ${data.country}`;
      el.friendRequestToast.classList.remove('hide');
    }

    el.btnAcceptFriend.addEventListener('click', () => {
      if (pendingFriendFromId) {
        socket.emit('respond-friend-request', { toId: pendingFriendFromId, accepted: true });
        addFriendToList({
          nickname: el.toastNickname.textContent,
          country: el.toastCountry.textContent,
          countryFlag: '🕊️',
          avatar: el.toastAvatar.textContent
        });
      }
      el.friendRequestToast.classList.add('hide');
    });

    el.btnDeclineFriend.addEventListener('click', () => {
      if (pendingFriendFromId) {
        socket.emit('respond-friend-request', { toId: pendingFriendFromId, accepted: false });
      }
      el.friendRequestToast.classList.add('hide');
    });
  }

  function selectAvatarOption(val) {
    el.avatarOptions.forEach(opt => {
      const radio = opt.querySelector('input');
      if (radio && radio.value === val) {
        opt.classList.add('active');
        radio.checked = true;
      } else {
        opt.classList.remove('active');
      }
    });
  }

  function selectGenderPill(val) {
    el.genderRadioPills.forEach(pill => {
      const radio = pill.querySelector('input');
      if (radio && radio.value === val) {
        pill.classList.add('active');
        radio.checked = true;
      } else {
        pill.classList.remove('active');
      }
    });
  }

  function syncFilterPreferences() {
    if (!myProfile || !socket) return;
    const prefGenderRadio = document.querySelector('input[name="prefGender"]:checked');
    const prefs = {
      preferredGender: prefGenderRadio ? prefGenderRadio.value : 'both',
      preferredCountries: el.prefCountrySelect.value ? [el.prefCountrySelect.value] : [],
      excludedCountries: el.excludeCountrySelect.value ? [el.excludeCountrySelect.value] : [],
      interests: getSelectedInterests()
    };
    socket.emit('update-preferences', prefs);
  }

  // --- UI STATE MANAGEMENT ---
  function setUIState(state) {
    if (state === 'idle') {
      el.idleControls.classList.remove('hide');
      el.searchingControls.classList.add('hide');
      el.inCallControls.classList.add('hide');
      el.partnerCard.classList.add('hide');
      el.radarContainer.classList.remove('pulsing');
      el.centerHubCircle.classList.remove('in-call');
      el.hubEmoticon.textContent = '🐦';
      el.hubStatusText.textContent = 'Tap Call to find a stranger';
      el.audioVisualizerCanvas.classList.add('hide');
      el.callTimerPill.classList.add('hide');
      stopAudioVisualizer();
    } else if (state === 'searching') {
      el.idleControls.classList.add('hide');
      el.searchingControls.classList.remove('hide');
      el.inCallControls.classList.add('hide');
      el.partnerCard.classList.add('hide');
      el.radarContainer.classList.add('pulsing');
      el.centerHubCircle.classList.remove('in-call');
      el.hubEmoticon.textContent = '🕊️';
      el.hubStatusText.textContent = 'Listening for incoming pigeons...';
      el.audioVisualizerCanvas.classList.add('hide');
      playSoundFX('call_ring');
    } else if (state === 'in_call') {
      el.idleControls.classList.add('hide');
      el.searchingControls.classList.add('hide');
      el.inCallControls.classList.remove('hide');
      el.partnerCard.classList.remove('hide');
      el.radarContainer.classList.remove('pulsing');
      el.centerHubCircle.classList.add('in-call');
      el.hubEmoticon.textContent = '🎙️';
      el.hubStatusText.textContent = 'Connected in Voice Call';
      el.audioVisualizerCanvas.classList.remove('hide');
      el.callTimerPill.classList.remove('hide');
      startAudioVisualizer();
    }
  }

  function updatePartnerUI(partner) {
    el.partnerAvatar.textContent = partner.avatar || '🕊️';
    el.partnerNickname.textContent = partner.nickname || 'Stranger';
    el.partnerGenderTag.textContent = partner.gender === 'female' ? '♀️' : (partner.gender === 'male' ? '♂️' : '🌈');
    el.partnerCountryFlag.textContent = partner.countryFlag || '🌍';
    el.partnerCountryName.textContent = partner.country || 'Global';
    el.partnerSpeakingStatus.textContent = 'Listening 🎧';

    // Interests
    el.partnerInterests.innerHTML = '';
    if (partner.interests && partner.interests.length > 0) {
      partner.interests.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'mini-tag';
        span.textContent = tag;
        el.partnerInterests.appendChild(span);
      });
    } else {
      el.partnerInterests.innerHTML = '<span class="mini-tag">🕊️ Friendly Chat</span>';
    }
  }

  // --- CALL SEARCH & WEBRTC ENGINE ---
  async function startStrangerSearch() {
    if (!myProfile) {
      openGuestModal();
      return;
    }

    try {
      if (!myLocalStream) {
        myLocalStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setupLocalAudioAnalysis(myLocalStream);
      }
    } catch (err) {
      console.warn('Microphone permission not granted:', err);
    }

    socket.emit('start-call-search');
  }

  async function initWebRTCCall(isInitiator, partnerId) {
    try {
      peerConnection = new RTCPeerConnection(rtcConfig);

      if (myLocalStream) {
        myLocalStream.getTracks().forEach(track => {
          peerConnection.addTrack(track, myLocalStream);
        });
      }

      peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          el.remoteAudioStream.srcObject = event.streams[0];
          setupRemoteAudioAnalysis(event.streams[0]);
        }
      };

      peerConnection.onicecandidate = (event) => {
        if (event.candidate && partnerId) {
          socket.emit('webrtc-ice-candidate', {
            targetId: partnerId,
            candidate: event.candidate
          });
        }
      };

      if (isInitiator) {
        const offer = await peerConnection.createOffer({
          offerToReceiveAudio: true
        });
        await peerConnection.setLocalDescription(offer);
        socket.emit('webrtc-offer', {
          targetId: partnerId,
          offer
        });
      }
    } catch (err) {
      console.error('WebRTC Init Error:', err);
    }
  }

  async function handleWebRTCOffer(offer, senderId) {
    try {
      if (!peerConnection) {
        await initWebRTCCall(false, senderId);
      }
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket.emit('webrtc-answer', {
        targetId: senderId,
        answer
      });
    } catch (err) {
      console.error('WebRTC Offer Error:', err);
    }
  }

  async function handleWebRTCAnswer(answer) {
    try {
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      }
    } catch (err) {
      console.error('WebRTC Answer Error:', err);
    }
  }

  async function handleWebRTCIceCandidate(candidate) {
    try {
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (err) {
      console.error('WebRTC ICE error:', err);
    }
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (myLocalStream) {
      myLocalStream.getAudioTracks().forEach(track => {
        track.enabled = !isMuted;
      });
    }
    el.muteIcon.textContent = isMuted ? 'mic_off' : 'mic';
    el.muteLabel.textContent = isMuted ? 'Unmute' : 'Mute';
    el.btnToggleMute.style.color = isMuted ? '#ef4444' : '#e2e8f0';
  }

  function hangUpCall() {
    socket.emit('hang-up-call');
    handleCallEnd('you_hung_up');
  }

  // ==========================================================================
  // DEDICATED IN-CALL WHISPERS (SPEAK & TYPE MODE)
  // ==========================================================================
  let currentCallWhispers = [];
  let floatingBubbleTimer = null;

  function openInCallWhisperWindow() {
    if (!el.inCallWhisperWindow) return;
    el.inCallWhisperWindow.classList.remove('hide');
    el.inCallWhisperWindow.classList.remove('minimized');
    if (el.whisperInput) el.whisperInput.focus();
  }

  function showFloatingWhisper(senderName, text) {
    if (!el.floatingPartnerBubble) return;
    el.floatingSenderName.textContent = senderName || 'Stranger';
    el.floatingBubbleText.textContent = text;
    el.floatingPartnerBubble.classList.remove('hide');

    clearTimeout(floatingBubbleTimer);
    floatingBubbleTimer = setTimeout(() => {
      el.floatingPartnerBubble.classList.add('hide');
    }, 4500);
  }

  function sendInCallWhisper(text) {
    if (!text || !isInCall) return;
    playSoundFX('message');

    const whisperObj = {
      id: `wh_${Date.now()}`,
      senderName: myProfile ? myProfile.nickname : 'You',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    if (isSimulatedBotCall) {
      // Direct local rendering for bot call
      renderWhisperMsg(whisperObj, true);
      simulateBotWhisperReply(text);
    } else {
      socket.emit('send-incall-whisper', { text });
      renderWhisperMsg(whisperObj, true);
    }
  }

  function renderWhisperMsg(msg, isMine) {
    if (!el.whisperMessagesStream) return;
    currentCallWhispers.push({ ...msg, isMine });

    const item = document.createElement('div');
    item.className = `whisper-msg-item ${isMine ? 'mine' : 'partner'}`;
    item.innerHTML = `
      <span class="whisper-msg-sender">${isMine ? 'You (Muted/Typing)' : msg.senderName || 'Partner'}</span>
      <span>${msg.text}</span>
      <span class="whisper-msg-time">${msg.timestamp || ''}</span>
    `;
    el.whisperMessagesStream.appendChild(item);
    el.whisperMessagesStream.scrollTop = el.whisperMessagesStream.scrollHeight;
  }

  function simulateBotWhisperReply(userText) {
    setTimeout(() => {
      if (!isInCall) return;
      const botReplies = [
        "I heard that! Keep typing, I love listening to you! 🎙️",
        "Haha that is hilarious! Tell me more about it! 😂",
        "100% agree with you! What are your plans for tonight? ✨",
        "Got your message crystal clear! You can unmute anytime too. 🎧",
        "Aww that's so sweet! It's so nice chatting with you on Pigeon Diary! 💖"
      ];
      const botReply = botReplies[Math.floor(Math.random() * botReplies.length)];
      const botWhisper = {
        id: `wh_bot_${Date.now()}`,
        senderName: callPartner ? callPartner.nickname : 'Aria_Sky',
        text: botReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      playSoundFX('message');
      renderWhisperMsg(botWhisper, false);
      showFloatingWhisper(botWhisper.senderName, botReply);
    }, 1400);
  }

  function handleCallEnd(reason) {
    playSoundFX('hangup');
    stopCallTimer();
    isInCall = false;
    isSimulatedBotCall = false;
    currentCallId = null;

    // Reset In-Call Whisper UI
    if (el.inCallWhisperWindow) el.inCallWhisperWindow.classList.add('hide');
    if (el.floatingPartnerBubble) el.floatingPartnerBubble.classList.add('hide');
    if (el.whisperMessagesStream) {
      el.whisperMessagesStream.innerHTML = `
        <div class="whisper-system-tip">
          <span class="tip-icon">💡</span>
          <p><strong>Speak & Type Mode:</strong> If you are muted or prefer typing, send live whispers here while your partner speaks on mic!</p>
        </div>
      `;
    }
    currentCallWhispers = [];

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    el.remoteAudioStream.srcObject = null;

    let notice = 'Call ended.';
    if (reason === 'partner_hung_up') notice = `${callPartner ? callPartner.nickname : 'Partner'} hung up the call.`;
    if (reason === 'partner_disconnected') notice = 'Partner disconnected.';
    addSystemChatMessage(`🛑 ${notice}`);

    callPartner = null;
    setUIState('idle');

    if (isAutoCallEnabled) {
      setTimeout(() => {
        if (!isInCall && !isSearching) {
          startStrangerSearch();
        }
      }, 1500);
    }
  }

  function startCallTimer() {
    callSeconds = 0;
    el.callDuration.textContent = '00:00';
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      callSeconds++;
      const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
      const secs = String(callSeconds % 60).padStart(2, '0');
      el.callDuration.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  function stopCallTimer() {
    clearInterval(callTimerInterval);
  }

  // --- AUDIO ANALYSIS & LIVE CANVAS VISUALIZER ---
  function setupLocalAudioAnalysis(stream) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      setInterval(() => {
        if (!isInCall || isMuted || !analyser) return;
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) sum += buffer[i];
        const avg = sum / buffer.length;
        const isSpeaking = avg > 20;
        socket.emit('audio-speaking', { isSpeaking, volume: Math.round(avg) });
      }, 300);
    } catch (e) {
      console.warn('Audio analysis setup error:', e);
    }
  }

  function setupRemoteAudioAnalysis(stream) {
    try {
      const ctx = getAudioCtx();
      if (!ctx) return;
      const src = ctx.createMediaStreamSource(stream);
      const remoteAnalyser = ctx.createAnalyser();
      remoteAnalyser.fftSize = 64;
      src.connect(remoteAnalyser);
    } catch (e) {
      console.warn('Remote audio analysis error:', e);
    }
  }

  function startAudioVisualizer() {
    const canvas = el.audioVisualizerCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    function render() {
      if (!isInCall) return;
      visualizerAnimFrame = requestAnimationFrame(render);
      ctx.clearRect(0, 0, width, height);

      let dataArray = new Uint8Array(24);
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        for (let i = 0; i < dataArray.length; i++) {
          dataArray[i] = Math.sin(Date.now() / 200 + i) * 30 + 35;
        }
      }

      const barWidth = (width / 24) - 2;
      for (let i = 0; i < 24; i++) {
        const val = dataArray[i] || 10;
        const barHeight = Math.max(4, (val / 255) * height);
        const x = i * (barWidth + 2);
        const y = height - barHeight;

        const grad = ctx.createLinearGradient(0, height, 0, 0);
        grad.addColorStop(0, '#00f2fe');
        grad.addColorStop(1, '#8b5cf6');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
        ctx.fill();
      }
    }
    render();
  }

  function stopAudioVisualizer() {
    if (visualizerAnimFrame) {
      cancelAnimationFrame(visualizerAnimFrame);
      visualizerAnimFrame = null;
    }
  }

  // --- REAL-TIME CHAT & MESSAGING ---
  function setChatPartner(partner) {
    el.chatTargetTitle.textContent = partner.nickname;
    el.chatCountryPill.textContent = `${partner.countryFlag} ${partner.country} (📍 IP Verified)`;
    el.chatHeaderAvatar.textContent = partner.avatar || '🕊️';
  }

  function sendTextMessage() {
    const text = el.chatTextInput.value.trim();
    if (!text) return;

    if (chatMode === 'friend' && activeFriendNickname) {
      socket.emit('send-friend-direct-message', {
        friendNickname: activeFriendNickname,
        type: 'text',
        content: text
      });
      el.chatTextInput.value = '';
      return;
    }

    socket.emit('send-chat-message', { content: text });
    el.chatTextInput.value = '';

    if (isSimulatedBotCall && callPartner) {
      simulateBotReply(text, 'text');
    }
  }

  // Voice Note Recording
  async function startVoiceRecording() {
    try {
      getAudioCtx();
      const stream = myLocalStream || await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedAudioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedAudioChunks.push(e.data);
      };

      mediaRecorder.start();
      recordingSeconds = 0;
      el.recordingTimer.textContent = '00:00';
      el.voiceRecorderOverlay.classList.remove('hide');

      clearInterval(recordTimerInterval);
      recordTimerInterval = setInterval(() => {
        recordingSeconds++;
        const mins = String(Math.floor(recordingSeconds / 60)).padStart(2, '0');
        const secs = String(recordingSeconds % 60).padStart(2, '0');
        el.recordingTimer.textContent = `${mins}:${secs}`;
      }, 1000);
    } catch (e) {
      alert('Could not access microphone to record voice clip.');
    }
  }

  function cancelVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    clearInterval(recordTimerInterval);
    el.voiceRecorderOverlay.classList.add('hide');
    recordedAudioChunks = [];
  }

  function finishAndSendVoiceRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return;

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(recordedAudioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result;

        if (chatMode === 'friend' && activeFriendNickname) {
          socket.emit('send-friend-direct-message', {
            friendNickname: activeFriendNickname,
            type: 'voice_clip',
            audioData: base64Audio,
            duration: recordingSeconds
          });
          return;
        }

        socket.emit('send-voice-clip', {
          audioData: base64Audio,
          duration: recordingSeconds
        });
        if (isSimulatedBotCall) {
          simulateBotReply('', 'voice_clip');
        }
      };
      reader.readAsDataURL(audioBlob);
    };

    mediaRecorder.stop();
    clearInterval(recordTimerInterval);
    el.voiceRecorderOverlay.classList.add('hide');
  }

  // Photo Attachment
  function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      pendingPhotoData = event.target.result;
      el.photoPreviewImg.src = pendingPhotoData;
      el.photoPreviewBar.classList.remove('hide');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function clearPendingPhoto() {
    pendingPhotoData = null;
    el.photoPreviewImg.src = '';
    el.photoCaptionInput.value = '';
    el.photoPreviewBar.classList.add('hide');
  }

  function sendPhotoMessage() {
    if (!pendingPhotoData) return;
    const caption = el.photoCaptionInput.value.trim();

    if (chatMode === 'friend' && activeFriendNickname) {
      socket.emit('send-friend-direct-message', {
        friendNickname: activeFriendNickname,
        type: 'photo',
        imageData: pendingPhotoData,
        caption
      });
      clearPendingPhoto();
      return;
    }

    socket.emit('send-photo', {
      imageData: pendingPhotoData,
      caption
    });

    if (isSimulatedBotCall) {
      simulateBotReply('', 'photo');
    }

    clearPendingPhoto();
  }

  // --- CARRIER PIGEON LETTER ANIMATION (Khat Leke Jane Wala Pigeon) ---
  function spawnCarrierPigeonAnimation(isMine) {
    if (!el.chatMessagesContainer) return;
    playSoundFX('pigeon_flutter');

    const bird = document.createElement('div');
    bird.className = `carrier-pigeon-flight ${isMine ? 'flying-out' : 'flying-in'}`;
    bird.innerHTML = `
      <span class="pigeon-wing-flutter">🕊️</span>
      <span class="pigeon-khat-envelope">💌</span>
    `;

    // Add trailing stardust sparkles
    for (let i = 0; i < 3; i++) {
      const sparkle = document.createElement('span');
      sparkle.className = 'pigeon-stardust-trail';
      sparkle.textContent = i === 2 ? '🪶' : '✨';
      sparkle.style.left = `${(i * 12) - 10}px`;
      sparkle.style.top = `${(i * 8) + 10}px`;
      bird.appendChild(sparkle);
    }

    el.chatMessagesContainer.appendChild(bird);

    // Auto cleanup after flight finishes
    setTimeout(() => {
      if (bird.parentNode) {
        bird.parentNode.removeChild(bird);
      }
    }, 1500);
  }

  // Render Chat Message Bubble
  function renderMessageBubble(msg, isMine) {
    // Trigger the carrier pigeon carrying letter animation!
    spawnCarrierPigeonAnimation(isMine);

    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isMine ? 'mine' : 'partner'}`;

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    meta.innerHTML = `
      <span class="bubble-sender">${msg.senderCountryFlag || '🕊️'} ${isMine ? 'You' : msg.senderName}</span>
      <span class="bubble-time">${msg.timestamp || 'now'}</span>
    `;
    bubble.appendChild(meta);

    const content = document.createElement('div');
    content.className = 'bubble-content';

    if (msg.type === 'text') {
      content.textContent = msg.content;
    } else if (msg.type === 'voice_clip') {
      const voicePlayer = document.createElement('div');
      voicePlayer.className = 'voice-clip-card';

      const playBtn = document.createElement('button');
      playBtn.className = 'btn-play-voice';
      playBtn.innerHTML = '<span class="material-icons-round">play_arrow</span>';

      const waveform = document.createElement('div');
      waveform.className = 'voice-waveform-track';
      for (let i = 0; i < 16; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.height = `${Math.floor(Math.random() * 14 + 6)}px`;
        waveform.appendChild(bar);
      }

      const durText = document.createElement('span');
      durText.className = 'voice-duration-text';
      durText.textContent = `0:${String(msg.duration || 3).padStart(2, '0')}`;

      const audioEl = new Audio(msg.audioData);
      let isPlaying = false;

      playBtn.addEventListener('click', () => {
        getAudioCtx();
        if (isPlaying) {
          audioEl.pause();
          playBtn.innerHTML = '<span class="material-icons-round">play_arrow</span>';
          waveform.querySelectorAll('.wave-bar').forEach(b => b.classList.remove('active'));
          isPlaying = false;
        } else {
          audioEl.play();
          playBtn.innerHTML = '<span class="material-icons-round">pause</span>';
          isPlaying = true;
          const bars = waveform.querySelectorAll('.wave-bar');
          let barIdx = 0;
          const anim = setInterval(() => {
            if (!isPlaying) { clearInterval(anim); return; }
            bars.forEach(b => b.classList.remove('active'));
            if (bars[barIdx]) bars[barIdx].classList.add('active');
            barIdx = (barIdx + 1) % bars.length;
          }, 150);

          audioEl.onended = () => {
            isPlaying = false;
            playBtn.innerHTML = '<span class="material-icons-round">play_arrow</span>';
            bars.forEach(b => b.classList.remove('active'));
            clearInterval(anim);
          };
        }
      });

      voicePlayer.appendChild(playBtn);
      voicePlayer.appendChild(waveform);
      voicePlayer.appendChild(durText);
      content.appendChild(voicePlayer);

    } else if (msg.type === 'photo') {
      const photoWrap = document.createElement('div');
      photoWrap.className = 'photo-msg-wrapper';

      const img = document.createElement('img');
      img.className = 'chat-photo-img';
      img.src = msg.imageData;
      img.alt = 'Shared Photo';

      img.addEventListener('click', () => {
        el.lightboxImg.src = msg.imageData;
        el.lightboxCaption.textContent = msg.caption || '';
        el.lightboxModal.classList.remove('hide');
      });

      photoWrap.appendChild(img);

      if (msg.caption) {
        const cap = document.createElement('p');
        cap.className = 'photo-caption-text';
        cap.textContent = msg.caption;
        photoWrap.appendChild(cap);
      }

      content.appendChild(photoWrap);
    }

    bubble.appendChild(content);

    // Mini Pigeon Khat Status Tag
    const statusTag = document.createElement('span');
    statusTag.className = 'pigeon-delivery-status';
    if (isMine) {
      statusTag.innerHTML = '🕊️ Carrying khat...';
      setTimeout(() => {
        statusTag.innerHTML = '💌 Khat Delivered ✨';
      }, 900);
    } else {
      statusTag.innerHTML = '💌 Khat Received 🕊️';
    }
    bubble.appendChild(statusTag);

    el.chatMessagesContainer.appendChild(bubble);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;
  }

  function addSystemChatMessage(text) {
    const notice = document.createElement('div');
    notice.className = 'chat-system-notice';
    notice.innerHTML = `<span class="notice-icon">🕊️</span><p>${text}</p>`;
    el.chatMessagesContainer.appendChild(notice);
    el.chatMessagesContainer.scrollTop = el.chatMessagesContainer.scrollHeight;
  }

  // --- BOT STRANGER COMPANION SIMULATOR ---
  function startBotSimulationLoop() {
    setTimeout(() => {
      if (isInCall && isSimulatedBotCall) {
        el.partnerPulseRing.classList.add('speaking');
        el.partnerSpeakingStatus.textContent = 'Speaking 🎙️';
        setTimeout(() => {
          el.partnerPulseRing.classList.remove('speaking');
          el.partnerSpeakingStatus.textContent = 'Listening 🎧';
          simulateBotReply('Hey there! Glad to connect on The Pigeon Diary 🕊️ I see your IP is verified. How are things in your city?', 'text');
        }, 1500);
      }
    }, 1200);
  }

  function simulateBotReply(userMessage, replyType) {
    setTimeout(() => {
      if (!isInCall || !isSimulatedBotCall || !callPartner) return;

      const botReplies = [
        "That's wonderful! I love how Pigeon Diary auto-detects locations so we know who we're talking to.",
        "Nice to meet you! Voice notes and crystal-clear calls make this so much better than video chats.",
        "Haha totally agree! How is the weather over there today?",
        "Awesome! Music, traveling, and good conversations are the best.",
        "Your voice clip sounded great! The 10-user room keeps everything fast and high quality."
      ];

      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (replyType === 'photo') {
        renderMessageBubble({
          senderId: 'bot',
          senderName: callPartner.nickname,
          senderCountry: callPartner.country,
          senderCountryFlag: callPartner.countryFlag,
          type: 'text',
          content: "✨ Wow, that photo looks great! Thanks for sharing it in our diary chat.",
          timestamp
        }, false);
      } else if (replyType === 'voice_clip') {
        renderMessageBubble({
          senderId: 'bot',
          senderName: callPartner.nickname,
          senderCountry: callPartner.country,
          senderCountryFlag: callPartner.countryFlag,
          type: 'text',
          content: "🎙️ Listened to your voice clip! Sounds crystal clear! Have you tried the Pigeon auto-call toggle?",
          timestamp
        }, false);
      } else {
        const text = botReplies[Math.floor(Math.random() * botReplies.length)];
        renderMessageBubble({
          senderId: 'bot',
          senderName: callPartner.nickname,
          senderCountry: callPartner.country,
          senderCountryFlag: callPartner.countryFlag,
          type: 'text',
          content: text,
          timestamp
        }, false);
      }

      playSoundFX('message');
    }, 1800);
  }

  // --- FRIENDS & CALL HISTORY STORAGE ---
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

  function saveMessageToFriendHistory(friendNickname, msg, isMine) {
    try {
      const key = `pigeon_dm_${friendNickname}`;
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.push({ ...msg, isMine });
      if (history.length > 100) history.shift();
      localStorage.setItem(key, JSON.stringify(history));
    } catch (e) {}
  }

  function openFriendChat(friend) {
    chatMode = 'friend';
    activeFriendNickname = friend.nickname;

    el.chatTargetTitle.textContent = friend.nickname;
    el.chatCountryPill.textContent = `💖 Pigeon Friend • ${friend.countryFlag || '🌍'} ${friend.country}`;
    el.chatHeaderAvatar.textContent = friend.avatar || '🕊️';

    // Open right panel
    el.rightPanel.classList.add('open');
    el.chatMessagesContainer.innerHTML = `
      <div class="chat-system-notice">
        <span class="notice-icon">💖</span>
        <p>You are chatting with your friend <strong>${friend.nickname}</strong>. Messages are saved permanently so they will never be lost!</p>
      </div>
    `;

    // Load past chat history from localStorage
    try {
      const key = `pigeon_dm_${friend.nickname}`;
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.forEach(msg => {
        renderMessageBubble(msg, !!msg.isMine);
      });
    } catch (e) {}

    el.chatTextInput.focus();
  }

  function removeFriend(nickname) {
    if (confirm(`Remove ${nickname} from your Pigeon Friends?`)) {
      let list = getFriendsList();
      list = list.filter(f => f.nickname !== nickname);
      localStorage.setItem('pigeon_friends', JSON.stringify(list));
      renderSavedFriends();
      if (chatMode === 'friend' && activeFriendNickname === nickname) {
        chatMode = 'lobby';
        activeFriendNickname = null;
        el.chatTargetTitle.textContent = 'Room Diary';
        el.chatCountryPill.textContent = '🕊️ 10-User Lounge';
      }
    }
  }

  function getPresenceMap() {
    try {
      return JSON.parse(localStorage.getItem('pigeon_presence_map') || '{}');
    } catch (e) {
      return {};
    }
  }

  function updateFriendPresence(nickname, isOnline, lastSeen) {
    const map = getPresenceMap();
    map[nickname] = {
      isOnline: !!isOnline,
      lastSeen: lastSeen || Date.now()
    };
    localStorage.setItem('pigeon_presence_map', JSON.stringify(map));
    renderSavedFriends();

    // If currently chatting with this friend, update the chat header live
    if (chatMode === 'friend' && activeFriendNickname === nickname) {
      const friend = getFriendsList().find(f => f.nickname === nickname);
      if (friend) {
        const lastSeenText = formatLastSeen(lastSeen, isOnline);
        el.chatCountryPill.textContent = `💖 ${friend.countryFlag || '🌍'} ${friend.country} • ${lastSeenText}`;
      }
    }
  }

  function formatLastSeen(timestamp, isOnline) {
    if (isOnline) return 'Online now 🟢';
    if (!timestamp) return 'Offline';

    const now = Date.now();
    const diffMs = now - Number(timestamp);
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins}m ago`;
    if (diffHours < 24) {
      const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Last seen today at ${timeStr}`;
    }

    const dateStr = new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `Last seen ${dateStr} at ${timeStr}`;
  }

  function openFriendChat(friend) {
    chatMode = 'friend';
    activeFriendNickname = friend.nickname;

    const isOnline = onlineUsersGlobalList.some(u => u.nickname === friend.nickname);
    const presenceMap = getPresenceMap();
    const presence = presenceMap[friend.nickname] || { isOnline, lastSeen: friend.lastSeen || Date.now() };
    const lastSeenFormatted = formatLastSeen(presence.lastSeen, isOnline);

    el.chatTargetTitle.textContent = friend.nickname;
    el.chatCountryPill.textContent = `💖 ${friend.countryFlag || '🌍'} ${friend.country} • ${lastSeenFormatted}`;
    el.chatHeaderAvatar.textContent = friend.avatar || '🕊️';

    // Open right panel
    el.rightPanel.classList.add('open');
    el.chatMessagesContainer.innerHTML = `
      <div class="chat-system-notice">
        <span class="notice-icon">💖</span>
        <p>You are chatting with your friend <strong>${friend.nickname}</strong>. Messages are saved permanently so they will never be lost!</p>
      </div>
    `;

    // Load past chat history from localStorage
    try {
      const key = `pigeon_dm_${friend.nickname}`;
      const history = JSON.parse(localStorage.getItem(key) || '[]');
      history.forEach(msg => {
        renderMessageBubble(msg, !!msg.isMine);
      });
    } catch (e) {}

    el.chatTextInput.focus();
  }

  function removeFriend(nickname) {
    if (confirm(`Remove ${nickname} from your Pigeon Friends?`)) {
      let list = getFriendsList();
      list = list.filter(f => f.nickname !== nickname);
      localStorage.setItem('pigeon_friends', JSON.stringify(list));
      renderSavedFriends();
      if (chatMode === 'friend' && activeFriendNickname === nickname) {
        chatMode = 'lobby';
        activeFriendNickname = null;
        el.chatTargetTitle.textContent = 'Room Diary';
        el.chatCountryPill.textContent = '🕊️ 10-User Lounge';
      }
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

      const presenceMap = getPresenceMap();

      list.forEach(f => {
        const isOnline = onlineUsersGlobalList.some(u => u.nickname === f.nickname);
        const presence = presenceMap[f.nickname] || { isOnline, lastSeen: f.lastSeen || Date.now() };
        const lastSeenLabel = formatLastSeen(presence.lastSeen, isOnline);

        const div = document.createElement('div');
        div.className = 'friend-item';
        div.innerHTML = `
          <div class="friend-top-row">
            <div class="friend-info">
              <span class="friend-avatar">${f.avatar}</span>
              <div>
                <div class="friend-name">${f.nickname}</div>
                <div class="friend-country">${f.countryFlag} ${f.country}</div>
                <div class="friend-lastseen ${isOnline ? 'online' : 'offline'}">
                  ${isOnline ? '<span class="status-online-dot"></span>' : '🕒'} ${lastSeenLabel}
                </div>
              </div>
            </div>
            <span class="${isOnline ? 'status-online-dot' : 'status-offline-dot'}" title="${isOnline ? 'Online now' : 'Offline'}"></span>
          </div>
          <div class="friend-actions-row">
            <button class="btn-friend-chat" data-nick="${f.nickname}">
              <span class="material-icons-round" style="font-size: 14px;">chat</span> Chat
            </button>
            <button class="btn-friend-call" data-nick="${f.nickname}">
              <span class="material-icons-round" style="font-size: 14px;">call</span> Call
            </button>
            <button class="btn-friend-remove" data-nick="${f.nickname}" title="Remove Friend">
              <span class="material-icons-round" style="font-size: 16px;">delete_outline</span>
            </button>
          </div>
        `;

        // Direct Chat Click
        div.querySelector('.btn-friend-chat').addEventListener('click', () => {
          openFriendChat(f);
        });

        // Direct Call Click
        div.querySelector('.btn-friend-call').addEventListener('click', () => {
          getAudioCtx();
          if (!isOnline) {
            alert(`${f.nickname} is currently offline (${lastSeenLabel}). You can leave them a direct message!`);
            openFriendChat(f);
            return;
          }
          socket.emit('direct-call-friend', { friendNickname: f.nickname });
        });

        // Remove Friend Click
        div.querySelector('.btn-friend-remove').addEventListener('click', () => {
          removeFriend(f.nickname);
        });

        el.friendsList.appendChild(div);
      });
    }
  }

  function saveCallToHistory(partner) {
    try {
      const history = JSON.parse(localStorage.getItem('pigeon_call_history') || '[]');
      history.unshift({
        nickname: partner.nickname,
        country: partner.country,
        countryFlag: partner.countryFlag || '🌍',
        avatar: partner.avatar || '🕊️',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      });
      if (history.length > 20) history.pop();
      localStorage.setItem('pigeon_call_history', JSON.stringify(history));
      renderCallHistory();
    } catch (e) {}
  }

  function renderCallHistory() {
    try {
      const history = JSON.parse(localStorage.getItem('pigeon_call_history') || '[]');
      if (history.length === 0) {
        el.callHistoryList.innerHTML = `
          <div class="empty-state">
            <span class="empty-icon">📜</span>
            <p>Your call diary is empty.</p>
          </div>
        `;
      } else {
        el.callHistoryList.innerHTML = '';
        history.forEach(item => {
          const div = document.createElement('div');
          div.className = 'history-item';
          div.innerHTML = `
            <div class="friend-info">
              <span class="friend-avatar">${item.avatar}</span>
              <div>
                <div class="friend-name">${item.nickname}</div>
                <div class="friend-country">${item.countryFlag} ${item.country}</div>
              </div>
            </div>
            <span style="font-size: 11px; color: var(--text-muted);">${item.time}</span>
          `;
          el.callHistoryList.appendChild(div);
        });
      }
    } catch (e) {}
  }

  // --- ONLINE USERS MODAL ---
  function renderOnlineUsersModal(users) {
    if (!users || !el.modalUsersGrid) return;
    el.modalUsersGrid.innerHTML = '';

    if (users.length === 0) {
      el.modalUsersGrid.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 12px;">No pigeons online yet.</p>';
      return;
    }

    users.forEach(u => {
      const card = document.createElement('div');
      card.className = 'user-grid-card';

      let statusLabel = 'Idle';
      let statusClass = 'idle';
      if (u.status === 'in_call') {
        statusLabel = 'In Call 🎙️';
        statusClass = 'in_call';
      } else if (u.status === 'in_queue') {
        statusLabel = 'Searching...';
        statusClass = 'in_queue';
      }

      card.innerHTML = `
        <div class="user-grid-left">
          <span class="user-grid-avatar">${u.avatar || '🕊️'}</span>
          <div class="user-grid-details">
            <span class="user-grid-name">${u.countryFlag || '🌍'} ${u.nickname}</span>
            <span class="user-grid-sub">${u.country} • ${u.gender === 'female' ? '♀️' : (u.gender === 'male' ? '♂️' : '🌈')}</span>
          </div>
        </div>
        <span class="status-pill-small ${statusClass}">${statusLabel}</span>
      `;
      el.modalUsersGrid.appendChild(card);
    });
  }

  // Start
  window.addEventListener('DOMContentLoaded', initApp);

})();
