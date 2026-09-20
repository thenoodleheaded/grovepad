import Foundation

// ---------------------------------------------------------------------------
// A JSON.stringify-compatible writer.
//
// Byte-for-byte the output JavaScript produces for the same value: the same
// key order (JSONObject owns it), the same string escapes (only `"`, `\`,
// control characters and lone surrogates are escaped; everything else,
// including U+2028 and U+007F, is written raw), the same number formatting
// (ECMAScript Number::toString: shortest round-trip digits, plain notation
// between 1e-7 and 1e21, exponent notation outside), and the same two-space
// pretty layout when an indent is requested.
// ---------------------------------------------------------------------------

public enum JSONWriter {
    /// `JSON.stringify(value)`.
    public static func stringify(_ value: JSONValue) -> String {
        var out = ""
        out.reserveCapacity(256)
        write(value, into: &out, indent: nil, depth: 0)
        return out
    }

    /// `JSON.stringify(value, null, 2)` (or any indent width).
    public static func stringify(_ value: JSONValue, indent: Int) -> String {
        var out = ""
        out.reserveCapacity(256)
        write(value, into: &out, indent: indent > 0 ? String(repeating: " ", count: min(indent, 10)) : nil, depth: 0)
        return out
    }

    /// `canonicalJson`: keys sorted (UTF-16 code unit order, as `Array.sort`
    /// does) at every level, then `JSON.stringify`. Object insertion order can
    /// therefore never create a false change in a checksum.
    public static func canonical(_ value: JSONValue) -> String {
        stringify(canonicalize(value))
    }

    public static func canonicalize(_ value: JSONValue) -> JSONValue {
        switch value {
        case .array(let items): return .array(items.map(canonicalize))
        case .object(let object):
            let sorted = object.keys.sorted(by: utf16Less)
            var result = JSONObject()
            for key in sorted { result[key] = canonicalize(object[key]!) }
            return .object(result)
        default: return value
        }
    }

    /// JavaScript's default `Array.prototype.sort` order for strings.
    public static func utf16Less(_ lhs: String, _ rhs: String) -> Bool {
        var left = lhs.utf16.makeIterator()
        var right = rhs.utf16.makeIterator()
        while true {
            switch (left.next(), right.next()) {
            case (nil, nil): return false
            case (nil, _): return true
            case (_, nil): return false
            case (let a?, let b?):
                if a != b { return a < b }
            }
        }
    }

    private static func write(_ value: JSONValue, into out: inout String, indent: String?, depth: Int) {
        switch value {
        case .null: out += "null"
        case .bool(let flag): out += flag ? "true" : "false"
        case .number(let number): out += JSNumberFormatter.string(number)
        case .string(let text): writeString(text, into: &out)
        case .utf16(let units): writeUTF16(units, into: &out)
        case .array(let items):
            if items.isEmpty { out += "[]"; return }
            out += "["
            if let indent {
                let inner = String(repeating: indent, count: depth + 1)
                for (position, item) in items.enumerated() {
                    out += position == 0 ? "\n" : ",\n"
                    out += inner
                    write(item, into: &out, indent: indent, depth: depth + 1)
                }
                out += "\n" + String(repeating: indent, count: depth) + "]"
            } else {
                for (position, item) in items.enumerated() {
                    if position > 0 { out += "," }
                    write(item, into: &out, indent: nil, depth: depth + 1)
                }
                out += "]"
            }
        case .object(let object):
            if object.isEmpty { out += "{}"; return }
            out += "{"
            if let indent {
                let inner = String(repeating: indent, count: depth + 1)
                for (position, entry) in object.entries.enumerated() {
                    out += position == 0 ? "\n" : ",\n"
                    out += inner
                    writeString(entry.key, into: &out, isKey: true)
                    out += ": "
                    write(entry.value, into: &out, indent: indent, depth: depth + 1)
                }
                out += "\n" + String(repeating: indent, count: depth) + "}"
            } else {
                for (position, entry) in object.entries.enumerated() {
                    if position > 0 { out += "," }
                    writeString(entry.key, into: &out, isKey: true)
                    out += ":"
                    write(entry.value, into: &out, indent: nil, depth: depth + 1)
                }
                out += "}"
            }
        }
    }

    private static let hex: [Character] = Array("0123456789abcdef")

    private static func writeString(_ text: String, into out: inout String, isKey: Bool = false) {
        out += "\""
        for scalar in text.unicodeScalars {
            if isKey, scalar.value >= JSONObject.illFormedKeyBase {
                appendUnicodeEscape(UInt16(0xD800 + (scalar.value - JSONObject.illFormedKeyBase)), into: &out)
                continue
            }
            switch scalar {
            case "\"": out += "\\\""
            case "\\": out += "\\\\"
            case "\u{08}": out += "\\b"
            case "\u{0C}": out += "\\f"
            case "\n": out += "\\n"
            case "\r": out += "\\r"
            case "\t": out += "\\t"
            default:
                if scalar.value < 0x20 {
                    appendUnicodeEscape(UInt16(scalar.value), into: &out)
                } else {
                    out.unicodeScalars.append(scalar)
                }
            }
        }
        out += "\""
    }

    private static func writeUTF16(_ units: [UInt16], into out: inout String) {
        out += "\""
        var index = 0
        while index < units.count {
            let unit = units[index]
            if (0xD800...0xDBFF).contains(unit), index + 1 < units.count, (0xDC00...0xDFFF).contains(units[index + 1]) {
                let high = UInt32(unit - 0xD800), low = UInt32(units[index + 1] - 0xDC00)
                out.unicodeScalars.append(Unicode.Scalar(0x10000 + (high << 10) + low)!)
                index += 2
                continue
            }
            if (0xD800...0xDFFF).contains(unit) {
                appendUnicodeEscape(unit, into: &out)
            } else {
                switch unit {
                case 0x22: out += "\\\""
                case 0x5C: out += "\\\\"
                case 0x08: out += "\\b"
                case 0x0C: out += "\\f"
                case 0x0A: out += "\\n"
                case 0x0D: out += "\\r"
                case 0x09: out += "\\t"
                default:
                    if unit < 0x20 { appendUnicodeEscape(unit, into: &out) }
                    else { out.unicodeScalars.append(Unicode.Scalar(unit)!) }
                }
            }
            index += 1
        }
        out += "\""
    }

    private static func appendUnicodeEscape(_ unit: UInt16, into out: inout String) {
        out += "\\u"
        out.append(hex[Int(unit >> 12 & 0xF)])
        out.append(hex[Int(unit >> 8 & 0xF)])
        out.append(hex[Int(unit >> 4 & 0xF)])
        out.append(hex[Int(unit & 0xF)])
    }
}

/// ECMAScript `Number::toString(10)` for finite doubles.
public enum JSNumberFormatter {
    public static func string(_ value: Double) -> String {
        guard value.isFinite else { return "null" } // JSON.stringify(NaN/Infinity)
        if value == 0 { return "0" } // both zeros print as "0"
        let negative = value < 0
        let (digits, pointPosition) = shortestDigits(abs(value))
        let k = digits.count
        let n = pointPosition
        var out = negative ? "-" : ""
        if k <= n, n <= 21 {
            out += digits
            out += String(repeating: "0", count: n - k)
        } else if 0 < n, n <= 21 {
            out += digits.prefix(n)
            out += "."
            out += digits.dropFirst(n)
        } else if -6 < n, n <= 0 {
            out += "0."
            out += String(repeating: "0", count: -n)
            out += digits
        } else {
            let exponent = n - 1
            out += String(digits.first!)
            if k > 1 {
                out += "."
                out += digits.dropFirst()
            }
            out += "e"
            out += exponent >= 0 ? "+" : "-"
            out += String(abs(exponent))
        }
        return out
    }

    /// The shortest decimal digit string that round-trips, and the position
    /// of the decimal point relative to its start (ECMAScript's `n`: the value
    /// is 0.d₁d₂…dₖ × 10ⁿ). Swift's `description` is already the shortest
    /// round-trip representation; only its layout is re-derived here.
    static func shortestDigits(_ value: Double) -> (digits: String, pointPosition: Int) {
        let text = value.description // e.g. "1e+21", "0.1", "100.0", "5e-324", "1.2345678901234568e+20"
        var mantissa = Substring(text)
        var exponent = 0
        if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) {
            mantissa = text[text.startIndex..<e]
            exponent = Int(text[text.index(after: e)...])!
        }
        var integerPart = mantissa
        var fractionPart = Substring("")
        if let dot = mantissa.firstIndex(of: ".") {
            integerPart = mantissa[mantissa.startIndex..<dot]
            fractionPart = mantissa[mantissa.index(after: dot)...]
        }
        var digits = String(integerPart) + String(fractionPart)
        var point = integerPart.count + exponent
        // Strip leading zeros (each one moves the point left).
        while digits.count > 1, digits.first == "0" {
            digits.removeFirst()
            point -= 1
        }
        // Strip trailing zeros (the point position is unaffected).
        while digits.count > 1, digits.last == "0" {
            digits.removeLast()
        }
        return (digits, point)
    }
}
