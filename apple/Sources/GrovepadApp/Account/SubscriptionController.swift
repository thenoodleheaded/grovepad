import Foundation
import GrovepadCore

// ---------------------------------------------------------------------------
// The subscription row the way `useSubscriptionStore` holds it, with the App
// Store receipt folded in (`StoreKitEntitlementMapping.resolve`): the web's
// row wins whenever it entitles, a StoreKit entitlement fills in otherwise.
// Cache first (a plane keeps a paying customer working), then the network,
// and a failed read never revokes anything. Every real gate is the server's.
// ---------------------------------------------------------------------------

/// The `subscriptions` row for an account (`SupabaseSubscriptionSource` in
/// the app; a fake in tests). Nil = no row.
public protocol SubscriptionRowSource: AnyObject {
    func fetch(userId: String) async throws -> SubscriptionRecord?
}

@MainActor
public final class SubscriptionController {
    public private(set) var state = SubscriptionState()
    public let cache: SubscriptionCacheStore
    public let clock: Clock
    public var rowSource: SubscriptionRowSource?
    public var entitlementSource: StoreKitEntitlementSource?
    /// Observed by the UI; called after every state change.
    public var onChange: ((SubscriptionState) -> Void)?
    private var refreshTask: Task<Void, Never>?

    public init(cache: SubscriptionCacheStore, clock: Clock = .system, rowSource: SubscriptionRowSource? = nil, entitlementSource: StoreKitEntitlementSource? = nil) {
        self.cache = cache
        self.clock = clock
        self.rowSource = rowSource
        self.entitlementSource = entitlementSource
    }

    private func publish() { onChange?(state) }

    /// A session arrived (or left). Seeds from cache, then refreshes.
    public func adopt(userId: String?) {
        refreshTask?.cancel()
        refreshTask = nil
        guard let userId else {
            state.reset()
            publish()
            return
        }
        state.adopt(userId: userId, cached: cache.read(userId: userId), nowMs: clock.nowMs())
        publish()
        refresh()
    }

    /// Re-read the web row and the App Store entitlements.
    public func refresh() {
        guard let userId = state.userId else { return }
        refreshTask?.cancel()
        refreshTask = Task { [weak self] in
            guard let self else { return }
            await self.refreshNow(userId: userId)
        }
    }

    /// Wait for the refresh `adopt` or `refresh` started (tests).
    public func settle() async {
        await refreshTask?.value
    }

    /// Awaitable refresh (tests).
    public func refreshNow(userId: String) async {
        guard state.userId == userId else { return }
        let appStore = await appStoreRecord()
        var web: SubscriptionRecord?
        var failure: String?
        if let rowSource {
            do { web = try await rowSource.fetch(userId: userId) } catch { failure = String(describing: error) }
        }
        guard state.userId == userId, !Task.isCancelled else { return }
        let now = clock.nowMs()
        if let failure, appStore == nil {
            state.applyFetchFailure(failure)
            publish()
            return
        }
        let record = StoreKitEntitlementMapping.resolve(web: web, appStore: appStore, nowMs: now)
        state.applyFetched(record, nowMs: now)
        cache.write(SubscriptionCacheStore.Entry(userId: userId, record: record, fetchedAt: now))
        publish()
    }

    /// The App Store receipt alone, as the record the web would hold.
    public func appStoreRecord() async -> SubscriptionRecord? {
        guard let entitlementSource else { return nil }
        let entitlements = await entitlementSource.currentEntitlements()
        return StoreKitEntitlementMapping.record(from: entitlements, nowMs: clock.nowMs())
    }

    /// A grace window can close mid-session (scene activation).
    public func revalidate() {
        state.revalidate(nowMs: clock.nowMs())
        publish()
    }

    /// Plain words for the account section's status row.
    public var statusLine: String {
        Self.statusLine(state, nowMs: clock.nowMs())
    }

    public static func statusLine(_ state: SubscriptionState, nowMs: Double) -> String {
        guard state.userId != nil else { return "Free — everything on this device, no cloud sync" }
        let entitlements = state.entitlements
        let origin = state.record?.origin == .appStore ? " (App Store)" : ""
        switch entitlements.source {
        case .free:
            if let days = SubscriptionRules.cloudRetentionDaysRemaining(state.record, nowMs: nowMs) {
                return "Free — cloud copies kept \(days) more day\(days == 1 ? "" : "s")"
            }
            return "Free — everything on this device, no cloud sync"
        case .trial:
            let days = SubscriptionRules.trialDaysRemaining(state.record, nowMs: nowMs) ?? 0
            return "Grovepad Air trial — \(days) day\(days == 1 ? "" : "s") left\(origin)"
        case .air:
            if state.record?.cancelAtPeriodEnd == true { return "Grovepad Air — ends at the period's close\(origin)" }
            return "Grovepad Air\(origin)"
        case .grace:
            return "Grovepad Air — payment needs attention\(origin)"
        }
    }
}

#if canImport(StoreKit)
import StoreKit

/// StoreKit 2 behind `StoreKitEntitlementSource`: the current entitlements
/// and their renewal info, as the facts the mapping consumes.
public final class StoreKitTransactionSource: StoreKitEntitlementSource {
    public init() {}

    public func currentEntitlements() async -> [StoreKitEntitlement] {
        var result: [StoreKitEntitlement] = []
        for await verification in Transaction.currentEntitlements {
            guard case .verified(let transaction) = verification else { continue }
            guard StoreKitEntitlementMapping.products[transaction.productID] != nil else { continue }
            var willAutoRenew = true
            var inBillingRetry = false
            var inGrace = false
            if let status = await transaction.subscriptionStatus, case .verified(let renewal) = status.renewalInfo {
                willAutoRenew = renewal.willAutoRenew
                inBillingRetry = renewal.isInBillingRetry
                if let grace = renewal.gracePeriodExpirationDate { inGrace = grace > Date() }
            }
            let isTrial = transaction.offer?.type == .introductory
            result.append(StoreKitEntitlement(
                productId: transaction.productID,
                expiresAtMs: transaction.expirationDate.map { $0.timeIntervalSince1970 * 1000 },
                revokedAtMs: transaction.revocationDate.map { $0.timeIntervalSince1970 * 1000 },
                isTrial: isTrial,
                willAutoRenew: willAutoRenew,
                isInBillingRetry: inBillingRetry,
                isInGracePeriod: inGrace
            ))
        }
        return result
    }

    /// Follow `Transaction.updates` (a purchase, renewal or refund landing
    /// while the app runs) and call back for a refresh. Returns a canceller.
    public func observeUpdates(_ onUpdate: @escaping @MainActor () -> Void) -> () -> Void {
        let task = Task.detached {
            for await verification in Transaction.updates {
                if case .verified(let transaction) = verification { await transaction.finish() }
                await onUpdate()
            }
        }
        return { task.cancel() }
    }
}
#endif
