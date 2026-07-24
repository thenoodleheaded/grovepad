import { Plus, Settings2, X } from 'lucide-react'
import { useState } from 'react'
import type { ModuleData } from '../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../utils/widgetSkins'
import type { WidgetSkinOption } from '../../widgets/contracts/registry'

interface SkinDetail {
  id: string
  name: string
  value: string
}

interface WidgetSkinDetailsProps {
  data: ModuleData
  skin: WidgetSkinOption
  onUpdate: (data: ModuleData) => void
}

function detailsFrom(state: WidgetSkinState): SkinDetail[] {
  if (!Array.isArray(state.details)) return []
  return state.details.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const detail = item as Partial<SkinDetail>
    if (
      typeof detail.id !== 'string' ||
      typeof detail.name !== 'string' ||
      typeof detail.value !== 'string'
    ) return []
    return [{ id: detail.id, name: detail.name, value: detail.value }]
  })
}

/**
 * Schema-extension skins keep optional, user-named fields in a separate
 * per-skin pocket. It is deliberately flexible: a Shift Rota can add Role and
 * Assignee while a Reading Log can add Pages and Duration, without teaching
 * the widget's canonical circuit fields a new meaning.
 */
export function WidgetSkinDetails({
  data,
  skin,
  onUpdate,
}: WidgetSkinDetailsProps) {
  const [open, setOpen] = useState(false)
  const state = skinStateFor(data, skin.value)
  const details = detailsFrom(state)

  const commit = (nextDetails: SkinDetail[]) => {
    const { details: _previousDetails, ...otherState } = state
    onUpdate(dataWithSkinState(
      data,
      skin.value,
      nextDetails.length > 0
        ? { ...otherState, details: nextDetails }
        : otherState,
    ))
  }

  const addDetail = () => {
    commit([
      ...details,
      { id: crypto.randomUUID(), name: '', value: '' },
    ])
  }

  const patchDetail = (id: string, patch: Partial<SkinDetail>) => {
    commit(details.map((detail) => (
      detail.id === id ? { ...detail, ...patch } : detail
    )))
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Configure ${skin.label} details`}
        aria-expanded={open}
        title={`Configure ${skin.label} details`}
        onClick={() => setOpen((value) => !value)}
        className="gp-skin-details-trigger absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full"
      >
        <Settings2 size={11} aria-hidden />
        {details.length > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full"
            style={{ background: skin.accent }}
          />
        )}
      </button>

      {open && (
        <section
          aria-label={`${skin.label} details`}
          className="gp-skin-details-panel absolute inset-0 z-20 flex flex-col gap-2 overflow-hidden rounded-[inherit] p-3"
        >
          <header className="flex shrink-0 items-start gap-2 pr-7">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{
                color: skin.accent,
                background: `${skin.accent}1c`,
              }}
            >
              <skin.icon size={14} aria-hidden />
            </span>
            <span className="min-w-0">
              <strong className="block truncate text-[11px] text-neutral-100">
                {skin.label}
              </strong>
              <span className="block text-[9px] leading-3 text-neutral-500">
                {skin.description}
              </span>
            </span>
          </header>

          <button
            type="button"
            aria-label="Close skin details"
            onClick={() => setOpen(false)}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-neutral-500"
          >
            <X size={12} aria-hidden />
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {details.length === 0 && (
              <p className="py-3 text-center text-[10px] leading-4 text-neutral-600">
                Add the extra details this skin needs. They stay with this skin
                when you switch views.
              </p>
            )}
            {details.map((detail) => (
              <div key={detail.id} className="group/detail flex items-center gap-1.5 py-1">
                <input
                  value={detail.name}
                  aria-label="Detail name"
                  placeholder="Field"
                  onChange={(event) => patchDetail(detail.id, { name: event.target.value })}
                  className="gp-input--compact w-[38%] min-w-0"
                />
                <input
                  value={detail.value}
                  aria-label={detail.name || 'Detail value'}
                  placeholder="Value"
                  onChange={(event) => patchDetail(detail.id, { value: event.target.value })}
                  className="gp-input--compact min-w-0 flex-1"
                />
                <button
                  type="button"
                  aria-label={`Remove ${detail.name || 'detail'}`}
                  onClick={() => commit(details.filter((item) => item.id !== detail.id))}
                  className="flex h-6 w-6 shrink-0 items-center justify-center text-neutral-600 transition-colors hover:text-red-400"
                >
                  <X size={10} aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addDetail}
            className="flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-lg text-[10px] font-semibold"
          >
            <Plus size={11} aria-hidden />
            Add detail
          </button>
        </section>
      )}
    </>
  )
}
