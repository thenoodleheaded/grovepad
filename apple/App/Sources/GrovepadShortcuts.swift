import AppIntents
import GrovepadApp

// The App Intents registration for this target: the intents and the canvas
// entity live in the `GrovepadApp` library (`Integration/AppIntents.swift`);
// the metadata extractor finds them through this package declaration. The
// App Shortcuts provider (the Siri phrases) must be in the app target itself.

struct GrovepadIntentsPackage: AppIntentsPackage {
    static var includedPackages: [any AppIntentsPackage.Type] { [GrovepadAppIntentsPackage.self] }
}

struct GrovepadShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OpenBoardIntent(),
            phrases: [
                "Open a canvas in \(.applicationName)",
                "Open \(\.$canvas) in \(.applicationName)",
            ],
            shortTitle: "Open Canvas",
            systemImageName: "square.grid.2x2"
        )
        AppShortcut(
            intent: AddNoteIntent(),
            phrases: [
                "Add a note in \(.applicationName)",
                "Add a note to \(.applicationName)",
                "New \(.applicationName) note",
            ],
            shortTitle: "Add Note",
            systemImageName: "note.text"
        )
        AppShortcut(
            intent: AddFlashcardIntent(),
            phrases: [
                "Add a flashcard in \(.applicationName)",
                "Add a flashcard to \(.applicationName)",
            ],
            shortTitle: "Add Flashcard",
            systemImageName: "rectangle.on.rectangle.angled"
        )
    }
}
