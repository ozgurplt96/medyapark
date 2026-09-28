-- =====================================================================
-- PS14b — yönetim kayıtlarında sürüm damgası ve sunucu doğrulaması (EKLEMELİ)
--
-- Tedarikçi, ürün, sayfa ve not formları satırın TAMAMINI yazıyordu ve
-- eşzamanlılık denetimi yoktu: iki yönetici aynı kaydı düzenlerse sonra
-- kaydedenin formu öncekinin değişikliğini sessizce eziyordu (ürün fiyatı,
-- public site sayfa içeriği, IBAN). Tek ortak mekanizma: `updated_at`
-- sürüm damgası. Form açıldığındaki damga hâlâ yerindeyse yalnız DEĞİŞEN
-- alanlar yazılır; değilse yazım olmaz ve kullanıcıya söylenir.
-- (Sayfa içeriği ve fiyat listesi büyük jsonb'dir; alan alan karşılaştırma
-- yerine sürüm damgası kullanılır.)
--
-- Zorunlu alanlar sunucuda da denetlenir. Kısıtlar NOT VALID: mevcut
-- satırlar yargılanmaz, yeni yazımlar denetlenir. Yetki (RLS: güncelleme
-- yalnız yönetici) değişmedi.
-- =====================================================================

alter table public.suppliers add column if not exists updated_at timestamptz;
alter table public.products  add column if not exists updated_at timestamptz;
alter table public.pages     add column if not exists updated_at timestamptz;
alter table public.notes     add column if not exists updated_at timestamptz;

create or replace function public._surum_damgasi()
returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function public._surum_damgasi() from public, anon, authenticated;

drop trigger if exists trg_surum_damgasi on public.suppliers;
drop trigger if exists trg_surum_damgasi on public.products;
drop trigger if exists trg_surum_damgasi on public.pages;
drop trigger if exists trg_surum_damgasi on public.notes;
create trigger trg_surum_damgasi before update on public.suppliers for each row execute function public._surum_damgasi();
create trigger trg_surum_damgasi before update on public.products  for each row execute function public._surum_damgasi();
create trigger trg_surum_damgasi before update on public.pages     for each row execute function public._surum_damgasi();
create trigger trg_surum_damgasi before update on public.notes     for each row execute function public._surum_damgasi();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'suppliers_firma_dolu') then
    alter table public.suppliers add constraint suppliers_firma_dolu
      check (length(btrim(coalesce(firma, name, ''))) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_name_dolu') then
    alter table public.products add constraint products_name_dolu
      check (length(btrim(coalesce(name, ''))) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_prices_nesne') then
    alter table public.products add constraint products_prices_nesne
      check (prices is null or jsonb_typeof(prices) = 'object') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pages_title_dolu') then
    alter table public.pages add constraint pages_title_dolu
      check (length(btrim(coalesce(title, ''))) > 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pages_blocks_dizi') then
    alter table public.pages add constraint pages_blocks_dizi
      check (blocks is null or jsonb_typeof(blocks) = 'array') not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notes_bos_degil') then
    alter table public.notes add constraint notes_bos_degil
      check (length(btrim(coalesce(konu, '') || coalesce(body, ''))) > 0) not valid;
  end if;
end $$;

comment on column public.suppliers.updated_at is 'PS14: sürüm damgası (tetikleyici); koşullu kayıt için.';
comment on column public.products.updated_at  is 'PS14: sürüm damgası (tetikleyici); koşullu kayıt için.';
comment on column public.pages.updated_at     is 'PS14: sürüm damgası (tetikleyici); koşullu kayıt için.';
comment on column public.notes.updated_at     is 'PS14: sürüm damgası (tetikleyici); koşullu kayıt için.';

notify pgrst, 'reload schema';
