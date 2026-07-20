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

The phase gate is complete only when build, lint, automated tests, and all applicable checklist items pass. Items blocked by unavailable credentials or browser capabilities must be recorded explicitly in the phase handoff.
