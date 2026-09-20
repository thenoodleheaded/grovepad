import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// Tolerant reads every card body and resting face share. The TypeScript reads
// typed data; the port reads through these so malformed data yields an empty
// or zero reading rather than a crash (the same rule the Core field tables
// follow).
// ---------------------------------------------------------------------------

extension JSONObject {
    /// `data.key` as records, `[]` when absent or not an array.
    func recordList(_ key: String) -> [JSONObject] {
        (array(key) ?? []).compactMap(\.objectValue)
    }

    func str(_ key: String, _ fallback: String = "") -> String {
        string(key) ?? fallback
    }

    func trimmedStr(_ key: String) -> String {
        JavaScript.trim(str(key))
    }

    func finite(_ key: String) -> Double? {
        guard let value = number(key), value.isFinite else { return nil }
        return value
    }

    /// The pocket one skin owns inside `skinStates` (`skinStateFor`).
    func skinState(_ skin: String) -> JSONObject {
        object("skinStates")?.object(skin) ?? JSONObject()
    }

    /// `{ ...items[i], key: value }` on one record of an array slot.
    mutating func patchRecord(in key: String, id: String, _ mutate: (inout JSONObject) -> Void) {
        var items = array(key) ?? []
        for index in items.indices {
            guard var item = items[index].objectValue, item.string("id") == id else { continue }
            mutate(&item)
            items[index] = .object(item)
        }
        self[key] = .array(items)
    }

    mutating func removeRecord(in key: String, id: String) {
        self[key] = .array((array(key) ?? []).filter { $0.objectValue?.string("id") != id })
    }

    mutating func appendRecord(in key: String, _ record: JSONObject) {
        self[key] = .array((array(key) ?? []) + [.object(record)])
    }
}

/// A plain single-line field that writes through the card context, on the
/// island surface, with the 44 pt floor.
struct CardTextField: View {
    let label: String
    let text: String
    let onCommit: (String) -> Void
    @State private var draft: String = ""
    @State private var editing = false

    init(_ label: String, text: String, onCommit: @escaping (String) -> Void) {
        self.label = label
        self.text = text
        self.onCommit = onCommit
    }

    var body: some View {
        TextField(label, text: Binding(
            get: { editing ? draft : text },
            set: { value in
                draft = value
                editing = true
                onCommit(value)
            }
        ))
        .textFieldStyle(.plain)
        .font(GlassType.body)
        .frame(minHeight: GlassTokens.touchTarget)
        .accessibilityLabel(label)
        .onSubmit { editing = false }
    }
}

/// A row action that is invisible-and-inert only for the eye: it always has
/// its hit area (Article XIX: hover-revealed chrome is never a hover-only
/// affordance on a touch surface).
struct RowDeleteButton: View {
    let label: String
    let action: () -> Void

    var body: some View {
        GhostButton("xmark", label: label, action: action)
    }
}
