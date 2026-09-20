import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The calendar widget's `connected_calendars` skin reads Google Calendar
// through this seam (`services/externalCalendarService.ts` on the web).
// Chrome cannot see Supabase, so the app installs a service in
// `ExternalCalendars.shared`; without one (tests, resting bitmaps, a build
// with no cloud configuration) the skin says sign-in is not configured.
// Events and tokens are never written to the board.
// ---------------------------------------------------------------------------

@MainActor
public protocol ExternalCalendarService: AnyObject {
    /// `connectedExternalCalendarProviders`: a token is held on this device.
    func connectedProviders() -> [ExternalCalendarProvider]
    /// `connectExternalCalendar`: the read-only OAuth grant. Throws a
    /// message the card shows; a cancelled grant throws `CancellationError`.
    func connect(_ provider: ExternalCalendarProvider) async throws
    /// `disconnectExternalCalendar`: forget the token.
    func disconnect(_ provider: ExternalCalendarProvider)
    /// `loadExternalCalendarMonth` (`month` is 0-based).
    func loadMonth(_ provider: ExternalCalendarProvider, year: Int, month: Int) async throws -> ExternalCalendarFeed
}

/// A user-facing calendar failure (`throw new Error('…')` on the web).
public struct ExternalCalendarError: Error, Equatable, CustomStringConvertible {
    public let description: String
    public init(_ description: String) { self.description = description }
}

@MainActor
@Observable
public final class ExternalCalendars {
    public static let shared = ExternalCalendars()

    /// Installed by the app when a cloud backend is configured.
    public var service: ExternalCalendarService? {
        didSet { revision += 1 }
    }
    /// Bumped on connect, disconnect and account changes so open cards reload.
    public private(set) var revision = 0

    public init(service: ExternalCalendarService? = nil) {
        self.service = service
    }

    public func invalidate() { revision += 1 }
}

/// `connected_calendars`: the providers, then this month's events.
struct ConnectedCalendarsBody: View {
    let year: Int
    let month: Int
    let monthName: String
    let accent: Color

    @State private var hub = ExternalCalendars.shared
    @State private var feeds: [ExternalCalendarProvider: ExternalCalendarFeed] = [:]
    @State private var loading = false
    @State private var error = ""
    @State private var busy: ExternalCalendarProvider?
    @State private var refresh = 0

    private var connected: [ExternalCalendarProvider] { hub.service?.connectedProviders() ?? [] }

    private struct LoadKey: Equatable { var year: Int, month: Int, revision: Int, refresh: Int }

    var body: some View {
        let events = ExternalCalendarRules.sortedEvents(feeds.values.flatMap(\.events))
        let calendarCount = feeds.values.reduce(0) { $0 + $1.calendars.count }
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "calendar.badge.clock").foregroundStyle(accent)
                Text("Connected calendars").font(GlassType.label)
                Spacer(minLength: 0)
                GhostButton("arrow.clockwise", label: "Refresh connected calendars") { refresh += 1 }
                    .disabled(connected.isEmpty || loading)
            }
            Text("Private to this device · events and access tokens are never saved on the board.")
                .font(.grove(size: 10)).foregroundStyle(.secondary)
            providerRow(.google, label: "Google Calendar", mark: "G")
            if !error.isEmpty {
                Text(error).font(.grove(size: 10, weight: .semibold)).foregroundStyle(Color.tone("#fca5a5", light: "#b91c1c"))
            }
            if hub.service == nil {
                Text("Cloud sign-in is not configured for this Grovepad installation.")
                    .font(.grove(size: 10, weight: .semibold)).foregroundStyle(Color.tone("#fca5a5", light: "#b91c1c"))
            }
            VStack(alignment: .leading, spacing: 4) {
                if connected.isEmpty {
                    empty("calendar.badge.clock", "Bring your schedule together", "Connect Google Calendar for a private, read-only agenda.")
                } else if loading && events.isEmpty {
                    empty("hourglass", "Reading your calendars", "Loading \(monthName) events.")
                } else if events.isEmpty {
                    empty("calendar", "No events this month", "\(calendarCount) \(calendarCount == 1 ? "calendar" : "calendars") connected.")
                } else {
                    ForEach(Array(events.enumerated()), id: \.offset) { _, event in eventRow(event) }
                }
            }
        }
        .task(id: LoadKey(year: year, month: month, revision: hub.revision, refresh: refresh)) { await load() }
    }

    private func load() async {
        guard let service = hub.service else { feeds = [:]; loading = false; return }
        let providers = service.connectedProviders()
        guard !providers.isEmpty else { feeds = [:]; loading = false; return }
        loading = true
        error = ""
        var next: [ExternalCalendarProvider: ExternalCalendarFeed] = [:]
        var failures: [String] = []
        for provider in providers {
            do {
                next[provider] = try await service.loadMonth(provider, year: year, month: month)
            } catch is CancellationError {
                return
            } catch {
                failures.append((error as? ExternalCalendarError)?.description ?? "Calendar sync failed.")
            }
        }
        if Task.isCancelled { return }
        feeds = next
        error = failures.first ?? ""
        loading = false
    }

    private func providerRow(_ provider: ExternalCalendarProvider, label: String, mark: String) -> some View {
        let isConnected = connected.contains(provider)
        return HStack(spacing: 8) {
            Text(mark).font(.grove(size: 12, weight: .bold)).frame(width: 22, height: 22)
                .background(accent.opacity(0.18), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(label).font(.grove(size: 11, weight: .semibold))
                Text(isConnected ? "Read-only access" : "Not connected").font(.grove(size: 10)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            if isConnected {
                GhostButton("powerplug", label: "Disconnect \(label)") {
                    hub.service?.disconnect(provider)
                    feeds[provider] = nil
                    hub.invalidate()
                }
            } else {
                Button {
                    Task { await connect(provider) }
                } label: {
                    HStack(spacing: 4) {
                        if busy == provider { ProgressView().controlSize(.mini) } else { Image(systemName: "arrow.triangle.2.circlepath") }
                        Text("Connect")
                    }
                    .font(GlassType.label)
                    .foregroundStyle(accent)
                }
                .buttonStyle(.plain)
                .touchTarget()
                .disabled(hub.service == nil || busy != nil)
            }
        }
    }

    private func connect(_ provider: ExternalCalendarProvider) async {
        guard let service = hub.service else { return }
        busy = provider
        error = ""
        defer { busy = nil }
        do {
            try await service.connect(provider)
            hub.invalidate()
        } catch is CancellationError {
            // Closing the Google window is not an error.
        } catch {
            self.error = (error as? ExternalCalendarError)?.description ?? "Could not connect this calendar."
        }
    }

    private func empty(_ symbol: String, _ title: String, _ detail: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 18)).foregroundStyle(.secondary)
            Text(title).font(.grove(size: 11, weight: .semibold))
            Text(detail).font(.grove(size: 10)).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
    }

    private func eventRow(_ event: ExternalCalendarEvent) -> some View {
        let (day, time) = ConnectedCalendarsBody.labels(event)
        return HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2).fill(Color(hex: event.color)).frame(width: 3, height: 26)
            VStack(alignment: .leading, spacing: 0) {
                Text(day).font(.grove(size: 11, weight: .bold)).monospacedDigit()
                Text(time).font(.grove(size: 9)).foregroundStyle(.secondary)
            }
            .frame(width: 52, alignment: .leading)
            VStack(alignment: .leading, spacing: 0) {
                Text(event.title).font(.grove(size: 11, weight: .semibold)).lineLimit(2)
                Text(event.calendarName).font(.grove(size: 9)).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 0)
            if let link = event.url.flatMap(URL.init(string:)) {
                Link(destination: link) { Image(systemName: "arrow.up.right.square") }
                    .font(.system(size: 11)).foregroundStyle(.secondary)
                    .accessibilityLabel("Open \(event.title)")
            }
        }
    }

    /// The day and time columns: `Intl.DateTimeFormat` month-day and
    /// hour-minute, "All day" for date-only events; an unparseable start
    /// shows its `MM-DD` slice.
    static func labels(_ event: ExternalCalendarEvent, locale: Locale = .current, timeZone: TimeZone = .current) -> (day: String, time: String) {
        let date = parse(event.start, timeZone: timeZone)
        let dayFormatter = DateFormatter()
        dayFormatter.locale = locale
        dayFormatter.timeZone = timeZone
        dayFormatter.setLocalizedDateFormatFromTemplate("MMMd")
        let timeFormatter = DateFormatter()
        timeFormatter.locale = locale
        timeFormatter.timeZone = timeZone
        timeFormatter.setLocalizedDateFormatFromTemplate("jmm")
        let day = date.map(dayFormatter.string(from:)) ?? String(event.start.dropFirst(5).prefix(5))
        let time = event.allDay ? "All day" : date.map(timeFormatter.string(from:)) ?? ""
        return (day, time)
    }

    /// `new Date(start)`: a full ISO timestamp, or a bare date read as UTC
    /// midnight (as JavaScript does), shown in the local zone.
    static func parse(_ text: String, timeZone: TimeZone) -> Date? {
        let full = ISO8601DateFormatter()
        full.formatOptions = [.withInternetDateTime]
        if let date = full.date(from: text) { return date }
        full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = full.date(from: text) { return date }
        let dateOnly = DateFormatter()
        dateOnly.locale = Locale(identifier: "en_US_POSIX")
        dateOnly.timeZone = TimeZone(identifier: "UTC")
        dateOnly.dateFormat = "yyyy-MM-dd"
        return dateOnly.date(from: text)
    }
}
