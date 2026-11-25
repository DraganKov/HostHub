-- Only signed-in people who have confirmed their email or phone number can create, change or delete
-- anything they contributed. Reading stays open to everyone. This sits on top of the existing two-factor rule.

-- True when the caller is a real signed-in person with a confirmed email or phone number.
create or replace function public.is_verified() returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and coalesce(u.is_anonymous, false) = false
      and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null))
$$;
revoke execute on function public.is_verified() from public, anon;
grant execute on function public.is_verified() to authenticated;

create or replace function public.assert_verified() returns void language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_verified() then raise exception 'Confirm your email or phone number before you post or change anything.'; end if;
end $$;
revoke execute on function public.assert_verified() from public, anon;
grant execute on function public.assert_verified() to authenticated;

-- Tables: a restrictive policy on every write, next to the existing two-factor one.
-- user_settings (your own alert preferences) and notifications (read marks) are left alone: they are not contributions,
-- and people need to save a phone number before it can be confirmed.
do $$
declare t text;
begin
  for t in select distinct tablename from pg_policies
           where schemaname = 'public' and policyname like 'mfa%' and tablename not in ('user_settings', 'notifications')
  loop
    execute format('drop policy if exists "verified insert" on public.%I', t);
    execute format('drop policy if exists "verified update" on public.%I', t);
    execute format('drop policy if exists "verified delete" on public.%I', t);
    execute format('create policy "verified insert" on public.%I as restrictive for insert to authenticated with check ((select public.is_verified()))', t);
    execute format('create policy "verified update" on public.%I as restrictive for update to authenticated using ((select public.is_verified())) with check ((select public.is_verified()))', t);
    execute format('create policy "verified delete" on public.%I as restrictive for delete to authenticated using ((select public.is_verified()))', t);
  end loop;
end $$;

-- Functions: every one that writes already starts with the two-factor check. Put the verified check in front of it.
do $$
declare r record; def text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and p.prorettype <> 'trigger'::regtype and p.proname not in ('require_mfa', 'mfa_ok')
             and p.prosrc like '%if not mfa_ok() then%' and p.prosrc not like '%assert_verified%'
  loop
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'if not mfa_ok() then', 'perform public.assert_verified(); if not mfa_ok() then');
    execute def;
  end loop;
end $$;
