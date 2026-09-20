import Foundation

// ---------------------------------------------------------------------------
// Port of `src/collaboration/binaryEncoding.ts`: base64 for Realtime
// payloads, Postgres `bytea` hex (`\x…`) for the durable tables.
// ---------------------------------------------------------------------------

public enum CollaborationBinary {
    public static func base64(_ bytes: Data) -> String {
        bytes.base64EncodedString()
    }

    /// `base64ToBytes`; `atob` rejects malformed input, so this throws too.
    public static func bytes(base64 value: String) throws -> Data {
        guard let data = Data(base64Encoded: value) else { throw CollaborationError("Invalid collaboration base64") }
        return data
    }

    /// `bytesToBytea`.
    public static func bytea(_ bytes: Data) -> String {
        let digits = Array("0123456789abcdef".utf8)
        var hex = [UInt8]()
        hex.reserveCapacity(bytes.count * 2 + 2)
        hex.append(UInt8(ascii: "\\"))
        hex.append(UInt8(ascii: "x"))
        for byte in bytes {
            hex.append(digits[Int(byte >> 4)])
            hex.append(digits[Int(byte & 0x0F)])
        }
        return String(decoding: hex, as: UTF8.self)
    }

    /// `byteaToBytes`.
    public static func bytes(bytea value: String) throws -> Data {
        var hex = Array(value.utf8)
        if hex.count >= 2, hex[0] == UInt8(ascii: "\\"), hex[1] == UInt8(ascii: "x") { hex.removeFirst(2) }
        guard hex.count % 2 == 0 else { throw CollaborationError("Invalid collaboration bytea") }
        func nibble(_ c: UInt8) -> UInt8? {
            switch c {
            case UInt8(ascii: "0")...UInt8(ascii: "9"): return c - UInt8(ascii: "0")
            case UInt8(ascii: "a")...UInt8(ascii: "f"): return c - UInt8(ascii: "a") + 10
            case UInt8(ascii: "A")...UInt8(ascii: "F"): return c - UInt8(ascii: "A") + 10
            default: return nil
            }
        }
        var bytes = Data()
        bytes.reserveCapacity(hex.count / 2)
        var index = 0
        while index < hex.count {
            guard let high = nibble(hex[index]), let low = nibble(hex[index + 1]) else {
                throw CollaborationError("Invalid collaboration bytea")
            }
            bytes.append(high << 4 | low)
            index += 2
        }
        return bytes
    }
}
