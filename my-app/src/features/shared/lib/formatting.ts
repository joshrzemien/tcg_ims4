const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
})

const shortDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const mediumDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

export function formatCents(cents: number | undefined): string {
  if (typeof cents !== 'number') {
    return '--'
  }

  return usdFormatter.format(cents / 100)
}

export function formatDate(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number') {
    return '--'
  }

  return shortDateFormatter.format(new Date(timestamp))
}

export function formatDateTime(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number') {
    return '--'
  }

  return shortDateTimeFormatter.format(new Date(timestamp))
}

export function formatDateTimeLong(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number') {
    return '--'
  }

  return mediumDateTimeFormatter.format(new Date(timestamp))
}

export function relativeTime(timestamp: number | undefined): string {
  if (typeof timestamp !== 'number') {
    return 'never'
  }

  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60_000)

  if (minutes < 1) {
    return 'just now'
  }
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours}h ago`
  }

  return `${Math.floor(hours / 24)}d ago`
}
