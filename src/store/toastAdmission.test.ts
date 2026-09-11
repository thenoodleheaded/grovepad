import { describe, expect, it } from 'vitest'
import { admitToast, type Toast } from './useToastStore'

const toast = (id: string, leaving = false): Toast => ({
  id,
  message: id,
  tone: 'info',
  ...(leaving ? { leaving: true } : {}),
})

describe('admitToast', () => {
  it('keeps the newcomer and leaves room below the visible limit', () => {
    const { toasts, retiredIds } = admitToast([toast('a')], toast('b'))
    expect(toasts.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(toasts.every((entry) => !entry.leaving)).toBe(true)
    expect(retiredIds).toEqual([])
  })

  it('retires the oldest visible toast rather than dropping it mid-sentence', () => {
    const { toasts, retiredIds } = admitToast([toast('a'), toast('b'), toast('c')], toast('d'))
    expect(toasts.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd'])
    // 'a' animates out instead of vanishing; the rest stay put.
    expect(toasts.find((entry) => entry.id === 'a')?.leaving).toBe(true)
    expect(toasts.find((entry) => entry.id === 'b')?.leaving).toBeUndefined()
    // Reported so the store can guarantee its removal even if no transition runs.
    expect(retiredIds).toEqual(['a'])
  })

  it('does not count already-leaving toasts against the visible limit', () => {
    const { toasts, retiredIds } = admitToast([toast('old', true), toast('a'), toast('b')], toast('c'))
    expect(toasts.find((entry) => entry.id === 'a')?.leaving).toBeUndefined()
    expect(toasts.find((entry) => entry.id === 'old')?.leaving).toBe(true)
    expect(retiredIds).toEqual([])
  })

  it('drops the oldest outright past the runaway ceiling', () => {
    const crowded = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => toast(id, true))
    const { toasts } = admitToast(crowded, toast('new'))
    expect(toasts).toHaveLength(6)
    expect(toasts.map((entry) => entry.id)).not.toContain('a')
    expect(toasts[toasts.length - 1]?.id).toBe('new')
  })
})
