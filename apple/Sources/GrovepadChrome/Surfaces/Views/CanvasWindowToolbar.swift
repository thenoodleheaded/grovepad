import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The web's top bar (`CanvasToolbar.tsx`), split up for regular widths.
// There is no bar: what stays in the title-bar row floats as system glass
// over the canvas next to the traffic lights —
//
//   leading    the grovepad wordmark
//   trailing   Search · Undo/Redo, each its own pill
//
// Navigation (back/forward, workspace, canvas path) is the bottom-left
// `CanvasNavigationPill`; the account floats under the traffic lights
// (`FloatingAccountButton`). Double-clicking empty canvas shapes a tree;
// adding one widget is ⌘N or the palette; Circuit mode is W / View ▸ Circuit Mode.
//
// Phones keep `CanvasToolbarView` (there is no window toolbar to speak of).
// ---------------------------------------------------------------------------

public struct CanvasWindowToolbar: ToolbarContent {
    private let model: ToolbarModel
    private let settings: SettingsModel

    /// Every floating control in the row is this tall. The Undo/Redo pill's
    /// end caps are inset so each glyph sits as far from the rim as from the
    /// divide between them, like the search glyph in its circle.
    static let height: CGFloat = 36
    static let pillInset: CGFloat = 6

    public init(model: ToolbarModel, settings: SettingsModel) {
        self.model = model
        self.settings = settings
    }

    public var body: some ToolbarContent {
        leading
        #if !os(macOS)
        trailing
        #endif
    }

    @ToolbarContentBuilder
    private var leading: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            GrovepadWordmark()
                .padding(.horizontal, 6)
        }
        .sharedBackgroundVisibility(.hidden)
    }

    #if !os(macOS)
    @ToolbarContentBuilder
    private var trailing: some ToolbarContent {
        // iPad: the actions stay in the window toolbar. The Mac floats them
        // over the canvas instead (`CanvasTrailingControls`), where their
        // margins are ours and not the title bar's.
        ToolbarSpacer(.flexible, placement: .primaryAction)
        ToolbarItem(placement: .primaryAction) {
            CanvasTrailingControls(model: model, height: CanvasWindowToolbar.height)
        }
        .sharedBackgroundVisibility(.hidden)
    }
    #endif
}

/// Search, then Undo/Redo, each its own glass pill.
public struct CanvasTrailingControls: View {
    let model: ToolbarModel
    let height: CGFloat

    public init(model: ToolbarModel, height: CGFloat = CanvasTrailingControls.macHeight) {
        self.model = model
        self.height = height
    }

    /// On the Mac the controls float over the canvas at this size, the same
    /// distance (`macMargin`) from the window's top and right edges.
    public static let macHeight: CGFloat = 44
    public static let macMargin: CGFloat = 10

    private var inset: CGFloat { (height * 6 / 36).rounded() }

    public var body: some View {
        HStack(spacing: 10) {
            // A circle, the same height as the Undo/Redo pill beside it.
            Button { model.openPalette() } label: {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: height * 15 / 36, weight: .semibold))
                    .frame(width: height, height: height)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .floatingPill(in: Circle())
            .help("Search and commands (⌘K)")
            .accessibilityLabel("Search")

            HStack(spacing: 0) {
                pillButton("arrow.uturn.backward", label: "Undo", help: "Undo (⌘Z)", enabled: model.canUndo) { model.undo() }
                pillButton("arrow.uturn.forward", label: "Redo", help: "Redo (⇧⌘Z)", enabled: model.canRedo) { model.redo() }
            }
            .padding(.horizontal, inset)
            .floatingPill()
        }
    }

    private func pillButton(_ symbol: String, label: String, help: String, enabled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: height * 14 / 36, weight: .semibold))
                .frame(width: height - inset, height: height)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
        .help(help)
        .accessibilityLabel(label)
    }
}

/// Opens Settings: the Settings window on a Mac (⌘,), the settings panel
/// elsewhere. `section` preselects a destination (Account).
struct SettingsToolbarButton<LabelContent: View>: View {
    #if os(macOS)
    @Environment(\.openSettings) private var openSettings
    #endif
    let section: SettingsSection?
    let chrome: ChromeState
    @ViewBuilder let label: () -> LabelContent

    var body: some View {
        Button {
            #if os(macOS)
            if let section { chrome.settingsSection = section }
            openSettings()
            #else
            chrome.openSettings(section)
            #endif
        } label: {
            label()
        }
    }
}

/// The account chip: the first letter of the signed-in profile name on a
/// disc of the profile colour (emerald and the email's letter when there is
/// no profile yet), or the system's person glyph for a guest.
public struct AccountAvatar: View {
    let account: SettingsModel.AccountStatus
    var badge: SettingsModel.AccountBadge?
    var size: CGFloat = 20

    public init(account: SettingsModel.AccountStatus, badge: SettingsModel.AccountBadge? = nil, size: CGFloat = 20) {
        self.account = account
        self.badge = badge
        self.size = size
    }

    public var body: some View {
        switch account {
        case .signedOut:
            Label("Account", systemImage: "person.crop.circle")
                .font(.system(size: size, weight: .regular))
        case .signedIn(let email):
            Label {
                Text("Account")
            } icon: {
                let hex = badge?.colorHex ?? "#34d399"
                Text(AccountAvatar.initial(badge?.name ?? email))
                    .font(.grove(size: size * 0.72, weight: .semibold))
                    .foregroundStyle(badge == nil ? Color.tone("#6ee7b7", light: "#047857") : Color.inked(hex))
                    .frame(width: size * 1.35, height: size * 1.35)
                    .background(Color(hex: hex).opacity(0.16), in: Circle())
                    .overlay(Circle().strokeBorder(Color(hex: hex).opacity(0.28), lineWidth: 1))
            }
        }
    }

    /// The first letter or digit of the name, capitalised; "?" when none.
    static func initial(_ name: String) -> String {
        guard let first = name.first(where: { $0.isLetter || $0.isNumber }) else { return "?" }
        return String(first).uppercased()
    }
}

/// The web toolbar's identity mark (`CanvasToolbar.tsx`): "grove" in ink,
/// "pad" in the emerald→cyan gradient, bold and tight (the web's status dot
/// is left out here).
public struct GrovepadWordmark: View {
    public init() {}

    public var body: some View {
        HStack(spacing: 0) {
            Text("grove").foregroundStyle(Color.primary.opacity(0.9))
            Text("pad").foregroundStyle(LinearGradient(colors: [Color(hex: "#34d399"), Color(hex: "#22d3ee")], startPoint: .leading, endPoint: .trailing))
        }
        .font(.grove(size: 15, weight: .bold))
        .tracking(-0.3)
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("grovepad")
    }
}

/// The account, floating under the traffic lights on its own glass circle.
/// A guest is taken to the full-window sign-in scene (when the app supplies
/// one); a signed-in person grows the account panel out of it
/// (`AccountPanelLayer`), or gets Settings at Account when the app supplies
/// no panel.
public struct FloatingAccountButton: View {
    private let chrome: ChromeState
    private let settings: SettingsModel

    public init(chrome: ChromeState, settings: SettingsModel) {
        self.chrome = chrome
        self.settings = settings
    }

    private var account: SettingsModel.AccountStatus { settings.account }

    public var body: some View {
        Group {
            if account == .signedOut, let openSignIn = settings.openSignIn {
                Button(action: openSignIn) { avatar }
            } else if settings.accountPanelContent != nil {
                // While open, the panel covers this spot and a click closes it.
                Button { chrome.accountPanelOpen = true } label: { avatar }
            } else {
                SettingsToolbarButton(section: .account, chrome: chrome) { avatar }
            }
        }
        .buttonStyle(.plain)
        .floatingPill(in: Circle())
        .help(help)
    }

    private var avatar: some View {
        AccountAvatar(account: account, badge: settings.accountBadge, size: 22)
            .labelStyle(.iconOnly)
            .frame(width: 40, height: 40)
            .contentShape(Circle())
    }

    private var help: String {
        switch account {
        case .signedOut: return "Sign in or create an account"
        case .signedIn(let email): return "Account — \(email)"
        }
    }
}

public extension View {
    /// Floating chrome glass: the system material in `shape` (a capsule
    /// unless told otherwise) and a centred shadow, stronger on paper so the
    /// white pills separate from the light ground.
    func floatingPill<S: Shape>(in shape: S) -> some View {
        modifier(FloatingPill(shape: shape))
    }

    func floatingPill() -> some View {
        modifier(FloatingPill(shape: Capsule()))
    }
}

private struct FloatingPill<S: Shape>: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    let shape: S

    func body(content: Content) -> some View {
        Group {
            if reduceTransparency {
                content
                    .background(GlassTokens.plate, in: shape)
                    .overlay(shape.stroke(GlassTokens.stroke, lineWidth: 1))
            } else {
                content.glassEffect(.regular.interactive(), in: shape)
            }
        }
        .shadow(color: GlassTokens.floatShadow, radius: 9, x: 0, y: 0)
    }
}
