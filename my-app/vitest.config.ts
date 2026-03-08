import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/unit.ts'],
    include: ['./tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: [
        'shared/shippingStatus.ts',
        'shared/shippingMethod.ts',
        'shared/shippingPurchase.ts',
        'shared/shippingRefund.ts',
        'convex/catalog/syncPolicy.ts',
        'convex/catalog/syncState.ts',
        'convex/catalog/syncModes.ts',
        'convex/catalog/config.ts',
        'convex/pricing/normalizers.ts',
        'convex/pricing/ruleScope.ts',
        'convex/orders/shipmentSummary.ts',
        'convex/orders/mappers/shared.ts',
        'convex/orders/mappers/tcgplayer.ts',
        'convex/orders/mappers/manapool.ts',
      ],
      exclude: [
        'convex/_generated/**',
        'dist/**',
        'node_modules/**',
        'src/**',
        'tests/**',
      ],
    },
  },
})
