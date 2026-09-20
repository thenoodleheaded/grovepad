import Foundation

// ---------------------------------------------------------------------------
// What crosses the App Group: the catalog the widget's "Edit Widget" pickers
// read, and one self-contained card per board widget. A card's `face` is the
// canvas's resting-face grammar (`GrovepadChrome/Renderer/RestingFaceModel`)
// with every live read resolved at write time — the Note's words, the chart's
// series, the clock's readout, the door's canvas name — so the extension can
// draw it without the board.
// ---------------------------------------------------------------------------

public struct HomeWidgetCatalog: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var canvases: [Canvas]

    public init(schemaVersion: Int = HomeWidgetContract.schemaVersion, canvases: [Canvas]) {
        self.schemaVersion = schemaVersion
        self.canvases = canvases
    }

    public struct Canvas: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        /// "Workspace › Parent › Canvas": tells two canvases of one name apart.
        public var path: String
        public var widgets: [Entry]

        public init(id: String, name: String, path: String, widgets: [Entry]) {
            self.id = id
            self.name = name
            self.path = path
            self.widgets = widgets
        }
    }

    public struct Entry: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var title: String
        /// The type's label ("Tasks", "Counter").
        public var kind: String
        public var symbol: String

        public init(id: String, title: String, kind: String, symbol: String) {
            self.id = id
            self.title = title
            self.kind = kind
            self.symbol = symbol
        }
    }

    public func canvas(id: String) -> Canvas? {
        canvases.first { $0.id == id }
    }

    /// The canvas a card sits on, and the card.
    public func entry(widgetId: String) -> (canvas: Canvas, entry: Entry)? {
        for canvas in canvases {
            if let entry = canvas.widgets.first(where: { $0.id == widgetId }) { return (canvas, entry) }
        }
        return nil
    }
}

public struct HomeWidgetCard: Codable, Equatable, Sendable {
    public var schemaVersion: Int
    public var id: String
    public var canvasId: String
    public var canvasName: String
    public var title: String
    public var kind: String
    /// The worn skin's name, when it is not the type's first.
    public var skin: String?
    public var symbol: String
    /// `#rrggbb`: the skin's hue, else the type's.
    public var accent: String
    public var face: HomeWidgetFace
    /// Set only while a clock runs, so the widget can tick on its own.
    public var live: Live?

    public init(schemaVersion: Int = HomeWidgetContract.schemaVersion, id: String, canvasId: String, canvasName: String, title: String, kind: String, skin: String?, symbol: String, accent: String, face: HomeWidgetFace, live: Live? = nil) {
        self.schemaVersion = schemaVersion
        self.id = id
        self.canvasId = canvasId
        self.canvasName = canvasName
        self.title = title
        self.kind = kind
        self.skin = skin
        self.symbol = symbol
        self.accent = accent
        self.face = face
        self.live = live
    }

    public struct Live: Codable, Equatable, Sendable {
        /// Epoch ms a running countdown reaches zero.
        public var countsDownToMs: Double?
        /// Epoch ms a running stopwatch would read zero from.
        public var countsUpFromMs: Double?

        public init(countsDownToMs: Double? = nil, countsUpFromMs: Double? = nil) {
            self.countsDownToMs = countsDownToMs
            self.countsUpFromMs = countsUpFromMs
        }
    }

    /// What the widget shows as the card's name.
    public var displayTitle: String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? kind : trimmed
    }
}

// MARK: - The face

public enum HomeTone: String, Codable, Equatable, Sendable {
    case neutral, accent, muted, good, warn, bad
}

public struct HomeEyebrow: Codable, Equatable, Sendable {
    public var label: String
    public var note: String?
    public var tone: HomeTone?

    public init(label: String, note: String? = nil, tone: HomeTone? = nil) {
        self.label = label
        self.note = note
        self.tone = tone
    }
}

public struct HomeRow: Codable, Equatable, Sendable {
    public var label: String
    public var done: Bool?
    public var value: String?
    public var lead: String?
    public var marker: Bool
    public var indent: Int
    public var tone: HomeTone?

    public init(label: String, done: Bool? = nil, value: String? = nil, lead: String? = nil, marker: Bool = false, indent: Int = 0, tone: HomeTone? = nil) {
        self.label = label
        self.done = done
        self.value = value
        self.lead = lead
        self.marker = marker
        self.indent = indent
        self.tone = tone
    }
}

public struct HomeColumn: Codable, Equatable, Sendable {
    public var label: String
    public var note: String?
    public var tone: HomeTone?
    public var items: [HomeRow]
    public var overflow: Int

    public init(label: String, note: String? = nil, tone: HomeTone? = nil, items: [HomeRow], overflow: Int = 0) {
        self.label = label
        self.note = note
        self.tone = tone
        self.items = items
        self.overflow = overflow
    }
}

public struct HomeCell: Codable, Equatable, Sendable {
    public var text: String
    public var tone: HomeTone?
    public var fill: Double?
    public var current: Bool

    public init(text: String, tone: HomeTone? = nil, fill: Double? = nil, current: Bool = false) {
        self.text = text
        self.tone = tone
        self.fill = fill
        self.current = current
    }
}

public struct HomeBar: Codable, Equatable, Sendable {
    public var label: String
    public var value: String
    public var fraction: Double
    public var tone: HomeTone?

    public init(label: String, value: String, fraction: Double, tone: HomeTone? = nil) {
        self.label = label
        self.value = value
        self.fraction = fraction
        self.tone = tone
    }
}

public struct HomeChip: Codable, Equatable, Sendable {
    public var text: String
    public var tone: HomeTone?
    public var filled: Bool

    public init(text: String, tone: HomeTone? = nil, filled: Bool = false) {
        self.text = text
        self.tone = tone
        self.filled = filled
    }
}

public struct HomeLine: Codable, Equatable, Sendable {
    public var left: String
    public var right: String?
    public var tone: HomeTone?
    public var dim: Bool

    public init(left: String, right: String? = nil, tone: HomeTone? = nil, dim: Bool = false) {
        self.left = left
        self.right = right
        self.tone = tone
        self.dim = dim
    }
}

public struct HomeNode: Codable, Equatable, Sendable {
    public var label: String
    public var caption: String?
    public var current: Bool

    public init(label: String, caption: String? = nil, current: Bool = false) {
        self.label = label
        self.caption = caption
        self.current = current
    }
}

public struct HomeReadout: Codable, Equatable, Sendable {
    public var primary: String
    public var secondary: String
    public var tone: HomeTone?

    public init(primary: String, secondary: String, tone: HomeTone? = nil) {
        self.primary = primary
        self.secondary = secondary
        self.tone = tone
    }
}

public struct HomeStat: Codable, Equatable, Sendable {
    public var label: String
    public var value: String

    public init(label: String, value: String) {
        self.label = label
        self.value = value
    }
}

public struct HomeClock: Codable, Equatable, Sendable {
    public var readout: String
    public var caption: String
    /// 0–1 of the sweep.
    public var fraction: Double
    /// `work` / `break` / `neutral`.
    public var tone: String
    public var running: Bool
    public var urgent: Bool

    public init(readout: String, caption: String, fraction: Double, tone: String, running: Bool, urgent: Bool) {
        self.readout = readout
        self.caption = caption
        self.fraction = fraction
        self.tone = tone
        self.running = running
        self.urgent = urgent
    }
}

/// One grammar per case, mirroring `RestingFaceModel` with its live reads resolved.
public enum HomeWidgetFace: Codable, Equatable, Sendable {
    /// Nothing inside the card yet.
    case empty
    /// The Note page: its words, whole (capped at 4 096 characters).
    case note(text: String, sticky: Bool, mono: Bool)
    case rows(eyebrow: HomeEyebrow?, rows: [HomeRow], overflow: Int, meter: Double?)
    case boolean(label: String, active: Bool, shape: String, tone: HomeTone?)
    case metric(eyebrow: HomeEyebrow?, primary: String, secondary: String, progress: Double?, tone: HomeTone?)
    case text(text: String, tint: String?)
    case clock(eyebrow: HomeEyebrow?, clock: HomeClock?, chips: [HomeChip], rows: [HomeRow])
    case chart(stats: [HomeStat], series: [Double], colors: [String?])
    case stars(value: Double)
    case columns(eyebrow: HomeEyebrow?, columns: [HomeColumn], wrap: Int?)
    case grid(eyebrow: HomeEyebrow?, cols: Int, cells: [HomeCell], header: [String]?, dense: Bool)
    case bars(eyebrow: HomeEyebrow?, bars: [HomeBar])
    case gauge(eyebrow: HomeEyebrow?, progress: Double, primary: String, secondary: String, caption: String?, tone: HomeTone?)
    case chips(eyebrow: HomeEyebrow?, chips: [HomeChip], overflow: Int)
    case lines(eyebrow: HomeEyebrow?, lines: [HomeLine], mono: Bool, total: HomeLine?)
    case chain(eyebrow: HomeEyebrow?, nodes: [HomeNode], shape: String, overflow: Int)
    case split(eyebrow: HomeEyebrow?, left: HomeReadout, right: HomeReadout, divider: String?)
    /// A door into another canvas.
    case canvas(name: String, subtitle: String?, cardCount: Int?)
}
