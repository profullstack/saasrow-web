/**
 * Runs once when the Next server boots (not per request, not in tests).
 * Starts customer webhooks: the outbox pump that turns database events into
 * deliveries, and the drainer that sends them with retries and backoff
 * (@profullstack/webhooks, src/lib/webhooks/hub.ts). Also starts the badge
 * checker: free listings are live only while their site links back
 * (src/lib/badge.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const { startWebhooks } = await import('@/lib/webhooks/hub')
  startWebhooks()
  const { startBadgeChecks } = await import('@/lib/badge')
  startBadgeChecks()
}
