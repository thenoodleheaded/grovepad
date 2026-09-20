import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The resting-face grammar (`utils/restingFaceModel.ts`, `utils/restingFace.ts`).
//
// A resting face is the widget's information drawn as itself, in exactly the
// pixels that information needs; content decides the tile, the tile never
// decides how much content fits. One card can wear many skins, and a folded
// card must still look like the skin it is wearing, so every skin picks one
// of the grammars below and fills it with its own reading: the grammar
// decides the shape, the widget's skin model decides the words.
//
// Every grammar is BOUNDED by construction: the builders clamp rows, columns,
// cells, marks and characters before the model exists, so a card holding ten
// thousand rows costs exactly what a card with six rows costs.
//
// SIZES ARE ESTIMATES. The web measures face text with a canvas 2D context;
// Swift measures with a fixed 6.2 pt-per-character estimate, so tiles are
// deterministic and snapped to the 40 pt grid but not pixel-identical to the
// web. Tile size is view state, never document state, so no bytes depend on it
// (see apple/AGENTS.md, "Deferred from the first pass").
//
// Not ported: `palette`, `image`, `timeline` and `paper` — no in-scope widget
// folds to them.
// ---------------------------------------------------------------------------

public enum RestTone: String, Equatable, Hashable, Sendable {
    case neutral, accent, muted, good, warn, bad
}

public struct RestEyebrow: Equatable, Hashable, Sendable {
    public var label: String
    public var note: String?
    public var tone: RestTone?

    public init(label: String, note: String? = nil, tone: RestTone? = nil) {
        self.label = label
        self.note = note
        self.tone = tone
    }
}

public struct RestRow: Equatable, Hashable, Sendable {
    public var key: String
    public var label: String
    /// Tri-state: nil = the item has no completion concept.
    public var done: Bool?
    /// Right-aligned trailing value.
    public var value: String?
    /// A small leading label (a step number, a rank, a "?").
    public var lead: String?
    /// The open card's own bullet, for lists whose rows are marked rather than checked.
    public var marker: Bool
    /// Outline depth.
    public var indent: Int
    public var tone: RestTone?

    public init(key: String, label: String, done: Bool? = nil, value: String? = nil, lead: String? = nil, marker: Bool = false, indent: Int = 0, tone: RestTone? = nil) {
        self.key = key
        self.label = label
        self.done = done
        self.value = value
        self.lead = lead
        self.marker = marker
        self.indent = indent
        self.tone = tone
    }
}

/// A lane of cards: a board column, a sprint lane, a matrix quadrant.
public struct RestColumn: Equatable, Hashable, Sendable {
    public var key: String
    public var label: String
    /// The small right-hand reading in the expanded column header.
    public var note: String?
    public var tone: RestTone?
    public var items: [RestRow]
    public var overflow: Int

    public init(key: String, label: String, note: String? = nil, tone: RestTone? = nil, items: [RestRow], overflow: Int = 0) {
        self.key = key
        self.label = label
        self.note = note
        self.tone = tone
        self.items = items
        self.overflow = overflow
    }
}

public struct RestCell: Equatable, Hashable, Sendable {
    public var key: String
    public var text: String
    public var tone: RestTone?
    /// 0–1 intensity for heatmap-style grids; nil when the cell is not filled.
    public var fill: Double?
    /// Marks the cell the expanded card would ring (today, the current step).
    public var current: Bool

    public init(key: String, text: String, tone: RestTone? = nil, fill: Double? = nil, current: Bool = false) {
        self.key = key
        self.text = text
        self.tone = tone
        self.fill = fill
        self.current = current
    }
}

/// A labelled horizontal bar: standings, weights, budgets, key results.
public struct RestBar: Equatable, Hashable, Sendable {
    public var key: String
    public var label: String
    public var value: String
    /// 0–1 of the track.
    public var fraction: Double
    public var tone: RestTone?

    public init(key: String, label: String, value: String, fraction: Double, tone: RestTone? = nil) {
        self.key = key
        self.label = label
        self.value = value
        self.fraction = fraction
        self.tone = tone
    }
}

public struct RestChip: Equatable, Hashable, Sendable {
    public var key: String
    public var text: String
    public var tone: RestTone?
    public var filled: Bool

    public init(key: String, text: String, tone: RestTone? = nil, filled: Bool = false) {
        self.key = key
        self.text = text
        self.tone = tone
        self.filled = filled
    }
}

/// One ledger line: entry on the left, its value right-aligned.
public struct RestLine: Equatable, Hashable, Sendable {
    public var key: String
    public var left: String
    public var right: String?
    public var tone: RestTone?
    public var dim: Bool

    public init(key: String, left: String, right: String? = nil, tone: RestTone? = nil, dim: Bool = false) {
        self.key = key
        self.left = left
        self.right = right
        self.tone = tone
        self.dim = dim
    }
}

/// One node of a chain: a pipeline stage, a derivation step.
public struct RestNode: Equatable, Hashable, Sendable {
    public var key: String
    public var label: String
    public var caption: String?
    public var current: Bool

    public init(key: String, label: String, caption: String? = nil, current: Bool = false) {
        self.key = key
        self.label = label
        self.caption = caption
        self.current = current
    }
}

/// One side of a split: a reading over what it means.
public struct RestReadout: Equatable, Hashable, Sendable {
    public var primary: String
    public var secondary: String
    public var tone: RestTone?

    public init(primary: String, secondary: String, tone: RestTone? = nil) {
        self.primary = primary
        self.secondary = secondary
        self.tone = tone
    }
}

/// One readout on a chart's rail: Now, Change, Peak.
public struct RestStat: Equatable, Hashable, Sendable {
    public var label: String
    public var value: String

    public init(label: String, value: String) {
        self.label = label
        self.value = value
    }
}

public enum RestBooleanShape: String, Equatable, Hashable, Sendable {
    case `switch`, checkbox, power
}

/// `dial` keeps the card-outline bezel; the rest lay the readout out the way
/// their own mode does.
public enum RestClockShape: String, Equatable, Hashable, Sendable {
    case dial, hourglass, intervals, laps, stages
}

/// The connector carries the meaning: one arrow for a forward link, two for a
/// doubly-linked one, a returning arrow for a ring, a spine for a stack.
public enum RestChainShape: String, Equatable, Hashable, Sendable {
    case linear, doubly, circular, stack
}

public enum RestingFaceModel: Equatable, Hashable, Sendable {
    /// Nothing to show: a bare icon cell.
    case icon
    /// The Note page, drawn at a fixed fraction of the open card (no summary).
    case note(skin: String)
    case rows(rows: [RestRow], overflow: Int, eyebrow: RestEyebrow? = nil, meter: Double? = nil)
    case boolean(label: String, active: Bool, shape: RestBooleanShape, tone: RestTone? = nil)
    case metric(primary: String, secondary: String, progress: Double? = nil, eyebrow: RestEyebrow? = nil, tone: RestTone? = nil)
    /// A short run of the words themselves, clamped to six lines.
    case text(text: String, tint: String? = nil)
    /// A LIVE face: the ticking readout is read at paint time from the
    /// widget's own clock pocket (a resting bitmap holds the instant it was
    /// folded); everything around it is static context.
    case clock(shape: RestClockShape = .dial, eyebrow: RestEyebrow? = nil, chips: [RestChip] = [], rows: [RestRow] = [])
    /// A real plot with readouts stacked down a rail on its right. `series`
    /// absent means the renderer reads the widget's own bars/points/segments
    /// (the Chart family's shape); present is a history kept in another shape.
    case chart(stats: [RestStat], series: [Double]? = nil)
    case stars(value: Double)
    /// Side-by-side lanes of cards. `wrap` folds the lanes into rows, which is
    /// how a 2×2 matrix keeps being a matrix.
    case columns(columns: [RestColumn], wrap: Int? = nil, eyebrow: RestEyebrow? = nil)
    /// A lattice of small cells. `dense` cells are square and carry their
    /// reading as a fill (calendars, heatmaps, tallies); a text grid is a
    /// table whose first column takes the extra width. The port's default is
    /// dense because every existing caller means the square lattice.
    case grid(cols: Int, cells: [RestCell], eyebrow: RestEyebrow? = nil, header: [String]? = nil, dense: Bool = true)
    /// Labelled horizontal bars: standings, weights, budgets, rota loads.
    case bars(bars: [RestBar], eyebrow: RestEyebrow? = nil)
    /// A dial: goal rings, percentages, confidence, countdown sweeps.
    case gauge(progress: Double, primary: String, secondary: String, caption: String? = nil, tone: RestTone? = nil, eyebrow: RestEyebrow? = nil)
    case chips(chips: [RestChip], overflow: Int, eyebrow: RestEyebrow? = nil)
    /// Right-aligned ledger lines: calculator tape, terminals, histories.
    case lines(lines: [RestLine], eyebrow: RestEyebrow? = nil, mono: Bool = false, total: RestLine? = nil)
    /// Connected nodes: pipelines, step chains, derivation ladders.
    case chain(nodes: [RestNode], shape: RestChainShape, overflow: Int, eyebrow: RestEyebrow? = nil)
    /// Two readings that only mean something next to each other.
    case split(left: RestReadout, right: RestReadout, divider: String? = nil, eyebrow: RestEyebrow? = nil)
    /// A door into another canvas; the renderer reads the far side.
    case canvas(skin: String, subtitle: String? = nil)

    public var isIcon: Bool { if case .icon = self { return true } else { return false } }

    /// The grammar's name, as the web spells `kind`.
    public var kind: String {
        switch self {
        case .icon: return "icon"
        case .note: return "note"
        case .rows: return "rows"
        case .boolean: return "boolean"
        case .metric: return "metric"
        case .text: return "text"
        case .clock: return "clock"
        case .chart: return "chart"
        case .stars: return "stars"
        case .columns: return "columns"
        case .grid: return "grid"
        case .bars: return "bars"
        case .gauge: return "gauge"
        case .chips: return "chips"
        case .lines: return "lines"
        case .chain: return "chain"
        case .split: return "split"
        case .canvas: return "canvas"
        }
    }

    /// The eyebrow the model wears, for the grammars that take a heading.
    public var eyebrow: RestEyebrow? {
        switch self {
        case .rows(_, _, let eyebrow, _), .metric(_, _, _, let eyebrow, _), .clock(_, let eyebrow, _, _),
             .columns(_, _, let eyebrow), .grid(_, _, let eyebrow, _, _), .bars(_, let eyebrow),
             .gauge(_, _, _, _, _, let eyebrow), .chips(_, _, let eyebrow), .lines(_, let eyebrow, _, _),
             .chain(_, _, _, let eyebrow), .split(_, _, _, let eyebrow):
            return eyebrow
        case .icon, .note, .boolean, .text, .chart, .stars, .canvas:
            return nil
        }
    }

    /// `dressWithCatalogueSkin`'s heading rule: the grammars with a header of
    /// their own take the skin's name when they have none; a single reading
    /// (metric, gauge, boolean, text, note, chart, stars) never does.
    public func wearingEyebrow(_ eyebrow: RestEyebrow) -> RestingFaceModel {
        switch self {
        case .columns(let columns, let wrap, nil): return .columns(columns: columns, wrap: wrap, eyebrow: eyebrow)
        case .grid(let cols, let cells, nil, let header, let dense): return .grid(cols: cols, cells: cells, eyebrow: eyebrow, header: header, dense: dense)
        case .bars(let bars, nil): return .bars(bars: bars, eyebrow: eyebrow)
        case .chips(let chips, let overflow, nil): return .chips(chips: chips, overflow: overflow, eyebrow: eyebrow)
        case .lines(let lines, nil, let mono, let total): return .lines(lines: lines, eyebrow: eyebrow, mono: mono, total: total)
        case .chain(let nodes, let shape, let overflow, nil): return .chain(nodes: nodes, shape: shape, overflow: overflow, eyebrow: eyebrow)
        case .split(let left, let right, let divider, nil): return .split(left: left, right: right, divider: divider, eyebrow: eyebrow)
        case .clock(let shape, nil, let chips, let rows): return .clock(shape: shape, eyebrow: eyebrow, chips: chips, rows: rows)
        default: return self
        }
    }
}

/// `RestingFace`: the model and the exact tile it needs.
public struct RestingFace: Equatable, Sendable {
    public var model: RestingFaceModel
    public var size: Size

    public init(model: RestingFaceModel, size: Size) {
        self.model = model
        self.size = size
    }
}

// MARK: - Bounds and measurement

public enum RestingFaceMeasure {
    /// The clamps a face is built under. `.tile` is the canvas's (`REST_*_LIMIT`);
    /// `.homeScreen` is the roomier set the OS widget snapshot builds with
    /// (`HomeWidgetSnapshotBuilder`), because a large home-screen widget holds
    /// twice the rows a resting tile does. Still bounded either way.
    public struct Limits: Equatable, Sendable {
        public var rows: Int
        public var columnItems: Int
        public var cells: Int
        public var bars: Int
        public var chips: Int
        public var lines: Int
        public var nodes: Int
        public var textClamp: Int
        public var textLines: Int

        public static let tile = Limits(rows: 6, columnItems: 3, cells: 42, bars: 4, chips: 8, lines: 5, nodes: 4, textClamp: 220, textLines: 6)
        public static let homeScreen = Limits(rows: 14, columnItems: 6, cells: 42, bars: 8, chips: 16, lines: 12, nodes: 6, textClamp: 1_200, textLines: 24)
    }

    /// Scoped with `$limits.withValue(.homeScreen) { … }`; the canvas never sets it.
    @TaskLocal public static var limits: Limits = .tile

    // Bounds (`REST_*_LIMIT`). Every builder clamps to these before a model exists.
    public static var rowLimit: Int { limits.rows }
    public static var columnItemLimit: Int { limits.columnItems }
    public static var cellLimit: Int { limits.cells }
    public static var barLimit: Int { limits.bars }
    public static var chipLimit: Int { limits.chips }
    public static var lineLimit: Int { limits.lines }
    public static var nodeLimit: Int { limits.nodes }
    /// Upper bound on marks a chart plots, whatever the series length (`SAMPLE_LIMIT`).
    public static let markSampleLimit = 24
    public static var textClamp: Int { limits.textClamp }
    public static var textLineLimit: Int { limits.textLines }
    public static let noteScale = 0.64
    public static let noteScaleSticky = 0.78
    public static let noteMinWidth = 120.0
    public static let noteMaxWidth = 320.0
    /// A folded Tasks card wears the same drawing a tenth smaller.
    public static let taskRestScale = 0.9

    // Layout constants shared with WidgetRestingFaceView — change together.
    static let restPadX = 12.0
    static let restRowHeight = 16.0
    static let restTextLineHeight = 14.0
    static let padY = 10.0
    static let overflowLine = 14.0
    static let rowGlyph = 16.0
    static let rowValueGap = 10.0
    static let rowIndent = 9.0
    static let minTile = CanvasGeometry.gridSize
    static let maxTileWidth = 240.0
    static let chartWidth = 140.0
    static let chartStatsWidth = 64.0
    static let starsWidth = 5 * 16.0 + 4 * 4.0 + restPadX * 2
    static let booleanSwitchWidth = 26.0
    // Skin grammars: a board, a month, or a chain is two-dimensional and gets
    // its own ceiling rather than the six-cell text one.
    static let maxWideTile = 360.0
    static let eyebrowHeight = 14.0
    static let columnHeader = 13.0
    static let columnItem = 13.0
    static let columnGap = 6.0
    static let columnMinWidth = 42.0
    static let columnMaxWidth = 96.0
    static let denseCell = 15.0
    static let denseGap = 2.0
    static let gridRowHeight = 14.0
    static let gridColGap = 8.0
    static let barRowHeight = 16.0
    static let barTrackWidth = 54.0
    static let gaugeDiameter = 46.0
    static let chipHeight = 17.0
    static let chipGap = 4.0
    static let chipPad = 12.0
    static let lineHeight = 13.0
    static let lineGap = 12.0
    static let nodeWidth = 46.0
    static let nodeConnector = 12.0
    static let nodeHeight = 30.0
    static let splitDivider = 22.0
    static let clockReadoutWidth = 92.0
    static let clockReadoutHeight = 28.0

    /// The fixed doorplate each canvas skin folds to (`CANVAS_TILES`).
    public static let canvasTiles: [String: Size] = [
        "portal": Size(width: CanvasGeometry.gridSize * 4, height: CanvasGeometry.gridSize * 2),
        "cover": Size(width: CanvasGeometry.gridSize * 5, height: CanvasGeometry.gridSize * 3),
        "live_thumbnail": Size(width: CanvasGeometry.gridSize * 5, height: CanvasGeometry.gridSize * 4),
    ]

    /// The one text estimate: a fixed width per character. Deterministic,
    /// not pixel-identical to the web's canvas measurement.
    public static let charWidth = 6.2

    public static func measure(_ text: String) -> Double {
        Double(text.count) * charWidth
    }

    /// Snap up to the full-cell lattice, never below one cell.
    public static func snap(_ value: Double) -> Double {
        max(minTile, (value / CanvasGeometry.gridSize).rounded(.up) * CanvasGeometry.gridSize)
    }

    /// `titleCapsuleWidth`: the grid-aligned width the floating title capsule
    /// needs, so a tile never renders narrower than its own identity.
    public static func titleCapsuleWidth(_ title: String) -> Double {
        let trimmed = JavaScript.trim(title)
        let text = measure(trimmed.isEmpty ? "Widget" : trimmed)
        let raw = 16.0 * 2 + 12 + 6 + text.rounded(.up) + 2
        return max(CanvasGeometry.gridSize * 2, (raw / CanvasGeometry.gridSize).rounded(.up) * CanvasGeometry.gridSize)
    }

    /// The eyebrow renders a size down, in caps, letter-spaced 0.11em.
    static func eyebrowWidth(_ eyebrow: RestEyebrow) -> Double {
        let label = eyebrow.label.uppercased()
        return measure(label) * 0.85 + Double(label.count) * 0.9 + (eyebrow.note.map { measure($0) * 0.9 + 10 } ?? 0)
    }

    private static func eyebrowWidth(_ eyebrow: RestEyebrow?) -> Double {
        eyebrow.map(eyebrowWidth) ?? 0
    }

    private static func eyebrowHeight(_ eyebrow: RestEyebrow?) -> Double {
        eyebrow == nil ? 0 : eyebrowHeight
    }

    /// The column widths a text grid lines its cells up on: each column as
    /// wide as its widest cell or header. Shared with the renderer so the
    /// drawn columns are the measured ones.
    static func gridColumnWidths(cols: Int, header: [String]?, cells: [RestCell]) -> [Double] {
        let columns = max(1, cols)
        var widths = [Double](repeating: 0, count: columns)
        if let header {
            for (index, text) in header.enumerated() where index < columns { widths[index] = measure(text) }
        }
        for (index, cell) in cells.enumerated() {
            let column = index % columns
            widths[column] = max(widths[column], measure(cell.text))
        }
        return widths
    }

    /// The width each column of a board takes: its widest member, floored and
    /// capped. Shared with the renderer.
    static func columnWidths(_ columns: [RestColumn]) -> [Double] {
        columns.map { column in
            var widest = measure(column.label) * 0.8 + (column.note.map { measure($0) * 0.8 + 8 } ?? 0)
            for item in column.items {
                widest = max(widest, (measure(item.label) + (item.value.map { measure($0) + 6 } ?? 0)) * 0.88)
            }
            return min(columnMaxWidth, max(columnMinWidth, widest + 10))
        }
    }

    /// `modelSize`: the box each grammar needs.
    public static func size(of model: RestingFaceModel, widgetSize: Size) -> Size {
        switch model {
        case .icon:
            // Never one cell: the bare icon obeys the 2×2 floor of anything icon-shaped.
            return Size(width: CanvasGeometry.iconMinEdge, height: CanvasGeometry.iconMinEdge)
        case .boolean(let label, _, let shape, _):
            let control = shape == .switch ? booleanSwitchWidth : 16
            return Size(width: snap(restPadX * 2 + control + 10 + measure(label) * 1.15), height: CanvasGeometry.gridSize)
        case .metric(let primary, let secondary, let progress, let eyebrow, _):
            let textWidth = max(measure(primary) * 1.5, measure(secondary.uppercased()) * 0.85, eyebrowWidth(eyebrow))
            let progressWidth = progress == nil ? 0.0 : 54 + 8
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + textWidth + progressWidth)),
                height: eyebrow == nil ? CanvasGeometry.gridSize : snap(CanvasGeometry.gridSize + eyebrowHeight)
            )
        case .clock(let shape, let eyebrow, let chips, let rows):
            // Square, because a dial is: the marks sit at equal clock angles.
            // Three cells leaves room for the readout inside the bezel.
            if shape == .dial { return Size(width: CanvasGeometry.gridSize * 3, height: CanvasGeometry.gridSize * 3) }
            var widest = eyebrowWidth(eyebrow)
            for row in rows {
                widest = max(widest, measure(row.label) + (row.value.map { measure($0) + rowValueGap } ?? 0))
            }
            let chipRun = chips.reduce(0.0) { $0 + measure($1.text) * 1.05 + chipPad + chipGap }
            widest = max(widest, min(maxTileWidth - restPadX * 2, chipRun), clockReadoutWidth)
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + widest)),
                height: snap(
                    padY * 2 + eyebrowHeight(eyebrow) + clockReadoutHeight
                        + (chips.isEmpty ? 0 : chipHeight + chipGap) + Double(rows.count) * restRowHeight
                )
            )
        case .stars:
            return Size(width: snap(starsWidth), height: CanvasGeometry.gridSize)
        case .chart:
            // The plot needs real width to be a chart rather than a decoration,
            // and the readout column claims a fixed strip down its right edge.
            return Size(width: snap(chartWidth + chartStatsWidth), height: CanvasGeometry.gridSize * 2)
        case .text(let text, _):
            let total = measure(text)
            let inner = min(maxTileWidth - restPadX * 2, max(88, total))
            let lines = min(Double(textLineLimit), max(1, (total / inner).rounded(.up)))
            return Size(
                width: lines == 1 ? snap(restPadX * 2 + total) : min(maxTileWidth, snap(restPadX * 2 + inner)),
                height: snap(padY * 2 + lines * restTextLineHeight)
            )
        case .note(let skin):
            let scale = skin == "sticky" ? noteScaleSticky : noteScale
            let width = snap(min(noteMaxWidth, max(noteMinWidth, widgetSize.width * scale)))
            let ratio = width / max(1, widgetSize.width)
            return Size(width: width, height: snap(widgetSize.height * ratio))
        case .rows(let rows, let overflow, let eyebrow, let meter):
            var widest = 0.0
            for row in rows {
                let valueWidth = row.value.map { rowValueGap + measure($0) } ?? 0
                let leadWidth = row.lead.map { measure($0) + 6 } ?? 0
                widest = max(widest, Double(row.indent) * rowIndent + leadWidth + rowGlyph + measure(row.label) + valueWidth)
            }
            widest = max(widest, eyebrowWidth(eyebrow))
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + widest)),
                height: snap(
                    padY * 2 + eyebrowHeight(eyebrow) + Double(rows.count) * restRowHeight
                        + (overflow > 0 ? overflowLine : 0) + (meter == nil ? 0 : 6)
                )
            )
        case .columns(let columns, let wrap, let eyebrow):
            let perRow = max(1, min(wrap ?? columns.count, columns.count))
            let bandCount = Int((Double(columns.count) / Double(perRow)).rounded(.up))
            let widths = columnWidths(columns)
            let heights = columns.map { Double($0.items.count) * columnItem + ($0.overflow > 0 ? 10 : 0) }
            // Each band is as wide as its widest members and as tall as its
            // fullest column, so a matrix's short quadrant never squashes the busy one.
            var widest = 0.0
            var stacked = 0.0
            for band in 0..<max(0, bandCount) {
                let range = (band * perRow)..<min(columns.count, band * perRow + perRow)
                let slice = widths[range]
                widest = max(widest, slice.reduce(0, +) + columnGap * Double(slice.count - 1))
                stacked += columnHeader + max(columnItem, heights[range].max() ?? 0)
            }
            return Size(
                width: min(maxWideTile, snap(restPadX * 2 + widest)),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + stacked + columnGap * Double(max(0, bandCount - 1)))
            )
        case .grid(let cols, let cells, let eyebrow, let header, let dense):
            let columns = max(1, cols)
            let rows = max(1.0, (Double(cells.count) / Double(columns)).rounded(.up))
            if dense {
                return Size(
                    width: min(maxWideTile, snap(max(
                        restPadX * 2 + Double(columns) * denseCell + Double(columns - 1) * denseGap,
                        eyebrow.map { restPadX * 2 + eyebrowWidth($0) } ?? 0
                    ))),
                    height: snap(
                        padY * 2 + eyebrowHeight(eyebrow) + (header == nil ? 0 : denseCell)
                            + rows * denseCell + (rows - 1) * denseGap
                    )
                )
            }
            // A text grid takes its column widths from its own widest cell, so
            // a folded table lines its columns up the way the open one does.
            let width = gridColumnWidths(cols: columns, header: header, cells: cells).reduce(0, +) + gridColGap * Double(max(0, columns - 1))
            return Size(
                width: min(maxWideTile, snap(restPadX * 2 + max(width, eyebrowWidth(eyebrow)))),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + (header == nil ? 0 : gridRowHeight) + rows * gridRowHeight)
            )
        case .bars(let bars, let eyebrow):
            var widest = 0.0
            for bar in bars { widest = max(widest, measure(bar.label) + 8 + measure(bar.value)) }
            widest = max(widest, barTrackWidth, eyebrowWidth(eyebrow))
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + max(barTrackWidth + 24, widest))),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + Double(bars.count) * barRowHeight)
            )
        case .gauge(_, let primary, let secondary, let caption, _, let eyebrow):
            let textWidth = max(measure(primary) * 1.4, measure(secondary.uppercased()) * 0.85, caption.map { measure($0) * 0.85 } ?? 0)
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + max(gaugeDiameter + 10 + textWidth, eyebrowWidth(eyebrow)))),
                height: snap(padY * 2 + gaugeDiameter + eyebrowHeight(eyebrow))
            )
        case .chips(let chips, let overflow, let eyebrow):
            let inner = maxTileWidth - restPadX * 2
            var line = 0.0
            var lines = 1.0
            for chip in chips {
                let width = measure(chip.text) * 1.05 + chipPad
                if line > 0, line + width > inner { lines += 1; line = 0 }
                line += width + chipGap
            }
            let widest = chips.reduce(eyebrowWidth(eyebrow)) { max($0, measure($1.text) * 1.05 + chipPad) }
            let packed = chips.reduce(0.0) { $0 + measure($1.text) * 1.05 + chipPad + chipGap }
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + max(widest, min(inner, packed)))),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + lines * chipHeight + (lines - 1) * chipGap + (overflow > 0 ? 10 : 0))
            )
        case .lines(let lines, let eyebrow, let mono, let total):
            let scale = mono ? 1.02 : 1
            let measureLine = { (line: RestLine) in (measure(line.left) + (line.right.map { measure($0) + lineGap } ?? 0)) * scale }
            var widest = eyebrowWidth(eyebrow)
            for line in lines { widest = max(widest, measureLine(line)) }
            if let total { widest = max(widest, measureLine(total) * 1.15) }
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + widest)),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + Double(max(1, lines.count)) * lineHeight + (total == nil ? 0 : lineHeight + 5))
            )
        case .chain(let nodes, let shape, let overflow, let eyebrow):
            if shape == .stack {
                var widest = eyebrowWidth(eyebrow)
                for node in nodes { widest = max(widest, 14 + measure(node.label) + (node.caption.map { measure($0) + 8 } ?? 0)) }
                return Size(
                    width: min(maxTileWidth, snap(restPadX * 2 + widest)),
                    height: snap(padY * 2 + eyebrowHeight(eyebrow) + Double(nodes.count) * restRowHeight + (overflow > 0 ? overflowLine : 0))
                )
            }
            let span = Double(nodes.count) * nodeWidth + Double(max(0, nodes.count - 1)) * nodeConnector + (overflow > 0 ? nodeConnector + 18 : 0)
            return Size(
                width: min(maxWideTile, snap(restPadX * 2 + span)),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + nodeHeight + (shape == .circular ? 10 : 0))
            )
        case .split(let left, let right, let divider, let eyebrow):
            let side = { (readout: RestReadout) in max(measure(readout.primary) * 1.4, measure(readout.secondary.uppercased()) * 0.85) }
            let dividerWidth = divider.map { measure($0) * 1.2 + 12 } ?? splitDivider
            return Size(
                width: min(maxTileWidth, snap(restPadX * 2 + side(left) + dividerWidth + side(right))),
                height: snap(padY * 2 + eyebrowHeight(eyebrow) + 30)
            )
        case .canvas(let skin, _):
            return canvasTiles[skin] ?? canvasTiles["portal"]!
        }
    }

    /// `restingFace(widget)`: the model's tile, the Tasks shrink, and the
    /// title-capsule floor. `type` selects the per-type rules.
    public static func face(_ model: RestingFaceModel, type: String, title: String, widgetSize: Size) -> RestingFace {
        var size = size(of: model, widgetSize: widgetSize)
        if type == "checklist", !model.isIcon {
            size = Size(width: snap(size.width * taskRestScale), height: snap(size.height * taskRestScale))
        }
        if !model.isIcon {
            size.width = snap(max(size.width, titleCapsuleWidth(title)))
        }
        return RestingFace(model: model, size: size)
    }
}

// MARK: - Sparkline geometry (`utils/sparkline.ts`)

/// Pure plot geometry for the chart face: a series of any length collapses
/// to at most `markSampleLimit` marks, so a chart holding thousands of points
/// still rests as a handful of shapes.
public enum RestSparkline {
    public struct Bar: Equatable, Sendable {
        public var x: Double, y: Double, width: Double, height: Double
        public var color: String?
    }

    public struct Segment: Equatable, Sendable {
        /// Share of the positive total, 0..1.
        public var fraction: Double
        /// Running start of this segment, 0..1.
        public var offset: Double
        public var color: String?
    }

    public struct Point: Equatable, Sendable {
        public var value: Double
        public var color: String?
        public init(value: Double, color: String? = nil) {
            self.value = value
            self.color = color
        }
    }

    private static func round2(_ value: Double) -> Double { jsRound(value * 100) / 100 }

    /// Evenly-spaced subsample that always keeps the first and last point.
    public static func sample<T>(_ points: [T], limit: Int = RestingFaceMeasure.markSampleLimit) -> [T] {
        guard points.count > limit, limit > 1 else { return points }
        let step = Double(points.count - 1) / Double(limit - 1)
        return (0..<limit).map { points[Int(jsRound(Double($0) * step))] }
    }

    /// Polyline across the box; a flat series sits on the mid-line.
    public static func linePoints(_ values: [Double], width: Double, height: Double) -> [CGPoint] {
        let points = sample(values)
        if points.isEmpty { return [] }
        if points.count == 1 { return [CGPoint(x: 0, y: round2(height / 2)), CGPoint(x: round2(width), y: round2(height / 2))] }
        let low = points.min()!
        let high = points.max()!
        let span = high - low
        let stepX = width / Double(points.count - 1)
        return points.enumerated().map { index, value in
            let ratio = span == 0 ? 0.5 : (value - low) / span
            return CGPoint(x: round2(Double(index) * stepX), y: round2(height - ratio * height))
        }
    }

    /// Bars measured from the zero baseline, so negatives read correctly.
    public static func bars(_ points: [Point], width: Double, height: Double, gap: Double = 2) -> [Bar] {
        let sampled = sample(points)
        if sampled.isEmpty { return [] }
        let values = sampled.map(\.value)
        let domainMax = max(0, values.max()!)
        let domainMin = min(0, values.min()!)
        let span = domainMax - domainMin == 0 ? 1 : domainMax - domainMin
        let slot = width / Double(sampled.count)
        let barWidth = max(1, slot - gap)
        let zeroY = height - ((0 - domainMin) / span) * height
        return sampled.enumerated().map { index, point in
            let valueY = height - ((point.value - domainMin) / span) * height
            let top = min(valueY, zeroY)
            return Bar(
                x: round2(Double(index) * slot + (slot - barWidth) / 2),
                y: round2(min(top, height - 1)),
                width: round2(barWidth),
                height: round2(max(1, abs(valueY - zeroY))),
                color: point.color
            )
        }
    }

    /// Ring shares of the positive total. Negatives and zeroes take no arc.
    public static func donut(_ points: [Point]) -> [Segment] {
        let positive = sample(points).filter { $0.value > 0 }
        let total = positive.reduce(0.0) { $0 + $1.value }
        if total <= 0 { return [] }
        var offset = 0.0
        return positive.map { point in
            let fraction = point.value / total
            let segment = Segment(fraction: round2(fraction), offset: round2(offset), color: point.color)
            offset += fraction
            return segment
        }
    }
}

// MARK: - Shared reading helpers (`restingFaceModel.ts`)

public enum RestText {
    /// Collapse whitespace and clip with an ellipsis (`compact`).
    public static func compact(_ value: String, _ limit: Int) -> String {
        let clean = value.split(whereSeparator: { $0.isWhitespace || $0.isNewline }).joined(separator: " ")
        guard clean.count > limit else { return clean }
        let head = String(clean.prefix(max(0, limit - 1)))
        let trimmed = head.reversed().drop(while: { $0.isWhitespace }).reversed()
        return String(trimmed) + "…"
    }

    /// `formatRestNumber`.
    public static func number(_ value: Double) -> String {
        let magnitude = abs(value)
        if magnitude >= 1_000_000 { return "\(JavaScript.numberString(jsRound(value / 100_000) / 10))M" }
        if magnitude >= 1_000 { return "\(JavaScript.numberString(jsRound(value / 100) / 10))k" }
        if value == value.rounded(), value.isFinite { return JavaScript.numberString(value) }
        return JavaScript.numberString(jsRound(value * 10) / 10)
    }

    /// `formatRestDuration`.
    public static func duration(_ seconds: Double) -> String {
        let safe = Int(max(0, jsRound(seconds)))
        let hours = safe / 3600
        let minutes = (safe % 3600) / 60
        let remainder = safe % 60
        let two = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
        return hours > 0 ? "\(hours):\(two(minutes)):\(two(remainder))" : "\(minutes):\(two(remainder))"
    }

    public static func fraction(_ value: Double) -> Double {
        value.isFinite ? min(1, max(0, value)) : 0
    }

    /// `chartStats`: Now, the change since the first point, and the peak when
    /// the series is not sitting on it.
    public static func chartStats(_ values: [Double], unit: String) -> [RestStat] {
        let values = values.filter(\.isFinite)
        guard let latest = values.last, let first = values.first else { return [] }
        let suffix = { (n: Double) in "\(number(n))\(unit)" }
        var stats = [RestStat(label: "Now", value: suffix(latest))]
        if values.count > 1 {
            let delta = latest - first
            let sign = delta > 0 ? "+" : delta < 0 ? "−" : ""
            stats.append(RestStat(label: "Change", value: "\(sign)\(suffix(abs(delta)))"))
            let peak = values.max()!
            if peak != latest { stats.append(RestStat(label: "Peak", value: suffix(peak))) }
        }
        return stats
    }
}
