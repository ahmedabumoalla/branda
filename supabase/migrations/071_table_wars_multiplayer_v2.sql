-- 071_table_wars_multiplayer_v2.sql
-- Database foundation for Table Wars Multiplayer v2.

begin;

create table if not exists public.table_wars_v2_rounds (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  status text not null default 'waiting',
  winning_team text,
  ai_blue_enabled boolean not null default false,
  ai_red_enabled boolean not null default false,
  blue_player_count integer not null default 0,
  red_player_count integer not null default 0,
  max_players_per_team integer not null default 10,
  total_cells integer not null default 50,
  seed text,
  started_at timestamptz,
  ended_at timestamptz,
  last_tick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_wars_v2_rounds_status_allowed check (status in ('waiting', 'active', 'finished', 'cancelled')),
  constraint table_wars_v2_rounds_winning_team_allowed check (winning_team is null or winning_team in ('blue', 'red')),
  constraint table_wars_v2_rounds_blue_player_count_non_negative check (blue_player_count >= 0),
  constraint table_wars_v2_rounds_red_player_count_non_negative check (red_player_count >= 0),
  constraint table_wars_v2_rounds_max_players_positive check (max_players_per_team > 0),
  constraint table_wars_v2_rounds_total_cells_positive check (total_cells > 0),
  constraint table_wars_v2_rounds_player_counts_within_limit check (
    blue_player_count <= max_players_per_team
    and red_player_count <= max_players_per_team
  )
);

create index if not exists idx_table_wars_v2_rounds_cafe_status
  on public.table_wars_v2_rounds(cafe_id, status);

create index if not exists idx_table_wars_v2_rounds_cafe_created
  on public.table_wars_v2_rounds(cafe_id, created_at desc);

create index if not exists idx_table_wars_v2_rounds_last_tick
  on public.table_wars_v2_rounds(status, last_tick_at);

drop trigger if exists set_table_wars_v2_rounds_updated_at on public.table_wars_v2_rounds;
create trigger set_table_wars_v2_rounds_updated_at
  before update on public.table_wars_v2_rounds
  for each row execute function public.set_updated_at();

create table if not exists public.table_wars_v2_players (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_v2_rounds(id) on delete cascade,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  team text not null,
  role text not null default 'player',
  display_name text not null,
  base_cell_id uuid,
  is_connected boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  play_seconds integer not null default 0,
  won_this_round boolean not null default false,
  constraint table_wars_v2_players_team_allowed check (team in ('blue', 'red')),
  constraint table_wars_v2_players_role_allowed check (role in ('player', 'spectator', 'ai')),
  constraint table_wars_v2_players_display_name_not_blank check (btrim(display_name) <> ''),
  constraint table_wars_v2_players_play_seconds_non_negative check (play_seconds >= 0)
);

create index if not exists idx_table_wars_v2_players_cafe_round
  on public.table_wars_v2_players(cafe_id, round_id);

create index if not exists idx_table_wars_v2_players_round_team_role
  on public.table_wars_v2_players(round_id, team, role);

create index if not exists idx_table_wars_v2_players_customer_id
  on public.table_wars_v2_players(customer_id);

create unique index if not exists idx_table_wars_v2_players_round_customer
  on public.table_wars_v2_players(round_id, customer_id)
  where customer_id is not null;

create table if not exists public.table_wars_v2_cells (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_v2_rounds(id) on delete cascade,
  cell_key text not null,
  slot_index integer not null,
  x numeric not null,
  y numeric not null,
  team text not null default 'neutral',
  assigned_player_id uuid references public.table_wars_v2_players(id) on delete set null,
  is_base boolean not null default false,
  soldiers integer not null default 10,
  max_soldiers integer not null default 60,
  updated_at timestamptz not null default now(),
  constraint table_wars_v2_cells_cell_key_not_blank check (btrim(cell_key) <> ''),
  constraint table_wars_v2_cells_slot_index_range check (slot_index between 1 and 50),
  constraint table_wars_v2_cells_team_allowed check (team in ('blue', 'red', 'neutral')),
  constraint table_wars_v2_cells_soldiers_non_negative check (soldiers >= 0),
  constraint table_wars_v2_cells_max_soldiers_positive check (max_soldiers > 0),
  constraint table_wars_v2_cells_soldiers_within_max check (soldiers <= max_soldiers),
  constraint table_wars_v2_cells_coordinates_range check (
    x >= 0
    and x <= 100
    and y >= 0
    and y <= 100
  )
);

create unique index if not exists idx_table_wars_v2_cells_round_cell_key
  on public.table_wars_v2_cells(round_id, cell_key);

create unique index if not exists idx_table_wars_v2_cells_round_slot
  on public.table_wars_v2_cells(round_id, slot_index);

create index if not exists idx_table_wars_v2_cells_cafe_round
  on public.table_wars_v2_cells(cafe_id, round_id);

create index if not exists idx_table_wars_v2_cells_round_team
  on public.table_wars_v2_cells(round_id, team);

create index if not exists idx_table_wars_v2_cells_assigned_player
  on public.table_wars_v2_cells(assigned_player_id);

create unique index if not exists idx_table_wars_v2_cells_round_assigned_base
  on public.table_wars_v2_cells(round_id, assigned_player_id)
  where assigned_player_id is not null and is_base = true;

drop trigger if exists set_table_wars_v2_cells_updated_at on public.table_wars_v2_cells;
create trigger set_table_wars_v2_cells_updated_at
  before update on public.table_wars_v2_cells
  for each row execute function public.set_updated_at();

alter table public.table_wars_v2_players
  drop constraint if exists table_wars_v2_players_base_cell_id_fkey;

alter table public.table_wars_v2_players
  add constraint table_wars_v2_players_base_cell_id_fkey
  foreign key (base_cell_id) references public.table_wars_v2_cells(id) on delete set null;

create unique index if not exists idx_table_wars_v2_players_round_base_cell
  on public.table_wars_v2_players(round_id, base_cell_id)
  where base_cell_id is not null;

create table if not exists public.table_wars_v2_units (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_v2_rounds(id) on delete cascade,
  from_cell_id uuid not null references public.table_wars_v2_cells(id) on delete cascade,
  to_cell_id uuid not null references public.table_wars_v2_cells(id) on delete cascade,
  team text not null,
  owner_player_id uuid references public.table_wars_v2_players(id) on delete set null,
  soldiers integer not null,
  started_at timestamptz not null default now(),
  arrives_at timestamptz not null,
  lane_index integer not null default 0,
  status text not null default 'moving',
  constraint table_wars_v2_units_team_allowed check (team in ('blue', 'red')),
  constraint table_wars_v2_units_soldiers_positive check (soldiers > 0),
  constraint table_wars_v2_units_lane_index_non_negative check (lane_index >= 0),
  constraint table_wars_v2_units_status_allowed check (status in ('moving', 'resolved', 'cancelled')),
  constraint table_wars_v2_units_distinct_cells check (from_cell_id <> to_cell_id),
  constraint table_wars_v2_units_arrives_after_start check (arrives_at > started_at)
);

create index if not exists idx_table_wars_v2_units_cafe_round_status
  on public.table_wars_v2_units(cafe_id, round_id, status);

create index if not exists idx_table_wars_v2_units_round_team_status
  on public.table_wars_v2_units(round_id, team, status);

create index if not exists idx_table_wars_v2_units_from_cell
  on public.table_wars_v2_units(from_cell_id);

create index if not exists idx_table_wars_v2_units_to_cell
  on public.table_wars_v2_units(to_cell_id);

create index if not exists idx_table_wars_v2_units_arrives_at
  on public.table_wars_v2_units(status, arrives_at);

create table if not exists public.table_wars_v2_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  round_id uuid not null references public.table_wars_v2_rounds(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint table_wars_v2_events_event_type_not_blank check (btrim(event_type) <> '')
);

create index if not exists idx_table_wars_v2_events_cafe_round_created
  on public.table_wars_v2_events(cafe_id, round_id, created_at desc);

create index if not exists idx_table_wars_v2_events_type
  on public.table_wars_v2_events(event_type);

create table if not exists public.table_wars_v2_daily_player_stats (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  day date not null,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  display_name text not null,
  team text not null,
  play_seconds integer not null default 0,
  wins integer not null default 0,
  last_win_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint table_wars_v2_daily_player_stats_display_name_not_blank check (btrim(display_name) <> ''),
  constraint table_wars_v2_daily_player_stats_team_allowed check (team in ('blue', 'red')),
  constraint table_wars_v2_daily_player_stats_play_seconds_non_negative check (play_seconds >= 0),
  constraint table_wars_v2_daily_player_stats_wins_non_negative check (wins >= 0)
);

create unique index if not exists idx_table_wars_v2_daily_player_stats_unique
  on public.table_wars_v2_daily_player_stats(cafe_id, day, customer_id);

create index if not exists idx_table_wars_v2_daily_player_stats_cafe_day
  on public.table_wars_v2_daily_player_stats(cafe_id, day, wins desc, play_seconds desc);

create index if not exists idx_table_wars_v2_daily_player_stats_customer
  on public.table_wars_v2_daily_player_stats(customer_id);

drop trigger if exists set_table_wars_v2_daily_player_stats_updated_at on public.table_wars_v2_daily_player_stats;
create trigger set_table_wars_v2_daily_player_stats_updated_at
  before update on public.table_wars_v2_daily_player_stats
  for each row execute function public.set_updated_at();

create or replace function public.validate_table_wars_v2_player_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_v2_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 player round scope mismatch';
  end if;

  if new.customer_id is not null and not exists (
    select 1
    from public.customer_profiles customer
    where customer.id = new.customer_id
      and customer.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 player customer scope mismatch';
  end if;

  if new.base_cell_id is not null and not exists (
    select 1
    from public.table_wars_v2_cells cell
    where cell.id = new.base_cell_id
      and cell.cafe_id = new.cafe_id
      and cell.round_id = new.round_id
  ) then
    raise exception 'table wars v2 player base cell scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_v2_cell_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_v2_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 cell round scope mismatch';
  end if;

  if new.assigned_player_id is not null and not exists (
    select 1
    from public.table_wars_v2_players player
    where player.id = new.assigned_player_id
      and player.cafe_id = new.cafe_id
      and player.round_id = new.round_id
  ) then
    raise exception 'table wars v2 cell assigned player scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_v2_unit_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_v2_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 unit round scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_v2_cells from_cell
    where from_cell.id = new.from_cell_id
      and from_cell.cafe_id = new.cafe_id
      and from_cell.round_id = new.round_id
  ) then
    raise exception 'table wars v2 unit from cell scope mismatch';
  end if;

  if not exists (
    select 1
    from public.table_wars_v2_cells to_cell
    where to_cell.id = new.to_cell_id
      and to_cell.cafe_id = new.cafe_id
      and to_cell.round_id = new.round_id
  ) then
    raise exception 'table wars v2 unit to cell scope mismatch';
  end if;

  if new.owner_player_id is not null and not exists (
    select 1
    from public.table_wars_v2_players player
    where player.id = new.owner_player_id
      and player.cafe_id = new.cafe_id
      and player.round_id = new.round_id
      and player.team = new.team
  ) then
    raise exception 'table wars v2 unit owner player scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_v2_event_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.table_wars_v2_rounds round_row
    where round_row.id = new.round_id
      and round_row.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 event round scope mismatch';
  end if;

  return new;
end;
$$;

create or replace function public.validate_table_wars_v2_daily_player_stats_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.customer_profiles customer
    where customer.id = new.customer_id
      and customer.cafe_id = new.cafe_id
  ) then
    raise exception 'table wars v2 daily player stats customer scope mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_table_wars_v2_player_scope on public.table_wars_v2_players;
create trigger validate_table_wars_v2_player_scope
  before insert or update on public.table_wars_v2_players
  for each row execute function public.validate_table_wars_v2_player_scope();

drop trigger if exists validate_table_wars_v2_cell_scope on public.table_wars_v2_cells;
create trigger validate_table_wars_v2_cell_scope
  before insert or update on public.table_wars_v2_cells
  for each row execute function public.validate_table_wars_v2_cell_scope();

drop trigger if exists validate_table_wars_v2_unit_scope on public.table_wars_v2_units;
create trigger validate_table_wars_v2_unit_scope
  before insert or update on public.table_wars_v2_units
  for each row execute function public.validate_table_wars_v2_unit_scope();

drop trigger if exists validate_table_wars_v2_event_scope on public.table_wars_v2_events;
create trigger validate_table_wars_v2_event_scope
  before insert or update on public.table_wars_v2_events
  for each row execute function public.validate_table_wars_v2_event_scope();

drop trigger if exists validate_table_wars_v2_daily_player_stats_scope on public.table_wars_v2_daily_player_stats;
create trigger validate_table_wars_v2_daily_player_stats_scope
  before insert or update on public.table_wars_v2_daily_player_stats
  for each row execute function public.validate_table_wars_v2_daily_player_stats_scope();

alter table public.table_wars_v2_rounds enable row level security;
alter table public.table_wars_v2_players enable row level security;
alter table public.table_wars_v2_cells enable row level security;
alter table public.table_wars_v2_units enable row level security;
alter table public.table_wars_v2_events enable row level security;
alter table public.table_wars_v2_daily_player_stats enable row level security;

do $$
declare
  table_name text;
  policy_prefix text;
begin
  foreach table_name in array array[
    'table_wars_v2_rounds',
    'table_wars_v2_players',
    'table_wars_v2_cells',
    'table_wars_v2_units',
    'table_wars_v2_events',
    'table_wars_v2_daily_player_stats'
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

grant select, insert, update, delete on public.table_wars_v2_rounds to authenticated;
grant select, insert, update, delete on public.table_wars_v2_players to authenticated;
grant select, insert, update, delete on public.table_wars_v2_cells to authenticated;
grant select, insert, update, delete on public.table_wars_v2_units to authenticated;
grant select, insert, update, delete on public.table_wars_v2_events to authenticated;
grant select, insert, update, delete on public.table_wars_v2_daily_player_stats to authenticated;

grant select, insert, update, delete on public.table_wars_v2_rounds to service_role;
grant select, insert, update, delete on public.table_wars_v2_players to service_role;
grant select, insert, update, delete on public.table_wars_v2_cells to service_role;
grant select, insert, update, delete on public.table_wars_v2_units to service_role;
grant select, insert, update, delete on public.table_wars_v2_events to service_role;
grant select, insert, update, delete on public.table_wars_v2_daily_player_stats to service_role;

revoke all on function public.validate_table_wars_v2_player_scope() from public;
revoke all on function public.validate_table_wars_v2_cell_scope() from public;
revoke all on function public.validate_table_wars_v2_unit_scope() from public;
revoke all on function public.validate_table_wars_v2_event_scope() from public;
revoke all on function public.validate_table_wars_v2_daily_player_stats_scope() from public;
grant execute on function public.validate_table_wars_v2_player_scope() to service_role;
grant execute on function public.validate_table_wars_v2_cell_scope() to service_role;
grant execute on function public.validate_table_wars_v2_unit_scope() to service_role;
grant execute on function public.validate_table_wars_v2_event_scope() to service_role;
grant execute on function public.validate_table_wars_v2_daily_player_stats_scope() to service_role;

notify pgrst, 'reload schema';

commit;

select 'table_wars_v2_database_foundation_ready' as status;
