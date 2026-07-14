import { describe, expect, it } from 'vitest'
import { LOCAL_MODEL_PLAN_MAX_NODES } from '../services/local-ai/planProtocol'
import { detectStructuralRequest, planStructuralRequest } from './structuralPlanner'

const CALCULUS_REQUEST =
  'make me a calculus 2 course topic tree, 3 main topics, 5 subtopics each. ' +
  'attach appropriate widgets for me to study, also attach a sketchpad in a group to every subtopic node'

describe('structural planner detection', () => {
  it('parses the calculus acceptance example into a two-level spec with both attachments', () => {
    const spec = detectStructuralRequest(CALCULUS_REQUEST)
    expect(spec).not.toBeNull()
    expect(spec?.topic.toLowerCase()).toContain('calculus 2')
    expect(spec?.levels).toEqual([
      { count: 3, noun: 'Topic' },
      { count: 5, noun: 'Subtopic' },
    ])
    expect(spec?.attachments).toHaveLength(2)
    const [study, sketch] = spec!.attachments
    expect(study).toMatchObject({ rotate: true, grouped: false, levelIndex: 1 })
    expect(sketch).toMatchObject({ type: 'sketchpad', grouped: true, levelIndex: 1 })
  })

  it('parses number words and per-parent markers', () => {
    const spec = detectStructuralRequest('project outline with four phases, three steps each')
    expect(spec?.levels).toEqual([
      { count: 4, noun: 'Phase' },
      { count: 3, noun: 'Step' },
    ])
  })

  it('rejects two absolute counts instead of guessing nesting', () => {
    expect(detectStructuralRequest('a library plan, 3 sections, 5 chapters')).toBeNull()
  })

  it('rejects counts on non-structural nouns and plain thoughts', () => {
    expect(detectStructuralRequest('buy 3 apples and 5 bananas each week')).toBeNull()
    expect(detectStructuralRequest("I'm learning Spanish")).toBeNull()
    expect(detectStructuralRequest('make a checklist for groceries')).toBeNull()
  })

  it('requires tree context for a single-level request', () => {
    expect(detectStructuralRequest('5 topics about biology')).toBeNull()
    expect(detectStructuralRequest('a biology outline with 5 topics')).not.toBeNull()
  })
})

describe('structural planner building', () => {
  it('builds the calculus example fully connected, grouped, and within budget', () => {
    const plan = planStructuralRequest(CALCULUS_REQUEST)
    expect(plan).not.toBeNull()
    expect(plan!.nodes.length).toBeLessThanOrEqual(LOCAL_MODEL_PLAN_MAX_NODES)

    // The literal request expands to 49 nodes (1+3+15+15+15), so the
    // deepest level scales 5 → 4 and says so out loud.
    expect(plan!.warnings.some((warning) => warning.message.includes('Reduced to 4 subtopics'))).toBe(true)

    const root = plan!.nodes[0]!
    const topics = plan!.nodes.filter((node) => /^Topic \d+$/.test(node.title))
    const subtopics = plan!.nodes.filter((node) => /^Subtopic \d+\.\d+$/.test(node.title))
    const sketchpads = plan!.nodes.filter((node) => node.widgetType === 'sketchpad')
    expect(root.title.toLowerCase()).toContain('calculus 2')
    expect(topics).toHaveLength(3)
    expect(subtopics).toHaveLength(12)
    expect(sketchpads).toHaveLength(12)

    // Study widgets rotate through the math set — variety, not clones.
    const studyTypes = new Set(
      plan!.nodes
        .filter((node) => ['formula_sheet', 'flashcards', 'quiz'].includes(node.widgetType))
        .map((node) => node.widgetType),
    )
    expect(studyTypes.size).toBeGreaterThan(1)

    // Hierarchy: every topic hangs off the root, every subtopic off a topic.
    const parentOf = new Map(plan!.relations.filter((relation) => relation.type === 'parent')
      .map((relation) => [relation.toTemporaryId, relation.fromTemporaryId]))
    for (const topic of topics) expect(parentOf.get(topic.temporaryId)).toBe(root.temporaryId)
    for (const subtopic of subtopics) {
      expect(topics.some((topic) => topic.temporaryId === parentOf.get(subtopic.temporaryId))).toBe(true)
    }

    // One group per subtopic, holding the subtopic and its sketchpad.
    expect(plan!.groups).toHaveLength(12)
    for (const group of plan!.groups) {
      expect(group.memberTemporaryIds).toHaveLength(2)
      const [host, attachment] = group.memberTemporaryIds
      expect(subtopics.some((node) => node.temporaryId === host)).toBe(true)
      expect(sketchpads.some((node) => node.temporaryId === attachment)).toBe(true)
    }

    // Everything reachable from the root — no islands.
    const adjacent = new Map<string, string[]>(plan!.nodes.map((node) => [node.temporaryId, []]))
    for (const relation of plan!.relations) {
      adjacent.get(relation.fromTemporaryId)!.push(relation.toTemporaryId)
      adjacent.get(relation.toTemporaryId)!.push(relation.fromTemporaryId)
    }
    const visited = new Set([root.temporaryId])
    const queue = [root.temporaryId]
    while (queue.length) {
      for (const next of adjacent.get(queue.shift()!) ?? []) {
        if (!visited.has(next)) { visited.add(next); queue.push(next) }
      }
    }
    expect(visited.size).toBe(plan!.nodes.length)
  })

  it('keeps small requests unreduced and warning-free', () => {
    const plan = planStructuralRequest('a chemistry course tree, 2 topics, 3 subtopics each')
    expect(plan!.warnings).toEqual([])
    expect(plan!.nodes).toHaveLength(1 + 2 + 6)
    expect(plan!.groups).toEqual([])
  })

  it('scopes "in a group" to its own directive only', () => {
    const plan = planStructuralRequest(
      'a physics course tree, 2 topics, 2 subtopics each. attach a timer to every subtopic, also attach a sketchpad in a group to every subtopic',
    )
    const timers = plan!.nodes.filter((node) => node.widgetType === 'timer')
    const sketchpads = plan!.nodes.filter((node) => node.widgetType === 'sketchpad')
    expect(timers).toHaveLength(4)
    expect(sketchpads).toHaveLength(4)
    // Only the sketchpads are grouped; each group pairs host + sketchpad.
    expect(plan!.groups).toHaveLength(4)
    for (const group of plan!.groups) {
      expect(group.memberTemporaryIds.some((id) => sketchpads.some((node) => node.temporaryId === id))).toBe(true)
      expect(group.memberTemporaryIds.some((id) => timers.some((node) => node.temporaryId === id))).toBe(false)
    }
  })

  it('merges multiple grouped attachments on one host into a single group', () => {
    const plan = planStructuralRequest(
      'a physics course tree, 2 topics, 2 subtopics each. attach a timer in a group to every subtopic, also attach a sketchpad in a group to every subtopic',
    )
    expect(plan!.groups).toHaveLength(4)
    for (const group of plan!.groups) {
      expect(group.memberTemporaryIds).toHaveLength(3)
    }
  })
})
