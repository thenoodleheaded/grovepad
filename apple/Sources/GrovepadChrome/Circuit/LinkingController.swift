import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// Linking mode — the wire-drag state machine (`PortRail.tsx` beginWire /
// moveWire / endWire / connectToPort, the field picker's `pick`, and the
// Escape path in CanvasViewport.tsx). The controller owns no state of its
// own: the session lives in the document's `CircuitUIState` (`wireDrag`,
// `pendingDrop`) and every wire lands through the document's connection
// actions, so a drag, a tap and the picker can never disagree about what a
// wire is. Everything returns or mutates plain state; no SwiftUI.
//
// Drop resolution reads the same on-screen footprints the rails paint on
// (`displayedWidgetRect` over the injected `RestContext`), and ports win
// over card bodies (`findWireTarget`).
// ---------------------------------------------------------------------------

public final class LinkingController {
    public enum DropOutcome: Equatable {
        /// A wire was drawn (its connection id).
        case connected(String)
        /// The drop landed on a card body: the field picker is open.
        case pendingDrop(String)
        /// Nothing under the cursor, or the wire could not be drawn.
        case cancelled
        /// No drag was in flight.
        case idle
    }

    public let document: BoardDocument
    /// The footprint context a drop resolves against — the same pair the
    /// rail is drawn with. Injected because the expanded card lives in the
    /// document's rest state and the tile sizes in the renderer registry.
    public var restContext: () -> RestContext
    /// Mints connection ids; nil uses the document's own minter.
    public var mint: IdMinter?

    public init(document: BoardDocument, restContext: @escaping () -> RestContext, mint: IdMinter? = nil) {
        self.document = document
        self.restContext = restContext
        self.mint = mint
    }

    public var drag: WireDrag? { document.circuitUI.wireDrag }
    public var pendingDrop: PendingWireDrop? { document.circuitUI.pendingDrop }
    public var isDragging: Bool { drag != nil }

    // MARK: - Drag

    /// `beginWire`: start a ghost wire out of an output port. A second press
    /// on the same output cancels the drag instead (the tap path's disarm).
    /// Returns whether a drag is now in flight.
    @discardableResult
    public func beginDrag(fromWidget widgetId: String, field key: String, at world: Vector2D) -> Bool {
        if let drag, drag.fromId == widgetId, drag.fromField == key {
            document.updateCircuitUI { $0.endWireDrag() }
            return false
        }
        guard let widget = document.widget(widgetId), let port = findOutputPort(widget.type, key) else { return false }
        document.updateCircuitUI { ui in
            ui.endWireDrag()
            ui.startWireDrag(fromId: widgetId, fromField: key, valueType: port.valueType ?? .text, cursorWorld: world)
        }
        return true
    }

    /// `moveWire`: the ghost follows the cursor and the input port under it
    /// glows (`hover`). Ports win over bodies; a body under the cursor is
    /// not a hover.
    public func moveDrag(toWorld world: Vector2D) {
        guard let drag else { return }
        let hit = hitTest(world: world, excluding: drag.fromId)
        var hover: PortHover?
        if let hit, let portIndex = hit.portIndex, let target = document.widget(hit.widgetId) {
            let ports = inputPortsFor(target.type)
            if ports.indices.contains(portIndex) {
                hover = PortHover(widgetId: hit.widgetId, portKey: ports[portIndex].key, portKind: ports[portIndex].kind)
            }
        }
        document.updateCircuitUI { $0.updateWireDrag(cursorWorld: world, hover: hover) }
    }

    /// `endWire`: drop on an input port binds; drop on a card body opens the
    /// field picker (`pendingDrop`, anchored at `screen`); drop on canvas
    /// cancels.
    @discardableResult
    public func endDrag(atWorld world: Vector2D, screen: Vector2D = .zero) -> DropOutcome {
        guard let drag else { return .idle }
        guard let hit = hitTest(world: world, excluding: drag.fromId) else {
            document.updateCircuitUI { $0.endWireDrag() }
            return .cancelled
        }
        if let portIndex = hit.portIndex, let target = document.widget(hit.widgetId) {
            let ports = inputPortsFor(target.type)
            guard ports.indices.contains(portIndex) else {
                document.updateCircuitUI { $0.endWireDrag() }
                return .cancelled
            }
            if let id = connect(drag: drag, to: hit.widgetId, port: ports[portIndex]) {
                return .connected(id)
            }
            document.updateCircuitUI { $0.endWireDrag() }
            return .cancelled
        }
        // Dropped on a card body — the field picker resolves which input.
        document.updateCircuitUI { ui in
            ui.setPendingDrop(PendingWireDrop(fromId: drag.fromId, fromField: drag.fromField, valueType: drag.valueType, toId: hit.widgetId, screen: screen))
            ui.endWireDrag()
        }
        return .pendingDrop(hit.widgetId)
    }

    /// Escape, pointer cancel, or a pan that swallowed the press.
    public func cancelDrag() {
        guard isDragging else { return }
        document.updateCircuitUI { $0.endWireDrag() }
    }

    // MARK: - Touch path (tap an output, then tap an input)

    /// A tap on an output arms it: the ghost stays parked on the dot and
    /// every input on every other card lights up. A second tap on the same
    /// output disarms. Returns whether a source is now armed.
    @discardableResult
    public func tapOutput(widget widgetId: String, field key: String) -> Bool {
        guard let widget = document.widget(widgetId), let port = findOutputPort(widget.type, key) else { return false }
        let frame = displayedWidgetRect(widget, restContext: restContext())
        let at = PortGeometry.portWorldPosition(frame: frame, side: .output, index: port.index, count: outputPortsFor(widget.type).count)
        return beginDrag(fromWidget: widgetId, field: key, at: at)
    }

    /// A tap on an input completes the armed wire. Returns the connection id.
    @discardableResult
    public func tapInput(widget widgetId: String, port: PortSpec) -> String? {
        guard let drag else { return nil }
        return connect(drag: drag, to: widgetId, port: port)
    }

    /// The armed source, if the tap path is mid-way.
    public var armedSource: (widgetId: String, field: String)? {
        drag.map { ($0.fromId, $0.fromField) }
    }

    // MARK: - Binding

    /// `connectToPort`: a field port takes a value wire (single-writer
    /// replacement through the document, transform prefilled from the
    /// semantic units); a command port takes a trigger wire whose edge is
    /// `rising` for a boolean source and `change` for everything else, as
    /// the web draws it. Ends the drag on success.
    @discardableResult
    public func connect(drag: WireDrag, to targetId: String, port: PortSpec) -> String? {
        guard drag.fromId != targetId, let source = document.widget(drag.fromId) else { return nil }
        let id: String?
        if port.kind == .field {
            let sourceUnit = findOutputPort(source.type, drag.fromField)?.unit
            id = document.addValueConnection(
                from: drag.fromId, field: drag.fromField, to: targetId, field: port.key,
                transform: WireTransform.suggested(from: sourceUnit, to: port.unit), mint: mint
            )
        } else {
            id = document.addTriggerConnection(
                from: drag.fromId, field: drag.fromField, to: targetId, command: port.key,
                edge: drag.valueType == .boolean ? .rising : .change, mint: mint
            )
        }
        if id != nil { document.updateCircuitUI { $0.endWireDrag() } }
        return id
    }

    /// The field picker's `pick`: the pending body drop lands on `port`.
    @discardableResult
    public func resolvePendingDrop(port: PortSpec) -> String? {
        guard let drop = pendingDrop else { return nil }
        let drag = WireDrag(fromId: drop.fromId, fromField: drop.fromField, valueType: drop.valueType, cursorWorld: .zero)
        let id = connect(drag: drag, to: drop.toId, port: port)
        document.updateCircuitUI { $0.setPendingDrop(nil) }
        return id
    }

    public func dismissPendingDrop() {
        guard pendingDrop != nil else { return }
        document.updateCircuitUI { $0.setPendingDrop(nil) }
    }

    /// The input ports the picker lists for the pending drop's target.
    public var pendingDropPorts: [PortSpec] {
        guard let drop = pendingDrop, let target = document.widget(drop.toId) else { return [] }
        return inputPortsFor(target.type)
    }

    // MARK: - Hit testing

    /// Every card on the active canvas as a drop candidate, over the box its
    /// rail is drawn on. Cards without inputs are skipped by `findWireTarget`.
    public func candidates() -> [WireTargetCandidate] {
        let context = restContext()
        return document.board.widgets(on: document.activeCanvasId).map { widget in
            WireTargetCandidate(
                id: widget.id,
                frame: displayedWidgetRect(widget, restContext: context),
                zIndex: widget.metadata.zIndex ?? 0,
                inputPortCount: inputPortsFor(widget.type).count
            )
        }
    }

    public func hitTest(world: Vector2D, excluding excludeId: String?) -> WireTargetHit? {
        findWireTarget(world: world, candidates: candidates(), excludeId: excludeId)
    }
}
