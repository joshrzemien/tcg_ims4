export function LoadingSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="rounded border bg-card">
      <div className="h-8 border-b bg-muted/10" />
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-8 animate-pulse bg-muted/5" />
        ))}
      </div>
    </div>
  )
}

export function LoadingTable({ rows = 8, statCards = 4 }: { rows?: number; statCards?: number }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: statCards }).map((_, index) => (
          <div key={index} className="h-14 animate-pulse rounded border bg-muted/20" />
        ))}
      </div>
      <div className="rounded border bg-card">
        <div className="h-8 border-b bg-muted/10" />
        <div className="space-y-px">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="h-8 animate-pulse bg-muted/5" />
          ))}
        </div>
      </div>
    </div>
  )
}
