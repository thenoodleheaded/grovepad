// Add the Skin Gallery workspace to a running Grovepad.
//
//   1. npm run demo:skins          (builds the fragment and serves it from public/)
//   2. open Grovepad, open any board
//   3. paste this whole file into the browser console and press Enter
//
// It ADDS a workspace. Existing workspaces, canvases, cards, relations and
// wires are carried across untouched, and running it again replaces only the
// gallery's own `skinlab-` records.

;(async () => {
  const hook = window.__grovepad
  if (!hook) {
    console.error('Open a board first — the store hook only exists once a canvas is on screen.')
    return
  }
  const fragment = await (await fetch('/skin-gallery.json')).json()
  const state = hook.useWidgetStore.getState()
  const withoutGallery = (record) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => !id.startsWith('skinlab-')))

  hook.useWidgetStore.getState().loadBoard({
    workspaces: { ...withoutGallery(state.workspaces), [fragment.workspace.id]: fragment.workspace },
    canvases: { ...withoutGallery(state.canvases), ...fragment.canvases },
    widgets: { ...withoutGallery(state.widgets), ...fragment.widgets },
    relations: withoutGallery(state.relations),
    connections: withoutGallery(state.connections),
    glues: withoutGallery(state.glues),
    activePacks: [...new Set([...(state.activePacks ?? []), ...(fragment.activePacks ?? [])])],
    activeWorkspaceId: fragment.workspace.id,
    activeCanvasId: fragment.workspace.rootCanvasId,
    canvasViews: {},
  })
  hook.useWidgetStore.getState().switchWorkspace(fragment.workspace.id)

  const next = hook.useWidgetStore.getState()
  console.log(
    `Skin Gallery added — ${fragment.stats.canvases} canvases, ${fragment.stats.widgets} cards. ` +
      `Workspaces now: ${Object.values(next.workspaces).map((w) => w.name).join(', ')}`,
  )
})()
