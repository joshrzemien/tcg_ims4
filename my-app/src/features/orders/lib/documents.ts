type DownloadableDocumentResult = {
  base64Data: string
  fileName: string
  mimeType: string
}

export function normalizeBase64DocumentData(base64Data: string): {
  normalizedBase64Data: string
  mimeType?: string
} {
  let normalizedBase64Data = base64Data.trim()
  let mimeType: string | undefined

  const dataUrlMatch = normalizedBase64Data.match(
    /^data:([^;,]+)?;base64,([\s\S]+)$/i,
  )
  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1]
    normalizedBase64Data = dataUrlMatch[2]
  }

  normalizedBase64Data = normalizedBase64Data
    .replace(/\s+/g, '')
    .replaceAll('-', '+')
    .replaceAll('_', '/')

  const paddingRemainder = normalizedBase64Data.length % 4
  if (paddingRemainder === 1) {
    throw new Error('TCGplayer returned an invalid document encoding.')
  }
  if (paddingRemainder > 1) {
    normalizedBase64Data = normalizedBase64Data.padEnd(
      normalizedBase64Data.length + (4 - paddingRemainder),
      '=',
    )
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(normalizedBase64Data)) {
    throw new Error('TCGplayer returned a document in an unexpected format.')
  }

  return { normalizedBase64Data, mimeType }
}

export function decodeBase64Document(
  base64Data: string,
  mimeType: string,
): Blob {
  const normalized = normalizeBase64DocumentData(base64Data)
  const binary = globalThis.atob(normalized.normalizedBase64Data)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new Blob([bytes], { type: normalized.mimeType ?? mimeType })
}

export function downloadDocument(result: DownloadableDocumentResult) {
  const blob = decodeBase64Document(result.base64Data, result.mimeType)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = result.fileName
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}
