import json, hashlib
from pathlib import Path
codes = json.loads(Path('/opt/ciban-download/current/private/codes.json').read_text())
state = json.loads(Path('/var/lib/ciban-download/redemptions.json').read_text())
owner = [c for c in codes if not c['id'].startswith('TEST-')]
print(json.dumps({
    'ownerCodes': len(owner),
    'temporaryCodes': len(codes)-len(owner),
    'ownerCodesUsed': sum(c['hash'] in state['redemptions'] for c in owner),
    'ownerCodesRevoked': sum(bool(c['revoked']) for c in owner),
    'serverSha256': hashlib.sha256(Path('/opt/ciban-download/current/server.mjs').read_bytes()).hexdigest(),
    'storeSha256': hashlib.sha256(Path('/opt/ciban-download/current/redemption-store.mjs').read_bytes()).hexdigest(),
}))
