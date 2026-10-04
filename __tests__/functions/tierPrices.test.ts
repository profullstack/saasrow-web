import { describe, it, expect } from 'vitest'
import { resolveTierPrice } from '../../supabase/functions/_shared/tierPrices'

describe('resolveTierPrice', () => {
  it('prices Premium monthly, yearly and lifetime on the server', () => {
    expect(resolveTierPrice('premium', 'month', 'subscription', 1)).toEqual({ ok: true, amount: 500, recurring: 'month', listed: true })
    expect(resolveTierPrice('premium', 'year', 'subscription', 1)).toEqual({ ok: true, amount: 2000, recurring: 'year', listed: true })
    expect(resolveTierPrice('Premium', undefined, 'payment', 1)).toEqual({ ok: true, amount: 19900, recurring: null, listed: true })
  })

  it('ignores an amount the browser edited', () => {
    const r = resolveTierPrice('premium', undefined, 'payment', 1)
    expect(r.ok && r.amount).toBe(19900)
  })

  it('keeps Featured one-time only', () => {
    expect(resolveTierPrice('featured', undefined, 'payment', 0)).toMatchObject({ ok: true, amount: 200 })
    expect(resolveTierPrice('featured', 'month', 'subscription', 0)).toMatchObject({ ok: false })
  })

  it('refuses a mode that does not match the term', () => {
    expect(resolveTierPrice('premium', 'month', 'payment', 0)).toMatchObject({ ok: false })
    expect(resolveTierPrice('premium', undefined, 'subscription', 0)).toMatchObject({ ok: false })
  })
})
