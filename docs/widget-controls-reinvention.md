# Reinventing the Content UI: Tactile Control Elements

To banish generic rectangular input boxes, dropdown select menus, and standard checkboxes, we will replace them with **five custom, high-end typographic and tactile UI controls**. 

These elements use minimal chrome, leveraging typography, spring physics, and glassmorphic overlays to feel sleek and cohesive on the spatial canvas.

---

## 1. Text Inputs: "The Ledger Hairline"
Instead of boxy text fields that clutter the card with grey rectangles, the text input is borderless and blends directly into the widget’s background.

```
  [ Idle State ]                 [ Focused / Active State ]
  Type a label...                Type a label...
  ────────────────               ============================ (Glowing Accent)
```

*   **Design**:
    *   No background box, no side borders.
    *   A single, ultra-thin, low-opacity bottom hairline (`--gp-border-soft`).
    *   **The Animation**: When focused, the hairline morphs into a dual-line stack (a bold accent line and a faint shadow line) that expands outwards from the center using a spring transition.
*   **CSS Style**:
    ```css
    .gp-input-hairline {
      background: transparent;
      border: none;
      border-bottom: 1px solid var(--gp-border-soft);
      padding: 4px 0;
      outline: none;
      font-size: 13px;
    }
    .gp-input-hairline:focus {
      border-bottom: 1px solid var(--gp-widget-accent);
      box-shadow: 0 1px 0 var(--gp-widget-accent);
    }
    ```

---

## 2. Numeric Inputs: "The Typographic Value Scrub"
Traditional input boxes with up/down stepper arrows are replaced by **Scrubbable Numbers** (similar to professional tools like Figma, Blender, or Photoshop).

```
          [ Hover State ]         [ Active Drag / Scrub State ]
              Value:                 Value:
              [ 42 ]                  ◄─ [ 78 ] ─►
             (Cursor: col-resize)     (Slide left/right to change)
```

*   **Design**:
    *   No input box. The value is rendered as a clean, large typographic number.
    *   **Interaction**: Hovering over the number changes the cursor to `col-resize`. The user clicks and drags (scrubs) left or right to decrease or increase the value.
    *   A single click opens a temporary micro-input to type a precise number if needed.
*   **How it feels**: Fluid and tactile. Dragging creates a temporary visual overlay track showing the value moving relative to min/max boundaries.

---

## 3. Checklists: "The Thread & Collapse Ring"
Instead of generic checklist boxes, items are visually connected and morph dynamic states.

```
  [ Unchecked Item ]             [ Checked / Completed Item ]
  o  Water the plants            •  Water the plants (Strikethrough)
  |                              |
  o  Buy groceries               o  Buy groceries
```

*   **Design**:
    *   **The Connection**: All checklist items are vertically aligned and connected by a thin, dotted guide-line (the "thread") on the left.
    *   **The Checkbox**: A tiny, borderless hollow circle (`o`).
    *   **The Action**: Checking an item collapses the hollow circle into a solid micro-dot (`•`), and a thin horizontal strike-through line **draws across the text** using an SVG dasharray draw transition. The text opacity fades to 40%.

---

## 4. Option Pickers: "The Segmented Glider"
Select dropdowns are completely removed. Multiple choices are laid out inline using a gliding background panel.

```
  [     Daily     ][    Weekly    ][    Monthly    ]
  ┌────────────────────────────────────────────────┐
  │  [  Glider  ]  │              │                │  (Active background slides)
  │     Daily      │    Weekly    │    Monthly     │
  └────────────────────────────────────────────────┘
```

*   **Design**:
    *   A single, low-profile track containing option labels side-by-side with no individual borders.
    *   The active option is highlighted by a **gliding glass capsule** that slides smoothly underneath the active text using CSS `translate` and spring physics when clicked.
*   **CSS Style**:
    ```css
    .gp-segmented-track {
      position: relative;
      display: flex;
      background: rgba(0, 0, 0, 0.25);
      border-radius: 999px;
      padding: 2px;
    }
    .gp-glider-capsule {
      position: absolute;
      top: 2px;
      bottom: 2px;
      left: 0;
      width: calc(100% / var(--options-count));
      background: rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
      transition: transform 250ms cubic-bezier(0.25, 1, 0.5, 1);
    }
    ```

---

## 5. Toggles: "The Split-Glass Slide"
Instead of typical iOS-style green toggle knobs, switches are split glass panels.

```
  [ OFF | ON ]
  ┌──────────┐
  │ [Glass]  │ (Glass panel covers the inactive state,
  │  OFF  ON │  active state glows)
  └──────────┘
```

*   **Design**:
    *   A compact split capsule.
    *   A translucent frosted glass panel sits over the toggle. Flipping the switch slides the frosted glass plate to cover the "OFF" side, immediately revealing and glowing the "ON" label in the widget's accent color (or vice versa).
