/*
  # Create autoblog_config table

  ## Summary
  Stores the crawlproof.com webhook configuration for the auto-blogging feature.
  Admins set a shared secret here; the webhook endpoint reads it to verify
  incoming Standard Webhooks signatures from crawlproof.com.

  Only one row is expected (site-wide config). The webhook_secret is the shared
  HMAC-SHA256 secret that both crawlproof.com and this site must know.

  ## New Tables

  ### autoblog_config
  - `id` (uuid, PK)
  - `webhook_secret` (text) — shared HMAC secret for signature verification
  - `enabled` (boolean) — whether the webhook endpoint accepts new posts
  - `created_at` / `updated_at` (timestamptz)

  ## Security
  - RLS enabled; no client access — all reads/writes via service-role key
    through edge functions / API routes only
*/

CREATE TABLE IF NOT EXISTS autoblog_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_secret text NOT NULL DEFAULT '',
  enabled        boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE autoblog_config ENABLE ROW LEVEL SECURITY;

-- No client-facing policies — all access is via service role key
