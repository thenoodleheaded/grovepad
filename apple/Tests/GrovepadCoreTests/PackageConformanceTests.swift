import XCTest
@testable import GrovepadCore

/// `packages/<name>`: the ZIP the web wrote opens to the same entries, reads
/// back to the same board and media, and a package built here from the same
/// board has the same entries byte for byte (DEFLATE streams differ between
/// implementations, so archives are compared entry by entry, never as bytes).
final class PackageConformanceTests: XCTestCase {
    private func packageNames() throws -> [String] {
        let names = try FileManager.default.contentsOfDirectory(atPath: ConformancePack.url("packages").path)
        return names.filter { $0.hasSuffix(".expected.json") }.map { String($0.dropLast(".expected.json".count)) }.sorted()
    }

    func testEveryPackageMatchesThePack() throws {
        let names = try packageNames()
        XCTAssertGreaterThanOrEqual(names.count, 3)
        for name in names {
            try checkPackage(name)
        }
    }

    private func checkPackage(_ name: String) throws {
        let label = "packages/\(name)"
        let bytes = try ConformancePack.bytes("packages/\(name).grovepad")
        let expectation = try ConformancePack.object("packages/\(name).expected.json")
        XCTAssertTrue(GrovepadPackage.looksLikeZipArchive(bytes), label)

        // 1. The web's archive opens to exactly the expected entries.
        let entries = try ZipArchive.read(bytes)
        assertEntries(entries, match: expectation, label)

        // 2. It reads back to the same board and media keys.
        let restored = try GrovepadPackage.read(bytes)
        assertSameText(BoardSerializer.serializedText(restored.board), expectation.string("restoredSerialized"), "\(label): restoredSerialized")
        XCTAssertEqual(restored.media.map(\.key), ConformancePack.stringList(expectation["restoredMedia"]), "\(label): restoredMedia")

        // 3. A package built here from the same source board has the same entries.
        let source = try JSONParser.parse(try ConformancePack.text("boards/\(name).json"))
        let board = try XCTUnwrap(BoardParser.parsePersistedBoard(source), "\(label): source board")
        let manifest = try XCTUnwrap(try JSONParser.parse(try XCTUnwrap(expectation.object("textEntries")?.string("manifest.json"))).objectValue)
        let appVersion = manifest.string("appVersion") ?? "dev"
        let loader = mediaLoader(manifest: manifest, expectation: expectation)
        let built = GrovepadPackage.build(board, appVersion: appVersion, clock: .conformance, loadMedia: loader)
        let builtEntries = try ZipArchive.read(built)
        assertEntries(builtEntries, match: expectation, label + " (built)")

        // 4. read → build → read is stable.
        let again = try GrovepadPackage.read(built)
        let rebuilt = GrovepadPackage.build(again.board, appVersion: appVersion, clock: .conformance) { key in
            again.media.first { $0.key == key }?.blob
        }
        let rebuiltEntries = try ZipArchive.read(rebuilt)
        XCTAssertEqual(rebuiltEntries.keys, builtEntries.keys, "\(label): round-trip entry order")
        for (path, data) in builtEntries.entries {
            XCTAssertEqual(rebuiltEntries[path], data, "\(label): round-trip entry \(path)")
        }
    }

    /// Serves the bytes the expectation lists, keyed by the media key the
    /// manifest maps to each path (the generator served `photo` and
    /// `photoCopy` the same bytes as `image/webp`).
    private func mediaLoader(manifest: JSONObject, expectation: JSONObject) -> (String) -> MediaBlob? {
        let binary = expectation.object("binaryEntries") ?? JSONObject()
        let media = manifest.array("media") ?? []
        return { key in
            guard let entry = media.first(where: { $0["key"]?.stringValue == key })?.objectValue,
                  let path = entry.string("path"), let numbers = binary.array(path) else { return nil }
            return MediaBlob(bytes: numbers.compactMap { $0.numberValue.map { UInt8($0) } }, type: entry.string("type") ?? "")
        }
    }

    private func assertEntries(_ entries: OrderedMap<[UInt8]>, match expectation: JSONObject, _ label: String) {
        XCTAssertEqual(entries.keys, ConformancePack.stringList(expectation["entryOrder"]), "\(label): entryOrder")
        let textEntries = expectation.object("textEntries") ?? JSONObject()
        let binaryEntries = expectation.object("binaryEntries") ?? JSONObject()
        for (path, data) in entries.entries {
            if path.hasPrefix("media/") {
                let expected = binaryEntries.array(path)?.compactMap { $0.numberValue.map { UInt8($0) } }
                XCTAssertEqual(data, expected, "\(label): binary entry \(path)")
            } else {
                assertSameText(String(decoding: data, as: UTF8.self), textEntries.string(path), "\(label): text entry \(path)")
            }
        }
    }

    // MARK: - Reader guards

    func testRejectsAPackageThatNeedsANewerReader() throws {
        var manifest = JSONObject()
        manifest["format"] = .string(GrovepadPackage.format)
        manifest["minReader"] = .number(2)
        let bytes = ZipArchive.create([ZipEntry(name: "manifest.json", data: Array(JSONWriter.stringify(.object(manifest)).utf8))])
        XCTAssertThrowsError(try GrovepadPackage.read(bytes)) { error in
            XCTAssertEqual(error as? GrovepadPackageTooNewError, GrovepadPackageTooNewError(minReader: 2))
        }
    }

    func testRejectsAFutureBoardVersionBeforeTouchingState() throws {
        var manifest = JSONObject()
        manifest["format"] = .string(GrovepadPackage.format)
        manifest["boardVersion"] = .number(3)
        let bytes = ZipArchive.create([ZipEntry(name: "manifest.json", data: Array(JSONWriter.stringify(.object(manifest)).utf8))])
        XCTAssertThrowsError(try GrovepadPackage.read(bytes)) { error in
            XCTAssertEqual(error as? FuturePersistedBoardVersionError, FuturePersistedBoardVersionError(foundVersion: 3))
        }
    }

    func testRejectsNonPackagesAndMissingIndex() throws {
        XCTAssertThrowsError(try GrovepadPackage.read([1, 2, 3]))
        XCTAssertFalse(GrovepadPackage.looksLikeZipArchive([0x50, 0x4b]))
        let noManifest = ZipArchive.create([ZipEntry(name: "index.json", data: [])])
        XCTAssertThrowsError(try GrovepadPackage.read(noManifest))
        var manifest = JSONObject()
        manifest["format"] = .string(GrovepadPackage.format)
        let noIndex = ZipArchive.create([ZipEntry(name: "manifest.json", data: Array(JSONWriter.stringify(.object(manifest)).utf8))])
        XCTAssertThrowsError(try GrovepadPackage.read(noIndex))
    }

    // MARK: - ZIP behaviour

    func testCompressibleEntriesAreDeflatedAndIncompressibleOnesStored() throws {
        let text = Array(String(repeating: "grovepad ", count: 500).utf8)
        let noise: [UInt8] = (0..<64).map { UInt8(($0 * 97 + 13) & 0xff) }
        let bytes = ZipArchive.create([ZipEntry(name: "text.txt", data: text), ZipEntry(name: "noise.bin", data: noise), ZipEntry(name: "empty", data: [])])
        XCTAssertEqual(bytes[8], 8, "first entry is DEFLATE (method 8)")
        let read = try ZipArchive.read(bytes)
        XCTAssertEqual(read.keys, ["text.txt", "noise.bin", "empty"])
        XCTAssertEqual(read["text.txt"], text)
        XCTAssertEqual(read["noise.bin"], noise)
        XCTAssertEqual(read["empty"], [])
        XCTAssertLessThan(bytes.count, text.count, "the archive is smaller than its compressible content")
    }

    func testCorruptedEntryFailsItsChecksum() throws {
        var bytes = ZipArchive.create([ZipEntry(name: "a.txt", data: Array("hello world".utf8))])
        // The stored body starts right after the 30-byte local header and the name.
        bytes[30 + 5] ^= 0xff
        XCTAssertThrowsError(try ZipArchive.read(bytes)) { error in
            XCTAssertEqual((error as? ZipArchiveError)?.message, "ZIP entry a.txt failed its checksum")
        }
    }

    func testUnsafeEntryNamesAreRejected() throws {
        for name in ["/etc/passwd", "../up.txt", "dir\\file"] {
            let bytes = ZipArchive.create([ZipEntry(name: name, data: [1])])
            XCTAssertThrowsError(try ZipArchive.read(bytes), name)
        }
        XCTAssertThrowsError(try ZipArchive.read([]))
        XCTAssertThrowsError(try ZipArchive.read([UInt8](repeating: 0, count: 40)))
    }

    func testCRC32KnownAnswer() {
        XCTAssertEqual(ZipArchive.crc32(Array("123456789".utf8)), 0xcbf4_3926)
        XCTAssertEqual(ZipArchive.crc32([]), 0)
    }

    func testISOStringMatchesDateToISOString() {
        XCTAssertEqual(GrovepadPackage.isoString(ms: 1_789_000_000_000), "2026-09-10T00:26:40.000Z")
        XCTAssertEqual(GrovepadPackage.isoString(ms: 0), "1970-01-01T00:00:00.000Z")
        XCTAssertEqual(GrovepadPackage.isoString(ms: 1_789_000_000_123), "2026-09-10T00:26:40.123Z")
    }

    func testMediaKeysCoverEveryBlobFamily() throws {
        let media = try JSONParser.parse(#"{"id":"m","type":"media","data":{"localBlobKey":"blob-1"}}"#).objectValue!
        XCTAssertEqual(GrovepadPackage.mediaBlobKeys(for: media), ["blob-1"])
        let sketch = try JSONParser.parse(#"{"id":"s","type":"sketchpad","data":{"mode":"ink","diagram":{"files":[{"id":"f1"},{"id":""},{"nope":1}]},"skinStates":{"annotation":{"localBlobKey":"bg"}}}}"#).objectValue!
        XCTAssertEqual(GrovepadPackage.mediaBlobKeys(for: sketch), ["excalidraw:s:f1", "bg"])
        let text = try JSONParser.parse(#"{"id":"t","type":"text","data":{"localBlobKey":"ignored"}}"#).objectValue!
        XCTAssertEqual(GrovepadPackage.mediaBlobKeys(for: text), [])
        XCTAssertEqual(GrovepadPackage.extensionForType("image/jpeg"), "jpg")
        XCTAssertEqual(GrovepadPackage.extensionForType(""), "bin")
    }
}
