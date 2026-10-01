/* =====================================================================
   RAPORLAR V2 (Sprint 12, S16 yapısı) — kullanıma hazır PDF / Excel
   ---------------------------------------------------------------------
   Dört rapor, dört kullanım amacı: Mecra doluluk tablosu · Baskı/montaj
   takip tablosu · İş dökümü · Kişisel çalışma planım. İç / dış paylaşım
   seçimi YALNIZ mecra tablosundadır; diğer üçü iç kullanım içindir.
   Hepsi KANONİK kayıtların salt-okunur projeksiyonudur;
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
    pageMargins:kucuk?[28,40,28,38]:[36,o.sayfaUstu?66:44,36,40],
    info:{title:m.baslik, author:'Medyapark', subject:m.tur, creator:'Medyapark', producer:'Medyapark', keywords:''},
    header:(p)=>p>1?{stack:[{columns:[{width:'*',text:[{text:'MEDYA',bold:true},{text:'PARK',bold:true,color:RPC.accent},{text:'  ·  '+rpKisalt(m.baslik,kucuk?44:78),color:RPC.ink2}],noWrap:true},
        {width:'auto',text:m.tur,noWrap:true,alignment:'right',color:RPC.ink3,margin:[12,0,0,0]}],fontSize:7.5},
        /* S16: tablo sütun başlığı her sayfanın üstünde (aynı genişliklerle). */
        ...(o.sayfaUstu?[{...o.sayfaUstu(),margin:[0,6,0,0]}]:[])],margin:kucuk?[28,18,28,0]:[36,20,36,0]}:null,
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
    /* S18: not/açıklama sabit üst alanda değil, verinin altında (rpXlsAltNot). */
    const H=3;
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
    const altNot=rpXlsAltNot(ws,alt2+1,s.kol.length,[s.not?{t:s.not}:null,m.aciklama&&m.aciklama!==s.not?{t:m.aciklama}:null]);
    ws.pageSetup.printArea=`A1:${kolHarf}${altNot}`;
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

/* ==========================================================
   GİRİŞ EKRANI
   ========================================================== */
const RP_KART=[
  {tur:'mecra',ad:'Mecra doluluk tablosu',ikon:'media',dosya:'PDF · Excel',
   ac:'Ürün başına ayrı sayfa, yüzeyler satırlarda, aylar sütunlarda: kurum ya da durum ve kesin tarihler. İç kullanım ya da dışarıya gönderim için.'},
  {tur:'baski',ad:'Baskı / montaj takip tablosu',ikon:'truck',dosya:'PDF · Excel',
   ac:'Dönemin baskı, montaj ve söküm kalemleri kurum/iş gruplarıyla: uygulama durumu ve maliyetler.'},
  {tur:'is',ad:'İş dökümü',ikon:'jobs',dosya:'PDF',
   ac:'Tek bir işin özeti, yayınları, baskı/montaj maliyetleri, önemli geçmişi ve belgeleri tek belgede.'},
  {tur:'plan',ad:'Kişisel çalışma planım',ikon:'notes',dosya:'PDF',
   ac:'Gecikenler, günlere göre yapılacaklar ve tarihsiz aksiyonlarınız; telefonda okunur, çevrimdışı.'}];
async function raporlar(c){
  const st=history.state;
  const tur=(st&&st.mp&&st.v==='rapor'&&st.s==='raporlar')?RP_TURLER[(st.id||1)-1]:null;
  if(tur) return rpEkran(c,tur);
  navKayit('sec','raporlar');
  /* S16: "Hızlı Excel tabloları" KALDIRILDI — dört rapor rakipsiz tek
     seçenektir. İş listesi İşler › Liste'den, teklif listesi Teklifler
     ekranından Excel'e aktarılır. */
  c.innerHTML=`<div class="sec-head"><div><h3>Raporlar</h3>
      <p class="sub">Dört hazır çıktı. Rapor hazırlamak hiçbir kaydı değiştirmez.</p></div></div>
    <div class="rp2-kartlar">${RP_KART.map(k=>`<button type="button" class="rp2-kart" onclick="rpAc('${k.tur}')">
        <span class="rp2-kart-i">${ic(k.ikon,20)}</span><b>${esc(k.ad)}</b><em>${esc(k.ac)}</em>
        <span class="rp2-kart-f">${k.dosya} ›</span></button>`).join('')}</div>`;
}
/* Bir rapora bağlamdan girilebilir: preset = {is, kurum, site, bas, bit…}. */
/* S16: eski bağlantılar yeni karşılığına açılır — "işe özel döküm" ve
   "iş özeti" İş dökümüdür; kaldırılan ayarlar (iç/dış, alıcı, şablon,
   kişi) sessizce düşer, rakip bir rapor olarak yaşamaz. */
function rpEskiBaglanti(tur,preset){
  if(tur==='baski'&&preset&&preset.sablon==='dokum') return ['is',{is:rpBIs(preset)||0}];
  if(!RP_TURLER.includes(tur)) return ['mecra',null];
  if(preset&&tur!=='mecra'){ const v=RPD[tur].varsayilan();
    preset=Object.fromEntries(Object.entries(preset).filter(([k])=>k in v||(tur==='baski'&&k==='isler'))); }
  return [tur,preset];
}
async function rpAc(tur,preset){
  [tur,preset]=rpEskiBaglanti(tur,preset);
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
    <div class="rp2">
      <section class="rp2-card" aria-labelledby="rpK1"><h4 id="rpK1"><span>1</span> Seçimler</h4><div id="rpKapsam"></div><div id="rpAlici"></div></section>
      <section class="rp2-card rp2-on" aria-labelledby="rpK3"><h4 id="rpK3"><span>2</span> Önizleme ve indirme</h4>
        <div class="rp2-bar" id="rpBar"></div><div id="rpNot" role="status" aria-live="polite"></div><div id="rpPrev"></div></section>
    </div>`;
  rpKontrolCiz(tur);
  await rpYenile(tur,{veri:true});
}
function rpKontrolCiz(tur){
  const D=RPD[tur], a=rpAyar(tur), R=rpDurum();
  const kk=document.getElementById('rpKapsam'); if(kk) kk.innerHTML=D.kontroller(a);
  const al=document.getElementById('rpAlici');
  /* S15 sade düzen; S16: başlık/alıcı/açıklama YALNIZ mecra tablosunda
     (dışarıya gönderilebilen tek rapor). Diğer raporların başlığı otomatiktir. */
  if(!al) return;
  if(!D.metinAyar){ al.innerHTML=''; return; }
  al.innerHTML=`<details class="rp2-adv" ${R.metinAcik?'open':''} ontoggle="rpDurum().metinAcik=this.open"><summary>Başlık, alıcı ve açıklama <span class="muted">— isteğe bağlı</span></summary>
      <div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpBaslik">Rapor başlığı</label>
          <input class="inp" id="rpBaslik" value="${esc(R.baslik[tur]||'')}" placeholder="${esc(D.baslik(a,R.veri[tur]))}" oninput="rpMetin('${tur}')"></div>
        <div class="field"><label class="flabel" for="rpAliciAd">Alıcı</label>
          <input class="inp" id="rpAliciAd" value="${esc(a._aliciAd||'')}" placeholder="ör. ABC Ajans — Medya Planlama" oninput="rpMetin('${tur}')"></div></div>
      <div class="field"><label class="flabel" for="rpAciklama">Kısa açıklama (yalnız bu rapora ait)</label>
        <textarea class="inp" id="rpAciklama" rows="2" maxlength="600" oninput="rpMetin('${tur}')" placeholder="Rapora eklenecek bir iki cümle. Kaynak kayıtlardaki notlar değişmez.">${esc(a._aciklama||'')}</textarea></div></details>`;
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
  m.baslik=(D.metinAyar&&R.baslik[tur])||D.baslik(a,v);
  m.alici=D.metinAyar?(a._aliciAd||''):''; m.aciklama=D.metinAyar?(a._aciklama||''):''; m.an=v.okunma;
  m.dis=!!D.metinAyar&&a._alici==='dis';
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
  /* Model sayılarını gösteren kontroller (İş dökümü bölüm sayıları). */
  if(D.kontrolModelle){ const kk=document.getElementById('rpKapsam'); if(kk) kk.innerHTML=D.kontroller(rpAyar(tur)); }
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
      `<b>${say.dahil}</b> ${esc(say.birim)} raporda${D.secimli===false?'':` <span class="muted">· filtrelenen ${say.filtre}${say.cik?` · çıkarılan ${say.cik}`:''}</span>`}`:''}</div>
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
const rpKisaAd=(ad,max)=>mdKisaAd(ad,max);
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
  const yuzler=[], led=[]; let pasif=0, sira=0;
  siteler.forEach(m=>{
    const alanlar=[...(M.altByMec[m.id]||[])].filter(x=>!mdArsiv(x));
    const yetim=M.orphanByMec[m.id]||[];
    if(yetim.length) alanlar.push({id:'x'+m.id,name:'Diğer pozisyonlar',_sahte:true,mecra_id:m.id});
    alanlar.forEach(al=>{
      if(a.urun&&(al._sahte||String(al.product_id)!==String(a.urun))) return;
      const s=sira++;                                  /* mecra → alan sırası: sayfa sırası budur */
      if(mdEszamanli(al)){ led.push({m,al,sira:s}); return; }
      (al._sahte?yetim:(M.unitsByAlt[al.id]||[])).forEach(u=>{
        const p=rpYuzAyir(u.name);
        if(u.active===false){ pasif++; return; }
        yuzler.push({key:'u'+u.id,u,al,m,sira:s,kod:u.name,pano:p.base,yuz:p.yuz,aile:al._sahte?'Diğer pozisyonlar':mdAile(M,al),
          olcu:u.olcu||((M.prods.find(x=>String(x.id)===String(u.product_id||al.product_id))||{}).olcu)||''});
      });
    });
  });
  return {siteler,yuzler,led,pasif};
}
/* S16: gün gün dilim, dönem ayları ve ay hücresi Mecralar ekranıyla
   ORTAK hesaptır (medya.js › mdGunDilim / mdDonemAylari / mdAyHucre).
   Rapor yalnız hücre metnini kendi diliyle yazar (iç: kurum, dış: durum). */
const rpYuzSerit=(M,u,b,e,ref)=>mdGunDilim(M,u,b,e,ref);
const rpDonemAylari=(b,e)=>mdDonemAylari(b,e);
function rpDolHucre(seg,ay){
  const h=mdAyHucre(seg,ay);
  const parca=h.parca.map(p=>{ const s=p.seg, ayTamami=p.s===ay.s&&p.e===ay.e;
    let ust, alt;
    if(p.tip==='musait'){ ust='Müsait'; alt=ayTamami&&ay.tam?'':p.s===p.e?rpTrKisa(p.s):`${rpTrKisa(p.s)}–${rpTrKisa(p.e)}`; }
    else {
      ust=s.kim?(s.tip==='opsiyon'?'Opsiyon · '+s.kim:s.kim):RP_DR[s.tip].ad;
      alt=s.aylik?`${RP_AY3[+s.ks.slice(5,7)-1]} ${s.ks.slice(0,4)} · ay bazlı kayıt`
        :s.ke==null?`${rpTr(s.ks)} – bitiş belirsiz`:rpAralik(s.ks,s.ke);
      if(s.opsSure) alt+=' · opsiyon süresi doldu';
    }
    return {tip:p.tip,s:p.s,e:p.e,gun:p.gun,ust,alt}; });
  return {parca,dilim:h.dilim,tip:h.tip};
}
/* S17: Raporlar › Mecra doluluk tablosu ile Mecralar'dan doğrudan Excel
   AYNI yüz dilimini ve pano düzenini kullanır. Kısa kurum etiketi
   (elle tutulan tablodaki "WORK LOUNGE", "EKİM KOLEJİ" gibi): tüzel ekler
   atılır, sözcük sınırında en çok 22 karakter; yarım bağlaç ve üç nokta yok. */
function rpKimKisa(M,r){
  if(r.customer_id&&M.cmap[r.customer_id]) return rpKisaAd(M.cmap[r.customer_id],22);
  if(r.work_id&&M.jmap[r.work_id]) return rpKisaAd(M.jmap[r.work_id].title||'',22);
  return null; }
/* Bir yüzün dönem dilimleri rapor diliyle. `ic` değilse kurum adı ve iç
   ayrıntı (opsiyon süresi) modele HİÇ girmez. */
function rpYuzSegModel(M,u,b,e,ref,ic){
  return rpYuzSerit(M,u,b,e,ref).map(s=>({s:s.s,e:s.e,gun:s.gun,tip:s.tip,acikUc:s.acikUc,aylik:s.aylik,
    opsSure:ic&&s.opsSure,ks:s.r?s.r.block_start:null,ke:s.r?s.r.block_end:null,kim:ic&&s.r?rpKimKisa(M,s.r):null}));
}
/* Bir sayfanın panoları: aynı pano kodunun yüzleri (A/B) tek pano, doğal
   sıralı; `dahil` rapor seçimini (Raporlar) ya da her şeyi (Mecralar) söyler. */
function rpPanolar(ys,aylar,dahil){
  const dogal=(x,y)=>String(x).localeCompare(String(y),'tr',{numeric:true});
  const pm=new Map(); [...ys].sort((x,y)=>dogal(x.pano,y.pano)||dogal(x.yuz,y.yuz)).forEach(y=>{ if(!pm.has(y.pano)) pm.set(y.pano,[]); pm.get(y.pano).push(y); });
  let no=0;
  return [...pm.entries()].map(([pano,l])=>{ const yz=l.map(y=>({key:y.key,kod:y.kod,yuz:y.yuz,dahil:dahil(y),
      seg:y.seg,bos:y.seg.filter(s=>s.tip==='musait').map(s=>({s:s.s,e:s.e,gun:s.gun})),tam:y.seg.length===1&&y.seg[0].tip==='musait',
      hucre:aylar.map(ay=>rpDolHucre(y.seg,ay))}));
    const d=yz.some(f=>f.dahil); return {pano,no:d?++no:null,dahil:d,yuzler:yz}; });
}
/* ==========================================================
   LED YAYIN ALANI — TEK AYLIK MODEL (S19)
   Mecralar'dan doğrudan Excel ile Raporlar (önizleme, PDF, Excel; tekil
   ve "tüm mecralar") AYNI modeli ve AYNI sayfa üreticisini (rpXlsLedAylik)
   kullanır: satır = kampanya, aylar sütunda, ayda kampanyanın dönemle
   kırpılmış günleri. Kampanyasız ay BOŞTUR — "Müsait" yazılmaz, kapasite
   hesaplanmaz. Her yayın alanı kendi sayfasıdır; alanlar tek listede
   birleştirilmez.
   `ic` değilse kurum ve iş adı modele HİÇ girmez (rpLedDisAd).
   ========================================================== */
/* Dış paylaşımda kampanya satırının etiketi: sıra numarası (başlangıç
   tarihine göre). Kurum/iş adından TÜRETİLMEZ. */
function rpLedDisAd(i){ return `Kampanya ${i+1}`; }
function rpLedAyMetin(r,ay){ const p=mdLedAyParca(r,ay);
  return p?(p.tamAy?'Tüm ay':p.s===p.e?rpTrKisa(p.s):`${rpTrKisa(p.s)}–${rpTrKisa(p.e)}`):''; }
function rpLedAlanModel(M,mc,al,kayitlar,aylar,gun,ic,kull){
  const kisa=rpMecraKisa(mc.name);
  const ad=String(al.name).toLocaleLowerCase('tr').startsWith(kisa.toLocaleLowerCase('tr'))?al.name:`${kisa} ${al.name}`;
  return {key:'led'+al.id,ad:rpSayfaAdi(ad,kull),mecra:mc.name,baslik:`${mc.name} · ${al.name}`,sure:mdSure(al),
    kayitlar:kayitlar.map((r,i)=>{ const km=mdKayitMetin(r,gun);
      return {key:'l'+mdKayitKey(r),dahil:true,
        kurum:ic?(r.customer_name?mdKisaAd(r.customer_name,30):'Kurum belirtilmemiş'):rpLedDisAd(i),
        is:ic?(r.work_title||(r.record_kind==='legacy'?'eski kayıt':'')):'',
        durum:km.durum,donem:km.donem,tip:r.commitment==='reserved'?'opsiyon':'yayin',
        aylar:aylar.map(ay=>rpLedAyMetin(r,ay))}; })};
}
/* Rapor bölümleri mecra → alan sırasıyla: statik ürün sayfası ya da LED alanı. */
function rpMecraBolumler(m){
  return [...m.sayfalar.map(sf=>({sira:sf.sira,sf})),...m.led.map(L=>({sira:L.sira,L}))].sort((a,b)=>a.sira-b.sira);
}
const RP_LED_NOT='Her satır bir kampanyadır; aynı ayda birden çok kampanya yayında olabilir. Boş ay satılabilir boş slot anlamına gelmez; LED kapasitesi hesaplanmaz.';
RPD_MECRA={
  metinAyar:true,
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
    /* Kurum etiketi YALNIZ iç kullanımda kurulur; dış modelde yoktur (rpYuzSegModel). */
    const gorunen=new Set();
    let yuzler=K.yuzler.map(y=>{
      const seg=rpYuzSegModel(M,y.u,a.bas,a.bit,ref,ic);
      const bos=seg.filter(s=>s.tip==='musait').map(s=>({s:s.s,e:s.e,gun:s.gun}));
      return {...y,seg,bos,tam:seg.length===1&&seg[0].tip==='musait'};
    });
    if(a.tamMusait) yuzler=yuzler.filter(y=>y.tam);
    yuzler.forEach(y=>gorunen.add(y.key));
    /* LED — eşzamanlı yayın; statik müsaitliğe ve yüz sayısına katılmaz. */
    const ledAlan=[];
    if(!a.tamMusait) K.led.forEach(({m,al,sira})=>{
      const l=(M.byArea[al.id]||[]).filter(r=>r.commitment!=='cancelled'&&r.block_start<=a.bit&&(r.block_end==null||r.block_end>=a.bas))
        .sort((x,y)=>String(x.block_start).localeCompare(String(y.block_start))||((x.placement_id||0)-(y.placement_id||0)));
      if(!l.length) return;
      l.forEach(r=>gorunen.add('l'+mdKayitKey(r)));
      ledAlan.push({m,al,sira,l}); });
    out.budanan=rpBuda(T,gorunen);
    /* Lokasyon + ürün ailesi = bir sayfa; pano = A/B çifti. */
    const gm=new Map(), kull=new Set();
    yuzler.forEach(y=>{ const k=y.m.id+'|'+y.al.id; if(!gm.has(k)) gm.set(k,{m:y.m,al:y.al,aile:y.aile,sira:y.sira,ys:[]}); gm.get(k).ys.push(y); });
    const dogal=(x,y)=>String(x).localeCompare(String(y),'tr',{numeric:true});
    out.sayfalar=[...gm.values()].map(g=>{
      const panolar=rpPanolar(g.ys,out.aylar,y=>rpDahil(T,y.key));
      const olculer=[...new Set(g.ys.map(y=>y.olcu).filter(Boolean))];
      return {key:g.m.id+'|'+g.al.id,sira:g.sira,mecra:g.m.name,aile:g.aile,baslik:`${g.m.name} · ${g.aile}`,
        ad:rpSayfaAdi(`${rpMecraKisa(g.m.name)} ${g.aile}`,kull),olcu:olculer.length===1?olculer[0]:'',panolar};
    });
    /* LED: her yayın alanı kendi aylık sayfası (Mecralar'ın doğrudan Excel'iyle aynı model). */
    out.led=ledAlan.map(x=>{ const L=rpLedAlanModel(M,x.m,x.al,x.l,out.aylar,ref,ic,kull); L.sira=x.sira;
      L.kayitlar.forEach(k=>{ k.dahil=rpDahil(T,k.key); }); return L; });
    const ledSatir=out.led.flatMap(L=>L.kayitlar);
    const dahilY=yuzler.filter(y=>rpDahil(T,y.key)), dahilL=ledSatir.filter(l=>l.dahil);
    out.dahilYuzSay=dahilY.length; out.dahilLedSay=dahilL.length; out.pasif=K.pasif; out.toplamYuz=K.yuzler.length;
    out.tamMusait=!!a.tamMusait;
    const lk=[...new Set(dahilY.map(y=>y.m.name).concat(out.led.filter(L=>L.kayitlar.some(k=>k.dahil)).map(L=>L.mecra)))];
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
    rpMecraBolumler(m).forEach(({sf,L})=>{
      if(L){ const keys=L.kayitlar.map(k=>k.key);
        h+=`<div class="rp3-sh"><h5 class="rp2-g1">${esc(L.baslik)} <em>LED · eşzamanlı yayın${L.sure?' · kreatif '+esc(L.sure):''}</em> <span class="rp3-sa">Excel sayfası: ${esc(L.ad)}</span></h5>
          <span class="rp3-tum"><button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},true)'>tümü</button>
          <button type="button" class="btn-link" onclick='rpSecTopluKey("mecra",${JSON.stringify(keys)},false)'>hiçbiri</button></span></div>
          <div class="rp3-kap"><table class="rp3-tab rp3-led"><thead><tr><th scope="col">Kampanya</th><th scope="col">Durum</th><th scope="col">Dönem</th>${m.aylar.map(a=>`<th scope="col">${esc(a.kisa)}</th>`).join('')}</tr></thead><tbody>
          ${L.kayitlar.map(k=>`<tr class="son${k.dahil?'':' dis'}">
            <td class="rp3-kmp"><label>${rpCb(T,k.key,k.dahil,k.kurum+' rapora dahil')} <b>${esc(k.kurum)}</b></label>${k.is?`<small>${esc(k.is)}</small>`:''}</td>
            <td class="rp3-ld" style="color:${RP_DR[k.tip].ink}"><b>${esc(k.durum)}</b></td><td class="rp3-ldn">${esc(k.donem)}</td>
            ${k.aylar.map(t=>t?`<td class="rp3-lay" style="background:${RP_DR[k.tip].fill};color:${RP_DR[k.tip].ink}"><b>${esc(t)}</b></td>`:'<td class="rp3-lay rp3-lbos"></td>').join('')}</tr>`).join('')}
          </tbody></table></div><p class="fhint rp3-lnot">${esc(RP_LED_NOT)}</p>`;
        return; }
      const keys=sf.panolar.flatMap(p=>p.yuzler.map(f=>f.key));
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
    return h;
  },
  pdf(m){
    const ic=[];
    ic.push({text:['yayin','opsiyon','musait','disi'].flatMap(t=>[{text:'  '+RP_DR[t].ad+'  ',background:RP_DR[t].fill,color:RP_DR[t].ink,bold:true},'   '])
      .concat([{text:'Ay içinde durum değişiyorsa hücre beyaz kalır; dilimler alt alta, üstteki şerit günlere göre.',color:RPC.ink3}]),fontSize:8.5,margin:[0,0,0,8]});
    const say=m.sayfalar.reduce((t,s)=>t+s.panolar.reduce((x,p)=>x+p.yuzler.filter(f=>f.dahil).length,0),0);
    if(!say&&!m.led.some(L=>L.kayitlar.some(k=>k.dahil))) ic.push({text:'Listelenecek yüzey yok.',style:'bos'});
    const W=770, noW=20, yuzW=46, LH=10.2, FS=8.3;
    const blok=[]; for(let i=0;i<m.aylar.length;i+=6) blok.push(m.aylar.slice(i,i+6).map((a,k)=>({a,i:i+k})));
    /* Yüz hücreleri A ve B için tüm ay sütunlarında AYNI yükseklikte tutulur
       (iç tablo `heights`), böylece bir pano tek tablo satırında kalır ve
       A/B çifti sayfa sonunda bölünmez. Yükseklik metin uzunluğundan tahmin edilir. */
    const satirSay=(t,kap)=>t?Math.max(1,Math.ceil(String(t).length/kap)):0;
    /* LED alanı: Excel sayfasıyla aynı okunuş — satır = kampanya, aylar sütunda (6 ay / tablo). */
    const ledPdf=L=>{ const kay=L.kayitlar.filter(k=>k.dahil); if(!kay.length) return;
      blok.forEach((ay,bi)=>{ const colW=Math.floor((W-150-62-84-8*(3+ay.length))/ay.length);
        ic.push(rpTablo([{b:'Kampanya',g:150},{b:'Durum',g:62},{b:'Dönem',g:84},...ay.map(({a})=>({b:a.kisa,g:colW}))],
          kay.map(k=>[{stack:[{text:k.kurum,bold:true},...(k.is?[{text:k.is,color:RPC.ink2,fontSize:7.6}]:[])]},
            {text:k.durum,bold:true,color:RP_DR[k.tip].ink},{text:k.donem,fontSize:7.8},
            ...ay.map(({i})=>k.aylar[i]?{text:k.aylar[i],bold:true,alignment:'center',fontSize:7.8,color:RP_DR[k.tip].ink,fillColor:RP_DR[k.tip].fill}:{text:''})]),
          {fs:8.3,ust:[{text:L.baslik+' — LED yayınları'+(bi?'  ·  devam':''),stil:'h2'},
            {text:(L.sure?'Kreatif: '+L.sure+'  ·  ':'')+RP_LED_NOT,stil:'not'}]})); }); };
    rpMecraBolumler(m).forEach(({sf,L})=>{
      if(L){ ledPdf(L); return; }
      const panolar=sf.panolar.map(p=>({...p,yuzler:p.yuzler.filter(f=>f.dahil)})).filter(p=>p.yuzler.length);
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
    return {icerik:ic,o:{yon:'landscape'}};
  },
  xlsx(m){
    /* S19: her LED yayın alanı kendi AYLIK sayfası — Mecralar'ın doğrudan
       Excel'iyle aynı üretici (rpXlsLedAylik). Toplu indirme için ayrı düz
       LED listesi TUTULMAZ. Sayfalar mecra → alan sırasındadır. */
    const S=[];
    rpMecraBolumler(m).forEach(({sf,L})=>{
      if(L){ const kay=L.kayitlar.filter(k=>k.dahil);
        if(kay.length) S.push({ad:L.ad,yon:'landscape',ozel:ws=>rpXlsLedAylik(ws,m,{...L,kayitlar:kay})});
        return; }
      const panolar=sf.panolar.map(p=>({...p,yuzler:p.yuzler.filter(f=>f.dahil)})).filter(p=>p.yuzler.length);
      if(panolar.length) S.push({ad:sf.ad,yon:'landscape',ozel:ws=>rpXlsDoluluk(ws,m,sf,panolar)}); });
    return S;
  },
  pdfVar:true
};
/* Excel doluluk sayfası — referans rezervasyon tablosunun düzeni:
   yüz başına iki satır (üstte kurum/durum, altta tarih), aylar sütunda.
   Ay içinde değişen hücre iki satır boyunca BİRLEŞİR ve dilimleri renk
   işaretiyle alt alta taşır (keskin geçişli dolgu Excel baskısında
   çizgili göründüğü için kullanılmaz). */
/* S18: sabit üst alan yalnız başlık (1), kısa dönem/kapsam (2) ve sütun
   başlıkları (3); veri 4. satırdan başlar. Renk anahtarı ve açıklama
   verinin ALTINDA tek bir alt nottur (rpXlsAltNot). */
function rpXlsDoluluk(ws,m,sf,panolar){
  const ay=m.aylar, F='Arial', H=3, son=2+ay.length, GEN=24;
  /* S17: bir haftadan kısa kısmi ay (ör. varsayılan dönemin "Haziran (30)"
     sütunu) dar sütundur; tam ay genişliğinde boş gri alan basılmaz. */
  const W=ay.map(a=>(!a.tam&&rpDn(a.e)-rpDn(a.s)+1<=7)?15:GEN);
  ws.getColumn(1).width=5; ws.getColumn(2).width=10; ay.forEach((_,i)=>{ ws.getColumn(3+i).width=W[i]; });
  const c1=ws.getCell(1,1); c1.value=`${sf.baslik} — doluluk tablosu`; c1.font={name:F,bold:true,size:14};
  const bilgi=[`Dönem: ${rpTr(m.bas)} – ${rpTr(m.bit)}`,m.kapsam||'',sf.olcu?`Ölçü: ${sf.olcu}`:'',m.ic?'İç kullanım':'Dış paylaşım',
    m.alici?`Hazırlanan: ${m.alici}`:'',`Hazırlanma: ${rpAnTr(m.an)}`].filter(Boolean).join('   ·   ');
  const c2=ws.getCell(2,1); c2.value=bilgi; c2.font={name:F,size:9,color:{argb:'FF55555B'}};
  const hr=ws.getRow(H); hr.height=30;
  [['No',1],['Yüz',2],...ay.map((a,i)=>[a.ad,3+i])].forEach(([t,k])=>{ const c=hr.getCell(k); c.value=t;
    c.font={name:F,bold:true,size:10}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE699'}};
    c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border=rpXKenar(); });
  const kalin={style:'medium',color:{argb:'FF6E6E75'}};
  /* Satır sayısı tahmini (Arial 10 kalın ≈ sütun genişliği × 0,85 karakter). */
  const kap=W.map(w=>Math.floor(w*0.85)), sat=(t,i)=>t?Math.max(1,Math.ceil(String(t).length/kap[i])):0;
  const renk=tip=>({argb:rpArgb(RP_DR[tip].ink)});
  let r=H+1;
  /* Elle sayfa sonu: pano (A/B çifti ve birleşik hücreler) iki sayfaya
     bölünmez. Ölçek, sütun genişliğinden ve fitToWidth'ten tahmin edilir. */
  /* Yedi aya kadar (Mecralar'ın varsayılan ±3 ayı) tek sayfa genişliği;
     daha uzun dönemde altı ay bir sayfa genişliği. */
  const sayfaGen=ay.length<=7?1:Math.ceil(ay.length/6);
  const genPt=[5,10,...W].reduce((t,w)=>t+(w*7+5)*0.75,0);
  const olcek=Math.min(1,(842-0.8*72)*sayfaGen/genPt*0.92);
  const sayfaYuk=(595-72-24)/olcek;
  let dolu=[1,2,H].reduce((t,k)=>t+(ws.getRow(k).height||15),0);
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
          h1=Math.max(h1,hc.parca.reduce((x,q)=>x+sat(q.ust,i),0)*13+5); h2=Math.max(h2,hc.parca.reduce((x,q)=>x+sat(q.alt,i),0)*11.5+4);
        } else {
          const runs=[]; let n=0;
          hc.parca.forEach(pc=>{ rpDilimSatir(pc).forEach((l,j)=>{
            if(j===0) runs.push({text:(runs.length?'\n':'')+'■ ',font:{name:F,size:10,color:{argb:rpArgb(RP_DR[pc.tip].bar)}}});
            else runs.push({text:'\n    ',font:{name:F,size:8.5}});
            runs.push({text:l.t,font:{name:F,bold:l.b,size:l.b?9.5:8.5,color:renk(pc.tip)}}); n+=sat('■ '+l.t,i); }); });
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
  const sonSatir=rpXlsAltNot(ws,r,son,[{renk:true},...(m.aciklama?[{t:m.aciklama}]:[])]);
  ws.views=[{state:'frozen',xSplit:2,ySplit:H,topLeftCell:'C'+(H+1),activeCell:'C'+(H+1)}];
  ws.pageSetup.printArea=`A1:${ws.getColumn(son).letter}${sonSatir}`;
  ws.pageSetup.printTitlesRow=`${H}:${H}`;
  ws.pageSetup.printTitlesColumn='A:B';
  /* Altı ay bir sayfa genişliği; on iki ay iki sayfa — yazı küçültülüp tek sayfaya sıkıştırılmaz. */
  /* Sabit ölçek (Excel "sığdır" açıkken elle sayfa sonlarını yok sayar). */
  ws.pageSetup.fitToPage=false; ws.pageSetup.scale=Math.max(40,Math.floor(olcek*100));
  ws.pageSetup.pageOrder='overThenDown';
}
/* S17 — LED yayın alanı, Mecralar ekranıyla aynı okunuş: satır = kampanya,
   aylar sütunda; ayda kampanyanın (dönemle kırpılmış) günleri. Kampanyasız
   ay BOŞ ve beyazdır — "müsait slot" yazılmaz, kapasite hesaplanmaz. */
function rpXlsLedAylik(ws,m,L){
  const ay=m.aylar, F='Arial', H=3, GEN=13, ilk=3, son=ilk+ay.length;
  [26,12,19,...ay.map(()=>GEN)].forEach((w,i)=>{ ws.getColumn(i+1).width=w; });
  const c1=ws.getCell(1,1); c1.value=`${L.baslik} — LED yayınları`; c1.font={name:F,bold:true,size:14};
  const c2=ws.getCell(2,1); c2.value=[`Dönem: ${rpTr(m.bas)} – ${rpTr(m.bit)}`,m.kapsam||'',L.sure?`Kreatif: ${L.sure}`:'',
    m.ic?'İç kullanım':'Dış paylaşım',m.alici?`Hazırlanan: ${m.alici}`:'',`Hazırlanma: ${rpAnTr(m.an)}`].filter(Boolean).join('   ·   ');
  c2.font={name:F,size:9,color:{argb:'FF55555B'}};
  const hr=ws.getRow(H); hr.height=30;
  ['Kampanya','Durum','Dönem',...ay.map(a=>a.ad)].forEach((t,i)=>{ const c=hr.getCell(i+1); c.value=t;
    c.font={name:F,bold:true,size:10}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFE699'}};
    c.alignment={horizontal:'center',vertical:'middle',wrapText:true}; c.border=rpXKenar(); });
  let r=H+1;
  L.kayitlar.forEach(k=>{
    const row=ws.getRow(r);
    const a=row.getCell(1); a.value={richText:[{text:k.kurum,font:{name:F,bold:true,size:10}},...(k.is?[{text:'\n'+k.is,font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]:[])]};
    const b=row.getCell(2); b.value=k.durum; b.font={name:F,bold:true,size:9.5,color:{argb:rpArgb(RP_DR[k.tip].ink)}};
    const c=row.getCell(3); c.value=k.donem; c.font={name:F,size:9};
    [a,b,c].forEach(x=>{ x.alignment={vertical:'middle',wrapText:true}; x.border=rpXKenar(); });
    k.aylar.forEach((t,i)=>{ const h=row.getCell(ilk+1+i);
      if(t){ h.value=t; h.font={name:F,bold:true,size:9.5,color:{argb:rpArgb(RP_DR[k.tip].ink)}};
        h.fill={type:'pattern',pattern:'solid',fgColor:{argb:rpArgb(RP_DR[k.tip].fill)}}; }
      h.alignment={horizontal:'center',vertical:'middle',wrapText:true}; h.border=rpXKenar(); });
    /* Satır yüksekliği metinden tahmin edilir (kırpılmasın): kurum ≈ 24, iş ≈ 30 karakter/satır. */
    const sat=(t,n)=>t?Math.ceil(String(t).length/n):0;
    row.height=Math.max(22,sat(k.kurum,24)*13+sat(k.is,30)*11+6,sat(k.durum,11)*12+6); r++;
  });
  const sonSatir=rpXlsAltNot(ws,r,son,[{t:RP_LED_NOT},
    ...(m.aciklama?[{t:m.aciklama}]:[])]);
  ws.views=[{state:'frozen',xSplit:ilk,ySplit:H,topLeftCell:ws.getCell(H+1,ilk+1).address,activeCell:ws.getCell(H+1,ilk+1).address}];
  ws.pageSetup.printArea=`A1:${ws.getColumn(son).letter}${sonSatir}`;
  ws.pageSetup.printTitlesRow=`${H}:${H}`;
  ws.pageSetup.printTitlesColumn='A:C';
}
/* S18 — verinin altında tek alt not (sabit üst alanda değil). `r` son veri
   satırından sonraki satırdır; bir boş satır bırakılır. Satırlar tablonun
   genişliği boyunca birleştirilir (metin kaydırılır). Son yazılan satırı döner.
   {renk:true} doluluk renk anahtarıdır (renk metinle birlikte). */
function rpXlsAltNot(ws,r,sonKol,notlar){
  const F='Arial'; let rr=r;
  notlar.filter(n=>n&&(n.renk||n.t)).forEach(n=>{ rr++;
    const c=ws.getCell(rr,1);
    if(n.renk) c.value={richText:[{text:'Renk anahtarı:  ',font:{name:F,bold:true,size:8.5,color:{argb:'FF55555B'}}},
      ...['yayin','opsiyon','musait','disi'].flatMap(t=>[{text:'■ ',font:{name:F,size:10,color:{argb:rpArgb(RP_DR[t].bar)}}},
        {text:RP_DR[t].ad+(t==='disi'?' (müsait sayılmaz)':'')+'    ',font:{name:F,size:8.5,color:{argb:rpArgb(RP_DR[t].ink)}}}]),
      {text:'·  Ay içinde durum değişen hücrede dilimler tarihleriyle alt alta yazılır.',font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]};
    else { c.value=String(n.t); c.font={name:F,size:8.5,italic:true,color:{argb:'FF55555B'}}; }
    c.alignment={wrapText:true,vertical:'top'};
    if(sonKol>1) ws.mergeCells(rr,1,rr,sonKol);
    const uz=n.renk?120:String(n.t).length;
    ws.getRow(rr).height=Math.max(15,Math.ceil(uz/Math.max(40,sonKol*14))*12+4);
  });
  return rr;
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
/* S19: üç durum — Yapılacak / Tamamlandı / İptal (eski değerler Yapılacak'tır). */
const RP_OPDURUM={planned:'Yapılacak',waiting:'Yapılacak',in_progress:'Yapılacak',done:'Tamamlandı',cancelled:'İptal'};
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

/* ---------- Ortak üretim kalemi hesabı (takip tablosu + İş dökümü) ----------
   ÜRETİM KALEMİ = aynı `kalem_key`i taşıyan işlemler (PS15). Bağ yalnız
   kullanıcının kurduğu kayıttan okunur; isim benzerliği ya da satır
   sırasıyla eşleştirme YAPILMAZ. Tutar kuralları S12'den değişmedi:
     · bedel = kayıtlı MALİYET (üç rapor da iç kullanım içindir)
     · her para birimi ayrı toplanır; girilmemiş tutar 0 sayılmaz
     · paket bedeli BİR kez sayılır; paketin tamamı rapordaysa toplama
       girer, kısmen rapordaysa toplama girmez ve dağıtılmaz
     · paket içindeki satır tutarları bilgi amaçlıdır
     · bir montaj birden çok baskıyı kapsıyorsa bedeli bir kez görünür
     · KDV, indirim, kâr varsayılmaz */
const rpMaliyet=o=>o.cost==null||o.cost===''?null:+o.cost;
function rpKalemleriKur(ops,jm){
  const km=new Map(); ops.forEach(o=>{ const k=o.kalem_key||('t'+o.id); if(!km.has(k)) km.set(k,[]); km.get(k).push(o); });
  const turSira={baski:0,montaj:1,sokum:2,diger:3};
  return [...km.entries()].map(([key,l])=>{ l.sort((x,y)=>turSira[x.operation_type]-turSira[y.operation_type]||x.id-y.id);
    const b=l.filter(o=>o.operation_type==='baski'&&o.planned_date).map(o=>o.planned_date).sort();
    const t=l.map(o=>o.planned_date).filter(Boolean).sort();
    return {key,ops:l,tarih:b[0]||t[0]||null,job:jm[l[0].job_id],ilkId:Math.min(...l.map(o=>o.id))}; });
}
/* Paketin kapsamı iptal edilmemiş TÜM işlemleridir; rapordaki payı ayrı sayılır. */
function rpPaketKur(dahil,tum,gm){
  const kap={}; tum.forEach(o=>{ if(o.price_group_id&&o.status!=='cancelled') (kap[o.price_group_id]=kap[o.price_group_id]||[]).push(o.id); });
  const rap={}; dahil.forEach(o=>{ if(o.price_group_id&&gm[o.price_group_id]) (rap[o.price_group_id]=rap[o.price_group_id]||new Set()).add(o.id); });
  const out={};
  Object.keys(rap).forEach(pid=>{ const g=gm[pid], n=(kap[pid]||[]).length, r=rap[pid].size;
    out[pid]={id:+pid,ad:g.label,pb:g.currency||'TRY',tutar:g.cost_amount==null?null:+g.cost_amount,kapsam:n,raporda:r,tam:r===n,not:g.note||''}; });
  return out;
}
function rpToplamKur(kalemler,paketler){
  const top={}; const pakette=o=>!!(o.price_group_id&&paketler[o.price_group_id]);
  const ekle=(pb,alan,v)=>{ const t=top[pb]=top[pb]||{tutar:0,var:false,eksik:0,baski:0,montaj:0,hizmet:0,paket:0};
    if(v==null){ t.eksik++; return; } t.tutar=Math.round((t.tutar+v)*100)/100; t[alan]=Math.round((t[alan]+v)*100)/100; t.var=true; };
  kalemler.forEach(k=>{ const varB=k.d.some(o=>o.operation_type==='baski');
    k.d.forEach(o=>{ if(pakette(o)) return; ekle(o.currency||'TRY',o.operation_type==='baski'?'baski':(o.operation_type==='montaj'&&varB)?'montaj':'hizmet',rpMaliyet(o)); }); });
  Object.values(paketler).forEach(p=>{ if(p.tam&&p.tutar!=null) ekle(p.pb,'paket',p.tutar); });
  return top;
}
/* Paket kalemleri paketin ilk tarihinde bir arada; sonra kalem tarihi. */
function rpKalemSirala(kalemler,paketler){
  const kP=k=>{ const o=k.d.find(x=>x.price_group_id&&paketler[x.price_group_id]); return o?o.price_group_id:null; };
  const pT={}; kalemler.forEach(k=>{ const p=kP(k); if(p){ const t=k.tarih||'9999'; if(!pT[p]||t<pT[p]) pT[p]=t; } });
  kalemler.sort((x,y)=>{ const px=kP(x), py=kP(y);
    return String(px?pT[px]:(x.tarih||'9999')).localeCompare(String(py?pT[py]:(y.tarih||'9999')))
      ||(px||0)-(py||0)||String(x.tarih||'9999').localeCompare(String(y.tarih||'9999'))||x.ilkId-y.ilkId; });
  kalemler.forEach(k=>{ k.paket=kP(k); });
  return kalemler;
}
/* Kalemin uygulama durumu. Geciken: tamamlanmamış işlemin planlanan günü
   geçmiş. Renk ölçülüdür ve daima metinle birliktedir; mecra renkleri
   (dolu/opsiyon/müsait) burada KULLANILMAZ. */
const RP_KDURUM={tamam:{ink:'#1A6B34',fill:null},gecikti:{ink:'#A32117',fill:'#FBE8E6'},
  suruyor:{ink:'#1F4FA8',fill:null},bekliyor:{ink:'#55555B',fill:null},iptal:{ink:'#86868B',fill:null}};
function rpKalemDurum(ops,bugun){
  const a=ops.filter(o=>o.status!=='cancelled'); if(!a.length) return {k:'iptal',t:'İptal'};
  if(a.every(o=>o.status==='done')) return {k:'tamam',t:'Tamamlandı'};
  const gec=a.filter(o=>o.status!=='done'&&o.planned_date&&o.planned_date<bugun).map(o=>o.planned_date).sort()[0];
  if(gec) return {k:'gecikti',t:`Gecikti · ${Math.round(rpDn(bugun)-rpDn(gec))} gün`};
  return {k:'bekliyor',t:'Yapılacak'};
}
const rpOpMalzeme=o=>[o.material,o.grammage_gsm?o.grammage_gsm+' gr/m²':''].filter(Boolean).join(' · ');
function rpOpYer(M,o){ const u=o.unit_id?M.unitById[o.unit_id]:null; const p=[];
  if(u){ const al=M.altById[u.alt_mecra_id]; const me=M.mecById[(al||{}).mecra_id||u.mecra_id];
    p.push([me&&me.name,mdYuzAdi(M,u)].filter(Boolean).join(' · ')); }
  if(o.location_text) p.push(o.location_text); return p.join(' — '); }
const rpOpUnit=(M,o)=>{ const u=o.unit_id?M.unitById[o.unit_id]:null; return u?mdYuzAdi(M,u):''; };
const rpHizmetAd=(M,o)=>`${RP_OPTUR[o.operation_type]||o.operation_type}${o.description?' — '+o.description:rpOpUnit(M,o)?' — '+rpOpUnit(M,o):''}`;

/* ==========================================================
   2) BASKI / MONTAJ TAKİP TABLOSU (S16 — tek iç kullanım şablonu)
   Referans "BASKI-MONTAJ TAKİP TABLOSU": her üretim kalemi bir satır;
   baskı bilgisi ve AYNI kalemin montajı yan yana. 11 sütun korunur:
   Tarih · Müşteri · Ürün/iş kalemi · Adet · Baskı merkezi · Ölçü ·
   Maliyet · Montaj tarihi · Montaj yeri · Montajı yapan · Not.
   Kalemler kurum/iş gruplarıyla sıralanır; grup başlığı kendi ara
   toplamını taşır. İşe özel döküm artık İş dökümü raporundadır.
   ========================================================== */
const RP_BDONEM=[['ay','Bu ay'],['gecen','Geçen ay'],['uc','Son 3 ay'],['yil','Bu yıl'],['tum','Tümü'],['ozel','Özel aralık']];
RPD_BASKI={
  amac:'Dönemlik baskı, montaj, söküm ve ilgili hizmetlerin takip tablosu. Bedeller kayıtlı maliyettir.',
  alici:'ic',
  varsayilan(){ return {donem:'ay',bas:'',bit:'',kurum:'',is:'',tarihsiz:false}; },
  preset(){ return {}; },
  veriAnahtar:()=>'baski',
  async veri(){
    const [ops,grp,jobs,custs,M,kisiler]=await Promise.all([
      rapHepsi(()=>sb.from('work_operations').select('id,job_id,operation_type,status,description,quantity,quantity_unit,dimensions,visible_size,surface_count,material,grammage_gsm,reprint,supplier_org_id,supplier_contact_id,unit_id,location_text,planned_date,completed_at,created_at,unit_cost,cost,currency,price_group_id,kalem_key,note').order('id')),
      rapHepsi(()=>sb.from('operation_price_groups').select('id,job_id,label,cost_amount,currency,note').order('id')),
      rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,status,lifecycle_status').order('id')),
      api('customers_min'), mdYukle(), rapHepsi(()=>sb.from('contacts').select('id,name').order('id'))]);
    const cm={}; (custs||[]).forEach(c=>cm[c.id]=c.firma||'');
    const km={}; (kisiler||[]).forEach(k=>km[k.id]=k.name||'');
    return {ops,grp,jobs,cm,km,M};
  },
  veriSonra(a,v){ const id=rpBIs(a); if(id){ a.is=id; const j=v.jobs.find(x=>x.id===id); if(j&&!a.kurum&&j.customer_id) a.kurum=j.customer_id; } },
  kontrolVeriyle:true,
  baslik(a,v){ const cm=v?v.cm:{}; const j=v&&rpBIs(a)?v.jobs.find(x=>x.id===rpBIs(a)):null;
    return 'Baskı / montaj takip tablosu'+(j?' — '+j.title:a.kurum&&cm[a.kurum]?' — '+orgKisa(cm[a.kurum],40):''); },
  dosya:()=>'Baski_Montaj_Takip',
  kontroller(a){
    const v=(rpDurum().veri||{}).baski, T='baski';
    const jobs=v?v.jobs:[], cm=v?v.cm:{};
    const opJob=new Set((v?v.ops:[]).map(o=>o.job_id));
    const kurumlar=[...new Set(jobs.filter(j=>opJob.has(j.id)&&j.customer_id).map(j=>j.customer_id))]
      .map(id=>[id,cm[id]||'#'+id]).sort((x,y)=>String(x[1]).localeCompare(String(y[1]),'tr'));
    const isler=jobs.filter(j=>opJob.has(j.id)&&(!a.kurum||String(j.customer_id)===String(a.kurum)))
      .sort((x,y)=>String(x.title).localeCompare(String(y.title),'tr'));
    return `<div class="rp3-f">
      <div class="field"><span class="flabel">Dönem</span>${rpSeg(T,'donem',a.donem,RP_BDONEM,'Dönem')}
        ${a.donem==='ozel'?rpTarihKontrol(T,a,'bas','bit'):''}
        <p class="fhint">Kalemin <b>planlanan</b> işlem tarihine göre (baskı tarihi; baskısı olmayan kalemde ilk uygulama tarihi). Uygulama durumu Not sütununda yazılır.</p></div>
      <div class="rp2-grid">
        <div class="field"><label class="flabel" for="rpKurum">Kurum (isteğe bağlı)</label>
          <select class="inp ${a.kurum?'inp-on':''}" id="rpKurum" data-ara onchange="rpBaskiKurum(this.value)"><option value="">Tüm kurumlar</option>
          ${kurumlar.map(([id,ad])=>`<option value="${id}" ${String(a.kurum)===String(id)?'selected':''}>${esc(orgKisa(ad,60))}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="rpIs">İş (isteğe bağlı)</label>
          <select class="inp ${a.is?'inp-on':''}" id="rpIs" data-ara onchange="rpBaskiIs(this.value)"><option value="">Tüm işler</option>
          ${isler.map(j=>`<option value="${j.id}" data-ek="${esc(orgKisa(cm[j.customer_id]||'kurum bağlantısı yok',44))}" ${String(a.is)===String(j.id)?'selected':''}>${esc(j.title||'#'+j.id)}</option>`).join('')}</select></div></div>
    </div>`;
  },
  model(a,v){
    const T='baski', cm=v.cm, M=v.M, bugun=rpBugun();
    const jm={}; v.jobs.forEach(j=>jm[j.id]=j); const gm={}; v.grp.forEach(g=>gm[g.id]=g);
    const isId=rpBIs(a);
    const out={ic:true,bedelAd:'Maliyet',uyari:[],bilgi:[],satirlar:[],toplamlar:{},paketler:{},cikarilan:[]};
    let bas=null, bit=null;
    if(a.donem==='ozel'){ bas=a.bas||null; bit=a.bit||null;
      const h=(bas||bit)?rpDonemDogrula(bas||'2000-01-01',bit||'2099-12-31'):null;
      if(h){ out.hata=h; out.uyari.push(h); out.say={dahil:0,filtre:0,cik:0,birim:'işlem'}; return out; } }
    else [bas,bit]=rpBDonemAralik(a.donem);
    out.bas=bas; out.bit=bit;
    const tut=rpMaliyet;
    const kurumAd=id=>id?rpKisaAd(cm[id],30):'';
    const firmaKisa=id=>id?rpKisaAd(cm[id],24):'';
    /* S19: uygulayan kişi ve/veya kurum (kişi yoksa çıktı eskisiyle aynıdır). */
    const km=v.km||{};
    const uygAd=o=>[o.supplier_contact_id&&km[o.supplier_contact_id]?km[o.supplier_contact_id]:'',firmaKisa(o.supplier_org_id)].filter(Boolean).join(' · ');
    /* 1. Kapsam — iptal edilen işlem takip tablosuna girmez. */
    const kapsam=v.ops.filter(o=>{ const j=jm[o.job_id]; if(!j||o.status==='cancelled') return false;
      if(isId&&o.job_id!==isId) return false;
      if(a.kurum&&String(j.customer_id)!==String(a.kurum)) return false; return true; });
    /* 2. Kalemler + dönem */
    let kalemler=rpKalemleriKur(kapsam,jm);
    out.tarihsizDisarda=0;
    if(bas||bit) kalemler=kalemler.filter(k=>{ if(!k.tarih){ if(!a.tarihsiz) out.tarihsizDisarda++; return !!a.tarihsiz; }
      return (!bas||k.tarih>=bas)&&(!bit||k.tarih<=bit); });
    const gorunen=new Set(kalemler.flatMap(k=>k.ops.map(o=>'o'+o.id)));
    out.budanan=rpBuda(T,gorunen);
    kalemler.forEach(k=>{ k.d=k.ops.filter(o=>rpDahil(T,'o'+o.id)); });
    out.cikarilan=kalemler.flatMap(k=>k.ops.filter(o=>!rpDahil(T,'o'+o.id)).map(o=>({key:'o'+o.id,tarih:o.planned_date||'',
      ad:`${RP_OPTUR[o.operation_type]||o.operation_type} — ${o.description||rpOpUnit(M,o)||(jm[o.job_id]||{}).title||''}`})));
    kalemler=kalemler.filter(k=>k.d.length);
    /* 3. Paket + toplam */
    out.paketler=rpPaketKur(kalemler.flatMap(k=>k.d),v.ops,gm);
    rpKalemSirala(kalemler,out.paketler);
    out.toplamlar=rpToplamKur(kalemler,out.paketler);
    out.kismiPaket=Object.values(out.paketler).some(p=>!p.tam);
    const sayDahil=kalemler.reduce((t,k)=>t+k.d.length,0);
    out.say={dahil:sayDahil,filtre:gorunen.size,cik:gorunen.size-sayDahil,birim:'işlem'};
    /* 4. Kurum / iş grupları: grup sırası ilk kalem tarihine göre. */
    const gr=new Map();
    kalemler.forEach(k=>{ const id=k.job.id; if(!gr.has(id)) gr.set(id,{job:k.job,kalemler:[]}); gr.get(id).kalemler.push(k); });
    const pakette=o=>!!(o.price_group_id&&out.paketler[o.price_group_id]);
    const durumMetni=ops=>{ const g={}; ops.forEach(o=>{ const t=o.operation_type; (g[t]=g[t]||new Set()).add(o.status); });
      return Object.entries(g).map(([t,s])=>`${RP_OPTUR[t]||t}: ${[...s].map(x=>(RP_OPDURUM[x]||x).toLocaleLowerCase('tr')).join(' / ')}`).join(' · '); };
    const tarihBir=l=>{ const u=[...new Set(l.filter(Boolean))].sort(); return u.length<=1?(u[0]||''):u.map(rpTr).join('\n'); };
    const birles=l=>[...new Set(l.filter(Boolean))].join('\n');
    const notlar=ops=>ops.filter(o=>o.note).map(o=>(ops.length>1?RP_OPTUR[o.operation_type]+': ':'')+o.note);
    [...gr.values()].forEach(g=>{
      const gk=g.kalemler, j=g.job;
      const gPaket={}; Object.values(out.paketler).forEach(p=>{ if(gk.some(k=>k.d.some(o=>String(o.price_group_id)===String(p.id)))) gPaket[p.id]=p; });
      const dS={}; gk.forEach(k=>{ const d=rpKalemDurum(k.d,bugun).k; dS[d]=(dS[d]||0)+1; });
      out.satirlar.push({tip:'grup',key:'j'+j.id,kurum:cm[j.customer_id]?rpKisaAd(cm[j.customer_id],40):'Kurum bağlantısı yok',is:j.title||'',
        kalemSay:gk.length,bedel:Object.entries(rpToplamKur(gk,gPaket)).filter(([,t])=>t.var).map(([pb,t])=>({pb,v:t.tutar})),
        durumOzet:[['tamam','tamamlandı'],['bekliyor','yapılacak'],['gecikti','gecikti']].filter(([k])=>dS[k]).map(([k,l])=>`${dS[k]} ${l}`).join(' · '),
        gecikti:!!dS.gecikti});
      let sonP=null;
      gk.forEach(k=>{
        if(k.paket&&k.paket!==sonP) out.satirlar.push({tip:'paket',...out.paketler[k.paket]});
        sonP=k.paket;
        const B=k.d.filter(o=>o.operation_type==='baski'), Mo=k.d.filter(o=>o.operation_type==='montaj'), D=k.d.filter(o=>!['baski','montaj'].includes(o.operation_type));
        const musteri=kurumAd(k.job.customer_id);
        const rows=[];
        B.forEach(o=>rows.push({key:'o'+o.id,tarih:o.planned_date||'',musteri,urun:o.description||rpOpUnit(M,o)||'Baskı',
          urunAlt:[o.reprint?'Yeniden baskı':'',rpOpMalzeme(o),o.visible_size?'görünen '+o.visible_size:''].filter(Boolean).join(' · '),
          adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',merkez:uygAd(o),olcu:o.dimensions||''}));
        const mSpan=B.length&&Mo.length?B.length:0;
        if(mSpan){ rows[0].mTarih=tarihBir(Mo.map(o=>o.planned_date)); rows[0].mYer=birles(Mo.map(o=>rpOpYer(M,o))); rows[0].mYapan=birles(Mo.map(o=>uygAd(o))); }
        (B.length?D:[...Mo,...D]).forEach(o=>rows.push({key:'o'+o.id,tarih:o.planned_date||'',musteri,urun:rpHizmetAd(M,o),urunAlt:'',
          adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',merkez:'',olcu:o.dimensions||'',
          mTarih:o.planned_date||'',mYer:rpOpYer(M,o),mYapan:uygAd(o),kendi:true}));
        const bedelOps=k.d.filter(o=>!pakette(o));
        const eksik=bedelOps.filter(o=>tut(o)==null).map(o=>RP_OPTUR[o.operation_type]);
        const kapsamAd=B.length?(Mo.length?'Baskı + montaj':'Yalnız baskı')+(D.length?' + '+[...new Set(D.map(o=>RP_OPTUR[o.operation_type].toLocaleLowerCase('tr')))].join(', '):'')
          :Mo.length?'Montaj — baskıyla eşleştirilmemiş':[...new Set(D.map(o=>RP_OPTUR[o.operation_type]))].join(', ');
        const bedel=rpTutarTopla(bedelOps,tut);
        const pktKis=k.d.filter(pakette);
        out.satirlar.push({tip:'kalem',key:k.key,job:j.id,rows,mSpan,bedel,paket:!!k.paket&&bedelOps.length===0,
          durum:rpKalemDurum(k.d,bugun),
          not:[kapsamAd,durumMetni(k.d),
            pktKis.length&&bedelOps.length?`${[...new Set(pktKis.map(o=>RP_OPTUR[o.operation_type]))].join(', ')} paket maliyetinde; bu tutar yalnız ${[...new Set(bedelOps.map(o=>RP_OPTUR[o.operation_type].toLocaleLowerCase('tr')))].join(', ')} kısmıdır.`:'',
            bedel.length&&eksik.length?`Maliyet yalnız girilmiş tutarları kapsar (${[...new Set(eksik)].join(', ').toLocaleLowerCase('tr')} tutarı girilmemiş).`:'',
            ...notlar(k.d)].filter(Boolean).join('\n')});
      });
    });
    if(a.kurum) out.bilgi.push(['Kurum',cm[a.kurum]||'']);
    if(isId) out.bilgi.push(['İş',(jm[isId]||{}).title||'']);
    out.bilgi.push(['Dönem',bas||bit?`${bas?rpTr(bas):'…'} – ${bit?rpTr(bit):'…'} (planlanan işlem tarihi)`:'Tüm tarihler']);
    if(out.tarihsizDisarda) out.uyari.push(`${out.tarihsizDisarda} kalemin tarihi girilmemiş; bu döneme yerleştirilemediği için rapora girmedi.`);
    if(!kalemler.length&&!out.uyari.length) out.uyari.push('Bu kapsamda baskı / montaj kaydı yok.');
    return out;
  },
  onizle(m,a){
    const T='baski';
    if(m.hata) return '';
    const P=(v,pb,gri)=>v==null?'<span class="muted">—</span>':`<span class="${gri?'rp3-gri':''}">${esc(rpPara(v,pb))}</span>`;
    const tarihH=t=>/^\d{4}-\d{2}-\d{2}$/.test(t||'')?esc(rpTr(t)):esc(t||'').replace(/\n/g,'<br>');
    const cok=t=>esc(t||'').replace(/\n/g,'<br>');
    let h=`<p class="rp2-ozet">Maliyet sütunu: <b>kayıtlı maliyet</b> — KDV ve indirim hesaplanmaz, paket maliyeti bir kez sayılır.</p>`;
    if(m.tarihsizDisarda&&!a.tarihsiz) h+=`<p class="rp2-ozet"><button type="button" class="btn-link" onclick="rpSet('baski','tarihsiz',true)">Tarihi girilmemiş ${m.tarihsizDisarda} kalemi de ekle</button></p>`;
    if(a.tarihsiz) h+=`<p class="rp2-ozet muted">Tarihi girilmemiş kalemler dahil. <button type="button" class="btn-link" onclick="rpSet('baski','tarihsiz',false)">Çıkar</button></p>`;
    const kol=['Tarih','Müşteri','Ürün / iş kalemi','Adet','Baskı merkezi','Ölçü','Maliyet','Montaj tarihi','Montaj yeri','Montajı yapan','Not'];
    h+=`<div class="rp3-kap"><table class="rp3-tab rp3-bm"><thead><tr><th class="rp3-cb"><span class="sr-only">Dahil</span></th>${kol.map((k,i)=>`<th scope="col"${i===3||i===6?' class="sag"':''}>${esc(k)}</th>`).join('')}</tr></thead><tbody>`;
    m.satirlar.forEach(s=>{
      if(s.tip==='grup'){ h+=`<tr class="rp3-grp"><td></td><td colspan="6"><b>${esc(s.kurum)}</b> <span>· ${esc(s.is)}</span> <em>${s.kalemSay} kalem</em></td>
          <td class="sag"><b>${s.bedel.length?esc(rpParaListe(s.bedel)):'—'}</b></td><td colspan="4" class="${s.gecikti?'rp3-gec':''}">${esc(s.durumOzet)}</td></tr>`; return; }
      if(s.tip==='paket'){ h+=`<tr class="rp3-pk${s.tam?'':' kismi'}"><td></td><td colspan="6"><b>Paket maliyeti — ${esc(s.ad)}</b><small>${s.kapsam} işlemi kapsar${s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam} işlem var; maliyet dağıtılmadı, toplama katılmadı (paketin tamamı ${esc(rpPara(s.tutar,s.pb))})`}</small></td>
          <td class="sag">${s.tam?P(s.tutar,s.pb):'<span class="muted">kısmi</span>'}</td><td colspan="4">${cok(s.not)}</td></tr>`; return; }
      const n=s.rows.length, D=RP_KDURUM[s.durum.k];
      s.rows.forEach((r,i)=>{ const d=rpDahil(T,r.key);
        h+=`<tr class="${d?'':'dis'}${i===n-1?' son':''}"><td class="rp3-cb">${rpCb(T,r.key,d,r.urun+' rapora dahil')}</td>
          <td>${tarihH(r.tarih)}</td><td>${esc(r.musteri)}</td><td><b>${esc(r.urun)}</b>${r.urunAlt?`<small>${esc(r.urunAlt)}</small>`:''}</td>
          <td class="sag">${r.adet==null?'':esc(rpSayi(r.adet)+' '+r.birim)}</td><td>${esc(r.merkez)}</td><td>${esc(r.olcu)}</td>
          ${i===0?`<td class="sag" rowspan="${n}">${s.paket?'<span class="rp3-gri">pakette</span>':s.bedel.length?esc(rpParaListe(s.bedel)):'<span class="muted">—</span>'}</td>`:''}
          ${(i===0&&s.mSpan)?`<td rowspan="${s.mSpan}">${tarihH(r.mTarih)}</td><td rowspan="${s.mSpan}">${cok(r.mYer)}</td><td rowspan="${s.mSpan}">${cok(r.mYapan)}</td>`
            :(s.mSpan&&i<s.mSpan)?'':`<td>${r.kendi?tarihH(r.mTarih):''}</td><td>${r.kendi?cok(r.mYer):''}</td><td>${r.kendi?cok(r.mYapan):''}</td>`}
          ${i===0?`<td rowspan="${n}" class="rp3-not"${D.fill?` style="background:${D.fill}"`:''}><b class="rp3-dr" style="color:${D.ink}">${esc(s.durum.t)}</b>${cok(s.not)}</td>`:''}</tr>`; }); });
    h+=`</tbody></table></div>`;
    if(!m.satirlar.length) h+=`<p class="empty">Bu kapsamda baskı / montaj kaydı yok.</p>`;
    if((m.cikarilan||[]).length) h+=`<div class="rp3-cik"><b>Rapordan çıkarılan kayıtlar (${m.cikarilan.length})</b> <span class="muted">— işaretleyerek geri ekleyin</span>
      <div class="rp2-rows">${m.cikarilan.map(x=>`<label class="rp2-row dis">${rpCb(T,x.key,false,x.ad+' rapora ekle')}<span class="rp2-tarih-c">${esc(rpTr(x.tarih)||'tarihsiz')}</span><span class="rp2-det">${esc(x.ad)}</span></label>`).join('')}</div></div>`;
    h+=rpBToplamHtml(m);
    return h;
  },
  pdf(m){ return rpTakipPdf(m); },
  xlsx(m){ return [{ad:'Takip',yon:'landscape',ozel:ws=>rpTakipXls(ws,m)}]; }
};
/* Toplam satırları — her para birimi ayrı. `m.sablon==='dokum'` İş
   dökümünün baskı bölümüdür: baskı / montaj / hizmet / paket kırılımı. */
function rpBToplamSatirlari(m){
  const out=[]; const E=Object.entries(m.toplamlar);
  E.forEach(([pb,t])=>{
    if(m.sablon==='dokum'){
      if(t.baski) out.push({ad:'Baskı maliyeti',pb,v:t.baski});
      if(t.montaj) out.push({ad:'Montaj maliyeti',pb,v:t.montaj});
      if(t.hizmet) out.push({ad:'Destek hizmetleri maliyeti',pb,v:t.hizmet});
      Object.values(m.paketler).filter(p=>p.pb===pb&&p.tam&&p.tutar!=null).forEach(p=>out.push({ad:'Paket maliyeti — '+p.ad,pb,v:p.tutar}));
    }
    out.push({ad:`Toplam maliyet (${pb})`,pb,v:t.var?t.tutar:null,kalin:true,eksik:t.eksik});
  });
  return out;
}
function rpBToplamNot(m){
  const n=Object.values(m.toplamlar).reduce((x,t)=>x+t.eksik,0);
  return ['Maliyet: kayıtlı tutarlar. Her para birimi ayrı toplanır; KDV, indirim ve kâr hesaplanmaz.',
    Object.keys(m.paketler).length?'Paket maliyeti bir kez sayılır; paket içindeki satır tutarları bilgi amaçlıdır.':'',
    m.kismiPaket?'Kısmen kapsanan paket toplama katılmadı.':'',
    n?`${n} işlemde tutar girilmemiş; bu işlemler toplama katılmadı (0 sayılmadı).`:''].filter(Boolean).join(' ');
}
function rpBToplamHtml(m){
  const T=rpBToplamSatirlari(m);
  return `<div class="rp3-top">${T.length?T.map(t=>`<div class="${t.kalin?'kalin':''}"><span>${esc(t.ad)}</span><b>${t.v==null?'—':esc(rpPara(t.v,t.pb))}</b></div>`).join('')
    :'<div><span>Kayıtlı tutar yok.</span></div>'}</div><p class="fhint">${esc(rpBToplamNot(m))}</p>`;
}
/* ---------- PDF ---------- */
function rpPdfToplam(m,sol){
  const T=rpBToplamSatirlari(m);
  return [{table:{widths:['*',130],body:T.length?T.map(t=>[{text:t.ad,bold:!!t.kalin,alignment:'right',...(t.kalin?{fillColor:'#E7F0E4'}:{})},
        {text:t.v==null?'—':rpPara(t.v,t.pb),bold:!!t.kalin,alignment:'right',...(t.kalin?{fillColor:'#E7F0E4'}:{})}])
      :[[{text:'Kayıtlı tutar yok.',colSpan:2,style:'bos'},{}]]},
      layout:{hLineWidth:(i,n)=>i===0||i===n.table.body.length?0:0.4,vLineWidth:()=>0,hLineColor:()=>'#d6d6db',paddingTop:()=>3,paddingBottom:()=>3},
      margin:[sol==null?420:sol,6,0,4],unbreakable:true},
    {text:rpBToplamNot(m),style:'not'}];
}
/* Sütun başlığı her sayfanın üstünde tekrar eder (sayfa başlığında aynı
   genişliklerle); grup başlığı kendi tablosunun tekrar eden başlığıdır —
   sayfa sonunda tek başına kalmaz, taşan grubun devamında yeniden yazılır. */
const RP_TW=[52,66,'*',42,62,52,64,54,74,62,92];
const RP_TKOL=['Tarih','Müşteri','Ürün / iş kalemi','Adet','Baskı merkezi','Ölçü','Maliyet','Montaj tarihi','Montaj yeri','Montajı yapan','Not'];
function rpTakipKolonBas(){
  return {table:{widths:RP_TW,body:[RP_TKOL.map((t,i)=>({text:t,style:'th',alignment:[3,6].includes(i)?'right':'left'}))]},
    layout:{hLineWidth:(i)=>i===1?0.9:0,vLineWidth:()=>0,hLineColor:()=>'#8e8e95',fillColor:()=>'#FFE699',
      paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>4,paddingBottom:()=>4},fontSize:8.5};
}
function rpTakipPdf(m){
  const ic=[{text:[{text:'Maliyet: ',bold:true},'kayıtlı maliyet tutarları. KDV ve indirim hesaplanmaz; paket maliyeti bir kez sayılır.'],fontSize:9,margin:[0,0,0,6]}];
  const tr=t=>/^\d{4}-\d{2}-\d{2}$/.test(t||'')?rpTr(t):(t||'');
  const bos=n=>Array(n).fill({});
  const gruplar=[]; let g=null;
  m.satirlar.forEach(s=>{ if(s.tip==='grup'){ g={bas:s,body:[]}; gruplar.push(g); return; } if(g) g.body.push(s); });
  if(!gruplar.length){ ic.push({text:'Bu kapsamda baskı / montaj kaydı yok.',style:'bos'}); ic.push(...rpPdfToplam(m)); return {icerik:ic,o:{yon:'landscape'}}; }
  ic.push(rpTakipKolonBas());
  gruplar.forEach(G=>{
    const s0=G.bas;
    const band=[{text:[{text:s0.kurum,bold:true},{text:'  ·  '+s0.is},{text:`   ${s0.kalemSay} kalem`,color:RPC.ink3,fontSize:8}],colSpan:6,fillColor:'#EAECF1',margin:[0,1,0,1]},...bos(5),
      {text:s0.bedel.length?rpParaListe(s0.bedel):'—',bold:true,alignment:'right',fillColor:'#EAECF1'},
      {text:s0.durumOzet,colSpan:4,fillColor:'#EAECF1',fontSize:8,color:s0.gecikti?RP_KDURUM.gecikti.ink:RPC.ink2},...bos(3)];
    const body=[band];
    G.body.forEach(s=>{
      if(s.tip==='paket'){ body.push([{text:'',fillColor:'#EEF3FB'},{stack:[{text:'Paket maliyeti — '+s.ad,bold:true},{text:`${s.kapsam} işlemi kapsar`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; toplama katılmadı (paketin tamamı ${rpPara(s.tutar,s.pb)})`),style:'not'}],colSpan:5,fillColor:'#EEF3FB'},...bos(4),
        {text:s.tam?rpPara(s.tutar,s.pb):'kısmi',bold:true,alignment:'right',fillColor:'#EEF3FB'},{text:s.not||'',colSpan:4,style:'not',fillColor:'#EEF3FB'},...bos(3)]); return; }
      const n=s.rows.length, D=RP_KDURUM[s.durum.k];
      s.rows.forEach((r,i)=>{ const row=[{text:tr(r.tarih),noWrap:true},r.musteri,{stack:[{text:r.urun,bold:true},...(r.urunAlt?[{text:r.urunAlt,style:'not'}]:[])]},
          {text:r.adet==null?'':`${rpSayi(r.adet)} ${r.birim}`,alignment:'right'},r.merkez,r.olcu,
          i===0?{text:s.paket?'pakette':s.bedel.length?rpParaListe(s.bedel):'—',alignment:'right',rowSpan:n,color:s.paket?RPC.ink3:RPC.ink,italics:!!s.paket}:{}];
        if(i===0&&s.mSpan) row.push({text:tr(r.mTarih),rowSpan:s.mSpan,noWrap:!String(r.mTarih||'').includes('\n')},{text:r.mYer||'',rowSpan:s.mSpan},{text:r.mYapan||'',rowSpan:s.mSpan});
        else if(s.mSpan&&i<s.mSpan) row.push({},{},{});
        else row.push({text:r.kendi?tr(r.mTarih):'',noWrap:true},r.kendi?(r.mYer||''):'',r.kendi?(r.mYapan||''):'');
        row.push(i===0?{stack:[{text:s.durum.t,bold:true,color:D.ink,fontSize:8.5},{text:s.not||'',style:'not'}],...(D.fill?{fillColor:D.fill}:{}),...(n>1?{border:[true,true,true,false]}:{})}
          :{text:'',...(D.fill?{fillColor:D.fill}:{}),border:[true,false,true,i===n-1]});
        body.push(row); }); });
    ic.push({table:{headerRows:1,keepWithHeaderRows:1,dontBreakRows:true,widths:RP_TW,body},
      layout:{hLineWidth:(i,n)=>i===0?0.9:i===1?0.6:i===n.table.body.length?0.9:0.4,
        vLineWidth:()=>0.35,hLineColor:i=>i===0||i===1?'#9c9ca3':'#d4d4d9',vLineColor:()=>'#dcdce0',
        paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>3,paddingBottom:()=>3},fontSize:8.5,margin:[0,0,0,6]});
  });
  ic.push(...rpPdfToplam(m,500));
  return {icerik:ic,o:{yon:'landscape',sayfaUstu:rpTakipKolonBas}};
}
/* ---------- XLSX ---------- */
function rpXlsBaslik(ws,m,alt){
  const F='Arial';
  const c1=ws.getCell(1,1); c1.value=m.baslik; c1.font={name:F,bold:true,size:14};
  const c2=ws.getCell(2,1); c2.value=[...alt,'Bedel: kayıtlı maliyet (iç kullanım)',`Hazırlanma: ${rpAnTr(m.an)}`].filter(Boolean).join('   ·   ');
  c2.font={name:F,size:9,color:{argb:'FF55555B'}};
}
function rpXlsHeader(ws,r,basliklar,dolgu,sagdan){
  const row=ws.getRow(r); row.height=30;
  basliklar.forEach((t,i)=>{ const c=row.getCell(i+1); c.value=t||null; c.font={name:'Arial',bold:true,size:10};
    c.fill={type:'pattern',pattern:'solid',fgColor:{argb:dolgu}}; c.border=rpXKenar();
    c.alignment={vertical:'middle',horizontal:(Array.isArray(sagdan)?sagdan.includes(i):i>=sagdan)?'right':'left',wrapText:true}; });
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
/* Takip tablosu Excel'i: gerçek tablonun 11 sütunu; kurum/iş grup bandı
   (ara toplamlı), paket bandı, kalem satırları (birleşik Maliyet / Not /
   montaj hücreleri). Yazdırmada başlık satırı her sayfada tekrar eder;
   kalem ve grup bandı sayfa sonunda bölünmez, taşan grup yeni sayfada
   "(devam)" bandıyla sürer. Sabit ölçek: Excel "sığdır" açıkken elle
   konan sayfa sonlarını yok sayar. */
function rpTakipXls(ws,m){
  const F='Arial', H=3;            /* S18: başlık · bilgi · sütunlar; 3–4. boş satırlar kaldırıldı */
  const W=[11,20,32,10,16,13,15,11,22,16,34]; W.forEach((w,i)=>{ ws.getColumn(i+1).width=w; });
  rpXlsBaslik(ws,m,(m.bilgi||[]).map(([k,v])=>`${k}: ${v}`));
  rpXlsHeader(ws,H,RP_TKOL,'FFFFE699',[3,6]);
  const genPt=W.reduce((t,w)=>t+(w*7+5)*0.75,0);
  const olcek=Math.min(1,(842-0.8*72)/genPt*0.93);
  const sayfaYuk=(595-72-28)/olcek;
  let dolu=[1,2,H].reduce((t,k)=>t+(ws.getRow(k).height||15),0);
  let r=H+1;
  const hucre=(rr,k,tip,v,pb,ek)=>{ const c=ws.getCell(rr,k); rpXlsDeger(c,tip,v,pb);
    c.font={name:F,size:10,...(ek&&ek.font||{})}; c.alignment={vertical:'top',wrapText:true,horizontal:ek&&ek.sag?'right':'left'}; c.border=rpXKenar(); return c; };
  const sar=(t,w)=>String(t||'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil(l.length/(w*1.05))),0);
  const kir=()=>{ ws.getRow(r-1).addPageBreak(); dolu=ws.getRow(H).height||30; };
  const bandYaz=(s,devam)=>{ const f={type:'pattern',pattern:'solid',fgColor:{argb:'FFEAECF1'}};
    for(let k=1;k<=11;k++){ const c=ws.getCell(r,k); c.fill=f; c.border={...rpXKenar(),top:{style:'medium',color:{argb:'FF6E6E75'}}}; }
    const u=ws.getCell(r,1); u.value={richText:[{text:s.kurum,font:{name:F,bold:true,size:10.5}},{text:'  ·  '+s.is+(devam?'  (devam)':''),font:{name:F,bold:true,size:10}},
      {text:`   ${s.kalemSay} kalem`,font:{name:F,size:9,color:{argb:'FF55555B'}}}]};
    u.alignment={vertical:'middle',wrapText:true}; ws.mergeCells(r,1,r,6);
    const b=ws.getCell(r,7); if(s.bedel.length===1) rpXlsDeger(b,'para',s.bedel[0].v,s.bedel[0].pb); else b.value=s.bedel.length?rpParaListe(s.bedel):null;
    b.font={name:F,bold:true,size:10}; b.alignment={horizontal:'right',vertical:'middle',wrapText:s.bedel.length>1};
    const d=ws.getCell(r,8); d.value=s.durumOzet||null; d.font={name:F,size:9,color:{argb:s.gecikti?rpArgb(RP_KDURUM.gecikti.ink):'FF55555B'},bold:!!s.gecikti};
    d.alignment={vertical:'middle',wrapText:true}; ws.mergeCells(r,8,r,11);
    ws.getRow(r).height=Math.max(s.bedel.length>1?15*s.bedel.length+6:20,sar(s.kurum+s.is,W[0]+W[1]+W[2]+W[3]+W[4]+W[5])*13+6);
    if(s.bedel.length>1) b.value=s.bedel.map(x=>rpPara(x.v,x.pb)).join('\n');
    dolu+=ws.getRow(r).height; r++; };
  let grup=null;
  m.satirlar.forEach(s=>{
    if(s.tip==='grup'){ grup=s;
      const ilkYuk=22+40;            /* bant + en az bir kalem sığmalı */
      if(r>H+1&&dolu+ilkYuk>sayfaYuk) kir();
      bandYaz(s,false); return; }
    if(s.tip==='paket'){ const pk={type:'pattern',pattern:'solid',fgColor:{argb:'FFEEF3FB'}};
      if(dolu+34>sayfaYuk){ kir(); if(grup) bandYaz(grup,true); }
      for(let k=1;k<=11;k++){ const c=ws.getCell(r,k); c.fill=pk; c.border=rpXKenar(); }
      const u=ws.getCell(r,3); u.value={richText:[{text:'Paket maliyeti — '+s.ad,font:{name:F,bold:true,size:10}},
        {text:`\n${s.kapsam} işlemi kapsar`+(s.tam?'':` · bu raporda ${s.raporda}/${s.kapsam}; maliyet dağıtılmadı, toplama katılmadı (paketin tamamı ${rpPara(s.tutar,s.pb)})`),font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]};
      u.alignment={wrapText:true,vertical:'top'}; ws.mergeCells(r,3,r,6);
      const b=ws.getCell(r,7); if(s.tam) rpXlsDeger(b,'para',s.tutar,s.pb); else b.value='kısmi'; b.font={name:F,bold:true,size:10}; b.alignment={horizontal:'right',vertical:'top'};
      if(s.not){ const nn=ws.getCell(r,8); nn.value=s.not; nn.font={name:F,size:9}; nn.alignment={wrapText:true,vertical:'top'}; ws.mergeCells(r,8,r,11); }
      ws.getRow(r).height=34; dolu+=34; r++; return; }
    const n=s.rows.length, D=RP_KDURUM[s.durum.k];
    /* Kalemin toplam yüksekliği önce hesaplanır: sığmazsa kalem bütün
       olarak sonraki sayfaya geçer. */
    const yuk=s.rows.map((x,i)=>Math.max(18,Math.max(sar(x.urun,W[2])+(x.urunAlt?sar(x.urunAlt,W[2]*1.2):0),sar(x.musteri,W[1]),sar(x.merkez,W[4]),sar(x.olcu,W[5]),
      i===0||x.kendi?Math.max(sar(x.mYer,W[8]),sar(x.mYapan,W[9])):1)*13+4));
    const notSatir=1+String(s.not||'').split('\n').reduce((t,l)=>t+Math.max(1,Math.ceil(l.length/(W[10]*1.15))),0);
    const topY=yuk.reduce((t,x)=>t+x,0), ek=Math.max(0,notSatir*12.5+4-topY);
    yuk[n-1]+=ek;
    if(dolu+topY+ek>sayfaYuk&&r>H+1){ kir(); if(grup) bandYaz(grup,true); }
    const r0=r;
    s.rows.forEach((x,i)=>{ const rr=r0+i;
      hucre(rr,1,'tarih',x.tarih); hucre(rr,2,'metin',x.musteri);
      const u=ws.getCell(rr,3); u.value=x.urunAlt?{richText:[{text:x.urun,font:{name:F,bold:true,size:10}},{text:'\n'+x.urunAlt,font:{name:F,size:8.5,color:{argb:'FF55555B'}}}]}:x.urun;
      if(!x.urunAlt) u.font={name:F,bold:true,size:10}; u.alignment={vertical:'top',wrapText:true}; u.border=rpXKenar();
      hucre(rr,4,'adet',x.adet,x.birim,{sag:true}); hucre(rr,5,'metin',x.merkez); hucre(rr,6,'metin',x.olcu);
      if(s.mSpan&&i<s.mSpan){ if(i===0){ hucre(rr,8,'tarih',x.mTarih); hucre(rr,9,'metin',x.mYer); hucre(rr,10,'metin',x.mYapan); } }
      else { hucre(rr,8,'tarih',x.kendi?x.mTarih:null); hucre(rr,9,'metin',x.kendi?x.mYer:null); hucre(rr,10,'metin',x.kendi?x.mYapan:null); }
      ws.getRow(rr).height=yuk[i]; });
    const b=ws.getCell(r0,7);
    if(s.paket){ b.value='pakette'; b.font={name:F,size:9,italic:true,color:{argb:'FF86868B'}}; }
    else if(s.bedel.length===1){ rpXlsDeger(b,'para',s.bedel[0].v,s.bedel[0].pb); b.font={name:F,size:10}; }
    else if(s.bedel.length>1){ b.value=rpParaListe(s.bedel); b.font={name:F,size:10}; }
    b.alignment={horizontal:'right',vertical:'top'}; b.border=rpXKenar();
    const nt=ws.getCell(r0,11); nt.value={richText:[{text:s.durum.t,font:{name:F,bold:true,size:9.5,color:{argb:rpArgb(D.ink)}}},
      ...(s.not?[{text:'\n'+s.not,font:{name:F,size:9,color:{argb:'FF3A3A40'}}}]:[])]};
    nt.alignment={vertical:'top',wrapText:true}; nt.border=rpXKenar();
    if(D.fill) nt.fill={type:'pattern',pattern:'solid',fgColor:{argb:rpArgb(D.fill)}};
    if(n>1){ ws.mergeCells(r0,7,r0+n-1,7); ws.mergeCells(r0,11,r0+n-1,11); }
    if(s.mSpan>1) [8,9,10].forEach(k=>ws.mergeCells(r0,k,r0+s.mSpan-1,k));
    for(let k=1;k<=11;k++){ const c=ws.getCell(r0+n-1,k); c.border={...(c.border||{}),bottom:{style:'thin',color:{argb:'FF8E8E95'}}}; }
    r+=n; dolu+=topY+ek; });
  const sonVeri=r-1;
  r=rpXlsToplam(ws,r,m,6,7);
  ws.views=[{state:'frozen',ySplit:H,xSplit:0,topLeftCell:'A'+(H+1),activeCell:'A'+(H+1)}];
  if(sonVeri>H) ws.autoFilter={from:{row:H,column:1},to:{row:H,column:11}};
  ws.pageSetup.printArea=`A1:K${r}`; ws.pageSetup.printTitlesRow=`${H}:${H}`;
  ws.pageSetup.fitToPage=false; ws.pageSetup.scale=Math.max(40,Math.floor(olcek*100));
}
function rpBaskiKurum(v){ const a=rpAyar('baski'); a.kurum=v; const d=(rpDurum().veri||{}).baski;
  if(a.is&&d){ const j=d.jobs.find(x=>x.id===+a.is); if(!j||String(j.customer_id)!==String(v)&&v) a.is=''; }
  rpKontrolCiz('baski'); rpYenile('baski'); }
function rpBaskiIs(v){ const a=rpAyar('baski'); a.is=v?+v:''; a.isler=[]; const d=(rpDurum().veri||{}).baski;
  if(a.is&&d){ const j=d.jobs.find(x=>x.id===a.is); if(j&&j.customer_id) a.kurum=j.customer_id; }
  rpKontrolCiz('baski'); rpYenile('baski'); }

/* ==========================================================
   3) KİŞİSEL ÇALIŞMA PLANIM (S16)
   Oturum açan kişinin kendi planı; başkası için plan hazırlanmaz.
   YAPILACAK = açık aksiyon (tarihli ya da açık durumlu Entry) VE
     · bana atanmış, ya da
     · beni etiketlemiş, ya da
     · benim yazdığım ve kimseye atanmamış;
   + sahibi olduğum işlerin planlanan baskı/montaj işlemleri
   + kişisel randevularım (yalnız benim; RLS de başkasınınkini döndürmez).
   Takip ettiğim her iş ya da düz güncelleme görev SAYILMAZ. Tamamlanan /
   iptal edilen aksiyon, işlem ve arşivdeki işin kayıtları yapılacak
   listesine girmez. Her kayıt anahtarıyla bir kez yer alır: etiket ve
   takip ilişkisi aynı aksiyonu iki kez getiremez.
   BİLGİ = beni etiketleyen ya da takip/sahip olduğum işte ACİL işaretli
   düz güncelleme; son 7 gün, kısa bir bölüm; görev değildir.
   ========================================================== */
RPD_PLAN={
  amac:'Kendi planınızı PDF olarak telefona indirin; uygulama ve internet olmadan okunur.',
  alici:'ic', kontrolVeriyle:true, secimli:false,
  varsayilan(){ return {donem:'hafta',bas:'',bit:''}; },
  preset(){ return {}; },
  donem(a){ const b=rpBugun();
    if(a.donem==='bugun') return [b,b];
    if(a.donem==='hafta'){ const d=mdGun(b); const g=(d.getDay()+6)%7; const p=rpEkle(b,-g); return [p,rpEkle(p,6)]; }
    return [a.bas||b,a.bit||a.bas||b]; },
  veriAnahtar(a){ const [b,e]=RPD_PLAN.donem(a); return `plan|${b}|${e}`; },
  async veri(a){
    const [b,e]=RPD_PLAN.donem(a); const P=(ui._me&&ui._me.id)||0;
    const [,ts1]=rapSinir(b,e);
    const gel0=new Date(b+'T00:00:00'); gel0.setDate(gel0.getDate()-7);
    const [ents,rel,fol,jobs,custs,cts,ops,kisisel,M]=await Promise.all([
      rapHepsi(()=>sb.from('entries').select('id,job_id,customer_id,contact_id,body,action_status,assignee_id,due_at,is_urgent,occurred_at,created_by_team_id')
        .neq('source','system').or(`due_at.lt.${ts1},and(action_status.eq.open,due_at.is.null),occurred_at.gte.${gel0.toISOString()}`).order('id')),
      rapHepsi(()=>sb.from('entry_relevance').select('entry_id,team_id').eq('team_id',P).order('entry_id').order('team_id')),
      rapHepsi(()=>sb.from('work_followers').select('job_id,team_id').eq('team_id',P).order('job_id').order('team_id')),
      rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,primary_contact_id,assignee_id,lifecycle_status').order('id')),
      rapHepsi(()=>sb.from('customers').select('id,firma,telefon').order('id')),
      rapHepsi(()=>sb.from('contacts').select('id,name,title,phone').order('id')),
      rapHepsi(()=>sb.from('work_operations').select('id,job_id,operation_type,status,description,planned_date,location_text,unit_id,supplier_org_id,supplier_contact_id,quantity,quantity_unit')
        .lte('planned_date',e).in('status',['planned','waiting','in_progress']).order('id')),
      rapHepsi(()=>sb.from('personal_events').select('id,title,event_date,event_time,note').gte('event_date',b).lte('event_date',e).order('id')),
      mdYukle()]);
    return {b,e,P,ents,rel,fol,jobs,custs,cts,ops,kisisel,M,gel0:_cIso(gel0)};
  },
  baslik(a,v){ const ad=(ui._me&&ui._me.name)||''; return 'Çalışma planım'+(ad?' — '+ad:''); },
  dosya:()=>'Calisma_Plani',
  kontroller(a){
    const T='plan';
    return `<div class="field"><span class="flabel">Dönem</span>${rpSeg(T,'donem',a.donem,[['bugun','Bugün'],['hafta','Bu hafta'],['ozel','Tarih aralığı']],'Dönem')}
      ${a.donem==='ozel'?rpTarihKontrol(T,a,'bas','bit'):''}</div>
      <p class="fhint rp4-acik">Plan; size atanan, sizi etiketleyen ya da sizin açtığınız açık aksiyonları, sahibi olduğunuz işlerin baskı/montaj tarihlerini ve kişisel randevularınızı içerir — takip ettiğiniz işlerdeki düz güncellemeler görev sayılmaz, yalnız etiketlendiğiniz ya da acil olanlar kısa bir bilgi bölümünde yer alır.</p>`;
  },
  model(a,v){
    const P=v.P, b=v.b, e=v.e, bugun=rpBugun();
    const hata=a.donem==='ozel'?rpDonemDogrula(b,e,62):null;
    const out={b,e,gunler:[],geciken:[],tarihsiz:[],uyari:[],hata,bilgiSatir:[],
      bilgi:[['Dönem',b===e?rpGunAdi(b)+' '+b.slice(0,4):`${rpTr(b)} – ${rpTr(e)}`]]};
    if(hata){ out.uyari.push(hata); out.say={dahil:0,filtre:0,cik:0,birim:'madde'}; return out; }
    const jm={}; v.jobs.forEach(j=>jm[j.id]=j); const cm={}; v.custs.forEach(c=>cm[c.id]=c); const km={}; v.cts.forEach(c=>km[c.id]=c);
    const etik=new Set(v.rel.map(r=>r.entry_id));
    const sahip=new Set(v.jobs.filter(j=>j.assignee_id===P).map(j=>j.id));
    const takip=new Set(v.fol.map(f=>f.job_id));
    const arsiv=id=>!!(id&&jm[id]&&jm[id].lifecycle_status==='kapandi');
    const baglam=(jobId,custId,contactId)=>{ const j=jm[jobId]||null; const c=cm[custId||(j&&j.customer_id)]||null;
      const k=km[contactId||(j&&j.primary_contact_id)]||null;
      const on=j&&j.title&&j.title.includes(' · ')?j.title.split(' · ')[0].toLocaleLowerCase('tr'):'';
      const kTek=c&&on&&String(c.firma||'').toLocaleLowerCase('tr').startsWith(on);
      return {is:j?j.title:'',kurum:c&&!kTek?orgKisa(c.firma,60):'',
        kisi:k?[k.name,k.title?`(${k.title})`:''].filter(Boolean).join(' '):'',
        tel:(k&&k.phone)||(!k&&c&&c.telefon)||''}; };
    const gorev=new Map();                         /* anahtar başına TEK kayıt */
    const ekle=it=>{ if(!gorev.has(it.key)) gorev.set(it.key,it); };
    v.ents.forEach(x=>{
      if(x.action_status==='done'||x.action_status==='cancelled') return;
      if(!(x.due_at||x.action_status==='open')) return;
      if(arsiv(x.job_id)) return;
      const bana=x.assignee_id===P, etiketli=etik.has(x.id), benim=x.created_by_team_id===P&&!x.assignee_id;
      if(!(bana||etiketli||benim)) return;
      ekle({key:'e'+x.id,tip:'aksiyon',gun:x.due_at?rpYerelGun(x.due_at):'',saat:'',baslik:x.body||'',acil:!!x.is_urgent,
        neden:bana?'Size atandı':etiketli?'Sizi etiketledi':'Sizin açtığınız',...baglam(x.job_id,x.customer_id,x.contact_id)}); });
    const U=v.M.unitById;
    v.ops.forEach(o=>{ if(!o.planned_date||!sahip.has(o.job_id)||arsiv(o.job_id)) return;
      const u=o.unit_id?U[o.unit_id]:null;
      ekle({key:'o'+o.id,tip:'op',gun:o.planned_date,saat:'',baslik:`${RP_OPTUR[o.operation_type]||o.operation_type}${o.description?': '+o.description:''}`,
        ...baglam(o.job_id),yer:[u?mdYuzAdi(v.M,u):'',o.location_text||''].filter(Boolean).join(' — '),
        uygulayan:[((v.cts||[]).find(k=>k.id===o.supplier_contact_id)||{}).name||'',o.supplier_org_id&&cm[o.supplier_org_id]?orgKisa(cm[o.supplier_org_id].firma,40):''].filter(Boolean).join(' · '),
        miktar:o.quantity!=null?`${rpSayi(o.quantity)} ${RP_BIRIM[o.quantity_unit]||''}`.trim():''}); });
    v.kisisel.forEach(k=>ekle({key:'k'+k.id,tip:'randevu',gun:k.event_date,saat:k.event_time?String(k.event_time).slice(0,5):'',baslik:k.title||'',not:k.note||''}));
    const gunMap={};
    [...gorev.values()].forEach(it=>{
      if(!it.gun){ out.tarihsiz.push(it); return; }
      if(it.gun<bugun&&it.tip!=='randevu'){ it.gec=Math.round(rpDn(bugun)-rpDn(it.gun)); out.geciken.push(it); return; }
      if(it.gun>=b&&it.gun<=e) (gunMap[it.gun]=gunMap[it.gun]||[]).push(it); });
    const sira=(x,y)=>(x.saat?0:1)-(y.saat?0:1)||String(x.saat).localeCompare(String(y.saat))||(y.acil?1:0)-(x.acil?1:0)||(x.tip==='randevu'?-1:0);
    for(let n=rpDn(b);n<=rpDn(e);n++){ const g=rpIso(n); if(g<bugun&&!(gunMap[g]||[]).length) continue;
      out.gunler.push({gun:g,ad:rpGunAdi(g),maddeler:(gunMap[g]||[]).sort(sira)}); }
    out.geciken.sort((x,y)=>String(x.gun).localeCompare(String(y.gun)));
    /* Bilgi: görevlerle çakışmaz (aksiyonlu kayıt bilgiye düşmez). */
    out.bilgiSatir=v.ents.filter(x=>!x.due_at&&!x.action_status&&x.occurred_at&&x.created_by_team_id!==P
        &&rpYerelGun(x.occurred_at)>=v.gel0&&rpYerelGun(x.occurred_at)<=e&&!arsiv(x.job_id)
        &&(etik.has(x.id)||(x.is_urgent&&x.job_id&&(takip.has(x.job_id)||sahip.has(x.job_id)))))
      .sort((x,y)=>String(y.occurred_at).localeCompare(String(x.occurred_at))).slice(0,12)
      .map(x=>({key:'g'+x.id,tip:'bilgi',gun:rpYerelGun(x.occurred_at),baslik:x.body||'',acil:!!x.is_urgent,etiket:etik.has(x.id),...baglam(x.job_id,x.customer_id,x.contact_id)}));
    out.kisi=(ui._me&&ui._me.name)||'';
    const n=out.geciken.length+out.gunler.reduce((t,g)=>t+g.maddeler.length,0)+out.tarihsiz.length;
    out.say={dahil:n+out.bilgiSatir.length,filtre:n+out.bilgiSatir.length,cik:0,birim:'madde'};
    out.gorevSay=n;
    out.bilgi.unshift(['Kişi',out.kisi]);
    return out;
  },
  bosIndirilebilir:true,
  gunGrup(gunler,dolu){ const out=[];
    gunler.forEach(g=>{ const s=out[out.length-1];
      if(!dolu(g)&&s&&s.bos) s.son=g.ad; else out.push({ad:g.ad,g,bos:!dolu(g)}); });
    return out.map(x=>({...x,ad:x.son?`${x.ad} – ${x.son}`:x.ad,cok:!!x.son})); },
  onizle(m){
    const baglamMetin=it=>[it.is,it.kurum,it.yer,it.uygulayan?'Uygulayan: '+it.uygulayan:'',[it.kisi,it.tel].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
    const madde=it=>`<div class="rp2-row">
      <span class="rp2-tip ${it.tip}">${it.tip==='randevu'?(it.saat||'Randevu'):it.tip==='op'?'Baskı/montaj':'Yapılacak'}</span>
      <span class="rp2-det"><b>${esc(it.baslik)}</b>${it.acil?' <span class="rp2-t uyari">ACİL</span>':''}${it.gec?` <span class="rp2-t uyari">${it.gec} gün gecikti</span>`:''}
        ${baglamMetin(it)?`<em>${esc(baglamMetin(it))}</em>`:''}${it.neden&&it.neden!=='Size atandı'?`<em class="muted">${esc(it.neden)}</em>`:''}</span></div>`;
    let h='';
    if(m.geciken.length) h+=`<h5 class="rp2-g1 rp4-gec">Gecikenler (${m.geciken.length})</h5><div class="rp2-rows">${m.geciken.map(madde).join('')}</div>`;
    RPD_PLAN.gunGrup(m.gunler,g=>g.maddeler.length).forEach(x=>{ h+=`<h5 class="rp2-g1">${esc(x.ad)}</h5>${!x.bos?`<div class="rp2-rows">${x.g.maddeler.map(madde).join('')}</div>`:`<p class="empty">${x.cok?'Bu günlerde':'Bu gün için'} kayıtlı iş yok.</p>`}`; });
    h+=`<h5 class="rp2-g1">Tarihsiz açık aksiyonlar</h5>${m.tarihsiz.length?`<div class="rp2-rows">${m.tarihsiz.map(madde).join('')}</div>`:'<p class="empty">Yok.</p>'}`;
    if(m.bilgiSatir.length) h+=`<h5 class="rp2-g1">Bilgi için</h5><p class="fhint">Görev değildir: etiketlendiğiniz ya da acil işaretli son güncellemeler.</p>
      <div class="rp2-rows">${m.bilgiSatir.map(it=>`<div class="rp2-row"><span class="rp2-tarih-c">${esc(rpTr(it.gun))}</span><span class="rp2-det">${esc(it.baslik)}${it.acil?' <span class="rp2-t uyari">ACİL</span>':''}${[it.is,it.kurum].filter(Boolean).length?`<em>${esc([it.is,it.kurum].filter(Boolean).join(' · '))}</em>`:''}</span></div>`).join('')}</div>`;
    return h;
  },
  pdf(m){
    const ic=[];
    const satir=it=>({columns:[rpKutu(11),{width:'*',stack:[
      {text:[...(it.saat?[{text:it.saat+'  ',bold:true,color:RPC.mavi}]:[]),{text:it.baslik,bold:true},
        ...(it.acil?[{text:'  ACİL',bold:true,color:RPC.kirmizi,fontSize:9}]:[]),...(it.gec?[{text:`  ${it.gec} gün gecikti`,bold:true,color:RPC.kirmizi,fontSize:9}]:[])]},
      ...([it.tip==='op'?'Baskı / montaj':null,it.is,it.kurum].filter(Boolean).length?[{text:[it.tip==='op'?'Baskı / montaj':null,it.is,it.kurum].filter(Boolean).join(' · '),style:'not'}]:[]),
      ...(it.yer?[{text:'Yer: '+it.yer+(it.miktar?' · '+it.miktar:''),style:'not'}]:[]),
      ...(it.uygulayan?[{text:'Uygulayan: '+it.uygulayan,style:'not'}]:[]),
      ...(it.kisi||it.tel?[{text:[it.kisi,it.tel].filter(Boolean).join(' · '),style:'not',color:RPC.ink}]:[]),
      ...(it.not?[{text:it.not,style:'not'}]:[])]}],
      columnGap:4,margin:[0,0,0,7],unbreakable:true});
    const bilgiSatir=it=>({stack:[{text:[{text:rpTr(it.gun)+'  ',color:RPC.ink3,fontSize:9},{text:it.baslik},...(it.acil?[{text:'  ACİL',bold:true,color:RPC.kirmizi,fontSize:9}]:[])]},
      ...([it.is,it.kurum].filter(Boolean).length?[{text:[it.is,it.kurum].filter(Boolean).join(' · '),style:'not'}]:[])],margin:[0,0,0,5],unbreakable:true});
    const bolum=(bas,ogeler,bosMetin,ara)=>{ const b={...(typeof bas==='string'?rpH2(bas):bas),headlineLevel:undefined};
      if(!ogeler.length){ ic.push({stack:[b,...(ara?[ara]:[]),{text:bosMetin,style:'bos'}],unbreakable:true}); return; }
      ic.push({stack:[b,...(ara?[ara]:[]),ogeler[0]],unbreakable:true}); ogeler.slice(1).forEach(x=>ic.push(x)); };
    ic.push({text:'Çevrimdışı kopya: işaretler uygulamaya aktarılmaz; tamamlanan işleri uygulamada da işaretleyin.',style:'not',margin:[0,0,0,8]});
    if(m.geciken.length) bolum(rpH2(`Gecikenler (${m.geciken.length})`,{color:RPC.kirmizi}),m.geciken.map(satir));
    RPD_PLAN.gunGrup(m.gunler,g=>g.maddeler.length).forEach(x=>
      bolum(x.ad,x.bos?[]:x.g.maddeler.map(satir),x.cok?'Bu günlerde kayıtlı iş yok.':'Bu gün için kayıtlı iş yok.'));
    bolum('Tarihsiz açık aksiyonlar',m.tarihsiz.map(satir),'Yok.');
    if(m.bilgiSatir.length) bolum('Bilgi için',m.bilgiSatir.map(bilgiSatir),'',
      {text:'Görev değildir: etiketlendiğiniz ya da acil işaretli son güncellemeler.',style:'not',margin:[0,0,0,5]});
    return {icerik:ic,o:{yon:'portrait',boyut:'A5',altNot:'Çevrimdışı kopya'}};
  }
};

/* ==========================================================
   4) İŞ DÖKÜMÜ (S16) — "İşe özel baskı/montaj dökümü" ile "İş özeti ve
   geçmişi" BİRLEŞTİ. Bağımsız rapor; giriş yalnız iş seçimidir.
     · Özet (sabit): kurum, ilgili kişiler, güncel aşama, önemli tarihler,
       açık aksiyonlar
     · Yayınlar · Baskı / montaj · Güncellemeler ve önemli geçmiş ·
       Belgeler — anlaşılır dahil et / çıkar; verisi olmayan bölüm PDF'e
       HİÇ girmez (boş tablo yok)
   Varsayılan kapsam işin tamamı; tarih süzgeci, iç/dış, alıcı ve ham
   Hareket türü seçimi yoktur. Bedeller kayıtlı maliyettir.

   Geçmiş: kullanıcı güncellemeleri (açık aksiyonlar özetin içindedir) +
   önemli sistem olayları. Olaylar YALNIZ tür koduyla seçilir, metinden
   tahmin yapılmaz:
     her zaman  : iş açıldı / adı / aşaması / durumu değişti, sözleşme,
                  teklif revizyonu ve onayı, muhasebe durumu
     bölümüyle  : yayın (media_*), baskı/montaj (operation_*, paket) ve
                  belge (document_*) olayları — o bölüm rapordaysa olay
                  orada zaten görünür ve geçmişte TEKRAR YAZILMAZ
     hiçbir zaman: document_changed (rutin alan değişikliği)
   Aynı gün, aynı tür ve aynı metinli teknik kopyalar tek satırdır.
   ========================================================== */
const RP_GECMIS_KURAL={work_created:'her',work_renamed:'her',work_phase:'her',work_lifecycle:'her',work_contract:'her',work_accounting:'her',
  contract_created:'her',contract_signed:'her',contract_cancelled:'her',quote_revised:'her',quote_approved:'her',
  media_created:'yayin',media_changed:'yayin',media_cancelled:'yayin',
  operation_created:'baski',operation_status:'baski',price_group_changed:'baski',
  document_added:'belge',document_linked:'belge',document_unlinked:'belge'};
const RP_IS_BOLUM=[['yayin','Yayınlar'],['baski','Baskı / montaj'],['gecmis','Güncellemeler ve önemli geçmiş'],['belge','Belgeler']];
/* İşe ait baskı/montaj dökümü (eski "işe özel döküm" düzeni, maliyetle). */
function rpDokumKur(ops,gm,M){
  const jm={}; ops.forEach(o=>{ jm[o.job_id]={id:o.job_id}; });
  const kalemler=rpKalemleriKur(ops.filter(o=>o.status!=='cancelled'),jm);
  kalemler.forEach(k=>{ k.d=k.ops; });
  const paketler=rpPaketKur(kalemler.flatMap(k=>k.d),ops,gm);
  rpKalemSirala(kalemler,paketler);
  const toplamlar=rpToplamKur(kalemler,paketler);
  const pakette=o=>!!(o.price_group_id&&paketler[o.price_group_id]);
  const bugun=rpBugun();
  const K1=[], K2=[]; let sonP=null;
  kalemler.forEach(k=>{
    const B=k.d.filter(o=>o.operation_type==='baski'), Mo=k.d.filter(o=>o.operation_type==='montaj'), D=k.d.filter(o=>!['baski','montaj'].includes(o.operation_type));
    const hizmet=(o,bagli)=>K2.push({tip:'hizmet',key:'o'+o.id,urun:rpHizmetAd(M,o),urunAlt:[bagli?'↳ '+bagli:'',o.operation_type==='montaj'?'baskıyla eşleştirilmemiş':'',rpOpYer(M,o)].filter(Boolean).join(' · '),
      olcu:o.dimensions||'',yuzey:o.surface_count,adet:o.quantity==null?null:+o.quantity,birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',
      birimFiyat:rpBirimFiyat(o.unit_cost,rpMaliyet(o),o.quantity),tutar:rpMaliyet(o),pb:o.currency||'TRY',gri:pakette(o),
      tarih:o.planned_date||'',durum:RP_OPDURUM[o.status]||o.status,not:o.note||''});
    if(!B.length){ [...Mo,...D].forEach(o=>hizmet(o,'')); return; }
    if(k.paket&&k.paket!==sonP) K1.push({tip:'paket',...paketler[k.paket]});
    sonP=k.paket;
    const mGri=Mo.length>0&&Mo.every(pakette);
    const rows=B.map(o=>({key:'o'+o.id,urun:o.description||rpOpUnit(M,o)||'Baskı',
      urunAlt:[o.reprint?'Yeniden baskı':'',rpOpYer(M,o)].filter(Boolean).join(' · '),malzeme:rpOpMalzeme(o),
      olcu:o.dimensions||'',gorunen:o.visible_size||'',yuzey:o.surface_count,adet:o.quantity==null?null:+o.quantity,
      birim:RP_BIRIM[o.quantity_unit]||o.quantity_unit||'',birimFiyat:rpBirimFiyat(o.unit_cost,rpMaliyet(o),o.quantity),
      tutar:rpMaliyet(o),pb:o.currency||'TRY',gri:pakette(o)}));
    K1.push({tip:'kalem',key:k.key,rows,durum:rpKalemDurum(k.d,bugun),
      tarih:[...new Set(k.d.map(o=>o.planned_date).filter(Boolean))].sort(),
      montaj:Mo.length?{bedel:mGri?rpTutarTopla(Mo,rpMaliyet):rpTutarTopla(Mo.filter(o=>!pakette(o)),rpMaliyet),gri:mGri,
        eksik:Mo.some(o=>rpMaliyet(o)==null)&&!mGri,kapsar:B.length}:null,
      not:k.d.filter(o=>o.note).map(o=>(k.d.length>1?RP_OPTUR[o.operation_type]+': ':'')+o.note).join(' ')});
    D.forEach(o=>hizmet(o,rows[0].urun));
  });
  const bolumler=[{ad:'Baskı ve montaj kalemleri',tip:'kalem',satirlar:K1},{ad:'Destek hizmetleri',tip:'hizmet',satirlar:K2}].filter(b=>b.satirlar.length);
  return {sablon:'dokum',bolumler,toplamlar,paketler,kismiPaket:false,bedelAd:'Maliyet',islemSay:kalemler.reduce((t,k)=>t+k.d.length,0)};
}
RPD_IS={
  amac:'Bir işin tek belgelik dökümü: özet, yayınlar, baskı/montaj maliyetleri, önemli geçmiş ve belgeler.',
  alici:'ic', kontrolVeriyle:true, kontrolModelle:true, secimli:false, bosIndirilebilir:true,
  varsayilan(){ return {is:(ui._work&&ui._work.id)||0,bolum:{yayin:true,baski:true,gecmis:true,belge:true}}; },
  preset(){ return {}; },
  veriAnahtar:a=>'is|'+a.is,
  async veri(a){
    const [jobs,custs]=await Promise.all([rapHepsi(()=>sb.from('jobs').select('id,title,customer_id,lifecycle_status').order('id')),api('customers_min')]);
    if(!a.is) return {jobs,custs};
    const [d,team,cts,fol,grp,M]=await Promise.all([api('work_detail&id='+a.is),api('team_list'),
      rapHepsi(()=>sb.from('contacts').select('id,name,title,phone,email').order('id')),
      rapHepsi(()=>sb.from('work_followers').select('job_id,team_id').eq('job_id',a.is).order('job_id').order('team_id')),
      rapHepsi(()=>sb.from('operation_price_groups').select('id,job_id,label,cost_amount,currency,note').eq('job_id',a.is).order('id')),mdYukle()]);
    if(!d) throw new Error('İş bulunamadı ya da bu işe erişiminiz yok.');
    return {jobs,custs,d,team,cts,fol,grp,M};
  },
  baslik(a,v){ const d=v&&v.d; return d?`${d.job.title||'İş'} — iş dökümü`:'İş dökümü'; },
  dosya:m=>'Is_Dokumu'+(m.dosyaEk?'_'+m.dosyaEk:''),
  kontroller(a){
    const v=(rpDurum().veri||{}).is, T='is';
    const jobs=v?v.jobs:[]; const cm={}; ((v&&v.custs)||[]).forEach(c=>cm[c.id]=c.firma||'');
    const opt=j=>`<option value="${j.id}" data-ek="${esc(j.customer_id&&cm[j.customer_id]?orgKisa(cm[j.customer_id],50):'kurum bağlantısı yok')}${j.lifecycle_status==='kapandi'?' · arşiv':''}" ${a.is===j.id?'selected':''}>${esc(j.title||'#'+j.id)}</option>`;
    const m=ui._rpModel&&ui._rpTur==='is'?ui._rpModel:null;
    const say=k=>m&&m.bolumSay?m.bolumSay[k]:null;
    return `<div class="field"><label class="flabel" for="rpIs">İş</label><select class="inp ${a.is?'inp-on':''}" id="rpIs" data-ara onchange="rpIsSec(+this.value)">
        <option value="0">İş adı ya da kurum ile arayın…</option>${[...jobs].sort((x,y)=>(x.lifecycle_status==='kapandi')-(y.lifecycle_status==='kapandi')||String(x.title).localeCompare(String(y.title),'tr')).map(opt).join('')}</select>
        <p class="fhint">Rapor işin tamamını kapsar. Kurum adı yalnız arama yardımıdır.</p></div>
      ${a.is?`<div class="field"><span class="flabel">Bölümler <span class="muted">— özet her zaman yer alır</span></span><div class="rp2-chips col">
        ${RP_IS_BOLUM.map(([k,l])=>{ const n=say(k); const yok=n===0;
          return `<label class="rp2-chk${yok?' pasif':''}"><input type="checkbox" ${a.bolum[k]&&!yok?'checked':''} ${yok?'disabled':''} onchange="rpIsBolum('${k}',this.checked)">
            <span>${esc(l)}${n==null?'':yok?' <em>kayıt yok — rapora girmez</em>':` <em>${n}</em>`}</span></label>`; }).join('')}</div></div>`:''}`;
  },
  model(a,v){
    const out={uyari:[],bilgi:[],bolumSay:{}};
    if(!a.is||!v.d){ out.bos=true; out.say={dahil:0,filtre:0,cik:0,birim:'bölüm'}; return out; }
    const d=v.d, j=d.job, M=v.M, bugun=rpBugun();
    const tm={}; (v.team||[]).forEach(t=>tm[t.id]=t.name); const cm={}; (v.custs||[]).forEach(c=>cm[c.id]=c.firma||'');
    const km={}; (v.cts||[]).forEach(c=>km[c.id]=c);
    const ls=j.lifecycle_status||'acik';
    out.dosyaEk=String(j.title||'').replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü]+/g,'_').replace(/^_+|_+$/g,'').slice(0,40);
    /* --- Özet (sabit) --- */
    const med=(d.medya||[]), medAkt=med.filter(r=>r.commitment!=='cancelled');
    const ops=(d.ops||[]).filter(o=>o.status!=='cancelled');
    const aralik=(l)=>{ const s=l.map(x=>x[0]).filter(Boolean).sort()[0], e=l.map(x=>x[1]).filter(Boolean).sort().slice(-1)[0];
      const acik=l.some(x=>x[0]&&!x[1]); return s?`${rpTr(s)} – ${acik?'bitiş bilinmiyor':e?rpTr(e):'…'}`:''; };
    const tarihler=[['İş açıldı',rpTr(rpYerelGun(j.created_at))]];
    if(medAkt.length) tarihler.push(['Yayın dönemi',aralik(medAkt.map(r=>[r.block_start,r.block_end]))]);
    if(ops.some(o=>o.planned_date)) tarihler.push(['Baskı / montaj',aralik(ops.filter(o=>o.planned_date).map(o=>[o.planned_date,o.planned_date]))]);
    const soz=(d.contracts||[]).filter(c=>c.status!=='iptal');
    soz.forEach(c=>{ const ad=c.title||c.reference_no||'Sözleşme';
      const kl=(c.contract_items||[]); const ks=kl.map(x=>x.start_date).filter(Boolean).sort()[0], ke=kl.map(x=>x.end_date).filter(Boolean).sort().slice(-1)[0];
      const t=[c.signed_at?'imza '+rpTr(String(c.signed_at).slice(0,10)):'',ks?`${rpTr(ks)} – ${ke?rpTr(ke):'…'}`:''].filter(Boolean).join(' · ');
      tarihler.push(['Sözleşme',`${ad}${t?' · '+t:''}${c.status==='taslak'?' · taslak':''}`]); });
    if(!soz.length&&(j.contract_signed_at||j.contract_start_date)) tarihler.push(['Sözleşme',[j.contract_signed_at?'imza '+rpTr(j.contract_signed_at):'',j.contract_start_date?`${rpTr(j.contract_start_date)} – ${j.contract_end_date?rpTr(j.contract_end_date):'…'}`:''].filter(Boolean).join(' · ')]);
    if(j.accounting_status&&j.accounting_status!=='yok') tarihler.push(['Muhasebe',(RAP_MUH[j.accounting_status]||j.accounting_status)
      +(j.accounting_processed_at?' · işlendi '+rpTr(rpYerelGun(j.accounting_processed_at)):j.accounting_sent_at?' · gönderildi '+rpTr(rpYerelGun(j.accounting_sent_at)):'')]);
    const kisiler=[];
    const k=km[j.primary_contact_id]; if(k) kisiler.push({ad:k.name,rol:'Ana ilgili kişi'+(k.title?' · '+k.title:''),tel:k.phone||'',eposta:k.email||''});
    const ROL={account:'Müşteri',advertiser:'Reklamveren',agency:'Ajans',bill_to:'Fatura',supplier:'Tedarikçi',operator:'İşletmeci',other:'Diğer'};
    (d.parties||[]).filter(p=>p.customer_id&&String(p.customer_id)!==String(j.customer_id)).forEach(p=>kisiler.push({ad:orgKisa(cm[p.customer_id]||'',60),rol:ROL[p.role]||p.role,tel:'',eposta:''}));
    /* Kişi başına tek satır: iş sahibi aynı zamanda takipçiyse bir kez yazılır. */
    const ekip=[...(j.assignee_id&&tm[j.assignee_id]?[`${tm[j.assignee_id]} (iş sahibi)`]:[]),
      ...[...new Set((v.fol||[]).map(f=>f.team_id))].filter(id=>id!==j.assignee_id).map(id=>tm[id]).filter(Boolean)];
    const insan=(d.entries||[]).filter(e=>e.source!=='system');
    const acikAks=e=>!['done','cancelled'].includes(e.action_status)&&(e.due_at||e.action_status==='open');
    const aksiyon=insan.filter(acikAks).map(e=>{ const g=e.due_at?rpYerelGun(e.due_at):'';
      return {metin:e.body||'',tarih:g,kim:tm[e.assignee_id]||'',gec:g&&g<bugun?Math.round(rpDn(bugun)-rpDn(g)):0}; })
      .sort((x,y)=>String(x.tarih||'9999').localeCompare(String(y.tarih||'9999')));
    out.ozet={is:j.title||'',kurum:cm[j.customer_id]||'',asama:FAZ_ETIKET[j.status]||JOBLBL[j.status]||j.status||'',
      yasam:ls==='kapandi'?`Arşiv${j.closed_reason?' ('+(CLOSELBL[j.closed_reason]||j.closed_reason)+')':''}`:ls==='bekliyor'?'Aktif · Bekliyor':'Aktif',
      acil:!!j.is_urgent,an:rpAnTr(v.okunma),tarihler,kisiler,ekip,aksiyon};
    /* --- Yayınlar --- */
    const yayin=med.slice().sort((x,y)=>String(x.block_start).localeCompare(String(y.block_start))).map(r=>{
      const u=r.unit_id?M.unitById[r.unit_id]:null, al=M.altById[r.alt_mecra_id];
      return {mecra:r.mecra_name||'',yuzey:u?mdYuzAdi(M,u):(al?al.name:r.area_name)||'',led:r.occupancy_mode==='concurrent',
        donem:r.record_kind==='legacy'&&r.date_precision==='month'?`${mdYmAdi(r.ym)} · ay bazlı`:`${rpTr(r.block_start)} – ${r.block_end?rpTr(r.block_end):'bitiş bilinmiyor'}`,
        durum:mdKayitDurumAd(r,mdZamansal(r,bugun))+(r.commitment==='reserved'&&r.option_expires_at&&r.option_expires_at<bugun?' · süresi doldu':'')}; });
    /* --- Baskı / montaj --- */
    const gm={}; (v.grp||[]).forEach(g=>gm[g.id]=g);
    const baski=rpDokumKur(d.ops||[],gm,M);
    /* --- Belgeler --- */
    const belge=workBelgeListe(d).map(x=>({ad:x.doc.title||x.doc.original_name||'Belge',tur:belgeTurLbl(x.doc.doc_type),tarih:rpYerelGun(x.doc.created_at)}))
      .sort((x,y)=>String(x.tarih).localeCompare(String(y.tarih)));
    const B=a.bolum||{};
    out.bolumSay={yayin:yayin.length,baski:baski.islemSay,belge:belge.length};
    const var_=k=>!!B[k]&&out.bolumSay[k]>0;
    /* --- Geçmiş (bölüm seçimine bağlı: olay kendi bölümündeyse tekrar yazılmaz) --- */
    const gecmis=[];
    insan.filter(e=>!acikAks(e)).forEach(e=>gecmis.push({gun:rpYerelGun(e.occurred_at),ts:e.occurred_at,tur:e.action_status==='done'?'Tamamlanan aksiyon':e.action_status==='cancelled'?'İptal edilen aksiyon':'Güncelleme',
      metin:e.body||'',kim:tm[e.created_by_team_id]||''}));
    const gor=new Set();
    (d.entries||[]).filter(e=>e.source==='system').forEach(e=>{
      const kural=RP_GECMIS_KURAL[e.system_kind]; if(!kural) return;
      if(kural!=='her'&&var_(kural)) return;
      const g=rpYerelGun(e.occurred_at), imza=e.system_kind+'|'+g+'|'+(e.body||'');
      if(gor.has(imza)) return; gor.add(imza);
      gecmis.push({gun:g,ts:e.occurred_at,tur:'Olay',metin:e.body||'',kim:e.created_by_team_id?tm[e.created_by_team_id]||'':''}); });
    gecmis.sort((x,y)=>String(x.ts).localeCompare(String(y.ts)));
    out.bolumSay.gecmis=gecmis.length;
    out.yayin=var_('yayin')?yayin:null;
    out.baski=var_('baski')?baski:null;
    out.gecmis=var_('gecmis')?gecmis:null;
    out.belge=var_('belge')?belge:null;
    const n=['yayin','baski','gecmis','belge'].filter(var_).length;
    out.say={dahil:1+n,filtre:1+n,cik:0,birim:'bölüm (özet dahil)'};
    if(out.baski){ out.toplamlar=out.baski.toplamlar; }
    return out;
  },
  onizle(m){
    if(m.bos) return '<p class="empty">Rapor için yukarıdan bir iş seçin.</p>';
    if(!m.ozet) return '';
    const o=m.ozet;
    let h=`<div class="rp2-ozetkart"><b>${esc(o.is)}</b><span>${esc(o.kurum||'Kurum bağlantısı yok')}</span>
      <span>Güncel durum (${esc(o.an)} itibarıyla): <b>${esc(o.asama)}</b> · ${esc(o.yasam)}${o.acil?' · Acil':''}</span>
      ${o.tarihler.map(([k,v])=>`<span>${esc(k)}: ${esc(v)}</span>`).join('')}</div>`;
    h+=`<h5 class="rp2-g1">İlgili kişiler</h5>${o.kisiler.length?o.kisiler.map(k=>`<p class="rp2-ozet"><b>${esc(k.ad)}</b> — ${esc(k.rol)}${k.tel?' · '+esc(k.tel):''}${k.eposta?' · '+esc(k.eposta):''}</p>`).join(''):'<p class="rp2-ozet muted">Kayıtlı kişi yok.</p>'}
      ${o.ekip.length?`<p class="rp2-ozet">Medyapark ekibi: ${esc(o.ekip.join(', '))}</p>`:''}`;
    h+=`<h5 class="rp2-g1">Açık aksiyonlar</h5>${o.aksiyon.length?`<div class="rp2-rows">${o.aksiyon.map(x=>`<div class="rp2-row"><span class="rp2-tarih-c">${esc(rpTr(x.tarih)||'tarihsiz')}</span><span class="rp2-det">${esc(x.metin)}${x.gec?` <span class="rp2-t uyari">${x.gec} gün gecikti</span>`:''}${x.kim?` <em>${esc(x.kim)}</em>`:''}</span></div>`).join('')}</div>`:'<p class="rp2-ozet muted">Açık aksiyon yok.</p>'}`;
    if(m.yayin) h+=`<h5 class="rp2-g1">Yayınlar</h5><div class="rp2-rows">${m.yayin.map(x=>`<div class="rp2-row"><b>${esc([x.mecra,x.yuzey].filter(Boolean).join(' · '))}</b>${x.led?' <span class="md-tag">LED</span>':''}<span class="rp2-det">${esc(x.donem)}</span><span class="rp2-durum">${esc(x.durum)}</span></div>`).join('')}</div>`;
    if(m.baski){ const b=m.baski; h+=`<h5 class="rp2-g1">Baskı / montaj</h5>`;
      b.bolumler.forEach(bl=>{ h+=`<div class="rp3-kap"><table class="rp3-tab rp3-bm"><thead><tr>${(bl.tip==='kalem'?['Ürün','Malzeme','Ölçü (baskı / görünen)','Yüzey · adet','Montaj','Birim maliyet','Maliyet','Durum']:['Hizmet','','Ölçü','Yüzey · miktar','','Birim maliyet','Maliyet','Durum']).map(t=>`<th>${esc(t)}</th>`).join('')}</tr></thead><tbody>`;
        bl.satirlar.forEach(s=>{
          if(s.tip==='paket'){ h+=`<tr class="rp3-pk${s.tam?'':' kismi'}"><td colspan="6"><b>Paket maliyeti — ${esc(s.ad)}</b><small>${s.kapsam} işlemi kapsar; satır tutarları bilgi amaçlıdır</small></td><td class="sag"><b>${esc(rpPara(s.tutar,s.pb))}</b></td><td></td></tr>`; return; }
          if(s.tip==='hizmet'){ h+=`<tr class="son"><td colspan="2"><b>${esc(s.urun)}</b>${s.urunAlt?`<small>${esc(s.urunAlt)}</small>`:''}</td><td>${esc(s.olcu)}</td>
              <td class="sag">${esc([s.yuzey!=null?s.yuzey+' yüzey':'',s.adet!=null?rpSayi(s.adet)+' '+s.birim:''].filter(Boolean).join(' · '))}</td><td></td>
              <td class="sag">${s.birimFiyat==null?'—':esc(rpPara(s.birimFiyat,s.pb))}</td><td class="sag${s.gri?' rp3-gri':''}">${s.tutar==null?'—':esc(rpPara(s.tutar,s.pb))}</td><td>${esc(s.durum)}</td></tr>`; return; }
          const n=s.rows.length, D=RP_KDURUM[s.durum.k];
          s.rows.forEach((r,i)=>{ h+=`<tr class="${i===n-1?'son':''}"><td><b>${esc(r.urun)}</b>${r.urunAlt?`<small>${esc(r.urunAlt)}</small>`:''}</td><td>${esc(r.malzeme)}</td>
            <td>${esc([r.olcu,r.gorunen?'görünen '+r.gorunen:''].filter(Boolean).join(' / '))}</td>
            <td class="sag">${esc([r.yuzey!=null?r.yuzey+' yüzey':'',r.adet!=null?rpSayi(r.adet)+(r.birim&&r.birim!=='adet'?' '+r.birim:' adet'):''].filter(Boolean).join(' · '))}</td>
            ${i===0?`<td class="sag" rowspan="${n}">${s.montaj?(s.montaj.bedel.length?esc(rpParaListe(s.montaj.bedel)):'<span class="muted">girilmemiş</span>')+(s.montaj.kapsar>1?`<small>${s.montaj.kapsar} kalemin ortak montajı</small>`:''):'<span class="muted">—</span>'}</td>`:''}
            <td class="sag">${r.birimFiyat==null?'—':esc(rpPara(r.birimFiyat,r.pb))}</td><td class="sag${r.gri?' rp3-gri':''}">${r.tutar==null?'—':esc(rpPara(r.tutar,r.pb))}</td>
            ${i===0?`<td rowspan="${n}" style="color:${D.ink}"><b>${esc(s.durum.t)}</b>${s.not?`<small>${esc(s.not)}</small>`:''}</td>`:''}</tr>`; }); });
        h+=`</tbody></table></div>`; });
      h+=rpBToplamHtml(b); }
    if(m.gecmis) h+=`<h5 class="rp2-g1">Güncellemeler ve önemli geçmiş</h5><div class="rp2-rows">${m.gecmis.map(x=>`<div class="rp2-row"><span class="rp2-tarih-c">${esc(rpTr(x.gun))}</span>
      <span class="rp2-tip ${x.tur==='Olay'?'hareket':'guncelleme'}">${esc(x.tur)}</span><span class="rp2-det">${esc(x.metin)}${x.kim?` <em>${esc(x.kim)}</em>`:''}</span></div>`).join('')}</div>`;
    if(m.belge) h+=`<h5 class="rp2-g1">Belgeler</h5><div class="rp2-rows">${m.belge.map(x=>`<div class="rp2-row"><span class="rp2-tarih-c">${esc(rpTr(x.tarih))}</span><b>${esc(x.ad)}</b><span class="rp2-det">${esc(x.tur)}</span></div>`).join('')}</div>`;
    const atlanan=RP_IS_BOLUM.filter(([k])=>m.bolumSay[k]===0).map(([,l])=>l);
    if(atlanan.length) h+=`<p class="fhint">Kaydı olmayan bölümler PDF'e eklenmez: ${esc(atlanan.join(', '))}.</p>`;
    return h;
  },
  pdf(m){
    const ic=[]; const o=m.ozet;
    if(!o){ ic.push({text:'Rapor için iş seçilmedi.',style:'bos'}); return {icerik:ic,o:{}}; }
    const L={color:RPC.ink3,fontSize:8.5};
    ic.push({table:{widths:[88,'*'],body:[
      [{text:'Kurum',...L},{text:o.kurum||'Kurum bağlantısı yok',bold:true}],
      [{text:'Güncel durum',...L},{text:[{text:o.asama,bold:true},' · '+o.yasam+(o.acil?' · Acil':''),{text:`   (${o.an} itibarıyla)`,color:RPC.ink3,fontSize:8}]}],
      ...o.tarihler.map(([k,v])=>[{text:k,...L},v]),
      [{text:'İlgili kişiler',...L},o.kisiler.length?{stack:o.kisiler.map(k=>({text:[{text:k.ad,bold:true},' — '+k.rol+(k.tel?' · '+k.tel:'')+(k.eposta?' · '+k.eposta:'')]}))}:{text:'Kayıtlı kişi yok.',color:RPC.ink3}],
      ...(o.ekip.length?[[{text:'Medyapark ekibi',...L},o.ekip.join(', ')]]:[])]},
      layout:{hLineWidth:()=>0,vLineWidth:()=>0,fillColor:()=>RPC.soft,paddingLeft:()=>8,paddingRight:()=>8,paddingTop:()=>3.5,paddingBottom:()=>3.5},margin:[0,0,0,8],unbreakable:true});
    if(o.aksiyon.length) ic.push(rpBolum('Açık aksiyonlar',[{b:'Tarih',g:58},{b:'Aksiyon',g:'*'},{b:'İlgili',g:90}],
      o.aksiyon.map(x=>[{text:x.tarih?rpTr(x.tarih):'tarihsiz',color:x.gec?RPC.kirmizi:RPC.ink,bold:!!x.gec},{stack:[{text:x.metin},...(x.gec?[{text:`${x.gec} gün gecikti`,color:RPC.kirmizi,fontSize:8}]:[])]},x.kim||'—'])));
    else ic.push({text:'Açık aksiyon yok.',style:'not',margin:[0,0,0,8]});
    if(m.yayin) ic.push(rpBolum('Yayınlar',[{b:'Mecra',g:110},{b:'Yüzey / yayın alanı',g:'*'},{b:'Dönem',g:130},{b:'Durum',g:92}],
      m.yayin.map(x=>[x.mecra,x.yuzey+(x.led&&!/LED/i.test(x.yuzey)?' (LED)':''),x.donem,x.durum])));
    if(m.baski){ const b=m.baski;
      const W=['*',72,56,58,60,62,60];
      const para=(v,pb,gri)=>({text:v==null?'—':rpPara(v,pb),alignment:'right',color:gri?RPC.ink3:RPC.ink,italics:!!gri});
      b.bolumler.forEach((bl,bi)=>{
        const bas=(bl.tip==='kalem'?['Ürün / malzeme','Ölçü (baskı / görünen)','Yüzey · adet','Montaj','Birim maliyet','Maliyet','Durum']:['Hizmet','Ölçü','Yüzey · miktar','','Birim maliyet','Maliyet','Durum'])
          .map((t,i)=>({text:t,style:'th',alignment:[2,3,4,5].includes(i)?'right':'left'}));
        const baslik=bi===0?'Baskı / montaj — '+bl.ad.toLocaleLowerCase('tr'):bl.ad;
        const body=[[{text:baslik,style:'h2',colSpan:7,margin:[-3,6,0,0]},{},{},{},{},{},{}],bas];
        bl.satirlar.forEach(s=>{
          if(s.tip==='paket'){ body.push([{stack:[{text:`Paket maliyeti — ${s.ad}: ${rpPara(s.tutar,s.pb)}`,bold:true},{text:`${s.kapsam} işlemi kapsar; aşağıdaki satır tutarları bilgi amaçlıdır.`+(s.not?' '+s.not:''),style:'not'}],colSpan:7,fillColor:'#EEF3FB'},{},{},{},{},{},{}]); return; }
          if(s.tip==='hizmet'){ body.push([{stack:[{text:s.urun,bold:true},...(s.urunAlt?[{text:s.urunAlt,style:'not'}]:[]),...(s.not?[{text:s.not,style:'not'}]:[])]},s.olcu,
            {text:[s.yuzey!=null?s.yuzey+' yüzey':'',s.adet!=null?rpSayi(s.adet)+' '+s.birim:''].filter(Boolean).join(' · '),alignment:'right'},'',para(s.birimFiyat,s.pb),para(s.tutar,s.pb,s.gri),{text:s.durum,fontSize:8}]); return; }
          const n=s.rows.length, D=RP_KDURUM[s.durum.k];
          s.rows.forEach((r,i)=>body.push([{stack:[{text:r.urun,bold:true},...(r.malzeme?[{text:r.malzeme,fontSize:8.3,color:RPC.ink}]:[]),...(r.urunAlt?[{text:r.urunAlt,style:'not'}]:[]),...(i===0&&s.not?[{text:s.not,style:'not'}]:[])]},
            {text:[r.olcu,r.gorunen?'görünen '+r.gorunen:''].filter(Boolean).join(' / '),fontSize:8.5},
            {text:[r.yuzey!=null?r.yuzey+' yüzey':'',r.adet!=null?rpSayi(r.adet)+(r.birim&&r.birim!=='adet'?' '+r.birim:' adet'):''].filter(Boolean).join('\n'),alignment:'right',fontSize:8.5},
            i===0?{stack:s.montaj?[{text:s.montaj.bedel.length?rpParaListe(s.montaj.bedel):'girilmemiş',color:s.montaj.gri||!s.montaj.bedel.length?RPC.ink3:RPC.ink,italics:!!s.montaj.gri},
                ...(s.montaj.kapsar>1?[{text:`${s.montaj.kapsar} kalemin ortak montajı`,style:'not'}]:[])]:[{text:'—',color:RPC.ink3}],alignment:'right',rowSpan:n}:{},
            para(r.birimFiyat,r.pb),para(r.tutar,r.pb,r.gri),
            i===0?{text:s.durum.t,bold:true,color:D.ink,fontSize:8,rowSpan:n,...(D.fill?{fillColor:D.fill}:{})}:{}]));
        });
        ic.push({table:{headerRows:2,dontBreakRows:true,keepWithHeaderRows:1,widths:W,body},layout:{hLineWidth:(i,n)=>i<=1?0:i===2?0.9:i===n.table.body.length?0.8:0.45,
            vLineWidth:()=>0,hLineColor:i=>i===2?'#8e8e95':'#d4d4d9',fillColor:i=>i===1?'#E3E9F4':null,
            paddingLeft:()=>3,paddingRight:()=>3,paddingTop:()=>3,paddingBottom:()=>3},fontSize:8.8,margin:[0,0,0,6]}); });
      ic.push(...rpPdfToplam(b,250)); }
    if(m.gecmis) ic.push(rpBolum('Güncellemeler ve önemli geçmiş',[{b:'Tarih',g:56},{b:'Tür',g:72},{b:'Gelişme',g:'*'},{b:'Kim',g:78}],
      m.gecmis.map(x=>[rpTr(x.gun),{text:x.tur,color:x.tur==='Olay'?RPC.ink3:RPC.ink,fontSize:8.5},x.metin,{text:x.kim||'',color:RPC.ink2,fontSize:8.5}])));
    if(m.belge){ ic.push(rpBolum('Belgeler',[{b:'Tarih',g:56},{b:'Belge',g:'*'},{b:'Tür',g:120}],m.belge.map(x=>[rpTr(x.tarih),x.ad,x.tur])));
      ic.push({text:'Belgeler bu rapora eklenmemiştir; yalnız listelenmiştir.',style:'not'}); }
    return {icerik:ic,o:{yon:'portrait'}};
  }
};
function rpIsSec(id){ const a=rpAyar('is'); a.is=id; a.bolum={yayin:true,baski:true,gecmis:true,belge:true};
  rpDurum().baslik.is=null; rpDurum().secim.is=null; ui._rpModel=null;
  rpYenile('is'); }
function rpIsBolum(k,on){ const a=rpAyar('is'); a.bolum={...(a.bolum||{}),[k]:on}; rpOnizleCiz('is'); }

var RPD_MECRA, RPD_BASKI, RPD_PLAN, RPD_IS;
const RPD={get mecra(){return RPD_MECRA;},get baski(){return RPD_BASKI;},get plan(){return RPD_PLAN;},get is(){return RPD_IS;}};
