-- شغّل مرة واحدة في Supabase → SQL Editor (بعد sample_inspections.sql)
alter table public.sample_inspections
  add column if not exists ref_image text,
  add column if not exists sample_image text,
  add column if not exists diff_image text,
  add column if not exists image_findings jsonb;
