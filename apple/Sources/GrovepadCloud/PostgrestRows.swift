import Foundation
import GrovepadCore
import Supabase

// The SDK exports its own `JSONObject` (`[String: AnyJSON]`); inside this
// module the name always means the port's ordered object.
public typealias JSONObject = GrovepadCore.JSONObject
public typealias JSONValue = GrovepadCore.JSONValue

// ---------------------------------------------------------------------------
// Pure mapping between the port's JSON model and what the Supabase SDK sends
// and receives. Responses are parsed with GrovepadCore's own parser so key
// order and numbers survive exactly; requests are encoded through the SDK's
// `AnyJSON` (a `jsonb` column normalizes order anyway, and every checksum is
// taken over canonical JSON, never over the wire bytes).
// ---------------------------------------------------------------------------

enum PostgrestRows {
    /// A PostgREST response body → JSON. `maybeSingle()` answers `null` (or an
    /// empty body) when there is no row.
    static func parse(_ data: Data) throws -> JSONValue? {
        guard !data.isEmpty else { return nil }
        let value = try JSONParser.parse(data)
        // Spelled out: `JSONValue` is ExpressibleByNilLiteral, so a ternary
        // would read `nil` as `.null` and wrap it.
        if value.isNull { return .none }
        return value
    }

    /// The rows of a list response, tolerating a single object.
    static func rows(_ data: Data) throws -> [JSONObject] {
        guard let value = try parse(data) else { return [] }
        if let array = value.arrayValue { return array.compactMap(\.objectValue) }
        return value.objectValue.map { [$0] } ?? []
    }

    static func indexRow(_ value: JSONValue?, includeDocument: Bool) -> CloudIndexRow? {
        guard let object = value?.objectValue else { return nil }
        return CloudIndexRow(
            document: includeDocument ? object["doc"] : nil,
            checksum: text(object["checksum"]),
            updatedAt: text(object["updated_at"])
        )
    }

    static func canvasRow(_ object: JSONObject, includeBodies: Bool) -> CloudCanvasRow {
        CloudCanvasRow(
            canvasId: text(object["canvas_id"]),
            checksum: text(object["checksum"]),
            body: includeBodies ? text(object["body"]) : nil,
            meta: includeBodies ? object["meta"] : nil,
            updatedAt: text(object["updated_at"])
        )
    }

    static func legacyRow(_ value: JSONValue?, includeDocument: Bool) -> CloudLegacyRow? {
        guard let object = value?.objectValue else { return nil }
        return CloudLegacyRow(data: includeDocument ? object["data"] : nil, updatedAt: text(object["updated_at"]))
    }

    /// `stringField`: a string, else nil (never a number coerced).
    static func text(_ value: JSONValue?) -> String? {
        guard let value, value.isString else { return nil }
        return value.stringValue
    }

    // MARK: - Request bodies

    static func anyJSON(_ value: JSONValue) -> AnyJSON {
        switch value {
        case .null: return .null
        case .bool(let bool): return .bool(bool)
        case .number(let number):
            if number.isFinite, number == number.rounded(), abs(number) < 9_007_199_254_740_992 { return .integer(Int(number)) }
            return .double(number)
        case .string(let text): return .string(text)
        case .utf16(let units): return .string(String(decoding: units, as: UTF16.self))
        case .array(let items): return .array(items.map(anyJSON))
        case .object(let object):
            var result: [String: AnyJSON] = [:]
            for (key, item) in object.entries { result[key] = anyJSON(item) }
            return .object(result)
        }
    }

    static func canvasUpsert(userId: String, _ row: CloudCanvasUpsert) -> [String: AnyJSON] {
        [
            "user_id": .string(userId),
            "canvas_id": .string(row.canvasId),
            "body": .string(row.body),
            "checksum": .string(row.checksum),
            "meta": anyJSON(.object(row.meta)),
        ]
    }

    static func indexUpsert(userId: String, _ row: CloudIndexUpsert) -> [String: AnyJSON] {
        [
            "user_id": .string(userId),
            "doc": anyJSON(.object(row.document)),
            "checksum": .string(row.checksum),
            "meta": anyJSON(.object(row.meta)),
        ]
    }

    static func legacyUpsert(userId: String, board: JSONObject, updatedAt: String) -> [String: AnyJSON] {
        ["user_id": .string(userId), "data": anyJSON(.object(board)), "updated_at": .string(updatedAt)]
    }
}

// MARK: - Error mapping

enum SupabaseErrors {
    /// The transport's vocabulary for whatever the SDK threw.
    static func transportError(_ error: Error) -> CloudTransportError {
        if let error = error as? CloudTransportError { return error }
        if let postgrest = error as? PostgrestError {
            if CloudTransportError.isMissingSchemaCode(postgrest.code) { return .schemaMissing }
            if postgrest.code == "42501" { return .refused(postgrest.message) }
            return .other(postgrest.message)
        }
        if isOffline(error) { return .offline }
        return .other(String(describing: error))
    }

    /// `URLError` codes that mean "no network", as opposed to a server answer.
    static func isOffline(_ error: Error) -> Bool {
        guard let urlError = error as? URLError else { return false }
        switch urlError.code {
        case .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
             .dnsLookupFailed, .timedOut, .internationalRoamingOff, .dataNotAllowed:
            return true
        default:
            return false
        }
    }

    /// `isAlreadyUploaded`: Storage refuses an object that already exists;
    /// that is success, not error.
    static func isAlreadyUploaded(statusCode: String?, message: String?) -> Bool {
        if statusCode == "409" { return true }
        guard let message else { return false }
        return message.range(of: "already exists|duplicate", options: [.regularExpression, .caseInsensitive]) != nil
    }
}
