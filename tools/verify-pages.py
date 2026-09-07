"""Request a branch-based Pages build and verify exact deployed content.

Uses the workflow GITHUB_TOKEN with contents:write and pages:write. No
personal access token or administration permission is required once the
repository's Pages source is configured to gh-pages at the repository root.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def api(path: str, method: str = 'GET') -> dict:
    request = Request(
        f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}/{path}",
        method=method,
        headers={
            'Authorization': f"Bearer {os.environ['GH_TOKEN']}",
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'AlloyStudio-Pages-Verification',
        },
    )
    with urlopen(request, timeout=30) as response:
        return json.load(response)


def main() -> None:
    expected_commit = os.environ['PAGES_COMMIT']
    site = api('pages')
    source = site.get('source', {})
    if source.get('branch') != 'gh-pages' or source.get('path') != '/':
        raise RuntimeError('Pages must publish from gh-pages at /(root).')
    site_url = site['html_url'].rstrip('/') + '/'
    if not site_url.startswith('https://'):
        raise RuntimeError('The public application must be served over HTTPS.')
    print('Publishing:', site_url, 'commit:', expected_commit, flush=True)

    # A push made using GITHUB_TOKEN does not itself trigger a Pages build.
    api('pages/builds', method='POST')
    deadline = time.monotonic() + 480
    while time.monotonic() < deadline:
        result = api('pages/builds/latest')
        status = result.get('status')
        print('Pages build:', status, result.get('commit'), flush=True)
        if result.get('commit') == expected_commit:
            if status == 'built':
                break
            if status == 'errored':
                raise RuntimeError(f"Pages build failed: {result.get('error')}")
        time.sleep(8)
    else:
        raise TimeoutError('The expected Pages commit did not finish deploying.')

    manifest = json.loads(Path('dist/build-info.json').read_text())
    expected = {**manifest['sha256'], 'build-info.json': hashlib.sha256(Path('dist/build-info.json').read_bytes()).hexdigest()}
    deadline = time.monotonic() + 180
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            for name, checksum in expected.items():
                suffix = '' if name == 'index.html' else name
                request = Request(
                    f"{site_url}{suffix}?verify={expected_commit}",
                    headers={'User-Agent': 'AlloyStudio-Pages-Verification', 'Cache-Control': 'no-cache'},
                )
                # Never send the repository token to the public website.
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
        summary.write(f"Source: `{manifest['sourceCommit']}`\n\nPages: `{expected_commit}`\n\n")
        summary.write('Public HTML and build manifest verified by SHA-256.\n\n')


if __name__ == '__main__':
    main()
