import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Maximize2,
  Minimize2,
  Music4,
  Pause,
  Play,
  Plus,
  Rows3,
  Sparkles,
  Trash2,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type { MediaData, ModuleData } from '../../../types/spatial'
import { PointerDragSession } from '../../../utils/pointerDrag'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import {
  clampMoodboardPlacement,
  clampPercent,
  externalPlayerName,
  formatPlaybackTime,
  mediaExtension,
  mediaFileName,
  mediaFit,
  mediaGalleryItems,
  mediaHost,
  mediaKind,
  moodboardItems,
  safeLinkUrl,
  safeMediaUrl,
  MEDIA_ITEM_LIMIT,
  type MediaFit,
  type MediaGalleryItem,
  type MediaSkinMode,
  type MoodboardItem,
} from './mediaSkinModel'

interface MediaWidgetProps {
  data: MediaData
  onChange: (data: MediaData) => void
  skin?: MediaSkinMode
}

/**
 * A large pasted image is kept out of the synced board JSON, so the address a
 * skin actually renders may be an object URL minted here rather than the
 * stored one. Revoking on change is what keeps a board that swaps pictures all
 * afternoon from leaking every one of them.
 */
function useResolvedSource(localBlobKey: string | undefined): string {
  const [localUrl, setLocalUrl] = useState('')
  useEffect(() => {
    if (!localBlobKey) {
      setLocalUrl('')
      return
    }
    let objectUrl = ''
    let cancelled = false
    void import('../../../utils/boardDatabase')
      .then(({ readMediaBlob }) => readMediaBlob(localBlobKey))
      .then((blob) => {
        if (!blob || cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setLocalUrl(objectUrl)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [localBlobKey])
  return localUrl
}

/* ------------------------------------------------------------------ shared */

function StageFrame({
  children,
  bleed = true,
  className = '',
}: {
  children: ReactNode
  bleed?: boolean
  className?: string
}) {
  return (
    <div className={`gp-media-stage ${bleed ? 'gp-media-stage--bleed' : ''} ${className}`}>
      {children}
    </div>
  )
}

function StageTools({ children }: { children: ReactNode }) {
  return <span className="gp-media-tools">{children}</span>
}

/**
 * An empty media card asks for the address in place. Hiding the only field
 * that can fill the card behind a tool button made the blank state a dead end.
 */
function EmptyStage({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon
  title: string
  hint: string
  children?: ReactNode
}) {
  return (
    <div className="gp-media-empty">
      <Icon size={26} aria-hidden strokeWidth={1.4} />
      <strong>{title}</strong>
      <span>{hint}</span>
      {children && <div className="gp-media-empty-action">{children}</div>}
    </div>
  )
}

/** One address field, styled as a quiet line rather than a boxed control. */
function UrlField({
  value,
  onChange,
  label,
  placeholder,
  onSubmit,
}: {
  value: string
  onChange: (value: string) => void
  label: string
  placeholder: string
  onSubmit?: () => void
}) {
  return (
    <div className="gp-media-url gp-bare-field">
      <Link2 size={11} aria-hidden />
      <input
        value={value}
        aria-label={label}
        placeholder={placeholder}
        spellCheck={false}
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onSubmit) onSubmit()
        }}
      />
    </div>
  )
}

function CaptionBar({
  value,
  onChange,
  placeholder = 'Add a caption…',
  overlay = false,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  overlay?: boolean
}) {
  return (
    <div
      className={`gp-media-caption gp-bare-field ${overlay ? 'gp-media-caption--overlay' : ''}`}
      data-filled={value.trim() ? 'true' : undefined}
    >
      <input
        value={value}
        aria-label="Caption"
        placeholder={placeholder}
        data-floor-overflow="scroll"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** The address and alt-text controls, folded away until asked for. */
function SourcePanel({
  open,
  onToggle,
  url,
  onUrl,
  altText,
  onAltText,
  urlLabel,
  urlPlaceholder,
  children,
}: {
  open: boolean
  onToggle: () => void
  url: string
  onUrl: (value: string) => void
  altText?: string
  onAltText?: (value: string) => void
  urlLabel: string
  urlPlaceholder: string
  children?: ReactNode
}) {
  return (
    <>
      <button
        type="button"
        className="gp-media-tool"
        aria-label={open ? 'Hide media source' : 'Edit media source'}
        aria-expanded={open}
        title="Media source"
        onClick={onToggle}
      >
        <Link2 size={12} aria-hidden />
      </button>
      {open && (
        <div className="gp-media-source">
          <UrlField value={url} onChange={onUrl} label={urlLabel} placeholder={urlPlaceholder} />
          {onAltText && (
            <div className="gp-media-url gp-bare-field">
              <Sparkles size={11} aria-hidden />
              <input
                value={altText ?? ''}
                aria-label="Describe this media for screen readers"
                placeholder="Describe it for screen readers…"
                data-floor-overflow="scroll"
                onChange={(event) => onAltText(event.target.value)}
              />
            </div>
          )}
          {children}
        </div>
      )}
    </>
  )
}

/* ------------------------------------------------------------------- skins */

function ImageSkin({
  source,
  data,
  patch,
  fit,
  setFit,
}: {
  source: string
  data: MediaData
  patch: (next: Partial<MediaData>) => void
  fit: MediaFit
  setFit: (fit: MediaFit) => void
}) {
  const [failed, setFailed] = useState(false)
  const [sourceOpen, setSourceOpen] = useState(false)
  const showImage = Boolean(source) && !failed

  return (
    <div className="gp-media gp-media-image">
      <StageFrame>
        {showImage ? (
          <img
            src={source}
            alt={data.altText || data.caption || 'Image'}
            loading="lazy"
            draggable={false}
            onError={() => setFailed(true)}
            className="gp-media-picture"
            style={{ objectFit: fit }}
          />
        ) : (
          <EmptyStage
            icon={ImageIcon}
            title={failed ? 'That image would not load' : 'No picture yet'}
            hint={failed ? 'Check the address' : 'Paste an image address to begin'}
          >
            <UrlField
              value={data.url}
              onChange={(url) => {
                setFailed(false)
                patch({ url })
              }}
              label="Image address"
              placeholder="https://…"
            />
          </EmptyStage>
        )}

        <StageTools>
          {showImage && (
            <button
              type="button"
              className="gp-media-tool"
              aria-label={fit === 'cover' ? 'Fit the whole picture' : 'Fill the card'}
              aria-pressed={fit === 'contain'}
              title={fit === 'cover' ? 'Fit whole picture' : 'Fill card'}
              onClick={() => setFit(fit === 'cover' ? 'contain' : 'cover')}
            >
              {fit === 'cover' ? <Minimize2 size={12} aria-hidden /> : <Maximize2 size={12} aria-hidden />}
            </button>
          )}
          <SourcePanel
            open={sourceOpen}
            onToggle={() => setSourceOpen((value) => !value)}
            url={data.url}
            onUrl={(url) => {
              setFailed(false)
              patch({ url })
            }}
            altText={data.altText}
            onAltText={(altText) => patch({ altText })}
            urlLabel="Image address"
            urlPlaceholder="https://…"
          />
        </StageTools>

        <CaptionBar overlay value={data.caption} onChange={(caption) => patch({ caption })} />
      </StageFrame>
    </div>
  )
}

function VideoSkin({
  source,
  data,
  patch,
  state,
  setState,
}: {
  source: string
  data: MediaData
  patch: (next: Partial<MediaData>) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const poster = safeMediaUrl(state.poster)
  const external = externalPlayerName(data.url)
  const link = safeLinkUrl(data.url)
  const playable = Boolean(source) && !external && !failed && mediaKind(source) !== 'document'

  useEffect(() => setFailed(false), [source])

  return (
    <div className="gp-media gp-media-video">
      <StageFrame>
        {playable ? (
          <video
            key={source}
            src={source}
            poster={poster || undefined}
            controls
            playsInline
            preload="metadata"
            onError={() => setFailed(true)}
            aria-label={data.altText || data.caption || 'Video'}
            className="gp-media-picture"
          />
        ) : external && link ? (
          <div className="gp-media-external">
            <Video size={26} aria-hidden strokeWidth={1.4} />
            <strong>{external}</strong>
            <span>{mediaFileName(data.url) || mediaHost(data.url)}</span>
            <a href={link} target="_blank" rel="noreferrer noopener" className="gp-media-open">
              <ExternalLink size={11} aria-hidden />
              Watch on {external}
            </a>
          </div>
        ) : (
          <EmptyStage
            icon={Video}
            title={failed ? 'That clip would not play' : 'No video yet'}
            hint={failed ? 'Check the address, or link out to its host' : 'Paste a direct .mp4 or .webm address'}
          >
            <UrlField
              value={data.url}
              onChange={(url) => patch({ url })}
              label="Video address"
              placeholder="https://….mp4"
            />
          </EmptyStage>
        )}

        <StageTools>
          <SourcePanel
            open={sourceOpen}
            onToggle={() => setSourceOpen((value) => !value)}
            url={data.url}
            onUrl={(url) => patch({ url })}
            altText={data.altText}
            onAltText={(altText) => patch({ altText })}
            urlLabel="Video address"
            urlPlaceholder="https://….mp4"
          >
            <UrlField
              value={typeof state.poster === 'string' ? state.poster : ''}
              onChange={(value) => setState({ ...state, poster: value })}
              label="Poster image address"
              placeholder="Poster image (optional)…"
            />
          </SourcePanel>
        </StageTools>
      </StageFrame>

      {/* A player owns the bottom of its own frame. The caption sits below the
          stage rather than over it, so it never fights the transport bar. */}
      <CaptionBar value={data.caption} onChange={(caption) => patch({ caption })} />
    </div>
  )
}

function AudioSkin({
  source,
  data,
  patch,
}: {
  source: string
  data: MediaData
  patch: (next: Partial<MediaData>) => void
}) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const [sourceOpen, setSourceOpen] = useState(false)
  const external = externalPlayerName(data.url)
  const link = safeLinkUrl(data.url)
  const playable = Boolean(source) && !external

  // A new address is a new recording: never keep the old one's clock.
  useEffect(() => {
    setPlaying(false)
    setElapsed(0)
    setDuration(0)
  }, [source])

  const toggle = () => {
    const element = audioRef.current
    if (!element) return
    if (element.paused) void element.play().catch(() => setPlaying(false))
    else element.pause()
  }

  const seek = (seconds: number) => {
    const element = audioRef.current
    if (!element || !Number.isFinite(seconds)) return
    element.currentTime = seconds
    setElapsed(seconds)
  }

  const fileName = mediaFileName(data.url)
  const progress = duration > 0 ? (elapsed / duration) * 100 : 0

  return (
    <div className="gp-media gp-media-audio">
      <div className="gp-media-record" style={{ '--gp-media-progress': `${progress}%` } as never}>
        <span aria-hidden className="gp-media-disc" data-spinning={playing || undefined}>
          <Music4 size={16} strokeWidth={1.6} />
        </span>

        {/* The track title IS the caption — a recording named twice on one
            card is just the same words in two type sizes. */}
        <div className="gp-media-record-body gp-bare-field">
          <input
            value={data.caption}
            aria-label="Recording title"
            placeholder={fileName || 'Name this recording…'}
            data-floor-overflow="scroll"
            onChange={(event) => patch({ caption: event.target.value })}
            className="gp-media-track"
          />
          <span className="gp-media-track-meta">
            {external || mediaHost(data.url) || 'Local file'}
            {mediaExtension(data.url) && ` · ${mediaExtension(data.url)}`}
          </span>
        </div>

        <StageTools>
          <SourcePanel
            open={sourceOpen}
            onToggle={() => setSourceOpen((value) => !value)}
            url={data.url}
            onUrl={(url) => patch({ url })}
            urlLabel="Audio address"
            urlPlaceholder="https://….mp3"
          />
        </StageTools>
      </div>

      {playable ? (
        <div className="gp-media-transport">
          <button
            type="button"
            className="gp-media-play"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={toggle}
          >
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
          </button>

          <div className="gp-media-scrub gp-bare-field">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.1)}
              step={0.1}
              value={Math.min(elapsed, duration || 0.1)}
              aria-label="Playback position"
              aria-valuetext={`${formatPlaybackTime(elapsed)} of ${formatPlaybackTime(duration)}`}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span aria-hidden className="gp-media-scrub-track">
              <span style={{ width: `${progress}%` }} />
            </span>
          </div>

          <span className="gp-media-clock">
            {formatPlaybackTime(elapsed)} <i>/</i> {formatPlaybackTime(duration)}
          </span>

          <audio
            ref={audioRef}
            src={source}
            preload="metadata"
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          />
        </div>
      ) : external && link ? (
        <a href={link} target="_blank" rel="noreferrer noopener" className="gp-media-open">
          <ExternalLink size={11} aria-hidden />
          Listen on {external}
        </a>
      ) : (
        <div className="gp-media-prompt">
          <p className="gp-media-note">Paste a direct .mp3, .wav, or .m4a address to play it here.</p>
          <UrlField
            value={data.url}
            onChange={(url) => patch({ url })}
            label="Audio address"
            placeholder="https://….mp3"
          />
        </div>
      )}
    </div>
  )
}

const DOCUMENT_TINTS: Record<string, string> = {
  PDF: '#f87171',
  DOC: '#60a5fa',
  DOCX: '#60a5fa',
  XLS: '#34d399',
  XLSX: '#34d399',
  CSV: '#34d399',
  PPT: '#fb923c',
  PPTX: '#fb923c',
  ZIP: '#a78bfa',
  TXT: '#94a3b8',
  MD: '#94a3b8',
}

function DocumentSkin({
  data,
  patch,
}: {
  data: MediaData
  patch: (next: Partial<MediaData>) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const extension = mediaExtension(data.url)
  const link = safeLinkUrl(data.url)
  const name = mediaFileName(data.url)
  const tint = DOCUMENT_TINTS[extension] ?? 'var(--gp-widget-accent)'

  return (
    <div className="gp-media gp-media-document" style={{ '--gp-media-doc': tint } as never}>
      <div className="gp-media-doc-row">
        <span aria-hidden className="gp-media-doc-page">
          <i />
          <i />
          <i />
          <strong>{extension || <FileText size={14} strokeWidth={1.6} />}</strong>
        </span>

        <div className="gp-media-doc-body">
          <strong title={name || undefined}>{name || 'No document linked'}</strong>
          <span>{mediaHost(data.url) || 'Paste a file address to describe it'}</span>
          {link && (
            <a href={link} target="_blank" rel="noreferrer noopener" className="gp-media-open">
              <ExternalLink size={11} aria-hidden />
              Open document
            </a>
          )}
        </div>

        <StageTools>
          <SourcePanel
            open={sourceOpen}
            onToggle={() => setSourceOpen((value) => !value)}
            url={data.url}
            onUrl={(url) => patch({ url })}
            urlLabel="Document address"
            urlPlaceholder="https://….pdf"
          />
        </StageTools>
      </div>

      {link ? (
        <CaptionBar
          value={data.caption}
          placeholder="What is this document for?"
          onChange={(caption) => patch({ caption })}
        />
      ) : (
        <div className="gp-media-prompt">
          <UrlField
            value={data.url}
            onChange={(url) => patch({ url })}
            label="Document address"
            placeholder="https://….pdf"
          />
        </div>
      )}
    </div>
  )
}

function BeforeAfterSkin({
  source,
  data,
  patch,
  state,
  setState,
}: {
  source: string
  data: MediaData
  patch: (next: Partial<MediaData>) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}) {
  const [sourceOpen, setSourceOpen] = useState(false)
  const reveal = clampPercent(state.reveal, 50)
  const beforeRaw = typeof state.beforeUrl === 'string' ? state.beforeUrl : ''
  const before = safeMediaUrl(beforeRaw)
  const after = source
  const ready = Boolean(before && after)

  return (
    <div className="gp-media gp-media-compare">
      <StageFrame>
        {ready ? (
          <div
            className="gp-media-compare-stage gp-bare-field"
            style={{ '--gp-media-reveal': `${reveal}%` } as never}
          >
            <img
              src={after}
              alt={data.altText ? `After: ${data.altText}` : 'After'}
              draggable={false}
              className="gp-media-picture"
            />
            <span aria-hidden className="gp-media-compare-before">
              <img src={before} alt="" draggable={false} className="gp-media-picture" />
            </span>
            <span aria-hidden className="gp-media-compare-handle" />
            {/* Both tags ride the bottom rail: the top-right corner already
                belongs to the card's own tool cluster. */}
            <span aria-hidden className="gp-media-compare-tags">
              <span className="gp-media-compare-tag">Before</span>
              <span className="gp-media-compare-tag">After</span>
            </span>
            {/* The range input IS the divider: pointer drag and arrow keys come
                from the platform, so the comparison is keyboard-operable. */}
            <input
              type="range"
              min={0}
              max={100}
              value={reveal}
              aria-label="Reveal the before image"
              aria-valuetext={`${reveal}% before`}
              data-widget-interactive="true"
              onChange={(event) => setState({ ...state, reveal: clampPercent(event.target.value) })}
              className="gp-media-compare-input"
            />
          </div>
        ) : (
          <EmptyStage
            icon={Rows3}
            title="Two pictures make a comparison"
            hint={after ? 'Add the “before” address' : 'Add both addresses to compare them'}
          >
            <UrlField
              value={beforeRaw}
              onChange={(value) => setState({ ...state, beforeUrl: value })}
              label="Before image address"
              placeholder="Before: https://…"
            />
            <UrlField
              value={data.url}
              onChange={(url) => patch({ url })}
              label="After image address"
              placeholder="After: https://…"
            />
          </EmptyStage>
        )}

        <StageTools>
          <SourcePanel
            open={sourceOpen}
            onToggle={() => setSourceOpen((value) => !value)}
            url={data.url}
            onUrl={(url) => patch({ url })}
            altText={data.altText}
            onAltText={(altText) => patch({ altText })}
            urlLabel="After image address"
            urlPlaceholder="After: https://…"
          >
            <UrlField
              value={beforeRaw}
              onChange={(value) => setState({ ...state, beforeUrl: value })}
              label="Before image address"
              placeholder="Before: https://…"
            />
          </SourcePanel>
        </StageTools>

        <CaptionBar overlay value={data.caption} onChange={(caption) => patch({ caption })} />
      </StageFrame>
    </div>
  )
}

function useItemDraft(): [string, (value: string) => void, () => void] {
  const [draft, setDraft] = useState('')
  return [draft, setDraft, () => setDraft('')]
}

function GallerySkin({
  data,
  patch,
  state,
  setState,
}: {
  data: MediaData
  patch: (next: Partial<MediaData>) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}) {
  const items = mediaGalleryItems(state.items)
  const [draft, setDraft, clearDraft] = useItemDraft()
  const activeId = typeof state.activeId === 'string' ? state.activeId : ''
  const active = items.find((item) => item.id === activeId) ?? items[0]
  const index = active ? items.findIndex((item) => item.id === active.id) : -1

  const commit = (nextItems: MediaGalleryItem[], nextActive?: string) => {
    setState({
      ...state,
      items: nextItems,
      activeId: nextActive ?? (nextItems.some((item) => item.id === active?.id) ? active?.id : nextItems[0]?.id) ?? '',
    })
  }

  const add = () => {
    if (!draft.trim() || items.length >= MEDIA_ITEM_LIMIT) return
    const item: MediaGalleryItem = { id: crypto.randomUUID(), url: draft.trim(), caption: '' }
    commit([...items, item], item.id)
    clearDraft()
  }

  return (
    <div className="gp-media gp-media-gallery">
      <StageFrame>
        {active && safeMediaUrl(active.url) ? (
          <img
            src={safeMediaUrl(active.url)}
            alt={active.caption || `Gallery image ${index + 1}`}
            draggable={false}
            className="gp-media-picture"
          />
        ) : (
          <EmptyStage
            icon={ImageIcon}
            title={items.length ? 'That image would not load' : 'An empty gallery'}
            hint="Add image addresses below to fill it"
          />
        )}

        {items.length > 0 && (
          <span aria-hidden className="gp-media-count">
            {index + 1} / {items.length}
          </span>
        )}

        {active && (
          <CaptionBar
            overlay
            value={active.caption}
            placeholder="Caption this picture…"
            onChange={(caption) => commit(items.map((item) => (
              item.id === active.id ? { ...item, caption } : item
            )))}
          />
        )}
      </StageFrame>

      <div className="gp-media-rail" role="list" aria-label="Gallery images">
        {items.map((item, position) => (
          <span key={item.id} role="listitem" className="gp-media-thumb">
            <button
              type="button"
              aria-label={item.caption || `Show image ${position + 1}`}
              aria-pressed={item.id === active?.id}
              onClick={() => setState({ ...state, items, activeId: item.id })}
            >
              {safeMediaUrl(item.url)
                ? <img src={safeMediaUrl(item.url)} alt="" draggable={false} />
                : <ImageIcon size={12} aria-hidden />}
            </button>
            <button
              type="button"
              className="gp-media-thumb-remove"
              aria-label={`Remove image ${position + 1}`}
              onClick={() => commit(items.filter((entry) => entry.id !== item.id))}
            >
              <Trash2 size={9} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="gp-media-add">
        <UrlField
          value={draft}
          onChange={setDraft}
          onSubmit={add}
          label="New gallery image address"
          placeholder={items.length >= MEDIA_ITEM_LIMIT ? 'Gallery is full' : 'Add an image address…'}
        />
        <button type="button" aria-label="Add to gallery" disabled={!draft.trim()} onClick={add}>
          <Plus size={12} aria-hidden />
          Add
        </button>
      </div>

      <CaptionBar
        value={data.caption}
        placeholder="Name this gallery…"
        onChange={(caption) => patch({ caption })}
      />
    </div>
  )
}

function MoodboardSkin({
  data,
  patch,
  state,
  setState,
}: {
  data: MediaData
  patch: (next: Partial<MediaData>) => void
  state: WidgetSkinState
  setState: (next: WidgetSkinState) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ session: PointerDragSession; id: string; x: number; y: number } | null>(null)
  const [draft, setDraft, clearDraft] = useItemDraft()
  const items = moodboardItems(state.items)

  const commit = useCallback((nextItems: MoodboardItem[]) => {
    setState({ ...state, items: nextItems })
  }, [setState, state])

  const add = () => {
    if (!draft.trim() || items.length >= MEDIA_ITEM_LIMIT) return
    // New tiles land on a loose diagonal instead of stacking on one spot.
    const position = items.length
    commit([...items, {
      id: crypto.randomUUID(),
      url: draft.trim(),
      caption: '',
      x: 0.24 + ((position * 0.23) % 0.54),
      y: 0.26 + ((position * 0.17) % 0.48),
      scale: 0.34,
    }])
    clearDraft()
  }

  const onTilePointerDown = (event: ReactPointerEvent<HTMLElement>, item: MoodboardItem) => {
    if (event.button !== 0) return
    const board = boardRef.current
    if (!board) return
    event.stopPropagation()
    const rect = board.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const target = event.currentTarget
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // An untrusted pointer id (synthetic events in tests) cannot be captured.
    }
    dragRef.current = {
      id: item.id,
      x: item.x,
      y: item.y,
      session: new PointerDragSession(event, {
        onDelta: (dx, dy) => {
          const current = dragRef.current
          if (!current) return
          const next = clampMoodboardPlacement(
            current.x + dx / rect.width,
            current.y + dy / rect.height,
            item.scale,
          )
          current.x = next.x
          current.y = next.y
          commit(moodboardItems(state.items).map((entry) => (
            entry.id === current.id ? { ...entry, x: next.x, y: next.y } : entry
          )))
        },
      }),
    }
  }

  const onTilePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    dragRef.current?.session.move(event)
  }

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const current = dragRef.current
    if (!current) return
    current.session.end()
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Already released with the pointer itself.
    }
  }

  return (
    <div className="gp-media gp-media-moodboard">
      <div ref={boardRef} className="gp-media-board">
        {items.length === 0 && (
          <EmptyStage
            icon={Sparkles}
            title="An empty moodboard"
            hint="Add pictures, then drag them where they belong"
          />
        )}
        {items.map((item, position) => {
          const url = safeMediaUrl(item.url)
          return (
            <figure
              key={item.id}
              className="gp-media-tile"
              data-widget-interactive="true"
              style={{
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                width: `${item.scale * 100}%`,
                // A gentle, stable tilt per slot — pinned photos are never square.
                '--gp-media-tilt': `${((position % 5) - 2) * 1.6}deg`,
              } as never}
              onPointerDown={(event) => onTilePointerDown(event, item)}
              onPointerMove={onTilePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {url
                ? <img src={url} alt={item.caption || `Moodboard picture ${position + 1}`} draggable={false} />
                : <span className="gp-media-tile-blank"><ImageIcon size={14} aria-hidden /></span>}
              <figcaption className="gp-bare-field">
                <input
                  value={item.caption}
                  aria-label={`Note for picture ${position + 1}`}
                  placeholder="Note…"
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) => commit(items.map((entry) => (
                    entry.id === item.id ? { ...entry, caption: event.target.value } : entry
                  )))}
                />
              </figcaption>
              <button
                type="button"
                className="gp-media-tile-remove"
                aria-label={`Remove picture ${position + 1}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => commit(items.filter((entry) => entry.id !== item.id))}
              >
                <Trash2 size={9} aria-hidden />
              </button>
            </figure>
          )
        })}
      </div>

      <div className="gp-media-add">
        <UrlField
          value={draft}
          onChange={setDraft}
          onSubmit={add}
          label="New moodboard image address"
          placeholder={items.length >= MEDIA_ITEM_LIMIT ? 'Moodboard is full' : 'Add an image address…'}
        />
        <button type="button" aria-label="Add to moodboard" disabled={!draft.trim()} onClick={add}>
          <Plus size={12} aria-hidden />
          Pin
        </button>
      </div>

      <CaptionBar
        value={data.caption}
        placeholder="Name this moodboard…"
        onChange={(caption) => patch({ caption })}
      />
    </div>
  )
}

/* -------------------------------------------------------------------- root */

/**
 * One media card, seven ways to show what it holds. Every skin paints straight
 * onto the card's own backplate: the picture IS the card, so there is never a
 * second pane of glass between the two.
 */
export function MediaWidget({ data, onChange, skin = 'image' }: MediaWidgetProps) {
  const localUrl = useResolvedSource(data.localBlobKey)
  const source = safeMediaUrl(localUrl || data.url)

  const patch = (next: Partial<MediaData>) => onChange({ ...data, ...next, skin })

  const state = skinStateFor(data, skin)
  const setState = (next: WidgetSkinState) => {
    onChange(dataWithSkinState({ ...data, skin } as ModuleData, skin, next) as MediaData)
  }

  if (skin === 'video') {
    return <VideoSkin source={source} data={data} patch={patch} state={state} setState={setState} />
  }
  if (skin === 'audio') {
    return <AudioSkin source={source} data={data} patch={patch} />
  }
  if (skin === 'document_preview') {
    return <DocumentSkin data={data} patch={patch} />
  }
  if (skin === 'before_after') {
    return <BeforeAfterSkin source={source} data={data} patch={patch} state={state} setState={setState} />
  }
  if (skin === 'gallery') {
    return <GallerySkin data={data} patch={patch} state={state} setState={setState} />
  }
  if (skin === 'moodboard') {
    return <MoodboardSkin data={data} patch={patch} state={state} setState={setState} />
  }
  return (
    <ImageSkin
      source={source}
      data={data}
      patch={patch}
      fit={mediaFit(state.fit)}
      setFit={(fit) => setState({ ...state, fit })}
    />
  )
}
