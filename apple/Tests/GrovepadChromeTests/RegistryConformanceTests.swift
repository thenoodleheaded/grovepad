import XCTest
import GrovepadCore
import GrovepadCanvas
@testable import GrovepadChrome

/// The Swift registry against `apple/Conformance/registry.json` `types`: every
/// field of every in-scope definition, the minted default data as bytes, and
/// the picker order.
final class RegistryConformanceTests: XCTestCase {
    func testEveryPackTypeIsDefinedInPackOrder() throws {
        let types = try XCTUnwrap(try ChromePack.registry().object("types"))
        XCTAssertEqual(WidgetRegistry.definitions.keys, types.keys)
        for type in types.keys { XCTAssertNotNil(WidgetRegistry.definition(for: type), type) }
    }

    func testMetadataMatchesThePack() throws {
        let types = try XCTUnwrap(try ChromePack.registry().object("types"))
        for (type, raw) in types.entries {
            let entry = try XCTUnwrap(raw.objectValue, type)
            let definition = try XCTUnwrap(WidgetRegistry.definition(for: type), type)
            XCTAssertEqual(definition.type, type)
            XCTAssertEqual(definition.label, entry.string("label"), "\(type) label")
            XCTAssertEqual(definition.description, entry.string("description"), "\(type) description")
            XCTAssertEqual(definition.category.rawValue, entry.string("category"), "\(type) category")
            XCTAssertEqual(definition.accent, entry.string("accent"), "\(type) accent")
            XCTAssertEqual(definition.defaultSize, Size(json: entry["defaultSize"]), "\(type) defaultSize")
            XCTAssertEqual(definition.skinField, entry.string("skinField") ?? "mode", "\(type) skinField")
            XCTAssertEqual(definition.pack, entry.string("pack"), "\(type) pack")
            XCTAssertEqual(definition.availability, entry.string("availability") ?? "public", "\(type) availability")
            XCTAssertEqual(definition.restingFace, entry.bool("restingFace") ?? true, "\(type) restingFace")
            XCTAssertEqual(definition.titleChrome, entry.bool("titleChrome") ?? true, "\(type) titleChrome")
            XCTAssertEqual(
                definition.rendererOwnedSkinDetails,
                (entry.array("rendererOwnedSkinDetails") ?? []).compactMap(\.stringValue),
                "\(type) rendererOwnedSkinDetails"
            )

            let skins = (entry.array("skins") ?? []).compactMap(\.objectValue)
            XCTAssertEqual(definition.skins.count, skins.count, "\(type) skin count")
            for (skin, expected) in zip(definition.skins, skins) {
                XCTAssertEqual(skin.value, expected.string("value"), "\(type) skin value")
                XCTAssertEqual(skin.label, expected.string("label"), "\(type) skin label")
                XCTAssertEqual(skin.accent, expected.string("accent"), "\(type) skin accent")
                XCTAssertEqual(skin.presentation, expected.string("presentation"), "\(type) skin presentation")
                XCTAssertEqual(skin.implementation, expected.string("implementation"), "\(type) skin implementation")
            }

            if let sizing = entry.object("sizing") {
                let rules = try XCTUnwrap(definition.sizing, "\(type) sizing")
                XCTAssertEqual(rules.minWidth, sizing.number("minWidth"), "\(type) minWidth")
                XCTAssertEqual(rules.minHeight, sizing.number("minHeight"), "\(type) minHeight")
                XCTAssertEqual(rules.maxWidth, sizing.number("maxWidth"), "\(type) maxWidth")
                XCTAssertEqual(rules.maxHeight, sizing.number("maxHeight"), "\(type) maxHeight")
                XCTAssertEqual(rules.autoHeight, sizing.bool("autoHeight") ?? false, "\(type) autoHeight")
                XCTAssertEqual(rules.autoWidth, sizing.bool("autoWidth") ?? false, "\(type) autoWidth")
                let fixed = sizing["fixed"]
                let expectedRule: WidgetFixedSizing = fixed == .string("predicate") ? .predicate : fixed == .bool(true) ? .always : .never
                XCTAssertEqual(definition.fixedRule, expectedRule, "\(type) fixed")
            } else {
                XCTAssertNil(definition.sizing, "\(type) sizing")
            }
        }
    }

    func testDefaultDataBytesMatchThePack() throws {
        let types = try XCTUnwrap(try ChromePack.registry().object("types"))
        for (type, raw) in types.entries {
            let entry = try XCTUnwrap(raw.objectValue, type)
            let definition = try XCTUnwrap(WidgetRegistry.definition(for: type), type)
            let expected = JSONWriter.stringify(try XCTUnwrap(entry["defaultData"], "\(type) defaultData"))
            let minted = JSONWriter.stringify(.object(definition.defaultData(mint: .counting())))
            XCTAssertEqual(minted, expected, "\(type) defaultData bytes")
        }
    }

    func testDefaultDataMintsInPlaceholderOrder() {
        // flashcards carries four placeholders across nested objects.
        let definition = WidgetRegistry.definition(for: "flashcards")!
        let data = definition.defaultData(mint: .counting(prefix: "id-", width: 2))
        XCTAssertEqual(data.recordList("cards").first?.string("id"), "id-01")
        XCTAssertEqual(data.object("vocabulary")?.recordList("terms").first?.string("id"), "id-02")
        XCTAssertEqual(data.object("quiz")?.recordList("options").map { $0.string("id") }, ["id-03", "id-04"])
    }

    func testFixedPredicatesResolvePerData() {
        let canvas = WidgetRegistry.definition(for: "canvas_node")!
        XCTAssertTrue(canvas.isFixedSize(data: ["skin": "portal"]))
        XCTAssertTrue(canvas.isFixedSize(data: JSONObject()), "absent skin reads as portal")
        XCTAssertFalse(canvas.isFixedSize(data: ["skin": "cover"]))
        XCTAssertTrue(canvas.sizingRules(for: ["skin": "portal"]).fixed)
        XCTAssertFalse(canvas.sizingRules(for: ["skin": "cover"]).fixed)

        let checklist = WidgetRegistry.definition(for: "checklist")!
        XCTAssertTrue(checklist.isFixedSize(data: ["mode": "list"]))
        XCTAssertTrue(checklist.isFixedSize(data: JSONObject()))
        for spatial in ["week", "board", "timeline", "matrix", "sprint"] {
            XCTAssertFalse(checklist.isFixedSize(data: ["mode": .string(spatial)]), spatial)
        }
        XCTAssertTrue(WidgetRegistry.definition(for: "rating")!.isFixedSize(data: JSONObject()))
        XCTAssertFalse(WidgetRegistry.definition(for: "text")!.isFixedSize(data: JSONObject()))
    }

    func testOrderedDefinitionsAreCategoryThenLabel() {
        let ordered = WidgetRegistry.orderedDefinitions()
        XCTAssertEqual(ordered.count, WidgetRegistry.definitions.count)
        XCTAssertEqual(Set(ordered.map(\.type)), Set(WidgetRegistry.definitions.keys))
        for (previous, next) in zip(ordered, ordered.dropFirst()) {
            XCTAssertLessThanOrEqual(previous.category.orderIndex, next.category.orderIndex, "\(previous.type) before \(next.type)")
            if previous.category == next.category {
                XCTAssertFalse(WidgetRegistry.labelLess(next.label, previous.label), "\(previous.label) before \(next.label)")
            }
        }
        XCTAssertEqual(ordered.first?.type, "canvas_node", "structure comes first")
        XCTAssertEqual(WidgetCategory.order.map(\.rawValue), ["structure", "notes", "planning", "study", "data", "media", "tracking", "automation", "life", "specialist"])
        XCTAssertEqual(WidgetCategory.labels[.notes], "Notes & Content")
    }

    func testOutOfScopeTypesStillAnswerDefaultSizes() throws {
        let registry = try ChromePack.registry()
        let moduleTypes = (registry.array("moduleTypes") ?? []).compactMap(\.stringValue)
        let outside = try XCTUnwrap(moduleTypes.first { WidgetRegistry.definition(for: $0) == nil })
        XCTAssertNil(WidgetRegistry.definition(for: outside))
        XCTAssertEqual(WidgetRegistry.defaultSize(for: outside), WidgetTypeCatalog.defaultSizes[outside])
        XCTAssertNotNil(WidgetRegistry.defaultSize(for: outside))
        XCTAssertFalse(WidgetRegistry.isPublic(outside))
    }

    func testSkinAccentReplacesTheTypeAccent() {
        let counter = WidgetRegistry.definition(for: "counter")!
        XCTAssertEqual(counter.accent(for: ["skin": "clicker"]), "#72e490")
        XCTAssertEqual(counter.accent(for: ["skin": "unknown"]), counter.accent)
        XCTAssertEqual(counter.skin(for: ["skin": "tally"])?.label, "Tally")
    }
}
