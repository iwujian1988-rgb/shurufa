// Research staging only: never overwrite the glossary shipped in an APK.
// Usage: node scripts/import-cfdict.cjs
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = path.resolve(__dirname, '../data/french-research');
const source = fs.readFileSync(path.join(dir, 'cfdict.u8'));
const text = new TextDecoder('utf-8', { fatal: true }).decode(source);
const words = new Map();
const rejected = [];
let parsedRecords = 0;
for (const [index, line] of text.split(/\r?\n/).entries()) {
  if (!line.trim() || line.startsWith('#')) continue;
  const match = line.match(/^(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+\/(.*)\/$/);
  if (!match) { rejected.push({ line: index + 1, reason: 'format', raw: line }); continue; }
  const [, traditional, simplified, pinyin, body] = match;
  const senses = body.split('/').map(s => s.trim()).filter(Boolean);
  if (!senses.length || senses.some(s => /[\t\r\n|]/.test(s))) {
    rejected.push({ line: index + 1, reason: 'empty or incompatible sense delimiter', raw: line });
    continue;
  }
  parsedRecords++;
  if (!words.has(simplified)) words.set(simplified, []);
  words.get(simplified).push({ sourceLine: index + 1, traditional, pinyin, senses });
}
const records = [...words].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const staged = records.map(([word, entries]) => ({ word, source: 'CFDICT', review: 'unreviewed-in-this-project', entries }));
fs.writeFileSync(path.join(dir, 'cfdict-records.jsonl'), staged.map(r => JSON.stringify(r)).join('\n') + '\n');
// Retain all distinct senses in TSV; the current runtime reads at most two.
// They remain in source order, which is NOT a verified frequency ranking.
fs.writeFileSync(path.join(dir, 'glossary-fr-cfdict-candidate.tsv'),
  '# CFDICT / Chine Informations / David Houstin / CC BY-SA 3.0\n' +
  '# https://chine.in/mandarin/dictionnaire/CFDICT/\n' +
  '# Research candidate; merged by simplified headword; no independent language review.\n' +
  records.map(([word, entries]) => [word, ...new Set(entries.flatMap(e => e.senses))].join('\t')).join('\n') + '\n');
fs.writeFileSync(path.join(dir, 'rejected.jsonl'), rejected.map(r => JSON.stringify(r)).join('\n') + (rejected.length ? '\n' : ''));
const manifest = {
  source: 'CFDICT', author: 'Chine Informations / David Houstin and contributors',
  homepage: 'https://chine.in/mandarin/dictionnaire/CFDICT/',
  download: 'https://chine.in/assets/cfdict/cfdict.u8',
  license: 'CC-BY-SA-3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
  downloadedAt: '2026-10-04',
  sourceVersion: text.match(/# - Version : ([^\r\n]+)/)?.[1].trim(),
  sourceSha256: crypto.createHash('sha256').update(source).digest('hex'),
  sourceBytes: source.length, parsedRecords, distinctSimplifiedHeadwords: words.size,
  repeatedHeadwords: records.filter(([, entries]) => entries.length > 1).length,
  rejectedRecords: rejected.length, independentLanguageReview: false,
  transformations: ['Parse original UTF-8 U8 records', 'Group by exact simplified headword', 'Preserve source lines, pinyin and all senses in JSONL', 'Deduplicate identical senses for candidate TSV without reordering'],
  deployedToApk: false,
  limitations: ['Runtime displays at most two senses', 'Runtime lookup uses headword, not pinyin or sentence context', 'Source order does not imply most common sense', 'Gender, POS and concise display remain to be curated']
};
fs.writeFileSync(path.join(dir, 'source-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(manifest, null, 2));
