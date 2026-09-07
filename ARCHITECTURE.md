# Alloy Studio engine architecture

## Module map

| Module | Responsibility |
| --- | --- |
| `src/math.js` | Z-up camera, matrix/vector math, projection, pointer rays, triangle/AABB tests |
| `src/kernel.js` | Convex polygon boundary representation, BSP Boolean operators, primitive generators, ear clipping, extrusion/revolution, mesh generation, statistics, BVH and STL/OBJ codecs |
| `src/document.js` | Versioned project schema and validation, safe expressions, parameter dependency resolution, feature evaluator/cache, materials, undo/redo and assembly sample |
| `src/worker.js` | Worker message contract, persistent evaluator, validation and transferable result transport |
| `src/renderer.js` | Direct WebGPU/WGSL implementation, WebGL2/GLSL fallback, packed geometry uploads, material shading, selection, clipping and shadow resources |
| `src/app.js` | Document commands, UI state, worker scheduling, gesture state machines, sketch authoring, editing panels, persistence and file actions |
| `src/icons.js` | Original compact inline SVG icon vocabulary |
| `src/style.css` | Workspace design tokens and responsive layout |
| `tools/build.mjs` | Dependency-free standalone HTML assembly, including an embedded worker |

## Document and feature identity

A project is JSON with `format: "alloy-studio"`, schema `version: 1`, millimeter units, named parameters, an ordered feature list, appearance/name overrides, body visibility, and an optional rollback position. Geometry is derived except for explicitly imported mesh features.

Each source feature has a stable string ID. Inputs are feature/body IDs: `target`, `tool`, and `profile`. Consuming operations remove their input bodies from the active result set but retain those results in the evaluator's dependency map. Their output receives the operation's feature ID. Pattern copies use generated IDs of the form `patternId:1`; original source IDs cannot contain colons. Face and edge identities are not persistent topology IDs.

A sketch is a closed 2D profile, workplane, and origin. It does not store a constraint graph. Editing the profile or its numeric expression inputs regenerates dependent features. A suppressed modification acts as a pass-through result; suppressing a source can invalidate downstream references. Errors remain associated with timeline features rather than being silently converted into arbitrary replacement geometry.

## Evaluation and caching

The evaluator resolves named parameters, visits the history up to the rollback position, resolves feature dependencies, and evaluates changed outputs. A cache entry is keyed by the feature's serialized definition, resolved parameter environment, and dependency output revision tokens. Tokens are bounded numeric revisions, not recursively expanded dependency JSON. The long-chain regression test protects this invariant.

Global parameter edits conservatively invalidate the environment signature; there is no per-expression parameter-use analysis yet. Geometry/material/visibility UI mutations are document transactions. Body-level overrides are applied after geometric evaluation. Cache entries not reachable in the evaluated timeline are pruned.

Modeling computations use JavaScript numbers and a geometric epsilon of `1e-6` model units. GPU geometry and camera matrices use Float32. This conversion is intentional but limits effective large-coordinate precision. The application has no adaptive-tolerance or floating-origin system.

## Worker ownership and revisions

The main thread sends `{ id, document }` snapshots. Only one modeling request is active; rapid edits replace the pending snapshot. Results with stale revision IDs are ignored. A 30-second watchdog terminates stalled workers; the user can undo or simplify an operation. A worker initialization failure uses an explicitly reported main-thread evaluation fallback.

The worker caches polygonal results, triangle data and acceleration structures. It clones outgoing results before transferring typed-array buffers so the persistent cache does not acquire detached ArrayBuffers. This trades additional copy/memory cost for correct cache ownership. Returned BVH node metadata is structured-cloned. It is not a zero-copy shared-memory kernel.

Undo/redo keeps up to 100 document snapshots. This is straightforward and isolated but expensive for mesh-import-heavy projects. Replacing snapshots with semantic deltas or content-addressed imported mesh blobs is a natural extension.

## Geometry and Boolean boundary

Polygons are split by planes into BSP trees. Union, intersection, and subtraction combine and invert these classifications. Primitive generators produce outward-oriented tessellated boundaries. Ear clipping handles ordinary simple concave 2D profiles; it is not a planar-arrangement kernel and does not support arbitrary self-intersections or nested holes.

Triangulation creates packed positions, normals, triangle indices, and feature-edge segments. Normals are smoothed by the configured angular threshold. The edge filter suppresses internal coplanar edges, including visual seams produced by BSP split T-junctions. It does not perform a full watertight topology repair.

The kernel rejects excessive input/result budgets and degenerate inputs in supported paths, but it is not computationally robust over all possible imported triangle soups. A manufacturing release would need exact/adaptive predicates, validated manifold topology, tolerance management and a mature analytic geometry layer.

## Rendering contract

Interleaved scene vertices occupy 48 bytes:

```text
byte  0: position.xyz     float32 × 3
byte 12: normal.xyz       float32 × 3
byte 24: color.rgb        float32 × 3
byte 36: roughness        float32
byte 40: metalness        float32
byte 44: body identifier  float32
```

One batched indexed mesh draw covers visible bodies and the procedural ground. A separate line-list buffer draws retained edges. This reduces per-object draw overhead but is not GPU instancing; body patterns duplicate mesh data. Material/visibility/explode updates repack the scene. Camera, selection, hover, section and display state update uniforms without regenerating geometry.

A 192-byte uniform block contains view-projection and light matrices, eye position, selection/display settings, a clipping plane and miscellaneous flags. The WebGPU path uses a 4× MSAA color/depth render target, a 2048² depth shadow texture, comparison sampling with 3×3 PCF, an indexed main pass, and a depth-biased edge pass. The shadow pass is invalidated by scene/explode/section changes, not ordinary camera orbit.

WGSL shading implements GGX-style direct specular lighting, Schlick Fresnel, metallic/roughness inputs, a procedural studio environment, and a tone/gamma curve. It is an interactive approximation, not path tracing, calibrated photometry, prefiltered HDR-image IBL or a film-quality render engine. Raster hardware/API behavior still requires target-device validation.

The fallback uses WebGL2 with its own GLSL and real mesh buffers. It keeps the camera, geometry, clipping, selection, material response and edge display, but does not implement the WebGPU shadow map. Its ground darkening is an inexpensive analytic presentation effect.

On-demand invalidation avoids GPU submissions while the scene is unchanged. An animation-frame callback still runs to service dirty frames. The diagnostic frame number is **CPU submission/encoding time**, not GPU duration, FPS, input latency or a benchmark. No timestamp-query profiler is implemented.

## Picking and overlays

A per-mesh BVH accelerates CPU triangle ray tests. The nearest retained surface is selected; section-aware predicates reject clipped intersections. In exploded mode, picking accounts for body display offsets. Overlay Canvas2D renders sketch guides, measurements and move-axis affordances; it does not stand in for 3D surface rendering.

Move-axis manipulation projects axes into screen space and submits debounced previews. Perspective degeneracy and large-coordinate precision remain testing targets. Measurement is between picked tessellated surface points, not analytic face/edge entities.

## Persistence and untrusted data

IndexedDB stores the active committed document. Save completion is reported only after the matching transaction finishes; a superseded completion does not overwrite newer status. Preview geometry is not autosaved. Portable saves are explicit `.alloy` downloads. Browser denial/quota errors are visible; the app does not have a remote persistence fallback.

Import validation rejects unsupported schema/units, malformed IDs, unknown feature types/materials, invalid metadata, excessive geometry, non-finite vertices and unsafe parameter names. Parameter expressions have a length and result bound and are parsed without `eval` or `Function`. Names inserted into HTML are escaped. No executable code is embedded in the project format. These protections have targeted tests, not an independent security audit.

## Production extensions

The replaceable boundary is the feature evaluator's geometry backend, not the UI. An analytic solid kernel could return tessellation plus persistent topology IDs while retaining the worker protocol, document command layer and most renderer/editor code. A separate sketch-solver module could add constraints and generate resolved profiles. Persistent face IDs are prerequisite to reliable arbitrary-face attachment, edge fillets and robust reference recovery.

For larger models, prioritize content-addressed immutable geometry, incremental/delta transport, per-body GPU allocation, actual pattern instancing, coarse culling and hierarchical scene acceleration. Correctness validation on representative engineering files comes before performance claims.
