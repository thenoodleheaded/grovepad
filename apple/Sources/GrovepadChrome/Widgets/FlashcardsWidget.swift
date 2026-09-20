import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Study Deck (`components/widgets/modules/FlashcardsWidget.tsx`,
// `restingFaces/catalog.ts flashcardsFace`). The flashcards skin flips a card
// and browses the deck; next/previous are the `increment`/`decrement`
// commands so a tap and a wire land on the same card. The skin field is
// `mode`; the vocabulary and quiz skins render their lists minimally.
//
// The web's add/remove write `{ cards, current }` and drop the other keys;
// this port mutates in place (law 5) and keeps `mode`, `vocabulary`, `quiz`.
// ---------------------------------------------------------------------------

public struct FlashcardsWidget: WidgetRenderer {
    public static let type = "flashcards"

    public init() {}

    static func currentIndex(_ data: JSONObject) -> Int {
        let count = data.recordList("cards").count
        let raw = Int(jsRound(data.finite("current") ?? 0))
        return min(max(0, raw), max(0, count - 1))
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let mode = data.str("mode", "flashcards")
        return Group {
            switch mode {
            case "vocabulary": vocabularyBody(context)
            case "quiz": quizBody(context)
            default: DeckBody(context: context)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func vocabularyBody(_ context: WidgetCardContext) -> some View {
        let terms = context.data.object("vocabulary")?.recordList("terms") ?? []
        return VStack(alignment: .leading, spacing: 4) {
            GlassLabel("Vocabulary")
            ForEach(terms, id: \.["id"]) { term in
                let id = term.str("id")
                HStack(spacing: 8) {
                    Button {
                        context.update { data in
                            var vocabulary = data.object("vocabulary") ?? JSONObject()
                            vocabulary.patchRecord(in: "terms", id: id) { $0["known"] = .bool(!(term.bool("known") ?? false)) }
                            data["vocabulary"] = .object(vocabulary)
                        }
                    } label: {
                        Image(systemName: term.bool("known") == true ? "checkmark.seal.fill" : "seal")
                            .foregroundStyle(term.bool("known") == true ? Color(hex: context.accent) : .secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(term.bool("known") == true ? "Mark unknown" : "Mark known")
                    .touchTarget()
                    CardTextField("Term", text: term.str("term")) { next in
                        context.update { data in
                            var vocabulary = data.object("vocabulary") ?? JSONObject()
                            vocabulary.patchRecord(in: "terms", id: id) { $0["term"] = .string(next) }
                            data["vocabulary"] = .object(vocabulary)
                        }
                    }
                    CardTextField("Definition", text: term.str("definition")) { next in
                        context.update { data in
                            var vocabulary = data.object("vocabulary") ?? JSONObject()
                            vocabulary.patchRecord(in: "terms", id: id) { $0["definition"] = .string(next) }
                            data["vocabulary"] = .object(vocabulary)
                        }
                    }
                }
            }
        }
    }

    private func quizBody(_ context: WidgetCardContext) -> some View {
        let quiz = context.data.object("quiz") ?? JSONObject()
        let options = quiz.recordList("options")
        let picked = quiz.finite("picked").map { Int($0) }
        return VStack(alignment: .leading, spacing: 4) {
            GlassLabel("Quiz")
            CardTextField("Prompt", text: quiz.str("prompt")) { next in
                context.update { data in
                    var quiz = data.object("quiz") ?? JSONObject()
                    quiz["prompt"] = .string(next)
                    data["quiz"] = .object(quiz)
                }
            }
            ForEach(Array(options.enumerated()), id: \.element["id"]) { index, option in
                Button {
                    context.update { data in
                        var quiz = data.object("quiz") ?? JSONObject()
                        quiz["picked"] = .number(Double(index))
                        data["quiz"] = .object(quiz)
                    }
                } label: {
                    HStack {
                        Image(systemName: picked == index ? "largecircle.fill.circle" : "circle")
                        Text(option.str("text").isEmpty ? "Option \(index + 1)" : option.str("text")).font(GlassType.body)
                        Spacer(minLength: 0)
                        if picked == index, option.bool("correct") == true {
                            Text("Correct").font(GlassType.label).foregroundStyle(Color(hex: "#34d399"))
                        }
                    }
                }
                .buttonStyle(.plain)
                .touchTarget()
            }
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `flashcardsFace`: the card on top is the card the open deck shows;
    /// the rest follow in deck order.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let cards = data.recordList("cards")
        if cards.isEmpty { return .icon }
        let current = FlashcardsWidget.currentIndex(data)
        var rows: [RestRow] = []
        var offset = 0
        while offset < cards.count, rows.count < RestingFaceMeasure.rowLimit {
            let card = cards[(current + offset) % cards.count]
            let back = RestText.compact(card.str("back"), 12)
            let front = card.str("front")
            let id = card.str("id")
            rows.append(RestRow(
                key: id.isEmpty ? "card-\(offset)" : id,
                label: RestText.compact(front.isEmpty ? "Card" : front, 26),
                value: offset == 0 && !back.isEmpty ? back : nil,
                lead: offset == 0 ? "?" : nil,
                tone: offset == 0 ? .accent : .muted
            ))
            offset += 1
        }
        return .rows(rows: rows, overflow: max(0, cards.count - rows.count))
    }
}

/// The flashcards skin: flip, browse, edit, add, remove.
private struct DeckBody: View {
    let context: WidgetCardContext
    @State private var flipped = false

    var body: some View {
        let data = context.data
        let cards = data.recordList("cards")
        let index = FlashcardsWidget.currentIndex(data)
        let card = cards.indices.contains(index) ? cards[index] : nil
        let accent = Color(hex: context.accent)
        VStack(spacing: 8) {
            if let card {
                let side = flipped ? "back" : "front"
                Island {
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            GlassLabel(flipped ? "Answer" : "Question")
                            Button { flipped.toggle() } label: {
                                Label(flipped ? "Show question" : "Show answer", systemImage: "arrow.2.squarepath")
                                    .font(GlassType.label)
                                    .foregroundStyle(accent)
                            }
                            .buttonStyle(.plain)
                            .touchTarget()
                        }
                        CardTextField(flipped ? "The answer…" : "The question…", text: card.str(side)) { next in
                            context.update { $0.patchRecord(in: "cards", id: card.str("id")) { $0[side] = .string(next) } }
                        }
                        .font(GlassType.value)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .id("\(card.str("id"))-\(side)")
            } else {
                Text("No cards yet").font(GlassType.body).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            HStack(spacing: 2) {
                GhostButton("chevron.left", label: "Previous card") { flipped = false; context.runCommand("decrement") }
                Text(cards.isEmpty ? "0/0" : "\(index + 1)/\(cards.count)")
                    .font(GlassType.label).monospacedDigit().foregroundStyle(.secondary).frame(minWidth: 36)
                GhostButton("chevron.right", label: "Next card") { flipped = false; context.runCommand("increment") }
                Spacer(minLength: 0)
                GhostButton("trash", label: "Delete card") {
                    guard let card else { return }
                    flipped = false
                    context.update { data in
                        data.removeRecord(in: "cards", id: card.str("id"))
                        let count = data.recordList("cards").count
                        data["current"] = .number(Double(max(0, min(index, count - 1))))
                    }
                }
                GhostButton("plus", label: "Add card") {
                    flipped = false
                    let id = context.mint()
                    context.update { data in
                        var record = JSONObject()
                        record["id"] = .string(id)
                        record["front"] = .string("")
                        record["back"] = .string("")
                        data.appendRecord(in: "cards", record)
                        data["current"] = .number(Double(cards.count))
                    }
                }
            }
        }
    }
}
