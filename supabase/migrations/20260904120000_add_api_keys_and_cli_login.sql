/*
  # API keys and CLI login codes

  Backs the authenticated write side of the public API (`/api/v1/keys`,
  `/api/v1/listings`), the write tools on the MCP server, and the
  `saasrow login` CLI command.

  ## New tables

  - `api_keys` — one row per key a user has created. Only a SHA-256 hash of
    the key is stored; the plaintext is shown exactly once at creation. A key
    is revoked by setting `revoked_at`, never deleted, so audit history and
    `last_used_at` survive.
  - `cli_login_codes` — short-lived one-time codes emailed by the `cli-login`
    edge function. Stored hashed with the email folded in, capped at five
    guesses, expired after fifteen minutes, consumed on success.

  ## Security

  Both tables enable RLS with no policies: nothing but the service role can
  read them. Every access path is a server-side route that has already
  authenticated the caller.
*/

CREATE TABLE IF NOT EXISTS api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT api_keys_name_length CHECK (char_length(name) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys(user_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cli_login_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cli_login_codes_email_created_idx
  ON cli_login_codes(email, created_at DESC);

ALTER TABLE cli_login_codes ENABLE ROW LEVEL SECURITY;

-- Listings created through the API carry user_id from the start; legacy
-- website submissions get it backfilled the first time their owner signs in.
CREATE INDEX IF NOT EXISTS software_submissions_user_id_idx
  ON software_submissions(user_id);
