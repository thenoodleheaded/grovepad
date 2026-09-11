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

  it('reads an archive whose central directory carries extra fields', async () => {
    // Info-ZIP, Finder and friends write a timestamp extra field into every
    // central-directory record. Rewrite a Grovepad archive the same way: the
    // reader has to skip it to land on the next record.
    const archive = await createZip([
      { name: 'manifest.json', data: encoder.encode('{"v":2}') },
      { name: 'index.json', data: encoder.encode('{"nodes":[]}') },
    ])
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
    const eocd = archive.length - 22
    const cdOffset = view.getUint32(eocd + 16, true)
    const cdSize = view.getUint32(eocd + 12, true)

    const extra = new Uint8Array([0x55, 0x54, 0x05, 0x00, 0x03, 0x11, 0x22, 0x33, 0x44])
    const rebuilt: Uint8Array[] = []
    let ptr = cdOffset
    while (ptr < cdOffset + cdSize) {
      const nameLen = view.getUint16(ptr + 28, true)
      const record = archive.subarray(ptr, ptr + 46 + nameLen)
      const grown = new Uint8Array(record.length + extra.length)
      grown.set(record, 0)
      grown.set(extra, record.length)
      new DataView(grown.buffer).setUint16(30, extra.length, true)
      rebuilt.push(grown)
      ptr += 46 + nameLen
    }

    const grownSize = rebuilt.reduce((sum, chunk) => sum + chunk.length, 0)
    const out = new Uint8Array(cdOffset + grownSize + 22)
    out.set(archive.subarray(0, cdOffset), 0)
    let pos = cdOffset
    for (const chunk of rebuilt) {
      out.set(chunk, pos)
      pos += chunk.length
    }
    out.set(archive.subarray(eocd), pos)
    new DataView(out.buffer).setUint32(pos + 12, grownSize, true)

    const entries = await readZip(out)
    expect([...entries.keys()]).toEqual(['manifest.json', 'index.json'])
    expect(decoder.decode(entries.get('index.json'))).toBe('{"nodes":[]}')
  })

  it('refuses an entry before inflating it when its declared size is absurd', async () => {
    const archive = await createZip([{ name: 'bomb.json', data: encoder.encode('{"n":1}') }])
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength)
    const eocd = archive.length - 22
    const cdOffset = view.getUint32(eocd + 16, true)
    // Claim ~2 GB uncompressed in the central directory the reader trusts.
    view.setUint32(cdOffset + 24, 2_000_000_000, true)
    await expect(readZip(archive)).rejects.toThrow(/too large to open safely/)
  })

  it('detects a corrupted entry via its CRC-32', async () => {
    const archive = await createZip([{ name: 'a.json', data: encoder.encode('{"n":1}') }])
    // Flip a byte inside the compressed body (just past the 30-byte local header
    // and the 6-byte name) so decompression yields different bytes.
    archive[38] = archive[38]! ^ 0xff
    await expect(readZip(archive)).rejects.toThrow(/checksum/)
  })
})
