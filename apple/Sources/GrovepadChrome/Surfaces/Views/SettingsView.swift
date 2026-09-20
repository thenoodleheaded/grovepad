import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Settings, laid out like the web panel (`SettingsPanel.tsx`) and built from
// the system's Liquid Glass: the identity pill with glass theme and close
// buttons beside it, the category bar whose glass lens slides (and drags)
// between tabs like the iOS tab bar, and one glass content plate. Switches
// are glass tiles that turn emerald when on; single choices are rows of glass
// buttons; the canvas controls are native switches, a slider and a field.
// The same view is the phone/iPad panel and the Mac's Settings window.
// ---------------------------------------------------------------------------

public struct SettingsView: View {
    @Environment(\.chromeAdaptation) private var adaptation
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Bindable private var model: SettingsModel
    @State private var canvasName = ""
    private let onClose: (() -> Void)?

    /// `onClose` replaces closing the in-app panel (the Mac window closes itself).
    public init(model: SettingsModel, onClose: (() -> Void)? = nil) {
        self._model = Bindable(model)
        self.onClose = onClose
    }

    public var body: some View {
        VStack(spacing: 12) {
            header
            categoryBar
            content
        }
        .padding(12)
        .frame(maxWidth: 560)
        .onAppear { canvasName = model.activeCanvas?.name ?? "" }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Settings")
    }

    // MARK: - Header

    private var header: some View {
        HStack(spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: "slider.horizontal.3")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(SettingsGlass.mark)
                Text("Settings").font(.grove(size: 14, weight: .semibold))
            }
            .padding(.horizontal, 16)
            .frame(height: 40)
            .glassEffect(.regular, in: Capsule())
            Spacer()
            circleButton(isDark ? "sun.max" : "moon", label: isDark ? "Switch to light" : "Switch to dark") {
                model.update { $0.appearance = isDark ? .light : .dark }
            }
            circleButton("xmark", label: "Close settings") {
                if let onClose { onClose() } else { model.isOpen = false }
            }
        }
    }

    private var isDark: Bool {
        switch model.preferences.appearance {
        case .dark: return true
        case .light: return false
        case .system: return colorScheme == .dark
        }
    }

    private func circleButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 14, weight: .medium))
                .frame(width: 22, height: 22)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .controlSize(.large)
        .accessibilityLabel(label)
    }

    // MARK: - Categories

    private static func symbol(_ section: SettingsSection) -> String {
        switch section {
        case .general: return "paintpalette"
        case .controls: return "keyboard"
        case .canvas: return "number"
        case .account: return "person"
        case .data: return "cylinder.split.1x2"
        }
    }

    private var categoryBar: some View {
        GlassSectionBar(
            items: SettingsModel.sections,
            selection: Binding(get: { model.section }, set: { model.section = $0 }),
            height: adaptation.isPhone ? 52 : 40
        ) { section, lit in
            Group {
                if adaptation.isPhone {
                    VStack(spacing: 3) {
                        Image(systemName: Self.symbol(section)).font(.system(size: 15, weight: lit ? .semibold : .regular))
                        Text(section.label).font(.grove(size: 10, weight: .semibold))
                    }
                } else {
                    HStack(spacing: 6) {
                        Image(systemName: Self.symbol(section)).font(.system(size: 12, weight: lit ? .semibold : .regular))
                        Text(section.label).font(.grove(size: 12, weight: .semibold))
                    }
                }
            }
            .foregroundStyle(lit ? Color.primary : Color.secondary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Settings categories")
    }

    // MARK: - Content

    private var content: some View {
        Group {
            if model.section == .controls {
                ScrollView {
                    GlassRow { ShortcutTableView() }.padding(2)
                }
                .scrollIndicators(.hidden)
                .frame(height: adaptation.isPhone ? 520 : 440)
            } else {
                section
            }
        }
        .id(model.section)
        .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 7)))
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
    }

    @ViewBuilder
    private var section: some View {
        switch model.section {
        case .general: general
        case .controls: EmptyView()
        case .canvas: canvas
        case .account: account
        case .data: data
        }
    }

    private var tileColumns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 10), count: adaptation.isPhone ? 2 : 4)
    }

    private static func qualitySymbol(_ quality: VisualQuality) -> String {
        switch quality {
        case .high: return "diamond"
        case .balanced: return "gauge.with.dots.needle.33percent"
        case .low: return "leaf"
        }
    }

    private var general: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(VisualQuality.allCases, id: \.self) { quality in
                        GlassTile(title: quality.label, symbol: Self.qualitySymbol(quality), on: model.preferences.visualQuality == quality, height: 52, centred: true) {
                            model.update { $0.visualQuality = quality }
                        }
                        .accessibilityAddTraits(model.preferences.visualQuality == quality ? .isSelected : [])
                    }
                }
                Text(model.preferences.visualQuality.hint)
                    .font(.grove(size: 11))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .fixedSize(horizontal: false, vertical: true)
            }
            LazyVGrid(columns: tileColumns, spacing: 10) {
                GlassTile(title: "Motion", symbol: "water.waves", on: !model.preferences.reduceMotion) { model.update { $0.reduceMotion.toggle() } }
                GlassTile(title: "Ambient glow", symbol: "sparkles", on: model.preferences.canvasAura) { model.update { $0.canvasAura.toggle() } }
                GlassTile(title: "Magnetic hover", symbol: "cursorarrow", on: model.preferences.magneticHover) { model.update { $0.magneticHover.toggle() } }
                GlassTile(title: "Reset settings", symbol: "arrow.counterclockwise", iconTint: SettingsGlass.amber) { model.reset() }
            }
            HStack(spacing: 8) {
                ForEach(Appearance.allCases, id: \.self) { appearance in
                    Button { model.update { $0.appearance = appearance } } label: {
                        Label(appearance.label, systemImage: appearance.symbol)
                            .font(.grove(size: 12, weight: .semibold))
                            .frame(maxWidth: .infinity)
                    }
                    .glassButton(prominent: model.preferences.appearance == appearance, radius: 14)
                    .controlSize(.large)
                    .accessibilityLabel("\(appearance.label) appearance")
                    .accessibilityAddTraits(model.preferences.appearance == appearance ? .isSelected : [])
                }
            }
        }
    }

    private var canvas: some View {
        VStack(spacing: 10) {
            GlassRow(padding: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "character.cursor.ibeam").foregroundStyle(.secondary).padding(.leading, 4)
                    TextField("Canvas name", text: $canvasName)
                        .textFieldStyle(.plain)
                        .font(.grove(size: 13, weight: .medium))
                        .onSubmit { model.renameActiveCanvas(canvasName) }
                    Button("Save") { model.renameActiveCanvas(canvasName) }
                        .font(.grove(size: 12, weight: .semibold))
                        .buttonStyle(.glassProminent)
                        .tint(SettingsGlass.emerald)
                        .disabled(canvasName.trimmingCharacters(in: .whitespaces).isEmpty || canvasName == model.activeCanvas?.name)
                }
                .disabled(model.canvasLocked)
            }
            if let collaboration = model.collaboration {
                CanvasSharingRows(collaboration: collaboration, shared: model.activeCanvas?.shared == true)
            }
            GlassRow {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        Image(systemName: "circle.grid.3x3").foregroundStyle(.secondary)
                        Text("Dot grid strength").font(.grove(size: 12, weight: .semibold))
                        Spacer()
                        Text("\(Int(model.gridIntensity))%").font(.grove(size: 11, weight: .semibold).monospacedDigit()).foregroundStyle(.secondary)
                    }
                    Slider(value: Binding(get: { model.gridIntensity }, set: { model.setGridIntensity($0) }), in: 0...100)
                        .tint(SettingsGlass.emerald)
                        .accessibilityLabel("Dot grid strength")
                        .disabled(model.canvasLocked)
                }
            }
            switchRow("Link lines", symbol: "point.topleft.down.to.point.bottomright.curvepath", isOn: Binding(get: { model.linksVisible }, set: { model.setLinksVisible($0) }), disabled: model.canvasLocked)
        }
    }

    private func switchRow(_ title: String, symbol: String, isOn: Binding<Bool>, disabled: Bool = false) -> some View {
        GlassRow {
            Toggle(isOn: isOn) {
                HStack(spacing: 10) {
                    Image(systemName: symbol).foregroundStyle(.secondary).frame(width: 20)
                    Text(title).font(.grove(size: 12, weight: .semibold))
                }
            }
            .toggleStyle(.switch)
            .tint(SettingsGlass.emerald)
            .disabled(disabled)
        }
    }

    @ViewBuilder
    private var account: some View {
        if let content = model.accountContent {
            content()
        } else {
            GlassRow {
                HStack(spacing: 10) {
                    Image(systemName: "person").foregroundStyle(.secondary)
                    Text(model.accountHint).font(.grove(size: 12, weight: .semibold))
                }
            }
        }
    }

    private var data: some View {
        VStack(alignment: .leading, spacing: 8) {
            switchRow("Usage counting", symbol: "chart.bar", isOn: Binding(get: { model.analyticsConfigured && model.preferences.usageAnalytics }, set: { on in model.update { $0.usageAnalytics = on } }), disabled: !model.analyticsConfigured)
            Text(model.analyticsState.hint).font(.grove(size: 11)).foregroundStyle(.secondary).padding(.horizontal, 8)
            GlassLabel("Domain packs").padding(.top, 10).padding(.leading, 8)
            Text("A pack that is off keeps its widgets out of the library.")
                .font(.grove(size: 11)).foregroundStyle(.secondary).padding(.horizontal, 8)
            ForEach(DomainPacks.available, id: \.pack.id) { entry in
                packRow(entry.pack, widgets: entry.widgets)
            }
        }
    }

    /// `DomainPackSettings` row: a switch per pack, what it unlocks under it.
    private func packRow(_ pack: DomainPack, widgets: [String]) -> some View {
        let document = model.document
        return GlassRow {
            Toggle(isOn: Binding(get: { document.board.activePacks.contains(pack.id) }, set: { _ in document.togglePack(pack.id) })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(pack.label).font(.grove(size: 12, weight: .semibold))
                    Text(widgets.joined(separator: " · "))
                        .font(.grove(size: 10.5))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .toggleStyle(.switch)
            .tint(SettingsGlass.emerald)
        }
        .accessibilityHint(pack.blurb)
    }
}

/// The hotkey table, one linear list (never paged).
public struct ShortcutTableView: View {
    private let actions: ShortcutsModel.Actions?

    public init(actions: ShortcutsModel.Actions? = nil) { self.actions = actions }

    public var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(ShortcutsModel.sections, id: \.title) { section in
                VStack(alignment: .leading, spacing: 2) {
                    GlassLabel(section.title)
                    ForEach(section.rows, id: \.label) { row in
                        let runnable = actions != nil && ShortcutsModel.isActionable(row.label)
                        Button {
                            if let actions { ShortcutsModel.run(row.label, actions) }
                        } label: {
                            HStack(spacing: 8) {
                                Text(row.label).font(.grove(size: 11)).foregroundStyle(runnable ? Color.primary : Color.secondary)
                                Spacer(minLength: 8)
                                ForEach(row.keys, id: \.self) { key in
                                    Text(key).font(.grove(size: 10)).padding(.horizontal, 5).padding(.vertical, 2).background(Color.lift.opacity(0.08), in: RoundedRectangle(cornerRadius: 4))
                                }
                            }
                            .frame(minHeight: runnable ? GlassTokens.touchTarget : 28)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .disabled(!runnable)
                    }
                }
            }
        }
    }
}

/// The Shared switch (`CanvasSettings` in SettingsPanel.tsx) and a field for
/// a shared-canvas link someone sent. Only the owner may stop sharing,
/// because that revokes everyone else's access; it asks first.
struct CanvasSharingRows: View {
    @Bindable var collaboration: CollaborationChromeModel
    let shared: Bool
    @State private var link = ""
    @State private var opening = false

    var body: some View {
        VStack(spacing: 10) {
            GlassRow {
                VStack(alignment: .leading, spacing: 6) {
                    Toggle(isOn: Binding(get: { shared }, set: { collaboration.requestSharing($0) })) {
                        HStack(spacing: 10) {
                            Image(systemName: shared ? "person.2" : "lock").foregroundStyle(.secondary).frame(width: 20)
                            Text(collaboration.sharingTitle(shared: shared)).font(.grove(size: 12, weight: .semibold))
                        }
                    }
                    .toggleStyle(.switch)
                    .tint(SettingsGlass.emerald)
                    .disabled(!collaboration.canToggleSharing(shared: shared))
                    Text(sharingHint)
                        .font(.grove(size: 10.5)).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.leading, 30)
                }
            }
            .alert("Make this canvas private?", isPresented: $collaboration.confirmStopSharing) {
                Button("Make private", role: .destructive) { Task { await collaboration.applySharing(false) } }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Everyone you invited loses access, and the shared copy is deleted from the server along with its comments. This canvas stays on your device — nothing here is lost.")
            }
            GlassRow(padding: 10) {
                HStack(spacing: 10) {
                    Image(systemName: "link").foregroundStyle(.secondary).padding(.leading, 4)
                    TextField("Paste a shared canvas link", text: $link)
                        .textFieldStyle(.plain)
                        .font(.grove(size: 12))
                        .onSubmit(open)
                    Button(opening ? "Opening…" : "Open", action: open)
                        .font(.grove(size: 12, weight: .semibold))
                        .buttonStyle(.glass)
                        .disabled(opening || link.trimmingCharacters(in: .whitespaces).isEmpty || collaboration.accountUserId == nil)
                }
            }
        }
    }

    private var sharingHint: String {
        if collaboration.accountUserId == nil { return "Sign in to share this canvas with people you invite." }
        if !collaboration.runtime.configured { return "Sharing is unavailable on this build." }
        return shared
            ? "People you invite see changes live. Other canvases stay private."
            : "Only this canvas is shared, and only with people you invite."
    }

    private func open() {
        guard !opening else { return }
        opening = true
        Task {
            if await collaboration.openLink(link) { link = "" }
            opening = false
        }
    }
}
