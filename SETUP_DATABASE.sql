-- Run this entire block in the Supabase SQL Editor

create table jobs (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_by text,
  created_at timestamptz default now()
);

create table sections (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade,
  name text not null,
  created_by text,
  created_at timestamptz default now()
);

create table tasks (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade,
  section_id uuid references sections(id) on delete set null,
  title text not null,
  notes text,
  status text default 'ready',
  prev_status text,
  created_by text,
  created_at timestamptz default now(),
  completed_at timestamptz,
  completed_by text
);

create table needs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references tasks(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  text text not null,
  requested_by text,
  created_at timestamptz default now(),
  resolved_at timestamptz,
  answer text,
  resolved_by text
);

create table activity (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade,
  who text,
  msg text,
  created_at timestamptz default now()
);

-- Allow public read/write (the app handles access via job links)
alter table jobs enable row level security;
alter table sections enable row level security;
alter table tasks enable row level security;
alter table needs enable row level security;
alter table activity enable row level security;

create policy "public access" on jobs for all using (true) with check (true);
create policy "public access" on sections for all using (true) with check (true);
create policy "public access" on tasks for all using (true) with check (true);
create policy "public access" on needs for all using (true) with check (true);
create policy "public access" on activity for all using (true) with check (true);
