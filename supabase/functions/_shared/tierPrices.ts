// What each paid tier costs, in cents. `once` is a one-time (lifetime) purchase.
// The checkout reads prices from here, never from the browser, so editing the
// request cannot buy Premium for a cent.
export const TIER_PRICES: Record<string, { once?: number; month?: number; year?: number }> = {
  featured: { once: 200 },
  premium: { once: 19900, month: 500, year: 2000 },
}

export type PriceResolution =
  | { ok: true; amount: number | undefined; recurring: 'month' | 'year' | null; listed: boolean }
  | { ok: false; error: string }

/** The server-side price for a checkout request, or why it cannot be sold. */
export function resolveTierPrice(tier: unknown, interval: unknown, mode: unknown, clientAmount: unknown): PriceResolution {
  const listed = TIER_PRICES[String(tier ?? '').toLowerCase()]
  const recurring = interval === 'month' || interval === 'year' ? interval : null
  if (!listed) {
    return { ok: true, amount: typeof clientAmount === 'number' ? clientAmount : undefined, recurring, listed: false }
  }
  const amount = listed[recurring ?? 'once']
  if (!amount) return { ok: false, error: `No ${recurring ?? 'one-time'} price for tier ${tier}` }
  if (recurring ? mode !== 'subscription' : mode !== 'payment') {
    return { ok: false, error: 'mode does not match interval' }
  }
  return { ok: true, amount, recurring, listed: true }
}
