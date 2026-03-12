import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

export function DialogShell({
  title,
  description,
  onClose,
  children,
  widthClass = 'max-w-2xl',
}: {
  title: string
  description: string
  onClose: () => void
  children: ReactNode
  widthClass?: string
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className={cn('w-full rounded-lg border bg-card shadow-2xl', widthClass)}>
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          </div>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="size-3.5" />
          </button>
        </header>
        <div className="max-h-[80vh] overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  )
}
