/* GOD'S WILL — service worker
   Push notifications (Instagram-style) + notification click handling.
   NOTE: no fetch caching on purpose — always serve fresh from the server. */

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

/* ---------- incoming push ---------- */
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { title: 'GOD\'S WILL', body: e.data ? e.data.text() : '' }; }

  var isCall = data.kind === 'call';
  var title = data.title || "GOD'S WILL";
  var options = {
    body: data.body || 'You have a new message 💬',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    tag: data.tag || 'gw-msg',
    renotify: true,
    data: { url: data.url || '/app' },
    vibrate: isCall ? [300, 120, 300, 120, 300] : [120, 60, 120],
    requireInteraction: !!isCall,
    silent: false,
    timestamp: Date.now()
  };
  if (isCall) options.actions = [{ action: 'open', title: '🎤 Answer' }];

  e.waitUntil((async function () {
    // if the app tab is open & visible, don't double-notify
    var clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < clientList.length; i++) {
      if (clientList[i].visibilityState === 'visible' && !isCall) return;
    }
    await self.registration.showNotification(title, options);
  })());
});

/* ---------- notification click → open / focus the app ---------- */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/app';
  e.waitUntil((async function () {
    var clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (var i = 0; i < clientList.length; i++) {
      var c = clientList[i];
      if ('focus' in c) {
        c.focus();
        if (c.url && c.url.indexOf('/app') === -1 && url === '/app') {
          try { c.navigate(url); } catch (_) {}
        }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

/* ---------- message from the page ---------- */
self.addEventListener('message', function (e) {
  if (e.data === 'gw-skip-waiting') self.skipWaiting();
});
