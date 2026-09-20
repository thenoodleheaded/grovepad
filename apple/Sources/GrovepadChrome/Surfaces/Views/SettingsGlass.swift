import SwiftUI

// ---------------------------------------------------------------------------
// The settings panel's pieces, built from the system's Liquid Glass so the
// panel reads like the web one (`SettingsPanel.tsx`) but behaves like the OS:
//
// - `GlassSectionBar`: the category switcher as the iOS 26 tab bar does it —
//   a glass bar with a glass lens that springs to the tapped tab, and that
//   you can drag across the tabs (it swells while held and lands on the
//   nearest one on release).
// - `GlassTile`: a web preference island as a native glass button — plain
//   glass when off, emerald prominent glass when on.
// - `GlassRow`: a glass card holding a native control (switch, slider, field).
// ---------------------------------------------------------------------------

enum SettingsGlass {
    /// The web's "on" emerald (`--color-emerald-500`), the one tint the panel uses.
    static let emerald = Color(hex: "#10b981")
    static let amber = Color.tone("#fcd34d", light: "#b45309")
    static let mark = Color.tone("#6ee7b7", light: "#047857")
}

/// Plain glass when `prominent` is false, tinted prominent glass when true.
private struct GlassButtonChoice: ViewModifier {
    let prominent: Bool
    let radius: CGFloat

    func body(content: Content) -> some View {
        if prominent {
            content
                .buttonStyle(.glassProminent)
                .tint(SettingsGlass.emerald)
                .buttonBorderShape(.roundedRectangle(radius: radius))
        } else {
            content
                .buttonStyle(.glass)
                .buttonBorderShape(.roundedRectangle(radius: radius))
        }
    }
}

extension View {
    func glassButton(prominent: Bool, radius: CGFloat = 16) -> some View {
        modifier(GlassButtonChoice(prominent: prominent, radius: radius))
    }
}

/// The category switcher: a glass bar and a glass lens that follows taps and
/// drags across it, the way the iOS tab bar's selection does.
struct GlassSectionBar<Item: Hashable, Label: View>: View {
    let items: [Item]
    @Binding var selection: Item
    let height: CGFloat
    let label: (Item, Bool) -> Label

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The lens centre while a drag is in progress, in bar coordinates.
    @State private var dragX: CGFloat?

    init(items: [Item], selection: Binding<Item>, height: CGFloat, @ViewBuilder label: @escaping (Item, Bool) -> Label) {
        self.items = items
        self._selection = selection
        self.height = height
        self.label = label
    }

    private var spring: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.72)
    }

    var body: some View {
        GeometryReader { proxy in
            let count = CGFloat(max(items.count, 1))
            let slot = proxy.size.width / count
            let chosen = CGFloat(items.firstIndex(of: selection) ?? 0)
            let centre = dragX ?? (chosen + 0.5) * slot
            // Under a drag the tab the lens is over is lit, not the stored one.
            let lit = dragX.map { min(max(Int($0 / slot), 0), items.count - 1) } ?? Int(chosen)
            ZStack(alignment: .topLeading) {
                Capsule()
                    .fill(Color.clear)
                    .frame(width: slot, height: proxy.size.height)
                    .glassEffect(.regular.tint(SettingsGlass.emerald.opacity(0.16)).interactive(), in: Capsule())
                    .scaleEffect(dragX == nil ? 1 : 1.12)
                    .offset(x: centre - slot / 2)
                    .animation(dragX == nil ? spring : .interactiveSpring(response: 0.2, dampingFraction: 0.85), value: centre)
                    .animation(spring, value: dragX == nil)
                    .allowsHitTesting(false)
                HStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                        Button {
                            withAnimation(spring) { selection = item }
                        } label: {
                            label(item, index == lit)
                                .frame(width: slot, height: proxy.size.height)
                                .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(item == selection ? .isSelected : [])
                    }
                }
            }
            .simultaneousGesture(
                DragGesture(minimumDistance: 6)
                    .onChanged { drag in dragX = min(max(drag.location.x, slot / 2), proxy.size.width - slot / 2) }
                    .onEnded { drag in
                        let index = min(max(Int(drag.location.x / slot), 0), items.count - 1)
                        withAnimation(spring) {
                            selection = items[index]
                            dragX = nil
                        }
                    }
            )
        }
        .frame(height: height)
        .padding(4)
        .glassEffect(.regular, in: Capsule())
    }
}

/// A web preference island as a native glass button.
struct GlassTile: View {
    let title: String
    let symbol: String
    /// Nil for an action (never "on").
    var on: Bool?
    var iconTint: Color?
    var height: CGFloat = 76
    var centred = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if centred {
                    VStack(spacing: 6) {
                        Image(systemName: symbol).font(.system(size: 16, weight: .medium))
                        Text(title).font(.grove(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity, minHeight: height)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Image(systemName: symbol)
                            .font(.system(size: 18, weight: .regular))
                            .foregroundStyle(iconTint ?? (on == true ? Color.white : Color.secondary))
                        Spacer(minLength: 0)
                        Text(title).font(.grove(size: 12, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                    }
                    .padding(.vertical, 4)
                    .frame(maxWidth: .infinity, minHeight: height, alignment: .leading)
                }
            }
            .contentShape(Rectangle())
        }
        .glassButton(prominent: on == true)
        .controlSize(.large)
        .animation(.easeOut(duration: 0.16), value: on)
        .accessibilityLabel(title)
        .accessibilityValue(on.map { $0 ? "On" : "Off" } ?? "")
    }
}

/// A glass card holding native controls.
struct GlassRow<Content: View>: View {
    var padding: CGFloat = 14
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .glassEffect(.regular, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}
