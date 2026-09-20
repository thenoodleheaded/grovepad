import Foundation
import GrovepadCore
import GrovepadCloud
#if canImport(AuthenticationServices)
import AuthenticationServices
#endif
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// The UI half of the auth session: the system web session for Google
// (`ASWebAuthenticationSession`, coming back on `grovepad://auth/callback`),
// the Apple sheet run a second time for a fresh authorization code at
// deletion, posted to the account Worker (`POST /api/account/apple/revoke`,
// bearer session — `revokeAppleOnNative` on the web), and the adapter that
// puts `AuthSession` behind the login screen's protocol.
// ---------------------------------------------------------------------------

#if canImport(AuthenticationServices)
/// The window the system web session and Apple's sheet attach to.
@MainActor
final class AuthPresentationAnchor: NSObject, ASWebAuthenticationPresentationContextProviding, ASAuthorizationControllerPresentationContextProviding {
    static let shared = AuthPresentationAnchor()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor }
    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    var anchor: ASPresentationAnchor {
        #if canImport(AppKit)
        return NSApp.keyWindow ?? NSApp.windows.first ?? NSWindow()
        #else
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.flatMap(\.windows).first { $0.isKeyWindow } ?? scenes.first?.windows.first ?? UIWindow()
        #endif
    }
}

public enum WebAuthFlow {
    /// `GoogleSignInFlow`: present the provider URL, return the callback URL.
    @MainActor
    public static func present(_ url: URL, callbackScheme: String = "grovepad") async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { callback, error in
                if let callback { continuation.resume(returning: callback) } else { continuation.resume(throwing: error ?? CancellationError()) }
            }
            session.presentationContextProvider = AuthPresentationAnchor.shared
            session.prefersEphemeralWebBrowserSession = false
            if !session.start() { continuation.resume(throwing: CancellationError()) }
        }
    }
}

/// Apple's sheet for a fresh authorization code (deletion), through a
/// one-shot delegate.
@MainActor
final class AppleCodeRequest: NSObject, ASAuthorizationControllerDelegate {
    private var continuation: CheckedContinuation<String, Error>?

    func run(nonce: AppleNonce) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = []
            request.nonce = nonce.hashed
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = AuthPresentationAnchor.shared
            controller.performRequests()
        }
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let code = (authorization.credential as? ASAuthorizationAppleIDCredential)?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        if let code { continuation?.resume(returning: code) } else { continuation?.resume(throwing: AuthSession.DeletionError(description: AppleRevocation.notConfirmed)) }
        continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        continuation?.resume(throwing: AuthSession.DeletionError(description: canceled ? AppleRevocation.cancelled : AppleRevocation.notConfirmed))
        continuation = nil
    }
}
#endif

/// `revokeAppleOnNative`: Apple confirms, the Worker revokes, and only then
/// does deletion continue. Nothing here stores an Apple token.
public final class AppleRevocation: AppleRevoker {
    public static let endpoint = URL(string: "https://grovepad.app/api/account/apple/revoke")!
    public static let cancelled = "Account not deleted. Apple needs you to confirm before it can be disconnected."
    public static let notConfirmed = "Account not deleted. Apple could not confirm it is you. Try again."

    public let session: AuthSession
    public var fetcher: (URLRequest) async throws -> (Data, URLResponse) = { request in try await URLSession.shared.data(for: request) }

    public init(session: AuthSession) {
        self.session = session
    }

    public func revokeApple(account: AccountSnapshot) async throws {
        #if canImport(AuthenticationServices)
        let nonce = AppleNonce.make()
        let code = try await AppleCodeRequest().run(nonce: nonce)
        let accessToken = try await session.client.auth.session.accessToken
        var request = URLRequest(url: AppleRevocation.endpoint)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "authorization")
        request.setValue("application/json", forHTTPHeaderField: "content-type")
        request.httpBody = Data(JSONWriter.stringify(.object(["code": .string(code)])).utf8)
        let (data, response) = try await fetcher(request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let message = (try? JSONParser.parse(data))?.objectValue?.string("error")
            throw AuthSession.DeletionError(description: "Account not deleted. \(message ?? "Apple could not be disconnected. Try again.")")
        }
        #else
        throw AuthSession.DeletionError(description: AppleRevocation.notConfirmed)
        #endif
    }
}

/// `AuthSession` behind the login screen.
public final class SessionAuthenticator: LoginAuthenticating {
    public let session: AuthSession
    public let configuration: CloudConfiguration

    public init(session: AuthSession, configuration: CloudConfiguration) {
        self.session = session
        self.configuration = configuration
    }

    public func signIn(email: String, password: String) async -> AuthSignInResult { await session.signIn(email: email, password: password) }
    public func signUp(email: String, password: String) async -> AuthSignInResult { await session.signUp(email: email, password: password) }
    public func sendMagicLink(email: String) async -> AuthSignInResult { await session.sendMagicLink(email: email, redirectTo: configuration.redirectURL) }

    public func signInWithGoogle() async -> AuthSignInResult {
        #if canImport(AuthenticationServices)
        return await session.signInWithGoogle { url in try await WebAuthFlow.present(url) }
        #else
        return AuthSignInResult(canceled: false, error: "Google sign-in is not available here")
        #endif
    }

    public func signInWithApple(identityToken: String, nonce: AppleNonce) async -> AuthSignInResult {
        await session.signInWithApple(identityToken: identityToken, nonce: nonce)
    }
}
