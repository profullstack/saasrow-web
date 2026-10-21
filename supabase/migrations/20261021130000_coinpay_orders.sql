/*
  # CoinPay orders

  Listing tiers are paid through CoinPay hosted checkout sessions (any coin or
  PayPal). One row per paid checkout session; the unique session id is what
  makes the webhook idempotent (CoinPay can send payment.confirmed AND
  payment.forwarded for the same session).

  A Premium month or year is a fixed term, not a renewing subscription:
  `period_end` is when that term runs out. Paying again before then extends
  from the current end. `prior_tier` is the tier the buyer held before the
  current run of terms began, so expiry can fall back to it.

  expire_coinpay_terms() runs hourly and, for each buyer whose last term has
  ended, drops their tier to the best one-time purchase (or prior tier), or
  back to free the same way a cancelled subscription used to.
*/

CREATE TABLE IF NOT EXISTS public.coinpay_orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkout_session_id text NOT NULL UNIQUE,
  payment_id text,
  event_id text,
  email text NOT NULL,
  account_id text,
  tier text NOT NULL CHECK (tier IN ('featured', 'premium')),
  term text NOT NULL CHECK (term IN ('once', 'month', 'year')),
  amount_cents bigint NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  method text,
  status text NOT NULL DEFAULT 'paid',
  submission_id text,
  prior_tier text,
  period_start timestamptz,
  period_end timestamptz,
  expired_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coinpay_orders_email ON public.coinpay_orders (lower(email));
CREATE INDEX IF NOT EXISTS idx_coinpay_orders_open_terms
  ON public.coinpay_orders (period_end) WHERE term <> 'once' AND expired_at IS NULL;

ALTER TABLE public.coinpay_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access to coinpay orders" ON public.coinpay_orders;
CREATE POLICY "No direct access to coinpay orders" ON public.coinpay_orders
  FOR ALL TO anon, authenticated USING (false);
REVOKE ALL ON public.coinpay_orders FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.expire_coinpay_terms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  buyer record;
  fallback text;
  one_time text;
  listing_ids uuid[];
  n integer := 0;
BEGIN
  FOR buyer IN
    SELECT lower(o.email) AS email,
           (array_agg(o.prior_tier ORDER BY o.period_end DESC))[1] AS prior_tier
    FROM coinpay_orders o
    WHERE o.term <> 'once' AND o.expired_at IS NULL AND o.period_end <= now()
      AND NOT EXISTS (
        SELECT 1 FROM coinpay_orders a
        WHERE lower(a.email) = lower(o.email) AND a.term <> 'once' AND a.period_end > now()
      )
    GROUP BY lower(o.email)
  LOOP
    SELECT CASE WHEN bool_or(tier = 'premium') THEN 'premium'
                WHEN bool_or(tier = 'featured') THEN 'featured' END
      INTO one_time
      FROM coinpay_orders WHERE lower(email) = buyer.email AND term = 'once';

    fallback := CASE
      WHEN one_time = 'premium' OR buyer.prior_tier = 'premium' THEN 'premium'
      WHEN one_time = 'featured' OR buyer.prior_tier = 'featured' THEN 'featured'
      ELSE NULL END;

    SELECT coalesce(array_agg(DISTINCT id), '{}') INTO listing_ids FROM (
      SELECT sc.submission_id AS id FROM submission_contacts sc
        WHERE lower(sc.email) = buyer.email AND sc.submission_id IS NOT NULL
      UNION
      SELECT s.id FROM software_submissions s JOIN users u ON u.id = s.user_id
        WHERE lower(u.email) = buyer.email
    ) ids;

    IF fallback = 'premium' THEN
      NULL; -- a lifetime Premium outlives any term: nothing to take back
    ELSIF fallback = 'featured' THEN
      UPDATE user_tokens SET tier = 'featured' WHERE lower(email) = buyer.email;
      UPDATE software_submissions
        SET tier = 'featured', homepage_featured = false, newsletter_featured = false
        WHERE id = ANY(listing_ids) AND tier = 'premium';
    ELSE
      UPDATE software_submissions
        SET tier = 'free', homepage_featured = false, newsletter_featured = false,
            analytics_enabled = false, monthly_analytics_enabled = false,
            social_media_mentions = false, category_logo_enabled = false
        WHERE id = ANY(listing_ids);
      DELETE FROM user_tokens WHERE lower(email) = buyer.email;
    END IF;

    UPDATE coinpay_orders SET expired_at = now()
      WHERE lower(email) = buyer.email AND term <> 'once' AND expired_at IS NULL AND period_end <= now();
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_coinpay_terms() FROM PUBLIC, anon, authenticated;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('expire-coinpay-terms')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-coinpay-terms');

SELECT cron.schedule('expire-coinpay-terms', '17 * * * *', $$SELECT public.expire_coinpay_terms()$$);
