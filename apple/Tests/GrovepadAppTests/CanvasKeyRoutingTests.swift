import XCTest
import GrovepadCore
import GrovepadCanvas
import GrovepadChrome
@testable import GrovepadApp
#if canImport(AppKit)
import AppKit
#endif

/// The hardware-key guard both canvas hosts share (`CanvasKeyRouting`,
/// `KeyboardTargetGuard`): with a text input focused, space / delete /
/// escape / Z / W are the editor's (the web's `isEditableTarget` early
/// return in `gestureEngine.ts`); without one each still does its job.
/// The Mac host is driven with real key events over a real text view.
@MainActor
final class CanvasKeyRoutingTests: XCTestCase {

    /// These tests exercise the circuit system, which the app ships frozen
    /// (`CircuitFeature`); each switches it on for itself only.
    override func invokeTest() {
        let previous = CircuitFeature.isEnabled
        CircuitFeature.isEnabled = true
        defer { CircuitFeature.isEnabled = previous }
        super.invokeTest()
    }
    func testEveryCanvasKeyIsSilencedWhileATextInputHasTheKeyboard() {
        for key in [CanvasKey.space, .delete, .escape, .z, .w] {
            XCTAssertNil(CanvasKeyRouting.keyDown(key, editableTargetFocused: true), "\(key) down falls through to the editor")
            XCTAssertNil(CanvasKeyRouting.keyDown(key, isRepeat: true, editableTargetFocused: true))
            XCTAssertNil(CanvasKeyRouting.keyUp(key, editableTargetFocused: true), "\(key) up falls through too (no stuck modifier)")
        }
    }

    func testEveryCanvasKeyDoesItsJobOnTheCanvas() {
        XCTAssertEqual(CanvasKeyRouting.keyDown(.space, editableTargetFocused: false), .spaceDown(repeat: false))
        XCTAssertEqual(CanvasKeyRouting.keyDown(.space, isRepeat: true, editableTargetFocused: false), .spaceDown(repeat: true))
        XCTAssertEqual(CanvasKeyRouting.keyUp(.space, editableTargetFocused: false), .spaceUp)
        XCTAssertEqual(CanvasKeyRouting.keyDown(.delete, editableTargetFocused: false), .deleteSelection)
        XCTAssertEqual(CanvasKeyRouting.keyDown(.escape, editableTargetFocused: false), .escape)
        XCTAssertEqual(CanvasKeyRouting.keyDown(.z, editableTargetFocused: false), .zDown(repeat: false))
        XCTAssertEqual(CanvasKeyRouting.keyUp(.z, editableTargetFocused: false), .zUp)
        XCTAssertEqual(CanvasKeyRouting.keyDown(.w, editableTargetFocused: false), .toggleCircuitMode)
        XCTAssertNil(CanvasKeyRouting.keyDown(.w, isRepeat: true, editableTargetFocused: false), "a held W toggles once")
        XCTAssertNil(CanvasKeyRouting.keyDown(.z, command: true, editableTargetFocused: false), "⌘Z is Undo, the menu's")
        XCTAssertNil(CanvasKeyRouting.keyDown(.w, command: true, editableTargetFocused: false), "⌘W is the window's")
        XCTAssertNil(CanvasKeyRouting.keyUp(.delete, editableTargetFocused: false))
        XCTAssertNil(CanvasKeyRouting.keyUp(.w, editableTargetFocused: false))
    }

    #if canImport(AppKit)
    func testTheMacGuardKnowsATextViewAndAFieldEditorFromAnythingElse() {
        XCTAssertFalse(KeyboardTargetGuard.isEditable(nil))
        XCTAssertFalse(KeyboardTargetGuard.isEditable(NSView()))
        XCTAssertFalse(KeyboardTargetGuard.isEditable(NSButton()))
        XCTAssertTrue(KeyboardTargetGuard.isEditable(NSTextView()))
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 300, height: 200), styleMask: [.titled], backing: .buffered, defer: false)
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 200, height: 24))
        window.contentView?.addSubview(field)
        window.makeFirstResponder(field)
        XCTAssertTrue(KeyboardTargetGuard.isEditable(window.firstResponder), "a text field edits through a field editor, an NSTextView")
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 49, characters: " "), .space)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 51, characters: nil), .delete)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 117, characters: nil), .delete)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 53, characters: nil), .escape)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 6, characters: "Z"), .z)
        XCTAssertEqual(MacCanvasHostView.canvasKey(keyCode: 13, characters: "w"), .w)
        XCTAssertNil(MacCanvasHostView.canvasKey(keyCode: 0, characters: "a"))
    }

    func testTheMacHostLeavesTheDocumentAloneWhileTyping() throws {
        let directory = AppFixtures.temporaryDirectory("keys")
        defer { try? FileManager.default.removeItem(at: directory) }
        let coordinator = AppFixtures.coordinator(directory: directory, timers: ManualTimerSource())
        coordinator.start()
        defer { coordinator.dispose() }
        let session = coordinator.makeSession()
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1000, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        let host = MacCanvasHostView(session: session, screenScale: 2)
        host.frame = NSRect(x: 0, y: 0, width: 1000, height: 700)
        window.contentView = host
        host.layout()
        let document = coordinator.document
        let note = try XCTUnwrap(document.createWidget(type: "text", at: .zero, title: "Note"))
        document.select(note)

        // A text view (a live card's editor) has the keyboard.
        let editor = NSTextView(frame: NSRect(x: 0, y: 0, width: 200, height: 100))
        host.addSubview(editor)
        window.makeFirstResponder(editor)
        XCTAssertTrue(host.editableTargetFocused)
        host.keyDown(with: key(49, " ", window))
        XCTAssertFalse(host.interaction.gesture.isSpacePressed, "space is a character, not the pan modifier")
        host.keyDown(with: key(51, "\u{7F}", window))
        XCTAssertNotNil(document.widget(note), "Backspace edits the words, never deletes the card being typed in")
        host.keyDown(with: key(13, "w", window))
        XCTAssertFalse(document.circuitUI.circuitMode, "W is a letter")
        host.keyDown(with: key(6, "z", window))
        host.keyUp(with: key(6, "z", window))
        XCTAssertEqual(document.selection, [note], "Escape and the rest are the editor's too")
        host.keyDown(with: key(53, "\u{1B}", window))
        XCTAssertEqual(document.selection, [note])

        // The canvas has the keyboard: the same keys drive it.
        window.makeFirstResponder(host)
        XCTAssertFalse(host.editableTargetFocused)
        host.keyDown(with: key(49, " ", window))
        XCTAssertTrue(host.interaction.gesture.isSpacePressed)
        host.keyUp(with: key(49, " ", window))
        XCTAssertFalse(host.interaction.gesture.isSpacePressed)
        host.keyDown(with: key(13, "w", window))
        XCTAssertTrue(document.circuitUI.circuitMode)
        host.keyDown(with: key(13, "w", window))
        XCTAssertFalse(document.circuitUI.circuitMode)
        host.keyDown(with: key(51, "\u{7F}", window))
        XCTAssertNil(document.widget(note), "Backspace on the canvas deletes the selection")
    }

    private func key(_ code: UInt16, _ characters: String, _ window: NSWindow) -> NSEvent {
        NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0, windowNumber: window.windowNumber, context: nil, characters: characters, charactersIgnoringModifiers: characters, isARepeat: false, keyCode: code)!
    }
    #endif
}
