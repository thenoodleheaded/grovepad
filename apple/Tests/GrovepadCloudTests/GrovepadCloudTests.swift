import Foundation
import XCTest
import GrovepadCore
import Supabase
@testable import GrovepadCloud

// Three modules export a `JSONObject`; in these tests it is always the port's.
private typealias JSONObject = GrovepadCore.JSONObject
private typealias JSONValue = GrovepadCore.JSONValue

/// Everything in GrovepadCloud that is testable without a network: row
/// mapping, error folding, the Apple nonce, the remembered account and
/// profile rules, durable auth storage, and the client configuration.
/// Real sign-in and real sync against the live project are NOT exercised.
final class GrovepadCloudTests: XCTestCase {
    private var directory: URL!
    private var defaults: UserDefaults!
    private var suiteName: String!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory.appendingPathComponent("grovepad-cloud-\(UUID().uuidString)", isDirectory: true)
        suiteName = "grovepad-cloud-tests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDownWithError() throws {
        defaults.removePersistentDomain(forName: suiteName)
        try? FileManager.default.removeItem(at: directory)
    }

    // MARK: - Rows

    func testResponseBodiesParseIntoTransportRows() throws {
        XCTAssertNil(try PostgrestRows.parse(Data()))
        XCTAssertNil(try PostgrestRows.parse(Data("null".utf8)))
        let index = PostgrestRows.indexRow(try PostgrestRows.parse(Data(#"{"doc":{"format":"grovepad-board-index"},"checksum":"abc","updated_at":"2026-08-21T00:00:00+00:00"}"#.utf8)), includeDocument: true)
        XCTAssertEqual(index, CloudIndexRow(document: ["format": "grovepad-board-index"], checksum: "abc", updatedAt: "2026-08-21T00:00:00+00:00"))
        let meta = PostgrestRows.indexRow(try PostgrestRows.parse(Data(#"{"checksum":"abc","updated_at":null}"#.utf8)), includeDocument: false)
        XCTAssertEqual(meta, CloudIndexRow(document: nil, checksum: "abc", updatedAt: nil))

        let rows = try PostgrestRows.rows(Data(#"[{"canvas_id":"c1","checksum":"x","body":"\\x1f8b","meta":{"encoding":"gzip"}},{"canvas_id":7,"checksum":"y"}]"#.utf8))
        XCTAssertEqual(rows.count, 2)
        XCTAssertEqual(PostgrestRows.canvasRow(rows[0], includeBodies: true), CloudCanvasRow(canvasId: "c1", checksum: "x", body: "\\x1f8b", meta: ["encoding": "gzip"], updatedAt: nil))
        XCTAssertEqual(PostgrestRows.canvasRow(rows[1], includeBodies: false), CloudCanvasRow(canvasId: nil, checksum: "y"), "a non-string id is not coerced")
        XCTAssertEqual(PostgrestRows.legacyRow(try PostgrestRows.parse(Data(#"{"data":{"v":2},"updated_at":"t"}"#.utf8)), includeDocument: true), CloudLegacyRow(data: ["v": 2], updatedAt: "t"))
    }

    func testRequestBodiesCarryTheWebsColumns() {
        var meta = JSONObject()
        meta["encoding"] = .string("gzip")
        meta["compressedBytes"] = .number(12)
        meta["parentCanvasId"] = .null
        meta["ratio"] = .number(0.5)
        let row = PostgrestRows.canvasUpsert(userId: "u", CloudCanvasUpsert(canvasId: "c", body: "\\x00", checksum: "abc", meta: meta))
        XCTAssertEqual(row["user_id"], .string("u"))
        XCTAssertEqual(row["canvas_id"], .string("c"))
        XCTAssertEqual(row["body"], .string("\\x00"))
        XCTAssertEqual(row["checksum"], .string("abc"))
        XCTAssertEqual(row["meta"], AnyJSON.object(["encoding": AnyJSON.string("gzip"), "compressedBytes": AnyJSON.integer(12), "parentCanvasId": AnyJSON.null, "ratio": AnyJSON.double(0.5)]))
        XCTAssertEqual(Set(row.keys), ["user_id", "canvas_id", "body", "checksum", "meta"])

        let index = PostgrestRows.indexUpsert(userId: "u", CloudIndexUpsert(document: ["format": "grovepad-board-index"], checksum: "abc", meta: JSONObject()))
        XCTAssertEqual(Set(index.keys), ["user_id", "doc", "checksum", "meta"])
        XCTAssertEqual(index["doc"], AnyJSON.object(["format": AnyJSON.string("grovepad-board-index")]))

        let legacy = PostgrestRows.legacyUpsert(userId: "u", board: ["v": 2], updatedAt: "now")
        XCTAssertEqual(Set(legacy.keys), ["user_id", "data", "updated_at"])
        XCTAssertEqual(PostgrestRows.anyJSON(.array([.bool(true), .utf16([0xD800])])), AnyJSON.array([AnyJSON.bool(true), AnyJSON.string("\u{FFFD}")]))
    }

    // MARK: - Errors

    func testSdkErrorsFoldIntoTheTransportVocabulary() {
        XCTAssertEqual(SupabaseErrors.transportError(PostgrestError(code: "42P01", message: "relation does not exist")), .schemaMissing)
        XCTAssertEqual(SupabaseErrors.transportError(PostgrestError(code: "PGRST205", message: "schema cache")), .schemaMissing)
        XCTAssertEqual(SupabaseErrors.transportError(PostgrestError(code: "42501", message: "permission denied")), .refused("permission denied"))
        XCTAssertEqual(SupabaseErrors.transportError(PostgrestError(code: "23514", message: "check violation")), .other("check violation"))
        XCTAssertEqual(SupabaseErrors.transportError(URLError(.notConnectedToInternet)), .offline)
        XCTAssertEqual(SupabaseErrors.transportError(URLError(.timedOut)), .offline)
        XCTAssertNotEqual(SupabaseErrors.transportError(URLError(.badServerResponse)), .offline)
        XCTAssertEqual(SupabaseErrors.transportError(CloudTransportError.offline), .offline)
        XCTAssertTrue(SupabaseErrors.isAlreadyUploaded(statusCode: "409", message: nil))
        XCTAssertTrue(SupabaseErrors.isAlreadyUploaded(statusCode: "400", message: "The resource already exists"))
        XCTAssertTrue(SupabaseErrors.isAlreadyUploaded(statusCode: nil, message: "Duplicate"))
        XCTAssertFalse(SupabaseErrors.isAlreadyUploaded(statusCode: "403", message: "new row violates row-level security policy"))
    }

    // MARK: - Apple

    func testAppleNonceIsRawHexAndItsSha256() {
        let nonce = AppleNonce.make(random: { count in [UInt8](repeating: 0xab, count: count) })
        XCTAssertEqual(nonce.raw, String(repeating: "ab", count: 32))
        XCTAssertEqual(nonce.raw.count, 64)
        XCTAssertEqual(nonce.hashed, SHA256.hex(nonce.raw))
        XCTAssertEqual(nonce.hashed.count, 64)
        let fresh = AppleNonce.make()
        XCTAssertNotEqual(fresh.raw, AppleNonce.make().raw)
        XCTAssertTrue(fresh.raw.allSatisfy { "0123456789abcdef".contains($0) })
    }

    func testAppleAccountsAreRecognisedFromIdentitiesOrProviders() {
        let apple = AccountSnapshot(userId: "u", email: nil, metadata: JSONObject(), providers: ["email", "apple"])
        XCTAssertTrue(AccountProfile.isAppleAccount(apple))
        XCTAssertFalse(AccountProfile.isAppleAccount(AccountSnapshot(userId: "u", email: nil, metadata: JSONObject(), providers: ["google"])))
        XCTAssertFalse(AccountProfile.isAppleAccount(nil))
    }

    // MARK: - Profile

    func testDisplayNameAndColourFollowTheWebRules() {
        XCTAssertEqual(AccountProfile.displayName(nil), "Guest")
        var metadata = JSONObject()
        metadata["full_name"] = .string("  Amir Hamza  ")
        let named = AccountSnapshot(userId: "3f1c9b2e-0000-4000-8000-000000000000", email: "amir@example.com", metadata: metadata, providers: [])
        XCTAssertEqual(AccountProfile.displayName(named), "Amir Hamza")
        let fromEmail = AccountSnapshot(userId: "u", email: "someone@example.com", metadata: JSONObject(), providers: [])
        XCTAssertEqual(AccountProfile.displayName(fromEmail), "someone")
        XCTAssertEqual(AccountProfile.displayName(AccountSnapshot(userId: "u", email: nil, metadata: ["name": .number(3)], providers: [])), "Grovepad user")
        let long = AccountSnapshot(userId: "u", email: nil, metadata: ["name": .string(String(repeating: "n", count: 80))], providers: [])
        XCTAssertEqual(AccountProfile.displayName(long).count, 60)

        XCTAssertEqual(AccountProfile.profileColor(nil), "#34d399")
        XCTAssertEqual(AccountProfile.profileColor(AccountSnapshot(userId: "u", email: nil, metadata: ["profile_color": "#818cf8"], providers: [])), "#818cf8")
        XCTAssertEqual(AccountProfile.profileColor(AccountSnapshot(userId: "u", email: nil, metadata: ["profile_color": "#000000"], providers: [])), AccountProfile.fallbackColor(userId: "u"))
        // The fallback hash: `Math.imul(hash ^ code, 16777619)` over "u" (0x75).
        let expected = Int((Int32(0x75) &* 16_777_619).magnitude) % 6
        XCTAssertEqual(AccountProfile.fallbackColor(userId: "u"), AccountProfile.fallbackColors[expected])
        XCTAssertTrue(AccountProfile.fallbackColors.contains(AccountProfile.fallbackColor(userId: "3f1c9b2e-0000-4000-8000-000000000000")))
    }

    // MARK: - Remembered account

    func testRememberedAccountSurvivesEmptyDefaultsAndIsErasedOnlyByForgetting() {
        let store = RememberedAccountStore(defaults: defaults, mirrorDirectory: directory)
        XCTAssertNil(store.read())
        let account = RememberedAccount(id: "u", name: "Amir", color: "#34d399")
        store.write(account)
        XCTAssertEqual(store.read(), account)
        // The defaults are wiped (an app update); the mirror restores it.
        defaults.removeObject(forKey: RememberedAccountStore.key)
        XCTAssertEqual(store.read(), account)
        XCTAssertNotNil(defaults.string(forKey: RememberedAccountStore.key), "put back for the synchronous path")
        store.write(nil)
        XCTAssertNil(store.read())
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.appendingPathComponent("last-account.json").path))
        XCTAssertNil(RememberedAccount.parse(["id": "u", "name": "n"]))
        XCTAssertFalse(store.isGuest)
        store.isGuest = true
        XCTAssertTrue(store.isGuest)
    }

    // MARK: - Durable auth storage

    func testDurableAuthStorageMirrorsEveryWriteAndRestoresFromTheMirror() throws {
        let storage = DurableAuthStorage(defaults: defaults, mirrorDirectory: directory)
        XCTAssertNil(try storage.retrieve(key: DurableAuthStorage.storageKey))
        let session = Data(#"{"access_token":"x"}"#.utf8)
        try storage.store(key: DurableAuthStorage.storageKey, value: session)
        XCTAssertEqual(try storage.retrieve(key: DurableAuthStorage.storageKey), session)
        XCTAssertTrue(FileManager.default.fileExists(atPath: storage.mirrorURL(DurableAuthStorage.storageKey).path))
        defaults.removeObject(forKey: "grovepad.auth." + DurableAuthStorage.storageKey)
        XCTAssertEqual(try storage.retrieve(key: DurableAuthStorage.storageKey), session, "restored from the mirror")
        try storage.remove(key: DurableAuthStorage.storageKey)
        XCTAssertNil(try storage.retrieve(key: DurableAuthStorage.storageKey))
        XCTAssertFalse(FileManager.default.fileExists(atPath: storage.mirrorURL(DurableAuthStorage.storageKey).path))
        XCTAssertEqual(DurableAuthStorage.storageKey, "grovepad:auth:v1")
    }

    // MARK: - Configuration and client

    func testConfigurationRefusesPlaceholdersAndBuildsAClient() {
        XCTAssertNil(CloudConfiguration.make(urlString: nil, anonKey: "k"))
        XCTAssertNil(CloudConfiguration.make(urlString: "https://YOUR_PROJECT.supabase.co", anonKey: "k"))
        XCTAssertNil(CloudConfiguration.make(urlString: "https://ijzmhkyhjptaitfxjlcu.supabase.co", anonKey: ""))
        let configuration = CloudConfiguration.make(urlString: "https://ijzmhkyhjptaitfxjlcu.supabase.co", anonKey: "anon-key")
        XCTAssertEqual(configuration?.redirectURL, URL(string: "grovepad://auth/callback"))
        let client = AuthSession.makeClient(configuration!, storage: DurableAuthStorage(defaults: defaults, mirrorDirectory: directory))
        XCTAssertNotNil(client.auth)
        XCTAssertNil(client.auth.currentSession, "nothing stored: signed out, no network touched")
        let session = AuthSession(client: client, remembered: RememberedAccountStore(defaults: defaults, mirrorDirectory: directory))
        XCTAssertNil(session.account)
        XCTAssertNil(session.rememberedAccount)
        XCTAssertTrue(session.loading)
        _ = SupabaseCloudTransport(client: client)
        _ = SupabaseMediaTransport(client: client)
        _ = SupabaseSubscriptionSource(client: client)
    }

    func testAnyJsonSnapshotsKeepUserMetadata() {
        let value = AuthSession.jsonValue(AnyJSON.object(["full_name": AnyJSON.string("A"), "n": AnyJSON.integer(2), "d": AnyJSON.double(1.5), "list": AnyJSON.array([AnyJSON.null, AnyJSON.bool(true)])]))
        let expected: JSONValue = ["d": 1.5, "full_name": "A", "list": [JSONValue.null, true], "n": 2]
        XCTAssertEqual(value, expected)
    }
    // MARK: - Profile edits (`updateProfile`)

    func testProfileEditsTrimCapAndRefuseUnknownColours() throws {
        let edit = try AccountProfile.validatedEdit(displayName: "  Ada  ", profileColor: "#818cf8")
        XCTAssertEqual(edit.name, "Ada")
        XCTAssertEqual(edit.color, "#818cf8")
        XCTAssertEqual(try AccountProfile.validatedEdit(displayName: String(repeating: "a", count: 80), profileColor: "#34d399").name.count, 60)
        XCTAssertThrowsError(try AccountProfile.validatedEdit(displayName: "   ", profileColor: "#34d399")) { error in
            XCTAssertEqual((error as? AccountProfile.EditError)?.description, "Enter a display name")
        }
        XCTAssertThrowsError(try AccountProfile.validatedEdit(displayName: "Ada", profileColor: "#000000")) { error in
            XCTAssertEqual((error as? AccountProfile.EditError)?.description, "Choose a profile color")
        }
        XCTAssertEqual(AccountProfile.profileColors.count, 12)
    }
}
