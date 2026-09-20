import SwiftUI
import GrovepadCore
import GrovepadChrome
import GrovepadCloud

// ---------------------------------------------------------------------------
// Settings → Account (`SettingsPanel.tsx` account tab + `AccountChip.tsx`):
// the profile editor (display name + colour in `user_metadata`), how sync is
// doing and the opt-in Cloud sync switch, what the subscription says, sign
// out (the cloud gets one last push, then the device is wiped), and delete
// account (server confirms first — `AuthSession.deleteAccount`; an Apple
// account revokes with Apple first and nothing is deleted if that fails). The
// deletion is armed by typing "delete", as on the web: a mis-tap must not
// reach it. A guest sees the way back to the login page. Every control is a
// 44 pt island.
// ---------------------------------------------------------------------------

@MainActor
@Observable
public final class AccountViewModel {
    public let coordinator: AppCoordinator
    public private(set) var busy = false
    public private(set) var notice: String?
    public var confirmingDeletion = false {
        didSet { if !confirmingDeletion { deletionWord = "" } }
    }
    /// The typed confirmation; deletion arms on "delete".
    public var deletionWord = ""
    /// The account panel's Log out button asks first (logging out wipes
    /// this device).
    public var confirmingSignOut = false
    public var draftName = ""
    public var draftColor = AccountProfile.profileColors[0]
    @ObservationIgnored private var draftSource: String?

    public init(coordinator: AppCoordinator) {
        self.coordinator = coordinator
    }

    public var account: AccountSnapshot? { coordinator.account }
    public var isSignedIn: Bool { account != nil }
    public var hasAccountService: Bool { coordinator.auth != nil }
    public var displayName: String { AccountProfile.displayName(account) }
    public var email: String? { account?.email }
    public var providers: [String] { Array(Set(account?.providers ?? [])).sorted() }

    public var syncLine: String { AccountViewModel.syncLine(coordinator.syncStatus, lastSyncedAt: coordinator.sync?.lastSyncedAt) }

    nonisolated public static func syncLine(_ status: CloudSyncStatus, lastSyncedAt: Double?) -> String {
        switch status {
        case .off: return "Sync is off"
        case .guest: return "Local only — sign in to sync across devices"
        case .saving: return "Syncing…"
        case .synced: return lastSyncedAt.map { "Synced \(relative($0))" } ?? "Synced"
        case .offline: return "Offline — changes are safe here and will sync when the network returns"
        case .error(let message): return "Sync paused: \(message)"
        case .compatibilityBlock(let version): return "The cloud board was saved by a newer Grovepad (format \(version)); update to sync"
        }
    }

    nonisolated static func relative(_ ms: Double) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .short
        return formatter.localizedString(for: Date(timeIntervalSince1970: ms / 1000), relativeTo: Date())
    }

    public var subscriptionLine: String { coordinator.subscriptions.statusLine }
    public var isAppleAccount: Bool { AccountProfile.isAppleAccount(account) }

    // MARK: Profile

    public var savedName: String { AccountProfile.displayName(account) }
    public var savedColor: String { AccountProfile.profileColor(account) }

    /// Reset the drafts whenever the saved profile changes (the web's
    /// `useEffect` on `savedName` / `savedColor`).
    public func syncDrafts() {
        let source = "\(account?.userId ?? "")|\(savedName)|\(savedColor)"
        guard source != draftSource else { return }
        draftSource = source
        draftName = savedName
        draftColor = savedColor
    }

    public var profileChanged: Bool {
        draftName.trimmingCharacters(in: .whitespacesAndNewlines) != savedName || draftColor != savedColor
    }

    public var canSaveProfile: Bool {
        profileChanged && !busy && !draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public func saveProfile() async {
        guard let auth = coordinator.auth, canSaveProfile else { return }
        busy = true
        defer { busy = false }
        do {
            try await auth.updateProfile(displayName: draftName, profileColor: draftColor)
            notice = "Profile updated"
        } catch {
            notice = "\(error)"
        }
    }

    // MARK: Sync switch

    public var cloudSyncOn: Bool {
        get { isSignedIn && coordinator.cloudSyncEnabled }
        set { if isSignedIn { coordinator.setCloudSyncEnabled(newValue) } }
    }

    // MARK: Leaving

    public func signOut() async {
        guard let auth = coordinator.auth, !busy else { return }
        busy = true
        defer { busy = false }
        await coordinator.prepareForSignOut()
        await auth.signOut()
        notice = "Signed out"
    }

    public var deletionArmed: Bool {
        deletionWord.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "delete"
    }

    /// Server-confirms-first: the local copy goes only after the RPC succeeds.
    public func deleteAccount() async {
        guard let auth = coordinator.auth, !busy, deletionArmed else { return }
        busy = true
        defer { busy = false }
        do {
            try await auth.deleteAccount()
            confirmingDeletion = false
            notice = "Your account was deleted"
        } catch {
            notice = "\(error)"
        }
    }

    public func showLogin() { coordinator.leaveGuestMode() }
    public func syncNow() { Task { await coordinator.sync?.syncNow() } }
}

public struct AccountSectionView: View {
    @Bindable private var model: AccountViewModel

    public init(model: AccountViewModel) { self._model = Bindable(model) }

    public var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if model.isSignedIn {
                profileEditor
                statusRow("arrow.triangle.2.circlepath", model.syncLine)
                Island {
                    Toggle(isOn: $model.cloudSyncOn) {
                        Label("Cloud sync", systemImage: "icloud").font(.grove(size: 12, weight: .semibold))
                    }
                    .toggleStyle(.switch)
                    .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget, alignment: .leading)
                }
                statusRow("sparkles", model.subscriptionLine)
                HStack(spacing: 8) {
                    action("Sync now", symbol: "arrow.clockwise") { model.syncNow() }
                        .disabled(!model.cloudSyncOn || model.busy)
                    action("Sign out", symbol: "rectangle.portrait.and.arrow.right") { Task { await model.signOut() } }
                        .disabled(model.busy)
                }
                deleteSection
            } else if model.hasAccountService {
                statusRow("person", "Signed out — local only. Sign in to sync boards across devices.")
                statusRow("sparkles", model.subscriptionLine)
                action("Sign in…", symbol: "person.crop.circle") { model.showLogin() }
            } else {
                statusRow("person", "Accounts are not set up in this build; everything works on this device.")
            }
            if let notice = model.notice {
                Text(notice).font(.grove(size: 11)).foregroundStyle(.secondary).padding(.horizontal, 8)
            }
        }
    }

    /// `AccountProfileSettings`: initial tile, name field, read-only email,
    /// the twelve colours, Save.
    private var profileEditor: some View {
        Island {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    let color = Color(hex: model.draftColor)
                    Text(String((model.draftName.trimmingCharacters(in: .whitespaces).first ?? model.email?.first ?? "?")).uppercased())
                        .font(.grove(size: 14, weight: .bold))
                        .foregroundStyle(color)
                        .frame(width: 40, height: 40)
                        .background(color.opacity(0.13), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(color.opacity(0.33), lineWidth: 1))
                        .accessibilityHidden(true)
                    TextField("Display name", text: $model.draftName)
                        .textFieldStyle(.plain)
                        .font(.grove(size: 13, weight: .semibold))
                        .textContentType(.name)
                        .onChange(of: model.draftName) { _, next in
                            if next.utf16.count > 60 { model.draftName = String(decoding: Array(next.utf16).prefix(60), as: UTF16.self) }
                        }
                        .accessibilityLabel("Display name")
                }
                if let email = model.email {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Email").font(.grove(size: 10)).foregroundStyle(.secondary)
                        Text(email).font(.grove(size: 11)).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }
                if !model.providers.isEmpty {
                    Text("Signed in with \(model.providers.joined(separator: ", "))").font(.grove(size: 10)).foregroundStyle(.secondary)
                }
                HStack(alignment: .center, spacing: 10) {
                    LazyVGrid(columns: Array(repeating: GridItem(.fixed(24), spacing: 6), count: 6), spacing: 6) {
                        ForEach(AccountProfile.profileColors, id: \.self) { hex in
                            let selected = model.draftColor == hex
                            Button { model.draftColor = hex } label: {
                                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(Color(hex: hex))
                                    .frame(width: 24, height: 24)
                                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(selected ? Color(hex: hex) : .clear, lineWidth: 1.5).padding(-3))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Profile color \(hex)")
                            .accessibilityAddTraits(selected ? .isSelected : [])
                        }
                    }
                    .fixedSize()
                    Spacer(minLength: 0)
                    action(model.busy ? "Saving…" : "Save profile", symbol: "checkmark") { Task { await model.saveProfile() } }
                        .frame(maxWidth: 150)
                        .disabled(!model.canSaveProfile)
                }
            }
            .padding(.vertical, 4)
        }
        .onAppear { model.syncDrafts() }
        .onChange(of: model.savedName) { _, _ in model.syncDrafts() }
        .onChange(of: model.savedColor) { _, _ in model.syncDrafts() }
    }

    /// `DeleteAccountSettings`: explain, then a typed word arms the button.
    @ViewBuilder
    private var deleteSection: some View {
        Island {
            VStack(alignment: .leading, spacing: 8) {
                if !model.confirmingDeletion {
                    Text("Delete account").font(.grove(size: 11, weight: .semibold))
                    Text("Permanently removes your account, your synced boards and your uploaded images. Boards saved on this device are not sent anywhere, and exporting them first is the only way to keep them.")
                        .font(.grove(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    action("Delete account", symbol: "trash", danger: true) { model.confirmingDeletion = true }
                        .disabled(model.busy)
                } else {
                    Text("This cannot be undone").font(.grove(size: 11, weight: .semibold))
                    Text("Type **delete** to confirm. Your account, cloud boards and uploaded images are removed immediately.\(model.isAppleAccount ? " Apple will ask you to confirm first, because this account uses Sign in with Apple." : "")")
                        .font(.grove(size: 11)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    TextField("delete", text: $model.deletionWord)
                        .textFieldStyle(.roundedBorder)
                        .autocorrectionDisabled()
                        .disabled(model.busy)
                        .accessibilityLabel("Type delete to confirm")
                        .onSubmit { Task { await model.deleteAccount() } }
                    HStack(spacing: 8) {
                        action(model.busy ? "Deleting…" : "Delete forever", symbol: "trash", danger: true) { Task { await model.deleteAccount() } }
                            .disabled(!model.deletionArmed || model.busy)
                        action("Cancel", symbol: "xmark") { model.confirmingDeletion = false }
                            .disabled(model.busy)
                    }
                }
            }
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func statusRow(_ symbol: String, _ text: String) -> some View {
        Island {
            HStack(spacing: 10) {
                Image(systemName: symbol).foregroundStyle(.secondary)
                Text(text).font(.grove(size: 11, weight: .semibold))
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget, alignment: .leading)
        }
    }

    private func action(_ title: String, symbol: String, danger: Bool = false, run: @escaping () -> Void) -> some View {
        Button(action: run) {
            HStack(spacing: 8) {
                Image(systemName: symbol)
                Text(title)
            }
            .font(.grove(size: 12, weight: .semibold))
            .foregroundStyle(danger ? Color.tone("#fca5a5", light: "#b91c1c") : Color.primary)
            .frame(maxWidth: .infinity, minHeight: GlassTokens.touchTarget)
            .background(Color.lift.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }
}
