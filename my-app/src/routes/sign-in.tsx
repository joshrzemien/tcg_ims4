import {
  Show,
  SignIn,
  SignUpButton,
  UserButton,
} from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Sign in to TCG IMS4
          </h1>
          <p className="text-sm text-muted-foreground">
            Authenticate with Clerk to access the internal dashboard.
          </p>
        </div>

        <Show when="signed-out">
          <div className="space-y-4">
            <SignIn
              path="/sign-in"
              routing="path"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/"
            />
            <div className="text-center text-sm text-muted-foreground">
              Need an account?{' '}
              <SignUpButton fallbackRedirectUrl="/">
                <button
                  className="font-medium text-foreground underline"
                  type="button"
                >
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </div>
        </Show>

        <Show when="signed-in">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">
              You are already signed in.
            </p>
            <UserButton />
            <Button asChild>
              <Link to="/">Return to dashboard</Link>
            </Button>
          </div>
        </Show>
      </div>
    </main>
  )
}
