import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Touch adaptation (docs/touch-adaptation.md, roadmap decision 10) as pure
// rules: `utils/adaptiveChrome.ts`, `utils/adaptiveInput.ts` and the
// thresholds of `utils/tapGesture.ts`. Every SwiftUI surface reads
// `\.chromeAdaptation` for its four answers and places its panel with
// `.chromePanel(isPresented:)` — one recipe, never a twelfth copy.
// ---------------------------------------------------------------------------

/// `ViewportClass`: room, never a guessed device model.
public enum ViewportClass: String, Sendable, CaseIterable {
    case phone, tablet, desktop
}

/// `ActiveInput`: the last input actually used.
public enum ActiveInput: String, Sendable {
    case mouse, touch, pen, keyboard
}

/// `InteractionMode`: the canvas tool in force.
public enum InteractionMode: String, Sendable, CaseIterable {
    case navigate, select, connect
}

/// `useTouchChrome()` as a value: the four answers every surface asks for.
public struct ChromeAdaptation: Equatable, Sendable {
    public var viewportClass: ViewportClass
    public var activeInput: ActiveInput
    public var interactionMode: InteractionMode
    /// Points, for the short-viewport minimap rule.
    public var viewportHeight: Double

    public init(viewportClass: ViewportClass, activeInput: ActiveInput = .mouse, interactionMode: InteractionMode = .navigate, viewportHeight: Double = 800) {
        self.viewportClass = viewportClass
        self.activeInput = activeInput
        self.interactionMode = interactionMode
        self.viewportHeight = viewportHeight
    }

    /// Derive from a measured window size, as `deriveAdaptiveInputCapabilities` does.
    public init(width: Double, height: Double = 800, activeInput: ActiveInput = .mouse, interactionMode: InteractionMode = .navigate) {
        self.init(viewportClass: ChromeAdaptation.viewportClass(forWidth: width), activeInput: activeInput, interactionMode: interactionMode, viewportHeight: height)
    }

    /// `viewportClassForWidth`: under 640 pt one column, under 1024 tablet.
    public static func viewportClass(forWidth width: Double) -> ViewportClass {
        if width < 640 { return .phone }
        if width < 1024 { return .tablet }
        return .desktop
    }

    /// Under 640 pt: one column, full-width sheets, no hover chrome.
    public var isPhone: Bool { viewportClass == .phone }

    /// `usesTouchCanvasChrome`: a finger or Pencil is driving — every phone
    /// and tablet, and a desktop-width screen once one is used.
    public var touchChrome: Bool { ChromeAdaptation.usesTouchCanvasChrome(viewportClass, activeInput) }

    public static func usesTouchCanvasChrome(_ viewportClass: ViewportClass, _ activeInput: ActiveInput) -> Bool {
        viewportClass != .desktop || activeInput == .touch || activeInput == .pen
    }

    /// `modeDockShowsHistory`: Undo/Redo ride in the dock where the zoom
    /// row dropped its own pair (phone and tablet).
    public static func modeDockShowsHistory(_ viewportClass: ViewportClass) -> Bool {
        viewportClass != .desktop
    }

    /// `isCanvasTabRowVisible`: never on a phone; otherwise only with
    /// something to switch between.
    public static func isCanvasTabRowVisible(_ viewportClass: ViewportClass, openTabCount: Int) -> Bool {
        viewportClass != .phone && openTabCount > 1
    }

    /// `isMinimapExpanded`: compact viewports open it for the visit only.
    public static func isMinimapExpanded(_ viewportClass: ViewportClass, desktopCollapsed: Bool, compactExpanded: Bool, shortViewport: Bool = false) -> Bool {
        viewportClass == .phone || shortViewport ? compactExpanded : !desktopCollapsed
    }

    /// `offersSelectMore`: a finger has no Shift, so Navigate mode offers
    /// "Select more"; Select already adds, Connect would drop the wiring.
    public static func offersSelectMore(touchChrome: Bool, interactionMode: InteractionMode) -> Bool {
        touchChrome && interactionMode == .navigate
    }

    /// The short-viewport threshold the minimap reads (`viewportHeight < 560`).
    public var isShortViewport: Bool { viewportHeight < 560 }

    /// Keyboard hints only where a keyboard is plausible. A phone is never
    /// one: `activeInput` starts at `.mouse` and a simulator's tap arrives
    /// as a click, so input alone told an iPhone it could press ⌘K.
    public var hasKeyboardHints: Bool { !isPhone && (activeInput == .mouse || activeInput == .keyboard) }
}

// MARK: - Press vocabulary (`utils/tapGesture.ts`)

/// The only copy of the tap thresholds on this side. Long press shares the
/// canvas gesture engine's numbers so a held card and a held canvas agree.
public enum TapVocabulary {
    public static let tapSlopPx = 8.0
    public static let doubleTapMs = 300.0
    public static let doubleTapSlopPx = 28.0
    public static let longPressMs = GestureTuning.longPressMs

    public enum Kind: Equatable { case tap, doubleTap, moved }

    /// `tapTravelled`: a press that moved past the slop is a drag. The web
    /// measures a BOX, one axis at a time (`Math.abs(dx) > slop ||
    /// Math.abs(dy) > slop`), not a radius — a fingertip rolling 6 pt on each
    /// axis is still holding still. The canvas gesture engine's long-press
    /// cancel is a radius (`Math.hypot`); these are deliberately different.
    public static func travelled(from: Vector2D, to: Vector2D, slop: Double = tapSlopPx) -> Bool {
        abs(to.x - from.x) > slop || abs(to.y - from.y) > slop
    }

    /// `classifyTap`: a second tap within the window and the double-tap slop
    /// of the previous one pairs into a double tap.
    public static func classify(down: Vector2D, up: Vector2D, upAtMs: Double, previousTap: (point: Vector2D, atMs: Double)?) -> Kind {
        if travelled(from: down, to: up) { return .moved }
        if let previous = previousTap, upAtMs - previous.atMs <= doubleTapMs, !travelled(from: previous.point, to: up, slop: doubleTapSlopPx) {
            return .doubleTap
        }
        return .tap
    }
}

// MARK: - Environment

private struct ChromeAdaptationKey: EnvironmentKey {
    static let defaultValue = ChromeAdaptation(viewportClass: .desktop)
}

public extension EnvironmentValues {
    /// The one place a surface asks what it is being used with.
    var chromeAdaptation: ChromeAdaptation {
        get { self[ChromeAdaptationKey.self] }
        set { self[ChromeAdaptationKey.self] = newValue }
    }
}

// MARK: - Panel placement

/// Where a temporary panel sits (popup panel design §4, §12).
public enum PanelPlacement: Equatable, Sendable {
    /// Phone: pinned to the bottom edge, full width, safe-area padded.
    case bottomSheet
    /// An anchored menu or picker on a wide screen.
    case popover
    /// A centred dialog on a wide screen.
    case centeredDialog

    /// The rule: a phone always gets the sheet; otherwise anchored surfaces
    /// pop over and everything else centres.
    public static func resolve(isPhone: Bool, anchored: Bool) -> PanelPlacement {
        if isPhone { return .bottomSheet }
        return anchored ? .popover : .centeredDialog
    }
}

/// What every chrome surface stands on, wherever it is presented.
///
/// A presented container (a sheet, a popover) keeps the system page behind
/// it unless it is told otherwise, so the app's ground is laid under every
/// panel here, once. The ground, the plate and every `Color.lift` fill are
/// adaptive, so the one surface serves the dark and the light theme alike;
/// the appearance itself is chosen at the scene root (`Appearance`).
public struct ChromeSurface<Content: View>: View {
    private let content: Content
    private let fillsScreen: Bool

    public init(fillsScreen: Bool = true, @ViewBuilder content: () -> Content) {
        self.fillsScreen = fillsScreen
        self.content = content()
    }

    public var body: some View {
        content
            .background(GlassTokens.ground.ignoresSafeArea())
            .frame(maxWidth: fillsScreen ? .infinity : nil)
    }
}

public extension View {
    /// The app's ground and appearance under one surface. Applied by
    /// `chromePanel` to everything it presents and by `RootScene` to the
    /// whole scene; a surface hosted some other way applies it itself.
    func chromeSurface(fillsScreen: Bool = true) -> some View {
        ChromeSurface(fillsScreen: fillsScreen) { self }
    }
}

private struct ChromePanelModifier<Panel: View>: ViewModifier {
    @Environment(\.chromeAdaptation) private var adaptation
    @Binding var isPresented: Bool
    let anchored: Bool
    let panel: () -> Panel

    /// The presented content: the panel on the app's ground, in the app's
    /// appearance, carrying the adaptation down to its own controls.
    @ViewBuilder private func surface(fillsScreen: Bool) -> some View {
        panel()
            .environment(\.chromeAdaptation, adaptation)
            .environment(\.touchChrome, adaptation.touchChrome)
            .chromeSurface(fillsScreen: fillsScreen)
    }

    func body(content: Content) -> some View {
        switch PanelPlacement.resolve(isPhone: adaptation.isPhone, anchored: anchored) {
        case .bottomSheet:
            content.sheet(isPresented: $isPresented) {
                surface(fillsScreen: true)
                    .padding(.bottom, 8)
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(GlassTokens.ground)
            }
        case .popover:
            content.popover(isPresented: $isPresented) {
                surface(fillsScreen: false)
                    .presentationCompactAdaptation(.popover)
            }
        case .centeredDialog:
            content.sheet(isPresented: $isPresented) {
                surface(fillsScreen: false)
                    .presentationBackground(GlassTokens.ground)
            }
        }
    }
}

public extension View {
    /// Every temporary surface is placed through this one modifier: a
    /// bottom sheet on phones (full width, drag indicator, safe-area padding
    /// from the system sheet), a popover when `anchored`, else a centred
    /// dialog. The presented content inherits the adaptation and the touch
    /// flag, so a sheet's controls wear the same 44 pt floor as the page.
    func chromePanel<Panel: View>(isPresented: Binding<Bool>, anchored: Bool = false, @ViewBuilder panel: @escaping () -> Panel) -> some View {
        modifier(ChromePanelModifier(isPresented: isPresented, anchored: anchored, panel: panel))
    }
}

// MARK: - Shared chrome material

/// The floating chrome plate (`gp-panel` + `gp-toolbar`). On Apple
/// platforms it is the system's own Liquid Glass — the same material the
/// window toolbar, the Dock and Control Centre are made of — so the canvas
/// chrome reads as part of the OS rather than a web panel laid over it.
/// Reduce Transparency gets the opaque plate the web draws.
public struct ChromePlate<Content: View>: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    private let content: Content
    private let padding: CGFloat

    /// Every floating plate is a capsule: nothing in the main chrome reads
    /// as a rectangle. `radius` is kept for callers; the shape ignores it.
    public init(padding: CGFloat = 4, radius: CGFloat = 18, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    public var body: some View {
        content
            .padding(padding)
            .floatingPill()
    }
}

/// A chrome button: symbol, optional word, the 44 pt floor, a pressed tint.
public struct ChromeButton: View {
    private let symbol: String
    private let label: String
    private let showsLabel: Bool
    private let pressed: Bool
    private let danger: Bool
    private let disabled: Bool
    private let action: () -> Void

    public init(_ symbol: String, label: String, showsLabel: Bool = false, pressed: Bool = false, danger: Bool = false, disabled: Bool = false, action: @escaping () -> Void) {
        self.symbol = symbol
        self.label = label
        self.showsLabel = showsLabel
        self.pressed = pressed
        self.danger = danger
        self.disabled = disabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
                if showsLabel { Text(label).font(.grove(size: 12, weight: .medium)) }
            }
            .foregroundStyle(danger ? Color.tone("#fca5a5", light: "#b91c1c") : pressed ? Color.tone("#6ee7b7", light: "#047857") : Color.primary.opacity(0.82))
            .padding(.horizontal, showsLabel ? 10 : 0)
            .frame(minWidth: GlassTokens.touchTarget, minHeight: GlassTokens.touchTarget)
            .background(pressed ? Color(hex: "#34d399").opacity(0.14) : .clear, in: Capsule())
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .opacity(disabled ? 0.35 : 1)
        .accessibilityLabel(label)
        .accessibilityAddTraits(pressed ? .isSelected : [])
    }
}
