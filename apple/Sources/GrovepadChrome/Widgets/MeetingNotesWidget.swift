import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Meeting Notes (`components/widgets/modules/MeetingNotesWidget.tsx`,
// `meetingNotesSkinModel.ts`, `restingFaces/meeting.ts`). One meeting is
// always four facts — `date`, `attendees`, `notes`, `actions` — and a skin
// decides the shape they are read in. The skin field is `skin`.
//
// This port draws the agenda arrangement for every skin, each with its own
// words (`SKIN_COPY`): the eyebrow and summary, the date and attendees, the
// notes field, then the numbered action rail with a done check, the text,
// and a remove button. The agenda's own pockets (a topic's timebox and
// desired outcome, `skinStates.agenda.items[id]`) are edited in place; the
// other skins' pockets (owners, due dates, lanes, sign-off) are read by the
// resting face and preserved untouched. Removing an action takes its extras
// out of every pocket (`removeMeetingAction`).
// ---------------------------------------------------------------------------

public struct MeetingNotesWidget: WidgetRenderer {
    public static let type = "meeting_notes"
    static let skins = ["agenda", "minutes", "stand_up", "retrospective", "one_to_one", "decision_review", "handoff"]
    static let extensionSkins: Set<String> = ["decision_review", "handoff"]
    static let maxActions = 200

    struct Copy {
        var eyebrow: String
        var notesLabel: String
        var notesPlaceholder: String
        var listLabel: String
        var addLabel: String
        var itemPlaceholder: String
    }

    static let copy: [String: Copy] = [
        "agenda": Copy(eyebrow: "Agenda", notesLabel: "Preparation", notesPlaceholder: "Context to read before we start…", listLabel: "Topics", addLabel: "Add topic", itemPlaceholder: "Topic to cover…"),
        "minutes": Copy(eyebrow: "Minutes", notesLabel: "Discussion", notesPlaceholder: "What was discussed…", listLabel: "Resolutions", addLabel: "Record resolution", itemPlaceholder: "Resolved that…"),
        "stand_up": Copy(eyebrow: "Stand-up", notesLabel: "Today", notesPlaceholder: "What I am working on today…", listLabel: "Help needed", addLabel: "Ask for help", itemPlaceholder: "What would unblock you?"),
        "retrospective": Copy(eyebrow: "Retro", notesLabel: "Went well", notesPlaceholder: "What should we keep doing?", listLabel: "Next experiments", addLabel: "Add experiment", itemPlaceholder: "Try this next sprint…"),
        "one_to_one": Copy(eyebrow: "One-to-one", notesLabel: "Talking points", notesPlaceholder: "What do we want to cover?", listLabel: "Commitments", addLabel: "Add commitment", itemPlaceholder: "Who will do what…"),
        "decision_review": Copy(eyebrow: "Decision review", notesLabel: "Context", notesPlaceholder: "What were we deciding between?", listLabel: "Decisions", addLabel: "Record decision", itemPlaceholder: "We decided to…"),
        "handoff": Copy(eyebrow: "Handoff", notesLabel: "Current state", notesPlaceholder: "Where things stand right now…", listLabel: "Next actions", addLabel: "Add next action", itemPlaceholder: "The next thing to do…"),
    ]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "agenda"
    }

    static let itemKeys = ["minutes", "outcome", "owner", "due", "rationale", "review"]
    static let panelKeys = ["yesterday", "blockers", "improve", "learned", "feedback", "followUp", "risks", "acknowledgedBy"]

    /// `meetingItemDetails`: per-action extras belonging to one skin.
    static func itemDetails(_ data: JSONObject, skin: String) -> [String: [String: String]] {
        let raw = data.skinState(skin).object("items") ?? JSONObject()
        var result: [String: [String: String]] = [:]
        for (id, value) in raw.entries.prefix(maxActions) {
            guard let source = value.objectValue else { continue }
            var detail: [String: String] = [:]
            for key in itemKeys {
                let text = String(source.str(key).prefix(500))
                if !text.isEmpty { detail[key] = text }
            }
            if !detail.isEmpty { result[id] = detail }
        }
        return result
    }

    /// `meetingPanels`: prose panels belonging to one skin.
    static func panels(_ data: JSONObject, skin: String) -> (text: [String: String], acknowledged: Bool) {
        let state = data.skinState(skin)
        var text: [String: String] = [:]
        for key in panelKeys {
            let value = String(state.str(key).prefix(4_000))
            if !value.isEmpty { text[key] = value }
        }
        return (text, state.bool("acknowledged") == true)
    }

    /// `meetingAttendees`: one free line split on commas, semicolons, newlines.
    static func attendees(_ raw: String) -> [String] {
        raw.prefix(4_000).split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "\n" })
            .map { JavaScript.trim(String($0)) }.filter { !$0.isEmpty }.prefix(40).map { $0 }
    }

    /// `agendaTotalMinutes`: whole positive minutes summed over the topics.
    static func agendaTotalMinutes(_ data: JSONObject) -> Int {
        let items = itemDetails(data, skin: "agenda")
        return data.recordList("actions").reduce(0) { total, action in
            let parsed = JavaScript.parseFloat(items[action.str("id")]?["minutes"] ?? "")
            return total + (parsed.isFinite && parsed > 0 ? Int(parsed.rounded(.towardZero)) : 0)
        }
    }

    static func lines(_ text: String) -> [String] {
        text.split(separator: "\n", omittingEmptySubsequences: false).map { JavaScript.trim(String($0)) }.filter { !$0.isEmpty }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = MeetingNotesWidget.skin(data)
        let copy = MeetingNotesWidget.copy[skin] ?? MeetingNotesWidget.copy["agenda"]!
        let actions = data.recordList("actions")
        let details = MeetingNotesWidget.itemDetails(data, skin: skin)
        let accent = Color(hex: context.accent)
        let covered = actions.filter { $0.bool("done") == true }.count
        let total = skin == "agenda" ? MeetingNotesWidget.agendaTotalMinutes(data) : 0
        let notes = Binding<String>(
            get: { context.data.str("notes") },
            set: { next in context.update { data in data["notes"] = .string(next); data["skin"] = .string(skin) } }
        )
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                GlassLabel(copy.eyebrow)
                Spacer(minLength: 0)
                if total > 0 { Text("\(total) min").font(GlassType.label).monospacedDigit() }
                Text("\(covered)/\(actions.count) \(skin == "agenda" ? "covered" : "done")").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
            if skin != "agenda" {
                NotesSkinNote(MeetingNotesWidget.extensionSkins.contains(skin)
                    ? "Shown as the agenda — the \(copy.eyebrow.lowercased()) details arrive later."
                    : "Shown as the agenda — the \(copy.eyebrow.lowercased()) arrangement arrives later.")
            }
            HStack(spacing: 8) {
                Image(systemName: "calendar").font(.system(size: 11)).foregroundStyle(.secondary)
                CardTextField("Meeting date (yyyy-mm-dd)", text: data.str("date")) { next in
                    context.update { data in data["date"] = .string(next); data["skin"] = .string(skin) }
                }
                .frame(width: 110)
                Image(systemName: "person.2").font(.system(size: 11)).foregroundStyle(.secondary)
                CardTextField("Attendees…", text: data.str("attendees")) { next in
                    context.update { data in data["attendees"] = .string(next); data["skin"] = .string(skin) }
                }
            }
            GlassLabel(copy.notesLabel)
            TextKitEditor(text: notes, placeholder: copy.notesPlaceholder)
                .frame(minHeight: GlassTokens.touchTarget)
            GlassLabel(copy.listLabel)
            ForEach(Array(actions.enumerated()), id: \.element["id"]) { index, action in
                let id = action.str("id")
                let done = action.bool("done") == true
                let detail = details[id] ?? [:]
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 6) {
                        Text("\(index + 1)").font(GlassType.label).monospacedDigit().foregroundStyle(done ? accent : .secondary).frame(width: 16, alignment: .trailing)
                        RoundCheckButton(done: done, label: action.str("text").isEmpty ? copy.listLabel : action.str("text"), accent: accent) {
                            context.update { data in
                                data.patchRecord(in: "actions", id: id) { $0["done"] = .bool(!done) }
                                data["skin"] = .string(skin)
                            }
                        }
                        CardTextField(copy.itemPlaceholder, text: action.str("text")) { next in
                            context.update { data in
                                data.patchRecord(in: "actions", id: id) { $0["text"] = .string(next) }
                                data["skin"] = .string(skin)
                            }
                        }
                        .strikethrough(done)
                        if skin == "agenda" {
                            CardTextField("––", text: detail["minutes"] ?? "") { next in
                                patchItem(context, skin: skin, id: id, key: "minutes", value: next)
                            }
                            .frame(width: 36)
                            .multilineTextAlignment(.trailing)
                            .accessibilityLabel("Timebox for \(action.str("text").isEmpty ? "topic" : action.str("text")) in minutes")
                            Text("min").font(GlassType.label).foregroundStyle(.secondary)
                        }
                        RowDeleteButton(label: "Remove \(action.str("text").isEmpty ? "empty item" : action.str("text"))") {
                            context.update { data in
                                // `removeMeetingAction`: the extras leave every skin, not just this one.
                                data.removeRecord(in: "actions", id: id)
                                data.removeFromEverySkinPocket(id: id, in: ["items"])
                                data["skin"] = .string(skin)
                            }
                        }
                    }
                    if skin == "agenda" {
                        HStack(spacing: 6) {
                            Text("Outcome").font(GlassType.label).foregroundStyle(.secondary)
                            CardTextField("What does done look like?", text: detail["outcome"] ?? "") { next in
                                patchItem(context, skin: skin, id: id, key: "outcome", value: next)
                            }
                        }
                        .padding(.leading, 22)
                    }
                }
            }
            if actions.isEmpty {
                Text(skin == "agenda" ? "No topics yet — add the first thing to cover." : "Nothing listed yet.").font(GlassType.label).foregroundStyle(.secondary)
            }
            FlowButton(copy.addLabel, symbol: "plus", accent: accent) {
                let id = context.mint()
                context.update { data in
                    var record = JSONObject()
                    record["id"] = .string(id)
                    record["text"] = .string("")
                    record["done"] = .bool(false)
                    data.appendRecord(in: "actions", record)
                    data["skin"] = .string(skin)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    /// `dataWithMeetingItemDetails`: one extra on one action inside the worn
    /// skin's pocket; an empty value deletes the key, an empty detail the item.
    private func patchItem(_ context: WidgetCardContext, skin: String, id: String, key: String, value: String) {
        context.update { data in
            data.patchSkinState(skin) { state in
                var items = state.object("items") ?? JSONObject()
                var detail = items.object(id) ?? JSONObject()
                if value.isEmpty { _ = detail.removeValue(forKey: key) } else { detail[key] = .string(String(value.prefix(500))) }
                if detail.isEmpty { _ = items.removeValue(forKey: id) } else { items[id] = .object(detail) }
                if items.isEmpty { _ = state.removeValue(forKey: "items") } else { state["items"] = .object(items) }
            }
            data["skin"] = .string(skin)
        }
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `meetingNotesRestingFace`: the agenda's numbered topics and every list
    /// skin as rows; the minutes as ledger lines; the stand-up's lanes and the
    /// retro's quadrants as columns (wrapped 2×2 for the retro); spare prose
    /// as its own words.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let skin = MeetingNotesWidget.skin(data)
        let actions = data.recordList("actions")
        let details = MeetingNotesWidget.itemDetails(data, skin: skin)
        let panels = MeetingNotesWidget.panels(data, skin: skin)
        let notes = data.str("notes")
        let date = data.str("date")
        let dateNote: String? = date.isEmpty ? nil : DateSkinModel.shortDayText(date)
        let label = MeetingNotesWidget.copy[skin]?.eyebrow ?? "Agenda"
        let eyebrow = { (note: String?, tone: RestTone?) -> RestEyebrow in RestEyebrow(label: label, note: note ?? dateNote, tone: tone) }
        let text = { (action: JSONObject, fallback: String) -> String in
            let value = action.str("text")
            return RestText.compact(value.isEmpty ? fallback : value, 28)
        }
        let overflow = max(0, actions.count - RestingFaceMeasure.rowLimit)
        let visible = actions.prefix(RestingFaceMeasure.rowLimit)

        if skin == "agenda", !actions.isEmpty {
            let total = MeetingNotesWidget.agendaTotalMinutes(data)
            let rows = visible.enumerated().map { index, action -> RestRow in
                let detail = details[action.str("id")] ?? [:]
                let value = detail["minutes"].map { "\($0) min" } ?? detail["outcome"]
                return RestRow(key: action.str("id"), label: text(action, "Untitled topic"), done: action.bool("done") == true, value: value.map { RestText.compact($0, 16) }, lead: "\(index + 1)")
            }
            return .rows(rows: rows, overflow: overflow, eyebrow: eyebrow(total > 0 ? "\(total) min" : nil, nil))
        }
        if skin == "minutes", !actions.isEmpty {
            let shown = actions.prefix(RestingFaceMeasure.lineLimit)
            let lines = shown.map { action -> RestLine in
                let detail = details[action.str("id")] ?? [:]
                let right = detail["owner"] ?? detail["due"].map { DateSkinModel.shortDayText($0) } ?? ""
                // An adopted resolution reads settled, not struck through.
                return RestLine(key: action.str("id"), left: RestText.compact(action.str("text").isEmpty ? "Untitled resolution" : action.str("text"), 26), right: right.isEmpty ? nil : RestText.compact(right, 12), tone: action.bool("done") == true ? .good : nil)
            }
            let more = actions.count - shown.count
            return .lines(lines: lines, eyebrow: eyebrow(nil, nil), total: more > 0 ? RestLine(key: "more", left: "+\(more) more", dim: true) : nil)
        }
        if skin == "stand_up" || skin == "retrospective" {
            let limit = RestingFaceMeasure.columnItemLimit
            let prose = { (key: String, label: String, value: String?, tone: RestTone) -> RestColumn in
                let all = MeetingNotesWidget.lines(value ?? "")
                let visible = all.prefix(limit)
                return RestColumn(key: key, label: label, tone: tone, items: visible.enumerated().map { RestRow(key: "\(key)-\($0.offset)", label: RestText.compact($0.element, 18)) }, overflow: max(0, all.count - visible.count))
            }
            let actionColumn = { (key: String, label: String, tone: RestTone) -> RestColumn in
                let visible = actions.prefix(limit)
                return RestColumn(key: key, label: label, tone: tone, items: visible.map { RestRow(key: $0.str("id"), label: RestText.compact($0.str("text").isEmpty ? "Untitled" : $0.str("text"), 18), done: $0.bool("done") == true) }, overflow: max(0, actions.count - visible.count))
            }
            var columns: [RestColumn]
            if skin == "stand_up" {
                columns = [
                    prose("yesterday", "Yesterday", panels.text["yesterday"], .muted),
                    prose("today", "Today", notes, .accent),
                    prose("blockers", "Blockers", panels.text["blockers"], panels.text["blockers"] == nil ? .muted : .bad),
                ]
                if !actions.isEmpty { columns.append(actionColumn("asks", "Asks", .warn)) }
            } else {
                columns = [
                    prose("kept", "Went well", notes, .good),
                    prose("dropped", "Did not", panels.text["improve"], .bad),
                    prose("learned", "Learned", panels.text["learned"], .warn),
                    actionColumn("next", "Next", .accent),
                ]
            }
            if columns.contains(where: { !$0.items.isEmpty }) {
                // wrap: 2 keeps the retro's 2×2 quadrants a matrix, not four columns.
                return .columns(columns: columns, wrap: skin == "retrospective" ? 2 : nil, eyebrow: eyebrow(nil, nil))
            }
        }
        if skin == "one_to_one", !actions.isEmpty {
            let today = NotesAndStudyFamily.todayISO()
            let rows = visible.map { action -> RestRow in
                let detail = details[action.str("id")] ?? [:]
                let value = detail["owner"] ?? detail["due"].map { DateSkinModel.shortDayText($0) } ?? ""
                let overdue = detail["due"].map { $0 < today } == true && action.bool("done") != true
                return RestRow(key: action.str("id"), label: text(action, "Untitled commitment"), done: action.bool("done") == true, value: value.isEmpty ? nil : RestText.compact(value, 16), tone: overdue ? .bad : nil)
            }
            return .rows(rows: rows, overflow: overflow, eyebrow: eyebrow(panels.text["followUp"].map { "Next \(DateSkinModel.shortDayText($0))" }, nil))
        }
        if skin == "decision_review", !actions.isEmpty {
            let today = NotesAndStudyFamily.todayISO()
            let due = actions.filter { (details[$0.str("id")]?["review"]).map { $0 <= today } == true }.count
            let rows = visible.map { action -> RestRow in
                let detail = details[action.str("id")] ?? [:]
                let value = detail["review"].map { DateSkinModel.shortDayText($0) } ?? detail["owner"]
                let revisit = detail["review"].map { $0 <= today } == true
                return RestRow(key: action.str("id"), label: text(action, "Untitled decision"), done: action.bool("done") == true, value: value.map { RestText.compact($0, 16) }, tone: revisit ? .warn : nil)
            }
            return .rows(rows: rows, overflow: overflow, eyebrow: due > 0 ? eyebrow("\(due) to revisit", .warn) : eyebrow(nil, nil))
        }
        if skin == "handoff", !actions.isEmpty {
            let open = actions.filter { $0.bool("done") != true }.count
            let acceptedBy = panels.text["acknowledgedBy"].map { RestText.compact($0, 12) } ?? ""
            let note = panels.acknowledged ? (acceptedBy.isEmpty ? "Accepted" : "Accepted · \(acceptedBy)") : open > 0 ? "\(open) open" : "Awaiting sign-off"
            let rows = visible.enumerated().map { index, action -> RestRow in
                let detail = details[action.str("id")] ?? [:]
                let value = detail["owner"] ?? detail["due"].map { DateSkinModel.shortDayText($0) } ?? ""
                return RestRow(key: action.str("id"), label: text(action, "Untitled step"), done: action.bool("done") == true, value: value.isEmpty ? nil : RestText.compact(value, 16), lead: "\(index + 1)")
            }
            return .rows(rows: rows, overflow: overflow, eyebrow: eyebrow(note, panels.acknowledged ? .good : open > 0 ? .warn : nil))
        }
        // No list and no lanes: the meeting rests as whatever prose it holds.
        let spare = [notes, panels.text["yesterday"], panels.text["blockers"], panels.text["improve"], panels.text["learned"], panels.text["feedback"], panels.text["risks"]]
            .compactMap { $0 }.first { !JavaScript.trim($0).isEmpty }
        if let spare { return .text(text: RestText.compact(spare, RestingFaceMeasure.textClamp)) }
        return .icon
    }
}
