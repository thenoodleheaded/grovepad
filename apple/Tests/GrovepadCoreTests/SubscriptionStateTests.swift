import XCTest
@testable import GrovepadCore

/// `entitlements.test.ts` and the StoreKit mapping: the free plan is the
/// product, Air is derived from the record and the clock, and an App Store
/// receipt lands in the same record shape the web reads.
final class SubscriptionStateTests: XCTestCase {
    private let day = 24.0 * 60 * 60 * 1000
    private let now = 1_789_000_000_000.0

    private func iso(_ ms: Double) -> String { SubscriptionRules.isoString(ms: ms) }

    private func record(_ status: SubscriptionStatus, periodEnd: Double?, plan: SubscriptionPlan = .air) -> SubscriptionRecord {
        SubscriptionRecord(plan: plan, status: status, billingInterval: .year, currentPeriodEnd: periodEnd.map(iso))
    }

    func testTheGraceWindowIsPinnedToTheSqlMirror() {
        XCTAssertEqual(SubscriptionRules.entitlementGraceDays, 7)
        XCTAssertEqual(SubscriptionRules.cloudRetentionDays, 90)
    }

    func testNoRecordIsTheFreePlan() {
        let free = SubscriptionRules.deriveEntitlements(nil, nowMs: now)
        XCTAssertEqual(free, SubscriptionRules.freeEntitlements)
        XCTAssertFalse(free.canSync)
        XCTAssertEqual(free.hostedSession.perBoardDailySeconds, 20 * 60)
        XCTAssertEqual(free.attachmentQuotaBytes, 0)
    }

    func testStatusesMapToSources() {
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.active, periodEnd: now + day), nowMs: now).source, .air)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.trialing, periodEnd: now + day), nowMs: now).source, .trial)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.pastDue, periodEnd: now + day), nowMs: now).source, .grace)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.canceled, periodEnd: now + day), nowMs: now).source, .air)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.lapsed, periodEnd: now + day), nowMs: now).source, .free)
        // No end date: the status alone is trusted.
        XCTAssertTrue(SubscriptionRules.deriveEntitlements(record(.active, periodEnd: nil), nowMs: now).isSubscribed)
    }

    func testAPastPeriodEndKeepsAirThroughTheGraceWindowThenLosesIt() {
        let ended = record(.active, periodEnd: now - day)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(ended, nowMs: now).source, .grace)
        let justInside = record(.active, periodEnd: now - 7 * day + 1)
        XCTAssertTrue(SubscriptionRules.deriveEntitlements(justInside, nowMs: now).isSubscribed)
        let justOutside = record(.active, periodEnd: now - 7 * day)
        XCTAssertFalse(SubscriptionRules.deriveEntitlements(justOutside, nowMs: now).isSubscribed)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(record(.trialing, periodEnd: now - day), nowMs: now).source, .grace)
    }

    func testDaysRemaining() {
        var trial = record(.trialing, periodEnd: now + 3.5 * day)
        XCTAssertEqual(SubscriptionRules.trialDaysRemaining(trial, nowMs: now), 4)
        trial.trialEndsAt = iso(now + 1.2 * day)
        XCTAssertEqual(SubscriptionRules.trialDaysRemaining(trial, nowMs: now), 2)
        XCTAssertNil(SubscriptionRules.trialDaysRemaining(record(.active, periodEnd: now + day), nowMs: now))
        var lapsed = record(.lapsed, periodEnd: now - day)
        XCTAssertNil(SubscriptionRules.cloudRetentionDaysRemaining(lapsed, nowMs: now))
        lapsed.cloudRetentionUntil = iso(now + 10 * day)
        XCTAssertEqual(SubscriptionRules.cloudRetentionDaysRemaining(lapsed, nowMs: now), 10)
        lapsed.cloudRetentionUntil = iso(now - day)
        XCTAssertEqual(SubscriptionRules.cloudRetentionDaysRemaining(lapsed, nowMs: now), 0)
    }

    func testParsingRejectsAnythingMalformedAsNoSubscription() {
        let row: JSONValue = [
            "plan": "air_student", "status": "past_due", "billing_interval": "month",
            "current_period_end": "2026-08-21T00:00:00.000Z", "trial_ends_at": .null,
            "cancel_at_period_end": true, "cloud_retention_until": "not a date",
        ]
        let parsed = SubscriptionRules.parseSubscriptionRow(row)
        XCTAssertEqual(parsed, SubscriptionRecord(plan: .airStudent, status: .pastDue, billingInterval: .month, currentPeriodEnd: "2026-08-21T00:00:00.000Z", cancelAtPeriodEnd: true))
        XCTAssertNil(SubscriptionRules.parseSubscriptionRow(["plan": "gold", "status": "active", "billing_interval": "year"]))
        XCTAssertNil(SubscriptionRules.parseSubscriptionRow(["plan": "air", "status": "active"]))
        XCTAssertNil(SubscriptionRules.parseSubscriptionRow(.string("air")))
        XCTAssertNil(SubscriptionRules.parseSubscriptionRow(nil))
        // The row shape round-trips through the serializer the cache uses.
        XCTAssertEqual(SubscriptionRules.parseSubscriptionRow(.object(SubscriptionRules.serializeRecord(parsed!))), parsed)
    }

    func testIsoStringMatchesToISOString() {
        XCTAssertEqual(SubscriptionRules.isoString(ms: 1_789_000_000_000), "2026-09-10T00:26:40.000Z")
        XCTAssertEqual(SubscriptionRules.isoString(ms: 1_789_000_000_123), "2026-09-10T00:26:40.123Z")
        XCTAssertEqual(SubscriptionRules.parseTime("2026-09-10T00:26:40.123Z"), 1_789_000_000_123)
    }

    // MARK: - StoreKit

    private func entitlement(_ productId: String = "app.grovepad.air.yearly", expires: Double?, revoked: Double? = nil, trial: Bool = false, autoRenew: Bool = true, retry: Bool = false, grace: Bool = false) -> StoreKitEntitlement {
        StoreKitEntitlement(productId: productId, expiresAtMs: expires, revokedAtMs: revoked, isTrial: trial, willAutoRenew: autoRenew, isInBillingRetry: retry, isInGracePeriod: grace)
    }

    func testStoreKitEntitlementsMapOntoTheWebRecord() {
        let active = StoreKitEntitlementMapping.record(from: entitlement(expires: now + 30 * day), nowMs: now)
        XCTAssertEqual(active, SubscriptionRecord(plan: .air, status: .active, billingInterval: .year, currentPeriodEnd: iso(now + 30 * day), origin: .appStore))
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(active, nowMs: now).source, .air)

        let student = StoreKitEntitlementMapping.record(from: entitlement("app.grovepad.air.student.monthly", expires: now + day), nowMs: now)
        XCTAssertEqual(student?.plan, .airStudent)
        XCTAssertEqual(student?.billingInterval, .month)

        let trial = StoreKitEntitlementMapping.record(from: entitlement(expires: now + 5 * day, trial: true), nowMs: now)
        XCTAssertEqual(trial?.status, .trialing)
        XCTAssertEqual(trial?.trialEndsAt, iso(now + 5 * day))
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(trial, nowMs: now).source, .trial)

        let canceled = StoreKitEntitlementMapping.record(from: entitlement(expires: now + 5 * day, autoRenew: false), nowMs: now)
        XCTAssertEqual(canceled?.status, .canceled)
        XCTAssertEqual(canceled?.cancelAtPeriodEnd, true)
        XCTAssertTrue(SubscriptionRules.deriveEntitlements(canceled, nowMs: now).isSubscribed, "paid through the period end")

        let dunning = StoreKitEntitlementMapping.record(from: entitlement(expires: now - day, retry: true, grace: true), nowMs: now)
        XCTAssertEqual(dunning?.status, .pastDue)
        XCTAssertEqual(SubscriptionRules.deriveEntitlements(dunning, nowMs: now).source, .grace)

        let expired = StoreKitEntitlementMapping.record(from: entitlement(expires: now - 8 * day), nowMs: now)
        XCTAssertEqual(expired?.status, .lapsed)
        XCTAssertEqual(expired?.cloudRetentionUntil, iso(now - 8 * day + 90 * day))
        XCTAssertFalse(SubscriptionRules.deriveEntitlements(expired, nowMs: now).isSubscribed)

        let refunded = StoreKitEntitlementMapping.record(from: entitlement(expires: now + 20 * day, revoked: now - day), nowMs: now)
        XCTAssertEqual(refunded?.status, .lapsed)
        XCTAssertEqual(refunded?.cloudRetentionUntil, iso(now - day + 90 * day))

        XCTAssertNil(StoreKitEntitlementMapping.record(from: entitlement("com.example.other", expires: now + day), nowMs: now))
    }

    func testTheBestOfSeveralReceiptsWinsAndTheWebRowOutranksIt() {
        let receipts = [entitlement("app.grovepad.air.monthly", expires: now - 30 * day), entitlement(expires: now + 300 * day)]
        let best = StoreKitEntitlementMapping.record(from: receipts, nowMs: now)
        XCTAssertEqual(best?.billingInterval, .year)
        XCTAssertNil(StoreKitEntitlementMapping.record(from: [], nowMs: now))

        let web = record(.active, periodEnd: now + day)
        XCTAssertEqual(StoreKitEntitlementMapping.resolve(web: web, appStore: best, nowMs: now), web)
        let lapsedWeb = record(.lapsed, periodEnd: now - day)
        XCTAssertEqual(StoreKitEntitlementMapping.resolve(web: lapsedWeb, appStore: best, nowMs: now), best)
        XCTAssertEqual(StoreKitEntitlementMapping.resolve(web: lapsedWeb, appStore: nil, nowMs: now), lapsedWeb)
        XCTAssertNil(StoreKitEntitlementMapping.resolve(web: nil, appStore: nil, nowMs: now))
    }

    // MARK: - Cache and state

    func testTheCacheIsPerAccountAndRevalidatedThroughTheParser() throws {
        let directory = SyncFixtures.temporaryDirectory("subscription")
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = SubscriptionCacheStore(storeDirectory: directory)
        let entry = SubscriptionCacheStore.Entry(userId: "user-1", record: record(.active, periodEnd: now + day), fetchedAt: now)
        cache.write(entry)
        XCTAssertEqual(cache.read(userId: "user-1"), entry)
        XCTAssertNil(cache.read(userId: "user-2"))
        cache.write(SubscriptionCacheStore.Entry(userId: "user-2", record: nil, fetchedAt: now))
        XCTAssertEqual(cache.read(userId: "user-2")?.record, nil)
        cache.clear(userId: "user-1")
        XCTAssertNil(cache.read(userId: "user-1"))
    }

    func testStateSeedsFromCacheAndAFailedReadRevokesNothing() {
        var state = SubscriptionState()
        XCTAssertEqual(state.entitlements, SubscriptionRules.freeEntitlements)
        state.adopt(userId: "user-1", cached: SubscriptionCacheStore.Entry(userId: "user-1", record: record(.active, periodEnd: now + day), fetchedAt: now - day), nowMs: now)
        XCTAssertTrue(state.entitlements.isSubscribed)
        XCTAssertTrue(state.fromCache)
        XCTAssertEqual(state.status, .loading)
        state.applyFetchFailure("offline")
        XCTAssertTrue(state.entitlements.isSubscribed, "the flight case")
        XCTAssertEqual(state.status, .error("offline"))
        state.applyFetched(nil, nowMs: now)
        XCTAssertFalse(state.entitlements.isSubscribed)
        XCTAssertEqual(state.status, .ready)
        XCTAssertFalse(state.fromCache)
        state.applyFetched(record(.active, periodEnd: now + day), nowMs: now)
        state.revalidate(nowMs: now + 30 * day)
        XCTAssertFalse(state.entitlements.isSubscribed, "a grace window can close mid-session")
        state.reset()
        XCTAssertEqual(state, SubscriptionState())
    }
}
