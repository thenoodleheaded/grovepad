import { describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY } from '../widgets/registry'
import { interpretThoughtCandidates } from './thoughtInterpreter'
import { ARCHETYPES, resolveArchetypeById, resolveScenario, shortlistArchetypes, validateScenarioCatalogue } from './scenarioResolver'

describe('scenario catalogue', () => {
  it('shortlists archetypes even when no scenario regex fires', () => {
    const shortlist = shortlistArchetypes('Spanish has gotten rusty', 15)
    expect(shortlist.some((entry) => entry.id === 'language-learning')).toBe(true)
  })

  it('materializes a selected archetype entirely from the curated catalogue', () => {
    const result = resolveArchetypeById('language-learning', 'Spanish', {
      sourceText: 'Spanish has gotten rusty',
      routeConfidence: .81,
    })
    expect(result?.archetypeId).toBe('language-learning')
    expect(result?.directions[0]?.plan.nodes.length).toBeGreaterThan(1)
    expect(result?.directions[0]?.plan.nodes.every((node) => node.sourceText === 'Spanish has gotten rusty')).toBe(true)
  })
  it('covers the broad local scenario surface with valid widget plans', () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(120)
    expect(validateScenarioCatalogue()).toEqual([])
  })

  it.each([
    ["I'm learning Spanish", 'language-learning'],
    ['studying for my Spanish exam', 'exam-prep'],
    ['I am preparing for a job interview', 'interview-prep'],
    ['I want to pay off my credit card debt', 'debt-payoff'],
    ['planning a trip to Tokyo', 'plan-trip'],
    ['I need to get my life together', 'life-reset'],
    ['I want to start strength training', 'strength-program'],
    ['we are planning our wedding', 'wedding'],
  ])('maps %s to %s', (source, expected) => {
    expect(resolveScenario(source)?.archetypeId).toBe(expected)
  })

  it.each([
    'create a checklist widget',
    'add a budget table',
    'schedule a meeting tomorrow',
    'write notes: first item',
    'my sister learned Spanish last year',
    'I stopped learning Spanish',
  ])('does not hijack a specific, narrative, or negated request: %s', (source) => {
    expect(resolveScenario(source)).toBeNull()
  })

  it('fills a detected deadline into countdown cards', () => {
    const result = resolveScenario('studying for my exam on July 20')
    const countdown = result?.directions.flatMap((direction) => direction.plan.nodes)
      .find((node) => node.widgetType === 'countdown')
    expect(countdown?.data).toMatchObject({ targetDate: expect.stringMatching(/-07-20$/) })
  })

  it('splits an explicit compound thought into two local clusters', () => {
    const result = resolveScenario("I'm learning Spanish and I need to pay off debt")
    expect(result?.archetypeId).toContain('compound:')
    expect(result?.directions[0]?.plan.nodes.length).toBeGreaterThan(4)
  })

  it('keeps a need or reason attached to the scenario it describes', () => {
    const result = resolveScenario('im lernng spanish for a trip and need a practical study plan')
    expect(result?.archetypeId).toBe('language-learning')
    expect(result?.topic).toBe('Spanish')
    expect(result?.directions[0]?.plan.nodes.map((node) => node.widgetType)).toEqual(
      expect.arrayContaining(['study_goal', 'vocab', 'flashcards', 'habit']),
    )
  })

  it.each([
    ['im lerning spanih', 'language-learning'],
    ['wanna brush up on my frnch', 'language-learning'],
    ['prepairing for a job interveiw', 'interview-prep'],
    ['need an emergncy fund as a saftey net', 'emergency-fund'],
    ['i need to decluter my hous', 'declutter'],
    ['thinking of switching profesions', 'career-change'],
    ['my inbox is a mes', 'email-overload'],
    ['i have to fix my sleap', 'sleep'],
  ])('tolerates typos and natural synonyms in %s', (source, expected) => {
    expect(resolveScenario(source)?.archetypeId).toBe(expected)
  })

  it.each([
    ['creat a cheklist widget', 'checklist'],
    ['make a tasklist', 'checklist'],
    ['add a buget widget', 'budget'],
    ['make a kanben', 'kanban'],
  ])('tolerates direct-widget typos in %s', (source, expected) => {
    expect(interpretThoughtCandidates(source).predictions[0]?.primaryTypes[0]).toBe(expected)
  })

  it.each([
    'purple clouds quietly admire spoons',
    'the historical article mentioned a wedding and a budget',
    'my coworker started investing last year',
  ])('does not invent a scenario from weak fuzzy evidence: %s', (source) => {
    expect(resolveScenario(source)).toBeNull()
  })

  const widgetTypoFixtures = Object.values(WIDGET_REGISTRY).flatMap((definition) => {
    const words = definition.label.toLowerCase().split(/\s+/)
    const longest = words.reduce((best, word) => word.length > best.length ? word : best, '')
    if (longest.length < 5) return []
    const typo = `${longest.slice(0, Math.floor(longest.length / 2))}${longest.slice(Math.floor(longest.length / 2) + 1)}`
    const misspelledLabel = words.map((word) => word === longest ? typo : word).join(' ')
    return [[`create a ${misspelledLabel} widget`, definition.type] as const]
  })

  it.each(widgetTypoFixtures)('corrects a generated registry-label typo in %s', (source, expected) => {
    const candidates = interpretThoughtCandidates(source).predictions.map((prediction) => prediction.primaryTypes[0])
    expect(candidates).toContain(expected)
  })

  it('keeps intrinsically ambiguous typo corrections visible instead of guessing', () => {
    const candidates = interpretThoughtCandidates('create a progess widget').predictions
      .map((prediction) => prediction.primaryTypes[0])
    expect(candidates).toEqual(expect.arrayContaining(['progress', 'process']))
  })
})
