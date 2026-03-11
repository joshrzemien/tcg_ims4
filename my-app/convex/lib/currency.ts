export function dollarsToCents(amount: number | undefined | null): number {
  if (amount == null) {
    return 0
  }

  return Math.round(amount * 100)
}
