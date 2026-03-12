import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import type { ConvexQueryClient } from '@convex-dev/react-query'

export const requireAuth = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { isAuthenticated, userId, getToken } = await auth()

    if (!isAuthenticated || !userId) {
      throw redirect({
        to: '/sign-in',
      })
    }

    const convexToken = await getToken({ template: 'convex' })
    if (!convexToken) {
      throw new Error(
        'Missing Clerk JWT template "convex". Configure it in Clerk before using Convex auth.',
      )
    }

    return { userId, convexToken }
  },
)

export async function requireBackendAuth(convexQueryClient: ConvexQueryClient) {
  const authState = await requireAuth()
  convexQueryClient.serverHttpClient?.setAuth(authState.convexToken)
  return { userId: authState.userId }
}
