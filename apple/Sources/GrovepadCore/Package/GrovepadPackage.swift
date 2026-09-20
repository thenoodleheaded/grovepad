import Foundation

// ---------------------------------------------------------------------------
// Port of `src/utils/grovepadPackage.ts` and `src/utils/widgetMediaKeys.ts`:
// the portable `.grovepad` document, a ZIP that carries a whole board plus
// its media.
//
//   manifest.json          format, versions, canvas list, media manifest, checksums
//   index.json             CloudBoardIndexDocument
//   canvases/<id>.json     one CloudCanvasDocument per canvas
//   media/<sha256>.<ext>   content-addressed, de-duplicated media blobs
// ---------------------------------------------------------------------------

/// A media blob as the loader hands it over (`Blob` bytes + MIME type).
public struct MediaBlob: Equatable {
    public var bytes: [UInt8]
    public var type: String

    public init(bytes: [UInt8], type: String) {
        self.bytes = bytes
        self.type = type
    }
}

public struct ImportedMedia: Equatable {
    public var key: String
    public var blob: MediaBlob

    public init(key: String, blob: MediaBlob) {
        self.key = key
        self.blob = blob
    }
}

public struct ImportedPackage {
    public var board: Board
    public var media: [ImportedMedia]

    public init(board: Board, media: [ImportedMedia]) {
        self.board = board
        self.media = media
    }
}

/// Raised when a package requires a newer reader than this build implements.
public struct GrovepadPackageTooNewError: Error, Equatable, CustomStringConvertible {
    public let minReader: Double

    public init(minReader: Double) { self.minReader = minReader }

    public var description: String { "This .grovepad package needs a newer Grovepad (reader \(JSNumberFormatter.string(minReader)))" }
}

public struct GrovepadPackageError: Error, Equatable, CustomStringConvertible {
    public let message: String

    public init(_ message: String) { self.message = message }

    public var description: String { message }
}

public enum GrovepadPackage {
    public static let format = "grovepad-package"
    public static let version = 1

    // MARK: - Build

    /// Build a `.grovepad` archive from a board. Media blobs are read through
    /// `loadMedia` and content-addressed so the same image stored twice is
    /// packaged once.
    public static func build(
        _ board: Board,
        appVersion: String = "dev",
        clock: Clock = .system,
        loadMedia: (String) -> MediaBlob?
    ) -> [UInt8] {
        let document = BoardSerializer.serializePersistedBoard(board)
        let split = CloudDocuments.splitCloudBoard(document)
        var entries: [ZipEntry] = []
        var checksums = JSONObject()

        entries.append(ZipEntry(name: "index.json", data: Array(JSONWriter.stringify(.object(split.index), indent: 2).utf8)))
        checksums["index.json"] = .string(SHA256.hex(CloudDocuments.canonicalJson(.object(split.index))))

        var canvasIds: [JSONValue] = []
        for (canvasId, canvas) in split.canvases.entries {
            let path = "canvases/\(canvasId).json"
            entries.append(ZipEntry(name: path, data: Array(JSONWriter.stringify(.object(canvas), indent: 2).utf8)))
            checksums[path] = .string(SHA256.hex(CloudDocuments.canonicalJson(.object(canvas))))
            canvasIds.append(.string(canvasId))
        }

        // Every family that stores blobs, read from the serialized widgets.
        var media: [JSONValue] = []
        var storedPaths = Set<String>()
        var packagedKeys = Set<String>()
        let widgets = document.object("widgets") ?? JSONObject()
        for key in widgets.values.compactMap(\.objectValue).flatMap(mediaBlobKeys(for:)) {
            if packagedKeys.contains(key) { continue }
            packagedKeys.insert(key)
            guard let blob = loadMedia(key) else { continue }
            let checksum = SHA256.hex(blob.bytes)
            let path = "media/\(checksum).\(extensionForType(blob.type))"
            if !storedPaths.contains(path) {
                storedPaths.insert(path)
                entries.append(ZipEntry(name: path, data: blob.bytes))
            }
            var entry = JSONObject()
            entry["key"] = .string(key)
            entry["path"] = .string(path)
            entry["checksum"] = .string(checksum)
            entry["bytes"] = .number(Double(blob.bytes.count))
            entry["type"] = .string(blob.type.isEmpty ? "application/octet-stream" : blob.type)
            media.append(.object(entry))
        }

        var manifest = JSONObject()
        manifest["format"] = .string(format)
        manifest["formatVersion"] = .number(Double(version))
        manifest["minReader"] = .number(Double(version))
        manifest["kind"] = .string("board")
        manifest["generator"] = .string("grovepad")
        manifest["appVersion"] = .string(appVersion)
        manifest["createdAt"] = .string(isoString(ms: clock.nowMs()))
        manifest["boardFormat"] = .string(BoardFormat.format)
        manifest["boardVersion"] = split.index["boardVersion"] ?? .number(Double(BoardFormat.version))
        manifest["canvasIds"] = .array(canvasIds)
        manifest["media"] = .array(media)
        manifest["checksums"] = .object(checksums)
        entries.insert(ZipEntry(name: "manifest.json", data: Array(JSONWriter.stringify(.object(manifest), indent: 2).utf8)), at: 0)
        return ZipArchive.create(entries)
    }

    // MARK: - Read

    /// Parse a `.grovepad` archive back into a validated board plus its media.
    /// Rejects packages that need a newer reader or carry a future board
    /// version before any state is touched.
    public static func read(_ bytes: [UInt8]) throws -> ImportedPackage {
        let files = try ZipArchive.read(bytes)
        guard let manifestRaw = files["manifest.json"] else { throw GrovepadPackageError("Not a Grovepad package: manifest.json is missing") }
        let manifest = try JSONParser.parse(manifestRaw)
        guard let manifestObject = manifest.objectValue, manifestObject["format"] == .string(format) else {
            throw GrovepadPackageError("Unrecognized package: not a Grovepad document")
        }
        if let minReader = manifestObject.number("minReader"), minReader > Double(version) {
            throw GrovepadPackageTooNewError(minReader: minReader)
        }
        if let boardVersion = manifestObject.number("boardVersion"), boardVersion > Double(BoardFormat.version) {
            throw FuturePersistedBoardVersionError(foundVersion: Int(exactly: boardVersion) ?? Int(boardVersion.rounded(.towardZero)))
        }

        guard let indexRaw = files["index.json"] else { throw GrovepadPackageError("Package is missing its board index") }
        let index = try JSONParser.parse(indexRaw)
        guard CloudDocuments.isCloudBoardIndex(index), let indexObject = index.objectValue else {
            throw GrovepadPackageError("Package board index has an unsupported shape")
        }

        var canvases: [JSONObject] = []
        for canvasId in (indexObject.object("canvases") ?? JSONObject()).keys {
            guard let raw = files["canvases/\(canvasId).json"] else { continue }
            let document = try JSONParser.parse(raw)
            if CloudDocuments.isCloudCanvasDocument(document), let object = document.objectValue, JS.key(object["canvasId"]) == canvasId {
                canvases.append(object)
            }
        }

        guard let board = BoardParser.parsePersistedBoard(.object(CloudDocuments.joinCloudBoard(index: indexObject, canvases: canvases))) else {
            throw GrovepadPackageError("Package board failed validation")
        }

        var media: [ImportedMedia] = []
        for entry in manifestObject.array("media") ?? [] {
            guard let record = entry.objectValue, let key = record.string("key"), record.isString("key"),
                  let path = record.string("path"), record.isString("path") else { continue }
            guard let data = files[path] else { continue }
            let type = record.isString("type") ? (record.string("type") ?? "") : "application/octet-stream"
            media.append(ImportedMedia(key: key, blob: MediaBlob(bytes: data, type: type)))
        }
        return ImportedPackage(board: board, media: media)
    }

    /// True when the bytes begin with a local ZIP signature (`PK\x03\x04`).
    public static func looksLikeZipArchive(_ bytes: [UInt8]) -> Bool {
        bytes.count >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4b && bytes[2] == 0x03 && bytes[3] == 0x04
    }

    // MARK: - Media keys (widgetMediaKeys.ts, excalidrawFiles.ts)

    /// `excalidrawBlobKey`: a per-widget namespace for Excalidraw file ids.
    public static func excalidrawBlobKey(widgetId: String, fileId: String) -> String {
        "excalidraw:\(widgetId):\(fileId)"
    }

    /// `mediaBlobKeysForWidget` over a serialized widget record: media widgets
    /// store the key at `data.localBlobKey`; sketchpads derive keys from their
    /// Excalidraw file refs and keep an annotation background under
    /// `skinStates.annotation.localBlobKey`. Enumeration ignores `data.mode`.
    public static func mediaBlobKeys(for widget: JSONObject) -> [String] {
        let data = widget.object("data") ?? JSONObject()
        if widget["type"] == .string("media") {
            guard let key = data.string("localBlobKey"), data.isString("localBlobKey"), !key.isEmpty else { return [] }
            return [key]
        }
        if widget["type"] == .string("sketchpad") {
            let widgetId = widget.string("id") ?? ""
            var keys: [String] = []
            for ref in data.object("diagram")?.array("files") ?? [] {
                guard let object = ref.objectValue, object.isString("id"), let id = object.string("id"), !id.isEmpty else { continue }
                keys.append(excalidrawBlobKey(widgetId: widgetId, fileId: id))
            }
            if let annotation = data.object("skinStates")?.object("annotation"), annotation.isString("localBlobKey"),
               let key = annotation.string("localBlobKey"), !key.isEmpty {
                keys.append(key)
            }
            return keys
        }
        return []
    }

    /// `extensionForType`.
    public static func extensionForType(_ type: String) -> String {
        switch type {
        case "image/webp": return "webp"
        case "image/png": return "png"
        case "image/jpeg": return "jpg"
        case "image/gif": return "gif"
        case "image/svg+xml": return "svg"
        case "application/pdf": return "pdf"
        default: return "bin"
        }
    }

    /// `new Date(ms).toISOString()`: `YYYY-MM-DDTHH:mm:ss.sssZ`.
    static func isoString(ms: Double) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: Date(timeIntervalSince1970: ms / 1000))
    }
}
