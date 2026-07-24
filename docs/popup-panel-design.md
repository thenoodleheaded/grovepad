# Popup Panel Design Standard

This document defines how Grovepad popup panels should be designed and built.
It is based on the Settings redesign completed on 2026-07-22, but it is not a
Settings-only style guide. It records the reasoning, material hierarchy,
interaction policy, implementation seams, and verification standard for future
dialogs, inspectors, pickers, account surfaces, and other temporary panels.

The reference implementation is
[SettingsPanel.tsx](../src/components/ui/SettingsPanel.tsx), with material and
motion rules in
[03-glass-chrome.css](../src/styles/product/03-glass-chrome.css). Reuse its
principles first. Reuse its `gp-settings-*` names only for Settings; extract a
neutral shared primitive when another substantial panel needs the same recipe.

## 1. What the redesign solved

The old Settings direction accumulated conventional application chrome:
descriptive subtitles, repeated section names, too many categories, controls
with unrelated visual behavior, large black surfaces stacked on other black
surfaces, and persistent scrollbars. The result explained everything in words
while communicating very little through shape, state, or placement.

The redesign made the following corrections:

| Problem | Design response | Why it works |
| --- | --- | --- |
| One large anonymous modal | Separate identity pill, navigation glass, and content glass | The eye can parse the popup before reading it |
| Panel moved vertically as category height changed | Anchor the shell from a stable top position; resize only downward | Switching sections no longer feels like chasing a moving object |
| Category title repeated inside its own page | Keep the title in the category selector only | Navigation already answers “where am I?” |
| Explanations under every title | Prefer icons, state color, grouping, and concise labels | Lower reading cost and higher information density |
| Dark glass on black with weak separation | Lift backplates and islands to visibly different dark-grey values | Glass reads as depth instead of a black void |
| Every control had a different shape | Apply one island policy to toggles and actions | Interaction becomes predictable across categories |
| Boolean choices shown as two verbose cards | Use one full-surface switch whose label/icon changes with state | One fact gets one control and one hit target |
| Slider fill eased behind the pointer | Update on `input`; never transition the positional fill | Direct manipulation must remain attached to the hand |
| Slider needed liveliness | Deform only the leading edge while pressed | The material feels elastic without making the value lag |
| Scrollbars appeared in short categories | Measure natural height and enable overflow only when required | A scrollbar now means there is actually more content |
| Decorative button motion everywhere | Keep ordinary controls static; reserve motion for spatial change | Animation communicates structure rather than decorating clicks |

These are product decisions, not incidental styling preferences.

## 2. Governing principles

### 2.1 Show structure before adding explanation

Use position, grouping, iconography, and state color to answer common questions.
Text should name a setting or action, not narrate the interface. Add supporting
copy only when the consequence cannot be inferred safely, such as an unusual
destructive action or a permission limitation that changes what will happen.

Do not place a subtitle under every popup, category, card, or control. Repeated
descriptions make a compact panel feel like documentation instead of a tool.

### 2.2 One semantic fact gets one visual owner

A setting belongs to exactly one category. A category name appears in exactly
one navigational place. A Boolean state gets one switch surface. Do not show the
same concept in a heading, subheading, card title, and helper sentence.

Examples from Settings:

- Grovepad file operations belong to Canvas.
- Cloud sync belongs to Account.
- Reset belongs to General.
- Dot-grid strength belongs to Canvas and is not duplicated in General.
- Private/public access is one changing switch, not two competing cards.

### 2.3 Material is hierarchy

Glass is not a decoration applied to every rectangle. It tells the user which
elements belong together and which elements can be manipulated.

| Layer | Purpose | Treatment |
| --- | --- | --- |
| Backdrop | Separate temporary work from the canvas | Dim plus one restrained blur |
| Name pill | Identify the popup | Small independent glass pill |
| Navigation backplate | Hold peer destinations | Separate glass with a recessed inner track |
| Content backplate | Hold the active task | Separate, slightly larger glass surface |
| Island | A direct action, switch, compact form group, or meaningful sub-surface | Brighter than its backplate; one clear hit area |
| Hole/well | Recessed passive content or dense repeated information | Darker inset treatment, not another floating plate |
| Naked control | Global, obvious, low-emphasis utility such as close | Icon only, no permanent backing plate |

Avoid double glass: an island should not contain another island merely to frame
a single button. Avoid making every row a floating card. Dense lists should use
one shared surface with internal spacing or hairlines.

### 2.4 A popup is a temporary workspace, not a miniature webpage

Keep the number of sections low. Prefer a narrow panel that grows vertically to
a wide dashboard. Group by the average user's task, not by internal code owners.
If a category contains one action, question whether it should be a category at
all.

## 3. Canonical anatomy

Use only the pieces a popup actually needs. A confirmation dialog may need a
content backplate and naked close control but no navigation. A multi-section
inspector may use the full structure.

```text
portal to document.body
└── modal overlay
    ├── backdrop button
    └── anchored shell
        ├── floating header row
        │   ├── name pill: icon + one title
        │   └── naked global controls: theme, close, or equivalent
        ├── navigation backplate (only when there are real peer sections)
        │   └── recessed track
        │       ├── one moving glass lens
        │       └── semantic category buttons above the lens
        └── content backplate
            └── measured content viewport
                └── active section content, without a repeated category heading
```

The gaps between backplates are intentional. They let the backdrop show through
and make the pieces read as a composed instrument rather than nested boxes.

## 4. Geometry and placement

### Width

Start with the narrowest width that preserves comfortable labels and controls.
Settings uses:

```tsx
w-[min(540px,calc(100vw-24px))]
```

This means a 540-pixel ceiling and a 12-pixel viewport gutter on each side.
Do not widen a panel to make sparse content look important. Widen only when the
task itself requires horizontal comparison, a canvas, or genuinely tabular
information.

### Stable vertical anchor

Variable-height centered dialogs visibly jump upward and downward when their
content changes. Anchor multi-section panels from a stable top position:

```tsx
className="fixed inset-0 flex items-start justify-center
           px-4 pb-4 pt-[clamp(24px,12vh,96px)]"
```

The content backplate may grow or shrink downward, but the name and navigation
stay in the same screen position. This preserves spatial memory.

On small touch viewports, a bottom sheet is acceptable when it is the established
mobile pattern. Respect `--gp-safe-top` and `--gp-safe-bottom`; never hide close
or primary actions behind a device inset.

### Content height and overflow

Do not assign `overflow-y: auto` unconditionally. Measure the active section,
cap it against available viewport space, and show scrolling only when the natural
content is larger than that cap.

The Settings pattern is:

```tsx
const sectionRef = useRef<HTMLDivElement>(null)
const [bodyHeight, setBodyHeight] = useState<number>()
const [bodyScrollable, setBodyScrollable] = useState(false)

useLayoutEffect(() => {
  if (!open || !sectionRef.current) return
  const section = sectionRef.current

  const measure = () => {
    const availableHeight = Math.max(220, Math.min(categoryLimit, window.innerHeight - 162))
    const naturalHeight = section.scrollHeight + verticalChromeAllowance
    setBodyHeight(Math.min(naturalHeight, availableHeight))
    setBodyScrollable(naturalHeight > availableHeight + 1)
  }

  const observer = new ResizeObserver(measure)
  observer.observe(section)
  measure()
  window.addEventListener('resize', measure)
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', measure)
  }
}, [open, activeSection])
```

And at render time:

```tsx
<main
  style={{
    height: bodyHeight ? `${bodyHeight}px` : undefined,
    overflowY: bodyScrollable ? 'auto' : 'hidden',
  }}
>
  <div ref={sectionRef} key={activeSection}>{content}</div>
</main>
```

The allowance must include the viewport's vertical padding and any deliberate
breathing room. Browser-check the tallest non-scrolling category to ensure the
last pixel is not clipped.

## 5. Glass recipe

Backplates must have more contrast than the backdrop and islands must have more
contrast than backplates. In dark mode, “black over black” is a failure even if
the borders are technically different.

The Settings backplate recipe is the current reference:

```css
.panel-backplate {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(105% 72% at 8% -4%, rgb(74 222 128 / 0.11), transparent 48%),
    radial-gradient(90% 80% at 104% 28%, rgb(56 189 248 / 0.055), transparent 54%),
    linear-gradient(152deg, rgb(255 255 255 / 0.065), transparent 45%),
    color-mix(in oklab, var(--gp-surface-panel), white 7%);
  box-shadow:
    0 36px 100px rgb(0 0 0 / 0.62),
    0 10px 32px rgb(0 0 0 / 0.32),
    0 0 0 1px rgb(255 255 255 / 0.09),
    inset 0 1px 0 rgb(255 255 255 / 0.1);
}
```

The gradients do different jobs: the green bloom gives Grovepad identity, the
very weak blue bloom prevents monochrome mud, the white diagonal creates a glass
reflection, and the mixed base raises the panel from the black backdrop. Do not
increase all of them together; that produces cloudy plastic.

Use a theme-specific light recipe. Alpha values tuned over a dark canvas do not
automatically produce legible light glass.

### Backdrop budget

Use one fullscreen backdrop blur. Keep the number of independent
`backdrop-filter` surfaces bounded. A popup with dozens of individually blurred
rows is both visually noisy and more expensive to composite. Dense repeated
content belongs in one island or well.

## 6. Action and switch islands

The entire island is the control. Do not put a tiny checkbox or toggle inside a
large decorative card. The visible object and the hit target must be the same
object.

Canonical switch semantics:

```tsx
<button
  type="button"
  role="switch"
  aria-checked={checked}
  data-checked={checked ? '' : undefined}
  disabled={disabled}
  onClick={() => onChange(!checked)}
  className="preference-island"
>
  <Icon aria-hidden />
  <span>{title}</span>
</button>
```

State is communicated redundantly:

- semantics through `role="switch"` and `aria-checked`;
- color through the full green active surface;
- icon color and optional restrained aura;
- label changes when the state itself has two meaningful names, such as
  `Private canvas` and `Public canvas`.

Actions use the same base material, icon scale, spacing, disabled treatment, and
hover treatment. Their accent may differ to show action versus enabled state,
but they must not look like controls from another product.

Do not animate normal button presses. Hover may change material or text color
without translating or scaling the button. A stable hit target feels precise.

## 7. Progress islands and direct manipulation

A progress island combines label, value, and track into one surface. Its fill is
not a decorative meter beside the setting; the entire island is the slider.

Keep a real range input stretched across the surface for keyboard, pointer, and
assistive-technology behavior:

```tsx
<label
  className="progress-island"
  style={{ '--progress': `${value}%` } as CSSProperties}
>
  <input
    type="range"
    min="0"
    max="100"
    value={value}
    onInput={(event) => onChange(Number(event.currentTarget.value))}
  />
  <span>{label}</span>
  <output>{value}%</output>
</label>
```

The fill and its edge must have `transition: none`. Easing a value behind the
pointer breaks the physical contract of dragging. Elasticity belongs only in
shape:

```css
.progress-island::before {
  width: var(--progress);
  transition: none;
}

.progress-island::after {
  left: calc(var(--progress) - 12px);
  border-radius: 46% 58% 54% 42% / 38% 52% 48% 62%;
  transition: none;
}

.progress-island:has(input:active)::after {
  border-radius: 40% 64% 48% 58% / 55% 42% 62% 45%;
  transform: scaleX(1.32) skewX(-5deg);
}
```

This produces an edge that yields under pressure while the represented value
remains exactly under the pointer. Never create elasticity by delaying the fill.

## 8. Category navigation

Use categories only when there are at least two durable peer destinations. The
active treatment is one moving glass lens behind transparent semantic buttons,
not five independently animated button backgrounds.

Why one lens:

- it expresses that the user is moving one viewport between peer places;
- it preserves continuity across category changes;
- it avoids unrelated press animations;
- it keeps every tab's geometry stable.

The lens may translate elastically and briefly compress/expand as it arrives.
This is one of the few justified popup animations because it explains a spatial
change. The buttons themselves remain static.

For a reusable implementation, parameterize the category count and gap. The
current Settings width formula is intentionally specific to five categories;
do not copy its fixed divisor into a panel with a different number of tabs.

```css
.category-indicator {
  width: calc(
    (100% - (var(--category-count) + 1) * var(--category-gap))
    / var(--category-count)
  );
  transform: translateX(var(--category-offset));
  transition: transform 480ms cubic-bezier(0.2, 1.34, 0.32, 1);
  pointer-events: none;
}
```

The active category label must not be repeated as a heading at the top of the
content. An internal heading is valid only when it names a real subsection,
not when it restates the selected tab.

## 9. Motion policy

Motion must answer “what changed?”

Allowed:

- the category lens moving between peer destinations;
- a short active-section entrance that preserves orientation;
- a slider edge deforming during direct manipulation;
- a meaningful status icon animation when the status itself is active.

Avoid:

- button bounce or scale on every click;
- icons moving merely because the pointer crossed them;
- height animation that makes the header drift;
- delayed slider fills;
- multiple nested surfaces animating for the same event.

Every animation must collapse under Grovepad's reduced-motion policy. Do not use
JavaScript timers to simulate CSS transitions.

## 10. Content and copy policy

Use sentence case and short concrete labels. Prefer `Cloud sync`, `Link lines`,
and `Import Grovepad file` to abstract or implementation-oriented language.

Remove copy when:

- it repeats the title or current category;
- it explains a familiar control;
- the icon, state color, and label already tell the story;
- it exists only to fill empty space.

Keep copy when:

- the operation is destructive or difficult to reverse;
- permissions make the apparent action behave differently;
- the user must understand an unusual data or privacy consequence;
- an error or unavailable state needs an actionable next step.

Do not collect or display account information merely because space is available.
Ask only for product-relevant identity fields.

## 11. Overlay lifecycle and accessibility

Every modal popup must:

1. mount through `createPortal(..., document.body)` so canvas transforms and
   gesture listeners do not distort or capture it;
2. use `role="dialog"`, `aria-modal="true"`, and an accessible title;
3. call `useOverlayLifecycle(open)` so canvas shortcuts and creation gestures are
   suspended while the popup is open;
4. call `useFocusTrap(open, containerRef, initialFocusRef)` so Tab stays inside
   and focus returns to the invoking control on close;
5. close on Escape unless the current sub-interaction has a stronger Escape
   meaning;
6. expose a labelled close button and a backdrop close target when dismissal is
   safe;
7. keep the backdrop out of the tab order;
8. retain visible `:focus-visible` treatment on actual controls;
9. use native inputs beneath custom visuals whenever possible;
10. represent disabled states semantically with `disabled`, not opacity alone.

Programmatic initial focus may land on the shell itself to avoid painting a
bright focus ring around the close control as soon as the popup opens. The shell
can suppress its own outline; the first keyboard Tab must still reveal focus on
the first interactive control.

## 12. Responsive rules

Desktop and tablet:

- maintain the stable top anchor;
- preserve the name/navigation/content separation;
- cap width rather than stretching with the viewport;
- let the content plate grow downward until its viewport cap.

Phone:

- use the established bottom-sheet alignment where appropriate;
- keep a minimum 12-pixel side gutter around floating header/navigation pieces;
- allow the content plate to meet the bottom edge;
- include safe-area padding;
- keep all category labels visible before considering icon-only fallback;
- do not split a linear hotkey/reference list into artificial pages merely to
  make the panel shorter.

Check at least one narrow phone width, one tablet-like width, and desktop. Browser
zoom must remain the owner of overall interface scaling.

## 13. Choosing the right popup form

| Need | Form |
| --- | --- |
| Confirm one consequential action | One compact content backplate; no categories |
| Pick one item from a short list | One backplate with a shared list well |
| Edit a few related properties | Name pill plus one content backplate |
| Navigate several durable setting groups | Full separated anatomy with lens navigation |
| Perform a large editor task | Fullscreen portal editor, following the codebase-map route |
| Show transient status or acknowledgement | Toast/transient value, not a modal |

Do not use the full Settings anatomy to make a two-button confirmation look
important. Consistency means applying the same hierarchy rules, not copying the
same amount of chrome.

## 14. Implementation workflow for a new popup

1. Write the user-visible task in one sentence.
2. Decide whether the surface is modal, modeless, or should not be a popup.
3. List the minimum information and actions required to complete the task.
4. Remove repeated titles and explanatory copy.
5. Assign each remaining element to name pill, navigation, backplate, island,
   well, or naked-control roles.
6. Choose the smallest viable width.
7. Anchor the shell and define the content height/overflow policy.
8. Apply one action/switch island vocabulary.
9. Add overlay lifecycle, focus trapping, Escape, labels, and focus-visible state.
10. Add motion only where it explains navigation, state, or direct manipulation.
11. Implement dark and light materials together.
12. Add a deterministic contract or behavior test.
13. Browser-check every category/state at desktop and phone widths.

If a second substantial popup duplicates Settings' island or split-glass code,
extract a neutral component and neutral CSS class in the same change. Do not let
multiple copied recipes drift independently.

## 15. Review checklist

### Information

- Is any heading, description, or status repeated?
- Does every setting/action live in one obvious place?
- Can familiar helper copy be replaced by visual state or removed?
- Is the category count still justified?

### Material

- Is the content backplate visibly distinct from the backdrop in both themes?
- Are interactive islands visibly distinct from their backplate?
- Is there any accidental glass-inside-glass?
- Are naked global controls truly naked at rest?

### Interaction

- Does the panel's top anchor remain still as content changes?
- Do scrollbars appear only for real overflow?
- Are full islands the hit targets for switches and actions?
- Does direct manipulation track the pointer without easing or lag?
- Is animation limited to meaningful spatial/state change?

### Accessibility and lifecycle

- Portal, dialog semantics, overlay registration, focus trap, focus restoration?
- Escape and close button behavior?
- Native semantics for switches, sliders, disabled controls, and outputs?
- Visible keyboard focus after the first Tab?
- Reduced-motion behavior?

### Verification

- Deterministic contract/behavior test updated?
- Typecheck and lint pass?
- Both themes checked?
- Desktop, tablet, and phone dimensions checked?
- Tallest section scrolls and shortest section does not?
- Opening, switching, submitting, cancelling, and closing exercised manually?

## 16. Current adoption audit

The 2026-07-22 popup audit applied this standard across the existing product.
This table records intentional form choices so a future refactor does not mistake
variation for drift.

| Surface | Adopted form | Intentional distinction |
| --- | --- | --- |
| Settings | Full identity pill + navigation backplate + measured content backplate | Reference multi-section implementation |
| Multiplayer | Compact identity pill + three-destination lens + content backplate | Modeless canvas panel; transparent desktop click-catcher and phone bottom-sheet placement |
| Command Palette | One compact surface with a three-destination lens | Search is the identity of the command surface, so it does not need a second title pill |
| Import Document | Identity pill with naked close + bounded content surface | Long form scrolls internally; unusual import controls may retain concise consequence copy |
| Widget Library | Fullscreen picker with identity pill, naked close, and search island | Its card catalogue needs the viewport and must not be squeezed into a 540-pixel dialog |
| Quick Add | One compact popup surface with naked close and shared primary action | The visible canvas preview is part of the interaction, so no dimmed modal backplate is added |
| Confirmations and deletion warnings | One compact surface with shared neutral/primary/destructive actions | No categories or decorative navigation |
| Canvas Tree and Move Canvas | Drawer surface plus compact modal surface | Drawer geometry is preserved; the move chooser follows compact modal rules |
| Account, workspace, context, dependency, relation, wire, and group menus | Shared compact popup-menu material | Anchored menus do not gain title pills or modal backdrops |
| Fullscreen drawing editor | Shared surface and naked close on a fullscreen portal | Editor owns most of the viewport by necessity |
| AI, performance, and scale debug panels | Shared surface only | Developer instruments keep dense diagnostic layouts |
| Legacy Shortcuts overlay | Shared surface and naked close | Kept compatible with existing state; primary user access is the Hotkeys category in Settings |

The contract in
[popupPanelContracts.test.ts](../src/components/ui/popupPanelContracts.test.ts)
guards this adoption map. When a new popup form is introduced, update both the
contract and this table if it represents a deliberate new exception.

## 17. Anti-patterns

Do not ship:

- a giant glass rectangle with every internal region drawn as another card;
- category subtitles such as “Files, sync and widget collections” when the tab
  already says `Data` and its controls are self-explanatory;
- a repeated active-category heading inside the content plate;
- two large buttons for a simple Boolean setting;
- a small toggle embedded at the far edge of a much larger decorative row;
- controls from different categories with different material and press behavior;
- a centered variable-height shell that jumps on every tab switch;
- unconditional scrollbars;
- a slider whose fill animates toward the pointer after the input value changed;
- black islands on a black backplate differentiated only by a one-pixel line;
- permanent backgrounds behind close/theme utility icons;
- motion added only to make the panel feel “alive.”

The intended result is compact but not cramped, expressive but not theatrical,
and visually rich without becoming materially noisy. A Grovepad popup should
feel like a precise glass instrument placed temporarily over the canvas.
