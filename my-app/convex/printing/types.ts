import { v } from 'convex/values'
import {
  PRINTER_STATION_STATUS_VALUES,
  PRINT_JOB_STATUS_VALUES,
  PRINT_JOB_TYPE_VALUES,
  PRINT_SOURCE_KIND_VALUES,
} from '../../shared/printing'

export const printerStationStatusValidator = v.union(
  ...PRINTER_STATION_STATUS_VALUES.map((status) => v.literal(status)),
)

export const printJobTypeValidator = v.union(
  ...PRINT_JOB_TYPE_VALUES.map((jobType) => v.literal(jobType)),
)

export const printJobStatusValidator = v.union(
  ...PRINT_JOB_STATUS_VALUES.map((status) => v.literal(status)),
)

export const printSourceKindValidator = v.union(
  ...PRINT_SOURCE_KIND_VALUES.map((sourceKind) => v.literal(sourceKind)),
)

export const printerCapabilityValidator = printJobTypeValidator

export const printJobMetadataValidator = v.object({
  orderNumber: v.optional(v.string()),
  orderCount: v.optional(v.number()),
  carrier: v.optional(v.string()),
  service: v.optional(v.string()),
})
