import { describe, expect, it } from 'vitest'
import type { ContactData } from '../types/spatial'
import { contactSkin } from '../components/widgets/modules/contactSkinModel'
import { currentSkin, dataWearingSkin, skinsFor } from '../utils/widgetSkins'
import { WIDGET_REGISTRY, widgetDefinition } from './registry'

describe('Contact Card skins', () => {
  it('offers all seven faces through the skin field', () => {
    const definition = widgetDefinition('contact')
    expect(definition.skinField).toBe('skin')
    expect(definition.skins?.map((skin) => skin.value)).toEqual([
      'personal',
      'business',
      'emergency',
      'vendor',
      'relationship',
      'household',
      'care_contact',
    ])
  })

  it('keeps every offered skin one the renderer can paint', () => {
    for (const skin of skinsFor({ type: 'contact' }, WIDGET_REGISTRY.contact)) {
      expect(contactSkin(skin.value)).toBe(skin.value)
    }
  })

  it('gives every schema-extension skin a purpose-built editor', () => {
    const definition = widgetDefinition('contact')
    expect(definition.rendererOwnedSkinDetails).toEqual([
      'relationship',
      'household',
      'care_contact',
    ])
    for (const skin of skinsFor({ type: 'contact' }, WIDGET_REGISTRY.contact)) {
      if (skin.implementation !== 'schema-extension') continue
      expect(definition.rendererOwnedSkinDetails).toContain(skin.value)
    }
  })

  it('hands every skin its own icon rather than the shared presentation glyph', () => {
    const skins = widgetDefinition('contact').skins ?? []
    expect(new Set(skins.map((skin) => skin.icon)).size).toBe(skins.length)
  })

  it('starts new cards on the personal card', () => {
    const data = widgetDefinition('contact').defaultData() as ContactData
    expect(data.skin).toBe('personal')
    expect(data.name).toBe('')
  })

  it('keeps the person and every skin\'s settings when the roller moves', () => {
    const data: ContactData = {
      name: 'Ada Lovelace',
      role: 'Analyst',
      email: 'ada@example.com',
      phone: '555 0134',
      organization: 'Analytical Engines',
      preferred: 'email',
      skin: 'business',
      skinStates: {
        relationship: { lastContact: '2026-07-21', cadenceDays: 21 },
        household: { members: [{ id: 'a', name: 'Byron', relation: 'Son' }] },
      },
    }
    const next = dataWearingSkin(
      { type: 'contact', data },
      'care_contact',
      WIDGET_REGISTRY.contact,
    ) as ContactData

    expect(next.skin).toBe('care_contact')
    // The person a circuit reads is the same whichever face is showing.
    expect(next.name).toBe('Ada Lovelace')
    expect(next.email).toBe('ada@example.com')
    expect(next.organization).toBe('Analytical Engines')
    expect(next.preferred).toBe('email')
    expect(next.skinStates?.relationship).toEqual({
      lastContact: '2026-07-21',
      cadenceDays: 21,
    })
    expect(next.skinStates?.household).toEqual({
      members: [{ id: 'a', name: 'Byron', relation: 'Son' }],
    })
  })

  it('reads a stale skin as the personal card instead of showing nothing', () => {
    const data = { name: '', role: '', email: '', phone: '', skin: 'rolodex' } as unknown as ContactData
    expect(currentSkin({ type: 'contact', data }, WIDGET_REGISTRY.contact)?.value).toBe('personal')
  })
})
