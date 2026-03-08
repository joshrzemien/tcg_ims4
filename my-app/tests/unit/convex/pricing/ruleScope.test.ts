import { describe, expect, it } from 'vitest'

import {
  categoryRuleAppliesToSet,
  categoryRuleAppliesToSetAtTime,
} from '../../../../convex/pricing/ruleScope'
import {
  buildCatalogSet,
  buildPricingTrackingRule,
} from '../../../helpers/convexFactories'

describe('convex/pricing/ruleScope', () => {
  it('applies category rules to preexisting and future sets by default', () => {
    const rule = buildPricingTrackingRule({
      ruleType: 'category',
      categoryKey: 'magic',
      createdAt: 100,
    })

    expect(
      categoryRuleAppliesToSetAtTime(rule, {
        categoryKey: 'magic',
        _creationTime: 50,
      }),
    ).toBe(true)

    expect(categoryRuleAppliesToSet(rule, buildCatalogSet())).toBe(true)
  })

  it('honors seedExistingSets and autoTrackFutureSets opt-outs', () => {
    const seededOff = buildPricingTrackingRule({
      categoryKey: 'magic',
      createdAt: 100,
      seedExistingSets: false,
    })
    const futureOff = buildPricingTrackingRule({
      categoryKey: 'magic',
      createdAt: 100,
      autoTrackFutureSets: false,
    })

    expect(
      categoryRuleAppliesToSetAtTime(seededOff, {
        categoryKey: 'magic',
        _creationTime: 50,
      }),
    ).toBe(false)
    expect(
      categoryRuleAppliesToSetAtTime(futureOff, {
        categoryKey: 'magic',
        _creationTime: 150,
      }),
    ).toBe(false)
    expect(
      categoryRuleAppliesToSetAtTime(futureOff, {
        categoryKey: 'pokemon',
        _creationTime: 150,
      }),
    ).toBe(false)
  })
})
