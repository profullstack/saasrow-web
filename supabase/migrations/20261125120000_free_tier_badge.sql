/*
  # Free listings need the SaaSRow badge

  A free listing is live only while its website links back to its SaaSRow page
  (the embeddable badge, /software/<id>/badge.svg). Featured and Premium do not
  need it. Nobody bought the $2 that lifted the free tier's limits, so the free
  tier now pays in a backlink instead.

  ## How it is enforced

  One BEFORE trigger on software_submissions, so every path that approves a
  listing (admin view, bulk SQL, API, a tier change, a credit) obeys it:

    - status 'approved' on a free listing with no verified badge, no exemption
      and no running grace period becomes 'badge_required' (not public: every
      public read filters on status = 'approved').
    - 'badge_required' becomes 'approved' the moment the badge verifies, the
      listing is upgraded or it is exempted. 'badge_required' therefore always
      means "an admin approved this; only the badge is missing".

  ## Columns

    - badge_verified_at   set while the site links back, null otherwise
    - badge_checked_at    last time the site was fetched (null: never)
    - badge_lost_at       when a verified badge was last found missing
    - badge_grace_until   the listing stays live without a badge until then
    - badge_exempt        staff waiver (our own sites, a hand-approved exception)
    - badge_email_state   last badge email sent: notice | required | live
    - badge_email_at

  ## Grace periods

    - listings already approved when this runs: 14 days from now
    - a verified badge that goes missing: 3 days
    - a paid tier that lapses back to free: 7 days

  The Next app checks the sites (src/lib/badge.ts); the `badge-emails` edge
  function sends the notices. Both read state from here, so neither needs to be
  told what happened.
*/

ALTER TABLE software_submissions
  ADD COLUMN IF NOT EXISTS badge_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS badge_checked_at  timestamptz,
  ADD COLUMN IF NOT EXISTS badge_lost_at     timestamptz,
  ADD COLUMN IF NOT EXISTS badge_grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS badge_exempt      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS badge_email_state text,
  ADD COLUMN IF NOT EXISTS badge_email_at    timestamptz;

ALTER TABLE software_submissions DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE software_submissions ADD CONSTRAINT valid_status
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'badge_required'::text]));

-- What the checker reads next: never checked first.
CREATE INDEX IF NOT EXISTS idx_submissions_badge_due
  ON software_submissions (badge_checked_at NULLS FIRST)
  WHERE status IN ('pending', 'approved', 'badge_required');

CREATE OR REPLACE FUNCTION enforce_free_badge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_free boolean := coalesce(NEW.tier, 'free') NOT IN ('featured', 'premium');
  needs boolean;
  owner_tier text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- The badge was there and is gone: three days to put it back.
    IF OLD.badge_verified_at IS NOT NULL AND NEW.badge_verified_at IS NULL THEN
      NEW.badge_lost_at := now();
      NEW.badge_grace_until := now() + interval '3 days';
      NEW.badge_email_state := NULL;
    END IF;
    -- A paid tier lapsed back to free: a week to add the badge.
    IF coalesce(OLD.tier, 'free') IN ('featured', 'premium') AND is_free
       AND NEW.badge_verified_at IS NULL AND NOT NEW.badge_exempt THEN
      NEW.badge_grace_until := now() + interval '7 days';
      NEW.badge_email_state := NULL;
    END IF;
  END IF;

  needs := is_free
    AND NOT NEW.badge_exempt
    AND NEW.badge_verified_at IS NULL
    AND (NEW.badge_grace_until IS NULL OR NEW.badge_grace_until <= now());

  -- A Featured or Premium account's new listing is inserted as 'free' like any
  -- other. When it would be held back for a badge, it takes the account's tier
  -- instead, as the account's existing listings did when it paid. Only then:
  -- a listing that is live anyway keeps the tier it has.
  IF needs AND NEW.status IN ('approved', 'badge_required') THEN
    SELECT t.tier INTO owner_tier
    FROM submission_contacts c
    JOIN user_tokens t ON lower(t.email) = lower(c.email)
    WHERE c.submission_id = NEW.id AND t.tier IN ('featured', 'premium')
    ORDER BY (t.tier = 'premium') DESC
    LIMIT 1;
    IF owner_tier IS NOT NULL THEN
      NEW.tier := owner_tier;
      needs := false;
    END IF;
  END IF;

  IF NEW.status = 'approved' AND needs THEN
    NEW.status := 'badge_required';
  ELSIF NEW.status = 'badge_required' AND NOT needs THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END $$;

-- Everything approved before the rule existed gets two weeks' notice. Set
-- before the trigger exists, so this statement cannot hide anything itself.
UPDATE software_submissions
SET badge_grace_until = now() + interval '14 days'
WHERE status = 'approved'
  AND coalesce(tier, 'free') NOT IN ('featured', 'premium')
  AND badge_verified_at IS NULL
  AND badge_grace_until IS NULL;

-- Named to run before the other BEFORE triggers (they fire in name order), so
-- the expiry and updated_at triggers see the final status.
DROP TRIGGER IF EXISTS a_enforce_free_badge ON software_submissions;
CREATE TRIGGER a_enforce_free_badge
  BEFORE INSERT OR UPDATE ON software_submissions
  FOR EACH ROW EXECUTE FUNCTION enforce_free_badge();

/**
 * A grace period ending changes nothing in the row, so nothing fires the
 * trigger. This touches the listings whose grace has run out; the trigger then
 * moves them to 'badge_required'. Returns how many it moved.
 */
CREATE OR REPLACE FUNCTION sweep_badge_grace() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  moved integer;
BEGIN
  WITH due AS (
    UPDATE software_submissions
    SET badge_grace_until = badge_grace_until
    WHERE status = 'approved'
      AND coalesce(tier, 'free') NOT IN ('featured', 'premium')
      AND NOT badge_exempt
      AND badge_verified_at IS NULL
      AND badge_grace_until IS NOT NULL
      AND badge_grace_until <= now()
    RETURNING 1
  )
  SELECT count(*) INTO moved FROM due;
  RETURN moved;
END $$;

REVOKE ALL ON FUNCTION sweep_badge_grace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sweep_badge_grace() TO service_role;

/**
 * The listings whose site is due a look: never checked first, then verified
 * ones daily and unverified ones every twelve hours. A listing that has sat
 * hidden for a month after its "badge required" email is looked at weekly;
 * its owner can always check at once from the manage page.
 */
CREATE OR REPLACE FUNCTION badge_checks_due(batch integer DEFAULT 8)
RETURNS TABLE (id uuid, url text, status text, badge_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.url, s.status, s.badge_verified_at
  FROM software_submissions s
  WHERE s.status IN ('pending', 'approved', 'badge_required')
    AND coalesce(s.tier, 'free') NOT IN ('featured', 'premium')
    AND NOT s.badge_exempt
    AND (
      s.badge_checked_at IS NULL
      OR s.badge_checked_at < now() - CASE
        WHEN s.badge_verified_at IS NOT NULL THEN interval '24 hours'
        WHEN s.status = 'badge_required' AND s.badge_email_at < now() - interval '30 days' THEN interval '7 days'
        ELSE interval '12 hours'
      END
    )
  ORDER BY s.badge_checked_at NULLS FIRST, s.created_at
  LIMIT greatest(1, least(batch, 50));
$$;

REVOKE ALL ON FUNCTION badge_checks_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION badge_checks_due(integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('badge-grace-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'badge-grace-sweep');

SELECT cron.schedule('badge-grace-sweep', '7 * * * *', $$ SELECT public.sweep_badge_grace() $$);

-- The `badge-emails` job (pg_net -> the edge function, every five minutes) is
-- scheduled per deployment, because its URL is the project's own. On the
-- self-hosted stack:
--
--   SELECT cron.schedule('badge-emails', '*/5 * * * *', $job$
--     SELECT net.http_post(
--       url := '<SUPABASE_URL>/functions/v1/badge-emails',
--       headers := '{"Content-Type": "application/json"}'::jsonb,
--       body := '{"batch": 40}'::jsonb,
--       timeout_milliseconds := 120000
--     )
--   $job$);
