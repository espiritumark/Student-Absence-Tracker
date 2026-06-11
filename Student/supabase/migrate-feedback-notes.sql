-- Run once in Supabase SQL Editor if you see:
-- Could not find the 'feedback_notes' column of 'students' in the schema cache
--
-- Adds optional longer notes per learning partner (separate from 30–50 word feedback).

alter table public.students
  add column if not exists feedback_notes text;
