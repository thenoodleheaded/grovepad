import SwiftUI
import GrovepadCore

// ---------------------------------------------------------------------------
// The one text-editing seam (roadmap decision 6): TextKit 2 through
// NSTextView / UITextView, never SwiftUI `TextEditor`, never a web view.
// Real selection, autocorrect, Writing Tools and Scribble come for free.
// ---------------------------------------------------------------------------

/// The look a text skin asks for.
public struct TextEditorStyle: Equatable {
    public var fontSize: CGFloat
    public var monospaced: Bool
    public var textColor: Color
    public var lineSpacing: CGFloat

    public init(fontSize: CGFloat = 13, monospaced: Bool = false, textColor: Color = .primary, lineSpacing: CGFloat = 3) {
        self.fontSize = fontSize
        self.monospaced = monospaced
        self.textColor = textColor
        self.lineSpacing = lineSpacing
    }
}

#if canImport(AppKit)
import AppKit

public struct TextKitEditor: NSViewRepresentable {
    @Binding var text: String
    var style: TextEditorStyle
    var placeholder: String

    public init(text: Binding<String>, style: TextEditorStyle = TextEditorStyle(), placeholder: String = "") {
        _text = text
        self.style = style
        self.placeholder = placeholder
    }

    public func makeCoordinator() -> Coordinator { Coordinator(self) }

    public func makeNSView(context: Context) -> NSScrollView {
        // Never scrolls: the editor is always as tall as its text (the card
        // grows to hold it), and a wheel over it moves the canvas.
        let scroll = PassThroughScrollView()
        scroll.verticalScrollElasticity = .none
        scroll.horizontalScrollElasticity = .none
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = false
        scroll.borderType = .noBorder
        // `usingTextLayoutManager: true` is the TextKit 2 stack.
        let view = NSTextView(usingTextLayoutManager: true)
        view.delegate = context.coordinator
        view.drawsBackground = false
        view.isRichText = false
        view.allowsUndo = false
        view.isAutomaticQuoteSubstitutionEnabled = false
        view.textContainerInset = NSSize(width: 0, height: 2)
        view.isVerticallyResizable = true
        view.isHorizontallyResizable = false
        view.autoresizingMask = [.width]
        view.textContainer?.widthTracksTextView = true
        view.setAccessibilityLabel(placeholder.isEmpty ? "Text" : placeholder)
        scroll.documentView = view
        apply(style, to: view)
        view.string = text
        return scroll
    }

    /// The height the whole text needs at the proposed width.
    public func sizeThatFits(_ proposal: ProposedViewSize, nsView: NSScrollView, context: Context) -> CGSize? {
        guard let view = nsView.documentView as? NSTextView, let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let padding = (view.textContainer?.lineFragmentPadding ?? 5) * 2
        // A trailing newline still owns an empty line; an empty editor one line.
        let measured = text.isEmpty || text.hasSuffix("\n") ? text + " " : text
        let bounds = NSAttributedString(string: measured, attributes: view.typingAttributes)
            .boundingRect(with: CGSize(width: max(1, width - padding), height: .greatestFiniteMagnitude), options: [.usesLineFragmentOrigin, .usesFontLeading])
        return CGSize(width: width, height: ceil(bounds.height) + view.textContainerInset.height * 2)
    }

    public func updateNSView(_ scroll: NSScrollView, context: Context) {
        guard let view = scroll.documentView as? NSTextView else { return }
        context.coordinator.parent = self
        apply(style, to: view)
        if view.string != text { view.string = text }
    }

    private func apply(_ style: TextEditorStyle, to view: NSTextView) {
        let font = style.monospaced
            ? NSFont.monospacedSystemFont(ofSize: style.fontSize, weight: .regular)
            : NSFont.systemFont(ofSize: style.fontSize, weight: .medium)
        view.font = font
        view.textColor = NSColor(style.textColor)
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = style.lineSpacing
        view.defaultParagraphStyle = paragraph
        view.typingAttributes = [.font: font, .foregroundColor: NSColor(style.textColor), .paragraphStyle: paragraph]
    }

    public final class Coordinator: NSObject, NSTextViewDelegate {
        var parent: TextKitEditor
        init(_ parent: TextKitEditor) { self.parent = parent }

        public func textDidChange(_ notification: Notification) {
            guard let view = notification.object as? NSTextView else { return }
            if parent.text != view.string { parent.text = view.string }
        }
    }
}
/// A scroll view that never scrolls: wheel and trackpad events go on up to
/// the canvas.
final class PassThroughScrollView: NSScrollView {
    override func scrollWheel(with event: NSEvent) { nextResponder?.scrollWheel(with: event) }
}
#elseif canImport(UIKit)
import UIKit

public struct TextKitEditor: UIViewRepresentable {
    @Binding var text: String
    var style: TextEditorStyle
    var placeholder: String

    public init(text: Binding<String>, style: TextEditorStyle = TextEditorStyle(), placeholder: String = "") {
        _text = text
        self.style = style
        self.placeholder = placeholder
    }

    public func makeCoordinator() -> Coordinator { Coordinator(self) }

    public func makeUIView(context: Context) -> UITextView {
        // `usingTextLayoutManager: true` is the TextKit 2 stack.
        let view = UITextView(usingTextLayoutManager: true)
        view.delegate = context.coordinator
        view.backgroundColor = .clear
        // Never scrolls: as tall as its text, the card grows to hold it.
        view.isScrollEnabled = false
        view.textContainerInset = UIEdgeInsets(top: 2, left: 0, bottom: 2, right: 0)
        view.accessibilityLabel = placeholder.isEmpty ? "Text" : placeholder
        apply(style, to: view)
        view.text = text
        return view
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width.isFinite, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    public func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        apply(style, to: view)
        if view.text != text { view.text = text }
    }

    private func apply(_ style: TextEditorStyle, to view: UITextView) {
        view.font = style.monospaced
            ? UIFont.monospacedSystemFont(ofSize: style.fontSize, weight: .regular)
            : UIFont.systemFont(ofSize: style.fontSize, weight: .medium)
        view.textColor = UIColor(style.textColor)
    }

    public final class Coordinator: NSObject, UITextViewDelegate {
        var parent: TextKitEditor
        init(_ parent: TextKitEditor) { self.parent = parent }

        public func textViewDidChange(_ view: UITextView) {
            if parent.text != view.text { parent.text = view.text }
        }
    }
}
#endif
