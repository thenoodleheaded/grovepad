import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// Port of `createAppleNonce` (`src/lib/appleSignIn.ts`), per
// docs/apple-sign-in.md: the RAW nonce goes to Supabase, which hashes it and
// compares with the token's claim; the HASHED nonce goes to Apple
// (`ASAuthorizationAppleIDRequest.nonce`) and is embedded in the ID token.
// ---------------------------------------------------------------------------

public struct AppleNonce: Equatable {
    /// Sent to Supabase (`signInWithIdToken(nonce:)`).
    public let raw: String
    /// SHA-256 hex of `raw`, set on the Apple request.
    public let hashed: String

    public init(raw: String) {
        self.raw = raw
        self.hashed = SHA256.hex(raw)
    }

    /// 32 random bytes as lowercase hex, hashed. `random` is injectable for tests.
    public static func make(random: (Int) -> [UInt8] = AppleNonce.secureRandom) -> AppleNonce {
        AppleNonce(raw: random(32).map { String(format: "%02x", $0) }.joined())
    }

    public static func secureRandom(_ count: Int) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
        if status != errSecSuccess {
            // Never silently weak: fall back to the system generator rather than zeros.
            bytes = (0..<count).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes
    }
}
