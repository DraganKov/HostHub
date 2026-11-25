-- Finances are admin-only for now. Members can no longer read the ledger.
-- To reopen it to signed-in members later:
--   drop policy "admins read ledger" on public.ledger;
--   create policy "members read ledger" on public.ledger for select to authenticated using (true);
drop policy if exists "members read ledger" on public.ledger;
drop policy if exists "admins read ledger" on public.ledger;
create policy "admins read ledger" on public.ledger for select to authenticated
  using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
