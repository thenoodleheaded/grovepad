import Foundation
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

// ---------------------------------------------------------------------------
// One place that turns an interaction into a physical tick (the web's
// `utils/haptics.ts` + `NativeHapticsPlugin.swift`), with the same three
// names and the same UIKit generators:
//
//   detent — a row crossing into the selection lane (UISelectionFeedbackGenerator)
//   commit — a choice landing, heavier than the ticks before it (medium impact)
//   limit  — pushing against an end that will not move (soft impact)
//
// A tick is advisory: it reports something the interface has ALREADY done,
// so nothing waits on it. Mac: the Force Touch trackpad's actuator
// (NSHapticFeedbackManager) — alignment for a detent, level change for a
// commit, generic for a limit. macOS only plays them while a finger is on
// the trackpad, so a fling's momentum and a mouse stay silent by design.
// ---------------------------------------------------------------------------

public enum HapticKind: String, CaseIterable, Sendable {
    case detent
    case commit
    case limit
}

@MainActor
public final class Haptics {
    public static let shared = Haptics()

    /// Every tap, in order (tests and the smoke run).
    public private(set) var log: [HapticKind] = []

    #if canImport(UIKit)
    // Retained rather than made per tap: UIKit warms the Taptic Engine when
    // a generator is created or prepared, and one built inside the call
    // would fire cold.
    private let selection = UISelectionFeedbackGenerator()
    private let commitGenerator = UIImpactFeedbackGenerator(style: .medium)
    private let limitGenerator = UIImpactFeedbackGenerator(style: .soft)
    #endif

    public init() {}

    public func tap(_ kind: HapticKind) {
        log.append(kind)
        if log.count > 64 { log.removeFirst(log.count - 64) }
        #if canImport(UIKit)
        switch kind {
        case .detent:
            selection.selectionChanged()
            selection.prepare()
        case .commit:
            commitGenerator.impactOccurred()
            commitGenerator.prepare()
        case .limit:
            limitGenerator.impactOccurred()
            limitGenerator.prepare()
        }
        #elseif canImport(AppKit)
        let pattern: NSHapticFeedbackManager.FeedbackPattern
        switch kind {
        case .detent: pattern = .alignment
        case .commit: pattern = .levelChange
        case .limit: pattern = .generic
        }
        NSHapticFeedbackManager.defaultPerformer.perform(pattern, performanceTime: .now)
        #endif
    }
}
