# Canvas engine contract

Describes the pan/zoom/render pipeline, including the owner-directed
progressive widget residency added on 2026-07-25. If code and contract
disagree, report the mismatch — do not quietly reinterpret either.

## Architecture

### 1. Camera core (`src/engine/camera/`)
- One world transform on one container; camera state lives in
  `cameraEngine.ts`, outside React. During a gesture frame the engine writes
  the world element's transform imperatively the moment the frame arrives.
- The gesture engine handles wheel, pinch, drag-pan, kinetic glide, and
  keyboard input. Fling decay lives in `glidePhysics.ts`.
- `useCanvasStore` mirrors `pan`/`zoom` frame-accurately and exposes the
  public camera actions (`setView`, `zoomTo`, `animateView`, framing).
  Camera history (back/forward) lives in the engine.

### 2. Rendering
- `WidgetLayer` keeps a retained world-space window around the viewport.
  Widgets outside it mount nothing; widgets entering it appear as one-image
  previews, then hydrate centre-first into full `WidgetCard` DOM in bounded
  idle-time batches. Leaving cards release in bounded batches too.
- Camera motion never drives a React render every frame. The retained window
  carries a screen-space gutter and only replans after the viewport consumes
  its inner safety margin or crosses the 60% detail boundary.
- Below 60% zoom, inactive widgets remain lightweight SVG-data images.
  Resting faces are pointer-transparent there; selected, expanded, renaming,
  linking, and hydrating widgets are urgent and stay live.
- Relation, dependency, and wire layers build descriptors for every edge on
  the active canvas and share paint through `CanvasEdge.tsx`. Their SVG
  container anchors to the visible world rect from `useWorldViewRect`, which
  re-derives from the store mirror on every camera frame.
- Parent relations are free-form: they preserve the connection direction the
  user drew, move neither widget, and choose the nearest point from any side
  of each widget. The retired canvas-wide strictness field is accepted only as
  legacy persistence data and does not affect layout or paint.
- Glue welds render for every glue cluster on the active canvas.

### 3. Loader (`src/engine/loader/`)
- Shortly after startup, `idlePrefetch.ts` quietly warms every lazy widget
  module (one per slice) so a first mount never hits a cold chunk load.

## Laws that remain

- Persistence validates unknown data before hydration; cloud or local-AI
  failure must not break local board work.
- Reduced-motion preferences suppress camera tweens and glide.
- Public camera seams keep their names so tests and tools survive.
