import { X } from 'lucide-react'
import { cn } from '~/lib/utils'

export type FlashMessage =
  | {
      kind: 'success' | 'error'
      text: string
    }
  | null

export function FlashBanner({
  message,
  onDismiss,
}: {
  message: FlashMessage
  onDismiss: () => void
}) {
  if (!message) {
    return null
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded border px-3 py-2 text-xs font-medium',
        message.kind === 'success'
          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
          : 'border-red-500/20 bg-red-500/5 text-red-400',
      )}
    >
      <span className="flex-1">{message.text}</span>
      <button type="button" onClick={onDismiss} className="p-0.5">
        <X className="size-3" />
      </button>
    </div>
  )
}
