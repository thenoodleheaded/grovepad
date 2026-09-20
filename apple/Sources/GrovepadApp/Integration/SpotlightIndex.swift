import Foundation
import GrovepadCore
import GrovepadChrome
#if canImport(CoreSpotlight)
import CoreSpotlight
#endif

// ---------------------------------------------------------------------------
// Spotlight (roadmap phase 7): every canvas (name, path from its origin)
// and every card (title, first line, type label) of the board, under stable
// identifiers so a re-index replaces rather than duplicates. The builder is
// pure; the indexer diffs against what it last sent, debounced after a
// commit, and removes what a delete took away. Choosing a result continues
// a `CSSearchableItemActionType` activity whose identifier the coordinator
// parses back into a canvas (and the card to select on it).
// ---------------------------------------------------------------------------

/// `canvas:<id>` / `widget:<id>`, the only two shapes Spotlight hands back.
public enum SpotlightIdentifier: Equatable, Sendable {
    case canvas(String)
    case widget(String)

    public static let domain = "app.grovepad.native.board"

    public var string: String {
        switch self {
        case .canvas(let id): "canvas:\(id)"
        case .widget(let id): "widget:\(id)"
        }
    }

    public init?(_ string: String) {
        if string.hasPrefix("canvas:") {
            let id = String(string.dropFirst("canvas:".count))
            guard !id.isEmpty else { return nil }
            self = .canvas(id)
        } else if string.hasPrefix("widget:") {
            let id = String(string.dropFirst("widget:".count))
            guard !id.isEmpty else { return nil }
            self = .widget(id)
        } else {
            return nil
        }
    }
}

public struct SpotlightItem: Equatable, Sendable {
    public var identifier: SpotlightIdentifier
    public var title: String
    public var description: String
    public var keywords: [String]
    /// "Canvas" or the card's type label, shown as the item's kind.
    public var kind: String
    /// The canvas a result lands on.
    public var canvasId: String
}

public enum SpotlightItemBuilder {
    /// The first non-empty line of what the card holds, bounded for the
    /// index (`widgetContentText` feeds the palette; here one line is enough).
    public static let lineLimit = 160

    public static func items(for board: Board) -> [SpotlightItem] {
        var items: [SpotlightItem] = []
        for canvas in board.canvases.values {
            let path = canvasPath(to: canvas.id, in: board).map { displayName($0.name, "Canvas") }
            let workspace = board.workspaces[canvas.workspaceId]?.name ?? ""
            items.append(SpotlightItem(
                identifier: .canvas(canvas.id),
                title: displayName(canvas.name, "Canvas"),
                description: path.count > 1 ? path.joined(separator: " › ") : displayName(workspace, "Workspace"),
                keywords: [displayName(workspace, "Workspace")] + path,
                kind: "Canvas",
                canvasId: canvas.id
            ))
        }
        for widget in board.widgets.values where board.canvases.contains(widget.canvasId) {
            let label = WidgetRegistry.definition(for: widget.type)?.label ?? PackageSummary.typeLabel(widget.type)
            let title = widget.title.trimmingCharacters(in: .whitespacesAndNewlines)
            let line = firstLine(of: widget.data)
            let canvasName = displayName(board.canvases[widget.canvasId]?.name ?? "", "Canvas")
            items.append(SpotlightItem(
                identifier: .widget(widget.id),
                title: title.isEmpty ? label : title,
                description: line.isEmpty ? "\(label) on \(canvasName)" : line,
                keywords: [label, canvasName],
                kind: label,
                canvasId: widget.canvasId
            ))
        }
        return items
    }

    /// The first human line inside a card's data (`PaletteFuzzy.contentText`
    /// gathers them all; Spotlight wants the opening one).
    public static func firstLine(of data: JSONObject) -> String {
        var found: String?
        func walk(_ value: JSONValue) {
            guard found == nil else { return }
            switch value {
            case .string(let text):
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if trimmed.isEmpty || trimmed.hasPrefix("data:") { return }
                if trimmed.count > 200, !trimmed.contains(" ") { return }
                found = trimmed
            case .array(let items): items.forEach(walk)
            case .object(let object): object.values.forEach(walk)
            default: return
            }
        }
        walk(.object(data))
        guard let text = found, let line = text.split(whereSeparator: { $0.isNewline }).first else { return "" }
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return trimmed.count > lineLimit ? String(trimmed.prefix(lineLimit)) + "…" : trimmed
    }

    static func canvasPath(to canvasId: String, in board: Board) -> [CanvasMeta] {
        var path: [CanvasMeta] = []
        var cursor = board.canvases[canvasId]
        var seen = Set<String>()
        while let canvas = cursor, seen.insert(canvas.id).inserted {
            path.insert(canvas, at: 0)
            cursor = canvas.parentCanvasId.flatMap { board.canvases[$0] }
        }
        return path
    }

    static func displayName(_ name: String, _ fallback: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}

// MARK: - The index seam

public protocol SearchableIndexing: AnyObject {
    func index(_ items: [SpotlightItem])
    func delete(identifiers: [String])
    func deleteAll()
}

/// Records every call (tests, and platforms without Spotlight).
public final class RecordingSearchableIndex: SearchableIndexing {
    public private(set) var indexed: [String: SpotlightItem] = [:]
    public private(set) var log: [String] = []
    public init() {}

    public func index(_ items: [SpotlightItem]) {
        log.append("index:\(items.map(\.identifier.string).sorted().joined(separator: ","))")
        for item in items { indexed[item.identifier.string] = item }
    }

    public func delete(identifiers: [String]) {
        log.append("delete:\(identifiers.sorted().joined(separator: ","))")
        for id in identifiers { indexed[id] = nil }
    }

    public func deleteAll() {
        log.append("deleteAll")
        indexed = [:]
    }
}

#if canImport(CoreSpotlight)
public final class CoreSpotlightIndex: SearchableIndexing {
    private let index: CSSearchableIndex

    public init(index: CSSearchableIndex = .default()) {
        self.index = index
    }

    public func index(_ items: [SpotlightItem]) {
        let searchable = items.map { item -> CSSearchableItem in
            let attributes = CSSearchableItemAttributeSet(contentType: .text)
            attributes.title = item.title
            attributes.contentDescription = item.description
            attributes.keywords = item.keywords
            attributes.kind = item.kind
            attributes.identifier = item.identifier.string
            attributes.relatedUniqueIdentifier = item.identifier.string
            let searchableItem = CSSearchableItem(uniqueIdentifier: item.identifier.string, domainIdentifier: SpotlightIdentifier.domain, attributeSet: attributes)
            searchableItem.expirationDate = .distantFuture
            return searchableItem
        }
        index.indexSearchableItems(searchable) { _ in }
    }

    public func delete(identifiers: [String]) {
        index.deleteSearchableItems(withIdentifiers: identifiers) { _ in }
    }

    public func deleteAll() {
        index.deleteSearchableItems(withDomainIdentifiers: [SpotlightIdentifier.domain]) { _ in }
    }
}
#endif

// MARK: - The indexer

/// Diffs the board's items against the last set it sent, one debounce after
/// a commit, so a burst of typing is one index call and a delete is one
/// removal. `flush` runs a pending pass now (background, quit).
@MainActor
public final class SpotlightIndexer {
    public static let debounceMs = 1_500.0

    private let document: BoardDocument
    private let index: SearchableIndexing
    private let debouncer: Debouncer
    private var sent: [String: SpotlightItem] = [:]
    private var primed = false
    public private(set) var passes = 0

    public init(document: BoardDocument, index: SearchableIndexing, timers: TimerSource) {
        self.document = document
        self.index = index
        debouncer = Debouncer(delayMs: SpotlightIndexer.debounceMs, timers: timers)
    }

    /// The first pass replaces whatever an older build left behind.
    public func start() {
        guard !primed else { return }
        primed = true
        index.deleteAll()
        reindex()
    }

    public func noteCommit() {
        debouncer.schedule { [weak self] in self?.reindex() }
    }

    public func flush() {
        guard debouncer.isPending else { return }
        debouncer.cancel()
        reindex()
    }

    private func reindex() {
        passes += 1
        let current = SpotlightItemBuilder.items(for: document.board)
        var next: [String: SpotlightItem] = [:]
        var changed: [SpotlightItem] = []
        for item in current {
            let key = item.identifier.string
            next[key] = item
            if sent[key] != item { changed.append(item) }
        }
        let removed = sent.keys.filter { next[$0] == nil }
        if !changed.isEmpty { index.index(changed) }
        if !removed.isEmpty { index.delete(identifiers: removed.sorted()) }
        sent = next
    }
}
