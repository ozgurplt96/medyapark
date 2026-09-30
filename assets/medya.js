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
/* S17: "bugün" kullanıcının iş gününe (Europe/Istanbul) göredir. Tarayıcı
   başka bir saat diliminde olsa da Mecralar'ın varsayılan dönemi, bugün
   çizgisi ve dönem hesabı aynı günü kullanır. Intl yoksa yerel gün. */
const _mdTzFmt=(()=>{ try{ return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}); }catch(e){ return null; } })();
function mdBugun(){
  if(_mdTzFmt){ try{ const p={}; _mdTzFmt.formatToParts(new Date()).forEach(x=>{ p[x.type]=x.value; });
    if(p.year&&p.month&&p.day) return `${p.year}-${p.month}-${p.day}`; }catch(e){} }
  return _cIso(new Date()); }
/* Takvim ayı ekleme — gün AY SONUNA SINIRLANIR, sonraki aya taşmaz:
   31.08 + 3 ay = 30.11 · 31.05 − 3 ay = 28/29.02 · 31.12 + 2 ay = 28/29.02. */
function mdAyKaydir(iso,n){
  const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);
  const t=(m-1)+n, yy=y+Math.floor(t/12), mm=((t%12)+12)%12;
  const son=new Date(2000,0,1); son.setFullYear(yy,mm+1,0);
  return `${yy}-${pad(mm+1)}-${pad(Math.min(d,son.getDate()))}`; }
function mdAyBasi(iso){ return String(iso).slice(0,7)+'-01'; }
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
    const gunAd=s===x?String(+s.slice(8)):`${+s.slice(8)}–${+x.slice(8)}`;   /* tek günlük kısmi ay: (30) */
    out.push({ym,ayB,ayE,s,e:x,tam,once:mdDn(s)-mdDn(ayB),sonra:mdDn(ayE)-mdDn(x),
      ad:`${AY_UZUN[mo-1]} ${y}`+(tam?'':` (${gunAd})`),
      kisa:`${AY_KISA[mo-1]} ${y}`+(tam?'':` (${gunAd})`)});
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
  return {kod, yakinda, taahhut:kod, bosalma, zincir,
          /* S17: boşalma günü alt satırda yazar; eski "yakında" süzgeç terimi etiket değildir. */
          etiket:kod==='rezerve'?(opsSure?'Opsiyonlu · süresi doldu':'Opsiyonlu'):'Yayında',
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
   S17 — TEK DÖNEM. Ekranın, sayaçların, Excel'in ve adresin sorusu
   tek bir UYGULANMIŞ aramadır:
     bas / bit        seçili dönem (dahil)
     hazir / merkez   hazır dönem ('6' | '3' | 'yil') ve merkez tarih;
                      elle verilen aralık hazır döneme denk gelmiyorsa ''
     durum            '' | opsiyon | yayin | musait | bosalacak
     site, urun, kurum, is, q, alan   kapsam
     gecmisGizle      yalnız görünüm: bugünün ayından önceki kısmı gizler
   Eski "durum tarihi", ayrı "müsaitlik araması" ve yıl/ölçek/çapa
   durumu KALDIRILDI; ikinci gizli bir tarih aralığı tutulmaz.
   Formdaki değiştirilmiş ama uygulanmamış değerler TASLAKTIR
   (`ui._mdTaslak`, bellek) ve hiçbir hesaba girmez.
   ========================================================== */
const MD_SURUM=17;
const MD_HAZIR=[['6','6 ay'],['3','3 ay'],['yil','Yıl']];
const MD_MAX_GUN=1096;                         // en çok üç yıl: tablo okunur kalır
const MD_DEF={v:MD_SURUM,site:null,alan:'',kurum:'',is:'',q:'',urun:'',durum:'',
              hazir:'6',merkez:'',bas:'',bit:'',gecmisGizle:false};
/* Hazır dönemin aralığı (merkez tarihe göre):
     6 ay → merkezden 3 ay önce … 3 ay sonra
     3 ay → merkezden başlayıp 3 ay ileri
     Yıl  → merkezin takvim yılı */
function mdHazirAralik(h,m){
  if(h==='yil') return [`${m.slice(0,4)}-01-01`,`${m.slice(0,4)}-12-31`];
  if(h==='3') return [m,mdAyKaydir(m,3)];
  return [mdAyKaydir(m,-3),mdAyKaydir(m,3)];
}
/* Normal ilk açılış: 6 ay, bugün merkez (ör. 30.09.2026 → 30.06–30.12.2026).
   Bu gün aralığı yedi ay sütununa değebilir; altıya zorlamak için tarihler
   DEĞİŞTİRİLMEZ, ilk/son kısmi ay açıkça işaretlenir. */
function mdVarsayilanDonem(){ const g=mdBugun(); const [b,e]=mdHazirAralik('6',g); return {hazir:'6',merkez:g,bas:b,bit:e}; }
/* Elle girilen aralık bir hazır döneme denk mi? Değilse üstte hiçbir
   hazır dönem seçili GÖRÜNMEZ (yanlış bir "6 ay" göstermek yanıltır). */
function mdHazirBul(b,e){
  if(/-01-01$/.test(b)&&e===`${b.slice(0,4)}-12-31`){ const g=mdBugun();
    return {hazir:'yil',merkez:g.slice(0,4)===b.slice(0,4)?g:mdAyKaydir(b.slice(0,4)+g.slice(4),0)}; }
  if(mdAyKaydir(b,3)===e) return {hazir:'3',merkez:b};
  for(const c of [mdAyKaydir(b,3),mdAyKaydir(e,-3)])
    if(mdAyKaydir(c,-3)===b&&mdAyKaydir(c,3)===e) return {hazir:'6',merkez:c};
  return {hazir:'',merkez:''};
}
function mdDurum(){ let d={}; try{ d=JSON.parse(sessionStorage.getItem('mp_medya')||'{}')||{}; }catch(e){}
  /* `acik` her çağrıda YENİ nesne: paylaşılan bir varsayılanı mutasyona
     açmak oturum boyunca sızan durum yaratırdı. */
  const acik=(d.acik&&typeof d.acik==='object'&&!Array.isArray(d.acik))?{...d.acik}:{};
  /* S17: önceki sürümün saklanmış yıl/ölçek görünümü yeni varsayılanı
     ETKİSİZ BIRAKMAZ — sürüm farklıysa arama normal ilk açılışla başlar
     (yalnız açık/kapalı gruplar korunur). */
  if(d.v!==MD_SURUM) d={};
  const o={...MD_DEF,...d,v:MD_SURUM,acik};
  ['gor','olcek','ank','yil','durumGun','msBas','msBit','tur'].forEach(k=>{ delete o[k]; });
  if(!MD_DURUM.some(x=>x[0]===o.durum)) o.durum='';
  if(!['6','3','yil',''].includes(o.hazir)) o.hazir='';
  const g=mdBugun();
  const gecerli=!mdTarihDogrula(o.bas).hata&&!mdTarihDogrula(o.bit).hata&&o.bas<=o.bit;
  /* Gün dönünce: dokunulmamış varsayılan dönem (6 ay, merkez = o günün
     bugünü) yeni bugüne göre kurulur. Kullanıcının seçtiği dönem EZİLMEZ. */
  if(!gecerli||(o.oto&&o.merkez!==g)) Object.assign(o,mdVarsayilanDonem());
  else if(o.hazir){ const [b,e]=mdHazirAralik(o.hazir,o.merkez||'');
    if(!o.merkez||b!==o.bas||e!==o.bit) Object.assign(o,mdHazirBul(o.bas,o.bit)); }
  delete o.oto;
  return o; }
function mdDurumYaz(d){ const o={...d,v:MD_SURUM};
  ['gor','olcek','ank','yil','durumGun','msBas','msBit','tur'].forEach(k=>{ delete o[k]; });
  /* `oto`: dönem hâlâ normal ilk açılışın dönemi mi (gün dönümünde yeniden kurulur). */
  const v=mdVarsayilanDonem();
  o.oto=o.hazir==='6'&&o.merkez===v.merkez&&o.bas===v.bas&&o.bit===v.bit;
  try{ sessionStorage.setItem('mp_medya',JSON.stringify(o)); }catch(e){}
  if(typeof navUrlTazele==='function') navUrlTazele(); }   /* S14: lokasyon/grup/dönem adreste */
/* Aramanın alanları — taslak ile uygulanan bu anahtarlar üzerinden karşılaştırılır. */
const MD_ARAMA_ALAN=['bas','bit','durum','site','urun','kurum','is','q'];
function mdAramaAlan(st){ const o={}; MD_ARAMA_ALAN.forEach(k=>{ o[k]=st[k]==null?'':String(st[k]); }); return o; }

/* ETKİN DÖNEM. "Geçmiş ayları gizle" yalnız görünümdür: bugünün ayından
   önceki kısmı düşer, bugünün ayının geçmiş günleri AYRICA silinmez.
   Dönemin tamamı geçmişteyse `bos` döner (ekran boş durumu gösterir,
   Excel kilitlenir). Tablo, sayaç ve Excel ETKİN dönemi kullanır. */
function mdEtkin(st){
  const b=st.bas, e=st.bit, esas={bas:b,bit:e};
  if(!st.gecmisGizle) return {bas:b,bit:e,esas,gizli:false,bos:false};
  const ab=mdAyBasi(mdBugun());
  if(e<ab) return {bas:b,bit:e,esas,gizli:true,bos:true};
  const eb=b<ab?ab:b;
  return {bas:eb,bit:e,esas,gizli:eb!==b,bos:false};
}
/* Tablonun eksen bilgisi: etkin dönemin ayları (kısmi ilk/son ay işaretli). */
function mdEksen(st){ const E=mdEtkin(st); const aylar=mdDonemAylari(E.bas,E.bit);
  return {bas:E.bas,bit:E.bit,aylar,n:aylar.length,etkin:E}; }
function mdEksenAdi(ek){ return `${mdNokta(ek.bas)} – ${mdNokta(ek.bit)}`; }
function mdHazirAd(st){ const h=MD_HAZIR.find(x=>x[0]===st.hazir); return h?h[1]:'Özel aralık'; }

/* Hedef tarihi uygulanan döneme al (kayıt bağlantısı). Tarih zaten
   dönemdeyse dönem DEĞİŞMEZ. Değilse hazır dönem korunur, merkez hedefe
   taşınır; özel aralıkta uzunluk korunur, başlangıç hedefin ayına gelir. */
function mdPencereyeAl(st,iso){
  if(!iso) return st;
  const E=mdEtkin(st);
  if(iso>=E.bas&&iso<=E.bit&&!E.bos) return st;
  if(iso>=st.bas&&iso<=st.bit){ st.gecmisGizle=false; return st; }   // yalnız gizlenen kısımda
  if(st.hazir){ const m=st.hazir==='3'?mdAyBasi(iso):iso; const [b,e]=mdHazirAralik(st.hazir,m);
    Object.assign(st,{merkez:m,bas:b,bit:e}); }
  else { const n=mdDn(st.bit)-mdDn(st.bas); const b=mdAyBasi(iso); Object.assign(st,{bas:b,bit:mdDnIso(mdDn(b)+n)}); }
  if(st.gecmisGizle&&iso<mdAyBasi(mdBugun())) st.gecmisGizle=false;
  return st;
}

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

/* Mecralar'a git: yüzeye göre doğru rota (dashGo ile aynı kural). Programatik
   geçiş UYGULANMIŞ aramayı değiştirir; varsa bekleyen form taslağı düşer
   (taslak ile uygulanan sonuç karışmaz). Dönem verilmezse mevcut dönem kalır. */
function medyaGit(ek){
  /* Sekme ÖNCE Doluluk'a alınır: mdDurumYaz adresi hemen yazar ve adres
     sekmeyi (gorunum=harita) okur — sıra ters olursa harita adreste kalırdı. */
  const ws=!(isAdmin()&&surfaceGet()!=='workspace');
  if(ws) ui._mecSub='doluluk';
  mdDurumYaz({...mdDurum(),...(ek||{})});
  ui._mdTaslak=null;
  go(ws?'ws-mecralar':'listeler');
}

/* ==========================================================
   VERİ (tek turda, paralel; yüz / alan başına istek YOK — B69)
   ========================================================== */
async function mdYukle(){
  /* Okuma sürerken Mecralar'ın Excel düğmeleri kilitlidir (S17). */
  ui._mdYukleniyor=true; if(typeof mdXlsKilit==='function') mdXlsKilit();
  let mecs,alts,prods,custs,jobs,recs;
  try{
    [mecs,alts,prods,custs,jobs,recs]=await Promise.all([
      api('mecra_list'), api('media_areas'), api('products_list'),
      api('customers_min'), api('media_jobs'), api('media_scope&iptal=1')]);
  } finally { ui._mdYukleniyor=false; }
  const units=[]; mecs.forEach(m=>(m.units||[]).forEach(u=>units.push(u)));
  const cmap={}; custs.forEach(c=>cmap[c.id]=c.firma||('#'+c.id));
  const M=mdModel({mecs,alts,units,prods,recs,cmap,jobs});
  M.okunma=new Date();
  ui._M=M;
  return M;
}

/* ==========================================================
   EKRAN: Mecralar › Doluluk — tek arama, aylık tablo (S16/S17)
   ========================================================== */
async function listeler(c,o){
  /* `onbellek`: yalnız kapsam/görünüm değişti — veri yeniden okunmaz. */
  const M=(o&&o.onbellek&&ui._M)?ui._M:await mdYukle();
  const st=mdDurum();
  const siteler=mdSiteler(M);
  /* Hatırlanan mecra artık geçerli değilse "Tüm mecralar"a dönülür. */
  if(st.site!=null&&!siteler.some(m=>String(m.id)===String(st.site))) st.site=null;
  mdDurumYaz(st);
  ui._mSec=ui._mSec||new Set();
  /* Form TASLAĞI gösterir (yoksa uygulanan aramayı); tablo yalnız uygulananı. */
  const T=ui._mdTaslak||mdAramaAlan(st);

  /* Süzgeç seçenekleri YALNIZ medya kaydı olan kurum / işlerden gelir:
     soru "hangi mecraları kullanıyor", 531 kurumluk bir liste değil. */
  const kSay={}, iSay={};
  M.recs.filter(r=>r.commitment!=='cancelled'&&r.customer_id!=null).forEach(r=>{
    kSay[r.customer_id]=(kSay[r.customer_id]||0)+1; if(r.work_id) iSay[r.work_id]=(iSay[r.work_id]||0)+1; });
  const kurumOpt=Object.keys(kSay).map(id=>({id,ad:M.cmap[id]||('#'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  const isOpt=Object.keys(iSay).map(id=>({id,ad:(M.jmap[id]||{}).title||('İş #'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  /* Mecra türü (§6). Sayım birimi türün DAVRANIŞINA göre değişir:
     statik türde YÜZ, eşzamanlı türde YAYIN ALANI. */
  const uSay={};
  M.mecs.filter(mdKapsamda).forEach(m=>(M.altByMec[m.id]||[]).filter(a=>!mdArsiv(a)).forEach(a=>{
    const pid=a.product_id; if(pid==null) return;
    const e=uSay[pid]=uSay[pid]||{n:0,esz:mdEszamanli(a)};
    e.n+=mdEszamanli(a)?1:(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false).length;
  }));
  const urunOpt=Object.keys(uSay).filter(id=>uSay[id].n>0)
    .map(id=>({id,ad:M.pm[id]||('#'+id),n:`${uSay[id].n} ${uSay[id].esz?'yayın alanı':'yüz'}`}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  const sel=(v,k)=>String(v??'')===String(k)?'selected':'';

  c.innerHTML=`<div class="sec-head md-head"><div><h3>Doluluk</h3>
      <p class="sub">Statik yüzeyler kesin dönemle, LED yayınları eşzamanlı kampanya olarak yönetilir.</p></div>
    <div class="md-head-r">
      <button class="btn btn-outline btn-sm md-xls" id="mdXlsGenel" data-xls onclick="mdExcel({})"
        title="Uygulanan aramanın tamamı: tüm mecralar ve ürünler, kapalı gruplar dahil">${ic('download',15)} Excel indir</button>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="bookImport()" title="Eski tablolardan ay bazlı kayıt aktarımı — kesin dönemli yerleşim oluşturmaz">${ic('upload',15)} Eski ay kaydı al</button>`:''}
    </div></div>
    <form class="sec-card fbar md-fbar md-ara" id="mdAraForm" role="search" aria-label="Mecralar araması" novalidate
        onsubmit="event.preventDefault();mdAraUygula()" oninput="mdTaslakOku()" onchange="mdTaslakOku()">
      <div class="md-donem-row">
        <div class="md-hazir">
          <button type="button" class="md-nav" onclick="mdKaydir(-1)" aria-label="Önceki dönem (${esc(mdHazirAd(st))})" title="Önceki dönem">‹</button>
          <div class="ws-switch inline" role="group" aria-label="Hazır dönem">
            ${MD_HAZIR.map(([v,l])=>`<button type="button" class="${st.hazir===v?'on':''}" aria-pressed="${st.hazir===v}"
              onclick="mdHazirSec('${v}')">${st.hazir===v?'<span aria-hidden="true">✓ </span>':''}${l}</button>`).join('')}</div>
          <button type="button" class="md-nav" onclick="mdKaydir(1)" aria-label="Sonraki dönem (${esc(mdHazirAd(st))})" title="Sonraki dönem">›</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="mdBuguneGit()" title="Seçili dönemi bugüne göre kur; süzgeçler korunur">Bugüne git</button>
        </div>
        <label class="md-ms-f"><span>Başlangıç</span>
          <input class="inp inp-sm" type="date" id="mdBas" value="${esc(T.bas)}" min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" required></label>
        <label class="md-ms-f"><span>Bitiş</span>
          <input class="inp inp-sm" type="date" id="mdBit" value="${esc(T.bit)}" min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" required></label>
        <label class="mtl-gk"><input type="checkbox" id="mdGecmis" ${st.gecmisGizle?'checked':''}
          onchange="event.stopPropagation();mdGecmisGizle(this.checked)"> Geçmiş ayları gizle</label>
      </div>
      <div class="md-site" role="radiogroup" aria-label="Mecra" id="mdSiteG">
        ${[{id:'',name:'Tüm mecralar'},...siteler].map(m=>{ const on=String(T.site??'')===String(m.id);
          return `<button type="button" role="radio" class="md-sp${m.id===''?' md-sp-all':''} ${on?'on':''}" aria-checked="${on}" data-v="${m.id}"
            onclick="mdTaslakSec('site',this)">${on?'<span aria-hidden="true">✓ </span>':''}${esc(m.name)}</button>`; }).join('')}
      </div>
      <div class="fbar-row">
        <input class="inp" id="mdQ" placeholder="Ara: pozisyon, kurum veya iş…" value="${esc(T.q)}" aria-label="Metin araması">
        <select class="inp ${T.kurum?'inp-on':''}" id="mdKurum" aria-label="Kurum">
          <option value="">Tüm kurumlar</option>
          ${kurumOpt.map(k=>`<option value="${k.id}" ${sel(T.kurum,k.id)}>${esc(orgKisa(k.ad,40))}</option>`).join('')}</select>
        <select class="inp ${T.is?'inp-on':''}" id="mdIs" aria-label="İş">
          <option value="">Tüm işler</option>
          ${isOpt.map(k=>`<option value="${k.id}" ${sel(T.is,k.id)}>${esc(k.ad)}</option>`).join('')}</select>
        <select class="inp ${T.urun?'inp-on':''}" id="mdUrun" aria-label="Ürün (mecra türü)">
          <option value="">Tüm ürünler</option>
          ${urunOpt.map(p=>`<option value="${p.id}" ${sel(T.urun,p.id)}>${esc(p.ad)} (${p.n})</option>`).join('')}</select>
      </div>
      <div class="md-durum-row">
        <div class="md-seg" role="radiogroup" aria-label="Durum" id="mdDurumG">
          ${MD_DURUM.map(([k,l])=>{ const on=(T.durum||'')===k;
            return `<button type="button" role="radio" aria-checked="${on}" class="${on?'on':''}" data-v="${k}" title="${esc(MD_DURUM_IPUCU[k]||'')}"
              onclick="mdTaslakSec('durum',this)">${on?'<span aria-hidden="true">✓ </span>':''}${esc(l)}</button>`; }).join('')}
        </div>
        <span class="md-ara-b">
          <button type="button" class="md-bekleyen" id="mdBekleyen" hidden onclick="mdAraUygula()">Bekleyen değişiklik · Aramayı uygula</button>
          <button type="submit" class="btn btn-primary btn-sm md-ara-go">Ara</button>
          <button type="button" class="btn-link" onclick="mdSifirla()" title="Normal ilk açılışa dön: 6 ay, bugün merkez, tüm durumlar">Aramayı sıfırla</button>
        </span>
      </div>
      <p class="md-ms-hata" id="mdAraHata" role="alert" hidden></p>
    </form>
    <div id="mdAfilt"></div>
    <div id="mdOdak"></div>
    <div id="mdGovde"></div>
    <div id="mdSecim" class="md-secim" hidden></div>`;
  mdBekleyenCiz();
  mdCiz();
}

/* ---------- TASLAK (form) ----------
   Yazarken hiçbir şey uygulanmaz ve ekran yeniden çizilmez (yarım yazılan
   yıl — "0002-…" — arama sayılmaz, S10 kök nedeni). Değişiklik yalnız Ara /
   Enter ile uygulanır; bekleyen değişiklik kısa bir göstergeyle söylenir. */
function mdTaslakOku(){
  if(!document.getElementById('mdAraForm')) return;
  const v=id=>{ const el=document.getElementById(id); return el?el.value:''; };
  const T={...(ui._mdTaslak||mdAramaAlan(mdDurum()))};
  T.bas=v('mdBas'); T.bit=v('mdBit'); T.q=v('mdQ'); T.kurum=v('mdKurum'); T.is=v('mdIs'); T.urun=v('mdUrun');
  T._eksik=['mdBas','mdBit'].some(id=>{ const el=document.getElementById(id); return el&&!el.value&&el.validity&&el.validity.badInput; });
  ['mdKurum','mdIs','mdUrun'].forEach(id=>{ const el=document.getElementById(id); if(el) el.classList.toggle('inp-on',!!el.value); });
  ui._mdTaslak=T; mdAraHataGizle(); mdBekleyenCiz();
}
function mdTaslakSec(k,btn){
  if(!ui._mdTaslak) mdTaslakOku();
  const T=ui._mdTaslak; const v=btn.dataset.v;
  T[k]=v;
  btn.parentElement.querySelectorAll('button[role=radio]').forEach(b=>{ const on=b===btn;
    b.classList.toggle('on',on); b.setAttribute('aria-checked',on);
    const i=b.querySelector('span[aria-hidden]'); if(on&&!i) b.insertAdjacentHTML('afterbegin','<span aria-hidden="true">✓ </span>'); if(!on&&i) i.remove(); });
  mdBekleyenCiz();
}
function mdBekleyenMi(){
  const T=ui._mdTaslak; if(!T) return false; if(T._eksik) return true;
  const A=mdAramaAlan(mdDurum());
  return MD_ARAMA_ALAN.some(k=>{ const t=String(T[k]??''); return String(A[k]??'')!==(k==='q'?t.trim():t); });
}
function mdBekleyenCiz(){
  const p=mdBekleyenMi(); const b=document.getElementById('mdBekleyen'); if(b) b.hidden=!p;
  const f=document.getElementById('mdAraForm'); if(f) f.classList.toggle('bekliyor',p);
}
function mdAraHataGizle(){ const h=document.getElementById('mdAraHata'); if(h){ h.hidden=true; h.textContent=''; } }
function mdAraHata(msg,alan){
  const h=document.getElementById('mdAraHata');
  if(h){ h.textContent=msg+' Arama uygulanmadı.'; h.hidden=false; }
  const el=alan&&document.getElementById(alan); if(el) el.focus();
}
/* ARA: formdaki tüm alanlar TEK seferde uygulanır. Tarihler tam ve
   desteklenen aralıkta olmalı; yarım/ters tarih uygulanmaz. */
function mdAraUygula(){
  mdTaslakOku();
  const T=ui._mdTaslak||mdAramaAlan(mdDurum());
  const b=mdMsOku('mdBas','Başlangıç'); if(b.hata) return mdAraHata(b.hata,'mdBas');
  const e=mdMsOku('mdBit','Bitiş');     if(e.hata) return mdAraHata(e.hata,'mdBit');
  if(b.v>e.v) return mdAraHata('Başlangıç bitişten sonra olamaz.','mdBit');
  if(mdDn(e.v)-mdDn(b.v)+1>MD_MAX_GUN) return mdAraHata('Dönem en çok üç yıl olabilir.','mdBit');
  const st=mdDurum();
  const site=T.site===''||T.site==null?null:+T.site;
  const donemDegisti=b.v!==st.bas||e.v!==st.bit;
  if(String(site??'')!==String(st.site??'')) st.alan='';
  Object.assign(st,{site,urun:T.urun||'',kurum:T.kurum||'',is:T.is||'',q:String(T.q||'').trim(),durum:T.durum||'',bas:b.v,bit:e.v});
  /* Elle verilen aralık hazır döneme denk değilse hazır dönem SEÇİLİ GÖRÜNMEZ. */
  if(donemDegisti) Object.assign(st,mdHazirBul(b.v,e.v));
  ui._mdTaslak=null;
  mdDurumYaz(st); mdYenidenCiz();
}
/* ---------- Dönem düğmeleri: tarihler VE sonuç birlikte güncellenir ----
   Hazır dönem, ‹ ›, Bugüne git yalnız DÖNEMİ uygular. Formda bekleyen başka
   bir değişiklik (durum, kurum…) taslak olarak bekler, sessizce uygulanmaz. */
function mdDonemUygula(st,y,bugun){
  Object.assign(st,y);
  if(ui._mdTaslak){ ui._mdTaslak.bas=st.bas; ui._mdTaslak.bit=st.bit; ui._mdTaslak._eksik=false; }
  mdDurumYaz(st);
  Promise.resolve(mdYenidenCiz()).then(()=>{ if(bugun) mdBugunGoster(); });
}
function mdHazirSec(h){
  const st=mdDurum(), g=mdBugun();
  /* Hazır dönemden hazır döneme geçişte merkez korunur (6 ay → 3 ay:
     30.09–30.12). Özel aralıktan geçişte merkez bugün (dönemdeyse) ya da
     aralığın başıdır. */
  const m=st.hazir?st.merkez:((g>=st.bas&&g<=st.bit)?g:st.bas);
  const [b,e]=mdHazirAralik(h,m);
  mdDonemUygula(st,{hazir:h,merkez:m,bas:b,bit:e});
}
function mdKaydir(d){
  const st=mdDurum();
  if(st.hazir){ const adim=st.hazir==='yil'?12:+st.hazir; const m=mdAyKaydir(st.merkez,d*adim);
    const [b,e]=mdHazirAralik(st.hazir,m);
    if(mdTarihDogrula(b).hata||mdTarihDogrula(e).hata) return;
    mdDonemUygula(st,{merkez:m,bas:b,bit:e}); return; }
  /* Özel aralık kendi uzunluğu kadar kayar. */
  const n=mdDn(st.bit)-mdDn(st.bas)+1, b=mdDnIso(mdDn(st.bas)+d*n), e=mdDnIso(mdDn(st.bit)+d*n);
  if(mdTarihDogrula(b).hata||mdTarihDogrula(e).hata) return;
  mdDonemUygula(st,{bas:b,bit:e});
}
/* "Bugüne git": merkez bugüne gelir; seçili hazır dönem ve diğer süzgeçler
   KORUNUR. Özel aralıkta uygulanan dönemin uzunluğu korunur, başlangıç
   bugün olur. Tablo bugünün sütununu görünür alana alır. */
function mdBuguneGit(){
  const st=mdDurum(), g=mdBugun();
  if(st.hazir){ const [b,e]=mdHazirAralik(st.hazir,g); mdDonemUygula(st,{merkez:g,bas:b,bit:e},true); return; }
  const n=mdDn(st.bit)-mdDn(st.bas);
  mdDonemUygula(st,{bas:g,bit:mdDnIso(mdDn(g)+n)},true);
}
function mdGecmisGizle(v){ const st=mdDurum(); st.gecmisGizle=!!v; mdDurumYaz(st); mdYenidenCiz(); }
/* Aramayı sıfırla: normal ilk açılış kapsamı (açık/kapalı gruplar korunur). */
function mdSifirla(){
  const st=mdDurum();
  ui._mdTaslak=null;
  mdDurumYaz({...MD_DEF,...mdVarsayilanDonem(),acik:st.acik});
  mdYenidenCiz();
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
/* Doğrudan (programatik) kapsam değişimi — ör. aktif filtre etiketi
   kaldırma, grup aç/kapa. Uygulanan aramayı değiştirir, taslağı da eşitler. */
function mdSet(ek){
  const st={...mdDurum(),...ek}; mdDurumYaz(st);
  if(ui._mdTaslak) MD_ARAMA_ALAN.forEach(k=>{ if(k in ek) ui._mdTaslak[k]=ek[k]==null?'':String(ek[k]); });
  mdYenidenCiz(); }
/* Kapsam değişince üst şerit de değişir; veri yeniden OKUNMAZ, yalnız
   aynı modelle yeniden çizilir. */
function mdYenidenCiz(){
  const box=document.getElementById('mdGovde'); if(!box) return;
  return listeler(box.parentElement,{onbellek:true});
}
function mdTemizle(){ mdSet({kurum:'',is:'',q:'',alan:'',urun:'',durum:''}); }

/* Aktif filtre şeridi (S2 `.afilt` konvansiyonu) — UYGULANAN süzgeçler. */
function mdAfiltCiz(M,st){
  const box=document.getElementById('mdAfilt'); if(!box) return;
  const p=[];
  if(st.kurum) p.push(['Kurum',orgKisa(M.cmap[st.kurum]||('#'+st.kurum),40),'kurum']);
  if(st.is) p.push(['İş',(M.jmap[st.is]||{}).title||('#'+st.is),'is']);
  if(st.alan) p.push(['Alan',(M.altById[st.alan]||{}).name||'','alan']);
  if(st.urun) p.push(['Ürün',M.pm[st.urun]||('#'+st.urun),'urun']);
  if(st.durum) p.push(['Durum',mdDurumAd(st.durum),'durum']);
  if(st.q) p.push(['Arama',st.q,'q']);
  box.innerHTML=p.length?`<div class="md-filtreler">
    ${p.map(([k,v,anahtar])=>`<span class="md-fchip">${esc(k)}: <b>${esc(v)}</b>
      <button type="button" aria-label="${esc(k)} filtresini kaldır" onclick="mdFiltreKaldir('${anahtar}')">✕</button></span>`).join('')}
    ${p.length>1?`<button type="button" class="btn-link" onclick="mdTemizle()">Tümünü temizle</button>`:''}</div>`:'';
}
function mdFiltreKaldir(k){ mdSet({[k]:''}); }

function mdCiz(){
  const M=ui._M, st=mdDurum(), box=document.getElementById('mdGovde'); if(!M||!box) return;
  mdAfiltCiz(M,st);
  mdTipGizle();                       // hücre yeniden çizilirken açık bilgi kartı kalmasın
  /* Her çizim görünür yüz kümesini SIFIRDAN kurar; seçim çubuğu buna
     göre uzlaştırılır (S8.1 §17). Gösterge de sıfırlanır. */
  _mdGoruntu=new Set();
  _mdLeg={};
  /* S17: sayaç, tablo ve Excel AYNI sonuçtan (mdSonuc) beslenir. */
  const S=mdSonuc(M,st);
  ui._mdSonuc=S;
  box.innerHTML=mdYilCiz(M,st,S);
  /* Lejant ekran başına TEKTİR (§4). Gövde çizildikten sonra eklenir:
     hangi görsel anlamların gerçekten kullanıldığı ancak o zaman bilinir. */
  const lej=mdLegend();
  if(lej) box.insertAdjacentHTML('beforeend',`<div class="md-lejant">${lej}</div>`);
  mdSecimCiz();
  mdOdakUygula();
  mdXlsKilit();
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

/* ---------- Çalışma kapsamındaki mecralar ----------
   Operasyonel kapsamda, en az bir aktif (arşivlenmemiş) alanı ya da
   pozisyonu olan lokasyonlar. Ekran, sonuç ve harita AYNI listeyi kullanır. */
function mdSiteler(M){
  return M.mecs.filter(mdKapsamda)
    .filter(m=>(M.altByMec[m.id]||[]).some(a=>!mdArsiv(a)&&((M.unitsByAlt[a.id]||[]).length||mdEszamanli(a)))
              ||(M.orphanByMec[m.id]||[]).length);
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

/* ---------- Tarih girişi doğrulaması (S10 §1) ----------
   Kök neden (yeniden üretildi, S10): tarih kutusu her tuşta aramayı
   uyguluyordu; Chrome yıl alanına "2" yazıldığı anda "0002-09-21" üretir.
   Artık: yazarken hiçbir şey uygulanmaz; yalnız Ara / Enter; iki tarih TAM
   ve DESTEKLENEN aralıktaysa uygulanır; yıl ASLA sessizce dönüştürülmez. */
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
/* Yarım yazılmış tarih kutusunun `value`'su BOŞTUR; tarayıcı bunu
   `validity.badInput` ile bildirir. "Seçilmedi" ile "eksik yazıldı"
   ayrı mesajdır. */
function mdMsOku(id,ad){
  const el=document.getElementById(id); if(!el) return {hata:`${ad} bulunamadı.`};
  if(!el.value&&el.validity&&el.validity.badInput) return {hata:`${ad} eksik yazıldı (gün, ay ve dört haneli yıl gerekli).`};
  const v=mdTarihDogrula(el.value,ad); if(v.hata) return v;
  return {v:el.value};
}

/* ==========================================================
   DURUM SÜZGECİ — DÖNEMSEL ANLAM (S17)
   Tüm seçenekler seçili ETKİN dönem [B, E] içindir; "durum tarihi" yok.
     Tümü                  kapsamdaki bütün yüzeyler (süzgeçlere göre)
     Opsiyonlu             dönemle kesişen, iptal edilmemiş opsiyonu olan yüzeyler
     Yayın                 dönemle kesişen kesin yayın kaydı olan yüzeyler
                           (geçmiş ve planlanan dahil — kayıtlar üzerinde
                           Yayında / Planlandı / Bitti ayrımı korunur)
     Müsait                dönemin TAMAMINDA engelleyici kaydı olmayan yüzeyler
     Dönem içinde boşalacak engelleyici zincirden sonra GERÇEK boşluğun
                           başladığı gün dönem içinde olan yüzeyler
   A/B yüzleri ayrı hesaplanır. Müsait ve Dönem içinde boşalacak yalnız
   statik yüzeyler içindir; LED'e kapasite / boş slot hesabı UYGULANMAZ.
   ========================================================== */
const MD_DURUM=[['','Tümü'],['opsiyon','Opsiyonlu'],['yayin','Yayın'],['musait','Müsait'],['bosalacak','Dönem içinde boşalacak']];
const MD_DURUM_IPUCU={'':'Seçili kapsamdaki bütün yüzeyler',
  opsiyon:'Dönemle kesişen, iptal edilmemiş opsiyonu olan yüzeyler',
  yayin:'Dönemle kesişen kesin yayın kaydı olan yüzeyler (geçmiş ve planlanan dahil)',
  musait:'Dönemin tamamında engelleyici kaydı olmayan statik yüzeyler',
  bosalacak:'Doluluk zincirinden sonra gerçek boşluğun dönem içinde başladığı statik yüzeyler'};
const MD_YAKINDA_GUN=30;                 // yalnız yüzey ayrıntısındaki "bugün" satırı (mdYuzeyDurum)
const mdDurumAd=k=>(MD_DURUM.find(x=>x[0]===k)||[0,''])[1];
function mdKayitKey(r){ return r.placement_id?'p'+r.placement_id:'b'+r.booking_id; }

/* Dönem içinde boşalma. Bir gün önce bloklu, o gün boş olmalı ve o gün
   [B, E] içinde olmalı. Gün düzeyinde tarama kesintisiz yenilemeyi ve
   bitişin ertesi günü başlayan kaydı kendiliğinden birleştirir — bunlar
   boşalma DEĞİLDİR. Bitişi bilinmeyen kayıt ileriye bloklar (boşalma yok);
   son halkası ay bazlı / bitişsiz eski kayıtsa gün UYDURULMAZ. Süresi
   dolmuş ama iptal edilmemiş opsiyon bloklamaya devam eder. */
function mdBosalma(M,u,B,E,ref){
  const seg=mdGunDilim(M,u,mdDnIso(mdDn(B)-1),E,ref);
  for(let i=1;i<seg.length;i++){
    const p=seg[i-1], s=seg[i];
    if(s.tip!=='musait'||p.tip==='musait'||s.s<B||s.s>E) continue;
    const r=p.r;
    if(!r||r.block_end==null) continue;
    if(r.record_kind==='legacy'&&(r.date_precision==='month'||r.date_precision==='open_end')) continue;
    let j=i-1; while(j>0&&seg[j-1].tip!=='musait') j--;
    const rs=seg[j].s, re=p.e;
    const zincir=(M.byUnit[u.id]||[]).filter(x=>x.commitment!=='cancelled'&&x.block_start<=re&&(x.block_end==null||x.block_end>=rs));
    return {tarih:s.s,zincir};
  }
  return null;
}

/* ==========================================================
   TEK SONUÇ (S17) — sayaç, tablo satırları, vurgular, seçilebilir yüzler
   ve Excel (genel / mecra / ürün grubu) BURADAN beslenir. İkinci hesap yok.
   Süzgeçler SONUÇTAKİ yüzeyleri daraltır; bir yüzün diğer kayıtlarını
   hesaptan çıkarmaz (sahte boşluk üretilemez): tabloda yüzün dönem
   içindeki GERÇEK dilimleri her zaman tüm kayıtlarla çizilir.
     kurum / iş   kayıt koşuludur (Opsiyonlu / Yayın / Tümü); Müsait'te
                  yüzeyi daraltmaz; Boşalacak'ta boşalan zincirde aranır
     metin        yüzey adı (pozisyon/alan/mecra) YA DA dönemdeki bir
                  kaydın kurum/iş adı; Müsait'te yalnız yüzey adı
   ========================================================== */
function mdSonuc(M,st){
  const E=mdEtkin(st), B=E.bas, Z=E.bit, d=st.durum||'', gun=mdBugun();
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const out={B,E:Z,etkin:E,durum:d,tip:(d==='musait'||d==='bosalacak')?'yuzey':d?'kayit':'',
    siteler:[],set:new Set(),kayit:new Set(),bosalma:{},yuzSay:0,ledSay:0,kayitSay:0,toplam:0,
    pasif:0,ledGizli:0,opsSure:0,hata:!Array.isArray(M.recs)||!!M.recsHata,bos:!!E.bos};
  if(out.hata||out.bos) return out;
  const kF=!!(st.kurum||st.is);
  const kOk=r=>(!st.kurum||String(r.customer_id)===String(st.kurum))&&(!st.is||String(r.work_id)===String(st.is));
  const kesisir=r=>r.commitment!=='cancelled'&&r.block_start<=Z&&(r.block_end==null||r.block_end>=B);
  const turOk=r=>d==='opsiyon'?r.commitment==='reserved':d==='yayin'?r.commitment==='confirmed':true;
  const recAra=r=>!q||mdAraEslesir(M,r,q);
  const siteler=st.site!=null?[M.mecById[st.site]].filter(m=>m&&mdKapsamda(m)):mdSiteler(M);
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(a=>!mdArsiv(a));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    const gruplar=[];
    alanlar.filter(a=>mdAlanGecer(M,a,st)).forEach(a=>{
      if(mdEszamanli(a)){
        if(out.tip==='yuzey'){ out.ledGizli++; return; }
        const l=(M.byArea[a.id]||[]).filter(r=>kesisir(r)&&turOk(r)&&kOk(r)&&recAra(r))
          .sort((p,x)=>String(p.block_start).localeCompare(String(x.block_start))||((p.placement_id||0)-(x.placement_id||0)));
        /* Süzgeçsiz aramada LED alanı kampanyasız da görünür ("kayıt yok"). */
        if(!l.length&&(d||kF||q)) return;
        if(d||kF) l.forEach(r=>out.kayit.add(mdKayitKey(r)));
        out.ledSay+=l.length;
        gruplar.push({a,esz:true,kayitlar:l});
        return;
      }
      const us=a._sahte?yetim:(M.unitsByAlt[a.id]||[]);
      const aktif=us.filter(u=>u.active!==false); out.pasif+=us.length-aktif.length;
      const sec=[];
      aktif.forEach(u=>{
        const adUyar=!q||[u.name,a.name,m.name,mdAile(M,a)].some(v=>String(v||'').toLocaleLowerCase('tr').includes(q));
        const l=(M.byUnit[u.id]||[]).filter(kesisir);
        if(d==='musait'){ if(!adUyar) return; out.toplam++; if(!l.length) sec.push(u); return; }
        if(d==='bosalacak'){
          if(adUyar) out.toplam++;
          const bo=mdBosalma(M,u,B,Z,gun); if(!bo) return;
          if(kF&&!bo.zincir.some(kOk)) return;
          if(!adUyar&&!bo.zincir.some(recAra)) return;
          sec.push(u); out.bosalma[u.id]=bo.tarih; bo.zincir.forEach(r=>out.kayit.add(mdKayitKey(r)));
          return;
        }
        out.toplam++;
        if(d==='opsiyon'||d==='yayin'||kF){
          const es=l.filter(r=>turOk(r)&&kOk(r)&&(adUyar||recAra(r)));
          if(!es.length) return;
          sec.push(u);
          es.forEach(r=>{ out.kayit.add(mdKayitKey(r)); out.kayitSay++;
            if(r.commitment==='reserved'&&r.option_expires_at&&r.option_expires_at<gun) out.opsSure++; });
          return;
        }
        if(q&&!adUyar&&!l.some(recAra)) return;
        if(q&&!adUyar) l.filter(recAra).forEach(r=>out.kayit.add(mdKayitKey(r)));
        sec.push(u);
      });
      if(!sec.length) return;
      sec.forEach(u=>out.set.add(u.id)); out.yuzSay+=sec.length;
      gruplar.push({a,esz:false,yuzler:sec});
    });
    if(gruplar.length) out.siteler.push({m,gruplar});
  });
  return out;
}

/* ---------- Tablo: mecra → ürün grubu (statik aylık tablo / LED kampanyaları) ---------- */
function mdYilCiz(M,st,S){
  /* Veri okunamadıysa "hepsi müsait" sonucuna DÜŞÜLMEZ (S10 §1). */
  if(S.hata) return `<div class="md-ms-ozet hata" role="alert"><b>Doluluk hesaplanamadı</b>
      <span>Doluluk kayıtları okunamadı; sonuç gösterilmiyor. Sayfayı yenileyip tekrar deneyin.</span></div>`;
  const ek=mdEksen(st);
  const ozet=mdSonucOzet(M,st,S,ek);
  if(S.bos) return ozet+`<div class="sec-card md-bos"><p class="empty">Seçili dönemin tamamı geçmişte; “Geçmiş ayları gizle” açıkken gösterilecek ay kalmıyor.</p>
      <button type="button" class="btn btn-outline btn-sm" onclick="mdGecmisGizle(false)">Geçmiş ayları göster</button></div>`;
  /* Süzgeç/durum açıkken gruplar açık gelir; serbest görünümde ağır tablo
     yalnız AÇIK grup için üretilir (S8.1 §14). */
  const daralt=!!(st.kurum||st.is||st.q||st.durum);
  let html='';
  S.siteler.forEach(({m,gruplar})=>{
    const tek=gruplar.length===1; let ic_='';
    gruplar.forEach(g=>{
      const acik=mdOdakGrubu(M,g.a,ui._mOdak)||mdAcikMi(st,g.a,mdVarsayilanAcik(M,g.a,{tek,arayis:daralt}));
      ic_+=g.esz?mdLedZaman(M,g.a,g.kayitlar,ek,acik,S):mdStatikZaman(M,g.a,g.yuzler,ek,acik,S,st);
    });
    html+=`<div class="md-yil-site" data-m="${m.id}"><div class="md-yil-h"><h3 class="md-yil-t">${esc(m.name)}</h3>
      <button type="button" class="btn btn-ghost btn-sm md-xls" data-xls onclick="mdExcel({site:${m.id}})"
        title="${esc(m.name)}: uygulanan aramadaki bütün ürünler (kapalı gruplar dahil)" aria-label="${esc(m.name)} — Excel indir">${ic('download',14)} Excel</button></div>${ic_}</div>`;
  });
  if(!html){
    /* Gerçekten boş sonuç gösterilir; ilgisiz satırlar GERİ GETİRİLMEZ. */
    const bos=({opsiyon:'Bu dönemde opsiyonlu kayıt yok.',yayin:'Bu dönemde yayın kaydı yok.',
      musait:'Dönemin tamamında müsait statik yüzey yok.',bosalacak:'Dönem içinde boşalacak statik yüzey yok.'})[S.durum]
      ||'Bu kapsamda gösterilecek yüzey ya da kampanya yok.';
    return ozet+`<div class="sec-card"><p class="empty">${esc(bos)}</p></div>`;
  }
  return ozet+html;
}
/* Uygulanan aramanın başlığı: dönem, kısmi aylar, durum, kapsam ve sayaç.
   Taslakta bekleyen değişiklik burada GÖRÜNMEZ — burası uygulanandır. */
function mdSonucOzet(M,st,S,ek){
  const E=S.etkin;
  const kapsam=[st.site!=null?(M.mecById[st.site]||{}).name:'Tüm mecralar',st.urun?M.pm[st.urun]:''].filter(Boolean).join(' · ');
  const kismi=ek.aylar.filter(a=>!a.tam).map(a=>`${AY_UZUN[+a.ym.slice(5,7)-1]} ${a.ym.slice(0,4)} ${+a.s.slice(8)===+a.e.slice(8)?`yalnız ${+a.s.slice(8)}`:`${+a.s.slice(8)}–${+a.e.slice(8)}`}`);
  const LED=S.ledSay?` · <b>${S.ledSay}</b> LED kampanyası`:'';
  const say=({'':`<b>${S.yuzSay}</b> statik yüz${LED}`,
    opsiyon:`<b>${S.set.size}</b> yüz opsiyonlu (${S.kayitSay} kayıt)${LED}`,
    yayin:`<b>${S.set.size}</b> yüzde yayın kaydı var (${S.kayitSay} kayıt; geçmiş ve planlanan dahil)${LED}`,
    musait:`<b>${S.toplam}</b> yüzeyden <b>${S.set.size}</b> tanesi dönemin tamamında müsait`,
    bosalacak:`<b>${S.set.size}</b> yüzey dönem içinde boşalıyor`})[S.durum];
  const not=[];
  if(S.durum==='musait'&&(st.kurum||st.is)) not.push('Kurum / iş süzgeci müsaitliği daraltmaz — başka müşterilerin kayıtları da yüzeyi bloklar.');
  if(S.durum==='bosalacak'&&(st.kurum||st.is)) not.push('Yalnız boşalan doluluk zincirinde seçili kurumun / işin kaydı bulunan yüzeyler.');
  if(S.durum==='bosalacak') not.push('Kesintisiz yenileme ya da ertesi gün başlayan kayıt boşalma sayılmaz; bitişi bilinmeyen kayıttan tarih üretilmez.');
  if(S.ledGizli) not.push(`LED alanları eşzamanlıdır; “${mdDurumAd(S.durum)}” statik yüzeylere aittir ve LED için hesaplanmaz.`);
  if(S.durum==='opsiyon'&&S.opsSure) not.push(`${S.opsSure} opsiyonun geçerlilik süresi dolmuş — yüzeyi bloklamaya devam ediyor, karar bekliyor.`);
  if(S.pasif) not.push(`${S.pasif} pasif (satışa kapalı) yüz sonuçta yer almaz.`);
  return `<div class="md-sonuc md-dz-${S.durum||'tumu'}" role="status" aria-live="polite">
    <div class="md-sonuc-h"><span class="md-sonuc-e">Uygulanan arama</span>
      <b class="mono">${esc(mdNokta(E.esas.bas))} – ${esc(mdNokta(E.esas.bit))}</b>
      <span class="md-sonuc-c">${esc(mdHazirAd(st))}</span>
      <span>Durum: <b>${esc(mdDurumAd(S.durum))}</b></span>
      <span>${esc(kapsam)}</span></div>
    ${E.gizli||E.bos?`<div class="md-ms-uyari">Geçmiş aylar gizli${E.bos?' — dönemin tamamı geçmişte.':`: etkin dönem <b class="mono">${esc(mdNokta(E.bas))} – ${esc(mdNokta(E.bit))}</b>. Tablo, sayaç ve Excel etkin dönemi kullanır.`}</div>`:''}
    ${!S.bos&&kismi.length?`<div class="muted md-sonuc-k">Kısmi ay: ${esc(kismi.join(' · '))} — dönem dışındaki günler gri gösterilir ve müsait sayılmaz.</div>`:''}
    ${!S.bos?`<div class="md-sonuc-s">${say}</div>`:''}
    ${not.map(x=>`<div class="muted">${esc(x)}</div>`).join('')}</div>`;
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
/* Ay sütunu genişliği ay SAYISINA göre: kısa dönem geniş, yıl dar ama
   okunur; yazı küçültülmez, tablo kendi içinde kayar. */
function mdAyGen(n){ return n<=4?250:n<=7?200:170; }
const MD_YUZ_GEN=40, MD_KMP_GEN=230;
function mdCssSerit(dilim){ const top=dilim.reduce((t,d)=>t+d.gun,0)||1; let x=0;
  return `linear-gradient(90deg,${dilim.map(d=>{ const a=x/top*100; x+=d.gun; const b=x/top*100;
    return `${MD_RENK[d.tip].bar} ${a.toFixed(2)}% ${b.toFixed(2)}%`; }).join(',')})`; }

/* Ay sütunundaki "bugün" işareti (mavi çizgi). Renk tek taşıyıcı değildir;
   başlıkta "Bugün N" yazar. */
function mdAyIsaret(ay,baslik){
  const gun=mdBugun(), n=mdDn(ay.ayE)-mdDn(ay.ayB)+1;
  if(gun<ay.ayB||gun>ay.ayE) return '';
  _mdLeg.bugun=true;
  const yuzde=((mdDn(gun)-mdDn(ay.ayB)+0.5)/n*100).toFixed(2);
  return `<span class="mtb-bugun${baslik?' b':''}" style="left:${yuzde}%" aria-hidden="true"></span>`;
}
/* Kısmi ay başlıkta açıkça yazar: "Haziran 2026 · yalnız 30", "Aralık 2026 · 1–30". */
function mdAyKismi(ay){ if(ay.tam) return ''; const s=+ay.s.slice(8), e=+ay.e.slice(8); return s===e?`yalnız ${s}`:`${s}–${e}`; }
function mdTabloBas(ek,aylar,ilk){
  const buYm=mdYm(mdBugun());
  return `<thead><tr>${ilk}
    ${aylar.map(ay=>`<th scope="col" class="mtb-ay${ay.ym===buYm?' bu':''}${ay.tam?'':' kismi'}${mdKisaAy(ay)?' dar':''}" data-ym="${ay.ym}"
        ${ay.tam?'':`title="${esc(`Seçili dönem bu ayın yalnız ${mdNokta(ay.s)} – ${mdNokta(ay.e)} günlerini kapsar`)}"`}>
      <span class="mtb-ay-t">${esc(AY_UZUN[+ay.ym.slice(5,7)-1])} <em>${esc(ay.ym.slice(0,4))}</em></span>${ay.tam?'':`<i class="mtb-kismi">${esc(mdAyKismi(ay))}</i>`}${ay.ym===buYm?`<i class="mtb-bu-e">Bugün ${+mdBugun().slice(8)}</i>`:''}${mdAyIsaret(ay,true)}</th>`).join('')}
  </tr></thead>`;
}
/* Bir haftadan kısa kısmi ay (ör. varsayılan dönemin "Haziran · yalnız 30"
   sütunu) dar sütundur — Excel üreticisiyle aynı kural. */
const MD_KISA_GEN=120;
function mdKisaAy(a){ return !a.tam&&mdDn(a.e)-mdDn(a.s)+1<=7; }
function mdAyKol(aylar){ return aylar.map(a=>mdKisaAy(a)?`<col style="width:${MD_KISA_GEN}px">`:'<col>').join(''); }
/* S18: Pano sütunu içeriğine göre: sıra no + seçim kutusu + en uzun pano
   kodu + iç boşluk. Kod kırpılmaz (uzun kodda sütun genişler); artan alan
   ay sütunlarına kalır. Genişlik `--pg` ile hem <col>'a hem yapışkan Yüz
   sütununun `left` konumuna verilir (ikisi aynı sayıdan beslenmeli). */
function mdPanoGen(gr){
  const uz=Math.max(4,...gr.map(g=>String(g.base||'').length));
  return Math.min(220,Math.max(80,Math.ceil(56+uz*8.4)));
}
function mdTabloAc(ek,sabitGen,sinif,stil){
  const g=mdAyGen(ek.aylar.length);
  return `<div class="mtb-wrap"><table class="mtb ${sinif||''}" style="min-width:${sabitGen+ek.aylar.reduce((t,a)=>t+(mdKisaAy(a)?MD_KISA_GEN:g),0)}px;${stil||''}">`;
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
    const kisa=p.s===p.e?mdTrKisa(p.s):`${mdTrKisa(p.s)}–${mdTrKisa(p.e)}`;
    const aralik=tamAy?`1–${+ay.ayE.slice(8)} ${AY_UZUN[+ay.ym.slice(5,7)-1]}`:kisa;
    _mdLeg.musait=true;
    const bos=o.bosalma&&o.bosalma===p.s;
    const vurgu=(o.musait||bos)?' vurgu':'';
    return `<button type="button" class="mtb-b t-musait${tek?' tek':''}${vurgu}${bos?' bosalma':''}" data-s="${p.s}" data-e="${p.e}"
      aria-label="${esc(`${u.name} · ${bos?'Boşalıyor · ':''}Müsait · ${aralik} — kayıt eklemek için açın`)}" title="${esc(`${u.name} · ${bos?'bu günden itibaren boşalıyor · ':''}müsait ${aralik} · kayıt ekle`)}"
      onclick="mdBosAc(${u.id},'${p.s}','${p.e}')"><b>${bos?'Boşalıyor':'Müsait'}${tamAy?'':` <span class="mtb-t">${esc(kisa)}</span>`}</b></button>`;
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
/* Yüz harfi yalnız adda gerçekten varsa ("P1-A" → A); tek yüzlü panoya
   uydurulmaz. Kural A/B eşlemesiyle (posParts / groupUnits) aynıdır. */
function mdYuzHarf(ad){ const m=String(ad||'').trim().match(/^(.*[^\s._-])[\s._-]*([ABab])$/); return m?m[2].toUpperCase():''; }
/* Excel düğmesi: indirme sırasında ve sonuç boş/yüklenirken kilitlenir. */
function mdXlsBtn(k,ad){ return `<button type="button" class="btn btn-ghost btn-sm md-xls" data-xls onclick='mdExcel(${JSON.stringify(k)})'
  title="${esc(ad)}: uygulanan aramanın sonuçları" aria-label="${esc(ad)} — Excel indir">${ic('download',14)} Excel</button>`; }

/* STATİK ürün grubu: yalnız SONUÇTAKİ yüzler. A/B'den yalnız biri sonuçtaysa
   diğeri zorla eklenmez; pano satırı o yüzle çizilir. */
function mdStatikZaman(M,a,yuzler,ek,acik,S,st){
  const urun=M.pm[a.product_id]||'';
  const key=mdGrupKey(a);
  const d=S.durum;
  const kesisir=r=>r.commitment!=='cancelled'&&r.block_start<=ek.bit&&(r.block_end==null||r.block_end>=ek.bas);
  const kayitSay=yuzler.reduce((n,u)=>n+(M.byUnit[u.id]||[]).filter(kesisir).length,0);
  const tumu=(a._sahte?(M.orphanByMec[a.mecra_id]||[]):(M.unitsByAlt[a.id]||[])).filter(u=>u.active!==false).length;
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(urun||a.name)}</span>
        <span class="md-as">${esc(urun?a.name:'')}${urun?' · ':''}${yuzler.length===tumu?`${tumu} yüz`:`<b>${yuzler.length}</b> / ${tumu} yüz eşleşiyor`}</span>
        <span class="md-oz">${kayitSay?`${kayitSay} kayıt`:'kayıt yok'}</span>
      </button>
      <span class="md-ah-r">
        ${mdXlsBtn({alan:a.id},`${urun||a.name}`)}
        ${acik&&isAdmin()&&!a._sahte?`<button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id})"
          title="Envanter: bu alana yeni pozisyon ekle (yönetici)">${ic('plus',15)} Pozisyon</button>`:''}
      </span>
    </header>`;
  /* Kapalı grubun tablosu HİÇ kurulmaz (S8.1 §14); Excel'e yine dahildir. */
  if(!acik) return `<section class="sec-card md-alan md-kapali" data-a="${a.id}">${baslik}</section>`;
  const gun=mdBugun();
  const aylar=ek.aylar;
  const gr=groupUnits(yuzler);
  const pg=mdPanoGen(gr);
  /* Kurum/iş süzgeci bir KAYIT sorusudur: eşleşmeyen kayıt soluklaşır ama
     yüzeyi bloklamaya devam eder — gizlenen kayıt yüzeyi müsait GÖSTEREMEZ.
     Dilimler daima yüzeyin TÜM engelleyici kayıtlarıyla hesaplanır. */
  const kOk=r=>(!st.kurum||String(r.customer_id)===String(st.kurum))&&(!st.is||String(r.work_id)===String(st.is));
  const ctx={gun,
    eslesir:(!d&&(st.kurum||st.is))?kOk:null,
    vurgula:S.kayit.size&&d!=='bosalacak'?(r=>S.kayit.has(mdKayitKey(r))):null,
    ikincil:(d==='opsiyon'||d==='yayin')?(r=>!S.kayit.has(mdKayitKey(r))):null,
    musait:d==='musait'};
  let no=0;
  const rows=gr.map(g=>{
    const yz=[g.A,g.B].filter(Boolean);
    if(yz.some(u=>mdYuzHarf(u.name))) _mdLeg.ab=true;
    yz.forEach(u=>_mdGoruntu.add(u.id));
    const secBtn=yz.map(u=>u.id);
    const secSay=secBtn.filter(id=>ui._mSec.has(id)).length;
    no++;
    const bosNot=yz.filter(u=>S.bosalma[u.id]).map(u=>`<span class="mtb-bos" title="${esc(`${u.name}: ${mdNokta(S.bosalma[u.id])} tarihinden itibaren boş`)}">${esc(mdYuzHarf(u.name)||u.name)} boşalır ${esc(mdTrKisa(S.bosalma[u.id]))}</span>`).join('');
    return yz.map((u,i)=>{
      const seg=mdGunDilim(M,u,ek.bas,ek.bit,gun);
      const oc={...ctx,bosalma:S.bosalma[u.id]||null};
      const harf=mdYuzHarf(u.name);
      return `<tr class="mtb-r${i===0?' ilk':''}${i===yz.length-1?' son':''}${ui._mSec.has(u.id)?' sec':''}" data-u="${u.id}">
        ${i===0?`<th scope="rowgroup" rowspan="${yz.length}" class="mtb-pano">
          <span class="mtb-no" aria-hidden="true">${no}</span>
          <input type="checkbox" class="mtl-cb" ${secSay===secBtn.length?'checked':''}
             aria-label="${esc(g.base)} seç (toplu opsiyon/yayın için; indirmeyi etkilemez)" onchange="mdTumunuSec([${secBtn.join(',')}],this.checked)">
          <button type="button" class="mtb-ad btn-link" title="${esc(g.base)} — yüzey detayı" onclick="mYuzeyAc(${yz[0].id})">${esc(g.base)}</button>${bosNot}</th>`:''}
        <td class="mtb-yz">${harf?`<b title="${harf==='A'?'Ön yüz':'Arka yüz'}">${harf}</b>`:''}</td>
        ${aylar.map(ay=>mdYuzHucre(M,u,mdAyHucre(seg,ay),ay,oc)).join('')}</tr>`;
    }).join('');
  }).join('');

  return `<section class="sec-card md-alan" data-a="${a.id}">${baslik}
    ${mdTabloAc(ek,pg+MD_YUZ_GEN,'',`--pg:${pg}px`)}
      <colgroup><col class="c-pano"><col class="c-yuz">${mdAyKol(aylar)}</colgroup>
      ${mdTabloBas(ek,aylar,'<th scope="col" class="mtb-pano">Pano</th><th scope="col" class="mtb-yz">Yüz</th>')}
      <tbody>${rows}</tbody></table></div></section>`;
}

/* LED: satır = kampanya/yayın kaydı (tarihsel LED tablosunun okunuşu);
   aylar sütunlarda. Aynı ayda birden çok kampanya olağandır. Kampanyanın
   olmadığı ay BOŞTUR — "satılabilir boş slot" DEĞİLDİR, müsait
   boyanmaz. Kapasite/ekran/slot üretilmez; ARC/ERK gibi eski şeritler
   fiziksel ekran sayılmaz. Kısmi ayda yalnız dönem içindeki günler yazılır. */
/* Kampanyanın bir aydaki (dönemle kırpılmış) kısmı — ekran ve Excel ortak. */
function mdLedAyParca(r,ay){
  const bitis=r.block_end==null?ay.e:r.block_end;
  if(r.block_start>ay.e||bitis<ay.s) return null;
  const s=r.block_start<ay.s?ay.s:r.block_start, e=bitis>ay.e?ay.e:bitis;
  return {s,e,tamAy:s===ay.ayB&&e===ay.ayE};
}
function mdLedZaman(M,a,l,ek,acik,S){
  const gun=mdBugun();
  const aylar=ek.aylar;
  const sirali=[...l].sort((p,q)=>String(p.block_start).localeCompare(String(q.block_start))||((p.placement_id||0)-(q.placement_id||0)));
  const ekranlar=(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false);
  const vurgu=r=>!!(S&&S.durum&&S.kayit.has(mdKayitKey(r)));
  const satir=r=>{
    const k=mdKayitMetin(r,gun);
    const eski=r.record_kind==='legacy';
    const tip=r.commitment==='reserved'?'opsiyon':'yayin';
    const gecmis=k.zm==='bitti', plan=k.zm==='yaklasan'&&tip==='yayin';
    if(tip==='opsiyon') _mdLeg.ops=true; else if(gecmis) _mdLeg.gecmis=true; else if(plan) _mdLeg.plan=true; else _mdLeg.yayin=true;
    const hucre=ay=>{
      const isaret=mdAyIsaret(ay,false);
      const p=mdLedAyParca(r,ay);
      if(!p) return `<td class="mtb-c led-bos">${isaret}</td>`;
      const aralik=p.tamAy?'tüm ay':p.s===p.e?mdTrKisa(p.s):`${mdTrKisa(p.s)}–${mdTrKisa(p.e)}`;
      return `<td class="mtb-c tek"><button type="button" class="mtb-b t-${tip} tek${gecmis?' gecmis':''}${plan?' plan':''}${vurgu(r)?' vurgu':''}"
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
        <span class="md-oz">${ekranlar.length} fiziksel ekran · bugün ${aktif} aktif kampanya · dönemde ${sirali.length} kayıt</span>
      </button>
      <span class="md-ah-r">${sirali.length?mdXlsBtn({alan:a.id},a.name):''}
        <button class="btn btn-sm act act-work" onclick="mForm({hedefler:[{alt_mecra_id:${a.id}}]})">${ic('plus',15)} Yayın Ekle</button></span></header>`;
  if(!acik) return `<section class="sec-card md-alan md-led md-kapali" data-a="${a.id}">${baslik}</section>`;
  return `<section class="sec-card md-alan md-led" data-a="${a.id}">${baslik}
    ${ekranlar.length?`<p class="md-ekran">${ekranlar.map(u=>`<span class="chip" title="${esc([u.konum,u.olcu,u.yayin_format].filter(Boolean).join(' · ')||'teknik bilgi kayıtlı değil')}">${esc(u.name)}${u.yayin_format?` <em>${esc(u.yayin_format)}</em>`:''}</span>`).join('')}</p>`:''}
    <p class="md-not mtb-led-not">Her satır bir kampanyadır; aynı ayda birden çok kampanya yayında olabilir. Boş ay satılabilir boş slot anlamına gelmez.</p>
    ${sirali.length?`${mdTabloAc(ek,MD_KMP_GEN,'mtb-led')}
      <colgroup><col style="width:${MD_KMP_GEN}px">${mdAyKol(aylar)}</colgroup>
      ${mdTabloBas(ek,aylar,'<th scope="col" class="mtb-kmp">Kampanya</th>')}
      <tbody>${sirali.map(satir).join('')}</tbody></table></div>`
      :`<p class="empty" style="padding:10px 0">${esc(mdEksenAdi(ek))} döneminde yayın kaydı yok.</p>`}
    </section>`;
}

/* ==========================================================
   ÇOKLU SEÇİM → tek toplu yerleşim (B36)
   ========================================================== */
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
/* Hedefi gizleyecek UYGULANMIŞ süzgeçler temizlenir ve bu AÇIKÇA söylenir.
   Dönem ve "geçmiş ayları gizle" süzgeç değildir; yalnız gerekirse değişir. */
function mdOdakSuzgec(st,hedef){
  const u=hedef.unit, a=hedef.alan;
  const pid=u?(u.product_id!=null?u.product_id:(a&&a.product_id)):(a&&a.product_id);
  const gizleyen=[st.kurum&&'kurum',st.is&&'iş',st.q&&'arama',st.durum&&'durum',
    (st.urun&&String(st.urun)!==String(pid))&&'ürün',(st.alan&&a&&String(st.alan)!==String(a.id))&&'alan'].filter(Boolean);
  Object.assign(st,{kurum:'',is:'',q:'',durum:''});
  if(gizleyen.includes('ürün')) st.urun='';
  if(gizleyen.includes('alan')) st.alan='';
  return gizleyen;
}
/* `o.ayrinti`: Hareketler'den gelen derin bağlantı kaydın ayrıntısını da
   açar (PS9 kapanış §2). Ayrıntı penceresindeki "Takvimde göster" ise
   pencereyi KAPATIR ve yeniden AÇMAZ (S11 §7). Kayıt uygulanan dönemin
   dışındaysa dönem kayda taşınır (hazır dönem korunur). */
async function medyaOdak(pid,o){
  o=o||{};
  const M=await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid);
  if(!r){ mpAlert('Bu mecra kaydı artık yok.'); return; }
  ui._mOdak=pid; ui._mOdakAyrinti=o.ayrinti!==false;
  const st=mdDurum();
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  const gizleyen=mdOdakSuzgec(st,{unit:M.unitById[r.unit_id],alan:M.altById[altId]});
  ui._mOdakNot=gizleyen.length?`Hedef kaydı göstermek için şu süzgeçler kaldırıldı: ${gizleyen.join(', ')}.`:'';
  st.site=r.mecra_id;
  mdPencereyeAl(st,r.block_start);
  /* Ürün grubunu AÇ: kapalı grubun satırları hiç üretilmediği için hedef
     aksi halde DOM'da olmazdı. */
  if(altId!=null) st.acik={...(st.acik||{}),[mdGrupKey({id:altId})]:true};
  medyaGit(st);
}
/* Haritadan / yüz bağlamından tabloya ("Dolulukta göster"): doğru mecra +
   ürün grubu açılır, UYGULANAN DÖNEM KORUNUR, panonun (A/B) satırları
   vurgulanır. `uid` bir yüz ya da yüz listesi olabilir. */
async function medyaYuzeyOdak(uid){
  const ids=Array.isArray(uid)?uid:[uid];
  const M=ui._M||await mdYukle(); const u=M.unitById[ids[0]];
  if(!u){ mpAlert('Bu yüzey artık yok.'); return; }
  const st=mdDurum();
  const gizleyen=mdOdakSuzgec(st,{unit:u,alan:M.altById[u.alt_mecra_id]});
  ui._mOdakNot=gizleyen.length?`Panoyu göstermek için şu süzgeçler kaldırıldı: ${gizleyen.join(', ')}.`:'';
  st.site=u.mecra_id;
  if(u.alt_mecra_id!=null) st.acik={...(st.acik||{}),[mdGrupKey({id:u.alt_mecra_id})]:true};
  if(mdEtkin(st).bos) st.gecmisGizle=false;
  ui._mOdakU=ids.filter(i=>M.unitById[i]);
  medyaGit(st);
}
async function medyaAlanOdak(altId){
  const M=ui._M||await mdYukle(); const a=M.altById[altId]; if(!a) return;
  const st=mdDurum();
  const gizleyen=mdOdakSuzgec(st,{alan:a});
  ui._mOdakNot=gizleyen.length?`Yayın alanını göstermek için şu süzgeçler kaldırıldı: ${gizleyen.join(', ')}.`:'';
  st.site=a.mecra_id;
  st.acik={...(st.acik||{}),[mdGrupKey({id:altId})]:true};
  if(mdEtkin(st).bos) st.gecmisGizle=false;
  ui._mOdakA=altId;
  medyaGit(st);
}
function mdOdakUygula(){
  if(ui._mOdakU||ui._mOdakA){
    const uids=ui._mOdakU||[], aid=ui._mOdakA; ui._mOdakU=null; ui._mOdakA=null;
    const satirlar=uids.map(u=>document.querySelector(`#mdGovde tr[data-u="${u}"]`)).filter(Boolean);
    const el=satirlar[0]||(aid!=null?document.querySelector(`#mdGovde section[data-a="${aid}"]`):null);
    const not=ui._mOdakNot; ui._mOdakNot='';
    const ob=document.getElementById('mdOdak');
    const eksik=uids.length&&!satirlar.length;
    if(ob&&(not||eksik)) ob.innerHTML=`<div class="md-odak-b" role="status">${ic('lists',15)}<span>${not?`<em class="md-odak-not">${esc(not)}</em>`:''}
        ${eksik?'<em class="md-odak-not">Pano bu aramada görünmüyor (pasif olabilir).</em>':''}</span>
      <button class="afilt-x" onclick="this.closest('.md-odak-b').remove()" aria-label="Kapat">✕</button></div>`;
    satirlar.forEach(tr=>tr.classList.add('md-odak'));
    if(el){ if(!satirlar.length) el.classList.add('md-odak');
      setTimeout(()=>{ el.scrollIntoView({block:'center',inline:'nearest'});
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

/* ==========================================================
   MECRALAR'DAN DOĞRUDAN EXCEL (S17)
   Ekrandaki UYGULANMIŞ aramanın iç kullanım çıktısı; Raporlar'a
   yönlendirmez ve Raporlar'ın ayarlarını/saklı seçimlerini okumaz.
     {}            genel araç çubuğu: aramadaki tüm mecralar / ürünler
     {site:id}     mecra başlığı: yalnız o mecranın sonuçları
     {alan:id}     ürün grubu başlığı: yalnız o grubun sonuçları
   "Görünen tablo" = bütün arama sonucu (mdSonuc): kaydırmayla erişilen
   satırlar ve KAPALI gruplar dahil; toplu kayıt için işaretlenen yüzey
   kutuları kapsamı DEĞİŞTİRMEZ; A/B'den yalnız biri sonuçtaysa diğeri
   eklenmez. Hesap Raporlar › Mecra doluluk tablosu ile ortaktır
   (mdGunDilim / mdDonemAylari / rpDolHucre) ve dosya aynı ExcelJS
   üreticisiyle (rpXlsDosya / rpXlsDoluluk) yazılır. İkinci hesap yok.
   ========================================================== */
let _mdIndiriliyor=false;
function mdXlsKapsam(S,k){
  k=k||{};
  return S.siteler.filter(x=>k.site==null||String(x.m.id)===String(k.site))
    .map(x=>({m:x.m,gruplar:x.gruplar.filter(g=>k.alan==null||String(g.a.id)===String(k.alan))}))
    .filter(x=>x.gruplar.length);
}
/* Kapsamdaki kayıtların imzası — indirme anında veri yeniden okunur;
   imza değiştiyse eski sonuçla dosya ÜRETİLMEZ. */
function mdXlsImza(M,S,k){
  const p=[];
  const r_=r=>[mdKayitKey(r),r.block_start,r.block_end,r.commitment,r.customer_id,M.cmap[r.customer_id]||'',r.work_id,
    (M.jmap[r.work_id]||{}).title||'',r.option_expires_at||'',r.record_kind,r.date_precision||''];
  mdXlsKapsam(S,k).forEach(({gruplar})=>gruplar.forEach(g=>{
    if(g.esz){ p.push(['a',g.a.id]); g.kayitlar.forEach(r=>p.push(r_(r))); return; }
    g.yuzler.forEach(u=>{ p.push(['u',u.id,u.name]);
      (M.byUnit[u.id]||[]).filter(r=>r.block_start<=S.E&&(r.block_end==null||r.block_end>=S.B)).forEach(r=>p.push(r_(r))); });
  }));
  return JSON.stringify(p);
}
/* İndirme düğmeleri: veri okunurken, indirme sürerken ya da sonuç boşken kilitli. */
function mdXlsKilit(){
  const S=ui._mdSonuc;
  const bos=!S||S.hata||S.bos||(!S.yuzSay&&!S.siteler.some(x=>x.gruplar.some(g=>g.esz&&g.kayitlar.length)));
  document.querySelectorAll('[data-xls]').forEach(b=>{
    const kilit=_mdIndiriliyor||ui._mdYukleniyor||(b.id==='mdXlsGenel'&&bos);
    b.disabled=!!kilit; b.setAttribute('aria-busy',_mdIndiriliyor?'true':'false'); });
}
/* Kapsamın dosya/başlık adı. */
function mdXlsAd(M,st,k,sl){
  if(k.alan!=null){ const s=sl[0], g=s&&s.gruplar[0]; if(g) return [s.m.name,g.esz?g.a.name:(g.a._sahte?'Diğer pozisyonlar':mdAile(M,g.a))]; }
  if(k.site!=null&&sl[0]) return [sl[0].m.name];
  return [st.site!=null?(M.mecById[st.site]||{}).name:'Tüm mecralar',st.urun?M.pm[st.urun]:''].filter(Boolean);
}
/* Excel modeli: rpXlsDoluluk'un beklediği yapı (Raporlar ile aynı sayfa
   düzeni) + LED için ayların sütunda olduğu kampanya sayfası. */
function mdXlsModel(M,st,S,k){
  const sl=mdXlsKapsam(S,k), gun=mdBugun(), aylar=mdDonemAylari(S.B,S.E);
  const kull=new Set(), sayfalar=[];
  const adParca=mdXlsAd(M,st,k,sl);
  const suz=[st.kurum&&`Kurum: ${M.cmap[st.kurum]||'#'+st.kurum}`,st.is&&`İş: ${(M.jmap[st.is]||{}).title||'#'+st.is}`,
    st.urun&&k.alan==null&&`Ürün: ${M.pm[st.urun]||''}`,st.q&&`Arama: “${st.q}”`,S.etkin.gizli&&`Geçmiş aylar gizli (arama: ${mdNokta(S.etkin.esas.bas)} – ${mdNokta(S.etkin.esas.bit)})`].filter(Boolean);
  const m={tur:'Mecralar — doluluk tablosu',baslik:`Doluluk tablosu — ${adParca.join(' · ')}`,an:new Date(),ic:true,dis:false,
    /* S18: süzgeçler 2. satırdaki kısa kapsam bilgisinde; sabit üst alanda ayrı açıklama satırı yok. */
    alici:'',aciklama:'',bas:S.B,bit:S.E,aylar,
    kapsam:[`Durum: ${mdDurumAd(S.durum)}`,...suz].join('   ·   '),sayfalar:[],led:[]};
  sl.forEach(({m:mc,gruplar})=>gruplar.forEach(g=>{
    const a=g.a;
    if(g.esz){
      const L={ad:rpSayfaAdi(String(a.name).toLocaleLowerCase("tr").startsWith(rpMecraKisa(mc.name).toLocaleLowerCase("tr"))?a.name:`${rpMecraKisa(mc.name)} ${a.name}`,kull),baslik:`${mc.name} · ${a.name}`,sure:mdSure(a),
        kayitlar:g.kayitlar.map(r=>{ const km=mdKayitMetin(r,gun);
          return {kurum:r.customer_name?mdKisaAd(r.customer_name,30):'Kurum belirtilmemiş',is:r.work_title||(r.record_kind==='legacy'?'eski kayıt':''),
            durum:km.durum,donem:km.donem,tip:r.commitment==='reserved'?'opsiyon':'yayin',
            aylar:aylar.map(ay=>{ const p=mdLedAyParca(r,ay); return p?(p.tamAy?'Tüm ay':p.s===p.e?rpTrKisa(p.s):`${rpTrKisa(p.s)}–${rpTrKisa(p.e)}`):''; })}; })};
      m.led.push(L);
      sayfalar.push({ad:L.ad,yon:'landscape',ozel:ws=>rpXlsLedAylik(ws,m,L)});
      return;
    }
    const aile=a._sahte?'Diğer pozisyonlar':mdAile(M,a);
    const ys=g.yuzler.map(u=>{ const p=rpYuzAyir(u.name);
      return {key:'u'+u.id,u,kod:u.name,pano:p.base,yuz:p.yuz,
        olcu:u.olcu||((M.prods.find(x=>String(x.id)===String(u.product_id||a.product_id))||{}).olcu)||'',
        seg:rpYuzSegModel(M,u,S.B,S.E,gun,true)}; });
    const olculer=[...new Set(ys.map(y=>y.olcu).filter(Boolean))];
    const sf={key:mc.id+'|'+a.id,mecra:mc.name,aile,baslik:`${mc.name} · ${aile}`,
      ad:rpSayfaAdi(`${rpMecraKisa(mc.name)} ${aile}`,kull),olcu:olculer.length===1?olculer[0]:'',
      panolar:rpPanolar(ys,aylar,()=>true)};
    m.sayfalar.push(sf);
    sayfalar.push({ad:sf.ad,yon:'landscape',ozel:ws=>rpXlsDoluluk(ws,m,sf,sf.panolar)});
  }));
  const ad=exportDosyaAdi('Medyapark','Doluluk',...adParca,S.durum?mdDurumAd(S.durum):'',S.B,S.E)+'.xlsx';
  return {m,sayfalar,ad};
}
async function mdExcel(k){
  k=k||{};
  if(_mdIndiriliyor||ui._mdYukleniyor||!ui._M) return;
  const st=mdDurum(), M0=ui._M, S0=mdSonuc(M0,st);
  if(S0.hata){ mpAlert('Doluluk kayıtları okunamadı; dosya oluşturulmadı.','Excel oluşturulamadı'); return; }
  if(S0.bos||!mdXlsKapsam(S0,k).length){ mpAlert('Uygulanan aramada indirilecek yüzey ya da kampanya yok.','Excel oluşturulmadı'); return; }
  _mdIndiriliyor=true; mdXlsKilit();
  try{
    const imza=mdXlsImza(M0,S0,k), arama=JSON.stringify([mdAramaAlan(st),st.gecmisGizle]);
    let M;
    try{ M=await mdYukle(); }catch(e){ throw new Error('Güncel veri okunamadı; dosya oluşturulmadı. '+(e.message||e)); }
    const st2=mdDurum();
    if(JSON.stringify([mdAramaAlan(st2),st2.gecmisGizle])!==arama){
      mpAlert('İndirme hazırlanırken arama değişti; dosya oluşturulmadı. Yeni sonuçla yeniden indirin.','Excel indirilmedi'); return; }
    const S=mdSonuc(M,st);
    if(mdXlsImza(M,S,k)!==imza){
      mdCiz();
      mpAlert('Tablo açıldıktan sonra kayıtlar değişti. Tablo güncel veriyle yenilendi; kontrol edip yeniden indirin.','Excel indirilmedi'); return; }
    const {m,sayfalar,ad}=mdXlsModel(M,st,S,k);
    if(!sayfalar.length){ mpAlert('Uygulanan aramada indirilecek yüzey ya da kampanya yok.','Excel oluşturulmadı'); return; }
    const blob=await rpXlsDosya(m,sayfalar);
    ui._mdSonXls={ad,blob,model:m,sayfalar:sayfalar.map(s=>s.ad)};
    rpIndir(blob,ad); toast('Excel indirildi: '+ad);
  }catch(e){ console.error(e); mpAlert(typeof rpHataMetni==='function'?rpHataMetni(e):String((e&&e.message)||e),'Excel oluşturulamadı'); }
  finally{ _mdIndiriliyor=false; mdXlsKilit(); }
}
