/*
  # Listing asset completion

  `assets_checked_at` records the last time we tried to fill a listing's
  logo, og:image and screenshots. It lets the periodic sweep skip listings we
  tried recently (a site with no favicon stays without one; no point asking
  every ten minutes) and bounds how often an unauthenticated caller can make
  us hit a screenshot provider.

  `listings_needing_assets()` is the one query both the edge function and the
  local backfill script use to pick work, so they cannot disagree on what
  "incomplete" means: approved, not checked within the cooldown, and missing
  a logo, an image, or any screenshot.
*/

ALTER TABLE software_submissions
  ADD COLUMN IF NOT EXISTS assets_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS software_submissions_assets_checked_idx
  ON software_submissions (assets_checked_at NULLS FIRST)
  WHERE status = 'approved';

CREATE OR REPLACE FUNCTION public.listings_needing_assets(
  max_rows integer DEFAULT 5,
  cooldown interval DEFAULT interval '14 days'
)
RETURNS SETOF software_submissions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ss.*
  FROM software_submissions ss
  WHERE ss.status = 'approved'
    AND (ss.assets_checked_at IS NULL OR ss.assets_checked_at < now() - cooldown)
    AND (
      ss.logo IS NULL OR ss.logo = ''
      OR ss.image IS NULL OR ss.image = ''
      OR NOT EXISTS (SELECT 1 FROM submission_screenshots s WHERE s.submission_id = ss.id)
    )
  ORDER BY ss.assets_checked_at NULLS FIRST, ss.updated_at DESC
  LIMIT max_rows
$$;

REVOKE ALL ON FUNCTION public.listings_needing_assets(integer, interval) FROM PUBLIC, anon, authenticated;
