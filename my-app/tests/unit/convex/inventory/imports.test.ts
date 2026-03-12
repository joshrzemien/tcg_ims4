import { describe, expect, it } from 'vitest'

import {
  assertCsvImportHeaders,
  parseCsvImportRows,
} from '../../../../convex/inventory/imports'
import {
  buildCsvImportPlan,
  resolveImportSetForRow,
  sanitizeImportLocationCode,
  summarizeSkippedRows,
} from '../../../../convex/inventory/importsSupport'

describe('convex/inventory imports helpers', () => {
  it('validates required CSV headers', () => {
    expect(() =>
      assertCsvImportHeaders([
        'Set',
        'Set Code',
        'Name',
        'Quantity',
        'Remarks',
        'SKU Id',
        'ID Product',
        'Printing',
        'Condition',
        'Language',
      ]),
    ).not.toThrow()

    expect(() =>
      assertCsvImportHeaders(['Set', 'Name', 'Quantity']),
    ).toThrow('CSV is missing required headers')
  })

  it('parses rows from a valid csv', () => {
    const rows = parseCsvImportRows(
      [
        'Set,Set Code,Name,Quantity,Remarks,SKU Id,ID Product,Printing,Condition,Language',
        'Alpha,LEA,Black Lotus,2,tcgplayer,1001,1000,Normal,NM,EN',
      ].join('\n'),
    )

    expect(rows).toEqual([
      {
        rowNumber: 2,
        setName: 'Alpha',
        setCode: 'LEA',
        name: 'Black Lotus',
        quantity: 2,
        remarks: 'tcgplayer',
        skuId: 1001,
        productId: 1000,
        printing: 'Normal',
        condition: 'NM',
        language: 'EN',
      },
    ])
  })

  it('sanitizes remarks into stable import location codes', () => {
    expect(sanitizeImportLocationCode('chaos test batch 25')).toBe(
      'IMPORT:CHAOS_TEST_BATCH_25',
    )
  })

  it('resolves sets by exact name first and abbreviation fallback second', () => {
    const alpha = {
      key: 'lea',
      name: 'Alpha',
      abbreviation: 'LEA',
      inRuleScope: false,
    }
    const setsByName = new Map([['Alpha', [alpha]]])
    const setsByCode = new Map([['LEA', [alpha]]])

    expect(
      resolveImportSetForRow(
        { setName: 'Alpha', setCode: undefined },
        setsByName,
        setsByCode,
      )?.key,
    ).toBe('lea')

    expect(
      resolveImportSetForRow(
        { setName: 'Limited Edition Alpha', setCode: 'LEA' },
        new Map(),
        setsByCode,
      )?.key,
    ).toBe('lea')
  })

  it('builds an additive import plan, dedupes rows, and identifies new set tracking work', () => {
    const plan = buildCsvImportPlan({
      rows: [
        {
          rowNumber: 2,
          setName: 'Alpha',
          setCode: 'LEA',
          name: 'Black Lotus',
          quantity: 2,
          remarks: 'tcgplayer',
          skuId: 1001,
          productId: 1000,
          printing: 'Normal',
          condition: 'NM',
          language: 'EN',
        },
        {
          rowNumber: 3,
          setName: 'Alpha',
          setCode: 'LEA',
          name: 'Black Lotus',
          quantity: 3,
          remarks: 'tcgplayer',
          skuId: 1001,
          productId: 1000,
          printing: 'Normal',
          condition: 'NM',
          language: 'EN',
        },
        {
          rowNumber: 4,
          setName: 'Unknown',
          setCode: 'UNK',
          name: 'Mystery Card',
          quantity: 1,
          remarks: 'tcgplayer',
          skuId: 9999,
          productId: 9998,
          printing: 'Normal',
          condition: 'NM',
          language: 'EN',
        },
      ],
      sets: [
        {
          key: 'lea',
          name: 'Alpha',
          abbreviation: 'LEA',
          inRuleScope: false,
        },
      ],
      products: [
        {
          key: 'product-1',
          setKey: 'lea',
          tcgplayerProductId: 1000,
          name: 'Black Lotus',
          cleanName: 'Black Lotus',
        },
      ],
      skus: [
        {
          key: 'sku-1',
          setKey: 'lea',
          catalogProductKey: 'product-1',
          tcgplayerSku: 1001,
        },
      ],
      existingLocations: [],
    })

    expect(plan.totalRows).toBe(3)
    expect(plan.matchedRowCount).toBe(2)
    expect(plan.totalQuantity).toBe(5)
    expect(plan.aggregatedRows).toEqual([
      expect.objectContaining({
        locationCode: 'IMPORT:TCGPLAYER',
        catalogProductKey: 'product-1',
        catalogSkuKey: 'sku-1',
        quantity: 5,
      }),
    ])
    expect(plan.locationsToCreate).toEqual([
      {
        code: 'IMPORT:TCGPLAYER',
        displayName: 'tcgplayer',
      },
    ])
    expect(plan.setsToTrack).toEqual([
      {
        setKey: 'lea',
        setName: 'Alpha',
      },
    ])
    expect(summarizeSkippedRows(plan.skippedRows)).toEqual([
      { reason: 'unknown_set', count: 1 },
    ])
  })

  it('marks resolved but unmatched sets for tracking before sku resolution succeeds', () => {
    const plan = buildCsvImportPlan({
      rows: [
        {
          rowNumber: 2,
          setName: 'Battle for Zendikar',
          setCode: 'BFZ',
          name: 'Murasa Ranger',
          quantity: 1,
          remarks: 'tcgplayer',
          skuId: 2957086,
          productId: 999001,
          printing: 'Normal',
          condition: 'NM',
          language: 'EN',
        },
      ],
      sets: [
        {
          key: 'bfz',
          name: 'Battle for Zendikar',
          abbreviation: 'BFZ',
          inRuleScope: false,
        },
      ],
      products: [],
      skus: [],
      existingLocations: [],
    })

    expect(plan.matchedRowCount).toBe(0)
    expect(plan.skippedRows).toEqual([
      expect.objectContaining({
        reason: 'unknown_sku',
      }),
    ])
    expect(plan.setsToTrack).toEqual([
      {
        setKey: 'bfz',
        setName: 'Battle for Zendikar',
      },
    ])
  })
})
