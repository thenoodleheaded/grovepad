import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Poll (`components/widgets/modules/PollWidget.tsx`, `pollSkinModel.ts`,
// `restingFace.ts` poll branch). Every skin collects preferences a different
// way, but they all settle into the same canonical `options[].votes`. The
// card writes through `PollSkinModel` (`castVote`, `setOptionLabel`,
// `addOption`), the `reset` command clears every count and every ledger,
// and every write starts from `base()` — `{ ...data, skin, question, options }`
// with the options cleaned. The skin field is `skin`.
//
// Ported skins: bars, donut (a drawn ring over the same tallies).
// approval, ranked_choice, pairwise, live_room and anonymous render the bars
// with a note; their ballots, duels and room state are preserved untouched.
// ---------------------------------------------------------------------------

public struct PollWidget: WidgetRenderer {
    public static let type = "poll"

    public init() {}

    static func skin(_ data: JSONObject) -> String { PollSkinModel.skinMode(data["skin"]) }

    /// `base()`: the normalized shape every write starts from, in place.
    static func normalize(_ data: inout JSONObject, skin: String) {
        data["skin"] = .string(skin)
        data["question"] = .string(PollSkinModel.question(data["question"]))
        data["options"] = .array(PollSkinModel.options(data["options"]).map(\.json))
    }

    /// `removePollOption`: the option gone, and every ledger that named it
    /// (approval ballots, pairwise duels) cleaned in place.
    static func removeOption(_ data: JSONObject, _ optionId: String) -> JSONObject {
        var next = data
        next["options"] = .array(PollSkinModel.options(data["options"]).filter { $0.id != optionId }.map(\.json))
        guard var states = data.object("skinStates") else { return next }
        for (skin, raw) in states.entries {
            guard var state = raw.objectValue else { continue }
            if let ballots = state.array("ballots") {
                state["ballots"] = .array(ballots.compactMap { ballot -> JSONValue? in
                    let ids = (ballot.arrayValue ?? []).filter { $0.stringValue != optionId }
                    return ids.isEmpty ? nil : .array(ids)
                })
            }
            if let duels = state.object("duels") {
                state["duels"] = .object(duels.filter { key, _ in !key.split(separator: "|").map(String.init).contains(optionId) })
            }
            states[skin] = .object(state)
        }
        next["skinStates"] = .object(states)
        return next
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = PollWidget.skin(data)
        let options = PollSkinModel.options(data["options"])
        let tallies = PollSkinModel.tallies(options)
        let total = PollSkinModel.totalVotes(options)
        let accent = Color(hex: context.accent)
        let write = { (mutate: @escaping (inout JSONObject) -> Void) in
            context.update { data in
                PollWidget.normalize(&data, skin: skin)
                mutate(&data)
            }
        }
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                CardTextField("Question", text: data.str("question")) { next in
                    write { $0["question"] = .string(next) }
                }
                .font(GlassType.value)
                Text("\(RestText.number(total)) vote\(total == 1 ? "" : "s")").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
                GhostButton("arrow.counterclockwise", label: "Clear votes") { context.runCommand("reset") }
            }
            if skin != "bars", skin != "donut" {
                SkinNote("Shown as bars — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            if skin == "donut", total > 0 {
                PollDonut(tallies: tallies).frame(height: 72).frame(maxWidth: .infinity)
            }
            ForEach(tallies, id: \.option.id) { tally in
                let color = Color(hex: PollSkinModel.segmentColor(tally.index))
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Circle().fill(color).frame(width: 8, height: 8)
                        CardTextField("Option", text: tally.option.label) { next in
                            write { $0 = PollSkinModel.setOptionLabel($0, tally.option.id, next) }
                        }
                        Text(total > 0 ? "\(RestText.number(tally.votes)) · \(JavaScript.numberString(tally.share))%" : "—").font(GlassType.label).monospacedDigit().foregroundStyle(tally.leading ? accent : .secondary)
                        Button { write { $0 = PollSkinModel.castVote($0, tally.option.id) } } label: {
                            Text("Vote").font(GlassType.label).padding(.horizontal, 8).frame(minHeight: 28)
                                .background(Capsule().fill(accent.opacity(0.18))).foregroundStyle(accent)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Vote for \(tally.option.label.isEmpty ? "option \(tally.index + 1)" : tally.option.label)")
                        .touchTarget()
                        RowDeleteButton(label: "Remove option") {
                            write { $0 = PollWidget.removeOption($0, tally.option.id) }
                        }
                    }
                    if skin != "donut" {
                        MeterBar(fraction: tally.share / 100, tint: color)
                    }
                }
            }
            Button { write { $0 = PollSkinModel.addOption($0, id: context.mint()) } } label: {
                Label("Add option", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The top four tallies, leading first, with their shares.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let options = PollSkinModel.options(data["options"])
        let total = PollSkinModel.totalVotes(options)
        if options.isEmpty || (total == 0 && options.allSatisfy { JavaScript.trim($0.label).isEmpty }) { return .icon }
        let skin = PollWidget.skin(data)
        let masked = skin == "live_room" && data.skinState("live_room").bool("revealed") != true
        let ballots = Double(data.skinState("approval").array("ballots")?.count ?? 0)
        let visible = Array(PollSkinModel.tallies(options, order: .leading).prefix(4))
        return .rows(
            rows: visible.map { tally in
                let value: String
                if masked { value = "•••" } else if total == 0 { value = "—" } else if skin == "pairwise" { value = "\(RestText.number(tally.votes))W" } else if skin == "approval", ballots > 0 { value = "\(RestText.number(tally.votes))/\(RestText.number(ballots))" } else { value = "\(JavaScript.numberString(tally.share))%" }
                return RestRow(key: tally.option.id, label: RestText.compact(JavaScript.trim(tally.option.label).isEmpty ? "Untitled option" : tally.option.label, 28), value: value)
            },
            overflow: max(0, options.count - visible.count)
        )
    }
}

/// The donut: one arc per option in segment colours, the total in the hole.
struct PollDonut: View {
    let tallies: [PollSkinModel.Tally]

    var body: some View {
        let total = tallies.reduce(0.0) { $0 + $1.votes }
        Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = min(size.width, size.height) / 2 - 4
            var start = -Double.pi / 2
            for tally in tallies where tally.votes > 0 {
                let sweep = total > 0 ? tally.votes / total * 2 * .pi : 0
                var path = Path()
                path.addArc(center: center, radius: radius, startAngle: .radians(start), endAngle: .radians(start + sweep), clockwise: false)
                context.stroke(path, with: .color(Color(hex: PollSkinModel.segmentColor(tally.index))), style: StrokeStyle(lineWidth: 10, lineCap: .butt))
                start += sweep
            }
        }
        .overlay(Text(RestText.number(total)).font(GlassType.value).monospacedDigit())
        .accessibilityLabel("\(RestText.number(total)) votes")
    }
}
