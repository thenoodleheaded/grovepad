# Grovepad cinematic launch video — Claude HTML animation prompts

This is a production-ready interpretation of `grovepad_launch_video_production_bible.pdf`, corrected against the current Grovepad product.

The PDF has a strong dramatic arc, but several product details have changed since it was written. The prompts below preserve its 90-second rhythm while making the on-screen behavior faithful to Grovepad today.

## The idea the film should sell

Grovepad is not simply another infinite canvas. The launch film should communicate this progression:

1. A thought begins as something small and human.
2. It gains spatial context.
3. Cards become a visual system rather than a pile of windows.
4. Related cards can be physically joined.
5. Typed data can travel between cards and make the board react.
6. One important card can come forward without losing the surrounding context.
7. A plain-language thought can become a private, structured workflow.
8. The same thinking surface can continue across collaboration, drawing, and an OS widget.

The emotional arc is: **intimate → expansive → intelligent → tactile → calm → iconic**.

## Important corrections to the original production bible

| In the PDF | Current Grovepad truth | Direction used here |
|---|---|---|
| The cover says 11 shots | The document contains 12 numbered shots | Keep all 12 shots |
| Near-black/blue visual world | Grovepad’s canvas is moss-charcoal with a fine green grid and localized aura pools | Use the real canvas palette |
| SF Pro or Outfit | Grovepad uses Clash Display | Use Clash Display wherever possible |
| Generic emerald wires | Circuits use data-type colors | Number = azure, boolean = spring green, text = violet, series = amber, trigger = rose |
| GroupPlate and Cmd-G grouping | Grouping has been replaced by magnetic glue/weld using Option-drag | Shot 05 shows cards welding edge-to-edge, with no surrounding plate |
| Slider directly drives a bar chart | A scalar number does not directly write a chart’s series field | Shot 06 uses Number Input → Formula → Progress |
| Double-click any card to enter it | A Canvas card has an explicit Enter/Open control | Shot 04 clicks Enter on a Live Thumbnail Canvas card |
| Focus Mode makes three floating islands | A resting card expands in place and creates a local blur/dim halo | Shot 09 shows one card coming forward while its surroundings remain visible |
| Double-click a card to focus | A plain click expands a resting card; double-click is used elsewhere | Shot 09 uses one deliberate click |
| “Hundreds” of cards in the hero reveal | That would read as noise at launch-video speed | Show roughly 30 meaningful cards with clear hierarchy |
| “Local AI instantly builds” without showing its privacy model | Quick Add creates an immediate local plan and can use an optional on-device model | Show “Private · on this device,” never a cloud bot or assistant avatar |
| Silver invented logo | Grovepad already has a distinctive mark and white/emerald wordmark | Use the real logo asset and brand treatment |

## Shared master brief for Claude

Paste this block at the beginning of every new Claude conversation, then append one shot prompt from the next section.

```text
You are a senior motion designer and front-end animation engineer creating one shot for a premium cinematic software launch film.

Build one completely self-contained HTML file for the Grovepad launch video shot described after this master brief.

OUTPUT AND CAPTURE
- Return the complete HTML, CSS, and JavaScript in one file, with no explanation before or after it.
- Design on a fixed internal stage of 3840 × 2160, 16:9. Scale the stage proportionally to fit any browser viewport without changing its composition.
- The animation must look sharp at 4K and run smoothly at 60 fps in Chromium.
- The shot plays once from frame zero and then holds its final composition. Do not create ambient loops, endlessly blinking decorations, or uncontrolled random motion.
- Use one deterministic master requestAnimationFrame timeline. Base every movement on elapsed milliseconds from that clock.
- Provide:
  - window.seekShot(milliseconds), which renders an exact deterministic frame;
  - window.restartShot(), which restarts from zero;
  - window.shotReady = true only after fonts and assets are ready.
- Keyboard capture helpers: Space toggles play/pause and R restarts. They must not appear visually.
- Add a query parameter `?controls=1` that reveals a small timeline scrubber and time readout for development. Hide all controls by default.
- Add a query parameter `?reduced=1` that jumps to a clean final state. Also respect prefers-reduced-motion unless `?capture=1` is present.
- Do not depend on React, Vue, animation libraries, WebGL, a build step, or external JavaScript.
- Prefer semantic HTML, CSS transforms, SVG, gradients, masks, filters, and canvas only where canvas materially helps.
- No stock photos, fake screenshots, rasterized UI text, emoji, or copyrighted device logos.

GROVEPAD VISUAL SYSTEM
- The visual world is premium, quiet, tactile, and precise—not a generic neon cyberpunk dashboard.
- Canvas base: #141815 to #1b1f1c, with an extremely subtle moss-green square grid.
- Cards are smoked glass. Use a single backplate per card: translucent charcoal, a restrained top highlight, soft inner shadow, thin low-opacity border, and a localized green aura behind important cards.
- Card outer radius: 22 px at the unscaled UI level. Internal islands: 10 px radius. Input wells: 8 px radius.
- The signature green is an acidic young-leaf green. Use approximately #9CFF38 for luminous accents and a deeper #10B981 for emerald status/details. Do not wash the whole frame in green.
- Typed circuit colors:
  - number: #31A6FF
  - boolean: #1FE58C
  - text: #B46BFF
  - series: #FFAB1A
  - trigger: #FF5470
- Typography: Clash Display if available, otherwise use a carefully tuned modern grotesk fallback. Headlines are confident and compact. UI labels remain readable and restrained.
- Grovepad’s wordmark is lowercase: “grove” in warm white and “pad” in bright green.
- Motion curve for most UI movement: cubic-bezier(0.22, 1, 0.36, 1).
- Typical layout movement: 300 ms. Content reveal: 260 ms. Magnetic snap: 120–180 ms.
- Motion should feel mass-bearing: quick initial intent, controlled deceleration, then stillness. Avoid bouncy spring toys.
- Cursor movement should follow a gentle curved path with subtle acceleration and deceleration. Never teleport it.
- After every important interaction, leave enough stillness for an editor to cut.

PRODUCT ACCURACY
- A resting face is a compact, content-derived version of a card, not a generic icon tile.
- When a resting card expands, its compact face fades into the full card in place. Nearby cards remain visible.
- Magnetic glue joins individual cards edge-to-edge. Each card keeps its own glass backplate. Never draw a large GroupPlate or bounding container around glued cards.
- Circuits are typed, directed connections between explicit ports. A small one-shot delivery dash may travel along a wire for about 900 ms after a value changes.
- Relations, dependencies, and live circuit wires are different concepts and should not all look identical.
- Quick Add is private and on-device. Its preview is a small spatial blueprint, not a chatbot conversation.
- Use plausible, meaningful product content. Never fill the UI with lorem ipsum.

CAMERA AND COMPOSITING
- Treat the flat web stage like a motion-control camera: use one world container for pan, scale, and very restrained perspective.
- UI must remain legible and geometrically stable. Never tilt a screen so far that it stops looking like a real product.
- Use a mild filmic vignette, very fine grain, and soft bloom only around true light sources. Keep grain below the point where text becomes dirty.
- Keep title-safe margins. Any feature callout must sit at least 8% from the frame edges.
- If the shot prompt includes a feature callout, render it as small editorial typography—not a giant marketing banner. Fade it in, hold it, and fade it out cleanly.
- Do not render the voiceover as subtitles unless explicitly requested.

QUALITY BAR
- The final result should resemble a polished Apple-level software film with Grovepad’s own moss-glass identity.
- Every UI element must have a reason to exist.
- At the final frame, verify: no clipped text, no overflowing cards, no cursor parked over important copy, no half-finished transition, and no visible development controls.
```

---

## Shot 01 — The first thought

**Time:** 0:00–0:05  
**Role:** Establish intimacy, restraint, and the tactile character of Grovepad.  
**Voiceover:** “Our minds don’t work in linear lists…”

Append this to the master brief:

```text
Create `shot-01-first-thought.html`, duration exactly 5,000 ms.

DIRECTOR’S INTENT
Begin in near-silence and near-darkness. The viewer should feel as if a thought is appearing before the software does. This is not a feature demonstration yet; it is an invitation into Grovepad’s visual world.

COMPOSITION
- Begin on a full-frame Grovepad moss-charcoal canvas.
- Include a barely visible 40 px square grid, scaled appropriately for the 4K stage.
- Place one Note card slightly below and right of center so the negative space feels intentional.
- Show the full card, approximately 700 × 440 stage pixels.
- Above the card, place Grovepad’s small title capsule reading “Project Odyssey.”
- Inside the card, show a warm-white text caret in an empty writing area.
- Behind the card, add one localized irregular aura pool: very soft green near the lower-right edge, fading completely within roughly one card width.
- No toolbar, no other cards, no floating particles, and no decorative network lines.

CARD DETAIL
- The Note card should have one smoked-glass backplate, a restrained edge highlight, a dark paper-like content surface, and a tiny “NOTE” eyebrow.
- Add two faint text-guide lines only—enough to imply a writing surface without looking like a form.
- The caret should blink only twice during the shot, with a natural 530 ms rhythm, then remain visible for the final hold.

TIMELINE
- 0–450 ms: almost black. Let the grid and aura rise from zero opacity.
- 450–1,400 ms: the card resolves from soft defocus and 97% scale to full clarity and scale. Keep the movement under 20 stage pixels.
- 1,400–4,100 ms: execute a slow virtual-camera push of about 5%. Add a nearly imperceptible 0.6-degree parallax shift between grid, aura, and card.
- 2,000–3,600 ms: perform the two caret blinks.
- 4,100–5,000 ms: complete stillness for the editorial cut.

LIGHT AND SOUND CUES
- Although the HTML need not generate audio, add timeline comments at 450 ms for a low glass bloom and at 1,900 ms for the first key-tick cue.
- Use no visible feature callout in this shot.

ACCURACY GUARDRAILS
- The title is in the capsule above the card; the writing caret is in the Note body.
- Do not make the card electric blue, pure black, or excessively transparent.
- Do not add a fake macOS window frame.
```

## Shot 02 — A thought becomes content

**Time:** 0:05–0:10  
**Role:** Turn the abstract opening into a human act, then prepare the great reveal.  
**Voiceover:** “…or rigid subfolders. We think in connections…”

```text
Create `shot-02-thought-becomes-content.html`, duration exactly 5,000 ms.

CONTINUITY
Match Shot 01’s final frame exactly at frame zero: the same Note card, canvas position, title capsule, light, and camera scale. The edit between the two files should be invisible.

ACTION
Type the sentence “Project Odyssey launch strategy” into the Note body. Use a convincing human rhythm rather than a uniform typewriter effect:
- fast clusters for familiar words;
- 70–105 ms normal key intervals;
- one 180 ms thought pause after “Odyssey”;
- a final 260 ms pause before the card changes state.

The title capsule remains “Project Odyssey.” Do not mistakenly type into the title.

RESTING-FACE TRANSFORMATION
After the sentence is complete, transform the full Note into Grovepad’s content-derived resting face:
- The full writing surface softly compresses toward its own center.
- The card’s outer footprint reduces from about 700 × 440 to about 430 × 210 stage pixels.
- The sentence remains visible, reflowed into two compact lines, so the resting face clearly derives from the content.
- Keep the title capsule attached above it.
- Crossfade internal controls instead of shrinking them until they become illegible.
- The transformation should take 300 ms with cubic-bezier(0.22, 1, 0.36, 1).

TIMELINE
- 0–350 ms: continuity hold.
- 350–3,350 ms: type the sentence with the rhythm described above.
- 3,350–3,700 ms: hold on the complete thought.
- 3,700–4,050 ms: fold into the content-derived resting face.
- 4,050–5,000 ms: begin a subtle camera withdrawal from 100% to 88%, revealing more grid but no other cards yet. Finish in stillness.

VISUAL DETAILS
- Each key may create an extremely subtle localized green response in the card border, never a glowing pulse around every letter.
- Keep the cursor out of view; the typing itself is the action.
- No feature callout.

CAPTURE NOTES
- Put a JavaScript timeline marker named `sentenceComplete` at 3350 ms and `restingFaceComplete` at 4050 ms.
- The first and last frames must be clean edit points.
```

## Shot 03 — The great reveal

**Time:** 0:10–0:18  
**Role:** Deliver scale and the product name without sacrificing legibility.  
**Voiceover:** “…in space… and in relationships. Introducing Grovepad.”

```text
Create `shot-03-great-reveal.html`, duration exactly 8,000 ms.

OPENING CONTINUITY
Begin on Shot 02’s compact “Project Odyssey” Note resting face. Start close enough that it nearly fills the middle third of the frame.

WORLD DESIGN
Build one authored Grovepad hero board containing 30–34 meaningful cards. It should feel like a real launch-planning workspace rather than randomly scattered widgets.

Organize the board into four readable regions:
1. Strategy: Project Odyssey note, Launch Goals, Audience, Positioning.
2. Product: 2026 Product Architecture Canvas portal, Roadmap tasks, Feature Priorities, Release Clock.
3. Operations: Project Ledger table, Budget, Owners, Risks.
4. Signal: Launch Metrics chart, Conversion goal, Feedback notes, Decision Log.

Use a varied but controlled selection of content-derived resting faces: Note, Tasks, Goal, Time, Table, Chart, Counter, Formula, Study Deck, and one Canvas card. Keep two important cards expanded and pin the rest as compact resting faces.

Include:
- two small edge-welded glue clusters;
- two quiet semantic relation lines;
- one amber dependency line;
- one small live-circuit chain using valid typed colors;
- one “Live Thumbnail” Canvas portal;
- localized aura pools behind no more than 10–12 important cards;
- the real Grovepad toolbar and zoom HUD entering only after the board is readable.

Do not show a giant GroupPlate. Do not connect every card. Negative space is part of the design.

CAMERA
- The movement is a smooth zoom-out and slight diagonal crane, not a spinning 3D board.
- Start around world scale 3.1.
- End around world scale 0.46, with the authored board occupying roughly 78% of the frame and breathing room around it.
- Use mild depth parallax: the grid moves least, aura pools slightly more, cards together as one stable plane.
- Keep all cards face-on enough to read.

TIMELINE
- 0–700 ms: hold on the original thought.
- 700–5,400 ms: execute the great withdrawal. Let nearby cards appear first and the wider system resolve progressively.
- 2,200–4,800 ms: as specific regions enter frame, allow only their one-shot content details to settle—one progress ring completes, one dependency line draws, one chart trace resolves.
- 5,400–6,100 ms: decelerate fully.
- 5,900–7,100 ms: fade in the small editorial wordmark “grovepad” centered in safe negative space: “grove” warm white, “pad” green. Do not cover the board.
- 7,100–8,000 ms: fade the wordmark down and hold the full hero board for the cut.

UI DETAIL
- Top toolbar should be dark glass with compact actions such as Widget, Recipes, Shape, Circuit, Search, and Settings.
- Zoom HUD sits unobtrusively at bottom right.
- Titles and tiny content must remain plausible at close range, even if not all are legible at the final wide scale.

ACCURACY AND TASTE
- Use roughly 30 cards, not “hundreds.”
- Avoid a giant radial mind map. Grovepad is spatial and composed, not automatically centered.
- No fake AI sparkles, orbiting dust, or constant wire pulses.
- The moment of wonder must come from scale, structure, and authored detail.
```

## Shot 04 — Dive into a nested canvas

**Time:** 0:18–0:26  
**Role:** Explain that Grovepad can hold worlds inside worlds.  
**Recommended voiceover:** “An infinite spatial canvas for every project. Enter a canvas card and move deeper into the idea.”

```text
Create `shot-04-nested-canvas-dive.html`, duration exactly 8,000 ms.

SUBJECT
Start on a medium-wide crop of the hero board. The central subject is a Canvas card titled “2026 Product Architecture,” using Grovepad’s Live Thumbnail skin.

The card should show:
- a small live miniature of its child board with 10–12 tiny card footprints;
- a breadcrumb hint above the thumbnail;
- a compact status line such as “12 nodes · updated now”;
- an explicit “Enter” control in the lower-right of the card.

Do not use double-click. The visible action is a deliberate click on Enter.

ACTION AND CAMERA
- A Grovepad cursor travels in a soft curved path to the Enter control.
- On hover, the control gains a restrained green border and the thumbnail becomes slightly clearer.
- On click, the outer board subtly braces: surrounding cards move outward by only 8–14 stage pixels while their opacity drops.
- The camera pushes toward the thumbnail. The child board’s miniature geometry must align with the incoming full-size geometry so the transition feels like passing through a real portal rather than crossfading to an unrelated scene.
- At the midpoint, use a brief masked glass refraction at the card boundary—less than 180 ms.
- Resolve into the nested canvas with a breadcrumb at top left: “Origin / Product / 2026 Architecture.”

CHILD CANVAS CONTENT
Show a clean architecture workspace with meaningful clusters:
- Client surfaces
- Local data
- Circuit engine
- Sync and collaboration
- Native extensions

Use about 16 compact cards and a few quiet connections. The nested canvas should be calmer and more technical than the hero board.

TIMELINE
- 0–900 ms: establish the Live Thumbnail card.
- 900–1,650 ms: cursor approaches and hover state resolves.
- 1,650–1,800 ms: click compression and response.
- 1,800–5,300 ms: accelerated but controlled portal dive, roughly 25× more dramatic than a normal UI transition.
- 4,500–5,650 ms: miniature child geometry morphs into full card geometry.
- 5,650–6,500 ms: breadcrumb and child labels resolve.
- 6,500–8,000 ms: complete hold with a tiny camera settle under 6 pixels.

FEATURE CALLOUT
At 6,000 ms, fade in “NESTED CANVASES” at the lower-left safe area in small tracked capitals. Fade it out by 7,450 ms.

GUARDRAILS
- Do not imply every arbitrary card is enterable; this is specifically a Canvas card.
- Do not build a tunnel of random rectangles.
- Keep the portal transition spatially continuous and readable at every frame.
```

## Shot 05 — Magnetic weld

**Time:** 0:26–0:35  
**Role:** Show Grovepad’s physical organization model.  
**Recommended voiceover:** “Weld notes, charts, and tasks into magnetic clusters that move as one.”

```text
Create `shot-05-magnetic-weld.html`, duration exactly 9,000 ms.

PRODUCT TRUTH
This shot replaces the outdated GroupPlate concept. Grovepad now uses magnetic glue:
- the user holds Option while dragging one card toward another;
- a seam preview appears at a compatible edge;
- cards snap together with a 12 px seam;
- each card retains its own glass backplate;
- the welded cards can then move as one object.

Never draw a large surrounding plate, bounding box, folder, or generic group container.

COMPOSITION
Use a clean medium-close canvas area containing four cards:
- “Launch thesis” — Note resting face;
- “Acquisition” — compact Chart;
- “Launch checklist” — Tasks resting face;
- “Q3 target” — Goal resting face.

Begin with the Note, Chart, and Tasks already arranged in a loose L shape. The Goal card sits about one card width away.

INTERACTION
1. The cursor moves to “Q3 target.”
2. A small Option key indicator appears beside the cursor only while the modifier is held.
3. The Goal card lifts 6 pixels visually and follows the cursor.
4. As its left edge nears the right edge of “Launch checklist,” show a narrow seam-preview ribbon—green-white, subtle, and precisely aligned.
5. The target card makes a restrained 2 px receptive movement.
6. Release. The Goal card snaps to a 12 px seam in 150 ms.
7. During the snap, adjacent corners become slightly more coordinated so the cards read as joined, but both backplates remain visible.
8. A brief green weld highlight travels along the shared edge once, then disappears.
9. The cursor drags the Note card’s title capsule by about 90 pixels. The entire four-card glued cluster moves together, proving the relationship.

TIMELINE
- 0–900 ms: establish the four-card arrangement.
- 900–2,000 ms: cursor moves to the Goal card and Option indicator appears.
- 2,000–4,050 ms: drag toward the Tasks card.
- 3,350–4,050 ms: seam preview intensifies progressively.
- 4,050–4,200 ms: magnetic snap.
- 4,200–5,050 ms: one-shot weld highlight and stillness.
- 5,050–7,100 ms: cursor moves to the cluster and drags it as one object.
- 7,100–7,450 ms: settle with real mass; no bounce.
- 7,450–9,000 ms: final hero hold.

FEATURE CALLOUT
Display “MAGNETIC GLUE” in the lower-left safe area from 4,450–7,900 ms. Beneath it, briefly show the smaller line “Option-drag to weld.”

VISUAL DETAIL
- The shared seam is architectural and satisfying, not gooey or liquid.
- Internal card content remains motionless relative to its own card.
- Use one low glass click at snap and a soft bass movement when the cluster travels, indicated only as code comments.

FAIL CONDITIONS
- A parent rectangle around the cards is wrong.
- Cards merging into one undifferentiated panel is wrong.
- A command-key icon or Cmd-G gesture is wrong.
```

## Shot 06 — Live typed circuits

**Time:** 0:35–0:44  
**Role:** Prove that the canvas is computational, not merely visual.  
**Voiceover:** “Bring static notes to life. Connect inputs, formulas, and trackers…”

```text
Create `shot-06-live-typed-circuit.html`, duration exactly 9,000 ms.

COMPOSITION
Show three expanded cards left to right, with enough spacing for visible wires:

1. Number Input — title “Launch confidence”
   - current value 18
   - bounded horizontal slider
   - right-side output port labeled “value”

2. Formula — title “Weighted score”
   - formula display “A × 1.25”
   - input port “A”
   - calculated result 22.5, displayed as 23 in its compact result area
   - output port “result”

3. Progress/Goal — title “Readiness”
   - circular or arc progress visualization
   - value 23%
   - writable input port labeled “percent”

Both connections are number circuits and therefore azure #31A6FF:
- Number Input.value → Formula.A
- Formula.result → Readiness.percent

Enter Grovepad’s Circuit mode at the start of the shot. The wider canvas desaturates slightly while ports, field labels, and connection chips become clear. Do not color the wires emerald.

ACTION
- Begin with both connections already visible so the audience can understand the whole chain immediately.
- The cursor grips the Number Input slider and smoothly drags it from 18 to 64.
- The displayed input value tracks continuously.
- The Formula result updates continuously from 22.5 to 80.
- The Readiness ring follows from 23% to 80% with a small 80–120 ms processing lag, so cause and effect remain readable.
- When the drag finishes, send one bright delivery dash down the first wire, then the second wire. Each dash is a one-shot event, not a loop.
- Let the final 80% state land with one restrained green completion accent inside the Goal card while the circuit wires stay azure.

TIMELINE
- 0–750 ms: Circuit mode enters; cards desaturate slightly and ports/labels appear.
- 750–1,650 ms: cursor approaches the slider thumb.
- 1,650–4,700 ms: continuous drag 18 → 64 using non-linear human motion.
- 1,730–4,900 ms: formula and progress respond continuously.
- 4,700–5,600 ms: first one-shot delivery dash travels to Formula.
- 5,050–5,950 ms: second delivery dash travels to Readiness.
- 5,950–6,350 ms: 80% state settles.
- 6,350–9,000 ms: hold the complete causal chain.

WIRE DESIGN
- Wires should be smooth SVG cubic paths with clear direction and ports.
- Keep wire width elegant. Add a darker under-stroke for separation from the grid.
- Connection chips can briefly identify “number.”
- No particle stream, perpetual pulse, electricity bolts, or generic glowing cable.

FEATURE CALLOUT
Fade in “LIVE CIRCUITS” from 5,700–8,250 ms. Add a smaller line: “Typed data. Visible cause and effect.”

ACCURACY
- Do not connect a scalar slider directly to a bar chart.
- Do not fake a cloud calculation.
- The progress visualization is receiving a number; the wire must be azure.
```

## Shot 07 — Connected intelligence montage

**Time:** 0:44–0:52  
**Role:** Demonstrate breadth through three truthful, quickly understood connections.  
**Voiceover:** “…passing live, reactive data across your entire workspace.”

Create the montage as three separate HTML shots. This gives the editor exact control over rhythm and lets each interaction land on its own sound cue.

### Shot 07A — Counter to Goal

```text
Create `shot-07a-counter-to-goal.html`, duration exactly 2,650 ms.

Show a tight two-card composition:
- Counter titled “Beta signups,” beginning at 37, with a clear plus control and number output.
- Goal titled “First 100,” beginning at 37%, with a ring and percent input.
- Connect Counter.count to Goal.progress with a number circuit in azure #31A6FF.

TIMELINE
- 0–350 ms: hard visual establishment, already in Circuit mode.
- 350–1,400 ms: cursor clicks the plus control five times with a rapid but human cadence. Counter advances 37 → 42.
- The Goal ring follows each count and ends at 42%.
- 1,300–2,100 ms: one azure delivery dash crosses the wire; perform a 4% editorial camera punch-in.
- 2,100–2,650 ms: still final state.

Show the feature callout “CONNECTED INTELLIGENCE” for the entire last 900 ms, aligned consistently with 07B and 07C.

Keep the board background moss-charcoal. Use a crisp cut-in and cut-out; do not fade to black.
```

### Shot 07B — Boolean branch

```text
Create `shot-07b-toggle-to-branch.html`, duration exactly 2,650 ms.

Show:
- Toggle titled “Launch approved,” initially Off, with boolean output.
- Branch Gate titled “Release path,” with a boolean condition input and two labeled outcomes: “Ship” and “Hold.”
- Connect Toggle.on to Branch Gate.condition using boolean green #1FE58C.

TIMELINE
- 0–350 ms: establish both cards and wire.
- 350–900 ms: cursor moves to the toggle and clicks.
- 900–1,200 ms: toggle changes Off → On with physical restraint.
- 1,020–1,900 ms: a single green delivery dash moves down the wire.
- As the value reaches the gate, “Ship” becomes clear and green-edged; “Hold” dims. Do not animate both outcomes.
- 1,900–2,650 ms: hold.

Keep “CONNECTED INTELLIGENCE” in the same screen position and typographic treatment as 07A.
```

### Shot 07C — Text flows into a Note

```text
Create `shot-07c-text-to-note.html`, duration exactly 2,700 ms.

Show:
- Text Input titled “Status line,” with text output.
- Note titled “Team update,” containing a one-line status well that can receive text.
- Connect Text Input.text to Note.text with a violet #B46BFF circuit.

TIMELINE
- 0–250 ms: establish the two-card chain.
- 250–1,450 ms: type “Launch ready” into the Text Input with a tight human cadence.
- 1,150–2,050 ms: one violet delivery dash moves across the wire.
- As it arrives, “Launch ready” resolves inside Team update. Crossfade the receiving text; do not replay the typing there.
- 1,900–2,700 ms: camera eases back by 3%, holds, then creates a clean cut point for the next shot.

Keep “CONNECTED INTELLIGENCE” consistent with 07A and 07B, then fade it out during the final 300 ms.

Across all three montage files, preserve identical canvas color, grid scale, card lighting, feature-callout placement, and camera height so they cut as one designed sequence.
```

## Shot 08 — Tactile ink

**Time:** 0:52–1:01  
**Role:** Put a human hand back into the film after the computational peak.  
**Voiceover:** “Express ideas naturally—with pressure-aware ink that feels immediate.”

**Production recommendation:** Film this with a real iPad and Apple Pencil if possible. A real hand, contact shadow, screen reflections, and pressure changes will feel more premium than a synthetic HTML hand. The prompt below is a clean product-render alternative or a previsualization plate.

```text
Create `shot-08-tactile-ink.html`, duration exactly 9,000 ms.

STYLE
This is a high-end graphic product render, not an attempt at deceptive photorealism. Build a convincing tablet frame and stylus from CSS/SVG, but keep any hand representation abstract: a soft cropped silhouette and contact shadow, never uncanny illustrated fingers.

COMPOSITION
- A large tablet occupies about 76% of the frame, seen in restrained 8-degree perspective on a dark warm desk.
- The screen shows Grovepad with one expanded Drawing card in “Quick Ink” mode.
- Inside the card:
  - eyebrow: “FAST CAPTURE”
  - title: “Quick Ink”
  - note: “Pressure-aware canvas”
  - dark paper surface #0e1218
  - very faint 32 px grid
  - localized green aura
- A minimal Grovepad toolbar remains visible around the card, softly out of focus.
- A slim white stylus enters from the lower right.

INK ACTION
Draw one confident curved stroke that begins thin, becomes visibly wider under pressure, and releases to a fine tail.

Do not approximate pressure by changing a normal SVG stroke-width at a few obvious steps. Construct the visible stroke as a smooth filled outline path, or generate a pressure-sensitive ribbon whose width varies continuously. Use a width relationship approximately:
`width = baseSize × (0.38 + pressure × 1.24)`, with a floor that preserves the fine entry.

Add a second, shorter annotation gesture—a small underline or arrow—after the main stroke. The result should resemble ideation, not decorative calligraphy.

TIMELINE
- 0–900 ms: settle the tablet composition with a shallow 2% camera push.
- 900–1,800 ms: stylus approaches; its contact shadow tightens near the glass.
- 1,800–4,700 ms: draw the primary pressure-sensitive stroke.
- 4,700–5,250 ms: lift; contact shadow softens.
- 5,250–6,900 ms: draw the shorter annotation.
- 6,900–7,450 ms: stylus exits partially.
- 7,450–9,000 ms: hold on the finished ink.

LIGHT
- Create one soft 45-degree key reflection moving gently across the tablet glass, but never over the active stroke during the key moment.
- Add an understated emerald bounce along the tablet’s lower edge.
- Keep the desk almost black with a warm charcoal cast so the Grovepad moss canvas remains distinct.

FEATURE CALLOUT
Show “TACTILE INK” from 6,450–8,450 ms, with the smaller line “Pressure-aware. Native-speed.”

FAIL CONDITIONS
- No fake Apple logo.
- No photorealistic AI hand.
- No glowing magical ink trail.
- No scribble loop after the intended strokes finish.
```

## Shot 09 — One card comes forward

**Time:** 1:01–1:10  
**Role:** Replace the old three-island Focus Mode with Grovepad’s actual calm-attention behavior.  
**Recommended voiceover:** “And when it’s time to act, one card comes forward—and the rest goes quiet.”

```text
Create `shot-09-one-card-forward.html`, duration exactly 9,000 ms.

OPENING
Show a busy but composed region of a Grovepad board with 16–20 content-derived resting faces. The board remains spatially understandable: Tasks, Goal, Notes, Table, Chart, Time, and a Canvas portal.

The primary resting card is a Tasks card titled “Launch week.” Its compact face shows:
- “6 of 10 complete”
- a thin progress line
- the next two task names

ACTION
- The cursor glides to “Launch week.”
- On hover, its backplate clarifies slightly and its title capsule gains a restrained highlight.
- One plain click expands the resting face in place.
- The compact face fades while the full Tasks card grows center-anchored to about 780 × 600 stage pixels.
- Reveal a real task list:
  - Lock launch cut
  - Finalize App Store page
  - Record tactile ink
  - Invite beta cohort
  - Publish launch notes
- Four tasks are complete and one is actively selected.

LOCAL ATTENTION HALO
The expanded card creates a roughly 120 px masked halo around itself:
- nearby content immediately behind the halo becomes softly blurred and dimmed;
- cards farther away remain visible and retain enough contrast to preserve context;
- the rest of the board becomes interaction-inert but does not disappear;
- do not create three isolated floating panels or globally blur the whole screen.

TIMELINE
- 0–900 ms: establish the busy board.
- 900–1,850 ms: cursor approaches the Tasks card.
- 1,850–2,000 ms: click response.
- 2,000–2,300 ms: 300 ms center-anchored expansion.
- 2,080–2,500 ms: resting content fades out and full content reveals over about 260 ms.
- 2,200–2,750 ms: local halo resolves.
- 2,750–6,500 ms: hold the expanded task surface. At 4,100 ms, check “Record tactile ink”; update progress from 6/10 to 7/10 with a subtle one-shot acknowledgement.
- 6,500–7,900 ms: camera moves in by only 3% to emphasize quiet control.
- 7,900–9,000 ms: stillness.

FEATURE CALLOUT
Fade in “ONE THING, IN CONTEXT” from 3,000–7,700 ms. This wording is preferable to the obsolete “Focus Mode.”

ACCURACY
- A single click expands the card.
- Keep the title capsule and full-card controls plausible.
- Never detach the card into an unrelated modal window.
- Do not add a three-column focus layout.
```

## Shot 10 — A thought becomes a workflow

**Time:** 1:10–1:18  
**Role:** Show private, on-device scenario shaping without resorting to chatbot clichés.  
**Recommended voiceover:** “Type one thought, and private on-device intelligence shapes a complete workflow.”

```text
Create `shot-10-quick-add-blueprint.html`, duration exactly 8,000 ms.

OPENING
Use a calm area of the Grovepad canvas. Bring in the Quick Add command bar near the upper center with the placeholder “What’s on your mind?”

The bar must feel like Grovepad glass, not a search engine or chatbot. Include a small privacy status chip reading “Private · on this device.” Do not show an AI avatar, chat bubbles, a cloud icon, generated prose, or magical sparkles.

INPUT
Type:
“I’m studying for finals — build me a 4-week revision system”

Use fast, confident typing with readable pauses. The plan should begin taking shape before the whole sentence is finished.

LIVE BLUEPRINT
Below the command bar, build a compact spatial blueprint from dashed emerald chips, approximately 208 × 64 stage pixels each. Each chip includes a human label and a small widget-type label.

Use exactly these four primary nodes:
- “Exam target” — Goal
- “Revision week” — Tasks
- “Exam day” — Time
- “Exam drills” — Study Deck

Arrange them as a readable tree:
- Exam target is the hub.
- Revision week and Exam drills branch below.
- Exam day sits to the side as a deadline.

Draw thin rope-like preview relations between them. Stagger node arrivals by depth and sibling order, but keep all nodes in one emerald preview language; this is a plan preview, not live typed circuit wiring.

Add a compact candidate pill reading:
“Exam preparation · Enter creates 4 cards”

COMMIT
When Enter is pressed:
- the command bar compresses slightly;
- dashed blueprint borders become solid glass card edges;
- each preview chip morphs into the content-derived resting face of its actual widget type;
- preserve node positions throughout the morph;
- draw the final semantic relations after the cards solidify;
- use a total reveal of roughly 560 ms with slight node staggering.

TIMELINE
- 0–450 ms: empty canvas and Quick Add entrance.
- 450–3,050 ms: type the sentence.
- 1,300–3,500 ms: live blueprint builds progressively beneath it.
- 3,500–4,200 ms: candidate pill resolves and the completed blueprint holds.
- 4,200 ms: press Enter.
- 4,200–5,050 ms: blueprint morphs into four real cards.
- 4,850–5,700 ms: relations draw and content settles.
- 5,700–8,000 ms: hold the completed exam-preparation workspace.

FEATURE CALLOUT
Show “SCENARIO INTELLIGENCE” from 5,150–7,450 ms, with the smaller line “Private · structured on device.”

ACCURACY
- The immediate preview is local and deterministic; do not show a remote request spinner.
- Consolidate into current Grovepad widget types named above.
- Never label the result “AI-generated mind map.”
```

## Shot 11 — Everywhere you think

**Time:** 1:18–1:24  
**Role:** Compress collaboration, Pencil input, and the native Note widget into one coherent system moment.  
**Voiceover:** “Local-first speed. Real-time collaboration. A live OS widget wherever you are.”

```text
Create `shot-11-everywhere.html`, duration exactly 6,000 ms.

COMPOSITION
Build a cinematic three-surface composition on the dark Grovepad background:
- Left, occupying about 55% of the width: a large desktop Grovepad board.
- Upper right: a tablet close-up showing the Drawing card.
- Lower right: a phone home-screen crop showing one Grovepad Note widget.

Use elegant device silhouettes with glass reflections and no manufacturer logos. Keep the three screens large enough to read. Separate them with negative space rather than bright borders.

DESKTOP — COLLABORATION
Show a small launch workspace with two remote participants:
- Mira: violet cursor, triangular pointer with a thin white stroke and a matching name pill.
- Theo: sky-blue cursor with the same construction.

Mira selects the “Launch message” Note. Show a 2 px violet outline around the card’s true footprint and a small name label. Theo’s cursor glides toward a Tasks card over about 300 ms. Include a compact “Live · 3 people” presence indicator.

TABLET — INK
Show the final segment of a pressure-sensitive underline appearing inside Quick Ink. The stroke widens naturally and then becomes still. This should visually continue Shot 08 without replaying the entire drawing action.

PHONE — NATIVE NOTE WIDGET
Show a clean medium Note widget:
- pale warm-yellow sticky background;
- dark brown ink;
- square-and-pencil style header glyph;
- title “Launch message”;
- body text initially “Refine the story.”

During the shot, when Mira updates the desktop Note to “Make space for thought,” update the phone widget to the same sentence after a short, believable sync delay. The widget should refresh with a restrained content crossfade, not a notification explosion.

TIMELINE
- 0–550 ms: all three devices settle into composition with slight depth offsets.
- 550–1,500 ms: Mira and Theo cursors appear and glide.
- 1,500–2,350 ms: Mira selects Launch message.
- 2,050–3,050 ms: desktop note changes to “Make space for thought.”
- 2,500–3,650 ms: tablet underline completes.
- 3,250–4,050 ms: phone widget crossfades to the updated sentence.
- 4,050–5,000 ms: a subtle light sweep visually connects desktop → tablet → phone without drawing a literal data cable.
- 5,000–6,000 ms: all surfaces hold.

FEATURE CALLOUT
Show “EVERYWHERE YOU THINK” from 3,850–5,650 ms.

ACCURACY AND TASTE
- Remote cursors glide; they do not teleport or leave trails.
- Show one native Note widget, not a miniature editable Grovepad app.
- No cloud symbols, satellite maps, or generic sync arrows.
- No fake Apple logos or system trademarks.
```

## Shot 12 — Brand resolve

**Time:** 1:24–1:30  
**Role:** Leave the audience with the real Grovepad identity and a clean final frame.  
**Voiceover:** “Grovepad. Space for your thoughts.”

```text
Create `shot-12-brand-resolve.html`, duration exactly 6,000 ms.

ASSET
Use the real transparent Grovepad mark from:
`/Users/amir-hamza/grovepad/public/brand/logo-light.png`

For portability, either embed that image as a data URL in the final HTML or load it relative to the project. Do not redraw it approximately. Set window.shotReady only after the mark has loaded successfully.

OPENING CONTINUITY
Begin with the broad hero board from Shot 03, now quieter and slightly farther away. Preserve Grovepad’s moss-charcoal canvas, green grid, localized auras, and a few recognizable cards.

TRANSITION
- Let the hero board recede by about 9% while contrast and saturation reduce.
- Individual aura pools extinguish in a graceful sequence from the frame edges toward the center.
- The grid fades last, leaving a deep charcoal field rather than absolute black.
- Use no shattering cards, particle implosion, or vortex.

LOGO RESOLVE
- The real Grovepad mark appears at center, approximately 300 × 300 stage pixels.
- Reveal it from soft optical blur and 96% scale to full clarity.
- Under the mark, set the wordmark in lowercase:
  - “grove” in warm white
  - “pad” in acidic green
- Under the wordmark, set the tagline:
  “Space for your thoughts.”
- At the bottom safe area, add a restrained destination line: “grovepad.app”

The mark may receive one very subtle vertical specular pass, but do not convert it into a silver-metal 3D logo. Its existing white and green identity is the hero.

TIMELINE
- 0–1,750 ms: board recedes and dims.
- 1,200–2,100 ms: aura pools turn off from outside inward.
- 1,750–2,350 ms: grid disappears; central darkness holds briefly.
- 2,250–3,050 ms: Grovepad mark resolves.
- 2,800–3,500 ms: lowercase wordmark appears.
- 3,350–4,150 ms: tagline appears.
- 4,050–4,550 ms: `grovepad.app` appears.
- 4,550–6,000 ms: absolute stillness for the final hold and end card.

LIGHT
Use a single low emerald glow beneath and behind the mark, widest at 3,200 ms, then settle it to a quiet final intensity. Add extremely fine grain and a barely visible vignette.

CAPTURE REQUIREMENTS
- The final frame must remain perfectly still indefinitely after 6,000 ms.
- Add timeline markers `boardGone`, `logoResolved`, and `finalLock`.
- Verify the transparent image has no accidental bounding-box background.
```

---

## Recommended edit structure

| Shot | Duration | Editorial energy | Preferred transition |
|---|---:|---|---|
| 01 First thought | 5.0 s | Reverent | Invisible continuity cut |
| 02 Thought becomes content | 5.0 s | Human, restrained | Scale-match into zoom |
| 03 Great reveal | 8.0 s | Awe | Land on Canvas card |
| 04 Nested canvas dive | 8.0 s | Spatial acceleration | Motion cut |
| 05 Magnetic weld | 9.0 s | Tactile satisfaction | Glass click |
| 06 Live circuit | 9.0 s | Causal, energetic | Data pulse |
| 07A Counter → Goal | 2.65 s | Fast | Percussive cut |
| 07B Toggle → Branch | 2.65 s | Fast | Percussive cut |
| 07C Text → Note | 2.70 s | Fast | Decelerating cut |
| 08 Tactile ink | 9.0 s | Human breath | Match on gesture |
| 09 One card forward | 9.0 s | Calm control | Quiet click |
| 10 Quick Add blueprint | 8.0 s | Intelligent clarity | Enter key |
| 11 Everywhere | 6.0 s | Expansive | Light sweep to dark |
| 12 Brand resolve | 6.0 s | Iconic stillness | End hold |

Total: **90 seconds**.

## Assembly guidance

- Generate each shot as its own HTML file. Do not ask Claude to build the entire film in one page; smaller timelines are easier to correct and render.
- For each shot, paste the shared master brief followed by only that shot’s prompt.
- Capture every shot as a 4K image sequence or lossless/high-bitrate screen recording at 60 fps.
- Keep at least 12 clean frames before the first important movement and after the final movement. The prompts already include editorial holds, but extra handles are useful.
- Build sound after the picture rhythm works. The key sync points are the magnetic weld, slider release, the three circuit deliveries, card expansion, Enter commit, widget update, and logo resolve.
- Treat feature callouts as an editorial layer. If they compete with the product, remove them in the HTML and add them later in the edit.
- For Shot 08, use the HTML result as previsualization or a screen replacement. A real filmed hand and Pencil will carry more emotional credibility in the final cut.

## One-sentence direction for the whole film

**Show Grovepad as a quiet spatial instrument that starts with a thought, reveals a living system, and then gets out of the user’s way.**
