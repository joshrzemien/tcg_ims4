import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { markTcgplayerOrderShipped } from '../../../../convex/orders/sources/tcgplayer'

describe('convex/orders/sources/tcgplayer', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    process.env.TCGPLAYER_SESSION_COOKIE = 'session=value'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the ship-no-tracking endpoint for the order', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await markTcgplayerOrderShipped({ orderNumber: 'E576ED4C-08FCB0-71D4A' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://order-management-api.tcgplayer.com/orders/E576ED4C-08FCB0-71D4A/ship-no-tracking?api-version=2.0',
    )
    expect(init).toMatchObject({
      method: 'POST',
      body: '',
    })
    const headers = new Headers(init.headers)
    expect(headers.get('Cookie')).toBe('session=value')
    expect(headers.get('Accept')).toBe('application/json, text/plain, */*')
    expect(headers.get('Referer')).toBe('https://sellerportal.tcgplayer.com/')
  })

  it('throws a descriptive error when the ship call fails', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))

    await expect(
      markTcgplayerOrderShipped({ orderNumber: '12345' }),
    ).rejects.toThrow(
      'TCGPlayer ship-no-tracking failed for 12345: 400 bad request',
    )
  })
})
