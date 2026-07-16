import type { ReactNode } from 'react'

interface IconButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

export function IconButton({ label, onClick, disabled = false, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-300 transition-[background-color,color,transform,scale] hover:bg-neutral-700/60 hover:text-white active:scale-[0.94] active:bg-neutral-600/60 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  )
}
