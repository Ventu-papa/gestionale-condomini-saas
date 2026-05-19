alter table if exists public.fornitori
  drop constraint if exists fornitori_telefono_check;

alter table if exists public.fornitori
  add constraint fornitori_telefono_check
  check (telefono = '' or telefono ~ '^[0-9]{6,11}$');

alter table if exists public.fornitori
  drop constraint if exists fornitori_iban_check;

alter table if exists public.fornitori
  add constraint fornitori_iban_check
  check (iban = '' or iban ~ '^IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}$');
