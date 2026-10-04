#!/usr/bin/env bash
set -euo pipefail
ROOT=/opt/ciban-download
RELEASE=$ROOT/release-20261004-v1
BUNDLE=/tmp/ciban-release-20261004.tar.gz
CONFIG=/etc/nginx/conf.d/maxnote.conf
mkdir -p "$ROOT"
if [ -e "$RELEASE" ]; then echo "Release directory already exists; inspect before reusing."; exit 1; fi
mkdir "$RELEASE"
tar -xzf "$BUNDLE" -C "$RELEASE"
if ! id ciban-web >/dev/null 2>&1; then useradd --system --no-create-home --shell /sbin/nologin ciban-web; fi
chown -R root:ciban-web "$RELEASE"
find "$RELEASE" -type d -exec chmod 750 {} +
find "$RELEASE" -type f -exec chmod 640 {} +
# Compare delivered binaries to the manifest before serving any downloads.
cd "$RELEASE"
node --input-type=module <<'JS'
import {readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
const r=JSON.parse(await readFile('private/release.json','utf8'));
for(const f of r.artifacts){let size=0;const h=createHash('sha256');for await(const c of createReadStream('private/artifacts/'+f.filename)){h.update(c);size+=c.length}if(size!==f.bytes||h.digest('hex')!==f.sha256)throw new Error('artifact mismatch '+f.id);console.log('verified',f.id,f.bytes)}
JS
ln -s "$RELEASE" "$ROOT/current"
install -m 644 deploy/ciban-download.service /etc/systemd/system/ciban-download.service
if [ -d /var/lib/ciban-download ] && [ ! -f /var/lib/ciban-download/redemptions.json ]; then
    echo 'Existing state directory has no ledger; restore a trusted backup instead of resetting download codes.'; exit 1
fi
install -d -o ciban-web -g ciban-web -m 700 /var/lib/ciban-download
if [ ! -f /var/lib/ciban-download/redemptions.json ]; then
    (umask 077; printf '%s\n' '{"schemaVersion":1,"redemptions":{}}' > /var/lib/ciban-download/redemptions.json)
    chown ciban-web:ciban-web /var/lib/ciban-download/redemptions.json
fi
systemctl daemon-reload
systemctl enable --now ciban-download.service
curl --fail --silent --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3081/ciban/health
python3 <<'PY'
from pathlib import Path
from datetime import datetime
import subprocess
config=Path('/etc/nginx/conf.d/maxnote.conf')
original=config.read_text()
if 'location ^~ /ciban/' in original: raise SystemExit('Ciban location already exists; refusing duplicate')
https=original.find('listen 443 ssl')
pos=original.find('    location / {',https)
if https<0 or pos<0 or 'server_name maxnote.top;' not in original[https:pos]: raise SystemExit('Unexpected nginx layout')
backup=config.with_name('maxnote.conf.backup-ciban-'+datetime.now().strftime('%Y%m%d%H%M%S'))
backup.write_text(original)
snippet=Path('deploy/nginx-location.conf').read_text()
config.write_text(original[:pos]+snippet+'\n'+original[pos:])
try:
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    config.write_text(original)
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    raise
print('\nNginx configured; backup:',backup)
PY
systemctl is-active ciban-download.service
echo 'Deployment complete; validate HTTPS download authorization next.'
