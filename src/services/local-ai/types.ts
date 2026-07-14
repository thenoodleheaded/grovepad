export type LocalAiBackend = 'webllm' | 'tauri' | 'capacitor'

/**
 * A concrete, already-selected model configuration. Platform selection belongs
 * in the coordinator; adapters only execute the profile they are given.
 */
export interface LocalAiModelProfile {
  id: string
  backend: LocalAiBackend
  modelId: string
  contextWindowTokens?: number
  maxOutputTokens: number
  temperature?: number
  topP?: number
}

export interface LocalAiInitProgress {
  progress: number
  elapsedMs: number
  message: string
}

export interface LocalAiGenerateRequest {
  prompt: string
  systemPrompt?: string
  context?: Readonly<Record<string, unknown>>
  responseFormat?: 'text' | 'json'
  /** JSON Schema for runtimes with grammar-constrained decoding. */
  jsonSchema?: string | Readonly<Record<string, unknown>>
  /** Optional per-request ceiling, used for tiny health checks and retries. */
  maxOutputTokens?: number
  /** Bounds generation after model initialization has completed. */
  generationTimeoutMs?: number
  /** WebLLM streams by default so the caller can paint partial predictions. */
  stream?: boolean
  signal?: AbortSignal
  onToken?: (token: string, accumulatedText: string) => void
  onInitProgress?: (progress: LocalAiInitProgress) => void
}

export interface LocalAiGenerationResult {
  text: string
  backend: LocalAiBackend
  modelId: string
  durationMs: number
}

export interface LocalAiRuntimeAdapter {
  readonly backend: LocalAiBackend
  readonly profile: LocalAiModelProfile
  isAvailable(): boolean
  generate(request: LocalAiGenerateRequest): Promise<LocalAiGenerationResult>
  dispose(): Promise<void>
}

export class LocalAiAbortError extends Error {
  public constructor(message = 'Local AI request was cancelled') {
    super(message)
    this.name = 'AbortError'
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    error instanceof LocalAiAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new LocalAiAbortError()
}

export async function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  assertNotAborted(signal)
  if (!signal) return promise

  return new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(new LocalAiAbortError())
    signal.addEventListener('abort', handleAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', handleAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      },
    )
  })
}

export function monotonicNow(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}
