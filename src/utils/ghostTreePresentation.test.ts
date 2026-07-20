import { describe, expect, it } from 'vitest'
import { ghostAccentDash, ghostNodeContourPath, ghostNodeGrid } from './ghostTreePresentation'

describe('ghost tree bundle presentation', () => {
  it('packs incomplete counts into centered near-square rows', () => {
    const three = ghostNodeGrid(3)
    expect(three).toMatchObject({ columns: 2, rows: 2, width: 72, height: 72 })
    expect(three.placements[2]?.x).toBe(22)

    const five = ghostNodeGrid(5)
    expect(five).toMatchObject({ columns: 3, rows: 2, width: 104, height: 72 })
    expect(five.placements[3]?.x).toBe(22)
    expect(five.placements[4]?.x).toBe(54)

    const seven = ghostNodeGrid(7)
    expect(seven).toMatchObject({
      columns: 3,
      rows: 3,
      rowCounts: [2, 3, 2],
      width: 104,
      height: 104,
    })
    expect(seven.placements[0]?.x).toBe(22)
    expect(seven.placements[2]?.x).toBe(6)
    expect(seven.placements[6]?.x).toBe(54)
  })

  it('builds a stepped rounded hull around incomplete icon rows', () => {
    const contour = ghostNodeContourPath(ghostNodeGrid(7))
    expect(contour).toContain('Q')
    expect(contour).toContain('L 87 29')
    expect(contour).toContain('L 17 75')
    expect(contour).not.toContain('NaN')
  })

  it('assigns each accent every nth dash without changing dash length', () => {
    expect(ghostAccentDash(0, 1)).toEqual({ dasharray: '6 8', dashoffset: 0 })
    expect(ghostAccentDash(0, 2)).toEqual({ dasharray: '6 22', dashoffset: 0 })
    expect(ghostAccentDash(1, 2)).toEqual({ dasharray: '6 22', dashoffset: -14 })
    expect(ghostAccentDash(2, 3)).toEqual({ dasharray: '6 36', dashoffset: -28 })
  })
})
