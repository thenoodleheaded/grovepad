export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function bytesToBytea(bytes: Uint8Array): string {
  let hex = '\\x'
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export function byteaToBytes(value: string): Uint8Array {
  const hex = value.startsWith('\\x') ? value.slice(2) : value
  if (hex.length % 2 !== 0 || !/^[\da-f]*$/i.test(hex)) throw new Error('Invalid collaboration bytea')
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

