import type { TextData } from '../../../types/spatial'
import { skinStateFor } from '../../../utils/widgetSkins'
import { TextMarkdownLayer } from './TextMarkdownLayer'
import {
  stickyStrokePath,
  stickyStrokes,
  type TextSkinMode,
} from './textSkinModel'

/**
 * The Note a card wears while it rests.
 *
 * This is deliberately NOT a second, smaller design. It is the open card's own
 * arrangement and the open card's own stylesheet, drawn at the card's true
 * width and then scaled down by the tile — so a resting note holds exactly the
 * information the open one holds, in the same places, and nothing is truncated
 * to make it fit. Shrinking a page never hides a paragraph.
 *
 * Everything here is inert by construction: no hooks, no store subscription,
 * no measurement, no editable control. Text controls become paragraphs and
 * buttons become plain marks, which is what makes "you cannot write on it
 * until the card is open" true rather than merely policed.
 *
 * The formatting is painted by the SAME layer the open card paints with, so a
 * resting note shows its headings and its bold exactly as they are written.
 * The paint layer is a pure render over a string — it has no caret and no
 * hooks — which is what lets the resting page borrow it without borrowing an
 * editor. The open card's formatting chrome appears only on focus, and a
 * resting card has none, which is why none of it is drawn here.
 */

/** A text control's resting twin: the same box, the same type, no caret. */
function Written({ value, className = '' }: { value: string; className?: string }) {
  return (
    <div className={`gp-md-still gp-bare-field gp-note-written ${className}`}>
      <TextMarkdownLayer text={value} />
    </div>
  )
}

export function TextRestPage({ data, skin }: { data: TextData; skin: TextSkinMode }) {
  const text = data.text ?? ''

  if (skin === 'sticky') {
    const strokes = stickyStrokes(skinStateFor(data, 'sticky').strokes)
    return (
      <div className="gp-note-sticky gp-bare-field" data-note-color={data.color ?? 'yellow'}>
        <div className="gp-note-sticky-sheet gp-bare-field">
          <Written value={text} className="gp-note-sticky-editor" />
          {strokes.length > 0 && (
            <svg
              aria-hidden
              className="gp-note-sticky-ink"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              focusable="false"
            >
              {strokes.map((stroke, index) => (
                <path key={index} d={stickyStrokePath(stroke)} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          )}
        </div>
      </div>
    )
  }

  if (skin === 'typewriter') {
    return (
      <div className="gp-note-skin gp-note-typewriter" data-note-skin="typewriter">
        <header className="gp-note-toolbar">
          <span className="gp-note-eyebrow">Draft</span>
        </header>
        <div className="gp-note-typewriter-paper gp-bare-field">
          <Written value={text} className="gp-note-editor" />
        </div>
      </div>
    )
  }

  return (
    <div className="gp-note-skin gp-note-plain gp-bare-field" data-note-skin="plain">
      <Written value={text} className="gp-note-editor" />
    </div>
  )
}
