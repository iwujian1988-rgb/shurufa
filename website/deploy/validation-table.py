import json, os, sys
from pathlib import Path
table = Path('/opt/ciban-download/current/private/codes.json')
metadata = table.stat()
codes = json.loads(table.read_text())
extra = json.loads(Path('/tmp/ciban-validation-hashes.json').read_text())
hashes = {c['hash'] for c in extra}
if sys.argv[1] == 'add':
    if any(c['hash'] in hashes for c in codes): raise SystemExit('Test codes already present')
    codes.extend(extra)
elif sys.argv[1] == 'remove':
    codes = [c for c in codes if c['hash'] not in hashes]
else: raise SystemExit('Expected add/remove')
temporary = table.with_suffix('.validation.tmp')
temporary.write_text(json.dumps(codes, indent=2))
os.chown(temporary, metadata.st_uid, metadata.st_gid)
os.chmod(temporary, metadata.st_mode & 0o777)
temporary.replace(table)
print('Code table entries:', len(codes), 'owner codes:', len([c for c in codes if not c['id'].startswith('TEST-')]))
