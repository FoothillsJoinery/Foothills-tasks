-- Entry codes for jobs (lockbox, garage keypad, gate, etc.)
-- Run this in the Supabase SQL Editor

create table if not exists job_codes (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade not null,
  label text,
  code text not null,
  notes text,
  created_by text,
  created_at timestamptz default now()
);

alter table job_codes enable row level security;
create policy "public access" on job_codes for all using (true) with check (true);
