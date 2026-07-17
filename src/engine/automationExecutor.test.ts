import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AutomationCoreData } from '../types/spatial'
import { buildBoardSnapshot } from '../utils/persistence'
import { parsePersistedBoard } from '../utils/persistedBoardSchema'
import { useWidgetStore } from '../store/useWidgetStore'
import { cancelAutomationWidget, executeAutomationWidget, resolveHttpRequestConfig } from './automationExecutor'
import { runAutomationCommand } from '../widgets/fields/automationCore'

const baseline = parsePersistedBoard(buildBoardSnapshot(useWidgetStore.getState()))!

afterEach(() => {
  vi.unstubAllGlobals()
  useWidgetStore.getState().loadBoard(baseline)
})

function automation(type: 'http_request' | 'widget_creator' | 'idempotency_store' | 'state_machine') {
  const id = useWidgetStore.getState().createWidget(type, { x: 10_000, y: 10_000 }, type)
  return { id, data: useWidgetStore.getState().widgets[id]!.data as AutomationCoreData }
}

describe('automation execution contracts', () => {
  it('validates configuration, URL, method, headers, and timeout before fetch', async () => {
    expect(() => resolveHttpRequestConfig('http_request', { config: '{broken', input: 'https://example.com' })).toThrow(/invalid/i)
    expect(() => resolveHttpRequestConfig('http_request', { config: '{}', input: 'file:///tmp/value' })).toThrow(/HTTP and HTTPS/i)
    expect(() => resolveHttpRequestConfig('http_request', { config: '{"url":"https://example.com","headers":{"x":2}}', input: '' })).toThrow(/must be text/i)
    expect(resolveHttpRequestConfig('http_request', { config: '{"url":"https://example.com","timeoutMs":1}', input: '' }).timeoutMs).toBe(1000)

    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const { id, data } = automation('http_request')
    useWidgetStore.getState().updateWidgetData(id, { ...data, config: '{broken', input: 'https://example.com' })
    await executeAutomationWidget(id)
    expect(fetch).not.toHaveBeenCalled()
    expect((useWidgetStore.getState().widgets[id]!.data as AutomationCoreData).lastError).toMatch(/invalid/i)
  })

  it('cancels a hanging request, clears Running, and ignores repeated Execute input', async () => {
    let rejectRequest: ((reason: unknown) => void) | null = null
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      rejectRequest = reject
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const { id, data } = automation('http_request')
    useWidgetStore.getState().updateWidgetData(id, { ...data, config: '{"url":"https://example.com","timeoutMs":120000}' })
    const running = executeAutomationWidget(id)
    const repeated = executeAutomationWidget(id)
    await Promise.resolve()
    expect(fetch).toHaveBeenCalledTimes(1)
    cancelAutomationWidget(id)
    await Promise.all([running, repeated])
    const result = useWidgetStore.getState().widgets[id]!.data as AutomationCoreData
    expect(result.running).toBe(false)
    expect(result.lastError).toMatch(/cancelled|timed out/i)
    expect(rejectRequest).not.toBeNull()
  })

  it('enforces stack LIFO and set uniqueness', () => {
    const base = { label: '', input: 'first', output: '', config: '{}', mode: 'standard', enabled: true, running: false, count: 0, concurrency: 1, lastRunAt: null, lastError: '', items: [] } satisfies AutomationCoreData
    const one = runAutomationCommand('stack_store', 'enqueue', base)
    const two = runAutomationCommand('stack_store', 'enqueue', { ...one, input: 'second' })
    expect(runAutomationCommand('stack_store', 'dequeue', two).output).toBe('second')

    const setOne = runAutomationCommand('set_store', 'enqueue', base)
    const duplicate = runAutomationCommand('set_store', 'enqueue', setOne)
    expect(duplicate.items).toHaveLength(1)
    expect(duplicate.count).toBe(1)
  })

  it('enforces state transitions and idempotency', async () => {
    const stateMachine = automation('state_machine')
    useWidgetStore.getState().updateWidgetData(stateMachine.id, { ...stateMachine.data, input: 'done', output: 'idle', config: '{"initial":"idle","transitions":{"idle":["running"],"running":["done"]}}' })
    await executeAutomationWidget(stateMachine.id)
    expect((useWidgetStore.getState().widgets[stateMachine.id]!.data as AutomationCoreData).lastError).toMatch(/not allowed/i)
    const current = useWidgetStore.getState().widgets[stateMachine.id]!.data as AutomationCoreData
    useWidgetStore.getState().updateWidgetData(stateMachine.id, { ...current, input: 'running' })
    await executeAutomationWidget(stateMachine.id)
    expect((useWidgetStore.getState().widgets[stateMachine.id]!.data as AutomationCoreData).output).toBe('running')

    const idempotency = automation('idempotency_store')
    useWidgetStore.getState().updateWidgetData(idempotency.id, { ...idempotency.data, input: 'event-42' })
    await executeAutomationWidget(idempotency.id)
    await executeAutomationWidget(idempotency.id)
    const result = useWidgetStore.getState().widgets[idempotency.id]!.data as AutomationCoreData
    expect(result.items).toHaveLength(1)
    expect(result.count).toBe(1)
    expect(result.output).toBe('Duplicate ignored')
  })

  it('commits a Widget Creator batch in one undoable transaction', async () => {
    const creator = automation('widget_creator')
    useWidgetStore.getState().updateWidgetData(creator.id, { ...creator.data, input: 'Alpha\nBeta', config: '{"type":"notes"}' })
    const before = new Set(Object.keys(useWidgetStore.getState().widgets))
    await executeAutomationWidget(creator.id)
    const created = Object.keys(useWidgetStore.getState().widgets).filter((id) => !before.has(id))
    expect(created).toHaveLength(2)
    expect((useWidgetStore.getState().widgets[creator.id]!.data as AutomationCoreData).running).toBe(false)
    useWidgetStore.getState().undo()
    expect(created.every((id) => !useWidgetStore.getState().widgets[id])).toBe(true)
    expect((useWidgetStore.getState().widgets[creator.id]!.data as AutomationCoreData).running).toBe(false)
  })
})
