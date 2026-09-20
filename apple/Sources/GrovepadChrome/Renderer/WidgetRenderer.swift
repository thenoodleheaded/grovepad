import Foundation
import SwiftUI
import GrovepadCore
import GrovepadCanvas

// ---------------------------------------------------------------------------
// The renderer protocol (roadmap phase 3): one card body, one resting body,
// and one resting-face model per widget type (no far tier: owner, 18 Sep 2026). Bodies are
// SwiftUI; they read the widget through a context and write through it, so a
// tap and a wire go through the same field and command tables.
// ---------------------------------------------------------------------------

/// What a card body needs from the document, without seeing the document.
public struct WidgetCardContext {
    public var widget: Widget
    public var definition: WidgetDefinition
    /// `#rrggbb` — the worn skin's accent or the type's.
    public var accent: String
    /// The skin the data wears, if the catalogue knows it.
    public var skin: WidgetSkinOption?
    /// The raw `data[skinField]` value, defaulted to the first skin.
    public var skinValue: String
    /// Mutates `data` in place through `BoardDocument.updateWidgetData`.
    public var update: (@escaping (inout JSONObject) -> Void) -> Void
    /// Runs one of `commandsFor(type)` through the document.
    public var runCommand: (String) -> Void
    /// A finger or Pencil is driving (touch adaptation, question 1).
    public var isTouch: Bool
    /// Inside the glass budget: the backplate may use the system container.
    public var glassAllowed: Bool
    /// Opens a canvas (a Canvas card's door).
    public var openCanvas: (String) -> Void
    /// The name of a canvas the document knows, for the doorplate.
    public var canvasName: (String) -> String?
    /// Mints item ids the way the web's inline `crypto.randomUUID()` does.
    public var mint: IdMinter
    /// The card's own header buttons (expand, pin, star, delete) and its
    /// selected state; nil where no canvas hosts the card (tests, previews).
    public var actions: WidgetCardActions?

    public init(
        widget: Widget,
        definition: WidgetDefinition,
        accent: String? = nil,
        update: @escaping (@escaping (inout JSONObject) -> Void) -> Void = { _ in },
        runCommand: @escaping (String) -> Void = { _ in },
        isTouch: Bool = false,
        glassAllowed: Bool = false,
        openCanvas: @escaping (String) -> Void = { _ in },
        canvasName: @escaping (String) -> String? = { _ in nil },
        mint: IdMinter = .system
    ) {
        self.mint = mint
        self.widget = widget
        self.definition = definition
        let data = widget.data
        self.skin = definition.skin(for: data)
        self.skinValue = definition.skinValue(in: data) ?? definition.skins.first?.value ?? ""
        self.accent = accent ?? definition.accent(for: data)
        self.update = update
        self.runCommand = runCommand
        self.isTouch = isTouch
        self.glassAllowed = glassAllowed
        self.openCanvas = openCanvas
        self.canvasName = canvasName
    }

    public var data: JSONObject { widget.data }
}

/// The header actions a live card shows on hover or while selected — the
/// web card's full screen / pin / completed / star / delete row
/// (`WidgetCard.tsx`); which of them a card wears is
/// `WidgetTitleRow.buttons(for: widgetType)`.
public struct WidgetCardActions {
    public var isSelected: Bool
    /// The card's type: decides the button set and the expand label.
    public var widgetType: String = ""
    public var expand: () -> Void
    public var togglePinned: () -> Void
    public var toggleFavorite: () -> Void
    public var delete: () -> Void
    /// The checklist's Completed button: its state and its toggle.
    public var isCompleted: Bool = false
    public var toggleCompleted: () -> Void = {}
    /// The title is an editable field right now (`renamingWidgetId`).
    public var isRenaming: Bool = false
    /// Ends a rename: the new title, or nil to cancel.
    public var finishRename: (String?) -> Void = { _ in }

    public init(isSelected: Bool, widgetType: String = "", expand: @escaping () -> Void, togglePinned: @escaping () -> Void, toggleFavorite: @escaping () -> Void, delete: @escaping () -> Void, isCompleted: Bool = false, toggleCompleted: @escaping () -> Void = {}, isRenaming: Bool = false, finishRename: @escaping (String?) -> Void = { _ in }) {
        self.isSelected = isSelected
        self.widgetType = widgetType
        self.isRenaming = isRenaming
        self.finishRename = finishRename
        self.expand = expand
        self.togglePinned = togglePinned
        self.toggleFavorite = toggleFavorite
        self.delete = delete
        self.isCompleted = isCompleted
        self.toggleCompleted = toggleCompleted
    }
}

/// What a resting body needs: the model and the tile it was measured for.
public struct WidgetRestContext {
    public var widget: Widget
    public var definition: WidgetDefinition
    public var accent: String
    public var face: RestingFace
    public var canvasName: (String) -> String?
    /// The skin the card is wearing, so a resting face reads the same
    /// identity mark the open card's title row does.
    public var skinValue: String

    public init(widget: Widget, definition: WidgetDefinition, face: RestingFace, accent: String? = nil, canvasName: @escaping (String) -> String? = { _ in nil }) {
        self.widget = widget
        self.definition = definition
        self.face = face
        self.accent = accent ?? definition.accent(for: widget.data)
        self.canvasName = canvasName
        self.skinValue = definition.skinValue(in: widget.data) ?? definition.skins.first?.value ?? ""
    }
}

public protocol WidgetRenderer {
    associatedtype Body: View
    associatedtype Rest: View
    /// The module type this renderer owns.
    static var type: String { get }
    /// The live, editable card body (inside the backplate).
    @ViewBuilder func cardBody(_ context: WidgetCardContext) -> Body
    /// The resting tile's content, drawn at `context.face.size`.
    @ViewBuilder func restingBody(_ context: WidgetRestContext) -> Rest
    /// What the widget shows at rest and how much space it needs.
    func restingFace(_ widget: Widget) -> RestingFaceModel
}

public extension WidgetRenderer {
    /// The measured tile for a widget (`restingFace(widget).size`).
    func restingFaceMeasured(_ widget: Widget) -> RestingFace {
        RestingFaceMeasure.face(restingFace(widget), type: widget.type, title: widget.title, widgetSize: widget.size)
    }
}

/// Type-erased renderer so the registry can hold every widget in one map.
public struct AnyWidgetRenderer {
    public let type: String
    private let body: (WidgetCardContext) -> AnyView
    private let rest: (WidgetRestContext) -> AnyView
    private let face: (Widget) -> RestingFaceModel

    public init<R: WidgetRenderer>(_ renderer: R) {
        type = R.type
        body = { AnyView(renderer.cardBody($0)) }
        rest = { AnyView(renderer.restingBody($0)) }
        face = { renderer.restingFace($0) }
    }

    public func cardBody(_ context: WidgetCardContext) -> AnyView { body(context) }
    public func restingBody(_ context: WidgetRestContext) -> AnyView { rest(context) }
    public func restingFace(_ widget: Widget) -> RestingFaceModel { face(widget) }
    public func restingFaceMeasured(_ widget: Widget) -> RestingFace {
        RestingFaceMeasure.face(face(widget), type: widget.type, title: widget.title, widgetSize: widget.size)
    }
}

/// Type → renderer. A type in the registry without a renderer of its own
/// (the rest of the first build, phase 8) falls back to the placeholder.
public enum WidgetRendererRegistry {
    public static let renderers: [String: AnyWidgetRenderer] = {
        let list: [AnyWidgetRenderer] = [
            AnyWidgetRenderer(TextWidget()),
            AnyWidgetRenderer(CanvasNodeWidget()),
            AnyWidgetRenderer(BulletsWidget()),
            AnyWidgetRenderer(ChecklistWidget()),
            AnyWidgetRenderer(FlashcardsWidget()),
            AnyWidgetRenderer(CounterWidget()),
            AnyWidgetRenderer(ToggleWidget()),
            AnyWidgetRenderer(NumberInputWidget()),
        ] + notesAndStudyRenderers + trackingAndDataRenderers
        return Dictionary(uniqueKeysWithValues: list.map { ($0.type, $0) })
    }()

    /// Phase 8 families register their renderers from their own files so two
    /// porting tasks never edit the same list. Each family file provides one
    /// extension property here; empty until that family lands.
    public static var notesAndStudyRenderers: [AnyWidgetRenderer] { NotesAndStudyFamily.renderers }
    public static var trackingAndDataRenderers: [AnyWidgetRenderer] { TrackingAndDataFamily.renderers }

    public static let placeholder = AnyWidgetRenderer(PlaceholderWidget())

    /// The ported types, in registry order.
    public static var portedTypes: [String] {
        WidgetRegistry.definitions.keys.filter { renderers[$0] != nil }
    }

    public static func renderer(for type: String) -> AnyWidgetRenderer {
        renderers[type] ?? placeholder
    }
}

/// The body for an in-scope type whose renderer has not been ported yet.
public struct PlaceholderWidget: WidgetRenderer {
    public static let type = "__placeholder"

    public init() {}

    public func cardBody(_ context: WidgetCardContext) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(context.definition.label).font(GlassType.value)
            Text(context.definition.description).font(GlassType.body).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    public func restingBody(_ context: WidgetRestContext) -> some View {
        RestIconGlyph(accent: context.accent)
    }

    public func restingFace(_ widget: Widget) -> RestingFaceModel { .icon }
}
