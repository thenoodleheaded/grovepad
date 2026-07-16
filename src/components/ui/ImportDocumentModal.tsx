import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrainCircuit, FileText, FileUp, Sparkles, X, Loader2 } from 'lucide-react'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useCanvasStore } from '../../store/useCanvasStore'
import { boundsForWidgets } from '../../utils/widgetBounds'
import { useToastStore } from '../../store/useToastStore'
import { useAiDebugStore, type AiCallPhase } from '../../store/useAiDebugStore'
import { extractFileContent } from '../../utils/documentReader'
import { layoutMindmap } from '../../utils/mindmapLayout'
import { importTypeCatalog, IMPORT_SELECTABLE_TYPES } from '../../widgets/registry'
import { useFocusTrap } from '../../hooks/useFocusTrap'

const MAX_FILES = 5
const ACCEPTED = '.pdf,.md,.markdown,.txt,.csv,.json'
const HYDRATION_CONCURRENCY = 3

interface StagedFile {
  id: string
  name: string
  size: number
  fileObject: File
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      if (item !== undefined) await run(item)
    }
  })
  await Promise.all(workers)
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Import cancelled', 'AbortError')
}

interface OpenAiCallOptions {
  apiKey: string
  model: string
  messages: Array<{ role: 'system' | 'user'; content: string }>
  schemaName: string
  schema: object
  signal: AbortSignal
  /** Trace metadata for the AI debugger (panel toggled with `I`). */
  phase: AiCallPhase
  label: string
}

/**
 * Single chokepoint for every OpenAI request the importer makes. Handles the
 * structured-output plumbing and error shaping. When the developer debugger
 * is open, it also traces the full call without making closed diagnostics a
 * permanent allocation and render cost.
 * Returns the raw JSON text of the model's structured output.
 */
async function callOpenAi(options: OpenAiCallOptions): Promise<string> {
  const { apiKey, model, messages, schemaName, schema, signal, phase, label } = options
  const debugState = useAiDebugStore.getState()
  const debug = debugState.isOpen ? debugState : null
  const callId = debug?.beginCall({
    phase,
    label,
    model,
    prompt: messages.map((m) => `[${m.role}]\n${m.content}`).join('\n\n'),
  })
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, schema, strict: true },
        },
      }),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      const message = (() => {
        try {
          return JSON.parse(errText)?.error?.message ?? errText
        } catch {
          return errText
        }
      })()
      throw new Error(`OpenAI API Error: ${res.status} - ${message}`)
    }

    const resData = await res.json()
    throwIfAborted(signal)
    const jsonText = resData.choices?.[0]?.message?.content
    if (!jsonText) throw new Error('OpenAI API returned an empty response')

    if (debug && callId) debug.endCall(callId, {
      status: 'ok',
      response: jsonText,
      promptTokens: resData.usage?.prompt_tokens ?? 0,
      completionTokens: resData.usage?.completion_tokens ?? 0,
    })
    return jsonText
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError'
    if (debug && callId) debug.endCall(callId, {
      status: aborted ? 'aborted' : 'error',
      error: aborted ? null : err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Rough chunk size for one [REF-X] anchor — big enough that a topology
    widget usually needs 1-3 refs, small enough that hydration prompts stay
    a fraction of the whole document. */
const REF_CHUNK_CHARS = 1200

/**
 * Split the source text into [REF-X]-anchored chunks (on paragraph
 * boundaries). The annotated text goes to the topology pass; the ref map is
 * kept client-side so hydration can send only the excerpts a widget cites.
 */
function chunkWithRefs(text: string): { annotated: string; refMap: Record<string, string> } {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length > REF_CHUNK_CHARS) {
      chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)

  const refMap: Record<string, string> = {}
  const annotated = chunks
    .map((chunk, i) => {
      const ref = `REF-${i + 1}`
      refMap[ref] = chunk
      return `[${ref}] ${chunk}`
    })
    .join('\n\n')
  return { annotated, refMap }
}

/**
 * OpenAI's Structured Outputs (strict mode) require every object to declare
 * `additionalProperties: false` and list every property in `required` — an
 * optional field is expressed as nullable (`type: [T, 'null']`), not omitted.
 * All fields here are always populated by the model, so nothing needs the
 * nullable treatment.
 */
function getHydrationPayloadSchema(type: string) {
  switch (type) {
    case 'checklist':
      return {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Brief actionable item label' },
                done: { type: 'boolean', description: 'Defaults to false' },
              },
              required: ['label', 'done'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      };
    case 'kanban':
      return {
        type: 'object',
        properties: {
          columns: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'e.g. To Do, In Progress, Done' },
                cards: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      label: { type: 'string', description: 'Task summary card' },
                    },
                    required: ['label'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['label', 'cards'],
              additionalProperties: false,
            },
          },
        },
        required: ['columns'],
        additionalProperties: false,
      };
    case 'budget':
      return {
        type: 'object',
        properties: {
          currency: { type: 'string', description: 'e.g. USD, EUR, $, £' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Expense or line item name' },
                amount: { type: 'number', description: 'Cost or allocation amount' },
              },
              required: ['label', 'amount'],
              additionalProperties: false,
            },
          },
        },
        required: ['currency', 'items'],
        additionalProperties: false,
      };
    case 'weekly_planner':
      return {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            description: 'Must contain exactly 7 arrays, representing tasks for Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday in order.',
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'Activity or task text' },
                  done: { type: 'boolean', description: 'Defaults to false' },
                },
                required: ['text', 'done'],
                additionalProperties: false,
              },
            },
          },
        },
        required: ['days'],
        additionalProperties: false,
      };
    case 'timeline':
      return {
        type: 'object',
        properties: {
          totalUnits: { type: 'integer', description: 'Total timeline length (e.g. 10 weeks or days)' },
          phases: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Phase or milestone label' },
                start: { type: 'integer', description: '0-indexed unit start index' },
                span: { type: 'integer', description: 'Length of phase in units' },
              },
              required: ['label', 'start', 'span'],
              additionalProperties: false,
            },
          },
        },
        required: ['totalUnits', 'phases'],
        additionalProperties: false,
      };
    case 'progress':
      return {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Label of task or milestone tracked' },
          percent: { type: 'integer', description: 'Current progress percentage (0 to 100)' },
        },
        required: ['label', 'percent'],
        additionalProperties: false,
      };
    case 'ai_generator':
      return {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'A ready-to-run generation prompt for this AI widget, phrased so running it produces the practice content or output the user wants',
          },
        },
        required: ['prompt'],
        additionalProperties: false,
      };
    case 'bullets':
      return {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { type: 'string', description: 'One short bullet point' },
          },
        },
        required: ['items'],
        additionalProperties: false,
      };
    case 'quote':
      return {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The quote or callout text' },
          attribution: { type: 'string', description: 'Who said or wrote it; empty string if unknown' },
        },
        required: ['text', 'attribution'],
        additionalProperties: false,
      };
    case 'table':
      return {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            description: 'Row-major grid; first row is the header. Every row must have the same number of cells.',
            items: {
              type: 'array',
              items: { type: 'string', description: 'Cell text' },
            },
          },
        },
        required: ['rows'],
        additionalProperties: false,
      };
    case 'pros_cons':
      return {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'What is being weighed' },
          pros: { type: 'array', items: { type: 'string', description: 'A point in favor' } },
          cons: { type: 'array', items: { type: 'string', description: 'A point against' } },
        },
        required: ['topic', 'pros', 'cons'],
        additionalProperties: false,
      };
    case 'flashcards':
      return {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                front: { type: 'string', description: 'Prompt side (term/question)' },
                back: { type: 'string', description: 'Answer side (definition/answer)' },
              },
              required: ['front', 'back'],
              additionalProperties: false,
            },
          },
        },
        required: ['cards'],
        additionalProperties: false,
      };
    case 'vocab':
      return {
        type: 'object',
        properties: {
          terms: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                term: { type: 'string', description: 'The word or phrase' },
                definition: { type: 'string', description: 'Its meaning' },
              },
              required: ['term', 'definition'],
              additionalProperties: false,
            },
          },
        },
        required: ['terms'],
        additionalProperties: false,
      };
    case 'meeting_notes':
      return {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'ISO date yyyy-mm-dd; empty string if none' },
          attendees: { type: 'string', description: 'Comma-separated names; empty string if none' },
          notes: { type: 'string', description: 'Body notes as markdown' },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Action item' },
                done: { type: 'boolean', description: 'Defaults to false' },
              },
              required: ['text', 'done'],
              additionalProperties: false,
            },
          },
        },
        required: ['date', 'attendees', 'notes', 'actions'],
        additionalProperties: false,
      };
    case 'outline':
      return {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Outline line text' },
                depth: { type: 'integer', description: 'Indent level, 0 for top level, 1 for nested, etc.' },
              },
              required: ['text', 'depth'],
              additionalProperties: false,
            },
          },
        },
        required: ['items'],
        additionalProperties: false,
      };
    case 'decision':
      return {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The decision being made' },
          options: { type: 'array', items: { type: 'string', description: 'One choice' } },
        },
        required: ['question', 'options'],
        additionalProperties: false,
      };
    case 'poll':
      return {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The poll question' },
          options: { type: 'array', items: { type: 'string', description: 'One answer option' } },
        },
        required: ['question', 'options'],
        additionalProperties: false,
      };
    case 'swot':
      return {
        type: 'object',
        properties: {
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          opportunities: { type: 'array', items: { type: 'string' } },
          threats: { type: 'array', items: { type: 'string' } },
        },
        required: ['strengths', 'weaknesses', 'opportunities', 'threats'],
        additionalProperties: false,
      };
    case 'notes':
    default:
      return {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Detailed summaries, analysis and formatted markdown notes' },
        },
        required: ['text'],
        additionalProperties: false,
      };
  }
}

/**
 * Widget types the importer fills with AI content. A type is hydrated only if
 * it appears here — every other selectable type (interactive tools like
 * calculator/pomodoro, or content types without a schema yet) spawns with its
 * registry default data and no hydration call, so the model can still choose
 * it for its function without us overwriting its shape with a bad payload.
 */
const HYDRATABLE_TYPES = new Set([
  'notes', 'checklist', 'kanban', 'budget', 'weekly_planner', 'timeline', 'progress', 'ai_generator',
  'bullets', 'quote', 'table', 'pros_cons', 'flashcards', 'vocab', 'meeting_notes', 'outline',
  'decision', 'poll', 'swot',
])

function formatHydrationData(type: string, rawData: any) {
  switch (type) {
    case 'checklist':
      return {
        items: (rawData.items || []).map((it: any) => ({
          id: crypto.randomUUID(),
          label: it.label || '',
          done: !!it.done
        }))
      };
    case 'kanban':
      return {
        columns: (rawData.columns || []).map((col: any) => ({
          id: crypto.randomUUID(),
          label: col.label || 'Column',
          cards: (col.cards || []).map((c: any) => ({
            id: crypto.randomUUID(),
            label: c.label || ''
          }))
        }))
      };
    case 'budget':
      return {
        currency: rawData.currency || '$',
        items: (rawData.items || []).map((it: any) => ({
          id: crypto.randomUUID(),
          label: it.label || '',
          amount: typeof it.amount === 'number' ? it.amount : 0
        }))
      };
    case 'weekly_planner': {
      const days = Array.from({ length: 7 }, (_, i) => {
        const rawTasks = (rawData.days || [])[i] || [];
        return rawTasks.map((t: any) => ({
          id: crypto.randomUUID(),
          text: t.text || '',
          done: !!t.done
        }));
      });
      return { days };
    }
    case 'timeline':
      return {
        totalUnits: typeof rawData.totalUnits === 'number' ? rawData.totalUnits : 10,
        phases: (rawData.phases || []).map((p: any) => ({
          id: crypto.randomUUID(),
          label: p.label || 'Phase',
          start: typeof p.start === 'number' ? p.start : 0,
          span: typeof p.span === 'number' ? p.span : 2
        }))
      };
    case 'progress':
      return {
        label: rawData.label || 'Progress',
        percent: typeof rawData.percent === 'number' ? Math.min(100, Math.max(0, rawData.percent)) : 0
      };
    case 'ai_generator':
      return {
        prompt: rawData.prompt || '',
        status: 'idle' as const
      };
    case 'bullets':
      return {
        items: (rawData.items || [])
          .map((value: any) => String(value || '').trim())
          .filter(Boolean)
          .map((text: string) => ({ id: crypto.randomUUID(), text }))
      };
    case 'quote':
      return {
        text: rawData.text || '',
        attribution: rawData.attribution || ''
      };
    case 'table':
      return {
        rows: (rawData.rows || []).map((row: any) =>
          (Array.isArray(row) ? row : []).map((cell: any) => String(cell ?? ''))
        )
      };
    case 'pros_cons':
      return {
        topic: rawData.topic || '',
        pros: (rawData.pros || []).map((t: any) => ({ id: crypto.randomUUID(), text: String(t || '') })),
        cons: (rawData.cons || []).map((t: any) => ({ id: crypto.randomUUID(), text: String(t || '') }))
      };
    case 'flashcards':
      return {
        cards: (rawData.cards || []).map((c: any) => ({
          id: crypto.randomUUID(),
          front: c.front || '',
          back: c.back || ''
        })),
        current: 0
      };
    case 'vocab':
      return {
        terms: (rawData.terms || []).map((t: any) => ({
          id: crypto.randomUUID(),
          term: t.term || '',
          definition: t.definition || '',
          known: false
        }))
      };
    case 'meeting_notes':
      return {
        date: rawData.date || '',
        attendees: rawData.attendees || '',
        notes: rawData.notes || '',
        actions: (rawData.actions || []).map((a: any) => ({
          id: crypto.randomUUID(),
          text: a.text || '',
          done: !!a.done
        }))
      };
    case 'outline':
      return {
        items: (rawData.items || []).map((it: any) => ({
          id: crypto.randomUUID(),
          text: it.text || '',
          depth: typeof it.depth === 'number' ? Math.max(0, Math.min(6, Math.round(it.depth))) : 0,
          collapsed: false
        }))
      };
    case 'decision':
      return {
        question: rawData.question || '',
        options: (rawData.options || []).map((o: any) => String(o || '')).filter(Boolean),
        pickedIndex: null
      };
    case 'poll':
      return {
        question: rawData.question || '',
        options: (rawData.options || []).map((o: any) => ({
          id: crypto.randomUUID(),
          label: String(o || ''),
          votes: 0
        }))
      };
    case 'swot':
      return {
        strengths: (rawData.strengths || []).map((s: any) => String(s || '')).filter(Boolean),
        weaknesses: (rawData.weaknesses || []).map((s: any) => String(s || '')).filter(Boolean),
        opportunities: (rawData.opportunities || []).map((s: any) => String(s || '')).filter(Boolean),
        threats: (rawData.threats || []).map((s: any) => String(s || '')).filter(Boolean)
      };
    case 'notes':
    default:
      return {
        text: rawData.text || ''
      };
  }
}

export function ImportDocumentModal() {
  const open = useWidgetStore((state) => state.importOpen)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const importMindmap = useWidgetStore((state) => state.importMindmap)
  const setWidgetHydration = useWidgetStore((state) => state.setWidgetHydration)
  const updateWidgetData = useWidgetStore((state) => state.updateWidgetData)

  const [title, setTitle] = useState('')
  const [extraText, setExtraText] = useState('')
  const [deepReasoning, setDeepReasoning] = useState(false)
  const [files, setFiles] = useState<StagedFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const foregroundAbortRef = useRef<AbortController | null>(null)

  // API Key & Loading states
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem('grovepad_openai_api_key') || '')
  const [showApiKey, setShowApiKey] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')

  const close = useCallback(() => {
    foregroundAbortRef.current?.abort()
    foregroundAbortRef.current = null
    useWidgetStore.getState().setImportOpen(false)
    setLoading(false)
    setLoadingMessage('')
  }, [])

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, closeButtonRef)

  useEffect(
    () => () => {
      foregroundAbortRef.current?.abort()
      foregroundAbortRef.current = null
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    void import('../../utils/pendingImport').then(({ takePendingImport }) => {
      const incoming = takePendingImport()
      if (incoming.length === 0) return
      setFiles((current) => [
        ...current,
        ...incoming.slice(0, Math.max(0, MAX_FILES - current.length)).map((file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          fileObject: file,
        })),
      ])
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  const stageFiles = (incoming: FileList | File[]) => {
    setFiles((current) => {
      const room = MAX_FILES - current.length
      const added = [...incoming].slice(0, Math.max(0, room)).map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        fileObject: f,
      }))
      return [...current, ...added]
    })
  }

  const handleApiKeyChange = (val: string) => {
    setOpenaiApiKey(val)
    localStorage.setItem('grovepad_openai_api_key', val)
  }

  const hasContent = files.length > 0 || extraText.trim() !== ''

  const handleImport = async () => {
    const apiKey = openaiApiKey || (import.meta.env.VITE_OPENAI_API_KEY as string) || ''
    if (!apiKey) {
      useToastStore.getState().addToast('Please provide an OpenAI API Key')
      return
    }

    foregroundAbortRef.current?.abort()
    const controller = new AbortController()
    foregroundAbortRef.current = controller
    const { signal } = controller
    setLoading(true)
    try {
      // 1. Extract text from uploaded files
      setLoadingMessage('Extracting text from files...')
      const fileTexts: string[] = []
      for (const staged of files) {
        const text = await extractFileContent(staged.fileObject)
        throwIfAborted(signal)
        fileTexts.push(`--- File: ${staged.name} ---\n${text}`)
      }
      
      const combinedDocumentText = fileTexts.join('\n\n')
      
      if (!combinedDocumentText && !extraText.trim()) {
        useToastStore.getState().addToast('Please upload files or paste some text to digest')
        setLoading(false)
        return
      }

      // 2. Digest structure (Phase 1) — documents are chunked into [REF-X]
      // anchors; the model returns only topology + ref pointers, never copied
      // text, and hydration later sends each widget only its cited chunks.
      // Pasted text is NOT chunked: it goes to the model verbatim as the
      // user's prompt — it may be instructions for what to build, or raw
      // data to digest; the model decides which.
      setLoadingMessage('Analyzing input and creating mindmap layout...')
      // GPT-5 family only — deep reasoning trades speed for the full model,
      // the fast path still never drops below the 5 tier (gpt-5-mini).
      const model = deepReasoning ? 'gpt-5' : 'gpt-5-mini'

      const pastedText = extraText.trim()
      const { annotated, refMap } = chunkWithRefs(combinedDocumentText)

      const systemPrompt = `You are the map architect for a spatial workspace: you turn user input into a mindmap of concrete, ready-to-use widgets, while saving maximum token space by using reference pointers and short briefs instead of verbatim text.

INPUT SECTIONS (either may be absent):
- SOURCE DOCUMENTS: raw material chunked into [REF-X] anchors. Always treated as data to digest.
- USER PROMPT: text the user typed or pasted directly. Read it first and decide what it is:
  * If it reads as instructions or a request (e.g. "plan a product launch", "make a calculus course breakdown", "focus on the risks"), EXECUTE it: build the thing it asks for. It controls which widgets to create, what to emphasize, and how the map is organized. Widgets it calls for may be backed by your own knowledge instead of document refs — give those an empty "sourceRefs" and a self-contained "brief".
  * If it instead reads as raw content (notes, an article, data) with no directive, treat it exactly like a source document and digest it into widgets. It carries no [REF-X] anchors, so cover it through each widget's "brief" (name the specific facts to pull from the user prompt — the content-filling pass receives the user prompt verbatim).
  * Mixed text is possible: follow the instruction parts, digest the data parts.

WIDGET CATALOG — the complete set of widget types available on this canvas. Choose the single best-fit type for each piece of content from ANY category below; do not default to notes/checklist when a more specific type fits (e.g. use "flashcards" for study Q&A, "table" for tabular data, "swot" for a SWOT analysis, "pros_cons" for tradeoffs, "vocab" for term lists, "timeline" for chronology). Interactive tool widgets (calculator, pomodoro, world_clock, etc.) carry no extractable content — pick them only when the user wants that tool on the board, and leave "sourceRefs" empty with a brief naming its purpose.
${importTypeCatalog()}

Two content-free types worth noting: "sketchpad" is a freeform drawing/practice canvas — place one next to the widget it supports and relate them; "ai_generator" is an on-canvas AI prompt box whose content is a ready-to-run generation prompt the user can run later.

CONSTRAINTS:
1. Widgets contain the ACTUAL subject matter, stated concretely. Never create widgets that describe, restate, or analyze the request itself. Forbidden: placeholder items ("Subtopic 1", "Topic 2"), meta commentary ("the source does not specify…", "details were not provided"), and restating the user's requirements back at them. If the user asks you to make or break down something, invent the real names and real content from your own knowledge.
2. If the user prompt specifies a structure (e.g. "3 topics with 8 subtopics each"), that structure overrides every default below — match the requested counts exactly.
3. Under no circumstances should you copy sentences or paragraphs from the source material into the JSON output. A widget's "brief" is a short instruction (1-2 sentences), never pasted content.
4. For every widget, supply the exact list of REF-X tags where the raw details live in the source documents ("sourceRefs": [] when the widget is driven by the user prompt or your own knowledge).
5. Keep titles concise and specific (maximum 5 words); a title names its actual content, never a placeholder.
6. If a widget draws information from different parts, include multiple tags in "sourceRefs".
7. Default when the user does not dictate structure: 3-5 logical groups. Either way, map the semantic relations between widgets (parent, cousin, blocker) to show workflow direction or dependencies.

You MUST respond strictly in the requested JSON schema. Do not output markdown code blocks or explanations outside of the JSON.`;

      const promptSections: string[] = []
      if (annotated) {
        promptSections.push(`SOURCE DOCUMENTS WITH [REF-X] ANCHORS:\n---\n${annotated}\n---`)
      }
      if (pastedText) {
        promptSections.push(`USER PROMPT (instructions to follow, or raw data to digest — decide which):\n---\n${pastedText}\n---`)
      }
      promptSections.push(
        `Map title: "${title || 'Ingested Map'}"\n\nBuild the widgets, groups, and relations topology now. Widget content is the actual subject matter — never commentary about this request.`,
      )
      const userPrompt = promptSections.join('\n\n')

      const topologySchema = {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short identifier e.g. g1, g2' },
                label: { type: 'string', description: 'Category name' },
              },
              required: ['id', 'label'],
              additionalProperties: false,
            },
          },
          widgets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: 'Short identifier e.g. w1, w2' },
                type: { type: 'string', enum: [...IMPORT_SELECTABLE_TYPES] },
                title: { type: 'string', description: 'Actionable widget title, maximum 5 words' },
                groupId: { type: ['string', 'null'], description: 'Group ID it belongs to, or null' },
                sourceRefs: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'REF-X tags pointing at where the raw details live in the source documents, e.g. ["REF-2", "REF-5"]. Empty when the widget is driven by the user prompt or model knowledge.',
                },
                brief: {
                  type: 'string',
                  description: 'Self-contained 1-2 sentence instruction for the content-filling pass: what this widget should contain, naming which user-prompt facts or knowledge to use. Empty string when the sourceRefs excerpts alone suffice.',
                },
              },
              required: ['id', 'type', 'title', 'groupId', 'sourceRefs', 'brief'],
              additionalProperties: false,
            },
          },
          relations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                to: { type: 'string' },
                type: { type: 'string', enum: ['parent', 'cousin', 'blocker'] },
              },
              required: ['from', 'to', 'type'],
              additionalProperties: false,
            },
          },
        },
        required: ['groups', 'widgets', 'relations'],
        additionalProperties: false,
      }

      const jsonText = await callOpenAi({
        apiKey,
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        schemaName: 'mindmap_topology',
        schema: topologySchema,
        signal,
        phase: 'topology',
        label: title.trim() || 'Ingested Map',
      })

      const topology = JSON.parse(jsonText)
      
      // Calculate spatial positions & map ids to UUIDs
      const { widgets, groups: laidGroups, relations, idMap } = layoutMindmap(topology, activeCanvasId)

      // Plan hydration (Phase 2) — each widget gets only the [REF-X] chunks
      // it cited, not the whole document again. Content-free widget types
      // (sketchpad) skip hydration entirely.
      const hydrationJobs: Array<{
        widgetId: string
        type: string
        title: string
        brief: string
        excerpts: string
      }> = []
      topology.widgets.forEach((tw: { id: string; sourceRefs?: unknown; brief?: unknown }) => {
        const widgetId = idMap[tw.id]
        const w = widgetId ? widgets[widgetId] : undefined
        if (!widgetId || !w) return
        // Only hydrate types we can fill with a matching schema; every other
        // selectable type keeps its registry default data (see HYDRATABLE_TYPES).
        if (!HYDRATABLE_TYPES.has(w.type)) return
        const refs = Array.isArray(tw.sourceRefs)
          ? tw.sourceRefs.filter((r): r is string => typeof r === 'string')
          : []
        const excerpts = refs
          .map((ref) => (refMap[ref] ? `[${ref}] ${refMap[ref]}` : null))
          .filter(Boolean)
          .join('\n\n')
        const brief = typeof tw.brief === 'string' ? tw.brief.trim() : ''
        // A widget citing nothing valid (hallucinated ref) and carrying no
        // brief falls back to a bounded slice of the document rather than
        // hydrating from thin air.
        hydrationJobs.push({
          widgetId,
          type: w.type,
          title: w.title,
          brief,
          excerpts: excerpts || (brief ? '' : annotated.slice(0, 30000)),
        })
      })

      // Only widgets with a pending job shimmer as hydrating.
      hydrationJobs.forEach((job) => {
        const widget = widgets[job.widgetId]
        if (widget) widget.isHydrating = true
      })

      // Bulk import to canvas
      importMindmap(widgets, laidGroups, relations)
      const importedBounds = boundsForWidgets(Object.values(widgets))
      if (importedBounds) useCanvasStore.getState().fitRect(importedBounds, 140)

      // The skeleton is now a deliberate board mutation. Close the foreground
      // surface without cancelling the bounded background hydration job.
      if (foregroundAbortRef.current === controller) foregroundAbortRef.current = null
      useWidgetStore.getState().setImportOpen(false)
      setLoading(false)
      setLoadingMessage('')
      useToastStore.getState().addToast('Mindmap skeleton generated! Ingesting details in background...')

      void runWithConcurrency(hydrationJobs, HYDRATION_CONCURRENCY, async (job) => {
        await hydrateWidgetContent(
          job.widgetId,
          job.type,
          job.title,
          job.brief,
          job.excerpts,
          pastedText,
          apiKey,
          signal,
        )
      }).then(() => {
        if (!signal.aborted && hydrationJobs.length > 0) {
          useToastStore.getState().addToast('Document details are ready')
        }
      })

    } catch (e: unknown) {
      if (foregroundAbortRef.current === controller) foregroundAbortRef.current = null
      if (e instanceof DOMException && e.name === 'AbortError') return
      console.error(e)
      useToastStore.getState().addToast(
        `Ingestion failed: ${e instanceof Error ? e.message : String(e)}`,
      )
      setLoading(false)
    }
  }

  const hydrateWidgetContent = async (
    widgetId: string,
    type: string,
    title: string,
    brief: string,
    sourceExcerpts: string,
    pastedText: string,
    apiKey: string,
    signal: AbortSignal,
  ) => {
    try {
      throwIfAborted(signal)
      const targetSchema = getHydrationPayloadSchema(type)

      const sections: string[] = [
        `You are a content engine. Fill in the data for a "${type}" widget titled "${title}".`,
      ]
      if (brief) {
        sections.push(`Widget brief (what this widget should contain):\n${brief}`)
      }
      if (sourceExcerpts) {
        sections.push(`Referenced source excerpts (the [REF-X] chunks this widget was mapped from):
${sourceExcerpts.slice(0, 100000) /* Safe bounds for standard extraction text */}`)
      }
      if (pastedText) {
        sections.push(`User prompt (instructions the user gave, or raw data they pasted):
${pastedText.slice(0, 30000)}`)
      }
      sections.push(
        `Produce the content for "${title}": extract from the excerpts and pasted data where given; where the brief calls for it, generate from your own knowledge.
Write the deliverable itself, stated concretely. Never output meta-commentary about the inputs ("the excerpt does not specify…", "no details were provided") and never placeholder items — if a detail is missing, fill it with sensible real content from your knowledge of the subject.
Return ONLY a JSON object that adheres strictly to the response schema for this widget type data.`,
      )

      // Hydration runs several of these concurrently — gpt-5-mini keeps it
      // fast and cheap without ever dropping below the GPT-5 tier.
      const jsonText = await callOpenAi({
        apiKey,
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: sections.join('\n\n') }],
        schemaName: `${type}_hydration`,
        schema: targetSchema,
        signal,
        phase: 'hydration',
        label: title,
      })

      const rawData = JSON.parse(jsonText)
      const formatted = formatHydrationData(type, rawData)
      
      updateWidgetData(widgetId, formatted)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error(`Failed to hydrate details for widget ${title}:`, err)
      useToastStore.getState().addToast(`Failed to load details for "${title}"`)
    } finally {
      setWidgetHydration(widgetId, false)
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Import document"
      className="fixed inset-0 z-[200] flex items-center justify-center"
    >
      <div
        role="presentation"
        className="gp-scrim gp-fade absolute inset-0 bg-black/50"
        onClick={close}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="gp-dialog gp-pop gp-panel relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl shadow-2xl outline-none"
      >
        
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-neutral-950/80 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            <p className="text-xs text-neutral-300 font-medium animate-pulse">{loadingMessage}</p>
          </div>
        )}

        <div className="flex items-start justify-between border-b gp-hairline px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
              <FileUp size={14} className="text-emerald-400" aria-hidden />
              Import document → mind map
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              Grove digests a document in two passes: a fast skeleton map first, then each card's
              content fills in behind it.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close"
            onClick={close}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          
          {/* OpenAI API Key Input */}
          <label className="block">
            <div className="flex justify-between items-center mb-1.5">
              <span className="block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
                OpenAI API Key
              </span>
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-[10px] text-emerald-400 hover:underline"
              >
                {showApiKey ? 'Hide Key' : 'Show Key'}
              </button>
            </div>
            <input
              type={showApiKey ? 'text' : 'password'}
              value={openaiApiKey}
              onChange={(e) => handleApiKeyChange(e.target.value)}
              placeholder={import.meta.env.VITE_OPENAI_API_KEY ? "Using Key from environment config" : "Paste your OpenAI API Key..."}
              className="h-10 w-full rounded-xl border gp-hairline bg-neutral-900/70 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Map title
            </span>
            <input
              value={title}
              placeholder="e.g. Q3 Strategy Review"
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-xl border gp-hairline bg-neutral-900/70 px-3 text-sm text-neutral-100 outline-none transition-colors placeholder:text-neutral-600"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Documents · up to {MAX_FILES}
            </span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOver(false)
                stageFiles(e.dataTransfer.files)
              }}
              className={`flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 transition-all ${
                dragOver
                  ? 'scale-[1.01] border-emerald-400/60 bg-emerald-400/[0.06]'
                  : 'border-neutral-700 bg-neutral-900/40 hover:border-neutral-500'
              }`}
            >
              <FileText size={18} className={dragOver ? 'text-emerald-300' : 'text-neutral-600'} aria-hidden />
              <span className="text-xs text-neutral-400">
                Drop files here or <span className="text-emerald-300">browse</span>
              </span>
              <span className="text-[10px] text-neutral-600">PDF · Markdown · TXT · CSV · JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) stageFiles(e.target.files)
                e.target.value = ''
              }}
            />

            {files.length > 0 && (
              <ul className="mt-2 space-y-1">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="gp-fade flex h-8 items-center gap-2 rounded-lg border gp-hairline bg-neutral-900/50 px-2.5"
                  >
                    <FileText size={11} className="shrink-0 text-neutral-500" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">{file.name}</span>
                    <span className="shrink-0 font-mono text-[9px] text-neutral-600">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      onClick={() => setFiles((c) => c.filter((f) => f.id !== file.id))}
                      className="shrink-0 text-neutral-600 transition-colors hover:text-red-400"
                    >
                      <X size={11} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              Or prompt / paste text
            </span>
            <textarea
              value={extraText}
              rows={4}
              placeholder="Tell Grove what to build, or paste raw text to digest…"
              onChange={(e) => setExtraText(e.target.value)}
              className="w-full resize-none rounded-xl border gp-hairline bg-neutral-900/70 px-3 py-2.5 text-xs leading-relaxed text-neutral-200 outline-none transition-colors placeholder:text-neutral-600"
            />
          </label>

          <button
            type="button"
            role="switch"
            aria-checked={deepReasoning}
            onClick={() => setDeepReasoning(!deepReasoning)}
            className="flex w-full items-center justify-between rounded-xl border gp-hairline bg-neutral-900/40 px-3 py-2.5 transition-colors hover:border-neutral-600"
          >
            <span className="flex items-center gap-2 text-left">
              <BrainCircuit size={14} className={deepReasoning ? 'text-emerald-300' : 'text-neutral-500'} aria-hidden />
              <span>
                <span className="block text-xs font-medium text-neutral-200">Deep reasoning</span>
                <span className="block text-[10px] text-neutral-500">
                  Stronger, slower model for big or messy documents
                </span>
              </span>
            </span>
            <span
              aria-hidden
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                deepReasoning ? 'bg-emerald-500/80' : 'bg-neutral-700'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                  deepReasoning ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`}
              />
            </span>
          </button>
        </div>

        <div className="border-t gp-hairline px-5 py-3.5">
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className={`flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
              loading
                ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed'
                : 'bg-emerald-500 text-neutral-950 hover:bg-emerald-400 active:scale-[0.98]'
            }`}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles size={14} aria-hidden />
            )}
            Import{hasContent ? ` ${files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'text'}` : ''}
          </button>
          <p className="mt-2 text-center text-[10px] text-neutral-600">
            Digests document context into logical grouped widgets and connects related streams.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
