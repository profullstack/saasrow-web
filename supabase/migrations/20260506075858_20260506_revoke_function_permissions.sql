/*
  # Revoke SECURITY DEFINER Function Execution Permissions

  1. Security Issue
    - Seven SECURITY DEFINER functions are executable by both `anon` and `authenticated` roles
    - These internal functions should only be callable via edge functions with service role
    - Prevents unauthorized privilege escalation through function execution

  2. Functions Fixed
    - increment_view_count
    - mark_expired_listings
    - record_cleanup_run
    - renew_free_listing
    - set_free_listing_expiration
    - should_run_cleanup
    - update_vote_counts

  3. Solution
    - Revoke EXECUTE from both anon and authenticated roles
    - Edge functions use service role key and can still execute these functions
*/

REVOKE EXECUTE ON FUNCTION public.increment_view_count(p_submission_id uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.mark_expired_listings() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_cleanup_run(p_expired_count integer, p_notified_count integer) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.renew_free_listing(submission_id uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.set_free_listing_expiration() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.should_run_cleanup() FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.update_vote_counts() FROM anon, authenticated;
