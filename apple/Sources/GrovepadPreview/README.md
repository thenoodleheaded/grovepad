# Grovepad Preview (macOS)

A small, throwaway window for trying the finished engine pieces of the native
port by hand. It is **not** the app: no sidebar, no settings, no login, no
polish — the real app is the Xcode project under `apple/App/`. Since the app
layer landed, the preview is a thin shell over the same `AppCoordinator`
(document, local store, autosave, circuit driver, device state) and the same
`MacCanvasHostView` (`Sources/GrovepadApp/Canvas/`) the app uses, so what you
feel here is exactly what the app's canvas does.

## Launch

```sh
cd apple
swift run GrovepadPreview
```

(Use `swift run --scratch-path .build/preview GrovepadPreview` if another
build may be running in the default scratch folder.)

The window opens on whatever was autosaved last time, or an empty board with
one canvas. `GROVEPAD_PREVIEW_STORE=/some/folder` points the autosave elsewhere.

### Hands-off smoke run

```sh
GROVEPAD_PREVIEW_SMOKE=1 GROVEPAD_PREVIEW_STORE=/tmp/grovepad-smoke swift run GrovepadPreview
```

Creates two cards, opens one, wires them through the linking controller,
edits the source, checks the circuit driver delivered, undoes, flips Circuit
Mode, waits for the autosave and quits (exit 0 on success, 1 on the first
failed check). Always give it a scratch store folder so it never touches your
real board.

## What works

- **Camera** — wheel and trackpad two-finger pan, pinch or Ctrl/⌘+wheel zoom at
  the cursor, drag on empty canvas to pan, middle-drag to pan, Space+drag to
  pan, Z+drag to zoom into a box, Shift+drag to marquee-select (Shift adds,
  Option subtracts). **Fit** (⌘0) frames every card.
- **Cards** — the eight ported widgets (Text, Canvas, Bullets, Checklist, Study
  Deck, Counter, Toggle, Number Input) from the **Add** menu, created at the
  middle of the view. Cards rest as tiles (bitmaps); click a tile to open it,
  click empty canvas to close it. Hovering a card mounts it live. Drag a card's
  name row to move it (snaps on release, one undo step). Delete/Backspace
  deletes the selection. A Canvas card's door opens its canvas; **‹ Back**
  returns to the parent.
- **Undo/Redo** — Edit menu (⌘Z / ⇧⌘Z) through the document's UndoManager.
- **Circuits** — port rails show on the hovered/open card and on every card in
  Circuit Mode (⚡ or `W`). Drag from an output dot to an input dot to wire; drop
  on a card body to pick the input from a list; click a wire (or its value chip)
  to open the inspector (transform, edge, enable, delete, re-arm). The circuit
  driver runs on a real 30 s heartbeat, so wired values flow as you edit.
- **Files** — File ▸ Open… replaces the board with a `.grovepad` package;
  File ▸ Save As… writes one. Autosave writes the board to
  `~/Library/Application Support/GrovepadPreview/board/` half a second after
  the last change and reloads it on launch; the camera is remembered per
  canvas (device state).

## What does not (yet)

- No resize handle, no glue/welding, no relations or dependencies, no skin
  roller (the title row's skin button does nothing here), no glass budget
  (cards draw the plain backplate), no touch input, no minimap, no
  multi-window. Right-click on a card shows the system context menu.
- Selection is drawn as an outline only; cards do not push neighbours.
- Cards that are not selected, hovered or open are static bitmaps; their
  buttons come alive when you hover them.
- The preview is intentionally unstyled. The real chrome is roadmap phase 5.
