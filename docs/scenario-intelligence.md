# Scenario Intelligence

*The layer that turns vague-but-understood thoughts into useful canvas workspaces. Shipped: `src/utils/scenarioResolver.ts` (engine), `src/utils/scenarios/catalogue.ts` (archetype data), `src/utils/structuralPlanner.ts` (quantified requests), surfaced through `QuickAddSheet.tsx`.*

## Design principles (binding)

1. **Specificity ≠ confidence.** "I'm learning Spanish" is perfectly understood and almost entirely underspecified. Measure the two separately; never let high understanding masquerade as a mandate to guess the immediate goal.
2. **Scenarios, not widgets, are the prediction target for vague input.** Widgets are an implementation detail the user should never need to know.
3. **One compact question, maximum** — only when the answer materially changes the canvas. Never "what would you like to do?"
4. **Cost-of-being-wrong policy.** The plan is always visible before commit; a single Notes widget may auto-commit at moderate confidence; multi-widget plans are always proposals; the "Keep as Notes" escape hatch always exists.
5. **Context reranks, and says so.** When canvas contents, canvas name, selection, or learned preference changed the ranking, one short note explains it.
6. **Local first.** Detection, learning, and preferences run entirely in the browser. Cloud assistance is opt-in and additive.
7. **Top-three usefulness beats top-one accuracy.** The success metric is "was a direction the user actually wanted visible without scrolling."

## Sensitive-scenario policy (binding)

Some triggers touch grief, illness, addiction, divorce, job loss, financial distress. Enforced by the per-archetype `tone: 'standard' | 'gentle'` flag in the catalogue:

1. **Gentle tone** — taglines become plain and quiet ("A private place to write", never "Crush your goals!"). No exclamation marks, no gamified language.
2. **No streak pressure** on gentle archetypes — `habit` widgets appear only in explicitly chosen directions, never in the recommended lead.
3. **Notes-first fallback** — high-sensitivity input (bereavement, diagnosis, crisis wording) suppresses scenario mode entirely: recommend Notes, quietly offer one gentle direction.
4. **Never fabricate expertise** — no archetype gives medical, legal, or financial advice through widget titles. Titles describe the user's own activity ("Questions for the doctor"), never instructions.
5. **The micro-question is optional everywhere**, and on gentle archetypes it is phrased as an offer, never an interrogation.

## The structural planner (quantified requests)

`src/utils/structuralPlanner.ts` runs before scenario resolution and before any model call, for requests that state their own topology ("3 main topics, 5 subtopics each, attach a sketchpad in a group to every subtopic"):

- Counts bind only to a whitelist of level nouns; a second level must be explicitly per-parent ("each"/"per") — two absolute counts are rejected, never guessed.
- "Attach a X" resolves through the interpreter's widget matching; "in a group" scopes to its own clause and produces real widget groups, one per host.
- Vague "appropriate widgets" rotates through a subject-keyword mapping so branches get varied drills, not clones.
- Requests over the 48-node cap scale the deepest level down with a visible amber warning before commit — never silent truncation.
- The whole commit is one undo step.
- Models never touch the structure. Deep-capable tiers may only rename placeholder titles through an id-constrained schema; unknown ids are ignored and structure/groups/relations stay byte-identical after enrichment.

## Testing

`scenarioResolver` fixtures live beside the code. The most important suite is anti-hijack: specific requests ("write a checklist for groceries", explicit widget names) must return `null` from `resolveScenario` — false scenario positives are worse than misses. Sensitive-suppression inputs must never produce cheery hubs.
