import Foundation

// ---------------------------------------------------------------------------
// Small reproductions of the JavaScript string semantics the persistence
// layer leans on: object-key equality for string values, `String.prototype`
// whitespace, and UTF-16 slicing. Everything here is internal to the module.
// ---------------------------------------------------------------------------

enum JS {
    /// The text a string value would have as an object key (`obj[value]`).
    /// A well-formed string is itself; an ill-formed one maps through the
    /// same private-use scheme `JSONObject` uses for its keys, so `raw.id === id`
    /// stays exact even for a lone surrogate.
    static func key(_ value: JSONValue?) -> String? {
        switch value {
        case .string(let text)?: return text
        case .utf16(let units)?: return JSONObject.keyFromIllFormedUTF16(units)
        default: return nil
        }
    }

    /// `typeof value === 'string'`.
    static func isString(_ value: JSONValue?) -> Bool { value?.isString ?? false }

    /// `typeof value === 'number' && Number.isFinite(value)` (JSON numbers are always finite).
    static func isFiniteNumber(_ value: JSONValue?) -> Bool { value?.numberValue != nil }

    /// `isRecord`: a non-null, non-array object.
    static func record(_ value: JSONValue?) -> JSONObject? { value?.objectValue }

    /// `isVector`: a record with finite `x` and `y`.
    static func isVector(_ value: JSONValue?) -> Bool {
        guard let object = record(value) else { return false }
        return isFiniteNumber(object["x"]) && isFiniteNumber(object["y"])
    }

    /// `Number.isInteger`.
    static func isInteger(_ value: Double) -> Bool { value.isFinite && value.rounded(.towardZero) == value }

    /// The UTF-16 code units of a string value (well-formed or not).
    static func units(_ value: JSONValue) -> [UInt16]? {
        switch value {
        case .string(let text): return Array(text.utf16)
        case .utf16(let units): return units
        default: return nil
        }
    }

    /// A string value from UTF-16 units: `.string` when well-formed, `.utf16` otherwise.
    static func string(fromUnits units: [UInt16]) -> JSONValue {
        var index = 0
        while index < units.count {
            let unit = units[index]
            if (0xD800...0xDBFF).contains(unit) {
                guard index + 1 < units.count, (0xDC00...0xDFFF).contains(units[index + 1]) else { return .utf16(units) }
                index += 2
                continue
            }
            if (0xDC00...0xDFFF).contains(unit) { return .utf16(units) }
            index += 1
        }
        return .string(String(decoding: units, as: UTF16.self))
    }

    /// `/\s/` and `String.prototype.trim`: WhiteSpace + LineTerminator, all BMP.
    static func isWhitespace(_ unit: UInt16) -> Bool {
        switch unit {
        case 0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: return true
        case 0x2000...0x200A: return true
        default: return false
        }
    }

    /// `text.trim()` is non-empty.
    static func hasNonWhitespace(_ units: [UInt16]) -> Bool { units.contains { !isWhitespace($0) } }

    /// `text.replace(/\s+/g, ' ').trim().slice(0, limit)` over UTF-16 units.
    static func collapseWhitespaceTrimAndSlice(_ units: [UInt16], limit: Int) -> [UInt16] {
        var collapsed: [UInt16] = []
        collapsed.reserveCapacity(units.count)
        var inRun = false
        for unit in units {
            if isWhitespace(unit) {
                if !inRun { collapsed.append(0x20) }
                inRun = true
            } else {
                collapsed.append(unit)
                inRun = false
            }
        }
        while collapsed.first == 0x20 { collapsed.removeFirst() }
        while collapsed.last == 0x20 { collapsed.removeLast() }
        return Array(collapsed.prefix(limit))
    }

    /// `` `${value}${suffix}` `` for a string value, keeping ill-formed text ill-formed.
    static func concat(_ value: JSONValue, _ suffix: String) -> JSONValue {
        guard let prefix = units(value) else { return .string(suffix) }
        return string(fromUnits: prefix + Array(suffix.utf16))
    }
}
