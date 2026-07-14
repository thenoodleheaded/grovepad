import type { ModuleType } from '../../types/spatial'

export interface DirectionSpec {
  id: string
  label: string
  tagline: string
  /** `{topic}` in a title is replaced with the extracted topic. */
  widgets: ReadonlyArray<{ type: ModuleType; title: string }>
}

export interface QuestionSpec {
  prompt: string
  options: ReadonlyArray<{ label: string; directionId: string }>
}

export type ScenarioDomain =
  | 'learning'
  | 'career'
  | 'money'
  | 'home'
  | 'health'
  | 'people'
  | 'travel'
  | 'creative'
  | 'food'
  | 'admin'
  | 'business'
  | 'community'

export interface ArchetypeSpec {
  id: string
  label: string
  /** First capture group, when present, becomes the topic. */
  patterns: readonly RegExp[]
  topicFallback: string
  directions: readonly DirectionSpec[]
  question: QuestionSpec
  domain?: ScenarioDomain
  tone?: 'standard' | 'gentle'
  priority?: number
  keywords?: readonly string[]
  slots?: { deadline?: ModuleType; amount?: ModuleType; people?: ModuleType; links?: ModuleType }
}
