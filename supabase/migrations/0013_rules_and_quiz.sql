-- Event rules and the optional "rules check".
-- Hosts write the rules (from a template or their own). If the host turns the rules check on, anyone joining
-- must answer one multiple-choice question about each of 3 randomly picked rules. Answers never leave the database.

alter table public.events
  add column rules jsonb not null default '[]' check (jsonb_typeof(rules) = 'array' and jsonb_array_length(rules) <= 30 and length(rules::text) <= 20000),
  add column quiz_required boolean not null default false;
grant select (rules, quiz_required) on public.events to anon;

-- Quiz questions (with answers): only the host can read or write them.
create table public.event_quiz (
  event_id uuid primary key references public.events on delete cascade,
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 30 and length(questions::text) <= 30000));
alter table public.event_quiz enable row level security;
revoke all on public.event_quiz from anon, authenticated;
grant select, insert, update, delete on public.event_quiz to authenticated;
create policy "host reads quiz"   on public.event_quiz for select to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host adds quiz"    on public.event_quiz for insert to authenticated with check (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host edits quiz"   on public.event_quiz for update to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid())) with check (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
create policy "host deletes quiz" on public.event_quiz for delete to authenticated using (exists (select 1 from public.events e where e.id = event_id and e.host = auth.uid()));
select public.require_mfa('event_quiz');

-- What each person was asked, and who has passed. Only the functions below touch these.
create table public.quiz_attempts (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  picked jsonb not null,           -- [{i: question index, options: [shuffled option texts]}]
  tries int not null default 0,
  window_start timestamptz not null default now(),
  primary key (event_id, user_id));
alter table public.quiz_attempts enable row level security;
revoke all on public.quiz_attempts from anon, authenticated;
create table public.quiz_passes (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  passed_at timestamptz not null default now(),
  primary key (event_id, user_id));
alter table public.quiz_passes enable row level security;
revoke all on public.quiz_passes from anon, authenticated;

-- A question is usable when it has text, a right answer, and at least one wrong answer.
create function public.quiz_valid(q jsonb) returns boolean language sql immutable set search_path = public as $$
  select jsonb_typeof(q) = 'object' and coalesce(btrim(q ->> 'q'), '') <> '' and coalesce(btrim(q ->> 'ok'), '') <> ''
     and jsonb_typeof(q -> 'bad') = 'array' and jsonb_array_length(q -> 'bad') between 1 and 5 $$;
revoke execute on function public.quiz_valid(jsonb) from public, anon, authenticated;

-- Hand out up to 3 random questions, options shuffled, without the answers.
create function public.get_event_quiz(p_event uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare ev events%rowtype; qs jsonb; picked jsonb := '[]'; pr record; opts jsonb; out jsonb := '[]'; a quiz_attempts%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into ev from events where id = p_event;
  if not found then raise exception 'Event not found.'; end if;
  select questions into qs from event_quiz where event_id = p_event;
  if qs is null then return '[]'; end if;
  select * into a from quiz_attempts where event_id = p_event and user_id = auth.uid();
  if found and a.window_start > now() - interval '1 hour' and a.tries >= 12 then raise exception 'Too many tries. Read the rules and try again in an hour.'; end if;
  for pr in select (e.ord - 1)::int as i, e.q from jsonb_array_elements(qs) with ordinality as e(q, ord) where quiz_valid(e.q) order by random() limit 3 loop
    select jsonb_agg(o order by random()) into opts from (select jsonb_array_elements_text(pr.q -> 'bad') o union all select pr.q ->> 'ok') x;
    picked := picked || jsonb_build_object('i', pr.i, 'options', opts);
    out := out || jsonb_build_object('q', pr.q ->> 'q', 'options', opts);
  end loop;
  insert into quiz_attempts (event_id, user_id, picked, tries, window_start) values (p_event, auth.uid(), picked, 0, now())
    on conflict (event_id, user_id) do update set picked = excluded.picked,
      tries = case when quiz_attempts.window_start > now() - interval '1 hour' then quiz_attempts.tries else 0 end,
      window_start = case when quiz_attempts.window_start > now() - interval '1 hour' then quiz_attempts.window_start else now() end;
  return out;
end $$;

-- Grade the answers (one chosen option text per question, in the order handed out).
create function public.submit_event_quiz(p_event uuid, p_answers jsonb) returns boolean language plpgsql security definer set search_path = public as $$
declare a quiz_attempts%rowtype; qs jsonb; k int; ok boolean := true; n int;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into a from quiz_attempts where event_id = p_event and user_id = auth.uid() for update;
  if not found or jsonb_array_length(a.picked) = 0 then raise exception 'Ask for the questions first.'; end if;
  select questions into qs from event_quiz where event_id = p_event;
  n := jsonb_array_length(a.picked);
  if jsonb_typeof(p_answers) <> 'array' or jsonb_array_length(p_answers) <> n then raise exception 'Answer every question.'; end if;
  for k in 0 .. n - 1 loop
    if (p_answers ->> k) is distinct from (qs -> ((a.picked -> k ->> 'i')::int) ->> 'ok') then ok := false; end if;
  end loop;
  update quiz_attempts set tries = tries + 1, picked = '[]' where event_id = p_event and user_id = auth.uid();   -- every attempt needs fresh questions
  if ok then insert into quiz_passes (event_id, user_id) values (p_event, auth.uid()) on conflict (event_id, user_id) do update set passed_at = now(); end if;
  return ok;
end $$;
revoke execute on function public.get_event_quiz(uuid) from public, anon;
revoke execute on function public.submit_event_quiz(uuid, jsonb) from public, anon;
grant execute on function public.get_event_quiz(uuid) to authenticated;
grant execute on function public.submit_event_quiz(uuid, jsonb) to authenticated;

-- Joining (or joining the waitlist) needs a recent pass when the host turned the check on. The host isn't asked.
create or replace function public.registrations_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ev events%rowtype; is_host boolean; is_self boolean; delta int; usable int;
begin
  if tg_op = 'INSERT' then
    select * into ev from events where id = new.event_id for update;
    if not found then raise exception 'Event not found.'; end if;
    if ev.cancelled then raise exception 'This event was cancelled.'; end if;
    if coalesce(ev.ends_at, ev.starts_at + interval '12 hours') < now() then raise exception 'This event has already ended.'; end if;
    if ev.quiz_required and auth.uid() is not null and ev.host <> auth.uid() then
      select count(*) into usable from event_quiz q, jsonb_array_elements(q.questions) e where q.event_id = ev.id and quiz_valid(e);
      if usable > 0 and not exists (select 1 from quiz_passes p where p.event_id = ev.id and p.user_id = new.user_id and p.passed_at > now() - interval '2 hours') then
        raise exception 'Pass the rules check first.'; end if;
    end if;
    if ev.capacity is not null and new.party_size > ev.capacity then raise exception 'That group is larger than the event capacity.'; end if;
    new.paid := false; new.paid_at := null; new.checked_in := false; new.created_at := now(); new.note := btrim(new.note);
    if ev.capacity is null or ev.reg_count + new.party_size <= ev.capacity then
      new.waitlisted := false;
      update events set reg_count = reg_count + new.party_size where id = new.event_id;
    else
      new.waitlisted := true;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    is_host := exists (select 1 from events e where e.id = old.event_id and e.host = auth.uid());
    is_self := old.user_id = auth.uid();
    new.event_id := old.event_id; new.user_id := old.user_id; new.created_at := old.created_at;
    if pg_trigger_depth() = 1 then new.waitlisted := old.waitlisted; end if;
    if is_self and not is_host then new.paid := old.paid; new.checked_in := old.checked_in; end if;
    if is_host and not is_self then new.party_size := old.party_size; new.note := old.note; end if;
    new.note := btrim(new.note);
    if new.waitlisted then new.checked_in := false; end if;
    new.paid_at := case when new.paid then coalesce(old.paid_at, now()) else null end;
    if new.party_size <> old.party_size then
      select * into ev from events where id = old.event_id for update;
      if ev.capacity is not null and new.party_size > ev.capacity then raise exception 'That group is larger than the event capacity.'; end if;
      if not old.waitlisted then
        delta := new.party_size - old.party_size;
        if delta > 0 and ev.capacity is not null and ev.reg_count + delta > ev.capacity then raise exception 'Not enough spots left for that group size.'; end if;
        update events set reg_count = reg_count + delta where id = old.event_id;
      end if;
    end if;
    return new;
  else
    if not old.waitlisted then
      update events set reg_count = greatest(reg_count - old.party_size, 0) where id = old.event_id;
      perform promote_waitlist(old.event_id);
    end if;
    return old;
  end if;
end $$;
