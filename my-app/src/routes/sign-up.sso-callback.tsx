import { AuthenticateWithRedirectCallback } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-up/sso-callback')({
  component: SignUpSsoCallbackPage,
})

function SignUpSsoCallbackPage() {
  return <AuthenticateWithRedirectCallback />
}
