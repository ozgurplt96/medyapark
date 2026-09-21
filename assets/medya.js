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
function mdGun(iso){ const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return new Date(y,m-1,d); }
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
const MD_KOD_ETIKET={bos:'Boş',dolu:'Dolu',rezerve:'Opsiyon',yakinda:'Yakında boşalıyor',eski:'Eski kayıt',pasif:'Pasif',iptal:'İptal'};

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
  return {kod:yakinda?'yakinda':kod, taahhut:kod, etiket:yakinda?'Yakında boşalıyor':(kod==='rezerve'?'Opsiyon':'Dolu'),
          kayit:cur, alt, kesin, eski:cur.record_kind==='legacy'};
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
/* S8.2 — Halil'in Doluluk / Kiralama çerçevesi geri getirildi: `site` artık
   "mecra süzgeci"dir (null = tüm mecralar), varsayılan görünüm Yıl ızgarası.
   `tur` = mecra türü süzgeci (S2 keşfedilebilirlik). */
const MD_DEF={gor:'yil',site:null,alan:'',kurum:'',is:'',durum:'',tur:'',q:'',yil:null};
function mdDurum(){ let d={}; try{ d=JSON.parse(sessionStorage.getItem('mp_medya')||'{}')||{}; }catch(e){}
  /* `acik` her çağrıda YENİ nesne: paylaşılan bir varsayılanı mutasyona
     açmak oturum boyunca sızan durum yaratırdı. */
  return {...MD_DEF,...d,acik:(d.acik&&typeof d.acik==='object'&&!Array.isArray(d.acik))?{...d.acik}:{}}; }
function mdDurumYaz(d){ try{ sessionStorage.setItem('mp_medya',JSON.stringify(d)); }catch(e){} }
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

/* Mecra kartı (Halil'in `details.lgrp` çerçevesi) aynı açık-karar deposunu
   kullanır: anahtar 'm<mecra_id>', alan grubu 'g<alt_mecra_id>'. Kart
   KAPALIYKEN gövdesi hiç üretilmez. */
function mdKartKey(m){ return 'm'+m.id; }
function mdKartAcik(st,m,vars){ const k=mdKartKey(m), a=st.acik||{};
  return Object.prototype.hasOwnProperty.call(a,k)?!!a[k]:!!vars; }
/* "Tümünü aç / kapat" (Halil): tüm mecra kartları ve alan grupları. */
function mdTumAc(ac){ const M=ui._M; if(!M) return; const st=mdDurum(); const k={...(st.acik||{})};
  M.mecs.forEach(m=>{ k[mdKartKey(m)]=ac; k['gx'+m.id]=ac;
    (M.altByMec[m.id]||[]).forEach(a=>{ k[mdGrupKey(a)]=ac; }); });
  st.acik=k; mdDurumYaz(st); mdCiz(); }

/* Bu çizimde GERÇEKTEN render edilen yüz kimlikleri. Seçim çubuğu
   yalnız buradan beslenir; görünmeyen hiçbir yüz "seçili" sayılmaz. */
let _mdGoruntu=new Set();
/* Yıl ızgarası göstergesi: bu çizimde gerçekten kullanılan öğeler. */
let _mdLeg={ab:false,eski:false};

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
  const siteler=mdSiteler(M);
  /* Hatırlanan mecra süzgeci artık geçerli değilse sessizce "tüm mecralar". */
  if(st.site!=null&&!siteler.some(m=>String(m.id)===String(st.site))) st.site=null;
  if(!st.yil) st.yil=new Date().getFullYear();
  const g=st.gor==='bugun'?'bugun':'yil';
  /* Durum süzgeci görünüme göre anlam taşır (yıl: hangi aylar; bugün: bugünkü
     durum); görünüm değişince mdGor sıfırlar, geçersiz değer burada düşer. */
  const DURUM=g==='yil'
    ?[['dolu','Dolu ayı olanlar'],['rezerve','Opsiyon ayı olanlar'],['doluveya','Dolu veya opsiyon'],['bos',`Tamamen boş (${st.yil})`]]
    :[['bos','Boş'],['dolu','Dolu (kesin)'],['rezerve','Opsiyon'],['yakinda','Yakında boşalıyor'],['eski','Eski / ay bazlı']];
  if(st.durum&&!DURUM.some(d=>d[0]===st.durum)) st.durum='';
  mdDurumYaz(st);
  ui._mSec=ui._mSec||new Set();

  /* Kurum / İş seçenekleri YALNIZ medya kaydı olanlardan gelir: soru "hangi
     mecraları kullanıyor", 531 kurumluk bir liste değil. */
  const kSay={}, iSay={};
  M.recs.filter(r=>r.commitment!=='cancelled'&&r.customer_id!=null).forEach(r=>{
    kSay[r.customer_id]=(kSay[r.customer_id]||0)+1; if(r.work_id) iSay[r.work_id]=(iSay[r.work_id]||0)+1; });
  const kurumOpt=Object.keys(kSay).map(id=>({id,ad:M.cmap[id]||('#'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  const isOpt=Object.keys(iSay).map(id=>({id,ad:(M.jmap[id]||{}).title||('İş #'+id)}))
    .sort((a,b)=>a.ad.localeCompare(b.ad,'tr'));
  const turOpt=mdTurSecenekleri(M);

  c.innerHTML=`<div class="sec-head md-head"><h3>Doluluk / Kiralama</h3>
    <div class="md-head-r">
      <button class="btn btn-ghost btn-sm" onclick="mdDisaAktar()" title="Excel'e Aktar" aria-label="Excel'e Aktar">${ic('download',15)}<span class="md-tx"> Excel'e Aktar</span></button>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="bookImport()" title="Eski tablolardan ay bazlı kayıt aktarımı — kesin dönemli yerleşim oluşturmaz">${ic('upload',15)}<span class="md-tx"> Eski ay kaydı al</span></button>`:''}
      <div class="ws-switch inline" role="group" aria-label="Doluluk görünümü">
        <button type="button" class="${g==='bugun'?'on':''}" aria-pressed="${g==='bugun'}" onclick="mdGor('bugun')">Bugün</button>
        <button type="button" class="${g==='yil'?'on':''}" aria-pressed="${g==='yil'}" onclick="mdGor('yil')">Yıl ızgarası</button></div>
      <div class="year-nav" style="margin:0" ${g==='bugun'?'hidden':''}><button onclick="mdYil(-1)" aria-label="Önceki yıl">‹</button><span class="yr">${st.yil}</span><button onclick="mdYil(1)" aria-label="Sonraki yıl">›</button></div>
    </div></div>
    <div id="mdTaze"></div>
    <div class="banner">Mecra kartını açın, hücreye tıklayın: kayıt açılır; boş bir aya tıklayarak o ay için opsiyon ya da rezervasyon başlatabilirsiniz. Çift yüzlü pozisyonlarda (M1 megalight ve raketleri) her ayın altında iki kutu vardır: soldaki A (ön yüz), sağdaki B (arka yüz). LED yayınları eşzamanlıdır; ayrı çizelgede gösterilir. Ziyaretçi firma adını görmez, yalnızca durumu görür.</div>
    <div class="sec-card fbar md-fbar">
      <div class="fbar-row">
        <input class="inp" id="mdQ" placeholder="Ara: pozisyon, kurum, iş…" value="${esc(st.q)}" oninput="mdAra(this.value)" aria-label="Ara">
        <select class="inp" id="mdMec" onchange="mdSet({site:this.value||null,alan:''})" aria-label="Mecra">
          <option value="">Tüm mecralar</option>
          ${siteler.map(m=>`<option value="${m.id}" ${String(st.site)===String(m.id)?'selected':''}>${esc(m.name)}</option>`).join('')}</select>
        <select class="inp" id="mdDurumF" onchange="mdSet({durum:this.value})" aria-label="Durum">
          <option value="">Tüm durumlar</option>
          ${DURUM.map(([k,l])=>`<option value="${k}" ${st.durum===k?'selected':''}>${esc(l)}</option>`).join('')}</select>
        <select class="inp" id="mdTur" onchange="mdSet({tur:this.value})" aria-label="Mecra türü">
          <option value="">Tüm türler</option>
          ${turOpt.map(t=>`<option value="${t.id}" ${String(st.tur)===String(t.id)?'selected':''}>${esc(t.ad)}</option>`).join('')}</select>
        <select class="inp" id="mdKurum" onchange="mdSet({kurum:this.value})" aria-label="Kurum">
          <option value="">Tüm kurumlar</option>
          ${kurumOpt.map(k=>`<option value="${k.id}" ${String(st.kurum)===String(k.id)?'selected':''}>${esc(orgKisa(k.ad,40))}</option>`).join('')}</select>
        <select class="inp" id="mdIs" onchange="mdSet({is:this.value})" aria-label="İş">
          <option value="">Tüm işler</option>
          ${isOpt.map(k=>`<option value="${k.id}" ${String(st.is)===String(k.id)?'selected':''}>${esc(k.ad)}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" onclick="mdTemizle()">Temizle</button>
      </div>
      <p class="muted" id="mdSayi" style="font-size:12px;margin:8px 2px 0"></p>
    </div>
    <div class="grp-all"><button type="button" onclick="mdTumAc(true)">Tümünü aç</button><span>·</span><button type="button" onclick="mdTumAc(false)">Tümünü kapat</button></div>
    <div id="mdAfilt"></div>
    <div id="mdOdak"></div>
    <div id="mdGovde"></div>
    <div id="mdSecim" class="md-secim" hidden></div>`;
  mdCiz();
}

/* Çalışma yüzeyinde listelenen mecralar: en az bir güncel (arşivsiz) alan ya da
   yetim pozisyon taşıyanlar. */
function mdSiteler(M){
  return M.mecs.filter(m=>(M.altByMec[m.id]||[]).some(a=>!mdArsiv(a)&&((M.unitsByAlt[a.id]||[]).length||mdEszamanli(a)))
                          ||(M.orphanByMec[m.id]||[]).length);
}
/* Bir yüzün ürünü: kendi product_id'si, yoksa alanınki (Halil). Eşzamanlı
   alanda ürünü alan belirler. */
function mdYuzUrun(u,a){ return (u&&u.product_id!=null)?u.product_id:(a&&a.product_id); }
/* Mecra türü seçenekleri ve sayıları (S2 "LED Ekran (16)" keşfedilebilirliği).
   Sayı statik türlerde YÜZ sayısıdır; LED gibi eşzamanlı türlerde YAYIN ALANI
   sayısıdır — ekran/slot sayısı uydurulmaz. */
function mdTurSecenekleri(M){
  const say={}; const al=pid=>say[pid]=say[pid]||{yuz:0,yayin:0};
  M.mecs.forEach(m=>{
    (M.altByMec[m.id]||[]).filter(a=>!mdArsiv(a)).forEach(a=>{
      if(mdEszamanli(a)){ if(a.product_id!=null) al(a.product_id).yayin++; return; }
      (M.unitsByAlt[a.id]||[]).forEach(u=>{ const pid=mdYuzUrun(u,a); if(pid!=null) al(pid).yuz++; });
    });
    (M.orphanByMec[m.id]||[]).forEach(u=>{ if(u.product_id!=null) al(u.product_id).yuz++; });
  });
  return (M.prods||[]).filter(p=>say[p.id]).sort((a,b)=>String(a.name).localeCompare(String(b.name),'tr'))
    .map(p=>{ const s=say[p.id]; const parca=[]; if(s.yuz) parca.push(String(s.yuz)); if(s.yayin) parca.push(s.yayin+' yayın alanı');
      return {id:p.id,ad:`${p.name} (${parca.join(' + ')})`}; });
}

/* Görünüm değişince durum süzgeci sıfırlanır: aynı değer iki görünümde farklı
   soru sorar (yıl: "hangi aylar dolu?", bugün: "şu an dolu mu?"). */
function mdGor(v){ mdDurumYaz({...mdDurum(),gor:v,durum:''}); mdYenidenCiz(); }
function mdYil(d){ const st=mdDurum(); st.yil=(st.yil||new Date().getFullYear())+d; mdDurumYaz(st); mdYenidenCiz(); }
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
function mdTemizle(){ mdDurumYaz({...mdDurum(),site:null,kurum:'',is:'',durum:'',tur:'',q:'',alan:''}); mdYenidenCiz(); }

/* Aktif filtre şeridi (S2 `.afilt` konvansiyonu) */
function mdAfiltCiz(M,st){
  const box=document.getElementById('mdAfilt'); if(!box) return;
  const p=[];
  if(st.site!=null) p.push(['Mecra',(M.mecById[st.site]||{}).name||'']);
  if(st.tur) p.push(['Tür',(M.pm||{})[st.tur]||'']);
  if(st.kurum) p.push(['Kurum',orgKisa(M.cmap[st.kurum]||('#'+st.kurum),40)]);
  if(st.is) p.push(['İş',(M.jmap[st.is]||{}).title||('#'+st.is)]);
  if(st.alan) p.push(['Alan',(M.altById[st.alan]||{}).name||'']);
  if(st.durum) p.push(['Durum',st.gor==='yil'?({dolu:'Dolu ayı olanlar',rezerve:'Opsiyon ayı olanlar',doluveya:'Dolu veya opsiyon',bos:'Tamamen boş'}[st.durum]||st.durum):(MD_KOD_ETIKET[st.durum]||st.durum)]);
  if(st.q) p.push(['Arama',st.q]);
  box.innerHTML=p.length?`<div class="afilt"><span class="afilt-l">AKTİF FİLTRE</span>
    <span class="afilt-v">${p.map(([k,v])=>`${esc(k)}: <b>${esc(v)}</b>`).join(' · ')}</span>
    <button type="button" class="afilt-x" onclick="mdTemizle()">Temizle ✕</button></div>`:'';
}

function mdCiz(){
  const M=ui._M, st=mdDurum(), box=document.getElementById('mdGovde'); if(!M||!box) return;
  mdAfiltCiz(M,st);
  const gun=mdBugun();
  mdTipGizle();                       // hücre yeniden çizilirken açık bilgi kartı kalmasın
  /* Her çizim görünür yüz kümesini SIFIRDAN kurar; seçim çubuğu buna
     göre uzlaştırılır (S8.1 §17). */
  _mdGoruntu=new Set(); _mdLeg={ab:false,eski:false};
  /* Bugün + kurum/iş = alanlar arası "bu kurum hangi mecralarda?" listesi.
     Yıl ızgarasında kurum/iş aynı kartlar üzerinde satır süzgecidir. */
  if(st.gor!=='yil'&&mdFiltreli(st)) box.innerHTML=mdBaglamCiz(M,st,gun);
  else box.innerHTML=mdKartlar(M,st,gun);
  mdTazeCiz(M,st,gun);
  mdSecimCiz();
  mdOdakUygula();
}
/* Görünüm şeridi (Halil `lTazeBar`): hangi görünüm, hangi tarihe göre, veri ne
   zaman okundu. `bookings`'te updated_at yok; kayıt düzeyinde tazelik iddia
   edilmez — yalnız ekran düzeyinde okunma anı yazılır (S4 §20). */
function mdTazeCiz(M,st,gun){
  const box=document.getElementById('mdTaze'); if(!box) return;
  const t=M.okunma instanceof Date?M.okunma:new Date();
  const ss=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
  box.innerHTML=`<div class="afilt neutral"><span class="afilt-l">Görünüm</span>
    <span class="afilt-v">${st.gor==='yil'
      ?`Yıl ızgarası · <b>${esc(st.yil)}</b> aylık doluluk`
      :`Bugün · <b>${esc(mdGunDe(gun).replace(/'.*$/,''))}</b> itibarıyla mevcut durum`}</span>
    <span class="afilt-n">veri okunma ${esc(ss)}</span></div>`;
}

/* ---------- Kurum / İş sorusu: alanlar arası, gerçek ilişkiden (B27/B28) ---- */
function mdBaglamCiz(M,st,gun){
  const kayit=mdKapsam(M,{kurum:st.kurum,is:st.is,mecra:st.site,alan:st.alan})
    .filter(r=>r.block_end==null||r.block_end>=gun)
    .filter(r=>!st.q||mdAraEslesir(M,r,st.q));
  const gecmisSay=mdKapsam(M,{kurum:st.kurum,is:st.is}).filter(r=>r.block_end!=null&&r.block_end<gun).length;
  const soru=st.is?`Bu iş şu anda hangi mecralarda?`:`Bu kurum şu anda hangi mecraları kullanıyor?`;
  const ozne=st.is?((M.jmap[st.is]||{}).title||''):orgKisa(M.cmap[st.kurum]||'',50);
  if(!kayit.length) return `<div class="sec-card"><p class="md-soru">${esc(soru)}</p>
    <p class="empty">${esc(ozne)} için şu anda ya da ileride mecra kaydı yok.${gecmisSay?` ${gecmisSay} geçmiş kayıt Yıl ızgarasında.`:''}</p></div>`;
  const grup={};
  kayit.forEach(r=>{ (grup[r.mecra_id]=grup[r.mecra_id]||[]).push(r); });
  const sira=Object.fromEntries(M.mecs.map((m,i)=>[m.id,i]));
  const guncel=kayit.filter(r=>mdKapsarMi(r,gun)).length;
  return `<div class="md-soru-k"><p class="md-soru">${esc(soru)}</p>
      <p class="md-soru-s"><b>${esc(ozne)}</b> · ${guncel} güncel, ${kayit.length-guncel} yaklaşan kayıt${gecmisSay?` · ${gecmisSay} geçmiş kayıt Yıl ızgarasında`:''}</p></div>`
   +Object.keys(grup).sort((a,b)=>(sira[a]??99)-(sira[b]??99)).map(mid=>{
    const l=grup[mid].sort((a,b)=>String(a.block_start).localeCompare(String(b.block_start)));
    return `<section class="sec-card md-alan"><header class="md-ah"><h4>${esc((M.mecById[mid]||{}).name||'')}</h4>
      <span class="md-as">${l.length} kayıt</span></header>
      <div class="tbl-wrap"><table class="tbl md-tbl"><thead><tr>
        <th>Mecra / hedef</th><th style="width:112px">Durum</th><th>${st.is?'Kurum':'İş'}</th><th style="width:190px">Dönem</th><th style="width:170px">Not</th></tr></thead>
      <tbody>${l.map(r=>{
        const a=M.altById[r.alt_mecra_id]||{}; const esz=r.occupancy_mode==='concurrent';
        const hedef=esz?`${esc(a.name||'')} <span class="md-tag">LED · eşzamanlı${a.creative_seconds&&r.record_kind!=='legacy'?' · '+a.creative_seconds+' sn':''}</span>`
                       :`<b>${esc(r.unit_name||'')}</b> <span class="muted">${esc(a.name||'Diğer')}</span>`;
        const zm=mdZamansal(r,gun);
        const drm=mdLedRozet(r,zm);
        return `<tr class="md-r" data-p="${r.placement_id||''}" onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mYuzeyAc(${r.unit_id})`}" style="cursor:pointer">
          <td>${hedef}</td><td>${drm}</td>
          <td>${st.is?esc(orgKisa(r.customer_name||'',34)):esc(r.work_title||'—')}</td>
          <td class="mono">${esc(mdDonem(r))}</td>
          <td class="muted">${esc(mdKesinlikNotu(r))}</td></tr>`;}).join('')}</tbody></table></div></section>`;
  }).join('');
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

/* ==========================================================
   MECRA KARTLARI — Halil'in Doluluk / Kiralama çerçevesi (S8.2)
   Her mecra kapalı başlayan bir kart; gövdesi yalnız AÇIKKEN üretilir.
   Kart içinde alanlar (S8.1 grupları) ve Yıl ızgarası / Bugün tablosu
   görünür. Veri ve kurallar S8'dedir; burası yalnız görünümdür.
   ========================================================== */
/* Bir kaydın kurum / iş / arama süzgecine uyup uymadığı (LED ve ızgara için). */
function mdKayitUygun(M,st,q){
  return r=>(!q||mdAraEslesir(M,r,q))
    &&(!st.kurum||String(r.customer_id)===String(st.kurum))
    &&(!st.is||String(r.work_id)===String(st.is));
}
/* Derin bağlantı hedefi bu mecrada mı? (kart açılır) */
function mdKartOdak(M,m,pid){
  if(!pid) return false;
  const r=(M.recs||[]).find(x=>x.placement_id===pid);
  return !!r&&String(r.mecra_id)===String(m.id);
}

function mdKartlar(M,st,gun){
  const yil=st.gor==='yil';
  const y=st.yil||new Date().getFullYear();
  const q=String(st.q||'').toLocaleLowerCase('tr').trim();
  const aktif=!!(q||st.durum||st.tur||st.kurum||st.is);
  const siteler=mdSiteler(M).filter(m=>st.site==null||String(m.id)===String(st.site));
  const hazir=siteler.map(m=>mdMecHazirla(M,st,m,gun,y,q,aktif)).filter(Boolean);
  const say=document.getElementById('mdSayi');
  if(say){ const poz=hazir.reduce((s,h)=>s+h.poz,0), yay=hazir.reduce((s,h)=>s+h.yayin,0);
    say.textContent=aktif?`${[poz?`${poz} pozisyon`:'',yay?`${yay} yayın alanı`:''].filter(Boolean).join(' · ')} (${hazir.length} mecrada) gösteriliyor — filtre etkin`:''; }
  if(!hazir.length) return `<div class="sec-card"><p class="empty">${aktif?'Filtrelerle eşleşen kayıt bulunamadı.':'Tanımlı mecra yok.'}</p></div>`;
  return hazir.map(h=>{
    /* Açık mı? Derin bağlantı hedefi > kullanıcının açık kararı > varsayılan:
       Halil gibi kapalı başlar; süzgeç etkinken ya da tek mecra kaldığında açılır. */
    const acik=mdKartOdak(M,h.m,ui._mOdak)||mdKartAcik(st,h.m,aktif||hazir.length===1);
    return mdKart(M,st,h,acik,{gun,y,q,aktif,yil});
  }).join('');
}

function mdKart(M,st,h,acik,o){
  const m=h.m, key=mdKartKey(m);
  /* Kapalıyken de "burada ne var?" sorusu cevaplanır (Halil özeti). */
  const ozet=o.aktif
    ?[h.poz?`${h.poz} eşleşen pozisyon`:'',h.yayin?`${h.yayin} yayın alanı`:''].filter(Boolean).join(' · ')
    :[h.statikAlan?`${h.statikAlan} alan`:'',h.yuz?`${h.yuz} pozisyon`:'',h.ledAlan?`${h.ledAlan} yayın alanı`:''].filter(Boolean).join(' · ');
  const bas=`<button type="button" class="md-mh" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
      <span class="grp-t">${esc(m.name)}</span><span class="lgrp-m">${esc(ozet)}</span><i class="chev"></i></button>`;
  if(!acik) return `<section class="sec-card md-mk" data-m="${m.id}">${bas}</section>`;
  return `<section class="sec-card md-mk md-acik" data-m="${m.id}">${bas}<div class="md-mb">${mdMecGovde(M,st,h,o)}</div></section>`;
}

/* Bir mecranın süzgeçten geçen alanlarını hazırlar; süzgeç etkinken eşleşme
   yoksa null (kart gizlenir). Ağır gövde BURADA üretilmez. */
function mdMecHazirla(M,st,m,gun,y,q,aktif){
  const yil=st.gor==='yil';
  const alanlar=[...(M.altByMec[m.id]||[])].filter(a=>!mdArsiv(a));
  const yetim=M.orphanByMec[m.id]||[];
  if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
  const uyg=mdKayitUygun(M,st,q);
  const liste=[]; let poz=0,yayin=0,statikAlan=0,yuz=0,ledAlan=0;
  alanlar.forEach(a=>{
    /* Kart özeti süzgeçsiz YAPIYI anlatır. */
    if(mdEszamanli(a)) ledAlan++;
    else { const u0=a._sahte?yetim:(M.unitsByAlt[a.id]||[]); if(u0.length){ statikAlan++; yuz+=u0.length; } }
    if(st.alan&&String(st.alan)!==String(a.id)) return;
    if(mdEszamanli(a)){
      /* "Dolu / Boş" LED'in dili değildir: durum süzgeci LED'e uygulanmaz. */
      if(st.durum&&!(!yil&&st.durum==='eski')) return;
      if(st.tur&&String(a.product_id)!==String(st.tur)) return;
      if(q||st.kurum||st.is){
        const havuz=(M.byArea[a.id]||[]).filter(r=>r.commitment!=='cancelled');
        if(!havuz.some(uyg)) return; }
      liste.push({a,led:true}); yayin++; return;
    }
    const us=a._sahte?yetim:(M.unitsByAlt[a.id]||[]); if(!us.length) return;
    if(yil){
      const gr=mdYilGruplari(M,st,m,a,us,y,q);
      if(!gr.length&&aktif) return;
      const n=gr.reduce((s,g)=>s+(g.A?1:0)+(g.B?1:0),0);
      liste.push({a,us,gr,n}); poz+=n;
    } else {
      const {satirlar,say}=mdBugunSatirlar(M,st,a,us,gun,q);
      if(!satirlar.length&&aktif) return;
      liste.push({a,us,satirlar,say,n:satirlar.length}); poz+=satirlar.length;
    }
  });
  if(aktif&&!liste.length) return null;
  return {m,liste,poz,yayin,statikAlan,yuz,ledAlan,alanSayisi:alanlar.length};
}

/* Açık kartın gövdesi: alan bölümleri (+ Yıl'da tek ortak gösterge). */
function mdMecGovde(M,st,h,o){
  const {gun,y,q,aktif,yil}=o;
  const tek=h.alanSayisi===1;
  const aylar=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`);
  const html=h.liste.map(x=>{
    const acik=mdOdakGrubu(M,x.a,ui._mOdak)||mdAcikMi(st,x.a,mdVarsayilanAcik(M,x.a,{tek,arayis:aktif}));
    if(x.led){
      if(!yil) return mdLedKart(M,x.a,gun,q,acik);
      const yb=`${y}-01-01`, ye=`${y}-12-31`;
      const l=(M.byArea[x.a.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb))
        .filter(mdKayitUygun(M,st,q));
      return mdLedYil(M,x.a,l,y,aylar,acik);
    }
    return yil?mdGridBolum(M,x.a,x.gr,y,acik):mdStatikBolum(M,x.a,x.us,x.satirlar,x.say,acik);
  }).join('');
  return (html||'<p class="muted">Bu filtreye uyan yüzey ya da yayın yok.</p>')
    +((yil&&h.liste.some(x=>!x.led&&mdAcikMi(st,x.a,true)))?mdLegend():'');
}

/* Bugün: bir alanın yüzleri için durum + süzgeç (eski mdBugunCiz döngüsü). */
function mdBugunSatirlar(M,st,a,us,gun,q){
  const satirlar=[]; const say={bos:0,dolu:0,rezerve:0,yakinda:0,pasif:0};
  us.forEach(u=>{
    const d=mdYuzeyDurum(M,u,gun);
    say[d.kod]=(say[d.kod]||0)+1;
    if(st.tur&&String(mdYuzUrun(u,a))!==String(st.tur)) return;
    if(st.durum){
      if(st.durum==='bos'&&d.kod!=='bos') return;
      if(st.durum==='dolu'&&!(d.kod==='dolu'||(d.kod==='yakinda'&&d.taahhut==='dolu'))) return;
      if(st.durum==='rezerve'&&d.taahhut!=='rezerve') return;
      if(st.durum==='yakinda'&&d.kod!=='yakinda') return;
      if(st.durum==='eski'&&!d.eski) return;
    }
    if(q){ const k=d.kayit;
      const hay=[u.name,a.name,k&&k.customer_name,k&&k.work_title].join(' ').toLocaleLowerCase('tr');
      if(!hay.includes(q)) return; }
    satirlar.push({u,d});
  });
  return {satirlar,say};
}

/* Alan başlığındaki ad: Halil gibi "alan adı · mecra türü". */
function mdAlanAdi(M,a){
  const urun=M.pm[a.product_id]||'';
  return `<span class="md-gh">${esc(a.name)}</span>${urun?`<span class="md-as">· ${esc(urun)}</span>`:''}`;
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

function mdStatikBolum(M,a,us,satirlar,say,acik){
  const secSay=satirlar.filter(x=>ui._mSec.has(x.u.id)).length;
  const secilebilir=satirlar.filter(x=>x.u.active!==false&&x.d.kod!=='pasif').map(x=>x.u.id);
  const key=mdGrupKey(a);
  const ozet=[say.dolu?`${say.dolu} dolu`:'',say.rezerve?`${say.rezerve} opsiyon`:'',
    say.yakinda?`<span class="md-yk">${say.yakinda} yakında boşalıyor</span>`:'',`${say.bos} boş`,say.pasif?`${say.pasif} pasif`:'']
    .filter(Boolean).join(' · ');
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        ${mdAlanAdi(M,a)}
        <span class="md-as">${us.length} yüz</span>
        <span class="md-oz">${ozet}</span>
        ${satirlar.length!==us.length?`<span class="md-oz md-eslesen">${satirlar.length} eşleşen</span>`:''}
      </button>
      <span class="md-ah-r">
        ${acik&&secilebilir.length?`<button type="button" class="btn-link" onclick="mdTumunuSec([${secilebilir.join(',')}],${secSay<secilebilir.length})">${secSay<secilebilir.length?'Tümünü seç':'Seçimi kaldır'}</button>`:''}
        ${acik&&isAdmin()&&!a._sahte?`<button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id},${a.mecra_id},${a.product_id||'null'})" title="Envanter: yeni pozisyon (yönetici)">+ Pozisyon</button>`:''}
      </span>
    </header>`;
  /* KAPALIYKEN gövde hiç üretilmez ve yüzler görünür kümeye girmez. */
  if(!acik) return `<section class="sec-card md-alan md-kapali" data-a="${a.id}">${baslik}</section>`;
  satirlar.forEach(x=>_mdGoruntu.add(x.u.id));
  /* A/B yüzleri AYRI satırdır (P3-A ≠ P3-B); ortak taban görsel olarak
     gruplanır ama yüzler asla birleştirilmez (B35). */
  let onceki=null;
  const tr=satirlar.map(({u,d})=>{
    const p=posParts(u.name); const yuzlu=/[\s._-][AB]$/i.test(String(u.name||''));
    const taban=yuzlu?p.base:u.name; const yeniGrup=taban!==onceki; onceki=taban;
    const k=d.kayit;
    const sec=ui._mSec.has(u.id);
    return `<tr class="md-r ${yeniGrup?'md-g':''} ${sec?'md-sel':''}" data-u="${u.id}" ${k&&k.placement_id?`data-p="${k.placement_id}"`:''}>
      <td class="md-cb" onclick="event.stopPropagation()">${u.active!==false?`<input type="checkbox" ${sec?'checked':''}
          aria-label="${esc(u.name)} seç" onchange="mdSec(${u.id},this.checked)">`:''}</td>
      <td class="md-poz" onclick="mYuzeyAc(${u.id})"><b>${esc(yeniGrup?taban:'')}</b>${yuzlu?`<span class="md-yuz" title="${p.surf==='A'?'A yüzü (ön)':'B yüzü (arka)'}">${esc(p.surf)}</span>`:''}</td>
      <td onclick="mYuzeyAc(${u.id})"><span class="md-st md-st-${d.kod==='yakinda'?'yakinda':d.kod}">${esc(d.etiket)}</span></td>
      <td onclick="mYuzeyAc(${u.id})">${k?`<span class="md-org" title="${esc(k.customer_name||'')}">${esc(orgKisa(k.customer_name||'kurum belirtilmemiş',30))}</span>`:'<span class="muted">—</span>'}</td>
      <td onclick="mYuzeyAc(${u.id})">${k&&k.work_title?`<span class="md-is" title="${esc(k.work_title)}">${esc(k.work_title)}</span>`:'<span class="muted">—</span>'}</td>
      <td onclick="mYuzeyAc(${u.id})">${k?`<span class="mono">${esc(mdDonem(k))}</span>${k.record_kind==='legacy'?'<span class="md-eski-t">eski kayıt</span>':''}`:''}</td>
      <td onclick="mYuzeyAc(${u.id})"><span class="${d.kesin||d.kod==='bos'?'':'muted'} ${d.kod==='yakinda'?'md-yk':''} ${d.kod==='bos'&&d.sonraki?'md-yakl':''}">${esc(d.alt||'')}</span></td>
    </tr>`;
  }).join('');
  return `<section class="sec-card md-alan" data-a="${a.id}">${baslik}
    <div class="tbl-wrap"><table class="tbl rowlink md-tbl"><thead><tr>
      <th class="md-cb" aria-label="Seç"></th><th style="width:92px">Pozisyon</th><th style="width:150px">Durum</th>
      <th>Kurum</th><th>İş</th><th style="width:170px">Dönem</th><th style="width:200px">Ne zaman boş</th></tr></thead>
      <tbody>${tr||'<tr><td colspan="7" class="empty">Filtreyle eşleşen yüz yok.</td></tr>'}</tbody></table></div>
  </section>`;
}

/* ---------- LED kartı: eşzamanlı yayın (B38) ---------- */
function mdLedKart(M,a,gun,q,acik){
  const y=mdYayinlar(M,a.id,gun);
  const esle=r=>!q||[r.customer_name,r.work_title].join(' ').toLocaleLowerCase('tr').includes(q);
  const kanonOnce=(p,q)=>(p.record_kind==='legacy')-(q.record_kind==='legacy')||String(p.block_start).localeCompare(String(q.block_start));
  const aktif=y.aktif.filter(esle).sort(kanonOnce), yak=y.yaklasan.filter(esle).sort(kanonOnce);
  const yeni=aktif.filter(r=>r.record_kind!=='legacy');
  const satir=r=>`<li class="md-kmp" data-p="${r.placement_id||''}" onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
      <span class="md-kmp-o" title="${esc(r.customer_name||'')}">${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',32))}</span>
      <span class="md-kmp-i">${esc(r.work_title||'')}</span>
      <span class="md-kmp-d mono">${esc(mdDonem(r))}</span>
      <span class="md-kmp-s">${r.record_kind==='legacy'?'<span class="md-st md-st-eski">ay bazlı eski kayıt</span>'
        :(r.commitment==='reserved'?'<span class="md-st md-st-rezerve">Opsiyon</span>':'')}${a.creative_seconds&&r.record_kind!=='legacy'?`<span class="md-sn">${a.creative_seconds} sn</span>`:''}</span>
    </li>`;
  const key=mdGrupKey(a);
  const ozet=`${yeni.length?`<b>${yeni.length} aktif yayın</b>`:'Aktif yayın yok'}${aktif.length>yeni.length?` · ${aktif.length-yeni.length} ay bazlı eski kayıt`:''}${yak.length?` · ${yak.length} yaklaşan`:''}`;
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(a.name)}</span>
        <span class="md-tag">Eşzamanlı yayın${a.creative_seconds?` · kreatif ${a.creative_seconds} sn`:''}</span>
        <span class="md-oz">${ozet}</span>
      </button>
      <span class="md-ah-r"><button class="btn btn-sm act act-work" onclick="mForm({hedefler:[{alt_mecra_id:${a.id}}]})">${ic('plus',15)} Yayın Ekle</button></span>
    </header>`;
  if(!acik) return `<section class="sec-card md-alan md-led md-kapali" data-a="${a.id}">${baslik}</section>`;
  return `<section class="sec-card md-alan md-led" data-a="${a.id}">${baslik}
    ${aktif.length?`<ul class="md-kmpl">${aktif.map(satir).join('')}</ul>`:'<p class="md-led-n">Aktif yayın yok.</p>'}
    ${yak.length?`<div class="md-alt-b">Yaklaşan</div><ul class="md-kmpl">${yak.slice(0,6).map(satir).join('')}</ul>
      ${yak.length>6?`<p class="muted" style="font-size:12px;margin:6px 0 0">+${yak.length-6} yaklaşan yayın · Yıl ızgarasında</p>`:''}`:''}
    <p class="md-not">Aynı anda birden çok reklamveren yayında olabilir. Kapasite, slot ya da frekans kuralı tanımlı değildir.</p>
  </section>`;
}

/* ==========================================================
   YIL IZGARASI — Halil'in hücre ızgarası (S8.2)
   Aynı görsel dil: pozisyon başına TEK satır, A ve B yüzü ayın altında iki
   kutu; yeşil Boş / kırmızı Dolu / turuncu Opsiyon; 3 harfli kurum kodu.
   Fark: hücre artık aylık `bookings` değil KESİN DÖNEMLİ yerleşimden
   türetilir. Ay içinde kısmi dönem alttaki ince çubukla, ay bazlı eski kayıt
   kesik çerçeveyle, birden çok kayıt köşe noktasıyla gösterilir; kesin
   tarihler üzerine gelince ve tıklayınca görünür. Gün UYDURULMAZ.
   ========================================================== */
function mdYilKayitlar(M,u,y){
  const yb=`${y}-01-01`, ye=`${y}-12-31`;
  return (M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ye&&(r.block_end==null||r.block_end>=yb));
}
function mdAyKayitlari(M,u,ym){
  const ab=`${ym}-01`, ae=mdAySonu(ab);
  return (M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=ae&&(r.block_end==null||r.block_end>=ab));
}
/* Bir A/B grubunun yıl içindeki durum / kurum / iş kümesi (Halil `lGrupBilgi`). */
function mdGrupBilgi(M,g,y){
  const b={dolu:false,opsiyon:false,kur:new Set(),is:new Set(),metin:[]};
  [g.A,g.B].forEach(u=>{ if(!u) return;
    mdYilKayitlar(M,u,y).forEach(r=>{
      if(r.commitment==='confirmed') b.dolu=true; else b.opsiyon=true;
      if(r.customer_id!=null) b.kur.add(String(r.customer_id));
      if(r.work_id!=null) b.is.add(String(r.work_id));
      b.metin.push(r.customer_name||'',r.work_title||''); }); });
  return b;
}
/* Süzgeçten geçen A/B grupları. Ürün önce yüzün kendisinden okunur (Halil). */
function mdYilGruplari(M,st,m,a,us,y,q){
  const uygun=g=>{
    const b=mdGrupBilgi(M,g,y);
    if(q){ const hay=[g.base,a.name,m.name,...b.metin].join(' ').toLocaleLowerCase('tr'); if(!hay.includes(q)) return false; }
    if(st.durum==='dolu'&&!b.dolu) return false;
    if(st.durum==='rezerve'&&!b.opsiyon) return false;
    if(st.durum==='doluveya'&&!(b.dolu||b.opsiyon)) return false;
    if(st.durum==='bos'&&(b.dolu||b.opsiyon)) return false;
    if(st.kurum&&!b.kur.has(String(st.kurum))) return false;
    if(st.is&&!b.is.has(String(st.is))) return false;
    if(st.tur&&String(mdYuzUrun(g.A||g.B,a))!==String(st.tur)) return false;
    return true; };
  return groupUnits(us).filter(uygun);
}

/* Tek hücre: bir yüzün bir aylık durumu. */
function mdCell(M,u,ym,solo){
  if(!u) return `<span class="rcell yok" title="Bu yüzey tanımlı değil">–</span>`;
  const l=mdAyKayitlari(M,u,ym);
  const yuzlu=/[\s._-][AB]$/i.test(String(u.name||''));
  let sinif='bos', kod=(solo||!yuzlu)?'':posParts(u.name).surf, ek='', stl='', durumAd='Boş';
  if(l.length){
    const kesin=l.some(r=>r.commitment==='confirmed');
    sinif=kesin?'dolu':'rezerve'; durumAd=kesin?'Dolu':'Opsiyon';
    const ilk=l.find(r=>(r.commitment==='confirmed')===kesin)||l[0];
    kod=ilk.customer_name?String(ilk.customer_name).trim().slice(0,3).toLocaleUpperCase('tr'):'';
    if(l.every(r=>r.record_kind==='legacy'&&r.date_precision==='month')){ ek+=' eski'; _mdLeg.eski=true; }
    if(l.length>1) ek+=' cok';
    else {
      /* Ay içinde kısmi dönem: yalnız TEK ve gün bilgisi olan kayıtta çizilir. */
      const r=l[0], ab=`${ym}-01`, ae=mdAySonu(ab);
      const bs=r.record_kind==='legacy'?r.start_date:r.block_start, be=r.record_kind==='legacy'?r.end_date:r.block_end;
      const gunSay=mdGun(ae).getDate();
      const a0=bs&&bs>ab&&mdYm(bs)===ym?(mdGun(bs).getDate()-1)/gunSay:0;
      const b0=be&&be<ae&&mdYm(be)===ym?mdGun(be).getDate()/gunSay:1;
      if(a0>0||b0<1){ ek+=' kis'; stl=` style="--a:${(a0*100).toFixed(1)}%;--b:${(b0*100).toFixed(1)}%"`; }
    }
  } else if(u.active===false){ sinif='yok'; kod='–'; durumAd='Pasif'; }
  const etiket=`${u.name} · ${mdYmAdi(ym)} · ${durumAd}${l.length&&l[0].customer_name?' · '+orgKisa(l[0].customer_name,30):''}`;
  return `<button type="button" class="rcell ${sinif}${ek}"${stl} data-u="${u.id}" data-ym="${ym}" aria-label="${esc(etiket)}"
    onclick="mdCellAc(${u.id},'${ym}')" onmouseenter="mdTip(this)" onmouseleave="mdTipGizle()" onfocus="mdTip(this)" onblur="mdTipGizle()"><i>${esc(kod)}</i></button>`;
}
/* Hücre tıklaması: tek kayıt → kaydı aç; birden çok → yüz detayı; boş ay →
   o ay için yeni yerleşim formu (Halil'in "aya tıkla" davranışı, artık kesin
   dönemli forma açılır). Silme/ezme YOK; form Kurum + İş ister. */
function mdCellAc(uid,ym){
  const M=ui._M; if(!M) return; const u=M.unitById[uid]||{};
  const l=mdAyKayitlari(M,u,ym);
  mdTipGizle();
  if(l.length===1){ const r=l[0]; if(r.placement_id) return mKayitAc(r.placement_id); return mEskiAc(r.booking_id); }
  if(l.length>1||u.active===false) return mYuzeyAc(uid);
  const ab=`${ym}-01`;
  mForm({hedefler:[{unit_id:uid}],bas:ab,bit:mdAySonu(ab),taah:'reserved'});
}

/* Üzerine gelince bilgi kartı (Halil `lTip`; gün ve İş bilgisiyle). */
let _mdTipEl=null;
function mdTip(el){
  const M=ui._M; if(!M||!el) return;
  const uid=+el.dataset.u, ym=el.dataset.ym; const u=M.unitById[uid]||{};
  const l=mdAyKayitlari(M,u,ym);
  const yuzlu=/[\s._-][AB]$/i.test(String(u.name||''));
  const yz=yuzlu?(posParts(u.name).surf==='A'?' · A yüzü (ön yüz)':' · B yüzü (arka yüz)'):'';
  const kayit=r=>{ const kesin=r.commitment==='confirmed';
    return `<div class="rtip-r"><span>${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',26))}</span><b class="st-${kesin?'dolu':'rezerve'}">${kesin?'Dolu':'Opsiyon'}</b></div>
      <div class="rtip-n">${esc(mdDonem(r))}${r.work_title?' · '+esc(r.work_title):''}</div>`; };
  const icerik=l.length?l.map(kayit).join(''):`<div class="rtip-r"><span>Durum</span><b class="st-bos">${u.active===false?'Pasif — satışa kapalı':'Boş'}</b></div>`;
  if(!_mdTipEl){ _mdTipEl=document.createElement('div'); _mdTipEl.className='rtip'; document.body.appendChild(_mdTipEl); }
  _mdTipEl.innerHTML=`<div class="rtip-t">${esc(u.name||'')}${yz}</div><div class="rtip-r"><span>Ay</span><b>${esc(mdYmAdi(ym))}</b></div>${icerik}`;
  const b=el.getBoundingClientRect();
  _mdTipEl.style.display='block';
  const tw=_mdTipEl.offsetWidth, th=_mdTipEl.offsetHeight;
  let left=b.left+b.width/2-tw/2; left=Math.max(8,Math.min(left,window.innerWidth-tw-8));
  let top=b.top-th-10; if(top<8) top=b.bottom+10;
  _mdTipEl.style.left=left+'px'; _mdTipEl.style.top=top+'px';
}
function mdTipGizle(){ if(_mdTipEl) _mdTipEl.style.display='none'; }

/* Bir statik alanın ızgara bölümü: S8.1 grup başlığı (aç/kapa, hatırlanır) +
   Halil satırları. Kapalıyken satırlar hiç üretilmez. */
function mdGridBolum(M,a,gr,y,acik){
  const key=mdGrupKey(a);
  const yuz=gr.reduce((s,g)=>s+(g.A?1:0)+(g.B?1:0),0);
  const kayit=gr.reduce((s,g)=>s+[g.A,g.B].filter(Boolean).reduce((t,u)=>t+mdYilKayitlar(M,u,y).length,0),0);
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>${mdAlanAdi(M,a)}
        <span class="md-as">${yuz} pozisyon</span>
        <span class="md-oz">${y} yılında ${kayit?kayit+' kayıt':'kayıt yok'}</span>
      </button>
      ${acik&&isAdmin()&&!a._sahte?`<span class="md-ah-r"><button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id},${a.mecra_id},${a.product_id||'null'})" title="Envanter: yeni pozisyon (yönetici)">+ Pozisyon</button></span>`:''}
    </header>`;
  if(!acik) return `<section class="md-alan md-kapali" data-a="${a.id}">${baslik}</section>`;
  const aylar=Array.from({length:12},(_,i)=>`${y}-${pad(i+1)}`);
  const monHead=MONTHS_SHORT.map(mo=>`<div class="rg-m rg-mh"><span>${mo}</span></div>`).join('');
  const rows=gr.map(g=>{
    if(g.B) _mdLeg.ab=true;
    const cells=aylar.map(ym=>`<div class="rg-m">${g.B
      ?mdCell(M,g.A,ym,false)+mdCell(M,g.B,ym,false)
      :mdCell(M,g.A||g.B,ym,true)}</div>`).join('');
    return `<div class="rg-row" data-b="${esc(g.base)}"><div class="rg-lbl" title="${esc(g.base)}">${esc(g.base)}</div>${cells}</div>`; }).join('');
  return `<section class="md-alan" data-a="${a.id}">${baslik}
    <div class="rtwrap"><div class="rgrid"><div class="rg-row rg-head"><div class="rg-lbl">Pozisyon</div>${monHead}</div>${rows}</div></div></section>`;
}
/* Gösterge (Halil): yüzler, durumlar; yalnız gerçekten kullanılanlar. */
function mdLegend(){
  return `<div class="rg-legend">
    ${_mdLeg.ab?'<span class="lg-surf"><b>A</b> Ön yüz</span><span class="lg-surf"><b>B</b> Arka yüz</span><span class="lg-sep"></span>':''}
    <span><i class="sw bos"></i>Boş</span><span><i class="sw dolu"></i>Dolu</span><span><i class="sw rezerve"></i>Opsiyon</span>
    ${_mdLeg.eski?'<span><i class="sw eski"></i>Ay bazlı eski kayıt</span>':''}
    <span class="lg-not">Alttaki çubuk: ay içinde kısmi dönem · köşe noktası: aynı ayda birden çok kayıt</span></div>`;
}

/* LED Yıl: "kim, ne zaman yayında?" — örtüşme görünür biçimde serbesttir. */
function mdLedYil(M,a,l,y,aylar,acik){
  const gunSay=(y%4===0&&(y%100!==0||y%400===0))?366:365;
  const yb=`${y}-01-01`;
  const gunNo=iso=>Math.round((mdGun(iso)-mdGun(yb))/864e5);
  const ayGun=aylar.map(ym=>+mdAySonu(ym+'-01').slice(8,10));
  const kol=ayGun.map(n=>n+'fr').join(' ');
  const bugun=mdBugun(); const buYil=mdGun(bugun).getFullYear()===y;
  const sirali=[...l].sort((p,q)=>String(p.block_start).localeCompare(String(q.block_start)));
  const satir=r=>{
    const bs=r.block_start<yb?yb:r.block_start;
    const beRaw=r.block_end==null?`${y}-12-31`:r.block_end;
    const be=beRaw>`${y}-12-31`?`${y}-12-31`:beRaw;
    const sol=gunNo(bs)/gunSay*100, gen=Math.max(0.6,(gunNo(be)-gunNo(bs)+1)/gunSay*100);
    const eski=r.record_kind==='legacy';
    return `<div class="md-tlr" data-p="${r.placement_id||''}">
      <div class="md-tll" title="${esc(r.customer_name||'')}"><b>${esc(orgKisa(r.customer_name||'kurum belirtilmemiş',26))}</b>
        <span>${esc(r.work_title||(eski?'eski kayıt':''))}</span>
        <em class="mono">${esc(mdDonem(r))}${a.creative_seconds&&!eski?' · '+a.creative_seconds+' sn':''}${r.legacy_lane?' · kaynak '+esc(r.legacy_lane):''}</em></div>
      <div class="md-tlt" style="grid-template-columns:${kol}">${aylar.map(()=>'<i></i>').join('')}
        ${buYil?`<span class="md-bugun" style="left:${gunNo(bugun)/gunSay*100}%"></span>`:''}
        <button type="button" class="md-bar ${eski?'st-eski':r.commitment==='reserved'?'st-rez':'st-kes'}" style="left:${sol}%;width:${gen}%"
          title="${esc(`${r.customer_name||''} · ${mdDonem(r)}${a.creative_seconds&&!eski?' · '+a.creative_seconds+' sn':''}`)}"
          onclick="${r.placement_id?`mKayitAc(${r.placement_id})`:`mEskiAc(${r.booking_id})`}">
          ${gen>9?`<span>${esc(mdOrgEtiket(r.customer_name))}</span>`:''}</button>
      </div></div>`;
  };
  const key=mdGrupKey(a);
  const baslik=`<header class="md-ah">
      <button type="button" class="md-gt" aria-expanded="${acik}" onclick="mdGrupAc('${key}',${acik})">
        <span class="md-gcv" aria-hidden="true">${acik?'▾':'▸'}</span>
        <span class="md-gh">${esc(a.name)}</span>
        <span class="md-tag">Eşzamanlı kampanya çizelgesi${a.creative_seconds?` · kreatif ${a.creative_seconds} sn`:''}</span>
        <span class="md-oz">${y} yılında ${sirali.length} kayıt</span>
      </button>
      <span class="md-ah-r"><button class="btn btn-sm act act-work" onclick="mForm({hedefler:[{alt_mecra_id:${a.id}}]})">${ic('plus',15)} Yayın Ekle</button></span></header>`;
  if(!acik) return `<section class="sec-card md-alan md-led md-kapali" data-a="${a.id}">${baslik}</section>`;
  return `<section class="sec-card md-alan md-led" data-a="${a.id}">${baslik}
    <div class="md-tl">
      <div class="md-tlr md-tlh"><div class="md-tll">Kurum · iş</div>
        <div class="md-tlt" style="grid-template-columns:${kol}">${aylar.map((ym,i)=>`<i>${AY_KISA[i]}</i>`).join('')}
          ${buYil?`<span class="md-bugun" style="left:${gunNo(bugun)/gunSay*100}%" title="Bugün"></span>`:''}</div></div>
      ${sirali.length?sirali.map(satir).join(''):`<p class="empty" style="padding:10px 0">${y} yılında yayın yok.</p>`}
    </div>
    <p class="md-not">Satırlar kampanyadır, ekran ya da slot değildir. Örtüşen yayınlar aynı anda geçerlidir.</p></section>`;
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
      <p class="fhint" style="margin:4px 0 0">Opsiyon ve rezervasyon yüzü aynı şekilde bloklar; iptal edilen kayıt bloklamaz.</p></div>`}
    <div class="field"><label class="flabel" for="mfSoz">Sözleşme kalemi <span class="muted">(opsiyonel)</span></label>
      <select class="inp" id="mfSoz"><option value="">Bağlı değil</option></select>
      <p class="fhint" style="margin:4px 0 0">Yalnız yapısal sözleşme kalemi varsa. Belge eklenmiş olması gerekmez.</p></div>
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
function mfTaah(b){ b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b)); }
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
    sel.innerHTML=ids.map(x=>`<option value="${x.id}" ${String(kurumOn||ids[0].id)===String(x.id)?'selected':''}>${esc(orgKisa(M.cmap[x.id]||('#'+x.id),44))} · ${esc(ROL[x.rol]||x.rol)}</option>`).join('');
    if(n) n.textContent=ids.length>1?'İşin taraflarından biri seçilir.':'İşin kurumundan alındı.';
  } else {
    sel.innerHTML=`<option value="">— Kurum seçin —</option>`+Object.entries(M.cmap)
      .sort((a,b)=>a[1].localeCompare(b[1],'tr')).map(([id,ad])=>`<option value="${id}" ${String(kurumOn)===String(id)?'selected':''}>${esc(orgKisa(ad,50))}</option>`).join('');
    if(n) n.textContent='Bu işin henüz kurum bağlantısı yok.';
  }
  await mfSozYukle(sozOn);
}
async function mfSozYukle(sozOn){
  const s=document.getElementById('mfSoz'); if(!s) return;
  const wid=gv('mfIs'), cid=gv('mfKurum');
  if(!wid&&!cid){ s.innerHTML='<option value="">Bağlı değil</option>'; return; }
  let l=[]; try{ l=await api(`media_contract_items&job_id=${wid||''}&customer_id=${cid||''}`); }catch(e){ l=[]; }
  s.innerHTML='<option value="">Bağlı değil</option>'+l.map(k=>`<option value="${k.id}" ${String(sozOn)===String(k.id)?'selected':''}>${esc(k.etiket)}</option>`).join('');
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
  const ortak={work_id:+wid,customer_id:+cid,start_date:bas,end_date:bit||null,
    commitment:f.esz?'confirmed':(on?on.dataset.v:'reserved'),
    contract_item_id:gv('mfSoz')||null,note:gv('mfNot')||null,eski_devral:!!f.devral};
  const btn=document.getElementById('mfKaydet'); const btnMetin=btn?btn.textContent:'Kaydet';
  if(btn){ btn.disabled=true; btn.textContent='Kaydediliyor…'; }
  let r;
  try{
    r=f.kayit&&f.kayit.placement_id
      ? await api('media_update',{id:f.kayit.placement_id,patch:{...ortak,end_date:bit||'',contract_item_id:ortak.contract_item_id||''}})
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
   DETAY PENCERELERİ
   ========================================================== */
async function mKayitAc(pid){
  const M=ui._M||await mdYukle();
  const r=M.recs.find(x=>x.placement_id===pid); if(!r){ mpAlert('Kayıt bulunamadı.'); return; }
  const a=M.altById[r.alt_mecra_id]||{}; const esz=r.occupancy_mode==='concurrent';
  const zm=mdZamansal(r,mdBugun());
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  modal(`<h3 style="margin:0 0 2px">${esc(esz?a.name:(r.unit_name||''))}</h3>
    <p class="muted" style="margin:0 0 12px;font-size:12.5px">${esc(r.mecra_name||'')}${esz?' · eşzamanlı LED yayını':` · ${esc(a.name||'')}`}</p>
    <div class="md-dl">
      <span>Kurum</span><b>${r.customer_id?`<button class="btn-link" onclick="closeModal();orgAc(${r.customer_id})">${esc(r.customer_name||'')}</button>`:'—'}</b>
      <span>İş</span><b>${r.work_id?`<button class="btn-link" onclick="closeModal();workAc(${r.work_id})">${esc(r.work_title||'')}</button>`:'<span class="muted">bağlı değil</span>'}</b>
      <span>Dönem</span><b class="mono">${esc(r.end_date?mdAralikNokta(r.start_date,r.end_date):mdNokta(r.start_date)+' – bitiş bilinmiyor')}</b>
      <span>Durum</span><b>${r.commitment==='cancelled'?'<span class="md-st md-st-iptal">İptal</span>'
          :esz?(zm==='guncel'?'<span class="md-st md-st-yayin">Yayında</span>':zm==='yaklasan'?'<span class="md-st md-st-rezerve">Yaklaşan</span>':'<span class="md-st md-st-eski">Bitti</span>')
          :mdKayitRozet(r,zm)} <span class="muted">${esc(MD_TAAHHUT[r.commitment]||'')}</span></b>
      ${esz&&a.creative_seconds?`<span>Kreatif</span><b>${a.creative_seconds} sn <span class="muted">(mecra kuralı)</span></b>`:''}
      ${r.contract_item_id?`<span>Sözleşme</span><b>Kalem #${r.contract_item_id}</b>`:''}
      ${r.source_quote_id?`<span>Teklif</span><b>#${r.source_quote_id}</b>`:''}
      ${r.legacy_lane?`<span>Kaynak</span><b>Eski tablo şeridi <span class="mono">${esc(r.legacy_lane)}</span> <span class="muted">— yalnız köken; ekran ya da slot değildir</span></b>`:''}
      ${r.note?`<span>Not</span><b>${esc(r.note)}</b>`:''}
      <span>Kaydeden</span><b class="muted">${esc(tm[r.created_by_team_id]||'—')} · ${esc(r.created_at?psZaman(r.created_at):'')}</b>
    </div>
    <div class="md-mf-b">
      <button class="btn btn-ghost btn-sm" onclick="closeModal();medyaGit({gor:'bugun',site:${r.mecra_id},kurum:'',is:'',durum:'',tur:'',q:'',alan:''});ui._mOdak=${pid}">Mecralarda göster</button>
      <span style="flex:1"></span>
      ${r.commitment!=='cancelled'?`<button class="btn btn-outline btn-sm" onclick="mForm({kayit:ui._M.recs.find(x=>x.placement_id===${pid})})">Düzenle</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button></div>`);
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
  medyaGit({gor:'bugun',site:r.mecra_id,alan:'',kurum:'',is:'',durum:'',tur:'',q:''});
}
function mdOdakUygula(){
  const pid=ui._mOdak; if(!pid) return; ui._mOdak=null;
  const M=ui._M; const r=M&&M.recs.find(x=>x.placement_id===pid); if(!r) return;
  /* Derin bağlantının açtığı grup "son ilgili grup"tur: odak şeridi
     kapatılıp başka mecraya gidildiğinde geri dönüşte yeniden kapanmasın. */
  const altId=r.alt_mecra_id!=null?r.alt_mecra_id:(M.unitById[r.unit_id]||{}).alt_mecra_id;
  if(altId!=null){ const st=mdDurum(); st.acik[mdGrupKey({id:altId})]=true; st.acik[mdKartKey({id:r.mecra_id})]=true; mdDurumYaz(st); }
  const hedefEl=document.querySelector(`[data-p="${pid}"]`)
    ||(r.unit_id?document.querySelector(`tr[data-u="${r.unit_id}"]`):null)
    ||document.querySelector(`[data-a="${r.alt_mecra_id}"]`);
  const esz=r.occupancy_mode==='concurrent';
  const ob=document.getElementById('mdOdak');
  if(ob) ob.innerHTML=`<div class="md-odak-b">${ic('lists',15)}
      <span><b>${esc(esz?(r.area_name||''):(r.unit_name||''))}</b> · ${esc(orgKisa(r.customer_name||'',30))} · <span class="mono">${esc(mdDonem(r))}</span>
      ${r.commitment==='cancelled'?' · <span class="md-st md-st-iptal">İptal</span>':''}</span>
      <button class="btn btn-outline btn-sm" onclick="mKayitAc(${pid})">Kaydı aç</button>
      <button class="afilt-x" onclick="this.closest('.md-odak-b').remove()" aria-label="Kapat">✕</button></div>`;
  if(hedefEl){ hedefEl.classList.add('md-odak'); setTimeout(()=>hedefEl.scrollIntoView({block:'center'}),40); }
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
  const git=o.is?`medyaGit({is:'${o.is}',kurum:'',site:null,gor:'bugun',durum:'',tur:'',q:'',alan:''})`
                :`medyaGit({kurum:'${o.kurum}',is:'',site:null,gor:'bugun',durum:'',tur:'',q:'',alan:''})`;
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
    ${gecmis?`<p class="muted" style="font-size:12px;margin:8px 0 0">${gecmis} geçmiş kayıt Yıl ızgarasında.</p>`:''}
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
