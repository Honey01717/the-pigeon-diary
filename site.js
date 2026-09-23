/* GOD'S WILL — landing page logic: live settings, theme, stats, reveals */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------- theme ---------- */
  var savedTheme = localStorage.getItem('gw_theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  function applyTheme(t) {
    if (!t) return;
    var r = document.documentElement;
    if (t.primary) r.style.setProperty('--primary', t.primary);
    if (t.primary2) r.style.setProperty('--primary-2', t.primary2);
    if (t.accent) r.style.setProperty('--accent', t.accent);
    if (t.radius != null) r.style.setProperty('--radius', t.radius + 'px');
    if (t.customCss) {
      var tag = document.getElementById('gwCustomCss') || document.createElement('style');
      tag.id = 'gwCustomCss';
      tag.textContent = t.customCss;
      document.head.appendChild(tag);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.primary) meta.setAttribute('content', t.primary);
    if (t.glow === false) document.documentElement.style.setProperty('--glow', 'none');
  }

  function autoTheme() {
    if (localStorage.getItem('gw_theme')) return;
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  autoTheme();

  $('#themeToggle').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem('gw_theme', cur);
    this.textContent = cur === 'light' ? '☀️' : '🌙';
  });
  $('#themeToggle').textContent = document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙';

  /* ---------- nav ---------- */
  var nav = $('#nav');
  var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var links = $('#navLinks'), hamb = $('#hamb');
  hamb.addEventListener('click', function () { links.classList.toggle('open'); });
  $$('#navLinks a').forEach(function (a) { a.addEventListener('click', function () { links.classList.remove('open'); }); });

  /* ---------- reveal on scroll ---------- */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  $$('.reveal').forEach(function (el) { io.observe(el); });

  /* ---------- toast ---------- */
  window.gwToast = function (text, soft) {
    var box = $('#toasts');
    var el = document.createElement('div');
    el.className = 'toast' + (soft ? ' soft' : '');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 4600);
    setTimeout(function () { el.remove(); }, 5000);
  };

  /* ---------- settings + stats ---------- */
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a && a[k]; }, o); }

  function renderSite(s) {
    if (!s) return;
    $$('[data-gw]').forEach(function (el) {
      var v = getPath(s, el.getAttribute('data-gw'));
      if (typeof v === 'string' && v) el.textContent = v;
    });
    document.title = s.site.name + ' — Talk to Strangers Online | Free Random Voice & Text Chat';
    if (s.site.about) {
      var ab = $('[data-gw="site.aboutShort"]');
      if (ab) ab.textContent = s.site.about.length > 160 ? s.site.about.slice(0, 155) + '…' : s.site.about;
    }
    // announcement bar
    if (s.site.announcementEnabled && s.site.announcement && !sessionStorage.getItem('gw_announce_off')) {
      $('#announceText').textContent = s.site.announcement;
      $('#announce').hidden = false;
    }
    // socials
    var soc = [];
    if (s.site.facebook) soc.push(['Facebook', 'f', s.site.facebook]);
    if (s.site.instagram) soc.push(['Instagram', '📷', s.site.instagram]);
    if (s.site.reddit) soc.push(['Reddit', '👽', s.site.reddit]);
    if (s.site.x) soc.push(['X', '𝕏', s.site.x]);
    var box = $('#socials');
    box.innerHTML = '';
    soc.forEach(function (row) {
      var a = document.createElement('a');
      a.href = row[2]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = row[0]; a.textContent = row[1];
      box.appendChild(a);
    });
    var mail = $('#mailLink');
    if (mail && s.site.supportEmail) mail.href = 'mailto:' + s.site.supportEmail;
    applyTheme(s.theme);

    // capacity hint in hero
    if (s.limits && s.limits.maxOnline) $('#statCapacity').textContent = s.limits.maxOnline;
    if (s.maintenance && s.maintenance.on) {
      gwToast('⚠️ ' + (s.maintenance.message || 'Maintenance mode is on'));
    }
  }

  function refreshStats() {
    fetch('/api/public/stats', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        $('#statOnline').textContent = d.online;
        $('#statChats').textContent = d.chats;
        $('#statCalls').textContent = d.calls;
        $('#statCapacity').textContent = d.capacity;
      })
      .catch(function () {});
  }

  function loadSettings() {
    fetch('/api/public/settings', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(renderSite)
      .catch(function () {});
  }

  $('#announceClose').addEventListener('click', function () {
    $('#announce').hidden = true;
    sessionStorage.setItem('gw_announce_off', '1');
  });

  /* live-ish stats: poll every 8s, plus socket presence if available */
  refreshStats();
  setInterval(refreshStats, 8000);

  loadSettings();
  setInterval(loadSettings, 60000);

  /* hero phone timer eye-candy */
  var t = 14, timer = $('#phTimer');
  setInterval(function () { t = t >= 59 ? 5 : t + 1; timer.textContent = '00:' + String(t).padStart(2, '0'); }, 1000);

  $('#year').textContent = new Date().getFullYear();

  /* register service worker (enables PWA install + push notifications) */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  }
})();
