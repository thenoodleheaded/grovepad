import XCTest
@testable import GrovepadCore

/// The board reader and writer against every `boards/<name>` fixture in the
/// pack: parse outcome, what survived, what was quarantined, the byte-exact
/// serialized document, its checksums, the split documents, edits, pack
/// variants and idempotence.
final class PersistenceConformanceTests: XCTestCase {
    func testEveryBoardFixtureMatchesThePack() throws {
        let manifest = try ConformancePack.manifest()
        let names = ConformancePack.stringList(manifest["boards"])
        XCTAssertGreaterThan(names.count, 15)
        for name in names {
            try checkFixture(name)
        }
    }

    private func checkFixture(_ name: String) throws {
        let text = try ConformancePack.text("boards/\(name).json")
        let expectation = try ConformancePack.object("boards/\(name).expected.json")
        let label = "boards/\(name)"

        let parsedJson: JSONValue
        do {
            parsedJson = try JSONParser.parse(text)
        } catch {
            XCTAssertEqual(expectation.string("parse"), "invalid-json", "\(label): parse threw")
            return
        }
        switch expectation.string("parse") {
        case "invalid-json":
            return XCTFail("\(label): expected JSON.parse to throw")
        case "future-version":
            XCTAssertEqual(BoardParser.futurePersistedBoardVersion(parsedJson).map(Double.init), expectation.number("futureVersion"), label)
            XCTAssertNil(BoardParser.parsePersistedBoard(parsedJson), "\(label): a future version must not parse")
            return
        case "rejected":
            XCTAssertNil(BoardParser.futurePersistedBoardVersion(parsedJson), label)
            XCTAssertNil(BoardParser.parsePersistedBoard(parsedJson), "\(label): expected rejection")
            return
        case "ok":
            break
        default:
            return XCTFail("\(label): unknown parse outcome")
        }
        XCTAssertNil(BoardParser.futurePersistedBoardVersion(parsedJson), label)

        var board: Board
        switch expectation.string("mode") {
        case "migrate-v1":
            guard let migrated = BoardParser.migrateLegacyBoard(parsedJson, mint: .counting(), clock: .conformance) else {
                return XCTFail("\(label): migration returned nil")
            }
            board = migrated
        case "parse-then-remap-root":
            guard let parsed = BoardParser.parsePersistedBoard(parsedJson) else { return XCTFail("\(label): parse returned nil") }
            board = BoardParser.remapLegacyRootCanvasId(parsed, mint: .counting())
        default:
            guard let parsed = BoardParser.parsePersistedBoard(parsedJson) else { return XCTFail("\(label): parse returned nil") }
            board = parsed
        }

        checkStructure(board, expectation, label)
        checkDevice(board, expectation, label)
        checkSerialized(board, expectation, label)

        if let edits = expectation.array("edits") {
            checkAfterEdits(board, edits: edits, expectation, label)
        }
        if let variants = expectation.object("activePacksVariants") {
            checkActivePacksVariants(board, variants, label)
        }
        if let minted = expectation.string("mintedRootCanvasId") {
            XCTAssertEqual(board.workspaces[BoardParser.migratedWorkspaceId]?.rootCanvasId, minted, "\(label): minted root canvas id")
        }
    }

    /// An id list from the pack in object-key form: a lone surrogate in an id
    /// is carried by `JSONObject` keys exactly, while `stringValue` is lossy.
    private func keyList(_ value: JSONValue?) -> [String] {
        (value?.arrayValue ?? []).compactMap(JS.key)
    }

    private func checkStructure(_ board: Board, _ expectation: JSONObject, _ label: String) {
        XCTAssertEqual(board.widgets.keys, keyList(expectation["widgetIds"]), "\(label): widgetIds")
        let expectedTypes = expectation.object("widgetTypes") ?? JSONObject()
        XCTAssertEqual(board.widgets.keys, expectedTypes.keys, "\(label): widgetTypes keys")
        for (id, widget) in board.widgets.entries {
            XCTAssertEqual(widget.type, expectedTypes.string(id), "\(label): type of \(id)")
        }
        let expectedOpaque = expectation.object("opaqueWidgets") ?? JSONObject()
        var opaque = JSONObject()
        for (id, widget) in board.widgets.entries {
            if let type = widget.opaqueType { opaque[id] = .string(type) }
        }
        XCTAssertEqual(opaque, expectedOpaque, "\(label): opaqueWidgets")
        XCTAssertEqual(board.relations.keys, keyList(expectation["relationIds"]), "\(label): relationIds")
        XCTAssertEqual(board.connections.keys, keyList(expectation["connectionIds"]), "\(label): connectionIds")
        XCTAssertEqual(board.glues.keys, keyList(expectation["glueIds"]), "\(label): glueIds")
        XCTAssertEqual(board.activePacks, ConformancePack.stringList(expectation["activePacks"]), "\(label): activePacks")
        XCTAssertEqual(board.unknownRelations.keys, keyList(expectation["unknownRelationIds"]), "\(label): unknownRelationIds")
        XCTAssertEqual(board.unknownConnections.keys, keyList(expectation["unknownConnectionIds"]), "\(label): unknownConnectionIds")
        XCTAssertEqual(board.unknownGlues.keys, keyList(expectation["unknownGlueIds"]), "\(label): unknownGlueIds")
        XCTAssertEqual(board.unknownFields.keys, keyList(expectation["unknownBoardFields"]), "\(label): unknownBoardFields")
        XCTAssertEqual(board.rawActivePacks, ConformancePack.stringList(expectation["rawActivePacks"]), "\(label): rawActivePacks")
    }

    /// The hydrated navigation fields. The web keeps extra keys of a view
    /// object here (`extraView: "kept"`) that nothing ever reads; the typed
    /// `CanvasView` drops them, so ids, pan and zoom are compared.
    private func checkDevice(_ board: Board, _ expectation: JSONObject, _ label: String) {
        guard let device = expectation.object("device") else { return XCTFail("\(label): no device expectation") }
        XCTAssertEqual(board.activeWorkspaceId, device.string("activeWorkspaceId"), "\(label): activeWorkspaceId")
        XCTAssertEqual(board.activeCanvasId, device.string("activeCanvasId"), "\(label): activeCanvasId")
        let views = device.object("canvasViews") ?? JSONObject()
        XCTAssertEqual(board.canvasViews.keys, views.keys, "\(label): canvasViews keys")
        for (canvasId, view) in board.canvasViews.entries {
            let expected = views.object(canvasId)
            XCTAssertEqual(Vector2D(json: expected?["pan"]), view.pan, "\(label): pan of \(canvasId)")
            XCTAssertEqual(expected?.number("zoom"), view.zoom, "\(label): zoom of \(canvasId)")
        }
    }

    private func checkSerialized(_ board: Board, _ expectation: JSONObject, _ label: String) {
        let document = BoardSerializer.serializePersistedBoard(board)
        let serialized = JSONWriter.stringify(.object(document))
        assertSameText(serialized, expectation.string("serialized"), "\(label): serialized")
        XCTAssertEqual(SHA256.hex(serialized), expectation.string("sha256"), "\(label): sha256")
        let canonical = CloudDocuments.canonicalJson(.object(document))
        assertSameText(canonical, expectation.string("canonical"), "\(label): canonical")
        XCTAssertEqual(SHA256.hex(canonical), expectation.string("canonicalSha256"), "\(label): canonicalSha256")

        guard let split = expectation.object("split") else { return XCTFail("\(label): no split expectation") }
        let actual = CloudDocuments.splitCloudBoard(document)
        checkSplitDocument(actual.index, split.object("index"), "\(label): split.index")
        let canvases = split.object("canvases") ?? JSONObject()
        XCTAssertEqual(actual.canvases.keys, canvases.keys, "\(label): split canvas ids")
        for (canvasId, canvas) in actual.canvases.entries {
            checkSplitDocument(canvas, canvases.object(canvasId), "\(label): split.canvases.\(canvasId)")
        }
        let fingerprint = CloudDocuments.fingerprintBoard(document)
        XCTAssertEqual(fingerprint.indexChecksum, split.object("index")?.string("sha256"), "\(label): fingerprint index")
        for (canvasId, checksum) in fingerprint.canvasChecksums.entries {
            XCTAssertEqual(checksum, canvases.object(canvasId)?.string("sha256"), "\(label): fingerprint of \(canvasId)")
        }

        // Idempotence: the serialized document re-read and re-written is unchanged.
        guard let reparsed = try? JSONParser.parse(serialized), let again = BoardParser.parsePersistedBoard(reparsed) else {
            return XCTFail("\(label): serialized document failed to re-parse")
        }
        assertSameText(BoardSerializer.serializedText(again), serialized, "\(label): idempotence")
    }

    private func checkSplitDocument(_ document: JSONObject, _ expected: JSONObject?, _ label: String) {
        let canonical = CloudDocuments.canonicalJson(.object(document))
        assertSameText(canonical, expected?.string("canonical"), "\(label) canonical")
        XCTAssertEqual(SHA256.hex(canonical), expected?.string("sha256"), "\(label) sha256")
        assertSameText(JSONWriter.stringify(.object(document), indent: 2), expected?.string("pretty"), "\(label) pretty")
    }

    private func checkAfterEdits(_ board: Board, edits: [JSONValue], _ expectation: JSONObject, _ label: String) {
        var edited = board
        for edit in edits {
            guard let widgetId = edit["widgetId"]?.stringValue, let position = Vector2D(json: edit["position"]),
                  var target = edited.widgets[widgetId] else { return XCTFail("\(label): edit names a missing widget") }
            // `{ ...target, position: edit.position }`: a fresh `{ x, y }` object in place.
            target.record["position"] = position.json()
            edited.widgets[widgetId] = target
        }
        assertSameText(BoardSerializer.serializedText(edited), expectation.string("afterEdits"), "\(label): afterEdits")
    }

    private func checkActivePacksVariants(_ board: Board, _ variants: JSONObject, _ label: String) {
        func packsJSON(_ activePacks: [String]) -> String {
            var copy = board
            copy.activePacks = activePacks
            let document = BoardSerializer.serializePersistedBoard(copy)
            return JSONWriter.stringify(document["activePacks"] ?? .null)
        }
        XCTAssertEqual(packsJSON([]), variants.string("cleared"), "\(label): activePacks cleared")
        XCTAssertEqual(packsJSON(["software_eng"]), variants.string("swapped"), "\(label): activePacks swapped")
    }

    // MARK: - Behaviour the pack cannot see directly

    func testRemapKeepsOpaqueSourceAndMovesOnlyTheWrapper() throws {
        let parsed = try JSONParser.parse(try ConformancePack.text("boards/legacy-root.json"))
        var source = try XCTUnwrap(parsed.objectValue)
        var widgets = try XCTUnwrap(source.object("widgets"))
        var note = try XCTUnwrap(widgets.object("note"))
        note["type"] = .string("hologram")
        widgets["note"] = .object(note)
        source["widgets"] = .object(widgets)
        let board = try XCTUnwrap(BoardParser.parsePersistedBoard(.object(source)))
        let remapped = BoardParser.remapLegacyRootCanvasId(board, mint: .counting())
        let widget = try XCTUnwrap(remapped.widgets["note"])
        XCTAssertEqual(widget.canvasId, "uuid-0001")
        XCTAssertEqual(widget.opaqueSource?.string("canvasId"), "canvas-origin", "the stashed source is untouched until serialization")
        let document = BoardSerializer.serializePersistedBoard(remapped)
        XCTAssertEqual(document.object("widgets")?.object("note")?.string("canvasId"), "uuid-0001")
        XCTAssertEqual(document.object("widgets")?.object("note")?.string("type"), "hologram")
    }

    func testRemapIsANoOpWithoutTheLegacyRoot() throws {
        let parsed = try JSONParser.parse(try ConformancePack.text("boards/v2-unknown.json"))
        let board = try XCTUnwrap(BoardParser.parsePersistedBoard(parsed))
        XCTAssertEqual(BoardParser.remapLegacyRootCanvasId(board, mint: .counting()), board)
    }

    func testFutureVersionRequiresAnIntegerAboveTheCurrentOne() throws {
        XCTAssertEqual(BoardParser.futurePersistedBoardVersion(try JSONParser.parse(#"{"format":"grovepad-board","v":3}"#)), 3)
        XCTAssertNil(BoardParser.futurePersistedBoardVersion(try JSONParser.parse(#"{"format":"grovepad-board","v":2.5}"#)))
        XCTAssertNil(BoardParser.futurePersistedBoardVersion(try JSONParser.parse(#"{"format":"other","v":3}"#)))
        XCTAssertNil(BoardParser.futurePersistedBoardVersion(try JSONParser.parse(#"{"format":"grovepad-board","v":"3"}"#)))
        XCTAssertFalse(BoardParser.isFromNewerVersion(try JSONParser.parse(#"{"format":"grovepad-board","v":2}"#)))
    }

    func testGlueNameIsCollapsedTrimmedAndSlicedInUTF16Units() throws {
        var source = try XCTUnwrap(try JSONParser.parse(try ConformancePack.text("boards/media.json")).objectValue)
        var glues = JSONObject()
        glues["g"] = .object(["id": "g", "widgetIds": ["photo", "note"], "name": .string("  a \t\n b\u{3000}c  ")])
        source["glues"] = .object(glues)
        let board = try XCTUnwrap(BoardParser.parsePersistedBoard(.object(source)))
        XCTAssertEqual(board.glues["g"]?.name, "a b c")
    }
}
