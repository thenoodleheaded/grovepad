import { describe, expect, it } from 'vitest'
import { shouldShowLoginPage, type LoginGateInput } from './authGate'

function gate(overrides: Partial<LoginGateInput> = {}): boolean {
  return shouldShowLoginPage({
    hasSession: false,
    isGuest: false,
    hasRememberedAccount: false,
    networkOnline: true,
    joiningSharedCanvas: false,
    ...overrides,
  })
}

describe('the login gate', () => {
  it('never interrupts a live session', () => {
    expect(gate({ hasSession: true })).toBe(false)
    expect(gate({ hasSession: true, networkOnline: false })).toBe(false)
  })

  it('asks a first-time visitor', () => {
    expect(gate()).toBe(true)
  })

  it('lets a guest straight through', () => {
    expect(gate({ isGuest: true })).toBe(false)
  })

  it('holds the board open for a known account with no connection', () => {
    expect(gate({ hasRememberedAccount: true, networkOnline: false })).toBe(false)
  })

  it('still asks a known account once the network is back', () => {
    // Online, the form can actually succeed, so there is no reason to skip it.
    expect(gate({ hasRememberedAccount: true, networkOnline: true })).toBe(true)
  })

  it('asks an offline stranger, who has nothing to fall back to', () => {
    expect(gate({ hasRememberedAccount: false, networkOnline: false })).toBe(true)
  })

  it('always asks for a shared canvas link, which needs a real account', () => {
    expect(gate({ isGuest: true, joiningSharedCanvas: true })).toBe(true)
    expect(gate({ hasRememberedAccount: true, networkOnline: false, joiningSharedCanvas: true })).toBe(true)
  })
})
