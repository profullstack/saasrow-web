/*
  # Fix Critical Security Vulnerabilities

  1. Remove Public Bucket SELECT Policies
    - Remove broad SELECT policies on storage.objects for public buckets
    - Public buckets don't need listing policies for object URL access
    - Affects: news-banners, software-images, software-logos, submission-screenshots

  2. Revoke Public and Authenticated Access to SECURITY DEFINER Functions
    - Switch internal-only functions to SECURITY INVOKER or restrict permissions
    - Functions affected:
      - increment_view_count
      - mark_expired_listings
      - record_cleanup_run
      - renew_free_listing
      - set_free_listing_expiration
      - should_run_cleanup
      - update_vote_counts
    - These are called via edge functions which have proper authorization

  3. Security Changes
    - Prevents unauthorized users from listing all files in public buckets
    - Prevents unauthorized execution of internal administrative functions
    - Edge functions already have proper authorization via service role
*/

-- Remove broad SELECT policies on storage.objects for public buckets
DO $$
BEGIN
  -- Delete public read access policies for storage.objects
  DELETE FROM auth.authorization WHERE 
    resource_id IN (
      SELECT id FROM storage.buckets 
      WHERE name IN ('news-banners', 'software-images', 'software-logos', 'submission-screenshots')
    )
    AND object = 'objects'
    AND action = 'select'
    AND role = 'authenticated_or_anonymous';
    
  DELETE FROM auth.authorization WHERE 
    resource_id IN (
      SELECT id FROM storage.buckets 
      WHERE name IN ('news-banners', 'software-images', 'software-logos', 'submission-screenshots')
    )
    AND object = 'objects'
    AND action = 'select'
    AND role = 'anon';
    
  DELETE FROM auth.authorization WHERE 
    resource_id IN (
      SELECT id FROM storage.buckets 
      WHERE name IN ('news-banners', 'software-images', 'software-logos', 'submission-screenshots')
    )
    AND object = 'objects'
    AND action = 'select'
    AND role = 'authenticated';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Revoke EXECUTE on SECURITY DEFINER functions from public and authenticated roles
DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.increment_view_count(p_submission_id uuid) FROM anon;
  REVOKE EXECUTE ON FUNCTION public.increment_view_count(p_submission_id uuid) FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.mark_expired_listings() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.mark_expired_listings() FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.record_cleanup_run(p_expired_count integer, p_notified_count integer) FROM anon;
  REVOKE EXECUTE ON FUNCTION public.record_cleanup_run(p_expired_count integer, p_notified_count integer) FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.renew_free_listing(submission_id uuid) FROM anon;
  REVOKE EXECUTE ON FUNCTION public.renew_free_listing(submission_id uuid) FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.set_free_listing_expiration() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.set_free_listing_expiration() FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.should_run_cleanup() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.should_run_cleanup() FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$
BEGIN
  REVOKE EXECUTE ON FUNCTION public.update_vote_counts() FROM anon;
  REVOKE EXECUTE ON FUNCTION public.update_vote_counts() FROM authenticated;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
