import Foundation

// ---------------------------------------------------------------------------
// Calculator skin model (`components/widgets/modules/calculatorSkinModel.ts`):
// the shared expression evaluator, result formatting and the Named Variables
// skin — everything the `calculator` field table and the Formula card's
// Expression / Conditional skins evaluate through.
//
// `CalculatorData.result` is the one canonical output and `expression` the
// readable record of how it was reached. Nothing here uses eval: an
// expression from a shared board is untrusted input, parsed by hand and
// bounded on length and depth exactly as the web bounds it.
//
// Ported here: `evaluateExpression`, `formatResult`, `safeResult`,
// `namedVariables`, `isUsableVariableName`, `variableBindings` and the skin
// list. The tape, finance, programmer and date-math skins are renderer
// working (phase 8) and are not ported.
// ---------------------------------------------------------------------------

/// The evaluator's own words for what went wrong (`new Error(message)`).
public struct ExpressionError: Error, Equatable {
    public let message: String

    public init(_ message: String) {
        self.message = message
    }
}

public enum CalculatorSkinModel {
    public static let skins: [String] = ["basic", "scientific", "tape", "finance", "programmer", "date_math", "named_variables"]

    /// `calculatorSkinMode`: the worn skin, `basic` for anything unknown.
    public static func skinMode(_ raw: JSONValue?) -> String {
        guard let value = raw?.stringValue, skins.contains(value) else { return "basic" }
        return value
    }

    /// An expression longer than this is a paste accident or an attack, not sums.
    public static let expressionLimit = 240
    static let depthLimit = 32
    static let argumentLimit = 8
    /// Three slots, because three writable circuit fields is what the ports expose.
    public static let variableLimit = 3

    public enum AngleUnit: String {
        case rad
        case deg
    }

    public static func angleUnit(_ raw: JSONValue?) -> AngleUnit {
        raw?.stringValue == "deg" ? .deg : .rad
    }

    static let constants: [String: Double] = ["pi": Double.pi, "e": M_E]

    static let functions: [String: (Double) -> Double] = [
        "sqrt": { $0.squareRoot() },
        "abs": { abs($0) },
        "ln": { Foundation.log($0) },
        "log": { Foundation.log10($0) },
        "exp": { Foundation.exp($0) },
        "round": { jsRound($0) },
        "floor": { $0.rounded(.down) },
        "ceil": { $0.rounded(.up) },
        "sin": { Foundation.sin($0) },
        "cos": { Foundation.cos($0) },
        "tan": { Foundation.tan($0) },
        "asin": { Foundation.asin($0) },
        "acos": { Foundation.acos($0) },
        "atan": { Foundation.atan($0) },
    ]

    static let trigIn: Set<String> = ["sin", "cos", "tan"]
    static let trigOut: Set<String> = ["asin", "acos", "atan"]

    struct MultiFunction {
        let min: Int
        let max: Int
        let apply: ([Double]) -> Double
    }

    static let multiFunctions: [String: MultiFunction] = [
        "min": MultiFunction(min: 1, max: argumentLimit) { JavaScript.min($0) },
        "max": MultiFunction(min: 1, max: argumentLimit) { JavaScript.max($0) },
        "sum": MultiFunction(min: 1, max: argumentLimit) { $0.reduce(0, +) },
        "avg": MultiFunction(min: 1, max: argumentLimit) { $0.reduce(0, +) / Double($0.count) },
        "pow": MultiFunction(min: 2, max: 2) { JavaScript.pow($0[0], $0[1]) },
        "clamp": MultiFunction(min: 3, max: 3) { args in
            JavaScript.min(JavaScript.max(args[0], JavaScript.min(args[1], args[2])), JavaScript.max(args[1], args[2]))
        },
        "round": MultiFunction(min: 1, max: 2) { args in
            let digits = args.count > 1 ? args[1] : 0
            let scale = JavaScript.pow(10, JavaScript.max(0, JavaScript.min(10, JavaScript.trunc(digits))))
            return jsRound(args[0] * scale) / scale
        },
        "log": MultiFunction(min: 1, max: 2) { args in
            args.count > 1 ? Foundation.log(args[0]) / Foundation.log(args[1]) : Foundation.log10(args[0])
        },
    ]

    /// Every name a written expression may call, for the help a card prints.
    public static let expressionFunctionNames: [String] = {
        var names = Array(functions.keys)
        names += multiFunctions.keys.filter { functions[$0] == nil }
        names.append("if")
        return names.sorted()
    }()

    /// The one JavaScript name a plain `{}` inherits that the lowercase
    /// tokenizer can produce: `'constructor' in variables` is true on the web
    /// and yields `Object`, which behaves as NaN in every arithmetic and
    /// comparison the evaluator performs and as "not zero" in a condition.
    static let inheritedName = "constructor"

    /// `evaluateExpression`: recursive descent over `+ - * / ^ mod %`,
    /// comparisons, `&&`/`||`, parentheses, unary signs and `!`, named
    /// constants, named variables, the fixed function table and a three-part
    /// `if` that evaluates only its chosen branch. `^` is exponentiation.
    public static func evaluateExpression(_ input: String, variables: [String: Double] = [:], angle: AngleUnit = .rad) throws -> Double {
        if input.utf16.count > expressionLimit { throw ExpressionError("Expression too long") }
        var stripped = String.UnicodeScalarView()
        for scalar in input.unicodeScalars where !JavaScript.isWhitespace(scalar) { stripped.append(scalar) }
        var parser = Parser(src: Array(String(stripped).lowercased().utf16), variables: variables, angle: angle)
        return try parser.run()
    }

    private struct Parser {
        let src: [UInt16]
        let variables: [String: Double]
        let angle: AngleUnit
        var i = 0
        var depth = 0

        init(src: [UInt16], variables: [String: Double], angle: AngleUnit) {
            self.src = src
            self.variables = variables
            self.angle = angle
        }

        func peek() -> UInt16? { i < src.count ? src[i] : nil }

        func peekIs(_ scalar: Unicode.Scalar) -> Bool { peek() == UInt16(scalar.value) }

        func startsWith(_ text: String) -> Bool {
            let units = Array(text.utf16)
            guard i + units.count <= src.count else { return false }
            return Array(src[i..<i + units.count]) == units
        }

        static func isDigit(_ unit: UInt16) -> Bool { unit >= 0x30 && unit <= 0x39 }
        static func isLower(_ unit: UInt16) -> Bool { unit >= 0x61 && unit <= 0x7A }
        static func isNameUnit(_ unit: UInt16) -> Bool { isLower(unit) || isDigit(unit) || unit == 0x5F }

        func text(_ range: Range<Int>) -> String { String(decoding: src[range], as: UTF16.self) }

        mutating func run() throws -> Double {
            if src.isEmpty { return 0 }
            let value = try parseTop()
            if i != src.count { throw ExpressionError("Unexpected token") }
            if !value.isFinite { throw ExpressionError("Not a number") }
            return value
        }

        mutating func parseNumber() throws -> Double {
            let start = i
            while let unit = peek(), Parser.isDigit(unit) || unit == 0x2E { i += 1 }
            let token = text(start..<i)
            let dots = token.filter { $0 == "." }.count
            if token.isEmpty || token == "." || dots > 1 { throw ExpressionError("Bad number") }
            // `Number("1.")` and `Number(".5")` are numbers; `Double(String)` declines the first.
            var literal = token
            if literal.hasSuffix(".") { literal += "0" }
            if literal.hasPrefix(".") { literal = "0" + literal }
            guard let value = Double(literal) else { throw ExpressionError("Bad number") }
            return value
        }

        /// The text of one argument, skipped without evaluating it.
        mutating func skipArgument() throws -> String {
            let start = i
            var nesting = 0
            while let unit = peek() {
                if unit == 0x28 { nesting += 1 }
                else if unit == 0x29 {
                    if nesting == 0 { break }
                    nesting -= 1
                } else if unit == 0x2C, nesting == 0 { break }
                i += 1
            }
            if nesting != 0 { throw ExpressionError("Expected )") }
            return text(start..<i)
        }

        mutating func parseArguments(_ name: String) throws -> [Double] {
            guard peekIs("(") else { throw ExpressionError("\(name) needs (") }
            i += 1
            var args: [Double] = [try parseTop()]
            while peekIs(",") {
                i += 1
                if args.count >= argumentLimit { throw ExpressionError("\(name) takes fewer values") }
                args.append(try parseTop())
            }
            guard peekIs(")") else { throw ExpressionError("Expected )") }
            i += 1
            return args
        }

        mutating func parseName() throws -> Double {
            let start = i
            while let unit = peek(), Parser.isNameUnit(unit) { i += 1 }
            let name = text(start..<i)
            if name.isEmpty { throw ExpressionError("Unexpected token") }

            if name == "if" {
                guard peekIs("(") else { throw ExpressionError("if needs (") }
                i += 1
                let condition = try parseTop()
                guard peekIs(",") else { throw ExpressionError("if needs three parts") }
                i += 1
                let whenTrue = try skipArgument()
                guard peekIs(",") else { throw ExpressionError("if needs three parts") }
                i += 1
                let whenFalse = try skipArgument()
                guard peekIs(")") else { throw ExpressionError("Expected )") }
                i += 1
                return try evaluateExpression(condition != 0 ? whenTrue : whenFalse, variables: variables, angle: angle)
            }

            if let many = multiFunctions[name] {
                let args = try parseArguments(name)
                if args.count < many.min || args.count > many.max {
                    let arity = many.min == many.max ? String(many.min) : "\(many.min)-\(many.max)"
                    throw ExpressionError("\(name) takes \(arity) values")
                }
                return many.apply(args)
            }

            if let function = functions[name] {
                let args = try parseArguments(name)
                if args.count != 1 { throw ExpressionError("\(name) takes one value") }
                let argument = angle == .deg && trigIn.contains(name) ? (args[0] * Double.pi) / 180 : args[0]
                let value = function(argument)
                return angle == .deg && trigOut.contains(name) ? (value * 180) / Double.pi : value
            }

            if let value = variables[name] { return value }
            if name == inheritedName { return .nan }
            if let value = constants[name] { return value }
            throw ExpressionError("Unknown name \(name)")
        }

        mutating func parseFactor() throws -> Double {
            depth += 1
            defer { depth -= 1 }
            if depth > depthLimit { throw ExpressionError("Too deeply nested") }
            if peekIs("(") {
                i += 1
                let value = try parseTop()
                guard peekIs(")") else { throw ExpressionError("Expected )") }
                i += 1
                return value
            }
            if peekIs("-") {
                i += 1
                return -(try parseFactor())
            }
            if peekIs("+") {
                i += 1
                return try parseFactor()
            }
            // `!x` only ever starts a factor, so it can never be read as the `!=` that follows one.
            if peekIs("!") {
                i += 1
                return try parseFactor() == 0 ? 1 : 0
            }
            if let unit = peek(), Parser.isLower(unit) { return try parseName() }
            return try parseNumber()
        }

        /// Right-associative, so 2^3^2 is 512 the way a scientific calculator reads it.
        mutating func parsePower() throws -> Double {
            let base = try parseFactor()
            if peekIs("^") {
                i += 1
                return JavaScript.pow(base, try parsePower())
            }
            return base
        }

        mutating func parseTerm() throws -> Double {
            var value = try parsePower()
            while true {
                if peekIs("*") || peekIs("/") {
                    let multiply = peekIs("*")
                    i += 1
                    let rhs = try parsePower()
                    if multiply {
                        value *= rhs
                    } else {
                        if rhs == 0 { throw ExpressionError("Div by 0") }
                        value /= rhs
                    }
                    continue
                }
                // `%` is the remainder spelling most people reach for; `mod` is the one
                // this parser has always had. They are the same operation.
                if startsWith("mod") || peekIs("%") {
                    i += peekIs("%") ? 1 : 3
                    let rhs = try parsePower()
                    if rhs == 0 { throw ExpressionError("Mod by 0") }
                    value = jsRemainder(value, rhs)
                    continue
                }
                return value
            }
        }

        mutating func parseExpr() throws -> Double {
            var value = try parseTerm()
            while peekIs("+") || peekIs("-") {
                let add = peekIs("+")
                i += 1
                let rhs = try parseTerm()
                value = add ? value + rhs : value - rhs
            }
            return value
        }

        /// A comparison answers 1 or 0, so it reads as a number anywhere.
        mutating func parseCompare() throws -> Double {
            var value = try parseExpr()
            while true {
                var op: String? = nil
                var width = 2
                if startsWith("<=") || startsWith(">=") || startsWith("==") || startsWith("!=") {
                    op = text(i..<i + 2)
                } else if peekIs("<") || peekIs(">") {
                    op = text(i..<i + 1)
                    width = 1
                } else if peekIs("=") {
                    op = "=="
                    width = 1
                }
                guard let op else { return value }
                i += width
                let rhs = try parseExpr()
                let holds: Bool
                switch op {
                case "<": holds = value < rhs
                case ">": holds = value > rhs
                case "<=": holds = value <= rhs
                case ">=": holds = value >= rhs
                case "==": holds = value == rhs
                default: holds = value != rhs
                }
                value = holds ? 1 : 0
            }
        }

        mutating func parseAnd() throws -> Double {
            var value = try parseCompare()
            while startsWith("&&") {
                i += 2
                let rhs = try parseCompare()
                value = value != 0 && rhs != 0 ? 1 : 0
            }
            return value
        }

        mutating func parseTop() throws -> Double {
            var value = try parseAnd()
            while startsWith("||") {
                i += 2
                let rhs = try parseAnd()
                value = value != 0 || rhs != 0 ? 1 : 0
            }
            return value
        }
    }

    /// `formatResult`: the number a person can read, or `Error` once.
    public static func formatResult(_ value: Double) -> String {
        guard value.isFinite else { return "Error" }
        let rounded = jsRound(value * 1e10) / 1e10
        if rounded == 0 { return "0" } // `Object.is(rounded, -0)`, and +0 prints the same
        // A result too long to read as digits is more useful in scientific notation.
        if abs(rounded) >= 1e12 || abs(rounded) < 1e-9 {
            return JavaScript.toExponential(rounded, fractionDigits: 6)
        }
        return JavaScript.numberString(rounded)
    }

    /// The result string a skin should store, including the shared error word.
    public static func safeResult(_ compute: () throws -> Double) -> String {
        do {
            return formatResult(try compute())
        } catch {
            return "Error"
        }
    }

    // MARK: - Named variables

    public struct NamedVariable: Equatable {
        public var id: String
        public var name: String
        public var value: Double

        public init(id: String, name: String, value: Double) {
            self.id = id
            self.name = name
            self.value = value
        }

        /// `{ id, name, value }` in that key order.
        public var json: JSONValue {
            var object = JSONObject()
            object["id"] = .string(id)
            object["name"] = .string(name)
            object["value"] = .number(value)
            return .object(object)
        }
    }

    /// `namedVariables`: at most `variableLimit` well-formed records; a row
    /// without a string id is dropped, a non-finite value reads as 0.
    public static func namedVariables(_ raw: JSONValue?) -> [NamedVariable] {
        guard let items = raw?.arrayValue else { return [] }
        return items.prefix(variableLimit).compactMap { item in
            guard let record = item.objectValue else { return nil }
            guard let id = record.string("id"), !id.isEmpty else { return nil }
            let name = record.string("name").map { JavaScript.prefix($0, utf16Count: 16) } ?? ""
            return NamedVariable(id: id, name: name, value: JavaScript.finite(record["value"]))
        }
    }

    /// `isUsableVariableName`: `^[a-z][a-z0-9_]{0,15}$` after trim/lowercase,
    /// and never a function's or a constant's name (nor `constructor`, which
    /// the web's `in CONSTANTS` check finds on every object).
    public static func isUsableVariableName(_ name: String) -> Bool {
        let clean = JavaScript.trim(name).lowercased()
        let units = Array(clean.utf16)
        guard !units.isEmpty, units.count <= 16, Parser.isLower(units[0]) else { return false }
        guard units.allSatisfy(Parser.isNameUnit) else { return false }
        if expressionFunctionNames.contains(clean) { return false }
        if constants[clean] != nil || clean == inheritedName { return false }
        return true
    }

    /// `variableBindings`: usable names only, trimmed and lowercased.
    public static func variableBindings(_ variables: [NamedVariable]) -> [String: Double] {
        var bindings: [String: Double] = [:]
        for variable in variables {
            let name = JavaScript.trim(variable.name).lowercased()
            if isUsableVariableName(name) { bindings[name] = variable.value }
        }
        return bindings
    }
}
