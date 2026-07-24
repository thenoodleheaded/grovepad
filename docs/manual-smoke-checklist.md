# Grovepad Manual Smoke Checklist

Run this checklist after every implementation phase, against a production build or the normal development server. Record any failure before merging the phase.

- [ ] Create a widget from the add-widget surface and confirm it appears with the expected default size and content.
- [ ] Drag the widget, then approach each of its four sides and a corner: the outline thickens there and the cursor matches the axis.
- [ ] Resize from a side and from a corner: the opposite side stays pinned, and pulling past a limit stretches a band that snaps back.
- [ ] Crush a resting tile diagonally into an icon, resize it continuously between 2×2 and 3×3 without live detents, and confirm release snaps to the nearer whole grid square. Then escape back by pulling past the ceiling. Nothing anywhere renders an icon smaller than 2×2.
- [ ] While hovering a card so it leans toward the pointer, start a resize: the lean must stay exactly where it was, not snap back to centre.
- [ ] Open a resting tile, drag one side of the open card far out, then close it: only that side moved, and the tile lands back on the exact spot it opened from.
- [ ] Create a second widget and connect compatible output and input ports; confirm the value propagates.
- [ ] Create a dependency and a relation; confirm their distinct line visuals, routing, selection, and deletion behavior.
- [ ] Pan and zoom the canvas, including far-zoom proxy mode, and confirm widgets and lines remain aligned.
- [ ] Undo and redo widget creation, movement, resizing, and connection changes without corrupting selection or history.
- [ ] Reload the page and confirm the active canvas, widgets, connections, relations, glue clusters, and camera restore.
- [ ] Open a nested canvas and return to its parent; confirm breadcrumbs/navigation and canvas contents are correct.
- [ ] Open Quick Add, create a deterministic suggestion, cancel another suggestion, and confirm no disconnected preview state remains.
- [ ] In two signed-in browser profiles, open the same invited canvas and confirm create/move/delete, note typing, cursors, selections, edit indicators, and participant departure appear on both sides.
- [ ] Disconnect one editor, make changes on both sides, reconnect, and confirm both clients converge without duplicate widgets or lost note characters; reload both clients to prove cold-start durability.
- [ ] Exercise Owner, Editor, Commenter, and Viewer accounts: only Owner manages access; Owner/Editor mutate; Commenter posts and replies only; Viewer remains read-only. Confirm prohibited direct API writes are rejected by RLS.
- [ ] Follow a collaborator while they pan and zoom; confirm local camera controls lock until follow is stopped and reduced-motion mode does not add cursor animation.

## Canvas engine (docs/canvas-engine.md)

- [ ] Drag-pan, wheel-pan, and ctrl/pinch zoom track the pointer exactly.
- [ ] Marquee select (Select mode drag or Shift+drag) selects exactly the enclosed widgets, and the camera does not move during the marquee.
- [ ] Widget drag, resize, glue (⌥-drag a widget to within a cell of another; ⌥-drag out to unglue), and undo behave identically on small and large boards; no console errors during the whole pass.

The phase gate is complete only when build, lint, automated tests, and all applicable checklist items pass. Items blocked by unavailable credentials or browser capabilities must be recorded explicitly in the phase handoff.
