-- Barndaksa: make plan feature options match the dashboard sidebar options.
-- Keeps existing plans compatible while adding the new sidebar-controlled feature keys.

alter table public.platform_plans
  alter column features set default '[]'::jsonb;

update public.platform_plans
set features = (
  select coalesce(jsonb_agg(distinct feature_value), '[]'::jsonb)
  from (
    select jsonb_array_elements_text(
      case
        when jsonb_typeof(public.platform_plans.features) = 'array' then public.platform_plans.features
        else '[]'::jsonb
      end
    ) as feature_value
    union all select 'home'
    union all select 'subscription'
    union all
      select 'experience_reviews'
      where exists (
        select 1
        from jsonb_array_elements_text(
          case
            when jsonb_typeof(public.platform_plans.features) = 'array' then public.platform_plans.features
            else '[]'::jsonb
          end
        ) old_feature(value)
        where old_feature.value in ('menu', 'experience_reviews')
      )
  ) normalized
)
where features is null
   or jsonb_typeof(features) <> 'array'
   or not (features ? 'home')
   or not (features ? 'subscription')
   or ((features ? 'menu') and not (features ? 'experience_reviews'));

comment on column public.platform_plans.features is
  'JSONB list of dashboard sidebar feature keys. Admin plans read the same feature registry used by the brand dashboard sidebar.';
