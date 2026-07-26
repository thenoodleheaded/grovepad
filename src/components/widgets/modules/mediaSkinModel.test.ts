import { describe, expect, it } from 'vitest'
import {
  clampMoodboardPlacement,
  clampPercent,
  externalPlayerName,
  formatPlaybackTime,
  mediaExtension,
  mediaFileName,
  mediaGalleryItems,
  mediaHost,
  mediaKind,
  mediaSkinMode,
  moodboardItems,
  safeLinkUrl,
  safeMediaUrl,
  MEDIA_ITEM_LIMIT,
} from './mediaSkinModel'

describe('media addresses are untrusted input', () => {
  it('refuses every scheme that can execute or read the disk', () => {
    for (const hostile of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      ' javascript:alert(1)',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'data:text/html,<script>alert(1)</script>',
      'data:application/javascript,alert(1)',
    ]) {
      expect(safeMediaUrl(hostile), hostile).toBe('')
      expect(safeLinkUrl(hostile), hostile).toBe('')
    }
  })

  it('accepts the addresses a browser will actually fetch as media', () => {
    expect(safeMediaUrl('https://example.com/a.png')).toBe('https://example.com/a.png')
    expect(safeMediaUrl('  https://example.com/a.png  ')).toBe('https://example.com/a.png')
    expect(safeMediaUrl('data:image/svg+xml;utf8,<svg/>')).toContain('data:image/svg')
    expect(safeMediaUrl('blob:https://example.com/abc')).toContain('blob:')
    expect(safeMediaUrl(undefined)).toBe('')
  })

  it('only ever offers an http(s) address as a link to follow', () => {
    expect(safeLinkUrl('https://example.com/a.pdf')).toBe('https://example.com/a.pdf')
    // A blob or data URL is renderable but is never a navigation.
    expect(safeLinkUrl('blob:https://example.com/abc')).toBe('')
    expect(safeLinkUrl('data:image/png;base64,AA')).toBe('')
  })
})

describe('reading a media address', () => {
  it('names the file, its type, and its host', () => {
    const url = 'https://files.example.com/reports/Quarterly%20Review.pdf?v=3#page=2'
    expect(mediaFileName(url)).toBe('Quarterly Review.pdf')
    expect(mediaExtension(url)).toBe('PDF')
    expect(mediaHost(url)).toBe('files.example.com')
    expect(mediaHost('https://www.example.com/a')).toBe('example.com')
  })

  it('sorts an address into the kind of thing it plays as', () => {
    expect(mediaKind('https://e.com/a.png')).toBe('image')
    expect(mediaKind('https://e.com/a.MP4')).toBe('video')
    expect(mediaKind('https://e.com/a.m4a')).toBe('audio')
    expect(mediaKind('https://e.com/a.pdf')).toBe('document')
    expect(mediaKind('https://e.com/watch')).toBe('unknown')
    expect(mediaKind('data:image/png;base64,AA')).toBe('image')
  })

  it('recognises hosts that only play inside their own embed', () => {
    expect(externalPlayerName('https://www.youtube.com/watch?v=x')).toBe('YouTube')
    expect(externalPlayerName('https://youtu.be/x')).toBe('YouTube')
    expect(externalPlayerName('https://vimeo.com/1')).toBe('Vimeo')
    expect(externalPlayerName('https://example.com/a.mp4')).toBe('')
  })

  it('reads a clock even when the media never reported a duration', () => {
    expect(formatPlaybackTime(0)).toBe('0:00')
    expect(formatPlaybackTime(9)).toBe('0:09')
    expect(formatPlaybackTime(605)).toBe('10:05')
    expect(formatPlaybackTime(3661)).toBe('1:01:01')
    expect(formatPlaybackTime(Number.NaN)).toBe('0:00')
    expect(formatPlaybackTime(-4)).toBe('0:00')
  })
})

describe('per-skin state survives corrupt or hostile board data', () => {
  it('falls back to the plain image skin for an unknown mode', () => {
    expect(mediaSkinMode('gallery')).toBe('gallery')
    expect(mediaSkinMode('not_a_skin')).toBe('image')
    expect(mediaSkinMode(undefined)).toBe('image')
  })

  it('drops malformed gallery entries and bounds the list', () => {
    expect(mediaGalleryItems('nope')).toEqual([])
    expect(mediaGalleryItems([null, 3, { url: 'https://e.com/a.png' }])).toEqual([])
    expect(mediaGalleryItems([{ id: 'a', url: 'https://e.com/a.png', caption: 'x' }]))
      .toEqual([{ id: 'a', url: 'https://e.com/a.png', caption: 'x' }])

    const flood = Array.from({ length: 500 }, (_, index) => ({ id: `i${index}`, url: '', caption: '' }))
    expect(mediaGalleryItems(flood)).toHaveLength(MEDIA_ITEM_LIMIT)
  })

  it('gives every moodboard tile a placement, however broken the record', () => {
    const [tile] = moodboardItems([{ id: 'a', url: '', caption: '', x: 'NaN', y: 99, scale: 0 }])
    expect(tile).toBeDefined()
    expect(tile!.x).toBeGreaterThanOrEqual(0)
    expect(tile!.x).toBeLessThanOrEqual(1)
    expect(tile!.y).toBeLessThanOrEqual(1)
    expect(tile!.scale).toBeGreaterThan(0)
  })

  it('keeps a dragged tile inside the board it belongs to', () => {
    // A tile is placed by its centre, so its own half-width is the bound.
    expect(clampMoodboardPlacement(-5, -5, 0.4)).toEqual({ x: 0.2, y: 0.14 })
    expect(clampMoodboardPlacement(5, 5, 0.4)).toEqual({ x: 0.8, y: 0.86 })
    expect(clampMoodboardPlacement(0.5, 0.5, 0.4)).toEqual({ x: 0.5, y: 0.5 })
  })

  it('clamps a reveal percentage to the track it rides', () => {
    expect(clampPercent(-10)).toBe(0)
    expect(clampPercent(140)).toBe(100)
    expect(clampPercent('46')).toBe(46)
    expect(clampPercent('abc')).toBe(50)
  })
})
