export async function inBatches<T, TResult>(
  items: Array<T>,
  size: number,
  fn: (item: T) => Promise<TResult | null>,
): Promise<Array<TResult>> {
  const results: Array<TResult> = []

  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size)
    const settled = await Promise.all(batch.map(fn))

    for (const result of settled) {
      if (result != null) {
        results.push(result)
      }
    }
  }

  return results
}
