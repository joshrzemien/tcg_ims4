const ALLOWED_CATEGORY_IDS_ENV_VAR = 'CATALOG_ALLOWED_CATEGORY_IDS'

function parseAllowedCategoryIds(value: string | undefined): Set<number> | null {
  if (!value || value.trim() === '') {
    return null
  }

  const ids = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isInteger(entry) && entry > 0)

  return new Set(ids)
}

export function getAllowedCatalogCategoryIds(): Set<number> | null {
  return parseAllowedCategoryIds(process.env[ALLOWED_CATEGORY_IDS_ENV_VAR])
}

export function isCatalogCategoryAllowed(categoryId: number): boolean {
  const allowedIds = getAllowedCatalogCategoryIds()
  return allowedIds === null || allowedIds.has(categoryId)
}

export function filterAllowedCatalogCategories<T extends { id: number }>(
  categories: Array<T>,
): Array<T> {
  const allowedIds = getAllowedCatalogCategoryIds()
  if (allowedIds === null) {
    return categories
  }

  return categories.filter((category) => allowedIds.has(category.id))
}
