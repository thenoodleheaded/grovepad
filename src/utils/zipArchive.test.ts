import { describe, expect, it } from 'vitest'
import { createZip, readZip } from './zipArchive'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe('zipArchive', () => {
  it('round-trips text and binary entries', async () => {
    const json = encoder.encode(JSON.stringify({ hello: 'world', nested: [1, 2, 3] }))
    const binary = new Uint8Array(512).map((_, i) => (i * 37) % 256)
    const archive = await createZip([
      { name: 'index.json', data: json },
      { name: 'media/abc.webp', data: binary },
    ])

    // Spec-valid ZIP: begins with the local file signature `PK\x03\x04`.
    expect([...archive.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])

    const entries = await readZip(archive)
    expect([...entries.keys()]).toEqual(['index.json', 'media/abc.webp'])
    expect(decoder.decode(entries.get('index.json'))).toBe(decoder.decode(json))
    expect([...entries.get('media/abc.webp')!]).toEqual([...binary])
  })

  it('stores incompressible data without inflating it', async () => {
    // Random bytes never deflate smaller, so the writer falls back to STORE.
    const random = crypto.getRandomValues(new Uint8Array(2048))
    const archive = await createZip([{ name: 'noise.bin', data: random }])
    const entries = await readZip(archive)
    expect([...entries.get('noise.bin')!]).toEqual([...random])
  })

  it('rejects a payload that is not a ZIP archive', async () => {
    await expect(readZip(encoder.encode('definitely not a zip'))).rejects.toThrow()
  })

  it('detects a corrupted entry via its CRC-32', async () => {
    const archive = await createZip([{ name: 'a.json', data: encoder.encode('{"n":1}') }])
    // Flip a byte inside the compressed body (just past the 30-byte local header
    // and the 6-byte name) so decompression yields different bytes.
    archive[38] = archive[38]! ^ 0xff
    await expect(readZip(archive)).rejects.toThrow(/checksum/)
  })
})
