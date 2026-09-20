import Foundation

// ---------------------------------------------------------------------------
// A JSON.parse-compatible reader.
//
// Accepts exactly the RFC 8259 grammar JavaScript accepts: no comments, no
// trailing commas, no leading zeros, no NaN/Infinity, whitespace limited to
// space, tab, newline and carriage return. Duplicate keys take the last value
// at the first key's position, as in JavaScript. Numbers become the nearest
// double. Ill-formed UTF-16 escapes (lone surrogates) are preserved.
// ---------------------------------------------------------------------------

public struct JSONParseError: Error, Equatable, CustomStringConvertible {
    public let message: String
    public let offset: Int
    public var description: String { "\(message) at byte \(offset)" }
}

public enum JSONParser {
    public static func parse(_ text: String) throws -> JSONValue {
        try parse(Array(text.utf8))
    }

    public static func parse(_ data: Data) throws -> JSONValue {
        try parse([UInt8](data))
    }

    public static func parse(_ bytes: [UInt8]) throws -> JSONValue {
        var scanner = Scanner(bytes: bytes)
        scanner.skipWhitespace()
        let value = try scanner.value()
        scanner.skipWhitespace()
        guard scanner.atEnd else { throw scanner.error("Unexpected non-whitespace character after JSON") }
        return value
    }

    private struct Scanner {
        let bytes: [UInt8]
        var index = 0

        init(bytes: [UInt8]) { self.bytes = bytes }

        var atEnd: Bool { index >= bytes.count }

        func error(_ message: String) -> JSONParseError {
            JSONParseError(message: message, offset: index)
        }

        mutating func skipWhitespace() {
            while index < bytes.count {
                switch bytes[index] {
                case 0x20, 0x09, 0x0A, 0x0D: index += 1
                default: return
                }
            }
        }

        mutating func value() throws -> JSONValue {
            guard index < bytes.count else { throw error("Unexpected end of JSON input") }
            switch bytes[index] {
            case UInt8(ascii: "{"): return try object()
            case UInt8(ascii: "["): return try array()
            case UInt8(ascii: "\""): return try string()
            case UInt8(ascii: "t"): try literal("true"); return .bool(true)
            case UInt8(ascii: "f"): try literal("false"); return .bool(false)
            case UInt8(ascii: "n"): try literal("null"); return .null
            case UInt8(ascii: "-"), UInt8(ascii: "0")...UInt8(ascii: "9"): return try number()
            default: throw error("Unexpected token")
            }
        }

        mutating func literal(_ word: StaticString) throws {
            let expected = Array(word.description.utf8)
            guard index + expected.count <= bytes.count, Array(bytes[index..<index + expected.count]) == expected else {
                throw error("Unexpected token")
            }
            index += expected.count
        }

        mutating func object() throws -> JSONValue {
            index += 1 // {
            var result = JSONObject()
            skipWhitespace()
            if index < bytes.count, bytes[index] == UInt8(ascii: "}") {
                index += 1
                return .object(result)
            }
            while true {
                skipWhitespace()
                guard index < bytes.count, bytes[index] == UInt8(ascii: "\"") else { throw error("Expected property name") }
                let key: String
                switch try string() {
                case .string(let text): key = text
                case .utf16(let units): key = JSONObject.keyFromIllFormedUTF16(units)
                default: throw error("Expected property name")
                }
                skipWhitespace()
                guard index < bytes.count, bytes[index] == UInt8(ascii: ":") else { throw error("Expected ':' after property name") }
                index += 1
                skipWhitespace()
                result[key] = try value()
                skipWhitespace()
                guard index < bytes.count else { throw error("Unexpected end of JSON input") }
                if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
                if bytes[index] == UInt8(ascii: "}") { index += 1; return .object(result) }
                throw error("Expected ',' or '}' after property value")
            }
        }

        mutating func array() throws -> JSONValue {
            index += 1 // [
            var items: [JSONValue] = []
            skipWhitespace()
            if index < bytes.count, bytes[index] == UInt8(ascii: "]") {
                index += 1
                return .array(items)
            }
            while true {
                skipWhitespace()
                items.append(try value())
                skipWhitespace()
                guard index < bytes.count else { throw error("Unexpected end of JSON input") }
                if bytes[index] == UInt8(ascii: ",") { index += 1; continue }
                if bytes[index] == UInt8(ascii: "]") { index += 1; return .array(items) }
                throw error("Expected ',' or ']' after array element")
            }
        }

        mutating func number() throws -> JSONValue {
            let start = index
            if bytes[index] == UInt8(ascii: "-") { index += 1 }
            guard index < bytes.count else { throw error("No number after minus sign") }
            if bytes[index] == UInt8(ascii: "0") {
                index += 1
            } else if bytes[index] >= UInt8(ascii: "1"), bytes[index] <= UInt8(ascii: "9") {
                while index < bytes.count, isDigit(bytes[index]) { index += 1 }
            } else {
                throw error("Unexpected token in number")
            }
            if index < bytes.count, bytes[index] == UInt8(ascii: ".") {
                index += 1
                guard index < bytes.count, isDigit(bytes[index]) else { throw error("Unterminated fractional number") }
                while index < bytes.count, isDigit(bytes[index]) { index += 1 }
            }
            if index < bytes.count, bytes[index] == UInt8(ascii: "e") || bytes[index] == UInt8(ascii: "E") {
                index += 1
                if index < bytes.count, bytes[index] == UInt8(ascii: "+") || bytes[index] == UInt8(ascii: "-") { index += 1 }
                guard index < bytes.count, isDigit(bytes[index]) else { throw error("Exponent part is missing a number") }
                while index < bytes.count, isDigit(bytes[index]) { index += 1 }
            }
            let text = String(decoding: bytes[start..<index], as: UTF8.self)
            guard let parsed = Double(text) else { throw error("Invalid number") }
            return .number(parsed)
        }

        func isDigit(_ byte: UInt8) -> Bool { byte >= 48 && byte <= 57 }

        mutating func string() throws -> JSONValue {
            index += 1 // opening quote
            var units: [UInt16] = []
            var illFormed = false
            var pendingHigh: UInt16? = nil

            func push(_ unit: UInt16) {
                if let high = pendingHigh {
                    if (0xDC00...0xDFFF).contains(unit) {
                        units.append(high)
                        units.append(unit)
                        pendingHigh = nil
                        return
                    }
                    units.append(high)
                    illFormed = true
                    pendingHigh = nil
                }
                if (0xD800...0xDBFF).contains(unit) {
                    pendingHigh = unit
                } else if (0xDC00...0xDFFF).contains(unit) {
                    units.append(unit)
                    illFormed = true
                } else {
                    units.append(unit)
                }
            }

            func flushPending() {
                if let high = pendingHigh {
                    units.append(high)
                    illFormed = true
                    pendingHigh = nil
                }
            }

            while true {
                guard index < bytes.count else { throw error("Unterminated string in JSON") }
                let byte = bytes[index]
                if byte == UInt8(ascii: "\"") {
                    index += 1
                    break
                }
                if byte < 0x20 { throw error("Bad control character in string literal in JSON") }
                if byte == UInt8(ascii: "\\") {
                    index += 1
                    guard index < bytes.count else { throw error("Unterminated string in JSON") }
                    let escape = bytes[index]
                    index += 1
                    switch escape {
                    case UInt8(ascii: "\""): push(0x22)
                    case UInt8(ascii: "\\"): push(0x5C)
                    case UInt8(ascii: "/"): push(0x2F)
                    case UInt8(ascii: "b"): push(0x08)
                    case UInt8(ascii: "f"): push(0x0C)
                    case UInt8(ascii: "n"): push(0x0A)
                    case UInt8(ascii: "r"): push(0x0D)
                    case UInt8(ascii: "t"): push(0x09)
                    case UInt8(ascii: "u"):
                        guard index + 4 <= bytes.count else { throw error("Bad Unicode escape in JSON") }
                        var unit: UInt16 = 0
                        for offset in 0..<4 {
                            guard let nibble = hexValue(bytes[index + offset]) else { throw error("Bad Unicode escape in JSON") }
                            unit = unit << 4 | UInt16(nibble)
                        }
                        index += 4
                        push(unit)
                    default:
                        throw error("Bad escaped character in JSON")
                    }
                    continue
                }
                // A run of raw UTF-8: decode to UTF-16 units. Invalid bytes
                // become U+FFFD, as TextDecoder does before JSON.parse runs.
                let runStart = index
                while index < bytes.count, bytes[index] != UInt8(ascii: "\""), bytes[index] != UInt8(ascii: "\\"), bytes[index] >= 0x20 {
                    index += 1
                }
                let run = String(decoding: bytes[runStart..<index], as: UTF8.self)
                for unit in run.utf16 { push(unit) }
            }
            flushPending()
            if illFormed { return .utf16(units) }
            return .string(String(decoding: units, as: UTF16.self))
        }

        func hexValue(_ byte: UInt8) -> UInt8? {
            switch byte {
            case UInt8(ascii: "0")...UInt8(ascii: "9"): return byte - 48
            case UInt8(ascii: "a")...UInt8(ascii: "f"): return byte - 97 + 10
            case UInt8(ascii: "A")...UInt8(ascii: "F"): return byte - 65 + 10
            default: return nil
            }
        }
    }
}
