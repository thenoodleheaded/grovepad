import type { StoreApi } from 'zustand'
import type { DomainPack } from '../types/spatial'
import type { WidgetStoreState } from './widgetStoreTypes'

export type WidgetStoreSlice = Partial<WidgetStoreState>

export interface WidgetStoreSliceContext {
  set: StoreApi<WidgetStoreState>['setState']
  get: StoreApi<WidgetStoreState>['getState']
  pushHistory: (tag?: string) => void
  /** `tabId` puts a specific tab in front; omitted, the active tab follows along. */
  navigateToCanvas: (canvasId: string, tabId?: string) => void
  markSpawned: (id: string) => void
  initialPacks: DomainPack[]
}
