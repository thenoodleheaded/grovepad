import Foundation

// ---------------------------------------------------------------------------
// Wire transforms — pure, total functions over field values
// (`engine/transforms.ts`). A transform never throws and never returns
// NaN/Infinity: a wire must be unable to poison the widget it feeds.
// ---------------------------------------------------------------------------

/// `Number.isFinite(value) ? value : 0`.
@inlinable func finite(_ value: Double) -> Double {
    value.isFinite ? value : 0
}

/// Apply a wire transform. `nil` and identity pass the value through.
public func applyTransform(_ value: FieldValue, _ transform: WireTransform?) -> FieldValue {
    guard let transform else { return value }
    switch transform {
    case .identity:
        return value
    case .scale(let factor):
        return .number(finite(num(value) * factor))
    case .offset(let amount):
        return .number(finite(num(value) + amount))
    case .clamp(let a, let b):
        let lo = Swift.min(a, b)
        let hi = Swift.max(a, b)
        return .number(Swift.min(hi, Swift.max(lo, num(value))))
    case .mapRange(let inMin, let inMax, let outMin, let outMax):
        let span = inMax - inMin
        if span == 0 { return .number(finite(outMin)) }
        let t = (num(value) - inMin) / span
        return .number(finite(outMin + t * (outMax - outMin)))
    case .round:
        return .number(jsRound(num(value)))
    case .invert:
        if case .bool(let flag) = value { return .bool(!flag) }
        return .number(finite(-num(value)))
    case .threshold(let threshold):
        return .bool(num(value) >= threshold)
    case .format(let template):
        return .text(JavaScript.replaceAll(template, "{value}", with: text(value)))
    }
}

/// Stable serialization for change detection: the engine compares these
/// strings to decide whether a wire has anything new to say.
public func serializeFieldValue(_ value: FieldValue) -> String {
    switch value {
    case .series(let points):
        var out = "s:"
        for point in points {
            out += JavaScript.numberString(point.t) + "," + JavaScript.numberString(point.v) + ";"
        }
        return out
    case .number(let number): return "n:" + JavaScript.numberString(number)
    case .bool(let flag): return "b:" + (flag ? "true" : "false")
    case .text(let string): return "t:" + string
    }
}

/// The boolean reading of a field value — trigger edges are detected on this.
public func fieldValueAsBool(_ value: FieldValue) -> Bool {
    bool(value)
}
