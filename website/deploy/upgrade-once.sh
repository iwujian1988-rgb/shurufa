#!/usr/bin/env bash
set -euo pipefail
SITE=/opt/ciban-download/current
BACKUP=/opt/ciban-download/backup-before-once-20261004
if [ -e "$BACKUP" ]; then echo 'Backup already exists; inspect before reusing.'; exit 1; fi
install -d -m 700 "$BACKUP"
cp "$SITE/server.mjs" "$BACKUP/"
cp /etc/systemd/system/ciban-download.service "$BACKUP/"
cp "$SITE/private/codes.json" "$BACKUP/"
cp -a "$SITE/public" "$BACKUP/"
tar -xzf /tmp/ciban-once-v2.tar.gz -C "$SITE"
chown root:ciban-web "$SITE/server.mjs" "$SITE/redemption-store.mjs" "$SITE/public/app.js" "$SITE/public/index.html" "$SITE/public/licenses.txt"
chmod 640 "$SITE/server.mjs" "$SITE/redemption-store.mjs" "$SITE/public/app.js" "$SITE/public/index.html" "$SITE/public/licenses.txt"
if [ -d /var/lib/ciban-download ] && [ ! -f /var/lib/ciban-download/redemptions.json ]; then
  echo 'Existing state directory has no ledger; restore a trusted backup instead of resetting download codes.'; exit 1
fi
install -d -o ciban-web -g ciban-web -m 700 /var/lib/ciban-download
if [ ! -f /var/lib/ciban-download/redemptions.json ]; then
  (umask 077; printf '%s\n' '{"schemaVersion":1,"redemptions":{}}' > /var/lib/ciban-download/redemptions.json)
  chown ciban-web:ciban-web /var/lib/ciban-download/redemptions.json
fi
install -m 644 "$SITE/deploy/ciban-download.service" /etc/systemd/system/ciban-download.service
systemctl daemon-reload
systemctl restart ciban-download
curl --fail --show-error --silent --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3081/ciban/health
systemctl is-active ciban-download
