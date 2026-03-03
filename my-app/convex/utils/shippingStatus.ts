export function normalizeShippingStatus(status: unknown): string {
  if (typeof status !== "string") return "unknown";
  const normalized = status.trim().toLowerCase();
  return normalized === "" ? "unknown" : normalized;
}
