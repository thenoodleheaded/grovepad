import Foundation

// The extension's half of the payload contract in
// `GrovepadApp/Integration/NoteWidgetPayload.swift`: the same App Group,
// file name and keys, decoded with Codable (this is not board bytes). The
// app's `IntegrationNoteWidgetTests` pins the three constants.

enum NoteWidgetContract {
    static let appGroup = "group.app.grovepad.native"
    static let fileName = "note-widget-payload-v1.json"
    static let widgetKind = "GrovepadNoteWidget"
    static let schemaVersion = 1
}

struct NotePayload: Decodable, Equatable {
    let id: String
    let title: String
    let text: String
    let color: String
    let mode: String
}

struct WidgetPayload: Decodable {
    let schemaVersion: Int
    let note: NotePayload?
}

enum NoteWidgetPayloadReader {
    static var fileURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: NoteWidgetContract.appGroup)?
            .appendingPathComponent(NoteWidgetContract.fileName)
    }

    /// The chosen note, or nil when nothing was chosen / the file is unreadable.
    static func read() -> NotePayload? {
        guard let url = fileURL, let data = try? Data(contentsOf: url),
              let payload = try? JSONDecoder().decode(WidgetPayload.self, from: data),
              payload.schemaVersion == NoteWidgetContract.schemaVersion
        else { return nil }
        return payload.note
    }
}
