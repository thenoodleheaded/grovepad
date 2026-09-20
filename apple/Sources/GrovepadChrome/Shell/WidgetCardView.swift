import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The card shell (`components/widgets/WidgetCard.tsx`, the parts that are not
// gesture arbitration): the floating name row in the one-cell strip above the
// box, ONE backplate, the renderer's body inside it. Plus the seams the
// canvas asks the chrome for: a resting bitmap provider, a live-card host,
// the card accent, and the factory that builds the Canvas `RestContext`
// from the registry.
// ---------------------------------------------------------------------------

/// `WIDGET_TITLE_ROW`: the strip reserved above a card for its name row.
public let widgetTitleRowHeight = CanvasGeometry.gridSize

/// Where a card is between its resting tile and its full box (the web's
/// expand glide): `open` false draws the glass at the tile's size, centred,
/// with the content faded out; animating it to true grows the box.
public struct CardOpenness: Equatable {
    public var tile: Size
    public var open: Bool
    /// Where the tile's top-left sits inside the glass, in world units. Nil
    /// centres it (the card opens out of the middle of its tile), but the
    /// open card is snapped to the grid, so the host passes the real spot
    /// and the glass shrinks exactly onto the tile instead of beside it.
    public var offset: CGPoint?
    /// The tile is a bare icon (a peeked icon closing back). The card draws
    /// that icon itself as it lands, so the mark rises with the glass
    /// instead of appearing in one frame when the card leaves.
    public var glyph: Bool
    public init(tile: Size, open: Bool, offset: CGPoint? = nil, glyph: Bool = false) {
        self.tile = tile
        self.open = open
        self.offset = offset
        self.glyph = glyph
    }
}

public struct WidgetCardView: View {
    private let context: WidgetCardContext
    private let renderer: AnyWidgetRenderer
    private let onSkinTap: (() -> Void)?
    /// Mid-glide between the tile and the card, or nil for a card simply open.
    private let openness: CardOpenness?

    /// The height the body needs, reported whenever it changes (the web's
    /// content floor: the host grows the card to it, snapped to the grid).
    private let onContentHeight: ((CGFloat) -> Void)?

    public init(context: WidgetCardContext, renderer: AnyWidgetRenderer? = nil, onSkinTap: (() -> Void)? = nil, openness: CardOpenness? = nil, onContentHeight: ((CGFloat) -> Void)? = nil) {
        self.context = context
        self.renderer = renderer ?? WidgetRendererRegistry.renderer(for: context.widget.type)
        self.onSkinTap = onSkinTap
        self.openness = openness
        self.onContentHeight = onContentHeight
    }

    /// The card height a body of `bodyHeight` needs (`contentFitHeight`):
    /// body plus the backplate's padding, up to the next grid line.
    public static func fittedHeight(forBody bodyHeight: Double) -> Double {
        let grid = CanvasGeometry.gridSize
        return (((bodyHeight + Double(GlassTokens.p0) * 2) / grid).rounded(.up)) * grid
    }

    /// `--gp-motion-layout` (300 ms) on `--gp-ease-layout`.
    public static let layoutAnimation = Animation.timingCurve(0.22, 1, 0.36, 1, duration: 0.3)
    /// Opening out of the tile and closing back into it, on the layout ease
    /// (`CardMotion.layoutControlPoints`). It moves fastest on its very first
    /// frame: a spring starts at rest, and that dead first stretch read as a
    /// pause between the release and the glass starting to grow.
    public static let openAnimation = Animation.timingCurve(0.22, 1, 0.36, 1, duration: CardMotion.openDuration)
    /// The selection outline and an icon's mark change over the whole glide.
    static let outlineFade = Animation.easeInOut(duration: CardMotion.openDuration)
    /// The body fades on its own clock, never dragged along by the glide.
    static func contentFade(open: Bool) -> Animation {
        open ? .easeOut(duration: CardMotion.contentInDuration).delay(CardMotion.contentInDelay) : .easeOut(duration: CardMotion.contentOutDuration)
    }

    /// The box a live card is mounted in: the widget's frame grown upward by
    /// the title strip when the card wears the name row.
    /// How far the glass sits below the top of a mounted card's box.
    static func titleInset(_ context: WidgetCardContext) -> Double {
        context.definition.titleChrome != false && context.widget.iconified != true ? widgetTitleRowHeight : 0
    }

    public static func mountFrame(for widget: Widget, frame: WorldRect, definition: WidgetDefinition?) -> WorldRect {
        guard definition?.titleChrome != false, widget.iconified != true else { return frame }
        return WorldRect(x: frame.x, y: frame.y - widgetTitleRowHeight, width: frame.width, height: frame.height + widgetTitleRowHeight)
    }

    @State private var hovering = false

    public var body: some View {
        let accent = Color.inked(context.accent)
        let showsTitle = context.definition.titleChrome && context.widget.iconified != true
        let selected = context.actions?.isSelected ?? false
        let full = CGSize(width: CGFloat(context.widget.size.width), height: CGFloat(context.widget.size.height))
        let isOpen = openness?.open ?? true
        // The glass box: the tile's size while closed, the card's when open.
        let plate = isOpen ? full : CGSize(width: CGFloat(openness?.tile.width ?? 0), height: CGFloat(openness?.tile.height ?? 0))
        let plateOffset: CGSize = isOpen ? .zero : openness?.offset.map { CGSize(width: $0.x, height: $0.y) }
            ?? CGSize(width: (full.width - plate.width) / 2, height: (full.height - plate.height) / 2)
        VStack(spacing: 0) {
            if showsTitle {
                WidgetTitleRow(
                    title: context.widget.title, accent: accent, symbol: WidgetCardView.symbol(for: context),
                    skinLabel: context.skin?.label, locked: context.widget.metadata.locked, pinned: context.widget.metadata.pinned,
                    favorite: context.widget.metadata.favorite,
                    showsActions: (hovering || selected) && context.actions != nil,
                    actions: context.actions,
                    onSkinTap: context.definition.skins.isEmpty ? nil : onSkinTap
                )
                .opacity(isOpen ? 1 : 0)
                .animation(WidgetCardView.contentFade(open: isOpen), value: isOpen)
            }
            GlassBackplate(accent: accent) {
                if context.widget.iconified == true {
                    RestIconGlyph(accent: context.accent, symbol: WidgetCardView.symbol(for: context))
                } else {
                    // Laid out at full size from the first frame, so the
                    // content never reflows while the box grows round it.
                    cardContent(available: max(0, full.height - GlassTokens.p0 * 2))
                        .opacity(isOpen ? 1 : 0)
                        .animation(WidgetCardView.contentFade(open: isOpen), value: isOpen)
                }
            }
            .frame(width: full.width, height: full.height, alignment: .top)
            .mask(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous)
                    .frame(width: plate.width, height: plate.height)
                    .offset(plateOffset)
            }
            .overlay(alignment: .topLeading) {
                // The web's selected card (`index.css` selected rule): an
                // accent border, a 3 pt ring of the accent at 30 %, and a
                // 30 pt glow at 24 %, outside the glass so the body is
                // untouched.
                if selected {
                    ZStack {
                        RoundedRectangle(cornerRadius: GlassTokens.r0 + 3, style: .continuous)
                            .strokeBorder(accent.opacity(0.3), lineWidth: 3)
                            .padding(-3)
                            .shadow(color: accent.opacity(0.24), radius: 15)
                        RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous)
                            .strokeBorder(accent.opacity(0.75), lineWidth: 1)
                    }
                    // Closing, the outline drains away across the whole
                    // glide as the glass shrinks; it never waits for the
                    // card to leave and vanishes in one frame. Only its
                    // opacity takes this curve: `.animation` reaches the
                    // modifiers above it, so the box below keeps the glass's
                    // own spring and the ring stays on the glass's edge
                    // instead of easing on a different curve.
                    .opacity(isOpen ? 1 : 0)
                    .animation(WidgetCardView.outlineFade, value: isOpen)
                    .frame(width: plate.width, height: plate.height)
                    .offset(plateOffset)
                    .allowsHitTesting(false)
                    .transition(.opacity)
                }
            }
            .overlay(alignment: .topLeading) {
                // An icon's own mark, rising as the card closes onto it.
                if let openness, openness.glyph {
                    let tileSize = CGSize(width: CGFloat(openness.tile.width), height: CGFloat(openness.tile.height))
                    let origin = openness.offset.map { CGSize(width: $0.x, height: $0.y) }
                        ?? CGSize(width: (full.width - tileSize.width) / 2, height: (full.height - tileSize.height) / 2)
                    RestIconGlyph(accent: context.accent, symbol: WidgetCardView.symbol(for: context))
                        .frame(width: tileSize.width, height: tileSize.height)
                        .offset(origin)
                        .opacity(isOpen ? 0 : 1)
                        .animation(WidgetCardView.outlineFade, value: isOpen)
                        .allowsHitTesting(false)
                }
            }
            .overlay(alignment: .topLeading) {
                // Under the pointer an open card lights up: its border takes
                // the accent and glows. The face itself never changes.
                if hovering, !selected, isOpen {
                    RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous)
                        .strokeBorder(accent.opacity(0.5), lineWidth: 1)
                        .shadow(color: accent.opacity(0.35), radius: 10)
                        .frame(width: plate.width, height: plate.height)
                        .allowsHitTesting(false)
                        .transition(.opacity)
                }
            }
            .animation(.timingCurve(0.2, 0.82, 0.2, 1, duration: 0.15), value: selected)
            // The same wide, faint shadow a resting tile casts (`CardShadow`),
            // so opening a card does not change how far it sits off the board.
            .shadow(color: WidgetCardView.shadowColor(lifted: hovering), radius: CGFloat(CardShadow.radius) / 2, x: 0, y: CGFloat(CardShadow.offsetY))
        }
        .onHover { inside in withAnimation(.timingCurve(0.16, 1, 0.3, 1, duration: 0.15)) { hovering = inside } }
        .environment(\.glassAllowed, context.glassAllowed)
        .environment(\.touchChrome, context.isTouch)
    }

    /// The body inside the backplate. It always starts at the top and fills
    /// the box, so the glass is the card's size whatever the body needs.
    /// Nothing in a card ever scrolls (owner's rule, 18 Sep 2026): the body
    /// is measured at its natural height for the card's width and the host
    /// grows the card to hold all of it (`BoardDocument.fitWidgetHeight`,
    /// no ceiling). Until that lands the body is clipped by the glass,
    /// never scrolled.
    private func cardContent(available: CGFloat) -> some View {
        NaturalHeightLayout(onNaturalHeight: onContentHeight) {
            renderer.cardBody(context)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    /// `CardShadow` as a themed SwiftUI colour. SwiftUI's shadow radius is a
    /// blur radius, Core Animation's a standard deviation-ish spread twice as
    /// wide, hence the halving above.
    static func shadowColor(lifted: Bool) -> Color {
        Color.adaptive(
            light: Color(cgColor: CardShadow.color(dark: false)).opacity(Double(CardShadow.opacity(dark: false, lifted: lifted))),
            dark: Color(cgColor: CardShadow.color(dark: true)).opacity(Double(CardShadow.opacity(dark: true, lifted: lifted)))
        )
    }

    /// One identity mark per type (`WidgetSymbols`; the web uses a lucide
    /// icon per registry entry, swapped by some skins).
    static func symbol(for context: WidgetCardContext) -> String {
        WidgetSymbols.symbol(for: context.widget.type, skin: context.skinValue)
    }
}

// MARK: - Rest context factory (`utils/widgetRest.ts` decisions from the registry)

public enum WidgetRestContextFactory {
    /// The tile a widget rests as: nil for a type without a resting face
    /// (or outside the registry), otherwise the renderer's measured face.
    public static func restingTileSize(_ widget: Widget) -> Size? {
        guard let definition = WidgetRegistry.definition(for: widget.type), definition.restingFace else { return nil }
        return WidgetRendererRegistry.renderer(for: widget.type).restingFaceMeasured(widget).size
    }

    /// The Canvas `RestContext`: rest eligibility from the registry flag,
    /// pinned/iconified rules from the stock eligibility, sizes from the faces.
    /// A pinned card is held open: it never rests, and keeps its stored box
    /// (owner's call, 21 Sep 2026, reversing the 18 Sep "pinned cards rest").
    /// An icon keeps its own state.
    public static func isRestEligible(_ widget: Widget, tile: Size?) -> Bool {
        tile != nil && widget.iconified != true && !widget.metadata.pinned
    }

    public static func make(expandedWidgetId: String? = nil, expandedOffset: Vector2D? = nil) -> RestContext {
        var context = RestContext(expandedWidgetId: expandedWidgetId, expandedOffset: expandedOffset, restingSize: restingTileSize) { widget in
            isRestEligible(widget, tile: restingTileSize(widget))
        }
        context.iconOpenSize = { WidgetRegistry.definition(for: $0.type)?.defaultSize }
        return context
    }
}

/// Remembers each widget's resting tile for as long as the board's widgets
/// have not changed. Hit-testing, hover, the resize bands and the residency
/// planner all ask "how big is this tile?" for every card on every mouse
/// move; unremembered, each answer rebuilt the resting face and measured its
/// text again, which is what made the pointer itself feel heavy.
public final class RestingTileCache {
    private var version: UInt64?
    private var sizes: [String: (stored: Size, tile: Size?)] = [:]
    /// Measurements actually made (test seam).
    public private(set) var measurements = 0

    public init() {}

    /// The tile for `widget` on a board whose widgets are at `version`.
    public func tileSize(_ widget: Widget, version: UInt64) -> Size? {
        if self.version != version {
            self.version = version
            sizes.removeAll(keepingCapacity: true)
        }
        // A caller may hand in a copy it has resized (a live resize frame, a
        // peeked icon): the stored box is part of the key.
        if let hit = sizes[widget.id], hit.stored == widget.size { return hit.tile }
        measurements += 1
        let tile = WidgetRestContextFactory.restingTileSize(widget)
        sizes[widget.id] = (widget.size, tile)
        return tile
    }
}

public extension WidgetRestContextFactory {
    /// The same context reading tile sizes through `cache`.
    static func make(expandedWidgetId: String? = nil, expandedOffset: Vector2D? = nil, cache: RestingTileCache, version: UInt64) -> RestContext {
        var context = RestContext(expandedWidgetId: expandedWidgetId, expandedOffset: expandedOffset, restingSize: { cache.tileSize($0, version: version) }) { widget in
            isRestEligible(widget, tile: cache.tileSize(widget, version: version))
        }
        context.iconOpenSize = { WidgetRegistry.definition(for: $0.type)?.defaultSize }
        return context
    }
}

// MARK: - Card accent

public enum CardAccent {
    /// A card's accent (placeholder block, selection ring, glow): the worn
    /// skin's hue.
    public static func accent(for widget: Widget) -> String {
        if let accent = widget.metadata.accent { return accent }
        return WidgetRegistry.definition(for: widget.type)?.accent(for: widget.data) ?? "#3f3f46"
    }
}

#if canImport(QuartzCore)
import QuartzCore
import CoreGraphics

// MARK: - Resting bitmaps

/// Renders resting faces to bitmaps for the canvas's card layers, cached by
/// the widget record's JSON text so a data change invalidates exactly once.
public final class WidgetBitmapProvider: RestingBitmapProvider {
    public var canvasName: (String) -> String?
    /// The theme tiles are painted in. The canvas host sets it from its
    /// effective appearance; a change moves every data version, so the next
    /// `refreshRestingBitmaps` repaints each resting tile exactly once.
    public var colorScheme: ColorScheme = .dark
    private var cache: [String: (version: Int, scale: CGFloat, size: Size, image: CGImage)] = [:]
    public private(set) var renders = 0

    public init(canvasName: @escaping (String) -> String? = { _ in nil }) {
        self.canvasName = canvasName
    }

    /// The board's widget revision, when the owner can supply one: a data
    /// version is then worked out once per revision instead of once per sync
    /// (hover and selection changes re-sync without touching any widget).
    public var revision: (() -> UInt64)?
    private var versionMemo: [String: (revision: UInt64, dark: Bool, version: Int)] = [:]

    public func dataVersion(for widget: Widget) -> Int {
        guard let revision = revision?() else { return computeDataVersion(for: widget) }
        let dark = colorScheme == .dark
        if let memo = versionMemo[widget.id], memo.revision == revision, memo.dark == dark { return memo.version }
        let version = computeDataVersion(for: widget)
        versionMemo[widget.id] = (revision, dark, version)
        return version
    }

    private func computeDataVersion(for widget: Widget) -> Int {
        // Where a card sits is not how it looks: without dropping the
        // position, every frame of a drag re-rendered the moving tile's
        // bitmap, which is what made drags stutter.
        var record = widget.json
        if case .object(var object) = record {
            _ = object.removeValue(forKey: "position")
            record = .object(object)
        }
        var hasher = Hasher()
        hasher.combine(JSONWriter.stringify(record))
        hasher.combine(colorScheme == .dark)
        return hasher.finalize()
    }

    public func restingBitmap(for widget: Widget, size: Size, scale: CGFloat) -> CGImage? {
        guard let definition = WidgetRegistry.definition(for: widget.type) else { return nil }
        let version = dataVersion(for: widget)
        if let cached = cache[widget.id], cached.version == version, cached.scale == scale, cached.size == size { return cached.image }
        let renderer = WidgetRendererRegistry.renderer(for: widget.type)
        // An icon shows its icon face and nothing else: never a resting
        // face squeezed into the icon's square.
        let model = widget.iconified == true ? .icon : renderer.restingFaceMeasured(widget).model
        let context = WidgetRestContext(widget: widget, definition: definition, face: RestingFace(model: model, size: size), canvasName: canvasName)
        let image = WidgetBitmapProvider.render(WidgetRestingFaceView(context: context), scale: scale, colorScheme: colorScheme)
        if let image { cache[widget.id] = (version, scale, size, image) }
        renders += 1
        return image
    }

    public func evict(_ id: String) {
        cache[id] = nil
        versionMemo[id] = nil
    }

    /// The canvas calls this when a card leaves the canvas (deleted, or
    /// another canvas is shown). Without it the cache is keyed by widget id
    /// and never shrinks.
    public func releaseBitmap(for id: String) { evict(id) }

    /// Cached tiles, for tests and memory reporting.
    public var cachedCount: Int { cache.count }

    /// `ImageRenderer` is main-actor bound; the canvas calls from the main thread.
    static func render<V: View>(_ view: V, scale: CGFloat, colorScheme: ColorScheme = .dark) -> CGImage? {
        MainActor.assumeIsolated {
            let renderer = ImageRenderer(content: view.environment(\.colorScheme, colorScheme))
            renderer.scale = scale
            return renderer.cgImage
        }
    }
}
#endif

// MARK: - Live cards

/// The camera the open cards scale by, shared by every card on a canvas.
/// Only the scale modifier reads it, so a zoom re-renders one transform per
/// card, never a card's content. Platform-neutral: the group title row
/// (`GlueTitleRoot`) reads it on every platform.
public final class LiveCardCamera: ObservableObject {
    @Published public var zoom: Double = 1
    public init() {}
}

#if canImport(AppKit)
import AppKit

/// One open card's state. The hosting view's root never changes; the card's
/// context, its size and its place in the open/close glide all arrive
/// through here, so a press on a control inside the card is never cut short
/// by the root being swapped out mid-click.
public final class LiveCardModel: ObservableObject {
    @Published public var context: WidgetCardContext
    /// The card's box in world units (title strip included).
    @Published public var worldSize: CGSize
    /// The resting tile the card opened out of (and closes back into).
    public private(set) var tile: Size?
    /// The tile's top-left inside the glass (world units); nil centres it.
    @Published var tileOffset: CGPoint?
    /// The glide's state: false at the tile, true at the full card.
    @Published public var open: Bool
    /// False once the card has been asked to close: a late first frame must
    /// not start the opening glide on a card that is already leaving.
    var wantsOpen = true
    /// The card opened out of an icon (see `CardOpenness.glyph`).
    var tileIsGlyph = false
    /// SwiftUI has drawn the card at least once (a closed state exists to
    /// glide from).
    var appeared = false
    public let onSkinTap: (() -> Void)?
    var onContentHeight: ((CGFloat) -> Void)?

    init(context: WidgetCardContext, worldSize: CGSize, tile: Size?, animatesOpen: Bool, onSkinTap: (() -> Void)?) {
        self.context = context
        self.worldSize = worldSize
        self.tile = tile
        self.open = tile == nil || !animatesOpen
        self.onSkinTap = onSkinTap
    }

    var openness: CardOpenness? { tile.map { CardOpenness(tile: $0, open: open, offset: tileOffset, glyph: tileIsGlyph) } }

    /// Aim the closed state at `rect`, given the glass's world origin.
    func aim(at rect: WorldRect, glass: Vector2D) {
        tile = Size(width: rect.width, height: rect.height)
        tileOffset = CGPoint(x: rect.x - glass.x, y: rect.y - glass.y)
    }
}

/// The card laid out at its world size and scaled by the camera inside
/// SwiftUI. AppKit delivers clicks to SwiftUI controls correctly only when
/// the hosting view itself is unscaled: a hosting view inside a
/// bounds-scaled container received no clicks at all at any zoom but 100 %,
/// which is why no button in an open card could be pressed.
struct LiveCardRoot: View {
    @ObservedObject var model: LiveCardModel
    @ObservedObject var camera: LiveCardCamera

    var body: some View {
        let zoom = CGFloat(camera.zoom)
        let worldSize = model.worldSize
        WidgetCardView(context: model.context, onSkinTap: model.onSkinTap, openness: model.openness, onContentHeight: { [weak model] height in
            model?.onContentHeight?(height)
        })
            .frame(width: worldSize.width, height: worldSize.height, alignment: .top)
            .scaleEffect(zoom, anchor: .topLeading)
            .frame(width: worldSize.width * zoom, height: worldSize.height * zoom, alignment: .topLeading)
            // The opening glide starts from the first frame SwiftUI has
            // actually drawn. Started from outside ("a moment later") it
            // raced that first frame, and whenever it won there was no closed
            // state to animate from: the card simply appeared.
            .onAppear {
                model.appeared = true
                guard model.wantsOpen, !model.open else { return }
                withAnimation(WidgetCardView.openAnimation) { model.open = true }
            }
    }
}

/// The hosting view of one live card; its own type so the host can tell its
/// cards from anything else in the container.
final class LiveCardHostingView: NSHostingView<LiveCardRoot> {
    var widgetId = ""
    /// Built ahead of an open, not shown yet: it takes no presses.
    var isWarm = false

    override func hitTest(_ point: NSPoint) -> NSView? { isWarm ? nil : super.hitTest(point) }
}

/// Mounts `WidgetCardView`s as `NSHostingView`s in `container`, an unscaled
/// view over the canvas: each card's frame is its world box through the
/// camera (`setCamera`), and the card scales itself (`LiveCardRoot`).
///
/// Every view the host ever added is in exactly one of two tables — `cards`
/// (open) or `closing` (gliding back to its tile) — and `sweep` removes
/// anything in the container that is in neither, so a card can never be left
/// behind on the board as an empty outline.
public final class WidgetLiveCardHost: LiveCardHost {
    public weak var container: NSView?
    /// Builds the card context for a widget (the app closes over the document).
    public var makeContext: (Widget) -> WidgetCardContext?
    /// The skin button on a card's title row (the host opens the picker).
    public var onSkinTap: ((String) -> Void)?
    /// A card's body reported the card height it needs (already on the grid).
    public var onFittedHeight: ((String, Double) -> Void)?
    public let camera = LiveCardCamera()
    /// `prefers-reduced-motion`: cards open and close in place.
    public var reducedMotion: () -> Bool = { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }
    /// A pointer owns a card's size or place right now: frames follow it at
    /// once instead of gliding.
    public var isGestureActive: () -> Bool = { false }
    public private(set) var pan: Vector2D = .zero

    private struct Card {
        let view: LiveCardHostingView
        let model: LiveCardModel
        var world: WorldRect
        var signature: Int
        /// Bumped on every size change, so a finished glide only trims the
        /// view's frame if no newer size arrived meanwhile.
        var sizeToken = 0
    }

    private var cards: [String: Card] = [:]
    private var closing: [String: Card] = [:]
    /// Cards built on a press, invisible until the release opens them.
    private var warm: [String: Card] = [:]
    /// The card height a warm card's body asked for while it waited.
    private var warmFitted: [String: Double] = [:]

    public init(container: NSView? = nil, makeContext: @escaping (Widget) -> WidgetCardContext?) {
        self.container = container
        self.makeContext = makeContext
    }

    public var mountedIds: Set<String> { Set(cards.keys) }
    /// Cards gliding back into their tiles (test seam).
    public var closingIds: Set<String> { Set(closing.keys) }
    /// The view an open card is hosted in.
    public func view(for id: String) -> NSView? { cards[id]?.view }

    /// The open card above every other card view (a selected group mounts
    /// its members too; none may cover the card being worked in).
    public func bringToFront(_ id: String) {
        guard let view = cards[id]?.view, let superview = view.superview else { return }
        let others = superview.subviews.filter { $0 is LiveCardHostingView && $0 !== view }
        guard let top = others.last, let topIndex = superview.subviews.firstIndex(of: top),
              let index = superview.subviews.firstIndex(of: view), index < topIndex else { return }
        superview.addSubview(view, positioned: .above, relativeTo: top)
    }
    /// Where an open card's glass grew out of (test seam; nil opened in place).
    public func openingSource(_ id: String) -> CardOpenness? { cards[id]?.model.openness }
    /// Where a closing card's glass is shrinking to (test seam).
    public func closingTarget(_ id: String) -> CardOpenness? { closing[id]?.model.openness }
    /// The needed card height a card's body last reported (test seam).
    public private(set) var fittedHeights: [String: Double] = [:]

    /// The card's box on screen (viewport points) for a world box.
    public func screenFrame(_ world: WorldRect) -> NSRect {
        let zoom = camera.zoom
        return NSRect(x: world.x * zoom + pan.x, y: world.y * zoom + pan.y, width: world.width * zoom, height: world.height * zoom)
    }

    /// Every camera commit: re-place the cards, the closing ones included;
    /// the zoom reaches SwiftUI only when it changed.
    public func setCamera(zoom: Double, pan: Vector2D) {
        if camera.zoom != zoom { camera.zoom = zoom }
        self.pan = pan
        for card in cards.values { card.view.frame = screenFrame(card.world) }
        for card in closing.values { card.view.frame = screenFrame(card.world) }
    }

    /// What the card shows, reduced to a number: a refresh that changes
    /// nothing leaves the SwiftUI tree alone.
    private func signature(_ context: WidgetCardContext) -> Int {
        var hasher = Hasher()
        hasher.combine(JSONWriter.stringify(context.widget.json))
        hasher.combine(context.actions?.isSelected)
        hasher.combine(context.actions?.isRenaming)
        hasher.combine(context.glassAllowed)
        hasher.combine(context.isTouch)
        return hasher.finalize()
    }

    /// Remove every card view in the container that the host is not tracking.
    private func sweep() {
        guard let container else { return }
        for case let view as LiveCardHostingView in container.subviews {
            if cards[view.widgetId]?.view === view || closing[view.widgetId]?.view === view || warm[view.widgetId]?.view === view { continue }
            view.removeFromSuperview()
        }
    }

    public func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer) {
        mountLiveCard(widget, frame: frame, in: worldLayer, openingFrom: nil)
    }

    /// Warmed cards waiting for their release (test seam).
    public var warmIds: Set<String> { Set(warm.keys) }

    /// The card height a card built on the press needs (on the grid), once
    /// its body has been laid out. The opener fits the card to it before it
    /// opens, so the card glides straight to its real size: a fit arriving
    /// after the open started a second, animated grow (~250 ms of stalls on
    /// a table).
    public func warmFittedHeight(_ id: String) -> Double? { warm[id] == nil ? nil : warmFitted[id] }

    /// Apply a card's new state with every animation off, the card's own
    /// `.animation(_:value:)` modifiers included. Only the open glide may
    /// move a card built on the press: a change caught by the selection
    /// ring's animation re-laid the whole body out on every frame of it.
    static func withoutAnimation(_ change: () -> Void) {
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction, change)
    }

    /// Build a card's view before it is asked to open, out of sight and out
    /// of reach, so its first (expensive) SwiftUI layout happens while the
    /// pointer is still down. `mountLiveCard` then only reveals it.
    public func prewarm(_ widget: Widget, frame: WorldRect, tile: WorldRect?) {
        let id = widget.id
        guard cards[id] == nil, closing[id] == nil, warm[id] == nil, let container, let context = makeContext(widget) else { return }
        let world = WidgetCardView.mountFrame(for: context.widget, frame: frame, definition: context.definition)
        let skinTap: (() -> Void)? = onSkinTap.map { tap in { tap(id) } }
        let model = LiveCardModel(
            context: context, worldSize: CGSize(width: world.width, height: world.height),
            tile: tile.map { Size(width: $0.width, height: $0.height) }, animatesOpen: !reducedMotion(), onSkinTap: skinTap
        )
        if let tile { model.aim(at: tile, glass: Vector2D(x: frame.x, y: frame.y)) }
        model.tileIsGlyph = widget.iconified == true
        model.wantsOpen = false
        model.onContentHeight = { [weak self] height in self?.warmFitted[id] = WidgetCardView.fittedHeight(forBody: Double(height)) }
        let view = LiveCardHostingView(rootView: LiveCardRoot(model: model, camera: camera))
        view.widgetId = id
        view.isWarm = true
        view.sizingOptions = []
        view.alphaValue = 0
        view.frame = screenFrame(world)
        warm[id] = Card(view: view, model: model, world: world, signature: signature(context))
        container.addSubview(view, positioned: .below, relativeTo: nil)
    }

    /// A warmed card that will not open after all (the press became a drag).
    public func discardWarm(_ id: String) {
        warmFitted[id] = nil
        warm.removeValue(forKey: id)?.view.removeFromSuperview()
    }

    /// Show a card built on the press and start its open glide — nothing
    /// else. The opener calls this first on a release, ahead of the board's
    /// own bookkeeping, so the glide's first frame is the release's first
    /// frame. False when no card was built for `widget`.
    @discardableResult
    public func openWarm(_ widget: Widget, frame: WorldRect, openingFrom tile: WorldRect?) -> Bool {
        let id = widget.id
        guard cards[id] == nil, warm[id] != nil, let context = makeContext(widget) else { return false }
        let world = WidgetCardView.mountFrame(for: context.widget, frame: frame, definition: context.definition)
        reveal(id, context: context, world: world, frame: frame, tile: tile)
        return true
    }

    public func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer, openingFrom tile: WorldRect?) {
        let id = widget.id
        guard cards[id] == nil, let context = makeContext(widget) else { return }
        let world = WidgetCardView.mountFrame(for: context.widget, frame: frame, definition: context.definition)
        // Built on the press: take the finished view instead of a new one.
        if warm[id] != nil {
            reveal(id, context: context, world: world, frame: frame, tile: tile)
            return
        }
        // Reopened while it was still closing: the same view turns round and
        // glides back open, instead of a second card stacking over the first.
        if var card = closing.removeValue(forKey: id) {
            card.world = world
            card.signature = signature(context)
            card.model.context = context
            card.model.wantsOpen = true
            card.view.frame = screenFrame(world)
            card.view.alphaValue = 1
            card.model.onContentHeight = { [weak self] height in self?.bodyHeightChanged(id, Double(height)) }
            cards[id] = card
            if reducedMotion() { card.model.open = true } else {
                withAnimation(WidgetCardView.openAnimation) {
                    card.model.worldSize = CGSize(width: world.width, height: world.height)
                    card.model.open = true
                }
            }
            return
        }
        let skinTap: (() -> Void)? = onSkinTap.map { tap in { tap(id) } }
        let model = LiveCardModel(
            context: context, worldSize: CGSize(width: world.width, height: world.height),
            tile: tile.map { Size(width: $0.width, height: $0.height) }, animatesOpen: !reducedMotion(), onSkinTap: skinTap
        )
        if let tile { model.aim(at: tile, glass: Vector2D(x: frame.x, y: frame.y)) }
        model.tileIsGlyph = widget.iconified == true
        model.onContentHeight = { [weak self] height in self?.bodyHeightChanged(id, Double(height)) }
        let view = LiveCardHostingView(rootView: LiveCardRoot(model: model, camera: camera))
        view.widgetId = id
        view.sizingOptions = []
        view.frame = screenFrame(world)
        cards[id] = Card(view: view, model: model, world: world, signature: signature(context))
        container?.addSubview(view)
        sweep()
    }

    /// The warm card becomes the open card: sized, shown, gliding.
    private func reveal(_ id: String, context: WidgetCardContext, world: WorldRect, frame: WorldRect, tile: WorldRect?) {
        if var card = warm.removeValue(forKey: id) {
            // Already fitted to this height before the open: no second report.
            if let fitted = warmFitted.removeValue(forKey: id) { fittedHeights[id] = fitted }
            card.world = world
            card.signature = signature(context)
            WidgetLiveCardHost.withoutAnimation {
                card.model.context = context
                card.model.worldSize = CGSize(width: world.width, height: world.height)
                if let tile { card.model.aim(at: tile, glass: Vector2D(x: frame.x, y: frame.y)) }
            }
            card.model.onContentHeight = { [weak self] height in self?.bodyHeightChanged(id, Double(height)) }
            card.view.frame = screenFrame(world)
            card.view.isWarm = false
            card.view.alphaValue = 1
            container?.addSubview(card.view)
            cards[id] = card
            let glides = tile != nil && card.model.tile != nil && !reducedMotion()
            card.model.wantsOpen = true
            if !glides {
                card.model.open = true
            } else if card.model.appeared {
                withAnimation(WidgetCardView.openAnimation) { card.model.open = true }
            }
            // Not drawn yet: `LiveCardRoot.onAppear` starts the glide.
            sweep()
        }
    }

    /// The body's height moved: the card height that holds it, on the grid.
    /// Delivered on the next turn — a layout pass is no place to edit the
    /// board — and only for a card that is still open by then.
    private func bodyHeightChanged(_ id: String, _ bodyHeight: Double) {
        let fitted = WidgetCardView.fittedHeight(forBody: bodyHeight)
        guard fittedHeights[id] != fitted else { return }
        fittedHeights[id] = fitted
        DispatchQueue.main.async { [weak self] in
            guard let self, self.cards[id] != nil, self.fittedHeights[id] == fitted else { return }
            self.onFittedHeight?(id, fitted)
        }
    }

    public func updateLiveCard(_ widget: Widget, frame: WorldRect) {
        updateLiveCard(widget, frame: frame, animated: false)
    }

    public func updateLiveCard(_ widget: Widget, frame: WorldRect, animated: Bool) {
        guard var card = cards[widget.id], let context = makeContext(widget) else { return }
        let sig = signature(context)
        if card.signature != sig {
            card.signature = sig
            card.model.context = context
        }
        let world = WidgetCardView.mountFrame(for: context.widget, frame: frame, definition: context.definition)
        let resized = card.world.width != world.width || card.world.height != world.height
        let previous = card.world
        card.world = world
        let target = screenFrame(world)
        let view = card.view
        let glides = !reducedMotion() && !isGestureActive()
        if resized {
            let size = CGSize(width: world.width, height: world.height)
            if glides, previous.x == world.x, previous.y == world.y {
                // The card grew or shrank by itself (its content changed):
                // the glass glides to the new size. The view takes the larger
                // box for the length of the glide so nothing is clipped.
                card.sizeToken += 1
                let token = card.sizeToken
                let id = widget.id
                view.frame = screenFrame(WorldRect(x: world.x, y: world.y, width: max(previous.width, world.width), height: max(previous.height, world.height)))
                withAnimation(WidgetCardView.layoutAnimation) { card.model.worldSize = size }
                DispatchQueue.main.asyncAfter(deadline: .now() + CardMotion.layoutDuration) { [weak self] in
                    guard let self, let current = self.cards[id], current.sizeToken == token else { return }
                    current.view.frame = self.screenFrame(current.world)
                }
                cards[widget.id] = card
                return
            }
            card.model.worldSize = size
        }
        cards[widget.id] = card
        guard animated, glides, view.frame != target else { view.frame = target; return }
        // A drop settling onto the grid glides on the layout curve.
        NSAnimationContext.runAnimationGroup { animation in
            animation.duration = CardMotion.layoutDuration
            animation.timingFunction = CardMotion.layoutEase
            animation.allowsImplicitAnimation = true
            view.animator().frame = target
        }
    }

    public func moveLiveCard(_ widget: Widget, frame: WorldRect) {
        guard var card = cards[widget.id], let definition = WidgetRegistry.definition(for: widget.type) else { return }
        card.world = WidgetCardView.mountFrame(for: widget, frame: frame, definition: definition)
        cards[widget.id] = card
        card.view.frame = screenFrame(card.world)
    }

    public func unmountLiveCard(id: String) {
        unmountLiveCard(id: id, animated: false)
    }

    public func unmountLiveCard(id: String, animated: Bool) {
        unmountLiveCard(id: id, animated: animated, closingInto: nil)
    }

    public func unmountLiveCard(id: String, animated: Bool, closingInto tile: WorldRect?) {
        fittedHeights[id] = nil
        guard let card = cards.removeValue(forKey: id) else { return }
        if let tile, card.model.tile != nil {
            // The glass's world origin: the card's box less its title strip.
            let glass = Vector2D(x: card.world.x, y: card.world.y + WidgetCardView.titleInset(card.model.context))
            card.model.aim(at: tile, glass: glass)
        }
        card.model.wantsOpen = false
        card.model.onContentHeight = nil
        guard animated, !reducedMotion() else {
            card.view.removeFromSuperview()
            sweep()
            return
        }
        closing[id]?.view.removeFromSuperview()
        closing[id] = card
        let view = card.view
        let finish = { [weak self] in
            // Only if this very view is still the one closing: a reopen took
            // it back, and a newer close replaced it.
            guard let self, self.closing[id]?.view === view else { return }
            self.closing[id] = nil
            view.removeFromSuperview()
        }
        if card.model.tile != nil {
            // Closing: the glide backwards, the box shrinking into the tile
            // that fades in beneath it; the view leaves once it is there.
            withAnimation(WidgetCardView.openAnimation) { card.model.open = false }
            DispatchQueue.main.asyncAfter(deadline: .now() + CardMotion.openDuration + CardMotion.openSettleSlack, execute: finish)
            return
        }
        NSAnimationContext.runAnimationGroup { animation in
            animation.duration = CardMotion.closeDuration
            animation.timingFunction = CardMotion.outEase
            view.animator().alphaValue = 0
        } completionHandler: {
            finish()
        }
    }

    static func viewFrame(_ widget: Widget, frame: WorldRect, definition: WidgetDefinition) -> NSRect {
        let rect = WidgetCardView.mountFrame(for: widget, frame: frame, definition: definition)
        return NSRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
    }
}
#elseif canImport(UIKit)
import UIKit

public final class WidgetLiveCardHost: LiveCardHost {
    public weak var container: UIView?
    public var makeContext: (Widget) -> WidgetCardContext?
    private var controllers: [String: UIHostingController<AnyView>] = [:]
    /// The skin button on a card's title row (the host opens the picker).
    public var onSkinTap: ((String) -> Void)?
    /// A card's body reported the card height it needs (already on the grid).
    public var onFittedHeight: ((String, Double) -> Void)?
    public var isGestureActive: () -> Bool = { false }
    public private(set) var fittedHeights: [String: Double] = [:]

    public init(container: UIView? = nil, makeContext: @escaping (Widget) -> WidgetCardContext?) {
        self.container = container
        self.makeContext = makeContext
    }

    public var mountedIds: Set<String> { Set(controllers.keys) }

    private func root(_ context: WidgetCardContext, openingFrom tile: WorldRect? = nil) -> AnyView {
        let id = context.widget.id
        let skinTap: (() -> Void)? = onSkinTap.map { tap in { tap(id) } }
        return AnyView(WidgetCardView(context: context, onSkinTap: skinTap, onContentHeight: { [weak self] height in
            self?.bodyHeightChanged(id, Double(height))
        }))
    }

    private func bodyHeightChanged(_ id: String, _ bodyHeight: Double) {
        let fitted = WidgetCardView.fittedHeight(forBody: bodyHeight)
        guard fittedHeights[id] != fitted else { return }
        fittedHeights[id] = fitted
        DispatchQueue.main.async { [weak self] in
            guard let self, self.controllers[id] != nil, self.fittedHeights[id] == fitted else { return }
            self.onFittedHeight?(id, fitted)
        }
    }

    /// The Mac builds a card on the press; touch opens on the tap as it is.
    public func prewarm(_ widget: Widget, frame: WorldRect, tile: WorldRect?) {}
    public func discardWarm(_ id: String) {}
    public func warmFittedHeight(_ id: String) -> Double? { nil }
    public func openWarm(_ widget: Widget, frame: WorldRect, openingFrom tile: WorldRect?) -> Bool { false }

    public func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer) {
        mountLiveCard(widget, frame: frame, in: worldLayer, openingFrom: nil)
    }

    public func mountLiveCard(_ widget: Widget, frame: WorldRect, in worldLayer: CALayer, openingFrom tile: WorldRect?) {
        guard controllers[widget.id] == nil, let context = makeContext(widget) else { return }
        let controller = UIHostingController(rootView: root(context, openingFrom: tile))
        controller.view.backgroundColor = .clear
        controller.view.frame = WidgetLiveCardHost.viewFrame(widget, frame: frame, definition: context.definition)
        controllers[widget.id] = controller
        container?.addSubview(controller.view)
    }

    public func updateLiveCard(_ widget: Widget, frame: WorldRect) {
        updateLiveCard(widget, frame: frame, animated: false)
    }

    public func updateLiveCard(_ widget: Widget, frame: WorldRect, animated: Bool) {
        guard let controller = controllers[widget.id], let context = makeContext(widget) else { return }
        controller.rootView = root(context)
        let target = WidgetLiveCardHost.viewFrame(widget, frame: frame, definition: context.definition)
        guard animated else { controller.view.frame = target; return }
        UIView.animate(withDuration: CardMotion.layoutDuration, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            controller.view.frame = target
        }
    }

    public func moveLiveCard(_ widget: Widget, frame: WorldRect) {
        guard let controller = controllers[widget.id], let definition = WidgetRegistry.definition(for: widget.type) else { return }
        controller.view.frame = WidgetLiveCardHost.viewFrame(widget, frame: frame, definition: definition)
    }

    public func unmountLiveCard(id: String) {
        unmountLiveCard(id: id, animated: false)
    }

    public func unmountLiveCard(id: String, animated: Bool) {
        fittedHeights[id] = nil
        guard let controller = controllers.removeValue(forKey: id) else { return }
        guard animated else { controller.view.removeFromSuperview(); return }
        UIView.animate(withDuration: CardMotion.layoutDuration, delay: 0, options: [.beginFromCurrentState]) {
            controller.view.alpha = 0
        } completion: { _ in
            controller.view.removeFromSuperview()
        }
    }

    static func viewFrame(_ widget: Widget, frame: WorldRect, definition: WidgetDefinition) -> CGRect {
        let rect = WidgetCardView.mountFrame(for: widget, frame: frame, definition: definition)
        return CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
    }
}
#endif

// MARK: - Card context from a document

public extension BoardDocument {
    /// The card context for one widget on this document: edits go through
    /// `updateWidgetData`, commands through `runCommand`, doors through
    /// `navigate(to:)`.
    func cardContext(for widget: Widget, isTouch: Bool = false, glassAllowed: Bool = false, mint: IdMinter = .system) -> WidgetCardContext? {
        guard let definition = WidgetRegistry.definition(for: widget.type) else { return nil }
        let id = widget.id
        return WidgetCardContext(
            widget: widget,
            definition: definition,
            update: { [weak self] mutate in self?.updateWidgetData(id, mutate) },
            runCommand: { [weak self] key in self?.runCommand(id, key) },
            isTouch: isTouch,
            glassAllowed: glassAllowed,
            openCanvas: { [weak self] canvasId in self?.navigate(to: canvasId) },
            canvasName: { [weak self] canvasId in self?.canvasName(canvasId) },
            mint: mint
        )
    }
}

/// Lays one body out at the card's width and reports the height it needs
/// there (proposing no height asks for its natural size). The body is
/// placed at that height or the box's, whichever is taller, so a flexible
/// body still fills the card and a rigid one is never squeezed.
struct NaturalHeightLayout: Layout {
    var onNaturalHeight: ((CGFloat) -> Void)?

    private func natural(_ subviews: Subviews, width: CGFloat?) -> CGFloat {
        subviews.first?.sizeThatFits(ProposedViewSize(width: width, height: nil)).height ?? 0
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let height = natural(subviews, width: proposal.width)
        if proposal.width != nil { onNaturalHeight?(height) }
        return CGSize(width: proposal.width ?? 0, height: max(height, proposal.height ?? height))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let height = max(natural(subviews, width: bounds.width), bounds.height)
        subviews.first?.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: height))
    }
}
