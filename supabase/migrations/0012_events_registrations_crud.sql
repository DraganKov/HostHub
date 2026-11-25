-- Events and registrations, full create / read / update / delete.
-- Registrations gain a group size, a note, check-in, and a waitlist. reg_count now means "spots taken" (sum of group sizes, waitlist excluded).
-- Events can be edited by their host; registered people are notified of time/place changes and cancellations; a freed spot goes to the waitlist in order.

alter table public.registrations
  add column party_size int not null default 1 check (party_size between 1 and 10),
  add column note text not null default '' check (char_length(note) <= 200),
  add column checked_in boolean not null default false,
  add column waitlisted boolean not null default false;
-- Existing people each hold one spot, which matches the old count.

-- Clients choose only their own group size and note; the host sets paid and check-in. Waitlist state is changed only by triggers.
revoke insert, update on public.registrations from authenticated;
grant insert (event_id, user_id, party_size, note) on public.registrations to authenticated;
grant update (paid, party_size, note, checked_in) on public.registrations to authenticated;
create policy "edit own registration" on public.registrations for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Moves people off the waitlist, oldest first, while there is room.
create function public.promote_waitlist(p_event uuid) returns void language plpgsql security definer set search_path = public as $$
declare ev events%rowtype; r registrations%rowtype;
begin
  select * into ev from events where id = p_event for update;
  if not found or ev.cancelled then return; end if;
  for r in select * from registrations where event_id = p_event and waitlisted order by created_at, user_id loop
    select reg_count into ev.reg_count from events where id = p_event;
    if ev.capacity is null or ev.reg_count + r.party_size <= ev.capacity then
      update registrations set waitlisted = false where event_id = p_event and user_id = r.user_id;
      update events set reg_count = reg_count + r.party_size where id = p_event;
      insert into notifications (user_id, actor_id, text) values (r.user_id, ev.host, 'moved you off the waitlist for ' || ev.title);
    end if;
  end loop;
end $$;
revoke execute on function public.promote_waitlist(uuid) from public, anon, authenticated;

create or replace function public.registrations_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ev events%rowtype; is_host boolean; is_self boolean; delta int;
begin
  if tg_op = 'INSERT' then
    select * into ev from events where id = new.event_id for update;
    if not found then raise exception 'Event not found.'; end if;
    if ev.cancelled then raise exception 'This event was cancelled.'; end if;
    if coalesce(ev.ends_at, ev.starts_at + interval '12 hours') < now() then raise exception 'This event has already ended.'; end if;
    if ev.capacity is not null and new.party_size > ev.capacity then raise exception 'That group is larger than the event capacity.'; end if;
    new.paid := false; new.paid_at := null; new.checked_in := false; new.created_at := now(); new.note := btrim(new.note);
    if ev.capacity is null or ev.reg_count + new.party_size <= ev.capacity then
      new.waitlisted := false;
      update events set reg_count = reg_count + new.party_size where id = new.event_id;
    else
      new.waitlisted := true;   -- full: join the waitlist
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

create or replace function public.notify_registration() returns trigger language plpgsql security definer set search_path = public as $$
declare ev events%rowtype;
begin
  select * into ev from events where id = new.event_id;
  if tg_op = 'INSERT' and ev.host <> new.user_id then
    insert into notifications (user_id, actor_id, text) values (ev.host, new.user_id, case when new.waitlisted then 'joined the waitlist for ' else 'registered for ' end || ev.title);
  elsif tg_op = 'UPDATE' and new.paid and not old.paid then
    insert into notifications (user_id, actor_id, text) values (new.user_id, ev.host, 'confirmed your payment for ' || ev.title);
  end if;
  return new;
end $$;

-- Editing an event: capacity can't drop below the people already registered.
create or replace function public.events_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reg_count := 0; new.cancelled := false; new.created_at := now();
    if new.starts_at < now() - interval '1 hour' then raise exception 'The start time must be in the future.'; end if;
    if (select count(*) from events where host = new.host and created_at > now() - interval '24 hours') >= 5 then raise exception 'Event limit reached: you can create 5 events per day.'; end if;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then raise exception 'That map does not belong to this field.'; end if;
  else
    new.host := old.host; new.created_at := old.created_at;
    if pg_trigger_depth() = 1 then new.reg_count := old.reg_count; end if;
    new.lat := old.lat; new.lng := old.lng; new.postal_code := old.postal_code; new.field_id := old.field_id;
    if new.capacity is not null and new.capacity < old.reg_count then
      raise exception 'Capacity can’t be lower than the % spots already taken.', old.reg_count; end if;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then raise exception 'That map does not belong to this field.'; end if;
  end if;
  return new;
end $$;

-- After an edit: tell registered and waitlisted people about changes, and let the waitlist in if capacity grew.
create function public.events_after_update() returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  if new.cancelled <> old.cancelled then msg := case when new.cancelled then 'cancelled ' else 'reopened ' end || new.title;
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at or new.venue is distinct from old.venue or new.title is distinct from old.title then
    msg := 'changed the details of ' || new.title; end if;
  if msg is not null then
    insert into notifications (user_id, actor_id, text) select r.user_id, new.host, msg from registrations r where r.event_id = new.id and r.user_id <> new.host;
  end if;
  if new.capacity is distinct from old.capacity or (new.cancelled <> old.cancelled and not new.cancelled) then perform promote_waitlist(new.id); end if;
  return new;
end $$;
revoke execute on function public.events_after_update() from public, anon, authenticated;
create trigger events_after_update after update on public.events for each row execute function public.events_after_update();
