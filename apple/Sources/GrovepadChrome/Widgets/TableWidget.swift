import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Table (`components/widgets/modules/TableWidget.tsx`, `tableSkinModel.ts`,
// `restingFaces/table.ts`). One sheet of strings — `rows[0]` the headers —
// read eight ways; the skin field is `skin`. Every write is `{ ...data, rows }`
// (`commitRows`): a cell edit rewrites its row, rows and columns are added
// or removed whole, the header row can never be removed.
//
// Ported skins: grid, compact_ledger (the grid with its Σ line), cards (one
// stack per record). database, kanban, gallery, form_view and pivot render
// the grid with a note and read their pockets for the folded face only.
// ---------------------------------------------------------------------------

public struct TableWidget: WidgetRenderer {
    public static let type = "table"
    static let skins: Set<String> = ["grid", "compact_ledger", "cards", "database", "kanban", "gallery", "form_view", "pivot"]

    public init() {}

    static func skin(_ data: JSONObject) -> String {
        let raw = data.str("skin")
        return skins.contains(raw) ? raw : "grid"
    }

    /// `sheetRows`: every array row, every non-string cell read as "".
    static func rows(_ data: JSONObject) -> [[String]] {
        (data.array("rows") ?? []).compactMap { $0.arrayValue }.map { row in row.map { $0.stringValue ?? "" } }
    }

    static func columnCount(_ rows: [[String]]) -> Int { max(1, rows.map(\.count).max() ?? 0) }

    /// `normalizedTableRows`: a rectangle, blank headers named.
    static func normalized(_ rows: [[String]]) -> [[String]] {
        let count = columnCount(rows)
        let source = rows.isEmpty ? [[]] : rows
        return source.enumerated().map { rowIndex, row in
            (0..<count).map { column in
                let value = column < row.count ? row[column] : ""
                return rowIndex == 0 && JavaScript.trim(value).isEmpty ? "Column \(column + 1)" : value
            }
        }
    }

    static func headers(_ rows: [[String]]) -> [String] { normalized(rows)[0] }

    struct Record { var cells: [String], sourceIndex: Int }

    static func records(_ rows: [[String]]) -> [Record] {
        normalized(rows).dropFirst().enumerated().map { index, cells in Record(cells: cells, sourceIndex: index + 1) }
    }

    /// `numericCell`: a number with its thousands commas dropped, or nil.
    static func numeric(_ raw: String) -> Double? {
        let value = JavaScript.trim(raw)
        if value.isEmpty { return nil }
        let parsed = Double(value.replacingOccurrences(of: ",", with: ""))
        return parsed?.isFinite == true ? parsed : nil
    }

    /// The last column that reads as numbers — the one a ledger sums.
    static func numericColumn(_ records: [Record], columnCount: Int) -> Int {
        for index in stride(from: columnCount - 1, through: 0, by: -1) {
            let values = records.map { JavaScript.trim(index < $0.cells.count ? $0.cells[index] : "") }.filter { !$0.isEmpty }
            if !values.isEmpty, values.allSatisfy({ numeric($0) != nil }) { return index }
        }
        return -1
    }

    static func cellText(_ record: Record, _ index: Int, fallback: String = "—") -> String {
        let value = JavaScript.trim(index < record.cells.count ? record.cells[index] : "")
        return RestText.compact(value.isEmpty ? fallback : value, 18)
    }

    static func write(_ context: WidgetCardContext, _ rows: [[String]]) {
        context.update { $0["rows"] = .array(rows.map { .array($0.map { .string($0) }) }) }
    }

    public func cardBody(_ context: WidgetCardContext) -> some View {
        let data = context.data
        let skin = TableWidget.skin(data)
        let rows = TableWidget.rows(data)
        let columns = TableWidget.columnCount(rows)
        let accent = Color(hex: context.accent)
        let setCell = { (row: Int, column: Int, value: String) in
            var next = rows
            while next.count <= row { next.append([]) }
            while next[row].count <= column { next[row].append("") }
            next[row][column] = value
            TableWidget.write(context, next)
        }
        return VStack(alignment: .leading, spacing: 4) {
            if !["grid", "compact_ledger", "cards"].contains(skin) {
                SkinNote("Shown as the grid — the \(skin.replacingOccurrences(of: "_", with: " ")) skin arrives later.")
            }
            Group {
                if skin == "cards" {
                    let headers = TableWidget.headers(rows)
                    // Cards wrap onto new rows instead of running off the side.
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8, alignment: .top)], alignment: .leading, spacing: 8) {
                        ForEach(TableWidget.records(rows), id: \.sourceIndex) { record in
                            Island(padding: 8) {
                                VStack(alignment: .leading, spacing: 2) {
                                    ForEach(0..<columns, id: \.self) { column in
                                        GlassLabel(headers[column])
                                        CardTextField(headers[column], text: column < record.cells.count ? record.cells[column] : "") { setCell(record.sourceIndex, column, $0) }
                                    }
                                    RowDeleteButton(label: "Remove record") { TableWidget.write(context, rows.enumerated().filter { $0.offset != record.sourceIndex }.map(\.element)) }
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                    }
                } else {
                    Grid(alignment: .leading, horizontalSpacing: 6, verticalSpacing: 0) {
                        ForEach(0..<max(1, rows.count), id: \.self) { rowIndex in
                            GridRow {
                                ForEach(0..<columns, id: \.self) { column in
                                    let value = rowIndex < rows.count && column < rows[rowIndex].count ? rows[rowIndex][column] : ""
                                    CardTextField(rowIndex == 0 ? "Column \(column + 1)" : "Row \(rowIndex), column \(column + 1)", text: value) { setCell(rowIndex, column, $0) }
                                        .font(rowIndex == 0 ? GlassType.label : GlassType.body)
                                        .foregroundStyle(rowIndex == 0 ? Color.secondary : Color.primary)
                                        .frame(minWidth: 36, maxWidth: .infinity, alignment: .leading)
                                }
                                if rowIndex == 0 {
                                    GhostButton("rectangle.split.3x1", label: "Remove the last column") {
                                        guard columns >= 2 else { return }
                                        TableWidget.write(context, rows.map { row in Array(row.prefix(columns - 1)) })
                                    }
                                } else {
                                    RowDeleteButton(label: "Remove row \(rowIndex)") { TableWidget.write(context, rows.enumerated().filter { $0.offset != rowIndex }.map(\.element)) }
                                }
                            }
                            if rowIndex == 0 { Divider().gridCellUnsizedAxes(.horizontal) }
                        }
                    }
                }
            }
            if skin == "compact_ledger" {
                let records = TableWidget.records(rows)
                let column = TableWidget.numericColumn(records, columnCount: columns)
                if column >= 0 {
                    let total = records.reduce(0.0) { $0 + (TableWidget.numeric(column < $1.cells.count ? $1.cells[column] : "") ?? 0) }
                    HStack { GlassLabel("Σ \(TableWidget.headers(rows)[column])"); Spacer(); Text(RestText.number(total)).font(GlassType.value).foregroundStyle(accent) }
                }
            }
            HStack(spacing: 8) {
                Button { TableWidget.write(context, rows + [Array(repeating: "", count: columns)]) } label: {
                    Label("Add row", systemImage: "plus").font(GlassType.body).foregroundStyle(accent)
                }
                .buttonStyle(.plain).touchTarget()
                Button { TableWidget.write(context, (rows.isEmpty ? [[]] : rows).map { $0 + [""] }) } label: {
                    Label("Add column", systemImage: "plus.rectangle").font(GlassType.body).foregroundStyle(accent)
                }
                .buttonStyle(.plain).touchTarget()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        WidgetRestingFaceView(context: context)
    }

    /// `tableRestingFace`: a sheet rests as a header-bearing text grid (three
    /// columns, four records); a pivot as bars of its groups; a board and the
    /// record cards as columns; the ledger as lines with its Σ.
    public func restingFace(_ widget: Widget) -> RestingFaceModel {
        let data = widget.data
        let rows = TableWidget.rows(data)
        let records = TableWidget.records(rows)
        if records.isEmpty { return .icon }
        let headers = TableWidget.headers(rows)
        let skin = TableWidget.skin(data)
        let states = data.object("skinStates") ?? JSONObject()
        let limit = RestingFaceMeasure.rowLimit
        switch skin {
        case "pivot":
            let state = states.object("pivot") ?? JSONObject()
            let groupBy = min(headers.count - 1, max(0, Int(state.finite("groupBy") ?? 0)))
            let valueColumn = min(headers.count - 1, max(0, Int(state.finite("valueColumn") ?? Double(min(1, headers.count - 1)))))
            let aggregation = ["count", "sum", "average"].contains(state.str("aggregation")) ? state.str("aggregation") : "count"
            var order: [String] = []
            var groups: [String: (count: Int, values: [Double])] = [:]
            for record in records {
                let raw = JavaScript.trim(groupBy < record.cells.count ? record.cells[groupBy] : "")
                let label = raw.isEmpty ? "Unassigned" : raw
                if groups[label] == nil { order.append(label); groups[label] = (0, []) }
                groups[label]!.count += 1
                if let value = TableWidget.numeric(valueColumn < record.cells.count ? record.cells[valueColumn] : "") { groups[label]!.values.append(value) }
            }
            let results = order.map { label -> (label: String, value: Double) in
                let group = groups[label]!
                let sum = group.values.reduce(0, +)
                let value = aggregation == "count" ? Double(group.count) : aggregation == "average" ? (group.values.isEmpty ? 0 : sum / Double(group.values.count)) : sum
                return (label, value)
            }.sorted { $0.value > $1.value }.prefix(RestingFaceMeasure.barLimit)
            let peak = max(1, results.map { abs($0.value) }.max() ?? 1)
            return .bars(bars: results.enumerated().map { index, result in
                RestBar(key: "\(result.label)-\(index)", label: RestText.compact(result.label, 20), value: RestText.number(jsRound(result.value * 10) / 10), fraction: abs(result.value) / peak)
            }, eyebrow: RestEyebrow(label: "Pivot", note: RestText.compact(headers[groupBy], 14)))
        case "kanban":
            let state = states.object("kanban") ?? JSONObject()
            let groupBy = min(headers.count - 1, max(0, Int(state.finite("groupBy") ?? Double(headers.count - 1))))
            var order: [String] = []
            var groups: [String: [Record]] = [:]
            for record in records {
                let raw = JavaScript.trim(groupBy < record.cells.count ? record.cells[groupBy] : "")
                let label = raw.isEmpty ? "Unassigned" : raw
                if groups[label] == nil { order.append(label) }
                groups[label, default: []].append(record)
            }
            return .columns(columns: order.prefix(4).enumerated().map { index, label in
                let members = groups[label] ?? []
                let visible = members.prefix(RestingFaceMeasure.columnItemLimit)
                return RestColumn(
                    key: "\(label)-\(index)", label: RestText.compact(label, 14), note: String(members.count),
                    items: visible.map { RestRow(key: "row-\($0.sourceIndex)", label: TableWidget.cellText($0, 0, fallback: "Untitled")) },
                    overflow: max(0, members.count - visible.count)
                )
            }, eyebrow: RestEyebrow(label: "Board", note: RestText.compact(headers[groupBy], 14)))
        case "cards":
            // Each record folds to the card it already is: its name over its
            // first couple of fields, standing beside the other records.
            return .columns(columns: records.prefix(3).map { record in
                RestColumn(
                    key: "record-\(record.sourceIndex)", label: TableWidget.cellText(record, 0, fallback: "Untitled record"),
                    items: headers.dropFirst().prefix(RestingFaceMeasure.columnItemLimit).enumerated().map { index, header in
                        RestRow(key: "field-\(index)", label: RestText.compact(header, 12), value: TableWidget.cellText(record, index + 1))
                    },
                    overflow: max(0, headers.count - 1 - RestingFaceMeasure.columnItemLimit)
                )
            }, eyebrow: RestEyebrow(label: "Records", note: String(records.count)))
        case "gallery":
            let state = states.object("gallery") ?? JSONObject()
            let titleColumn = min(headers.count - 1, max(0, Int(state.finite("titleColumn") ?? 0)))
            let visible = Array(records.prefix(RestingFaceMeasure.cellLimit))
            return .chips(chips: visible.map { record in RestChip(key: "tile-\(record.sourceIndex)", text: TableWidget.cellText(record, titleColumn, fallback: "Untitled"), filled: true) }, overflow: max(0, records.count - visible.count), eyebrow: RestEyebrow(label: "Gallery", note: String(records.count)))
        case "form_view":
            let state = states.object("form_view") ?? JSONObject()
            let selected = min(records.count - 1, max(0, Int(state.finite("selectedRecord") ?? 0)))
            let record = records[selected]
            let visible = Array(headers.prefix(limit))
            return .rows(rows: visible.enumerated().map { index, header in
                RestRow(key: "field-\(index)", label: RestText.compact(header, 20), value: TableWidget.cellText(record, index))
            }, overflow: max(0, headers.count - visible.count), eyebrow: RestEyebrow(label: "Record", note: "\(selected + 1)/\(records.count)"))
        case "compact_ledger":
            // A ledger is its numbers and their sum: the row numbers and the Σ
            // line are the whole reason someone reaches for this skin.
            let column = TableWidget.numericColumn(records, columnCount: headers.count)
            let visible = Array(records.prefix(RestingFaceMeasure.lineLimit))
            let total = column < 0 ? nil : records.reduce(0.0) { $0 + (TableWidget.numeric(column < $1.cells.count ? $1.cells[column] : "") ?? 0) }
            return .lines(
                lines: visible.enumerated().map { index, record in
                    RestLine(key: "row-\(record.sourceIndex)", left: "\(String(format: "%02d", index + 1))  \(TableWidget.cellText(record, 0, fallback: "Untitled"))", right: column < 0 ? nil : TableWidget.cellText(record, column))
                },
                eyebrow: RestEyebrow(label: "Ledger", note: "\(records.count) rows"),
                mono: true,
                total: total.map { RestLine(key: "total", left: "Σ", right: RestText.number($0), tone: .accent) }
            )
        default:
            var ordered = records
            var eyebrow = RestEyebrow(label: "Table", note: "\(records.count)×\(headers.count)")
            if skin == "database" {
                let state = states.object("database") ?? JSONObject()
                let query = JavaScript.trim(state.str("query")).lowercased()
                if !query.isEmpty { ordered = ordered.filter { $0.cells.contains { $0.lowercased().contains(query) } } }
                let sortColumn = min(headers.count - 1, max(0, Int(state.finite("sortColumn") ?? 0)))
                let direction: Double = state.str("sortDirection") == "desc" ? -1 : 1
                let numericSort = ordered.allSatisfy { record in
                    let cell = JavaScript.trim(sortColumn < record.cells.count ? record.cells[sortColumn] : "")
                    return cell.isEmpty || TableWidget.numeric(cell) != nil
                }
                ordered.sort { left, right in
                    let a = sortColumn < left.cells.count ? left.cells[sortColumn] : ""
                    let b = sortColumn < right.cells.count ? right.cells[sortColumn] : ""
                    if numericSort {
                        return ((TableWidget.numeric(a) ?? -.infinity) - (TableWidget.numeric(b) ?? -.infinity)) * direction < 0
                    }
                    let compared = a.compare(b, options: [.caseInsensitive, .numeric])
                    return direction > 0 ? compared == .orderedAscending : compared == .orderedDescending
                }
                eyebrow = RestEyebrow(label: "Database", note: query.isEmpty ? "\(ordered.count) of \(records.count)" : "“\(RestText.compact(state.str("query"), 10))”")
            }
            // The sheet's own lattice: `FACE_COLUMNS` × `FACE_ROWS`, the first
            // column the record's name.
            let columnCount = min(TableWidget.faceColumns, headers.count)
            var cells: [RestCell] = []
            for record in ordered.prefix(TableWidget.faceRows) {
                for column in 0..<columnCount {
                    cells.append(RestCell(key: "\(record.sourceIndex)-\(column)", text: TableWidget.cellText(record, column, fallback: "—"), tone: column == 0 ? nil : .muted))
                }
            }
            return .grid(cols: columnCount, cells: cells, eyebrow: eyebrow, header: headers.prefix(columnCount).map { RestText.compact($0, 14) }, dense: false)
        }
    }

    static let faceColumns = 3
    static let faceRows = 4
}
