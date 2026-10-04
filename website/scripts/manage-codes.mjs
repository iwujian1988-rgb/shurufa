import { readFile, writeFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action, id] = process.argv.slice(2);
if (!['revoke', 'restore'].includes(action) || !/^\d{3}$/.test(id || '')) throw new Error('Usage: node scripts/manage-codes.mjs revoke|restore 001');
const file = path.join(root, 'private', 'codes.json');
const metadata = await stat(file);
const codes = JSON.parse(await readFile(file, 'utf8'));
const item = codes.find(c => c.id === id);
if (!item) throw new Error('Unknown code number');
item.revoked = action === 'revoke';
const tmp = file + '.tmp';
await writeFile(tmp, JSON.stringify(codes, null, 2), { mode: metadata.mode & 0o777 });
// Preserve group access when run by root on the production server.
if (process.platform !== 'win32') { const { chown } = await import('node:fs/promises'); await chown(tmp, metadata.uid, metadata.gid); }
await rename(tmp, file);
process.stdout.write(`Code ${id}: ${action === 'revoke' ? 'disabled' : 'enabled'}; takes effect on the next download request.\n`);
