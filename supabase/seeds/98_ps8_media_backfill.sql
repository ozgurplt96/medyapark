-- =====================================================================
-- PS8 — Media Operations V2 replay (committed; deterministic logic only)
--
-- `db reset` applies migrations to an EMPTY database and loads seeds
-- afterwards, so the data part of 20260921100000_ps8_media_operations_v2
-- is a no-op locally. This file replays it after the company-data seed.
-- It contains NO company data: only the structural decision that the
-- M1 LED area is a concurrent publication target (PO decision, 19 Sep 2026)
-- and the deterministic legacy exact-period consolidation function that
-- the migration itself defines.
-- =====================================================================
update public.alt_mecralar
   set occupancy_mode = 'concurrent', creative_seconds = 15
 where id = 4 and name = 'M1 Adana LED' and occupancy_mode = 'exclusive'
   and not exists (select 1 from public.media_placements p join public.units u on u.id = p.unit_id
                    where u.alt_mecra_id = 4);

select public._ps8_eski_kesin_birlestir() as ps8_birlestirilen;
