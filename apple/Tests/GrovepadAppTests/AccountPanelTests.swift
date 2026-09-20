import XCTest
import SwiftUI
import AppKit
import GrovepadCore
import GrovepadChrome
import GrovepadCloud
@testable import GrovepadApp

/// The account panel grown out of the floating account button, the avatar
/// badge it and the button wear, and the sign-in scene's splash backdrop.
/// Set GROVEPAD_SNAPSHOT_DIR to write each theme's real render as a PNG.
@MainActor
final class AccountPanelTests: XCTestCase {
    private var directory: URL!
    private var windows: [NSWindow] = []

    override func setUp() {
        super.setUp()
        directory = AppFixtures.temporaryDirectory("account-panel")
    }

    override func tearDown() {
        windows.forEach { $0.orderOut(nil) }
        windows = []
        try? FileManager.default.removeItem(at: directory)
        super.tearDown()
    }

    private func signedInCoordinator() -> AppCoordinator {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        var metadata = JSONObject()
        metadata["full_name"] = .string("Ada Lovelace")
        metadata["profile_color"] = .string("#a78bfa")
        coordinator.adoptAccount(AccountSnapshot(userId: "user-1", email: "jada@example.com", metadata: metadata, providers: ["email"]))
        return coordinator
    }

    func testTheAvatarWearsTheProfileNameAndColour() {
        let coordinator = signedInCoordinator()
        let badge = coordinator.settingsAccountBadge
        XCTAssertEqual(badge?.name, "Ada Lovelace", "the initial comes from the profile name, not the email")
        XCTAssertEqual(badge?.colorHex, "#a78bfa")
        let session = coordinator.makeSession()
        XCTAssertEqual(session.environment.settings.accountBadge, badge, "every window gets the badge")
    }

    func testAGuestHasNoBadge() {
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        XCTAssertNil(coordinator.settingsAccountBadge)
    }

    func testThePlanBadgeIsShort() {
        XCTAssertEqual(AccountPanel.planBadge(.free), "Free")
        XCTAssertEqual(AccountPanel.planBadge(.trial), "Air trial")
        XCTAssertEqual(AccountPanel.planBadge(.air), "Air")
        XCTAssertEqual(AccountPanel.planBadge(.grace), "Air · billing issue")
    }

    func testThePanelIsAnIdentityPillWithSyncAndLogOutAsRoundButtons() {
        let coordinator = signedInCoordinator()
        let session = coordinator.makeSession()
        let model = AccountViewModel(coordinator: coordinator)
        let parts = AccountPanel.parts(model: model, settings: session.environment.settings, actions: AccountPanelActions(close: {}, openAllSettings: {}))
        XCTAssertEqual(parts.buttons.map(\.id), ["cloud-sync", "log-out"], "Settings and light/dark come from the shell")
        XCTAssertFalse(parts.buttons[0].isOn, "sync starts off, as on the web")
        XCTAssertTrue(parts.buttons[1].destructive)
        parts.buttons[1].action()
        XCTAssertTrue(model.confirmingSignOut, "Log out asks first; it never signs out on one click")
        XCTAssertNotNil(coordinator.account, "still signed in until confirmed")
        let pill = NSHostingView(rootView: parts.card.frame(height: 40).fixedSize(horizontal: true, vertical: false))
        XCTAssertEqual(pill.fittingSize.height, 40, accuracy: 0.5, "a pill the button's height: it grows sideways only")
        XCTAssertGreaterThan(pill.fittingSize.width, 150)
    }

    func testThePanelGrowsWithItsButtonsInBothThemes() throws {
        let coordinator = signedInCoordinator()
        let session = coordinator.makeSession()
        let settings = session.environment.settings
        let model = AccountViewModel(coordinator: coordinator)
        settings.accountPanelContent = { actions in AccountPanel.parts(model: model, settings: settings, actions: actions) }
        for (name, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
            session.environment.chrome.accountPanelOpen = true
            let layer = AccountPanelLayer(chrome: session.environment.chrome, settings: settings)
                .frame(width: 420, height: 140, alignment: .topLeading)
                .background(Color(nsColor: appearance == .aqua ? .white : .black))
            try snapshot(NSHostingView(rootView: layer), size: CGSize(width: 420, height: 140), appearance: appearance, name: "account-panel-\(name)", settle: 1.0)
        }
    }

    func testTheSignInSceneRendersOverTheSplashField() throws {
        for (name, appearance) in [("light", NSAppearance.Name.aqua), ("dark", .darkAqua)] {
            let login = LoginView(model: LoginViewModel(auth: nil) {})
            let host = NSHostingView(rootView: login)
            try snapshot(host, size: CGSize(width: 1100, height: 800), appearance: appearance, name: "login-\(name)", settle: 2.6)
        }
    }

    private func snapshot(_ host: NSView, size: CGSize, appearance: NSAppearance.Name, name: String, settle: TimeInterval = 0.4) throws {
        let window = NSWindow(contentRect: CGRect(origin: .zero, size: size), styleMask: [.titled], backing: .buffered, defer: false)
        window.appearance = NSAppearance(named: appearance)
        window.contentView = host
        windows.append(window)
        guard let dir = ProcessInfo.processInfo.environment["GROVEPAD_SNAPSHOT_DIR"] else { return }
        window.orderFrontRegardless()
        RunLoop.main.run(until: Date().addingTimeInterval(settle))
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        task.arguments = ["-x", "-o", "-l\(window.windowNumber)", dir + "/\(name).png"]
        try task.run()
        task.waitUntilExit()
    }
}
