import Foundation
import GrovepadCore
import Supabase

// ---------------------------------------------------------------------------
// Port of `src/store/useAuthStore.ts` + `src/lib/supabase.ts` +
// `src/lib/appleSignIn.ts`: the signed-in session, the remembered account,
// sign-in flows (email + password, magic link, Google through the system web
// session, Sign in with Apple through the native sheet), sign-out, and
// account deletion with the server-confirms-first rule.
//
// The app supplies what needs UI: the Apple sheet (`ASAuthorizationController`,
// which yields the identity token for `signInWithApple`), the web session's
// presentation context (`GoogleSignInFlow`), the Apple revocation call to the
// account Worker (`AppleRevoker`), and the local teardown that runs after a
// sign-out (`clearLocalAccountData`).
// ---------------------------------------------------------------------------

public struct CloudConfiguration: Equatable {
    public var url: URL
    public var anonKey: String
    /// Where the OAuth web flow returns. Must be in Supabase's redirect list
    /// (Authentication → URL Configuration) — an owner step, like the web's.
    public var redirectURL: URL

    public init(url: URL, anonKey: String, redirectURL: URL = URL(string: "grovepad://auth/callback")!) {
        self.url = url
        self.anonKey = anonKey
        self.redirectURL = redirectURL
    }

    /// `isConfigured`: both values present and not the placeholder.
    public static func make(urlString: String?, anonKey: String?, redirectURL: URL? = nil) -> CloudConfiguration? {
        guard let urlString, let anonKey, !urlString.isEmpty, !anonKey.isEmpty,
              !urlString.contains("YOUR_"), !anonKey.contains("YOUR_"), let url = URL(string: urlString) else { return nil }
        return CloudConfiguration(url: url, anonKey: anonKey, redirectURL: redirectURL ?? URL(string: "grovepad://auth/callback")!)
    }
}

/// The app's hook for the Google web flow: given the provider URL, present
/// `ASWebAuthenticationSession` and return the callback URL.
public typealias GoogleSignInFlow = @MainActor @Sendable (URL) async throws -> URL

/// Apple requires revoking the person's Apple token before the account goes,
/// and nothing is deleted unless that succeeds. The app shows Apple's sheet
/// for a fresh authorization code and posts it to the account Worker
/// (`POST /api/account/apple/revoke`).
public protocol AppleRevoker: AnyObject {
    func revokeApple(account: AccountSnapshot) async throws
}

public struct AuthSignInResult: Equatable {
    public var canceled: Bool
    public var error: String?

    public init(canceled: Bool, error: String? = nil) {
        self.canceled = canceled
        self.error = error
    }
}

public final class AuthSession {
    public let client: SupabaseClient
    public let remembered: RememberedAccountStore
    /// Runs after the server has signed the person out: board, media,
    /// baselines and caches all belong to the account that is leaving.
    public var clearLocalAccountData: (() async -> Void)?
    public var appleRevoker: AppleRevoker?
    /// Every session change, including the initial one (nil = signed out).
    public var onSession: ((AccountSnapshot?) -> Void)?
    /// A session arrived carrying an OAuth provider token, with the account's
    /// `app_metadata.provider` (`rememberExternalCalendarToken` reads both).
    public var onProviderToken: ((_ token: String, _ provider: String?) -> Void)?

    public private(set) var account: AccountSnapshot?
    public private(set) var rememberedAccount: RememberedAccount?
    /// True until the stored session has been read once.
    public private(set) var loading = true
    private var listener: Task<Void, Never>?

    public init(client: SupabaseClient, remembered: RememberedAccountStore) {
        self.client = client
        self.remembered = remembered
        rememberedAccount = remembered.read()
    }

    /// The SDK client the way `getSupabaseClient` configures it: durable
    /// storage under our own key, PKCE, auto refresh.
    public static func makeClient(_ configuration: CloudConfiguration, storage: DurableAuthStorage) -> SupabaseClient {
        SupabaseClient(
            supabaseURL: configuration.url,
            supabaseKey: configuration.anonKey,
            options: SupabaseClientOptions(
                auth: SupabaseClientOptions.AuthOptions(
                    storage: storage,
                    redirectToURL: configuration.redirectURL,
                    storageKey: DurableAuthStorage.storageKey,
                    flowType: .pkce,
                    autoRefreshToken: true
                )
            )
        )
    }

    // MARK: - Snapshots

    static func snapshot(_ session: Session?) -> AccountSnapshot? {
        guard let session else { return nil }
        let user = session.user
        var metadata = JSONObject()
        for (key, value) in user.userMetadata.sorted(by: { $0.key < $1.key }) { metadata[key] = jsonValue(value) }
        var providers: [String] = []
        if case .array(let list)? = user.appMetadata["providers"] {
            providers += list.compactMap(\.stringValue)
        }
        providers += (user.identities ?? []).map(\.provider)
        return AccountSnapshot(userId: user.id.uuidString.lowercased(), email: user.email, metadata: metadata, providers: providers)
    }

    static func jsonValue(_ value: AnyJSON) -> JSONValue {
        switch value {
        case .null: return .null
        case .bool(let bool): return .bool(bool)
        case .integer(let int): return .number(Double(int))
        case .double(let double): return .number(double)
        case .string(let text): return .string(text)
        case .array(let items): return .array(items.map(jsonValue))
        case .object(let object):
            var result = JSONObject()
            for (key, item) in object.sorted(by: { $0.key < $1.key }) { result[key] = jsonValue(item) }
            return .object(result)
        }
    }

    /// `recordAccount`: keep the remembered account in step with whatever
    /// session just arrived. A nil session is NOT a reason to forget.
    private func adopt(_ session: Session?) {
        let snapshot = Self.snapshot(session)
        if let session, let token = session.providerToken, !token.isEmpty {
            onProviderToken?(token, session.user.appMetadata["provider"]?.stringValue)
        }
        account = snapshot
        loading = false
        if let snapshot {
            let next = AccountProfile.remembered(snapshot)
            if next != rememberedAccount {
                remembered.write(next)
                rememberedAccount = next
            }
        }
        onSession?(snapshot)
    }

    // MARK: - Lifecycle

    /// `ensureAuthInitialized`: read the stored session, then follow changes.
    public func start() {
        guard listener == nil else { return }
        listener = Task { [weak self] in
            guard let self else { return }
            for await (event, session) in self.client.auth.authStateChanges {
                if Task.isCancelled { return }
                switch event {
                case .initialSession, .signedIn, .signedOut, .tokenRefreshed, .userUpdated, .passwordRecovery, .mfaChallengeVerified, .userDeleted:
                    await MainActor.run { self.adopt(session) }
                }
            }
        }
    }

    public func stop() {
        listener?.cancel()
        listener = nil
    }

    // MARK: - Sign-in flows

    public func signIn(email: String, password: String) async -> AuthSignInResult {
        do {
            _ = try await client.auth.signIn(email: email, password: password)
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    /// `signUp`: the create-account path; the confirmation email follows.
    public func signUp(email: String, password: String) async -> AuthSignInResult {
        do {
            _ = try await client.auth.signUp(email: email, password: password)
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    /// Magic link: the email carries the redirect back into the app.
    public func sendMagicLink(email: String, redirectTo: URL? = nil) async -> AuthSignInResult {
        do {
            try await client.auth.signInWithOTP(email: email, redirectTo: redirectTo)
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    /// The link the app was opened with (magic link or OAuth callback).
    public func handle(callback url: URL) async -> AuthSignInResult {
        do {
            _ = try await client.auth.session(from: url)
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    /// Google through the system web session; `flow` presents it.
    public func signInWithGoogle(flow: @escaping GoogleSignInFlow) async -> AuthSignInResult {
        do {
            _ = try await client.auth.signInWithOAuth(provider: .google, launchFlow: flow)
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            if Self.isCancellation(error) { return AuthSignInResult(canceled: true, error: nil) }
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    /// `signInWithAppleNative`: the app ran Apple's sheet with `nonce.hashed`
    /// and hands over the identity token; Supabase checks it against `nonce.raw`.
    public func signInWithApple(identityToken: String, nonce: AppleNonce) async -> AuthSignInResult {
        do {
            _ = try await client.auth.signInWithIdToken(credentials: OpenIDConnectCredentials(provider: .apple, idToken: identityToken, nonce: nonce.raw))
            return AuthSignInResult(canceled: false, error: nil)
        } catch {
            return AuthSignInResult(canceled: false, error: Self.message(error))
        }
    }

    // MARK: - Profile

    /// `updateProfile`: display name and profile colour live in
    /// `user_metadata` (`full_name`, `profile_color`), so every device and
    /// every collaborator sees the same name. The `userUpdated` event that
    /// follows refreshes the account.
    public func updateProfile(displayName: String, profileColor: String) async throws {
        let profile = try AccountProfile.validatedEdit(displayName: displayName, profileColor: profileColor)
        guard account != nil else { throw AccountProfile.EditError(description: "Sign in to update your profile") }
        do {
            _ = try await client.auth.update(user: UserAttributes(data: [
                "full_name": .string(profile.name),
                "profile_color": .string(profile.color),
            ]))
        } catch {
            throw AccountProfile.EditError(description: Self.message(error))
        }
    }

    // MARK: - Calendar grant

    /// `connectExternalCalendar`: a read-only Google grant. A signed-in
    /// account without a Google identity LINKS one (it never silently
    /// becomes a different Grovepad user); otherwise Google signs in again
    /// with consent forced, so Supabase hands out a fresh provider token.
    /// Returns the provider token of the session that comes back.
    public func connectGoogleCalendar(scopes: String, redirectTo: URL, flow: @escaping GoogleSignInFlow) async throws -> String? {
        let current = try? await client.auth.session
        let linked = current?.user.identities?.contains { $0.provider == "google" } ?? false
        let consent: [(name: String, value: String?)] = [(name: "prompt", value: "consent")]
        let session: Session
        if current != nil, !linked {
            let response = try await client.auth.getLinkIdentityURL(provider: .google, scopes: scopes, redirectTo: redirectTo, queryParams: consent)
            let callback = try await flow(response.url)
            session = try await client.auth.session(from: callback)
        } else {
            session = try await client.auth.signInWithOAuth(provider: .google, redirectTo: redirectTo, scopes: scopes, queryParams: consent, launchFlow: flow)
        }
        return session.providerToken
    }

    // MARK: - Leaving

    /// An explicit sign-out is the ONE thing that forgets the account.
    public func signOut() async {
        try? await client.auth.signOut()
        await clearLocalAccountData?()
        remembered.write(nil)
        rememberedAccount = nil
        account = nil
        onSession?(nil)
    }

    public struct DeletionError: Error, Equatable, CustomStringConvertible {
        public let description: String

        public init(description: String) { self.description = description }
    }

    /// `deleteAccount`: Apple revocation first (when the account is an Apple
    /// one and the caller has not already done it), then the
    /// `delete_own_account` RPC, and only once the server confirms is the
    /// local copy destroyed.
    public func deleteAccount(appleRevoked: Bool = false) async throws {
        guard let account else { throw DeletionError(description: "Sign in to delete your account") }
        if AccountProfile.isAppleAccount(account), !appleRevoked {
            guard let appleRevoker else { throw DeletionError(description: "Apple sign-in must be revoked before the account can be deleted") }
            try await appleRevoker.revokeApple(account: account)
        }
        do {
            _ = try await client.rpc("delete_own_account").execute()
        } catch {
            throw DeletionError(description: Self.message(error).isEmpty ? "Could not delete your account" : Self.message(error))
        }
        // Order matters: doing the local wipe first would lose the boards of
        // somebody whose deletion then failed.
        await signOut()
    }

    // MARK: - Helpers

    public static func message(_ error: Error) -> String {
        if let auth = error as? AuthError { return auth.message }
        if let postgrest = error as? PostgrestError { return postgrest.message }
        if let described = error as? CustomStringConvertible { return described.description }
        return String(describing: error)
    }

    public static func isCancellation(_ error: Error) -> Bool {
        if error is CancellationError { return true }
        let text = String(describing: error).lowercased()
        return text.contains("cancel")
    }
}

/// `subscriptions` row for the signed-in account, parsed by the same rule the
/// web uses. A failed read throws so the caller keeps the cached record.
public final class SupabaseSubscriptionSource {
    public let client: SupabaseClient

    public init(client: SupabaseClient) {
        self.client = client
    }

    public func fetch(userId: String) async throws -> SubscriptionRecord? {
        let response = try await client.from("subscriptions")
            .select("plan, status, billing_interval, current_period_end, trial_ends_at, cancel_at_period_end, cloud_retention_until")
            .eq("user_id", value: userId)
            .maybeSingle()
            .execute()
        return SubscriptionRules.parseSubscriptionRow(try PostgrestRows.parse(response.data))
    }
}
