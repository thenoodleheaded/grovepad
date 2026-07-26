import {
  AlertCircle,
  ArrowUpRight,
  AtSign,
  Check,
  ChevronRight,
  CornerDownLeft,
  Link2,
  Plus,
  RotateCcw,
  Search,
  X,
} from 'lucide-react'
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import type { ModuleData, TextInputData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  isMultilineSkin,
  textInputDraft,
  textInputEmail,
  textInputHistory,
  textInputLink,
  textInputPlaceholder,
  textInputTags,
  withCommandRun,
  withTextInputTag,
  withoutTextInputTag,
  type TextInputSkinMode,
} from './textInputSkinModel'

interface TextInputWidgetProps {
  data: TextInputData
  onChange: (data: TextInputData) => void
  skin?: TextInputSkinMode
}

interface SkinProps {
  data: TextInputData
  skin: TextInputSkinMode
  patch: (next: Partial<TextInputData>) => void
}

/* ------------------------------------------------------------------ shared */

/** The card's name. Every skin carries it, in the same quiet label voice. */
function InputName({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="gp-input-name gp-bare-field">
      <input
        value={value}
        aria-label="Input name"
        placeholder="Label"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/**
 * A Text Input is a source before it is a field: whatever shape the skin gives
 * it, the string a wire would carry stays visible and the lamp says whether
 * anything is being emitted at all.
 */
function InputHead({
  data,
  patch,
  children,
}: {
  data: TextInputData
  patch: (next: Partial<TextInputData>) => void
  children?: ReactNode
}) {
  const filled = data.value.trim().length > 0
  return (
    <header className="gp-input-head">
      <InputName value={data.label} onChange={(label) => patch({ label })} />
      {children}
      <span
        className="gp-input-lamp"
        data-on={filled || undefined}
        title={filled ? 'Emitting a value' : 'Emitting nothing yet'}
        aria-label={filled ? 'Emitting a value' : 'Emitting nothing yet'}
      />
    </header>
  )
}

/**
 * A quiet closing line. Most skins do not need one — the field IS the emitted
 * string, and repeating it underneath is noise. It appears only where it says
 * something the field cannot: how much has been written, or (for Command) the
 * submitted value, which is deliberately not what is in the box.
 */
function InputFoot({
  children,
  empty,
}: {
  children: ReactNode
  empty?: boolean
}) {
  return (
    <footer className="gp-input-foot" data-empty={empty || undefined}>
      {children}
    </footer>
  )
}

function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string): void {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [ref, value])
}

/* ------------------------------------------------------------------- skins */

/** One line of value, set as the card's own headline. */
function SingleLineSkin({ data, skin, patch }: SkinProps) {
  return (
    <div className="gp-input gp-input--single">
      <InputHead data={data} patch={patch} />
      <div className="gp-input-line gp-bare-field">
        <input
          value={data.value}
          aria-label={data.label || 'Text value'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => patch({ value: event.target.value })}
        />
      </div>
    </div>
  )
}

/** Room for a paragraph, ruled like a page rather than boxed like a field. */
function MultilineSkin({ data, skin, patch }: SkinProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(areaRef, data.value)
  const words = data.value.trim() ? data.value.trim().split(/\s+/).length : 0

  return (
    <div className="gp-input gp-input--multi">
      <InputHead data={data} patch={patch} />
      <div className="gp-input-page gp-bare-field">
        <textarea
          ref={areaRef}
          value={data.value}
          rows={3}
          aria-label={data.label || 'Text value'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => patch({ value: event.target.value })}
        />
      </div>
      <InputFoot empty={words === 0}>
        {words > 0
          ? <span>{words} {words === 1 ? 'word' : 'words'} · {data.value.length} characters</span>
          : <span>Nothing written yet</span>}
      </InputFoot>
    </div>
  )
}

/** A search field: one pill, a magnifier, and a way to empty it again. */
function SearchSkin({ data, skin, patch }: SkinProps) {
  const fieldRef = useRef<HTMLInputElement>(null)
  const filled = data.value.trim().length > 0

  return (
    <div className="gp-input gp-input--search">
      <InputHead data={data} patch={patch} />
      <div className="gp-input-body">
      <div className="gp-input-pill gp-bare-field">
        <Search className="gp-input-lead" size={14} aria-hidden />
        <input
          ref={fieldRef}
          value={data.value}
          aria-label={data.label || 'Search query'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => patch({ value: event.target.value })}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') fieldRef.current?.blur()
          }}
        />
        {filled ? (
          <button
            type="button"
            className="gp-input-clear"
            aria-label="Clear the query"
            title="Clear"
            onClick={() => {
              patch({ value: '' })
              fieldRef.current?.focus()
            }}
          >
            <X size={12} aria-hidden />
          </button>
        ) : (
          <span className="gp-input-hint" aria-hidden>
            <CornerDownLeft size={11} />
          </span>
        )}
      </div>
      </div>
    </div>
  )
}

/** A web address, resolved as you type — and openable only when it is one. */
function UrlSkin({ data, skin, patch }: SkinProps) {
  const link = textInputLink(data.value)
  const typed = data.value.trim().length > 0

  return (
    <div className="gp-input gp-input--url" data-valid={link.valid || undefined}>
      <InputHead data={data} patch={patch} />
      <div className="gp-input-body">
      <div className="gp-input-pill gp-bare-field">
        <Link2 className="gp-input-lead" size={14} aria-hidden />
        <input
          value={data.value}
          inputMode="url"
          spellCheck={false}
          aria-label={data.label || 'Web address'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => patch({ value: event.target.value })}
        />
        {link.href && (
          <a
            className="gp-input-open"
            href={link.href}
            target="_blank"
            rel="noreferrer"
            title={`Open ${link.display}`}
            aria-label={`Open ${link.display} in a new tab`}
          >
            <ArrowUpRight size={13} aria-hidden />
          </a>
        )}
      </div>
      <div className="gp-input-verdict" data-tone={link.valid ? 'good' : typed ? 'warn' : 'idle'}>
        {link.valid ? (
          <>
            <span className="gp-input-chip">{link.scheme}</span>
            {/* The field already shows the address; what it cannot show is
                where that address actually lands. */}
            <strong title={link.display}>{link.host}</strong>
          </>
        ) : typed ? (
          <>
            <AlertCircle size={11} aria-hidden />
            <span>Not a web address yet</span>
          </>
        ) : (
          <span>A host, then the rest of the path.</span>
        )}
      </div>
      </div>
    </div>
  )
}

/** An address-shaped value. The card checks the shape and never sends a thing. */
function EmailSkin({ data, skin, patch }: SkinProps) {
  const email = textInputEmail(data.value)
  const typed = data.value.trim().length > 0

  return (
    <div className="gp-input gp-input--email" data-valid={email.valid || undefined}>
      <InputHead data={data} patch={patch} />
      <div className="gp-input-body">
      <div className="gp-input-pill gp-bare-field">
        <AtSign className="gp-input-lead" size={14} aria-hidden />
        <input
          value={data.value}
          inputMode="email"
          spellCheck={false}
          aria-label={data.label || 'Email address'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => patch({ value: event.target.value })}
        />
        {email.valid && (
          <span className="gp-input-tick" aria-hidden>
            <Check size={12} />
          </span>
        )}
      </div>
      <div className="gp-input-verdict" data-tone={email.valid ? 'good' : typed ? 'warn' : 'idle'}>
        {email.valid ? (
          <>
            <span>Domain</span>
            <span className="gp-input-chip">{email.domain}</span>
          </>
        ) : typed ? (
          <>
            <AlertCircle size={11} aria-hidden />
            <span>A name, an @, then a domain</span>
          </>
        ) : (
          <span>Checked for shape only — nothing is ever sent.</span>
        )}
      </div>
      </div>
    </div>
  )
}

/**
 * Tags are a reading of the same comma-separated string the card already
 * emits, so there is no second copy to keep in step: removing a chip rewrites
 * the value, and the value alone survives a skin change.
 */
function TagsSkin({ data, skin, patch }: SkinProps) {
  const [draft, setDraft] = useState('')
  const tags = textInputTags(data.value)

  const commit = (raw: string) => {
    const addition = raw.trim().replace(/,+$/, '')
    if (!addition) return
    patch({ value: withTextInputTag(data.value, addition) })
    setDraft('')
  }

  return (
    <div className="gp-input gp-input--tags">
      <InputHead data={data} patch={patch} />
      <div className="gp-input-tagfield gp-bare-field">
        <ul className="gp-input-chips">
          {tags.map((tag) => (
            <li key={tag.toLowerCase()}>
              <span>{tag}</span>
              <button
                type="button"
                aria-label={`Remove ${tag}`}
                title={`Remove ${tag}`}
                onClick={() => patch({ value: withoutTextInputTag(data.value, tag) })}
              >
                <X size={10} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="gp-input-tagadd gp-bare-field">
          <Plus className="gp-input-lead" size={12} aria-hidden />
          <input
            value={draft}
            aria-label="Add a tag"
            placeholder={textInputPlaceholder(skin, data.placeholder)}
            onChange={(event) => {
              // A comma is how people end a tag, so it commits rather than
              // landing inside one and splitting it on the next read.
              if (event.target.value.includes(',')) commit(event.target.value)
              else setDraft(event.target.value)
            }}
            onBlur={() => commit(draft)}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commit(draft)
                return
              }
              // Backspace on an empty draft takes the last tag back, the way
              // every token field people already use behaves.
              if (event.key === 'Backspace' && !draft && tags.length > 0) {
                event.preventDefault()
                const last = tags[tags.length - 1]!
                patch({ value: withoutTextInputTag(data.value, last) })
                setDraft(last)
              }
            }}
          />
        </div>
      </div>
      {/* The chips are the value; the only thing they cannot say is how many
          of them there are once the row has wrapped. */}
      <InputFoot empty={tags.length === 0}>
        {tags.length > 0
          ? <span>{tags.length} {tags.length === 1 ? 'tag' : 'tags'}</span>
          : <span>No tags yet</span>}
      </InputFoot>
    </div>
  )
}

/**
 * The one skin that does not emit every keystroke: the draft is the skin's own
 * state and only a submitted line becomes the value a wire reads.
 */
function CommandSkin({
  data,
  skin,
  patch,
  state,
  setState,
}: SkinProps & {
  state: WidgetSkinState
  setState: (next: WidgetSkinState, value?: string) => void
}) {
  const draft = textInputDraft(state.draft)
  const history = textInputHistory(state.history)

  const run = (line: string) => {
    const entry = line.trim()
    if (!entry) return
    setState({ ...state, draft: '', history: withCommandRun(history, entry) }, entry)
  }

  return (
    <div className="gp-input gp-input--command">
      <InputHead data={data} patch={patch} />
      <div className="gp-input-prompt gp-bare-field">
        <ChevronRight className="gp-input-lead" size={14} aria-hidden />
        <input
          value={draft}
          spellCheck={false}
          aria-label={data.label || 'Command'}
          placeholder={textInputPlaceholder(skin, data.placeholder)}
          onChange={(event) => setState({ ...state, draft: event.target.value })}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') run(draft)
            // Up recalls the last line, the way a shell does.
            if (event.key === 'ArrowUp' && history[0] && !draft) {
              event.preventDefault()
              setState({ ...state, draft: history[0] })
            }
          }}
        />
        <button
          type="button"
          className="gp-input-run"
          disabled={!draft.trim()}
          aria-label="Run this command"
          title="Run — or press Enter"
          onClick={() => run(draft)}
        >
          <CornerDownLeft size={12} aria-hidden />
        </button>
      </div>

      {history.length > 0 ? (
        <ol className="gp-input-history" aria-label="Recent commands">
          {history.map((entry) => (
            <li key={entry} data-current={entry === data.value.trim() || undefined}>
              <button
                type="button"
                title={`Run ${entry} again`}
                aria-label={`Run ${entry} again`}
                onClick={() => run(entry)}
              >
                <RotateCcw size={10} aria-hidden />
                <span>{entry}</span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="gp-input-empty">
          Nothing has been run yet. Press Enter and the line becomes this card&rsquo;s value.
        </p>
      )}

      <InputFoot empty={!data.value.trim()}>
        <span>Emitting</span>
        {data.value.trim()
          ? <code title={data.value.trim()}>{data.value.trim()}</code>
          : <em>nothing until you run a line</em>}
      </InputFoot>
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * One text source, seven ways to ask for it. Whichever skin is worn the card
 * emits the same single string, and every skin keeps that string on screen —
 * this is a wiring card before it is a form field.
 */
export function TextInputWidget({ data, onChange, skin = 'single_line' }: TextInputWidgetProps) {
  // `multiline` predates skins and is the shape the old Wrap/Single button
  // wrote. The skin owns the shape now, so the boolean is kept in step rather
  // than left to disagree with what is on screen.
  const patch = (next: Partial<TextInputData>) =>
    onChange({ ...data, ...next, skin, multiline: isMultilineSkin(skin) })

  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState, value = data.value) => {
    onChange(
      dataWithSkinState(
        { ...data, skin, value, multiline: isMultilineSkin(skin) } as ModuleData,
        skin,
        next,
      ) as TextInputData,
    )
  }

  const props: SkinProps = { data, skin, patch }
  if (skin === 'multiline') return <MultilineSkin {...props} />
  if (skin === 'search') return <SearchSkin {...props} />
  if (skin === 'url') return <UrlSkin {...props} />
  if (skin === 'email') return <EmailSkin {...props} />
  if (skin === 'tags') return <TagsSkin {...props} />
  if (skin === 'command') return <CommandSkin {...props} state={state} setState={setState} />
  return <SingleLineSkin {...props} />
}
