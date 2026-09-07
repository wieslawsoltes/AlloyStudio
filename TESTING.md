# Validation record — Alloy Studio 0.1.0

Validation performed on 2026-09-06. This records observed checks, not a certification of all supported inputs or browsers.

## Kernel: 25 / 25 passed

Run `npm test`. Node.js 22 executes `tests/kernel.test.js` using its built-in test runner, with no package dependencies.

Covered: signed cube volume and area; rounded footprints; union/intersection/difference volumes; disjoint/identical Boolean operands; a through-hole; concave and negative-distance extrusion; degenerate-profile rejection; primitive orientation; full/partial revolve; BVH nearest hit; binary STL and OBJ round-trips; numeric expression precedence, units and dependency cycles; downstream regeneration; undo/redo snapshots; duplicate IDs; the 12-body assembly; non-finite imported vertices; identifier/material/metadata validation; a 60-operation dependency chain and bounded cache keys; suppression and cache hits; rollback/replay; circular pattern positions; section-aware picking.

The included assembly evaluates to 12 bodies and 23,232 triangles with no reported feature errors. Cold/cached evaluation times printed by the test runner are environment-specific CPU observations, not promised performance. No throughput target is claimed.

## Browser: 30 / 30 passed

Actual Chromium was launched with a virtual display and ANGLE/SwiftShader software rendering. The application selected **WebGL2**. The standalone HTML was injected as page content because the managed browser blocked ordinary test-URL navigation.

Observed checks are saved in `tests/browser-results.json` and include actual mouse-driven sketch creation, feature form interactions, timeline edits, undo/redo, parametric updates, pattern creation, appearance/rename, rollback/replay, section settings, preview/cancel, sketch extrusion, material subtraction, downloads in five formats, editable project reopening, STL/OBJ re-import, the command palette, and correct reporting of unavailable persistence. There were zero captured page errors. Screenshots are actual browser output, not generated mockups.

Reproduce the software/opaque-origin test in an environment with a display:

```sh
CHROMIUM_PATH=/usr/bin/chromium python3 tests/browser_smoke.py --inline --headed --software
```

On Linux CI with Xvfb installed, a typical launch is:

```sh
xvfb-run -a env CHROMIUM_PATH=/usr/bin/chromium python3 tests/browser_smoke.py --inline --headed --software
```

## Not validated in this execution

**WebGPU shader compilation, pipelines, rendering and PNG capture were not executed.** The source contains a real WebGPU implementation, but the available page context did not expose `navigator.gpu`. Static review caught and corrected a derivative-uniformity hazard and cleanup/race issues on initialization failure. This is not equivalent to running the pipeline on Dawn, Metal, D3D12 or Vulkan hardware.

**IndexedDB successful autosave and reload recovery were not exercised.** The test page's opaque origin denied storage. The denial path was tested and reports “Use File → Save.” File-based project export/reopen was exercised successfully.

Not tested: Safari/Firefox/mobile; touch-first interaction; real GPU throughput; long-running memory stability; context-loss recovery; arbitrary malformed meshes; large imported engineering assemblies; manufacturing watertightness; all keyboard/accessibility paths. User parameter and geometry tests are not exhaustive fuzzing.

## Recommended target-device checks

Run the hosted browser test with `--require-webgpu` to fail rather than accept fallback. Inspect the diagnostics and developer console for asynchronous GPU errors. Exercise all named views, resize/DPR changes, a section plane, PNG viewport capture, changing materials and long orbit sessions on target hardware.

For persistence, edit a document on a stable localhost/HTTPS origin, wait until the header explicitly reports save completion, reload, and compare the restored document. Test denial/quota limits separately. Save a portable `.alloy` copy before clearing browser data or switching origins.

Before fabrication, inspect exported geometry in an independent mesh validator or CAD kernel. The current BSP tessellation and approximate physical properties are not a substitute for analytic solid validation.
