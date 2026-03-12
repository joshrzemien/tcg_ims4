import type { AuthConfig } from 'convex/server'

function deriveClerkIssuerDomainFromPublishableKey(
  publishableKey: string | undefined,
) {
  if (!publishableKey) {
    return undefined
  }

  const encodedDomain = publishableKey
    .split('_')
    .slice(2)
    .join('_')
    .replace(/\$$/, '')
  if (!encodedDomain) {
    return undefined
  }

  try {
    return `https://${Buffer.from(encodedDomain, 'base64url').toString('utf8')}`
  } catch {
    return undefined
  }
}

const issuer =
  process.env.CLERK_JWT_ISSUER_DOMAIN?.trim() ||
  deriveClerkIssuerDomainFromPublishableKey(
    process.env.CLERK_PUBLISHABLE_KEY ?? process.env.VITE_CLERK_PUBLISHABLE_KEY,
  )

if (!issuer) {
  throw new Error(
    'Missing Clerk issuer for Convex auth. Set CLERK_JWT_ISSUER_DOMAIN or CLERK_PUBLISHABLE_KEY.',
  )
}

export default {
  providers: [
    {
      type: 'customJwt',
      issuer,
      jwks: `${issuer}/.well-known/jwks.json`,
      algorithm: 'RS256',
      applicationID: 'convex',
    },
  ],
} satisfies AuthConfig
