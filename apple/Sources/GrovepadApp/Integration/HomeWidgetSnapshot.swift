import Foundation
import GrovepadCore
import GrovepadChrome
import GrovepadHomeWidget

// ---------------------------------------------------------------------------
// The app's half of the "Grovepad Widget" home-screen widget
// (docs/native-os-widgets.md). The person picks ANY card on ANY canvas from
// the widget's own Edit Widget sheet, which runs in the extension, a process
// that cannot see the board. So the app keeps a mirror in the App Group:
//
//   - a catalog of every canvas and the cards on it (the pickers read it);
//   - one drawn-ready snapshot per card: its resting face built under the
//     roomier home-screen limits, with every live read resolved.
//
// The mirror is derived, device-local and disposable: never board data,
// undo, export or sync. A pass runs one debounce after a commit, re-derives
// only the cards whose record (or canvas name) changed, writes only the
// files whose bytes changed, deletes the files of deleted cards, and asks
// WidgetKit to reload only when something on disk moved.
// ---------------------------------------------------------------------------

public enum HomeWidgetSnapshotBuilder {
    /// The Note page's words travel whole up to this many characters.
    public static let noteTextMax = 4_096
    public static let titleMax = 120

    // MARK: Catalog

    public static func catalog(for board: Board) -> HomeWidgetCatalog {
        var byCanvas: [String: [Widget]] = [:]
        for widget in board.widgets.values where board.canvases.contains(widget.canvasId) {
            byCanvas[widget.canvasId, default: []].append(widget)
        }
        let canvases = board.canvases.values.map { canvas -> HomeWidgetCatalog.Canvas in
            let widgets = (byCanvas[canvas.id] ?? []).sorted(by: readingOrder).map { widget in
                HomeWidgetCatalog.Entry(id: widget.id, title: bounded(displayTitle(widget), titleMax), kind: label(for: widget), symbol: symbol(for: widget))
            }
            return HomeWidgetCatalog.Canvas(id: canvas.id, name: canvasName(canvas.id, in: board), path: canvasPath(canvas.id, in: board), widgets: widgets)
        }
        return HomeWidgetCatalog(canvases: canvases.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending })
    }

    /// Top to bottom, then left to right: the order a person reads a canvas in.
    static func readingOrder(_ a: Widget, _ b: Widget) -> Bool {
        if a.position.y != b.position.y { return a.position.y < b.position.y }
        if a.position.x != b.position.x { return a.position.x < b.position.x }
        return a.id < b.id
    }

    // MARK: One card

    public static func card(for widget: Widget, in board: Board, nowMs: Double) -> HomeWidgetCard {
        let definition = WidgetRegistry.definition(for: widget.type)
        let data = widget.data
        let skin = definition?.skin(for: data)
        let firstSkin = definition?.skins.first?.value
        let model = RestingFaceMeasure.$limits.withValue(.homeScreen) {
            WidgetRendererRegistry.renderer(for: widget.type).restingFace(widget)
        }
        var live: HomeWidgetCard.Live?
        if case .clock = model {
            let anchor = TimekeeperClock.liveAnchor(data)
            if anchor.countsDownToMs != nil || anchor.countsUpFromMs != nil {
                live = HomeWidgetCard.Live(countsDownToMs: anchor.countsDownToMs, countsUpFromMs: anchor.countsUpFromMs)
            }
        }
        return HomeWidgetCard(
            id: widget.id,
            canvasId: widget.canvasId,
            canvasName: canvasName(widget.canvasId, in: board),
            title: bounded(displayTitle(widget), titleMax),
            kind: label(for: widget),
            skin: skin.flatMap { $0.value == firstSkin ? nil : $0.label },
            symbol: symbol(for: widget),
            accent: definition?.accent(for: data) ?? "#34d399",
            face: face(model, widget: widget, board: board, nowMs: nowMs),
            live: live
        )
    }

    /// `RestingFaceModel` → `HomeWidgetFace`, resolving what the canvas reads at paint time.
    static func face(_ model: RestingFaceModel, widget: Widget, board: Board, nowMs: Double) -> HomeWidgetFace {
        let data = widget.data
        switch model {
        case .icon:
            // A type drawn only as its icon may still hold words (a type whose
            // renderer is not ported yet): show them rather than nothing.
            let words = PaletteFuzzy.contentText(data)
            return words.isEmpty ? .empty : .text(text: bounded(words, RestingFaceMeasure.Limits.homeScreen.textClamp), tint: nil)
        case .note(let skin):
            return .note(text: bounded(data.string("text") ?? "", noteTextMax), sticky: skin == "sticky", mono: skin == "typewriter")
        case .rows(let rows, let overflow, let eyebrow, let meter):
            return .rows(eyebrow: eyebrow.map(convert), rows: rows.map(convert), overflow: overflow, meter: meter)
        case .boolean(let label, let active, let shape, let tone):
            return .boolean(label: label, active: active, shape: shape.rawValue, tone: tone.map(convert))
        case .metric(let primary, let secondary, let progress, let eyebrow, let tone):
            return .metric(eyebrow: eyebrow.map(convert), primary: primary, secondary: secondary, progress: progress, tone: tone.map(convert))
        case .text(let text, let tint):
            return .text(text: text, tint: tint)
        case .clock(_, let eyebrow, let chips, let rows):
            let clock = TimekeeperClock.reading(data, nowMs: nowMs).map {
                HomeClock(readout: $0.readout, caption: $0.caption, fraction: $0.fraction, tone: $0.tone, running: $0.running, urgent: $0.urgent)
            }
            return .clock(eyebrow: eyebrow.map(convert), clock: clock, chips: chips.map(convert), rows: rows.map(convert))
        case .chart(let stats, let series):
            let points = series.map { $0.map { RestSparkline.Point(value: $0) } } ?? WidgetRestingFaceView.chartSeries(data)
            let sampled = Array(points.suffix(RestingFaceMeasure.markSampleLimit))
            return .chart(stats: stats.map { HomeStat(label: $0.label, value: $0.value) }, series: sampled.map(\.value), colors: sampled.map(\.color))
        case .stars(let value):
            return .stars(value: value)
        case .columns(let columns, let wrap, let eyebrow):
            return .columns(eyebrow: eyebrow.map(convert), columns: columns.map { column in
                HomeColumn(label: column.label, note: column.note, tone: column.tone.map(convert), items: column.items.map(convert), overflow: column.overflow)
            }, wrap: wrap)
        case .grid(let cols, let cells, let eyebrow, let header, let dense):
            return .grid(eyebrow: eyebrow.map(convert), cols: cols, cells: cells.map { HomeCell(text: $0.text, tone: $0.tone.map(convert), fill: $0.fill, current: $0.current) }, header: header, dense: dense)
        case .bars(let bars, let eyebrow):
            return .bars(eyebrow: eyebrow.map(convert), bars: bars.map { HomeBar(label: $0.label, value: $0.value, fraction: $0.fraction, tone: $0.tone.map(convert)) })
        case .gauge(let progress, let primary, let secondary, let caption, let tone, let eyebrow):
            return .gauge(eyebrow: eyebrow.map(convert), progress: progress, primary: primary, secondary: secondary, caption: caption, tone: tone.map(convert))
        case .chips(let chips, let overflow, let eyebrow):
            return .chips(eyebrow: eyebrow.map(convert), chips: chips.map(convert), overflow: overflow)
        case .lines(let lines, let eyebrow, let mono, let total):
            return .lines(eyebrow: eyebrow.map(convert), lines: lines.map(convert), mono: mono, total: total.map(convert))
        case .chain(let nodes, let shape, let overflow, let eyebrow):
            return .chain(eyebrow: eyebrow.map(convert), nodes: nodes.map { HomeNode(label: $0.label, caption: $0.caption, current: $0.current) }, shape: shape.rawValue, overflow: overflow)
        case .split(let left, let right, let divider, let eyebrow):
            return .split(eyebrow: eyebrow.map(convert), left: convert(left), right: convert(right), divider: divider)
        case .canvas(_, let subtitle):
            let target = data.string("canvasId") ?? ""
            let known = board.canvases.contains(target)
            let count = known ? board.widgets.values.filter { $0.canvasId == target }.count : nil
            return .canvas(name: known ? canvasName(target, in: board) : displayTitle(widget), subtitle: subtitle, cardCount: count)
        }
    }

    // MARK: Pieces

    static func convert(_ tone: RestTone) -> HomeTone { HomeTone(rawValue: tone.rawValue) ?? .neutral }
    static func convert(_ eyebrow: RestEyebrow) -> HomeEyebrow { HomeEyebrow(label: eyebrow.label, note: eyebrow.note, tone: eyebrow.tone.map(convert)) }
    static func convert(_ row: RestRow) -> HomeRow {
        HomeRow(label: row.label, done: row.done, value: row.value, lead: row.lead, marker: row.marker, indent: row.indent, tone: row.tone.map(convert))
    }
    static func convert(_ chip: RestChip) -> HomeChip { HomeChip(text: chip.text, tone: chip.tone.map(convert), filled: chip.filled) }
    static func convert(_ line: RestLine) -> HomeLine { HomeLine(left: line.left, right: line.right, tone: line.tone.map(convert), dim: line.dim) }
    static func convert(_ readout: RestReadout) -> HomeReadout { HomeReadout(primary: readout.primary, secondary: readout.secondary, tone: readout.tone.map(convert)) }

    static func label(for widget: Widget) -> String {
        WidgetRegistry.definition(for: widget.type)?.label ?? PackageSummary.typeLabel(widget.type)
    }

    static func symbol(for widget: Widget) -> String {
        let definition = WidgetRegistry.definition(for: widget.type)
        return WidgetSymbols.symbol(for: widget.type, skin: definition?.skinValue(in: widget.data))
    }

    static func displayTitle(_ widget: Widget) -> String {
        let title = widget.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return title.isEmpty ? label(for: widget) : title
    }

    static func canvasName(_ id: String, in board: Board) -> String {
        SpotlightItemBuilder.displayName(board.canvases[id]?.name ?? "", "Canvas")
    }

    /// "Workspace › Parent › Canvas".
    static func canvasPath(_ id: String, in board: Board) -> String {
        let chain = SpotlightItemBuilder.canvasPath(to: id, in: board).map { SpotlightItemBuilder.displayName($0.name, "Canvas") }
        let workspace = board.canvases[id].flatMap { board.workspaces[$0.workspaceId]?.name }.map { SpotlightItemBuilder.displayName($0, "Workspace") }
        return ((workspace.map { [$0] } ?? []) + chain).joined(separator: " › ")
    }

    static func bounded(_ value: String, _ max: Int) -> String {
        NoteWidgetPayload.bounded(value, max)
    }
}

// MARK: - The writer

/// Keeps the App Group mirror in step with the board. `start()` at launch,
/// `noteCommit()` after every commit, `flush()` on the way out, `refresh()`
/// when the whole board was swapped (sign-out wipe).
@MainActor
public final class HomeWidgetSync {
    public static let debounceMs = 500.0

    public let folder: HomeWidgetFolder
    private let document: BoardDocument
    private let reloader: WidgetTimelineReloader
    private let debouncer: Debouncer
    private let clock: Clock
    /// What each card file was last derived from, so an untouched card is not re-derived.
    private struct Source: Equatable {
        var widget: Widget
        var canvasName: String
        /// A canvas door also reads the far canvas.
        var door: String?
    }
    private var sources: [String: Source] = [:]
    /// Bytes on disk, by card id.
    private var written: [String: Data] = [:]
    private var catalogBytes: Data?
    private var started = false
    public private(set) var passes = 0
    public private(set) var fileWrites = 0
    public private(set) var lastError: String?

    public init(document: BoardDocument, folder: HomeWidgetFolder, reloader: WidgetTimelineReloader, timers: TimerSource, clock: Clock) {
        self.document = document
        self.folder = folder
        self.reloader = reloader
        self.clock = clock
        debouncer = Debouncer(delayMs: HomeWidgetSync.debounceMs, timers: timers)
    }

    /// Adopt what an earlier launch left on disk, then bring it in line.
    public func start() {
        guard !started else { return }
        started = true
        catalogBytes = try? Data(contentsOf: folder.catalogURL)
        for name in folder.cardFileNames() {
            let url = folder.cardsURL.appendingPathComponent(name)
            if let data = try? Data(contentsOf: url) {
                written[name] = data
            }
        }
        pass()
    }

    public func noteCommit() {
        guard started else { return }
        debouncer.schedule { [weak self] in self?.pass() }
    }

    public func flush() {
        guard debouncer.isPending else { return }
        debouncer.cancel()
        pass()
    }

    /// Run a pass now (the board was replaced wholesale).
    public func refresh() {
        guard started else { return }
        debouncer.cancel()
        pass()
    }

    private func pass() {
        passes += 1
        let board = document.board
        let nowMs = clock.nowMs()
        var changed = false
        var live: Set<String> = []

        for widget in board.widgets.values where board.canvases.contains(widget.canvasId) {
            let name = HomeWidgetContract.cardFileName(widgetId: widget.id)
            live.insert(name)
            let door = widget.type == "canvas" ? doorKey(widget, board: board) : nil
            let source = Source(widget: widget, canvasName: HomeWidgetSnapshotBuilder.canvasName(widget.canvasId, in: board), door: door)
            if sources[widget.id] == source, written[name] != nil { continue }
            sources[widget.id] = source
            let card = HomeWidgetSnapshotBuilder.card(for: widget, in: board, nowMs: nowMs)
            guard let bytes = try? HomeWidgetCoding.encoder.encode(card) else { continue }
            if written[name] == bytes { continue }
            if write(bytes, to: folder.cardsURL.appendingPathComponent(name)) {
                written[name] = bytes
                changed = true
            }
        }

        // Cards the board no longer holds.
        for name in written.keys where !live.contains(name) {
            try? FileManager.default.removeItem(at: folder.cardsURL.appendingPathComponent(name))
            written[name] = nil
            changed = true
        }
        let liveIds = Set(board.widgets.values.map(\.id))
        sources = sources.filter { liveIds.contains($0.key) }

        if let bytes = try? HomeWidgetCoding.encoder.encode(HomeWidgetSnapshotBuilder.catalog(for: board)), bytes != catalogBytes {
            if write(bytes, to: folder.catalogURL) {
                catalogBytes = bytes
                changed = true
            }
        }
        if changed { reloader.reloadTimelines(ofKind: HomeWidgetContract.widgetKind) }
    }

    /// The far side a door card shows: its name and how many cards it holds.
    private func doorKey(_ widget: Widget, board: Board) -> String {
        let target = widget.data.string("canvasId") ?? ""
        guard board.canvases.contains(target) else { return "" }
        let count = board.widgets.values.reduce(0) { $0 + ($1.canvasId == target ? 1 : 0) }
        return "\(HomeWidgetSnapshotBuilder.canvasName(target, in: board))|\(count)"
    }

    private func write(_ bytes: Data, to url: URL) -> Bool {
        do {
            try folder.write(bytes, to: url)
            fileWrites += 1
            lastError = nil
            return true
        } catch {
            // A mirror failure never interrupts board work; the next pass retries.
            lastError = "\(error)"
            return false
        }
    }
}
