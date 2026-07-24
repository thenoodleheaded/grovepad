# Canvas engine contract

Describes the pan/zoom/render pipeline as it exists after the 2026-07-21
owner-directed removal of every scale/zoom/scroll performance optimization
(sprites, primitive cards, windowed residency, quantized culling, motion
tiers, quality governor, and the canvas benchmark harness). If code and
contract disagree, report the mismatch — do not quietly reinterpret either.

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
- `WidgetLayer` mounts a full `WidgetCard` for **every** widget on the active
  canvas. There is no viewport culling, no passive/primitive representation,
  and no sprite backdrop — a card is always live DOM.
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
