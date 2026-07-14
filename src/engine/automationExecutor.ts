import type { AutomationCoreData, ModuleData, RelationType } from '../types/spatial'
import { AUTOMATION_CORE_SET, type AutomationCoreType } from '../widgets/automationCoreCatalog'
import { commandsFor } from '../widgets/fields'
import { useWidgetStore } from '../store/useWidgetStore'

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

function parseConfig(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean)
}

async function runWorker(code: string, input: string, timeout = 3000): Promise<string> {
  const workerSource = `self.onmessage=async(e)=>{try{const fn=new Function('input','"use strict";'+e.data.code);const value=await fn(e.data.input);self.postMessage({ok:true,value})}catch(error){self.postMessage({ok:false,error:String(error&&error.message||error)})}}`
  const url = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
  const worker = new Worker(url)
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.terminate()
        reject(new Error('Script timed out'))
      }, timeout)
      worker.onmessage = (event) => {
        clearTimeout(timer)
        if (event.data.ok) {
          resolve(typeof event.data.value === 'string' ? event.data.value : JSON.stringify(event.data.value))
        } else {
          reject(new Error(event.data.error))
        }
      }
      worker.onerror = (event) => {
        clearTimeout(timer)
        reject(new Error(event.message))
      }
      worker.postMessage({ code, input })
    })
  } finally {
    worker.terminate()
    URL.revokeObjectURL(url)
  }
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
  store.applyWireWrites(new Map<string, ModuleData>([[widgetId, command.run(widget.data)]]))
}

export function isAutomationRunning(widgetId: string): boolean {
  return inFlight.has(widgetId)
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
  if (!data.enabled) return

  // Stateful types map Execute onto their pure command — no async work.
  if (type === 'queue' || type === 'stack_store' || type === 'set_store') {
    runPureCommand(widgetId, 'enqueue')
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

  inFlight.add(widgetId)
  write(widgetId, { running: true, lastError: '' })
  const config = parseConfig(data.config)
  try {
    let output = data.input
    if (type === 'script_block' || type === 'local_function') {
      output = await runWorker(data.config || 'return input', data.input, Number(config.timeoutMs) || 3000)
    } else if (type === 'http_request' || type === 'webhook_sender') {
      const url = String(config.url ?? data.input)
      const method = String(config.method ?? (type === 'webhook_sender' ? 'POST' : 'GET')).toUpperCase()
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json', ...(config.headers as Record<string, string> | undefined) },
        ...(method === 'GET' ? {} : { body: String(config.body ?? data.input) }),
      })
      output = await response.text()
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    } else if (type === 'widget_creator') {
      const created = lines(data.input).map((title, index) =>
        store.createWidget(
          title,
          { x: self.position.x + self.size.width + 80, y: self.position.y + index * 120 },
          String(config.type ?? 'notes') as never,
        ),
      )
      output = created.join(',')
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
    } else if (type === 'auto_grouper') {
      const ids = lines(data.input)
      if (ids.length > 1) output = store.createGroup(ids)
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
      lastError: error instanceof Error ? error.message : String(error),
      lastRunAt: Date.now(),
    })
  } finally {
    inFlight.delete(widgetId)
  }
}
