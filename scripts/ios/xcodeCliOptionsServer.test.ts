/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest'
import { answerRpc, IOS_BUILD_CLI_OPTIONS, startOptionsServer } from './xcodeCliOptionsServer.mjs'

const servers: Array<Awaited<ReturnType<typeof startOptionsServer>>> = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('Xcode Tauri settings stand-in', () => {
  it('sends the production settings tauri ios build sends', () => {
    // Without tauri/custom-protocol the app would try to load the Vite dev
    // server instead of the frontend baked into it, and show a blank screen.
    expect(IOS_BUILD_CLI_OPTIONS.features).toEqual(['tauri/custom-protocol'])
    expect(IOS_BUILD_CLI_OPTIONS.args).toEqual(['--lib'])
    expect(IOS_BUILD_CLI_OPTIONS.dev).toBe(false)
  })

  it('answers only the options method and echoes the request id', () => {
    expect(answerRpc('{"jsonrpc":"2.0","id":7,"method":"options"}')).toEqual({ jsonrpc: '2.0', id: 7, result: IOS_BUILD_CLI_OPTIONS })
    expect(answerRpc('{"jsonrpc":"2.0","id":"a","method":"other"}')).toMatchObject({ id: 'a', error: { code: -32601 } })
    expect(answerRpc('not json')).toMatchObject({ id: null, error: { code: -32700 } })
  })

  it('answers the options request over a real WebSocket', async () => {
    const server = await startOptionsServer()
    servers.push(server)

    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`)
    const reply = await new Promise<unknown>((resolve, reject) => {
      socket.onerror = () => reject(new Error('socket error'))
      socket.onopen = () => socket.send(JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'options', params: [] }))
      socket.onmessage = (event) => resolve(JSON.parse(String(event.data)))
    })
    socket.close()

    expect(reply).toEqual({ jsonrpc: '2.0', id: 0, result: IOS_BUILD_CLI_OPTIONS })
  })
})
