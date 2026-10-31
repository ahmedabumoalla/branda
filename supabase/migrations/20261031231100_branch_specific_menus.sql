begin;

alter table public.branches add column menu_slug text;
alter table public.branches add constraint branches_menu_slug_format check (menu_slug is null or (length(menu_slug) <= 80 and menu_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'));
alter table public.branches add constraint branches_menu_slug_unique unique(cafe_id, menu_slug);
alter table public.branches add constraint branches_id_cafe_unique unique(id, cafe_id);

alter table public.menu_categories add column branch_id uuid;
alter table public.menu_products add column branch_id uuid;
alter table public.menu_products add column price_options numeric[] not null default '{}';
alter table public.menu_products add constraint menu_price_options_valid check (cardinality(price_options) <= 10 and 0 <= all(price_options) and array_position(price_options, null) is null);
alter table public.offers add column branch_id uuid;
alter table public.menu_categories add constraint menu_categories_branch_same_cafe foreign key(branch_id, cafe_id) references public.branches(id, cafe_id);
alter table public.menu_products add constraint menu_products_branch_same_cafe foreign key(branch_id, cafe_id) references public.branches(id, cafe_id);
alter table public.offers add constraint offers_branch_same_cafe foreign key(branch_id, cafe_id) references public.branches(id, cafe_id);
alter table public.menu_categories drop constraint menu_categories_cafe_id_name_key;
alter table public.menu_categories add constraint menu_categories_branch_name_unique unique nulls not distinct(cafe_id, branch_id, name);
create index menu_products_branch_catalog_idx on public.menu_products(cafe_id, branch_id, sort_order, id) where deleted_at is null;
create index menu_categories_branch_catalog_idx on public.menu_categories(cafe_id, branch_id, sort_order, id) where deleted_at is null;
create index offers_branch_catalog_idx on public.offers(cafe_id, branch_id) where deleted_at is null;

create function public.enforce_menu_branch_category() returns trigger
language plpgsql set search_path = '' as $$
declare category_branch uuid; category_cafe uuid;
begin
  if new.category_id is not null then
    select c.branch_id, c.cafe_id into category_branch, category_cafe from public.menu_categories c where c.id = new.category_id;
    if not found or category_cafe is distinct from new.cafe_id or category_branch is distinct from new.branch_id then
      raise exception 'Product category must belong to the same brand and branch' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_menu_branch_category() from public, anon, authenticated;
create trigger menu_product_branch_category before insert or update of branch_id, cafe_id, category_id on public.menu_products
for each row execute function public.enforce_menu_branch_category();

create function public.enforce_category_branch_move() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.branch_id is distinct from old.branch_id or new.cafe_id is distinct from old.cafe_id)
    and exists(select 1 from public.menu_products p where p.category_id = new.id) then
    raise exception 'A category with products cannot move between branches' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_category_branch_move() from public, anon, authenticated;
create trigger menu_category_branch_move before update of branch_id, cafe_id on public.menu_categories
for each row execute function public.enforce_category_branch_move();

-- Existing ownership/service RLS remains authoritative; additionally hide inactive branch catalogs.
create policy menu_products_active_branch on public.menu_products as restrictive for select to anon, authenticated
using(branch_id is null or public.has_cafe_access(cafe_id) or public.is_platform_admin() or exists(select 1 from public.branches b where b.id=branch_id and b.cafe_id=menu_products.cafe_id and b.active and b.deleted_at is null and b.menu_slug is not null));
create policy menu_categories_active_branch on public.menu_categories as restrictive for select to anon, authenticated
using(branch_id is null or public.has_cafe_access(cafe_id) or public.is_platform_admin() or exists(select 1 from public.branches b where b.id=branch_id and b.cafe_id=menu_categories.cafe_id and b.active and b.deleted_at is null and b.menu_slug is not null));
create policy offers_active_branch on public.offers as restrictive for select to anon, authenticated
using(branch_id is null or public.has_cafe_access(cafe_id) or public.is_platform_admin() or exists(select 1 from public.branches b where b.id=branch_id and b.cafe_id=offers.cafe_id and b.active and b.deleted_at is null and b.menu_slug is not null));

commit;
