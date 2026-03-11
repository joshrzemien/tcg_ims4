// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getFunctionName } from 'convex/server'
import { AdHocPdfPrintModal } from '../../../../src/features/shared/components/AdHocPdfPrintModal'

const { useActionMock } = vi.hoisted(() => ({
  useActionMock: vi.fn(),
}))

vi.mock('convex/react', () => ({
  useAction: (...args: Array<unknown>) => useActionMock(...args),
}))

describe('ad hoc pdf print modal', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    useActionMock.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('uploads a pdf and queues it for printing', async () => {
    const generateUploadUrl = vi.fn().mockResolvedValue('https://upload.test')
    const discardUpload = vi.fn().mockResolvedValue({ discarded: true })
    const queueUploadedPdf = vi.fn().mockResolvedValue({
      printJobId: 'print-job-1',
      printStatus: 'queued',
      stationKey: 'default-label-station',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      copies: 2,
    })

    useActionMock.mockImplementation((ref: unknown) => {
      const functionName = getFunctionName(ref as never)

      if (functionName === 'printing/actions:generateUploadUrl') {
        return generateUploadUrl
      }
      if (functionName === 'printing/actions:discardUpload') {
        return discardUpload
      }
      if (functionName === 'printing/actions:queueUploadedPdf') {
        return queueUploadedPdf
      }

      return vi.fn()
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ storageId: 'storage-1' }),
    })

    const onClose = vi.fn()
    const onFlash = vi.fn()

    render(<AdHocPdfPrintModal onClose={onClose} onFlash={onFlash} />)

    fireEvent.change(screen.getByLabelText('PDF file'), {
      target: {
        files: [new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })],
      },
    })

    await waitFor(() => {
      expect(generateUploadUrl).toHaveBeenCalledWith({})
    })

    fireEvent.change(screen.getByLabelText('Copies'), {
      target: { value: '2' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Print PDF' }))

    await waitFor(() => {
      expect(queueUploadedPdf).toHaveBeenCalledWith({
        storageId: 'storage-1',
        fileName: 'test.pdf',
        copies: 2,
      })
    })

    expect(onFlash).toHaveBeenCalledWith({
      kind: 'success',
      text: 'Queued test.pdf for printing. (2 copies)',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(discardUpload).not.toHaveBeenCalled()
  })
})
