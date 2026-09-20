import SwiftUI
import GrovepadCore

/// Renderers for the notes, planning and study family (phase 8): code,
/// outline, pros_cons, decision, meeting_notes, goal_tracker, reading_list,
/// grade_calc, formula_sheet, citation. Owned by that family's porting task.
public enum NotesAndStudyFamily {
    public static var renderers: [AnyWidgetRenderer] {
        [
            AnyWidgetRenderer(CodeWidget()),
            AnyWidgetRenderer(OutlineWidget()),
            AnyWidgetRenderer(ProsConsWidget()),
            AnyWidgetRenderer(DecisionWidget()),
            AnyWidgetRenderer(MeetingNotesWidget()),
            AnyWidgetRenderer(GoalTrackerWidget()),
            AnyWidgetRenderer(ReadingListWidget()),
            AnyWidgetRenderer(GradeCalcWidget()),
            AnyWidgetRenderer(FormulaSheetWidget()),
            AnyWidgetRenderer(CitationWidget()),
        ]
    }

    // MARK: - The catalogue dress (`utils/restingFaces/catalogue.ts`)

    /// The skins the web keeps OUT of `WIDGET_SKIN_BLUEPRINTS`: the legacy
    /// modes a family persisted before the catalogue existed. A card wearing
    /// one of these folds undressed, exactly as `cataloguedSkin` returns null.
    static let undressedSkins: [String: Set<String>] = [
        "decision": ["simple", "weighted"],
        "grade_calc": ["weighted", "gpa"],
        "goal_tracker": ["simple", "milestones", "hours", "okr"],
    ]

    /// `dressWithCatalogueSkin`: give a catalogued skin the two things the base
    /// face could not know — its own name as the eyebrow, and its named
    /// details (`skinStates[skin].details`). The grammars with a header of
    /// their own (rows, columns, grid, bars, chips, lines, chain, split,
    /// clock) take the name when they have none; a single reading (metric,
    /// gauge, boolean, text, note, chart, stars) never does.
    static func dressed(_ model: RestingFaceModel, type: String, data: JSONObject) -> RestingFaceModel {
        guard let definition = WidgetRegistry.definition(for: type),
              let worn = data.string("skin") ?? data.string("mode"),
              !(undressedSkins[type]?.contains(worn) ?? false),
              let skin = definition.skins.first(where: { $0.value == worn }) else { return model }
        let name = RestText.compact(skin.label, 20)
        let details = skinDetails(data, skin: worn)
        switch model {
        case .icon:
            if details.isEmpty { return model }
            return .rows(rows: details, overflow: 0, eyebrow: RestEyebrow(label: name))
        case .rows(let rows, let overflow, let eyebrow, let meter):
            let room = RestingFaceMeasure.rowLimit - rows.count
            let merged = !details.isEmpty && room > 0 ? rows + details.prefix(room) : rows
            return .rows(rows: merged, overflow: overflow, eyebrow: eyebrow ?? RestEyebrow(label: name), meter: meter)
        default:
            return model.wearingEyebrow(RestEyebrow(label: name))
        }
    }

    /// `skinDetails`: the user-named fields a schema-extension skin keeps in
    /// its own pocket, as muted rows.
    static func skinDetails(_ data: JSONObject, skin: String) -> [RestRow] {
        let details = data.skinState(skin).recordList("details")
        var rows: [RestRow] = []
        for (index, detail) in details.enumerated() {
            let name = detail.trimmedStr("name")
            let raw = detail.trimmedStr("value")
            if name.isEmpty, raw.isEmpty { continue }
            rows.append(RestRow(key: "detail-\(index)", label: RestText.compact(name.isEmpty ? "Detail" : name, 20), value: RestText.compact(raw.isEmpty ? "—" : raw, 16), tone: .muted))
            if rows.count >= RestingFaceMeasure.rowLimit { break }
        }
        return rows
    }

    // MARK: - Shared readings

    /// `new Date().toISOString().slice(0, 10)`: today's UTC calendar day.
    static func todayISO() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    /// Clip a line without collapsing its whitespace (indentation is half of
    /// what makes a snippet legible): `trimmed.length > limit ? slice + '…'`.
    static func clip(_ line: String, _ limit: Int) -> String {
        let trimmed = String(line.reversed().drop(while: { $0 == " " || $0 == "\t" }).reversed())
        guard trimmed.count > limit else { return trimmed }
        let head = String(trimmed.prefix(limit - 1))
        return String(head.reversed().drop(while: { $0 == " " || $0 == "\t" }).reversed()) + "…"
    }

    /// Puts text on the system pasteboard (the web's `navigator.clipboard`).
    static func copyToPasteboard(_ text: String) {
        #if canImport(AppKit)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        #elseif canImport(UIKit)
        UIPasteboard.general.string = text
        #endif
    }
}

#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// MARK: - Shared controls for this family

/// The one-line note a skin the port draws as the primary arrangement wears.
struct NotesSkinNote: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(GlassType.label).foregroundStyle(.secondary)
    }
}

/// A numeric field that parses the way the web's `parseFloat` inputs do and
/// hands the parsed number to its owner (which clamps). Non-numeric text
/// reads as 0, like `readNumber` in the grade renderers.
struct CardNumberField: View {
    let label: String
    let value: Double
    let onCommit: (Double) -> Void
    var width: CGFloat = 56

    init(_ label: String, value: Double, width: CGFloat = 56, onCommit: @escaping (Double) -> Void) {
        self.label = label
        self.value = value
        self.width = width
        self.onCommit = onCommit
    }

    var body: some View {
        CardTextField(label, text: JavaScript.numberString(value)) { next in
            let parsed = JavaScript.parseFloat(next)
            onCommit(parsed.isFinite ? parsed : 0)
        }
        .frame(width: width)
        .multilineTextAlignment(.trailing)
    }
}

/// A text button in the flow (no solo island, Article XIX): the family's
/// "Add …" controls and short verbs.
struct FlowButton: View {
    let title: String
    let symbol: String?
    let accent: Color
    let action: () -> Void

    init(_ title: String, symbol: String? = nil, accent: Color, action: @escaping () -> Void) {
        self.title = title
        self.symbol = symbol
        self.accent = accent
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            if let symbol {
                Label(title, systemImage: symbol).font(GlassType.body).foregroundStyle(accent)
            } else {
                Text(title).font(GlassType.body).foregroundStyle(accent)
            }
        }
        .buttonStyle(.plain)
        .touchTarget()
    }
}

/// A round check the family's lists share (milestones, actions): 44 pt, the
/// state word is in its label, never inside it.
struct RoundCheckButton: View {
    let done: Bool
    let label: String
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(done ? accent : Color.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(done ? .isSelected : [])
        .touchTarget()
    }
}

extension JSONObject {
    /// `dataWithSkinState`-style write into one skin's pocket, in place:
    /// `skinStates[skin]` is created when missing and removed when the
    /// mutation leaves it empty; `skinStates` itself goes when it empties.
    mutating func patchSkinState(_ skin: String, _ mutate: (inout JSONObject) -> Void) {
        var states = object("skinStates") ?? JSONObject()
        var state = states.object(skin) ?? JSONObject()
        mutate(&state)
        if state.isEmpty { _ = states.removeValue(forKey: skin) } else { states[skin] = .object(state) }
        if states.isEmpty { _ = removeValue(forKey: "skinStates") } else { self["skinStates"] = .object(states) }
    }

    /// Drops `key` from an object-valued slot of every skin pocket (the
    /// "removing an item takes its extras with it" rule the family shares).
    mutating func removeFromEverySkinPocket(id: String, in keys: [String]) {
        guard let states = object("skinStates") else { return }
        for skin in states.keys {
            patchSkinState(skin) { state in
                for key in keys {
                    guard var held = state.object(key) else { continue }
                    _ = held.removeValue(forKey: id)
                    if held.isEmpty { _ = state.removeValue(forKey: key) } else { state[key] = .object(held) }
                }
            }
        }
    }
}
