import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream, realpathSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRedemptionStore } from './redemption-store.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PREFIX = '/ciban/';
const SESSION_MS = 30 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
export function normalizeCode(value) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}
export const hashCode = value => createHash('sha256').update(normalizeCode(value)).digest('hex');
const hashToken = value => createHash('sha256').update(value).digest('hex');

export async function createApp(options = {}) {
  const privateDir = options.privateDir || path.join(ROOT, 'private');
  const origin = options.origin || process.env.SITE_ORIGIN || 'https://maxnote.top';
  const secure = options.secure ?? true;
  const now = options.now || Date.now;
  const sessions = new Map();
  const attempts = new Map();
  const transfers = new Map();
  const activeRedemptions = new Set();
  const ledger = await createRedemptionStore(options.stateDir || process.env.STATE_DIR || path.join(privateDir, 'state'), { requireExisting: options.requireExisting ?? process.env.REQUIRE_LEDGER === '1' });
  const release = JSON.parse(await readFile(path.join(privateDir, 'release.json'), 'utf8'));
  const files = new Map(release.artifacts.map(item => [item.id, item]));
  const staticFiles = new Map([
    ['', ['index.html', 'text/html; charset=utf-8']],
    ['style.css', ['style.css', 'text/css; charset=utf-8']],
    ['app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['assets/english.png', ['assets/english.png', 'image/png']],
    ['assets/french.png', ['assets/french.png', 'image/png']],
    ['licenses.txt', ['licenses.txt', 'text/plain; charset=utf-8']],
  ]);
  const codeTable = async () => {
    const codes = JSON.parse(await readFile(path.join(privateDir, 'codes.json'), 'utf8'));
    return new Map(codes.map(c => [c.hash, c]));
  };
  function headers(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cache-Control', 'no-store');
  }
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(value));
  };
  function clean() {
    const t = now();
    for (const [key, value] of sessions) if (value.expires <= t) sessions.delete(key);
    for (const [key, value] of attempts) if (value.until <= t) attempts.delete(key);
  }
  function requestToken(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('ciban_access='))?.slice(13);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
  }
  async function authenticated(req) {
    const token = requestToken(req);
    if (!token) return null;
    let session = sessions.get(token);
    if (!session) {
      // A redeemed transfer can resume with the same Cookie after a service restart.
      const restored = ledger.findSession(hashToken(token));
      if (restored) session = { hash: restored[0], expires: restored[1].expiresAt };
    }
    if (!session || session.expires <= now()) { sessions.delete(token); return null; }
    const code = (await codeTable()).get(session.hash);
    if (!code) return null;
    const redemption = ledger.get(session.hash);
    if (code.revoked && !redemption) return null;
    return { ...session, token, revoked: code.revoked, redemption };
  }
  function sessionInfo(session) {
    if (!session) return { authorized: false, sourceAuthorized: false, used: false, resumable: false };
    const used = Boolean(session.redemption);
    return {
      authorized: !used && !session.revoked,
      sourceAuthorized: true,
      used,
      resumable: used && !session.revoked && session.redemption.sessionHash === hashToken(session.token) && session.redemption.completedAt === null,
      artifact: session.redemption?.artifact || null,
      expiresIn: Math.max(0, Math.floor((session.expires - now()) / 1000)),
    };
  }
  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2048) throw new Error('BODY_LIMIT');
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const server = http.createServer(async (req, res) => {
    headers(res);
    try {
      clean();
      const url = new URL(req.url, origin);
      if (url.pathname === '/ciban' && ['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(308, { Location: PREFIX }); res.end(); return;
      }
      if (!url.pathname.startsWith(PREFIX)) return json(res, 404, { error: '页面不存在。' });
      const route = url.pathname.slice(PREFIX.length);
      // X-Real-IP is overwritten by Nginx; only the loopback proxy can reach this listener.
      const ip = options.trustProxy ? req.headers['x-real-ip'] || req.socket.remoteAddress : req.socket.remoteAddress;
      if (route === 'api/unlock' && req.method === 'POST') {
        if (req.headers.origin !== origin || !String(req.headers['content-type']).startsWith('application/json')) return json(res, 403, { error: '请在官网下载页面验证。' });
        let rate = attempts.get(ip);
        if (!rate) {
          if (attempts.size >= 20000) return json(res, 503, { error: '服务繁忙，请稍后重试。' });
          rate = { count: 0, until: now() + WINDOW_MS }; attempts.set(ip, rate);
        }
        if (++rate.count > 15) {
          res.setHeader('Retry-After', Math.ceil((rate.until - now()) / 1000));
          return json(res, 429, { error: '尝试次数过多，请 15 分钟后重试。' });
        }
        let input;
        try { input = await body(req); } catch { return json(res, 400, { error: '下载码格式不正确。' }); }
        const code = normalizeCode(input?.code);
        const hash = hashCode(code);
        const entry = (await codeTable()).get(hash);
        const redeemed = ledger.get(hash);
        if (!/^CB[A-HJ-NP-Z2-9]{24}$/.test(code) || !entry || (entry.revoked && !redeemed)) return json(res, 403, { error: '下载码无效或已停用，请检查后重试。' });
        const existing = await authenticated(req);
        if (redeemed && existing?.hash === hash) return json(res, 410, { ...sessionInfo(existing), error: '下载码已使用，不能再次领取安装包。配套源码仍可下载。' });
        if (sessions.size >= 5000) return json(res, 503, { error: '服务繁忙，请稍后重试。' });
        const token = randomBytes(32).toString('hex');
        sessions.set(token, { hash, expires: now() + SESSION_MS });
        res.setHeader('Set-Cookie', `ciban_access=${token}; Path=${PREFIX}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
        return json(res, redeemed ? 410 : 200, { authorized: !redeemed, sourceAuthorized: true, used: Boolean(redeemed), resumable: false, expiresIn: SESSION_MS / 1000, ...(redeemed ? { error: '下载码已使用，不能再次领取安装包。配套源码仍可下载。' } : {}) });
      }
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { error: '请求方式不支持。' }); }
      if (route === 'api/session') return json(res, 200, sessionInfo(await authenticated(req)));
      if (route === 'api/release') return json(res, 200, release);
      if (route === 'health') return json(res, 200, { ok: true, version: release.version, downloadPolicy: 'single-use' });
      if (route.startsWith('download/')) {
        const session = await authenticated(req);
        if (!session) return json(res, 403, { error: '请先输入有效下载码。' });
        const file = files.get(route.slice(9));
        if (!file) return json(res, 404, { error: '文件不存在。' });
        if (file.id !== 'source' && session.revoked) return json(res, 403, { error: '下载码已停用。' });
        const filePath = path.join(privateDir, 'artifacts', file.filename);
        const info = await stat(filePath);
        if (info.size !== file.bytes) throw new Error('ARTIFACT_SIZE');
        let start = 0, end = info.size - 1;
        const range = req.headers.range;
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!match || (!match[1] && !match[2])) { res.setHeader('Content-Range', `bytes */${info.size}`); return json(res, 416, { error: '下载范围无效。' }); }
          if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
          else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), end); }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { res.setHeader('Content-Range', `bytes */${info.size}`); return json(res, 416, { error: '下载范围无效。' }); }
          res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
        }
        if ((transfers.get(ip) || 0) >= 4 || [...transfers.values()].reduce((a, b) => a + b, 0) >= 32) return json(res, 429, { error: '下载任务较多，请稍后重试。' });
        let claimed = false;
        if (file.id !== 'source') {
          // Reserve the actual transfer before headers. HEAD, invalid ranges and missing files never burn a code.
          let decision;
          try { decision = await ledger.mutate(records => {
            const current = records[session.hash];
            if (current && (current.sessionHash !== hashToken(session.token) || current.artifact !== file.id || current.completedAt !== null || current.expiresAt <= now())) return { changed: false, denied: true };
            if (current && req.method === 'GET' && (!range || (start === 0 && end === info.size - 1))) return { changed: false, denied: true };
            if (activeRedemptions.has(session.hash)) return { changed: false, busy: true };
            if (req.method === 'HEAD') return { changed: false };
            if (!current) records[session.hash] = { sessionHash: hashToken(session.token), artifact: file.id, startedAt: now(), expiresAt: session.expires, completedAt: null };
            activeRedemptions.add(session.hash); claimed = true;
            return { changed: !current, claim: true };
          }); } catch (error) { if (claimed) activeRedemptions.delete(session.hash); throw error; }
          if (decision.denied) return json(res, 410, { error: '下载码已使用，不能再次下载安装包。中断时请在原浏览器下载列表续传。' });
          if (decision.busy) return json(res, 409, { error: '该下载已在进行中，请勿重复发起。' });
        }
        res.writeHead(range ? 206 : 200, {
          'Content-Type': file.id === 'source' ? 'application/gzip' : 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${file.filename}"`,
          'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, no-store',
        });
        if (req.method === 'HEAD') { res.end(); return; }
        transfers.set(ip, (transfers.get(ip) || 0) + 1);
        try {
          await pipeline(createReadStream(filePath, { start, end }), res);
          if (claimed && end === info.size - 1) await ledger.mutate(records => {
            const current = records[session.hash];
            current.completedAt = now();
            return { changed: true };
          });
        }
        finally { if (claimed) activeRedemptions.delete(session.hash); const n = (transfers.get(ip) || 1) - 1; if (n) transfers.set(ip, n); else transfers.delete(ip); }
        return;
      }
      const asset = staticFiles.get(route);
      if (!asset) return json(res, 404, { error: '页面不存在。' });
      const contents = await readFile(path.join(ROOT, 'public', asset[0]));
      res.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': contents.length });
      res.end(req.method === 'HEAD' ? undefined : contents);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      // Never log request URLs, codes, cookies, or authorization bodies.
      process.stderr.write(`ciban request failed: ${error.code || 'internal'}\n`);
      json(res, 503, { error: '服务暂时不可用，请稍后重试。' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
// Node resolves import.meta.url through release symlinks but keeps argv[1] as invoked.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const server = await createApp({ trustProxy: process.env.TRUST_PROXY === '1', secure: process.env.COOKIE_SECURE !== '0' });
  server.listen(Number(process.env.PORT || 3081), '127.0.0.1', () => process.stdout.write('ciban download site ready\n'));
}
