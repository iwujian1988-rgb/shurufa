import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

// One Node process owns this ledger. All changes serialize before an atomic, fsynced replace.
export async function createRedemptionStore(directory, { requireExisting = false } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'redemptions.json');
  let value;
  let queue = Promise.resolve();
  async function persist(next) {
    const temporary = `${filename}.${randomBytes(8).toString('hex')}.tmp`;
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(JSON.stringify(next, null, 2));
      await file.sync(); await file.close(); file = null;
      await rename(temporary, filename);
      // If directory fsync fails after rename, never revert the consumed code in memory.
      value = next;
      if (process.platform !== 'win32') {
        const dir = await open(directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
      }
    } finally {
      if (file) await file.close();
      try { await unlink(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  try { value = JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT' || requireExisting) throw error;
    await persist({ schemaVersion: 1, redemptions: {} });
  }
  if (value.schemaVersion !== 1 || !value.redemptions || Array.isArray(value.redemptions) || typeof value.redemptions !== 'object') throw new Error('INVALID_REDEMPTION_LEDGER');
  for (const [hash, r] of Object.entries(value.redemptions)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || !/^[a-f0-9]{64}$/.test(r.sessionHash || '') || !['english', 'french'].includes(r.artifact) || !Number.isFinite(r.startedAt) || !Number.isFinite(r.expiresAt) || (r.completedAt !== null && !Number.isFinite(r.completedAt))) throw new Error('INVALID_REDEMPTION_RECORD');
  }
  return {
    get: hash => value.redemptions[hash],
    findSession: hash => Object.entries(value.redemptions).find(([, r]) => r.sessionHash === hash),
    async mutate(callback) {
      const operation = queue.then(async () => {
        const next = structuredClone(value);
        const result = callback(next.redemptions);
        if (result.changed) await persist(next);
        return result;
      });
      queue = operation.catch(() => {}); // A failed write must not poison subsequent operations.
      return operation;
    },
  };
}
