-- Karma: the same points for the same actions as built.indie and pwamart, so the
-- three programs read as one network. One append-only ledger (karma_events); a
-- member's karma is the sum of their rows; a reversal is a new negative row; the
-- unique key (user, action, ref, bucket) means a retry or a double click never
-- pays twice. Every 500 karma is a free Featured week (karma_credits).
--
-- The rules live here, not in app code, so the website, the API, MCP and the
-- approval trigger all pay through award_karma() and can never disagree.
--
-- Members are `users` rows (emailed-code sign-in, API key or /manage link).
-- Anonymous votes and comments still work and earn nobody anything. Staff earn
-- nothing (the bulk-listed fleet must not top the board), and nobody earns on a
-- listing they own.

-- ------------------------------------------------------------------ rules --
CREATE TABLE IF NOT EXISTS karma_rules (
  action     text PRIMARY KEY,
  points     int  NOT NULL,
  daily_cap  int,
  label      text NOT NULL,
  rule       text NOT NULL,
  live       boolean NOT NULL DEFAULT true,
  sort       int  NOT NULL DEFAULT 0
);

INSERT INTO karma_rules (action, points, daily_cap, label, rule, live, sort) VALUES
  ('publish',         10, NULL, 'List a product',          'the first time a listing of yours is approved', true, 10),
  ('vote',             1, 20,   'Upvote a product',        'not your own; up to 20 paid votes a day', true, 20),
  ('review',           5, NULL, 'Review a product',        'a star rating and at least 30 characters; once per product; not your own', true, 30),
  ('comment',          2, 10,   'Comment on a product',    'at least 10 characters; up to 10 paid a day; a deleted comment takes the points back', true, 40),
  ('share',            1, 5,    'Share a product',         'the share buttons on a product page; once per product per network a day; up to 5 a day', true, 50),
  ('received_vote',    1, NULL, 'Your product is upvoted', 'to the listing owner, per signed-in member who upvotes it', true, 60),
  ('received_review',  2, NULL, 'Your product is reviewed','to the listing owner, per review from someone else', true, 70),
  ('verify',           5, NULL, 'Prove you own a product', 'once per product', false, 80),
  ('badge',            5, NULL, 'Show the SaaSRow badge',  'a live badge on your site links back; once per product', false, 90),
  ('invite',          25, NULL, 'Invite a maker',          'an invited new member lists their first product', false, 100)
ON CONFLICT (action) DO UPDATE SET
  points = EXCLUDED.points, daily_cap = EXCLUDED.daily_cap, label = EXCLUDED.label,
  rule = EXCLUDED.rule, live = EXCLUDED.live, sort = EXCLUDED.sort;

ALTER TABLE karma_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read karma rules" ON karma_rules;
CREATE POLICY "Anyone can read karma rules" ON karma_rules FOR SELECT USING (true);

-- ---------------------------------------------------------------- members --
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false;
-- The leaderboard name. Never the email: when unset the board shows "member-<id>".
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 40);

UPDATE users SET is_staff = true
WHERE lower(email) = 'anthony@profullstack.com'
   OR lower(email) IN (SELECT lower(email) FROM admin_tokens);

-- ---------------------------------------------------------------- ledger --
-- Never updated. bucket '' = once ever; 'YYYY-MM-DD' = once a day (share);
-- 'reversed' = the one reversal of a row.
CREATE TABLE IF NOT EXISTS karma_events (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         text NOT NULL REFERENCES karma_rules(action),
  ref            text NOT NULL,
  bucket         text NOT NULL DEFAULT '',
  points         int  NOT NULL,
  submission_id  uuid REFERENCES software_submissions(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, action, ref, bucket)
);
CREATE INDEX IF NOT EXISTS karma_events_user_idx ON karma_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS karma_events_at_idx ON karma_events (created_at);
ALTER TABLE karma_events ENABLE ROW LEVEL SECURITY;

-- One free Featured week per crossed milestone (milestone n = n * 500 karma),
-- granted once even if karma later dips.
CREATE TABLE IF NOT EXISTS karma_credits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone       int  NOT NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  spent_at        timestamptz,
  submission_id   uuid REFERENCES software_submissions(id) ON DELETE SET NULL,
  featured_until  timestamptz,
  expired_at      timestamptz,
  UNIQUE (user_id, milestone)
);
CREATE INDEX IF NOT EXISTS karma_credits_open_idx ON karma_credits (featured_until)
  WHERE spent_at IS NOT NULL AND expired_at IS NULL;
ALTER TABLE karma_credits ENABLE ROW LEVEL SECURITY;

-- Member comments notify through notify-comment, which stamps this so a retry
-- can never mail the owner twice. Existing comments count as already sent.
ALTER TABLE comments ADD COLUMN IF NOT EXISTS notified_at timestamptz;
UPDATE comments SET notified_at = created_at WHERE notified_at IS NULL AND is_verified;

-- ------------------------------------------------------------- functions --
CREATE OR REPLACE FUNCTION karma_per_credit() RETURNS int
LANGUAGE sql IMMUTABLE AS $$ SELECT 500 $$;

-- The leaderboard's public player id: stable, and not the account id.
CREATE OR REPLACE FUNCTION karma_player_id(p_user uuid) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT left(encode(sha256(convert_to('saasrow-karma:' || p_user::text, 'UTF8')), 'hex'), 12)
$$;

-- Who owns a listing: its user_id, else the account behind its contact email
-- (website listings were inserted without user_id).
CREATE OR REPLACE FUNCTION listing_owner(p_submission uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT user_id FROM software_submissions WHERE id = p_submission),
    (SELECT u.id FROM submission_contacts c JOIN users u ON lower(u.email) = lower(c.email)
      WHERE c.submission_id = p_submission ORDER BY u.created_at LIMIT 1)
  )
$$;

/*
 * Pay one action. Returns {paid, points, credits} or {paid:false, reason}.
 * Serialized per member by an advisory lock so two parallel requests cannot
 * both slip under a daily cap.
 */
CREATE OR REPLACE FUNCTION award_karma(
  p_user uuid, p_action text, p_ref text, p_bucket text DEFAULT '', p_submission uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r karma_rules%ROWTYPE;
  staff boolean;
  n int;
  paid int;
  total int;
  granted int;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('paid', false, 'reason', 'anonymous'); END IF;
  SELECT * INTO r FROM karma_rules WHERE action = p_action;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown karma action %', p_action; END IF;
  IF NOT r.live THEN RETURN jsonb_build_object('paid', false, 'reason', 'not live'); END IF;

  PERFORM pg_advisory_xact_lock(hashtext('karma:' || p_user::text));
  SELECT is_staff INTO staff FROM users WHERE id = p_user;
  IF NOT FOUND THEN RETURN jsonb_build_object('paid', false, 'reason', 'no such member'); END IF;
  IF staff THEN RETURN jsonb_build_object('paid', false, 'reason', 'staff'); END IF;

  IF r.daily_cap IS NOT NULL THEN
    SELECT count(*) INTO n FROM karma_events
    WHERE user_id = p_user AND action = p_action AND points > 0
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc';
    IF n >= r.daily_cap THEN
      RETURN jsonb_build_object('paid', false, 'reason', 'daily cap of ' || r.daily_cap);
    END IF;
  END IF;

  INSERT INTO karma_events (user_id, action, ref, bucket, points, submission_id)
  VALUES (p_user, p_action, p_ref, coalesce(p_bucket, ''), r.points, p_submission)
  ON CONFLICT (user_id, action, ref, bucket) DO NOTHING
  RETURNING points INTO paid;
  IF paid IS NULL THEN RETURN jsonb_build_object('paid', false, 'reason', 'already paid'); END IF;

  SELECT coalesce(sum(points), 0) INTO total FROM karma_events WHERE user_id = p_user;
  WITH g AS (
    INSERT INTO karma_credits (user_id, milestone)
    SELECT p_user, m FROM generate_series(1, total / karma_per_credit()) m
    ON CONFLICT (user_id, milestone) DO NOTHING RETURNING 1
  ) SELECT count(*) INTO granted FROM g;

  RETURN jsonb_build_object('paid', true, 'points', paid, 'total', total, 'credits', granted);
END $$;

-- Take back one paid row (a deleted comment). Once only; nothing if it never paid.
CREATE OR REPLACE FUNCTION reverse_karma(p_user uuid, p_action text, p_ref text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e karma_events%ROWTYPE;
  pts int;
BEGIN
  IF p_user IS NULL THEN RETURN jsonb_build_object('reversed', false); END IF;
  PERFORM pg_advisory_xact_lock(hashtext('karma:' || p_user::text));
  SELECT * INTO e FROM karma_events
  WHERE user_id = p_user AND action = p_action AND ref = p_ref AND bucket = '' AND points > 0;
  IF NOT FOUND THEN RETURN jsonb_build_object('reversed', false); END IF;
  INSERT INTO karma_events (user_id, action, ref, bucket, points, submission_id)
  VALUES (p_user, p_action, p_ref, 'reversed', -e.points, e.submission_id)
  ON CONFLICT (user_id, action, ref, bucket) DO NOTHING
  RETURNING points INTO pts;
  RETURN jsonb_build_object('reversed', pts IS NOT NULL, 'points', coalesce(pts, 0));
END $$;

-- A listing's first approval pays its owner. Never lets karma fail an approval.
CREATE OR REPLACE FUNCTION karma_on_listing_approved() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    BEGIN
      PERFORM award_karma(listing_owner(NEW.id), 'publish', NEW.id::text, '', NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'karma publish award failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS karma_listing_approved ON software_submissions;
CREATE TRIGGER karma_listing_approved
  AFTER INSERT OR UPDATE OF status ON software_submissions
  FOR EACH ROW EXECUTE FUNCTION karma_on_listing_approved();

-- A deleted comment (by its author or an admin reject) takes its points back:
-- the comment's own +2, and the review +5 when it was their last rated comment
-- on that product. A reversal is final, so deleting and re-posting never re-pays.
CREATE OR REPLACE FUNCTION karma_on_comment_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    BEGIN
      PERFORM reverse_karma(OLD.user_id, 'comment', OLD.id::text);
      IF OLD.rating IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM comments WHERE user_id = OLD.user_id AND submission_id = OLD.submission_id
          AND rating IS NOT NULL AND id <> OLD.id
      ) THEN
        PERFORM reverse_karma(OLD.user_id, 'review', OLD.submission_id::text);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'karma reversal failed for comment %: %', OLD.id, SQLERRM;
    END;
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS karma_comment_deleted ON comments;
CREATE TRIGGER karma_comment_deleted
  AFTER DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION karma_on_comment_deleted();

-- Is a listing covered by a paid CoinPay order (lifetime, or a term still running)?
CREATE OR REPLACE FUNCTION listing_has_paid_tier(p_submission uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM coinpay_orders o
    WHERE o.status = 'paid'
      AND (o.term = 'once' OR o.period_end > now())
      AND lower(o.email) IN (
        SELECT lower(email) FROM submission_contacts WHERE submission_id = p_submission
        UNION
        SELECT lower(u.email) FROM software_submissions s JOIN users u ON u.id = s.user_id WHERE s.id = p_submission
      )
  )
$$;

/*
 * Spend one free Featured week on a listing the member owns. A free listing
 * becomes tier 'featured' for 7 days; a listing already karma-featured is
 * extended. A paid Featured or Premium listing is refused (the credit would
 * buy nothing).
 */
CREATE OR REPLACE FUNCTION spend_karma_credit(p_user uuid, p_submission uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record;
  credit_id uuid;
  current_until timestamptz;
  new_until timestamptz;
  left_n int;
BEGIN
  SELECT id, status, tier INTO s FROM software_submissions WHERE id = p_submission FOR UPDATE;
  IF NOT FOUND OR listing_owner(p_submission) IS DISTINCT FROM p_user THEN
    RETURN jsonb_build_object('error', 'No such listing of yours', 'status', 404);
  END IF;
  IF s.status <> 'approved' THEN
    RETURN jsonb_build_object('error', 'The listing must be approved first', 'status', 409);
  END IF;

  SELECT max(featured_until) INTO current_until FROM karma_credits
  WHERE submission_id = p_submission AND expired_at IS NULL AND featured_until > now();

  IF s.tier = 'premium' OR (s.tier = 'featured' AND current_until IS NULL) THEN
    RETURN jsonb_build_object('error', 'This listing is already on a paid ' || s.tier || ' plan', 'status', 409);
  END IF;

  SELECT id INTO credit_id FROM karma_credits
  WHERE user_id = p_user AND spent_at IS NULL ORDER BY milestone LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF credit_id IS NULL THEN
    RETURN jsonb_build_object('error', 'No free Featured week yet: every ' || karma_per_credit() || ' karma earns one', 'status', 402);
  END IF;

  new_until := greatest(now(), coalesce(current_until, now())) + interval '7 days';
  UPDATE software_submissions
    SET tier = 'featured', featured = true, is_featured = true, featured_until = new_until
    WHERE id = p_submission;
  UPDATE karma_credits
    SET spent_at = now(), submission_id = p_submission, featured_until = new_until
    WHERE id = credit_id;

  SELECT count(*) INTO left_n FROM karma_credits WHERE user_id = p_user AND spent_at IS NULL;
  RETURN jsonb_build_object('featured', true, 'featured_until', new_until, 'credits_left', left_n);
END $$;

-- Hourly: a karma Featured week that ran out drops back to free, unless a paid
-- order covers the listing or another karma week is still running on it.
CREATE OR REPLACE FUNCTION expire_karma_featured() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c record;
  n int := 0;
BEGIN
  FOR c IN
    SELECT DISTINCT submission_id FROM karma_credits
    WHERE spent_at IS NOT NULL AND expired_at IS NULL AND featured_until <= now() AND submission_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM karma_credits WHERE submission_id = c.submission_id
                   AND expired_at IS NULL AND featured_until > now())
       AND NOT listing_has_paid_tier(c.submission_id) THEN
      UPDATE software_submissions
        SET tier = 'free', featured = false, is_featured = false, featured_until = NULL
        WHERE id = c.submission_id AND tier = 'featured';
      n := n + 1;
    END IF;
    UPDATE karma_credits SET expired_at = now()
      WHERE submission_id = c.submission_id AND expired_at IS NULL AND featured_until <= now();
  END LOOP;
  RETURN n;
END $$;

-- The board: karma earned in the period, staff excluded.
CREATE OR REPLACE FUNCTION karma_leaderboard(p_period text DEFAULT 'week', p_limit int DEFAULT 25)
RETURNS TABLE (rank bigint, player text, name text, karma bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH totals AS (
    SELECT k.user_id, sum(k.points) AS karma
    FROM karma_events k JOIN users u ON u.id = k.user_id
    WHERE NOT u.is_staff
      AND k.created_at >= CASE p_period
        WHEN 'week' THEN now() - interval '7 days'
        WHEN 'month' THEN now() - interval '30 days'
        ELSE '-infinity'::timestamptz END
    GROUP BY k.user_id
    HAVING sum(k.points) > 0
  )
  SELECT rank() OVER (ORDER BY t.karma DESC),
         karma_player_id(t.user_id),
         coalesce(u.display_name, 'member-' || left(karma_player_id(t.user_id), 6)),
         t.karma
  FROM totals t JOIN users u ON u.id = t.user_id
  ORDER BY t.karma DESC, u.created_at
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 100)
$$;

REVOKE ALL ON FUNCTION award_karma(uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reverse_karma(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION spend_karma_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION expire_karma_featured() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION listing_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION listing_has_paid_tier(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION karma_leaderboard(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION award_karma(uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION reverse_karma(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION spend_karma_credit(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION expire_karma_featured() TO service_role;
GRANT EXECUTE ON FUNCTION listing_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION listing_has_paid_tier(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION karma_leaderboard(text, int) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON karma_events, karma_credits TO service_role;
GRANT SELECT ON karma_rules TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE karma_events_id_seq TO service_role;

SELECT cron.unschedule('expire-karma-featured')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-karma-featured');
SELECT cron.schedule('expire-karma-featured', '23 * * * *', 'SELECT public.expire_karma_featured()');
