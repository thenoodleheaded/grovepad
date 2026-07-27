import { describe, expect, it } from 'vitest'
import { grovepadPageTitle } from './pageTitle'

describe('grovepadPageTitle', () => {
  it('always starts with the Grovepad prefix and names the current page', () => {
    expect(grovepadPageTitle('login')).toBe('grovepad | login')
    expect(grovepadPageTitle('Project plan')).toBe('grovepad | Project plan')
  })

  it('keeps temporary status after the page name', () => {
    expect(grovepadPageTitle('Project plan', '4:05')).toBe('grovepad | Project plan (4:05)')
  })

  it('uses canvas when a page name is empty', () => {
    expect(grovepadPageTitle('  ')).toBe('grovepad | canvas')
  })
})
