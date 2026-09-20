import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// The widget library (`AddWidgetModal.tsx`): one column in bands — Pinned,
// Recent, then each family in registry order — collapsing to one ranked
// list while searching (a label that starts with the query outranks one that
// merely contains it, which outranks a description/category hit). Only
// public types; a type whose domain pack is off is left out until the pack is
// turned on in Settings → Data (owner's call; `choose` still refuses one with
// the reason, for callers that name a type directly). Creation goes through
// the document at the world point the surface opened on.
// ---------------------------------------------------------------------------

/// Device-local picker preferences (`useWidgetPickerPrefsStore`).
public protocol WidgetPickerPrefs: AnyObject {
    var favoriteTypes: [String] { get }
    var recentTypes: [String] { get }
    func toggleFavorite(_ type: String)
    func recordRecent(_ type: String)
}

public final class InMemoryWidgetPickerPrefs: WidgetPickerPrefs {
    public static let recentLimit = 6
    public private(set) var favoriteTypes: [String] = []
    public private(set) var recentTypes: [String] = []

    public init(favorites: [String] = [], recents: [String] = []) {
        favoriteTypes = favorites
        recentTypes = recents
    }

    public func toggleFavorite(_ type: String) {
        if let index = favoriteTypes.firstIndex(of: type) { favoriteTypes.remove(at: index) } else { favoriteTypes.append(type) }
    }

    public func recordRecent(_ type: String) {
        recentTypes.removeAll { $0 == type }
        recentTypes.insert(type, at: 0)
        if recentTypes.count > InMemoryWidgetPickerPrefs.recentLimit { recentTypes.removeLast(recentTypes.count - InMemoryWidgetPickerPrefs.recentLimit) }
    }
}

public struct AddWidgetEntry: Equatable, Identifiable, Sendable {
    public var type: String
    public var label: String
    public var description: String
    public var category: WidgetCategory
    public var accent: String
    public var favorited: Bool
    /// Why this type cannot be added right now (a pack that is off).
    public var lockedReason: String?
    public var id: String { type }
    public var isLocked: Bool { lockedReason != nil }
}

public struct AddWidgetGroup: Equatable, Identifiable, Sendable {
    public var key: String
    public var label: String?
    public var entries: [AddWidgetEntry]
    public var id: String { key }
}

@Observable
public final class AddWidgetModel {
    public let document: BoardDocument
    public let prefs: WidgetPickerPrefs
    public var query = ""
    /// The lit row: Enter always has a target.
    public var activeIndex = 0
    @ObservationIgnored private let mint: IdMinter?

    public init(document: BoardDocument, prefs: WidgetPickerPrefs, mint: IdMinter? = nil) {
        self.document = document
        self.prefs = prefs
        self.mint = mint
    }

    /// Pack names as Settings → Data shows them.
    public static func packLabel(_ pack: String) -> String {
        pack.split(whereSeparator: { $0 == "_" || $0 == "-" }).map { $0.prefix(1).uppercased() + $0.dropFirst() }.joined(separator: " ")
    }

    func entry(_ definition: WidgetDefinition) -> AddWidgetEntry {
        let activePacks = document.board.activePacks
        // The study list is offered whatever the domain packs say (owner,
        // 21 Sep 2026); only a type outside it can still be pack-locked.
        let locked = definition.pack.flatMap { pack -> String? in
            definition.isOffered || activePacks.contains(pack) ? nil : "Turn on the \(AddWidgetModel.packLabel(pack)) pack in Settings → Data"
        }
        return AddWidgetEntry(
            type: definition.type, label: definition.label, description: definition.description,
            category: definition.category, accent: definition.accent,
            favorited: prefs.favoriteTypes.contains(definition.type), lockedReason: locked
        )
    }

    /// `haystack`: every word a search can find a widget by.
    static func haystack(_ definition: WidgetDefinition) -> String {
        [definition.label, definition.description, definition.category.label].joined(separator: " ").lowercased()
    }

    /// `groups`: the bands, or one ranked list while searching.
    public var groups: [AddWidgetGroup] {
        let visible = WidgetRegistry.orderedDefinitions().filter { definition in
            definition.isOffered
        }
        let q = query.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        if !q.isEmpty {
            let ranked = visible.compactMap { definition -> (WidgetDefinition, Int)? in
                let label = definition.label.lowercased()
                let rank = label.hasPrefix(q) ? 0 : label.contains(q) ? 1 : AddWidgetModel.haystack(definition).contains(q) ? 2 : 3
                return rank < 3 ? (definition, rank) : nil
            }.sorted { lhs, rhs in
                lhs.1 != rhs.1 ? lhs.1 < rhs.1 : lhs.0.label.compare(rhs.0.label) == .orderedAscending
            }
            return ranked.isEmpty ? [] : [AddWidgetGroup(key: "results", label: nil, entries: ranked.map { entry($0.0) })]
        }
        let favorites = Set(prefs.favoriteTypes)
        let pinned = visible.filter { favorites.contains($0.type) }
        let rest = visible.filter { !favorites.contains($0.type) }
        let recent = prefs.recentTypes.compactMap { type in rest.first { $0.type == type } }
        let recentSet = Set(recent.map(\.type))
        var byCategory: [WidgetCategory: [WidgetDefinition]] = [:]
        for definition in rest where !recentSet.contains(definition.type) {
            byCategory[definition.category, default: []].append(definition)
        }
        var bands: [AddWidgetGroup] = []
        if !pinned.isEmpty { bands.append(AddWidgetGroup(key: "pinned", label: "Pinned", entries: pinned.map(entry))) }
        if !recent.isEmpty { bands.append(AddWidgetGroup(key: "recent", label: "Recent", entries: recent.map(entry))) }
        for category in WidgetCategory.order {
            if let definitions = byCategory[category], !definitions.isEmpty {
                bands.append(AddWidgetGroup(key: category.rawValue, label: category.label, entries: definitions.map(entry)))
            }
        }
        return bands
    }

    public var flat: [AddWidgetEntry] { groups.flatMap(\.entries) }
    public var count: Int { flat.count }

    public var litEntry: AddWidgetEntry? {
        let list = flat
        guard !list.isEmpty else { return nil }
        return list[min(activeIndex, list.count - 1)]
    }

    public func moveActive(by delta: Int) {
        let last = max(0, flat.count - 1)
        activeIndex = min(max(0, activeIndex + delta), last)
    }

    public func setQuery(_ text: String) {
        query = text
        activeIndex = 0
    }

    public func toggleFavorite(_ type: String) { prefs.toggleFavorite(type) }

    public enum Outcome: Equatable {
        case created(String)
        case locked(reason: String)
        case unknown
    }

    /// `choose`: create at the grid-snapped world point, remember the type,
    /// select the card and hand it to rename. A locked row explains itself.
    @discardableResult
    public func choose(_ type: String, at world: Vector2D, chrome: ChromeState? = nil) -> Outcome {
        guard let definition = WidgetRegistry.definition(for: type), definition.isOffered else { return .unknown }
        let candidate = entry(definition)
        if let reason = candidate.lockedReason { return .locked(reason: reason) }
        let snapped = Vector2D(x: CanvasGeometry.snapToGrid(world.x), y: CanvasGeometry.snapToGrid(world.y))
        guard let id = document.createWidget(type: type, at: snapped, title: definition.label, mint: mint) else { return .unknown }
        prefs.recordRecent(type)
        document.select(id)
        chrome?.renamingWidgetId = id
        chrome?.closeAddWidget()
        return .created(id)
    }
}
