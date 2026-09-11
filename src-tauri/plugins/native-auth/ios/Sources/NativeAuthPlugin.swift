import AuthenticationServices
import Foundation
import Tauri
import UIKit

private final class SignInWithAppleArgs: Decodable {
    let nonce: String
}

private struct AppleCredentialResponse: Encodable {
    let identityToken: String
    let authorizationCode: String?
    let givenName: String?
    let familyName: String?
}

/// Shows Apple's native Sign in with Apple sheet and hands the ID token back to
/// the web layer, which redeems it with Supabase.
final class NativeAuthPlugin: Plugin {
    /// ASAuthorizationController holds its delegate weakly, so the in-flight
    /// request is owned here until Apple calls back. Main thread only.
    private var pending: AppleSignInFlow?

    @objc public func signInWithApple(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(SignInWithAppleArgs.self)
        DispatchQueue.main.async {
            guard self.pending == nil else {
                invoke.reject("Apple sign-in is already in progress")
                return
            }
            let flow = AppleSignInFlow(
                invoke: invoke,
                nonce: args.nonce,
                anchor: self.manager.viewController?.view.window
            ) { [weak self] in
                self?.pending = nil
            }
            self.pending = flow
            flow.start()
        }
    }
}

private final class AppleSignInFlow: NSObject,
    ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    private let invoke: Invoke
    private let nonce: String
    private let anchor: UIWindow?
    private let finished: () -> Void

    init(invoke: Invoke, nonce: String, anchor: UIWindow?, finished: @escaping () -> Void) {
        self.invoke = invoke
        self.nonce = nonce
        self.anchor = anchor
        self.finished = finished
    }

    func start() {
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        // Already SHA-256 hashed by the frontend; Apple embeds it in the token.
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        controller.performRequests()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }

    func authorizationController(
        controller: ASAuthorizationController,
        didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        defer { finished() }
        guard
            let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
            let tokenData = credential.identityToken,
            let identityToken = String(data: tokenData, encoding: .utf8)
        else {
            invoke.reject("Apple did not return an identity token")
            return
        }
        invoke.resolve(AppleCredentialResponse(
            identityToken: identityToken,
            authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) },
            givenName: credential.fullName?.givenName,
            familyName: credential.fullName?.familyName
        ))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        defer { finished() }
        // The frontend matches this exact text to treat a dismissal as a quiet cancel.
        if let authorizationError = error as? ASAuthorizationError, authorizationError.code == .canceled {
            invoke.reject("Apple sign-in canceled")
        } else {
            invoke.reject("Apple sign-in failed: \(error.localizedDescription)")
        }
    }
}

@_cdecl("init_plugin_native_auth")
func initPlugin() -> Plugin {
    NativeAuthPlugin()
}
