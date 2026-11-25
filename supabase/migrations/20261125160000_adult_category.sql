/*
  # Adult (18+) category, signed-in members only

  A listing whose category is `Adult` is live under its own status, `adult`,
  instead of `approved`. Every public reader in this project (pages, feeds,
  sitemap, llms.txt, the API, MCP, the edge functions and two dozen SQL
  functions) asks for `status = 'approved'`, so none of them can return an
  adult listing, including the ones nobody remembered to change. Only the
  member routes (src/lib/adult.ts) ask for `status = 'adult'`.

  The same trigger that enforces the badge rule sets it:

    approved + category Adult   -> adult
    adult + category changed    -> approved

  Everything else about the badge rule applies to an adult listing unchanged
  (free listings need the badge; `badge_required` hides either kind).
*/

ALTER TABLE software_submissions DROP CONSTRAINT IF EXISTS valid_status;
ALTER TABLE software_submissions ADD CONSTRAINT valid_status
  CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'badge_required'::text, 'adult'::text]));

/** Is this category the adult one? Spelling variants people type all count. */
CREATE OR REPLACE FUNCTION is_adult_category(category text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(coalesce(category, ''))) IN ('adult', 'adult (18+)', 'adult 18+', 'nsfw', 'porn', 'xxx')
$$;

CREATE OR REPLACE FUNCTION enforce_free_badge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  is_free boolean := coalesce(NEW.tier, 'free') NOT IN ('featured', 'premium');
  is_adult boolean := is_adult_category(NEW.category);
  needs boolean;
  owner_tier text;
BEGIN
  -- One spelling in the table, and 'adult' is only ever a flavour of approved:
  -- fold it back so the badge rule below reasons about two states, not three.
  IF is_adult THEN NEW.category := 'Adult'; END IF;
  IF NEW.status = 'adult' THEN NEW.status := 'approved'; END IF;

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

  -- Live and adult: its own status, which no public reader asks for.
  IF NEW.status = 'approved' AND is_adult THEN NEW.status := 'adult'; END IF;
  RETURN NEW;
END $$;

-- The grace sweep and the checker's queue treat a live adult listing as live.
CREATE OR REPLACE FUNCTION sweep_badge_grace() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  moved integer;
BEGIN
  WITH due AS (
    UPDATE software_submissions
    SET badge_grace_until = badge_grace_until
    WHERE status IN ('approved', 'adult')
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

CREATE OR REPLACE FUNCTION badge_checks_due(batch integer DEFAULT 8)
RETURNS TABLE (id uuid, url text, status text, badge_verified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.url, s.status, s.badge_verified_at
  FROM software_submissions s
  WHERE s.status IN ('pending', 'approved', 'adult', 'badge_required')
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

DROP INDEX IF EXISTS idx_submissions_badge_due;
CREATE INDEX idx_submissions_badge_due
  ON software_submissions (badge_checked_at NULLS FIRST)
  WHERE status IN ('pending', 'approved', 'adult', 'badge_required');

CREATE INDEX IF NOT EXISTS idx_submissions_adult
  ON software_submissions (created_at DESC) WHERE status = 'adult';

-- Anything already approved in an adult-sounding category moves now (the
-- trigger does it; this only touches those rows).
UPDATE software_submissions SET category = category
WHERE status = 'approved' AND is_adult_category(category);

NOTIFY pgrst, 'reload schema';
