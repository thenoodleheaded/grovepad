import Foundation
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The widget registry (`widgets/registry.ts`, `widgets/contracts/registry.ts`).
//
// Every value here comes from the generated `WidgetRegistryData` (which is
// itself generated from `apple/Conformance/registry.json`); this file only
// gives it types and the few rules the web computes at module load: the
// category order, the picker order, the resolved `fixed` predicates and the
// minted default data.
// ---------------------------------------------------------------------------

/// `WidgetCategory`, with `CATEGORY_LABELS` and `CATEGORY_ORDER`.
public enum WidgetCategory: String, CaseIterable, Sendable {
    case structure
    case notes
    case planning
    case study
    case data
    case media
    case tracking
    case automation
    case life
    case specialist

    public var label: String {
        switch self {
        case .structure: return "Structure"
        case .notes: return "Notes & Content"
        case .planning: return "Tasks & Planning"
        case .study: return "Study & Learning"
        case .data: return "Data & Views"
        case .media: return "Media & Creative"
        case .tracking: return "Tracking"
        case .automation: return "Automation & Logic"
        case .life: return "Life Systems"
        case .specialist: return "Specialist"
        }
    }

    /// `CATEGORY_ORDER` — the picker's group order.
    public static let order: [WidgetCategory] = [
        .structure, .notes, .planning, .study, .data, .media, .tracking, .automation, .life, .specialist,
    ]

    /// `CATEGORY_LABELS`.
    public static let labels: [WidgetCategory: String] = Dictionary(uniqueKeysWithValues: allCases.map { ($0, $0.label) })

    public var orderIndex: Int { WidgetCategory.order.firstIndex(of: self) ?? WidgetCategory.order.count }
}

/// `WidgetSkinOption` — one skin a widget can wear.
public struct WidgetSkinOption: Equatable, Hashable, Sendable {
    public let value: String
    public let label: String
    /// The web's lucide icon for this skin; `WidgetSymbols` wears its SF
    /// Symbol stand-in.
    public let icon: String?
    /// Every skin owns its hue: the card icon, resting tile and roller wear it.
    public let accent: String
    public let presentation: String?
    public let implementation: String?

    public init(_ data: WidgetSkinData) {
        value = data.value
        label = data.label
        icon = data.icon
        accent = data.accent
        presentation = data.presentation
        implementation = data.implementation
    }
}

/// `WidgetDefinition` — everything the app knows about one module type.
public struct WidgetDefinition {
    public let type: String
    public let label: String
    public let description: String
    public let category: WidgetCategory
    /// The type's own accent; a worn skin's accent replaces it (`accent(for:)`).
    public let accent: String
    public let defaultSize: Size
    /// The registry's fallback sizing window with `fixed` unresolved; use
    /// `sizingRules(for:)` for one widget's data.
    public let sizing: SizingRules?
    public let skins: [WidgetSkinOption]
    /// Persisted field the skin roller writes: `mode` unless the type says `skin`.
    public let skinField: String
    public let rendererOwnedSkinDetails: [String]
    public let pack: String?
    public let availability: String
    public let restingFace: Bool
    public let titleChrome: Bool
    let fixedRule: WidgetFixedSizing
    let defaultDataTemplate: String

    init(_ data: WidgetDefinitionData) {
        type = data.type
        label = data.label
        description = data.description
        category = WidgetCategory(rawValue: data.category) ?? .specialist
        accent = data.accent
        defaultSize = data.defaultSize
        sizing = data.sizing.map { rules in
            SizingRules(
                minWidth: rules.minWidth, minHeight: rules.minHeight,
                maxWidth: rules.maxWidth, maxHeight: rules.maxHeight,
                autoHeight: rules.autoHeight, autoWidth: rules.autoWidth,
                fixed: rules.fixed == .always
            )
        }
        skins = data.skins.map(WidgetSkinOption.init)
        skinField = data.skinField ?? "mode"
        rendererOwnedSkinDetails = data.rendererOwnedSkinDetails
        pack = data.pack
        availability = data.availability
        restingFace = data.restingFace
        titleChrome = data.titleChrome
        fixedRule = data.sizing?.fixed ?? .never
        defaultDataTemplate = data.defaultDataTemplate
    }

    /// `isWidgetTypePublic`: existing-only types hydrate but are not offered.
    public var isPublic: Bool { availability != "existing-only" }

    /// The types the Add Widget library and the palette offer for now (owner,
    /// 21 Sep 2026): the ten study widgets plus drawing. Every other type still
    /// hydrates, renders and round-trips on boards that already hold it.
    /// `sketchpad` is not in this registry yet, so drawing appears once it is.
    public static let offeredTypes: Set<String> = [
        "checklist", "pros_cons", "decision", "meeting_notes", "flashcards",
        "goal_tracker", "reading_list", "grade_calc", "formula_sheet", "citation",
        "sketchpad",
    ]

    public var isOffered: Bool { isPublic && WidgetDefinition.offeredTypes.contains(type) }

    /// `isFixedSizeWidget(sizing, data)` — the per-data `fixed` predicate.
    public func isFixedSize(data: JSONObject) -> Bool {
        switch fixedRule {
        case .never: return false
        case .always: return true
        case .predicate:
            switch type {
            case "canvas_node":
                // Portal is one line: the name decides its width. The other
                // skins hold a picture worth sizing by hand.
                return (data.string("skin") ?? "portal") == "portal"
            case "checklist":
                // Fixed in the views that are lists, free in the ones that are
                // canvases (a board, a schedule grid).
                let spatial: Set<String> = ["week", "board", "timeline", "matrix", "sprint"]
                return !spatial.contains(data.string("mode") ?? "list")
            default:
                // TODO: any further predicate type ports with its widget.
                return false
            }
        }
    }

    /// The Canvas `SizingRules` for one widget's data, `fixed` resolved.
    public func sizingRules(for data: JSONObject) -> SizingRules {
        var rules = sizing ?? SizingRules()
        rules.fixed = isFixedSize(data: data)
        return rules
    }

    /// The value the skin roller reads from `data[skinField]`.
    public func skinValue(in data: JSONObject) -> String? {
        data.string(skinField)
    }

    /// The skin the data wears, if it names one in the catalogue.
    public func skin(for data: JSONObject) -> WidgetSkinOption? {
        guard let value = skinValue(in: data) else { return nil }
        return skins.first { $0.value == value }
    }

    /// The accent the card wears: the skin's, else the type's.
    public func accent(for data: JSONObject) -> String {
        skin(for: data)?.accent ?? accent
    }

    /// `defaultData()`: the template with every `uuid-XXXX` placeholder
    /// replaced by a minted id, `uuid-0001` minted first. The web calls
    /// `crypto.randomUUID()` inline in template order, which is the same
    /// sequence for a counting minter.
    public func defaultData(mint: IdMinter) -> JSONObject {
        guard let template = try? JSONParser.parse(defaultDataTemplate).objectValue else { return JSONObject() }
        var placeholders: [String] = []
        WidgetDefinition.collectPlaceholders(.object(template), into: &placeholders)
        let ordered = placeholders.sorted { WidgetDefinition.placeholderIndex($0) < WidgetDefinition.placeholderIndex($1) }
        var minted: [String: String] = [:]
        for placeholder in ordered { minted[placeholder] = mint() }
        return WidgetDefinition.substitute(.object(template), minted).objectValue ?? JSONObject()
    }

    static func isPlaceholder(_ text: String) -> Bool {
        text.hasPrefix("uuid-") && text.count == 9 && text.dropFirst(5).allSatisfy(\.isNumber)
    }

    static func placeholderIndex(_ text: String) -> Int {
        Int(text.dropFirst(5)) ?? 0
    }

    static func collectPlaceholders(_ value: JSONValue, into found: inout [String]) {
        switch value {
        case .string(let text):
            if isPlaceholder(text), !found.contains(text) { found.append(text) }
        case .array(let items):
            for item in items { collectPlaceholders(item, into: &found) }
        case .object(let object):
            for (_, item) in object.entries { collectPlaceholders(item, into: &found) }
        default:
            break
        }
    }

    static func substitute(_ value: JSONValue, _ minted: [String: String]) -> JSONValue {
        switch value {
        case .string(let text):
            return .string(minted[text] ?? text)
        case .array(let items):
            return .array(items.map { substitute($0, minted) })
        case .object(let object):
            var result = JSONObject()
            for (key, item) in object.entries { result[key] = substitute(item, minted) }
            return .object(result)
        default:
            return value
        }
    }
}

/// `WIDGET_REGISTRY` and its query functions.
public enum WidgetRegistry {
    /// In-scope definitions in registry order.
    public static let definitions: OrderedMap<WidgetDefinition> = {
        var result = OrderedMap<WidgetDefinition>()
        for (type, data) in WidgetRegistryData.definitions.entries { result[type] = WidgetDefinition(data) }
        return result
    }()

    public static let categoryLabels = WidgetCategory.labels
    public static let categoryOrder = WidgetCategory.order

    /// `widgetDefinition(type)` — nil for a type outside the first build.
    public static func definition(for type: String) -> WidgetDefinition? {
        definitions[type]
    }

    public static func isPublic(_ type: String) -> Bool {
        definitions[type]?.isPublic ?? false
    }

    /// The spawn size for any registered type, in scope or not
    /// (`WidgetTypeCatalog.defaultSizes` still answers for the rest).
    public static func defaultSize(for type: String) -> Size? {
        definitions[type]?.defaultSize ?? WidgetTypeCatalog.defaultSizes[type]
    }

    /// `orderedDefinitions()`: category order, then label (`localeCompare`).
    public static let ordered: [WidgetDefinition] = {
        var byCategory: [WidgetCategory: [WidgetDefinition]] = [:]
        for definition in definitions.values { byCategory[definition.category, default: []].append(definition) }
        var result: [WidgetDefinition] = []
        for category in WidgetCategory.order {
            guard var group = byCategory[category] else { continue }
            group.sort { labelLess($0.label, $1.label) }
            result.append(contentsOf: group)
        }
        return result
    }()

    public static func orderedDefinitions() -> [WidgetDefinition] { ordered }

    /// `a.label.localeCompare(b.label)` — a locale-aware, case-insensitive
    /// primary comparison with the plain code-point order as the tiebreaker.
    public static func labelLess(_ lhs: String, _ rhs: String) -> Bool {
        let primary = lhs.compare(rhs, options: [.caseInsensitive, .diacriticInsensitive], range: nil, locale: Locale(identifier: "en_US"))
        if primary != .orderedSame { return primary == .orderedAscending }
        return lhs < rhs
    }
}
