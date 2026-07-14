import { useRef } from 'react'

/**
 * Legacy no-op ref hook.
 *
 * The field-wiring subsystem (bindable-field ports, wires, and the
 * propagation engine) was removed — dependencies are now expressed only
 * through regular relation lines. Widget modules still call this to tag a
 * row (`const countRowRef = useFieldAnchor('count')`), so it survives as a
 * plain ref that registers nothing. Kept rather than deleted from ~50 call
 * sites; the argument is ignored.
 */
export function useFieldAnchor<T extends HTMLElement = HTMLDivElement>(_fieldKey: string) {
  return useRef<T | null>(null)
}
