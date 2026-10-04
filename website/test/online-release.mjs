import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
throw new Error('Historical reusable-code test: use test/single-use-online.mjs with temporary validation codes; never consume the 100 owner codes.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'https://maxnote.top/ciban/';
const report = { checkedOn: new Date().toISOString(), origin: base, checks: [] };
const request = (p, options) => fetch(base + p, { ...options, signal: AbortSignal.timeout(600000) });
const homepage = await request(''); assert.equal(homepage.status, 200); assert.match(await homepage.text(), /词伴/);
assert.match(homepage.headers.get('content-security-policy'), /default-src 'none'/);
report.checks.push({ publicHomepage: 200, referrerPolicy: homepage.headers.get('referrer-policy') });
for (const id of ['english', 'french', 'source']) {
  for (const method of ['GET', 'HEAD']) assert.equal((await request('download/' + id, { method })).status, 403);
}
report.checks.push({ unauthenticatedGetAndHeadAllArtifacts: '403' });
for (const p of ['private/codes.json', 'private/owner-codes.json', 'private/artifacts/ciban-english-demo.apk', 'ciban-english-demo.apk']) assert.equal((await request(p)).status, 404);
report.checks.push({ privatePathsDenied: true });
const invalid = await request('api/unlock', { method: 'POST', headers: { Origin: 'https://maxnote.top', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'BAD' }) });
assert.equal(invalid.status, 403);
const owner = JSON.parse(await readFile(path.join(root, 'private/owner-codes.json'), 'utf8'));
const unlock = await request('api/unlock', { method: 'POST', headers: { Origin: 'https://maxnote.top', 'Content-Type': 'application/json' }, body: JSON.stringify({ code: owner[0].code }) });
assert.equal(unlock.status, 200);
const cookie = unlock.headers.get('set-cookie').split(';')[0];
assert.match(unlock.headers.get('set-cookie'), /Secure/);
report.checks.push({ invalidCode: 403, validCode: 200, cookieSecure: true });
const release = await (await request('api/release')).json();
const expected = JSON.parse(await readFile(path.join(root, 'private/release.json'), 'utf8'));
assert.deepEqual(release, expected);
for (const file of release.artifacts) {
  const range = await request('download/' + file.id, { headers: { Cookie: cookie, Range: 'bytes=0-1023' } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 1024);
  const response = await request('download/' + file.id, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200); const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of response.body) { hash.update(chunk); bytes += chunk.length; }
  const digest = hash.digest('hex'); assert.equal(digest, file.sha256); assert.equal(bytes, file.bytes);
  const result = { artifact: file.id, bytes, sha256: digest, range: 206, fullFileVerified: true };
  report.checks.push(result);
  process.stdout.write(JSON.stringify(result) + '\n');
}
const original = await fetch('https://maxnote.top/', { signal: AbortSignal.timeout(30000) }); assert.equal(original.status, 200);
report.checks.push({ originalHomepage: 200 });
await writeFile(path.join(root, 'test-results/online-report.json'), JSON.stringify(report, null, 2));
process.stdout.write('HTTPS authorization and all three full-file hashes verified.\n');
