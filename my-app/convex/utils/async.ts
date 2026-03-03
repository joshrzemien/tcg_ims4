// convex/utils/async.ts
export async function inBatches<T, R>(
    items: T[],
    size: number,
    fn: (item: T) => Promise<R | null>
  ): Promise<R[]> {
    const results: R[] = [];
    for (let i = 0; i < items.length; i += size) {
      const batch = items.slice(i, i + size);
      const settled = await Promise.all(batch.map(fn));
      for (const r of settled) {
        if (r != null) results.push(r);
      }
    }
    return results;
  }