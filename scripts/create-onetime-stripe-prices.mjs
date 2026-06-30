#!/usr/bin/env node
/**
 * Creates the two one-time Stripe prices for SaaSRow's paid listing tiers and
 * prints their price IDs. Run with your REAL Stripe secret key (live or test):
 *
 *   STRIPE_SECRET_KEY=sk_live_xxx node scripts/create-onetime-stripe-prices.mjs
 *
 * Then paste the two printed IDs into src/views/Featured.tsx, replacing
 * price_REPLACE_WITH_FEATURED_ONETIME_ID and price_REPLACE_WITH_PREMIUM_ONETIME_ID.
 *
 * Idempotency: this creates NEW products+prices each run. Run it once; if you
 * run it again you'll get duplicate products (harmless, but use the latest IDs).
 */

const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY || KEY.includes('here') || !KEY.startsWith('sk_')) {
  console.error('Set STRIPE_SECRET_KEY to a real Stripe secret key (sk_live_... or sk_test_...).');
  process.exit(1);
}

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path}: ${data.error?.message || res.status}`);
  return data;
}

async function makeOneTimePrice(name, usd) {
  const product = await stripe('products', { name });
  const price = await stripe('prices', {
    product: product.id,
    currency: 'usd',
    unit_amount: String(Math.round(usd * 100)),
    // no `recurring[...]` field => one-time price
  });
  return price.id;
}

const featured = await makeOneTimePrice('SaaSRow Featured — one-time', 2);
const premium = await makeOneTimePrice('SaaSRow Premium — one-time', 5);

console.log('\nDone. Paste these into src/views/Featured.tsx:\n');
console.log(`  Featured ($2): ${featured}`);
console.log(`  Premium  ($5): ${premium}\n`);
