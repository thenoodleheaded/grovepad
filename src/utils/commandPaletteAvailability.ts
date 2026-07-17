export function historyPaletteActionIds(canUndo: boolean, canRedo: boolean): string[] {
  return [canUndo ? 'action-undo' : null, canRedo ? 'action-redo' : null].filter((id): id is string => id !== null)
}
