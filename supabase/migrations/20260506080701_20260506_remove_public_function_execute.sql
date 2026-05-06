/*
  # Remove Public EXECUTE Permissions from SECURITY DEFINER Functions

  1. Security Issue
    - Functions have `{=X/postgres}` ACL, granting EXECUTE to all roles (public)
    - These SECURITY DEFINER functions run with elevated privileges
    - Must only be callable by service role (via edge functions)

  2. Solution
    - Drop and recreate each function without public grants
    - Recreate with only postgres and service_role having EXECUTE
*/

-- Drop existing functions (CASCADE to handle triggers)
DROP FUNCTION IF EXISTS public.set_free_listing_expiration() CASCADE;
DROP FUNCTION IF EXISTS public.update_vote_counts() CASCADE;
DROP FUNCTION IF EXISTS public.increment_view_count(p_submission_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.mark_expired_listings() CASCADE;
DROP FUNCTION IF EXISTS public.record_cleanup_run(p_expired_count integer, p_notified_count integer) CASCADE;
DROP FUNCTION IF EXISTS public.renew_free_listing(submission_id uuid) CASCADE;
DROP FUNCTION IF EXISTS public.should_run_cleanup() CASCADE;

-- Recreate functions with restricted permissions
CREATE FUNCTION public.increment_view_count(p_submission_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
new_count integer;
today_date date;
BEGIN
today_date := CURRENT_DATE;

-- Increment view count in submissions table
UPDATE software_submissions
SET view_count = COALESCE(view_count, 0) + 1
WHERE id = p_submission_id
RETURNING view_count INTO new_count;

-- Update daily analytics
INSERT INTO submission_analytics_daily (submission_id, date, views, clicks, unique_visitors)
VALUES (p_submission_id, today_date, 1, 0, 0)
ON CONFLICT (submission_id, date)
DO UPDATE SET
views = submission_analytics_daily.views + 1;

RETURN new_count;
END;
$function$;

CREATE FUNCTION public.mark_expired_listings()
RETURNS TABLE(id uuid, email text, title text, url text, expires_at timestamp with time zone, notification_type text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
UPDATE software_submissions
SET status = 'expired'
WHERE status = 'approved'
AND (tier = 'free' OR tier IS NULL)
AND expires_at IS NOT NULL
AND expires_at <= now()
AND status != 'expired';

RETURN QUERY
SELECT 
s.id,
s.email,
s.title,
s.url,
s.expires_at,
'expired'::text as notification_type
FROM software_submissions s
WHERE s.status = 'expired'
AND (s.tier = 'free' OR s.tier IS NULL)
AND s.expires_at IS NOT NULL
AND s.expires_at >= now() - interval '1 day'

UNION ALL

SELECT 
s.id,
s.email,
s.title,
s.url,
s.expires_at,
'expiring_soon'::text as notification_type
FROM software_submissions s
WHERE s.status = 'approved'
AND (s.tier = 'free' OR s.tier IS NULL)
AND s.expires_at IS NOT NULL
AND s.expires_at > now()
AND s.expires_at <= now() + interval '7 days';
END;
$function$;

CREATE FUNCTION public.record_cleanup_run(p_expired_count integer DEFAULT 0, p_notified_count integer DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
UPDATE cleanup_runs
SET 
last_run = now(),
expired_count = p_expired_count,
notified_count = p_notified_count
WHERE id IN (
SELECT id FROM cleanup_runs ORDER BY last_run DESC LIMIT 1
);
END;
$function$;

CREATE FUNCTION public.renew_free_listing(submission_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
UPDATE software_submissions
SET 
expires_at = CURRENT_TIMESTAMP + interval '90 days',
last_renewed_at = CURRENT_TIMESTAMP,
renewal_count = renewal_count + 1
WHERE id = submission_id
AND (tier = 'free' OR tier IS NULL);
END;
$function$;

CREATE FUNCTION public.set_free_listing_expiration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
IF (NEW.tier = 'free' OR NEW.tier IS NULL) THEN
NEW.expires_at := NEW.created_at + interval '90 days';
END IF;
RETURN NEW;
END;
$function$;

CREATE FUNCTION public.should_run_cleanup()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
last_cleanup timestamptz;
BEGIN
SELECT last_run INTO last_cleanup
FROM cleanup_runs
ORDER BY last_run DESC
LIMIT 1;

RETURN (last_cleanup IS NULL OR last_cleanup < now() - interval '1 hour');
END;
$function$;

CREATE FUNCTION public.update_vote_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
IF TG_OP = 'INSERT' THEN
IF NEW.vote_type = 'upvote' THEN
UPDATE software_submissions
SET upvotes = upvotes + 1
WHERE id = NEW.submission_id;
ELSE
UPDATE software_submissions
SET downvotes = downvotes + 1
WHERE id = NEW.submission_id;
END IF;
RETURN NEW;
ELSIF TG_OP = 'UPDATE' THEN
IF OLD.vote_type = 'upvote' AND NEW.vote_type = 'downvote' THEN
UPDATE software_submissions
SET upvotes = upvotes - 1, downvotes = downvotes + 1
WHERE id = NEW.submission_id;
ELSIF OLD.vote_type = 'downvote' AND NEW.vote_type = 'upvote' THEN
UPDATE software_submissions
SET upvotes = upvotes + 1, downvotes = downvotes - 1
WHERE id = NEW.submission_id;
END IF;
RETURN NEW;
ELSIF TG_OP = 'DELETE' THEN
IF OLD.vote_type = 'upvote' THEN
UPDATE software_submissions
SET upvotes = upvotes - 1
WHERE id = OLD.submission_id;
ELSE
UPDATE software_submissions
SET downvotes = downvotes - 1
WHERE id = OLD.submission_id;
END IF;
RETURN OLD;
END IF;
END;
$function$;

-- Grant EXECUTE only to service_role (postgres role is the owner)
GRANT EXECUTE ON FUNCTION public.increment_view_count(p_submission_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_expired_listings() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_cleanup_run(p_expired_count integer, p_notified_count integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_free_listing(submission_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_free_listing_expiration() TO service_role;
GRANT EXECUTE ON FUNCTION public.should_run_cleanup() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_vote_counts() TO service_role;

-- Recreate triggers
CREATE TRIGGER set_free_listing_expiration_trigger
BEFORE INSERT ON software_submissions
FOR EACH ROW
EXECUTE FUNCTION public.set_free_listing_expiration();

CREATE TRIGGER update_vote_counts_trigger
AFTER INSERT OR UPDATE OR DELETE ON votes
FOR EACH ROW
EXECUTE FUNCTION public.update_vote_counts();
