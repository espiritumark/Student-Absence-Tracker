-- Run once in Supabase SQL Editor if you see:
-- Could not find the 'feedback' or 'feedback_notes' column of 'students' in the schema cache
--
-- Adds persisted report feedback (30–50 words) and optional extra notes per learning partner.

alter table public.students
  add column if not exists feedback text;

alter table public.students
  add column if not exists feedback_notes text;
