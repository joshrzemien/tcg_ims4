import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  buildInventoryLocation,
} from '../../../helpers/convexFactories'

import { loadContentByIdentityKey } from '../../../../convex/inventory/loaders/contents'
import { receiveCatalogContentIntoLocation } from '../../../../convex/inventory/workflows/contentReceipts'

vi.mock('../../../../convex/inventory/loaders/contents', () => ({
  loadContentByIdentityKey: vi.fn(),
}))

describe('receiveCatalogContentIntoLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates a new single-content record and receive event', async () => {
    vi.mocked(loadContentByIdentityKey).mockResolvedValue(null)

    const insert = vi
      .fn()
      .mockResolvedValueOnce('content-1')
      .mockResolvedValueOnce('event-1')
    const patch = vi.fn()
    const ctx = { db: { insert, patch } }

    const contentId = await receiveCatalogContentIntoLocation(ctx as never, {
      location: buildInventoryLocation({ _id: 'location-1', code: '01:01' }),
      inventoryClass: 'single',
      catalogProductKey: 'product-1',
      catalogSkuKey: 'sku-1',
      quantity: 2,
      workflowStatus: 'available',
      actor: 'tester',
      reasonCode: 'receive_test',
    })

    expect(contentId).toBe('content-1')
    expect(insert).toHaveBeenNthCalledWith(
      1,
      'inventoryLocationContents',
      expect.objectContaining({
        locationId: 'location-1',
        inventoryClass: 'single',
        catalogProductKey: 'product-1',
        catalogSkuKey: 'sku-1',
        quantity: 2,
        workflowStatus: 'available',
        contentIdentityKey: 'catalog|location-1|single|product-1|sku-1',
      }),
    )
    expect(insert).toHaveBeenNthCalledWith(
      2,
      'inventoryEvents',
      expect.objectContaining({
        eventType: 'receive',
        actor: 'tester',
        reasonCode: 'receive_test',
        targetContentId: 'content-1',
        toLocationId: 'location-1',
        inventoryClass: 'single',
        quantityDelta: 2,
        quantityBefore: 0,
        quantityAfter: 2,
      }),
    )
    expect(patch).not.toHaveBeenCalled()
  })

  it('creates graded content with a pending identity key', async () => {
    const insert = vi
      .fn()
      .mockResolvedValueOnce('content-graded')
      .mockResolvedValueOnce('event-graded')
    const patch = vi.fn()
    const ctx = { db: { insert, patch } }

    const contentId = await receiveCatalogContentIntoLocation(ctx as never, {
      location: buildInventoryLocation({ _id: 'location-1', code: '01:01' }),
      inventoryClass: 'graded',
      catalogProductKey: 'product-1',
      quantity: 1,
    })

    expect(contentId).toBe('content-graded')
    expect(patch).toHaveBeenCalledWith('inventoryLocationContents', 'content-graded', {
      contentIdentityKey: 'graded|pending|content-graded',
    })
  })
})
