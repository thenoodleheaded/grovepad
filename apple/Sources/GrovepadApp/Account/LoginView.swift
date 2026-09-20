import SwiftUI
import GrovepadCore
import GrovepadChrome
import GrovepadCloud
#if canImport(AuthenticationServices)
import AuthenticationServices
#endif

// ---------------------------------------------------------------------------
// The login gate (`components/auth/LoginPage.tsx`): email + password with a
// sign-in / create-account toggle, the magic link, the quick providers, and
// "Continue as guest" as a first-class local-only path, not an afterthought.
//
// Provider visibility follows `visibleOAuthProviderIds`: the iOS app offers
// Apple alone (its web-redirect providers cannot come back to the app, and
// App Review expects Sign in with Apple wherever a third-party sign-in
// appears); the Mac shows Google and Apple. The view model is platform-
// neutral and tested on the build Mac; the view answers the four touch
// questions: every control is 44 pt, nothing hovers, nothing needs Escape.
// ---------------------------------------------------------------------------

public enum LoginPlatform: Equatable, Sendable {
    case mac
    case iOS

    public static var current: LoginPlatform {
        #if os(macOS)
        return .mac
        #else
        return .iOS
        #endif
    }
}

public enum OAuthProvider: String, CaseIterable, Identifiable, Sendable {
    case google
    case apple

    public var id: String { rawValue }
    public var label: String { self == .google ? "Google" : "Apple" }
}

/// What the login screen needs from the account service. `AuthSession`
/// fills it in the app; tests use a scripted fake.
public protocol LoginAuthenticating: AnyObject {
    func signIn(email: String, password: String) async -> AuthSignInResult
    func signUp(email: String, password: String) async -> AuthSignInResult
    func sendMagicLink(email: String) async -> AuthSignInResult
    func signInWithGoogle() async -> AuthSignInResult
    func signInWithApple(identityToken: String, nonce: AppleNonce) async -> AuthSignInResult
}

@MainActor
@Observable
public final class LoginViewModel {
    public enum Mode: Equatable, Sendable { case signin, signup }
    public struct Notice: Equatable, Sendable {
        public enum Kind: Equatable, Sendable { case error, success }
        public var kind: Kind
        public var text: String
    }

    public var mode: Mode = .signin
    public var email = ""
    public var password = ""
    /// Which control is working: "password", "magic", "google", "apple".
    public private(set) var busy: String?
    public private(set) var notice: Notice?
    public let platform: LoginPlatform
    public let providers: [OAuthProvider]
    @ObservationIgnored private let auth: LoginAuthenticating?
    @ObservationIgnored private let onGuest: () -> Void
    @ObservationIgnored private var appleNonce: AppleNonce?

    public init(auth: LoginAuthenticating?, platform: LoginPlatform = .current, onGuest: @escaping () -> Void) {
        self.auth = auth
        self.platform = platform
        self.onGuest = onGuest
        providers = LoginViewModel.visibleProviders(platform: platform)
    }

    /// `visibleOAuthProviderIds(ids, nativeApple)`.
    public static func visibleProviders(platform: LoginPlatform) -> [OAuthProvider] {
        platform == .iOS ? OAuthProvider.allCases.filter { $0 == .apple } : OAuthProvider.allCases
    }

    public var isConfigured: Bool { auth != nil }
    public var isBusy: Bool { busy != nil }
    public var primaryLabel: String { mode == .signin ? "Sign in" : "Create account" }
    public var toggleLabel: String { mode == .signin ? "Create account" : "Sign in instead" }

    public func toggleMode() {
        mode = mode == .signin ? .signup : .signin
        notice = nil
    }

    private func fail(_ text: String) { notice = Notice(kind: .error, text: text) }
    private func succeed(_ text: String) { notice = Notice(kind: .success, text: text) }

    public func submitPassword() async {
        guard let auth else { return }
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty, !password.isEmpty else {
            fail("Enter your email and password.")
            return
        }
        notice = nil
        busy = "password"
        defer { busy = nil }
        let result = mode == .signin ? await auth.signIn(email: email, password: password) : await auth.signUp(email: email, password: password)
        if let error = result.error {
            fail(error)
        } else if mode == .signup {
            succeed("Account created — check your inbox to confirm your email.")
        }
    }

    public func sendMagicLink() async {
        guard let auth else { return }
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !email.isEmpty else {
            fail("Enter your email above first — the magic link goes there.")
            return
        }
        notice = nil
        busy = "magic"
        defer { busy = nil }
        let result = await auth.sendMagicLink(email: email)
        if let error = result.error { fail(error) } else { succeed("Magic link sent — check your inbox.") }
    }

    public func signInWithGoogle() async {
        guard let auth else { return }
        notice = nil
        busy = "google"
        defer { busy = nil }
        let result = await auth.signInWithGoogle()
        if let error = result.error { fail(error) }
    }

    /// Before Apple's sheet: a fresh nonce, its hash goes into the request.
    public func prepareAppleRequest() -> AppleNonce {
        let nonce = AppleNonce.make()
        appleNonce = nonce
        notice = nil
        busy = "apple"
        return nonce
    }

    /// After Apple's sheet: the identity token is redeemed with the raw nonce.
    public func completeApple(identityToken: String?, canceled: Bool, failure: String?) async {
        defer { busy = nil }
        guard let auth, let nonce = appleNonce else { return }
        appleNonce = nil
        if canceled { return }
        guard let identityToken else {
            fail(failure ?? "Apple did not return a sign-in token. Please try again.")
            return
        }
        let result = await auth.signInWithApple(identityToken: identityToken, nonce: nonce)
        if let error = result.error { fail(error) }
    }

    public func continueAsGuest() { onGuest() }
}

// MARK: - View

/// The sign-in screen, a port of `LoginPage.tsx` built from system glass:
/// the sprout and wordmark, the headline, then one Liquid Glass card holding
/// glass fields, the lime Sign in button, Create account beside Continue as
/// guest, the magic link, and Google beside Apple — over the web's two
/// ambient blooms. It is a whole scene: it fills the window at launch and
/// whenever a guest presses the account button, and "Continue as guest"
/// brings the board back. The web page is dark only; here every colour is a
/// pair (`LoginPalette`) so it follows Settings ▸ Appearance.
public struct LoginView: View {
    @Bindable private var model: LoginViewModel
    @FocusState private var focus: Field?
    #if canImport(AuthenticationServices)
    @State private var apple = AppleSignInCoordinator()
    #endif

    private enum Field: Hashable { case email, password }

    public init(model: LoginViewModel) {
        self._model = Bindable(model)
    }

    private typealias P = LoginPalette

    public var body: some View {
        ZStack {
            LoginBackdrop()
            ScrollView {
                content
                    .frame(maxWidth: 448)
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 44)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollIndicators(.hidden)
            .defaultScrollAnchor(.center)
        }
        #if os(macOS)
        // The scene runs up under the traffic lights: no title-bar plate.
        .toolbarBackgroundVisibility(.hidden, for: .windowToolbar)
        #endif
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Sign in")
    }

    private var content: some View {
        VStack(spacing: 28) {
            VStack(spacing: 12) {
                GrovepadLogo().frame(width: 64, height: 64)
                (Text("grove").foregroundStyle(P.ink) + Text("pad").foregroundStyle(P.limeInk))
                    .font(.grove(size: 20, weight: .bold))
                    .tracking(-0.4)
                    .accessibilityLabel("grovepad")
            }
            Text("Make your trees work smart.")
                .font(.grove(size: 30, weight: .bold))
                .tracking(-0.6)
                .multilineTextAlignment(.center)
                .foregroundStyle(P.headline)
                .frame(maxWidth: 380)
                .fixedSize(horizontal: false, vertical: true)
            card
        }
    }

    // MARK: The card

    private var card: some View {
        VStack(spacing: 10) {
            if !model.isConfigured {
                banner("Accounts aren't set up in this build yet. Guest mode works in the meantime.", tint: P.amber)
                    .padding(.bottom, 6)
            }
            GlassEffectContainer(spacing: 10) {
                VStack(spacing: 10) {
                    field { TextField("", text: $model.email, prompt: Text("Email").foregroundStyle(P.placeholder)) }
                        .textContentType(.emailAddress)
                        #if os(iOS)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        #endif
                        .focused($focus, equals: .email)
                        .onSubmit { focus = .password }
                        .accessibilityLabel("Email")
                    field { SecureField("", text: $model.password, prompt: Text("Password").foregroundStyle(P.placeholder)) }
                        .textContentType(model.mode == .signin ? .password : .newPassword)
                        .focused($focus, equals: .password)
                        .onSubmit { Task { await model.submitPassword() } }
                        .accessibilityLabel("Password")
                    primaryButton
                    HStack(spacing: 8) {
                        glassButton(tint: P.quietTint) { model.toggleMode() } label: {
                            Text(model.toggleLabel).foregroundStyle(P.secondaryInk)
                        }
                        .accessibilityLabel(model.toggleLabel)
                        glassButton(tint: P.guestTint, action: model.continueAsGuest) {
                            HStack(spacing: 6) {
                                Text("Continue as guest")
                                Image(systemName: "arrow.right").font(.system(size: 11, weight: .bold))
                            }
                            .foregroundStyle(P.guestInk)
                        }
                        .accessibilityLabel("Continue as guest")
                    }
                }
            }
            .disabled(model.isBusy)

            Button {
                Task { await model.sendMagicLink() }
            } label: {
                HStack(spacing: 4) {
                    if model.busy == "magic" { ProgressView().controlSize(.mini) } else { Image(systemName: "wand.and.stars") }
                    Text("Magic link")
                }
                .font(.grove(size: 11))
                .foregroundStyle(P.muted)
                .frame(minHeight: 28)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(!model.isConfigured || model.isBusy)
            .accessibilityLabel("Send a magic link")

            if let notice = model.notice {
                banner(notice.text, tint: notice.kind == .error ? P.danger : P.limeInk)
                    .accessibilityAddTraits(notice.kind == .error ? [] : [.updatesFrequently])
            }

            HStack(spacing: 12) {
                Rectangle().fill(P.rule).frame(height: 1)
                Text("OR").font(.grove(size: 10)).tracking(2.2).foregroundStyle(P.placeholder)
                Rectangle().fill(P.rule).frame(height: 1)
            }
            .padding(.vertical, 12)
            .accessibilityHidden(true)

            GlassEffectContainer(spacing: 8) {
                HStack(spacing: 8) {
                    ForEach(model.providers) { provider in providerButton(provider) }
                }
            }
        }
        .padding(isCompact ? 24 : 32)
        .background {
            // The web's brighter card surface, under the system glass.
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(LinearGradient(colors: P.cardFill, startPoint: .top, endPoint: .bottom))
        }
        .glassEffect(.regular.tint(P.cardTint), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(P.cardStroke, lineWidth: 1))
        // A wide contact shadow and the low lime bloom picked up from the brand.
        .shadow(color: P.cardShadow, radius: 30, y: 20)
        .shadow(color: P.bloom, radius: 40)
    }

    private var isCompact: Bool {
        #if os(iOS)
        return true
        #else
        return false
        #endif
    }

    private func field<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        content()
            .textFieldStyle(.plain)
            .font(.grove(size: 14))
            .foregroundStyle(P.ink)
            .autocorrectionDisabled()
            .padding(.horizontal, 14)
            .frame(height: GlassTokens.touchTarget)
            .glassEffect(.regular.tint(P.fieldTint).interactive(), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(P.fieldStroke, lineWidth: 1))
            .disabled(!model.isConfigured)
    }

    private var primaryButton: some View {
        Button {
            Task { await model.submitPassword() }
        } label: {
            HStack(spacing: 8) {
                if model.busy == "password" {
                    ProgressView().controlSize(.small).tint(Color(hex: "#0a0a0a"))
                } else {
                    Text(model.primaryLabel)
                    Image(systemName: "arrow.right").font(.system(size: 12, weight: .bold))
                }
            }
            .font(.grove(size: 14, weight: .semibold))
            .foregroundStyle(Color(hex: "#0a0a0a"))
            .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(P.limeDeep.opacity(0.92)).interactive(), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .keyboardShortcut(.defaultAction)
        .disabled(!model.isConfigured || model.isBusy)
        .opacity(model.isConfigured ? 1 : 0.4)
        .accessibilityLabel(model.primaryLabel)
    }

    private func glassButton<Label: View>(tint: Color, action: @escaping () -> Void, @ViewBuilder label: () -> Label) -> some View {
        Button(action: action) {
            label()
                .font(.grove(size: 14, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(tint).interactive(), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(P.fieldStroke, lineWidth: 1))
    }

    private func banner(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.grove(size: 11))
            .lineSpacing(2)
            .foregroundStyle(tint.opacity(0.9))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(tint.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(tint.opacity(0.25), lineWidth: 1))
    }

    @ViewBuilder
    private func providerButton(_ provider: OAuthProvider) -> some View {
        let busy = model.busy == provider.rawValue
        Button {
            switch provider {
            case .google:
                Task { await model.signInWithGoogle() }
            case .apple:
                #if canImport(AuthenticationServices)
                let nonce = model.prepareAppleRequest()
                apple.start(nonce: nonce.hashed) { token, canceled, failure in
                    Task { await model.completeApple(identityToken: token, canceled: canceled, failure: failure) }
                }
                #endif
            }
        } label: {
            HStack(spacing: 8) {
                if busy {
                    ProgressView().controlSize(.small)
                } else if provider == .google {
                    GoogleMark().frame(width: 16, height: 16)
                } else {
                    Image(systemName: "apple.logo").font(.system(size: 15, weight: .medium))
                }
                Text(busy ? "Connecting…" : provider.label)
            }
            .font(.grove(size: 13, weight: .medium))
            .foregroundStyle(P.ink)
            .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.tint(P.quietTint).interactive(), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(P.fieldStroke, lineWidth: 1))
        .disabled(!model.isConfigured || model.isBusy)
        .opacity(model.isConfigured ? 1 : 0.4)
        .help("Continue with \(provider.label)")
        .accessibilityLabel("Continue with \(provider.label)")
    }
}

/// Every colour on the sign-in scene as a dark/light pair. Dark is the web's
/// `LoginPage.tsx` exactly; light is the same layout on the app's paper
/// ground (`GlassTokens.ground`), with the lime deepened wherever it is ink
/// (the bright lime is unreadable on white) and white glass for the wells.
enum LoginPalette {
    /// `--color-emerald-400` / `-500` in the app theme (a lime, not the
    /// stock emerald): oklch(88% 0.31 136) and oklch(76% 0.26 133).
    static let lime = Color(hex: "#63ff00")
    static let limeDeep = Color(hex: "#67d000")

    static let ink = Color.tone("#f5f5f5", light: "#1a241e")
    static let headline = Color.tone("#fafafa", light: "#111a14")
    static let secondaryInk = Color.tone("#e5e5e5", light: "#2c3830")
    static let placeholder = Color.tone("#525252", light: "#8b948e")
    static let muted = Color.tone("#737373", light: "#6b746e")
    static let rule = Color.adaptive(light: Color.black.opacity(0.08), dark: Color(hex: "#262626"))
    /// The lime used as text: the brand lime on black, a deep leaf on paper.
    static let limeInk = Color.tone("#63ff00", light: "#2f8f00")
    static let guestInk = Color.tone("#86ef5a", light: "#2f7d12")
    static let guestTint = Color.adaptive(light: Color(hex: "#67d000").opacity(0.16), dark: lime.opacity(0.14))
    static let amber = Color.tone("#fbbf24", light: "#b45309")
    static let danger = Color.tone("#f87171", light: "#b91c1c")

    static let cardFill: [Color] = [
        .adaptive(light: Color.white.opacity(0.78), dark: Color(hex: "#121813").opacity(0.55)),
        .adaptive(light: Color(hex: "#f1f6ee").opacity(0.85), dark: Color(hex: "#0a0f0b").opacity(0.7)),
    ]
    static let cardTint = Color.adaptive(light: Color.white.opacity(0.4), dark: Color(hex: "#121813").opacity(0.35))
    static let cardStroke = Color.adaptive(light: Color.black.opacity(0.08), dark: Color.white.opacity(0.07))
    static let cardShadow = Color.adaptive(light: Color(red: 20 / 255, green: 28 / 255, blue: 24 / 255).opacity(0.16), dark: Color.black.opacity(0.75))
    static let bloom = Color.adaptive(light: Color(hex: "#67d000").opacity(0.12), dark: lime.opacity(0.16))
    /// Text-field wells: a breath of white on black, a soft grey-green on paper.
    static let fieldTint = Color.adaptive(light: Color(hex: "#e9efe6").opacity(0.9), dark: Color.white.opacity(0.04))
    static let fieldStroke = Color.adaptive(light: Color.black.opacity(0.06), dark: .clear)
    /// Secondary buttons (Create account, Google, Apple).
    static let quietTint = Color.adaptive(light: Color(hex: "#e9efe6").opacity(0.9), dark: Color.white.opacity(0.03))

}

/// Behind the sign-in card: the boot splash's living field (`SplashBackdrop`
/// — aurora, drifting grid, the six-card board with pulsing wires, vignette),
/// so launch and sign-in read as one scene. It follows the colour scheme.
struct LoginBackdrop: View {
    var body: some View {
        SplashBackdrop()
    }
}

#if canImport(AuthenticationServices)
/// Runs Sign in with Apple from our own glass button (the system's
/// `SignInWithAppleButton` cannot wear Liquid Glass): one request with the
/// hashed nonce, the identity token handed back as a string.
@MainActor
final class AppleSignInCoordinator: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private var completion: ((String?, Bool, String?) -> Void)?
    private var controller: ASAuthorizationController?

    func start(nonce: String, completion: @escaping (String?, Bool, String?) -> Void) {
        self.completion = completion
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.email, .fullName]
        request.nonce = nonce
        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self
        self.controller = controller
        controller.performRequests()
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        let credential = authorization.credential as? ASAuthorizationAppleIDCredential
        let token = credential?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
        Task { @MainActor in self.finish(token, false, nil) }
    }

    nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let canceled = (error as? ASAuthorizationError)?.code == .canceled
        let message = canceled ? nil : error.localizedDescription
        Task { @MainActor in self.finish(nil, canceled, message) }
    }

    nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            #if os(macOS)
            return NSApplication.shared.keyWindow ?? NSApplication.shared.windows.first ?? ASPresentationAnchor()
            #else
            let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? ASPresentationAnchor()
            #endif
        }
    }

    private func finish(_ token: String?, _ canceled: Bool, _ failure: String?) {
        completion?(token, canceled, failure)
        completion = nil
        controller = nil
    }
}
#endif
