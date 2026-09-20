import Foundation
// The one non-Foundation import GrovepadCore allows (apple/AGENTS.md law 3):
// Apple's Compression framework provides raw DEFLATE (COMPRESSION_ZLIB is the
// header-less stream a ZIP entry carries), which the web gets from
// CompressionStream('deflate-raw'). It is confined to this file.
import Compression

// ---------------------------------------------------------------------------
// Port of `src/utils/zipArchive.ts`: a dependency-free ZIP reader/writer for
// the `.grovepad` package. Entries are DEFLATEd (method 8) unless compression
// would not shrink them, in which case they are STOREd (method 0); every
// entry carries a CRC-32 that the reader verifies. The result is a spec-valid
// ZIP any archive tool can open.
// ---------------------------------------------------------------------------

public struct ZipEntry: Equatable {
    public var name: String
    public var data: [UInt8]

    public init(name: String, data: [UInt8]) {
        self.name = name
        self.data = data
    }
}

public struct ZipArchiveError: Error, Equatable, CustomStringConvertible {
    public let message: String

    public init(_ message: String) { self.message = message }

    public var description: String { message }
}

public enum ZipArchive {
    /// Ceilings on what an untrusted archive may expand into.
    public static let maxEntries = 10_000
    public static let maxEntryBytes = 256 * 1024 * 1024
    public static let maxTotalBytes = 1024 * 1024 * 1024

    static let localSignature: UInt32 = 0x0403_4b50
    static let centralSignature: UInt32 = 0x0201_4b50
    static let eocdSignature: UInt32 = 0x0605_4b50
    static let utf8Flag: UInt16 = 0x0800

    // MARK: - CRC-32

    private static let crcTable: [UInt32] = (0..<256).map { n -> UInt32 in
        var c = UInt32(n)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xedb8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    public static func crc32(_ bytes: [UInt8]) -> UInt32 {
        var crc: UInt32 = 0xffff_ffff
        for byte in bytes {
            crc = crcTable[Int((crc ^ UInt32(byte)) & 0xff)] ^ (crc >> 8)
        }
        return crc ^ 0xffff_ffff
    }

    // MARK: - Write

    /// Serialize entries into a single spec-compliant ZIP archive.
    public static func create(_ entries: [ZipEntry]) -> [UInt8] {
        var locals: [UInt8] = []
        var centrals: [UInt8] = []
        var offset: UInt32 = 0

        for entry in entries {
            let nameBytes = Array(entry.name.utf8)
            let crc = crc32(entry.data)
            // STORE when DEFLATE would not shrink an already-compressed payload.
            let compressed = deflateRaw(entry.data)
            let stored = compressed == nil || compressed!.count >= entry.data.count
            let method: UInt16 = stored ? 0 : 8
            let body = stored ? entry.data : compressed!

            var local: [UInt8] = []
            local.reserveCapacity(30 + nameBytes.count + body.count)
            append32(&local, localSignature)
            append16(&local, 20)
            append16(&local, utf8Flag)
            append16(&local, method)
            append16(&local, 0) // time
            append16(&local, 0) // date
            append32(&local, crc)
            append32(&local, UInt32(body.count))
            append32(&local, UInt32(entry.data.count))
            append16(&local, UInt16(nameBytes.count))
            append16(&local, 0) // extra length
            local += nameBytes
            local += body
            locals += local

            var central: [UInt8] = []
            central.reserveCapacity(46 + nameBytes.count)
            append32(&central, centralSignature)
            append16(&central, 20)
            append16(&central, 20)
            append16(&central, utf8Flag)
            append16(&central, method)
            append16(&central, 0) // time
            append16(&central, 0) // date
            append32(&central, crc)
            append32(&central, UInt32(body.count))
            append32(&central, UInt32(entry.data.count))
            append16(&central, UInt16(nameBytes.count))
            append16(&central, 0) // extra length
            append16(&central, 0) // comment length
            append16(&central, 0) // disk number
            append16(&central, 0) // internal attributes
            append32(&central, 0) // external attributes
            append32(&central, offset)
            central += nameBytes
            centrals += central

            offset += UInt32(local.count)
        }

        var out = locals + centrals
        append32(&out, eocdSignature)
        append16(&out, 0) // this disk
        append16(&out, 0) // central directory disk
        append16(&out, UInt16(entries.count))
        append16(&out, UInt16(entries.count))
        append32(&out, UInt32(centrals.count))
        append32(&out, offset)
        append16(&out, 0) // comment length
        return out
    }

    private static func append16(_ out: inout [UInt8], _ value: UInt16) {
        out.append(UInt8(value & 0xff))
        out.append(UInt8(value >> 8))
    }

    private static func append32(_ out: inout [UInt8], _ value: UInt32) {
        for shift in stride(from: 0, to: 32, by: 8) { out.append(UInt8((value >> UInt32(shift)) & 0xff)) }
    }

    // MARK: - Read

    /// Extract every entry in central-directory order, decompressing and
    /// verifying each CRC-32. A repeated name keeps the first position with
    /// the last data, as a JavaScript `Map` does.
    public static func read(_ bytes: [UInt8]) throws -> OrderedMap<[UInt8]> {
        guard bytes.count >= 22 else { throw ZipArchiveError("Not a ZIP archive") }
        var totalInflated = 0

        var eocd = -1
        let minScan = max(0, bytes.count - 22 - 0xffff)
        var scan = bytes.count - 22
        while scan >= minScan {
            if try read32(bytes, scan) == eocdSignature {
                eocd = scan
                break
            }
            scan -= 1
        }
        guard eocd >= 0 else { throw ZipArchiveError("Not a ZIP archive: missing end-of-central-directory") }

        let count = Int(try read16(bytes, eocd + 10))
        var ptr = Int(try read32(bytes, eocd + 16))
        var entries = OrderedMap<[UInt8]>()

        for _ in 0..<count {
            guard try read32(bytes, ptr) == centralSignature else { throw ZipArchiveError("Corrupt ZIP central directory") }
            let method = try read16(bytes, ptr + 10)
            let crc = try read32(bytes, ptr + 16)
            let compressedSize = Int(try read32(bytes, ptr + 20))
            let declaredSize = Int(try read32(bytes, ptr + 24))
            let nameLength = Int(try read16(bytes, ptr + 28))
            let extraLength = Int(try read16(bytes, ptr + 30))
            let commentLength = Int(try read16(bytes, ptr + 32))
            let localOffset = Int(try read32(bytes, ptr + 42))
            let name = String(decoding: try slice(bytes, ptr + 46, nameLength), as: UTF8.self)

            guard try read32(bytes, localOffset) == localSignature else { throw ZipArchiveError("Corrupt ZIP entry: \(name)") }
            let localNameLength = Int(try read16(bytes, localOffset + 26))
            let localExtraLength = Int(try read16(bytes, localOffset + 28))
            let dataStart = localOffset + 30 + localNameLength + localExtraLength
            // An entry name is untrusted input: an absolute or `..` path is only
            // ever an attempt to escape whatever the caller writes these into.
            if name.hasPrefix("/") || name.contains("..") || name.contains("\\") {
                throw ZipArchiveError("ZIP entry has an unsafe name: \(name)")
            }
            if entries.count >= maxEntries {
                throw ZipArchiveError("This Grovepad file has too many parts to open safely")
            }

            // The declared size is checked before anything is allocated, so a
            // bomb is refused rather than buffered; the post-inflate checks stay
            // as the backstop for a header that lies about its own size.
            if declaredSize > maxEntryBytes || totalInflated + declaredSize > maxTotalBytes {
                throw ZipArchiveError("ZIP entry \(name) is too large to open safely")
            }
            // `subarray` clamps to the buffer, so a short body fails its CRC below.
            let bodyEnd = min(bytes.count, dataStart + compressedSize)
            let body = dataStart <= bodyEnd ? Array(bytes[dataStart..<bodyEnd]) : []
            let data = method == 0 ? body : try inflateRaw(body, declaredSize: declaredSize, name: name)
            if data.count > maxEntryBytes {
                throw ZipArchiveError("ZIP entry \(name) is too large to open safely")
            }
            totalInflated += data.count
            if totalInflated > maxTotalBytes {
                throw ZipArchiveError("This Grovepad file expands to more than Grovepad will open")
            }
            guard crc32(data) == crc else { throw ZipArchiveError("ZIP entry \(name) failed its checksum") }
            entries[name] = data

            ptr += 46 + nameLength + extraLength + commentLength
        }
        return entries
    }

    /// `DataView.getUint16` — out of range throws, as the RangeError would.
    private static func read16(_ bytes: [UInt8], _ offset: Int) throws -> UInt16 {
        guard offset >= 0, offset + 2 <= bytes.count else { throw ZipArchiveError("Corrupt ZIP archive: truncated header") }
        return UInt16(bytes[offset]) | UInt16(bytes[offset + 1]) << 8
    }

    private static func read32(_ bytes: [UInt8], _ offset: Int) throws -> UInt32 {
        guard offset >= 0, offset + 4 <= bytes.count else { throw ZipArchiveError("Corrupt ZIP archive: truncated header") }
        return UInt32(bytes[offset]) | UInt32(bytes[offset + 1]) << 8 | UInt32(bytes[offset + 2]) << 16 | UInt32(bytes[offset + 3]) << 24
    }

    private static func slice(_ bytes: [UInt8], _ offset: Int, _ length: Int) throws -> ArraySlice<UInt8> {
        guard offset >= 0, length >= 0, offset + length <= bytes.count else { throw ZipArchiveError("Corrupt ZIP archive: truncated header") }
        return bytes[offset..<offset + length]
    }

    // MARK: - DEFLATE

    /// Raw DEFLATE, or nil when the stream would not be smaller than the input
    /// (or the input is empty), which the writer turns into a STOREd entry.
    static func deflateRaw(_ bytes: [UInt8]) -> [UInt8]? {
        guard !bytes.isEmpty else { return nil }
        let capacity = bytes.count
        var written = 0
        let output = [UInt8](unsafeUninitializedCapacity: capacity) { buffer, initialized in
            bytes.withUnsafeBufferPointer { source in
                written = compression_encode_buffer(
                    buffer.baseAddress!, capacity, source.baseAddress!, source.count, nil, COMPRESSION_ZLIB
                )
            }
            initialized = written
        }
        // Zero means an error or an output that did not fit the input's size.
        guard written > 0, written < capacity else { return nil }
        return output
    }

    /// Inflate a raw DEFLATE stream that the central directory says expands to
    /// `declaredSize` bytes (already bounded by the caller).
    static func inflateRaw(_ bytes: [UInt8], declaredSize: Int, name: String) throws -> [UInt8] {
        guard !bytes.isEmpty else {
            if declaredSize == 0 { return [] }
            throw ZipArchiveError("ZIP entry \(name) failed its checksum")
        }
        // One spare byte detects a header that under-declares its own size.
        let capacity = declaredSize + 1
        var written = 0
        let output = [UInt8](unsafeUninitializedCapacity: capacity) { buffer, initialized in
            bytes.withUnsafeBufferPointer { source in
                written = compression_decode_buffer(
                    buffer.baseAddress!, capacity, source.baseAddress!, source.count, nil, COMPRESSION_ZLIB
                )
            }
            initialized = written
        }
        if written > declaredSize {
            throw ZipArchiveError("ZIP entry \(name) is larger than its header declares")
        }
        return Array(output.prefix(written))
    }
}
