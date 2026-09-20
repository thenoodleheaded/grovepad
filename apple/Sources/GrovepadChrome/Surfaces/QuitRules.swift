import Foundation

// ---------------------------------------------------------------------------
// What may block closing a window or quitting, and how unsaved state is
// treated. Ported from the one place the web decides it — the
// `beforeunload` guard and `flushAll` in `utils/persistence.ts`:
//
//   - a gesture that dirtied the board but has not scheduled its save,
//   - a local save in flight,
//   - writes paused after a read error ('error': nothing from this session
//     reached disk)
//
// each prevent a silent close. `pagehide` / hidden-visibility flush every
// saver first. (docs/quit-rules.md is the product's go/no-go record, not the
// app's close behaviour; it has nothing to port here.)
// ---------------------------------------------------------------------------

public enum LocalSaveState: String, Sendable {
    case idle, saving, saved, error
}

public struct QuitContext: Equatable, Sendable {
    /// A pointer gesture changed the board and its save is not yet scheduled.
    public var gestureDirty: Bool
    public var localSave: LocalSaveState
    /// A cloud push is queued (never blocks; flushed best-effort).
    public var cloudPushPending: Bool

    public init(gestureDirty: Bool = false, localSave: LocalSaveState = .idle, cloudPushPending: Bool = false) {
        self.gestureDirty = gestureDirty
        self.localSave = localSave
        self.cloudPushPending = cloudPushPending
    }
}

public enum QuitDecision: Equatable, Sendable {
    /// Nothing is at risk: close now.
    case allow
    /// Flush the savers, then close.
    case flushThenAllow
    /// Ask before closing, with the reason in plain words.
    case warn(reason: String)

    public var blocks: Bool { if case .warn = self { return true } else { return false } }
}

public enum QuitRules {
    /// `warnBeforeUnload`: the three states that make closing lossy.
    public static func decide(_ context: QuitContext) -> QuitDecision {
        switch context.localSave {
        case .error:
            return .warn(reason: "Saving is paused because a stored record could not be read. Nothing from this session has reached disk yet.")
        case .saving:
            return .warn(reason: "Your board is still being saved.")
        case .idle, .saved:
            if context.gestureDirty { return .warn(reason: "A change is still waiting to be saved.") }
            return context.cloudPushPending ? .flushThenAllow : .allow
        }
    }

    /// `flushAll`: the order every saver is drained in when the app hides,
    /// closes or terminates.
    public static let flushOrder = ["board", "device", "view"]

    /// The moments the app must flush without asking (`pagehide`,
    /// `visibilitychange: hidden`), as the app-lifecycle hooks name them.
    public enum FlushMoment: String, CaseIterable, Sendable {
        case willResignActive, didEnterBackground, willTerminate, windowWillClose
    }

    /// The Mac title bar's unsaved dot / the iOS scene: a document that
    /// autosaves is never "edited" from the person's point of view.
    public static func showsUnsavedIndicator(_ context: QuitContext) -> Bool {
        context.localSave == .error
    }
}
