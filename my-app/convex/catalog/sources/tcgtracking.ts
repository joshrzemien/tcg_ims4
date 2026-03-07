const DEFAULT_BASE_URL = 'https://tcgtracking.com/tcgapi/v1'
const REQUEST_RETRY_DELAYS_MS = [250, 750]

export interface TcgTrackingMeta {
  last_updated?: string
  pricing_updated?: string
  total_categories?: number
  total_sets?: number
  total_products?: number
  version?: string
}

export interface TcgTrackingCategory {
  id: number
  name: string
  display_name: string
  product_count: number
  set_count: number
  api_url: string
}

interface TcgTrackingCategoriesResponse {
  categories: Array<TcgTrackingCategory>
}

export interface TcgTrackingSetSummary {
  id: number
  name: string
  abbreviation?: string | null
  is_supplemental?: boolean | null
  published_on?: string | null
  modified_on?: string | null
  product_count: number
  sku_count: number
  products_modified?: string | null
  pricing_modified?: string | null
  skus_modified?: string | null
  api_url: string
  pricing_url: string
  skus_url: string
}

interface TcgTrackingSetsResponse {
  category_id: number
  category_name: string
  generated_at?: string
  sets: Array<TcgTrackingSetSummary>
}

export interface TcgTrackingProduct {
  id: number
  name: string
  clean_name: string
  number?: string | null
  rarity?: string | null
  image_url?: string | null
  image_count?: number | null
  tcgplayer_url?: string | null
  manapool_url?: string | null
  scryfall_id?: string | null
  mtgjson_uuid?: string | null
  cardmarket_id?: number | null
  cardtrader_id?: number | null
  cardtrader?: unknown
  colors?: Array<string> | null
  color_identity?: Array<string> | null
  mana_value?: number | null
  finishes?: Array<string> | null
  border_color?: string | null
}

export interface TcgTrackingSetDetail {
  set_id: number
  set_name: string
  set_abbr?: string | null
  set_released?: string | null
  data_modified?: string | null
  file_generated?: string | null
  product_count: number
  pricing_url: string
  products: Array<TcgTrackingProduct>
}

export interface TcgTrackingProductPricing {
  tcg?: Record<string, unknown>
  manapool?: Record<string, number>
  mp_qty?: number
}

export interface TcgTrackingPricingResponse {
  set_id: number
  updated?: string | null
  prices: Record<string, TcgTrackingProductPricing>
}

export interface TcgTrackingSkuRecord {
  cnd?: string
  var?: string
  lng?: string
  mkt?: number
  low?: number
  hi?: number
  cnt?: number
}

export interface TcgTrackingSkusResponse {
  set_id: number
  updated?: string | null
  sku_count: number
  product_count: number
  products: Record<string, Record<string, TcgTrackingSkuRecord>>
}

export interface TcgTrackingSetPayload {
  detail: TcgTrackingSetDetail
  pricing: TcgTrackingPricingResponse
  skus: TcgTrackingSkusResponse
}

function resolveBaseUrl() {
  return process.env.TCGTRACKING_API_BASE_URL?.trim() || DEFAULT_BASE_URL
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncateForError(value: string, maxLength = 200): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength)}...`
}

async function getJson<T>(path: string, label: string): Promise<T> {
  const url = `${resolveBaseUrl()}${path}`
  let lastError: Error | undefined

  for (let attempt = 0; attempt <= REQUEST_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(url)
      const body = await response.text()

      if (!response.ok) {
        const detail = truncateForError(body)
        const message = detail ? ` ${detail}` : ''
        const error = new Error(
          `TCG Tracking ${label} failed: ${response.status}${message}`,
        )

        if (
          response.status < 500 &&
          response.status !== 429 &&
          attempt === REQUEST_RETRY_DELAYS_MS.length
        ) {
          throw error
        }

        lastError = error
      } else if (body.trim() === '') {
        lastError = new Error(`TCG Tracking ${label} returned an empty response`)
      } else {
        try {
          return JSON.parse(body) as T
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          lastError = new Error(
            `TCG Tracking ${label} returned invalid JSON: ${message}`,
          )
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }

    if (attempt < REQUEST_RETRY_DELAYS_MS.length) {
      await sleep(REQUEST_RETRY_DELAYS_MS[attempt])
    }
  }

  throw lastError ?? new Error(`TCG Tracking ${label} failed`)
}

export async function fetchCatalogMeta(): Promise<TcgTrackingMeta> {
  return getJson<TcgTrackingMeta>('/meta', 'meta request')
}

export async function fetchCatalogCategories(): Promise<Array<TcgTrackingCategory>> {
  const response = await getJson<TcgTrackingCategoriesResponse>(
    '/categories',
    'categories request',
  )

  return response.categories
}

export async function fetchCatalogSets(
  categoryId: number,
): Promise<Array<TcgTrackingSetSummary>> {
  const response = await getJson<TcgTrackingSetsResponse>(
    `/${categoryId}/sets`,
    `sets request for category ${categoryId}`,
  )

  return response.sets
}

export async function fetchCatalogSetPayload(
  categoryId: number,
  setId: number,
): Promise<TcgTrackingSetPayload> {
  const [detail, pricing, skus] = await Promise.all([
    getJson<TcgTrackingSetDetail>(
      `/${categoryId}/sets/${setId}`,
      `product request for set ${setId}`,
    ),
    getJson<TcgTrackingPricingResponse>(
      `/${categoryId}/sets/${setId}/pricing`,
      `pricing request for set ${setId}`,
    ),
    getJson<TcgTrackingSkusResponse>(
      `/${categoryId}/sets/${setId}/skus`,
      `sku request for set ${setId}`,
    ),
  ])

  return {
    detail,
    pricing,
    skus,
  }
}
