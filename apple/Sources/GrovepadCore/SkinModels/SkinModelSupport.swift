import Foundation

// ---------------------------------------------------------------------------
// JavaScript arithmetic and string primitives the skin models lean on, over
// and above `ValueHelpers.swift`. Each one names the ECMAScript operation it
// reproduces; nothing here is a Swift convenience.
// ---------------------------------------------------------------------------

public extension JavaScript {
    /// `string.slice(0, count)` — a prefix measured in UTF-16 code units. A
    /// cut inside a surrogate pair leaves a lone surrogate on the web; here it
    /// decodes lossily (U+FFFD), which no field output ever carries.
    static func prefix(_ string: String, utf16Count count: Int) -> String {
        let units = Array(string.utf16)
        guard count < units.count else { return string }
        return String(decoding: units[0..<Swift.max(0, count)], as: UTF16.self)
    }

    /// `Math.trunc`.
    static func trunc(_ value: Double) -> Double {
        value.rounded(.towardZero)
    }

    /// `Math.min(a, b)`: NaN wins, and −0 is smaller than +0.
    static func min(_ a: Double, _ b: Double) -> Double {
        if a.isNaN || b.isNaN { return .nan }
        if a == 0, b == 0 { return (a.sign == .minus || b.sign == .minus) ? -0.0 : 0.0 }
        return a < b ? a : b
    }

    /// `Math.max(a, b)`: NaN wins, and +0 is larger than −0.
    static func max(_ a: Double, _ b: Double) -> Double {
        if a.isNaN || b.isNaN { return .nan }
        if a == 0, b == 0 { return (a.sign == .plus || b.sign == .plus) ? 0.0 : -0.0 }
        return a > b ? a : b
    }

    /// `Math.min(...values)` (empty → +Infinity).
    static func min(_ values: [Double]) -> Double {
        values.reduce(.infinity, min)
    }

    /// `Math.max(...values)` (empty → −Infinity).
    static func max(_ values: [Double]) -> Double {
        values.reduce(-.infinity, max)
    }

    /// `base ** exponent` (`Math.pow`). Differs from C's `pow` where the
    /// standard says NaN: a NaN exponent, and `±1 ** ±Infinity`.
    static func pow(_ base: Double, _ exponent: Double) -> Double {
        if exponent.isNaN { return .nan }
        if exponent.isInfinite, abs(base) == 1 { return .nan }
        return Foundation.pow(base, exponent)
    }

    /// `Number.prototype.toExponential(fractionDigits)` for 0…20 digits. The
    /// exact decimal expansion is rounded half-up ("pick the larger n").
    static func toExponential(_ value: Double, fractionDigits: Int) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        let sign = value < 0 ? "-" : ""
        let magnitude = abs(value)
        if magnitude == 0 {
            return "0" + (fractionDigits > 0 ? "." + String(repeating: "0", count: fractionDigits) : "") + "e+0"
        }
        // 41 significant digits of the exact value, then a half-up round at
        // the digit JavaScript keeps. printf's own rounding at digit 41 can
        // only mislead when digits 8…41 are a run of nines, which no result
        // this app computes comes near.
        let formatted = String(format: "%.40e", magnitude)
        let parts = formatted.split(separator: "e")
        var digits = parts[0].filter { $0 != "." }.map { Int(String($0))! }
        var exponent = Int(parts[1])!
        let keep = fractionDigits + 1
        if digits.count > keep {
            let roundUp = digits[keep] >= 5
            digits = Array(digits[0..<keep])
            if roundUp {
                var index = keep - 1
                while index >= 0 {
                    if digits[index] == 9 {
                        digits[index] = 0
                        index -= 1
                    } else {
                        digits[index] += 1
                        break
                    }
                }
                if index < 0 {
                    digits.insert(1, at: 0)
                    digits.removeLast()
                    exponent += 1
                }
            }
        }
        var out = sign + String(digits[0])
        if fractionDigits > 0 {
            out += "." + digits[1..<keep].map(String.init).joined()
        }
        out += "e" + (exponent < 0 ? "-" : "+") + String(abs(exponent))
        return out
    }

    /// `Number.prototype.toFixed(fractionDigits)` for 0…20 digits: the exact
    /// value rounded half-up; magnitudes of 1e21 and above fall back to
    /// `String(number)`.
    static func toFixed(_ value: Double, fractionDigits: Int) -> String {
        if value.isNaN { return "NaN" }
        if value.isInfinite { return value < 0 ? "-Infinity" : "Infinity" }
        if abs(value) >= 1e21 { return numberString(value) }
        let magnitude = abs(value)
        let formatted = String(format: "%.\(fractionDigits + 25)f", magnitude)
        let parts = formatted.split(separator: ".", omittingEmptySubsequences: false)
        var whole = parts[0].map { Int(String($0))! }
        var fraction = parts.count > 1 ? parts[1].map { Int(String($0))! } : []
        let roundUp = fraction.count > fractionDigits && fraction[fractionDigits] >= 5
        fraction = Array(fraction.prefix(fractionDigits))
        if roundUp {
            var carried = true
            var index = fraction.count - 1
            while carried, index >= 0 {
                if fraction[index] == 9 { fraction[index] = 0; index -= 1 } else { fraction[index] += 1; carried = false }
            }
            index = whole.count - 1
            while carried, index >= 0 {
                if whole[index] == 9 { whole[index] = 0; index -= 1 } else { whole[index] += 1; carried = false }
            }
            if carried { whole.insert(1, at: 0) }
        }
        // `(-0.001).toFixed(2)` is "-0.00": the sign survives; only −0 itself prints unsigned.
        let sign = value < 0 ? "-" : ""
        var out = sign + whole.map(String.init).joined()
        if fractionDigits > 0 { out += "." + fraction.map(String.init).joined() }
        return out
    }

    /// `String.prototype.padStart(2, '0')` over a non-negative integer.
    static func pad2(_ value: Int) -> String {
        value < 10 && value >= 0 ? "0" + String(value) : String(value)
    }

    /// A `typeof value === 'number' && Number.isFinite(value)` read of a slot, else the fallback.
    static func finite(_ json: JSONValue?, or fallback: Double = 0) -> Double {
        guard let number = json?.numberValue, number.isFinite else { return fallback }
        return number
    }
}

/// `data.skinStates?.[skin]` as the skin models read it: a record, or `{}`
/// when the pocket is missing or holds anything that is not a plain object.
func skinStateRecord(_ data: JSONObject, _ skin: String) -> JSONObject {
    data.object("skinStates")?.object(skin) ?? JSONObject()
}
