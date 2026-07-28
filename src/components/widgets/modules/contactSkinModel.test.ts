import { describe, expect, it } from 'vitest'
import {
  birthdayReading,
  cadenceDueLabel,
  cadenceLabel,
  cadenceReading,
  careState,
  contactChannel,
  contactFields,
  contactSkin,
  daysBetween,
  escalationLabel,
  householdState,
  initialsOf,
  isoDateParts,
  mailHref,
  reachRoutes,
  relationshipState,
  siteHref,
  siteLabel,
  smsHref,
  telHref,
} from './contactSkinModel'

/** A fixed Thursday, so every countdown in this file is deterministic. */
const NOW = new Date(2026, 6, 28, 14, 30)

describe('contact skin resolution', () => {
  it('falls back to the personal card for missing or retired skins', () => {
    expect(contactSkin('business')).toBe('business')
    expect(contactSkin('care_contact')).toBe('care_contact')
    expect(contactSkin('rolodex')).toBe('personal')
    expect(contactSkin(undefined)).toBe('personal')
    expect(contactSkin(7)).toBe('personal')
  })

  it('reads a preferred channel only when it is one we can offer', () => {
    expect(contactChannel('text')).toBe('text')
    expect(contactChannel('carrier_pigeon')).toBeNull()
    expect(contactChannel(null)).toBeNull()
  })
})

describe('canonical fields', () => {
  it('opens a card saved before the extra fields existed', () => {
    const fields = contactFields({ name: 'Ada Lovelace', role: 'Analyst', email: '', phone: '' })
    expect(fields.organization).toBe('')
    expect(fields.birthday).toBe('')
    expect(fields.preferred).toBeNull()
  })

  it('refuses non-string junk rather than handing it to an input', () => {
    const fields = contactFields({ name: 42, note: null, website: ['x'] })
    expect(fields.name).toBe('')
    expect(fields.note).toBe('')
    expect(fields.website).toBe('')
  })

  it('takes at most two initials and survives an empty name', () => {
    expect(initialsOf('Ada Lovelace')).toBe('AL')
    expect(initialsOf('  grace  brewster  murray  hopper ')).toBe('GB')
    expect(initialsOf('cher')).toBe('C')
    expect(initialsOf('   ')).toBe('?')
  })
})

describe('reach routes', () => {
  it('dials a number typed with any human punctuation', () => {
    expect(telHref('+44 20 7946 0958')).toBe('tel:+442079460958')
    expect(telHref('(555) 013-4')).toBe('tel:5550134')
    expect(smsHref('555 0134')).toBe('sms:5550134')
  })

  it('offers no call route for a fragment still being typed', () => {
    expect(telHref('55')).toBeNull()
    expect(telHref('')).toBeNull()
    expect(smsHref('  ')).toBeNull()
  })

  it('mails only a plausible address', () => {
    expect(mailHref('ada@example.com')).toBe('mailto:ada@example.com')
    expect(mailHref('ada@example')).toBeNull()
    expect(mailHref('ada @example.com')).toBeNull()
  })

  it('adds https to a bare host and refuses any other scheme', () => {
    expect(siteHref('grovepad.app')).toBe('https://grovepad.app/')
    expect(siteHref('http://grovepad.app/support')).toBe('http://grovepad.app/support')
    // A script URL must never become an href on a card.
    expect(siteHref('javascript:alert(1)')).toBeNull()
    expect(siteHref('mailto:ada@example.com')).toBeNull()
    expect(siteHref('not a url')).toBeNull()
  })

  it('labels a link with its host alone', () => {
    expect(siteLabel('https://www.grovepad.app/pricing')).toBe('grovepad.app')
    expect(siteLabel('')).toBe('')
  })

  it('lists only routes that exist, with the preferred one first', () => {
    const routes = reachRoutes(contactFields({
      name: 'Ada',
      email: 'ada@example.com',
      phone: '555 0134',
      website: 'grovepad.app',
      preferred: 'email',
    }))
    expect(routes.map((route) => route.kind)).toEqual(['email', 'phone', 'text', 'site'])
    expect(routes[0]!.preferred).toBe(true)
  })

  it('drops the phone routes when there is no number', () => {
    const routes = reachRoutes(contactFields({ email: 'ada@example.com' }))
    expect(routes.map((route) => route.kind)).toEqual(['email'])
  })
})

describe('calendar days', () => {
  it('rejects a date that never happened', () => {
    expect(isoDateParts('2026-02-31')).toBeNull()
    expect(isoDateParts('2026-2-3')).toBeNull()
    expect(isoDateParts('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
  })

  it('counts whole calendar days across a month end', () => {
    expect(daysBetween('2026-07-28', '2026-08-04')).toBe(7)
    expect(daysBetween('2026-08-04', '2026-07-28')).toBe(-7)
    expect(daysBetween('nonsense', '2026-07-28')).toBeNull()
  })
})

describe('the birthday countdown', () => {
  it('counts to the next one, not the last', () => {
    const reading = birthdayReading('1990-08-04', NOW)
    expect(reading?.daysUntil).toBe(7)
    expect(reading?.turning).toBe(36)
    expect(reading?.today).toBe(false)
  })

  it('rolls into next year once this year\'s has passed', () => {
    const reading = birthdayReading('1990-07-27', NOW)
    expect(reading?.daysUntil).toBe(364)
    expect(reading?.turning).toBe(37)
  })

  it('knows the day itself', () => {
    const reading = birthdayReading('2000-07-28', NOW)
    expect(reading?.today).toBe(true)
    expect(reading?.daysUntil).toBe(0)
    expect(reading?.turning).toBe(26)
  })

  it('shows the date but claims no age for an impossible year', () => {
    expect(birthdayReading('2030-01-05', NOW)?.turning).toBeNull()
    expect(birthdayReading('1500-01-05', NOW)?.turning).toBeNull()
  })

  it('reads nothing at all from an empty or broken field', () => {
    expect(birthdayReading('', NOW)).toBeNull()
    expect(birthdayReading('sometime in May', NOW)).toBeNull()
  })
})

describe('the relationship cadence', () => {
  it('keeps a cadence that can produce a reading', () => {
    expect(relationshipState({ cadenceDays: 0 }).cadenceDays).toBe(1)
    expect(relationshipState({ cadenceDays: 4000 }).cadenceDays).toBe(365)
    expect(relationshipState({}).cadenceDays).toBe(14)
    expect(relationshipState({ lastContact: 'last Tuesday' }).lastContact).toBeNull()
  })

  it('reads fresh, due, and overdue from the same stored date', () => {
    const state = relationshipState({ lastContact: '2026-07-21', cadenceDays: 14 })
    const fresh = cadenceReading(state, NOW)
    expect(fresh.status).toBe('fresh')
    expect(fresh.daysSince).toBe(7)
    expect(fresh.daysUntil).toBe(7)
    expect(fresh.progress).toBeCloseTo(0.5)

    const due = cadenceReading(relationshipState({ lastContact: '2026-07-14', cadenceDays: 14 }), NOW)
    expect(due.status).toBe('due')
    expect(cadenceDueLabel(due)).toBe('Due today')

    const late = cadenceReading(relationshipState({ lastContact: '2026-07-01', cadenceDays: 14 }), NOW)
    expect(late.status).toBe('overdue')
    expect(cadenceDueLabel(late)).toBe('Overdue by 13 days')
    // Overdue fills the track; it never draws past the end of it.
    expect(late.progress).toBe(1)
  })

  it('treats a date typed in the future as today rather than as negative age', () => {
    const reading = cadenceReading(
      relationshipState({ lastContact: '2026-08-30', cadenceDays: 7 }),
      NOW,
    )
    expect(reading.daysSince).toBe(0)
    expect(cadenceLabel(reading)).toBe('Spoke today')
  })

  it('asks for a first log instead of showing a false streak', () => {
    const reading = cadenceReading(relationshipState({}), NOW)
    expect(reading.status).toBe('unlogged')
    expect(reading.daysSince).toBeNull()
    expect(cadenceLabel(reading)).toBe('Not logged yet')
    expect(cadenceDueLabel(reading)).toBe('Log the first contact')
  })
})

describe('the household roster', () => {
  it('drops entries a list cannot render', () => {
    const state = householdState({
      members: [
        { id: 'a', name: 'Ada', relation: 'Partner' },
        { id: 'a', name: 'Duplicate' },
        { name: 'No id' },
        'not an object',
      ],
    })
    expect(state.members).toEqual([{ id: 'a', name: 'Ada', relation: 'Partner' }])
  })

  it('reads an absent roster as empty', () => {
    expect(householdState(undefined).members).toEqual([])
    expect(householdState({ members: 'nope' }).members).toEqual([])
  })

  it('stops at a household-sized roster', () => {
    const members = Array.from({ length: 40 }, (_, index) => ({
      id: `p${index}`,
      name: `Person ${index}`,
      relation: '',
    }))
    expect(householdState({ members }).members).toHaveLength(24)
  })
})

describe('the care escalation order', () => {
  it('keeps the order inside the call list', () => {
    expect(careState({ escalation: 0 }).escalation).toBe(1)
    expect(careState({ escalation: 99 }).escalation).toBe(9)
    expect(careState({ escalation: 2.4 }).escalation).toBe(2)
    expect(careState({}).escalation).toBe(1)
    expect(careState({ availability: 'Nights' }).availability).toBe('Nights')
  })

  it('names the first three places and numbers the rest', () => {
    expect(escalationLabel(1)).toBe('Call first')
    expect(escalationLabel(2)).toBe('Second call')
    expect(escalationLabel(3)).toBe('Third call')
    expect(escalationLabel(4)).toBe('Call 4th')
  })
})
