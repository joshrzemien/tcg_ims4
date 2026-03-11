import { describe, expect, it } from 'vitest'

import {
  buildInventoryLocation,
  buildInventoryLocationContent,
} from '../../../helpers/convexFactories'
import { buildInventoryRowsForOrderItem } from '../../../../convex/orders/readModels/pickContext'

describe('convex/orders pick context rows', () => {
  it('sorts available rows ahead of other workflow states and by location code', () => {
    const availableLocation = buildInventoryLocation({
      _id: 'loc-a',
      code: '01:01',
    })
    const processingLocation = buildInventoryLocation({
      _id: 'loc-b',
      code: '01:02',
    })

    const rows = buildInventoryRowsForOrderItem(
      [
        buildInventoryLocationContent({
          _id: 'content-2',
          locationId: processingLocation._id,
          workflowStatus: 'processing',
          updatedAt: 2,
        }),
        buildInventoryLocationContent({
          _id: 'content-1',
          locationId: availableLocation._id,
          workflowStatus: 'available',
          updatedAt: 1,
        }),
      ],
      new Map([
        [availableLocation._id, availableLocation],
        [processingLocation._id, processingLocation],
      ]),
    )

    expect(rows.map((row) => row.contentId)).toEqual(['content-1', 'content-2'])
  })
})
