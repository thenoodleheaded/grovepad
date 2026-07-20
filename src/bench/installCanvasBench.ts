import { useAuthStore } from '../store/useAuthStore'
import { useCanvasStore } from '../store/useCanvasStore'
import { useWidgetStore } from '../store/useWidgetStore'
import {
  DEFAULT_BENCHMARK_CONFIG,
  generateBenchmarkBoard,
  type BenchmarkBoard,
} from './benchmarkBoard'
import { tourCameraAt, TOUR_DURATION_MS, type TourWorld } from './cameraTour'
import {
  evaluateFrameGates,
  startFrameMeter,
  summarizeFrames,
  type FrameReport,
  type GateResult,
} from './frameMeter'

// ---------------------------------------------------------------------------
// In-page bench harness. Loaded only under `?bench=1` (see main.tsx), where
// persistence is disabled — the generated board must never reach real
// storage. Exposes window.__grovepadBench for the browser pane and the CLI
// runner; both call the same three verbs: prepare(), tour(), run().
// ---------------------------------------------------------------------------

export interface BenchRunReport {
  label: string
  seed: number
  widgetCount: number
  edgeCount: number
  prepareMs: number
  frame: Omit<FrameReport, 'deltasMs'>
  gates: GateResult[]
  userAgent: string
  devicePixelRatio: number
  viewport: { width: number; height: number }
}

declare global {
  interface Window {
    __grovepadBench?: {
      prepare: (seed?: number) => Promise<BenchmarkBoard>
      tour: () => Promise<Omit<BenchRunReport, 'label' | 'prepareMs'>>
      run: (label?: string, seed?: number) => Promise<BenchRunReport>
    }
  }
}

let loadedBoard: BenchmarkBoard | null = null

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve))
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Inject the generated board into the live stores through setState — no
 * history, no settle, no persistence — and navigate the camera into it. */
async function prepare(seed = DEFAULT_BENCHMARK_CONFIG.seed): Promise<BenchmarkBoard> {
  const auth = useAuthStore.getState()
  if (!auth.session && !auth.isGuest) auth.continueAsGuest()

  const state = useWidgetStore.getState()
  const board = generateBenchmarkBoard({
    ...DEFAULT_BENCHMARK_CONFIG,
    seed,
    workspaceId: state.activeWorkspaceId,
    parentCanvasId: state.activeCanvasId,
  })

  useWidgetStore.setState((current) => ({
    widgets: { ...current.widgets, ...board.widgets },
    groups: { ...current.groups, ...board.groups },
    relations: { ...current.relations, ...board.relations },
    connections: { ...current.connections, ...board.connections },
    canvases: { ...current.canvases, [board.canvas.id]: board.canvas },
    widgetStructureVersion: current.widgetStructureVersion + 1,
  }))
  useWidgetStore.getState().navigateToCanvas(board.canvas.id)

  // Let lazy widget modules, fonts, and the first full paint settle before
  // anyone measures — prepare time is reported, never counted as frames.
  await Promise.race([
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve(),
    wait(3000),
  ])
  await wait(2500)
  await nextFrame()
  loadedBoard = board
  return board
}

/** Drive the scripted tour with the frame meter running. */
async function tour(): Promise<Omit<BenchRunReport, 'label' | 'prepareMs'>> {
  const board = loadedBoard
  if (!board) throw new Error('call prepare() before tour()')
  const world: TourWorld = {
    ...board.bounds,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }
  const canvas = useCanvasStore.getState()
  canvas.cancelViewAnimation()

  const start = await nextFrame()
  const meter = startFrameMeter()
  await new Promise<void>((resolve) => {
    const step = (now: number) => {
      const t = now - start
      const { pan, zoom } = tourCameraAt(t, world)
      useCanvasStore.getState().setView(pan, zoom)
      if (t < TOUR_DURATION_MS) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
  const { deltasMs, longTasksMs } = meter.stop()
  const report = summarizeFrames(deltasMs, longTasksMs)
  const { deltasMs: _dropped, ...frame } = report
  return {
    seed: DEFAULT_BENCHMARK_CONFIG.seed,
    widgetCount: Object.keys(board.widgets).length,
    edgeCount:
      Object.keys(board.relations).length + Object.keys(board.connections).length,
    frame,
    gates: evaluateFrameGates(report),
    userAgent: navigator.userAgent,
    devicePixelRatio: window.devicePixelRatio,
    viewport: { width: window.innerWidth, height: window.innerHeight },
  }
}

async function run(label = 'unnamed', seed?: number): Promise<BenchRunReport> {
  const prepareStart = performance.now()
  await prepare(seed)
  const prepareMs = performance.now() - prepareStart
  const result = await tour()
  return { label, prepareMs, ...result }
}

export function installCanvasBench(): void {
  window.__grovepadBench = { prepare, tour, run }
}
