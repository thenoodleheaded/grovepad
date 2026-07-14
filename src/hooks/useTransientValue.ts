import { useCallback, useEffect, useRef, useState } from 'react'
import { createOwnedTimeout } from '../utils/ownedTimeout'

/** Short-lived UI state with replacement and unmount cancellation built in. */
export function useTransientValue<T>(resetValue: T) {
  const [value, setValue] = useState(resetValue)
  const timeoutRef = useRef<ReturnType<typeof createOwnedTimeout> | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    mountedRef.current = true
    const timeout = createOwnedTimeout()
    timeoutRef.current = timeout
    return () => {
      mountedRef.current = false
      timeout.dispose()
      if (timeoutRef.current === timeout) timeoutRef.current = null
    }
  }, [])

  const show = useCallback((nextValue: T, durationMs: number) => {
    if (!mountedRef.current) return
    setValue(nextValue)
    timeoutRef.current?.schedule(() => setValue(resetValue), durationMs)
  }, [resetValue])

  return [value, show] as const
}
