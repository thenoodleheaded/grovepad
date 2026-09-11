# Demo boards

`grovepad-launch-showcase.grovepad` is a ready-made Grovepad board built for the
launch film. It is a normal `.grovepad` package — the same file the app's own
export produces — so there is nothing special to install.

## Opening it

Drag the file onto the canvas (or use **Settings → Import**). It lands as one
Canvas card holding the whole tree, so it never touches boards you already have.
Click **Enter** on that card to go inside.

Everything below is on this device only. Nothing is uploaded.

## What is inside

Nine canvases, 157 cards, 6 welded clusters, 80 relation lines and 67 live wires.

| Canvas | What it shows |
|---|---|
| **Launch Board** | The hub. Five Canvas cards, each a door into a world below, plus a welded "Right now" cluster (focus timer + today's list + study streak). |
| **Semester HQ** | School tracking — assignments with due dates, weighted grades, GPA, a study deck, past papers, a mistake bank, a skill tree, a term calendar. |
| **Exam Sprint** | A study circuit. Sessions and a checklist feed an aggregator; paper scores drive a readiness ring, a band, a composed sentence and a nudge; a morning pulse resets the day. |
| **Lecture Vault** | Notes and sources — lecture notes, a formula sheet, citations, a graph-paper sketch, a study log. |
| **Money Center** | Budget, subscriptions, debt payoff, savings goal, a savings circle, spending charts, renewals, giving. A slider drives the debt plan. |
| **Freelance Studio** | Invoices, hours, quotes, scope, pipeline, waiting-on. An overdue invoice arms a chase reminder. |
| **Life Systems** | Home and health — hydration, sleep, vitals, medication, training, a week of meals, chores, plants, upkeep, a trip and its packing list. |
| **Studio** | Creative and project work — outline, work board, palette, sketchpad, a weighted decision, SWOT, risks, a print runbook, a cover vote. |
| **Automation Lab** | The wiring showcase, laid out left to right: inputs → logic → outputs. Blue carries numbers, green yes/no, purple text, amber a series, rose fires events. |

## Filming notes

- Cards rest as compact summary tiles and open into the full card on click. Cards
  whose type has no summary tile are **pinned open**, so nothing on these boards
  reads as an empty square.
- Wires only recompute when a source changes, so every wired target is already
  filled with the value it will settle at. Move a slider and the chain animates.
- Deadlines and due dates are generated relative to the build date. Re-run the
  generator before filming so nothing on screen has expired.

## Rebuilding

```bash
npm run demo:boards
```

The generator lives in [`scripts/demo/`](../scripts/demo). It checks every card,
skin, port and command against the live widget registry as it builds, and reads
the finished package back through the importer's own parser before writing it,
so a board that would not survive a real import fails the build instead.
