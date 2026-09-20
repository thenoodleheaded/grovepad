import Foundation
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
#if canImport(AppKit)
import AppKit
#elseif canImport(UIKit)
import UIKit
#endif

// ---------------------------------------------------------------------------
// What a hardware key means to the canvas host, and when it means nothing:
// the web's `isEditableTarget` guard in `engine/camera/gestureEngine.ts`
// (`onKeyDown` / `onKeyUp` return early when the event target is an input,
// textarea, select or contenteditable). Without it a space typed into a
// Text card became the pan modifier and a Backspace could delete the very
// card being typed in. Both hosts map their platform key onto `CanvasKey`,
// ask `KeyboardTargetGuard` whether a text input has the keyboard, and
// route through this one table; a guarded key falls through to `super`.
// ---------------------------------------------------------------------------

public enum CanvasKey: Equatable, Sendable {
    case space, delete, escape, z, w
    /// The bare-letter and symbol keys of `CanvasViewport.tsx`'s keyboard layer.
    case h, v, f, n, x, plus, minus, zero, question, f2
    case arrow(ArrowDirection)
}

public enum ArrowDirection: Equatable, Sendable {
    case left, right, up, down

    /// The unit step on screen axes (y grows downward, like the board).
    public var unit: (x: Double, y: Double) {
        switch self {
        case .left: return (-1, 0)
        case .right: return (1, 0)
        case .up: return (0, -1)
        case .down: return (0, 1)
        }
    }
}

/// Which modifier keys were held, as the table reads them.
public struct CanvasKeyModifiers: OptionSet, Equatable, Sendable {
    public let rawValue: Int
    public init(rawValue: Int) { self.rawValue = rawValue }
    public static let command = CanvasKeyModifiers(rawValue: 1)
    public static let shift = CanvasKeyModifiers(rawValue: 2)
    public static let option = CanvasKeyModifiers(rawValue: 4)
    public static let control = CanvasKeyModifiers(rawValue: 8)
}

public enum CanvasKeyAction: Equatable, Sendable {
    case spaceDown(repeat: Bool)
    case spaceUp
    case deleteSelection
    case escape
    case zDown(repeat: Bool)
    case zUp
    case toggleCircuitMode
    /// H / V: leave circuit mode and pick the tool.
    case navigateTool
    case selectTool
    /// F: the selection, else the whole board.
    case frameSelectionOrBoard
    /// + / − (×1.25 each way) and 0 (100 %).
    case zoomIn
    case zoomOut
    case resetZoom
    /// Arrows move the selection a grid cell, ⇧ four cells, ⌥ one point.
    case nudge(dx: Double, dy: Double)
    /// X: start (or cancel) a dependency link from the one selected card.
    case dependencyLink
    /// N: the widget library at the middle of the view.
    case addWidget
    /// ?: the shortcut list.
    case showShortcuts
    /// F2: rename the one selected card.
    case rename
}

public enum CanvasKeyRouting {
    /// `GRID_SIZE`: a plain arrow nudge.
    public static let nudgeStep = CanvasGeometry.gridSize

    /// Nil means "not ours": the host passes the event to `super` (so ⌘-keys
    /// reach the menu bar, which owns them).
    public static func keyDown(_ key: CanvasKey, command: Bool = false, isRepeat: Bool = false, editableTargetFocused: Bool) -> CanvasKeyAction? {
        keyDown(key, modifiers: command ? .command : [], isRepeat: isRepeat, editableTargetFocused: editableTargetFocused)
    }

    public static func keyDown(_ key: CanvasKey, modifiers: CanvasKeyModifiers, isRepeat: Bool = false, editableTargetFocused: Bool) -> CanvasKeyAction? {
        if editableTargetFocused { return nil }
        let command = modifiers.contains(.command) || modifiers.contains(.control)
        let shift = modifiers.contains(.shift)
        switch key {
        case .space: return .spaceDown(repeat: isRepeat)
        case .delete: return .deleteSelection
        case .escape: return .escape
        case .z: return command ? nil : .zDown(repeat: isRepeat)
        case .w: return command || isRepeat || !CircuitFeature.isEnabled ? nil : .toggleCircuitMode
        case .arrow(let direction):
            // ⌘⌥ arrows are the tab menu's; ⌥ alone is the fine nudge.
            if command { return nil }
            let step = modifiers.contains(.option) ? 1 : shift ? nudgeStep * 4 : nudgeStep
            return .nudge(dx: direction.unit.x * step, dy: direction.unit.y * step)
        case .question:
            return command ? nil : .showShortcuts
        case .f2:
            return command || isRepeat ? nil : .rename
        case .plus, .minus, .zero:
            // ⌘+ / ⌘− / ⌘0 are View-menu items; the bare keys are the web's.
            if command { return nil }
            return key == .plus ? .zoomIn : key == .minus ? .zoomOut : .resetZoom
        case .h, .v, .f, .n, .x:
            if command || shift || isRepeat || modifiers.contains(.option) { return nil }
            switch key {
            case .h: return .navigateTool
            case .v: return .selectTool
            case .f: return .frameSelectionOrBoard
            case .n: return .addWidget
            default: return .dependencyLink
            }
        }
    }

    /// Mirrors the web: a key-up inside a text input is not ours either.
    public static func keyUp(_ key: CanvasKey, editableTargetFocused: Bool) -> CanvasKeyAction? {
        if editableTargetFocused { return nil }
        switch key {
        case .space: return .spaceUp
        case .z: return .zUp
        default: return nil
        }
    }
}

public enum KeyboardTargetGuard {
    #if canImport(AppKit)
    /// A text view or a field editor (an `NSTextField`'s editing responder
    /// is also an `NSTextView`) — the Mac's INPUT / TEXTAREA / contenteditable.
    /// Only `NSText` is judged: SwiftUI's hosting views answer other text
    /// protocols without being a field.
    public static func isEditable(_ responder: AnyObject?) -> Bool {
        guard let responder else { return false }
        return responder is NSText
    }
    #elseif canImport(UIKit)
    /// `UITextView` and `UITextField` conform to `UITextInput`; any custom
    /// responder taking keystrokes conforms to `UIKeyInput` at least.
    public static func isEditable(_ responder: AnyObject?) -> Bool {
        guard let responder else { return false }
        if responder is UITextInput { return true }
        if responder is UIKeyInput { return true }
        return false
    }

    /// UIKit has no public first-responder accessor: walk the window.
    public static func firstResponder(in root: UIView?) -> UIResponder? {
        guard let root else { return nil }
        if root.isFirstResponder { return root }
        for child in root.subviews {
            if let found = firstResponder(in: child) { return found }
        }
        return nil
    }
    #endif
}
