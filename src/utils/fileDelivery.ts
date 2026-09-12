/**
 * One way to hand a finished file to the person who asked for it.
 *
 * Two routes, because the platforms genuinely differ:
 *
 * - **iPhone/iPad app** — the system share sheet. This is not a nicety:
 *   WKWebView ignores an `<a download>` click outright, so before this existed
 *   every export in the app was a button that appeared to work and produced
 *   nothing at all. The sheet is also where a file is supposed to go on iOS —
 *   Files, Mail, AirDrop — rather than into a downloads folder that has no
 *   equivalent there.
 * - **Everywhere else** — the ordinary browser download, which works.
 *
 * Callers must phrase their confirmation from the returned route: telling an
 * iPhone owner something was "downloaded" names a place their device does not
 * have.
 */

import { isNativeIosHost } from './nativeHost'

export type DeliveryRoute = 'shared' | 'downloaded'

export interface DeliverableFile {
  bytes: Uint8Array | string
  /** A plain file name. Never a path — both the command and Swift refuse one. */
  fileName: string
  mimeType: string
}

export type ShareInvoke = (
  command: 'share_file',
  args: { fileName: string; base64: string },
) => Promise<unknown>

let invoker: Promise<ShareInvoke> | null = null

async function nativeInvoke(): Promise<ShareInvoke> {
  const { invoke } = await import('@tauri-apps/api/core')
  return (command, args) => invoke(command, args)
}

/** Test seam. Passing `null` restores the real bridge. */
export function setShareInvoke(next: ShareInvoke | null): void {
  invoker = next ? Promise.resolve(next) : null
}

function toBytes(bytes: Uint8Array | string): Uint8Array {
  return typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
}

/**
 * Base64 in fixed-size chunks. `String.fromCharCode(...bytes)` on a whole board
 * package blows the argument limit and throws, which would turn a large export
 * into a failure that looks like a corrupt board.
 */
export function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK))
  }
  return btoa(binary)
}

function browserDownload(file: DeliverableFile): DeliveryRoute {
  const blob = new Blob([toBytes(file.bytes) as BlobPart], { type: file.mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Freed on a later turn: revoking synchronously can beat the download in
  // some browsers and produce an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/**
 * Deliver the file and report which route carried it.
 *
 * If the share sheet cannot be reached the browser download is still attempted,
 * so a failure on the native path degrades to the web behaviour rather than
 * losing the export outright.
 */
export async function deliverFile(file: DeliverableFile): Promise<DeliveryRoute> {
  if (isNativeIosHost()) {
    try {
      invoker ??= nativeInvoke()
      const invoke = await invoker
      await invoke('share_file', { fileName: file.fileName, base64: toBase64(toBytes(file.bytes)) })
      return 'shared'
    } catch {
      // Fall through: a download that does nothing is still better than
      // swallowing the export, and it keeps one failure path for callers.
    }
  }
  return browserDownload(file)
}
