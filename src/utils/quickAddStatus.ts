import type { LocalAiStatus } from '../services/localAiService'

export function quickAddStatusPresentation(status: Pick<LocalAiStatus, 'phase' | 'progress'>) {
  const progress = Math.round(Math.max(0, Math.min(100, status.progress <= 1 ? status.progress * 100 : status.progress)))
  switch (status.phase) {
    case 'downloading': return { label: `${progress}%`, tone: 'text-sky-300', dot: 'bg-sky-400' }
    case 'thinking': return { label: 'Model running', tone: 'text-violet-300', dot: 'bg-violet-400' }
    case 'ready': return { label: 'Model ready', tone: 'text-emerald-300', dot: 'bg-emerald-400' }
    case 'available': return { label: 'Compatible', tone: 'text-sky-300/80', dot: 'bg-sky-400/80' }
    case 'heuristic': return { label: 'Deterministic', tone: 'text-neutral-300', dot: 'bg-neutral-400' }
    case 'error':
    case 'unsupported': return { label: 'Fallback', tone: 'text-amber-300/80', dot: 'bg-amber-400/80' }
    default: return { label: 'Deterministic', tone: 'text-neutral-400', dot: 'bg-neutral-500' }
  }
}
