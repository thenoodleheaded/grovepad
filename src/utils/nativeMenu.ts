/**
 * The app's contextual actions, presented as the system action sheet on iOS.
 *
 * Two reasons this is not just cosmetic. The web menu's rows are about 24px
 * tall — well under the 44px pointer floor the touch contract requires — and it
 * carries desktop affordances (a keyboard hint, hover states, arrow-key
 * navigation) that mean nothing on a phone. iOS already owns the right surface
 * for "here is what you can do to this", and because it is the system's, nobody
 * expects it to wear the app's glass.
 */

import { isNativeIosHost } from './nativeHost'

export interface NativeMenuItem {
  label: string
  danger?: boolean
}

/** Where the press happened, in CSS pixels from the top-left of the viewport. */
export interface NativeMenuAnchor {
  x: number
  y: number
  width: number
  height: number
}

export type MenuInvoke = (
  command: 'present_menu',
  args: { request: { title: string | null; items: NativeMenuItem[]; sourceRect: NativeMenuAnchor } },
) => Promise<{ index: number | null }>

let invoker: Promise<MenuInvoke> | null = null

async function nativeInvoke(): Promise<MenuInvoke> {
  const { invoke } = await import('@tauri-apps/api/core')
  return (command, args) => invoke(command, args)
}

/** Test seam. Passing `null` restores the real bridge. */
export function setMenuInvoke(next: MenuInvoke | null): void {
  invoker = next ? Promise.resolve(next) : null
}

/** True when a contextual menu should be handed to iOS rather than drawn here. */
export function usesNativeMenu(): boolean {
  return isNativeIosHost()
}

/**
 * Present the sheet and resolve with the chosen index.
 *
 * `null` means the person dismissed it, which is an ordinary answer — tapping
 * outside is how iOS says "never mind". A failure to present also resolves
 * `null` rather than throwing: the menu is already closing either way, and no
 * caller has anything useful to do with the difference.
 */
export async function presentNativeMenu(
  title: string,
  items: NativeMenuItem[],
  anchor: NativeMenuAnchor,
): Promise<number | null> {
  if (items.length === 0) return null
  try {
    invoker ??= nativeInvoke()
    const invoke = await invoker
    const choice = await invoke('present_menu', {
      request: { title: title || null, items, sourceRect: anchor },
    })
    const index = choice?.index
    return typeof index === 'number' && index >= 0 && index < items.length ? index : null
  } catch {
    return null
  }
}
