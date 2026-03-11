// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StandaloneShipmentList } from '../../../../src/features/postage/components/StandaloneShipmentList'

describe('standalone shipment print queue UI', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders latest print status and queues reprints from the list', () => {
    const onQueueReprint = vi.fn()
    const onRefund = vi.fn()
    const shipmentId = 'shipment-1' as never

    render(
      <StandaloneShipmentList
        shipments={[
          {
            _id: shipmentId,
            source: 'standalone',
            status: 'purchased',
            shippingMethod: 'Letter',
            createdAt: 1_700_000_000_000,
            updatedAt: 1_700_000_000_000,
            labelUrl: 'https://label.test',
            carrier: 'USPS',
            service: 'Ground Advantage',
            rateCents: 129,
            refundStatus: undefined,
            toAddress: {
              name: 'Test Person',
              street1: '123 Main St',
              city: 'Tampa',
              state: 'FL',
              zip: '33602',
              country: 'US',
            },
          } as never,
        ]}
        latestPrintJobsByShipmentId={
          new Map([
            [
              shipmentId,
              {
                _id: 'print-job-1' as never,
                stationKey: 'default-label-station',
                jobType: 'shipping_label',
                status: 'failed',
                shipmentId,
                requestedAt: 1_700_000_000_000,
                failureMessage: 'Printer offline',
                metadata: {},
              },
            ],
          ])
        }
        queueingShipmentId={null}
        refundingShipmentId={null}
        onQueueReprint={onQueueReprint}
        onRefund={onRefund}
      />,
    )

    expect(screen.getByText('failed')).toBeTruthy()
    expect(screen.getByText('Printer offline')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Queue Reprint' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Label' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Queue Reprint' }))

    expect(onQueueReprint).toHaveBeenCalledTimes(1)
  })
})
