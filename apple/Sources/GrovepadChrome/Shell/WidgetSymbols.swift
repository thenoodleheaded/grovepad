import Foundation

// ---------------------------------------------------------------------------
// The identity mark each widget type wears in its title row. The web draws a
// lucide icon per registry entry (`icon:` in `widgets/registry/*.ts`); the
// port stands an SF Symbol in for each, chosen for the same reading rather
// than the same drawing. A worn skin wears its own mark, as every web skin
// carries its own icon (`skins[].icon`).
// ---------------------------------------------------------------------------

public enum WidgetSymbols {
    /// What a type outside the table wears — never a real widget's mark.
    public static let placeholder = "square.dashed"

    /// Type → SF Symbol, one row per in-scope type, with the lucide icon it
    /// stands in for.
    public static let byType: [String: String] = [
        // Phase 3
        "canvas_node": "folder.fill",                          // FolderOpen
        "text": "doc.text",                                    // FileText
        "bullets": "list.bullet",                              // List
        "checklist": "checklist",                              // ListChecks
        "flashcards": "rectangle.on.rectangle.angled",         // Layers
        "counter": "number",                                   // Hash
        "toggle": "switch.2",                                  // ToggleRight
        "number_input": "textformat.123",                      // Hash (a typed number)
        // Notes and study
        "code": "chevron.left.forwardslash.chevron.right",     // Code2
        "outline": "list.bullet.indent",                       // ListTree
        "pros_cons": "scalemass",                              // Scale
        "decision": "dice",                                    // Dices
        "meeting_notes": "list.clipboard",                     // ClipboardList
        "goal_tracker": "target",                              // Goal
        "reading_list": "book",                                // BookOpen
        "grade_calc": "graduationcap",                         // Calculator (the grade, not the keys)
        "formula_sheet": "function",                           // FunctionSquare
        "citation": "bookmark",                                // BookMarked
        // Tracking, data and input
        "habit": "flame",                                      // Flame
        "timekeeper": "timer",                                 // Timer
        "calendar": "calendar",                                // CalendarDays
        "rating": "star",                                      // Star
        "calculator": "plus.slash.minus",                      // Calculator
        "bar_chart": "chart.bar.fill",                         // BarChart3
        "table": "tablecells",                                 // Table2
        "metrics": "chart.bar.xaxis",                          // ChartNoAxesColumn
        "mood_tracker": "face.smiling",                        // Smile
        "links": "link",                                       // Link2
        "poll": "checklist.checked",                           // Vote
        "text_input": "character.cursor.ibeam",                // TextCursorInput
        "date_picker": "calendar.badge.clock",                 // CalendarClock
        "formula": "x.squareroot",                             // FunctionSquare (told apart from the sheet)
        "status": "gauge.with.needle",                         // Gauge
    ]

    /// Lucide name → SF Symbol for every icon a skin of an in-scope type
    /// wears on the web. Each skin's lucide name reaches the port through the
    /// registry (`WidgetSkinOption.icon`, generated from the conformance
    /// pack), so a skin whose web icon changes follows it here; a name this
    /// table lacks falls back to the type's mark and fails `WidgetSymbolsTests`.
    static let byLucide: [String: String] = [
        "AtSign": "at",
        "BadgeCheck": "checkmark.seal",
        "Binary": "01.square",
        "BrainCircuit": "brain",
        "Calculator": "plus.slash.minus",
        "CalendarClock": "calendar.badge.clock",
        "CalendarDays": "calendar",
        "CalendarHeart": "gift",
        "CalendarRange": "calendar.day.timeline.left",
        "CalendarSync": "arrow.triangle.2.circlepath",
        "ChartColumn": "chart.bar.fill",
        "ChartLine": "chart.xyaxis.line",
        "ChartNoAxesColumn": "chart.bar.xaxis",
        "ChartPie": "chart.pie",
        "ChartSpline": "point.bottomleft.forward.to.point.topright.scurvepath",
        "ChevronsUpDown": "chevron.up.chevron.down",
        "CircleDashed": "circle.dashed",
        "CircleDot": "record.circle",
        "Clapperboard": "movieclapper",
        "ClipboardCheck": "clipboard",
        "ClipboardList": "list.clipboard",
        "Clock3": "clock",
        "Coffee": "cup.and.saucer",
        "Columns2": "rectangle.split.2x1",
        "Columns3": "rectangle.split.3x1",
        "Dices": "dice",
        "Dumbbell": "dumbbell",
        "Earth": "globe",
        "FileText": "doc.text",
        "Flag": "flag",
        "FlaskConical": "flask",
        "FolderOpen": "folder.fill",
        "FolderTree": "folder.badge.gearshape",
        "GalleryHorizontalEnd": "rectangle.portrait.on.rectangle.portrait",
        "Gauge": "gauge.with.needle",
        "Gavel": "hammer",
        "GitBranch": "arrow.triangle.branch",
        "Goal": "flag.checkered",
        "GraduationCap": "graduationcap",
        "Grid2x2": "squareshape.split.2x2",
        "Handshake": "arrow.left.arrow.right",
        "Hash": "number",
        "Hourglass": "hourglass",
        "Image": "photo",
        "Inbox": "tray",
        "Languages": "character.book.closed",
        "Layers": "rectangle.on.rectangle.angled",
        "LayoutGrid": "square.grid.2x2",
        "Link2": "link",
        "List": "list.bullet",
        "ListChecks": "checklist",
        "ListMinus": "text.badge.minus",
        "ListOrdered": "list.number",
        "ListPlus": "text.badge.plus",
        "ListRestart": "arrow.uturn.left.circle",
        "ListTree": "list.bullet.indent",
        "Map": "map",
        "MessagesSquare": "bubble.left.and.bubble.right",
        "MousePointerClick": "cursorarrow.click",
        "Network": "point.3.connected.trianglepath.dotted",
        "PanelsTopLeft": "rectangle.on.rectangle",
        "PenLine": "pencil.line",
        "Percent": "percent",
        "Power": "power",
        "Radio": "dot.radiowaves.left.and.right",
        "ReceiptText": "receipt",
        "Repeat": "repeat",
        "Repeat2": "arrow.2.squarepath",
        "RotateCcw": "arrow.counterclockwise",
        "Rows3": "rectangle.grid.1x2",
        "Scale": "scalemass",
        "Scale3d": "cube",
        "ScrollText": "scroll",
        "Search": "magnifyingglass",
        "ShieldAlert": "exclamationmark.shield",
        "ShieldCheck": "checkmark.shield",
        "ShoppingCart": "cart",
        "Sigma": "sum",
        "SlidersHorizontal": "slider.horizontal.3",
        "Smile": "face.smiling",
        "Sparkles": "sparkles",
        "SquareCheckBig": "checkmark.square",
        "SquareTerminal": "terminal",
        "Star": "star",
        "StickyNote": "note.text",
        "Sunrise": "sunrise",
        "Swords": "figure.fencing",
        "Tags": "tag",
        "Target": "target",
        "Terminal": "apple.terminal",
        "TextAlignStart": "text.alignleft",
        "TextCursorInput": "character.cursor.ibeam",
        "Timeline": "timeline.selection",
        "Timer": "timer",
        "TimerReset": "stopwatch",
        "ToggleRight": "switch.2",
        "TrafficCone": "light.beacon.max",
        "TrendingUp": "chart.line.uptrend.xyaxis",
        "Undo2": "arrow.uturn.backward",
        "Variable": "equal.square",
    ]

    /// The mark for a type wearing a skin — the skin's own icon, as on the
    /// web — or the type's mark when no skin is worn; the placeholder for a
    /// type the table does not know.
    public static func symbol(for type: String, skin: String? = nil) -> String {
        if let skin,
           let icon = WidgetRegistry.definition(for: type)?.skins.first(where: { $0.value == skin })?.icon,
           let symbol = byLucide[icon] {
            return symbol
        }
        return byType[type] ?? placeholder
    }
}
