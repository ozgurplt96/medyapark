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
   yardımcılarını kullanır (mdModel / mdKapsam).

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
/* S11 §1 — ekibin dili:
     Opsiyon  = yüzey ayrılmış, görüşme/hazırlık sürüyor (reserved)
     Yayın    = kesinleşmiş yayın kaydı (confirmed)
     Yayında  = kesinleşmiş yayının dönemi başlamış ve sürüyor
     Planlandı= kesinleşmiş yayın, dönemi henüz başlamadı
     Bitti    = dönemi geçmiş
   Saklanan değerler (reserved/confirmed/cancelled) DEĞİŞMEDİ. Opsiyon,
   başlangıç günü geldi diye yayına DÖNÜŞMEZ; yalnız "Yayına çevir"
   eylemiyle. */
const MD_TAAHHUT={reserved:'Opsiyon',confirmed:'Yayın',cancelled:'İptal'};
const MD_KOD_ETIKET={bos:'Müsait',dolu:'Yayında',rezerve:'Opsiyonlu',yakinda:'Yakında boşalacak',
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

/* ==========================================================
   AYLIK DİLİM (S16) — Mecralar tablosu ve Raporlar › Mecra doluluk
   tablosu AYNI hesabı kullanır. Bir yüzün dönem içindeki her günü tek
   duruma bağlanır (yayın > opsiyon > müsait), ardışık aynı kayıt tek
   dilimdir; farklı kayıtlar — kesintisiz yenileme dahil — ayrı dilimdir.
   Hesap kuralları S12'den değişmedi:
     · iptal bloklamaz; opsiyon ve yayın bloklar
     · süresi dolmuş opsiyon bloklamaya DEVAM eder (yalnız işaretlenir)
     · bitişi bilinmeyen kayıt dönem sonuna kadar bloklar
     · A/B yüzleri bağımsız
   ========================================================== */
const mdDn=iso=>{ const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return Date.UTC(y,m-1,d)/864e5; };
const mdDnIso=n=>{ const d=new Date(n*864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; };
function mdGunDilim(M,u,b,e,ref){
  const B=mdDn(b),E=mdDn(e),N=E-B+1; const st=new Array(N).fill(null);
  const recs=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=e&&(r.block_end==null||r.block_end>=b));
  recs.forEach(r=>{ const s=Math.max(B,mdDn(r.block_start)), t=Math.min(E,r.block_end==null?E:mdDn(r.block_end));
    for(let i=s;i<=t;i++){ const k=i-B, cur=st[k]; if(!cur||(cur.commitment!=='confirmed'&&r.commitment==='confirmed')) st[k]=r; } });
  const seg=[]; let i=0;
  while(i<N){ const r=st[i]; let j=i; while(j+1<N&&st[j+1]===r) j++;
    seg.push({s:mdDnIso(B+i),e:mdDnIso(B+j),gun:j-i+1,r,tip:!r?'musait':r.commitment==='confirmed'?'yayin':'opsiyon',
      acikUc:!!(r&&r.block_end==null&&j===N-1),
      aylik:!!(r&&r.record_kind==='legacy'&&r.date_precision==='month'),
      opsSure:!!(r&&r.commitment==='reserved'&&r.option_expires_at&&r.option_expires_at<ref)});
    i=j+1; }
  return seg;
}
/* Seçilen dönemin ayları: kısmi ilk/son ay açıkça işaretlenir. */
function mdDonemAylari(b,e){
  const out=[]; let y=+b.slice(0,4), mo=+b.slice(5,7);
  while(`${y}-${pad(mo)}`<=e.slice(0,7)){
    const ym=`${y}-${pad(mo)}`, ayB=ym+'-01', ayE=_cIso(new Date(y,mo,0));
    const s=ayB<b?b:ayB, x=ayE>e?e:ayE, tam=s===ayB&&x===ayE;
    out.push({ym,ayB,ayE,s,e:x,tam,once:mdDn(s)-mdDn(ayB),sonra:mdDn(ayE)-mdDn(x),
      ad:`${AY_UZUN[mo-1]} ${y}`+(tam?'':` (${+s.slice(8)}–${+x.slice(8)})`),
      kisa:`${AY_KISA[mo-1]} ${y}`+(tam?'':` (${+s.slice(8)}–${+x.slice(8)})`)});
    mo++; if(mo>12){ mo=1; y++; } }
  return out;
}
/* Bir yüzün bir aydaki hücresi: ayın içine düşen dilimler (ay sınırına
   kırpılmış) + günlere oranlı renk dilimi. Dönem dışı günler 'disi'dir,
   müsait sayılmaz. Metin üretmez — ekran ve rapor kendi dilini yazar. */
function mdAyHucre(seg,ay){
  const parca=seg.filter(s=>s.s<=ay.e&&s.e>=ay.s).map(s=>{
    const s0=s.s<ay.s?ay.s:s.s, e0=s.e>ay.e?ay.e:s.e;
    return {tip:s.tip,s:s0,e:e0,gun:mdDn(e0)-mdDn(s0)+1,seg:s}; });
  const dilim=[...(ay.once?[{tip:'disi',gun:ay.once}]:[]),...parca.map(p=>({tip:p.tip,gun:p.gun})),...(ay.sonra?[{tip:'disi',gun:ay.sonra}]:[])];
  const tipler=[...new Set(parca.map(p=>p.tip))];
  return {parca,dilim,tip:tipler.length===1?tipler[0]:'karma'};
}
/* Kısa kurum adı (elle tutulan tablolardaki "WORK LOUNGE", "EKİM KOLEJİ"
   gibi): tüzel ekler atılır, sözcük sınırında en çok `max` karakter;
   yarım kalan bağlaç ve üç nokta bırakılmaz. Yalnız gösterimdir. */
function mdKisaAd(ad,max){ const w=orgKisa(ad||'',120).replace(/…$/,'').split(/\s+/).filter(Boolean); let o='';
  for(const x of w){ if(o&&(o+' '+x).length>max) break; o=o?o+' '+x:x; }
  return o.replace(/\s+(ve|VE|Ve|&|-|İLE|ile)$/,''); }
/* Tarih aralığı: aynı yılda "05.07–05.10.2026", yıl geçişinde iki tam tarih. */
const mdTrKisa=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?`${m[3]}.${m[2]}`:''; };
function mdAralikKisa(s,e){ if(!s) return ''; if(!e) return mdNokta(s)+' – bitiş bilinmiyor'; if(s===e) return mdNokta(s);
  return s.slice(0,4)===e.slice(0,4)?`${mdTrKisa(s)}–${mdNokta(e)}`:`${mdNokta(s)}–${mdNokta(e)}`; }

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
    /* Yalnız gelecekte kaydı olan yüz BUGÜN müsaittir; gelecek kayıt
       gizlenmez, alt satırda yazılır (S11 §2). */
    const nx=liste.find(r=>r.block_start>gun);
    return {kod:'bos',etiket:'Müsait',sonraki:nx||null,
      alt:nx?(nx.date_precision==='month'&&nx.record_kind==='legacy'
              ?`${mdYmAdi(nx.ym)} ay bazlı dolu`:`${mdGunDe(nx.block_start)} doluyor`):''};
  }
  /* Ardışık / örtüşen kayıtlar zincirlenir: ilk kaydın bitişi BOŞALMA
     değildir, kesintisiz yenileme ya da devam eden opsiyon varsa yüz
     dolu kalır. `zincir` = gerçek boşalmaya kadar yüzeyi tutan kayıtlar. */
  let son=cur, bit=cur.block_end; const zincir=[cur];
  for(let i=0;i<60&&bit;i++){
    const ek=liste.find(r=>r!==son&&!zincir.includes(r)&&r.block_start<=mdEkle(bit,1)&&(r.block_end==null||r.block_end>bit));
    if(!ek) break; son=ek; bit=ek.block_end; zincir.push(ek);
  }
  const kod=cur.commitment==='reserved'?'rezerve':'dolu';
  let alt='', kesin=false;
  if(bit==null) alt='Bitiş bilinmiyor';
  else if(son.record_kind==='legacy'&&son.date_precision==='month')
    alt=`${AY_UZUN[mdGun(bit).getMonth()]} sonuna kadar dolu · kesin gün yok`;
  else if(son.record_kind==='legacy'&&son.date_precision==='open_end')
    alt=`${mdYmAdi(son.ym)} kaydı · bitiş bilinmiyor`;
  else { alt=`${mdGunDe(mdEkle(bit,1))} boş`; kesin=true; }
  /* "Yakında boşalacak" (S11 §2): referans günden itibaren 30 gün içinde
     GERÇEKTEN müsait olacak — zincirin son halkasının ertesi günü. Kesin
     gün bilinmiyorsa iddia edilmez. */
  const bosalma=kesin?mdEkle(bit,1):null;
  const yakinda=kesin&&bosalma<=mdEkle(gun,MD_YAKINDA_GUN);
  /* Opsiyonun son geçerlilik tarihi REKLAM DÖNEMİ değildir. Süresi
     geçmiş opsiyon yüzü bloklamaya DEVAM eder (§8: bloklama davranışı
     sessizce değişmez); yalnız karar bekleyen kayıt olarak işaretlenir. */
  const opsSure=cur.commitment==='reserved'&&!!cur.option_expires_at&&cur.option_expires_at<gun;
  return {kod:yakinda?'yakinda':kod, taahhut:kod, bosalma, zincir,
          etiket:yakinda?'Yakında boşalacak':(kod==='rezerve'?(opsSure?'Opsiyonlu · süresi doldu':'Opsiyonlu'):'Yayında'),
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
/* S11: `durum` (''|opsiyon|yayinda|musait|yakinda) + `durumGun` (''=bugün)
   eski `tur` (kayıt türü) seçicisinin yerini aldı. Eski oturumlardaki
   `tur` değeri durum'a çevrilir. */
const MD_DEF={site:null,alan:'',kurum:'',is:'',q:'',yil:null,
              olcek:12,ank:null,gecmisGizle:false,urun:'',durum:'',durumGun:'',msBas:'',msBit:''};
function mdDurum(){ let d={}; try{ d=JSON.parse(sessionStorage.getItem('mp_medya')||'{}')||{}; }catch(e){}
  /* `acik` her çağrıda YENİ nesne: paylaşılan bir varsayılanı mutasyona
     açmak oturum boyunca sızan durum yaratırdı. */
  const o={...MD_DEF,...d,acik:(d.acik&&typeof d.acik==='object'&&!Array.isArray(d.acik))?{...d.acik}:{}};
  /* Önceki sürümün yarım girişten yazdığı ("0002-09-21") ya da ters sıralı
     arama durumu UYGULANMIŞ arama sayılmaz; sessizce düşürülür. */
  if(o.msBas||o.msBit){
    if(mdTarihDogrula(o.msBas).hata||mdTarihDogrula(o.msBit).hata||o.msBas>o.msBit){ o.msBas=''; o.msBit=''; }
  }
  if(o.tur){ if(!o.durum) o.durum=o.tur==='reserved'?'opsiyon':o.tur==='confirmed'?'yayinda':''; delete o.tur; }
  if(!MD_DURUM.some(x=>x[0]===o.durum)) o.durum='';
  /* Aralık yalnız "Müsait" durumuna aittir. */
  if(o.msBas&&o.msBit) o.durum='musait';
  if(o.durumGun&&mdTarihDogrula(o.durumGun).hata) o.durumGun='';
  /* Uyumluluk: eski oturum durumunda ya da eski bir derin bağlantıda
     kalmış `gor` anahtarı düşürülür. Yönlendirme sessizdir; kullanıcı
     kaldırılmış tabloya GÖTÜRÜLMEZ. */
  delete o.gor;
  return o; }
function mdDurumYaz(d){ const o={...d}; delete o.gor;
  try{ sessionStorage.setItem('mp_medya',JSON.stringify(o)); }catch(e){}
  if(typeof navUrlTazele==='function') navUrlTazele(); }   /* S14: lokasyon/grup/dönem adreste */

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
let _mdLeg={};

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
      <button class="btn btn-ghost btn-sm" onclick="mdRaporAc()" title="Aylık doluluk tablosu (Excel, PDF)">${ic('download',15)} Doluluk tablosu</button>
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
        <select class="inp ${st.kurum?'inp-on':''}" id="mdKurum" data-ara onchange="mdSet({kurum:this.value,site:this.value?null:mdDurum().site})" aria-label="Kurum">
          <option value="">Tüm kurumlar</option>
          ${kurumOpt.map(k=>`<option value="${k.id}" ${String(st.kurum)===String(k.id)?'selected':''}>${esc(orgKisa(k.ad,40))}</option>`).join('')}</select>
        <select class="inp ${st.is?'inp-on':''}" id="mdIs" onchange="mdSet({is:this.value,site:this.value?null:mdDurum().site})" aria-label="İş">
          <option value="">Tüm işler</option>
          ${isOpt.map(k=>`<option value="${k.id}" ${String(st.is)===String(k.id)?'selected':''}>${esc(k.ad)}</option>`).join('')}</select>
        <select class="inp ${st.urun?'inp-on':''}" id="mdUrun" onchange="mdSet({urun:this.value})" aria-label="Mecra türü">
          <option value="">Tüm mecra türleri</option>
          ${urunOpt.map(p=>`<option value="${p.id}" ${String(st.urun)===String(p.id)?'selected':''}>${esc(p.ad)} (${p.n})</option>`).join('')}</select>
      </div>
      <div class="md-durum-row">
        <div class="md-seg" role="radiogroup" aria-label="Durum">
          ${MD_DURUM.map(([k,l])=>{ const on=(st.durum||'')===k;
            return `<button type="button" role="radio" aria-checked="${on}" class="${on?'on':''}" onclick="mdDurumSec('${k}')">${on?'<span aria-hidden="true">✓ </span>':''}${esc(l)}</button>`; }).join('')}
        </div>
        <label class="md-rgun"><span>Durum tarihi</span>
          <input class="inp inp-sm" type="date" id="mdRefGun" value="${esc(mdRefGun(st))}" min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}"
            onchange="mdRefGunSec(this)" aria-describedby="mdRefNot"></label>
        <span class="md-rgun-n" id="mdRefNot">${st.durumGun?`<b>${esc(mdKisa(mdRefGun(st),true))}</b> esas alınıyor · <button type="button" class="btn-link" onclick="mdSet({durumGun:''})">Bugüne dön</button>`
          :`Bugün (${esc(mdKisa(mdBugun(),true))}) esas alınıyor`}</span>
        <p class="md-ms-hata" id="mdRefHata" role="alert" hidden></p>
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
/* Tablonun yapışkan sol sütunlarının genişliği: yatay kaydırmada hedef
   bunların ARKASINDA kalmamalı. */
function mdSabitGen(w){ return [...w.querySelectorAll('thead th.mtb-pano, thead th.mtb-yz, thead th.mtb-kmp')].reduce((t,x)=>t+x.offsetWidth,0); }
/* Hedef öğeyi (ay başlığı ya da kayıt bloğu) kendi tablosunda yatayda
   görünür alana alır; sayfayı yalnız gerekirse dikeyde kaydırır. */
function mdYataydaGoster(el,ortala){
  const w=el&&el.closest('.mtb-wrap'); if(!w) return;
  const wb=w.getBoundingClientRect(), eb=el.getBoundingClientRect(), sabit=mdSabitGen(w);
  const x=eb.left-wb.left+w.scrollLeft;
  const gorunur=x>=w.scrollLeft+sabit&&x+eb.width<=w.scrollLeft+w.clientWidth;
  if(!gorunur) w.scrollTo({left:Math.max(0,ortala?x-sabit-(w.clientWidth-sabit-eb.width)/2:x-sabit-12),behavior:mdHareketAz()?'auto':'smooth'});
}
function mdBugunGoster(){
  const basliklar=[...document.querySelectorAll('#mdGovde th.mtb-ay.bu')];
  basliklar.forEach(th=>mdYataydaGoster(th,true));
  const ilk=basliklar[0];
  if(ilk){
    const r=ilk.getBoundingClientRect();
    if(r.bottom<0||r.top>window.innerHeight) ilk.scrollIntoView({block:'center',behavior:mdHareketAz()?'auto':'smooth'});
  }
  const hepsi=document.querySelectorAll('#mdGovde th.mtb-ay.bu, #mdGovde .mtb-bugun');
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
function mdTemizle(){ mdDurumYaz({...mdDurum(),kurum:'',is:'',q:'',alan:'',urun:'',durum:'',msBas:'',msBit:''}); mdYenidenCiz(); }

/* Aktif filtre şeridi (S2 `.afilt` konvansiyonu) */
function mdAfiltCiz(M,st){
  const box=document.getElementById('mdAfilt'); if(!box) return;
  const p=[];
  if(st.kurum) p.push(['Kurum',orgKisa(M.cmap[st.kurum]||('#'+st.kurum),40),'kurum']);
  if(st.is) p.push(['İş',(M.jmap[st.is]||{}).title||('#'+st.is),'is']);
  if(st.alan) p.push(['Alan',(M.altById[st.alan]||{}).name||'','alan']);
  if(st.urun) p.push(['Mecra türü',M.pm[st.urun]||('#'+st.urun),'urun']);
  const ms=mdMsAralik(st);
  if(st.durum) p.push(['Durum',mdDurumAd(st.durum)+(ms?` · ${mdMsAd(ms)}`:` · ${mdKisa(mdRefGun(st),true)}`),'durum']);
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
  if(k==='ms'||k==='durum'){ y.msBas=''; y.msBit=''; if(k==='durum') y.durum=''; } else y[k]='';
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
  _mdLeg={};
  _mdMsBant=mdMsAralik(st);
  /* Müsaitlik araması bir YÜZEY sorusudur: kurum/iş bağlam kesitine
     değil, seçili mecranın (ya da tüm mecraların) yüzey takvimine çizilir. */
  if(st.durum&&(st.site!=null||mdFiltreli(st))) box.innerHTML=mdYilCiz(M,st,{kurum:st.kurum,is:st.is});
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
/* Kaydın durumu: tür (Opsiyon/Yayın) × zaman (başlamadı/sürüyor/bitti).
   Gelecekte başlayacak yayın "Yayında" DEĞİLDİR → "Planlandı". Statik
   ve LED aynı kuralı kullanır. */
function mdKayitDurumAd(r,zm){
  if(r.commitment==='cancelled') return 'İptal';
  if(r.commitment==='reserved') return zm==='bitti'?'Opsiyon · dönemi geçti':zm==='yaklasan'?'Opsiyon · başlamadı':'Opsiyon';
  return zm==='bitti'?'Bitti':zm==='yaklasan'?'Planlandı':'Yayında';
}
function mdKayitRozet(r,zm){
  if(r.commitment==='cancelled') return '<span class="md-st md-st-iptal">İptal</span>';
  if(r.record_kind==='legacy'&&r.date_precision==='month') return '<span class="md-st md-st-eski">Eski · ay bazlı</span>';
  const ad=mdKayitDurumAd(r,zm);
  const cls=zm==='bitti'?'eski':r.commitment==='reserved'?'rezerve':zm==='yaklasan'?'plan':'yayin';
  return `<span class="md-st md-st-${cls}">${esc(ad)}</span>`;
}
function mdLedRozet(r,zm){ return mdKayitRozet(r,zm); }
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
    const ozet=[yuz?`${dolu} yayında`:'',opsiyon?`${opsiyon} opsiyonlu`:'',yuz?`${bos} müsait`:'',
      yakinda?`<span class="md-yk">${yakinda} yakında boşalacak</span>`:'',
      led?(ledA?`${ledA} LED kampanyası yayında`:'LED yayını yok'):''].filter(Boolean).join(' · ');
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
  const st={...mdDurum(),msBas:b.v,msBit:e.v,durum:'musait'};
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
/* Aralığı temizlemek "Müsait" durumunu bırakır; artık durum tarihi esas
   alınır ve özet bunu açıkça yazar. */
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
function mdMusaitHesap(M,st,ms){ return mdDurumHesap(M,{...st,durum:'musait',msBas:ms.bas,msBit:ms.bit}); }

/* ==========================================================
   DURUM SÜZGECİ (S11 §2) — TEK hesap
   Dört seçenek aynı tür veri DEĞİLDİR:
     Opsiyonlu / Yayında  → KAYIT durumu (referans gününü kapsayan,
                            iptal edilmemiş opsiyon / yayın)
     Müsait / Yakında boşalacak → YÜZEY durumu (statik yüzler)
   Sayaç, görünen satırlar, vurgular ve seçilebilir yüzler BURADAN
   beslenir; ikinci bir hesap yoktur. Referans gün varsayılan bugündür
   ve takvimde gezinmek onu DEĞİŞTİRMEZ (`st.durumGun`).
   Müsait: müsaitlik aralığı uygulanmışsa aralığın TAMAMI, değilse
   referans gün. Kurum / iş süzgeci başka müşterinin engelleyici kaydını
   yüzey hesabından çıkaramaz. LED'e statik yüzey hesabı UYGULANMAZ.
   ========================================================== */
const MD_DURUM=[['','Tümü'],['opsiyon','Opsiyonlu'],['yayinda','Yayında'],['musait','Müsait'],['yakinda','Yakında boşalacak']];
const MD_YAKINDA_GUN=30;
const mdDurumAd=k=>(MD_DURUM.find(x=>x[0]===k)||[0,''])[1];
function mdRefGun(st){ return (st&&st.durumGun&&!mdTarihDogrula(st.durumGun).hata)?st.durumGun:mdBugun(); }
function mdKayitKey(r){ return r.placement_id?'p'+r.placement_id:'b'+r.booking_id; }
function mdDurumHesap(M,st,filtre){
  const d=st.durum; if(!d) return null;
  filtre=filtre||{};
  const ref=mdRefGun(st);
  const ms=d==='musait'?mdMsAralik(st):null;
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const out={durum:d,ref,ms,tip:(d==='musait'||d==='yakinda')?'yuzey':'kayit',
    set:new Set(),kayit:new Set(),bosalma:{},toplam:0,kayitSay:0,ledSay:0,opsSure:0,
    hata:!Array.isArray(M.recs)||!!M.recsHata};
  if(out.hata) return out;
  /* Kayıt süzgeçlerinde kurum / iş / arama bir KAYIT koşuludur. */
  const kOk=r=>(!filtre.kurum||String(r.customer_id)===String(filtre.kurum))
             &&(!filtre.is||String(r.work_id)===String(filtre.is));
  const kayitEslesir=r=>r.commitment!=='cancelled'&&mdKapsarMi(r,ref)
    &&(d==='opsiyon'?r.commitment==='reserved':r.commitment!=='reserved')&&kOk(r);
  const siteler=st.site!=null?[M.mecById[st.site]].filter(mdKapsamda):M.mecs.filter(mdKapsamda);
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(a=>!mdArsiv(a));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    alanlar.filter(a=>mdAlanGecer(M,a,st)).forEach(a=>{
      if(mdEszamanli(a)){
        /* LED: yalnız kampanya bazında Opsiyonlu / Yayında. */
        if(out.tip!=='kayit') return;
        (M.byArea[a.id]||[]).filter(kayitEslesir).filter(r=>!q||mdAraEslesir(M,r,q))
          .forEach(r=>{ out.kayit.add(mdKayitKey(r)); out.ledSay++; });
        return;
      }
      (a._sahte?yetim:(M.unitsByAlt[a.id]||[])).filter(u=>u.active!==false).forEach(u=>{
        const adUyar=!q||[u.name,a.name,m.name,mdAile(M,a)].some(v=>String(v||'').toLocaleLowerCase('tr').includes(q));
        if(out.tip==='yuzey'){
          if(!adUyar) return;
          out.toplam++;
          if(d==='musait'){ if(mdMusaitMi(M,u,ms||{bas:ref,bit:ref})) out.set.add(u.id); return; }
          const ds=mdYuzeyDurum(M,u,ref);
          if(ds.kod==='yakinda'){ out.set.add(u.id); out.bosalma[u.id]=ds.bosalma;
            (ds.zincir||[]).forEach(r=>out.kayit.add(mdKayitKey(r))); }
          return;
        }
        out.toplam++;
        const l=(M.byUnit[u.id]||[]).filter(kayitEslesir).filter(r=>adUyar||mdAraEslesir(M,r,q));
        if(!l.length) return;
        out.set.add(u.id);
        l.forEach(r=>{ out.kayit.add(mdKayitKey(r)); out.kayitSay++;
          if(r.commitment==='reserved'&&r.option_expires_at&&r.option_expires_at<ref) out.opsSure++; });
      });
    });
  });
  return out;
}
/* Referans gün seçimi: yarım/geçersiz tarih UYGULANMAZ (S10 §1 kuralı). */
function mdRefGunSec(el){
  const h=document.getElementById('mdRefHata');
  if(!el.value&&el.validity&&el.validity.badInput){ if(h){ h.textContent='Durum tarihi eksik yazıldı.'; h.hidden=false; } return; }
  const v=el.value?mdTarihDogrula(el.value,'Durum tarihi'):{ok:true};
  if(v.hata){ if(h){ h.textContent=v.hata; h.hidden=false; } return; }
  if(h){ h.hidden=true; h.textContent=''; }
  mdSet({durumGun:(el.value&&el.value!==mdBugun())?el.value:''});
}
/* Durum seçimi. Müsaitlik aralığı YALNIZ "Müsait" durumuna aittir;
   başka durum seçilirse aralık KALDIRILIR ve bu açıkça söylenir —
   sessizce anlamsız bir kesişim üretilmez. */
function mdDurumSec(k){
  const st=mdDurum();
  const y={durum:k};
  if(k!=='musait'&&mdMsAralik(st)){ y.msBas=''; y.msBit='';
    ui._mdNot=`Müsaitlik araması (${mdMsAd(mdMsAralik(st))}) kaldırıldı: “${mdDurumAd(k)||'Tümü'}” bir tarih aralığı değil, durum tarihini kullanır.`; }
  mdSet(y);
}
function mdRefGunGit(){ const st=mdDurum(); mdPencereyeAl(st,mdRefGun(st)); mdDurumYaz(st); mdYenidenCiz(); }

function mdYilCiz(M,st,filtre){
  filtre=filtre||{};
  const ek=mdEksen(st);
  const msAralik=mdMsAralik(st);
  /* S11: durum süzgeci TEK hesaptan (mdDurumHesap). Sayaç, satırlar,
     vurgular ve seçilebilir yüzler aynı kümeyi kullanır. */
  const DH=mdDurumHesap(M,st,filtre);
  /* Veri okunamadıysa "hepsi müsait" sonucuna DÜŞÜLMEZ (S10 §1). */
  if(DH&&DH.hata) return `<div class="md-ms-ozet hata" role="alert"><b>Durum hesaplanamadı</b>
      <span>Doluluk kayıtları okunamadı; sonuç gösterilmiyor. Sayfayı yenileyip tekrar deneyin.</span></div>`;
  const gun=mdBugun();
  const yb=ek.bas, ye=ek.bit;
  const siteler=st.site!=null?[M.mecById[st.site]].filter(Boolean):M.mecs.filter(mdKapsamda);
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const kFiltre=r=>(!filtre.kurum||String(r.customer_id)===String(filtre.kurum))
                 &&(!filtre.is||String(r.work_id)===String(filtre.is))
                 &&(!q||mdAraEslesir(M,r,q));
  /* Kurum/İş bağlamında ve süzgeç açıkken gruplar açık gelir; serbest
     görünümde ağır matris yalnız AÇIK grup için üretilir (S8.1 §14). */
  const daralt=!!(filtre.kurum||filtre.is||q)||!!DH;
  let html='', ledGizli=0;
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
        /* LED: statik yüzey müsaitliği / "yakında boşalacak" UYGULANMAZ
           (kapasite tanımlı değil). Opsiyonlu / Yayında kampanya bazında. */
        if(DH&&DH.tip==='yuzey'){ ledGizli++; return; }
        let l=(M.byArea[a.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb)).filter(kFiltre);
        if(DH) l=l.filter(r=>DH.kayit.has(mdKayitKey(r)));
        if(!l.length&&daralt) return;
        ic_+=mdLedZaman(M,a,l,ek,acik,DH); return;
      }
      const us=a._sahte?yetim:(M.unitsByAlt[a.id]||[]);
      const kayitlar=u=>(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'
          &&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb));
      let satirlar;
      if(DH){
        /* Eşleşen yüzler DH.set'ten; kayıt süzgecinde kurum/iş kayıt
           koşuludur, yüzey süzgecinde (müsait / yakında) yüzey kümesini
           DARALTMAZ. */
        satirlar=us.filter(u=>DH.set.has(u.id)).map(u=>({u,l:kayitlar(u)}));
      } else {
        satirlar=us.map(u=>({u,l:kayitlar(u)}))
          .filter(x=>!daralt||x.l.some(kFiltre)||(q&&String(x.u.name).toLocaleLowerCase('tr').includes(q)));
      }
      if(!satirlar.length) return;
      ic_+=mdStatikZaman(M,a,satirlar,ek,DH?(()=>true):kFiltre,DH?{}:filtre,acik,{dh:DH,ms:msAralik});
    });
    if(!ic_) return;
    html+=`<div class="md-yil-site"><h3 class="md-yil-t">${esc(m.name)}</h3>${ic_}</div>`;
  });
  const ozet=DH?mdDurumOzet(M,st,DH,ek,ledGizli):'';
  if(!html){
    /* Gerçekten boş sonuç gösterilir; ilgisiz satırlar GERİ GETİRİLMEZ. */
    const bos=DH?({opsiyon:'Bu durum tarihinde opsiyonlu kayıt yok.',yayinda:'Bu durum tarihinde yayında kayıt yok.',
        musait:DH.ms?'Seçilen dönemin tamamında müsait statik yüzey yok.':'Bu durum tarihinde müsait statik yüzey yok.',
        yakinda:`Önümüzdeki ${MD_YAKINDA_GUN} gün içinde boşalacak statik yüzey yok.`})[DH.durum]
      :`${mdEksenAdi(ek)} için bu kapsamda kayıt yok.`;
    return ozet+`<div class="sec-card"><p class="empty">${esc(bos)}</p></div>`;
  }
  return ozet+html;
}
/* Durum özeti: referans tarih ve PAYDA açıkça yazılır. Payda statik YÜZ
   sayısıdır (fiziksel pano ile karıştırılmaz); LED ayrı söylenir. */
function mdDurumOzet(M,st,DH,ek,ledGizli){
  const ref=DH.ref, refAd=esc(mdKisa(ref,true));
  const not=ui._mdNot?`<div class="md-ms-uyari">${esc(ui._mdNot)}</div>`:''; ui._mdNot=null;
  let bas='', alt='';
  if(DH.durum==='musait'){
    bas=DH.ms?`<b>${esc(mdMsAd(DH.ms))}</b> aralığının tamamı için <b>${DH.toplam} yüzeyden ${DH.set.size} tanesi müsait</b>`
             :`Durum tarihi <b>${refAd}</b>: <b>${DH.toplam} yüzeyden ${DH.set.size} tanesi müsait</b>`;
    alt=DH.ms?'Aralığın herhangi bir gününde yayın ya da opsiyonu olan yüz sayılmaz.'
             :'O gün yüzeyi engelleyen yayın ya da opsiyon yok. Bir dönem için aşağıdaki müsaitlik aramasını kullanın.';
  } else if(DH.durum==='yakinda'){
    bas=`Durum tarihi <b>${refAd}</b>: <b>${DH.set.size} yüzey ${MD_YAKINDA_GUN} gün içinde boşalacak</b> (${esc(mdKisa(mdEkle(ref,MD_YAKINDA_GUN),true))} dahil)`;
    alt='Kesintisiz yenileme ya da devam eden opsiyon varsa boşalma günü zincirin sonudur. Yüzey satırında gerçek boşalma günü yazar.';
  } else {
    const ne=DH.durum==='opsiyon'?'opsiyonlu':'yayında';
    bas=`Durum tarihi <b>${refAd}</b>: <b>${DH.set.size} yüzey ${ne}</b> (${DH.kayitSay} kayıt)`
      +(DH.ledSay?` · <b>${DH.ledSay} LED kampanyası ${ne}</b>`:'');
    if(DH.durum==='opsiyon'&&DH.opsSure) alt=`<span class="md-yk">${DH.opsSure} opsiyonun geçerlilik süresi dolmuş — yüzeyi bloklamaya devam ediyor, karar bekliyor.</span>`;
  }
  const kayitSuzgec=DH.tip==='yuzey'?[st.kurum&&'kurum',st.is&&'iş'].filter(Boolean):[];
  const refGorunur=ref>=ek.bas&&ref<=ek.bit;
  const msGorunur=!DH.ms||(DH.ms.bas<=ek.bit&&DH.ms.bit>=ek.bas);
  return `<div class="md-ms-ozet md-dz-${DH.durum}" role="status">${not}<div>${bas}</div>
    ${alt?`<div class="muted">${alt}</div>`:''}
    ${kayitSuzgec.length?`<div class="muted">${esc(kayitSuzgec.join(', '))} süzgeci yüzey durumunu daraltmaz — başka müşterilerin kayıtları da yüzeyi bloklar.</div>`:''}
    ${ledGizli?`<div class="muted">LED alanları eşzamanlıdır; “${esc(mdDurumAd(DH.durum))}” statik yüzeylere aittir ve LED için hesaplanmaz.</div>`:''}
    ${!msGorunur?`<div class="md-ms-uyari">Takvim şu an aranan dönemi göstermiyor; sonuç aranan dönem içindir.
        <button type="button" class="btn-link" onclick="mdMsDonemeGit()">Aranan döneme git</button> ·
        <button type="button" class="btn-link" onclick="mdMsTemizle()">Bugüne dönmek için müsaitlik aramasını temizle</button></div>`
      :(!DH.ms&&!refGorunur)?`<div class="md-ms-uyari">Durum tarihi (${refAd}) takvimin gösterdiği dönemin dışında.
        <button type="button" class="btn-link" onclick="mdRefGunGit()">Durum tarihine git</button></div>`:''}</div>`;
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
  const L=_mdLeg, p=[];
  const sw=(t,ek)=>`<i class="sw mtb-sw t-${t}${ek?' '+ek:''}"></i>`;
  if(L.ab) p.push('<span class="lg-surf"><b>A</b> Ön yüz</span><span class="lg-surf"><b>B</b> Arka yüz</span><span class="lg-sep"></span>');
  if(L.yayin) p.push(`<span>${sw('yayin')}Yayında</span>`);
  if(L.plan) p.push(`<span>${sw('yayin','plan')}Planlandı · yayın henüz başlamadı</span>`);
  if(L.ops) p.push(`<span>${sw('opsiyon')}Opsiyon</span>`);
  if(L.musait) p.push(`<span>${sw('musait')}Müsait · tıklayınca kayıt formu açılır</span>`);
  if(L.gecmis) p.push(`<span>${sw('yayin','gecmis')}Bitti (açık zemin)</span>`);
  if(L.sur) p.push('<span><b class="mtb-uy">⚠</b> Opsiyon süresi doldu — yüzeyi bloklamaya devam eder</span>');
  if(L.soluk) p.push(`<span>${sw('yayin','soluk')}Süzgeç dışı kayıt — yüzeyi yine bloklar</span>`);
  if(L.bugun) p.push('<span><i class="sw mtb-sw-bugun"></i>Bugün</span>');
  if(L.ref) p.push('<span><i class="sw ref"></i>Durum tarihi</span>');
  if(L.ms) p.push('<span><i class="sw mtb-sw-ms"></i>Aranan müsaitlik dönemi</span>');
  if(!p.length) return '';
  return `<div class="rg-legend">${p.join('')}<span class="lg-not">Ay içinde değişen hücrede her kayıt kendi bloğu ve tarihiyle alt alta; üstteki şerit günlere göre bölünür.</span></div>`;
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

/* ==========================================================
   AYLIK YÖNETİM TABLOSU (S16) — Mecralar'ın ANA görünümü
   Beğenilen S15 doluluk Excel'inin mantığı yönetim ekranına taşındı:
   pano/pozisyon ve yüz solda sabit, aylar sütunlarda, A/B aynı pano
   altında alt alta, her kayıt okunur kurum adı + durum + kesin tarihle.
   İnce zaman çubukları KALDIRILDI; ikinci bir ana görünüm yoktur.

   Hesap Raporlar › Mecra doluluk tablosu ile AYNIDIR (mdGunDilim /
   mdDonemAylari / mdAyHucre). Ekran yalnız dilimleri kendi diliyle
   yazar ve tıklanabilir yapar:
     · ayın tamamı tek durumdaysa bütün hücre o durumdur
     · ay içinde değişiklik varsa her dilim kendi renkli bloğu ve
       tarihiyle alt alta; karma ay tamamen dolu/müsait boyanmaz
     · gelecekteki kesin yayın "Planlandı" yazar, "Yayında" değil
     · süresi dolmuş opsiyon bloklamaya devam eder ve uyarı taşır
     · kesintisiz yenileme ayrı kayıtlar olarak ayrı bloktur
   Tıklama YAZMAZ: kayıt bloğu ayrıntıyı, müsait dilim yüzeyi ve dilimin
   tarihleri hazır gelen formu açar; veri Kaydet ile işlenir.
   ========================================================== */
/* S15 şablon renkleri — Excel, PDF, önizleme ve bu ekran AYNI tonlar. */
const MD_RENK={
  yayin:  {fill:'#F4C4BE', ink:'#7F1A10', bar:'#D24A3C'},
  opsiyon:{fill:'#FAD6A0', ink:'#6E3D00', bar:'#E38B12'},
  musait: {fill:'#CBEAD2', ink:'#155A2A', bar:'#3AA35A'},
  disi:   {fill:'#E4E4E8', ink:'#5E5E64', bar:'#BDBDC3'}};
/* Ay sütunu genişliği: yıl görünümü de okunur kalır, tablo kendi içinde kayar. */
const MD_AY_GEN={3:250,6:200,12:170};
const MD_PANO_GEN=118, MD_YUZ_GEN=40, MD_KMP_GEN=230;
function mdCssSerit(dilim){ const top=dilim.reduce((t,d)=>t+d.gun,0)||1; let x=0;
  return `linear-gradient(90deg,${dilim.map(d=>{ const a=x/top*100; x+=d.gun; const b=x/top*100;
    return `${MD_RENK[d.tip].bar} ${a.toFixed(2)}% ${b.toFixed(2)}%`; }).join(',')})`; }

/* Ay sütunlarındaki işaretler — bugün (mavi çizgi), durum tarihi (kesikli
   gri), uygulanmış müsaitlik araması (yeşil bant). Üçü farklı biçimdedir;
   renk tek taşıyıcı değildir, başlıkta metinle de yazılır. */
function mdAyIsaret(ay,baslik){
  const st=mdDurum(), gun=mdBugun(), n=mdDn(ay.ayE)-mdDn(ay.ayB)+1;
  const yuzde=iso=>((mdDn(iso)-mdDn(ay.ayB)+0.5)/n*100).toFixed(2);
  let h='';
  const ms=_mdMsBant;
  if(ms&&ms.bas<=ay.ayE&&ms.bit>=ay.ayB){
    const b=ms.bas<ay.ayB?ay.ayB:ms.bas, e=ms.bit>ay.ayE?ay.ayE:ms.bit;
    const sol=(mdDn(b)-mdDn(ay.ayB))/n*100, gen=(mdDn(e)-mdDn(b)+1)/n*100;
    _mdLeg.ms=true;
    h+=`<span class="mtb-ms${baslik?' b':''}" style="left:${sol.toFixed(2)}%;width:${gen.toFixed(2)}%" aria-hidden="true"></span>`;
  }
  if(st.durum&&st.durumGun){ const ref=mdRefGun(st);
    if(ref>=ay.ayB&&ref<=ay.ayE){ _mdLeg.ref=true;
      h+=`<span class="mtb-ref${baslik?' b':''}" style="left:${yuzde(ref)}%" aria-hidden="true">${baslik?'<i>Durum</i>':''}</span>`; } }
  if(gun>=ay.ayB&&gun<=ay.ayE){ _mdLeg.bugun=true;
    h+=`<span class="mtb-bugun${baslik?' b':''}" style="left:${yuzde(gun)}%" aria-hidden="true"></span>`; }
  return h;
}
function mdTabloBas(ek,aylar,ilk){
  const buYm=mdYm(mdBugun());
  return `<thead><tr>${ilk}
    ${aylar.map(ay=>`<th scope="col" class="mtb-ay${ay.ym===buYm?' bu':''}" data-ym="${ay.ym}">
      <span class="mtb-ay-t">${esc(AY_UZUN[+ay.ym.slice(5,7)-1])} <em>${esc(ay.ym.slice(0,4))}</em></span>${ay.ym===buYm?`<i class="mtb-bu-e">Bugün ${+mdBugun().slice(8)}</i>`:''}${mdAyIsaret(ay,true)}</th>`).join('')}
  </tr></thead>`;
}
function mdTabloAc(ek,sabitGen,sinif){
  const ag=MD_AY_GEN[ek.n]||MD_AY_GEN[12];
  return `<div class="mtb-wrap"><table class="mtb ${sinif||''}" style="min-width:${sabitGen+ek.aylar.length*ag}px">`;
}
/* Kaydın hücre metni: kurum (yoksa iş), durum ve KESİN dönem. Dönem
   kaydın tamamıdır (Excel'deki gibi); kesinliği bilinmeyen gün yazılmaz. */
function mdKayitMetin(r,gun){
  const zm=mdZamansal(r,gun);
  const kim=r.customer_name?mdKisaAd(r.customer_name,26):(r.work_title?mdKisaAd(r.work_title,26):'');
  const donem=r.record_kind==='legacy'&&r.date_precision==='month'?`${mdYmAdi(r.ym)} · ay bazlı`
    :r.record_kind==='legacy'&&r.date_precision==='open_end'?`${mdNokta(r.start_date)} – bitiş bilinmiyor`
    :mdAralikKisa(r.start_date,r.end_date);
  return {zm,kim,durum:mdKayitDurumAd(r,zm),donem,
    sur:r.commitment==='reserved'&&!!r.option_expires_at&&r.option_expires_at<gun};
}
/* Bir kayıt ya da müsait dilim bloğu. */
function mdBlok(M,u,p,ay,o,tek){
  const gun=o.gun;
  if(p.tip==='musait'){
    const tamAy=p.s===ay.ayB&&p.e===ay.ayE;
    const aralik=tamAy?`1–${+ay.ayE.slice(8)} ${AY_UZUN[+ay.ym.slice(5,7)-1]}`:`${mdTrKisa(p.s)}–${mdTrKisa(p.e)}`;
    _mdLeg.musait=true;
    const vurgu=o.musait?' vurgu':'';
    return `<button type="button" class="mtb-b t-musait${tek?' tek':''}${vurgu}" data-s="${p.s}" data-e="${p.e}"
      aria-label="${esc(`${u.name} · Müsait · ${aralik} — kayıt eklemek için açın`)}" title="${esc(`${u.name} · müsait ${aralik} · kayıt ekle`)}"
      onclick="mdBosAc(${u.id},'${p.s}','${p.e}')"><b>Müsait${tamAy?'':` <span class="mtb-t">${esc(`${mdTrKisa(p.s)}–${mdTrKisa(p.e)}`)}</span>`}</b></button>`;
  }
  const r=p.seg.r, k=mdKayitMetin(r,gun);
  const gecmis=k.zm==='bitti', plan=k.zm==='yaklasan'&&r.commitment!=='reserved';
  if(r.commitment==='reserved') _mdLeg.ops=true; else if(gecmis) _mdLeg.gecmis=true; else if(plan) _mdLeg.plan=true; else _mdLeg.yayin=true;
  if(k.sur) _mdLeg.sur=true;
  const ikincil=(o.eslesir&&!o.eslesir(r))||(o.ikincil&&o.ikincil(r));
  if(ikincil) _mdLeg.soluk=true;
  const vurgu=o.vurgula&&o.vurgula(r);
  const baslik=[r.customer_name,k.durum,k.donem,r.work_title].filter(Boolean).join(' · ');
  return `<button type="button" class="mtb-b t-${p.tip}${tek?' tek':''}${gecmis?' gecmis':''}${plan?' plan':''}${k.sur?' sur':''}${ikincil?' soluk':''}${vurgu?' vurgu':''}"
    ${r.placement_id?`data-p="${r.placement_id}"`:`data-b="${r.booking_id}"`} title="${esc(baslik)}"
    aria-label="${esc(`${u.name} · ${baslik}${ikincil?' · süzgeç dışı kayıt, yüzeyi yine de bloklar':''}`)}"
    onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
    ${k.kim?`<b>${esc(k.kim)}</b>`:''}<span>${k.kim?`<i>${esc(k.durum)}</i> · `:`<i class="yalniz">${esc(k.durum)}</i> · `}${esc(k.donem)}</span>
    ${k.sur?`<em class="mtb-uy">⚠ Opsiyon süresi doldu</em>`:''}</button>`;
}
function mdYuzHucre(M,u,hc,ay,o){
  const isaret=mdAyIsaret(ay,false);
  if(!u||u.active===false) return `<td class="mtb-c pasif">${u?'<span>Pasif · satışa kapalı</span>':''}${isaret}</td>`;
  const tek=hc.parca.length===1&&hc.dilim.length===1;
  if(tek) return `<td class="mtb-c tek">${mdBlok(M,u,hc.parca[0],ay,o,true)}${isaret}</td>`;
  return `<td class="mtb-c karma"><div class="mtb-serit" style="background:${mdCssSerit(hc.dilim)}" aria-hidden="true"></div>
    <div class="mtb-bl">${hc.parca.map(p=>mdBlok(M,u,p,ay,o,false)).join('')}</div>${isaret}</td>`;
}
/* Müsait dilime tıklama: yüzey + dilimin başlangıç/bitişi hazır gelen
   form. Tarihler değiştirilebilir; kayıt anındaki çakışma denetimi
   (media_placements_create) aynen geçerlidir. */
function mdBosAc(uid,bas,bit){ mForm({hedefler:[{unit_id:uid}],taah:'reserved',bas,bit}); }

function mdStatikZaman(M,a,satirlar,ek,kFiltre,filtre,acik,o){
  o=o||{};
  const urun=M.pm[a.product_id]||'';
  const key=mdGrupKey(a);
  const kayitSay=satirlar.reduce((n,x)=>n+x.l.length,0);
  const dh=o.dh||null;
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(urun||a.name)}</span>
        <span class="md-as">${esc(urun?a.name:'')}${urun?' · ':''}${dh?`<b>${satirlar.length}</b> yüz eşleşiyor`:`${satirlar.length} yüz`}</span>
        <span class="md-oz">${kayitSay?`${esc(mdEksenAdi(ek))}: ${kayitSay} kayıt`:`${esc(mdEksenAdi(ek))}: kayıt yok`}</span>
      </button>
      <span class="md-ah-r">
        ${acik&&isAdmin()&&!a._sahte?`<button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id})"
          title="Envanter: bu alana yeni pozisyon ekle (yönetici)">${ic('plus',15)} Pozisyon</button>`:''}
      </span>
    </header>`;
  /* Kapalı grubun tablosu HİÇ kurulmaz (S8.1 §14). */
  if(!acik) return `<section class="sec-card md-alan md-kapali" data-a="${a.id}">${baslik}</section>`;
  const gun=mdBugun();
  const aylar=mdDonemAylari(ek.bas,ek.bit);
  const secili=new Set(satirlar.map(x=>x.u.id));
  const us=a._sahte?(M.orphanByMec[a.mecra_id]||[]):(M.unitsByAlt[a.id]||[]);
  const gr=groupUnits(us).filter(g=>[g.A,g.B].some(u=>u&&secili.has(u.id)));
  /* Kurum/iş süzgeci bir KAYIT sorusudur: eşleşmeyen kayıt soluklaşır ama
     yüzeyi bloklamaya devam eder — gizlenen kayıt yüzeyi müsait GÖSTEREMEZ.
     Dilimler daima yüzeyin TÜM engelleyici kayıtlarıyla hesaplanır. */
  const eslesir=(filtre.kurum||filtre.is)?kFiltre:null;
  const ctx={gun,eslesir,
    vurgula:dh&&dh.kayit.size?(r=>dh.kayit.has(mdKayitKey(r))):null,
    ikincil:dh&&dh.tip==='kayit'?(r=>!dh.kayit.has(mdKayitKey(r))):null};
  let no=0;
  const rows=gr.map(g=>{
    const yuzler=[g.A,g.B].filter(Boolean); const cift=!!(g.A&&g.B);
    if(cift) _mdLeg.ab=true;
    const yuzOk=u=>!!u&&u.active!==false&&(!dh||dh.set.has(u.id));
    yuzler.forEach(u=>{ if(yuzOk(u)) _mdGoruntu.add(u.id); });
    const secBtn=yuzler.filter(yuzOk).map(u=>u.id);
    const secSay=secBtn.filter(id=>ui._mSec.has(id)).length;
    no++;
    return yuzler.map((u,i)=>{
      const seg=mdGunDilim(M,u,ek.bas,ek.bit,gun);
      const es=yuzOk(u);
      const oc={...ctx,musait:!!(dh&&dh.durum==='musait'&&es)};
      const harf=cift?(u===g.A?'A':'B'):'';
      return `<tr class="mtb-r${i===0?' ilk':''}${i===yuzler.length-1?' son':''}${ui._mSec.has(u.id)?' sec':''}${dh&&!es?' eslesmez':''}" data-u="${u.id}">
        ${i===0?`<th scope="rowgroup" rowspan="${yuzler.length}" class="mtb-pano">
          <span class="mtb-no" aria-hidden="true">${no}</span>
          ${secBtn.length?`<input type="checkbox" class="mtl-cb" ${secSay===secBtn.length?'checked':''}
             aria-label="${esc(g.base)} seç" onchange="mdTumunuSec([${secBtn.join(',')}],this.checked)">`:''}
          <button type="button" class="mtb-ad btn-link" title="${esc(g.base)} — yüzey detayı" onclick="mYuzeyAc(${(g.A||g.B).id})">${esc(g.base)}</button></th>`:''}
        <td class="mtb-yz">${harf?`<b title="${harf==='A'?'Ön yüz':'Arka yüz'}">${harf}</b>`:''}${dh&&!es?'<span class="sr-only">süzgeçle eşleşmiyor</span>':''}</td>
        ${aylar.map(ay=>mdYuzHucre(M,u,mdAyHucre(seg,ay),ay,oc)).join('')}</tr>`;
    }).join('');
  }).join('');

  return `<section class="sec-card md-alan" data-a="${a.id}">${baslik}
    ${mdTabloAc(ek,MD_PANO_GEN+MD_YUZ_GEN)}
      <colgroup><col class="c-pano"><col class="c-yuz">${aylar.map(()=>'<col>').join('')}</colgroup>
      ${mdTabloBas(ek,aylar,'<th scope="col" class="mtb-pano">Pano</th><th scope="col" class="mtb-yz">Yüz</th>')}
      <tbody>${rows}</tbody></table></div></section>`;
}

/* LED: satır = kampanya/yayın kaydı (tarihsel LED tablosunun okunuşu);
   aylar sütunlarda. Aynı ayda birden çok kampanya olağandır. Kampanyanın
   olmadığı ay BOŞTUR — "satılabilir boş slot" DEĞİLDİR, müsait
   boyanmaz. Kapasite/ekran/slot üretilmez; ARC/ERK gibi eski şeritler
   fiziksel ekran sayılmaz. */
function mdLedZaman(M,a,l,ek,acik,DH){
  const gun=mdBugun();
  const aylar=mdDonemAylari(ek.bas,ek.bit);
  const sirali=[...l].sort((p,q)=>String(p.block_start).localeCompare(String(q.block_start))||((p.placement_id||0)-(q.placement_id||0)));
  const ekranlar=(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false);
  const satir=r=>{
    const k=mdKayitMetin(r,gun);
    const eski=r.record_kind==='legacy';
    const tip=r.commitment==='reserved'?'opsiyon':'yayin';
    const gecmis=k.zm==='bitti', plan=k.zm==='yaklasan'&&tip==='yayin';
    if(tip==='opsiyon') _mdLeg.ops=true; else if(gecmis) _mdLeg.gecmis=true; else if(plan) _mdLeg.plan=true; else _mdLeg.yayin=true;
    const hucre=ay=>{
      const bitis=r.block_end==null?ay.ayE:r.block_end;
      const isaret=mdAyIsaret(ay,false);
      if(r.block_start>ay.ayE||bitis<ay.ayB) return `<td class="mtb-c led-bos">${isaret}</td>`;
      const s=r.block_start<ay.ayB?ay.ayB:r.block_start, e=bitis>ay.ayE?ay.ayE:bitis;
      const tamAy=s===ay.ayB&&e===ay.ayE;
      const aralik=tamAy?'tüm ay':`${mdTrKisa(s)}–${mdTrKisa(e)}`;
      return `<td class="mtb-c tek"><button type="button" class="mtb-b t-${tip} tek${gecmis?' gecmis':''}${plan?' plan':''}${DH?' vurgu':''}"
        ${r.placement_id?`data-p="${r.placement_id}"`:`data-b="${r.booking_id}"`}
        title="${esc([r.customer_name,k.durum,k.donem].filter(Boolean).join(' · '))}"
        aria-label="${esc(`${r.customer_name||'kurum belirtilmemiş'} · ${k.durum} · ${AY_UZUN[+ay.ym.slice(5,7)-1]}: ${aralik}`)}"
        onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
        <b>${esc(k.durum)}</b><span>${esc(aralik)}</span></button>${isaret}</td>`;
    };
    return `<tr class="mtb-r ilk son" ${r.placement_id?`data-p="${r.placement_id}"`:`data-b="${r.booking_id}"`}>
      <th scope="row" class="mtb-kmp">
        <button type="button" class="btn-link mtb-ad" onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}"
          title="${esc(r.customer_name||'')}">${esc(r.customer_name?mdKisaAd(r.customer_name,30):'Kurum belirtilmemiş')}</button>
        ${r.work_title||eski?`<span class="mtb-kmp-is">${esc(r.work_title||'eski kayıt')}</span>`:''}
        <span class="mtb-kmp-d">${esc(k.donem)}</span></th>
      ${aylar.map(hucre).join('')}</tr>`;
  };
  const key=mdGrupKey(a);
  /* Fiziksel ekran sayısı ve aktif kampanya sayısı AYRI büyüklüktür.
     Kapasite / slot / doluluk yüzdesi ÜRETİLMEZ. */
  const aktif=sirali.filter(r=>mdKapsarMi(r,gun)&&r.record_kind!=='legacy').length;
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
    <p class="md-not mtb-led-not">Her satır bir kampanyadır; aynı ayda birden çok kampanya yayında olabilir. Boş ay satılabilir boş slot anlamına gelmez.</p>
    ${sirali.length?`${mdTabloAc(ek,MD_KMP_GEN,'mtb-led')}
      <colgroup><col style="width:${MD_KMP_GEN}px">${aylar.map(()=>'<col>').join('')}</colgroup>
      ${mdTabloBas(ek,aylar,'<th scope="col" class="mtb-kmp">Kampanya</th>')}
      <tbody>${sirali.map(satir).join('')}</tbody></table></div>`
      :`<p class="empty" style="padding:10px 0">${esc(mdEksenAdi(ek))} için yayın kaydı yok.</p>`}
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
    <button class="btn btn-outline btn-sm" onclick="mdSecimAc('reserved')">${ic('plus',15)} Opsiyon ekle</button>
    <button class="btn btn-primary btn-sm" onclick="mdSecimAc('confirmed')">${ic('plus',15)} Yayın ekle</button>`;
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
  islemYeni('media');                               /* S14: yeni form = yeni oluşturma girişimi */
  const vars=r?r.work_id:(o.isId||'');
  /* Açılıştaki taahhüt: düzenlemede kaydın kendisi, oluşturmada çağıran
     iş dili eylemi (Yayın ekle / Opsiyon ekle), yoksa Opsiyon. */
  const taahOn=r?r.commitment:(o.taah||'reserved');
  const yeniBaslik=esz?'Yeni LED yayını':(o.taah==='confirmed'?'Yayın ekle':o.taah==='reserved'?'Opsiyon ekle':'Yayın / opsiyon ekle');
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
        <button type="button" data-v="confirmed" class="${taahOn==='confirmed'?'on':''}" onclick="mfTaah(this)">Yayın</button></div>
      <p class="fhint" style="margin:4px 0 0">Opsiyon: yüzey ayrılır, görüşme sürer. Yayın: kesinleşmiş kayıt. İkisi de yüzeyi bloklar; iptal edilen kayıt bloklamaz. Opsiyon, başlangıç günü gelince kendiliğinden yayına dönmez.</p></div>
    <div class="field" id="mfOpsSarmal" ${taahOn==='reserved'?'':'hidden'}>
      <label class="flabel" for="mfOpsSon">Opsiyon son geçerlilik tarihi <span class="muted">(opsiyonel)</span></label>
      <input class="inp" type="date" id="mfOpsSon" value="${esc(r&&r.option_expires_at||'')}">
      <p class="fhint" style="margin:4px 0 0">Opsiyonun ne zaman düşeceği — reklam dönemi değil. Süresi geçen opsiyon yüzeyi bloklamaya devam eder.</p></div>`}
    <div class="field"><label class="flabel" for="mfSoz">Sözleşme kalemi <span class="muted">— isteğe bağlı</span></label>
      <select class="inp" id="mfSoz"><option value="">Bağlı değil</option></select>
      <p class="fhint" style="margin:4px 0 0">Bu kaydı mevcut bir sözleşme kalemiyle ilişkilendirir.</p></div>
    <div class="field"><label class="flabel" for="mfNot">Not</label>
      <input class="inp" id="mfNot" value="${esc(r&&r.note||'')}" placeholder="İç not (herkese açık sitede görünmez)"></div>
    <div id="mfSorun" aria-live="polite"></div>
    <div class="md-mf-b">
      ${r&&r.placement_id&&r.commitment!=='cancelled'?`<button class="btn btn-danger btn-sm" onclick="mIptal(${r.placement_id})">Kaydı iptal et</button>`:''}
      <span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
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
  const btn=document.getElementById('mfKaydet'); if(btn&&btn.disabled) return;   // çift tıklama tek kayıt
  const btnMetin=btn?btn.textContent:'Kaydet';
  /* S11 §5 — düzenlemede: değişiklik yoksa yazma ve Hareket YOK; kayıt
     form açıldıktan sonra başkası tarafından değiştirildiyse sessizce
     EZİLMEZ (RPC öncesi tazelik denetimi, form açık kalır). */
  if(f.kayit&&f.kayit.placement_id){
    const k=f.kayit, n=v=>(v===undefined||v===null||v==='')?'':String(v);
    const ayni=['work_id','customer_id','start_date','end_date','commitment','option_expires_at','contract_item_id','note']
      .every(a=>n(ortak[a])===n(k[a]));
    if(ayni){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
    const {data:g}=await sb.from('media_placements').select('work_id,customer_id,start_date,end_date,commitment,option_expires_at,contract_item_id,note').eq('id',k.placement_id).maybeSingle();
    const deg=g?['work_id','customer_id','start_date','end_date','commitment','option_expires_at','contract_item_id','note'].filter(a=>n(g[a])!==n(k[a])):[];
    if(deg.length){ mpAlert('Bu kayıt siz düzenlerken başka biri tarafından değiştirildi. Değişiklikleriniz kaydedilmedi ve formda duruyor; güncel hali görmek için formu kapatıp yeniden açın.','Kayıt güncellenmiş'); return; }
  }
  if(btn){ btn.disabled=true; btn.textContent='Kaydediliyor…'; }
  let r;
  if(f.kayit&&f.kayit.placement_id){
    try{ r=await api('media_update',{id:f.kayit.placement_id,patch:{...ortak,end_date:bit||'',
          option_expires_at:opsSon||'',contract_item_id:ortak.contract_item_id||''}}); }
    catch(e){ if(btn){ btn.disabled=false; btn.textContent=btnMetin; } mpAlert(hataMetni(e),'Kaydedilemedi'); return; }
  } else {
    /* S14: oluşturma tekillik anahtarıyla — yanıt kaybolup tekrar gönderilirse
       aynı kayıtlar döner. Çakışma raporu (ok:false) anahtarı serbest bırakır. */
    const s=await islemCalistir('media','media_placements_create',(f.esz?'Yayın':'Yerleşim')+' · '+bas,
      k=>api('media_create',{common:ortak,targets:f.hedefler,islem:k}),'Kaydedilemedi');
    if(s.durum!=='tamam'){ if(btn){ btn.disabled=false; btn.textContent=btnMetin; } return; }
    r=s.sonuc;
  }
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
  if(!(await mpConfirm('Bu opsiyon yayına çevrilsin mi? Kesinleşmiş yayın kaydı olur; reklam dönemi aynı kalır, opsiyon son geçerlilik tarihi temizlenir.','Yayına çevir',{danger:false,ok:'Yayına çevir'}))) return;
  const r=await guard(()=>api('media_update',{id:pid,patch:{commitment:'confirmed'}}),'Çevrilemedi');
  if(r===null) return;
  toast('Opsiyon yayına çevrildi.'); await mdTazele(); mKayitAc(pid);
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
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
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
      : hataMetni(e));
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
        <button class="btn btn-primary btn-sm" onclick="mOpsKesinle(${pid})">Yayına çevir</button>
        <button class="btn btn-danger btn-sm" onclick="mIptal(${pid})">İptal et — yüzeyi serbest bırak</button>
      </span>`:''}</div>`:'';
  modal(`<h3 style="margin:0 0 2px">${esc(esz?a.name:(r.unit_name||''))}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(r.mecra_name||'')}${esz?' · eşzamanlı LED yayını':` · ${esc(a.name||'')}`}</p>
    ${uyari}
    <div class="md-dl">
      <span>Kurum</span><b>${r.customer_id?`<button class="btn-link" onclick="closeModal();orgAc(${r.customer_id})">${esc(r.customer_name||'')}</button>`:'—'}</b>
      <span>İş</span><b>${r.work_id?`<button class="btn-link" onclick="closeModal();workAc(${r.work_id})">${esc(r.work_title||'')}</button>`:'<span class="muted">bağlı değil</span>'}</b>
      <span>Dönem</span><b class="mono">${esc(r.end_date?mdAralikNokta(r.start_date,r.end_date):mdNokta(r.start_date)+' – bitiş bilinmiyor')}</b>
      <span>Durum</span><b>${mdKayitRozet(r,zm)} <span class="muted">${esc(r.commitment==='cancelled'?'':'Kayıt: '+(MD_TAAHHUT[r.commitment]||''))}</span></b>
      ${r.option_expires_at?`<span>Opsiyon geçerliliği</span><b class="${r.option_expires_at<mdBugun()?'md-yk':''}">${esc(mdNokta(r.option_expires_at))}${r.option_expires_at<mdBugun()?' · süresi doldu':''}
        <span class="muted">— reklam dönemi değil</span></b>`:''}
      ${esz&&a.creative_seconds?`<span>Kreatif</span><b>${a.creative_seconds} sn <span class="muted">(mecra kuralı)</span></b>`:''}
      ${r.contract_item_id?`<span>Sözleşme</span><b id="mkSoz" class="muted">yükleniyor…</b>`:''}
      ${r.source_quote_id?`<span>Teklif</span><b>#${r.source_quote_id}</b>`:''}
      ${/* S11 §7: eski tablo şeridi / taşıma kökeni teknik veridir (legacy_lane); operasyon ekranında GÖSTERİLMEZ. */''}
      ${r.note?`<span>Not</span><b>${esc(r.note)}</b>`:''}
      <span>Kaydeden</span><b class="muted">${esc(tm[r.created_by_team_id]||'—')} · ${esc(r.created_at?psZaman(r.created_at):'')}</b>
    </div>
    <div class="md-mf-b">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();medyaOdak(${pid},{ayrinti:false})">Takvimde göster</button>
      <span style="flex:1"></span>
      ${r.commitment!=='cancelled'?`<button class="btn btn-outline btn-sm" onclick="mForm({kayit:ui._M.recs.find(x=>x.placement_id===${pid})})">Düzenle</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button></div>`);
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
        <span class="bl-ext ${d.provider==='external'?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span><span class="bl-nm">${esc(belgeAd(d))}</span></button>`).join('')}</div>`
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
      <span class="fhint" style="margin:0">Kısa bakım yüzeyi otomatik pasife almaz.</span></div>`:''}
    <div class="md-mf-b"><span style="flex:1"></span>
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button>
      ${u.active!==false?`<button class="btn btn-outline btn-sm" onclick="mForm({hedefler:[{unit_id:${uid}}],taah:'reserved'})">${ic('plus',15)} Opsiyon ekle</button>
      <button class="btn btn-primary btn-sm" onclick="mForm({hedefler:[{unit_id:${uid}}],taah:'confirmed'})">${ic('plus',15)} Yayın ekle</button>`:''}</div>`);
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
      <span>Durum</span><b>${r.commitment==='reserved'?'Opsiyon':'Yayın'} <span class="muted">(eski aylık kayıt)</span></b>
      <span>Dönem</span><b>${r.start_date?esc(mdAralikNokta(r.start_date,r.end_date)):'<span class="muted">Kesin gün bilgisi yok</span>'}</b>
      ${r.period_note?`<span>Kaynak ifade</span><b class="mono">${esc(r.period_note)}</b>`:''}
      ${r.note?`<span>Not</span><b>${esc(r.note)}</b>`:''}
    </div>
    <p class="md-not">Bu kayıt eski aylık tablodan gelir. Kesin günü bilinmediği sürece gün uydurulmaz; yüz o ay için korumacı olarak dolu sayılır.
      Aynı kurum için kesin dönemli yerleşim oluşturulurken bu kayıt açıkça devralınabilir.</p>
    <div class="md-mf-b"><span style="flex:1"></span>
      ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="mEskiSil(${bid})">Eski kaydı sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button></div>`);
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
/* `o.ayrinti`: Hareketler'den gelen derin bağlantı kaydın ayrıntısını da
   açar (PS9 kapanış §2). Ayrıntı penceresindeki "Takvimde göster" ise
   pencereyi KAPATIR ve yeniden AÇMAZ (S11 §7): önceki davranış pencereyi
   120 ms sonra tekrar açıyordu; kullanıcı takvimi hiç göremiyor, tekrar
   tıklayınca döngüye giriyordu. */
async function medyaOdak(pid,o){
  o=o||{};
  const M=await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid);
  if(!r){ mpAlert('Bu mecra kaydı artık yok.'); return; }
  ui._mOdak=pid; ui._mOdakAyrinti=o.ayrinti!==false;
  /* Hedef TAKVİMDE açılır: lokasyon + ürün grubu + hedef tarih penceresi.
     Hedefi gizleyen süzgeçler temizlenir ve bu AÇIKÇA söylenir. */
  const st=mdDurum();
  const gizleyen=[st.kurum&&'kurum',st.is&&'iş',st.q&&'arama',st.urun&&'mecra türü',st.alan&&'alan',
    st.durum&&'durum',(st.msBas&&st.msBit)&&'müsaitlik araması'].filter(Boolean);
  ui._mOdakNot=gizleyen.length?`Hedef kaydı göstermek için şu süzgeçler kaldırıldı: ${gizleyen.join(', ')}.`:'';
  Object.assign(st,{site:r.mecra_id,alan:'',kurum:'',is:'',durum:'',q:'',urun:'',msBas:'',msBit:''});
  mdPencereyeAl(st,r.block_start);
  /* Ürün grubunu AÇ: kapalı grubun şeridi hiç üretilmediği için hedef
     satır aksi halde DOM'da olmazdı. */
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  if(altId!=null) st.acik={...(st.acik||{}),[mdGrupKey({id:altId})]:true};
  medyaGit(st);
}
/* Haritadan / yüzey bağlamından takvime (S11 §4): lokasyon + ürün grubu
   açılır, pencere DURUM TARİHİNİ gösterir, yüzey satırı vurgulanır. */
async function medyaYuzeyOdak(uid){
  const M=ui._M||await mdYukle(); const u=M.unitById[uid];
  if(!u){ mpAlert('Bu yüzey artık yok.'); return; }
  const st=mdDurum();
  const gizleyen=[st.kurum&&'kurum',st.is&&'iş',st.q&&'arama',st.urun&&'mecra türü',st.alan&&'alan',st.durum&&'durum'].filter(Boolean);
  ui._mOdakNot=gizleyen.length?`Yüzeyi göstermek için şu süzgeçler kaldırıldı: ${gizleyen.join(', ')}.`:'';
  Object.assign(st,{site:u.mecra_id,alan:'',kurum:'',is:'',durum:'',q:'',urun:'',msBas:'',msBit:''});
  if(u.alt_mecra_id!=null) st.acik={...(st.acik||{}),[mdGrupKey({id:u.alt_mecra_id})]:true};
  mdPencereyeAl(st,mdRefGun(st));
  ui._mOdakU=uid;
  medyaGit(st);
}
async function medyaAlanOdak(altId){
  const M=ui._M||await mdYukle(); const a=M.altById[altId]; if(!a) return;
  const st=mdDurum();
  Object.assign(st,{site:a.mecra_id,alan:'',kurum:'',is:'',durum:'',q:'',urun:'',msBas:'',msBit:''});
  st.acik={...(st.acik||{}),[mdGrupKey({id:altId})]:true};
  mdPencereyeAl(st,mdRefGun(st));
  ui._mOdakA=altId;
  medyaGit(st);
}
function mdOdakUygula(){
  if(ui._mOdakU||ui._mOdakA){
    const uid=ui._mOdakU, aid=ui._mOdakA; ui._mOdakU=null; ui._mOdakA=null;
    const el=uid?document.querySelector(`#mdGovde tr[data-u="${uid}"]`):document.querySelector(`section[data-a="${aid}"]`);
    const not=ui._mOdakNot; ui._mOdakNot='';
    const ob=document.getElementById('mdOdak');
    if(ob&&not) ob.innerHTML=`<div class="md-odak-b" role="status">${ic('lists',15)}<span><em class="md-odak-not">${esc(not)}</em></span>
      <button class="afilt-x" onclick="this.closest('.md-odak-b').remove()" aria-label="Kapat">✕</button></div>`;
    if(el){ el.classList.add('md-odak'); setTimeout(()=>{ el.scrollIntoView({block:'center',inline:'nearest'});
      const bu=el.querySelector('td .mtb-bugun'); if(bu) mdYataydaGoster(bu.closest('td'),true); },40); }
    return;
  }
  const pid=ui._mOdak; if(!pid) return; ui._mOdak=null;
  const M=ui._M; const r=M&&M.recs.find(x=>x.placement_id===pid); if(!r) return;
  /* Derin bağlantının açtığı grup "son ilgili grup"tur: odak şeridi
     kapatılıp başka mecraya gidildiğinde geri dönüşte yeniden kapanmasın. */
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  if(altId!=null){ const st=mdDurum(); st.acik[mdGrupKey({id:altId})]=true; mdDurumYaz(st); }
  /* Statik kayıt birden çok ay hücresinde blok olarak görünür: hepsi
     vurgulanır, ilk ay (kaydın başladığı yer) görünür alana alınır. */
  const bloklar=[...document.querySelectorAll(`#mdGovde .mtb-b[data-p="${pid}"]`)];
  const satir=document.querySelector(`#mdGovde tr[data-p="${pid}"]`)
    ||(r.unit_id?document.querySelector(`#mdGovde tr[data-u="${r.unit_id}"]`):null);
  const hedefEl=bloklar[0]||satir||document.querySelector(`[data-a="${r.alt_mecra_id}"]`);
  const esz=r.occupancy_mode==='concurrent';
  const ob=document.getElementById('mdOdak');
  const not=ui._mOdakNot; ui._mOdakNot='';
  if(ob) ob.innerHTML=`<div class="md-odak-b" role="status">${ic('lists',15)}
      <span><b>${esc(esz?(r.area_name||''):(r.unit_name||''))}</b> · ${esc(orgKisa(r.customer_name||'',30))} · <span class="mono">${esc(mdDonem(r))}</span>
      · ${mdKayitRozet(r,mdZamansal(r,mdBugun()))}
      ${not?`<em class="md-odak-not">${esc(not)}</em>`:''}</span>
      <button class="btn btn-outline btn-sm" onclick="mKayitAc(${pid})">Kaydı aç</button>
      <button class="afilt-x" onclick="this.closest('.md-odak-b').remove()" aria-label="Kapat">✕</button></div>`;
  if(hedefEl){
    bloklar.forEach(b=>b.classList.add('md-odak'));
    if(satir) satir.classList.add('md-odak');
    if(!bloklar.length) hedefEl.classList.add('md-odak');
    /* Satır dikeyde, blok yatayda görünür alana alınır (yapışkan sol
       sütunların arkasında kalmaz). Tek sefer; döngü yok. */
    setTimeout(()=>{
      hedefEl.scrollIntoView({block:'center',inline:'nearest'});
      if(bloklar[0]) mdYataydaGoster(bloklar[0],false);
    },40);
  } else if(ob){
    ob.insertAdjacentHTML('beforeend','<p class="md-ms-uyari">Kayıt bu görünümde çizilemedi; “Kaydı aç” ile ayrıntısını görebilirsiniz.</p>');
  }
  if(ui._mOdakAyrinti) setTimeout(()=>mKayitAc(pid),120);
  ui._mOdakAyrinti=false;
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

/* S12: Doluluk ekranından müsaitlik raporuna geçiş — seçili lokasyon ve
   uygulanmış müsaitlik aralığı rapora taşınır; ekranın kendisi değişmez. */
function mdRaporAc(){ const st=mdDurum(); const ms=mdMsAralik(st);
  const p={}; if(st.site!=null) p.siteler=[+st.site]; if(st.urun) p.urun=String(st.urun);
  if(ms){ p.bas=ms.bas; p.bit=ms.bit; p.tamMusait=true; }
  rpAc('mecra',p); }
/* S15: Doluluk ekranının ham Excel dışa aktarımı (mdDisaAktar) kaldırıldı;
   aynı kayıtların aylık tablosu Raporlar › Mecra doluluk tablosu'dur. */
