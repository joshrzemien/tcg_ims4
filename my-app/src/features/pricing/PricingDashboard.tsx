import { useCallback, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { Plus, RotateCw } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import { CreateRuleModal } from './components/CreateRuleModal'
import { IssuesTab } from './components/IssuesTab'
import { PricingStatsBar } from './components/PricingStatsBar'
import { RulesTab } from './components/RulesTab'
import { SeriesTab } from './components/SeriesTab'
import type { FlashMessage } from '~/features/shared/components/FlashBanner'
import type { TabKey } from './types'
import { cn } from '~/lib/utils'
import { getErrorMessage } from '~/features/shared/lib/errors'
import { FlashBanner } from '~/features/shared/components/FlashBanner'
import { Button } from '~/components/ui/button'

export { CreateRuleModal } from './components/CreateRuleModal'
export { SeriesTab } from './components/SeriesTab'

export function PricingDashboard({
  committedSeriesSearch,
  seriesActiveOnly,
  onCommittedSeriesSearchChange,
  onSeriesActiveOnlyChange,
}: {
  committedSeriesSearch: string
  seriesActiveOnly: boolean
  onCommittedSeriesSearchChange: (value: string) => void
  onSeriesActiveOnlyChange: (value: boolean) => void
}) {
  const [activeTab, setActiveTab] = useState<TabKey>('rules')
  const [flashMessage, setFlashMessage] = useState<FlashMessage>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [syncingCatalog, setSyncingCatalog] = useState(false)

  const rules = useQuery(
    api.pricing.queries.listRules,
    activeTab === 'rules' ? {} : 'skip',
  )
  const pricingStats = useQuery(api.pricing.queries.getPricingStats)
  const syncCatalogNow = useAction(api.catalog.sync.syncCatalogNow)

  const handleFlash = useCallback((message: FlashMessage) => {
    setFlashMessage(message)
  }, [])

  async function handleSyncCatalogNow() {
    setSyncingCatalog(true)
    try {
      const result = await syncCatalogNow({})
      handleFlash({
        kind: 'success',
        text:
          result.scheduled > 0
            ? `Catalog sync queued for ${result.scheduled} set${result.scheduled === 1 ? '' : 's'}.`
            : 'Catalog sync ran, but no eligible sets needed queueing.',
      })
    } catch (error) {
      handleFlash({ kind: 'error', text: getErrorMessage(error) })
    } finally {
      setSyncingCatalog(false)
    }
  }

  return (
    <div className="space-y-3">
      <PricingStatsBar stats={pricingStats} />

      <FlashBanner
        message={flashMessage}
        onDismiss={() => setFlashMessage(null)}
      />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {(
            [
              ['rules', 'Rules'],
              ['series', 'Tracked Series'],
              ['issues', 'Issues'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={cn(
                'rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
                activeTab === key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
              )}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => void handleSyncCatalogNow()}
            disabled={syncingCatalog}
          >
            <RotateCw
              className={cn('size-3', syncingCatalog && 'animate-spin')}
            />
            {syncingCatalog ? 'Syncing...' : 'Sync Catalog Now'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="size-3" />
            New Rule
          </Button>
        </div>
      </div>

      {activeTab === 'rules' && (
        <RulesTab rules={rules} onFlash={handleFlash} />
      )}
      {activeTab === 'series' && (
        <SeriesTab
          committedSearch={committedSeriesSearch}
          activeOnly={seriesActiveOnly}
          onCommittedSearchChange={onCommittedSeriesSearchChange}
          onActiveOnlyChange={onSeriesActiveOnlyChange}
        />
      )}
      {activeTab === 'issues' && <IssuesTab onFlash={handleFlash} />}

      {showCreateModal && (
        <CreateRuleModal
          onClose={() => setShowCreateModal(false)}
          onFlash={handleFlash}
        />
      )}
    </div>
  )
}
