import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BrainCircuit, Check, ChevronLeft, ChevronRight, CornerDownLeft, Sparkles, Telescope, X } from 'lucide-react'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useOverlayLifecycle } from '../../store/useOverlayStore'
import { useToastStore } from '../../store/useToastStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useAiDebugStore } from '../../store/useAiDebugStore'
import { useQuickAddPreviewStore, activePreviewPlan, type QuickAddCandidate } from '../../store/useQuickAddPreviewStore'
import { screenToWorld, type Vector2D } from '../../types/spatial'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { localAiService } from '../../services/localAiService'
import {
  isPresentablePrediction,
  type ThoughtInterpretation,
  type ThoughtPrediction,
} from '../../utils/thoughtInterpreter'
import { buildScaffold } from '../../utils/scaffoldPlanner'
import { recordScenarioChoice, resolveArchetypeById, resolveScenario } from '../../utils/scenarioResolver'

const EXAMPLES = ['plan my week', 'i want to make a game', 'trip to japan?', 'get my life together']

/** Screen y where the blueprint's first row starts — just under the bar. */
const PREVIEW_SCREEN_TOP = 210

type QuickAddAiPhase =
  | 'heuristic'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'thinking'
  | 'error'
  | 'unsupported'

interface QuickAddAiStatus {
  phase: QuickAddAiPhase
  tier: string
  modelId: string | null
  progress: number
  message: string
  enabled: boolean
}

const FALLBACK_AI_STATUS: QuickAddAiStatus = {
  phase: 'heuristic',
  tier: 'local-heuristics',
  modelId: null,
  progress: 0,
  message: 'Private on-device interpreter',
  enabled: false,
}

function currentAiStatus(): QuickAddAiStatus {
  try {
    return localAiService.getStatus() ?? FALLBACK_AI_STATUS
  } catch {
    return FALLBACK_AI_STATUS
  }
}

function statusPresentation(status: QuickAddAiStatus) {
  const progress = Math.round(Math.max(0, Math.min(100, status.progress <= 1 ? status.progress * 100 : status.progress)))
  switch (status.phase) {
    case 'downloading':
      return { label: `${progress}%`, tone: 'text-sky-300', dot: 'bg-sky-400' }
    case 'thinking':
      return { label: 'Thinking', tone: 'text-violet-300', dot: 'bg-violet-400' }
    case 'ready':
      return { label: 'Ready', tone: 'text-emerald-300', dot: 'bg-emerald-400' }
    case 'error':
    case 'unsupported':
      return { label: 'Local', tone: 'text-amber-300/80', dot: 'bg-amber-400/80' }
    default:
      return { label: 'Local', tone: 'text-neutral-400', dot: 'bg-neutral-500' }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/**
 * Quick add (N) — a compact command bar pinned to the top of the screen.
 *
 * The bar interprets every keystroke locally and sketches the resulting
 * workspace as a live blueprint on the canvas below (QuickAddPreviewLayer).
 * What the blueprint shows is exactly what ⏎ creates, at exactly that spot.
 *
 * Understanding ladder, all private and on-device:
 *  1. curated scenarios + widget prediction render instantly per keystroke;
 *  2. low-confidence Notes fallbacks are never shown — instead a heuristic
 *     scaffold (closest life archetype) appears immediately and the tiny
 *     local model gets ≤ 5 s to refine it into a fuller tree;
 *  3. "Think deeper" hands the current tree to the model as a fixed
 *     skeleton for a longer, richer elaboration.
 * Vague thoughts produce several candidate trees — swipe or ⌥←→ flips
 * between them on the canvas.
 */
export function QuickAddSheet() {
  const open = useWidgetStore((state) => state.quickAddOpen)
  const selectedIds = useWidgetStore((state) => state.selectedIds)
  const widgets = useWidgetStore((state) => state.widgets)
  const activeCanvasId = useWidgetStore((state) => state.activeCanvasId)
  const canvasName = useWidgetStore((state) => state.canvases[state.activeCanvasId]?.name)

  const [text, setText] = useState('')
  const [aiStatus, setAiStatus] = useState<QuickAddAiStatus>(currentAiStatus)
  const [startingModel, setStartingModel] = useState(false)
  const [interpretation, setInterpretation] = useState<ThoughtInterpretation | null>(null)
  const [composeResult, setComposeResult] = useState<ThoughtInterpretation | null>(null)
  const [composePending, setComposePending] = useState(false)
  const [deepResult, setDeepResult] = useState<ThoughtPrediction | null>(null)
  const [deepPending, setDeepPending] = useState(false)
  const [answerLabel, setAnswerLabel] = useState<string | null>(null)
  const [anchor, setAnchor] = useState<Vector2D | null>(null)

  const previewIndex = useQuickAddPreviewStore((state) => state.index)
  const previewCandidates = useQuickAddPreviewStore((state) => state.candidates)

  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const predictionAbortRef = useRef<AbortController | null>(null)
  const composeAbortRef = useRef<AbortController | null>(null)
  const deepAbortRef = useRef<AbortController | null>(null)
  const interactionLockedRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)

  const close = useCallback(() => {
    useWidgetStore.getState().setQuickAddOpen(false)
    useQuickAddPreviewStore.getState().clear()
    setText('')
    setInterpretation(null)
    setComposeResult(null)
    setComposePending(false)
    setDeepResult(null)
    setDeepPending(false)
    setAnswerLabel(null)
    setAnchor(null)
    interactionLockedRef.current = false
    selectedIdRef.current = null
    predictionAbortRef.current?.abort()
    composeAbortRef.current?.abort()
    deepAbortRef.current?.abort()
  }, [])

  useOverlayLifecycle(open)
  useFocusTrap(open, panelRef, textareaRef)

  // The sheet is conditionally mounted — an unmount for any reason must
  // never strand a blueprint on the canvas or a model call in flight.
  useEffect(() => () => {
    useQuickAddPreviewStore.getState().clear()
    predictionAbortRef.current?.abort()
    composeAbortRef.current?.abort()
    deepAbortRef.current?.abort()
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    setAiStatus(currentAiStatus())
    const unsubscribe = localAiService.subscribe((status) => {
      setAiStatus(status)
      if (status.phase !== 'downloading') setStartingModel(false)
    })
    return () => unsubscribe()
  }, [])

  const selectedWidgetId = selectedIds.size === 1 ? [...selectedIds][0] : undefined
  const selectedWidget = selectedWidgetId ? widgets[selectedWidgetId] : undefined

  const canvasWidgets = useMemo(
    () => Object.values(widgets).filter((widget) => widget.canvasId === activeCanvasId),
    [widgets, activeCanvasId],
  )

  // World anchor for the blueprint: fixed at first keystroke so the tree
  // grows in place instead of swimming while the user types.
  useEffect(() => {
    if (!open) return
    if (!text.trim()) {
      setAnchor(null)
      useQuickAddPreviewStore.getState().clear()
      return
    }
    setAnchor((existing) => {
      if (existing) return existing
      const { pan, zoom, viewportSize } = useCanvasStore.getState()
      return screenToWorld(
        { x: viewportSize.width / 2, y: PREVIEW_SCREEN_TOP },
        { x: pan.x, y: pan.y, zoom },
      )
    })
  }, [open, text])

  // --- Pass 1 + 2: deterministic per keystroke, fast router after a pause --
  useEffect(() => {
    predictionAbortRef.current?.abort()
    const controller = new AbortController()
    predictionAbortRef.current = controller
    let modelResultApplied = false

    if (!text.trim()) {
      setInterpretation(null)
      return () => controller.abort()
    }

    const sourceText = text
    const context = {
      selectedWidgetTitle: selectedWidget?.title,
      selectedWidgetType: selectedWidget?.type,
    }

    // The deterministic engine is always first and never waits for a model.
    void localAiService.predictThoughtCandidates(sourceText, context, {
      signal: controller.signal,
      allowModel: false,
    }).then((result) => {
      if (!controller.signal.aborted && !modelResultApplied) setInterpretation(result)
    }).catch((error: unknown) => {
      if (!isAbort(error) && import.meta.env.DEV) {
        console.warn('[Quick Add] Local interpretation failed:', error)
      }
    })

    // Router enrichment on settled text. Creation stays available from the
    // deterministic plan throughout model inference.
    const modelTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return
      void localAiService.predictThoughtCandidates(sourceText, context, {
        signal: controller.signal,
        allowModel: true,
        mode: 'fast',
      }).then((result) => {
        if (controller.signal.aborted) return
        modelResultApplied = true
        setInterpretation((current) => {
          if (!current || !interactionLockedRef.current) return result
          // After the user picks anything, late AI may only append options —
          // never reorder the visible plan or switch scenarios.
          const appended = [
            ...current.predictions,
            ...result.predictions.filter((candidate) => !current.predictions.some((existing) => existing.id === candidate.id)),
          ].slice(0, 4)
          const { scenarioRoute: _lateRoute, ...resultWithoutRoute } = result
          return {
            ...resultWithoutRoute,
            predictions: appended,
            recommendedId: current.recommendedId,
            confidenceMargin: current.confidenceMargin,
            shouldAutoCommit: false,
            ...(current.scenarioRoute ? { scenarioRoute: current.scenarioRoute } : {}),
          }
        })
      }).catch((error: unknown) => {
        if (!isAbort(error) && import.meta.env.DEV) {
          console.warn('[Quick Add] Model enrichment failed; keeping local result:', error)
        }
      })
    }, 180)

    return () => {
      window.clearTimeout(modelTimer)
      controller.abort()
    }
  }, [text, selectedWidget?.title, selectedWidget?.type, aiStatus.enabled])

  const downloadModel = useCallback(() => {
    if (startingModel) return
    setStartingModel(true)
    void localAiService.enableModel().catch((error: unknown) => {
      setStartingModel(false)
      useToastStore.getState().addToast('Could not start the local model · Quick Add still works locally')
      if (import.meta.env.DEV) console.warn('[Quick Add] Local model setup failed:', error)
    })
  }, [startingModel])

  const scenario = useMemo(() => {
    if (!interpretation || !interpretation.predictions[0]) return null
    // An explicit, confident widget request always wins over scenario mode.
    if ((interpretation.predictions[0]?.confidence ?? 0) >= 0.92) return null
    const context = {
      ...(canvasName ? { canvasName } : {}),
      ...(selectedWidget ? { selectedWidgetTitle: selectedWidget.title } : {}),
      canvasWidgets,
    }
    const regexScenario = resolveScenario(text, context)
    if (regexScenario) return regexScenario
    const route = interpretation.scenarioRoute
    if (!route) return null
    return resolveArchetypeById(route.archetypeId, route.topic, {
      ...context,
      sourceText: text,
      routeConfidence: route.confidence,
    })
  }, [text, interpretation, canvasName, selectedWidget, canvasWidgets])

  const presentable = useMemo(
    () => (interpretation ? interpretation.predictions.filter(isPresentablePrediction) : []),
    [interpretation],
  )

  // --- Pass 3: the composer -------------------------------------------------
  // Fires when neither a scenario nor a confident prediction covers the
  // thought: the exact case that used to surface a low-confidence Notes card.
  const composeEligible = useMemo(() => {
    if (!text.trim() || !interpretation || scenario) return false
    if (presentable.length === 0) return true
    const words = text.trim().split(/\s+/).length
    return (presentable[0]?.confidence ?? 0) < 0.85 && words >= 6
  }, [text, interpretation, scenario, presentable])

  // Instant half of the handshake: the scaffold renders with zero latency
  // while the model (if any) refines it in the background.
  const scaffold = useMemo(
    () => (composeEligible && !composeResult ? buildScaffold(text, { clauses: interpretation?.meaning.clauses ?? [] }) : null),
    [composeEligible, composeResult, text, interpretation],
  )

  useEffect(() => {
    composeAbortRef.current?.abort()
    setComposeResult(null)
    if (!composeEligible || !aiStatus.enabled) {
      setComposePending(false)
      return
    }
    const controller = new AbortController()
    composeAbortRef.current = controller
    setComposePending(true)
    const sourceText = text
    const context = {
      selectedWidgetTitle: selectedWidget?.title,
      selectedWidgetType: selectedWidget?.type,
    }
    const timer = window.setTimeout(() => {
      void localAiService.predictThoughtCandidates(sourceText, context, {
        signal: controller.signal,
        allowModel: true,
        mode: 'compose',
      }).then((result) => {
        if (controller.signal.aborted) return
        setComposeResult(result)
        setComposePending(false)
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return
        setComposePending(false)
        if (!isAbort(error) && import.meta.env.DEV) {
          console.warn('[Quick Add] Composer failed; scaffold retained:', error)
        }
      })
    }, 420)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
      setComposePending(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composeEligible, text, aiStatus.enabled, selectedWidget?.title, selectedWidget?.type])

  // --- Candidate trees --------------------------------------------------------
  const predictionById = useRef(new Map<string, ThoughtPrediction>())
  const candidates = useMemo<QuickAddCandidate[]>(() => {
    predictionById.current.clear()
    if (!text.trim() || !interpretation) return []
    const list: QuickAddCandidate[] = []
    const push = (candidate: QuickAddCandidate, prediction?: ThoughtPrediction) => {
      if (list.some((existing) => existing.id === candidate.id)) return
      list.push(candidate)
      if (prediction) predictionById.current.set(candidate.id, prediction)
    }

    if (deepResult) {
      push({ id: 'deep', label: deepResult.label, sublabel: 'Deeper local plan', badge: 'ai', plan: deepResult.plan })
    }

    if (scenario) {
      for (const direction of scenario.directions) {
        push({
          id: `dir:${direction.id}`,
          label: direction.label,
          sublabel: direction.tagline,
          ...(direction.id === scenario.recommendedId ? { badge: 'recommended' as const } : {}),
          plan: direction.plan,
        })
      }
      for (const alternative of scenario.alternatives) {
        const resolution = resolveArchetypeById(alternative.archetypeId, undefined, {
          sourceText: text,
          canvasWidgets,
          ...(canvasName ? { canvasName } : {}),
        })
        const hub = resolution?.directions.find((entry) => entry.id === resolution.recommendedId) ?? resolution?.directions[0]
        if (hub) {
          push({ id: `alt:${alternative.archetypeId}`, label: hub.label, sublabel: `If you meant ${alternative.label.toLowerCase()}`, plan: hub.plan })
        }
      }
    } else if (composeEligible) {
      if (composeResult) {
        for (const prediction of composeResult.predictions) {
          if (prediction.id !== 'local-model' && prediction.id !== 'scaffold' && !isPresentablePrediction(prediction)) continue
          push({
            id: `c:${prediction.id}`,
            label: prediction.label,
            sublabel: prediction.explanation,
            ...(prediction.id === 'local-model' ? { badge: 'ai' as const } : prediction.id === 'scaffold' ? { badge: 'starter' as const } : {}),
            plan: prediction.plan,
          }, prediction)
        }
      } else if (scaffold) {
        push({
          id: 'c:scaffold',
          label: scaffold.archetypeId === 'generic' ? 'Starter structure' : `${scaffold.archetypeLabel} starter`,
          sublabel: 'Built instantly from your words',
          badge: 'starter',
          plan: scaffold.plan,
        })
        for (const prediction of presentable.slice(0, 2)) {
          push({ id: `p:${prediction.id}`, label: prediction.label, sublabel: prediction.explanation, plan: prediction.plan }, prediction)
        }
      }
    } else {
      presentable.slice(0, 4).forEach((prediction, index) => {
        push({
          id: `p:${prediction.id}`,
          label: prediction.label,
          sublabel: prediction.explanation,
          ...(index === 0 ? { badge: 'recommended' as const } : {}),
          plan: prediction.plan,
        }, prediction)
      })
    }
    return list.slice(0, 6)
  }, [text, interpretation, scenario, composeEligible, composeResult, scaffold, presentable, deepResult, canvasWidgets, canvasName])

  const phase = deepPending ? 'deepening' as const : composePending ? 'composing' as const : 'live' as const

  // Publish to the canvas blueprint. A locked user selection survives new
  // results by id; unlocked previews always lead with the best candidate.
  useEffect(() => {
    const store = useQuickAddPreviewStore.getState()
    if (candidates.length === 0 || !anchor) {
      store.clear()
      return
    }
    const keepId = interactionLockedRef.current ? selectedIdRef.current : null
    const keepIndex = keepId ? candidates.findIndex((candidate) => candidate.id === keepId) : -1
    store.setPreview({ candidates, index: keepIndex >= 0 ? keepIndex : 0, phase, anchor })
  }, [candidates, phase, anchor])

  const activeCandidate = previewCandidates[previewIndex]

  const cycleCandidates = useCallback((delta: number) => {
    const store = useQuickAddPreviewStore.getState()
    if (store.candidates.length < 2) return
    interactionLockedRef.current = true
    store.cycle(delta)
    selectedIdRef.current = store.candidates[useQuickAddPreviewStore.getState().index]?.id ?? null
  }, [])

  const selectCandidateId = useCallback((id: string) => {
    const store = useQuickAddPreviewStore.getState()
    const index = store.candidates.findIndex((candidate) => candidate.id === id)
    if (index < 0) return
    interactionLockedRef.current = true
    selectedIdRef.current = id
    store.select(index)
  }, [])

  const thinkDeeper = useCallback(() => {
    if (deepPending) return
    const state = useQuickAddPreviewStore.getState()
    const plan = activePreviewPlan(state)
    if (!plan || plan.nodes.length === 0) return
    deepAbortRef.current?.abort()
    const controller = new AbortController()
    deepAbortRef.current = controller
    setDeepPending(true)
    const context = {
      selectedWidgetTitle: selectedWidget?.title,
      selectedWidgetType: selectedWidget?.type,
    }
    void localAiService.predictDeepThoughtCandidates(text, context, controller.signal, plan)
      .then((result) => {
        if (controller.signal.aborted) return
        const top = result.predictions.find((prediction) => prediction.id === 'local-model')
        if (top) {
          setDeepResult(top)
          interactionLockedRef.current = true
          selectedIdRef.current = 'deep'
        } else {
          useToastStore.getState().addToast('The deeper pass found nothing better · keeping the current tree')
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !isAbort(error)) {
          useToastStore.getState().addToast('Deeper thinking unavailable right now')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDeepPending(false)
      })
  }, [deepPending, text, selectedWidget?.title, selectedWidget?.type])

  const createAll = useCallback(() => {
    const state = useQuickAddPreviewStore.getState()
    const candidate = state.candidates[state.index]
    const plan = candidate?.plan
    if (!candidate || !plan || plan.nodes.length === 0 || !state.anchor) return
    const parentId = selectedWidgetId
    useWidgetStore.getState().commitThoughtPlan(plan, { x: state.anchor.x, y: state.anchor.y }, parentId)

    if (candidate.id.startsWith('dir:') && scenario) {
      recordScenarioChoice(scenario.archetypeId, candidate.id.slice(4), text)
    } else if (candidate.id.startsWith('alt:')) {
      recordScenarioChoice(candidate.id.slice(4), 'hub', text)
    } else {
      const prediction = predictionById.current.get(candidate.id)
      if (prediction) localAiService.recordChoice(text, prediction)
    }
    useToastStore.getState().addToast(
      plan.nodes.length === 1 ? 'Created 1 card' : `Created ${plan.nodes.length} cards`,
      { action: { label: 'Undo', run: () => useWidgetStore.getState().undo() } },
    )
    close()
  }, [scenario, text, selectedWidgetId, close])

  if (!open) return null

  const singleLine = !text.includes('\n')
  const canCreate = Boolean(activeCandidate && activeCandidate.plan.nodes.length > 0 && text.trim())
  const aiPresentation = statusPresentation(aiStatus)
  const canDownloadModel = (aiStatus.phase === 'available' || aiStatus.phase === 'error') && !aiStatus.enabled
  const canThinkDeeper = aiStatus.enabled && localAiService.getCapabilities().profile.allowDeepPlanning && Boolean(activeCandidate)
  const warning = activeCandidate?.plan.warnings.find((entry) => entry.code === 'fallback' || entry.code === 'date')

  return createPortal(
    <div className="fixed inset-0 z-[200]" role="presentation">
      {/* Transparent click-catcher — the canvas stays fully visible so the
          blueprint below is the star; clicking anywhere else closes. */}
      <div role="presentation" className="absolute inset-0" onClick={close} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Quick add"
        className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-4"
      >
        <div
          ref={panelRef}
          tabIndex={-1}
          onWheel={(e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 12) {
              cycleCandidates(e.deltaX > 0 ? 1 : -1)
            }
          }}
          className="gp-dialog gp-pop gp-panel pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl outline-none"
        >
          {/* Row 1 — input */}
          <div className="flex items-start gap-2.5 px-4 pt-3">
            <Sparkles size={15} className="mt-[7px] shrink-0 text-emerald-400/80" aria-hidden />
            <textarea
              ref={textareaRef}
              value={text}
              rows={singleLine ? 1 : Math.min(3, text.split('\n').length)}
              placeholder="What's on your mind?"
              onChange={(e) => {
                interactionLockedRef.current = false
                selectedIdRef.current = null
                setText(e.target.value)
                setAnswerLabel(null)
                setDeepResult(null)
              }}
              onKeyDown={(e) => {
                if ((e.altKey || e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault()
                  cycleCandidates(e.key === 'ArrowRight' ? 1 : -1)
                  return
                }
                if (e.key !== 'Enter') return
                if (e.metaKey || e.ctrlKey || (singleLine && !e.shiftKey)) {
                  e.preventDefault()
                  createAll()
                }
              }}
              className="max-h-24 w-full resize-none bg-transparent py-1.5 text-[14px] leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600"
            />
            <div className="mt-1 flex shrink-0 items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.055] bg-white/[0.025] px-2 py-1 text-[9px] font-medium ${aiPresentation.tone}`}
                title={aiStatus.message}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${aiPresentation.dot} ${aiStatus.phase === 'thinking' || aiStatus.phase === 'downloading' ? 'animate-pulse' : ''}`}
                  aria-hidden
                />
                {aiPresentation.label}
              </span>
              {import.meta.env.DEV && (
                <button
                  type="button"
                  aria-label="Open Quick Add AI debug"
                  title="Inspect deterministic and local-model passes (I)"
                  onClick={() => useAiDebugStore.getState().setOpen(true)}
                  className="rounded p-1 text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-300"
                >
                  <BrainCircuit size={12} aria-hidden />
                </button>
              )}
              <button
                type="button"
                aria-label="Close quick add"
                onClick={close}
                className="rounded p-1 text-neutral-600 transition-colors hover:bg-white/[0.05] hover:text-neutral-300"
              >
                <X size={13} aria-hidden />
              </button>
            </div>
          </div>

          {/* Row 2 — context strip */}
          {!text.trim() ? (
            <div className="gp-qa-fade flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-2">
              {EXAMPLES.map((example, index) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setText(example)}
                  className="gp-qa-rise rounded-full border border-white/[0.06] px-2.5 py-1 text-[10.5px] text-neutral-500 transition-colors hover:border-white/10 hover:text-neutral-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {example}
                </button>
              ))}
              {canDownloadModel && (
                <button
                  type="button"
                  onClick={downloadModel}
                  disabled={startingModel}
                  className="ml-auto rounded-full px-2 py-1 text-[9.5px] font-medium text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-neutral-300 disabled:opacity-50"
                >
                  {startingModel ? 'Starting…' : 'Download model'}
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1.5">
                {/* Candidate switcher */}
                <button
                  type="button"
                  aria-label="Previous tree"
                  onClick={() => cycleCandidates(-1)}
                  disabled={previewCandidates.length < 2}
                  className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/[0.05] hover:text-neutral-200 disabled:opacity-25"
                >
                  <ChevronLeft size={14} aria-hidden />
                </button>
                <div className="min-w-0 flex-1 text-center" aria-live="polite">
                  {activeCandidate ? (
                    <div key={activeCandidate.id} className="gp-qa-fade">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="truncate text-[12px] font-medium text-neutral-100">{activeCandidate.label}</span>
                        {activeCandidate.badge === 'recommended' && (
                          <span className="shrink-0 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-300/70">Best fit</span>
                        )}
                        {activeCandidate.badge === 'ai' && (
                          <span className="shrink-0 rounded-full bg-violet-400/12 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-violet-300/80">AI</span>
                        )}
                        {activeCandidate.badge === 'starter' && (
                          <span className="shrink-0 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-300/60">Starter</span>
                        )}
                      </div>
                      {previewCandidates.length > 1 && (
                        <div className="mt-1 flex items-center justify-center gap-1" aria-hidden>
                          {previewCandidates.map((candidate, index) => (
                            <span
                              key={candidate.id}
                              className={`h-1 rounded-full transition-all duration-300 ${index === previewIndex ? 'w-3.5 bg-emerald-400/80' : 'w-1 bg-neutral-700'}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="flex items-center justify-center gap-2 text-[11px] text-neutral-500">
                      <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-neutral-700 border-t-emerald-400" />
                      Reading your thought…
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Next tree"
                  onClick={() => cycleCandidates(1)}
                  disabled={previewCandidates.length < 2}
                  className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-white/[0.05] hover:text-neutral-200 disabled:opacity-25"
                >
                  <ChevronRight size={14} aria-hidden />
                </button>

                <div className="mx-1 h-5 w-px bg-white/[0.06]" aria-hidden />

                {canThinkDeeper && (
                  <button
                    type="button"
                    onClick={thinkDeeper}
                    disabled={deepPending}
                    title="Let the local model expand this tree (slower, richer)"
                    className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] font-medium transition-colors ${
                      deepPending
                        ? 'text-violet-300'
                        : 'text-neutral-400 hover:bg-white/[0.05] hover:text-violet-200'
                    }`}
                  >
                    <Telescope size={12} className={deepPending ? 'gp-bp-spin' : ''} aria-hidden />
                    {deepPending ? 'Thinking…' : 'Think deeper'}
                  </button>
                )}
                <button
                  type="button"
                  disabled={!canCreate}
                  onClick={createAll}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500/90 py-1.5 pl-3 pr-2.5 text-[11.5px] font-semibold text-neutral-950 transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-30"
                >
                  Create{activeCandidate && activeCandidate.plan.nodes.length > 1 ? ` ${activeCandidate.plan.nodes.length}` : ''}
                  <CornerDownLeft size={11} aria-hidden />
                </button>
              </div>

              {/* Row 3 — one compact question (scenario mode only) */}
              {scenario && (
                <div className="gp-qa-fade flex items-center gap-1.5 overflow-x-auto border-t border-white/[0.05] px-4 py-2">
                  <span className="shrink-0 text-[10.5px] text-neutral-500">{scenario.question.prompt}</span>
                  {scenario.question.options.map((option) => {
                    const active = option.label === answerLabel
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setAnswerLabel(option.label)
                          selectCandidateId(`dir:${option.directionId}`)
                        }}
                        className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] transition-all active:scale-95 ${
                          active
                            ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                            : 'border-white/[0.07] text-neutral-400 hover:border-white/15 hover:text-neutral-200'
                        }`}
                      >
                        {active && <Check size={10} aria-hidden />}
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Structural honesty — never silently short the user. */}
              {warning && (
                <div className="border-t border-white/[0.05] px-4 py-1.5 text-[9.5px] leading-relaxed text-amber-300/75">
                  {warning.message}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
