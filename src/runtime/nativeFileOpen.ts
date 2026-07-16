import { useBoardImportStore } from '../store/useBoardImportStore'
import { useToastStore } from '../store/useToastStore'
import { parseImportedBoardFile } from '../utils/boardImport'

interface NativeOpenFilePayload {
  name: string
  /** Base64-encoded file bytes, read and sent by the Rust shell. */
  base64: string
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Listen for `.grovepad` files opened via the OS (double-click, "Open with").
 * A no-op outside the Tauri desktop shell — the web app has no equivalent
 * surface, so this returns a no-op disposer when `__TAURI_INTERNALS__` is
 * absent rather than failing to load the optional native API module.
 */
export function initNativeFileOpen(): () => void {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return () => {}
  }

  let disposed = false
  let unlisten: (() => void) | null = null

  const openPayload = async (payload: NativeOpenFilePayload) => {
    try {
      const bytes = decodeBase64(payload.base64)
      const { board, media } = await parseImportedBoardFile(bytes, payload.name)
      useBoardImportStore.getState().requestImport({ board, media, source: 'native-open' })
    } catch {
      useToastStore.getState().addToast(`Could not open ${payload.name}`)
    }
  }

  // Pull: a file passed on the OS launch line (cold start / double-click when
  // not yet running). Asked once on mount so it can never race the listener
  // registration below.
  void import('@tauri-apps/api/core').then(({ invoke }) =>
    invoke<NativeOpenFilePayload | null>('take_pending_open_file'),
  ).then((payload) => {
    if (!disposed && payload) void openPayload(payload)
  })

  // Push: a file opened while the app is already running (macOS "Open With"
  // on the running instance, or a forwarded second launch on Windows/Linux).
  void import('@tauri-apps/api/event').then(({ listen }) =>
    listen<NativeOpenFilePayload>('grovepad://open-file', (event) => {
      if (!disposed) void openPayload(event.payload)
    }),
  ).then((dispose) => {
    if (disposed) dispose()
    else unlisten = dispose
  })

  return () => {
    if (disposed) return
    disposed = true
    unlisten?.()
  }
}
