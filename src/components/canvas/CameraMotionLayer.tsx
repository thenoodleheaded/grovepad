import { useEffect, useRef } from 'react'
import { registerCameraMotionRenderer } from '../../runtime/cameraMotionRuntime'
import { useCanvasStore } from '../../store/useCanvasStore'
import { useWidgetStore } from '../../store/useWidgetStore'
import { TRIGGER_WIRE_COLOR } from '../../types/circuit'
import type { Widget } from '../../types/spatial'
import {
  motionLocalDetailAlpha,
  motionSnapshotScale,
  motionWidgetIsVisible,
  prioritizeMotionWidgets,
} from '../../utils/cameraMotionDetail'
import { groupBounds } from '../../store/widgetCollection'

const GRID_FINE_SIZE = 40
const GRID_COARSE_SIZE = 200
const CAPTURE_RETRY_DELAY = 180
const ATLAS_SIZE = 4096
const ATLAS_GUTTER = 2
const SCENE_TILE_WORLD_SIZE = 2048
const SCENE_TILE_SCALE = 0.5
const SCENE_TILE_PIXELS = SCENE_TILE_WORLD_SIZE * SCENE_TILE_SCALE
const OVERVIEW_MAX_DIMENSION = 8192
const OVERVIEW_MAX_PIXELS = 16_000_000
const OVERVIEW_MAX_SCALE = 0.5

interface WidgetSnapshot {
  page: number
  x: number
  y: number
  pixelWidth: number
  pixelHeight: number
  width: number
  height: number
}

interface AtlasPage {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  nextX: number
  nextY: number
  rowHeight: number
}

interface SceneTile {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  worldX: number
  worldY: number
}

interface SceneOverview {
  canvas: HTMLCanvasElement
  worldX: number
  worldY: number
  worldWidth: number
  worldHeight: number
  scale: number
}

interface GpuTextureRect {
  texture: WebGLTexture
  worldX: number
  worldY: number
  worldWidth: number
  worldHeight: number
}

interface MotionGpuRenderer {
  resize: (width: number, height: number) => void
  setPalette: (background: string, fine: string, coarse: string, intensity: number) => void
  uploadScene: (overview: SceneOverview | null, tiles: Map<string, SceneTile>) => boolean
  uploadAura: (aura: HTMLCanvasElement | null) => void
  draw: (pan: { x: number; y: number }, zoom: number, lightTheme: boolean) => void
  releaseScene: () => void
  dispose: () => void
}

function drawFallbackCard(context: CanvasRenderingContext2D, widget: Widget): void {
  const accent = widget.metadata.accent ?? '#a3e635'
  context.save()
  context.fillStyle = 'rgb(23 23 23 / 0.96)'
  context.strokeStyle = accent
  context.lineWidth = 1.5
  context.beginPath()
  context.roundRect(
    widget.position.x,
    widget.position.y,
    widget.size.width,
    widget.size.height,
    widget.collapsed ? 18 : widget.iconified ? 14 : 22,
  )
  context.fill()
  context.stroke()

  if (!widget.collapsed && !widget.iconified) {
    const left = widget.position.x + 18
    const usableWidth = Math.max(20, widget.size.width - 36)
    const lineCount = Math.max(1, Math.min(6, Math.floor((widget.size.height - 44) / 30)))
    context.fillStyle = 'rgb(255 255 255 / 0.09)'
    for (let index = 0; index < lineCount; index += 1) {
      const width = usableWidth * (index % 3 === 2 ? 0.55 : index % 2 === 0 ? 0.86 : 0.7)
      context.beginPath()
      context.roundRect(left, widget.position.y + 24 + index * 30, width, 10, 5)
      context.fill()
    }
  }
  context.restore()
}

function drawWidgetTitle(context: CanvasRenderingContext2D, widget: Widget): void {
  if (widget.collapsed || widget.iconified) return
  const width = Math.min(widget.size.width * 0.8, Math.max(76, 42 + widget.title.length * 6.5))
  const x = widget.position.x
  const y = widget.position.y - 36
  context.save()
  context.fillStyle = 'rgb(18 18 20 / 0.94)'
  context.strokeStyle = 'rgb(255 255 255 / 0.12)'
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(x, y, width, 32, 16)
  context.fill()
  context.stroke()
  context.fillStyle = widget.metadata.accent ?? '#a3e635'
  context.beginPath()
  context.arc(x + 14, y + 16, 3, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#f5f5f5'
  context.font = '600 12px "Clash Display", sans-serif'
  context.textBaseline = 'middle'
  context.fillText(widget.title, x + 24, y + 16, width - 32)
  context.restore()
}

function relationColor(type: string, resolved: boolean): string {
  if (resolved) return 'rgb(100 116 139 / 0.58)'
  if (type === 'blocker') return '#dc2626'
  if (type === 'conflict') return '#f97316'
  if (type === 'co-parent') return '#7dd3fc'
  if (type === 'cousin') return '#737373'
  return 'rgb(167 139 250 / 0.7)'
}

function cssColorRgba(color: string): [number, number, number, number] {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const context = probe.getContext('2d', { willReadFrequently: true })
  if (!context) return [0, 0, 0, 1]
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = '#000000'
  context.fillStyle = color
  context.fillRect(0, 0, 1, 1)
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
  return [
    (red ?? 0) / 255,
    (green ?? 0) / 255,
    (blue ?? 0) / 255,
    (alpha ?? 255) / 255,
  ]
}

function createMotionGpuRenderer(canvas: HTMLCanvasElement): MotionGpuRenderer | null {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    depth: false,
    desynchronized: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    stencil: false,
  })
  if (!gl) return null

  const shader = (type: number, source: string) => {
    const next = gl.createShader(type)
    if (!next) throw new Error('Unable to allocate camera-motion GPU shader')
    gl.shaderSource(next, source)
    gl.compileShader(next)
    if (!gl.getShaderParameter(next, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(next) ?? 'Unknown camera-motion shader error'
      gl.deleteShader(next)
      throw new Error(message)
    }
    return next
  }
  const program = (vertexSource: string, fragmentSource: string) => {
    const vertex = shader(gl.VERTEX_SHADER, vertexSource)
    const fragment = shader(gl.FRAGMENT_SHADER, fragmentSource)
    const next = gl.createProgram()
    if (!next) throw new Error('Unable to allocate camera-motion GPU program')
    gl.attachShader(next, vertex)
    gl.attachShader(next, fragment)
    gl.linkProgram(next)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(next, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(next) ?? 'Unknown camera-motion link error'
      gl.deleteProgram(next)
      throw new Error(message)
    }
    return next
  }

  const backgroundProgram = program(
    `#version 300 es
      precision highp float;
      const vec2 POINTS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
      void main() { gl_Position = vec4(POINTS[gl_VertexID], 0.0, 1.0); }
    `,
    `#version 300 es
      precision highp float;
      uniform vec2 u_viewport;
      uniform vec2 u_pan;
      uniform float u_zoom;
      uniform float u_grid_intensity;
      uniform vec4 u_background;
      uniform vec4 u_fine;
      uniform vec4 u_coarse;
      out vec4 out_color;

      float grid_line(float coordinate, float spacing, float half_width) {
        float local = mod(mod(coordinate, spacing) + spacing, spacing);
        float distance_to_line = min(local, spacing - local);
        float antialias = max(fwidth(coordinate), 0.001);
        return 1.0 - smoothstep(half_width, half_width + antialias, distance_to_line);
      }

      void main() {
        vec2 screen = vec2(gl_FragCoord.x, u_viewport.y - gl_FragCoord.y);
        vec2 world = (screen - u_pan) / max(u_zoom, 0.01);
        vec2 cell = mod(mod(world - vec2(1.0), 40.0) + 40.0, 40.0);
        vec2 dot_delta = min(cell, 40.0 - cell);
        float dot_aa = max(length(vec2(fwidth(world.x), fwidth(world.y))), 0.001);
        float fine_alpha = 1.0 - smoothstep(1.15, 1.15 + dot_aa, length(dot_delta));
        float coarse_alpha = max(grid_line(world.x, 200.0, 0.5), grid_line(world.y, 200.0, 0.5));
        vec3 color = u_background.rgb;
        color = mix(color, u_fine.rgb, clamp(fine_alpha * u_fine.a * u_grid_intensity, 0.0, 1.0));
        color = mix(color, u_coarse.rgb, clamp(coarse_alpha * u_coarse.a * u_grid_intensity, 0.0, 1.0));
        out_color = vec4(color, 1.0);
      }
    `,
  )
  const textureProgram = program(
    `#version 300 es
      precision highp float;
      uniform vec4 u_rect;
      uniform vec2 u_pan;
      uniform vec2 u_viewport;
      uniform float u_zoom;
      uniform float u_screen_space;
      out vec2 v_uv;
      const vec2 POINTS[4] = vec2[4](vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(1.0, 1.0));
      void main() {
        vec2 point = POINTS[gl_VertexID];
        vec2 world_screen = u_pan + (u_rect.xy + point * u_rect.zw) * u_zoom;
        vec2 fixed_screen = u_rect.xy + point * u_rect.zw;
        vec2 screen = mix(world_screen, fixed_screen, u_screen_space);
        vec2 clip = vec2(screen.x / u_viewport.x * 2.0 - 1.0, 1.0 - screen.y / u_viewport.y * 2.0);
        gl_Position = vec4(clip, 0.0, 1.0);
        v_uv = vec2(point.x, 1.0 - point.y);
      }
    `,
    `#version 300 es
      precision mediump float;
      uniform sampler2D u_texture;
      uniform float u_opacity;
      in vec2 v_uv;
      out vec4 out_color;
      void main() { out_color = texture(u_texture, v_uv) * u_opacity; }
    `,
  )

  const backgroundUniforms = {
    viewport: gl.getUniformLocation(backgroundProgram, 'u_viewport'),
    pan: gl.getUniformLocation(backgroundProgram, 'u_pan'),
    zoom: gl.getUniformLocation(backgroundProgram, 'u_zoom'),
    gridIntensity: gl.getUniformLocation(backgroundProgram, 'u_grid_intensity'),
    background: gl.getUniformLocation(backgroundProgram, 'u_background'),
    fine: gl.getUniformLocation(backgroundProgram, 'u_fine'),
    coarse: gl.getUniformLocation(backgroundProgram, 'u_coarse'),
  }
  const textureUniforms = {
    rect: gl.getUniformLocation(textureProgram, 'u_rect'),
    pan: gl.getUniformLocation(textureProgram, 'u_pan'),
    viewport: gl.getUniformLocation(textureProgram, 'u_viewport'),
    zoom: gl.getUniformLocation(textureProgram, 'u_zoom'),
    screenSpace: gl.getUniformLocation(textureProgram, 'u_screen_space'),
    opacity: gl.getUniformLocation(textureProgram, 'u_opacity'),
  }
  gl.useProgram(textureProgram)
  gl.uniform1i(gl.getUniformLocation(textureProgram, 'u_texture'), 0)

  let viewportWidth = 1
  let viewportHeight = 1
  let background: [number, number, number, number] = [0.09, 0.12, 0.08, 1]
  let fine: [number, number, number, number] = [0.4, 0.55, 0.35, 0.18]
  let coarse: [number, number, number, number] = [0.4, 0.55, 0.35, 0.2]
  let gridIntensity = 1
  let overviewTexture: GpuTextureRect | null = null
  let tileTextures: GpuTextureRect[] = []
  let auraTexture: WebGLTexture | null = null

  const deleteTexture = (texture: WebGLTexture | null) => {
    if (texture) gl.deleteTexture(texture)
  }
  const uploadTexture = (source: HTMLCanvasElement) => {
    const texture = gl.createTexture()
    if (!texture) throw new Error('Unable to allocate camera-motion GPU texture')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
    return texture
  }
  const releaseScene = () => {
    deleteTexture(overviewTexture?.texture ?? null)
    overviewTexture = null
    for (const tile of tileTextures) deleteTexture(tile.texture)
    tileTextures = []
  }
  const drawTexture = (
    texture: GpuTextureRect,
    pan: { x: number; y: number },
    zoom: number,
    opacity: number,
    screenSpace = false,
  ) => {
    gl.bindTexture(gl.TEXTURE_2D, texture.texture)
    gl.uniform4f(
      textureUniforms.rect,
      texture.worldX,
      texture.worldY,
      texture.worldWidth,
      texture.worldHeight,
    )
    gl.uniform2f(textureUniforms.pan, pan.x, pan.y)
    gl.uniform1f(textureUniforms.zoom, zoom)
    gl.uniform1f(textureUniforms.screenSpace, screenSpace ? 1 : 0)
    gl.uniform1f(textureUniforms.opacity, opacity)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  return {
    resize(width, height) {
      viewportWidth = Math.max(1, width)
      viewportHeight = Math.max(1, height)
      canvas.width = viewportWidth
      canvas.height = viewportHeight
      gl.viewport(0, 0, viewportWidth, viewportHeight)
    },
    setPalette(nextBackground, nextFine, nextCoarse, nextIntensity) {
      background = cssColorRgba(nextBackground)
      fine = cssColorRgba(nextFine)
      coarse = cssColorRgba(nextCoarse)
      gridIntensity = nextIntensity
    },
    uploadScene(overview, tiles) {
      releaseScene()
      if (overview) {
        overviewTexture = {
          texture: uploadTexture(overview.canvas),
          worldX: overview.worldX,
          worldY: overview.worldY,
          worldWidth: overview.worldWidth,
          worldHeight: overview.worldHeight,
        }
      }
      // The overview is capped at 64 MB and reaches the same 0.5 world scale
      // as the former tile set on the 300-widget pressure board. Keeping one
      // resident scene texture prevents ANGLE from evicting/re-uploading a
      // 24-texture working set during sustained zoom. Tiles remain the CSS/2D
      // fallback for browsers without WebGL2.
      tileTextures = overview ? [] : [...tiles.values()].map((tile) => ({
        texture: uploadTexture(tile.canvas),
        worldX: tile.worldX,
        worldY: tile.worldY,
        worldWidth: SCENE_TILE_WORLD_SIZE,
        worldHeight: SCENE_TILE_WORLD_SIZE,
      }))
      const ready = overviewTexture !== null || tileTextures.length > 0 || tiles.size === 0
      if (ready) {
        // ANGLE defers texture transfer and pipeline work until a texture is
        // first sampled. Touch every resident texture in a 1px viewport while
        // idle, then wait for completion so none of that work lands on the
        // first wheel frame.
        gl.viewport(0, 0, 1, 1)
        gl.useProgram(textureProgram)
        gl.uniform2f(textureUniforms.viewport, 1, 1)
        gl.activeTexture(gl.TEXTURE0)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        const warm = (texture: WebGLTexture) => drawTexture({
          texture,
          worldX: 0,
          worldY: 0,
          worldWidth: 1,
          worldHeight: 1,
        }, { x: 0, y: 0 }, 1, 1, true)
        if (overviewTexture) warm(overviewTexture.texture)
        for (const tile of tileTextures) warm(tile.texture)

        // Also execute the real full-viewport pipelines once. A one-pixel
        // texture touch completes transfer, but ANGLE may still defer the
        // first full fragment pass and framebuffer work until presentation.
        gl.viewport(0, 0, viewportWidth, viewportHeight)
        gl.disable(gl.BLEND)
        gl.useProgram(backgroundProgram)
        gl.uniform2f(backgroundUniforms.viewport, viewportWidth, viewportHeight)
        gl.uniform2f(backgroundUniforms.pan, 0, 0)
        gl.uniform1f(backgroundUniforms.zoom, 0.1)
        gl.uniform1f(backgroundUniforms.gridIntensity, gridIntensity)
        gl.uniform4fv(backgroundUniforms.background, background)
        gl.uniform4fv(backgroundUniforms.fine, fine)
        gl.uniform4fv(backgroundUniforms.coarse, coarse)
        gl.drawArrays(gl.TRIANGLES, 0, 3)

        gl.useProgram(textureProgram)
        gl.uniform2f(textureUniforms.viewport, viewportWidth, viewportHeight)
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        if (overviewTexture) drawTexture(overviewTexture, { x: 0, y: 0 }, 0.1, 1)
        for (const tile of tileTextures) {
          drawTexture({
            ...tile,
            worldX: 0,
            worldY: 0,
            worldWidth: 64,
            worldHeight: 64,
          }, { x: 0, y: 0 }, 1, 1, true)
        }
        gl.finish()
        gl.viewport(0, 0, viewportWidth, viewportHeight)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
      }
      return ready
    },
    uploadAura(aura) {
      deleteTexture(auraTexture)
      auraTexture = aura && aura.width > 0 && aura.height > 0 ? uploadTexture(aura) : null
    },
    draw(pan, zoom, lightTheme) {
      gl.viewport(0, 0, viewportWidth, viewportHeight)
      gl.disable(gl.BLEND)
      gl.useProgram(backgroundProgram)
      gl.uniform2f(backgroundUniforms.viewport, viewportWidth, viewportHeight)
      gl.uniform2f(backgroundUniforms.pan, pan.x, pan.y)
      gl.uniform1f(backgroundUniforms.zoom, zoom)
      gl.uniform1f(backgroundUniforms.gridIntensity, gridIntensity)
      gl.uniform4fv(backgroundUniforms.background, background)
      gl.uniform4fv(backgroundUniforms.fine, fine)
      gl.uniform4fv(backgroundUniforms.coarse, coarse)
      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.useProgram(textureProgram)
      gl.uniform2f(textureUniforms.viewport, viewportWidth, viewportHeight)
      gl.activeTexture(gl.TEXTURE0)
      gl.enable(gl.BLEND)
      if (auraTexture) {
        gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA)
        if (!lightTheme) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
        drawTexture({
          texture: auraTexture,
          worldX: 0,
          worldY: 0,
          worldWidth: viewportWidth,
          worldHeight: viewportHeight,
        }, pan, zoom, 1, true)
      }

      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      if (overviewTexture) drawTexture(overviewTexture, pan, zoom, 1)
      const localAlpha = motionLocalDetailAlpha(zoom)
      if (localAlpha > 0) {
        for (const tile of tileTextures) {
          const left = pan.x + tile.worldX * zoom
          const top = pan.y + tile.worldY * zoom
          const size = SCENE_TILE_WORLD_SIZE * zoom
          if (left >= viewportWidth || top >= viewportHeight || left + size <= 0 || top + size <= 0) continue
          drawTexture(tile, pan, zoom, localAlpha)
        }
      }
    },
    releaseScene,
    dispose() {
      releaseScene()
      deleteTexture(auraTexture)
      auraTexture = null
      gl.deleteProgram(backgroundProgram)
      gl.deleteProgram(textureProgram)
    },
  }
}

/**
 * A detailed raster mirror used only while the camera is moving. Every card
 * is captured from its real DOM while the board is idle, so rapid zooming
 * redraws cheap bitmaps rather than re-rasterizing hundreds of live controls.
 * The real widget DOM remains mounted and becomes interactive again after the
 * final camera transform has been painted behind this surface.
 */
export function CameraMotionLayer() {
  const layerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null)
  const sceneWorldRef = useRef<HTMLDivElement>(null)
  const gridPlaneRef = useRef<HTMLDivElement>(null)
  const overviewHostRef = useRef<HTMLDivElement>(null)
  const detailHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const layer = layerRef.current
    const canvas = canvasRef.current
    const gpuCanvas = gpuCanvasRef.current
    const sceneWorld = sceneWorldRef.current
    const gridPlane = gridPlaneRef.current
    const overviewHost = overviewHostRef.current
    const detailHost = detailHostRef.current
    const viewport = layer?.parentElement
    if (
      !layer ||
      !canvas ||
      !gpuCanvas ||
      !sceneWorld ||
      !gridPlane ||
      !overviewHost ||
      !detailHost ||
      !viewport
    ) return
    let gpuRenderer: MotionGpuRenderer | null = null
    try {
      gpuRenderer = createMotionGpuRenderer(gpuCanvas)
    } catch (error) {
      layer.dataset.gpuError = error instanceof Error ? error.message.slice(0, 240) : String(error)
    }
    const context = canvas.getContext('2d', {
      // The motion frame itself paints an opaque background, but the canvas
      // must clear back to transparent before the live DOM is revealed.
      alpha: true,
      desynchronized: true,
    })
    if (!context) return

    const snapshots = new Map<string, WidgetSnapshot>()
    const placements = new Map<string, WidgetSnapshot>()
    const atlasPages: AtlasPage[] = []
    let sceneTiles = new Map<string, SceneTile>()
    let sceneOverview: SceneOverview | null = null
    let sceneReady = false
    let sceneDirty = true
    const dirtyIds = new Set<string>()
    let captureQueue: string[] = []
    let width = 0
    let height = 0
    let motionActive = false
    let captureRunning = false
    let idleCallbackId: number | null = null
    let captureTimer: number | null = null
    let themeGeneration = 0
    let captureErrors = 0
    let backgroundColor = '#182016'
    let gridPattern: CanvasPattern | null = null
    let gridIntensity = 1
    let captureModulePromise: Promise<typeof import('html-to-image')> | null = null
    let activeWidgetIds: string[] = []
    const drawDurations: number[] = []
    let gridWorldBounds: { left: number; top: number; right: number; bottom: number } | null = null

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'medium'

    const createAtlasPage = (): AtlasPage => {
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = ATLAS_SIZE
      pageCanvas.height = ATLAS_SIZE
      const pageContext = pageCanvas.getContext('2d', { alpha: true })
      if (!pageContext) throw new Error('Unable to create motion texture atlas')
      pageContext.imageSmoothingEnabled = true
      pageContext.imageSmoothingQuality = 'medium'
      const page = { canvas: pageCanvas, context: pageContext, nextX: 0, nextY: 0, rowHeight: 0 }
      atlasPages.push(page)
      return page
    }

    const allocateAtlasPlacement = (widget: Widget): WidgetSnapshot => {
      const scale = motionSnapshotScale(widget.size.width, widget.size.height)
      const pixelWidth = Math.max(1, Math.ceil(widget.size.width * scale))
      const pixelHeight = Math.max(1, Math.ceil(widget.size.height * scale))
      let page = atlasPages.at(-1) ?? createAtlasPage()
      if (page.nextX + pixelWidth + ATLAS_GUTTER > ATLAS_SIZE) {
        page.nextX = 0
        page.nextY += page.rowHeight + ATLAS_GUTTER
        page.rowHeight = 0
      }
      if (page.nextY + pixelHeight + ATLAS_GUTTER > ATLAS_SIZE) {
        page = createAtlasPage()
      }
      const placement: WidgetSnapshot = {
        page: atlasPages.length - 1,
        x: page.nextX,
        y: page.nextY,
        pixelWidth,
        pixelHeight,
        width: widget.size.width,
        height: widget.size.height,
      }
      page.nextX += pixelWidth + ATLAS_GUTTER
      page.rowHeight = Math.max(page.rowHeight, pixelHeight)
      placements.set(widget.id, placement)
      return placement
    }

    const releaseAtlasPages = () => {
      for (const page of atlasPages) {
        // Resetting the backing dimensions releases the large bitmap eagerly.
        page.canvas.width = 1
        page.canvas.height = 1
      }
      atlasPages.length = 0
      placements.clear()
      snapshots.clear()
    }

    const releaseSceneTiles = () => {
      gpuRenderer?.releaseScene()
      layer.dataset.gpuSceneReady = 'false'
      if (!motionActive) {
        gpuCanvas.style.display = 'none'
        layer.style.visibility = 'hidden'
      }
      overviewHost.replaceChildren()
      detailHost.replaceChildren()
      for (const tile of sceneTiles.values()) {
        tile.canvas.width = 1
        tile.canvas.height = 1
      }
      sceneTiles.clear()
      if (sceneOverview) {
        sceneOverview.canvas.width = 1
        sceneOverview.canvas.height = 1
        sceneOverview = null
      }
      sceneReady = false
      sceneDirty = true
    }

    const mountSceneSurfaces = () => {
      overviewHost.replaceChildren()
      detailHost.replaceChildren()
      if (gpuRenderer) {
        const gpuReady = gpuRenderer.uploadScene(sceneOverview, sceneTiles)
        layer.dataset.gpuSceneReady = String(gpuReady)
        layer.dataset.gpuSceneMode = sceneOverview ? 'single-overview' : 'tiles'
        if (gpuReady && !motionActive) {
          gpuRenderer.uploadAura(
            viewport.querySelector<HTMLCanvasElement>('[data-canvas-aura-layer]'),
          )
          const camera = useCanvasStore.getState()
          gpuRenderer.draw(
            camera.pan,
            camera.zoom,
            document.documentElement.dataset.theme === 'light',
          )
          gpuCanvas.style.display = 'block'
          gpuCanvas.style.opacity = '0.001'
          layer.style.visibility = 'visible'
          layer.style.pointerEvents = 'none'
        }
        return
      }
      if (sceneOverview) {
        const { canvas: overviewCanvas, worldX, worldY, worldWidth, worldHeight } = sceneOverview
        Object.assign(overviewCanvas.style, {
          position: 'absolute',
          left: `${worldX}px`,
          top: `${worldY}px`,
          width: `${worldWidth}px`,
          height: `${worldHeight}px`,
          pointerEvents: 'none',
        })
        overviewHost.append(overviewCanvas)
      }
      for (const tile of sceneTiles.values()) {
        Object.assign(tile.canvas.style, {
          position: 'absolute',
          left: `${tile.worldX}px`,
          top: `${tile.worldY}px`,
          width: `${SCENE_TILE_WORLD_SIZE}px`,
          height: `${SCENE_TILE_WORLD_SIZE}px`,
          pointerEvents: 'none',
        })
        detailHost.append(tile.canvas)
      }
    }

    const syncAtlasPlacements = () => {
      const board = useWidgetStore.getState()
      const activeIds = new Set(activeWidgetIds)
      for (const [widgetId, placement] of placements) {
        const widget = board.widgets[widgetId]
        if (
          activeIds.has(widgetId) &&
          widget?.size.width === placement.width &&
          widget.size.height === placement.height
        ) {
          continue
        }
        placements.delete(widgetId)
        snapshots.delete(widgetId)
      }
      for (const widgetId of activeWidgetIds) {
        const widget = board.widgets[widgetId]
        if (widget && !placements.has(widgetId)) allocateAtlasPlacement(widget)
      }
    }

    const updateSnapshotMetrics = () => {
      let ready = 0
      for (const widgetId of activeWidgetIds) {
        if (snapshots.has(widgetId)) ready += 1
      }
      layer.dataset.snapshotsReady = String(ready)
      layer.dataset.snapshotsTotal = String(activeWidgetIds.length)
      layer.dataset.snapshotErrors = String(captureErrors)
      layer.dataset.snapshotAtlasPages = String(atlasPages.length)
      layer.dataset.snapshotSceneTiles = String(sceneTiles.size)
      layer.dataset.snapshotSceneReady = String(
        sceneReady && !sceneDirty && dirtyIds.size === 0 && ready === activeWidgetIds.length,
      )
      layer.dataset.snapshotOverviewScale = sceneOverview?.scale.toFixed(3) ?? '0'
    }

    const refreshActiveWidgets = () => {
      const board = useWidgetStore.getState()
      const camera = useCanvasStore.getState()
      activeWidgetIds = prioritizeMotionWidgets(board.widgets, board.activeCanvasId, {
        pan: camera.pan,
        zoom: camera.zoom,
        width,
        height,
      })
        .sort((a, b) => (a.metadata.zIndex ?? 0) - (b.metadata.zIndex ?? 0))
        .map((widget) => widget.id)
      const activeIdSet = new Set(activeWidgetIds)
      for (const widgetId of dirtyIds) {
        if (!activeIdSet.has(widgetId)) dirtyIds.delete(widgetId)
      }
      syncAtlasPlacements()
      updateSnapshotMetrics()
    }

    const rebuildCaptureQueue = () => {
      const board = useWidgetStore.getState()
      const camera = useCanvasStore.getState()
      captureQueue = prioritizeMotionWidgets(board.widgets, board.activeCanvasId, {
        pan: camera.pan,
        zoom: camera.zoom,
        width,
        height,
      })
        .map((widget) => widget.id)
        .filter((widgetId) => dirtyIds.has(widgetId))
    }

    const updatePalette = () => {
      const rootStyle = getComputedStyle(document.documentElement)
      backgroundColor = getComputedStyle(viewport).backgroundColor || backgroundColor
      gridIntensity = Number.parseFloat(rootStyle.getPropertyValue('--gp-grid-intensity')) || 1

      const patternCanvas = document.createElement('canvas')
      patternCanvas.width = GRID_COARSE_SIZE
      patternCanvas.height = GRID_COARSE_SIZE
      const patternContext = patternCanvas.getContext('2d')
      if (!patternContext) return
      patternContext.clearRect(0, 0, GRID_COARSE_SIZE, GRID_COARSE_SIZE)
      patternContext.strokeStyle = rootStyle.getPropertyValue('--gp-grid-coarse').trim()
      patternContext.lineWidth = 1
      patternContext.beginPath()
      patternContext.moveTo(0.5, 0)
      patternContext.lineTo(0.5, GRID_COARSE_SIZE)
      patternContext.moveTo(0, 0.5)
      patternContext.lineTo(GRID_COARSE_SIZE, 0.5)
      patternContext.stroke()
      patternContext.fillStyle = rootStyle.getPropertyValue('--gp-grid-fine').trim()
      for (let x = 1; x < GRID_COARSE_SIZE; x += GRID_FINE_SIZE) {
        for (let y = 1; y < GRID_COARSE_SIZE; y += GRID_FINE_SIZE) {
          patternContext.beginPath()
          patternContext.arc(x, y, 1.15, 0, Math.PI * 2)
          patternContext.fill()
        }
      }
      gridPattern = context.createPattern(patternCanvas, 'repeat')
      const fineColor = rootStyle.getPropertyValue('--gp-grid-fine').trim()
      const coarseColor = rootStyle.getPropertyValue('--gp-grid-coarse').trim()
      gridPlane.style.backgroundImage = [
        `radial-gradient(circle at 1px 1px, ${fineColor} 0 1.15px, transparent 1.25px)`,
        `linear-gradient(to right, ${coarseColor} 0 1px, transparent 1px)`,
        `linear-gradient(to bottom, ${coarseColor} 0 1px, transparent 1px)`,
      ].join(', ')
      gridPlane.style.backgroundSize = `${GRID_FINE_SIZE}px ${GRID_FINE_SIZE}px, ${GRID_COARSE_SIZE}px ${GRID_COARSE_SIZE}px, ${GRID_COARSE_SIZE}px ${GRID_COARSE_SIZE}px`
      gridPlane.style.opacity = String(gridIntensity)
      gpuRenderer?.setPalette(backgroundColor, fineColor, coarseColor, gridIntensity)
    }

    const drawBackground = (panX: number, panY: number, zoom: number) => {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = backgroundColor
      context.fillRect(0, 0, width, height)
      if (gridPattern) {
        context.save()
        context.setTransform(zoom, 0, 0, zoom, panX, panY)
        context.globalAlpha = gridIntensity
        context.fillStyle = gridPattern
        context.fillRect(-panX / zoom, -panY / zoom, width / zoom, height / zoom)
        context.restore()
      }

      const aura = viewport.querySelector<HTMLCanvasElement>('[data-canvas-aura-layer]')
      if (aura && aura.width > 0 && aura.height > 0) {
        context.save()
        if (document.documentElement.dataset.theme === 'light') {
          context.globalCompositeOperation = 'multiply'
        }
        context.drawImage(aura, 0, 0, width, height)
        context.restore()
      }
    }

    const drawBoardDetails = (target: CanvasRenderingContext2D, zoom: number) => {
      const board = useWidgetStore.getState()

      for (const group of Object.values(board.groups)) {
        const bounds = groupBounds(board.widgets, group.widgetIds)
        if (!bounds) continue
        const member = group.widgetIds.map((id) => board.widgets[id]).find(Boolean)
        if (!member || member.canvasId !== board.activeCanvasId) continue
        target.save()
        target.globalAlpha = 0.14
        target.fillStyle = group.color
        target.strokeStyle = group.color
        target.lineWidth = 1.5 / zoom
        target.beginPath()
        target.roundRect(bounds.x - 20, bounds.y - 20, bounds.width + 40, bounds.height + 40, 28)
        target.fill()
        target.globalAlpha = 0.5
        target.stroke()
        target.globalAlpha = 0.9
        target.fillStyle = group.color
        target.font = '600 12px "Clash Display", sans-serif'
        target.fillText(group.label, bounds.x, bounds.y - 34)
        target.restore()
      }

      target.save()
      target.lineCap = 'round'
      target.lineJoin = 'round'
      target.lineWidth = 1.7 / zoom
      for (const relation of Object.values(board.relations)) {
        const from = board.widgets[relation.fromId]
        const to = board.widgets[relation.toId]
        if (!from || !to || from.canvasId !== board.activeCanvasId || to.canvasId !== board.activeCanvasId) {
          continue
        }
        const start = {
          x: from.position.x + from.size.width / 2,
          y: from.position.y + from.size.height,
        }
        const end = {
          x: to.position.x + to.size.width / 2,
          y: to.position.y,
        }
        const reach = Math.max(30, Math.abs(end.y - start.y) * 0.45)
        target.strokeStyle = relationColor(relation.type, relation.isResolved)
        target.setLineDash(relation.isResolved || relation.type === 'cousin' ? [6 / zoom, 6 / zoom] : [])
        target.beginPath()
        target.moveTo(start.x, start.y)
        target.bezierCurveTo(start.x, start.y + reach, end.x, end.y - reach, end.x, end.y)
        target.stroke()
      }
      target.setLineDash([])
      target.restore()
    }

    const drawSelectedOutlines = (target: CanvasRenderingContext2D, zoom: number) => {
      const board = useWidgetStore.getState()
      for (const widgetId of board.selectedIds) {
        const widget = board.widgets[widgetId]
        if (!widget || widget.canvasId !== board.activeCanvasId) continue
        target.save()
        target.strokeStyle = widget.metadata.accent ?? '#a3e635'
        target.lineWidth = 2 / zoom
        target.beginPath()
        target.roundRect(
          widget.position.x,
          widget.position.y,
          widget.size.width,
          widget.size.height,
          widget.collapsed ? 18 : widget.iconified ? 14 : 22,
        )
        target.stroke()
        target.restore()
      }
    }

    const drawConnections = (target: CanvasRenderingContext2D, zoom: number) => {
      const board = useWidgetStore.getState()
      target.save()
      target.lineWidth = 1.8 / zoom
      target.lineCap = 'round'
      for (const connection of Object.values(board.connections)) {
        const from = board.widgets[connection.fromId]
        const to = board.widgets[connection.toId]
        if (!from || !to || from.canvasId !== board.activeCanvasId || to.canvasId !== board.activeCanvasId) {
          continue
        }
        const startX = from.position.x + from.size.width
        const startY = from.position.y + from.size.height / 2
        const endX = to.position.x
        const endY = to.position.y + to.size.height / 2
        const reach = Math.max(24, Math.abs(endX - startX) * 0.4)
        target.globalAlpha = connection.enabled ? 0.92 : 0.38
        target.strokeStyle = connection.kind === 'trigger' ? TRIGGER_WIRE_COLOR : '#31a6ff'
        target.setLineDash(connection.enabled ? [] : [5 / zoom, 6 / zoom])
        target.beginPath()
        target.moveTo(startX, startY)
        target.bezierCurveTo(startX + reach, startY, endX - reach, endY, endX, endY)
        target.stroke()
      }
      target.restore()
    }

    const drawWidgets = (pan: { x: number; y: number }, zoom: number) => {
      const board = useWidgetStore.getState()
      const viewportState = { pan, zoom, width, height }
      if (
        sceneReady &&
        !sceneDirty &&
        dirtyIds.size === 0 &&
        snapshots.size >= activeWidgetIds.length
      ) {
        if (sceneOverview) {
          context.drawImage(
            sceneOverview.canvas,
            sceneOverview.worldX,
            sceneOverview.worldY,
            sceneOverview.worldWidth,
            sceneOverview.worldHeight,
          )
        }
        // The overview already contains every card. Sharper local tiles blend
        // in continuously as their extra source resolution becomes useful on
        // screen; no React state, DOM attribute, or threshold-boundary style
        // recalculation occurs while zooming.
        const localDetailAlpha = motionLocalDetailAlpha(zoom)
        if (localDetailAlpha > 0) {
          context.save()
          context.globalAlpha = localDetailAlpha
          for (const tile of sceneTiles.values()) {
            const screenLeft = pan.x + tile.worldX * zoom
            const screenTop = pan.y + tile.worldY * zoom
            const screenSize = SCENE_TILE_WORLD_SIZE * zoom
            if (
              screenLeft >= width ||
              screenTop >= height ||
              screenLeft + screenSize <= 0 ||
              screenTop + screenSize <= 0
            ) {
              continue
            }
            context.drawImage(
              tile.canvas,
              tile.worldX,
              tile.worldY,
              SCENE_TILE_WORLD_SIZE,
              SCENE_TILE_WORLD_SIZE,
            )
          }
          context.restore()
        }
      } else {
        for (const widgetId of activeWidgetIds) {
          const widget = board.widgets[widgetId]
          if (!widget || widget.canvasId !== board.activeCanvasId) continue
          if (!motionWidgetIsVisible(widget, viewportState)) continue
          const snapshot = snapshots.get(widgetId)
          if (
            snapshot &&
            snapshot.width === widget.size.width &&
            snapshot.height === widget.size.height
          ) {
            const page = atlasPages[snapshot.page]
            if (page) context.drawImage(
              page.canvas,
              snapshot.x,
              snapshot.y,
              snapshot.pixelWidth,
              snapshot.pixelHeight,
              widget.position.x,
              widget.position.y,
              widget.size.width,
              widget.size.height,
            )
          } else {
            drawFallbackCard(context, widget)
          }
          drawWidgetTitle(context, widget)
        }
      }

      drawSelectedOutlines(context, zoom)
      drawConnections(context, zoom)
    }

    const recordDrawDuration = (startedAt: number) => {
      drawDurations.push(performance.now() - startedAt)
      if (drawDurations.length > 360) drawDurations.shift()
    }

    const hasCurrentScene = () =>
      sceneReady &&
      !sceneDirty &&
      dirtyIds.size === 0 &&
      snapshots.size >= activeWidgetIds.length

    const ensureGridCoverage = (pan: { x: number; y: number }, zoom: number) => {
      const safeZoom = Math.max(zoom, 0.01)
      const visibleLeft = -pan.x / safeZoom
      const visibleTop = -pan.y / safeZoom
      const visibleRight = visibleLeft + width / safeZoom
      const visibleBottom = visibleTop + height / safeZoom
      const current = gridWorldBounds
      if (
        current &&
        visibleLeft >= current.left &&
        visibleTop >= current.top &&
        visibleRight <= current.right &&
        visibleBottom <= current.bottom
      ) return

      const visibleWidth = visibleRight - visibleLeft
      const visibleHeight = visibleBottom - visibleTop
      const margin = Math.max(visibleWidth, visibleHeight)
      const left = Math.floor((visibleLeft - margin) / GRID_COARSE_SIZE) * GRID_COARSE_SIZE
      const top = Math.floor((visibleTop - margin) / GRID_COARSE_SIZE) * GRID_COARSE_SIZE
      const right = Math.ceil((visibleRight + margin) / GRID_COARSE_SIZE) * GRID_COARSE_SIZE
      const bottom = Math.ceil((visibleBottom + margin) / GRID_COARSE_SIZE) * GRID_COARSE_SIZE
      gridWorldBounds = { left, top, right, bottom }
      Object.assign(gridPlane.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${right - left}px`,
        height: `${bottom - top}px`,
      })
    }

    const draw = () => {
      if (!motionActive || width === 0 || height === 0) return
      const startedAt = performance.now()
      const { pan, zoom } = useCanvasStore.getState()
      if (hasCurrentScene()) {
        canvas.style.display = 'none'
        if (gpuRenderer) {
          sceneWorld.style.display = 'none'
          gpuCanvas.style.display = 'block'
          gpuCanvas.style.opacity = '1'
          gpuRenderer.draw(
            pan,
            zoom,
            document.documentElement.dataset.theme === 'light',
          )
          recordDrawDuration(startedAt)
          return
        }
        gpuCanvas.style.display = 'none'
        sceneWorld.style.display = 'block'
        ensureGridCoverage(pan, zoom)
        sceneWorld.style.transform = `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`
        detailHost.style.opacity = String(motionLocalDetailAlpha(zoom))
        recordDrawDuration(startedAt)
        return
      }
      sceneWorld.style.display = 'none'
      gpuCanvas.style.display = 'none'
      canvas.style.display = 'block'
      drawBackground(pan.x, pan.y, zoom)
      context.save()
      context.setTransform(zoom, 0, 0, zoom, pan.x, pan.y)
      drawBoardDetails(context, zoom)
      drawWidgets(pan, zoom)
      context.restore()
      recordDrawDuration(startedAt)
    }

    const publishDrawMetrics = () => {
      if (drawDurations.length === 0) return
      const ordered = [...drawDurations].sort((a, b) => a - b)
      const percentile = ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * 0.95))] ?? 0
      layer.dataset.lastDrawP95Ms = percentile.toFixed(2)
      layer.dataset.lastDrawMaxMs = Math.max(...ordered).toFixed(2)
      layer.dataset.lastDrawFrames = String(ordered.length)
      drawDurations.length = 0
    }

    const clear = () => {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, width, height)
      canvas.style.display = 'none'
      sceneWorld.style.display = 'none'
      if (gpuRenderer && sceneReady) {
        gpuCanvas.style.display = 'block'
        gpuCanvas.style.opacity = '0.001'
      } else {
        gpuCanvas.style.display = 'none'
        gpuCanvas.style.opacity = '1'
      }
    }

    const resize = () => {
      const rect = viewport.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.ceil(rect.width))
      const nextHeight = Math.max(1, Math.ceil(rect.height))
      if (nextWidth === width && nextHeight === height) return
      width = nextWidth
      height = nextHeight
      // One backing pixel per CSS pixel keeps a 120 Hz redraw bounded on
      // Retina screens; widget captures retain their own detail resolution.
      canvas.width = width
      canvas.height = height
      gpuRenderer?.resize(width, height)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'medium'
      refreshActiveWidgets()
      rebuildCaptureQueue()
      if (motionActive) draw()
    }

    const cancelCaptureSchedule = () => {
      if (idleCallbackId !== null) window.cancelIdleCallback(idleCallbackId)
      if (captureTimer !== null) window.clearTimeout(captureTimer)
      idleCallbackId = null
      captureTimer = null
    }

    const captureWidget = async (widgetId: string) => {
      const board = useWidgetStore.getState()
      const widget = board.widgets[widgetId]
      if (!widget || widget.canvasId !== board.activeCanvasId) return
      const article = viewport.querySelector<HTMLElement>(
        `.gp-widget-layout-motion[data-widget-id="${CSS.escape(widgetId)}"] > article[data-widget-id="${CSS.escape(widgetId)}"]`,
      )
      if (!article) {
        dirtyIds.add(widgetId)
        return
      }

      const expectedWidget = widget
      const expectedThemeGeneration = themeGeneration
      captureModulePromise ??= import('html-to-image')
      const htmlToImage = await captureModulePromise
      if (motionActive) {
        dirtyIds.add(widgetId)
        return
      }

      const scale = motionSnapshotScale(widget.size.width, widget.size.height)
      const svg = await htmlToImage.toSvg(article, {
        width: widget.size.width,
        height: widget.size.height,
        // The app font is already resident in Chromium's document font set.
        // Re-embedding the same five WOFF files into 300 temporary SVGs makes
        // idle preparation several minutes slower without improving pixels.
        skipFonts: true,
        skipAutoScale: true,
        cacheBust: false,
        filter: (node) => node.dataset?.motionSnapshotExclude !== 'true',
      })
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const next = new Image()
        next.onload = () => resolve(next)
        next.onerror = reject
        next.crossOrigin = 'anonymous'
        next.decoding = 'sync'
        next.src = svg
      })
      const captured = document.createElement('canvas')
      captured.width = Math.max(1, Math.ceil(widget.size.width * scale))
      captured.height = Math.max(1, Math.ceil(widget.size.height * scale))
      const capturedContext = captured.getContext('2d', { alpha: true })
      if (!capturedContext) throw new Error('Unable to create widget motion snapshot')
      capturedContext.drawImage(image, 0, 0, captured.width, captured.height)
      const fresh = useWidgetStore.getState().widgets[widgetId]
      if (
        motionActive ||
        fresh !== expectedWidget ||
        expectedThemeGeneration !== themeGeneration
      ) {
        dirtyIds.add(widgetId)
        return
      }

      const placement = placements.get(widgetId) ?? allocateAtlasPlacement(widget)
      const page = atlasPages[placement.page]
      if (!page) throw new Error('Motion texture atlas page is unavailable')
      page.context.clearRect(placement.x, placement.y, placement.pixelWidth, placement.pixelHeight)
      page.context.drawImage(captured, placement.x, placement.y)
      snapshots.set(widgetId, {
        ...placement,
        pixelWidth: captured.width,
        pixelHeight: captured.height,
      })
      sceneDirty = true
      updateSnapshotMetrics()
    }

    const buildSceneTiles = () => {
      if (
        motionActive ||
        !sceneDirty ||
        dirtyIds.size > 0 ||
        snapshots.size < activeWidgetIds.length
      ) {
        return
      }
      const board = useWidgetStore.getState()
      const nextTiles = new Map<string, SceneTile>()
      const tileFor = (column: number, row: number) => {
        const key = `${column}:${row}`
        const existing = nextTiles.get(key)
        if (existing) return existing
        const tileCanvas = document.createElement('canvas')
        tileCanvas.width = SCENE_TILE_PIXELS
        tileCanvas.height = SCENE_TILE_PIXELS
        const tileContext = tileCanvas.getContext('2d', { alpha: true })
        if (!tileContext) throw new Error('Unable to create detailed motion scene tile')
        tileContext.imageSmoothingEnabled = true
        tileContext.imageSmoothingQuality = 'medium'
        const tile = {
          canvas: tileCanvas,
          context: tileContext,
          worldX: column * SCENE_TILE_WORLD_SIZE,
          worldY: row * SCENE_TILE_WORLD_SIZE,
        }
        nextTiles.set(key, tile)
        return tile
      }

      // Allocate every occupied tile first so graph paint can be clipped into
      // the same static surfaces before cards are composited above it.
      for (const widgetId of activeWidgetIds) {
        const widget = board.widgets[widgetId]
        if (!widget) continue
        const left = widget.position.x
        const top = widget.position.y - (widget.collapsed || widget.iconified ? 0 : 36)
        const right = widget.position.x + widget.size.width
        const bottom = widget.position.y + widget.size.height
        const firstColumn = Math.floor(left / SCENE_TILE_WORLD_SIZE)
        const lastColumn = Math.floor((right - 0.001) / SCENE_TILE_WORLD_SIZE)
        const firstRow = Math.floor(top / SCENE_TILE_WORLD_SIZE)
        const lastRow = Math.floor((bottom - 0.001) / SCENE_TILE_WORLD_SIZE)
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          for (let row = firstRow; row <= lastRow; row += 1) tileFor(column, row)
        }
      }

      for (const tile of nextTiles.values()) {
        tile.context.save()
        tile.context.setTransform(
          SCENE_TILE_SCALE,
          0,
          0,
          SCENE_TILE_SCALE,
          -tile.worldX * SCENE_TILE_SCALE,
          -tile.worldY * SCENE_TILE_SCALE,
        )
        drawBoardDetails(tile.context, SCENE_TILE_SCALE)
        tile.context.restore()
      }

      for (const widgetId of activeWidgetIds) {
        const widget = board.widgets[widgetId]
        const snapshot = snapshots.get(widgetId)
        if (!widget || !snapshot) continue
        const page = atlasPages[snapshot.page]
        if (!page) continue
        const left = widget.position.x
        const top = widget.position.y - (widget.collapsed || widget.iconified ? 0 : 36)
        const right = widget.position.x + widget.size.width
        const bottom = widget.position.y + widget.size.height
        const firstColumn = Math.floor(left / SCENE_TILE_WORLD_SIZE)
        const lastColumn = Math.floor((right - 0.001) / SCENE_TILE_WORLD_SIZE)
        const firstRow = Math.floor(top / SCENE_TILE_WORLD_SIZE)
        const lastRow = Math.floor((bottom - 0.001) / SCENE_TILE_WORLD_SIZE)
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          for (let row = firstRow; row <= lastRow; row += 1) {
            const tile = tileFor(column, row)
            tile.context.save()
            tile.context.setTransform(
              SCENE_TILE_SCALE,
              0,
              0,
              SCENE_TILE_SCALE,
              -tile.worldX * SCENE_TILE_SCALE,
              -tile.worldY * SCENE_TILE_SCALE,
            )
            tile.context.drawImage(
              page.canvas,
              snapshot.x,
              snapshot.y,
              snapshot.pixelWidth,
              snapshot.pixelHeight,
              widget.position.x,
              widget.position.y,
              widget.size.width,
              widget.size.height,
            )
            drawWidgetTitle(tile.context, widget)
            tile.context.restore()
          }
        }
      }

      for (const tile of nextTiles.values()) {
        tile.context.save()
        tile.context.setTransform(
          SCENE_TILE_SCALE,
          0,
          0,
          SCENE_TILE_SCALE,
          -tile.worldX * SCENE_TILE_SCALE,
          -tile.worldY * SCENE_TILE_SCALE,
        )
        drawConnections(tile.context, SCENE_TILE_SCALE)
        drawSelectedOutlines(tile.context, SCENE_TILE_SCALE)
        tile.context.restore()
      }

      for (const tile of sceneTiles.values()) {
        tile.canvas.width = 1
        tile.canvas.height = 1
      }
      sceneTiles = nextTiles
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const widgetId of activeWidgetIds) {
        const widget = board.widgets[widgetId]
        if (!widget) continue
        minX = Math.min(minX, widget.position.x)
        minY = Math.min(
          minY,
          widget.position.y - (widget.collapsed || widget.iconified ? 0 : 36),
        )
        maxX = Math.max(maxX, widget.position.x + widget.size.width)
        maxY = Math.max(maxY, widget.position.y + widget.size.height)
      }
      if (Number.isFinite(minX) && Number.isFinite(minY)) {
        const worldWidth = Math.max(1, maxX - minX)
        const worldHeight = Math.max(1, maxY - minY)
        const overviewScale = Math.min(
          OVERVIEW_MAX_SCALE,
          OVERVIEW_MAX_DIMENSION / worldWidth,
          OVERVIEW_MAX_DIMENSION / worldHeight,
          Math.sqrt(OVERVIEW_MAX_PIXELS / (worldWidth * worldHeight)),
        )
        const overviewCanvas = document.createElement('canvas')
        overviewCanvas.width = Math.max(1, Math.ceil(worldWidth * overviewScale))
        overviewCanvas.height = Math.max(1, Math.ceil(worldHeight * overviewScale))
        const overviewContext = overviewCanvas.getContext('2d', { alpha: true })
        if (!overviewContext) throw new Error('Unable to create detailed board overview')
        overviewContext.imageSmoothingEnabled = true
        overviewContext.imageSmoothingQuality = 'medium'
        overviewContext.setTransform(
          overviewScale,
          0,
          0,
          overviewScale,
          -minX * overviewScale,
          -minY * overviewScale,
        )
        for (const tile of sceneTiles.values()) {
          overviewContext.drawImage(
            tile.canvas,
            tile.worldX,
            tile.worldY,
            SCENE_TILE_WORLD_SIZE,
            SCENE_TILE_WORLD_SIZE,
          )
        }
        if (sceneOverview) {
          sceneOverview.canvas.width = 1
          sceneOverview.canvas.height = 1
        }
        sceneOverview = {
          canvas: overviewCanvas,
          worldX: minX,
          worldY: minY,
          worldWidth,
          worldHeight,
          scale: overviewScale,
        }
      }
      sceneReady = sceneTiles.size > 0 || activeWidgetIds.length === 0
      sceneDirty = false
      mountSceneSurfaces()
      updateSnapshotMetrics()
    }

    const scheduleCapture = (delay = 0) => {
      if (motionActive || captureRunning || idleCallbackId !== null || captureTimer !== null) return
      if (delay > 0) {
        captureTimer = window.setTimeout(() => {
          captureTimer = null
          scheduleCapture()
        }, delay)
        return
      }
      idleCallbackId = window.requestIdleCallback(
        (deadline) => {
          idleCallbackId = null
          if (motionActive) return
          if (!deadline.didTimeout && deadline.timeRemaining() < 2) {
            scheduleCapture(16)
            return
          }
          if (captureQueue.length === 0) rebuildCaptureQueue()
          let widgetId = captureQueue.shift()
          while (widgetId && !dirtyIds.delete(widgetId)) widgetId = captureQueue.shift()
          if (!widgetId) {
            buildSceneTiles()
            updateSnapshotMetrics()
            return
          }
          captureRunning = true
          const captureStartedAt = performance.now()
          void captureWidget(widgetId)
            .catch((error: unknown) => {
              captureErrors += 1
              layer.dataset.snapshotLastError =
                error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)
            })
            .finally(() => {
              layer.dataset.snapshotLastCaptureMs = (
                performance.now() - captureStartedAt
              ).toFixed(1)
              captureRunning = false
              updateSnapshotMetrics()
              scheduleCapture()
            })
        },
        { timeout: 160 },
      )
    }

    const invalidateAllSnapshots = () => {
      themeGeneration += 1
      snapshots.clear()
      releaseSceneTiles()
      for (const page of atlasPages) {
        page.context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE)
      }
      const board = useWidgetStore.getState()
      for (const widgetId of activeWidgetIds) {
        if (board.widgets[widgetId]) dirtyIds.add(widgetId)
      }
      rebuildCaptureQueue()
      updateSnapshotMetrics()
      scheduleCapture(CAPTURE_RETRY_DELAY)
    }

    resize()
    updatePalette()
    refreshActiveWidgets()
    for (const widgetId of activeWidgetIds) dirtyIds.add(widgetId)
    rebuildCaptureQueue()
    updateSnapshotMetrics()
    scheduleCapture(80)

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(viewport)
    const viewportStyleObserver = new MutationObserver(() => {
      updatePalette()
      if (motionActive) draw()
    })
    viewportStyleObserver.observe(viewport, { attributes: true, attributeFilter: ['style'] })
    const themeObserver = new MutationObserver(() => {
      updatePalette()
      invalidateAllSnapshots()
      if (motionActive) draw()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    const onGpuContextLost = (event: Event) => {
      // Asking the browser to restore the context lets the current gesture
      // continue on the already-prepared CSS/2D scene instead of flashing an
      // empty compositor surface under temporary GPU pressure.
      event.preventDefault()
      gpuRenderer = null
      layer.dataset.gpuError = 'webgl-context-lost'
      layer.dataset.gpuSceneReady = 'false'
      gpuCanvas.style.display = 'none'
      mountSceneSurfaces()
      if (motionActive) draw()
    }
    const onGpuContextRestored = () => {
      try {
        gpuRenderer = createMotionGpuRenderer(gpuCanvas)
        if (!gpuRenderer) throw new Error('WebGL2 unavailable after context restoration')
        gpuRenderer.resize(width, height)
        updatePalette()
        if (sceneReady) mountSceneSurfaces()
        delete layer.dataset.gpuError
        if (motionActive) draw()
      } catch (error) {
        gpuRenderer = null
        layer.dataset.gpuError =
          error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)
        mountSceneSurfaces()
        if (motionActive) draw()
      }
    }
    gpuCanvas.addEventListener('webglcontextlost', onGpuContextLost)
    gpuCanvas.addEventListener('webglcontextrestored', onGpuContextRestored)

    const unsubscribeCanvas = useCanvasStore.subscribe((state) => {
      if (motionActive) {
        draw()
      } else if (gpuRenderer && hasCurrentScene()) {
        gpuRenderer.draw(
          state.pan,
          state.zoom,
          document.documentElement.dataset.theme === 'light',
        )
      }
    })
    const unsubscribeWidgets = useWidgetStore.subscribe((state, previous) => {
      const staticSceneChanged =
        state.relations !== previous.relations ||
        state.connections !== previous.connections ||
        state.groups !== previous.groups ||
        state.selectedIds !== previous.selectedIds
      if (state.activeCanvasId !== previous.activeCanvasId) {
        releaseSceneTiles()
        releaseAtlasPages()
        dirtyIds.clear()
        refreshActiveWidgets()
        for (const widgetId of activeWidgetIds) dirtyIds.add(widgetId)
        rebuildCaptureQueue()
        scheduleCapture(CAPTURE_RETRY_DELAY)
      } else if (state.widgets !== previous.widgets) {
        sceneDirty = true
        for (const widgetId of activeWidgetIds) {
          if (state.widgets[widgetId] !== previous.widgets[widgetId]) dirtyIds.add(widgetId)
        }
        for (const widgetId of snapshots.keys()) {
          if (state.widgets[widgetId]) continue
          snapshots.delete(widgetId)
          dirtyIds.delete(widgetId)
        }
        refreshActiveWidgets()
        for (const widgetId of activeWidgetIds) {
          if (!snapshots.has(widgetId)) dirtyIds.add(widgetId)
        }
        rebuildCaptureQueue()
        scheduleCapture(CAPTURE_RETRY_DELAY)
      }
      if (staticSceneChanged) {
        sceneDirty = true
        scheduleCapture(CAPTURE_RETRY_DELAY)
      }
      if (motionActive && (
        state.widgets !== previous.widgets ||
        state.relations !== previous.relations ||
        state.connections !== previous.connections ||
        state.groups !== previous.groups ||
        state.selectedIds !== previous.selectedIds
      )) {
        draw()
      }
    })

    const unregisterRenderer = registerCameraMotionRenderer({
      show: () => {
        cancelCaptureSchedule()
        motionActive = true
        layer.dataset.motionActive = 'true'
        layer.style.visibility = 'visible'
        gpuRenderer?.uploadAura(
          viewport.querySelector<HTMLCanvasElement>('[data-canvas-aura-layer]'),
        )
        if (gpuRenderer && hasCurrentScene()) {
          canvas.style.display = 'none'
          sceneWorld.style.display = 'none'
          gpuCanvas.style.display = 'block'
          gpuCanvas.style.opacity = '1'
        } else {
          draw()
        }
        layer.style.pointerEvents = 'auto'
      },
      hide: () => {
        motionActive = false
        layer.dataset.motionActive = 'false'
        publishDrawMetrics()
        clear()
        layer.style.pointerEvents = 'none'
        layer.style.visibility = gpuRenderer && sceneReady ? 'visible' : 'hidden'
        rebuildCaptureQueue()
        scheduleCapture(CAPTURE_RETRY_DELAY)
      },
    })

    return () => {
      unregisterRenderer()
      unsubscribeCanvas()
      unsubscribeWidgets()
      resizeObserver.disconnect()
      viewportStyleObserver.disconnect()
      themeObserver.disconnect()
      gpuCanvas.removeEventListener('webglcontextlost', onGpuContextLost)
      gpuCanvas.removeEventListener('webglcontextrestored', onGpuContextRestored)
      cancelCaptureSchedule()
      releaseSceneTiles()
      releaseAtlasPages()
      gpuRenderer?.dispose()
    }
  }, [])

  return (
    <div
      ref={layerRef}
      data-camera-motion-layer
      data-motion-detail="dom-raster-gpu"
      data-motion-active="false"
      aria-hidden="true"
      className="pointer-events-none invisible absolute inset-0 z-20 h-full w-full overflow-hidden"
      style={{ contain: 'strict', isolation: 'isolate' }}
    >
      <div
        ref={sceneWorldRef}
        className="absolute left-0 top-0 hidden origin-top-left"
        style={{ willChange: 'transform', contain: 'layout style' }}
      >
        <div ref={gridPlaneRef} className="absolute" />
        <div ref={overviewHostRef} className="absolute left-0 top-0" />
        <div
          ref={detailHostRef}
          className="absolute left-0 top-0"
          style={{ willChange: 'opacity' }}
        />
      </div>
      <canvas
        ref={gpuCanvasRef}
        className="absolute inset-0 hidden h-full w-full"
        style={{ contain: 'strict' }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 hidden h-full w-full"
        style={{ contain: 'strict' }}
      />
    </div>
  )
}
