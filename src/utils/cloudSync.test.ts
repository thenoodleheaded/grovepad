import { describe, expect, it } from 'vitest'
import { isMissingCloudDocumentSchema, planCloudDocumentChanges } from './cloudSync'

describe('cloud document sync planning', () => {
  it('uploads only changed canvases and removes rows absent from the index', () => {
    const plan = planCloudDocumentChanges(
      'same-index',
      new Map([
        ['a', 'same-a'],
        ['b', 'new-b'],
        ['c', 'new-c'],
      ]),
      'same-index',
      new Map([
        ['a', 'same-a'],
        ['b', 'old-b'],
        ['deleted', 'old-deleted'],
      ]),
    )

    expect(plan).toEqual({
      changedCanvasIds: ['b', 'c'],
      deletedCanvasIds: ['deleted'],
      hasChanges: true,
    })
  })

  it('does no cloud write when all checksums match', () => {
    expect(planCloudDocumentChanges(
      'index',
      new Map([['a', 'canvas']]),
      'index',
      new Map([['a', 'canvas']]),
    )).toEqual({ changedCanvasIds: [], deletedCanvasIds: [], hasChanges: false })
  })

  it('recognizes the Postgres/PostgREST errors used for migration fallback', () => {
    expect(isMissingCloudDocumentSchema({ code: '42P01' })).toBe(true)
    expect(isMissingCloudDocumentSchema({ code: 'PGRST205' })).toBe(true)
    expect(isMissingCloudDocumentSchema({ code: '42501' })).toBe(false)
  })
})
