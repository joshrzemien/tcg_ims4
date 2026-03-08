import { Link } from '@tanstack/react-router'
import { Archive, DollarSign, Package, Stamp } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

type NavKey = 'dashboard' | 'postage' | 'pricing' | 'inventory'

const navItems: Array<{
  key: NavKey
  href: string
  label: string
}> = [
  { key: 'dashboard', href: '/', label: 'Dashboard' },
  { key: 'postage', href: '/postage', label: 'Postage' },
  { key: 'pricing', href: '/pricing', label: 'Pricing' },
  { key: 'inventory', href: '/inventory', label: 'Inventory' },
]

export function AppShell({
  activeNav,
  pageTitle,
  pageDescription,
  children,
}: {
  activeNav: NavKey
  pageTitle: string
  pageDescription: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-12 w-full max-w-[1600px] items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <Package className="size-4 text-muted-foreground" />
            <h1 className="text-sm font-semibold tracking-tight text-foreground">
              TCG Order Management
            </h1>
          </div>
          <nav className="ml-auto flex items-center gap-2">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.href}
                aria-current={item.key === activeNav ? 'page' : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                  item.key === activeNav
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                )}
              >
                {item.key === 'postage' ? (
                  <Stamp className="size-3.5" />
                ) : item.key === 'pricing' ? (
                  <DollarSign className="size-3.5" />
                ) : item.key === 'inventory' ? (
                  <Archive className="size-3.5" />
                ) : (
                  <Package className="size-3.5" />
                )}
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">
        <section className="mb-4 flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {pageTitle}
          </h2>
          <p className="text-sm text-muted-foreground">{pageDescription}</p>
        </section>
        {children}
      </main>
    </div>
  )
}
