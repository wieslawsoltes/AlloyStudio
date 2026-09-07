# GitHub Pages deployment

Live application: https://wieslawsoltes.github.io/AlloyStudio/

Standalone HTML: https://wieslawsoltes.github.io/AlloyStudio/AlloyStudio.html

## Branches

`main` contains the editable application, geometry tests, browser tests, build tools, examples and documentation. `gh-pages` contains only the generated static site. Deployments use fast-forward commits; no history is force-pushed.

## Automatic validation and publication

`.github/workflows/pages.yml` runs on pushes and pull requests targeting `main`, and supports manual dispatch. The read-only validation job runs all kernel tests, builds the dependency-free HTML application, and exercises editing and import/export workflows in headless Chromium using software rendering.

Only successful validation of `main` can start the publishing job. It rebuilds the exact validated source revision, updates `gh-pages`, explicitly requests the Pages build, waits for that commit to finish, and verifies the public HTML and `build-info.json` using SHA-256. It then runs the browser workflow against the live HTTPS application. The Actions job summary records the source commit, Pages commit and browser results.

The Pages publishing source is **Deploy from a branch**, **gh-pages**, **/(root)**. The publishing job uses the built-in `GITHUB_TOKEN` with `contents: write` and `pages: write`; no personal access token is stored. Pull requests do not receive deployment permissions. Official checkout and Node setup actions are pinned to commit IDs.

`build-info.json` at the public site identifies the deployed source revision and HTML checksums. The initial source import and test provenance is preserved in `tests/github-validation.json`; the temporary archive-import workflow and chunks have been removed from the active source tree.

## Local commands

```sh
npm test
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/dist/`. Node.js 22 or later is required for build/tests. Python Playwright plus Chromium are needed only for browser tests, not for running the application.

The automated browser checks exercise WebGL2 software rendering. They are not a hardware performance benchmark or certification of WebGPU shader execution.
