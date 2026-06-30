import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17.7.0';

const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY')!;
const stripe = new Stripe(stripeSecret, {
  appInfo: {
    name: 'SaaSRow',
    version: '1.0.0',
  },
});

function corsResponse(body: string | object | null, status = 200) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return corsResponse({}, 204);
    }

    if (req.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    const { price_id, amount, product_name, success_url, cancel_url, mode, tier, discount_code, customer_email, datafast_visitor_id, datafast_session_id } = await req.json();

    const error = validateParameters(
      { success_url, cancel_url, mode },
      {
        cancel_url: 'string',
        success_url: 'string',
        mode: { values: ['payment', 'subscription'] },
      },
    );

    if (error) {
      return corsResponse({ error }, 400);
    }

    // Two ways to price a line item:
    //  - `amount` (cents) + `product_name`: build the price inline (price_data).
    //    Lets us charge a one-time fee without pre-creating a Stripe Price, so
    //    it works against whatever account this function's key belongs to.
    //  - `price_id`: reference an existing Stripe Price (e.g. subscriptions).
    const hasInlineAmount = Number.isInteger(amount) && amount > 0;
    if (!hasInlineAmount && typeof price_id !== 'string') {
      return corsResponse({ error: 'Either amount (cents) or price_id is required' }, 400);
    }
    if (hasInlineAmount && mode !== 'payment') {
      return corsResponse({ error: 'Inline amount is only supported for one-time payments (mode: payment)' }, 400);
    }

    const lineItem = hasInlineAmount
      ? {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: { name: product_name || 'SaaSRow listing' },
          },
          quantity: 1,
        }
      : { price: price_id, quantity: 1 };

    const sessionParams: any = {
      payment_method_types: ['card'],
      line_items: [lineItem],
      mode,
      success_url,
      cancel_url,
      metadata: {},
    };

    if (customer_email) {
      sessionParams.customer_email = customer_email;
    }

    // Tier the purchase grants. Required for one-time (mode: 'payment')
    // checkouts so the webhook knows which tier to grant.
    if (tier) {
      sessionParams.metadata.tier = tier;
    }

    if (datafast_visitor_id) {
      sessionParams.metadata.datafast_visitor_id = datafast_visitor_id;
    }

    if (datafast_session_id) {
      sessionParams.metadata.datafast_session_id = datafast_session_id;
    }

    if (discount_code === '50OFF') {
      try {
        const promotionCodes = await stripe.promotionCodes.list({
          code: '50OFF',
          limit: 1,
        });

        if (promotionCodes.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promotionCodes.data[0].id }];
          console.log('Applied 50OFF promotion code to checkout session');
        } else {
          console.error('50OFF promotion code not found');
          sessionParams.allow_promotion_codes = true;
        }
      } catch (promoError) {
        console.error('Error applying promotion code:', promoError);
        sessionParams.allow_promotion_codes = true;
      }
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`Created checkout session ${session.id} with datafast attribution`);

    return corsResponse({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    console.error(`Checkout error: ${error.message}`);
    return corsResponse({ error: error.message }, 500);
  }
});

type ExpectedType = 'string' | { values: string[] };
type Expectations<T> = { [K in keyof T]: ExpectedType };

function validateParameters<T extends Record<string, any>>(values: T, expected: Expectations<T>): string | undefined {
  for (const parameter in values) {
    const expectation = expected[parameter];
    const value = values[parameter];

    if (expectation === 'string') {
      if (value == null) {
        return `Missing required parameter ${parameter}`;
      }
      if (typeof value !== 'string') {
        return `Expected parameter ${parameter} to be a string got ${JSON.stringify(value)}`;
      }
    } else {
      if (!expectation.values.includes(value)) {
        return `Expected parameter ${parameter} to be one of ${expectation.values.join(', ')}`;
      }
    }
  }

  return undefined;
}
