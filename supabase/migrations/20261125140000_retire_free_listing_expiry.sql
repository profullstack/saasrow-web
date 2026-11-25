/*
  # Free listings no longer expire after 90 days

  The 90-day expiry (and its free "renew" button) was the free tier's only
  cost. The badge rule replaced it (20261125120000): a free listing is live
  for as long as its site carries the SaaSRow badge, which is checked every
  day, with a grace period and emails when it goes missing. Two clocks on one
  listing only confuses people, so this one goes.

    - no new listing gets an expiry date (the trigger is dropped)
    - every existing date is cleared
    - mark_expired_listings() finds nothing from now on; the home page no
      longer calls the cleanup function that ran it

  The columns stay (expires_at, last_renewed_at, renewal_count): old exports
  and the admin view still read them, and they are all null or history now.
*/

DROP TRIGGER IF EXISTS set_free_listing_expiration_trigger ON software_submissions;

-- Clearing a date is bookkeeping, not an edit: keep updated_at (sitemaps and
-- feeds read it) and fire nothing else for 2,500 rows.
ALTER TABLE software_submissions DISABLE TRIGGER USER;
UPDATE software_submissions SET expires_at = NULL WHERE expires_at IS NOT NULL;
ALTER TABLE software_submissions ENABLE TRIGGER USER;

NOTIFY pgrst, 'reload schema';
