-- Directory: listings carry a venue type, province and social links; partners are a small admin-managed list.
-- Owners and admins can edit and delete listings; admins manage partners.

alter table public.fields
  add column venue_type text check (venue_type is null or venue_type in ('indoor','outdoor','both')),
  add column province text not null default '' check (char_length(province) <= 40),
  add column facebook_url text check (facebook_url is null or (facebook_url ~ '^https?://' and char_length(facebook_url) <= 300)),
  add column instagram_url text check (instagram_url is null or (instagram_url ~ '^https?://' and char_length(instagram_url) <= 300)),
  add column discord_url text check (discord_url is null or (discord_url ~ '^https?://' and char_length(discord_url) <= 300));
create index on public.fields (province);

revoke insert, update on public.fields from authenticated;
grant insert (id, owner, name, about, postal_code, city, lat, lng, kind, address, website, venue_type, province, facebook_url, instagram_url, discord_url) on public.fields to authenticated;
grant update (name, about, boundary, address, website, city, postal_code, lat, lng, venue_type, province, facebook_url, instagram_url, discord_url) on public.fields to authenticated;

create policy "admin edits field" on public.fields for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin deletes field" on public.fields for delete to authenticated using ((select public.is_admin()));

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  website text check (website is null or (website ~ '^https?://' and char_length(website) <= 300)),
  facebook_url text check (facebook_url is null or (facebook_url ~ '^https?://' and char_length(facebook_url) <= 300)),
  instagram_url text check (instagram_url is null or (instagram_url ~ '^https?://' and char_length(instagram_url) <= 300)),
  active boolean not null default true,
  display_order int not null default 100 check (display_order between 0 and 9999),
  source text check (source is null or char_length(source) <= 80),
  created_at timestamptz not null default now());
alter table public.partners enable row level security;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to anon, authenticated;
grant insert (name, description, website, facebook_url, instagram_url, active, display_order, source), update (name, description, website, facebook_url, instagram_url, active, display_order), delete on public.partners to authenticated;
create policy "read active partners" on public.partners for select to anon, authenticated using (active);
create policy "admin reads partners" on public.partners for select to authenticated using ((select public.is_admin()));
create policy "admin adds partner" on public.partners for insert to authenticated with check ((select public.is_admin()));
create policy "admin edits partner" on public.partners for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin deletes partner" on public.partners for delete to authenticated using ((select public.is_admin()));
select public.require_mfa('partners');

-- Bulk import now understands type, province and social links, and accepts rows without a postal code.
create or replace function public.import_fields(p_rows jsonb, p_source text) returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; ins int := 0; skipped int := 0; dup int := 0; nm text; pc text; ct text; la double precision; lo double precision; k text; vt text;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'Send an array of at most 500 rows.'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      nm := left(btrim(r->>'name'), 80); pc := coalesce(nullif(left(btrim(r->>'postal_code'), 10), ''), 'N/A'); ct := left(btrim(coalesce(r->>'city','')), 80);
      la := (r->>'lat')::double precision; lo := (r->>'lng')::double precision;
      k := case when r->>'kind' = 'store' then 'store' else 'field' end;
      vt := case lower(coalesce(r->>'venue_type','')) when 'indoor' then 'indoor' when 'outdoor' then 'outdoor' when 'both' then 'both' else null end;
      if char_length(coalesce(nm,'')) < 2 or la is null or lo is null or la not between -90 and 90 or lo not between -180 and 180 then skipped := skipped + 1; continue; end if;
      if exists (select 1 from fields f where lower(f.name) = lower(nm) and f.kind = k and (f.postal_code = pc and pc <> 'N/A' or lower(f.city) = lower(ct))) then dup := dup + 1; continue; end if;
      insert into fields (owner, name, about, postal_code, city, lat, lng, kind, address, website, source, published, reviewed, published_at, venue_type, province, facebook_url, instagram_url, discord_url)
      values (auth.uid(), nm, left(coalesce(r->>'about',''), 1000), pc, ct, la, lo, k, left(coalesce(r->>'address',''), 200),
              case when r->>'website' ~ '^https?://' then left(r->>'website', 300) end, left(p_source, 80), true, true, now(), vt, left(coalesce(r->>'province',''), 40),
              case when r->>'facebook_url' ~ '^https?://' then left(r->>'facebook_url', 300) end,
              case when r->>'instagram_url' ~ '^https?://' then left(r->>'instagram_url', 300) end,
              case when r->>'discord_url' ~ '^https?://' then left(r->>'discord_url', 300) end);
      ins := ins + 1;
    exception when others then skipped := skipped + 1; end;
  end loop;
  return jsonb_build_object('inserted', ins, 'skipped', skipped, 'duplicates', dup);
end $$;
