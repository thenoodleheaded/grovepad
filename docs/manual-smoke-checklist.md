# Grovepad Manual Smoke Checklist

Run this checklist after every implementation phase, against a production build or the normal development server. Record any failure before merging the phase.

- [ ] Create a widget from the add-widget surface and confirm it appears with the expected default size and content.
- [ ] Drag the widget, resize it, collapse and expand it, then confirm its content and position remain intact.
- [ ] Create a second widget and connect compatible output and input ports; confirm the value propagates.
- [ ] Create a dependency and a relation; confirm their distinct line visuals, routing, selection, and deletion behavior.
- [ ] Pan and zoom the canvas, including far-zoom proxy mode, and confirm widgets and lines remain aligned.
- [ ] Undo and redo widget creation, movement, resizing, and connection changes without corrupting selection or history.
- [ ] Reload the page and confirm the active canvas, widgets, connections, relations, groups, and camera restore.
- [ ] Open a nested canvas and return to its parent; confirm breadcrumbs/navigation and canvas contents are correct.
- [ ] Double-click a widget to enter focus mode, rearrange and resize an allowed panel, then exit and re-enter to confirm the layout persists.
- [ ] Open Quick Add, create a deterministic suggestion, cancel another suggestion, and confirm no disconnected preview state remains.
- [ ] In two signed-in browser profiles, open the same invited canvas and confirm create/move/delete, note typing, cursors, selections, edit indicators, and participant departure appear on both sides.
- [ ] Disconnect one editor, make changes on both sides, reconnect, and confirm both clients converge without duplicate widgets or lost note characters; reload both clients to prove cold-start durability.
- [ ] Exercise Owner, Editor, Commenter, and Viewer accounts: only Owner manages access; Owner/Editor mutate; Commenter posts and replies only; Viewer remains read-only. Confirm prohibited direct API writes are rejected by RLS.
- [ ] Follow a collaborator while they pan and zoom; confirm local camera controls lock until follow is stopped and reduced-motion mode does not add cursor animation.

## Canvas engine (docs/canvas-engine.md)

- [ ] Drag-pan, wheel-pan, and ctrl/pinch zoom track the pointer exactly; `html[data-canvas-motion]` reaches `fast` during a fling and returns to `idle` after stopping.
- [ ] Marquee select (Select mode drag or Shift+drag) selects exactly the enclosed widgets, and the camera does not move during the marquee.
- [ ] On a large board (`?bench=1` → prepare), the full-board overview appears instantly, far cards render as sprites, and stopping re-crisps nearby cards within a beat.
- [ ] Widget drag, resize, group (Cmd+G), and undo behave identically to a small board; no console errors during the whole pass.
- [ ] `npm run bench:canvas` (BENCH_HEADED=1) gates: coverage, residency, and cold-open PASS; frame numbers recorded in the handoff.

*Last executed 2026-07-21 (canvas-engine branch, commit 94ec7cc): all items above verified in Chromium; marquee failure observed once was an HMR ghost-listener artifact — passed after fresh reload.*

The phase gate is complete only when build, lint, automated tests, and all applicable checklist items pass. Items blocked by unavailable credentials or browser capabilities must be recorded explicitly in the phase handoff.
