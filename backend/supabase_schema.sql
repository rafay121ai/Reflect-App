-- Run this in the Supabase SQL Editor to create the reflections table.

create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  thought text not null,
  sections jsonb not null,
  questions jsonb,
  answers jsonb,
  personalized_mirror text,
  created_at timestamptz default now()
);

-- Optional: enable RLS and add a policy so only the backend (service role) can read/write.
-- alter table public.reflections enable row level security;
-- create policy "Service role only" on public.reflections for all using (true);
