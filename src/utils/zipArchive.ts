// Dependency-free ZIP reader/writer for the `.grovepad` package format.
//
// Entries are written with DEFLATE (method 8) via the platform
// CompressionStream, falling back to STORE (method 0) when compression would
// not shrink an already-compressed payload such as WebP media. A CRC-32 is
// written and verified for every entry, so a `.grovepad` file is a spec-valid
// ZIP that any archive tool (Finder, Explorer, `unzip`) can open — the format
// is never hostage to this application.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export interface ZipEntry {
  name: string
  data: Uint8Array
}

const LOCAL_SIG = 0x04034b50
const CENTRAL_SIG = 0x02014b50
const EOCD_SIG = 0x06054b50
const UTF8_FLAG = 0x0800

/** Serialize entries into a single spec-compliant ZIP archive. */
export async function createZip(entries: readonly ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const compressed = await deflateRaw(entry.data)
    const stored = compressed.length >= entry.data.length
    const method = stored ? 0 : 8
    const body = stored ? entry.data : compressed

    const local = new Uint8Array(30 + nameBytes.length + body.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, LOCAL_SIG, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, UTF8_FLAG, true)
    lv.setUint16(8, method, true)
    lv.setUint16(10, 0, true)
    lv.setUint16(12, 0, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, entry.data.length, true)
    lv.setUint16(26, nameBytes.length, true)
    lv.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    local.set(body, 30 + nameBytes.length)
    locals.push(local)

    const central = new Uint8Array(46 + nameBytes.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, CENTRAL_SIG, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, UTF8_FLAG, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, 0, true)
    cv.setUint16(14, 0, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, nameBytes.length, true)
    cv.setUint32(42, offset, true)
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length
  }

  const centralSize = centrals.reduce((sum, chunk) => sum + chunk.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, EOCD_SIG, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const out = new Uint8Array(offset + centralSize + eocd.length)
  let pos = 0
  for (const local of locals) {
    out.set(local, pos)
    pos += local.length
  }
  for (const central of centrals) {
    out.set(central, pos)
    pos += central.length
  }
  out.set(eocd, pos)
  return out
}

/** Extract every entry, decompressing and verifying each CRC-32. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (bytes.length < 22) throw new Error('Not a ZIP archive')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  let eocd = -1
  const minScan = Math.max(0, bytes.length - 22 - 0xffff)
  for (let i = bytes.length - 22; i >= minScan; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: missing end-of-central-directory')

  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  const entries = new Map<string, Uint8Array>()

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(ptr, true) !== CENTRAL_SIG) throw new Error('Corrupt ZIP central directory')
    const method = view.getUint16(ptr + 10, true)
    const crc = view.getUint32(ptr + 16, true)
    const compSize = view.getUint32(ptr + 20, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 32, true)
    const commentLen = view.getUint16(ptr + 34, true)
    const localOffset = view.getUint32(ptr + 42, true)
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))

    if (view.getUint32(localOffset, true) !== LOCAL_SIG) throw new Error(`Corrupt ZIP entry: ${name}`)
    const localNameLen = view.getUint16(localOffset + 26, true)
    const localExtraLen = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const body = bytes.subarray(dataStart, dataStart + compSize)
    const data = method === 0 ? body.slice() : await inflateRaw(body)
    if (crc32(data) !== crc) throw new Error(`ZIP entry ${name} failed its checksum`)
    entries.set(name, data)

    ptr += 46 + nameLen + extraLen + commentLen
  }
  return entries
}
