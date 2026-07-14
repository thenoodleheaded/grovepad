import type {
  ChatOptions,
  InitProgressReport,
  MLCEngineInterface,
} from '@mlc-ai/web-llm'
import {
  LocalAiAbortError,
  assertNotAborted,
  awaitWithAbort,
  monotonicNow,
} from './types'
import type {
  LocalAiGenerateRequest,
  LocalAiGenerationResult,
  LocalAiInitProgress,
  LocalAiModelProfile,
  LocalAiRuntimeAdapter,
} from './types'

export interface WebLlmAdapterOptions {
  /** Keep inference off the UI thread when Worker is available. Defaults to true. */
  preferWorker?: boolean
  /** Fail over when a worker reaches final GPU loading but never becomes ready. */
  workerFinalizationTimeoutMs?: number
  onInitProgress?: (progress: LocalAiInitProgress) => void
}

interface CachedEngine {
  engine: MLCEngineInterface
  profileKey: string
}

let cached: CachedEngine | null = null
let enginePromise: Promise<CachedEngine> | null = null
let loadingProfileKey: string | null = null
let cachedWorker: Worker | null = null
let latestRequestId = 0
let activeRequestId: number | null = null

class LocalAiGenerationTimeoutError extends Error {
  public constructor() {
    super('Local AI generation timed out')
    this.name = 'TimeoutError'
  }
}

class WebLlmWorkerFinalizationError extends Error {
  public constructor() {
    super('WebLLM worker stalled during final GPU loading')
    this.name = 'WorkerFinalizationError'
  }
}

const progressSubscribers = new Set<(progress: LocalAiInitProgress) => void>()

function profileKey(profile: LocalAiModelProfile): string {
  return `${profile.modelId}:${profile.contextWindowTokens ?? 'default'}`
}

function toChatOptions(profile: LocalAiModelProfile): ChatOptions | undefined {
  if (profile.contextWindowTokens === undefined) return undefined
  return { context_window_size: profile.contextWindowTokens }
}

function emitProgress(report: InitProgressReport): void {
  const progress: LocalAiInitProgress = {
    progress: Math.max(0, Math.min(1, report.progress)),
    elapsedMs: Math.max(0, report.timeElapsed * 1_000),
    message: report.text,
  }
  for (const subscriber of progressSubscribers) subscriber(progress)
}

function makeWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  return new Worker(new URL('./webLlm.worker.ts', import.meta.url), {
    type: 'module',
    name: 'grovepad-local-ai',
  })
}

async function createEngine(
  profile: LocalAiModelProfile,
  preferWorker: boolean,
  workerFinalizationTimeoutMs: number,
): Promise<MLCEngineInterface> {
  const webllm = await import('@mlc-ai/web-llm')
  const chatOptions = toChatOptions(profile)

  if (preferWorker) {
    const worker = makeWorker()
    if (worker) {
      cachedWorker = worker
      let finalizationTimer: ReturnType<typeof setTimeout> | undefined
      let rejectStalledWorker: ((error: Error) => void) | undefined
      const stalledWorker = new Promise<never>((_resolve, reject) => {
        rejectStalledWorker = reject
      })
      const workerEngineConfig = {
        initProgressCallback: (report: InitProgressReport) => {
          emitProgress(report)
          const isFinalGpuLoad = /finish loading on webgpu/i.test(report.text)
          if ((!isFinalGpuLoad && report.progress < 0.97) || finalizationTimer) return
          finalizationTimer = setTimeout(() => {
            rejectStalledWorker?.(new WebLlmWorkerFinalizationError())
          }, workerFinalizationTimeoutMs)
        },
        logLevel: 'WARN' as const,
      }
      try {
        const workerEngine = webllm.CreateWebWorkerMLCEngine(
          worker,
          profile.modelId,
          workerEngineConfig,
          chatOptions,
        )
        // The losing promise is always observed, including after a timeout.
        void workerEngine.catch(() => undefined)
        return await Promise.race([workerEngine, stalledWorker])
      } catch (error) {
        worker.terminate()
        cachedWorker = null
        // A worker that already reached final GPU loading owns substantial GPU
        // state. Starting a second engine on the UI thread can freeze the canvas;
        // fail closed and let Quick Add keep its deterministic result instead.
        if (error instanceof WebLlmWorkerFinalizationError) throw error
        // CSP, Safari worker-module support, or an extension can make only the
        // worker transport fail. Retain a functional WebGPU path in that case.
        if (typeof console !== 'undefined') {
          console.warn('[Local AI] WebLLM worker failed; using main-thread WebGPU.', error)
        }
      } finally {
        if (finalizationTimer) clearTimeout(finalizationTimer)
      }
    }
  }

  return webllm.CreateMLCEngine(
    profile.modelId,
    { initProgressCallback: emitProgress, logLevel: 'WARN' as const },
    chatOptions,
  )
}

async function ensureEngine(
  profile: LocalAiModelProfile,
  preferWorker: boolean,
  workerFinalizationTimeoutMs: number,
  signal?: AbortSignal,
): Promise<MLCEngineInterface> {
  const key = profileKey(profile)
  if (cached?.profileKey === key) return cached.engine

  if (enginePromise) {
    if (loadingProfileKey === key) {
      return (await awaitWithAbort(enginePromise, signal)).engine
    }
    // A different profile is loading. Let that transition settle, then perform
    // this request's reload. A failure in the unrelated profile should not poison
    // the requested profile.
    await awaitWithAbort(enginePromise.then(() => undefined, () => undefined), signal)
    return ensureEngine(profile, preferWorker, workerFinalizationTimeoutMs, signal)
  }

  loadingProfileKey = key
  enginePromise = (async () => {
    if (cached) {
      await Promise.resolve(cached.engine.interruptGenerate())
      cached.engine.setInitProgressCallback(emitProgress)
      await cached.engine.reload(profile.modelId, toChatOptions(profile))
      cached = { engine: cached.engine, profileKey: key }
      return cached
    }

    const engine = await createEngine(profile, preferWorker, workerFinalizationTimeoutMs)
    cached = { engine, profileKey: key }
    return cached
  })()

  try {
    return (await awaitWithAbort(enginePromise, signal)).engine
  } finally {
    // A caller may stop waiting for initialization, but the shared model download
    // intentionally continues and stays cached for the next keystroke/request.
    void enginePromise.then(
      () => {
        enginePromise = null
        loadingProfileKey = null
      },
      () => {
        enginePromise = null
        loadingProfileKey = null
      },
    )
  }
}

function promptWithContext(request: LocalAiGenerateRequest): string {
  if (!request.context || Object.keys(request.context).length === 0) return request.prompt
  return `${request.prompt}\n\nLocal context:\n${JSON.stringify(request.context)}`
}

function assertCurrent(requestId: number, signal?: AbortSignal): void {
  assertNotAborted(signal)
  if (requestId !== latestRequestId) {
    throw new LocalAiAbortError('Local AI request was superseded by newer input')
  }
}

export class WebLlmAdapter implements LocalAiRuntimeAdapter {
  public readonly backend = 'webllm' as const
  public readonly profile: LocalAiModelProfile
  private readonly preferWorker: boolean
  private readonly workerFinalizationTimeoutMs: number
  private readonly onInitProgress?: (progress: LocalAiInitProgress) => void

  public constructor(profile: LocalAiModelProfile, options: WebLlmAdapterOptions = {}) {
    this.profile = profile
    this.preferWorker = options.preferWorker ?? true
    this.workerFinalizationTimeoutMs = options.workerFinalizationTimeoutMs ?? 45_000
    this.onInitProgress = options.onInitProgress
  }

  public isAvailable(): boolean {
    return typeof navigator !== 'undefined' && 'gpu' in navigator
  }

  public async generate(request: LocalAiGenerateRequest): Promise<LocalAiGenerationResult> {
    return this.generateAttempt(request, this.preferWorker)
  }

  private async generateAttempt(
    request: LocalAiGenerateRequest,
    useWorker: boolean,
  ): Promise<LocalAiGenerationResult> {
    const startedAt = monotonicNow()
    const requestId = ++latestRequestId
    const progressListeners = [this.onInitProgress, request.onInitProgress].filter(
      (listener): listener is (progress: LocalAiInitProgress) => void => listener !== undefined,
    )
    for (const listener of progressListeners) progressSubscribers.add(listener)

    let engine: MLCEngineInterface
    try {
      engine = await ensureEngine(
        this.profile,
        useWorker,
        this.workerFinalizationTimeoutMs,
        request.signal,
      )
    } finally {
      for (const listener of progressListeners) progressSubscribers.delete(listener)
    }

    assertCurrent(requestId, request.signal)
    if (activeRequestId !== null && activeRequestId !== requestId) {
      await Promise.resolve(engine.interruptGenerate())
    }
    activeRequestId = requestId

    const interrupt = () => {
      void Promise.resolve(engine.interruptGenerate())
    }
    request.signal?.addEventListener('abort', interrupt, { once: true })

    let generationTimer: ReturnType<typeof setTimeout> | undefined
    try {
      const messages = [
        ...(request.systemPrompt
          ? ([{ role: 'system' as const, content: request.systemPrompt }] as const)
          : []),
        { role: 'user' as const, content: promptWithContext(request) },
      ]
      const common = {
        messages: [...messages],
        model: this.profile.modelId,
        max_tokens: Math.min(
          this.profile.maxOutputTokens,
          Math.max(1, request.maxOutputTokens ?? this.profile.maxOutputTokens),
        ),
        temperature: this.profile.temperature ?? 0.1,
        top_p: this.profile.topP ?? 0.9,
        enable_thinking: false,
        response_format:
          request.responseFormat === 'json'
            ? ({
                type: 'json_object' as const,
                schema: typeof request.jsonSchema === 'string'
                  ? request.jsonSchema
                  : JSON.stringify(request.jsonSchema ?? { type: 'object' }),
              })
            : undefined,
      }

      const performGeneration = async (): Promise<string> => {
        let text = ''
        if (request.stream ?? true) {
          const chunks = await engine.chat.completions.create({ ...common, stream: true })
          for await (const chunk of chunks) {
            assertCurrent(requestId, request.signal)
            const token = chunk.choices[0]?.delta.content ?? ''
            if (!token) continue
            text += token
            request.onToken?.(token, text)
          }
        } else {
          const completion = await engine.chat.completions.create({ ...common, stream: false })
          assertCurrent(requestId, request.signal)
          text = completion.choices[0]?.message.content ?? ''
          if (text) request.onToken?.(text, text)
        }
        assertCurrent(requestId, request.signal)
        return text
      }

      const generation = performGeneration()
      // A timed-out engine may reject after it is interrupted. Always observe it.
      void generation.catch(() => undefined)
      const text = request.generationTimeoutMs
        ? await Promise.race([
            generation,
            new Promise<never>((_resolve, reject) => {
              generationTimer = setTimeout(() => {
                interrupt()
                reject(new LocalAiGenerationTimeoutError())
              }, request.generationTimeoutMs)
            }),
          ])
        : await generation
      return {
        text,
        backend: this.backend,
        modelId: this.profile.modelId,
        durationMs: Math.max(0, monotonicNow() - startedAt),
      }
    } finally {
      if (generationTimer) clearTimeout(generationTimer)
      request.signal?.removeEventListener('abort', interrupt)
      if (activeRequestId === requestId) activeRequestId = null
    }
  }

  /** Shared engines outlive individual coordinator calls and adapters. */
  public async dispose(): Promise<void> {}
}

export function createWebLlmAdapter(
  profile: LocalAiModelProfile,
  options?: WebLlmAdapterOptions,
): WebLlmAdapter {
  return new WebLlmAdapter(profile, options)
}

export async function disposeCachedWebLlmEngine(): Promise<void> {
  latestRequestId += 1
  if (enginePromise) await enginePromise.catch(() => undefined)
  if (cached) {
    await Promise.resolve(cached.engine.interruptGenerate())
    await cached.engine.unload()
  }
  cachedWorker?.terminate()
  cachedWorker = null
  cached = null
  enginePromise = null
  loadingProfileKey = null
  activeRequestId = null
}

/** Test isolation helper; production code should use disposeCachedWebLlmEngine. */
export async function resetWebLlmRuntimeForTests(): Promise<void> {
  await disposeCachedWebLlmEngine()
  latestRequestId = 0
  progressSubscribers.clear()
}
