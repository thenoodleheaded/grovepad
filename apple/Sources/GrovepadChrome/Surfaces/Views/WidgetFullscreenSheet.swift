import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The full-screen sheet (`WidgetFullscreenSheet.tsx`, `33-widget-sheet.css`):
// a double-click (or the title row's expand button) lifts a card into a
// panel that fills the window less a margin, over a scrim. Native
// adaptation: the web blurs and dims the board with CSS; here the scrim is
// the system's thin material, which blurs whatever is behind it live.
//
// - Grows out of the card's on-screen box: the panel's frame glides from it
//   to the inset box while the content scales 0.88 → 1 and fades in, over
//   1.5 × the layout duration on `cubic-bezier(0.32, 0.72, 0, 1)`.
// - Margin `clamp(round(min(w, h) × 0.042), 16, 56)`, corner radius 30.
// - Header: grab handle, the type's mark and the title, a close chevron.
// - Closes on Escape or the chevron (the scrim does not close it, as on the
//   web), and on its own when the card is deleted or the canvas changes;
//   closing plays the growth backwards into the card's box.
// ---------------------------------------------------------------------------

/// A card lifted into the sheet, and the box (canvas points) it came from.
public struct FullscreenRequest: Equatable {
    public var widgetId: String
    public var origin: WorldRect
    public init(widgetId: String, origin: WorldRect) {
        self.widgetId = widgetId
        self.origin = origin
    }
}

public enum WidgetSheetGeometry {
    /// `sheetMargin`.
    public static func margin(for size: CGSize) -> CGFloat {
        min(max((min(size.width, size.height) * 0.042).rounded(), 16), 56)
    }
    public static let cornerRadius: CGFloat = 30
    public static let duration = 0.45
    public static let animation = Animation.timingCurve(0.32, 0.72, 0, 1, duration: duration)
}

public struct WidgetFullscreenSheet: View {
    private let request: FullscreenRequest
    private let document: BoardDocument
    private let onClose: () -> Void
    @State private var shown = false
    @State private var closing = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(request: FullscreenRequest, document: BoardDocument, onClose: @escaping () -> Void) {
        self.request = request
        self.document = document
        self.onClose = onClose
    }

    public var body: some View {
        GeometryReader { proxy in
            let margin = WidgetSheetGeometry.margin(for: proxy.size)
            let panel = CGRect(x: margin, y: margin, width: max(0, proxy.size.width - margin * 2), height: max(0, proxy.size.height - margin * 2))
            let origin = CGRect(x: request.origin.x, y: request.origin.y, width: request.origin.width, height: request.origin.height)
            let box = shown ? panel : origin
            ZStack(alignment: .topLeading) {
                // The scrim: the live board blurred and dimmed behind the sheet.
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(Color(red: 3 / 255, green: 6 / 255, blue: 12 / 255).opacity(0.38))
                    .opacity(shown ? 1 : 0)
                    .contentShape(Rectangle())
                    .onTapGesture {}
                panelView(size: panel.size)
                    .frame(width: panel.width, height: panel.height)
                    .scaleEffect(shown ? 1 : 0.88)
                    .opacity(shown ? 1 : 0)
                    .frame(width: box.width, height: box.height)
                    .clipShape(RoundedRectangle(cornerRadius: WidgetSheetGeometry.cornerRadius, style: .continuous))
                    .shadow(color: .black.opacity(shown ? 0.45 : 0), radius: 30, y: 16)
                    .offset(x: box.minX, y: box.minY)
            }
        }
        .ignoresSafeArea()
        .onAppear {
            if reduceMotion { shown = true } else { withAnimation(WidgetSheetGeometry.animation) { shown = true } }
        }
        .onChange(of: stillValid) { _, valid in if !valid { close() } }
        .accessibilityAddTraits(.isModal)
    }

    /// The card still exists on the canvas it was lifted from.
    private var stillValid: Bool {
        guard let widget = document.widget(request.widgetId) else { return false }
        return widget.canvasId == document.activeCanvasId
    }

    @ViewBuilder
    private func panelView(size: CGSize) -> some View {
        if let widget = document.widget(request.widgetId), let definition = WidgetRegistry.definition(for: widget.type) {
            let accent = Color.inked(definition.accent(for: widget.data))
            VStack(spacing: 0) {
                header(widget: widget, accent: accent)
                sheetBody(widget: widget, size: CGSize(width: size.width, height: max(0, size.height - 64)), accent: accent)
            }
            .background(GlassTokens.plate)
        }
    }

    private func header(widget: Widget, accent: Color) -> some View {
        VStack(spacing: 6) {
            Capsule().fill(Color.primary.opacity(0.18)).frame(width: 40, height: 5).padding(.top, 8)
            HStack(spacing: 10) {
                Image(systemName: WidgetSymbols.symbol(for: widget.type, skin: WidgetRegistry.definition(for: widget.type)?.skinValue(in: widget.data)))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(accent)
                Text(widget.title.isEmpty ? "Untitled" : widget.title)
                    .font(.grove(size: 17, weight: .semibold))
                    .lineLimit(1)
                Spacer(minLength: 8)
                Button(action: close) {
                    Image(systemName: "chevron.down")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(width: 32, height: 32)
                        .background(Circle().fill(Color.primary.opacity(0.08)))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.cancelAction)
                .help("Close (Esc)")
                .accessibilityLabel("Close full screen")
            }
            .padding(.horizontal, 20)
        }
        .frame(height: 64, alignment: .top)
    }

    /// The whole card, live, at the sheet's size.
    @ViewBuilder
    private func sheetBody(widget: Widget, size: CGSize, accent: Color) -> some View {
        var sized = widget
        let _ = { sized.size = Size(width: Double(size.width) - 40, height: Double(size.height) - 20) }()
        if let context = document.cardContext(for: sized, glassAllowed: true) {
            GlassBackplate(accent: accent) {
                WidgetRendererRegistry.renderer(for: widget.type).cardBody(context)
            }
            .frame(width: max(0, size.width - 40), height: max(0, size.height - 20))
            .padding(.horizontal, 20)
            .padding(.bottom, 20)
        }
    }

    private func close() {
        guard !closing else { return }
        closing = true
        if reduceMotion { onClose(); return }
        withAnimation(WidgetSheetGeometry.animation) { shown = false }
        DispatchQueue.main.asyncAfter(deadline: .now() + WidgetSheetGeometry.duration) { onClose() }
    }
}
