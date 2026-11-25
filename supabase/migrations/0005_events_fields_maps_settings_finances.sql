-- Fields (venues), game-mode maps, events with registration and prepay tracking, private per-user settings, public finances.
-- Additive only. Sensitive columns are protected by triggers (not by revoking grants).

-- ===== Fields: a venue run by a field owner =====
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 2 and 80),
  about text not null default '' check (char_length(about) <= 1000),
  postal_code text not null check (char_length(postal_code) between 3 and 10),
  city text not null default '' check (char_length(city) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  boundary jsonb check (boundary is null or pg_column_size(boundary) < 200000),   -- GeoJSON of the whole playing area
  created_at timestamptz not null default now());
create index on public.fields (owner);

-- Game-mode maps: several per field (e.g. "Search and Destroy", "VIP escort"), each a GeoJSON drawing.
create table public.field_maps (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  notes text not null default '' check (char_length(notes) <= 500),
  geojson jsonb not null default '{"type":"FeatureCollection","features":[]}' check (pg_column_size(geojson) < 200000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (field_id, name));
create index on public.field_maps (field_id);

-- ===== Events =====
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles on delete cascade default auth.uid(),
  field_id uuid references public.fields on delete set null,
  map_id uuid references public.field_maps on delete set null,
  title text not null check (char_length(title) between 3 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue text not null default '' check (char_length(venue) <= 120),
  postal_code text not null check (char_length(postal_code) between 3 and 10),
  city text not null default '' check (char_length(city) <= 80),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  capacity integer check (capacity is null or capacity between 1 and 10000),
  price_cents integer not null default 0 check (price_cents between 0 and 1000000),
  prepay_required boolean not null default false,
  reg_count integer not null default 0,
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (not prepay_required or price_cents > 0));
create index on public.events (starts_at);
create index on public.events (lat, lng);
create index on public.events (host);

-- Payment instructions (e.g. e-transfer details): only the host and people registered for the event can read them.
create table public.event_private (
  event_id uuid primary key references public.events on delete cascade,
  payment_info text not null default '' check (char_length(payment_info) <= 500));

create table public.registrations (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id));
create index on public.registrations (user_id);

-- ===== Private per-user settings (home area and alert preferences). Nobody else can read these. =====
create table public.user_settings (
  user_id uuid primary key references public.profiles on delete cascade default auth.uid(),
  postal_code text check (postal_code is null or char_length(postal_code) between 3 and 10),
  lat double precision check (lat is null or lat between -90 and 90),
  lng double precision check (lng is null or lng between -180 and 180),
  radius_km integer not null default 50 check (radius_km between 1 and 20000),
  notify_email boolean not null default false,
  notify_sms boolean not null default false,
  phone text check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  notify_days integer not null default 7 check (notify_days between 1 and 60),
  updated_at timestamptz not null default now());

-- ===== Public finances (visible to signed-in users; only admins can write) =====
create table public.admins (user_id uuid primary key references public.profiles on delete cascade);
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('donation','expense')),
  amount_cents integer not null check (amount_cents > 0 and amount_cents <= 100000000),
  currency text not null default 'CAD' check (char_length(currency) = 3),
  category text not null default '' check (char_length(category) <= 40),
  description text not null check (char_length(description) between 1 and 200),
  occurred_on date not null default current_date,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now());
create index on public.ledger (occurred_on desc);
insert into public.admins (user_id) select id from public.profiles where lower(username) = 'dragkov';

-- ===== Guards (triggers) =====
create function public.events_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reg_count := 0; new.cancelled := false; new.created_at := now();
    if new.starts_at < now() - interval '1 hour' then raise exception 'The start time must be in the future.'; end if;
    if (select count(*) from events where host = new.host and created_at > now() - interval '24 hours') >= 5 then
      raise exception 'Event limit reached: you can create 5 events per day.'; end if;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then
      raise exception 'That map does not belong to this field.'; end if;
  else
    new.host := old.host; new.reg_count := old.reg_count; new.created_at := old.created_at;
    new.lat := old.lat; new.lng := old.lng; new.postal_code := old.postal_code; new.field_id := old.field_id;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then
      raise exception 'That map does not belong to this field.'; end if;
  end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events for each row execute function public.events_guard();

create function public.registrations_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ev events%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into ev from events where id = new.event_id for update;
    if not found then raise exception 'Event not found.'; end if;
    if ev.cancelled then raise exception 'This event was cancelled.'; end if;
    if coalesce(ev.ends_at, ev.starts_at + interval '12 hours') < now() then raise exception 'This event has already ended.'; end if;
    if ev.capacity is not null and ev.reg_count >= ev.capacity then raise exception 'This event is full.'; end if;
    new.paid := false; new.paid_at := null; new.created_at := now();
    update events set reg_count = reg_count + 1 where id = new.event_id;
    return new;
  elsif tg_op = 'UPDATE' then
    new.event_id := old.event_id; new.user_id := old.user_id; new.created_at := old.created_at;
    new.paid_at := case when new.paid then coalesce(old.paid_at, now()) else null end;
    return new;
  else
    update events set reg_count = greatest(reg_count - 1, 0) where id = old.event_id;
    return old;
  end if;
end $$;
create trigger registrations_guard before insert or update or delete on public.registrations for each row execute function public.registrations_guard();

create function public.touch_map() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger touch_map before update on public.field_maps for each row execute function public.touch_map();
create function public.touch_settings() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
create trigger touch_settings before update on public.user_settings for each row execute function public.touch_settings();

-- Alerts: host is told about registrations; the attendee is told when payment is confirmed.
create function public.notify_registration() returns trigger language plpgsql security definer set search_path = public as $$
declare ev events%rowtype;
begin
  select * into ev from events where id = new.event_id;
  if tg_op = 'INSERT' and ev.host <> new.user_id then
    insert into notifications (user_id, actor_id, text) values (ev.host, new.user_id, 'registered for ' || ev.title);
  elsif tg_op = 'UPDATE' and new.paid and not old.paid then
    insert into notifications (user_id, actor_id, text) values (new.user_id, ev.host, 'confirmed your payment for ' || ev.title);
  end if;
  return new;
end $$;
create trigger notify_registration after insert or update of paid on public.registrations for each row execute function public.notify_registration();

-- ===== Row-level security =====
alter table public.fields enable row level security;
alter table public.field_maps enable row level security;
alter table public.events enable row level security;
alter table public.event_private enable row level security;
alter table public.registrations enable row level security;
alter table public.user_settings enable row level security;
alter table public.admins enable row level security;
alter table public.ledger enable row level security;

-- Anyone, including guests, can browse fields, maps and events.
create policy "public read" on public.fields for select to anon, authenticated using (true);
create policy "public read" on public.field_maps for select to anon, authenticated using (true);
create policy "public read" on public.events for select to anon, authenticated using (true);

create policy "owner adds field" on public.fields for insert to authenticated with check (owner = auth.uid());
create policy "owner edits field" on public.fields for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "owner deletes field" on public.fields for delete to authenticated using (owner = auth.uid());

create policy "owner adds map" on public.field_maps for insert to authenticated with check (exists (select 1 from public.fields f where f.id = field_id and f.owner = auth.uid()));
create policy "owner edits map" on public.field_maps for update to authenticated using (exists (select 1 from public.fields f where f.id = field_id and f.owner = auth.uid())) with check (exists (select 1 from public.fields f where f.id = field_id and f.owner = auth.uid()));
create policy "owner deletes map" on public.field_maps for delete to authenticated using (exists (select 1 from public.fields f where f.id = field_id and f.owner = auth.uid()));

create policy "add event" on public.events for insert to authenticated with check (host = auth.uid() and (field_id is null or exists (select 1 from public.fields f where f.id = field_id and f.owner = auth.uid())));
create policy "host edits event" on public.events for update to authenticated using (host = auth.uid()) with check (host = auth.uid());
create policy "host deletes event" on public.events for delete to authenticated using (host = auth.uid());

create policy "host or registered read payment info" on public.event_private for select to authenticated using (
  exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid())
  or exists (select 1 from public.registrations r where r.event_id = event_private.event_id and r.user_id = auth.uid()));
create policy "host adds payment info" on public.event_private for insert to authenticated with check (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host edits payment info" on public.event_private for update to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host deletes payment info" on public.event_private for delete to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));

-- You see your own registrations; hosts see everyone registered for their events.
create policy "see registrations" on public.registrations for select to authenticated using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "register" on public.registrations for insert to authenticated with check (user_id = auth.uid());
create policy "unregister or host removes" on public.registrations for delete to authenticated using (user_id = auth.uid() or exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host confirms payment" on public.registrations for update to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));

create policy "own settings" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "see own admin row" on public.admins for select to authenticated using (user_id = auth.uid());
create policy "members read ledger" on public.ledger for select to authenticated using (true);
create policy "admins add ledger" on public.ledger for insert to authenticated with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "admins edit ledger" on public.ledger for update to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid())) with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));
create policy "admins delete ledger" on public.ledger for delete to authenticated using (exists (select 1 from public.admins a where a.user_id = auth.uid()));

-- Two-factor enforcement on the new tables.
select public.require_mfa('fields'); select public.require_mfa('field_maps'); select public.require_mfa('events');
select public.require_mfa('event_private', true); select public.require_mfa('registrations', true); select public.require_mfa('user_settings', true);
select public.require_mfa('ledger');

alter publication supabase_realtime add table public.events, public.registrations, public.fields, public.field_maps;
