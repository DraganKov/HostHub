-- Guests can browse; reputation; privacy and anti-tamper hardening; 2FA enforcement.
-- Additive: nothing is dropped.

-- 1. Guests (not signed in) may read public content. They can never write.
do $$ declare t text; begin
  foreach t in array array['profiles','posts','comments','follows','groups','group_members'] loop
    execute format('create policy "guest read" on public.%I for select to anon using (true)', t);
  end loop;
end $$;
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

-- 2. Reputation (karma): total score of a user's posts. Maintained by the database.
alter table public.profiles add column rep integer not null default 0;
update public.profiles p set rep = coalesce((select sum(score) from public.posts where user_id = p.id), 0);
create function public.sync_rep() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then update profiles set rep = rep + new.score - old.score where id = new.user_id;
  else update profiles set rep = rep - old.score where id = old.user_id; end if;
  return coalesce(new, old);
end $$;
create trigger rep_on_score after update of score on public.posts for each row when (old.score is distinct from new.score) execute function public.sync_rep();
create trigger rep_on_delete after delete on public.posts for each row execute function public.sync_rep();
revoke execute on function public.sync_rep() from public, anon, authenticated;

-- No voting on your own posts (rep would be farmable).
drop policy "cast vote" on public.votes;
create policy "cast vote" on public.votes for insert to authenticated
  with check (user_id = auth.uid() and not exists (select 1 from public.posts p where p.id = post_id and p.user_id = auth.uid()));

-- 3. Users may only edit their own bio and username. Never rep, id or dates.
revoke update on public.profiles from authenticated;
grant update (bio, username) on public.profiles to authenticated;
alter table public.profiles drop constraint if exists profiles_username_check;
alter table public.profiles add constraint profiles_username_format check (username ~ '^[A-Za-z0-9_.-]{2,30}$');
create unique index profiles_username_lower on public.profiles (lower(username));

-- 4. Users may only set the content columns on insert (no forged score or dates).
revoke insert on public.posts, public.comments, public.messages, public.groups from authenticated;
grant insert (id, user_id, tag, body) on public.posts to authenticated;
grant insert (id, post_id, user_id, body) on public.comments to authenticated;
grant insert (id, sender, recipient, body) on public.messages to authenticated;
grant insert (id, name, about, owner) on public.groups to authenticated;

-- 5. A username is never derived from the email address (privacy).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare u text := nullif(trim(new.raw_user_meta_data->>'username'), '');
begin
  if u is null then
    u := 'user_' || substr(md5(new.id::text || random()::text), 1, 8);   -- OAuth sign-ups start with a random handle
  elsif u !~ '^[A-Za-z0-9_.-]{2,30}$' then
    raise exception 'Invalid username';
  end if;
  insert into profiles (id, username) values (new.id, u);
  return new;
end $$;

-- 6. Real two-factor enforcement: once a user has verified a 2FA factor, writes need an aal2 session.
create function public.mfa_ok() returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2', false)
      or not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified')
$$;
revoke execute on function public.mfa_ok() from public, anon;
grant execute on function public.mfa_ok() to authenticated;

-- Helper used by migrations only (not callable through the API).
create function public.require_mfa(tbl text, everything boolean default false) returns void language plpgsql as $$
declare c text;
begin
  if everything then
    execute format('create policy "mfa" on public.%I as restrictive for all to authenticated using ((select public.mfa_ok())) with check ((select public.mfa_ok()))', tbl);
  else
    foreach c in array array['insert','update','delete'] loop
      if c = 'insert' then execute format('create policy "mfa insert" on public.%I as restrictive for insert to authenticated with check ((select public.mfa_ok()))', tbl);
      else execute format('create policy "mfa %s" on public.%I as restrictive for %s to authenticated using ((select public.mfa_ok()))', c, tbl, c); end if;
    end loop;
  end if;
end $$;
revoke execute on function public.require_mfa(text, boolean) from public, anon, authenticated;
select public.require_mfa('profiles'); select public.require_mfa('posts'); select public.require_mfa('comments');
select public.require_mfa('follows'); select public.require_mfa('groups'); select public.require_mfa('group_members');
select public.require_mfa('votes', true); select public.require_mfa('messages', true); select public.require_mfa('notifications', true);
