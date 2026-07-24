export type ActiveInput = 'mouse' | 'touch' | 'pen' | 'keyboard'
export type InteractionMode = 'navigate' | 'select' | 'connect'
export type ViewportClass = 'phone' | 'tablet' | 'desktop'

export interface InputCapabilitySnapshot {
  width: number
  height: number
  hasCoarsePointer: boolean
  hasFinePointer: boolean
  canHover: boolean
  reducedMotion: boolean
}

export interface AdaptiveInputCapabilities extends InputCapabilitySnapshot {
  viewportClass: ViewportClass
  isLandscape: boolean
}

/**
 * Layout classes describe available room, not a guessed device model. An iPad
 * in a narrow Stage Manager window therefore gets the same honest layout as a
 * similarly sized browser window, and grows back into tablet/desktop chrome
 * without a reload when the window changes.
 */
export function viewportClassForWidth(width: number): ViewportClass {
  if (width < 640) return 'phone'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function deriveAdaptiveInputCapabilities(
  snapshot: InputCapabilitySnapshot,
): AdaptiveInputCapabilities {
  return {
    ...snapshot,
    viewportClass: viewportClassForWidth(snapshot.width),
    isLandscape: snapshot.width > snapshot.height,
  }
}

/** PointerEvent uses an empty pointerType for synthetic/legacy events. Keep
 * the last trustworthy modality instead of spuriously switching presentation. */
export function activeInputFromPointer(
  pointerType: string,
  previous: ActiveInput,
): ActiveInput {
  if (pointerType === 'touch' || pointerType === 'pen' || pointerType === 'mouse') {
    return pointerType
  }
  return previous
}

export function interactionModeAcceptsDirectManipulation(
  mode: InteractionMode,
  _pointerType: string,
): boolean {
  return mode === 'select' || mode === 'connect'
}
