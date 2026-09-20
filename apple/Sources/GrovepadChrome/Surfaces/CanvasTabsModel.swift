import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// The open-canvas row (`store/canvasTabs.ts`, `CanvasTabs.tsx`). A tab is a
// pointer, not a document. One invariant: the active tab always points at
// the document's active canvas. `resolveCanvasTabs` (GrovepadCore) repairs
// the row after any write that can remove a canvas; the pure row edits
// below are ported here, and each returns a position that keeps the law.
// ---------------------------------------------------------------------------

public enum CanvasTabRow {
    public typealias Position = DeviceStateCodec.CanvasTabPosition

    /// `insertCanvasTab`: right of the active one, like a browser.
    public static func insert(_ position: Position, canvasId: String, activate: Bool = true, mint: IdMinter = .system) -> Position {
        let tab = CanvasTab(id: mint(), canvasId: canvasId)
        var openTabs = position.openTabs
        let activeIndex = openTabs.firstIndex { $0.id == position.activeTabId }
        openTabs.insert(tab, at: activeIndex.map { $0 + 1 } ?? openTabs.count)
        return activate
            ? Position(openTabs: openTabs, activeTabId: tab.id, activeCanvasId: canvasId)
            : Position(openTabs: openTabs, activeTabId: position.activeTabId, activeCanvasId: position.activeCanvasId)
    }

    /// `closeCanvasTab`: nil when refused — the last tab never closes.
    public static func close(_ position: Position, tabId: String) -> Position? {
        guard let index = position.openTabs.firstIndex(where: { $0.id == tabId }), position.openTabs.count > 1 else { return nil }
        let openTabs = position.openTabs.filter { $0.id != tabId }
        if tabId != position.activeTabId {
            return Position(openTabs: openTabs, activeTabId: position.activeTabId, activeCanvasId: position.activeCanvasId)
        }
        let next = index < openTabs.count ? openTabs[index] : openTabs[index - 1]
        return Position(openTabs: openTabs, activeTabId: next.id, activeCanvasId: next.canvasId)
    }

    /// `neighbourCanvasTabId`: `delta` steps away, wrapping.
    public static func neighbour(_ openTabs: [CanvasTab], activeTabId: String, delta: Int) -> String? {
        guard openTabs.count >= 2 else { return nil }
        guard let index = openTabs.firstIndex(where: { $0.id == activeTabId }) else { return openTabs[0].id }
        let count = openTabs.count
        return openTabs[(((index + delta) % count) + count) % count].id
    }

    /// `reorderCanvasTabs`: dropping onto a tab to the right takes ITS slot.
    public static func reorder(_ openTabs: [CanvasTab], sourceId: String, targetId: String) -> [CanvasTab] {
        guard sourceId != targetId,
              let sourceIndex = openTabs.firstIndex(where: { $0.id == sourceId }),
              let targetIndex = openTabs.firstIndex(where: { $0.id == targetId }) else { return openTabs }
        let source = openTabs[sourceIndex]
        var remaining = openTabs.filter { $0.id != sourceId }
        let at = remaining.firstIndex { $0.id == targetId }! + (sourceIndex < targetIndex ? 1 : 0)
        remaining.insert(source, at: at)
        return remaining
    }
}

@Observable
public final class CanvasTabsModel {
    public let document: BoardDocument
    public private(set) var openTabs: [CanvasTab]
    public private(set) var activeTabId: String
    @ObservationIgnored private let mint: IdMinter
    @ObservationIgnored private var unsubscribe: (() -> Void)?

    /// Seeds from the device state (or one tab on the active canvas) and
    /// follows the document from then on.
    public init(document: BoardDocument, deviceState: DeviceState? = nil, mint: IdMinter = .system) {
        self.document = document
        self.mint = mint
        let seed = DeviceStateCodec.resolveCanvasTabs(
            openTabs: deviceState?.openTabs ?? [],
            activeTabId: deviceState?.activeTabId ?? "",
            activeCanvasId: document.activeCanvasId,
            canvases: document.board.canvases,
            mint: mint
        )
        openTabs = seed.openTabs
        activeTabId = seed.activeTabId
        unsubscribe = document.subscribe { [weak self] in self?.resolve() }
    }

    deinit { unsubscribe?() }

    public var position: CanvasTabRow.Position {
        CanvasTabRow.Position(openTabs: openTabs, activeTabId: activeTabId, activeCanvasId: document.activeCanvasId)
    }

    /// Repair against the canvases that still exist and the canvas the
    /// document now shows. Called after every document commit and after
    /// every navigation the chrome performs.
    public func resolve() {
        let next = DeviceStateCodec.resolveCanvasTabs(
            openTabs: openTabs, activeTabId: activeTabId,
            activeCanvasId: document.activeCanvasId, canvases: document.board.canvases, mint: mint
        )
        if next.openTabs != openTabs { openTabs = next.openTabs }
        if next.activeTabId != activeTabId { activeTabId = next.activeTabId }
    }

    /// A plain navigation: the active tab follows the canvas (breadcrumbs,
    /// tree, search, canvas card).
    public func navigate(to canvasId: String) {
        document.navigate(to: canvasId)
        resolve()
    }

    /// `openCanvasTab`.
    public func open(_ canvasId: String, activate: Bool = true) {
        guard document.board.canvases.contains(canvasId) else { return }
        let next = CanvasTabRow.insert(position, canvasId: canvasId, activate: activate, mint: mint)
        openTabs = next.openTabs
        if activate {
            activeTabId = next.activeTabId
            document.navigate(to: canvasId)
            resolve()
        }
    }

    /// `closeCanvasTab`; false when the last tab refused.
    @discardableResult
    public func close(_ tabId: String) -> Bool {
        guard let next = CanvasTabRow.close(position, tabId: tabId) else { return false }
        openTabs = next.openTabs
        if next.activeTabId != activeTabId {
            activeTabId = next.activeTabId
            document.navigate(to: next.activeCanvasId)
        }
        resolve()
        return true
    }

    /// `activateCanvasTab`.
    public func activate(_ tabId: String) {
        guard let tab = openTabs.first(where: { $0.id == tabId }) else { return }
        activeTabId = tab.id
        document.navigate(to: tab.canvasId)
        resolve()
    }

    /// `next-tab` / `previous-tab`; false when this is the only tab.
    @discardableResult
    public func step(_ delta: Int) -> Bool {
        guard let next = CanvasTabRow.neighbour(openTabs, activeTabId: activeTabId, delta: delta) else { return false }
        activate(next)
        return true
    }

    public func reorder(_ sourceId: String, onto targetId: String) {
        openTabs = CanvasTabRow.reorder(openTabs, sourceId: sourceId, targetId: targetId)
    }

    public func name(of tab: CanvasTab) -> String { document.canvasName(tab.canvasId) ?? "Canvas" }

    public var rootCanvasId: String? { document.board.workspaces[document.activeWorkspaceId]?.rootCanvasId }

    /// `isCanvasTabRowVisible`.
    public func isRowVisible(_ adaptation: ChromeAdaptation) -> Bool {
        ChromeAdaptation.isCanvasTabRowVisible(adaptation.viewportClass, openTabCount: openTabs.count)
    }

    /// The device state to persist (cameras come from the canvas host).
    public func deviceState(canvasViews: OrderedMap<CanvasView>) -> DeviceState {
        DeviceState(activeWorkspaceId: document.activeWorkspaceId, activeCanvasId: document.activeCanvasId, canvasViews: canvasViews, openTabs: openTabs, activeTabId: activeTabId)
    }
}
