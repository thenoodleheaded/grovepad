import { describe,expect,it } from 'vitest'
import { detectRuntime } from './modelProfiles'

describe('local AI model routing',()=>{
  it('keeps mobile web on the deterministic engine',()=>expect(detectRuntime({userAgent:'iPhone',hasWebGPU:true,memoryGb:8}).profile.tier).toBe('heuristic'))
  it('uses the lightweight model on constrained WebGPU',()=>expect(detectRuntime({userAgent:'Chrome',hasWebGPU:true,memoryGb:4}).profile.tier).toBe('webgpu-light'))
  it('uses the balanced model on ordinary desktops',()=>expect(detectRuntime({userAgent:'Chrome',hasWebGPU:true,memoryGb:8}).profile.tier).toBe('webgpu-balanced'))
  it('uses the multilingual low-latency model when memory permits',()=>{
    const profile=detectRuntime({userAgent:'Chrome',hasWebGPU:true,memoryGb:16}).profile
    expect(profile.tier).toBe('webgpu-high')
    expect(profile.modelId).toBe('Qwen3.5-0.8B-q4f16_1-MLC')
  })
  it('prefers native shells',()=>expect(detectRuntime({globals:{__TAURI_INTERNALS__:{}},userAgent:'Mac',hasWebGPU:false,memoryGb:8}).platform).toBe('tauri'))
})
