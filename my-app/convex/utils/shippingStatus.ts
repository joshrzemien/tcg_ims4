export {
  compareShipmentTiming,
  deriveOrderShippingStatus,
  derivePlatformShippingStatus,
  deriveShipmentShippingStatus,
  SHIPPING_STATUS_VALUES,
  formatShippingStatusLabel,
  hasRefundedPostage,
  isShippingStatus,
  normalizeShippingStatus,
  normalizeStatusToken,
  pickLatestShipment,
} from '../../shared/shippingStatus'
export type { ShippingStatus } from '../../shared/shippingStatus'
