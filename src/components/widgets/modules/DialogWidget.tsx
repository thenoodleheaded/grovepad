import {
  AudioLines,
  Clapperboard,
  Clock3,
  Drama,
  Languages,
  MessageCircle,
  Mic2,
  PanelsTopLeft,
  Plus,
  Sparkles,
  UsersRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import type { DialogData, DialogLine, ModuleData } from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  dialogDetail,
  dialogSkinMode,
  dialogSpeaker,
  dialogSpeakers,
  transcriptTimecode,
  withDialogDetail,
  withoutDialogLine,
  type DialogDetailField,
  type DialogSkinMode,
} from './dialogSkinModel'

interface DialogWidgetProps {
  data: DialogData
  onChange: (data: DialogData) => void
  skin?: DialogSkinMode
}

interface SkinProps {
  data: DialogData
  state: WidgetSkinState
  speakers: string[]
  setLine: (id: string, patch: Partial<Omit<DialogLine, 'id'>>) => void
  setDetail: (field: DialogDetailField, id: string, value: string) => void
  setState: (next: WidgetSkinState) => void
  removeLine: (id: string) => void
  addLine: (afterId?: string) => void
}

const SKIN_META: Record<
  DialogSkinMode,
  { label: string; subline: string; icon: LucideIcon; addLabel: string }
> = {
  screenplay: {
    label: 'Screenplay',
    subline: 'Scene in progress',
    icon: Clapperboard,
    addLabel: 'Add beat',
  },
  chat: {
    label: 'Conversation',
    subline: 'Message thread',
    icon: MessageCircle,
    addLabel: 'Add message',
  },
  interview: {
    label: 'Interview',
    subline: 'Question & answer',
    icon: Mic2,
    addLabel: 'Add exchange',
  },
  roleplay: {
    label: 'Roleplay',
    subline: 'Rehearsal room',
    icon: Drama,
    addLabel: 'Add turn',
  },
  comic: {
    label: 'Comic',
    subline: 'Panel board',
    icon: PanelsTopLeft,
    addLabel: 'Add panel',
  },
  localization: {
    label: 'Localization',
    subline: 'Parallel script',
    icon: Languages,
    addLabel: 'Add source line',
  },
  audio_transcript: {
    label: 'Transcript',
    subline: 'Timed dialogue',
    icon: AudioLines,
    addLabel: 'Add segment',
  },
}

const speakerInitials = (speaker: string): string =>
  speaker
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase() || '·'

function DialogHeader({
  skin,
  lines,
  speakers,
  children,
}: {
  skin: DialogSkinMode
  lines: number
  speakers: number
  children?: ReactNode
}) {
  const meta = SKIN_META[skin]
  const Icon = meta.icon
  return (
    <header className="gp-script-head">
      <span className="gp-script-glyph" aria-hidden><Icon size={14} /></span>
      <span className="gp-script-title">
        <strong>{meta.label}</strong>
        <small>{meta.subline}</small>
      </span>
      {children}
      <span className="gp-script-count" aria-label={`${lines} lines, ${speakers} speakers`}>
        <UsersRound size={11} aria-hidden />
        <span className="gp-script-speakers-count">{speakers}</span>
        <i aria-hidden>·</i>
        <span>{lines} {lines === 1 ? 'line' : 'lines'}</span>
      </span>
    </header>
  )
}

function RemoveLine({
  character,
  onClick,
}: {
  character: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="gp-script-remove"
      aria-label={`Remove ${dialogSpeaker({ character })} line`}
      title="Remove line"
      onClick={onClick}
    >
      <X size={12} aria-hidden />
    </button>
  )
}

function SpeakerField({
  line,
  onChange,
}: {
  line: DialogLine
  onChange: (character: string) => void
}) {
  return (
    <span className="gp-script-speaker gp-bare-field">
      <input
        value={line.character}
        aria-label="Character name"
        placeholder="CHARACTER"
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value.toLocaleUpperCase())}
      />
    </span>
  )
}

function CueField({
  line,
  placeholder = 'Write a line…',
  onChange,
  onAddAfter,
}: {
  line: DialogLine
  placeholder?: string
  onChange: (cue: string) => void
  onAddAfter: () => void
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return
    event.preventDefault()
    onAddAfter()
  }

  return (
    <span className="gp-script-cue gp-bare-field">
      <textarea
        rows={1}
        value={line.cue}
        aria-label={`Dialogue for ${dialogSpeaker(line)}`}
        placeholder={placeholder}
        data-floor-overflow="scroll"
        onKeyDown={onKeyDown}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  )
}

function DetailField({
  value,
  label,
  placeholder,
  multiline = false,
  onChange,
}: {
  value: string
  label: string
  placeholder: string
  multiline?: boolean
  onChange: (value: string) => void
}) {
  return (
    <span className="gp-script-detail gp-bare-field">
      {multiline ? (
        <textarea
          rows={1}
          value={value}
          aria-label={label}
          placeholder={placeholder}
          data-floor-overflow="scroll"
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          value={value}
          aria-label={label}
          placeholder={placeholder}
          data-floor-overflow="scroll"
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </span>
  )
}

function EmptyScript() {
  return (
    <div className="gp-script-empty">
      <Sparkles size={18} aria-hidden />
      <strong>Your scene is ready</strong>
      <span>Add the first voice to begin.</span>
    </div>
  )
}

function ScreenplaySkin(props: SkinProps) {
  return (
    <>
      <DialogHeader
        skin="screenplay"
        lines={props.data.lines.length}
        speakers={props.speakers.length}
      />
      <div className="gp-script-scroll gp-script-screenplay" aria-label="Screenplay lines">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line, index) => (
          <article className="gp-script-page-line" key={line.id}>
            <span className="gp-script-beat" aria-hidden>{String(index + 1).padStart(2, '0')}</span>
            <SpeakerField
              line={line}
              onChange={(character) => props.setLine(line.id, { character })}
            />
            <CueField
              line={line}
              onChange={(cue) => props.setLine(line.id, { cue })}
              onAddAfter={() => props.addLine(line.id)}
            />
            <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
          </article>
        ))}
      </div>
    </>
  )
}

function ChatSkin(props: SkinProps) {
  return (
    <>
      <DialogHeader skin="chat" lines={props.data.lines.length} speakers={props.speakers.length} />
      <div className="gp-script-scroll gp-script-chat" aria-label="Chat messages">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line) => {
          const speakerIndex = Math.max(
            0,
            props.speakers.indexOf(dialogSpeaker(line).toLocaleUpperCase()),
          )
          return (
            <article
              className="gp-script-message"
              data-side={speakerIndex % 2 === 0 ? 'near' : 'far'}
              key={line.id}
            >
              <span className="gp-script-avatar" data-speaker={speakerIndex % 4} aria-hidden>
                {speakerInitials(dialogSpeaker(line))}
              </span>
              <div className="gp-script-bubble">
                <SpeakerField
                  line={line}
                  onChange={(character) => props.setLine(line.id, { character })}
                />
                <CueField
                  line={line}
                  placeholder="Type a message…"
                  onChange={(cue) => props.setLine(line.id, { cue })}
                  onAddAfter={() => props.addLine(line.id)}
                />
                <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
              </div>
            </article>
          )
        })}
      </div>
    </>
  )
}

function InterviewSkin(props: SkinProps) {
  return (
    <>
      <DialogHeader
        skin="interview"
        lines={props.data.lines.length}
        speakers={props.speakers.length}
      />
      <div className="gp-script-scroll gp-script-interview" aria-label="Interview transcript">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line, index) => {
          const speakerIndex = Math.max(
            0,
            props.speakers.indexOf(dialogSpeaker(line).toLocaleUpperCase()),
          )
          const mark = speakerIndex === 0 ? 'Q' : 'A'
          return (
            <article className="gp-script-exchange" data-mark={mark} key={line.id}>
              <span className="gp-script-qa-mark" aria-label={mark === 'Q' ? 'Question' : 'Answer'}>
                {mark}
              </span>
              <div className="gp-script-exchange-copy">
                <SpeakerField
                  line={line}
                  onChange={(character) => props.setLine(line.id, { character })}
                />
                <CueField
                  line={line}
                  placeholder={mark === 'Q' ? 'Ask a question…' : 'Record the answer…'}
                  onChange={(cue) => props.setLine(line.id, { cue })}
                  onAddAfter={() => props.addLine(line.id)}
                />
              </div>
              <span className="gp-script-sequence" aria-hidden>{index + 1}</span>
              <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
            </article>
          )
        })}
      </div>
    </>
  )
}

function RoleplaySkin(props: SkinProps) {
  return (
    <>
      <DialogHeader
        skin="roleplay"
        lines={props.data.lines.length}
        speakers={props.speakers.length}
      />
      <div className="gp-script-scroll gp-script-roleplay" aria-label="Roleplay turns">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line, index) => (
          <article className="gp-script-turn" key={line.id}>
            <span className="gp-script-turn-index" aria-hidden>{index + 1}</span>
            <div className="gp-script-turn-copy">
              <SpeakerField
                line={line}
                onChange={(character) => props.setLine(line.id, { character })}
              />
              <CueField
                line={line}
                placeholder="What do they say?"
                onChange={(cue) => props.setLine(line.id, { cue })}
                onAddAfter={() => props.addLine(line.id)}
              />
              <span className="gp-script-direction-row">
                <Drama size={11} aria-hidden />
                <DetailField
                  value={dialogDetail(props.state, 'directions', line.id)}
                  label={`Performance direction for ${dialogSpeaker(line)}`}
                  placeholder="Performance note or intention…"
                  onChange={(value) => props.setDetail('directions', line.id, value)}
                />
              </span>
            </div>
            <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
          </article>
        ))}
      </div>
    </>
  )
}

function ComicSkin(props: SkinProps) {
  return (
    <>
      <DialogHeader skin="comic" lines={props.data.lines.length} speakers={props.speakers.length} />
      <div className="gp-script-scroll gp-script-comic" aria-label="Comic panels">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line, index) => (
          <article className="gp-script-panel" key={line.id}>
            <span className="gp-script-panel-number">Panel {String(index + 1).padStart(2, '0')}</span>
            <div className="gp-script-balloon">
              <CueField
                line={line}
                placeholder="Speech balloon…"
                onChange={(cue) => props.setLine(line.id, { cue })}
                onAddAfter={() => props.addLine(line.id)}
              />
            </div>
            <SpeakerField
              line={line}
              onChange={(character) => props.setLine(line.id, { character })}
            />
            <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
          </article>
        ))}
      </div>
    </>
  )
}

function LocalizationSkin(props: SkinProps) {
  const targetLanguage = typeof props.state.targetLanguage === 'string'
    ? props.state.targetLanguage.slice(0, 80)
    : ''
  return (
    <>
      <DialogHeader
        skin="localization"
        lines={props.data.lines.length}
        speakers={props.speakers.length}
      >
        <span className="gp-script-language gp-bare-field">
          <Languages size={11} aria-hidden />
          <input
            value={targetLanguage}
            aria-label="Target language"
            placeholder="Target language"
            onChange={(event) => props.setState({
              ...props.state,
              targetLanguage: event.target.value.slice(0, 80),
            })}
          />
        </span>
      </DialogHeader>
      <div className="gp-script-scroll gp-script-localization" aria-label="Localized script">
        <div className="gp-script-l10n-labels" aria-hidden>
          <span>Source</span>
          <span>{targetLanguage || 'Translation'}</span>
        </div>
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line) => (
          <article className="gp-script-l10n-row" key={line.id}>
            <div className="gp-script-l10n-cell">
              <SpeakerField
                line={line}
                onChange={(character) => props.setLine(line.id, { character })}
              />
              <CueField
                line={line}
                placeholder="Source dialogue…"
                onChange={(cue) => props.setLine(line.id, { cue })}
                onAddAfter={() => props.addLine(line.id)}
              />
            </div>
            <div className="gp-script-l10n-cell gp-script-l10n-cell--target">
              <span className="gp-script-target-speaker">{dialogSpeaker(line)}</span>
              <DetailField
                value={dialogDetail(props.state, 'translations', line.id)}
                label={`Translation for ${dialogSpeaker(line)}`}
                placeholder="Add translation…"
                multiline
                onChange={(value) => props.setDetail('translations', line.id, value)}
              />
            </div>
            <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
          </article>
        ))}
      </div>
    </>
  )
}

function AudioTranscriptSkin(props: SkinProps) {
  return (
    <>
      <DialogHeader
        skin="audio_transcript"
        lines={props.data.lines.length}
        speakers={props.speakers.length}
      >
        <span className="gp-script-live"><i aria-hidden /> ready</span>
      </DialogHeader>
      <div className="gp-script-scroll gp-script-transcript" aria-label="Audio transcript">
        {props.data.lines.length === 0 && <EmptyScript />}
        {props.data.lines.map((line, index) => {
          const stored = dialogDetail(props.state, 'timestamps', line.id)
          return (
            <article className="gp-script-segment" key={line.id}>
              <span className="gp-script-time gp-bare-field">
                <Clock3 size={10} aria-hidden />
                <input
                  value={transcriptTimecode(index, stored)}
                  aria-label={`Timestamp for ${dialogSpeaker(line)}`}
                  inputMode="numeric"
                  onChange={(event) => props.setDetail('timestamps', line.id, event.target.value)}
                />
              </span>
              <span className="gp-script-wave" aria-hidden>
                {Array.from({ length: 7 }, (_, waveIndex) => <i key={waveIndex} />)}
              </span>
              <div className="gp-script-segment-copy">
                <SpeakerField
                  line={line}
                  onChange={(character) => props.setLine(line.id, { character })}
                />
                <CueField
                  line={line}
                  placeholder="Transcribed speech…"
                  onChange={(cue) => props.setLine(line.id, { cue })}
                  onAddAfter={() => props.addLine(line.id)}
                />
              </div>
              <RemoveLine character={line.character} onClick={() => props.removeLine(line.id)} />
            </article>
          )
        })}
      </div>
    </>
  )
}

function makeLineId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `dialog-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function DialogWidget({ data, onChange, skin: rawSkin }: DialogWidgetProps) {
  const skin = dialogSkinMode(rawSkin ?? data.skin)
  const state = skinStateFor(data, skin)
  const speakers = dialogSpeakers(data.lines)

  const setLine = (id: string, patch: Partial<Omit<DialogLine, 'id'>>) =>
    onChange({
      ...data,
      lines: data.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    })

  const setState = (next: WidgetSkinState) =>
    onChange(dataWithSkinState(data as ModuleData, skin, next) as DialogData)

  const setDetail = (field: DialogDetailField, id: string, value: string) =>
    setState(withDialogDetail(state, field, id, value))

  const removeLine = (id: string) => onChange(withoutDialogLine(data, id))

  const addLine = (afterId?: string) => {
    const afterIndex = afterId ? data.lines.findIndex((line) => line.id === afterId) : -1
    const insertAt = afterIndex >= 0 ? afterIndex + 1 : data.lines.length
    const preceding = data.lines[Math.max(0, insertAt - 1)]
    const next: DialogLine = {
      id: makeLineId(),
      character: preceding?.character || 'CHARACTER',
      cue: '',
    }
    onChange({
      ...data,
      lines: [
        ...data.lines.slice(0, insertAt),
        next,
        ...data.lines.slice(insertAt),
      ],
    })
  }

  const props: SkinProps = {
    data,
    state,
    speakers,
    setLine,
    setDetail,
    setState,
    removeLine,
    addLine,
  }

  let body: ReactNode
  if (skin === 'chat') body = <ChatSkin {...props} />
  else if (skin === 'interview') body = <InterviewSkin {...props} />
  else if (skin === 'roleplay') body = <RoleplaySkin {...props} />
  else if (skin === 'comic') body = <ComicSkin {...props} />
  else if (skin === 'localization') body = <LocalizationSkin {...props} />
  else if (skin === 'audio_transcript') body = <AudioTranscriptSkin {...props} />
  else body = <ScreenplaySkin {...props} />

  return (
    <div className="gp-script" data-dialog-skin={skin}>
      {body}
      <footer className="gp-script-foot">
        <button type="button" className="gp-script-add" onClick={() => addLine()}>
          <Plus size={12} aria-hidden />
          {SKIN_META[skin].addLabel}
          <span>⌘↵</span>
        </button>
      </footer>
    </div>
  )
}
