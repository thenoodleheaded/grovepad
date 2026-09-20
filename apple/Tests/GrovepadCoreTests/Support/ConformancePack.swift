import Foundation
import XCTest
@testable import GrovepadCore

/// Reads the frozen pack under `apple/Conformance` (phase 0). Fixtures are
/// shared by path with the web repository, never copied into the bundle.
enum ConformancePack {
    static let root: URL = {
        // …/apple/Tests/GrovepadCoreTests/Support/ConformancePack.swift → …/apple/Conformance
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        return url.appendingPathComponent("Conformance")
    }()

    static func url(_ relativePath: String) -> URL {
        root.appendingPathComponent(relativePath)
    }

    static func text(_ relativePath: String) throws -> String {
        try String(contentsOf: url(relativePath), encoding: .utf8)
    }

    static func bytes(_ relativePath: String) throws -> [UInt8] {
        [UInt8](try Data(contentsOf: url(relativePath)))
    }

    static func json(_ relativePath: String) throws -> JSONValue {
        try JSONParser.parse(try bytes(relativePath))
    }

    static func object(_ relativePath: String) throws -> JSONObject {
        guard let object = try json(relativePath).objectValue else {
            throw NSError(domain: "ConformancePack", code: 1, userInfo: [NSLocalizedDescriptionKey: "\(relativePath) is not an object"])
        }
        return object
    }

    /// `pack.json` — the manifest with the frozen clock, uuid rule and file lists.
    static func manifest() throws -> JSONObject {
        try object("pack.json")
    }

    static func stringList(_ value: JSONValue?) -> [String] {
        (value?.arrayValue ?? []).compactMap(\.stringValue)
    }
}
