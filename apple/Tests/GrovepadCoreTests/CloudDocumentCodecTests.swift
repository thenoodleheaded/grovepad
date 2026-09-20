import XCTest
@testable import GrovepadCore

/// gzip + bytea framing for `canvas_docs.body`: round trip, identity, the
/// checksum guard, and tolerance of a foreign gzip header.
final class CloudDocumentCodecTests: XCTestCase {
    private func canvas() throws -> JSONObject {
        let board = SyncFixtures.serialized(try SyncFixtures.board("cloud"))
        return CloudDocuments.splitCloudBoard(board).canvases["canvas"]!
    }

    func testEncodeIsGzipOverCanonicalJsonWithTheJsonChecksum() throws {
        let document = try canvas()
        let encoded = CloudDocumentCodec.encode(.object(document))
        let json = CloudDocuments.canonicalJson(.object(document))
        XCTAssertEqual(encoded.encoding, .gzip)
        XCTAssertEqual(encoded.checksum, SHA256.hex(json))
        XCTAssertEqual(encoded.checksum, CloudDocuments.fingerprintBoard(SyncFixtures.serialized(try SyncFixtures.board("cloud"))).canvasChecksums["canvas"])
        XCTAssertEqual(encoded.uncompressedBytes, json.utf8.count)
        XCTAssertTrue(encoded.body.hasPrefix("\\x1f8b08"), "gzip magic in lowercase hex")
        XCTAssertEqual(encoded.body.count, 2 + encoded.byteLength * 2)
        XCTAssertLessThan(encoded.byteLength, encoded.uncompressedBytes)
    }

    func testDecodeRoundTripsAndParsesToTheSameDocument() throws {
        let document = try canvas()
        let encoded = CloudDocumentCodec.encode(.object(document))
        let decoded = try CloudDocumentCodec.decode(body: encoded.body, encoding: encoded.encoding, checksum: encoded.checksum)
        XCTAssertEqual(decoded.objectValue, JSONWriter.canonicalize(.object(document)).objectValue)
        XCTAssertTrue(CloudDocuments.isCloudCanvasDocument(decoded))
    }

    func testIdentityBodiesDecodeToo() throws {
        let json = CloudDocuments.canonicalJson(["a": 1, "b": "two"])
        let body = CloudDocumentCodec.bytesToBytea(Array(json.utf8))
        let decoded = try CloudDocumentCodec.decode(body: body, encoding: .identity, checksum: SHA256.hex(json))
        XCTAssertEqual(decoded, ["a": 1, "b": "two"])
        // With or without the `\x` prefix, upper or lower case.
        let bare = String(body.dropFirst(2)).uppercased()
        XCTAssertEqual(try CloudDocumentCodec.decode(body: bare, encoding: .identity, checksum: SHA256.hex(json)), decoded)
    }

    func testChecksumMismatchThrows() throws {
        let encoded = CloudDocumentCodec.encode(.object(try canvas()))
        XCTAssertThrowsError(try CloudDocumentCodec.decode(body: encoded.body, encoding: .gzip, checksum: String(repeating: "f", count: 64))) { error in
            XCTAssertEqual((error as? CloudDocumentCodecError)?.description, "Cloud document checksum mismatch")
        }
    }

    func testMalformedByteaThrows() {
        XCTAssertThrowsError(try CloudDocumentCodec.byteaToBytes("\\xabc"))
        XCTAssertThrowsError(try CloudDocumentCodec.byteaToBytes("\\xzz"))
        XCTAssertEqual(try CloudDocumentCodec.byteaToBytes("\\x00ff"), [0x00, 0xff])
        XCTAssertEqual(try CloudDocumentCodec.byteaToBytes(""), [])
        XCTAssertEqual(CloudDocumentCodec.bytesToBytea([0x00, 0xab, 0xff]), "\\x00abff")
    }

    func testCorruptGzipThrows() throws {
        let encoded = CloudDocumentCodec.encode(.object(try canvas()))
        var bytes = try CloudDocumentCodec.byteaToBytes(encoded.body)
        bytes[bytes.count - 12] ^= 0xff
        XCTAssertThrowsError(try CloudDocumentCodec.decode(body: CloudDocumentCodec.bytesToBytea(bytes), encoding: .gzip, checksum: encoded.checksum))
        XCTAssertThrowsError(try CloudDocumentCodec.decode(body: CloudDocumentCodec.bytesToBytea(Array(bytes.prefix(5))), encoding: .gzip, checksum: encoded.checksum))
        XCTAssertThrowsError(try CloudDocumentCodec.decode(body: encoded.body, encoding: .identity, checksum: encoded.checksum), "gzip bytes read as identity fail the checksum")
    }

    func testAForeignGzipHeaderWithOptionalFieldsDecodes() throws {
        // A writer that sets FNAME and FEXTRA (CompressionStream never does,
        // but a curl upload might): the framing is skipped, the payload read.
        let json = CloudDocuments.canonicalJson(["hello": "world"])
        let encoded = CloudDocumentCodec.encode(["hello": "world"])
        let bytes = try CloudDocumentCodec.byteaToBytes(encoded.body)
        var foreign: [UInt8] = Array(bytes.prefix(10))
        foreign[3] = 0x04 | 0x08 // FEXTRA | FNAME
        foreign += [0x02, 0x00, 0xaa, 0xbb] // XLEN = 2, two extra bytes
        foreign += Array("name.json".utf8) + [0x00]
        foreign += Array(bytes.dropFirst(10))
        let decoded = try CloudDocumentCodec.decode(body: CloudDocumentCodec.bytesToBytea(foreign), encoding: .gzip, checksum: SHA256.hex(json))
        XCTAssertEqual(decoded, ["hello": "world"])
    }

    func testEncodingFromMeta() {
        XCTAssertEqual(CloudDocumentCodec.encoding(fromMeta: ["encoding": "gzip"]), .gzip)
        XCTAssertEqual(CloudDocumentCodec.encoding(fromMeta: ["encoding": "identity"]), .identity)
        XCTAssertNil(CloudDocumentCodec.encoding(fromMeta: ["encoding": "brotli"]))
        XCTAssertNil(CloudDocumentCodec.encoding(fromMeta: nil))
    }

    func testTinyAndEmptyInputsRoundTrip() throws {
        for value in [JSONValue.object(JSONObject()), .string(""), .number(0), .array([])] {
            let encoded = CloudDocumentCodec.encode(value)
            XCTAssertEqual(try CloudDocumentCodec.decode(body: encoded.body, encoding: encoded.encoding, checksum: encoded.checksum), value)
        }
    }
}
