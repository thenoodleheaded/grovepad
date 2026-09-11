# Quick Add command lexicon

Every action a user could type into the Quick Add line instead of hunting for it in the UI.

This is a **candidate list**, not a shipped contract. The `Backing` column is what makes it
real: `store` means a public action already exists and the command is pure translation work;
`derive` means the behavior exists but needs a small resolver (find-by-name, parse a duration);
`new` means real plumbing has to be built first. Ship the `store` rows first — they are the
cheapest commands in the app and they cover most of daily use.

Related: [scenario intelligence](scenario-intelligence.md) (today's sentence interpreter),
[circuit engine](circuit-engine.md) (per-widget commands), [codebase map](codebase-map.md).

---

## 1. Grammar

```
[verb] [count] [target/type] [preposition] [argument] [; next command]
```

- **Verb first.** The first recognized token decides the command. No verb → the line falls
  through to today's thought-capture behavior.
- **Selection is the subject.** With cards selected, every verb acts on them unless the line
  names a different target. With nothing selected, a verb that needs a target opens a pick list.
- **Filler is discarded.** `glue a note and a timer together` parses identically to `glue note timer`.
- **Argument types** are a closed set: widget type, skin name, count (`x3`, `3`), duration
  (`25m`, `1h30`), date (`friday`, `12 aug`), quoted or trailing title, colour/accent, tag,
  target-by-name, canvas name.
- **Chaining** with `;` or `then` runs several commands as one undo step.

### Universal modifiers

| Modifier | Meaning | Example |
| --- | --- | --- |
| `xN` / leading count | Repeat the noun N times | `add note x5` |
| `"…"` / trailing words | Title for what is created | `add note "call landlord"` |
| `all` | Ignore selection, act on the whole canvas | `fold all` |
| `here` | Place at cursor instead of view centre | `add timer here` |
| `under <name>` | Place as child of a named widget | `add checklist under Trip` |
| `in <canvas>` | Act inside another canvas | `add note in Inbox` |
| `!` suffix | Skip the preview and commit immediately | `delete!` |

---

## 2. Create

| Command | Does | Backing |
| --- | --- | --- |
| `add <widget>` | Create one widget at view centre | `store` — `createWidget` |
| `add <widget> x<N>` | Create N of the same widget | `store` |
| `add <a> <b> <c>` | Create several different widgets at once | `store` — `commitThoughtPlan` |
| `add <widget> "<title>"` | Create with a title already set | `store` |
| `note` / `todo` / `timer` … | Bare widget name implies `add` | `derive` |
| `add <widget> here` | Create at the cursor, not the view centre | `store` |
| `add <widget> under <name>` | Create as a child of a named widget | `derive` |
| `add <widget> from clipboard` | Create seeded with clipboard text | `new` |
| `capture <text>` | Today's interpret-a-sentence path, explicitly invoked | `store` |
| `blank` / `card` | Create the default note card | `store` |
| `duplicate` / `dupe` | Copy the selection in place | `store` — `duplicateWidgets` |
| `duplicate x<N>` | Make N copies | `store` |
| `clone branch` | Copy the selection with all its descendants | `derive` |
| `recipe <name>` | Drop a recipe board onto the canvas | `derive` — recipe catalogue |
| `template <name>` | Instantiate a saved template | `derive` |
| `paste` | Paste clipboard widgets at the cursor | `store` — `pasteWidgets` |
| `import <file>` | Open the import sheet, or import a named file | `store` — `setImportOpen` |
| `import mindmap` | Import a mindmap outline as a tree | `store` — `importMindmap` |

**Widget vocabulary.** Every one of the ~180 `ModuleType` values is a valid noun, matched by
label, id, and alias. `todo`→`checklist`, `timer`→`timekeeper`, `sheet`/`spreadsheet`→`table`,
`draw`/`sketch`→`sketchpad`, `link`/`bookmark`→`links`, `pic`/`photo`→`media`,
`money`/`spend`→`budget`, `chart`/`graph`→`bar_chart`, `map`/`place`→`location`,
`cards`→`flashcards`, `person`→`contact`, `vote`→`poll`.

---

## 3. Structure — trees, glue, links

| Command | Does | Backing |
| --- | --- | --- |
| `child <widget>` | Add a child under the selection | `derive` — `createWidget` + `addRelation` |
| `sibling <widget>` | Add a sibling beside the selection | `derive` |
| `parent <widget>` | Wrap the selection under a new parent | `derive` |
| `parent` (no arg) | Make the *first* selected card parent of the rest | `store` — `addRelation` |
| `branch <a> <b> <c>` | Add several children at once | `store` — `commitThoughtPlan` |
| `unparent` / `detach` | Break the link to the parent | `store` — `deleteRelation` |
| `reparent to <name>` | Move the selection under a different parent | `derive` |
| `glue` | Weld the selected cards into one cluster | `store` — `glueWidgets` |
| `glue <a> <b>` | Create the named widgets already welded | `derive` |
| `unglue` | Break the selection out of its cluster | `store` — `unglueWidget` |
| `unglue all` / `dissolve` | Break the whole cluster apart | `store` — `unglueCluster` |
| `name glue <text>` | Rename the cluster | `store` — `renameGlue` |
| `collapse cluster` / `expand cluster` | Fold or unfold a glued cluster | `store` — `setClusterCollapsed` |
| `link a to b` | Draw a relation between two cards | `store` — `addRelation` |
| `blocks <name>` / `blocked by <name>` | Create a blocker dependency | `store` |
| `conflicts with <name>` | Mark a conflict relation | `store` |
| `cousin <name>` / `co-parent <name>` | Add the softer relation types | `store` |
| `unlink <name>` | Delete the relation between two cards | `store` — `deleteRelation` |
| `resolve` / `unresolve` | Toggle a dependency's resolved state | `store` — `toggleResolveRelation` |
| `critical path` | Highlight the critical path | `store` — `toggleCriticalPath` |
| `hold` / `unhold` | Toggle strict hold (family drags together) | `store` — `updateWidgetMetadata` |
| `shape` | Open the ghost tree shaper at the cursor | `store` — `startGhostShaper` |
| `outline <indented text>` | Build a whole tree from an indented list | `derive` — `planLayout` |

---

## 4. Selection

| Command | Does | Backing |
| --- | --- | --- |
| `select <name>` | Select a card by title | `derive` |
| `select all` | Select everything on the canvas | `store` — `selectWidgets` |
| `select none` / `deselect` | Clear the selection | `store` — `clearSelection` |
| `select <type>` | Select every card of one widget type | `derive` |
| `select children` / `select parent` | Walk the tree from the selection | `derive` |
| `select branch` / `select tree` | Select the selection plus all descendants | `derive` |
| `select cluster` | Select everything glued to the selection | `derive` |
| `select pinned` / `locked` / `favorites` | Select by metadata flag | `derive` |
| `select done` / `select incomplete` | Select by completion state | `derive` |
| `select overdue` / `due today` | Select by deadline badge | `derive` |
| `select tagged <tag>` | Select by tag pill | `derive` |
| `select recent` | Select the most recently created or edited | `derive` |
| `invert selection` | Swap selected and unselected | `derive` |
| `add to selection <name>` | Extend the selection by name | `store` — `selectWidget` additive |

---

## 5. Appearance — skins, faces, accents

| Command | Does | Backing |
| --- | --- | --- |
| `skin <name>` | Change the selected cards' skin | `derive` — `updateWidgetData` skinField |
| `skin` (no arg) | Show the skin list for the selected type | `derive` |
| `next skin` / `previous skin` | Roll through the skin family | `derive` |
| `<skin name>` alone | With a selection, a bare skin name reskins it | `derive` |
| `accent <colour>` | Set the card accent | `store` — `updateWidgetMetadata` |
| `clear accent` | Return to the default accent | `store` |
| `fold` / `unfold` | Send to resting face, or open the full card | `store` — `setWidgetScaleState` |
| `icon` / `iconify` | Collapse to the icon face | `store` |
| `open` / `expand` | Open the full editable card | `store` |
| `fold all` / `open all` | Apply to the whole canvas | `store` |
| `bigger` / `smaller` | Step the card size up or down | `store` — `resizeWidget` |
| `size <w>x<h>` | Set an explicit size in cells | `store` |
| `fit content` | Shrink the card to its content | `derive` |
| `rename <text>` | Retitle the selected card | `store` — `updateWidgetTitle` |
| `rename` (no arg) | Start inline rename on the selection | `store` — `startRenaming` |

**Skin vocabulary.** Every skin `label` and `value` in the generated blueprints is a noun —
`kanban`, `timeline`, `ledger`, `gallery`, `terminal`, `dashboard`, `matrix`, `pomodoro`,
`stopwatch`, `deadline`, `sticky`, `daily log`, and the rest of the catalogue.

---

## 6. State and metadata

| Command | Does | Backing |
| --- | --- | --- |
| `pin` / `unpin` | Hold the card open across other expansions | `store` — `toggleWidgetPinned` |
| `lock` / `unlock` | Prevent moving and editing | `store` — `lockWidgets` |
| `favorite` / `unfavorite` | Flag the card as a favourite | `store` — `toggleWidgetFavorite` |
| `done` / `complete` | Mark completed | `store` — `updateWidgetMetadata` |
| `undone` / `reopen` | Clear the completed flag | `store` |
| `flag <level>` | Set a priority flag (low/medium/high/urgent) | `store` — badges |
| `unflag` | Remove the priority flag | `store` |
| `status <colour>` | Set the status dot | `store` — badges |
| `tag <name>` / `untag <name>` | Add or remove a tag pill | `store` — badges |
| `clear tags` | Remove every tag pill | `store` |
| `due <date>` | Attach a deadline countdown badge | `derive` — date parsing |
| `clear due` | Remove the deadline badge | `store` |
| `assign <initials>` | Add an assignee avatar | `store` — badges |
| `unassign` | Remove assignees | `store` |
| `clear badges` | Strip every badge | `store` |
| `front` / `back` | Raise or lower the stacking order | `store` — `bringWidgetToFront` |

---

## 7. Lifecycle

| Command | Does | Backing |
| --- | --- | --- |
| `delete` / `remove` | Delete the selection (with preview) | `store` — `deleteWidgets` |
| `delete <name>` | Delete a card by name, via pick list | `derive` |
| `delete <type>` | Delete every card of a type | `derive` |
| `delete empty` | Delete every untouched, empty card | `derive` |
| `cut` | Cut to clipboard | `store` — `cutWidgets` |
| `copy` | Copy to clipboard | `derive` |
| `clear canvas` | Delete everything (double confirm) | `derive` |
| `undo` / `redo` | Step board history | `store` — `undo` / `redo` |
| `undo <N>` | Step back N times | `derive` |
| `archive` | Move the selection to an archive canvas | `new` |
| `restore` | Bring the selection back from archive | `new` |

---

## 8. Layout and arrangement

| Command | Does | Backing |
| --- | --- | --- |
| `align left/right/top/bottom/center` | Align the selection | `store` — `alignSelection` |
| `distribute horizontally/vertically` | Even out the spacing | `store` — `distributeSelection` |
| `untangle` | Resolve overlaps for the selection | `store` — `untangleWidgets` |
| `untangle all` / `tidy` | Untangle the whole canvas | `store` — `untangleCanvas` |
| `settle` | Drop cards into the nearest lane | `store` — `settleWidgets` |
| `snap` | Snap the selection to the grid | `store` — `snapWidgetToGrid` |
| `autoscale` | Rescale the canvas to fit its content | `store` — `autoScaleCanvas` |
| `nudge <dir> [N]` | Move the selection by N cells | `store` — `nudgeSelection` |
| `move to <x> <y>` | Move to explicit coordinates | `store` — `moveWidget` |
| `stack` / `row` / `column` / `grid` | Arrange the selection in a shape | `derive` |
| `space <N>` | Set the gap between selected cards | `derive` |
| `center` | Move the selection to the view centre | `derive` |

---

## 9. Navigation and camera

| Command | Does | Backing |
| --- | --- | --- |
| `go <canvas>` | Open a canvas by name | `store` — `navigateToCanvas` |
| `go <widget>` | Pan to a card by name | `derive` — `fitRect` |
| `find <text>` / `search <text>` | Open search prefilled | `store` — `searchWidgets` |
| `frame` | Frame the selection | `store` — `fitRect` |
| `fit` / `fit all` | Fit the whole board | `store` — `fitAll` |
| `zoom <N>` | Zoom to a percentage | `store` — `zoomTo` |
| `zoom in` / `zoom out` | Step the zoom | `store` |
| `back` / `forward` | Step view history | `store` — `goBack` / `goForward` |
| `home` / `origin` | Return to the canvas origin | `store` — `setView` |
| `next` / `previous` | Move the selection along the outline order | `derive` — `canvasOutline` |
| `up` / `down` | Move the selection up or down the tree | `derive` |

---

## 10. Canvases and workspaces

| Command | Does | Backing |
| --- | --- | --- |
| `new canvas <name>` | Create a child canvas | `store` — `createWidget` (`canvas_node`) |
| `rename canvas <name>` | Rename the current canvas | `store` — `renameCanvas` |
| `move canvas to <parent>` | Reparent the canvas | `store` — `reparentCanvas` |
| `open tab <canvas>` | Open a canvas in a background tab | `store` — `openCanvasTab` |
| `close tab` | Close the active tab | `store` — `closeCanvasTab` |
| `next tab` / `previous tab` | Cycle tabs | `store` — `activateCanvasTab` |
| `send to <canvas>` | Move the selection into another canvas | `derive` |
| `extract to canvas` | Turn the selection into its own canvas | `derive` |
| `new workspace <name>` | Create a workspace | `store` — `createWorkspace` |
| `switch to <workspace>` | Change workspace | `store` — `switchWorkspace` |
| `rename workspace <name>` | Rename the workspace | `store` — `renameWorkspace` |
| `tree` | Open the canvas tree drawer | `store` — `setOpen` |
| `share` / `unshare` | Toggle canvas sharing | `derive` — `updateCanvasSettings` |
| `invite <email>` | Invite a collaborator | `new` |
| `export` | Export the board file | `derive` |

---

## 11. Circuit and wires

| Command | Does | Backing |
| --- | --- | --- |
| `circuit` | Toggle Circuit mode | `store` — `toggleCircuitMode` |
| `wire <a> to <b>` | Connect two widgets | `store` — `addConnection` |
| `wire <a>.<port> to <b>.<port>` | Connect explicit ports | `store` |
| `unwire <a> <b>` | Delete the connection | `store` — `deleteConnection` |
| `unwire all` | Remove every connection on the selection | `derive` |
| `disable wire` / `enable wire` | Toggle a connection without deleting it | `store` — `updateConnection` |
| `chain` | Wire the selected cards in sequence | `derive` |
| `trigger <command>` | Fire a widget command by hand | `store` — `commandsFor` |
| `run` / `fire` | Run the selected automation | `derive` |

---

## 12. Widget verbs

Generated from each widget's declared `commandsFor` entries, so new widgets bring their own
verbs with them. Today's declared commands plus the natural verbs each family suggests:

| Command | Applies to | Backing |
| --- | --- | --- |
| `start` / `pause` / `stop` / `reset` | Timers, stopwatches, pomodoro | `store` — `reset` declared |
| `start <duration>` | Timer with an explicit length (`start 25m`) | `derive` |
| `check <item>` / `uncheck <item>` | Checklists | `derive` |
| `check all` / `uncheck all` | Checklists | `store` — declared |
| `add item <text>` | Checklists, bullets, lists, inventories | `store` — declared |
| `clear items` / `clear done` | Lists | `derive` |
| `increment` / `decrement` / `+N` / `-N` | Counters, trackers, habits | `store` — declared |
| `reset count` | Counters | `store` |
| `mark today` / `skip today` | Habit trackers | `derive` |
| `clear` | Sketchpad, drawing surfaces | `store` — declared |
| `add zone <city>` | World clock | `store` — declared |
| `add row` / `add column` | Tables, matrices | `derive` |
| `sort by <column>` | Tables | `derive` |
| `add entry <amount>` | Budget, expenses, logs | `derive` |
| `add link <url>` | Link cards | `derive` |
| `vote <option>` | Polls | `derive` |
| `rate <N>` | Rating cards | `derive` |
| `flip` / `next card` | Flashcards | `derive` |
| `set date <date>` | Date cards | `derive` |
| `set status <value>` | Status cards | `derive` |
| `set formula <expr>` | Formula, calculator | `derive` |
| `set value <n>` | Number inputs, sliders | `store` — `updateWidgetData` |
| `toggle` | Toggle cards | `derive` |

---

## 13. Panels, app surfaces, settings

| Command | Does | Backing |
| --- | --- | --- |
| `widgets` / `library` | Open the widget library | `store` — `openAddWidget` |
| `recipes` | Open the recipe catalogue | `store` — `setRecipesOpen` |
| `settings` | Open settings | `store` — `setOpen` |
| `shortcuts` / `help` / `?` | Open the controls reference | `store` — `setShortcutsOpen` |
| `commands` | List every command in the bar | `new` |
| `minimap` | Toggle the minimap | `derive` |
| `dark` / `light` | Switch theme | `derive` |
| `reduce motion on/off` | Toggle reduced motion | `store` — `update` |
| `aura on/off` | Toggle the canvas aura | `store` — `update` |
| `magnetic on/off` | Toggle magnetic hover | `store` — `update` |
| `quality high/low` | Set the visual budget | `store` — `update` |
| `connector on/off` | Toggle the MCP connector | `store` — `update` |
| `sign in` / `sign out` | Account actions | `derive` |

---

## 14. Meta — the commands about commands

| Command | Does | Backing |
| --- | --- | --- |
| `a ; b ; c` | Run several commands as one undo step | `new` |
| `save as <name>` | Save the last chain as a named command | `new` |
| `<saved name>` | Run a saved chain | `new` |
| `repeat` | Re-run the last command | `new` |
| `again x<N>` | Re-run the last command N times | `new` |
| `forget <name>` | Delete a saved command | `new` |
| `commands <letter>` | Browse the vocabulary alphabetically | `new` |

---

## 15. Build order

1. **Round one — pure translation.** Create, delete, duplicate, pin/lock/favorite, fold/open,
   rename, undo/redo, align/distribute/untangle, frame/zoom/go, glue/unglue, skin. Every one
   maps to an existing store action; the work is parser, highlighter, and preview.
   **Shipped 2026-08-11**: grammar and registry in `src/utils/commandLine.ts`, dispatch in
   `src/utils/commandExecutor.ts`, UI (token highlighting, verb suggestions, run row,
   teaching row) in `QuickAddSheet.tsx`.
2. **Round two — resolvers.** Find-by-name targeting, date and duration parsing, tree verbs
   (child/sibling/parent), select-by-property.
3. **Round three — generated verbs.** Widget commands sourced from `commandsFor`, so the
   lexicon grows whenever a widget declares a command.
4. **Round four — macros.** Chaining, saved commands, repeat.
