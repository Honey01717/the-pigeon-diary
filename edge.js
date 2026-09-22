/**
 * GOD'S WILL — edge-case tests (run after smoke.js, server on :3000)
 * Covers: moderation filters, feature toggles, rate limits, maintenance,
 * room busy guard, media ownership, queue timeout, export secrecy, ip limit.
 */
'use strict';
const io = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let passed = 0, failed = 0;
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✔', name); }
  else { failed++; console.log('  ✘', name, extra === undefined ? '' : '— ' + JSON.stringify(extra)); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wait(socket, event, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + event)), ms || 4000);
    socket.once(event, (d) => { clearTimeout(t); resolve(d); });
  });
}

async function adminLogin() {
  const r = await fetch(BASE + '/api/admin/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'godswill123' })
  });
  return (r.headers.get('set-cookie') || '').split(';')[0];
}
async function putSettings(cookie, patch) {
  const r = await fetch(BASE + '/api/admin/settings', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ settings: patch })
  });
  return r.json();
}
async function pair(A, B) {
  A.emit('queue:find', { mode: 'text' });
  B.emit('queue:find', { mode: 'text' });
  const [mA, mB] = await Promise.all([wait(A, 'match:found'), wait(B, 'match:found')]);
  return [mA, mB];
}

async function main() {
  console.log('GOD\'S WILL edge tests →', BASE, '\n');
  const cookie = await adminLogin();
  ok('admin login', !!cookie);
  const saved = await (await fetch(BASE + '/api/admin/snapshot', { headers: { cookie } })).json();
  const S0 = saved.settings;

  /* ---- profanity + link masking ---- */
  console.log('[1] moderation filters');
  await putSettings(cookie, { moderation: { profanityFilter: true, bannedWords: ['badword'], allowLinks: false } });
  const A = io(BASE, { transports: ['websocket'] });
  const B = io(BASE, { transports: ['websocket'] });
  await wait(A, 'welcome'); await wait(B, 'welcome');
  const [mA] = await pair(A, B);
  A.emit('msg', { kind: 'text', text: 'you are a badword and visit http://evil.example.com now' });
  const got = await wait(B, 'msg');
  ok('profanity masked', /badword/i.test(got.text) === false && /\*+/.test(got.text), got.text);
  ok('link masked', /evil\.example\.com/.test(got.text) === false, got.text);
  await putSettings(cookie, { moderation: { profanityFilter: true, bannedWords: S0.moderation.bannedWords, allowLinks: true } });
  A.emit('msg', { kind: 'text', text: 'check https://example.com' });
  const got2 = await wait(B, 'msg');
  ok('links pass when allowed', got2.text.includes('https://example.com'), got2.text);

  /* ---- rate limit ---- */
  console.log('[2] message rate limit');
  let rateErrors = 0;
  A.on('msg:error', () => rateErrors++);
  for (let i = 0; i < 45; i++) A.emit('msg', { kind: 'text', text: 'spam ' + i });
  await sleep(700);
  ok('rate limit kicks in (>40/min)', rateErrors >= 1, { rateErrors });

  /* ---- media ownership ---- */
  console.log('[3] media ownership');
  let badMedia = 0;
  B.on('msg:error', () => badMedia++);
  B.emit('msg', { kind: 'media', id: 'nonexistent-id-xyz' });
  await sleep(300);
  ok('bogus media id rejected', badMedia >= 1);

  /* ---- room busy guard ---- */
  console.log('[4] room:join busy guard');
  let busyErr = null;
  A.on('queue:error', (e) => { busyErr = e; });
  A.emit('room:join', { code: 'TEST1' });
  await sleep(300);
  ok('cannot join room while in chat', busyErr && busyErr.error === 'busy', busyErr);
  A.close(); B.close();
  await sleep(400);

  /* ---- feature toggles enforced ---- */
  console.log('[5] feature toggles');
  await putSettings(cookie, { features: { chatDuringCall: false, typingIndicator: false } });
  const C = io(BASE, { transports: ['websocket'] });
  const D = io(BASE, { transports: ['websocket'] });
  await wait(C, 'welcome'); await wait(D, 'welcome');
  await pair(C, D);
  C.emit('call:invite');
  await wait(D, 'call:incoming');
  D.emit('call:accept');
  await Promise.all([wait(C, 'call:start'), wait(D, 'call:start')]);
  let chatErr = null;
  C.on('msg:error', (e) => { chatErr = e; });
  C.emit('msg', { kind: 'text', text: 'during call' });
  await sleep(300);
  ok('chat during call blocked when disabled', chatErr && chatErr.error === 'disabled', chatErr);
  let typingRelayed = false;
  D.on('typing', () => typingRelayed = true);
  C.emit('typing', { on: true });
  await sleep(300);
  ok('typing not relayed when disabled', typingRelayed === false);
  C.emit('call:end');
  await wait(D, 'call:ended');
  // chat works again after call ends
  chatErr = null;
  C.emit('msg', { kind: 'text', text: 'after call ok' });
  const afterMsg = await wait(D, 'msg');
  ok('chat works after call ended', afterMsg.text === 'after call ok' && !chatErr);
  await putSettings(cookie, { features: { chatDuringCall: true, typingIndicator: true } });
  C.close(); D.close();
  await sleep(400);

  /* ---- queue timeout (set to 1s) ---- */
  console.log('[6] queue timeout');
  await putSettings(cookie, { limits: { queueTimeoutSec: 1 } });
  const E = io(BASE, { transports: ['websocket'] });
  await wait(E, 'welcome');
  E.emit('queue:find', { mode: 'text' });
  const tmo = await wait(E, 'queue:timeout', 8000);
  ok('queue timeout fires', tmo && tmo.message);
  E.close();
  await putSettings(cookie, { limits: { queueTimeoutSec: S0.limits.queueTimeoutSec } });

  /* ---- maintenance mode ---- */
  console.log('[7] maintenance mode');
  await putSettings(cookie, { security: { maintenance: true, maintenanceMessage: 'test mt' } });
  const F = io(BASE, { transports: ['websocket'] });
  await wait(F, 'welcome');
  F.emit('queue:find', { mode: 'text' });
  const mErr = await wait(F, 'queue:error');
  ok('queue rejected in maintenance', mErr.error === 'maintenance' && mErr.message === 'test mt', mErr);
  F.close();
  await putSettings(cookie, { security: { maintenance: false } });

  /* ---- text chat disabled ---- */
  await putSettings(cookie, { features: { textChat: false } });
  const G = io(BASE, { transports: ['websocket'] });
  await wait(G, 'welcome');
  G.emit('queue:find', { mode: 'text' });
  const tErr = await wait(G, 'queue:error');
  ok('text mode rejected when disabled', tErr.error === 'text_disabled', tErr);
  G.close();
  await putSettings(cookie, { features: { textChat: true } });

  /* ---- export has no secrets ---- */
  console.log('[8] export secrecy');
  const exp = await (await fetch(BASE + '/api/admin/export', { headers: { cookie } })).json();
  ok('export: no sessionSecret', exp.security && exp.security.sessionSecret === undefined);
  ok('export: no adminHash', exp.security && exp.security.adminHash === undefined);
  ok('export: no vapidPrivate', exp.push && exp.push.vapidPrivate === undefined);

  /* ---- per-IP limit ---- */
  console.log('[9] per-IP connection limit (max ' + S0.limits.maxPerIp + ')');
  const socks = [];
  for (let i = 0; i < 5; i++) {
    const s = io(BASE, { transports: ['websocket'] });
    socks.push(s);
    await wait(s, 'welcome');
  }
  let ipErr = null;
  socks[4].on('queue:error', (e) => { ipErr = e; });
  socks[4].emit('queue:find', { mode: 'text' });
  await sleep(400);
  ok('5th connection from same IP rejected in queue', ipErr && ipErr.error === 'ip_limit', ipErr);
  socks.forEach((s) => s.close());
  await sleep(400);

  /* ---- banned word in nickname ---- */
  console.log('[10] nickname sanitisation');
  await putSettings(cookie, { moderation: { bannedWords: ['badword'] } });
  const H = io(BASE, { transports: ['websocket'] });
  await wait(H, 'welcome');
  H.emit('nick:set', { nick: '<script>badword</script>' });
  const upd = await wait(H, 'you:update');
  ok('nick stripped + filtered', !/[<>\/]/.test(upd.nick) && !/badword/i.test(upd.nick), upd.nick);
  H.close();
  await putSettings(cookie, { moderation: { bannedWords: S0.moderation.bannedWords } });

  /* ---- restore original settings ---- */
  await putSettings(cookie, S0);
  const snap2 = await (await fetch(BASE + '/api/admin/snapshot', { headers: { cookie } })).json();
  ok('settings restored', snap2.settings.features.chatDuringCall === true && snap2.settings.limits.queueTimeoutSec === S0.limits.queueTimeoutSec && Array.isArray(snap2.settings.moderation.bannedWords) && snap2.settings.moderation.bannedWords.length === S0.moderation.bannedWords.length);

  console.log('\n──────────────────────────────');
  console.log(' PASSED:', passed, ' FAILED:', failed);
  console.log('──────────────────────────────');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('EDGE TEST CRASHED:', e); process.exit(1); });
