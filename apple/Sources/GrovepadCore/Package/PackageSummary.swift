import Foundation

// ---------------------------------------------------------------------------
// A plain-words summary of a `.grovepad` package for surfaces that show a
// file without opening it: the Quick Look preview extension, the open-with
// confirmation. Built from the parsed board only (Foundation, no UI), so the
// extension links GrovepadCore alone and the app can test the same text.
// ---------------------------------------------------------------------------

public struct PackageSummary: Equatable, Sendable {
    public struct WorkspaceLine: Equatable, Sendable {
        public var name: String
        public var canvasCount: Int
        public var cardCount: Int

        public init(name: String, canvasCount: Int, cardCount: Int) {
            self.name = name
            self.canvasCount = canvasCount
            self.cardCount = cardCount
        }
    }

    public struct CanvasLine: Equatable, Sendable {
        public var name: String
        public var workspaceName: String
        public var cardCount: Int
        /// The first few card titles in record order (untitled cards fall
        /// back to their type label), for the "what is inside" glance.
        public var firstCardTitles: [String]

        public init(name: String, workspaceName: String, cardCount: Int, firstCardTitles: [String]) {
            self.name = name
            self.workspaceName = workspaceName
            self.cardCount = cardCount
            self.firstCardTitles = firstCardTitles
        }
    }

    public var workspaceCount: Int
    public var canvasCount: Int
    public var cardCount: Int
    public var mediaCount: Int
    public var workspaces: [WorkspaceLine]
    public var canvases: [CanvasLine]

    public init(workspaceCount: Int, canvasCount: Int, cardCount: Int, mediaCount: Int, workspaces: [WorkspaceLine], canvases: [CanvasLine]) {
        self.workspaceCount = workspaceCount
        self.canvasCount = canvasCount
        self.cardCount = cardCount
        self.mediaCount = mediaCount
        self.workspaces = workspaces
        self.canvases = canvases
    }

    /// How many titles a canvas line carries.
    public static let titleLimit = 5
    /// How many canvases the summary lists (the counts are always whole).
    public static let canvasLimit = 24

    public static func build(_ package: ImportedPackage) -> PackageSummary {
        build(package.board, mediaCount: package.media.count)
    }

    public static func build(_ board: Board, mediaCount: Int = 0) -> PackageSummary {
        var cardsPerCanvas: [String: [Widget]] = [:]
        for widget in board.widgets.values {
            cardsPerCanvas[widget.canvasId, default: []].append(widget)
        }
        var canvasesPerWorkspace: [String: Int] = [:]
        var cardsPerWorkspace: [String: Int] = [:]
        for canvas in board.canvases.values {
            canvasesPerWorkspace[canvas.workspaceId, default: 0] += 1
            cardsPerWorkspace[canvas.workspaceId, default: 0] += cardsPerCanvas[canvas.id]?.count ?? 0
        }
        let workspaces = board.workspaces.values.map { workspace in
            WorkspaceLine(
                name: displayName(workspace.name, fallback: "Workspace"),
                canvasCount: canvasesPerWorkspace[workspace.id] ?? 0,
                cardCount: cardsPerWorkspace[workspace.id] ?? 0
            )
        }
        let canvases = board.canvases.values.prefix(canvasLimit).map { canvas in
            let cards = cardsPerCanvas[canvas.id] ?? []
            return CanvasLine(
                name: displayName(canvas.name, fallback: "Canvas"),
                workspaceName: displayName(board.workspaces[canvas.workspaceId]?.name ?? "", fallback: "Workspace"),
                cardCount: cards.count,
                firstCardTitles: cards.prefix(titleLimit).map(cardTitle)
            )
        }
        return PackageSummary(
            workspaceCount: board.workspaces.count,
            canvasCount: board.canvases.count,
            cardCount: board.widgets.count,
            mediaCount: mediaCount,
            workspaces: workspaces,
            canvases: Array(canvases)
        )
    }

    /// The card's title, or its type as a label when the title is blank.
    public static func cardTitle(_ widget: Widget) -> String {
        let title = widget.title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !title.isEmpty { return title }
        return typeLabel(widget.type)
    }

    /// `canvas_node` → "Canvas node" (the core catalog carries no labels;
    /// the chrome registry does, but a preview extension never links it).
    public static func typeLabel(_ type: String) -> String {
        let words = type.split(separator: "_").map(String.init)
        guard let first = words.first else { return "Card" }
        return ([first.prefix(1).uppercased() + first.dropFirst()] + words.dropFirst()).joined(separator: " ")
    }

    static func displayName(_ name: String, fallback: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }

    /// One line for a list row or a subtitle: "2 workspaces · 5 canvases · 18 cards".
    public var headline: String {
        [
            count(workspaceCount, "workspace"),
            count(canvasCount, "canvas", plural: "canvases"),
            count(cardCount, "card"),
        ].joined(separator: " · ")
    }

    func count(_ n: Int, _ noun: String, plural: String? = nil) -> String {
        "\(n) \(n == 1 ? noun : (plural ?? noun + "s"))"
    }
}
