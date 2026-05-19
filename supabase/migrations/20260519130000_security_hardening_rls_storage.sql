do $$
begin
  if to_regclass('public.condomini') is not null then
    execute 'alter table public.condomini enable row level security';
    execute 'drop policy if exists "condomini_select_own" on public.condomini';
    execute 'drop policy if exists "condomini_insert_own" on public.condomini';
    execute 'drop policy if exists "condomini_update_own" on public.condomini';
    execute 'drop policy if exists "condomini_delete_own" on public.condomini';
    execute 'create policy "condomini_select_own" on public.condomini for select using (auth.uid() = user_id)';
    execute 'create policy "condomini_insert_own" on public.condomini for insert with check (auth.uid() = user_id)';
    execute 'create policy "condomini_update_own" on public.condomini for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "condomini_delete_own" on public.condomini for delete using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.fornitori') is not null then
    execute 'alter table public.fornitori enable row level security';
  end if;

  if to_regclass('public.studio_settings') is not null then
    execute 'alter table public.studio_settings enable row level security';
    execute 'drop policy if exists "studio_settings_select_own" on public.studio_settings';
    execute 'drop policy if exists "studio_settings_insert_own" on public.studio_settings';
    execute 'drop policy if exists "studio_settings_update_own" on public.studio_settings';
    execute 'drop policy if exists "studio_settings_delete_own" on public.studio_settings';
    execute 'create policy "studio_settings_select_own" on public.studio_settings for select using (auth.uid() = user_id)';
    execute 'create policy "studio_settings_insert_own" on public.studio_settings for insert with check (auth.uid() = user_id)';
    execute 'create policy "studio_settings_update_own" on public.studio_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "studio_settings_delete_own" on public.studio_settings for delete using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.gestionale_connections') is not null then
    execute 'alter table public.gestionale_connections enable row level security';
    execute 'drop policy if exists "gestionale_connections_select_own" on public.gestionale_connections';
    execute 'drop policy if exists "gestionale_connections_insert_own" on public.gestionale_connections';
    execute 'drop policy if exists "gestionale_connections_update_own" on public.gestionale_connections';
    execute 'drop policy if exists "gestionale_connections_delete_own" on public.gestionale_connections';
    execute 'create policy "gestionale_connections_select_own" on public.gestionale_connections for select using (auth.uid() = user_id)';
    execute 'create policy "gestionale_connections_insert_own" on public.gestionale_connections for insert with check (auth.uid() = user_id)';
    execute 'create policy "gestionale_connections_update_own" on public.gestionale_connections for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "gestionale_connections_delete_own" on public.gestionale_connections for delete using (auth.uid() = user_id)';
  end if;

  if to_regclass('public.communication_events') is not null then
    execute 'alter table public.communication_events enable row level security';
    execute 'drop policy if exists "communication_events_select_own" on public.communication_events';
    execute 'drop policy if exists "communication_events_insert_own" on public.communication_events';
    execute 'drop policy if exists "communication_events_update_own" on public.communication_events';
    execute 'drop policy if exists "communication_events_delete_own" on public.communication_events';
    execute 'create policy "communication_events_select_own" on public.communication_events for select using (auth.uid() = user_id)';
    execute 'create policy "communication_events_insert_own" on public.communication_events for insert with check (auth.uid() = user_id)';
    execute 'create policy "communication_events_update_own" on public.communication_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    execute 'create policy "communication_events_delete_own" on public.communication_events for delete using (auth.uid() = user_id)';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'gestionale_connections'
      and column_name = 'api_key'
  ) then
    execute 'revoke select (api_key) on public.gestionale_connections from anon, authenticated';
  end if;
end $$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'documenti',
  'documenti',
  false,
  20971520,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documenti_select_own_condominio" on storage.objects;
drop policy if exists "documenti_insert_own_condominio" on storage.objects;
drop policy if exists "documenti_update_own_condominio" on storage.objects;
drop policy if exists "documenti_delete_own_condominio" on storage.objects;

create policy "documenti_select_own_condominio"
on storage.objects
for select
using (
  bucket_id = 'documenti'
  and exists (
    select 1
    from public.condomini c
    where c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

create policy "documenti_insert_own_condominio"
on storage.objects
for insert
with check (
  bucket_id = 'documenti'
  and exists (
    select 1
    from public.condomini c
    where c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

create policy "documenti_update_own_condominio"
on storage.objects
for update
using (
  bucket_id = 'documenti'
  and exists (
    select 1
    from public.condomini c
    where c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
)
with check (
  bucket_id = 'documenti'
  and exists (
    select 1
    from public.condomini c
    where c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);

create policy "documenti_delete_own_condominio"
on storage.objects
for delete
using (
  bucket_id = 'documenti'
  and exists (
    select 1
    from public.condomini c
    where c.id::text = (storage.foldername(name))[1]
      and c.user_id = auth.uid()
  )
);
