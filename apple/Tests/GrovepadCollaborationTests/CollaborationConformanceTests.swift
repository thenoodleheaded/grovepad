import XCTest
import GrovepadCore
@testable import GrovepadCollaboration

/// The native engine against `Conformance/collaboration.json`, written by the
/// web's own `writeCanvasSnapshot` / `readCanvasSnapshot` and
/// `y-protocols/awareness`: a Mac reads exactly what a browser collaborator
/// sends, merges concurrent edits to the same result, and publishes presence
/// packets a browser decodes byte for byte.
final class CollaborationConformanceTests: XCTestCase {
    private func pack() throws -> JSONObject {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Conformance/collaboration.json")
        return try XCTUnwrap(try JSONParser.parse(Data(contentsOf: url)).objectValue)
    }

    private func bytes(_ value: JSONValue?) throws -> Data {
        try CollaborationBinary.bytes(base64: try XCTUnwrap(value?.stringValue))
    }

    private func engine(_ id: UInt64) -> CanvasCrdt { CanvasCrdt(clientId: id) }

    /// A read-back canvas as the web's snapshot shape, canonicalised.
    private func canonical(_ canvas: ValidatedCanvas) -> String {
        var object = JSONObject()
        object["canvas"] = .object(CanvasCrdtSchema.canvasMeta(canvas.canvas))
        var widgets = JSONObject()
        for (id, widget) in canvas.widgets.entries { widgets[id] = .object(BoardSerializer.persistedWidgetRecord(id, widget)) }
        object["widgets"] = .object(widgets)
        object["relations"] = canvas.relations.mapValues(\.record).json
        object["connections"] = canvas.connections.mapValues(\.record).json
        object["glues"] = canvas.glues.mapValues(\.record).json
        return JSONWriter.canonical(.object(object))
    }

    private func canonical(web value: JSONValue?) throws -> String {
        let snapshot = try XCTUnwrap(value?.objectValue)
        var object = JSONObject()
        for key in ["canvas", "widgets", "relations", "connections", "glues"] { object[key] = snapshot[key] }
        return JSONWriter.canonical(.object(object))
    }

    func testReadsTheWebSeedDocument() throws {
        let pack = try pack()
        let crdt = engine(900)
        try crdt.applyRemoteUpdate(update: try bytes(pack["seedUpdate"]))
        let read = try CanvasCrdtSchema.read(crdt, canvasId: "canvas", local: nil)
        XCTAssertEqual(canonical(read), try canonical(web: pack["seedSnapshot"]))
        XCTAssertEqual(read.widgets["note"]?.data.string("text"), "Hello café 👋")
    }

    func testMergesConcurrentWebEditsInEitherOrder() throws {
        let pack = try pack()
        let expected = try canonical(web: pack["mergedSnapshot"])
        for order in [["seedUpdate", "aliceUpdate", "bobUpdate"], ["seedUpdate", "bobUpdate", "aliceUpdate"], ["bobUpdate", "aliceUpdate", "seedUpdate"]] {
            let crdt = engine(901)
            for key in order { try crdt.applyRemoteUpdate(update: try bytes(pack[key])) }
            XCTAssertEqual(canonical(try CanvasCrdtSchema.read(crdt, canvasId: "canvas", local: nil)), expected, "order \(order)")
        }
    }

    /// The Mac plays Alice: its own edits, written through the schema, merge
    /// with Bob's browser update to exactly the web's merged result.
    func testNativeEditsMergeWithBrowserEdits() throws {
        let pack = try pack()
        let crdt = engine(202)
        try crdt.applyRemoteUpdate(update: try bytes(pack["seedUpdate"]))
        let base = try XCTUnwrap(try JSONParser.parse(JSONWriter.stringify(pack["seedSnapshot"]!)).objectValue)
        let previous = try snapshot(base)
        var next = previous
        var note = try XCTUnwrap(next.widgets["note"])
        var data = try XCTUnwrap(note["data"]?.objectValue)
        data["text"] = .string("Oh, Hello café 👋")
        note["data"] = .object(data)
        var position = JSONObject()
        position["x"] = .number(40)
        position["y"] = .number(80)
        note["position"] = .object(position)
        next.widgets["note"] = note
        let update = try CanvasCrdtSchema.write(next, to: crdt, previous: previous)
        XCTAssertFalse(update.isEmpty)

        try crdt.applyRemoteUpdate(update: try bytes(pack["bobUpdate"]))
        XCTAssertEqual(canonical(try CanvasCrdtSchema.read(crdt, canvasId: "canvas", local: nil)), try canonical(web: pack["mergedSnapshot"]))

        // And the update the Mac produced lands the same way on a third copy.
        let browser = engine(303)
        try browser.applyRemoteUpdate(update: try bytes(pack["seedUpdate"]))
        try browser.applyRemoteUpdate(update: try bytes(pack["bobUpdate"]))
        try browser.applyRemoteUpdate(update: update)
        XCTAssertEqual(canonical(try CanvasCrdtSchema.read(browser, canvasId: "canvas", local: nil)), try canonical(web: pack["mergedSnapshot"]))
    }

    private func snapshot(_ web: JSONObject) throws -> CanvasCollaborationSnapshot {
        func map(_ key: String) -> OrderedMap<JSONObject> {
            var result = OrderedMap<JSONObject>()
            for (id, value) in (web[key]?.objectValue ?? JSONObject()).entries { result[id] = value.objectValue }
            return result
        }
        return CanvasCollaborationSnapshot(
            canvasId: "canvas", canvas: try XCTUnwrap(web["canvas"]?.objectValue),
            widgets: map("widgets"), relations: map("relations"), connections: map("connections"), glues: map("glues")
        )
    }

    func testAwarenessPacketsMatchTheWebByteForByte() throws {
        let fixture = try XCTUnwrap(try pack()["awareness"]?.objectValue)
        var state = try XCTUnwrap(fixture["state"]?.objectValue)
        let awareness = Awareness(clientId: 404, now: { 1_789_000_000_000 })
        awareness.setLocalState(state)
        XCTAssertEqual(CollaborationBinary.base64(awareness.encodeUpdate(clients: [404])), fixture["first"]?.stringValue)
        state["cursor"] = .null
        awareness.setLocalState(state)
        XCTAssertEqual(CollaborationBinary.base64(awareness.encodeUpdate(clients: [404])), fixture["second"]?.stringValue)
        awareness.setLocalState(nil)
        XCTAssertEqual(CollaborationBinary.base64(awareness.encodeUpdate(clients: [404])), fixture["removed"]?.stringValue)

        // Decoding a browser's packets yields its participant, then its exit.
        let observer = Awareness(clientId: 7, now: { 1_789_000_000_000 })
        try observer.applyUpdate(try bytes(fixture["first"]))
        let people = PresenceRules.participants(observer.states, now: 0)
        let ada = try XCTUnwrap(people.first { $0.clientId == 404 })
        XCTAssertEqual(ada.name, "Ada")
        XCTAssertEqual(ada.role, .editor)
        XCTAssertEqual(ada.cursor, Vector2D(x: 12.5, y: -3))
        XCTAssertEqual(ada.camera, CollaborationCamera(pan: Vector2D(x: 100, y: 50), zoom: 1.25))
        try observer.applyUpdate(try bytes(fixture["second"]))
        XCTAssertNil(PresenceRules.participants(observer.states, now: 0).first { $0.clientId == 404 }?.cursor)
        try observer.applyUpdate(try bytes(fixture["removed"]))
        XCTAssertNil(observer.states[404])
    }
}
