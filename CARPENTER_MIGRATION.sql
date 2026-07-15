-- Run this in the Supabase SQL Editor

-- 1. Carpenter roster table
create table if not exists carpenters (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text unique not null,
  active boolean default true,
  created_at timestamptz default now()
);

alter table carpenters enable row level security;
create policy "public access" on carpenters for all using (true) with check (true);

-- 2. Link job_access rows to a carpenter identity
alter table job_access add column if not exists carpenter_id uuid references carpenters(id);

-- 3. Allow Supabase Auth magic links to redirect to /crew
-- (No SQL needed — configure in Supabase Dashboard:
--   Authentication → URL Configuration → Redirect URLs
--   Add: https://your-app.vercel.app/crew
--   And for local dev: http://localhost:3000/crew)
