/**
 * Renders a widget's content as a markdown section under its title. Shared
 * by the widget title row's "Copy as Markdown" button and the group name
 * pill's group-wide equivalent, which concatenates one section per member.
 * Takes `type`/`data` loosely rather than the full discriminated `Widget`
 * shape — every branch below already reads its fields untyped, so the
 * stricter shape would buy no real safety, only friction for callers and
 * tests building minimal fixtures.
 */
export function widgetToMarkdown(widget: { title: string; type: string; data: unknown }): string {
  let md = `### ${widget.title}\n\n`
  const data = widget.data as any
  if (widget.type === 'notes' || widget.type === 'sticky_note') {
    md += data.text || ''
  } else if (widget.type === 'checklist') {
    const items = data.items || []
    md += items.map((it: any) => `- [${it.done ? 'x' : ' '}] ${it.label}`).join('\n')
  } else if (widget.type === 'bullets') {
    const items = data.items || []
    md += items.map((it: any) => `- ${it.label}`).join('\n')
  } else if (widget.type === 'pros_cons') {
    const pros = data.pros || []
    const cons = data.cons || []
    md += `**Pros:**\n` + pros.map((it: any) => `- ${it.label}`).join('\n') + `\n\n**Cons:**\n` + cons.map((it: any) => `- ${it.label}`).join('\n')
  } else {
    md += JSON.stringify(data, null, 2)
  }
  return md
}

/** One markdown document from every member, in group order, for group-wide "Copy as Markdown". */
export function widgetsToMarkdown(widgets: readonly { title: string; type: string; data: unknown }[]): string {
  return widgets.map(widgetToMarkdown).join('\n\n---\n\n')
}
