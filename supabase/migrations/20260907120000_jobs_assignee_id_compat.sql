-- =====================================================================
-- jobs.assignee_id — CURRENT IMPLEMENTATION COMPATIBILITY
-- ---------------------------------------------------------------------
-- Bu migration canonical Work/Entry semasi DEGILDIR ve oyle okunmamalidir.
-- Tek amaci: local semayi, upstream main'in halihazirda bekledigi production
-- sema gercekligiyle ayni hizaya getirmek.
--
-- NEDEN GEREKLI
--   origin/main (0a17052) icindeki assets/panel.js is kartina ekip uyesi
--   atamasi ekledi ve `jobs.assignee_id` kolonunu yaziyor. Kolon local
--   consolidated baseline'da (20260903130227) yoktu, cunku baseline 3 Eylul
--   tarihli; Halil bu kolonu sonradan production'a uygulamis.
--   Kolon olmadan panel.js hata yakalayip alani dusuruyor, kaydi yine
--   yaziyor ve "atama icin veritabani guncellemesi gerekli" uyarisi
--   gosteriyor — yani uygulama bozulmuyor, atama ozelligi calismiyor.
--
-- PRODUCTION GERCEKLIGI — 7 Eylul 2026, salt-okunur dogrulama
--   Yontem: PostgREST uzerinden publishable (browser) anahtariyla yalniz
--   GET istekleri. Hicbir yazma yapilmadi.
--     * kolon var        : ?select=assignee_id -> 200 [] ; olmayan kolon 42703 verir
--     * tip = bigint     : ?assignee_id=eq.abc -> 22P02 "invalid input syntax
--                          for type bigint"
--     * FK var, adi      : ?select=team!jobs_assignee_id_fkey(id) -> 200 ;
--       jobs_assignee_id_fkey  uydurma constraint adi PGRST200 verir
--     * hedef tablo team : jobs<->pages / jobs<->notes embed'leri PGRST200 verir
--
-- DOGRULANAMAYAN TEK AYRINTI
--   ON DELETE davranisi PostgREST uzerinden okunamaz; NO ACTION ve SET NULL
--   ayni constraint adini uretir. Burada SET NULL secildi (kullanici karari,
--   7 Eylul) cunku jobs tablosundaki diger uc FK — customer_id, mecra_id,
--   supplier_id — hepsi ON DELETE SET NULL kullaniyor. Ayrica canonical yonde
--   `team` ileride profile/role modeline evrilecek; silmeyi bloklayan bir FK
--   o migration sirasinda sorun cikarirdi.
--   Halil'in orijinal SQL'i eline gecerse burasi ona gore duzeltilmelidir.
--
-- CANONICAL NOT
--   Canonical modelde Work owner OPSIYONELDIR (D-209) ve belirli aksiyonlarin
--   sorumlulugu Entry uzerinde tutulur. Bu kolon canonical bir owner/assignee
--   gereksinimi degil, mevcut jobs implementasyonunun bir alanidir.
--   `jobs` tablosunun fiziksel kaderi D-224 ile Data Model/Migration
--   asamasina birakilmistir.
--
-- Idempotent: tekrar tekrar calistirilabilir, `db reset` ile otomatik uygulanir.
-- =====================================================================

alter table "public"."jobs"
  add column if not exists "assignee_id" bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'jobs_assignee_id_fkey'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table "public"."jobs"
      add constraint "jobs_assignee_id_fkey"
      foreign key ("assignee_id")
      references "public"."team"("id")
      on delete set null;
  end if;
end $$;

comment on column "public"."jobs"."assignee_id" is
  'Atanan ekip uyesi (team.id). Upstream panel.js ile uyumluluk icin eklendi; '
  'canonical Work owner gereksinimi degildir — bkz. D-209 / D-224.';
