import SwiftUI
import GrovepadCore
#if os(macOS)
import AppKit
#endif

// ---------------------------------------------------------------------------
// The skin roller's paint (`WidgetSkinRoller.tsx`). It covers the canvas and
// owns every press, scroll and key while it is up, so the board underneath
// cannot be panned, zoomed or dragged. The board is blurred — not darkened —
// behind it; the drum grows out of the card's own title, and on commit the
// chosen icon glides back into the title's icon tile while every other row
// dissolves and the board sharpens. The behaviour lives in `SkinRollerModel`.
//
// Mac: scroll and keys arrive through a local event monitor for as long as
// the drum is on screen — the canvas is an AppKit view that would otherwise
// take the wheel and the first responder's keys first.
// ---------------------------------------------------------------------------

public struct SkinRollerView: View {
    private let model: SkinRollerModel

    @State private var pressing = false
    #if os(macOS)
    @State private var monitor = SkinRollerEventMonitor()
    #else
    @FocusState private var focused: Bool
    #endif

    public init(model: SkinRollerModel) {
        self.model = model
    }

    private var phase: SkinRollerModel.Phase { model.phase }
    private var folded: Bool { phase == .folded }
    private var closing: Bool { phase == .closing }
    private var reduced: Bool { model.reducedMotion }

    public var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                // The board, blurred rather than darkened: still there, out of the way.
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .opacity(folded || closing ? 0 : 1)
                    .animation(reduced ? nil : .easeOut(duration: (closing ? SkinRollerModel.closeMs : SkinRollerModel.openMs) / 1000), value: phase)
                    .accessibilityHidden(true)
                drum
                    .scaleEffect(folded ? model.foldScale : 1, anchor: UnitPoint(
                        x: proxy.size.width > 0 ? model.anchor.left / proxy.size.width : 0,
                        y: proxy.size.height > 0 ? model.anchor.centreY / proxy.size.height : 0
                    ))
                    .animation(reduced || closing ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: SkinRollerModel.openMs / 1000), value: phase)
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
            .contentShape(Rectangle())
            .gesture(pressGesture)
        }
        .ignoresSafeArea()
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Choose a skin")
        .accessibilityAddTraits(.isModal)
        .onAppear(perform: appear)
        .onDisappear(perform: disappear)
        .onChange(of: phase) { _, next in phaseChanged(next) }
        #if !os(macOS)
        .focusable()
        .focusEffectDisabled()
        .focused($focused)
        .onKeyPress(keys: [.escape, .return, .space, .upArrow, .downArrow, .home, .end]) { press in
            key(press.key) ? .handled : .ignored
        }
        #endif
    }

    // MARK: - The drum

    private var drum: some View {
        let offset = model.offset
        let active = model.activeIndex
        return ZStack(alignment: .topLeading) {
            ForEach(Array(model.rows.enumerated()), id: \.element.id) { index, row in
                let place = SkinRollerGeometry.placeRow(index, offset: offset)
                if !place.hidden {
                    rowView(row, index: index, place: place, inLane: index == active, active: active)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func rowView(_ row: SkinPickerModel.Row, index: Int, place: SkinRollerGeometry.RowPlacement, inLane: Bool, active: Int) -> some View {
        let projection = SkinRollerGeometry.project(place, reducedMotion: reduced)
        let accent = Color(hex: row.accent)
        // Folded and closing, only the lane row is present; the rest fade in
        // as the drum unfurls and dissolve back out as it goes.
        let opacity = folded || closing ? (inLane ? 1 : 0) : place.opacity
        let blur = closing && !inLane ? 5 : place.blur
        let flight = model.iconFlight
        let flying = closing && inLane && model.committedValue != nil
        // Rows nearest the lane lead the way in; the close plays as one chord.
        // No transition at all while open, so fast rolling paints instantly.
        let stagger = closing ? 0 : min(SkinRollerModel.rowStaggerMs, Double(abs(index - active)) * 28) / 1000
        let fade: Animation? = reduced || phase == .open ? nil : .easeOut(duration: (closing ? SkinRollerModel.closeMs : SkinRollerModel.openMs) / 1000).delay(stagger)
        let glide: Animation? = reduced ? nil : .timingCurve(0.22, 1, 0.36, 1, duration: SkinRollerModel.closeMs / 1000)

        return HStack(spacing: 12) {
            Image(systemName: row.symbol)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(accent)
                .frame(width: SkinRollerModel.iconTile, height: SkinRollerModel.iconTile)
                .background(accent.opacity(0.11), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(accent.opacity(0.19), lineWidth: 1))
                // The one piece that survives a commit: it glides back onto
                // the card's icon tile, which is already wearing this skin.
                .scaleEffect(flying ? flight.scale : 1)
                .offset(x: flying ? flight.dx : 0, y: flying ? flight.dy : 0)
                .opacity(closing && inLane && !flying ? 0 : 1)
                .animation(glide, value: flying)
            VStack(alignment: .leading, spacing: 1) {
                Text(row.label)
                    .font(.grove(size: 19, weight: .bold))
                    .tracking(-0.38)
                    .foregroundStyle(accent)
                    .lineLimit(1)
                if row.isCurrent {
                    Text("Wearing now")
                        .font(.grove(size: 9, weight: .medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            // The chosen label bows out quickly so the icon lands alone.
            .opacity(closing && inLane ? 0 : 1)
            .animation(reduced ? nil : .easeOut(duration: 0.17), value: closing)
            Spacer(minLength: 0)
        }
        .shadow(color: .black.opacity(inLane ? 0.18 : 0.1), radius: 6, y: 2)
        .frame(width: SkinRollerModel.drumWidth, height: SkinRollerGeometry.rowHeight, alignment: .leading)
        .scaleEffect(x: projection.scale, y: projection.scale * projection.squash, anchor: .leading)
        .position(x: model.anchor.left + SkinRollerModel.drumWidth / 2, y: model.anchor.centreY + projection.y)
        .blur(radius: blur > 0.05 ? blur : 0)
        .opacity(opacity)
        .animation(fade, value: phase)
        .zIndex(place.zIndex)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(row.label)
        .accessibilityAddTraits(inLane ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction { model.roll(to: index) }
    }

    // MARK: - Input

    private var pressGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                if !pressing {
                    // The row under the press is remembered now: after a drag
                    // the release may land over a different row entirely.
                    pressing = true
                    model.pressBegan(row: model.row(at: Vector2D(x: value.startLocation.x, y: value.startLocation.y)))
                }
                model.pressMoved(travel: value.translation.height)
            }
            .onEnded { _ in
                pressing = false
                model.pressEnded()
            }
    }

    /// One key, the web's map. Returns whether it was the drum's.
    private func key(_ key: KeyEquivalent) -> Bool {
        switch key {
        case .escape: model.dismiss()
        case .return, .space: model.commit()
        case .downArrow: model.roll(by: 1)
        case .upArrow: model.roll(by: -1)
        case .home: model.roll(to: 0)
        case .end: model.roll(to: model.count - 1)
        default: return false
        }
        return true
    }

    // MARK: - Lifecycle

    private func appear() {
        #if os(macOS)
        monitor.start(model: model, key: key)
        #else
        focused = true
        #endif
        // Grow only once the folded, title-sized frame has been painted —
        // an animation needs a painted state to start from.
        DispatchQueue.main.async { model.unfurl() }
    }

    private func disappear() {
        #if os(macOS)
        monitor.stop()
        #endif
    }

    private func phaseChanged(_ next: SkinRollerModel.Phase) {
        switch next {
        case .opening:
            DispatchQueue.main.asyncAfter(deadline: .now() + (SkinRollerModel.openMs + SkinRollerModel.rowStaggerMs) / 1000) { model.settleOpen() }
        case .closing:
            #if os(macOS)
            // The board is live again the moment the drum starts folding.
            monitor.stop()
            #endif
            DispatchQueue.main.asyncAfter(deadline: .now() + SkinRollerModel.closeMs / 1000) { model.finish() }
        default:
            break
        }
    }
}

#if os(macOS)
/// The wheel, the trackpad and the keyboard, taken for the drum while it is
/// up. A trackpad's two-finger scroll carries the drum under the fingers
/// (with momentum); a notched wheel steps one skin per notch.
@MainActor
final class SkinRollerEventMonitor {
    private var token: Any?

    func start(model: SkinRollerModel, key: @escaping (KeyEquivalent) -> Bool) {
        guard token == nil else { return }
        token = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .keyDown]) { [weak model] event in
            guard let model, !model.isClosing else { return event }
            switch event.type {
            case .scrollWheel:
                SkinRollerEventMonitor.scroll(event, model: model)
                return nil
            case .keyDown:
                // Menu shortcuts (⌘-anything) still belong to the app.
                if event.modifierFlags.contains(.command) { return event }
                guard let equivalent = SkinRollerEventMonitor.equivalent(event.keyCode) else { return nil }
                _ = key(equivalent)
                return nil
            default:
                return event
            }
        }
    }

    func stop() {
        if let token { NSEvent.removeMonitor(token) }
        token = nil
    }

    private static func scroll(_ event: NSEvent, model: SkinRollerModel) {
        guard event.hasPreciseScrollingDeltas else {
            model.wheelNotch(deltaY: event.scrollingDeltaY)
            return
        }
        let delta = event.scrollingDeltaY
        if !event.momentumPhase.isEmpty {
            if event.momentumPhase.contains(.began) { model.trackBegan(momentum: true) }
            if event.momentumPhase.contains(.ended) || event.momentumPhase.contains(.cancelled) { model.momentumEnded(); return }
            model.track(deltaY: delta, momentum: true)
            return
        }
        if event.phase.isEmpty {
            model.wheelTravel(deltaY: delta)
            return
        }
        if event.phase.contains(.began) || event.phase.contains(.mayBegin) { model.trackBegan() }
        if event.phase.contains(.ended) || event.phase.contains(.cancelled) { model.trackEnded(); return }
        if event.phase.contains(.changed) { model.track(deltaY: delta) }
    }

    private static func equivalent(_ keyCode: UInt16) -> KeyEquivalent? {
        switch keyCode {
        case 53: return .escape
        case 36, 76: return .return
        case 49: return .space
        case 125: return .downArrow
        case 126: return .upArrow
        case 115: return .home
        case 119: return .end
        default: return nil
        }
    }
}
#endif
