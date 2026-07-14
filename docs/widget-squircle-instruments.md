# Grovepad Design Reinvention: The Modular Squircle Instrument Rack

Instead of rendering widgets inside generic rounded rectangles, we will transition the canvas to a **Modular Instrument Rack** concept. 

Each widget is housed inside a mathematical **Superellipse (Squircle)** frame. Inside this squircle, each widget gets a custom, physical **Faceplate** that replicates the tactile layout, materials, and controls of a dedicated hardware instrument.

```
          [ Standard Card ]              [ The Squircle Instrument ]
            ┌───────────┐                         .---.
            │           │                       /       \  (Continuous Apple-style
            │  Widget   │                      | Widget  |  superellipse curve)
            │           │                       \       /
            └───────────┘                         '---'
```

---

## 1. The Superellipse (Squircle) Frame
True mathematical squircles have a continuous, smooth curvature change (unlike CSS `border-radius`, which abruptly transitions from a straight line to a circular arc). 

We will render the card frames using SVG `clip-path` superellipse paths:

```css
.gp-widget-card {
  /* Clips the card background to a perfect, premium squircle shape */
  clip-path: url(#gp-squircle-clip);
  position: relative;
  overflow: hidden;
  transition: transform 140ms ease, box-shadow 140ms ease;
}

.gp-widget-border-svg {
  /* An overlay SVG that paints a pixel-perfect outline along the superellipse */
  position: absolute;
  inset: 0;
  pointer-events: none;
  stroke: color-mix(in srgb, var(--gp-widget-accent) 25%, var(--gp-relation-outline));
  stroke-width: 2px;
  fill: none;
}
```

---

## 2. Individual Instrument Faceplates

To make each widget look like its own distinct device, we assign unique faceplate textures, materials, and layouts to specific widgets:

### 1. `timer` & `stopwatch` (The Analog Bezel)
*   **The Look**: A circular stopwatch dial faceplate nested inside the squircle frame.
*   **Tactile details**: 
    *   Outer tick marks representing seconds.
    *   A brushed dark metal faceplate texture.
    *   A physically modeled start/pause button that depresses with a shadow shift.
    *   A red indicator needle (the timer hand) that sweeps smoothly across the dial.

### 2. `calculator` (The Pocket Calculator)
*   **The Look**: A retro-modern pocket calculator faceplate.
*   **Tactile details**: 
    *   A distinct, top LCD screen block with a faint green/yellow liquid-crystal backlight glow.
    *   Slightly raised, convex buttons that highlight with a glowing border when clicked.
    *   Monospace numeric display.

### 3. `clock_pulse` (The Synthesizer Oscillator)
*   **The Look**: A channel strip module from a hardware synthesizer.
*   **Tactile details**:
    *   A small waveform grid display (oscilloscope) showing the time frequency.
    *   A heavy rotary knob you drag in a circle to adjust the pulse interval.
    *   Faint patch-bay outline circles around the wire ports.

### 4. `ai_generator` (The Neural Orb)
*   **The Look**: A high-end scientific instrument housing a raw energy source.
*   **Tactile details**:
    *   A centered, glowing, glass-refracting sphere that floats in the center.
    *   When processing, the orb rotates and emits pulse rings that expand towards the squircle edges.

### 5. `mood_tracker` (The Mechanical Color Wheel)
*   **The Look**: A physical aperture or mechanical dial selector.
*   **Tactile details**:
    *   A 7-segment dial wheel.
    *   Clicking a day rotates the wheel slightly, shifting the color segment under a highlighted selector needle.

### 6. `notes` & `sticky_note` (The Drafting Leaf)
*   **The Look**: A notepad clip attached to a metal baseplate.
*   **Tactile details**:
    *   A slightly angled, warm parchment sheet layered over the squircle dark backing.
    *   Faint paper texture and ledger lines.
    *   A metal clip rendering at the top of the card holding the "paper" in place.

---

## 3. Visual Unity: The "Rack" Theme
While each instrument looks distinct, they are unified by three canvas-wide design codes:

1.  **Uniform Port Geometry**: Connection ports always sit on the squircle's left and right outer boundaries as clean, illuminated circular sockets, regardless of what instrument faceplate is housed inside.
2.  **Shared Backdrop Glass**: All instruments share the same frosted glass baseplate refraction, ensuring they look like they belong in the same modular rack system.
3.  **Accent Lighting**: Each instrument’s dials, needles, screens, and outlines glow with the widget's registry-defined `accent` color.
