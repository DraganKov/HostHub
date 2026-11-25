-- Security hardening from the audit.

-- 1. Trigger functions must never be callable through the API (/rest/v1/rpc/...). Triggers keep working: execute rights are only checked when a trigger is created.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- 2. Pin the search path of the three functions that had none.
alter function public.require_mfa(text, boolean) set search_path = public;
alter function public.touch_map() set search_path = public;
alter function public.touch_settings() set search_path = public;

-- 3. Guests no longer run is_admin(): split the field read rule into a public rule and a signed-in owner/admin rule.
drop policy "read visible fields" on public.fields;
create policy "read visible fields" on public.fields for select to anon, authenticated using (
  published and (reviewed or coalesce((select p.score from public.posts p where p.id = fields.post_id), 0) > -5));
create policy "owner or admin reads field" on public.fields for select to authenticated using (
  owner = auth.uid() or (select public.is_admin()));
revoke execute on function public.is_admin() from anon;

-- 4. Least privilege: guests only read the tables that are public by design; nobody writes tables that have no write path.
revoke all on public.admins, public.event_private, public.field_claims, public.ledger, public.messages, public.notifications,
              public.registrations, public.user_settings, public.vote_log, public.votes from anon;
revoke insert, update, delete, truncate on public.admins, public.vote_log from authenticated;
revoke update on public.comments from authenticated;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- 5. Anti-spam: per-person limits on new posts, comments, messages and groups (events and votes already have theirs).
create function public.rate_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare col text := tg_argv[0]; lim int := tg_argv[1]::int; win interval := tg_argv[2]::interval; n int; who uuid;
begin
  who := (to_jsonb(new) ->> col)::uuid;
  if auth.uid() is null then return new; end if;   -- server-side jobs are not limited
  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - $2', tg_table_name, col) into n using who, win;
  if n >= lim then raise exception 'Slow down: limit of % new % per % reached.', lim, tg_table_name, win; end if;
  return new;
end $$;
revoke execute on function public.rate_limit() from public, anon, authenticated;
create trigger limit_posts    before insert on public.posts    for each row execute function public.rate_limit('user_id', '20',  '1 hour');
create trigger limit_comments before insert on public.comments for each row execute function public.rate_limit('user_id', '60',  '1 hour');
create trigger limit_messages before insert on public.messages for each row execute function public.rate_limit('sender',  '60',  '1 hour');
create trigger limit_groups   before insert on public.groups   for each row execute function public.rate_limit('owner',   '5',   '1 day');

-- 6. Remember which alerts were sent so the scheduled job never alerts someone twice. Only the server (service role) touches it.
create table public.alerts_sent (
  user_id uuid not null references auth.users on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, event_id));
alter table public.alerts_sent enable row level security;
revoke all on public.alerts_sent from anon, authenticated;
