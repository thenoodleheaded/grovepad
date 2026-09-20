import Foundation
import Observation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The command palette (`CommandPalette.tsx`, `utils/commandPaletteAvailability.ts`,
// `searchWidgets` in `uiLinkingSlice.ts`, `fuzzyScore` in `widgetSizing.ts`).
// Search is the identity of the surface: results are actions (the static
// registry, filtered by availability), "New <widget>" creators (public,
// pack-gated types), and widgets/canvases of the active workspace. An empty
// query is a jump list: recent canvases, then the top cards. Navigation
// results jump canvases; the executor's list is ported where it applies
// natively (import, packs, critical path and untangle are not here yet).
// ---------------------------------------------------------------------------

public enum PaletteFuzzy {
    /// `fuzzyScore`: 3 substring, 2 every word, 1 subsequence, 0 miss.
    public static func score(_ query: String, _ target: String) -> Int {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let t = target.lowercased()
        if q.isEmpty { return 0 }
        if t.contains(q) { return 3 }
        let words = q.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        if words.count > 1, words.allSatisfy({ t.contains($0) }) { return 2 }
        return isSubsequence(q, of: t) ? 1 : 0
    }

    /// `matchesQuery`: substring or subsequence; the empty query matches.
    public static func matches(_ query: String, _ text: String) -> Bool {
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if q.isEmpty { return true }
        let t = text.lowercased()
        return t.contains(q) || isSubsequence(q, of: t)
    }

    static func isSubsequence(_ q: String, of t: String) -> Bool {
        var qi = q.startIndex
        for ch in t where qi < q.endIndex {
            if ch == q[qi] { qi = q.index(after: qi) }
        }
        return qi == q.endIndex
    }

    /// `widgetContentText`: the human strings inside a card's data.
    public static func contentText(_ data: JSONObject) -> String {
        var parts: [String] = []
        var budget = 4000
        func walk(_ value: JSONValue) {
            guard budget > 0 else { return }
            switch value {
            case .string(let text):
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty || trimmed.hasPrefix("data:") { return }
                if trimmed.count > 200, !trimmed.contains(" ") { return }
                parts.append(trimmed)
                budget -= trimmed.count + 1
            case .array(let items): items.forEach(walk)
            case .object(let object): object.values.forEach(walk)
            default: return
            }
        }
        walk(.object(data))
        let joined = parts.joined(separator: " ").split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        return String(joined.prefix(4000))
    }

    /// `contentExcerpt`: a window around the first hit, for the subtitle.
    public static func excerpt(_ content: String, query: String, radius: Int = 32) -> String {
        let needle = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let lower = content.lowercased()
        let hit = needle.isEmpty ? nil : lower.range(of: needle)
        let index = hit.map { lower.distance(from: lower.startIndex, to: $0.lowerBound) } ?? -1
        let start = index >= 0 ? max(0, index - radius) : 0
        let end = min(content.count, (index >= 0 ? index + needle.count : 0) + radius)
        let sliceEnd = min(content.count, max(end, start + radius * 2))
        let chars = Array(content)
        let slice = String(chars[start..<sliceEnd]).trimmingCharacters(in: .whitespaces)
        let prefix = start > 0 ? "…" : ""
        let suffix = start + slice.count < content.count ? "…" : ""
        return prefix + slice + suffix
    }
}

public struct PaletteResult: Equatable, Identifiable, Sendable {
    public enum Kind: Sendable { case action, widget, canvas }
    public var id: String
    public var kind: Kind
    public var title: String
    public var subtitle: String
    public var canvasId: String?
    /// World centre of a card, for the leap.
    public var position: Vector2D
    public var isCreate: Bool { id.hasPrefix(CommandPaletteModel.createPrefix) }
}

public enum PaletteCategory: String, CaseIterable, Sendable {
    case all, actions, widgets
    public var label: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
}

/// The static action registry, ported where it applies natively.
public struct PaletteAction: Sendable {
    public var id: String
    public var title: String
    public var subtitle: String
}

/// The services a palette action reaches (`ACTION_RUN_MAP`).
public struct PaletteServices {
    public var camera: ChromeCamera?
    public var openShortcuts: () -> Void
    public var openSettingsData: () -> Void
    public var openTree: () -> Void
    public var copyToClipboard: (String) -> Void

    public init(camera: ChromeCamera? = nil, openShortcuts: @escaping () -> Void = {}, openSettingsData: @escaping () -> Void = {}, openTree: @escaping () -> Void = {}, copyToClipboard: @escaping (String) -> Void = { _ in }) {
        self.camera = camera
        self.openShortcuts = openShortcuts
        self.openSettingsData = openSettingsData
        self.openTree = openTree
        self.copyToClipboard = copyToClipboard
    }
}

@Observable
public final class CommandPaletteModel {
    public static let createPrefix = "action-create-"
    public static let actions: [PaletteAction] = [
        PaletteAction(id: "action-undo", title: "Undo", subtitle: "Revert the last board change (⌘Z)"),
        PaletteAction(id: "action-redo", title: "Redo", subtitle: "Reapply the last undone change (⇧⌘Z)"),
        PaletteAction(id: "action-shortcuts", title: "Keyboard Shortcuts", subtitle: "Show every shortcut and gesture (?)"),
        PaletteAction(id: "action-fit-all", title: "Fit Board to View", subtitle: "Frame every widget on the current canvas (F)"),
        PaletteAction(id: "action-canvas-tree", title: "Canvas Tree", subtitle: "Open the canvas and card outline"),
        PaletteAction(id: "action-domain-packs", title: "Open Domain Packs", subtitle: "Enable specialist widget libraries"),
        PaletteAction(id: "action-zoom-in", title: "Zoom In", subtitle: "Scale the canvas viewport up by 25%"),
        PaletteAction(id: "action-zoom-out", title: "Zoom Out", subtitle: "Scale the canvas viewport down by 25%"),
    ]

    public let document: BoardDocument
    public let chrome: ChromeState
    public let tabs: CanvasTabsModel
    public var query = ""
    public var category: PaletteCategory = .all
    public var focusedIndex = 0
    @ObservationIgnored public var services: PaletteServices
    @ObservationIgnored private let mint: IdMinter?

    public init(document: BoardDocument, chrome: ChromeState, tabs: CanvasTabsModel, services: PaletteServices = PaletteServices(), mint: IdMinter? = nil) {
        self.document = document
        self.chrome = chrome
        self.tabs = tabs
        self.services = services
        self.mint = mint
    }

    /// `historyPaletteActionIds`: inert Undo/Redo are omitted, not disabled.
    public static func historyActionIds(canUndo: Bool, canRedo: Bool) -> [String] {
        [canUndo ? "action-undo" : nil, canRedo ? "action-redo" : nil].compactMap { $0 }
    }

    public var availableActionIds: [String] {
        let history = Set(CommandPaletteModel.historyActionIds(canUndo: document.canUndo, canRedo: document.canRedo))
        return CommandPaletteModel.actions.map(\.id).filter { id in
            id == "action-undo" || id == "action-redo" ? history.contains(id) : true
        }
    }

    /// `open`: reset, pre-filled by the `find` verb when one is pending.
    public func open() {
        query = chrome.paletteInitialQuery ?? ""
        chrome.paletteInitialQuery = nil
        category = .all
        focusedIndex = 0
        chrome.paletteOpen = true
    }

    public func close() { chrome.paletteOpen = false }

    public func setQuery(_ text: String) {
        query = text
        focusedIndex = 0
    }

    public func setCategory(_ next: PaletteCategory) {
        category = next
        focusedIndex = 0
    }

    public func moveFocus(by delta: Int) {
        let count = results.count
        focusedIndex = count == 0 ? 0 : min(max(0, focusedIndex + delta), count - 1)
    }

    public var focusedResult: PaletteResult? {
        let list = results
        return list.indices.contains(focusedIndex) ? list[focusedIndex] : nil
    }

    /// `searchWidgets`: cards and canvases of the active workspace by score.
    public func searchWidgets(_ query: String) -> [PaletteResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return [] }
        let board = document.board
        var scored: [(PaletteResult, Int)] = []
        for widget in board.widgets.values {
            guard let canvas = board.canvases[widget.canvasId], canvas.workspaceId == document.activeWorkspaceId else { continue }
            let typeLabel = WidgetRegistry.definition(for: widget.type)?.label ?? widget.type
            let titleScore = PaletteFuzzy.score(trimmed, widget.title)
            let typeScore = PaletteFuzzy.score(trimmed, typeLabel)
            let content = PaletteFuzzy.contentText(widget.data)
            let rawContent = content.isEmpty ? 0 : PaletteFuzzy.score(trimmed, content)
            let contentScore = rawContent >= 2 ? rawContent : 0
            let score = max(titleScore, typeScore, contentScore)
            guard score > 0 else { continue }
            let subtitle: String
            if contentScore > 0, titleScore == 0, typeScore == 0 {
                subtitle = "\(typeLabel) · “\(PaletteFuzzy.excerpt(content, query: trimmed))”"
            } else if widget.canvasId != document.activeCanvasId {
                subtitle = "\(typeLabel) · \(canvas.name)"
            } else {
                subtitle = typeLabel
            }
            scored.append((PaletteResult(id: widget.id, kind: .widget, title: widget.title, subtitle: subtitle, canvasId: widget.canvasId, position: widget.frame.center), score))
        }
        for canvas in board.canvases.values where canvas.workspaceId == document.activeWorkspaceId && canvas.id != document.activeCanvasId {
            let score = PaletteFuzzy.score(trimmed, canvas.name)
            guard score > 0 else { continue }
            scored.append((PaletteResult(id: canvas.id, kind: .canvas, title: canvas.name, subtitle: canvas.parentCanvasId != nil ? "Canvas" : "Workspace root", canvasId: canvas.id, position: .zero), score))
        }
        // Stable by score, insertion order otherwise (JS sort is stable).
        return scored.enumerated().sorted { lhs, rhs in
            lhs.element.1 != rhs.element.1 ? lhs.element.1 > rhs.element.1 : lhs.offset < rhs.offset
        }.map(\.element.0)
    }

    public var results: [PaletteResult] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let board = document.board
        let createResults = WidgetRegistry.orderedDefinitions().filter { definition in
            definition.isOffered
        }.map { definition in
            PaletteResult(id: CommandPaletteModel.createPrefix + definition.type, kind: .action, title: "New \(definition.label)", subtitle: "Create widget at the view center", canvasId: nil, position: .zero)
        }.filter { PaletteFuzzy.matches(trimmed, $0.title) }

        let available = Set(availableActionIds)
        var actionResults = CommandPaletteModel.actions
            .filter { available.contains($0.id) }
            .filter { PaletteFuzzy.matches(trimmed, $0.title) || PaletteFuzzy.matches(trimmed, $0.subtitle) }
            .map { PaletteResult(id: $0.id, kind: .action, title: $0.title, subtitle: $0.subtitle, canvasId: nil, position: .zero) }
        actionResults.append(contentsOf: createResults)

        var widgetResults = trimmed.isEmpty ? [] : searchWidgets(trimmed)
        if trimmed.isEmpty {
            let canvasResults = chrome.canvasVisits.compactMap { board.canvases[$0] }
                .filter { $0.workspaceId == document.activeWorkspaceId && $0.id != document.activeCanvasId }
                .prefix(4)
                .map { PaletteResult(id: $0.id, kind: .canvas, title: $0.name, subtitle: "Recent canvas", canvasId: $0.id, position: .zero) }
            let widgetRows = board.widgets.values
                .filter { board.canvases[$0.canvasId]?.workspaceId == document.activeWorkspaceId }
                .enumerated()
                .sorted { lhs, rhs in
                    let l = lhs.element.metadata.zIndex ?? 0, r = rhs.element.metadata.zIndex ?? 0
                    return l != r ? l > r : lhs.offset < rhs.offset
                }
                .prefix(6)
                .map { PaletteResult(id: $0.element.id, kind: .widget, title: $0.element.title, subtitle: WidgetRegistry.definition(for: $0.element.type)?.label ?? $0.element.type, canvasId: $0.element.canvasId, position: $0.element.frame.center) }
            widgetResults = Array(canvasResults) + widgetRows
        }

        if let value = PaletteMath.evaluate(trimmed) {
            actionResults.insert(PaletteResult(id: "math:\(JSNumberFormatter.string(value))", kind: .action, title: "= \(JSNumberFormatter.string(value))", subtitle: "Copy quick answer", canvasId: nil, position: .zero), at: 0)
        }
        if !trimmed.isEmpty, actionResults.isEmpty, widgetResults.isEmpty {
            actionResults.append(PaletteResult(id: "note:\(trimmed)", kind: .action, title: "Create “\(trimmed)”", subtitle: "New notes widget", canvasId: nil, position: .zero))
        }

        let shownActions = trimmed.isEmpty ? Array(actionResults.prefix(4)) : actionResults
        switch category {
        case .actions: return shownActions
        case .widgets: return widgetResults
        case .all: return shownActions + widgetResults
        }
    }

    /// `execute`: create, copy, note, registry action, or leap.
    public func execute(_ result: PaletteResult) {
        switch result.kind {
        case .action:
            if result.isCreate {
                spawn(type: String(result.id.dropFirst(CommandPaletteModel.createPrefix.count)))
            } else if result.id.hasPrefix("math:") {
                services.copyToClipboard(String(result.id.dropFirst(5)))
                close()
            } else if result.id.hasPrefix("note:") {
                let world = services.camera?.viewCenterWorld ?? .zero
                if let id = document.createWidget(type: "text", at: world, title: String(result.id.dropFirst(5)), mint: mint) { document.select(id) }
                close()
            } else {
                runAction(result.id)
            }
        case .widget, .canvas:
            leap(to: result)
            close()
        }
    }

    func spawn(type: String) {
        let world = services.camera?.viewCenterWorld ?? .zero
        let title = WidgetRegistry.definition(for: type)?.label ?? "Widget"
        guard let id = document.createWidget(type: type, at: world, title: title, mint: mint) else { return }
        document.select(id)
        chrome.renamingWidgetId = id
        close()
    }

    func runAction(_ id: String) {
        switch id {
        case "action-undo": document.undo()
        case "action-redo": document.redo()
        case "action-shortcuts": services.openShortcuts()
        case "action-fit-all":
            if let rect = CameraFraming.boundsForWidgets(document.board.widgets(on: document.activeCanvasId)) { services.camera?.fitRect(rect, padding: 150) }
        case "action-canvas-tree": services.openTree()
        case "action-domain-packs": services.openSettingsData()
        case "action-zoom-in": zoomBy(1.25)
        case "action-zoom-out": zoomBy(0.8)
        default: break
        }
        close()
    }

    private func zoomBy(_ factor: Double) {
        guard let camera = services.camera else { return }
        camera.zoomTo(camera.zoom * factor, focal: camera.viewportCenter, animated: true)
    }

    /// `leapToSearchResult`: a canvas opens; a card's canvas opens, the card
    /// is selected and framed.
    public func leap(to result: PaletteResult) {
        switch result.kind {
        case .canvas:
            if let canvasId = result.canvasId { tabs.navigate(to: canvasId); chrome.recordVisit(canvasId) }
        case .widget:
            guard let widget = document.widget(result.id) else { return }
            if widget.canvasId != document.activeCanvasId { tabs.navigate(to: widget.canvasId); chrome.recordVisit(widget.canvasId) }
            document.select(widget.id)
            services.camera?.fitRect(widget.frame, padding: 180)
        case .action:
            break
        }
    }
}

/// The quick-answer calculator: `+ - * / ( ) %` over numbers, nothing else
/// (the web hands the string to `Function`; this side parses it).
public enum PaletteMath {
    public static func evaluate(_ text: String) -> Double? {
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, trimmed.contains(where: \.isNumber),
              trimmed.allSatisfy({ $0.isNumber || " +-*/().%".contains($0) }) else { return nil }
        var parser = Parser(Array(trimmed.replacingOccurrences(of: "%", with: "/100").filter { !$0.isWhitespace }))
        guard let value = parser.expression(), parser.atEnd, value.isFinite else { return nil }
        return value
    }

    private struct Parser {
        let chars: [Character]
        var index = 0
        init(_ chars: [Character]) { self.chars = chars }
        var atEnd: Bool { index >= chars.count }
        var peek: Character? { atEnd ? nil : chars[index] }

        mutating func expression() -> Double? {
            guard var left = term() else { return nil }
            while let op = peek, op == "+" || op == "-" {
                index += 1
                guard let right = term() else { return nil }
                left = op == "+" ? left + right : left - right
            }
            return left
        }

        mutating func term() -> Double? {
            guard var left = unary() else { return nil }
            while let op = peek, op == "*" || op == "/" {
                index += 1
                guard let right = unary() else { return nil }
                left = op == "*" ? left * right : left / right
            }
            return left
        }

        mutating func unary() -> Double? {
            if peek == "-" { index += 1; return unary().map { -$0 } }
            if peek == "+" { index += 1; return unary() }
            return primary()
        }

        mutating func primary() -> Double? {
            if peek == "(" {
                index += 1
                guard let inner = expression(), peek == ")" else { return nil }
                index += 1
                return inner
            }
            let start = index
            while let ch = peek, ch.isNumber || ch == "." { index += 1 }
            guard index > start else { return nil }
            return Double(String(chars[start..<index]))
        }
    }
}
