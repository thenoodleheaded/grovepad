import Foundation

// ---------------------------------------------------------------------------
// Port of `src/subscription/entitlements.ts` (the one owner of "what does this
// account get") and the cache half of `src/store/useSubscriptionStore.ts`,
// plus the rule that maps a StoreKit 2 entitlement onto the same record the
// web reads from `public.subscriptions`.
//
// This file is pure: a record in, an entitlement out, no clock of its own and
// no network. The server mirror is `public.has_air_entitlement()`; the grace
// window is duplicated there and pinned by `SubscriptionStateTests`.
//
// The line the whole plan rests on: anything on the user's own machine is
// free forever. Nothing here gates a local board, a widget, a skin or an
// export. The real StoreKit call lives in the app target behind
// `StoreKitEntitlementSource`; GrovepadCore never imports StoreKit.
// ---------------------------------------------------------------------------

public enum SubscriptionPlan: String, Equatable, CaseIterable {
    case air
    case airStudent = "air_student"
}

public enum SubscriptionStatus: String, Equatable, CaseIterable {
    case trialing
    case active
    case pastDue = "past_due"
    case canceled
    case lapsed
}

public enum BillingInterval: String, Equatable, CaseIterable {
    case month
    case year
}

/// Where the record came from. The web only ever sees `.web` (Polar through
/// the billing webhook); the native app can also hold an App Store receipt.
public enum SubscriptionOrigin: String, Equatable {
    case web
    case appStore = "app_store"
}

/// A normalised `public.subscriptions` row. Dates are ISO-8601 or nil.
public struct SubscriptionRecord: Equatable {
    public var plan: SubscriptionPlan
    public var status: SubscriptionStatus
    public var billingInterval: BillingInterval
    public var currentPeriodEnd: String?
    public var trialEndsAt: String?
    public var cancelAtPeriodEnd: Bool
    /// When cloud copies are deleted after a lapse. Nil while the plan is live.
    public var cloudRetentionUntil: String?
    public var origin: SubscriptionOrigin

    public init(
        plan: SubscriptionPlan,
        status: SubscriptionStatus,
        billingInterval: BillingInterval,
        currentPeriodEnd: String? = nil,
        trialEndsAt: String? = nil,
        cancelAtPeriodEnd: Bool = false,
        cloudRetentionUntil: String? = nil,
        origin: SubscriptionOrigin = .web
    ) {
        self.plan = plan
        self.status = status
        self.billingInterval = billingInterval
        self.currentPeriodEnd = currentPeriodEnd
        self.trialEndsAt = trialEndsAt
        self.cancelAtPeriodEnd = cancelAtPeriodEnd
        self.cloudRetentionUntil = cloudRetentionUntil
        self.origin = origin
    }
}

/// Why the current entitlement is what it is — for honest UI copy, not gating.
public enum EntitlementSource: String, Equatable {
    case free, trial, air, grace
}

public struct HostedSessionLimits: Equatable {
    public var maxParticipants: Int
    public var perBoardDailySeconds: Int?
    public var monthlyHostSeconds: Int?
}

public struct Entitlements: Equatable {
    public var isSubscribed: Bool
    public var source: EntitlementSource
    /// Push this account's own canvases to the cloud. Joining is always free.
    public var canSync: Bool
    public var canPublish: Bool
    /// PDF and PNG export. JSON and Markdown export are never gated.
    public var canExportRendered: Bool
    public var canUseCloudWidgets: Bool
    public var attachmentQuotaBytes: Int
    public var versionHistoryDays: Int
    public var hostedSession: HostedSessionLimits
    public var cloudRetentionDays: Int
}

public enum SubscriptionRules {
    /// MIRRORED in SQL as `interval '7 days'`. Change both or neither.
    public static let entitlementGraceDays = 7
    public static let cloudRetentionDays = 90
    public static let airAttachmentQuotaBytes = 10 * 1024 * 1024 * 1024
    public static let airVersionHistoryDays = 365
    public static let airMaxParticipants = 10
    public static let airMonthlyHostSeconds = 40 * 60 * 60
    public static let freePerBoardDailySeconds = 20 * 60
    public static let freeMaxParticipants = 10
    static let msPerDay: Double = 24 * 60 * 60 * 1000

    static let entitledStatuses: Set<SubscriptionStatus> = [.trialing, .active, .pastDue, .canceled]

    /// What an account with no subscription gets. A signed-out guest and a
    /// signed-in free account get exactly this.
    public static let freeEntitlements = Entitlements(
        isSubscribed: false,
        source: .free,
        canSync: false,
        canPublish: false,
        canExportRendered: false,
        canUseCloudWidgets: false,
        attachmentQuotaBytes: 0,
        versionHistoryDays: 0,
        hostedSession: HostedSessionLimits(maxParticipants: freeMaxParticipants, perBoardDailySeconds: freePerBoardDailySeconds, monthlyHostSeconds: nil),
        cloudRetentionDays: cloudRetentionDays
    )

    static func subscribed(_ source: EntitlementSource) -> Entitlements {
        Entitlements(
            isSubscribed: true,
            source: source,
            canSync: true,
            canPublish: true,
            canExportRendered: true,
            canUseCloudWidgets: true,
            attachmentQuotaBytes: airAttachmentQuotaBytes,
            versionHistoryDays: airVersionHistoryDays,
            hostedSession: HostedSessionLimits(maxParticipants: airMaxParticipants, perBoardDailySeconds: nil, monthlyHostSeconds: airMonthlyHostSeconds),
            cloudRetentionDays: cloudRetentionDays
        )
    }

    /// `Date.parse` for the ISO-8601 strings these records carry.
    public static func parseTime(_ value: String?) -> Double? {
        guard let value else { return nil }
        return CloudBoardClient.parseTime(value)
    }

    /// `Date#toISOString`: `2026-08-21T00:00:00.000Z`.
    public static func isoString(ms: Double) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        return formatter.string(from: Date(timeIntervalSince1970: (ms / 1000).rounded(.down) + (ms.truncatingRemainder(dividingBy: 1000)) / 1000))
    }

    /// `deriveEntitlements(record, nowMs)`: the verdict.
    public static func deriveEntitlements(_ record: SubscriptionRecord?, nowMs: Double) -> Entitlements {
        guard let record, entitledStatuses.contains(record.status) else { return freeEntitlements }
        let periodEnd = parseTime(record.currentPeriodEnd)
        // No end date means the provider has not told us one yet; the status
        // alone is trusted, and the reconciliation sweep corrects a stale row.
        if let periodEnd, nowMs >= periodEnd + Double(entitlementGraceDays) * msPerDay { return freeEntitlements }
        let withinPaidPeriod = periodEnd.map { nowMs < $0 } ?? true
        if record.status == .trialing { return subscribed(withinPaidPeriod ? .trial : .grace) }
        if !withinPaidPeriod { return subscribed(.grace) }
        if record.status == .pastDue { return subscribed(.grace) }
        return subscribed(.air)
    }

    /// Days left before a lapsed account's cloud copies are deleted, or nil.
    public static func cloudRetentionDaysRemaining(_ record: SubscriptionRecord?, nowMs: Double) -> Int? {
        guard let until = parseTime(record?.cloudRetentionUntil) else { return nil }
        return max(0, Int(((until - nowMs) / msPerDay).rounded(.up)))
    }

    /// Whole days left in a trial, or nil when the account is not trialling.
    public static func trialDaysRemaining(_ record: SubscriptionRecord?, nowMs: Double) -> Int? {
        guard let record, record.status == .trialing else { return nil }
        guard let endsAt = parseTime(record.trialEndsAt) ?? parseTime(record.currentPeriodEnd) else { return nil }
        return max(0, Int(((endsAt - nowMs) / msPerDay).rounded(.up)))
    }

    // MARK: - Parsing

    /// `parseSubscriptionRow`: validate a PostgREST row before it is trusted.
    /// An unknown or malformed row reads as no subscription, never as Air.
    public static func parseSubscriptionRow(_ row: JSONValue?) -> SubscriptionRecord? {
        guard let object = row?.objectValue,
              let plan = object.string("plan").flatMap(SubscriptionPlan.init(rawValue:)),
              let status = object.string("status").flatMap(SubscriptionStatus.init(rawValue:)),
              let interval = object.string("billing_interval").flatMap(BillingInterval.init(rawValue:)) else { return nil }
        return SubscriptionRecord(
            plan: plan,
            status: status,
            billingInterval: interval,
            currentPeriodEnd: isoField(object["current_period_end"]),
            trialEndsAt: isoField(object["trial_ends_at"]),
            cancelAtPeriodEnd: object["cancel_at_period_end"] == .bool(true),
            cloudRetentionUntil: isoField(object["cloud_retention_until"]),
            origin: object.string("origin").flatMap(SubscriptionOrigin.init(rawValue:)) ?? .web
        )
    }

    static func isoField(_ value: JSONValue?) -> String? {
        guard let text = value?.stringValue, value?.isString == true, parseTime(text) != nil else { return nil }
        return text
    }

    /// The row shape (`toRow`), also what the cache stores.
    public static func serializeRecord(_ record: SubscriptionRecord) -> JSONObject {
        var row = JSONObject()
        row["plan"] = .string(record.plan.rawValue)
        row["status"] = .string(record.status.rawValue)
        row["billing_interval"] = .string(record.billingInterval.rawValue)
        row["current_period_end"] = record.currentPeriodEnd.map { .string($0) } ?? .null
        row["trial_ends_at"] = record.trialEndsAt.map { .string($0) } ?? .null
        row["cancel_at_period_end"] = .bool(record.cancelAtPeriodEnd)
        row["cloud_retention_until"] = record.cloudRetentionUntil.map { .string($0) } ?? .null
        row["origin"] = .string(record.origin.rawValue)
        return row
    }
}

// MARK: - StoreKit 2 mapping

/// The facts a StoreKit 2 `Transaction` / `RenewalInfo` pair yields, without
/// the framework: the app target fills this in and hands it over.
public struct StoreKitEntitlement: Equatable {
    public var productId: String
    /// `Transaction.expirationDate`, epoch ms.
    public var expiresAtMs: Double?
    /// `Transaction.revocationDate` (refund or family-sharing removal).
    public var revokedAtMs: Double?
    /// `Transaction.offer?.type == .introductory` — the free trial.
    public var isTrial: Bool
    /// `RenewalInfo.willAutoRenew`.
    public var willAutoRenew: Bool
    /// `RenewalInfo.isInBillingRetry`.
    public var isInBillingRetry: Bool
    /// `RenewalInfo.gracePeriodExpirationDate != nil` and in the future.
    public var isInGracePeriod: Bool

    public init(productId: String, expiresAtMs: Double?, revokedAtMs: Double? = nil, isTrial: Bool = false, willAutoRenew: Bool = true, isInBillingRetry: Bool = false, isInGracePeriod: Bool = false) {
        self.productId = productId
        self.expiresAtMs = expiresAtMs
        self.revokedAtMs = revokedAtMs
        self.isTrial = isTrial
        self.willAutoRenew = willAutoRenew
        self.isInBillingRetry = isInBillingRetry
        self.isInGracePeriod = isInGracePeriod
    }
}

/// The app target implements this over `Transaction.currentEntitlements`.
public protocol StoreKitEntitlementSource: AnyObject {
    func currentEntitlements() async -> [StoreKitEntitlement]
}

public enum StoreKitEntitlementMapping {
    /// Product ids as they must be registered in App Store Connect; each maps
    /// to the plan and interval the web's `subscriptions` row carries.
    public static let products: [String: (plan: SubscriptionPlan, interval: BillingInterval)] = [
        "app.grovepad.air.yearly": (.air, .year),
        "app.grovepad.air.monthly": (.air, .month),
        "app.grovepad.air.student.yearly": (.airStudent, .year),
        "app.grovepad.air.student.monthly": (.airStudent, .month),
    ]

    /// One entitlement → the record the web would hold for the same person.
    ///
    ///   revoked                          → lapsed, retention clock from the revocation
    ///   expired past the grace window    → lapsed, retention clock from expiry
    ///   billing retry / grace period     → past_due (dunning, still entitled)
    ///   introductory offer               → trialing
    ///   auto-renew switched off          → canceled at period end (still entitled)
    ///   otherwise                        → active
    public static func record(from entitlement: StoreKitEntitlement, nowMs: Double) -> SubscriptionRecord? {
        guard let product = products[entitlement.productId] else { return nil }
        let periodEnd = entitlement.expiresAtMs.map(SubscriptionRules.isoString)
        let retention = { (fromMs: Double) in SubscriptionRules.isoString(ms: fromMs + Double(SubscriptionRules.cloudRetentionDays) * SubscriptionRules.msPerDay) }
        if let revokedAt = entitlement.revokedAtMs {
            return SubscriptionRecord(plan: product.plan, status: .lapsed, billingInterval: product.interval, currentPeriodEnd: periodEnd, cloudRetentionUntil: retention(revokedAt), origin: .appStore)
        }
        if let expiresAt = entitlement.expiresAtMs,
           nowMs >= expiresAt + Double(SubscriptionRules.entitlementGraceDays) * SubscriptionRules.msPerDay,
           !entitlement.isInGracePeriod {
            return SubscriptionRecord(plan: product.plan, status: .lapsed, billingInterval: product.interval, currentPeriodEnd: periodEnd, cloudRetentionUntil: retention(expiresAt), origin: .appStore)
        }
        if entitlement.isInBillingRetry || entitlement.isInGracePeriod {
            return SubscriptionRecord(plan: product.plan, status: .pastDue, billingInterval: product.interval, currentPeriodEnd: periodEnd, origin: .appStore)
        }
        if entitlement.isTrial {
            return SubscriptionRecord(plan: product.plan, status: .trialing, billingInterval: product.interval, currentPeriodEnd: periodEnd, trialEndsAt: periodEnd, origin: .appStore)
        }
        if !entitlement.willAutoRenew {
            return SubscriptionRecord(plan: product.plan, status: .canceled, billingInterval: product.interval, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true, origin: .appStore)
        }
        return SubscriptionRecord(plan: product.plan, status: .active, billingInterval: product.interval, currentPeriodEnd: periodEnd, origin: .appStore)
    }

    /// The best of several App Store entitlements: the one that is entitled
    /// with the latest period end, else the latest record of any kind.
    public static func record(from entitlements: [StoreKitEntitlement], nowMs: Double) -> SubscriptionRecord? {
        let records = entitlements.compactMap { record(from: $0, nowMs: nowMs) }
        func end(_ record: SubscriptionRecord) -> Double { SubscriptionRules.parseTime(record.currentPeriodEnd) ?? .infinity }
        let entitled = records.filter { SubscriptionRules.deriveEntitlements($0, nowMs: nowMs).isSubscribed }
        return entitled.max(by: { end($0) < end($1) }) ?? records.max(by: { end($0) < end($1) })
    }

    /// One person, two possible receipts. The web row is the server's own
    /// fact and wins whenever it entitles; an App Store receipt fills in for
    /// an account that has no web subscription (or whose web plan lapsed).
    public static func resolve(web: SubscriptionRecord?, appStore: SubscriptionRecord?, nowMs: Double) -> SubscriptionRecord? {
        if let web, SubscriptionRules.deriveEntitlements(web, nowMs: nowMs).isSubscribed { return web }
        if let appStore, SubscriptionRules.deriveEntitlements(appStore, nowMs: nowMs).isSubscribed { return appStore }
        return web ?? appStore
    }
}

// MARK: - Per-account cache and state

/// The last known record per account, so a plane, a tunnel or an outage
/// leaves a paying customer working exactly as before. A convenience, not an
/// authority: every real gate is enforced by the database.
public final class SubscriptionCacheStore {
    public let directory: URL

    public init(storeDirectory: URL) {
        directory = storeDirectory
            .appendingPathComponent("sync", isDirectory: true)
            .appendingPathComponent("subscriptions", isDirectory: true)
    }

    public struct Entry: Equatable {
        public var userId: String
        public var record: SubscriptionRecord?
        public var fetchedAt: Double

        public init(userId: String, record: SubscriptionRecord?, fetchedAt: Double) {
            self.userId = userId
            self.record = record
            self.fetchedAt = fetchedAt
        }
    }

    func fileURL(userId: String) -> URL {
        directory.appendingPathComponent("\(SyncBaselineStore.fileName(userId)).json")
    }

    /// `readCache`: a cache written for another account is never read as this
    /// one's, and the record is re-validated through the same parser the
    /// network path uses.
    public func read(userId: String) -> Entry? {
        guard let data = try? Data(contentsOf: fileURL(userId: userId)), let value = try? JSONParser.parse(data),
              let object = value.objectValue, object.string("userId") == userId,
              let fetchedAt = object.number("fetchedAt") else { return nil }
        return Entry(userId: userId, record: SubscriptionRules.parseSubscriptionRow(object["record"]), fetchedAt: fetchedAt)
    }

    public func write(_ entry: Entry) {
        var object = JSONObject()
        object["userId"] = .string(entry.userId)
        object["record"] = entry.record.map { .object(SubscriptionRules.serializeRecord($0)) } ?? .null
        object["fetchedAt"] = .number(entry.fetchedAt)
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try Data(JSONWriter.stringify(.object(object)).utf8).write(to: fileURL(userId: entry.userId), options: .atomic)
        } catch {
            // Storage full or blocked. The state still works for this session.
        }
    }

    public func clear(userId: String) {
        try? FileManager.default.removeItem(at: fileURL(userId: userId))
    }

    /// Every account's cached record (sign-out wipes by prefix on the web).
    public func clearAll() {
        try? FileManager.default.removeItem(at: directory)
    }
}

public enum SubscriptionLoadStatus: Equatable {
    case idle, loading, ready, error(String)
}

/// The client's view of the subscription row (`useSubscriptionStore`), as a
/// value the app observes. It never decides what an entitlement means; it
/// holds the record and asks `SubscriptionRules`.
public struct SubscriptionState: Equatable {
    public var userId: String?
    public var record: SubscriptionRecord?
    /// Derived, never hand-set. Free until proven otherwise.
    public var entitlements: Entitlements = SubscriptionRules.freeEntitlements
    public var status: SubscriptionLoadStatus = .idle
    public var lastSyncedAt: Double?
    /// True when the current entitlement came from cache rather than the server.
    public var fromCache = false

    public init() {}

    /// `adoptAccount`: seed from cache immediately; the caller then refreshes.
    public mutating func adopt(userId: String, cached: SubscriptionCacheStore.Entry?, nowMs: Double) {
        self.userId = userId
        record = cached?.record
        entitlements = SubscriptionRules.deriveEntitlements(cached?.record, nowMs: nowMs)
        status = .loading
        lastSyncedAt = cached?.fetchedAt
        fromCache = cached != nil
    }

    /// The row arrived (or there is none, or the build is local-only).
    public mutating func applyFetched(_ record: SubscriptionRecord?, nowMs: Double) {
        self.record = record
        entitlements = SubscriptionRules.deriveEntitlements(record, nowMs: nowMs)
        status = .ready
        lastSyncedAt = nowMs
        fromCache = false
    }

    /// A failed read must not revoke anything: whatever the cache seeded stays
    /// in force until its own grace window closes — this is the flight case.
    public mutating func applyFetchFailure(_ message: String) {
        status = .error(message)
    }

    /// Recompute against the clock — a grace window can close mid-session.
    public mutating func revalidate(nowMs: Double) {
        let next = SubscriptionRules.deriveEntitlements(record, nowMs: nowMs)
        if next.isSubscribed != entitlements.isSubscribed || next.source != entitlements.source { entitlements = next }
    }

    /// Sign-out or guest mode: forgets the account and drops to free.
    public mutating func reset() {
        self = SubscriptionState()
    }
}
