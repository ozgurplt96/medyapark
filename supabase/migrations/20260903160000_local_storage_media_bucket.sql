-- =====================================================================
-- LOCAL DEVELOPMENT ONLY — DO NOT PUSH TO REMOTE
-- ---------------------------------------------------------------------
-- The remote baseline dump (20260903130227_remote_baseline.sql) contains
-- only the `public` schema, so a fresh `supabase db reset` gives us a
-- stack with no storage buckets. panel.js `uploadFile()` writes to the
-- `media` bucket (paths `u/<ts>-<rand>.<ext>`; tuyap/ assets use `tuyap/`),
-- so without this migration every local upload fails with
-- "Bucket not found".
--
-- Production behaviour observed 2026-09-03 (read-only probes):
--   * bucket `media` exists, public read works
--     (GET /storage/v1/object/public/media/... -> 200)
--   * anon may LIST objects  (POST /object/list/media -> 200, folders
--     `tuyap/` and `u/`)
--   * anon may NOT write     (POST /object/media/... -> 400, RLS denied)
--   * bucket metadata itself is not anon-readable (no policy on
--     storage.buckets), so file_size_limit / allowed_mime_types could not
--     be read; we leave them NULL and inherit config.toml's 50MiB limit.
--
-- This mirrors that behaviour locally. It is idempotent so it can be
-- re-run safely.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, null, null)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Public/anon read: matches production, where the site renders media
-- without a session and the panel can list uploaded assets.
drop policy if exists "media_public_read" on storage.objects;
create policy "media_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'media');

-- Writes are panel-only (Supabase Auth session), as in production.
drop policy if exists "media_authenticated_insert" on storage.objects;
create policy "media_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'media');

drop policy if exists "media_authenticated_update" on storage.objects;
create policy "media_authenticated_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'media')
  with check (bucket_id = 'media');

drop policy if exists "media_authenticated_delete" on storage.objects;
create policy "media_authenticated_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'media');
