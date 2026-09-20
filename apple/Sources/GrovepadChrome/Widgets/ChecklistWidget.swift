import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Tasks (`components/widgets/modules/TasksWidget.tsx`, `taskSkinModel.ts`,
// `restingFaces/tasks.ts`). One task collection, thirteen skins; the skin
// field is `mode`. This port renders the LIST arrangement for every skin —
// board, week, timeline, matrix and the rest arrive as arrangements in
// phase 8 — and every skin already keeps its own eyebrow. Toggling a task
// writes `status` and `done` together (`itemWithStatus`); adding goes through
// the `add_item` command so a tap and a wire append the same record.
// ---------------------------------------------------------------------------

public struct ChecklistWidget: WidgetRenderer {
    public static let type = "checklist"
    static let eyebrows: [String: String] = [
        "list": "Tasks", "inbox": "Inbox", "shopping": "Shopping", "assignments": "Assignments", "day": "Today",
        "week": "This week", "board": "Board", "timeline": "Timeline", "matrix": "Priorities", "recurring": "Recurring",
        "sprint": "Sprint", "dependencies": "Dependencies", "routine": "Routine",
    ]
    static let spatialSkins: Set<String> = ["week", "board", "timeline", "matrix", "sprint"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("mode")
        return eyebrows[raw] == nil ? "list" : raw
    }

    static func isDone(_ item: JSONObject) -> Bool { item.bool("done") == true }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = ChecklistWidget.skin(data)
        let items = data.recordList("items")
        let done = items.filter(ChecklistWidget.isDone).count
        let accent = Color(hex: context.accent)
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                GlassLabel(ChecklistWidget.eyebrows[skin] ?? "Tasks")
                Text("\(done)/\(items.count)").font(GlassType.label).monospacedDigit().foregroundStyle(.secondary)
            }
            if skin != "list" {
                Text("Shown as a list — the \(ChecklistWidget.eyebrows[skin] ?? skin) arrangement arrives in phase 8.")
                    .font(GlassType.label).foregroundStyle(.secondary)
            }
            ForEach(items, id: \.["id"]) { item in
                let id = item.str("id")
                let isDone = ChecklistWidget.isDone(item)
                HStack(spacing: 8) {
                    Button {
                        // `setStatus(id, item.done ? 'todo' : 'done')` → itemWithStatus
                        context.update { data in
                            data.patchRecord(in: "items", id: id) { record in
                                record["status"] = .string(isDone ? "todo" : "done")
                                record["done"] = .bool(!isDone)
                            }
                        }
                    } label: {
                        Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(isDone ? accent : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isDone ? "Mark not done" : "Mark done")
                    .touchTarget()
                    CardTextField("Task", text: item.str("label")) { next in
                        context.update { $0.patchRecord(in: "items", id: id) { $0["label"] = .string(next) } }
                    }
                    .strikethrough(isDone)
                    RowDeleteButton(label: "Remove task") {
                        context.update { $0.removeRecord(in: "items", id: id) }
                    }
                }
            }
            Button { context.runCommand("add_item") } label: {
                Label("Add task", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
            }
            .buttonStyle(.plain)
            .touchTarget()
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// The list face: the skin's eyebrow with the done count, a meter, and
    /// the first rows with their done glyphs. An empty card rests as its icon.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let items = data.recordList("items")
        if items.isEmpty { return .icon }
        let skin = ChecklistWidget.skin(data)
        let done = items.filter(ChecklistWidget.isDone).count
        let visible = items.prefix(RestingFaceMeasure.rowLimit)
        let rows = visible.map { item in
            let label = item.trimmedStr("label")
            return RestRow(key: item.str("id"), label: RestText.compact(label.isEmpty ? "Untitled task" : label, 30), done: ChecklistWidget.isDone(item))
        }
        return .rows(
            rows: rows,
            overflow: max(0, items.count - rows.count),
            eyebrow: RestEyebrow(label: ChecklistWidget.eyebrows[skin] ?? "Tasks", note: "\(done)/\(items.count)"),
            meter: Double(done) / Double(items.count)
        )
    }
}
