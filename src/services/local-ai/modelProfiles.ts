export type LocalAiTier = 'native-desktop' | 'native-mobile' | 'webgpu-high' | 'webgpu-balanced' | 'webgpu-light' | 'heuristic'

export interface ModelProfile {
  tier: LocalAiTier
  modelId: string | null
  nativeModel: string | null
  label: string
  maxNodes: number
  maxOutputTokens: number
  minimumMemoryGb: number
  /** Tiny tiers route curated plans only; they never author deep graphs. */
  allowDeepPlanning: boolean
  maxDeepExtras: number
}

export const MODEL_PROFILES: Record<LocalAiTier, ModelProfile> = {
  'native-desktop': { tier:'native-desktop', modelId:null, nativeModel:'Qwen_Qwen3.5-2B-Q4_K_M.gguf', label:'Qwen 3.5 2B', maxNodes:48, maxOutputTokens:8192, minimumMemoryGb:8, allowDeepPlanning:true, maxDeepExtras:8 },
  'native-mobile': { tier:'native-mobile', modelId:null, nativeModel:'Qwen_Qwen3.5-0.8B-Q4_K_M.gguf', label:'Qwen 3.5 0.8B', maxNodes:32, maxOutputTokens:4096, minimumMemoryGb:4, allowDeepPlanning:true, maxDeepExtras:4 },
  'webgpu-high': { tier:'webgpu-high', modelId:'Qwen3.5-0.8B-q4f16_1-MLC', nativeModel:null, label:'Qwen 3.5 0.8B', maxNodes:48, maxOutputTokens:4096, minimumMemoryGb:12, allowDeepPlanning:true, maxDeepExtras:6 },
  'webgpu-balanced': { tier:'webgpu-balanced', modelId:'Qwen3-0.6B-q4f16_1-MLC', nativeModel:null, label:'Qwen 3 0.6B', maxNodes:40, maxOutputTokens:4096, minimumMemoryGb:6, allowDeepPlanning:true, maxDeepExtras:4 },
  'webgpu-light': { tier:'webgpu-light', modelId:'SmolLM2-360M-Instruct-q4f16_1-MLC', nativeModel:null, label:'SmolLM2 360M', maxNodes:24, maxOutputTokens:3072, minimumMemoryGb:4, allowDeepPlanning:false, maxDeepExtras:0 },
  heuristic: { tier:'heuristic', modelId:null, nativeModel:null, label:'Grovepad language engine', maxNodes:48, maxOutputTokens:0, minimumMemoryGb:0, allowDeepPlanning:false, maxDeepExtras:0 },
}

interface RuntimeGlobals {
  __TAURI__?: unknown
  __TAURI_INTERNALS__?: unknown
  Capacitor?: { isNativePlatform?: () => boolean }
}

export interface DetectedRuntime {
  profile: ModelProfile
  isMobile: boolean
  hasWebGPU: boolean
  memoryGb: number
  platform: 'tauri' | 'capacitor' | 'web'
}

export function detectRuntime(env: { globals?: RuntimeGlobals; userAgent?: string; hasWebGPU?: boolean; memoryGb?: number } = {}): DetectedRuntime {
  const globals = env.globals ?? (typeof window === 'undefined' ? {} : window as unknown as RuntimeGlobals)
  const userAgent = env.userAgent ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
  const memoryGb = env.memoryGb ?? (typeof navigator === 'undefined' ? 0 : Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0))
  const hasWebGPU = env.hasWebGPU ?? (typeof navigator !== 'undefined' && 'gpu' in navigator)
  const isTauri = Boolean(globals.__TAURI_INTERNALS__ || globals.__TAURI__)
  let isCapacitor = false
  try { isCapacitor = Boolean(globals.Capacitor?.isNativePlatform?.()) } catch { isCapacitor = false }
  if (isTauri) return { profile:MODEL_PROFILES['native-desktop'],isMobile:false,hasWebGPU,memoryGb,platform:'tauri' }
  if (isCapacitor) return { profile:MODEL_PROFILES['native-mobile'],isMobile:true,hasWebGPU,memoryGb,platform:'capacitor' }
  if (isMobile || !hasWebGPU) return { profile:MODEL_PROFILES.heuristic,isMobile,hasWebGPU,memoryGb,platform:'web' }
  if (memoryGb >= 12) return { profile:MODEL_PROFILES['webgpu-high'],isMobile,hasWebGPU,memoryGb,platform:'web' }
  if (memoryGb >= 6 || memoryGb === 0) return { profile:MODEL_PROFILES['webgpu-balanced'],isMobile,hasWebGPU,memoryGb,platform:'web' }
  return { profile:MODEL_PROFILES['webgpu-light'],isMobile,hasWebGPU,memoryGb,platform:'web' }
}
