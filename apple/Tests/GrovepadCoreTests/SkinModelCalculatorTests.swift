import XCTest
@testable import GrovepadCore

/// `CalculatorSkinModel` against the web's own `calculatorSkinModel.test.ts`
/// (the shared evaluator, result formatting and named variables).
final class SkinModelCalculatorTests: XCTestCase {
    private func eval(_ input: String, _ variables: [String: Double] = [:], angle: CalculatorSkinModel.AngleUnit = .rad) throws -> Double {
        try CalculatorSkinModel.evaluateExpression(input, variables: variables, angle: angle)
    }

    private func assertThrows(_ input: String, _ variables: [String: Double] = [:], file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try eval(input, variables), input, file: file, line: line)
    }

    func testDoesTheArithmeticAPocketCalculatorDoes() throws {
        XCTAssertEqual(try eval("1+2*3"), 7)
        XCTAssertEqual(try eval("(1+2)*3"), 9)
        XCTAssertEqual(try eval("10/4"), 2.5)
        XCTAssertEqual(try eval("-3 + 5"), 2)
        XCTAssertEqual(try eval(""), 0)
        XCTAssertEqual(try eval("   "), 0)
        XCTAssertEqual(try eval("1."), 1)
        XCTAssertEqual(try eval(".5+.5"), 1)
    }

    func testReadsPowersRightToLeft() throws {
        XCTAssertEqual(try eval("2^3"), 8)
        XCTAssertEqual(try eval("2^3^2"), 512)
        XCTAssertEqual(try eval("-2^2"), 4)
    }

    func testKnowsItsFunctionsConstantsAndAngleUnit() throws {
        XCTAssertEqual(try eval("sqrt(16)"), 4)
        XCTAssertEqual(try eval("log(1000)"), 3, accuracy: 1e-12)
        XCTAssertEqual(try eval("ln(e)"), 1, accuracy: 1e-12)
        XCTAssertEqual(try eval("sin(pi/2)"), 1, accuracy: 1e-12)
        XCTAssertEqual(try eval("sin(90)", angle: .deg), 1, accuracy: 1e-12)
        XCTAssertEqual(try eval("asin(1)", angle: .deg), 90, accuracy: 1e-9)
        XCTAssertEqual(try eval("17mod5"), 2)
        XCTAssertEqual(try eval("17 % 5"), 2)
        XCTAssertEqual(try eval("-7 mod 3"), -1)
    }

    func testTakesTheFunctionsARealFormulaNeeds() throws {
        XCTAssertEqual(try eval("min(4, 9, 2)"), 2)
        XCTAssertEqual(try eval("max(4, 9, 2)"), 9)
        XCTAssertEqual(try eval("sum(1, 2, 3)"), 6)
        XCTAssertEqual(try eval("avg(2, 4)"), 3)
        XCTAssertEqual(try eval("pow(2, 10)"), 1024)
        XCTAssertEqual(try eval("clamp(12, 0, 10)"), 10)
        XCTAssertEqual(try eval("clamp(-3, 10, 0)"), 0)
        XCTAssertEqual(try eval("round(2.345, 2)"), 2.35)
        XCTAssertEqual(try eval("log(8, 2)"), 3, accuracy: 1e-12)
        XCTAssertEqual(try eval("round(2.6)"), 3)
        XCTAssertEqual(try eval("round(-2.5)"), -2) // Math.round rounds halves up
        assertThrows("pow(2)")
        assertThrows("sqrt(4, 9)")
        assertThrows("sum(1,2,3,4,5,6,7,8,9)")
        assertThrows("min()")
    }

    func testAnswersAComparisonWithOneOrZero() throws {
        XCTAssertEqual(try eval("3 > 2"), 1)
        XCTAssertEqual(try eval("3 < 2"), 0)
        XCTAssertEqual(try eval("2 >= 2"), 1)
        XCTAssertEqual(try eval("2 <= 1"), 0)
        XCTAssertEqual(try eval("2 = 2"), 1)
        XCTAssertEqual(try eval("2 == 2"), 1)
        XCTAssertEqual(try eval("2 != 2"), 0)
        XCTAssertEqual(try eval("(3 > 2) && (1 > 2)"), 0)
        XCTAssertEqual(try eval("(3 > 2) || (1 > 2)"), 1)
        XCTAssertEqual(try eval("!0"), 1)
        XCTAssertEqual(try eval("!5"), 0)
        XCTAssertEqual(try eval("10 * (2 > 1)"), 10)
    }

    func testChoosesAnIfBranchWithoutEvaluatingTheOther() throws {
        XCTAssertEqual(try eval("if(1, 10, 20)"), 10)
        XCTAssertEqual(try eval("if(0, 10, 20)"), 20)
        XCTAssertEqual(try eval("if(b = 0, 0, a / b)", ["a": 9, "b": 0]), 0)
        XCTAssertEqual(try eval("if(b = 0, 0, a / b)", ["a": 9, "b": 3]), 3)
        XCTAssertEqual(try eval("if(a > b, if(a > 100, 2, 1), 0)", ["a": 150, "b": 1]), 2)
        // An empty branch is an empty expression, which is 0 on the web too.
        XCTAssertEqual(try eval("if(1,,2)"), 0)
        assertThrows("if(1, 2)")
        assertThrows("if 1")
        assertThrows("if(1, (2, 3)")
    }

    func testResolvesNamedVariablesAndRefusesUnknownNames() throws {
        XCTAssertEqual(try eval("rate*hours", ["rate": 12, "hours": 3]), 36)
        XCTAssertEqual(try eval("Rate * HOURS", ["rate": 12, "hours": 3]), 36)
        assertThrows("rate*2")
        XCTAssertThrowsError(try eval("zebra + 1")) { error in
            XCTAssertEqual((error as? ExpressionError)?.message, "Unknown name zebra")
        }
    }

    /// `'constructor' in {}` is true on the web and yields `Object`, which is
    /// NaN in arithmetic and truthy in a condition; the port answers the same.
    func testTheInheritedNameBehavesAsTheWebsObjectFunction() throws {
        assertThrows("constructor")
        assertThrows("constructor + 1")
        XCTAssertEqual(try eval("if(constructor, 1, 2)"), 1)
        XCTAssertEqual(try eval("constructor > 1"), 0)
        XCTAssertEqual(try eval("!constructor"), 0)
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName("constructor"))
    }

    func testRefusesInputThatIsNotArithmetic() {
        for hostile in ["alert(1)", "1;2", "globalThis", "1+", "(1", "1..2", "5/0", "1 & 2", "1e5", "😀", "1 | 2", "5 mod 0", "abc def"] {
            assertThrows(hostile)
        }
        assertThrows(String(repeating: "1+", count: CalculatorSkinModel.expressionLimit) + "1")
        assertThrows(String(repeating: "(", count: 64) + "1" + String(repeating: ")", count: 64))
        XCTAssertThrowsError(try eval(String(repeating: "(", count: 40) + "1" + String(repeating: ")", count: 40))) { error in
            XCTAssertEqual((error as? ExpressionError)?.message, "Too deeply nested")
        }
        XCTAssertThrowsError(try eval("1/0")) { error in
            XCTAssertEqual((error as? ExpressionError)?.message, "Div by 0")
        }
        XCTAssertThrowsError(try eval("1e308 * 10")) { error in
            // `1e308` is the number 1 followed by the name `e308`.
            XCTAssertEqual((error as? ExpressionError)?.message, "Unexpected token")
        }
        XCTAssertThrowsError(try eval("pow(10, 400)")) { error in
            XCTAssertEqual((error as? ExpressionError)?.message, "Not a number")
        }
    }

    func testFormatsAResultAPersonCanReadAndSaysErrorOnce() {
        XCTAssertEqual(CalculatorSkinModel.formatResult(2.5), "2.5")
        XCTAssertEqual(CalculatorSkinModel.formatResult(1.0 / 3), "0.3333333333")
        XCTAssertEqual(CalculatorSkinModel.formatResult(-0.0), "0")
        XCTAssertEqual(CalculatorSkinModel.formatResult(-1e-12), "0")
        XCTAssertEqual(CalculatorSkinModel.formatResult(1e15), "1.000000e+15")
        XCTAssertEqual(CalculatorSkinModel.formatResult(3e21), "3.000000e+21")
        XCTAssertEqual(CalculatorSkinModel.formatResult(1e-12), "0") // rounded to ten places first
        XCTAssertEqual(CalculatorSkinModel.formatResult(5e-10), "5.000000e-10")
        XCTAssertEqual(CalculatorSkinModel.formatResult(123456789012.345), "123456789012.345")
        XCTAssertEqual(CalculatorSkinModel.formatResult(1234567890123.456), "1.234568e+12")
        XCTAssertEqual(CalculatorSkinModel.formatResult(9.9999995e18), "1.000000e+19")
        XCTAssertEqual(CalculatorSkinModel.formatResult(.nan), "Error")
        XCTAssertEqual(CalculatorSkinModel.formatResult(.infinity), "Error")
        XCTAssertEqual(CalculatorSkinModel.formatResult(1e300), "Infinity") // `value * 1e10` overflows before the check
        XCTAssertEqual(CalculatorSkinModel.safeResult { try self.eval("1/0") }, "Error")
        XCTAssertEqual(CalculatorSkinModel.safeResult { try self.eval("2+2") }, "4")
    }

    func testToExponentialAndToFixedFollowTheSpec() {
        XCTAssertEqual(JavaScript.toExponential(1, fractionDigits: 6), "1.000000e+0")
        XCTAssertEqual(JavaScript.toExponential(123456, fractionDigits: 2), "1.23e+5")
        XCTAssertEqual(JavaScript.toExponential(0.000123456, fractionDigits: 2), "1.23e-4")
        XCTAssertEqual(JavaScript.toExponential(-9.9999995e15, fractionDigits: 6), "-1.000000e+16")
        XCTAssertEqual(JavaScript.toExponential(0, fractionDigits: 6), "0.000000e+0")
        XCTAssertEqual(JavaScript.toExponential(1.0000005e15, fractionDigits: 6), "1.000001e+15") // exact tie rounds up
        XCTAssertEqual(JavaScript.toFixed(0.333333, fractionDigits: 2), "0.33")
        XCTAssertEqual(JavaScript.toFixed(2.5, fractionDigits: 0), "3")
        XCTAssertEqual(JavaScript.toFixed(1.005, fractionDigits: 2), "1.00") // 1.005 is below the tie in binary
        XCTAssertEqual(JavaScript.toFixed(-0.001, fractionDigits: 2), "-0.00")
        XCTAssertEqual(JavaScript.toFixed(-0.0, fractionDigits: 2), "0.00")
        XCTAssertEqual(JavaScript.toFixed(9.995, fractionDigits: 2), "9.99")
        XCTAssertEqual(JavaScript.toFixed(99.5, fractionDigits: 0), "100")
        XCTAssertEqual(JavaScript.toFixed(1e21, fractionDigits: 2), "1e+21")
    }

    func testKeepsOnlyNamesTheParserCanResolve() {
        XCTAssertTrue(CalculatorSkinModel.isUsableVariableName("rate"))
        XCTAssertTrue(CalculatorSkinModel.isUsableVariableName("hours_2"))
        XCTAssertTrue(CalculatorSkinModel.isUsableVariableName("  Rate "))
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName("2rate"))
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName(""))
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName("sin"))
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName("pi"))
        XCTAssertFalse(CalculatorSkinModel.isUsableVariableName("abcdefghijklmnopq"))
        for reserved in ["sum", "min", "max", "avg", "pow", "clamp", "if"] {
            XCTAssertFalse(CalculatorSkinModel.isUsableVariableName(reserved), reserved)
        }
        XCTAssertEqual(CalculatorSkinModel.expressionFunctionNames, [
            "abs", "acos", "asin", "atan", "avg", "ceil", "clamp", "cos", "exp", "floor", "if", "ln", "log",
            "max", "min", "pow", "round", "sin", "sqrt", "sum", "tan",
        ])
    }

    func testBoundsTheSlotsAndDropsBrokenRecords() {
        let flood: JSONValue = .array((0..<20).map { n in .object(["id": .string("v\(n)"), "name": .string("a\(n)"), "value": .number(Double(n))]) })
        XCTAssertEqual(CalculatorSkinModel.namedVariables(flood).count, CalculatorSkinModel.variableLimit)
        XCTAssertEqual(CalculatorSkinModel.namedVariables(.array([.object(["name": "rate", "value": 1])])), [])
        XCTAssertEqual(CalculatorSkinModel.namedVariables(.array([.object(["id": "", "name": "rate", "value": 1])])), [])
        XCTAssertEqual(CalculatorSkinModel.namedVariables(.array([.object(["id": "v", "name": "rate", "value": "nope"])]))[0].value, 0)
        XCTAssertEqual(CalculatorSkinModel.namedVariables(.array([.object(["id": "v", "value": 2]), .array([1]), .null, "x"])), [
            CalculatorSkinModel.NamedVariable(id: "v", name: "", value: 2),
        ])
        XCTAssertEqual(CalculatorSkinModel.namedVariables(.array([.object(["id": "v", "name": .string(String(repeating: "n", count: 30)), "value": 1])]))[0].name.count, 16)
        XCTAssertEqual(CalculatorSkinModel.namedVariables("nope"), [])
    }

    func testBindsUsableNamesOnlyThenFeedsTheEvaluator() throws {
        let bindings = CalculatorSkinModel.variableBindings([
            .init(id: "a", name: "Rate", value: 12),
            .init(id: "b", name: "", value: 5),
            .init(id: "c", name: "pi", value: 3),
        ])
        XCTAssertEqual(bindings, ["rate": 12])
        XCTAssertEqual(try eval("rate*2", bindings), 24)
        XCTAssertEqual(try eval("pi", bindings), Double.pi, accuracy: 1e-15)
    }

    func testFallsBackToTheBasicKeypadForAnUnknownSkin() {
        XCTAssertEqual(CalculatorSkinModel.skinMode("finance"), "finance")
        XCTAssertEqual(CalculatorSkinModel.skinMode("not_a_skin"), "basic")
        XCTAssertEqual(CalculatorSkinModel.skinMode(nil), "basic")
        XCTAssertEqual(CalculatorSkinModel.angleUnit("deg"), .deg)
        XCTAssertEqual(CalculatorSkinModel.angleUnit("grad"), .rad)
    }

    func testJavaScriptMinMaxAndPow() {
        XCTAssertTrue(JavaScript.min(.nan, 1).isNaN)
        XCTAssertTrue(JavaScript.min(1, .nan).isNaN)
        XCTAssertEqual(JavaScript.min(0.0, -0.0).sign, .minus)
        XCTAssertEqual(JavaScript.max(-0.0, 0.0).sign, .plus)
        XCTAssertEqual(JavaScript.min([]), .infinity)
        XCTAssertEqual(JavaScript.max([]), -.infinity)
        XCTAssertTrue(JavaScript.pow(1, .nan).isNaN)
        XCTAssertTrue(JavaScript.pow(1, .infinity).isNaN)
        XCTAssertTrue(JavaScript.pow(-1, -.infinity).isNaN)
        XCTAssertEqual(JavaScript.pow(.nan, 0), 1)
        XCTAssertEqual(JavaScript.pow(2, 10), 1024)
    }
}
