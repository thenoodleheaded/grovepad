import { create } from 'zustand'
import {
  activeInputFromPointer,
  deriveAdaptiveInputCapabilities,
  type ActiveInput,
  type AdaptiveInputCapabilities,
  type InputCapabilitySnapshot,
  type InteractionMode,
} from '../utils/adaptiveInput'

const DEFAULT_SNAPSHOT: InputCapabilitySnapshot = {
  width: 1280,
  height: 720,
  hasCoarsePointer: false,
  hasFinePointer: true,
  canHover: true,
  reducedMotion: false,
}

export interface AdaptiveInputState {
  activeInput: ActiveInput
  interactionMode: InteractionMode
  capabilities: AdaptiveInputCapabilities
  notePointerInput: (pointerType: string) => void
  noteKeyboardInput: () => void
  setInteractionMode: (mode: InteractionMode) => void
  updateCapabilities: (snapshot: InputCapabilitySnapshot) => void
}

export const useAdaptiveInputStore = create<AdaptiveInputState>()((set) => ({
  activeInput: 'mouse',
  interactionMode: 'navigate',
  capabilities: deriveAdaptiveInputCapabilities(DEFAULT_SNAPSHOT),

  notePointerInput: (pointerType) =>
    set((state) => {
      const activeInput = activeInputFromPointer(pointerType, state.activeInput)
      return activeInput === state.activeInput ? state : { activeInput }
    }),

  noteKeyboardInput: () =>
    set((state) => (state.activeInput === 'keyboard' ? state : { activeInput: 'keyboard' })),

  setInteractionMode: (interactionMode) =>
    set((state) =>
      state.interactionMode === interactionMode ? state : { interactionMode },
    ),

  updateCapabilities: (snapshot) => {
    const capabilities = deriveAdaptiveInputCapabilities(snapshot)
    set((state) => {
      const previous = state.capabilities
      return previous.width === capabilities.width &&
        previous.height === capabilities.height &&
        previous.hasCoarsePointer === capabilities.hasCoarsePointer &&
        previous.hasFinePointer === capabilities.hasFinePointer &&
        previous.canHover === capabilities.canHover &&
        previous.reducedMotion === capabilities.reducedMotion
        ? state
        : { capabilities }
    })
  },
}))
