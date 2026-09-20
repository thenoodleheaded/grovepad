import SwiftUI
import GrovepadCore
#if canImport(AppKit)
import AppKit
#else
import UIKit
#endif

// ---------------------------------------------------------------------------
// The glass constitution as SwiftUI (docs/widget-glass-constitution.md).
//
// One backplate (E0), islands raised on it (E1), wells cut into it (E−1).
// Concentric radii 22 / 10 / 8 from one formula, one light source (top-left),
// accent restraint (tint ~9%, the hairline, at most one hero). The system
// glass container is used ONLY inside the glass budget (roadmap decision 5)
// and never when the system asks for reduced transparency; every other card
// is a flat tinted material.
// ---------------------------------------------------------------------------

public enum GlassTokens {
    /// `--gp-r0` — backplate radius, chosen once.
    public static let r0: CGFloat = 22
    /// `--gp-p0` — backplate padding.
    public static let p0: CGFloat = 12
    /// `--gp-r1` = r0 − p0.
    public static let r1: CGFloat = 10
    public static let p1: CGFloat = 12
    /// `--gp-r2` = max(r1 − p1, 8).
    public static let r2: CGFloat = 8
    /// Seams between islands.
    public static let islandGap: CGFloat = 8
    /// Accent bloom mix on the backplate: felt, not seen.
    public static let accentBloom = 0.09
    /// The signature hairline along the top edge.
    public static let hairlineOpacity = 0.38
    /// The 44 pt floor under a coarse pointer.
    public static let touchTarget: CGFloat = 44

    /// `--gp-bg` — the app's ground, the colour behind everything. Dark is
    /// the web's near-black; light is the web's paper (`--gp-surface-canvas`
    /// under `[data-theme='light']`).
    public static let ground = Color.adaptive(light: Color(hex: "#f4f5f6"), dark: Color(hex: "#080a09"))
    /// The floating chrome plate (`gp-panel`): the ground lifted one step.
    /// Light is the web's sage panel, `oklch(96% 0.022 140)`.
    public static let plate = Color.adaptive(light: Color(hex: "#eef3eb"), dark: Color(red: 0.11, green: 0.11, blue: 0.12))
    /// The one border every plate, card and dialog wears.
    public static let stroke = Color.adaptive(light: Color.black.opacity(0.1), dark: Color.white.opacity(0.085))
    /// The shadow a floating surface casts: black on the dark ground, a
    /// green-grey ink on paper (`--gp-island-contact` in light).
    public static let shadow = Color.adaptive(light: Color(red: 30 / 255, green: 40 / 255, blue: 34 / 255).opacity(0.14), dark: Color.black.opacity(0.32))
    /// The halo floating chrome (pills, the account disc, the minimap)
    /// casts straight down onto the canvas, no offset: pronounced on paper so
    /// the white glass lifts off the light ground, quiet on dark.
    public static let floatShadow = Color.adaptive(light: Color(red: 20 / 255, green: 28 / 255, blue: 24 / 255).opacity(0.26), dark: Color.black.opacity(0.4))
    /// The edge of the canvas vignette: deep black on dark, a light ink on paper.
    public static let vignette = Color.adaptive(light: Color(red: 20 / 255, green: 28 / 255, blue: 24 / 255).opacity(0.12), dark: Color.black.opacity(0.55))
    /// The card's flat material, top-left to bottom-right: graphite on dark,
    /// the web's silver (`--gp-light-widget-bg`) on paper.
    public static let cardFill: [Color] = [
        .adaptive(light: Color(hex: "#fbfbfc"), dark: Color(red: 0.235, green: 0.24, blue: 0.25).opacity(0.97)),
        .adaptive(light: Color(hex: "#e9ebee"), dark: Color(red: 0.11, green: 0.11, blue: 0.12).opacity(0.985)),
    ]
    /// A resting tile's face on the Mac: glass that lets the aura glow
    /// through faintly — near-opaque so the grid never shows through, with
    /// no live blur (a per-tile backdrop filter cost the canvas its frame
    /// rate and made tiles vanish mid-zoom).
    public static let tileGlass: [Color] = [
        .adaptive(light: Color.white.opacity(0.86), dark: Color(red: 0.23, green: 0.24, blue: 0.26).opacity(0.86)),
        .adaptive(light: Color(hex: "#e9ebee").opacity(0.92), dark: Color(red: 0.10, green: 0.10, blue: 0.11).opacity(0.92)),
    ]
    /// The top-left light source on the card.
    public static let sheen = Color.adaptive(light: Color.white.opacity(0.7), dark: Color.white.opacity(0.10))
    /// E1 island: `--gp-island-fill` top and bottom stops.
    public static let islandFill: [Color] = [
        .adaptive(light: Color.white.opacity(0.78), dark: Color.white.opacity(0.16)),
        .adaptive(light: Color(red: 218 / 255, green: 224 / 255, blue: 220 / 255).opacity(0.38), dark: Color.white.opacity(0.08)),
    ]
    /// `--gp-island-catchlight` and `--gp-island-ring`.
    public static let catchlight = Color.adaptive(light: Color.white.opacity(0.9), dark: Color.white.opacity(0.07))
    public static let islandRing = Color.adaptive(light: Color(red: 42 / 255, green: 54 / 255, blue: 47 / 255).opacity(0.1), dark: Color.clear)
    /// E−1 well: a sunken screen, and the shade along its top lip.
    public static let wellFill = Color.adaptive(light: Color(red: 42 / 255, green: 54 / 255, blue: 47 / 255).opacity(0.07), dark: Color(red: 0.024, green: 0.031, blue: 0.027).opacity(0.72))
    public static let wellInset = Color.adaptive(light: Color.black.opacity(0.1), dark: Color.black.opacity(0.5))
    /// The selection ring a card wears (the web's selected-card glow).
    public static let selectionRing = Color(hex: "#f472b6")

    /// `r_child = max(r_parent − gap, 8)` — nobody picks a radius by hand.
    public static func childRadius(parent: CGFloat, gap: CGFloat) -> CGFloat {
        max(parent - gap, 8)
    }
}

/// Article XVII type hierarchy.
public enum GlassType {
    public static let label = Font.grove(size: 9.5, weight: .semibold)
    public static let value = Font.system(size: 16, weight: .semibold, design: .default).monospacedDigit()
    public static let hero = Font.grove(size: 27, weight: .bold)
    public static let heroUnit = Font.grove(size: 11.5, weight: .medium)
    public static let body = Font.grove(size: 13, weight: .medium)
}

// MARK: - Theme

public extension Color {
    /// A colour that follows the appearance it is resolved in: the window's
    /// (Mac), the trait collection's (iOS), or an `ImageRenderer`'s
    /// `colorScheme`. Everything themed is built from this one seam.
    static func adaptive(light: Color, dark: Color) -> Color {
        #if canImport(AppKit)
        let light = NSColor(light), dark = NSColor(dark)
        return Color(nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua, .vibrantDark, .vibrantLight, .accessibilityHighContrastDarkAqua, .accessibilityHighContrastAqua]).map { [.darkAqua, .vibrantDark, .accessibilityHighContrastDarkAqua].contains($0) } == true ? dark : light
        })
        #else
        let light = UIColor(light), dark = UIColor(dark)
        return Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? dark : light })
        #endif
    }

    /// `--gp-rest-lift`: the channel a card paints its own furniture in —
    /// tracks, empty rings, ticks, chip outlines, the pressed tint of a row.
    /// White on dark glass; on paper the identical rule would vanish, so it
    /// flips to the card's ink, `rgb(26 36 30)`. Always used with an opacity.
    static let lift = Color.adaptive(light: Color(red: 26 / 255, green: 36 / 255, blue: 30 / 255), dark: .white)
}

public extension Color {
    /// A chrome tint that was picked to glow on black (mint, rose, amber,
    /// violet) paired with its deep counterpart for paper.
    static func tone(_ dark: String, light: String) -> Color {
        .adaptive(light: Color(hex: light), dark: Color(hex: dark))
    }

    /// `--gp-rest-ink` / `--gp-rest-ink-share`: an accent used as a MARK.
    /// Accents are chosen to glow on black; on paper they land as a pale
    /// wash, so the light theme deepens them 46 % toward black (same hue,
    /// readable weight). Dark mixes nothing in.
    static func inked(_ hex: String) -> Color {
        let base = Color(hex: hex)
        let share = 0.46
        let resolved = base.resolve(in: EnvironmentValues())
        let deep = Color(
            red: Double(resolved.red) * (1 - share),
            green: Double(resolved.green) * (1 - share),
            blue: Double(resolved.blue) * (1 - share)
        )
        return .adaptive(light: deep, dark: base)
    }
}

// MARK: - Accent colour

public extension Color {
    /// `#rrggbb` / `#rgb` → Color. Anything unparseable is a neutral grey.
    init(hex: String) {
        var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("#") { text.removeFirst() }
        if text.count == 3 { text = text.map { "\($0)\($0)" }.joined() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else {
            self = Color(red: 0.25, green: 0.25, blue: 0.27)
            return
        }
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }
}

/// The resolved colour of a semantic tone against the card's accent.
public func restToneColor(_ tone: RestTone?, accent: Color) -> Color {
    switch tone {
    case .accent?: return accent
    case .muted?: return Color.primary.opacity(0.42)
    case .good?: return Color(hex: "#34d399")
    case .warn?: return Color(hex: "#f59e0b")
    case .bad?: return Color(hex: "#f87171")
    case .neutral?, nil: return Color.primary.opacity(0.9)
    }
}

// MARK: - Environment

private struct GlassBudgetKey: EnvironmentKey {
    static let defaultValue = false
}

private struct WidgetAccentKey: EnvironmentKey {
    static let defaultValue = Color(hex: "#3f3f46")
}

private struct TouchChromeKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    /// Inside the glass budget: this card may use the system glass container.
    var glassAllowed: Bool {
        get { self[GlassBudgetKey.self] }
        set { self[GlassBudgetKey.self] = newValue }
    }

    /// The card's accent, worn by islands, wells, chips and the title icon.
    var widgetAccent: Color {
        get { self[WidgetAccentKey.self] }
        set { self[WidgetAccentKey.self] = newValue }
    }

    /// A finger or Pencil is driving: wear the touch shape.
    var touchChrome: Bool {
        get { self[TouchChromeKey.self] }
        set { self[TouchChromeKey.self] = newValue }
    }
}

// MARK: - Touch target floor

private struct TouchTargetModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .frame(minWidth: GlassTokens.touchTarget, minHeight: GlassTokens.touchTarget)
            .contentShape(Rectangle())
    }
}

public extension View {
    /// The 44 pt floor every standalone control inherits (touch adaptation,
    /// question 2). Always on: a control that is only big enough under a
    /// finger is a control that was measured on the wrong hand.
    func touchTarget() -> some View {
        modifier(TouchTargetModifier())
    }
}

// MARK: - E0 backplate

/// The widget's single piece of glass. Accent bloom top-left, one border, the
/// hairline along the top edge, the only shadow cast to the canvas.
public struct GlassBackplate<Content: View>: View {
    private let accent: Color
    private let content: Content

    public init(accent: Color, @ViewBuilder content: () -> Content) {
        self.accent = accent
        self.content = content()
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous) }

    public var body: some View {
        // The open card wears the very glass its resting tile does (owner's
        // call, 18 Sep 2026): opening changes the size and the content, never
        // the surface — no Liquid Glass sampling that pops in, no tint
        // painted over the card. The accent stays the web's light touch.
        content.padding(GlassTokens.p0)
            .background(TileGlassSurface(accent: accent))
            .clipShape(shape)
            .shadow(color: GlassTokens.shadow, radius: 7, x: 0, y: 4)
            .environment(\.widgetAccent, accent)
    }
}

// MARK: - Tile glass

/// A card's one surface, resting or open: translucent glass on the Mac (the
/// board's glow shows through), the flat plate elsewhere; the top-left
/// sheen, a faint accent bloom, the hairline along the top and one rim.
public struct TileGlassSurface: View {
    let accent: Color

    public init(accent: Color) { self.accent = accent }

    public var body: some View {
        let shape = RoundedRectangle(cornerRadius: GlassTokens.r0, style: .continuous)
        ZStack {
            #if os(macOS)
            LinearGradient(colors: GlassTokens.tileGlass, startPoint: .topLeading, endPoint: .bottomTrailing)
            #else
            LinearGradient(colors: GlassTokens.cardFill, startPoint: .topLeading, endPoint: .bottomTrailing)
            #endif
            RadialGradient(colors: [GlassTokens.sheen.opacity(0.6), .clear], center: UnitPoint(x: 0.1, y: 0), startRadius: 0, endRadius: 140)
            RadialGradient(colors: [accent.opacity(GlassTokens.accentBloom * 1.6), .clear], center: UnitPoint(x: 0.12, y: -0.04), startRadius: 0, endRadius: 220)
            VStack(spacing: 0) {
                LinearGradient(colors: [.clear, accent.opacity(GlassTokens.hairlineOpacity), .clear], startPoint: .leading, endPoint: .trailing)
                    .frame(height: 1)
                    .padding(.horizontal, GlassTokens.r0)
                Spacer(minLength: 0)
            }
            shape.strokeBorder(
                LinearGradient(colors: [Color.lift.opacity(0.22), Color.lift.opacity(0.06)], startPoint: .top, endPoint: .bottom),
                lineWidth: 1
            )
        }
        .allowsHitTesting(false)
    }
}

// MARK: - E1 island

/// A content group raised on the backplate: lighter fill, 1 pt catch-light,
/// soft contact shadow, no full border. Never nested inside another island.
public struct Island<Content: View>: View {
    private let content: Content
    private let padding: CGFloat

    public init(padding: CGFloat = GlassTokens.p1, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: GlassTokens.r1, style: .continuous) }

    public var body: some View {
        content
            .padding(padding)
            .background(
                LinearGradient(colors: GlassTokens.islandFill, startPoint: .top, endPoint: .bottom)
            )
            .overlay(alignment: .top) {
                GlassTokens.catchlight.frame(height: 1).padding(.horizontal, GlassTokens.r1)
            }
            .overlay(shape.strokeBorder(GlassTokens.islandRing, lineWidth: 1))
            .clipShape(shape)
            .shadow(color: GlassTokens.shadow.opacity(0.6), radius: 2, x: 0, y: 1)
    }
}

// MARK: - E−1 well

/// A sunken screen for displayed values: inset top shadow, faint bottom lip.
public struct Well<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous) }

    public var body: some View {
        content
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(GlassTokens.wellFill)
            .overlay(alignment: .top) {
                LinearGradient(colors: [GlassTokens.wellInset, .clear], startPoint: .top, endPoint: .bottom).frame(height: 3)
            }
            .overlay(alignment: .bottom) {
                Color.lift.opacity(0.04).frame(height: 1)
            }
            .clipShape(shape)
    }
}

// MARK: - Label

/// Article XVII label: above its control, never inside.
public struct GlassLabel: View {
    private let text: String

    public init(_ text: String) { self.text = text }

    public var body: some View {
        Text(text.uppercased())
            .font(GlassType.label)
            .tracking(0.8)
            .foregroundStyle(Color.primary.opacity(0.42))
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Title row

/// The floating one-cell name row above the backplate (`WidgetCard.tsx`):
/// the accent icon chip, the name, and — on hover or while selected — the
/// card's own actions. Never sits on the glass.
public struct WidgetTitleRow: View {
    /// One header button (`WidgetCard.tsx` `visibleButtons`), in the web's
    /// order.
    public enum Action: String, CaseIterable, Sendable {
        case expand, pin, completed, favorite, delete

        /// The tooltip and accessibility label, the web's `btn.label`. The
        /// web's Text card says "Open writing view" and opens its writing
        /// sheet; that sheet is not ported, so here it says what it does.
        public func label(type: String) -> String {
            switch self {
            case .expand: return "Full screen"
            case .pin: return "Pin"
            case .completed: return "Completed"
            case .favorite: return "Favorite"
            case .delete: return "Delete"
            }
        }
    }

    /// `isButtonActive`: Pin everywhere except Canvas cards, Completed on
    /// checklists only, Full screen / Favorite / Delete on every card.
    public static func buttons(for type: String) -> [Action] {
        Action.allCases.filter { button in
            switch button {
            case .pin: return type != "canvas_node"
            case .completed: return type == "checklist"
            case .expand, .favorite, .delete: return true
            }
        }
    }

    public static let buttonSide: CGFloat = 26
    public static let buttonSpacing: CGFloat = 2
    public static let trailingPadding: CGFloat = 2

    /// The trailing span a card's action buttons occupy (the 26 pt buttons,
    /// their 2 pt gaps and the row's end padding). The canvas keeps presses
    /// there for the buttons; the rest of the strip is the move handle, as on
    /// the web (`titleAreaWidth` is the handle, the buttons sit after it).
    public static func actionsWidth(for type: String) -> CGFloat {
        let count = CGFloat(buttons(for: type).count)
        return count * buttonSide + max(0, count - 1) * buttonSpacing + trailingPadding
    }
    /// The leading icon tile (the skin button) and its padding.
    public static let iconCellWidth: CGFloat = 2 + 26 + 4

    @Environment(\.touchChrome) private var touchChrome
    private let title: String
    private let accent: Color
    private let symbol: String
    private let skinLabel: String?
    private let locked: Bool
    private let pinned: Bool
    private let favorite: Bool
    private let showsActions: Bool
    private let actions: WidgetCardActions?
    private let onSkinTap: (() -> Void)?

    public init(title: String, accent: Color, symbol: String = "square.dashed", skinLabel: String? = nil, locked: Bool = false, pinned: Bool = false, favorite: Bool = false, showsActions: Bool = false, actions: WidgetCardActions? = nil, onSkinTap: (() -> Void)? = nil) {
        self.title = title
        self.accent = accent
        self.symbol = symbol
        self.skinLabel = skinLabel
        self.locked = locked
        self.pinned = pinned
        self.favorite = favorite
        self.showsActions = showsActions
        self.actions = actions
        self.onSkinTap = onSkinTap
    }

    public var body: some View {
        HStack(spacing: 8) {
            Button(action: { onSkinTap?() }) {
                Image(systemName: symbol)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(accent)
                    .frame(width: 26, height: 26)
                    .background(accent.opacity(0.14), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(accent.opacity(0.28), lineWidth: 1))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(skinLabel.map { "Skin: \($0). Change skin" } ?? "Widget icon")
            .disabled(onSkinTap == nil)
            .help(skinLabel.map { "Skin: \($0)" } ?? "")
            if let actions, actions.isRenaming {
                TitleRenameField(title: title, finish: actions.finishRename)
            } else {
                Text(title.isEmpty ? "Untitled" : title)
                    .font(.grove(size: 13, weight: .semibold))
                    .lineLimit(1)
                    .foregroundStyle(Color.primary.opacity(0.92))
            }
            if locked { Image(systemName: "lock.fill").font(.system(size: 9)).foregroundStyle(.secondary) }
            if pinned, !showsActions { Image(systemName: "pin.fill").font(.system(size: 9)).foregroundStyle(.secondary) }
            if favorite, !showsActions { Image(systemName: "star.fill").font(.system(size: 9)).foregroundStyle(Color(hex: "#fbbf24")) }
            Spacer(minLength: 0)
            if showsActions, let actions {
                HStack(spacing: WidgetTitleRow.buttonSpacing) {
                    ForEach(WidgetTitleRow.buttons(for: actions.widgetType), id: \.self) { button in
                        titleAction(button, actions: actions)
                    }
                }
                .transition(.opacity)
            }
        }
        .frame(height: CGFloat(CanvasGeometry.gridSize))
        .padding(.horizontal, WidgetTitleRow.trailingPadding)
    }

    /// `handleButtonClick` and the web's toggled look: a set Pin, Completed
    /// or Favorite wears the card's accent with its glyph filled; the pin is
    /// tilted 45°.
    private func titleAction(_ button: Action, actions: WidgetCardActions) -> some View {
        let label = button.label(type: actions.widgetType)
        switch button {
        case .expand:
            return TitleAction("arrow.up.left.and.arrow.down.right", label: label, action: actions.expand)
        case .pin:
            return TitleAction(pinned ? "pin.fill" : "pin", label: label, tint: pinned ? accent : nil, rotation: 45, isOn: pinned, action: actions.togglePinned)
        case .completed:
            return TitleAction("checkmark", label: label, tint: actions.isCompleted ? accent : nil, isOn: actions.isCompleted, action: actions.toggleCompleted)
        case .favorite:
            return TitleAction(favorite ? "star.fill" : "star", label: label, tint: favorite ? accent : nil, isOn: favorite, action: actions.toggleFavorite)
        case .delete:
            return TitleAction("trash", label: label, action: actions.delete)
        }
    }
}

/// The name, editable in place (the web's inline title input): focused on
/// appear with the text selected; Return saves, Escape or losing focus
/// without a change cancels, and a blank name keeps the old one.
struct TitleRenameField: View {
    let title: String
    let finish: (String?) -> Void
    @State private var draft: String
    @State private var finished = false
    @FocusState private var focused: Bool

    init(title: String, finish: @escaping (String?) -> Void) {
        self.title = title
        self.finish = finish
        _draft = State(initialValue: title)
    }

    var body: some View {
        TextField("Name", text: $draft)
            .textFieldStyle(.plain)
            .font(.grove(size: 13, weight: .semibold))
            .foregroundStyle(Color.primary)
            .padding(.horizontal, 6)
            .frame(height: 24)
            .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .frame(maxWidth: 220)
            .focused($focused)
            .onAppear { focused = true }
            .onSubmit { end(save: true) }
            .onKeyPress(.escape) { end(save: false); return .handled }
            .onChange(of: focused) { _, isFocused in if !isFocused { end(save: true) } }
            .accessibilityLabel("Widget name")
    }

    private func end(save: Bool) {
        guard !finished else { return }
        finished = true
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        finish(save && !trimmed.isEmpty && trimmed != title ? trimmed : nil)
    }
}

/// One header action: a quiet icon that lights on hover, with a tooltip.
struct TitleAction: View {
    @State private var hovering = false
    private let symbol: String
    private let label: String
    private let tint: Color?
    private let rotation: Double
    private let isOn: Bool?
    private let action: () -> Void

    init(_ symbol: String, label: String, tint: Color? = nil, rotation: Double = 0, isOn: Bool? = nil, action: @escaping () -> Void) {
        self.symbol = symbol
        self.label = label
        self.tint = tint
        self.rotation = rotation
        self.isOn = isOn
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .medium))
                .rotationEffect(.degrees(rotation))
                .foregroundStyle(tint ?? Color.primary.opacity(hovering ? 0.9 : 0.5))
                .frame(width: WidgetTitleRow.buttonSide, height: WidgetTitleRow.buttonSide)
                .background(Color.lift.opacity(hovering ? 0.1 : 0), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
        .help(label)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isOn == true ? .isSelected : [])
    }
}

// MARK: - Small shared controls

/// A ghost button: no fill at rest, a subtle press tint, a 44 pt hit area.
/// Article XIX: a button inside an island never paints a second surface.
public struct GhostButton: View {
    private let symbol: String
    private let label: String
    private let action: () -> Void

    public init(_ symbol: String, label: String, action: @escaping () -> Void) {
        self.symbol = symbol
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.primary.opacity(0.8))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .touchTarget()
    }
}

/// The bare identity mark an empty card rests as, and an icon shows.
public struct RestIconGlyph: View {
    private let accent: String
    private let symbol: String

    /// `symbol` is the type's own mark (`WidgetSymbols`). The default is the
    /// placeholder, for a glyph with no type behind it.
    public init(accent: String, symbol: String = "square.dashed") {
        self.accent = accent
        self.symbol = symbol
    }

    /// The mark's share of the tile's shorter side: 26 pt on the 80 pt icon,
    /// and the same proportion at every size, so a bigger icon is the same
    /// icon made bigger (the web's glyph is likewise a fixed share of its box).
    static let glyphShare = 26.0 / 80.0

    public var body: some View {
        GeometryReader { proxy in
            glyph(size: min(proxy.size.width, proxy.size.height) * RestIconGlyph.glyphShare)
        }
    }

    private func glyph(size: Double) -> some View {
        Image(systemName: symbol)
            .font(.system(size: max(1, size), weight: .medium))
            // Inked on paper like every other resting mark (the web's
            // identity icon mixes in `--gp-rest-ink`); dark keeps the lit accent.
            .foregroundStyle(Color.inked(accent))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
