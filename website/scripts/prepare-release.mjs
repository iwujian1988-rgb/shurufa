import { randomBytes, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashCode } from '../server.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deliverables = path.resolve(root, '..', 'deliverables');
const privateDir = path.join(root, 'private');
await mkdir(path.join(privateDir, 'artifacts'), { recursive: true });
await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
const manifest = JSON.parse(await readFile(path.join(deliverables, 'manifest.json'), 'utf8'));
const names = [['english', 'ciban-english-demo.apk'], ['french', 'ciban-french-demo.apk'], ['source', 'ciban-demo-source.tar.gz']];
const artifacts = [];
for (const [id, filename] of names) {
  const source = path.join(deliverables, filename);
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(source)) { hash.update(chunk); bytes += chunk.length; }
  const sha256 = hash.digest('hex');
  const expected = manifest.artifacts.find(a => a.name === filename || a.file === filename || a.filename === filename || a.path?.endsWith(filename));
  if (!expected || (expected.sha256 || expected.hash) !== sha256) throw new Error(`Manifest mismatch: ${filename}`);
  await copyFile(source, path.join(privateDir, 'artifacts', filename));
  artifacts.push({ id, filename, bytes, sha256, platform: 'android', kind: id === 'source' ? 'source' : 'installer', version: manifest.version, sourceId: 'source' });
}
const windows = JSON.parse(await readFile(path.join(deliverables, 'windows-release-manifest-v2.json'), 'utf8'));
for (const [id, expected] of [...windows.installers.map(item => [item.file.includes('-english-') ? 'windows-english' : 'windows-french', item]), ['source-windows', windows.sourceArchive]]) {
  const source = path.join(deliverables, expected.file);
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of createReadStream(source)) { hash.update(chunk); bytes += chunk.length; }
  const sha256 = hash.digest('hex');
  if (sha256 !== expected.sha256.toLowerCase() || bytes !== expected.bytes) throw new Error(`Windows manifest mismatch: ${expected.file}`);
  await copyFile(source, path.join(privateDir, 'artifacts', expected.file));
  artifacts.push({ id, filename: expected.file, bytes, sha256, platform: 'windows', kind: id === 'source-windows' ? 'source' : 'installer', version: windows.version, sourceId: 'source-windows' });
}
await writeFile(path.join(privateDir, 'release.json'), JSON.stringify({ version: manifest.version, windowsVersion: windows.version, minAndroid: '8.0', minWindows: '11 x64', publishedOn: '2026-10-05', signing: 'Android Debug 测试签名 / Windows 未签名测试包', artifacts }, null, 2));
for (const [lang, name] of [['english', '0.5-english-detail.png'], ['french', '0.5-french-letters.png']]) await copyFile(path.join(deliverables, name), path.join(root, 'public', 'assets', `${lang}.png`));
let exists = false;
try { await access(path.join(privateDir, 'codes.json')); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (exists) {
  process.stdout.write('Release verified and prepared; existing codes preserved.\n');
} else {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Uniform random characters, without ambiguous I/O/0/1.
  const set = new Set();
  while (set.size < 100) {
    let raw = '';
    while (raw.length < 24) for (const byte of randomBytes(32)) if (byte < alphabet.length * Math.floor(256 / alphabet.length) && raw.length < 24) raw += alphabet[byte % alphabet.length];
    set.add(`CB-${raw.match(/.{6}/g).join('-')}`);
  }
  const codes = [...set].map((code, i) => ({ id: String(i + 1).padStart(3, '0'), code, url: `https://maxnote.top/ciban/#code=${encodeURIComponent(code)}` }));
  await writeFile(path.join(privateDir, 'codes.json'), JSON.stringify(codes.map(c => ({ id: c.id, hash: hashCode(c.code), revoked: false })), null, 2), { mode: 0o600 });
  await writeFile(path.join(privateDir, 'owner-codes.json'), JSON.stringify(codes, null, 2), { mode: 0o600 });
  await writeFile(path.join(privateDir, '下载码与专属链接-100个.csv'), '\uFEFF编号,下载码,专属链接\r\n' + codes.map(c => `${c.id},${c.code},${c.url}`).join('\r\n'), { mode: 0o600 });
  process.stdout.write('100 unique download codes generated; plaintext owner list stays private.\n');
}
