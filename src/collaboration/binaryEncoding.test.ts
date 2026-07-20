import { describe, expect, it } from 'vitest'
import { base64ToBytes, byteaToBytes, bytesToBase64, bytesToBytea } from './binaryEncoding'

describe('collaboration binary encoding', () => {
  it('round-trips bytea and base64 without losing high bytes', () => {
    const source = new Uint8Array([0, 1, 127, 128, 254, 255])
    expect(byteaToBytes(bytesToBytea(source))).toEqual(source)
    expect(base64ToBytes(bytesToBase64(source))).toEqual(source)
  })

  it('rejects malformed bytea', () => {
    expect(() => byteaToBytes('\\x0')).toThrow('Invalid collaboration bytea')
    expect(() => byteaToBytes('\\xzz')).toThrow('Invalid collaboration bytea')
  })
})
