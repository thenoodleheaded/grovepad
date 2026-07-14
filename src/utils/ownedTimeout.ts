export interface OwnedTimeout {
  schedule: (callback: () => void, delayMs: number) => void
  cancel: () => void
  dispose: () => void
}

/** One replaceable timeout whose lifetime belongs to its caller. */
export function createOwnedTimeout(): OwnedTimeout {
  let handle: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const cancel = () => {
    if (handle !== null) clearTimeout(handle)
    handle = null
  }

  return {
    schedule(callback, delayMs) {
      if (disposed) return
      cancel()
      handle = setTimeout(() => {
        handle = null
        if (!disposed) callback()
      }, delayMs)
    },
    cancel,
    dispose() {
      disposed = true
      cancel()
    },
  }
}
