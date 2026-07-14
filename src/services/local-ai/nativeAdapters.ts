import {
  LocalAiAbortError,
  assertNotAborted,
  awaitWithAbort,
  monotonicNow,
} from './types'
import type {
  LocalAiBackend,
  LocalAiGenerateRequest,
  LocalAiGenerationResult,
  LocalAiModelProfile,
  LocalAiRuntimeAdapter,
} from './types'

type TauriInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>
type CapacitorParseThought = (request: Record<string, unknown>) => Promise<unknown>

type UnknownRecord = Record<PropertyKey, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}

function bindFunction<T extends (...args: never[]) => unknown>(
  owner: object,
  value: unknown,
): T | null {
  return typeof value === 'function' ? (value.bind(owner) as T) : null
}

/** Supports Tauri 2, Tauri 1 with core, and early direct-invoke globals. */
export function detectTauriInvoke(): TauriInvoke | null {
  const root = globalThis as unknown as UnknownRecord
  const modern = root.__TAURI_INTERNALS__
  if (isRecord(modern)) {
    const invoke = bindFunction<TauriInvoke>(modern, modern.invoke)
    if (invoke) return invoke
  }

  const legacy = root.__TAURI__
  if (!isRecord(legacy)) return null
  const core = legacy.core
  if (isRecord(core)) {
    const invoke = bindFunction<TauriInvoke>(core, core.invoke)
    if (invoke) return invoke
  }
  return bindFunction<TauriInvoke>(legacy, legacy.invoke)
}

/** Detects the Capacitor LocalAI plugin without importing native-only packages. */
export function detectCapacitorLocalAI(): CapacitorParseThought | null {
  const root = globalThis as unknown as UnknownRecord
  const capacitor = root.Capacitor
  if (!isRecord(capacitor) || !isRecord(capacitor.Plugins)) return null

  // LocalAI is the canonical plugin name. LocalAIPlugin keeps compatibility
  // with the bridge name used by the original implementation sketch.
  const plugin = capacitor.Plugins.LocalAI ?? capacitor.Plugins.LocalAIPlugin
  if (!isRecord(plugin)) return null
  return bindFunction<CapacitorParseThought>(plugin, plugin.parseThought)
}

function resultText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isRecord(value)) throw new Error('Local AI bridge returned no usable response')

  for (const key of ['text', 'response', 'output', 'content'] as const) {
    const candidate = value[key]
    if (typeof candidate === 'string') return candidate
  }

  if ('plan' in value) return JSON.stringify(value.plan)
  return JSON.stringify(value)
}

function bridgePayload(
  profile: LocalAiModelProfile,
  request: LocalAiGenerateRequest,
): Record<string, unknown> {
  return {
    text: request.prompt,
    systemPrompt: request.systemPrompt,
    context: request.context ?? {},
    modelId: profile.modelId,
    maxOutputTokens: Math.min(
      profile.maxOutputTokens,
      Math.max(1, request.maxOutputTokens ?? profile.maxOutputTokens),
    ),
    temperature: profile.temperature ?? 0.1,
    topP: profile.topP ?? 0.9,
    responseFormat: request.responseFormat ?? 'text',
    jsonSchema: typeof request.jsonSchema === 'string'
      ? request.jsonSchema
      : request.jsonSchema
        ? JSON.stringify(request.jsonSchema)
        : undefined,
  }
}

abstract class NativeLocalAiAdapter implements LocalAiRuntimeAdapter {
  public abstract readonly backend: LocalAiBackend
  public readonly profile: LocalAiModelProfile
  private latestRequestId = 0

  protected constructor(profile: LocalAiModelProfile) {
    this.profile = profile
  }

  public abstract isAvailable(): boolean
  protected abstract invoke(payload: Record<string, unknown>): Promise<unknown>

  public async generate(request: LocalAiGenerateRequest): Promise<LocalAiGenerationResult> {
    const startedAt = monotonicNow()
    const requestId = ++this.latestRequestId
    assertNotAborted(request.signal)

    const raw = await awaitWithAbort(this.invoke(bridgePayload(this.profile, request)), request.signal)
    assertNotAborted(request.signal)
    if (requestId !== this.latestRequestId) {
      throw new LocalAiAbortError('Local AI request was superseded by newer input')
    }

    const text = resultText(raw)
    if (text) request.onToken?.(text, text)
    return {
      text,
      backend: this.backend,
      modelId: this.profile.modelId,
      durationMs: Math.max(0, monotonicNow() - startedAt),
    }
  }

  public async dispose(): Promise<void> {
    this.latestRequestId += 1
  }
}

export interface TauriLocalAiAdapterOptions {
  command?: string
  invoke?: TauriInvoke
}

export class TauriLocalAiAdapter extends NativeLocalAiAdapter {
  public readonly backend = 'tauri' as const
  private readonly command: string
  private readonly invokeOverride?: TauriInvoke

  public constructor(profile: LocalAiModelProfile, options: TauriLocalAiAdapterOptions = {}) {
    super(profile)
    this.command = options.command ?? 'parse_thought'
    this.invokeOverride = options.invoke
  }

  public isAvailable(): boolean {
    return Boolean(this.invokeOverride ?? detectTauriInvoke())
  }

  protected invoke(payload: Record<string, unknown>): Promise<unknown> {
    const invoke = this.invokeOverride ?? detectTauriInvoke()
    if (!invoke) return Promise.reject(new Error('Tauri Local AI bridge is unavailable'))
    return invoke(this.command, payload)
  }
}

export interface CapacitorLocalAiAdapterOptions {
  parseThought?: CapacitorParseThought
}

export class CapacitorLocalAiAdapter extends NativeLocalAiAdapter {
  public readonly backend = 'capacitor' as const
  private readonly parseThoughtOverride?: CapacitorParseThought

  public constructor(profile: LocalAiModelProfile, options: CapacitorLocalAiAdapterOptions = {}) {
    super(profile)
    this.parseThoughtOverride = options.parseThought
  }

  public isAvailable(): boolean {
    return Boolean(this.parseThoughtOverride ?? detectCapacitorLocalAI())
  }

  protected invoke(payload: Record<string, unknown>): Promise<unknown> {
    const parseThought = this.parseThoughtOverride ?? detectCapacitorLocalAI()
    if (!parseThought) return Promise.reject(new Error('Capacitor LocalAI plugin is unavailable'))
    return parseThought(payload)
  }
}

export function createTauriLocalAiAdapter(
  profile: LocalAiModelProfile,
  options?: TauriLocalAiAdapterOptions,
): TauriLocalAiAdapter {
  return new TauriLocalAiAdapter(profile, options)
}

export function createCapacitorLocalAiAdapter(
  profile: LocalAiModelProfile,
  options?: CapacitorLocalAiAdapterOptions,
): CapacitorLocalAiAdapter {
  return new CapacitorLocalAiAdapter(profile, options)
}
