-- Distribution layer: structured product vocabulary + AI read tracking.
--
-- Everything here is additive and nullable. The ~314 listings that predate
-- this migration keep working untouched; the new columns simply read as NULL
-- until a maker fills them in.

-- ---------------------------------------------------------------------------
-- 1. Controlled-vocabulary columns on listings
-- ---------------------------------------------------------------------------
alter table public.software_submissions
  add column if not exists use_cases    text[],
  add column if not exists audiences    text[],
  add column if not exists platforms    text[],
  add column if not exists pricing_model text,
  add column if not exists alternatives text[];

comment on column public.software_submissions.use_cases is
  'Controlled vocabulary; see src/lib/vocab.ts USE_CASES.';
comment on column public.software_submissions.audiences is
  'Controlled vocabulary; see src/lib/vocab.ts AUDIENCES.';
comment on column public.software_submissions.platforms is
  'Controlled vocabulary; see src/lib/vocab.ts PLATFORMS.';
comment on column public.software_submissions.pricing_model is
  'Controlled vocabulary; see src/lib/vocab.ts PRICING_MODELS.';
comment on column public.software_submissions.alternatives is
  'Free-text competitor product names powering "alternative to X" queries.';

-- GIN indexes so the public API can filter on array containment without a
-- sequential scan once the directory grows past a few thousand rows.
create index if not exists software_submissions_use_cases_idx
  on public.software_submissions using gin (use_cases);
create index if not exists software_submissions_audiences_idx
  on public.software_submissions using gin (audiences);
create index if not exists software_submissions_platforms_idx
  on public.software_submissions using gin (platforms);
create index if not exists software_submissions_alternatives_idx
  on public.software_submissions using gin (alternatives);

-- "Alternative to X" is one of the most common ways a person or an assistant
-- looks for a product, and makers type competitor names with inconsistent
-- casing ("Notion", "notion", "NOTION"). A stored generated column holding the
-- lowercased names lets the API match case-insensitively and still use an
-- index. The function must be IMMUTABLE for Postgres to allow it here.
create or replace function public.lower_text_array(arr text[])
  returns text[]
  language sql
  immutable
  parallel safe
  set search_path = ''
as $$
  select case when arr is null then null
              else array(select lower(item) from unnest(arr) as item)
         end
$$;

alter table public.software_submissions
  add column if not exists alternatives_lc text[]
  generated always as (public.lower_text_array(alternatives)) stored;

create index if not exists software_submissions_alternatives_lc_idx
  on public.software_submissions using gin (alternatives_lc);
create index if not exists software_submissions_pricing_model_idx
  on public.software_submissions (pricing_model)
  where pricing_model is not null;

-- ---------------------------------------------------------------------------
-- 2. AI read tracking
-- ---------------------------------------------------------------------------
-- Powers the "read by AI assistants" counter. We record one row per request
-- from a recognised AI crawler or API/MCP client. No IP address and no raw
-- user-agent string is stored -- only the bot family we matched -- so this
-- stays out of personal-data territory.
create table if not exists public.ai_reads (
  id          bigserial primary key,
  bot         text not null,
  channel     text not null check (channel in ('crawler', 'api', 'mcp', 'llms_txt')),
  path        text,
  submission_id uuid references public.software_submissions (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_reads_created_at_idx on public.ai_reads (created_at desc);
create index if not exists ai_reads_bot_idx on public.ai_reads (bot);
create index if not exists ai_reads_submission_idx on public.ai_reads (submission_id)
  where submission_id is not null;

alter table public.ai_reads enable row level security;

-- Reads are aggregated for the public stats endpoint, so allow anonymous
-- SELECT. Writes go through the service-role key in the route handlers only,
-- which deliberately has no policy here (service_role bypasses RLS).
drop policy if exists "ai_reads_public_select" on public.ai_reads;
create policy "ai_reads_public_select"
  on public.ai_reads for select
  to anon, authenticated
  using (true);

comment on table public.ai_reads is
  'One row per AI crawler / API / MCP read. No IPs or raw user-agents stored.';

-- ---------------------------------------------------------------------------
-- 3. Aggregate view for the stats endpoint
-- ---------------------------------------------------------------------------
-- A plain view (not materialized) keeps the numbers honest and live; the table
-- is small and the index on created_at makes the 30-day window cheap.
create or replace view public.ai_reads_30d as
  select
    count(*)                       as reads,
    count(distinct bot)            as bots,
    count(*) filter (where channel = 'crawler')  as crawler_reads,
    count(*) filter (where channel = 'api')      as api_reads,
    count(*) filter (where channel = 'mcp')      as mcp_reads,
    count(*) filter (where channel = 'llms_txt') as llms_txt_reads
  from public.ai_reads
  where created_at > now() - interval '30 days';

-- The view runs with the privileges of the querying role rather than its
-- owner, so the RLS policy above still applies.
alter view public.ai_reads_30d set (security_invoker = true);

grant select on public.ai_reads_30d to anon, authenticated;
