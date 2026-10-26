/*
  # Premium days from credit codes and invites

  Credit codes (@profullstack/redeem-credits, unit `premium_days`) and invite
  bonuses (@profullstack/affiliates) grant days of Premium. They go through the
  same record a paid Premium month or year uses: a `coinpay_orders` row with a
  fixed term (`term = 'credit'`, `amount_cents = 0`, `status = 'granted'`), the
  tier on `user_tokens`, and the tier on every listing tied to the email. So
  get-subscription, the admin Users tab and the hourly `expire_coinpay_terms()`
  see it with no second flag: when the last term ends the account falls back
  exactly as it does after a paid month.

  - A running term (paid or granted) is extended from its end.
  - Lifetime Premium (a one-time Premium order, or a Premium `user_tokens` row
    with no running term, as the Stripe-era lifetime buyers have) stays
    lifetime: the grant is recorded, already expired, and changes nothing.
  - `p_key` is the idempotency key (`coinpay_orders.checkout_session_id` is
    UNIQUE): the same key never grants twice.

  Invites: `invite_bonuses` is one row per invite (written by the server with
  the service role only, never by a client), and `settle_invite_bonus()` pays
  both sides in one transaction, exactly once. `invite_pending` keeps an invite
  code with an emailed sign-in, so the invite counts even when the code is
  typed in another browser.
*/

ALTER TABLE public.coinpay_orders DROP CONSTRAINT IF EXISTS coinpay_orders_term_check;
ALTER TABLE public.coinpay_orders
  ADD CONSTRAINT coinpay_orders_term_check CHECK (term IN ('once', 'month', 'year', 'credit'));

CREATE OR REPLACE FUNCTION public.grant_premium_days(p_email text, p_days integer, p_key text, p_note text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_token record;
  v_live record;
  v_lifetime boolean;
  v_start timestamptz;
  v_end timestamptz;
  v_prior text;
BEGIN
  IF v_email IS NULL OR v_email = '' OR position('@' in v_email) = 0 THEN
    RAISE EXCEPTION 'grant_premium_days: an email is required';
  END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 3650 THEN
    RAISE EXCEPTION 'grant_premium_days: days must be 1..3650';
  END IF;
  IF p_key IS NULL OR p_key = '' THEN
    RAISE EXCEPTION 'grant_premium_days: an idempotency key is required';
  END IF;

  -- One grant per email at a time, so two grants never read the same term end.
  PERFORM pg_advisory_xact_lock(hashtext('grant_premium_days:' || v_email));

  IF EXISTS (SELECT 1 FROM coinpay_orders WHERE checkout_session_id = p_key) THEN
    RETURN jsonb_build_object('applied', false, 'reason', 'already granted');
  END IF;

  SELECT tier INTO v_token FROM user_tokens WHERE lower(email) = v_email LIMIT 1;

  SELECT period_end, prior_tier INTO v_live
    FROM coinpay_orders
    WHERE lower(email) = v_email AND term <> 'once' AND period_end > now()
    ORDER BY period_end DESC LIMIT 1;

  v_lifetime := EXISTS (
      SELECT 1 FROM coinpay_orders
      WHERE lower(email) = v_email AND tier = 'premium' AND term = 'once' AND status = 'paid'
    )
    OR (v_token.tier = 'premium' AND v_live.period_end IS NULL);

  IF v_lifetime THEN
    INSERT INTO coinpay_orders (checkout_session_id, email, tier, term, amount_cents, method, status,
                                prior_tier, period_start, period_end, expired_at, metadata)
    VALUES (p_key, v_email, 'premium', 'credit', 0, 'credit', 'granted',
            'premium', now(), now(), now(),
            jsonb_build_object('days', p_days, 'note', coalesce(p_note, ''), 'lifetime', true));
    RETURN jsonb_build_object('applied', true, 'lifetime', true, 'days', p_days);
  END IF;

  IF v_live.period_end IS NOT NULL THEN
    v_start := v_live.period_end;
    v_prior := v_live.prior_tier;
  ELSE
    v_start := now();
    v_prior := v_token.tier;
  END IF;
  v_end := v_start + make_interval(days => p_days);

  INSERT INTO coinpay_orders (checkout_session_id, email, tier, term, amount_cents, method, status,
                              prior_tier, period_start, period_end, metadata)
  VALUES (p_key, v_email, 'premium', 'credit', 0, 'credit', 'granted',
          v_prior, v_start, v_end,
          jsonb_build_object('days', p_days, 'note', coalesce(p_note, '')));

  IF v_token IS NULL THEN
    INSERT INTO user_tokens (email, tier, user_id)
      VALUES (v_email, 'premium', (SELECT id FROM users WHERE lower(email) = v_email LIMIT 1));
  ELSIF v_token.tier <> 'premium' THEN
    UPDATE user_tokens SET tier = 'premium' WHERE lower(email) = v_email;
  END IF;

  UPDATE software_submissions SET tier = 'premium'
    WHERE tier <> 'premium' AND id IN (
      SELECT sc.submission_id FROM submission_contacts sc
        WHERE lower(sc.email) = v_email AND sc.submission_id IS NOT NULL
      UNION
      SELECT s.id FROM software_submissions s JOIN users u ON u.id = s.user_id
        WHERE lower(u.email) = v_email
    );

  RETURN jsonb_build_object('applied', true, 'lifetime', false, 'days', p_days, 'premium_until', v_end);
END;
$$;

REVOKE ALL ON FUNCTION public.grant_premium_days(text, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_premium_days(text, integer, text, text) TO service_role;

-- ------------------------------------------------------------------ invites

CREATE TABLE IF NOT EXISTS public.invite_bonuses (
  invite_id text PRIMARY KEY,
  inviter_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  inviter_ip_hash text,
  invitee_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  invitee_ip_hash text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'pending', 'paid', 'blocked')),
  reason text,
  days integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS invite_bonuses_inviter_idx ON public.invite_bonuses (inviter_id);
CREATE INDEX IF NOT EXISTS invite_bonuses_invitee_idx ON public.invite_bonuses (invitee_id);

CREATE TABLE IF NOT EXISTS public.invite_pending (
  email text PRIMARY KEY,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invite_pending ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_bonuses FROM anon, authenticated;
REVOKE ALL ON public.invite_pending FROM anon, authenticated;
GRANT ALL ON public.invite_bonuses TO service_role;
GRANT ALL ON public.invite_pending TO service_role;

/*
  Pay both sides of an accepted invite, once. The caller has already decided
  the invitee passed the spam guards; this only moves 'pending' to 'paid'
  under a row lock, and grant_premium_days() is idempotent on its key, so a
  retry after a partial failure cannot pay twice.
*/
CREATE OR REPLACE FUNCTION public.settle_invite_bonus(p_invite text, p_days integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b record;
  inviter_email text;
  invitee_email text;
  r_inviter jsonb;
  r_invitee jsonb;
BEGIN
  SELECT * INTO b FROM invite_bonuses WHERE invite_id = p_invite FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'no such invite');
  END IF;
  IF b.status = 'paid' THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'already paid');
  END IF;
  IF b.status <> 'pending' OR b.invitee_id IS NULL THEN
    RETURN jsonb_build_object('paid', false, 'reason', b.status);
  END IF;

  SELECT email INTO inviter_email FROM users WHERE id = b.inviter_id;
  SELECT email INTO invitee_email FROM users WHERE id = b.invitee_id;
  IF inviter_email IS NULL OR invitee_email IS NULL THEN
    RETURN jsonb_build_object('paid', false, 'reason', 'account missing');
  END IF;

  r_invitee := grant_premium_days(invitee_email, p_days, 'invite:' || p_invite || ':invitee', 'invite accepted');
  r_inviter := grant_premium_days(inviter_email, p_days, 'invite:' || p_invite || ':inviter', 'invite accepted');

  UPDATE invite_bonuses SET status = 'paid', days = p_days, paid_at = now(), reason = NULL
    WHERE invite_id = p_invite;
  RETURN jsonb_build_object('paid', true, 'days', p_days, 'invitee', r_invitee, 'inviter', r_inviter);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_invite_bonus(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_invite_bonus(text, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
