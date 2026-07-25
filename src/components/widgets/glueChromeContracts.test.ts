/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const viewport = readFileSync(new URL('../canvas/CanvasViewport.tsx', import.meta.url), 'utf8')
const controls = readFileSync(new URL('../../styles/product/04-controls.css', import.meta.url), 'utf8')
const tokens = readFileSync(new URL('../../styles/product/01-tokens-base.css', import.meta.url), 'utf8')
const card = readFileSync(new URL('./WidgetCard.tsx', import.meta.url), 'utf8')
const geometrySrc = readFileSync(new URL('../../utils/glueGeometry.ts', import.meta.url), 'utf8')
const aura = readFileSync(new URL('../canvas/CanvasAuraLayer.tsx', import.meta.url), 'utf8')
const auraTuning = readFileSync(new URL('../canvas/auraTuning.ts', import.meta.url), 'utf8')

describe('glue joins widgets without any painted surface', () => {
  it('ships no backplate, plate, or grouping surface anywhere', () => {
    for (const source of [viewport, controls, card]) {
      expect(source).not.toContain('gp-group-backplate')
      expect(source).not.toContain('GroupPlate')
      expect(source).not.toContain('gp-grouped-widget')
    }
  })

  it('ships no gradient weld seam at all — layer, geometry, CSS or tokens', () => {
    // The gradient seams are repealed outright: widgets joined by glue are now
    // read as one through their pooled aura, not a painted bridge.
    for (const source of [viewport, controls, tokens, card, geometrySrc]) {
      expect(source).not.toContain('gp-glue-seam')
      expect(source).not.toContain('GlueSeamLayer')
      expect(source).not.toContain('glueSeamsForCluster')
      expect(source).not.toContain('glueSeamBetween')
      expect(source).not.toContain('gp-weld')
    }
  })

  it('keeps the carved gap itself — the seam was paint, not geometry', () => {
    // Members still give up half the gap each, so the cluster's outer corners
    // hold the grid; only the thing drawn INTO that gap is gone.
    expect(geometrySrc).toContain('export function glueMemberInsets')
    expect(geometrySrc).toContain('export const GLUE_GAP')
    expect(card).toContain('glueMemberInsets')
  })

  it('still previews the bond a drop would commit', () => {
    // Losing the painted seam must not lose the affordance: the weld target
    // still lights up, and the card being pulled free still says so.
    expect(controls).toContain('.gp-widget-layout-motion[data-glue-target] .gp-widget-card')
    expect(card).toContain('data-unglue-intent={hasUnglueIntent || undefined}')
    expect(controls).toContain('.gp-widget-layout-motion[data-unglue-intent] .gp-widget-card')
  })
})

describe('widgets light the board locally instead', () => {
  it('never drops a glued member from the emitter set, however small it reads', () => {
    // Glued cards are usually the smallest on the board, so a purely
    // largest-first cut silenced exactly the widgets whose pooled light now
    // carries the join.
    expect(aura).toContain('glued: Boolean(widgetGlueIndex[widget.id])')
    expect(aura).toContain('(Number(b.glued) - Number(a.glued)) ||')
  })

  it('emits a strong, tight pool with only a little spread', () => {
    const dark = auraTuning.slice(auraTuning.indexOf('dark: {'), auraTuning.indexOf('light: {'))
    const value = (key: string) => Number(dark.match(new RegExp(`${key}: ([\\d.]+)`))![1])
    // Strong at the source...
    expect(value('alpha')).toBeGreaterThan(0.25)
    // ...held close to the widget that casts it...
    expect(value('reach')).toBeLessThanOrEqual(1)
    // ...with only a little spread past that, and a floor low enough that a
    // small icon stays a small pool instead of being inflated to a wash.
    expect(value('scatter')).toBeLessThanOrEqual(0.2)
    expect(value('minRadius')).toBeLessThanOrEqual(0.03)
    // Enough emitters that a whole cluster of icons can glow at once.
    expect(value('maxEmitters')).toBeGreaterThanOrEqual(16)
  })
})

describe('the cluster group frame', () => {
  const chrome = readFileSync(new URL('./GlueClusterChrome.tsx', import.meta.url), 'utf8')
  const lines = readFileSync(new URL('../canvas/RelationLines.tsx', import.meta.url), 'utf8')
  const geometry = readFileSync(new URL('../../utils/glueGeometry.ts', import.meta.url), 'utf8')

  it('draws unbroken boundary lines — no notch to thread a connector through', () => {
    expect(chrome).toContain('<span className="gp-group-line" style={{ width }} />')
    expect(chrome).not.toContain('CONNECT_GAP')
    // No split-line arithmetic left behind (the prose comment may still
    // explain why the notch is gone — the logic must not be).
    expect(chrome).not.toContain('const notch')
    expect(chrome).not.toContain('const side')
  })

  it('reserves the frame band in the geometry owner, shared with link anchoring', () => {
    // One constant means the drawn line and the link gap can never disagree,
    // and the title/button row above the top line is INSIDE the group's
    // technical rectangle (clusterChromeEnvelope), which relation anchoring,
    // the cmd-drag drop hook, and board settling all share.
    expect(geometry).toContain('export const GLUE_FRAME_BAND')
    expect(geometry).toContain('export const GLUE_TITLE_HEADROOM')
    // The group's boundary is TWO rects, never one grown box: the frame, and
    // the title row where it is actually painted. The empty canvas beside a
    // short group name belongs to the board.
    expect(geometry).toContain('export function clusterFrameEnvelope')
    expect(geometry).toContain('export function clusterTitleRowRect')
    expect(chrome).toContain('const LINE_BAND = GLUE_FRAME_BAND')
    expect(lines).toContain('clusterFrameEnvelope')
    // A widget's own title row is reserved space too, measured by one owner.
    expect(geometry).toContain('export function glueChromeRect')
    const rest = readFileSync(new URL('../../utils/widgetRest.ts', import.meta.url), 'utf8')
    expect(rest).toContain('export function widgetShowsTitleRow')
    expect(rest).toContain('export const WIDGET_TITLE_ROW')
    const settling = readFileSync(new URL('../../store/widgetSettling.ts', import.meta.url), 'utf8')
    expect(settling).toContain('widgetShowsTitleRow')
  })

  it('wears a widget’s title anatomy: icon square, bold name, buttons right — no pill', () => {
    expect(chrome).toContain('<Group size={14} aria-hidden />')
    expect(chrome).toContain('className="gp-group-icon"')
    expect(controls).toContain('.gp-group-icon')
    // The pill's enclosure is gone: no radius, border, or backdrop on the bar.
    const bar = controls.slice(controls.indexOf('.gp-group-bar {'), controls.indexOf('.gp-group-icon'))
    expect(bar).not.toContain('border-radius: 999px')
    expect(bar).not.toContain('backdrop-filter')
  })

  it('links a cluster as ONE node, anchored off the frame not the card', () => {
    expect(lines).toContain('const linkNodeId = (widgetId: string): string =>')
    // Endpoint geometry is the cluster's frame; the title/button row is dodged
    // as a pill where it is painted, so a line never cuts through the name and
    // the empty canvas beside the row stays freely reachable.
    expect(lines).toContain('clusterFrameEnvelope(cluster.widgetIds, widgets)')
    expect(lines).toContain('clusterTitleRowRect(cluster.widgetIds, widgets, cluster.name)')
    // Two relations reaching one cluster merge into a single drawn edge.
    expect(lines).toContain('const edgeKey = `${fromNode}::${toNode}`')
    // A relation wholly inside one cluster has nowhere to go.
    expect(lines).toContain('if (fromNode === toNode) continue')
    // The whole rectangle is also the cmd-drag DROP hook: a relation released
    // anywhere on the group lands on the group.
    const linkTarget = readFileSync(new URL('../../utils/linkTarget.ts', import.meta.url), 'utf8')
    expect(linkTarget).toContain('clusterFrameEnvelope(glue.widgetIds, state.widgets)')
    expect(linkTarget).toContain('clusterTitleRowRect(glue.widgetIds, state.widgets, glue.name)')
  })

  it('folds and unfolds from a remembered state, and one click opens it', () => {
    expect(chrome).toContain('setClusterCollapsed(glueId, !collapsed)')
    expect(card).toContain('const unfoldCollapsedCluster = (): boolean =>')
    expect(card).toContain('store.setClusterCollapsed(glueId, false)')
  })

  it('folds members into single cells, stacked the way a ghost node stacks them', () => {
    const slice = readFileSync(new URL('../../store/slices/glueSlice.ts', import.meta.url), 'utf8')
    const ghost = readFileSync(new URL('../../utils/ghostTreePresentation.ts', import.meta.url), 'utf8')
    // One packing rule, shared: the ghost tree and the folded cluster stack a
    // bundle of widgets the same way, so a node looks the same in both places.
    expect(ghost).toContain('export function balancedRowCounts')
    expect(geometry).toContain("import { balancedRowCounts } from './ghostTreePresentation'")
    expect(geometry).toContain('export function collapsedClusterLayout')
    expect(geometry).toContain('export const COLLAPSED_MEMBER_SIZE')
    // Folding is one owner (refoldCollapsedCluster) — the first fold, a merge
    // into a collapsed group, and a re-pack after a member leaves all route
    // through it, so a collection built any of those ways looks identical.
    expect(geometry).toContain('export function refoldCollapsedCluster')
    expect(geometry).toContain('collapsedClusterLayout(present.length)')
    expect(geometry).toContain('size: { ...COLLAPSED_MEMBER_SIZE }')
    // Every refold also carries the record's PREVIOUS fold anchor, because the
    // restore map it re-emits was written in that anchor's frame: a fresh
    // anchor without it makes the block's recorded travel read zero, and the
    // group rewinds to wherever it was first folded.
    expect(slice).toContain(
      'refoldCollapsedCluster(state.widgets, memberIds, cluster.restore, cluster.foldedAt)',
    )
    // The old fold packed dormant 2×2 icons with the tree's card packer.
    expect(slice).not.toContain('ICONIFIED_SIZE')
    expect(slice).not.toContain('clusterLayout(')
  })

  it('keeps a merge into a collapsed group folded, and never leaves a released 1×1 icon', () => {
    const slice = readFileSync(new URL('../../store/slices/glueSlice.ts', import.meta.url), 'utf8')
    const selection = readFileSync(new URL('../../store/slices/selectionSlice.ts', import.meta.url), 'utf8')
    // A weld that touches a collapsed group carries its collapsed flag + restore
    // map across the merge and re-stacks, instead of minting a fresh record that
    // silently drops both.
    expect(slice).toContain('const collapsed = targetGlue?.collapsed === true || draggedGlue?.collapsed === true')
    expect(slice).toContain(
      'refoldCollapsedCluster(s.widgets, merged, mergedRestore, previousFoldedAt)',
    )
    // Every path that can release a folded member restores it so it is never
    // stranded below the 2×2 aim-at floor.
    expect(geometry).toContain('export function unfoldReleasedFoldedMembers')
    expect(slice).toContain('unfoldReleasedFoldedMembers(widgets, state.glues, reconciled)') // unglueWidget
    expect(slice).toContain('unfoldReleasedFoldedMembers(state.widgets, state.glues, glues)') // unglueCluster
    expect(selection).toContain('unfoldReleasedFoldedMembers(repacked, state.glues, glues)') // deleteWidgets
    // Deleting from a cluster closes ranks (survivors pull together / a folded
    // block re-stacks) BEFORE membership is re-derived, so the group survives
    // the loss of its connecting member instead of splitting.
    expect(selection).toContain('closeClusterGaps(repacked, survivors)')
    expect(selection).toContain(
      'refoldCollapsedCluster(repacked, survivors, glue.restore, glue.foldedAt)',
    )
  })

  it('a glue-drag release that welds nothing pulls the member off — never half-out', () => {
    // Between "welds here" and "a full cell clear of everyone" there used to be
    // a dead zone where release did nothing: the card stayed on the cluster's
    // books (framed and moved with a group it no longer touched) and, still
    // glue-indexed, was skipped by the release grid snap. Any release without
    // a weld now unglues, and the freed card falls through to the normal
    // snap-and-settle path.
    expect(card).toContain('} else if (state.widgetGlueIndex[draggedId]) {')
    expect(card).toContain("state.unglueWidget(draggedId, { skipHistory: true })")
    // ...and the gesture resolves the SAME way when it is cancelled rather
    // than released. A pointer-cancel that only dropped the intents left
    // exactly the half-out card this rule exists to forbid, and a touch or pen
    // drag loses capture to any system gesture.
    const cancelPath = card.slice(card.indexOf('const onPointerCancel'), card.indexOf('const onContextMenu'))
    expect(cancelPath).toContain('if (moved && wasGlueDrag) {')
    expect(cancelPath).toContain('state.commitGlue()')
    expect(cancelPath).toContain('state.unglueWidget(draggedId, { skipHistory: true })')
  })

  it('makes every folded member inert — the collection is the only target', () => {
    expect(card).toContain('const hoverInert = backgrounded || inFoldedCluster')
    expect(card).toContain('data-cluster-collapsed={inFoldedCluster || undefined}')
    // No per-icon lift or resize handle...
    expect(controls).toContain("[data-widget-id].gp-card-motion[data-cluster-collapsed='true']")
    expect(controls).toContain(".gp-widget-card[data-cluster-collapsed='true'] .gp-resize-edge")
    // ...no port rail to wire a folded icon by...
    expect(card).toContain('{!inFoldedCluster && <PortRail widgetId={widgetId} />}')
    // ...no pulling one icon out of the collection with ⌥...
    expect(card).toContain('glueDragRef.current = e.altKey && !inFoldedCluster')
    // ...and the whole block says "press me", not "grab me".
    expect(card).toContain("? 'pointer'")
  })

  it('paints every folded cell the same, seam on all four edges', () => {
    // An end-of-row cell has a free outer edge, so the ordinary weld insets
    // would let it paint wider than the cells between it — a folded block has
    // to read as one even grid.
    expect(geometry).toContain('export function foldedMemberInsets')
    expect(card).toContain("if (cluster?.collapsed === true) return foldedMemberInsets()")
  })
})

describe('a pin remembers what it interrupted', () => {
  it('hands the expansion’s own origin to the store', () => {
    // Only the expansion still knows the icon square the card opened from —
    // by pin time the card is an ordinary full card, so the store cannot
    // recover it on its own.
    expect(card).toContain('const origin = useWidgetRestStore.getState().expandedFrom')
    expect(card).toContain("origin?.kind === 'icon'")
    expect(card).toContain('toggleWidgetPinned(widgetId, { absorbOffset, from })')
  })
})

describe('a card held open leaves every other card in the background', () => {
  const index = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

  it('answers no hover at all while another card is expanded', () => {
    expect(card).toContain(
      'const backgrounded = expandedWidgetId !== null && expandedWidgetId !== widgetId',
    )
    expect(card).toContain('data-hover-inert={hoverInert || undefined}')
    // The three hover responses a card has: bloom, lift, and the selected
    // card's own lift. None of them may fire on a background card.
    const hoverRules = index.split('\n').filter((line) => line.includes(':hover {'))
      .filter((line) => line.includes('gp-widget-card') || line.includes('gp-card-motion'))
    expect(hoverRules.length).toBeGreaterThanOrEqual(3)
    for (const rule of hoverRules) {
      expect(rule).toContain(':not([data-hover-inert="true"])')
    }
  })

  it('withholds the magnetic tilt, the hover signal, and the outline resize', () => {
    expect(card).toContain('if (widget.metadata.locked || hoverInert) return')
    expect(card).toContain('!session && !widget.metadata.locked && !hoverInert')
    expect(card).toContain('if (!hoverInert) edgeResize.onEdgeHoverMove(event)')
    // A press on an invisible outline must not start a resize either.
    expect(card).toContain('!hoverInert &&\n      !linkingState.childLinkSource')
    // And a card that goes background under a resting pointer drops what it
    // already had lit, because no pointerleave is ever coming.
    expect(card).toContain('if (!hoverInert) return\n    magneticHover.suspend()')
  })
})
