import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The one clock every ticking card reads (`hooks/useSharedClock.ts`; widget
// constitution VIII, "no per-widget timers"). A `SharedClock` is injected
// through the environment; the app starts ONE beat for the whole board and a
// card body observes `nowMs` through `ClockReader`. Nothing in `Widgets/`
// ever owns a `Timer`. The default environment value never ticks, so a card
// rendered outside an app (tests, resting bitmaps) reads a still instant.
// ---------------------------------------------------------------------------

public final class SharedClock: ObservableObject {
    /// `Date.now()` as the last beat read it, in milliseconds.
    @Published public private(set) var nowMs: Double
    private var timer: Timer?
    private let read: Clock

    public init(clock: Clock = .system) {
        read = clock
        nowMs = clock.nowMs()
    }

    /// Start the beat. Idempotent; the returned disposer stops it and is
    /// safe to call twice. The web beats at 250 ms for whole-second dials and
    /// 50 ms for centisecond readouts; one interval serves every card here.
    @discardableResult
    public func start(every interval: TimeInterval = 0.25) -> () -> Void {
        if timer == nil {
            let timer = Timer(timeInterval: interval, repeats: true) { [weak self] _ in self?.tick() }
            RunLoop.main.add(timer, forMode: .common)
            self.timer = timer
        }
        return { [weak self] in self?.stop() }
    }

    public func stop() {
        timer?.invalidate()
        timer = nil
    }

    /// One beat, by the timer or by hand (tests, an external heartbeat).
    public func tick(nowMs override: Double? = nil) {
        nowMs = override ?? read.nowMs()
    }

    public var isRunning: Bool { timer != nil }
}

private struct SharedClockKey: EnvironmentKey {
    /// A still clock: reads the system time once and never beats.
    static let defaultValue = SharedClock()
}

public extension EnvironmentValues {
    /// The board's one clock. The app sets it once above the canvas.
    var sharedClock: SharedClock {
        get { self[SharedClockKey.self] }
        set { self[SharedClockKey.self] = newValue }
    }
}

/// Reads the shared clock's `nowMs` and re-renders its content on every beat.
struct ClockReader<Content: View>: View {
    @Environment(\.sharedClock) private var clock
    private let content: (Double) -> Content

    init(@ViewBuilder content: @escaping (Double) -> Content) {
        self.content = content
    }

    var body: some View {
        ClockObserver(clock: clock, content: content)
    }
}

private struct ClockObserver<Content: View>: View {
    @ObservedObject var clock: SharedClock
    let content: (Double) -> Content

    var body: some View {
        content(clock.nowMs)
    }
}

// MARK: - Small shared readings

/// `formatClock` (`utils/widgetClock.ts`): `mm:ss`, or `h:mm:ss` past an hour.
func formatClock(_ totalSeconds: Double) -> String {
    let s = Int(max(0, jsRound(totalSeconds)))
    let hours = s / 3600
    let minutes = (s % 3600) / 60
    let seconds = s % 60
    let two = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
    return hours > 0 ? "\(hours):\(two(minutes)):\(two(seconds))" : "\(two(minutes)):\(two(seconds))"
}

/// `formatStopwatch`: `mm:ss.cc`.
func formatStopwatch(_ ms: Double) -> String {
    let total = Int(max(0, ms.rounded(.down)))
    let m = total / 60000
    let s = (total % 60000) / 1000
    let cs = (total % 1000) / 10
    let two = { (n: Int) in n < 10 ? "0\(n)" : "\(n)" }
    return "\(two(m)):\(two(s)).\(two(cs))"
}

/// `dataWithSkinState` (`utils/widgetSkins.ts`) in place: one skin's pocket
/// replaced; an empty pocket removed, and an empty `skinStates` with it.
extension JSONObject {
    mutating func setSkinState(_ skin: String, _ state: JSONObject) {
        var states = object("skinStates") ?? JSONObject()
        if state.isEmpty { states.removeValue(forKey: skin) } else { states[skin] = .object(state) }
        if states.isEmpty { removeValue(forKey: "skinStates") } else { self["skinStates"] = .object(states) }
    }
}

/// A one-line note under a skin the port draws as its primary arrangement.
struct SkinNote: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text).font(GlassType.label).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }
}

/// A labelled 44 pt text button on the island: the shared shape of every
/// "choose one of these" control in this family (status steps, rating
/// choices, lead-day chips), so paired choices stay identical siblings.
struct ChoiceButton: View {
    let text: String
    let selected: Bool
    let tint: Color
    let action: () -> Void

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: GlassTokens.r2, style: .continuous) }
    private var fill: Color { selected ? tint.opacity(0.22) : Color.lift.opacity(0.05) }
    private var border: Color { selected ? tint.opacity(0.7) : Color.lift.opacity(0.08) }
    private var ink: Color { selected ? tint : Color.primary.opacity(0.8) }

    var body: some View {
        Button(action: action) {
            label
        }
        .buttonStyle(.plain)
        .accessibilityLabel(text)
        .accessibilityAddTraits(selected ? .isSelected : [])
        .touchTarget()
    }

    private var label: some View {
        let base = Text(text)
            .font(GlassType.body)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: 32)
        return base
            .background(shape.fill(fill))
            .overlay(shape.strokeBorder(border, lineWidth: 1))
            .foregroundStyle(ink)
    }
}

/// A thin accent meter (a progress bar, a share bar) that never hides a control.
struct MeterBar: View {
    let fraction: Double
    let tint: Color

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.lift.opacity(0.08))
                Capsule().fill(tint).frame(width: proxy.size.width * CGFloat(RestText.fraction(fraction)))
            }
        }
        .frame(height: 4)
    }
}
