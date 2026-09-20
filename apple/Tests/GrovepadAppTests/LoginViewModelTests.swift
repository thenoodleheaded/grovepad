import XCTest
import GrovepadCloud
@testable import GrovepadApp

/// The login screen's model: provider visibility per platform, the guest
/// exit, the magic-link precondition, the sign-in / create-account paths,
/// the Apple nonce hand-off.
@MainActor
final class LoginViewModelTests: XCTestCase {
    func testProviderVisibilityFollowsTheWebRule() {
        XCTAssertEqual(LoginViewModel.visibleProviders(platform: .iOS), [.apple], "the iOS app offers Apple alone")
        XCTAssertEqual(LoginViewModel.visibleProviders(platform: .mac), [.google, .apple])
        XCTAssertEqual(LoginViewModel(auth: nil, platform: .iOS, onGuest: {}).providers, [.apple])
    }

    func testGuestIsAFirstClassExitEvenWithoutAnAccountService() {
        var guest = 0
        let model = LoginViewModel(auth: nil, platform: .mac) { guest += 1 }
        XCTAssertFalse(model.isConfigured)
        model.continueAsGuest()
        XCTAssertEqual(guest, 1)
    }

    func testMagicLinkNeedsAnEmailFirst() async {
        let auth = FakeLoginAuth()
        let model = LoginViewModel(auth: auth, platform: .mac, onGuest: {})
        await model.sendMagicLink()
        XCTAssertEqual(model.notice, LoginViewModel.Notice(kind: .error, text: "Enter your email above first — the magic link goes there."))
        XCTAssertEqual(auth.calls, [])
        model.email = " me@example.com "
        await model.sendMagicLink()
        XCTAssertEqual(auth.calls, ["magic:me@example.com"])
        XCTAssertEqual(model.notice?.kind, .success)
        XCTAssertNil(model.busy)
    }

    func testPasswordSubmitFollowsTheMode() async {
        let auth = FakeLoginAuth()
        let model = LoginViewModel(auth: auth, platform: .mac, onGuest: {})
        model.email = "me@example.com"
        model.password = "secret"
        await model.submitPassword()
        XCTAssertEqual(auth.calls, ["signIn:me@example.com"])
        XCTAssertNil(model.notice, "a successful sign-in says nothing; the session change does")
        model.toggleMode()
        XCTAssertEqual(model.primaryLabel, "Create account")
        XCTAssertEqual(model.toggleLabel, "Sign in instead")
        await model.submitPassword()
        XCTAssertEqual(auth.calls.last, "signUp:me@example.com")
        XCTAssertEqual(model.notice, LoginViewModel.Notice(kind: .success, text: "Account created — check your inbox to confirm your email."))
        auth.result = AuthSignInResult(canceled: false, error: "Invalid login credentials")
        model.toggleMode()
        await model.submitPassword()
        XCTAssertEqual(model.notice, LoginViewModel.Notice(kind: .error, text: "Invalid login credentials"))
    }

    func testAppleHandsTheRawNonceToTheSession() async {
        let auth = FakeLoginAuth()
        let model = LoginViewModel(auth: auth, platform: .iOS, onGuest: {})
        let nonce = model.prepareAppleRequest()
        XCTAssertEqual(model.busy, "apple")
        XCTAssertEqual(nonce.hashed.count, 64, "the request carries the SHA-256 hex of the raw nonce")
        await model.completeApple(identityToken: "token-1", canceled: false, failure: nil)
        XCTAssertEqual(auth.calls, ["apple:token-1:\(nonce.raw)"])
        XCTAssertNil(model.busy)

        _ = model.prepareAppleRequest()
        await model.completeApple(identityToken: nil, canceled: true, failure: nil)
        XCTAssertNil(model.notice, "a cancelled sheet is not an error")
        XCTAssertEqual(auth.calls.count, 1)
    }

    func testGoogleReportsTheProviderError() async {
        let auth = FakeLoginAuth()
        auth.result = AuthSignInResult(canceled: false, error: "popup blocked")
        let model = LoginViewModel(auth: auth, platform: .mac, onGuest: {})
        await model.signInWithGoogle()
        XCTAssertEqual(model.notice?.text, "popup blocked")
    }
}
