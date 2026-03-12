import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { StandalonePostageScreen } from '../features/postage/StandalonePostageScreen'
import { requireBackendAuth } from '~/lib/auth'

export const Route = createFileRoute('/postage')({
  beforeLoad: async ({ context }) =>
    await requireBackendAuth(context.convexQueryClient),
  component: PostagePage,
})

function PostagePage() {
  return (
    <AppShell
      activeNav="postage"
      pageTitle="Standalone postage"
      pageDescription="Create standalone postage and review recent unattached labels with no tracking updates."
    >
      <StandalonePostageScreen />
    </AppShell>
  )
}
