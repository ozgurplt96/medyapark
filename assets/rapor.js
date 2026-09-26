/* =====================================================================
   RAPORLAR V2 (Sprint 12) — kullanıma hazır PDF / Excel çıktıları
   ---------------------------------------------------------------------
   Dört rapor: Mecra müsaitliği · Baskı/montaj dökümü · Kişisel çalışma
   planı · İş özeti. Hepsi KANONİK kayıtların salt-okunur projeksiyonudur;
   rapor hiçbir kaynağı yazmaz (aşama, yayın durumu, takip, muhasebe…).

   TEK KURAL: BİR RAPOR = BİR MODEL.
       veri (tek okuma anı)  ─┐
       ayar (kapsam/içerik)   ├─> def.model()  ──> önizleme (HTML)
       seçim (çıkar/ekle)    ─┘                ├─> PDF   (pdfmake)
                                               └─> XLSX  (ExcelJS)
   Önizleme ve dosyalar aynı `model` nesnesinden üretilir; ayrı sorgu ya
   da ayrı alan türetimi yoktur. Ayar değiştiğinde model yeniden kurulur;
   veri yeniden okunması gerekiyorsa indirme düğmeleri kilitlenir.

   KAPALI ALAN = MODELDE YOK. Dış paylaşımda kapatılan bilgi (müşteri adı,
   maliyet, serbest not…) önizleme ya da dosya aşamasında gizlenmez; model
   kurulurken hiç kopyalanmaz. Dosyada, gizli sayfada, yorumda, formülde
   ya da metadata'da bulunamaz.

   Kütüphaneler yalnız gerektiğinde yüklenir (SheetJS deseni):
     pdfmake 0.2.12  — metin seçilebilir PDF, tekrar eden tablo başlığı,
                       gömülü font (Plus Jakarta Sans, OFL, assets/fonts)
     ExcelJS 4.4.0   — biçimli gerçek XLSX: sabit başlık satırı, filtre,
                       yazdırma alanı / yönü / tekrar eden başlık. SheetJS
                       topluluk sürümü bunları YAZAMIYOR (S2'de doğrulandı);
                       mevcut ekran dışa aktarımları ve içe aktarım SheetJS'te
                       kalır, ikinci bir içe aktarım sistemi açılmaz.
   ===================================================================== */

const RP_TURLER=['mecra','baski','plan','is'];
const RP_GUN_MS=864e5;
const rp2=n=>String(n).padStart(2,'0');
const rpDn=iso=>{ const [y,m,d]=String(iso).slice(0,10).split('-').map(Number); return Date.UTC(y,m-1,d)/RP_GUN_MS; };
const rpIso=n=>{ const d=new Date(n*RP_GUN_MS); return `${d.getUTCFullYear()}-${rp2(d.getUTCMonth()+1)}-${rp2(d.getUTCDate())}`; };
const rpTr=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?`${m[3]}.${m[2]}.${m[1]}`:''; };
const rpTrKisa=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?`${m[3]}.${m[2]}`:''; };
const rpBugun=()=>_cIso(new Date());
const rpEkle=(iso,n)=>rpIso(rpDn(iso)+n);
const RP_AYLAR=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const RP_AY3=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const RP_GUNLER=['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
const rpGunAdi=iso=>{ const d=new Date(rpDn(iso)*RP_GUN_MS); return `${RP_GUNLER[d.getUTCDay()]}, ${d.getUTCDate()} ${RP_AYLAR[d.getUTCMonth()]}`; };
const rpAnTr=d=>d.toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
/* timestamptz -> yerel ISO gün */
const rpYerelGun=ts=>ts?_cIso(new Date(ts)):'';
const RP_PB={TRY:'₺',USD:'$',EUR:'€'};
const rpPara=(v,pb)=>v==null||v===''?'':Number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(RP_PB[pb||'TRY']||pb||'');
const rpSayi=v=>v==null||v===''?'':Number(v).toLocaleString('tr-TR',{maximumFractionDigits:2});
const RP_BIRIM={adet:'adet',m2:'m²',metre:'metre',gun:'gün',saat:'saat',takim:'takım',hizmet:'hizmet'};

/* ==========================================================
   KÜTÜPHANELER
   ========================================================== */
let _rpPdfP=null, _rpXlsP=null;
function rpScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script');
  s.src=src; s.onload=()=>res(); s.onerror=()=>rej(new Error('Kütüphane yüklenemedi. İnternet bağlantınızı kontrol edin.'));
  document.head.appendChild(s); }); }
async function rpFontB64(ad){
  const r=await fetch('assets/fonts/'+ad,{cache:'force-cache'});
  if(!r.ok) throw new Error('PDF yazı tipi okunamadı ('+ad+').');
  const b=new Uint8Array(await r.arrayBuffer()); let s='';
  for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));
  return btoa(s);
}
function rpPdfLib(){
  if(_rpPdfP) return _rpPdfP;
  _rpPdfP=(async()=>{
    if(!window.pdfMake) await rpScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.12/pdfmake.min.js');
    const [r,sb_,b]=await Promise.all(['PlusJakartaSans-Regular.ttf','PlusJakartaSans-SemiBold.ttf','PlusJakartaSans-Bold.ttf'].map(rpFontB64));
    pdfMake.vfs={'PJS-R.ttf':r,'PJS-SB.ttf':sb_,'PJS-B.ttf':b};
    pdfMake.fonts={Jakarta:{normal:'PJS-R.ttf',bold:'PJS-B.ttf',italics:'PJS-R.ttf',bolditalics:'PJS-B.ttf'},
                   JakartaSB:{normal:'PJS-SB.ttf',bold:'PJS-B.ttf',italics:'PJS-SB.ttf',bolditalics:'PJS-B.ttf'}};
  })().catch(e=>{ _rpPdfP=null; throw e; });
  return _rpPdfP;
}
function rpXlsLib(){
  if(window.ExcelJS) return Promise.resolve();
  if(_rpXlsP) return _rpXlsP;
  _rpXlsP=rpScript('https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js').catch(e=>{ _rpXlsP=null; throw e; });
  return _rpXlsP;
}
function rpIndir(blob,ad){
  const u=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=u; a.download=ad; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),60000);
}

/* ==========================================================
   ORTAK ÇIKTI STİLİ — PDF
   ========================================================== */
const RPC={ink:'#1d1d1f',ink2:'#55555b',ink3:'#86868b',line:'#d6d6db',soft:'#f3f3f5',
  accent:'#e63333',mavi:'#1f5fb8',maviS:'#e6eefa',amber:'#8a5a00',amberS:'#fbefd4',
  yesil:'#1a7f37',yesilS:'#e2f2e6',kirmizi:'#b3261e',kirmiziS:'#fbe7e5'};
const RP_TUR_RENK={yayin:[RPC.mavi,RPC.maviS],opsiyon:[RPC.amber,RPC.amberS],musait:[RPC.yesil,RPC.yesilS]};

/* Ortak künye: kim için, hangi dönem, ne zaman üretildi. */
function rpKunye(m){
  const s=[];
  if(m.alici) s.push(['Hazırlanan', m.alici]);
  (m.bilgi||[]).forEach(x=>{ if(x&&x[1]) s.push(x); });
  s.push(['Oluşturulma', rpAnTr(m.an)]);
  return s;
}
function rpPdfBelge(m,icerik,o){
  o=o||{};
  const yon=o.yon||'portrait', boyut=o.boyut||'A4';
  const kucuk=boyut==='A5';
  const an=rpAnTr(m.an);
  const kunye=rpKunye(m);
  const bas=[
    {columns:[
      {text:[{text:'MEDYA',bold:true,color:RPC.ink},{text:'PARK',bold:true,color:RPC.accent}],fontSize:kucuk?11:12,characterSpacing:1.2},
      {text:m.tur,alignment:'right',color:RPC.ink3,fontSize:8.5,margin:[0,2,0,0]}]},
    {canvas:[{type:'line',x1:0,y1:0,x2:o.genislik||(yon==='landscape'?770:(kucuk?364:523)),y2:0,lineWidth:0.8,lineColor:RPC.line}],margin:[0,6,0,10]},
    {text:m.baslik,style:'h1'},
    m.altBaslik?{text:m.altBaslik,color:RPC.ink2,fontSize:kucuk?10:10.5,margin:[0,2,0,6]}:null,
    kunye.length?{table:{widths:['auto','*'],body:kunye.map(([k,v])=>[{text:k,color:RPC.ink3,fontSize:8.5},{text:String(v),fontSize:9}])},
      layout:'noBorders',margin:[0,4,0,8]}:null,
    m.aciklama?{text:m.aciklama,fontSize:kucuk?10.5:10,margin:[0,0,0,10],color:RPC.ink}:null
  ].filter(Boolean);
  return {
    pageSize:boyut, pageOrientation:yon,
    pageMargins:kucuk?[28,40,28,38]:[36,44,36,40],
    info:{title:m.baslik, author:'Medyapark', subject:m.tur, creator:'Medyapark', producer:'Medyapark', keywords:''},
    header:(p)=>p>1?{columns:[{text:[{text:'MEDYA',bold:true},{text:'PARK',bold:true,color:RPC.accent},{text:'  ·  '+m.baslik,color:RPC.ink2}]},
        {text:m.tur,alignment:'right',color:RPC.ink3}],fontSize:7.5,margin:kucuk?[28,18,28,0]:[36,20,36,0]}:null,
    footer:(p,n)=>({columns:[{text:'Oluşturulma: '+an+(o.altNot?'  ·  '+o.altNot:''),color:RPC.ink3},
        {text:`Sayfa ${p} / ${n}`,alignment:'right',color:RPC.ink3,width:70}],fontSize:7.5,margin:kucuk?[28,12,28,0]:[36,14,36,0]}),
    content:[...bas,...icerik],
    defaultStyle:{font:'Jakarta',fontSize:kucuk?11:9.5,color:RPC.ink,lineHeight:1.18},
    styles:{
      h1:{fontSize:kucuk?16:18,bold:true,margin:[0,0,0,2]},
      h2:{font:'JakartaSB',fontSize:kucuk?13.5:12.5,margin:[0,12,0,5],color:RPC.ink},
      h3:{font:'JakartaSB',fontSize:kucuk?11.5:10.5,margin:[0,8,0,4],color:RPC.ink2},
      th:{bold:true,fontSize:kucuk?9.5:8.5,color:RPC.ink2},
      not:{fontSize:kucuk?9.5:8.3,color:RPC.ink2},
      bos:{fontSize:kucuk?10.5:9.5,color:RPC.ink3,italics:true,margin:[0,2,0,8]},
      ozetSatir:{fontSize:9.5,color:RPC.ink}},
    /* Grup başlığı sayfa sonunda tek başına kalmaz. */
    /* Aynı sayfada başlıktan sonra yalnız TABLO KABUĞU kaldıysa (satırları
       sonraki sayfaya taşınmışsa) başlık da taşınır. */
    pageBreakBefore:(node,sonraki)=>node.headlineLevel===1&&sonraki.every(n=>n.headlineLevel===1||n.table||n.canvas&&!n.text)
  };
}
const rpH2=(t,ek)=>({text:t,style:'h2',headlineLevel:1,...(ek||{})});
const rpH3=(t,ek)=>({text:t,style:'h3',headlineLevel:1,...(ek||{})});
/* Tablo: başlık her sayfada tekrar eder; satır sayfa sonunda bölünmez. */
/* `o.ust`: grup başlıkları tablonun TEKRARLANAN başlık satırlarıdır —
   başlık ilk veri satırından asla ayrılmaz ve devam sayfasında da görünür. */
function rpTablo(kol,satirlar,o){
  o=o||{};
  const ust=(o.ust||[]).filter(Boolean).map(u=>[{text:u.text,colSpan:kol.length,style:u.stil||'h3',margin:[-4,u.stil==='h2'?10:4,0,u.stil==='h2'?2:1]},
    ...Array(Math.max(0,kol.length-1)).fill({})]);
  const U=ust.length;
  const body=[...ust,kol.map(k=>({text:k.b,style:'th',alignment:k.sag?'right':'left'}))];
  satirlar.forEach(r=>body.push(r.map((v,i)=>{
    const c=(v&&typeof v==='object'&&!Array.isArray(v))?{...v}:{text:v==null?'':String(v)};
    if(kol[i].sag&&!c.alignment) c.alignment='right';
    return c; })));
  return {table:{headerRows:U+1,dontBreakRows:true,keepWithHeaderRows:1,widths:kol.map(k=>k.g||'*'),body},
    layout:{hLineWidth:(i,n)=>i<=U||i===n.table.body.length?0:(i===U+1?0.9:0.4),
      vLineWidth:()=>0, hLineColor:i=>i===U+1?RPC.line:'#e6e6ea',
      fillColor:(i)=>i===U?RPC.soft:null, paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>3,paddingBottom:()=>3},
    margin:o.margin||[0,0,0,8], fontSize:o.fs};
}
/* Bölüm = başlık + tablo (başlık tablonun tekrar eden satırıdır) ya da
   başlık + boş mesaj (bölünmez). Başlık hiçbir durumda sayfa sonunda
   tek başına kalmaz. */
function rpBolum(baslik,kol,satirlar,bos,o){
  if(satirlar&&satirlar.length) return rpTablo(kol,satirlar,{...(o||{}),ust:[{text:baslik,stil:'h2'}]});
  return {stack:[{text:baslik,style:'h2'},{text:bos,style:'bos'}],unbreakable:true};
}
const rpKutu=(boyut)=>({canvas:[{type:'rect',x:0,y:2,w:boyut||10,h:boyut||10,r:1.5,lineWidth:0.9,lineColor:'#6b6b70'}],width:(boyut||10)+6});

/* ==========================================================
   ORTAK ÇIKTI STİLİ — XLSX
   Başlık bloğu (1-3. satır) BİRLEŞTİRİLMEZ; veri tablosu 5. satırdaki
   başlıkla başlar. Filtre, sabit başlık ve yazdırma alanı yalnız veri
   bölgesini kapsar, böylece sıralama dekoratif satırlara dokunmaz.
   ========================================================== */
const RP_XF={tarih:'dd.mm.yyyy',sayi:'#,##0.##',tam:'#,##0',para:'#,##0.00',yuzde:'0.0%'};
function rpXlsHucre(c,tip,v){
  if(v==null||v===''){ c.value=null; return; }
  if(tip==='tarih'){ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if(m){ c.value=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); c.numFmt=RP_XF.tarih; return; } }
  if(tip==='sayi'||tip==='tam'||tip==='para'||tip==='yuzde'){ const n=Number(v);
    if(Number.isFinite(n)){ c.value=n; c.numFmt=RP_XF[tip]; return; } }
  /* Kullanıcı metni ASLA formül olarak yazılmaz: ExcelJS'te formül yalnız
     {formula} nesnesiyle oluşur; düz metin paylaşılan metin olarak kalır. */
  c.value=String(v);
}
async function rpXlsDosya(m,sayfalar){
  await rpXlsLib();
  const wb=new ExcelJS.Workbook();
  wb.creator='Medyapark'; wb.lastModifiedBy='Medyapark'; wb.title=m.baslik; wb.subject=m.tur;
  wb.created=m.an; wb.modified=m.an; wb.company=''; wb.manager=''; wb.keywords=''; wb.description='';
  sayfalar.forEach(s=>{
    const ws=wb.addWorksheet(s.ad.slice(0,31),{
      pageSetup:{paperSize:9,orientation:s.yon||'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,
        margins:{left:0.4,right:0.4,top:0.5,bottom:0.5,header:0.25,footer:0.25}},
      headerFooter:{oddFooter:'&L'+m.baslik.replace(/&/g,'&&')+'&RSayfa &P / &N'}});
    ws.getCell('A1').value=m.baslik; ws.getCell('A1').font={bold:true,size:14};
    const alt=[m.tur, ...rpKunye(m).map(([k,v])=>`${k}: ${v}`)].join('   ·   ');
    ws.getCell('A2').value=alt; ws.getCell('A2').font={size:9,color:{argb:'FF55555B'}};
    if(s.not||m.aciklama){ ws.getCell('A3').value=s.not||m.aciklama; ws.getCell('A3').font={size:9,italic:!!s.not}; }
    const H=5;
    const hr=ws.getRow(H);
    s.kol.forEach((k,i)=>{ const c=hr.getCell(i+1); c.value=k.b;
      c.font={bold:true,size:10}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF0F0F3'}};
      c.border={bottom:{style:'thin',color:{argb:'FFB5B5BC'}}};
      c.alignment={vertical:'middle',wrapText:true}; });
    hr.height=30;
    s.kol.forEach((k,i)=>{ ws.getColumn(i+1).width=k.w||16; });
    s.satir.forEach((r,ri)=>{ const row=ws.getRow(H+1+ri);
      s.kol.forEach((k,i)=>{ const c=row.getCell(i+1); rpXlsHucre(c,k.tip,r[i]);
        c.alignment={vertical:'top',wrapText:!!k.sar,horizontal:['sayi','tam','para','yuzde'].includes(k.tip)?'right':undefined}; });
    });
    const son=H+s.satir.length;
    const kolHarf=ws.getColumn(s.kol.length).letter;
    if(s.satir.length&&!s.bilgi) ws.autoFilter={from:{row:H,column:1},to:{row:son,column:s.kol.length}};
    if(!s.bilgi) ws.views=[{state:'frozen',ySplit:H,xSplit:s.sabitKol||0,topLeftCell:'A'+(H+1),activeCell:'A'+(H+1)}];
    let alt2=son;
    if(s.alt&&s.alt.length){ alt2=son+1;
      s.alt.forEach(r=>{ alt2++; const row=ws.getRow(alt2);
        r.forEach((v,i)=>{ if(v&&typeof v==='object'&&'v' in v){ rpXlsHucre(row.getCell(i+1),v.tip,v.v); row.getCell(i+1).font={bold:!!v.kalin}; }
          else { rpXlsHucre(row.getCell(i+1),'metin',v); row.getCell(i+1).font={bold:true}; } }); }); }
    ws.pageSetup.printArea=`A1:${kolHarf}${alt2}`;
    ws.pageSetup.printTitlesRow=`${H}:${H}`;
  });
  const buf=await wb.xlsx.writeBuffer();
  return new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

/* ==========================================================
   DURUM
   ========================================================== */
function rpDurum(){ if(!ui._rp) ui._rp={ayar:{},alici:{},baslik:{},secim:{},veri:{},gordu:{}}; return ui._rp; }
function rpSecimOf(tur){ const R=rpDurum(); if(!R.secim[tur]) R.secim[tur]={mod:'tum',cik:new Set(),sec:new Set()}; return R.secim[tur]; }
function rpDahil(tur,key){ const s=rpSecimOf(tur); return s.mod==='tum'?!s.cik.has(key):s.sec.has(key); }
/* Varsayılan olarak DIŞARIDA başlayan kayıt (ör. etiketlenmediğim
   güncelleme) ilk görüldüğü an bir kez çıkarılır; kullanıcı sonra ekler. */
function rpVarsayilanDisi(tur,key){
  const R=rpDurum(); const g=(R.gordu[tur]=R.gordu[tur]||new Set());
  if(g.has(key)) return; g.add(key);
  const s=rpSecimOf(tur); if(s.mod==='tum') s.cik.add(key);
}

/* ==========================================================
   GİRİŞ EKRANI
   ========================================================== */
const RP_KART=[
  {tur:'mecra',ad:'Mecra müsaitliği ve yayın durumu',ikon:'media',
   ac:'Belirli yüzeylerin belirli dönemdeki durumunu ajansa, pazarlamacıya ya da müşteriye gönderin: tam dönem müsaitlik, müsait tarih aralıkları veya yayın/opsiyon çizelgesi.'},
  {tur:'baski',ad:'Baskı / montaj dökümü',ikon:'truck',
   ac:'Bir kurumun ya da işin baskı, montaj, söküm ve ilgili hizmetlerinin teknik ve gerektiğinde ticari dökümü.'},
  {tur:'plan',ad:'Kişisel çalışma planı',ikon:'notes',
   ac:'Günlük ya da haftalık planı telefona indirin: tarihli işler, gecikenler, tarihsiz aksiyonlar ve bilmeniz gereken gelişmeler. Çevrimdışı okunur.'},
  {tur:'is',ad:'İş özeti ve geçmişi',ikon:'jobs',
   ac:'Bir işin mevcut durumunu ve gelişimini paylaşın: seçilmiş güncellemeler, önemli hareketler, yayın, baskı/montaj ve belgeler.'}];
async function raporlar(c){
  const st=history.state;
  const tur=(st&&st.mp&&st.v==='rapor'&&st.s==='raporlar')?RP_TURLER[(st.id||1)-1]:null;
  if(tur) return rpEkran(c,tur);
  navKayit('sec','raporlar');
  c.innerHTML=`<div class="sec-head"><div><h3>Raporlar</h3>
      <p class="sub">Kayıtlardan paylaşılabilir PDF ve Excel çıktıları. Rapor hazırlamak hiçbir kaydı değiştirmez.</p></div></div>
    <div class="rp2-kartlar">${RP_KART.map(k=>`<button type="button" class="rp2-kart" onclick="rpAc('${k.tur}')">
        <span class="rp2-kart-i">${ic(k.ikon,20)}</span><b>${esc(k.ad)}</b><em>${esc(k.ac)}</em>
        <span class="rp2-kart-f">${k.tur==='plan'||k.tur==='is'?'PDF':'PDF · Excel'} ›</span></button>`).join('')}</div>
    <details class="rp2-eski"><summary>Hızlı Excel tabloları <span class="muted">— iş takibi, aksiyon planı, teklifler, aylık doluluk (ham tablo)</span></summary>
      <div id="rpEskiKutu"></div></details>`;
  const d=c.querySelector('.rp2-eski');
  d.addEventListener('toggle',()=>{ const k=document.getElementById('rpEskiKutu');
    if(d.open&&k&&!k.dataset.ok){ k.dataset.ok='1'; raporTablolari(k); } });
}
/* Bir rapora bağlamdan girilebilir: preset = {is, kurum, site, bas, bit…}. */
async function rpAc(tur,preset){
  if(typeof dirtyGuard==='function'&&!(await dirtyGuard())) return;
  const R=rpDurum();
  if(preset){ R.ayar[tur]={...rpVarsayilan(tur),...preset}; R.secim[tur]=null; R.gordu[tur]=null; R.baslik[tur]=null; }
  if(ui.section!=='raporlar'){ ui.section='raporlar'; navCiz(); const t=document.getElementById('ttl'); if(t) t.textContent=TITLES.raporlar; }
  navKayit('rapor','raporlar',RP_TURLER.indexOf(tur)+1,(RP_KART.find(k=>k.tur===tur)||{}).ad);
  const c=document.getElementById('content'); window.scrollTo(0,0);
  await rpEkran(c,tur);
}

/* ==========================================================
   RAPOR EKRANI (ortak iskelet)
   Rapor seç → kapsam ve içerik → önizle ve indir.
   ========================================================== */
function rpAyar(tur){ const R=rpDurum(); if(!R.ayar[tur]) R.ayar[tur]=rpVarsayilan(tur); return R.ayar[tur]; }
function rpVarsayilan(tur){ const D=RPD[tur]; const a=D.varsayilan(); const v=D.alici||'dis'; Object.assign(a,D.preset(v)); a._alici=v; return a; }
async function rpEkran(c,tur){
  const D=RPD[tur], a=rpAyar(tur), k=RP_KART.find(x=>x.tur===tur);
  ui._rpTur=tur;
  c.innerHTML=`<div class="sec-head"><div>${geriBtn('raporlar')}<h3 style="margin-top:6px">${esc(k.ad)}</h3>
      <p class="sub">${esc(D.amac)}</p></div></div>
    <div class="rp2">
      <section class="rp2-card" aria-labelledby="rpK1"><h4 id="rpK1"><span>1</span> Kapsam</h4><div id="rpKapsam"></div></section>
      <section class="rp2-card" aria-labelledby="rpK2"><h4 id="rpK2"><span>2</span> Alıcı ve başlık</h4><div id="rpAlici"></div></section>
      <section class="rp2-card rp2-on" aria-labelledby="rpK3"><h4 id="rpK3"><span>3</span> Önizleme ve indirme</h4>
        <div class="rp2-bar" id="rpBar"></div><div id="rpNot" role="status" aria-live="polite"></div><div id="rpPrev"></div></section>
    </div>`;
  rpKontrolCiz(tur);
  await rpYenile(tur,{veri:true});
}
function rpKontrolCiz(tur){
  const D=RPD[tur], a=rpAyar(tur), R=rpDurum();
  const kk=document.getElementById('rpKapsam'); if(kk) kk.innerHTML=D.kontroller(a);
  const al=document.getElementById('rpAlici');
  if(al) al.innerHTML=`<div class="md-seg rp2-seg" role="radiogroup" aria-label="Rapor kimin için">
      ${[['dis','Dış paylaşım'],['ic','İç kullanım']].map(([v,l])=>`<button type="button" role="radio" aria-checked="${a._alici===v}"
        class="${a._alici===v?'on':''}" onclick="rpAliciSec('${tur}','${v}')">${a._alici===v?'✓ ':''}${l}</button>`).join('')}</div>
    <p class="fhint">Bu seçim yetki kazandırmaz; yalnız hangi bilgilerin varsayılan olarak dahil edileceğini belirler. ${esc(D.presetNot||'')}</p>
    <div class="rp2-grid">
      <div class="field"><label class="flabel" for="rpBaslik">Rapor başlığı</label>
        <input class="inp" id="rpBaslik" value="${esc(R.baslik[tur]||'')}" placeholder="${esc(D.baslik(a,R.veri[tur]))}" oninput="rpMetin('${tur}')"></div>
      <div class="field"><label class="flabel" for="rpAliciAd">Alıcı (isteğe bağlı)</label>
        <input class="inp" id="rpAliciAd" value="${esc(a._aliciAd||'')}" placeholder="ör. ABC Ajans — Medya Planlama" oninput="rpMetin('${tur}')"></div></div>
    <div class="field"><label class="flabel" for="rpAciklama">Kısa açıklama (isteğe bağlı, yalnız bu rapora ait)</label>
      <textarea class="inp" id="rpAciklama" rows="2" maxlength="600" oninput="rpMetin('${tur}')" placeholder="Rapora eklenecek bir iki cümle. Kaynak kayıtlardaki notlar değişmez.">${esc(a._aciklama||'')}</textarea></div>`;
}
function rpAliciSec(tur,v){
  const a=rpAyar(tur); if(a._alici===v) return;
  Object.assign(a,RPD[tur].preset(v)); a._alici=v;
  rpKontrolCiz(tur); rpNot(v==='dis'?'Dış paylaşım varsayılanları uygulandı: iç bilgiler kapatıldı.':'İç kullanım varsayılanları uygulandı.');
  rpYenile(tur);
}
let _rpMetinT=null;
function rpMetin(tur){ const a=rpAyar(tur);
  rpDurum().baslik[tur]=gv('rpBaslik').trim();
  a._aliciAd=gv('rpAliciAd').trim(); a._aciklama=gv('rpAciklama').trim();
  clearTimeout(_rpMetinT); _rpMetinT=setTimeout(()=>rpOnizleCiz(tur),250); }
function rpHataMetni(e){ const m=String((e&&e.message)||e||'');
  return /Failed to fetch|NetworkError|Load failed/i.test(m)?'Bağlantı kurulamadı; internet bağlantınızı kontrol edip yeniden deneyin.':m; }
function rpNot(t,tip){ const n=document.getElementById('rpNot'); if(n) n.innerHTML=t?`<div class="rp2-not ${tip||''}">${esc(t)}</div>`:''; }
/* Ayar değişimi: tek giriş noktası. `veri` gerekiyorsa yeniden okunur. */
async function rpSet(tur,k,v,yenidenCiz){
  const a=rpAyar(tur); a[k]=v;
  if(yenidenCiz) rpKontrolCiz(tur);
  await rpYenile(tur,{veri:RPD[tur].veriAnahtar(a)!==(rpDurum().veriAnahtar||{})[tur]});
}
function rpSetKontrolsuz(tur,k,v){ rpAyar(tur)[k]=v; }
async function rpYenile(tur,o){
  o=o||{};
  const R=rpDurum(), D=RPD[tur], a=rpAyar(tur);
  const anahtar=D.veriAnahtar(a);
  R.veriAnahtar=R.veriAnahtar||{};
  if(o.veri||!R.veri[tur]||R.veriAnahtar[tur]!==anahtar){
    const surum=(R._surum=(R._surum||0)+1);
    R.yukleniyor=true; rpBarCiz(tur,null);
    const p=document.getElementById('rpPrev'); if(p) p.innerHTML='<p class="muted">Kayıtlar okunuyor…</p>';
    let veri=null, hata=null;
    try{ veri=await D.veri(a); veri.okunma=new Date(); }catch(e){ hata=e; }
    if(surum!==R._surum) return;               /* daha yeni bir istek var */
    R.yukleniyor=false;
    if(hata){ R.veri[tur]=null; R.veriHata=hata;
      rpBarCiz(tur,null);
      if(p) p.innerHTML=`<div class="imp-warn">Rapor verisi okunamadı: ${esc(rpHataMetni(hata))} Önizleme boş değildir; veri henüz alınamadı.<br>
        <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="rpYenile('${tur}',{veri:true})">Yeniden dene</button></div>`;
      return; }
    R.veri[tur]=veri; R.veriAnahtar[tur]=anahtar; R.veriHata=null;
    if(D.veriSonra) D.veriSonra(a,veri);
    const kk=document.getElementById('rpKapsam'); if(kk&&D.kontrolVeriyle) kk.innerHTML=D.kontroller(a);
  }
  rpOnizleCiz(tur);
}
/* Modeli kur: önizleme ve dosyalar BU fonksiyonun çıktısını kullanır. */
function rpModelKur(tur){
  const R=rpDurum(), D=RPD[tur], a=rpAyar(tur), v=R.veri[tur];
  if(!v) return null;
  const m=D.model(a,v);
  m.tur=(RP_KART.find(k=>k.tur===tur)||{}).ad;
  m.baslik=R.baslik[tur]||D.baslik(a,v);
  m.alici=a._aliciAd||''; m.aciklama=a._aciklama||''; m.an=v.okunma;
  m.dis=a._alici==='dis';
  return m;
}
function rpOnizleCiz(tur){
  const R=rpDurum(), D=RPD[tur], p=document.getElementById('rpPrev');
  if(!p||R.yukleniyor) return;
  if(!R.veri[tur]) return;
  let m;
  try{ m=rpModelKur(tur); }catch(e){ console.error(e); p.innerHTML=`<div class="imp-warn">Önizleme hazırlanamadı: ${esc(e.message||e)}</div>`; rpBarCiz(tur,null); return; }
  ui._rpModel=m;
  rpBarCiz(tur,m);
  p.innerHTML=(m.budanan?`<div class="rp2-not">Filtre dışında kalan ${m.budanan} seçim temizlendi; rapora girmeyecek.</div>`:'')
    +(m.uyari||[]).map(u=>`<div class="rp2-not uyari">${esc(u)}</div>`).join('')
    +D.onizle(m,rpAyar(tur));
}
function rpBarCiz(tur,m){
  const b=document.getElementById('rpBar'); if(!b) return;
  const D=RPD[tur], s=rpSecimOf(tur), R=rpDurum();
  const kilit=!m||R.yukleniyor;
  const say=m?m.say:null;
  b.innerHTML=`<div class="rp2-say">${R.yukleniyor?'<span class="muted">Güncelleniyor…</span>':say?
      `<b>${say.dahil}</b> ${esc(say.birim)} raporda <span class="muted">· filtrelenen ${say.filtre}${say.cik?` · çıkarılan ${say.cik}`:''}</span>`:''}</div>
    ${D.secimli===false?'':`<div class="md-seg rp2-seg sm" role="radiogroup" aria-label="Kayıt seçimi">
      ${[['tum','Tüm filtrelenen sonuçlar'],['sec','Yalnız seçili kayıtlar']].map(([v,l])=>`<button type="button" role="radio" aria-checked="${s.mod===v}"
        class="${s.mod===v?'on':''}" onclick="rpSecMod('${tur}','${v}')">${s.mod===v?'✓ ':''}${l}</button>`).join('')}</div>`}
    <div class="rp2-ind">
      ${D.pdf?`<button class="btn btn-primary btn-sm" id="rpPdfB" ${kilit||!say||!say.dahil&&!D.bosIndirilebilir?'disabled':''} onclick="rpIndirPdf('${tur}')">${ic('download',15)} PDF</button>`:''}
      ${D.xlsx?`<button class="btn btn-outline btn-sm" id="rpXlsB" ${kilit||!say||!say.dahil&&!D.bosIndirilebilir?'disabled':''} onclick="rpIndirXls('${tur}')">${ic('download',15)} Excel</button>`:''}
    </div>`;
}
function rpSecMod(tur,v){ const s=rpSecimOf(tur); if(s.mod===v) return;
  s.mod=v; if(v==='sec'){ s.sec=new Set(); } else { s.cik=new Set(); rpDurum().gordu[tur]=null; }
  rpOnizleCiz(tur); }
function rpSec(tur,key,on){ const s=rpSecimOf(tur);
  if(s.mod==='tum'){ if(on) s.cik.delete(key); else s.cik.add(key); }
  else { if(on) s.sec.add(key); else s.sec.delete(key); }
  rpOnizleCiz(tur); }
function rpSecTopluKey(tur,keys,on){ keys.forEach(k=>{ const s=rpSecimOf(tur);
  if(s.mod==='tum'){ if(on) s.cik.delete(k); else s.cik.add(k); } else { if(on) s.sec.add(k); else s.sec.delete(k); } });
  rpOnizleCiz(tur); }
/* Görünmeyen eski seçim rapora SIZMAZ: filtre dışına düşen anahtarlar
   seçimden düşülür ve kaç tanesinin düştüğü söylenir. */
function rpBuda(tur,gorunen){
  const s=rpSecimOf(tur); let n=0;
  [s.cik,s.sec].forEach(set=>[...set].forEach(k=>{ if(!gorunen.has(k)){ set.delete(k); if(set===s.sec) n++; } }));
  return n;
}
const rpCb=(tur,key,dahil,etiket)=>`<input type="checkbox" class="rp2-cb" ${dahil?'checked':''}
  aria-label="${esc(etiket||'Rapora dahil')}" onchange="rpSec('${tur}','${esc(key)}',this.checked)">`;

let _rpIndiriliyor=false;
async function rpIndirPdf(tur){
  if(_rpIndiriliyor) return; _rpIndiriliyor=true;
  const b=document.getElementById('rpPdfB'); if(b){ b.disabled=true; b.textContent='Hazırlanıyor…'; }
  try{
    const m=rpModelKur(tur); if(!m) throw new Error('Önizleme hazır değil.');
    await rpPdfLib();
    const {icerik,o}=RPD[tur].pdf(m,rpAyar(tur));
    const dd=rpPdfBelge(m,icerik,o);
    const blob=await new Promise((res,rej)=>{ try{ pdfMake.createPdf(dd).getBlob(res); }catch(e){ rej(e); } });
    const ad=rpDosyaAdi(tur,m)+'.pdf';
    ui._rpSon={tip:'pdf',ad,blob,model:m};
    rpIndir(blob,ad); toast('PDF indirildi: '+ad);
  }catch(e){ console.error(e); mpAlert(rpHataMetni(e),'PDF oluşturulamadı'); }
  finally{ _rpIndiriliyor=false; rpBarCiz(tur,ui._rpModel); }
}
async function rpIndirXls(tur){
  if(_rpIndiriliyor) return; _rpIndiriliyor=true;
  const b=document.getElementById('rpXlsB'); if(b){ b.disabled=true; b.textContent='Hazırlanıyor…'; }
  try{
    const m=rpModelKur(tur); if(!m) throw new Error('Önizleme hazır değil.');
    const sayfalar=RPD[tur].xlsx(m,rpAyar(tur));
    const blob=await rpXlsDosya(m,sayfalar);
    const ad=rpDosyaAdi(tur,m)+'.xlsx';
    ui._rpSon={tip:'xlsx',ad,blob,model:m};
    rpIndir(blob,ad); toast('Excel indirildi: '+ad);
  }catch(e){ console.error(e); mpAlert(rpHataMetni(e),'Excel oluşturulamadı'); }
  finally{ _rpIndiriliyor=false; rpBarCiz(tur,ui._rpModel); }
}
function rpDosyaAdi(tur,m){ return exportDosyaAdi('Medyapark',RPD[tur].dosya(m),_dt()); }
/* Bilgi sayfası: yalnız rapor kapsamı ve kurallar — kapatılmış bilgi YOK. */
function rpBilgiSayfa(m,satirlar){
  return {ad:'Bilgi',yon:'portrait',bilgi:true,kol:[{b:'Başlık',w:28},{b:'Değer',w:90,sar:true}],
    satir:[['Rapor',m.tur],['Başlık',m.baslik],...rpKunye(m),...(m.aciklama?[['Açıklama',m.aciklama]]:[]),...satirlar,
      ['Not','Bu dosya oluşturulduğu andaki kayıtların anlık görüntüsüdür; canlı kayıt uygulamadadır.']]};
}

/* ==========================================================
   ORTAK KONTROL PARÇALARI
   ========================================================== */
const rpChk=(tur,k,v,l,ipucu)=>`<label class="rp2-chk"><input type="checkbox" ${v?'checked':''}
  onchange="rpSet('${tur}','${k}',this.checked,true)"> <span>${esc(l)}${ipucu?` <em>${esc(ipucu)}</em>`:''}</span></label>`;
const rpSeg=(tur,k,v,sec,aria)=>`<div class="md-seg rp2-seg sm" role="radiogroup" aria-label="${esc(aria)}">${sec.map(([x,l])=>
  `<button type="button" role="radio" aria-checked="${v===x}" class="${v===x?'on':''}" onclick="rpSet('${tur}','${k}','${x}',true)">${v===x?'✓ ':''}${esc(l)}</button>`).join('')}</div>`;
function rpTarihKontrol(tur,a,bk,ek,etiket){
  return `<div class="rp2-tarih"><div class="field"><label class="flabel" for="rp_${bk}">${esc(etiket?etiket[0]:'Başlangıç')}</label>
      <input class="inp" type="date" id="rp_${bk}" value="${esc(a[bk]||'')}" min="2000-01-01" max="2099-12-31" onchange="rpTarihSec('${tur}','${bk}',this)"></div>
    <div class="field"><label class="flabel" for="rp_${ek}">${esc(etiket?etiket[1]:'Bitiş')}</label>
      <input class="inp" type="date" id="rp_${ek}" value="${esc(a[ek]||'')}" min="2000-01-01" max="2099-12-31" onchange="rpTarihSec('${tur}','${ek}',this)"></div></div>`;
}
/* Yarım ya da geçersiz tarih UYGULANMAZ (S10 kuralı). */
function rpTarihSec(tur,k,el){
  const v=el.value;
  if(v&&!(/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='2000-01-01'&&v<='2099-12-31')){ el.setAttribute('aria-invalid','true'); rpNot('Geçerli bir tarih girin (2000–2099).','uyari'); return; }
  el.removeAttribute('aria-invalid'); rpNot('');
  rpSet(tur,k,v);
}
function rpDonemDogrula(b,e,maxGun){
  if(!b||!e) return 'Başlangıç ve bitiş tarihi seçin.';
  if(b>e) return 'Başlangıç tarihi bitişten sonra olamaz.';
  if(maxGun&&rpDn(e)-rpDn(b)+1>maxGun) return `Dönem en fazla ${maxGun} gün olabilir.`;
  return null;
}

/* ==========================================================
   1) MECRA MÜSAİTLİĞİ VE YAYIN DURUMU
   Hesap Mecralar ekranıyla AYNI kurallar:
     · iptal edilen kayıt bloklamaz; opsiyon ve yayın bloklar
     · süresi dolmuş ama iptal edilmemiş opsiyon bloklamaya DEVAM eder
     · bitişi bilinmeyen kayıt dönem sonuna kadar bloklar
     · A/B yüzleri bağımsız
     · gün düzeyinde tarama: ardışık yenileme sahte boşluk üretmez,
       aynı yüzey-gün iki kez sayılmaz (yayın > opsiyon önceliği)
     · kurum/iş/içerik ayarı hesabı DEĞİŞTİRMEZ; yalnız gösterimi
   ========================================================== */
function rpYuzAyir(name){ const t=String(name||'').trim(); const m=t.match(/^(.*[^\s._-])[\s._-]*([ABab])$/);
  return m?{base:m[1],yuz:m[2].toUpperCase()}:{base:t,yuz:''}; }
function rpMecraKapsam(M,a){
  const siteler=(a.siteler&&a.siteler.length?a.siteler.map(id=>M.mecById[id]):M.mecs).filter(mdKapsamda)
    .sort((x,y)=>(x.sort||0)-(y.sort||0)||x.id-y.id);
  const q=String(a.q||'').toLocaleLowerCase('tr').trim();
  const yuzler=[], led=[]; let pasif=0;
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(x=>!mdArsiv(x));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    alanlar.forEach(al=>{
      if(a.urun&&(al._sahte||String(al.product_id)!==String(a.urun))) return;
      if(mdEszamanli(al)){ led.push({m,al}); return; }
      (al._sahte?yetim:(M.unitsByAlt[al.id]||[])).forEach(u=>{
        const p=rpYuzAyir(u.name);
        if(a.yuz&&p.yuz!==a.yuz) return;
        if(q&&![u.name,al.name,m.name,mdAile(M,al)].some(v=>String(v||'').toLocaleLowerCase('tr').includes(q))) return;
        if(u.active===false){ pasif++; return; }
        yuzler.push({key:'u'+u.id,u,al,m,kod:u.name,pano:p.base,yuz:p.yuz,aile:al._sahte?'Diğer pozisyonlar':mdAile(M,al),
          olcu:u.olcu||((M.prods.find(x=>String(x.id)===String(u.product_id||al.product_id))||{}).olcu)||'',konum:u.konum||''});
      });
    });
  });
  return {siteler,yuzler,led,pasif};
}
/* Yüzün [b,e] içindeki gün gün durumu → ardışık dilimler. */
function rpYuzSerit(M,u,b,e,ref){
  const B=rpDn(b),E=rpDn(e),N=E-B+1; const st=new Array(N).fill(null);
  const recs=(M.byUnit[u.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=e&&(r.block_end==null||r.block_end>=b));
  recs.forEach(r=>{ const s=Math.max(B,rpDn(r.block_start)), t=Math.min(E,r.block_end==null?E:rpDn(r.block_end));
    for(let i=s;i<=t;i++){ const k=i-B, cur=st[k]; if(!cur||(cur.commitment!=='confirmed'&&r.commitment==='confirmed')) st[k]=r; } });
  const seg=[]; let i=0;
  while(i<N){ const r=st[i]; let j=i; while(j+1<N&&st[j+1]===r) j++;
    seg.push({s:rpIso(B+i),e:rpIso(B+j),gun:j-i+1,r,tip:!r?'musait':r.commitment==='confirmed'?'yayin':'opsiyon',
      acikUc:!!(r&&r.block_end==null&&j===N-1),
      aylik:!!(r&&r.record_kind==='legacy'&&r.date_precision==='month'),
      opsSure:!!(r&&r.commitment==='reserved'&&r.option_expires_at&&r.option_expires_at<ref)});
    i=j+1; }
  return seg;
}
const RP_MECRA_CIKTI=[['tam','Dönemin tamamında müsait'],['aralik','Müsait tarih aralıkları'],['cizelge','Yayın / opsiyon çizelgesi']];
RPD_MECRA={
  amac:'Belirli yüzeylerin belirli dönemdeki durumunu dışarıya gönderin. Hesap Mecralar ekranıyla aynı kuralları kullanır.',
  presetNot:'Dış paylaşımda müşteri adları, iş adları ve iç notlar kapalıdır.',
  varsayilan(){ const b=rpBugun(); const d=mdGun(b);
    return {siteler:[],urun:'',yuz:'',q:'',bas:b,bit:_cIso(new Date(d.getFullYear(),d.getMonth()+3,0)),
      cikti:'aralik',durum:'',minGun:1,led:true,ozet:false,olcu:true,konum:false}; },
  preset(v){ return v==='dis'?{musteri:false,isAdi:false,notlar:false,ozet:false}:{musteri:true,isAdi:true,notlar:false,ozet:true}; },
  veriAnahtar:()=>'mecra',
  async veri(){ const M=await mdYukle(); return {M}; },
  veriSonra(a,v){ if(!a.siteler.length) a.siteler=v.M.mecs.filter(mdKapsamda).map(m=>m.id); },
  kontrolVeriyle:true,
  baslik(a){ return a.cikti==='cizelge'?'Yayın ve opsiyon çizelgesi':a.cikti==='tam'?'Müsait yüzeyler':'Müsaitlik durumu'; },
  dosya(m){ return m.cikti==='cizelge'?'Mecra_Cizelge':'Mecra_Musaitlik'; },
  kontroller(a){
    const v=(rpDurum().veri||{}).mecra, M=v&&v.M, T='mecra';
    const siteler=M?M.mecs.filter(mdKapsamda).sort((x,y)=>(x.sort||0)-(y.sort||0)):[];
    const urunler=M?[...new Map(M.alts.filter(x=>!mdArsiv(x)&&siteler.some(s=>s.id===x.mecra_id)&&x.product_id!=null)
      .map(x=>[String(x.product_id),M.pm[x.product_id]||x.name])).entries()].sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr')):[];
    return `<div class="field"><span class="flabel">Çıktı</span>${rpSeg(T,'cikti',a.cikti,RP_MECRA_CIKTI,'Çıktı türü')}
        <p class="fhint">${a.cikti==='tam'?'Seçilen dönemin HER gününde boş olan statik yüzeyler.'
          :a.cikti==='aralik'?'Dönem içinde boş kalan tarih aralıkları — ayın yalnız son on günü boşsa o on gün yazılır.'
          :'Seçilen yüzeylerin dönem boyunca yayın, opsiyon ve müsait dilimleri.'}</p></div>
      ${rpTarihKontrol(T,a,'bas','bit')}
      <div class="field"><span class="flabel">Lokasyon</span><div class="rp2-chips">${siteler.map(s=>`<label class="rp2-chk">
          <input type="checkbox" ${a.siteler.includes(s.id)?'checked':''} onchange="rpSiteSec(${s.id},this.checked)"> <span>${esc(s.name)}</span></label>`).join('')||'<span class="muted">Yükleniyor…</span>'}</div></div>
      <div class="rp2-grid3">
        <div class="field"><label class="flabel" for="rpUrun">Ürün türü</label><select class="inp ${a.urun?'inp-on':''}" id="rpUrun" onchange="rpSet('mecra','urun',this.value,true)">
          <option value="">Tüm ürünler</option>${urunler.map(([id,ad])=>`<option value="${esc(id)}" ${String(a.urun)===id?'selected':''}>${esc(ad)}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="rpYuz">Yüz</label><select class="inp ${a.yuz?'inp-on':''}" id="rpYuz" onchange="rpSet('mecra','yuz',this.value,true)">
          <option value="">A ve B</option><option value="A" ${a.yuz==='A'?'selected':''}>Yalnız A</option><option value="B" ${a.yuz==='B'?'selected':''}>Yalnız B</option></select></div>
        <div class="field"><label class="flabel" for="rpQ">Pozisyon ara</label><input class="inp" id="rpQ" value="${esc(a.q)}" placeholder="P1, Megalight…" oninput="rpAraGecikmeli('mecra','q',this.value)"></div>
      </div>
      ${a.cikti==='cizelge'?`<div class="field"><span class="flabel">Durum</span>${rpSeg(T,'durum',a.durum,[['','Tümü'],['yayin','Yayın kaydı olanlar'],['opsiyon','Opsiyon kaydı olanlar'],['musait','Tamamen müsait olanlar']],'Durum süzgeci')}
        <p class="fhint">Süzgeç yalnız hangi yüzeylerin listeleneceğini seçer; dilimler her zaman bütün kayıtlardan hesaplanır.</p></div>`:''}
      <details class="rp2-adv" ${rpDurum().adv?'open':''} ontoggle="rpDurum().adv=this.open"><summary>Ayrıntılı ayarlar</summary>
        ${a.cikti==='aralik'?`<div class="field" style="max-width:260px"><label class="flabel" for="rpMin">En kısa aralık (gün)</label>
          <input class="inp" type="number" min="1" max="365" id="rpMin" value="${esc(a.minGun)}" onchange="rpSet('mecra','minGun',Math.max(1,+this.value||1))"></div>`:''}
        <div class="rp2-chips col">
          ${rpChk(T,'olcu',a.olcu,'Teknik ölçü')}
          ${rpChk(T,'konum',a.konum,'Konum açıklaması')}
          ${rpChk(T,'led',a.led,'LED yayın bölümü','statik müsaitliğe katılmaz')}
          ${rpChk(T,'ozet',a.ozet,'Doluluk özeti','tek gün ve dönem oranları ayrı')}
          ${a.cikti==='cizelge'||a.led?rpChk(T,'musteri',a.musteri,'Müşteri adları'):''}
          ${a.cikti==='cizelge'||a.led?rpChk(T,'isAdi',a.isAdi,'İş adları'):''}
          ${a.cikti==='cizelge'||a.led?rpChk(T,'notlar',a.notlar,'Kayıt notları','iç not içerebilir'):''}
        </div></details>`;
  },
  model(a,v){
    const M=v.M, T='mecra';
    const hata=rpDonemDogrula(a.bas,a.bit,1100);
    const out={cikti:a.cikti,bas:a.bas,bit:a.bit,gruplar:[],led:[],uyari:[],hata,
      bilgi:[['Dönem',a.bas&&a.bit?`${rpTr(a.bas)} – ${rpTr(a.bit)}`:''],['Çıktı',(RP_MECRA_CIKTI.find(x=>x[0]===a.cikti)||[])[1]]]};
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'yüz'}; return out; }
    const ref=rpBugun();
    const K=rpMecraKapsam(M,a);
    out.bilgi.push(['Lokasyon',K.siteler.map(s=>s.name).join(', ')]);
    if(a.urun) out.bilgi.push(['Ürün',M.pm[a.urun]||'']);
    if(a.yuz) out.bilgi.push(['Yüz',a.yuz==='A'?'Yalnız A':'Yalnız B']);
    const kisi=r=>{ if(!r) return ''; const p=[];
      if(a.musteri&&r.customer_id) p.push(orgKisa(M.cmap[r.customer_id]||'',40));
      if(a.isAdi&&r.work_id&&M.jmap[r.work_id]) p.push(M.jmap[r.work_id].title||'');
      return p.filter(Boolean).join(' · '); };
    /* Çizelge hücresi dar: yalnız kısa kurum etiketi (tam ad ve iş adı Excel listesinde). */
    const kisaKim=r=>!r?'':a.musteri&&r.customer_id?mdOrgEtiket(M.cmap[r.customer_id]||''):(a.isAdi&&r.work_id&&M.jmap[r.work_id]?orgKisa(M.jmap[r.work_id].title||'',22):'');
    const gorunen=new Set(); let filtre=0;
    const hepsi=K.yuzler.map(y=>{
      const seg=rpYuzSerit(M,y.u,a.bas,a.bit,ref);
      const bos=seg.filter(s=>s.tip==='musait');
      return {...y,seg,bos,tam:seg.length===1&&seg[0].tip==='musait',
        aylik:seg.some(s=>s.aylik),acikUc:seg.some(s=>s.acikUc)};
    });
    let liste=hepsi;
    if(a.cikti==='tam') liste=hepsi.filter(y=>y.tam);
    else if(a.cikti==='aralik') liste=hepsi.filter(y=>y.bos.some(s=>s.gun>=(a.minGun||1)));
    else if(a.durum==='yayin') liste=hepsi.filter(y=>y.seg.some(s=>s.tip==='yayin'));
    else if(a.durum==='opsiyon') liste=hepsi.filter(y=>y.seg.some(s=>s.tip==='opsiyon'));
    else if(a.durum==='musait') liste=hepsi.filter(y=>y.tam);
    liste.forEach(y=>gorunen.add(y.key)); filtre=liste.length;
    /* LED */
    const ledSatir=[];
    if(a.led) K.led.forEach(({m,al})=>{
      (M.byArea[al.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=a.bit&&(r.block_end==null||r.block_end>=a.bas))
        .forEach(r=>{ const key='l'+mdKayitKey(r); gorunen.add(key);
          ledSatir.push({key,m,al,r,tip:r.commitment==='confirmed'?'yayin':'opsiyon',
            s:r.block_start<a.bas?a.bas:r.block_start,e:r.block_end==null||r.block_end>a.bit?a.bit:r.block_end,
            solTasar:r.block_start<a.bas,sagTasar:r.block_end==null||r.block_end>a.bit,acikUc:r.block_end==null,
            kim:kisi(r),not:a.notlar?(r.note||''):''}); }); });
    out.budanan=rpBuda(T,gorunen);
    const dahilY=liste.filter(y=>rpDahil(T,y.key));
    const dahilL=ledSatir.filter(l=>rpDahil(T,l.key));
    /* Lokasyon → ürün gruplaması */
    const gm=new Map();
    liste.forEach(y=>{ const k1=y.m.id; if(!gm.has(k1)) gm.set(k1,{m:y.m,urunler:new Map()});
      const g=gm.get(k1); const k2=y.aile; if(!g.urunler.has(k2)) g.urunler.set(k2,[]); g.urunler.get(k2).push(y); });
    out.gruplar=[...gm.values()].map(g=>({ad:g.m.name,urunler:[...g.urunler.entries()].map(([ad,ys])=>({ad,yuzler:ys.map(y=>({
      key:y.key,dahil:rpDahil(T,y.key),kod:y.kod,pano:y.pano,yuz:y.yuz,olcu:a.olcu?y.olcu:'',konum:a.konum?y.konum:'',
      tam:y.tam,aylik:y.aylik,acikUc:y.acikUc,
      bos:y.bos.filter(s=>s.gun>=(a.cikti==='aralik'?(a.minGun||1):1)).map(s=>({s:s.s,e:s.e,gun:s.gun})),
      seg:y.seg.map(s=>({s:s.s,e:s.e,gun:s.gun,tip:s.tip,acikUc:s.acikUc,aylik:s.aylik,
        opsSure:a._alici==='ic'&&s.opsSure,kim:kisi(s.r),kisa:kisaKim(s.r),not:a.notlar&&s.r?(s.r.note||''):''}))}))}))}));
    out.led=a.led?[...new Map(K.led.map(x=>[x.al.id,x])).values()].map(({m,al})=>({ad:`${m.name} · ${al.name}`,
      sure:mdSure(al),kampanyalar:ledSatir.filter(l=>l.al.id===al.id).map(l=>({...l,dahil:rpDahil(T,l.key)}))})):[];
    out.toplamYuz=K.yuzler.length; out.pasif=K.pasif;
    { const lk=[...new Set([...dahilY.map(y=>y.m.name),...dahilL.map(l=>l.m.name)])];
      const i=out.bilgi.findIndex(x=>x[0]==='Lokasyon'); if(i>=0&&lk.length) out.bilgi[i]=['Lokasyon',lk.join(', ')]; }
    out.dahilYuzSay=dahilY.length; out.dahilLedSay=dahilL.length;
    out.panoSay=new Set(dahilY.map(y=>y.m.id+'|'+y.al.id+'|'+y.pano)).size;
    /* Doluluk özeti — payda: seçili kapsamdaki (kullanıcının çıkarmadığı)
       aktif statik yüzler × gün. Tek gün oranı ile yüzey-gün oranı ayrıdır. */
    if(a.ozet){
      const kap=hepsi.filter(y=>rpDahil(T,y.key)||!gorunen.has(y.key));
      const gunSay=rpDn(a.bit)-rpDn(a.bas)+1;
      const tek={yayin:0,opsiyon:0,musait:0}; const donem={yayin:0,opsiyon:0,musait:0}; const lok={};
      kap.forEach(y=>{ const ilk=y.seg[0]; tek[ilk.tip]++;
        const L=lok[y.m.name]=lok[y.m.name]||{ad:y.m.name,yuz:0,yayin:0,opsiyon:0,musait:0};
        L.yuz++; y.seg.forEach(s=>{ donem[s.tip]+=s.gun; L[s.tip]+=s.gun; }); });
      const n=kap.length, T2=n*gunSay;
      out.ozet={ref:a.bas,n,gunSay,toplam:T2,tek,donem,lok:Object.values(lok).map(L=>({...L,toplam:L.yuz*gunSay}))};
    }
    const birim=a.cikti==='cizelge'?'yüz':'müsait yüz';
    out.say={dahil:dahilY.length+dahilL.length,filtre:filtre+ledSatir.length,cik:(filtre+ledSatir.length)-(dahilY.length+dahilL.length),
      birim:ledSatir.length?`kayıt (${birim} + LED kampanyası)`:birim};
    if(!K.yuzler.length) out.uyari.push('Seçilen kapsamda statik yüz yok.');
    return out;
  },
  onizle(m,a){
    const T='mecra';
    if(m.hata) return '';
    let h=`<p class="rp2-ozet">${m.cikti==='tam'?`Kapsamdaki <b>${m.toplamYuz}</b> aktif statik yüzden <b>${m.gruplar.reduce((t,g)=>t+g.urunler.reduce((x,u)=>x+u.yuzler.length,0),0)}</b> tanesi ${esc(rpTr(m.bas))} – ${esc(rpTr(m.bit))} döneminin tamamında müsait.`
      :m.cikti==='aralik'?`Kapsamdaki <b>${m.toplamYuz}</b> aktif statik yüzden <b>${m.gruplar.reduce((t,g)=>t+g.urunler.reduce((x,u)=>x+u.yuzler.length,0),0)}</b> tanesinde dönem içinde müsait aralık var.`
      :`<b>${m.gruplar.reduce((t,g)=>t+g.urunler.reduce((x,u)=>x+u.yuzler.length,0),0)}</b> yüz listeleniyor.`}
      ${m.pasif?` <span class="muted">${m.pasif} pasif yüz hesaba katılmadı.</span>`:''}</p>`;
    if(!m.gruplar.length) h+=`<p class="empty">${m.cikti==='tam'?'Bu dönemin tamamında müsait yüz yok.':m.cikti==='aralik'?'Bu dönemde müsait aralık yok.':'Listelenecek yüz yok.'}</p>`;
    m.gruplar.forEach(g=>{ h+=`<h5 class="rp2-g1">${esc(g.ad)}</h5>`;
      g.urunler.forEach(u=>{ const keys=u.yuzler.map(y=>y.key);
        h+=`<div class="rp2-g2"><span>${esc(u.ad)} <em>${u.yuzler.length} yüz</em></span>
          <button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},true)'>tümü</button>
          <button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},false)'>hiçbiri</button></div>
          <div class="rp2-rows">${u.yuzler.map(y=>`<label class="rp2-row ${y.dahil?'':'dis'}">${rpCb(T,y.key,y.dahil,y.kod+' rapora dahil')}
            <b class="rp2-kod">${esc(y.kod)}</b><span class="rp2-olcu">${esc(y.olcu||'')}</span>
            <span class="rp2-det">${m.cikti==='tam'?'<span class="rp2-t musait">Dönem boyunca müsait</span>'
              :m.cikti==='aralik'?(y.tam?'<span class="rp2-t musait">Dönem boyunca müsait</span>':y.bos.map(s=>`<span class="rp2-t musait">${esc(rpTrKisa(s.s))}–${esc(rpTr(s.e))} · ${s.gun} gün</span>`).join(' '))
              :y.seg.map(s=>`<span class="rp2-t ${s.tip}">${esc(rpTrKisa(s.s))}–${esc(rpTrKisa(s.e))} ${s.tip==='musait'?'Müsait':s.tip==='yayin'?'Yayın':'Opsiyon'}${s.opsSure?' (süresi doldu)':''}${s.kim?' · '+esc(s.kim):''}${s.acikUc?' · bitiş bilinmiyor':''}</span>`).join(' ')}
              ${y.aylik?' <span class="rp2-t uyari">ay bazlı eski kayıt</span>':''}</span></label>`).join('')}</div>`; }); });
    if(m.led.length){ h+=`<h5 class="rp2-g1">LED yayın alanları</h5><p class="fhint">LED eşzamanlı yayındır: kampanya sayısı boş kapasite, ekran sayısı ya da doluluk oranı göstermez; statik müsaitlik toplamına katılmaz.</p>`;
      m.led.forEach(l=>{ h+=`<div class="rp2-g2"><span>${esc(l.ad)}${l.sure?` <em>${esc(l.sure)} kreatif</em>`:''}</span></div>
        <div class="rp2-rows">${l.kampanyalar.length?l.kampanyalar.map(k=>`<label class="rp2-row ${k.dahil?'':'dis'}">${rpCb(T,k.key,k.dahil,'LED kampanyası rapora dahil')}
          <span class="rp2-t ${k.tip}">${k.tip==='yayin'?'Yayın':'Opsiyon'}</span> <span>${esc(rpTr(k.r.block_start))} – ${k.acikUc?'bitiş bilinmiyor':esc(rpTr(k.r.block_end))}</span>
          <span class="rp2-det">${esc(k.kim||'')}${k.not?' · '+esc(k.not):''}</span></label>`).join(''):'<p class="empty">Bu dönemde kampanya yok.</p>'}</div>`; }); }
    if(m.ozet) h+=rpMecraOzetHtml(m.ozet);
    return h;
  },
  pdf(m,a){
    const ic=[];
    const liste=m.gruplar.map(g=>({...g,urunler:g.urunler.map(u=>({...u,yuzler:u.yuzler.filter(y=>y.dahil)})).filter(u=>u.yuzler.length)})).filter(g=>g.urunler.length);
    const yuzN=liste.reduce((t,g)=>t+g.urunler.reduce((x,u)=>x+u.yuzler.length,0),0);
    ic.push({text:m.cikti==='tam'?`${yuzN} yüz, ${rpTr(m.bas)} – ${rpTr(m.bit)} döneminin tamamında müsait.`
      :m.cikti==='aralik'?`${yuzN} yüzde dönem içinde müsait tarih aralığı var. Aralıklar başlangıç ve bitiş günlerini kapsar.`
      :`${yuzN} yüzün ${rpTr(m.bas)} – ${rpTr(m.bit)} dönemindeki yayın, opsiyon ve müsait dilimleri.`,margin:[0,0,0,6]});
    if(!liste.length) ic.push({text:m.cikti==='cizelge'?'Listelenecek yüz yok.':'Bu kapsam ve dönemde müsait yüz bulunmuyor.',style:'bos'});
    const cizelge=m.cikti==='cizelge';
    liste.forEach(g=>{
      g.urunler.forEach((u,ui)=>{ const ust=[ui===0?{text:g.ad,stil:'h2'}:null,{text:`${u.ad}  ·  ${u.yuzler.length} yüz`}];
        if(cizelge){ ic.push(...rpCizelgePdf(m,u.yuzler,ust)); return; }
        const kol=[{b:'Pozisyon',g:60},{b:'Yüz',g:28},...(a.olcu?[{b:'Ölçü',g:90}]:[]),
          {b:m.cikti==='tam'?'Durum':'Müsait tarih aralıkları',g:'*'},...(m.cikti==='aralik'?[{b:'Müsait gün',g:52,sag:true}]:[]),...(a.konum?[{b:'Konum',g:110}]:[])];
        ic.push(rpTablo(kol,u.yuzler.map(y=>[{text:y.pano,bold:true},y.yuz||'—',...(a.olcu?[y.olcu||'—']:[]),
          m.cikti==='tam'?{text:'Dönem boyunca müsait',color:RPC.yesil}
            :{stack:[...(y.tam?[{text:'Dönem boyunca müsait',color:RPC.yesil}]:y.bos.map(s=>({text:`${rpTr(s.s)} – ${rpTr(s.e)}  (${s.gun} gün)`}))),
              ...(y.aylik?[{text:'Sınır, ay bazlı eski bir kayda dayanır; kesin gün bilgisi yok.',style:'not'}]:[])]},
          ...(m.cikti==='aralik'?[String(y.bos.reduce((t,s)=>t+s.gun,0))]:[]),...(a.konum?[y.konum||'']:[])]),{ust}));
      }); });
    if(m.led.some(l=>!l.kampanyalar.length||l.kampanyalar.some(x=>x.dahil))){
      /* Bölüm başlığı ve açıklaması İLK LED tablosunun başlık satırlarıdır:
         sayfa sonunda tek başına kalamaz. */
      let ilk=true;
      const ledBas=()=>{ if(!ilk) return []; ilk=false; return [{text:'LED yayın alanları',stil:'h2'},
        {text:'LED eşzamanlı yayındır. Kampanya sayısı boş kapasite, ekran sayısı ya da doluluk oranı göstermez; bu bölüm statik müsaitlik toplamına katılmaz.',stil:'not'}]; };
      m.led.forEach(l=>{ const k=l.kampanyalar.filter(x=>x.dahil);
        if(!k.length&&l.kampanyalar.length) return;   /* kampanya var ama seçilmedi: alan yazılmaz */
        const ledUst=[...ledBas(),{text:l.ad+(l.sure?`  ·  ${l.sure} kreatif`:'')}];
        ic.push(k.length?rpTablo([{b:'Durum',g:60},{b:'Başlangıç',g:70},{b:'Bitiş',g:80},...(a.musteri||a.isAdi?[{b:'Kampanya',g:'*'}]:[{b:'',g:'*'}]),...(a.notlar?[{b:'Not',g:150}]:[])],
          k.map(x=>[{text:x.tip==='yayin'?'Yayın':'Opsiyon',color:RP_TUR_RENK[x.tip][0]},rpTr(x.r.block_start),x.acikUc?'bilinmiyor':rpTr(x.r.block_end),x.kim||'',...(a.notlar?[x.not||'']:[])]),{ust:ledUst})
          :{stack:[...ledUst.map(u=>({text:u.text,style:u.stil||'h3'})),{text:'Bu dönemde kampanya yok.',style:'bos'}],unbreakable:true}); }); }
    if(m.ozet) ic.push(...rpMecraOzetPdf(m.ozet));
    return {icerik:ic,o:{yon:cizelge?'landscape':'portrait'}};
  },
  xlsx(m,a){
    const S=[];
    const satir=[];
    m.gruplar.forEach(g=>g.urunler.forEach(u=>u.yuzler.filter(y=>y.dahil).forEach(y=>{
      const tem=[g.ad,u.ad,y.pano,y.yuz||'',y.kod,...(a.olcu?[y.olcu||'']:[]),...(a.konum?[y.konum||'']:[])];
      if(m.cikti==='tam') satir.push([...tem,m.bas,m.bit,rpDn(m.bit)-rpDn(m.bas)+1]);
      else if(m.cikti==='aralik') (y.tam?[{s:m.bas,e:m.bit,gun:rpDn(m.bit)-rpDn(m.bas)+1}]:y.bos).forEach(s=>satir.push([...tem,s.s,s.e,s.gun,y.aylik?'Ay bazlı eski kayda dayanır':'']));
      else y.seg.forEach(s=>satir.push([...tem,s.tip==='musait'?'Müsait':s.tip==='yayin'?'Yayın':'Opsiyon',s.s,s.e,s.gun,
        ...(a.musteri||a.isAdi?[s.kim||'']:[]),...(a.notlar?[s.not||'']:[]),[s.acikUc?'Bitiş bilinmiyor':'',s.aylik?'Ay bazlı eski kayıt':'',s.opsSure?'Opsiyon süresi doldu (hâlâ bloklar)':''].filter(Boolean).join(' · ')]));
    })));
    const tem=[{b:'Lokasyon',w:22},{b:'Ürün',w:20},{b:'Pozisyon',w:11},{b:'Yüz',w:6},{b:'Yüz kodu',w:10},...(a.olcu?[{b:'Ölçü',w:16}]:[]),...(a.konum?[{b:'Konum',w:28,sar:true}]:[])];
    const kol=m.cikti==='tam'?[...tem,{b:'Müsait başlangıç',w:13,tip:'tarih'},{b:'Müsait bitiş',w:13,tip:'tarih'},{b:'Gün',w:7,tip:'tam'}]
      :m.cikti==='aralik'?[...tem,{b:'Müsait başlangıç',w:13,tip:'tarih'},{b:'Müsait bitiş',w:13,tip:'tarih'},{b:'Gün',w:7,tip:'tam'},{b:'Not',w:30,sar:true}]
      :[...tem,{b:'Durum',w:10},{b:'Başlangıç',w:12,tip:'tarih'},{b:'Bitiş',w:12,tip:'tarih'},{b:'Gün',w:7,tip:'tam'},
        ...(a.musteri||a.isAdi?[{b:'Kampanya',w:30,sar:true}]:[]),...(a.notlar?[{b:'Not',w:30,sar:true}]:[]),{b:'Kesinlik',w:26,sar:true}];
    S.push({ad:m.cikti==='cizelge'?'Çizelge':'Müsaitlik',yon:'landscape',kol,satir,
      not:m.cikti==='aralik'?'Her satır bir müsait tarih aralığıdır; başlangıç ve bitiş günleri dahildir.':null});
    if(m.cikti==='cizelge') S.push(rpCizelgeXlsGrid(m,a));
    if(m.led.some(l=>l.kampanyalar.some(k=>k.dahil))){ const ls=[];
      m.led.forEach(l=>l.kampanyalar.filter(k=>k.dahil).forEach(k=>ls.push([l.ad,k.tip==='yayin'?'Yayın':'Opsiyon',k.r.block_start,k.acikUc?null:k.r.block_end,
        ...(a.musteri||a.isAdi?[k.kim||'']:[]),...(a.notlar?[k.not||'']:[]),l.sure||''])));
      S.push({ad:'LED',yon:'landscape',kol:[{b:'Yayın alanı',w:32},{b:'Durum',w:10},{b:'Başlangıç',w:12,tip:'tarih'},{b:'Bitiş',w:12,tip:'tarih'},
        ...(a.musteri||a.isAdi?[{b:'Kampanya',w:30,sar:true}]:[]),...(a.notlar?[{b:'Not',w:30,sar:true}]:[]),{b:'Kreatif süre',w:10}],satir:ls,
        not:'LED eşzamanlı yayındır; kampanya sayısı boş kapasite ya da doluluk oranı göstermez.'}); }
    if(m.ozet){ const o=m.ozet, y=v=>o.toplam?v/o.toplam:0;
      S.push({ad:'Doluluk özeti',yon:'portrait',kol:[{b:'Lokasyon',w:24},{b:'Yüz',w:7,tip:'tam'},{b:'Yüz-gün (payda)',w:14,tip:'tam'},
        {b:'Yayın yüz-gün',w:13,tip:'tam'},{b:'Opsiyon yüz-gün',w:14,tip:'tam'},{b:'Müsait yüz-gün',w:14,tip:'tam'},{b:'Yayın %',w:9,tip:'yuzde'},{b:'Opsiyon %',w:10,tip:'yuzde'}],
        satir:o.lok.map(L=>[L.ad,L.yuz,L.toplam,L.yayin,L.opsiyon,L.musait,L.toplam?L.yayin/L.toplam:0,L.toplam?L.opsiyon/L.toplam:0]),
        alt:[[{v:'Toplam',kalin:true},{v:o.n,tip:'tam',kalin:true},{v:o.toplam,tip:'tam',kalin:true},{v:o.donem.yayin,tip:'tam',kalin:true},{v:o.donem.opsiyon,tip:'tam',kalin:true},{v:o.donem.musait,tip:'tam',kalin:true},{v:o.toplam?o.donem.yayin/o.toplam:0,tip:'yuzde',kalin:true},{v:o.toplam?o.donem.opsiyon/o.toplam:0,tip:'yuzde',kalin:true}],
          [],[`Tek gün (${rpTr(o.ref)}): yayında ${o.tek.yayin} yüz (${rpYzd(o.tek.yayin,o.n)}), opsiyonda ${o.tek.opsiyon} yüz (${rpYzd(o.tek.opsiyon,o.n)}), müsait ${o.tek.musait} yüz (${rpYzd(o.tek.musait,o.n)}) — payda ${o.n} yüz.`],
          [`Dönem oranı = ilgili yüzey-gün ÷ (${o.n} yüz × ${o.gunSay} gün = ${o.toplam} yüzey-gün). Payda bugünkü aktif envanterdir; envanterin geçmiş değişimi kayıtlı değildir.`]],
        not:'Aynı yüzey-gün iki kez sayılmaz. Yayın ve opsiyon ayrı oranlardır.'}); }
    S.push(rpBilgiSayfa(m,[['Hesap kuralları','İptal edilen kayıt bloklamaz. Opsiyon ve yayın bloklar; süresi dolmuş ama iptal edilmemiş opsiyon da bloklar. Bitişi bilinmeyen kayıt dönem sonuna kadar bloklar. A ve B yüzleri ayrı değerlendirilir.'],
      ['Kapsam',`${m.dahilYuzSay} statik yüz (${m.panoSay} pano)${m.pasif?`; ${m.pasif} pasif yüz hesaba katılmadı`:''}.`]]));
    return S;
  },
  pdfVar:true
};
const rpYuzde=(v,t)=>t?Math.round(v*1000/t)/10:0;
const rpYzd=(v,t)=>'%'+rpYuzde(v,t).toLocaleString('tr-TR',{maximumFractionDigits:1});
function rpMecraOzetHtml(o){
  return `<h5 class="rp2-g1">Doluluk özeti</h5>
    <p class="rp2-ozet"><b>Tek gün (${esc(rpTr(o.ref))}):</b> ${o.n} yüzden yayında ${o.tek.yayin} (${rpYzd(o.tek.yayin,o.n)}), opsiyonda ${o.tek.opsiyon} (${rpYzd(o.tek.opsiyon,o.n)}), müsait ${o.tek.musait} (${rpYzd(o.tek.musait,o.n)}).</p>
    <p class="rp2-ozet"><b>Dönem:</b> ${o.n} yüz × ${o.gunSay} gün = ${o.toplam} yüzey-gün. Yayın ${o.donem.yayin} yüzey-gün (${rpYzd(o.donem.yayin,o.toplam)}), opsiyon ${o.donem.opsiyon} (${rpYzd(o.donem.opsiyon,o.toplam)}), müsait ${o.donem.musait} (${rpYzd(o.donem.musait,o.toplam)}).</p>
    <p class="fhint">Payda, seçili kapsamdaki bugünkü aktif statik envanterdir; envanterin geçmiş dönemdeki değişimi kayıtlı değildir. LED ve pasif yüzler dahil değildir.</p>`;
}
function rpMecraOzetPdf(o){
  return [
    rpTablo([{b:'Lokasyon',g:'*'},{b:'Yüz',g:34,sag:true},{b:'Yüzey-gün',g:60,sag:true},{b:'Yayın',g:60,sag:true},{b:'Yayın %',g:48,sag:true},{b:'Opsiyon',g:60,sag:true},{b:'Opsiyon %',g:52,sag:true},{b:'Müsait',g:60,sag:true}],
      [...o.lok.map(L=>[L.ad,String(L.yuz),String(L.toplam),String(L.yayin),rpYzd(L.yayin,L.toplam),String(L.opsiyon),rpYzd(L.opsiyon,L.toplam),String(L.musait)]),
       [{text:'Toplam',bold:true},{text:String(o.n),bold:true},{text:String(o.toplam),bold:true},{text:String(o.donem.yayin),bold:true},{text:rpYzd(o.donem.yayin,o.toplam),bold:true},{text:String(o.donem.opsiyon),bold:true},{text:rpYzd(o.donem.opsiyon,o.toplam),bold:true},{text:String(o.donem.musait),bold:true}]],
      {ust:[{text:'Doluluk özeti',stil:'h2'},
        {text:[{text:`Tek gün (${rpTr(o.ref)}): `,bold:true},`${o.n} yüzden yayında ${o.tek.yayin} (${rpYzd(o.tek.yayin,o.n)}), opsiyonda ${o.tek.opsiyon} (${rpYzd(o.tek.opsiyon,o.n)}), müsait ${o.tek.musait} (${rpYzd(o.tek.musait,o.n)}).`],stil:'ozetSatir'},
        {text:[{text:'Dönem: ',bold:true},`${o.n} yüz × ${o.gunSay} gün = ${o.toplam} yüzey-gün.`],stil:'ozetSatir'}]}),
    {text:'Aynı yüzey-gün iki kez sayılmaz; yayın ve opsiyon ayrı oranlardır. Payda seçili kapsamdaki bugünkü aktif statik envanterdir — envanterin geçmiş değişimi kayıtlı olmadığı için geçmiş dönemlerde kesinlik iddia edilmez. LED ve pasif yüzler dahil değildir.',style:'not'}];
}
/* Çizelge: ay sütunlu tablo (kaynak rezervasyon tablolarının okuma
   alışkanlığı). 12 aydan uzun dönem birden çok tabloya bölünür. */
function rpAyListe(b,e){ const out=[]; let y=+b.slice(0,4), mo=+b.slice(5,7);
  while(`${y}-${rp2(mo)}`<=e.slice(0,7)){ out.push(`${y}-${rp2(mo)}`); mo++; if(mo>12){mo=1;y++;} } return out; }
function rpCizelgeHucre(y,ym,b,e){
  const ayB=ym+'-01', ayE=_cIso(new Date(+ym.slice(0,4),+ym.slice(5,7),0));
  const s0=ayB<b?b:ayB, e0=ayE>e?e:ayE;
  return y.seg.filter(s=>s.s<=e0&&s.e>=s0).map(s=>({...s,s:s.s<s0?s0:s.s,e:s.e>e0?e0:s.e,tamAy:s.s<=ayB&&s.e>=ayE}));
}
function rpCizelgePdf(m,yuzler,ust){
  const aylar=rpAyListe(m.bas,m.bit); const parca=[];
  for(let i=0;i<aylar.length;i+=6) parca.push(aylar.slice(i,i+6));
  return parca.map((ay,pi)=>rpTablo([{b:'Yüz',g:52},...ay.map(ym=>({b:`${RP_AYLAR[+ym.slice(5,7)-1]} ${ym.slice(0,4)}`,g:'*'}))],
    yuzler.map(y=>[{text:y.kod,bold:true},...ay.map(ym=>{ const h=rpCizelgeHucre(y,ym,m.bas,m.bit);
      if(h.length===1&&h[0].tamAy){ const s=h[0]; const [c,f]=RP_TUR_RENK[s.tip];
        return {stack:[{text:s.tip==='musait'?'Müsait':s.tip==='yayin'?'Yayın':'Opsiyon',color:c,bold:true},...(s.kisa?[{text:s.kisa,fontSize:7.5}]:[]),...(s.acikUc?[{text:'bitiş bilinmiyor',fontSize:7,color:RPC.ink3}]:[])],fillColor:f}; }
      return {stack:h.map(s=>({text:[{text:`${+s.s.slice(8)}–${+s.e.slice(8)} `,color:RPC.ink2},{text:s.tip==='musait'?'Müsait':s.tip==='yayin'?'Yayın':'Opsiyon',color:RP_TUR_RENK[s.tip][0],bold:true},
        ...(s.kisa?[{text:' · '+s.kisa,fontSize:7.5}]:[])],fontSize:8}))}; })]),{fs:8.5,ust:pi===0?ust:[(ust||[]).filter(Boolean).slice(-1)[0]&&{text:(ust||[]).filter(Boolean).slice(-1)[0].text+'  ·  devam'}]}));
}
function rpCizelgeXlsGrid(m,a){
  const aylar=rpAyListe(m.bas,m.bit);
  const satir=[]; m.gruplar.forEach(g=>g.urunler.forEach(u=>u.yuzler.filter(y=>y.dahil).forEach(y=>{
    satir.push([g.ad,u.ad,y.kod,...aylar.map(ym=>rpCizelgeHucre(y,ym,m.bas,m.bit).map(s=>
      (s.tamAy?'':`${+s.s.slice(8)}–${+s.e.slice(8)} `)+(s.tip==='musait'?'Müsait':s.tip==='yayin'?'Yayın':'Opsiyon')+(s.kisa?' · '+s.kisa:'')).join('\n'))]); })));
  return {ad:'Aylık görünüm',yon:'landscape',sabitKol:3,kol:[{b:'Lokasyon',w:18},{b:'Ürün',w:16},{b:'Yüz',w:9},
    ...aylar.map(ym=>({b:`${RP_AY3[+ym.slice(5,7)-1]} ${ym.slice(0,4)}`,w:16,sar:true}))],satir,
    not:'Hücrede gün aralığı yazmıyorsa durum ayın tamamı içindir.'};
}
function rpSiteSec(id,on){ const a=rpAyar('mecra'); const s=new Set(a.siteler); if(on) s.add(id); else s.delete(id);
  a.siteler=[...s]; if(!a.siteler.length){ rpNot('En az bir lokasyon seçin.','uyari'); a.siteler=[id]; rpKontrolCiz('mecra'); return; }
  rpYenile('mecra'); }
let _rpAraT=null;
function rpAraGecikmeli(tur,k,v){ clearTimeout(_rpAraT); _rpAraT=setTimeout(()=>{ rpAyar(tur)[k]=v; rpOnizleCiz(tur); },220); }

/* ==========================================================
   2) BASKI / MONTAJ DÖKÜMÜ
   Kurum → iş → işlem. Mecraya bağlı OLMAYAN işlemler de raporlanır
   (fuar, tabela, söküm, vinç…). Tutar kuralları:
     · her tutar kendi para biriminde; birimler asla toplanmaz
     · paket bedeli BİR KEZ sayılır; paketin tüm işlemleri rapordaysa
       toplama girer, bir kısmı rapordaysa kapsamıyla yazılır ama
       seçilen satırların toplamı gibi SUNULMAZ ve dağıtılmaz
     · paket içindeki işlemin satır tutarı bilgi olarak görünür, toplama
       ayrıca girmez (paket bedeli anlaşılan tutardır)
     · kayıtta olmayan KDV, indirim, kâr varsayılmaz
   ========================================================== */
const RP_OPTUR={baski:'Baskı',montaj:'Montaj',sokum:'Söküm',diger:'Diğer hizmet'};
const RP_OPDURUM={planned:'Planlandı',waiting:'Bekliyor',in_progress:'Devam ediyor',done:'Tamamlandı',cancelled:'İptal'};
const RP_TARIHALAN=[['planned','İşlem tarihi (planlanan)'],['completed','Tamamlanma tarihi'],['created','Kayıt tarihi']];
RPD_BASKI={
  amac:'Bir kurumun ya da işin baskı, montaj ve ilgili uygulamalarının teknik ve gerektiğinde ticari dökümü.',
  presetNot:'Dış paylaşımda teknik bilgiler açık; maliyet, satış bedeli ve serbest iç notlar kapalıdır.',
  varsayilan(){ return {kurum:'',isler:[],turler:['baski','montaj','sokum','diger'],uygulayan:'',durum:'',tarihAlan:'planned',bas:'',bit:'',
    teknik:true,sirala:'tarih',c_malzeme:true,c_olcu:true,c_gorunen:true,c_yuzey:true,c_miktar:true,c_kim:true,c_yer:true}; },
  preset(v){ return v==='dis'?{tMaliyet:false,tSatis:false,notlar:false}:{tMaliyet:true,tSatis:true,notlar:true}; },
  veriAnahtar:()=>'baski',
  async veri(){
    const [ops,grp,jobs,custs,M]=await Promise.all([
      rapHepsi(()=>sb.from('work_operations').select('id,job_id,operation_type,status,description,quantity,quantity_unit,dimensions,visible_size,surface_count,material,grammage_gsm,reprint,supplier_org_id,unit_id,location_text,planned_date,completed_at,created_at,unit_cost,cost,sale_amount,currency,price_group_id,note').order('id')),
      rapHepsi(()=>sb.from('operation_price_groups').select('*').order('id')),
      rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,status,lifecycle_status').order('id')),
      api('customers_min'), mdYukle()]);
    const cm={}; (custs||[]).forEach(c=>cm[c.id]=c.firma||'');
    return {ops,grp,jobs,cm,M};
  },
  kontrolVeriyle:true,
  baslik(a,v){ const cm=v?v.cm:{}; return 'Baskı ve montaj dökümü'+(a.kurum&&cm[a.kurum]?' — '+cm[a.kurum]:''); },
  dosya:()=>'Baski_Montaj_Dokumu',
  kontroller(a){
    const v=(rpDurum().veri||{}).baski, T='baski';
    const jobs=v?v.jobs:[], cm=v?v.cm:{};
    const opJob=new Set((v?v.ops:[]).map(o=>o.job_id));
    const kurumlar=[...new Set(jobs.filter(j=>opJob.has(j.id)&&j.customer_id).map(j=>j.customer_id))]
      .map(id=>[id,cm[id]||'#'+id]).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr'));
    const isler=jobs.filter(j=>opJob.has(j.id)&&(!a.kurum||String(j.customer_id)===String(a.kurum)));
    const uyg=[...new Set((v?v.ops:[]).map(o=>o.supplier_org_id).filter(Boolean))].map(id=>[id,cm[id]||'#'+id]).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr'));
    return `<div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpKurum">Kurum</label><select class="inp ${a.kurum?'inp-on':''}" id="rpKurum" onchange="rpBaskiKurum(this.value)">
          <option value="">Tüm kurumlar</option>${kurumlar.map(([id,ad])=>`<option value="${id}" ${String(a.kurum)===String(id)?'selected':''}>${esc(orgKisa(ad,60))}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="rpUyg">Tedarikçi / uygulayan</label><select class="inp ${a.uygulayan?'inp-on':''}" id="rpUyg" onchange="rpSet('baski','uygulayan',this.value,true)">
          <option value="">Tümü</option>${uyg.map(([id,ad])=>`<option value="${id}" ${String(a.uygulayan)===String(id)?'selected':''}>${esc(orgKisa(ad,60))}</option>`).join('')}</select></div></div>
      <div class="field"><span class="flabel">İşler ${a.isler.length?`<em class="muted">${a.isler.length} seçili</em>`:'<em class="muted">seçilmezse tümü</em>'}</span>
        <div class="rp2-chips rp2-isler">${isler.length?isler.map(j=>`<label class="rp2-chk"><input type="checkbox" ${a.isler.includes(j.id)?'checked':''} onchange="rpBaskiIs(${j.id},this.checked)"> <span>${esc(j.title||'#'+j.id)}${a.kurum?'':` <em>${esc(orgKisa(cm[j.customer_id]||'',30))}</em>`}</span></label>`).join(''):'<span class="muted">Baskı/montaj kaydı olan iş yok.</span>'}</div></div>
      <div class="field"><span class="flabel">İşlem türü</span><div class="rp2-chips">${Object.entries(RP_OPTUR).map(([k,l])=>`<label class="rp2-chk">
        <input type="checkbox" ${a.turler.includes(k)?'checked':''} onchange="rpBaskiTur('${k}',this.checked)"> <span>${esc(l)}</span></label>`).join('')}</div></div>
      <div class="rp2-grid">
        <div class="field"><span class="flabel">Durum</span>${rpSeg(T,'durum',a.durum,[['','Aktif + tamamlanan'],['aktif','Yalnız aktif'],['tamam','Yalnız tamamlanan'],['hepsi','İptal dahil']],'Durum')}</div>
        <div class="field"><label class="flabel" for="rpTAlan">Tarih süzgeci neye uygulanır</label><select class="inp" id="rpTAlan" onchange="rpSet('baski','tarihAlan',this.value,true)">
          ${RP_TARIHALAN.map(([k,l])=>`<option value="${k}" ${a.tarihAlan===k?'selected':''}>${esc(l)}</option>`).join('')}</select>
          <p class="fhint">Baskı satırında baskı, montaj satırında montaj tarihidir. Tarihi girilmemiş kayıt, tarih süzgeci varken dahil edilmez.</p></div></div>
      ${rpTarihKontrol(T,a,'bas','bit',['Başlangıç (isteğe bağlı)','Bitiş (isteğe bağlı)'])}
      <details class="rp2-adv" ${rpDurum().adv?'open':''} ontoggle="rpDurum().adv=this.open"><summary>Ayrıntılı ayarlar — bölümler ve sütunlar</summary>
        <div class="rp2-cols">
          <div><b>Teknik bilgi</b>${rpChk(T,'teknik',a.teknik,'Teknik bölüm')}
            ${a.teknik?`${rpChk(T,'c_malzeme',a.c_malzeme,'Malzeme / cins ve gramaj')}${rpChk(T,'c_olcu',a.c_olcu,'Baskı ölçüsü')}
            ${rpChk(T,'c_gorunen',a.c_gorunen,'Görünen alan')}${rpChk(T,'c_yuzey',a.c_yuzey,'Yüzey sayısı')}${rpChk(T,'c_miktar',a.c_miktar,'Miktar ve birim')}`:''}</div>
          <div><b>İşlem bilgisi</b>${rpChk(T,'c_yer',a.c_yer,'Uygulama yeri / mecra')}${rpChk(T,'c_kim',a.c_kim,'Baskı merkezi / uygulayan')}
            ${rpChk(T,'notlar',a.notlar,'Serbest notlar','ticari/özel bilgi içerebilir')}</div>
          <div><b>Ticari bilgi</b>${rpChk(T,'tMaliyet',a.tMaliyet,'Maliyet','birim maliyet, maliyet, paket maliyeti')}${rpChk(T,'tSatis',a.tSatis,'Satış bedeli')}
            <p class="fhint">KDV, indirim ve kâr kayıtta yoksa hesaplanmaz.</p></div>
          <div><b>Sıralama</b>${rpSeg(T,'sirala',a.sirala,[['tarih','Tarih'],['tur','İşlem türü']],'Sıralama')}</div>
        </div></details>`;
  },
  model(a,v){
    const T='baski', cm=v.cm, M=v.M;
    const jm={}; v.jobs.forEach(j=>jm[j.id]=j);
    const gm={}; v.grp.forEach(g=>gm[g.id]=g);
    const hata=(a.bas||a.bit)?rpDonemDogrula(a.bas||'2000-01-01',a.bit||'2099-12-31'):null;
    const out={gruplar:[],uyari:[],hata,bilgi:[]};
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'işlem'}; return out; }
    const tarihOf=o=>a.tarihAlan==='completed'?rpYerelGun(o.completed_at):a.tarihAlan==='created'?rpYerelGun(o.created_at):(o.planned_date||'');
    const filtreli=v.ops.filter(o=>{ const j=jm[o.job_id]; if(!j) return false;
      if(a.kurum&&String(j.customer_id)!==String(a.kurum)) return false;
      if(a.isler.length&&!a.isler.includes(o.job_id)) return false;
      if(!a.turler.includes(o.operation_type)) return false;
      if(a.uygulayan&&String(o.supplier_org_id)!==String(a.uygulayan)) return false;
      if(a.durum===''&&o.status==='cancelled') return false;
      if(a.durum==='aktif'&&['done','cancelled'].includes(o.status)) return false;
      if(a.durum==='tamam'&&o.status!=='done') return false;
      if(a.bas||a.bit){ const t=tarihOf(o); if(!t) return false; if(a.bas&&t<a.bas) return false; if(a.bit&&t>a.bit) return false; }
      return true; });
    const gorunen=new Set(filtreli.map(o=>'o'+o.id));
    out.budanan=rpBuda(T,gorunen);
    const yerOf=o=>{ const u=o.unit_id?M.unitById[o.unit_id]:null; const p=[];
      if(u){ const al=M.altById[u.alt_mecra_id]; const me=M.mecById[(al||{}).mecra_id||u.mecra_id];
        p.push([me&&me.name,mdYuzAdi(M,u)].filter(Boolean).join(' · ')); }
      if(o.location_text) p.push(o.location_text); return p.join(' — '); };
    const satir=o=>{ const j=jm[o.job_id]; const tur=o.operation_type;
      return {key:'o'+o.id,dahil:rpDahil(T,'o'+o.id),id:o.id,kurum:cm[j.customer_id]||'',kurumId:j.customer_id,is:j.title||'',isId:j.id,
        tarih:tarihOf(o),tarihPlan:o.planned_date||'',tur:RP_OPTUR[tur]||tur,turKod:tur,yeniden:!!o.reprint,durum:RP_OPDURUM[o.status]||o.status,
        aciklama:o.description||'',yer:a.c_yer?yerOf(o):'',
        malzeme:a.teknik&&a.c_malzeme?(o.material||''):'',gramaj:a.teknik&&a.c_malzeme?o.grammage_gsm:null,
        olcu:a.teknik&&a.c_olcu?(o.dimensions||''):'',gorunen:a.teknik&&a.c_gorunen?(o.visible_size||''):'',
        yuzey:a.teknik&&a.c_yuzey?o.surface_count:null,miktar:a.teknik&&a.c_miktar?o.quantity:null,birim:a.teknik&&a.c_miktar?(RP_BIRIM[o.quantity_unit]||o.quantity_unit||''):'',
        baskiMerkezi:a.c_kim&&tur==='baski'?orgKisa(cm[o.supplier_org_id]||'',50):'',uygulayan:a.c_kim&&tur!=='baski'?orgKisa(cm[o.supplier_org_id]||'',50):'',
        birimMaliyet:a.tMaliyet?o.unit_cost:null,maliyet:a.tMaliyet?o.cost:null,satis:a.tSatis?o.sale_amount:null,pb:o.currency||'TRY',
        paket:(a.tMaliyet||a.tSatis)&&o.price_group_id?o.price_group_id:null,not:a.notlar?(o.note||''):''}; };
    const tumSatir=filtreli.map(satir);
    const sira=(x,y)=>a.sirala==='tur'?(x.turKod.localeCompare(y.turKod)||String(x.tarih).localeCompare(String(y.tarih))||x.id-y.id)
      :(String(x.tarih||'9999').localeCompare(String(y.tarih||'9999'))||x.id-y.id);
    /* Kurum → iş */
    const km=new Map();
    tumSatir.forEach(r=>{ if(!km.has(r.kurumId)) km.set(r.kurumId,{ad:r.kurum||'Kurum bağlı değil',isler:new Map()});
      const k=km.get(r.kurumId); if(!k.isler.has(r.isId)) k.isler.set(r.isId,{ad:r.is,id:r.isId,satirlar:[]}); k.isler.get(r.isId).satirlar.push(r); });
    const ticari=a.tMaliyet||a.tSatis;
    /* Paketler: her paketin kapsamı (tüm işlemleri) ve rapordaki kısmı. */
    const paketTum={}; v.ops.forEach(o=>{ if(o.price_group_id&&(a.durum==='hepsi'||o.status!=='cancelled')) (paketTum[o.price_group_id]=paketTum[o.price_group_id]||[]).push(o.id); });
    const toplamlar={};
    const topEkle=(pb,alan,deger)=>{ if(deger==null) return; const t=toplamlar[pb]=toplamlar[pb]||{maliyet:0,satis:0,var:{maliyet:false,satis:false}}; t[alan]+=Number(deger); t.var[alan]=true; };
    out.gruplar=[...km.values()].sort((x,y)=>String(x.ad).localeCompare(String(y.ad),'tr')).map(k=>({ad:k.ad,isler:[...k.isler.values()].map(is=>{
      is.satirlar.sort(sira);
      const dahil=is.satirlar.filter(r=>r.dahil);
      const paketler=[];
      if(ticari){ const ids=[...new Set(dahil.map(r=>r.paket).filter(Boolean))];
        ids.forEach(pid=>{ const g=gm[pid]; if(!g) return; const kap=paketTum[pid]||[]; const rap=dahil.filter(r=>r.paket===pid).length;
          const tam=rap===kap.length;
          paketler.push({id:pid,ad:g.label,maliyet:a.tMaliyet?g.cost_amount:null,satis:a.tSatis?g.sale_amount:null,pb:g.currency||'TRY',
            kapsam:kap.length,raporda:rap,tam,not:a.notlar?(g.note||''):''});
          if(tam){ topEkle(g.currency||'TRY','maliyet',a.tMaliyet?g.cost_amount:null); topEkle(g.currency||'TRY','satis',a.tSatis?g.sale_amount:null); } });
        dahil.filter(r=>!r.paket).forEach(r=>{ topEkle(r.pb,'maliyet',r.maliyet); topEkle(r.pb,'satis',r.satis); }); }
      return {...is,paketler}; })}));
    out.toplamlar=toplamlar; out.ticari=ticari;
    out.kismiPaket=out.gruplar.some(g=>g.isler.some(i=>i.paketler.some(p=>!p.tam)));
    if(a.kurum) out.bilgi.push(['Kurum',cm[a.kurum]||'']);
    if(a.isler.length) out.bilgi.push(['İş',a.isler.map(id=>(jm[id]||{}).title).filter(Boolean).join(', ')]);
    if(a.bas||a.bit) out.bilgi.push([(RP_TARIHALAN.find(x=>x[0]===a.tarihAlan)||[])[1]||'Tarih',`${a.bas?rpTr(a.bas):'…'} – ${a.bit?rpTr(a.bit):'…'}`]);
    if(a.turler.length<4) out.bilgi.push(['İşlem türü',a.turler.map(t=>RP_OPTUR[t]).join(', ')]);
    const dahilN=tumSatir.filter(r=>r.dahil).length;
    out.say={dahil:dahilN,filtre:tumSatir.length,cik:tumSatir.length-dahilN,birim:'işlem'};
    if(!tumSatir.length) out.uyari.push('Bu kapsamda baskı/montaj kaydı yok.');
    return out;
  },
  onizle(m,a){
    const T='baski'; let h='';
    m.gruplar.forEach(k=>{ h+=`<h5 class="rp2-g1">${esc(k.ad)}</h5>`;
      k.isler.forEach(is=>{ const keys=is.satirlar.map(r=>r.key);
        h+=`<div class="rp2-g2"><span>${esc(is.ad)} <em>${is.satirlar.length} işlem</em></span>
          <button type="button" class="btn-link" onclick='rpSecTopluKey("baski",${JSON.stringify(keys)},true)'>tümü</button>
          <button type="button" class="btn-link" onclick='rpSecTopluKey("baski",${JSON.stringify(keys)},false)'>hiçbiri</button>
          <button type="button" class="btn-link" onclick="workAc(${is.id})">İşi aç →</button></div>
        <div class="rp2-rows">${is.satirlar.map(r=>`<label class="rp2-row ${r.dahil?'':'dis'}">${rpCb(T,r.key,r.dahil,r.tur+' rapora dahil')}
          <span class="rp2-tarih-c">${esc(rpTr(r.tarih)||'tarihsiz')}</span><b>${esc(r.tur)}${r.yeniden?' · yeniden baskı':''}</b>
          <span class="rp2-det">${esc([r.aciklama,r.yer,[r.malzeme,r.gramaj?r.gramaj+' gr/m²':''].filter(Boolean).join(' '),r.olcu&&('baskı '+r.olcu),r.gorunen&&('görünen '+r.gorunen),
            r.yuzey!=null?r.yuzey+' yüzey':'',r.miktar!=null?rpSayi(r.miktar)+' '+r.birim:'',r.baskiMerkezi,r.uygulayan].filter(Boolean).join(' · '))}
            ${m.ticari?` <span class="rp2-para">${[r.maliyet!=null?'maliyet '+rpPara(r.maliyet,r.pb):'',r.satis!=null?'satış '+rpPara(r.satis,r.pb):'',r.paket?'paket içinde':''].filter(Boolean).join(' · ')}</span>`:''}
            ${r.not?`<span class="rp2-notm">Not: ${esc(r.not)}</span>`:''}</span>
          <span class="rp2-durum">${esc(r.durum)}</span></label>`).join('')}</div>
        ${is.paketler.map(p=>`<div class="rp2-paket ${p.tam?'':'kismi'}">Paket bedeli — <b>${esc(p.ad)}</b>: ${[p.maliyet!=null?'maliyet '+rpPara(p.maliyet,p.pb):'',p.satis!=null?'satış '+rpPara(p.satis,p.pb):''].filter(Boolean).join(' · ')}
          · ${p.kapsam} işlemi kapsar${p.tam?'':` — bu raporda ${p.raporda}/${p.kapsam} işlem var; tutar toplama katılmaz`}</div>`).join('')}`; }); });
    if(m.ticari) h+=rpBaskiToplamHtml(m);
    return h;
  },
  pdf(m,a){
    const ic=[]; const ticari=m.ticari;
    const n=m.gruplar.reduce((t,k)=>t+k.isler.reduce((x,i)=>x+i.satirlar.filter(r=>r.dahil).length,0),0);
    if(!n) ic.push({text:'Bu kapsamda raporlanacak işlem yok.',style:'bos'});
    const tek=a.teknik&&(a.c_malzeme||a.c_olcu||a.c_gorunen||a.c_yuzey||a.c_miktar);
    m.gruplar.forEach(k=>{ const isler=k.isler.map(i=>({...i,s:i.satirlar.filter(r=>r.dahil)})).filter(i=>i.s.length);
      if(!isler.length) return;
      isler.forEach((is,ii)=>{ const ust=[ii===0?{text:k.ad,stil:'h2'}:null,{text:`${is.ad}  ·  ${is.s.length} işlem`}];
        const islemHucre=r=>({stack:[{text:[{text:r.tur,bold:true},r.yeniden?{text:' · yeniden baskı',color:RPC.amber}:'',r.aciklama?'  '+r.aciklama:'']},
          ...(r.not?[{text:'Not: '+r.not,style:'not'}]:[])]});
        ic.push(rpTablo([{b:'Tarih',g:62},{b:'İşlem',g:'*'},...(a.c_yer?[{b:'Yer / mecra',g:150}]:[]),...(a.c_kim?[{b:'Baskı merkezi / uygulayan',g:120}]:[]),{b:'Durum',g:62}],
          is.s.map(r=>[rpTr(r.tarih)||'—',islemHucre(r),...(a.c_yer?[r.yer||'—']:[]),...(a.c_kim?[r.baskiMerkezi||r.uygulayan||'—']:[]),r.durum]),{ust}));
        if(tek){ const ts=is.s.filter(r=>r.malzeme||r.olcu||r.gorunen||r.yuzey!=null||r.miktar!=null);
          if(ts.length) ic.push(rpTablo([{b:'İşlem',g:'*'},...(a.c_malzeme?[{b:'Malzeme / cins',g:120},{b:'Gramaj',g:46,sag:true}]:[]),
            ...(a.c_olcu?[{b:'Baskı ölçüsü',g:80}]:[]),...(a.c_gorunen?[{b:'Görünen alan',g:80}]:[]),...(a.c_yuzey?[{b:'Yüzey',g:40,sag:true}]:[]),...(a.c_miktar?[{b:'Miktar',g:62,sag:true}]:[])],
            ts.map(r=>[`${r.tur}${r.aciklama?' — '+r.aciklama:''}`,...(a.c_malzeme?[r.malzeme||'—',r.gramaj?r.gramaj+' gr/m²':'—']:[]),
              ...(a.c_olcu?[r.olcu||'—']:[]),...(a.c_gorunen?[r.gorunen||'—']:[]),...(a.c_yuzey?[r.yuzey!=null?String(r.yuzey):'—']:[]),
              ...(a.c_miktar?[r.miktar!=null?`${rpSayi(r.miktar)} ${r.birim}`:'—']:[])]),{fs:8.5})); }
        if(ticari){ ic.push(rpTablo([{b:'İşlem',g:'*'},...(a.tMaliyet?[{b:'Birim maliyet',g:80,sag:true},{b:'Maliyet',g:88,sag:true}]:[]),...(a.tSatis?[{b:'Satış bedeli',g:88,sag:true}]:[]),{b:'Paket',g:110}],
          is.s.map(r=>{ const gri=r.paket?{color:RPC.ink3}:{};
            return [`${r.tur}${r.aciklama?' — '+r.aciklama:''}`,...(a.tMaliyet?[{text:rpPara(r.birimMaliyet,r.pb)||'—',...gri},{text:rpPara(r.maliyet,r.pb)||'—',...gri}]:[]),
              ...(a.tSatis?[{text:rpPara(r.satis,r.pb)||'—',...gri}]:[]),r.paket?((is.paketler.find(p=>p.id===r.paket)||{}).ad||'Paket'):'—']; }),{fs:8.5}));
          is.paketler.forEach(p=>ic.push({text:[{text:'Paket bedeli — '+p.ad+': ',bold:true},[p.maliyet!=null?'maliyet '+rpPara(p.maliyet,p.pb):'',p.satis!=null?'satış '+rpPara(p.satis,p.pb):''].filter(Boolean).join(' · '),
            `. ${p.kapsam} işlemi kapsar.`,p.tam?'':{text:` Bu raporda yalnız ${p.raporda}/${p.kapsam} işlem var; bedel dağıtılmadı ve toplama katılmadı.`,color:RPC.kirmizi},
            p.not?{text:' '+p.not,color:RPC.ink2}:''],fontSize:8.5,margin:[0,0,0,6]}));
          if(is.s.some(r=>r.paket)) ic.push({text:'Paket içindeki işlemlerin satır tutarları bilgi amaçlıdır (gri); toplama paket bedeli girer.',style:'not',margin:[0,0,0,6]}); }
      }); });
    if(ticari) ic.push(...rpBaskiToplamPdf(m,a));
    return {icerik:ic,o:{yon:'landscape'}};
  },
  xlsx(m,a){
    const satir=[];
    m.gruplar.forEach(k=>k.isler.forEach(is=>is.satirlar.filter(r=>r.dahil).forEach(r=>{
      satir.push([r.kurum,r.is,r.tarih||null,r.tur,r.yeniden?'Evet':'',r.aciklama,
        ...(a.c_yer?[r.yer]:[]),
        ...(a.teknik&&a.c_malzeme?[r.malzeme,r.gramaj]:[]),...(a.teknik&&a.c_olcu?[r.olcu]:[]),...(a.teknik&&a.c_gorunen?[r.gorunen]:[]),
        ...(a.teknik&&a.c_yuzey?[r.yuzey]:[]),...(a.teknik&&a.c_miktar?[r.miktar,r.birim]:[]),
        ...(a.c_kim?[r.baskiMerkezi,r.uygulayan]:[]),r.durum,
        ...(a.tMaliyet?[r.birimMaliyet,r.maliyet]:[]),...(a.tSatis?[r.satis]:[]),...(m.ticari?[r.pb,r.paket?((is.paketler.find(p=>p.id===r.paket)||{}).ad||''):'']:[]),
        ...(a.notlar?[r.not]:[])]); })));
    const kol=[{b:'Kurum',w:26,sar:true},{b:'İş',w:30,sar:true},{b:'Tarih',w:11,tip:'tarih'},{b:'İşlem',w:12},{b:'Yeniden baskı',w:9},{b:'Açıklama',w:30,sar:true},
      ...(a.c_yer?[{b:'Yer / mecra',w:30,sar:true}]:[]),
      ...(a.teknik&&a.c_malzeme?[{b:'Malzeme / cins',w:22,sar:true},{b:'Gramaj (gr/m²)',w:10,tip:'tam'}]:[]),...(a.teknik&&a.c_olcu?[{b:'Baskı ölçüsü',w:14}]:[]),
      ...(a.teknik&&a.c_gorunen?[{b:'Görünen alan',w:14}]:[]),...(a.teknik&&a.c_yuzey?[{b:'Yüzey sayısı',w:9,tip:'tam'}]:[]),
      ...(a.teknik&&a.c_miktar?[{b:'Miktar',w:9,tip:'sayi'},{b:'Birim',w:8}]:[]),
      ...(a.c_kim?[{b:'Baskı merkezi',w:22,sar:true},{b:'Uygulayan',w:22,sar:true}]:[]),{b:'Durum',w:12},
      ...(a.tMaliyet?[{b:'Birim maliyet',w:13,tip:'para'},{b:'Maliyet',w:13,tip:'para'}]:[]),...(a.tSatis?[{b:'Satış bedeli',w:13,tip:'para'}]:[]),
      ...(m.ticari?[{b:'Para birimi',w:8},{b:'Paket',w:22,sar:true}]:[]),...(a.notlar?[{b:'Not',w:40,sar:true}]:[])];
    const S=[{ad:'Döküm',yon:'landscape',kol,satir,sabitKol:2,
      not:m.ticari?'Paket içindeki işlemlerin satır tutarları bilgi amaçlıdır; paket bedeli Paketler sayfasındadır ve toplama bir kez girer.':null}];
    if(m.ticari){
      const ps=[]; m.gruplar.forEach(k=>k.isler.forEach(is=>is.paketler.forEach(p=>ps.push([k.ad,is.ad,p.ad,p.kapsam,p.raporda,
        ...(a.tMaliyet?[p.maliyet]:[]),...(a.tSatis?[p.satis]:[]),p.pb,p.tam?'Evet':'Hayır — kısmi, toplama katılmadı',...(a.notlar?[p.not]:[])]))));
      if(ps.length) S.push({ad:'Paketler',yon:'landscape',kol:[{b:'Kurum',w:24,sar:true},{b:'İş',w:28,sar:true},{b:'Paket',w:26,sar:true},{b:'Kapsadığı işlem',w:10,tip:'tam'},
        {b:'Bu rapordaki',w:10,tip:'tam'},...(a.tMaliyet?[{b:'Paket maliyeti',w:14,tip:'para'}]:[]),...(a.tSatis?[{b:'Paket satışı',w:14,tip:'para'}]:[]),{b:'Para birimi',w:8},{b:'Toplama dahil',w:26,sar:true},
        ...(a.notlar?[{b:'Not',w:36,sar:true}]:[])],satir:ps});
      S.push({ad:'Toplamlar',yon:'portrait',kol:[{b:'Para birimi',w:12},...(a.tMaliyet?[{b:'Maliyet toplamı',w:18,tip:'para'}]:[]),...(a.tSatis?[{b:'Satış toplamı',w:18,tip:'para'}]:[])],
        satir:Object.entries(m.toplamlar).map(([pb,t])=>[pb,...(a.tMaliyet?[t.var.maliyet?t.maliyet:null]:[]),...(a.tSatis?[t.var.satis?t.satis:null]:[])]),
        not:'Her para birimi ayrı toplanır. Kısmi paketler ve tutarı girilmemiş satırlar toplama katılmaz. KDV, indirim ve kâr kayıtta olmadığı için hesaplanmamıştır.'});
    }
    S.push(rpBilgiSayfa(m,[['Gruplama','Kurum → iş → işlem'],['Tarih','Tarih sütunu seçilen tarih alanıdır; baskı satırında baskı, montaj satırında montaj tarihi.']]));
    return S;
  }
};
function rpBaskiToplamHtml(m){
  const e=Object.entries(m.toplamlar);
  return `<h5 class="rp2-g1">Toplamlar</h5>${e.length?e.map(([pb,t])=>`<p class="rp2-ozet"><b>${esc(pb)}</b>: ${[t.var.maliyet?'maliyet '+rpPara(t.maliyet,pb):'',t.var.satis?'satış '+rpPara(t.satis,pb):''].filter(Boolean).join(' · ')}</p>`).join('')
    :'<p class="muted">Seçili işlemlerde kayıtlı tutar yok.</p>'}
    <p class="fhint">Her para birimi ayrı toplanır. Kısmi paketler ve tutarı girilmemiş satırlar toplama katılmaz. KDV, indirim ve kâr hesaplanmaz.${m.kismiPaket?' Bu raporda kısmen kapsanan paket var.':''}</p>`;
}
function rpBaskiToplamPdf(m,a){
  const e=Object.entries(m.toplamlar);
  return [rpH2('Toplamlar'),
    e.length?rpTablo([{b:'Para birimi',g:80},...(a.tMaliyet?[{b:'Maliyet toplamı',g:120,sag:true}]:[]),...(a.tSatis?[{b:'Satış toplamı',g:120,sag:true}]:[]),{b:'',g:'*'}],
      e.map(([pb,t])=>[pb,...(a.tMaliyet?[{text:t.var.maliyet?rpPara(t.maliyet,pb):'—',bold:true}]:[]),...(a.tSatis?[{text:t.var.satis?rpPara(t.satis,pb):'—',bold:true}]:[]),''])):{text:'Seçili işlemlerde kayıtlı tutar yok.',style:'bos'},
    {text:'Her para birimi ayrı toplanır; farklı birimler tek tutarda toplanmaz. Paket bedeli bir kez sayılır; kısmen kapsanan paketler ve tutarı girilmemiş satırlar toplama katılmaz. Tutarlar kayıtlı haliyledir; KDV, indirim ve kâr kayıtta olmadığı için hesaplanmamıştır.',style:'not'}];
}
function rpBaskiKurum(v){ const a=rpAyar('baski'); a.kurum=v; a.isler=[]; rpKontrolCiz('baski'); rpYenile('baski'); }
function rpBaskiIs(id,on){ const a=rpAyar('baski'); const s=new Set(a.isler); if(on) s.add(id); else s.delete(id); a.isler=[...s]; rpYenile('baski'); }
function rpBaskiTur(k,on){ const a=rpAyar('baski'); const s=new Set(a.turler); if(on) s.add(k); else s.delete(k);
  if(!s.size){ rpNot('En az bir işlem türü seçin.','uyari'); rpKontrolCiz('baski'); return; } a.turler=[...s]; rpYenile('baski'); }

/* ==========================================================
   3) KİŞİSEL ÇALIŞMA PLANI
   Kişisel ilgi kuralı Ajandam ile aynı: etiketlendiğim, atandığım,
   yazdığım ya da takip ettiğim / sahibi olduğum işe bağlı kayıt.
   Güncelleme ≠ yapılacak iş: tarihli ya da açık aksiyonlu Entry
   aksiyondur; düz güncelleme yalnız "Bilmen gereken gelişmeler"e,
   yalnız etiketlendiğim ya da acil olanlar varsayılan olarak girer.
   Kişisel randevular YALNIZ oturum sahibinin kendi planında yer alır
   (RLS de başkasınınkini döndürmez); başkası için plan hazırlamak
   hiçbir erişimi genişletmez.
   ========================================================== */
RPD_PLAN={
  amac:'Günlük ya da haftalık planı PDF olarak telefona indirin; uygulama ve internet olmadan okunur.',
  presetNot:'Dış paylaşımda iletişim bilgileri ve gelişmeler kapalıdır.',
  alici:'ic', kontrolVeriyle:true,
  varsayilan(){ return {kisi:(ui._me&&ui._me.id)||0,donem:'hafta',bas:'',bit:'',geciken:true,tarihsiz:true,gelisme:true,gelismeGun:7,randevu:true,adres:false}; },
  preset(v){ return v==='dis'?{iletisim:false,gelisme:false}:{iletisim:true,gelisme:true}; },
  donem(a){ const b=rpBugun();
    if(a.donem==='bugun') return [b,b];
    if(a.donem==='hafta'){ const d=mdGun(b); const g=(d.getDay()+6)%7; const p=rpEkle(b,-g); return [p,rpEkle(p,6)]; }
    return [a.bas||b,a.bit||a.bas||b]; },
  veriAnahtar(a){ const [b,e]=RPD_PLAN.donem(a); return `plan|${a.kisi}|${b}|${e}|${a.gelismeGun}`; },
  async veri(a){
    const [b,e]=RPD_PLAN.donem(a); const P=+a.kisi; const ben=(ui._me&&ui._me.id)||0;
    const [ts0,ts1]=rapSinir(b,e);
    const gel0=new Date(b+'T00:00:00'); gel0.setDate(gel0.getDate()-(+a.gelismeGun||7));
    const [ents,rel,fol,jobs,custs,cts,ops,team,kisisel]=await Promise.all([
      rapHepsi(()=>sb.from('entries').select('id,job_id,customer_id,contact_id,body,action_status,assignee_id,due_at,is_urgent,occurred_at,created_by_team_id')
        .neq('source','system').or(`due_at.lt.${ts1},and(action_status.eq.open,due_at.is.null),occurred_at.gte.${gel0.toISOString()}`).order('id')),
      rapHepsi(()=>sb.from('entry_relevance').select('entry_id,team_id').eq('team_id',P).order('entry_id').order('team_id')),
      rapHepsi(()=>sb.from('work_followers').select('job_id,team_id').eq('team_id',P).order('job_id').order('team_id')),
      rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,primary_contact_id,assignee_id,lifecycle_status').order('id')),
      rapHepsi(()=>sb.from('customers').select('id,firma,telefon,adres').order('id')),
      rapHepsi(()=>sb.from('contacts').select('id,name,title,phone').order('id')),
      rapHepsi(()=>sb.from('work_operations').select('id,job_id,operation_type,status,description,planned_date,location_text,unit_id,supplier_org_id,quantity,quantity_unit')
        .lte('planned_date',e).in('status',['planned','waiting','in_progress','done']).order('id')),
      api('team_list'),
      /* Randevular yalnız KENDİ planında: başkası için okunmaz bile. */
      P===ben?rapHepsi(()=>sb.from('personal_events').select('id,title,event_date,event_time,note').gte('event_date',b).lte('event_date',e).order('id')):Promise.resolve([])]);
    const M=await mdYukle();
    return {b,e,P,ben,ents,rel,fol,jobs,custs,cts,ops,team,kisisel,M,gel0:_cIso(gel0)};
  },
  baslik(a,v){ const t=((v&&v.team)||[]).find(x=>x.id===+a.kisi); return 'Çalışma planı'+(t?' — '+t.name:''); },
  dosya:()=>'Calisma_Plani',
  kontroller(a){
    const T='plan', ben=(ui._me&&ui._me.id)||0;
    const takim=(ui._team&&ui._team.length?ui._team:((rpDurum().veri.plan||{}).team||[])).filter(t=>t.active!==false);
    return `<div class="rp2-grid">
      <div class="field"><label class="flabel" for="rpKisi">Kimin planı</label><select class="inp" id="rpKisi" onchange="rpSet('plan','kisi',+this.value,true)">
        ${(takim.length?takim:[{id:ben,name:(ui._me||{}).name||'Ben'}]).map(t=>`<option value="${t.id}" ${+a.kisi===t.id?'selected':''}>${esc(t.name)}${t.id===ben?' (ben)':''}</option>`).join('')}</select>
        ${+a.kisi!==ben?'<p class="fhint">Başkası için hazırlanan planda kişisel randevular yer almaz; yalnız ortak iş kayıtları kullanılır.</p>':''}</div>
      <div class="field"><span class="flabel">Dönem</span>${rpSeg(T,'donem',a.donem,[['bugun','Bugün'],['hafta','Bu hafta'],['ozel','Özel aralık']],'Dönem')}</div></div>
      ${a.donem==='ozel'?rpTarihKontrol(T,a,'bas','bit'):''}
      <div class="rp2-chips col">
        ${rpChk(T,'geciken',a.geciken,'Geciken aksiyonlar')}
        ${rpChk(T,'tarihsiz',a.tarihsiz,'Tarihi belirlenmemiş aksiyonlar')}
        ${rpChk(T,'gelisme',a.gelisme,'Bilmen gereken gelişmeler',`son ${a.gelismeGun} gün; etiketlendiklerin ve acil olanlar seçili gelir`)}
        ${rpChk(T,'iletisim',a.iletisim,'İlgili kişi ve telefon')}
        ${rpChk(T,'adres',a.adres,'Kurum adresi')}
        ${+a.kisi===ben?rpChk(T,'randevu',a.randevu,'Kişisel randevularım','yalnız senin planında'):''}
      </div>`;
  },
  model(a,v){
    const T='plan', P=v.P, b=v.b, e=v.e, bugun=rpBugun();
    const hata=a.donem==='ozel'?rpDonemDogrula(b,e,62):null;
    const out={b,e,gunler:[],geciken:[],tarihsiz:[],gelismeler:[],uyari:[],hata,bilgi:[['Dönem',b===e?rpGunAdi(b)+' '+b.slice(0,4):`${rpTr(b)} – ${rpTr(e)}`]]};
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'madde'}; return out; }
    const jm={}; v.jobs.forEach(j=>jm[j.id]=j); const cm={}; v.custs.forEach(c=>cm[c.id]=c); const km={}; v.cts.forEach(c=>km[c.id]=c);
    const etik=new Set(v.rel.map(r=>r.entry_id));
    const isler=new Set(v.fol.map(f=>f.job_id)); v.jobs.forEach(j=>{ if(j.assignee_id===P) isler.add(j.id); });
    const ilgili=x=>etik.has(x.id)||x.assignee_id===P||x.created_by_team_id===P||(x.job_id&&isler.has(x.job_id));
    const baglam=(jobId,custId,contactId)=>{ const j=jm[jobId]||null; const c=cm[custId||(j&&j.customer_id)]||null;
      const k=km[contactId||(j&&j.primary_contact_id)]||null;
      /* İş adı zaten "Kurum · Kampanya" biçimindeyse kurum tekrar yazılmaz. */
      const on=j&&j.title&&j.title.includes(' · ')?j.title.split(' · ')[0].toLocaleLowerCase('tr'):'';
      const kTek=c&&on&&String(c.firma||'').toLocaleLowerCase('tr').startsWith(on);
      return {is:j?j.title:'',kurum:c&&!kTek?orgKisa(c.firma,60):'',
        kisi:a.iletisim&&k?[k.name,k.title?`(${k.title})`:''].filter(Boolean).join(' '):'',
        tel:a.iletisim?[(k&&k.phone)||'',(!k&&c&&c.telefon)||''].filter(Boolean)[0]||'':'',
        adres:a.adres&&c?(c.adres||''):''}; };
    const gorunen=new Set();
    const acik=x=>x.action_status!=='done'&&x.action_status!=='cancelled';
    /* Aksiyonlar */
    const aks=v.ents.filter(x=>acik(x)&&ilgili(x)&&(x.due_at||x.action_status==='open'));
    aks.forEach(x=>{ const g=x.due_at?rpYerelGun(x.due_at):'';
      const it={key:'e'+x.id,tip:'aksiyon',gun:g,saat:'',baslik:x.body||'',acil:!!x.is_urgent,...baglam(x.job_id,x.customer_id,x.contact_id),
        etiket:etik.has(x.id)};
      if(!g){ if(a.tarihsiz){ gorunen.add(it.key); out.tarihsiz.push(it); } }
      /* Bugünden önceki açık aksiyon GECİKENDİR — seçilen dönemin içinde olsa bile. */
      else if(g<bugun||g<b){ if(a.geciken&&g<bugun){ it.gec=Math.round(rpDn(bugun)-rpDn(g)); gorunen.add(it.key); out.geciken.push(it); } }
      else if(g<=e){ gorunen.add(it.key); (out._gun=out._gun||[]).push(it); } });
    /* Baskı / montaj */
    const U=v.M.unitById;
    v.ops.filter(o=>o.planned_date&&isler.has(o.job_id)).forEach(o=>{
      const g=o.planned_date; const u=o.unit_id?U[o.unit_id]:null;
      const it={key:'o'+o.id,tip:'op',gun:g,saat:'',baslik:`${RP_OPTUR[o.operation_type]||o.operation_type}${o.description?': '+o.description:''}`,
        ...baglam(o.job_id),yer:[u?mdYuzAdi(v.M,u):'',o.location_text||''].filter(Boolean).join(' — '),
        miktar:o.quantity!=null?`${rpSayi(o.quantity)} ${RP_BIRIM[o.quantity_unit]||''}`:''};
      if(g<bugun||g<b){ if(a.geciken&&g<bugun&&o.status!=='done'){ it.gec=Math.round(rpDn(bugun)-rpDn(g)); gorunen.add(it.key); out.geciken.push(it); } }
      else if(g<=e&&o.status!=='done'){ gorunen.add(it.key); (out._gun=out._gun||[]).push(it); } });
    /* Randevular (yalnız kendi planı) */
    if(a.randevu&&P===v.ben) v.kisisel.forEach(k=>{ const it={key:'k'+k.id,tip:'randevu',gun:k.event_date,saat:k.event_time?String(k.event_time).slice(0,5):'',baslik:k.title||'',not:k.note||''};
      gorunen.add(it.key); (out._gun=out._gun||[]).push(it); });
    /* Gelişmeler: düz güncelleme (tarihsiz, aksiyonsuz), ilgili işlerden. */
    if(a.gelisme) v.ents.filter(x=>!x.due_at&&!x.action_status&&x.occurred_at&&rpYerelGun(x.occurred_at)>=v.gel0&&rpYerelGun(x.occurred_at)<=e
        &&(etik.has(x.id)||(x.job_id&&isler.has(x.job_id)))&&x.created_by_team_id!==P).forEach(x=>{
      const it={key:'g'+x.id,tip:'gelisme',gun:rpYerelGun(x.occurred_at),baslik:x.body||'',acil:!!x.is_urgent,etiket:etik.has(x.id),...baglam(x.job_id,x.customer_id,x.contact_id)};
      gorunen.add(it.key); if(!it.etiket&&!it.acil) rpVarsayilanDisi(T,it.key); out.gelismeler.push(it); });
    out.budanan=rpBuda(T,gorunen);
    const d=it=>({...it,dahil:rpDahil(T,it.key)});
    const gunMap={};
    (out._gun||[]).forEach(it=>(gunMap[it.gun]=gunMap[it.gun]||[]).push(d(it))); delete out._gun;
    const sira=(x,y)=>(x.saat?0:1)-(y.saat?0:1)||String(x.saat).localeCompare(String(y.saat))||(y.acil?1:0)-(x.acil?1:0)||(x.tip==='randevu'?-1:0);
    /* Geçmiş gün yalnız üzerinde kayıt (ör. randevu) varsa yazılır. */
    for(let n=rpDn(b);n<=rpDn(e);n++){ const g=rpIso(n); if(g<bugun&&!(gunMap[g]||[]).length) continue;
      out.gunler.push({gun:g,ad:rpGunAdi(g),maddeler:(gunMap[g]||[]).sort(sira)}); }
    out.geciken=out.geciken.map(d).sort((x,y)=>String(x.gun).localeCompare(String(y.gun)));
    out.tarihsiz=out.tarihsiz.map(d); out.gelismeler=out.gelismeler.map(d).sort((x,y)=>String(y.gun).localeCompare(String(x.gun)));
    out.kisi=(v.team.find(t=>t.id===P)||{}).name||'';
    out.baskasi=P!==v.ben;
    const tum=[...out.geciken,...out.gunler.flatMap(g=>g.maddeler),...out.tarihsiz,...out.gelismeler];
    const n=tum.filter(x=>x.dahil).length;
    out.say={dahil:n,filtre:tum.length,cik:tum.length-n,birim:'madde'};
    out.bilgi.unshift(['Kişi',out.kisi]);
    return out;
  },
  bosIndirilebilir:true,
  onizle(m,a){
    const T='plan';
    const madde=it=>`<label class="rp2-row ${it.dahil?'':'dis'}">${rpCb(T,it.key,it.dahil,'Plana dahil')}
      <span class="rp2-tip ${it.tip}">${it.tip==='randevu'?(it.saat||'Randevu'):it.tip==='op'?'İş':it.tip==='gelisme'?'Bilgi':'Yapılacak'}</span>
      <span class="rp2-det"><b>${esc(it.baslik)}</b>${it.acil?' <span class="rp2-t uyari">ACİL</span>':''}${it.gec?` <span class="rp2-t uyari">${it.gec} gün gecikti</span>`:''}
        ${[it.is,it.kurum,it.yer,it.kisi,it.tel,it.adres].filter(Boolean).length?`<em>${esc([it.is,it.kurum,it.yer,it.kisi,it.tel,it.adres].filter(Boolean).join(' · '))}</em>`:''}</span></label>`;
    let h='';
    if(m.baskasi) h+='<div class="rp2-not">Bu plan başka bir kişi için: kişisel randevular dahil değildir.</div>';
    if(m.geciken.length) h+=`<h5 class="rp2-g1">Geciken</h5><div class="rp2-rows">${m.geciken.map(madde).join('')}</div>`;
    m.gunler.forEach(g=>{ h+=`<h5 class="rp2-g1">${esc(g.ad)}</h5>${g.maddeler.length?`<div class="rp2-rows">${g.maddeler.map(madde).join('')}</div>`:'<p class="empty">Bu gün için kayıtlı iş yok.</p>'}`; });
    if(a.tarihsiz) h+=`<h5 class="rp2-g1">Tarihi belirlenmemiş</h5>${m.tarihsiz.length?`<div class="rp2-rows">${m.tarihsiz.map(madde).join('')}</div>`:'<p class="empty">Yok.</p>'}`;
    if(a.gelisme) h+=`<h5 class="rp2-g1">Bilmen gereken gelişmeler</h5><p class="fhint">Yalnız etiketlendiğin ve acil güncellemeler seçili gelir; diğerlerini gerekirse ekle. Güncellemeler görev değildir.</p>
      ${m.gelismeler.length?`<div class="rp2-rows">${m.gelismeler.map(madde).join('')}</div>`:'<p class="empty">Bu dönemde gelişme yok.</p>'}`;
    return h;
  },
  pdf(m,a){
    const ic=[];
    const satir=it=>({columns:[rpKutu(11),{width:'*',stack:[
      {text:[...(it.saat?[{text:it.saat+'  ',bold:true,color:RPC.mavi}]:[]),{text:it.baslik,bold:it.tip!=='gelisme'},
        ...(it.acil?[{text:'  ACİL',bold:true,color:RPC.kirmizi,fontSize:9}]:[]),...(it.gec?[{text:`  ${it.gec} gün gecikti`,bold:true,color:RPC.kirmizi,fontSize:9}]:[])]},
      ...([it.tip==='op'?'Baskı / montaj':null,it.is,it.kurum].filter(Boolean).length?[{text:[it.tip==='op'?'Baskı / montaj':null,it.is,it.kurum].filter(Boolean).join(' · '),style:'not'}]:[]),
      ...(it.yer?[{text:'Yer: '+it.yer+(it.miktar?' · '+it.miktar:''),style:'not'}]:[]),
      ...(it.kisi||it.tel?[{text:[it.kisi,it.tel].filter(Boolean).join(' · '),style:'not'}]:[]),
      ...(it.adres?[{text:'Adres: '+it.adres,style:'not'}]:[]),...(it.not?[{text:it.not,style:'not'}]:[])]}],
      columnGap:4,margin:[0,0,0,7],unbreakable:true});
    const gelSatir=it=>({stack:[{text:[{text:rpTr(it.gun)+'  ',color:RPC.ink3,fontSize:9},{text:it.baslik},...(it.acil?[{text:'  ACİL',bold:true,color:RPC.kirmizi,fontSize:9}]:[])]},
      ...([it.is,it.kurum].filter(Boolean).length?[{text:[it.is,it.kurum].filter(Boolean).join(' · '),style:'not'}]:[])],margin:[0,0,0,6],unbreakable:true});
    const ge=m.geciken.filter(x=>x.dahil);
    if(ge.length){ ic.push(rpH2('Geciken',{color:RPC.kirmizi})); ge.forEach(it=>ic.push(satir(it))); }
    m.gunler.forEach(g=>{ const md=g.maddeler.filter(x=>x.dahil);
      ic.push(rpH2(g.ad));
      if(md.length) md.forEach(it=>ic.push(satir(it))); else { ic.pop(); ic.push({stack:[{...rpH2(g.ad),headlineLevel:undefined},{text:'Bu gün için kayıtlı iş yok.',style:'bos'}],unbreakable:true}); } });
    if(a.tarihsiz){ const t=m.tarihsiz.filter(x=>x.dahil); ic.push(rpH2('Tarihi belirlenmemiş'));
      if(t.length) t.forEach(it=>ic.push(satir(it))); else ic.push({text:'Yok.',style:'bos'}); }
    if(a.gelisme){ const g=m.gelismeler.filter(x=>x.dahil); ic.push(rpH2('Bilmen gereken gelişmeler'));
      ic.push({text:'Bilgi içindir; yapılacak iş değildir.',style:'not',margin:[0,0,0,6]});
      if(g.length) g.forEach(it=>ic.push(gelSatir(it))); else ic.push({text:'Seçilmiş gelişme yok.',style:'bos'}); }
    ic.push({text:'Bu PDF çevrimdışı kullanım içindir. Üzerine yapılan işaretler uygulamaya aktarılmaz; tamamlanan işleri uygulamada ayrıca işaretleyin.',style:'not',margin:[0,14,0,0]});
    return {icerik:ic,o:{yon:'portrait',boyut:'A5',altNot:'Çevrimdışı kopya'}};
  }
};

/* ==========================================================
   4) İŞ ÖZETİ VE GEÇMİŞİ
   Mevcut durum rapor anındaki durumdur ve öyle etiketlenir. Geçmiş,
   seçilen güncellemeler + ÖNEMLİ hareketlerdir; teknik anahtar, kayıt
   no, ham veri yazılmaz. Yapısal bölümde (yayın, baskı/montaj, belge)
   zaten görünen olayın hareketi zaman çizelgesinde tekrarlanmaz.
   Belgelerin yalnız adı, türü, tarihi yazılır; bağlantı/imzalı URL YOK.
   ========================================================== */
const RP_ONEMLI={work_created:'genel',work_phase:'genel',work_lifecycle:'genel',work_renamed:'genel',contract_created:'genel',
  work_accounting:'muhasebe',media_created:'yayin',media_changed:'yayin',media_cancelled:'yayin',
  operation_created:'operasyon',operation_status:'operasyon',document_added:'belge',document_linked:'belge'};
RPD_IS={
  amac:'Bir işin mevcut durumunu ve gelişimini paylaşın. Genel iş takip tablosu değildir.',
  presetNot:'Dış paylaşımda iç yazışmalar (güncellemeler), kişi bilgileri, açık aksiyonlar ve muhasebe hareketleri kapalıdır.',
  varsayilan(){ return {is:(ui._work&&ui._work.id)||0,bas:'',bit:'',hareket:true,yayin:true,operasyon:true,belge:true}; },
  preset(v){ return v==='dis'?{kisiler:false,guncelleme:false,aksiyon:false,muhasebe:false}:{kisiler:true,guncelleme:true,aksiyon:true,muhasebe:true}; },
  veriAnahtar:a=>'is|'+a.is,
  async veri(a){
    const jobs=await rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,lifecycle_status').order('id'));
    if(!a.is) return {jobs};
    const [d,team,custs,cts,fol,M]=await Promise.all([api('work_detail&id='+a.is),api('team_list'),api('customers_min'),
      rapHepsi(()=>sb.from('contacts').select('id,name,title,phone,email').order('id')),
      rapHepsi(()=>sb.from('work_followers').select('job_id,team_id').eq('job_id',a.is).order('job_id').order('team_id')),mdYukle()]);
    return {jobs,d,team,custs,cts,fol,M};
  },
  kontrolVeriyle:true,
  baslik(a,v){ const d=v&&v.d; return d?`${d.job.title||'İş'} — iş özeti`:'İş özeti'; },
  dosya:m=>'Is_Ozeti',
  kontroller(a){
    const v=(rpDurum().veri||{}).is, T='is';
    const jobs=v?v.jobs:[];
    return `<div class="field"><label class="flabel" for="rpIs">İş</label><select class="inp" id="rpIs" onchange="rpIsSec(+this.value)">
        <option value="0">— iş seçin —</option>${jobs.filter(j=>j.lifecycle_status!=='kapandi'||j.id===a.is).map(j=>`<option value="${j.id}" ${a.is===j.id?'selected':''}>${esc(j.title||'#'+j.id)}</option>`).join('')}
        ${jobs.some(j=>j.lifecycle_status==='kapandi'&&j.id!==a.is)?`<optgroup label="Arşiv">${jobs.filter(j=>j.lifecycle_status==='kapandi'&&j.id!==a.is).map(j=>`<option value="${j.id}">${esc(j.title||'#'+j.id)}</option>`).join('')}</optgroup>`:''}</select></div>
      ${rpTarihKontrol(T,a,'bas','bit',['Geçmiş başlangıcı (isteğe bağlı)','Geçmiş bitişi (isteğe bağlı)'])}
      <div class="field"><span class="flabel">Bölümler</span><div class="rp2-chips col">
        ${rpChk(T,'kisiler',a.kisiler,'İlgili kişiler','iletişim bilgisi')}
        ${rpChk(T,'guncelleme',a.guncelleme,'Güncellemeler','iç yazışma — tek tek seçilir')}
        ${rpChk(T,'hareket',a.hareket,'Önemli hareketler','aşama, yaşam döngüsü, sözleşme…')}
        ${rpChk(T,'muhasebe',a.muhasebe,'Muhasebe hareketleri')}
        ${rpChk(T,'yayin',a.yayin,'Yayın / opsiyon bilgileri')}
        ${rpChk(T,'operasyon',a.operasyon,'Baskı / montaj işlemleri')}
        ${rpChk(T,'belge',a.belge,'Belge listesi','yalnız ad, tür, tarih')}
        ${rpChk(T,'aksiyon',a.aksiyon,'Açık aksiyonlar ve sonraki adımlar')}</div></div>`;
  },
  model(a,v){
    const T='is';
    const out={uyari:[],bilgi:[]};
    if(!a.is||!v.d){ out.uyari.push('Rapor için bir iş seçin.'); out.say={dahil:0,filtre:0,cik:0,birim:'kayıt'}; out.bos=true; return out; }
    const d=v.d, j=d.job, M=v.M;
    const hata=(a.bas||a.bit)?rpDonemDogrula(a.bas||'2000-01-01',a.bit||'2099-12-31'):null;
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'kayıt'}; return out; }
    const tm={}; (v.team||[]).forEach(t=>tm[t.id]=t.name); const cm={}; (v.custs||[]).forEach(c=>cm[c.id]=c.firma||'');
    const km={}; (v.cts||[]).forEach(c=>km[c.id]=c);
    const aralikta=g=>(!a.bas||g>=a.bas)&&(!a.bit||g<=a.bit);
    const gorunen=new Set();
    /* Özet */
    const bugun=rpBugun();
    const med=(d.medya||[]).filter(r=>r.commitment!=='cancelled');
    const donemB=[j.start_day,...med.map(r=>r.block_start),...(d.ops||[]).map(o=>o.planned_date)].filter(Boolean).sort()[0]||'';
    const donemE=[j.end_day,...med.map(r=>r.block_end),...(d.ops||[]).map(o=>o.planned_date)].filter(Boolean).sort().slice(-1)[0]||'';
    const ls=j.lifecycle_status||'acik';
    out.ozet={is:j.title||'',kurum:cm[j.customer_id]||'',donem:donemB?`${rpTr(donemB)} – ${donemE?rpTr(donemE):'…'}`:'',
      asama:FAZ_ETIKET[j.status]||JOBLBL[j.status]||j.status||'',
      yasam:ls==='kapandi'?`Arşiv${j.closed_reason?' ('+(CLOSELBL[j.closed_reason]||j.closed_reason)+')':''}`:ls==='bekliyor'?'Aktif · Bekliyor':'Aktif',
      acil:!!j.is_urgent,an:rpAnTr(v.okunma)};
    if(a.bas||a.bit) out.bilgi.push(['Geçmiş aralığı',`${a.bas?rpTr(a.bas):'…'} – ${a.bit?rpTr(a.bit):'…'}`]);
    /* Kişiler */
    if(a.kisiler){ const k=km[j.primary_contact_id]; out.kisiler=[];
      if(k) out.kisiler.push({ad:k.name,rol:'Ana ilgili kişi'+(k.title?' · '+k.title:''),tel:k.phone||'',eposta:k.email||''});
      const ROL={account:'Müşteri',advertiser:'Reklamveren',agency:'Ajans',bill_to:'Fatura',supplier:'Tedarikçi',operator:'İşletmeci',other:'Diğer'};
      (d.parties||[]).filter(p=>p.customer_id).forEach(p=>out.kisiler.push({ad:orgKisa(cm[p.customer_id]||'',60),rol:ROL[p.role]||p.role,tel:'',eposta:''}));
      out.ekip=(v.fol||[]).map(f=>tm[f.team_id]).filter(Boolean); }
    /* Zaman çizelgesi */
    const zc=[];
    const insan=(d.entries||[]).filter(e=>e.source!=='system');
    const acikAks=e=>(e.due_at&&!['done','cancelled'].includes(e.action_status))||e.action_status==='open';
    if(a.guncelleme) insan.filter(e=>!(a.aksiyon&&acikAks(e))&&aralikta(rpYerelGun(e.occurred_at))).forEach(e=>{
      const key='g'+e.id; gorunen.add(key);
      zc.push({key,tip:'guncelleme',gun:rpYerelGun(e.occurred_at),metin:e.body||'',kim:tm[e.created_by_team_id]||''}); });
    if(a.hareket){ const gor=new Set();
      (d.entries||[]).filter(e=>e.source==='system'&&RP_ONEMLI[e.system_kind]).forEach(e=>{
        const grp=RP_ONEMLI[e.system_kind];
        if(grp==='yayin'&&a.yayin) return;          /* yapısal bölümde zaten var */
        if(grp==='operasyon'&&a.operasyon) return;
        if(grp==='belge'&&a.belge) return;
        if(grp==='muhasebe'&&!a.muhasebe) return;
        const g=rpYerelGun(e.occurred_at); if(!aralikta(g)) return;
        const imza=g+'|'+(e.body||''); if(gor.has(imza)) return; gor.add(imza);
        const key='h'+e.id; gorunen.add(key);
        zc.push({key,tip:'hareket',gun:g,metin:e.body||''}); }); }
    zc.sort((x,y)=>x.gun.localeCompare(y.gun)||x.key.localeCompare(y.key));
    out.zaman=zc.map(x=>({...x,dahil:rpDahil(T,x.key)}));
    /* Yayın */
    if(a.yayin){ out.yayin=med.map(r=>{ const key='y'+mdKayitKey(r); gorunen.add(key);
      const u=r.unit_id?M.unitById[r.unit_id]:null, al=M.altById[r.alt_mecra_id];
      return {key,dahil:rpDahil(T,key),yer:[r.mecra_name,u?mdYuzAdi(M,u):(al?al.name:r.area_name)].filter(Boolean).join(' · '),
        donem:`${rpTr(r.block_start)} – ${r.block_end?rpTr(r.block_end):'bitiş bilinmiyor'}`,durum:mdKayitDurumAd(r,mdZamansal(r,bugun))}; }); }
    /* Operasyon */
    if(a.operasyon){ out.ops=(d.ops||[]).filter(o=>o.status!=='cancelled').map(o=>{ const key='o'+o.id; gorunen.add(key);
      const u=o.unit_id?M.unitById[o.unit_id]:null;
      return {key,dahil:rpDahil(T,key),tarih:o.planned_date||'',tur:(RP_OPTUR[o.operation_type]||o.operation_type)+(o.reprint?' · yeniden baskı':''),
        aciklama:o.description||'',yer:[u?mdYuzAdi(M,u):'',o.location_text||''].filter(Boolean).join(' — '),durum:RP_OPDURUM[o.status]||o.status}; }); }
    /* Belgeler — yalnız ad/tür/tarih */
    if(a.belge){ out.belgeler=workBelgeListe(d).map(x=>{ const key='b'+x.doc.id; gorunen.add(key);
      return {key,dahil:rpDahil(T,key),ad:x.doc.title||x.doc.original_name||'Belge',tur:belgeTurLbl(x.doc.doc_type),tarih:rpYerelGun(x.doc.created_at)}; }); }
    /* Açık aksiyonlar */
    if(a.aksiyon){ out.aksiyon=insan.filter(acikAks).map(e=>{
      const key='a'+e.id; gorunen.add(key);
      return {key,dahil:rpDahil(T,key),metin:e.body||'',tarih:e.due_at?rpYerelGun(e.due_at):'',kim:tm[e.assignee_id]||''}; }); }
    out.budanan=rpBuda(T,gorunen);
    const tum=[...out.zaman,...(out.yayin||[]),...(out.ops||[]),...(out.belgeler||[]),...(out.aksiyon||[])];
    const n=tum.filter(x=>x.dahil).length;
    out.say={dahil:n,filtre:tum.length,cik:tum.length-n,birim:'kayıt'};
    return out;
  },
  bosIndirilebilir:true,
  onizle(m,a){
    if(m.bos) return '<p class="empty">Rapor için yukarıdan bir iş seçin.</p>';
    if(!m.ozet) return '';
    const T='is', o=m.ozet;
    const sat=(x,ic)=>`<label class="rp2-row ${x.dahil?'':'dis'}">${rpCb(T,x.key,x.dahil)}${ic}</label>`;
    let h=`<div class="rp2-ozetkart"><b>${esc(o.is)}</b><span>${esc(o.kurum)}</span>
      <span>Durum (${esc(o.an)} itibarıyla): <b>${esc(o.asama)}</b> · ${esc(o.yasam)}${o.acil?' · Acil':''}</span>${o.donem?`<span>Dönem: ${esc(o.donem)}</span>`:''}</div>`;
    if(m.kisiler) h+=`<h5 class="rp2-g1">İlgili kişiler</h5>${m.kisiler.length?m.kisiler.map(k=>`<p class="rp2-ozet"><b>${esc(k.ad)}</b> — ${esc(k.rol)}${k.tel?' · '+esc(k.tel):''}${k.eposta?' · '+esc(k.eposta):''}</p>`).join(''):'<p class="empty">Kayıtlı kişi yok.</p>'}
      ${m.ekip&&m.ekip.length?`<p class="rp2-ozet">Medyapark ekibi: ${esc(m.ekip.join(', '))}</p>`:''}`;
    h+=`<h5 class="rp2-g1">Geçmiş</h5>${m.zaman.length?`<div class="rp2-rows">${m.zaman.map(x=>sat(x,`<span class="rp2-tarih-c">${esc(rpTr(x.gun))}</span>
      <span class="rp2-tip ${x.tip}">${x.tip==='hareket'?'Hareket':'Güncelleme'}</span><span class="rp2-det">${esc(x.metin)}${x.kim?` <em>${esc(x.kim)}</em>`:''}</span>`)).join('')}</div>`:'<p class="empty">Seçilen bölümlerde geçmiş kaydı yok.</p>'}`;
    if(m.yayin) h+=`<h5 class="rp2-g1">Yayın / opsiyon</h5>${m.yayin.length?`<div class="rp2-rows">${m.yayin.map(x=>sat(x,`<b>${esc(x.yer)}</b><span class="rp2-det">${esc(x.donem)}</span><span class="rp2-durum">${esc(x.durum)}</span>`)).join('')}</div>`:'<p class="empty">Yayın kaydı yok.</p>'}`;
    if(m.ops) h+=`<h5 class="rp2-g1">Baskı / montaj</h5>${m.ops.length?`<div class="rp2-rows">${m.ops.map(x=>sat(x,`<span class="rp2-tarih-c">${esc(rpTr(x.tarih)||'tarihsiz')}</span><b>${esc(x.tur)}</b><span class="rp2-det">${esc([x.aciklama,x.yer].filter(Boolean).join(' · '))}</span><span class="rp2-durum">${esc(x.durum)}</span>`)).join('')}</div>`:'<p class="empty">Baskı/montaj kaydı yok.</p>'}`;
    if(m.belgeler) h+=`<h5 class="rp2-g1">Belgeler</h5>${m.belgeler.length?`<div class="rp2-rows">${m.belgeler.map(x=>sat(x,`<span class="rp2-tarih-c">${esc(rpTr(x.tarih))}</span><b>${esc(x.ad)}</b><span class="rp2-det">${esc(x.tur)}</span>`)).join('')}</div>`:'<p class="empty">Belge yok.</p>'}`;
    if(m.aksiyon) h+=`<h5 class="rp2-g1">Açık aksiyonlar</h5>${m.aksiyon.length?`<div class="rp2-rows">${m.aksiyon.map(x=>sat(x,`<span class="rp2-tarih-c">${esc(rpTr(x.tarih)||'tarihsiz')}</span><span class="rp2-det">${esc(x.metin)}${x.kim?` <em>${esc(x.kim)}</em>`:''}</span>`)).join('')}</div>`:'<p class="empty">Açık aksiyon yok.</p>'}`;
    return h;
  },
  pdf(m,a){
    const ic=[]; const o=m.ozet;
    if(!o){ ic.push({text:'Rapor için iş seçilmedi.',style:'bos'}); return {icerik:ic,o:{}}; }
    ic.push({table:{widths:['auto','*'],body:[
      [{text:'Kurum',color:RPC.ink3},{text:o.kurum||'—',bold:true}],
      ...(o.donem?[[{text:'Dönem',color:RPC.ink3},o.donem]]:[]),
      [{text:'Mevcut durum',color:RPC.ink3},{text:[{text:o.asama,bold:true},' · '+o.yasam+(o.acil?' · Acil':''),{text:`   (${o.an} itibarıyla)`,color:RPC.ink3,fontSize:8.5}]}]]},
      layout:{hLineWidth:()=>0,vLineWidth:()=>0,fillColor:()=>RPC.soft,paddingLeft:()=>8,paddingRight:()=>8,paddingTop:()=>5,paddingBottom:()=>5},margin:[0,0,0,8]});
    if(m.kisiler){
      ic.push(rpBolum('İlgili kişiler',[{b:'Ad',g:150},{b:'Rol',g:'*'},{b:'Telefon',g:90},{b:'E-posta',g:130}],m.kisiler.map(k=>[{text:k.ad,bold:true},k.rol,k.tel||'—',k.eposta||'—']),'Kayıtlı kişi yok.'));
      if(m.ekip&&m.ekip.length) ic.push({text:'Medyapark ekibi: '+m.ekip.join(', '),style:'not',margin:[0,0,0,6]}); }
    const z=m.zaman.filter(x=>x.dahil);
    if(a.guncelleme||a.hareket){
      ic.push(rpBolum('Geçmiş',[{b:'Tarih',g:62},{b:'Tür',g:62},{b:'Gelişme',g:'*'}],z.map(x=>[rpTr(x.gun),{text:x.tip==='hareket'?'Hareket':'Güncelleme',color:x.tip==='hareket'?RPC.ink3:RPC.ink},
        {stack:[{text:x.metin},...(x.kim?[{text:x.kim,style:'not'}]:[])]}]),'Seçilen geçmiş kaydı yok.')); }
    if(m.yayin){ const y=m.yayin.filter(x=>x.dahil);
      ic.push(rpBolum('Yayın / opsiyon',[{b:'Yer',g:'*'},{b:'Dönem',g:150},{b:'Durum',g:90}],y.map(x=>[x.yer,x.donem,x.durum]),'Yayın kaydı yok.')); }
    if(m.ops){ const y=m.ops.filter(x=>x.dahil);
      ic.push(rpBolum('Baskı / montaj',[{b:'Tarih',g:62},{b:'İşlem',g:90},{b:'Açıklama / yer',g:'*'},{b:'Durum',g:72}],y.map(x=>[rpTr(x.tarih)||'—',x.tur,[x.aciklama,x.yer].filter(Boolean).join(' — '),x.durum]),'Baskı/montaj kaydı yok.')); }
    if(m.belgeler){ const y=m.belgeler.filter(x=>x.dahil);
      ic.push(rpBolum('Belgeler',[{b:'Tarih',g:62},{b:'Belge',g:'*'},{b:'Tür',g:120}],y.map(x=>[rpTr(x.tarih),x.ad,x.tur]),'Belge yok.'));
      if(y.length) ic.push({text:'Belgeler bu rapora eklenmemiştir; yalnız listelenmiştir.',style:'not'}); }
    if(m.aksiyon){ const y=m.aksiyon.filter(x=>x.dahil);
      ic.push(rpBolum('Açık aksiyonlar ve sonraki adımlar',[{b:'Tarih',g:62},{b:'Aksiyon',g:'*'},{b:'İlgili',g:100}],y.map(x=>[rpTr(x.tarih)||'tarihsiz',x.metin,x.kim||'—']),'Açık aksiyon yok.')); }
    return {icerik:ic,o:{yon:'portrait'}};
  }
};
function rpIsSec(id){ const a=rpAyar('is'); a.is=id; rpDurum().baslik.is=null; rpDurum().secim.is=null;
  const b=document.getElementById('rpBaslik'); if(b){ b.value=''; }
  rpYenile('is'); }

var RPD_MECRA, RPD_BASKI, RPD_PLAN, RPD_IS;
const RPD={get mecra(){return RPD_MECRA;},get baski(){return RPD_BASKI;},get plan(){return RPD_PLAN;},get is(){return RPD_IS;}};
