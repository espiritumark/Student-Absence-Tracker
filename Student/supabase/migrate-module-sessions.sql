-- Run once in Supabase SQL Editor if you see:
-- duplicate key value violates unique constraint "attendance_sessions_class_id_session_date_key"
--
-- This allows multiple modules/subjects on the same class and date.

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_class_id_session_date_key;

alter table public.attendance_sessions
  drop constraint if exists attendance_sessions_class_id_session_date_module_key;

alter table public.attendance_sessions
  add constraint attendance_sessions_class_id_session_date_module_key
  unique (class_id, session_date, module);
