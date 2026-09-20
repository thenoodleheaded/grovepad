// GrovepadCanvas — camera, gestures, tiered renderer, edge paint, selection.
//
// Layout (apple/AGENTS.md):
//   Camera/     GlidePhysics, FrameScheduler, CameraEngine, CameraFraming, GestureEngine
//   Residency/  ResidencyPlanner (rest context, live/resting tiers)
//   Selection/  Marquee (modes, hit rect, pointer intent), DragResize (resize law)
//   Edges/      EdgeRoute, FlowCurve, DependencyGeometry, EdgePaint, EdgeLayer
//   Ports/      PortGeometry (rail math over port counts)
//   Render/     CanvasHost (Core Animation world, tiles, controller)
//   Glass/      GlassBudget
//
// Everything above Render/ and Edges/EdgeLayer is pure Swift over
// GrovepadCore geometry; time and registry knowledge are injected.
import GrovepadCore
