import {
  CORE_WIDGET_MODULE_LOADERS,
} from '../../components/widgets/renderers/lazyCoreWidgets'
import {
  CATALOG_WIDGET_MODULE_LOADERS,
} from '../../components/widgets/renderers/lazyCatalogWidgets'

// ---------------------------------------------------------------------------
// Startup module prefetch. Shortly after launch, quietly warm every lazy
// widget module so a first mount never hits a cold chunk load. One module per
// slice; the modules land in Vite's module cache.
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
