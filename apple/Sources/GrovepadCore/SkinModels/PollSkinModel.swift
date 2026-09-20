import Foundation

// ---------------------------------------------------------------------------
// Poll skin model (`components/widgets/modules/pollSkinModel.ts`), the
// canonical half: option validation, tallies, the leader and the tie rule,
// and the canonical writes (`addPollVotes`, `castPollVote`, `resetPollVotes`).
//
// Every skin collects preferences a different way, but they all settle into
// the same canonical `options[].votes`; anything one skin alone can
// interpret — ballots, duel records, room phase — lives in `skinStates`.
// The approval / ranked-choice / pairwise / live-room / anonymous ledgers
// are renderer working (phase 8) and are not ported here.
// ---------------------------------------------------------------------------

public struct PollOption: Equatable {
    public var id: String
    public var label: String
    public var votes: Double

    public init(id: String, label: String, votes: Double) {
        self.id = id
        self.label = label
        self.votes = votes
    }

    /// `{ id, label, votes }` in that key order.
    public var json: JSONValue {
        var object = JSONObject()
        object["id"] = .string(id)
        object["label"] = .string(label)
        object["votes"] = .number(votes)
        return .object(object)
    }
}

public enum PollSkinModel {
    public static let skins: [String] = ["bars", "donut", "approval", "ranked_choice", "pairwise", "live_room", "anonymous"]

    public enum Order {
        case declared, leading
    }

    /// Segment colours, in option order. Harmonised with the Poll's fuchsia accent.
    public static let segmentColors: [String] = [
        "#f0abfc", "#c4b5fd", "#93c5fd", "#5eead4", "#fcd34d", "#fda4af", "#bef264", "#a5b4fc",
    ]

    public struct Tally: Equatable {
        public let option: PollOption
        /// Position in the declared option list — the stable colour index.
        public let index: Int
        public let votes: Double
        /// 0–100, rounded to one decimal. Zero when nothing has been cast.
        public let share: Double
        /// 1-based standing; ties share a rank.
        public let rank: Int
        public let leading: Bool
    }

    static let maxOptions = 24
    static let maxLabel = 160
    static let maxQuestion = 400
    static let maxVotes = 1_000_000.0

    /// `wholeCount`: a finite number floored and clamped to `0…limit`, else 0.
    static func wholeCount(_ raw: JSONValue?, _ limit: Double) -> Double {
        let value = raw?.numberValue.map { $0.rounded(.down) } ?? 0
        return Swift.min(Swift.max(value, 0), limit)
    }

    public static func skinMode(_ raw: JSONValue?) -> String {
        guard let value = raw?.stringValue, skins.contains(value) else { return "bars" }
        return value
    }

    public static func question(_ raw: JSONValue?) -> String {
        guard let string = raw?.stringValue else { return "" }
        return JavaScript.prefix(string, utf16Count: maxQuestion)
    }

    /// `pollOptions`: the first 24 records, malformed rows and duplicate ids
    /// dropped, labels bounded, negative or fractional counts made whole. A
    /// row that is an array is an object to `typeof` and reads as an unnamed
    /// option `option-<index>`, exactly as on the web.
    public static func options(_ raw: JSONValue?) -> [PollOption] {
        guard let items = raw?.arrayValue else { return [] }
        var seen: Set<String> = []
        var options: [PollOption] = []
        for (index, item) in items.prefix(maxOptions).enumerated() {
            let record: JSONObject
            switch item {
            case .object(let object): record = object
            case .array: record = JSONObject()
            default: continue
            }
            let id = record.string("id")
            let candidate = (id?.isEmpty == false) ? id! : "option-\(index)"
            if seen.contains(candidate) { continue }
            seen.insert(candidate)
            options.append(PollOption(
                id: candidate,
                label: record.string("label").map { JavaScript.prefix($0, utf16Count: maxLabel) } ?? "",
                votes: wholeCount(record["votes"], maxVotes)
            ))
        }
        return options
    }

    public static func totalVotes(_ options: [PollOption]) -> Double {
        options.reduce(0) { $0 + $1.votes }
    }

    public static func share(_ votes: Double, _ total: Double) -> Double {
        if total <= 0 { return 0 }
        return jsRound((votes / total) * 1000) / 10
    }

    /// Every option with its standing. `.leading` sorts by votes and keeps the
    /// declared order as the tie-break.
    public static func tallies(_ options: [PollOption], order: Order = .declared) -> [Tally] {
        let total = totalVotes(options)
        let top = options.reduce(0.0) { Swift.max($0, $1.votes) }
        let descending = options.sorted { $0.votes > $1.votes }
        let tallies = options.enumerated().map { index, option in
            Tally(
                option: option, index: index, votes: option.votes,
                share: share(option.votes, total),
                rank: (descending.firstIndex { $0.votes == option.votes } ?? -1) + 1,
                leading: top > 0 && option.votes == top
            )
        }
        if order == .declared { return tallies }
        return tallies.sorted { $0.votes != $1.votes ? $0.votes > $1.votes : $0.index < $1.index }
    }

    public static func leadingOption(_ options: [PollOption]) -> PollOption? {
        if totalVotes(options) <= 0 { return nil }
        return options.sorted { $0.votes > $1.votes }.first
    }

    /// True when more than one option is tied at the top of a non-empty poll.
    public static func isTied(_ options: [PollOption]) -> Bool {
        guard let leader = leadingOption(options) else { return false }
        return options.filter { $0.votes == leader.votes }.count > 1
    }

    public static func segmentColor(_ index: Int) -> String {
        segmentColors[index % segmentColors.count]
    }

    // MARK: - Canonical writes

    /// `{ ...data, options }` — the cleaned list written back in place.
    static func withOptions(_ data: JSONObject, _ options: [PollOption]) -> JSONObject {
        data.assigning("options", .array(options.map(\.json)))
    }

    public static func addVotes(_ data: JSONObject, _ votes: [String: Double]) -> JSONObject {
        withOptions(data, options(data["options"]).map { option in
            // `votes[option.id] ? … : option` — a zero or NaN credit is falsy.
            guard let added = votes[option.id], added != 0, !added.isNaN else { return option }
            var next = option
            next.votes = Swift.min(option.votes + added, maxVotes)
            return next
        })
    }

    public static func castVote(_ data: JSONObject, _ optionId: String) -> JSONObject {
        addVotes(data, [optionId: 1])
    }

    public static func setOptionLabel(_ data: JSONObject, _ optionId: String, _ label: String) -> JSONObject {
        withOptions(data, options(data["options"]).map { option in
            guard option.id == optionId else { return option }
            var next = option
            next.label = JavaScript.prefix(label, utf16Count: maxLabel)
            return next
        })
    }

    public static func addOption(_ data: JSONObject, id: String) -> JSONObject {
        let current = options(data["options"])
        if current.count >= maxOptions { return data }
        return withOptions(data, current + [PollOption(id: id, label: "", votes: 0)])
    }

    /// `resetPollVotes`: every count to zero and every skin ledger gone —
    /// ballots, duels and room phase are the same result told another way.
    /// The web writes `skinStates: undefined`, which `JSON.stringify` drops.
    public static func resetVotes(_ data: JSONObject) -> JSONObject {
        var next = withOptions(data, options(data["options"]).map { option in
            var cleared = option
            cleared.votes = 0
            return cleared
        })
        next.removeValue(forKey: "skinStates")
        return next
    }
}
