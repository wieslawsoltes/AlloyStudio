# GitHub Pages deployment

Live application: https://wieslawsoltes.github.io/AlloyStudio/

Standalone HTML: https://wieslawsoltes.github.io/AlloyStudio/AlloyStudio.html

## Source and deployment

`main` contains the editable application, geometry tests, browser tests, build tools, examples and documentation. The repository uses the **GitHub Actions** Pages publishing source. A branch-based Pages build is not used.

## Automatic validation and publication

`.github/workflows/pages.yml` runs on pushes and pull requests targeting `main`, and supports manual dispatch. The read-only validation job runs all kernel tests, builds the dependency-free HTML application, and exercises editing and import/export workflows in headless Chromium using software rendering.

Only successful validation of `main` can publish. The validated `dist` directory is uploaded with the official `actions/upload-pages-artifact` action and deployed with `actions/deploy-pages` to the `github-pages` environment. The publish job has `contents: read`, `pages: write` and `id-token: write`; no personal access token or repository write permission is required. Pull requests cannot publish. All directly referenced official actions are pinned to commit IDs.

After deployment the workflow verifies the public HTML and `build-info.json` using SHA-256, then exercises the live HTTPS application in Chromium. The job summary records the source commit and browser results. No repository token is sent to the public site.

`build-info.json` at the public site identifies the deployed source revision and HTML checksums. The initial source import and test provenance is preserved in `tests/github-validation.json`; temporary archive-import files have been removed from the active source tree.

## Local commands

```sh
npm test
npm run build
python3 -m http.server 8000
```

Open `http://localhost:8000/dist/`. Node.js 22 or later is required for build/tests. Python Playwright plus Chromium are needed only for browser tests, not for running the application.

The automated browser checks exercise WebGL2 software rendering. They are not a hardware performance benchmark or certification of WebGPU shader execution.
