-- Link hub classes to college portal class IDs (?class=242)
-- Run in Supabase SQL Editor after schema.sql

alter table public.classes
  add column if not exists portal_class_id integer;

create index if not exists classes_portal_class_id_idx
  on public.classes (user_id, portal_class_id)
  where portal_class_id is not null;
