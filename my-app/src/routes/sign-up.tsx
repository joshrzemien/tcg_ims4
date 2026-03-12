import {
  Show,
  SignInButton,
  SignUp,
  UserButton,
} from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'

export const Route = createFileRoute('/sign-up')({
  component: SignUpPage,
})

function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Create your TCG IMS4 account
          </h1>
          <p className="text-sm text-muted-foreground">
            Use Clerk to create credentials for the internal dashboard.
          </p>
        </div>

        <Show when="signed-out">
          <div className="space-y-4">
            <SignUp
              path="/sign-up"
              routing="path"
              signInUrl="/sign-in"
              fallbackRedirectUrl="/"
            />
            <div className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <SignInButton fallbackRedirectUrl="/">
                <button
                  className="font-medium text-foreground underline"
                  type="button"
                >
                  Sign in
                </button>
              </SignInButton>
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
