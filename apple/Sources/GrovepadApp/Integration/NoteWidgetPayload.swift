import Foundation
import GrovepadCore
import GrovepadChrome
#if canImport(WidgetKit)
import WidgetKit
#endif

// ---------------------------------------------------------------------------
// The WidgetKit Note widget's side of the app (`utils/nativeNoteWidget.ts`,
// `runtime/nativeNoteWidgetSync.ts`, `store/useNativeWidgetStore.ts`): one
// Text card, chosen on this device, mirrored as a bounded JSON snapshot into
// the App Group container the widget extension reads. The choice is device
// state (never board data, undo, export or sync); the snapshot carries only
// `id`, `title`, `text`, `color`, `mode`; text is capped at 4 096 characters;
// typing is debounced 240 ms; an unchanged snapshot never touches the file.
//
// The Tauri app crossed this boundary through App Group UserDefaults and a
// Rust command; here the app writes a file with `JSONWriter` and asks
// WidgetCenter to reload the one timeline.
// ---------------------------------------------------------------------------

public struct NoteWidgetPayload: Equatable, Sendable {
    public static let schemaVersion = 1
    public static let titleMax = 120
    public static let textMax = 4_096
    /// The five colours the widget view switches on; the rest fold.
    public static let colors: Set<String> = ["yellow", "pink", "blue", "green", "purple"]
    static let colorFold: [String: String] = ["orange": "yellow", "teal": "green", "red": "pink", "lime": "green"]

    /// Shared with the extension (`App/NoteWidget`): the group, the file,
    /// the timeline kind. Change one, change both.
    public static let appGroup = "group.app.grovepad.native"
    public static let fileName = "note-widget-payload-v1.json"
    public static let widgetKind = "GrovepadNoteWidget"

    public struct Note: Equatable, Sendable {
        public var id: String
        public var title: String
        public var text: String
        public var color: String
        public var mode: String
    }

    public var note: Note?

    /// `deriveNativeNoteWidgetSnapshot`: nothing but a Text card yields a note.
    public static func derive(selectedWidgetId: String?, board: Board) -> NoteWidgetPayload {
        guard let id = selectedWidgetId, let widget = board.widgets[id], widget.type == "text" else {
            return NoteWidgetPayload(note: nil)
        }
        let data = widget.data
        return NoteWidgetPayload(note: Note(
            id: bounded(widget.id, titleMax),
            title: bounded(widget.title, titleMax),
            text: bounded(data.string("text") ?? "", textMax),
            color: nativeColor(data.string("color")),
            mode: data.string("mode") == "sticky" ? "sticky" : "plain"
        ))
    }

    static func nativeColor(_ raw: String?) -> String {
        guard let raw else { return "yellow" }
        if colors.contains(raw) { return raw }
        return colorFold[raw] ?? "yellow"
    }

    /// `bounded`: a UTF-16 slice (the web's `String.prototype.slice`) that
    /// drops a lone high surrogate left at the cut.
    static func bounded(_ value: String, _ max: Int) -> String {
        let units = Array(value.utf16)
        guard units.count > max else { return value }
        var slice = Array(units[0..<max])
        if let last = slice.last, (0xD800...0xDBFF).contains(last) { slice.removeLast() }
        return String(decoding: slice, as: UTF16.self)
    }

    /// `serializeNativeNoteWidgetSnapshot`: `JSON.stringify` key order.
    public var serialized: String {
        var root = JSONObject()
        root["schemaVersion"] = .number(Double(NoteWidgetPayload.schemaVersion))
        if let note {
            var object = JSONObject()
            object["id"] = .string(note.id)
            object["title"] = .string(note.title)
            object["text"] = .string(note.text)
            object["color"] = .string(note.color)
            object["mode"] = .string(note.mode)
            root["note"] = .object(object)
        } else {
            root["note"] = .null
        }
        return JSONWriter.stringify(.object(root))
    }

    /// The extension's read, mirrored here so a test can round-trip the file.
    public static func parse(_ text: String) -> NoteWidgetPayload? {
        guard let root = try? JSONParser.parse(text).objectValue, root.number("schemaVersion") == Double(schemaVersion) else { return nil }
        guard let object = root.object("note") else { return NoteWidgetPayload(note: nil) }
        return NoteWidgetPayload(note: Note(
            id: object.string("id") ?? "",
            title: object.string("title") ?? "",
            text: object.string("text") ?? "",
            color: object.string("color") ?? "yellow",
            mode: object.string("mode") ?? "plain"
        ))
    }
}

// MARK: - Container and reload seams

/// Where the payload file lives: the App Group container when the build is
/// entitled to one, else a folder beside the store (a local unsigned build
/// still writes; only the extension cannot read it there).
public enum NoteWidgetContainer {
    public static func url(fileManager: FileManager = .default, fallback: URL) -> URL {
        let folder = fileManager.containerURL(forSecurityApplicationGroupIdentifier: NoteWidgetPayload.appGroup) ?? fallback
        return folder.appendingPathComponent(NoteWidgetPayload.fileName)
    }
}

public protocol WidgetTimelineReloader: AnyObject {
    func reloadTimelines(ofKind kind: String)
}

#if canImport(WidgetKit)
public final class WidgetCenterReloader: WidgetTimelineReloader {
    public init() {}
    public func reloadTimelines(ofKind kind: String) {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }
}
#endif

/// A reloader that only counts (tests, and builds without WidgetKit).
public final class RecordingWidgetReloader: WidgetTimelineReloader {
    public private(set) var reloads: [String] = []
    public init() {}
    public func reloadTimelines(ofKind kind: String) { reloads.append(kind) }
}

// MARK: - Sync

/// `initNativeNoteWidgetSync` + `useNativeWidgetStore`: the selected id in
/// the settings store, the debounce, the unchanged-payload skip, the write
/// and the timeline reload. The coordinator calls `noteCommit()` after every
/// document commit and `flush()` on the way out.
@MainActor
public final class NoteWidgetSync {
    public static let debounceMs = 240.0
    public static let selectionKey = "grovepad:native-note-widget:v1"

    public let fileURL: URL
    private let document: BoardDocument
    private let settings: KeyValueStore
    private let reloader: WidgetTimelineReloader
    private let debouncer: Debouncer
    private let fileManager: FileManager
    public private(set) var selectedWidgetId: String?
    public private(set) var lastWritten: String?
    public private(set) var writeCount = 0
    public private(set) var lastError: String?
    private var desired: String?

    public init(document: BoardDocument, fileURL: URL, settings: KeyValueStore, reloader: WidgetTimelineReloader, timers: TimerSource, fileManager: FileManager = .default) {
        self.document = document
        self.fileURL = fileURL
        self.settings = settings
        self.reloader = reloader
        self.fileManager = fileManager
        debouncer = Debouncer(delayMs: NoteWidgetSync.debounceMs, timers: timers)
        selectedWidgetId = settings.string(forKey: NoteWidgetSync.selectionKey).flatMap { $0.isEmpty ? nil : $0 }
        if let data = try? Data(contentsOf: fileURL), let text = String(data: data, encoding: .utf8) { lastWritten = text }
    }

    /// At launch: bring the file in line with the choice (a card deleted
    /// while the app was closed, a choice cleared out of band).
    public func start() {
        guard selectedWidgetId != nil || lastWritten != nil else { return }
        schedule(immediate: true)
    }

    /// The menu row's state for a card: nil unless it is a Text card.
    public func menuState(for widgetId: String) -> ContextMenuModel.NoteWidgetState? {
        guard document.widget(widgetId)?.type == "text" else { return nil }
        return selectedWidgetId == widgetId ? .shown : .available
    }

    /// `setSelectedWidgetId`: persists, then the snapshot follows at once.
    public func setSelectedWidgetId(_ id: String?) {
        selectedWidgetId = id
        settings.set(id, forKey: NoteWidgetSync.selectionKey)
        schedule(immediate: true)
    }

    public func toggle(_ widgetId: String) {
        setSelectedWidgetId(selectedWidgetId == widgetId ? nil : widgetId)
    }

    public var payload: NoteWidgetPayload {
        NoteWidgetPayload.derive(selectedWidgetId: selectedWidgetId, board: document.board)
    }

    /// After a commit: derive, skip when unchanged, debounce the write.
    public func noteCommit() {
        // Nothing chosen: the snapshot is the constant empty one, and it is
        // written once (the selection change) — no work per commit.
        guard selectedWidgetId != nil else { return }
        schedule(immediate: false)
    }

    private func schedule(immediate: Bool) {
        let next = payload.serialized
        desired = next
        if next == lastWritten { debouncer.cancel(); return }
        if immediate {
            debouncer.cancel()
            write()
        } else {
            debouncer.schedule { [weak self] in self?.write() }
        }
    }

    /// Write whatever is pending now (background, quit).
    public func flush() {
        guard debouncer.isPending else { return }
        debouncer.cancel()
        write()
    }

    private func write() {
        guard let text = desired, text != lastWritten else { return }
        do {
            try fileManager.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: fileURL, options: .atomic)
            lastWritten = text
            writeCount += 1
            lastError = nil
            reloader.reloadTimelines(ofKind: NoteWidgetPayload.widgetKind)
        } catch {
            // Never interrupts board editing (`nativeNoteWidgetSync.ts`);
            // the next commit tries again.
            lastError = "\(error)"
        }
    }
}
