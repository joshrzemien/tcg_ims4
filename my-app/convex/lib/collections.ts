export function chunkArray<T>(items: Array<T>, size: number): Array<Array<T>> {
  const normalizedSize = Math.max(1, Math.floor(size))
  const chunks: Array<Array<T>> = []

  for (let index = 0; index < items.length; index += normalizedSize) {
    chunks.push(items.slice(index, index + normalizedSize))
  }

  return chunks
}

export function dedupeByKey<T>(
  items: Array<T>,
  getKey: (item: T) => string,
): Array<T> {
  const byKey = new Map<string, T>()

  for (const item of items) {
    byKey.set(getKey(item), item)
  }

  return [...byKey.values()]
}

export async function loadAllPages<T>({
  cursor: initialCursor = null,
  pageSize,
  loadPage,
}: {
  cursor?: string | null
  pageSize: number
  loadPage: (paginationOpts: {
    cursor: string | null
    numItems: number
  }) => Promise<{
    page: Array<T>
    continueCursor: string | null
    isDone: boolean
  }>
}): Promise<Array<T>> {
  const results: Array<T> = []
  let cursor = initialCursor
  let isDone = false

  while (!isDone) {
    const page = await loadPage({
      cursor,
      numItems: pageSize,
    })

    results.push(...page.page)
    cursor = page.continueCursor
    isDone = page.isDone
  }

  return results
}
