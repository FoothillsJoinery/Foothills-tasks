-- Lock down entry codes: anonymous access is cut off entirely.
-- Admin can manage codes; active roster carpenters can view codes
-- only for jobs they've been granted.
-- Run this in the Supabase SQL Editor (after JOB_CODES_MIGRATION.sql).

drop policy "public access" on job_codes;

create policy "admin all" on job_codes
  for all to authenticated
  using (lower(auth.jwt()->>'email') = 'matt@foothillsjoinery.com')
  with check (lower(auth.jwt()->>'email') = 'matt@foothillsjoinery.com');

create policy "carpenter read granted jobs" on job_codes
  for select to authenticated
  using (
    exists (
      select 1
      from job_access ja
      join carpenters c on c.id = ja.carpenter_id
      where ja.job_id = job_codes.job_id
        and lower(c.email) = lower(auth.jwt()->>'email')
        and c.active
        and ja.revoked_at is null
    )
  );
