-- ═════════════════════════════════════════════════════════════════════════════
-- NORDBOK STUDIO — Private storage buckets for receipt images and the
-- long-term document archive. Per-user folders enforced via RLS on
-- storage.objects (path must begin with auth.uid()).
-- ═════════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('studio-receipts',  'studio-receipts',  false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('studio-documents', 'studio-documents', false, 52428800, array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/csv','text/plain','application/zip','application/x-sie'])
on conflict (id) do nothing;

-- ─── Read own ──────────────────────────────────────────────────────────────
drop policy if exists "studio_receipts_read_own"  on storage.objects;
drop policy if exists "studio_documents_read_own" on storage.objects;
create policy "studio_receipts_read_own"  on storage.objects
  for select using (bucket_id = 'studio-receipts'  and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio_documents_read_own" on storage.objects
  for select using (bucket_id = 'studio-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Insert own ────────────────────────────────────────────────────────────
drop policy if exists "studio_receipts_insert_own"  on storage.objects;
drop policy if exists "studio_documents_insert_own" on storage.objects;
create policy "studio_receipts_insert_own"  on storage.objects
  for insert with check (bucket_id = 'studio-receipts'  and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio_documents_insert_own" on storage.objects
  for insert with check (bucket_id = 'studio-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Update own ────────────────────────────────────────────────────────────
drop policy if exists "studio_receipts_update_own"  on storage.objects;
drop policy if exists "studio_documents_update_own" on storage.objects;
create policy "studio_receipts_update_own"  on storage.objects
  for update using (bucket_id = 'studio-receipts'  and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio_documents_update_own" on storage.objects
  for update using (bucket_id = 'studio-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- ─── Delete own ────────────────────────────────────────────────────────────
drop policy if exists "studio_receipts_delete_own"  on storage.objects;
drop policy if exists "studio_documents_delete_own" on storage.objects;
create policy "studio_receipts_delete_own"  on storage.objects
  for delete using (bucket_id = 'studio-receipts'  and (storage.foldername(name))[1] = auth.uid()::text);
create policy "studio_documents_delete_own" on storage.objects
  for delete using (bucket_id = 'studio-documents' and (storage.foldername(name))[1] = auth.uid()::text);
