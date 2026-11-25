-- Polls: single or multiple choice, optional close time, results visibility rules, optional member-added options.
-- Everything is written through functions so limits can't be bypassed. Counts are only readable through poll_tallies(),
-- which honours each poll's "show results" rule.

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade default auth.uid(),
  question text not null check (char_length(question) between 3 and 200),
  description text not null default '' check (char_length(description) <= 500),
  multi boolean not null default false,
  max_choices int not null default 1 check (max_choices between 1 and 10),
  show_results text not null default 'always' check (show_results in ('always','after_vote','after_close')),
  allow_add boolean not null default false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (multi or max_choices = 1));
create index on public.polls (created_at desc);
create index on public.polls (user_id);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls on delete cascade,
  label text not null check (char_length(label) between 1 and 100),
  position int not null default 0,
  added_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now());
create unique index poll_option_unique on public.poll_options (poll_id, lower(label));

create table public.poll_votes (
  poll_id uuid not null references public.polls on delete cascade,
  option_id uuid not null references public.poll_options on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id));
create index on public.poll_votes (poll_id, user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
create policy "polls are public" on public.polls for select to anon, authenticated using (true);
create policy "options are public" on public.poll_options for select to anon, authenticated using (true);
create policy "see own poll votes" on public.poll_votes for select to authenticated using (user_id = auth.uid());
create policy "author deletes poll" on public.polls for delete to authenticated using (user_id = auth.uid());
revoke all on public.polls, public.poll_options, public.poll_votes from anon, authenticated;
grant select on public.polls, public.poll_options to anon, authenticated;
grant select on public.poll_votes to authenticated;
grant delete on public.polls to authenticated;
select public.require_mfa('polls');
select public.require_mfa('poll_options');
select public.require_mfa('poll_votes');

create function public.poll_is_open(p public.polls) returns boolean language sql stable set search_path = public as $$
  select p.closed_at is null and (p.closes_at is null or p.closes_at > now()) $$;
revoke execute on function public.poll_is_open(public.polls) from public, anon, authenticated;

create function public.create_poll(p_question text, p_description text, p_options text[], p_multi boolean, p_max int,
                                   p_show text, p_allow_add boolean, p_closes timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; opts text[]; l text; i int := 0; mx int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  if char_length(btrim(coalesce(p_question,''))) < 3 then raise exception 'Write a question of at least 3 characters.'; end if;
  if (select count(*) from polls where user_id = auth.uid() and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'You can create 5 polls per day.'; end if;
  opts := '{}';
  foreach l in array coalesce(p_options, '{}') loop
    l := btrim(l);
    if l <> '' and not exists (select 1 from unnest(opts) o where lower(o) = lower(l)) then opts := opts || left(l, 100); end if;
  end loop;
  if cardinality(opts) < 2 then raise exception 'Add at least 2 different choices.'; end if;
  if cardinality(opts) > 10 then raise exception 'A poll can have up to 10 choices.'; end if;
  if p_closes is not null and (p_closes <= now() + interval '4 minutes' or p_closes > now() + interval '90 days') then
    raise exception 'Choose a close time between 5 minutes and 90 days from now.'; end if;
  if coalesce(p_multi, false) then mx := least(greatest(coalesce(p_max, cardinality(opts)), 2), cardinality(opts)); else mx := 1; end if;
  insert into polls (user_id, question, description, multi, max_choices, show_results, allow_add, closes_at)
    values (auth.uid(), left(btrim(p_question), 200), left(btrim(coalesce(p_description,'')), 500), coalesce(p_multi,false), mx,
            case when p_show in ('always','after_vote','after_close') then p_show else 'always' end, coalesce(p_allow_add,false), p_closes)
    returning id into pid;
  foreach l in array opts loop i := i + 1; insert into poll_options (poll_id, label, position) values (pid, l, i); end loop;
  return pid;
end $$;

create function public.cast_poll_vote(p_poll uuid, p_options uuid[]) returns void language plpgsql security definer set search_path = public as $$
declare p polls%rowtype; ids uuid[]; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into p from polls where id = p_poll for update;
  if not found then raise exception 'Poll not found.'; end if;
  if not poll_is_open(p) then raise exception 'This poll is closed.'; end if;
  select coalesce(array_agg(distinct x), '{}') into ids from unnest(coalesce(p_options, '{}')) x where x is not null;
  n := cardinality(ids);
  if n > p.max_choices then raise exception 'Choose up to % option(s).', p.max_choices; end if;
  if n > 0 and (select count(*) from poll_options where poll_id = p_poll and id = any(ids)) <> n then raise exception 'Those choices don’t belong to this poll.'; end if;
  delete from poll_votes where poll_id = p_poll and user_id = auth.uid();
  insert into poll_votes (poll_id, option_id, user_id) select p_poll, x, auth.uid() from unnest(ids) x;
end $$;

create function public.add_poll_option(p_poll uuid, p_label text) returns uuid language plpgsql security definer set search_path = public as $$
declare p polls%rowtype; oid uuid; lab text := left(btrim(coalesce(p_label,'')), 100);
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into p from polls where id = p_poll for update;
  if not found then raise exception 'Poll not found.'; end if;
  if not p.allow_add then raise exception 'This poll doesn’t accept new choices.'; end if;
  if not poll_is_open(p) then raise exception 'This poll is closed.'; end if;
  if lab = '' then raise exception 'Write the new choice first.'; end if;
  if (select count(*) from poll_options where poll_id = p_poll) >= 10 then raise exception 'A poll can have up to 10 choices.'; end if;
  if (select count(*) from poll_options where poll_id = p_poll and added_by = auth.uid()) >= 2 then raise exception 'You can add 2 choices to a poll.'; end if;
  if exists (select 1 from poll_options where poll_id = p_poll and lower(label) = lower(lab)) then raise exception 'That choice is already there.'; end if;
  insert into poll_options (poll_id, label, position, added_by)
    values (p_poll, lab, (select coalesce(max(position), 0) + 1 from poll_options where poll_id = p_poll), auth.uid()) returning id into oid;
  return oid;
end $$;

create function public.close_poll(p_poll uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  update polls set closed_at = now() where id = p_poll and closed_at is null and (user_id = auth.uid() or is_admin());
  if not found then raise exception 'Poll not found, or already closed.'; end if;
end $$;

-- Vote counts, only where the poll's rule allows this person to see them.
create function public.poll_tallies() returns table (poll_id uuid, option_id uuid, votes bigint, voters bigint)
language sql stable security definer set search_path = public as $$
  select p.id, o.id,
         (select count(*) from poll_votes v where v.option_id = o.id),
         (select count(distinct v.user_id) from poll_votes v where v.poll_id = p.id)
  from polls p join poll_options o on o.poll_id = p.id
  where p.show_results = 'always' or not poll_is_open(p) or p.user_id = auth.uid()
     or (p.show_results = 'after_vote' and exists (select 1 from poll_votes mine where mine.poll_id = p.id and mine.user_id = auth.uid())) $$;

revoke execute on function public.create_poll(text, text, text[], boolean, int, text, boolean, timestamptz) from public, anon;
revoke execute on function public.cast_poll_vote(uuid, uuid[]) from public, anon;
revoke execute on function public.add_poll_option(uuid, text) from public, anon;
revoke execute on function public.close_poll(uuid) from public, anon;
revoke execute on function public.poll_tallies() from public;
grant execute on function public.create_poll(text, text, text[], boolean, int, text, boolean, timestamptz) to authenticated;
grant execute on function public.cast_poll_vote(uuid, uuid[]) to authenticated;
grant execute on function public.add_poll_option(uuid, text) to authenticated;
grant execute on function public.close_poll(uuid) to authenticated;
grant execute on function public.poll_tallies() to anon, authenticated;
