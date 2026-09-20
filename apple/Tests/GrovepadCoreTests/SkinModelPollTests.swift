import XCTest
@testable import GrovepadCore

/// `PollSkinModel` against the canonical half of the web's own
/// `pollSkinModel.test.ts` (validation, standings, reset) and the poll field
/// contract in `pollSkins.test.ts`.
final class SkinModelPollTests: XCTestCase {
    private func base() -> JSONObject {
        [
            "skin": "bars",
            "question": "Which direction?",
            "options": [
                ["id": "a", "label": "North", "votes": 3],
                ["id": "b", "label": "South", "votes": 1],
                ["id": "c", "label": "East", "votes": 0],
            ],
        ]
    }

    private func options(_ data: JSONObject) -> [PollOption] { PollSkinModel.options(data["options"]) }

    func testDropsMalformedRowsDuplicateIdsAndNegativeCounts() {
        XCTAssertEqual(PollSkinModel.options([
            ["id": "a", "label": "Keep", "votes": 2],
            ["id": "a", "label": "Duplicate id", "votes": 9],
            ["id": "b", "label": "Negative", "votes": -4],
            "not an option",
            .null,
            ["label": "No id", "votes": 1.9],
            ["id": "", "label": "Empty id", "votes": 2.5, "extra": "dropped"],
            [1, 2],
            ["id": "z", "label": 42, "votes": "7"],
        ]), [
            PollOption(id: "a", label: "Keep", votes: 2),
            PollOption(id: "b", label: "Negative", votes: 0),
            PollOption(id: "option-5", label: "No id", votes: 1),
            PollOption(id: "option-6", label: "Empty id", votes: 2),
            PollOption(id: "option-7", label: "", votes: 0),
            PollOption(id: "z", label: "", votes: 0),
        ])
        XCTAssertEqual(PollSkinModel.options("nope"), [])
        XCTAssertEqual(PollSkinModel.options(nil), [])
        let flood: JSONValue = .array((0..<30).map { n in .object(["id": .string("o\(n)"), "label": "x", "votes": 1]) })
        XCTAssertEqual(PollSkinModel.options(flood).count, 24)
        XCTAssertEqual(PollSkinModel.options([["id": "x", "label": .string(String(repeating: "x", count: 200)), "votes": 5_000_000]]), [
            PollOption(id: "x", label: String(repeating: "x", count: 160), votes: 1_000_000),
        ])
    }

    func testFallsBackToBarsForAnUnknownSkin() {
        XCTAssertEqual(PollSkinModel.skinMode("donut"), "donut")
        XCTAssertEqual(PollSkinModel.skinMode("ranked-choice"), "bars")
        XCTAssertEqual(PollSkinModel.skinMode(nil), "bars")
        XCTAssertEqual(PollSkinModel.question(.string(String(repeating: "q", count: 500))).count, 400)
        XCTAssertEqual(PollSkinModel.question(3), "")
    }

    func testGivesEachOptionAStableColourByDeclaredPosition() {
        XCTAssertNotEqual(PollSkinModel.segmentColor(0), PollSkinModel.segmentColor(1))
        XCTAssertEqual(PollSkinModel.segmentColor(0), PollSkinModel.segmentColor(8))
    }

    func testRanksAndSharesWithoutReorderingTheDeclaredList() {
        let tallies = PollSkinModel.tallies(options(base()))
        XCTAssertEqual(tallies.map(\.option.id), ["a", "b", "c"])
        XCTAssertEqual(tallies[0].rank, 1)
        XCTAssertEqual(tallies[0].share, 75)
        XCTAssertTrue(tallies[0].leading)
        XCTAssertEqual(tallies[1].rank, 2)
        XCTAssertEqual(tallies[1].share, 25)
        XCTAssertFalse(tallies[1].leading)
        XCTAssertEqual(tallies[2].rank, 3)
        XCTAssertEqual(tallies[2].index, 2)
    }

    func testSortsByStandingAndKeepsDeclaredOrderAsTheTieBreak() {
        let tied = PollSkinModel.tallies([
            PollOption(id: "a", label: "A", votes: 1),
            PollOption(id: "b", label: "B", votes: 4),
            PollOption(id: "c", label: "C", votes: 1),
        ], order: .leading)
        XCTAssertEqual(tied.map(\.option.id), ["b", "a", "c"])
        XCTAssertEqual(tied.map(\.rank), [1, 2, 2])
    }

    func testReportsNoLeaderAndNoTieBeforeAnythingIsCast() {
        let empty = options(base()).map { PollOption(id: $0.id, label: $0.label, votes: 0) }
        XCTAssertEqual(PollSkinModel.totalVotes(empty), 0)
        XCTAssertFalse(PollSkinModel.isTied(empty))
        XCTAssertNil(PollSkinModel.leadingOption(empty))
        XCTAssertFalse(PollSkinModel.tallies(empty)[0].leading)
        XCTAssertEqual(PollSkinModel.tallies(empty)[0].share, 0)
    }

    func testSeesATieAtTheTop() {
        XCTAssertTrue(PollSkinModel.isTied([PollOption(id: "a", label: "A", votes: 2), PollOption(id: "b", label: "B", votes: 2)]))
        XCTAssertFalse(PollSkinModel.isTied(options(base())))
        XCTAssertEqual(PollSkinModel.leadingOption(options(base()))?.id, "a")
        XCTAssertEqual(PollSkinModel.share(1, 3), 33.3)
        XCTAssertEqual(PollSkinModel.share(2, 3), 66.7)
        XCTAssertEqual(PollSkinModel.share(1_000_000, 1_000_001), 100)
        XCTAssertEqual(PollSkinModel.share(1, 0), 0)
    }

    func testCanonicalWritesKeepTheRecordShapeAndOrder() {
        let voted = PollSkinModel.castVote(base(), "c")
        XCTAssertEqual(options(voted).map(\.votes), [3, 1, 1])
        XCTAssertEqual(JSONWriter.stringify(.object(PollSkinModel.castVote(base(), "ghost"))), JSONWriter.stringify(.object(base())))
        let capped = PollSkinModel.addVotes(base(), ["a": 5_000_000, "b": 0])
        XCTAssertEqual(options(capped).map(\.votes), [1_000_000, 1, 0])
        XCTAssertEqual(options(PollSkinModel.setOptionLabel(base(), "b", "West"))[1].label, "West")
        XCTAssertEqual(options(PollSkinModel.addOption(base(), id: "d")).last, PollOption(id: "d", label: "", votes: 0))
        var messy = base()
        messy["options"] = [["votes": 2, "id": "a", "label": "North", "stray": true]]
        XCTAssertEqual(JSONWriter.stringify(.object(PollSkinModel.castVote(messy, "a"))), #"{"skin":"bars","question":"Which direction?","options":[{"id":"a","label":"North","votes":3}]}"#)
    }

    func testClearsEveryCountAndEverySkinLedgerWhenVotesAreReset() {
        var busy = base()
        busy["skinStates"] = ["approval": ["ballots": 6], "live_room": ["phase": "open"]]
        let cleared = PollSkinModel.resetVotes(busy)
        XCTAssertTrue(options(cleared).allSatisfy { $0.votes == 0 })
        XCTAssertFalse(cleared.contains("skinStates"))
        XCTAssertEqual(cleared.keys, ["skin", "question", "options"])
        var noOptions: JSONObject = ["skinStates": ["x": [:]], "skin": "bars"]
        noOptions["options"] = "nope"
        XCTAssertEqual(JSONWriter.stringify(.object(PollSkinModel.resetVotes(noOptions))), #"{"skin":"bars","options":[]}"#)
    }

    func testThePollFieldsAndResetCommand() throws {
        let data = base()
        XCTAssertEqual(fieldDescriptor("poll", "votes")!.get(data), .number(4))
        XCTAssertEqual(fieldDescriptor("poll", "leader")!.get(data), .text("North"))
        XCTAssertEqual(fieldDescriptor("poll", "leader_share")!.get(data), .number(75))
        var level = base()
        level["options"] = .array(options(base()).map { PollOption(id: $0.id, label: $0.label, votes: 2).json })
        XCTAssertEqual(fieldDescriptor("poll", "leader")!.get(level), .text("Tied"))
        XCTAssertEqual(fieldDescriptor("poll", "leader")!.get(["options": []]), .text(""))
        let reset = try XCTUnwrap(commandsFor("poll").first { $0.key == "reset" })
        XCTAssertFalse(reset.acceptsPayload)
        var busy = base()
        busy["skinStates"] = ["approval": ["ballots": 6]]
        let cleared = reset.run(busy, nil, .counting())
        XCTAssertTrue(options(cleared).allSatisfy { $0.votes == 0 })
        XCTAssertFalse(cleared.contains("skinStates"))
        XCTAssertEqual(inputPortsFor("poll").map(\.key), ["reset"])
        XCTAssertEqual(outputPortsFor("poll").map(\.key), ["votes", "leader", "leader_share"])
    }
}
