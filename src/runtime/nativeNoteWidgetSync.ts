import { useNativeWidgetStore } from '../store/useNativeWidgetStore'
import { useToastStore } from '../store/useToastStore'
import { useWidgetStore } from '../store/useWidgetStore'
import {
  deriveNativeNoteWidgetSnapshot,
  serializeNativeNoteWidgetSnapshot,
} from '../utils/nativeNoteWidget'

const SYNC_DEBOUNCE_MS = 240
const RETRY_DELAYS_MS = [500, 1_500, 4_000] as const

interface NativeWidgetSyncResult {
  supported: boolean
  changed: boolean
}

type InvokeNativeWidget = (
  command: 'sync_note_widget',
  args: { payload: string },
) => Promise<NativeWidgetSyncResult>

interface NativeWidgetSyncOptions {
  isNative?: () => boolean
  invoke?: InvokeNativeWidget
  debounceMs?: number
}

export function isNativeWidgetHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

async function invokeNativeWidget(
  command: 'sync_note_widget',
  args: { payload: string },
): Promise<NativeWidgetSyncResult> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<NativeWidgetSyncResult>(command, args)
}

/**
 * Mirror one selected Note into native shared storage. Typing is debounced,
 * identical snapshots are skipped, and only the latest state survives while
 * a platform update is already in flight.
 */
export function initNativeNoteWidgetSync(options: NativeWidgetSyncOptions = {}): () => void {
  if (!(options.isNative ?? isNativeWidgetHost)()) return () => {}

  const invoke = options.invoke ?? invokeNativeWidget
  const debounceMs = options.debounceMs ?? SYNC_DEBOUNCE_MS
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let desiredPayload = ''
  let lastSyncedPayload: string | null = null
  let retryIndex = 0
  let lastReportedError = ''
  let platformSupported: boolean | null = null

  const readPayload = () => serializeNativeNoteWidgetSnapshot(
    deriveNativeNoteWidgetSnapshot(
      useNativeWidgetStore.getState().selectedWidgetId,
      useWidgetStore.getState().widgets,
    ),
  )

  const schedule = (delay = debounceMs) => {
    if (disposed || platformSupported === false) return
    const nextPayload = readPayload()
    if (nextPayload !== desiredPayload) retryIndex = 0
    desiredPayload = nextPayload
    if (desiredPayload === lastSyncedPayload || inFlight) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void flush()
    }, delay)
  }

  const flush = async () => {
    if (disposed || inFlight || desiredPayload === lastSyncedPayload) return
    const payload = desiredPayload
    let failed = false
    let retryDelayAfterFailure: number | null = null
    inFlight = true
    useNativeWidgetStore.getState().setSyncState('syncing')
    try {
      const result = await invoke('sync_note_widget', { payload })
      if (disposed) return
      lastSyncedPayload = payload
      retryIndex = 0
      lastReportedError = ''
      platformSupported = result.supported
      useNativeWidgetStore.getState().setSyncState(result.supported ? 'synced' : 'unsupported')
      if (!result.supported && useNativeWidgetStore.getState().selectedWidgetId !== null) {
        useToastStore.getState().addToast('Home-screen Notes are available on macOS, iPhone, iPad, and Android')
      }
    } catch (error) {
      if (disposed) return
      failed = true
      const message = error instanceof Error ? error.message : String(error)
      useNativeWidgetStore.getState().setSyncState('error', message)
      if (message !== lastReportedError) {
        lastReportedError = message
        useToastStore.getState().addToast('Could not refresh the home-screen Note; Grovepad will retry')
      }
      const retryDelay = RETRY_DELAYS_MS[retryIndex]
      if (retryDelay !== undefined) {
        retryIndex += 1
        retryDelayAfterFailure = retryDelay
      }
    } finally {
      inFlight = false
      if (!disposed && desiredPayload !== lastSyncedPayload && timer === null) {
        if (!failed || retryDelayAfterFailure !== null) schedule(retryDelayAfterFailure ?? 0)
      }
    }
  }

  const unsubscribeWidgets = useWidgetStore.subscribe((state, previous) => {
    const selectedWidgetId = useNativeWidgetStore.getState().selectedWidgetId
    if (!selectedWidgetId) return
    const current = state.widgets[selectedWidgetId]
    const prior = previous.widgets[selectedWidgetId]

    // Position-only changes (for example dragging the selected card) cannot
    // affect the native snapshot, so do not even serialize them.
    if (
      current?.type === prior?.type
      && current?.title === prior?.title
      && current?.data === prior?.data
    ) return

    schedule()
  })
  const unsubscribeSelection = useNativeWidgetStore.subscribe((state, previous) => {
    if (state.selectedWidgetId !== previous.selectedWidgetId) schedule(0)
  })
  schedule(0)

  return () => {
    if (disposed) return
    disposed = true
    if (timer) clearTimeout(timer)
    timer = null
    unsubscribeSelection()
    unsubscribeWidgets()
  }
}
