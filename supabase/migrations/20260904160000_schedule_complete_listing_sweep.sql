/*
  # Periodic asset sweep

  Every ten minutes, ask the `complete-listing` edge function to fill assets
  for up to three approved listings that still lack a logo, image or
  screenshot (see listings_needing_assets()). Approval already triggers a
  run for the listing being approved; this catches the misses: a site that
  was down at approval time, a screenshot provider that failed, listings
  approved before the function existed.

  The function needs no JWT and throttles itself, so the job carries no
  secret. The URL is this project's; a different project needs its own.
*/

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('complete-listing-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'complete-listing-sweep');

SELECT cron.schedule(
  'complete-listing-sweep',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://yfkuksfqyddufusonyuf.supabase.co/functions/v1/complete-listing',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"batch": 3}'::jsonb,
      timeout_milliseconds := 120000
    )
  $$
);
