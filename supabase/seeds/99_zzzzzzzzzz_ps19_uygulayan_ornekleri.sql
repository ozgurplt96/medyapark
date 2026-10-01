-- =====================================================================
-- PS19 — Uygulayan örnekleri (Baskı & Montaj seçicisi için)
--
-- Commit edilir, şirket verisi içermez, idempotenttir. Yalnız "(demo)"
-- etiketli sentetik kurumlara ve bu tohumun oluşturduğu sentetik kişiye
-- dokunur. Gerçek kurum / kişi kaydı oluşturmaz, eşleştirmez, rol atamaz:
-- Önder, BASKIMARK ve ONLINE DIGITAL gibi gerçek uygulayıcıların kimliği
-- geçiş provasında mevcut kayıtlarla doğrulanacaktır.
--
--   · "Örnek Baskı Merkezi (demo)"  → ilişki rolü: Baskı merkezi
--   · "Örnek Uygulama Ekibi (demo)" → ilişki rolü: Uygulayıcı
--   · "Örnek Saha Uygulayıcısı (demo)" kişisi (kurumsuz, uygulayıcı işaretli)
--   · tohum işi 9301 içindeki yapılacak söküm örnek kişiye atanır (kişi
--     seçimi örneği) — yalnız uygulayanı boşsa.
-- =====================================================================
do $$
declare k bigint;
begin
  update public.customers
     set relationship_roles = relationship_roles || '["print_center"]'::jsonb
   where firma = 'Örnek Baskı Merkezi (demo)' and source_type = 'demo'
     and not relationship_roles @> '["print_center"]'::jsonb;
  update public.customers
     set relationship_roles = relationship_roles || '["installer"]'::jsonb
   where firma = 'Örnek Uygulama Ekibi (demo)' and source_type = 'demo'
     and not relationship_roles @> '["installer"]'::jsonb;

  select id into k from public.contacts
   where name = 'Örnek Saha Uygulayıcısı (demo)' and source_type = 'demo' order by id limit 1;
  if k is null then
    insert into public.contacts (name, title, is_executor, source_type, source_ref)
    values ('Örnek Saha Uygulayıcısı (demo)', 'Montaj ve söküm', true, 'demo', 'ps19')
    returning id into k;
  end if;

  update public.work_operations o
     set supplier_contact_id = k
    from public.jobs j
   where j.id = o.job_id and j.sort = 9301 and o.operation_type = 'sokum' and o.status = 'planned'
     and o.supplier_contact_id is null and o.supplier_org_id is null;
end $$;
