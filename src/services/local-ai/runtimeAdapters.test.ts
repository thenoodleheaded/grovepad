import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalAiModelProfile } from './types'

const mocks = vi.hoisted(() => ({
  createEngine: vi.fn(),
  createWorkerEngine: vi.fn(),
  createCompletion: vi.fn(),
  interrupt: vi.fn(),
  unload: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('@mlc-ai/web-llm', () => ({
  CreateMLCEngine: mocks.createEngine,
  CreateWebWorkerMLCEngine: mocks.createWorkerEngine,
}))

import {
  CapacitorLocalAiAdapter,
  TauriLocalAiAdapter,
  detectCapacitorLocalAI,
  detectTauriInvoke,
} from './nativeAdapters'
import { WebLlmAdapter, resetWebLlmRuntimeForTests } from './webLlmAdapter'

const webProfile: LocalAiModelProfile = {
  id: 'web-test',
  backend: 'webllm',
  modelId: 'tiny-test-model',
  maxOutputTokens: 64,
}

const tauriProfile: LocalAiModelProfile = {
  id: 'tauri-test',
  backend: 'tauri',
  modelId: 'native-test-model',
  maxOutputTokens: 128,
}

const capacitorProfile: LocalAiModelProfile = {
  id: 'capacitor-test',
  backend: 'capacitor',
  modelId: 'mobile-test-model',
  maxOutputTokens: 96,
}

async function* streamedAnswer() {
  yield { choices: [{ delta: { content: '{"widgets":' } }] }
  yield { choices: [{ delta: { content: '[]}' } }] }
}

const mockEngine = {
  chat: { completions: { create: mocks.createCompletion } },
  interruptGenerate: mocks.interrupt,
  unload: mocks.unload,
  reload: mocks.reload,
  setInitProgressCallback: vi.fn(),
}

function globals(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>
}

describe('WebLlmAdapter', () => {
  beforeEach(async () => {
    await resetWebLlmRuntimeForTests()
    vi.clearAllMocks()
    mocks.createCompletion.mockImplementation(async (request: { stream?: boolean }) =>
      request.stream
        ? streamedAnswer()
        : { choices: [{ message: { content: '{"widgets":[]}' } }] },
    )
    mocks.createEngine.mockImplementation(
      async (
        _modelId: string,
        config?: { initProgressCallback?: (report: object) => void },
      ) => {
        config?.initProgressCallback?.({ progress: 0.5, timeElapsed: 0.25, text: 'Loading' })
        return mockEngine
      },
    )
  })

  afterEach(async () => {
    await resetWebLlmRuntimeForTests()
    vi.unstubAllGlobals()
  })

  it('lazily creates one cached engine and streams text', async () => {
    const tokens: string[] = []
    const progress: number[] = []
    const adapter = new WebLlmAdapter(webProfile, { preferWorker: false })

    const first = await adapter.generate({
      prompt: 'make a plan',
      responseFormat: 'json',
      onToken: (token) => tokens.push(token),
      onInitProgress: (report) => progress.push(report.progress),
    })
    const second = await adapter.generate({ prompt: 'make another plan' })

    expect(first.text).toBe('{"widgets":[]}')
    expect(second.text).toBe('{"widgets":[]}')
    expect(tokens).toEqual(['{"widgets":', '[]}'])
    expect(progress).toEqual([0.5])
    expect(mocks.createEngine).toHaveBeenCalledTimes(1)
  })

  it('supports non-streaming completion', async () => {
    const adapter = new WebLlmAdapter(webProfile, { preferWorker: false })
    const result = await adapter.generate({ prompt: 'make a plan', stream: false, maxOutputTokens: 12 })
    expect(result.text).toBe('{"widgets":[]}')
    expect(mocks.createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      max_tokens: 12,
      enable_thinking: false,
      response_format: undefined,
    }))

    await adapter.generate({
      prompt: 'make JSON',
      stream: false,
      responseFormat: 'json',
      jsonSchema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    })
    expect(mocks.createCompletion).toHaveBeenLastCalledWith(expect.objectContaining({
      response_format: expect.objectContaining({
        type: 'json_object',
        schema: expect.any(String),
      }),
    }))
  })

  it('fails closed when worker finalization stalls instead of blocking the UI thread', async () => {
    class StalledWorker {
      public terminate = vi.fn()
    }
    vi.stubGlobal('Worker', StalledWorker)
    mocks.createWorkerEngine.mockImplementation(
      async (
        _worker: unknown,
        _modelId: string,
        config?: { initProgressCallback?: (report: object) => void },
      ) => {
        config?.initProgressCallback?.({ progress: 0.975, timeElapsed: 1, text: 'Finish loading on WebGPU - apple' })
        return new Promise<never>(() => {})
      },
    )
    const adapter = new WebLlmAdapter(webProfile, {
      preferWorker: true,
      workerFinalizationTimeoutMs: 1,
    })

    await expect(adapter.generate({ prompt: 'make a plan', stream: false })).rejects.toMatchObject({
      name: 'WorkerFinalizationError',
    })
    expect(mocks.createWorkerEngine).toHaveBeenCalledTimes(1)
    expect(mocks.createEngine).not.toHaveBeenCalled()
  })

  it('bounds a ready worker that cannot generate without starting a UI-thread engine', async () => {
    class NonGeneratingWorker {
      public terminate = vi.fn()
    }
    vi.stubGlobal('Worker', NonGeneratingWorker)
    mocks.createWorkerEngine.mockResolvedValue(mockEngine)
    mocks.createCompletion.mockImplementationOnce(() => new Promise<never>(() => {}))
    const adapter = new WebLlmAdapter(webProfile, { preferWorker: true })

    await expect(adapter.generate({
      prompt: 'warm up',
      stream: false,
      generationTimeoutMs: 1,
    })).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(mocks.createWorkerEngine).toHaveBeenCalledTimes(1)
    expect(mocks.createEngine).not.toHaveBeenCalled()
    expect(mocks.createCompletion).toHaveBeenCalledTimes(1)
  })
})

describe('native local AI adapters', () => {
  afterEach(() => {
    delete globals().__TAURI_INTERNALS__
    delete globals().__TAURI__
    delete globals().Capacitor
    vi.restoreAllMocks()
  })

  it('detects modern and legacy Tauri invoke bridges', async () => {
    const modernInvoke = vi.fn(async () => 'modern')
    globals().__TAURI_INTERNALS__ = { invoke: modernInvoke }
    expect(await detectTauriInvoke()?.('parse_thought')).toBe('modern')

    delete globals().__TAURI_INTERNALS__
    const legacyInvoke = vi.fn(async () => 'legacy')
    globals().__TAURI__ = { core: { invoke: legacyInvoke } }
    expect(await detectTauriInvoke()?.('parse_thought')).toBe('legacy')
  })

  it('passes the selected model profile through the Tauri bridge', async () => {
    const invoke = vi.fn(async () => ({ text: '{"widgets":[]}' }))
    const adapter = new TauriLocalAiAdapter(tauriProfile, { invoke })
    const result = await adapter.generate({ prompt: 'build my week', maxOutputTokens: 24 })

    expect(result.text).toBe('{"widgets":[]}')
    expect(invoke).toHaveBeenCalledWith(
      'parse_thought',
      expect.objectContaining({ text: 'build my week', modelId: 'native-test-model', maxOutputTokens: 24 }),
    )
  })

  it('detects Capacitor LocalAI and serializes structured plans', async () => {
    const parseThought = vi.fn(async () => ({ plan: { widgets: [] } }))
    globals().Capacitor = { Plugins: { LocalAI: { parseThought } } }
    expect(detectCapacitorLocalAI()).not.toBeNull()

    const adapter = new CapacitorLocalAiAdapter(capacitorProfile)
    const result = await adapter.generate({ prompt: 'prepare a trip' })
    expect(result.text).toBe('{"widgets":[]}')
    expect(parseThought).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'prepare a trip', modelId: 'mobile-test-model' }),
    )
  })

  it('discards a slow native response superseded by newer input', async () => {
    let resolveFirst: ((value: unknown) => void) | undefined
    const invoke = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<unknown>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce({ text: 'new' })
    const adapter = new TauriLocalAiAdapter(tauriProfile, { invoke })

    const first = adapter.generate({ prompt: 'old' })
    const firstExpectation = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await expect(adapter.generate({ prompt: 'new' })).resolves.toMatchObject({ text: 'new' })
    resolveFirst?.({ text: 'old' })
    await firstExpectation
  })
})
