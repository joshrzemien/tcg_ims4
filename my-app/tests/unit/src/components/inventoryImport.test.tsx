// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { api } from '../../../../convex/_generated/api'
import { InventoryDashboard } from '../../../../src/features/inventory/InventoryDashboard'

const {
  useActionMock,
  useMutationMock,
  useQueryMock,
} = vi.hoisted(() => ({
  useActionMock: vi.fn(),
  useMutationMock: vi.fn(),
  useQueryMock: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useAction: (...args: Array<unknown>) => useActionMock(...args),
  useMutation: (...args: Array<unknown>) => useMutationMock(...args),
  useQuery: (...args: Array<unknown>) => useQueryMock(...args),
}))

describe('inventory csv import modal', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    useActionMock.mockReset()
    useMutationMock.mockReset()
    useQueryMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)

    useMutationMock.mockImplementation(() => vi.fn())
    useQueryMock.mockImplementation((queryRef: unknown) => {
      if (queryRef === api.inventory.stock.getAggregateSummary) {
        return {
          itemCount: 0,
          totalQuantity: 0,
          totalMarketValueCents: 0,
          totalLocationCount: 0,
          byType: {
            single: {
              itemCount: 0,
              totalQuantity: 0,
              totalMarketValueCents: 0,
              totalLocationCount: 0,
            },
            sealed: {
              itemCount: 0,
              totalQuantity: 0,
              totalMarketValueCents: 0,
              totalLocationCount: 0,
            },
            graded: {
              itemCount: 0,
              totalQuantity: 0,
              totalMarketValueCents: 0,
              totalLocationCount: 0,
            },
          },
        }
      }

      if (queryRef === api.inventory.stock.listAggregateByClass) {
        return []
      }

      if (queryRef === api.inventory.locations.listAssignable) {
        return []
      }

      return undefined
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('opens the import modal, previews a csv upload, and commits the import', async () => {
    const generateUploadUrl = vi.fn().mockResolvedValue('https://upload.test')
    const discardUpload = vi.fn().mockResolvedValue(true)
    const previewCsvUpload = vi.fn().mockResolvedValue({
      totalRows: 3,
      matchedRows: 2,
      skippedRows: 1,
      aggregatedRows: 1,
      totalQuantity: 5,
      locationsToCreate: [
        {
          code: 'IMPORT:TCGPLAYER',
          displayName: 'tcgplayer',
        },
      ],
      setsToTrack: [
        {
          setKey: 'lea',
          setName: 'Alpha',
        },
      ],
      skippedReasonCounts: [{ reason: 'unknown_set', count: 1 }],
      skippedRowSamples: [
        {
          rowNumber: 4,
          setName: 'Unknown',
          name: 'Mystery Card',
          reason: 'unknown_set',
          message: 'Could not resolve catalog set Unknown.',
        },
      ],
      aggregatedRowSamples: [
        {
          locationCode: 'IMPORT:TCGPLAYER',
          catalogProductKey: 'product-1',
          catalogSkuKey: 'sku-1',
          quantity: 5,
          setName: 'Alpha',
          productName: 'Black Lotus',
        },
      ],
    })
    const commitCsvUpload = vi.fn().mockResolvedValue({
      importedContentRows: 1,
      receivedQuantity: 5,
      createdLocationCount: 1,
      createdRuleCount: 1,
      reactivatedRuleCount: 0,
      skippedRows: 1,
    })

    useActionMock.mockImplementation((ref: unknown) => {
      const functionName = getFunctionName(ref as never)

      if (functionName === 'inventory/imports:generateUploadUrl') {
        return generateUploadUrl
      }
      if (functionName === 'inventory/imports:discardUpload') {
        return discardUpload
      }
      if (functionName === 'inventory/imports:previewCsvUpload') {
        return previewCsvUpload
      }
      if (functionName === 'inventory/imports:commitCsvUpload') {
        return commitCsvUpload
      }

      return vi.fn()
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: 'storage-1' }),
    })

    render(<InventoryDashboard />)

    fireEvent.click(screen.getByRole('button', { name: 'Import CSV' }))

    const fileInput = screen.getByLabelText('CSV file')
    const file = new File(
      ['Set,Set Code,Name,Quantity,Remarks,SKU Id,ID Product,Printing,Condition,Language'],
      'inventory.csv',
      { type: 'text/csv' },
    )

    fireEvent.change(fileInput, {
      target: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(previewCsvUpload).toHaveBeenCalledWith({ storageId: 'storage-1' })
    })

    expect(screen.getAllByText('IMPORT:TCGPLAYER').length).toBeGreaterThan(0)
    expect(screen.getByText('Black Lotus')).toBeTruthy()
    expect(screen.getByText('Could not resolve catalog set Unknown.')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('button', { name: 'Import CSV' }).at(-1)!)

    await waitFor(() => {
      expect(commitCsvUpload).toHaveBeenCalledWith({ storageId: 'storage-1' })
    })

    expect(
      screen.getByText(
        'Imported 1 inventory rows / 5 cards. Created 1 locations and 1 tracking rules updates. Skipped 1 rows.',
      ),
    ).toBeTruthy()
  })
})
