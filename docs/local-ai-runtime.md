# Grovepad local AI runtime

Quick Add uses a hybrid local pipeline. The deterministic language engine returns an immediate prediction on every edit. If the user has enabled a supported local model, a second pass starts after 180 ms of idle time. That fast pass selects from Grovepad's already-safe candidate recipes using a tiny `{ id, confidence }` response; it does not generate a full graph while the user is typing.

No prompt or generated plan is sent to a Grovepad server by this implementation.

## Device routing

| Environment | Selected model | Execution | Maximum planned nodes |
| --- | --- | --- | ---: |
| Tauri desktop | `Qwen_Qwen3.5-2B-Q4_K_M.gguf` | Native `parse_thought` bridge | 48 |
| Capacitor mobile | `Qwen_Qwen3.5-0.8B-Q4_K_M.gguf` | Native `LocalAI.parseThought` bridge | 32 |
| Desktop web, WebGPU, at least 12 GB reported memory | `Qwen3.5-0.8B-q4f16_1-MLC` | WebLLM worker | 48 |
| Desktop web, WebGPU, at least 6 GB or memory unknown | `Qwen3-0.6B-q4f16_1-MLC` | WebLLM worker | 40 |
| Desktop web, WebGPU, below 6 GB | `SmolLM2-360M-Instruct-q4f16_1-MLC` | WebLLM worker | 24 |
| Mobile browser or browser without WebGPU | None | Deterministic language engine | 48 |

Mobile browsers deliberately do not load a WebGPU language model. Their memory limits and background lifecycle are too inconsistent for model loading to improve Quick Add reliably. A future native mobile shell can use the existing Capacitor adapter.

## User experience

1. Typing immediately runs Grovepad's deterministic interpreter. Quick Add never waits for a model before showing a usable action.
2. On a supported desktop browser, **Download model** opts into the local model. Download and initialization progress appear in Quick Add; text enrichment stays disabled until warm-up is fully complete.
3. The model is retained by the browser runtime cache. Grovepad lazily loads the WebLLM code and model only after opt-in.
4. After 180 ms without another keystroke, the model receives the current text, selected-widget context, and a compact list of the deterministic engine's best candidate recipes.
5. New typing aborts or supersedes the older request. A failed model session is disabled so it cannot retry on every keystroke; Quick Add keeps using the deterministic result and exposes an explicit retry.
6. Model predictions remain suggestions. The user must still choose or confirm a plan before widgets are created.

The full graph planner remains a separate deep mode for deliberate, complex workspace construction. It receives the full widget catalogue and is intentionally not part of the real-time route.

## Inspecting Quick Add

Press `I` outside a text field, or select the small brain button beside Quick Add's model-status chip. The AI panel shows the selected runtime/model, WebGPU and memory detection, plus the latest deterministic and local-model passes side by side. Expand an entry to inspect the exact local prompt, compact deterministic prediction graph, raw model JSON, validation outcome, timing, and any fallback error. These traces are in memory only and are cleared with the panel's trash button or on refresh.

## Plan safety boundary

Models return a compact JSON graph, not arbitrary widget state. `planProtocol.ts` applies the security and correctness boundary before anything reaches the canvas:

- Only widget types in the live registry are accepted.
- Plans are limited to 48 nodes and bounded text lengths.
- Duplicate IDs, invalid relation types, dangling edges, cycles, disconnected nodes, and multiple parents are rejected.
- Widget data comes from the registry's trusted `defaultData`; a model cannot inject executable or unknown widget data.
- Depth is computed locally from validated relations.
- Invalid output falls back to the deterministic interpretation without creating anything.

## Performance controls

- Web inference prefers a module worker so token generation stays off the UI thread.
- A worker stuck in final GPU loading for 45 seconds is terminated instead of leaving Quick Add in an endless loading state.
- Warm-up generation is bounded to 30 seconds and normal planning to 45 seconds. Grovepad deliberately returns to its deterministic engine instead of starting a heavy fallback engine on the UI thread.
- WebLLM is dynamically imported and its engine is shared rather than recreated per request.
- Only one generation is current; stale generations are interrupted.
- A 24-entry LRU cache avoids recomputing identical text and selection context.
- Thinking mode is disabled for the Qwen planner, temperature is low (`0.08`), and output uses a compact schema to reduce latency and wandering output.
- WebLLM receives the plan schema as a serialized grammar constraint; the same schema is still validated again in Grovepad before commit.
- Model warm-up is capped at 32 output tokens instead of inheriting the full planning budget.
- Explicit high-confidence single-widget commands keep deterministic priority.

## Native bridge contract

The repository is currently a web application and does not contain Tauri or Capacitor native projects. The frontend adapters are implemented and tested, but a native shell must provide one of these local-only bridges:

- Tauri command: `parse_thought`
- Capacitor plugin: `LocalAI.parseThought` (or legacy `LocalAIPlugin.parseThought`)

Both receive this shape:

```ts
{
  text: string
  systemPrompt?: string
  context: Record<string, unknown>
  modelId: string
  maxOutputTokens: number
  temperature: number
  topP: number
  responseFormat: 'text' | 'json'
}
```

The bridge may return a string or an object with `text`, `response`, `output`, `content`, or `plan`. Native implementations should use llama.cpp or an equivalent device-local runtime with constrained JSON output and should never expose an HTTP listener.

## Verification

The automated suite covers runtime routing, adapter cancellation and bridge detection, malformed-model recovery, registry validation, graph invariants, deterministic fallback, and a connected 40-node branched workspace committed to the real store with no widget overlaps. Run:

```sh
npm test
npm run build
npm run lint
```
