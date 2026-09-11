// Stand-in for the settings server that `tauri ios build --open` keeps running,
// so the iOS app builds when it is launched straight from Xcode.
//
// Xcode's "Build Rust Code" step runs `tauri ios xcode-script`, which takes no
// build settings as arguments. It reads a loopback address from
// `$TMPDIR/<identifier>-server-addr`, asks a WebSocket JSON-RPC server there for
// the settings, and panics when no Tauri command is running. This answers that
// one request with exactly what `tauri ios build` sends (tauri-cli 2.11,
// `mobile/ios/build.rs`): the production frontend baked into the app
// (`tauri/custom-protocol`) and a library build (`--lib`).
//
// Run by scripts/ios/xcode-build-rust.sh: `node xcodeCliOptionsServer.mjs <addr-file> [parent-pid]`.
import { createHash } from 'node:crypto'
import { rename, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'

const WEBSOCKET_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** Serialized `CliOptions` as `tauri ios build` writes them. */
export const IOS_BUILD_CLI_OPTIONS = Object.freeze({
  dev: false,
  features: ['tauri/custom-protocol'],
  args: ['--lib'],
  noise_level: 'Polite',
  vars: {},
  config: [],
  target_device: null,
})

/** Answers one JSON-RPC request; only `options` exists. */
export function answerRpc(text, options = IOS_BUILD_CLI_OPTIONS) {
  let request
  try {
    request = JSON.parse(text)
  } catch {
    return { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }
  }
  const id = request?.id ?? null
  if (request?.method === 'options') return { jsonrpc: '2.0', id, result: options }
  return { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }
}

function encodeFrame(opcode, payload) {
  const length = payload.length
  let header
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length])
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  header[0] = 0x80 | opcode
  return Buffer.concat([header, payload])
}

/** Splits every complete client frame off the front of `buffer`. */
function readFrames(buffer) {
  const frames = []
  let offset = 0
  while (buffer.length - offset >= 2) {
    const first = buffer[offset]
    const second = buffer[offset + 1]
    let length = second & 0x7f
    let cursor = offset + 2
    if (length === 126) {
      if (buffer.length < cursor + 2) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (buffer.length < cursor + 8) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }
    const masked = (second & 0x80) !== 0
    const payloadStart = cursor + (masked ? 4 : 0)
    if (buffer.length < payloadStart + length) break
    const payload = Buffer.from(buffer.subarray(payloadStart, payloadStart + length))
    if (masked) {
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= buffer[cursor + (index % 4)]
    }
    frames.push({ fin: (first & 0x80) !== 0, opcode: first & 0x0f, payload })
    offset = payloadStart + length
  }
  return { frames, rest: buffer.subarray(offset) }
}

function serveSocket(socket, head, options) {
  let pending = Buffer.from(head)
  let messageParts = []

  const handle = () => {
    const { frames, rest } = readFrames(pending)
    pending = Buffer.from(rest)
    for (const frame of frames) {
      if (frame.opcode === 0x8) {
        socket.end(encodeFrame(0x8, frame.payload.subarray(0, 2)))
        return
      }
      if (frame.opcode === 0x9) {
        socket.write(encodeFrame(0xa, frame.payload))
        continue
      }
      if (frame.opcode === 0xa) continue
      messageParts.push(frame.payload)
      if (!frame.fin) continue
      const text = Buffer.concat(messageParts).toString('utf8')
      messageParts = []
      socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(answerRpc(text, options)))))
    }
  }

  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk])
    handle()
  })
  socket.on('error', () => socket.destroy())
  if (pending.length > 0) handle()
}

/** Starts the stand-in on a free loopback port. */
export async function startOptionsServer(options = IOS_BUILD_CLI_OPTIONS) {
  const sockets = new Set()
  const server = createServer((_request, response) => {
    response.writeHead(426).end()
  })
  server.on('upgrade', (request, socket, head) => {
    const key = request.headers['sec-websocket-key']
    if (typeof key !== 'string') {
      socket.destroy()
      return
    }
    const accept = createHash('sha1').update(key + WEBSOCKET_GUID).digest('base64')
    socket.write(
      ['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'),
    )
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    serveSocket(socket, head, options)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return {
    port: server.address().port,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
  }
}

async function main([addrFile, parentPid]) {
  if (!addrFile) {
    console.error('usage: node xcodeCliOptionsServer.mjs <addr-file> [parent-pid]')
    process.exit(2)
  }
  const { port } = await startOptionsServer()
  // Written atomically so the build step never reads a half-written address.
  const partial = `${addrFile}.${process.pid}`
  await writeFile(partial, `127.0.0.1:${port}`)
  await rename(partial, addrFile)
  // Leave with the build step that started this, even if it dies before its cleanup runs.
  const parent = Number(parentPid)
  if (parent > 0) {
    setInterval(() => {
      try {
        process.kill(parent, 0)
      } catch {
        process.exit(0)
      }
    }, 1000)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.argv.slice(2))
}
