-- Backfill the controlled-vocabulary columns for listings that predate them.
--
-- Deterministic only: every term here is derived from the listing's existing
-- `category` or `tags` by an explicit mapping. Nothing is guessed, and a
-- listing with no confident mapping is left NULL rather than given a term that
-- might be wrong -- for AI answers, absent data beats wrong data.
--
-- Idempotent: the WHERE clause only touches rows where all four target
-- columns are still NULL, so re-running this is a no-op and it will never
-- overwrite a value a maker set themselves.
--
-- Coverage when first applied (2026-08-13, 302 approved listings):
--   use_cases 214, platforms 70, pricing_model 20, audiences 29.

with tag_usecase(tag, term) as (values
  ('automation','automation'),('analytics','analytics'),('productivity','productivity'),
  ('video','video'),('seo','seo'),('sales','sales'),('monitoring','monitoring'),
  ('collaboration','collaboration'),('security','security'),('finance','finance'),
  ('ecommerce','e-commerce'),('e-commerce','e-commerce'),('data','data-management'),
  ('development','developer-tools'),('marketing','marketing'),('design','design'),
  ('workflow','automation'),('writing','writing'),('crm','crm'),('education','education'),
  ('testing','testing'),('project-management','project-management'),
  ('customer-support','customer-support'),('social-media','social-media'),('hr','hr')
),
cat_usecase(cat, term) as (values
  ('analytics','analytics'),('marketing','marketing'),('development','developer-tools'),
  ('design','design'),('security','security'),('communication','collaboration'),
  ('productivity','productivity'),('education','education'),('finance','finance')
  -- 'Software', 'Entertainment' and 'News & Media' are deliberately absent:
  -- they are too generic to imply a use case.
),
tag_platform(tag, term) as (values
  ('api','api'),('saas','web'),('online','web'),('cloud','web'),('web','web'),
  ('self-hosted','self-hosted'),('selfhosted','self-hosted'),
  ('chrome-extension','browser-extension'),('browser-extension','browser-extension'),
  ('cli','cli'),('ios','ios'),('android','android'),('macos','macos'),('mac','macos'),
  ('windows','windows'),('linux','linux'),('desktop','desktop'),('mcp','mcp')
),
tag_pricing(tag, term) as (values
  ('free','free'),('open-source','open-source'),('opensource','open-source'),
  ('freemium','freemium'),('subscription','subscription')
),
computed as (
  select s.id,
    -- Capped at 5 to match the limit the submit form and edge function enforce.
    (array(select distinct x from (
      select cu.term from cat_usecase cu where cu.cat = lower(trim(s.category))
      union
      select tu.term from unnest(coalesce(s.tags,'{}')) t
        join tag_usecase tu on tu.tag = lower(trim(t))
    ) q(x)))[1:5] as uc,
    array(select distinct tp.term from unnest(coalesce(s.tags,'{}')) t
          join tag_platform tp on tp.tag = lower(trim(t))) as pf,
    (select tpr.term from unnest(coalesce(s.tags,'{}')) t
     join tag_pricing tpr on tpr.tag = lower(trim(t)) limit 1) as pm,
    -- The only audience we can infer with confidence.
    array(select 'developers'::text where lower(trim(s.category)) = 'development') as au
  from public.software_submissions s
  where s.status = 'approved'
)
update public.software_submissions s
set use_cases     = case when cardinality(c.uc) > 0 then c.uc else null end,
    platforms     = case when cardinality(c.pf) > 0 then c.pf else null end,
    audiences     = case when cardinality(c.au) > 0 then c.au else null end,
    pricing_model = c.pm
from computed c
where s.id = c.id
  and s.use_cases is null and s.platforms is null
  and s.audiences is null and s.pricing_model is null;
