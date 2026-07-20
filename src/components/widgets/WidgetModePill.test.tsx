import { createRef } from 'react'
import { Coffee, Hourglass, Timer } from 'lucide-react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { resolveModeOptions } from '../../utils/widgetModeOptions'
import type { WidgetModeOption } from '../../widgets/contracts/registry'
import { WidgetModePill } from './WidgetModePill'

const TIMEKEEPER_MODES: readonly WidgetModeOption[] = [
  { value: 'countdown', label: 'Countdown', icon: Timer },
  { value: 'pomodoro', label: 'Pomodoro', icon: Coffee },
  { value: 'stopwatch', label: 'Stopwatch', icon: Hourglass },
]

describe('resolveModeOptions', () => {
  it('puts the matching option first and keeps the rest in declared order', () => {
    const resolved = resolveModeOptions(TIMEKEEPER_MODES, 'pomodoro')
    expect(resolved?.current.value).toBe('pomodoro')
    expect(resolved?.others.map((option) => option.value)).toEqual(['countdown', 'stopwatch'])
  })

  it('falls back to the first option for a stale or unknown mode value', () => {
    const resolved = resolveModeOptions(TIMEKEEPER_MODES, 'not-a-real-mode')
    expect(resolved?.current.value).toBe('countdown')
    expect(resolved?.others.map((option) => option.value)).toEqual(['pomodoro', 'stopwatch'])
  })

  it('returns null for a widget type with no modes', () => {
    expect(resolveModeOptions([], 'anything')).toBeNull()
  })
})

describe('WidgetModePill render', () => {
  // The active mode's own icon lives in the title capsule (WidgetCard), not
  // here — the plate only ever lists the *other* modes to switch to.
  const plateRef = createRef<HTMLDivElement | null>()

  it('renders nothing for a widget type with no modes', () => {
    const markup = renderToStaticMarkup(
      <WidgetModePill mode="x" options={[]} onChange={() => {}} hidden={false} open={false} onClose={() => {}} plateRef={plateRef} />,
    )
    expect(markup).toBe('')
  })

  it('renders nothing when the active mode has no siblings to switch to', () => {
    const markup = renderToStaticMarkup(
      <WidgetModePill
        mode="solo"
        options={[{ value: 'solo', label: 'Solo', icon: Timer }]}
        onChange={() => {}}
        hidden={false}
        open={false}
        onClose={() => {}}
        plateRef={plateRef}
      />,
    )
    expect(markup).toBe('')
  })

  it('lists every mode except the active one as a switch target', () => {
    const markup = renderToStaticMarkup(
      <WidgetModePill
        mode="pomodoro"
        options={TIMEKEEPER_MODES}
        onChange={() => {}}
        hidden={false}
        open={false}
        onClose={() => {}}
        plateRef={plateRef}
      />,
    )
    expect(markup).toContain('Switch to Countdown')
    expect(markup).toContain('Switch to Stopwatch')
    expect(markup).not.toContain('Switch to Pomodoro')
  })

  it('clips the plate to zero height when closed and reveals it when open', () => {
    const closed = renderToStaticMarkup(
      <WidgetModePill mode="countdown" options={TIMEKEEPER_MODES} onChange={() => {}} hidden={false} open={false} onClose={() => {}} plateRef={plateRef} />,
    )
    expect(closed).toContain('inset(0px 0px 100% 0px round')
    expect(closed).toContain('opacity-0')

    const open = renderToStaticMarkup(
      <WidgetModePill mode="countdown" options={TIMEKEEPER_MODES} onChange={() => {}} hidden={false} open onClose={() => {}} plateRef={plateRef} />,
    )
    expect(open).toContain('inset(0px round var(--gp-r0))')
    expect(open).toContain('opacity-100')
  })

  it('goes inert when the title capsule is hidden (collapsed/iconified card)', () => {
    const markup = renderToStaticMarkup(
      <WidgetModePill mode="countdown" options={TIMEKEEPER_MODES} onChange={() => {}} hidden open onClose={() => {}} plateRef={plateRef} />,
    )
    expect(markup).toContain('aria-hidden="true"')
  })
})
