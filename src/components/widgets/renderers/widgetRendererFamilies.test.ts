import { describe, expect, it } from 'vitest'
import { MODULE_TYPES } from '../../../types/moduleTypes'
import { rendererFamilyIdsForType, WIDGET_RENDERER_FAMILIES } from '.'

describe('widget renderer family ownership', () => {
  it('assigns every registered widget type to exactly one renderer family', () => {
    const ownership = MODULE_TYPES.map((type) => ({
      type,
      owners: rendererFamilyIdsForType(WIDGET_RENDERER_FAMILIES, type),
    }))

    expect(ownership.filter(({ owners }) => owners.length === 0)).toEqual([])
    expect(ownership.filter(({ owners }) => owners.length > 1)).toEqual([])
  })

  it('keeps family identifiers unique for useful diagnostics', () => {
    const ids = WIDGET_RENDERER_FAMILIES.map((family) => family.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
