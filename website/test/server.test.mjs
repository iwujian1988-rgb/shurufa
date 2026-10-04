import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp, hashCode } from '../server.mjs';
const CODE = 'CB-ABCDEF-GHJKLM-NPQRST-UVWXYZ';
const content = Buffer.from(Array.from({ length: 16384 }, (_, i) => i % 256));
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'ciban-once-test-'));
  await mkdir(path.join(root, 'artifacts'));
  await writeFile(path.join(root, 'codes.json'), JSON.stringify([{ id: '001', hash: hashCode(CODE), revoked: false }]));
  await writeFile(path.join(root, 'release.json'), JSON.stringify({ version: 'test', artifacts: ['english', 'french', 'source'].map(id => ({ id, filename: id + '.bin', bytes: content.length })) }));
  for (const id of ['english', 'french', 'source']) await writeFile(path.join(root, 'artifacts', id + '.bin'), content);
  let time = Date.now(), server, url;
  async function start() { server = await createApp({ privateDir: root, now: () => time }); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); url = `http://127.0.0.1:${server.address().port}/ciban/`; }
  async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await start();
  t.after(async () => { await stop(); if (!root.startsWith(path.join(tmpdir(), 'ciban-once-test-'))) throw new Error('Unexpected cleanup path'); await rm(root, { recursive: true }); });
  const request = (p, o = {}) => fetch(url + p, o);
  const unlock = (code = CODE, headers = {}, cookie = '') => request('api/unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://maxnote.top', ...headers, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify({ code }) });
  const cookie = r => r.headers.get('set-cookie')?.split(';')[0];
  const get = (id, c, o = {}) => request('download/' + id, { ...o, headers: { Cookie: c, ...o.headers } });
  const session = async c => (await request('api/session', { headers: { Cookie: c } })).json();
  return { root, request, unlock, cookie, get, session, restart: async () => { await stop(); await start(); }, advance: ms => time += ms };
}
test('public page has security headers; unauthorized GET/HEAD/Range cannot download', async t => {
  const f = await fixture(t), r = await f.request(''); assert.equal(r.status, 200); assert.match(await r.text(), /词伴/); assert.equal(r.headers.get('referrer-policy'), 'no-referrer'); assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  for (const id of ['english', 'french', 'source']) for (const method of ['GET', 'HEAD']) assert.equal((await f.get(id, '', { method, headers: { Range: 'bytes=0-10' } })).status, 403);
});
test('private, guessed and query-code paths cannot bypass authorization', async t => {
  const f = await fixture(t); for (const p of ['private/codes.json', 'private/state/redemptions.json', 'private/owner-codes.json', 'ciban-english-demo.apk', 'download/english?code=' + CODE, '%2e%2e/server.mjs']) assert.ok([403, 404].includes((await f.request(p)).status));
});
test('invalid code, foreign Origin and malformed JSON are rejected', async t => {
  const f = await fixture(t); assert.equal((await f.unlock('bad')).status, 403); assert.equal((await f.unlock(CODE, { Origin: 'https://evil.example' })).status, 403); assert.equal((await f.request('api/unlock', { method: 'POST', headers: { Origin: 'https://maxnote.top', 'Content-Type': 'application/json' }, body: '{' })).status, 400);
});
test('verification does not consume; Cookie remains Secure, HttpOnly, scoped', async t => {
  const f = await fixture(t), r = await f.unlock('  ' + CODE.toLowerCase() + '  '); assert.equal(r.status, 200); for (const s of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/ciban/']) assert.ok(r.headers.get('set-cookie').includes(s)); assert.equal((await f.unlock()).status, 200); assert.deepEqual(JSON.parse(await readFile(path.join(f.root, 'state/redemptions.json'))).redemptions, {});
});
test('HEAD, invalid ranges and unknown files do not consume', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); assert.equal((await f.get('english', c, { method: 'HEAD' })).status, 200); for (const Range of ['bytes=999999-', 'bytes=20-10', 'bytes=0-1,5-6', 'bytes=-0']) assert.equal((await f.get('english', c, { headers: { Range } })).status, 416); assert.equal((await f.get('unknown', c)).status, 404); assert.equal((await f.session(c)).authorized, true);
});
test('English download consumes exactly once and blocks both APKs and re-verification', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()), r = await f.get('english', c); assert.equal(r.status, 200); assert.deepEqual(Buffer.from(await r.arrayBuffer()), content); assert.match(r.headers.get('content-disposition'), /attachment/); for (const id of ['english', 'french']) assert.equal((await f.get(id, c)).status, 410); assert.equal((await f.unlock()).status, 410); assert.equal((await f.session(c)).authorized, false);
});
test('French can be selected as the single APK', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); await (await f.get('french', c)).arrayBuffer(); assert.equal((await f.get('english', c)).status, 410);
});
test('two browsers racing the same code receive only one APK', async t => {
  const f = await fixture(t), a = f.cookie(await f.unlock()), b = f.cookie(await f.unlock()); const responses = await Promise.all([f.get('english', a), f.get('french', b)]); assert.deepEqual(responses.map(r => r.status).sort(), [200, 410]); for (const r of responses) await r.arrayBuffer();
});
test('resume binds original browser/file and completion blocks Range replay', async t => {
  const f = await fixture(t), a = f.cookie(await f.unlock()), b = f.cookie(await f.unlock()); const r = await f.get('english', a, { headers: { Range: 'bytes=0-1023' } }); assert.equal(r.status, 206); assert.equal((await r.arrayBuffer()).byteLength, 1024);
  assert.equal((await f.get('english', a)).status, 410); assert.equal((await f.get('english', a, { headers: { Range: 'bytes=0-' } })).status, 410); assert.equal((await f.get('english', b, { headers: { Range: 'bytes=1024-' } })).status, 410); assert.equal((await f.get('french', a, { headers: { Range: 'bytes=1024-' } })).status, 410);
  const tail = await f.get('english', a, { headers: { Range: 'bytes=1024-' } }); assert.equal(tail.status, 206); assert.deepEqual(Buffer.from(await tail.arrayBuffer()), content.subarray(1024)); for (let i = 0; i < 20 && (await f.session(a)).resumable; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert.equal((await f.get('english', a, { headers: { Range: 'bytes=1024-' } })).status, 410);
});
test('redemption and original-browser resume persist across restart', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); await (await f.get('english', c, { headers: { Range: 'bytes=0-1023' } })).arrayBuffer(); await f.restart(); assert.equal((await f.unlock()).status, 410); assert.equal((await f.session(c)).resumable, true); const r = await f.get('english', c, { headers: { Range: 'bytes=1024-' } }); assert.equal(r.status, 206); await r.arrayBuffer(); await f.restart(); assert.equal((await f.unlock()).status, 410); assert.equal((await f.get('english', c)).status, 410);
});
test('expiry cannot reactivate used codes; unused codes survive expiry and restart', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); f.advance(31 * 60 * 1000); await f.restart(); assert.equal((await f.unlock()).status, 200); const fresh = f.cookie(await f.unlock()); await (await f.get('english', fresh, { headers: { Range: 'bytes=0-1023' } })).arrayBuffer(); f.advance(31 * 60 * 1000); assert.equal((await f.get('english', fresh, { headers: { Range: 'bytes=1024-' } })).status, 403); assert.equal((await f.unlock()).status, 410); assert.equal((await f.get('english', c)).status, 403);
});
test('source does not consume APK quota and stays obtainable using consumed code', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); await (await f.get('source', c)).arrayBuffer(); assert.equal((await f.session(c)).authorized, true); await (await f.get('english', c)).arrayBuffer(); f.advance(31 * 60 * 1000); const used = await f.unlock(); assert.equal(used.status, 410); assert.equal((await used.json()).sourceAuthorized, true); const receipt = f.cookie(used); assert.equal((await f.get('source', receipt)).status, 200); assert.equal((await f.get('english', receipt)).status, 410);
});
test('revocation works and restoring a code never erases its consumption', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()), table = [{ id: '001', hash: hashCode(CODE), revoked: true }]; await writeFile(path.join(f.root, 'codes.json'), JSON.stringify(table)); assert.equal((await f.get('english', c)).status, 403); assert.equal((await f.unlock()).status, 403); table[0].revoked = false; await writeFile(path.join(f.root, 'codes.json'), JSON.stringify(table)); await (await f.get('english', c)).arrayBuffer(); table[0].revoked = true; await writeFile(path.join(f.root, 'codes.json'), JSON.stringify(table)); table[0].revoked = false; await writeFile(path.join(f.root, 'codes.json'), JSON.stringify(table)); assert.equal((await f.unlock()).status, 410);
});
test('missing/corrupt required ledger fails closed', async t => {
  const f = await fixture(t); await assert.rejects(createApp({ privateDir: f.root, stateDir: path.join(f.root, 'missing-state'), requireExisting: true })); await writeFile(path.join(f.root, 'state/redemptions.json'), '{bad'); await assert.rejects(createApp({ privateDir: f.root, requireExisting: true }));
});
test('tampered cookies and excess invalid attempts are rejected', async t => {
  const f = await fixture(t), c = f.cookie(await f.unlock()); assert.equal((await f.get('english', c + '0')).status, 403); f.advance(16 * 60 * 1000); for (let i = 0; i < 15; i++) assert.equal((await f.unlock('bad')).status, 403); assert.equal((await f.unlock('bad')).status, 429);
});
