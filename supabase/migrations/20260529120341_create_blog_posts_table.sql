/*
  # Create blog_posts table

  ## Summary
  Creates a dedicated `blog_posts` table for auto-blogging via crawlproof.com webhooks.
  This is separate from `news_posts` (which is AI-generated editorial content).
  Blog posts arrive via the @profullstack/autoblog webhook protocol (CloudEvents +
  Standard Webhooks) and are stored verbatim from the sender.

  ## New Tables

  ### blog_posts
  - `id` (uuid, PK) — internal identifier
  - `external_id` (text, unique) — post ID from the sending platform (e.g. crawlproof)
  - `slug` (text, unique) — URL-safe slug
  - `title` (text) — post title
  - `excerpt` (text) — optional short summary
  - `content` (text) — HTML body
  - `markdown` (text) — markdown version if provided
  - `status` (text) — published | draft | scheduled | unpublished
  - `author_name` (text) — author display name
  - `author_url` (text) — link to author profile
  - `featured_image_url` (text) — hero image URL
  - `featured_image_alt` (text) — hero image alt text
  - `tags` (text[]) — tag array
  - `categories` (text[]) — category array
  - `source_url` (text) — canonical URL from sender
  - `published_at` (timestamptz) — when the post was published by sender
  - `created_at` (timestamptz) — when we received it
  - `updated_at` (timestamptz) — last update received

  ## Security
  - RLS enabled; public users can SELECT published posts
  - No direct INSERT/UPDATE/DELETE from client — all writes come through the
    service-role key used by the webhook edge function
*/

CREATE TABLE IF NOT EXISTS blog_posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id        text UNIQUE,
  slug               text UNIQUE NOT NULL,
  title              text NOT NULL DEFAULT '',
  excerpt            text DEFAULT '',
  content            text DEFAULT '',
  markdown           text DEFAULT '',
  status             text NOT NULL DEFAULT 'draft',
  author_name        text DEFAULT '',
  author_url         text DEFAULT '',
  featured_image_url text DEFAULT '',
  featured_image_alt text DEFAULT '',
  tags               text[] DEFAULT '{}',
  categories         text[] DEFAULT '{}',
  source_url         text DEFAULT '',
  published_at       timestamptz DEFAULT now(),
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS blog_posts_status_published_at
  ON blog_posts (status, published_at DESC);

ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published blog posts"
  ON blog_posts FOR SELECT
  TO anon, authenticated
  USING (status = 'published');
