#!/usr/bin/env node
// Mint, list and revoke saasrow credit codes (days of Premium) with the
// service role, straight against the production Supabase.
//
//   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/credit-codes.mjs mint --days 30 --label "For Sam" [--max 1] [--expires-days 90]
//   … node scripts/credit-codes.mjs list
//   … node scripts/credit-codes.mjs revoke crd_…
//
// On dev2 the env is the app container's: docker exec saasrowcom-app-1 env.
// The plaintext code is printed once; only its sha256 is stored. Redeeming
// it (website /manage or /invites, `saasrow redeem`, MCP redeem_credit_code)
// mirrors the days into Premium through grant_premium_days().

import { createClient } from '@supabase/supabase-js'
import { Credits, supabaseStore } from '@profullstack/redeem-credits'

const env = (name) => process.env[name] ?? ''
const url = env('NEXT_PUBLIC_SUPABASE_URL') || env('SUPABASE_URL')
const key = env('SUPABASE_SERVICE_ROLE_KEY')
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(2)
}

const credits = new Credits(supabaseStore(createClient(url, key, { auth: { persistSession: false } })))
const [cmd, ...rest] = process.argv.slice(2)
const flag = (name) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}

if (cmd === 'mint') {
  const days = Number(flag('days'))
  if (!Number.isInteger(days) || days < 1) {
    console.error('--days <whole number> is required')
    process.exit(2)
  }
  const expiresDays = flag('expires-days') ? Number(flag('expires-days')) : null
  const minted = await credits.mint({
    grant: { unit: 'premium_days', amount: days },
    label: flag('label') ?? '',
    maxRedemptions: flag('max') ? Number(flag('max')) : 1,
    expiresAt: expiresDays ? Date.now() + expiresDays * 86_400_000 : null,
    createdBy: flag('by') ?? 'scripts/credit-codes.mjs',
  })
  console.log(JSON.stringify(minted, null, 2))
} else if (cmd === 'list') {
  for (const c of await credits.list()) {
    console.log(
      `${c.id}  ${c.grant.amount} ${c.grant.unit}  ${c.redemptions}/${c.maxRedemptions}` +
        `${c.revokedAt ? '  revoked' : ''}${c.expiresAt ? `  expires ${new Date(c.expiresAt).toISOString().slice(0, 10)}` : ''}  ${c.label}`,
    )
  }
} else if (cmd === 'revoke' && rest[0]) {
  await credits.revoke(rest[0])
  console.log(`revoked ${rest[0]}`)
} else {
  console.error('Usage: credit-codes.mjs mint --days N [--label L] [--max N] [--expires-days N] | list | revoke <id>')
  process.exit(2)
}
