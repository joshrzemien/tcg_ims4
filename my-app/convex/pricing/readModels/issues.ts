import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'
import { internalQuery } from '../../_generated/server'
import { query } from '../../lib/auth'
import { paginateFilteredQuery } from './pagination'

const pricingResolutionIssueTypeValidator = v.union(
  v.literal('ambiguous_nm_en_sku'),
  v.literal('unmapped_printing'),
  v.literal('missing_product_price'),
  v.literal('missing_manapool_match'),
  v.literal('sync_error'),
)

function matchesResolutionIssueFilters(
  issue: {
    active: boolean
    setKey: string
    categoryKey: string
    issueType: string
    isIgnored?: boolean
  },
  args: {
    activeOnly?: boolean
    setKey?: string
    categoryKey?: string
    issueType?: string
    includeIgnored?: boolean
  },
) {
  if (args.activeOnly && !issue.active) {
    return false
  }
  if (args.setKey && issue.setKey !== args.setKey) {
    return false
  }
  if (args.categoryKey && issue.categoryKey !== args.categoryKey) {
    return false
  }
  if (args.issueType && issue.issueType !== args.issueType) {
    return false
  }

  return args.includeIgnored ? true : issue.isIgnored !== true
}

export const listResolutionIssuesForSetPage = internalQuery({
  args: {
    setKey: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { setKey, paginationOpts }) => {
    return await ctx.db
      .query('pricingResolutionIssues')
      .withIndex('by_setKey', (q) => q.eq('setKey', setKey))
      .paginate(paginationOpts)
  },
})

export const listResolutionIssues = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    setKey: v.optional(v.string()),
    categoryKey: v.optional(v.string()),
    issueType: v.optional(pricingResolutionIssueTypeValidator),
    includeIgnored: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    if (
      args.activeOnly &&
      !args.includeIgnored &&
      args.issueType &&
      !args.setKey &&
      !args.categoryKey
    ) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_isIgnored_issueType_lastSeenAt', (q) =>
          q
            .eq('active', true)
            .eq('isIgnored', false)
            .eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (
      args.activeOnly &&
      args.issueType &&
      !args.setKey &&
      !args.categoryKey
    ) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_issueType_lastSeenAt', (q) =>
          q.eq('active', true).eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (
      !args.includeIgnored &&
      args.issueType &&
      !args.setKey &&
      !args.categoryKey
    ) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_isIgnored_issueType_lastSeenAt', (q) =>
          q.eq('isIgnored', false).eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (args.issueType && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_issueType_lastSeenAt', (q) =>
          q.eq('issueType', args.issueType!),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (
      args.activeOnly &&
      !args.includeIgnored &&
      !args.setKey &&
      !args.categoryKey
    ) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_active_isIgnored_lastSeenAt', (q) =>
          q.eq('active', true).eq('isIgnored', false),
        )
        .order('desc')
        .paginate(args.paginationOpts)
    }

    if (!args.includeIgnored && !args.setKey && !args.categoryKey) {
      return await ctx.db
        .query('pricingResolutionIssues')
        .withIndex('by_isIgnored_lastSeenAt', (q) => q.eq('isIgnored', false))
        .order('desc')
        .paginate(args.paginationOpts)
    }

    return await paginateFilteredQuery({
      paginationOpts: args.paginationOpts,
      fetchPage: async (paginationOpts) => {
        if (args.activeOnly && args.setKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_setKey_lastSeenAt', (q) =>
              q.eq('active', true).eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly && args.categoryKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_categoryKey_lastSeenAt', (q) =>
              q.eq('active', true).eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.activeOnly) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_active_lastSeenAt', (q) => q.eq('active', true))
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.setKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_setKey_lastSeenAt', (q) =>
              q.eq('setKey', args.setKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        if (args.categoryKey) {
          return await ctx.db
            .query('pricingResolutionIssues')
            .withIndex('by_categoryKey_lastSeenAt', (q) =>
              q.eq('categoryKey', args.categoryKey!),
            )
            .order('desc')
            .paginate(paginationOpts)
        }

        return await ctx.db
          .query('pricingResolutionIssues')
          .withIndex('by_lastSeenAt')
          .order('desc')
          .paginate(paginationOpts)
      },
      predicate: (issue) => matchesResolutionIssueFilters(issue, args),
    })
  },
})
