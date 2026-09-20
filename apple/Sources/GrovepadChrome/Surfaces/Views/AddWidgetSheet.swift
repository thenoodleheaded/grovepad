import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The widget library. One column of rows on wide screens; a two-up grid of
// blocks on a phone. Each wears the web's drawn face (a miniature of its own
// layout) in neutral ink; only the lit row takes its accent. The star is
// reachable on every block (no hover). A locked row says why.
// ---------------------------------------------------------------------------

public struct AddWidgetSheet: View {
    @Environment(\.chromeAdaptation) private var adaptation
    @Bindable private var model: AddWidgetModel
    private let worldPoint: Vector2D
    private let chrome: ChromeState?
    @State private var lockedReason: String?
    @State private var hovered: String?

    public init(model: AddWidgetModel, at worldPoint: Vector2D, chrome: ChromeState? = nil) {
        self._model = Bindable(model)
        self.worldPoint = worldPoint
        self.chrome = chrome
    }

    public var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Search widgets…", text: Binding(get: { model.query }, set: { model.setQuery($0) }))
                    .textFieldStyle(.plain)
                    .font(.grove(size: 15))
                    .onSubmit { if let lit = model.litEntry { choose(lit) } }
                Text("\(model.count)").font(GlassType.label).foregroundStyle(.tertiary)
                GhostButton("xmark", label: "Close") { chrome?.closeAddWidget() }
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 56)
            if let lockedReason {
                Text(lockedReason).font(GlassType.body).foregroundStyle(Color(hex: "#fbbf24")).padding(.horizontal, 16).padding(.bottom, 6)
            }
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if model.count == 0 {
                        VStack(spacing: 10) {
                            Text("Nothing named “\(model.query)”").font(GlassType.body).foregroundStyle(.secondary)
                            Button("Browse the whole library") { model.setQuery("") }.buttonStyle(.plain).touchTarget()
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 40)
                    }
                    ForEach(model.groups) { group in
                        if let label = group.label { GlassLabel(label).padding(.horizontal, 16).padding(.top, 18).padding(.bottom, 6) }
                        if adaptation.isPhone {
                            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                                ForEach(group.entries) { entry in tile(entry) }
                            }
                            .padding(.horizontal, 10)
                        } else {
                            ForEach(group.entries) { entry in row(entry) }
                        }
                    }
                }
                .padding(.bottom, 12)
            }
        }
        .frame(minWidth: adaptation.isPhone ? 0 : 408, maxWidth: adaptation.isPhone ? .infinity : 408, minHeight: 320)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Add widget")
    }

    private func choose(_ entry: AddWidgetEntry) {
        switch model.choose(entry.type, at: worldPoint, chrome: chrome) {
        case .locked(let reason): lockedReason = reason
        default: lockedReason = nil
        }
    }

    /// The one lit row: the pointer's, else the keyboard's. Colour is spent
    /// only here (web: `litIndex`, hovered before active).
    private var litType: String? { hovered ?? model.litEntry?.type }

    /// The web's `WidgetFace`: a miniature of the widget's own layout in
    /// neutral ink; the lit row inks it in the widget's accent (deepened on
    /// paper, `--gp-facet-ink`).
    private func face(_ entry: AddWidgetEntry, lit: Bool) -> some View {
        WidgetFaceView(type: entry.type, category: entry.category.rawValue, color: lit ? Color.inked(entry.accent) : AddWidgetSheet.faceInk)
            .opacity(entry.isLocked ? 0.45 : 1)
            .animation(.easeOut(duration: 0.11), value: lit)
    }

    /// `.gp-facet-glyph`: oklch(63% 0.008 250) on glass, oklch(48% 0.02 150) on paper.
    static let faceInk = Color.adaptive(light: Color(red: 0.388, green: 0.420, blue: 0.380), dark: Color(red: 0.537, green: 0.557, blue: 0.584))
    /// `.gp-facet-label`, resting and lit.
    static let labelInk = Color.adaptive(light: Color(red: 0.235, green: 0.267, blue: 0.227), dark: Color(red: 0.635, green: 0.655, blue: 0.675))
    static let litLabelInk = Color.adaptive(light: Color(red: 0.118, green: 0.141, blue: 0.110), dark: Color(red: 0.973, green: 0.976, blue: 0.980))

    /// The lit wash falls away from the indicator (`.gp-facet-row[data-active]`).
    private static func wash(_ accent: String) -> LinearGradient {
        let hue = Color(hex: accent)
        return LinearGradient(stops: [
            .init(color: hue.opacity(0.15), location: 0),
            .init(color: hue.opacity(0.08), location: 0.62),
            .init(color: hue.opacity(0.05), location: 1),
        ], startPoint: .leading, endPoint: .trailing)
    }

    /// The inset bar that grows out of nothing when a row lights.
    private func indicator(_ entry: AddWidgetEntry, lit: Bool, height: CGFloat) -> some View {
        Capsule()
            .fill(Color(hex: entry.accent))
            .frame(width: 3, height: lit ? height : 0)
            .opacity(lit ? 1 : 0)
            .animation(.spring(response: 0.22, dampingFraction: 0.7), value: lit)
    }

    private func star(_ entry: AddWidgetEntry) -> some View {
        Button { model.toggleFavorite(entry.type) } label: {
            Image(systemName: entry.favorited ? "star.fill" : "star")
                .font(.system(size: 12))
                .foregroundStyle(entry.favorited ? Color.tone("#fcd34d", light: "#b45309") : Color.primary.opacity(0.45))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(entry.favorited ? "Remove \(entry.label) from favorites" : "Favorite \(entry.label)")
        .touchTarget()
    }

    private func row(_ entry: AddWidgetEntry) -> some View {
        let lit = litType == entry.type
        return HStack(spacing: 12) {
            Button { choose(entry) } label: {
                HStack(spacing: 14) {
                    face(entry, lit: lit).frame(width: 29, height: 22)
                    Text(entry.label)
                        .font(.grove(size: 14, weight: .medium))
                        .foregroundStyle(lit ? AddWidgetSheet.litLabelInk : AddWidgetSheet.labelInk)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Text(entry.isLocked ? "Locked" : entry.category.label.uppercased())
                        .font(.grove(size: 9.5, weight: .medium))
                        .tracking(0.9)
                        .foregroundStyle(Color.inked(entry.accent).opacity(0.9))
                        .opacity(lit || entry.isLocked ? 1 : 0)
                }
                .padding(.leading, 16)
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(entry.isLocked ? "\(entry.label), locked: \(entry.lockedReason ?? "")" : "Add \(entry.label)")
            star(entry).opacity(lit || entry.favorited || adaptation.isPhone ? 1 : 0)
        }
        .padding(.trailing, 8)
        .background(alignment: .leading) {
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 14, style: .continuous).fill(AddWidgetSheet.wash(entry.accent)).opacity(lit ? 1 : 0)
                indicator(entry, lit: lit, height: 20).padding(.leading, 6)
            }
        }
        .onHover { inside in
            if inside { hovered = entry.type } else if hovered == entry.type {
                // Hand the highlight back to the keyboard where the pointer left it.
                hovered = nil
                if let index = model.flat.firstIndex(where: { $0.type == entry.type }) { model.activeIndex = index }
            }
        }
        .padding(.horizontal, 10)
    }

    private func tile(_ entry: AddWidgetEntry) -> some View {
        let lit = litType == entry.type
        return ZStack(alignment: .topTrailing) {
            Button { choose(entry) } label: {
                VStack(alignment: .leading, spacing: 8) {
                    face(entry, lit: lit).frame(width: 48, height: 38)
                    Spacer(minLength: 0)
                    Text(entry.label)
                        .font(.grove(size: 13.5, weight: .medium))
                        .foregroundStyle(lit ? AddWidgetSheet.litLabelInk : AddWidgetSheet.labelInk)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    if entry.isLocked { Text("Locked").font(GlassType.label).foregroundStyle(.tertiary) }
                }
                .padding(12)
                .padding(.trailing, 28)
                .frame(maxWidth: .infinity, minHeight: 116, maxHeight: 116, alignment: .topLeading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(entry.isLocked ? "\(entry.label), locked: \(entry.lockedReason ?? "")" : "Add \(entry.label)")
            star(entry).opacity(entry.favorited ? 1 : 0.45)
        }
        .background {
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color.lift.opacity(0.03))
                RoundedRectangle(cornerRadius: 18, style: .continuous).fill(AddWidgetSheet.wash(entry.accent)).opacity(lit ? 1 : 0)
                RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.lift.opacity(0.06), lineWidth: 1)
                indicator(entry, lit: lit, height: 16).padding(.leading, 12).padding(.top, 12)
            }
        }
    }
}
