import { cameraEngine } from '../camera/cameraEngine'
import {
  CORE_WIDGET_MODULE_LOADERS,
} from '../../components/widgets/renderers/lazyCoreWidgets'
import {
  CATALOG_WIDGET_MODULE_LOADERS,
} from '../../components/widgets/renderers/lazyCatalogWidgets'

// ---------------------------------------------------------------------------
// Idle module prefetch (canvas engine contract §5). After the board settles,
// quietly warm every lazy widget module so no scroll or promotion ever hits
// a cold chunk load. One module per idle slice, and only while the camera is
// idle — a gesture instantly pauses the queue. Network+parse happen off the
// interaction path; the modules land in Vite's module cache.
// ---------------------------------------------------------------------------

const FIRST_SLICE_DELAY_MS = 2500
const SLICE_INTERVAL_MS = 150

export function initWidgetModulePrefetch(): () => void {
  const queue = [...CORE_WIDGET_MODULE_LOADERS, ...CATALOG_WIDGET_MODULE_LOADERS]
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const pump = () => {
    timer = null
    if (disposed || queue.length === 0) return
    if (cameraEngine.getVelocity().tier !== 'idle') {
      schedule(SLICE_INTERVAL_MS * 2)
      return
    }
    const load = queue.shift()
    void load?.().catch(() => {
      // A failed chunk fetch (offline, dev restart) is not an error here —
      // the lazy() boundary will retry naturally on first real mount.
    })
    schedule(SLICE_INTERVAL_MS)
  }

  const schedule = (delay: number) => {
    if (disposed || timer !== null) return
    timer = setTimeout(pump, delay)
  }

  schedule(FIRST_SLICE_DELAY_MS)
  return () => {
    disposed = true
    if (timer !== null) clearTimeout(timer)
  }
}
