import SwiftUI
import GrovepadCore
import GrovepadChrome

// ---------------------------------------------------------------------------
// `GuestBackupNudge.tsx`: once a board that nobody is signed in to holds 15
// cards, a small bar reminds the person it lives only on this device and
// offers the login page. Dismissing it is remembered on the device
// (`grovepad:backup-nudge`). Hidden while a tree is being shaped, and in a
// build with no account service (there is nothing to sign in to).
// ---------------------------------------------------------------------------

public enum GuestBackupNudgeRule {
    public static let dismissedKey = "grovepad:backup-nudge"
    public static let threshold = 15

    public static func isVisible(hasAccountService: Bool, signedIn: Bool, widgetCount: Int, dismissed: Bool, shaping: Bool) -> Bool {
        hasAccountService && !signedIn && widgetCount >= threshold && !dismissed && !shaping
    }
}

struct GuestBackupNudge: View {
    let coordinator: AppCoordinator
    let shaping: Bool
    /// Takes the window to the sign-in scene.
    let signIn: () -> Void
    @State private var dismissed: Bool

    init(coordinator: AppCoordinator, shaping: Bool, signIn: @escaping () -> Void) {
        self.coordinator = coordinator
        self.shaping = shaping
        self.signIn = signIn
        _dismissed = State(initialValue: coordinator.settingsStore.string(forKey: GuestBackupNudgeRule.dismissedKey) == "dismissed")
    }

    var body: some View {
        if GuestBackupNudgeRule.isVisible(
            hasAccountService: coordinator.auth != nil,
            signedIn: coordinator.account != nil,
            widgetCount: coordinator.document.board.widgets.count,
            dismissed: dismissed,
            shaping: shaping
        ) {
            HStack(spacing: 12) {
                Image(systemName: "icloud").foregroundStyle(Color.tone("#fcd34d", light: "#b45309"))
                VStack(alignment: .leading, spacing: 1) {
                    Text("This board lives only on this device").font(.grove(size: 12, weight: .semibold))
                    Text("Sign in to keep it backed up across devices.").font(.grove(size: 10)).foregroundStyle(.secondary)
                }
                Button("Sign in", action: signIn)
                    .buttonStyle(.plain)
                    .font(.grove(size: 11, weight: .semibold))
                    .foregroundStyle(Color.tone("#fde68a", light: "#92400e"))
                    .padding(.horizontal, 10)
                    .frame(minHeight: GlassTokens.touchTarget)
                    .background(Color.tone("#fcd34d", light: "#f59e0b").opacity(0.15), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                Button {
                    dismissed = true
                    coordinator.settingsStore.set("dismissed", forKey: GuestBackupNudgeRule.dismissedKey)
                } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .semibold)).frame(width: GlassTokens.touchTarget, height: GlassTokens.touchTarget)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Dismiss")
            }
            .padding(.leading, 16)
            .padding(.trailing, 4)
            .floatingPill(in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .padding(.bottom, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}
