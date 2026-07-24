import type { AutomationCoreData, ModuleData, RelationType } from '../types/spatial'
import { AUTOMATION_CORE_SET, type AutomationCoreType } from '../widgets/automationCoreCatalog'
import { commandsFor } from '../widgets/fields'
import { useWidgetStore } from '../store/useWidgetStore'
import { MODULE_TYPES } from '../types/spatial'
import type { ThoughtPlan } from '../utils/thoughtInterpreter'
import { isWidgetTypePublic, widgetDefinition } from '../widgets/registry'

// ---------------------------------------------------------------------------
// Automation executor — the async half of the automation-core widgets.
//
// Lives at store level (not in a React component) so a trigger wire can run
// an automation widget that is scrolled offscreen, culled, or on another
// canvas. The widget's Execute button calls the same function, so manual and
// wired runs behave identically.
//
// Results are written through applyWireWrites: no undo entry for the status
// bookkeeping itself, and the output write re-enters the circuit engine so
// chains like  manual trigger → HTTP request → notes  keep flowing.
// ---------------------------------------------------------------------------

const inFlight = new Set<string>()
const requestControllers = new Map<string, AbortController>()
const MODULE_TYPE_SET = new Set<string>(MODULE_TYPES)

export function parseAutomationConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Configuration must be a JSON object')
    return parsed as Record<string, unknown>
  } catch {
    throw new Error('Configuration JSON is invalid. Fix it before running this automation.')
  }
}

export function resolveHttpRequestConfig(
  type: 'http_request' | 'webhook_sender',
  data: Pick<AutomationCoreData, 'config' | 'input'>,
): { url: string; method: string; headers: Record<string, string>; body?: string; timeoutMs: number } {
  const config = parseAutomationConfig(data.config)
  const rawUrl = String(config.url ?? data.input).trim()
  let parsedUrl: URL
  try { parsedUrl = new URL(rawUrl) } catch { throw new Error('Enter a valid HTTP or HTTPS URL before running this automation.') }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error('Only HTTP and HTTPS endpoints are allowed.')
  const method = String(config.method ?? (type === 'webhook_sender' ? 'POST' : 'GET')).toUpperCase()
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw new Error(`Unsupported HTTP method: ${method}`)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (config.headers !== undefined) {
    if (!config.headers || typeof config.headers !== 'object' || Array.isArray(config.headers)) throw new Error('HTTP headers must be a JSON object.')
    for (const [key, value] of Object.entries(config.headers)) {
      if (typeof value !== 'string') throw new Error(`HTTP header “${key}” must be text.`)
      headers[key] = value
    }
  }
  const configuredTimeout = Number(config.timeoutMs)
  const timeoutMs = Number.isFinite(configuredTimeout) ? Math.min(120_000, Math.max(1_000, configuredTimeout)) : 15_000
  return { url: parsedUrl.toString(), method, headers, timeoutMs, ...(method === 'GET' ? {} : { body: String(config.body ?? data.input) }) }
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

/** Patch an automation widget's data from its LIVE state, without history. */
function write(widgetId: string, patch: Partial<AutomationCoreData>): void {
  const store = useWidgetStore.getState()
  const widget = store.widgets[widgetId]
  if (!widget || !AUTOMATION_CORE_SET.has(widget.type)) return
  const data = widget.data as AutomationCoreData
  store.applyWireWrites(new Map<string, ModuleData>([[widgetId, { ...data, ...patch }]]))
}

/** Run one automation widget's pure command (queue ops, approvals, locks). */
function runPureCommand(widgetId: string, key: string): void {
  const store = useWidgetStore.getState()
  const widget = store.widgets[widgetId]
  if (!widget) return
  const command = commandsFor(widget.type).find((entry) => entry.key === key)
  if (!command) return
  store.updateWidgetData(widgetId, command.run(widget.data))
}

export function isAutomationRunning(widgetId: string): boolean {
  return inFlight.has(widgetId)
}

export function cancelAutomationWidget(widgetId: string): void {
  requestControllers.get(widgetId)?.abort()
}

/**
 * Execute an automation-core widget. Idempotent while running (a widget
 * never executes concurrently with itself); disabled widgets are inert.
 */
export async function executeAutomationWidget(widgetId: string): Promise<void> {
  if (inFlight.has(widgetId)) return
  const store = useWidgetStore.getState()
  const self = store.widgets[widgetId]
  if (!self || !AUTOMATION_CORE_SET.has(self.type)) return
  const type = self.type as AutomationCoreType
  const data = self.data as AutomationCoreData
  const definition = widgetDefinition(type)
  if (definition.availability === 'existing-only') {
    write(widgetId, {
      running: false,
      enabled: false,
      input: type === 'secret_reference' ? '' : data.input,
      output: '',
      lastError: definition.unavailableReason ?? 'This automation is unavailable.',
    })
    return
  }
  if (!data.enabled) return

  // Stateful types map Execute onto their pure command — no async work.
  if (type === 'queue' || type === 'stack_store' || type === 'set_store') {
    runPureCommand(widgetId, 'enqueue')
    return
  }
  if (type === 'idempotency_store') {
    const duplicate = data.items.some((item) => item.key === data.input || item.value === data.input)
    store.updateWidgetData(widgetId, duplicate
      ? { ...data, output: 'Duplicate ignored', lastError: '', lastRunAt: Date.now() }
      : { ...data, output: data.input, count: data.count + 1, lastError: '', lastRunAt: Date.now(), items: [...data.items, { id: crypto.randomUUID(), key: data.input, value: data.input, status: 'done', at: Date.now() }] })
    return
  }
  if (type === 'state_machine') {
    try {
      const config = parseAutomationConfig(data.config)
      const transitions = config.transitions
      if (!transitions || typeof transitions !== 'object' || Array.isArray(transitions)) throw new Error('Define transitions in Configuration JSON before running the state machine.')
      const current = data.output || String(config.initial ?? '')
      const next = data.input.trim()
      const allowed = (transitions as Record<string, unknown>)[current]
      if (!next || !Array.isArray(allowed) || !allowed.map(String).includes(next)) throw new Error(`Transition ${current || '(unset)'} → ${next || '(empty)'} is not allowed.`)
      store.updateWidgetData(widgetId, { ...data, output: next, count: data.count + 1, lastRunAt: Date.now(), lastError: '' })
    } catch (error) {
      store.updateWidgetData(widgetId, { ...data, lastError: error instanceof Error ? error.message : String(error), lastRunAt: Date.now() })
    }
    return
  }
  if (type === 'mutex' || type === 'workflow_lock') {
    runPureCommand(widgetId, 'acquire')
    return
  }
  if (type === 'approval_gate') {
    write(widgetId, { running: true, output: 'waiting for approval' })
    return
  }

  if (type === 'widget_creator') {
    try {
      const config = parseAutomationConfig(data.config)
      const requestedType = String(config.type ?? 'notes')
      if (!MODULE_TYPE_SET.has(requestedType)) throw new Error(`Unknown widget type: ${requestedType}`)
      if (!isWidgetTypePublic(requestedType as never)) throw new Error(`${widgetDefinition(requestedType as never).label} is not available for creation in this beta.`)
      const titles = lines(data.input)
      if (titles.length === 0) throw new Error('Enter at least one widget title')
      const plan: ThoughtPlan = {
        sourceText: data.input,
        confidence: 1,
        nodes: titles.map((title, index) => ({ temporaryId: `created-${index}`, widgetType: requestedType as never, title, data: widgetDefinition(requestedType as never).defaultData(), sourceText: title, confidence: 1, depth: 0, metadata: { badges: [] } })),
        relations: [], warnings: [],
      }
      const created = store.commitThoughtPlan(plan, { x: self.position.x + self.size.width + 80, y: self.position.y })
      write(widgetId, { output: created.join(','), running: false, count: data.count + 1, lastRunAt: Date.now(), lastError: '' })
    } catch (error) {
      write(widgetId, { running: false, lastError: error instanceof Error ? error.message : String(error), lastRunAt: Date.now() })
    }
    return
  }

  inFlight.add(widgetId)
  write(widgetId, { running: true, lastError: '' })
  let requestTimer: ReturnType<typeof setTimeout> | null = null
  try {
    const config = parseAutomationConfig(data.config)
    let output = data.input
    if (type === 'http_request' || type === 'webhook_sender') {
      const request = resolveHttpRequestConfig(type, data)
      const controller = new AbortController()
      requestControllers.set(widgetId, controller)
      requestTimer = setTimeout(() => controller.abort(), request.timeoutMs)
      const response = await fetch(request.url, {
        method: request.method,
        signal: controller.signal,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
      })
      output = await response.text()
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    } else if (type === 'branch_builder') {
      const titles = lines(data.input)
      const created = titles.map((title, index) => {
        const id = store.createWidget(
          title,
          {
            x: self.position.x + (index - (titles.length - 1) / 2) * 360,
            y: self.position.y + self.size.height + 120,
          },
          String(config.type ?? 'notes') as never,
        )
        store.addRelation(widgetId, id, 'parent')
        return id
      })
      output = created.join(',')
    } else if (type === 'relation_builder') {
      const from = String(config.fromId ?? widgetId)
      const to = String(config.toId ?? data.input)
      if (to) output = store.addRelation(from, to, String(config.relation ?? 'parent') as RelationType)
    } else if (type === 'clone_branch') {
      output = store.duplicateWidgets(lines(data.input).length ? lines(data.input) : [widgetId]).join(',')
    } else if (type === 'auto_layout_action') {
      store.untangleCanvas()
      output = 'Canvas untangled'
    } else if (type === 'focus_action') {
      const id = String(config.widgetId ?? data.input)
      store.flashWidget(id)
      output = id
    } else if (type === 'widget_deleter') {
      const ids = lines(data.input).filter((id) => id !== widgetId)
      if (ids.length) store.deleteWidgets(ids)
      output = `Deleted ${ids.length}`
    }
    const live = useWidgetStore.getState().widgets[widgetId]?.data as AutomationCoreData | undefined
    write(widgetId, {
      output,
      running: false,
      count: (live?.count ?? data.count) + 1,
      lastRunAt: Date.now(),
      lastError: '',
    })
  } catch (error) {
    write(widgetId, {
      running: false,
      lastError: error instanceof DOMException && error.name === 'AbortError'
        ? 'Request cancelled or timed out. Review the endpoint and try again.'
        : error instanceof Error ? error.message : String(error),
      lastRunAt: Date.now(),
    })
  } finally {
    if (requestTimer) clearTimeout(requestTimer)
    requestControllers.delete(widgetId)
    inFlight.delete(widgetId)
  }
}
