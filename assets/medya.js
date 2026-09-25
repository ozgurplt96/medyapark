/* ==========================================================
   MECRALAR — OPERASYON V2 (Product Simplification S8)

   Gerçeğin kaynağı artık KESİN DÖNEMLİ yerleşimlerdir:
     statik (münhasır) -> tek bir fiziksel yüz   (media_placements.unit_id)
     LED (eşzamanlı)   -> bir yayın alanı         (media_placements.alt_mecra_id)
   Eski aylık `bookings` ızgarası eski kayıt / aylık PROJEKSİYON olarak
   okunur; bu ekranlar ona YAZMAZ.

   Tek sorgu yüzeyi: `media_schedule` görünümü (yerleşim + eski kayıt, tek
   normalleştirilmiş satır biçimi). Bugün, Yıl, İş/Kurum bağlamı, bitiş
   bildirimi, temel dışa aktarım ve gelecekteki Raporlar V2 AYNI kapsam
   yardımcılarını kullanır (mdModel / mdKapsam / mdAylikSatirlar).

   Hiçbir yerde tarih uydurulmaz: yalnız ay bilinen eski kayıt ay
   seviyesinde konuşur; bitişi bilinmeyen kayıt "Bitiş bilinmiyor" der.
   Renk daima metinle birlikte kullanılır.

   panel.js'ten sonra yüklenen klasik betik: global bağlamaları paylaşır
   (api, ui, esc, modal, go, orgKisa, _cIso, exportRows ...).
   ========================================================== */

const AY_UZUN=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
/* Bulunma hâli eki ay adına göre değişir (1 Ekim'de, 2 Ocak'ta, 5 Nisan'da). */
const AY_DE=["'ta","'ta","'ta","'da","'ta","'da","'da","'ta","'de","'de","'da","'ta"];

/* ---------- Yerel takvim günü (B51) ----------
   'YYYY-MM-DD' HİÇBİR yerde `new Date(iso)` ile ayrıştırılmaz: o UTC
   gece yarısıdır ve UTC'nin gerisindeki bir saat diliminde bir gün geri
   kayar. Tüm karşılaştırmalar yerel ISO dizgeleri üzerinde yapılır. */
/* `new Date(y,m,d)` 0–99 yıllarını 1900+y'ye çevirir ("0002" → 1902).
   setFullYear bu eşlemeyi yapmaz; yıl ne yazıldıysa odur. Geçersiz yıl
   ayrıca giriş katmanında (mdTarihDogrula) reddedilir. */
function mdGun(iso){ const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);
  const t=new Date(2000,0,1); t.setFullYear(y,m-1,d); return t; }
function mdBugun(){ return _cIso(new Date()); }
function mdEkle(iso,n){ const d=mdGun(iso); d.setDate(d.getDate()+n); return _cIso(d); }
function mdAySonu(iso){ const d=mdGun(iso); return _cIso(new Date(d.getFullYear(),d.getMonth()+1,0)); }
function mdYm(iso){ return String(iso).slice(0,7); }
function mdYmAdi(ym){ const [y,m]=String(ym).split('-'); return `${AY_UZUN[+m-1]} ${y}`; }
function mdNokta(iso){ if(!iso) return ''; const [y,m,d]=String(iso).slice(0,10).split('-'); return `${d}.${m}.${y}`; }
function mdKisa(iso,yilHer){ if(!iso) return ''; const d=mdGun(iso);
  const yil=(yilHer||d.getFullYear()!==new Date().getFullYear())?' '+d.getFullYear():'';
  return `${d.getDate()} ${AY_KISA[d.getMonth()]}${yil}`; }
/* "1 Ekim'de", "18 Eylül'de" */
function mdGunDe(iso){ const d=mdGun(iso);
  /* Yıl gösterilince ek yıla bağlanır ("2027'de"); sayı okunuşu eki
     belirsiz kıldığından o durumda "tarihinde" yazılır. */
  if(d.getFullYear()!==new Date().getFullYear()) return `${d.getDate()} ${AY_UZUN[d.getMonth()]} ${d.getFullYear()} tarihinde`;
  return `${d.getDate()} ${AY_UZUN[d.getMonth()]}${AY_DE[d.getMonth()]}`; }
function mdAralik(b,e){
  if(!b) return '';
  if(!e) return `${mdKisa(b)} – bitiş bilinmiyor`;
  const yb=mdGun(b).getFullYear(), ye=mdGun(e).getFullYear(), buY=new Date().getFullYear();
  const yilGoster=yb!==ye||yb!==buY;
  return `${mdKisa(b,yilGoster)} – ${mdKisa(e,yilGoster)}`;
}
/* Dışa aktarım / Excel için sayısal biçim */
function mdAralikNokta(b,e){ return b?`${mdNokta(b)} – ${e?mdNokta(e):'?'}`:''; }

/* ---------- Durum anlambilimi ---------- */
const MD_TAAHHUT={reserved:'Opsiyon',confirmed:'Kesin',cancelled:'İptal'};
const MD_KOD_ETIKET={bos:'Boş',dolu:'Dolu',rezerve:'Opsiyon',yakinda:'Yakında boşalıyor',
  opsuresi:'Opsiyon süresi geçmiş',eski:'Eski kayıt',pasif:'Pasif',iptal:'İptal'};

/* ==========================================================
   PAYLAŞILAN KAPSAM / SORGU KATMANI (B50)
   ========================================================== */
/* Ham parçalardan tek model. UI ve dışa aktarım/rapor AYNI yapıyı kurar. */
function mdModel(o){
  const M={mecs:o.mecs||[], alts:o.alts||[], units:o.units||[], prods:o.prods||[],
           recs:(o.recs||[]).slice(), cmap:o.cmap||{}, jobs:o.jobs||[]};
  M.mecById={}; M.mecs.forEach(m=>M.mecById[m.id]=m);
  M.altById={}; M.alts.forEach(a=>M.altById[a.id]=a);
  M.unitById={}; M.units.forEach(u=>M.unitById[u.id]=u);
  M.pm={}; M.prods.forEach(p=>M.pm[p.id]=p.name);
  M.jmap={}; M.jobs.forEach(j=>M.jmap[j.id]=j);
  M.byUnit={}; M.byArea={};
  M.recs.forEach(r=>{
    if(r.occupancy_mode==='concurrent') (M.byArea[r.alt_mecra_id]=M.byArea[r.alt_mecra_id]||[]).push(r);
    else if(r.unit_id!=null) (M.byUnit[r.unit_id]=M.byUnit[r.unit_id]||[]).push(r);
  });
  const sira=(a,b)=>String(a.block_start).localeCompare(String(b.block_start))
    ||((a.placement_id||0)-(b.placement_id||0))||((a.booking_id||0)-(b.booking_id||0));
  Object.values(M.byUnit).forEach(l=>l.sort(sira));
  Object.values(M.byArea).forEach(l=>l.sort(sira));
  /* Alanlar: sıralı; eşzamanlı olup olmadığı YAPISAL alandan okunur. */
  M.altByMec={}; [...M.alts].sort((a,b)=>(a.sort||0)-(b.sort||0)||a.id-b.id)
    .forEach(a=>(M.altByMec[a.mecra_id]=M.altByMec[a.mecra_id]||[]).push(a));
  const dogal=(a,b)=>String(a.name||'').localeCompare(String(b.name||''),'tr',{numeric:true});
  M.unitsByAlt={}; M.orphanByMec={};
  [...M.units].sort(dogal).forEach(u=>{
    if(u.alt_mecra_id!=null&&M.altById[u.alt_mecra_id]) (M.unitsByAlt[u.alt_mecra_id]=M.unitsByAlt[u.alt_mecra_id]||[]).push(u);
    else (M.orphanByMec[u.mecra_id]=M.orphanByMec[u.mecra_id]||[]).push(u);
  });
  return M;
}
function mdEszamanli(a){ return !!a&&a.occupancy_mode==='concurrent'; }
/* Eski modelleme alanı (S8.1 §8). Kayıt ve geçmiş için MODELDE kalır —
   kurum geçmişi, kayıt detayı ve dışa aktarım onu okumaya devam eder —
   ama operasyonel çalışma yüzeyinde (Bugün / Yıl / seçim) listelenmez. */
function mdArsiv(a){ return !!a&&a.legacy_archived===true; }
/* Dar hücre etiketi: kurumun ilk anlamlı kelime(ler)i ("ACIBADEM",
   "ADN LEZZET"). Yalnız GÖRÜNTÜLEME; tam unvan title/detayda kalır.
   Kurum bilinmiyorsa BOŞ döner: eski aylık kayıtların çoğunda kurum yok
   ve her hücreye "kurum yok" yazmak matrisi okunmaz hale getiriyordu
   (S8.1 §15). Hücrenin kesik çerçevesi ve title'ı zaten bunu söyler. */
function mdOrgEtiket(ad){ const w=orgKisa(ad||'',40).split(/\s+/).filter(Boolean);
  if(!w.length) return ''; let k=w[0]; if(k.length<5&&w[1]) k+=' '+w[1];
  return k.length>13?k.slice(0,12)+'…':k; }

/* ==========================================================
   ZAMAN EKSENİ (PS9 §5)
   Ay hücresi ızgarası yerine SÜREKLİ tarih ekseni. Bir kayıt gerçek
   başlangıç/bitiş gününde başlar ve biter; ay sınırında PARÇALANMAZ.
   Aynı eksen statik yüzler ve LED kampanyaları için kullanılır — iki
   ayrı zaman modeli yoktur.
   ========================================================== */
function mdAyEkle(ym,n){ const [y,m]=ym.split('-').map(Number);
  const d=new Date(y,m-1+n,1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }
function mdAyFarki(a,b){ const [ya,ma]=a.split('-').map(Number), [yb,mb]=b.split('-').map(Number);
  return (yb-ya)*12+(mb-ma); }

/* Varsayılan çapa: 12 ayda yılın başı (Halil'in yıl görünümü), dar
   ölçeklerde bugünün ayı — kullanıcı "şimdi"yi görmek ister. */
function mdVarsayilanAnk(st){
  const bu=mdYm(mdBugun());
  if(+st.olcek===12) return `${st.yil||mdGun(mdBugun()).getFullYear()}-01`;
  return bu;
}
function mdEksen(st){
  const n=+st.olcek||12;
  let ank=st.ank||mdVarsayilanAnk({...st,olcek:n});
  let aylar=Array.from({length:n},(_,i)=>mdAyEkle(ank,i));
  /* Geçmiş ayları gizle: pencereyi kısaltır, kaydırmaz. Bugünden
     önceki aylar düşer; hepsi geçmişse gizleme UYGULANMAZ (kullanıcı
     bilinçli olarak geçmişe bakıyordur ve ekranı boşaltmak yanıltır). */
  const buYm=mdYm(mdBugun());
  if(st.gecmisGizle){ const k=aylar.filter(ym=>ym>=buYm); if(k.length) aylar=k; }
  const bas=`${aylar[0]}-01`, bit=mdAySonu(`${aylar[aylar.length-1]}-01`);
  const gun=iso=>Math.round((mdGun(iso)-mdGun(bas))/864e5);
  const toplam=gun(bit)+1;
  return {aylar,bas,bit,toplam,ank,n,
    /* Ay sütunları gün sayısıyla orantılıdır: Şubat Ocak'tan dardır,
       yoksa çubuklar ay içinde kayardı. */
    kol:aylar.map(ym=>mdGun(mdAySonu(ym+'-01')).getDate()+'fr').join(' '),
    yuzde:iso=>Math.max(0,Math.min(100,gun(iso)/toplam*100)),
    gunNo:gun};
}

/* Bir kaydın eksen üzerindeki konumu + eksen dışına taşma işaretleri. */
function mdSerit(r,ek){
  const bs=r.block_start<ek.bas?ek.bas:r.block_start;
  const beHam=r.block_end==null?ek.bit:r.block_end;
  const be=beHam>ek.bit?ek.bit:beHam;
  if(bs>ek.bit||be<ek.bas) return null;
  const sol=ek.gunNo(bs)/ek.toplam*100;
  const gen=Math.max(0.5,(ek.gunNo(be)-ek.gunNo(bs)+1)/ek.toplam*100);
  return {sol,gen,
    solTasar:r.block_start<ek.bas,
    sagTasar:r.block_end==null||r.block_end>ek.bit,
    acikUc:r.block_end==null};
}

/* ---------- Yüz kimliği: kod yalnız KENDİ alanında benzersizdir ----------
   M1'de Megalight P1–P12 ve Raket P1–P29 aynı `Pxx-A/B` kodlamasını
   kullanır; `P3-A` üç ayrı alanda birden vardır (Megalight, Raket, LED).
   Alan başlığının altında kod tek başına doğrudur, fakat alan bağlamının
   DIŞINDA gösterilen her kod aile adıyla nitelenir (S8.1 §7). */
function mdAile(M,a){ return (a&&(M.pm[a.product_id]||a.name))||''; }
function mdYuzAdi(M,u){ if(!u) return '';
  const aile=mdAile(M,M.altById[u.alt_mecra_id]); return aile?`${aile} ${u.name}`:String(u.name||''); }

/* Kaydın bugünkü zamansal durumu — SAKLANMAZ, tarihten türetilir. */
function mdKapsarMi(r,gun){ return r.block_start<=gun&&(r.block_end==null||r.block_end>=gun); }
function mdZamansal(r,gun){
  if(r.block_start>gun) return 'yaklasan';
  if(r.block_end!=null&&r.block_end<gun) return 'bitti';
  return 'guncel';
}

/* Kapsam filtresi: alan, alan tipi, kurum, iş, tarih aralığı, taahhüt,
   davranış. Raporlar V2 aynı çağrıyı kullanacak. Metin eşleştirme YOK. */
function mdKapsam(M,s){
  s=s||{};
  return M.recs.filter(r=>{
    if(!s.iptalDahil&&r.commitment==='cancelled') return false;
    if(s.mecra&&String(r.mecra_id)!==String(s.mecra)) return false;
    if(s.alan&&String(r.alt_mecra_id)!==String(s.alan)) return false;
    if(s.urun){ const a=M.altById[r.alt_mecra_id]; const u=M.unitById[r.unit_id];
      const pid=(u&&u.product_id!=null)?u.product_id:(a&&a.product_id);
      if(String(pid)!==String(s.urun)) return false; }
    if(s.kurum&&String(r.customer_id)!==String(s.kurum)) return false;
    if(s.is&&String(r.work_id)!==String(s.is)) return false;
    if(s.davranis&&r.occupancy_mode!==s.davranis) return false;
    if(s.from&&r.block_end!=null&&r.block_end<s.from) return false;
    if(s.to&&r.block_start>s.to) return false;
    return true;
  });
}

/* Kaydın insan okunur dönemi — kesinlik dürüstçe söylenir. */
function mdDonem(r){
  if(r.record_kind==='legacy'){
    if(r.date_precision==='month') return `${mdYmAdi(r.ym)} · ay bazlı`;
    if(r.date_precision==='open_end') return `${mdKisa(r.start_date)} – ?`;
    return mdAralik(r.start_date,r.end_date);
  }
  return mdAralik(r.start_date,r.end_date);
}
function mdKesinlikNotu(r){
  if(r.record_kind!=='legacy') return r.end_date?'':'Bitiş bilinmiyor';
  if(r.date_precision==='month') return 'Ay bazlı eski kayıt · kesin gün bilgisi yok';
  if(r.date_precision==='open_end') return `Eski kayıt (${mdYmAdi(r.ym)}) · bitiş bilinmiyor`;
  return `Eski kayıt (${mdYmAdi(r.ym)})`;
}

/* ---------- STATİK: bu yüz şu an kimde, ne zaman boşalıyor? (B29-B31) ----
   Kesin yerleşimler + hâlâ geçerli eski kayıtlar birlikte değerlendirilir.
   Ardışık kayıtlar (farklı kurumlar olsa bile) zincirlenir: soru "yüzey
   ne zaman BOŞ" sorusudur. Son halka ay bazlıysa ya da bitişi bilinmiyorsa
   kesin gün İDDİA EDİLMEZ. "Yakında boşalıyor" türetilir, saklanmaz. */
function mdYuzeyDurum(M,u,gun){
  if(u.active===false) return {kod:'pasif',etiket:'Pasif',alt:'Satışa kapalı'};
  const liste=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled');
  const cur=liste.find(r=>mdKapsarMi(r,gun));
  if(!cur){
    const nx=liste.find(r=>r.block_start>gun);
    return {kod:'bos',etiket:'Boş',sonraki:nx||null,
      alt:nx?(nx.date_precision==='month'&&nx.record_kind==='legacy'
              ?`${mdYmAdi(nx.ym)} ay bazlı dolu`:`${mdGunDe(nx.block_start)} doluyor`):''};
  }
  let son=cur, bit=cur.block_end;
  for(let i=0;i<60&&bit;i++){
    const ek=liste.find(r=>r!==son&&r.block_start<=mdEkle(bit,1)&&(r.block_end==null||r.block_end>bit));
    if(!ek) break; son=ek; bit=ek.block_end;
  }
  const kod=cur.commitment==='reserved'?'rezerve':'dolu';
  let alt='', kesin=false;
  if(bit==null) alt='Bitiş bilinmiyor';
  else if(son.record_kind==='legacy'&&son.date_precision==='month')
    alt=`${AY_UZUN[mdGun(bit).getMonth()]} sonuna kadar dolu · kesin gün yok`;
  else if(son.record_kind==='legacy'&&son.date_precision==='open_end')
    alt=`${mdYmAdi(son.ym)} kaydı · bitiş bilinmiyor`;
  else { alt=`${mdGunDe(mdEkle(bit,1))} boş`; kesin=true; }
  const sinir=[mdAySonu(gun),mdEkle(gun,14)].sort()[1];
  const yakinda=kesin&&bit<=sinir;
  /* Opsiyonun son geçerlilik tarihi REKLAM DÖNEMİ değildir. Süresi
     geçmiş opsiyon yüzü bloklamaya DEVAM eder (§8: bloklama davranışı
     sessizce değişmez); yalnız karar bekleyen kayıt olarak işaretlenir. */
  const opsSure=cur.commitment==='reserved'&&!!cur.option_expires_at&&cur.option_expires_at<gun;
  return {kod:yakinda?'yakinda':kod, taahhut:kod,
          etiket:yakinda?'Yakında boşalıyor':(kod==='rezerve'?(opsSure?'Opsiyon · süresi doldu':'Opsiyon'):'Dolu'),
          kayit:cur, kesin, opsSure, eski:cur.record_kind==='legacy',
          alt:opsSure?`Opsiyon geçerliliği ${mdNokta(cur.option_expires_at)} tarihinde doldu · ${alt}`:alt};
}

/* ---------- LED: bu yayın alanında hangi kampanyalar, ne zaman? (B38) ---
   Kapasite, slot, frekans YOK. "Dolu" denmez. */
function mdYayinlar(M,altId,gun){
  const l=(M.byArea[altId]||[]).filter(r=>r.commitment!=='cancelled');
  return {aktif:l.filter(r=>mdKapsarMi(r,gun)),
          yaklasan:l.filter(r=>r.block_start>gun),
          gecmis:l.filter(r=>r.block_end!=null&&r.block_end<gun)};
}
function mdSure(a){ return a&&a.creative_seconds?`${a.creative_seconds} sn`:''; }

/* ==========================================================
   DURUM (sessionStorage — S4.1 konvansiyonu, ikinci depo YOK)
   ========================================================== */
/* `olcek` = görünen ay sayısı (12 / 6 / 3), `ank` = ilk görünen ay.
   `gecmisGizle` yalnız 12 aylık ölçekte anlamlıdır: dar ölçeklerde
   kullanıcı zaten pencereyi kendisi taşıyor. */
/* TEK çalışma yüzeyi TAKVİM'dir (PS9 kapanış §2). Eski `Bugün` tablosu
   KALDIRILDI: aynı kurum/iş/dönem/ne-zaman-boş sütunlarını yüzlerce
   satırda tekrarlayan ikinci bir ana ekrandı. İşlevleri takvimde
   karşılanıyor — bugün çizgisi, `Bugüne git` ve durum süzgeci
   (bugün boş / opsiyonlu / yakında boşalıyor / opsiyon süresi geçmiş).

   `gor` anahtarı DURUM NESNESİNDE YOK. Eski derin bağlantılar
   `gor:'bugun'` göndermeye devam edebilir; `mdDurum()` onu sessizce
   yutar ve kullanıcıyı eski tabloya GÖTÜRMEZ. */
/* `tur` = kayıt türü süzgeci ('' | confirmed | reserved). GÖRÜNEN
   takvim aralığıyla kesişen kayıtlar üzerinden çalışır; arka planda
   "bugün" sorusu sormaz.
   `msBas`/`msBit` = MÜSAİTLİK ARAMASI — ayrı ve açık bir soru. Kullanıcı
   dönem seçmeden hiçbir şey gizlice müsaitlik sorgusu sayılmaz.
   Eski yedi değerli `durum` seçicisi KALDIRILDI (§3). */
const MD_DEF={site:null,alan:'',kurum:'',is:'',q:'',yil:null,
              olcek:12,ank:null,gecmisGizle:false,urun:'',tur:'',msBas:'',msBit:''};
function mdDurum(){ let d={}; try{ d=JSON.parse(sessionStorage.getItem('mp_medya')||'{}')||{}; }catch(e){}
  /* `acik` her çağrıda YENİ nesne: paylaşılan bir varsayılanı mutasyona
     açmak oturum boyunca sızan durum yaratırdı. */
  const o={...MD_DEF,...d,acik:(d.acik&&typeof d.acik==='object'&&!Array.isArray(d.acik))?{...d.acik}:{}};
  /* Önceki sürümün yarım girişten yazdığı ("0002-09-21") ya da ters sıralı
     arama durumu UYGULANMIŞ arama sayılmaz; sessizce düşürülür. */
  if(o.msBas||o.msBit){
    if(mdTarihDogrula(o.msBas).hata||mdTarihDogrula(o.msBit).hata||o.msBas>o.msBit){ o.msBas=''; o.msBit=''; }
  }
  /* Uyumluluk: eski oturum durumunda ya da eski bir derin bağlantıda
     kalmış `gor` anahtarı düşürülür. Yönlendirme sessizdir; kullanıcı
     kaldırılmış tabloya GÖTÜRÜLMEZ. */
  delete o.gor;
  return o; }
function mdDurumYaz(d){ const o={...d}; delete o.gor;
  try{ sessionStorage.setItem('mp_medya',JSON.stringify(o)); }catch(e){} }

/* Hedef tarihi görünür pencereye al (derin bağlantı, PS9 kapanış §2).
   Kayıt zaten pencerede ise çapa DEĞİŞMEZ — kullanıcının seçtiği
   dönemi gereksiz yere oynatmayız. */
function mdPencereyeAl(st,iso){
  if(!iso) return st;
  const ek=mdEksen(st);
  if(iso>=ek.bas&&iso<=ek.bit) return st;
  const n=+st.olcek||12;
  st.ank=n===12?`${iso.slice(0,4)}-01`:mdAyEkle(mdYm(iso),-1);
  st.yil=+iso.slice(0,4);
  /* Geçmişi gizleme açıkken geçmiş bir kayda gidilirse hedef yine
     görünmez kalırdı; bağlantı hedefi süzgeci yener. */
  if(st.gecmisGizle&&iso<mdBugun()) st.gecmisGizle=false;
  return st;
}
function mdFiltreli(st){ return !!(st.kurum||st.is); }

/* ---------- Grup aç / kapa (S8.1 §11) ----------
   Ağır grup KAPALIYKEN gövdesi hiç ÜRETİLMEZ; CSS ile gizlenmez.
   M1'de bu, açılışta 82 satır + 984 matris hücresi yerine üç başlık
   demektir. Durum oturum boyunca hatırlanır. */
function mdGrupKey(a){ return 'g'+a.id; }
/* Etkin durum = KULLANICININ açık kararı varsa o, yoksa varsayılan.
   İki ayrı kaynak gerekiyor: yalnız "açık olanlar" listesi tutulsaydı,
   varsayılan olarak açılmış bir grubu kapatmak onu listeye EKLER ve
   durumu tersine çevirirdi. */
function mdAcikMi(st,a,vars){ const k=mdGrupKey(a), m=st.acik||{};
  return Object.prototype.hasOwnProperty.call(m,k)?!!m[k]:!!vars; }
function mdGrupAc(key,su){ const st=mdDurum();
  st.acik={...(st.acik||{}),[key]:!su}; mdDurumYaz(st); mdCiz(); }

/* Bu çizimde GERÇEKTEN render edilen yüz kimlikleri. Seçim çubuğu
   yalnız buradan beslenir; görünmeyen hiçbir yüz "seçili" sayılmaz. */
let _mdGoruntu=new Set();
/* Yıl ızgarası göstergesi: bu çizimde gerçekten kullanılan öğeler. */
let _mdLeg={ab:false,kes:false,ops:false,gecmis:false,suresiz:false,musait:false};

/* Mecralar'a git: yüzeye göre doğru rota (dashGo ile aynı kural). */
function medyaGit(ek){
  mdDurumYaz({...mdDurum(),...(ek||{})});
  if(isAdmin()&&surfaceGet()!=='workspace'){ go('listeler'); return; }
  ui._mecSub='doluluk'; go('ws-mecralar');
}

/* ==========================================================
   VERİ (tek turda, paralel; yüz / alan başına istek YOK — B69)
   ========================================================== */
async function mdYukle(){
  const [mecs,alts,prods,custs,jobs,recs]=await Promise.all([
    api('mecra_list'), api('media_areas'), api('products_list'),
    api('customers_min'), api('media_jobs'), api('media_scope&iptal=1')]);
  const units=[]; mecs.forEach(m=>(m.units||[]).forEach(u=>units.push(u)));
  const cmap={}; custs.forEach(c=>cmap[c.id]=c.firma||('#'+c.id));
  const M=mdModel({mecs,alts,units,prods,recs,cmap,jobs});
  M.okunma=new Date();
  ui._M=M;
  return M;
}

/* ==========================================================
   EKRAN: Mecralar › Doluluk  (Bugün | Yıl)
   ========================================================== */
async function listeler(c,o){
  /* `onbellek`: yalnız kapsam/görünüm değişti — veri yeniden okunmaz. */
  const M=(o&&o.onbellek&&ui._M)?ui._M:await mdYukle();
  const st=mdDurum();
  /* Kapsam: alan (site) seçimi bilinçlidir. Kurum/İş filtresi alanlar
     arası bir sorudur ("bu kurum hangi mecralarda?"), o yüzden alan
     seçimi o durumda "Tümü" olabilir. */
  const siteler=M.mecs.filter(mdKapsamda)
    .filter(m=>(M.altByMec[m.id]||[]).some(a=>!mdArsiv(a)&&((M.unitsByAlt[a.id]||[]).length||mdEszamanli(a)))
                                 ||(M.orphanByMec[m.id]||[]).length);
  /* Site-first (S8.1 §9): mecra seçilmeden dev bir global envanter
     DÖKÜLMEZ. Seçim oturum boyunca hatırlanır; hatırlanan mecra artık
     geçerli değilse seçiciye dönülür — ilk mecra sessizce seçilmez. */
  if(st.site!=null&&!siteler.some(m=>String(m.id)===String(st.site))) st.site=null;
  const secili=st.site!=null||mdFiltreli(st);
  if(!st.yil) st.yil=new Date().getFullYear();
  mdDurumYaz(st);
  ui._mSec=ui._mSec||new Set();

  /* Filtre seçenekleri YALNIZ medya kaydı olan kurum / işlerden gelir:
     soru "hangi mecraları kullanıyor", 531 kurumluk bir liste değil. */
  const kSay={}, iSay={};
  M.recs.filter(r=>r.commitment!=='cancelled'&&r.customer_id!=null).forEach(r=>{
    kSay[r.customer_id]=(kSay[r.customer_id]||0)+1; if(r.work_id) iSay[r.work_id]=(iSay[r.work_id]||0)+1; });
  const kurumOpt=Object.keys(kSay).map(id=>({id,ad:M.cmap[id]||('#'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  const isOpt=Object.keys(iSay).map(id=>({id,ad:(M.jmap[id]||{}).title||('İş #'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));

  /* Mecra türü (§6). Sayım birimi türün DAVRANIŞINA göre değişir:
     statik türde YÜZ, eşzamanlı türde YAYIN ALANI — LED'in "yüz"ü
     satılabilir bir yüzey değildir, o yüzden ikisi aynı sayaçta
     toplanmaz (S8.2 kalıbı). Kapsam dışı mecra ve eski modelleme
     alanları sayılmaz. */
  const uSay={};
  M.mecs.filter(mdKapsamda).forEach(m=>(M.altByMec[m.id]||[]).filter(a=>!mdArsiv(a)).forEach(a=>{
    const pid=a.product_id; if(pid==null) return;
    const e=uSay[pid]=uSay[pid]||{n:0,esz:mdEszamanli(a)};
    e.n+=mdEszamanli(a)?1:(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false).length;
  }));
  const urunOpt=Object.keys(uSay).filter(id=>uSay[id].n>0)
    .map(id=>({id,ad:M.pm[id]||('#'+id),n:`${uSay[id].n} ${uSay[id].esz?'yayın alanı':'yüz'}`}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));

  c.innerHTML=`<div class="sec-head md-head"><div><h3>Doluluk</h3>
      <p class="sub">Statik yüzeyler kesin dönemle, LED yayınları eşzamanlı kampanya olarak yönetilir.</p></div>
    <div class="md-head-r">
      ${secili?mdEksenKontrol(st):''}
      <button class="btn btn-ghost btn-sm" onclick="mdDisaAktar()">${ic('download',15)} Excel'e Aktar</button>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="bookImport()" title="Eski tablolardan ay bazlı kayıt aktarımı — kesin dönemli yerleşim oluşturmaz">${ic('upload',15)} Eski ay kaydı al</button>`:''}
    </div></div>
    <div class="md-site" role="group" aria-label="Mecra">
      ${secili?`<button type="button" class="md-sp md-sp-all ${st.site==null?'on':''}" aria-pressed="${st.site==null}"
          onclick="mdSet({site:null})">‹ Tüm mecralar</button>`:''}
      ${siteler.map(m=>`<button type="button" class="md-sp ${String(st.site)===String(m.id)?'on':''}" aria-pressed="${String(st.site)===String(m.id)}"
          onclick="mdSet({site:${m.id},alan:''})">${esc(m.name)}</button>`).join('')}
    </div>
    ${secili?`<div class="sec-card fbar md-fbar">
      <div class="fbar-row">
        <input class="inp" id="mdQ" placeholder="Ara: pozisyon, kurum veya iş…" value="${esc(st.q)}" oninput="mdAra(this.value)" aria-label="Ara">
        <select class="inp" id="mdKurum" onchange="mdSet({kurum:this.value,site:this.value?null:mdDurum().site})" aria-label="Kurum">
          <option value="">Tüm kurumlar</option>
          ${kurumOpt.map(k=>`<option value="${k.id}" ${String(st.kurum)===String(k.id)?'selected':''}>${esc(orgKisa(k.ad,40))}</option>`).join('')}</select>
        <select class="inp" id="mdIs" onchange="mdSet({is:this.value,site:this.value?null:mdDurum().site})" aria-label="İş">
          <option value="">Tüm işler</option>
          ${isOpt.map(k=>`<option value="${k.id}" ${String(st.is)===String(k.id)?'selected':''}>${esc(k.ad)}</option>`).join('')}</select>
        <select class="inp" id="mdUrun" onchange="mdSet({urun:this.value})" aria-label="Mecra türü">
          <option value="">Tüm mecra türleri</option>
          ${urunOpt.map(p=>`<option value="${p.id}" ${String(st.urun)===String(p.id)?'selected':''}>${esc(p.ad)} (${p.n})</option>`).join('')}</select>
        <select class="inp" id="mdTur" onchange="mdSet({tur:this.value})" aria-label="Kayıt türü">
          <option value="">Tüm kayıtlar</option>
          <option value="confirmed" ${st.tur==='confirmed'?'selected':''}>Rezervasyon</option>
          <option value="reserved" ${st.tur==='reserved'?'selected':''}>Opsiyon</option></select>
      </div>
      <form class="md-ms" role="search" aria-label="Müsaitlik ara" novalidate
          onsubmit="event.preventDefault();mdMsAra()">
        <span class="md-ms-l">Müsaitlik</span>
        <label class="md-ms-f"><span>Başlangıç</span>
          <input class="inp inp-sm" type="date" id="mdMsBas" value="${esc(st.msBas)}"
            min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" oninput="mdMsHataGizle()"></label>
        <label class="md-ms-f"><span>Bitiş</span>
          <input class="inp inp-sm" type="date" id="mdMsBit" value="${esc(st.msBit)}"
            min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" oninput="mdMsHataGizle()"></label>
        <button type="submit" class="btn btn-primary btn-sm md-ms-go">Müsaitlik ara</button>
        ${(st.msBas&&st.msBit)?`<button type="button" class="btn btn-ghost btn-sm" onclick="mdMsTemizle()">Temizle</button>`:''}
        <p class="md-ms-hata" id="mdMsHata" role="alert" hidden></p>
      </form>
    </div>`:''}
    <div id="mdAfilt"></div>
    <div id="mdOdak"></div>
    <div id="mdGovde"></div>
    <div id="mdSecim" class="md-secim" hidden></div>`;
  mdCiz();
}

/* ---------- Takvim kontrolleri (§6) ----------
   Ölçek, pencere gezinme, "Bugüne git" ve geçmiş ayları gizleme. Hepsi
   AYNI eksen durumunu değiştirir; ikinci bir takvim motoru yoktur. */
function mdEksenKontrol(st){
  const ek=mdEksen(st);
  const bugunIcinde=mdBugun()>=ek.bas&&mdBugun()<=ek.bit;
  return `<div class="mtl-kt">
    <div class="ws-switch inline" role="group" aria-label="Zaman ölçeği">
      ${[[12,'Yıl'],[6,'6 ay'],[3,'3 ay']].map(([v,l])=>`<button type="button" class="${+st.olcek===v?'on':''}"
        aria-pressed="${+st.olcek===v}" onclick="mdOlcek(${v})">${l}</button>`).join('')}</div>
    <div class="year-nav" style="margin:0">
      <button onclick="mdKaydir(-1)" aria-label="Önceki dönem">‹</button>
      <span class="yr">${esc(mdEksenAdi(ek))}</span>
      <button onclick="mdKaydir(1)" aria-label="Sonraki dönem">›</button></div>
    <button type="button" class="btn btn-ghost btn-sm ${bugunIcinde?'':'act act-work'}" onclick="mdBuguneGit()">Bugüne git</button>
    <label class="mtl-gk"><input type="checkbox" ${st.gecmisGizle?'checked':''}
      onchange="mdSet({gecmisGizle:this.checked})"> Geçmiş ayları gizle</label>
  </div>`;
}
/* Ölçek değişince çapa YENİDEN hesaplanır: 3 aylık pencereden yıla
   geçerken kullanıcı o yılı görmek ister, rastgele bir 12 aylık dilimi
   değil. Görünen dönem bugünü içeriyorsa bugüne sabitlenir. */
function mdOlcek(v){
  const st=mdDurum(); const eskiEk=mdEksen(st);
  const bu=mdYm(mdBugun());
  const merkez=(mdBugun()>=eskiEk.bas&&mdBugun()<=eskiEk.bit)?bu:eskiEk.aylar[0];
  st.olcek=v;
  st.ank=v===12?`${merkez.slice(0,4)}-01`:merkez;
  st.yil=+merkez.slice(0,4);
  mdDurumYaz(st); mdYenidenCiz();
}
function mdKaydir(d){
  const st=mdDurum(); const n=+st.olcek||12;
  st.ank=mdAyEkle(st.ank||mdVarsayilanAnk(st),d*n);
  st.yil=+st.ank.slice(0,4);
  mdDurumYaz(st); mdYenidenCiz();
}
/* "Bugüne git" (S10 §2) — öngörülebilir:
     · bugün görünen pencerede DEĞİLSE: ölçek korunur; 12 ayda bugünün
       yılı, 3/6 ayda bugünü içeren pencere (bir önceki aydan başlar ki
       bugünün öncesi de bağlam olarak görünsün),
     · bugün zaten görünüyorsa pencere DEĞİŞMEZ (ekran sıçramaz),
     · her iki durumda yatay kaydırılmış takvim bugünün çizgisini görünür
       alana alır ve çizgi kısa, sakin bir vurgu alır.
   Mecra, açık gruplar, kurum/iş süzgeçleri ve müsaitlik araması
   DOKUNULMADAN kalır; arama farklı bir dönemdeyse özet bunu açıkça
   söyler (mdYilCiz). */
function mdBuguneGit(){
  const st=mdDurum(); const bugun=mdBugun(); const ek=mdEksen(st);
  if(bugun>=ek.bas&&bugun<=ek.bit){ mdBugunGoster(); return; }
  const n=+st.olcek||12, bu=mdYm(bugun);
  st.ank=n===12?`${bu.slice(0,4)}-01`:mdAyEkle(bu,-1);
  st.yil=+bu.slice(0,4);
  mdDurumYaz(st);
  Promise.resolve(mdYenidenCiz()).then(()=>mdBugunGoster());
}
function mdBugunGoster(){
  const ciz=[...document.querySelectorAll('#mdGovde .mtl-wrap')];
  let ilk=null;
  ciz.forEach(w=>{
    const cizgi=w.querySelector('.mtl-bugun'); if(!cizgi) return;
    const wb=w.getBoundingClientRect(), cb=cizgi.getBoundingClientRect();
    const x=cb.left-wb.left+w.scrollLeft;
    const lbl=(w.querySelector('.mtl-head .mtl-lbl')||{}).offsetWidth||0;
    const gorunur=x>=w.scrollLeft+lbl+8&&x<=w.scrollLeft+w.clientWidth-8;
    if(!gorunur) w.scrollTo({left:Math.max(0,x-lbl-(w.clientWidth-lbl)/2),behavior:mdHareketAz()?'auto':'smooth'});
    if(!ilk) ilk=cizgi;
  });
  if(ilk){
    const r=ilk.getBoundingClientRect();
    if(r.bottom<0||r.top>window.innerHeight) ilk.scrollIntoView({block:'center',behavior:mdHareketAz()?'auto':'smooth'});
  }
  const hepsi=document.querySelectorAll('#mdGovde .mtl-bugun, #mdGovde .mtl-bugun-l');
  hepsi.forEach(el=>{ el.classList.remove('vurgu'); void el.offsetWidth; el.classList.add('vurgu'); });
  setTimeout(()=>hepsi.forEach(el=>el.classList.remove('vurgu')),1600);
}
function mdHareketAz(){ try{ return matchMedia('(prefers-reduced-motion: reduce)').matches; }catch(e){ return false; } }
function mdYil(d){ const st=mdDurum(); st.yil=(st.yil||new Date().getFullYear())+d;
  st.ank=`${st.yil}-01`; mdDurumYaz(st); mdYenidenCiz(); }
function mdSet(ek){ mdDurumYaz({...mdDurum(),...ek}); mdYenidenCiz(); }
let _mdAraT=null;
function mdAra(v){ clearTimeout(_mdAraT); _mdAraT=setTimeout(()=>{ mdDurumYaz({...mdDurum(),q:v}); mdCiz(); },160); }
/* Kapsam (alan/kurum/iş/görünüm) değişince üst şerit de değişir; veri
   yeniden OKUNMAZ, yalnız aynı modelle yeniden çizilir. Arama kutusu bu
   yoldan geçmez (mdCiz yalnız gövdeyi çizer), odak kaybolmaz. */
function mdYenidenCiz(){
  const box=document.getElementById('mdGovde'); if(!box) return;
  return listeler(box.parentElement,{onbellek:true});
}
function mdTemizle(){ mdDurumYaz({...mdDurum(),kurum:'',is:'',q:'',alan:'',urun:'',tur:'',msBas:'',msBit:''}); mdYenidenCiz(); }

/* Aktif filtre şeridi (S2 `.afilt` konvansiyonu) */
function mdAfiltCiz(M,st){
  const box=document.getElementById('mdAfilt'); if(!box) return;
  const p=[];
  if(st.kurum) p.push(['Kurum',orgKisa(M.cmap[st.kurum]||('#'+st.kurum),40),'kurum']);
  if(st.is) p.push(['İş',(M.jmap[st.is]||{}).title||('#'+st.is),'is']);
  if(st.alan) p.push(['Alan',(M.altById[st.alan]||{}).name||'','alan']);
  if(st.urun) p.push(['Mecra türü',M.pm[st.urun]||('#'+st.urun),'urun']);
  if(st.tur) p.push(['Kayıt türü',st.tur==='reserved'?'Opsiyon':'Rezervasyon','tur']);
  const ms=mdMsAralik(st);
  if(ms) p.push(['Müsaitlik',mdMsAd(ms),'ms']);
  if(st.q) p.push(['Arama',st.q,'q']);
  /* §3: büyük kırmızı alarm bandı DEĞİL — kompakt, tek tek
     kaldırılabilir etiketler. */
  box.innerHTML=p.length?`<div class="md-filtreler">
    ${p.map(([k,v,anahtar])=>`<span class="md-fchip">${esc(k)}: <b>${esc(v)}</b>
      <button type="button" aria-label="${esc(k)} filtresini kaldır" onclick="mdFiltreKaldir('${anahtar}')">✕</button></span>`).join('')}
    ${p.length>1?`<button type="button" class="btn-link" onclick="mdTemizle()">Tümünü temizle</button>`:''}</div>`:'';
}
function mdFiltreKaldir(k){
  const y={};
  if(k==='ms'){ y.msBas=''; y.msBit=''; } else y[k]='';
  mdSet(y);
}

function mdCiz(){
  const M=ui._M, st=mdDurum(), box=document.getElementById('mdGovde'); if(!M||!box) return;
  mdAfiltCiz(M,st);
  const gun=mdBugun();
  /* Her çizim görünür yüz kümesini SIFIRDAN kurar; seçim çubuğu buna
     göre uzlaştırılır (S8.1 §17). */
  mdTipGizle();                       // hücre yeniden çizilirken açık bilgi kartı kalmasın
  _mdGoruntu=new Set();
  /* Gösterge her çizimde sıfırlanır: bir önceki kapsamda görülen bir
     durumun açıklaması yeni kapsamda ASILI KALMAZ. */
  _mdLeg={ab:false,kes:false,ops:false,gecmis:false,suresiz:false,musait:false};
  _mdMsBant=mdMsAralik(st);
  /* Müsaitlik araması bir YÜZEY sorusudur: kurum/iş bağlam kesitine
     değil, seçili mecranın (ya da tüm mecraların) yüzey takvimine çizilir. */
  if(mdMsAralik(st)&&(st.site!=null||mdFiltreli(st))) box.innerHTML=mdYilCiz(M,st);
  else if(mdFiltreli(st)) box.innerHTML=mdBaglamCiz(M,st,gun);
  else if(st.site==null) box.innerHTML=mdSiteSec(M,st,gun);
  else box.innerHTML=mdYilCiz(M,st);
  /* Lejant ekran başına TEKTİR (§4). Gövde çizildikten sonra eklenir:
     hangi görsel anlamların gerçekten kullanıldığı ancak o zaman bilinir. */
  const lej=mdLegend();
  if(lej) box.insertAdjacentHTML('beforeend',`<div class="md-lejant">${lej}</div>`);
  mdSecimCiz();
  mdOdakUygula();
}

/* ---------- Kurum / İş sorusu: alanlar arası, gerçek ilişkiden (B27/B28) ---- */
function mdBaglamCiz(M,st,gun){
  /* Kurum / İş bağlamı da TAKVİMDE cevaplanır (PS9 kapanış §2). Eski
     sürümde bu ekranın ayrı bir tablo kesiti vardı ve aynı kayıtları
     ikinci bir sütun düzeninde tekrar ediyordu. */
  const kapsam=mdKapsam(M,{kurum:st.kurum,is:st.is,mecra:st.site,alan:st.alan})
    .filter(r=>!st.q||mdAraEslesir(M,r,st.q));
  const soru=st.is?'Bu iş hangi mecralarda?':'Bu kurum hangi mecraları kullanıyor?';
  const ozne=st.is?((M.jmap[st.is]||{}).title||''):orgKisa(M.cmap[st.kurum]||'',50);
  const guncel=kapsam.filter(r=>mdKapsarMi(r,gun)).length;
  const yaklasan=kapsam.filter(r=>r.block_start>gun).length;
  const gecmis=kapsam.filter(r=>r.block_end!=null&&r.block_end<gun).length;
  const ek=mdEksen(st);
  const govde=mdYilCiz(M,st,{kurum:st.kurum,is:st.is});
  return `<div class="md-soru-k"><p class="md-soru">${esc(soru)}</p>
      <p class="md-soru-s"><b>${esc(ozne)}</b> · ${guncel} güncel · ${yaklasan} yaklaşan · ${gecmis} geçmiş kayıt
        <span class="muted">· gösterilen dönem: ${esc(mdEksenAdi(ek))}</span></p></div>`+govde;
}
function mdKayitRozet(r,zm){
  if(r.commitment==='cancelled') return '<span class="md-st md-st-iptal">İptal</span>';
  if(r.record_kind==='legacy'&&r.date_precision==='month') return '<span class="md-st md-st-eski">Eski · ay bazlı</span>';
  if(zm==='yaklasan') return `<span class="md-st md-st-rezerve">${r.commitment==='reserved'?'Opsiyon · yaklaşan':'Yaklaşan'}</span>`;
  if(zm==='bitti') return '<span class="md-st md-st-eski">Bitti</span>';
  return r.commitment==='reserved'?'<span class="md-st md-st-rezerve">Opsiyon</span>':'<span class="md-st md-st-dolu">Dolu</span>';
}
/* LED ailesi "Dolu" demez; eski LED ay kaydı da güncel yayın kuralını
   (15 sn, "Yayında") ÖDÜNÇ ALMAZ — eski kanıt olarak kalır. */
function mdLedRozet(r,zm){
  if(r.occupancy_mode!=='concurrent'||r.record_kind==='legacy'||r.commitment==='cancelled') return mdKayitRozet(r,zm);
  if(zm==='guncel') return '<span class="md-st md-st-yayin">Yayında</span>';
  if(zm==='yaklasan') return `<span class="md-st md-st-rezerve">${r.commitment==='reserved'?'Opsiyon · yaklaşan':'Yaklaşan'}</span>`;
  return '<span class="md-st md-st-eski">Bitti</span>';
}
function mdAraEslesir(M,r,q){
  const t=String(q||'').toLocaleLowerCase('tr').trim(); if(!t) return true;
  return [r.unit_name,r.area_name,r.mecra_name,r.customer_name,r.work_title]
    .some(v=>String(v||'').toLocaleLowerCase('tr').includes(t));
}

/* ---------- MECRA SEÇİCİ: çalışma kapsamı önce gelir (S8.1 §9) --------
   Global envanter dökümü yerine mecra listesi + her mecranın bugünkü
   özeti. Özet, açmadan önce "burada iş var mı?" sorusunu cevaplar. */
function mdSiteSec(M,st,gun){
  const kart=m=>{
    /* Tür süzgeci karttan alana geçince KORUNUR (§6): kartın sayısı da
       süzgece göre hesaplanır, aksi halde kart "24 yüz" der, tıklayınca
       0 yüz görünürdü. */
    const alanlar=(M.altByMec[m.id]||[]).filter(a=>!mdArsiv(a)&&mdAlanGecer(M,a,{alan:'',urun:st.urun}));
    const yetim=M.orphanByMec[m.id]||[];
    let yuz=0,dolu=0,opsiyon=0,yakinda=0,led=0,ledA=0;
    const parca=[];
    alanlar.forEach(a=>{
      if(mdEszamanli(a)){ led++; ledA+=mdYayinlar(M,a.id,gun).aktif.filter(r=>r.record_kind!=='legacy').length;
        parca.push(`${esc(a.name)} <span class="muted">· eşzamanlı</span>`); return; }
      const us=M.unitsByAlt[a.id]||[]; if(!us.length) return;
      yuz+=us.length;
      us.forEach(u=>{ const d=mdYuzeyDurum(M,u,gun);
        if(d.kod==='dolu') dolu++; else if(d.kod==='rezerve') opsiyon++; else if(d.kod==='yakinda'){ yakinda++; if(d.taahhut==='rezerve') opsiyon++; else dolu++; } });
      parca.push(`${esc(mdAile(M,a))} <span class="muted">· ${us.length} yüz</span>`);
    });
    if(yetim.length){ yuz+=yetim.length; parca.push(`Diğer pozisyonlar <span class="muted">· ${yetim.length} yüz</span>`); }
    const bos=yuz-dolu-opsiyon;
    const ozet=[yuz?`${dolu} dolu`:'',opsiyon?`${opsiyon} opsiyon`:'',yuz?`${bos} boş`:'',
      yakinda?`<span class="md-yk">${yakinda} yakında boşalıyor</span>`:'',
      led?(ledA?`${ledA} aktif yayın`:'yayın yok'):''].filter(Boolean).join(' · ');
    return `<button type="button" class="md-sk" onclick="mdSet({site:${m.id},alan:''})">
      <span class="md-sk-t">${esc(m.name)}</span>
      <span class="md-sk-g">${parca.join(' &nbsp;·&nbsp; ')||'<span class="muted">alan tanımlı değil</span>'}</span>
      <span class="md-sk-o">${ozet||'<span class="muted">kayıt yok</span>'}</span></button>`;
  };
  const siteler=M.mecs.filter(mdKapsamda)
    .filter(m=>(M.altByMec[m.id]||[]).some(a=>!mdArsiv(a)&&((M.unitsByAlt[a.id]||[]).length||mdEszamanli(a)))
                                 ||(M.orphanByMec[m.id]||[]).length);
  if(!siteler.length) return '<div class="sec-card"><p class="empty">Operasyonel kapsamda mecra yok.</p></div>';
  /* Sayaçların KAPSAMI açıkça yazılır (§6): bu kartlar "bugün"ü
     anlatır, seçili takvim penceresini değil. */
  return `<p class="md-sk-h">Çalışmak istediğiniz mecrayı seçin.
      <span class="muted">Sayılar <b>${esc(mdGunDe(gun).replace(/'.*$/,''))}</b> itibarıyladır.</span></p>
    <div class="md-skl">${siteler.map(kart).join('')}</div>`;
}

/* ---------- Grup varsayılan açık mı? (S8.1 §11) ----------
   Kural sade tutulur: KULLANICI HENÜZ KARAR VERMEDİYSE kapalı başlar, çünkü
   özet satırı zaten "burada iş var mı?" sorusunu cevaplar ve M1 açılışta 82
   satır dökmez. Yalnız kullanıcının zaten o gruba baktığı belli olan
   durumlarda açılır.

   Hatırlama: kullanıcının açık kararı `st.acik[grupAnahtarı]`da oturum
   boyunca durur ve varsayılanı EZER. Anahtar alt_mecra id'sidir; bir alan
   tam bir mecraya ait olduğundan durum yapısal olarak MECRA BAŞINADIR
   (M1'de açtığın grup, OSB'ye gidip dönünce açık kalır; OSB'nin durumu
   M1'e karışmaz). Seçim bu durumla BİRLİKTE saklanmaz: seçim yalnız o
   çizimde görünen yüzlerdir (mdSecimCiz) ve mecra değişince temizlenir. */
function mdVarsayilanAcik(M,a,o){
  o=o||{};
  if(o.tek) return true;                               // tek grup varsa gizlemenin anlamı yok
  if(o.arayis) return true;                            // arama/durum filtresi: kullanıcı avlanıyor
  return false;
}
/* Derin bağlantı (Hareketler → Mecralar, "Mecralarda göster") hedef grubu
   HER ZAMAN açar: kullanıcı o grubu daha önce kapatmış olsa bile hedef satır
   görünür olmalıdır. Açık karar bunu geçemez; kural kullanıcı kararının
   ÜSTÜNDE değerlendirilir ve mdOdakUygula sonucu hatırlatır. */
function mdOdakGrubu(M,a,pid){
  if(!pid) return false;
  const r=(M.recs||[]).find(x=>x.placement_id===pid); if(!r) return false;
  if(String(r.alt_mecra_id)===String(a.id)) return true;
  const u=M.unitById[r.unit_id];
  return !!(u&&String(u.alt_mecra_id)===String(a.id));
}

/* ---------- YIL: statik matris (M1 çıtası) + LED zaman çizelgesi ---- */
/* Statik yüzey seçilen dönemin TAMAMINDA boş mu?
   İptal edilmiş kayıt bloke etmez; bitişi bilinmeyen kayıt eder. */
function mdMusaitMi(M,u,ar){
  if(u.active===false) return false;
  return !(M.byUnit[u.id]||[]).some(r=>r.commitment!=='cancelled'
    &&r.block_start<=ar.bit&&(r.block_end==null||r.block_end>=ar.bas));
}
/* Müsaitlik aralığı yalnız İKİ tarih de seçiliyse vardır (§3): kullanıcı
   dönem seçmeden takvimin yılı ya da bugünü gizlice müsaitlik sorgusu
   SAYILMAZ. */
function mdMsAralik(st){
  if(!st.msBas||!st.msBit) return null;
  if(mdTarihDogrula(st.msBas).hata||mdTarihDogrula(st.msBit).hata||st.msBas>st.msBit) return null;
  return {bas:st.msBas,bit:st.msBit};
}

/* ---------- Müsaitlik araması: giriş (S10 §1) ----------
   Kök neden (yeniden üretildi): tarih kutusu `onchange` ile her tuşta
   aramayı UYGULUYORDU. Chrome yıl alanına "2" yazıldığı anda değeri
   "0002-09-21" olarak geçerli sayar ve `change` üretir; ekran yeniden
   çizilince kutu da yeniden kurulup kullanıcının yazması yarıda kalıyordu.
   Ardından `new Date(2,8,21)` 0–99 yılını 1900'e taşıdı (etiket "1902"),
   karşılaştırma ise "0002-…" dizgesiyle yapıldığı için her yüzey müsait
   çıktı (82/82). Artık:
     · tarih yazarken hiçbir şey uygulanmaz; arama yalnız düğmeyle / Enter,
     · iki tarih TAM ve DESTEKLENEN aralıktaysa uygulanır,
     · yıl ASLA sessizce dönüştürülmez; hata açıkça yazılır. */
const MD_TARIH_MIN='2000-01-01', MD_TARIH_MAX='2099-12-31';
function mdTarihDogrula(v,ad){
  ad=ad||'Tarih';
  if(!v) return {hata:`${ad} seçilmedi.`};
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if(!m) return {hata:`${ad} eksik ya da geçersiz.`};
  const y=+m[1], a=+m[2], g=+m[3];
  if(v<MD_TARIH_MIN||v>MD_TARIH_MAX) return {hata:`${ad}: yıl ${MD_TARIH_MIN.slice(0,4)}–${MD_TARIH_MAX.slice(0,4)} arasında olmalı (girilen: ${y}).`};
  const d=mdGun(v);
  if(d.getFullYear()!==y||d.getMonth()!==a-1||d.getDate()!==g) return {hata:`${ad} takvimde yok.`};
  return {ok:true};
}
function mdMsHataGizle(){ const h=document.getElementById('mdMsHata'); if(h){ h.hidden=true; h.textContent=''; } }
function mdMsHata(msg,alan){
  const h=document.getElementById('mdMsHata');
  if(h){ h.textContent=msg+' Arama uygulanmadı.'; h.hidden=false; }
  const el=alan&&document.getElementById(alan); if(el) el.focus();
}
/* Yarım yazılmış tarih kutusunun `value`'su BOŞTUR; tarayıcı bunu
   `validity.badInput` ile bildirir. "Seçilmedi" ile "eksik yazıldı"
   ayrı mesajdır. */
function mdMsOku(id,ad){
  const el=document.getElementById(id); if(!el) return {hata:`${ad} bulunamadı.`};
  if(!el.value&&el.validity&&el.validity.badInput) return {hata:`${ad} eksik yazıldı (gün, ay ve dört haneli yıl gerekli).`};
  const v=mdTarihDogrula(el.value,ad); if(v.hata) return v;
  return {v:el.value};
}
function mdMsAra(){
  const b=mdMsOku('mdMsBas','Başlangıç'); if(b.hata){ mdMsHata(b.hata,'mdMsBas'); return; }
  const e=mdMsOku('mdMsBit','Bitiş');     if(e.hata){ mdMsHata(e.hata,'mdMsBit'); return; }
  if(b.v>e.v){ mdMsHata('Başlangıç bitişten sonra olamaz.','mdMsBit'); return; }
  /* Takvim aranan döneme gider (§1): sonuç, etiket ve takvim AYNI dönemi
     gösterir. Ölçek korunur. */
  const st={...mdDurum(),msBas:b.v,msBit:e.v};
  const ek=mdEksen(st);
  if(!(b.v>=ek.bas&&b.v<=ek.bit)){
    const n=+st.olcek||12;
    st.ank=n===12?`${b.v.slice(0,4)}-01`:mdYm(b.v);
    st.yil=+b.v.slice(0,4);
  }
  /* Geçmiş ayları gizlemek aranan dönemi saklayamaz. */
  if(st.gecmisGizle&&b.v<mdYm(mdBugun())+'-01') st.gecmisGizle=false;
  mdDurumYaz(st); mdYenidenCiz();
}
function mdMsTemizle(){ mdSet({msBas:'',msBit:''}); }
function mdMsDonemeGit(){
  const st=mdDurum(), ms=mdMsAralik(st); if(!ms) return;
  const n=+st.olcek||12;
  st.ank=n===12?`${ms.bas.slice(0,4)}-01`:mdYm(ms.bas); st.yil=+ms.bas.slice(0,4);
  if(st.gecmisGizle&&ms.bas<mdYm(mdBugun())+'-01') st.gecmisGizle=false;
  mdDurumYaz(st); mdYenidenCiz();
}
/* Aralığın insan okunur adı — özet, aktif filtre etiketi ve takvim
   işareti AYNI biçimi kullanır. Yıl her zaman yazılır. */
function mdMsAd(ms){ return `${mdKisa(ms.bas,true)} – ${mdKisa(ms.bit,true)}`; }

/* ---------- Müsaitlik: TEK hesap (S10 §1) ----------
   Sayaç ve liste aynı fonksiyondan beslenir. Kapsam yalnız YÜZEY
   düzeyindedir: mecra (site), alan, mecra türü, pozisyon adı araması.
   Kurum / iş / kayıt türü süzgeçleri bir KAYIT sorusudur; başka
   müşterinin doluluğunu hesaptan çıkaramaz ve yüzey kümesini daraltmaz.
   LED (eşzamanlı) alanlar kapsam dışıdır. */
function mdMusaitHesap(M,st,ms){
  const siteler=st.site!=null?[M.mecById[st.site]].filter(mdKapsamda):M.mecs.filter(mdKapsamda);
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const out={toplam:0,set:new Set(),hata:!Array.isArray(M.recs)||!!M.recsHata};
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(a=>!mdArsiv(a)&&!mdEszamanli(a));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    alanlar.filter(a=>mdAlanGecer(M,a,st)).forEach(a=>{
      (a._sahte?yetim:(M.unitsByAlt[a.id]||[])).filter(u=>u.active!==false).forEach(u=>{
        if(q&&![u.name,a.name,m.name,mdAile(M,a)].some(v=>String(v||'').toLocaleLowerCase('tr').includes(q))) return;
        out.toplam++;
        if(mdMusaitMi(M,u,ms)) out.set.add(u.id);
      });
    });
  });
  return out;
}

function mdYilCiz(M,st,filtre){
  filtre=filtre||{};
  const ek=mdEksen(st);
  const msAralik=mdMsAralik(st);
  const MS=msAralik?mdMusaitHesap(M,st,msAralik):null;
  /* Veri okunamadıysa "hepsi müsait" sonucuna DÜŞÜLMEZ (§1). */
  if(MS&&MS.hata) return `<div class="md-ms-ozet hata" role="alert"><b>Müsaitlik hesaplanamadı</b>
      <span>Doluluk kayıtları okunamadı; sonuç gösterilmiyor. Sayfayı yenileyip tekrar deneyin.</span></div>`;
  const gun=mdBugun(), buYm=mdYm(gun);
  const aylar=ek.aylar;
  const yb=ek.bas, ye=ek.bit;
  const siteler=st.site!=null?[M.mecById[st.site]].filter(Boolean):M.mecs.filter(mdKapsamda);
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const kFiltre=r=>(!filtre.kurum||String(r.customer_id)===String(filtre.kurum))
                 &&(!filtre.is||String(r.work_id)===String(filtre.is))
                 &&(!q||mdAraEslesir(M,r,q));
  /* Kurum/İş bağlamında sonuç kümesi zaten küçüktür — orada gruplar
     açık gelir. Serbest Yıl görünümünde ağır matris yalnız AÇIK grup
     için üretilir (S8.1 §14). */
  const daralt=!!(filtre.kurum||filtre.is||q)||!!MS;
  let html='';
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(a=>!mdArsiv(a));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    const tekGrup=alanlar.length===1;
    let ic_='';
    alanlar.forEach(a=>{
      if(!mdAlanGecer(M,a,st)) return;
      const acik=mdOdakGrubu(M,a,ui._mOdak)||mdAcikMi(st,a,mdVarsayilanAcik(M,a,{tek:tekGrup,arayis:daralt}));
      if(mdEszamanli(a)){
        /* Müsaitlik araması LED'e UYGULANMAZ: kapasite tanımlı değildir,
           dolayısıyla "boş/dolu" sonucu üretmek yanıltıcı olurdu (§3).
           Arama açıkken LED alanı listeden sessizce düşer. */
        if(msAralik) return;
        let l=(M.byArea[a.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb)).filter(kFiltre);
        if(st.tur) l=l.filter(r=>r.commitment===st.tur);
        if(!l.length&&(daralt||st.tur)) return;
        ic_+=mdLedZaman(M,a,l,ek,acik); return;
      }
      const us=a._sahte?yetim:(M.unitsByAlt[a.id]||[]);
      const kayitlar=u=>(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'
          &&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb));
      let satirlar;
      if(MS){
        /* MÜSAİTLİK ARAMASI (S10 §1): satırlar sayaçla AYNI kümeden
           gelir (mdMusaitHesap). Kurum/iş/kayıt türü burada yüzey
           kümesini daraltmaz; yüzeydeki diğer kayıtlar bağlam olarak
           çizilir. */
        satirlar=us.filter(u=>MS.set.has(u.id)).map(u=>({u,l:kayitlar(u)}));
      } else {
        satirlar=us.map(u=>({u,l:kayitlar(u)}))
          .filter(x=>!daralt||x.l.some(kFiltre)||(q&&String(x.u.name).toLocaleLowerCase('tr').includes(q)));
        /* KAYIT TÜRÜ (§3): GÖRÜNEN takvim aralığıyla kesişen kayıtlar
           üzerinden çalışır — arka planda "bugün" sorusu sorulmaz. Eşleşen
           kayıtları OLAN yüzeyler gösterilir; aynı yüzeydeki diğer
           doluluklar soluk bağlam olarak KORUNUR (yüzey boşmuş gibi
           gösterilmez). */
        if(st.tur) satirlar=satirlar.filter(x=>x.l.some(r=>r.commitment===st.tur));
      }
      if(!satirlar.length) return;
      ic_+=mdStatikZaman(M,a,satirlar,ek,MS?(()=>true):kFiltre,MS?{}:filtre,acik,{tur:MS?'':st.tur,ms:msAralik});
    });
    if(!ic_) return;
    html+=`<div class="md-yil-site"><h3 class="md-yil-t">${esc(m.name)}</h3>${ic_}</div>`;
  });
  /* Müsaitlik özeti: tarih ve PAYDA açıkça yazılır (§3). Payda,
     kapsamdaki statik YÜZ sayısıdır — fiziksel pano ile karıştırılmaz. */
  let ozet='';
  if(MS){
    const musait=MS.set.size;
    /* Takvim aranan dönemi göstermiyorsa (ör. "Bugüne git" sonrası)
       sonuç bugünün sonucu gibi SUNULMAZ; açık eylem verilir (§2). */
    const gorunur=msAralik.bas<=ek.bit&&msAralik.bit>=ek.bas;
    const kayitSuzgec=[st.kurum&&'kurum',st.is&&'iş',st.tur&&'kayıt türü'].filter(Boolean);
    ozet=`<div class="md-ms-ozet" role="status"><div><b>${esc(mdMsAd(msAralik))}</b>
      için <b>${MS.toplam} yüzeyden ${musait} tanesi müsait</b>
      <span class="muted">· dönemin herhangi bir gününde dolu/opsiyonlu olan yüzey sayılmaz; LED kapsam dışı</span></div>
      ${kayitSuzgec.length?`<div class="muted">${esc(kayitSuzgec.join(', '))} süzgeci müsaitlik sonucunu daraltmaz — başka müşterilerin kayıtları da yüzeyi bloklar.</div>`:''}
      ${gorunur?'':`<div class="md-ms-uyari">Takvim şu an aranan dönemi göstermiyor; yukarıdaki sonuç aranan dönem içindir.
        <button type="button" class="btn-link" onclick="mdMsDonemeGit()">Aranan döneme git</button> ·
        <button type="button" class="btn-link" onclick="mdMsTemizle()">Bugüne dönmek için müsaitlik aramasını temizle</button></div>`}</div>`;
    if(!musait) return ozet+`<div class="sec-card"><p class="empty">Seçilen dönemin tamamında boş statik yüzey yok.</p></div>`;
  }
  if(!html){
    /* Gerçekten boş sonuç gösterilir; ilgisiz bütün satırlar GERİ
       GETİRİLMEZ (§3). */
    const neden=st.tur?`${st.tur==='reserved'?'Opsiyon':'Rezervasyon'} kaydı`:'kayıt';
    return ozet+`<div class="sec-card"><p class="empty">${esc(mdEksenAdi(ek))} için bu kapsamda ${esc(neden)} yok.</p></div>`;
  }
  return ozet+html;
}
/* Ekranda görünen dönemin insan okunur adı — sayaç ve boş durum aynı
   dönemden bahsettiğini SÖYLER (§6: sayaçların kapsamı açık olsun). */
function mdEksenAdi(ek){
  if(ek.n===12&&ek.aylar.length===12&&ek.aylar[0].endsWith('-01')) return ek.aylar[0].slice(0,4)+' yılı';
  return `${mdYmAdi(ek.aylar[0])} – ${mdYmAdi(ek.aylar[ek.aylar.length-1])}`;
}

/* Tek paylaşılan bilgi kartı düğümü: her şerit için ayrı düğüm
   yaratmak yüzlerce ölü element bırakırdı. */
let _mdTipEl=null;
function mdTipGizle(){ if(_mdTipEl) _mdTipEl.style.display='none'; }
/* Gösterge yalnız bu çizimde GERÇEKTEN kullanılan öğeleri anlatır.
   Renk tek bilgi taşıyıcısı değildir: her durum ayrıca metinle yazılır
   ve şeritler desen/işaretle de ayrışır (§5). */
/* Lejant: TEK, kısa ve yalnız bu çizimde gerçekten kullanılan görsel
   anlamlarla sınırlı (§4). "Aynı müşteri · sözleşme sınırı" ayrı bir
   durum DEĞİLDİR ve buraya girmez — bitişik yenilemede ince ayraç
   yeterlidir, ayrı sözleşmeler ayrıntıda görünür. */
function mdLegend(){
  const p=[];
  if(_mdLeg.ab) p.push('<span class="lg-surf"><b>A</b> Ön yüz</span><span class="lg-surf"><b>B</b> Arka yüz</span><span class="lg-sep"></span>');
  if(_mdLeg.kes) p.push('<span><i class="sw kes"></i>Rezervasyon</span>');
  if(_mdLeg.ops) p.push('<span><i class="sw ops"></i>Opsiyon</span>');
  if(_mdLeg.gecmis) p.push('<span><i class="sw gecmis"></i>Geçmiş</span>');
  if(_mdLeg.suresiz) p.push('<span><i class="sw sur"></i>Opsiyon süresi doldu</span>');
  if(_mdLeg.musait) p.push('<span><i class="sw musait"></i>Seçilen dönemde müsait</span>');
  if(!p.length) return '';
  return `<div class="rg-legend">${p.join('')}</div>`;
}

/* Operasyonel kapsam (PS9 §2). Kapsam dışı lokasyon aktif doluluk
   yüzeyinde, sayaçlarda ve yeni yerleşim seçiminde GÖRÜNMEZ; kayıtları
   ve geçmişi yerinde DURUR ve kurum/iş bağlamından okunabilir. */
function mdKapsamda(m){ return !!m&&m.operational!==false; }

/* Alan seçimi + mecra türü süzgeci tek yerde. İki ekranın (Bugün / Yıl)
   aynı kuralı iki kez yazması, birinin sessizce sapmasının en kısa
   yoludur. */
function mdAlanGecer(M,a,st){
  if(st.alan&&String(st.alan)!==String(a.id)) return false;
  if(st.urun){
    /* Yetim pozisyon kutusunun ürünü yoktur; tür süzgeci açıkken
       gösterilmez, aksi halde "bu türe ait" gibi okunurdu. */
    if(a._sahte) return false;
    if(String(a.product_id)!==String(st.urun)) return false;
  }
  return true;
}

/* ---------- Eksen başlığı: ay adları + bugün çizgisi ----------
   Ay sütunları gün sayısıyla orantılıdır; içinde bulunulan ay vurgulanır. */
/* Uygulanmış müsaitlik aralığı takvimde işaretlenir (S10 §1): başlıkta
   etiketli bir bant, her satırın arka planında aynı konumda ince bir
   zemin. Çizim başına mdCiz belirler. */
let _mdMsBant=null;
function mdMsBant(ek,baslik){
  const ms=_mdMsBant; if(!ms||ms.bas>ek.bit||ms.bit<ek.bas) return '';
  const b=ms.bas<ek.bas?ek.bas:ms.bas, e=ms.bit>ek.bit?ek.bit:ms.bit;
  const sol=ek.gunNo(b)/ek.toplam*100, gen=(ek.gunNo(e)-ek.gunNo(b)+1)/ek.toplam*100;
  return `<span class="mtl-ms-bant${baslik?' b':''}" style="left:${sol.toFixed(3)}%;width:${gen.toFixed(3)}%"
    ${baslik?`title="Müsaitlik araması: ${esc(mdMsAd(ms))}"`:'aria-hidden="true"'}></span>`;
}
function mdEksenBaslik(ek,o){
  const gun=mdBugun(), buYm=mdYm(gun);
  const icinde=gun>=ek.bas&&gun<=ek.bit;
  return `<div class="mtl-row mtl-head">
    <div class="mtl-lbl">${esc(o&&o.lbl||'Pozisyon')}</div>
    ${o&&o.ab===false?'':'<div class="mtl-ab" aria-hidden="true"></div>'}
    <div class="mtl-trk mtl-trk-g" style="grid-template-columns:${ek.kol}">
      ${ek.aylar.map(ym=>`<div class="mtl-mh ${ym===buYm?'bu':''}">
        <span>${esc(AY_KISA[+ym.slice(5,7)-1])}</span>${ek.n<=6||ym.endsWith('-01')?`<em>${esc(ym.slice(2,4))}</em>`:''}</div>`).join('')}
      ${mdMsBant(ek,true)}
      ${icinde?`<span class="mtl-bugun" style="left:${ek.yuzde(gun)}%" title="Bugün"><i>Bugün</i></span>`:''}
    </div></div>`;
}

/* ---------- Bir yüzün şeridi ----------
   Her kayıt gerçek tarihinde başlar/biter. Ay sınırı görsel bir
   çizgidir, kaydı BÖLMEZ. */
function mdSeritler(M,u,ek,soluk,gun,o){
  o=o||{};
  if(!u) return '<div class="mtl-lane mtl-yok" aria-hidden="true"></div>';
  const l=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled')
    .filter(r=>r.block_start<=ek.bit&&(r.block_end==null||r.block_end>=ek.bas));
  const pasif=u.active===false;
  const cub=l.map((r,i)=>{
    const s=mdSerit(r,ek); if(!s) return '';
    const ops=r.commitment==='reserved';
    /* Aynı müşterinin KESİNTİSİZ yenilemesi: parçalar bitişik görünür,
       sözleşme sınırı ince bir ayraçla belirtilir. Kayıtlar veri olarak
       BİRLEŞTİRİLMEZ ve bu AYRI BİR DURUM DEĞİLDİR (lejantta yoktur). */
    const onc=l[i-1];
    const bitisik=!!(onc&&onc.block_end&&r.block_start===mdEkle(onc.block_end,1)
                     &&String(onc.customer_id)===String(r.customer_id));
    /* Geçmiş kayıt AYNI tür renginin düşük vurgulu hâlidir; ayrı bir
       "eski kayıt" türüne DÖNÜŞMEZ (§4). Aylık kesinlik farkı yalnız
       bilgi kartında ve ayrıntıda anlatılır. */
    const gecmisMi=r.block_end!=null&&r.block_end<gun;
    if(ops) _mdLeg.ops=true; else _mdLeg.kes=true;
    if(gecmisMi) _mdLeg.gecmis=true;
    const sur=!!(r.option_expires_at&&ops&&r.option_expires_at<gun);
    if(sur) _mdLeg.suresiz=true;
    const etiket=mdOrgEtiket(r.customer_name);
    /* "kurum belirtilmemiş" metni ÜRETİLMEZ (§5): kurum bilinmiyorsa
       çubuk yazısız kalır, bağlam bilgi kartındadır. */
    const baslik=[r.customer_name,mdDonem(r),r.work_title].filter(Boolean).join(' · ');
    const vurgu=o.vurgula&&o.vurgula(r);
    return `<button type="button" class="mtl-bar ${ops?'ops':'kes'}${gecmisMi?' gecmis':''}${bitisik?' bitisik':''}${sur?' sur':''}${s.solTasar?' tsol':''}${s.sagTasar?' tsag':''}${soluk&&!soluk(r)?' soluk':''}${vurgu?' vurgu':''}"
      style="left:${s.sol.toFixed(3)}%;width:${s.gen.toFixed(3)}%"
      data-p="${r.placement_id||''}" title="${esc(baslik)}"
      aria-label="${esc(`${u.name} · ${baslik||'kayıt'} · ${ops?'Opsiyon':'Rezervasyon'}`)}"
      onclick="event.stopPropagation();${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}"
      onmouseenter="mdTlTip(this,${r.placement_id||0},${r.booking_id||0})" onmouseleave="mdTipGizle()"
      onfocus="mdTlTip(this,${r.placement_id||0},${r.booking_id||0})" onblur="mdTipGizle()">
      ${s.gen>4.2&&etiket?`<span>${esc(etiket)}</span>`:''}</button>`;
  }).join('');
  /* Boş alana tıklama = YENİ KAYIT (§2). Tıklanan nokta formun
     bağlamıdır: yüzey + tıklanan ayın boş aralığı. Yüzey detayı
     pozisyon adından açılır. */
  if(o.musait) _mdLeg.musait=true;
  const tiklanabilir=!pasif&&u.active!==false;
  return `<div class="mtl-lane ${pasif?'mtl-pasif':''}${o.musait?' musait':''}" data-u="${u.id}"
      ${tiklanabilir?`onclick="mdBoslugaTikla(event,${u.id})"
        onmousemove="mdBoslukIpucu(event,${u.id})" onmouseleave="mdIpucuGizle(this)"
        tabindex="0" role="button" aria-label="${esc(u.name)} — boş alana tıklayarak kayıt ekleyin"
        onkeydown="mdLaneKlavye(event,${u.id})" onblur="mdIpucuGizle(this)"`:''}>${cub}
    ${pasif?'<span class="mtl-pasif-t">Pasif</span>':''}</div>`;
}

/* ==========================================================
   BOŞ ALANA TIKLAMA -> YENİ KAYIT (PS9 görsel kabul §2)
   Tıklanan nokta formun BAĞLAMIDIR: yüzey + tıklanan ayın boş aralığı.
   ========================================================== */
/* Şerit üzerindeki x konumunu takvim gününe çevirir. */
function mdNoktaGun(ev,lane,ek){
  const b=lane.getBoundingClientRect(); if(!b.width) return null;
  const oran=Math.min(0.999999,Math.max(0,(ev.clientX-b.left)/b.width));
  return mdEkle(ek.bas,Math.floor(oran*ek.toplam));
}
/* Tıklanan günün içinde bulunduğu AYIN boş aralığı.
   · Ay tamamen boşsa: ayın ilk ve son günü.
   · Ay kısmen doluysa: tıklanan boşluğun ay içinde kalan sınırları —
     komşu kaydın İÇİNE TAŞMAZ.
   · Tıklanan gün zaten doluysa null döner (çubuk kendi detayını açar).
   Geçmiş aya tıklanmışsa tarih SESSİZCE bugüne çekilmez. */
function mdBoslukAralik(M,u,iso){
  const ayBas=iso.slice(0,7)+'-01', aySon=mdAySonu(ayBas);
  const l=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled')
    .filter(r=>r.block_start<=aySon&&(r.block_end==null||r.block_end>=ayBas))
    .sort((p,q)=>String(p.block_start).localeCompare(String(q.block_start)));
  if(l.some(r=>mdKapsarMi(r,iso))) return null;          // dolu gün
  let bas=ayBas, bit=aySon;
  l.forEach(r=>{
    const rb=r.block_start, re=r.block_end==null?aySon:r.block_end;
    if(re<iso&&mdEkle(re,1)>bas) bas=mdEkle(re,1);        // önceki kaydın hemen ertesi
    if(rb>iso&&mdEkle(rb,-1)<bit) bit=mdEkle(rb,-1);      // sonraki kaydın hemen öncesi
  });
  if(bas>bit) return null;
  return {bas,bit,tamAy:bas===ayBas&&bit===aySon};
}
function mdBoslugaTikla(ev,uid){
  const M=ui._M; if(!M) return;
  const lane=ev.currentTarget; const ek=mdEksen(mdDurum());
  const iso=mdNoktaGun(ev,lane,ek); if(!iso) return;
  const u=M.unitById[uid]; if(!u) return;
  const g=mdBoslukAralik(M,u,iso);
  if(!g){ mYuzeyAc(uid); return; }                        // dolu nokta: yüzey detayı
  mdIpucuGizle(lane);
  mForm({hedefler:[{unit_id:uid}],taah:'reserved',bas:g.bas,bit:g.bit});
}
/* Hover / klavye önizlemesi: "P3-B · 1–31 Ekim · Kayıt ekle" */
function mdIpucuGizle(el){ const t=el&&el.querySelector('.mtl-ipucu'); if(t) t.remove(); }
function mdBoslukIpucu(ev,uid){
  const M=ui._M; if(!M) return;
  const lane=ev.currentTarget; const ek=mdEksen(mdDurum());
  const iso=mdNoktaGun(ev,lane,ek); if(!iso) return;
  const u=M.unitById[uid]; if(!u) return;
  const g=mdBoslukAralik(M,u,iso);
  mdIpucuGizle(lane);
  if(!g) return;
  const sol=ek.yuzde(g.bas), gen=Math.max(1,ek.yuzde(mdEkle(g.bit,1))-sol);
  const el=document.createElement('span');
  el.className='mtl-ipucu';
  el.style.left=sol+'%'; el.style.width=gen+'%';
  const ayAd=AY_UZUN[mdGun(g.bas).getMonth()];
  const metin=g.tamAy?`${u.name} · 1–${mdGun(g.bit).getDate()} ${ayAd} · Kayıt ekle`
                     :`${u.name} · ${mdGun(g.bas).getDate()}–${mdGun(g.bit).getDate()} ${ayAd} · Kayıt ekle`;
  el.textContent=gen>10?metin:'+';
  el.title=metin;
  lane.appendChild(el);
}
/* Dokunma/klavye: aynı işlev erişilebilir. Klavye odağında ortadaki
   güne göre öneri üretilir. */
function mdLaneKlavye(ev,uid){
  if(ev.key!=='Enter'&&ev.key!==' ') return;
  ev.preventDefault();
  const lane=ev.currentTarget; const b=lane.getBoundingClientRect();
  mdBoslugaTikla({clientX:b.left+b.width/2,currentTarget:lane},uid);
}

function mdStatikZaman(M,a,satirlar,ek,kFiltre,filtre,acik,o){
  o=o||{};
  const urun=M.pm[a.product_id]||'';
  const key=mdGrupKey(a);
  const kayitSay=satirlar.reduce((n,x)=>n+x.l.length,0);
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(urun||a.name)}</span>
        <span class="md-as">${esc(urun?a.name:'')}${urun?' · ':''}${satirlar.length} yüz</span>
        <span class="md-oz">${kayitSay?`${esc(mdEksenAdi(ek))}: ${kayitSay} kayıt`:`${esc(mdEksenAdi(ek))}: kayıt yok`}</span>
      </button>
      <span class="md-ah-r">
        ${acik&&isAdmin()&&!a._sahte?`<button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id})"
          title="Envanter: bu alana yeni pozisyon ekle (yönetici)">${ic('plus',15)} Pozisyon</button>`:''}
      </span>
    </header>`;
  /* Kapalı grubun şeridi HİÇ kurulmaz (S8.1 §14). */
  if(!acik) return `<section class="sec-card md-alan md-kapali" data-a="${a.id}">${baslik}</section>`;
  const gun=mdBugun();
  const secili=new Set(satirlar.map(x=>x.u.id));
  const us=a._sahte?(M.orphanByMec[a.mecra_id]||[]):(M.unitsByAlt[a.id]||[]);
  const gr=groupUnits(us).filter(g=>[g.A,g.B].some(u=>u&&secili.has(u.id)));
  const soluk=(filtre.kurum||filtre.is)?kFiltre:null;

  const rows=gr.map(g=>{
    /* Çift yüzlü pano: pozisyon adı SOLDA BİR KEZ, altında A ve B için
       iki ince şerit. Aynı ayda yan yana iki küçük kare YOK (§5). */
    const cift=!!(g.A&&g.B);
    if(cift) _mdLeg.ab=true;
    [g.A,g.B].forEach(u=>{ if(u&&u.active!==false) _mdGoruntu.add(u.id); });
    /* Tür süzgeci açıkken EŞLEŞEN kayıtlar vurgulanır; hangi yüzün
       eşleştiği (A mı B mi) böylece açıkça görünür (§3). */
    const lane=u=>`<div class="mtl-sat">${mdSeritler(M,u,ek,soluk,gun,{
      vurgula:o.tur?(r=>r.commitment===o.tur):null,
      musait:!!(o.ms&&u&&mdMusaitMi(M,u,o.ms))})}</div>`;
    const secSay=[g.A,g.B].filter(u=>u&&ui._mSec.has(u.id)).length;
    const secBtn=[g.A,g.B].filter(u=>u&&u.active!==false).map(u=>u.id);
    return `<div class="mtl-row" data-b="${esc(g.base)}">
      <div class="mtl-lbl">
        ${secBtn.length?`<input type="checkbox" class="mtl-cb" ${secSay===secBtn.length?'checked':''}
           aria-label="${esc(g.base)} seç" onchange="mdTumunuSec([${secBtn.join(',')}],this.checked)">`:''}
        <button type="button" class="mtl-ad btn-link" title="${esc(g.base)} — yüzey detayı"
          onclick="mYuzeyAc(${(g.A||g.B).id})">${esc(g.base)}</button></div>
      <div class="mtl-ab" aria-hidden="true">${cift?'<i>A</i><i>B</i>':''}</div>
      <div class="mtl-trk">
        <div class="mtl-bg" style="grid-template-columns:${ek.kol}" aria-hidden="true">
          ${ek.aylar.map(ym=>`<i class="mtl-gl ${ym===mdYm(gun)?'bu':''}"></i>`).join('')}
          ${mdMsBant(ek)}
          ${gun>=ek.bas&&gun<=ek.bit?`<span class="mtl-bugun-l" style="left:${ek.yuzde(gun)}%"></span>`:''}
        </div>
        <div class="mtl-lanes">${cift?lane(g.A)+lane(g.B):lane(g.A||g.B)}</div>
      </div></div>`;
  }).join('');

  return `<section class="sec-card md-alan" data-a="${a.id}">${baslik}
    <div class="mtl-wrap"><div class="mtl">${mdEksenBaslik(ek)}${rows}</div></div></section>`;
}

/* Şerit bilgi kartı: KISA özet. Kritik bilgi yalnız hover'da DEĞİL —
   aynı kayıt tıklanınca tam ayrıntı penceresi açılır (§5). */
function mdTlTip(el,pid,bid){
  const M=ui._M; if(!M||!el) return;
  const r=M.recs.find(x=>(pid&&x.placement_id===pid)||(bid&&x.booking_id===bid)); if(!r) return;
  const gun=mdBugun();
  const ops=r.commitment==='reserved';
  const sur=r.option_expires_at&&ops;
  if(!_mdTipEl){ _mdTipEl=document.createElement('div'); _mdTipEl.className='rtip'; document.body.appendChild(_mdTipEl); }
  _mdTipEl.innerHTML=`<div class="rtip-t">${esc(r.unit_name||r.area_name||'')}</div>
    <div class="rtip-r"><span>${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',26))}</span>
      <b class="st-${ops?'rezerve':'dolu'}">${ops?'Opsiyon':'Rezervasyon'}</b></div>
    <div class="rtip-n">${esc(mdDonem(r))}${r.work_title?' · '+esc(r.work_title):''}</div>
    ${sur?`<div class="rtip-n ${r.option_expires_at<gun?'md-yk':''}">Opsiyon geçerliliği: ${esc(mdNokta(r.option_expires_at))}${r.option_expires_at<gun?' · süresi doldu':''}</div>`:''}
    ${r.record_kind==='legacy'?`<div class="rtip-n muted">${esc(mdKesinlikNotu(r))}</div>`:''}
    <div class="rtip-n muted">Ayrıntı için tıklayın</div>`;
  const b=el.getBoundingClientRect();
  _mdTipEl.style.display='block';
  const tw=_mdTipEl.offsetWidth, th=_mdTipEl.offsetHeight;
  let left=b.left+b.width/2-tw/2; left=Math.max(8,Math.min(left,window.innerWidth-tw-8));
  let top=b.top-th-10; if(top<8) top=b.bottom+10;
  _mdTipEl.style.left=left+'px'; _mdTipEl.style.top=top+'px';
}

/* LED Yıl: "kim, ne zaman yayında?" — örtüşme görünür biçimde serbesttir. */
/* LED: AYNI zaman ekseni, farklı satır anlamı. Statik yüzlerin "tek
   müşteriyle bloke" modeli LED'e DAYATILMAZ — her satır bir kampanyadır
   ve örtüşme görünür biçimde serbesttir (§7). */
function mdLedZaman(M,a,l,ek,acik){
  const bugun=mdBugun(); const icinde=bugun>=ek.bas&&bugun<=ek.bit;
  const sirali=[...l].sort((p,q)=>String(p.block_start).localeCompare(String(q.block_start)));
  const ekranlar=(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false);
  const satir=r=>{
    const s=mdSerit(r,ek); if(!s) return '';
    const eski=r.record_kind==='legacy';
    const ops=r.commitment==='reserved';
    const zm=mdZamansal(r,bugun);
    return `<div class="mtl-row mtl-kmp" data-p="${r.placement_id||''}">
      <div class="mtl-lbl mtl-lbl-w" title="${esc(r.customer_name||'')}">
        <span class="mtl-ad">${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',24))}</span>
        <span class="mtl-alt">${esc(r.work_title||(eski?'eski kayıt':''))}</span></div>
      <div class="mtl-trk">
        <div class="mtl-bg" style="grid-template-columns:${ek.kol}" aria-hidden="true">
          ${ek.aylar.map(ym=>`<i class="mtl-gl ${ym===mdYm(bugun)?'bu':''}"></i>`).join('')}
          ${icinde?`<span class="mtl-bugun-l" style="left:${ek.yuzde(bugun)}%"></span>`:''}
        </div>
        <div class="mtl-lanes"><div class="mtl-sat"><div class="mtl-lane">
          <button type="button" class="mtl-bar ${ops?'ops':'kes'}${eski?' eski':''}${s.solTasar?' tsol':''}${s.sagTasar?' tsag':''}"
            style="left:${s.sol.toFixed(3)}%;width:${s.gen.toFixed(3)}%"
            aria-label="${esc(`${r.customer_name||''} · ${mdDonem(r)} · ${zm==='guncel'?'Yayında':ops?'Opsiyon':'Yayın'}`)}"
            onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}"
            onmouseenter="mdTlTip(this,${r.placement_id||0},${r.booking_id||0})" onmouseleave="mdTipGizle()"
            onfocus="mdTlTip(this,${r.placement_id||0},${r.booking_id||0})" onblur="mdTipGizle()">
            ${s.gen>7?`<span>${esc(mdOrgEtiket(r.customer_name))}</span>`:''}</button>
        </div></div></div>
      </div></div>`;
  };
  const key=mdGrupKey(a);
  /* Fiziksel ekran sayısı ve aktif kampanya sayısı AYRI büyüklüktür
     (§7). Kapasite / slot / doluluk yüzdesi ÜRETİLMEZ. */
  const aktif=sirali.filter(r=>mdKapsarMi(r,bugun)&&r.record_kind!=='legacy').length;
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(a.name)}</span>
        <span class="md-tag">Eşzamanlı kampanya${a.creative_seconds?` · kreatif ${a.creative_seconds} sn`:''}</span>
        <span class="md-oz">${ekranlar.length} fiziksel ekran · ${aktif} aktif kampanya · ${esc(mdEksenAdi(ek))}: ${sirali.length} kayıt</span>
      </button>
      <span class="md-ah-r"><button class="btn btn-sm act act-work" onclick="mForm({hedefler:[{alt_mecra_id:${a.id}}]})">${ic('plus',15)} Yayın Ekle</button></span></header>`;
  if(!acik) return `<section class="sec-card md-alan md-led md-kapali" data-a="${a.id}">${baslik}</section>`;
  return `<section class="sec-card md-alan md-led" data-a="${a.id}">${baslik}
    ${ekranlar.length?`<p class="md-ekran">${ekranlar.map(u=>`<span class="chip" title="${esc([u.konum,u.olcu,u.yayin_format].filter(Boolean).join(' · ')||'teknik bilgi kayıtlı değil')}">${esc(u.name)}${u.yayin_format?` <em>${esc(u.yayin_format)}</em>`:''}</span>`).join('')}</p>`:''}
    <div class="mtl-wrap"><div class="mtl">${mdEksenBaslik(ek,{lbl:'Kampanya',ab:false})}
      ${sirali.length?sirali.map(satir).join(''):`<p class="empty" style="padding:10px 0">${esc(mdEksenAdi(ek))} için yayın kaydı yok.</p>`}
    </div></div>
    </section>`;
}

/* ==========================================================
   ÇOKLU SEÇİM → tek toplu yerleşim (B36)
   ========================================================== */
function mdSec(uid,on){ if(on) ui._mSec.add(uid); else ui._mSec.delete(uid);
  const tr=document.querySelector(`tr[data-u="${uid}"]`); if(tr) tr.classList.toggle('md-sel',on);
  mdSecimCiz(); }
function mdTumunuSec(ids,on){ ids.forEach(i=>on?ui._mSec.add(i):ui._mSec.delete(i)); mdCiz(); }
/* Seçim çubuğu — TEK doğruluk kaynağı bu çizimde render edilen yüzlerdir
   (S8.1 §17). Önceki davranışta `ui._mSec` küresel bir Set'ti ve hiçbir
   kapsam değişiminde uzlaştırılmıyordu: Çukurova'da S05–S08 seçip M1'e
   geçince çubuk hâlâ "S05, S06, S07, S08 seçildi" diyordu ve o kodlar
   ekranda hiçbir yerde yoktu. Artık görünmeyen yüz seçili KALAMAZ.

   Adlar aile adıyla nitelenir: `P3-A` alan bağlamı dışında tek başına
   benzersiz değildir (M1'de üç ayrı alanda birden vardır). */
function mdSecimCiz(){
  const b=document.getElementById('mdSecim'); if(!b) return;
  const M=ui._M; ui._mSec=ui._mSec||new Set();
  [...ui._mSec].forEach(id=>{ if(!_mdGoruntu.has(id)) ui._mSec.delete(id); });
  const n=ui._mSec.size;
  b.hidden=!n;
  if(!n){ b.innerHTML=''; return; }
  const adlar=[...ui._mSec].map(id=>mdYuzAdi(M,M.unitById[id])).filter(Boolean);
  b.innerHTML=`<span><b>${n} yüz seçildi</b> <span class="muted">${esc(adlar.slice(0,4).join(', '))}${adlar.length>4?` +${adlar.length-4}`:''}</span></span>
    <button class="btn btn-ghost btn-sm" onclick="ui._mSec.clear();mdCiz()">Seçimi temizle</button>
    <button class="btn btn-outline btn-sm" onclick="mdSecimAc('reserved')">${ic('plus',15)} Opsiyon</button>
    <button class="btn btn-primary btn-sm" onclick="mdSecimAc('confirmed')">${ic('plus',15)} Rezervasyon</button>`;
}
/* İş dilinde eylem (S8.1 §13). Model adı teknik kalır; düğme ekibin
   kelimesini kullanır ve aynı `mForm` / `media_create` yolundan geçer. */
function mdSecimAc(taah){ mForm({hedefler:[...ui._mSec].map(id=>({unit_id:id})),taah}); }

/* ==========================================================
   YERLEŞİM / KAMPANYA FORMU (tek form: oluştur + düzenle)
   ========================================================== */
function mdHedefAdi(M,h){
  if(h.alt_mecra_id) return (M.altById[h.alt_mecra_id]||{}).name||('Alan #'+h.alt_mecra_id);
  const u=M.unitById[h.unit_id]||{}; const a=M.altById[u.alt_mecra_id]||{};
  return `${u.name||('#'+h.unit_id)}${a.name?' · '+a.name:''}`;
}
async function mForm(o){
  o=o||{};
  const M=ui._M||await mdYukle();
  const r=o.kayit||null;                           // düzenleme: media_schedule satırı
  const hedefler=r?[r.unit_id?{unit_id:r.unit_id}:{alt_mecra_id:r.alt_mecra_id}]:(o.hedefler||[]);
  if(!hedefler.length){ mpAlert('Önce yüz ya da yayın alanı seçin.'); return; }
  const esz=!!hedefler[0].alt_mecra_id;
  const alan=esz?M.altById[hedefler[0].alt_mecra_id]:null;
  const isler=M.jobs.filter(j=>(j.lifecycle_status||'acik')!=='kapandi'||(r&&r.work_id===j.id))
    .sort((a,b)=>String(a.title).localeCompare(String(b.title),'tr'));
  ui._mf={hedefler,esz,kayit:r,devral:false,onIs:o.isId||null};
  const vars=r?r.work_id:(o.isId||'');
  /* Açılıştaki taahhüt: düzenlemede kaydın kendisi, oluşturmada çağıran
     iş dili eylemi (+ Rezervasyon / + Opsiyon), yoksa Opsiyon. */
  const taahOn=r?r.commitment:(o.taah||'reserved');
  const yeniBaslik=esz?'Yeni LED yayını':(o.taah==='confirmed'?'Yeni rezervasyon':o.taah==='reserved'?'Yeni opsiyon':'Yeni yerleşim');
  modal(`<h3 style="margin:0 0 4px">${r?(esz?'Yayını düzenle':'Yerleşimi düzenle'):yeniBaslik}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esz
      ?'Eşzamanlı yayın: aynı dönemde başka reklamverenler de yayında olabilir.'
      :'Her seçili yüz için AYRI bir kayıt oluşturulur; biri çakışırsa hiçbiri kaydedilmez.'}</p>
    <div class="field"><span class="flabel">${esz?'Yayın alanı':`Yüzler (${hedefler.length})`}</span>
      <div class="md-hdf">${hedefler.slice(0,40).map(h=>`<span class="chip">${esc(mdHedefAdi(M,h))}</span>`).join(' ')}${hedefler.length>40?` <span class="muted">+${hedefler.length-40}</span>`:''}</div>
      ${esz&&alan&&alan.creative_seconds?`<p class="md-not" style="margin:6px 0 0">Kreatif süresi: <b>${alan.creative_seconds} sn</b> — mecra kuralı, kampanya başına girilmez.</p>`:''}</div>
    <div class="row2">
      <div class="field"><label class="flabel" for="mfIs">İş *</label>
        <select class="inp" id="mfIs" onchange="mfIsDegis()"><option value="">— İş seçin —</option>
          ${isler.map(j=>`<option value="${j.id}" ${String(vars)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="mfKurum">Kurum *</label>
        <select class="inp" id="mfKurum" onchange="mfSozYukle()"><option value="">Önce iş seçin</option></select>
        <p class="fhint" id="mfKurumN" style="margin:4px 0 0"></p></div>
    </div>
    <div class="row2">
      <div class="field"><label class="flabel" for="mfBas">Başlangıç *</label>
        <input class="inp" type="date" id="mfBas" value="${esc(r?r.start_date:(o.bas||''))}"></div>
      <div class="field"><label class="flabel" for="mfBit">Bitiş</label>
        <input class="inp" type="date" id="mfBit" value="${esc(r?(r.end_date||''):(o.bit||''))}" ${r&&!r.end_date&&r.placement_id?'disabled':''}>
        <label class="md-cbx"><input type="checkbox" id="mfAcik" ${r&&!r.end_date?'checked':''}
          onchange="document.getElementById('mfBit').disabled=this.checked;if(this.checked)document.getElementById('mfBit').value=''"> Bitiş bilinmiyor</label></div>
    </div>
    ${esz?'':`<div class="field"><span class="flabel">Durum</span>
      <div class="ws-switch inline" role="radiogroup" aria-label="Durum" id="mfTaah">
        <button type="button" data-v="reserved" class="${taahOn==='reserved'?'on':''}" onclick="mfTaah(this)">Opsiyon</button>
        <button type="button" data-v="confirmed" class="${taahOn==='confirmed'?'on':''}" onclick="mfTaah(this)">Rezervasyon</button></div>
      <p class="fhint" style="margin:4px 0 0">Opsiyon ve rezervasyon yüzü aynı şekilde bloklar; iptal edilen kayıt bloklamaz.</p></div>
    <div class="field" id="mfOpsSarmal" ${taahOn==='reserved'?'':'hidden'}>
      <label class="flabel" for="mfOpsSon">Opsiyon son geçerlilik tarihi <span class="muted">(opsiyonel)</span></label>
      <input class="inp" type="date" id="mfOpsSon" value="${esc(r&&r.option_expires_at||'')}">
      <p class="fhint" style="margin:4px 0 0">Opsiyonun ne zaman düşeceği — reklam dönemi değil. Süresi geçen opsiyon yüzeyi bloklamaya devam eder.</p></div>`}
    <div class="field"><label class="flabel" for="mfSoz">Sözleşme kalemi <span class="muted">— isteğe bağlı</span></label>
      <select class="inp" id="mfSoz"><option value="">Bağlı değil</option></select>
      <p class="fhint" style="margin:4px 0 0">Bu rezervasyonu mevcut bir sözleşme kalemiyle ilişkilendirir.</p></div>
    <div class="field"><label class="flabel" for="mfNot">Not</label>
      <input class="inp" id="mfNot" value="${esc(r&&r.note||'')}" placeholder="İç not (herkese açık sitede görünmez)"></div>
    <div id="mfSorun" aria-live="polite"></div>
    <div class="md-mf-b">
      ${r&&r.placement_id&&r.commitment!=='cancelled'?`<button class="btn btn-danger btn-sm" onclick="mIptal(${r.placement_id})">Kaydı iptal et</button>`:''}
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="mfKaydet" onclick="mfKaydet()">${r?'Kaydet':(esz?'Yayını ekle':`${hedefler.length>1?hedefler.length+' kaydı':'Kaydı'} oluştur`)}</button></div>`);
  if(vars) await mfIsDegis(r?r.customer_id:null, r?r.contract_item_id:null);
}
function mfTaah(b){ b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));
  /* Opsiyon son geçerliliği yalnız opsiyonda anlamlıdır; rezervasyona
     geçilince alan gizlenir ve sunucu da değeri temizler (CHECK kısıtı
     bunu zorlar, istemci yalnız aynısını gösterir). */
  const s=document.getElementById('mfOpsSarmal');
  if(s) s.hidden=b.dataset.v!=='reserved'; }
/* İş seçilince kurum İŞİN TARAFLARINDAN türetilir; çelişkili İş A /
   ilgisiz Kurum B seçimi mümkün olmaz (B7). Sunucu da aynısını zorlar. */
async function mfIsDegis(kurumOn,sozOn){
  const M=ui._M; const wid=gv('mfIs'); const sel=document.getElementById('mfKurum'); const n=document.getElementById('mfKurumN');
  if(!sel) return;
  if(!wid){ sel.innerHTML='<option value="">Önce iş seçin</option>'; if(n) n.textContent=''; return; }
  const j=M.jmap[wid]||{};
  let taraf=[];
  try{ taraf=await api('media_work_parties&job_id='+wid); }catch(e){ taraf=[]; }
  const ids=[]; const push=(id,rol)=>{ if(id!=null&&!ids.some(x=>String(x.id)===String(id))) ids.push({id,rol}); };
  push(j.customer_id,'account'); taraf.forEach(t=>push(t.customer_id,t.role));
  const ROL={account:'hesap',advertiser:'reklamveren',agency:'ajans',bill_to:'fatura',supplier:'tedarikçi',operator:'işletmeci',other:'diğer'};
  if(ids.length){
    /* §6: birden çok taraf varsa ilk seçenek OTOMATİK seçilmez —
       kullanıcı bilinçli seçer. Tek taraf varsa o zaten tek doğru
       cevaptır ve seçili gelir. */
    const onSec=kurumOn!=null?kurumOn:(ids.length===1?ids[0].id:null);
    sel.innerHTML=(ids.length>1&&onSec==null?'<option value="">— Taraf seçin —</option>':'')
      +ids.map(x=>`<option value="${x.id}" ${String(onSec)===String(x.id)?'selected':''}>${esc(orgKisa(M.cmap[x.id]||('#'+x.id),44))} · ${esc(ROL[x.rol]||x.rol)}</option>`).join('');
    if(n) n.textContent=ids.length>1?'İşin taraflarından birini seçin.':'İşin kurumundan alındı.';
  } else {
    sel.innerHTML=`<option value="">— Kurum seçin —</option>`+Object.entries(M.cmap)
      .sort((a,b)=>a[1].localeCompare(b[1],'tr')).map(([id,ad])=>`<option value="${id}" ${String(kurumOn)===String(id)?'selected':''}>${esc(orgKisa(ad,50))}</option>`).join('');
    if(n) n.textContent='Bu işin henüz kurum bağlantısı yok.';
  }
  await mfSozYukle(sozOn);
}
/* Sözleşme kalemi önerisi HEDEF BAĞLAMINA göre daraltılır (§6):
   iş/kurum + yüzey/alan + dönem. Uygunsuz kalem seçilebilir olarak
   sunulmaz; geçerli bağlantı yoksa "Bağlı değil" varsayılanı kalır.
   Önceki formdan kalan seçim TAŞINMAZ. */
async function mfSozYukle(sozOn){
  const s=document.getElementById('mfSoz'); if(!s) return;
  const f=ui._mf||{}; const h=(f.hedefler||[])[0]||{};
  const wid=gv('mfIs'), cid=gv('mfKurum');
  if(!wid&&!cid){ s.innerHTML='<option value="">Bağlı değil</option>'; return; }
  const M=ui._M||{};
  const u=h.unit_id?(M.unitById||{})[h.unit_id]:null;
  const alan=h.alt_mecra_id?(M.altById||{})[h.alt_mecra_id]:null;
  const qs=new URLSearchParams({job_id:wid||'',customer_id:cid||'',
    unit_id:h.unit_id||'',alt_mecra_id:h.alt_mecra_id||'',
    mecra_id:(u&&u.mecra_id)||(alan&&alan.mecra_id)||'',
    start_date:gv('mfBas')||'',end_date:gv('mfBit')||''});
  let l=[]; try{ l=await api('media_contract_items&'+qs.toString()); }catch(e){ l=[]; }
  /* Taşınan seçim yalnız LİSTEDE HÂLÂ VARSA korunur. */
  const gecerli=l.some(k=>String(k.id)===String(sozOn));
  s.innerHTML='<option value="">Bağlı değil</option>'+l.map(k=>`<option value="${k.id}" ${gecerli&&String(sozOn)===String(k.id)?'selected':''}>${esc(k.etiket)}</option>`).join('');
  if(!l.length) s.innerHTML='<option value="">Bağlı değil — uygun kalem yok</option>';
}
async function mfKaydet(){
  const f=ui._mf; if(!f) return;
  const wid=gv('mfIs'), cid=gv('mfKurum'), bas=gv('mfBas');
  const acik=(document.getElementById('mfAcik')||{}).checked;
  const bit=acik?'':gv('mfBit');
  if(!wid){ mpAlert('İş seçimi zorunlu.','Eksik bilgi'); return; }
  if(!cid){ mpAlert('Kurum seçimi zorunlu.','Eksik bilgi'); return; }
  if(!bas){ mpAlert('Başlangıç tarihi zorunlu.','Eksik bilgi'); return; }
  if(bit&&bit<bas){ mpAlert('Bitiş başlangıçtan önce olamaz.','Geçersiz dönem'); return; }
  if(!bit&&!f.esz&&!(await mpConfirm('Bitiş tarihi olmadan kaydedilirse bu yüz, kayıt kapatılana kadar İLERİYE DÖNÜK satışa kapalı kalır. Devam edilsin mi?','Bitiş bilinmiyor',{danger:false,ok:'Evet, kaydet'}))) return;
  const on=document.querySelector('#mfTaah .on');
  const taah=f.esz?'confirmed':(on?on.dataset.v:'reserved');
  const opsSon=taah==='reserved'?(gv('mfOpsSon')||''):'';
  if(opsSon&&bit&&opsSon>bit){ mpAlert('Opsiyonun son geçerlilik tarihi, reklam döneminin bitişinden sonra olamaz.','Geçersiz opsiyon süresi'); return; }
  const ortak={work_id:+wid,customer_id:+cid,start_date:bas,end_date:bit||null,
    commitment:taah,option_expires_at:opsSon||null,
    contract_item_id:gv('mfSoz')||null,note:gv('mfNot')||null,eski_devral:!!f.devral};
  const btn=document.getElementById('mfKaydet'); const btnMetin=btn?btn.textContent:'Kaydet';
  if(btn){ btn.disabled=true; btn.textContent='Kaydediliyor…'; }
  let r;
  try{
    r=f.kayit&&f.kayit.placement_id
      ? await api('media_update',{id:f.kayit.placement_id,patch:{...ortak,end_date:bit||'',
          option_expires_at:opsSon||'',contract_item_id:ortak.contract_item_id||''}})
      : await api('media_create',{common:ortak,targets:f.hedefler});
  }catch(e){ if(btn){ btn.disabled=false; btn.textContent=btnMetin; } mpAlert(e.message||String(e),'Kaydedilemedi'); return; }
  if(btn){ btn.disabled=false; btn.textContent=btnMetin; }
  if(!r||!r.ok){ mfSorunCiz(r&&r.sorunlar||[]); return; }
  closeModal();
  ui._mSec&&ui._mSec.clear();
  toast(f.kayit?'Kayıt güncellendi.':(f.esz?'Yayın eklendi.':`${(r.ids||[]).length} kayıt oluşturuldu.`));
  await mdTazele();
}
/* Çakışma raporu: her hedef için ayrı satır, sessiz kısmi kayıt YOK (B37). */
function mfSorunCiz(sorun){
  const box=document.getElementById('mfSorun'); if(!box) return;
  const M=ui._M;
  const devralinir=sorun.length&&sorun.every(s=>s.cakismalar&&s.cakismalar.every(c=>c.devralinabilir));
  const satir=s=>{
    if(!s.cakismalar) return `<li><b>${esc(s.hedef)}</b> · ${esc(s.neden)}</li>`;
    return s.cakismalar.map(c=>{
      const ne=c.precision==='month'&&c.tur==='legacy'?`${mdYmAdi(c.ym)} ay bazlı eski kayıt`
              :`${mdAralik(c.bas,c.bit)}${c.tur==='legacy'?' (eski kayıt)':''}`;
      return `<li><b>${esc(String(s.hedef).split(' · ').pop())}</b> · ${esc(ne)} ile çakışıyor${c.firma?` <span class="muted">· ${esc(orgKisa(c.firma,30))}</span>`:''}</li>`;
    }).join('');
  };
  box.innerHTML=`<div class="md-sorun" role="alert"><b>${sorun.length} hedef kaydedilemez — hiçbir kayıt oluşturulmadı.</b>
    <ul>${sorun.map(satir).join('')}</ul>
    ${devralinir?`<label class="md-cbx"><input type="checkbox" onchange="ui._mf.devral=this.checked">
      Bu kurumun eski ay bazlı kayıtlarını yeni kesin dönemli kayıtla değiştir (eski kayıt geçmişte korunur)</label>`
      :'<p class="fhint" style="margin:6px 0 0">Çakışan yüzleri seçimden çıkarın ya da tarihleri değiştirin.</p>'}</div>`;
  box.scrollIntoView({block:'nearest'});
}
/* Süresi dolmuş opsiyon için üç karar yolu (PS9 kapanış §4).
   Üçü de mevcut güvenilir RPC'den geçer; yeni yazma yolu açılmadı. */
async function mOpsUzat(pid){
  const M=ui._M||await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid); if(!r) return;
  modal(`<h3 style="margin:0 0 4px">Opsiyon süresini uzat</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(r.unit_name||r.area_name||'')} ·
      ${esc(orgKisa(r.customer_name||'',36))}</p>
    <div class="field"><label class="flabel" for="mouTarih">Yeni son geçerlilik tarihi *</label>
      <input class="inp" type="date" id="mouTarih" value="${esc(r.option_expires_at||'')}">
      <p class="fhint" style="margin:4px 0 0">Reklam dönemi (${esc(mdDonem(r))}) DEĞİŞMEZ —
        yalnız opsiyonun ne zaman düşeceği güncellenir.</p></div>
    <div id="mouSorun" aria-live="polite"></div>
    <div class="md-mf-b"><span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="mKayitAc(${pid})">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="mouKaydet" onclick="mOpsUzatKaydet(${pid})">Uzat</button></div>`);
}
async function mOpsUzatKaydet(pid){
  const M=ui._M; const r=M.recs.find(x=>x.placement_id===pid);
  const t=gv('mouTarih'); const box=document.getElementById('mouSorun');
  const hata=m=>{ if(box) box.innerHTML=`<div class="md-sorun" role="alert">${esc(m)}</div>`; };
  if(!t){ hata('Tarih zorunlu.'); return; }
  if(t<mdBugun()){ hata('Yeni tarih geçmişte olamaz — opsiyon yine süresi dolmuş kalırdı.'); return; }
  if(r&&r.end_date&&t>r.end_date){ hata('Opsiyon geçerliliği reklam döneminin bitişinden sonra olamaz.'); return; }
  const btn=document.getElementById('mouKaydet');
  if(btn){ if(btn.disabled) return; btn.disabled=true; btn.textContent='Kaydediliyor…'; }
  const res=await guard(()=>api('media_update',{id:pid,patch:{option_expires_at:t}}),'Uzatılamadı');
  if(res===null){ if(btn){ btn.disabled=false; btn.textContent='Uzat'; } return; }
  toast('Opsiyon süresi uzatıldı.'); await mdTazele(); mKayitAc(pid);
}
async function mOpsKesinle(pid){
  if(!(await mpConfirm('Bu opsiyon kesin rezervasyona çevrilsin mi? Reklam dönemi aynı kalır; opsiyon son geçerlilik tarihi anlamsız hale geldiği için temizlenir.','Rezervasyona çevir',{danger:false,ok:'Evet, çevir'}))) return;
  const r=await guard(()=>api('media_update',{id:pid,patch:{commitment:'confirmed'}}),'Çevrilemedi');
  if(r===null) return;
  toast('Opsiyon rezervasyona çevrildi.'); await mdTazele(); mKayitAc(pid);
}
async function mIptal(pid){
  if(!(await mpConfirm('Bu kayıt iptal edilsin mi? Kayıt silinmez; geçmişte "İptal" olarak kalır ve yüzü artık bloklamaz.','Kaydı iptal et',{danger:true,ok:'Evet, iptal et'}))) return;
  const r=await guard(()=>api('media_update',{id:pid,patch:{commitment:'cancelled'}}),'İptal edilemedi');
  if(r===null) return;
  closeModal(); toast('Kayıt iptal edildi.'); await mdTazele();
}
/* Yazmadan sonra: Mecralar ekranındaysak yeniden çiz, değilsek o ekranı tazele. */
async function mdTazele(){
  await mdYukle();
  if(document.getElementById('mdGovde')) mdYenidenCiz();
  else if(ui._work&&document.getElementById('wMedya')) workAc(ui._work.id);
  else if(ui._org&&document.getElementById('orgMedya')) orgAc(ui._org.id);
}

/* ==========================================================
   ENVANTER: ALANA POZİSYON EKLEME (PS9 kapanış §3)

   Kurallar:
     · Lokasyon ve ürün türü ALANDAN türetilir, çağırandan değil.
     · Statik alanda tek yüz ya da A/B çifti; A/B tek işlemde yazılır
       (tek INSERT ifadesi -> ya ikisi de ya hiçbiri).
     · Eşzamanlı (LED) alanda satılabilir yüz DEĞİL, fiziksel EKRAN
       eklenir; teknik alanlar da ona göre değişir.
     · Kod yalnız KENDİ alanında benzersiz olmalıdır; başka ailedeki
       aynı kod serbesttir. Sunucuda `units_alt_name_uniq` zorlar.
     · Yetki sunucuda: `s07_units_write ... with check (is_admin())`.
       Buradaki isAdmin() yalnız yüzey gizlemedir.
   ========================================================== */
function mdPozAdlari(){
  const taban=(gv('mpTaban')||'').trim();
  if(!taban) return [];
  return (document.getElementById('mpCift')||{}).checked?[`${taban}-A`,`${taban}-B`]:[taban];
}
function mdPozOnizle(){
  const box=document.getElementById('mpOnizle'); if(!box) return;
  const ad=mdPozAdlari();
  const M=ui._M, f=ui._mp||{};
  const mevcut=new Set(((M&&M.unitsByAlt[f.altId])||[]).map(u=>String(u.name)));
  const carpisan=ad.filter(n=>mevcut.has(n));
  box.innerHTML=!ad.length?'<span class="muted">Pozisyon kodu girin.</span>'
    :`Oluşturulacak: ${ad.map(n=>`<span class="chip ${mevcut.has(n)?'md-cak':''}">${esc(n)}</span>`).join(' ')}
      ${carpisan.length?`<b class="md-yk">· ${esc(carpisan.join(', '))} bu alanda ZATEN VAR</b>`:''}`;
}
async function mdPozEkle(altId){
  const M=ui._M||await mdYukle();
  const a=M.altById[altId]; if(!a){ mpAlert('Alan bulunamadı.'); return; }
  const m=M.mecById[a.mecra_id]||{};
  const prod=(M.prods||[]).find(p=>String(p.id)===String(a.product_id))||{};
  const esz=mdEszamanli(a);
  /* Ürünün yüz yapısı varsayılanı belirler; kullanıcı değiştirebilir
     ama varsayılan yanlışsa her seferinde düzeltme yükü doğar. */
  const ciftVars=/çift/i.test(String(prod.yuzey||''));
  const ornek=((M.unitsByAlt[altId]||[]).find(u=>u.olcu)||{});
  ui._mp={altId,mecraId:a.mecra_id,prodId:a.product_id,esz};
  modal(`<h3 style="margin:0 0 2px">${esz?'Fiziksel ekran ekle':'Pozisyon ekle'}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(m.name||'')} · ${esc(a.name||'')}${prod.name?` · ${esc(prod.name)}`:''}</p>
    ${esz?`<p class="md-not" style="margin:0 0 12px">Bu bir <b>eşzamanlı yayın alanıdır</b>. Eklenen kayıt satılabilir bir
      statik yüzey DEĞİL, fiziksel bir ekrandır: kampanyalar ekrana değil alana bağlanır.</p>`:''}
    <div class="field"><label class="flabel" for="mpTaban">${esz?'Ekran adı':'Pozisyon kodu'} *</label>
      <input class="inp" id="mpTaban" value="" placeholder="${esz?'Ekran 3':'P30'}" oninput="mdPozOnizle()">
      <p class="fhint" style="margin:4px 0 0">${esz?'Ör. “Ekran 3”.':'Yüz harfini (-A/-B) YAZMAYIN; aşağıdaki seçim ekler.'}
        Kod yalnız bu alan içinde benzersiz olmalıdır; başka mecra türünde aynı kod serbesttir.</p></div>
    ${esz?'':`<div class="field"><label class="md-cbx"><input type="checkbox" id="mpCift" ${ciftVars?'checked':''}
        onchange="mdPozOnizle()"> Çift yüzlü pano (A ve B ayrı yüzey olarak oluşturulur)</label>
      <p class="fhint" style="margin:4px 0 0">A ve B bağımsız satılır ve tek işlemde birlikte oluşturulur.</p></div>`}
    <div class="row2">
      <div class="field"><label class="flabel" for="mpOlcu">Ölçü</label>
        <input class="inp" id="mpOlcu" value="${esc(ornek.olcu||'')}" placeholder="ör. 385×260 cm"></div>
      <div class="field"><label class="flabel" for="mpKonum">Konum notu</label>
        <input class="inp" id="mpKonum" value="" placeholder="ör. Otopark girişi"></div>
    </div>
    ${esz?`<div class="field"><label class="flabel" for="mpYayin">Yayın çözünürlüğü</label>
      <input class="inp" id="mpYayin" value="" placeholder="ör. 960×640 px">
      <p class="fhint" style="margin:4px 0 0">Ekrana özgüdür. <b>Bilinmiyorsa BOŞ bırakın</b> — başka ekrandan kopyalamayın.</p></div>`:''}
    <div class="md-onizle" id="mpOnizle"></div>
    <div id="mpSorun" aria-live="polite"></div>
    <div class="md-mf-b"><span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="mpKaydet" onclick="mdPozKaydet()">Ekle</button></div>`);
  mdPozOnizle();
}
async function mdPozKaydet(){
  const f=ui._mp; if(!f) return;
  const M=ui._M;
  const ad=mdPozAdlari();
  const sorun=document.getElementById('mpSorun');
  const hata=t=>{ if(sorun) sorun.innerHTML=`<div class="md-sorun" role="alert">${esc(t)}</div>`; };
  if(!ad.length){ hata('Kod zorunlu.'); return; }
  /* Aynı alandaki mükerrer kod: istemcide anlaşılır biçimde durdurulur,
     sunucuda `units_alt_name_uniq` ile GARANTİ edilir. */
  const mevcut=new Set(((M.unitsByAlt[f.altId])||[]).map(u=>String(u.name)));
  const carp=ad.filter(n=>mevcut.has(n));
  if(carp.length){ hata(`${carp.join(', ')} bu alanda zaten var. Farklı bir kod girin.`); return; }
  const btn=document.getElementById('mpKaydet');
  /* Çift gönderim koruması: düğme işlem boyunca kapalı. */
  if(btn){ if(btn.disabled) return; btn.disabled=true; btn.textContent='Ekleniyor…'; }
  const ortak={alt_mecra_id:f.altId,mecra_id:f.mecraId,product_id:f.prodId,
    olcu:gv('mpOlcu')||null,konum:gv('mpKonum')||null,active:true};
  if(f.esz) ortak.yayin_format=gv('mpYayin')||null;
  const satirlar=ad.map((n,i)=>({...ortak,name:n,sort:(M.unitsByAlt[f.altId]||[]).length+i+1}));
  let r;
  try{ r=await api('units_create',{rows:satirlar}); }
  catch(e){
    if(btn){ btn.disabled=false; btn.textContent='Ekle'; }
    hata(/units_alt_name_uniq|duplicate key/i.test(e.message||'')
      ? 'Bu kod bu alanda zaten var (sunucu reddetti). Farklı bir kod girin.'
      : (e.message||String(e)));
    return;
  }
  if(btn){ btn.disabled=false; btn.textContent='Ekle'; }
  closeModal();
  toast(`${(r||[]).length||ad.length} pozisyon eklendi.`);
  /* Kartlar, takvim ve sayaçlar aynı modelden beslenir; tek tazeleme
     hepsini günceller. */
  await mdTazele();
}

/* ==========================================================
   DETAY PENCERELERİ
   ========================================================== */
async function mKayitAc(pid){
  const M=ui._M||await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid); if(!r){ mpAlert('Kayıt bulunamadı.'); return; }
  const a=M.altById[r.alt_mecra_id]||{}; const esz=r.occupancy_mode==='concurrent';
  const zm=mdZamansal(r,mdBugun());
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  /* Süresi geçmiş opsiyon (PS9 kapanış §4): normal geçerli bir opsiyon
     gibi GÖRÜNMEMELİ. Otomatik serbest bırakma kararı korunuyor — kayıt
     alanı bloklamaya devam eder — ama bu artık ekranda AÇIKÇA yazıyor
     ve kararı verecek eylemler burada. */
  const opsGecti=r.commitment==='reserved'&&!!r.option_expires_at&&r.option_expires_at<mdBugun();
  const gecenGun=opsGecti?Math.round((mdGun(mdBugun())-mdGun(r.option_expires_at))/864e5):0;
  const uyari=opsGecti?`<div class="md-ops-uyari" role="status">
      <b>Opsiyon süresi doldu</b>
      <span>Geçerlilik ${esc(mdNokta(r.option_expires_at))} tarihinde bitti (${gecenGun} gün önce).
        Kayıt <b>silinmedi ve yüzeyi bloklamaya devam ediyor</b> — süre dolduğu için kendiliğinden
        serbest bırakılmaz. Aşağıdakilerden birini seçin.</span>
      ${r.commitment!=='cancelled'?`<span class="md-ops-b">
        <button class="btn btn-outline btn-sm" onclick="mOpsUzat(${pid})">Süreyi uzat</button>
        <button class="btn btn-primary btn-sm" onclick="mOpsKesinle(${pid})">Rezervasyona çevir</button>
        <button class="btn btn-danger btn-sm" onclick="mIptal(${pid})">İptal et — yüzeyi serbest bırak</button>
      </span>`:''}</div>`:'';
  modal(`<h3 style="margin:0 0 2px">${esc(esz?a.name:(r.unit_name||''))}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(r.mecra_name||'')}${esz?' · eşzamanlı LED yayını':` · ${esc(a.name||'')}`}</p>
    ${uyari}
    <div class="md-dl">
      <span>Kurum</span><b>${r.customer_id?`<button class="btn-link" onclick="closeModal();orgAc(${r.customer_id})">${esc(r.customer_name||'')}</button>`:'—'}</b>
      <span>İş</span><b>${r.work_id?`<button class="btn-link" onclick="closeModal();workAc(${r.work_id})">${esc(r.work_title||'')}</button>`:'<span class="muted">bağlı değil</span>'}</b>
      <span>Dönem</span><b class="mono">${esc(r.end_date?mdAralikNokta(r.start_date,r.end_date):mdNokta(r.start_date)+' – bitiş bilinmiyor')}</b>
      <span>Durum</span><b>${r.commitment==='cancelled'?'<span class="md-st md-st-iptal">İptal</span>'
          :esz?(zm==='guncel'?'<span class="md-st md-st-yayin">Yayında</span>':zm==='yaklasan'?'<span class="md-st md-st-rezerve">Yaklaşan</span>':'<span class="md-st md-st-eski">Bitti</span>')
          :mdKayitRozet(r,zm)} <span class="muted">${esc(MD_TAAHHUT[r.commitment]||'')}</span></b>
      ${r.option_expires_at?`<span>Opsiyon geçerliliği</span><b class="${r.option_expires_at<mdBugun()?'md-yk':''}">${esc(mdNokta(r.option_expires_at))}${r.option_expires_at<mdBugun()?' · süresi doldu':''}
        <span class="muted">— reklam dönemi değil</span></b>`:''}
      ${esz&&a.creative_seconds?`<span>Kreatif</span><b>${a.creative_seconds} sn <span class="muted">(mecra kuralı)</span></b>`:''}
      ${r.contract_item_id?`<span>Sözleşme</span><b id="mkSoz" class="muted">yükleniyor…</b>`:''}
      ${r.source_quote_id?`<span>Teklif</span><b>#${r.source_quote_id}</b>`:''}
      ${r.legacy_lane?`<span>Kaynak</span><b>Eski tablo şeridi <span class="mono">${esc(r.legacy_lane)}</span> <span class="muted">— yalnız köken; ekran ya da slot değildir</span></b>`:''}
      ${r.note?`<span>Not</span><b>${esc(r.note)}</b>`:''}
      <span>Kaydeden</span><b class="muted">${esc(tm[r.created_by_team_id]||'—')} · ${esc(r.created_at?psZaman(r.created_at):'')}</b>
    </div>
    <div class="md-mf-b">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();medyaOdak(${pid})">Takvimde göster</button>
      <span style="flex:1"></span>
      ${r.commitment!=='cancelled'?`<button class="btn btn-outline btn-sm" onclick="mForm({kayit:ui._M.recs.find(x=>x.placement_id===${pid})})">Düzenle</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button></div>`);
  if(r.contract_item_id) mKayitSozCiz(r.contract_item_id);
}
/* S10 §6: bağlı sözleşme kalemi anlaşılır adla; sözleşmeye ve belgesine
   buradan ulaşılır. Belge yüklemek sözleşme kalemi SEÇMEK değildir — bu
   yalnız mevcut ilişkiyi gösterir. */
async function mKayitSozCiz(kid){
  const el=document.getElementById('mkSoz'); if(!el) return;
  let k=null; try{ k=await api('contract_item_ctx&id='+kid); }catch(e){ k=null; }
  if(!document.getElementById('mkSoz')) return;
  if(!k||!k.contracts){ el.textContent='Sözleşme kalemi okunamadı'; return; }
  const c=k.contracts, g=v=>v?String(v).slice(0,10).split('-').reverse().join('.'):'';
  const docs=(c.document_links||[]).map(l=>l.documents).filter(Boolean).map(belgeKaydet);
  el.className='';
  el.innerHTML=`<button type="button" class="btn-link" onclick="closeModal();sozAc(${c.id})">${esc(c.title||c.reference_no||('Sözleşme #'+c.id))}</button>
    <span class="muted"> · ${esc(k.description||sozKalemLbl(k.item_type))}${k.start_date?` · ${esc(g(k.start_date))}${k.end_date?'–'+esc(g(k.end_date)):''}`:''}${c.status==='taslak'?' · taslak':''}</span>
    ${docs.length?`<div class="bl-strip" style="margin-top:6px">${docs.map(d=>`<button type="button" class="bl-doc" onclick="belgeDetay(${d.id})" title="${esc(belgeAd(d))}">
        <span class="bl-ext ${d.provider==='external'?'dis':''}">${esc(belgeUzanti(d))}</span><span class="bl-nm">${esc(belgeAd(d))}</span></button>`).join('')}</div>`
      :'<div class="muted" style="margin-top:4px">Sözleşmeye bağlı belge yok.</div>'}`;
}

/* Yüz detayı: şimdi / sıradaki / geçmiş + admin envanter kontrolü. */
async function mYuzeyAc(uid){
  const M=ui._M||await mdYukle();
  const u=M.unitById[uid]||{}; const a=M.altById[u.alt_mecra_id]||{}; const m=M.mecById[u.mecra_id]||{};
  const gun=mdBugun(); const d=mdYuzeyDurum(M,u,gun);
  const l=(M.byUnit[uid]||[]).slice().sort((p,q)=>String(q.block_start).localeCompare(String(p.block_start)));
  const gelecek=l.filter(r=>r.commitment!=='cancelled'&&(r.block_end==null||r.block_end>=gun)).reverse();
  const gecmis=l.filter(r=>r.commitment==='cancelled'||(r.block_end!=null&&r.block_end<gun)).slice(0,12);
  const satir=r=>`<li class="md-hl ${r.commitment==='cancelled'?'iptal':''}" onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
      <span class="mono">${esc(mdDonem(r))}</span><span>${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',30))}</span>
      <span class="muted">${esc(r.work_title||'')}</span>${mdKayitRozet(r,mdZamansal(r,gun))}</li>`;
  modal(`<h3 style="margin:0 0 2px">${esc(u.name||'')}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(m.name||'')} · ${esc(a.name||'Diğer')}${u.olcu?' · '+esc(u.olcu):''}${u.konum?' · '+esc(u.konum):''}</p>
    <div class="md-dl"><span>Bugün</span><b><span class="md-st md-st-${d.kod}">${esc(d.etiket)}</span> ${esc(d.alt||'')}</b>
      ${d.kayit?`<span>Kurum</span><b>${esc(d.kayit.customer_name||'—')}</b><span>Dönem</span><b class="mono">${esc(mdDonem(d.kayit))}</b>
        ${mdKesinlikNotu(d.kayit)?`<span></span><b class="muted">${esc(mdKesinlikNotu(d.kayit))}</b>`:''}`:''}</div>
    ${gelecek.length?`<div class="md-alt-b">Güncel ve yaklaşan</div><ul class="md-hlist">${gelecek.map(satir).join('')}</ul>`:''}
    ${gecmis.length?`<div class="md-alt-b">Geçmiş</div><ul class="md-hlist">${gecmis.map(satir).join('')}</ul>`:''}
    ${isAdmin()?`<div class="md-adm"><span>Envanter (yönetici)</span>
      <label class="switch" style="margin:0"><input type="checkbox" ${u.active===false?'':'checked'} onchange="mYuzeyAktif(${uid},this.checked)"><span class="sl"></span>
      <span class="txt">${u.active===false?'Pasif — satışa kapalı':'Aktif'}</span></label>
      <span class="fhint" style="margin:0">Kısa bakım otomatik pasife almaz (BR-M03).</span></div>`:''}
    <div class="md-mf-b"><span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button>
      ${u.active!==false?`<button class="btn btn-outline btn-sm" onclick="mForm({hedefler:[{unit_id:${uid}}],taah:'reserved'})">${ic('plus',15)} Opsiyon</button>
      <button class="btn btn-primary btn-sm" onclick="mForm({hedefler:[{unit_id:${uid}}],taah:'confirmed'})">${ic('plus',15)} Rezervasyon</button>`:''}</div>`);
}
async function mYuzeyAktif(uid,aktif){
  const r=await guard(()=>api('unit_save',{id:uid,active:aktif,inactive_note:aktif?null:'Panelden elle pasife alındı'}),'Pozisyon durumu değiştirilemedi');
  if(r===null) return;
  toast(aktif?'Pozisyon aktif.':'Pozisyon pasife alındı — satışa kapalı.');
  await mdYukle(); mYuzeyAc(uid); if(document.getElementById('mdGovde')) mdYenidenCiz();
}
/* Eski (aylık) kayıt: salt okunur; yalnız yönetici silebilir. */
async function mEskiAc(bid){
  const M=ui._M||await mdYukle();
  const r=M.recs.find(x=>x.booking_id===bid); if(!r) return;
  modal(`<h3 style="margin:0 0 2px">${esc(r.unit_name||'')} · eski kayıt</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(r.mecra_name||'')} · ${esc(r.area_name||'')}</p>
    <div class="md-dl">
      <span>Ay</span><b>${esc(mdYmAdi(r.ym))}</b>
      <span>Kurum</span><b>${esc(r.customer_name||'kurum belirtilmemiş')}</b>
      <span>Durum</span><b>${r.commitment==='reserved'?'Rezerve':'Dolu'} <span class="muted">(eski aylık ızgara)</span></b>
      <span>Dönem</span><b>${r.start_date?esc(mdAralikNokta(r.start_date,r.end_date)):'<span class="muted">Kesin gün bilgisi yok</span>'}</b>
      ${r.period_note?`<span>Kaynak ifade</span><b class="mono">${esc(r.period_note)}</b>`:''}
      ${r.note?`<span>Not</span><b>${esc(r.note)}</b>`:''}
    </div>
    <p class="md-not">Bu kayıt eski aylık tablodan gelir. Kesin günü bilinmediği sürece gün uydurulmaz; yüz o ay için korumacı olarak dolu sayılır.
      Aynı kurum için kesin dönemli yerleşim oluşturulurken bu kayıt açıkça devralınabilir.</p>
    <div class="md-mf-b"><span style="flex:1"></span>
      ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="mEskiSil(${bid})">Eski kaydı sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button></div>`);
}
async function mEskiSil(bid){
  if(!(await mpConfirm('Eski aylık kayıt kalıcı olarak silinsin mi?','Eski kaydı sil'))) return;
  const r=await guard(async()=>{ const {data,error}=await sb.from('bookings').delete().eq('id',bid).select('id');
    if(error) throw error; if(!data||!data.length) throw new Error('Bu kaydı silme yetkiniz yok.'); return true; },'Silinemedi');
  if(r===null) return;
  closeModal(); toast('Eski kayıt silindi.'); await mdTazele();
}

/* ==========================================================
   DERİN BAĞLANTI (Hareketler → Mecralar, B67)
   Yalnız YAPISAL hedef okunur (entries.media_placement_id); metin
   ayrıştırma yok. Kayıt görünür alana getirilir ve vurgulanır.
   ========================================================== */
async function medyaOdak(pid){
  const M=await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid);
  if(!r){ mpAlert('Bu mecra kaydı artık yok.'); return; }
  ui._mOdak=pid;
  /* Hedef TAKVİMDE açılır (eski Bugün tablosu kaldırıldı):
       lokasyon + ürün grubu + hedef tarih penceresi + ayrıntı.
     Süzgeçler temizlenir, aksi halde hedef kayıt kendi ekranında
     süzülüp görünmez kalabilirdi. */
  const st=mdDurum();
  Object.assign(st,{site:r.mecra_id,alan:'',kurum:'',is:'',durum:'',q:'',urun:''});
  mdPencereyeAl(st,r.block_start);
  /* Ürün grubunu AÇ: kapalı grubun şeridi hiç üretilmediği için hedef
     satır aksi halde DOM'da olmazdı. */
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  if(altId!=null) st.acik={...(st.acik||{}),[mdGrupKey({id:altId})]:true};
  medyaGit(st);
}
function mdOdakUygula(){
  const pid=ui._mOdak; if(!pid) return; ui._mOdak=null;
  const M=ui._M; const r=M&&M.recs.find(x=>x.placement_id===pid); if(!r) return;
  /* Derin bağlantının açtığı grup "son ilgili grup"tur: odak şeridi
     kapatılıp başka mecraya gidildiğinde geri dönüşte yeniden kapanmasın. */
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  if(altId!=null){ const st=mdDurum(); st.acik[mdGrupKey({id:altId})]=true; mdDurumYaz(st); }
  const hedefEl=document.querySelector(`.mtl-bar[data-p="${pid}"]`)
    ||document.querySelector(`[data-p="${pid}"]`)
    ||(r.unit_id?document.querySelector(`.mtl-lane[data-u="${r.unit_id}"]`):null)
    ||document.querySelector(`[data-a="${r.alt_mecra_id}"]`);
  const esz=r.occupancy_mode==='concurrent';
  const ob=document.getElementById('mdOdak');
  if(ob) ob.innerHTML=`<div class="md-odak-b">${ic('lists',15)}
      <span><b>${esc(esz?(r.area_name||''):(r.unit_name||''))}</b> · ${esc(orgKisa(r.customer_name||'',30))} · <span class="mono">${esc(mdDonem(r))}</span>
      ${r.commitment==='cancelled'?' · <span class="md-st md-st-iptal">İptal</span>':''}</span>
      <button class="btn btn-outline btn-sm" onclick="mKayitAc(${pid})">Kaydı aç</button>
      <button class="afilt-x" onclick="this.closest('.md-odak-b').remove()" aria-label="Kapat">✕</button></div>`;
  if(hedefEl){ hedefEl.classList.add('md-odak'); setTimeout(()=>hedefEl.scrollIntoView({block:'center',inline:'center'}),40); }
  /* Derin bağlantı İLGİLİ AYRINTIYI da açar (PS9 kapanış §2). Kapatınca
     arkada vurgulanmış takvim ve odak şeridi kalır; kullanıcı kaydı
     bağlamı içinde görür. */
  setTimeout(()=>mKayitAc(pid),120);
}

/* ==========================================================
   İŞ DETAYI › Mecralar  ve  KURUM › Aktif Mecralar  (B44/B45)
   Tam medya yöneticisi kopyalanmaz: kompakt özet + Mecralarda görüntüle.
   ========================================================== */
function medyaBolumu(l,o){
  const gun=mdBugun();
  const guncel=(l||[]).filter(r=>r.commitment!=='cancelled'&&(r.block_end==null||r.block_end>=gun))
    .sort((a,b)=>String(a.block_start).localeCompare(String(b.block_start)));
  const gecmis=(l||[]).filter(r=>r.commitment!=='cancelled'&&r.block_end!=null&&r.block_end<gun).length;
  const git=o.is?`medyaGit({is:'${o.is}',kurum:'',site:null,durum:'',q:'',alan:'',urun:''})`
                :`medyaGit({kurum:'${o.kurum}',is:'',site:null,durum:'',q:'',alan:'',urun:''})`;
  if(!guncel.length) return `<p class="w-quiet" id="${o.id}"><span class="muted">${o.is?'Bu işin':'Bu kurumun'} güncel ya da yaklaşan mecra kaydı yok${gecmis?` (${gecmis} geçmiş kayıt)`:''}.</span>
      <button class="btn-link" onclick="${git}">Mecralarda görüntüle</button></p>`;
  const satir=r=>{
    const esz=r.occupancy_mode==='concurrent'; const zm=mdZamansal(r,gun);
    return `<button type="button" class="pd-row" onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
      <span class="pd-b"><span class="pd-t">${esc(esz?(r.area_name||''):`${r.unit_name||''} · ${r.area_name||''}`)}${esz?' <span class="md-tag">LED</span>':''}</span>
        <span class="pd-s">${esc(r.mecra_name||'')} · <span class="mono">${esc(mdDonem(r))}</span>${esz&&r.creative_seconds&&r.record_kind!=='legacy'?' · '+r.creative_seconds+' sn':''}${o.is?'':(r.work_title?' · '+esc(r.work_title):'')}</span></span>
      <span class="pd-r">${mdLedRozet(r,zm)}</span></button>`;
  };
  return `<div class="sec-card" id="${o.id}">
    <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">${o.baslik} <span class="chip">${guncel.length}</span></h4>
      <button class="btn btn-ghost btn-sm" onclick="${git}">Mecralarda görüntüle ›</button></div>
    ${guncel.slice(0,10).map(satir).join('')}
    ${guncel.length>10?`<p class="muted" style="font-size:12px;margin:6px 0 0">+${guncel.length-10} kayıt · Mecralarda görüntüle</p>`:''}
    ${gecmis?`<p class="muted" style="font-size:12px;margin:8px 0 0">${gecmis} geçmiş kayıt Yıl görünümünde.</p>`:''}
  </div>`;
}

/* ==========================================================
   AYLIK PROJEKSİYON SATIRLARI — temel dışa aktarım + Doluluk raporu
   AYNI üreticiyi kullanır (B49/B50). Ay hücresi bir iş kaydı değildir;
   gerçek dönem, kesinlik ve statik/LED anlamı ayrı sütunlardadır.
   ========================================================== */
function mdAylikSatirlar(M,aylar,o){
  o=o||{};
  const rows=[];
  const msira=Object.fromEntries(M.mecs.map((m,i)=>[m.id,i]));
  const kes=r=>r.record_kind==='legacy'?(r.date_precision==='month'?'Ay bazlı (eski kayıt)':r.date_precision==='open_end'?'Başlangıç kesin, bitiş bilinmiyor (eski kayıt)':'Kesin gün (eski kayıt)')
                                     :(r.end_date?'Kesin gün':'Başlangıç kesin, bitiş bilinmiyor');
  const donem=r=>r.record_kind==='legacy'&&r.date_precision==='month'?'':mdAralikNokta(r.start_date,r.end_date);
  [...M.mecs].sort((a,b)=>(msira[a.id]??99)-(msira[b.id]??99)).forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])]; const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:null,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    alanlar.forEach(a=>{
      const tur=M.pm[a.product_id]||'';
      if(mdEszamanli(a)){
        aylar.forEach(ym=>{ const ab=ym+'-01', ae=mdAySonu(ab);
          (M.byArea[a.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ae&&(r.block_end==null||r.block_end>=ab))
            .forEach(r=>rows.push({mecra:m.name,alan:a.name,poz:'',yuzey:'',tur,davranis:'LED · eşzamanlı yayın',
              ay:ym,durum:r.record_kind==='legacy'?'Eski kayıt':(r.commitment==='reserved'?'Opsiyon':'Yayında'),
              kurum:r.customer_name||'',is:r.work_title||'',donem:donem(r),kesinlik:kes(r),
              kaynak:r.period_note||r.legacy_lane||'',sure:a.creative_seconds&&r.record_kind!=='legacy'?a.creative_seconds+' sn':'',
              bosalma:'',not:r.note||'',statik:false}));
        });
        return;
      }
      (a._sahte?yetim:(M.unitsByAlt[a.id]||[])).forEach(u=>{
        const p=posParts(u.name); const yuzlu=/[\s._-][AB]$/i.test(String(u.name||''));
        aylar.forEach(ym=>{ const ab=ym+'-01', ae=mdAySonu(ab);
          const k=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ae&&(r.block_end==null||r.block_end>=ab));
          const d=k.length?(k.some(r=>r.commitment==='confirmed')?'Dolu':'Opsiyon'):(u.active===false?'Pasif':'Boş');
          const bit=k.length?k[k.length-1]:null;
          rows.push({mecra:m.name,alan:a.name,poz:yuzlu?p.base:u.name,yuzey:yuzlu?p.surf:'',tur,davranis:'Statik · münhasır',
            ay:ym,durum:d,kurum:k.map(r=>r.customer_name||'').filter(Boolean).join(' / '),
            is:k.map(r=>r.work_title||'').filter(Boolean).join(' / '),donem:k.map(donem).filter(Boolean).join(' / '),
            kesinlik:k.map(kes).join(' / '),kaynak:k.map(r=>r.period_note||'').filter(Boolean).join(' / '),sure:'',
            bosalma:bit?(bit.record_kind==='legacy'&&bit.date_precision!=='exact'?'Kesin gün bilinmiyor'
                        :bit.block_end?mdNokta(mdEkle(bit.block_end,1)):'Bitiş bilinmiyor'):'',
            not:k.map(r=>r.note||'').filter(Boolean).join(' / '),statik:true});
        });
      });
    });
  });
  return rows;
}
const MD_DISA_SUTUN=[
  {key:'mecra',label:'Mecra',w:22},{key:'alan',label:'Alan',w:22},{key:'poz',label:'Pozisyon',w:11},
  {key:'yuzey',label:'Yüz',w:6},{key:'tur',label:'Mecra türü',w:14},{key:'davranis',label:'Davranış',w:20},
  {key:'ay',label:'Ay',w:9},{key:'durum',label:'Durum',w:10},{key:'kurum',label:'Kurum',w:28},{key:'is',label:'İş',w:28},
  {key:'donem',label:'Gerçek dönem',w:24},{key:'kesinlik',label:'Kesinlik',w:24},{key:'bosalma',label:'Boşalma (statik)',w:16},
  {key:'sure',label:'Kreatif süre',w:10},{key:'kaynak',label:'Kaynak ifade / şerit',w:22},{key:'not',label:'Not',w:28}];
async function mdDisaAktar(){
  const M=ui._M||await mdYukle(); const st=mdDurum();
  const y=st.yil||new Date().getFullYear();
  const aylar=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`);
  let rows=mdAylikSatirlar(M,aylar);
  if(st.site!=null){ const ad=(M.mecById[st.site]||{}).name; rows=rows.filter(r=>r.mecra===ad); }
  if(!rows.length){ mpAlert('Aktarılacak kayıt yok.'); return; }
  await exportRows('doluluk-'+y,'Doluluk '+y,MD_DISA_SUTUN,rows,[
    ['İş dönemi',`${y} yılı · ay bazlı projeksiyon`],
    ['Kapsam',st.site!=null?((M.mecById[st.site]||{}).name||''):'Tüm mecra alanları'],
    ['Not','`Ay` bir projeksiyondur; iş kaydı değildir. Gerçek dönem ve kesinlik ayrı sütunlardadır. Ay bazlı eski kayıtlara gün uydurulmaz.'],
    ['LED','LED alanları eşzamanlı yayındır: her satır bir kampanyadır, "dolu" değildir. Kapasite / slot tanımlı değildir.']]);
}
