import { useCallback, useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { EMPTY_ROWS } from './constants'
import { ManageLabelsModal } from './components/ManageLabelsModal'
import { OrderDetailModal } from './components/OrderDetailModal'
import { OrdersDataTable } from './components/OrdersDataTable'
import { PurchaseLabelModal } from './components/PurchaseLabelModal'
import { StatsBar } from './components/StatsBar'
import { downloadDocument } from './lib/documents'
import { canRepurchaseShipment } from './lib/shipment'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { Doc } from '../../../convex/_generated/dataModel'
import type { RowSelectionState } from '@tanstack/react-table'
import type {
  ExportDocumentResult,
  ExportKind,
  FulfillmentResult,
  ManagedShipment,
  OrderRow,
  OrdersPage,
  PresetFilter,
  PurchaseQuote,
  PurchaseResult,
} from './types'
import { humanizeToken as humanize } from '~/features/shared/lib/text'
import { getErrorMessage } from '~/features/shared/lib/errors'
import { LoadingTable } from '~/features/shared/components/LoadingState'
import { FlashBanner } from '~/features/shared/components/FlashBanner'

export function OrdersTable() {
  const [activeFilter, setActiveFilter] = useState<PresetFilter>('unfulfilled')
  const [filterReferenceTime, setFilterReferenceTime] = useState(() => Date.now())
  const [pageSize, setPageSize] = useState(20)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageCursors, setPageCursors] = useState<Array<string | null>>([null])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isFulfilling, setIsFulfilling] = useState(false)
  const [isExportingPullSheets, setIsExportingPullSheets] = useState(false)
  const [isExportingPackingSlips, setIsExportingPackingSlips] = useState(false)
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [purchaseOrder, setPurchaseOrder] = useState<OrderRow | null>(null)
  const [purchaseQuote, setPurchaseQuote] = useState<PurchaseQuote | null>(null)
  const [allowUnverifiedAddress, setAllowUnverifiedAddress] = useState(false)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [detailOrder, setDetailOrder] = useState<OrderRow | null>(null)
  const [managedOrder, setManagedOrder] = useState<OrderRow | null>(null)
  const [refundError, setRefundError] = useState<string | null>(null)
  const [refundingShipmentId, setRefundingShipmentId] = useState<
    Doc<'shipments'>['_id'] | null
  >(null)

  const cutoffTimestamp = useMemo(() => {
    switch (activeFilter) {
      case 'last7':
        return filterReferenceTime - 7 * 24 * 60 * 60 * 1000
      case 'last30':
        return filterReferenceTime - 30 * 24 * 60 * 60 * 1000
      default:
        return undefined
    }
  }, [activeFilter, filterReferenceTime])

  const ordersQueryArgs = useMemo(
    () => ({
      filter: activeFilter,
      ...(typeof cutoffTimestamp === 'number' ? { cutoffTimestamp } : {}),
      paginationOpts: {
        cursor: pageCursors[pageIndex] ?? null,
        numItems: pageSize,
      },
    }),
    [activeFilter, cutoffTimestamp, pageCursors, pageIndex, pageSize],
  )

  const ordersPage = useQuery(api.orders.queries.listPage, ordersQueryArgs) as
    | OrdersPage
    | undefined
  const exportPullSheets = useAction(api.orders.actions.exportPullSheets)
  const exportPackingSlips = useAction(api.orders.actions.exportPackingSlips)
  const previewPurchase = useAction(api.shipments.actions.previewPurchase)
  const purchaseLabel = useAction(api.shipments.actions.purchaseLabel)
  const refundLabel = useAction(api.shipments.actions.refundLabel)
  const setFulfillmentStatus = useAction(api.shipments.actions.setFulfillmentStatus)

  const rows = ordersPage?.page ?? EMPTY_ROWS
  const isOrdersPageLoading = ordersPage === undefined
  const isOnLastPage = ordersPage?.isDone ?? true
  const nextPageCursor = ordersPage?.continueCursor ?? null

  const currentManagedOrder = managedOrder
    ? rows.find((order) => order._id === managedOrder._id) ?? managedOrder
    : null
  const currentDetailOrder = detailOrder
    ? rows.find((order) => order._id === detailOrder._id) ?? detailOrder
    : null

  const orderPickContext = useQuery(
    api.orders.queries.getPickContext,
    currentDetailOrder ? { orderId: currentDetailOrder._id } : 'skip',
  )
  const managedOrderShipments = useQuery(
    api.shipments.queries.getByOrderId,
    currentManagedOrder ? { orderId: currentManagedOrder._id } : 'skip',
  )

  const sortedManagedShipments = useMemo(
    () =>
      [...(managedOrderShipments ?? [])].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
          return right.createdAt - left.createdAt
        }
        return right.updatedAt - left.updatedAt
      }),
    [managedOrderShipments],
  )

  const selectedOrders = useMemo(
    () => rows.filter((order) => rowSelection[order._id] === true),
    [rows, rowSelection],
  )
  const selectedCount = selectedOrders.length
  const selectedTcgplayerCount = selectedOrders.filter(
    (order) => order.channel === 'tcgplayer',
  ).length
  const selectedNonTcgplayerCount = selectedCount - selectedTcgplayerCount
  const visibleRangeStart = rows.length === 0 ? 0 : pageIndex * pageSize + 1
  const visibleRangeEnd = pageIndex * pageSize + rows.length
  const canRepurchaseManaged = canRepurchaseShipment(currentManagedOrder?.activeShipment)

  function resetPageWindow(nextFilter?: PresetFilter) {
    setRowSelection({})
    setPageIndex(0)
    setPageCursors([null])
    if (nextFilter) {
      setActiveFilter(nextFilter)
      setFilterReferenceTime(Date.now())
    }
  }

  const openPurchaseModal = useCallback(
    async (order: OrderRow) => {
      setFlashMessage(null)
      setPurchaseOrder(order)
      setPurchaseQuote(null)
      setAllowUnverifiedAddress(false)
      setPurchaseError(null)
      setIsPreviewing(true)

      try {
        const quote = (await previewPurchase({
          orderId: order._id,
        })) as PurchaseQuote
        setPurchaseQuote(quote)
      } catch (error) {
        setPurchaseError(getErrorMessage(error))
      } finally {
        setIsPreviewing(false)
      }
    },
    [previewPurchase],
  )

  function closePurchaseModal() {
    setPurchaseOrder(null)
    setPurchaseQuote(null)
    setAllowUnverifiedAddress(false)
    setPurchaseError(null)
    setIsPreviewing(false)
    setIsPurchasing(false)
  }

  const openManageModal = useCallback((order: OrderRow) => {
    setFlashMessage(null)
    setManagedOrder(order)
    setRefundError(null)
  }, [])

  const openDetailModal = useCallback((order: OrderRow) => {
    setFlashMessage(null)
    setDetailOrder(order)
  }, [])

  function closeManageModal() {
    setManagedOrder(null)
    setRefundError(null)
    setRefundingShipmentId(null)
  }

  function closeDetailModal() {
    setDetailOrder(null)
  }

  async function handlePurchaseSubmit() {
    if (!purchaseOrder || !purchaseQuote) {
      return
    }

    setIsPurchasing(true)
    setPurchaseError(null)

    try {
      const purchased = (await purchaseLabel({
        orderId: purchaseOrder._id,
        expectedRateCents: purchaseQuote.rate.rateCents,
        allowUnverifiedAddress,
      })) as PurchaseResult

      setFlashMessage({
        kind: 'success',
        text: `Purchased ${purchaseQuote.rate.carrier} ${purchaseQuote.rate.service} for ${purchaseOrder.orderNumber}.`,
      })
      closePurchaseModal()

      if (typeof purchased.labelUrl === 'string') {
        window.open(purchased.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      setPurchaseError(getErrorMessage(error))
    } finally {
      setIsPurchasing(false)
    }
  }

  async function handleRefund(shipment: ManagedShipment) {
    if (!currentManagedOrder) {
      return
    }

    setRefundingShipmentId(shipment._id)
    setRefundError(null)

    try {
      const refund = await refundLabel({
        orderId: currentManagedOrder._id,
        easypostShipmentId: shipment.easypostShipmentId,
      })

      setFlashMessage({
        kind: 'success',
        text: `Refund ${humanize(refund.easypostRefundStatus)} for ${currentManagedOrder.orderNumber} (${shipment.easypostShipmentId}).`,
      })
    } catch (error) {
      setRefundError(getErrorMessage(error))
    } finally {
      setRefundingShipmentId(null)
    }
  }

  async function handleRepurchaseFromManage() {
    if (!currentManagedOrder) {
      return
    }

    closeManageModal()
    await openPurchaseModal(currentManagedOrder)
  }

  async function handleMarkFulfilled() {
    if (selectedCount === 0) {
      return
    }

    setIsFulfilling(true)
    try {
      const results = (await Promise.all(
        Object.keys(rowSelection).map((orderId) =>
          setFulfillmentStatus({ orderId: orderId as never, fulfilled: true }),
        ),
      )) as Array<FulfillmentResult>

      const warnings = results
        .map((result) => result.warning)
        .filter((warning): warning is string => typeof warning === 'string')

      setFlashMessage({
        kind: 'success',
        text: `Marked ${selectedCount} order${selectedCount === 1 ? '' : 's'} as fulfilled.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`,
      })
      setRowSelection({})
    } catch (error) {
      setFlashMessage({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setIsFulfilling(false)
    }
  }

  function getTimezoneOffsetHours() {
    return -new Date().getTimezoneOffset() / 60
  }

  async function handleExportSelectedDocuments(exportKind: ExportKind) {
    if (selectedCount === 0) {
      return
    }

    const action = exportKind === 'pull sheets' ? exportPullSheets : exportPackingSlips
    const setLoading =
      exportKind === 'pull sheets'
        ? setIsExportingPullSheets
        : setIsExportingPackingSlips

    setLoading(true)
    setFlashMessage(null)

    try {
      const result = (await action({
        orderIds: selectedOrders.map((order) => order._id),
        timezoneOffset: getTimezoneOffsetHours(),
      })) as ExportDocumentResult

      downloadDocument(result)
      setFlashMessage({
        kind: 'success',
        text: `Exported ${exportKind} for ${result.orderCount} TCGplayer order${result.orderCount === 1 ? '' : 's'}.`,
      })
    } catch (error) {
      setFlashMessage({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  if (!ordersPage) {
    return <LoadingTable />
  }

  return (
    <>
      <StatsBar orders={rows} />
      <FlashBanner message={flashMessage} onDismiss={() => setFlashMessage(null)} />

      <OrdersDataTable
        rows={rows}
        activeFilter={activeFilter}
        rowSelection={rowSelection}
        isFulfilling={isFulfilling}
        isExportingPullSheets={isExportingPullSheets}
        isExportingPackingSlips={isExportingPackingSlips}
        isOrdersPageLoading={isOrdersPageLoading}
        isOnLastPage={isOnLastPage}
        pageIndex={pageIndex}
        pageSize={pageSize}
        visibleRangeStart={visibleRangeStart}
        visibleRangeEnd={visibleRangeEnd}
        selectedCount={selectedCount}
        selectedTcgplayerCount={selectedTcgplayerCount}
        selectedNonTcgplayerCount={selectedNonTcgplayerCount}
        onChangeFilter={resetPageWindow}
        setRowSelection={setRowSelection}
        onExportPullSheets={() => void handleExportSelectedDocuments('pull sheets')}
        onExportPackingSlips={() => void handleExportSelectedDocuments('packing slips')}
        onMarkFulfilled={() => void handleMarkFulfilled()}
        onOpenDetail={openDetailModal}
        onOpenManage={openManageModal}
        onOpenPurchase={(order) => {
          void openPurchaseModal(order)
        }}
        onPrevPage={() => {
          setRowSelection({})
          setPageIndex((current) => Math.max(0, current - 1))
        }}
        onNextPage={() => {
          if (isOrdersPageLoading || isOnLastPage || nextPageCursor === null) {
            return
          }

          setRowSelection({})
          setPageCursors((current) => {
            const next = current.slice(0, pageIndex + 1)
            next[pageIndex + 1] = nextPageCursor
            return next
          })
          setPageIndex((current) => current + 1)
        }}
        onUpdatePageSize={(nextPageSize) => {
          setPageSize(nextPageSize)
          setRowSelection({})
          setPageIndex(0)
          setPageCursors([null])
        }}
      />

      {purchaseOrder ? (
        <PurchaseLabelModal
          purchaseOrder={purchaseOrder}
          purchaseQuote={purchaseQuote}
          allowUnverifiedAddress={allowUnverifiedAddress}
          purchaseError={purchaseError}
          isPreviewing={isPreviewing}
          isPurchasing={isPurchasing}
          onClose={closePurchaseModal}
          onSubmit={() => void handlePurchaseSubmit()}
          onChangeAllowUnverifiedAddress={setAllowUnverifiedAddress}
        />
      ) : null}

      {currentDetailOrder ? (
        <OrderDetailModal
          order={currentDetailOrder}
          orderPickContext={orderPickContext}
          onClose={closeDetailModal}
        />
      ) : null}

      {currentManagedOrder ? (
        <ManageLabelsModal
          order={currentManagedOrder}
          shipments={sortedManagedShipments}
          refundError={refundError}
          refundingShipmentId={refundingShipmentId}
          canRepurchase={canRepurchaseManaged}
          onClose={closeManageModal}
          onRefund={(shipment) => {
            void handleRefund(shipment)
          }}
          onRepurchase={() => {
            void handleRepurchaseFromManage()
          }}
        />
      ) : null}
    </>
  )
}
