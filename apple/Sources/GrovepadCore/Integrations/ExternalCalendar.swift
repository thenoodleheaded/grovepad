import Foundation

// ---------------------------------------------------------------------------
// Port of the pure half of `services/externalCalendarService.ts`: the Google
// Calendar read-only feed. Calendar list and event parsing, the month window,
// the request URLs and the storage keys. The network, the OAuth grant and the
// token live in the app (`GoogleCalendarService`); nothing here is persisted
// on the board — events and tokens stay on the device.
// ---------------------------------------------------------------------------

public enum ExternalCalendarProvider: String, Equatable, CaseIterable, Sendable {
    case google
}

public struct ExternalCalendar: Equatable, Sendable {
    public var provider: ExternalCalendarProvider
    public var id: String
    public var name: String
    public var color: String
    public var primary: Bool

    public init(provider: ExternalCalendarProvider, id: String, name: String, color: String, primary: Bool) {
        self.provider = provider
        self.id = id
        self.name = name
        self.color = color
        self.primary = primary
    }
}

public struct ExternalCalendarEvent: Equatable, Sendable {
    public var provider: ExternalCalendarProvider
    public var id: String
    public var calendarId: String
    public var calendarName: String
    public var title: String
    public var start: String
    public var end: String
    public var allDay: Bool
    public var url: String?
    public var color: String

    public init(provider: ExternalCalendarProvider, id: String, calendarId: String, calendarName: String, title: String, start: String, end: String, allDay: Bool, url: String?, color: String) {
        self.provider = provider
        self.id = id
        self.calendarId = calendarId
        self.calendarName = calendarName
        self.title = title
        self.start = start
        self.end = end
        self.allDay = allDay
        self.url = url
        self.color = color
    }
}

public struct ExternalCalendarFeed: Equatable, Sendable {
    public var calendars: [ExternalCalendar]
    public var events: [ExternalCalendarEvent]

    public init(calendars: [ExternalCalendar], events: [ExternalCalendarEvent]) {
        self.calendars = calendars
        self.events = events
    }
}

public enum ExternalCalendarRules {
    /// `PROVIDER_TOKEN_KEYS.google` — the same key the web wipes on sign-out.
    public static let googleTokenKey = "grovepad:calendar:google-token:v1"
    /// `PENDING_PROVIDER_KEY`.
    public static let pendingProviderKey = "grovepad:calendar:pending-provider:v1"
    public static let maxCalendars = 6
    public static let maxEventsPerCalendar = 40
    /// `PROVIDER_SCOPES.google`.
    public static let googleScope = "https://www.googleapis.com/auth/calendar.readonly"
    public static let calendarListURL = URL(string: "https://www.googleapis.com/calendar/v3/users/me/calendarList")!

    public static func tokenKey(_ provider: ExternalCalendarProvider) -> String {
        switch provider {
        case .google: return googleTokenKey
        }
    }

    /// `text(raw, fallback)`: a string cut to 300 UTF-16 units, else the fallback.
    static func text(_ raw: JSONValue?, _ fallback: String = "") -> String {
        guard let raw, raw.isString, let value = raw.stringValue else { return fallback }
        let units = Array(value.utf16)
        return units.count <= 300 ? value : String(decoding: units.prefix(300), as: UTF16.self)
    }

    /// `safeColor`: `#rrggbb` only.
    static func safeColor(_ raw: JSONValue?, _ fallback: String) -> String {
        guard let value = raw?.stringValue, raw?.isString == true, value.count == 7, value.first == "#",
              value.dropFirst().allSatisfy(\.isHexDigit) else { return fallback }
        return value
    }

    /// `safeHttpUrl`: http(s) links only.
    static func safeHttpURL(_ raw: JSONValue?) -> String? {
        guard let value = raw?.stringValue, raw?.isString == true, let url = URL(string: value),
              let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http", url.host != nil else { return nil }
        return url.absoluteString
    }

    /// JavaScript truthiness of a string field.
    private static func truthy(_ raw: JSONValue?) -> Bool {
        guard let raw else { return false }
        if raw.isString { return !(raw.stringValue ?? "").isEmpty }
        switch raw {
        case .null: return false
        case .bool(let value): return value
        case .number(let value): return value != 0 && !value.isNaN
        default: return true
        }
    }

    /// `googleCalendarList`.
    public static func calendars(from raw: JSONValue?) -> [ExternalCalendar] {
        guard let items = raw?.objectValue?["items"]?.arrayValue else { return [] }
        return items.prefix(250).compactMap { item in
            let value = item.objectValue ?? JSONObject()
            let id = text(value["id"])
            let name = text(value["summary"])
            guard !id.isEmpty, !name.isEmpty else { return nil }
            return ExternalCalendar(provider: .google, id: id, name: name, color: safeColor(value["backgroundColor"], "#4285f4"), primary: value["primary"]?.boolValue == true)
        }
    }

    /// `googleEvents`.
    public static func events(for calendar: ExternalCalendar, from raw: JSONValue?) -> [ExternalCalendarEvent] {
        guard let items = raw?.objectValue?["items"]?.arrayValue else { return [] }
        return items.prefix(maxEventsPerCalendar).compactMap { item in
            let value = item.objectValue ?? JSONObject()
            let start = value["start"]?.objectValue ?? JSONObject()
            let end = value["end"]?.objectValue ?? JSONObject()
            let startDateTime = text(start["dateTime"])
            let startValue = startDateTime.isEmpty ? text(start["date"]) : startDateTime
            let endDateTime = text(end["dateTime"])
            let endValue = endDateTime.isEmpty ? text(end["date"]) : endDateTime
            let id = text(value["id"])
            guard !id.isEmpty, !startValue.isEmpty else { return nil }
            return ExternalCalendarEvent(
                provider: .google,
                id: id,
                calendarId: calendar.id,
                calendarName: calendar.name,
                title: text(value["summary"], "Busy"),
                start: startValue,
                end: endValue.isEmpty ? startValue : endValue,
                allDay: truthy(start["date"]) && !truthy(start["dateTime"]),
                url: safeHttpURL(value["htmlLink"]),
                color: calendar.color
            )
        }
    }

    /// The calendars a month loads: primary first (stable), at most six.
    public static func visibleCalendars(_ calendars: [ExternalCalendar]) -> [ExternalCalendar] {
        let ordered = calendars.enumerated().sorted { left, right in
            if left.element.primary != right.element.primary { return left.element.primary }
            return left.offset < right.offset
        }.map(\.element)
        return Array(ordered.prefix(maxCalendars))
    }

    /// Every event of the month, by start (`localeCompare` on ISO strings).
    public static func sortedEvents(_ events: [ExternalCalendarEvent]) -> [ExternalCalendarEvent] {
        events.enumerated().sorted { left, right in
            if left.element.start != right.element.start { return left.element.start < right.element.start }
            return left.offset < right.offset
        }.map(\.element)
    }

    /// `monthBounds`: local midnight on the 1st to local midnight on the next
    /// 1st, as `toISOString` writes them. `month` is 0-based.
    public static func monthBounds(year: Int, month: Int, timeZone: TimeZone = .current) -> (start: String, end: String) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        func midnight(_ offset: Int) -> String {
            var components = DateComponents()
            components.year = year
            components.month = month + 1 + offset
            components.day = 1
            let date = calendar.date(from: components) ?? Date(timeIntervalSince1970: 0)
            return SubscriptionRules.isoString(ms: (date.timeIntervalSince1970 * 1000).rounded())
        }
        return (midnight(0), midnight(1))
    }

    /// `fetchCalendarEvents`' request URL.
    public static func eventsURL(calendarId: String, start: String, end: String) -> URL {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-_.!~*'()")
        let encoded = calendarId.addingPercentEncoding(withAllowedCharacters: allowed) ?? calendarId
        var components = URLComponents(string: "https://www.googleapis.com/calendar/v3/calendars/\(encoded)/events")!
        components.queryItems = [
            URLQueryItem(name: "timeMin", value: start),
            URLQueryItem(name: "timeMax", value: end),
            URLQueryItem(name: "singleEvents", value: "true"),
            URLQueryItem(name: "orderBy", value: "startTime"),
            URLQueryItem(name: "maxResults", value: String(maxEventsPerCalendar)),
        ]
        // `URLSearchParams` encodes `:` and `+`; Google accepts either form,
        // but a literal `+` in an offset would read as a space.
        components.percentEncodedQuery = components.percentEncodedQuery?.replacingOccurrences(of: "+", with: "%2B")
        return components.url!
    }
}
