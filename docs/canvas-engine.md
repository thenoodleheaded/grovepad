# Canvas engine contract

One-shot rewrite of the pan/zoom/render/load pipeline, ratified 2026-07-20 with
the project owner. This document is the contract the implementation is judged
against; if code and contract disagree, report the mismatch — do not quietly
reinterpret either.

## Mission

Panning and zooming a board of **thousands of widgets** must feel like moving
paper: instant, continuous, never hitching. Widgets near your path exist before
you reach them. Nothing about board data, coordinates, or export formats
changes meaning — this is a presentation/loading engine, not a data redesign
beyond the storage chunking described below.

## The one law

**During a gesture frame, the main thread does exactly one thing: write the
camera transform.** Every other cost — quality switches, snapshot generation,
hydration, mounting, unmounting, edge rebuilds — is prepared before the
gesture, deferred until after it, or runs off the main thread. A quality tier
change may only toggle compositor-only properties (`opacity`, `visibility`,
`transform`) on pre-existing layers.

## Ratified decisions (owner Q&A, 2026-07-20)

| Decision | Choice |
| --- | --- |
| Approach | One-shot rewrite on `canvas-engine`; old pipeline deleted, not patched |
| Quality model | Velocity-adaptive: crispness traded against speed continuously |
| Max sacrifice | Bitmap softness only — a card never degrades to a flat block |
| Scale target | Thousands of widgets on a single canvas |
| Memory model | Windowed: full data hydrates near the viewport, unloads behind it |
| Always loaded | Lightweight index of every widget (position, size, type, title) |
| Load feel | Idle code prefetch + predictive pre-mount; no skeletons, no stored thumbnails |
| Perf floor | This Mac (Chrome + Tauri) **and** 4× CPU throttle; 60Hz hard gate, 120Hz best-effort |
| Merge gate | All gates pass + manual smoke on real boards; until then main keeps the old engine |
| Benchmark | ~2,000 widgets, realistic mix + heavy tail, several hundred edges |
| Checkpoints | Live demos after camera core, governor, and loader steps |

## Architecture

### 1. Camera core (`src/engine/camera/`)
- One world transform on one container; camera state lives outside React.
- New gesture engine: wheel, pinch, drag-pan, kinetic glide, keyboard. Emits
  camera frames plus a **velocity signal** consumed by the governor and the
  hydration ring.
- Public seams (`setView`, screen↔world mapping) keep their existing names so
  tests and tools survive.

### 2. Windowed data (`src/engine/window/`)
- **Widget index** (always in memory): id, canvasId, position, size, type,
  title, groupId, edge endpoints. Feeds minimap, search, wires, culling, and
  settle geometry. Small enough that thousands of entries are trivial.
- **Hydration ring**: full widget data + mounted DOM for the viewport plus a
  margin that stretches in the direction of travel (velocity-aware). Behind
  the travel direction, widgets dehydrate back to index entries after a
  hysteresis delay — never mid-gesture.
- **Pinning**: widgets participating in live circuits, focused/editing
  widgets, and drag/selection participants never dehydrate.
- Hydration and dehydration are budgeted per idle slice; they never run during
  a gesture frame.

### 3. Dual representation (`src/engine/raster/`)
*(Amended 2026-07-21 during implementation; owner-authorized "change whatever
the other AI did" covered folding the primitive-card work into this design.
Original prescription — per-card foreignObject bitmap snapshots — was
superseded: DOM serialization is brittle (fonts, external content) and
per-card bitmaps still require per-card DOM. What shipped is stronger.)*
- Three representations, cheapest first: a **sprite** (painted portrait of a
  card inside one world-anchored canvas), a **primitive card** (cheap passive
  DOM, `PrimitiveWidgetCard`), and the **full live card**.
- The sprite underlay is painted by a worker (OffscreenCanvas) from pure
  `PrimitiveWidget` projections and covers every widget the mount ring has
  not reached; mounted DOM covers its own sprite. Repaints are
  generation-guarded, off-gesture, and land as one transferFromImageBitmap.
- During motion the compositor scales the sprite bitmap (softness at speed is
  the ratified trade; below ~26 painted px a card is an accent chip —
  matching what the eye resolves at that scale, not a quality cut).
- Settle re-anchors and repaints at exact zoom; deep zoom-in beyond 2× the
  painted resolution triggers a sharper repaint.

### 4. Quality governor (`src/engine/governor/`)
- Inputs: camera velocity, measured frame times (rolling p95), hydrated count.
- Tiers: **T0** full crisp (effects on) → **T1** effects shed (blur/shadow/
  glow off, transitions frozen) → **T2** bitmap (snapshot visible, live DOM
  hidden). Per-card tier assignment; distant/small-on-screen cards degrade
  before near/large ones. There is no flat-block tier.
- Hysteresis on both entry and exit; settle re-crisps within ≤ 2 frames.
- All tier flips are compositor-only toggles on pre-existing layers.

### 5. Loader (`src/engine/loader/`)
- On board open: hydrate last viewport first, then idle-prefetch the module
  code for **every widget type present on the board** (index makes this a set
  lookup) so no scroll ever hits a cold module.
- Predictive pre-mount: the hydration ring's forward margin mounts real
  widgets (no skeletons) before they enter the viewport.

### 6. Storage chunking (`storage v3`)
- Boards persist as spatial chunks plus the widget index, so opening a huge
  board reads the index + the chunks under the last viewport, not everything.
- v2 boards migrate on first open; v2 remains readable. Cloud/local failure
  must not break local board work (unchanged law).

## Performance gates (merge blockers)

Measured on the benchmark board, in Chrome and in the Tauri app, at 1× and
4× CPU throttle:

1. **Zero dropped frames at 60Hz** during a scripted 20-second pan/zoom/fling
   tour (fling across the board, deep zoom out/in, diagonal glide).
2. 120Hz: p95 frame ≤ 8.3ms at 1× throttle (best-effort, reported not gated).
3. Cold board open to interactive viewport: ≤ 1.5s at 1× (reported at 4×).
4. Pre-mount hit rate: ≥ 95% of widgets entering the viewport during the tour
   were already mounted (no visible pop-in).
5. Memory: hydrated set stays bounded (ring size), independent of board size.
6. Settle re-crisp: ≤ 2 frames after gesture end, every time.

`npm run bench:canvas` generates the board, runs the tour, and prints
pass/fail per gate; the manual smoke checklist gains a canvas-engine section.

## Deleted by this rewrite

`useCanvasEvents.ts`, camera portions of `useCanvasStore.ts`,
`CanvasViewport.tsx`'s camera/gesture/culling glue, `WidgetLayer` quantized
culling, far-zoom LOD CSS keyed on `data-visual-quality`, `kineticPan.ts`,
`viewportFrameBatcher.ts`, `cameraMotionRuntime.ts`/`CameraMotionLayer.tsx`,
and the `PerformanceMonitor` overlay (superseded by the benchmark meter).
Grid, aura, edges, minimap, selection, focus, and circuit layers survive but
re-attach to the new camera and index seams.
