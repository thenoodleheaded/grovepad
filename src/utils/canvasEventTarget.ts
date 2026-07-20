/**
 * A canvas gesture is "strictly empty" only when the viewport itself was hit.
 * Any descendant means the pointer landed on rendered content or UI, including
 * portal events that React bubbles through the canvas component tree.
 */
export function isStrictCanvasSurface(
  target: EventTarget | null,
  viewport: EventTarget,
): boolean {
  return target === viewport
}
