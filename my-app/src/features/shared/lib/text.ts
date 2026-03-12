export function humanizeToken(value: string): string {
  return value.replaceAll('_', ' ')
}
