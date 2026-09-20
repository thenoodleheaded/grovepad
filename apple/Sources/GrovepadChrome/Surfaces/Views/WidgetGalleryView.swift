import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The widget library at regular widths (Mac, iPad): the whole window, the
// board blurred behind it, every widget its own block in a grid under the
// family headings. It reads the same `AddWidgetModel` bands and search as the
// phone's sheet (`AddWidgetSheet`); only the presentation differs. Two
// callers: adding one widget (`AddWidgetGallery`) and choosing a tree
// point's bundle (`GhostNodePickerGallery`, blocks toggle and a footer
// confirms).
//
// Blocks wear their accent at rest (the drawn face and the family line);
// hovering washes the block in it; a chosen block glows in it, much stronger
// than hover. The search field and every button are system Liquid Glass: the
// search capsule and its round ✕ merge in one container, the footer's
// Clear / Cancel share a pill and Add is its own prominent pill.
//
// Touch answers: every block is a button far above 44 pt; the star is its own
// 44 pt target and always visible; ✕ and a tap on the blurred margin close it
// (Escape is an addition); types whose pack is off are not listed.
// ---------------------------------------------------------------------------

struct WidgetGalleryView<Footer: View>: View {
    @Bindable var model: AddWidgetModel
    let placeholder: String
    let title: String
    /// Selection mode: the types chosen so far (nil when adding one widget).
    let selected: [String]?
    let lockedReason: String?
    let onChoose: (AddWidgetEntry) -> Void
    let onClose: () -> Void
    @ViewBuilder let footer: () -> Footer

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var searchFocused: Bool
    @State private var hovered: String?

    private let columns = [GridItem(.adaptive(minimum: 172, maximum: 232), spacing: 14)]

    var body: some View {
        ZStack {
            // The board, blurred; a tap on it closes the gallery.
            Rectangle()
                .fill(.ultraThinMaterial)
                .overlay(Color.black.opacity(0.18))
                .ignoresSafeArea()
                .contentShape(Rectangle())
                .onTapGesture(perform: onClose)
                .accessibilityHidden(true)
            VStack(spacing: 0) {
                header
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        if model.count == 0 { emptyResults }
                        ForEach(model.groups) { group in
                            if let label = group.label {
                                GlassLabel(label).padding(.top, 22).padding(.bottom, 10).padding(.leading, 4)
                            }
                            LazyVGrid(columns: columns, alignment: .leading, spacing: 14) {
                                ForEach(group.entries) { entry in block(entry) }
                            }
                        }
                    }
                    .padding(.top, 4)
                    .padding(.bottom, 28)
                }
                .scrollIndicators(.hidden)
                footer()
            }
            .frame(maxWidth: 1120)
            .padding(.horizontal, 32)
            .padding(.top, 56)
        }
        .onAppear { searchFocused = true }
        .onKeyPress(.escape) {
            onClose()
            return .handled
        }
        #if os(macOS)
        // The search field's editor answers Escape as "cancel" before any key handler sees it.
        .onExitCommand(perform: onClose)
        #endif
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
        .accessibilityAddTraits(.isModal)
    }

    // MARK: - Search

    /// The system search field's shape in glass: magnifier, prompt, a clear
    /// button once there is text; the round ✕ beside it closes the gallery.
    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(.secondary)
                        TextField(placeholder, text: Binding(get: { model.query }, set: { model.setQuery($0) }))
                            .textFieldStyle(.plain)
                            .font(.grove(size: 16))
                            .focused($searchFocused)
                            .onSubmit { if let lit = model.litEntry { onChoose(lit) } }
                        if !model.query.isEmpty {
                            Button { model.setQuery("") } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .font(.system(size: 15))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 28, height: 28)
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear search")
                        }
                        Text("\(model.count)")
                            .font(GlassType.label)
                            .foregroundStyle(.tertiary)
                            .monospacedDigit()
                            .accessibilityLabel("\(model.count) widgets")
                    }
                    .padding(.horizontal, 16)
                    .frame(height: GlassTokens.touchTarget)
                    .glassEffect(.regular.interactive(), in: Capsule())

                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(width: 30, height: 30)
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .controlSize(.large)
                    .accessibilityLabel("Close")
                }
            }
            if let lockedReason {
                Text(lockedReason)
                    .font(GlassType.body)
                    .foregroundStyle(Color.tone("#fbbf24", light: "#b45309"))
                    .padding(.leading, 16)
            }
        }
        .padding(.bottom, 6)
    }

    private var emptyResults: some View {
        VStack(spacing: 10) {
            Text("Nothing named “\(model.query)”").font(GlassType.body).foregroundStyle(.secondary)
            Button("Browse the whole library") { model.setQuery("") }.buttonStyle(.glass)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 60)
    }

    // MARK: - Blocks

    private enum BlockState { case rest, hover, chosen }

    private func state(of entry: AddWidgetEntry) -> BlockState {
        if selected?.contains(entry.type) == true { return .chosen }
        if let hovered { return hovered == entry.type ? .hover : .rest }
        // Adding: Enter's target reads as hovered until the pointer moves.
        return selected == nil && model.litEntry?.type == entry.type ? .hover : .rest
    }

    private func block(_ entry: AddWidgetEntry) -> some View {
        let state = state(of: entry)
        let accent = Color(hex: entry.accent)
        let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
        return ZStack(alignment: .topTrailing) {
            Button { onChoose(entry) } label: {
                VStack(spacing: 0) {
                    Spacer(minLength: 10)
                    WidgetFaceView(type: entry.type, category: entry.category.rawValue, color: Color.inked(entry.accent))
                        .frame(width: 76, height: 58)
                        .scaleEffect(state == .rest ? 1 : 1.06)
                    Spacer(minLength: 10)
                    Text(entry.label)
                        .font(.grove(size: 15, weight: state == .chosen ? .semibold : .medium))
                        .foregroundStyle(state == .rest ? AddWidgetSheet.labelInk : AddWidgetSheet.litLabelInk)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                    Text(entry.category.label.uppercased())
                        .font(.grove(size: 9.5, weight: .medium))
                        .tracking(0.9)
                        .foregroundStyle(Color.inked(entry.accent).opacity(state == .rest ? 0.8 : 1))
                        .lineLimit(1)
                        .padding(.top, 3)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, minHeight: 164, maxHeight: 164)
                .contentShape(shape)
            }
            .buttonStyle(GalleryBlockStyle())
            .accessibilityLabel(selected == nil ? "Add \(entry.label)" : entry.label)
            .accessibilityAddTraits(state == .chosen ? .isSelected : [])
            if selected == nil { star(entry) }
        }
        .background {
            ZStack {
                shape.fill(GlassTokens.plate)
                shape.fill(LinearGradient(
                    colors: [accent.opacity(0.2), accent.opacity(0.06)],
                    startPoint: .top, endPoint: .bottom
                ))
                .opacity(state == .hover ? 1 : 0)
                shape.fill(LinearGradient(
                    colors: [accent.opacity(0.46), accent.opacity(0.22)],
                    startPoint: .top, endPoint: .bottom
                ))
                .opacity(state == .chosen ? 1 : 0)
            }
        }
        .overlay {
            switch state {
            case .rest: shape.strokeBorder(Color.lift.opacity(0.08), lineWidth: 1)
            case .hover: shape.strokeBorder(accent.opacity(0.45), lineWidth: 1)
            case .chosen: shape.strokeBorder(accent, lineWidth: 2)
            }
        }
        .shadow(color: state == .chosen ? accent.opacity(0.5) : .black.opacity(state == .hover ? 0.22 : 0.1), radius: state == .chosen ? 20 : state == .hover ? 12 : 6, y: state == .chosen ? 0 : 4)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: state)
        .onHover { inside in
            if inside { hovered = entry.type } else if hovered == entry.type { hovered = nil }
        }
    }

    private func star(_ entry: AddWidgetEntry) -> some View {
        Button { model.toggleFavorite(entry.type) } label: {
            Image(systemName: entry.favorited ? "star.fill" : "star")
                .font(.system(size: 13))
                .foregroundStyle(entry.favorited ? Color.tone("#fcd34d", light: "#b45309") : Color.primary.opacity(0.35))
                .frame(width: GlassTokens.touchTarget, height: GlassTokens.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(entry.favorited ? "Remove \(entry.label) from favorites" : "Favorite \(entry.label)")
    }
}

/// A block sinks a little under the finger or the click.
private struct GalleryBlockStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

// MARK: - Callers

/// Adding one widget at the point the library opened on.
public struct AddWidgetGallery: View {
    private let model: AddWidgetModel
    private let worldPoint: Vector2D
    private let chrome: ChromeState
    @State private var lockedReason: String?

    public init(model: AddWidgetModel, at worldPoint: Vector2D, chrome: ChromeState) {
        self.model = model
        self.worldPoint = worldPoint
        self.chrome = chrome
    }

    public var body: some View {
        WidgetGalleryView(
            model: model, placeholder: "Search widgets", title: "Add widget", selected: nil, lockedReason: lockedReason,
            onChoose: { entry in
                if case .locked(let reason) = model.choose(entry.type, at: worldPoint, chrome: chrome) { lockedReason = reason } else { lockedReason = nil }
            },
            onClose: { chrome.closeAddWidget() },
            footer: { EmptyView() }
        )
        .onAppear { model.setQuery("") }
    }
}

/// Choosing a tree point's bundle: blocks toggle, the footer confirms.
public struct GhostNodePickerGallery: View {
    private let library: AddWidgetModel
    private let shaper: TreeShaperModel
    private let initialTypes: [String]
    @State private var selected: [String]
    @State private var lockedReason: String?

    public init(library: AddWidgetModel, shaper: TreeShaperModel) {
        self.library = library
        self.shaper = shaper
        let initial = shaper.pickerInitialTypes
        initialTypes = initial
        _selected = State(initialValue: initial)
    }

    public var body: some View {
        WidgetGalleryView(
            model: library, placeholder: "Search widgets to add", title: "Choose widgets for this tree point", selected: selected, lockedReason: lockedReason,
            onChoose: toggle,
            onClose: { shaper.closePicker() },
            footer: { footer }
        )
        .onAppear { library.setQuery("") }
    }

    private func toggle(_ entry: AddWidgetEntry) {
        if let reason = entry.lockedReason {
            lockedReason = reason
            return
        }
        lockedReason = nil
        if let index = selected.firstIndex(of: entry.type) { selected.remove(at: index) } else { selected.append(entry.type) }
    }

    /// The count reads on its own; Clear node and Cancel share one glass
    /// pill (both back out), Add is the prominent pill that commits.
    private var footer: some View {
        HStack(spacing: 10) {
            (Text("\(selected.count)").fontWeight(.semibold) + Text(" selected"))
                .font(.grove(size: 13))
                .monospacedDigit()
                .padding(.horizontal, 16)
                .frame(height: GlassTokens.touchTarget)
                .glassEffect(.regular, in: Capsule())
            Spacer(minLength: 0)
            GlassEffectContainer(spacing: 10) {
                HStack(spacing: 10) {
                    HStack(spacing: 0) {
                        if !initialTypes.isEmpty {
                            footerButton("Clear node") { shaper.confirmPicker([]) }
                            Divider().frame(height: 18)
                        }
                        footerButton("Cancel") { shaper.closePicker() }
                    }
                    .glassEffect(.regular.interactive(), in: Capsule())

                    Button { shaper.confirmPicker(selected) } label: {
                        Text("Add")
                            .font(.grove(size: 14, weight: .semibold))
                            .padding(.horizontal, 12)
                            .frame(minHeight: 30)
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.capsule)
                    .controlSize(.large)
                    .tint(Color(hex: "#059669"))
                    .disabled(selected.isEmpty)
                    .keyboardShortcut(.defaultAction)
                }
            }
        }
        .padding(.top, 8)
        .padding(.bottom, 20)
    }

    private func footerButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.grove(size: 14, weight: .medium))
                .padding(.horizontal, 18)
                .frame(minHeight: GlassTokens.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
