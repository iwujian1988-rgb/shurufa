import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { hashCode } from '../server.mjs';
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codes = Array.from({ length: 2 }, (_, i) => {
  const raw = [...randomBytes(24)].map(b => alphabet[b % 32]).join('');
  return { id: 'TEST-ONCE-' + (i + 1), code: 'CB-' + raw.match(/.{6}/g).join('-') };
});
await writeFile('private/validation-codes.json', JSON.stringify(codes), { mode: 0o600 });
await writeFile('private/validation-hashes.json', JSON.stringify(codes.map(c => ({ id: c.id, hash: hashCode(c.code), revoked: false }))), { mode: 0o600 });
process.stdout.write('Two temporary validation codes generated; owner list unchanged.\n');
