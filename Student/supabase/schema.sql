-- Student Absence Tracker — run in Supabase SQL Editor
-- Dashboard → SQL → New query → paste → Run

create extension if not exists "pgcrypto";

-- ── Classes ──────────────────────────────────────────────────────────
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  intake integer,
  level integer,
  class_group integer,
  qualification text not null default '',
  name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists classes_user_id_idx on public.classes (user_id);

-- ── Students ─────────────────────────────────────────────────────────
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null,
  manual_total_absences integer,
  manual_consecutive_absences integer,
  manual_no_prior_notice boolean not null default false,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create index if not exists students_class_id_idx on public.students (class_id);
create index if not exists students_user_id_idx on public.students (user_id);

-- ── Daily attendance sessions ────────────────────────────────────────
create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  session_date date not null,
  module text not null default '',
  start_time text not null default '',
  duration text not null default '',
  created_at timestamptz not null default now(),
  unique (class_id, session_date)
);

create index if not exists attendance_sessions_class_id_idx
  on public.attendance_sessions (class_id);

-- ── Per-student records for a session ────────────────────────────────
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  status text not null check (status in ('present', 'absent')),
  prior_notice boolean not null default false,
  unique (session_id, student_id)
);

create index if not exists attendance_records_session_id_idx
  on public.attendance_records (session_id);

-- ── Row Level Security ───────────────────────────────────────────────
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

create policy "classes_select_own" on public.classes
  for select using (auth.uid() = user_id);
create policy "classes_insert_own" on public.classes
  for insert with check (auth.uid() = user_id);
create policy "classes_update_own" on public.classes
  for update using (auth.uid() = user_id);
create policy "classes_delete_own" on public.classes
  for delete using (auth.uid() = user_id);

create policy "students_select_own" on public.students
  for select using (auth.uid() = user_id);
create policy "students_insert_own" on public.students
  for insert with check (auth.uid() = user_id);
create policy "students_update_own" on public.students
  for update using (auth.uid() = user_id);
create policy "students_delete_own" on public.students
  for delete using (auth.uid() = user_id);

create policy "sessions_select_own" on public.attendance_sessions
  for select using (auth.uid() = user_id);
create policy "sessions_insert_own" on public.attendance_sessions
  for insert with check (auth.uid() = user_id);
create policy "sessions_update_own" on public.attendance_sessions
  for update using (auth.uid() = user_id);
create policy "sessions_delete_own" on public.attendance_sessions
  for delete using (auth.uid() = user_id);

create policy "records_select_own" on public.attendance_records
  for select using (auth.uid() = user_id);
create policy "records_insert_own" on public.attendance_records
  for insert with check (auth.uid() = user_id);
create policy "records_update_own" on public.attendance_records
  for update using (auth.uid() = user_id);
create policy "records_delete_own" on public.attendance_records
  for delete using (auth.uid() = user_id);
