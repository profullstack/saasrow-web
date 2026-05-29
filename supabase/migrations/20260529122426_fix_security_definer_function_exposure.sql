/*
  # Fix SECURITY DEFINER function exposure and autoblog_config RLS

  ## Summary
  Revokes EXECUTE on all SECURITY DEFINER functions from anon and authenticated roles.
  These functions are either trigger functions (never called via RPC) or are only
  called internally via service-role edge functions — public RPC access is not intended
  and constitutes a security vulnerability.

  Also adds a restrictive "no public access" policy comment to autoblog_config, which
  has RLS enabled but zero policies (correct — all access is via service role key only,
  no client-side policies needed). The table is intentionally locked down; we add an
  explicit note via a comment to satisfy the linter expectation.

  ## Functions fixed
  - increment_view_count     — called only from increment-view edge function (service role)
  - mark_expired_listings    — called only from cleanup-expired-listings edge function
  - record_cleanup_run       — called only from cleanup edge function
  - renew_free_listing       — called only from renew-listing edge function
  - set_free_listing_expiration — trigger function, never direct RPC
  - should_run_cleanup       — called only from cleanup edge function
  - update_vote_counts       — trigger function, never direct RPC

  ## Security changes
  - REVOKE EXECUTE on all 7 functions from anon and authenticated
  - Add comment on autoblog_config confirming intentional no-policy lockdown
*/

-- Revoke public RPC access from all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.increment_view_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_expired_listings() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_cleanup_run(integer, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.renew_free_listing(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_free_listing_expiration() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.should_run_cleanup() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_vote_counts() FROM anon, authenticated;

-- autoblog_config: intentionally no RLS policies — all access is via service role key
-- only (webhook route handler and admin edge functions). Adding a comment to document
-- this intentional design so security scanners understand it is not an oversight.
COMMENT ON TABLE public.autoblog_config IS
  'Autoblog webhook configuration. RLS is enabled with no client-facing policies by design. All reads and writes go through service-role key only (API route handlers / edge functions).';
