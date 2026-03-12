import {
  
  
  
  action as baseAction,
  mutation as baseMutation,
  query as baseQuery
} from '../_generated/server'
import type {ActionCtx, MutationCtx, QueryCtx} from '../_generated/server';
import type { UserIdentity } from 'convex/server'

type AuthenticatedCtx = {
  auth: {
    getUserIdentity: () => Promise<UserIdentity | null>
  }
}

async function requireIdentity(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) {
    throw new Error('Unauthorized')
  }

  return identity
}

export const query: typeof baseQuery = ((definition: any) =>
  baseQuery({
    ...definition,
    handler: async (ctx: QueryCtx, args: unknown) => {
      await requireIdentity(ctx)
      return await definition.handler(ctx, args)
    },
  })) as typeof baseQuery

export const mutation: typeof baseMutation = ((definition: any) =>
  baseMutation({
    ...definition,
    handler: async (ctx: MutationCtx, args: unknown) => {
      await requireIdentity(ctx)
      return await definition.handler(ctx, args)
    },
  })) as typeof baseMutation

export const action: typeof baseAction = ((definition: any) =>
  baseAction({
    ...definition,
    handler: async (ctx: ActionCtx, args: unknown) => {
      await requireIdentity(ctx)
      return await definition.handler(ctx, args)
    },
  })) as typeof baseAction
