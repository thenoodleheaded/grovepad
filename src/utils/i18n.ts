type Replacements = Record<string, string | number>

/** Translation boundary for new UI. English remains the only bundled locale;
 * callers can migrate incrementally without changing component contracts. */
export function t(_key: string, fallback: string, replacements?: Replacements): string {
  if (!replacements) return fallback
  return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(replacements, name) ? String(replacements[name]) : match,
  )
}
