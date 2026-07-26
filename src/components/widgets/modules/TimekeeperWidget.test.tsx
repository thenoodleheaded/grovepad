import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TimekeeperData, TimekeeperMode } from '../../../types/spatial'
import { TimekeeperWidget } from './TimekeeperWidget'

const base: TimekeeperData = {
  mode: 'countdown',
  countdown: { label: 'Tea', durationSeconds: 300, remainingSeconds: 300, endAt: null },
  pomodoro: { label: 'Focus', workMinutes: 25, breakMinutes: 5, phase: 'work', endAt: null, remainingSeconds: 1500, completed: 2 },
  stopwatch: { elapsedMs: 12_340, startedAt: null, laps: [5_000, 12_340] },
  deadline: { label: 'Launch', targetDate: '2026-08-10' },
  worldClock: { zones: ['UTC', 'Asia/Tokyo'] },
}

describe('unified Time widget', () => {
  it.each([
    ['countdown', 'gp-clock-body'],
    ['pomodoro', 'gp-clock-body'],
    ['stopwatch', 'gp-clock-body'],
    ['deadline', 'gp-time-deadline'],
    ['world_clock', 'gp-time-world'],
    ['hourglass', 'gp-time-hourglass'],
    ['intervals', 'gp-time-interval'],
    ['tabata', 'data-preset="tabata"'],
    ['chess_clock', 'gp-time-chess'],
    ['lap_timer', 'gp-time-laps'],
    ['multi_stage_timer', 'gp-time-stages'],
  ] as const)('renders the %s mode with a real purpose-built surface', (mode, marker) => {
    const markup = renderToStaticMarkup(
      <TimekeeperWidget data={{ ...base, mode: mode as TimekeeperMode }} onChange={() => undefined} />,
    )
    expect(markup).toContain(`data-time-mode="${mode}"`)
    expect(markup).toContain(marker)
  })

  it('keeps specialist state isolated by mode', () => {
    const markup = renderToStaticMarkup(
      <TimekeeperWidget
        data={{
          ...base,
          mode: 'intervals',
          skinStates: {
            intervals: {
              workSeconds: 90,
              restSeconds: 30,
              rounds: 7,
              currentRound: 3,
            },
          },
        }}
        onChange={() => undefined}
      />,
    )
    expect(markup).toContain('Round 3 / 7')
    expect(markup).toContain('01:30')
    expect(markup).toContain('aria-label="Rest seconds"')
  })
})
