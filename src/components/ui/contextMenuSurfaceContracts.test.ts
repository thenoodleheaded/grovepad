/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const menu = readFileSync(new URL('./WidgetContextMenu.tsx', import.meta.url), 'utf8')

/**
 * The context menu is drawn two ways — the glass popover on desktop, the system
 * action sheet on iOS — and the whole point of the refactor that introduced the
 * second one is that neither may grow an action the other lacks.
 */
describe('context menu surfaces', () => {
  it('builds every row once, and draws both surfaces from that one list', () => {
    // One builder. If a row is ever added as loose JSX again, the sheet on a
    // phone silently stops offering it.
    expect(menu.match(/const actions = useMemo<MenuAction\[\]>/g)).toHaveLength(1)
    expect(menu).toContain('actions.map((action) =>')
    expect(menu).toContain('items.map(({ label, danger }) => ({ label, danger }))')
    // No second copy of the rows hiding in the markup.
    expect(menu).not.toContain('label="Duplicate"')
    expect(menu).not.toContain('label="Unglue"')
  })

  it('shows only one menu per press', () => {
    // Drawing the glass menu under the system sheet would put two menus on
    // screen for the same long press.
    expect(menu).toContain('if (nativeMenu) return null')
  })

  it('presents the sheet once per opening, not once per store change', () => {
    // A label changing underneath an open sheet must not stack a second one.
    expect(menu).toContain('presentedFor.current === contextMenu.widgetId')
  })

  it('closes the menu whether a row was chosen or the sheet was dismissed', () => {
    // The sheet is gone either way; leaving the store open strands the state.
    const effect = menu.slice(menu.indexOf('void presentNativeMenu'), menu.indexOf('}, [nativeMenu'))
    expect(effect).toContain('closeContextMenu()')
    expect(effect.indexOf('closeContextMenu()')).toBeLessThan(effect.indexOf('items[index]?.run()'))
  })

  it('drops the desktop key hint from the row a phone will read aloud', () => {
    expect(menu).toContain("nativeMenu ? 'Rename' : 'Rename (F2)'")
  })
})
