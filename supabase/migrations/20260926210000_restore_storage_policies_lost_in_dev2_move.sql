-- Restore the RLS policies on storage.objects that the 2026-09-25 move to the
-- self-hosted Supabase stack on dev2 left behind.
--
-- The move dumped DDL for the app schemas only, and pg_dump files a policy
-- under its table's schema, so every policy ON storage.objects was dropped.
-- The bucket rows and objects were copied as data, but with RLS on and no
-- policies, storage.objects denies every request that is not service_role:
-- logo, image and news-banner uploads from the browser fail.
--
-- These are the definitions as they stood after replaying every migration in
-- order. 20260506075752 meant to remove the public SELECT policies, but it
-- deleted from auth.authorization, which does not exist, inside an
-- EXCEPTION WHEN OTHERS THEN NULL block, so it never removed anything and
-- they are restored here as they were.
--
-- Idempotent: safe to re-run.

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Public read access for logos" ON storage.objects;
CREATE POLICY "Public read access for logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'software-logos');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Public read access for images" ON storage.objects;
CREATE POLICY "Public read access for images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'software-images');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can upload logos" ON storage.objects;
CREATE POLICY "Anyone can upload logos"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'software-logos');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can upload images" ON storage.objects;
CREATE POLICY "Anyone can upload images"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'software-images');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can update logos" ON storage.objects;
CREATE POLICY "Anyone can update logos"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'software-logos');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can update images" ON storage.objects;
CREATE POLICY "Anyone can update images"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'software-images');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can delete logos" ON storage.objects;
CREATE POLICY "Anyone can delete logos"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'software-logos');

-- from 20251024144237_create_storage_buckets.sql
DROP POLICY IF EXISTS "Anyone can delete images" ON storage.objects;
CREATE POLICY "Anyone can delete images"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'software-images');

-- from 20251025073920_create_screenshot_gallery_table.sql
DROP POLICY IF EXISTS "Public read access for screenshots" ON storage.objects;
CREATE POLICY "Public read access for screenshots"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'submission-screenshots');

-- from 20251025073920_create_screenshot_gallery_table.sql
DROP POLICY IF EXISTS "Service role can upload screenshots" ON storage.objects;
CREATE POLICY "Service role can upload screenshots"
  ON storage.objects FOR INSERT
  TO service_role
  WITH CHECK (bucket_id = 'submission-screenshots');

-- from 20251025073920_create_screenshot_gallery_table.sql
DROP POLICY IF EXISTS "Service role can update screenshots" ON storage.objects;
CREATE POLICY "Service role can update screenshots"
  ON storage.objects FOR UPDATE
  TO service_role
  USING (bucket_id = 'submission-screenshots');

-- from 20251025073920_create_screenshot_gallery_table.sql
DROP POLICY IF EXISTS "Service role can delete screenshots" ON storage.objects;
CREATE POLICY "Service role can delete screenshots"
  ON storage.objects FOR DELETE
  TO service_role
  USING (bucket_id = 'submission-screenshots');

-- from 20251105180111_create_news_banners_storage_bucket.sql
DROP POLICY IF EXISTS "Public read access for news banners" ON storage.objects;
CREATE POLICY "Public read access for news banners"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'news-banners');

-- from 20251105180111_create_news_banners_storage_bucket.sql
DROP POLICY IF EXISTS "Anyone can upload news banners" ON storage.objects;
CREATE POLICY "Anyone can upload news banners"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'news-banners');

-- from 20251105180111_create_news_banners_storage_bucket.sql
DROP POLICY IF EXISTS "Anyone can update news banners" ON storage.objects;
CREATE POLICY "Anyone can update news banners"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'news-banners');

-- from 20251105180111_create_news_banners_storage_bucket.sql
DROP POLICY IF EXISTS "Anyone can delete news banners" ON storage.objects;
CREATE POLICY "Anyone can delete news banners"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'news-banners');
