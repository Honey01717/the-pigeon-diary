/* GOD'S WILL — admin panel logic */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function toast(text, kind, ms) {
    var box = $('#toasts');
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = text;
    box.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, ms || 3800);
    setTimeout(function () { t.remove(); }, (ms || 3800) + 400);
  }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
  function setPath(o, p, v) {
    var ks = p.split('.');
    var cur = o;
    for (var i = 0; i < ks.length - 1; i++) {
      if (typeof cur[ks[i]] !== 'object' || cur[ks[i]] === null) cur[ks[i]] = {};
      cur = cur[ks[i]];
    }
    cur[ks[ks.length - 1]] = v;
  }
  var fmtAgo = function (t) {
    var s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    return Math.round(s / 3600) + 'h ago';
  };
  var fmtDur = function (s) { return Math.floor(s / 60) + 'm ' + Math.round(s % 60) + 's'; };

  var S = { settings: null, snapshot: null, socket: null, dirty: false, tab: 'dash', loggingIn: false };

  /* ---------------- login ---------------- */
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (S.loggingIn) return;
    S.loggingIn = true;
    $('#loginErr').textContent = '';
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#loginUser').value.trim(), password: $('#loginPass').value })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        S.loggingIn = false;
        if (!res.ok) {
          $('#loginErr').textContent = res.j.error === 'too_many_attempts' ? 'Too many attempts — try again in 10 minutes.' : 'Wrong username or password.';
          return;
        }
        enterPanel();
      })
      .catch(function () { S.loggingIn = false; $('#loginErr').textContent = 'Network error.'; });
  });

  function enterPanel() {
    $('#loginWrap').classList.add('hidden');
    $('#shell').classList.remove('hidden');
    fetch('/api/admin/snapshot').then(function (r) {
      if (r.status === 401) { location.reload(); return null; }
      return r.json();
    }).then(function (snap) {
      if (!snap) return;
      S.settings = snap.settings;
      S.snapshot = snap;
      fillForms();
      renderSnapshot(snap);
      connectSocket();
      setInterval(function () { refreshSide(); }, 30000);
    });
  }

  /* if cookie already valid, skip login */
  fetch('/api/admin/session').then(function (r) { if (r.ok) enterPanel(); }).catch(function () {});

  /* ---------------- tabs ---------------- */
  $$('.nav-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.nav-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      S.tab = b.dataset.tab;
      $$('[data-pane]').forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== S.tab); });
    });
  });

  /* ---------------- forms <-> settings ---------------- */
  function fieldGet(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.dataset.type === 'list') {
      return el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (el.tagName === 'SELECT') return el.value === 'true' ? true : el.value === 'false' ? false : el.value;
    if (el.type === 'number') {
      var n = Number(el.value);
      return isNaN(n) ? 0 : n;
    }
    return el.value;
  }
  function fieldSet(el, v) {
    if (el.type === 'checkbox') { el.checked = !!v; return; }
    if (el.dataset.type === 'list') { el.value = (v || []).join(', '); return; }
    if (el.tagName === 'SELECT') { el.value = String(!!v); return; }
    if (el.type === 'color') { el.value = v || '#6c5ce7'; return; }
    el.value = v == null ? '' : v;
  }
  function fillForms() {
    $$('[data-path]').forEach(function (el) { fieldSet(el, getPath(S.settings, el.dataset.path)); });
    markClean();
    applyPreview();
    renderBans();
  }
  function collectForms() {
    $$('[data-path]').forEach(function (el) { setPath(S.settings, el.dataset.path, fieldGet(el)); });
  }
  function markDirty() {
    if (!S.dirty) { S.dirty = true; $('#savebar').classList.add('show'); }
    applyPreview();
  }
  function markClean() { S.dirty = false; $('#savebar').classList.remove('show'); }

  document.addEventListener('input', function (e) {
    if (e.target.closest && e.target.closest('[data-path]')) markDirty();
  });
  document.addEventListener('change', function (e) {
    if (e.target.closest && e.target.closest('[data-path]')) markDirty();
  });

  function applyPreview() {
    var t = S.settings && S.settings.theme;
    if (!t) return;
    var r = document.documentElement.style;
    r.setProperty('--primary', t.primary || '#6c5ce7');
    r.setProperty('--accent', t.accent || '#00d4ff');
    var pv = $('#themePreview');
    if (pv) {
      pv.style.setProperty('--p1', t.primary || '#6c5ce7');
      pv.style.setProperty('--p2', t.accent || '#00d4ff');
      pv.style.borderRadius = Math.min(30, Number(t.radius) || 18) + 'px';
    }
    var nameEl = $('[data-pv="site.name"]');
    var tagEl = $('[data-pv="site.tagline"]');
    if (nameEl && S.settings.site) nameEl.textContent = S.settings.site.name;
    if (tagEl && S.settings.site) tagEl.textContent = S.settings.site.tagline;
  }

  /* ---------------- save ---------------- */
  $('#saveBtn').addEventListener('click', function () {
    collectForms();
    var btn = this;
    btn.disabled = true; btn.textContent = 'Saving…';
    fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: S.settings })
    }).then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false; btn.textContent = '💾 Save & apply live';
        if (j.ok) { markClean(); toast('Saved ✔ — live for all users', 'ok'); }
        else toast('Save failed: ' + (j.error || '?'), 'bad');
      })
      .catch(function () { btn.disabled = false; btn.textContent = '💾 Save & apply live'; toast('Network error', 'bad'); });
  });
  $('#discardBtn').addEventListener('click', function () {
    fetch('/api/admin/snapshot').then(function (r) { return r.json(); }).then(function (snap) {
      S.settings = snap.settings;
      fillForms();
      toast('Changes discarded');
    });
  });

  /* ---------------- broadcast ---------------- */
  $('#bcastSend').addEventListener('click', function () {
    var text = $('#bcastText').value.trim();
    if (!text) return;
    fetch('/api/admin/broadcast', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, persist: $('#bcastPin').checked })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { toast('Broadcast sent 📢', 'ok'); $('#bcastText').value = ''; }
      else toast('Failed', 'bad');
    });
  });

  /* ---------------- snapshot render ---------------- */
  function renderSnapshot(snap) {
    var st = snap.stats;
    var kpis = [
      ['Online now', st.online, 'ok'], ['Capacity', st.capacity, ''],
      ['In queue', st.inQueue, ''], ['Active chats', st.chats, ''],
      ['Voice calls', st.calls, 'ok'], ['Today sessions', st.today.sessions, ''],
      ['Today messages', st.today.msgs, ''], ['Today uploads', st.today.uploads, ''],
      ['Peak online', Math.max(st.peakOnline, st.online), 'warn'], ['Reports total', st.totals.reports, st.totals.reports > 0 ? 'bad' : ''],
      ['Push subscribers', st.pushSubs || 0, st.pushSubs ? 'ok' : ''],
      ['Media cache', st.mediaMB + ' MB', ''], ['Server RAM', st.memMB + ' MB', '']
    ];
    $('#kpiGrid').innerHTML = kpis.map(function (k) {
      return '<div class="kpi ' + (k[2] || '') + '"><b>' + esc(k[1]) + '</b><span>' + esc(k[0]) + '</span></div>';
    }).join('');

    // users table
    var rows = (snap.users || []).map(function (u) {
      var chip = u.state === 'chat' ? 'chat' : u.state === 'queued' ? 'queued' : u.state === 'idle' ? 'idle' : 'other';
      var peerMode = u.state === 'chat' ? (u.inCall ? '🎙 on call (' + fmtDur(u.callSec) + ') w/ ' + esc(u.peer || '?') : '💬 ' + esc(u.peer || '?')) : esc(u.mode || 'both');
      return '<tr>' +
        '<td class="nick">' + esc(u.nick) + '</td>' +
        '<td><span class="state-chip ' + chip + '">' + esc(u.state) + '</span></td>' +
        '<td>' + peerMode + '</td>' +
        '<td class="ip" title="full: ' + esc(u.ipFull) + '">' + esc(u.ip) + '</td>' +
        '<td>' + (u.msgs || 0) + '</td>' +
        '<td>' + (u.uploads || 0) + '</td>' +
        '<td>' + (u.reports || 0) + '</td>' +
        '<td><div class="rowacts">' +
          '<button class="btn ghost sm" data-act="msg" data-id="' + u.id + '" data-nick="' + esc(u.nick) + '">💬</button>' +
          (u.inCall ? '<button class="btn ghost sm" data-act="endcall" data-id="' + u.id + '" title="End call">📴</button>' : '') +
          '<button class="btn ghost sm" data-act="kick" data-id="' + u.id + '" data-nick="' + esc(u.nick) + '" title="Kick">🥾</button>' +
          '<button class="btn danger sm" data-act="ban" data-id="' + u.id + '" data-ip="' + esc(u.ipFull) + '" data-nick="' + esc(u.nick) + '" title="Ban IP">🚫</button>' +
        '</div></td></tr>';
    }).join('');
    $('#usersBody').innerHTML = rows || '<tr><td colspan="8" class="empty">No users online right now</td></tr>';
    $('#usersSub').textContent = (snap.users || []).length + ' connected • ' + st.chats + ' chats • ' + st.calls + ' calls';

    // rooms
    var rrows = (snap.rooms || []).map(function (r) {
      return '<tr><td>' + r.id.slice(0, 10) + '…</td><td>' + esc(r.type) + '</td><td>' + esc(r.members.join(' ↔ ')) + '</td><td>' + (r.call ? '🎙 yes' : '—') + '</td><td>' + fmtAgo(r.createdAt) + '</td></tr>';
    }).join('');
    $('#roomsBody').innerHTML = rrows || '<tr><td colspan="5" class="empty">No active rooms</td></tr>';

    // log
    var evs = (snap.events || []).map(function (ev) {
      return '<div class="ev ' + esc(ev.type) + '"><time>' + new Date(ev.t).toLocaleTimeString() + '</time><span class="t">' + esc(ev.type) + '</span><span>' + esc(ev.text) + '</span></div>';
    }).join('');
    var logBox = $('#logBox');
    var stick = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 40;
    logBox.innerHTML = evs || '<div class="empty">waiting for events…</div>';
    if (stick) logBox.scrollTop = logBox.scrollHeight;

    $('#sideUptime').textContent = 'uptime ' + fmtDur(Math.min(st.uptimeSec, 86400 * 30));
  }

  function refreshSide() {
    fetch('/api/admin/snapshot').then(function (r) { return r.ok ? r.json() : null; }).then(function (s) {
      if (s) { S.snapshot = s; renderSnapshot(s); }
    });
  }

  /* user actions (event delegation) */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act, id = b.dataset.id, nick = b.dataset.nick || '';
    if (act === 'msg') {
      var m = prompt('Message to ' + nick + ':');
      if (m == null || !m.trim()) return;
      post('/api/admin/message', { id: id, text: m });
    } else if (act === 'kick') {
      if (confirm('Kick ' + nick + '?')) post('/api/admin/kick', { id: id, reason: 'Kicked by admin' });
    } else if (act === 'ban') {
      if (confirm('Ban ' + nick + ' (IP ' + b.dataset.ip + ')? They will not be able to reconnect.')) {
        post('/api/admin/ban', { id: id, ip: b.dataset.ip, reason: 'Banned by admin' }).then(function () { renderBans(); });
      }
    } else if (act === 'endcall') {
      if (confirm('End the call of ' + nick + '?')) post('/api/admin/endcall', { id: id });
    }
  });

  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.ok) toast('Done ✔', 'ok');
        else toast('Failed: ' + (j.error || '?'), 'bad');
        refreshSide();
        return j;
      })
      .catch(function () { toast('Network error', 'bad'); });
  }

  /* ---------------- bans ---------------- */
  function renderBans() {
    var list = (S.settings && S.settings.moderation && S.settings.moderation.bannedIps) || [];
    $('#banCount').textContent = list.length + ' IPs banned';
    $('#banList').innerHTML = list.length
      ? list.map(function (ip) {
        return '<span style="display:inline-flex;align-items:center;gap:.4rem;background:var(--bg3);border:1px solid var(--border);border-radius:99px;padding:.35rem .5rem .35rem .8rem;font-size:.8rem">' + esc(ip) +
          ' <button class="btn ghost sm" data-unban="' + esc(ip) + '" title="Unban">✕</button></span>';
      }).join('')
      : '<div class="empty" style="padding:.4rem">No banned IPs</div>';
  }
  document.addEventListener('click', function (e) {
    var ub = e.target.closest && e.target.closest('[data-unban]');
    if (!ub) return;
    post('/api/admin/unban', { ip: ub.dataset.unban }).then(function () {
      // refresh settings for ban list
      fetch('/api/admin/snapshot').then(function (r) { return r.json(); }).then(function (s) { S.settings = s.settings; renderBans(); });
    });
  });
  $('#banAddBtn').addEventListener('click', function () {
    var ip = $('#banIpInput').value.trim();
    if (!ip) return;
    post('/api/admin/ban', { ip: ip }).then(function (j) {
      if (j.ok) {
        S.settings.moderation.bannedIps = j.bannedIps || S.settings.moderation.bannedIps;
        renderBans();
        $('#banIpInput').value = '';
      }
    });
  });

  /* ---------------- push test ---------------- */
  $('#pushTestBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch('/api/admin/push-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        btn.disabled = false; btn.textContent = '🔔 Send test notification';
        if (j.ok) toast('Test notification sent to ' + (j.sent || 0) + ' phone(s) 📲', 'ok');
        else toast(j.error === 'push_disabled' ? 'Push notifications are OFF — pehle enable karein aur Save dabayein' : 'Failed', 'bad', 6000);
      })
      .catch(function () { btn.disabled = false; btn.textContent = '🔔 Send test notification'; toast('Network error', 'bad'); });
  });

  /* ---------------- security ---------------- */
  $('#pwBtn').addEventListener('click', function () {
    var cur = $('#pwCurrent').value, nx = $('#pwNext').value, user = $('#pwUser').value.trim();
    if (!cur || !nx) { toast('Fill current + new password', 'warn'); return; }
    if (nx.length < 6) { toast('New password must be 6+ chars', 'warn'); return; }
    fetch('/api/admin/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: cur, next: nx, username: user })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) { toast('Credentials updated — redirecting to login…', 'ok'); setTimeout(function () { location.reload(); }, 1500); }
      else toast(j.error === 'wrong_password' ? 'Current password is wrong' : 'Update failed', 'bad');
    });
  });

  $('#exportBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(S.settings, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'godswill-settings-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#importFile').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    if (!confirm('Import settings from ' + f.name + '? Current settings will be replaced (password stays).')) { this.value = ''; return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var obj = JSON.parse(fr.result);
        fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: obj }) })
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.ok) { toast('Imported ✔ refreshing…', 'ok'); setTimeout(function () { location.reload(); }, 900); }
            else toast('Import failed', 'bad');
          });
      } catch (e) { toast('Not a valid JSON file', 'bad'); }
    };
    fr.readAsText(f);
    this.value = '';
  });

  /* ---------------- danger zone ---------------- */
  function endAll() {
    if (confirm('Close ALL chats & calls and empty the queue? Users will see "chat ended".')) {
      post('/api/admin/end-all', {}).then(function () { toast('All rooms closed', 'ok'); });
    }
  }
  $('#endAllBtn').addEventListener('click', endAll);
  $('#endAllBtn2').addEventListener('click', endAll);
  $('#resetStatsBtn').addEventListener('click', function () {
    if (confirm('Reset ALL statistics (sessions, messages, calls, uploads)? This cannot be undone.')) {
      post('/api/admin/reset-stats', {});
    }
  });

  /* ---------------- realtime socket ---------------- */
  function connectSocket() {
    var socket = io({ transports: ['polling', 'websocket'] });
    S.socket = socket;
    socket.on('connect', function () { socket.emit('admin:auth', {}); });
    socket.on('admin:snapshot', function (snap) {
      S.snapshot = snap;
      renderSnapshot(snap);
      if (!S.dirty) { S.settings = snap.settings; fillForms(); }
    });
    socket.on('admin:event', function () { /* next snapshot covers it */ });
    socket.on('admin:denied', function () {
      // cookie expired mid-session
      socket.close();
    });
  }

  window.addEventListener('beforeunload', function (e) {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
