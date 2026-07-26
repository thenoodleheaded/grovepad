import {
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileUp,
  Frame,
  Grid2X2,
  Grip,
  Image as ImageIcon,
  PenLine,
  Plus,
  Shapes,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import type {
  DrawingMode,
  ModuleData,
  SketchpadData,
} from '../../../types/spatial'
import {
  dataWithSkinState,
  skinStateFor,
  type WidgetSkinState,
} from '../../../utils/widgetSkins'
import { SketchpadWidget } from './SketchpadWidget'
import { ExcalidrawWidget } from './excalidraw/ExcalidrawWidget'
import {
  annotationState,
  drawingMode,
  safeDrawingReferenceUrl,
  storyboardState,
  type AnnotationState,
  type StoryboardState,
} from './drawingSkinModel'

interface DrawingWidgetProps {
  data: SketchpadData
  widgetId: string
  title: string
  onChange: (data: SketchpadData) => void
}

const EMPTY_DIAGRAM = {
  elements: [],
  appState: {},
  files: [],
  updatedAt: new Date(0).toISOString(),
} as const

const SURFACE_META: Record<
  Exclude<DrawingMode, 'storyboard' | 'annotation' | 'diagram'>,
  { eyebrow: string; title: string; note: string; icon: typeof PenLine }
> = {
  ink: {
    eyebrow: 'FAST CAPTURE',
    title: 'Quick Ink',
    note: 'Pressure-aware canvas',
    icon: PenLine,
  },
  whiteboard: {
    eyebrow: 'OPEN SPACE',
    title: 'Whiteboard',
    note: 'Clean, high-contrast thinking',
    icon: Sparkles,
  },
  graph_paper: {
    eyebrow: '5 MM GRID',
    title: 'Graph Paper',
    note: 'Precise spatial reasoning',
    icon: Grid2X2,
  },
  dot_grid: {
    eyebrow: 'QUIET GRID',
    title: 'Dot Grid',
    note: 'Structure without visual noise',
    icon: Grip,
  },
}

function DrawingHeader({
  icon: Icon,
  eyebrow,
  title,
  note,
  trailing,
}: {
  icon: typeof PenLine
  eyebrow: string
  title: string
  note: string
  trailing?: ReactNode
}) {
  return (
    <header className="gp-drawing-heading">
      <span className="gp-drawing-heading__icon" aria-hidden><Icon size={15} /></span>
      <span className="gp-drawing-heading__copy">
        <span className="gp-drawing-heading__eyebrow">{eyebrow}</span>
        <strong>{title}</strong>
      </span>
      <span className="gp-drawing-heading__note">{note}</span>
      {trailing}
    </header>
  )
}

function NativeSurface({
  mode,
  data,
  onChange,
}: {
  mode: keyof typeof SURFACE_META
  data: SketchpadData
  onChange: (data: SketchpadData) => void
}) {
  const meta = SURFACE_META[mode]
  return (
    <div className="gp-drawing-layout" data-drawing-mode={mode}>
      <DrawingHeader icon={meta.icon} eyebrow={meta.eyebrow} title={meta.title} note={meta.note} />
      <SketchpadWidget
        key={mode}
        data={data}
        surface={mode}
        ariaLabel={`${meta.title} drawing surface`}
        onChange={onChange}
      />
    </div>
  )
}

function withStoryboardState(
  data: SketchpadData,
  state: StoryboardState,
): SketchpadData {
  return dataWithSkinState(
    data as ModuleData,
    'storyboard',
    state as unknown as WidgetSkinState,
  ) as SketchpadData
}

function StoryboardView({
  data,
  onChange,
}: {
  data: SketchpadData
  onChange: (data: SketchpadData) => void
}) {
  const state = storyboardState(skinStateFor(data, 'storyboard'))
  const active = state.frames.find((frame) => frame.id === state.activeId) ?? state.frames[0]!
  const activeIndex = state.frames.findIndex((frame) => frame.id === active.id)

  const update = (next: StoryboardState) => onChange(withStoryboardState(data, next))
  const updateActive = (patch: Partial<typeof active>) => {
    update({
      ...state,
      frames: state.frames.map((frame) => frame.id === active.id ? { ...frame, ...patch } : frame),
    })
  }
  const addFrame = () => {
    if (state.frames.length >= 8) return
    const id = globalThis.crypto?.randomUUID?.() ?? `frame-${Date.now()}`
    update({
      activeId: id,
      frames: [...state.frames, { id, caption: '', shot: '', strokes: [] }],
    })
  }
  const removeFrame = () => {
    if (state.frames.length <= 1) return
    const frames = state.frames.filter((frame) => frame.id !== active.id)
    update({ activeId: frames[Math.max(0, activeIndex - 1)]!.id, frames })
  }
  const moveFrame = (direction: -1 | 1) => {
    const target = activeIndex + direction
    if (target < 0 || target >= state.frames.length) return
    const frames = [...state.frames]
    ;[frames[activeIndex], frames[target]] = [frames[target]!, frames[activeIndex]!]
    update({ ...state, frames })
  }

  return (
    <div className="gp-drawing-layout gp-storyboard" data-drawing-mode="storyboard">
      <DrawingHeader
        icon={Frame}
        eyebrow="SEQUENCE"
        title="Storyboard"
        note={`${activeIndex + 1} of ${state.frames.length}`}
        trailing={(
          <button
            type="button"
            className="gp-drawing-add gp-touch-target"
            onClick={addFrame}
            disabled={state.frames.length >= 8}
          >
            <Plus size={13} aria-hidden /> Frame
          </button>
        )}
      />
      <div className="gp-storyboard-strip" role="tablist" aria-label="Storyboard frames">
        {state.frames.map((frame, index) => (
          <button
            key={frame.id}
            type="button"
            role="tab"
            aria-selected={frame.id === active.id}
            onClick={() => update({ ...state, activeId: frame.id })}
            className="gp-storyboard-tab"
          >
            <span>{String(index + 1).padStart(2, '0')}</span>
            <strong>{frame.caption || 'Untitled frame'}</strong>
            <small>{frame.strokes.length > 0 ? `${frame.strokes.length} marks` : 'Empty'}</small>
          </button>
        ))}
      </div>
      <div className="gp-storyboard-stage">
        <SketchpadWidget
          key={active.id}
          data={{ ...data, strokes: active.strokes }}
          surface="storyboard"
          ariaLabel={`Storyboard frame ${activeIndex + 1}`}
          onChange={(next) => updateActive({ strokes: next.strokes ?? [] })}
        />
      </div>
      <footer className="gp-storyboard-caption">
        <span className="gp-storyboard-number">{String(activeIndex + 1).padStart(2, '0')}</span>
        <label>
          <span>Caption</span>
          <input
            aria-label="Frame caption"
            value={active.caption}
            onChange={(event) => updateActive({ caption: event.target.value })}
            placeholder="Describe the beat…"
          />
        </label>
        <label className="gp-storyboard-shot">
          <span>Shot</span>
          <input
            aria-label="Shot note"
            value={active.shot}
            onChange={(event) => updateActive({ shot: event.target.value })}
            placeholder="Wide / CU"
          />
        </label>
        <span className="gp-storyboard-actions">
          <button type="button" aria-label="Move frame left" disabled={activeIndex === 0} onClick={() => moveFrame(-1)}><ChevronLeft size={13} /></button>
          <button type="button" aria-label="Move frame right" disabled={activeIndex === state.frames.length - 1} onClick={() => moveFrame(1)}><ChevronRight size={13} /></button>
          <button type="button" aria-label="Delete frame" disabled={state.frames.length === 1} onClick={removeFrame}><Trash2 size={13} /></button>
        </span>
      </footer>
    </div>
  )
}

function useLocalAnnotationSource(key: string): string {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!key) {
      setUrl('')
      return
    }
    let objectUrl = ''
    let cancelled = false
    void import('../../../utils/boardDatabase')
      .then(({ readMediaBlob }) => readMediaBlob(key))
      .then((blob) => {
        if (!blob || cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [key])
  return url
}

function withAnnotationState(
  data: SketchpadData,
  state: AnnotationState,
): SketchpadData {
  return dataWithSkinState(
    data as ModuleData,
    'annotation',
    state as unknown as WidgetSkinState,
  ) as SketchpadData
}

function AnnotationView({
  data,
  widgetId,
  onChange,
}: {
  data: SketchpadData
  widgetId: string
  onChange: (data: SketchpadData) => void
}) {
  const state = annotationState(skinStateFor(data, 'annotation'))
  const fileInput = useRef<HTMLInputElement>(null)
  const localUrl = useLocalAnnotationSource(state.localBlobKey)
  const source = localUrl || safeDrawingReferenceUrl(state.sourceUrl)
  const isPdf = state.mimeType === 'application/pdf' || /\.pdf(?:$|[?#])/i.test(source)
  const update = (patch: Partial<AnnotationState>) => {
    onChange(withAnnotationState(data, { ...state, ...patch }))
  }
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || (!file.type.startsWith('image/') && file.type !== 'application/pdf')) return
    const suffix = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    const localBlobKey = `annotation:${widgetId}:${suffix}`
    const { writeMediaBlob } = await import('../../../utils/boardDatabase')
    await writeMediaBlob(localBlobKey, file)
    update({
      localBlobKey,
      mimeType: file.type,
      fileName: file.name,
      sourceUrl: '',
    })
  }

  const background = source ? (
    <div className="gp-annotation-background" style={{ opacity: state.opacity }}>
      {isPdf
        ? <iframe title="Locked PDF background" src={source} sandbox="" />
        : <img alt="" src={source} draggable={false} />}
    </div>
  ) : (
    <div className="gp-annotation-empty" aria-hidden>
      <FileImage size={22} />
      <strong>Bring in a reference</strong>
      <span>Image or PDF</span>
    </div>
  )

  return (
    <div className="gp-drawing-layout gp-annotation" data-drawing-mode="annotation">
      <DrawingHeader
        icon={ImageIcon}
        eyebrow="LOCKED LAYER"
        title="Annotation"
        note={state.fileName || (source ? 'Linked reference' : 'No reference yet')}
        trailing={(
          <button type="button" className="gp-drawing-add gp-touch-target" onClick={() => fileInput.current?.click()}>
            <FileUp size={13} aria-hidden /> Import
          </button>
        )}
      />
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/*,application/pdf"
        onChange={(event) => { void importFile(event) }}
      />
      <div className="gp-annotation-controls">
        <label className="gp-annotation-url">
          <span>REFERENCE URL</span>
          <input
            aria-label="Reference URL"
            value={state.sourceUrl}
            onChange={(event) => update({
              sourceUrl: event.target.value,
              localBlobKey: '',
              mimeType: /\.pdf(?:$|[?#])/i.test(event.target.value) ? 'application/pdf' : 'image/*',
              fileName: '',
            })}
            placeholder="Paste an image or PDF URL"
          />
        </label>
        <label className="gp-annotation-opacity">
          <span>FADE {Math.round(state.opacity * 100)}%</span>
          <input
            aria-label="Reference opacity"
            type="range"
            min="15"
            max="100"
            value={Math.round(state.opacity * 100)}
            onChange={(event) => update({ opacity: Number(event.target.value) / 100 })}
          />
        </label>
        {source && (
          <button
            type="button"
            className="gp-annotation-clear"
            aria-label="Remove reference"
            onClick={() => update({ sourceUrl: '', localBlobKey: '', mimeType: '', fileName: '' })}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      <SketchpadWidget
        data={data}
        surface="annotation"
        background={background}
        ariaLabel="Annotation drawing layer"
        onChange={onChange}
      />
    </div>
  )
}

export function DrawingWidget({ data, widgetId, title, onChange }: DrawingWidgetProps) {
  const mode = drawingMode(data.mode)
  if (mode === 'storyboard') return <StoryboardView data={data} onChange={onChange} />
  if (mode === 'annotation') {
    return <AnnotationView data={data} widgetId={widgetId} onChange={onChange} />
  }
  if (mode === 'diagram') {
    const diagram = data.diagram ?? EMPTY_DIAGRAM
    return (
      <div className="gp-drawing-layout gp-drawing-excalidraw" data-drawing-mode="diagram">
        <DrawingHeader
          icon={Shapes}
          eyebrow="FULL TOOLKIT"
          title="Excalidraw"
          note={`${diagram.elements.length} element${diagram.elements.length === 1 ? '' : 's'}`}
        />
        <ExcalidrawWidget
          data={diagram}
          widgetId={widgetId}
          title={title}
          onChange={(next) => onChange({ ...data, diagram: next })}
        />
      </div>
    )
  }
  return <NativeSurface mode={mode} data={data} onChange={onChange} />
}
