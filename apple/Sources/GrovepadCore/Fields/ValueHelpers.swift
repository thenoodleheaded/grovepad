import Foundation

// ---------------------------------------------------------------------------
// Tolerant field-value coercion (`widgets/fields/valueHelpers.ts`, and the
// identical private copies in `engine/transforms.ts`).
//
// Every getter, setter, command and transform reads through these three so a
// wire can never throw on the wrong type. The text→number path is JavaScript's
// `parseFloat` (a numeric PREFIX, not the whole string), number→text is
// `String(number)`, and whitespace is JavaScript's `trim` set, which is wider
// than ASCII. Nothing here may diverge from the web without the pack noticing.
// ---------------------------------------------------------------------------

/// JavaScript's `Number` coercion of a field value (`num`).
public func num(_ value: FieldValue) -> Double {
    switch value {
    case .series(let points): return points.last?.v ?? 0
    case .number(let number): return number.isFinite ? number : 0
    case .bool(let flag): return flag ? 1 : 0
    case .text(let string):
        let parsed = JavaScript.parseFloat(string)
        return parsed.isFinite ? parsed : 0
    }
}

/// JavaScript's string reading of a field value (`text`).
public func text(_ value: FieldValue) -> String {
    switch value {
    case .series(let points): return points.map { JavaScript.numberString($0.v) }.joined(separator: ", ")
    case .text(let string): return string
    case .number(let number): return JavaScript.numberString(number)
    case .bool(let flag): return flag ? "true" : "false"
    }
}

/// The boolean reading of a field value (`bool`).
public func bool(_ value: FieldValue) -> Bool {
    switch value {
    case .series(let points): return !points.isEmpty
    case .bool(let flag): return flag
    case .number(let number): return number >= 1
    case .text(let string): return string == "true" || string == "1" || string == "yes" || string == "on"
    }
}

/// `num(rawJsonValue)`: the web hands raw module data (a metric tile's string
/// value, say) straight to `num`; this is that call for a JSON slot.
public func num(_ json: JSONValue?) -> Double {
    guard let json, let value = FieldValue(loose: json) else { return 0 }
    return num(value)
}

public extension FieldValue {
    /// A JSON slot read as the field value the web would have returned for it
    /// (`typeof` dispatch): a number, boolean, string or point series. Objects,
    /// null and mixed arrays have no field-value reading and yield nil.
    init?(loose json: JSONValue) {
        switch json {
        case .number, .bool, .string, .utf16, .array: self.init(json: json)
        default: return nil
        }
    }
}

/// The handful of ECMAScript primitives the coercions lean on.
public enum JavaScript {
    /// `String(number)`: `Number::toString` plus the three non-finite spellings.
    public static func numberString(_ value: Double) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        return JSNumberFormatter.string(value)
    }

    /// WhiteSpace ∪ LineTerminator — what `trim` and `parseFloat` skip.
    public static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF:
            return true
        case 0x2000...0x200A:
            return true
        default:
            return false
        }
    }

    /// `String.prototype.trim`.
    public static func trim(_ string: String) -> String {
        let scalars = string.unicodeScalars
        var start = scalars.startIndex
        var end = scalars.endIndex
        while start < end, isWhitespace(scalars[start]) { start = scalars.index(after: start) }
        while end > start, isWhitespace(scalars[scalars.index(before: end)]) { end = scalars.index(before: end) }
        return String(String.UnicodeScalarView(scalars[start..<end]))
    }

    /// `parseFloat`: skip leading whitespace, take the longest prefix that is
    /// a StrDecimalLiteral (`Infinity` included), NaN when there is none.
    public static func parseFloat(_ string: String) -> Double {
        let scalars = Array(string.unicodeScalars)
        var index = 0
        while index < scalars.count, isWhitespace(scalars[index]) { index += 1 }
        var literal = ""
        if index < scalars.count, scalars[index] == "+" || scalars[index] == "-" {
            literal.unicodeScalars.append(scalars[index])
            index += 1
        }
        let infinity = Array("Infinity".unicodeScalars)
        if index + infinity.count <= scalars.count, Array(scalars[index..<index + infinity.count]) == infinity {
            return literal == "-" ? -.infinity : .infinity
        }
        func isDigit(_ scalar: Unicode.Scalar) -> Bool { scalar.value >= 0x30 && scalar.value <= 0x39 }
        var integerDigits = 0
        while index < scalars.count, isDigit(scalars[index]) {
            literal.unicodeScalars.append(scalars[index])
            index += 1
            integerDigits += 1
        }
        var fractionDigits = 0
        if index < scalars.count, scalars[index] == "." {
            var probe = index + 1
            var fraction = ""
            while probe < scalars.count, isDigit(scalars[probe]) {
                fraction.unicodeScalars.append(scalars[probe])
                probe += 1
                fractionDigits += 1
            }
            if integerDigits > 0 || fractionDigits > 0 {
                literal += "." + fraction
                index = probe
            }
        }
        guard integerDigits > 0 || fractionDigits > 0 else { return .nan }
        if index < scalars.count, scalars[index] == "e" || scalars[index] == "E" {
            var probe = index + 1
            var exponent = "e"
            if probe < scalars.count, scalars[probe] == "+" || scalars[probe] == "-" {
                exponent.unicodeScalars.append(scalars[probe])
                probe += 1
            }
            var exponentDigits = 0
            while probe < scalars.count, isDigit(scalars[probe]) {
                exponent.unicodeScalars.append(scalars[probe])
                probe += 1
                exponentDigits += 1
            }
            if exponentDigits > 0 {
                literal += exponent
                index = probe
            }
        }
        if literal.hasSuffix(".") { literal.removeLast() }
        if literal.hasPrefix("+") { literal.removeFirst() }
        if let parsed = Double(literal) { return parsed }
        // Overflow ("1e400") — Double(String) declines what strtod rounds to ±∞.
        return literal.hasPrefix("-") ? -.infinity : .infinity
    }

    /// `String.prototype.replaceAll(pattern, replacement)` with a STRING
    /// pattern. The replacement still goes through GetSubstitution, so `$$`,
    /// `$&`, `` $` `` and `$'` in the replacement text are expanded exactly as
    /// the web does (there are no capture groups, so `$1` stays literal).
    public static func replaceAll(_ subject: String, _ pattern: String, with replacement: String) -> String {
        guard !pattern.isEmpty, subject.contains(pattern) else { return subject }
        let subjectUnits = Array(subject.utf16)
        let patternUnits = Array(pattern.utf16)
        let replacementUnits = Array(replacement.utf16)
        let dollar = UInt16(0x24)
        var positions: [Int] = []
        var scan = 0
        while scan + patternUnits.count <= subjectUnits.count {
            if Array(subjectUnits[scan..<scan + patternUnits.count]) == patternUnits {
                positions.append(scan)
                scan += patternUnits.count
            } else {
                scan += 1
            }
        }
        var out: [UInt16] = []
        var cursor = 0
        for position in positions {
            out.append(contentsOf: subjectUnits[cursor..<position])
            var index = 0
            while index < replacementUnits.count {
                let unit = replacementUnits[index]
                if unit == dollar, index + 1 < replacementUnits.count {
                    let next = replacementUnits[index + 1]
                    switch next {
                    case dollar: out.append(dollar); index += 2; continue
                    case UInt16(0x26): out.append(contentsOf: patternUnits); index += 2; continue // $&
                    case UInt16(0x60): out.append(contentsOf: subjectUnits[0..<position]); index += 2; continue // $`
                    case UInt16(0x27): out.append(contentsOf: subjectUnits[(position + patternUnits.count)...]); index += 2; continue // $'
                    default: break
                    }
                }
                out.append(unit)
                index += 1
            }
            cursor = position + patternUnits.count
        }
        out.append(contentsOf: subjectUnits[cursor...])
        return String(decoding: out, as: UTF16.self)
    }

    /// JavaScript truthiness of a JSON slot (`Boolean(value)`); a missing
    /// slot is `undefined`, hence false.
    public static func truthy(_ json: JSONValue?) -> Bool {
        guard let json else { return false }
        switch json {
        case .null: return false
        case .bool(let flag): return flag
        case .number(let number): return number != 0 && !number.isNaN
        case .string(let string): return !string.isEmpty
        case .utf16(let units): return !units.isEmpty
        case .array, .object: return true
        }
    }

    /// `a ?? b` over JSON slots: null and missing both fall through.
    public static func coalesce(_ json: JSONValue?, _ fallback: JSONValue?) -> JSONValue? {
        if let json, !json.isNull { return json }
        return fallback
    }
}
