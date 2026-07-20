import { describe, expect, it } from 'vitest'
import type { BinaryFiles } from '@excalidraw/excalidraw/types'
import { excalidrawBlobKey, newExcalidrawFileIds } from './excalidrawFiles'

function file(id: string): BinaryFiles[string] {
  return { id, mimeType: 'image/png', dataURL: `data:image/png;base64,${id}`, created: 0 } as BinaryFiles[string]
}

describe('newExcalidrawFileIds', () => {
  it('returns file ids missing from the known ref list', () => {
    const files: BinaryFiles = { a: file('a'), b: file('b') }
    const ids = newExcalidrawFileIds(files, [{ id: 'a', mimeType: 'image/png', createdAt: 0 }])
    expect(ids).toEqual(['b'])
  })

  it('returns nothing once every file is already known', () => {
    const files: BinaryFiles = { a: file('a') }
    const ids = newExcalidrawFileIds(files, [{ id: 'a', mimeType: 'image/png', createdAt: 0 }])
    expect(ids).toEqual([])
  })

  it('returns every id when nothing is known yet', () => {
    const files: BinaryFiles = { a: file('a'), b: file('b') }
    expect(newExcalidrawFileIds(files, [])).toEqual(['a', 'b'])
  })
})

describe('excalidrawBlobKey', () => {
  it('namespaces the blob key by widget so two widgets never collide on the same file id', () => {
    expect(excalidrawBlobKey('widget-1', 'file-1')).toBe('excalidraw:widget-1:file-1')
    expect(excalidrawBlobKey('widget-1', 'file-1')).not.toBe(excalidrawBlobKey('widget-2', 'file-1'))
  })
})
