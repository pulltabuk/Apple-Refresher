-- Apple's quarterly results: the next date for the homepage and the
-- /earnings/ archive. Run once in the Supabase SQL editor; safe to run
-- again (the table and the quarters below are only added if missing).
--
-- The quarters already listed were checked against Apple's Newsroom
-- press releases plus a second source (SEC filing or press coverage).

create table if not exists earnings (
  id uuid primary key default gen_random_uuid(),
  fiscal_year int not null,
  fiscal_quarter int not null check (fiscal_quarter between 1 and 4),
  quarter_end date,
  report_date date not null,
  report_time text default '1:30pm PT',
  call_time text default '2pm PT',
  press_release_url text,
  headline text,
  created_at timestamptz not null default now(),
  unique (fiscal_year, fiscal_quarter)
);

alter table earnings enable row level security;

drop policy if exists "Public read access on earnings" on earnings;
create policy "Public read access on earnings" on earnings for select using (true);
drop policy if exists "Authenticated insert on earnings" on earnings;
create policy "Authenticated insert on earnings" on earnings for insert to authenticated with check (true);
drop policy if exists "Authenticated update on earnings" on earnings;
create policy "Authenticated update on earnings" on earnings for update to authenticated using (true);
drop policy if exists "Authenticated delete on earnings" on earnings;
create policy "Authenticated delete on earnings" on earnings for delete to authenticated using (true);

insert into earnings (fiscal_year, fiscal_quarter, quarter_end, report_date, press_release_url, headline) values
  (2024, 1, '2023-12-30', '2024-02-01', 'https://www.apple.com/newsroom/2024/02/apple-reports-first-quarter-results/', 'Revenue $119.6bn, up 2%'),
  (2024, 2, '2024-03-30', '2024-05-02', 'https://www.apple.com/newsroom/2024/05/apple-reports-second-quarter-results/', 'Revenue $90.8bn, down 4%'),
  (2024, 3, '2024-06-29', '2024-08-01', 'https://www.apple.com/newsroom/2024/08/apple-reports-third-quarter-results/', 'Revenue $85.8bn, up 5%'),
  (2024, 4, '2024-09-28', '2024-10-31', 'https://www.apple.com/newsroom/2024/10/apple-reports-fourth-quarter-results/', 'Revenue $94.9bn, up 6%'),
  (2025, 1, '2024-12-28', '2025-01-30', 'https://www.apple.com/newsroom/2025/01/apple-reports-first-quarter-results/', 'Revenue $124.3bn, up 4%'),
  (2025, 2, '2025-03-29', '2025-05-01', 'https://www.apple.com/newsroom/2025/05/apple-reports-second-quarter-results/', 'Revenue $95.4bn, up 5%'),
  (2025, 3, '2025-06-28', '2025-07-31', 'https://www.apple.com/newsroom/2025/07/apple-reports-third-quarter-results/', 'Revenue $94.0bn, up 10%'),
  (2025, 4, '2025-09-27', '2025-10-30', 'https://www.apple.com/newsroom/2025/10/apple-reports-fourth-quarter-results/', 'Revenue $102.5bn, up 8%'),
  (2026, 1, '2025-12-27', '2026-01-29', 'https://www.apple.com/newsroom/2026/01/apple-reports-first-quarter-results/', 'Revenue $143.8bn, up 16%'),
  (2026, 2, '2026-03-28', '2026-04-30', 'https://www.apple.com/newsroom/2026/04/apple-reports-second-quarter-results/', 'Revenue $111.2bn, up 17%'),
  (2026, 3, '2026-06-27', '2026-07-30', 'https://www.apple.com/newsroom/2026/07/apple-reports-third-quarter-results/', 'Revenue $109.4bn, up 16%'),
  (2026, 4, '2026-09-26', '2026-11-02', null, null)
on conflict (fiscal_year, fiscal_quarter) do nothing;
