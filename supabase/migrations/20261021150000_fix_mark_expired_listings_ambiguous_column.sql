-- mark_expired_listings() RETURNS TABLE(id, email, title, url, expires_at, ...),
-- so inside the body `expires_at` is also a PL/pgSQL OUT variable. The
-- unqualified UPDATE ... WHERE expires_at <= now() failed every run with
-- 42702 "column reference expires_at is ambiguous", which made the
-- cleanup-expired-listings edge function 500 and no free listing ever expired.
-- Qualify every column with a table alias.
CREATE OR REPLACE FUNCTION public.mark_expired_listings()
 RETURNS TABLE(id uuid, email text, title text, url text, expires_at timestamp with time zone, notification_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE software_submissions AS u
  SET status = 'expired'
  WHERE u.status = 'approved'
    AND (u.tier = 'free' OR u.tier IS NULL)
    AND u.expires_at IS NOT NULL
    AND u.expires_at <= now();

  RETURN QUERY
  SELECT s.id, s.email, s.title, s.url, s.expires_at, 'expired'::text AS notification_type
  FROM software_submissions s
  WHERE s.status = 'expired'
    AND (s.tier = 'free' OR s.tier IS NULL)
    AND s.expires_at IS NOT NULL
    AND s.expires_at >= now() - interval '1 day'

  UNION ALL

  SELECT s.id, s.email, s.title, s.url, s.expires_at, 'expiring_soon'::text AS notification_type
  FROM software_submissions s
  WHERE s.status = 'approved'
    AND (s.tier = 'free' OR s.tier IS NULL)
    AND s.expires_at IS NOT NULL
    AND s.expires_at > now()
    AND s.expires_at <= now() + interval '7 days';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.mark_expired_listings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_expired_listings() TO service_role;
