import { describe, expect, it } from 'vitest'
import { WIDGET_REGISTRY, widgetDefinition } from '../../widgets/registry'
import {
  LOCAL_MODEL_PLAN_MAX_NODES,
  buildLocalAiPlanSystemPrompt,
  extractLocalAiPlanJson,
  parseLocalAiPlan,
  validateAndHydrateLocalAiPlan,
} from './planProtocol'

function branchingPlan(nodeCount: number): Record<string, unknown> {
  return {
    v: 1,
    c: 0.93,
    n: Array.from({ length: nodeCount }, (_, index) => ({
      id: `n${index}`,
      t: index % 5 === 0 ? 'notes' : index % 3 === 0 ? 'checklist' : 'progress',
      title: `Branch node ${index}`,
      text: `Task ${index}`,
      c: 0.91,
    })),
    r: Array.from({ length: nodeCount - 1 }, (_, index) => ({
      from: `n${Math.floor(index / 3)}`,
      to: `n${index + 1}`,
      type: 'parent',
    })),
  }
}

describe('local AI plan protocol', () => {
  it('builds its model catalog from every live widget definition', () => {
    const prompt = buildLocalAiPlanSystemPrompt()
    for (const definition of Object.values(WIDGET_REGISTRY)) {
      expect(prompt).toContain(`${definition.type}|${definition.label}|${definition.description}`)
    }
    expect(prompt).toContain('/no_think')
    expect(prompt).toContain(`Use at most ${LOCAL_MODEL_PLAN_MAX_NODES} nodes`)
  })

  it('extracts fenced prose and repairs comments and trailing commas', () => {
    const raw = `Here is the plan:\n\`\`\`json\n{
      "v": 1,
      "c": 0.86,
      // Small models sometimes emit this comment.
      "n": [{"id":"n0","t":"notes",}],
      "r": [],
    }\n\`\`\`\nDone.`
    expect(extractLocalAiPlanJson(raw)).toEqual({
      v: 1,
      c: 0.86,
      n: [{ id: 'n0', t: 'notes' }],
      r: [],
    })
  })

  it('prefers the actual plan over unrelated JSON embedded in prose', () => {
    const raw = 'Ignore example {"ok":true}. Final answer: {"v":1,"c":0.9,"n":[{"id":"n0","t":"notes"}],"r":[]}'
    expect(extractLocalAiPlanJson(raw)).toEqual({
      v: 1,
      c: 0.9,
      n: [{ id: 'n0', t: 'notes' }],
      r: [],
    })
  })

  it('hydrates a connected 40-node branching plan with safe registry defaults', () => {
    const plan = validateAndHydrateLocalAiPlan(branchingPlan(40), 'Launch a complex product')
    expect(plan).not.toBeNull()
    expect(plan?.nodes).toHaveLength(40)
    expect(plan?.relations).toHaveLength(39)
    expect(plan?.nodes[39]?.depth).toBeGreaterThan(1)
    expect(plan?.nodes[0]?.data).toEqual(widgetDefinition('notes').defaultData())
    expect(plan?.nodes[0]?.metadata).toEqual({
      badges: [],
      sourceText: 'Task 0',
      interpretationConfidence: 0.91,
    })
  })

  it('accepts verbose aliases while still hydrating rather than trusting model data', () => {
    const plan = validateAndHydrateLocalAiPlan({
      version: 1,
      confidence: 0.88,
      nodes: [{
        temporaryId: 'root',
        widgetType: 'notes',
        title: 'Safe note',
        sourceText: 'Captured locally',
        data: { text: 'untrusted model value' },
      }],
      relations: [],
    }, 'Make a note')
    expect(plan?.nodes[0]?.data).toEqual(widgetDefinition('notes').defaultData())
    expect(plan?.nodes[0]?.sourceText).toBe('Captured locally')
  })

  it('rejects unknown widget types', () => {
    const plan = branchingPlan(2)
    ;(plan.n as Array<Record<string, unknown>>)[1]!.t = 'imaginary_widget'
    expect(validateAndHydrateLocalAiPlan(plan, 'Request')).toBeNull()
  })

  it('rejects duplicate node ids', () => {
    const plan = branchingPlan(2)
    ;(plan.n as Array<Record<string, unknown>>)[1]!.id = 'n0'
    expect(validateAndHydrateLocalAiPlan(plan, 'Request')).toBeNull()
  })

  it('rejects missing or disconnected relations in multi-node plans', () => {
    const missing = branchingPlan(3)
    delete missing.r
    expect(validateAndHydrateLocalAiPlan(missing, 'Request')).toBeNull()

    const disconnected = branchingPlan(3)
    disconnected.r = [{ from: 'n0', to: 'n1', type: 'parent' }]
    expect(validateAndHydrateLocalAiPlan(disconnected, 'Request')).toBeNull()
  })

  it('rejects invalid relation references, duplicate parents, and parent cycles', () => {
    const dangling = branchingPlan(2)
    dangling.r = [{ from: 'n0', to: 'missing', type: 'parent' }]
    expect(validateAndHydrateLocalAiPlan(dangling, 'Request')).toBeNull()

    const twoParents = branchingPlan(3)
    twoParents.r = [
      { from: 'n0', to: 'n2', type: 'parent' },
      { from: 'n1', to: 'n2', type: 'parent' },
      { from: 'n0', to: 'n1', type: 'cousin' },
    ]
    expect(validateAndHydrateLocalAiPlan(twoParents, 'Request')).toBeNull()

    const cycle = branchingPlan(2)
    cycle.r = [
      { from: 'n0', to: 'n1', type: 'parent' },
      { from: 'n1', to: 'n0', type: 'parent' },
    ]
    expect(validateAndHydrateLocalAiPlan(cycle, 'Request')).toBeNull()
  })

  it('rejects plans above the 48-node safety cap', () => {
    expect(validateAndHydrateLocalAiPlan(branchingPlan(49), 'Request')).toBeNull()
  })

  it('returns null instead of throwing for malformed model output', () => {
    expect(parseLocalAiPlan('not json at all', 'Request')).toBeNull()
    expect(parseLocalAiPlan('{"v":1,"n":"wrong","r":[]}', 'Request')).toBeNull()
  })

  it('documents the g field in the planner prompt', () => {
    expect(buildLocalAiPlanSystemPrompt()).toContain('"g":[{"id":"g0","members":["n0","n1"]')
  })

  it('hydrates valid groups referencing real node ids', () => {
    const plan = branchingPlan(4)
    plan.g = [{ id: 'g0', members: ['n1', 'n2'], label: 'Study pair' }]
    const hydrated = validateAndHydrateLocalAiPlan(plan, 'Request')
    expect(hydrated?.groups).toEqual([
      { temporaryId: 'g0', memberTemporaryIds: ['n1', 'n2'], label: 'Study pair' },
    ])
  })

  it('drops a group referencing a nonexistent node without failing the plan', () => {
    const plan = branchingPlan(4)
    plan.g = [
      { id: 'g0', members: ['n1', 'missing'] },
      { id: 'g1', members: ['n2', 'n3'] },
    ]
    const hydrated = validateAndHydrateLocalAiPlan(plan, 'Request')
    expect(hydrated).not.toBeNull()
    expect(hydrated?.groups).toEqual([
      { temporaryId: 'g1', memberTemporaryIds: ['n2', 'n3'] },
    ])
  })

  it('keeps a widget in at most one group and hydrates plans without g', () => {
    const overlapping = branchingPlan(4)
    overlapping.g = [
      { id: 'g0', members: ['n1', 'n2'] },
      { id: 'g1', members: ['n2', 'n3'] },
    ]
    const hydrated = validateAndHydrateLocalAiPlan(overlapping, 'Request')
    expect(hydrated?.groups).toEqual([
      { temporaryId: 'g0', memberTemporaryIds: ['n1', 'n2'] },
    ])

    const withoutGroups = validateAndHydrateLocalAiPlan(branchingPlan(3), 'Request')
    expect(withoutGroups?.groups).toEqual([])
  })
})
