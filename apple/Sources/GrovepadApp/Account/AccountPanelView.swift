import SwiftUI
import GrovepadCore
import GrovepadChrome
import GrovepadCloud

// ---------------------------------------------------------------------------
// The account panel that grows out of the floating account button
// (`AccountPanelLayer` owns the shell and the motion). Owner's layout,
// 19 Sep 2026: the button stretches into a horizontal pill that is identity
// only — the button's avatar at its left end, name with the plan as a badge,
// email. Settings, light/dark, Cloud sync and Log out are round buttons
// under it (the shell draws Settings and light/dark; the other two are added
// here). Profile name, colour and everything else live in Settings ▸ Account.
// ---------------------------------------------------------------------------

enum AccountPanel {
    @MainActor
    static func parts(model: AccountViewModel, settings: SettingsModel, actions: AccountPanelActions) -> AccountPanelParts {
        let syncOn = model.cloudSyncOn
        return AccountPanelParts(
            card: AnyView(AccountPanelCard(model: model, settings: settings, actions: actions)),
            buttons: [
                AccountPanelButton(
                    id: "cloud-sync",
                    symbol: syncOn ? "icloud.fill" : "icloud.slash",
                    label: syncOn ? "Cloud sync is on — turn off" : "Cloud sync is off — turn on",
                    isOn: syncOn
                ) { model.cloudSyncOn.toggle() },
                AccountPanelButton(id: "log-out", symbol: "rectangle.portrait.and.arrow.right", label: "Log out", destructive: true) {
                    model.confirmingSignOut = true
                },
            ]
        )
    }

    /// The badge's word for the plan (`statusLine` in two words or fewer).
    static func planBadge(_ source: EntitlementSource) -> String {
        switch source {
        case .free: return "Free"
        case .trial: return "Air trial"
        case .air: return "Air"
        case .grace: return "Air · billing issue"
        }
    }
}

struct AccountPanelCard: View {
    @Bindable var model: AccountViewModel
    let settings: SettingsModel
    let actions: AccountPanelActions

    /// The pill: the button's avatar at the left end, then who is signed in.
    var body: some View {
        HStack(spacing: 10) {
            // The button, still in its place: pressing it folds the pill away.
            Button(action: actions.close) {
                AccountAvatar(account: settings.account, badge: settings.accountBadge, size: 22)
                    .labelStyle(.iconOnly)
                    .frame(width: 40, height: 40)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Close account panel")
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(model.displayName)
                        .font(.grove(size: 12, weight: .semibold))
                        .lineLimit(1)
                    planBadge
                }
                if let email = model.email {
                    Text(email)
                        .font(.grove(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: 260, alignment: .leading)
            .padding(.trailing, 16)
        }
        // Logging out wipes this device (the web's rule), so the round Log
        // out button asks first and says plainly what happens to the boards.
        .confirmationDialog("Log out of Grovepad?", isPresented: $model.confirmingSignOut, titleVisibility: .visible) {
            Button("Log out", role: .destructive) {
                actions.close()
                Task { await model.signOut() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(model.cloudSyncOn
                 ? "Your boards are uploaded one last time, then removed from this device. Sign in again to get them back."
                 : "Cloud sync is off, so the boards on this device are not backed up. Logging out removes them — export them first to keep them.")
        }
    }

    private var planBadge: some View {
        let source = model.coordinator.subscription.entitlements.source
        let paid = source != .free
        return Text(AccountPanel.planBadge(source))
            .font(.grove(size: 9, weight: .bold))
            .tracking(0.3)
            .lineLimit(1)
            .fixedSize()
            .foregroundStyle(paid ? Color.tone("#bef264", light: "#3f6212") : Color.secondary)
            .padding(.horizontal, 6)
            .frame(height: 15)
            .background(paid ? Color(hex: "#84cc16").opacity(0.18) : Color.lift.opacity(0.08), in: Capsule())
            .overlay(Capsule().strokeBorder(paid ? Color(hex: "#84cc16").opacity(0.35) : GlassTokens.stroke, lineWidth: 1))
            .accessibilityLabel("Plan: \(AccountPanel.planBadge(source))")
    }
}
