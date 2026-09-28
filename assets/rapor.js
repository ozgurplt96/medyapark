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
    header:(p)=>p>1?{columns:[{width:'*',text:[{text:'MEDYA',bold:true},{text:'PARK',bold:true,color:RPC.accent},{text:'  ·  '+rpKisalt(m.baslik,kucuk?44:78),color:RPC.ink2}],noWrap:true},
        {width:'auto',text:m.tur,noWrap:true,alignment:'right',color:RPC.ink3,margin:[12,0,0,0]}],fontSize:7.5,margin:kucuk?[28,18,28,0]:[36,20,36,0]}:null,
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
/* S14: sayfa üst bilgisinde uzun başlık tek satırda, sözcük sınırında ve
   üç noktayla kısalır (önceden iki satıra taşıp yarım kesiliyordu). */
function rpKisalt(t,n){ t=String(t||''); if(t.length<=n) return t;
  const k=t.slice(0,n); const i=k.lastIndexOf(' '); return (i>n*0.6?k.slice(0,i):k).replace(/[\s,·—–-]+$/,'')+'…'; }
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
    /* S15: şablon sayfaları (doluluk tablosu, takip tablosu, döküm) kendi
       düzenini yazar — birleşik hücre, iki satırlı yüzey, bölüm başlığı. */
    if(s.ozel){ s.ozel(ws); return; }
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
  {tur:'mecra',ad:'Mecra doluluk tablosu',ikon:'media',
   ac:'Ürün başına ayrı sayfa, yüzeyler satırlarda, aylar sütunlarda: kurum ya da durum ve kesin tarih aralıkları. İç kullanım ya da dışarıya gönderim için.'},
  {tur:'baski',ad:'Baskı / montaj',ikon:'truck',
   ac:'İki hazır şablon: dönemlik baskı-montaj takip tablosu ya da tek işin kalem kalem bedel dökümü.'},
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
  if(typeof ekranBasla==='function') ekranBasla();   /* geç gelen önceki ekran bunu ezmesin (S13) */
  const R=rpDurum();
  if(preset){ R.ayar[tur]={...rpVarsayilan(tur),...preset}; R.secim[tur]=null; R.gordu[tur]=null; R.baslik[tur]=null;
    /* Eski bağlam girişi (S12): baskı raporuna iş listesiyle gelinirse tek iş seçimi olur. */
    if(tur==='baski'&&Array.isArray(preset.isler)&&preset.isler.length===1&&!preset.is) R.ayar[tur].is=+preset.isler[0]; }
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
    ${D.sade?`<div class="rp2">
      <section class="rp2-card" aria-labelledby="rpK1"><h4 id="rpK1"><span>1</span> Seçimler</h4><div id="rpKapsam"></div><div id="rpAlici"></div></section>
      <section class="rp2-card rp2-on" aria-labelledby="rpK3"><h4 id="rpK3"><span>2</span> Önizleme ve indirme</h4>
        <div class="rp2-bar" id="rpBar"></div><div id="rpNot" role="status" aria-live="polite"></div><div id="rpPrev"></div></section>
    </div>`:`<div class="rp2">
      <section class="rp2-card" aria-labelledby="rpK1"><h4 id="rpK1"><span>1</span> Kapsam</h4><div id="rpKapsam"></div></section>
      <section class="rp2-card" aria-labelledby="rpK2"><h4 id="rpK2"><span>2</span> Alıcı ve başlık</h4><div id="rpAlici"></div></section>
      <section class="rp2-card rp2-on" aria-labelledby="rpK3"><h4 id="rpK3"><span>3</span> Önizleme ve indirme</h4>
        <div class="rp2-bar" id="rpBar"></div><div id="rpNot" role="status" aria-live="polite"></div><div id="rpPrev"></div></section>
    </div>`}`;
  rpKontrolCiz(tur);
  await rpYenile(tur,{veri:true});
}
function rpKontrolCiz(tur){
  const D=RPD[tur], a=rpAyar(tur), R=rpDurum();
  const kk=document.getElementById('rpKapsam'); if(kk) kk.innerHTML=D.kontroller(a);
  const al=document.getElementById('rpAlici');
  /* S15 sade düzen: iç/dış seçimi filtrelerin içindedir; başlık otomatik
     üretilir, alıcı ve açıklama küçük, kapalı bir bölümde düzenlenir. */
  if(al&&D.sade){ al.innerHTML=`<details class="rp2-adv" ${R.metinAcik?'open':''} ontoggle="rpDurum().metinAcik=this.open"><summary>Başlık, alıcı ve açıklama <span class="muted">— isteğe bağlı</span></summary>
      <div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpBaslik">Rapor başlığı</label>
          <input class="inp" id="rpBaslik" value="${esc(R.baslik[tur]||'')}" placeholder="${esc(D.baslik(a,R.veri[tur]))}" oninput="rpMetin('${tur}')"></div>
        <div class="field"><label class="flabel" for="rpAliciAd">Alıcı</label>
          <input class="inp" id="rpAliciAd" value="${esc(a._aliciAd||'')}" placeholder="ör. ABC Ajans — Medya Planlama" oninput="rpMetin('${tur}')"></div></div>
      <div class="field"><label class="flabel" for="rpAciklama">Kısa açıklama (yalnız bu rapora ait)</label>
        <textarea class="inp" id="rpAciklama" rows="2" maxlength="600" oninput="rpMetin('${tur}')" placeholder="Rapora eklenecek bir iki cümle. Kaynak kayıtlardaki notlar değişmez.">${esc(a._aciklama||'')}</textarea></div></details>`; return; }
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
/* İç / dış seçimi (sade düzende filtrelerin içinde). Yetki kazandırmaz;
   yalnız hangi bilgilerin modele girdiğini belirler. */
function rpAliciSeg(tur,a){ return `<div class="md-seg rp2-seg sm" role="radiogroup" aria-label="Rapor kimin için">
  ${[['dis','Dış paylaşım'],['ic','İç kullanım']].map(([v,l])=>`<button type="button" role="radio" aria-checked="${a._alici===v}"
    class="${a._alici===v?'on':''}" onclick="rpAliciSec('${tur}','${v}')">${a._alici===v?'✓ ':''}${l}</button>`).join('')}</div>`; }
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
/* S13 — indirme öncesi tazelik denetimi. Önizleme açıkken kaynak kayıtlar
   (başka ekranda ya da başka kullanıcı tarafından) değişmiş olabilir.
   Dosya, önizlemenin eski verisiyle "yeni" gibi üretilmez: veri yeniden
   okunur; model içeriği önizlemeden farklıysa önizleme yenilenir, kullanıcı
   bilgilendirilir ve indirme DURDURULUR (kullanıcı yeni önizlemeyi görüp
   tekrar indirir). Aynıysa dosya bu taze veriyle üretilir. */
function rpImza(m){ const {an,tur,baslik,alici,aciklama,dis,...ic}=m||{};
  return JSON.stringify(ic,(k,v)=>v instanceof Set?[...v]:(v instanceof Date?v.toISOString():v)); }
async function rpTazeMi(tur){
  const R=rpDurum(), D=RPD[tur], a=rpAyar(tur);
  const onceki=ui._rpModel?rpImza(ui._rpModel):null;
  let veri; try{ veri=await D.veri(a); veri.okunma=new Date(); }
  catch(e){ throw new Error('Güncel veri okunamadı; dosya oluşturulmadı. '+rpHataMetni(e)); }
  const eskiVeri=R.veri[tur]; R.veri[tur]=veri;
  let m; try{ m=rpModelKur(tur); }catch(e){ R.veri[tur]=eskiVeri; throw e; }
  if(onceki!==null&&rpImza(m)!==onceki){
    rpOnizleCiz(tur);
    rpNot('Önizlemeden sonra kayıtlar değişti. Önizleme güncel veriyle yenilendi; kontrol edip yeniden indirin.','uyari');
    return false; }
  return true;
}
async function rpIndirPdf(tur){
  if(_rpIndiriliyor) return; _rpIndiriliyor=true;
  const b=document.getElementById('rpPdfB'); if(b){ b.disabled=true; b.textContent='Hazırlanıyor…'; }
  try{
    if(!(await rpTazeMi(tur))) return;
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
    if(!(await rpTazeMi(tur))) return;
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
   ŞABLON RENKLERİ — Excel, PDF ve önizleme AYNI tonları kullanır
   (S15). Elle tutulan rezervasyon tablolarındaki okuma alışkanlığı:
   boş yeşil, dolu kırmızı, opsiyon turuncu. Tonlar açık, yazı koyu;
   renk tek taşıyıcı değildir — her hücrede durum ya da kurum yazılıdır.
   ========================================================== */
const RP_DR={
  yayin:  {ad:'Dolu',      fill:'#F4C4BE', ink:'#7F1A10', bar:'#D24A3C'},
  opsiyon:{ad:'Opsiyon',   fill:'#FAD6A0', ink:'#6E3D00', bar:'#E38B12'},
  musait: {ad:'Müsait',    fill:'#CBEAD2', ink:'#155A2A', bar:'#3AA35A'},
  disi:   {ad:'Dönem dışı',fill:'#E4E4E8', ink:'#5E5E64', bar:'#BDBDC3'}};
const rpArgb=h=>'FF'+String(h).replace('#','').toUpperCase();
const RP_XBORDER={style:'thin',color:{argb:'FFB8B8BF'}};
const rpXKenar=()=>({top:RP_XBORDER,left:RP_XBORDER,bottom:RP_XBORDER,right:RP_XBORDER});
/* Dönem gösterimi: aynı yılda "05.07–05.10.2026", yıl geçişinde iki tam tarih. */
function rpAralik(s,e){ if(!s) return ''; if(!e) return rpTr(s)+' – ?'; if(s===e) return rpTr(s);
  return s.slice(0,4)===e.slice(0,4)?`${rpTrKisa(s)}–${rpTr(e)}`:`${rpTr(s)}–${rpTr(e)}`; }
/* Excel sayfa adı: 31 karakter, yasak karakter yok, benzersiz. */
function rpSayfaAdi(t,kull){
  const s=String(t||'').replace(/\s*\/\s*/g,'-').replace(/[\[\]:*?\/\\]/g,'-').replace(/\s+/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'Sayfa';
  let x=s,i=2; while(kull.has(x.toLocaleLowerCase('tr'))){ const ek=` (${i++})`; x=s.slice(0,31-ek.length)+ek; }
  kull.add(x.toLocaleLowerCase('tr')); return x; }
/* Kısa kurum adı (elle tutulan tablolardaki "WORK LOUNGE", "EKİM KOLEJİ"
   gibi): tüzel ekler atılır, sözcük sınırında en çok `max` karakter;
   yarım kalan bağlaç ("… VE") ve üç nokta bırakılmaz. Kimlik verisine
   dokunmaz, yalnız gösterimdir. */
function rpKisaAd(ad,max){ const w=orgKisa(ad||'',120).replace(/…$/,'').split(/\s+/).filter(Boolean); let o='';
  for(const x of w){ if(o&&(o+' '+x).length>max) break; o=o?o+' '+x:x; }
  return o.replace(/\s+(ve|VE|Ve|&|-|İLE|ile)$/,''); }
const rpMecraKisa=ad=>{ const w=String(ad||'').trim().split(/\s+/).filter(Boolean); return w.length<=2?w.join(' '):w[0]; };
/* Oranlı renk dilimi → CSS / Excel geçiş durakları (keskin sınır). */
function rpDurak(dilim){ const top=dilim.reduce((t,d)=>t+d.gun,0)||1; let x=0; const out=[];
  dilim.forEach(d=>{ const a=x/top; x+=d.gun; const b=x/top; out.push({tip:d.tip,a,b}); }); return out; }
/* Hücre iki biçimde çizilir (Excel, PDF ve önizleme AYNI kural):
   · TEK durumlu ay  → durum rengiyle dolu; üstte kurum/durum, altta tarih
   · AY İÇİNDE DEĞİŞEN → nötr zemin; her dilim kendi renk işaretiyle
     alt alta ("Müsait · 01.09–04.09", sonra kurum + tarih). Önizleme ve
     PDF'te üstte günlere oranlı ince bir şerit de vardır. */
const rpTekDurum=hc=>hc.dilim.length===1;
function rpDilimSatir(pc){ return pc.tip==='musait'?[{t:pc.alt?`Müsait · ${pc.alt}`:'Müsait',b:true}]:[{t:pc.ust,b:true},...(pc.alt?[{t:pc.alt,b:false}]:[])]; }
const rpCssSerit=h=>`linear-gradient(90deg,${rpDurak(h.dilim).map(d=>`${RP_DR[d.tip].bar} ${(d.a*100).toFixed(2)}% ${(d.b*100).toFixed(2)}%`).join(',')}) top/100% 5px no-repeat,#fff`;

/* ==========================================================
   1) MECRA DOLULUK TABLOSU (S15)
   Referans: elle tutulan "M1 ADANA AVM PANOLAR REZ. LİSTESİ" — ürün
   ailesi başına ayrı sayfa, yüzey kodları solda (A/B arka arkaya),
   seçilen dönemin ayları sütunlarda, her yüzey İKİ satır: üstte kurum
   ya da durum, altta kesin tarih aralığı.

   Hesap Mecralar ekranıyla AYNI kurallar (değişmedi):
     · iptal edilen kayıt bloklamaz; opsiyon ve yayın bloklar
     · süresi dolmuş ama iptal edilmemiş opsiyon bloklamaya DEVAM eder
     · bitişi bilinmeyen kayıt dönem sonuna kadar bloklar
     · A/B yüzleri bağımsız
     · gün düzeyinde tarama: ardışık yenileme sahte boşluk üretmez
   Yeni olan yalnız GÖSTERİM:
     · ayın bir kısmı doluysa ay ne "dolu" ne "müsait" gösterilir —
       hücrede her dilim kendi durumu ve tarihiyle yazılır; renk günlere
       göre bölünür
     · seçilen başlangıç/bitiş dışındaki günler "dönem dışı"dır, müsait
       sayılmaz (ay başlığı "Eki 2026 (15–31)")
     · dış paylaşımda kurum adı MODELE HİÇ GİRMEZ; aynı yerleşimde
       Dolu / Opsiyon / Müsait ve tarihler yazılır
   ========================================================== */
function rpYuzAyir(name){ const t=String(name||'').trim(); const m=t.match(/^(.*[^\s._-])[\s._-]*([ABab])$/);
  return m?{base:m[1],yuz:m[2].toUpperCase()}:{base:t,yuz:''}; }
function rpMecraKapsam(M,a){
  const siteler=(a.siteler&&a.siteler.length?a.siteler.map(id=>M.mecById[id]):M.mecs).filter(x=>x&&mdKapsamda(x))
    .sort((x,y)=>(x.sort||0)-(y.sort||0)||x.id-y.id);
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
        if(u.active===false){ pasif++; return; }
        yuzler.push({key:'u'+u.id,u,al,m,kod:u.name,pano:p.base,yuz:p.yuz,aile:al._sahte?'Diğer pozisyonlar':mdAile(M,al),
          olcu:u.olcu||((M.prods.find(x=>String(x.id)===String(u.product_id||al.product_id))||{}).olcu)||''});
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
function rpAyListe(b,e){ const out=[]; let y=+b.slice(0,4), mo=+b.slice(5,7);
  while(`${y}-${rp2(mo)}`<=e.slice(0,7)){ out.push(`${y}-${rp2(mo)}`); mo++; if(mo>12){mo=1;y++;} } return out; }
/* Seçilen dönemin ayları: kısmi ilk/son ay açıkça işaretlenir. */
function rpDonemAylari(b,e){
  return rpAyListe(b,e).map(ym=>{ const y=+ym.slice(0,4), mo=+ym.slice(5,7);
    const ayB=ym+'-01', ayE=_cIso(new Date(y,mo,0)); const s=ayB<b?b:ayB, x=ayE>e?e:ayE;
    const tam=s===ayB&&x===ayE;
    return {ym,ayB,ayE,s,e:x,tam,once:rpDn(s)-rpDn(ayB),sonra:rpDn(ayE)-rpDn(x),
      ad:`${RP_AYLAR[mo-1]} ${y}`+(tam?'':` (${+s.slice(8)}–${+x.slice(8)})`),
      kisa:`${RP_AY3[mo-1]} ${y}`+(tam?'':` (${+s.slice(8)}–${+x.slice(8)})`)}; });
}
/* Bir yüzün bir aydaki hücresi. `parca` metin satırları, `dilim` renk oranı. */
function rpDolHucre(seg,ay){
  const parca=seg.filter(s=>s.s<=ay.e&&s.e>=ay.s).map(s=>{
    const s0=s.s<ay.s?ay.s:s.s, e0=s.e>ay.e?ay.e:s.e;
    const ayTamami=s0===ay.s&&e0===ay.e;
    let ust, alt;
    if(s.tip==='musait'){ ust='Müsait'; alt=ayTamami&&ay.tam?'':`${rpTrKisa(s0)}–${rpTrKisa(e0)}`; }
    else {
      ust=s.kim?(s.tip==='opsiyon'?'Opsiyon · '+s.kim:s.kim):RP_DR[s.tip].ad;
      alt=s.aylik?`${RP_AY3[+s.ks.slice(5,7)-1]} ${s.ks.slice(0,4)} · ay bazlı kayıt`
        :s.ke==null?`${rpTr(s.ks)} – bitiş belirsiz`:rpAralik(s.ks,s.ke);
      if(s.opsSure) alt+=' · opsiyon süresi doldu';
    }
    return {tip:s.tip,s:s0,e:e0,gun:rpDn(e0)-rpDn(s0)+1,ust,alt};
  });
  const dilim=[...(ay.once?[{tip:'disi',gun:ay.once}]:[]),...parca.map(p=>({tip:p.tip,gun:p.gun})),...(ay.sonra?[{tip:'disi',gun:ay.sonra}]:[])];
  const tipler=[...new Set(parca.map(p=>p.tip))];
  return {parca,dilim,tip:tipler.length===1?tipler[0]:'karma'};
}
RPD_MECRA={
  sade:true,
  amac:'Seçilen dönemde her yüzeyin ay ay durumu: kurum ya da durum ve kesin tarihler. Hesap Mecralar ekranıyla aynıdır.',
  presetNot:'Dış paylaşımda kurum adları yazılmaz; aynı yerleşimde Dolu / Opsiyon / Müsait ve tarihler görünür.',
  varsayilan(){ const d=mdGun(rpBugun());
    return {siteler:[],urun:'',bas:_cIso(new Date(d.getFullYear(),d.getMonth(),1)),
      bit:_cIso(new Date(d.getFullYear(),d.getMonth()+6,0)),tamMusait:false}; },
  preset(){ return {}; },
  alici:'dis',
  veriAnahtar:()=>'mecra',
  async veri(){ const M=await mdYukle(); return {M}; },
  veriSonra(a,v){ if(!a.siteler.length) a.siteler=v.M.mecs.filter(mdKapsamda).map(m=>m.id); },
  kontrolVeriyle:true,
  baslik(a,v){ const M=v&&v.M; const s=(a.siteler||[]).length===1&&M?M.mecById[a.siteler[0]]:null;
    return 'Doluluk tablosu'+(s?' — '+s.name:''); },
  dosya(m){ return 'Doluluk_Tablosu'+(m.tekMecra?'_'+m.tekMecra:''); },
  kontroller(a){
    const v=(rpDurum().veri||{}).mecra, M=v&&v.M, T='mecra';
    const siteler=M?M.mecs.filter(mdKapsamda).sort((x,y)=>(x.sort||0)-(y.sort||0)):[];
    const urunler=M?[...new Map(M.alts.filter(x=>!mdArsiv(x)&&a.siteler.includes(x.mecra_id)&&x.product_id!=null)
      .map(x=>[String(x.product_id),M.pm[x.product_id]||x.name])).entries()].sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr')):[];
    const hizli=[[3,'3 ay'],[6,'6 ay'],[12,'12 ay']];
    return `<div class="rp3-f">
      <div class="field"><span class="flabel">Dönem</span>${rpTarihKontrol(T,a,'bas','bit')}
        <div class="rp3-hizli" role="group" aria-label="Hızlı dönem">${hizli.map(([n,l])=>`<button type="button" class="btn-link" onclick="rpMecraDonem(${n})">Bu aydan ${l}</button>`).join('')}
          <button type="button" class="btn-link" onclick="rpMecraDonem('yil')">Bu yıl</button></div></div>
      <div class="field"><span class="flabel">Mecra</span><div class="rp2-chips">${siteler.map(s=>`<label class="rp2-chk">
          <input type="checkbox" ${a.siteler.includes(s.id)?'checked':''} onchange="rpSiteSec(${s.id},this.checked)"> <span>${esc(s.name)}</span></label>`).join('')||'<span class="muted">Yükleniyor…</span>'}</div></div>
      <div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpUrun">Ürün</label><select class="inp ${a.urun?'inp-on':''}" id="rpUrun" onchange="rpSet('mecra','urun',this.value,true)">
          <option value="">Tüm ürünler</option>${urunler.map(([id,ad])=>`<option value="${esc(id)}" ${String(a.urun)===id?'selected':''}>${esc(ad)}</option>`).join('')}</select></div>
        <div class="field"><span class="flabel">Kimin için</span>${rpAliciSeg(T,a)}</div></div>
      ${rpChk(T,'tamMusait',a.tamMusait,'Yalnız dönemin tamamında müsait yüzeyler')}
    </div>`;
  },
  model(a,v){
    const M=v.M, T='mecra', ic=a._alici==='ic';
    const hata=rpDonemDogrula(a.bas,a.bit,740);
    const out={bas:a.bas,bit:a.bit,ic,aylar:[],sayfalar:[],led:[],uyari:[],hata,
      bilgi:[['Dönem',a.bas&&a.bit?`${rpTr(a.bas)} – ${rpTr(a.bit)}`:'']]};
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'yüz'}; return out; }
    const ref=rpBugun();
    const K=rpMecraKapsam(M,a);
    out.aylar=rpDonemAylari(a.bas,a.bit);
    /* Kurum etiketi YALNIZ iç kullanımda kurulur; dış modelde yoktur. */
    /* Kısa etiket (elle tutulan tablodaki "WORK LOUNGE", "EKİM KOLEJİ"
       gibi): tüzel ekler atılır, sözcük sınırında en çok 22 karakter,
       yarım kalan bağlaç ("… VE") ve üç nokta bırakılmaz. */
    const kisa=t=>rpKisaAd(t,22);
    const kim=r=>{ if(!ic||!r) return null;
      if(r.customer_id&&M.cmap[r.customer_id]) return kisa(M.cmap[r.customer_id]);
      if(r.work_id&&M.jmap[r.work_id]) return kisa(M.jmap[r.work_id].title||'');
      return null; };
    const gorunen=new Set();
    let yuzler=K.yuzler.map(y=>{
      const seg=rpYuzSerit(M,y.u,a.bas,a.bit,ref).map(s=>({s:s.s,e:s.e,gun:s.gun,tip:s.tip,acikUc:s.acikUc,aylik:s.aylik,
        opsSure:ic&&s.opsSure,ks:s.r?s.r.block_start:null,ke:s.r?s.r.block_end:null,kim:kim(s.r)}));
      const bos=seg.filter(s=>s.tip==='musait').map(s=>({s:s.s,e:s.e,gun:s.gun}));
      return {...y,seg,bos,tam:seg.length===1&&seg[0].tip==='musait'};
    });
    if(a.tamMusait) yuzler=yuzler.filter(y=>y.tam);
    yuzler.forEach(y=>gorunen.add(y.key));
    /* LED — eşzamanlı yayın; statik müsaitliğe ve yüz sayısına katılmaz. */
    const ledSatir=[];
    if(!a.tamMusait) K.led.forEach(({m,al})=>{
      (M.byArea[al.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=a.bit&&(r.block_end==null||r.block_end>=a.bas))
        .sort((x,y)=>String(x.block_start).localeCompare(String(y.block_start)))
        .forEach(r=>{ const key='l'+mdKayitKey(r); gorunen.add(key);
          ledSatir.push({key,alan:`${m.name} · ${al.name}`,sure:mdSure(al)||'',tip:r.commitment==='confirmed'?'yayin':'opsiyon',
            bas:r.block_start,bit:r.block_end,kim:kim(r)||''}); }); });
    out.budanan=rpBuda(T,gorunen);
    /* Lokasyon + ürün ailesi = bir sayfa; pano = A/B çifti. */
    const gm=new Map(), kull=new Set();
    yuzler.forEach(y=>{ const k=y.m.id+'|'+y.al.id; if(!gm.has(k)) gm.set(k,{m:y.m,al:y.al,aile:y.aile,ys:[]}); gm.get(k).ys.push(y); });
    const dogal=(x,y)=>String(x).localeCompare(String(y),'tr',{numeric:true});
    out.sayfalar=[...gm.values()].map(g=>{
      const pm=new Map(); g.ys.sort((x,y)=>dogal(x.pano,y.pano)||dogal(x.yuz,y.yuz)).forEach(y=>{ if(!pm.has(y.pano)) pm.set(y.pano,[]); pm.get(y.pano).push(y); });
      let no=0;
      const panolar=[...pm.entries()].map(([pano,ys])=>{ const yz=ys.map(y=>({key:y.key,kod:y.kod,yuz:y.yuz,dahil:rpDahil(T,y.key),
          seg:y.seg,bos:y.bos,tam:y.tam,hucre:out.aylar.map(ay=>rpDolHucre(y.seg,ay))}));
        const dahil=yz.some(f=>f.dahil); return {pano,no:dahil?++no:null,dahil,yuzler:yz}; });
      const olculer=[...new Set(g.ys.map(y=>y.olcu).filter(Boolean))];
      return {key:g.m.id+'|'+g.al.id,mecra:g.m.name,aile:g.aile,baslik:`${g.m.name} · ${g.aile}`,
        ad:rpSayfaAdi(`${rpMecraKisa(g.m.name)} ${g.aile}`,kull),olcu:olculer.length===1?olculer[0]:'',panolar};
    });
    out.led=ledSatir.map(l=>({...l,dahil:rpDahil(T,l.key)}));
    if(out.led.length) out.ledAd=rpSayfaAdi('LED yayınları',kull);
    const dahilY=yuzler.filter(y=>rpDahil(T,y.key)), dahilL=out.led.filter(l=>l.dahil);
    out.dahilYuzSay=dahilY.length; out.dahilLedSay=dahilL.length; out.pasif=K.pasif; out.toplamYuz=K.yuzler.length;
    out.tamMusait=!!a.tamMusait;
    const lk=[...new Set(dahilY.map(y=>y.m.name).concat(dahilL.map(l=>l.alan.split(' · ')[0])))];
    if(lk.length) out.bilgi.push(['Mecra',lk.join(', ')]);
    if(a.urun) out.bilgi.push(['Ürün',M.pm[a.urun]||'']);
    if(a.tamMusait) out.bilgi.push(['Kapsam','Yalnız dönemin tamamında müsait yüzeyler']);
    if((a.siteler||[]).length===1&&M.mecById[a.siteler[0]]) out.tekMecra=rpMecraKisa(M.mecById[a.siteler[0]].name);
    out.say={dahil:dahilY.length+dahilL.length,filtre:yuzler.length+ledSatir.length,cik:(yuzler.length+ledSatir.length)-(dahilY.length+dahilL.length),
      birim:ledSatir.length?'kayıt (yüz + LED kampanyası)':'yüz'};
    if(!K.yuzler.length&&!K.led.length) out.uyari.push('Seçilen kapsamda yüzey yok.');
    else if(a.tamMusait&&!yuzler.length) out.uyari.push('Bu dönemin tamamında müsait yüzey yok.');
    return out;
  },
  onizle(m){
    const T='mecra'; if(m.hata) return '';
    let h=`<div class="rp3-lej" aria-label="Renk anahtarı">${['yayin','opsiyon','musait','disi'].map(t=>`<span><i style="background:${RP_DR[t].fill}"></i>${RP_DR[t].ad}</span>`).join('')}
      <em>Ay içinde durum değişiyorsa hücre beyaz kalır; her dilim kendi rengi ve tarihiyle alt alta yazılır, üstteki şerit günlere göre bölünür.</em></div>`;
    if(!m.sayfalar.length&&!m.led.length) return h+`<p class="empty">Listelenecek yüzey yok.</p>`;
    m.sayfalar.forEach(sf=>{ const keys=sf.panolar.flatMap(p=>p.yuzler.map(f=>f.key));
      h+=`<div class="rp3-sh"><h5 class="rp2-g1">${esc(sf.baslik)}${sf.olcu?` <em>${esc(sf.olcu)}</em>`:''} <span class="rp3-sa">Excel sayfası: ${esc(sf.ad)}</span></h5>
        <span class="rp3-tum"><button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},true)'>tümü</button>
        <button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},false)'>hiçbiri</button></span></div>
        <div class="rp3-kap"><table class="rp3-tab rp3-dol"><thead><tr><th scope="col">No</th><th scope="col">Yüz</th>${m.aylar.map(a=>`<th scope="col">${esc(a.kisa)}</th>`).join('')}</tr></thead><tbody>
        ${sf.panolar.map(p=>p.yuzler.map((f,i)=>`<tr class="${f.dahil?'':'dis'}${i===p.yuzler.length-1?' son':''}">
          ${i===0?`<td class="rp3-no" rowspan="${p.yuzler.length}">${p.no||''}</td>`:''}
          <td class="rp3-yuz"><label>${rpCb(T,f.key,f.dahil,f.kod+' rapora dahil')} <b>${esc(f.kod)}</b></label></td>
          ${f.hucre.map(hc=>rpTekDurum(hc)?`<td style="background:${RP_DR[hc.dilim[0].tip].fill}">${hc.parca.map(pc=>`<div class="rp3-p" style="color:${RP_DR[pc.tip].ink}"><b>${esc(pc.ust)}</b>${pc.alt?`<small>${esc(pc.alt)}</small>`:''}</div>`).join('')}</td>`
            :`<td class="rp3-karma" style="background:${rpCssSerit(hc)}">${hc.parca.map(pc=>`<div class="rp3-p rp3-dp" style="color:${RP_DR[pc.tip].ink}"><i style="background:${RP_DR[pc.tip].bar}"></i><span>${rpDilimSatir(pc).map(x=>x.b?`<b>${esc(x.t)}</b>`:`<small>${esc(x.t)}</small>`).join('')}</span></div>`).join('')}</td>`).join('')}
        </tr>`).join('')).join('')}</tbody></table></div>`; });
    if(m.led.length){ h+=`<div class="rp3-sh"><h5 class="rp2-g1">LED yayınları <span class="rp3-sa">Excel sayfası: ${esc(m.ledAd)}</span></h5></div>
      <p class="fhint">LED eşzamanlı yayındır: kampanya sayısı boş kapasite ya da doluluk göstermez; statik müsaitliğe katılmaz.</p>
      <div class="rp2-rows">${m.led.map(l=>`<label class="rp2-row ${l.dahil?'':'dis'}">${rpCb(T,l.key,l.dahil,'LED kampanyası rapora dahil')}
        <b>${esc(l.alan)}</b><span class="rp2-t ${l.tip}">${l.tip==='yayin'?'Yayın':'Opsiyon'}</span> <span>${esc(rpAralik(l.bas,l.bit))}</span>
        <span class="rp2-det">${esc(l.kim)}</span></label>`).join('')}</div>`; }
    return h;
  },
  pdf(m){
    const ic=[];
    ic.push({text:['yayin','opsiyon','musait','disi'].flatMap(t=>[{text:'  '+RP_DR[t].ad+'  ',background:RP_DR[t].fill,color:RP_DR[t].ink,bold:true},'   '])
      .concat([{text:'Ay içinde durum değişiyorsa hücre beyaz kalır; dilimler alt alta, üstteki şerit günlere göre.',color:RPC.ink3}]),fontSize:8.5,margin:[0,0,0,8]});
    const say=m.sayfalar.reduce((t,s)=>t+s.panolar.reduce((x,p)=>x+p.yuzler.filter(f=>f.dahil).length,0),0);
    if(!say&&!m.led.some(l=>l.dahil)) ic.push({text:'Listelenecek yüzey yok.',style:'bos'});
    const W=770, noW=20, yuzW=46, LH=10.2, FS=8.3;
    const blok=[]; for(let i=0;i<m.aylar.length;i+=6) blok.push(m.aylar.slice(i,i+6).map((a,k)=>({a,i:i+k})));
    /* Yüz hücreleri A ve B için tüm ay sütunlarında AYNI yükseklikte tutulur
       (iç tablo `heights`), böylece bir pano tek tablo satırında kalır ve
       A/B çifti sayfa sonunda bölünmez. Yükseklik metin uzunluğundan tahmin edilir. */
    const satirSay=(t,kap)=>t?Math.max(1,Math.ceil(String(t).length/kap)):0;
    m.sayfalar.forEach(sf=>{ const panolar=sf.panolar.map(p=>({...p,yuzler:p.yuzler.filter(f=>f.dahil)})).filter(p=>p.yuzler.length);
      if(!panolar.length) return;
      blok.forEach((ay,bi)=>{
        const colW=Math.floor((W-noW-yuzW)/ay.length), kap=Math.floor((colW-8)/(FS*0.58));
        const hucreSatir=hc=>rpTekDurum(hc)?hc.parca.reduce((t,p)=>t+satirSay(p.ust,kap)+satirSay(p.alt,kap),0)
          :0.6+hc.parca.reduce((t,p)=>t+rpDilimSatir(p).reduce((x,l)=>x+satirSay(l.t,kap-2),0),0);
        const yuk=f=>Math.max(2,...ay.map(({i})=>hucreSatir(f.hucre[i])))*LH+6;
        const govde=panolar.map(p=>{ const hs=p.yuzler.map(yuk);
          const icT=(icerik,fill)=>({table:{widths:['*'],heights:hs,body:icerik.map((c,k)=>[{...c,fillColor:fill?fill(k):null}])},
            layout:{hLineWidth:(i,n)=>i>0&&i<n.table.body.length?0.5:0,vLineWidth:()=>0,hLineColor:()=>'#9c9ca3',
              paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>2,paddingBottom:()=>2}});
          const sonFill=i=>{ const hc=p.yuzler[p.yuzler.length-1].hucre[i]; return rpTekDurum(hc)?RP_DR[hc.dilim[0].tip].fill:'#ffffff'; };
          return [{text:String(p.no),alignment:'center',bold:true,margin:[0,4,0,0]},
            icT(p.yuzler.map(f=>({text:f.kod,bold:true}))),
            ...ay.map(({i})=>({...icT(p.yuzler.map(f=>{ const hc=f.hucre[i];
                if(rpTekDurum(hc)) return {stack:hc.parca.flatMap(pc=>[{text:pc.ust,bold:true,color:RP_DR[pc.tip].ink,fontSize:FS},
                  ...(pc.alt?[{text:pc.alt,color:RP_DR[pc.tip].ink,fontSize:FS-0.7}]:[])])};
                const w=colW-8;
                return {stack:[{canvas:rpDurak(hc.dilim).map(d=>({type:'rect',x:d.a*w,y:0,w:Math.max(0.6,(d.b-d.a)*w),h:3.2,color:RP_DR[d.tip].bar})),margin:[0,0,0,2]},
                  ...hc.parca.flatMap(pc=>rpDilimSatir(pc).map((l,k)=>({columns:[{width:6,canvas:k===0?[{type:'rect',x:0,y:2.4,w:4,h:4.5,color:RP_DR[pc.tip].bar}]:[]},
                    {text:l.t,bold:l.b,color:RP_DR[pc.tip].ink,fontSize:l.b?FS:FS-0.7}],columnGap:2})))]}; }),
              k=>{ const hc=p.yuzler[k].hucre[i]; return rpTekDurum(hc)?RP_DR[hc.dilim[0].tip].fill:'#ffffff'; }),fillColor:sonFill(i)}))];
        });
        const bos=n=>Array(n).fill({});
        const kenarsiz={border:[false,false,false,false]};
        const bas=[{text:sf.baslik+(bi?'  ·  devam':''),colSpan:2+ay.length,style:'h2',margin:[0,4,0,0],...kenarsiz},...bos(1+ay.length)];
        const alt=[{text:(sf.olcu?sf.olcu+'  ·  ':'')+`${ay[0].a.ad} – ${ay[ay.length-1].a.ad}`,colSpan:2+ay.length,style:'not',margin:[0,0,0,3],...kenarsiz},...bos(1+ay.length)];
        ic.push({table:{headerRows:3,dontBreakRows:true,keepWithHeaderRows:1,widths:[noW,yuzW,...ay.map(()=>colW)],
          body:[bas,alt,[{text:'No',style:'th',alignment:'center'},{text:'Yüz',style:'th'},...ay.map(({a})=>({text:a.ad,style:'th',alignment:'center'}))],...govde]},
          layout:{hLineWidth:(i,n)=>i<2?0:(i===2||i===3||i===n.table.body.length?0.9:0.6),vLineWidth:()=>0.4,
            hLineColor:()=>'#8e8e95',vLineColor:()=>'#b8b8bf',fillColor:i=>i===2?'#FFE699':null,
            paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0},margin:[0,0,0,10]});
      }); });
    const led=m.led.filter(l=>l.dahil);
    if(led.length) ic.push(rpTablo([{b:'Yayın alanı',g:'*'},{b:'Durum',g:60},{b:'Dönem',g:150},...(m.ic?[{b:'Kurum',g:160}]:[]),{b:'Kreatif süre',g:60}],
      led.map(l=>[l.alan,{text:l.tip==='yayin'?'Yayın':'Opsiyon',color:RP_DR[l.tip].ink,bold:true},rpAralik(l.bas,l.bit),...(m.ic?[l.kim||'—']:[]),l.sure||'—']),
      {ust:[{text:'LED yayınları',stil:'h2'},{text:'LED eşzamanlı yayındır; kampanya sayısı boş kapasite göstermez ve statik müsaitliğe katılmaz.',stil:'not'}]}));
    return {icerik:ic,o:{yon:'landscape'}};
  },
  xlsx(m){
    const S=[];
    m.sayfalar.forEach(sf=>{ const panolar=sf.panolar.map(p=>({...p,yuzler:p.yuzler.filter(f=>f.dahil)})).filter(p=>p.yuzler.length);
      if(panolar.length) S.push({ad:sf.ad,yon:'landscape',ozel:ws=>rpXlsDoluluk(ws,m,sf,panolar)}); });
    const led=m.led.filter(l=>l.dahil);
    if(led.length) S.push({ad:m.ledAd,yon:'landscape',kol:[{b:'Yayın alanı',w:36,sar:true},{b:'Durum',w:10},{b:'Başlangıç',w:12,tip:'tarih'},{b:'Bitiş',w:12,tip:'tarih'},
        ...(m.ic?[{b:'Kurum',w:30,sar:true}]:[]),{b:'Kreatif süre',w:11}],
      satir:led.map(l=>[l.alan,l.tip==='yayin'?'Yayın':'Opsiyon',l.bas,l.bit,...(m.ic?[l.kim]:[]),l.sure]),
      not:'LED eşzamanlı yayındır; kampanya sayısı boş kapasite göstermez ve statik müsaitliğe katılmaz. Bitiş boşsa bitiş belirsizdir.'});
    return S;
  },
  pdfVar:true
};
/* Excel doluluk sayfası — referans rezervasyon tablosunun düzeni:
   yüz başına iki satır (üstte kurum/durum, altta tarih), aylar sütunda.
   Ay içinde değişen hücre iki satır boyunca BİRLEŞİR ve dilimleri renk
   işaretiyle alt alta taşır (keskin geçişli dolgu Excel baskısında
   çizgili göründüğü için kullanılmaz). */
function rpXlsDoluluk(ws,m,sf,panolar){
  const ay=m.aylar, F='Arial', H=5, son=2+ay.length, GEN=24;
  ws.getColumn(1).width=5; ws.getColumn(2).width=10; ay.forEach((_,i)=>{ ws.getColumn(3+i).width=GEN; });
  const c1=ws.getCell(1,1); c1.value=`${sf.baslik} — doluluk tablosu`; c1.font={name:F,bold:true,size:14};
  const bilgi=[`Dönem: ${rpTr(m.bas)} – ${rpTr(m.bit)}`,sf.olcu?`Ölçü: ${sf.olcu}`:'',m.ic?'İç kullanım':'Dış paylaşım',
    m.alici?`Hazırlanan: ${m.alici}`:'',`Hazırlanma: ${rpAnTr(m.an)}`].filter(Boolean).join('   ·   ');
  const c2=ws.getCell(2,1); c2.value=bilgi; c2.font={name:F,size:9,color:{argb:'FF55555B'}};
  const lej=[...['yayin','opsiyon','musait','disi'].map(t=>[RP_DR[t].ad,RP_DR[t].fill,RP_DR[t].ink]),['Ay içinde değişim: dilimler alt alta','#FFFFFF','#55555B']];
  lej.forEach(([t,f,k],i)=>{ const c=ws.getCell(3,3+i); c.value=t;
    c.fill={type:'pattern',pattern:'solid',fgColor:{argb:rpArgb(f)}}; c.font={name:F,bold:i<4,size:9,color:{argb:rpArgb(k)}};
    c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border=rpXKenar(); });
  ws.getRow(3).height=26;
  if(m.aciklama){ const c=ws.getCell(4,1); c.value=m.aciklama; c.font={name:F,size:9}; }
  const hr=ws.getRow(H); hr.height=30;
  [['No',1],['Yüz',2],...ay.map((a,i)=>[a.ad,3+i])].forEach(([t,k])=>{ const c=hr.getCell(k); c.value=t;
    c.font={name:F,bold:true,size:10}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE699'}};
    c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border=rpXKenar(); });
  const kalin={style:'medium',color:{argb:'FF6E6E75'}};
  /* Satır sayısı tahmini (Arial 10 kalın ≈ sütun genişliği × 0,85 karakter). */
  const kap=Math.floor(GEN*0.85), sat=t=>t?Math.max(1,Math.ceil(String(t).length/kap)):0;
  const renk=tip=>({argb:rpArgb(RP_DR[tip].ink)});
  let r=H+1;
  /* Elle sayfa sonu: pano (A/B çifti ve birleşik hücreler) iki sayfaya
     bölünmez. Ölçek, sütun genişliğinden ve fitToWidth'ten tahmin edilir. */
  const sayfaGen=Math.max(1,Math.ceil(ay.length/6));
  const genPt=[5,10,...ay.map(()=>GEN)].reduce((t,w)=>t+(w*7+5)*0.75,0);
  const olcek=Math.min(1,(842-0.8*72)*sayfaGen/genPt*0.92);
  const sayfaYuk=(595-72-24)/olcek;
  let dolu=[1,2,3,4,H].reduce((t,k)=>t+(ws.getRow(k).height||15),0);
  panolar.forEach(p=>{ const r0=r;
    p.yuzler.forEach(f=>{
      const kod=ws.getCell(r,2); kod.value=f.kod; kod.font={name:F,bold:true,size:10};
      ws.mergeCells(r,2,r+1,2);
      let h1=18, h2=15, hTop=0;
      ay.forEach((a,i)=>{ const hc=f.hucre[i]; const u=ws.getCell(r,3+i), t=ws.getCell(r+1,3+i);
        if(rpTekDurum(hc)){
          const tip=hc.dilim[0].tip, pc=hc.parca[0]||{tip,ust:RP_DR[tip].ad,alt:''};
          const dolgu={type:'pattern',pattern:'solid',fgColor:{argb:rpArgb(RP_DR[tip].fill)}};
          u.value=hc.parca.map(x=>x.ust).join('\n')||pc.ust; t.value=hc.parca.map(x=>x.alt).filter(Boolean).join('\n')||null;
          u.font={name:F,bold:true,size:10,color:renk(pc.tip)}; t.font={name:F,size:8.5,color:renk(pc.tip)};
          [u,t].forEach(c=>{ c.fill=dolgu; c.alignment={horizontal:'center',vertical:c===u?'bottom':'top',wrapText:true};
            c.border={left:RP_XBORDER,right:RP_XBORDER,top:c===u?RP_XBORDER:undefined,bottom:c===t?RP_XBORDER:undefined}; });
          h1=Math.max(h1,hc.parca.reduce((x,q)=>x+sat(q.ust),0)*13+5); h2=Math.max(h2,hc.parca.reduce((x,q)=>x+sat(q.alt),0)*11.5+4);
        } else {
          const runs=[]; let n=0;
          hc.parca.forEach(pc=>{ rpDilimSatir(pc).forEach((l,j)=>{
            if(j===0) runs.push({text:(runs.length?'\n':'')+'■ ',font:{name:F,size:10,color:{argb:rpArgb(RP_DR[pc.tip].bar)}}});
            else runs.push({text:'\n    ',font:{name:F,size:8.5}});
            runs.push({text:l.t,font:{name:F,bold:l.b,size:l.b?9.5:8.5,color:renk(pc.tip)}}); n+=sat('■ '+l.t); }); });
          u.value={richText:runs}; ws.mergeCells(r,3+i,r+1,3+i);
          u.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFFFFF'}};
          u.alignment={horizontal:'left',vertical:'middle',wrapText:true,indent:1}; u.border=rpXKenar();
          hTop=Math.max(hTop,n*12.5+6);
        }
      });
      if(h1+h2<hTop) h2+=hTop-(h1+h2);
      ws.getRow(r).height=h1; ws.getRow(r+1).height=h2;
      [ws.getCell(r,2),ws.getCell(r+1,2)].forEach(c=>{ c.alignment={horizontal:'center',vertical:'middle'}; c.border=rpXKenar(); });
      r+=2; });
    const no=ws.getCell(r0,1); no.value=p.no; no.font={name:F,bold:true,size:10};
    if(r-1>r0) ws.mergeCells(r0,1,r-1,1);
    no.alignment={horizontal:'center',vertical:'middle'}; no.border=rpXKenar();
    for(let k=1;k<=son;k++){ const c=ws.getCell(r-1,k); c.border={...(c.border||{}),bottom:kalin}; }
    let ph=0; for(let k=r0;k<r;k++) ph+=ws.getRow(k).height||15;
    if(dolu+ph>sayfaYuk&&r0>H+1){ ws.getRow(r0-1).addPageBreak(); dolu=(ws.getRow(H).height||30); }
    dolu+=ph;
  });
  ws.views=[{state:'frozen',xSplit:2,ySplit:H,topLeftCell:'C'+(H+1),activeCell:'C'+(H+1)}];
  ws.pageSetup.printArea=`A1:${ws.getColumn(son).letter}${r-1}`;
  ws.pageSetup.printTitlesRow=`${H}:${H}`;
  ws.pageSetup.printTitlesColumn='A:B';
  /* Altı ay bir sayfa genişliği; on iki ay iki sayfa — yazı küçültülüp tek sayfaya sıkıştırılmaz. */
  /* Sabit ölçek (Excel "sığdır" açıkken elle sayfa sonlarını yok sayar). */
  ws.pageSetup.fitToPage=false; ws.pageSetup.scale=Math.max(40,Math.floor(olcek*100));
  ws.pageSetup.pageOrder='overThenDown';
}
function rpMecraDonem(n){ const a=rpAyar('mecra'); const d=mdGun(rpBugun());
  if(n==='yil'){ a.bas=`${d.getFullYear()}-01-01`; a.bit=`${d.getFullYear()}-12-31`; }
  else { a.bas=_cIso(new Date(d.getFullYear(),d.getMonth(),1)); a.bit=_cIso(new Date(d.getFullYear(),d.getMonth()+n,0)); }
  rpKontrolCiz('mecra'); rpYenile('mecra'); }
function rpSiteSec(id,on){ const a=rpAyar('mecra'); const s=new Set(a.siteler); if(on) s.add(id); else s.delete(id);
  a.siteler=[...s]; if(!a.siteler.length){ rpNot('En az bir mecra seçin.','uyari'); a.siteler=[id]; rpKontrolCiz('mecra'); return; }
  if(a.urun){ const M=((rpDurum().veri||{}).mecra||{}).M; if(M&&!M.alts.some(x=>a.siteler.includes(x.mecra_id)&&String(x.product_id)===String(a.urun))) a.urun=''; }
  rpKontrolCiz('mecra'); rpYenile('mecra'); }

/* ==========================================================
   2) BASKI / MONTAJ — İKİ HAZIR ŞABLON (S15)
   A · Takip tablosu  — referans "BASKI-MONTAJ TAKİP TABLOSU": her
       üretim kalemi bir satır; baskı bilgisi ve AYNI kalemin montajı
       yan yana (Tarih · Müşteri · Ürün · Adet · Baskı merkezi · Ölçü ·
       Bedel · Montaj tarihi · Montaj yeri · Montajı yapan · Not).
   B · İşe özel döküm — referans Gürgençler dökümü: tek iş; Ürün ·
       Malzeme · Baskı ölçüsü · Görünen alan · Yüzey · Baskı adedi ·
       Montaj bedeli · Birim fiyat · Tutar; destek hizmetleri ayrı bölüm.

   ÜRETİM KALEMİ = aynı `kalem_key`i taşıyan işlemler (PS15). Bağ yalnız
   kullanıcının kurduğu kayıttan okunur; isim benzerliği ya da satır
   sırasıyla eşleştirme YAPILMAZ. Bağlanmamış montaj/söküm kendi satırında
   "baskıyla eşleştirilmemiş" olarak görünür, kaybolmaz.

   Tutar kuralları (S12'den değişmedi):
     · iç kullanım = kayıtlı maliyet; dış paylaşım = kayıtlı satış bedeli
     · her para birimi ayrı toplanır; girilmemiş tutar 0 sayılmaz
     · paket bedeli BİR kez sayılır; paketin tamamı rapordaysa toplama
       girer, kısmen rapordaysa toplama girmez ve dağıtılmaz
     · paket içindeki satır tutarları bilgi amaçlıdır
     · bir montaj birden çok baskıyı kapsıyorsa bedeli bir kez görünür
     · KDV, indirim, kâr varsayılmaz
   ========================================================== */
const RP_OPTUR={baski:'Baskı',montaj:'Montaj',sokum:'Söküm',diger:'Diğer hizmet'};
const RP_OPDURUM={planned:'Planlandı',waiting:'Bekliyor',in_progress:'Devam ediyor',done:'Tamamlandı',cancelled:'İptal'};
const RP_BSABLON=[['takip','Takip tablosu'],['dokum','İşe özel döküm']];
const RP_BDONEM=[['ay','Bu ay'],['gecen','Geçen ay'],['uc','Son 3 ay'],['yil','Bu yıl'],['tum','Tümü'],['ozel','Özel aralık']];
const rpBIs=a=>a.is?+a.is:(Array.isArray(a.isler)&&a.isler.length===1?+a.isler[0]:0);
function rpBDonemAralik(k){ const d=mdGun(rpBugun()), y=d.getFullYear(), mo=d.getMonth();
  if(k==='ay') return [_cIso(new Date(y,mo,1)),_cIso(new Date(y,mo+1,0))];
  if(k==='gecen') return [_cIso(new Date(y,mo-1,1)),_cIso(new Date(y,mo,0))];
  if(k==='uc') return [_cIso(new Date(y,mo-2,1)),_cIso(new Date(y,mo+1,0))];
  if(k==='yil') return [`${y}-01-01`,`${y}-12-31`];
  return [null,null]; }
/* Birim fiyat YALNIZ kayıttan: kayıtlı birim tutar ya da satır tutarının
   miktara kuruşu kuruşuna bölünebildiği değer. Yuvarlanmış tahmin yok. */
function rpBirimFiyat(birim,tutar,miktar){
  if(birim!=null&&birim!=='') return +birim;
  if(tutar==null||tutar===''||!(+miktar>0)) return null;
  const x=Math.round(+tutar*100/+miktar)/100; return Math.abs(x*+miktar-+tutar)<0.005?x:null; }
const RP_XPARA={TRY:'#,##0.00 "₺"',USD:'#,##0.00 "$"',EUR:'#,##0.00 "€"'};
const rpParaListe=l=>(l||[]).map(x=>rpPara(x.v,x.pb)).join(' + ');
/* Kalem tutarı: paket DIŞI işlemlerin girilmiş tutarları, para birimine göre. */
function rpTutarTopla(ops,tut){ const m={}; ops.forEach(o=>{ const v=tut(o); if(v==null) return; const pb=o.currency||'TRY'; m[pb]=(m[pb]||0)+v; });
  return Object.entries(m).map(([pb,v])=>({pb,v:Math.round(v*100)/100})); }

RPD_BASKI={
  sade:true,
  amac:'Baskı, montaj, söküm ve ilgili hizmetlerin hazır şablonlarda dökümü: genel takip tablosu ya da tek işin bedel dökümü.',
  presetNot:'Dış paylaşımda bedel = satış bedeli; maliyet ve iç notlar dosyaya girmez.',
  varsayilan(){ return {sablon:'takip',donem:'ay',bas:'',bit:'',kurum:'',is:'',uygulayan:'',iptal:false,tarihsiz:false}; },
  preset(){ return {}; },
  veriAnahtar:()=>'baski',
  async veri(){
    const [ops,grp,jobs,custs,M]=await Promise.all([
      rapHepsi(()=>sb.from('work_operations').select('id,job_id,operation_type,status,description,quantity,quantity_unit,dimensions,visible_size,surface_count,material,grammage_gsm,reprint,supplier_org_id,unit_id,location_text,planned_date,completed_at,created_at,unit_cost,cost,sale_amount,currency,price_group_id,kalem_key,note').order('id')),
      rapHepsi(()=>sb.from('operation_price_groups').select('*').order('id')),
      rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,status,lifecycle_status').order('id')),
      api('customers_min'), mdYukle()]);
    const cm={}; (custs||[]).forEach(c=>cm[c.id]=c.firma||'');
    return {ops,grp,jobs,cm,M};
  },
  veriSonra(a,v){ const id=rpBIs(a); if(id){ a.is=id; const j=v.jobs.find(x=>x.id===id); if(j&&!a.kurum&&j.customer_id) a.kurum=j.customer_id; } },
  kontrolVeriyle:true,
  baslik(a,v){ const cm=v?v.cm:{}; const j=v&&rpBIs(a)?v.jobs.find(x=>x.id===rpBIs(a)):null;
    if(a.sablon==='dokum') return j?`${j.title} — baskı / montaj dökümü`:'Baskı / montaj dökümü';
    return 'Baskı / montaj takip tablosu'+(j?' — '+j.title:a.kurum&&cm[a.kurum]?' — '+orgKisa(cm[a.kurum],40):''); },
  dosya:m=>m.sablon==='dokum'?'Baski_Montaj_Dokumu':'Baski_Montaj_Takip',
  kontroller(a){
    const v=(rpDurum().veri||{}).baski, T='baski', takip=a.sablon!=='dokum';
    const jobs=v?v.jobs:[], cm=v?v.cm:{};
    const opJob=new Set((v?v.ops:[]).map(o=>o.job_id));
    const kurumlar=[...new Set(jobs.filter(j=>opJob.has(j.id)&&j.customer_id).map(j=>j.customer_id))]
      .map(id=>[id,cm[id]||'#'+id]).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr'));
    const isler=jobs.filter(j=>opJob.has(j.id)&&(!a.kurum||String(j.customer_id)===String(a.kurum)))
      .sort((x,y)=>String(x.title).localeCompare(String(y.title),'tr'));
    const uyg=[...new Set((v?v.ops:[]).map(o=>o.supplier_org_id).filter(Boolean))].map(id=>[id,cm[id]||'#'+id]).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr'));
    const ic=a._alici==='ic';
    return `<div class="rp3-f">
      <div class="field"><span class="flabel">Şablon</span>${rpSeg(T,'sablon',a.sablon,RP_BSABLON,'Şablon')}
        <p class="fhint">${takip?'Her üretim kalemi bir satır: baskı ve aynı kalemin montajı yan yana. Birden çok işi ve kurumu kapsayabilir.'
          :'Tek işin kalem kalem teknik ve bedel dökümü: montaj bedeli, birim fiyat, tutar ve para birimine göre toplam.'}</p></div>
      ${takip?`<div class="field"><span class="flabel">Dönem</span>${rpSeg(T,'donem',a.donem,RP_BDONEM,'Dönem')}
        ${a.donem==='ozel'?rpTarihKontrol(T,a,'bas','bit'):''}
        <p class="fhint">Kalemin <b>planlanan</b> işlem tarihine göre (baskı tarihi; baskısı olmayan kalemde ilk uygulama tarihi). Gerçekleşme durumu Not sütununda yazılır.</p></div>`:''}
      <div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpKurum">Kurum${takip?' (isteğe bağlı)':''}</label>
          <select class="inp ${a.kurum?'inp-on':''}" id="rpKurum" data-ara onchange="rpBaskiKurum(this.value)"><option value="">Tüm kurumlar</option>
          ${kurumlar.map(([id,ad])=>`<option value="${id}" ${String(a.kurum)===String(id)?'selected':''}>${esc(orgKisa(ad,60))}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="rpIs">İş${takip?' (isteğe bağlı)':''}</label>
          <select class="inp ${a.is?'inp-on':''}" id="rpIs" data-ara onchange="rpBaskiIs(this.value)"><option value="">${takip?'Tüm işler':'— iş seçin —'}</option>
          ${isler.map(j=>`<option value="${j.id}" ${String(a.is)===String(j.id)?'selected':''}>${esc(j.title||'#'+j.id)}</option>`).join('')}</select></div></div>
      <div class="field"><span class="flabel">Kimin için</span>${rpAliciSeg(T,a)}
        <p class="fhint">${ic?'Bedel = kayıtlı maliyet. Serbest iç notlar dahildir.':'Bedel = kayıtlı satış bedeli. Maliyet ve iç notlar dosyaya girmez.'}</p></div>
      ${takip?`<details class="rp2-adv" ${rpDurum().adv?'open':''} ontoggle="rpDurum().adv=this.open"><summary>Ek filtreler</summary>
        <div class="rp2-grid"><div class="field"><label class="flabel" for="rpUyg">Baskı merkezi / uygulayan</label>
          <select class="inp ${a.uygulayan?'inp-on':''}" id="rpUyg" data-ara onchange="rpSet('baski','uygulayan',this.value,true)"><option value="">Tümü</option>
          ${uyg.map(([id,ad])=>`<option value="${id}" ${String(a.uygulayan)===String(id)?'selected':''}>${esc(orgKisa(ad,60))}</option>`).join('')}</select></div></div>
        <div class="rp2-chips col">${rpChk(T,'iptal',a.iptal,'İptal edilen işlemleri de göster')}${rpChk(T,'tarihsiz',a.tarihsiz,'Tarihi girilmemiş kalemleri ekle','dönem seçiliyken')}</div></details>`:''}
    </div>`;
  },
  model(a,v){
    const T='baski', ic=a._alici==='ic', cm=v.cm, M=v.M, sab=a.sablon==='dokum'?'dokum':'takip';
    const jm={}; v.jobs.forEach(j=>jm[j.id]=j); const gm={}; v.grp.forEach(g=>gm[g.id]=g);
    const isId=rpBIs(a);
    const out={sablon:sab,ic,uyari:[],bilgi:[],satirlar:[],bolumler:[],toplamlar:{},paketler:{},
      bedelAd:ic?'Maliyet':'Satış bedeli'};
    const bosSay=()=>({dahil:0,filtre:0,cik:0,birim:'işlem'});
    if(sab==='dokum'&&!isId){ out.bosMesaj='Döküm için bir iş seçin.'; out.say=bosSay(); return out; }
    let bas=null, bit=null;
    if(sab==='takip'){
      if(a.donem==='ozel'){ bas=a.bas||null; bit=a.bit||null;
        const h=(bas||bit)?rpDonemDogrula(bas||'2000-01-01',bit||'2099-12-31'):null;
        if(h){ out.hata=h; out.uyari.push(h); out.say=bosSay(); return out; } }
      else [bas,bit]=rpBDonemAralik(a.donem);
    }
    out.bas=bas; out.bit=bit;
    const tut=o=>{ const x=ic?o.cost:o.sale_amount; return x==null||x===''?null:+x; };
    const yerOf=o=>{ const u=o.unit_id?M.unitById[o.unit_id]:null; const p=[];
      if(u){ const al=M.altById[u.alt_mecra_id]; const me=M.mecById[(al||{}).mecra_id||u.mecra_id];
        p.push([me&&me.name,mdYuzAdi(M,u)].filter(Boolean).join(' · ')); }
      if(o.location_text) p.push(o.location_text); return p.join(' — '); };
    const unitAd=o=>{ const u=o.unit_id?M.unitById[o.unit_id]:null; return u?mdYuzAdi(M,u):''; };
    const kurumAd=id=>id?rpKisaAd(cm[id],30):'';
    /* Baskı merkezi / uygulayan: sütun dar, daha kısa. */
    const firmaKisa=id=>id?rpKisaAd(cm[id],24):'';
    /* 1. Kapsam */
    const kapsam=v.ops.filter(o=>{ const j=jm[o.job_id]; if(!j) return false;
      if(isId&&o.job_id!==isId) return false;
      if(a.kurum&&String(j.customer_id)!==String(a.kurum)) return false;
      if(!a.iptal&&o.status==='cancelled') return false; return true; });
    /* 2. Üretim kalemleri (yalnız açık bağ) */
    const km=new Map(); kapsam.forEach(o=>{ const k=o.kalem_key||('t'+o.id); if(!km.has(k)) km.set(k,[]); km.get(k).push(o); });
    const turSira={baski:0,montaj:1,sokum:2,diger:3};
    let kalemler=[...km.entries()].map(([key,ops])=>{ ops.sort((x,y)=>turSira[x.operation_type]-turSira[y.operation_type]||x.id-y.id);
      const b=ops.filter(o=>o.operation_type==='baski'&&o.planned_date).map(o=>o.planned_date).sort();
      const t=ops.map(o=>o.planned_date).filter(Boolean).sort();
      return {key,ops,tarih:b[0]||t[0]||null,job:jm[ops[0].job_id],ilkId:Math.min(...ops.map(o=>o.id))}; });
    if(a.uygulayan&&sab==='takip') kalemler=kalemler.filter(k=>k.ops.some(o=>String(o.supplier_org_id)===String(a.uygulayan)));
    out.tarihsizDisarda=0;
    if(sab==='takip'&&(bas||bit)) kalemler=kalemler.filter(k=>{ if(!k.tarih){ if(!a.tarihsiz) out.tarihsizDisarda++; return !!a.tarihsiz; }
      return (!bas||k.tarih>=bas)&&(!bit||k.tarih<=bit); });
    const gorunen=new Set(kalemler.flatMap(k=>k.ops.map(o=>'o'+o.id)));
    out.budanan=rpBuda(T,gorunen);
    kalemler.forEach(k=>{ k.d=k.ops.filter(o=>rpDahil(T,'o'+o.id)); });
    /* Çıkarılan işlemler modelde yalnız ADIYLA kalır (geri eklemek için);
       tutar, not ya da başka alan taşımaz. */
    out.cikarilan=kalemler.flatMap(k=>k.ops.filter(o=>!rpDahil(T,'o'+o.id)).map(o=>({key:'o'+o.id,tarih:o.planned_date||'',
      ad:`${RP_OPTUR[o.operation_type]||o.operation_type} — ${o.description||unitAd(o)||(jm[o.job_id]||{}).title||''}`})));
    kalemler=kalemler.filter(k=>k.d.length);
    /* 3. Paketler: bir kez sayılır; kısmi paket toplama girmez. */
    const paketTum={}; v.ops.forEach(o=>{ if(o.price_group_id&&(a.iptal||o.status!=='cancelled')) (paketTum[o.price_group_id]=paketTum[o.price_group_id]||[]).push(o.id); });
    const pRap={}; kalemler.forEach(k=>k.d.forEach(o=>{ if(o.price_group_id&&gm[o.price_group_id]) (pRap[o.price_group_id]=pRap[o.price_group_id]||new Set()).add(o.id); }));
    Object.keys(pRap).forEach(pid=>{ const g=gm[pid], kap=(paketTum[pid]||[]).length, r=pRap[pid].size, t=ic?g.cost_amount:g.sale_amount;
      out.paketler[pid]={id:+pid,ad:g.label,pb:g.currency||'TRY',tutar:t==null?null:+t,kapsam:kap,raporda:r,tam:r===kap,not:ic?(g.note||''):''}; });
    const pakette=o=>!!(o.price_group_id&&out.paketler[o.price_group_id]);
    const kPaket=k=>{ const o=k.d.find(pakette); return o?o.price_group_id:null; };
    const pTarih={}; kalemler.forEach(k=>{ const p=kPaket(k); if(p){ const t=k.tarih||'9999'; if(!pTarih[p]||t<pTarih[p]) pTarih[p]=t; } });
    kalemler.sort((x,y)=>{ const px=kPaket(x), py=kPaket(y);
      return String(px?pTarih[px]:(x.tarih||'9999')).localeCompare(String(py?pTarih[py]:(y.tarih||'9999')))
        ||(px||0)-(py||0)||String(x.tarih||'9999').localeCompare(String(y.tarih||'9999'))||x.ilkId-y.ilkId; });
    kalemler.forEach(k=>{ k.paket=kPaket(k); });
    /* 4. Toplamlar (para birimine göre) */
    const top=out.toplamlar;
    const tEkle=(pb,alan,deger)=>{ const t=top[pb]=top[pb]||{tutar:0,var:false,eksik:0,baski:0,montaj:0,hizmet:0,paket:0};
      if(deger==null){ t.eksik++; return; } t.tutar=Math.round((t.tutar+deger)*100)/100; t[alan]=Math.round((t[alan]+deger)*100)/100; t.var=true; };
    kalemler.forEach(k=>{ const varB=k.d.some(o=>o.operation_type==='baski');
      k.d.forEach(o=>{ if(pakette(o)) return; const alan=o.operation_type==='baski'?'baski':(o.operation_type==='montaj'&&varB)?'montaj':'hizmet';
        tEkle(o.currency||'TRY',alan,tut(o)); }); });
    Object.values(out.paketler).forEach(p=>{ if(p.tam&&p.tutar!=null) tEkle(p.pb,'paket',p.tutar); });
    out.kismiPaket=Object.values(out.paketler).some(p=>!p.tam);
    const sayDahil=kalemler.reduce((t,k)=>t+k.d.length,0);
    out.say={dahil:sayDahil,filtre:gorunen.size,cik:gorunen.size-sayDahil,birim:'işlem'};
    /* 5. Satırlar */
    const durumMetni=ops=>{ const g={}; ops.forEach(o=>{ const t=o.operation_type; (g[t]=g[t]||new Set()).add(o.status); });
      return Object.entries(g).map(([t,s])=>`${RP_OPTUR[t]||t}: ${[...s].map(x=>(RP_OPDURUM[x]||x).toLocaleLowerCase('tr')).join(' / ')}`).join(' · '); };
    const tarihBir=l=>{ const u=[...new Set(l.filter(Boolean))].sort(); return u.length<=1?(u[0]||''):u.map(rpTr).join('\n'); };
    const birles=l=>[...new Set(l.filter(Boolean))].join('\n');
    const malzeme=o=>[o.material,o.grammage_gsm?o.grammage_gsm+' gr/m²':''].filter(Boolean).join(' · ');
    const hizmetAd=o=>`${RP_OPTUR[o.operation_type]||o.operation_type}${o.description?' — '+o.description:unitAd(o)?' — '+unitAd(o):''}`;
    const notlar=ops=>ic?ops.filter(o=>o.note).map(o=>(ops.length>1?RP_OPTUR[o.operation_type]+': ':'')+o.note):[];
    if(sab==='takip'){
      let sonP=null;
      kalemler.forEach(k=>{
        if(k.paket&&k.paket!==sonP) out.satirlar.push({tip:'paket',...out.paketler[k.paket]});
        sonP=k.paket;
        const B=k.d.filter(o=>o.operation_type==='baski'), Mo=k.d.filter(o=>o.operation_type==='montaj'), D=k.d.filter(o=>!['baski','montaj'].includes(o.operation_type));
        const musteri=kurumAd(k.job.customer_id);
        const rows=[];
        B.forEach(o=>rows.push({key:'o'+o.id,tarih:o.planned_date||'',musteri,urun:o.description||unitAd(o)||'Baskı',
          urunAlt:[o.reprint?'Yeniden baskı':'',malzeme(o),o.visible_size?'görünen '+o.visible_size:''].filter(Boolean).join(' · '),
          adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',merkez:firmaKisa(o.supplier_org_id),olcu:o.dimensions||''}));
        const mSpan=B.length&&Mo.length?B.length:0;
        if(mSpan){ rows[0].mTarih=tarihBir(Mo.map(o=>o.planned_date)); rows[0].mYer=birles(Mo.map(yerOf)); rows[0].mYapan=birles(Mo.map(o=>firmaKisa(o.supplier_org_id))); }
        (B.length?D:[...Mo,...D]).forEach(o=>rows.push({key:'o'+o.id,tarih:o.planned_date||'',musteri,urun:hizmetAd(o),urunAlt:'',
          adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',merkez:'',olcu:o.dimensions||'',
          mTarih:o.planned_date||'',mYer:yerOf(o),mYapan:firmaKisa(o.supplier_org_id),kendi:true}));
        const bedelOps=k.d.filter(o=>!pakette(o));
        const eksik=bedelOps.filter(o=>tut(o)==null).map(o=>RP_OPTUR[o.operation_type]);
        const kapsamAd=B.length?(Mo.length?'Baskı + montaj':'Yalnız baskı')+(D.length?' + '+[...new Set(D.map(o=>RP_OPTUR[o.operation_type].toLocaleLowerCase('tr')))].join(', '):'')
          :Mo.length?'Montaj — baskıyla eşleştirilmemiş':[...new Set(D.map(o=>RP_OPTUR[o.operation_type]))].join(', ');
        const bedel=rpTutarTopla(bedelOps,tut);
        const pktKis=k.d.filter(pakette);
        out.satirlar.push({tip:'kalem',key:k.key,rows,mSpan,bedel,paket:!!k.paket&&bedelOps.length===0,
          not:[kapsamAd,durumMetni(k.d),
            pktKis.length&&bedelOps.length?`${[...new Set(pktKis.map(o=>RP_OPTUR[o.operation_type]))].join(', ')} paket bedelinde; bu bedel yalnız ${[...new Set(bedelOps.map(o=>RP_OPTUR[o.operation_type].toLocaleLowerCase('tr')))].join(', ')} kısmıdır.`:'',
            bedel.length&&eksik.length?`Bedel yalnız girilmiş tutarları kapsar (${[...new Set(eksik)].join(', ').toLocaleLowerCase('tr')} tutarı girilmemiş).`:'',
            ...notlar(k.d)].filter(Boolean).join('\n')});
      });
      if(a.kurum) out.bilgi.push(['Kurum',cm[a.kurum]||'']);
      if(isId) out.bilgi.push(['İş',(jm[isId]||{}).title||'']);
      out.bilgi.push(['Dönem',bas||bit?`${bas?rpTr(bas):'…'} – ${bit?rpTr(bit):'…'} (planlanan işlem tarihi)`:'Tüm tarihler']);
      if(a.uygulayan) out.bilgi.push(['Uygulayan',orgKisa(cm[a.uygulayan]||'',60)]);
      if(out.tarihsizDisarda) out.uyari.push(`${out.tarihsizDisarda} kalemin tarihi girilmemiş; bu döneme yerleştirilemediği için rapora girmedi. "Ek filtreler" içinden eklenebilir.`);
    } else {
      const job=jm[isId]||{};
      out.kurum=cm[job.customer_id]||''; out.is=job.title||'';
      const K1=[], K2=[]; let sonP=null;
      kalemler.forEach(k=>{
        const B=k.d.filter(o=>o.operation_type==='baski'), Mo=k.d.filter(o=>o.operation_type==='montaj'), D=k.d.filter(o=>!['baski','montaj'].includes(o.operation_type));
        const hizmet=(o,bagli)=>K2.push({tip:'hizmet',key:'o'+o.id,urun:hizmetAd(o),urunAlt:[bagli?'↳ '+bagli:'',o.operation_type==='montaj'?'baskıyla eşleştirilmemiş':'',yerOf(o)].filter(Boolean).join(' · '),
          olcu:o.dimensions||'',yuzey:o.surface_count,adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',
          birimFiyat:rpBirimFiyat(ic?o.unit_cost:null,tut(o),o.quantity),tutar:tut(o),pb:o.currency||'TRY',gri:pakette(o),
          not:notlar([o]).join(' ')});
        if(!B.length){ [...Mo,...D].forEach(o=>hizmet(o,'')); return; }
        if(k.paket&&k.paket!==sonP) K1.push({tip:'paket',...out.paketler[k.paket]});
        sonP=k.paket;
        const mBedel=rpTutarTopla(Mo.filter(o=>!pakette(o)),tut);
        const mGri=Mo.length>0&&Mo.every(pakette);
        const rows=B.map(o=>({key:'o'+o.id,urun:o.description||unitAd(o)||'Baskı',
          urunAlt:[o.reprint?'Yeniden baskı':'',yerOf(o)].filter(Boolean).join(' · '),malzeme:malzeme(o),
          olcu:o.dimensions||'',gorunen:o.visible_size||'',yuzey:o.surface_count,adet:o.quantity==null?null:+o.quantity,
          birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',birimFiyat:rpBirimFiyat(ic?o.unit_cost:null,tut(o),o.quantity),
          tutar:tut(o),pb:o.currency||'TRY',gri:pakette(o)}));
        K1.push({tip:'kalem',key:k.key,rows,montaj:Mo.length?{bedel:mGri?rpTutarTopla(Mo,tut):mBedel,gri:mGri,
            eksik:Mo.some(o=>tut(o)==null)&&!mGri,kapsar:B.length}:null,
          not:[...notlar(k.d)].join(' ')});
        D.forEach(o=>hizmet(o,rows[0].urun));
      });
      out.bolumler=[{ad:'Baskı ve montaj kalemleri',tip:'kalem',satirlar:K1},{ad:'Destek hizmetleri',tip:'hizmet',satirlar:K2}].filter(b=>b.satirlar.length);
      out.bilgi.push(['Kurum',out.kurum],['İş',out.is]);
    }
    if(!kalemler.length&&!out.uyari.length) out.uyari.push('Bu kapsamda baskı / montaj kaydı yok.');
    return out;
  },
  onizle(m,a){
    const T='baski';
    if(m.bosMesaj) return `<p class="empty">${esc(m.bosMesaj)}</p>`;
    if(m.hata) return '';
    const P=(v,pb,gri)=>v==null?'<span class="muted">—</span>':`<span class="${gri?'rp3-gri':''}">${esc(rpPara(v,pb))}</span>`;
    const tarihH=t=>/^\d{4}-\d{2}-\d{2}$/.test(t||'')?esc(rpTr(t)):esc(t||'').replace(/\n/g,'<br>');
    const cok=t=>esc(t||'').replace(/\n/g,'<br>');
    const cb=(key,dahil,ad)=>rpCb(T,key,dahil,ad);
    let h=`<p class="rp2-ozet">Bedel sütunu: <b>${esc(m.bedelAd.toLocaleLowerCase('tr'))}</b> — kayıtlı tutarlar; KDV ve indirim hesaplanmaz, paket bedeli bir kez sayılır.</p>`;
    if(m.sablon==='takip'){
      const kol=['Tarih','Müşteri','Ürün / iş kalemi','Adet','Baskı merkezi','Ölçü',m.bedelAd,'Montaj tarihi','Montaj yeri','Montajı yapan','Not'];
      h+=`<div class="rp3-kap"><table class="rp3-tab rp3-bm"><thead><tr><th class="rp3-cb"><span class="sr-only">Dahil</span></th>${kol.map(k=>`<th scope="col">${esc(k)}</th>`).join('')}</tr></thead><tbody>`;
      m.satirlar.forEach(s=>{
        if(s.tip==='paket'){ h+=`<tr class="rp3-pk${s.tam?'':' kismi'}"><td></td><td colspan="6"><b>Paket bedeli — ${esc(s.ad)}</b><small>${s.kapsam} işlemi kapsar${s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam} işlem var; bedel dağıtılmadı, toplama katılmadı (paketin tamamı ${esc(rpPara(s.tutar,s.pb))})`}</small></td>
            <td class="sag">${s.tam?P(s.tutar,s.pb):'<span class="muted">kısmi</span>'}</td><td colspan="4">${cok(s.not)}</td></tr>`; return; }
        const n=s.rows.length;
        s.rows.forEach((r,i)=>{ const d=rpDahil(T,r.key);
          h+=`<tr class="${d?'':'dis'}${i===n-1?' son':''}"><td class="rp3-cb">${cb(r.key,d,r.urun+' rapora dahil')}</td>
            <td>${tarihH(r.tarih)}</td><td>${esc(r.musteri)}</td><td><b>${esc(r.urun)}</b>${r.urunAlt?`<small>${esc(r.urunAlt)}</small>`:''}</td>
            <td class="sag">${r.adet==null?'':esc(rpSayi(r.adet)+' '+r.birim)}</td><td>${esc(r.merkez)}</td><td>${esc(r.olcu)}</td>
            ${i===0?`<td class="sag" rowspan="${n}">${s.paket?'<span class="rp3-gri">pakette</span>':s.bedel.length?esc(rpParaListe(s.bedel)):'<span class="muted">—</span>'}</td>`:''}
            ${(i===0&&s.mSpan)?`<td rowspan="${s.mSpan}">${tarihH(r.mTarih)}</td><td rowspan="${s.mSpan}">${cok(r.mYer)}</td><td rowspan="${s.mSpan}">${cok(r.mYapan)}</td>`
              :(s.mSpan&&i<s.mSpan)?'':`<td>${r.kendi?tarihH(r.mTarih):''}</td><td>${r.kendi?cok(r.mYer):''}</td><td>${r.kendi?cok(r.mYapan):''}</td>`}
            ${i===0?`<td rowspan="${n}" class="rp3-not">${cok(s.not)}</td>`:''}</tr>`; }); });
      h+=`</tbody></table></div>`;
      if(!m.satirlar.length) h+=`<p class="empty">Bu kapsamda baskı / montaj kaydı yok.</p>`;
    } else {
      m.bolumler.forEach(b=>{
        const kol=b.tip==='kalem'?['Ürün','Malzeme / cins','Baskı ölçüsü','Görünen alan','Yüzey adedi','Baskı adedi','Montaj bedeli','Birim fiyat','Tutar']
          :['Hizmet','','Ölçü','','Yüzey adedi','Miktar','','Birim fiyat','Tutar'];
        h+=`<h5 class="rp2-g1">${esc(b.ad)}</h5><div class="rp3-kap"><table class="rp3-tab rp3-bm"><thead><tr><th class="rp3-cb"><span class="sr-only">Dahil</span></th>${kol.map(k=>`<th scope="col">${esc(k)}</th>`).join('')}</tr></thead><tbody>`;
        b.satirlar.forEach(s=>{
          if(s.tip==='paket'){ h+=`<tr class="rp3-pk${s.tam?'':' kismi'}"><td></td><td colspan="8"><b>Paket bedeli — ${esc(s.ad)}: ${s.tam?esc(rpPara(s.tutar,s.pb)):'kısmi'}</b>
              <small>${s.kapsam} işlemi kapsar; aşağıdaki satır tutarları bilgi amaçlıdır${s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam} işlem var; bedel dağıtılmadı, toplama katılmadı`}${s.not?' · '+esc(s.not):''}</small></td><td></td></tr>`; return; }
          if(s.tip==='hizmet'){ const d=rpDahil(T,s.key);
            h+=`<tr class="${d?'':'dis'} son"><td class="rp3-cb">${cb(s.key,d,s.urun+' rapora dahil')}</td><td colspan="2"><b>${esc(s.urun)}</b>${s.urunAlt?`<small>${esc(s.urunAlt)}</small>`:''}${s.not?`<small class="rp3-notm">${esc(s.not)}</small>`:''}</td>
              <td>${esc(s.olcu)}</td><td></td><td class="sag">${s.yuzey??''}</td><td class="sag">${s.adet==null?'':esc(rpSayi(s.adet)+' '+s.birim)}</td><td></td>
              <td class="sag">${P(s.birimFiyat,s.pb)}</td><td class="sag">${P(s.tutar,s.pb,s.gri)}</td></tr>`; return; }
          const n=s.rows.length;
          s.rows.forEach((r,i)=>{ const d=rpDahil(T,r.key);
            h+=`<tr class="${d?'':'dis'}${i===n-1?' son':''}"><td class="rp3-cb">${cb(r.key,d,r.urun+' rapora dahil')}</td>
              <td><b>${esc(r.urun)}</b>${r.urunAlt?`<small>${esc(r.urunAlt)}</small>`:''}${i===0&&s.not?`<small class="rp3-notm">${esc(s.not)}</small>`:''}</td><td>${esc(r.malzeme)}</td><td>${esc(r.olcu)}</td><td>${esc(r.gorunen)}</td>
              <td class="sag">${r.yuzey??''}</td><td class="sag">${r.adet==null?'':esc(rpSayi(r.adet)+(r.birim&&r.birim!=='adet'?' '+r.birim:''))}</td>
              ${i===0?`<td class="sag" rowspan="${n}">${s.montaj?(s.montaj.bedel.length?`<span class="${s.montaj.gri?'rp3-gri':''}">${esc(rpParaListe(s.montaj.bedel))}</span>`:'<span class="muted">girilmemiş</span>')+(s.montaj.kapsar>1?`<small>${s.montaj.kapsar} kalemin ortak montajı</small>`:''):'<span class="muted">—</span>'}</td>`:''}
              <td class="sag">${P(r.birimFiyat,r.pb)}</td><td class="sag">${P(r.tutar,r.pb,r.gri)}</td></tr>`; }); });
        h+=`</tbody></table></div>`; });
      if(!m.bolumler.length) h+=`<p class="empty">Bu işte baskı / montaj kaydı yok.</p>`;
    }
    if((m.cikarilan||[]).length) h+=`<div class="rp3-cik"><b>Rapordan çıkarılan kayıtlar (${m.cikarilan.length})</b> <span class="muted">— işaretleyerek geri ekleyin</span>
      <div class="rp2-rows">${m.cikarilan.map(x=>`<label class="rp2-row dis">${rpCb(T,x.key,false,x.ad+' rapora ekle')}<span class="rp2-tarih-c">${esc(rpTr(x.tarih)||'tarihsiz')}</span><span class="rp2-det">${esc(x.ad)}</span></label>`).join('')}</div></div>`;
    h+=rpBToplamHtml(m);
    return h;
  },
  pdf(m,a){ return m.sablon==='dokum'?rpDokumPdf(m):rpTakipPdf(m); },
  xlsx(m,a){ return [{ad:m.sablon==='dokum'?'Döküm':'Takip',yon:'landscape',ozel:ws=>(m.sablon==='dokum'?rpDokumXls:rpTakipXls)(ws,m)}]; }
};
/* Toplam satırları — her para birimi ayrı. */
function rpBToplamSatirlari(m){
  const out=[]; const E=Object.entries(m.toplamlar);
  E.forEach(([pb,t])=>{
    if(m.sablon==='dokum'){
      if(t.baski) out.push({ad:'Baskı toplamı',pb,v:t.baski});
      if(t.montaj) out.push({ad:'Montaj toplamı',pb,v:t.montaj});
      if(t.hizmet) out.push({ad:'Destek hizmetleri toplamı',pb,v:t.hizmet});
      Object.values(m.paketler).filter(p=>p.pb===pb&&p.tam&&p.tutar!=null).forEach(p=>out.push({ad:'Paket bedeli — '+p.ad,pb,v:p.tutar}));
    }
    out.push({ad:`Genel toplam (${pb})`,pb,v:t.var?t.tutar:null,kalin:true,eksik:t.eksik});
  });
  return out;
}
function rpBToplamNot(m){
  const n=Object.values(m.toplamlar).reduce((x,t)=>x+t.eksik,0);
  return [`${m.bedelAd}: kayıtlı tutarlar. Her para birimi ayrı toplanır; KDV, indirim ve kâr hesaplanmaz.`,
    Object.keys(m.paketler).length?'Paket bedeli bir kez sayılır; paket içindeki satır tutarları bilgi amaçlıdır.':'',
    m.kismiPaket?'Kısmen kapsanan paket toplama katılmadı.':'',
    n?`${n} işlemde tutar girilmemiş; bu işlemler toplama katılmadı (0 sayılmadı).`:''].filter(Boolean).join(' ');
}
function rpBToplamHtml(m){
  const T=rpBToplamSatirlari(m);
  return `<div class="rp3-top">${T.length?T.map(t=>`<div class="${t.kalin?'kalin':''}"><span>${esc(t.ad)}</span><b>${t.v==null?'—':esc(rpPara(t.v,t.pb))}</b></div>`).join('')
    :'<div><span>Kayıtlı tutar yok.</span></div>'}</div><p class="fhint">${esc(rpBToplamNot(m))}</p>`;
}
/* ---------- PDF ---------- */
function rpPdfBaslikBilgi(m){ return {text:[{text:'Bedel: ',bold:true},m.bedelAd.toLocaleLowerCase('tr')+(m.ic?' (iç kullanım)':' (dış paylaşım)')+' — kayıtlı tutarlar.'],fontSize:9,margin:[0,0,0,6]}; }
function rpPdfToplam(m){
  const T=rpBToplamSatirlari(m);
  return [{table:{widths:['*',140],body:T.length?T.map(t=>[{text:t.ad,bold:!!t.kalin,alignment:'right'},{text:t.v==null?'—':rpPara(t.v,t.pb),bold:!!t.kalin,alignment:'right'}])
      :[[{text:'Kayıtlı tutar yok.',colSpan:2,style:'bos'},{}]]},layout:'lightHorizontalLines',margin:[340,6,0,4],unbreakable:true},
    {text:rpBToplamNot(m),style:'not'}];
}
function rpTakipPdf(m){
  const ic=[rpPdfBaslikBilgi(m)];
  const W=[52,66,'*',40,60,52,62,52,74,60,90];
  const bas=['Tarih','Müşteri','Ürün / iş kalemi','Adet','Baskı merkezi','Ölçü',m.bedelAd,'Montaj tarihi','Montaj yeri','Montajı yapan','Not']
    .map((t,i)=>({text:t,style:'th',alignment:[3,6].includes(i)?'right':'left'}));
  const body=[bas];
  const tr=t=>/^\d{4}-\d{2}-\d{2}$/.test(t||'')?rpTr(t):(t||'');
  m.satirlar.forEach(s=>{
    if(s.tip==='paket'){ body.push([{text:'',fillColor:'#eef3fb'},{stack:[{text:'Paket bedeli — '+s.ad,bold:true},{text:`${s.kapsam} işlemi kapsar`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; toplama katılmadı (paketin tamamı ${rpPara(s.tutar,s.pb)})`),style:'not'}],colSpan:5,fillColor:'#eef3fb'},{},{},{},{},
      {text:s.tam?rpPara(s.tutar,s.pb):'kısmi',bold:true,alignment:'right',fillColor:'#eef3fb'},{text:s.not||'',colSpan:4,style:'not',fillColor:'#eef3fb'},{},{},{}]); return; }
    const n=s.rows.length;
    s.rows.forEach((r,i)=>{ const row=[{text:tr(r.tarih),noWrap:true},r.musteri,{stack:[{text:r.urun,bold:true},...(r.urunAlt?[{text:r.urunAlt,style:'not'}]:[])]},
        {text:r.adet==null?'':`${rpSayi(r.adet)} ${r.birim}`,alignment:'right'},r.merkez,r.olcu,
        i===0?{text:s.paket?'pakette':s.bedel.length?rpParaListe(s.bedel):'—',alignment:'right',rowSpan:n,color:s.paket?RPC.ink3:RPC.ink}:{}];
      if(i===0&&s.mSpan) row.push({text:tr(r.mTarih),rowSpan:s.mSpan,noWrap:!String(r.mTarih||'').includes('\n')},{text:r.mYer||'',rowSpan:s.mSpan},{text:r.mYapan||'',rowSpan:s.mSpan});
      else if(s.mSpan&&i<s.mSpan) row.push({},{},{});
      else row.push({text:r.kendi?tr(r.mTarih):'',noWrap:true},r.kendi?(r.mYer||''):'',r.kendi?(r.mYapan||''):'');
      row.push(i===0?{text:s.not||'',style:'not',rowSpan:n}:{});
      body.push(row); }); });
  if(body.length===1) ic.push({text:'Bu kapsamda baskı / montaj kaydı yok.',style:'bos'});
  else ic.push({table:{headerRows:1,dontBreakRows:true,widths:W,body},layout:{hLineWidth:(i,n)=>i===0||i===n.table.body.length?0.8:i===1?0.9:0.45,
      vLineWidth:()=>0.35,hLineColor:i=>i===1?'#8e8e95':'#cfcfd4',vLineColor:()=>'#dcdce0',fillColor:i=>i===0?'#FFE699':null,
      paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>3,paddingBottom:()=>3},fontSize:8.5,margin:[0,0,0,6]});
  ic.push(...rpPdfToplam(m));
  return {icerik:ic,o:{yon:'landscape'}};
}
function rpDokumPdf(m){
  const ic=[rpPdfBaslikBilgi(m)];
  if(m.bosMesaj){ ic.push({text:m.bosMesaj,style:'bos'}); return {icerik:ic,o:{yon:'landscape'}}; }
  const W=['*',108,70,70,40,46,72,66,76];
  const para=(v,pb,gri)=>({text:v==null?'—':rpPara(v,pb),alignment:'right',color:gri?RPC.ink3:RPC.ink,italics:!!gri});
  m.bolumler.forEach(b=>{
    const bas=(b.tip==='kalem'?['Ürün','Malzeme / cins','Baskı ölçüsü','Görünen alan','Yüzey adedi','Baskı adedi','Montaj bedeli','Birim fiyat','Tutar']
      :['Hizmet','','Ölçü','','Yüzey adedi','Miktar','','Birim fiyat','Tutar']).map((t,i)=>({text:t,style:'th',alignment:i>=4?'right':'left'}));
    const body=[[{text:b.ad,style:'h2',colSpan:9,margin:[-3,4,0,0]},{},{},{},{},{},{},{},{}],bas];
    b.satirlar.forEach(s=>{
      if(s.tip==='paket'){ body.push([{stack:[{text:`Paket bedeli — ${s.ad}: ${s.tam?rpPara(s.tutar,s.pb):'kısmi'}`,bold:true},
          {text:`${s.kapsam} işlemi kapsar; aşağıdaki satır tutarları bilgi amaçlıdır`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; toplama katılmadı`)+(s.not?' · '+s.not:''),style:'not'}],colSpan:9,fillColor:'#eef3fb'},{},{},{},{},{},{},{},{}]); return; }
      if(s.tip==='hizmet'){ body.push([{stack:[{text:s.urun,bold:true},...(s.urunAlt?[{text:s.urunAlt,style:'not'}]:[]),...(s.not?[{text:s.not,style:'not'}]:[])],colSpan:2},{},s.olcu,'',
          {text:s.yuzey==null?'':String(s.yuzey),alignment:'right'},{text:s.adet==null?'':`${rpSayi(s.adet)} ${s.birim}`,alignment:'right'},'',para(s.birimFiyat,s.pb),para(s.tutar,s.pb,s.gri)]); return; }
      const n=s.rows.length;
      s.rows.forEach((r,i)=>body.push([{stack:[{text:r.urun,bold:true},...(r.urunAlt?[{text:r.urunAlt,style:'not'}]:[]),...(i===0&&s.not?[{text:s.not,style:'not'}]:[])]},
        r.malzeme,r.olcu,r.gorunen,{text:r.yuzey==null?'':String(r.yuzey),alignment:'right'},{text:r.adet==null?'':rpSayi(r.adet)+(r.birim&&r.birim!=='adet'?' '+r.birim:''),alignment:'right'},
        i===0?{stack:s.montaj?[{text:s.montaj.bedel.length?rpParaListe(s.montaj.bedel):'girilmemiş',color:s.montaj.gri||!s.montaj.bedel.length?RPC.ink3:RPC.ink,italics:!!s.montaj.gri},
            ...(s.montaj.kapsar>1?[{text:`${s.montaj.kapsar} kalemin ortak montajı`,style:'not'}]:[])]:[{text:'—',color:RPC.ink3}],alignment:'right',rowSpan:n}:{},
        para(r.birimFiyat,r.pb),para(r.tutar,r.pb,r.gri)]));
    });
    ic.push({table:{headerRows:2,dontBreakRows:true,keepWithHeaderRows:1,widths:W,body},layout:{hLineWidth:(i,n)=>i<=1?0:i===2?0.9:i===n.table.body.length?0.8:0.45,
        vLineWidth:()=>0,hLineColor:i=>i===2?'#8e8e95':'#d4d4d9',fillColor:i=>i===1?'#E3E9F4':null,
        paddingLeft:()=>4,paddingRight:()=>4,paddingTop:()=>3,paddingBottom:()=>3},fontSize:9,margin:[0,0,0,8]});
  });
  if(!m.bolumler.length) ic.push({text:'Bu işte baskı / montaj kaydı yok.',style:'bos'});
  ic.push(...rpPdfToplam(m));
  return {icerik:ic,o:{yon:'landscape'}};
}
/* ---------- XLSX ---------- */
function rpXlsBaslik(ws,m,son,alt){
  const F='Arial';
  const c1=ws.getCell(1,1); c1.value=m.baslik; c1.font={name:F,bold:true,size:14};
  const c2=ws.getCell(2,1); c2.value=[...alt,`Bedel: ${m.bedelAd.toLocaleLowerCase('tr')} (${m.ic?'iç kullanım':'dış paylaşım'})`,
    m.alici?`Hazırlanan: ${m.alici}`:'',`Hazırlanma: ${rpAnTr(m.an)}`].filter(Boolean).join('   ·   ');
  c2.font={name:F,size:9,color:{argb:'FF55555B'}};
  if(m.aciklama){ const c3=ws.getCell(3,1); c3.value=m.aciklama; c3.font={name:F,size:9}; }
}
function rpXlsHeader(ws,r,basliklar,dolgu,sagdan){
  const row=ws.getRow(r); row.height=30;
  basliklar.forEach((t,i)=>{ const c=row.getCell(i+1); c.value=t||null; c.font={name:'Arial',bold:true,size:10};
    c.fill={type:'pattern',pattern:'solid',fgColor:{argb:dolgu}}; c.border=rpXKenar();
    c.alignment={vertical:'middle',horizontal:i>=sagdan?'right':'left',wrapText:true}; });
}
function rpXlsDeger(c,tip,v,pb){
  if(v==null||v===''){ c.value=null; return; }
  if(tip==='para'){ c.value=+v; c.numFmt=RP_XPARA[pb||'TRY']||RP_XF.para; return; }
  if(tip==='tarih'&&/^\d{4}-\d{2}-\d{2}$/.test(v)){ rpXlsHucre(c,'tarih',v); return; }
  if(tip==='adet'||tip==='tam'){ const n=+v; const ek=tip==='adet'&&pb?` "${String(pb).replace(/"/g,'')}"`:'';
    c.value=n; c.numFmt=(Number.isInteger(n)?'#,##0':'#,##0.00')+ek; return; }
  c.value=String(v);
}
function rpXlsToplam(ws,r,m,etiketSon,degerKol){
  const T=rpBToplamSatirlari(m);
  r++;
  T.forEach(t=>{ const l=ws.getCell(r,1); l.value=t.ad; l.font={name:'Arial',bold:!!t.kalin,size:10}; l.alignment={horizontal:'right'};
    if(etiketSon>1) ws.mergeCells(r,1,r,etiketSon);
    const c=ws.getCell(r,degerKol); rpXlsDeger(c,'para',t.v,t.pb); c.font={name:'Arial',bold:!!t.kalin,size:10};
    if(t.kalin){ c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE2EFDA'}}; c.border=rpXKenar(); }
    r++; });
  const n=ws.getCell(r,1); n.value=rpBToplamNot(m); n.font={name:'Arial',size:8.5,italic:true,color:{argb:'FF55555B'}};
  return r;
}
function rpTakipXls(ws,m){
  const F='Arial', H=5;
  const W=[11,20,32,10,16,13,15,11,22,16,34]; W.forEach((w,i)=>{ ws.getColumn(i+1).width=w; });
  rpXlsBaslik(ws,m,11,(m.bilgi||[]).map(([k,v])=>`${k}: ${v}`));
  rpXlsHeader(ws,H,['Tarih','Müşteri','Ürün / iş kalemi','Adet','Baskı merkezi','Ölçü',m.bedelAd,'Montaj tarihi','Montaj yeri','Montajı yapan','Not'],'FFFFE699',99);
  let r=H+1;
  const hucre=(rr,k,tip,v,pb,ek)=>{ const c=ws.getCell(rr,k); rpXlsDeger(c,tip,v,pb);
    c.font={name:F,size:10,...(ek&&ek.font||{})}; c.alignment={vertical:'top',wrapText:true,horizontal:ek&&ek.sag?'right':'left'}; c.border=rpXKenar(); return c; };
  m.satirlar.forEach(s=>{
    if(s.tip==='paket'){ const pk={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FB'}};
      for(let k=1;k<=11;k++){ const c=ws.getCell(r,k); c.fill=pk; c.border=rpXKenar(); }
      const u=ws.getCell(r,3); u.value={richText:[{text:'Paket bedeli — '+s.ad,font:{name:F,bold:true,size:10}},
        {text:`\n${s.kapsam} işlemi kapsar`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; bedel dağıtılmadı, toplama katılmadı (paketin tamamı ${rpPara(s.tutar,s.pb)})`),font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]};
      u.alignment={wrapText:true,vertical:'top'}; ws.mergeCells(r,3,r,6);
      const b=ws.getCell(r,7); if(s.tam) rpXlsDeger(b,'para',s.tutar,s.pb); else b.value='kısmi'; b.font={name:F,bold:true,size:10}; b.alignment={horizontal:'right',vertical:'top'};
      if(s.not){ const nn=ws.getCell(r,8); nn.value=s.not; nn.font={name:F,size:9}; nn.alignment={wrapText:true,vertical:'top'}; ws.mergeCells(r,8,r,11); }
      ws.getRow(r).height=32; r++; return; }
    const r0=r, n=s.rows.length;
    s.rows.forEach((x,i)=>{ const rr=r0+i;
      hucre(rr,1,'tarih',x.tarih);
      hucre(rr,2,'metin',x.musteri);
      const u=ws.getCell(rr,3); u.value=x.urunAlt?{richText:[{text:x.urun,font:{name:F,bold:true,size:10}},{text:'\n'+x.urunAlt,font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]}:x.urun;
      if(!x.urunAlt) u.font={name:F,bold:true,size:10}; u.alignment={vertical:'top',wrapText:true}; u.border=rpXKenar();
      hucre(rr,4,'adet',x.adet,x.birim,{sag:true});
      hucre(rr,5,'metin',x.merkez); hucre(rr,6,'metin',x.olcu);
      if(s.mSpan&&i<s.mSpan){ if(i===0){ hucre(rr,8,'tarih',x.mTarih); hucre(rr,9,'metin',x.mYer); hucre(rr,10,'metin',x.mYapan); } }
      else { hucre(rr,8,'tarih',x.kendi?x.mTarih:null); hucre(rr,9,'metin',x.kendi?x.mYer:null); hucre(rr,10,'metin',x.kendi?x.mYapan:null); }
      const sar=(t,w)=>String(t||'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/(w*1.05))),0);
      const satirN=Math.max(sar(x.urun,W[2])+(x.urunAlt?sar(x.urunAlt,W[2]*1.2):0),sar(x.musteri,W[1]),sar(x.merkez,W[4]),sar(x.olcu,W[5]),
        i===0||x.kendi?Math.max(sar(x.mYer,W[8]),sar(x.mYapan,W[9])):1);
      ws.getRow(rr).height=Math.max(18,satirN*13+4); });
    const b=ws.getCell(r0,7);
    if(s.paket){ b.value='pakette'; b.font={name:F,size:9,italic:true,color:{argb:'FF86868B'}}; }
    else if(s.bedel.length===1){ rpXlsDeger(b,'para',s.bedel[0].v,s.bedel[0].pb); b.font={name:F,size:10}; }
    else if(s.bedel.length>1){ b.value=rpParaListe(s.bedel); b.font={name:F,size:10}; }
    b.alignment={horizontal:'right',vertical:'top'}; b.border=rpXKenar();
    const nt=ws.getCell(r0,11); nt.value=s.not||null; nt.font={name:F,size:9}; nt.alignment={vertical:'top',wrapText:true}; nt.border=rpXKenar();
    if(n>1){ ws.mergeCells(r0,7,r0+n-1,7); ws.mergeCells(r0,11,r0+n-1,11); }
    if(s.mSpan>1) [8,9,10].forEach(k=>ws.mergeCells(r0,k,r0+s.mSpan-1,k));
    const notSatir=String(s.not||'').split('\n').reduce((t,l)=>t+Math.max(1,Math.ceil(l.length/(W[10]*1.15))),0);
    const mevcut=s.rows.reduce((t,_,i)=>t+(ws.getRow(r0+i).height||18),0);
    if(notSatir*12.5+4>mevcut) ws.getRow(r0+n-1).height=(ws.getRow(r0+n-1).height||18)+(notSatir*12.5+4-mevcut);
    r+=n; });
  const sonVeri=r-1;
  r=rpXlsToplam(ws,r,m,6,7);
  ws.views=[{state:'frozen',ySplit:H,xSplit:0,topLeftCell:'A'+(H+1),activeCell:'A'+(H+1)}];
  if(sonVeri>H) ws.autoFilter={from:{row:H,column:1},to:{row:H,column:11}};
  ws.pageSetup.printArea=`A1:K${r}`; ws.pageSetup.printTitlesRow=`${H}:${H}`;
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1; ws.pageSetup.fitToHeight=0;
}
function rpDokumXls(ws,m){
  const F='Arial'; let r=5;
  const W=[34,28,15,15,10,10,15,14,16]; W.forEach((w,i)=>{ ws.getColumn(i+1).width=w; });
  rpXlsBaslik(ws,m,9,[m.kurum?`Kurum: ${m.kurum}`:'',`İş: ${m.is||''}`]);
  const hucre=(rr,k,tip,v,pb,ek)=>{ const c=ws.getCell(rr,k); rpXlsDeger(c,tip,v,pb);
    c.font={name:F,size:10,...(ek&&ek.font||{})}; c.alignment={vertical:'top',wrapText:true,horizontal:ek&&ek.sag?'right':'left'}; c.border=rpXKenar(); return c; };
  const gri={italic:true,color:{argb:'FF86868B'}};
  const urunHucre=(rr,k,ust,alt,ek,gen)=>{ const c=ws.getCell(rr,k); const p=[ust&&{text:ust,font:{name:F,bold:true,size:10}},...[alt,ek].filter(Boolean).map(t=>({text:'\n'+t,font:{name:F,size:8.5,color:{argb:'FF55555B'}}}))].filter(Boolean);
    c.value=p.length>1?{richText:p}:ust; if(p.length===1) c.font={name:F,bold:true,size:10}; c.alignment={vertical:'top',wrapText:true}; c.border=rpXKenar();
    return Math.ceil(String(ust||'').length/((gen||W[0])*0.95))+[alt,ek].filter(Boolean).reduce((t,x)=>t+Math.ceil(x.length/((gen||W[0])*1.2)),0); };
  let ilkBaslik=0;
  m.bolumler.forEach(b=>{
    const t=ws.getCell(r,1); t.value=b.ad; t.font={name:F,bold:true,size:11}; r++;
    rpXlsHeader(ws,r,b.tip==='kalem'?['Ürün','Malzeme / cins','Baskı ölçüsü','Görünen alan','Yüzey adedi','Baskı adedi','Montaj bedeli','Birim fiyat','Tutar']
      :['Hizmet','Yer','Ölçü','','Yüzey adedi','Miktar','','Birim fiyat','Tutar'],'FFE3E9F4',4);
    if(!ilkBaslik) ilkBaslik=r; r++;
    b.satirlar.forEach(s=>{
      if(s.tip==='paket'){ const pk={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FB'}};
        for(let k=1;k<=9;k++){ const c=ws.getCell(r,k); c.fill=pk; c.border=rpXKenar(); }
        const u=ws.getCell(r,1); u.value={richText:[{text:`Paket bedeli — ${s.ad}`,font:{name:F,bold:true,size:10}},
          {text:`\n${s.kapsam} işlemi kapsar; aşağıdaki satır tutarları bilgi amaçlıdır`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; bedel dağıtılmadı, toplama katılmadı`)+(s.not?' · '+s.not:''),font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]};
        u.alignment={wrapText:true,vertical:'top'}; ws.mergeCells(r,1,r,8);
        const v=ws.getCell(r,9); if(s.tam) rpXlsDeger(v,'para',s.tutar,s.pb); else v.value='kısmi'; v.font={name:F,bold:true,size:10}; v.alignment={horizontal:'right',vertical:'top'};
        ws.getRow(r).height=32; r++; return; }
      if(s.tip==='hizmet'){
        const n=urunHucre(r,1,s.urun,s.urunAlt,s.not,W[0]+W[1]); ws.mergeCells(r,1,r,2);
        hucre(r,3,'metin',s.olcu); hucre(r,4,'metin',null); hucre(r,5,'tam',s.yuzey,null,{sag:true});
        hucre(r,6,'adet',s.adet,s.birim,{sag:true}); hucre(r,7,'metin',null);
        hucre(r,8,'para',s.birimFiyat,s.pb,{sag:true}); hucre(r,9,'para',s.tutar,s.pb,{sag:true,font:s.gri?gri:{}});
        ws.getRow(r).height=Math.max(18,n*12.5+4); r++; return; }
      const r0=r, n=s.rows.length;
      s.rows.forEach((x,i)=>{ const sN=urunHucre(r,1,x.urun,x.urunAlt,i===0?s.not:'');
        hucre(r,2,'metin',x.malzeme); hucre(r,3,'metin',x.olcu); hucre(r,4,'metin',x.gorunen);
        hucre(r,5,'tam',x.yuzey,null,{sag:true}); hucre(r,6,'adet',x.adet,x.birim&&x.birim!=='adet'?x.birim:'',{sag:true});
        hucre(r,8,'para',x.birimFiyat,x.pb,{sag:true}); hucre(r,9,'para',x.tutar,x.pb,{sag:true,font:x.gri?gri:{}});
        ws.getRow(r).height=Math.max(18,Math.max(sN,Math.ceil((x.malzeme||'').length/26))*12.5+4); r++; });
      const mc=ws.getCell(r0,7);
      if(!s.montaj) mc.value='—';
      else if(!s.montaj.bedel.length) mc.value='girilmemiş';
      else if(s.montaj.bedel.length===1) rpXlsDeger(mc,'para',s.montaj.bedel[0].v,s.montaj.bedel[0].pb);
      else mc.value=rpParaListe(s.montaj.bedel);
      if(s.montaj&&s.montaj.kapsar>1) mc.note=`${s.montaj.kapsar} kalemin ortak montajı — bedel bir kez sayılır.`;
      mc.font={name:F,size:10,...(s.montaj&&s.montaj.gri||!s.montaj||!s.montaj.bedel.length?gri:{})}; mc.alignment={horizontal:'right',vertical:'middle'}; mc.border=rpXKenar();
      if(n>1) ws.mergeCells(r0,7,r0+n-1,7);
    });
    r++;
  });
  if(!m.bolumler.length){ ws.getCell(r,1).value=m.bosMesaj||'Bu işte baskı / montaj kaydı yok.'; r++; }
  r=rpXlsToplam(ws,r-1,m,8,9);
  if(ilkBaslik) ws.views=[{state:'frozen',ySplit:ilkBaslik,xSplit:0,topLeftCell:'A'+(ilkBaslik+1),activeCell:'A'+(ilkBaslik+1)}];
  ws.pageSetup.printArea=`A1:I${r}`; if(ilkBaslik) ws.pageSetup.printTitlesRow=`${ilkBaslik}:${ilkBaslik}`;
  ws.pageSetup.fitToPage=true; ws.pageSetup.fitToWidth=1; ws.pageSetup.fitToHeight=0;
}
function rpBaskiKurum(v){ const a=rpAyar('baski'); a.kurum=v; const d=(rpDurum().veri||{}).baski;
  if(a.is&&d){ const j=d.jobs.find(x=>x.id===+a.is); if(!j||String(j.customer_id)!==String(v)&&v) a.is=''; }
  rpKontrolCiz('baski'); rpYenile('baski'); }
function rpBaskiIs(v){ const a=rpAyar('baski'); a.is=v?+v:''; a.isler=[]; const d=(rpDurum().veri||{}).baski;
  if(a.is&&d){ const j=d.jobs.find(x=>x.id===a.is); if(j&&j.customer_id) a.kurum=j.customer_id; }
  rpDurum().baslik.baski=null; rpKontrolCiz('baski'); rpYenile('baski'); }

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
  /* S14: art arda boş günler tek satırda ("Perşembe, 1 Ekim – Pazar, 4 Ekim").
     Önizleme ve PDF aynı gruplamayı kullanır. */
  gunGrup(gunler,dolu){ const out=[];
    gunler.forEach(g=>{ const s=out[out.length-1];
      if(!dolu(g)&&s&&s.bos) s.son=g.ad; else out.push({ad:g.ad,g,bos:!dolu(g)}); });
    return out.map(x=>({...x,ad:x.son?`${x.ad} – ${x.son}`:x.ad,cok:!!x.son})); },
  onizle(m,a){
    const T='plan';
    const madde=it=>`<label class="rp2-row ${it.dahil?'':'dis'}">${rpCb(T,it.key,it.dahil,'Plana dahil')}
      <span class="rp2-tip ${it.tip}">${it.tip==='randevu'?(it.saat||'Randevu'):it.tip==='op'?'İş':it.tip==='gelisme'?'Bilgi':'Yapılacak'}</span>
      <span class="rp2-det"><b>${esc(it.baslik)}</b>${it.acil?' <span class="rp2-t uyari">ACİL</span>':''}${it.gec?` <span class="rp2-t uyari">${it.gec} gün gecikti</span>`:''}
        ${[it.is,it.kurum,it.yer,it.kisi,it.tel,it.adres].filter(Boolean).length?`<em>${esc([it.is,it.kurum,it.yer,it.kisi,it.tel,it.adres].filter(Boolean).join(' · '))}</em>`:''}</span></label>`;
    let h='';
    if(m.baskasi) h+='<div class="rp2-not">Bu plan başka bir kişi için: kişisel randevular dahil değildir.</div>';
    if(m.geciken.length) h+=`<h5 class="rp2-g1">Geciken</h5><div class="rp2-rows">${m.geciken.map(madde).join('')}</div>`;
    RPD_PLAN.gunGrup(m.gunler,g=>g.maddeler.length).forEach(x=>{ h+=`<h5 class="rp2-g1">${esc(x.ad)}</h5>${!x.bos?`<div class="rp2-rows">${x.g.maddeler.map(madde).join('')}</div>`:`<p class="empty">${x.cok?'Bu günlerde':'Bu gün için'} kayıtlı iş yok.</p>`}`; });
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
    /* S14: başlık ilk maddesiyle AYNI bölünmez blokta — sayfa sonunda tek
       başına kalmaz (önceki kural yalnız tabloları tanıyordu). */
    const bolum=(bas,ogeler,bosMetin,ara)=>{ const b={...(typeof bas==='string'?rpH2(bas):bas),headlineLevel:undefined};
      if(!ogeler.length){ ic.push({stack:[b,...(ara?[ara]:[]),{text:bosMetin,style:'bos'}],unbreakable:true}); return; }
      ic.push({stack:[b,...(ara?[ara]:[]),ogeler[0]],unbreakable:true}); ogeler.slice(1).forEach(x=>ic.push(x)); };
    ic.push({text:'Çevrimdışı kopya: üzerine yapılan işaretler uygulamaya aktarılmaz; tamamlanan işleri uygulamada ayrıca işaretleyin.',style:'not',margin:[0,0,0,8]});
    const ge=m.geciken.filter(x=>x.dahil);
    if(ge.length) bolum(rpH2('Geciken',{color:RPC.kirmizi}),ge.map(satir));
    RPD_PLAN.gunGrup(m.gunler,g=>g.maddeler.some(x=>x.dahil)).forEach(x=>
      bolum(x.ad,x.bos?[]:x.g.maddeler.filter(y=>y.dahil).map(satir),x.cok?'Bu günlerde kayıtlı iş yok.':'Bu gün için kayıtlı iş yok.'));
    if(a.tarihsiz) bolum('Tarihi belirlenmemiş',m.tarihsiz.filter(x=>x.dahil).map(satir),'Yok.');
    if(a.gelisme) bolum('Bilmen gereken gelişmeler',m.gelismeler.filter(x=>x.dahil).map(gelSatir),'Seçilmiş gelişme yok.',
      {text:'Bilgi içindir; yapılacak iş değildir.',style:'not',margin:[0,0,0,6]});
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
        ${rpChk(T,'kisiler',a.kisiler,'Taraflar ve ilgili kişiler','iletişim bilgisi')}
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
    if(m.kisiler) h+=`<h5 class="rp2-g1">Taraflar ve ilgili kişiler</h5>${m.kisiler.length?m.kisiler.map(k=>`<p class="rp2-ozet"><b>${esc(k.ad)}</b> — ${esc(k.rol)}${k.tel?' · '+esc(k.tel):''}${k.eposta?' · '+esc(k.eposta):''}</p>`).join(''):'<p class="empty">Kayıtlı kişi yok.</p>'}
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
      ic.push(rpBolum('Taraflar ve ilgili kişiler',[{b:'Ad',g:150},{b:'Rol',g:'*'},{b:'Telefon',g:90},{b:'E-posta',g:130}],m.kisiler.map(k=>[{text:k.ad,bold:true},k.rol,k.tel||'—',k.eposta||'—']),'Kayıtlı kişi yok.'));
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
