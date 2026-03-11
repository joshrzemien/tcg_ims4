export async function paginateFilteredQuery<T>({
  paginationOpts,
  fetchPage,
  predicate,
}: {
  paginationOpts: {
    cursor: string | null
    numItems: number
  }
  fetchPage: (paginationOpts: {
    cursor: string | null
    numItems: number
  }) => Promise<{
    page: Array<T>
    continueCursor: string | null
    isDone: boolean
  }>
  predicate: (value: T) => boolean
}) {
  let cursor = paginationOpts.cursor
  let continueCursor: string | null = cursor
  let isDone = false
  let page: Array<T> = []
  let attempts = 0

  do {
    const next = await fetchPage({
      cursor,
      numItems: paginationOpts.numItems,
    })
    page = next.page.filter(predicate)
    continueCursor = next.continueCursor
    isDone = next.isDone
    cursor = next.continueCursor
    attempts += 1
  } while (page.length === 0 && !isDone && attempts < 5)

  return {
    page,
    continueCursor,
    isDone,
  }
}
