import { LoaderCircle, Search, X } from 'lucide-react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import { cn } from '~/lib/utils'

type SearchFieldSize = 'xs' | 'sm'

const sizeClasses: Record<SearchFieldSize, string> = {
  xs: 'h-7 text-xs',
  sm: 'h-8 text-xs',
}

type SearchFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'size' | 'type' | 'value'
> & {
  value: string
  onValueChange: (value: string) => void
  onClear: () => void
  helperText?: ReactNode
  isLoading?: boolean
  size?: SearchFieldSize
}

export function SearchField({
  value,
  onValueChange,
  onClear,
  helperText,
  isLoading = false,
  size = 'sm',
  className,
  ...props
}: SearchFieldProps) {
  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
        <input
          {...props}
          type="search"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className={cn(
            'w-full rounded border bg-background pl-7 text-foreground placeholder:text-muted-foreground/60 focus:border-ring focus:outline-none',
            value.length > 0 || isLoading ? 'pr-7' : 'pr-2',
            sizeClasses[size],
            className,
          )}
        />
        {isLoading ? (
          <LoaderCircle className="pointer-events-none absolute right-2 top-1/2 size-3 animate-spin -translate-y-1/2 text-muted-foreground" />
        ) : value.length > 0 ? (
          <button
            type="button"
            className="absolute right-1 top-1/2 rounded p-1 -translate-y-1/2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={onClear}
            aria-label="Clear search"
          >
            <X className="size-3" />
          </button>
        ) : null}
      </div>
      {helperText ? (
        <p className="text-[10px] text-muted-foreground">{helperText}</p>
      ) : null}
    </div>
  )
}
