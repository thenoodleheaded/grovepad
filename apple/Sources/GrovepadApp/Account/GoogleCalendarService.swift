import Foundation
import GrovepadCore
import GrovepadChrome
import GrovepadCloud

// ---------------------------------------------------------------------------
// The network half of `services/externalCalendarService.ts`: the Google
// Calendar grant (through `AuthSession.connectGoogleCalendar` and the system
// web session), the provider token kept on this device under the web's key
// (`grovepad:calendar:google-token:v1`, never on the board, wiped by
// sign-out), and the read-only month fetch. A 401/403 forgets the token.
// ---------------------------------------------------------------------------

@MainActor
public final class GoogleCalendarService: ExternalCalendarService {
    public typealias Fetch = (URLRequest) async throws -> (Data, URLResponse)

    private let store: KeyValueStore
    private let grant: (() async throws -> String?)?
    private let fetch: Fetch
    /// Runs after a grant succeeds: a guest's grant signed them in, so the
    /// guest choice ends (`leaveGuestMode` — here after, not before, so a
    /// cancelled grant leaves a guest where they were).
    public var onConnected: (() -> Void)?

    /// `grant` runs the OAuth flow and returns the provider token; nil means
    /// the build has no account service.
    public init(store: KeyValueStore, grant: (() async throws -> String?)?, fetch: @escaping Fetch = { try await URLSession.shared.data(for: $0) }) {
        self.store = store
        self.grant = grant
        self.fetch = fetch
    }

    /// The app's service over a live auth session.
    public convenience init(store: KeyValueStore, session: AuthSession, redirectTo: URL) {
        #if canImport(AuthenticationServices)
        self.init(store: store, grant: {
            try await session.connectGoogleCalendar(scopes: ExternalCalendarRules.googleScope, redirectTo: redirectTo) { url in
                try await WebAuthFlow.present(url)
            }
        })
        #else
        self.init(store: store, grant: nil)
        #endif
    }

    // MARK: - Token

    /// `rememberExternalCalendarToken`: a session carrying a provider token
    /// is kept for Google when a calendar grant is pending or the account's
    /// own provider is Google.
    public func noteProviderToken(_ token: String, accountProvider: String?) {
        let pending = store.string(forKey: ExternalCalendarRules.pendingProviderKey)
        guard pending == ExternalCalendarProvider.google.rawValue || accountProvider == ExternalCalendarProvider.google.rawValue else { return }
        store.set(token, forKey: ExternalCalendarRules.googleTokenKey)
        store.set(nil, forKey: ExternalCalendarRules.pendingProviderKey)
        ExternalCalendars.shared.invalidate()
    }

    /// Sign-out teardown: the token belongs to the account that is leaving.
    public func forgetAll() {
        for provider in ExternalCalendarProvider.allCases { store.set(nil, forKey: ExternalCalendarRules.tokenKey(provider)) }
        store.set(nil, forKey: ExternalCalendarRules.pendingProviderKey)
        ExternalCalendars.shared.invalidate()
    }

    private func token(_ provider: ExternalCalendarProvider) -> String? {
        guard let token = store.string(forKey: ExternalCalendarRules.tokenKey(provider)), !token.isEmpty else { return nil }
        return token
    }

    // MARK: - ExternalCalendarService

    public func connectedProviders() -> [ExternalCalendarProvider] {
        ExternalCalendarProvider.allCases.filter { token($0) != nil }
    }

    public func connect(_ provider: ExternalCalendarProvider) async throws {
        guard let grant else { throw ExternalCalendarError("Cloud sign-in must be configured before a calendar can connect.") }
        store.set(provider.rawValue, forKey: ExternalCalendarRules.pendingProviderKey)
        do {
            if let token = try await grant(), !token.isEmpty {
                store.set(token, forKey: ExternalCalendarRules.tokenKey(provider))
                store.set(nil, forKey: ExternalCalendarRules.pendingProviderKey)
            }
        } catch {
            store.set(nil, forKey: ExternalCalendarRules.pendingProviderKey)
            if AuthSession.isCancellation(error) { throw CancellationError() }
            throw ExternalCalendarError(AuthSession.message(error))
        }
        guard token(provider) != nil else { throw ExternalCalendarError("Google did not grant calendar access. Try again.") }
        onConnected?()
    }

    public func disconnect(_ provider: ExternalCalendarProvider) {
        store.set(nil, forKey: ExternalCalendarRules.tokenKey(provider))
    }

    public func loadMonth(_ provider: ExternalCalendarProvider, year: Int, month: Int) async throws -> ExternalCalendarFeed {
        let calendars = ExternalCalendarRules.visibleCalendars(
            ExternalCalendarRules.calendars(from: try await json(provider, ExternalCalendarRules.calendarListURL))
        )
        let bounds = ExternalCalendarRules.monthBounds(year: year, month: month)
        var events: [ExternalCalendarEvent] = []
        for calendar in calendars {
            let raw = try await json(provider, ExternalCalendarRules.eventsURL(calendarId: calendar.id, start: bounds.start, end: bounds.end))
            events += ExternalCalendarRules.events(for: calendar, from: raw)
        }
        return ExternalCalendarFeed(calendars: calendars, events: ExternalCalendarRules.sortedEvents(events))
    }

    /// `providerJson`.
    private func json(_ provider: ExternalCalendarProvider, _ url: URL) async throws -> JSONValue {
        guard let token = token(provider) else { throw ExternalCalendarError("Reconnect Google Calendar.") }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await fetch(request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 200
        if status == 401 || status == 403 {
            disconnect(provider)
            throw ExternalCalendarError("Calendar access expired. Reconnect Google.")
        }
        guard (200..<300).contains(status) else { throw ExternalCalendarError("Calendar service returned \(status).") }
        return try JSONParser.parse([UInt8](data))
    }
}
