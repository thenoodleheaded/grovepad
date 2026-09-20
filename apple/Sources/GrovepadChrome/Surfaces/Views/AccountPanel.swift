import SwiftUI

// ---------------------------------------------------------------------------
// The account panel: pressing the floating account button (signed in)
// stretches it sideways into a glass pill — the button's own 40 pt circle
// widening to the right at the same height, its avatar staying put at the
// left end, name / plan badge / email appearing beside it. Under the pill a
// row of round glass buttons pops in one by one: Settings and light/dark
// (drawn here) then the app's own (Cloud sync, Log out). The pill's body and
// the extra buttons are the app target's (`SettingsModel.accountPanelContent`);
// this file owns the shell, the motion and the ways out: a click outside,
// Escape, the avatar again.
// ---------------------------------------------------------------------------

/// What the panel body can ask the shell to do.
public struct AccountPanelActions {
    /// Shrink the panel back into the button.
    public let close: () -> Void
    /// Close, then open Settings at Account.
    public let openAllSettings: () -> Void

    public init(close: @escaping () -> Void, openAllSettings: @escaping () -> Void) {
        self.close = close
        self.openAllSettings = openAllSettings
    }
}

/// One round button under the card.
public struct AccountPanelButton: Identifiable {
    public let id: String
    public let symbol: String
    /// Tooltip and VoiceOver label.
    public let label: String
    /// Lit (a switch that is on).
    public let isOn: Bool
    /// Drawn in red (Log out).
    public let destructive: Bool
    public let action: () -> Void

    public init(id: String, symbol: String, label: String, isOn: Bool = false, destructive: Bool = false, action: @escaping () -> Void) {
        self.id = id
        self.symbol = symbol
        self.label = label
        self.isOn = isOn
        self.destructive = destructive
        self.action = action
    }
}

/// What the app supplies: the pill's body (laid out at its natural width,
/// 40 pt tall, avatar first) and the buttons it adds after Settings and
/// light/dark.
public struct AccountPanelParts {
    public let card: AnyView
    public let buttons: [AccountPanelButton]

    public init(card: AnyView, buttons: [AccountPanelButton]) {
        self.card = card
        self.buttons = buttons
    }
}

/// The layer drawn over the canvas chrome, aligned with the floating account
/// button (same leading/top inset).
public struct AccountPanelLayer: View {
    private let chrome: ChromeState
    private let settings: SettingsModel

    public init(chrome: ChromeState, settings: SettingsModel) {
        self.chrome = chrome
        self.settings = settings
    }

    public var body: some View {
        if chrome.accountPanelOpen, let content = settings.accountPanelContent {
            AccountPanelShell(chrome: chrome, settings: settings, content: content)
        }
    }
}

private struct AccountPanelShell: View {
    let chrome: ChromeState
    let settings: SettingsModel
    let content: (AccountPanelActions) -> AccountPanelParts
    @Environment(\.colorScheme) private var colorScheme
    #if os(macOS)
    @Environment(\.openSettings) private var openSettings
    #endif
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    /// false while growing in and while shrinking back.
    @State private var expanded = false
    @State private var bodyWidth: CGFloat = 240

    static let buttonSide: CGFloat = 40

    private var motion: Animation { reduceMotion ? .easeOut(duration: 0.12) : .smooth(duration: 0.2) }

    var body: some View {
        ZStack(alignment: .topLeading) {
            // A click anywhere else closes it (the canvas is not touched).
            Color.clear
                .contentShape(Rectangle())
                .ignoresSafeArea()
                .onTapGesture(perform: close)
                .accessibilityHidden(true)
            let parts = content(actions)
            VStack(alignment: .leading, spacing: 10) {
                panel(parts.card)
                buttonRow(parts.buttons)
            }
            .padding(.leading, 14)
            .padding(.top, 8)
        }
        .onAppear { withAnimation(motion) { expanded = true } }
        // The button pressed again while open.
        .onChange(of: chrome.accountPanelOpen) { _, open in if !open { expanded = false } }
    }

    private var actions: AccountPanelActions {
        AccountPanelActions(close: close, openAllSettings: {
            close()
            #if os(macOS)
            chrome.settingsSection = .account
            openSettings()
            #else
            chrome.openSettings(.account)
            #endif
        })
    }

    private var shape: Capsule { Capsule() }

    /// Settings, light/dark, then the app's buttons.
    private func buttonRow(_ extra: [AccountPanelButton]) -> some View {
        let dark = colorScheme == .dark
        let buttons = [
            AccountPanelButton(id: "settings", symbol: "gearshape", label: "All settings (⌘,)", action: actions.openAllSettings),
            // Flips what is on screen, so "System" never makes it a no-op.
            AccountPanelButton(id: "appearance", symbol: dark ? "moon.fill" : "sun.max.fill", label: dark ? "Switch to light" : "Switch to dark") { [settings] in
                settings.update { $0.appearance = dark ? .light : .dark }
            },
        ] + extra
        return HStack(spacing: 10) {
            ForEach(Array(buttons.enumerated()), id: \.element.id) { index, button in
                RoundPanelButton(button: button, reduceTransparency: reduceTransparency)
                    .scaleEffect(expanded ? 1 : 0.5, anchor: .top)
                    .opacity(expanded ? 1 : 0)
                    .animation(expanded ? motion.delay(reduceMotion ? 0 : 0.06 + 0.03 * Double(index)) : .easeOut(duration: 0.08), value: expanded)
            }
        }
    }

    private func panel(_ card: AnyView) -> some View {
        let side = Self.buttonSide
        return Color.clear
            .frame(width: expanded ? bodyWidth : side, height: side)
            .overlay(alignment: .leading) {
                card
                    .frame(height: side)
                    .fixedSize(horizontal: true, vertical: false)
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { bodyWidth = max($0, side) }
                    .opacity(expanded ? 1 : 0)
                    .animation(expanded ? motion.delay(reduceMotion ? 0 : 0.04) : .easeOut(duration: 0.08), value: expanded)
                    // Escape closes, as every menu does.
                    .background {
                        Button("Close", action: close).keyboardShortcut(.cancelAction).hidden()
                    }
            }
            .clipShape(shape)
            .modifier(PanelGlass(shape: shape, reduceTransparency: reduceTransparency))
            .contentShape(shape)
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Account")
    }

    private func close() {
        guard expanded || chrome.accountPanelOpen else { return }
        withAnimation(motion, completionCriteria: .logicallyComplete) {
            expanded = false
        } completion: {
            chrome.accountPanelOpen = false
        }
    }
}

private struct PanelGlass: ViewModifier {
    let shape: Capsule
    let reduceTransparency: Bool

    func body(content: Content) -> some View {
        Group {
            if reduceTransparency {
                content
                    .background(GlassTokens.plate, in: shape)
                    .overlay(shape.stroke(GlassTokens.stroke, lineWidth: 1))
            } else {
                content.glassEffect(.regular, in: shape)
            }
        }
        .shadow(color: GlassTokens.floatShadow, radius: 18, x: 0, y: 8)
    }
}

private struct RoundPanelButton: View {
    let button: AccountPanelButton
    let reduceTransparency: Bool

    var body: some View {
        Button(action: button.action) {
            Image(systemName: button.symbol)
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(button.destructive ? Color.tone("#fca5a5", light: "#b91c1c") : button.isOn ? Color.tone("#86efac", light: "#15803d") : Color.primary.opacity(0.8))
                .frame(width: 40, height: 40)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .modifier(RoundGlass(lit: button.isOn, reduceTransparency: reduceTransparency))
        .help(button.label)
        .accessibilityLabel(button.label)
        .accessibilityAddTraits(button.isOn ? .isSelected : [])
    }
}

private struct RoundGlass: ViewModifier {
    let lit: Bool
    let reduceTransparency: Bool

    func body(content: Content) -> some View {
        Group {
            if reduceTransparency {
                content
                    .background(lit ? Color(hex: "#22c55e").opacity(0.2) : GlassTokens.plate, in: Circle())
                    .overlay(Circle().stroke(GlassTokens.stroke, lineWidth: 1))
            } else {
                content.glassEffect(lit ? .regular.tint(Color(hex: "#22c55e").opacity(0.22)).interactive() : .regular.interactive(), in: Circle())
            }
        }
        .shadow(color: GlassTokens.floatShadow, radius: 9, x: 0, y: 0)
    }
}
