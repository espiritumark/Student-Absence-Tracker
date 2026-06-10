-- Run once in Supabase SQL Editor if you see:
-- Could not find the 'feedback' column of 'students' in the schema cache
--
-- Adds persisted report feedback per learning partner (30–50 words in the app).

alter table public.students
  add column if not exists feedback text;
