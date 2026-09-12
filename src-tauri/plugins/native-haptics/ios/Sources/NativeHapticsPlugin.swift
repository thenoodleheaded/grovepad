import Foundation
import Tauri
import UIKit

/// Grovepad's three ticks, mapped onto the UIKit generator that already means
/// the same thing to an iPhone owner:
///
/// - `detent` is a row crossing into the selection lane, which is precisely
///   what `UISelectionFeedbackGenerator` exists for — the picker-wheel tick.
/// - `commit` is a choice landing. It must read as heavier than the ticks that
///   led to it, so it is a medium impact rather than another selection tick.
/// - `limit` is pushing against an end that will not move. `.soft` is the
///   gentlest impact iOS offers, which keeps a refusal quieter than a success.
///
/// The web side sends these names verbatim (`HapticKind` in utils/haptics.ts);
/// this is the only place they turn into UIKit.
private enum Tick: String {
    case detent
    case commit
    case limit
}

private final class TapArgs: Decodable {
    let kind: String
}

final class NativeHapticsPlugin: Plugin {
    /// Generators are retained rather than made per tap. UIKit warms the Taptic
    /// Engine when one is created or prepared, and a generator built inside the
    /// call would fire cold — late enough that a fast scroll feels unsynced.
    private let selection = UISelectionFeedbackGenerator()
    private let commit = UIImpactFeedbackGenerator(style: .medium)
    private let limit = UIImpactFeedbackGenerator(style: .soft)

    @objc public func tap(_ invoke: Invoke) throws {
        let args = try invoke.parseArgs(TapArgs.self)
        guard let tick = Tick(rawValue: args.kind) else {
            invoke.reject("Unknown haptic kind '\(args.kind)'")
            return
        }

        // UIKit's feedback generators are main-thread only. The plugin call can
        // arrive on a background queue, and firing off it silently does nothing.
        DispatchQueue.main.async { [self] in
            switch tick {
            case .detent:
                selection.selectionChanged()
                // Re-arm straight away: the next row crossing is usually
                // milliseconds away in a scroll, and an unprepared engine adds
                // exactly the lag this is meant to remove.
                selection.prepare()
            case .commit:
                commit.impactOccurred()
                commit.prepare()
            case .limit:
                limit.impactOccurred()
                limit.prepare()
            }
        }
        invoke.resolve()
    }
}

@_cdecl("init_plugin_native_haptics")
func initPlugin() -> Plugin {
    NativeHapticsPlugin()
}
