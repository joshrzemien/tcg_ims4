import { describe, expect, it } from 'vitest'
import {
  chunkArray,
  dedupeByKey,
  loadAllPages,
} from '../../../../convex/lib/collections'

describe('chunkArray', () => {
  it('chunks arrays using the requested size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('guards against invalid chunk sizes', () => {
    expect(chunkArray([1, 2, 3], 0)).toEqual([[1], [2], [3]])
  })
})

describe('dedupeByKey', () => {
  it('keeps the last item for a repeated key', () => {
    const rows = dedupeByKey(
      [
        { key: 'a', value: 1 },
        { key: 'b', value: 2 },
        { key: 'a', value: 3 },
      ],
      (row) => row.key,
    )

    expect(rows).toEqual([
      { key: 'a', value: 3 },
      { key: 'b', value: 2 },
    ])
  })
})

describe('loadAllPages', () => {
  it('accumulates paginated results until done', async () => {
    const calls: Array<string | null> = []

    const values = await loadAllPages({
      pageSize: 2,
      loadPage: ({ cursor, numItems }) => {
        calls.push(cursor)

        if (!cursor) {
          return Promise.resolve({
            page: [1, 2].slice(0, numItems),
            continueCursor: 'page-2',
            isDone: false,
          })
        }

        return Promise.resolve({
          page: [3],
          continueCursor: null,
          isDone: true,
        })
      },
    })

    expect(values).toEqual([1, 2, 3])
    expect(calls).toEqual([null, 'page-2'])
  })
})
