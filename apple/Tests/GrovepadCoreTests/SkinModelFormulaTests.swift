import XCTest
@testable import GrovepadCore

/// `FormulaSkinModel` against the web's own `formulaSkinModel.test.ts`.
final class SkinModelFormulaTests: XCTestCase {
    private func card(_ patch: JSONObject = JSONObject()) -> JSONObject {
        var base: JSONObject = ["label": "Calculation", "a": 0, "b": 0, "operator": "add"]
        base.merge(patch)
        return base
    }

    private func value(_ data: JSONObject) -> Double { FormulaSkinModel.value(data) }
    private func reading(_ data: JSONObject) -> FormulaSkinModel.Reading { FormulaSkinModel.reading(data) }

    func testFallsBackToTheTwoInputCardForStaleOrUnknownSkins() {
        XCTAssertEqual(FormulaSkinModel.skinMode("ratio"), "ratio")
        XCTAssertEqual(FormulaSkinModel.skinMode("quantum"), "two_input")
        XCTAssertEqual(FormulaSkinModel.skinMode(nil), "two_input")
    }

    func testAnswersASkinlessCardExactlyAsTheOriginalTwoOperandCardDid() {
        for op in ["add", "subtract", "multiply", "divide", "modulo"] {
            XCTAssertEqual(value(card(["a": 7, "b": 4, "operator": .string(op)])), FormulaSkinModel.twoInputValue(7, 4, op), op)
        }
        XCTAssertEqual(value(card(["a": 7, "b": 4, "operator": "add"])), 11)
        XCTAssertEqual(value(card(["a": 7, "b": 4, "operator": "divide"])), 1.75)
        XCTAssertEqual(value(card(["a": 7, "b": 4, "operator": "power"])), 2401)
        XCTAssertEqual(value(card(["a": -7, "b": 4, "operator": "modulo"])), -3)
    }

    func testPublishesZeroForAZeroDivisorAndSaysWhy() {
        let reading = reading(card(["a": 7, "b": 0, "operator": "divide"]))
        XCTAssertEqual(reading.value, 0)
        XCTAssertEqual(reading.note, "B is zero, so this cannot be divided")
        XCTAssertEqual(self.reading(card(["a": 7, "b": 0, "operator": "modulo"])).value, 0)
    }

    /// `raw in OPERATOR_SYMBOL` finds inherited names on the web, which then
    /// fall through `twoInputValue` to the remainder branch.
    func testAnInheritedOperatorNameFallsThroughToTheRemainderBranch() {
        XCTAssertEqual(FormulaSkinModel.formulaOperator("constructor"), "constructor")
        XCTAssertEqual(FormulaSkinModel.formulaOperator("nope"), "add")
        XCTAssertEqual(value(card(["a": 7, "b": 4, "operator": "toString"])), 3)
        XCTAssertEqual(FormulaSkinModel.comparator(["comparator": "valueOf"]), "valueOf")
        XCTAssertTrue(FormulaSkinModel.comparisonHolds(3, 4, "valueOf"))
    }

    func testMeasuresPercentChangeFromAToBInBothDirections() {
        XCTAssertEqual(reading(card(["skin": "percent_change", "a": 200, "b": 250])), .init(value: 25, suffix: "%", note: nil))
        XCTAssertEqual(reading(card(["skin": "percent_change", "a": 200, "b": 150])).value, -25)
        XCTAssertEqual(reading(card(["skin": "percent_change", "a": -200, "b": -150])).value, 25)
        let impossible = reading(card(["skin": "percent_change", "a": 0, "b": 40]))
        XCTAssertEqual(impossible.value, 0)
        XCTAssertEqual(impossible.note, "A start of zero has no percent change")
    }

    func testReadsARatioAsAsShareOfTheWholeAndSimplifiesThePair() {
        let share = reading(card(["skin": "ratio", "a": 3, "b": 1]))
        XCTAssertEqual(share.value, 75)
        XCTAssertEqual(share.suffix, "%")
        XCTAssertEqual(reading(card(["skin": "ratio", "a": 0, "b": 0])).note, "Parts that add to zero make no ratio")
        XCTAssertTrue(FormulaSkinModel.simplifiedRatio(3, 4)! == (left: 3, right: 4))
        XCTAssertTrue(FormulaSkinModel.simplifiedRatio(50, 100)! == (left: 1, right: 2))
        XCTAssertTrue(FormulaSkinModel.simplifiedRatio(1.5, 4.5)! == (left: 1, right: 3))
        XCTAssertNil(FormulaSkinModel.simplifiedRatio(0, 0))
        XCTAssertNil(FormulaSkinModel.simplifiedRatio(-2, 4))
        XCTAssertNil(FormulaSkinModel.simplifiedRatio(1, 12345))
    }

    func testGrowsOnePeriodAtATimeAndProjectsWhereTheRateLeads() {
        XCTAssertEqual(reading(card(["skin": "growth", "a": 1000, "b": 10])).value, 1100, accuracy: 1e-8)
        XCTAssertEqual(reading(card(["skin": "growth", "a": 1000, "b": -10])).value, 900, accuracy: 1e-8)
        let projection = FormulaSkinModel.growthProjection(1000, 10, periods: 3)
        XCTAssertEqual(projection.count, 3)
        XCTAssertEqual(projection[0], 1100, accuracy: 1e-8)
        XCTAssertEqual(projection[2], 1331, accuracy: 1e-8)
        XCTAssertEqual(FormulaSkinModel.growthProjection(1000, 10, periods: 999).count, 24)
        XCTAssertEqual(reading(card(["skin": "growth", "a": 1000, "b": 10, "skinStates": ["growth": ["periods": 3]]])).value, 1331, accuracy: 1e-8)
        XCTAssertEqual(FormulaSkinModel.growthPeriods(["periods": 999]), 24)
        XCTAssertEqual(FormulaSkinModel.growthPeriods([:]), 1)
        XCTAssertEqual(FormulaSkinModel.growthPeriods(["periods": 1e300]), 24)
    }

    func testEvaluatesAWrittenExpressionOverAAndBAndSurvivesABadOne() {
        func with(_ expression: String, a: Double = 6, b: Double = 4) -> FormulaSkinModel.Reading {
            reading(card(["skin": "expression", "a": .number(a), "b": .number(b), "skinStates": ["expression": ["expression": .string(expression)]]]))
        }
        XCTAssertEqual(with("a * b").value, 24)
        XCTAssertEqual(with("(a + b) / 2").value, 5)
        XCTAssertEqual(with("sqrt(a * a)").value, 6)
        let empty = with("  ")
        XCTAssertEqual(empty.value, 0)
        XCTAssertEqual(empty.note, "Write an expression using your inputs")
        let broken = with("a * * b")
        XCTAssertEqual(broken.value, 0)
        XCTAssertEqual(broken.note, "Bad number")
        XCTAssertEqual(with("zebra + 1").note, "Unknown name zebra")
        XCTAssertEqual(with("a / b", a: 9, b: 0).note, "Div by 0")
    }

    func testBoundsTheStoredExpressionAndIgnoresDataThatIsNotText() {
        XCTAssertEqual(FormulaSkinModel.expressionText(["expression": "a+b"]), "a+b")
        XCTAssertEqual(FormulaSkinModel.expressionText(["expression": 42]), "")
        XCTAssertEqual(FormulaSkinModel.expressionText([:]), "")
        XCTAssertEqual(FormulaSkinModel.expressionText(["expression": .string(String(repeating: "a", count: 500))]).count, 240)
    }

    func testWeightsEveryWiredInputAlongsideTheSkinsOwnRows() {
        let state: JSONValue = [
            "labelA": "Cost", "weightA": 2, "labelB": "Speed", "weightB": 1,
            "rows": [["id": "r1", "label": "Support", "value": 10, "weight": 1]],
        ]
        let scored = card(["skin": "weighted_score", "a": 8, "b": 4, "skinStates": ["weighted_score": state]])
        let rows = FormulaSkinModel.weightedRows(scored)
        XCTAssertEqual(rows.map { [$0.label, JavaScript.numberString($0.value), JavaScript.numberString($0.weight), String($0.canonical)] }, [
            ["Cost", "8", "2", "true"], ["Speed", "4", "1", "true"], ["Support", "10", "1", "false"],
        ])
        XCTAssertEqual(value(scored), 7.5, accuracy: 1e-8)
        XCTAssertEqual(FormulaSkinModel.weightShares(rows), [0.5, 0.25, 0.25])
    }

    func testKeepsWeightedRowsSafeAgainstStoredRubbishAndCapsTheExtras() {
        let rows = FormulaSkinModel.weightedRows(card([
            "skin": "weighted_score", "a": 1, "b": 2,
            "skinStates": ["weighted_score": ["weightA": "heavy", "rows": ["nonsense", .null, [:], ["weight": -5], ["id": "x"], ["id": "y"]]]],
        ]))
        XCTAssertEqual(rows[0].weight, 1)
        XCTAssertEqual(rows.count, 6)
        XCTAssertEqual(rows[5].weight, 0)
        XCTAssertEqual(rows[2].id, "row-0")
        XCTAssertEqual(rows[2].label, "Row 3")
        XCTAssertEqual(rows[5].id, "row-3") // the fifth extra is beyond the cap
        XCTAssertTrue(rows.allSatisfy { $0.value.isFinite })
        let noWeight = reading(card(["skin": "weighted_score", "skinStates": ["weighted_score": ["weightA": 0, "weightB": 0]]]))
        XCTAssertEqual(noWeight.value, 0)
        XCTAssertEqual(noWeight.note, "Give at least one row some weight")
        XCTAssertEqual(FormulaSkinModel.inputWeight(["weights": ["a": 5000]], "a"), 999)
        XCTAssertEqual(FormulaSkinModel.inputWeight(["weights": ["a": "x"], "weightA": 3], "a"), 3)
        XCTAssertEqual(FormulaSkinModel.inputWeight([:], "c"), 1)
    }

    func testReturnsOneOfTwoValuesFromAComparison() {
        func conditional(_ a: Double, _ b: Double, _ state: JSONObject) -> Double {
            value(card(["skin": "conditional", "a": .number(a), "b": .number(b), "skinStates": ["conditional": .object(state)]]))
        }
        XCTAssertEqual(conditional(10, 4, ["comparator": "gt", "whenTrue": 100, "whenFalse": -1]), 100)
        XCTAssertEqual(conditional(2, 4, ["comparator": "gt", "whenTrue": 100, "whenFalse": -1]), -1)
        XCTAssertEqual(conditional(4, 4, ["comparator": "gte", "whenTrue": 1, "whenFalse": 0]), 1)
        XCTAssertEqual(conditional(5, 1, [:]), 1)
        XCTAssertEqual(conditional(1, 5, [:]), 0)
        XCTAssertEqual(FormulaSkinModel.comparator(["comparator": "sideways"]), "gt")
        XCTAssertTrue(FormulaSkinModel.comparisonHolds(3, 3, "eq"))
        XCTAssertTrue(FormulaSkinModel.comparisonHolds(3, 4, "neq"))
        XCTAssertEqual(FormulaSkinModel.conditionalBranches(["whenTrue": "yes"]), .init(whenTrue: 1, whenFalse: 0, trueNote: "Unknown name yes", falseNote: nil))
        XCTAssertEqual(FormulaSkinModel.conditionalBranches(["whenTrue": "", "whenFalse": 7]), .init(whenTrue: 0, whenFalse: 7, trueNote: nil, falseNote: nil))
    }

    func testGivesEverySkinItsOwnWordForTheNumberItPublishes() {
        XCTAssertEqual(FormulaSkinModel.resultWord("two_input"), "Result")
        XCTAssertEqual(FormulaSkinModel.resultWord("percent_change"), "Change")
        XCTAssertEqual(FormulaSkinModel.resultWord("growth"), "Projected")
        XCTAssertEqual(FormulaSkinModel.resultWord("conditional"), "Output")
    }

    func testHoldsTwoInputsUntilACardAsksForMoreAndNeverMoreThanSix() {
        XCTAssertEqual(FormulaSkinModel.inputs(card()).map(\.key), ["a", "b"])
        XCTAssertEqual(FormulaSkinModel.inputCount(card()), 2)
        XCTAssertEqual(FormulaSkinModel.inputCount(card(["inputCount": 99])), FormulaSkinModel.inputMax)
        XCTAssertEqual(FormulaSkinModel.inputCount(card(["inputCount": 0])), 2)
        XCTAssertEqual(FormulaSkinModel.inputCount(card(["inputCount": 1e300])), 6)
        XCTAssertEqual(FormulaSkinModel.inputCount(card(["inputCount": "4"])), 2)
        let four = FormulaSkinModel.dataWithInputCount(card(), 4)
        XCTAssertEqual(FormulaSkinModel.inputs(four).map(\.key), ["a", "b", "c", "d"])
        XCTAssertEqual(FormulaSkinModel.inputs(four).map(\.title), ["A", "B", "C", "D"])
    }

    func testForgetsTheSlotsItDropsSoANarrowedCardIsTheCardItWas() {
        var grown = FormulaSkinModel.dataWithInputCount(card(), 4)
        grown["c"] = 12
        grown["d"] = 7
        grown = FormulaSkinModel.dataWithInputName(grown, "c", "stock")
        XCTAssertEqual(grown.number("c"), 12)
        XCTAssertEqual(grown.object("names"), ["c": "stock"])
        let narrowed = FormulaSkinModel.dataWithInputCount(grown, 2)
        XCTAssertFalse(narrowed.contains("c"))
        XCTAssertFalse(narrowed.contains("d"))
        XCTAssertFalse(narrowed.contains("inputCount"))
        XCTAssertFalse(narrowed.contains("names"))
        XCTAssertEqual(JSONWriter.stringify(.object(narrowed)), JSONWriter.stringify(.object(card())))
    }

    func testOpensASlotWhenAWireWritesOneTheCardHadNotShownYet() {
        let written = FormulaSkinModel.dataWithInputValue(card(), "d", 9)
        XCTAssertEqual(written.number("d"), 9)
        XCTAssertEqual(FormulaSkinModel.inputs(written).map(\.key), ["a", "b", "c", "d"])
        XCTAssertEqual(JSONWriter.stringify(.object(written)), #"{"label":"Calculation","a":0,"b":0,"operator":"add","d":9,"inputCount":4}"#)
        XCTAssertFalse(FormulaSkinModel.dataWithInputValue(card(), "b", 3).contains("inputCount"))
        XCTAssertEqual(FormulaSkinModel.dataWithInputValue(card(), "c", .infinity).number("c"), 0)
    }

    func testLetsAnExpressionCallAnInputByItsNameAsWellAsItsLetter() {
        var named = FormulaSkinModel.dataWithInputCount(card(), 3)
        named["a"] = 4
        named["b"] = 5
        named["c"] = 6
        named = FormulaSkinModel.dataWithInputName(named, "a", "price")
        named = FormulaSkinModel.dataWithInputName(named, "c", "Tax Rate")
        let bindings = FormulaSkinModel.bindings(FormulaSkinModel.inputs(named))
        XCTAssertEqual(bindings["a"], 4)
        XCTAssertEqual(bindings["b"], 5)
        XCTAssertEqual(bindings["c"], 6)
        XCTAssertEqual(bindings["price"], 4)
        XCTAssertNil(bindings["Tax Rate"])
        XCTAssertNil(bindings["tax rate"])
        named["skin"] = "expression"
        named["skinStates"] = ["expression": ["expression": "price * b + c"]]
        XCTAssertEqual(value(named), 26)
    }

    func testRefusesANameThatWouldShadowAnotherInput() {
        var shadowed = FormulaSkinModel.dataWithInputCount(card(), 3)
        shadowed["a"] = 1
        shadowed["c"] = 3
        shadowed = FormulaSkinModel.dataWithInputName(shadowed, "c", "a")
        XCTAssertEqual(FormulaSkinModel.bindings(FormulaSkinModel.inputs(shadowed))["a"], 1)
        XCTAssertFalse(FormulaSkinModel.inputs(FormulaSkinModel.dataWithInputName(shadowed, "b", "if"))[1].callable)
        XCTAssertTrue(FormulaSkinModel.inputs(FormulaSkinModel.dataWithInputName(shadowed, "b", " B "))[1].callable)
    }

    func testCarriesTheChainDownEveryInputTheCardHolds() {
        var chain = FormulaSkinModel.dataWithInputCount(card(), 4)
        chain["a"] = 2
        chain["b"] = 3
        chain["c"] = 4
        chain["d"] = 5
        XCTAssertEqual(value(chain.assigning("operator", "add")), 14)
        XCTAssertEqual(value(chain.assigning("operator", "multiply")), 120)
        XCTAssertEqual(value(chain.assigning("operator", "power").assigning("b", 2).assigning("c", 2).assigning("d", 2)), 256)
        let divided = reading(chain.assigning("c", 0).assigning("operator", "divide"))
        XCTAssertEqual(divided.value, 0)
        XCTAssertEqual(divided.note, "One of the inputs is zero, so this cannot be divided")
    }

    func testLetsASkinAskItsQuestionOfAnyPairOfInputs() {
        var four = FormulaSkinModel.dataWithInputCount(card(), 4)
        four["a"] = 1
        four["b"] = 2
        four["c"] = 200
        four["d"] = 250
        four["skin"] = "percent_change"
        four["skinStates"] = ["percent_change": ["fromKey": "c", "toKey": "d"]]
        XCTAssertEqual(value(four), 25)
        XCTAssertEqual(value(card(["a": 200, "b": 250, "skin": "percent_change", "skinStates": ["percent_change": ["fromKey": "e"]]])), 25)
    }

    func testReadsOneInputsShareOfEveryPartNotJustOfTwo() {
        var parts = FormulaSkinModel.dataWithInputCount(card(), 4)
        for key in ["a", "b", "c", "d"] { parts[key] = 1 }
        parts["skin"] = "ratio"
        XCTAssertEqual(value(parts), 25)
        parts["d"] = 7
        parts["skinStates"] = ["ratio": ["partKey": "d"]]
        XCTAssertEqual(value(parts), 70)
        XCTAssertEqual(FormulaSkinModel.inputShares(FormulaSkinModel.inputs(parts)), [0.1, 0.1, 0.1, 0.7])
        XCTAssertEqual(FormulaSkinModel.inputShares(FormulaSkinModel.inputs(card())), [0.5, 0.5])
    }

    func testAnswersEitherBranchWithAnExpressionOverTheCardsInputs() {
        var priced = FormulaSkinModel.dataWithInputCount(card(), 3)
        priced["a"] = 10
        priced["b"] = 4
        priced["c"] = 100
        priced["skin"] = "conditional"
        priced["skinStates"] = ["conditional": ["comparator": "gt", "whenTrue": "c * 0.9", "whenFalse": "c"]]
        XCTAssertEqual(value(priced), 90)
        XCTAssertEqual(value(priced.assigning("a", 1)), 100)
        let broken = reading(priced.assigning("skinStates", ["conditional": ["whenTrue": "c *"]]))
        XCTAssertEqual(broken.note, "Bad number")
        XCTAssertEqual(broken.value, 1)
        XCTAssertEqual(FormulaSkinModel.branchText(["whenTrue": "c * 0.9"], "whenTrue"), "c * 0.9")
        XCTAssertEqual(FormulaSkinModel.branchText([:], "whenFalse"), "0")
        XCTAssertEqual(FormulaSkinModel.branchText(["whenFalse": 2.5], "whenFalse"), "2.5")
    }

    func testPublishesTheAnswerAtThePrecisionTheCardPrintsIt() {
        let rounded = card(["a": 1, "b": 3, "operator": "divide", "precision": 2])
        XCTAssertEqual(value(rounded), 0.33)
        XCTAssertEqual(FormulaSkinModel.answerText(rounded), "0.33")
        XCTAssertEqual(FormulaSkinModel.answerText(card(["a": 2, "b": 3, "unit": "kg"])), "5 kg")
        XCTAssertEqual(FormulaSkinModel.answerText(card(["a": 3, "b": 1, "skin": "ratio"])), "75%")
        XCTAssertEqual(reading(card(["skin": "percent_change", "unit": "pts"])).suffix, "pts")
        XCTAssertEqual(FormulaSkinModel.precision(card(["precision": 99])), 6)
        XCTAssertNil(FormulaSkinModel.precision(card()))
        XCTAssertEqual(FormulaSkinModel.unit(card(["unit": "  kilograms per hour  "])), "kilograms") // sliced to 12 units, then trimmed
        // Rounding never publishes a negative zero.
        XCTAssertEqual(value(card(["a": -0.001, "b": 1, "operator": "multiply", "precision": 2])).sign, .plus)
    }

    func testSaysWhetherTheQuestionCanBeAnsweredAtAll() {
        XCTAssertTrue(FormulaSkinModel.isValid(card(["a": 7, "b": 2, "operator": "divide"])))
        XCTAssertFalse(FormulaSkinModel.isValid(card(["a": 7, "b": 0, "operator": "divide"])))
    }

    func testNeverTrapsOnHalfTypedOrHostileData() {
        let hostile: JSONObject = [
            "label": "", "a": "NaN", "b": [], "operator": "wat", "skin": "expression",
            "skinStates": ["expression": ["expression": "((((("]], "names": "nope", "inputCount": .null, "precision": "2",
        ]
        XCTAssertEqual(value(hostile), 0)
        XCTAssertFalse(FormulaSkinModel.isValid(hostile))
        XCTAssertEqual(value(["a": 1e308, "b": 1e308, "operator": "multiply"]), .infinity)
        XCTAssertEqual(value(["skinStates": "nope", "skin": "conditional"]), 0)
    }
}
