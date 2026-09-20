import Foundation
import Observation
import GrovepadCore

// ---------------------------------------------------------------------------
// Toasts (`store/useToastStore.ts`, `ToastContainer.tsx`). Three visible at
// once, six at most; older ones bow out as new ones land; auto-dismiss via
// an injected scheduler so tests drive time by hand. The circuit engine's
// loop-damped message arrives through `BoardDocument.onToast`.
// ---------------------------------------------------------------------------

public enum ToastTone: String, Sendable { case info, success, danger }

public struct ToastAction {
    public var label: String
    public var run: () -> Void

    public init(label: String, run: @escaping () -> Void) {
        self.label = label
        self.run = run
    }
}

public struct Toast: Identifiable {
    public var id: String
    public var message: String
    public var tone: ToastTone
    public var action: ToastAction?
    /// Playing its exit animation; the view finalises removal.
    public var leaving = false
}

/// Schedules a block after a delay; returns a cancel. The app passes a
/// `DispatchQueue`/`Task` scheduler, tests a manual one.
public protocol ToastScheduler {
    @discardableResult
    func schedule(afterMs: Double, _ block: @escaping () -> Void) -> () -> Void
}

@Observable
public final class ToastModel {
    public static let visibleLimit = 3
    public static let hardLimit = 6
    public static let exitFailsafeMs = 400.0
    public static let defaultDurationMs = 2800.0
    public static let attentionDurationMs = 6000.0

    public private(set) var toasts: [Toast] = []
    @ObservationIgnored private let scheduler: ToastScheduler
    @ObservationIgnored private let mint: IdMinter

    public init(scheduler: ToastScheduler, mint: IdMinter = .system) {
        self.scheduler = scheduler
        self.mint = mint
    }

    /// `admitToast`: anything beyond the visible limit is marked leaving.
    public static func admit(_ toasts: [Toast], _ next: Toast) -> (toasts: [Toast], retiredIds: [String]) {
        let visible = toasts.filter { !$0.leaving }
        let overflow = max(0, visible.count - (visibleLimit - 1))
        let retiring = Set(visible.prefix(overflow).map(\.id))
        var result = toasts.map { toast -> Toast in
            var copy = toast
            if retiring.contains(toast.id) { copy.leaving = true }
            return copy
        }
        result.append(next)
        if result.count > hardLimit { result.removeFirst(result.count - hardLimit) }
        return (result, Array(retiring))
    }

    @discardableResult
    public func add(_ message: String, tone: ToastTone = .info, action: ToastAction? = nil, durationMs: Double? = nil) -> String {
        let toast = Toast(id: mint(), message: message, tone: tone, action: action)
        let admitted = ToastModel.admit(toasts, toast)
        toasts = admitted.toasts
        for retired in admitted.retiredIds {
            scheduler.schedule(afterMs: ToastModel.exitFailsafeMs) { [weak self] in self?.remove(retired) }
        }
        let duration = durationMs ?? (action != nil || tone == .danger ? ToastModel.attentionDurationMs : ToastModel.defaultDurationMs)
        scheduler.schedule(afterMs: duration) { [weak self] in self?.dismiss(toast.id) }
        return toast.id
    }

    /// Start the exit; `remove` finalises (from the view or the failsafe).
    public func dismiss(_ id: String) {
        guard let index = toasts.firstIndex(where: { $0.id == id }), !toasts[index].leaving else { return }
        toasts[index].leaving = true
        scheduler.schedule(afterMs: ToastModel.exitFailsafeMs) { [weak self] in self?.remove(id) }
    }

    public func remove(_ id: String) {
        toasts.removeAll { $0.id == id }
    }

    public func runAction(_ id: String) {
        guard let toast = toasts.first(where: { $0.id == id }) else { return }
        toast.action?.run()
        dismiss(id)
    }

    /// Route the document's messages (loop damping) here.
    public func bind(to document: BoardDocument) {
        document.onToast = { [weak self] message in self?.add(message, tone: .info) }
    }
}

/// A scheduler tests advance by hand.
public final class ManualToastScheduler: ToastScheduler {
    private var pending: [(at: Double, id: Int, block: () -> Void)] = []
    private var nextId = 0
    public private(set) var nowMs = 0.0

    public init() {}

    public func schedule(afterMs: Double, _ block: @escaping () -> Void) -> () -> Void {
        let id = nextId
        nextId += 1
        pending.append((nowMs + afterMs, id, block))
        return { [weak self] in self?.pending.removeAll { $0.id == id } }
    }

    /// Fires every due block in time order, moving the clock to each one
    /// as it runs, so a block scheduled by a block (the exit failsafe after
    /// a dismiss) lands inside the same advance.
    public func advance(ms: Double) {
        let target = nowMs + ms
        while let index = pending.indices.filter({ pending[$0].at <= target }).min(by: { pending[$0].at < pending[$1].at }) {
            let entry = pending.remove(at: index)
            nowMs = max(nowMs, entry.at)
            entry.block()
        }
        nowMs = target
    }

    public var pendingCount: Int { pending.count }
}

/// The app's scheduler over the main queue.
public final class MainQueueToastScheduler: ToastScheduler {
    public init() {}

    public func schedule(afterMs: Double, _ block: @escaping () -> Void) -> () -> Void {
        let work = DispatchWorkItem(block: block)
        DispatchQueue.main.asyncAfter(deadline: .now() + afterMs / 1000, execute: work)
        return { work.cancel() }
    }
}
