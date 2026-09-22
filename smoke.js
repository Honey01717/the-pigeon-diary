/**
 * GOD'S WILL — smoke test
 * Run the server first (npm start), then: node test/smoke.js
 * Verifies: pages, public API, admin auth, matchmaking, messaging,
 * media upload (image + voice note), call signaling, settings update.
 */
'use strict';
const io = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'godswill123';

let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✔', name); }
  else { failed++; console.log('  ✘', name, extra === undefined ? '' : '— ' + JSON.stringify(extra)); }
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function waitFor(socket, event, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout waiting ' + event)), ms || 4000);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });
}

async function main() {
  console.log('GOD\'S WILL smoke test →', BASE, '\n');

  /* ---------- pages ---------- */
  console.log('[1] pages & public api');
  let r = await fetch(BASE + '/');
  ok('landing 200', r.status === 200);
  let html = await r.text();
  ok('landing has branding', html.includes("GOD'S WILL"));

  r = await fetch(BASE + '/app');
  ok('app 200', r.status === 200);
  r = await fetch(BASE + '/admin');
  ok('admin 200', r.status === 200);

  r = await fetch(BASE + '/api/health');
  ok('health ok', (await r.json()).ok === true);

  r = await fetch(BASE + '/api/public/settings');
  let pub = await r.json();
  ok('public settings site.name', pub && pub.site && typeof pub.site.name === 'string');
  ok('public settings limits.maxImageMB = 20', pub.limits.maxImageMB === 20);
  ok('public settings ice servers', Array.isArray(pub.ice) && pub.ice.length >= 1);
  ok('public settings push key', typeof pub.push.vapidPublicKey === 'string' && pub.push.vapidPublicKey.length > 20);

  /* ---------- PWA / notifications ---------- */
  console.log('[1b] pwa & push');
  r = await fetch(BASE + '/sw.js');
  const swText = await r.text();
  ok('service worker served', r.status === 200 && swText.includes("addEventListener('push'"));
  r = await fetch(BASE + '/manifest.json');
  const manifest = await r.json();
  ok('manifest served', r.status === 200 && manifest.name.includes("GOD'S WILL"));
  r = await fetch(BASE + '/assets/icon-192.png');
  ok('pwa icon 192 served', r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'));
  r = await fetch(BASE + '/assets/icon-512.png');
  ok('pwa icon 512 served', r.status === 200);
  r = await fetch(BASE + '/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/SMOKE-TEST', keys: { p256dh: 'AAAABBBBCCCC', auth: 'DDDD' } } })
  });
  ok('push subscribe accepted', r.status === 200 && (await r.json()).ok === true);
  r = await fetch(BASE + '/api/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: { endpoint: 'nope' } })
  });
  ok('bad push subscription rejected', r.status === 400);

  /* ---------- admin ---------- */
  console.log('[2] admin api');
  r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: 'wrong' }) });
  ok('wrong password rejected', r.status === 401);

  r = await fetch(BASE + '/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }) });
  ok('admin login ok', r.status === 200);
  const cookie = (r.headers.get('set-cookie') || '').split(';')[0];

  r = await fetch(BASE + '/api/admin/snapshot', { headers: { cookie } });
  ok('snapshot with cookie', r.status === 200);
  let snap = await r.json();
  ok('snapshot has settings + users', snap.settings && Array.isArray(snap.users));

  r = await fetch(BASE + '/api/admin/snapshot');
  ok('snapshot without cookie rejected', r.status === 401);

  // settings update round-trip
  r = await fetch(BASE + '/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ settings: { site: { name: 'TEST SITE' }, limits: { maxOnline: 77 } } })
  });
  ok('settings PUT ok', (await r.json()).ok === true);
  pub = await (await fetch(BASE + '/api/public/settings')).json();
  ok('settings applied live (name)', pub.site.name === 'TEST SITE');
  ok('settings applied live (capacity)', pub.limits.maxOnline === 77);
  await fetch(BASE + '/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ settings: { site: { name: "GOD'S WILL" }, limits: { maxOnline: 100 } } })
  });

  // push test notification (fake sub will be cleaned up by the push service error handler)
  r = await fetch(BASE + '/api/admin/push-test', { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: '{}' });
  ok('admin push-test ok', (await r.json()).ok === true);

  /* ---------- realtime: match, chat, media, call ---------- */
  console.log('[3] realtime flow (two socket clients)');
  const A = io(BASE, { transports: ['websocket'] });
  const B = io(BASE, { transports: ['websocket'] });
  const wA = waitFor(A, 'welcome'), wB = waitFor(B, 'welcome');
  const [wa, wb] = await Promise.all([wA, wB]);
  ok('both clients welcomed', !!wa.you && !!wb.you);
  ok('welcome includes settings', !!wa.settings && !!wa.settings.ice);

  A.emit('nick:set', { nick: 'TesterA' });
  B.emit('nick:set', { nick: 'TesterB' });
  await sleep(150);

  A.emit('queue:find', { mode: 'both', tags: ['Music'] });
  B.emit('queue:find', { mode: 'both', tags: ['Music'] });
  const [mA, mB] = await Promise.all([waitFor(A, 'match:found'), waitFor(B, 'match:found')]);
  ok('both matched', mA.peer && mB.peer && mA.peer.id === mB.you.id);
  ok('common tags detected', (mA.commonTags || []).includes('Music'));

  // text message
  const bMsg = waitFor(B, 'msg');
  A.emit('msg', { kind: 'text', text: 'hello from A 👋' });
  const got = await bMsg;
  ok('text relayed A→B', got.text === 'hello from A 👋' && got.from === mA.you.id);
  const ack = await waitFor(A, 'msg:ack');
  ok('sender got ack', !!ack.id);

  // typing
  const bTyping = waitFor(B, 'typing');
  A.emit('typing', { on: true });
  ok('typing relayed', (await bTyping).on === true);

  // image upload (1x1 png)
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData();
  fd.append('kind', 'image');
  fd.append('file', new Blob([png], { type: 'image/png' }), 'test.png');
  r = await fetch(BASE + '/api/upload?sid=' + A.id, { method: 'POST', body: fd });
  const up = await r.json();
  ok('image upload accepted', r.status === 200 && !!up.id, up);
  r = await fetch(BASE + up.url);
  ok('image servable', r.status === 200 && (r.headers.get('content-type') || '').includes('image/png'));

  const bMedia = waitFor(B, 'msg');
  A.emit('msg', { kind: 'media', id: up.id, w: 1, h: 1 });
  const mediaMsg = await bMedia;
  ok('media message relayed', mediaMsg.kind === 'media' && mediaMsg.media.url === up.url);

  // voice-note style upload (tiny fake webm)
  const fd2 = new FormData();
  fd2.append('kind', 'voice');
  fd2.append('file', new Blob([Buffer.alloc(2048)], { type: 'audio/webm' }), 'voice.webm');
  r = await fetch(BASE + '/api/upload?sid=' + A.id, { method: 'POST', body: fd2 });
  ok('voice upload accepted', r.status === 200);

  // oversized image rejected (21MB limit test at limit=20)
  const big = new Uint8Array(21 * 1024 * 1024);
  const fd3 = new FormData();
  fd3.append('kind', 'image');
  fd3.append('file', new Blob([big], { type: 'image/png' }), 'big.png');
  r = await fetch(BASE + '/api/upload?sid=' + A.id, { method: 'POST', body: fd3 });
  ok('21MB image rejected with too_large', r.status === 413 && (await r.json()).error === 'too_large');

  // call signaling
  const bIncoming = waitFor(B, 'call:incoming');
  A.emit('call:invite');
  await bIncoming;
  ok('call:incoming delivered', true);
  const [csA, csB] = await Promise.all([waitFor(A, 'call:start'), (B.emit('call:accept'), waitFor(B, 'call:start'))]);
  ok('call started both sides', !!csA.startedAt && !!csB.startedAt);

  const bSig = waitFor(B, 'webrtc');
  A.emit('webrtc', { type: 'offer', sdp: { type: 'offer', sdp: 'v=0 test' } });
  await bSig;
  ok('webrtc signal relayed', true);

  const bEnded = waitFor(B, 'call:ended');
  A.emit('call:end');
  await bEnded;
  ok('call ended both sides', true);

  // report + block flow
  const bToast = waitFor(B, 'toast');
  B.emit('report', { reason: 'smoke test' });
  const t = await bToast;
  ok('report acknowledged', /Report sent/.test(t.text));

  const bLeft = waitFor(B, 'peer:left');
  A.emit('block');
  await bLeft;
  ok('block closes chat for peer', true);

  A.close(); B.close();
  await sleep(300);

  /* ---------- summary ---------- */
  console.log('\n──────────────────────────────');
  console.log(' PASSED:', passed, ' FAILED:', failed);
  console.log('──────────────────────────────');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });
