from pathlib import Path
from datetime import datetime
import subprocess

config = Path('/etc/nginx/conf.d/maxnote.conf')
original = config.read_text()
if 'location ^~ /ciban/' in original:
    raise SystemExit('Ciban location already exists; refusing duplicate')
https = original.find('listen 443 ssl')
pos = original.find('    location / {', https)
if https < 0 or pos < 0 or 'server_name maxnote.top;' not in original[https:pos]:
    raise SystemExit('Unexpected nginx layout')
backup = config.with_name('maxnote.conf.backup-ciban-' + datetime.now().strftime('%Y%m%d%H%M%S'))
backup.write_text(original)
snippet = Path('/opt/ciban-download/current/deploy/nginx-location.conf').read_text()
config.write_text(original[:pos] + snippet + '\n' + original[pos:])
try:
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except Exception:
    config.write_text(original)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
print('Nginx configured; backup:', backup)
