"""Verify exact public HTTPS content after the official Pages deployment.

No repository token is used or sent to the public website. The bounded retry
handles CDN propagation without accepting stale source revision metadata.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> None:
    site_url = os.environ['PAGES_URL'].rstrip('/') + '/'
    if not site_url.startswith('https://'):
        raise RuntimeError('The public application must be served over HTTPS.')
    dist = Path(__file__).resolve().parents[1] / 'dist'
    manifest = json.loads((dist / 'build-info.json').read_text())
    if manifest['sourceCommit'] != os.environ['GITHUB_SHA']:
        raise RuntimeError('Build manifest does not identify the checked-out revision.')
    expected = {
        **manifest['sha256'],
        'build-info.json': hashlib.sha256((dist / 'build-info.json').read_bytes()).hexdigest(),
    }
    deadline = time.monotonic() + 240
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            for name, checksum in expected.items():
                suffix = '' if name == 'index.html' else name
                request = Request(
                    f"{site_url}{suffix}?verify={manifest['sourceCommit']}",
                    headers={'User-Agent': 'AlloyStudio-Pages-Verification', 'Cache-Control': 'no-cache'},
                )
                with urlopen(request, timeout=30) as response:
                    actual = hashlib.sha256(response.read()).hexdigest()
                if actual != checksum:
                    raise ValueError(f'CDN content has not converged for {name}')
            break
        except (HTTPError, URLError, TimeoutError, ValueError) as error:
            last_error = error
            print('Awaiting public CDN:', error, flush=True)
            time.sleep(8)
    else:
        raise RuntimeError('The public site did not match the validated build') from last_error

    print('PASS: HTTPS root, standalone HTML and source revision manifest match the build.', flush=True)
    with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as summary:
        summary.write(f"[Launch Alloy Studio]({site_url})\n\n")
        summary.write(f"Source: `{manifest['sourceCommit']}`\n\n")
        summary.write('Public HTML and build manifest verified by SHA-256.\n\n')


if __name__ == '__main__':
    main()
