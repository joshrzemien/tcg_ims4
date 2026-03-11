import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export function StatusBadge({
  children,
  className,
}: {
  children: ReactNode
  className: string
}) {
  return (
    <span
      className={cn(
        'inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        className,
      )}
    >
      {children}
    </span>
  )
}
