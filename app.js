/* ==========================================================================
   GOD'S WILL — chat app client
   voice calls (WebRTC + DSP noise chain) • text chat during call •
   20MB images (auto-compress) • voice notes • typing • reports • invites
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var pad2 = function (n) { return String(n).padStart(2, '0'); };
  var fmtTime = function (s) { return pad2(Math.floor(s / 60)) + ':' + pad2(Math.floor(s % 60)); };
  var fmtSize = function (b) { return b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; };
  var esc = function (t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------------- state ---------------- */
  var S = {
    socket: null,
    you: null,
    peer: null,
    room: null,
    settings: null,
    limits: { maxImageMB: 20, maxVoiceNoteMB: 20, maxVoiceNoteSec: 180 },
    callAllowed: true,
    inChat: false,
    searchTimer: null,
    searchStart: 0,
    autoNext: localStorage.getItem('gw_autoNext') !== '0',
    sound: localStorage.getItem('gw_sound') !== '0',
    call: {
      active: false, pc: null, initiator: false, startedAt: 0, timer: null,
      statsTimer: null, muted: false, noise: localStorage.getItem('gw_noise') !== '0',
      gain: Number(localStorage.getItem('gw_gain') || 100), vol: 1
    },
    audio: { ctx: null, raw: null, processed: null, gate: null, hp: null, userGain: null, analyser: null, gateTimer: null, meterOn: false, streamOk: false },
    rec: { mr: null, chunks: [], start: 0, timer: null, waves: [], stream: null, active: false },
    typingSent: 0, typingOff: null,
    pendingMsgs: {},
    ringTimer: null,
    tested: false
  };

  var els = {};

  /* ---------------- push notifications (Instagram-style) ---------------- */
  var SW_REG = null;
  var unread = 0;
  var blinkTimer = null;
  var baseTitle = document.title;

  function urlBase64ToUint8Array(b64) {
    var padding = '='.repeat((4 - (b64.length % 4)) % 4);
    var base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(base64);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast('This browser does not support push notifications 😕 (Chrome / Edge / Safari 16.4+ recommended)', 'warn', 6000);
      return;
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        updateNotifUI('denied');
        toast('Notification permission blocked — browser settings me allow karein', 'warn', 6000);
        return;
      }
      var key = S.settings && S.settings.push && S.settings.push.vapidPublicKey;
      if (!key) { updateNotifUI('on'); toast('Notifications on (server push unavailable)', '', 4000); return; }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key)
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid: S.socket ? S.socket.id : null, subscription: sub.toJSON() })
      });
      updateNotifUI('on');
      toast('🔔 Phone notifications ON — ab message/call background me bhi dikhega!');
      try { if (reg.showNotification) reg.showNotification("GOD'S WILL", { body: '🔔 Notifications enabled successfully!', icon: 'assets/icon-192.png', tag: 'gw-ok' }); } catch (_) {}
    } catch (e) {
      toast('Could not enable notifications: ' + (e.message || 'error'), 'bad');
      updateNotifUI('off');
    }
  }

  function updateNotifUI(state) {
    var box = els.notifBox; if (!box) return;
    var st = els.notifState; var btn = els.notifBtn;
    box.hidden = false;
    if (state === 'on') {
      st.textContent = 'ON ✓'; st.className = 'notif-state on';
      btn.textContent = '🔔 Notifications are on';
      btn.disabled = true;
    } else if (state === 'denied') {
      st.textContent = 'blocked'; st.className = 'notif-state off';
      btn.textContent = '🔕 Blocked in browser settings';
      btn.disabled = true;
    } else {
      st.textContent = 'off'; st.className = 'notif-state off';
      btn.textContent = '🔔 Turn on notifications';
      btn.disabled = false;
    }
  }

  function initNotifications() {
    if (!('serviceWorker' in navigator)) { els.notifBox.hidden = true; return; }
    navigator.serviceWorker.register('/sw.js').then(function (reg) {
      SW_REG = reg;
      if (!('PushManager' in window) || !('Notification' in window)) {
        els.notifBox.hidden = true; return;
      }
      if (Notification.permission === 'granted') {
        // already allowed — (re)subscribe silently (keys may have changed after redeploy)
        reg.pushManager.getSubscription().then(function (sub) {
          if (sub) {
            updateNotifUI('on');
            fetch('/api/push/subscribe', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sid: S.socket ? S.socket.id : null, subscription: sub.toJSON() })
            }).catch(function () {});
          } else {
            enableNotifications();
          }
        }).catch(function () { updateNotifUI('off'); });
      } else if (Notification.permission === 'denied') {
        updateNotifUI('denied');
      } else {
        updateNotifUI('off');
      }
    }).catch(function () { els.notifBox.hidden = true; });
  }

  function notifyHidden(kind) {
    if (!document.hidden) return;
    unread++;
    try { if (navigator.setAppBadge) navigator.setAppBadge(unread); } catch (_) {}
    if (!blinkTimer) {
      var flip = false;
      blinkTimer = setInterval(function () {
        flip = !flip;
        document.title = flip ? '💬 (' + unread + ') New message!' : baseTitle;
      }, 1100);
    }
  }
  function clearNotify() {
    unread = 0;
    try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (_) {}
    if (blinkTimer) { clearInterval(blinkTimer); blinkTimer = null; }
    document.title = baseTitle;
  }
  document.addEventListener('visibilitychange', function () {
    if (S.socket) S.socket.emit('visibility', { visible: !document.hidden });
    if (!document.hidden) clearNotify();
  });

  /* ---------------- toasts & sounds ---------------- */
  function toast(text, kind, ms) {
    var box = els.toasts;
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, (ms || 4600));
    setTimeout(function () { t.remove(); }, (ms || 4600) + 400);
  }
  window.gwToast = toast;

  var beepCtx = null;
  function beep(freq, dur, delay, vol) {
    try {
      if (!beepCtx) beepCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (beepCtx.state === 'suspended') beepCtx.resume();
      var o = beepCtx.createOscillator(), g = beepCtx.createGain();
      o.frequency.value = freq; o.type = 'sine';
      g.gain.value = 0;
      o.connect(g); g.connect(beepCtx.destination);
      var t0 = beepCtx.currentTime + (delay || 0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol || 0.12, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.15));
      o.start(t0); o.stop(t0 + (dur || 0.15) + 0.05);
    } catch (_) {}
  }
  function sndFound() { if (S.sound) { beep(520, .12); beep(780, .16, .13); } }
  function sndMsg() { if (S.sound) beep(660, .09); }
  function ringLoop() {
    if (S.ringTimer) return;
    var n = 0;
    S.ringTimer = setInterval(function () {
      if (n++ > 40) { stopRing(); return; }
      if (S.sound) { beep(620, .35, 0, 0.1); beep(620, .35, .6, 0.1); }
    }, 1600);
  }
  function stopRing() { if (S.ringTimer) { clearInterval(S.ringTimer); S.ringTimer = null; } }

  /* ---------------- theme ---------------- */
  function applyTheme(t) {
    if (!t) return;
    var r = document.documentElement;
    if (t.primary) r.style.setProperty('--primary', t.primary);
    if (t.primary2) r.style.setProperty('--primary-2', t.primary2);
    if (t.accent) r.style.setProperty('--accent', t.accent);
    if (t.radius != null) r.style.setProperty('--radius', t.radius + 'px');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.primary) meta.setAttribute('content', t.primary);
    if (t.customCss) {
      var tag = document.getElementById('gwCustomCss') || document.createElement('style');
      tag.id = 'gwCustomCss'; tag.textContent = t.customCss;
      document.head.appendChild(tag);
    }
  }
  var savedTheme = localStorage.getItem('gw_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  /* ---------------- panels ---------------- */
  function show(panel) {
    ['setupPanel', 'searchPanel', 'chatPanel'].forEach(function (id) { els[id].hidden = (id !== panel); });
    els.rail.hidden = false;
  }

  function setConn(text, live) {
    els.connState.innerHTML = '<i class="dot' + (live ? ' live' : '') + '"></i> ' + esc(text);
  }

  /* ---------------- settings / presence ---------------- */
  function applySettings(s) {
    S.settings = s;
    if (s && s.site && s.site.name) { document.title = s.site.name + ' — Random Voice & Text Chat'; baseTitle = document.title; }
    if (s.limits) {
      S.limits.maxImageMB = s.limits.maxImageMB || 20;
      S.limits.maxVoiceNoteMB = s.limits.maxVoiceNoteMB || 20;
      S.limits.maxVoiceNoteSec = Math.min(s.limits.maxVoiceNoteSec || 180, 600);
      els.mediaHint.innerHTML = 'Images up to <b>' + S.limits.maxImageMB + ' MB</b> • voice notes up to <b>' + fmtTime(S.limits.maxVoiceNoteSec) + '</b>';
      els.tbCap.textContent = s.limits.maxOnline || 100;
      els.capText.textContent = 'capacity ' + (s.limits.maxOnline || 100) + ' users';
    }
    if (s.site) {
      $$('[data-gw]').forEach(function (el) {
        var v = s.site[el.getAttribute('data-gw').split('.')[1]];
        if (typeof v === 'string' && v) el.textContent = v;
      });
      document.title = s.site.name + ' — Random Voice & Text Chat';
      if (s.site.announcementEnabled && s.site.announcement && !sessionStorage.getItem('gw_announce_off')) {
        els.bannerText.textContent = s.site.announcement;
        els.banner.hidden = false;
      }
    }
    applyTheme(s.theme);
    if (s.maintenance && s.maintenance.on && !S.inChat) {
      els.setupMsg.textContent = '🛠 ' + (s.maintenance.message || 'Maintenance mode');
    }
    if (s.features) {
      els.callBtn.style.display = (s.features.voiceCalls === false) ? 'none' : '';
      if (s.features.images === false) els.attachBtn.style.display = 'none';
      if (s.features.voiceNotes === false) els.recordBtn.style.display = 'none';
    }
    if (s.push && s.push.enabled === false && els.notifBox) els.notifBox.hidden = true;
    if (s.features && els.tagList) els.tagList.style.display = s.features.interests === false ? 'none' : '';
  }

  function updatePresence(d) {
    els.tbOnline.textContent = d.online;
    els.kOnline.textContent = d.online;
    els.kChats.textContent = d.chats;
    els.kCalls.textContent = d.calls;
    els.searchOnline.textContent = d.online;
    var pct = d.capacity ? Math.min(100, Math.round(d.online / d.capacity * 100)) : 0;
    els.capBar.style.width = pct + '%';
    els.capBar.className = pct >= 85 ? 'hot' : '';
  }

  function refreshDayStats() {
    fetch('/api/public/stats', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
      updatePresence(d);
      els.kQueue.textContent = d.inQueue;
      els.searchQueue.textContent = d.inQueue;
      var li = els.dayStats.querySelectorAll('li b');
      if (li.length === 4) {
        li[0].textContent = d.today.sessions; li[1].textContent = d.today.calls;
        li[2].textContent = d.today.msgs; li[3].textContent = d.today.uploads;
      }
    }).catch(function () {});
  }

  /* ================================================================
   * AUDIO ENGINE — capture + DSP chain (highpass → gate → gain → compressor)
   * ================================================================ */
  function gateThreshold() {
    var db = Number((S.settings && S.settings.limits && S.settings.limits.noiseGateDb) || 9);
    return Math.min(0.5, Math.max(0.008, Math.pow(10, -(45 - db * 2.5) / 20)));
  }

  async function ensureAudio() {
    if (S.audio.streamOk) return S.audio.processed;
    var devId = els.devSelect.value || undefined;
    var raw = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: devId ? { exact: devId } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000
      },
      video: false
    });
    var ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 }); }
    catch (_) { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    if (ctx.state === 'suspended') await ctx.resume();
    var src = ctx.createMediaStreamSource(raw);

    var hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 95; hp.Q.value = 0.72;

    var gate = ctx.createGain(); gate.gain.value = 1;

    var userGain = ctx.createGain();
    userGain.gain.value = S.call.gain / 100;

    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 18; comp.ratio.value = 6;
    comp.attack.value = 0.004; comp.release.value = 0.18;

    var makeup = ctx.createGain(); makeup.gain.value = 1.12;

    var dest = ctx.createMediaStreamDestination();
    src.connect(hp); hp.connect(gate); gate.connect(userGain);
    userGain.connect(comp); comp.connect(makeup); makeup.connect(dest);

    var analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);

    S.audio = { ctx: ctx, raw: raw, processed: dest.stream, gate: gate, hp: hp, userGain: userGain, comp: comp, analyser: analyser, gateTimer: null, meterOn: false, streamOk: true };
    applyNoiseState();
    runGate();
    return S.audio.processed;
  }

  function applyNoiseState() {
    if (!S.audio.ctx) return;
    var on = S.call.noise;
    if (S.audio.hp) S.audio.hp.frequency.value = on ? 95 : 10;
    els.cbNoise.classList.toggle('off', !on);
    els.cbNoise.title = 'Noise filter (' + (on ? 'on' : 'off') + ')';
    els.cbNoise.textContent = on ? '🔇' : '🔊';
    [els.noiseToggle, els.noiseToggle2].forEach(function (t) { if (t) t.checked = on; });
  }

  function runGate() {
    if (!S.audio.analyser) return;
    if (S.audio.gateTimer) return; // already running — never start twice
    var buf = new Uint8Array(S.audio.analyser.fftSize);
    var open = true;
    S.audio.gateTimer = setInterval(function () {
      if (!S.audio.analyser) return;
      S.audio.analyser.getByteTimeDomainData(buf);
      var sum = 0;
      for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
      var rms = Math.sqrt(sum / buf.length);
      // meter only while mic test is on
      if (S.audio.meterOn && els.micLevel) els.micLevel.style.width = Math.min(100, rms * 320) + '%';
      var thr = gateThreshold();
      var nowOpen = rms > thr;
      if (nowOpen !== open) {
        open = nowOpen;
        var t = S.audio.ctx ? S.audio.ctx.currentTime : 0;
        if (S.audio.gate) S.audio.gate.gain.setTargetAtTime(open ? 1 : 0, t, open ? 0.01 : 0.14);
        if (S.audio.meterOn && els.micStatus) els.micStatus.textContent = open ? 'voice detected' : 'silence (gated)';
      }
    }, 70);
  }

  /* meter OFF only — gate loop keeps running so noise filter never dies */
  function stopAudioMeter() {
    S.audio.meterOn = false;
    if (els.micLevel) els.micLevel.style.width = '0%';
  }

  /* full teardown — only when the audio device/stream is destroyed */
  function killAudioEngine() {
    if (S.audio.gateTimer) { clearInterval(S.audio.gateTimer); S.audio.gateTimer = null; }
    S.audio.meterOn = false;
    stopAudioMeter();
  }

  async function listMics() {
    try {
      var devs = await navigator.mediaDevices.enumerateDevices();
      var mics = devs.filter(function (d) { return d.kind === 'audioinput'; });
      els.devSelect.innerHTML = '<option value="">Default microphone</option>' + mics.map(function (m) {
        return '<option value="' + m.deviceId + '">' + esc(m.label || 'Microphone ' + (mics.indexOf(m) + 1)) + '</option>';
      }).join('');
    } catch (_) {}
  }

  /* ================================================================
   * SETUP PANEL
   * ================================================================ */
  function loadPrefs() {
    els.nickInput.value = localStorage.getItem('gw_nick') || '';
    try {
      (JSON.parse(localStorage.getItem('gw_tags') || '[]')).forEach(function (t) {
        var b = els.tagList.querySelector('[data-tag="' + t + '"]'); if (b) b.classList.add('active');
      });
    } catch (_) {}
    var m = localStorage.getItem('gw_mode');
    if (m) setMode(m);
    S.call.noise = localStorage.getItem('gw_noise') !== '0';
    els.noiseToggle.checked = S.call.noise;
    els.noiseToggle2.checked = S.call.noise;
    S.call.gain = Number(localStorage.getItem('gw_gain') || 100);
    els.gainRange.value = S.call.gain; els.gainVal.textContent = S.call.gain + '%';
    var ns = Number(localStorage.getItem('gw_noiseStrength') || 9);
    els.noiseStrength.value = ns; els.noiseVal.textContent = ns + ' dB';
  }

  function setMode(m) {
    S.mode = m;
    $$('#modeGrid .mode').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
  }

  function chosenTags() {
    return $$('#tagList button.active').map(function (b) { return b.dataset.tag; });
  }

  /* ================================================================
   * SEARCH
   * ================================================================ */
  function startSearch() {
    var mode = S.mode || 'both';
    if ((mode === 'voice' || mode === 'both')) {
      if (!(navigator.mediaDevices && window.RTCPeerConnection)) { toast('Voice calls need a modern browser (Chrome/Edge/Firefox/Safari)', 'warn'); return; }
    }
    localStorage.setItem('gw_nick', els.nickInput.value.trim());
    localStorage.setItem('gw_mode', mode);
    localStorage.setItem('gw_tags', JSON.stringify(chosenTags()));
    if (els.nickInput.value.trim()) S.socket.emit('nick:set', { nick: els.nickInput.value.trim() });
    S.socket.emit('prefs:set', { tags: chosenTags(), mode: mode, noiseFilter: S.call.noise });
    S.socket.emit('queue:find', { mode: mode, tags: chosenTags() });
  }

  function enterSearching() {
    show('searchPanel');
    hideOverlay();
    S.searchStart = Date.now();
    els.searchSub.textContent = 'Searching for a partner who matches your mode and interests.';
    clearInterval(S.searchTimer);
    S.searchTimer = setInterval(function () {
      els.searchTime.textContent = fmtTime((Date.now() - S.searchStart) / 1000);
    }, 500);
    // pre-warm mic for voice modes (user gesture chain)
    if ((S.mode === 'voice' || S.mode === 'both') && !S.audio.streamOk) {
      ensureAudio().then(function () {
        listMics();
        stopAudioMeter(); // meter stays off; gate loop keeps running
      }).catch(function (e) {
        if (S.mode === 'voice') {
          toast('Microphone blocked — voice chat needs mic access. Switching to text.', 'warn', 6000);
          setMode('text'); S.mode = 'text';
        } else {
          toast('Mic not available — you can still text chat.', 'warn');
        }
      });
    }
  }

  function leaveSearch(msg) {
    clearInterval(S.searchTimer);
    show('setupPanel');
    if (msg) els.setupMsg.textContent = msg;
  }

  /* ================================================================
   * CHAT PANEL — rendering
   * ================================================================ */
  function enterChat(d) {
    clearInterval(S.searchTimer);
    stopRing();
    S.inChat = true;
    S.room = d.room;
    S.you = d.you; S.peer = d.peer;
    S.limits = Object.assign(S.limits, d.limits || {});
    S.callAllowed = d.callAllowed !== false;
    show('chatPanel');
    els.msgs.innerHTML = '';
    els.peerName.textContent = d.peer.nick;
    els.peerAvatar.textContent = (d.peer.nick || '?').slice(0, 2).toUpperCase();
    els.cdName.textContent = d.peer.nick;
    els.cdInitials.textContent = (d.peer.nick || '?').slice(0, 2).toUpperCase();
    els.peerTags.textContent = (d.peer.tags || []).length ? '🏷 ' + d.peer.tags.join(', ') : 'random stranger';
    addSys(d.commonTags && d.commonTags.length
      ? 'Connected! You both like: ' + d.commonTags.join(', ') + ' 🎯'
      : 'You are now connected. Say hi 👋');
    els.callBtn.style.display = S.callAllowed ? '' : 'none';
    if (d.room && d.room.voice && S.callAllowed) {
      toast('This is a voice match — call starts automatically 🎙️');
    }
    sndFound();
    hideOverlay();
    refreshDayStats();
  }

  function exitChat() {
    S.inChat = false; S.peer = null; S.room = null;
    teardownCall(false);
    if (S.rec.active) stopRecording(false);
    els.typingBar.hidden = true;
    clearNotify();
  }

  function scrollBottom() { els.msgs.scrollTop = els.msgs.scrollHeight; }
  function addSys(text) {
    var d = document.createElement('div');
    d.className = 'sys'; d.textContent = text;
    els.msgs.appendChild(d); scrollBottom();
  }

  function rowEl(kind, mine) {
    var r = document.createElement('div');
    r.className = 'row ' + (mine ? 'me' : 'them');
    if (kind === 'text') {
      r.innerHTML = '<div class="meta"><span class="who"></span><span class="tick" hidden>✓✓</span></div><div class="msg-text"></div>';
    }
    return r;
  }

  function renderText(text, mine, id, acked) {
    var r = rowEl('text', mine);
    r.querySelector('.who').textContent = mine ? (S.you ? S.you.nick : 'You') : (S.peer ? S.peer.nick : 'Stranger');
    r.querySelector('.msg-text').innerHTML = linkify(text);
    if (mine) {
      var tick = r.querySelector('.tick');
      tick.hidden = !acked;
      if (id) { r.dataset.id = id; S.pendingMsgs[id] = tick; }
    }
    els.msgs.appendChild(r); scrollBottom();
    if (!mine) sndMsg();
  }

  function linkify(text) {
    var html = esc(text);
    html = html.replace(/(https?:\/\/[^\s<]+)/g, function (u) {
      var safe = u.replace(/["']/g, '');
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer nofollow ugc">' + safe + '</a>';
    });
    return html.replace(/\n/g, '<br>');
  }

  function renderImage(mine, url, name, size, compressed) {
    var r = document.createElement('div');
    r.className = 'row ' + (mine ? 'me' : 'them');
    r.innerHTML =
      '<div class="msg-media"><img loading="lazy" alt="shared image"><div class="mm-foot"><b></b>' +
      (compressed ? '<span class="mini">(compressed)</span>' : '') +
      '<span class="grow"></span><span class="sz"></span><a class="mm-dl" download target="_blank" rel="noopener">save</a></div></div>';
    var img = r.querySelector('img');
    img.src = url;
    img.addEventListener('click', function () { lightbox(url); });
    r.querySelector('b').textContent = name || 'image';
    r.querySelector('.sz').textContent = fmtSize(size || 0);
    r.querySelector('.mm-dl').href = url;
    els.msgs.appendChild(r); scrollBottom();
    if (!mine) sndMsg();
  }

  function renderVoice(mine, url, duration) {
    var r = document.createElement('div');
    r.className = 'row ' + (mine ? 'me' : 'them');
    r.innerHTML =
      '<div class="msg-voice" style="position:relative">' +
      '<span class="vv-name"></span>' +
      '<button class="vv-play" title="Play">▶</button>' +
      '<div class="vv-track"><canvas width="300" height="26"></canvas></div>' +
      '<span class="vv-time">0:00</span>' +
      '</div>';
    r.querySelector('.vv-name').textContent = mine ? 'you' : (S.peer ? S.peer.nick : 'Stranger');
    els.msgs.appendChild(r); scrollBottom();
    if (!mine) sndMsg();

    var audio = new Audio(url);
    audio.preload = 'metadata';
    var btn = r.querySelector('.vv-play');
    var timeEl = r.querySelector('.vv-time');
    var canvas = r.querySelector('canvas');
    var drawn = false;

    function drawWave(progress) {
      var c = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      c.clearRect(0, 0, w, h);
      var bars = 44, data = r._wave || null;
      for (var i = 0; i < bars; i++) {
        var v = data ? data[i] || 0 : 0.25 + 0.2 * Math.sin(i * 1.7);
        var bh = Math.max(3, v * h);
        var x = i * (w / bars);
        c.fillStyle = (i / bars) <= progress ? getComputedStyle(document.documentElement).getPropertyValue('--accent') || '#00d4ff' : 'rgba(128,128,160,.4)';
        c.fillRect(x + 1, (h - bh) / 2, w / bars - 2.5, bh);
      }
    }
    drawWave(0);

    fetch(url).then(function (res) { return res.arrayBuffer(); }).then(function (ab) {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      return ac.decodeAudioData(ab).then(function (buf) {
        var ch = buf.getChannelData(0);
        var bars = 44, step = Math.floor(ch.length / bars), out = [];
        for (var i = 0; i < bars; i++) {
          var max = 0;
          for (var j = 0; j < step; j += 24) { var v = Math.abs(ch[i * step + j] || 0); if (v > max) max = v; }
          out.push(Math.min(1, max * 2.6));
        }
        r._wave = out;
        drawWave(audio.currentTime / (audio.duration || duration || 1));
        ac.close();
      });
    }).catch(function () {});

    audio.addEventListener('timeupdate', function () {
      var d = audio.duration || duration || 1;
      timeEl.textContent = fmtTime(audio.currentTime);
      drawWave(audio.currentTime / d);
    });
    audio.addEventListener('ended', function () {
      btn.textContent = '▶'; timeEl.textContent = fmtTime(audio.duration || duration || 0); drawWave(0);
    });
    btn.addEventListener('click', function () {
      if (audio.paused) {
        $$('audio').forEach(function (a) { if (a !== audio) a.pause(); });
        audio.play().catch(function () { toast('Tap again to allow audio', 'warn'); });
        btn.textContent = '⏸';
      } else { audio.pause(); btn.textContent = '▶'; }
    });
    if (duration) timeEl.textContent = fmtTime(0);
  }

  function renderMedia(mine, m) {
    if (m.mediaKind === 'voice') renderVoice(mine, m.url, m.duration);
    else renderImage(mine, m.url, m.name, m.size, m.compressed);
  }

  function lightbox(url) {
    var lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = '<img alt="image">';
    lb.querySelector('img').src = url;
    lb.addEventListener('click', function () { lb.remove(); });
    document.body.appendChild(lb);
  }

  /* ---------------- send text ---------------- */
  function sendText() {
    var ta = els.msgInput;
    var text = ta.value.trim();
    if (!text || !S.inChat) return;
    if (text.length > S.limits.maxMsgLen) text = text.slice(0, S.limits.maxMsgLen);
    S.socket.emit('msg', { kind: 'text', text: text });
    renderText(text, true, null, true);
    ta.value = '';
    autosize();
    els.charCount.textContent = '';
    sendTyping(false);
  }

  var typingLast = 0;
  function sendTyping(on) {
    if (!S.inChat) return;
    var now = Date.now();
    if (on && now - typingLast > 1200) {
      typingLast = now;
      S.socket.emit('typing', { on: true });
      clearTimeout(S.typingOff);
      S.typingOff = setTimeout(function () { S.socket.emit('typing', { on: false }); }, 1600);
    }
    if (!on) {
      clearTimeout(S.typingOff);
      S.socket.emit('typing', { on: false });
    }
  }

  function autosize() {
    var ta = els.msgInput;
    ta.style.height = 'auto';
    ta.style.height = Math.min(130, ta.scrollHeight) + 'px';
  }

  /* ================================================================
   * UPLOADS — images (≤ maxImageMB, auto-compress) & voice notes
   * ================================================================ */
  function uploadFile(blob, kind, name, meta, cb) {
    var maxMB = kind === 'voice' ? S.limits.maxVoiceNoteMB : S.limits.maxImageMB;
    var fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', blob, name || (kind === 'voice' ? 'voice.webm' : 'image'));
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload?sid=' + encodeURIComponent(S.socket.id));
    xhr.responseType = 'json';
    var hasProgress = false;
    xhr.upload.onprogress = function (e) {
      if (!e.lengthComputable || e.total < 262144) return;
      hasProgress = true;
      els.progressWrap.hidden = false;
      els.progressBar.style.width = Math.round(e.loaded / e.total * 100) + '%';
      els.progressText.textContent = 'uploading ' + kind + '… ' + Math.round(e.loaded / e.total * 100) + '%';
    };
    xhr.onload = function () {
      els.progressWrap.hidden = true; els.progressBar.style.width = '0%';
      if (xhr.status === 200 && xhr.response && xhr.response.id) return cb(null, xhr.response);
      var err = (xhr.response && xhr.response.error) || 'upload_failed';
      if (err === 'too_large') err = 'File is larger than ' + maxMB + ' MB 😅';
      cb(err);
    };
    xhr.onerror = function () { els.progressWrap.hidden = true; cb('network_error'); };
    xhr.send(fd);
  }

  async function compressImage(file) {
    var maxBytes = S.limits.maxImageMB * 1024 * 1024;
    var auto = S.settings && S.settings.features && S.settings.features.autoCompressImages !== false;
    if (file.size <= maxBytes) return { file: file, compressed: false };
    if (!auto || !/^image\/(png|jpe?g|webp)$/i.test(file.type)) return { file: file, compressed: false, over: true };

    toast('Image is ' + fmtSize(file.size) + ' — auto-compressing to fit ' + S.limits.maxImageMB + ' MB…', '', 3000);
    var bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    var w = bmp.width, h = bmp.height;
    var maxDim = 3840, quality = 0.85;
    var canvas = document.createElement('canvas');
    var tries = 0;
    var out = null;
    while (tries < 6) {
      var scale = Math.min(1, maxDim / Math.max(w, h));
      canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
      var c = canvas.getContext('2d');
      c.clearRect(0, 0, canvas.width, canvas.height);
      c.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/jpeg', quality); });
      if (blob && blob.size <= maxBytes) { out = blob; break; }
      if (maxDim <= 1280 && quality <= 0.5) { out = blob || out; break; }
      if (maxDim > 1280) maxDim = Math.round(maxDim * 0.72); else quality -= 0.12;
      tries++;
    }
    if (!out) return { file: file, compressed: false, over: true };
    return { file: out, compressed: true, name: (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg', w: canvas.width, h: canvas.height };
  }

  async function sendImageFile(file) {
    if (!file) return;
    if (!/^image\//i.test(file.type)) { toast('Only image files 🖼', 'warn'); return; }
    var r;
    try { r = await compressImage(file); }
    catch (e) { r = { file: file, compressed: false, over: file.size > S.limits.maxImageMB * 1024 * 1024 }; }
    if (r.over) { toast('Image is larger than ' + S.limits.maxImageMB + ' MB — please send a smaller one.', 'bad', 6000); return; }
    var name = r.name || file.name || 'image';
    var dim = { w: r.w || 0, h: r.h || 0 };
    uploadFile(r.file, 'image', name, dim, function (err, res) {
      if (err) { toast(String(err), 'bad'); return; }
      S.socket.emit('msg', { kind: 'media', id: res.id, w: dim.w, h: dim.h, compressed: r.compressed });
      renderImage(true, res.url, name, r.file.size, r.compressed);
    });
  }

  /* ================================================================
   * VOICE NOTES — record / preview / send
   * ================================================================ */
  function pickMime() {
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg'];
    if (!window.MediaRecorder) return null;
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }

  async function startRecording() {
    if (S.rec.active) return;
    var mime = pickMime();
    if (mime === null) { toast('Voice notes are not supported in this browser 😕', 'warn'); return; }
    var stream = S.audio.streamOk ? S.audio.processed : null;
    if (!stream) {
      try { stream = await ensureAudio(); }
      catch (e) { toast('Microphone permission needed for voice notes', 'warn'); return; }
    }
    if (S.audio.ctx && S.audio.ctx.state === 'suspended') { try { await S.audio.ctx.resume(); } catch (_) {} }
    var mr;
    try { mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 48000 } : undefined); }
    catch (e) { try { mr = new MediaRecorder(stream); } catch (e2) { toast('Recording not supported here', 'warn'); return; } }
    S.rec = { mr: mr, chunks: [], start: Date.now(), timer: null, waves: [], stream: stream, active: true };
    mr.ondataavailable = function (e) { if (e.data && e.data.size) S.rec.chunks.push(e.data); };
    mr.onstop = onRecStop;
    mr.start(250);
    els.recBar.hidden = false;
    els.recordBtn.classList.add('recording');
    var wavesBox = els.recWaves;
    wavesBox.innerHTML = '';
    for (var i = 0; i < 42; i++) { var b = document.createElement('i'); b.style.height = '12%'; wavesBox.appendChild(b); }
    S.rec.timer = setInterval(function () {
      var sec = (Date.now() - S.rec.start) / 1000;
      els.recTime.textContent = fmtTime(sec);
      // wave bars from analyser
      var bars = wavesBox.children;
      if (S.audio.analyser && bars.length) {
        var buf = new Uint8Array(S.audio.analyser.fftSize);
        S.audio.analyser.getByteTimeDomainData(buf);
        var sum = 0;
        for (var j = 0; j < buf.length; j++) { var v = (buf[j] - 128) / 128; sum += v * v; }
        var rms = Math.min(1, Math.sqrt(sum / buf.length) * 3.2);
        for (var k = 0; k < bars.length; k++) {
          var target = 10 + Math.abs(Math.sin(k * 0.7 + Date.now() / 130)) * rms * 88;
          bars[k].style.height = target + '%';
        }
      }
      if (sec >= S.limits.maxVoiceNoteSec) stopRecording(true);
    }, 100);
  }

  function stopRecording(send) {
    if (!S.rec.active) return;
    S.rec.send = send;
    try { S.rec.mr.stop(); } catch (_) { resetRecUI(); }
  }

  function resetRecUI() {
    if (S.rec.timer) clearInterval(S.rec.timer);
    els.recBar.hidden = true;
    els.recordBtn.classList.remove('recording');
    S.rec.active = false;
  }

  function onRecStop() {
    var dur = (Date.now() - S.rec.start) / 1000;
    var blob = new Blob(S.rec.chunks, { type: S.rec.mr.mimeType || 'audio/webm' });
    var send = S.rec.send;
    resetRecUI();
    if (!send || blob.size < 900 || dur < 0.5) {
      if (send && dur < 0.5) toast('Recording too short — tap & hold nothing, just tap 🎤 and speak, then Send.', 'warn', 5200);
      return;
    }
    if (blob.size > S.limits.maxVoiceNoteMB * 1024 * 1024) {
      toast('Voice note is larger than ' + S.limits.maxVoiceNoteMB + ' MB', 'bad');
      return;
    }
    uploadFile(blob, 'voice', 'voice-note' + (blob.type.indexOf('mp4') > -1 ? '.m4a' : '.webm'), {}, function (err, res) {
      if (err) { toast(String(err), 'bad'); return; }
      S.socket.emit('msg', { kind: 'media', id: res.id, duration: Math.round(dur) });
      renderVoice(true, res.url, Math.round(dur));
    });
  }

  /* ================================================================
   * WEBRTC CALL
   * ================================================================ */
  function newPC() {
    var ice = (S.settings && S.settings.ice) || [{ urls: 'stun:stun.l.google.com:19302' }];
    var pc = new RTCPeerConnection({ iceServers: ice, iceCandidatePoolSize: 2 });
    pc.onicecandidate = function (e) {
      if (e.candidate) S.socket.emit('webrtc', { type: 'ice', candidate: e.candidate });
    };
    pc.ontrack = function (e) {
      els.remoteAudio.srcObject = e.streams[0];
      attachRemoteAnalyser(e.streams[0]);
    };
    pc.oniceconnectionstatechange = function () {
      var st = pc.iceConnectionState;
      if (st === 'connected' || st === 'completed') {
        els.cdState.textContent = 'connected • clear voice';
        startCallTimer();
        startQualityMonitor();
      } else if (st === 'checking') {
        els.cdState.textContent = 'connecting…';
      } else if (st === 'disconnected') {
        els.cdState.textContent = 'connection unstable — reconnecting…';
        if (pc.restartIce) pc.restartIce();
      } else if (st === 'failed') {
        if (pc.restartIce) pc.restartIce();
        if (S.call.initiator) makeOffer(true);
      }
    };
    return pc;
  }

  async function startCall(isInitiator) {
    try {
      var stream = await ensureAudio();
    } catch (e) {
      toast('Microphone access failed — cannot call 🎙️', 'bad');
      S.socket.emit('call:end');
      return;
    }
    if (S.audio.ctx && S.audio.ctx.state === 'suspended') S.audio.ctx.resume();
    teardownCall(false, true);
    S.call.active = true;
    S.call.initiator = isInitiator;
    S.call.startedAt = Date.now();
    var pc = newPC();
    S.call.pc = pc;
    stream.getAudioTracks().forEach(function (t) { pc.addTrack(t, stream); });
    els.callDock.hidden = false;
    els.cdState.textContent = isInitiator ? 'calling…' : 'connecting…';
    els.cbMute.classList.toggle('off', S.call.muted);
    applyNoiseState();
    if (isInitiator) makeOffer();
  }

  async function makeOffer(restart) {
    if (!S.call.pc) return;
    try {
      var offer = await S.call.pc.createOffer({ iceRestart: !!restart, offerToReceiveAudio: true });
      await S.call.pc.setLocalDescription(offer);
      S.socket.emit('webrtc', { type: 'offer', sdp: S.call.pc.localDescription });
    } catch (e) { toast('Call setup failed', 'bad'); }
  }

  var pendingIce = [];
  S.socket = null; // set in init

  async function onSignal(d) {
    try {
      if (d.type === 'offer') {
        if (!S.call.pc) { await startCall(false); }
        await S.call.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
        for (var i = 0; i < pendingIce.length; i++) { try { await S.call.pc.addIceCandidate(pendingIce[i]); } catch (_) {} }
        pendingIce = [];
        var answer = await S.call.pc.createAnswer();
        await S.call.pc.setLocalDescription(answer);
        S.socket.emit('webrtc', { type: 'answer', sdp: S.call.pc.localDescription });
      } else if (d.type === 'answer') {
        if (S.call.pc && S.call.pc.signalingState !== 'stable') {
          await S.call.pc.setRemoteDescription(new RTCSessionDescription(d.sdp));
          for (var j = 0; j < pendingIce.length; j++) { try { await S.call.pc.addIceCandidate(pendingIce[j]); } catch (_) {} }
          pendingIce = [];
        }
      } else if (d.type === 'ice') {
        if (S.call.pc && S.call.pc.remoteDescription) {
          await S.call.pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(function () {});
        } else if (d.candidate) {
          pendingIce.push(new RTCIceCandidate(d.candidate));
        }
      }
    } catch (e) {
      console.warn('signal error', e);
    }
  }

  function startCallTimer() {
    clearInterval(S.call.timer);
    els.cdTimer.textContent = '00:00';
    S.call.timer = setInterval(function () {
      if (!S.call.startedAt) return;
      els.cdTimer.textContent = fmtTime((Date.now() - S.call.startedAt) / 1000);
    }, 1000);
  }

  function startQualityMonitor() {
    clearInterval(S.call.statsTimer);
    S.call.statsTimer = setInterval(async function () {
      if (!S.call.pc) return;
      try {
        var res = await S.call.pc.getStats();
        var rtt = null, lost = 0, recvd = 0;
        res.forEach(function (s) {
          if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.currentRoundTripTime != null) rtt = s.currentRoundTripTime;
          if (s.type === 'inbound-rtp' && s.kind === 'audio') { lost = s.packetsLost || 0; recvd = s.packetsReceived || 0; }
        });
        var loss = recvd ? lost / (lost + recvd) * 100 : 0;
        var q;
        if (rtt != null && rtt < 0.15 && loss < 2) q = ['●●●', 'var(--ok)'];
        else if (rtt != null && rtt < 0.35 && loss < 6) q = ['●●○', 'var(--warn)'];
        else q = ['●○○', 'var(--bad)'];
        els.cdQuality.textContent = q[0];
        els.cdQuality.style.color = q[1];
        els.cdQuality.title = 'RTT ' + (rtt != null ? Math.round(rtt * 1000) + 'ms' : '—') + ' • loss ' + loss.toFixed(1) + '%';
      } catch (_) {}
    }, 2500);
  }

  var remoteAnalyser = null;
  function attachRemoteAnalyser(stream) {
    try {
      if (!S.audio.ctx) return;
      if (remoteAnalyser) return;
      var src = S.audio.ctx.createMediaStreamSource(stream);
      var an = S.audio.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an); // tap only — no output
      remoteAnalyser = an;
      var buf = new Uint8Array(an.fftSize);
      var talking = false;
      (function loop() {
        if (!remoteAnalyser) return;
        an.getByteTimeDomainData(buf);
        var sum = 0;
        for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
        var rms = Math.sqrt(sum / buf.length);
        var nowTalking = rms > 0.02;
        if (nowTalking !== talking) {
          talking = nowTalking;
          els.cdRing.classList.toggle('talking', talking);
          els.cdWave.classList.toggle('on', talking);
        }
        requestAnimationFrame(loop);
      })();
    } catch (_) {}
  }

  function teardownCall(notify, keepDockHidden) {
    stopRing();
    clearInterval(S.call.timer);
    clearInterval(S.call.statsTimer);
    remoteAnalyser = null;
    if (S.call.pc) {
      try { S.call.pc.close(); } catch (_) {}
    }
    S.call.pc = null;
    S.call.active = false;
    S.call.startedAt = 0;
    els.remoteAudio.srcObject = null;
    els.callDock.hidden = true;
    els.cdRing.classList.remove('talking');
    els.cdWave.classList.remove('on');
    if (notify) S.socket.emit('call:end');
  }

  /* ================================================================
   * OVERLAYS
   * ================================================================ */
  function showOverlay(title, text, btns) {
    els.ovTitle.textContent = title;
    els.ovText.textContent = text;
    els.ovActions.innerHTML = '';
    (btns || [{ label: 'OK' }]).forEach(function (b) {
      var bt = document.createElement('button');
      bt.className = 'btn ' + (b.cls || 'primary');
      bt.textContent = b.label;
      bt.addEventListener('click', function () {
        hideOverlay();
        if (b.fn) b.fn();
      });
      els.ovActions.appendChild(bt);
    });
    els.overlay.hidden = false;
  }
  function hideOverlay() {
    els.overlay.hidden = true;
    els.incoming.hidden = true;
    stopRing();
  }

  /* ================================================================
   * INIT
   * ================================================================ */
  function cacheEls() {
    var ids = ['banner', 'bannerText', 'bannerX', 'connState', 'tbOnline', 'tbCap', 'soundBtn', 'prefsBtn',
      'setupPanel', 'searchPanel', 'chatPanel', 'nickInput', 'nickDice', 'modeGrid', 'tagList',
      'noiseToggle', 'noiseToggle2', 'noiseStrength', 'noiseVal', 'micTest', 'micLevel', 'micStatus', 'devSelect',
      'startBtn', 'setupMsg', 'searchSub', 'searchTime', 'searchQueue', 'searchOnline', 'searchCancel',
      'inviteInput', 'inviteJoin', 'inviteCreate', 'inviteMsg',
      'peerAvatar', 'peerName', 'peerTags', 'peerState', 'callBtn', 'nextBtn', 'reportBtn', 'blockBtn',
      'callDock', 'cdRing', 'cdInitials', 'cdName', 'cdState', 'cdWave', 'cdTimer', 'cdQuality',
      'cbMute', 'cbNoise', 'cbVol', 'cbEnd', 'remoteAudio',
      'typingBar', 'msgs', 'recBar', 'recTime', 'recWaves', 'recCancel', 'recSend',
      'progressWrap', 'progressBar', 'progressText',
      'attachBtn', 'recordBtn', 'fileInput', 'msgInput', 'charCount', 'sendBtn', 'mediaHint',
      'kOnline', 'kChats', 'kCalls', 'kQueue', 'capBar', 'capText', 'dayStats',
      'soundToggle', 'typedDuringCall', 'gainRange', 'gainVal',
      'notifBox', 'notifState', 'notifBtn',
      'incomingCall', 'icName', 'icAccept', 'icDecline', 'toasts'];
    ids.forEach(function (id) { els[id] = document.getElementById(id); });
    els.rail = document.getElementById('rail');
    els.overlay = document.getElementById('blockedOverlay');
    els.ovTitle = document.getElementById('ovTitle');
    els.ovText = document.getElementById('ovText');
    els.ovOk = document.getElementById('ovOk');
    els.ovActions = document.querySelector('#blockedOverlay .modal-actions');
  }

  function bindUI() {
    /* banner */
    els.bannerX.addEventListener('click', function () { els.banner.hidden = true; sessionStorage.setItem('gw_announce_off', '1'); });

    /* nick & mode & tags */
    els.nickDice.addEventListener('click', function () {
      var a = ['Grace', 'Faith', 'Hope', 'Mercy', 'Light', 'Peace', 'Joy', 'Blessed', 'Lion', 'Dove', 'Star', 'Ember', 'Nova', 'River', 'Sky'];
      els.nickInput.value = a[Math.floor(Math.random() * a.length)] + '_' + Math.floor(1000 + Math.random() * 9000);
    });
    els.modeGrid.addEventListener('click', function (e) {
      var b = e.target.closest('.mode'); if (!b) return;
      setMode(b.dataset.mode);
    });
    els.tagList.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      b.classList.toggle('active');
    });

    /* noise prefs */
    function setNoise(v) {
      S.call.noise = v;
      localStorage.setItem('gw_noise', v ? '1' : '0');
      applyNoiseState();
      S.socket.emit('call:state', { noiseFilter: v });
    }
    els.noiseToggle.addEventListener('change', function () { setNoise(this.checked); });
    els.noiseToggle2.addEventListener('change', function () { setNoise(this.checked); });
    els.cbNoise.addEventListener('click', function () { setNoise(!S.call.noise); toast('Noise filter ' + (S.call.noise ? 'ON — background noise removed' : 'OFF — raw mic'), '', 2600); });
    els.noiseStrength.addEventListener('input', function () {
      els.noiseVal.textContent = this.value + ' dB';
      localStorage.setItem('gw_noiseStrength', this.value);
      if (S.settings && S.settings.limits) S.settings.limits.noiseGateDb = Number(this.value);
    });
    els.gainRange.addEventListener('input', function () {
      S.call.gain = Number(this.value);
      els.gainVal.textContent = S.call.gain + '%';
      localStorage.setItem('gw_gain', S.call.gain);
      if (S.audio.userGain) S.audio.userGain.gain.value = S.call.gain / 100;
    });

    /* mic test */
    els.micTest.addEventListener('click', async function () {
      if (S.audio.meterOn) {
        stopAudioMeter();
        els.micStatus.textContent = 'not started';
        this.textContent = 'Test mic';
        return;
      }
      this.textContent = 'Stop test';
      els.micStatus.textContent = 'starting…';
      try {
        await ensureAudio();
        if (S.audio.ctx && S.audio.ctx.state === 'suspended') S.audio.ctx.resume();
        S.audio.meterOn = true;
        els.micStatus.textContent = 'listening…';
        listMics();
      } catch (e) {
        els.micStatus.textContent = 'mic blocked!';
        this.textContent = 'Test mic';
        toast('Allow microphone access in your browser to test 🎙️', 'warn');
      }
    });
    els.devSelect.addEventListener('change', async function () {
      if (S.audio.streamOk) {
        // rebuild stream with new device — full teardown of the audio engine
        S.audio.streamOk = false;
        killAudioEngine();
        try { S.audio.raw.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
        if (S.audio.ctx) { try { S.audio.ctx.close(); } catch (_) {} S.audio.ctx = null; }
        S.audio.analyser = null; S.audio.gate = null; S.audio.raw = null; S.audio.processed = null;
        if (S.call.active) { teardownCall(false); toast('Mic changed — start the call again', 'warn'); }
      }
    });

    /* start / search */
    els.startBtn.addEventListener('click', startSearch);
    els.searchCancel.addEventListener('click', function () {
      S.socket.emit('queue:leave');
      leaveSearch();
    });

    /* invites */
    els.inviteJoin.addEventListener('click', function () {
      var code = els.inviteInput.value.trim().toUpperCase();
      if (!code) return;
      S.socket.emit('room:join', { code: code });
      els.inviteMsg.textContent = 'Joining ' + code + '…';
    });
    els.inviteCreate.addEventListener('click', function () {
      S.socket.emit('invite:create');
    });

    /* chat actions */
    els.callBtn.addEventListener('click', function () {
      if (!S.inChat) return;
      if (S.call.active) { toast('Call already running — controls are in the green bar 👆', '', 3000); return; }
      S.socket.emit('call:invite');
      els.callBtn.disabled = true;
      setTimeout(function () { els.callBtn.disabled = false; }, 4000);
    });
    els.nextBtn.addEventListener('click', function () {
      if (!S.inChat) return;
      S.socket.emit('next');
    });
    els.reportBtn.addEventListener('click', function () {
      if (!S.inChat) return;
      var reason = prompt('Report this user? Tell us what happened (optional):');
      if (reason === null) return;
      S.socket.emit('report', { reason: reason });
    });
    els.blockBtn.addEventListener('click', function () {
      if (!S.inChat) return;
      if (confirm('Block this user? They cannot be matched with you again for 24 hours.')) S.socket.emit('block');
    });

    /* call controls */
    els.cbMute.addEventListener('click', function () {
      S.call.muted = !S.call.muted;
      this.classList.toggle('off', S.call.muted);
      this.textContent = S.call.muted ? '🔇' : '🎤';
      if (S.audio.raw) S.audio.raw.getAudioTracks().forEach(function (t) { t.enabled = !S.call.muted; });
      if (S.audio.userGain) S.audio.userGain.gain.value = S.call.muted ? 0 : S.call.gain / 100;
      S.socket.emit('call:state', { muted: S.call.muted });
    });
    var vols = [1, 0.6, 0.25, 1];
    var volIx = 0;
    els.cbVol.addEventListener('click', function () {
      volIx = (volIx + 1) % vols.length;
      els.remoteAudio.volume = vols[volIx];
      this.textContent = vols[volIx] === 1 ? '🔊' : (vols[volIx] === 0.6 ? '🔉' : '🔈');
    });
    els.cbEnd.addEventListener('click', function () { teardownCall(true); });

    /* incoming call */
    els.icAccept.addEventListener('click', function () {
      els.incoming.hidden = true;
      stopRing();
      S.socket.emit('call:accept');
    });
    els.icDecline.addEventListener('click', function () {
      els.incoming.hidden = true;
      stopRing();
      S.socket.emit('call:decline');
    });
    els.ovOk.addEventListener('click', hideOverlay);

    /* composer */
    els.sendBtn.addEventListener('click', sendText);
    els.msgInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    });
    els.msgInput.addEventListener('input', function () {
      autosize();
      sendTyping(true);
      var left = S.limits.maxMsgLen - this.value.length;
      els.charCount.textContent = left < 120 ? left : '';
    });

    /* attachments */
    els.attachBtn.addEventListener('click', function () { els.fileInput.click(); });
    els.fileInput.addEventListener('change', function () {
      if (this.files && this.files[0]) sendImageFile(this.files[0]);
      this.value = '';
    });
    document.addEventListener('paste', function (e) {
      if (!S.inChat) return;
      var items = (e.clipboardData || {}).items || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image') === 0) {
          sendImageFile(items[i].getAsFile());
          break;
        }
      }
    });

    /* voice notes */
    els.recordBtn.addEventListener('click', startRecording);
    els.recCancel.addEventListener('click', function () { stopRecording(false); });
    els.recSend.addEventListener('click', function () { stopRecording(true); });

    /* notifications */
    els.notifBtn.addEventListener('click', enableNotifications);

    /* sound toggle */
    function setSound(v) {
      S.sound = v;
      localStorage.setItem('gw_sound', v ? '1' : '0');
      els.soundBtn.style.opacity = v ? 1 : 0.45;
      els.soundToggle.checked = v;
    }
    els.soundBtn.addEventListener('click', function () { setSound(!S.sound); toast('Sound alerts ' + (S.sound ? 'on 🔔' : 'off 🔕'), '', 1800); });
    els.soundToggle.addEventListener('change', function () { setSound(this.checked); });

    /* drag & drop images */
    ['dragover', 'drop'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (!S.inChat) return;
        e.preventDefault();
        if (ev === 'drop' && e.dataTransfer.files && e.dataTransfer.files[0]) sendImageFile(e.dataTransfer.files[0]);
      });
    });
  }

  function bindSocket() {
    var socket = io({ transports: ['polling', 'websocket'] });
    S.socket = socket;

    socket.on('connect', function () { setConn('connected', true); });
    socket.on('disconnect', function () {
      setConn('reconnecting…', false);
      stopRing();
    });
    socket.on('connect_error', function () { setConn('connection issue…', false); });

    socket.on('welcome', function (d) {
      S.you = d.you;
      applySettings(d.settings);
      updatePresence(d.stats);
      if (!els.nickInput.value) els.nickInput.value = d.you.nick;
      if (d.limited) toast('Heads up: several tabs are open from your network.', 'warn');
      initNotifications();
      S.socket.emit('visibility', { visible: !document.hidden });
      refreshDayStats();
      var room = new URLSearchParams(location.search).get('room');
      if (room) {
        socket.emit('room:join', { code: room.toUpperCase() });
        enterSearching();
        els.searchSub.textContent = 'Joining private room ' + esc(room.toUpperCase()) + '…';
      }
    });

    socket.on('you:update', function (u) { S.you = u; });
    socket.on('peer:update', function (u) {
      S.peer = u;
      if (S.inChat) {
        els.peerName.textContent = u.nick;
        els.peerState.innerHTML = '<i class="dot live"></i> ' + (u.muted ? 'muted 🎙️ off' : u.callActive ? 'on call 🎙️' : 'connected');
      }
    });

    socket.on('presence', updatePresence);
    socket.on('settings:update', applySettings);

    socket.on('queue:waiting', function (d) {
      enterSearching();
      els.searchSub.textContent = 'Waiting — you are #' + d.position + ' in queue.';
    });
    socket.on('queue:tick', function (d) {
      if (d.waited > 25 && d.waited % 20 < 5) els.searchSub.textContent = 'Still searching… ' + fmtTime(d.waited) + ' — invite a friend with a room code below 👇';
    });
    socket.on('queue:timeout', function (d) {
      leaveSearch(d.message || 'Search timed out.');
    });
    socket.on('queue:error', function (d) {
      leaveSearch(d.message || 'Could not start search.');
      toast(d.message || 'Could not start search.', 'bad');
    });
    socket.on('queue:left', function () { leaveSearch(); });
    socket.on('queue:auto', function () {
      if (S.autoNext) startSearch(); else leaveSearch();
    });

    socket.on('room:waiting', function (d) {
      enterSearching();
      els.searchSub.textContent = 'Room ' + d.code + ' created — waiting for your friend to join…';
      els.inviteMsg.innerHTML = 'Share this link: <b>' + esc(location.origin + d.link) + '</b> <button class="btn sm ghost" id="copyLink">copy</button>';
      var cbtn = document.getElementById('copyLink');
      if (cbtn) cbtn.addEventListener('click', function () {
        navigator.clipboard.writeText(location.origin + d.link).then(function () { toast('Invite link copied 📋'); });
      });
    });
    socket.on('invite:created', function (d) {
      els.inviteInput.value = d.code;
      els.inviteMsg.innerHTML = 'Share this link: <b>' + esc(location.origin + d.link) + '</b> <button class="btn sm ghost" id="copyLink2">copy</button>';
      var cbtn = document.getElementById('copyLink2');
      if (cbtn) cbtn.addEventListener('click', function () {
        navigator.clipboard.writeText(location.origin + d.link).then(function () { toast('Invite link copied 📋'); });
      });
      toast('Room ' + d.code + ' created — waiting for your friend 🤝');
    });

    socket.on('match:found', enterChat);

    socket.on('msg', function (d) {
      if (d.kind === 'media' && d.media) { renderMedia(false, d.media); notifyHidden('msg'); return; }
      renderText(d.text, false);
      notifyHidden('msg');
      els.typingBar.hidden = true;
    });
    socket.on('msg:ack', function (d) {
      var t = S.pendingMsgs[d.id];
      if (t) { t.hidden = false; delete S.pendingMsgs[d.id]; }
    });
    socket.on('msg:error', function (d) { toast(d.message || 'Message not sent', 'bad'); });
    socket.on('typing', function (d) {
      if (!S.inChat) return;
      els.typingBar.hidden = !d.on;
      if (d.on) scrollBottom();
    });

    /* --- call flow --- */
    socket.on('call:incoming', function (d) {
      els.icName.textContent = (d.from && d.from.nick ? d.from.nick : 'Stranger') + ' is calling…';
      els.incoming.hidden = false;
      ringLoop();
    });
    socket.on('call:start', function (d) {
      hideOverlay();
      var isInitiator = S.you && d.initiator === S.you.id;
      S.call.startedAt = Date.now();
      startCall(isInitiator);
    });
    socket.on('call:declined', function () {
      toast('Call declined 😕', 'warn');
      els.callBtn.disabled = false;
    });
    socket.on('call:ended', function (d) {
      teardownCall(false);
      if (d.duration) toast('Call ended — ' + fmtTime(d.duration) + ' 📞');
    });
    socket.on('call:error', function (d) { toast(d.message || 'Call failed', 'bad'); });
    socket.on('webrtc', onSignal);

    /* --- lifecycle --- */
    socket.on('peer:left', function (d) {
      var wasCall = S.call.active;
      exitChat();
      if (d.reason === 'blocked') {
        showOverlay('User blocked 🚫', 'They cannot be matched with you for 24 hours.', [
          { label: '🔍 Find someone new', fn: function () { startSearch(); } },
          { label: '🏠 Back', cls: 'ghost', fn: function () { leaveSearch(); } }
        ]);
      } else {
        showOverlay('Stranger left the chat', d.message || 'Your partner disconnected.', [
          { label: '🔍 Find someone new', fn: function () { startSearch(); } },
          { label: '🏠 Back', cls: 'ghost', fn: function () { leaveSearch(); } }
        ]);
      }
    });
    socket.on('kicked', function (d) {
      exitChat();
      showOverlay(d.banned ? 'Access blocked' : 'Removed by moderator', d.reason || '', [
        { label: 'OK', cls: 'ghost' }
      ]);
    });
    socket.on('server:reset', function () {
      exitChat();
      leaveSearch('Server was reset by admin.');
      toast('All chats were closed by the admin', 'warn');
    });
    socket.on('broadcast', function (d) {
      els.bannerText.textContent = d.text;
      els.banner.hidden = false;
      toast('📢 ' + d.text, '', 8000);
    });
    socket.on('admin:notice', function (d) {
      toast('🛡 Moderator: ' + d.text, 'warn', 8000);
    });
    socket.on('toast', function (d) { toast(d.text, d.kind === 'ok' ? 'ok' : 'bad'); });
  }

  /* ---------------- boot ---------------- */
  cacheEls();
  loadPrefs();
  bindUI();
  bindSocket();
  setConn('connecting…', false);
  show('setupPanel');
  refreshDayStats();
  setInterval(refreshDayStats, 12000);

  var mode = new URLSearchParams(location.search).get('mode');
  if (mode && ['text', 'voice', 'both'].indexOf(mode) > -1) setMode(mode);

  window.addEventListener('beforeunload', function () {
    if (S.call.pc) { try { S.call.pc.close(); } catch (_) {} }
  });
})();
