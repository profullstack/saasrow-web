// CoinPay webhook for saasrow.com. Verifies X-CoinPay-Signature over the raw
// body, then on payment.confirmed / payment.forwarded applies the tier the
// session bought (see _shared/coinpay.ts settlePaidEvent). Idempotent per
// checkout session, so confirmed + forwarded for one session grant once.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { readEvent, settlePaidEvent, verifySignature } from '../_shared/coinpay.ts';

const SECRET = Deno.env.get('COINPAY_WEBHOOK_SECRET') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const supabase = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function callFn(name: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`${name} failed: ${res.status} ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!SECRET) return Response.json({ error: 'Webhook not configured' }, { status: 503 });

  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('x-coinpay-signature'), SECRET))) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ev = readEvent(payload);
  try {
    const result = await settlePaidEvent(supabase, ev, {
      sendManagementLink: (email) => callFn('send-management-link', { email }),
      notifyAdmin: (email, tier) => callFn('send-admin-notification', { type: 'new_subscription', data: { email, tier } }),
    });
    console.info(`CoinPay ${ev.type} ${ev.checkoutSessionId ?? ev.paymentId}: ${JSON.stringify(result)}`);
    return Response.json({ received: true, ...result });
  } catch (err) {
    console.error('coinpay-webhook settle error:', err);
    return Response.json({ error: 'Settlement failed' }, { status: 500 });
  }
});
