-- Customer webhooks on @profullstack/webhooks 0.2.1.
--
-- A listing owner registers HTTPS endpoints (/api/v1/webhooks, the manage
-- page, `saasrow webhooks`, MCP) and SaaSRow POSTs signed CloudEvents to them
-- when something happens to their products or their karma.
--
-- Three parts:
--
-- 1. The hub's own tables, exactly schemaSql('pg', 'hub_') of the package, so
--    a later switch to its postgresStore needs no data change. The Next app
--    has no Postgres connection string (only supabase-js), so it reads and
--    writes them through a small WebhookStore adapter
--    (src/lib/webhooks/supabase-store.ts); claim_hub_webhook_deliveries is
--    the FOR UPDATE SKIP LOCKED claim PostgREST cannot express.
--
-- 2. An event outbox, hub_webhook_events. SaaSRow's domain events happen in
--    many places: Next routes, Deno edge functions (approval, CoinPay
--    upgrades, anonymous votes and comments), and Postgres functions (karma).
--    Triggers on the tables those all write to put one row here per event,
--    and the Next server turns each row into hooks.emit() (src/lib/webhooks/
--    hub.ts, pumpEvents). Rows are only written for owners who have an enabled
--    endpoint, and a trigger failure never fails the write that caused it.
--
-- 3. The triggers:
--      software_submissions  status -> approved      product.approved
--                            status -> rejected      product.rejected
--                            tier -> featured|premium product.featured
--      votes                 a new upvote            product.upvoted
--      comments              a comment goes public   product.commented
--      karma_events          any karma row           karma.changed
--    The owner of a product event is listing_owner(submission): the account
--    that owns the listing. karma.changed goes to the member whose karma moved.
--
-- Only the server (service role) touches any of this: RLS on, no policies,
-- functions granted to service_role alone.
--
-- Idempotent: safe to re-run.

-- ------------------------------------------------------------ hub tables --

create table if not exists public.hub_webhook_endpoints (
  id text primary key,
  owner text not null,
  url text not null,
  secret text not null,
  events text not null default '["*"]',
  description text not null default '',
  enabled integer not null default 1,
  failures integer not null default 0,
  disabled_reason text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_endpoints_owner on public.hub_webhook_endpoints(owner);

create table if not exists public.hub_webhook_deliveries (
  id text primary key,
  endpoint_id text not null,
  owner text not null,
  event_id text not null,
  event_type text not null,
  payload text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_at bigint not null,
  last_status integer,
  last_error text,
  created_at bigint not null,
  updated_at bigint not null
);
create index if not exists hub_webhook_deliveries_due on public.hub_webhook_deliveries(status, next_at);
create index if not exists hub_webhook_deliveries_endpoint on public.hub_webhook_deliveries(endpoint_id, created_at);
create index if not exists hub_webhook_deliveries_owner on public.hub_webhook_deliveries(owner, created_at);

create table if not exists public.hub_webhook_events (
  id bigserial primary key,
  owner text not null,
  type text not null,
  subject text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  claimed_until timestamptz
);

alter table public.hub_webhook_endpoints enable row level security;
alter table public.hub_webhook_deliveries enable row level security;
alter table public.hub_webhook_events enable row level security;
revoke all on public.hub_webhook_endpoints from anon, authenticated;
revoke all on public.hub_webhook_deliveries from anon, authenticated;
revoke all on public.hub_webhook_events from anon, authenticated;
revoke all on sequence public.hub_webhook_events_id_seq from anon, authenticated;
grant all on public.hub_webhook_endpoints to service_role;
grant all on public.hub_webhook_deliveries to service_role;
grant all on public.hub_webhook_events to service_role;
grant usage, select on sequence public.hub_webhook_events_id_seq to service_role;

-- Take up to p_limit due deliveries and lease them until p_lease_until, so two
-- app processes never send the same row.
create or replace function public.claim_hub_webhook_deliveries(p_now bigint, p_limit integer, p_lease_until bigint)
returns setof public.hub_webhook_deliveries
language sql
volatile
set search_path to 'public'
as $function$
  update public.hub_webhook_deliveries
     set next_at = p_lease_until
   where id in (
     select id from public.hub_webhook_deliveries
      where status = 'pending' and next_at <= p_now
      order by next_at
      limit p_limit
      for update skip locked
   )
  returning *;
$function$;
revoke execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) from public, anon, authenticated;
grant execute on function public.claim_hub_webhook_deliveries(bigint, integer, bigint) to service_role;

-- Take up to p_limit outbox events for two minutes. The app deletes each one
-- once hooks.emit() has queued it; a crashed pump's lease simply runs out.
create or replace function public.claim_hub_webhook_events(p_limit integer)
returns setof public.hub_webhook_events
language sql
volatile
set search_path to 'public'
as $function$
  update public.hub_webhook_events
     set claimed_until = now() + interval '2 minutes'
   where id in (
     select id from public.hub_webhook_events
      where claimed_until is null or claimed_until < now()
      order by id
      limit p_limit
      for update skip locked
   )
  returning *;
$function$;
revoke execute on function public.claim_hub_webhook_events(integer) from public, anon, authenticated;
grant execute on function public.claim_hub_webhook_events(integer) to service_role;

-- ----------------------------------------------------------------- outbox --

-- Does this account have anywhere to send events? Checked before a trigger
-- builds a payload, so accounts without webhooks cost one index probe.
create or replace function public.hub_webhook_wanted(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_owner is not null
     and exists (select 1 from public.hub_webhook_endpoints where owner = p_owner::text and enabled = 1)
$function$;
revoke execute on function public.hub_webhook_wanted(uuid) from public, anon, authenticated;
grant execute on function public.hub_webhook_wanted(uuid) to service_role;

create or replace function public.hub_webhook_enqueue(p_owner uuid, p_type text, p_subject text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.hub_webhook_wanted(p_owner) then
    return;
  end if;
  insert into public.hub_webhook_events (owner, type, subject, data)
  values (p_owner::text, p_type, p_subject, coalesce(p_data, '{}'::jsonb));
end;
$function$;
revoke execute on function public.hub_webhook_enqueue(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.hub_webhook_enqueue(uuid, text, text, jsonb) to service_role;

-- The product as a receiver sees it: what it is and where it lives.
create or replace function public.hub_webhook_product(p_submission uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
           'id', s.id,
           'title', s.title,
           'url', s.url,
           'status', s.status,
           'tier', s.tier,
           'upvotes', coalesce(s.upvotes, 0),
           'downvotes', coalesce(s.downvotes, 0),
           'saasrow_url', 'https://saasrow.com/software/' || s.id
         )
    from public.software_submissions s
   where s.id = p_submission
$function$;
revoke execute on function public.hub_webhook_product(uuid) from public, anon, authenticated;
grant execute on function public.hub_webhook_product(uuid) to service_role;

-- ---------------------------------------------------------------- triggers --
-- Each one is AFTER, SECURITY DEFINER, and swallows its own errors: a webhook
-- must never be the reason a vote, comment, approval or payment fails. The
-- "zz_" names make them fire after the app's own AFTER triggers (Postgres
-- fires same-event triggers in name order), so vote counts and karma totals
-- already include the change.

create or replace function public.hub_webhook_on_listing()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
  v_product jsonb;
  v_old_status text := case when tg_op = 'UPDATE' then old.status else null end;
  v_old_tier text := case when tg_op = 'UPDATE' then old.tier else null end;
  v_featured boolean;
  v_was_featured boolean;
begin
  begin
    v_featured := coalesce(new.tier, 'free') in ('featured', 'premium');
    v_was_featured := tg_op = 'UPDATE' and coalesce(v_old_tier, 'free') in ('featured', 'premium');
    if new.status is not distinct from v_old_status
       and (not v_featured or new.tier is not distinct from v_old_tier) then
      return null;
    end if;

    v_owner := public.listing_owner(new.id);
    if not public.hub_webhook_wanted(v_owner) then
      return null;
    end if;
    v_product := public.hub_webhook_product(new.id);

    if new.status is distinct from v_old_status and new.status in ('approved', 'rejected') then
      perform public.hub_webhook_enqueue(
        v_owner,
        'product.' || new.status,
        'product:' || new.id,
        jsonb_build_object('product', v_product, 'previous_status', v_old_status)
      );
    end if;

    if v_featured and new.tier is distinct from v_old_tier then
      perform public.hub_webhook_enqueue(
        v_owner,
        'product.featured',
        'product:' || new.id,
        jsonb_build_object(
          'product', v_product,
          'tier', new.tier,
          'previous_tier', coalesce(v_old_tier, 'free'),
          'upgrade', v_was_featured,
          'featured_until', new.featured_until
        )
      );
    end if;
  exception when others then
    raise warning 'hub_webhook_on_listing: %', sqlerrm;
  end;
  return null;
end;
$function$;

create or replace function public.hub_webhook_on_vote()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  begin
    if new.vote_type <> 'upvote' then
      return null;
    end if;
    if tg_op = 'UPDATE' and old.vote_type = 'upvote' then
      return null;
    end if;
    v_owner := public.listing_owner(new.submission_id);
    if not public.hub_webhook_wanted(v_owner) or v_owner is not distinct from new.user_id then
      return null;
    end if;
    perform public.hub_webhook_enqueue(
      v_owner,
      'product.upvoted',
      'product:' || new.submission_id,
      jsonb_build_object(
        'product', public.hub_webhook_product(new.submission_id),
        'vote', jsonb_build_object(
          'id', new.id,
          'member', new.user_id is not null and not coalesce(new.is_anonymous, false),
          'at', new.created_at
        )
      )
    );
  exception when others then
    raise warning 'hub_webhook_on_vote: %', sqlerrm;
  end;
  return null;
end;
$function$;

create or replace function public.hub_webhook_on_comment()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_owner uuid;
begin
  begin
    -- Public means verified: on insert for members, on moderation for the rest.
    if not coalesce(new.is_verified, false) then
      return null;
    end if;
    if tg_op = 'UPDATE' and coalesce(old.is_verified, false) then
      return null;
    end if;
    v_owner := public.listing_owner(new.submission_id);
    if not public.hub_webhook_wanted(v_owner) or v_owner is not distinct from new.user_id then
      return null;
    end if;
    -- Never the commenter's email or address: just what the page shows.
    perform public.hub_webhook_enqueue(
      v_owner,
      'product.commented',
      'product:' || new.submission_id,
      jsonb_build_object(
        'product', public.hub_webhook_product(new.submission_id),
        'comment', jsonb_build_object(
          'id', new.id,
          'author_name', new.author_name,
          'content', new.content,
          'rating', new.rating,
          'member', new.user_id is not null,
          'created_at', new.created_at
        )
      )
    );
  exception when others then
    raise warning 'hub_webhook_on_comment: %', sqlerrm;
  end;
  return null;
end;
$function$;

create or replace function public.hub_webhook_on_karma()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  begin
    if not public.hub_webhook_wanted(new.user_id) then
      return null;
    end if;
    perform public.hub_webhook_enqueue(
      new.user_id,
      'karma.changed',
      'karma:' || new.id,
      jsonb_build_object(
        'action', new.action,
        'points', new.points,
        'reversal', new.bucket = 'reversed',
        'total', (select coalesce(sum(points), 0) from public.karma_events where user_id = new.user_id),
        'product', case when new.submission_id is null then null
                        else public.hub_webhook_product(new.submission_id) end,
        'at', new.created_at
      )
    );
  exception when others then
    raise warning 'hub_webhook_on_karma: %', sqlerrm;
  end;
  return null;
end;
$function$;

revoke execute on function public.hub_webhook_on_listing() from public, anon, authenticated;
revoke execute on function public.hub_webhook_on_vote() from public, anon, authenticated;
revoke execute on function public.hub_webhook_on_comment() from public, anon, authenticated;
revoke execute on function public.hub_webhook_on_karma() from public, anon, authenticated;

drop trigger if exists zz_hub_webhook_listing on public.software_submissions;
create trigger zz_hub_webhook_listing
  after insert or update of status, tier on public.software_submissions
  for each row execute function public.hub_webhook_on_listing();

drop trigger if exists zz_hub_webhook_vote on public.votes;
create trigger zz_hub_webhook_vote
  after insert or update of vote_type on public.votes
  for each row execute function public.hub_webhook_on_vote();

drop trigger if exists zz_hub_webhook_comment on public.comments;
create trigger zz_hub_webhook_comment
  after insert or update of is_verified on public.comments
  for each row execute function public.hub_webhook_on_comment();

drop trigger if exists zz_hub_webhook_karma on public.karma_events;
create trigger zz_hub_webhook_karma
  after insert on public.karma_events
  for each row execute function public.hub_webhook_on_karma();
