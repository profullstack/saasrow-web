/*
  # Rename newsletter_history.mailgun_id to resend_id

  Email sending migrated from Mailgun to Resend. The newsletter_history table
  stored the provider message ID in `mailgun_id`; rename it to `resend_id` so
  the column name reflects the current provider.

  Idempotent: only renames if the old column still exists.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'newsletter_history' AND column_name = 'mailgun_id'
  ) THEN
    ALTER TABLE newsletter_history RENAME COLUMN mailgun_id TO resend_id;
  END IF;
END $$;
