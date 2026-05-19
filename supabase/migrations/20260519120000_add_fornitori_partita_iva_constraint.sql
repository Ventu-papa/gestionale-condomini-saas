alter table if exists public.fornitori
  drop constraint if exists fornitori_partita_iva_check;

alter table if exists public.fornitori
  add constraint fornitori_partita_iva_check
  check (partita_iva = '' or partita_iva ~ '^[0-9]{11}$') not valid;
