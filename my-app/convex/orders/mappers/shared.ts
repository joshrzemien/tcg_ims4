export function dollarsToCents(amount: number | undefined | null): number {
  if (amount == null) return 0;
  return Math.round(amount * 100);
}

export function toTimestamp(input: string | undefined | null): number {
  if (!input) return Date.now();
  return new Date(input).getTime();
}

export function shouldMarkOrderFulfilled(status: string): boolean {
  return (
    status === "shipped" ||
    status === "in_transit" ||
    status === "out_for_delivery" ||
    status === "delivered" ||
    status === "available_for_pickup"
  );
}
