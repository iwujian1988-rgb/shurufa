#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/ciban-download
RELEASE=$ROOT/release-20261005-windows-v1
BUNDLE=/tmp/ciban-windows-20261005.tar.gz
OLD=$(readlink -f "$ROOT/current")
BACKUP=$ROOT/backup-before-windows-20261005
if [ -e "$RELEASE" ] || [ -e "$BACKUP" ]; then echo 'Release/backup already exists; inspect before retrying.'; exit 1; fi
test -s /var/lib/ciban-download/redemptions.json
install -d -m 700 "$BACKUP"
cp /var/lib/ciban-download/redemptions.json "$BACKUP/redemptions-before.json"
cp "$OLD/private/codes.json" "$BACKUP/codes-before.json"
printf '%s\n' "$OLD" > "$BACKUP/previous-release.txt"
cp -a "$OLD" "$RELEASE"
tar -xzf "$BUNDLE" -C "$RELEASE"
install -m 640 /tmp/ciban-windows-licenses.txt "$RELEASE/public/licenses.txt"
cd "$RELEASE"
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
const release=JSON.parse(await readFile('private/release.json','utf8'));
if(release.artifacts.length!==6) throw Error('Expected four installers and two source archives');
for(const file of release.artifacts){let bytes=0;const h=createHash('sha256');for await(const chunk of createReadStream('private/artifacts/'+file.filename)){bytes+=chunk.length;h.update(chunk);}if(bytes!==file.bytes||h.digest('hex')!==file.sha256)throw Error('Artifact verification failed: '+file.id);}
console.log('Six private artifacts verified');
JS
chown -R root:ciban-web "$RELEASE"
find "$RELEASE" -type d -exec chmod 750 {} +
find "$RELEASE" -type f -exec chmod 640 {} +
# Freeze the latest shared code table and ledger before switching. Never upload/reset either.
systemctl stop ciban-download
cp -a "$OLD/private/codes.json" "$RELEASE/private/codes.json"
cp /var/lib/ciban-download/redemptions.json "$BACKUP/redemptions-at-switch.json"
ln -s "$RELEASE" "$ROOT/current-windows-next"
mv -Tf "$ROOT/current-windows-next" "$ROOT/current"
if ! systemctl start ciban-download || ! curl --fail --silent --show-error --retry 8 --retry-connrefused --retry-delay 1 http://127.0.0.1:3081/ciban/health; then
  ln -s "$OLD" "$ROOT/current-windows-rollback"
  mv -Tf "$ROOT/current-windows-rollback" "$ROOT/current"
  systemctl start ciban-download
  echo 'New release failed; original release restored, ledger untouched.'
  exit 1
fi
python3 - <<'PY'
import json, hashlib
from pathlib import Path
backup=Path('/opt/ciban-download/backup-before-windows-20261005')
old=json.loads((backup/'redemptions-at-switch.json').read_text())
new=json.loads(Path('/var/lib/ciban-download/redemptions.json').read_text())
assert old == new, 'Ledger must remain unchanged by deployment'
old_codes=json.loads((backup/'codes-before.json').read_text())
new_codes=json.loads(Path('/opt/ciban-download/current/private/codes.json').read_text())
assert old_codes==new_codes, 'Code/revocation table changed unexpectedly'
print('Existing code table and redemption ledger preserved:',len(new_codes),len(new['redemptions']))
PY
systemctl is-active ciban-download
