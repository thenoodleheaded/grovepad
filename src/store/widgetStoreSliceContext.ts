import type { StoreApi } from 'zustand'
import type { DomainPack } from '../types/spatial'
import type { WidgetStoreState } from './widgetStoreTypes'

export type WidgetStoreSlice = Partial<WidgetStoreState>

export interface WidgetStoreSliceContext {
  set: StoreApi<WidgetStoreState>['setState']
  get: StoreApi<WidgetStoreState>['getState']
  pushHistory: (tag?: string) => void
  navigateToCanvas: (canvasId: string) => void
  markSpawned: (id: string) => void
  initialPacks: DomainPack[]
}
