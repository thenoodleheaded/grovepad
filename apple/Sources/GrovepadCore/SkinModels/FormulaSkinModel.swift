import Foundation

// ---------------------------------------------------------------------------
// Formula skin model (`components/widgets/modules/formulaSkinModel.ts`).
//
// A Formula holds up to six named numbers `a` … `f`, every one a circuit
// port. The worn skin changes the QUESTION asked of them — running total,
// percent change, share, growth, a written expression, a weighted average, a
// choice between two outcomes — and `formulaReading` is the single owner of
// the answer, so the card, the resting tile and the `result` port can never
// disagree, rounding included.
//
// Ported in full. Data is read through `JSONObject` so a half-typed or
// hostile board answers 0 rather than throwing; where the web would read a
// non-number slot as `undefined`, the same fallbacks apply.
// ---------------------------------------------------------------------------

public enum FormulaSkinModel {
    public static let skins: [String] = ["two_input", "percent_change", "ratio", "growth", "expression", "weighted_score", "conditional"]

    public static func skinMode(_ raw: JSONValue?) -> String {
        guard let value = raw?.stringValue, skins.contains(value) else { return "two_input" }
        return value
    }

    // MARK: - Vocabulary

    public static let operatorSymbol: [String: String] = [
        "add": "+", "subtract": "−", "multiply": "×", "divide": "÷", "modulo": "mod", "power": "^",
    ]

    public static let operatorWord: [String: String] = [
        "add": "plus", "subtract": "minus", "multiply": "times", "divide": "divided by", "modulo": "remainder of", "power": "to the power of",
    ]

    /// `Object.keys(OPERATOR_SYMBOL)` in declaration order.
    public static let operators: [String] = ["add", "subtract", "multiply", "divide", "modulo", "power"]

    /// `formulaOperator`: `raw in OPERATOR_SYMBOL`. The `in` operator also
    /// finds the names every object inherits, so `"constructor"` (and its
    /// prototype siblings) pass on the web and fall through `twoInputValue`
    /// to the remainder branch; the same names pass here.
    public static func formulaOperator(_ raw: JSONValue?) -> String {
        guard let value = raw?.stringValue, operatorSymbol[value] != nil || JavaScript.objectPrototypeKeys.contains(value) else { return "add" }
        return value
    }

    static let resultWord: [String: String] = [
        "two_input": "Result", "percent_change": "Change", "ratio": "Share", "growth": "Projected",
        "expression": "Result", "weighted_score": "Score", "conditional": "Output",
    ]

    public static func resultWord(_ skin: String) -> String {
        resultWord[skin] ?? "Result"
    }

    // MARK: - Inputs

    public static let inputKeys: [String] = ["a", "b", "c", "d", "e", "f"]
    public static let inputMin = 2
    public static let inputMax = 6
    /// A name long enough to read, short enough to type into an expression.
    public static let nameLimit = 16

    public struct Input: Equatable {
        public let key: String
        /// The port's fixed letter — what the card's edge and the wire inspector say.
        public let letter: String
        /// The name this card gave the slot, or "" when it never did.
        public let name: String
        /// What to print: the name if there is one, else the letter.
        public let title: String
        public let value: Double
        /// True when a written expression can call the slot by its name.
        public let callable: Bool
    }

    /// How many slots this card holds. Always at least the canonical two.
    public static func inputCount(_ data: JSONObject) -> Int {
        guard let raw = data.number("inputCount"), raw.isFinite else { return inputMin }
        return clampedInt(JavaScript.trunc(raw), inputMin, inputMax)
    }

    static func storedName(_ data: JSONObject, _ key: String) -> String {
        guard let raw = data.object("names")?.string(key) else { return "" }
        return JavaScript.prefix(raw, utf16Count: nameLimit)
    }

    /// `if` is the evaluator's own word for a branch, and a slot may not
    /// answer to another slot's letter — one letter, one port.
    static func callableName(_ name: String, _ key: String) -> Bool {
        let clean = JavaScript.trim(name).lowercased()
        if !CalculatorSkinModel.isUsableVariableName(clean) || clean == "if" { return false }
        return !inputKeys.contains(clean) || clean == key
    }

    /// Every slot this card holds, in port order.
    public static func inputs(_ data: JSONObject) -> [Input] {
        inputKeys.prefix(inputCount(data)).map { key in
            let name = storedName(data, key)
            let trimmed = JavaScript.trim(name)
            return Input(
                key: key, letter: key.uppercased(), name: name,
                title: trimmed.isEmpty ? key.uppercased() : trimmed,
                value: JavaScript.finite(data[key]),
                callable: callableName(name, key)
            )
        }
    }

    /// What a written expression may call: every letter, and every usable name.
    public static func bindings(_ inputs: [Input]) -> [String: Double] {
        var bindings: [String: Double] = [:]
        for input in inputs { bindings[input.key] = input.value }
        for input in inputs where input.callable {
            bindings[JavaScript.trim(input.name).lowercased()] = input.value
        }
        return bindings
    }

    /// `dataWithInputCount`: grow or shrink the rack. Shrinking forgets the
    /// slots it drops, so a card narrowed back to two is the card it was.
    public static func dataWithInputCount(_ data: JSONObject, _ count: Double) -> JSONObject {
        let next = clampedInt(JavaScript.trunc(count), inputMin, inputMax)
        var result = data.assigning("inputCount", .number(Double(next)))
        var names = data.object("names") ?? JSONObject()
        for key in inputKeys.dropFirst(next) {
            result.removeValue(forKey: key)
            names.removeValue(forKey: key)
        }
        if names.isEmpty { result.removeValue(forKey: "names") } else { result["names"] = .object(names) }
        if next == inputMin { result.removeValue(forKey: "inputCount") }
        return result
    }

    public static func dataWithInputName(_ data: JSONObject, _ key: String, _ name: String) -> JSONObject {
        var names = data.object("names") ?? JSONObject()
        let clean = JavaScript.prefix(name, utf16Count: nameLimit)
        if !JavaScript.trim(clean).isEmpty { names[key] = .string(clean) } else { names.removeValue(forKey: key) }
        var next = data
        if names.isEmpty { next.removeValue(forKey: "names") } else { next["names"] = .object(names) }
        return next
    }

    /// `dataWithInputValue`: a wire may write a slot this card has not opened
    /// yet, so the write opens it.
    public static func dataWithInputValue(_ data: JSONObject, _ key: String, _ value: Double) -> JSONObject {
        let slot = (inputKeys.firstIndex(of: key) ?? -1) + 1
        let next = data.assigning(key, .number(value.isFinite ? value : 0))
        return slot > inputCount(data) ? next.assigning("inputCount", .number(Double(slot))) : next
    }

    // MARK: - Roles

    /// Which slot fills one of a skin's roles; a stored key the card no longer
    /// holds falls back to the role's default.
    public static func roleInput(_ inputs: [Input], _ state: JSONObject, _ role: String, _ fallbackIndex: Int) -> Input {
        if let raw = state.string(role), let found = inputs.first(where: { $0.key == raw }) { return found }
        return inputs[Swift.min(fallbackIndex, inputs.count - 1)]
    }

    // MARK: - Skins

    public struct Reading: Equatable {
        /// The number this card shows and publishes. One truth, not two.
        public let value: Double
        /// Printed after the value: the card's unit, or "%" where the answer is one.
        public let suffix: String
        /// Why the answer is what it is when the inputs cannot really answer.
        public let note: String?
    }

    static func ok(_ value: Double, _ suffix: String = "") -> Reading {
        Reading(value: value, suffix: suffix, note: nil)
    }

    /// The classic two-operand answer — unchanged from the card's first version.
    public static func twoInputValue(_ a: Double, _ b: Double, _ op: String) -> Double {
        switch op {
        case "add": return a + b
        case "subtract": return a - b
        case "multiply": return a * b
        case "power": return JavaScript.pow(a, b)
        case "divide": return b == 0 ? 0 : a / b
        default: return b == 0 ? 0 : jsRemainder(a, b)
        }
    }

    /// How many decimal places the card asks for, if it asks at all.
    public static func precision(_ data: JSONObject) -> Int? {
        guard let raw = data.number("precision"), raw.isFinite else { return nil }
        return clampedInt(JavaScript.trunc(raw), 0, 6)
    }

    public static func unit(_ data: JSONObject) -> String {
        guard let raw = data.string("unit") else { return "" }
        return JavaScript.trim(JavaScript.prefix(raw, utf16Count: 12))
    }

    public static func reading(_ data: JSONObject) -> Reading {
        let raw = rawReading(data)
        let places = precision(data)
        let unit = unit(data)
        return Reading(
            // Rounding is part of the answer, not a display trick.
            value: places.map { roundTo(raw.value, $0) } ?? raw.value,
            suffix: unit.isEmpty ? raw.suffix : unit,
            note: raw.note
        )
    }

    static func roundTo(_ value: Double, _ places: Int) -> Double {
        let scale = JavaScript.pow(10, Double(places))
        let rounded = jsRound(value * scale) / scale
        return rounded == 0 ? 0 : rounded // `Object.is(rounded, -0) ? 0 : rounded`
    }

    static func rawReading(_ data: JSONObject) -> Reading {
        let skin = skinMode(data["skin"])
        let inputs = inputs(data)
        let state = skinState(data, skin)

        if skin == "percent_change" {
            let from = roleInput(inputs, state, "fromKey", 0).value
            let to = roleInput(inputs, state, "toKey", 1).value
            if from == 0 { return Reading(value: 0, suffix: "%", note: "A start of zero has no percent change") }
            return ok(((to - from) / abs(from)) * 100, "%")
        }

        if skin == "ratio" {
            let part = roleInput(inputs, state, "partKey", 0)
            let total = inputs.reduce(0.0) { $0 + $1.value }
            if total == 0 { return Reading(value: 0, suffix: "%", note: "Parts that add to zero make no ratio") }
            return ok((part.value / total) * 100, "%")
        }

        if skin == "growth" {
            let start = roleInput(inputs, state, "startKey", 0).value
            let rate = roleInput(inputs, state, "rateKey", 1).value
            return ok(start * JavaScript.pow(1 + rate / 100, Double(growthPeriods(state))))
        }

        if skin == "expression" {
            let source = expressionText(state)
            if JavaScript.trim(source).isEmpty { return Reading(value: 0, suffix: "", note: "Write an expression using your inputs") }
            do {
                return ok(try CalculatorSkinModel.evaluateExpression(source, variables: bindings(inputs)))
            } catch {
                return Reading(value: 0, suffix: "", note: expressionProblem(error))
            }
        }

        if skin == "weighted_score" {
            let rows = weightedRows(data)
            let weight = rows.reduce(0.0) { $0 + $1.weight }
            if weight == 0 { return Reading(value: 0, suffix: "", note: "Give at least one row some weight") }
            let total = rows.reduce(0.0) { $0 + $1.value * $1.weight }
            return ok(total / weight)
        }

        if skin == "conditional" {
            let left = roleInput(inputs, state, "leftKey", 0).value
            let right = roleInput(inputs, state, "rightKey", 1).value
            let branches = conditionalBranches(state, bindings(inputs))
            let holds = comparisonHolds(left, right, comparator(state))
            let chosen = holds ? branches.whenTrue : branches.whenFalse
            let problem = holds ? branches.trueNote : branches.falseNote
            return problem.map { Reading(value: chosen, suffix: "", note: $0) } ?? ok(chosen)
        }

        // two_input: the operation carried down the whole rack, left to right.
        let op = formulaOperator(data["operator"])
        if (op == "divide" || op == "modulo"), inputs.dropFirst().contains(where: { $0.value == 0 }) {
            return Reading(
                value: 0, suffix: "",
                note: inputs.count > 2 ? "One of the inputs is zero, so this cannot be divided" : "B is zero, so this cannot be divided"
            )
        }
        return ok(inputs.dropFirst().reduce(inputs.first?.value ?? 0) { twoInputValue($0, $1.value, op) })
    }

    /// The published number on its own — what the `result` field and tile read.
    public static func value(_ data: JSONObject) -> Double {
        reading(data).value
    }

    /// True when the inputs can actually answer the question being asked.
    public static func isValid(_ data: JSONObject) -> Bool {
        reading(data).note == nil
    }

    /// The answer as it is printed, unit included.
    public static func answerText(_ data: JSONObject) -> String {
        let reading = reading(data)
        let number = precision(data).map { JavaScript.toFixed(reading.value, fractionDigits: $0) }
            ?? CalculatorSkinModel.formatResult(reading.value)
        if reading.suffix.isEmpty { return number }
        return reading.suffix == "%" ? "\(number)%" : "\(number) \(reading.suffix)"
    }

    static func skinState(_ data: JSONObject, _ skin: String) -> JSONObject {
        skinStateRecord(data, skin)
    }

    /// `Math.max(lo, Math.min(hi, value))` for a whole number, clamped before
    /// the `Int` conversion so a stored 1e300 cannot trap.
    static func clampedInt(_ value: Double, _ lo: Int, _ hi: Int) -> Int {
        Int(Swift.max(Double(lo), Swift.min(Double(hi), value)))
    }

    // MARK: - Percent / ratio

    /// Two operands as the smallest whole-number ratio, when there is one.
    public static func simplifiedRatio(_ a: Double, _ b: Double) -> (left: Double, right: Double)? {
        let scale = 100.0
        let left = jsRound((a.isFinite ? a : 0) * scale)
        let right = jsRound((b.isFinite ? b : 0) * scale)
        if left == 0, right == 0 { return nil }
        if left < 0 || right < 0 { return nil }
        let divisor = greatestCommonDivisor(abs(left), abs(right))
        if divisor == 0 { return nil }
        let simplified = (left: left / divisor, right: right / divisor)
        if simplified.left > 9999 || simplified.right > 9999 { return nil }
        return simplified
    }

    static func greatestCommonDivisor(_ first: Double, _ second: Double) -> Double {
        var x = first
        var y = second
        while y != 0 {
            let remainder = jsRemainder(x, y)
            x = y
            y = remainder
        }
        return x
    }

    /// Each slot's share of the whole, for the ratio bar.
    public static func inputShares(_ inputs: [Input]) -> [Double] {
        let total = inputs.reduce(0.0) { $0 + Swift.max(0, $1.value) }
        return inputs.map { total == 0 ? 1 / Double(inputs.count) : Swift.max(0, $0.value) / total }
    }

    // MARK: - Growth

    public static let growthPeriodsDefault = 6
    public static let growthPeriodLimit = 24

    /// How many periods the published answer covers. One, unless the card says.
    public static func growthPeriods(_ state: JSONObject) -> Int {
        guard let raw = state.number("periods"), raw.isFinite else { return 1 }
        return clampedInt(JavaScript.trunc(raw), 1, growthPeriodLimit)
    }

    /// Where the same rate takes the starting value, period by period.
    public static func growthProjection(_ start: Double, _ ratePercent: Double, periods: Int = growthPeriodsDefault) -> [Double] {
        let factor = 1 + (ratePercent.isFinite ? ratePercent : 0) / 100
        var steps: [Double] = []
        var value = start.isFinite ? start : 0
        for _ in 0..<Swift.max(0, Swift.min(growthPeriodLimit, periods)) {
            value *= factor
            steps.append(value)
        }
        return steps
    }

    // MARK: - Expression

    public static let expressionLimit = CalculatorSkinModel.expressionLimit

    public static func expressionText(_ state: JSONObject) -> String {
        guard let raw = state.string("expression") else { return "" }
        return JavaScript.prefix(raw, utf16Count: expressionLimit)
    }

    /// The evaluator's own words, first letter raised.
    static func expressionProblem(_ error: Error) -> String {
        let message = (error as? ExpressionError)?.message ?? ""
        guard let first = message.first else { return "That expression cannot be read" }
        return String(first).uppercased() + message.dropFirst()
    }

    // MARK: - Weighted score

    public struct WeightedRow: Equatable {
        public let id: String
        public let label: String
        public let value: Double
        public let weight: Double
        /// True for the rows backed by a real input slot — the ones a wire writes.
        public let canonical: Bool
        /// The slot behind a canonical row, so the renderer can write it back.
        public let key: String?
    }

    public static let weightedExtraLimit = 4

    static func weightOf(_ raw: JSONValue?, fallback: Double = 1) -> Double {
        guard let number = raw?.numberValue, number.isFinite else { return fallback }
        return Swift.max(0, Swift.min(999, number))
    }

    static func labelOf(_ raw: JSONValue?, _ fallback: String) -> String {
        guard let string = raw?.stringValue, !JavaScript.trim(string).isEmpty else { return fallback }
        return JavaScript.prefix(string, utf16Count: 40)
    }

    /// One slot's weight. Boards written when only A and B could be scored
    /// kept their weights under `weightA`/`weightB`, and those still count.
    public static func inputWeight(_ state: JSONObject, _ key: String) -> Double {
        if let weights = state.object("weights"), let stored = weights[key], stored.numberValue != nil {
            return weightOf(stored)
        }
        if key == "a" { return weightOf(state["weightA"]) }
        if key == "b" { return weightOf(state["weightB"]) }
        return weightOf(nil)
    }

    /// Every scored row: the card's own slots, then the skin's extra rows.
    public static func weightedRows(_ data: JSONObject) -> [WeightedRow] {
        let state = skinState(data, "weighted_score")
        var rows: [WeightedRow] = inputs(data).map { input in
            let legacy: JSONValue? = input.key == "a" ? state["labelA"] : input.key == "b" ? state["labelB"] : nil
            let trimmed = JavaScript.trim(input.name)
            return WeightedRow(
                id: input.key,
                label: trimmed.isEmpty ? labelOf(legacy, input.letter) : trimmed,
                value: input.value, weight: inputWeight(state, input.key), canonical: true, key: input.key
            )
        }
        let extra = state.array("rows") ?? []
        for (index, entry) in extra.prefix(weightedExtraLimit).enumerated() {
            let row = entry.objectValue ?? JSONObject()
            let id = row.string("id")
            rows.append(WeightedRow(
                id: (id?.isEmpty == false) ? id! : "row-\(index)",
                label: labelOf(row["label"], "Row \(rows.count + 1)"),
                value: JavaScript.finite(row["value"]), weight: weightOf(row["weight"]), canonical: false, key: nil
            ))
        }
        return rows
    }

    /// Each row's share of the total weight, for the contribution bars.
    public static func weightShares(_ rows: [WeightedRow]) -> [Double] {
        let total = rows.reduce(0.0) { $0 + $1.weight }
        return rows.map { total == 0 ? 0 : $0.weight / total }
    }

    // MARK: - Conditional

    public static let comparatorSymbol: [String: String] = ["gt": ">", "gte": "≥", "lt": "<", "lte": "≤", "eq": "=", "neq": "≠"]
    public static let comparators: [String] = ["gt", "gte", "lt", "lte", "eq", "neq"]

    /// `comparatorOf`: `raw in COMPARATOR_SYMBOL` (inherited names included, as
    /// for `formulaOperator`; they fall through `comparisonHolds` to `!==`).
    public static func comparator(_ state: JSONObject) -> String {
        guard let raw = state.string("comparator"), comparatorSymbol[raw] != nil || JavaScript.objectPrototypeKeys.contains(raw) else { return "gt" }
        return raw
    }

    public static func comparisonHolds(_ a: Double, _ b: Double, _ comparator: String) -> Bool {
        switch comparator {
        case "gt": return a > b
        case "gte": return a >= b
        case "lt": return a < b
        case "lte": return a <= b
        case "eq": return a == b
        default: return a != b
        }
    }

    public struct Branches: Equatable {
        public let whenTrue: Double
        public let whenFalse: Double
        /// Set when that branch was written as an expression that cannot be read.
        public let trueNote: String?
        public let falseNote: String?
    }

    /// What a branch holds as the card stores it — a number, or an expression.
    public static func branchText(_ state: JSONObject, _ side: String) -> String {
        if let raw = state.string(side) { return JavaScript.prefix(raw, utf16Count: expressionLimit) }
        if let raw = state.number(side), raw.isFinite { return JavaScript.numberString(raw) }
        return side == "whenTrue" ? "1" : "0"
    }

    /// Either outcome may be a plain number or an expression over the card's own inputs.
    public static func conditionalBranches(_ state: JSONObject, _ bindings: [String: Double] = [:]) -> Branches {
        func read(_ side: String) -> (Double, String?) {
            let fallback: Double = side == "whenTrue" ? 1 : 0
            if let raw = state.number(side), raw.isFinite { return (raw, nil) }
            guard let raw = state.string(side) else { return (fallback, nil) }
            if JavaScript.trim(raw).isEmpty { return (0, nil) }
            do {
                return (try CalculatorSkinModel.evaluateExpression(JavaScript.prefix(raw, utf16Count: expressionLimit), variables: bindings), nil)
            } catch {
                return (fallback, expressionProblem(error))
            }
        }
        let (whenTrue, trueNote) = read("whenTrue")
        let (whenFalse, falseNote) = read("whenFalse")
        return Branches(whenTrue: whenTrue, whenFalse: whenFalse, trueNote: trueNote, falseNote: falseNote)
    }
}

public extension JavaScript {
    /// The own property names of `Object.prototype` — what `key in {}` finds
    /// beyond an object's own keys.
    static let objectPrototypeKeys: Set<String> = [
        "constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__",
        "__lookupSetter__", "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString",
    ]
}
