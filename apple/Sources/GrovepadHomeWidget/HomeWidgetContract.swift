import Foundation

// ---------------------------------------------------------------------------
// The home-screen / desktop widget contract (docs/native-os-widgets.md,
// "Grovepad Widget"). The app and the WidgetKit extension are two processes
// that share nothing but an App Group folder, so everything they agree on
// lives in this module, which both link:
//
//   <App Group>/home-widgets/catalog-v1.json      every canvas and the cards on it
//   <App Group>/home-widgets/cards-v1/<id>.json   one card, drawn-ready
//
// The app writes (`HomeWidgetSync` in GrovepadApp); the extension only reads.
// These files are a disposable mirror, never board data: deleting the folder
// loses nothing, and the next app launch writes it again. Foundation only
// below the views, so the extension stays small.
// ---------------------------------------------------------------------------

public enum HomeWidgetContract {
    /// Shared with the Note widget and the app's entitlements.
    public static let appGroup = "group.app.grovepad.native"
    public static let folderName = "home-widgets"
    public static let catalogFileName = "catalog-v1.json"
    public static let cardsFolderName = "cards-v1"
    /// The WidgetKit `kind` the app asks to reload.
    public static let widgetKind = "GrovepadCardWidget"
    public static let schemaVersion = 1

    /// `grovepad://widget/<id>`: open the app on the card's canvas with the card selected.
    public static func openURL(widgetId: String) -> URL {
        var components = URLComponents()
        components.scheme = "grovepad"
        components.host = "widget"
        components.path = "/" + widgetId
        return components.url ?? URL(string: "grovepad://widget")!
    }

    /// The card id a tap on the widget carries, or nil for any other URL.
    public static func widgetId(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "grovepad", url.host?.lowercased() == "widget" else { return nil }
        let id = String(url.path.drop(while: { $0 == "/" }))
        return id.isEmpty ? nil : id
    }

    /// A card id as a file name: kept readable when it is already safe (the
    /// board's ids are UUIDs), hex-encoded otherwise, so no id can escape the folder.
    public static func cardFileName(widgetId: String) -> String {
        let safe = widgetId.count <= 100 && !widgetId.isEmpty && widgetId.unicodeScalars.allSatisfy { scalar in
            CharacterSet.alphanumerics.contains(scalar) && scalar.isASCII || scalar == "-" || scalar == "_"
        }
        let stem = safe ? widgetId : "x" + widgetId.utf8.map { String(format: "%02x", $0) }.joined()
        return stem + ".json"
    }
}

/// Where the mirror lives, and the only reads and writes of it.
public struct HomeWidgetFolder: Sendable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }

    /// The App Group's folder, or nil when this build is not entitled to one
    /// (a locally signed build: the widget then shows its empty state).
    public static func appGroup(fileManager: FileManager = .default) -> HomeWidgetFolder? {
        guard let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: HomeWidgetContract.appGroup) else { return nil }
        return HomeWidgetFolder(url: container.appendingPathComponent(HomeWidgetContract.folderName, isDirectory: true))
    }

    public var catalogURL: URL { url.appendingPathComponent(HomeWidgetContract.catalogFileName) }
    public var cardsURL: URL { url.appendingPathComponent(HomeWidgetContract.cardsFolderName, isDirectory: true) }

    public func cardURL(widgetId: String) -> URL {
        cardsURL.appendingPathComponent(HomeWidgetContract.cardFileName(widgetId: widgetId))
    }

    // MARK: Reads (the extension)

    public func readCatalog() -> HomeWidgetCatalog? {
        guard let data = try? Data(contentsOf: catalogURL),
              let catalog = try? HomeWidgetCoding.decoder.decode(HomeWidgetCatalog.self, from: data),
              catalog.schemaVersion == HomeWidgetContract.schemaVersion
        else { return nil }
        return catalog
    }

    public func readCard(widgetId: String) -> HomeWidgetCard? {
        guard let data = try? Data(contentsOf: cardURL(widgetId: widgetId)),
              let card = try? HomeWidgetCoding.decoder.decode(HomeWidgetCard.self, from: data),
              card.schemaVersion == HomeWidgetContract.schemaVersion
        else { return nil }
        return card
    }

    // MARK: Writes (the app)

    public func write(_ data: Data, to target: URL) throws {
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: target, options: .atomic)
    }

    /// The card files present on disk, by file name.
    public func cardFileNames() -> Set<String> {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: cardsURL.path)) ?? []
        return Set(names.filter { $0.hasSuffix(".json") })
    }
}

/// One encoder and decoder for both sides. Sorted keys so an unchanged card
/// encodes to the same bytes and the app can skip the write.
public enum HomeWidgetCoding {
    public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return encoder
    }()

    public static let decoder = JSONDecoder()
}
