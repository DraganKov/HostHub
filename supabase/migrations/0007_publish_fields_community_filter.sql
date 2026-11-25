-- Fields start as private drafts. Publishing posts the field to the feed for its postal/zip code.
-- Members upvote/downvote that post; a field whose score drops to -5 or lower is hidden from everyone but its owner and admins.

alter table public.posts  add column field_id uuid references public.fields on delete cascade,
                          add column postal_code text, add column lat double precision, add column lng double precision;
create index on public.posts (field_id);
create index on public.posts (lat, lng);
alter table public.fields add column published boolean not null default false,
                          add column published_at timestamptz,
                          add column post_id uuid references public.posts on delete set null,
                          add column reviewed boolean not null default false;   -- an admin has confirmed the field is fine
update public.fields set published = true, published_at = created_at;           -- fields that existed before this change stay visible

-- Clients may only set content columns. Publishing state is changed only by the functions below.
revoke insert, update on public.fields from authenticated;
grant insert (id, owner, name, about, postal_code, city, lat, lng) on public.fields to authenticated;
grant update (name, about, boundary) on public.fields to authenticated;

create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid()) $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Who can see a field: its owner, admins, and everyone (including guests) once it is published and not downvoted away.
drop policy "public read" on public.fields;
create policy "read visible fields" on public.fields for select to anon, authenticated using (
  owner = auth.uid() or (select public.is_admin())
  or (published and (reviewed or coalesce((select p.score from public.posts p where p.id = fields.post_id), 0) > -5)));
drop policy "public read" on public.field_maps;
create policy "read maps of visible fields" on public.field_maps for select to anon, authenticated using (
  exists (select 1 from public.fields f where f.id = field_id));

-- Publish: needs a playing area, limited to 3 per day, posts to the feed with the field's location.
create function public.publish_field(p_field uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare f fields%rowtype; pid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into f from fields where id = p_field and owner = auth.uid() for update;
  if not found then raise exception 'Field not found.'; end if;
  if f.published then raise exception 'This field is already published.'; end if;
  if f.boundary is null or coalesce(jsonb_array_length(f.boundary->'features'), 0) = 0 then
    raise exception 'Draw the playing area before publishing.'; end if;
  if (select count(*) from fields where owner = auth.uid() and published_at > now() - interval '24 hours') >= 3 then
    raise exception 'You can publish 3 fields per day.'; end if;
  insert into posts (user_id, tag, body, field_id, postal_code, lat, lng)
    values (f.owner, 'Field', left('New field: ' || f.name || case when f.about <> '' then E'\n' || f.about else '' end, 500), f.id, f.postal_code, f.lat, f.lng)
    returning id into pid;
  update fields set published = true, published_at = now(), post_id = pid where id = f.id;
  return pid;
end $$;
revoke execute on function public.publish_field(uuid) from public, anon;
grant execute on function public.publish_field(uuid) to authenticated;

-- Admin review of fields the community has hidden: 'restore' keeps it visible, 'remove' deletes it.
create function public.review_field(p_field uuid, p_action text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  if p_action = 'restore' then update fields set reviewed = true where id = p_field;
  elsif p_action = 'remove' then delete from fields where id = p_field;
  else raise exception 'Unknown action.'; end if;
end $$;
revoke execute on function public.review_field(uuid, text) from public, anon;
grant execute on function public.review_field(uuid, text) to authenticated;
