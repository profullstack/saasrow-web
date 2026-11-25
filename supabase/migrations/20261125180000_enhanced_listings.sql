/*
  # Enhanced listings

  Featured and Premium listings get long-form sections on their page: an
  overview, a named feature list, a pricing table and a "who it is for"
  paragraph. They are stored as one JSON object per listing (shape and limits
  in src/lib/enhanced.ts) and shown only while the listing's tier is paid.
*/

ALTER TABLE software_submissions
  ADD COLUMN IF NOT EXISTS enhanced jsonb;

ALTER TABLE software_submissions DROP CONSTRAINT IF EXISTS enhanced_is_object;
ALTER TABLE software_submissions ADD CONSTRAINT enhanced_is_object
  CHECK (enhanced IS NULL OR (jsonb_typeof(enhanced) = 'object' AND pg_column_size(enhanced) < 32768));

NOTIFY pgrst, 'reload schema';
