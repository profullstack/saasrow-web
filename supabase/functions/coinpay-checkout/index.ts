// Starts a CoinPay hosted checkout session for a listing tier. The buyer is
// redirected to the returned url and pays there in any coin or PayPal.
//
// POST {tier, interval?, mode, customer_email, success_url, cancel_url,
//       discount_code?, submission_id?, datafast_visitor_id?, datafast_session_id?}
//   -> {sessionId, url, methods}
// GET ?session=cs_... -> {status} (the Featured page's return check)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
import { buildSessionRequest } from '../_shared/coinpay.ts';

const API_URL = (Deno.env.get('COINPAY_API_URL') || 'https://coinpayportal.com').replace(/\/+$/, '');
const API_KEY = Deno.env.get('COINPAY_API_KEY') || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

// A signed-in caller (the proxy forwards their session JWT) is billed to their
// user id; a guest to their email.
async function signedInUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') || '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data } = await sb.auth.getUser(jwt);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!API_KEY) return json({ error: 'Checkout is not configured' }, 503);

  try {
    if (req.method === 'GET') {
      const id = new URL(req.url).searchParams.get('session') || '';
      if (!/^cs_[A-Za-z0-9_-]+$/.test(id)) return json({ error: 'session is required' }, 400);
      const res = await fetch(`${API_URL}/api/checkout/sessions/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return json({ error: data?.error || 'Session not found' }, res.status === 404 ? 404 : 502);
      const s = data.session ?? data;
      if (s.property && s.property !== 'saasrow.com') return json({ error: 'Session not found' }, 404);
      return json({ status: s.status, tier: s.metadata?.tier ?? null });
    }

    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    const input = await req.json().catch(() => ({}));
    const built = buildSessionRequest(input, {
      accountId: await signedInUserId(req),
      siteUrl: Deno.env.get('SITE_URL') || 'https://saasrow.com',
    });
    if (!built.ok) return json({ error: built.error }, 400);

    const res = await fetch(`${API_URL}/api/checkout/sessions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(built.body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      console.error(`CoinPay session failed ${res.status}: ${JSON.stringify(data)}`);
      return json({ error: data?.error || 'Could not start checkout' }, 502);
    }
    console.log(`CoinPay session ${data.id} for ${built.tier}/${built.term}`);
    return json({ sessionId: data.id, url: data.url, methods: data.methods ?? [] });
  } catch (err) {
    console.error('coinpay-checkout error:', err);
    return json({ error: 'Something went wrong' }, 500);
  }
});
