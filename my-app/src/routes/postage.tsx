import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '../components/AppShell'
import { StandalonePostageScreen } from '../features/postage/StandalonePostageScreen'

export const Route = createFileRoute('/postage')({
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
