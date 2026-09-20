import Foundation
// The second of the two non-Foundation imports GrovepadCore allows
// (apple/AGENTS.md law 3): Apple's Compression framework provides the raw
// DEFLATE stream inside the gzip framing the cloud transport uses. Confined
// to this file; `Package/ZipArchive.swift` holds the other use.
import Compression

// ---------------------------------------------------------------------------
// Port of `encodeCloudDocument` / `decodeCloudDocument` from
// `src/utils/cloudDocuments.ts`: canonical JSON → gzip → `\x…` hex bytea,
// checksum = SHA-256 of the canonical JSON (never of the compressed bytes, so
// `canvas_docs.checksum` compares with `fingerprintBoard` directly).
//
// The web writes gzip through `CompressionStream('gzip')` and falls back to
// `identity` where that API is missing; every reader accepts both. The
// compressed bytes themselves are never compared between platforms — only
// what they decompress to.
// ---------------------------------------------------------------------------

public enum CloudDocumentEncoding: String, Equatable {
    case gzip
    case identity
}

public struct EncodedCloudDocument: Equatable {
    /// The PostgreSQL bytea text form: `\x` followed by lowercase hex.
    public var body: String
    public var encoding: CloudDocumentEncoding
    /// SHA-256 hex of the canonical JSON.
    public var checksum: String
    /// Compressed size (`compressedBytes` in the row's meta).
    public var byteLength: Int
    /// UTF-8 size of the canonical JSON (`uncompressedBytes`).
    public var uncompressedBytes: Int

    public init(body: String, encoding: CloudDocumentEncoding, checksum: String, byteLength: Int, uncompressedBytes: Int) {
        self.body = body
        self.encoding = encoding
        self.checksum = checksum
        self.byteLength = byteLength
        self.uncompressedBytes = uncompressedBytes
    }
}

public struct CloudDocumentCodecError: Error, Equatable, CustomStringConvertible {
    public let description: String
    public init(_ description: String) { self.description = description }
}

public enum CloudDocumentCodec {
    // MARK: - Public API

    /// `encodeCloudDocument(value)`.
    public static func encode(_ value: JSONValue) -> EncodedCloudDocument {
        let json = CloudDocuments.canonicalJson(value)
        let source = Array(json.utf8)
        // gzip is always available here; `identity` stays a valid input for
        // rows written by a browser without CompressionStream.
        let (body, encoding): ([UInt8], CloudDocumentEncoding) = {
            if let compressed = Gzip.compress(source) { return (compressed, .gzip) }
            return (source, .identity)
        }()
        return EncodedCloudDocument(
            body: bytesToBytea(body),
            encoding: encoding,
            checksum: SHA256.hex(json),
            byteLength: body.count,
            uncompressedBytes: source.count
        )
    }

    /// `decodeCloudDocument(body, encoding, checksum)`: the JSON value, or a
    /// throw when the bytea is malformed, the stream is not gzip, or the
    /// checksum does not match the decoded text.
    public static func decode(body: String, encoding: CloudDocumentEncoding, checksum: String) throws -> JSONValue {
        let compressed = try byteaToBytes(body)
        let bytes: [UInt8]
        switch encoding {
        case .identity: bytes = compressed
        case .gzip: bytes = try Gzip.decompress(compressed)
        }
        // `new TextDecoder().decode(bytes)` replaces ill-formed UTF-8 rather
        // than throwing; the checksum then refuses anything that was damaged.
        let json = String(decoding: bytes, as: UTF8.self)
        guard SHA256.hex(json) == checksum else { throw CloudDocumentCodecError("Cloud document checksum mismatch") }
        return try JSONParser.parse(json)
    }

    /// `canvasEncoding(meta)`: the row's declared encoding, or nil when the
    /// meta is not one of the two the schema permits.
    public static func encoding(fromMeta meta: JSONValue?) -> CloudDocumentEncoding? {
        guard let object = meta?.objectValue, let raw = object.string("encoding"), object.isString("encoding") else { return nil }
        return CloudDocumentEncoding(rawValue: raw)
    }

    // MARK: - bytea framing

    static func bytesToBytea(_ bytes: [UInt8]) -> String {
        let digits = Array("0123456789abcdef".utf8)
        var text = [UInt8]()
        text.reserveCapacity(bytes.count * 2 + 2)
        text.append(UInt8(ascii: "\\"))
        text.append(UInt8(ascii: "x"))
        for byte in bytes {
            text.append(digits[Int(byte >> 4)])
            text.append(digits[Int(byte & 0x0f)])
        }
        return String(decoding: text, as: UTF8.self)
    }

    /// `byteaToBytes`: a `\x` prefix is optional (PostgREST returns it), the
    /// hex may be either case, and an odd length or a stray character is an error.
    static func byteaToBytes(_ value: String) throws -> [UInt8] {
        var hex = Substring(value)
        if hex.hasPrefix("\\x") { hex = hex.dropFirst(2) }
        let units = Array(hex.utf8)
        guard units.count % 2 == 0 else { throw CloudDocumentCodecError("Invalid bytea body") }
        var bytes = [UInt8]()
        bytes.reserveCapacity(units.count / 2)
        var index = 0
        while index < units.count {
            guard let high = nibble(units[index]), let low = nibble(units[index + 1]) else {
                throw CloudDocumentCodecError("Invalid bytea body")
            }
            bytes.append(high << 4 | low)
            index += 2
        }
        return bytes
    }

    private static func nibble(_ unit: UInt8) -> UInt8? {
        switch unit {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): return unit - UInt8(ascii: "0")
        case UInt8(ascii: "a")...UInt8(ascii: "f"): return unit - UInt8(ascii: "a") + 10
        case UInt8(ascii: "A")...UInt8(ascii: "F"): return unit - UInt8(ascii: "A") + 10
        default: return nil
        }
    }
}

// MARK: - gzip (RFC 1952) over Compression's raw DEFLATE

enum Gzip {
    private static let header: [UInt8] = [0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]

    /// A gzip member: fixed header, raw DEFLATE, CRC-32 and ISIZE little-endian.
    /// Nil only when the codec itself fails, which the caller turns into `identity`.
    static func compress(_ bytes: [UInt8]) -> [UInt8]? {
        guard let deflated = run(bytes, operation: COMPRESSION_STREAM_ENCODE) else { return nil }
        var out = header
        out.append(contentsOf: deflated)
        out.append(contentsOf: littleEndian(ZipArchive.crc32(bytes)))
        out.append(contentsOf: littleEndian(UInt32(truncatingIfNeeded: bytes.count)))
        return out
    }

    /// Strip the gzip framing (including the optional header fields a foreign
    /// writer may set), inflate, and verify CRC-32 and ISIZE.
    static func decompress(_ bytes: [UInt8]) throws -> [UInt8] {
        guard bytes.count >= 18, bytes[0] == 0x1f, bytes[1] == 0x8b else { throw CloudDocumentCodecError("Not a gzip stream") }
        guard bytes[2] == 8 else { throw CloudDocumentCodecError("Unsupported gzip compression method") }
        let flags = bytes[3]
        var offset = 10
        func need(_ count: Int) throws {
            guard offset + count <= bytes.count - 8 else { throw CloudDocumentCodecError("Truncated gzip header") }
        }
        if flags & 0x04 != 0 { // FEXTRA
            try need(2)
            let length = Int(bytes[offset]) | Int(bytes[offset + 1]) << 8
            offset += 2
            try need(length)
            offset += length
        }
        if flags & 0x08 != 0 { try skipZeroTerminated(bytes, &offset) } // FNAME
        if flags & 0x10 != 0 { try skipZeroTerminated(bytes, &offset) } // FCOMMENT
        if flags & 0x02 != 0 { try need(2); offset += 2 } // FHCRC
        let payload = Array(bytes[offset..<(bytes.count - 8)])
        let trailer = Array(bytes[(bytes.count - 8)...])
        let expectedCrc = UInt32(trailer[0]) | UInt32(trailer[1]) << 8 | UInt32(trailer[2]) << 16 | UInt32(trailer[3]) << 24
        let expectedSize = UInt32(trailer[4]) | UInt32(trailer[5]) << 8 | UInt32(trailer[6]) << 16 | UInt32(trailer[7]) << 24
        guard let inflated = run(payload, operation: COMPRESSION_STREAM_DECODE) else {
            throw CloudDocumentCodecError("Corrupt gzip stream")
        }
        guard UInt32(truncatingIfNeeded: inflated.count) == expectedSize, ZipArchive.crc32(inflated) == expectedCrc else {
            throw CloudDocumentCodecError("gzip stream failed its checksum")
        }
        return inflated
    }

    private static func skipZeroTerminated(_ bytes: [UInt8], _ offset: inout Int) throws {
        while offset < bytes.count - 8 {
            offset += 1
            if bytes[offset - 1] == 0 { return }
        }
        throw CloudDocumentCodecError("Truncated gzip header")
    }

    private static func littleEndian(_ value: UInt32) -> [UInt8] {
        [UInt8(value & 0xff), UInt8((value >> 8) & 0xff), UInt8((value >> 16) & 0xff), UInt8((value >> 24) & 0xff)]
    }

    /// Streamed raw DEFLATE in either direction, so output size is never
    /// guessed up front (an incompressible or empty input still round-trips).
    private static func run(_ input: [UInt8], operation: compression_stream_operation) -> [UInt8]? {
        let stream = UnsafeMutablePointer<compression_stream>.allocate(capacity: 1)
        defer { stream.deallocate() }
        guard compression_stream_init(stream, operation, COMPRESSION_ZLIB) != COMPRESSION_STATUS_ERROR else { return nil }
        defer { compression_stream_destroy(stream) }

        let chunk = 64 * 1024
        let destination = UnsafeMutablePointer<UInt8>.allocate(capacity: chunk)
        defer { destination.deallocate() }
        var output: [UInt8] = []
        var failed = false
        // An empty input still needs a valid (empty) source pointer.
        let source = input.isEmpty ? [0] : input
        source.withUnsafeBufferPointer { buffer in
            stream.pointee.src_ptr = buffer.baseAddress!
            stream.pointee.src_size = input.count
            var status: compression_status
            repeat {
                stream.pointee.dst_ptr = destination
                stream.pointee.dst_size = chunk
                status = compression_stream_process(stream, Int32(COMPRESSION_STREAM_FINALIZE.rawValue))
                let produced = chunk - stream.pointee.dst_size
                if produced > 0 { output.append(contentsOf: UnsafeBufferPointer(start: destination, count: produced)) }
                if status == COMPRESSION_STATUS_ERROR { failed = true }
            } while status == COMPRESSION_STATUS_OK
        }
        return failed ? nil : output
    }
}
