-- Field owners can claim imported listings. An admin reviews each claim; approving it transfers ownership and shows a "Verified owner" badge.
-- Evidence a claimant provides is visible only to the claimant and admins.

alter table public.fields add column verified boolean not null default false;   -- set only by an approved claim

create table public.field_claims (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields on delete cascade,
  claimant uuid not null references public.profiles on delete cascade default auth.uid(),
  message text not null check (char_length(message) between 10 and 1000),
  evidence_url text check (evidence_url is null or (evidence_url ~ '^https?://' and char_length(evidence_url) <= 300)),
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 300),
  decided_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz);
create unique index one_pending_claim on public.field_claims (field_id, claimant) where status = 'pending';
create index on public.field_claims (claimant);
create index on public.field_claims (status, created_at);
alter table public.field_claims enable row level security;
create policy "see own claims or admin sees all" on public.field_claims for select to authenticated using (claimant = auth.uid() or (select public.is_admin()));
revoke insert, update, delete on public.field_claims from authenticated;
select public.require_mfa('field_claims');

-- A listing can be claimed while it came from an import and no claim has been approved yet.
create function public.claim_field(p_field uuid, p_message text, p_evidence text default null) returns uuid language plpgsql security definer set search_path = public as $$
declare f fields%rowtype; cid uuid; a record;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into f from fields where id = p_field;
  if not found then raise exception 'Listing not found.'; end if;
  if f.source is null or f.verified then raise exception 'This listing can’t be claimed.'; end if;
  if f.owner = auth.uid() then raise exception 'You already manage this listing.'; end if;
  if exists (select 1 from field_claims where field_id = p_field and claimant = auth.uid() and status = 'pending') then raise exception 'You already have a claim waiting on this listing.'; end if;
  if (select count(*) from field_claims where claimant = auth.uid() and created_at > now() - interval '24 hours') >= 5 then raise exception 'You can send 5 claims per day.'; end if;
  if (select count(*) from field_claims where claimant = auth.uid() and status = 'pending') >= 5 then raise exception 'You have 5 claims waiting. Wait for a decision or withdraw one.'; end if;
  insert into field_claims (field_id, claimant, message, evidence_url) values (p_field, auth.uid(), btrim(p_message), nullif(btrim(coalesce(p_evidence,'')), '')) returning id into cid;
  for a in select user_id from admins loop
    insert into notifications (user_id, actor_id, text) values (a.user_id, auth.uid(), 'claimed ' || f.name);
  end loop;
  return cid;
end $$;
revoke execute on function public.claim_field(uuid, text, text) from public, anon;
grant execute on function public.claim_field(uuid, text, text) to authenticated;

create function public.withdraw_claim(p_claim uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  update field_claims set status = 'withdrawn', decided_at = now() where id = p_claim and claimant = auth.uid() and status = 'pending';
  if not found then raise exception 'No pending claim found.'; end if;
end $$;
revoke execute on function public.withdraw_claim(uuid) from public, anon;
grant execute on function public.withdraw_claim(uuid) to authenticated;

-- Admin decision. Approving transfers ownership, marks the listing verified, and closes other pending claims on it.
create function public.decide_claim(p_claim uuid, p_approve boolean, p_note text default null) returns void language plpgsql security definer set search_path = public as $$
declare c field_claims%rowtype; f fields%rowtype;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  if not mfa_ok() then raise exception 'Two-factor verification required.'; end if;
  select * into c from field_claims where id = p_claim and status = 'pending' for update;
  if not found then raise exception 'That claim was already decided.'; end if;
  select * into f from fields where id = c.field_id for update;
  if not found then raise exception 'Listing not found.'; end if;
  if p_approve then
    if f.verified then raise exception 'This listing already has a verified owner.'; end if;
    update fields set owner = c.claimant, verified = true where id = f.id;
    update field_claims set status = 'rejected', decided_by = auth.uid(), decided_at = now(), decision_note = 'Another claim was approved.' where field_id = f.id and status = 'pending' and id <> c.id;
  end if;
  update field_claims set status = case when p_approve then 'approved' else 'rejected' end, decided_by = auth.uid(), decided_at = now(), decision_note = left(nullif(btrim(coalesce(p_note,'')), ''), 300) where id = c.id;
  insert into notifications (user_id, actor_id, text) values (c.claimant, auth.uid(), case when p_approve then 'approved your claim for ' else 'declined your claim for ' end || f.name);
end $$;
revoke execute on function public.decide_claim(uuid, boolean, text) from public, anon;
grant execute on function public.decide_claim(uuid, boolean, text) to authenticated;
