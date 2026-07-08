-- 070_table_wars.sql
-- Database foundation for Branda Play: in-store table wars.

begin;

create table if not exists public.table_wars_tables (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  label text not null,
  qr_code text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_wars_tables_label_not_blank check (btrim(label) <> ''),
  constraint table_wars_tables_qr_code_not_blank check (btrim(qr_code) <> '')
);

create index if not exists idx_table_wars_tables_cafe_id
  on public.table_wars_tables(cafe_id);

create index if not exists idx_table_wars_tables_cafe_active
  on public.table_wars_tables(cafe_id, is_active);

drop trigger if exists set_table_wars_tables_updated_at on public.table_wars_tables;
create trigger set_table_wars_tables_updated_at
  before update on public.table_wars_tables
  for each row execute function public.set_updated_at();

create table if not exists public.table_wars_rounds (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  status text not null default 'waiting',
  starts_at timestamptz,
  ends_at timestamptz,
  duration_seconds integer not null default 180,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_wars_rounds_status_allowed check (status in ('waiting', 'active', 'finished', 'cancelled')),
  constraint table_wars_rounds_duration_positive check (duration_seconds > 0)
);

create index if not exists idx_table_wars_rounds_cafe_status
  on public.table_wars_rounds(cafe_id, status);

create index if not exists idx_table_wars_rounds_cafe_created
  on public.table_wars_rounds(cafe_id, created_at desc);

drop trigger if exists set_table_wars_rounds_updated_at on public.table_wars_rounds;
create trigger set_table_wars_rounds_updated_at
  before update on public.table_wars_rounds
  for each row execute function public.set_updated_at();

create table if not exists public.table_wars_players (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_rounds(id) on delete cascade,
  table_id uuid not null references public.table_wars_tables(id) on delete cascade,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  guest_name text,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_table_wars_players_cafe_round
  on public.table_wars_players(cafe_id, round_id);

create index if not exists idx_table_wars_players_table_id
  on public.table_wars_players(table_id);

create index if not exists idx_table_wars_players_customer_id
  on public.table_wars_players(customer_id);

create table if not exists public.table_wars_cells (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_rounds(id) on delete cascade,
  table_id uuid not null references public.table_wars_tables(id) on delete cascade,
  owner_table_id uuid references public.table_wars_tables(id) on delete set null,
  soldiers integer not null default 10,
  position_index integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint table_wars_cells_soldiers_non_negative check (soldiers >= 0),
  constraint table_wars_cells_position_non_negative check (position_index >= 0)
);

create index if not exists idx_table_wars_cells_cafe_round
  on public.table_wars_cells(cafe_id, round_id);

create unique index if not exists idx_table_wars_cells_round_position
  on public.table_wars_cells(round_id, position_index);

drop trigger if exists set_table_wars_cells_updated_at on public.table_wars_cells;
create trigger set_table_wars_cells_updated_at
  before update on public.table_wars_cells
  for each row execute function public.set_updated_at();

create table if not exists public.table_wars_moves (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_rounds(id) on delete cascade,
  player_id uuid not null references public.table_wars_players(id) on delete cascade,
  from_cell_id uuid not null references public.table_wars_cells(id) on delete cascade,
  to_cell_id uuid not null references public.table_wars_cells(id) on delete cascade,
  soldiers_sent integer not null,
  result text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint table_wars_moves_soldiers_positive check (soldiers_sent > 0),
  constraint table_wars_moves_result_allowed check (result in ('pending', 'won', 'lost', 'ignored'))
);

create index if not exists idx_table_wars_moves_cafe_round
  on public.table_wars_moves(cafe_id, round_id, created_at desc);

create index if not exists idx_table_wars_moves_player_id
  on public.table_wars_moves(player_id);

create table if not exists public.table_wars_rewards (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_rounds(id) on delete cascade,
  player_id uuid references public.table_wars_players(id) on delete set null,
  reward_type text not null default 'demo',
  reward_label text,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  constraint table_wars_rewards_points_non_negative check (points_awarded >= 0)
);

create index if not exists idx_table_wars_rewards_cafe_round
  on public.table_wars_rewards(cafe_id, round_id, created_at desc);

create index if not exists idx_table_wars_rewards_player_id
  on public.table_wars_rewards(player_id);

create or replace function public.validate_table_wars_player_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars player round scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_tables table_row
    where table_row.id = new.table_id
      and table_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars player table scope mismatch';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customer_profiles customer
    where customer.id = new.customer_id
      and customer.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars player customer scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_cell_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars cell round scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_tables table_row
    where table_row.id = new.table_id
      and table_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars cell table scope mismatch';
  end if;

  if new.owner_table_id is not null and not exists (
    select 1
    from public.table_wars_tables owner_table
    where owner_table.id = new.owner_table_id
      and owner_table.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars cell owner table scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_move_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars move round scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_players player
    where player.id = new.player_id
      and player.cafe_id = new.cafe_id
      and player.round_id = new.round_id
  ) then
    raise exception 'table wars move player scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_cells from_cell
    where from_cell.id = new.from_cell_id
      and from_cell.cafe_id = new.cafe_id
      and from_cell.round_id = new.round_id
  ) then
    raise exception 'table wars move from cell scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_cells to_cell
    where to_cell.id = new.to_cell_id
      and to_cell.cafe_id = new.cafe_id
      and to_cell.round_id = new.round_id
  ) then
    raise exception 'table wars move to cell scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_reward_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars reward round scope mismatch';
  end if;

  if new.player_id is not null and not exists (
    select 1
    from public.table_wars_players player
    where player.id = new.player_id
      and player.cafe_id = new.cafe_id
      and player.round_id = new.round_id
  ) then
    raise exception 'table wars reward player scope mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_table_wars_player_scope on public.table_wars_players;
create trigger validate_table_wars_player_scope
  before insert or update on public.table_wars_players
  for each row execute function public.validate_table_wars_player_scope();

drop trigger if exists validate_table_wars_cell_scope on public.table_wars_cells;
create trigger validate_table_wars_cell_scope
  before insert or update on public.table_wars_cells
  for each row execute function public.validate_table_wars_cell_scope();

drop trigger if exists validate_table_wars_move_scope on public.table_wars_moves;
create trigger validate_table_wars_move_scope
  before insert or update on public.table_wars_moves
  for each row execute function public.validate_table_wars_move_scope();

drop trigger if exists validate_table_wars_reward_scope on public.table_wars_rewards;
create trigger validate_table_wars_reward_scope
  before insert or update on public.table_wars_rewards
  for each row execute function public.validate_table_wars_reward_scope();

alter table public.table_wars_tables enable row level security;
alter table public.table_wars_rounds enable row level security;
alter table public.table_wars_players enable row level security;
alter table public.table_wars_cells enable row level security;
alter table public.table_wars_moves enable row level security;
alter table public.table_wars_rewards enable row level security;

drop policy if exists table_wars_tables_staff_select on public.table_wars_tables;
create policy table_wars_tables_staff_select
  on public.table_wars_tables
  for select to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'marketing')
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'admin')
    or public.is_platform_admin()
  );

drop policy if exists table_wars_tables_staff_insert on public.table_wars_tables;
create policy table_wars_tables_staff_insert
  on public.table_wars_tables
  for insert to authenticated
  with check (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'marketing')
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'admin')
    or public.is_platform_admin()
  );

drop policy if exists table_wars_tables_staff_update on public.table_wars_tables;
create policy table_wars_tables_staff_update
  on public.table_wars_tables
  for update to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'marketing')
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'admin')
    or public.is_platform_admin()
  )
  with check (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'marketing')
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'admin')
    or public.is_platform_admin()
  );

drop policy if exists table_wars_tables_staff_delete on public.table_wars_tables;
create policy table_wars_tables_staff_delete
  on public.table_wars_tables
  for delete to authenticated
  using (
    public.is_cafe_owner(cafe_id)
    or public.has_cafe_permission(cafe_id, 'marketing')
    or public.has_cafe_permission(cafe_id, 'offers')
    or public.has_cafe_permission(cafe_id, 'admin')
    or public.is_platform_admin()
  );

do $$
declare
  table_name text;
  policy_prefix text;
begin
  foreach table_name in array array[
    'table_wars_rounds',
    'table_wars_players',
    'table_wars_cells',
    'table_wars_moves',
    'table_wars_rewards'
  ] loop
    policy_prefix := table_name || '_staff';

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_select', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (
        public.is_cafe_owner(cafe_id)
        or public.has_cafe_permission(cafe_id, ''marketing'')
        or public.has_cafe_permission(cafe_id, ''offers'')
        or public.has_cafe_permission(cafe_id, ''admin'')
        or public.is_platform_admin()
      )',
      policy_prefix || '_select',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_insert', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (
        public.is_cafe_owner(cafe_id)
        or public.has_cafe_permission(cafe_id, ''marketing'')
        or public.has_cafe_permission(cafe_id, ''offers'')
        or public.has_cafe_permission(cafe_id, ''admin'')
        or public.is_platform_admin()
      )',
      policy_prefix || '_insert',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_update', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (
        public.is_cafe_owner(cafe_id)
        or public.has_cafe_permission(cafe_id, ''marketing'')
        or public.has_cafe_permission(cafe_id, ''offers'')
        or public.has_cafe_permission(cafe_id, ''admin'')
        or public.is_platform_admin()
      ) with check (
        public.is_cafe_owner(cafe_id)
        or public.has_cafe_permission(cafe_id, ''marketing'')
        or public.has_cafe_permission(cafe_id, ''offers'')
        or public.has_cafe_permission(cafe_id, ''admin'')
        or public.is_platform_admin()
      )',
      policy_prefix || '_update',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_delete', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (
        public.is_cafe_owner(cafe_id)
        or public.has_cafe_permission(cafe_id, ''marketing'')
        or public.has_cafe_permission(cafe_id, ''offers'')
        or public.has_cafe_permission(cafe_id, ''admin'')
        or public.is_platform_admin()
      )',
      policy_prefix || '_delete',
      table_name
    );
  end loop;
end $$;

grant select, insert, update, delete on public.table_wars_tables to authenticated;
grant select, insert, update, delete on public.table_wars_rounds to authenticated;
grant select, insert, update, delete on public.table_wars_players to authenticated;
grant select, insert, update, delete on public.table_wars_cells to authenticated;
grant select, insert, update, delete on public.table_wars_moves to authenticated;
grant select, insert, update, delete on public.table_wars_rewards to authenticated;

grant select, insert, update, delete on public.table_wars_tables to service_role;
grant select, insert, update, delete on public.table_wars_rounds to service_role;
grant select, insert, update, delete on public.table_wars_players to service_role;
grant select, insert, update, delete on public.table_wars_cells to service_role;
grant select, insert, update, delete on public.table_wars_moves to service_role;
grant select, insert, update, delete on public.table_wars_rewards to service_role;

revoke all on function public.validate_table_wars_player_scope() from public;
revoke all on function public.validate_table_wars_cell_scope() from public;
revoke all on function public.validate_table_wars_move_scope() from public;
revoke all on function public.validate_table_wars_reward_scope() from public;
grant execute on function public.validate_table_wars_player_scope() to service_role;
grant execute on function public.validate_table_wars_cell_scope() to service_role;
grant execute on function public.validate_table_wars_move_scope() to service_role;
grant execute on function public.validate_table_wars_reward_scope() to service_role;

notify pgrst, 'reload schema';

commit;

select 'table_wars_ready' as status;
