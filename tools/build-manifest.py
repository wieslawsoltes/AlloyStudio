"""Record deterministic deployment provenance after npm run build."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
revision = os.environ.get('GITHUB_SHA') or subprocess.check_output(
    ['git', 'rev-parse', 'HEAD'], cwd=root, text=True
).strip()
dist = root / 'dist'
manifest = {
    'sourceCommit': revision,
    'sha256': {
        name: hashlib.sha256((dist / name).read_bytes()).hexdigest()
        for name in ['index.html', 'AlloyStudio.html']
    },
}
(dist / 'build-info.json').write_text(json.dumps(manifest, indent=2) + '\n')
