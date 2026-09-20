import Foundation
import Observation
import GrovepadCore
import GrovepadChrome

// ---------------------------------------------------------------------------
// The ticks the web names (`utils/haptics.ts`: detent, commit, limit) on
// the surfaces the port has: a wire connected → commit; cards deleted →
// commit; Circuit Mode toggled → detent. A tick is advisory and reports
// something the document has ALREADY done, so this listens to commits and
// the circuit UI instead of asking every surface to remember to call it.
// The skin roller reports its own detent / limit / commit ticks
// (`SkinRollerModel`, wired by the canvas host).
// ---------------------------------------------------------------------------

@MainActor
public final class HapticWiring {
    public let haptics: Haptics
    private let document: BoardDocument
    private var unsubscribe: (() -> Void)?
    private var widgetCount: Int
    private var connectionCount: Int
    private var circuitMode: Bool
    private var observing = false
    private var stopped = false

    public init(document: BoardDocument, haptics: Haptics) {
        self.document = document
        self.haptics = haptics
        widgetCount = document.board.widgets.count
        connectionCount = document.board.connections.count
        circuitMode = document.circuitUI.circuitMode
    }

    public func start() {
        guard unsubscribe == nil else { return }
        unsubscribe = document.subscribe { [weak self] in self?.documentDidCommit() }
        observeCircuitMode()
    }

    public func stop() {
        stopped = true
        unsubscribe?()
        unsubscribe = nil
    }

    /// Only a person's own edit ticks: an undo / redo, or a board load
    /// (import, sync) that cleared the undo stack, is silent — a tick reports
    /// something the finger just did, not something that arrived.
    private func documentDidCommit() {
        let widgets = document.board.widgets.count
        let connections = document.board.connections.count
        defer {
            widgetCount = widgets
            connectionCount = connections
        }
        if let undo = document.undoManager, undo.isUndoing || undo.isRedoing || !undo.canUndo { return }
        if widgets < widgetCount { haptics.tap(.commit) }
        if connections > connectionCount { haptics.tap(.commit) }
    }

    private func observeCircuitMode() {
        guard !observing, !stopped else { return }
        observing = true
        withObservationTracking { [document] in
            _ = document.circuitUI.circuitMode
        } onChange: { [weak self] in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.observing = false
                let next = self.document.circuitUI.circuitMode
                if next != self.circuitMode {
                    self.circuitMode = next
                    self.haptics.tap(.detent)
                }
                self.observeCircuitMode()
            }
        }
    }
}
