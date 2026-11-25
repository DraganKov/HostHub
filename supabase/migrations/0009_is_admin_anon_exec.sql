-- Guests evaluate the fields read policy, which calls is_admin() (returns false for them).
grant execute on function public.is_admin() to anon;
