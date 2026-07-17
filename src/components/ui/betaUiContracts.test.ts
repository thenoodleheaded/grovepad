/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const addModal = readFileSync(new URL('./AddWidgetModal.tsx', import.meta.url), 'utf8')
const backup = readFileSync(new URL('./GuestBackupNudge.tsx', import.meta.url), 'utf8')
const empty = readFileSync(new URL('./EmptyCanvasState.tsx', import.meta.url), 'utf8')
const shaper = readFileSync(new URL('./ShaperHUD.tsx', import.meta.url), 'utf8')
const toolbar = readFileSync(new URL('./CanvasToolbar.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')

describe('beta UI interaction contracts', () => {
  it('keeps the favorite hit target alive under the tile hover owner', () => {
    expect(addModal).toContain('group/tile relative')
    expect(addModal).toContain('group-hover/tile:opacity-100')
    expect(addModal).not.toContain("pointer-events-none opacity-0 group-hover/tile:pointer-events-auto")
  })

  it('suspends passive empty/backup overlays while the tree shaper owns input', () => {
    expect(backup).toContain('shaping) return null')
    expect(empty).toContain('shaping) return null')
    expect(shaper).toContain('z-[220]')
  })

  it('exposes Circuit mode as a pressed toggle', () => {
    expect(toolbar).toContain('pressed={circuitMode}')
    expect(toolbar).toContain("circuitMode ? 'Exit Circuit mode (W)' : 'Enter Circuit mode (W)'")
  })

  it('clips the canvas without creating a second native scroll coordinate system', () => {
    expect(viewport).toContain('overflow-clip')
    expect(viewport).not.toContain('select-none overflow-hidden')
  })
})
