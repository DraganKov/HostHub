-- Fix: events_guard froze reg_count on every UPDATE, including the increment made by registrations_guard,
-- so capacity was never enforced. Only direct (top-level) updates are frozen; nested trigger updates may change it.
create or replace function public.events_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.reg_count := 0; new.cancelled := false; new.created_at := now();
    if new.starts_at < now() - interval '1 hour' then raise exception 'The start time must be in the future.'; end if;
    if (select count(*) from events where host = new.host and created_at > now() - interval '24 hours') >= 5 then
      raise exception 'Event limit reached: you can create 5 events per day.'; end if;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then
      raise exception 'That map does not belong to this field.'; end if;
  else
    new.host := old.host; new.created_at := old.created_at;
    if pg_trigger_depth() = 1 then new.reg_count := old.reg_count; end if;
    new.lat := old.lat; new.lng := old.lng; new.postal_code := old.postal_code; new.field_id := old.field_id;
    if new.map_id is not null and not exists (select 1 from field_maps m where m.id = new.map_id and m.field_id = new.field_id) then
      raise exception 'That map does not belong to this field.'; end if;
  end if;
  return new;
end $$;
