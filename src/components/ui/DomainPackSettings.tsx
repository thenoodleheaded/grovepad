import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { useWidgetStore } from '../../store/useWidgetStore'
import { useWidgetPickerPrefsStore } from '../../store/useWidgetPickerPrefsStore'
import { isWidgetTypePublic, orderedDefinitions } from '../../widgets/registry'
import { DOMAIN_PACKS, DOMAIN_PACK_LABELS } from '../../types/spatial'
import type { DomainPack } from '../../types/spatial'

/** Pack blurbs shown on the pack rows — what enabling each one unlocks. */
const PACK_BLURBS: Partial<Record<DomainPack, string>> = {
  life: 'Trackers, planners, recipe scale and habit tools',
  education: 'Study goals, GPA, assignments, lecture notes, past papers',
  project_management: 'Timelines, SWOT, risk register, process flows, meeting meters',
  finance_analytics: 'Budgets, converter, timesheets, inventory, estimates',
  data_science: 'Trend charting, experiment loops, metric reporting',
  software_eng: '50+ automation gates, triggers, variables, webhooks, synthesizers',
  creative_writing: 'Script writing templates, dialogue boards, commission pipeline',
  ux_design: 'Color palettes, asset generators, layout tools',
  game_dev: 'Sliders for tuning grip, drift, and feel',
  music_production: 'Synthesizer and audio player — BPM, key, and signal chain',
}

/**
 * Domain packs, as a settings surface rather than a step inside the widget
 * picker. Adding a widget is a hot path taken many times a day; choosing which
 * libraries exist at all is a setup decision taken once — nesting the second
 * inside the first is what made the picker read as a catalogue to be studied.
 *
 * A pack row is a switch. Enabling one adds its widgets to the picker; the
 * chevron opens that pack's own list so a single unwanted widget can be hidden
 * without giving up the rest of the pack.
 */
export function DomainPackSettings() {
  const activePacks = useWidgetStore((state) => state.activePacks)
  const togglePack = useWidgetStore((state) => state.togglePack)
  const hiddenPackWidgetTypes = useWidgetPickerPrefsStore((state) => state.hiddenPackWidgetTypes)
  const toggleHiddenPackWidgetType = useWidgetPickerPrefsStore((state) => state.toggleHiddenPackWidgetType)
  const [expandedPack, setExpandedPack] = useState<DomainPack | null>(null)
  const allDefs = orderedDefinitions().filter((def) => isWidgetTypePublic(def.type))
  // Only show packs that actually ship widgets — toggling an empty pack
  // would be a no-op, so don't advertise it as a choice yet.
  const availablePacks = DOMAIN_PACKS.filter((pack) => allDefs.some((d) => d.pack === pack))

  return (
    <section className="gp-settings-canvas-card rounded-xl p-1.5" aria-label="Domain packs">
      <div className="flex flex-col">
        {availablePacks.map((pack, index) => {
          const isActive = activePacks.includes(pack)
          const packWidgets = allDefs.filter((d) => d.pack === pack)
          const isExpanded = expandedPack === pack
          return (
            <div key={pack} className={`flex flex-col ${index > 0 ? 'border-t gp-hairline' : ''}`}>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={isActive}
                  onClick={() => togglePack(pack)}
                  className="gp-touch-target flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg px-2 py-2 text-left"
                >
                  <span className="min-w-0">
                    <span
                      className={`block text-[11.5px] font-semibold transition-colors ${
                        isActive ? 'text-emerald-300' : 'text-neutral-200'
                      }`}
                    >
                      {DOMAIN_PACK_LABELS[pack]}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-neutral-500">
                      {PACK_BLURBS[pack] ?? packWidgets.map((d) => d.label).join(' · ')}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all ${
                      isActive
                        ? 'border-emerald-400 bg-emerald-400 text-neutral-950'
                        : 'border-neutral-700 text-transparent'
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </span>
                </button>
                {isActive && (
                  <button
                    type="button"
                    aria-label={
                      isExpanded
                        ? `Collapse ${DOMAIN_PACK_LABELS[pack]} widget list`
                        : `Choose which ${DOMAIN_PACK_LABELS[pack]} widgets to show`
                    }
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedPack(isExpanded ? null : pack)}
                    className="gp-touch-target flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                )}
              </div>
              {isActive && isExpanded && (
                <div className="flex flex-col gap-0.5 pb-2 pl-2">
                  {packWidgets.map((def) => {
                    const hidden = hiddenPackWidgetTypes.includes(def.type)
                    return (
                      <button
                        key={def.type}
                        type="button"
                        role="switch"
                        aria-checked={!hidden}
                        onClick={() => toggleHiddenPackWidgetType(def.type)}
                        className="gp-touch-target flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.05]"
                      >
                        <span className={hidden ? 'text-neutral-600 line-through' : 'text-neutral-300'}>
                          {def.label}
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            hidden
                              ? 'border-neutral-700 text-transparent'
                              : 'border-emerald-400 bg-emerald-400 text-neutral-950'
                          }`}
                        >
                          <Check size={9} strokeWidth={3} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
