#if canImport(UIKit)
import UIKit
import SwiftUI
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome

// ---------------------------------------------------------------------------
// The UIKit canvas host (iPhone, iPad): raw touches go to the gesture
// engine — no UIPinchGestureRecognizer, so the engine's own pinch anchor
// and fling code is what runs, exactly as the tests judge it. A finger is
// `.touch`, a Pencil is `.pen` (it never enters the touch table, so it can
// never pinch or fling, and the live card's own view takes it first, so it
// never pans a text field). Trackpad and mouse on iPad arrive as indirect
// pointer gestures: a pan recognizer restricted to scroll events becomes
// `WheelEvent`s, a pinch recognizer restricted to indirect touches becomes
// zoom-at-cursor, a hover recognizer feeds hover, and a secondary click
// opens the system menu. A held finger on a card shows the system action
// sheet; a held finger on empty canvas opens the widget library.
//
// The live cards live in a transform-driven container (UIKit has no bounds
// scaling); world frames are view frames there. Everything below the event
// layer is `CanvasInteraction`, shared with the Mac.
// ---------------------------------------------------------------------------

/// The world container: transform = camera, subviews in world units.
final class TouchLiveCardsView: UIView {
    weak var canvas: TouchCanvasHostView?

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool { true }

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        guard let canvas else { return nil }
        if canvas.interaction.titleStripWidgetId(atWorld: Vector2D(x: point.x, y: point.y)) != nil { return self }
        let hit = super.hitTest(point, with: event)
        // Empty world under the finger belongs to the canvas view.
        return hit === self ? nil : hit
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) { canvas?.titleTouchesBegan(touches) }
    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) { canvas?.titleTouchesMoved(touches) }
    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { canvas?.titleTouchesEnded(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { canvas?.titleTouchesEnded(touches, cancelled: true) }
}

final class TouchMarqueeView: UIView {
    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        backgroundColor = UIColor.tintColor.withAlphaComponent(0.12)
        layer.borderWidth = 1
        layer.borderColor = UIColor.tintColor.cgColor
    }

    required init?(coder: NSCoder) { nil }
}

public final class TouchCanvasHostView: UIView, UIContextMenuInteractionDelegate, UIPopoverPresentationControllerDelegate, UIGestureRecognizerDelegate {
    public let session: WindowSession
    public let interaction: CanvasInteraction
    public var onSync: (() -> Void)?
    public var mountedRailIds: Set<String> { Set(railControllers.keys) }

    private let cardsView = TouchLiveCardsView()
    private let marqueeView = TouchMarqueeView(frame: .zero)
    private let selectionLayer = CAShapeLayer()
    private var railControllers: [String: UIHostingController<AnyView>] = [:]
    private var contacts = TouchPointerTranslation.ContactTable()
    private var primaryContact: UITouch?
    private var cardPress: (id: String, start: CGPoint, dragging: Bool)?
    private var titleDragTouch: UITouch?
    private var cardHoldTimer: Timer?
    private var pickerController: UIHostingController<AnyView>?
    private var pickerDrop: PendingWireDrop?
    private var inspectorController: UIHostingController<AnyView>?
    private var inspectorConnectionId: String?
    private var lastScrollTranslation = CGPoint.zero
    private var contextMenuModel: ContextMenuModel?

    public init(session: WindowSession, screenScale: CGFloat) {
        self.session = session
        let liveHost = WidgetLiveCardHost(container: nil) { _ in nil }
        interaction = CanvasInteraction(session: session, liveHost: liveHost, screenScale: screenScale, isTouch: true, reducedMotion: { UIAccessibility.isReduceMotionEnabled })
        super.init(frame: CGRect(x: 0, y: 0, width: 390, height: 844))

        isMultipleTouchEnabled = true
        applyInterfaceStyle()
        registerForTraitChanges([UITraitUserInterfaceStyle.self]) { (self: TouchCanvasHostView, _) in self.applyInterfaceStyle() }
        let hostLayer = interaction.controller.hostLayer
        hostLayer.frame = bounds
        layer.addSublayer(hostLayer)

        selectionLayer.fillColor = nil
        selectionLayer.strokeColor = UIColor.tintColor.withAlphaComponent(0.9).cgColor
        selectionLayer.actions = ["path": NSNull(), "lineWidth": NSNull(), "hidden": NSNull()]
        hostLayer.worldLayer.addSublayer(selectionLayer)

        cardsView.canvas = self
        cardsView.backgroundColor = .clear
        cardsView.layer.anchorPoint = .zero
        cardsView.layer.position = .zero
        cardsView.bounds = CGRect(x: 0, y: 0, width: 1, height: 1)
        addSubview(cardsView)
        liveHost.container = cardsView

        marqueeView.isHidden = true
        addSubview(marqueeView)

        let scroll = UIPanGestureRecognizer(target: self, action: #selector(scrollPan(_:)))
        scroll.allowedScrollTypesMask = [.discrete, .continuous]
        scroll.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]
        scroll.maximumNumberOfTouches = 0
        scroll.delegate = self
        addGestureRecognizer(scroll)

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(indirectPinch(_:)))
        pinch.allowedTouchTypes = [NSNumber(value: UITouch.TouchType.indirectPointer.rawValue)]
        pinch.delegate = self
        addGestureRecognizer(pinch)

        let hover = UIHoverGestureRecognizer(target: self, action: #selector(hoverMoved(_:)))
        addGestureRecognizer(hover)

        addInteraction(UIContextMenuInteraction(delegate: self))

        interaction.onCameraFrame = { [weak self] frame in self?.applyCamera(frame) }
        interaction.onSync = { [weak self] in self?.syncPlatform() }
        interaction.onMarquee = { [weak self] rect in
            guard let self else { return }
            guard let rect else { self.marqueeView.isHidden = true; return }
            self.marqueeView.isHidden = false
            self.marqueeView.frame = CGRect(x: rect.x, y: rect.y, width: rect.width, height: rect.height)
        }
        interaction.onLongPress = { [weak self] point in
            guard let self else { return }
            Haptics.shared.tap(.commit)
            self.session.environment.chrome.openAddWidget(at: self.interaction.toWorld(point))
        }
        interaction.onContextMenu = { [weak self] request in self?.presentActionSheet(request) }
        liveHost.onSkinTap = { [weak self] id in self?.presentSkinPicker(for: id) }

        interaction.viewportDidChange(Size(width: bounds.width, height: bounds.height))
        applyCamera(session.camera.frame)
        interaction.start()
    }

    required init?(coder: NSCoder) { nil }

    deinit {
        cardHoldTimer?.invalidate()
    }

    public var document: BoardDocument { session.document }
    public var controller: CanvasHostController { interaction.controller }
    public var liveHost: WidgetLiveCardHost { interaction.liveHost }
    public func fitAll() { interaction.fitAll() }

    public override var canBecomeFirstResponder: Bool { true }

    // MARK: - Layout and camera

    public override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        interaction.controller.hostLayer.frame = bounds
        CATransaction.commit()
        interaction.viewportDidChange(Size(width: bounds.width, height: bounds.height))
        applyCamera(session.camera.frame)
    }

    /// The interaction runs while the view is in a window.
    /// The scene's interface style is the theme (Settings ▸ Appearance, or
    /// the system's when the setting follows it).
    private func applyInterfaceStyle() {
        let dark = traitCollection.userInterfaceStyle != .light
        backgroundColor = UIColor(cgColor: CanvasInteraction.canvasGround(dark: dark))
        interaction.applyAppearance(dark: dark)
    }

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        if let window {
            interaction.controller.hostLayer.screenScale = window.screen.scale
            interaction.start()
        } else {
            interaction.stop()
        }
    }

    private func applyCamera(_ frame: CameraFrame) {
        cardsView.transform = CGAffineTransform(a: frame.zoom, b: 0, c: 0, d: frame.zoom, tx: frame.pan.x, ty: frame.pan.y)
    }

    private func viewportPoint(_ touch: UITouch) -> Vector2D {
        let point = touch.location(in: self)
        return Vector2D(x: point.x, y: point.y)
    }

    private func worldPoint(_ touch: UITouch) -> Vector2D {
        interaction.toWorld(viewportPoint(touch))
    }

    static func contactKind(_ touch: UITouch) -> TouchContactKind {
        switch touch.type {
        case .pencil: return .pencil
        case .indirectPointer: return .indirectPointer
        default: return .finger
        }
    }

    private var isPhone: Bool { session.environment.chrome.adaptation.isPhone }

    // MARK: - Sync (rails, sheets, selection)

    private func syncPlatform() {
        syncRails()
        syncPanels()
        syncSelection()
        onSync?()
    }

    private func syncSelection() {
        let document = session.document
        let selected = document.selection
        let zoom = max(session.camera.frame.zoom, 0.0001)
        guard !selected.isEmpty else { selectionLayer.path = nil; return }
        let context = interaction.restContext()
        let path = CGMutablePath()
        for id in selected {
            guard let widget = document.widget(id), widget.canvasId == document.activeCanvasId else { continue }
            let box = displayedWidgetRect(widget, restContext: context)
            let inset = 3 / zoom
            let rect = CGRect(x: box.x - inset, y: box.y - inset, width: box.width + inset * 2, height: box.height + inset * 2)
            path.addRoundedRect(in: rect, cornerWidth: 12 / zoom, cornerHeight: 12 / zoom)
        }
        selectionLayer.lineWidth = 2 / zoom
        selectionLayer.path = path
    }

    private func syncRails() {
        let document = session.document
        let ui = document.circuitUI
        let context = interaction.restContext()
        let zoom = session.camera.frame.zoom
        var wanted: [String: (GrovepadCore.Widget, PortRail)] = [:]
        // No rails while the circuit system is frozen (`CircuitFeature`).
        for widget in (CircuitFeature.isEnabled ? interaction.activeWidgets : []) {
            let visible = PortRailModel.isVisible(widgetId: widget.id, hoverWidgetId: document.hoverWidgetId, circuitUI: ui) || widget.id == document.expandedWidgetId
            guard visible else { continue }
            let rail = PortRailModel.rail(for: widget, restContext: context)
            if rail.isEmpty { continue }
            wanted[widget.id] = (widget, rail)
        }
        for (id, controller) in railControllers where wanted[id] == nil {
            controller.view.removeFromSuperview()
            railControllers[id] = nil
        }
        for (id, entry) in wanted {
            let (widget, rail) = entry
            let pad = CGFloat(max(PortRailModel.dotDiameter, PortRailModel.touchTarget / max(zoom, 0.0001)) / 2 + 2)
            let frame = rail.frame
            let root = AnyView(
                PortRailView(
                    widget: widget, rail: rail, circuitUI: ui, zoom: zoom, controller: interaction.linking,
                    localToWorld: { point in Vector2D(x: frame.x + Double(point.x), y: frame.y + Double(point.y)) },
                    localToScreen: { [weak self] point in
                        self?.interaction.toScreen(Vector2D(x: frame.x + Double(point.x), y: frame.y + Double(point.y))) ?? .zero
                    }
                )
                .environment(\.touchChrome, true)
                .padding(pad)
            )
            let controller: UIHostingController<AnyView>
            if let existing = railControllers[id] {
                controller = existing
                controller.rootView = root
            } else {
                controller = UIHostingController(rootView: root)
                controller.view.backgroundColor = .clear
                railControllers[id] = controller
                cardsView.addSubview(controller.view)
            }
            controller.view.frame = CGRect(x: CGFloat(frame.x) - pad, y: CGFloat(frame.y) - pad, width: CGFloat(frame.width) + pad * 2, height: CGFloat(frame.height) + pad * 2)
            cardsView.bringSubviewToFront(controller.view)
        }
    }

    /// The field picker and the wire inspector: a bottom sheet on a phone
    /// (medium detent), a popover elsewhere — `circuitPanel`'s rule.
    private func syncPanels() {
        let document = session.document
        let ui = document.circuitUI
        if let drop = ui.pendingDrop {
            if pickerDrop != drop {
                pickerController?.dismiss(animated: false)
                pickerDrop = drop
                let root = AnyView(WireFieldPickerView(controller: interaction.linking, drop: drop).environment(\.touchChrome, true))
                pickerController = present(root, at: drop.screen, size: CGSize(width: 300, height: 360))
            }
        } else if let controller = pickerController {
            pickerDrop = nil
            pickerController = nil
            controller.dismiss(animated: true)
        }

        if let target = ui.inspector {
            if inspectorConnectionId != target.connectionId {
                inspectorController?.dismiss(animated: false)
                inspectorConnectionId = target.connectionId
                let root = AnyView(WireInspectorView(document: document, connectionId: target.connectionId).environment(\.touchChrome, true))
                inspectorController = present(root, at: Vector2D(x: target.x, y: target.y), size: CGSize(width: 320, height: 400))
            }
        } else if let controller = inspectorController {
            inspectorConnectionId = nil
            inspectorController = nil
            controller.dismiss(animated: true)
        }
    }

    /// The skin picker: a popover on the card's icon (a sheet on a phone).
    func presentSkinPicker(for id: String) {
        let document = session.document
        guard let model = SkinPickerModel(document: document, widgetId: id), let widget = document.widget(id) else { return }
        let box = displayedWidgetRect(widget, restContext: interaction.restContext())
        let anchor = interaction.toScreen(Vector2D(x: box.x + 15, y: box.y - widgetTitleRowHeight / 2))
        var controller: UIHostingController<AnyView>?
        let root = AnyView(SkinPickerView(model: model, document: document) { controller?.dismiss(animated: true) }.environment(\.touchChrome, true))
        controller = present(root, at: anchor, size: CGSize(width: 260, height: 400))
    }

    private var presenter: UIViewController? {
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }

    private func present(_ root: AnyView, at screen: Vector2D, size: CGSize) -> UIHostingController<AnyView>? {
        guard let presenter else { return nil }
        let controller = UIHostingController(rootView: root)
        controller.presentationController?.delegate = self
        if isPhone {
            controller.modalPresentationStyle = .pageSheet
            if let sheet = controller.sheetPresentationController {
                sheet.detents = [.medium(), .large()]
                sheet.prefersGrabberVisible = true
            }
        } else {
            controller.modalPresentationStyle = .popover
            controller.preferredContentSize = size
            if let popover = controller.popoverPresentationController {
                popover.sourceView = self
                popover.sourceRect = CGRect(x: screen.x - 2, y: screen.y - 2, width: 4, height: 4)
                popover.delegate = self
            }
        }
        controller.presentationController?.delegate = self
        presenter.present(controller, animated: true)
        return controller
    }

    /// Dismissed by a swipe or a tap outside: the same as the Mac's popover close.
    public func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        let controller = presentationController.presentedViewController
        if controller === pickerController {
            pickerController = nil
            pickerDrop = nil
            interaction.linking.dismissPendingDrop()
        } else if controller === inspectorController {
            inspectorController = nil
            inspectorConnectionId = nil
            session.document.updateCircuitUI { $0.closeInspector() }
        }
    }

    // MARK: - Context menus

    private func presentActionSheet(_ request: ContextMenuRequest) {
        let document = session.document
        guard let presenter, let model = session.contextMenuModel(for: request.widgetId, nativeMenu: true) else { return }
        Haptics.shared.tap(.commit)
        SystemContextMenu.presentActionSheet(
            model: model, document: document, actions: session.contextMenuActions,
            from: CGRect(x: request.x - 2, y: request.y - 2, width: 4, height: 4), in: presenter
        )
    }

    /// A pointer's secondary click on a card (iPad trackpad / mouse).
    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction, configurationForMenuAtLocation location: CGPoint) -> UIContextMenuConfiguration? {
        let document = session.document
        let world = self.interaction.toWorld(Vector2D(x: location.x, y: location.y))
        guard case .card(let id) = self.interaction.pressTarget(atWorld: world),
              let model = session.contextMenuModel(for: id, nativeMenu: true) else { return nil }
        session.environment.chrome.openContextMenu(id, x: location.x, y: location.y, in: document)
        contextMenuModel = model
        let actions = session.contextMenuActions
        return UIContextMenuConfiguration(identifier: nil, previewProvider: nil) { _ in
            SystemContextMenu.menu(model: model, document: document, actions: actions)
        }
    }

    public func contextMenuInteraction(_ interaction: UIContextMenuInteraction, willEndFor configuration: UIContextMenuConfiguration, animator: UIContextMenuInteractionAnimating?) {
        contextMenuModel = nil
        session.environment.chrome.closeContextMenu()
    }

    // MARK: - Touches (fingers and Pencil → the gesture engine)

    public override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        becomeFirstResponder()
        for touch in touches {
            let id = contacts.id(for: touch)
            let contact = TouchCanvasHostView.contactKind(touch)
            let pointer = TouchPointerTranslation.event(id: id, contact: contact, phase: .down, point: viewportPoint(touch), timestampSeconds: touch.timestamp)
            if primaryContact == nil {
                primaryContact = touch
                let target = interaction.pointerDown(pointer)
                if case .card(let cardId) = target, contact == .finger {
                    cardPress = (cardId, touch.location(in: self), false)
                    armCardHold(cardId, at: pointer.point)
                }
            } else {
                // A second contact: the engine's touch table turns it into a pinch.
                cancelCardHold()
                interaction.gesture.pointer(pointer)
            }
        }
    }

    public override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let id = contacts.id(for: touch)
            let pointer = TouchPointerTranslation.event(id: id, contact: TouchCanvasHostView.contactKind(touch), phase: .move, point: viewportPoint(touch), timestampSeconds: touch.timestamp)
            if touch === primaryContact {
                if var press = cardPress {
                    let location = touch.location(in: self)
                    if !press.dragging, CanvasGesturePolicy.pressMoved(from: Vector2D(x: press.start.x, y: press.start.y), to: Vector2D(x: location.x, y: location.y)) {
                        // A finger dragging a resting tile moves the card.
                        press.dragging = true
                        cancelCardHold()
                        interaction.cardDragBegin(press.id, atWorld: worldPoint(touch), additive: false)
                    }
                    cardPress = press
                    if press.dragging { interaction.cardDragMove(toWorld: worldPoint(touch)) }
                }
                interaction.pointerMove(pointer)
            } else {
                interaction.gesture.pointer(pointer)
            }
        }
    }

    public override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        endTouches(touches, phase: .up)
    }

    public override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        endTouches(touches, phase: .cancel)
    }

    private func endTouches(_ touches: Set<UITouch>, phase: PointerPhase) {
        for touch in touches {
            guard let id = contacts.release(touch) else { continue }
            let pointer = TouchPointerTranslation.event(id: id, contact: TouchCanvasHostView.contactKind(touch), phase: phase, point: viewportPoint(touch), timestampSeconds: touch.timestamp)
            if touch === primaryContact {
                primaryContact = nil
                cancelCardHold()
                if let press = cardPress, press.dragging {
                    interaction.cardDragEnd(cancelled: phase == .cancel)
                    cardPress = nil
                    interaction.gesture.pointer(pointer)
                    continue
                }
                cardPress = nil
                interaction.pointerUp(pointer)
            } else {
                interaction.gesture.pointer(pointer)
            }
        }
        if contacts.liveCount == 0 { primaryContact = nil }
    }

    private func armCardHold(_ id: String, at point: Vector2D) {
        cancelCardHold()
        cardHoldTimer = Timer.scheduledTimer(withTimeInterval: GestureTuning.longPressMs / 1000, repeats: false) { [weak self] _ in
            guard let self, let press = self.cardPress, !press.dragging, press.id == id else { return }
            self.cardPress = nil
            self.interaction.requestContextMenu(id, screen: point)
        }
    }

    private func cancelCardHold() {
        cardHoldTimer?.invalidate()
        cardHoldTimer = nil
    }

    // MARK: - Title-strip drags from the cards container

    func titleTouchesBegan(_ touches: Set<UITouch>) {
        guard titleDragTouch == nil, let touch = touches.first else { return }
        let world = Vector2D(x: touch.location(in: cardsView).x, y: touch.location(in: cardsView).y)
        if interaction.titleDragBegin(atWorld: world, additive: false) { titleDragTouch = touch }
    }

    func titleTouchesMoved(_ touches: Set<UITouch>) {
        guard let touch = titleDragTouch, touches.contains(touch) else { return }
        let location = touch.location(in: cardsView)
        interaction.cardDragMove(toWorld: Vector2D(x: location.x, y: location.y))
    }

    func titleTouchesEnded(_ touches: Set<UITouch>, cancelled: Bool = false) {
        guard let touch = titleDragTouch, touches.contains(touch) else { return }
        titleDragTouch = nil
        interaction.cardDragEnd(cancelled: cancelled)
    }

    // MARK: - Indirect pointer (trackpad, mouse)

    @objc private func scrollPan(_ recognizer: UIPanGestureRecognizer) {
        let translation = recognizer.translation(in: self)
        switch recognizer.state {
        case .began:
            lastScrollTranslation = translation
        case .changed:
            let delta = Vector2D(x: -(translation.x - lastScrollTranslation.x), y: -(translation.y - lastScrollTranslation.y))
            lastScrollTranslation = translation
            let location = recognizer.location(in: self)
            let ctrlOrCmd = recognizer.modifierFlags.contains(.command) || recognizer.modifierFlags.contains(.control)
            interaction.wheel(WheelEvent(delta: delta, ctrlOrCmd: ctrlOrCmd, lineMode: false, point: Vector2D(x: location.x, y: location.y)))
        default:
            lastScrollTranslation = .zero
        }
    }

    @objc private func indirectPinch(_ recognizer: UIPinchGestureRecognizer) {
        guard recognizer.state == .changed else { return }
        let location = recognizer.location(in: self)
        interaction.magnify(by: Double(recognizer.scale - 1), at: Vector2D(x: location.x, y: location.y))
        recognizer.scale = 1
    }

    @objc private func hoverMoved(_ recognizer: UIHoverGestureRecognizer) {
        switch recognizer.state {
        case .began, .changed:
            let location = recognizer.location(in: self)
            session.environment.chrome.activeInput = .mouse
            interaction.hover(at: Vector2D(x: location.x, y: location.y))
        default:
            interaction.pointerExited()
        }
    }

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool { true }

    // MARK: - Hardware keyboard (iPad)

    /// `CanvasKey` for a UIKit key, or nil for a key the canvas ignores.
    static func canvasKey(_ code: UIKeyboardHIDUsage) -> CanvasKey? {
        switch code {
        case .keyboardSpacebar: return .space
        case .keyboardDeleteOrBackspace, .keyboardDeleteForward: return .delete
        case .keyboardEscape: return .escape
        case .keyboardZ: return .z
        case .keyboardW: return .w
        case .keyboardH: return .h
        case .keyboardV: return .v
        case .keyboardF: return .f
        case .keyboardN: return .n
        case .keyboardX: return .x
        case .keyboardEqualSign, .keypadPlus: return .plus
        case .keyboardHyphen, .keypadHyphen: return .minus
        case .keyboard0, .keypad0: return .zero
        case .keyboardSlash: return .question
        case .keyboardF2: return .f2
        case .keyboardLeftArrow: return .arrow(.left)
        case .keyboardRightArrow: return .arrow(.right)
        case .keyboardUpArrow: return .arrow(.up)
        case .keyboardDownArrow: return .arrow(.down)
        default: return nil
        }
    }

    static func keyModifiers(_ flags: UIKeyModifierFlags) -> CanvasKeyModifiers {
        var result: CanvasKeyModifiers = []
        if flags.contains(.command) { result.insert(.command) }
        if flags.contains(.shift) { result.insert(.shift) }
        if flags.contains(.alternate) { result.insert(.option) }
        if flags.contains(.control) { result.insert(.control) }
        return result
    }

    /// Whether a text view owns the keyboard (the web's `isEditableTarget`):
    /// key presses bubble up from a live card's editor to this host, and
    /// those keystrokes are the editor's, never the canvas's.
    var editableTargetFocused: Bool {
        KeyboardTargetGuard.isEditable(KeyboardTargetGuard.firstResponder(in: window))
    }

    public override func pressesBegan(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        var handled = false
        let editing = editableTargetFocused
        for press in presses {
            guard let key = press.key, let canvasKey = TouchCanvasHostView.canvasKey(key.keyCode),
                  let action = CanvasKeyRouting.keyDown(canvasKey, modifiers: TouchCanvasHostView.keyModifiers(key.modifierFlags), isRepeat: false, editableTargetFocused: editing)
            else { continue }
            perform(action)
            handled = true
        }
        if !handled { super.pressesBegan(presses, with: event) }
    }

    public override func pressesEnded(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        release(presses)
        super.pressesEnded(presses, with: event)
    }

    public override func pressesCancelled(_ presses: Set<UIPress>, with event: UIPressesEvent?) {
        release(presses)
        super.pressesCancelled(presses, with: event)
    }

    private func release(_ presses: Set<UIPress>) {
        let editing = editableTargetFocused
        for press in presses {
            guard let key = press.key, let canvasKey = TouchCanvasHostView.canvasKey(key.keyCode),
                  let action = CanvasKeyRouting.keyUp(canvasKey, editableTargetFocused: editing)
            else { continue }
            perform(action)
        }
    }

    func perform(_ action: CanvasKeyAction) { interaction.perform(action) }
}

/// `RootScene`'s canvas slot on iPhone and iPad: the touch host in SwiftUI.
/// The host re-reads the screen scale when it lands in a window.
public struct TouchCanvasSlot: UIViewRepresentable {
    public let session: WindowSession

    public init(session: WindowSession) {
        self.session = session
    }

    public func makeUIView(context: Context) -> TouchCanvasHostView {
        TouchCanvasHostView(session: session, screenScale: UITraitCollection.current.displayScale)
    }

    public func updateUIView(_ view: TouchCanvasHostView, context: Context) {}
}
#endif
