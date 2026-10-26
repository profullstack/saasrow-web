-- Function defaults, direct-insert policies and a backup table
-- (2026-10-26 fleet audit).
--
-- * The two exposed SECURITY DEFINER functions are triggers
--   (karma_on_comment_deleted, karma_on_listing_approved); they are revoked
--   from anon/authenticated with every trigger function.
-- * "Anyone can submit software" let the anon key INSERT straight into
--   software_submissions with any tier, featured/homepage/newsletter flags,
--   expires_at or payment id, skipping createListing's validation, URL
--   de-duplication and pending-listing cap. Listings are created by the
--   server and the submissions edge function, both with the service role.
-- * community_posts let any signed-in user insert a post under any author
--   name with any like count; nothing in the app writes the table (0 rows).
-- * blog_posts_bak_001 had RLS off and anon/authenticated grants.

-- Trigger and event-trigger functions are never RPCs.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in ('trigger'::regtype, 'event_trigger'::regtype)
      and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- New functions are not executable by PUBLIC/anon/authenticated by default.
-- A new function the browser calls (or an RLS policy uses) needs an explicit
-- GRANT EXECUTE ... TO anon, authenticated.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

drop policy if exists "Anyone can submit software" on public.software_submissions;
drop policy if exists "Authenticated users can create community posts" on public.community_posts;

alter table public.blog_posts_bak_001 enable row level security;
revoke all on public.blog_posts_bak_001 from anon, authenticated;
