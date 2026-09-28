/* ============ MEDYAPARK PANEL — Supabase sürümü ============ */
const MONTHS=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const MONTHS_SHORT=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>{const x=Number(n);return isFinite(x)?x.toLocaleString('tr-TR')+' ₺':(n||'');};
const gv=id=>{const e=document.getElementById(id);return e?e.value:'';};
const pad=n=>String(n).padStart(2,'0');

/* ---- Storage yükleme ---- */
/* ==========================================================
   GÖRSEL OPTİMİZASYONU
   Yüklemeden önce tarayıcıda küçültülür ve WebP'ye çevrilir.
   SVG/GIF'e dokunulmaz (vektör / animasyon bozulmasın).
   ========================================================== */
let _webpOK=null;
function webpDestegi(){
  if(_webpOK!==null) return Promise.resolve(_webpOK);
  return new Promise(res=>{ const c=document.createElement('canvas'); c.width=c.height=1;
    c.toBlob(b=>{ _webpOK=!!b && b.type==='image/webp'; res(_webpOK); },'image/webp',0.8); });
}
const _kb=n=>n>=1048576?(n/1048576).toFixed(1)+' MB':Math.round(n/1024)+' KB';

async function optimizeImage(file,opt){
  opt=opt||{};
  const max=opt.max||1920, q=opt.q||0.82;
  if(!file.type||!file.type.startsWith('image/')) return {file,note:null};
  if(/svg|gif/i.test(file.type)) return {file,note:null};
  let img;
  const url=URL.createObjectURL(file);
  try{ img=await new Promise((res,rej)=>{ const i=new Image();
        i.onload=()=>res(i); i.onerror=()=>rej(new Error('okunamadı')); i.src=url; }); }
  catch(e){ URL.revokeObjectURL(url); return {file,note:null}; }
  const w=img.naturalWidth||img.width, h=img.naturalHeight||img.height;
  const sc=Math.min(1, max/Math.max(w,h));
  const nw=Math.max(1,Math.round(w*sc)), nh=Math.max(1,Math.round(h*sc));
  const cv=document.createElement('canvas'); cv.width=nw; cv.height=nh;
  const cx=cv.getContext('2d'); cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high';
  cx.drawImage(img,0,0,nw,nh);
  URL.revokeObjectURL(url);
  const webp=await webpDestegi();
  /* WebP yoksa: saydamlığı olan PNG'yi PNG bırak, diğerlerini JPEG yap */
  const tip = webp ? 'image/webp' : (file.type==='image/png' ? 'image/png' : 'image/jpeg');
  const blob=await new Promise(res=>cv.toBlob(res,tip,q));
  if(!blob) return {file,note:null};
  if(blob.size>=file.size && sc===1) return {file,note:null};   /* iyileştirme yoksa dokunma */
  const uz = tip==='image/webp'?'webp':(tip==='image/png'?'png':'jpg');
  const yeni=new File([blob], String(file.name||'gorsel').replace(/\.[^.]+$/,'')+'.'+uz, {type:tip});
  return {file:yeni, note:`${w}×${h} → ${nw}×${nh} · ${_kb(file.size)} → ${_kb(blob.size)}`};
}

async function uploadFile(f,opt){
  const r=await optimizeImage(f,opt);
  const g=r.file;
  const ext=(g.name.split('.').pop()||'bin').toLowerCase();
  const path='u/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'.'+ext;
  const {error}=await sb.storage.from('media').upload(path,g,{upsert:false,contentType:g.type||undefined});
  if(error)throw error;
  if(r.note) toast('Görsel optimize edildi · '+r.note);
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/* kısa bilgi balonu */
let _toastT=null;
function toast(msg){
  let el=document.getElementById('toast');
  if(!el){ el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el); }
  el.textContent=msg; el.classList.add('on');
  clearTimeout(_toastT); _toastT=setTimeout(()=>el.classList.remove('on'),4000);
}
function pickUpload(accept, cb, opt){ const inp=document.createElement('input'); inp.type='file'; inp.accept=accept;
  inp.onchange=async()=>{ const f=inp.files[0]; if(!f)return;
    toast('Yükleniyor…');
    try{ const url=await uploadFile(f,opt); cb(url); }
    catch(e){ mpAlert('Yükleme hatası: '+(e.message||e),'Yükleme'); } };
  inp.click(); }

/* ================= BELGELER & EKLER (S6) =================================
   Fiziksel dosya: Supabase Storage `documents` bucket'i (PRIVATE).
   Halil'in `media` bucket'i ve `uploadFile()` AYNEN duruyor: o public site
   gorselleri icindir (anon okur/listeler). Sozlesme/teklif/saha kaniti oraya
   YAZILMAZ; ayni Storage altyapisinda ayri, kapali bir bucket kullanilir.

   DB yalniz metadata + baglam tasir (`documents`, `document_links`).
   Kalici kimlik = nesne yolu. Imzali URL GECICIDIR ve asla yazilmaz;
   her acilista (kisa bellek onbellegiyle) yeniden uretilir.

   Tek ek bileseni (`ekAlan`) composer, Yeni Is, Belge Ekle, operasyon ve
   kurum ekranlarinda ORTAK kullanilir - ekran basina yukleyici yok.
   ======================================================================== */
const BELGE_TUR=[['teklif','Teklif'],['sozlesme','Sözleşme'],['tasarim','Tasarım'],
  ['baski_dosyasi','Baskı Dosyası'],['montaj_fotografi','Montaj Fotoğrafı'],
  ['sokum_fotografi','Söküm Fotoğrafı'],['muhasebe','Fatura / Muhasebe'],
  ['katalog','Katalog / Fiyat Listesi'],['mecra_belgesi','Mecra Belgesi'],['diger','Diğer']];
const belgeTurLbl=v=>(BELGE_TUR.find(x=>x[0]===v)||[null,'Diğer'])[1];
/* S10 §3: kullanıcıya görünen BELGE KATEGORİSİ. Saklanan tür değişmez;
   kategori onları sade gruplara toplar. Dosya BİÇİMİ (PDF, JPG) kategori
   DEĞİLDİR — biçim ayrıca dosya simgesinde yazılır. */
const BELGE_KAT=[
  ['sozlesme','Sözleşme',['sozlesme']],
  ['teklif','Teklif',['teklif']],
  ['tasarim','Tasarım / baskı dosyası',['tasarim','baski_dosyasi']],
  ['foto','Uygulama fotoğrafı',['montaj_fotografi','sokum_fotografi']],
  ['fatura','Fatura / muhasebe',['muhasebe']],
  ['katalog','Katalog / fiyat listesi',['katalog']],
  ['diger','Diğer',['mecra_belgesi','diger']]];
const belgeKat=v=>BELGE_KAT.find(k=>k[2].includes(v))||BELGE_KAT[BELGE_KAT.length-1];
/* Sunucudaki `_belge_katla` ile AYNI katlama: İ/I/ı -> i, sonra küçük harf. */
const belgeKatla=t=>String(t||'').replace(/[İIı]/g,'i').toLowerCase();
/* 25 MB: proje Storage tavani 50 MiB (config.toml / FILE_SIZE_LIMIT).
   Bucket ayni siniri SUNUCUDA da uygular. Daha buyuk uretim dosyalari
   "Mevcut dosya baglantisi" olarak eklenir. */
const BELGE_MAX=25*1024*1024;
const BELGE_ADET=10;                       /* islem basina; RPC de 10'da keser */
const BELGE_URL_SN=600;                    /* imzali URL omru (sn) */
const BELGE_MIME={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',
  pdf:'application/pdf',doc:'application/msword',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv:'text/csv',txt:'text/plain'};
const BELGE_ACCEPT='image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';
/* `documents` altinda belgenin TUM baglantilari da gelir: "kurumda da var
   mi?" ve "son baglanti mi?" sorulari ek istek acmadan cevaplanir. */
const BELGE_SEL='document_links(id,document_id,created_by_team_id,documents(id,original_name,title,doc_type,mime_type,size_bytes,provider,storage_path,external_url,uploaded_by_team_id,created_at,note,document_links(id,job_id,entry_id,operation_id,customer_id,quote_id,contract_id,created_by_team_id)))';

const _belgeler=new Map();                 /* id -> doc (acma/menu icin) */
const _belgeUrl=new Map();                 /* yol|indir -> {url,son} */
function belgeKaydet(d){ if(d&&d.id) _belgeler.set(d.id,d); return d; }
const belgeAd=d=>(d&&(String(d.title||'').trim()||d.original_name))||'Belge';
const belgeResimMi=d=>!!d&&d.provider==='supabase'&&/^image\//.test(d.mime_type||'');
function belgeBoyut(n){ if(n==null)return''; if(n<1024)return n+' B';
  if(n<1048576)return Math.round(n/1024)+' KB'; return (n/1048576).toFixed(n<10485760?1:0)+' MB'; }
/* S11 §6: dosya BİÇİMİ simgesi (renk grubu). Biçim kategori değildir. */
function belgeTurSinif(d){ const e=(String((d&&d.original_name)||'').split('.').pop()||'').toLowerCase();
  return /^(xlsx?|csv)$/.test(e)?'t-xls':/^docx?$/.test(e)?'t-doc':e==='pdf'?'t-pdf':/^(jpe?g|png|webp)$/.test(e)?'t-img':e==='txt'?'t-txt':''; }
function belgeUzanti(d){
  if(d.provider==='external') return 'LİNK';
  const e=(String(d.original_name||'').split('.').pop()||'').toUpperCase();
  return e.length&&e.length<=4?e:'DOSYA';
}

/* Uzanti VE tarayici MIME birlikte degerlendirilir. Bu bir antivirus
   taramasi DEGILDIR; yalniz acikca desteklenmeyen turleri reddeder. Asil
   kapi bucket'in sunucu tarafi MIME listesidir. */
function belgeDogrula(f){
  const ext=(String(f.name||'').split('.').pop()||'').toLowerCase();
  const mime=BELGE_MIME[ext];
  if(!mime) return {hata:'Bu dosya türü desteklenmiyor (JPG, PNG, WEBP, PDF, Word, Excel, CSV, TXT).'};
  const t=String(f.type||'');
  const uyumlu=!t||t===mime||t==='application/octet-stream'
    ||(ext==='csv'&&/csv|excel|plain/.test(t));
  if(!uyumlu) return {hata:'Dosya uzantısı içeriğiyle uyuşmuyor.'};
  if(!f.size) return {hata:'Dosya boş.'};
  if(f.size>BELGE_MAX) return {hata:`Dosya ${belgeBoyut(f.size)} — sınır 25 MB. Büyük dosyayı “Bağlantı ekle” ile ekleyin.`,buyuk:true};
  return {mime};
}
/* Kalici nesne kimligi uretilir; Is/kurum adi ya da ham dosya adi
   kimlik OLMAZ. Orijinal ad metadata'da Turkce karakterleriyle kalir. */
function belgeYolUret(ad){
  const tr={'ı':'i','İ':'I','ş':'s','Ş':'S','ğ':'g','Ğ':'G','ç':'c','Ç':'C','ö':'o','Ö':'O','ü':'u','Ü':'U'};
  let s=String(ad||'dosya').replace(/[ıİşŞğĞçÇöÖüÜ]/g,c=>tr[c]).normalize('NFD').replace(/[̀-ͯ]/g,'');
  const nokta=s.lastIndexOf('.');
  const ext=nokta>0?s.slice(nokta+1).toLowerCase().replace(/[^a-z0-9]/g,''):'';
  let gov=(nokta>0?s.slice(0,nokta):s).replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^[-.]+|[-.]+$/g,'');
  gov=(gov||'dosya').slice(0,100);
  return crypto.randomUUID()+'/'+gov+(ext?'.'+ext:'');
}
async function belgeImzali(yol,indirAd){
  const k=yol+'|'+(indirAd||'');
  const c=_belgeUrl.get(k);
  if(c&&c.son>Date.now()+30000) return c.url;
  const {data,error}=await sb.storage.from('documents')
    .createSignedUrl(yol,BELGE_URL_SN,indirAd?{download:indirAd}:undefined);
  if(error) throw error;
  _belgeUrl.set(k,{url:data.signedUrl,son:Date.now()+BELGE_URL_SN*1000});
  return data.signedUrl;
}
/* Kucuk resimler: ekranda gorunen TUM eksik resimler icin TEK istek. */
let _belgeKucukT=null;
function belgeKucukPlanla(){ clearTimeout(_belgeKucukT); _belgeKucukT=setTimeout(()=>belgeKucukDoldur().catch(()=>{}),30); }
async function belgeKucukDoldur(){
  const imgs=[...document.querySelectorAll('img[data-belge-yol]:not([src])')];
  if(!imgs.length) return;
  const taze=y=>{ const c=_belgeUrl.get(y+'|'); return c&&c.son>Date.now()+30000; };
  const eksik=[...new Set(imgs.map(i=>i.dataset.belgeYol))].filter(y=>!taze(y));
  if(eksik.length){
    const {data,error}=await sb.storage.from('documents').createSignedUrls(eksik,BELGE_URL_SN);
    if(!error)(data||[]).forEach(r=>{ if(r&&r.signedUrl&&r.path)
      _belgeUrl.set(r.path+'|',{url:r.signedUrl,son:Date.now()+BELGE_URL_SN*1000}); });
  }
  imgs.forEach(i=>{ const c=_belgeUrl.get(i.dataset.belgeYol+'|');
    if(c) i.src=c.url; else { const b=i.closest('.bl-th'); if(b) b.classList.add('hata'); } });
}
(function(){ try{ new MutationObserver(belgeKucukPlanla)
  .observe(document.documentElement,{childList:true,subtree:true}); }catch(e){} })();

async function belgeAc(id,indir){
  const d=_belgeler.get(id); if(!d) return;
  if(d.provider==='external'){ window.open(d.external_url,'_blank','noopener'); return; }
  if(belgeResimMi(d)&&!indir){
    try{ belgeOnizle(d,await belgeImzali(d.storage_path)); }
    catch(e){ mpAlert('Dosya açılamadı: '+(e.message||e),'Belge'); }
    return;
  }
  /* Pencere SENKRON acilir; imzali URL gelince yonlendirilir. Aksi halde
     `await` sonrasi window.open acilir-pencere engelleyicisine takilir. */
  const w=window.open('','_blank');
  try{
    const url=await belgeImzali(d.storage_path,indir?d.original_name:null);
    if(w){ try{ w.opener=null; }catch(e){} w.location.href=url; } else location.assign(url);
  }catch(e){ if(w) w.close(); mpAlert('Dosya açılamadı: '+(e.message||e),'Belge'); }
}
/* Resim onizleme: modal() KULLANILMAZ - acik bir formun ustune acilabilmeli. */
function belgeOnizle(d,url){
  belgeOnizleKapat();
  const bg=document.createElement('div');
  bg.id='blLb'; bg.className='bl-lb'; bg.setAttribute('role','dialog'); bg.setAttribute('aria-modal','true');
  bg.setAttribute('aria-label',belgeAd(d));
  bg.innerHTML=`<div class="bl-lb-b">
      <div class="bl-lb-h"><b>${esc(belgeAd(d))}</b><span>${esc(belgeTurLbl(d.doc_type))}</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="belgeAc(${d.id},true)">İndir</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="belgeOnizleKapat()" aria-label="Kapat">✕</button></div>
      <img src="${esc(url)}" alt="${esc(belgeAd(d))}"></div>`;
  bg.addEventListener('mousedown',e=>{ if(e.target===bg) belgeOnizleKapat(); });
  document.addEventListener('keydown',belgeOnizleEsc,true);
  document.body.appendChild(bg);
  const k=bg.querySelector('.btn-ghost'); if(k) k.focus();
}
function belgeOnizleEsc(e){ if(e.key==='Escape'){ e.stopPropagation(); belgeOnizleKapat(); } }
function belgeOnizleKapat(){ const b=document.getElementById('blLb'); if(b) b.remove();
  document.removeEventListener('keydown',belgeOnizleEsc,true); }

/* ---- Kompakt ek seridi (guncelleme satiri, zaman cizelgesi, operasyon) --
   Akista galeri YOK: en fazla 4 kucuk resim + "+N", belgeler tek satir cip. */
function ekSeridi(links,opt){
  opt=opt||{};
  const docs=(links||[]).map(l=>l&&l.documents).filter(Boolean).map(belgeKaydet);
  if(!docs.length) return '';
  const res=docs.filter(belgeResimMi), dig=docs.filter(d=>!belgeResimMi(d));
  const max=opt.max||4;
  return `<div class="bl-strip">${res.slice(0,max).map(d=>
      `<button type="button" class="bl-th" onclick="event.stopPropagation();belgeAc(${d.id})"
         title="${esc(belgeAd(d))}" aria-label="${esc(belgeAd(d))} — önizle">
         <img data-belge-yol="${esc(d.storage_path)}" alt="" loading="lazy"></button>`).join('')}${
    res.length>max?`<span class="bl-more">+${res.length-max}</span>`:''}${
    dig.map(belgeCip).join('')}</div>`;
}
function belgeCip(d){
  const ext=d.provider==='external';
  return `<button type="button" class="bl-doc" onclick="event.stopPropagation();belgeAc(${d.id})"
      title="${esc(belgeAd(d))}${ext?' — harici bağlantı':''}">
      <span class="bl-ext ${ext?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span>
      <span class="bl-nm">${esc(belgeAd(d))}</span>${ext?'<span class="bl-dis" aria-hidden="true">↗</span>':''}</button>`;
}

/* ============ TEK EK BILESENI (S6 §27) ================================
   Durum ekranda degil burada yasar: modal yeniden cizilse de secilen
   dosyalar kaybolmaz. Ogeler:
     {k, tip:'dosya'|'link', file, ad, mime, boyut, tur, durum, yol, hata, url}
   durum: hazir -> yukleniyor -> yuklendi | hata
   `mevcut` = daha once kaydedilmis ekler (duzenleme), `kaldir` = kaldirilacak
   baglanti id'leri. */
const EK={};
let _ekSay=0;
function ekYeni(kid,opt){
  islemYeni('doc:'+kid);                          /* yeni form = yeni kayıt girişimi */
  EK[kid]={items:[],mevcut:(opt&&opt.mevcut)||[],kaldir:new Set(),
           turZorunlu:!!(opt&&opt.turZorunlu),varsayilan:(opt&&opt.varsayilan)||null,
           varsayilanResim:(opt&&opt.varsayilanResim)||null,
           tahmin:!!(opt&&opt.tahmin),degisti:(opt&&opt.degisti)||null};
  return EK[kid];
}
/* S10: dosya adından YALNIZ belirgin kategori önerilir (düzeltilebilir);
   belirsizse boş kalır ve kullanıcı seçer. Biçim (PDF) kategori değildir. */
function ekTurTahmin(ad){
  const t=belgeKatla(ad);
  if(/sozlesme|sözleşme|protokol|contract/.test(t)) return 'sozlesme';
  if(/teklif|offer|proposal/.test(t)) return 'teklif';
  if(/fatura|invoice|dekont|makbuz/.test(t)) return 'muhasebe';
  if(/katalog|fiyat|price|tarife/.test(t)) return 'katalog';
  if(/montaj|uygulama|kurulum/.test(t)) return 'montaj_fotografi';
  if(/sokum|söküm/.test(t)) return 'sokum_fotografi';
  if(/baski|baskı|print|prova/.test(t)) return 'baski_dosyasi';
  if(/tasarim|tasarım|design|gorsel|görsel|mockup/.test(t)) return 'tasarim';
  return '';
}
function ekAlan(kid,opt){
  if(!EK[kid]) ekYeni(kid,opt);
  return `<div class="ek" id="ek_${kid}">
    <div class="ek-bar">
      <label class="btn btn-outline btn-sm ek-sec">📎 Dosya ekle
        <input type="file" multiple accept="${BELGE_ACCEPT}" onchange="ekSec('${kid}',this)" hidden></label>
      <button type="button" class="btn btn-ghost btn-sm" onclick="ekLinkAc('${kid}')">🔗 Bağlantı ekle</button>
      <span class="fhint ek-hint">En fazla ${BELGE_ADET} dosya · dosya başına 25 MB</span>
    </div>
    <div class="ek-link" id="ekl_${kid}" hidden>
      <input class="inp inp-sm" id="eklu_${kid}" type="url" aria-label="Bağlantı adresi" placeholder="https://… (OneDrive, SharePoint, Drive)">
      <input class="inp inp-sm" id="ekla_${kid}" aria-label="Dosya adı" placeholder="Dosya adı (ör. Severnik sözleşme.pdf)">
      <button type="button" class="btn btn-outline btn-sm" onclick="ekLinkEkle('${kid}')">Ekle</button>
    </div>
    <div class="ek-list" id="ekv_${kid}">${ekListeHtml(kid)}</div></div>`;
}
function ekVarsayilanTur(e,resim,ad){
  if(e.tahmin){ const t=ekTurTahmin(ad); if(t) return t; }
  if(e.turZorunlu) return '';
  return (resim&&e.varsayilanResim)||e.varsayilan||'diger';
}
function ekTurSec(kid,it){
  const e=EK[kid];
  return `<select class="inp inp-sm ek-tur" aria-label="Belge türü" onchange="ekTurDegis('${kid}','${it.k}',this.value)">
    ${e.turZorunlu&&!it.tur?'<option value="">Tür seçin…</option>':''}
    ${BELGE_TUR.map(t=>`<option value="${t[0]}" ${it.tur===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select>`;
}
function ekListeHtml(kid){
  const e=EK[kid]; if(!e) return '';
  const mev=e.mevcut.map(m=>{ const d=belgeKaydet(m.doc); const sil=e.kaldir.has(m.link_id);
    return `<div class="ek-it ${sil?'sil':''}">
      <span class="bl-ext ${d.provider==='external'?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span>
      <button type="button" class="ek-ad btn-link" onclick="belgeAc(${d.id})">${esc(belgeAd(d))}</button>
      <span class="ek-m">${esc(belgeTurLbl(d.doc_type))}${sil?' · kaldırılacak':''}</span>
      ${m.kaldirilabilir===false?'':`<button type="button" class="ek-x" onclick="ekMevcutKaldir('${kid}',${m.link_id})"
        aria-label="${sil?'Geri al':'Kaldır'}">${sil?'Geri al':'✕'}</button>`}</div>`; }).join('');
  const yeni=e.items.map(it=>{
    const dur=it.durum==='yukleniyor'?'<span class="ek-d yuk">Yükleniyor…</span>'
      :it.durum==='yuklendi'?'<span class="ek-d ok">Yüklendi</span>'
      :it.durum==='hata'?`<span class="ek-d hata" role="alert">${esc(it.hata||'Hata')}</span>`:'';
    const tekrar=it.durum==='hata'&&!it.gecersiz;
    const uz=it.tip==='link'?'LİNK':((it.ad.split('.').pop()||'').toUpperCase().slice(0,4));
    return `<div class="ek-it ${it.durum==='hata'?'hata':''}">
      <span class="bl-ext ${it.tip==='link'?'dis':belgeTurSinif({original_name:it.ad})}">${esc(uz)}</span>
      <span class="ek-ad" title="${esc(it.ad)}">${esc(it.ad)}</span>
      <span class="ek-m">${it.tip==='link'?'harici bağlantı':esc(belgeBoyut(it.boyut))}</span>
      ${it.gecersiz?'':ekTurSec(kid,it)}
      ${dur}
      ${tekrar?`<button type="button" class="btn-link" onclick="ekTekrar('${kid}','${it.k}')">Tekrar dene</button>`:''}
      ${it.durum==='yukleniyor'?'':`<button type="button" class="ek-x" onclick="ekCikar('${kid}','${it.k}')" aria-label="Çıkar">✕</button>`}
    </div>`; }).join('');
  return mev+yeni;
}
function ekCiz(kid){ const el=document.getElementById('ekv_'+kid); if(el) el.innerHTML=ekListeHtml(kid);
  const e=EK[kid]; if(e&&e.degisti) try{ e.degisti(); }catch(x){ console.error(x); } }
function ekToplam(kid){ const e=EK[kid]; if(!e) return 0;
  return e.items.filter(i=>!i.gecersiz).length+e.mevcut.filter(m=>!e.kaldir.has(m.link_id)).length; }
function ekSec(kid,inp){
  const e=EK[kid]; if(!e) return;
  const dosyalar=[...(inp.files||[])]; inp.value='';
  let yer=BELGE_ADET-e.items.filter(i=>!i.gecersiz).length;
  let asan=0;
  dosyalar.forEach(f=>{
    if(yer<=0){ asan++; return; }
    const v=belgeDogrula(f);
    const it={k:'e'+(++_ekSay),tip:'dosya',file:f,ad:f.name,boyut:f.size,mime:v.mime||f.type,
              tur:ekVarsayilanTur(e,/^image\//.test(v.mime||''),f.name),durum:v.hata?'hata':'hazir',hata:v.hata||null,gecersiz:!!v.hata};
    e.items.push(it); if(!v.hata) yer--;
  });
  if(asan) toast(`En fazla ${BELGE_ADET} dosya eklenebilir; ${asan} dosya alınmadı.`);
  ekCiz(kid);
}
function ekLinkAc(kid){ const b=document.getElementById('ekl_'+kid); if(!b) return;
  b.hidden=!b.hidden; if(!b.hidden){ const u=document.getElementById('eklu_'+kid); if(u) u.focus(); } }
/* Yalniz https. javascript:, data:, file: vb. REDDEDILIR (DB CHECK ayrica). */
function ekLinkEkle(kid){
  const e=EK[kid]; if(!e) return;
  const url=(gv('eklu_'+kid)||'').trim();
  let u=null; try{ u=new URL(url); }catch(x){}
  if(!u||u.protocol!=='https:'||/\s/.test(url)){ mpAlert('Geçerli bir https:// bağlantısı girin.','Bağlantı'); return; }
  if(e.items.filter(i=>!i.gecersiz).length>=BELGE_ADET){ toast(`En fazla ${BELGE_ADET} belge.`); return; }
  let ad=(gv('ekla_'+kid)||'').trim();
  if(!ad){ try{ ad=decodeURIComponent(u.pathname.split('/').filter(Boolean).pop()||'')||u.hostname; }catch(x){ ad=u.hostname; } }
  e.items.push({k:'e'+(++_ekSay),tip:'link',url,ad:ad.slice(0,255),tur:ekVarsayilanTur(e,false,ad),durum:'hazir'});
  document.getElementById('eklu_'+kid).value=''; document.getElementById('ekla_'+kid).value='';
  ekCiz(kid);
}
function ekTurDegis(kid,k,v){ const it=(EK[kid]||{items:[]}).items.find(i=>i.k===k); if(it) it.tur=v;
  const e=EK[kid]; if(e&&e.degisti) try{ e.degisti(); }catch(x){} }
function ekMevcutKaldir(kid,linkId){ const e=EK[kid]; if(!e) return;
  if(e.kaldir.has(linkId)) e.kaldir.delete(linkId); else e.kaldir.add(linkId); ekCiz(kid); }
async function ekCikar(kid,k){
  const e=EK[kid]; if(!e) return;
  const it=e.items.find(i=>i.k===k); if(!it) return;
  e.items=e.items.filter(i=>i.k!==k);
  ekCiz(kid);
  if(it.yol&&!it.kaydedildi&&!it.belirsiz) await belgeNesneSil([it.yol]);   /* kaydedilmemis yukleme (S14: sonucu belirsiz olan SİLİNMEZ) */
}
function ekTekrar(kid,k){ const it=(EK[kid]||{items:[]}).items.find(i=>i.k===k);
  if(it){ it.durum='hazir'; it.hata=null; ekCiz(kid); } }

/* Kaydedilmemis nesneleri temizle. Basarisizsa yol KAYBOLMAZ: konsola ve
   kullaniciya yazilir (S6 §18 - kuyruk yok, gorunur hata). */
async function belgeNesneSil(yollar){
  yollar=(yollar||[]).filter(Boolean); if(!yollar.length) return true;
  try{ const {error}=await sb.storage.from('documents').remove(yollar); if(error) throw error; return true; }
  catch(err){ console.error('[belge] kaydedilmemis dosya temizlenemedi:',yollar,err);
    toast('Yüklenen dosya temizlenemedi: '+yollar.join(', ')); return false; }
}
/* Formdan cikarken henuz kaydedilmemis yuklemeler geri alinir. */
function ekBirak(kid){
  const e=EK[kid]; if(!e) return;
  delete EK[kid];
  /* S14: kaydı gecikmeli tamamlanabilecek (sonucu doğrulanamamış) dosya
     silinmez — silinirse geç gelen kayıt dosyasız belge üretirdi. Hiç
     kaydedilmediyse Belgeler'deki "yarım yükleme" temizliğinde görünür. */
  const yollar=e.items.filter(i=>i.yol&&!i.kaydedildi&&!i.belirsiz).map(i=>i.yol);
  if(yollar.length) belgeNesneSil(yollar);
}
function ekModalKapandi(){
  Object.keys(EK).forEach(kid=>{ if(!document.getElementById('ek_'+kid)) ekBirak(kid); });
}
function ekTurEksik(kid){ const e=EK[kid]; return !!e&&e.turZorunlu&&e.items.some(i=>!i.gecersiz&&!i.kaydedildi&&!i.tur); }
function ekBekleyen(kid){ const e=EK[kid]; return e?e.items.filter(i=>!i.gecersiz&&!i.kaydedildi):[]; }

/* Yukle: yalniz dosya ogeleri, en fazla 3 paralel. Hepsi basarili ise true. */
async function ekYukle(kid){
  const e=EK[kid]; if(!e) return true;
  const is=e.items.filter(i=>i.tip==='dosya'&&!i.gecersiz&&!i.kaydedildi&&!i.yol);
  const tek=async it=>{
    it.durum='yukleniyor'; it.hata=null; ekCiz(kid);
    /* S14: yol öğe başına BİR KEZ üretilir. Yükleme yanıtı kaybolup dosya
       depoya ulaşmışsa tekrar aynı yola gider; "zaten var" yanıtı bu
       girişimin kendi dosyasıdır (yol rastgele uuid taşır) → yüklendi sayılır. */
    const yol=it.planYol||(it.planYol=belgeYolUret(it.ad));
    try{
      const {error}=await sb.storage.from('documents').upload(yol,it.file,{upsert:false,contentType:it.mime});
      if(error&&!/already exists|duplicate|409/i.test(String(error.message||error.statusCode||error.error||''))) throw error;
      it.yol=yol; it.durum='yuklendi';
    }catch(err){
      it.durum='hata';
      const m=String((err&&err.message)||err);
      it.hata=/mime/i.test(m)?'Bu dosya türü kabul edilmedi.'
        :/size|large|exceed/i.test(m)?'Dosya çok büyük.':'Yüklenemedi.';
      console.error('[belge] yukleme hatasi',it.ad,err);
    }
    ekCiz(kid);
  };
  for(let i=0;i<is.length;i+=3) await Promise.all(is.slice(i,i+3).map(tek));
  return !ekBekleyen(kid).some(i=>i.tip==='dosya'&&!i.yol);
}
/* RPC govdesi. Kaydedilmemis tum gecerli ogeler; `links` cagirana ait. */
function ekGovde(kid,links){
  return ekBekleyen(kid).filter(i=>i.tip==='link'||i.yol).map(i=>({
    provider:i.tip==='link'?'external':'supabase',
    storage_path:i.tip==='link'?null:i.yol, external_url:i.tip==='link'?i.url:null,
    original_name:i.ad, doc_type:i.tur||'diger', mime_type:i.mime||null,
    size_bytes:i.boyut||null, title:i.baslik||null, note:i.not||null, links}));
}
/* DB adimi basarisiz olursa: yuklenen nesneler temizlenir, ogeler yeniden
   denemeye hazir birakilir. Yarim kalmis "basarili" belge olusmaz. */
async function ekGeriAl(kid,mesaj){
  const bek=ekBekleyen(kid);
  await belgeNesneSil(bek.filter(i=>i.yol).map(i=>i.yol));
  bek.forEach(i=>{ i.yol=null; if(i.tip==='dosya'||mesaj){ i.durum='hata'; i.hata=mesaj||'Kaydedilemedi.'; } });
  ekCiz(kid);
}
/* ===== S14 — güvenli yeniden deneme (işlem tekillik anahtarı) =============
   Bir oluşturma GİRİŞİMİ = bir anahtar. Form açılınca yeni anahtar; aynı
   formdan tekrar Kaydet aynı anahtarı gönderir ve sunucu ikinci kayıt ya da
   ikinci Hareket üretmez, ilk sonucu döndürür (migration 20261001100000).
   Yanıt alınamazsa sonuç "doğrulanamadı" olur — "başarısız" ya da
   "tamamlandı" DENMEZ. Form kapanır ya da sayfa yenilenirse bekleyen girişim
   oturum deposunda tutulur ve sonradan sorgulanır: en çok 10 girişim, 24 saat,
   form içeriği YOK (yalnız tür, anahtar, kısa etiket). */
function islemAnahtari(yer){ const m=(ui._islem=ui._islem||{}); return m[yer]||(m[yer]=crypto.randomUUID()); }
function islemYeni(yer){ if(ui._islem) delete ui._islem[yer]; }
function belirsizMi(e){ return !(e&&e.code)&&/Failed to fetch|NetworkError|network|Load failed|fetch failed/i.test(String((e&&e.message)||e||'')); }
const _BELIRSIZ='mp_belirsiz';
function belirsizOku(){ try{ const l=JSON.parse(sessionStorage.getItem(_BELIRSIZ)||'[]');
  return Array.isArray(l)?l.filter(x=>x&&x.anahtar&&Date.now()-x.at<864e5):[]; }catch(e){ return []; } }
function belirsizYaz(l){ try{ sessionStorage.setItem(_BELIRSIZ,JSON.stringify(l.slice(-10))); }catch(e){} }
function belirsizEkle(tur,anahtar,etiket){ belirsizYaz(belirsizOku().filter(x=>x.anahtar!==anahtar)
  .concat([{tur,anahtar,etiket:String(etiket||'').slice(0,60),at:Date.now()}])); }
function belirsizSil(anahtar){ belirsizYaz(belirsizOku().filter(x=>x.anahtar!==anahtar)); }
async function islemSonucu(tur,anahtar){
  const {data,error}=await sb.rpc('islem_sonucu',{p_tur:tur,p_anahtar:anahtar}); if(error) throw error; return data; }
/* fn(anahtar) isteği gönderir. Dönüş {durum:'tamam',sonuc} | {durum:'hata'} |
   {durum:'belirsiz'}. Hata ve belirsizlik iletileri burada gösterilir. */
async function islemCalistir(yer,tur,etiket,fn,baslik){
  const k=islemAnahtari(yer);
  try{ const s=await fn(k); islemYeni(yer); belirsizSil(k); return {durum:'tamam',sonuc:s}; }
  catch(e){
    if(e&&e.code==='PT409'){
      let onceki=null; try{ onceki=JSON.parse(e.hint); }catch(x){}
      belirsizSil(k); islemYeni(yer);
      const ac=await mpConfirm('Bu formun daha önceki bir gönderimi sunucuda kaydedilmiş; ondan sonra yaptığınız değişiklikler kaydedilmedi. Kaydedilen kaydı açabilir ya da formda kalıp Kaydet ile değişikliklerinizi AYRI yeni bir kayıt olarak oluşturabilirsiniz.',
        baslik||'Önceki gönderim kaydedilmiş',{danger:false,guvenli:true,ok:'Kaydedilen kaydı aç',no:'Formda kal'});
      return (ac&&onceki!=null)?{durum:'tamam',sonuc:onceki,onceki:true}:{durum:'hata',onceKayitli:true};
    }
    if(!belirsizMi(e)){ mpAlert(hataMetni(e),baslik||'Kaydedilemedi'); return {durum:'hata',hata:e}; }
    belirsizEkle(tur,k,etiket);
    return belirsizCoz(yer,tur,k,baslik);
  }
}
async function belirsizCoz(yer,tur,k,baslik){
  const kontrol=await mpConfirm('Sunucudan yanıt alınamadı; işlemin sonucu doğrulanamadı. Girdiğiniz bilgiler formda duruyor. “Sonucu kontrol et” ile kaydın oluşup oluşmadığına bakabilirsiniz. Kaydet ile yeniden göndermek de güvenlidir: işlem kaydedildiyse ikinci kez oluşturulmaz.',
    baslik||'Sonuç doğrulanamadı',{danger:false,ok:'Sonucu kontrol et',no:'Formda kal'});
  if(!kontrol) return {durum:'belirsiz'};
  let s; try{ s=await islemSonucu(tur,k); }
  catch(e){ mpAlert('Sunucuya hâlâ ulaşılamıyor; sonuç doğrulanamadı. Bağlantı gelince yeniden kontrol edin ya da Kaydet ile yeniden gönderin.',baslik||'Sonuç doğrulanamadı'); return {durum:'belirsiz'}; }
  if(s&&s.durum==='tamam'){ islemYeni(yer); belirsizSil(k); return {durum:'tamam',sonuc:s.sonuc}; }
  /* Kayıt yok: istek hâlâ yolda olabilir, bu yüzden "oluşturulmadı" diye
     kesin konuşulmaz ve dosyalar silinmez; aynı anahtarla tekrar güvenlidir. */
  mpAlert('Sunucuda bu işleme ait kayıt bulunamadı. Kaydet ile yeniden gönderebilirsiniz; işlem gecikmeli tamamlanmış olsa bile ikinci kayıt oluşmaz.',baslik||'Kayıt bulunamadı');
  return {durum:'belirsiz'};
}
/* Form kapandıktan ya da sayfa yenilendikten sonra: bekleyen girişimlerin
   sonucu sorgulanır, kullanıcıya bildirilir. Ulaşılamayan girişim bekler. */
let _belirsizSorguda=false;
async function belirsizKontrol(){
  if(_belirsizSorguda||!ui._me) return; const l=belirsizOku(); if(!l.length) return;
  _belirsizSorguda=true;
  try{ for(const x of l){
    let s; try{ s=await islemSonucu(x.tur,x.anahtar); }catch(e){ continue; }
    /* Yeni girişim için "kayıt yok" kesin değildir (istek yolda olabilir). */
    if(!(s&&s.durum==='tamam')&&Date.now()-x.at<60000) continue;
    belirsizSil(x.anahtar);
    if(s&&s.durum==='tamam'){
      if(x.tur==='job_create'&&s.sonuc){ if(await mpConfirm('Sonucu doğrulanamayan işlem sunucuda kaydedilmiş: '+x.etiket+'.','Önceki işlem kaydedilmiş',{danger:false,ok:'Kaydı aç',no:'Kapat'})) workAc(+s.sonuc); }
      else toast('Sonucu doğrulanamayan işlem kaydedilmiş: '+x.etiket);
    } else toast('Sonucu doğrulanamayan işlemin kaydı bulunamadı: '+x.etiket+' — gerekiyorsa yeniden oluşturun.');
  } } finally{ _belirsizSorguda=false; }
}

async function ekGonder(kid,links){
  const e=EK[kid]; if(!e||!ekBekleyen(kid).length) return {ok:true,sayi:0};
  if(!await ekYukle(kid)) return {ok:false,hata:'bazı dosyalar yüklenemedi'};
  const govde=ekGovde(kid,links);
  /* S14: kayıt adımı tekillik anahtarıyla. Yanıt kaybolursa yüklenen dosyalar
     SİLİNMEZ ve yolları korunur: tekrar aynı yollarla, aynı anahtarla gider;
     kayıt oluşmuşsa aynı belgeler döner (ikinci dosya ya da belge yok). Yalnız
     sunucu kesin olarak reddettiyse (işlem geri alındı) yüklemeler temizlenir. */
  const r=await islemCalistir('doc:'+kid,'document_create','Belge: '+(govde[0]&&(govde[0].title||govde[0].original_name)||''),
    k=>api('document_create',{docs:govde,islem:k}),'Belge kaydedilemedi');
  /* Kesin red → işlem geri alındı, yüklemeler temizlenir. Önceki gönderim
     kayıtlıysa (409) dosyalar o kayda ait olabilir: silinmez. */
  if(r.durum==='hata'&&!r.onceKayitli){ await ekGeriAl(kid,'Kaydedilemedi.'); return {ok:false,hata:'kayıt oluşturulamadı',sessiz:true}; }
  if(r.durum==='hata'){ ekBekleyen(kid).forEach(i=>{ i.belirsiz=true; }); return {ok:false,hata:'önceki gönderim kayıtlı',sessiz:true}; }
  if(r.durum==='belirsiz'){ ekBekleyen(kid).forEach(i=>{ i.durum='hata'; i.belirsiz=true; i.hata='Sonuç doğrulanamadı — tekrar denemek güvenli.'; }); ekCiz(kid);
    return {ok:false,hata:'sonuç doğrulanamadı',belirsiz:true,sessiz:true}; }
  const sonuc=r.sonuc;
  ekBekleyen(kid).forEach(i=>{ i.kaydedildi=true; i.durum='yuklendi'; });
  ekCiz(kid);
  return {ok:true,sayi:govde.length,ids:Array.isArray(sonuc)?sonuc:[]};
}
/* Baglanti kaldir. Dosya SILINMEZ (S10): son baglanti da kalkarsa belge
   Hafiza > Belgeler'de "İlişkilendirilmemiş" olarak durur. */
async function belgeBagKaldir(linkIds){
  linkIds=(linkIds||[]).filter(Boolean); if(!linkIds.length) return {ok:true,docIds:[]};
  return api('document_links_remove',{ids:linkIds});
}
/* Kayit sonrasi dogru ekrani tazele: Work/Kurum detayindaysak orada kal. */
function ekranTazele(){
  const st=(history.state&&history.state.mp)?history.state:null;
  if(st&&st.v==='work'&&st.id) return workAc(st.id);
  if(st&&st.v==='org'&&st.id) return orgAc(st.id);
  if(st&&st.v==='person'&&st.id&&typeof personAc==='function') return personAc(st.id);
  return renderSection();
}



/* ==========================================================
   YEDEKLEME  (Supabase ücretsiz planda otomatik yedek yok)
   Tüm tablolar tek JSON dosyasına indirilir; aynı dosyadan
   geri yüklenebilir.
   ========================================================== */
const YEDEK_TABLO=['settings','pages','products','mecralar','alt_mecralar','units',
  'customers','contacts','suppliers','jobs','work_parties','entries','work_operations','bookings','notes','team','quotes','quote_items',
  'media_placements'];
/* geri yükleme sırası: bağımlı tablolar sonra gelmeli
   (contacts -> customers'a bağlı olduğu için ondan sonra gelir) */
const YEDEK_SIRA=['settings','pages','products','customers','contacts','suppliers','team',
  'mecralar','alt_mecralar','units','jobs','work_parties','work_operations','notes','quotes','quote_items',
  /* S8: bookings.superseded_by_placement_id ve entries.media_placement_id
     -> media_placements: once yerlesim, sonra onlara isaret edenler
     (entries ayrica work_operation_id tasir, o yuzden en sonda). */
  'media_placements','bookings','entries'];

async function yedekAl(){
  const btn=document.getElementById('bkBtn'); if(btn){btn.disabled=true;btn.textContent='Hazırlanıyor…';}
  const out={_bilgi:{olusturma:new Date().toISOString(),kullanici:ui._email||'',surum:1},_tablolar:{}};
  let toplam=0, hata=[];
  for(const t of YEDEK_TABLO){
    try{ const {data,error}=await sb.from(t).select('*'); if(error)throw error;
      out._tablolar[t]=data||[]; toplam+=(data||[]).length; }
    catch(e){ hata.push(t); out._tablolar[t]=[]; }
  }
  const gorseller=[];
  JSON.stringify(out).replace(/https?:\/\/[^"\\ ]+\/storage\/v1\/object\/public\/[^"\\ ]+/g,u=>{gorseller.push(u);return u;});
  out._gorseller=[...new Set(gorseller)];
  const blob=new Blob([JSON.stringify(out,null,1)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`medyapark-yedek-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  if(btn){btn.disabled=false;btn.innerHTML=ic('download',15)+' Yedek Al (JSON)';}
  const bilgi=document.getElementById('bkInfo');
  if(bilgi) bilgi.innerHTML=`<div class="imp-info">Yedek indirildi · ${toplam} kayıt · ${out._gorseller.length} görsel bağlantısı`
    +(hata.length?` · <b>okunamayan tablo: ${hata.join(', ')}</b>`:'')+`</div>`;
}

function yedekYukleAc(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange=async()=>{ const f=inp.files[0]; if(!f)return;
    let veri; try{ veri=JSON.parse(await f.text()); }catch(e){ mpAlert('Dosya okunamadı, geçerli bir yedek dosyası seçin.','Geri Yükleme'); return; }
    if(!veri._tablolar){ mpAlert('Bu dosya bir Medyapark yedeği değil.','Geri Yükleme'); return; }
    const say=Object.entries(veri._tablolar).map(([k,v])=>`${k}: ${v.length}`).join(' · ');
    modal(`<h3 style="margin:0 0 10px">Yedekten Geri Yükle</h3>
      <div class="imp-warn">Bu işlem yedekteki kayıtları veritabanına yazar. Aynı numaralı kayıtların üzerine yazılır.
        Yedek alındıktan SONRA eklenmiş kayıtlar silinmez, oldukları gibi kalır.</div>
      <p class="muted" style="font-size:12.5px">Yedek tarihi: <b>${esc(String((veri._bilgi||{}).olusturma||'').slice(0,16).replace('T',' '))}</b></p>
      <div class="imp-info" style="max-height:120px;overflow:auto">${esc(say)}</div>
      <p style="font-size:13px;margin:12px 0 6px">Devam etmek için aşağıya <b>GERI YUKLE</b> yazın:</p>
      <input class="inp" id="bkOnay" placeholder="GERI YUKLE" autocomplete="off">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
        <button class="btn btn-danger btn-sm" onclick="yedekGeriYukle()">Geri Yükle</button></div>`);
    window.__yedek=veri;
  };
  inp.click();
}
async function yedekGeriYukle(){
  if((gv('bkOnay')||'').trim().toLocaleUpperCase('tr')!=='GERI YUKLE'){ mpAlert('Onay metnini tam yazın: GERI YUKLE','Geri Yükleme'); return; }
  const veri=window.__yedek; if(!veri)return;
  const bilgi=document.getElementById('bkOnay').parentElement;
  bilgi.innerHTML='<p class="muted">Geri yükleniyor… Bu pencereyi kapatmayın.</p>';
  let ok=0, hata=[];
  for(const t of YEDEK_SIRA){
    const rows=veri._tablolar[t]; if(!rows||!rows.length)continue;
    try{
      for(let i=0;i<rows.length;i+=200){
        const {error}=await sb.from(t).upsert(rows.slice(i,i+200),{onConflict:t==='settings'?'k':'id'});
        if(error)throw error;
      }
      ok+=rows.length;
    }catch(e){ hata.push(t+' ('+(e.message||e).slice(0,40)+')'); }
  }
  closeModal();
  mpAlert(`Geri yükleme bitti.\n${ok} kayıt yazıldı.`+(hata.length?`\n\nSorun çıkan tablolar:\n`+hata.join('\n'):''));
  renderSection();
}

/* ==========================================================
   İŞLEM KAYITLARI
   Kaydetme/silme işlemleri arka planda loglanır; hata olursa
   asıl işlemi etkilemez (sessizce geçilir).
   ========================================================== */
const LOG_AD={
  product_save:['Ürün','kaydetti'], product_delete:['Ürün','sildi'],
  mecra_save:['Mecra','kaydetti'], mecra_delete:['Mecra','sildi'],
  alt_save:['Alt mecra','kaydetti'], alt_delete:['Alt mecra','sildi'],
  unit_save:['Pozisyon','kaydetti'], unit_delete:['Pozisyon','sildi'],
  customer_save:['Müşteri','kaydetti'], customer_delete:['Müşteri','sildi'],
  contact_save:['Kişi','kaydetti'], contact_delete:['Kişi','sildi'],
  affiliation_save:['Kurum bağlantısı','kaydetti'], affiliation_delete:['Kurum bağlantısı','sildi'],
  entry_save:['Güncelleme','ekledi'], entry_delete:['Güncelleme','sildi'],
  work_follow:['İş','takibe aldı'], work_unfollow:['İş','takibi bıraktı'],
  operation_save:['Baskı/Montaj','kaydetti'], operation_delete:['Baskı/Montaj','sildi'],
  job_lifecycle:['İş','durumunu değiştirdi'],
  work_party_save:['İş tarafı','kaydetti'], work_party_delete:['İş tarafı','sildi'],
  supplier_save:['Tedarikçi','kaydetti'], supplier_delete:['Tedarikçi','sildi'],
  quote_builder_save:['Teklif','hazırladı'],
  job_save:['İş','kaydetti'], job_move:['İş','aşama değiştirdi'], job_delete:['İş','sildi'],
  note_save:['Not','kaydetti'], note_delete:['Not','sildi'],
  team_save:['Ekip üyesi','kaydetti'], team_delete:['Ekip üyesi','sildi'],
  page_save:['Sayfa','kaydetti'], page_delete:['Sayfa','sildi'],
  quote_status:['Teklif','durumunu değiştirdi'], quote_delete:['Teklif','sildi'],
  legacy_booking_upsert:['Eski doluluk kaydı','aktardı'],
  media_create:['Mecra kaydı','oluşturdu'], media_update:['Mecra kaydı','güncelledi'],
  settings_save:['Ayarlar','güncelledi'],
  password_change:['Şifre','değiştirdi']
};
/* Sistem tarafından bilinen olay ayrıca kullanıcıya yazdırılmaz; system
   Entry olarak timeline'a düşer (BR-E03, 08 §8). Başarısızlığı ana işlemi
   bozmaz fakat sessizce yutulmaz — konsola raporlanır. */
/* S4.4 — `sysEntry()` KALDIRILDI.
   Tarayicida oturum sahibi olarak calisiyordu; RLS gercek bir faz
   degisikligini, elle yazilmis sahte bir "Aşama değişti" satirindan
   ayiramiyordu, yani `source='system'` GUVENILMEZDI. Sistem hareketleri
   artik gercek mutasyonun kendisinden, veritabani tetikleyicileriyle
   uretilir (20260917120000_ps44_trusted_system_activity.sql):
     jobs            -> work_created / work_phase / work_lifecycle /
                        work_contract / work_accounting
     work_operations -> operation_created / operation_status
     quotes          -> quote_revised
   Istemciden gelen `source='system'` INSERT'u RLS ile reddedilir. */
function logYaz(act, body, q){
  const m=LOG_AD[act]; if(!m)return;
  let detay='';
  try{
    if(act==='legacy_booking_upsert') detay=`${body.ym} · ${body.status}`;
    else if(act==='media_create') detay=`${(body.targets||[]).length} hedef · ${(body.common||{}).start_date||''}`;
    else if(act==='media_update') detay=`#${body.id}`;
    else if(act==='settings_save') detay=Object.keys(body||{}).join(', ').slice(0,120);
    else if(act==='job_move') detay=body.status||'';
    else if(body) detay=(body.name||body.firma||body.title||body.konu||body.slug||'').toString().slice(0,90);
  }catch(e){}
  const row={kullanici:(ui._me&&ui._me.name)||ui._email||'—', islem:m[1], bolum:m[0],
    kayit_id:String((body&&body.id)||(q&&q.id)||''), detay};
  sb.from('activity_log').insert(row).then(()=>{},()=>{});   /* sessiz */
}

/* ---- Veri katmanı köprüsü: eski api(action,body) -> Supabase ---- */
const DELMAP={product_delete:'products',mecra_delete:'mecralar',alt_delete:'alt_mecralar',unit_delete:'units',customer_delete:'customers',contact_delete:'contacts',team_delete:'team',note_delete:'notes',quote_delete:'quotes',job_delete:'jobs',entry_delete:'entries',work_party_delete:'work_parties',operation_delete:'work_operations'};
/* ---- Tema uyumlu diyaloglar (tarayıcı alert/confirm yerine) ---- */
/* S13 — onay penceresi erişilebilirliği:
   · başlık/ileti aria ile bağlı;
   · YIKICI ya da veri kaybettiren onaylarda (danger / o.guvenli) odak
     GÜVENLİ düğmededir — önceden Esc+Enter kaydedilmemiş formu silip
     atabiliyordu;
   · Enter artık odaktaki düğmeyi çalıştırır (her zaman "Tamam" değil);
   · kapanınca odak açıldığı yere döner. */
function mpDlg(o){ return new Promise(res=>{
  const eski=document.getElementById('mpDlgBg'); if(eski)eski.remove();
  const onceki=document.activeElement;
  const bg=document.createElement('div'); bg.id='mpDlgBg'; bg.className='mpdlg-bg';
  const dg=!!o.danger;
  bg.innerHTML=`<div class="mpdlg" role="${o.tek?'alertdialog':'dialog'}" aria-modal="true" aria-labelledby="mpDlgT" aria-describedby="mpDlgM">
    <div class="mpdlg-ic ${dg?'dg':''}">${dg
      ?'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4m0 4h.01"/><path d="M10.3 3.6 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/></svg>'
      :'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>'}</div>
    <div class="mpdlg-t" id="mpDlgT">${esc(o.baslik||'Onay')}</div>
    <div class="mpdlg-m" id="mpDlgM">${esc(o.msg||'')}</div>
    <div class="mpdlg-b">
      ${o.tek?'':`<button class="btn btn-ghost" id="mpDlgNo">${esc(o.noText||'Vazgeç')}</button>`}
      <button class="btn ${dg?'btn-danger':'btn-primary'}" id="mpDlgOk">${esc(o.okText||'Tamam')}</button>
    </div></div>`;
  document.body.appendChild(bg);
  requestAnimationFrame(()=>bg.classList.add('on'));
  const kapat=v=>{ bg.classList.remove('on'); document.removeEventListener('keydown',tus);
    setTimeout(()=>bg.remove(),140);
    if(onceki&&document.body.contains(onceki)){ try{ onceki.focus(); }catch(e){} }
    res(v); };
  const tus=e=>{ if(e.key==='Escape'){ e.preventDefault(); kapat(!o.tek?false:true); } };
  document.addEventListener('keydown',tus);
  bg.addEventListener('mousedown',e=>{ if(e.target===bg && !o.tek)kapat(false); });
  const no=bg.querySelector('#mpDlgNo'); if(no)no.onclick=()=>kapat(false);
  const okB=bg.querySelector('#mpDlgOk'); okB.onclick=()=>kapat(true);
  ((no&&(dg||o.guvenli))?no:okB).focus();
});}
function mpAlert(msg,baslik){ return mpDlg({msg,baslik:baslik||'Bilgi',tek:true}); }
/* Tek satirlik metin sorar. Tarayicinin prompt()'u KULLANILMAZ: panel
   temasinin disinda kalir ve bazi tarayicilarda engellenir. Ayni
   mpdlg iskeletini kullanir (PS1.1 §24 satir ici kurum/kisi ekleme). */
function mpPrompt(msg,baslik,varsayilan){ return new Promise(res=>{
  const eski=document.getElementById('mpDlgBg'); if(eski)eski.remove();
  const bg=document.createElement('div'); bg.id='mpDlgBg'; bg.className='mpdlg-bg';
  bg.innerHTML=`<div class="mpdlg" role="dialog" aria-modal="true">
    <div class="mpdlg-t">${esc(baslik||'Yeni kayıt')}</div>
    <div class="mpdlg-m"><label class="flabel" for="mpPromptI">${esc(msg||'')}</label>
      <input class="inp" id="mpPromptI" value="${esc(varsayilan||'')}" autocomplete="off"></div>
    <div class="mpdlg-b">
      <button class="btn btn-ghost" id="mpDlgNo">Vazgeç</button>
      <button class="btn btn-primary" id="mpDlgOk">Ekle</button>
    </div></div>`;
  document.body.appendChild(bg);
  requestAnimationFrame(()=>bg.classList.add('on'));
  const inp=bg.querySelector('#mpPromptI');
  const kapat=v=>{ bg.classList.remove('on'); document.removeEventListener('keydown',tus);
    setTimeout(()=>bg.remove(),140); res(v); };
  const tus=e=>{ if(e.key==='Escape')kapat(null);
    if(e.key==='Enter'){ e.preventDefault(); kapat(inp.value); } };
  document.addEventListener('keydown',tus);
  bg.addEventListener('mousedown',e=>{ if(e.target===bg)kapat(null); });
  bg.querySelector('#mpDlgNo').onclick=()=>kapat(null);
  bg.querySelector('#mpDlgOk').onclick=()=>kapat(inp.value);
  inp.focus(); inp.select();
});}
function mpConfirm(msg,baslik,opt){ opt=opt||{};
  const dg=opt.danger!==undefined?opt.danger:/sil|kald(ı|i)r/i.test(String(msg));
  return mpDlg({msg,baslik:baslik||(dg?'Emin misiniz?':'Onay'),danger:dg,guvenli:!!opt.guvenli,
    okText:opt.ok||(dg?'Evet, Sil':'Evet'),noText:opt.no||'Vazgeç'}); }

/* Form kaydetmelerini saran ortak yardimci: hata olursa artik sessizce
   yutulmuyor, kullaniciya gosteriliyor. */
async function guard(fn, hataBasligi){
  try{ return await fn(); }
  catch(e){
    const msg=hataMetni(e)||(e&&(e.hint||e.details))||String(e);
    console.error(hataBasligi||'Islem hatasi:', e);
    mpAlert(msg,(hataBasligi||'İşlem başarısız'));
    return null;
  }
}
async function saveRow(table, body){ const id=body.id; const row={...body}; delete row.id;
  if(id){ const {error}=await sb.from(table).update(row).eq('id',id); if(error)throw error; return {id}; }
  const {data,error}=await sb.from(table).insert(row).select('id').single(); if(error)throw error; return {id:data.id}; }

async function api(action, body){
  const parts=action.split('&'); const act=parts[0]; const q={};
  parts.slice(1).forEach(kv=>{ const i=kv.indexOf('='); if(i>=0)q[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1)); });
  const ok=(d)=>d;

  /* S10: belge taşıyabilen bir kayıt silinince FK cascade yalnız BAĞLANTIYI
     düşürür; belge dosyasıyla birlikte kalır (başka bağlamı yoksa Hafıza >
     Belgeler'de "İlişkilendirilmemiş"). S6'daki otomatik dosya temizliği
     KALDIRILDI: bağlantıyı kaldırmak dosyayı silmek değildir. RLS 0 satır
     döndürürse bu sessiz başarı değil, açık hatadır. */
  if(act==='entry_delete'||act==='operation_delete'||act==='job_delete'||act==='contract_delete'){
    const delId=(q.id!=null&&q.id!=='')?q.id:(body&&body.id);
    if(delId==null||delId==='') throw new Error('Silinecek kayıt belirtilmedi.');
    const {data:sil,error}=await sb.from(act==='contract_delete'?'contracts':DELMAP[act]).delete().eq('id',delId).select('id');
    if(error)throw error;
    if(!sil||!sil.length) throw new Error('Bu kaydı silme yetkiniz yok.');
    logYaz(act,body,q); return ok();
  }
  if(act.endsWith('_delete') && DELMAP[act]){
    const delId=(q.id!=null&&q.id!=='')?q.id:(body&&body.id);
    if(delId==null||delId==='') throw new Error('Silinecek kayıt belirtilmedi.');
    const {error}=await sb.from(DELMAP[act]).delete().eq('id',delId); if(error)throw error; logYaz(act,body,q); return ok(); }

  switch(act){
    case 'dashboard_stats':{
      const y=new Date().getFullYear();
      const d7=new Date(Date.now()-7*864e5).toISOString();
      /* kayan 12 ay: bu aydan başlar, ay geçtikçe kendiliğinden ilerler */
      const _n=new Date(); const roll=[];
      for(let i=0;i<12;i++){ const dd=new Date(_n.getFullYear(),_n.getMonth()+i,1);
        roll.push(dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')); }
      const [un,mc,al,jb,qs,bk,rq,nt,tm,cu,ct]=await Promise.all([
        sb.from('units').select('id,mecra_id'),
        sb.from('mecralar').select('id,name,theme_color').order('sort'),
        sb.from('alt_mecralar').select('id'),
        sb.from('jobs').select('id,title,status,lifecycle_status,start_day,end_day,created_at,mecra_id,customer_id'),
        sb.from('quotes').select('id,status,created_at'),
        /* S8: aylık doluluk trendi artık kesin yerleşimleri de içeren
           TEK aylık projeksiyondan okunur (ham `bookings` yerleşimleri
           görmezdi). LED eşzamanlı olduğundan bu projeksiyonda yoktur. */
        sb.from('booking_availability_public').select('unit_id,ym,status').gte('ym',roll[0]).lte('ym',roll[11]),
        sb.from('quotes').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('notes').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('team').select('id,name,role,photo,eposta'),
        sb.from('customers').select('id,firma'),
        /* Gerçek kişi yalnız contacts'tan gelir (S02_001). */
        sb.from('contacts').select('customer_id,name,is_primary').eq('active',true)
      ]);
      const units=(un.data||[]), mecras=(mc.data||[]), alts=(al.data||[]);
      const jobs=(jb.data||[]), quotes=(qs.data||[]), bks=(bk.data||[]);
      const AYK=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
      const aylik=roll.map(ym=>({ym,label:AYK[(+ym.slice(5,7))-1],yil:ym.slice(0,4),dolu:0,rezerve:0}));
      const rIdx={}; roll.forEach((ym,i)=>rIdx[ym]=i);
      bks.forEach(b=>{ const i=rIdx[b.ym]; if(i==null)return;
        if(b.status==='dolu')aylik[i].dolu++; else if(b.status==='rezerve')aylik[i].rezerve++; });
      const kapasite=units.length, slot=Math.max(1,kapasite*12);
      const toplamDolu=bks.filter(b=>b.status==='dolu').length;
      const toplamRez=bks.filter(b=>b.status==='rezerve').length;
      const uByMec={}; units.forEach(u=>{ uByMec[u.mecra_id]=(uByMec[u.mecra_id]||0)+1; });
      const mecraDagilim=mecras.map(m=>({name:m.name,color:m.theme_color||'#4f6bed',adet:uByMec[m.id]||0}))
                               .sort((a,b)=>b.adet-a.adet).slice(0,6);
      const say=arr=>arr.reduce((o,x)=>{const v=x.status||'yeni';o[v]=(o[v]||0)+1;return o;},{});
      const jeni={}; jobs.filter(j=>j.created_at&&j.created_at>d7).forEach(j=>{const k=j.status||'temas_takip';jeni[k]=(jeni[k]||0)+1;});
      const ay30=new Date(Date.now()-30*864e5).toISOString();
      return ok({
        units:units.length, mecra:mecras.length, alts:alts.length,
        doluluk:Math.round(toplamDolu*100/slot), toplamDolu, toplamRez,
        bosSlot:Math.max(0,slot-toplamDolu-toplamRez), slot, aylik, mecraDagilim,
        quoteStat:say(quotes), jobStat:say(jobs), jobYeni:jeni,
        activeJobs:jobs.filter(j=>(j.lifecycle_status||'acik')!=='kapandi').length,
        newQuotes:quotes.filter(q=>(q.status||'yeni')==='yeni').length,
        son30Teklif:quotes.filter(q=>q.created_at&&q.created_at>ay30).length,
        yil:y, rollBas:roll[0], rollSon:roll[11], recentQuotes:rq.data||[], notes:nt.data||[], team:tm.data||[],
        takvim:jobs.filter(j=>j.start_day).map(j=>({d:j.start_day,t:j.title,s:j.status})),
        /* Faz başına GERÇEK açık iş sayısı. jobList yalnız kart örneğidir;
           sayım ondan türetilemez (aksi halde ilk faz tüm kotayı yer ve
           diğer fazlar sıfır görünür — gerçek hacimle ortaya çıkan hata). */
        jobFaz:(()=>{ const o={};
          jobs.filter(j=>(j.lifecycle_status||'acik')!=='kapandi')
              .forEach(j=>{ const k=j.status||'temas_takip'; o[k]=(o[k]||0)+1; });
          return o; })(),
        jobList:(()=>{ const cm={}; (cu.data||[]).forEach(x=>cm[x.id]=x);
          const km={}; (ct.data||[]).forEach(k=>{ if(!km[k.customer_id]||k.is_primary) km[k.customer_id]=k.name; });
          const mm={}; mecras.forEach(x=>mm[x.id]=x.name);
          const sira={temas_takip:0,teklif:1,baski:2,montaj:3,yayinda_aktif:4};
          /* Her fazdan en çok 3 örnek: kart faz başına 3 kart gösteriyor. */
          const kota={};
          return jobs.filter(j=>(j.lifecycle_status||'acik')!=='kapandi')
            .sort((a,b)=>(sira[a.status]??9)-(sira[b.status]??9)||a.id-b.id)
            .filter(j=>{ const k=j.status||'temas_takip';
              kota[k]=(kota[k]||0)+1; return kota[k]<=3; })
            .map(j=>{ const c=cm[j.customer_id]||{};
              return {id:j.id,title:j.title,status:j.status,start:j.start_day,end:j.end_day,
                      assignee_id:j.assignee_id||null,
                      firma:c.firma||mm[j.mecra_id]||'—',kisi:km[j.customer_id]||'',mecra:mm[j.mecra_id]||''}; }); })()
      });
    }
    case 'jobs_list':{ const {data,error}=await sb.from('jobs').select('*').order('sort').order('id'); if(error)throw error; return ok(data); }
    /* S11 §5 — koşullu güncelleme (iyimser eşzamanlılık). Yalnız DEĞİŞEN
       alanlar yazılır ve satır, form açıldığındaki eski değerleri hâlâ
       taşıyorsa güncellenir. Başka biri arada aynı alanı değiştirdiyse 0
       satır döner: sessizce EZİLMEZ, çakışma olarak bildirilir. */
    case 'row_update_cas':{
      const tablo=({jobs:'jobs',documents:'documents',operation_price_groups:'operation_price_groups',customers:'customers',
        suppliers:'suppliers',products:'products',pages:'pages',notes:'notes',team:'team'})[body.tablo]; if(!tablo) throw new Error('Geçersiz tablo.');
      const anahtar=(tablo==='pages'&&body.anahtar==='slug')?'slug':'id';
      let s=sb.from(tablo).update(body.patch).eq(anahtar,body.id);
      /* jsonb değer JSON metni olarak karşılaştırılır (sunucuda anlamsal eşitlik). */
      Object.entries(body.eski||{}).forEach(([k,v])=>{ s=(v===null||v===undefined)?s.is(k,null):s.eq(k,(typeof v==='object')?JSON.stringify(v):v); });
      const {data,error}=await s.select('*'); if(error)throw error;
      if(!data||!data.length){
        const {data:g}=await sb.from(tablo).select('*').eq(anahtar,body.id).maybeSingle();
        if(!g) throw Object.assign(new Error('Kayıt bulunamadı ya da değiştirme yetkiniz yok.'),{kod:'yok'});
        const esit=(a,b)=>_degNorm(a)===_degNorm(b);
        const deg=Object.keys(body.eski||{}).filter(k=>!esit(g[k],body.eski[k]));
        if(!deg.length) throw Object.assign(new Error('Bu kaydı değiştirme yetkiniz yok.'),{kod:'yetki'});
        /* Sürüm damgasıyla korunan formda hangi alanın değiştiğini söyle. */
        const alanlar=body.ilk?Object.keys(body.ilk).filter(k=>!esit(g[k],body.ilk[k])):deg;
        throw Object.assign(new Error('cakisma'),{kod:'cakisma',alanlar:alanlar.length?alanlar:deg,guncel:g});
      }
      logYaz(({jobs:'job_save',documents:'document_update',customers:'customer_save',suppliers:'supplier_save',
        products:'product_save',pages:'page_save',notes:'note_save',team:'team_save'})[tablo]||'operation_save',{id:body.id,...body.patch}); return ok(data[0]); }
    case 'job_create':{
      const {data,error}=await sb.rpc('job_create',{p_job:body.job,p_followers:body.followers||[],p_islem:body.islem||null});
      if(error)throw error; logYaz('job_save',{id:data,...body.job}); return ok({id:data}); }
    case 'job_move':{ const {error}=await sb.from('jobs').update({status:body.status}).eq('id',body.id); if(error)throw error; return ok(); }
    case 'job_save': {
      try{ const r=await saveRow('jobs',body); logYaz(act,body); return ok(r); }
      catch(e){
        /* Uyumluluk: eski kolonlar yoksa onları düşürüp tekrar dene.
           `pazarlama` canonical bir Work phase DEĞİLDİR (D-206), bu yüzden
           asla legacy bir status'e geri düşürmeyiz. */
        if(body && /assignee_id|durum/.test(String(e.message||''))){
          const b={...body}; delete b.assignee_id; delete b.durum;
          const r=await saveRow('jobs',b); logYaz(act,b);
          toast('İş kaydedildi; atama için veritabanı güncellemesi gerekli (talimat dosyasındaki SQL).');
          return ok(r);
        } throw e; } }

    case 'products_list':{ const {data,error}=await sb.from('products').select('*').order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'product_save': { const r=await saveRow('products',body); logYaz(act,body); return ok(r); }

    case 'mecra_list':{
      const [ms,us]=await Promise.all([ sb.from('mecralar').select('*').order('sort').order('id'), sb.from('units').select('*').order('sort').order('id') ]);
      if(ms.error)throw ms.error; if(us.error)throw us.error;
      ms.data.forEach(m=>m.units=us.data.filter(u=>u.mecra_id===m.id)); return ok(ms.data);
    }
    case 'mecra_save': { const r=await saveRow('mecralar',body); logYaz(act,body); return ok(r); }
    case 'unit_save': { const r=await saveRow('units',body); logYaz(act,body); return ok(r); }
    /* S11 §4: bir fiziksel panonun TÜM yüzlerinin konumu tek istekte.
       Yetki RLS'tedir (envanter = yönetici); 0 satır sessiz başarı değildir. */
    case 'units_konum':{
      const ids=(body.ids||[]).filter(Boolean); if(!ids.length) throw new Error('Pano seçilmedi.');
      const {data,error}=await sb.from('units').update({lat:body.lat,lng:body.lng}).in('id',ids).select('id');
      if(error)throw error;
      if(!data||data.length!==ids.length) throw new Error('Bu konumu değiştirme yetkiniz yok.');
      logYaz('unit_save',{ids,lat:body.lat,lng:body.lng}); return ok(data); }
    case 'alt_all':{ const {data,error}=await sb.from('alt_mecralar').select('id,mecra_id,name,product_id').order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'alt_list':{ const {data,error}=await sb.from('alt_mecralar').select('*').eq('mecra_id',q.mecra_id).order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'alt_save': { const r=await saveRow('alt_mecralar',body); logYaz(act,body); return ok(r); }
    case 'unit_list':{ const {data,error}=await sb.from('units').select('*').eq('alt_mecra_id',q.alt_id).order('sort').order('id'); if(error)throw error; return ok(data); }
    /* PS9 kapanış §3: A/B çifti TEK ifadede yazılır — PostgREST toplu
       insert'i tek INSERT'tir, yani ya ikisi de ya hiçbiri. Yarım
       envanter (yalnız A yüzü) bırakmanın yolu yoktur. RLS satır
       başına uygulanır: `s07_units_write` yönetici olmayanı reddeder. */
    case 'units_create':{
      const rows=Array.isArray(body.rows)?body.rows:[];
      if(!rows.length) throw new Error('Eklenecek pozisyon yok.');
      if(rows.length>2) throw new Error('Tek seferde en fazla iki yüz eklenebilir.');
      const {data,error}=await sb.from('units').insert(rows).select('id,name');
      if(error)throw error; logYaz(act,body); return ok(data); }
    /* ---- S8 Mecralar ----
       Okuma: TEK normalleştirilmiş yüzey `media_schedule` (yerleşim + eski
       kayıt). Yazma: yalnız güvenilir RPC'ler (toplu, ya hep ya hiç).
       Eski `booking_toggle` / `bookings_all` / `booking_list` KALDIRILDI. */
    case 'media_areas':{ const {data,error}=await sb.from('alt_mecralar')
        .select('id,mecra_id,name,product_id,occupancy_mode,creative_seconds,hidden,legacy_archived,sort').order('sort').order('id');
      if(error)throw error; return ok(data); }
    case 'media_scope':{
      /* Paylaşılan kapsam sorgusu (Raporlar V2 aynı filtreleri kullanır).
         Sayfalı okuma: sessiz 1000 tavanı yok (S5.1 kalıbı). */
      const rows=await rapHepsi(()=>{ let x=sb.from('media_schedule').select('*');
        if(q.iptal!=='1') x=x.neq('commitment','cancelled');
        if(q.mecra_id) x=x.eq('mecra_id',q.mecra_id);
        if(q.alt_mecra_id) x=x.eq('alt_mecra_id',q.alt_mecra_id);
        if(q.customer_id) x=x.eq('customer_id',q.customer_id);
        if(q.work_id) x=x.eq('work_id',q.work_id);
        if(q.placement_id) x=x.eq('placement_id',q.placement_id);
        if(q.from) x=x.or(`block_end.is.null,block_end.gte.${q.from}`);
        if(q.to) x=x.lte('block_start',q.to);
        return x.order('block_start').order('placement_id',{nullsFirst:false}).order('booking_id',{nullsFirst:false}); });
      return ok(rows); }
    case 'media_create':{
      const {data,error}=await sb.rpc('media_placements_create',{p_common:body.common,p_targets:body.targets,p_islem:body.islem||null});
      if(error)throw error; if(data&&data.ok) logYaz(act,body); return ok(data); }
    case 'media_update':{
      const {data,error}=await sb.rpc('media_placement_update',{p_id:body.id,p_patch:body.patch});
      if(error)throw error; if(data&&data.ok) logYaz(act,body); return ok(data); }
    case 'media_jobs':{ const {data,error}=await sb.from('jobs')
        .select('id,title,customer_id,lifecycle_status,status').order('title');
      if(error)throw error; return ok(data); }
    case 'media_work_parties':{ const {data,error}=await sb.from('work_parties')
        .select('customer_id,role').eq('job_id',q.job_id).not('customer_id','is',null);
      if(error)throw error; return ok(data); }
    case 'media_contract_items':{
      /* Opsiyonel bağlam: yalnız bu işin ya da kurumun iptal edilmemiş
         yapısal sözleşme kalemleri. Kalem ZORUNLU değildir. */
      const ors=[q.job_id?`job_id.eq.${q.job_id}`:'',q.customer_id?`customer_id.eq.${q.customer_id}`:''].filter(Boolean);
      if(!ors.length) return ok([]);
      const {data,error}=await sb.from('contracts')
        .select('id,title,reference_no,status,contract_items(id,description,item_type,mecra_id,unit_id,start_date,end_date)')
        .or(ors.join(',')).neq('status','cancelled').order('id',{ascending:false});
      if(error)throw error;
      /* PS9 gorsel kabul §6 — is/kurum eslesmesi UYGUNLUK icin yeterli
         DEGIL. Ekran goruntusunde "Yeni LED yayini" formunda statik bir
         Megalight kalemi (P3-A) secilebilir gorunuyordu. Kalem ayrica:
           · hedef YUZEY/ALAN ile uyumlu olmali (kalem bir unit ya da
             mecra isaret ediyorsa hedefin disina baglanamaz),
           · DONEM ile ortusmeli.
         Uygunsuz kalem SECILEBILIR ONERI olarak sunulmaz. Ayni kural
         sunucuda `media_placements_create/update` icinde de zorlanir. */
      const tUnit=q.unit_id?+q.unit_id:null, tArea=q.alt_mecra_id?+q.alt_mecra_id:null;
      const tMecra=q.mecra_id?+q.mecra_id:null;
      const bas=q.start_date||'', bit=q.end_date||'';
      const out=[];
      (data||[]).forEach(c=>(c.contract_items||[]).forEach(k=>{
        if(k.unit_id!=null&&tUnit!=null&&k.unit_id!==tUnit) return;
        if(k.unit_id!=null&&tUnit==null) return;          // yuzey kalemi, LED alanina baglanamaz
        if(k.mecra_id!=null&&tMecra!=null&&k.mecra_id!==tMecra) return;
        if(bas&&k.end_date&&k.end_date<bas) return;       // donem ortusmuyor
        if(bit&&k.start_date&&k.start_date>bit) return;
        /* S10 §6: kalem anlaşılır adla — sözleşme · kalem · gün.ay.yıl dönemi. */
        const g=v=>v?String(v).slice(0,10).split('-').reverse().join('.'):'';
        out.push({id:k.id,
          etiket:`${c.title||c.reference_no||('Sözleşme #'+c.id)} · ${k.description||sozKalemLbl(k.item_type)}${k.start_date?` · ${g(k.start_date)}${k.end_date?'–'+g(k.end_date):''}`:''}${c.status==='taslak'?' · taslak':''}`});
      }));
      return ok(out); }
    case 'customers_min':{ const rows=await rapHepsi(()=>sb.from('customers').select('id,firma').order('id'));
      return ok(rows); }
    /* Yalnız eski ay bazlı Excel aktarımı yazar (yönetici). Güncel bir
       yerleşimin kapsadığı ay veritabanında reddedilir. */
    case 'legacy_booking_upsert':{
      const row={unit_id:body.unit_id,ym:body.ym,status:body.status,customer_id:(body.customer_id!==undefined?body.customer_id:null)};
      if(body.note!==undefined) row.note=body.note;
      const {error}=await sb.from('bookings').upsert(row,{onConflict:'unit_id,ym'}); if(error)throw error;
      logYaz(act,body); return ok(); }

    case 'customers_list':{
      /* S14: sayfalı okuma — PostgREST satır tavanında sessizce kesilmez. */
      const data=await rapHepsi(()=>sb.from('customers').select('*').order('id',{ascending:false}));
      kurumEkYaz(data); return ok(data); }
    case 'customer_save': { const r=await saveRow('customers',body); logYaz(act,body); return ok(r); }
    case 'customer_delete':{ const {error}=await sb.from('customers').delete().eq('id',body.id); if(error)throw error; return ok(true); }

    case 'suppliers_list':{ const {data,error}=await sb.from('suppliers').select('*').order('firma'); if(error)throw error; return ok(data); }
    case 'supplier_save': { const r=await saveRow('suppliers',body); logYaz(act,body); return ok(r); }
    case 'supplier_delete':{ const {error}=await sb.from('suppliers').delete().eq('id',body.id); if(error)throw error; return ok(true); }

    case 'quotes_list':{ const {data,error}=await sb.from('quotes').select('*').order('created_at',{ascending:false}); if(error)throw error; return ok(data); }
    case 'units_full':{
      /* Teklif olusturucu icin: pozisyon + mecra/alt/urun adlari tek listede */
      const [ur,mr,ar,pr]=await Promise.all([
        sb.from('units').select('*').order('sort').order('id'),
        sb.from('mecralar').select('id,name'),
        sb.from('alt_mecralar').select('id,name'),
        sb.from('products').select('id,name')]);
      for(const r of [ur,mr,ar,pr]) if(r.error) throw r.error;
      const mi=Object.fromEntries((mr.data||[]).map(x=>[x.id,x.name]));
      const ai=Object.fromEntries((ar.data||[]).map(x=>[x.id,x.name]));
      const pi=Object.fromEntries((pr.data||[]).map(x=>[x.id,x.name]));
      return ok((ur.data||[]).map(u=>({id:u.id,name:u.name,olcu:u.olcu,konum:u.konum,mecra_id:u.mecra_id,
        mecra:mi[u.mecra_id]||'',alt:ai[u.alt_mecra_id]||'',urun:pi[u.product_id]||''})));
    }
    case 'quote_builder_save':{
      const {quote,items}=body;
      let qid=quote.id;
      const row={...quote}; delete row.id;
      if(qid){ const {error}=await sb.from('quotes').update(row).eq('id',qid); if(error)throw error;
               const del=await sb.from('quote_items').delete().eq('quote_id',qid); if(del.error)throw del.error; }
      else{ const {data,error}=await sb.from('quotes').insert(row).select('id').single(); if(error)throw error; qid=data.id; }
      if(items && items.length){
        const rows=items.map(i=>({quote_id:qid,unit_id:i.unit_id||null,mecra_name:i.mecra_name||'',
          unit_name:i.unit_name||'',product_name:i.product_name||'',olcu:i.olcu||'',
          start_day:i.start_day||null,period:i.period||'',adet:i.adet||1,price:i.price||0,aciklama:i.aciklama||''}));
        const {error}=await sb.from('quote_items').insert(rows); if(error)throw error;
      }
      logYaz('quote_builder_save',{id:qid,firma:quote.firma||quote.customer_name});
      return ok({id:qid});
    }
    case 'quote_get':{
      const [qr,ir]=await Promise.all([ sb.from('quotes').select('*').eq('id',q.id).single(), sb.from('quote_items').select('*').eq('quote_id',q.id) ]);
      if(qr.error)throw qr.error; if(ir.error)throw ir.error; return ok({quote:qr.data,items:ir.data});
    }
    case 'quote_status':{
      if(body.status==='onaylandi'){ const {data,error}=await sb.rpc('approve_quote',{p_quote_id:body.id}); if(error)throw error; return ok(data); }
      const {error}=await sb.from('quotes').update({status:body.status}).eq('id',body.id); if(error)throw error; logYaz(act,body); return ok(null);
    }

    case 'log_list':{ const {data,error}=await sb.from('activity_log').select('*')
        .order('created_at',{ascending:false}).limit(q.limit?+q.limit:200); if(error)throw error; return ok(data); }
    case 'log_clear':{ const {error}=await sb.from('activity_log').delete()
        .lt('created_at',new Date(Date.now()-(+body.gun||30)*864e5).toISOString()); if(error)throw error; return ok(); }
    /* ---- Work + Entry (Sprint 03) ----
       Work backing = physical `jobs` (D-224/D-227). Entry tek koordinasyon
       primitive'idir: action_status NULL ise sıradan güncelleme, dolu ise
       yapılacak aksiyon (D-204). Ayrı Task/Ticket tablosu yoktur. */
    case 'work_detail':{
      /* S6 §16: Belgeler TEK turda - is, guncellemeler, operasyonlar ve
         teklifler ayni Promise.all icinde baglantilarini gomulu getirir.
         Fiziksel kopya ya da ek baglanti satiri URETILMEZ. */
      const [j,wp,en,qs,bk,op,sz]=await Promise.all([
        sb.from('jobs').select('*,'+BELGE_SEL).eq('id',q.id).maybeSingle(),
        sb.from('work_parties').select('*').eq('job_id',q.id),
        sb.from('entries').select('*,'+BELGE_SEL).eq('job_id',q.id).order('occurred_at',{ascending:false}),
        /* Offer ve Booking kendi domainlerinde kalır; burada yalnız
           Work bağlamında özet olarak yüzeye çıkar (07 §11/§12). */
        sb.from('quotes').select('id,status,total,created_at,revision_no,revision_of_id,gecerlilik,'+BELGE_SEL)
          .eq('work_id',q.id).order('revision_no',{ascending:false}),
        /* S8: bu işe bağlı statik yerleşimler + LED kampanyaları + işe
           bağlanmış eski kayıtlar — AYNI normalleştirilmiş yüzeyden. */
        sb.from('media_schedule').select('*').eq('work_id',q.id).order('block_start'),
        /* S7.1: tam satir. Work Detail'in Baski & Montaj bolumu bunu dogrudan
           kullanir - ayri operations_list + customers_list okumasi KALKTI. */
        sb.from('work_operations').select('*,'+BELGE_SEL)
          .eq('job_id',q.id).order('planned_date',{ascending:true,nullsFirst:false}).order('id'),
        /* S7: yapisal sozlesmeler kalemleri ve belgeleriyle AYNI turda
           (sozlesme / kalem / belge basina istek YOK). */
        sb.from('contracts').select('*,contract_items(*),'+BELGE_SEL)
          .eq('job_id',q.id).order('id',{ascending:false})]);
      if(j.error)throw j.error; if(!j.data) return ok(null);   /* S14: yok/yetkisiz → açık 'bulunamadı' ekranı */
      if(wp.error)throw wp.error; if(en.error)throw en.error;
      if(qs.error)throw qs.error; if(bk.error)throw bk.error; if(op.error)throw op.error;
      if(sz.error)throw sz.error;
      return ok({job:j.data, parties:wp.data||[], entries:en.data||[],
                 quotes:qs.data||[], medya:bk.data||[], ops:op.data||[], contracts:sz.data||[]}); }
    case 'quote_revise':{
      /* Gönderilmiş Offer overwrite edilmez: klon + revision_of_id +
         revision_no artışı (06 §10.2). */
      const [qr,ir]=await Promise.all([
        sb.from('quotes').select('*').eq('id',body.id).single(),
        sb.from('quote_items').select('*').eq('quote_id',body.id)]);
      if(qr.error)throw qr.error; if(ir.error)throw ir.error;
      const src=qr.data; const yeni={...src};
      delete yeni.id; delete yeni.created_at;
      yeni.status='yeni'; yeni.okundu=false;
      yeni.revision_of_id=src.id;
      yeni.revision_no=(src.revision_no||1)+1;
      const {data:ny,error:e1}=await sb.from('quotes').insert(yeni).select('id').single();
      if(e1)throw e1;
      const items=(ir.data||[]).map(x=>{ const c={...x}; delete c.id; c.quote_id=ny.id; return c; });
      if(items.length){ const {error:e2}=await sb.from('quote_items').insert(items); if(e2)throw e2; }
      logYaz('quote_builder_save',{id:ny.id});
      return ok({id:ny.id, revision_no:yeni.revision_no}); }
    case 'entries_list':{
      /* S6: `belge=1` ekleri AYNI sorguda gomer (Entry basina istek yok). */
      let sel=sb.from('entries').select(q.belge?'*,'+BELGE_SEL:'*');
      if(q.job_id)        sel=sel.eq('job_id',q.job_id);
      if(q.assignee_id)   sel=sel.eq('assignee_id',q.assignee_id);
      if(q.action_status) sel=sel.eq('action_status',q.action_status);
      /* S4.4 §19: Güncellemeler INSAN yazimi iletisimdir. Sistem hareketleri
         (faz/durum/muhasebe/operasyon) Hareketler'de ve Work zaman
         cizelgesinde yasar; akisa karismaz. */
      if(q.insan) sel=sel.neq('source','system');
      /* S4.3.1: kisisel takvim bir AYIN terminlerini okur. Olusturma
         zamanina gore son N kayit penceresi eski ya da ileri tarihli
         terminleri kacirabilirdi. Gun sonu dahil (lt ertesi gun). */
      if(q.due_from) sel=sel.gte('due_at',q.due_from);
      if(q.due_to){ const e=new Date(q.due_to+'T00:00:00'); e.setDate(e.getDate()+1);
        sel=sel.lt('due_at',_cIso(e)); }
      /* `occurred_at` tek basina BENZERSIZ DEGIL (gercek veride esit
         damgali satirlar var). Sayfalama geldikten sonra esitlik bir
         sayfa sinirina denk gelirse ayni satir iki sayfada gorunup
         baska bir satir hic gorunmeyebilirdi (S4.1 §27). `id` kirici
         olarak eklendi — siralama artik toplam ve tekrarlanabilir. */
      const {data,error}=await sel.order('occurred_at',{ascending:false})
        .order('id',{ascending:false})
        .limit(q.limit?+q.limit:200);
      if(error)throw error; return ok(data); }
    /* ---- Hareketler (S4.4 §13-§17) ----
       Kaynak TEK: `entries source='system'` - Work zaman cizelgesinin zaten
       okudugu kayitlar. Ikinci bir event tablosu, bildirimler kopyasi YOK.
       SUNUCU TARAFI sayfalama: sayfa 1 icin tum gecmis cekilmez. Is/kurum
       baglami tek sorguda gomulu (FK entries.job_id -> jobs). Esit zaman
       damgalarinda kararli sira icin id kirici (S4.1 §27 ile ayni). */
    case 'hareketler_list':{
      const sayfa=Math.max(1,+q.sayfa||1), adet=Math.min(50,+q.adet||20);
      let sel=sb.from('entries')
        .select('id,job_id,customer_id,body,system_kind,work_operation_id,document_id,media_placement_id,created_by_team_id,occurred_at,jobs(title,customer_id)',{count:'exact'})
        .eq('source','system');
      const GRUP=HR_GRUP;
      if(q.tur&&GRUP[q.tur]) sel=sel.in('system_kind',GRUP[q.tur]);
      const bas=(sayfa-1)*adet;
      const {data,error,count}=await sel.order('occurred_at',{ascending:false})
        .order('id',{ascending:false}).range(bas,bas+adet-1);
      if(error)throw error;
      return ok({satirlar:data||[], toplam:count||0, sayfa, adet}); }
    /* ---- Belgeler (S6) ----
       Olusturma TEK islemde (RPC): metadata + en az bir baglanti. Yukleyici
       kimligi, boyut ve MIME sunucuda belirlenir; buradaki degerler ipucudur. */
    case 'document_create':{
      const {data,error}=await sb.rpc('document_create',{p_docs:body.docs||[],p_islem:body.islem||null});
      if(error)throw error; logYaz(act,{sayi:(body.docs||[]).length}); return ok(data); }
    case 'entry_create_docs':{
      const {data,error}=await sb.rpc('entry_create_with_documents',
        {p_entry:body.entry, p_ilgili:body.ilgili||[], p_docs:body.docs||[]});
      if(error)throw error; logYaz('entry_save',{id:data}); return ok({id:data}); }
    case 'document_update':{
      const patch={}; ['title','doc_type','note'].forEach(k=>{ if(k in body) patch[k]=body[k]; });
      const {data,error}=await sb.from('documents').update(patch).eq('id',body.id).select('id');
      if(error)throw error;
      if(!data||!data.length) throw new Error('Bu belgeyi değiştirme yetkiniz yok.');
      logYaz(act,body); return ok(); }
    case 'document_link_add':{
      const row={document_id:body.document_id};
      ['job_id','entry_id','operation_id','customer_id','contact_id','quote_id','contract_id']
        .forEach(k=>{ if(body[k]) row[k]=body[k]; });
      const {data,error}=await sb.from('document_links').insert(row).select('id').single();
      if(error){ if(error.code==='23505') throw new Error('Belge bu kayda zaten bağlı.'); throw error; }
      logYaz(act,body); return ok(data); }
    case 'document_links_remove':{
      const ids=(body.ids||[]).filter(Boolean);
      if(!ids.length) return ok({docIds:[],eksik:0});
      const {data,error}=await sb.from('document_links').delete().in('id',ids).select('id,document_id');
      if(error)throw error;
      logYaz(act,body);
      return ok({docIds:[...new Set((data||[]).map(x=>x.document_id))],eksik:ids.length-(data||[]).length}); }
    /* ---- Hafıza > Belgeler (S10) ----
       Tek okuma modeli: `document_index` görünümü (SECURITY INVOKER — RLS
       taban tablolarda aynen geçerli). Sunucu tarafı süzme + sayfalama;
       arama yalnız METADATA üzerindedir (ad, orijinal ad, açıklama, bağlı
       iş/kurum/sözleşme adı). Dosya içeriği aranmaz. */
    case 'documents_index':{
      const sayfa=Math.max(1,+q.sayfa||1), adet=Math.min(50,+q.adet||20);
      let s=sb.from('document_index').select('id,title,original_name,ad,doc_type,mime_type,size_bytes,provider,storage_path,external_url,note,uploaded_by_team_id,created_at,updated_at,job_ids,customer_ids,contract_ids,bag_sayisi,iliskisiz',{count:'exact'});
      belgeKatla(q.q).split(/\s+/).filter(Boolean).slice(0,6)
        .forEach(w=>{ s=s.ilike('arama','%'+w.replace(/[\\%_]/g,m=>'\\'+m)+'%'); });
      const kat=BELGE_KAT.find(k=>k[0]===q.kat); if(kat) s=s.in('doc_type',kat[2]);
      if(q.kurum) s=s.contains('customer_ids',[+q.kurum]);
      if(q.is) s=s.contains('job_ids',[+q.is]);
      if(q.iliskisiz==='1') s=s.eq('iliskisiz',true);
      /* Tarih süzgeci YEREL gün sınırıyla (B51): "12 Eyl" = yerel 00:00'dan. */
      const yerel=(iso,ek)=>{ const [y,m,d]=iso.split('-').map(Number); return new Date(y,m-1,d+(ek||0)).toISOString(); };
      if(/^\d{4}-\d{2}-\d{2}$/.test(q.from||'')) s=s.gte('created_at',yerel(q.from));
      if(/^\d{4}-\d{2}-\d{2}$/.test(q.to||'')) s=s.lt('created_at',yerel(q.to,1));
      const bas=(sayfa-1)*adet;
      const {data,error,count}=await s.order('created_at',{ascending:false}).order('id',{ascending:false}).range(bas,bas+adet-1);
      if(error)throw error;
      return ok({satirlar:data||[],toplam:count||0,sayfa,adet}); }
    /* Süzgeç seçenekleri: yalnız belgesi OLAN kurum ve işler (531 kurumluk
       liste değil). Sayfalı okuma — sessiz 1000 tavanı yok. */
    case 'documents_facets':{
      const rows=await rapHepsi(()=>sb.from('document_index').select('id,job_ids,customer_ids').order('id'));
      const k=new Set(), j=new Set();
      rows.forEach(r=>{ (r.customer_ids||[]).forEach(x=>k.add(x)); (r.job_ids||[]).forEach(x=>j.add(x)); });
      return ok({kurumlar:[...k],isler:[...j],toplam:rows.length}); }
    case 'document_detail':{
      const {data,error}=await sb.from('documents')
        .select('*,document_links(id,job_id,entry_id,operation_id,customer_id,contact_id,quote_id,contract_id,created_by_team_id,created_at,'
          +'jobs(id,title,customer_id),customers(id,firma),contracts(id,title,reference_no,job_id,customer_id,status),'
          +'entries(id,job_id,body,occurred_at),work_operations(id,job_id,operation_type,planned_date),quotes(id,work_id,revision_no),contacts(id,name))')
        .eq('id',q.id).maybeSingle();
      if(error)throw error; return ok(data); }
    /* Belgenin güvenilir hareketleri (eklendi / bağlandı / kaldırıldı /
       düzenlendi). Görüntüleme hareket ÜRETMEZ. */
    case 'document_history':{
      const {data,error}=await sb.from('entries')
        .select('id,job_id,customer_id,body,system_kind,created_by_team_id,occurred_at')
        .eq('document_id',q.id).eq('source','system')
        .order('occurred_at',{ascending:false}).order('id',{ascending:false}).limit(30);
      if(error)throw error; return ok(data||[]); }
    /* Kalıcı silme: önce tüm bağlantılar (yetki RLS'te), sonra dosya,
       sonra metadata. Bir bağlantı kaldırılamazsa dosyaya DOKUNULMAZ. */
    case 'document_delete':{
      const {data:ls,error:le}=await sb.from('document_links').select('id').eq('document_id',body.id);
      if(le)throw le;
      if((ls||[]).length){
        const r=await api('document_links_remove',{ids:ls.map(x=>x.id)});
        if(r.eksik) throw new Error('Belgenin bazı bağlantılarını kaldırma yetkiniz yok; belge silinmedi.');
      }
      const t=await api('documents_cleanup',{ids:[body.id]});
      if(!t.silinen) throw new Error('Belge silinemedi. Yalnız yükleyen ya da yönetici silebilir; dosya deposuna ulaşılamadıysa daha sonra tekrar deneyin.');
      logYaz(act,body); return ok(t); }
    /* KALICI SILME — yalniz ACIKCA secilen belgeler (S10). Ilişkisiz belge
       artik mesru bir durumdur ("İlişkilendirilmemiş"); kimliksiz bir
       "tum baglantisizlari temizle" taramasi YAPILMAZ. Sira yapisal kalir:
       once DOSYA silinir; basarisizsa metadata KORUNUR (S6 §24). */
    case 'documents_cleanup':{
      const me=(ui._me&&ui._me.id)||0, adm=isAdmin();
      const ids=((body&&body.ids)||[]).filter(Boolean);
      if(!ids.length) return ok({silinen:0,kalan:0});
      let sel=sb.from('documents').select('id,provider,storage_path,uploaded_by_team_id')
        .not('detached_at','is',null).in('id',ids);
      if(!adm) sel=sel.eq('uploaded_by_team_id',me);
      const {data,error}=await sel.limit(200); if(error)throw error;
      const aday=data||[]; if(!aday.length) return ok({silinen:0,kalan:0});
      const tamam=new Set(aday.filter(d=>d.provider==='external').map(d=>d.id));
      const dosya=aday.filter(d=>d.provider==='supabase');
      if(dosya.length){
        const {data:rm,error:re}=await sb.storage.from('documents').remove(dosya.map(d=>d.storage_path));
        if(re) console.error('[belge] depo silme hatasi',re);
        const gitti=new Set((rm||[]).map(o=>o.name));
        for(const d of dosya){
          if(gitti.has(d.storage_path)){ tamam.add(d.id); continue; }
          if(re) continue;
          /* Yanitta yoksa nesne onceki yarim bir denemede zaten silinmis
             olabilir; klasor gercekten bossa metadata guvenle silinir. */
          const {data:ls}=await sb.storage.from('documents').list(d.storage_path.split('/')[0]);
          if(Array.isArray(ls)&&!ls.length) tamam.add(d.id);
        }
      }
      let silinen=0;
      if(tamam.size){
        const {data:dd,error:de}=await sb.from('documents').delete().in('id',[...tamam]).select('id');
        if(de)throw de; silinen=(dd||[]).length; }
      return ok({silinen,kalan:aday.length-silinen}); }
    /* ---- Sozlesmeler (S7) ----
       Baslik + kalemler + (belge-once akista) mevcut belge baglantilari TEK
       islemde yazilir; imzali sozlesmenin kalemsiz kalmamasi COMMIT'te
       kontrol edilir. Olusturan kimligi sunucuda damgalanir. */
    case 'contract_save':{
      const {data,error}=await sb.rpc('contract_save',
        {p_contract:body.contract, p_items:body.items||[], p_doc_ids:body.doc_ids||[]});
      if(error)throw error; logYaz(act,{id:data}); return ok({id:data}); }
    /* S10: belge ilişki seçicisi için sözleşme listesi (iptaller hariç). */
    case 'contracts_min':{ const {data,error}=await sb.from('contracts')
        .select('id,title,reference_no,job_id,customer_id,status').neq('status','iptal').order('id',{ascending:false});
      if(error)throw error; return ok(data||[]); }
    /* S10 §6: rezervasyon ayrıntısında bağlı sözleşme kalemi → sözleşme →
       belgeleri. Tek okuma; yalnız görüntüleme. */
    case 'contract_item_ctx':{
      const {data,error}=await sb.from('contract_items')
        .select('id,description,item_type,start_date,end_date,contracts(id,title,reference_no,status,job_id,customer_id,'
          +'document_links(id,documents(id,original_name,title,doc_type,mime_type,size_bytes,provider,storage_path,external_url,uploaded_by_team_id,created_at,note)))')
        .eq('id',q.id).maybeSingle();
      if(error)throw error; return ok(data); }
    case 'contract_detail':{
      const {data,error}=await sb.from('contracts').select('*,contract_items(*),'+BELGE_SEL)
        .eq('id',q.id).single();
      if(error)throw error; return ok(data); }
    case 'contract_status':{
      const patch={status:body.status};
      if(body.status==='imzali'&&body.signed_at!==undefined) patch.signed_at=body.signed_at||null;
      const {data,error}=await sb.from('contracts').update(patch).eq('id',body.id).select('id');
      if(error)throw error;
      if(!data||!data.length) throw new Error('Bu sözleşmeyi değiştirme yetkiniz yok.');
      logYaz(act,body); return ok(); }
    case 'entry_save':{
      const row={...body};
      /* `_ilgili` bir entries kolonu DEĞİLDİR: composer'ın "kime özellikle
         önemli" seçimidir. entries insert'ünden önce ayrılır, kayıt
         oluştuktan sonra entry_relevance'a yazılır (PS1 §10). */
      const ilgili=Array.isArray(row._ilgili)?row._ilgili.filter(Boolean).map(Number):null;
      delete row._ilgili;
      if(!row.id) row.created_by_team_id=(ui._me&&ui._me.id)||null;
      else row.updated_at=new Date().toISOString();
      /* Aksiyon kapandığında completed_at sistem tarafından yazılır —
         kullanıcıdan tekrar istenmez (BR-E03). */
      if(row.action_status==='done'&&!row.completed_at) row.completed_at=new Date().toISOString();
      if(row.action_status==='open') row.completed_at=null;
      /* S4.3 §4 — RLS bir UPDATE'i reddettiginde hata DONMEZ, yalnizca 0
         satir etkiler. `saveRow` bunu basari sayardi ve kullanici
         "kaydedildi" toast'i gorurdu. Yazarlik kurali sunucuda oldugu
         icin (migration A) burada etkilenen satiri acikca dogruluyoruz.
         Kontrol YALNIZ entries icin; paylasilan `saveRow` degistirilmedi. */
      let r;
      if(row.id){
        const gid=row.id; const yaz={...row}; delete yaz.id;
        const {data,error}=await sb.from('entries').update(yaz).eq('id',gid).select('id');
        if(error)throw error;
        if(!data||!data.length) throw new Error('Bu güncellemeyi değiştirme yetkiniz yok.');
        r={id:gid};
      } else {
        r=await saveRow('entries',row);
      }
      /* İlgi etiketi SORUMLULUK DEĞİLDİR (PS1 §9): yalnız "bunu özellikle
         fark et" demektir, aksiyon üretmez ve görünürlüğü kısıtlamaz.
         Yalnız açıkça bir liste geldiğinde dokunulur; alan hiç
         gönderilmemişse mevcut etiketler olduğu gibi bırakılır. */
      if(ilgili && r && r.id){
        if(row.id){ const {error:ed}=await sb.from('entry_relevance').delete().eq('entry_id',r.id); if(ed)throw ed; }
        if(ilgili.length){
          const {error:ei}=await sb.from('entry_relevance')
            .upsert(ilgili.map(t=>({entry_id:r.id,team_id:t})),{onConflict:'entry_id,team_id'});
          if(ei)throw ei; }
      }
      logYaz(act,body); return ok(r); }
    /* Panelim'in ilgi eşleşmesi için toplu okuma: Entry başına sorgu
       açmamak adına tek turda çekilir (07 §20 — N+1 yasak). */
    /* ---- Work takibi (PS1.1 §16) ----
       ACIKCA niyet beyanidir: Work'un sahibi olmak, uzerinde gecmiste
       calismis olmak veya bir guncellemede etiketlenmis olmak DEGILDIR.
       Gorunurluk kapisi da degildir - `jobs` RLS'i bu tabloyu okumaz. */
    case 'work_followers_all':{
      /* S5.1 §9-§12: eskiden `.limit(5000)` istiyordu ama PostgREST
         `max_rows=1000`de SESSIZCE kesiyordu. Artik birincil anahtar
         sirasiyla (job_id, team_id) sayfa sayfa sonuna kadar okunur.
         `job_id` verilirse (Work Detail) yalniz o isin satirlari gelir. */
      const data=await rapHepsi(()=>{
        let sel=sb.from('work_followers').select('job_id,team_id');
        if(q.team_id) sel=sel.eq('team_id',q.team_id);
        if(q.job_id)  sel=sel.eq('job_id',q.job_id);
        return sel.order('job_id').order('team_id'); });
      return ok(data); }
    case 'work_follow':{
      /* team_id sunucuda RLS ile zorlanir (with check team_id =
         current_team_id()); buradaki deger yalnizca istegin govdesidir. */
      const me=(ui._me&&ui._me.id)||null;
      if(!me) throw new Error('Takip icin ekip profili gerekiyor.');
      const {error}=await sb.from('work_followers')
        .upsert({job_id:body.id, team_id:me},{onConflict:'job_id,team_id'});
      if(error)throw error; logYaz(act,body); return ok(); }
    case 'work_follow_many':{
      /* Yeni is olustururken secilen "Ilgili" kisiler. Tek upsert;
         kisi basina istek YOK. */
      const ids=(body.team_ids||[]).filter(Boolean);
      if(!ids.length) return ok();
      const {error}=await sb.from('work_followers')
        .upsert(ids.map(t=>({job_id:body.id,team_id:t})),{onConflict:'job_id,team_id'});
      if(error)throw error; logYaz('work_follow',body); return ok(); }
    case 'work_unfollow':{
      const me=(ui._me&&ui._me.id)||null;
      if(!me) return ok();
      const {error}=await sb.from('work_followers').delete()
        .eq('job_id',body.id).eq('team_id',me);
      if(error)throw error; logYaz(act,body); return ok(); }
    /* ---- Kisisel takvim (S4.3 §17-§18) ----
       Sirket kaydi DEGIL, kisisel uretkenlik ogesi. RLS sahiplik ile
       sinirlar (`team_id = current_team_id()`); burada team_id istemciden
       gonderilse bile sunucu WITH CHECK ile kendi satirini zorunlu kilar.
       Admin dahil baska hicbir kullanici bu satirlari GOREMEZ. */
    case 'personal_events_list':{
      let sel=sb.from('personal_events').select('*');
      if(q.from) sel=sel.gte('event_date',q.from);
      if(q.to)   sel=sel.lte('event_date',q.to);
      const {data,error}=await sel.order('event_date').order('event_time',{nullsFirst:true})
        .limit(q.limit?+q.limit:500);
      if(error)throw error; return ok(data); }
    case 'personal_event_save':{
      const me=(ui._me&&ui._me.id)||null;
      if(!me) throw new Error('Kişisel etkinlik için ekip profili gerekiyor.');
      const row={...body, team_id:me};
      if(row.id) row.updated_at=new Date().toISOString();
      const r=await saveRow('personal_events',row);
      /* logYaz KASITLI OLARAK CAGRILMAZ: `activity_log` sirket denetim
         izidir ve ic kullanicilara aciktir; kisisel etkinlik basligini
         oraya yazmak gizliligi delerdi. */
      return ok(r); }
    case 'personal_event_delete':{
      const delId=(q.id!=null&&q.id!=='')?q.id:(body&&body.id);
      const {error}=await sb.from('personal_events').delete().eq('id',delId);
      if(error)throw error; return ok(); }
    case 'entry_relevance_all':{
      /* S5.1 §9-§12: ayni sessiz 1000 kesilmesi. Birincil anahtar
         sirasiyla (entry_id, team_id) sayfali tam okuma. */
      const data=await rapHepsi(()=>{
        let sel=sb.from('entry_relevance').select('entry_id,team_id');
        if(q.team_id) sel=sel.eq('team_id',q.team_id);
        if(q.entry_id) sel=sel.eq('entry_id',q.entry_id);
        return sel.order('entry_id').order('team_id'); });
      return ok(data); }
    case 'job_lifecycle':{
      const patch={lifecycle_status:body.lifecycle_status};
      /* S7.1: arsivleme nedeni ACIKCA secilir; varsayilan UYDURULMAZ.
         Kapanmayan iste neden tutulmaz (DB: jobs_closed_reason_only_closed). */
      if(body.lifecycle_status==='kapandi'&&!CLOSELBL[body.closed_reason])
        throw new Error('Arşivleme nedeni seçilmeli.');
      patch.closed_reason=(body.lifecycle_status==='kapandi')?body.closed_reason:null;
      const {error}=await sb.from('jobs').update(patch).eq('id',body.id);
      if(error)throw error; logYaz(act,body); return ok(); }
    case 'work_party_save':{ const r=await saveRow('work_parties',body); logYaz(act,body); return ok(r); }
    /* Muhasebe kuyrugu fatura tarafini (bill_to) tek turda cozer;
       Work basina sorgu acmamak icin salt-okunur toplu okuma (C4 §23). */
    case 'work_parties_all':{ const {data,error}=await sb.from('work_parties')
        .select('job_id,customer_id,role'); if(error)throw error; return ok(data); }

    /* ---- Baskı / Montaj operasyonları (Sprint 05) ----
       Work'ün structured child'ı; Booking parent zorunlu değildir. */
    case 'operations_list':{
      let sel=sb.from('work_operations').select(q.belge?'*,'+BELGE_SEL:'*');
      if(q.job_id)   sel=sel.eq('job_id',q.job_id);
      if(q.from)     sel=sel.gte('planned_date',q.from);
      if(q.to)       sel=sel.lte('planned_date',q.to);
      if(q.type)     sel=sel.eq('operation_type',q.type);
      if(q.status)   sel=sel.eq('status',q.status);
      const {data,error}=await sel.order('planned_date',{ascending:true,nullsFirst:false})
        .order('id').limit(q.limit?+q.limit:1000);
      if(error)throw error; return ok(data); }
    case 'operation_save':{
      const row={...body};
      if(!row.id) row.created_by_team_id=(ui._me&&ui._me.id)||null;
      else row.updated_at=new Date().toISOString();
      /* Tamamlandı işaretlenince completed_at sistemce yazılır. */
      if(row.status==='done'&&!row.completed_at) row.completed_at=new Date().toISOString();
      if(row.status&&row.status!=='done') row.completed_at=null;
      const r=await saveRow('work_operations',row); logYaz(act,body); return ok(r); }
    /* S7.1: cok satirli olusturma TEK islemde (RPC). Ya tum satirlar ve
       ortak belge baglantilari yazilir ya hicbiri - yarim "basari" yok. */
    /* S12: paket bedeli — birden çok işlemi kapsayan TEK tutar. */
    case 'price_groups_list':{
      let sel=sb.from('operation_price_groups').select('*');
      if(q.job_id) sel=sel.eq('job_id',q.job_id);
      const {data,error}=await sel.order('id'); if(error)throw error; return ok(data); }
    case 'price_group_save':{
      const row={...body};
      if(!row.id) row.created_by_team_id=(ui._me&&ui._me.id)||null; else row.updated_at=new Date().toISOString();
      const r=await saveRow('operation_price_groups',row); logYaz('operation_save',{job_id:body.job_id}); return ok(r); }
    case 'operations_batch':{
      const {data,error}=await sb.rpc('operations_batch_create',
        {p_job:body.job_id, p_rows:body.rows||[], p_docs:body.docs||[], p_package:body.package||null, p_islem:body.islem||null});
      if(error)throw error; logYaz('operation_save',{job_id:body.job_id,sayi:(body.rows||[]).length}); return ok(data); }

    /* ---- Kurumlar / Kişiler (Sprint 02) ----
       Organization backing = physical `customers` (D-212 / D-227).
       Gerçek iş kişileri yalnız `contacts` tablosundadır; legacy
       `customers.ilgili_kisi` Contact değildir (S02_001). */
    case 'contacts_list':{
      let sel=sb.from('contacts').select('*');
      if(q.customer_id) sel=sel.eq('customer_id',q.customer_id);
      const {data,error}=await sel.order('is_primary',{ascending:false}).order('name');
      if(error)throw error; return ok(data); }
    case 'contact_save':{
      /* S13: `ana_kurum` yalnız "kurumun ana kişisi" düşürmesi içindir; satıra
         yazılmaz (düzenlemede customer_id artık gönderilmez). */
      const {ana_kurum,...row}=body;
      const anaKurum=row.customer_id||ana_kurum;
      /* Tek primary kuralı DB'de partial unique index ile korunur; burada
         önce eskisini düşürüp yarış durumunu engelliyoruz. */
      if(row.is_primary && anaKurum){
        const {error:e0}=await sb.from('contacts').update({is_primary:false})
          .eq('customer_id',anaKurum).neq('id',row.id||0);
        if(e0)throw e0; }
      const r=await saveRow('contacts',row); logYaz(act,body); return ok(r); }
    case 'org_detail':{
      /* PS3 §16: kurumun hafızası tek turda gelir - kimlik, kişiler
         (BAĞLANTILAR üzerinden), açık işler, son güncellemeler, geçmiş.
         Kurum başına ek sorgu YOK; ekran başına sabit sayıda okuma. */
      const [c,af,jb,qt,sz,md]=await Promise.all([
        sb.from('customers').select('*,'+BELGE_SEL).eq('id',q.id).maybeSingle(),
        sb.from('contact_affiliations')
          .select('id,contact_id,customer_id,title,department,is_primary,active')
          .eq('customer_id',q.id),
        sb.from('jobs').select('id,title,status,lifecycle_status,is_urgent,closed_reason,primary_contact_id,created_at,'+BELGE_SEL)
          .eq('customer_id',q.id).order('id',{ascending:false}),
        sb.from('quotes').select('id,status,total,created_at,revision_no,work_id')
          .eq('customer_id',q.id).order('id',{ascending:false}).limit(20),
        /* S7: kurumun ticari hafizasi - sinirli, en yeniler once. */
        sb.from('contracts').select('id,title,reference_no,status,job_id,quote_id,signed_at,currency,vat_mode,created_at,contract_items(item_type,description,unit_id,start_date,end_date,quantity,unit_price,line_total),document_links(id)')
          .eq('customer_id',q.id).order('id',{ascending:false}).limit(30),
        /* S8 §45: kurumun güncel ve yaklaşan mecra kayıtları (yapısal
           customer_id; isim eşleştirme YOK) + geçmiş sayısı için tümü. */
        sb.from('media_schedule').select('*').eq('customer_id',q.id).neq('commitment','cancelled').order('block_start')]);
      if(c.error)throw c.error; if(!c.data) return ok(null);
      if(af.error)throw af.error; if(jb.error)throw jb.error;
      if(sz.error)throw sz.error; if(md.error)throw md.error;
      const afl=af.data||[];
      const kids=[...new Set(afl.map(a=>a.contact_id))];
      const jids=(jb.data||[]).map(j=>j.id);
      /* Kişi kayıtları ve güncellemeler iki toplu okumayla alınır. */
      const [kt,en]=await Promise.all([
        kids.length?sb.from('contacts').select('*').in('id',kids):Promise.resolve({data:[]}),
        sb.from('entries').select('*,'+BELGE_SEL)
          .or(`customer_id.eq.${q.id}${jids.length?`,job_id.in.(${jids.join(',')})`:''}`)
          .order('occurred_at',{ascending:false}).limit(60)]);
      if(kt.error)throw kt.error; if(en.error)throw en.error;
      const km={}; (kt.data||[]).forEach(k=>km[k.id]=k);
      /* Mevcut çağıranlar `contacts` bekliyor: şekli KORUNUR, bağlantıya
         özgü unvan/birim alan üzerine eklenir (geriye dönük uyumluluk). */
      const contacts=afl.map(a=>({...(km[a.contact_id]||{id:a.contact_id,name:'—'}),
          aff_id:a.id, aff_title:a.title, aff_department:a.department,
          is_primary:a.is_primary, aff_active:a.active}))
        .sort((x,y)=>(y.is_primary?1:0)-(x.is_primary?1:0)||String(x.name||'').localeCompare(String(y.name||''),'tr'));
      return ok({org:c.data, contacts, jobs:jb.data||[], entries:en.data||[], quotes:qt.data||[],
                 contracts:sz.data||[], medya:md.data||[]}); }

    /* ---- Hafıza: Kişi (PS3 §17) ----
       `contacts` Person kimliğidir; bağlantılar ayrı tabloda. Kişinin
       telefonu/e-postası kendisine, unvanı bağlantıya aittir (§6). */
    case 'person_detail':{
      const [k,af]=await Promise.all([
        sb.from('contacts').select('*').eq('id',q.id).maybeSingle(),
        sb.from('contact_affiliations').select('*').eq('contact_id',q.id)
          .order('is_primary',{ascending:false}).order('id')]);
      if(k.error)throw k.error; if(!k.data) return ok(null);
      if(af.error)throw af.error;
      const orgIds=[...new Set((af.data||[]).map(a=>a.customer_id))];
      const [cu,jb,en]=await Promise.all([
        orgIds.length?sb.from('customers').select('id,firma').in('id',orgIds):Promise.resolve({data:[]}),
        /* Yalnız GÜVENİLİR bağ: Work'ün birincil kişisi. Bulanık isim
           eşleştirmesi YAPILMAZ (§17). */
        sb.from('jobs').select('id,title,status,lifecycle_status,is_urgent,customer_id')
          .eq('primary_contact_id',q.id).order('id',{ascending:false}),
        sb.from('entries').select('*').eq('contact_id',q.id)
          .order('occurred_at',{ascending:false}).limit(40)]);
      if(cu.error)throw cu.error; if(jb.error)throw jb.error; if(en.error)throw en.error;
      const om={}; (cu.data||[]).forEach(o=>om[o.id]=o.firma);
      const affs=(af.data||[]).map(a=>({...a, firma:om[a.customer_id]||('#'+a.customer_id)}));
      return ok({person:k.data, affiliations:affs, jobs:jb.data||[], entries:en.data||[], orgNames:om}); }

    /* Hafıza arama/liste için TEK toplu okuma (§12/§35): kişi başına ya da
       kurum başına sorgu açılmaz. V0 ölçeğinde (531 kurum, küçük kişi
       kümesi) bu kasıtlı olarak yeterlidir; arama altyapısı kurulmaz. */
    case 'affiliations_all':{
      const {data,error}=await sb.from('contact_affiliations')
        .select('id,contact_id,customer_id,title,department,is_primary,active')
        .limit(q.limit?+q.limit:5000);
      if(error)throw error; return ok(data); }
    case 'affiliation_save':{
      const row={...body};
      if(row.id) row.updated_at=new Date().toISOString();
      const r=await saveRow('contact_affiliations',row); logYaz('affiliation_save',body); return ok(r); }
    case 'affiliation_delete':{
      const {error}=await sb.from('contact_affiliations').delete().eq('id',q.id||body.id);
      if(error)throw error; logYaz('affiliation_delete',body,q); return ok(); }
    case 'orgs_overview':{
      const [cu,ct]=await Promise.all([
        rapHepsi(()=>sb.from('customers').select('id,firma,telefon,eposta,adres,vergi_no,active,relationship_evidence,relationship_roles,entity_kind,puan,created_at').order('id'))
          .then(data=>({data}),error=>({error})),
        rapHepsi(()=>sb.from('contacts').select('id,customer_id,name,is_primary,active').order('id'))
          .then(data=>({data}),error=>({error}))]);
      if(cu.error)throw cu.error; if(ct.error)throw ct.error;
      const byOrg={}; (ct.data||[]).forEach(k=>{ (byOrg[k.customer_id]=byOrg[k.customer_id]||[]).push(k); });
      return ok((cu.data||[]).map(o=>{
        const ks=byOrg[o.id]||[];
        return {...o, contact_count:ks.length,
                primary_contact:(ks.find(k=>k.is_primary)||ks[0]||{}).name||''}; })); }

    /* Canonical internal identity (06 §4.2): auth.users.id -> team.auth_user_id.
       E-posta eşleştirmesi görüntüleme verisidir, yetkilendirme için kullanılmaz. */
    case 'me':{
      const {data:ud}=await sb.auth.getUser(); const u=ud&&ud.user;
      if(!u) return ok(null);
      const {data,error}=await sb.from('team').select('*').eq('auth_user_id',u.id).maybeSingle();
      if(error)throw error; return ok(data||null); }
    case 'team_list':{ const {data,error}=await sb.from('team').select('*').order('id'); if(error)throw error; return ok(data); }
    case 'team_save': { const r=await saveRow('team',body); logYaz(act,body); return ok(r); }

    case 'notes_list':{ const {data,error}=await sb.from('notes').select('*').order('created_at',{ascending:false}); if(error)throw error; return ok(data); }
    case 'note_save': { const r=await saveRow('notes',body); logYaz(act,body); return ok(r); }

    case 'pages_list':{ const {data,error}=await sb.from('pages').select('*').order('sort'); if(error)throw error; return ok(data); }
    case 'page_save':{ const row={slug:body.slug}; ['title','body','blocks','in_menu','sort'].forEach(k=>{ if(body[k]!==undefined)row[k]=body[k]; }); const {error}=await sb.from('pages').upsert(row,{onConflict:'slug'}); if(error)throw error; return ok(); }
    case 'page_delete':{ const {error}=await sb.from('pages').delete().eq('slug',q.slug); if(error)throw error; return ok(); }

    case 'settings_get':{ const {data,error}=await sb.from('settings').select('k,v'); if(error)throw error; const o={}; data.forEach(r=>o[r.k]=r.v); return ok(o); }
    case 'settings_save':{ const rows=Object.entries(body).map(([k,v])=>({k,v})); const {error}=await sb.from('settings').upsert(rows,{onConflict:'k'}); if(error)throw error; logYaz(act,body); return ok(); }

    case 'password_change':{ const {error}=await sb.auth.updateUser({password:body.password}); if(error)throw error; return ok(); }
  }
  throw new Error('Bilinmeyen işlem: '+act);
}

let ui={section:'dashboard'}, calData={};
const root=()=>document.getElementById('root');

/* ---- Kimlik doğrulama (Supabase Auth) ---- */
/* Oturumdaki kullanıcıyı canonical bağ üzerinden çözer (06 §4.2).
   Aktif bir ekip profili yoksa iç veriye RLS zaten izin vermez; kullanıcıyı
   yarım çalışan bir panelde bırakmak yerine açık mesajla dışarı alırız. */
async function loadIdentity(){
  let me=null;
  try{ me=await api('me'); }catch(e){ me=null; }
  ui._me=me||null;
  ui._role=me?(me.app_role||'team_member'):null;
  if(!me){
    await sb.auth.signOut();
    showLogin('Bu hesap bir ekip profiline bağlı değil. Erişim için yönetici ile iletişime geçin.');
    return false; }
  return true; }

async function boot(){ const {data}=await sb.auth.getSession();
  if(!data.session){ showLogin(); return; }
  ui._email=(data.session.user||{}).email||'';
  if(!await loadIdentity()) return;
  try{ ui._settings=await api('settings_get'); }catch(e){ ui._settings={}; }
  showApp(); }
function showLogin(err){
  const yil=new Date().getFullYear();
  root().innerHTML=`<div class="login">
    <div class="lg-hero">
      <div class="lg-blob b1"></div><div class="lg-blob b2"></div><div class="lg-blob b3"></div>
      <div class="lg-hero-i">
        <div class="lg-mark">medya<span>park</span></div>
        <h1>Adana'nın açıkhava<br>reklam ağı, tek panelde.</h1>
        <div class="lg-feats">
          <div class="lg-f">${ic('media',18)} Mecra &amp; envanter yönetimi</div>
          <div class="lg-f">${ic('lists',18)} Ay ay doluluk takibi</div>
          <div class="lg-f">${ic('quotes',18)} Teklif &amp; müşteri yönetimi</div>
        </div>
        <div class="lg-alt">© ${yil} Medyapark Adana</div>
      </div>
    </div>
    <div class="lg-form">
      <div class="box ${err?'shake':''}">
        <div class="lg-hi">Tekrar hoş geldiniz</div>
        <p class="muted" style="margin:0 0 22px">Yönetim paneline giriş yapın</p>
        <div class="field"><label class="flabel" for="lu">E-posta</label>
          <input class="inp" id="lu" type="email" placeholder="ornek@medyapark.com" autocomplete="username"></div>
        <div class="field"><label class="flabel" for="lp">Şifre</label>
          <div class="lg-pw"><input class="inp" id="lp" type="password" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
          <button type="button" class="lg-eye" onclick="const p=document.getElementById('lp');p.type=p.type==='password'?'text':'password';this.classList.toggle('on')" title="Şifreyi göster/gizle" aria-label="Şifreyi göster/gizle"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        ${err?`<div class="lg-err" role="alert">${esc(err)}</div>`:''}
        <button class="btn btn-primary lg-btn" id="lgBtn" onclick="doLogin()">Giriş Yap</button>
      </div>
    </div></div>`;
  const u=document.getElementById('lu'); if(u)u.focus();
}
async function doLogin(){
  const b=document.getElementById('lgBtn'); if(b){b.disabled=true;b.textContent='Giriş yapılıyor…';}
  const {error}=await sb.auth.signInWithPassword({email:gv('lu'),password:gv('lp')});
  if(error){ showLogin(girisHataMetni(error)); return; }
  ui._email=gv('lu');
  /* Kimlik önce çözülür: activity_log artık aktif iç kullanıcı ister,
     bu yüzden log kaydı kimlik doğrulandıktan sonra yazılır. */
  if(!await loadIdentity()) return;
  sb.from('activity_log').insert({kullanici:(ui._me&&ui._me.name)||ui._email,islem:'giriş yaptı',bolum:'Oturum',detay:''}).then(()=>{},()=>{});
  try{ ui._settings=await api('settings_get'); }catch(e){ ui._settings={}; }
  showApp(); }
async function logout(){ ui._cikiyor=true; await sb.auth.signOut(); ui._me=null; ui._role=null; ui._cikiyor=false; showLogin(); }

/* ---- S13: oturum ve yetki kaybı ----
   Önceden oturum başka bir sekmede kapatılınca, jeton yenilenemeyince ya da
   hesap pasife alınınca açık panel ANONİM çalışmaya devam ediyordu: RLS boş
   liste döndürdüğü için ekranlar "Kayıt yok" gösteriyor, veri silinmiş gibi
   görünüyordu. Artık bu durum yakalanır ve üstte bir giriş penceresi açılır.
   Sayfa DOM'u korunur (açık form kaybolmaz); aynı kullanıcı yeniden girince
   çalışma kaldığı yerden sürer. Farklı kullanıcı girerse sayfa yenilenir. */
let _oturumAcik=false, _kdSon=0;
function oturumKorumaKur(){
  if(window._oturumKorumasi) return; window._oturumKorumasi=true;
  sb.auth.onAuthStateChange((ev,session)=>{
    if(!ui._me||ui._cikiyor) return;
    if(ev==='SIGNED_OUT'||(!session&&ev!=='INITIAL_SESSION'))
      oturumBitti('Oturumunuz sona erdi. Başka bir sekmede çıkış yapılmış ya da oturum süresi dolmuş olabilir.');
    else if(session&&ui._me.auth_user_id&&session.user&&session.user.id!==ui._me.auth_user_id) location.reload();
  });
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') kimlikDogrula(); });
  window.addEventListener('focus',()=>kimlikDogrula());
}
async function kimlikDogrula(hemen){
  if(!ui._me||_oturumAcik||ui._cikiyor) return;
  const t=Date.now(); if(!hemen&&t-_kdSon<20000) return; _kdSon=t;
  let s=null; try{ s=(await sb.auth.getSession()).data.session; }catch(e){ return; }
  if(!s){ oturumBitti('Oturumunuz sona erdi. Devam etmek için yeniden giriş yapın.'); return; }
  let me; try{ me=await api('me'); }catch(e){ return; }      /* ağ hatası: karar verilmez */
  if(!me||me.active===false) oturumBitti('Bu hesabın panel erişimi artık etkin değil. Yöneticinizle iletişime geçin.',true);
}
function oturumBitti(msg,kalici){
  if(_oturumAcik) return; _oturumAcik=true;
  const bg=document.createElement('div'); bg.id='oturumBg'; bg.className='mpdlg-bg on';
  bg.innerHTML=`<div class="mpdlg" role="alertdialog" aria-modal="true" aria-labelledby="otT" aria-describedby="otM">
    <div class="mpdlg-t" id="otT">${kalici?'Erişim kapandı':'Oturum sona erdi'}</div>
    <div class="mpdlg-m" id="otM">${esc(msg)}${kalici?'':' Açık formunuz korunuyor; aynı hesapla giriş yapınca kaldığınız yerden devam edebilirsiniz.'}</div>
    ${kalici?'':`<div class="field"><label class="flabel" for="otE">E-posta</label><input class="inp" id="otE" type="email" autocomplete="username" value="${esc(ui._email||'')}"></div>
    <div class="field"><label class="flabel" for="otP">Şifre</label><input class="inp" id="otP" type="password" autocomplete="current-password"></div>
    <div class="lg-err" id="otH" role="alert" hidden></div>`}
    <div class="mpdlg-b">${kalici?'<button class="btn btn-primary" onclick="location.reload()">Giriş ekranına dön</button>'
      :'<button class="btn btn-ghost" onclick="location.reload()">Sayfayı yenile</button><button class="btn btn-primary" id="otB" onclick="oturumYenidenGir()">Giriş yap</button>'}</div></div>`;
  document.body.appendChild(bg);
  const p=document.getElementById('otP'); if(p){ p.addEventListener('keydown',e=>{ if(e.key==='Enter') oturumYenidenGir(); }); p.focus(); }
  else bg.querySelector('button').focus();
}
async function oturumYenidenGir(){
  const b=document.getElementById('otB'); if(b&&b.disabled) return; if(b){ b.disabled=true; b.textContent='Giriş yapılıyor…'; }
  const eskiId=ui._me&&ui._me.auth_user_id;
  const {data,error}=await sb.auth.signInWithPassword({email:gv('otE'),password:gv('otP')});
  const h=document.getElementById('otH');
  if(error){ if(b){ b.disabled=false; b.textContent='Giriş yap'; } if(h){ h.hidden=false; h.textContent=girisHataMetni(error); } return; }
  if(data.user&&eskiId&&data.user.id!==eskiId){ location.reload(); return; }
  const me=await api('me').catch(()=>null);
  if(!me||me.active===false){ location.reload(); return; }
  ui._me=me; _oturumAcik=false; const bg=document.getElementById('oturumBg'); if(bg) bg.remove();
  toast('Yeniden giriş yapıldı. Kaldığınız yerden devam edebilirsiniz.');
  belirsizKontrol();
}
function girisHataMetni(e){ const m=String((e&&e.message)||e||'');
  if(/Invalid login credentials/i.test(m)) return 'E-posta ya da şifre hatalı.';
  if(/Email not confirmed/i.test(m)) return 'E-posta adresi doğrulanmamış.';
  if(/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edin.';
  if(/rate limit|too many/i.test(m)) return 'Çok fazla deneme yapıldı. Bir süre sonra tekrar deneyin.';
  return m; }

const NAVG=[
 ['Genel','dashboard',[
   ['dashboard','Dashboard','dashboard'],
   ['raporlar','Raporlar','report']]],
 ['Envanter','media',[
   ['mecralar','Mecralar','media'],
   ['urunler','Ürünler','products'],
   ['harita','Harita','map'],
   ['listeler','Doluluk','lists']]],
 ['Satış','quotes',[
   ['teklifler','Teklifler','quotes'],
   ['talepler','Planlama Talepleri','notes'],
   ['kurumlar','Hafıza','customers'],
   ['musteriler','Müşteriler','customers'],
   ['aboneler','Bülten Aboneleri','customers']]],
 ['Operasyon','jobs',[
   ['is-takibi','İş Takibi','jobs'],
   ['operasyon','Baskı & Montaj','truck'],
   ['tedarikciler','Tedarikçiler','truck']]],
 ['Site İçeriği','home',[
   ['anasayfa','Anasayfa','home'],
   ['sayfalar','Sayfalar','pages'],
   ['ikonlar','İkonlar','media']]],
 ['Yönetim','settings',[
   ['ekip','Ekip','team'],
   ['notlar','Notlar','notes'],
   ['ayarlar','Ayarlar','settings']]]];
const NAV=NAVG.flatMap(g=>g[2].map(n=>[n[0],n[1],n[2],'']));
/* Bir bölüm hangi grupta? */
function navGrupOf(sec){ const g=NAVG.find(g=>g[2].some(n=>n[0]===sec)); return g?g[0]:null; }
/* Workspace bölümleri NAVG grubuna ait değildir; null dönmesi doğrudur. */
function navAcikGruplar(){
  try{ const v=JSON.parse(localStorage.getItem('mp_nav_acik')||'null'); if(Array.isArray(v))return new Set(v); }catch(e){}
  return new Set(NAVG.map(g=>g[0]));       /* ilk açılışta hepsi açık */
}
function navGrupTogle(ad){
  const set=navAcikGruplar(); set.has(ad)?set.delete(ad):set.add(ad);
  try{ localStorage.setItem('mp_nav_acik',JSON.stringify([...set])); }catch(e){}
  navCiz();
}
const GIZLI_GRUP=['Site İçeriği','Yönetim'];       /* üye seviyesinin görmediği gruplar */
/* TEK yetkilendirme otoritesi: team.app_role (D-203).
   Upstream'in `team.seviye` alanı legacy/uyumluluk verisi olarak kalır
   fakat yetki kaynağı DEĞİLDİR. Nihai zorlama her durumda RLS'tedir;
   buradaki kontroller yalnız arayüzü tutarlı tutar (08 §9). */
function yoneticiMi(){ return isAdmin(); }
function navGorunur(){
  if(yoneticiMi()) return NAVG;
  const g=NAVG.filter(g=>!GIZLI_GRUP.includes(g[0])).map(g=>[g[0],g[1],g[2].slice()]);
  g[0][2].push(['ekip','Profilim','team']);   /* üye kendi profilini görebilsin */
  return g;
}
function navCiz(){
  const box=document.getElementById('navScroll'); if(!box)return;
  /* Workspace yüzeyi düz ve kısa: dört birincil kavram (07 §2.1). */
  if(surfaceGet()==='workspace'){
    box.innerHTML=WS_NAV.map(n=>`<button class="navi${ui.section===n[0]?' on':''}" data-s="${n[0]}"
      ${ui.section===n[0]?'aria-current="page"':''} onclick="go('${n[0]}')">
      ${ic(n[2],17)}<span>${esc(n[1])}</span></button>`).join('');
    return;
  }
  const acik=navAcikGruplar();
  box.innerHTML=navGorunur().map(g=>{
    const ac=acik.has(g[0]);
    const items=g[2].map(n=>`<button class="navi${ui.section===n[0]?' on':''}" data-s="${n[0]}" onclick="go('${n[0]}')">
      ${ic(n[2],17)}<span>${esc(n[1])}</span>${n[0]==='teklifler'?'<i class="nav-badge" id="qBadge"></i>':''}${n[0]==='talepler'?'<i class="nav-badge" id="lBadge"></i>':''}</button>`).join('');
    return `<div class="nav-g${ac?' open':''}">
      <button class="nav-gh" onclick="navGrupTogle('${g[0].replace(/'/g,"\\'")}')">
        ${ic(g[1],15)}<span>${esc(g[0])}</span>
        <svg class="nav-ch" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="nav-gb">${items}</div></div>`;
  }).join('');
}
const TITLES={dashboard:'Dashboard',kurumlar:'Hafıza',operasyon:'Baskı & Montaj',muhasebe:'Muhasebeye Gidecekler','workspace-home':'Panelim','ws-mecralar':'Mecralar',anasayfa:'Anasayfa Karşılama','is-takibi':'İşler',urunler:'Ürünler',mecralar:'Mecralar',harita:'Harita',listeler:'Doluluk',musteriler:'Müşteriler',tedarikciler:'Tedarikçiler',raporlar:'Raporlar',teklifler:'Teklifler',talepler:'Medya Planlama Talepleri',ekip:'Ekip',sayfalar:'Sayfalar',ikonlar:'İkon Kütüphanesi',aboneler:'Bülten Aboneleri',notlar:'Notlar',ayarlar:'Ayarlar'};
function userChip(){
  const me=ui._me||{}; const ad=me.name||(ui._email||'').split('@')[0]||'Kullanıcı';
  /* Mevcut serbest metin unvan korunur; yoksa canonical app_role etiketi (D-203). */
  const rol=me.role||me.yetki||(ui._role==='admin'?'Yönetici':'Ekip Üyesi');
  const av=me.photo?`<img src="${esc(me.photo)}" alt="">`
    :`<span class="uc-i">${esc((ad.trim()[0]||'K').toLocaleUpperCase('tr'))}</span>`;
  /* Profilim'e giriş noktası: yeni bir birincil nav ögesi yerine header
     chip'i üzerinden (07 §16; parity audit S1 §7). ekip() zaten admin
     olmayanı kendi profiline yönlendiriyor; ayrı bir profil renderer'ı
     eklenmedi. */
  return `<button type="button" class="uchip" title="${esc(ui._email||'')}" onclick="go('ekip')">${av}
    <div class="uc-b"><b>${esc(ad)}</b><span>${esc(rol)}</span></div></button>`;
}
function showApp(){
  oturumKorumaKur();
  setTimeout(()=>belirsizKontrol(),1500);        /* S14: önceki oturumdan doğrulanamamış girişim */
  const st=ui._settings||{};
  const logo = st.logoImage
    ? `<img src="${esc(st.logoImage)}" alt="logo">`
    : `<span class="wm">medya<b>park</b></span>`;
  const nav='';
  root().innerHTML=`<div class="app">
    <nav class="side">
      <div class="brand">${logo}<span class="brand-sub">${surfaceGet()==='workspace'?'Team Workspace':'Yönetim Paneli'}</span></div>
      ${surfaceSwitchHtml()}
      <div class="nav-scroll" id="navScroll"></div>
      <button class="navi logout" onclick="logout()">${ic('logout',17)}<span>Çıkış</span></button>
    </nav>
    <div class="main">
      <header class="topbar">
        <div class="tb-l"><h2 id="ttl">Dashboard</h2><span class="tb-crumb" id="tbc"></span></div>
        <div class="tb-r">
          <!-- Global hizli kayit (C4 §12): tek giris noktasi, kalici kabukta.
               Her ekrana ayri composer dagitmak yerine buradan; baglam
               (Is / Kurum) formun icinde secilir. Work ve Kurum
               ekranlarindaki baglamsal butonlar ayni formu onceden
               doldurulmus halde acar. -->
          <div class="qc-top">
            ${/* Etiketler <span> icinde: dar ekranda metin gizlenip dugme
                 ikon-only'ye duser, eylem KAYBOLMAZ (§15). */''}
            <button class="btn btn-sm act act-upd" onclick="qcAc({})" title="Bir güncelleme paylaş">${ic('plus',15)}<span class="act-l">Güncelleme</span></button>
            <button class="btn btn-sm act act-work" onclick="jobForm()" title="Yeni iş aç">${ic('plus',15)}<span class="act-l">Yeni İş</span></button>
            <button class="btn btn-sm act act-mem" onclick="hafEkle()" title="Hafızaya kişi, kurum veya belge ekle">${ic('plus',15)}<span class="act-l">Hafızaya Ekle</span></button>
            ${/* §14: AYNI operasyon formu, ikinci bir modal YOK. Global
                 baglamda Is secimi zorunludur cunku operasyon bir Work'un
                 child'idir; Work Detail'den acildiginda Is on-secilidir. */''}
            <button class="btn btn-sm act act-ops" onclick="opForm(0)" title="Baskı veya montaj kaydı ekle">${ic('plus',15)}<span class="act-l">Baskı/Montaj</span></button>
          </div>
          <a class="btn btn-outline btn-sm tb-site" href="index.html" target="_blank" aria-label="Siteyi aç (yeni sekmede)">${ic('ext',15)} <span class="tb-site-l">Siteyi Aç</span></a>
          ${userChip()}
        </div>
      </header>
      <div class="content" id="content"></div>
    </div></div>`;
  navCiz();
  /* S14: adreste geçerli bir hedef varsa (yenileme, paylaşılan bağlantı,
     girişten dönüş) o açılır; yoksa varsayılan ekran. */
  const hedef=navCoz(location.hash);
  if(hedef) navHedefeGit(hedef); else go(surfaceGet()==='workspace'?'workspace-home':'dashboard');
  api('settings_get').then(st=>{ ui._settings=st; if(st.panelTheme)applyPanelTheme(st.panelTheme);
    if(st.favicon){ let l=document.head.querySelector("link[rel~='icon']");
      if(!l){ l=document.createElement('link'); l.rel='icon'; document.head.appendChild(l); } l.href=st.favicon; } }).catch(()=>{});
  yeniTeklifKontrol(); setInterval(yeniTeklifKontrol,60000);
}
/* okunmamış teklif sayısı — 60 saniyede bir kontrol */
let _sonTeklif=null;
async function yeniTeklifKontrol(){
  try{
    const {data,error}=await sb.from('quotes').select('id').eq('okundu',false);
    if(error)return;
    const n=(data||[]).length;
    const b=document.getElementById('qBadge');
    if(b){ b.textContent=n||''; b.style.display=n?'inline-flex':'none'; }
    if(_sonTeklif!==null && n>_sonTeklif) toast(`${n-_sonTeklif} yeni teklif talebi geldi`);
    _sonTeklif=n;
    const lr=await sb.from('leads').select('id').eq('okundu',false);
    const lb=document.getElementById('lBadge');
    if(lb && !lr.error){ const k=(lr.data||[]).length; lb.textContent=k||''; lb.style.display=k?'inline-flex':'none'; }
  }catch(e){}
}
/* ============ GEZİNME GEÇMİŞİ (S4.1 §2–§3) ==========================
   ÖNCE: panelde History API hiç kullanılmıyordu. `go()` yalnız
   `ui.section` yazıp yeniden çiziyor; `workAc()/orgAc()/personAc()/
   quoteView()` ise `ui.section`'a hiç dokunmadan doğrudan #content'e
   yazıyordu. İki sonuç: (a) tarayıcı Geri tuşu paneli tamamen TERK
   ediyordu, (b) ekrandaki "‹ İşler" düğmesi kullanıcı Muhasebe'den,
   Takvim'den, Panelim'den veya Hafıza'dan gelmiş olsa bile SABİT
   olarak İşler'e atıyordu.

   SONRA: her ayırt edilebilir görünüm bir history girdisidir. Yeni bir
   router YAZILMADI (§2) — mevcut `go()/workAc()/orgAc()/personAc()`
   çağrı yüzeyi aynen duruyor; yalnızca ne gösterdiklerini history'ye
   bildiren ince bir katman eklendi.

   Tek değişmez: BİR GÖRÜNÜM = BİR GİRDİ. Aynı görünüm yeniden
   çizilirse girdi PUSH edilmez, REPLACE edilir. Bu, `workAc(id)`'nin
   kaydetme sonrası ~15 tazeleme çağrısını tek satır kod değiştirmeden
   doğru yapar; aksi halde bir işte üç kez kaydeden kullanıcının geri
   dönmek için Geri'ye üç kez basması gerekirdi.

   FİLTRE DURUMU BURADA SAKLANMAZ (§3). Zaten sessionStorage'da yaşıyor
   (mp_is_filtre, mp_is_tab, mp_is_sira, mp_acc, mp_op_filtre, mp_haf,
   mp_panelim, mp_tkv) ve gezinmeden sağ çıkıyor. İkinci bir kopya
   tutmak iki gerçeklik yaratırdı. */

let _navPop=false;                     /* popstate sırasında tekrar push etme */
let _navSon=null;                      /* en son uygulanan durum — iptalde geri yazılır */
try{ if('scrollRestoration' in history) history.scrollRestoration='manual'; }catch(e){}

/* Bir görünümün insan tarafından okunabilir adı — Geri düğmesinin
   üstünde yazan şey budur, bu yüzden "İşler" değil "Muhasebe" der. */
function navEtiket(v,s,id,ad){
  if(v==='work') return ad||'İş';
  if(v==='org')  return ad||'Kurum';
  if(v==='kisi') return ad||'Kişi';
  if(v==='ajanda') return 'Ajandam';
  if(v==='rapor') return ad||'Rapor';
  return TITLES[s]||'Panel';
}
const navAyni=(a,b)=>!!a&&!!b&&a.v===b.v&&String(a.id||'')===String(b.id||'')&&a.s===b.s;

/* ===== S14 — adres çubuğu ================================================
   S4.1'in history katmanı her görünümü bir girdi olarak tutuyordu ama adres
   hiç değişmiyordu: yenileme varsayılan ekrana atıyor, bağlantı
   paylaşılamıyordu. Aynı girdiler artık okunabilir bir karma (hash) adres
   taşır — sunucu yönlendirmesi gerektirmez, yeni router YAZILMADI:

     #/panelim  #/isler?sekme=liste  #/hafiza?sekme=belgeler  #/ajandam
     #/is/42  #/kurum/7  #/kisi/3  #/rapor/baski
     #/mecralar?lok=2&grup=5&donem=2026-10&olcek=6   #/mecralar?gorunum=harita
     …?belge=15  (açık belge ayrıntısı)

   Adreste YALNIZ görünümü yeniden kuracak, hassas olmayan kimlikler durur:
   form taslağı, not, arama metni, erişim anahtarı ya da imzalı dosya adresi
   ASLA yazılmaz. Ayrıntılı süzgeçler sessionStorage'da kalır (S4.1).
   Paylaşılan adres yetki vermez: kayıt yine RLS ile okunur. */
const NAV_SLUG={'workspace-home':'panelim','is-takibi':'isler','kurumlar':'hafiza','ws-mecralar':'mecralar',
  operasyon:'baski-montaj',muhasebe:'muhasebe',raporlar:'raporlar',listeler:'doluluk'};
const NAV_SLUG_TERS=Object.fromEntries(Object.entries(NAV_SLUG).map(([k,v])=>[v,k]));
function navEkParam(s){
  const q={};
  try{
    if(s==='is-takibi'){ const t=isTab(); if(t&&t!=='pano') q.sekme=t; }
    else if(s==='kurumlar'){ const t=hafDurum().tab; if(t&&t!=='tumu') q.sekme=t; }
    else if(s==='ws-mecralar'&&wsMecSub()==='harita') q.gorunum='harita';
    if((s==='ws-mecralar'&&wsMecSub()!=='harita')||s==='listeler'){
      const m=typeof mdDurum==='function'?mdDurum():{};
      if(m.site) q.lok=m.site;
      const acik=Object.entries(m.acik||{}).filter(([,v])=>v===true).map(([k])=>k.slice(1));
      if(acik.length===1) q.grup=acik[0];
      if(m.ank) q.donem=m.ank;
      if(m.olcek&&+m.olcek!==12) q.olcek=m.olcek;
    }
  }catch(e){}
  return q;
}
function navUrl(st){
  if(!st||!st.mp) return location.hash||'';
  let yol, q={};
  if(st.v==='work') yol='is/'+st.id;
  else if(st.v==='org') yol='kurum/'+st.id;
  else if(st.v==='kisi') yol='kisi/'+st.id;
  else if(st.v==='ajanda') yol='ajandam';
  else if(st.v==='rapor') yol='rapor/'+((typeof RP_TURLER!=='undefined'&&RP_TURLER[(st.id||1)-1])||'');
  else { yol=NAV_SLUG[st.s]||st.s; q=navEkParam(st.s); }
  if(st.belge) q.belge=st.belge;
  const qs=new URLSearchParams(q).toString();
  return '#/'+yol+(qs?'?'+qs:'');
}
/* Adres -> hedef. Tanınmayan adres null döner (varsayılan ekran açılır). */
function navCoz(hash){
  const m=String(hash||'').match(/^#\/([^?]*)(?:\?(.*))?$/); if(!m) return null;
  const [a,b]=m[1].split('/'), q={};
  new URLSearchParams(m[2]||'').forEach((v,k)=>{ q[k]=v; });
  const id=/^\d{1,12}$/.test(b||'')?+b:0;
  if(a==='is') return id?{v:'work',s:'is-takibi',id,q}:null;
  if(a==='kurum') return id?{v:'org',s:'kurumlar',id,q}:null;
  if(a==='kisi') return id?{v:'kisi',s:'kurumlar',id,q}:null;
  if(a==='ajandam') return {v:'ajanda',s:'workspace-home',q};
  if(a==='rapor') return (typeof RP_TURLER!=='undefined'&&RP_TURLER.includes(b))?{v:'rapor',s:'raporlar',tur:b,q}:null;
  const s=NAV_SLUG_TERS[a]||((typeof TITLES!=='undefined'&&TITLES[a])?a:null);
  return s?{v:'sec',s,q}:null;
}
/* Adresteki görünüm ayarlarını mevcut yerel duruma uygular (doğrulayarak). */
function navParamUygula(h){
  const q=h.q||{};
  if(h.s==='is-takibi'&&q.sekme) isTabYaz(q.sekme);
  if(h.s==='kurumlar'&&q.sekme&&/^[a-z]{2,20}$/.test(q.sekme)) hafYaz({...hafDurum(),tab:q.sekme});
  if(h.s==='ws-mecralar') ui._mecSub=q.gorunum==='harita'?'harita':'doluluk';
  if((h.s==='ws-mecralar'||h.s==='listeler')&&typeof mdDurum==='function'&&(q.lok||q.donem||q.grup||q.olcek)){
    const st=mdDurum();
    if(/^\d{1,9}$/.test(q.lok||'')) st.site=+q.lok;
    if(/^20\d\d-(0[1-9]|1[0-2])$/.test(q.donem||'')){ st.ank=q.donem; st.yil=+q.donem.slice(0,4); }
    if(['12','6','3'].includes(q.olcek)) st.olcek=+q.olcek;
    if(/^\d{1,9}$/.test(q.grup||'')) st.acik={...(st.acik||{}),[mdGrupKey({id:+q.grup})]:true};
    mdDurumYaz(st);
  }
}
/* Adresteki hedefe git (ilk açılış, elle yazılan adres). */
async function navHedefeGit(h){
  navParamUygula(h);
  if(h.v==='sec'){ await go(h.s); }
  else if(h.v==='rapor'){ await rpAc(h.tur); }
  else if(h.v==='ajanda'){ await go('workspace-home'); ajandaGor('takvim'); }
  else {
    ui.section=h.s; navCiz(); const t=document.getElementById('ttl'); if(t) t.textContent=TITLES[h.s]||'';
    if(h.v==='work') await workAc(h.id); else if(h.v==='org') await orgAc(h.id); else await personAc(h.id);
  }
  if(/^\d{1,12}$/.test((h.q||{}).belge||'')) belgeDetay(+h.q.belge);
}
/* Aynı görünüm içindeki ayar değişimi (sekme, lokasyon, dönem): adres
   güncellenir, geçmişe YENİ girdi eklenmez. */
function navUrlTazele(){
  const st=history.state; if(!st||!st.mp) return;
  const u=navUrl(st); if(u!==location.hash){ try{ history.replaceState(st,'',u); }catch(e){} }
}
/* Açık belge ayrıntısı adreste (yenileme ve paylaşım için); kapanınca düşer. */
function navBelge(id){
  const st=history.state; if(!st||!st.mp||(st.belge||0)===(id||0)) return;
  const y={...st}; if(id) y.belge=id; else delete y.belge;
  try{ history.replaceState(y,'',navUrl(y)); }catch(e){}
  if(_navSon&&navAyni(_navSon,y)) _navSon=y;
}
let _navDegistir=false;                /* elle adres: durumsuz girdiyi DEĞİŞTİR, yenisini ekleme */
/* Kullanıcı adresi elle değiştirirse (ya da bir bağlantıya tıklarsa):
   girdi durumsuz gelir. Kaydedilmemiş değişiklik koruması burada da
   geçerlidir; vazgeçilirse adres görünen ekrana geri yazılır. */
window.addEventListener('hashchange',async()=>{
  if(!document.getElementById('content')||!ui._me) return;
  const st=history.state; if(st&&st.mp&&navUrl(st)===location.hash) return;
  const geriYaz=()=>{ if(_navSon){ try{ history.replaceState(_navSon,'',navUrl(_navSon)); }catch(e){} } };
  const h=navCoz(location.hash); if(!h){ geriYaz(); return; }
  if(modalAcikMi()&&!(await modalVazgec())){ geriYaz(); return; }
  if(ui._dirty&&typeof dirtyGuard==='function'&&!(await dirtyGuard())){ geriYaz(); return; }
  _navDegistir=true;
  try{ await navHedefeGit(h); } finally { _navDegistir=false; }
});

/* Ekranda ne olduğunu history'ye bildirir. Aynı görünümse replace. */
function navKayit(v,s,id,ad){
  if(_navPop) return;                  /* Geri'den geliyoruz: girdi zaten var */
  const onceki=(history.state&&history.state.mp)?history.state:null;
  const lbl=navEtiket(v,s,id,ad);
  const bu={mp:1,v,s,id:id||0,lbl};
  try{
    if(navAyni(onceki,bu)){            /* aynı görünümün tazelenmesi: PUSH YOK */
      _navSon={...onceki,lbl};
      history.replaceState(_navSon,'',navUrl(_navSon)); return; }
    /* Ayrıldığımız görünümün kaydırma konumunu kendi girdisine yaz —
       §2 "tercihen scroll position". Açık belge ayrıntısı ayrılınca düşer. */
    if(onceki){ const o={...onceki,sy:window.scrollY}; delete o.belge; history.replaceState(o,'',navUrl(o)); }
    _navSon=onceki?{...bu,i:(onceki.i||0)+1,gl:onceki.lbl}:{...bu,i:0,gl:''};
    /* S14: elle yazılan adresin girdisi zaten var (durumsuz) — onu doldur. */
    if(onceki&&!_navDegistir) history.pushState(_navSon,'',navUrl(_navSon));
    else                     history.replaceState(_navSon,'',navUrl(_navSon));
  }catch(e){}
}

/* Geri'den gelen bir durumu ekrana uygular. Push YAPMAZ. */
async function navUygula(st){
  if(!document.getElementById('content')) return;   /* login ekranındayız */
  /* Mecra düzenleyicisinin kaydedilmemiş-değişiklik koruması `go()` içinde
     yaşıyordu; tarayıcı Geri'si onu atlamasın. Kullanıcı vazgeçerse
     ayrıldığımız girdiyi geri iterek gezinmeyi İPTAL ederiz. */
  if(ui._dirty && typeof dirtyGuard==='function' && !(await dirtyGuard())){
    if(_navSon){ try{ history.pushState(_navSon,'',navUrl(_navSon)); }catch(e){} }
    return; }
  /* S4.3.1 §13: acik bir diyalog varken tarayici Geri once DIYALOGU kapatir,
     ekrandan AYRILMAZ. Ornek: Ajandam Takvim -> etkinlik duzenle -> Geri;
     kullanici takvimde kalmali. Ayrildigimiz girdi geri itilir. */
  const mbg=document.getElementById('modalBg');
  if(mbg&&mbg.classList.contains('open')){
    /* Kirli form Geri ile sessizce kaybolmaz (S11 §5). */
    await modalVazgec();
    if(_navSon){ try{ history.pushState(_navSon,'',navUrl(_navSon)); }catch(e){} }
    return; }
  _navSon=st;
  _navPop=true;
  try{
    if(st.s&&ui.section!==st.s){ ui.section=st.s; navCiz();
      const t=document.getElementById('ttl'); if(t) t.textContent=TITLES[st.s]||''; }
    /* Ajandam gorunumu gecmis durumundan TURETILIR: 'ajanda' girdisi
       Takvim, Panelim'in 'sec' girdisi Liste demektir. */
    if(st.v==='ajanda')      ui._ajGor='takvim';
    else if(st.v==='sec')    ui._ajGor='liste';
    if(st.v==='work')       await workAc(st.id);
    else if(st.v==='org')   await orgAc(st.id);
    else if(st.v==='kisi')  await personAc(st.id);
    else                    await renderSection();
  } finally { _navPop=false; }
  if(typeof st.sy==='number') setTimeout(()=>window.scrollTo(0,st.sy),0);
}
window.addEventListener('popstate',e=>{
  const st=e.state;
  if(!st||!st.mp) return;              /* panel dışı bir girdi: tarayıcıya bırak */
  navUygula(st);
});

/* Görünür Geri düğmesi. SABİT bir hedefe gitmez: gerçek önceki
   bağlama döner ve etiketi de onu söyler (§2). Panel içinde önceki
   girdi yoksa (derin bağlantı, yenileme) makul bir varsayılana düşer. */
function geri(vars){
  const st=history.state;
  if(st&&st.mp&&(st.i||0)>0){ history.back(); return; }
  go(vars||'is-takibi');
}
function geriBtn(vars){
  const st=history.state;
  const lbl=(st&&st.mp&&(st.i||0)>0&&st.gl)?st.gl:(TITLES[vars]||'Geri');
  return `<button class="btn btn-ghost btn-sm" onclick="geri('${vars}')"
    title="Önceki ekrana dön">‹ ${esc(lbl)}</button>`;
}

async function go(s){ if(typeof dirtyGuard==='function' && !(await dirtyGuard())) return;
  /* Yüzey koruması. UI gizleme yetkilendirme DEĞİLDİR (08 §9) — asıl
     koruma RLS'tedir; bu yalnız team_member'ı ona kapalı olan ve boş
     görünecek ekranlara düşmekten korur. */
  if(ui._role!=='admin' && !WS_IZIN.has(s)){
    toast('Bu bölüm Yönetim yüzeyine aittir.');
    s='workspace-home';
  }
  ui.section=s;
  ui._ajGor='liste';                           /* bolume girmek Ajandam'i Liste'de acar */
  const g=navGrupOf(s);                        /* kapali gruptaki bolume gidilirse grubu ac */
  if(g){ const set=navAcikGruplar(); if(!set.has(g)){ set.add(g); try{localStorage.setItem('mp_nav_acik',JSON.stringify([...set]));}catch(e){} } }
  navCiz();
  navKayit('sec',s,0);
  document.getElementById('ttl').textContent=TITLES[s]||''; renderSection(); yeniTeklifKontrol&&yeniTeklifKontrol(); }

/* ============ CANLI ARAMA (S4.3 §25) ================================
   BUG: Baski & Montaj arama kutusuna yazarken her tus vurusu
   `opFiltreDegis()` -> `renderSection()` cagiriyordu. `renderSection`
   `#content`in innerHTML'ini bastan yaziyor, yani INPUT DUGUMUNUN
   KENDISI yok ediliyor. Odak ve imlec kayboluyor, kullanici ancak tek
   harf girebiliyordu ("Acıbadem" yazmak imkansiz).

   COZUM iki parcali - ikisi de gerekli:
     1) DEBOUNCE: yazma akisi ortasinda yeniden cizim yapilmaz. 200ms
        standart bir yazma araligidir, keyfi bir bekleme degil.
     2) ODAK/IMLEC GERI YUKLEME: yeniden cizim kaciniamaz oldugundan,
        cizimden SONRA ayni id'li input yeniden bulunup odak ve imlec
        konumu geri verilir.
   Yalniz debounce yeterli olmazdi (cizim yine odagi alirdi); yalniz
   odak geri yukleme de yeterli olmazdi (her harfte tam cizim). */
let _aramaT=null;
function canliArama(id,uygula,gecikme){
  clearTimeout(_aramaT);
  _aramaT=setTimeout(async ()=>{
    const e=document.getElementById(id);
    const kon=e?e.selectionStart:null;
    await uygula();
    const y=document.getElementById(id);
    if(y&&document.activeElement!==y){
      y.focus();
      const pos=(kon==null?y.value.length:kon);
      try{ y.setSelectionRange(pos,pos); }catch(err){}
    }
  },gecikme||200);
}

/* S13 — ekran yarışı. Yavaş bağlantıda kullanıcı bir ekrandan hızla
   diğerine geçince, önce istenen ekranın geç gelen verisi yeni ekranın
   ÜSTÜNE çiziliyordu (başlık "İşler", içerik Panelim; ayrıntı ekranında
   tarayıcı geçmişine yanlış girdi). Her gezinme bir ekran numarası alır:
   ayrıntı ekranları (iş/kurum/kişi) veri geldiğinde numarası güncel
   değilse hiçbir şey çizmez ve geçmişe yazmaz; bölüm ekranları kendi iç
   kaplarına çizer, yeni ekran o kabı sayfadan ayırır. */
let _ekranNo=0;
const ekranBasla=()=>++_ekranNo;
async function renderSection(){
  ekranBasla();
  const kok=document.getElementById('content');
  const c=document.createElement('div'); c.className='ekran';
  c.innerHTML='<p class="muted">Yükleniyor…</p>';
  kok.replaceChildren(c);
  const F={dashboard,'is-takibi':isTakibi,urunler,mecralar,listeler,musteriler,kurumlar,teklifler,ekip,
           sayfalar,notlar,anasayfa:anasayfaBolum,tedarikciler,raporlar,harita,ayarlar,talepler,
           ikonlar,aboneler,operasyon,muhasebe,'workspace-home':workspaceHome,'ws-mecralar':wsMecralarHub};
  try{
    const fn=F[ui.section]; if(!fn)return;
    await fn(c);
    if(c.isConnected) collapsify(c,ui.section);
  }catch(e){ if(c.isConnected) c.innerHTML='<div class="banner">Hata: '+esc(e.message||e)+'</div>'; }
}

/* S14 — doğrudan bağlantı ya da yenilemede kayıt yoksa, silinmişse ya da
   görme yetkisi yoksa BOŞ ekran oluşmaz: ne olduğu söylenir. RLS'in
   gizlediği kayıtla silinmiş kayıt aynı yanıtı verir (varlık sızmaz).
   Ağ hatası ayrıdır ve yeniden denenebilir. Adres hedefte kalır. */
function kayitYok(tur,id,e){
  const T={is:['İş','is-takibi','work',workAc],kurum:['Kurum','kurumlar','org',orgAc],kisi:['Kişi','kurumlar','kisi',personAc]}[tur];
  const yok=!e||e.code==='PGRST116'||/0 rows|no rows|multiple \(or no\)/i.test(String((e&&e.message)||''));
  if(e&&!yok) console.error('['+tur+'] açılamadı',e);
  navKayit(T[2],ui.section||T[1],id,T[0]);
  const c=document.getElementById('content'); if(!c) return;
  c.innerHTML=`<div class="sec-head"><div>${geriBtn(T[1])}<h3 style="margin-top:6px">${T[0]} ${yok?'bulunamadı':'açılamadı'}</h3></div></div>
    <div class="card kayit-yok" role="status">
      <p>${yok?`Bu kayıt silinmiş olabilir ya da görme yetkiniz yok. Bağlantıyı paylaşan kişiden kontrol etmesini isteyebilirsiniz.`
        :esc(hataMetni(e))}</p>
      <div class="kayit-yok-a">${yok?'':`<button class="btn btn-primary btn-sm" id="kyTekrar">Tekrar dene</button>`}
        <button class="btn btn-outline btn-sm" onclick="go('${T[1]}')">${esc(TITLES[T[1]]||'Listeye')} ekranına dön</button></div></div>`;
  const b=document.getElementById('kyTekrar'); if(b) b.onclick=()=>T[3](id);
}

/* ===== S14 — aranabilir seçici ===========================================
   500+ kurumlu yerel <select> yerine aranabilir kutu. Mevcut <select>
   KALDIRILMAZ: değer kaynağı olarak gizli durur, böylece gv(), onchange
   işleyicileri, form taslağı koruması ve Kaydet yolları hiç değişmez.
   `data-ara` taşıyan her select, nasıl çizilirse çizilsin (modal, bölüm,
   sonradan doldurulan liste) belge gözlemcisiyle otomatik kurulur.
   Türkçe harf katlamalı arama; oklarla gezinme; Enter yalnız VURGULANAN
   satırı seçer (ilk satır kendiliğinden seçilmez); Esc listeyi kapatır
   (açık pencereyi değil). Sonuçlar sessizce kesilmez: gösterilmeyen sayı
   yazılır. Veri istemcide — ağ yarışı yok, her tuşta indirme yok. */
const _ARA_LIMIT=80;
function araNorm(t){ return String(t||'').toLocaleLowerCase('tr').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g')
  .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ').trim(); }
/* Benzer adlı kurumları ayırt etmek için mevcut kayıttan kısa ek bilgi. */
function kurumEkYaz(list){ const m=(ui._kurumEk=ui._kurumEk||{});
  (list||[]).forEach(x=>{ const e=[x.vergi_no?'VKN '+x.vergi_no:'',x.adres?String(x.adres).split(/[,\n]/)[0].slice(0,40):'',!x.vergi_no&&!x.adres&&x.telefon?x.telefon:''].filter(Boolean).join(' · ');
    if(e) m[x.id]=e; }); }
function aramaliKur(sel){
  if(!sel||sel._ara||sel.multiple) return; sel._ara=true;
  const inpId=(sel.id||('ara'+Math.random().toString(36).slice(2)))+'__ara', lbId=inpId+'_l';
  const kap=document.createElement('div'); kap.className='ara-sec'; kap.setAttribute('data-kirletmez','');
  const kucuk=sel.classList.contains('inp-sm');
  kap.innerHTML=`<div class="ara-kutu"><input type="text" class="inp${kucuk?' inp-sm':''}" id="${inpId}" role="combobox" aria-autocomplete="list"
      aria-expanded="false" aria-controls="${lbId}" autocomplete="off" spellcheck="false">
    <button type="button" class="ara-x" tabindex="-1" aria-label="Seçimi temizle" title="Seçimi temizle" hidden>×</button>
    <span class="ara-ok" aria-hidden="true">▾</span></div>
    <ul class="ara-liste" id="${lbId}" role="listbox" hidden></ul>`;
  sel.after(kap); sel.hidden=true; sel.tabIndex=-1;
  const inp=kap.querySelector('input'), ul=kap.querySelector('ul'), x=kap.querySelector('.ara-x');
  if(sel.id){ const l=document.querySelector(`label[for="${sel.id}"]`);
    if(l){ l.htmlFor=inpId; if(!l.id) l.id=inpId+'_lb'; inp.setAttribute('aria-labelledby',l.id); } }
  if(!inp.hasAttribute('aria-labelledby')&&sel.getAttribute('aria-label')) inp.setAttribute('aria-label',sel.getAttribute('aria-label'));
  let acik=false, aktif=-1, gorunen=[];
  const secenekler=()=>[...sel.options].filter(o=>!o.disabled||o.selected);
  const bos=()=>secenekler().find(o=>o.value==='');
  const ek=o=>o.dataset.ek||(sel.hasAttribute('data-ara')&&ui._kurumEk&&ui._kurumEk[o.value])||'';
  const goster=()=>{ const o=sel.options[sel.selectedIndex];
    const secili=o&&o.value!=='';
    inp.value=secili?o.textContent.trim():''; inp.title=secili?o.textContent.trim():'';
    inp.placeholder=(bos()&&bos().textContent.trim())||'Seçin…';
    x.hidden=!secili||sel.disabled||!bos(); inp.disabled=sel.disabled;
    inp.classList.toggle('inp-on',sel.classList.contains('inp-on')); };
  const ciz=q=>{
    const n=araNorm(q), tum=secenekler().filter(o=>o.value!==''||!n);
    /* Sıra: adı aramayla BAŞLAYANLAR önce, sonra Türkçe alfabetik; boş seçenek en üstte. */
    const es=(n?tum.filter(o=>araNorm(o.textContent+' '+ek(o)).includes(n)):tum).slice().sort((x,y)=>
      ((y.value==='')-(x.value===''))||
      (n?(araNorm(y.textContent).startsWith(n)-araNorm(x.textContent).startsWith(n)):0)
      ||x.textContent.trim().localeCompare(y.textContent.trim(),'tr'));
    gorunen=es.slice(0,_ARA_LIMIT); aktif=-1; inp.removeAttribute('aria-activedescendant');
    ul.innerHTML=gorunen.map((o,i)=>`<li role="option" id="${lbId}_${i}" data-i="${i}" aria-selected="${o.selected&&o.value!==''}">
        <span class="ara-ad">${esc(o.textContent.trim())}</span>${ek(o)?`<span class="ara-ek">${esc(ek(o))}</span>`:''}</li>`).join('')
      +(es.length>gorunen.length?`<li class="ara-not" role="presentation">${es.length-gorunen.length} sonuç daha — aramayı daraltın</li>`:'')
      +(!es.length?`<li class="ara-not" role="presentation">${tum.length?'Eşleşen kayıt yok':'Liste boş'}</li>`:''); };
  const ac=()=>{ if(acik||sel.disabled) return; acik=true; ul.hidden=false; inp.setAttribute('aria-expanded','true'); ciz(''); inp.select(); };
  const kapat=geriYaz=>{ if(!acik) return; acik=false; ul.hidden=true; inp.setAttribute('aria-expanded','false');
    inp.removeAttribute('aria-activedescendant'); if(geriYaz!==false) goster(); };
  const vurgula=i=>{ const li=ul.querySelectorAll('li[role=option]'); if(!li.length) return;
    aktif=Math.max(0,Math.min(li.length-1,i)); li.forEach((e,k)=>e.classList.toggle('aktif',k===aktif));
    inp.setAttribute('aria-activedescendant',li[aktif].id); li[aktif].scrollIntoView({block:'nearest'}); };
  const sec=o=>{ const d=sel.value!==o.value; sel.value=o.value; kapat();
    if(d){ if(kap.closest('#modal')) _modalKirli=true; sel.dispatchEvent(new Event('change',{bubbles:true})); } };
  inp.addEventListener('focus',()=>{ if(!acik) ac(); });
  inp.addEventListener('click',()=>{ if(!acik) ac(); });
  inp.addEventListener('input',()=>{ if(!acik){ acik=true; ul.hidden=false; inp.setAttribute('aria-expanded','true'); } ciz(inp.value); });
  inp.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){ e.preventDefault(); if(!acik) ac(); vurgula(aktif+1); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); if(acik) vurgula(aktif-1); }
    else if(e.key==='Enter'){ if(acik){ e.preventDefault(); e.stopPropagation(); if(aktif>=0&&gorunen[aktif]) sec(gorunen[aktif]); } }
    else if(e.key==='Escape'){ if(acik){ e.preventDefault(); e.stopPropagation(); kapat(); } }
    else if(e.key==='Tab'){ kapat(); } });
  inp.addEventListener('blur',()=>setTimeout(()=>{ if(!kap.contains(document.activeElement)) kapat(); },120));
  ul.addEventListener('mousedown',e=>e.preventDefault());           /* tıklama odağı kaçırmasın */
  ul.addEventListener('click',e=>{ const li=e.target.closest('li[role=option]'); if(li) sec(gorunen[+li.dataset.i]); });
  x.addEventListener('mousedown',e=>e.preventDefault());
  x.addEventListener('click',()=>{ const b=bos(); if(b) sec(b); inp.focus(); });
  /* Programın değer ataması ve seçeneklerin yeniden doldurulması görünüme yansır. */
  const d=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(sel,'value',{configurable:true,get(){ return d.get.call(this); },set(v){ d.set.call(this,v); goster(); }});
  new MutationObserver(()=>{ goster(); if(acik) ciz(inp.value===inp.title?'':inp.value); })
    .observe(sel,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','class']});
  goster();
}
function aramaliTara(kok){ (kok.matches&&kok.matches('select[data-ara]')?[kok]:[]).concat([...(kok.querySelectorAll?kok.querySelectorAll('select[data-ara]'):[])]).forEach(aramaliKur); }
new MutationObserver(ms=>{ for(const m of ms) m.addedNodes.forEach(n=>{ if(n.nodeType===1) aramaliTara(n); }); })
  .observe(document.documentElement,{childList:true,subtree:true});

/* modal — 07 §19: role=dialog, Escape ile kapanır, odak yönetimi */
let _modalOnceki=null;
function modal(html){
  const m=document.getElementById('modal'), bg=document.getElementById('modalBg');
  m.classList.remove('mdl-gen');                 /* S7: genis modal bir sonrakine sizmasin */
  _modalKirli=false;
  m.innerHTML=html;
  m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('tabindex','-1');
  const b=m.querySelector('h3');
  if(b){ if(!b.id) b.id='mdlTitle'; m.setAttribute('aria-labelledby',b.id); }
  else m.removeAttribute('aria-labelledby');
  if(!bg.classList.contains('open')) _modalOnceki=document.activeElement;
  bg.classList.add('open');
  document.body.classList.add('mdl-acik');     /* arkadaki sayfa kaymaz */
  /* İlk anlamlı alana odaklan; yoksa diyaloğun kendisine. */
  const ilk=m.querySelector('input:not([type=hidden]):not([disabled]),textarea,select,button');
  setTimeout(()=>{ (ilk||m).focus(); _modalIlk=formDegerleri(m); },30);
}
/* S13 — "kirli" = kullanıcı GERÇEKTEN bir alana dokundu VE değerler açılıştaki
   hâlden farklı. Yazıp geri silinen form artık gereksiz uyarı vermez. */
let _modalIlk='';
function formDegerleri(kok){
  if(!kok) return '';
  return [...kok.querySelectorAll('input,select,textarea')].filter(e=>!e.closest('[data-kirletmez]')&&e.type!=='hidden'||e.dataset.izle!==undefined)
    .map(e=>e.type==='checkbox'||e.type==='radio'?(e.checked?'1':'0'):e.type==='file'?String(e.files?e.files.length:0):String(e.value)).join('␟')
    +'|'+(typeof EK==='object'?Object.values(EK).map(x=>x?((x.items||[]).length+'.'+(x.kaldir?x.kaldir.size:0)):0).join(','):'');
}
function modalGercektenKirli(){
  if(!_modalKirli) return false;
  const m=document.getElementById('modal');
  return formDegerleri(m)!==_modalIlk;
}
/* Açık diyalogda Tab/Shift+Tab odağı diyalog içinde tutar (arka plandaki
   düğmelere kaçmaz). Üstteki diyalog: oturum > onay > form. */
document.addEventListener('keydown',e=>{
  if(e.key!=='Tab') return;
  const kok=document.getElementById('oturumBg')||document.getElementById('mpDlgBg')
    ||(modalAcikMi()?document.getElementById('modal'):null);
  if(!kok) return;
  const L=[...kok.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(x=>x.offsetParent!==null||x===document.activeElement);
  if(!L.length) return;
  const ilk=L[0], son=L[L.length-1], a=document.activeElement;
  if(!kok.contains(a)){ e.preventDefault(); ilk.focus(); return; }
  if(e.shiftKey&&a===ilk){ e.preventDefault(); son.focus(); }
  else if(!e.shiftKey&&a===son){ e.preventDefault(); ilk.focus(); }
},true);
/* S11 §5 — form taslağı koruması. Formdaki alan değişikliği Kaydet'e kadar
   TASLAKTIR. Kullanıcının GERÇEK girişi (isTrusted) diyaloğu "kirli" yapar;
   programın doldurduğu alanlar yapmaz. Esc, arka plana tıklama, Vazgeç /
   Kapat ve tarayıcı Geri kirli bir formu SORMADAN kapatmaz. Başarılı
   kayıttan sonra kod `closeModal()` çağırır: o yol koşulsuz kapatır. */
let _modalKirli=false;
['input','change'].forEach(t=>document.addEventListener(t,e=>{
  if(!e.isTrusted) return;
  const el=e.target; if(!el||!el.closest||!el.closest('#modal')) return;
  if(el.closest('[data-kirletmez]')) return;
  _modalKirli=true;
},true));
function modalAcikMi(){ const bg=document.getElementById('modalBg'); return !!(bg&&bg.classList.contains('open')); }
async function modalVazgec(){
  if(modalGercektenKirli()&&!(await mpConfirm('Kaydedilmemiş değişiklikler var. Kaydetmeden kapatılsın mı?','Değişiklikler kaydedilmedi',
      {danger:false,guvenli:true,ok:'Kaydetmeden kapat',no:'Düzenlemeye dön'}))) return false;
  closeModal(); return true;
}
window.addEventListener('beforeunload',e=>{ if((modalAcikMi()&&modalGercektenKirli())||ui._dirty){ e.preventDefault(); e.returnValue=''; } });
function closeModal(){
  _modalKirli=false; _modalIlk='';
  document.getElementById('modalBg').classList.remove('open');
  document.body.classList.remove('mdl-acik');
  /* S6 §17-§18: formdan cikiliyorsa yuklenmis ama kaydedilmemis dosyalar
     depoda sahipsiz kalmaz. */
  if(typeof ekBirak==='function') Object.keys(EK).forEach(ekBirak);
  if(_modalOnceki&&document.body.contains(_modalOnceki)){ try{ _modalOnceki.focus(); }catch(e){} }
  _modalOnceki=null;
  if(history.state&&history.state.belge) navBelge(0);
  /* S14: sonucu doğrulanamayan girişimi olan form kapandıysa arka planda sorgula. */
  if(belirsizOku().length) setTimeout(()=>belirsizKontrol(),800);
}
/* Kaydetme sırasında çift gönderimi ve “tıkladım mı?” belirsizliğini önler. */
function modalBusy(on,txt){
  const m=document.getElementById('modal'); if(!m)return;
  m.querySelectorAll('button').forEach(b=>{ b.disabled=!!on; });
  const p=m.querySelector('.btn-primary'); if(!p)return;
  if(on){ p.dataset.eski=p.textContent; p.textContent=txt||'Kaydediliyor…'; }
  else if(p.dataset.eski!==undefined){ p.textContent=p.dataset.eski; delete p.dataset.eski; }
}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const bg=document.getElementById('modalBg');
  /* Onay penceresi (mpDlg) açıksa Esc onu kapatır, formu değil. */
  if(document.getElementById('mpDlgBg')) return;
  if(bg&&bg.classList.contains('open')) modalVazgec();
});


/* ================= İKONLAR (satır içi SVG) ================= */
const ICON={
 dashboard:'<path d="M3 3h7v8H3zM14 3h7v5h-7zM14 11h7v10h-7zM3 14h7v7H3z"/>',
 jobs:'<path d="M3 6h18M3 12h18M3 18h11"/><circle cx="19" cy="18" r="2.4"/>',
 products:'<path d="M12 2.6 21 7v10l-9 4.4L3 17V7z"/><path d="M3 7l9 4.4L21 7M12 11.4V21"/>',
 media:'<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
 map:'<path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6z"/><path d="M9 3v15M15 6v15"/>',
 lists:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.6" cy="6" r="1.1"/><circle cx="3.6" cy="12" r="1.1"/><circle cx="3.6" cy="18" r="1.1"/>',
 customers:'<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M18 20a6 6 0 0 0-2.6-4.9"/>',
 quotes:'<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5M9 12h7M9 16h5"/>',
 team:'<circle cx="12" cy="7" r="3.2"/><path d="M5 20a7 7 0 0 1 14 0"/>',
 pages:'<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
 notes:'<path d="M4 4h16v12l-5 5H4z"/><path d="M20 16h-5v5"/><path d="M8 9h8M8 13h5"/>',
 settings:'<circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15a1.6 1.6 0 0 0-1.5-1H1a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 2.7 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 4.7 1.6 1.6 0 0 0 8 3.2V3a2 2 0 1 1 4 0v.2A1.6 1.6 0 0 0 15 4.7a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z" transform="translate(1 1) scale(.92)"/>',
 logout:'<path d="M15 17l5-5-5-5M20 12H9M11 4H5v16h6"/>',
 ext:'<path d="M14 4h6v6M20 4l-8 8M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 up:'<path d="M5 15l7-7 7 7"/>', down:'<path d="M5 9l7 7 7-7"/>',
 left:'<path d="M14 6l-6 6 6 6"/>', right:'<path d="M10 6l6 6-6 6"/>',
 trash:'<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5.5l3.5 2"/>',
 check:'<path d="M4 12.5l5 5L20 6.5"/>',
 layers:'<path d="M12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 12.5 12 17l9-4.5M3 17 12 21.5 21 17"/>',
 pin:'<path d="M12 21s7-6.6 7-11.5A7 7 0 1 0 5 9.5C5 14.4 12 21 12 21z"/><circle cx="12" cy="9.3" r="2.6"/>',
 truck:'<path d="M2 6.5h11v10H2zM13 10h4l3 3.2v3.3h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
 home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.8V20h13V9.8"/><path d="M9.5 20v-6h5v6"/>',
 report:'<path d="M6 2.5h8l4.5 4.5v14.5H6z"/><path d="M14 2.5V7h4.5"/><path d="M9 17v-3M12 17v-6M15 17v-4"/>',
 upload:'<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
 download:'<path d="M12 4v12M7.5 11.5 12 16l4.5-4.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>'
};
function ic(n,sz){ return `<svg class="ic" viewBox="0 0 24 24" width="${sz||18}" height="${sz||18}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[n]||''}</svg>`; }

/* ================= MİNİ GRAFİKLER (bağımlılıksız SVG) ================= */
/* Sütun grafiği — CSS tabanlı (SVG'de yatay esneme köşeleri bozuyordu) */
function chartBars(rows,opt){
  opt=opt||{}; const h=opt.h||160;
  const raw=Math.max(1,...rows.map(r=>r.a+(r.b||0)));
  const steps=Math.min(4,raw);              /* küçük değerlerde etiket tekrarlamasın */
  const max=Math.ceil(raw/steps)*steps;     /* eksen tam bölünsün */
  const grid=Array.from({length:steps+1},(_,i)=>
    `<div class="cg-l"><span>${max*(steps-i)/steps}</span></div>`).join('');
  const cols=rows.map(r=>{
    const tot=r.a+(r.b||0);
    const pa=(r.a/max)*100, pb=((r.b||0)/max)*100;
    return `<div class="bcol" style="--pa:${pa}%;--pb:${pb}%">
      <div class="bstack">
        <div class="btip">${esc(r.l)}<b>${r.a} dolu</b>${r.b?`<b class="rz">${r.b} rezerve</b>`:''}</div>
        ${r.b?`<i class="b-rez"></i>`:''}${r.a?`<i class="b-dolu"></i>`:''}
        ${tot===0?'<i class="b-zero"></i>':''}
      </div>
      <span class="blab">${esc(r.l)}</span></div>`;
  }).join('');
  return `<div class="chart" style="--ch:${h}px"><div class="cgrid">${grid}</div><div class="bars">${cols}</div></div>`;
}

/* Halka grafik — yumuşak uçlar, gradyan, animasyonlu */
function chartDonut(segs,center){
  const tot=Math.max(1,segs.reduce((s,x)=>s+x.v,0));
  const R=56,C=2*Math.PI*R; let acc=0;
  const live=segs.filter(s=>s.v>0);
  const cap=live.length===1?"round":"butt";
  const arcs=live.map((s,i)=>{
    const len=(s.v/tot)*C; const off=C-acc; acc+=len;
    return `<circle class="dseg" r="${R}" cx="72" cy="72" fill="none" stroke="${s.c}" stroke-width="16"
      stroke-linecap="${cap}" stroke-dasharray="${len.toFixed(2)} ${(C-len).toFixed(2)}"
      stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 72 72)"
      style="animation-delay:${i*90}ms"><title>${esc(s.l)}: ${s.v}</title></circle>`;}).join('');
  return `<div class="donut"><svg viewBox="0 0 144 144" width="150" height="150">
    <circle r="${R}" cx="72" cy="72" fill="none" stroke="var(--c-line2)" stroke-width="16"/>${arcs}</svg>
    <div class="donut-c"><b>${esc(center.v)}</b><span>${esc(center.l)}</span></div></div>`;
}

/* Yatay bar listesi — gradyanlı, animasyonlu */
function chartRows(items){
  const max=Math.max(1,...items.map(i=>i.v));
  return `<div class="hbars">${items.map((i,n)=>{
    const c=i.c||'var(--c-accent)';
    return `<div class="hb">
      <span class="hb-l" title="${esc(i.l)}">${esc(i.l)}</span>
      <span class="hb-t"><i style="--w:${(i.v/max)*100}%;--c:${c};animation-delay:${n*70}ms"></i></span>
      <b class="hb-v">${i.v}</b></div>`;}).join('')}</div>`;
}


/* ---- Alan grafiği: eğri SVG, yazılar HTML (ölçekle büyümesin) ---- */
function chartArea(rows,opt){
  opt=opt||{}; const H=opt.h||150, W=760;          /* W yalnızca eğri koordinat sistemi */
  const n=rows.length; if(!n) return '<p class="empty">Veri yok.</p>';
  const raw=Math.max(1,...rows.map(r=>r.v));
  const steps=Math.min(4,raw), max=Math.ceil(raw/steps)*steps;
  const x=i=>(i*W)/Math.max(1,n-1);
  const yv=v=>H-(v/max)*H;
  const pts=rows.map((r,i)=>[x(i),yv(r.v)]);
  /* monoton kübik: yumuşak ama veriyi aşmaz */
  const dx=[],dy=[],sl=[];
  for(let i=0;i<n-1;i++){ dx.push(pts[i+1][0]-pts[i][0]); dy.push(pts[i+1][1]-pts[i][1]); sl.push(dy[i]/dx[i]); }
  const m=[sl[0]||0];
  for(let i=1;i<n-1;i++){
    if(sl[i-1]*sl[i]<=0) m.push(0);
    else { const w1=2*dx[i]+dx[i-1], w2=dx[i]+2*dx[i-1]; m.push((w1+w2)/(w1/sl[i-1]+w2/sl[i])); } }
  m.push(sl[n-2]||0);
  let d='M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(let i=0;i<n-1;i++){ const h=dx[i];
    d+=`C${(pts[i][0]+h/3).toFixed(1)},${(pts[i][1]+m[i]*h/3).toFixed(1)} `
      +`${(pts[i+1][0]-h/3).toFixed(1)},${(pts[i+1][1]-m[i+1]*h/3).toFixed(1)} `
      +`${pts[i+1][0].toFixed(1)},${pts[i+1][1].toFixed(1)}`; }
  const fill=d+`L${W},${H}L0,${H}Z`;
  const gid='ag'+Math.random().toString(36).slice(2,7);
  /* nokta ve balonlar: yüzdeyle konumlanan HTML */
  const noktalar=rows.map((r,i)=>{
    const l=(x(i)/W)*100, t=(yv(r.v)/H)*100;
    return `<span class="ac-pt" style="left:${l.toFixed(2)}%;top:${t.toFixed(2)}%">
      <i class="ac-dot"></i><b class="ac-tip">${esc(r.l)}${r.sub?' '+esc(r.sub):''} · ${r.v}</b></span>`;}).join('');
  const etiketler=rows.map(r=>`<span><i>${esc(r.l)}</i>${r.sub?`<u>${esc(r.sub)}</u>`:''}</span>`).join('');
  return `<div class="areachart">
    <div class="ac-plot" style="height:${H}px">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" width="100%" height="${H}">
        <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--c-green)" stop-opacity=".34"/>
          <stop offset="100%" stop-color="var(--c-green)" stop-opacity=".02"/></linearGradient></defs>
        <path d="${fill}" fill="url(#${gid})"/><path d="${d}" class="ag-line"/></svg>
      <span class="ac-max">${max}</span>
      ${noktalar}
    </div>
    <div class="ac-x">${etiketler}</div></div>`;
}

/* ---- İş akışı listesi: solda firma, sağda soldan sağa aşamalar ---- */
/* §12 — YALNIZ GORUNEN ETIKET. `jobs.status` degerleri (`temas_takip`,
   `yayinda_aktif`) ve CHECK kisiti DEGISMEDI; migration YOK. Uc ayri
   etiket kaynagi vardi (JOB_STEPS / JOBST / JOBLBL) ve hepsi ayni
   sozlugu tekrarliyordu - ucu de asagidaki tek haritadan turuyor. */
const FAZ_ETIKET={temas_takip:'Temas',teklif:'Teklif',baski:'Baskı',
                  montaj:'Montaj',yayinda_aktif:'Yayında'};
const FAZ_SIRA=['temas_takip','teklif','baski','montaj','yayinda_aktif'];
const JOB_STEPS=FAZ_SIRA.map(k=>[k,FAZ_ETIKET[k]]);
/* ================= BİLDİRİMLER: rezervasyon bitişi (7 gün) ================= */
const AY_KISA=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
function bildirimAlicilar(){
  /* Alıcılar canonical role'den belirlenir; `unvan`/`role` yalnız
     tamamlayıcı bir ipucudur (S02_001 ile aynı ruhta: serbest metin
     yetki kaynağı değildir). */
  return [...new Set((ui._team||[]).filter(x=>x.eposta&&x.active!==false&&(x.app_role==='admin'||/sat[ıi]ş|pazarlama/i.test(x.unvan||x.role||'')))
    .map(x=>String(x.eposta).trim()))];
}
/* ============ BILDIRIM URETIMI + E-POSTA (S4.4 §10-§11) ==============
   ONCE: `bildirimKontrol()` Admin Dashboard CIZILIRKEN (render) setTimeout ile
   cagriliyordu ve (1) bildirimler'e yaziyor, (2) formsubmit.co uzerinden
   GERCEK e-posta gonderiyordu. Yani bir sayfayi ACMAK e-posta tetikliyordu.
   Yerel QA bile ay sonuna 7 gun kala Dashboard'u acsaydi gercek bir adrese
   (ozgur@medyaparkadana.com, admin) posta giderdi.

   SONRA uc ayri yol:
     OKUMA   bildirimCiz()              - saf okuma, yan etkisi YOK
     URETIM  bildirimUret()             - kosulu hesaplar, satir yazar
     E-POSTA bildirimEpostaGonder()     - bekleyenleri gonderir
   Uretim ve e-posta YALNIZ acik bir admin eylemiyle calisir
   (bildirimKontrolCalistir), e-posta ayrica onay ister. Arka plan isci /
   kuyruk EKLENMEDI (§10); otomatik gunluk gonderim bir zamanlayici
   gerektirir ve bu sprintin kapsami disinda.

   Siniflandirma (§11): "7 gun icinde biten rezervasyon" e-postasi
   OPERASYONEL OLARAK YARARLI (satis ekibi yenileme/yeniden satis icin
   bilmeli) - korundu, kapsami GENISLETILMEDI. `anahtar` UNIQUE ve
   `eposta_gonderildi` ile ayni bitis iki kez postalanmaz. Sorunu spam
   degil, TETIKLEYICISIYDI. */
async function bildirimUret(){
  /* S8: bitiş kaynağı kesin dönemli statik yerleşimler + hâlâ geçerli eski
     kayıtlardır (media_schedule). Kesin bitiş varsa gün, yalnız ay
     biliniyorsa ay sonu kullanılır — gün uydurulmaz. Aynı yüzde AYNI
     kurumla kesintisiz devam eden kayıt "bitiş" sayılmaz. LED eşzamanlı
     yayındır: bu kontrol yalnız statik (münhasır) yüzleri kapsar. */
  try{
    const bugun=_cIso(new Date());
    const yakin=(()=>{ const d=new Date(); d.setDate(d.getDate()+7); return _cIso(d); })();
    const l=await api(`media_scope&from=${bugun}`);
    const stat=l.filter(r=>r.occupancy_mode==='exclusive'&&r.unit_id!=null);
    const adaylar=stat.filter(r=>r.block_end&&r.block_end>=bugun&&r.block_end<=yakin
      &&!(r.record_kind==='legacy'&&r.date_precision==='open_end'));
    if(!adaylar.length) return 0;
    const ertesi=iso=>{ const [y,m,d]=iso.split('-').map(Number); return _cIso(new Date(y,m-1,d+1)); };
    const bitenler=adaylar.filter(b=>!stat.some(n=>n!==b&&n.unit_id===b.unit_id&&n.customer_id===b.customer_id
      &&n.block_start<=ertesi(b.block_end)&&(n.block_end==null||n.block_end>b.block_end)));
    if(!bitenler.length) return 0;
    const rows=bitenler.map(b=>{ const ay=b.record_kind==='legacy'&&b.date_precision==='month';
      const [y,m,d]=b.block_end.split('-').map(Number);
      return {tur:'rezervasyon_bitis',
        anahtar:b.placement_id?`medyabitis:p${b.placement_id}:${b.block_end}`:`rezbitis:${b.unit_id}:${b.ym}`,
        baslik:`${b.mecra_name||''} · ${b.unit_name||'#'+b.unit_id} — ${ay?`${AY_KISA[m-1]} ${y} sonunda bitiyor (ay bazlı)`:`${d} ${AY_KISA[m-1]} ${y} tarihinde bitiyor`}`,
        detay:`${b.customer_name||'Müşteri atanmamış'} · ${b.commitment==='reserved'?'Opsiyon':'Kesin'}${b.work_title?' · '+b.work_title:''}`}; });
    const {error}=await sb.from('bildirimler').upsert(rows,{onConflict:'anahtar',ignoreDuplicates:true});
    if(error) throw error;
    return rows.length;
  }catch(e){ console.warn('bildirimUret',e); throw e; }
}
/* E-posta: gonderilmemisleri tek ozet mesajla alicilara yollar. */
async function bildirimEpostaGonder(bekleyen,alici){
  const metin=bekleyen.map(x=>'• '+x.baslik+' ('+x.detay+')').join('\n');
  let tamam=true;
  for(const a of alici){
    try{ const r=await fetch('https://formsubmit.co/ajax/'+encodeURIComponent(a),{method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({_subject:'Medyapark — '+bekleyen.length+' rezervasyon 7 gün içinde bitiyor',
        'Bitiş yaklaşan rezervasyonlar':metin,'Panel':location.origin+location.pathname})});
      if(!r.ok) tamam=false; }catch(e){ tamam=false; }
  }
  if(tamam) await sb.from('bildirimler').update({eposta_gonderildi:true}).in('id',bekleyen.map(x=>x.id));
  return tamam;
}
/* ACIK admin eylemi. Okuma yolunun HICBIR yerinden cagrilmaz. */
async function bildirimKontrolCalistir(){
  if(!isAdmin()){ toast('Bu işlem yönetici yetkisi ister.'); return; }
  let yeni=0;
  try{ yeni=await bildirimUret(); }
  catch(e){ mpAlert('Bitişler kontrol edilemedi: '+(e.message||e)); return; }
  if(!(ui._team&&ui._team.length)) ui._team=await api('team_list').catch(()=>[]);
  const gr=await sb.from('bildirimler').select('id,baslik,detay')
    .eq('tur','rezervasyon_bitis').eq('eposta_gonderildi',false);
  const bekleyen=gr.data||[]; const alici=bildirimAlicilar();
  await bildirimCiz();
  if(!bekleyen.length){ toast(yeni?`${yeni} bitiş kontrol edildi, gönderilecek e-posta yok.`:'Yaklaşan bitiş yok.'); return; }
  if(!alici.length){ toast(`${bekleyen.length} bildirim var, e-posta alıcısı tanımlı değil.`); return; }
  if(!await mpConfirm(`${bekleyen.length} yaklaşan rezervasyon bitişi için ${alici.length} alıcıya e-posta gönderilsin mi?\n\n${alici.join(', ')}`,
      'E-posta gönder',{danger:false,ok:'Gönder'})) return;
  const ok=await bildirimEpostaGonder(bekleyen,alici);
  toast(ok?'E-posta gönderildi.':'Bazı e-postalar gönderilemedi; tekrar denenebilir.');
  await bildirimCiz();
}
async function bildirimCiz(){
  const box=document.getElementById('bildirimBox'), say=document.getElementById('bldSay'); if(!box)return;
  const r=await sb.from('bildirimler').select('*').eq('okundu',false).order('created_at',{ascending:false}).limit(20);
  const list=r.data||[];
  if(say){ say.textContent=list.length?list.length+' yeni':''; say.hidden=!list.length; }
  /* Satır Doluluk'a gider — yüzeye göre doğru rota (Correction Sprint 2 §8).
     "Okundu" paylaşılan durumu değiştirir: Yönetim tarafında kalır. */
  box.innerHTML=list.length?list.map(b=>`<div class="bld">
      <span class="bld-i">${ic('lists',15)}</span>
      <div class="bld-b" onclick="dashGo('doluluk')"><div class="bld-t">${esc(b.baslik)}</div><div class="bld-d">${esc(b.detay||'')}${b.eposta_gonderildi?' · <i>e-posta gitti</i>':''}</div></div>
      ${isAdmin()?`<button class="bld-x" title="Okundu" onclick="bildirimOkundu(${b.id})">✓</button>`:''}</div>`).join('')
    :'<p class="empty" style="margin:0">Yeni bildirim yok. Bitişine 7 gün kalan rezervasyonlar burada görünür.</p>';
}
async function bildirimOkundu(id){ await sb.from('bildirimler').update({okundu:true}).eq('id',id); bildirimCiz(); }

/* Dashboard mini iş panosu: 4 aşama sütunu + atanan rozetleri */
/* `jobs` faz başına en çok 3 ÖRNEK taşır; `faz` gerçek toplamları verir.
   Sayıyı örnekten okumak fazları yanlış gösterirdi (bkz. dashboard_stats). */
function jobsBoard(jobs,faz){
  const AS=[['temas_takip','Temas','violet'],['teklif','Teklif','amber'],['baski','Baskı','cyan'],['montaj','Montaj','green'],['yayinda_aktif','Yayında','slate']];
  if(!jobs||!jobs.length) return '<p class="empty">Devam eden iş yok. "+ Yeni İş" ile başlayın.</p>';
  return `<div class="jb">${AS.map(([st,lbl,cl])=>{
    const list=jobs.filter(j=>j.status===st);
    const top=(faz&&faz[st]!=null)?faz[st]:list.length;
    const ornek=list.slice(0,3), kart_n=ornek.length;
    const kart=ornek.map(j=>`<button class="jb-c" onclick="go('is-takibi').then(()=>workAc(${j.id}))" title="${esc(j.title)}">
        <span class="jb-t">${esc(j.title)}</span>
        <span class="jb-m">${esc(j.firma||'')}</span>
        ${j.assignee_id?ekipRozet(j.assignee_id):''}</button>`).join('');
    return `<div class="jb-col ${cl}">
      <button class="jb-h" onclick="isGo('pano')"><i></i>${lbl}<b>${top}</b></button>
      ${kart||'<div class="jb-bos">—</div>'}
      ${top>kart_n?`<button class="jb-daha" onclick="isGo('liste',{phase:'${st}'})">+${top-kart_n} daha</button>`:''}
    </div>`;}).join('')}</div>`;
}
function flowList(jobs){
  if(!jobs||!jobs.length) return '<p class="empty">Devam eden iş yok.</p>';
  return `<div class="flow">${jobs.map(j=>{
    const idx=JOB_STEPS.findIndex(x=>x[0]===j.status);
    const cur=idx<0?0:idx;
    const yuzde=(cur/(JOB_STEPS.length-1))*100;
    const alt=[j.kisi,j.title].filter(Boolean).join(' · ');
    return `<div class="fl-row" onclick="go('is-takibi')">
      <div class="fl-l">
        <div class="fl-f">${esc(j.firma)}</div>
        <div class="fl-s">${esc(alt||'—')}</div>
        ${j.start?`<div class="fl-d">${esc(String(j.start).slice(0,10))}${j.end?' → '+esc(String(j.end).slice(0,10)):''}</div>`:''}
      </div>
      <div class="fl-r">
        <div class="fl-track"><i style="width:${yuzde}%"></i>
          ${JOB_STEPS.map((st,i)=>`<span class="fl-node ${i<cur?'done':(i===cur?'now':'')}" style="left:${(i/(JOB_STEPS.length-1))*100}%">
            <b></b><em>${esc(st[1])}</em></span>`).join('')}
        </div>
      </div>
      <span class="fl-badge s-${esc(j.status)}">${esc((JOB_STEPS[cur]||['','?'])[1])}</span>
    </div>`;}).join('')}</div>`;
}

/* ---- Takvim ---- */
let calOffset=0;
function calWidget(events){
  const base=new Date(); base.setDate(1); base.setMonth(base.getMonth()+calOffset);
  const y=base.getFullYear(), m=base.getMonth();
  const AY=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const ilk=new Date(y,m,1).getDay(); const kaydir=(ilk+6)%7;   /* pazartesi başlangıç */
  const gun=new Date(y,m+1,0).getDate();
  const bugun=new Date(); const bugunMu=d=>bugun.getFullYear()===y&&bugun.getMonth()===m&&bugun.getDate()===d;
  const isMap={}; (events||[]).forEach(e=>{ const dt=new Date(e.d);
    if(dt.getFullYear()===y&&dt.getMonth()===m) (isMap[dt.getDate()]=isMap[dt.getDate()]||[]).push(e); });
  let hc=''; for(let i=0;i<kaydir;i++) hc+='<span></span>';
  for(let d=1;d<=gun;d++){ const ev=isMap[d];
    const nk=ev?`<i class="cdots">${ev.slice(0,3).map(e=>`<u class="cdot ${esc(e.s||'')}"></u>`).join('')}${ev.length>3?'<u class="cdot more"></u>':''}</i>`:'';
    const ym=y+'-'+pad(m+1)+'-'+pad(d);
    hc+=`<span class="cd${ev?' has':''}${bugunMu(d)?' today':''}"${ev?` onclick="calGun('${ym}')" title="${esc(ev.map(e=>e.t).slice(0,3).join(' · '))}${ev.length>3?' +'+(ev.length-3):''}"`:''}>${d}${nk}</span>`; }
  return `<div class="calw">
    <div class="calh"><b>${AY[m]} ${y}</b>
      <span class="calnav"><button onclick="calNav(-1)">‹</button><button onclick="calNav(1)">›</button></span></div>
    <div class="calg calhead"><span>P</span><span>S</span><span>Ç</span><span>P</span><span>C</span><span>C</span><span>P</span></div>
    <div class="calg">${hc}</div></div>`;
}
function calNav(d){ calOffset+=d; const el=document.getElementById('calBox');
  if(el) el.innerHTML=calWidget(ui._dashEvents||[]); }
/* Takvimde bir güne tıklandı: o günün işlerini göster, oradan İş Takibi'ne geç */
function calGun(gun){
  const ev=(ui._dashEvents||[]).filter(e=>String(e.d).slice(0,10)===gun);
  if(!ev.length)return;
  const JL=JOBLBL;   /* canonical faz etiketleri (D-206) */
  const [yy,mm,dd]=gun.split('-');
  modal(`<h3 style="margin:0 0 4px">${dd}.${mm}.${yy}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">${ev.length} iş başlıyor</p>
    <div class="cal-list">${ev.map(e=>`<button class="cal-i" onclick="closeModal();go('is-takibi')">
      <span class="cdot ${esc(e.s||'')}"></span>
      <span class="cal-t">${esc(e.t)}</span>
      <span class="cal-s">${esc(JL[e.s]||e.s||'')}</span></button>`).join('')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button>
      <button class="btn btn-primary btn-sm" onclick="closeModal();go('is-takibi')">İş Takibine Git</button></div>`);
}

/* ==========================================================
   PAYLAŞILAN DASHBOARD BİLEŞENLERİ (Correction Sprint 2)
   Admin Dashboard ve Team Ana Sayfa aynı şirket-bağlamı
   kartlarını kullanır. İkinci bir dashboard motoru YOKTUR:
   her iki yüzey de tek `dashboard_stats` sorgusunu ve
   aşağıdaki kart üreticilerini çağırır (07 §20, 08 §4).
   Kartlar salt okunurdur; mutation taşımazlar.
   ========================================================== */

/* Aynı yetenek, yüzeye göre farklı rota: Yönetim'de Doluluk/Mecralar
   kendi bölümleri, Workspace'te `ws-mecralar` hub'ının sekmeleri.
   Dashboard kartı için YENİ rota açılmaz (Correction Sprint 2 §8). */
function dashGo(hedef){
  if(hedef==='doluluk'||hedef==='mecralar'){
    if(isAdmin() && surfaceGet()!=='workspace'){ go(hedef==='doluluk'?'listeler':'mecralar'); return; }
    ui._mecSub=(hedef==='doluluk'?'doluluk':'mecralar'); go('ws-mecralar'); return;
  }
  go(hedef);
}
/* İş Takibi — mevcut jobsBoard() mini panosu, iki yüzeyde de aynı */
function dashIsTakibiCard(s){
  return `<section class="card">
    <div class="card-h"><h3>İş Takibi</h3>
      <div style="display:flex;gap:8px;align-items:center">
        ${/* §14: bu dugme `btn-yes` (yesil) ile tek seferlik bir renk
             kullaniyordu; ayni eylem uygulamanin her yerinde AYNI semantik
             tonu tasimali. */''}
        <button class="btn btn-sm act act-work" onclick="go('is-takibi').then(()=>setTimeout(()=>jobForm(),200))">${ic('plus',15)} Yeni İş</button>
        <button class="btn-link" onclick="go('is-takibi')">Tümü</button></div></div>
    <div class="card-b">${jobsBoard(s.jobList||[],s.jobFaz)}</div>
  </section>`;
}
/* Son Teklifler — satırlar Offer'ı Work bağlamındaki aynı görüntüleyiciyle
   açar. Standalone Teklifler bölümü Yönetim'e aittir; team_member'a
   "Tümü" gösterilmez (bounce eden rota üretmemek için). */
function dashTekliflerCard(s){
  const QL={yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'};
  const rq=(s.recentQuotes||[]).map(q=>`<tr onclick="quoteView(${q.id})">
    <td class="mono dim">#${q.id}</td><td>${esc(q.customer_name||q.firma||'-')}</td>
    <td><span class="badge-st st-${esc(q.status||'yeni')}">${esc(QL[q.status]||'Yeni')}</span></td>
    <td class="mono dim">${(q.created_at||'').slice(0,10)}</td></tr>`).join('');
  return `<section class="card">
    <div class="card-h"><h3>Son Teklifler</h3>${isAdmin()?`<button class="btn-link" onclick="go('teklifler')">Tümü</button>`:''}</div>
    ${rq?`<table class="tbl rowlink"><thead><tr><th>#</th><th>Müşteri</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>${rq}</tbody></table>`:'<div class="card-b"><p class="empty">Henüz teklif yok.</p></div>'}
  </section>`;
}
/* Doluluk Trendi — kayan 12 ay; mevcut chartArea() */
function dashDolulukCard(s){
  const area=chartArea((s.aylik||[]).map((a,i)=>({
      l:a.label, v:(a.dolu||0)+(a.rezerve||0),
      sub:(i===0||a.label==='Oca')?a.yil:''
    })),{h:150});
  const araligi=(s.rollBas&&s.rollSon)?(s.rollBas.replace('-','/')+' – '+s.rollSon.replace('-','/')):s.yil;
  return `<section class="card">
    <div class="card-h" style="cursor:pointer" onclick="dashGo('doluluk')" title="Doluluk bölümüne git"><h3>Doluluk Trendi</h3><span class="chip mono">${esc(araligi)}</span></div>
    <div class="card-b">${area}</div>
  </section>`;
}
/* Mecra Dağılımı — mevcut chartRows() */
function dashMecraDagilimCard(s){
  return `<section class="card">
    <div class="card-h" style="cursor:pointer" onclick="dashGo('mecralar')" title="Mecralar bölümüne git"><h3>Mecra Dağılımı</h3><button class="btn-link">Tümü</button></div>
    <div class="card-b" style="cursor:pointer" onclick="dashGo('mecralar')">${s.mecraDagilim.length?chartRows(s.mecraDagilim.map(m=>({l:m.name,v:m.adet,c:m.color}))):'<p class="empty">Mecra yok.</p>'}</div>
  </section>`;
}
/* Bildirimler — kabuk; içeriği bildirimCiz() doldurur (SAF OKUMA).
   Üretim + e-posta yalnız admin'in açık eylemiyle çalışır (S4.4 §10). */
function dashBildirimCard(){
  return `<section class="card"><div class="card-h"><h3>Bildirimler <span class="chip" id="bldSay">…</span></h3>
      ${isAdmin()?`<button class="btn-link ekle" onclick="bildirimKontrolCalistir()"
        title="Önümüzdeki 7 günde biten rezervasyonları kontrol et; e-posta göndermeden önce sorar">Bitişleri kontrol et</button>`:''}</div>
    <div class="card-b" id="bildirimBox"><p class="muted" style="font-size:12.5px;margin:0">Yükleniyor…</p></div></section>`;
}
/* Takvim — mevcut calWidget() */
function dashTakvimCard(){
  return `<section class="card"><div class="card-b" id="calBox">${calWidget(ui._dashEvents)}</div></section>`;
}

/* ---------- DASHBOARD ---------- */
async function dashboard(c){
  const s=await api('dashboard_stats');
  ui._dashEvents=s.takvim||[];
  /* S4.4 §10: cizim YAN ETKISIZ. Onceden burada bildirimKontrol() cagrilir
     ve Dashboard'u acmak bildirim yazip e-posta gonderebilirdi. Artik
     yalnizca okunur; uretim acik "Bitişleri kontrol et" eylemindedir. */
  /* Kart DOM'a yazildiktan SONRA cizilir (asagida); 50ms zamanlayici
     team_list beklenirken kutu henuz yokken ateslenirdi. */

  const tm=await api('team_list').catch(()=>[]); ui._team=tm||[];
  const kpi=[
    ['%'+s.doluluk,'Doluluk', s.yil+' · '+s.toplamDolu+'/'+s.slot+' ay-alan','k-blue','listeler'],
    [s.activeJobs,'Devam eden iş',(s.jobStat.yayin||0)+' yayında','k-lime','is-takibi'],
    [s.newQuotes,'Yeni teklif','son 30 günde '+s.son30Teklif,'k-amber','teklifler'],
    [s.units,'Reklam alanı', s.mecra+' mecra · '+s.alts+' alt mecra','k-green','mecralar']
  ].map(k=>`<div class="kpi2 ${k[3]} tik" onclick="go('${k[4]}')" title="${esc(k[1])} bölümüne git"><div class="kpi2-n">${esc(k[0])}</div>
    <div class="kpi2-t">${esc(k[1])}</div><div class="kpi2-s">${esc(k[2])}</div></div>`).join('');

  /* Son Notlar yalnız Yönetim'de: legacy `notes` defteri, Team'in
     canonical Entry hafızasıyla (Son Güncellemeler) karıştırılmaz. */
  const notlar=(s.notes||[]).length ? s.notes.map(n=>{
    const ad=n.ilgili_kisi||n.konu||'Not';
    const bas=(ad.trim()[0]||'N').toLocaleUpperCase('tr');
    return `<div class="msg" onclick="go('notlar')">
      <span class="msg-av">${esc(bas)}</span>
      <div class="msg-b"><div class="msg-t">${esc(n.konu||ad)}</div>
        <div class="msg-x">${esc(String(n.body||'').slice(0,58))}</div></div>
      <span class="msg-d">${esc(String(n.tarih||n.created_at||'').slice(5,10))}</span></div>`;}).join('')
    : '<p class="empty">Henüz not yok. Ekip notlarını Notlar bölümünden ekleyebilirsiniz.</p>';

  c.innerHTML=`
  <div class="kpi2-row">${kpi}</div>
  <div class="dash-grid">
    <div class="dash-l">
      ${dashIsTakibiCard(s)}
      ${dashTekliflerCard(s)}
      ${dashDolulukCard(s)}
    </div>
    <div class="dash-r">
      ${dashBildirimCard()}
      ${dashTakvimCard()}
      <section class="card">
        <div class="card-h"><h3>Son Notlar</h3><button class="btn-link" onclick="go('notlar')">Tümü</button></div>
        <div class="card-b msgs">${notlar}</div>
      </section>
      ${dashMecraDagilimCard(s)}
    </div>
  </div>
`;
  bildirimCiz();
}

/* ---------- İŞ TAKİBİ — canonical Work board (Sprint 03) ----------
   Phase rigid state machine DEĞİLDİR (BR-W02): atlanabilir, geri
   alınabilir, bazı Work'lerde hiç kullanılmaz. Lifecycle phase'den
   bağımsızdır (D-207). */
const JOBST=FAZ_SIRA.map(k=>[k,FAZ_ETIKET[k]]);
const JOBC={temas_takip:'violet',teklif:'amber',baski:'cyan',montaj:'green',yayinda_aktif:'slate'};
const LIFE=[['acik','Açık'],['bekliyor','Bekliyor'],['kapandi','Kapandı']];
const LIFELBL={acik:'Açık',bekliyor:'Bekliyor',kapandi:'Kapandı'};
const CLOSELBL={tamamlandi:'Tamamlandı',kaybedildi:'Kaybedildi',iptal:'İptal'};
/* S7.1: calisanin zihinsel modeli Aktif / Arsiv. Depolanan uc deger
   (acik/bekliyor/kapandi) DEGISMEDI; Bekliyor Aktif'in ikincil bir hali. */
const yasamAna=ls=>ls==='kapandi'?'arsiv':'aktif';
const ENTRY_SRC={manual:'',system:'sistem',email:'e-posta',whatsapp:'WhatsApp',web:'web'};

function ekipRozet(aid){
  const t=(ui._team||[]).find(x=>x.id===aid); if(!t)return '';
  const bas=String(t.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toLocaleUpperCase('tr');
  return `<span class="asg" title="Atanan: ${esc(t.name)}">${esc(bas)}</span>`;
}
const trTarih=v=>v?new Date(v).toLocaleDateString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric'}):'';
const trAnTarih=v=>v?new Date(v).toLocaleString('tr-TR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
/* Gecikme GÜN bazlıdır: termin alanı yalnız tarih toplar (saat 09:00
   olarak saklanır), bu yüzden bugüne ait bir aksiyon gün bitmeden
   gecikmiş sayılmaz. Ana Sayfa zaten bu tanımı kullanıyordu; timestamp
   karşılaştırması aynı Entry'yi Takiplerim'de "Bugün", Liste'de
   "gecikti" gösteriyordu. Tek tanım burada. */
const gecikti=v=>{ if(!v) return false;
  const t=new Date(); const b=new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,10);
  return String(v).slice(0,10)<b; };

/* ============================================================
   WORK CONTROL CENTER (Coordination C3)
   ============================================================
   İşler artık yalnız bir faz panosu değil; aynı canonical kayıtlar
   üzerinde dört görünüm:  Pano | Liste | Takiplerim | Bekleyenler

   BR-V01 tek kayıt / çok görünüm: dördü de aynı `jobs` + `entries`
   satırlarını okur. İkinci bir Work modeli, Task/Ticket tablosu veya
   ayrı bir veri kopyası YOKTUR (D-204, 06 §26).

   Veri erişimi: `coordVeri()` tek turda paralel dört sorgu yapar ve
   `coordTuret()` Work başına türevleri (son hareket, sıradaki açık
   aksiyon, açık aksiyon sayısı) tek geçişte hesaplar. Kart/satır başına
   sorgu yoktur (07 §20). Sekme değiştirmek yeni bir sorgu turu demektir
   ve bu bilinçlidir: uygulamanın her yerinde renderSection() taze veri
   çeker, burada bayat bir önbellek tutmak tutarsızlık üretirdi.
   ============================================================ */
/* PS1.1 §18: nihai paylasilan Work IA'si UC sekmedir. `Takiplerim` ve
   `Bekleyenler` birincil sekme olmaktan cikti - kisisel degerleri artik
   Panelim'de (Bana ait akis, Dikkat Gerekenler, Takip Ettigim Isler)
   karsilaniyor. Altlarindaki sorgu mantigi SILINMEDI; Panelim ve
   filtreler uzerinden yeniden kullaniliyor. */
const ISTABS=[['pano','Pano'],['liste','Liste'],['takvim','Takvim']];

/* PS1.1 §19: varsayilan yasam dongusu UX'i Aktif | Arsiv.
   Aktif = acik + bekliyor. Backend degerleri aynen duruyor; `bekliyor`
   bir rozet ve filtre olarak yasiyor, ama ASLA "geciken" demek degil.
   PS1.1 §20: kisi filtresi `asg` (Sorumlu) degil `ilgili`. */
/* `gec` (S4.1 §5): Panelim'deki "Dikkat Gerekenler" kartinin gercek bir
   hedefi olsun diye eklendi. YENI BIR MODUL DEGIL - mevcut `acil`
   anahtarinin kardesi olan bir Liste filtresi. Tanim S1.1 ile ayni:
   TERMINI GECMIS ACIK AKSIYONU olan isler. Yastan aciliyet cikarilmaz. */
/* S5.1 §3-§4: ayri `Dikkat` filtresi KALDIRILDI. `Acil` ve `Geciken`
   ilgili bir dikkat IKILISIDIR: ikisi birlikte secilince VEYA ile
   birlesir (`acil VEYA geciken`), diger filtreler bu grubun etrafinda VE
   kalir. Yalniz bu ikili icin gecerlidir - diger hizli filtreler VE. */
const ISF_DEF={life:['acik','bekliyor'],q:'',org:'',phase:'',ilgili:'',
               acil:false,gec:false};
/* Work görünümü filtresi oturum içinde korunur (07 §18/2). */
function isFiltre(){
  let f={};
  try{ f=JSON.parse(sessionStorage.getItem('mp_is_filtre')||'null')||{}; }catch(e){ f={}; }
  const o={...ISF_DEF,...f};
  if(!Array.isArray(o.life)||!o.life.length) o.life=ISF_DEF.life.slice();
  /* Geriye uyumluluk: eski `mine` -> asg='me' -> bugun ilgili=<ben>. */
  if(f.mine===true && !f.asg && !o.ilgili) o.asg='me';
  if(f.asg && !o.ilgili) o.ilgili=f.asg;
  delete o.mine; delete o.asg;
  /* Geriye uyumluluk: S4.3 oturumundan kalan `dikkat:true` ayni kumeyi
     anlatan iki gercek kontrole cevrilir. */
  if(o.dikkat===true){ o.acil=true; o.gec=true; }
  delete o.dikkat;
  o.acil=!!o.acil; o.gec=!!o.gec;
  return o;
}
function isFiltreYaz(f){ try{ sessionStorage.setItem('mp_is_filtre',JSON.stringify(f)); }catch(e){} }
function isTab(){
  try{ const t=sessionStorage.getItem('mp_is_tab'); return ISTABS.some(x=>x[0]===t)?t:'pano'; }
  catch(e){ return 'pano'; }
}
/* Kaldirilan sekmelere giden eski kisayollar/oturum degerleri sessizce
   kirilmasin: en yakin kalici gorunume duserler. */
const IS_ESKI_TAB={takiplerim:'liste',bekleyenler:'liste'};
function isTabYaz(t){
  const k=IS_ESKI_TAB[t]||t;
  try{ sessionStorage.setItem('mp_is_tab',ISTABS.some(x=>x[0]===k)?k:'pano'); }catch(e){}
  navUrlTazele();
}
function isTabGit(t){ isTabYaz(t); renderSection(); }
/* Ana Sayfa ve dashboard kısayolları için tek giriş noktası: hedef
   sekmeyi ve filtreyi birlikte kurar, sonra İşler'e gider (§11). */
function isGo(tab,patch){
  isTabYaz(tab||'pano');
  isFiltreYaz({...isFiltre(),...(patch||{})});
  go('is-takibi');
}

/* ---- tarih / kova yardımcıları ---- */
const _cIso=d=>{const t=new Date(d);return new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,10);};
function coordHaftaSon(){                     /* içinde bulunulan ISO haftanın pazarı */
  const n=new Date(), g=n.getDay();
  const pzt=new Date(n); pzt.setDate(n.getDate()-((g+6)%7));
  const paz=new Date(pzt); paz.setDate(pzt.getDate()+6);
  return _cIso(paz);
}
/* KİŞİSEL ufuk: bugünden sonraki 7 takvim günü (bugün hariç).
   Takvim/ISO haftası DEĞİLDİR ve öyle olmamalıdır: ISO haftasıyla
   cuma günü pazartesiye verilen bir söz "Daha Sonra"ya düşüyor, pazar
   günü ise kova tamamen boşalıyordu. Kişisel taahhüt yuvarlanan bir
   ufuktur; şirket takvimi haftalıktır. İkisi ayrı kalır — `coordHaftaSon`
   ve `wsHafta` operasyonel ISO haftası için aynen durur (C4 §3). */
const COORD_UFUK=7;
const COORDKOVA=[['gec','Geciken'],['bugun','Bugün'],['ufuk','Önümüzdeki 7 Gün'],
                 ['sonra','Daha Sonra'],['yok','Tarihsiz']];
const coordGunFark=v=>v?Math.floor((Date.now()-new Date(v).getTime())/864e5):null;
function coordYas(v){                          /* "12 gün" / "bugün" */
  const g=coordGunFark(v);
  if(g===null) return '';
  return g<=0?'bugün':(g===1?'1 gün':g+' gün');
}

/* ---- tek turda veri + türev ---- */
async function coordVeri(){
  const [jobs,ents,team,custs,cts,fol]=await Promise.all([
    api('jobs_list'), api('entries_list&limit=1000'), api('team_list'),
    api('customers_list'), api('contacts_list'),
    api('work_followers_all').catch(()=>[])]);
  /* job_id -> [team_id]. Tek toplu okuma; Work basina sorgu YOK. */
  const folMap={}; (fol||[]).forEach(r=>{ (folMap[r.job_id]=folMap[r.job_id]||[]).push(r.team_id); });
  ui._followers=folMap;
  /* ui._cust burada DOLDURULUR. Eskiden isTakibi onu okuyup hiç
     çekmiyordu; kurum adına göre arama bu yüzden soğuk oturumda sessizce
     boş dönüyordu (coordination audit §2.3). Okuyan ekran kendi verisini
     çeker — başka bir ekranın ısıtmasına güvenmez. */
  ui._jobs=jobs||[]; ui._entries=ents||[]; ui._team=team||[]; ui._cust=custs||[];
  ui._contacts=cts||[];
  /* S2 §5: "veri okunma anı" — ekrandaki verinin çekildiği an. Dışa
     aktarım künyesinde iş döneminden ve dosya üretim anından ayrı yazılır. */
  ui._veriOkunma=new Date();
  const D=coordTuret(ui._jobs,ui._entries,ui._team,ui._cust,ui._contacts);
  D.followers=folMap;
  return D;
}
function coordTuret(jobs,ents,team,custs,cts){
  const jm={},cm={},tm={},ktm={};
  (jobs||[]).forEach(j=>jm[j.id]=j);
  (custs||[]).forEach(x=>cm[x.id]=x.firma);
  (team||[]).forEach(t=>tm[t.id]=t.name);
  (cts||[]).forEach(k=>ktm[k.id]=k);
  ui._contactMap=ktm;
  /* Work başına türevler — entries üzerinde TEK geçiş. */
  const acikAks={}, sonAkt={}, sonKayit={}, sonraki={};
  (ents||[]).forEach(e=>{
    if(!e.job_id) return;
    const oc=String(e.occurred_at||'');
    /* Son hareket: kaynağı ne olursa olsun son Entry. Sistem Entry'si de
       (faz/durum değişimi) gerçek hareket sayılır; "kimse dokunmuyor"
       sinyalini bozmamak için ayrıca manuel olanı ayırmıyoruz. */
    if(!sonAkt[e.job_id]||oc>sonAkt[e.job_id]){ sonAkt[e.job_id]=oc; sonKayit[e.job_id]=e; }
    if(e.action_status==='open'){
      acikAks[e.job_id]=(acikAks[e.job_id]||0)+1;
      const c=sonraki[e.job_id];
      if(!c||coordAksSira(e)<coordAksSira(c)) sonraki[e.job_id]=e;
    }
  });
  return {jobs:jobs||[],ents:ents||[],team:team||[],custs:custs||[],cts:cts||[],
          jm,cm,tm,ktm,acikAks,sonAkt,sonKayit,sonraki,
          benim:(ui._me&&ui._me.id)||0};
}
/* Terminli aksiyon önce, tarihsiz en sonda. */
const coordAksSira=e=>e.due_at?String(e.due_at).slice(0,10):'9999-12-31';

/* Bekleyenler kuyruk sırası — ürün kararı.
   Verilen söz önce, sessizlik sonra: termini geçmiş bir takip, sadece
   eskimiş bir işten daha güçlü bir sinyaldir. Biri bir tarih taahhüt
   etti ve tarih kaçtı; bu, üzerinde hiç konuşulmamış olmaktan farklıdır.
   Hiç açık aksiyonu olmayan bekleyen iş de yükselir — orada kimse bir
   sonraki adıma karar vermemiştir. Sahipsizlik küçük bir ek ağırlıktır
   ki hiçbir iş sahiplenilmemiş halde dipte kalmasın.
   Faz ağırlığı BİLİNÇLİ olarak yok: phase bir state machine değildir
   (BR-W02) ve ticari risk göstergesi olarak kullanılması onu fiilen
   öyle yapardı. */
/* ---- paylaşılan filtre uygulaması ---- */
function coordSuz(D,f,opt){
  opt=opt||{};
  let list=(D.jobs||[]).filter(j=>f.life.includes(j.lifecycle_status||'acik'));
  if(opt.life) list=list.filter(j=>(j.lifecycle_status||'acik')===opt.life);
  if(f.phase&&!opt.faziAtla) list=list.filter(j=>(j.status||'temas_takip')===f.phase);
  if(f.org) list=list.filter(j=>String(j.customer_id)===String(f.org));
  const bugunIso=_cIso(new Date());
  const geciken=j=>{ const nx=D.sonraki[j.id];
    return !!(nx&&nx.due_at&&String(nx.due_at).slice(0,10)<bugunIso); };
  /* S5.1 §4: dikkat ikilisi TEK grup. Yalniz Acil -> acil; yalniz
     Geciken -> geciken; ikisi -> acil VEYA geciken. Grup, diger
     filtrelerle VE'lenir. */
  if(f.acil||f.gec) list=list.filter(j=>(f.acil&&!!j.is_urgent)||(f.gec&&geciken(j)));
  /* `Ilgili` (PS1.1 §20) = bu kisiyi gercekten baglayan her sey:
     Work'u TAKIP EDIYOR (acik niyet, work_followers), Work'un sahibi,
     ya da uzerinde acik bir aksiyonu var. "Sorumlu" degil - kimseye is
     atanmis olmasi gerekmiyor. */
  const aid=coordAsgId(D,f);
  if(aid){ const fol=D.followers||{};
    list=list.filter(j=>(fol[j.id]&&fol[j.id].includes(aid))||j.assignee_id===aid||
      (D.ents||[]).some(e=>e.job_id===j.id&&e.assignee_id===aid&&e.action_status==='open')); }
  if(f.q){ const t=f.q.toLocaleLowerCase('tr');
    list=list.filter(j=>[j.title,j.note,D.cm[j.customer_id]]
      .some(v=>String(v||'').toLocaleLowerCase('tr').includes(t))); }
  return list;
}
/* 'me' -> oturum sahibi, '' -> herkes, aksi halde team.id */
function coordAsgId(D,f){
  if(!f.ilgili) return 0;
  return f.ilgili==='me'?(D.benim||0):(+f.ilgili||0);
}

/* ---- sekme çubuğu + paylaşılan filtre kartı ---- */
function coordTabBar(tab,D){
  const say={liste:coordSuz(D,isFiltre()).length};
  return `<div class="ws-switch inline" role="group" aria-label="İşler görünümü">
    ${ISTABS.map(([k,l])=>`<button type="button" class="${tab===k?'on':''}" aria-pressed="${tab===k}"
      onclick="isTabGit('${k}')">${esc(l)}${say[k]?` <span class="tabn mono">${say[k]}</span>`:''}</button>`).join('')}
  </div>`;
}
/* Denetim kartı: kontroller aktif sekmeye göre görünür. Dört ayrı filtre
   uygulaması yerine tek yer (§10). */
function coordFiltreKart(tab,D,f){
  const orgSec=(D.jobs||[]).reduce((a,j)=>{ if(j.customer_id&&!a.includes(j.customer_id))a.push(j.customer_id); return a; },[])
    .map(id=>[id,D.cm[id]||('#'+id)]).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'tr'));
  /* PS1.1 §20: kisi listesi TUM workspace uyelerini icerir, oturum
     sahibi dahil - "Bana Dusenler" gibi kisiye sabitlenmis bir kisayol
     degil, secilebilir bir filtre. */
  const kisiSec=(D.team||[]).filter(t=>t.active!==false);
  const arsiv=f.life.length===1&&f.life[0]==='kapandi';
  const gosterFaz=tab==='liste';
  const gosterLife=tab==='pano'||tab==='liste';
  const gosterOrg=tab!=='takvim';
  const gosterAra=tab!=='takvim';
  return `<div class="sec-card">
    <div class="coord-f">
      ${gosterAra?`<div class="field"><label class="flabel" for="isQ">Ara</label>
        <input class="inp" id="isQ" value="${esc(f.q)}" placeholder="Başlık, not, kurum" oninput="isFiltreDegis()"></div>`:''}
      ${gosterOrg?`<div class="field"><label class="flabel" for="isOrg">Kurum</label>
        <select class="inp" id="isOrg" data-ara onchange="isFiltreDegis()"><option value="">Tümü</option>
          ${orgSec.map(([id,ad])=>`<option value="${id}" ${String(f.org)===String(id)?'selected':''}>${esc(ad)}</option>`).join('')}
        </select></div>`:''}
      ${gosterFaz?`<div class="field"><label class="flabel" for="isPhase">Aşama</label>
        <select class="inp" id="isPhase" onchange="isFiltreDegis()"><option value="">Tümü</option>
          ${JOBST.map(([st,lbl])=>`<option value="${st}" ${f.phase===st?'selected':''}>${esc(lbl)}</option>`).join('')}
        </select></div>`:''}
      <div class="field"><label class="flabel" for="isIlgili">${tab==='takvim'?'Kimin takvimi':'İlgili'}</label>
        <select class="inp ${f.ilgili?'inp-on':''}" id="isIlgili" onchange="isFiltreDegis()">
          <option value="" ${f.ilgili===''?'selected':''}>${tab==='takvim'?'Tüm ekip':'Herkes'}</option>
          <option value="me" ${f.ilgili==='me'?'selected':''}>Ben</option>
          ${kisiSec.map(t=>`<option value="${t.id}" ${String(f.ilgili)===String(t.id)?'selected':''}>${esc(t.name)}</option>`).join('')}
        </select></div>
    </div>
    ${gosterLife?`<div class="coord-f2">
      <div role="group" aria-label="Kapsam" class="ws-switch inline">
        <button type="button" class="${!arsiv?'on':''}" aria-pressed="${!arsiv}" onclick="isKapsam('aktif')">Aktif</button>
        <button type="button" class="${arsiv?'on':''}" aria-pressed="${arsiv}" onclick="isKapsam('arsiv')">Arşiv</button>
      </div>
      <button type="button" class="pf-t ${f.acil?'on':''}" aria-pressed="${f.acil}"
        title="Acil işaretli işler (Geciken ile birlikte: acil veya geciken)"
        onclick="isFiltre2({acil:${!f.acil}})">⚡ Acil</button>
      <button type="button" class="pf-t ${f.gec?'on':''}" aria-pressed="${f.gec}"
        title="Termini geçmiş açık aksiyonu olan işler (Acil ile birlikte: acil veya geciken)"
        onclick="isFiltre2({gec:${!f.gec}})">⚠ Geciken</button>
      <span class="fhint" style="margin-left:auto">Aktif = açık + bekliyor</span>
    </div>`:''}
  </div>
  ${isFiltreBanner(tab,D,f)}`;
}
/* PS1.1 §8: secili filtre ASLA sessiz kalmaz. Panelim'den filtreli bir
   kisayolla gelen kullanici, varsayilan sirket gorunumune baktigini
   sanmamalidir. Ozet + tek tiklik Temizle. */
function isFiltreBanner(tab,D,f){
  const arsiv=f.life.length===1&&f.life[0]==='kapandi';
  const p=[];
  if(f.q)      p.push(`Ara: “${esc(f.q)}”`);
  if(f.org)    p.push('Kurum: '+esc(D.cm[f.org]||('#'+f.org)));
  if(f.phase)  p.push('Aşama: '+esc((JOBST.find(x=>x[0]===f.phase)||[,f.phase])[1]));
  if(f.ilgili){ const id=coordAsgId(D,f);
    p.push('İlgili: '+esc((D.tm&&D.tm[id])||(f.ilgili==='me'?'Ben':'#'+f.ilgili))); }
  /* Seritteki ` · ` VE demektir; ikili birlikteyse VEYA oldugu acik
     yazilir - sentetik bir "Dikkat" etiketi uretilmez. */
  if(f.acil&&f.gec) p.push('Acil veya Geciken');
  else if(f.acil)   p.push('Acil');
  else if(f.gec)    p.push('Geciken');
  if(arsiv)    p.push('Arşiv');
  if(!p.length) return '';
  return `<div class="afilt">
    <span class="afilt-l">Aktif filtre</span>
    <span class="afilt-v">${p.join(' · ')}</span>
    <button type="button" class="afilt-x" onclick="isFiltreSifirla()">Temizle ✕</button></div>`;
}
function isKapsam(v){ isFiltre2({life:v==='arsiv'?['kapandi']:['acik','bekliyor']}); }
function isFiltre2(patch){ isFiltreYaz({...isFiltre(),...patch}); renderSection(); }

function isFiltreDegis(){
  const f=isFiltre();
  const el=id=>document.getElementById(id);
  isFiltreYaz({...f,
    q:gv('isQ')||'',
    org:el('isOrg')?(gv('isOrg')||''):f.org,
    phase:el('isPhase')?(gv('isPhase')||''):f.phase,
    ilgili:el('isIlgili')?gv('isIlgili'):f.ilgili});
  canliArama('isQ',renderSection);
}
function isFiltreSifirla(){ isFiltreYaz({...ISF_DEF}); renderSection(); }

/* ---- HUB: tek rota, dört görünüm ---- */
async function isTakibi(c){
  const tab=isTab();
  const D=await coordVeri();
  ui._coord=D; ui._acikAks=D.acikAks;          /* mevcut okuyucular korunur */
  const f=isFiltre();
  const ust={pano:['Pano','oklar yeni aşamayı iş ekranında onaya sunar'],
             liste:['Liste','işler tek tabloda — sıralanabilir, filtrelenebilir'],
             takvim:['Takvim','son tarihler ve baskı/montaj planları']}[tab];
  c.innerHTML=`<div class="sec-head">
      <div><h3>İşler <span class="muted" style="font-weight:500">· ${esc(ust[0])}</span></h3>
        <p class="sub" id="coordSub">${esc(ust[1])}</p></div>
      <div style="display:flex;gap:8px">
        ${tab==='liste'?`<button class="btn btn-outline btn-sm" onclick="isListeExport()">${ic('download',15)} Excel'e Aktar</button>`:''}
        <button class="btn btn-sm act act-work" onclick="jobForm()">${ic('plus',15)} Yeni İş</button></div></div>
    ${coordKisayol('is-takibi')}
    ${coordTabBar(tab,D)}
    ${tab==='takvim'?'':coordFiltreKart(tab,D,f)}
    <div id="coordBody"></div>`;
  const box=document.getElementById('coordBody');
  if(tab==='liste')       isListe(box,D,f);
  else if(tab==='takvim') await isTakvim(box,D,f);
  else                    isPano(box,D,f);
}

/* ============ PANO — canonical faz panosu (07 §5, korunur) ============ */
function isPano(box,D,f){
  const list=coordSuz(D,f,{faziAtla:true});
  const cols=JOBST.map(([st,lbl],idx)=>{
    const kol=list.filter(j=>(j.status||'temas_takip')===st);
    const items=kol.map(j=>{
      const ls=j.lifecycle_status||'acik';
      const aks=D.acikAks[j.id]||0;
      return `<article class="kcard" style="cursor:pointer" onclick="workAc(${j.id})">
      <div class="kc-t">${j.is_urgent?'<span class="pu-b acil" title="Acil">⚡</span> ':''}${esc(j.title)}${j.assignee_id?ekipRozet(j.assignee_id):''}</div>
      <div class="kc-m">${ls!=='acik'?`<span class="pill">${esc(LIFELBL[ls])}</span> `:''}${aks?`<span class="pill" title="Açık aksiyon">${aks} aksiyon</span> `:''}${esc(D.cm[j.customer_id]||j.note||'')}</div>
      <div class="kc-a" onclick="event.stopPropagation()">
        ${idx>0?`<button title="Aşamayı öner: ${esc(JOBST[idx-1][1])} (iş ekranında Kaydet ile uygulanır)" onclick="jobMove(${j.id},'${JOBST[idx-1][0]}')">${ic('left',15)}</button>`:'<span></span>'}
        ${idx<JOBST.length-1?`<button title="Aşamayı öner: ${esc(JOBST[idx+1][1])} (iş ekranında Kaydet ile uygulanır)" onclick="jobMove(${j.id},'${JOBST[idx+1][0]}')">${ic('right',15)}</button>`:'<span></span>'}
        <button title="Güncelleme ekle" onclick="qcAc({jobId:${j.id}})">${ic('notes',15)}</button>
        <button title="Aç" onclick="workAc(${j.id})">${ic('pages',15)}</button>
        ${isAdmin()?`<button class="del" title="Sil" onclick="jobDelete(${j.id})">${ic('trash',15)}</button>`:'<span></span>'}
      </div></article>`;}).join('');
    return `<section class="kcol ${JOBC[st]||'slate'}">
      <header class="kcol-h"><span class="kdot"></span><h4>${esc(lbl)}</h4><span class="kcount mono">${kol.length}</span></header>
      <div class="kcol-b">${items||'<p class="kempty">Kayıt yok</p>'}</div>
      <button class="kadd" onclick="jobForm('${st}')">${ic('plus',14)} Ekle</button>
    </section>`;}).join('');
  const sub=document.getElementById('coordSub');
  if(sub) sub.textContent=`${list.length} iş gösteriliyor · oklar yeni aşamayı iş ekranında onaya sunar`;
  box.innerHTML=`<div class="kanban">${cols}</div>`;
}

/* ============ LİSTE — operasyonel tablo (audit §6 İş Takip) ============
   Aynı `jobs` satırları; ikinci bir Work modeli değil. Sıralama tıklanan
   başlıkla değişir, oturumda korunur. */
function isListeSira(){ try{ return JSON.parse(sessionStorage.getItem('mp_is_sira')||'null')||{k:'akt',d:-1}; }catch(e){ return {k:'akt',d:-1}; } }
async function isListeSiraSet(k){
  const s=isListeSira();
  const klavye=document.activeElement&&document.activeElement.classList.contains('th-srt');
  isListeYaz(s.k===k?{k,d:-s.d}:{k,d:k==='title'||k==='org'?1:-1});
  await renderSection();
  /* S13: yeniden çizimden sonra klavye odağı aynı sütun düğmesine döner. */
  if(klavye){ const b=document.querySelector(`button.th-srt[data-srt="${k}"]`); if(b) b.focus(); }
}
function isListeYaz(s){ try{ sessionStorage.setItem('mp_is_sira',JSON.stringify(s)); }catch(e){} }

function isListeRows(D,f){
  const s=isListeSira();
  const rows=coordSuz(D,f).map(j=>{
    const nx=D.sonraki[j.id]||null;
    const kisi=D.ktm[j.primary_contact_id]||null;
    /* S2 §3: `İlgili` = bu işi TAKİP EDEN ekip üyeleri. Tek bir
       `jobs.assignee_id` sahibi değil. Takip eden yoksa ve iş sahibi
       doluysa onu ikincil bağlam olarak gösteririz — ama "Sahip"
       başlığıyla birincil koordinasyon kavramı olarak DEĞİL. */
    const folIds=(D.followers&&D.followers[j.id])||[];
    const folAd=folIds.map(t=>D.tm[t]).filter(Boolean);
    return {j, org:D.cm[j.customer_id]||'', kisi, nx, folAd,
            akt:D.sonAkt[j.id]||'', aks:D.acikAks[j.id]||0,
            due:nx&&nx.due_at?String(nx.due_at).slice(0,10):''};
  });
  const key={title:r=>String(r.j.title||'').toLocaleLowerCase('tr'),
             org:r=>String(r.org||'').toLocaleLowerCase('tr'),
             phase:r=>JOBST.findIndex(x=>x[0]===(r.j.status||'temas_takip')),
             life:r=>String(r.j.lifecycle_status||'acik'),
             ilgili:r=>String(r.folAd[0]||'zzz').toLocaleLowerCase('tr'),
             akt:r=>r.akt||'',
             due:r=>r.due||'9999-99-99'}[s.k]||(r=>r.akt||'');
  /* Boş değer (kurumsuz iş, sahipsiz, hareketsiz) yön ne olursa olsun
     EN SONA gider; aksi halde artan sıralamada listenin başını doldurur. */
  rows.sort((a,b)=>{ const x=key(a),y=key(b);
    const bx=(x===''||x==null), by=(y===''||y==null);
    if(bx!==by) return bx?1:-1;
    return (x<y?-1:x>y?1:0)*s.d || a.j.id-b.j.id; });
  return rows;
}
function isListe(box,D,f){
  const rows=isListeRows(D,f);
  const s=isListeSira();
  /* S13: sıralama klavyeyle de yapılabilir (başlıktaki gerçek düğme) ve
     ekran okuyucuya yönü söylenir (aria-sort). */
  const th=(k,l,w)=>`<th class="srt${s.k===k?' on':''}" ${w?`style="width:${w}"`:''}
    aria-sort="${s.k===k?(s.d>0?'ascending':'descending'):'none'}"><button type="button" class="th-srt" data-srt="${k}"
    onclick="isListeSiraSet('${k}')" title="${esc(l)} sütununa göre sırala">${esc(l)}<i aria-hidden="true">${s.k===k?(s.d>0?'▲':'▼'):''}</i></button></th>`;
  const body=rows.map(r=>{
    const j=r.j, ls=j.lifecycle_status||'acik';
    const nx=r.nx, gec=nx&&nx.due_at&&gecikti(nx.due_at);
    const yas=coordGunFark(r.akt);
    return `<tr onclick="workAc(${j.id})">
      <td><div class="lz-t">${esc(j.title)}</div>${j.note?`<div class="lz-s">${esc(String(j.note).slice(0,60))}</div>`:''}</td>
      <td>${r.org?`<div class="lz-o" title="${esc(r.org)}">${esc(r.org)}</div>`:'<span class="muted">—</span>'}
          ${r.kisi?`<div class="lz-s">${esc(r.kisi.name)}</div>`:''}</td>
      <td><span class="ph ${JOBC[j.status]||'slate'}">${esc(JOBLBL[j.status]||j.status)}</span></td>
      <td>${ls==='acik'?'<span class="muted">Açık</span>'
            :`<span class="pill ${ls==='bekliyor'?'sand':''}">${esc(LIFELBL[ls])}</span>`}
          ${j.closed_reason?`<div class="lz-s">${esc(CLOSELBL[j.closed_reason]||j.closed_reason)}</div>`:''}</td>
      <td>${r.folAd.length
            ? `<div class="lz-t">${esc(r.folAd[0])}</div>${r.folAd.length>1?`<div class="lz-s">+${r.folAd.length-1} kişi</div>`:''}`
            : '<span class="muted">—</span>'}</td>
      <td class="mono dim">${r.akt?`${esc(trTarih(r.akt))}<div class="lz-s">${esc(coordYas(r.akt))}${yas>=21?' <span class="lz-old" title="Uzun süre hareket yok">durgun</span>':''}</div>`:'<span class="muted">—</span>'}</td>
      <td>${nx?`<div class="lz-t">${esc(String(nx.body).slice(0,58))}</div>
            <div class="lz-s">${nx.due_at?(gec?`<span class="lz-late">⚠ gecikti · ${esc(trTarih(nx.due_at))}</span>`:esc(trTarih(nx.due_at))):'tarihsiz'}${nx.assignee_id?' · '+esc(D.tm[nx.assignee_id]||''):''}</div>`
          :(r.aks?`<span class="muted">${r.aks} açık aksiyon</span>`:'<span class="muted">—</span>')}</td>
    </tr>`;}).join('');
  const sub=document.getElementById('coordSub');
  if(sub) sub.textContent=`${rows.length} iş · satıra tıklayarak işi açın`;
  box.innerHTML=rows.length?`<div class="sec-card pad0"><div class="tbl-wrap">
      <table class="tbl rowlink lz"><thead><tr>
        ${th('title','İş')}${th('org','Kurum')}${th('phase','Aşama','110px')}
        ${th('life','Durum','96px')}${th('ilgili','İlgili','110px')}
        ${th('akt','Son hareket','116px')}${th('due','Sıradaki aksiyon')}
      </tr></thead><tbody>${body}</tbody></table></div></div>`
    :`<div class="sec-card"><p class="empty">Bu filtreye uyan iş yok.
       <button class="btn-link" onclick="isFiltreSifirla()">Filtreyi sıfırla</button></p></div>`;
}
async function isListeExport(){
  const D=ui._coord; if(!D) return;
  const f0=isFiltre();
  const rows=isListeRows(D,f0);
  const arsiv=f0.life.length===1&&f0.life[0]==='kapandi';
  const ilgiliAd=f0.ilgili?(D.tm[coordAsgId(D,f0)]||String(f0.ilgili)):'Herkes';
  const meta=[
    ['Kapsam', arsiv?'Arşiv (kapandı)':'Aktif (açık + bekliyor)'],
    ['Kurum filtresi', f0.org?(D.cm[f0.org]||('#'+f0.org)):'Tümü'],
    ['Aşama filtresi', f0.phase?((JOBST.find(x=>x[0]===f0.phase)||[,f0.phase])[1]):'Tümü'],
    ['İlgili filtresi', ilgiliAd],
    ['Acil', f0.acil?'Yalnız acil':'Tümü'],
    ['Arama', f0.q||'—']];
  await exportRows('medyapark-isler','İşler',[
    {label:'İş',key:'t',w:40,get:r=>r.j.title},
    {label:'Kurum',key:'o',w:40,get:r=>r.org},
    {label:'Kişi',w:20,get:r=>r.kisi?r.kisi.name:''},
    {label:'Aşama',w:16,get:r=>JOBLBL[r.j.status]||r.j.status},
    {label:'Durum',w:12,get:r=>LIFELBL[r.j.lifecycle_status||'acik']},
    {label:'Kapanış nedeni',w:18,get:r=>r.j.closed_reason?(CLOSELBL[r.j.closed_reason]||r.j.closed_reason):''},
    {label:'İlgili',w:22,get:r=>r.folAd.join(', ')},
    {label:'İş sahibi',w:18,get:r=>D.tm[r.j.assignee_id]||''},
    {label:'Son hareket',w:14,get:r=>r.akt?String(r.akt).slice(0,10):''},
    {label:'Açık aksiyon',w:12,get:r=>r.aks},
    {label:'Sıradaki aksiyon',w:44,get:r=>r.nx?r.nx.body:''},
    {label:'Termin',w:14,get:r=>r.due},
    {label:'Aksiyon sahibi',w:18,get:r=>r.nx?(D.tm[r.nx.assignee_id]||''):''},
    {label:'Sözleşme',w:12,get:r=>({missing:'Eksik',pending:'Bekleniyor',signed:'İmzalı'})[r.j.contract_status]||''},
    {label:'Muhasebe',w:12,get:r=>({yok:'Yok',hazir:'Hazır',gonderildi:'Gönderildi',islendi:'İşlendi'})[r.j.accounting_status]||''}
  ],rows,meta);
}

/* TAKİPLERİM ve BEKLEYENLER renderer'ları PS1.1 §18 ile kaldırıldı.
   İkisi de birincil sekme olmaktan çıktı; kişisel değerleri Panelim'e
   taşındı (kronolojik akış + Dikkat Gerekenler + Takip Ettiğim İşler),
   şirket geneli "bekliyor" durumu ise Pano/Liste'de `Aktif` kapsamının
   içinde bir rozet ve `İlgili`/`Acil` filtreleriyle okunur.

   Yalnız bu iki renderer'a hizmet eden iki yardımcı da birlikte
   kaldırıldı, çünkü başka hiçbir yerden çağrılmıyorlardı:
     · coordKova()    → tarih kovası sınıflandırması. Panelim'in ajanda
       ufku farklı (bugün + 7 gün, gecikmişler bugüne toplanır), bu
       yüzden kendi sınıflandırmasını yapıyor.
     · coordBekSira() → C3'ün dikkat sıralaması puanı. Bilinçli olarak
       YENİDEN KULLANILMADI: ağırlıklı olarak "son hareketten bu yana
       geçen gün" üzerine kuruluydu ve PS1.1 §12 dikkat gerekliliğinin
       YAŞTAN çıkarılmasını açıkça yasaklıyor. Formül git geçmişinde ve
       C3 notlarında duruyor.
   İkinci bir Work modeli hiçbir zaman yaratılmadı; `jobs`, `entries` ve
   `work_operations` aynen yerinde. */

/* ============ TAKVİM — zaman katmanı (C4 §4-7) =======================
   Takvim bir KAYIT TÜRÜ DEĞİL, bir görünümdür. Hiçbir calendar_event
   satırı yaratılmaz; iki mevcut structured tarih alanı birleştirilir:

     A. entries.due_at              -> actionable Entry (Takip)
     B. work_operations.planned_date -> Baskı / Montaj / Söküm / Diğer

   Bilinçli olarak DIŞARIDA bırakılanlar (C4 §5):
   - bookings: model ay granülerdir (unit_id, ym). Aylık bir satırı günlük
     operasyon takvimine nokta olarak koymak tarihi olduğundan kesin
     gösterir ve BR-M02'yi bulandırır. Doluluk ekranı zaten doğru yer.
   - jobs.start_day: takvimi doldurmak dışında operasyonel bir soru
     cevaplamıyor; eski `calWidget` tam olarak bunu yapıyordu ve audit
     onu "dekoratif" diye işaretledi.
   - notes / sözleşme alanları: C5'e bırakıldı.
   ===================================================================== */
/* §11: tarihli Entry'nin takvim etiketi `TAKİP` idi ve Work fazi
   terminolojisiyle cakisiyordu. Entry depolamasi/turu DEGISMEDI,
   yalniz kullaniciya gorunen ad. */
const TKV_KAYNAK=[['takip','Güncelleme'],['op','Baskı & Montaj']];

function tkvDurum(){
  try{ return JSON.parse(sessionStorage.getItem('mp_tkv')||'null')||{ay:0,gun:null,kaynak:''}; }
  catch(e){ return {ay:0,gun:null,kaynak:''}; }
}
function tkvYaz(d){ try{ sessionStorage.setItem('mp_tkv',JSON.stringify(d)); }catch(e){} }
function tkvAy(delta){ const d=tkvDurum(); tkvYaz({...d,ay:d.ay+delta,gun:null}); renderSection(); }
function tkvBugun(){ tkvYaz({...tkvDurum(),ay:0,gun:_cIso(new Date())}); renderSection(); }
function tkvGun(g){ tkvYaz({...tkvDurum(),gun:g}); renderSection(); }
function tkvKaynak(k){ tkvYaz({...tkvDurum(),kaynak:k}); renderSection(); }

/* Görünür ay + her iki yöne bir haftalık tampon. Gün başına ya da Work
   başına sorgu YOKTUR: C3'ün coordVeri() turu zaten entries'i getirdi,
   operasyonlar için tek bir aralık okuması eklenir (C4 §23). */
function tkvAralik(ayOfset){
  const b=new Date(); b.setDate(1); b.setMonth(b.getMonth()+ayOfset);
  const bas=new Date(b.getFullYear(),b.getMonth(),1);      bas.setDate(bas.getDate()-7);
  const son=new Date(b.getFullYear(),b.getMonth()+1,0);    son.setDate(son.getDate()+7);
  return [_cIso(bas),_cIso(son),b];
}

/* Her iki kaynağı tek bir olay şekline indirger: {d,tip,...}.
   Kayıtlar KOPYALANMAZ; id'leriyle kendi kaynaklarına geri işaret eder. */
function tkvOlaylar(D,ops,f){
  const ev=[];
  const kim=coordAsgId(D,f);
  /* `İlgili` takvimde de aynı anlama gelir (PS1.1 §20): kişiye atanmış
     olması ŞART değil — Work'ü takip ediyorsa ya da sahibiyse de onun
     takvimidir. Tek toplu follower okumasından gelir, sorgu açmaz. */
  const fol=D.followers||{};
  const bana=(jid,asg)=>!kim || asg===kim ||
    (jid && ((fol[jid]&&fol[jid].includes(kim)) || (D.jm[jid]||{}).assignee_id===kim));
  (D.ents||[]).forEach(e=>{
    if(!e.due_at||!e.action_status) return;
    if(e.action_status==='cancelled') return;
    if(!bana(e.job_id,e.assignee_id)) return;
    const j=e.job_id?D.jm[e.job_id]:null;
    ev.push({d:String(e.due_at).slice(0,10), tip:'takip', id:e.id,
      baslik:e.body, job:j, jobId:e.job_id||null,
      org:j?(D.cm[j.customer_id]||''):(D.cm[e.customer_id]||''),
      custId:e.customer_id||(j?j.customer_id:null),
      kisi:D.tm[e.assignee_id]||'', bitti:e.action_status==='done',
      acil:!!e.is_urgent,
      gec:e.action_status==='open'&&gecikti(e.due_at)});
  });
  (ops||[]).forEach(o=>{
    if(!o.planned_date) return;
    const j=D.jm[o.job_id]||null;
    if(!bana(o.job_id,null)) return;                 /* operasyonda ilgi = Work üzerinden */
    ev.push({d:String(o.planned_date).slice(0,10), tip:'op', id:o.id,
      baslik:o.description||opTypeLbl(o.operation_type), job:j, jobId:o.job_id,
      org:j?(D.cm[j.customer_id]||''):'', custId:j?j.customer_id:null,
      opTip:o.operation_type, durum:o.status,
      yer:(D.um&&D.um[o.unit_id]&&D.um[o.unit_id].name)||o.location_text||'',
      tedarik:D.cm[o.supplier_org_id]||'',
      bitti:o.status==='done', gec:o.planned_date<_cIso(new Date())&&
        ['planned','waiting','in_progress'].includes(o.status)});
  });
  if(f.kaynak) return ev.filter(x=>x.tip===f.kaynak);
  return ev;
}

/* ============ PAYLASILAN AY IZGARASI (S4.3.1 §3) =======================
   Iki takvim var ve VERI KAPSAMLARI farkli, mekanikleri degil:
     - Isler -> Takvim  : paylasilan SIRKET operasyon takvimi
     - Ajandam -> Takvim: KISISEL takvim (kisisel etkinlik + bana ilgili
                          sirket olaylari)
   Izgara, hucre, "+N" tasmasi, bugun/secili isaretleri ve ay gezinmesi
   burada TEK yerde. Cagiran yalniz olay haritasini, gun/ay tiklama
   fonksiyonlarinin adlarini ve olay->sinif eslemesini verir.
   Once bu kod `isTakvim` icine gomuluydu; ikinci bir bagimsiz takvim
   renderer'i kopyalamak yerine parametrelestirildi.
   Ay adlari mevcut global `AY_UZUN`dan okunur (dosyada zaten tanimli). */
function takvimIzgara(o){
  const ilk=new Date(o.y,o.m,1).getDay(), kaydir=(ilk+6)%7, gunSay=new Date(o.y,o.m+1,0).getDate();
  const bugun=_cIso(new Date());
  let hc='';
  for(let i=0;i<kaydir;i++) hc+='<span class="tk-bos"></span>';
  for(let d=1;d<=gunSay;d++){
    const iso=o.y+'-'+pad(o.m+1)+'-'+pad(d);
    const list=o.gunMap[iso]||[];
    /* PS1.1 §21: hucrede okunabilir kompakt olay satirlari; dev kart YOK.
       Yogun gunlerde ilk ikisi gosterilir, gerisi "+N". */
    const goster=list.slice(0,2), kalan=list.length-goster.length;
    hc+=`<button type="button" class="tk-d${iso===bugun?' tk-today':''}${iso===o.secili?' tk-sel':''}${list.length?' tk-has':''}"
      onclick="${o.gunTik}('${iso}')" aria-pressed="${iso===o.secili}"
      aria-label="${d} ${AY_UZUN[o.m]}${list.length?', '+list.length+' kayıt':''}"
      title="${esc(list.map(x=>x.baslik).join(' · '))}">
      <span class="tk-n">${d}${list.length>1?`<em class="tk-c">${list.length}</em>`:''}</span>
      ${list.length?`<span class="tk-evs">
        ${goster.map(x=>`<span class="tk-ev ${o.evSinif(x)}${x.gec?' gec':''}${x.acil?' acil':''}">
            <i></i><b>${esc(String(x.baslik||'').slice(0,26))}</b></span>`).join('')}
        ${kalan>0?`<span class="tk-ev more">+${kalan}</span>`:''}</span>`:''}
    </button>`;
  }
  return `<div class="sec-card tk-wrap">
      <div class="tk-h">
        <div class="tk-nav">
          <button class="btn btn-outline btn-sm" onclick="${o.navOnceki}" title="Önceki ay" aria-label="Önceki ay">‹</button>
          <b>${AY_UZUN[o.m]} ${o.y}</b>
          <button class="btn btn-outline btn-sm" onclick="${o.navSonraki}" title="Sonraki ay" aria-label="Sonraki ay">›</button>
          <button class="btn btn-ghost btn-sm" onclick="${o.navBugun}">Bugün</button>
        </div>
        ${o.sagHtml||''}
      </div>
      <div class="tk-grid tk-head"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>
      <div class="tk-grid">${hc}</div>
      ${o.lejantHtml?`<div class="tk-lgnd">${o.lejantHtml}</div>`:''}
    </div>`;
}

async function isTakvim(box,D,f){
  const st=tkvDurum();
  const [from,to,ayBase]=tkvAralik(st.ay);
  /* TEK aralık okuması — gün başına sorgu yok (C4 §23). */
  const ops=await api(`operations_list&from=${from}&to=${to}&limit=1000`).catch(()=>[]);
  if(!D.um){ const u=await api('units_full').catch(()=>[]); D.um={}; (u||[]).forEach(x=>D.um[x.id]=x); }
  const ev=tkvOlaylar(D,ops,{...f,kaynak:st.kaynak});
  ui._tkvEv=ev;

  const gunMap={}; ev.forEach(e=>(gunMap[e.d]=gunMap[e.d]||[]).push(e));
  const y=ayBase.getFullYear(), m=ayBase.getMonth();
  const bugun=_cIso(new Date());
  const secili=st.gun|| (gunMap[bugun]?bugun:null);

  /* Seçili günün ajandası — "Bugün ne yapmamız gerekiyor?" */
  const gunList=(secili?(gunMap[secili]||[]):[])
    .slice().sort((a,b)=>(a.tip===b.tip?0:(a.tip==='takip'?-1:1)));
  const ajanda=gunList.length?gunList.map(e=>e.tip==='takip'
    ? `<button type="button" class="tk-i" onclick="${e.jobId?`workAc(${e.jobId})`:(e.custId?`orgAc(${e.custId})`:'')}">
         <span class="tk-i-k tk-takip">Günc.</span>
         <span class="tk-i-b"><b>${esc(e.baslik)}</b>
           <em>${e.job?esc(e.job.title):'<i>işe bağlı değil</i>'}${e.org?' · '+esc(e.org):''}${e.kisi?' · '+esc(e.kisi):''}</em></span>
         <span class="tk-i-r">${e.bitti?'<span class="pill">tamam</span>':(e.gec?'<span class="pill clay">gecikti</span>':'')}</span>
       </button>`
    : `<button type="button" class="tk-i" onclick="opForm(${e.id})">
         <span class="tk-i-k tk-op">${esc(opTypeLbl(e.opTip))}</span>
         <span class="tk-i-b"><b>${esc(e.baslik)}</b>
           <em>${e.job?esc(e.job.title):''}${e.org?' · '+esc(e.org):''}${e.yer?' · '+esc(e.yer):''}${e.tedarik?' · '+esc(e.tedarik):''}</em></span>
         <span class="tk-i-r"><span class="badge-st st-${esc(e.durum)}">${esc(opStatLbl(e.durum))}</span></span>
       </button>`).join('')
    : `<p class="empty">${secili?'Bu gün için planlanmış güncelleme veya baskı/montaj yok.':'Bir gün seçin.'}</p>`;

  const sub=document.getElementById('coordSub');
  if(sub) sub.textContent=`${ev.length} kayıt · ${AY_UZUN[m]} ${y} · güncelleme terminleri ve baskı/montaj planları`;

  const izgara=takvimIzgara({y,m,gunMap,secili,
    gunTik:'tkvGun', evSinif:x=>x.tip==='op'?'op':'takip',
    navOnceki:'tkvAy(-1)', navSonraki:'tkvAy(1)', navBugun:'tkvBugun()',
    sagHtml:`<div class="tk-f">
          <div class="ws-switch inline tk-src" role="group" aria-label="Kaynak filtresi">
            <button type="button" class="${!st.kaynak?'on':''}" onclick="tkvKaynak('')">Tümü</button>
            ${TKV_KAYNAK.map(([k,l])=>`<button type="button" class="${st.kaynak===k?'on':''}" onclick="tkvKaynak('${k}')">${esc(l)}</button>`).join('')}
          </div>
          <select class="inp tk-who ${f.ilgili?'inp-on':''}" id="isIlgili" aria-label="Kimin takvimi" onchange="isFiltreDegis()">
            <option value="" ${!f.ilgili?'selected':''}>Tüm ekip</option>
            <option value="me" ${f.ilgili==='me'?'selected':''}>Benim</option>
            ${(D.team||[]).filter(t=>t.active!==false).map(t=>`<option value="${t.id}" ${String(f.ilgili)===String(t.id)?'selected':''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>`,
    /* S4.3 §11 artigi: gosterge hala "Takip" diyordu; kaynak filtresi ve
       rozetler "Günc." olmustu. Ayni dile cekildi. */
    lejantHtml:`<span><i class="tk-p tk-takip"></i> Güncelleme (termin)</span>
        <span><i class="tk-p tk-op"></i> Baskı & Montaj (planlanan)</span>`});

  box.innerHTML=`${izgara}
    <section class="sec-card">
      <div class="sec-head" style="margin-bottom:8px">
        <h4 style="font-size:14px;margin:0">${secili?esc(trTarih(secili)):'Gün'} <span class="chip">${gunList.length}</span></h4>
        ${secili?`<button class="btn btn-outline btn-sm" onclick="qcAc('takip',{})">${ic('plus',15)} Güncelleme</button>`:''}
      </div>
      ${ajanda}
    </section>`;
}

/* ============ GUNCELLEME PAYLAS (PS1.1 §9-11) ======================
   Sprint 1 iki dugmeyi tek forma indirdi ama formu hala UC ayri acilir
   bolume bolmustu (+ Baglam / + Tarih / Sorumlu / + Kime onemli). Urun
   sahibinin gercek UI incelemesi bunun hala "form" gibi durdugunu
   gosterdi: kullanici yazmadan once HANGI bolumu acacagina karar etmek
   zorundaydi.

   Artik acilir bolum YOK. Her sey tek gorunumde:
     · metin alani
     · ekip etiketleri (dogrudan metnin altinda)
     · kompakt istege bagli kontroller: Is/Kurum · Son tarih · Acil
     · Paylas

   SORUMLU ALANI KALDIRILDI (PS1.1 §2.B). Normal kullanici bir
   guncellemenin icinden kimseye is atamaz. Etiketlenen kisiler
   "ilgili/ilgilenen" kisilerdir; guncelleme yine herkese goruniir.
   Arkadaki entries.assignee_id / action_status alanlari uyumluluk icin
   DURUYOR (PS1.1 §31) - yalnizca bu yuzey onlari artik yazmiyor.

   TARIH SEMANTIGI (PS1.1 §2.A):
     · occurred_at = olusturma zamani. Her zaman feed'de gorunur.
     · due_at      = SON TARIH. Yalnizca kullanici acikca secerse yazilir.
   Tarih secilmezse due_at NULL kalir - bugune ayarlanmaz. */

/* `mod` argumani artik anlamsiz; eski cagri sekilleri (qcAc('takip',ctx))
   kirilmasin diye imza toleransi korunuyor. */
/* S4.3 §5 — AYNI composer hem olusturma hem DUZENLEME icin kullanilir.
   Ayri bir duzenleme formu yazilmadi. Duzenlemede baglam KILITLENMEZ
   (yazar Is/Kurum baglamini degistirebilmeli) ve tek bir Entry id
   korunur - "duzenleme = yerine yeni Entry" YAPILMAZ. */
function qcAc(a,b){
  const ctx=(a&&typeof a==='object')?a:(b||{});
  const duz=ctx.entry||null;                 /* duzenlenen Entry (varsa) */
  const D=ui._coord||null;
  const jobs=(D?D.jobs:(ui._jobs||[]))||[];
  const custs=(D?D.custs:(ui._cust||[]))||[];
  const team=(D?D.team:(ui._team||[]))||[];
  const kilitliJob=duz?0:(ctx.jobId||0);
  const kilitliOrg=duz?0:(ctx.custId||0);
  /* PS3 §18: Kişi artık geçerli bir Entry bağlamı. `entries.contact_id`
     Sprint 1'den beri vardı ama Person kimliği oturmadan açılmamıştı.
     ZORUNLU DEĞİL - bir güncelleme hâlâ bağlamsız olabilir. */
  const kilitliKisi=duz?(duz.contact_id||0):(ctx.contactId||0);
  const j=kilitliJob?jobs.find(x=>x.id===kilitliJob):null;
  const orgId=kilitliOrg||(j?j.customer_id:0);
  const cm={}; custs.forEach(x=>cm[x.id]=x.firma);
  const kisiAd=kilitliKisi?((ui._contactMap&&ui._contactMap[kilitliKisi]||{}).name
      ||((ui._person&&ui._person.id===kilitliKisi)?ui._person.name:'')||'Kişi'):'';
  const benim=(ui._me&&ui._me.id)||0;
  /* S6 §29/§32: ekler composer'in parcasi. Duzenlemede mevcut ekler
     gosterilir; yalniz metin degisirse dosyalara DOKUNULMAZ. */
  ekYeni('qc',{mevcut:duz?(duz.document_links||[]).filter(l=>l.documents)
    .map(l=>({link_id:l.id,doc:l.documents})):[]});

  const jobSec=(kilitliOrg&&!kilitliJob)
    ? jobs.filter(x=>String(x.customer_id)===String(kilitliOrg)&&(x.lifecycle_status||'acik')!=='kapandi')
    : jobs.filter(x=>(x.lifecycle_status||'acik')!=='kapandi');

  /* Kilitli baglam bilgi satiridir, secim istemez. */
  const baglam = kilitliJob
    ? `<div class="qc-ctx"><span class="qc-lbl">İş</span>
         <b>${esc(j?j.title:'#'+kilitliJob)}</b>
         ${orgId?`<em>${esc(cm[orgId]||'')}</em>`:''}
         <input type="hidden" id="qcJob" value="${kilitliJob}">
         <input type="hidden" id="qcOrg" data-ara value="${orgId||''}"></div>`
    : kilitliOrg
    ? `<div class="qc-ctx"><span class="qc-lbl">Kurum</span><b>${esc(cm[kilitliOrg]||'')}</b>
         ${kilitliKisi?`<em>${esc(kisiAd)}</em>`:''}
         <input type="hidden" id="qcOrg" data-ara value="${kilitliOrg}"></div>`
    : kilitliKisi
    ? `<div class="qc-ctx"><span class="qc-lbl">Kişi</span><b>${esc(kisiAd)}</b></div>`
    : '';

  /* Is/Kurum secicileri: kilitli baglam yoksa kompakt bir satir olarak
     DOGRUDAN gorunur - acilir bolum degil. Ikisini de bos birakmak
     gecerlidir; kayit sirket guncellemesi olur (PS1 §6). */
  const secici = kilitliJob ? '' : (kilitliOrg
    ? `<div class="qc-line"><label class="qc-mini" for="qcJob">İş</label>
         <select class="inp inp-sm" id="qcJob"><option value="">—</option>
           ${jobSec.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select></div>`
    : `<div class="qc-line">
         <label class="qc-mini" for="qcJob">İş</label>
         <select class="inp inp-sm" id="qcJob" onchange="qcJobDegis()"><option value="">—</option>
           ${jobSec.map(x=>`<option value="${x.id}">${esc(x.title)}</option>`).join('')}</select>
         <label class="qc-mini" for="qcOrg">Kurum</label>
         <select class="inp inp-sm" id="qcOrg" data-ara><option value="">—</option>
           ${custs.slice().sort((a2,b2)=>String(a2.firma||'').localeCompare(String(b2.firma||''),'tr'))
             .map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('')}</select>
       </div>`);

  /* §3/§27: oturum sahibi ARTIK kendini de etiketleyebilir. Onceden
     "kendi guncellemeni zaten biliyorsun" gerekcesiyle listeden
     cikariliyordu; fakat tek zihinsel model `@Kisi` olunca kendini
     isaretlemek mesru bir hatirlatma bicimi. */
  const ekip=team.filter(t=>t.active!==false);
  const secili=new Set(duz?((ui._ilgiMap&&ui._ilgiMap[duz.id])||[]):[]);

  const duzDue=duz&&duz.due_at?String(new Date(duz.due_at).toLocaleDateString('sv-SE')):'';
  modal(`<h3 style="margin:0 0 12px">${duz?'Güncellemeyi düzenle':'Bir güncelleme paylaş…'}</h3>
    <input type="hidden" id="qcId" value="${duz?duz.id:0}">
    ${kilitliKisi?`<input type="hidden" id="qcKisi" value="${kilitliKisi}">`:''}
    ${baglam}
    <div class="field" style="margin-bottom:10px">
      <textarea class="inp" id="qcBody" rows="3" aria-label="Güncelleme metni"
        placeholder="Ne oldu? ör. Müşteri M1'i onayladı, stadyumu almadı."
        onkeydown="qcTus(event)">${duz?esc(duz.body):''}</textarea></div>
    <div class="field" style="margin-bottom:10px">${ekAlan('qc')}</div>

    ${ekip.length?`<div class="qc-tags">
      <span class="qc-mini">İlgili</span>
      ${ekip.map(t=>`<label class="qc-who"><input type="checkbox" class="qcRel" value="${t.id}" ${secili.has(t.id)?'checked':''}>
        <span>${esc(t.name)}${t.id===benim?' (ben)':''}</span></label>`).join('')}
    </div>`:''}

    ${secici}

    <div class="qc-line qc-opt">
      <label class="qc-mini" for="qcDue">Son tarih</label>
      <input class="inp inp-sm" type="date" id="qcDue" style="max-width:170px" value="${esc(duzDue)}">
      <label class="qc-acil"><input type="checkbox" id="qcAcil" ${duz&&duz.is_urgent?'checked':''}><span>⚡ Acil</span></label>
      <span class="fhint" style="margin:0 0 0 auto">Ctrl+Enter ile paylaş</span>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="qcKaydet()">${duz?'Kaydet':'Paylaş'}</button></div>`);
  /* Duzenlemede mevcut Is/Kurum secimini isaretle (secici render sonrasi). */
  if(duz){
    const js=document.getElementById('qcJob'); if(js&&duz.job_id){ js.value=String(duz.job_id); qcJobDegis(); }
    const os=document.getElementById('qcOrg'); if(os&&!duz.job_id&&duz.customer_id) os.value=String(duz.customer_id);
  }
  const t=document.getElementById('qcBody'); if(t)t.focus();
}
function qcTus(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); qcKaydet(); } }

/* ============ Guncelleme satir menusu (S4.3 §4) =====================
   Her satirda kalici Duzenle/Sil dugmeleri ISTENMEDI - akis okunakli
   kalmali. Tek bir `⋯`, yalnizca kendi yazdigin insan guncellemesinde. */
let _puMnu=null;
function puMenuKapat(){
  if(!_puMnu) return;
  _puMnu.remove(); _puMnu=null;
  document.removeEventListener('mousedown',puMenuDis,true);
  document.removeEventListener('keydown',puMenuEsc,true);
}
function puMenuDis(e){ if(_puMnu&&!_puMnu.contains(e.target)) puMenuKapat(); }
function puMenuEsc(e){ if(e.key==='Escape') puMenuKapat(); }
function puMenu(ev,id){
  ev.stopPropagation();
  const acikti=!!_puMnu; puMenuKapat(); if(acikti) return;   /* toggle */
  const b=ev.currentTarget.getBoundingClientRect();
  const d=document.createElement('div');
  d.className='pu-pop'; d.setAttribute('role','menu');
  d.innerHTML=`<button type="button" role="menuitem" onclick="entryDuzenle(${id})">Düzenle</button>
    <button type="button" role="menuitem" class="sil" onclick="entryKaldir(${id})">Sil</button>`;
  document.body.appendChild(d);
  d.style.top=(window.scrollY+b.bottom+5)+'px';
  d.style.left=(window.scrollX+Math.max(8,b.right-d.offsetWidth))+'px';
  _puMnu=d;
  setTimeout(()=>{ document.addEventListener('mousedown',puMenuDis,true);
                   document.addEventListener('keydown',puMenuEsc,true); },0);
}
function entryDuzenle(id){
  puMenuKapat();
  const e=(ui._feedEnt||[]).find(x=>x.id===id)||(ui._workEntries||[]).find(x=>x.id===id);
  if(!e){ toast('Kayıt bulunamadı.'); return; }
  qcAc({entry:e});
}
/* Work zaman cizelgesinden duzenleme: ayni composer. Etiketler Panelim'in
   haritasinda olmayabilir; kaydederken silinmesinler diye once okunur. */
async function entryDuzenleIs(id){
  const r=await guard(()=>api('entry_relevance_all&entry_id='+id),'Güncelleme açılamadı'); if(r===null) return;
  ui._ilgiMap={...(ui._ilgiMap||{}),[id]:(r||[]).map(x=>x.team_id)};
  entryDuzenle(id);
}
/* §7: gercek silme. `entry_relevance.entry_id` zaten ON DELETE CASCADE
   oldugu icin etiket satirlari otomatik gider - yetim kalmaz. Soft-delete
   modeli ACILMADI: `entries` icin repoda boyle bir konvansiyon yok ve
   her okuyucuya `deleted_at is null` filtresi eklemek yeni ve unutulmasi
   kolay bir sizinti yuzeyi yaratirdi. */
async function entryKaldir(id){
  puMenuKapat();
  if(!await mpConfirm('Bu güncelleme kalıcı olarak silinsin mi? Etiketler de kaldırılır; ekli dosyalar Hafıza > Belgeler\'de kalır.',
    'Güncellemeyi Sil')) return;
  const r=await guard(()=>api('entry_delete&id='+id),'Silinemedi'); if(r===null)return;
  toast('Güncelleme silindi.'); renderSection();
}
/* Is secilince kurumu ondan turet ve kilitle. */
function qcJobDegis(){
  const jid=+gv('qcJob'), org=document.getElementById('qcOrg');
  if(!org) return;
  const jobs=((ui._coord&&ui._coord.jobs)||ui._jobs||[]);
  const j=jobs.find(x=>x.id===jid);
  if(j){ org.value=j.customer_id||''; org.disabled=true; }
  else { org.disabled=false; }
}
async function qcKaydet(){
  const body=(gv('qcBody')||'').trim();
  /* S6 §30: metin YA DA en az bir ek. Ikisi de yoksa gecersiz. */
  if(!body&&!ekToplam('qc')){ mpAlert('Bir şey yazın ya da dosya ekleyin.'); return; }
  const jid=+gv('qcJob')||null;
  const oel=document.getElementById('qcOrg');
  const oid=(oel? (+oel.value||null) : null);
  const due=gv('qcDue')||'';
  const acil=!!(document.getElementById('qcAcil')||{}).checked;
  /* Work'e bagliysa kurum Work uzerinden okunur (06 §9). */
  const kisi=+gv('qcKisi')||null;
  const id=+gv('qcId')||0;
  const row={id, body, job_id:jid, customer_id: jid?null:oid, contact_id:kisi, is_urgent:acil};

  /* ---- SON TARIH (S4.3 §8-§10) ----------------------------------
     §8 degismedi: siradan bir guncelleme SIRF bugun yazildi diye
     takvime dusmez; `created_at` bir termin DEGILDIR.

     §9 YENI KURAL: urun sahibi `Acil`i "bugun ilgilenilmeli" diye
     tanimladi. Bu yuzden Acil isaretli ve tarihi BOS birakilmis bir
     guncelleme, kullanicinin YEREL bugun tarihini alir.

     ZAMAN DILIMI: `_cIso(new Date())` yerel takvim gununu verir (UTC'ye
     cevirip gun kaydirmaz), ardindan mevcut konvansiyonla yerel 09:00'a
     sabitlenir - `new Date('YYYY-MM-DDT09:00:00')` yerel saat olarak
     ayristirilir. Yani TR'de 23:30'da Acil isaretlenen bir guncelleme
     yarina degil BUGUNE dusen bir termin alir.

     §9: acikca secilmis tarih HER ZAMAN kazanir; Acil onu EZMEZ.
     §10: Acil sonradan kaldirilirsa termin SESSIZCE SILINMEZ -
     kullanici tarihi acikca temizleyebilir. Otomatik-mi-elle-mi
     ayrimi icin ayri bir provenance alani ACILMADI (§10). */
  const etkinDue=due||(acil?_cIso(new Date()):'');
  if(etkinDue){
    row.due_at=new Date(etkinDue+'T09:00:00').toISOString();
    if(!id) row.action_status='open';
  } else if(id){
    row.due_at=null;                 /* duzenlemede tarih acikca silindi */
  }
  row._ilgili=Array.from(document.querySelectorAll('.qcRel:checked')).map(x=>+x.value);
  modalBusy(true);
  let r=null;
  if(!id&&ekBekleyen('qc').length){
    /* S6 §31: once dosyalar yuklenir; Entry + etiketler + belgeler TEK
       veritabani isleminde yazilir. Yukleme ya da kayit basarisizsa bos
       ya da yarim bir guncelleme OLUSMAZ; dosyalar temizlenir. */
    if(!await ekYukle('qc')){ modalBusy(false);
      mpAlert('Bazı dosyalar yüklenemedi. “Tekrar dene” ile yeniden deneyin ya da çıkarın.','Dosya'); return; }
    const docs=ekGovde('qc',[]).map(d=>{ const x={...d}; delete x.links; return x; });
    try{ r=await api('entry_create_docs',{entry:row,ilgili:row._ilgili,docs}); }
    catch(err){ await ekGeriAl('qc','Kaydedilemedi.'); modalBusy(false);
      mpAlert((err&&err.message)||String(err),'Kayıt oluşturulamadı'); return; }
    ekBekleyen('qc').forEach(i=>{ i.kaydedildi=true; });
  } else {
    r=await guard(()=>api('entry_save',row),id?'Güncelleme kaydedilemedi':'Kayıt oluşturulamadı');
    if(r===null){ modalBusy(false); return; }
    if(id){
      /* Ayni Entry id: yeni ekler baglanir, kaldirilanlar cozulur. Siralama
         onemli - ekleme once, kaldirma sonra; boylece "fotografi degistir"
         hicbir an bos bir guncelleme birakmaz. */
      const g=await ekGonder('qc',[{entry_id:id}]);
      if(!g.ok){ modalBusy(false);
        if(g.sessiz) toast('Metin kaydedildi; dosya henüz eklenmedi.');
        else mpAlert('Metin kaydedildi, ancak dosya eklenemedi: '+g.hata+' — Kaydet ile tekrar deneyin.','Dosya'); return; }
      const e=EK.qc, kal=e?[...e.kaldir]:[];
      if(kal.length){
        try{ const rr=await belgeBagKaldir(kal);
          e.mevcut=e.mevcut.filter(m=>!e.kaldir.has(m.link_id)); e.kaldir.clear();
          if(rr.eksik) toast(rr.eksik+' ek kaldırılamadı (yetki).'); }
        catch(err){ modalBusy(false); mpAlert((err&&err.message)||String(err),'Ek kaldırılamadı'); return; }
      }
    }
  }
  modalBusy(false);
  closeModal();
  toast(id?'Güncelleme düzenlendi.'
          :(etkinDue?(due?'Güncelleme paylaşıldı — son tarih eklendi.'
                         :'Güncelleme paylaşıldı — Acil olduğu için bugüne işaretlendi.')
                   :'Güncelleme paylaşıldı.'));
  /* Ayni Entry; nereden bakildigina gore farkli gorunum (BR-V01).
     S6: Work/Kurum detayindan acildiysa o detayda kalinir. */
  ekranTazele();
}

/* ============ MUHASEBEYE GİDECEKLER (C4 §18-20) ======================
   Work üzerindeki mevcut accounting_* alanları üzerinde paylaşılan bir
   KUYRUK görünümü. Muhasebe tablosu, defter, fatura ekranı YOKTUR
   (01 §14, 06 §26). Medyapark bir cari/muhasebe sistemi değildir;
   burada yalnız "hangi iş muhasebeye gitmeye hazır" sorusu cevaplanır. */
/* Kanonik `jobs.accounting_status` sozlugu AYNEN korunur - CHECK
   kisiti tam olarak bunlari kabul eder (yok|hazir|gonderildi|islendi).
   Paralel bir durum kumesi UYDURULMAZ (§7). S5.1 §15: uygulama genelinde
   TEK etiket `Yok` (Raporlar, Work Detail, disa aktarim ile ayni);
   depolanan deger hala 'yok'. */
const ACCST=[['hazir','Hazır'],['gonderildi','Gönderildi'],['islendi','İşlendi'],['yok','Yok']];
const accLbl=v=>(ACCST.find(x=>x[0]===v)||[null,v])[1];
const ACC_CLS={hazir:'sand',gonderildi:'teal',islendi:'',yok:''};

/* §7: varsayilan artik tek bir durum dilimi DEGIL. Yalniz `Hazır`
   gostermek "muhasebeye gidecek olanlar" sorusunu cevapliyordu ama
   "bu isin muhasebesi ne durumda?" sorusunu cevaplayamiyordu -
   kullanici once tum kumeyi gorup sonra daraltabilmeli. */
function accFiltre(){
  let f; try{ f=JSON.parse(sessionStorage.getItem('mp_acc')||'null'); }catch(e){ f=null; }
  f={st:'tumu',q:'',...(f||{})};
  if(f.st!=='tumu'&&!ACCST.some(x=>x[0]===f.st)) f.st='tumu';
  return f;
}
function accYaz(f){ try{ sessionStorage.setItem('mp_acc',JSON.stringify(f)); }catch(e){} }
function accSekme(st){ accYaz({...accFiltre(),st}); renderSection(); }
/* Ayni renderer kalibi (§25). */
function accAra(){ accYaz({...accFiltre(),q:gv('accQ')||''}); canliArama('accQ',renderSection); }

async function muhasebe(c){
  const f=accFiltre();
  const [jobs,custs,team,parties]=await Promise.all([
    api('jobs_list'), api('customers_list'), api('team_list'),
    api('work_parties_all').catch(()=>[])]);
  ui._jobs=jobs||[]; ui._cust=custs||[]; ui._team=team||[];
  const cm={}; (custs||[]).forEach(x=>cm[x.id]=x.firma);
  const tm={}; (team||[]).forEach(t=>tm[t.id]=t.name);
  /* bill_to tarafı varsa fatura kurumu odur (06 §15). */
  const billTo={}; (parties||[]).forEach(p=>{ if(p.role==='bill_to'&&p.customer_id) billTo[p.job_id]=p.customer_id; });
  ui._accCm=cm;

  const say={}; ACCST.forEach(([k])=>say[k]=(jobs||[]).filter(j=>(j.accounting_status||'yok')===k).length);
  say.tumu=(jobs||[]).length;
  let list=f.st==='tumu'?(jobs||[]).slice():(jobs||[]).filter(j=>(j.accounting_status||'yok')===f.st);
  if(f.q){ const t=f.q.toLocaleLowerCase('tr');
    list=list.filter(j=>[j.title,cm[j.customer_id],j.accounting_note]
      .some(v=>String(v||'').toLocaleLowerCase('tr').includes(t))); }
  /* Tumu gorunumunde duz tarih siralamasi 'Yok' yigininin altina
     dikkat gerektirenleri gomerdi. Devir sirasi: Hazır -> Gönderildi ->
     Yok -> İşlendi (biten en sonda), icinde tarihe gore. */
  const ACC_SIRA={hazir:0,gonderildi:1,yok:2,islendi:3};
  list.sort((a,b)=>
    (f.st==='tumu'
      ? (ACC_SIRA[a.accounting_status||'yok']-ACC_SIRA[b.accounting_status||'yok'])
      : 0)
    || String(b.accounting_sent_at||b.end_day||'').localeCompare(String(a.accounting_sent_at||a.end_day||''))
    || (b.id-a.id));

  const satir=j=>{
    const fatura=billTo[j.id]&&billTo[j.id]!==j.customer_id?cm[billTo[j.id]]:null;
    const ast=j.accounting_status||'yok';
    return `<tr onclick="workAc(${j.id})">
      <td><div class="lz-t">${esc(j.title)}</div>
          <div class="lz-s">${esc(JOBLBL[j.status]||j.status)} · ${esc(LIFELBL[j.lifecycle_status||'acik'])}</div></td>
      <td><div class="lz-o" title="${esc(cm[j.customer_id]||'')}">${esc(orgKisa(cm[j.customer_id]||'')||'—')}</div>
          ${fatura?`<div class="lz-s">Fatura: ${esc(orgKisa(fatura))}</div>`:''}</td>
      ${/* §7/§8: `Tümü` varsayilan olunca durum artik ortulu degil -
           satirda YAZMALI, yoksa hangi isin nerede oldugu okunmaz. */''}
      <td><span class="pill ${esc(ACC_CLS[ast]||'')}">${esc(accLbl(ast))}</span></td>
      <td class="mono">${j.accounting_amount!=null?esc(money(j.accounting_amount)):'<span class="muted">—</span>'}</td>
      <td>${j.contract_status==='signed'?'<span class="pill">İmzalı</span>'
           :j.contract_status==='pending'?'<span class="pill sand">Bekleniyor</span>'
           :'<span class="pill clay">Eksik</span>'}</td>
      <td class="mono dim">${j.accounting_sent_at?esc(trTarih(j.accounting_sent_at)):''}
          ${j.accounting_processed_at?`<div class="lz-s">işlendi ${esc(trTarih(j.accounting_processed_at))}</div>`:''}</td>
      <td>${esc(j.accounting_note||'')}</td>
      <td class="acc-a" onclick="event.stopPropagation()">${accAksiyon(j)}
        <button class="btn btn-ghost btn-sm" onclick="accDuzenle(${j.id})"
          title="Tutar, not ve durumu düzenle">Düzenle</button></td>
    </tr>`;};

  c.innerHTML=`<div class="sec-head">
      <div><h3>Muhasebeye Gidecekler</h3>
        <p class="sub" id="accSub">${list.length} iş · ${f.st==='tumu'?'tüm işler':esc(accLbl(f.st))} · muhasebe devri, cari sistem değil</p></div>
      <button class="btn btn-outline btn-sm" onclick="accExport()">${ic('download',15)} Excel'e Aktar</button></div>
    ${coordKisayol('muhasebe')}
    <div class="ws-switch inline" role="group" aria-label="Muhasebe durumu">
      ${[['tumu','Tümü']].concat(ACCST).map(([k,l])=>`<button type="button" class="${f.st===k?'on':''}" aria-pressed="${f.st===k}"
        onclick="accSekme('${k}')">${esc(l)}${say[k]?` <span class="tabn mono">${say[k]}</span>`:''}</button>`).join('')}
    </div>
    <div class="sec-card">
      <div class="coord-f">
        <div class="field"><label class="flabel" for="accQ">Ara</label>
          <input class="inp" id="accQ" value="${esc(f.q)}" placeholder="İş, kurum, not" oninput="accAra()"></div>
      </div>
    </div>
    ${list.length?`<div class="sec-card pad0"><div class="tbl-wrap">
      <table class="tbl rowlink lz"><thead><tr>
        <th>İş</th><th>Kurum</th><th>Muhasebe</th><th>Tutar</th><th>Sözleşme</th><th>Tarih</th><th>Not</th><th>İşlem</th>
      </tr></thead><tbody>${list.map(satir).join('')}</tbody></table></div></div>`
    :`<div class="sec-card"><p class="empty">${f.st==='hazir'
        ? 'Muhasebeye gitmeye hazır iş yok.'
        : f.st==='tumu' ? 'Henüz iş kaydı yok.' : 'Bu durumda iş yok.'}</p></div>`}`;
  ui._accList=list;
}
/* İleri yönlü devir. Geri alma yalnız admin'de: kayıt düzeltme yetkisi
   mevcut Work formunda zaten var, burada rijit bir workflow motoru
   kurulmaz (C4 §20). */
function accAksiyon(j){
  const s=j.accounting_status||'yok';
  if(s==='yok')        return `<button class="btn btn-outline btn-sm" onclick="accDurum(${j.id},'hazir')">Hazır işaretle</button>`;
  if(s==='hazir')      return `<button class="btn btn-primary btn-sm" onclick="accDurum(${j.id},'gonderildi')">Gönderildi</button>`;
  if(s==='gonderildi') return `<button class="btn btn-primary btn-sm" onclick="accDurum(${j.id},'islendi')">İşlendi</button>`;
  return `<span class="muted">tamamlandı</span>${isAdmin()?` <button class="btn btn-ghost btn-sm" onclick="accDurum(${j.id},'gonderildi')">geri al</button>`:''}`;
}
async function accDurum(id,yeni){
  const j=(ui._jobs||[]).find(x=>x.id===id)||{};
  /* Zaman damgaları tutarlı yazılır; kullanıcıdan tekrar istenmez (BR-E03).
     Yazar TEK: `accZaman` - modal yolu da aynısını kullanır. */
  const body={id, accounting_status:yeni, ...accZaman(j,yeni,'')};
  const r=await guard(()=>api('job_save',body),'Muhasebe durumu güncellenemedi');
  if(r===null)return;
  /* S4.4: sistem hareketi artik VERITABANI tetikleyicisinden gelir (trg_jobs_hareket). */
  toast('Güncellendi.'); renderSection();
}
async function accExport(){
  const list=ui._accList||[], cm=ui._accCm||{};
  if(!list.length){ mpAlert('Aktarılacak kayıt yok.'); return; }
  await exportRows('medyapark-muhasebe','Muhasebe',[
    {label:'İş',w:40,get:j=>j.title},
    {label:'Kurum',w:40,get:j=>cm[j.customer_id]||''},
    {label:'Aşama',w:16,get:j=>JOBLBL[j.status]||j.status},
    {label:'Muhasebe',w:14,get:j=>accLbl(j.accounting_status||'yok')},
    {label:'Tutar',w:14,get:j=>j.accounting_amount},
    {label:'Sözleşme',w:14,get:j=>({missing:'Eksik',pending:'Bekleniyor',signed:'İmzalı'})[j.contract_status]||''},
    {label:'Gönderildi',w:14,get:j=>j.accounting_sent_at?String(j.accounting_sent_at).slice(0,10):''},
    {label:'İşlendi',w:14,get:j=>j.accounting_processed_at?String(j.accounting_processed_at).slice(0,10):''},
    {label:'Not',w:40,get:j=>j.accounting_note||''}
  ],list);
}

/* ---- Operasyonel kısayol şeridi (C4 §21) ----
   Ana yan menüye yeni birincil kavram EKLENMEZ. İşler'in etrafında,
   Work görünümleriyle aynı görsel dilde iki operasyonel hedef. */
function coordKisayol(aktif){
  const it=[['is-takibi','İşler','jobs'],['operasyon','Baskı & Montaj','truck'],['muhasebe','Muhasebe','report']];
  return `<div class="coord-sc" role="group" aria-label="Operasyonel görünümler">
    ${it.map(([r,l,i])=>`<button type="button" class="${aktif===r?'on':''}" aria-current="${aktif===r?'page':'false'}"
      onclick="go('${r}')">${ic(i,15)}<span>${esc(l)}</span></button>`).join('')}</div>`;
}

/* S11.2: Pano okları artık tıklandığı anda YAZMAZ. Önerilen aşama, Work
   Detail'deki mevcut aşama taslağı olarak açılır; Kaydet (yetki + eşzamanlı
   değişiklik denetimi + çift gönderim engeli + tek Hareket) ya da Vazgeç
   orada karar verir. Ayrı bir Pano taslak yönetimi yoktur. */
async function jobMove(id,status){
  if(ui._dirty && !(await dirtyGuard())) return;
  ui._fazTaslak={id,st:status}; ui._dirty=true;
  await workAc(id,{bolum:'faz'});
}
async function jobDelete(id){ if(await mpConfirm('Bu iş kaydı silinsin mi? Bağlı güncellemeler de silinir. Belgeler silinmez; Hafıza > Belgeler\'de kalır.','İşi Sil')){ await api('job_delete&id='+id); renderSection(); } }

/* ---------- WORK DETAIL (07 §7) ---------- */
/* S7.1 ust hiyerarsi: Ad -> Kurum/kisi -> ASAMA (belirgin) -> operasyonel
   durum (Aktif/Arsiv, Bekliyor, Acil, Ilgili). Kapanis nedeni, sozlesme ve
   muhasebe ust kimlik alanini ISGAL ETMEZ; kendi bolumlerinde yasarlar.

   `odak` (istege bagli): Hareketler'den gelen derin baglanti. Yeni bir
   router DEGIL - yalniz bu cizimden sonra hangi bolumun/kaydin one
   cikarilacagini soyler ve bir kez tuketilir. */
async function workAc(id,odak){
  const ekran=ekranBasla();
  if(odak) ui._workOdak=odak;
  /* Kaydedilmemiş aşama taslağı yalnız AYNI işte ve kullanıcı ayrılmayı
     onaylamadıysa korunur (dirtyGuard onaylanınca ui._dirty düşer). */
  if(ui._fazTaslak&&(ui._fazTaslak.id!==id||!ui._dirty)){ ui._fazTaslak=null; ui._dirty=false; }
  let veri;
  try{ veri=await Promise.all([api('work_detail&id='+id),api('team_list'),
    api('customers_list'),api('contacts_list'),
    api('work_followers_all&job_id='+id).catch(()=>[]), sozUnitYukle()]); }
  catch(e){ if(ekran===_ekranNo) kayitYok('is',id,e); return; }
  if(ekran!==_ekranNo)return;                  /* bu arada başka ekrana geçildi */
  if(!veri[0]||!veri[0].job){ kayitYok('is',id); return; }
  const [d,tm,cu,ct,fol]=veri; ui._team=tm||[]; ui._cust=cu||[]; ui._contacts=ct||[];
  const benim=(ui._me&&ui._me.id)||0;
  const folBu=(fol||[]).filter(r=>String(r.job_id)===String(id));
  const takipEdiyorum=folBu.some(r=>r.team_id===benim);
  const folAdlari=folBu.map(r=>((tm||[]).find(t=>t.id===r.team_id)||{}).name).filter(Boolean);
  ui._work=d.job; ui._workParties=d.parties; ui._workEntries=d.entries;
  if(ui._fazTaslak&&ui._fazTaslak.id===d.job.id&&ui._fazTaslak.st===d.job.status){ ui._fazTaslak=null; ui._dirty=false; }
  ui._workQuotes=d.quotes||[]; ui._workMedya=d.medya||[]; ui._workDetay=d;
  ui._workOps=d.ops||[];
  ui._opCust=ui._opCust||{}; (cu||[]).forEach(x=>ui._opCust[x.id]=x.firma);
  ui._opUnits=ui._opUnits||{}; Object.values(ui._sozUnits||{}).forEach(u=>ui._opUnits[u.id]=u);
  const j=d.job, org=(cu||[]).find(x=>x.id===j.customer_id);
  const kisi=(ct||[]).find(x=>x.id===j.primary_contact_id);
  navKayit('work',ui.section,j.id,orgKisa(j.title,34));
  const belgeN=workBelgeListe(d).length, opN=(d.ops||[]).length, ticariN=workTicariSayi(d);
  const c=document.getElementById('content');
  c.innerHTML=`<div class="sec-head w-head">
      <div class="w-id"><h3>${geriBtn('is-takibi')} <span class="w-ad">${esc(j.title)}</span>
          <button type="button" class="w-ed" onclick="workAdForm(${j.id})" aria-label="İş adını değiştir" title="İş adını değiştir">✎</button></h3>
        <p class="sub">${org?`<button type="button" class="btn-link" onclick="orgAc(${org.id})" title="${esc(org.firma)}">${esc(orgKisa(org.firma,60))}</button>`:'<span class="muted">kurum bağlı değil</span>'}${kisi?` · ${esc(kisi.name)}${kisi.title?' <span class="muted">('+esc(kisi.title)+')</span>':''}`:''}</p></div>
      <div class="w-act">
        <button class="btn btn-primary btn-sm" onclick="qcAc({jobId:${j.id}})">${ic('plus',15)} Güncelleme</button>
        <button class="btn ${takipEdiyorum?'btn-ghost':'btn-outline'} btn-sm" id="wFol"
          onclick="workTakip(${j.id},${takipEdiyorum?'false':'true'})"
          title="${takipEdiyorum?'Bu iş Panelim → Takip Ettiğim İşler listenden çıkar':'Bu iş Panelim → Takip Ettiğim İşler listene eklenir'}">
          ${takipEdiyorum?'★ Takibi Bırak':'☆ Takibe Al'}</button>
        <button class="btn btn-outline btn-sm" onclick="jobForm(null,${j.id})">Düzenle</button>
        <button class="btn btn-ghost btn-sm" onclick="rpAc('is',{is:${j.id}})" title="Bu işin durumunu ve geçmişini PDF olarak paylaşın">${ic('download',15)} İş özeti</button>
      </div></div>

    ${workFazHtml(j)}
    ${workDurumHtml(j,folAdlari)}

    <div class="sec-card w-sec w-bilgi">
      <div class="w-kv"><span class="w-k">İlgili kişi</span>
        <span class="w-v">${kisi?`<b>${esc(kisi.name)}</b>${kisi.title?' · '+esc(kisi.title):''}`
          +`${kisi.phone?' · '+esc(kisi.phone):''}${kisi.email?` · <a href="mailto:${esc(kisi.email)}">${esc(kisi.email)}</a>`:''}`
          :'<span class="muted">seçilmedi</span>'}
        <button class="btn-link" onclick="jobForm(null,${j.id})">Değiştir</button></span></div>
      ${/* S2 §3: `jobs.assignee_id` doluysa IKINCIL baglam; bossa hic yok. */''}
      ${j.assignee_id?`<div class="w-kv"><span class="w-k">İş sahibi</span><span class="w-v">${esc((tm||[]).find(t=>t.id===j.assignee_id)?.name||'—')}</span></div>`:''}
      <div class="w-kv" id="wMuhasebe"><span class="w-k">Muhasebe</span>
        <span class="w-v"><span class="pill">${esc(accLbl(j.accounting_status||'yok'))}</span>
          ${j.accounting_amount?' · '+esc(money(j.accounting_amount)):''}
          ${j.accounting_sent_at?' · gönderim '+esc(trTarih(j.accounting_sent_at)):''}
          <button class="btn-link" onclick="workMetaForm(${j.id})">Düzenle</button></span></div>
    </div>

    ${wBolum({id:'wBelgeKart',baslik:'Belgeler',sayiId:'wBelgeSayi',sayi:belgeN,govde:'wBelgeler',
      bos:!belgeN,ipucu:'Henüz belge yok.',
      eylem:`<button class="btn btn-outline btn-sm" onclick="belgeEkleAc({jobId:${j.id}})">${ic('plus',15)} Belge Ekle</button>`})}

    ${wBolum({id:'wTicari',baslik:'Ticari',sayi:ticariN,govde:'wTicariG',
      bos:!ticariN,ipucu:'Teklif ya da sözleşme belgesi yok.',
      eylem:`<button class="btn btn-outline btn-sm" onclick="belgeEkleAc({jobId:${j.id},tur:'teklif'})">${ic('plus',15)} Teklif Belgesi</button>
        <button class="btn btn-outline btn-sm" onclick="belgeEkleAc({jobId:${j.id},tur:'sozlesme'})">${ic('plus',15)} Sözleşme Belgesi</button>`})}

    ${wBolum({id:'wOpKart',baslik:'Baskı &amp; Montaj',sayiId:'wOpSayi',sayi:opN,govde:'wOps',
      bos:!opN,ipucu:'Bu işe bağlı baskı/montaj kaydı yok.',
      eylem:`${opN?`<button class="btn btn-ghost btn-sm" onclick="rpAc('baski',{kurum:${j.customer_id||0},isler:[${j.id}]})" title="Bu işin baskı/montaj dökümü (PDF/Excel)">${ic('download',15)} Döküm</button>`:''}
        <button class="btn btn-sm act act-ops" onclick="opForm(0,${j.id})">${ic('plus',15)} Kayıt Ekle</button>`})}

    ${/* S2 §27: bos bolum sessiz kalir. */''}
    ${d.parties.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Taraflar <span class="chip">${d.parties.length}</span></h4>
        <button class="btn btn-outline btn-sm" onclick="partyForm(${j.id})">${ic('plus',15)} Taraf Ekle</button></div>
      <div id="wParties"></div></div>`
    :`<p class="w-quiet"><span class="muted">Ek taraf (ajans, fatura, tedarikçi) tanımlı değil.</span>
       <button class="btn-link" onclick="partyForm(${j.id})">Taraf ekle</button></p>
      <div id="wParties" hidden></div>`}

    ${/* S8 §44: kompakt Mecralar özeti; tam yönetici Mecralar'da. */''}
    ${medyaBolumu(d.medya,{is:j.id,id:'wMedya',baslik:'Mecralar'})}

    <div class="sec-card" id="wZaman">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Zaman Çizelgesi <span class="chip">${d.entries.length}</span></h4></div>
      <div id="wTimeline"></div></div>`;
  /* Belgeye derin baglantida tur filtresi hedefi gizlemesin. */
  if(ui._workOdak&&ui._workOdak.bolum==='belge') ui._blFiltre='tumu';
  workPartyCiz(); workTimelineCiz(); workOpsCiz(); workBelgeCiz(); workTicariCiz();
  workOdakUygula();
}

/* Bolum kabugu. Veri yoksa TEK satir: baslik + sayi + eylem + kisa ipucu
   (S7.1 §24). Eylem her zaman gorunur kalir - kompakt != gorunmez (§25). */
function wBolum(o){
  return `<div class="sec-card w-sec ${o.bos?'bos':''}" id="${o.id}">
    <div class="w-sh">
      <h4>${o.baslik} <span class="chip"${o.sayiId?` id="${o.sayiId}"`:''}>${o.sayi}</span></h4>
      ${o.bos&&o.ipucu?`<span class="w-sh-i">${esc(o.ipucu)}</span>`:''}
      <div class="w-sh-a">${o.eylem||''}</div></div>
    ${o.bos?'':`<div id="${o.govde}"></div>`}</div>`;
}

/* ---- Asama gostergesi (S7.1 §7-§9) ----
   Bir ilerleme yuzdesi DEGIL, isin su an agirlikla nerede oldugu. Asamalar
   atlanabilir/geri alinabilir (BR-W02): gecmis adimlar "tamamlandi" isareti
   TASIMAZ, yalniz hafifce tonlanir. Renkler Pano sutunlariyla ayni (JOBC).
   Tiklama mevcut `job_move` yolunu kullanir; ikinci bir faz yazicisi yok.
   Depolanan deger (`temas_takip`, `yayinda_aktif`) degismez. */
/* S11 §5: aşama göstergesine tıklamak aşamayı HENÜZ değiştirmez — taslak
   olarak işaretler; Kaydet ile yazılır, Vazgeç ile geri alınır. Önceden
   tek bir yanlış tıklama aşamayı değiştirip kalıcı Hareket üretiyordu. */
function workFazHtml(j){
  const i=FAZ_SIRA.indexOf(j.status);
  const tsl=(ui._fazTaslak&&ui._fazTaslak.id===j.id)?ui._fazTaslak.st:null;
  return `<nav class="w-faz ${tsl?'taslak':''}" id="wFaz" aria-label="İşin aşaması">
    <span class="w-faz-l">Aşama</span>
    <ol>${FAZ_SIRA.map((k,ix)=>{ const cur=ix===i, sec=tsl===k;
      return `<li class="${cur?'on':(i>=0&&ix<i?'once':'')}${sec?' sec':''}" style="--fc:var(--c-${JOBC[k]})">
        <button type="button" data-faz="${k}" ${cur?'aria-current="step"':''} aria-pressed="${sec}" onclick="workFazDegis(${j.id},'${k}')"
          title="${cur?'Şu anki aşama':'Aşamayı “'+FAZ_ETIKET[k]+'” olarak seç (Kaydet ile uygulanır)'}">${sec?'✓ ':''}${esc(FAZ_ETIKET[k])}</button></li>`; }).join('')}</ol>
    ${i<0?`<span class="w-faz-eski">Eski aşama: ${esc(JOBLBL[j.status]||j.status)}</span>`:''}
    ${tsl?`<span class="w-faz-t" role="status">Aşama: <b>${esc(FAZ_ETIKET[j.status]||JOBLBL[j.status]||j.status)}</b> → <b>${esc(FAZ_ETIKET[tsl])}</b>
      <button type="button" class="btn btn-ghost btn-sm" onclick="workFazVazgec()">Vazgeç</button>
      <button type="button" class="btn btn-primary btn-sm" id="wFazKaydet" onclick="workFazKaydet()">Kaydet</button></span>`:''}
  </nav>`;
}
/* S14: gösterge yeniden çizilince klavye odağı kaybolmasın — aynı aşama
   düğmesine geri verilir (önceden sayfanın başına düşüyordu). */
function workFazCiz(odak){ const el=document.getElementById('wFaz'); const j=ui._work; if(!el||!j) return;
  const icerde=el.contains(document.activeElement);
  el.outerHTML=workFazHtml(j);
  if(odak&&icerde){ const b=document.querySelector(`#wFaz button[data-faz="${odak}"]`); if(b) b.focus(); } }
function workFazDegis(id,st){
  const j=ui._work; if(!j||j.id!==id) return;
  ui._fazTaslak=(j.status===st)?null:{id,st};
  ui._dirty=!!ui._fazTaslak;
  workFazCiz(st);
}
function workFazVazgec(){ const j=ui._work; ui._fazTaslak=null; ui._dirty=false; workFazCiz(j&&j.status); }
async function workFazKaydet(){
  const t=ui._fazTaslak, j=ui._work; if(!t||!j) return;
  const b=document.getElementById('wFazKaydet'); if(b&&b.disabled) return; if(b){ b.disabled=true; b.textContent='Kaydediliyor…'; }
  let r;
  try{ r=await api('row_update_cas',{tablo:'jobs',id:t.id,patch:{status:t.st},eski:{status:j.status}}); }
  catch(e){ if(b){ b.disabled=false; b.textContent='Kaydet'; } if(!casHata(e)) mpAlert(hataMetni(e),'Aşama değiştirilemedi'); return; }
  ui._fazTaslak=null; ui._dirty=false;
  /* Hareket DB tetikleyicisinden gelir (trg_jobs_hareket) - insan Update'i YAZILMAZ. */
  toast('Aşama: '+FAZ_ETIKET[t.st]);
  workAc(t.id,{bolum:'faz'});
}

/* ---- Operasyonel durum satiri (S7.1 §4-§6) ----
   Birincil: Aktif | Arsiv. Bekliyor Aktif'in ikincil rozeti. Kapanis
   nedeni YALNIZ arsivde gorunur. Iki yan yana select yerine acik eylemler:
   celiskili bir kombinasyon (Acik + Tamamlandi) kurulamaz. */
function workDurumHtml(j,folAdlari){
  const ls=j.lifecycle_status||'acik', arsiv=ls==='kapandi';
  return `<div class="w-st" id="wDurum">
    <span class="pill w-ya ${arsiv?'arsiv':'aktif'}">${arsiv?'Arşiv':'Aktif'}</span>
    ${ls==='bekliyor'?'<span class="pill sand" title="Dış cevap, onay ya da materyal bekleniyor">Bekliyor</span>':''}
    ${arsiv&&j.closed_reason?`<span class="w-st-n">Arşiv nedeni: <b>${esc(CLOSELBL[j.closed_reason]||j.closed_reason)}</b></span>`:''}
    ${j.is_urgent?'<span class="pu-b acil">⚡ Acil</span>':''}
    ${folAdlari.length?`<span class="w-st-il"><span class="w-k">İlgili</span> ${folAdlari.map(x=>`<span class="pu-chip who">@${esc(x)}</span>`).join(' ')}</span>`:''}
    <span class="w-st-a">
      ${arsiv?`<button class="btn btn-outline btn-sm" onclick="workYenidenAc(${j.id})">Yeniden aç</button>`
        :`<button class="btn btn-ghost btn-sm" onclick="workBekle(${j.id},${ls==='bekliyor'?'false':'true'})">${ls==='bekliyor'?'Beklemeden çıkar':'Beklemeye al'}</button>
          <button class="btn btn-outline btn-sm" onclick="workArsivForm(${j.id})">Arşivle</button>`}
    </span></div>`;
}
async function workYasam(id,ls,neden,mesaj){
  const r=await guard(()=>api('job_lifecycle',{id,lifecycle_status:ls,closed_reason:neden||null}),'Durum değiştirilemedi');
  if(r===null) return false;
  /* S4.4: hareket VERITABANI tetikleyicisinden gelir (trg_jobs_hareket). */
  toast(mesaj); workAc(id,{bolum:'durum'}); return true;
}
function workBekle(id,bekle){
  return workYasam(id,bekle?'bekliyor':'acik',null,bekle?'İş beklemeye alındı.':'İş yeniden aktif.');
}
async function workYenidenAc(id){
  if(!await mpConfirm('Bu iş yeniden açılsın mı? Aktif işler arasına döner; arşiv geçmişi zaman çizelgesinde kalır.','İşi yeniden aç',{danger:false,ok:'Yeniden aç'})) return;
  workYasam(id,'acik',null,'İş yeniden açıldı.');
}
function workArsivForm(id){
  const j=(ui._work&&ui._work.id===id)?ui._work:{};
  const S=[['tamamlandi','Tamamlandı','İş yapıldı ve bitti.'],
           ['kaybedildi','Kaybedildi','Müşteri reddetti ya da başka yerle çalıştı.'],
           ['iptal','İptal','İş vazgeçildi ya da geçersiz.']];
  modal(`<h3 style="margin:0 0 4px">İşi arşivle</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">${esc(j.title||'')}</p>
    <fieldset class="w-ars"><legend class="flabel">Neden arşivleniyor? *</legend>
      ${S.map(([v,l,a])=>`<label class="w-ars-o"><input type="radio" name="wArs" value="${v}">
        <span><b>${l}</b><em>${a}</em></span></label>`).join('')}</fieldset>
    <p class="fhint">Arşivlemek muhasebenin işlendiği anlamına gelmez. İş gerekirse yeniden açılabilir.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="workArsivKaydet(${id})">Arşivle</button></div>`);
}
async function workArsivKaydet(id){
  const s=document.querySelector('input[name="wArs"]:checked');
  if(!s){ mpAlert('Arşivleme nedenini seçin.','İşi arşivle'); return; }
  modalBusy(true);
  const r=await guard(()=>api('job_lifecycle',{id,lifecycle_status:'kapandi',closed_reason:s.value}),'Arşivlenemedi');
  modalBusy(false); if(r===null) return;
  closeModal(); toast('İş arşivlendi: '+CLOSELBL[s.value]+'.'); workAc(id,{bolum:'durum'});
}

/* ---- Is adi (S7.1 §10-§11) ----
   Ayni Work; id ve tum iliskiler aynen kalir. Anlamli degisiklik DB
   tetikleyicisinde guvenilir `work_renamed` hareketi uretir; yalniz bosluk
   farki hareket uretmez. Istemci hicbir hareket YAZMAZ. */
function workAdForm(id){
  const j=(ui._work&&ui._work.id===id)?ui._work:{};
  modal(`<h3 style="margin:0 0 12px">İş adını değiştir</h3>
    <div class="field"><label class="flabel" for="wAd">İş adı *</label>
      <input class="inp" id="wAd" value="${esc(j.title||'')}" maxlength="200"
        onkeydown="if(event.key==='Enter')workAdKaydet(${id})"></div>
    <p class="fhint">Aynı iş kalır; belgeler, operasyonlar ve geçmiş değişmez. Eski ad zaman çizelgesinde görünür.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="workAdKaydet(${id})">Kaydet</button></div>`);
  const e=document.getElementById('wAd'); if(e){ e.focus(); e.select(); }
}
async function workAdKaydet(id){
  const yeni=(gv('wAd')||'').replace(/\s+/g,' ').trim();
  if(!yeni){ mpAlert('İş adı boş olamaz.','İş adı'); return; }
  const eski=String(((ui._work&&ui._work.id===id)?ui._work:{}).title||'').replace(/\s+/g,' ').trim();
  if(yeni===eski){ closeModal(); return; }
  modalBusy(true);
  const eskiHam=((ui._work&&ui._work.id===id)?ui._work:{}).title;
  let r;
  try{ r=await api('row_update_cas',{tablo:'jobs',id,patch:{title:yeni},eski:{title:eskiHam??null}}); }
  catch(e){ modalBusy(false); if(!casHata(e)) mpAlert(hataMetni(e),'İş adı kaydedilemedi'); return; }
  modalBusy(false); if(r===null) return;
  closeModal(); toast('İş adı güncellendi.'); workAc(id,{bolum:'faz'});
}

/* ---- Derin baglanti odagi (S7.1 §39-§51) ----
   Hareketler satirindaki YAPISAL hedef (job_id / work_operation_id /
   document_id) kullanilir; olay metninden id AYRISTIRILMAZ. Hedef kayit
   artik yoksa (silinmis operasyon/belge) ilgili bolume dusulur. */
function workOdakUygula(){
  const o=ui._workOdak; ui._workOdak=null; if(!o) return;
  const bolum={faz:'wFaz',durum:'wDurum',op:'wOpKart',belge:'wBelgeKart',
               muhasebe:'wMuhasebe',ticari:'wTicari',zaman:'wZaman'}[o.bolum]||'wFaz';
  const isaret=[];
  if(o.bolum==='op'&&o.opId){
    const satirlar=[...document.querySelectorAll('#wOps [data-op]')];
    const h=satirlar.find(r=>r.dataset.op===String(o.opId));
    /* Toplu kaydin kardesleri ayni islemde, ayni anda olusturulur. */
    if(h) satirlar.filter(r=>r.dataset.oc===h.dataset.oc).forEach(r=>isaret.push(r));
    if(h) isaret.unshift(h);
  }
  if(o.bolum==='belge'&&o.docId){
    const h=document.querySelector(`#wBelgeler [data-doc="${o.docId}"]`);
    if(h) isaret.push(h);
  }
  const hedef=isaret[0]||document.getElementById(bolum);
  if(!isaret.length&&hedef) isaret.push(hedef);
  if(o.entryId){ const e=document.querySelector(`#wTimeline [data-e="${o.entryId}"]`); if(e) isaret.push(e); }
  isaret.forEach(el=>{ el.classList.remove('odak'); void el.offsetWidth; el.classList.add('odak'); });
  if(hedef) setTimeout(()=>hedef.scrollIntoView({block:'center',behavior:'smooth'}),30);
}

function workOpsCiz(){
  const box=document.getElementById('wOps'); if(!box)return;
  const ops=ui._workOps||[], jobId=(ui._work||{}).id;
  box.innerHTML=ops.map(o=>`<div class="list-item w-op" data-op="${o.id}" data-oc="${esc(String(o.created_at||''))}"
      role="button" tabindex="0" style="cursor:pointer" onclick="opForm(${o.id},${jobId})"
      onkeydown="if(event.key==='Enter')opForm(${o.id},${jobId})">
      <div class="nm"><span class="pill">${esc(opTypeLbl(o.operation_type))}</span>
        ${o.unit_id&&ui._opUnits[o.unit_id]?`<b>${esc(ui._opUnits[o.unit_id].name)}</b>`:''} ${esc(o.description||'')}</div>
      <div class="meta">${o.planned_date?esc(trTarih(o.planned_date)):'tarihsiz'}
        ${o.quantity!=null?' · '+esc(String(o.quantity).replace(/\.0+$/,''))+' '+esc(OP_BIRIM[o.quantity_unit]||'adet'):''}${o.dimensions?' · '+esc(o.dimensions):''}
        ${!o.unit_id&&o.location_text?' · '+esc(o.location_text):''}
        ${o.supplier_org_id&&ui._opCust[o.supplier_org_id]?' · '+esc(orgKisa(ui._opCust[o.supplier_org_id],34)):''}
        · <span class="badge-st st-${esc(o.status)}">${esc(opStatLbl(o.status))}</span>
        ${(o.document_links||[]).length?` · <span title="Ek dosya">📎 ${(o.document_links||[]).length}</span>`:''}
        ${o.price_group_id?' · <span class="pill">paket</span>':''}</div>
    </div>`).join('')+'<div id="wPaketler"></div>';
  if(ops.some(o=>o.price_group_id)) paketOzetCiz(jobId);
}
/* ---- S13: paket bedeli görünür ve düzenlenebilir ----
   S12'de paket yalnız oluşturulabiliyordu; yanlış tutarı düzeltmek için
   yeni paket açmak gerekiyordu. Paket bir işin birden çok işlemini kapsayan
   TEK tutardır; düzenleme yalnız paket satırını değiştirir (işlem satırları
   ve onların kendi tutarları aynen kalır). */
const tlTR=(v,pb)=>v==null||v===''?'—':Number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+(pb||'');
async function paketOzetCiz(jobId){
  const box=document.getElementById('wPaketler'); if(!box) return;
  let G; try{ G=await api('price_groups_list&job_id='+jobId); }catch(e){ box.innerHTML='<p class="fhint">Paket bilgisi okunamadı.</p>'; return; }
  const ops=ui._workOps||[];
  box.innerHTML=(G||[]).map(g=>{ const kap=ops.filter(o=>o.price_group_id===g.id);
    return `<div class="w-paket">
      <div><b>Paket bedeli — ${esc(g.label)}</b>
        <span class="w-paket-t">${g.cost_amount!=null?'maliyet '+esc(tlTR(g.cost_amount,g.currency)):''}${g.cost_amount!=null&&g.sale_amount!=null?' · ':''}${g.sale_amount!=null?'satış '+esc(tlTR(g.sale_amount,g.currency)):''}</span>
        <span class="fhint">${kap.length} işlemi kapsar; raporlarda bir kez sayılır.</span></div>
      <button type="button" class="btn btn-outline btn-sm" onclick="paketDuzenle(${g.id})">Paket bedelini düzenle</button></div>`; }).join('');
}
async function paketDuzenle(id){
  if(modalAcikMi()&&!(await modalVazgec())) return;      /* açık form varsa önce sorar */
  const veri=await guard(()=>Promise.all([sb.from('operation_price_groups').select('*').eq('id',id).single(),
    sb.from('work_operations').select('id,operation_type,description,cost,sale_amount,currency,status').eq('price_group_id',id).order('id')]),'Paket açılamadı');
  if(!veri) return;
  const [{data:g,error:e1},{data:ops,error:e2}]=veri;
  if(e1||e2||!g){ mpAlert('Paket bulunamadı ya da görme yetkiniz yok.','Paket bedeli'); return; }
  ui._paketIlk={label:g.label,cost_amount:g.cost_amount,sale_amount:g.sale_amount,currency:g.currency,note:g.note};
  ui._paketIs=g.job_id;
  modal(`<h3 style="margin:0 0 4px">Paket bedelini düzenle</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Paket, aşağıdaki işlemlerin <b>ortak tek tutarıdır</b>. Değişiklik yalnız paket tutarını etkiler; işlemlerin kendi satır tutarları değişmez. Raporda paket bir kez sayılır.</p>
    <input type="hidden" id="pkId" value="${g.id}">
    <div class="field"><label class="flabel" for="pkAd">Paket adı <span class="zor">*</span></label><input class="inp" id="pkAd" value="${esc(g.label)}" maxlength="120"></div>
    <div class="row3">
      <div class="field"><label class="flabel" for="pkM">Paket maliyeti</label><input class="inp" type="number" min="0" step="0.01" id="pkM" value="${esc(g.cost_amount)}"></div>
      <div class="field"><label class="flabel" for="pkS">Paket satışı</label><input class="inp" type="number" min="0" step="0.01" id="pkS" value="${esc(g.sale_amount)}"></div>
      <div class="field"><label class="flabel" for="pkPb">Para birimi</label><select class="inp" id="pkPb">${OP_PB.map(([k,l])=>`<option value="${k}" ${g.currency===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div></div>
    <div class="field"><label class="flabel" for="pkNot">Not <span class="ops">isteğe bağlı · iç bilgi</span></label><textarea class="inp" id="pkNot" rows="2">${esc(g.note)}</textarea></div>
    <div class="fhint" id="pkHata" role="alert" hidden></div>
    <div class="tc-h" style="margin-top:6px">Etkilenen işlemler <span class="chip">${(ops||[]).length}</span></div>
    <div class="pk-ops">${(ops||[]).map(o=>`<div class="pk-op"><span class="pill">${esc(opTypeLbl(o.operation_type))}</span> ${esc(o.description||'—')}
      <span class="muted">${o.cost!=null?' · satır maliyeti '+esc(tlTR(o.cost,o.currency))+' (bilgi amaçlı)':''} · ${esc(opStatLbl(o.status))}</span></div>`).join('')||'<p class="fhint">Bu pakete bağlı işlem yok.</p>'}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="pkKaydet" onclick="paketKaydet()">Kaydet</button></div>`);
}
async function paketKaydet(){
  const b=document.getElementById('pkKaydet'); if(b&&b.disabled) return;
  const h=document.getElementById('pkHata'); const hata=t=>{ if(h){ h.hidden=!t; h.textContent=t||''; } };
  const num=v=>v===''||v==null?null:+v;
  const yeni={label:(gv('pkAd')||'').trim(),cost_amount:num(gv('pkM')),sale_amount:num(gv('pkS')),currency:gv('pkPb')||'TRY',note:(gv('pkNot')||'').trim()||null};
  if(!yeni.label){ hata('Paket adı boş olamaz.'); document.getElementById('pkAd').focus(); return; }
  if(yeni.cost_amount==null&&yeni.sale_amount==null){ hata('Maliyet ya da satış tutarından en az biri girilmeli.'); document.getElementById('pkM').focus(); return; }
  if([yeni.cost_amount,yeni.sale_amount].some(v=>v!=null&&!(v>=0))){ hata('Tutar negatif olamaz.'); return; }
  hata('');
  const f=formFark(ui._paketIlk||{},{id:+gv('pkId'),...yeni});
  if(f.bos){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
  modalBusy(true);
  try{ await api('row_update_cas',{tablo:'operation_price_groups',id:+gv('pkId'),patch:{...f.patch,updated_at:new Date().toISOString()},eski:f.eski}); }
  catch(e){ modalBusy(false); if(!casHata(e)) hata(hataMetni(e)); return; }
  modalBusy(false); closeModal(); toast('Paket bedeli güncellendi.');
  if(ui._paketIs) workAc(ui._paketIs,{bolum:'op'});
}
/* ============ SOZLESMELER (S7) =========================================
   Sozlesme = ticari anlasma (baslik + 1..N kalem). Dosya DEGILDIR; dosyalar
   S6 belge katmaninda yasar ve `document_links.contract_id` ile baglanir.
   Bu bolum depolama saglayicisina DOGRUDAN hic dokunmaz: yukleme/acma
   belgeEkleAc / ekSeridi / belgeAc uzerinden gecer.
   Kalemler rezervasyon/doluluk/LED yayini URETMEZ (Sprint 8). */
const SOZ_ST={taslak:'Taslak',imzali:'İmzalı',iptal:'İptal'};
const SOZ_KALEM=[['mecra','Mecra'],['baski','Baskı'],['montaj','Montaj'],['produksiyon','Prodüksiyon'],['hizmet','Hizmet'],['diger','Diğer']];
const sozKalemLbl=v=>(SOZ_KALEM.find(x=>x[0]===v)||[null,'Diğer'])[1];
const SOZ_KDV={haric:'+KDV',dahil:'KDV dahil',belirtilmemis:'KDV belirtilmemiş'};
const sozGun=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('tr-TR',{day:'numeric',month:'short',year:'numeric'}):'';
function sozPara(n,cur){
  const x=Number(n); if(n==null||n===''||!isFinite(x)) return '';
  try{ return x.toLocaleString('tr-TR',{style:'currency',currency:cur||'TRY',maximumFractionDigits:2}); }
  catch(e){ return x.toLocaleString('tr-TR')+' '+(cur||''); }
}
/* Satir tutari: acikca girilen satir toplami SOZLESMESEL dogrudur; yoksa
   adet x birim fiyattan turetilir. Girilmis tutar asla yeniden hesaplanmaz. */
function sozSatirTutar(i){
  if(i.line_total!=null&&i.line_total!=='') return +i.line_total;
  if(i.unit_price!=null&&i.unit_price!=='') return (+i.quantity||1)*(+i.unit_price);
  return null;
}
function sozToplam(c){
  const it=c.contract_items||[]; let t=0, bilinen=0;
  it.forEach(i=>{ const v=sozSatirTutar(i); if(v!=null){ t+=v; bilinen++; } });
  return {toplam:bilinen?t:null, eksik:it.length-bilinen};
}
function sozDonem(c){
  const it=(c.contract_items||[]);
  const bas=it.map(i=>i.start_date).filter(Boolean).sort()[0]||null;
  const son=it.map(i=>i.end_date).filter(Boolean).sort().slice(-1)[0]||null;
  return {bas,son};
}
/* Zamansal durum TURETILIR (§47): elle "aktif/suresi doldu" saklanmaz.
   "Yayında" kelimesi Work fazi ile karismasin diye KULLANILMAZ. */
function sozDurum(c){
  if(c.status==='iptal') return {k:'iptal',lbl:'İptal',cls:''};
  if(c.status==='taslak') return {k:'taslak',lbl:'Taslak',cls:'sand'};
  const {bas,son}=sozDonem(c); const bugun=_cIso(new Date());
  /* Aktif donem notr; yalniz suresi dolan dikkat rengi alir (uyari degil sinyal). */
  if(bas&&bugun<bas) return {k:'baslamadi',lbl:'İmzalı · Başlamadı',cls:''};
  if(son&&bugun>son) return {k:'bitti',lbl:'İmzalı · Süresi doldu',cls:'clay'};
  if(bas||son) return {k:'devam',lbl:'İmzalı · Devam ediyor',cls:''};
  return {k:'imzali',lbl:'İmzalı',cls:''};
}
function sozDonemYazi(c){ const {bas,son}=sozDonem(c);
  return bas||son?`${sozGun(bas)||'?'} – ${sozGun(son)||'?'}`:''; }
/* Karma sozlesme OZETI: adetler tur bazinda ayri kalir (1 Megalight +
   11 Raket, "12 adet" DEGIL). */
function sozKalemOzet(c){
  const it=c.contract_items||[]; if(!it.length) return 'Kalem yok';
  const U=ui._sozUnits||{};
  const grup={};
  it.forEach(i=>{ const u=U[i.unit_id];
    const ad=(u&&u.urun)||String(i.description||sozKalemLbl(i.item_type)).split(/[—\-·,(]/)[0].trim().slice(0,28)||sozKalemLbl(i.item_type);
    grup[ad]=(grup[ad]||0)+(+i.quantity||1); });
  const parca=Object.entries(grup).map(([k,v])=>`${k} ×${String(v).replace(/\.0+$/,'')}`);
  return it.length+' kalem · '+(parca.length>3?parca.slice(0,3).join(', ')+' …':parca.join(', '));
}
function sozBelgeSayi(c){ return (c.document_links||[]).length; }
function sozSatirHtml(c,opt){
  opt=opt||{}; const du=sozDurum(c); const {toplam}=sozToplam(c); const bs=sozBelgeSayi(c);
  const belgeAdlari=(c.document_links||[]).map(l=>l.documents).filter(Boolean).map(belgeKaydet);
  return `<div class="sz-row" role="button" tabindex="0" onclick="sozAc(${c.id})" onkeydown="if(event.key==='Enter')sozAc(${c.id})">
    <div class="sz-b">
      <div class="sz-t">${esc(c.title)}${c.reference_no?` <span class="sz-ref">${esc(c.reference_no)}</span>`:''}${opt.isAdi?` <span class="sz-ref">· ${esc(opt.isAdi)}</span>`:''}</div>
      <div class="sz-s"><span class="pill ${du.cls}">${esc(du.lbl)}</span>
        ${sozDonemYazi(c)?`<span>${esc(sozDonemYazi(c))}</span>`:''}
        <span>${esc(sozKalemOzet(c))}</span>
        ${toplam!=null?`<b>${esc(sozPara(toplam,c.currency))}</b> <span>${esc(SOZ_KDV[c.vat_mode]||'')}</span>`:''}</div>
    </div>
    <div class="sz-d">${bs?(belgeAdlari.length===1?`<span class="bl-nm" title="${esc(belgeAd(belgeAdlari[0]))}">📎 ${esc(belgeAd(belgeAdlari[0]))}</span>`:`📎 ${bs} belge`)
      :'<span class="muted">Belge yok</span>'}</div>
  </div>`;
}
/* Work Detail > Ticari (S7.1 §15-§21): BELGE-ONCELIKLI.
   Gunluk gercek: sozlesme/teklif uygulama disinda hazirlanir, Word/PDF
   olarak ise eklenir. Yuklenen dosya yeterlidir; kalemleri yeniden yazdiran
   yapisal form artik birincil akis DEGIL. Mevcut yapisal sozlesme/teklif
   kayitlari (S7 backend) aynen gorunur ve acilir.
   Ekleme ayni S6 yukleyicisidir (belgeEkleAc, tur onceden secili). */
function workTicariBelge(d){
  const b=workBelgeListe(d);
  return {teklif:b.filter(x=>x.doc.doc_type==='teklif'),
          /* Yapisal kayda bagli belge o kaydin satirinda gorunur; iki kez listelenmez. */
          sozlesme:b.filter(x=>x.doc.doc_type==='sozlesme'&&!(x.doc.document_links||[]).some(l=>l.contract_id))};
}
function workTicariSayi(d){
  const tb=workTicariBelge(d);
  return (d.quotes||[]).length+(d.contracts||[]).length+tb.teklif.length+tb.sozlesme.length;
}
async function workTicariCiz(){
  const box=document.getElementById('wTicariG'); if(!box) return;
  const d=ui._workDetay; if(!d) return; const j=d.job;
  const tb=workTicariBelge(d), qs=d.quotes||[], cs=d.contracts||[];
  const QST={yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'};
  const ctx={tip:'is',id:j.id,orgId:j.customer_id||0};
  box.innerHTML=`<div class="tc-g">
      <div class="tc-h">Sözleşmeler <span class="chip">${tb.sozlesme.length+cs.length}</span></div>
      ${tb.sozlesme.length?`<div class="bl-list">${tb.sozlesme.map(x=>belgeSatirHtml(x,ctx)).join('')}</div>`:''}
      ${cs.length?`${tb.sozlesme.length?'<div class="tc-not">Yapısal sözleşme kaydı</div>':''}${cs.map(c=>sozSatirHtml(c)).join('')}`:''}
      ${!tb.sozlesme.length&&!cs.length?'<p class="tc-bos">Sözleşme belgesi yok.</p>':''}
    </div>
    <div class="tc-g">
      <div class="tc-h">Teklifler <span class="chip">${qs.length+tb.teklif.length}</span></div>
      ${tb.teklif.length?`<div class="bl-list">${tb.teklif.map(x=>belgeSatirHtml(x,ctx)).join('')}</div>`:''}
      ${qs.map(o=>`<div class="list-item">
        <div class="nm">Teklif #${o.id}${o.revision_no>1?` <span class="pill">rev ${o.revision_no}</span>`:''}</div>
        <div class="meta"><span class="badge-st st-${esc(o.status||'yeni')}">${esc(QST[o.status]||o.status)}</span> · ${esc(money(o.total))}${o.gecerlilik?' · geçerlilik '+esc(trTarih(o.gecerlilik)):''}</div>
        <button class="btn btn-outline btn-sm" onclick="quoteView(${o.id})">Aç</button>
        ${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="quoteRevise(${o.id})">Revize</button>`:''}</div>`).join('')}
      ${!qs.length&&!tb.teklif.length?'<p class="tc-bos">Teklif belgesi yok.</p>':''}
    </div>`;
}
/* Kurum > Ticari: once guncel/aktif, sonra en yeniler; kisa. */
function orgTicariKart(d){
  const cs=(d.contracts||[]).slice();
  const agir=c=>({devam:0,baslamadi:1,taslak:2,imzali:3,bitti:4,iptal:5})[sozDurum(c).k];
  cs.sort((a,b)=>agir(a)-agir(b)||b.id-a.id);
  const jm={}; (d.jobs||[]).forEach(j=>jm[j.id]=j.title);
  const tum=!!ui._orgSozTum, gos=tum?cs:cs.slice(0,5);
  /* S7.1 §16: yapisal sozlesme olusturma normal ekibin gunluk adimi DEGIL
     (belge-oncelikli; kurum belgeleri Belgeler kartinda). Kayit yoksa bu
     kart normal kullaniciya bos bir olusturma formu gibi durmaz. */
  if(!cs.length&&!(d.quotes||[]).length&&!isAdmin()) return '';
  return `<div class="sec-card">
    <div class="sec-head" style="margin-bottom:10px">
      <h4 style="font-size:14px;margin:0">Ticari <span class="chip">${cs.length} sözleşme</span>${(d.quotes||[]).length?` <span class="chip">${d.quotes.length} teklif</span>`:''}</h4>
      ${isAdmin()?`<button class="btn btn-ghost btn-sm" onclick="sozForm({custId:${d.org.id}})" title="Yapısal sözleşme kaydı (kalemli)">${ic('plus',15)} Sözleşme kaydı</button>`:''}</div>
    ${gos.length?gos.map(c=>sozSatirHtml(c,{isAdi:c.job_id?orgKisa(jm[c.job_id]||'',36):''})).join('')
      :'<p class="empty">Bu kurumla sözleşme kaydı yok.</p>'}
    ${cs.length>5?`<button type="button" class="btn-link" onclick="ui._orgSozTum=${!tum};orgAc(${d.org.id})">${tum?'Daha az göster':'Tümünü göster ('+cs.length+')'}</button>`:''}
    ${(d.quotes||[]).length?'<p class="fhint">Yapısal teklifler aşağıda Geçmiş bölümünde.</p>':''}
  </div>`;
}
async function sozUnitYukle(){
  if(ui._sozUnits) return ui._sozUnits;
  const u=await api('units_full').catch(()=>[]);
  ui._sozUnitList=u||[]; ui._sozUnits={}; (u||[]).forEach(x=>ui._sozUnits[x.id]=x);
  return ui._sozUnits;
}
const sozUnitAd=u=>u?[u.mecra,u.urun,u.name].filter(Boolean).join(' · '):'';

/* ---- Sozlesme detayi ---- */
async function sozAc(id){
  const [c]=await guard(()=>Promise.all([api('contract_detail&id='+id),sozUnitYukle()]),'Sözleşme açılamadı')||[];
  if(!c) return;
  ui._soz=c;
  const cu=(ui._cust||[]).find(x=>x.id===c.customer_id);
  const jb=c.job_id?((ui._jobs||[]).find(x=>x.id===c.job_id)||(ui._work&&ui._work.id===c.job_id?ui._work:null)):null;
  const du=sozDurum(c); const {toplam,eksik}=sozToplam(c);
  const it=(c.contract_items||[]).slice().sort((a,b)=>a.sort-b.sort||a.id-b.id);
  const benim=(ui._me&&ui._me.id)||0;
  const silinebilir=c.status==='taslak'&&(isAdmin()||c.created_by_team_id===benim);
  const kdvli=toplam!=null&&c.vat_mode==='haric'&&c.vat_rate!=null?toplam*(1+(+c.vat_rate)/100):null;
  const docs=(c.document_links||[]).map(l=>l.documents).filter(Boolean);
  modal(`<div class="sz-dh">
      <div><h3 style="margin:0">${esc(c.title)}</h3>
        <p class="muted" style="margin:4px 0 0;font-size:12.5px">${c.reference_no?esc(c.reference_no)+' · ':''}<span class="pill ${du.cls}">${esc(du.lbl)}</span>${c.signed_at?' · imza '+esc(sozGun(c.signed_at)):''}${c.cancelled_at?' · iptal '+esc(sozGun(c.cancelled_at)):''}</p></div>
    </div>
    <div class="sz-sec"><div class="tc-h">Bağlam</div>
      <div class="meta" style="line-height:1.9">
        Kurum: <button type="button" class="btn-link" onclick="closeModal();orgAc(${c.customer_id})">${esc((cu&&cu.firma)||('#'+c.customer_id))}</button><br>
        İş: ${c.job_id?`<button type="button" class="btn-link" onclick="closeModal();workAc(${c.job_id})">${esc((jb&&jb.title)||('#'+c.job_id))}</button>`:'<span class="muted">kurum düzeyinde (işe bağlı değil)</span>'}<br>
        Teklif: ${c.quote_id?`<button type="button" class="btn-link" onclick="closeModal();quoteView(${c.quote_id})">Teklif #${c.quote_id}</button>`:'<span class="muted">bağlı değil</span>'}
      </div></div>
    <div class="sz-sec"><div class="tc-h">Kalemler <span class="chip">${it.length}</span></div>
      ${it.length?`<div class="sz-tw"><table class="tbl sz-tbl"><thead><tr><th>Tür</th><th>Kapsam</th><th style="text-align:right">Adet</th><th>Dönem</th><th style="text-align:right">Birim</th><th style="text-align:right">Tutar</th></tr></thead><tbody>
        ${it.map(i=>{ const u=ui._sozUnits[i.unit_id]; const v=sozSatirTutar(i);
          return `<tr><td>${esc(sozKalemLbl(i.item_type))}</td>
            <td><b>${esc(i.description||sozUnitAd(u)||'—')}</b>${u&&i.description?`<div class="sz-sub">${esc(sozUnitAd(u))}</div>`:''}${i.note?`<div class="sz-sub">${esc(i.note)}</div>`:''}</td>
            <td style="text-align:right">${esc(String(i.quantity).replace(/\.0+$/,''))}</td>
            <td>${i.start_date||i.end_date?esc(sozGun(i.start_date)+' – '+sozGun(i.end_date)):''}${i.duration_note?`<div class="sz-sub">${esc(i.duration_note)}</div>`:''}</td>
            <td style="text-align:right">${esc(sozPara(i.unit_price,c.currency))}</td>
            <td style="text-align:right"><b>${esc(sozPara(v,c.currency))}</b></td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="sz-top"><span>Toplam ${esc(SOZ_KDV[c.vat_mode]||'')}</span><b>${esc(sozPara(toplam,c.currency)||'—')}</b>
          ${kdvli!=null?`<span class="muted">KDV dahil (%${esc(String(+c.vat_rate))}) ≈ ${esc(sozPara(kdvli,c.currency))}</span>`:''}
          ${eksik?`<span class="muted">${eksik} kalemde tutar yok</span>`:''}</div>`
        :'<p class="empty">Henüz kalem yok. Taslak boş kalabilir; imzalı sözleşmenin en az bir kalemi olmalı.</p>'}
      <p class="fhint">Kalemler ticari kayıttır; rezervasyon, doluluk ya da LED yayını oluşturmaz.</p></div>
    ${c.payment_terms||c.note?`<div class="sz-sec"><div class="tc-h">Ödeme ve notlar</div>
      ${c.payment_terms?`<p class="sz-pre"><b>Ödeme:</b> ${esc(c.payment_terms)}</p>`:''}
      ${c.note?`<p class="sz-pre">${esc(c.note)}</p>`:''}</div>`:''}
    <div class="sz-sec"><div class="tc-h">Belgeler <span class="chip">${docs.length}</span>
        <button type="button" class="btn btn-outline btn-sm" style="margin-left:auto" onclick="belgeEkleAc({contractId:${c.id},baslik:${esc(JSON.stringify(c.title))}})">${ic('plus',15)} Belge Ekle</button></div>
      ${docs.length?ekSeridi(c.document_links):'<p class="empty">Belge yok. İmzalı kopya geldiğinde eklenebilir.</p>'}</div>
    <div class="sz-act">
      ${silinebilir?`<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="sozSil(${c.id})">Taslağı sil</button>`:''}
      ${c.status!=='iptal'?`<button class="btn btn-ghost btn-sm" onclick="sozIptal(${c.id})">İptal et</button>`:''}
      ${c.status==='taslak'?`<button class="btn btn-outline btn-sm" onclick="sozImzala(${c.id})">İmzalı işaretle</button>`:''}
      ${c.status!=='iptal'||isAdmin()?`<button class="btn btn-primary btn-sm" onclick="sozForm({id:${c.id}})">Düzenle</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button></div>`);
  const m=document.getElementById('modal'); if(m) m.classList.add('mdl-gen');
}
async function sozImzala(id){
  const c=ui._soz; if(!c) return;
  if(!(c.contract_items||[]).length){ mpAlert('İmzalı bir sözleşmenin en az bir kalemi olmalı. Önce kalem ekleyin.','Sözleşme'); return; }
  if(!await mpConfirm('“'+c.title+'” imzalı olarak işaretlensin mi? İmza tarihi bugün olarak yazılır (Düzenle ile değiştirilebilir).','İmzalı işaretle',{danger:false,ok:'İmzalı işaretle'})) return;
  const r=await guard(()=>api('contract_status',{id,status:'imzali',signed_at:c.signed_at||_cIso(new Date())}),'İşaretlenemedi'); if(r===null) return;
  toast('Sözleşme imzalı olarak işaretlendi.'); await ekranTazele(); sozAc(id);
}
async function sozIptal(id){
  const c=ui._soz; if(!c) return;
  if(!await mpConfirm('“'+c.title+'” iptal edilsin mi? İptal edilen sözleşme geçmiş olarak kalır, silinmez ve yeniden açılamaz.','Sözleşmeyi iptal et',{danger:true,ok:'İptal et'})) return;
  const r=await guard(()=>api('contract_status',{id,status:'iptal'}),'İptal edilemedi'); if(r===null) return;
  toast('Sözleşme iptal edildi.'); await ekranTazele(); sozAc(id);
}
async function sozSil(id){
  if(!await mpConfirm('Bu taslak sözleşme kalıcı olarak silinsin mi? Bağlı belgeler silinmez; Hafıza > Belgeler\'de kalır.','Taslağı sil',{danger:true,ok:'Sil'})) return;
  const r=await guard(()=>api('contract_delete&id='+id),'Silinemedi'); if(r===null) return;
  closeModal(); toast('Taslak silindi.'); ekranTazele();
}

/* ---- Sozlesme olustur / duzenle: baslik + tekrarlayan kalem satirlari ---- */
async function sozForm(ctx){
  ctx=ctx||{};
  const veri=await guard(()=>Promise.all([
    ctx.id?api('contract_detail&id='+ctx.id):Promise.resolve(null),
    api('customers_list'), api('jobs_list'), sozUnitYukle(),
    api('quotes_list').catch(()=>[])]),'Form açılamadı');
  if(!veri) return;
  const [c0,cu,jobs,,qts]=veri;
  ui._cust=cu||[]; ui._jobs=jobs||[];
  const c=c0||{status:'taslak',currency:'TRY',vat_mode:'haric',vat_rate:20,contract_items:[]};
  const custId=c.customer_id||ctx.custId||((jobs||[]).find(j=>j.id===ctx.jobId)||{}).customer_id||0;
  const jobId=c0?c.job_id:(ctx.jobId||0);
  const doc=ctx.docId?_belgeler.get(ctx.docId):null;
  ui._szQuotes=qts||[];
  ui._szForm={id:c.id||0,docIds:ctx.docId?[ctx.docId]:[]};
  ui._szSatir=(c.contract_items||[]).slice().sort((a,b)=>a.sort-b.sort||a.id-b.id)
    .map(i=>({...i,_k:'k'+i.id,_elle:i.line_total!=null}));
  if(!ui._szSatir.length&&!c0) ui._szSatir=[{_k:'y'+Date.now(),item_type:'mecra',quantity:1}];
  const opt=(arr,val,lbl,bos)=>`${bos?`<option value="">${bos}</option>`:''}`+arr.map(x=>`<option value="${x.id}" ${String(val)===String(x.id)?'selected':''}>${esc(lbl(x))}</option>`).join('');
  modal(`<h3 style="margin:0 0 4px">${c.id?'Sözleşmeyi düzenle':'Yeni sözleşme kaydı'}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">Ticari anlaşmanın yapısal kaydı. Dosya ayrıca Belgeler'den eklenir; kalemler rezervasyon oluşturmaz.</p>
    ${doc?`<div class="qc-ctx"><span class="qc-lbl">Belge</span><b>${esc(belgeAd(doc))}</b><em>bu kayda bağlanacak (yeniden yüklenmez)</em></div>`:''}
    <div class="row2">
      <div class="field"><label class="flabel" for="szOrg">Kurum *</label>
        <select class="inp" id="szOrg" data-ara onchange="sozOrgDegis()">${opt((cu||[]).slice().sort((a,b)=>String(a.firma||'').localeCompare(String(b.firma||''),'tr')),custId,x=>x.firma||('#'+x.id),'— kurum seçin —')}</select></div>
      <div class="field"><label class="flabel" for="szJob">İş</label>
        <select class="inp" id="szJob" onchange="sozIsDegis()"></select>
        <p class="fhint">Kurum düzeyindeki çerçeve anlaşmalar işe bağlanmadan kaydedilebilir.</p></div></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="szTitle">Başlık *</label>
        <input class="inp" id="szTitle" value="${esc(c.title||'')}" placeholder="ör. M1 Adana AVM — Eylül kampanyası"></div>
      <div class="field"><label class="flabel" for="szRef">Referans / sözleşme no</label>
        <input class="inp" id="szRef" value="${esc(c.reference_no||'')}"></div></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="szSt">Durum</label>
        <select class="inp" id="szSt">${[['taslak','Taslak'],['imzali','İmzalı']].concat(c.status==='iptal'?[['iptal','İptal']]:[]).map(o=>`<option value="${o[0]}" ${c.status===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="szSigned">İmza tarihi</label>
        <input class="inp" type="date" id="szSigned" value="${esc(c.signed_at||'')}"></div></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="szQuote">İlgili yapısal teklif</label>
        <select class="inp" id="szQuote"></select>
        <p class="fhint">Yalnız açık bağlantı; otomatik eşleştirme yapılmaz.</p></div>
      <div class="field"><label class="flabel">Para birimi · KDV</label>
        <div style="display:flex;gap:6px">
          <select class="inp" id="szCur" style="max-width:90px">${['TRY','USD','EUR'].map(x=>`<option ${c.currency===x?'selected':''}>${x}</option>`).join('')}</select>
          <select class="inp" id="szVat">${Object.entries(SOZ_KDV).map(([k,v])=>`<option value="${k}" ${c.vat_mode===k?'selected':''}>${v}</option>`).join('')}</select>
          <input class="inp" id="szVatR" type="number" min="0" max="100" step="1" style="max-width:74px" aria-label="KDV oranı %" value="${c.vat_rate!=null?esc(c.vat_rate):''}" placeholder="%"></div></div></div>

    <div class="tc-h" style="margin-top:6px">Kalemler</div>
    <div class="sz-ed" id="szKalem"></div>
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0 12px">
      <button type="button" class="btn btn-outline btn-sm" onclick="sozSatirEkle()">${ic('plus',15)} Kalem ekle</button>
      <span class="fhint" id="szTop" style="margin:0 0 0 auto"></span></div>

    <div class="field"><label class="flabel" for="szPay">Ödeme koşulları</label>
      <textarea class="inp" id="szPay" rows="2" placeholder="ör. Fatura tarihinden itibaren 90 gün vadeli çek">${esc(c.payment_terms||'')}</textarea></div>
    <div class="field"><label class="flabel" for="szNote">Not</label>
      <textarea class="inp" id="szNote" rows="2">${esc(c.note||'')}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="sozKaydet()">Kaydet</button></div>`);
  const m=document.getElementById('modal'); if(m) m.classList.add('mdl-gen');
  sozOrgDegis(jobId, c.quote_id||ctx.quoteId||'');
  sozSatirCiz();
  const t=document.getElementById('szTitle'); if(t&&!t.value&&doc) t.value=belgeAd(doc).replace(/\.[a-z0-9]{2,5}$/i,'');
}
function sozOrgDegis(jobSec,quoteSec){
  const org=+gv('szOrg')||0;
  const js=document.getElementById('szJob'), qs=document.getElementById('szQuote'); if(!js||!qs) return;
  const cur=jobSec!==undefined?jobSec:+gv('szJob');
  const isler=(ui._jobs||[]).filter(j=>org&&j.customer_id===org);
  js.innerHTML=`<option value="">— işe bağlı değil —</option>`+isler.map(j=>`<option value="${j.id}" ${String(cur)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('');
  const qcur=quoteSec!==undefined?quoteSec:gv('szQuote');
  const jid=+js.value||0;
  const qlist=(ui._szQuotes||[]).filter(q=>(org&&q.customer_id===org)||(jid&&q.work_id===jid)||String(q.id)===String(qcur));
  qs.innerHTML=`<option value="">— bağlı değil —</option>`+qlist.map(q=>`<option value="${q.id}" ${String(qcur)===String(q.id)?'selected':''}>Teklif #${q.id}${q.revision_no>1?' rev '+q.revision_no:''} · ${esc(money(q.total))}</option>`).join('');
}
function sozIsDegis(){ sozOrgDegis(+gv('szJob'), gv('szQuote')); }
function sozSatirOku(){
  document.querySelectorAll('#szKalem .sz-er').forEach(r=>{
    const s=ui._szSatir.find(x=>x._k===r.dataset.k); if(!s) return;
    const g=n=>{ const e=r.querySelector('[data-f="'+n+'"]'); return e?e.value:''; };
    s.item_type=g('item_type'); s.description=g('description'); s.unit_id=g('unit_id')||null;
    s.quantity=g('quantity'); s.start_date=g('start_date')||null; s.end_date=g('end_date')||null;
    s.duration_note=g('duration_note'); s.unit_price=g('unit_price'); s.line_total=g('line_total');
  });
}
function sozSatirCiz(){
  const box=document.getElementById('szKalem'); if(!box) return;
  const L=ui._sozUnitList||[];
  const gr={}; L.forEach(u=>{ const k=(u.mecra||'—')+' · '+(u.urun||''); (gr[k]=gr[k]||[]).push(u); });
  const uOpt=sel=>`<option value="">— envanter bağlantısı yok —</option>`+Object.entries(gr).map(([k,us])=>
    `<optgroup label="${esc(k)}">${us.map(u=>`<option value="${u.id}" ${String(sel)===String(u.id)?'selected':''}>${esc(u.name)} · ${esc(u.urun||'')}${u.olcu?' · '+esc(u.olcu):''}</option>`).join('')}</optgroup>`).join('');
  box.innerHTML=ui._szSatir.length?ui._szSatir.map((s,ix)=>`<div class="sz-er" data-k="${s._k}">
      <div class="sz-r1">
        <select class="inp inp-sm" data-f="item_type" aria-label="Kalem türü">${SOZ_KALEM.map(t=>`<option value="${t[0]}" ${s.item_type===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select>
        <input class="inp inp-sm" data-f="description" aria-label="Kapsam / açıklama" placeholder="Kapsam — ör. Megalight P3-A / Kurttepe duvar 4,3×4,7 m / LED 15 sn" value="${esc(s.description||'')}">
        <select class="inp inp-sm sz-unit" data-f="unit_id" aria-label="Envanter pozisyonu (isteğe bağlı)">${uOpt(s.unit_id)}</select>
        <button type="button" class="ek-x" aria-label="Kalemi çıkar" onclick="sozSatirSil('${s._k}')">✕</button></div>
      <div class="sz-r2">
        <label>Adet<input class="inp inp-sm" data-f="quantity" type="number" min="0.01" step="0.01" value="${esc(s.quantity??1)}" oninput="sozTutarVarsay('${s._k}')"></label>
        <label>Başlangıç<input class="inp inp-sm" data-f="start_date" type="date" value="${esc(s.start_date||'')}"></label>
        <label>Bitiş<input class="inp inp-sm" data-f="end_date" type="date" value="${esc(s.end_date||'')}"></label>
        <label>Süre notu<input class="inp inp-sm" data-f="duration_note" placeholder="12 Ay" value="${esc(s.duration_note||'')}"></label>
        <label>Birim fiyat<input class="inp inp-sm" data-f="unit_price" type="number" min="0" step="0.01" value="${esc(s.unit_price??'')}" oninput="sozTutarVarsay('${s._k}')"></label>
        <label>Satır tutarı<input class="inp inp-sm" data-f="line_total" type="number" min="0" step="0.01" value="${esc(s.line_total??'')}" oninput="sozTutarElle('${s._k}')"></label>
      </div></div>`).join('')
    :'<p class="empty">Kalem yok. Taslak boş kaydedilebilir.</p>';
  sozTopCiz();
}
function sozSatirEkle(){ sozSatirOku(); ui._szSatir.push({_k:'y'+Date.now()+Math.random().toString(36).slice(2,5),item_type:'mecra',quantity:1}); sozSatirCiz();
  const r=[...document.querySelectorAll('#szKalem .sz-er')].pop(); if(r){ const d=r.querySelector('[data-f="description"]'); if(d) d.focus(); } }
function sozSatirSil(k){ sozSatirOku(); ui._szSatir=ui._szSatir.filter(x=>x._k!==k); sozSatirCiz(); }
/* Adet x birim fiyat yalniz satir tutari ELLE girilmediyse varsayilan olur. */
function sozTutarVarsay(k){
  sozSatirOku(); const s=ui._szSatir.find(x=>x._k===k); if(!s) return;
  if(!s._elle&&s.unit_price!==''&&s.unit_price!=null){
    const v=(+s.quantity||1)*(+s.unit_price);
    const e=document.querySelector(`.sz-er[data-k="${k}"] [data-f="line_total"]`);
    if(e&&isFinite(v)){ e.value=String(Math.round(v*100)/100); s.line_total=e.value; }
  }
  sozTopCiz();
}
function sozTutarElle(k){ const s=ui._szSatir.find(x=>x._k===k); if(s) s._elle=true; sozSatirOku(); sozTopCiz(); }
function sozTopCiz(){
  const el=document.getElementById('szTop'); if(!el) return;
  const t=sozToplam({contract_items:ui._szSatir.map(s=>({...s,line_total:s.line_total===''?null:s.line_total,unit_price:s.unit_price===''?null:s.unit_price}))});
  el.textContent=t.toplam!=null?`Kalem toplamı: ${sozPara(t.toplam,gv('szCur')||'TRY')} ${SOZ_KDV[gv('szVat')]||''}`:'';
}
async function sozKaydet(){
  sozSatirOku();
  const org=+gv('szOrg'), title=(gv('szTitle')||'').trim(), st=gv('szSt');
  if(!org){ mpAlert('Kurum seçimi zorunlu.','Sözleşme'); return; }
  if(!title){ mpAlert('Başlık zorunlu.','Sözleşme'); return; }
  const satir=ui._szSatir.filter(s=>(s.description||'').trim()||s.unit_id);
  const bos=ui._szSatir.length-satir.length;
  if(bos&&!await mpConfirm(bos+' kalemde kapsam ya da envanter bağlantısı yok; bu kalemler kaydedilmeyecek. Devam edilsin mi?','Boş kalem',{danger:false,ok:'Devam'})) return;
  if(st==='imzali'&&!satir.length){ mpAlert('İmzalı bir sözleşmenin en az bir kalemi olmalı.','Sözleşme'); return; }
  for(const s of satir){ if(s.start_date&&s.end_date&&s.end_date<s.start_date){ mpAlert('Bir kalemde bitiş tarihi başlangıçtan önce.','Sözleşme'); return; } }
  const U=ui._sozUnits||{};
  const items=satir.map((s,ix)=>({id:s.id||null,item_type:s.item_type||'mecra',description:(s.description||'').trim()||null,
    unit_id:s.unit_id?+s.unit_id:null,mecra_id:s.unit_id&&U[s.unit_id]?U[s.unit_id].mecra_id:null,
    quantity:s.quantity===''||s.quantity==null?1:+s.quantity,start_date:s.start_date||null,end_date:s.end_date||null,
    duration_note:(s.duration_note||'').trim()||null,unit_price:s.unit_price===''||s.unit_price==null?null:+s.unit_price,
    line_total:s.line_total===''||s.line_total==null?null:+s.line_total,note:s.note||null,sort:ix}));
  const vr=gv('szVatR');
  const contract={id:ui._szForm.id||null,customer_id:org,job_id:+gv('szJob')||null,quote_id:+gv('szQuote')||null,
    title,reference_no:gv('szRef'),status:st,
    signed_at:gv('szSigned')||(st==='imzali'?_cIso(new Date()):null),
    currency:gv('szCur')||'TRY',vat_mode:gv('szVat')||'haric',vat_rate:vr===''?null:+vr,
    payment_terms:gv('szPay'),note:gv('szNote')};
  modalBusy(true);
  const r=await guard(()=>api('contract_save',{contract,items,doc_ids:ui._szForm.docIds}),'Sözleşme kaydedilemedi');
  modalBusy(false); if(r===null) return;
  closeModal(); toast(ui._szForm.id?'Sözleşme güncellendi.':'Sözleşme kaydı oluşturuldu.');
  await ekranTazele(); sozAc(r.id);
}

/* ============ BELGELER: Work ve Kurum yuzeyi (S6 §35-§41) ============= */
/* S10: İş detayındaki belge sekmeleri Hafıza > Belgeler ile AYNI
   kategorileri kullanır (BELGE_KAT); iki ayrı sınıflandırma yok. */
const BELGE_GRUP=[['tumu','Tümü',()=>true],
  ...BELGE_KAT.map(k=>[k[0],k[1],d=>belgeKat(d.doc_type)[0]===k[0]])];

/* Work'un belgeleri: dogrudan + guncellemeler + operasyonlar + teklifler.
   Ayni belge birden cok yoldan geliyorsa TEK satir, kaynaklar birlesik. */
function workBelgeListe(d){
  const m=new Map();
  const ekle=(l,kaynak,direkt)=>{ const doc=l&&l.documents; if(!doc) return; belgeKaydet(doc);
    let x=m.get(doc.id); if(!x){ x={doc,kaynaklar:[],direkt:null}; m.set(doc.id,x); }
    if(!x.kaynaklar.includes(kaynak)) x.kaynaklar.push(kaynak);
    if(direkt) x.direkt=l; };
  ((d.job||{}).document_links||[]).forEach(l=>ekle(l,'Doğrudan iş',true));
  (d.entries||[]).forEach(e=>(e.document_links||[]).forEach(l=>ekle(l,'Güncelleme')));
  (d.ops||[]).forEach(o=>(o.document_links||[]).forEach(l=>ekle(l,opTypeLbl(o.operation_type))));
  (d.quotes||[]).forEach(q=>(q.document_links||[]).forEach(l=>ekle(l,'Teklif #'+q.id)));
  (d.contracts||[]).forEach(c=>(c.document_links||[]).forEach(l=>ekle(l,'Sözleşme kaydı')));
  return [...m.values()].sort((a,b)=>String(b.doc.created_at||'').localeCompare(String(a.doc.created_at||'')));
}
function belgeSatirHtml(x,ctx){
  const d=x.doc, tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const benim=(ui._me&&ui._me.id)||0;
  const resim=belgeResimMi(d);
  const menuVar=(x.direkt&&(isAdmin()||x.direkt.created_by_team_id===benim||d.uploaded_by_team_id===benim))
    ||isAdmin()||d.uploaded_by_team_id===benim
    ||(ctx.tip==='is'&&ctx.orgId);
  return `<div class="bl-row" data-doc="${d.id}">
    ${resim?`<button type="button" class="bl-th sm" onclick="belgeAc(${d.id})" aria-label="${esc(belgeAd(d))} — önizle"><img data-belge-yol="${esc(d.storage_path)}" alt="" loading="lazy"></button>`
      :`<span class="bl-ext ${d.provider==='external'?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span>`}
    <div class="bl-rb">
      <button type="button" class="bl-rt" onclick="belgeDetay(${d.id})" title="${esc(belgeAd(d))} — ayrıntılar ve ilişkiler">${esc(belgeAd(d))}${d.provider==='external'?' <span class="bl-dis">↗</span>':''}</button>
      <div class="bl-rs"><span class="pill">${esc(belgeTurLbl(d.doc_type))}</span>
        <span>${esc(trTarih(d.created_at))}</span>
        ${tm[d.uploaded_by_team_id]?`<span>${esc(tm[d.uploaded_by_team_id])}</span>`:''}
        ${x.kaynaklar&&x.kaynaklar.length?`<span class="bl-kay">${esc(x.kaynaklar.join(' · '))}</span>`:''}
        ${d.provider==='external'?'<span class="bl-kay">harici bağlantı</span>':(d.size_bytes?`<span>${esc(belgeBoyut(d.size_bytes))}</span>`:'')}
      </div></div>
    <div class="bl-ra">
      <button type="button" class="btn btn-outline btn-sm" onclick="belgeAc(${d.id})">Aç</button>
      ${menuVar?`<button type="button" class="pu-mb" aria-label="Belge seçenekleri" title="Seçenekler"
        onclick="belgeMenu(event,${d.id},${x.direkt?x.direkt.id:0},'${ctx.tip}',${ctx.id||0},${ctx.orgId||0})">⋯</button>`:''}
    </div></div>`;
}
function workBelgeCiz(){
  const box=document.getElementById('wBelgeler'); if(!box) return;
  const d=ui._workDetay; if(!d) return;
  const hep=workBelgeListe(d);
  const say=document.getElementById('wBelgeSayi'); if(say) say.textContent=String(hep.length);
  if(!hep.length){ box.innerHTML='<p class="empty">Henüz belge yok.</p>'; return; }
  const aktifGrup=BELGE_GRUP.filter(g=>g[0]==='tumu'||hep.some(x=>g[2](x.doc)));
  let f=ui._blFiltre||'tumu'; if(!aktifGrup.some(g=>g[0]===f)) f='tumu';
  const g=BELGE_GRUP.find(x=>x[0]===f);
  const liste=hep.filter(x=>g[2](x.doc));
  box.innerHTML=`${aktifGrup.length>2?`<div class="ws-switch inline bl-f" role="group" aria-label="Belge türü">
      ${aktifGrup.map(x=>`<button type="button" class="${x[0]===f?'on':''}" aria-pressed="${x[0]===f}"
        onclick="ui._blFiltre='${x[0]}';workBelgeCiz()">${x[1]} <span class="chip">${hep.filter(y=>x[2](y.doc)).length}</span></button>`).join('')}
    </div>`:''}
    <div class="bl-list">${liste.map(x=>belgeSatirHtml(x,{tip:'is',id:d.job.id,orgId:d.job.customer_id||0})).join('')}</div>`;
}
/* Kurum: once DOGRUDAN kurum belgeleri; is belgelerinden yalniz birkac
   yeni olan, acikca "İş:" etiketiyle (S6 §40). Her gecmis isin tum
   dosyalari varsayilan ekrana DOKULMEZ. */
function orgBelgeKart(d){
  const o=d.org;
  const direkt=(o.document_links||[]).filter(l=>l.documents)
    .map(l=>({doc:belgeKaydet(l.documents),kaynaklar:['Kurum'],direkt:l}))
    .sort((a,b)=>String(b.doc.created_at||'').localeCompare(String(a.doc.created_at||'')));
  const gor=new Set(direkt.map(x=>x.doc.id));
  const isten=[];
  (d.jobs||[]).forEach(j=>(j.document_links||[]).forEach(l=>{ const doc=l.documents;
    if(!doc||gor.has(doc.id)) return; gor.add(doc.id);
    isten.push({doc:belgeKaydet(doc),kaynaklar:['İş: '+orgKisa(j.title,40)],direkt:null,jobId:j.id}); }));
  isten.sort((a,b)=>String(b.doc.created_at||'').localeCompare(String(a.doc.created_at||'')));
  const n=direkt.length+isten.length;
  return `<div class="sec-card">
    <div class="sec-head" style="margin-bottom:10px">
      <h4 style="font-size:14px;margin:0">Belgeler <span class="chip">${direkt.length}</span></h4>
      <button class="btn btn-outline btn-sm" onclick="belgeEkleAc({custId:${o.id}})">${ic('plus',15)} Belge Ekle</button></div>
    ${n?'':'<p class="empty">Henüz belge yok.</p>'}
    ${direkt.length?`<div class="bl-list">${direkt.map(x=>belgeSatirHtml(x,{tip:'kurum',id:o.id})).join('')}</div>`:''}
    ${isten.length?`<div class="meta" style="margin:${direkt.length?'12px':'0'} 0 6px">İşlerden — son eklenenler</div>
      <div class="bl-list">${isten.slice(0,5).map(x=>belgeSatirHtml(x,{tip:'kurumIs',id:o.id})).join('')}</div>
      ${isten.length>5?`<p class="fhint">+${isten.length-5} belge daha ilgili işlerin Belgeler bölümünde.</p>`:''}`:''}
  </div>`;
}
/* İş / Kurum / Sözleşme içindeki "Belge Ekle" artık TEK belge formunu
   bağlamı önceden seçili açar (S10 §4). */
function belgeEkleAc(ctx){ return belgeForm(ctx||{}); }

/* ============ BELGE FORMU (S10 §4) ======================================
   TEK form, TEK kayıt akışı: global "Hafızaya Ekle > Belge", Hafıza >
   Belgeler "Belge ekle" ve İş / Kurum / Sözleşme içindeki "Belge Ekle".
   Önce dosya ya da bağlantı; tek belgede başlık dosya adından önerilir ve
   düzenlenir; kategori, açıklama ve ilişkiler kolayca eklenir. İlişki
   bilinmiyorsa belge "İlişkilendirilmemiş" kaydedilir — sahte iş/kurum
   OLUŞTURULMAZ. Bağlamsız açılışta hiçbir iş/kurum ÖNCEDEN SEÇİLMEZ.
   Yükleme ve kayıt S6 ek bileşeniyle yapılır (durum, tekrar dene, kayıt
   hatasında dosya temizliği, kapatınca kaydedilmemiş yüklemeyi geri al). */
async function belgeForm(ctx){
  ctx=ctx||{};
  const veri=await guard(()=>Promise.all([api('customers_min'),api('jobs_list'),api('contracts_min').catch(()=>[])]),'Form açılamadı');
  if(!veri) return;
  const [cu,jobs,cs]=veri;
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  const ctr=(cs||[]).find(c=>c.id===ctx.contractId)||null;
  const onIs=ctx.jobId||(ctr&&ctr.job_id)||'';
  const onKurum=ctx.custId||(onIs&&jm[onIs]&&jm[onIs].customer_id)||(ctr&&ctr.customer_id)||'';
  ui._bf={ctx,cu:(cu||[]).slice().sort((a,b)=>String(a.firma||'').localeCompare(String(b.firma||''),'tr')),
          jobs:jobs||[],jm,cs:cs||[],basOtomatik:true,kayit:false};
  /* S7 §41 / S7.1 §21: sözleşmeden açılınca kategori önceden Sözleşme,
     Ticari'den teklif/sözleşme olarak açılınca o (düzeltilebilir). */
  const on=ctx.tur||(ctx.contractId?'sozlesme':null);
  ekYeni('bf',on?{varsayilan:on,varsayilanResim:on,degisti:bfDegisti}
                :{turZorunlu:true,tahmin:true,degisti:bfDegisti});
  const baglamYazi=ctr?`Sözleşme: <b>${esc(ctr.title||'#'+ctr.id)}</b>`
    :ctx.jobId&&jm[ctx.jobId]?`İş: <b>${esc(jm[ctx.jobId].title)}</b>`
    :ctx.custId?`Kurum: <b>${esc(orgKisa((ui._bf.cu.find(x=>x.id===ctx.custId)||{}).firma||'#'+ctx.custId,50))}</b>`
    :'Dosyayı ya da bağlantıyı ekleyin; ilişki bilinmiyorsa sonra da bağlanabilir.';
  modal(`<h3 style="margin:0 0 4px">${on==='sozlesme'&&!ctx.contractId?'Sözleşme Belgesi Ekle':on==='teklif'?'Teklif Belgesi Ekle':'Belge ekle'}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">${baglamYazi}</p>
    ${ekAlan('bf')}
    <div class="field" id="bfTek" hidden style="margin-top:10px"><label class="flabel" for="bfBaslik">Başlık</label>
      <input class="inp" id="bfBaslik" maxlength="200" oninput="ui._bf.basOtomatik=false">
      <p class="fhint" style="margin:4px 0 0">Dosya adından önerildi; listede ve aramada bu ad görünür. Orijinal dosya adı ayrıca saklanır.</p></div>
    <div class="field" style="margin-top:10px"><label class="flabel" for="bfNot">Kısa açıklama <span class="muted">— isteğe bağlı</span></label>
      <textarea class="inp" id="bfNot" rows="2" maxlength="500" placeholder="ör. Müşteriye gönderilen ikinci revizyon"></textarea></div>
    <fieldset class="bf-rel"><legend>İlişkiler <span class="muted">— isteğe bağlı</span></legend>
      <div class="row2">
        <div class="field"><label class="flabel" for="bfKurum">Kurum</label>
          <select class="inp" id="bfKurum" data-ara onchange="bfKurumDegis()"></select></div>
        <div class="field"><label class="flabel" for="bfIs">İş</label>
          <select class="inp" id="bfIs" onchange="bfIsDegis()"></select></div>
      </div>
      <div class="field"><label class="flabel" for="bfSoz">Sözleşme kaydı</label>
        <select class="inp" id="bfSoz" onchange="bfIliskiYaz()"></select>
        <p class="fhint" style="margin:4px 0 0">Belgeyi mevcut bir sözleşme kaydına ekler; sözleşme kalemi, imza durumu ya da rezervasyon oluşturmaz.</p></div>
      <label class="qc-who" id="bfOrgSar" hidden><input type="checkbox" id="bfOrg"><span>Kurumun belgelerinde de görünsün</span></label>
      <p class="fhint bf-ozet" id="bfIliski" aria-live="polite"></p>
    </fieldset>
    <p class="bf-dur" id="bfDurum" role="status" aria-live="polite"></p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="bfKaydet" onclick="bfKaydet()">Kaydet</button></div>`);
  bfKurumCiz(onKurum); bfIsCiz(onIs); bfSozCiz(ctx.contractId||''); bfIliskiYaz();
}
function bfKurumCiz(sec){
  const s=document.getElementById('bfKurum'); if(!s) return;
  s.innerHTML='<option value="">— Seçilmedi —</option>'+ui._bf.cu.map(c=>
    `<option value="${c.id}" ${String(sec)===String(c.id)?'selected':''}>${esc(orgKisa(c.firma||('#'+c.id),60))}</option>`).join('');
}
/* İş seçeneği kurumla daralır; açık işler önce, arşiv işleri etiketli. */
function bfIsCiz(sec){
  const s=document.getElementById('bfIs'); if(!s) return;
  const k=gv('bfKurum');
  const l=ui._bf.jobs.filter(j=>!k||String(j.customer_id)===String(k))
    .sort((a,b)=>((a.lifecycle_status==='kapandi')-(b.lifecycle_status==='kapandi'))||String(a.title).localeCompare(String(b.title),'tr'));
  s.innerHTML=`<option value="">${k&&!l.length?'— Bu kurumun işi yok —':'— Seçilmedi —'}</option>`+l.map(j=>
    `<option value="${j.id}" ${String(sec)===String(j.id)?'selected':''}>${esc(j.title)}${j.lifecycle_status==='kapandi'?' (arşiv)':''}</option>`).join('');
}
function bfSozCiz(sec){
  const s=document.getElementById('bfSoz'); if(!s) return;
  const k=gv('bfKurum'), is=gv('bfIs');
  const l=ui._bf.cs.filter(c=>is?(String(c.job_id)===String(is)||(!c.job_id&&String(c.customer_id)===String(k)))
                               :k?String(c.customer_id)===String(k):true);
  s.innerHTML=`<option value="">— Bağlı değil —</option>`+l.map(c=>
    `<option value="${c.id}" ${String(sec)===String(c.id)?'selected':''}>${esc(c.title||('Sözleşme #'+c.id))}${c.reference_no?' · '+esc(c.reference_no):''}${c.status==='taslak'?' · taslak':''}</option>`).join('');
  s.disabled=!l.length&&!sec;
}
function bfKurumDegis(){ const is=gv('bfIs'); const j=ui._bf.jm[is];
  bfIsCiz(j&&String(j.customer_id)===String(gv('bfKurum'))?is:''); bfSozCiz(gv('bfSoz')); bfIliskiYaz(); }
/* İş seçilince kurum işten türer (boşsa); çelişkili İş A / Kurum B oluşmaz. */
function bfIsDegis(){ const j=ui._bf.jm[gv('bfIs')];
  if(j&&j.customer_id&&!gv('bfKurum')){ bfKurumCiz(j.customer_id); bfIsCiz(j.id); }
  bfSozCiz(gv('bfSoz')); bfIliskiYaz(); }
/* Seçimden bağlantı listesi — gereksiz tekrar yazılmaz: işin kendi kurumu
   ayrıca "kurum belgesi" yapılmaz (isteğe bağlı kutu hariç), sözleşmenin
   kendi işi ayrıca bağlanmaz (iş detayı sözleşme belgelerini zaten okur). */
function bfBaglantilar(){
  const k=+gv('bfKurum')||0, is=+gv('bfIs')||0, sz=+gv('bfSoz')||0;
  const c=ui._bf.cs.find(x=>x.id===sz)||null, j=ui._bf.jm[is]||null;
  const out=[];
  if(sz) out.push({contract_id:sz});
  if(is&&!(c&&c.job_id===is)) out.push({job_id:is});
  const kurumuKapsanir=(j&&j.customer_id===k)||(c&&c.customer_id===k);
  if(k&&(!kurumuKapsanir||(document.getElementById('bfOrg')||{}).checked)) out.push({customer_id:k});
  return out;
}
function bfIliskiYaz(){
  const el=document.getElementById('bfIliski'); if(!el) return;
  const k=+gv('bfKurum')||0, is=+gv('bfIs')||0;
  const j=ui._bf.jm[is]||null;
  const sar=document.getElementById('bfOrgSar');
  if(sar) sar.hidden=!(k&&j&&j.customer_id===k);
  el.innerHTML=bfBaglantilar().length?'':'Hiçbir ilişki seçilmedi: belge <b>İlişkilendirilmemiş</b> olarak kaydedilir ve sonra bağlanabilir.';
}
/* Tek belge varken başlık alanı görünür; dosya adından önerilir. */
function bfDegisti(){
  const tek=document.getElementById('bfTek'), inp=document.getElementById('bfBaslik'); if(!tek||!inp) return;
  const bek=ekBekleyen('bf').filter(i=>!i.gecersiz);
  tek.hidden=bek.length!==1;
  if(bek.length===1&&ui._bf.basOtomatik){
    const ad=String(bek[0].ad||''); const n=ad.lastIndexOf('.');
    inp.value=(bek[0].tip==='dosya'&&n>0)?ad.slice(0,n):ad;
  }
  const d=document.getElementById('bfDurum'); if(d&&!ui._bf.kayit) d.textContent='';
}
async function bfKaydet(){
  const f=ui._bf; if(!f||f.kayit) return;               // çift tıklama tek kayıt
  const bek=ekBekleyen('bf').filter(i=>!i.gecersiz);
  if(!bek.length){ mpAlert('Önce bir dosya seçin ya da harici bağlantı ekleyin.','Belge'); return; }
  if(ekTurEksik('bf')){ mpAlert('Her belge için kategori seçin.','Belge'); return; }
  const baslik=(gv('bfBaslik')||'').trim(), not=(gv('bfNot')||'').trim();
  bek.forEach(i=>{ i.baslik=bek.length===1?(baslik||null):null; i.not=not||null; });
  const links=bfBaglantilar();
  const btn=document.getElementById('bfKaydet'), dur=document.getElementById('bfDurum');
  f.kayit=true; if(btn){ btn.disabled=true; btn.textContent='Kaydediliyor…'; }
  const dosyaSay=bek.filter(i=>i.tip==='dosya'&&!i.yol).length;
  if(dur){ dur.className='bf-dur'; dur.textContent=dosyaSay?`${dosyaSay} dosya yükleniyor…`:'Kaydediliyor…'; }
  const g=await ekGonder('bf',links);
  f.kayit=false; if(btn){ btn.disabled=false; btn.textContent='Kaydet'; }
  if(!g.ok){
    if(dur){ dur.className='bf-dur hata'; dur.textContent=g.belirsiz
      ? 'Sonuç doğrulanamadı — dosyalar korunuyor. Kaydet ile tekrar denemek güvenli: belge kaydedildiyse ikinci kez oluşturulmaz.'
      : 'Kaydedilemedi: '+g.hata+' — dosyalar geri alındı; Kaydet ile tekrar deneyin.'; }
    return;
  }
  closeModal();
  toast(g.sayi>1?`${g.sayi} belge eklendi.`:(links.length?'Belge eklendi.':'Belge eklendi — İlişkilendirilmemiş.'));
  if(f.ctx.contractId){ await ekranTazele(); sozAc(f.ctx.contractId); return; }
  if(document.getElementById('blListe')){ blListeCiz(); return; }
  await ekranTazele();
}

/* ============ BELGE DETAYI (S10 §5) ====================================
   Önizleme (resim, PDF) ya da açık aç/indir; bilgiler; ilişkiler (işe,
   kuruma, sözleşmeye git); bilgi ve ilişki düzenleme; güvenilir geçmiş.
   "Düzenle" DOSYA İÇERİĞİNİ değiştirmez; yeni sürüm yükleme yoktur ve
   dosya sessizce üzerine yazılmaz. Görüntüleme hareket ÜRETMEZ. */
const BD_TIP={job_id:'İş',customer_id:'Kurum',contract_id:'Sözleşme',entry_id:'Güncelleme',
              operation_id:'Baskı / Montaj',quote_id:'Teklif',contact_id:'Kişi'};
async function belgeDetay(id){
  puMenuKapat&&puMenuKapat();
  const r=await guard(()=>Promise.all([api('document_detail&id='+id),api('document_history&id='+id).catch(()=>[]),
    (ui._team&&ui._team.length)?Promise.resolve(ui._team):api('team_list')]),'Belge açılamadı');
  if(!r) return;
  const [d,hist,team]=r;
  if(!d){ mpAlert('Belge bulunamadı ya da görme yetkiniz yok.','Belge'); return; }
  ui._team=team||ui._team; belgeKaydet(d); ui._bd={d,hist:hist||[],duzen:false,bagla:false};
  bdCiz();
  navBelge(d.id);                                 /* S14: açık belge adreste */
}
function bdYetki(d){ const benim=(ui._me&&ui._me.id)||0; return isAdmin()||d.uploaded_by_team_id===benim; }
function bdBagSatir(l,d){
  const benim=(ui._me&&ui._me.id)||0;
  const tip=Object.keys(BD_TIP).find(k=>l[k]!=null);
  let ad='', git='';
  if(tip==='job_id'&&l.jobs){ ad=l.jobs.title; git=`closeModal();workAc(${l.job_id},{bolum:'belge',docId:${d.id}})`; }
  else if(tip==='customer_id'&&l.customers){ ad=orgKisa(l.customers.firma||'',60); git=`closeModal();orgAc(${l.customer_id})`; }
  else if(tip==='contract_id'&&l.contracts){ ad=l.contracts.title||('Sözleşme #'+l.contract_id); git=`closeModal();sozAc(${l.contract_id})`; }
  else if(tip==='entry_id'&&l.entries){ ad=String(l.entries.body||'').trim().slice(0,70)||'(yalnız dosyalı güncelleme)';
    if(l.entries.job_id) git=`closeModal();workAc(${l.entries.job_id},{entryId:${l.entry_id}})`; }
  else if(tip==='operation_id'&&l.work_operations){ ad=opTypeLbl(l.work_operations.operation_type)+(l.work_operations.planned_date?' · '+trTarih(l.work_operations.planned_date):'');
    git=`closeModal();workAc(${l.work_operations.job_id},{bolum:'op',opId:${l.operation_id}})`; }
  else if(tip==='quote_id'){ ad='Teklif #'+l.quote_id; git=`closeModal();quoteView(${l.quote_id})`; }
  else if(tip==='contact_id'&&l.contacts){ ad=l.contacts.name; git=`closeModal();personAc(${l.contact_id})`; }
  /* Güncellemenin eki güncellemenin kendisinden düzenlenir (yazar kuralı). */
  const kaldir=tip!=='entry_id'&&(isAdmin()||d.uploaded_by_team_id===benim||l.created_by_team_id===benim);
  return `<li class="bd-bag"><span class="bd-bt">${esc(BD_TIP[tip]||'Bağlam')}</span>
    ${git?`<button type="button" class="btn-link bd-bn" onclick="${git}" title="${esc(ad)}">${esc(ad||'—')} ›</button>`:`<span class="bd-bn">${esc(ad||'—')}</span>`}
    ${kaldir?`<button type="button" class="ek-x" onclick="bdBagKaldir(${l.id})" aria-label="${esc(BD_TIP[tip])} bağlantısını kaldır" title="Bağlantıyı kaldır — dosya silinmez">✕</button>`:''}</li>`;
}
function bdCiz(){
  const s=ui._bd; if(!s) return; const d=s.d;
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const yetki=bdYetki(d);
  const links=d.document_links||[];
  const dis=d.provider==='external', resim=belgeResimMi(d), pdf=!dis&&/pdf/.test(d.mime_type||'');
  const kat=belgeKat(d.doc_type);
  const bilgi=s.duzen?`<div class="bd-duz">
      <div class="field"><label class="flabel" for="bdAd">Başlık</label>
        <input class="inp" id="bdAd" maxlength="200" value="${esc(d.title||'')}" placeholder="${esc(d.original_name)}"></div>
      <div class="field"><label class="flabel" for="bdTur">Kategori</label>
        <select class="inp" id="bdTur">${BELGE_TUR.map(t=>`<option value="${t[0]}" ${d.doc_type===t[0]?'selected':''}>${esc(t[1])}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="bdNot">Açıklama</label>
        <textarea class="inp" id="bdNot" rows="2" maxlength="500">${esc(d.note||'')}</textarea></div>
      <p class="fhint">Dosyanın içeriği ve orijinal adı (${esc(d.original_name)}) değişmez.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="ui._bd.duzen=false;bdCiz()">Vazgeç</button>
        <button class="btn btn-primary btn-sm" id="bdKaydetB" onclick="bdKaydet()">Kaydet</button></div></div>`
    :`<dl class="md-dl bd-dl">
      <span>Kategori</span><b><span class="pill">${esc(kat[1])}</span>${belgeKatla(belgeTurLbl(d.doc_type))!==belgeKatla(kat[1])?` <span class="muted">${esc(belgeTurLbl(d.doc_type))}</span>`:''}</b>
      <span>Dosya</span><b class="bd-kir">${esc(d.original_name)} <span class="muted">· ${esc(dis?'harici bağlantı':[belgeUzanti(d),belgeBoyut(d.size_bytes)].filter(Boolean).join(' · '))}</span></b>
      <span>Eklenme</span><b>${esc(trTarih(d.created_at))}${tm[d.uploaded_by_team_id]?' · '+esc(tm[d.uploaded_by_team_id]):''}</b>
      ${d.updated_at?`<span>Düzenlendi</span><b class="muted">${esc(trTarih(d.updated_at))}</b>`:''}
      ${d.note?`<span>Açıklama</span><b class="bd-kir">${esc(d.note)}</b>`:''}</dl>`;
  const onizle=dis?`<div class="bd-onz bos"><span>Harici bağlantı — dosya bu uygulamada saklanmıyor.</span>
        <button class="btn btn-outline btn-sm" onclick="belgeAc(${d.id})">Bağlantıyı aç ↗</button></div>`
    :resim?`<div class="bd-onz"><img id="bdImg" alt="${esc(belgeAd(d))}"></div>`
    :pdf?`<div class="bd-onz"><iframe id="bdPdf" title="${esc(belgeAd(d))} — önizleme"></iframe></div>`
    :(()=>{ const s=belgeTurSinif(d);
        const ne=s==='t-xls'?'Excel / tablo dosyası':s==='t-doc'?'Word belgesi':s==='t-txt'?'Metin dosyası':'Dosya';
        const ac=s==='t-xls'?'Excel ya da uyumlu bir programla':s==='t-doc'?'Word ya da uyumlu bir programla':'ilgili programla';
        return `<div class="bd-onz bos"><span class="bl-ext big ${s}">${esc(belgeUzanti(d))}</span>
          <span><b>${esc(ne)}</b> · ${esc(belgeBoyut(d.size_bytes))}</span>
          <span>Bu biçim tarayıcıda önizlenmez; indirip ${esc(ac)} açın. Dosya dışarıya gönderilmez.</span>
          <button class="btn btn-primary btn-sm" onclick="belgeAc(${d.id},true)">İndir</button></div>`; })();
  modal(`<div class="bd-h"><span class="bl-ext ${dis?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span>
      <h3 class="bd-t">${esc(belgeAd(d))}</h3></div>
    ${onizle}
    <div class="bd-ac">
      ${dis?'':`<button class="btn btn-outline btn-sm" onclick="belgeAc(${d.id})">Aç</button>
      <button class="btn btn-ghost btn-sm" onclick="belgeAc(${d.id},true)">İndir</button>`}
      <span style="flex:1"></span>
      ${yetki&&!s.duzen?`<button class="btn btn-outline btn-sm" onclick="ui._bd.duzen=true;bdCiz()">Bilgileri düzenle</button>`:''}</div>
    <div class="sz-sec"><div class="tc-h">Bilgiler</div>${bilgi}</div>
    <div class="sz-sec"><div class="tc-h">İlişkiler <span class="chip">${links.length}</span>
        ${s.bagla?'':`<button type="button" class="btn btn-outline btn-sm" style="margin-left:auto" onclick="bdBaglaAc()">${ic('plus',15)} İlişki ekle</button>`}</div>
      ${links.length?`<ul class="bd-bags">${links.map(l=>bdBagSatir(l,d)).join('')}</ul>`
        :'<p class="empty" style="margin:4px 0">İlişkilendirilmemiş. Bir işe, kuruma ya da sözleşmeye bağlayabilirsiniz.</p>'}
      <div id="bdBagla"></div></div>
    ${s.hist.length?`<div class="sz-sec"><div class="tc-h">Geçmiş</div><ul class="bd-hist">${s.hist.map(h=>
      `<li><b>${esc(tm[h.created_by_team_id]||'Sistem')}</b> <time>${esc(psZaman(h.occurred_at))}</time><span>${esc(h.body)}</span></li>`).join('')}</ul></div>`:''}
    <div class="sz-act">
      ${yetki?`<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="bdSil()">Kalıcı olarak sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button></div>`);
  const m=document.getElementById('modal'); if(m) m.classList.add('mdl-gen');
  if(s.bagla) bdBaglaCiz();
  if(!dis&&(resim||pdf)) belgeImzali(d.storage_path).then(url=>{
    const img=document.getElementById('bdImg'), fr=document.getElementById('bdPdf');
    if(img) img.src=url; if(fr){ iframeOdakKoru(fr); fr.src=url; }
  }).catch(()=>{ const o=document.querySelector('.bd-onz');
    if(o){ o.classList.add('bos'); o.innerHTML='<span>Dosya açılamadı — depoda bulunamadı ya da erişim reddedildi.</span>'; } });
}
/* S13: tarayıcının PDF görüntüleyicisi yüklendiği anda odağı kendine alır.
   Klavye kullanıcısı istemeden önizlemenin içine düşüyor, Esc diyaloğu
   kapatmıyor, açık onay penceresinin odağı kayboluyordu. Yüklemeden
   hemen sonraki kısa pencerede odak önizlemeye kaydıysa, kullanıcının
   son odaklandığı öğeye geri verilir. Önizlemeye tıklamak yine çalışır. */
let _sonOdak=null;
document.addEventListener('focusin',e=>{ if(e.target&&e.target.tagName!=='IFRAME') _sonOdak=e.target; });
function iframeOdakKoru(fr){
  let bitis=0;
  const geri=()=>{ if(!bitis||Date.now()>bitis||document.activeElement!==fr) return;
    const h=(_sonOdak&&document.body.contains(_sonOdak))?_sonOdak:document.getElementById('modal');
    try{ h&&h.focus(); }catch(e){} };
  const kontrol=()=>setTimeout(geri,0);
  fr.addEventListener('load',()=>{ bitis=Date.now()+1500; kontrol(); },{once:true});
  window.addEventListener('blur',kontrol);
  setTimeout(()=>window.removeEventListener('blur',kontrol),20000);
}
async function bdYenile(){ if(!ui._bd) return; const id=ui._bd.d.id;
  const [d,h]=await Promise.all([api('document_detail&id='+id),api('document_history&id='+id).catch(()=>[])]);
  if(!d){ closeModal(); return; } belgeKaydet(d); ui._bd={...ui._bd,d,hist:h||[]}; bdCiz(); }
async function bdKaydet(){
  const d=ui._bd.d; const b=document.getElementById('bdKaydetB'); if(b&&b.disabled) return;
  /* S11 §5: yalnız değişen alanlar, koşullu; değişiklik yoksa yazma/Hareket yok. */
  const f=formFark(d,{title:(gv('bdAd')||'').trim()||null,doc_type:gv('bdTur'),note:(gv('bdNot')||'').trim()||null});
  if(f.bos){ ui._bd.duzen=false; bdCiz(); toast('Değişiklik yok.'); return; }
  if(b){ b.disabled=true; b.textContent='Kaydediliyor…'; }
  let r;
  try{ r=await api('row_update_cas',{tablo:'documents',id:d.id,patch:f.patch,eski:f.eski}); }
  catch(e){ if(b){ b.disabled=false; b.textContent='Kaydet'; } if(!casHata(e)) mpAlert(hataMetni(e),'Belge güncellenemedi'); return; }
  _modalKirli=false;
  ui._bd.duzen=false; toast('Belge bilgileri güncellendi.'); await bdYenile(); blListeTazele();
}
function bdBaglaAc(){ ui._bd.bagla=true; bdCiz(); }
/* İlişki ekleme: yeniden YÜKLEME YOK — aynı belge yeni bağlama bağlanır. */
async function bdBaglaCiz(){
  const box=document.getElementById('bdBagla'); if(!box) return;
  box.innerHTML='<p class="muted">Yükleniyor…</p>';
  const [cu,jobs,cs]=await Promise.all([api('customers_min'),api('jobs_list'),api('contracts_min').catch(()=>[])]);
  ui._bdSec={cu:(cu||[]).slice().sort((a,b)=>String(a.firma||'').localeCompare(String(b.firma||''),'tr')),
             jobs:(jobs||[]).slice().sort((a,b)=>((a.lifecycle_status==='kapandi')-(b.lifecycle_status==='kapandi'))||String(a.title).localeCompare(String(b.title),'tr')),cs:cs||[]};
  box.innerHTML=`<div class="bd-bf">
    <select class="inp inp-sm" id="bdBTip" onchange="bdBaglaHedef()" aria-label="İlişki türü">
      <option value="job_id">İş</option><option value="customer_id">Kurum</option><option value="contract_id">Sözleşme</option></select>
    <select class="inp inp-sm" id="bdBHedef" data-ara aria-label="Bağlanacak kayıt"></select>
    <button class="btn btn-primary btn-sm" id="bdBKaydet" onclick="bdBaglaKaydet()">Bağla</button>
    <button class="btn btn-ghost btn-sm" onclick="ui._bd.bagla=false;bdCiz()">Vazgeç</button></div>`;
  bdBaglaHedef();
}
function bdBaglaHedef(){
  const t=gv('bdBTip'), s=document.getElementById('bdBHedef'); if(!s) return;
  const L=ui._bdSec, mev=new Set((ui._bd.d.document_links||[]).map(l=>t+':'+l[t]));
  const l=t==='job_id'?L.jobs.map(j=>[j.id,j.title+(j.lifecycle_status==='kapandi'?' (arşiv)':'')])
    :t==='customer_id'?L.cu.map(c=>[c.id,orgKisa(c.firma||('#'+c.id),60)])
    :L.cs.map(c=>[c.id,(c.title||'Sözleşme #'+c.id)+(c.reference_no?' · '+c.reference_no:'')]);
  s.innerHTML='<option value="">— Seçin —</option>'+l.filter(x=>!mev.has(t+':'+x[0]))
    .map(x=>`<option value="${x[0]}">${esc(x[1])}</option>`).join('');
}
async function bdBaglaKaydet(){
  const t=gv('bdBTip'), h=+gv('bdBHedef'); if(!h){ mpAlert('Bağlanacak kaydı seçin.','Belge'); return; }
  const b=document.getElementById('bdBKaydet'); if(b&&b.disabled) return; if(b) b.disabled=true;
  const r=await guard(()=>api('document_link_add',{document_id:ui._bd.d.id,[t]:h}),'Bağlanamadı');
  if(b) b.disabled=false; if(r===null) return;
  ui._bd.bagla=false; toast('Belge bağlandı.'); await bdYenile(); blListeTazele();
}
async function bdBagKaldir(linkId){
  const d=ui._bd.d; const kalan=(d.document_links||[]).length-1;
  if(!await mpConfirm(kalan?'Bu bağlantı kaldırılsın mı? Dosya silinmez.'
      :'Bu son bağlantı. Kaldırılırsa dosya silinmez; Belgeler\'de İlişkilendirilmemiş olarak kalır.','Bağlantıyı kaldır',{danger:false,ok:'Kaldır'})) return;
  const r=await guard(()=>belgeBagKaldir([linkId]),'Kaldırılamadı'); if(r===null) return;
  if(r.eksik){ mpAlert('Bu bağlantıyı kaldırma yetkiniz yok.','Belge'); return; }
  toast('Bağlantı kaldırıldı.'); await bdYenile(); blListeTazele();
}
async function bdSil(){
  const d=ui._bd.d; const n=(d.document_links||[]).length;
  if(!await mpConfirm(`“${belgeAd(d)}” kalıcı olarak silinsin mi?${n?` ${n} bağlantısı da kaldırılır.`:''} Dosya geri getirilemez.`,'Belgeyi sil',{danger:true,ok:'Kalıcı olarak sil'})) return;
  const r=await guard(()=>api('document_delete',{id:d.id}),'Silinemedi'); if(r===null) return;
  closeModal(); toast('Belge silindi.');
  if(document.getElementById('blListe')) blListeCiz(); else ekranTazele();
}
/* Satir menusu: tur duzelt, kuruma bagla, bu baglamdan kaldir. Yetki
   sunucuda zorlanir; burada yalniz anlamli secenekler gosterilir. */
function belgeMenu(ev,docId,linkId,tip,ctxId,orgId){
  ev.stopPropagation();
  const acikti=!!_puMnu; puMenuKapat(); if(acikti) return;
  const d=_belgeler.get(docId); if(!d) return;
  const benim=(ui._me&&ui._me.id)||0;
  const sahip=isAdmin()||d.uploaded_by_team_id===benim;
  const tum=d.document_links||[];
  const bag=tum.find(l=>l.id===linkId)||null;
  const kaldirabilir=linkId&&(isAdmin()||d.uploaded_by_team_id===benim||(bag&&bag.created_by_team_id===benim));
  const kurumdaVar=orgId&&tum.some(l=>l.customer_id===orgId);
  const items=[`<button type="button" role="menuitem" onclick="belgeDetay(${docId})">Ayrıntılar ve ilişkiler</button>`];
  if(sahip) items.push(`<button type="button" role="menuitem" onclick="belgeTurForm(${docId})">Adı / türü düzelt</button>`);
  if(tip==='is'&&orgId&&!kurumdaVar) items.push(`<button type="button" role="menuitem" onclick="belgeKurumaBagla(${docId},${orgId})">Kurumun belgelerine de ekle</button>`);
  /* S7 §25: yuklenmis sozlesme belgesinden yapisal kayit - yeniden yukleme yok.
     S7.1 §19: gunluk akis belge-oncelikli; kalemleri elle yeniden yazdirmak
     normal ekibe SUNULMAZ. Yetenek admin icin ikincil olarak durur. */
  if(isAdmin()&&d.doc_type==='sozlesme'&&!tum.some(l=>l.contract_id)&&(tip==='is'||tip==='kurum'))
    items.push(`<button type="button" role="menuitem" onclick="puMenuKapat();sozForm({docId:${docId},jobId:${tip==='is'?ctxId:0},custId:${tip==='is'?(orgId||0):ctxId}})">Sözleşme kaydı oluştur</button>`);
  if(kaldirabilir) items.push(`<button type="button" role="menuitem" class="sil" onclick="belgeBaglamdanKaldir(${docId},${linkId},'${tip}')">${tip==='is'?'Bu işten kaldır':'Kurumdan kaldır'}</button>`);
  if(!items.length){ toast('Bu belge için yapılabilecek bir işlem yok.'); return; }
  const b=ev.currentTarget.getBoundingClientRect();
  const m=document.createElement('div'); m.className='pu-pop'; m.setAttribute('role','menu');
  m.innerHTML=items.join('');
  document.body.appendChild(m);
  m.style.top=(window.scrollY+b.bottom+5)+'px';
  m.style.left=(window.scrollX+Math.max(8,b.right-m.offsetWidth))+'px';
  _puMnu=m;
  setTimeout(()=>{ document.addEventListener('mousedown',puMenuDis,true);
                   document.addEventListener('keydown',puMenuEsc,true); },0);
}
function belgeTurForm(docId){
  puMenuKapat();
  const d=_belgeler.get(docId); if(!d) return;
  modal(`<h3 style="margin:0 0 12px">Belgeyi düzelt</h3>
    <input type="hidden" id="btId" value="${d.id}">
    <div class="field"><label class="flabel" for="btAd">Görünen ad</label>
      <input class="inp" id="btAd" value="${esc(d.title||'')}" placeholder="${esc(d.original_name)}"></div>
    <div class="field"><label class="flabel" for="btTur">Belge türü</label>
      <select class="inp" id="btTur">${BELGE_TUR.map(t=>`<option value="${t[0]}" ${d.doc_type===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></div>
    <p class="fhint">Dosyanın kendisi ve orijinal adı (${esc(d.original_name)}) değişmez.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="belgeTurKaydet()">Kaydet</button></div>`);
}
async function belgeTurKaydet(){
  modalBusy(true);
  const r=await guard(()=>api('document_update',{id:+gv('btId'),title:(gv('btAd')||'').trim()||null,doc_type:gv('btTur')}),'Belge güncellenemedi');
  modalBusy(false); if(r===null) return;
  closeModal(); toast('Belge güncellendi.'); ekranTazele();
}
async function belgeKurumaBagla(docId,orgId){
  puMenuKapat();
  const r=await guard(()=>api('document_link_add',{document_id:docId,customer_id:orgId}),'Bağlanamadı'); if(r===null) return;
  toast('Belge kurumun belgelerine de eklendi.'); ekranTazele();
}
async function belgeBaglamdanKaldir(docId,linkId,tip){
  puMenuKapat();
  const d=_belgeler.get(docId); if(!d) return;
  const digerleri=(d.document_links||[]).filter(l=>l.id!==linkId).length;
  const yer=tip==='is'?'bu işten':'bu kurumdan';
  /* S10: bağlantıyı kaldırmak dosyayı SİLMEZ. */
  const msg=digerleri
    ?`“${belgeAd(d)}” ${yer} kaldırılsın mı? Belge bağlı olduğu diğer ${digerleri} yerde kalır.`
    :`“${belgeAd(d)}” ${yer} kaldırılsın mı? Dosya silinmez; Hafıza > Belgeler'de İlişkilendirilmemiş olarak kalır.`;
  if(!await mpConfirm(msg,'Belgeyi Kaldır',{danger:false,ok:'Kaldır'})) return;
  const r=await guard(()=>belgeBagKaldir([linkId]),'Kaldırılamadı'); if(r===null) return;
  if(r.eksik){ mpAlert('Bu bağlantıyı kaldırma yetkiniz yok.','Belge'); return; }
  toast(digerleri?'Belge bu bağlamdan kaldırıldı.':'Belge bu bağlamdan kaldırıldı — Belgeler\'de duruyor.');
  ekranTazele();
}
function workPartyCiz(){
  const box=document.getElementById('wParties'); if(!box)return;
  const cm={}; (ui._cust||[]).forEach(x=>cm[x.id]=x.firma);
  const RL={account:'Müşteri / hesap',advertiser:'Reklamveren',agency:'Ajans',bill_to:'Fatura edilecek',supplier:'Tedarikçi',operator:'İşletmeci',other:'Diğer'};
  box.innerHTML=(ui._workParties||[]).map(p=>`<div class="list-item">
      <div class="nm">${esc(cm[p.customer_id]||('#'+p.customer_id))}</div>
      <div class="meta"><span class="pill">${esc(RL[p.role]||p.role)}</span>${p.note?' · '+esc(p.note):''}</div>
      ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="partyDel(${p.id})">Kaldır</button>`:''}</div>`).join('')
    ||'<p class="empty">Taraf eklenmedi. Kurum bağlantısı Düzenle ekranından da verilebilir.</p>';
}
function workTimelineCiz(){
  const box=document.getElementById('wTimeline'); if(!box)return;
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const benimTeam=(ui._me&&ui._me.id)||0;
  box.innerHTML=(ui._workEntries||[]).map(e=>{
    const sys=e.source==='system';
    const aks=e.action_status;
    return `<div class="list-item" data-e="${e.id}" style="${sys?'opacity:.72':''}">
      <div class="nm">${String(e.body||'').trim()?esc(e.body):'<span class="muted">Dosya paylaşıldı</span>'}${ekSeridi(e.document_links)}</div>
      <div class="meta">
        ${esc(trAnTarih(e.occurred_at))}${e.created_by_team_id&&tm[e.created_by_team_id]?' · '+esc(tm[e.created_by_team_id]):''}
        ${sys?' · <span class="pill">sistem</span>':''}
        ${aks?` · <span class="pill">${aks==='open'?'Açık aksiyon':aks==='done'?'Tamamlandı':'İptal'}</span>`:''}
        ${e.assignee_id&&tm[e.assignee_id]?' · atanan: '+esc(tm[e.assignee_id]):''}
        ${e.due_at?` · ${gecikti(e.due_at)&&aks==='open'?'<span style="color:#b3261e">⚠ gecikti </span>':''}termin ${esc(trTarih(e.due_at))}`:''}
      </div>
      ${aks==='open'?`<button class="btn btn-outline btn-sm" onclick="entryDone(${e.id})">Tamamla</button>`:''}
      ${/* S4.3 §4/§28: Work zaman cizelgesinde de yazarlik kurali gecerli.
           ONCE her ic kullanici baskasinin guncellemesini duzenleyebiliyordu
           (Duzenle sistem disi HER Entry'de goruluyordu). Artik yalniz
           yazarin kendisi - ya da mevcut admin yetkisi. Sistem Entry'sinde
           hicbiri gosterilmez. */''}
      ${(!sys&&(e.created_by_team_id===benimTeam||isAdmin()))
        ?`<button class="btn btn-outline btn-sm" onclick="${aks?`entryForm(${e.id},${e.job_id},true)`:`entryDuzenleIs(${e.id})`}">Düzenle</button>`:''}
      ${(!sys&&(e.created_by_team_id===benimTeam||isAdmin()))
        ?`<button class="btn btn-danger btn-sm" onclick="entryDel(${e.id})">Sil</button>`:''}
    </div>`;}).join('')
    ||'<p class="empty">Henüz güncelleme yok.</p>';
}
/* PS1.1 §16: acik niyet. Bildirim aboneligi, gorunurluk degisikligi ya
   da sorumluluk YARATMAZ - yalnizca Panelim listene ekler/cikarir. */
let _takipUcus=false;
async function workTakip(id,takipEt){
  if(_takipUcus) return;                      /* çift tıklama: tek istek */
  _takipUcus=true;
  const b=document.getElementById('wFol'); if(b) b.disabled=true;
  try{
    const r=await guard(()=>api(takipEt?'work_follow':'work_unfollow',{id}),
      takipEt?'Takibe alınamadı':'Takip bırakılamadı');
    if(r===null){ if(b) b.disabled=false; return; }   /* başarısız: etiket DEĞİŞMEZ */
    toast(takipEt?'Takibe alındı.':'Takip bırakıldı.');
    await workAc(id);
  } finally { _takipUcus=false; }
}
function entryForm(id,jobId,aksiyon){
  const x=(ui._workEntries||[]).find(e=>e.id===id)||{};
  const acik=aksiyon||!!x.action_status;
  modal(`<h3 style="margin:0 0 14px">Güncellemeyi Düzenle</h3>
    <input type="hidden" id="eid" value="${id||0}"><input type="hidden" id="ejid" value="${jobId}">
    <div class="field"><label class="flabel" for="eb">Ne oldu? *</label>
      <textarea class="inp" id="eb" rows="3" placeholder="ör. Müşteri M1'i onayladı, stadyumu almadı.">${esc(x.body)}</textarea></div>
    <label class="switch" style="margin-bottom:10px"><input type="checkbox" id="eact" ${acik?'checked':''} onchange="document.getElementById('eActBox').hidden=!this.checked"><span class="sl"></span><span class="txt">Yapılacak aksiyon</span></label>
    <div id="eActBox" ${acik?'':'hidden'}>
      <div class="row2">
        <div class="field"><label class="flabel" for="easg">Birine ata</label>
          <select class="inp" id="easg"><option value="">— yok —</option>${(ui._team||[]).map(t=>`<option value="${t.id}" ${String(x.assignee_id)===String(t.id)?'selected':''}>${esc(t.name)}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="edue">Termin</label>
          <input class="inp" type="date" id="edue" value="${x.due_at?String(x.due_at).slice(0,10):''}"></div>
      </div>
      <div class="field"><label class="flabel" for="est">Aksiyon durumu</label>
        <select class="inp" id="est">
          <option value="open" ${x.action_status==='open'||!x.action_status?'selected':''}>Açık</option>
          <option value="done" ${x.action_status==='done'?'selected':''}>Tamamlandı</option>
          <option value="cancelled" ${x.action_status==='cancelled'?'selected':''}>İptal</option></select></div>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="entrySave()">Kaydet</button></div>`);
  const f=document.getElementById('eb'); if(f)f.focus();
}
async function entrySave(){
  const body=(gv('eb')||'').trim();
  if(!body){ mpAlert('Güncelleme metni zorunlu.'); return; }
  const jid=+gv('ejid');
  const aksiyon=document.getElementById('eact').checked;
  const row={id:+gv('eid'),job_id:jid,body};
  if(aksiyon){ row.action_status=gv('est')||'open';
    row.assignee_id=+gv('easg')||null;
    row.due_at=gv('edue')?new Date(gv('edue')+'T09:00:00').toISOString():null; }
  else { row.action_status=null; row.assignee_id=null; row.due_at=null; }
  modalBusy(true);
  const r=await guard(()=>api('entry_save',row),'Güncelleme kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Güncelleme eklendi.'); workAc(jid);
}
async function entryDone(id){
  const e=(ui._workEntries||[]).find(x=>x.id===id)||{};
  const r=await guard(()=>api('entry_save',{id,action_status:'done'}),'Aksiyon kapatılamadı');
  if(r===null)return;
  toast('Aksiyon tamamlandı.'); workAc(e.job_id||(ui._work||{}).id);
}
async function entryDel(id){
  if(!await mpConfirm('Bu güncelleme silinsin mi? Ekli dosyalar Hafıza > Belgeler\'de kalır.','Güncellemeyi Sil'))return;
  const jid=(ui._work||{}).id;
  const r=await guard(()=>api('entry_delete&id='+id),'Silinemedi'); if(r===null)return;
  toast('Silindi.'); workAc(jid);
}
async function quoteRevise(id){
  if(!await mpConfirm('Bu teklifin yeni bir revizyonu oluşturulsun mu? Mevcut teklif korunur.','Teklifi Revize Et'))return;
  const r=await guard(()=>api('quote_revise',{id}),'Revizyon oluşturulamadı'); if(r===null)return;
  /* S4.4: revizyon hareketi trg_quotes_hareket'ten gelir. */
  toast(`Revizyon oluşturuldu: Teklif #${r.id}`); workAc((ui._work||{}).id);
}
function partyForm(jobId){
  modal(`<h3 style="margin:0 0 6px">Taraf Ekle</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Bu işteki rol, kurumun genel etiketinden bağımsızdır.</p>
    <input type="hidden" id="pjid" value="${jobId}">
    <div class="field"><label class="flabel" for="pcid">Kurum</label>
      <select class="inp" id="pcid" data-ara>${(ui._cust||[]).map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('')}</select></div>
    <div class="field"><label class="flabel" for="prole">Rol</label>
      <select class="inp" id="prole">
        <option value="account">Müşteri / hesap</option><option value="advertiser">Reklamveren</option>
        <option value="agency">Ajans</option><option value="bill_to">Fatura edilecek</option>
        <option value="supplier">Tedarikçi</option><option value="operator">İşletmeci</option>
        <option value="other">Diğer</option></select></div>
    <div class="field"><label class="flabel" for="pnote">Not</label><input class="inp" id="pnote"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="partySave()">Kaydet</button></div>`);
}
async function partySave(){
  const jid=+gv('pjid');
  modalBusy(true);
  const r=await guard(()=>api('work_party_save',{id:0,job_id:jid,customer_id:+gv('pcid')||null,role:gv('prole'),note:gv('pnote')||null}),'Taraf eklenemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Taraf eklendi.'); workAc(jid);
}
async function partyDel(id){
  const jid=(ui._work||{}).id;
  if(!await mpConfirm('Bu taraf kaldırılsın mı?','Tarafı Kaldır'))return;
  const r=await guard(()=>api('work_party_delete&id='+id),'Kaldırılamadı'); if(r===null)return;
  toast('Kaldırıldı.'); workAc(jid);
}
/* Ayni duzenleyici hem Work Detail'den hem Muhasebe kuyrugundan acilir
   (§9). Ikinci bir muhasebe formu YAZILMADI; yalniz `ui._work`e olan
   ortuk bagimlilik kaldirildi - kuyrukta `ui._work` bos olurdu ve form
   her alani bos gosterirdi. */
function workMetaForm(id,job){
  const j=job||((ui._work&&ui._work.id===id)?ui._work:null)
           ||(ui._jobs||[]).find(x=>x.id===id)||{};
  const as0=j.accounting_status||'yok';
  /* S7: sozlesme artik yapisal kayit (Ticari bolumu). Eski jobs.contract_*
     alanlari burada DUZENLENMEZ - iki bagimsiz dogru olusmasin. */
  modal(`<h3 style="margin:0 0 6px">Muhasebe</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Kapanmış iş muhasebenin işlendiği anlamına gelmez. Sözleşmeler işin Ticari bölümünde yönetilir.</p>
    <input type="hidden" id="wmid" value="${id}">
    <div class="row2">
      <div class="field"><label class="flabel" for="was">Muhasebe durumu</label>
        <select class="inp" id="was" onchange="workMetaDurumDegis()">${ACCST.slice().sort((a,b)=>['yok','hazir','gonderildi','islendi'].indexOf(a[0])-['yok','hazir','gonderildi','islendi'].indexOf(b[0])).map(o=>`<option value="${o[0]}" ${as0===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="waa">Tutar</label>
        <input class="inp" type="number" step="0.01" id="waa" value="${esc(j.accounting_amount)}"></div></div>
    ${/* §9: devir tarihi de duzeltilebilmeli - "3'unde gonderdik ama bugun
         giriyorum" gercek bir durum. Sema `accounting_sent_at` tasiyor;
         yeni alan UYDURULMADI. Bos birakilirsa sistem kendi damgasini
         yazar (§10). */''}
    <div class="field" id="wasdBox" ${(as0==='gonderildi'||as0==='islendi')?'':'hidden'}>
      <label class="flabel" for="wasd">Muhasebeye gönderim tarihi</label>
      <input class="inp" type="date" id="wasd" value="${esc(j.accounting_sent_at?String(j.accounting_sent_at).slice(0,10):'')}">
      <span class="fhint">Boş bırakılırsa gönderildi işaretlendiği an yazılır.</span></div>
    <div class="field"><label class="flabel" for="wan">Muhasebe notu</label><input class="inp" id="wan" value="${esc(j.accounting_note)}"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="workMetaSave()">Kaydet</button></div>`);
}
function workMetaDurumDegis(){
  const v=gv('was'), b=document.getElementById('wasdBox');
  if(b) b.hidden=!(v==='gonderildi'||v==='islendi');
}
/* Devir zaman damgalarinin TEK yazari (§10).
   ONCE: kuyruktaki `accDurum` damgalari yaziyordu ama Work Detail'deki
   `workMetaSave` YAZMIYORDU - ayni is gecisi hangi dugmeye basildigina
   gore farkli veri uretiyordu ve "Gonderildi" bir is gonderim tarihsiz
   kalip yanlis siralanip yanlis disa aktariliyordu. */
function accZaman(j,yeni,elleTarih){
  const now=new Date().toISOString();
  const o={};
  if(yeni==='yok'||yeni==='hazir'){ o.accounting_sent_at=null; o.accounting_processed_at=null; return o; }
  /* Tarih girisi gun bazli; gun kaymasini onlemek icin yerel ogleye sabitlenir. */
  const elle=elleTarih?new Date(elleTarih+'T12:00:00').toISOString():null;
  o.accounting_sent_at=elle||j.accounting_sent_at||now;
  o.accounting_processed_at=(yeni==='islendi')?(j.accounting_processed_at||now):null;
  return o;
}
async function workMetaSave(){
  const id=+gv('wmid');
  const j=((ui._work&&ui._work.id===id)?ui._work:null)||(ui._jobs||[]).find(x=>x.id===id)||{};
  const as=gv('was');
  /* S11 §5: yalnız değişen alanlar; değişiklik yoksa yazma yok, Hareket yok.
     Durum değişmediyse devir damgalarına dokunulmaz (accZaman "şimdi"
     üretmesin). */
  const yeni={accounting_status:as,accounting_amount:gv('waa')?+gv('waa'):null,accounting_note:gv('wan')||null};
  const elle=gv('wasd'), eskiGun=j.accounting_sent_at?String(j.accounting_sent_at).slice(0,10):'';
  if(as!==(j.accounting_status||'yok')||(elle&&elle!==eskiGun)) Object.assign(yeni,accZaman(j,as,elle));
  const f=formFark(j,yeni);
  if(f.bos){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
  modalBusy(true);
  let r;
  try{ r=await api('row_update_cas',{tablo:'jobs',id,patch:f.patch,eski:f.eski}); }
  catch(e){ modalBusy(false); if(!casHata(e)) mpAlert(hataMetni(e),'Kaydedilemedi'); return; }
  modalBusy(false);
  if(r===null)return;
  /* S4.4: sistem hareketi artik VERITABANI tetikleyicisinden gelir (trg_jobs_hareket). */
  closeModal(); toast('Kaydedildi.');
  /* Nereden acildiysa oraya don - kuyruktan acilip Work Detail'e
     firlatilmak kullanicinin yerini kaybettirirdi (§9). */
  if(ui.section==='muhasebe') renderSection(); else workAc(id);
}
/* Kuyruktan duzenleme: ayni form, satirin isiyle onceden doldurulmus. */
function accDuzenle(id){
  const j=(ui._jobs||[]).find(x=>x.id===id);
  if(!j){ toast('Kayıt bulunamadı.'); return; }
  workMetaForm(id,j);
}

/* PS1.1 §23-§25: bir işi AÇMAK hızlı olmalı. Yeni iş formu artık yalnız
   Başlık · Kurum · İlgili kişi · Aşama · İlgili ekip · Acil sorar.
   Mecra, tedarikçi, başlangıç/bitiş tarihi, operasyon, sözleşme ve
   muhasebe alanları ARTIK SORULMAZ (§25) — onlar Work gerçekten o
   bağlama ulaştığında Work Detail'de ve bağlı kayıtlarda yaşar.
   Aşamaya göre değişen dinamik form da YOK (§25): ürün sahibi açıkça
   basit oluşturmayı zekice koşullu formlara tercih etti.

   DÜZENLEME farklı bir iştir: mevcut operasyonel alanlar (mecra,
   tedarikçi, tarihler, not) düzenleme modunda aynen korunur, yoksa
   bugüne kadar girilmiş veriyi düzenlenemez hale getirirdik. */
/* PS3 §30: Hafıza'dan gelen bağlam (kurum ve/veya kişi) formu önceden
   doldurur; kullanıcı yine değiştirebilir. */
async function jobForm(st,id,ctx){
  const veri=await guard(()=>Promise.all([api('customers_list'),api('suppliers_list'),
    api('mecra_list'),api('team_list'),api('contacts_list'),
    api('affiliations_all').catch(()=>[])]),'Form açılamadı');
  if(!veri) return;
  const [cu,su,mc,tm,ct,af]=veri; ui._team=tm||[]; ui._contacts=ct||[]; ui._cust=cu||[];
  /* contact_id -> bağlantılar; kişi seçicisinin kuruma göre önceliklendirme
     yapabilmesi için (§24). Tek toplu okuma. */
  ui._affByKisi={}; (af||[]).forEach(a=>{ (ui._affByKisi[a.contact_id]=ui._affByKisi[a.contact_id]||[]).push(a); });
  const j = id ? (await api('jobs_list')).find(x=>x.id===id)||{} : {};
  /* S11 §5: form açıldığı andaki satır — Kaydet yalnız farkı ve bu değerler
     hâlâ yerindeyse yazar. */
  ui._jobFormIlk=id?{...j}:null;
  const opt=(arr,val,lbl)=>`<option value="">— yok —</option>`+arr.map(x=>
    `<option value="${x.id}" ${String(val)===String(x.id)?'selected':''}>${esc(lbl(x))}</option>`).join('');
  const benim=(ui._me&&ui._me.id)||0;
  const ekip=(tm||[]).filter(t=>t.active!==false);
  if(!id){
    const pc=(ctx&&ctx.custId)||0, pk=(ctx&&ctx.contactId)||0;
    /* S6 §34: Hafiza formuna gidip donerken secilen dosyalar kaybolmasin. */
    if(!(ctx&&ctx.ekKoru&&EK.job)) ekYeni('job',{turZorunlu:true});
    if(!(ctx&&ctx.ekKoru)) islemYeni('job');       /* S14: yeni form = yeni oluşturma girişimi */
    if(pk && !ui._contacts.some(k=>k.id===pk)) ui._contacts=ct||[];
    modal(`<h3 style="margin:0 0 14px">Yeni İş</h3>
    <input type="hidden" id="jid" value="0">
    <div class="field"><label class="flabel" for="jt">Başlık *</label>
      <input class="inp" id="jt" placeholder="ör. M1 AVM sonbahar kampanyası"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="jc">Kurum</label>
        <div class="inp-add">
          <select class="inp" id="jc" data-ara onchange="jobKisiTazele()">${opt(cu,pc,x=>x.firma||('#'+x.id))}</select>
          <button type="button" class="add-b" title="Yeni kurum ekle" onclick="jobYeniKurum()">+</button></div></div>
      <div class="field"><label class="flabel" for="jkisi">İlgili kişi</label>
        <div class="inp-add">
          <select class="inp" id="jkisi">${jobKisiSec(pc,pk)}</select>
          <button type="button" class="add-b" title="Yeni kişi ekle" onclick="jobYeniKisi()">+</button></div>
        <p class="fhint" id="jkisiHint">${pc?'':'Önce kurum seçin.'}</p></div>
    </div>
    <div class="field"><label class="flabel" for="js">Aşama</label>
      <select class="inp" id="js">${JOBST.map(x=>`<option value="${x[0]}" ${(st||'temas_takip')===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
    <div class="qc-tags" style="margin-bottom:12px">
      <span class="qc-mini">İlgili</span>
      ${ekip.map(t=>`<label class="qc-who"><input type="checkbox" class="jFol" value="${t.id}" ${t.id===benim?'checked':''}>
        <span>${esc(t.name)}</span></label>`).join('')}
    </div>
    <div class="qc-line qc-opt" style="margin-bottom:4px">
      <label class="qc-acil"><input type="checkbox" id="jAcil"><span>⚡ Acil</span></label>
      <span class="fhint" style="margin:0 0 0 auto">Mecra, tedarikçi ve tarihler işin içinden eklenir.</span>
    </div>
    <div class="field" style="margin:10px 0 0"><span class="qc-mini">Dosya (isteğe bağlı) — gelen teklif, taslak sözleşme, referans görsel</span>
      ${ekAlan('job')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="jobSave()">Oluştur</button></div>`);
    const t0=document.getElementById('jt'); if(t0)t0.focus();
    return;
  }
  modal(`<h3 style="margin:0 0 14px">İşi Düzenle</h3>
  <input type="hidden" id="jid" value="${id||0}">
  <div class="field"><label class="flabel" for="jt">Başlık *</label><input class="inp" id="jt" value="${esc(j.title)}" placeholder="ör. M1 AVM Megalight baskı"></div>
  <div class="row2">
    <div class="field"><label class="flabel" for="jc">Müşteri</label><select class="inp" id="jc" data-ara onchange="jobKisiTazele()">${opt(cu,j.customer_id,x=>x.firma||('#'+x.id))}</select></div>
    <div class="field"><label class="flabel" for="jkisi">İlgili kişi</label>
      <select class="inp" id="jkisi">${jobKisiSec(j.customer_id,j.primary_contact_id)}</select>
      <p class="fhint" id="jkisiHint"></p></div>
    <div class="field"><label class="flabel" for="jm">Mecra</label><select class="inp" id="jm">${opt(mc,j.mecra_id,x=>x.name)}</select></div>
  </div>
  <div class="row2">
    <div class="field"><label class="flabel" for="jsup">Tedarikçi (baskı/montaj)</label><select class="inp" id="jsup">${opt(su,j.supplier_id,x=>(x.firma||x.name||'—')+((x.kategori||x.type)?' · '+(x.kategori||x.type):''))}</select></div>
    <div class="field"><label class="flabel" for="jassg">Atanan ekip üyesi</label><select class="inp" id="jassg"><option value="">— Atanmadı —</option>${opt(tm,j.assignee_id,x=>x.name+(x.role?' · '+x.role:''))}</select></div>
    <div class="field"><label class="flabel" for="js">Aşama</label><select class="inp" id="js">${JOBST.map(x=>`<option value="${x[0]}" ${(j.status||st||'temas_takip')===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
  </div>
  <div class="row2">
    <div class="field"><label class="flabel" for="jsd">Başlangıç</label><input class="inp" type="date" id="jsd" value="${esc(j.start_day)}"></div>
    <div class="field"><label class="flabel" for="jed">Bitiş / teslim</label><input class="inp" type="date" id="jed" value="${esc(j.end_day)}"></div>
  </div>
  <div class="field"><label class="flabel" for="jn">Not</label><textarea class="inp" id="jn">${esc(j.note)}</textarea></div>
  <div class="qc-line qc-opt" style="margin-bottom:4px">
    <label class="qc-acil"><input type="checkbox" id="jAcil" ${j.is_urgent?'checked':''}><span>⚡ Acil</span></label></div>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="jobSave()">Kaydet</button></div>`);
}
/* İlgili kişi seçimi Work'ün kurumuna KISITLIDIR: contacts.customer_id
   üzerinden filtrelenir (brief §5.2). Kişi jobs'ta tekrar saklanmaz —
   yalnız contacts satırına FK verilir; `customers.ilgili_kisi` kişi
   semantiği canlandırılmaz (S02_001 kapalı karar). */
/* PS3 §24: kurum seçiliyse O KURUMA bağlı kişiler öne alınır, ama başka
   kuruma bağlı bir kişi KALICI OLARAK GİZLENMEZ. Seçili kişi her zaman
   listede kalır; aksi halde form kendi seçtiği değeri kaybederdi.
   Bağlantı kurulmuş gibi davranılmaz — yalnız seçilebilir olur (§24). */
function jobKisiSec(cid,sel){
  const hepsi=(ui._contacts||[]).filter(k=>k.active!==false);
  const aff=(ui._affByKisi||{});
  const bagli=k=>cid&&(String(k.customer_id)===String(cid)
    ||(aff[k.id]||[]).some(a=>String(a.customer_id)===String(cid)&&a.active!==false));
  const sirala=(a,b)=>(b.is_primary?1:0)-(a.is_primary?1:0)||String(a.name).localeCompare(String(b.name),'tr');
  const icerdeki=hepsi.filter(bagli).sort(sirala);
  const digerSecili=(sel&&!icerdeki.some(k=>String(k.id)===String(sel)))
    ? hepsi.filter(k=>String(k.id)===String(sel)) : [];
  const opt=(k,etiket)=>`<option value="${k.id}" ${String(sel)===String(k.id)?'selected':''}>${esc(k.name)}${k.title?' · '+esc(k.title):''}${k.is_primary?' ★':''}${etiket||''}</option>`;
  return `<option value="">— yok —</option>`
    + icerdeki.map(k=>opt(k)).join('')
    + (digerSecili.length?`<optgroup label="Başka kurumdan">`+digerSecili.map(k=>opt(k,' · başka kurum')).join('')+`</optgroup>`:'');
}
/* PS1.1 §24: eksik kurumu/kisiyi Work olusturmayi BIRAKMADAN ekle.
   Mevcut kayit modelleri aynen kullanilir - gecici bir model YARATILMAZ.

   Kisi icin karar: `contacts` satiri, `customer_id` dolu olarak yazilir.
   Sprint 3'un planlanan `contact_affiliations` migration'i tam olarak
   bu kolondan backfill edecek (SCHEMA_IMPACT_REVIEW §5.1), dolayisiyla
   bugun burada uretilen kisi o modelle UYUMLUDUR ve teknik borc degildir.
   Hafiza'nin coklu-kurum UI'si yine Sprint 3'te gelir. */
/* İş formundaki girilmiş veriyi tut, Hafıza formunu aç, dönünce geri yükle.
   Mini form KOPYALANMAZ — aynı orgQuickForm/personForm kullanılır (§23). */
function jobFormDurum(){
  const g=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  return {title:g('jt'), cust:g('jc'), kisi:g('jkisi'), asama:g('js'),
          acil:!!(document.getElementById('jAcil')||{}).checked,
          fol:Array.from(document.querySelectorAll('.jFol:checked')).map(x=>+x.value)};
}
async function jobFormGeriYukle(st,opt){
  opt=opt||{};
  await jobForm(st.asama||null, null, {custId:opt.custId||+st.cust||0, contactId:opt.contactId||+st.kisi||0, ekKoru:true});
  const set=(id,v)=>{ const e=document.getElementById(id); if(e&&v!=null&&v!=='') e.value=v; };
  set('jt',st.title);
  if(document.getElementById('jAcil')) document.getElementById('jAcil').checked=st.acil;
  document.querySelectorAll('.jFol').forEach(x=>{ x.checked=st.fol.includes(+x.value); });
  const jc=document.getElementById('jc');
  if(jc && (opt.custId||st.cust)) { jc.value=String(opt.custId||st.cust); jobKisiTazele(); }
  const jk=document.getElementById('jkisi');
  if(jk && (opt.contactId||st.kisi)) jk.value=String(opt.contactId||st.kisi);
}
async function jobYeniKurum(){
  ui._jobDraft=jobFormDurum();
  orgQuickForm({ret:'job'});
}
async function jobYeniKisi(){
  const st=jobFormDurum();
  ui._jobDraft=st;
  /* §24: iş formunda kurum seçiliyse yeni kişiye o kurum ÖNERİLİR;
     zorunlu değildir — kişi başka yere bağlı olabilir. */
  personForm({custId:+st.cust||0, ret:'job'});
}
async function personJobDonus(contactId, orgId){
  const st=ui._jobDraft||{}; ui._jobDraft=null;
  await jobFormGeriYukle(st,{custId:orgId||+st.cust||0, contactId});
}
function jobKisiTazele(){
  const cid=gv('jc'), sel=document.getElementById('jkisi');
  if(!sel) return;
  sel.innerHTML=jobKisiSec(cid,'');
  const n=sel.options.length-1, h=document.getElementById('jkisiHint');
  if(h) h.textContent=!cid?'Önce kurum seçin.':(n?'':'Bu kurumda kayıtlı kişi yok — Kurumlar ekranından eklenebilir.');
}
/* S11 §5 — yalnız değişen alanlar. Sayı/boş/metin karşılaştırması
   normalleştirilir: "12" ile 12, '' ile null aynı değerdir. */
const _kanonik=v=>Array.isArray(v)?'['+v.map(_kanonik).join(',')+']'
  :(v&&typeof v==='object')?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+_kanonik(v[k])).join(',')+'}':JSON.stringify(v);
const _degNorm=v=>(v===undefined||v===null||v==='')?null:(typeof v==='boolean'?v:(typeof v==='object'?_kanonik(v):String(v)));
function formFark(ilk,yeni){
  const patch={}, eski={};
  Object.keys(yeni).forEach(k=>{ if(k==='id') return;
    if(_degNorm(yeni[k])!==_degNorm(ilk[k])){ patch[k]=yeni[k]; eski[k]=ilk[k]===undefined?null:ilk[k]; } });
  return {patch,eski,bos:!Object.keys(patch).length};
}
/* Çakışma: form AÇIK kalır; kullanıcının çalışması kaybolmaz. */
const ALAN_AD={title:'Başlık',status:'Aşama',customer_id:'Kurum',primary_contact_id:'İlgili kişi',is_urgent:'Acil',
  note:'Not',mecra_id:'Mecra',supplier_id:'Tedarikçi',assignee_id:'İş sahibi',start_day:'Başlangıç',end_day:'Bitiş',
  accounting_status:'Muhasebe durumu',accounting_amount:'Tutar',accounting_note:'Muhasebe notu',accounting_sent_at:'Gönderim tarihi',
  accounting_processed_at:'İşlenme tarihi',doc_type:'Kategori',lifecycle_status:'Durum',
  label:'Paket adı',cost_amount:'Paket maliyeti',sale_amount:'Paket satışı',currency:'Para birimi',
  firma:'Firma',kategori:'Kategori',ilgili_kisi:'İlgili kişi',telefon:'Telefon',eposta:'E-posta',iban:'IBAN',adres:'Adres',
  vergi_no:'Vergi no',vergi_dairesi:'Vergi dairesi',notlar:'Notlar',aktif:'Aktif',puan:'Puan',
  name:'İsim',olcu:'Ölçü',yuzey:'Yüzey',isikli:'Aydınlatma',baski_malzemesi:'Baskı malzemesi',baski_format:'Baskı formatı',
  yayin_format:'Yayın formatı',etiketler:'Arama etiketleri',ikon:'İkon',baski_ucreti:'Baskı ücreti',montaj_ucreti:'Montaj ücreti',
  extra_ucret:'Ek ücret',prices:'Fiyatlar',role:'Görev / departman',unvan:'Ünvan',photo:'Fotoğraf',app_role:'Yetki',seviye:'Yetki (eski)',blocks:'Sayfa içeriği',in_menu:'Menüde göster',konu:'Konu',body:'İçerik',tarih:'Tarih'};
/* Ağ hatası kullanıcıya teknik metinle gösterilmez. */
/* S13: kullanıcıya ham veritabanı iletisi gösterilmez. Bilinen kodlar
   anlaşılır Türkçe metne çevrilir; bilinmeyen ileti aynen kalır (sunucunun
   kendi Türkçe doğrulama iletileri, ör. "Bitiş tarihi başlangıçtan önce
   olamaz.", bozulmasın). */
function hataMetni(e){ const m=String((e&&e.message)||e||''); const kod=String((e&&e.code)||'');
  /* S13: ağ hatasında sunucunun isteği işleyip işlemediği istemciden
     BİLİNEMEZ (istek ulaşıp yanıt kaybolmuş olabilir). "Kaydedilmedi" diye
     kesin konuşmak kullanıcıyı tekrar denemeye ve mükerrer kayda iter. */
  if(/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return 'Sunucudan yanıt alınamadı. İşlemin kaydedilip kaydedilmediği kesin değil; girdiğiniz bilgiler formda duruyor. Tekrar denemeden önce ilgili listeyi yenileyip kaydın oluşup oluşmadığını kontrol edin.';
  if(kod==='23P01'||/exclusion constraint/i.test(m)) return 'Seçilen tarihlerde bu yüzey az önce başka bir kayıtla doldu. Değişiklik kaydedilmedi; takvimi yenileyip başka bir tarih seçin.';
  if(kod==='PGRST301'||/JWT expired|invalid JWT/i.test(m)){ setTimeout(()=>kimlikDogrula(true),0); return 'Oturumunuz sona ermiş. Değişiklik kaydedilmedi; yeniden giriş yapıp tekrar deneyin.'; }
  if(kod==='42501'||/row-level security|permission denied/i.test(m)){ setTimeout(()=>kimlikDogrula(true),0); return 'Bu işlem için yetkiniz yok. Değişiklik kaydedilmedi.'; }
  if(kod==='23505'||/duplicate key/i.test(m)) return 'Bu kayıt zaten var. Değişiklik kaydedilmedi.';
  if(kod==='23503'||/foreign key constraint/i.test(m)) return 'Bağlı kayıt artık yok ya da başka bir kayıtta kullanılıyor. Sayfayı yenileyip tekrar deneyin.';
  return m; }
function casHata(e){
  if(e&&e.kod==='cakisma'){
    mpAlert('Bu kayıt siz düzenlerken başka biri tarafından değiştirildi ('+e.alanlar.map(k=>ALAN_AD[k]||k).join(', ')
      +'). Değişiklikleriniz kaydedilmedi ve formda duruyor. Güncel hali görmek için formu kapatıp yeniden açın.','Kayıt güncellenmiş');
    return true; }
  return false;
}
async function jobSave(){
  if(!gv('jt').trim()){ mpAlert('Başlık zorunlu.'); return; }
  if(document.getElementById('ek_job')&&ekTurEksik('job')){ mpAlert('Eklenen her dosya için belge türünü seçin.','Dosya'); return; }
  const num=v=>v?+v:null;
  const yeni=!(+gv('jid'));
  const cid=num(gv('jc'));
  modalBusy(true);
  /* Kısa oluşturma formunda mecra/tedarikçi/tarih alanları HİÇ YOKTUR;
     düzenleme formunda vardır. Yokken `undefined` göndermek yerine alanı
     hiç eklemiyoruz, böylece mevcut değerler ezilmez. */
  const row={id:+gv('jid')||0,title:gv('jt').replace(/\s+/g,' ').trim(),status:gv('js')||'temas_takip',
    customer_id:cid, primary_contact_id:num(gv('jkisi')),
    is_urgent:!!(document.getElementById('jAcil')||{}).checked};
  if(document.getElementById('jn'))   row.note=gv('jn');
  if(document.getElementById('jm'))   row.mecra_id=num(gv('jm'));
  if(document.getElementById('jsup')) row.supplier_id=num(gv('jsup'));
  if(document.getElementById('jassg'))row.assignee_id=num(gv('jassg'));
  if(document.getElementById('jsd'))  row.start_day=gv('jsd')||null;
  if(document.getElementById('jed'))  row.end_day=gv('jed')||null;
  /* PS1.1 §26: faz gecmisi ZATEN kaydediliyordu - Pano oklari jobMove()
     uzerinden sistem Entry'si yaziyor. Tek bosluk duzenleme formuydu:
     buradan yapilan asama degisikligi timeline'a hic dusmuyordu. Ayni
     mevcut mekanizmayla kapatildi; yeni bir workflow-history altsistemi
     KURULMADI (§26 - yeni sema yok). */
  /* S11 §5:
     · YENİ iş: iş + hesap tarafı + ilgili ekip TEK işlemde (job_create);
       önceden üç ayrı istekti ve son ikisinin hatası yutuluyordu.
       (Dosya denemesinde form bu işi güncellemeye döner: jid dolu.)
     · DÜZENLEME: yalnız DEĞİŞEN alanlar, form açıldığındaki değerler hâlâ
       yerindeyse yazılır. Değişiklik yoksa YAZMA ve Hareket yok. */
  let r;
  if(yeni){
    const fol=Array.from(document.querySelectorAll('.jFol:checked')).map(x=>+x.value);
    /* S14: tekillik anahtarıyla; yanıt kaybolup tekrar gönderilirse aynı iş döner. */
    const s=await islemCalistir('job','job_create','İş: '+row.title,k=>api('job_create',{job:row,followers:fol,islem:k}),'İş kaydedilemedi');
    r=s.durum==='tamam'?{id:(s.sonuc&&typeof s.sonuc==='object')?s.sonuc.id:+s.sonuc}:null;
  } else {
    const ilk=ui._jobFormIlk||{};
    const f=formFark(ilk,row);
    const dosyaBekliyor=!!(document.getElementById('ek_job')&&ekBekleyen('job').length);
    if(f.bos&&!dosyaBekliyor){ modalBusy(false); closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
    try{ r=f.bos?{id:row.id}:await api('row_update_cas',{tablo:'jobs',id:row.id,patch:f.patch,eski:f.eski}); }
    catch(e){ modalBusy(false); if(!casHata(e)) mpAlert(hataMetni(e),'İş kaydedilemedi'); return; }
  }
  modalBusy(false);
  if(r===null) return;
  /* S6 §34: Is ONCE olusur; dosya sonradan baglanir. Dosya basarisizsa Is
     GERI ALINMAZ - form acik kalir, ayni dugme artik bu isi gunceller ve
     dosyayi yeniden dener. Vazgec dosyasiz devam eder. */
  if(r&&r.id&&document.getElementById('ek_job')&&ekBekleyen('job').length){
    const jidEl=document.getElementById('jid'); if(jidEl) jidEl.value=String(r.id);
    if(yeni) ui._jobFormIlk={...row,id:r.id,lifecycle_status:'acik'};
    modalBusy(true,'Dosyalar yükleniyor…');
    const g=await ekGonder('job',[{job_id:r.id}]);
    modalBusy(false);
    if(!g.ok){
      renderSection();
      const btn=document.querySelector('#modal .btn-primary'); if(btn) btn.textContent='Dosyayı tekrar dene';
      if(g.sessiz) toast('İş oluşturuldu; dosya henüz eklenmedi. “Dosyayı tekrar dene” ile sürdürün.');
      else mpAlert('İş oluşturuldu, ancak dosya eklenemedi: '+g.hata
        +'. “Dosyayı tekrar dene” ile yeniden deneyin ya da Vazgeç ile dosyasız devam edin.','Dosya');
      return; }
  }
  closeModal(); toast('İş kaydedildi.');
  /* S13: kullanıcı bulunduğu bağlamda kalır. Önceden her kayıttan sonra
     bölüm listesi çiziliyordu: iş detayından düzenleyen kullanıcı Pano'ya
     atılıyor, tarayıcı geçmişi ise hâlâ "iş detayı" diyordu. Yeni iş
     oluşturulunca doğrudan o işin detayı açılır (Geri önceki ekrana döner). */
  const id=(r&&r.id)||row.id;
  if(yeni&&id) workAc(id);
  else if(history.state&&history.state.v==='work'&&ui._work&&String(ui._work.id)===String(row.id)) workAc(row.id);
  else renderSection();
}

/* ================= BASKI & MONTAJ (Sprint 05) =================
   Ayrı bir source-of-truth modülü değil; work_operations üzerinde bir
   view'dır (07 §13). Aktif takip artık Excel'de değil burada yaşar
   (BR-X01); Excel yalnız import/export formatıdır (BR-X02).
   ============================================================== */
const OPTYPE=[['baski','Baskı'],['montaj','Montaj'],['sokum','Söküm'],['diger','Diğer hizmet']];
/* S12: miktar birimi — "4 gün vinç" dört baskı sayılmaz. */
const OP_BIRIM={adet:'adet',m2:'m²',metre:'metre',gun:'gün',saat:'saat',takim:'takım',hizmet:'hizmet'};
const OP_PB=[['TRY','₺ TRY'],['USD','$ USD'],['EUR','€ EUR']];
const OPSTAT=[['planned','Planlandı'],['waiting','Bekliyor'],['in_progress','Devam ediyor'],
              ['done','Tamamlandı'],['cancelled','İptal']];
const opTypeLbl=v=>(OPTYPE.find(x=>x[0]===v)||[null,v])[1];
const opStatLbl=v=>(OPSTAT.find(x=>x[0]===v)||[null,v])[1];
const OPSTAT_CLS={planned:'violet',waiting:'amber',in_progress:'cyan',done:'green',cancelled:'slate'};

const _iso=d=>d.toISOString().slice(0,10);
function opDonem(kind){
  const n=new Date(); const g=n.getDay(); const pzt=new Date(n); pzt.setDate(n.getDate()-((g+6)%7));
  /* Gunluk operasyonel kontrol yuzeyinin en sik sorusu (C4 §13). */
  if(kind==='bugun'){ return [_cIso(n),_cIso(n)]; }
  /* S4.4 §24 — BUG DUZELTMESI. Asagidaki araliklar `_iso` (UTC) ile
     hesaplaniyordu. Ay/yil sinirlari YEREL gece yarisinda kurulup UTC'ye
     cevrilince TR (UTC+3) icin bir gun GERI kayiyordu - ve bu gece yarisina
     OZGU degildi, gun boyu gecerliydi. 17 Eyl 14:00'te olculdu:
       Bu ay    2026-08-31 .. 2026-09-29  (30 Eylul operasyonlari DISARIDA)
       Geçen ay 2026-07-31 .. 2026-08-30
       Bu yıl   2025-12-31 .. 2026-12-30
     Hafta araligi yalniz gece 00:00-03:00 arasi kayiyordu (Pzt 01:00'de
     hafta bir onceki haftaya dusuyordu). Tumu S4.3.1'deki yerel `_cIso`ya
     baglandi. `_iso`nun kendisi DEGISMEDI: Excel ice aktarimi (SheetJS
     tarihleri) da onu kullaniyor ve o yol ayri dogrulama ister. */
  if(kind==='hafta'){ const son=new Date(pzt); son.setDate(pzt.getDate()+6); return [_cIso(pzt),_cIso(son)]; }
  /* "Sırada ne var?" — gerçek tablonun cevapladığı ama ekranda karşılığı
     olmayan soruydu (S2 §8). Bugünden ileri 30 gün. */
  if(kind==='yaklasan'){ const son=new Date(n); son.setDate(n.getDate()+30); return [_cIso(n),_cIso(son)]; }
  if(kind==='ay')   { return [_cIso(new Date(n.getFullYear(),n.getMonth(),1)), _cIso(new Date(n.getFullYear(),n.getMonth()+1,0))]; }
  if(kind==='gecen'){ return [_cIso(new Date(n.getFullYear(),n.getMonth()-1,1)), _cIso(new Date(n.getFullYear(),n.getMonth(),0))]; }
  if(kind==='yil')  { return [_cIso(new Date(n.getFullYear(),0,1)), _cIso(new Date(n.getFullYear(),11,31))]; }
  return ['',''];
}
/* §11/§12 - gunluk kullanim sadelesti.
   DONEM: birincil serit artik `Bugün | Bu hafta | Tümü`. `Yaklaşan`,
   `Bu ay`, `Geçen ay`, `Bu yıl` ve `Özel aralık` ikincil bir aciliste
   yasiyor. Backend tarih suzmesi AYNEN duruyor (opDonem degismedi);
   yalnizca birincil yuzeyde yer kaplamiyorlar.
   DURUM: calisan artik bes mikro-durum arasinda karar vermiyor.
   `kapsam` uc degerlidir ve DB durumlarina soyle esler:
     aktif  -> planned + waiting + in_progress
     tamam  -> done
     iptal  -> cancelled   (istisnai; sayisi 0'sa gosterilmez)
   `work_operations.status` CHECK kisiti ve degerleri DEGISMEDI (§12);
   bu yalnizca bir gorunum eslemesidir. */
const OP_KAPSAM={aktif:['planned','waiting','in_progress'],tamam:['done'],iptal:['cancelled']};
const OP_DONEM_BIR=[['bugun','Bugün'],['hafta','Bu hafta'],['tum','Tümü']];
const OP_DONEM_IKI=[['yaklasan','Yaklaşan 30 gün'],['ay','Bu ay'],['gecen','Geçen ay'],
                    ['yil','Bu yıl'],['ozel','Özel aralık']];
const OP_DEF={donem:'hafta',from:'',to:'',type:'',kapsam:'aktif',q:''};
function opFiltre(){
  let f; try{ f=JSON.parse(sessionStorage.getItem('mp_op_filtre')||'null'); }catch(e){ f=null; }
  f={...OP_DEF,...(f||{})};
  /* Eski surumden gelen tekil `status` kapsama cevrilir; veri kaybi yok. */
  if(f.status){ f.kapsam=(f.status==='done')?'tamam':(f.status==='cancelled')?'iptal':'aktif'; }
  delete f.status;
  if(!OP_KAPSAM[f.kapsam]&&f.kapsam!=='tum') f.kapsam='aktif';
  return f;
}
function opFiltreYaz(f){ try{ sessionStorage.setItem('mp_op_filtre',JSON.stringify(f)); }catch(e){} }

async function operasyon(c){
  const f=opFiltre();
  let [from,to]=f.donem==='ozel'?[f.from,f.to]:opDonem(f.donem);
  const qs=['operations_list'];
  if(from) qs.push('from='+from); if(to) qs.push('to='+to);
  if(f.type) qs.push('type='+f.type);
  qs.push('belge=1');
  /* Kapsam birden cok DB durumuna denk geldigi icin sunucuya tekil
     `status` gonderilmez; sayaclar da tum kumeden hesaplanmali. */
  const [ops,jobs,custs,units]=await Promise.all([
    api(qs.join('&')), api('jobs_list'), api('customers_list'), api('units_full').catch(()=>[])]);
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  const cm={}; (custs||[]).forEach(x=>cm[x.id]=x.firma);
  const um={}; (units||[]).forEach(u=>um[u.id]=u);
  ui._ops=ops||[]; ui._opJobs=jm; ui._opCust=cm; ui._opUnits=um;
  ui._veriOkunma=new Date();                 /* S2 §5 — veri okunma anı */
  const ikincilAd=(OP_DONEM_IKI.find(x=>x[0]===f.donem)||[])[1]||'';
  const ikincilAktif=!!ikincilAd;

  let tum=(ops||[]).slice();
  const kapsamSay={aktif:0,tamam:0,iptal:0};
  tum.forEach(o=>{ for(const k in OP_KAPSAM) if(OP_KAPSAM[k].includes(o.status)) kapsamSay[k]++; });
  let list=(f.kapsam==='tum')?tum:tum.filter(o=>(OP_KAPSAM[f.kapsam]||[]).includes(o.status));
  if(f.q){ const t=f.q.toLocaleLowerCase('tr');
    list=list.filter(o=>[o.description,o.location_text,o.dimensions,o.note,
      (jm[o.job_id]||{}).title, cm[(jm[o.job_id]||{}).customer_id], cm[o.supplier_org_id],
      (um[o.unit_id]||{}).name].some(v=>String(v||'').toLocaleLowerCase('tr').includes(t))); }
  ui._opFiltered=list;
  const rows=list.map(o=>{
    const j=jm[o.job_id]||{};
    /* S4.4 §24: "gecikti" isareti de yerel gun ile (gece yarisindan sonra
       bugunku operasyon dun gibi gecikmis gorunmesin). */
    const gec=o.planned_date&&o.planned_date<_cIso(new Date())&&['planned','waiting','in_progress'].includes(o.status);
    return `<tr onclick="opForm(${o.id})" style="cursor:pointer">
      <td class="mono dim">${o.planned_date?esc(trTarih(o.planned_date)):'<span class="muted">tarihsiz</span>'}${gec?' <span style="color:#b3261e" title="Gecikti">⚠</span>':''}</td>
      ${/* §15: operasyon satirindan ISE gecis. Hucre kaydin duzenleme
           modalini DEGIL, Work'u acar; satirin geri kalani duzenlemeye
           gider. Operasyon ve Work ayri kayitlar olarak KALIR. */''}
      <td onclick="event.stopPropagation();workAc(${o.job_id})" class="op-j"
          title="İşi aç: ${esc(j.title||'')}">${esc(j.title||('#'+o.job_id))}<br>
        <span class="muted" style="font-size:12px">${esc(orgKisa(cm[j.customer_id]||''))}</span></td>
      <td><span class="pill">${esc(opTypeLbl(o.operation_type))}</span></td>
      <td>${esc(o.description||'')}</td>
      <td class="mono">${o.quantity!=null?esc(String(o.quantity).replace(/\.0+$/,''))+(o.quantity_unit&&o.quantity_unit!=='adet'?' '+esc(OP_BIRIM[o.quantity_unit]||o.quantity_unit):''):''}</td>
      <td>${esc(o.dimensions||'')}</td>
      <td>${esc((um[o.unit_id]||{}).name||o.location_text||'')}</td>
      ${/* Kurum sutunuyla ayni gorunum kurali: tuzel unvan ekleri satiri
           uc satira yayiyordu. Tam unvan `title` ile erisilebilir kalir,
           kimlik verisine dokunulmaz (S3.1 §8). */''}
      <td title="${esc(cm[o.supplier_org_id]||'')}">${esc(orgKisa(cm[o.supplier_org_id]||''))}</td>
      <td><span class="badge-st st-${esc(o.status)}">${esc(opStatLbl(o.status))}</span>
          ${o.note?`<div class="lz-s">${esc(String(o.note).slice(0,52))}</div>`:''}</td></tr>`;}).join('');

  c.innerHTML=`<div class="sec-head">
      <div><h3>Baskı &amp; Montaj</h3><p class="sub">${list.length} kayıt · aktif takip uygulamada, Excel yalnız alışveriş formatı</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-outline btn-sm" onclick="opExport()">${ic('download',15)} Excel'e Aktar</button>
        ${ui._role==='admin'?`<button class="btn btn-outline btn-sm" onclick="opImport()">${ic('upload',15)} Excel'den Al</button>`:''}
        <button class="btn btn-sm act act-ops" onclick="opForm(0)">${ic('plus',15)} Yeni Kayıt</button></div></div>

    ${coordKisayol('operasyon')}
    ${/* S2 §8: dönem artık bir formun içine gömülü select değil, doğrudan
         tıklanabilir bir şerit. Gerçek tablonun sorduğu dört soru —
         bugün / bu hafta / sırada ne var / ne bitti — tek tıkla. */''}
    ${/* §11: gunluk serit uc secenek. Digerleri kaybolmadi, ikincil
         acilistede - ve secili olan serit icinde chip olarak yaziyor ki
         kullanici hangi donemde oldugunu kaybetmesin. */''}
    <div class="op-bar">
      <div class="ws-switch inline" role="group" aria-label="Dönem">
        ${OP_DONEM_BIR.map(o=>`<button type="button" class="${f.donem===o[0]?'on':''}" aria-pressed="${f.donem===o[0]}"
            onclick="opDonemSec('${o[0]}')">${o[1]}</button>`).join('')}
        ${ikincilAktif?`<button type="button" class="on" aria-pressed="true"
            title="Dönem seçimini temizle" onclick="opDonemSec('hafta')">${esc(ikincilAd)} ✕</button>`:''}
      </div>
      <select class="inp inp-sm ${ikincilAktif?'inp-on':''}" id="opDonem2" aria-label="Diğer dönem"
        onchange="opDonemSec(this.value)">
        <option value="">Diğer dönem…</option>
        ${OP_DONEM_IKI.map(o=>`<option value="${o[0]}" ${f.donem===o[0]?'selected':''}>${esc(o[1])}</option>`).join('')}</select>
      <input class="inp inp-sm" id="opQ" value="${esc(f.q)}" style="flex:1 1 190px;max-width:280px"
        placeholder="İş, kurum, tedarikçi, yer, açıklama" oninput="opFiltreDegis()" aria-label="Ara">
      <select class="inp inp-sm ${f.type?'inp-on':''}" id="opType" onchange="opFiltreDegis()" aria-label="Tür">
        <option value="">Tüm türler</option>
        ${OPTYPE.filter(o=>o[0]!=='diger'||f.type==='diger').map(o=>`<option value="${o[0]}" ${f.type===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select>
    </div>
    <div class="op-bar op-ozel" id="opOzelBox" ${f.donem==='ozel'?'':'hidden'}>
      <label class="qc-mini" for="opFrom">Başlangıç</label>
      <input class="inp inp-sm" type="date" id="opFrom" value="${esc(f.from)}" onchange="opFiltreDegis()">
      <label class="qc-mini" for="opTo">Bitiş</label>
      <input class="inp inp-sm" type="date" id="opTo" value="${esc(f.to)}" onchange="opFiltreDegis()">
    </div>
    ${/* §12: calisan artik bes mikro-durum arasinda gezinmiyor.
         `İptal` istisnaidir - hic kayit yoksa gosterilmez bile. */''}
    <div class="op-bar op-say">
      <div class="ws-switch inline" role="group" aria-label="Durum kapsamı">
        ${[['aktif','Aktif'],['tamam','Tamamlananlar']]
          .concat(kapsamSay.iptal?[['iptal','İptal']]:[])
          .concat(f.kapsam==='tum'?[['tum','Tümü']]:[])
          .map(([k,l])=>`<button type="button" class="${f.kapsam===k?'on':''}" aria-pressed="${f.kapsam===k}"
            onclick="opFiltre2({kapsam:'${k}'})">${esc(l)}${kapsamSay[k]?` <span class="tabn mono">${kapsamSay[k]}</span>`:''}</button>`).join('')}
      </div>
      <span class="fhint">Aktif = planlandı + bekliyor + devam ediyor</span>
    </div>
    ${opFiltreBanner(f,from,to,list.length)}

    ${list.length?`<div class="sec-card" style="overflow-x:auto">
      <table class="tbl rowlink"><thead><tr>
        <th>Tarih</th><th>İş / Kurum</th><th>Tür</th><th>Açıklama</th><th>Adet</th>
        <th>Ölçü</th><th>Yer / Pozisyon</th><th>Uygulayan</th><th>Durum</th>
      </tr></thead><tbody>${rows}</tbody></table></div>`
    :'<div class="sec-card"><p class="empty">Bu dönemde planlanmış baskı/montaj yok.</p></div>'}`;
}
/* Ana Sayfa "Bu Hafta Baski & Montaj" karti icin tek giris noktasi:
   donem filtresini kurup operasyon ekranina gecer (C4 §17). */
function opFiltre2(patch){ opFiltreYaz({...opFiltre(),...patch}); renderSection(); }
function opDonemSec(d){ if(!d) return; opFiltre2({donem:d}); }
/* S2 §8/§13 + S1.1 §8: hangi dönemi ve hangi filtreyi görüyoruz — ekranda
   açıkça yazar. Aynı zamanda İŞ TARİHİ ile VERİNİN OKUNDUĞU AN'ı ayırır:
   burada yazan aralık iş dönemidir, dosya adındaki tarih değil. */
function opFiltreBanner(f,from,to,adet){
  const donemAd={bugun:'Bugün',hafta:'Bu hafta',yaklasan:'Yaklaşan 30 gün',ay:'Bu ay',
                 gecen:'Geçen ay',yil:'Bu yıl',ozel:'Özel aralık',tum:'Tüm zamanlar'}[f.donem]||f.donem;
  const kapsamAd={aktif:'Aktif',tamam:'Tamamlananlar',iptal:'İptal',tum:'Tüm durumlar'}[f.kapsam]||f.kapsam;
  const p=[`İş dönemi: <b>${esc(donemAd)}</b>${from&&to?` (${esc(trTarih(from))} – ${esc(trTarih(to))})`:''}`,
           `Durum: <b>${esc(kapsamAd)}</b>`];
  if(f.type)   p.push('Tür: '+esc(opTypeLbl(f.type)));
  if(f.q)      p.push(`Ara: “${esc(f.q)}”`);
  const filtreli=!!(f.type||f.q||f.kapsam!=='aktif');
  return `<div class="afilt ${filtreli?'':'neutral'}">
    <span class="afilt-l">${filtreli?'Aktif filtre':'Görünüm'}</span>
    <span class="afilt-v">${p.join(' · ')}</span>
    <span class="afilt-n">${adet} kayıt</span>
    ${filtreli?`<button type="button" class="afilt-x" onclick="opFiltre2({type:'',kapsam:'aktif',q:''})">Temizle ✕</button>`:''}</div>`;
}
function opGo(donem,kapsam){
  opFiltreYaz({...opFiltre(),donem:donem||'hafta',from:'',to:'',kapsam:kapsam||'aktif'});
  go('operasyon');
}
function opFiltreDegis(){
  /* Dönem artık bir select değil, şerit düğmesi (opDonemSec). Buradan
     yalnız serbest alanlar okunur; mevcut dönem korunur. */
  const f=opFiltre();
  opFiltreYaz({...f, from:gv('opFrom')||'', to:gv('opTo')||'',
    type:gv('opType')||'', q:gv('opQ')||''});
  canliArama('opQ',renderSection);
}

/* ---------- Operation formu (hem shared view hem Work detail) ---------- */
/* Operasyon turune gore makul varsayilan belge turu (kullanici degistirir). */
function opEkVarsayilan(t){
  return t==='montaj'?{varsayilan:'diger',varsayilanResim:'montaj_fotografi'}
    :t==='sokum'?{varsayilan:'diger',varsayilanResim:'sokum_fotografi'}
    :t==='baski'?{varsayilan:'baski_dosyasi',varsayilanResim:'baski_dosyasi'}
    :{varsayilan:'diger',varsayilanResim:'diger'};
}
function opEkTurGuncelle(){ if(EK.op) Object.assign(EK.op,opEkVarsayilan(gv('opT'))); }
async function opForm(id,jobId){
  /* S7.1 §26: YENI kayit cok satirli formdan acilir. Olusturulduktan sonra
     her operasyon bagimsiz bir `work_operations` satiridir ve asagidaki tek
     kayit formuyla duzenlenir (§34) - kalici bir "toplu" kavrami yoktur. */
  if(!id) return opTopluForm(jobId);
  /* S6: Work detayindan aciliyorsa ONCE o isin taze listesi okunur; aksi
     halde daha once acilmis Baski & Montaj ekraninin bayat listesi (ekleri
     eksik) kullanilabilirdi. */
  const isteyiz=(history.state&&history.state.mp&&history.state.v==='work');
  const o=((isteyiz?ui._workOps:ui._ops)||[]).find(x=>x.id===id)
        ||(ui._workOps||[]).find(x=>x.id===id)||(ui._ops||[]).find(x=>x.id===id)||{};
  const veri=await guard(()=>Promise.all([api('jobs_list'),api('customers_list'),api('units_full').catch(()=>[]),api('price_groups_list').catch(()=>[])]),'Form açılamadı');
  if(!veri)return;
  const [jobs,custs,units,gruplar]=veri;
  ui._opPg=gruplar||[];
  const jid=jobId||o.job_id||((ui._work||{}).id)||0;
  ekYeni('op',{mevcut:(o.document_links||[]).filter(l=>l.documents).map(l=>({link_id:l.id,doc:l.documents})),
               ...opEkVarsayilan(o.operation_type||'baski')});
  const eskiKanit=(Array.isArray(o.evidence_urls)?o.evidence_urls:[]).filter(Boolean);
  modal(`<h3 style="margin:0 0 6px">${id?'Kaydı Düzenle':'Yeni Baskı / Montaj Kaydı'}</h3>
    ${/* §15: Work ve Work Operation AYRI kayitlar olarak kalir. Burada
         yalniz gecis guclendirilir: ise gec, ya da insan diliyle bir
         guncelleme birak. Operasyona ozel bir yorum alani ACILMAZ -
         anlatimin yeri kanonik Entry / Work zaman cizelgesidir. */''}
    ${(id&&jid)?`<div class="op-lnk">
      <button type="button" class="btn-link" onclick="opIse(${jid})">İşi aç →</button>
      <button type="button" class="btn-link" onclick="opGuncelle(${jid})">Bu işe güncelleme ekle</button>
    </div>`:'<div style="height:8px"></div>'}
    <input type="hidden" id="opid" value="${id||0}">
    <div class="row2">
      ${/* §14: global baglamdan acildiginda Is ON-SECILI DEGILDIR.
           Once listenin ilk isini secili gosteriyorduk; kullanici fark
           etmeden yanlis ise kayit acabilirdi. Secim artik aciktir. */''}
      <div class="field"><label class="flabel" for="opJob">İş *</label>
        <select class="inp" id="opJob" onchange="opPgCiz()">
          ${jid?'':'<option value="">— iş seçin —</option>'}
          ${(jobs||[]).map(j=>`<option value="${j.id}" ${String(jid)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('')}</select></div>
      ${/* §13: `diger` gercek kullanimda SIFIR satir tasiyor (canli sayim);
           yeni kayitta bir "cop kutusu" secenegi sunmak siniflandirmayi
           bozardi. Backend degeri KALDIRILMADI - eski bir kayit onu
           tasiyorsa secenek gorunur ve kaydedilebilir. */''}
      <div class="field"><label class="flabel" for="opT">Tür *</label>
        <select class="inp" id="opT" onchange="opEkTurGuncelle()">${OPTYPE.filter(t=>t[0]!=='diger'||o.operation_type==='diger')
          .map(t=>`<option value="${t[0]}" ${o.operation_type===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label class="flabel" for="opDesc">Açıklama / ürün</label><input class="inp" id="opDesc" value="${esc(o.description)}" placeholder="ör. M1 AVM megalight baskı"></div>
    <label class="rp2-chk" style="margin:-4px 0 10px"><input type="checkbox" id="opRe" ${o.reprint?'checked':''}> <span>Yeniden baskı <em>ölçü revizesi, yer değişikliği…</em></span></label>
    <fieldset class="op-fs"><legend>Teknik</legend>
      <div class="row2">
        <div class="field"><label class="flabel" for="opMat">Malzeme / cins</label><input class="inp" id="opMat" value="${esc(o.material)}" placeholder="ör. Önden ışıklı vinil"></div>
        <div class="field"><label class="flabel" for="opGr">Gramaj (gr/m²)</label><input class="inp" type="number" min="1" step="1" id="opGr" value="${esc(o.grammage_gsm)}"></div></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="opDim">Baskı ölçüsü</label><input class="inp" id="opDim" value="${esc(o.dimensions)}" placeholder="ör. 290 x 590 cm"></div>
        <div class="field"><label class="flabel" for="opVis">Görünen alan</label><input class="inp" id="opVis" value="${esc(o.visible_size)}" placeholder="ör. 282 x 583 cm"></div></div>
      <div class="row3">
        <div class="field"><label class="flabel" for="opYz">Yüzey sayısı</label><input class="inp" type="number" min="0" step="1" id="opYz" value="${esc(o.surface_count)}"></div>
        <div class="field"><label class="flabel" for="opQty">Miktar</label><input class="inp" type="number" step="0.01" id="opQty" value="${esc(o.quantity)}"></div>
        <div class="field"><label class="flabel" for="opBr">Birim</label><select class="inp" id="opBr">${Object.entries(OP_BIRIM).map(([k,l])=>`<option value="${k}" ${(o.quantity_unit||'adet')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div></div>
      <p class="fhint" style="margin-top:-4px">Baskı satırında miktar = baskı adedi. Yüzey sayısı ayrıdır. Hizmetlerde birimi seçin (ör. 4 gün vinç).</p>
    </fieldset>
    <div class="row2">
      <div class="field"><label class="flabel" for="opUnit">Pozisyon (mecra)</label>
        <select class="inp" id="opUnit"><option value="">— yok —</option>${(units||[]).map(u=>`<option value="${u.id}" ${String(o.unit_id)===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opLoc">Yer (serbest)</label><input class="inp" id="opLoc" value="${esc(o.location_text)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opSup">Baskı merkezi / uygulayan kurum</label>
        <select class="inp" id="opSup" data-ara><option value="">— yok —</option>${(custs||[]).map(x=>`<option value="${x.id}" ${String(o.supplier_org_id)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opDate">Planlanan tarih</label><input class="inp" type="date" id="opDate" value="${esc(o.planned_date)}"></div>
    </div>
    <div class="field" style="max-width:260px"><label class="flabel" for="opSt">Durum</label>
      <select class="inp" id="opSt">${OPSTAT.map(t=>`<option value="${t[0]}" ${(o.status||'planned')===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></div>
    <fieldset class="op-fs"><legend>Ticari <em>iç bilgi</em></legend>
      <div class="row3">
        <div class="field"><label class="flabel" for="opUc">Birim maliyet</label><input class="inp" type="number" min="0" step="0.01" id="opUc" value="${esc(o.unit_cost)}"></div>
        <div class="field"><label class="flabel" for="opCost">Maliyet (satır)</label><input class="inp" type="number" min="0" step="0.01" id="opCost" value="${esc(o.cost)}"></div>
        <div class="field"><label class="flabel" for="opSale">Satış bedeli</label><input class="inp" type="number" min="0" step="0.01" id="opSale" value="${esc(o.sale_amount)}"></div></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="opPb">Para birimi</label><select class="inp" id="opPb">${OP_PB.map(([k,l])=>`<option value="${k}" ${(o.currency||'TRY')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
        <div class="field"><label class="flabel" for="opPg">Paket bedeli</label><select class="inp" id="opPg" data-sec="${esc(o.price_group_id||'')}" onchange="opPgYeniGoster()"></select></div></div>
      <div id="opPgYeni" hidden>
        <div class="row3">
          <div class="field"><label class="flabel" for="opPgAd">Paket adı</label><input class="inp" id="opPgAd" placeholder="ör. Lansman baskı paketi"></div>
          <div class="field"><label class="flabel" for="opPgM">Paket maliyeti</label><input class="inp" type="number" min="0" step="0.01" id="opPgM"></div>
          <div class="field"><label class="flabel" for="opPgS">Paket satışı</label><input class="inp" type="number" min="0" step="0.01" id="opPgS"></div></div>
        <p class="fhint" style="margin-top:-4px">Paket bedeli birden çok işlemi kapsayan TEK tutardır; raporda satırlara dağıtılmaz. Para birimi yukarıdaki seçimdir.</p></div>
      <p class="fhint" id="opPgBilgi"></p>
    </fieldset>
    <div class="field"><label class="flabel" for="opNote">Not</label><textarea class="inp" id="opNote">${esc(o.note)}</textarea></div>
    <div class="field"><span class="flabel">Dosyalar — montaj fotoğrafı, baskı provası, ölçü belgesi</span>
      ${ekAlan('op')}</div>
    ${/* S6 §39: eski kanit URL'leri KORUNUR ve acilabilir kalir. Yeni ekler
         Belgeler sistemine gider; eski alan geriye donuk uyumluluk icindir. */''}
    ${eskiKanit.length?`<div class="op-eski">Eski kanıt bağlantıları: ${eskiKanit.map((u,i)=>/^https?:\/\//i.test(u)
      ?`<a href="${esc(u)}" target="_blank" rel="noopener">Bağlantı ${i+1} ↗</a>`:`<span>${esc(u)}</span>`).join(' · ')}</div>`:''}
    <details class="op-eski-d" ${eskiKanit.length?'':''}><summary>Eski kanıt bağlantı alanı</summary>
    <div class="field"><label class="flabel" for="opEv">Kanıt görseli / belge bağlantıları (her satıra bir URL)</label>
      <textarea class="inp" id="opEv" rows="2" placeholder="https://drive.google.com/...">${esc(eskiKanit.join('\n'))}</textarea></div></details>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      ${(id&&isAdmin())?`<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="opDel(${id})">Sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="opSave()">Kaydet</button></div>`);
  opPgCiz();
}
/* S12: paket bedeli seçimi yalnız formdaki işin paketlerini gösterir. */
function opPgCiz(){
  const el=document.getElementById('opPg'); if(!el) return;
  const jid=+gv('opJob'); const sec=el.dataset.sec||'';
  const L=(ui._opPg||[]).filter(g=>g.job_id===jid);
  el.innerHTML=`<option value="">— paket yok —</option>${L.map(g=>`<option value="${g.id}" ${String(sec)===String(g.id)?'selected':''}>${esc(g.label)}</option>`).join('')}${jid?'<option value="yeni">+ Yeni paket…</option>':''}`;
  opPgYeniGoster();
}
function opPgYeniGoster(){
  const y=document.getElementById('opPgYeni'); if(y) y.hidden=gv('opPg')!=='yeni';
  const b=document.getElementById('opPgBilgi'); const g=(ui._opPg||[]).find(x=>String(x.id)===gv('opPg'));
  const tl=v=>Number(v).toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(b) b.innerHTML=g?`${esc(`Paket: ${[g.cost_amount!=null?'maliyet '+tl(g.cost_amount):'',g.sale_amount!=null?'satış '+tl(g.sale_amount):''].filter(Boolean).join(' · ')} ${g.currency}. Paket bedeli toplamda bir kez sayılır; bu satırın tutarları bilgi amaçlıdır.`)}
    <button type="button" class="btn-link" onclick="paketDuzenle(${g.id})">Paket bedelini düzenle →</button>`:'';
}

/* S4.4: `opOncekiBul()` kaldirildi. Yalnizca istemci tarafi sysEntry'ye
   "onceki durum" saglamak icin vardi (C4 §16'daki sahte "undefined -> X"
   hatasinin duzeltmesi). Gecis artik tetikleyicide OLD/NEW'den okunuyor;
   bayat bir istemci onbellegine bagli kalmak da ortadan kalkti. */
async function opSave(){
  const jid=+gv('opJob');
  if(!jid){ mpAlert('İş seçimi zorunlu.'); return; }
  const ev=(gv('opEv')||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const num=v=>v!==''&&v!=null?+v:null;
  const id=+gv('opid');
  const st=gv('opSt')||'planned';
  const pb=gv('opPb')||'TRY';
  let pg=gv('opPg');
  if(pg==='yeni'){
    const ad=(gv('opPgAd')||'').trim(), pm=num(gv('opPgM')), ps=num(gv('opPgS'));
    if(!ad){ mpAlert('Yeni paket için kısa bir ad girin.','Paket bedeli'); return; }
    if(pm==null&&ps==null){ mpAlert('Paket için maliyet ya da satış tutarı girin.','Paket bedeli'); return; }
    modalBusy(true);
    const g=await guard(()=>api('price_group_save',{job_id:jid,label:ad,cost_amount:pm,sale_amount:ps,currency:pb}),'Paket oluşturulamadı');
    modalBusy(false);
    if(g===null) return;
    /* Paket oluştu; kayıt başarısız olursa yeniden denemede AYNI paket
       kullanılır (ikinci paket açılmaz). */
    ui._opPg=[...(ui._opPg||[]),g]; const el=document.getElementById('opPg'); if(el){ el.dataset.sec=String(g.id); opPgCiz(); }
    pg=String(g.id);
  }
  modalBusy(true);
  const r=await guard(()=>api('operation_save',{id,job_id:jid,operation_type:gv('opT'),
    status:st,description:gv('opDesc')||null,quantity:num(gv('opQty')),quantity_unit:gv('opBr')||'adet',
    dimensions:gv('opDim')||null,visible_size:gv('opVis')||null,surface_count:num(gv('opYz')),
    material:gv('opMat')||null,grammage_gsm:num(gv('opGr')),reprint:!!(document.getElementById('opRe')||{}).checked,
    supplier_org_id:+gv('opSup')||null,unit_id:+gv('opUnit')||null,location_text:gv('opLoc')||null,
    planned_date:gv('opDate')||null,cost:num(gv('opCost')),unit_cost:num(gv('opUc')),sale_amount:num(gv('opSale')),
    currency:pb,price_group_id:pg?+pg:null,note:gv('opNote')||null,
    evidence_urls:ev}),'Kayıt kaydedilemedi');
  if(r===null){ modalBusy(false); return; }
  /* S6 §38: operasyon kaydi once yazilir, ekler sonra baglanir. Ek
     basarisizsa kayit korunur; form acik kalir ve Kaydet yeniden dener. */
  const opId=id||(r&&r.id);
  if(opId){ const el=document.getElementById('opid'); if(el) el.value=String(opId); }
  if(opId&&EK.op){
    const g=await ekGonder('op',[{operation_id:opId}]);
    if(!g.ok){ modalBusy(false);
      if(g.sessiz) toast('Kayıt kaydedildi; dosya henüz eklenmedi.');
      else mpAlert('Kayıt kaydedildi, ancak dosya eklenemedi: '+g.hata+' — Kaydet ile tekrar deneyin.','Dosya'); return; }
    const kal=[...EK.op.kaldir];
    if(kal.length){
      try{ await belgeBagKaldir(kal); EK.op.mevcut=EK.op.mevcut.filter(m=>!EK.op.kaldir.has(m.link_id)); EK.op.kaldir.clear(); }
      catch(err){ modalBusy(false); mpAlert((err&&err.message)||String(err),'Ek kaldırılamadı'); return; }
    }
  }
  modalBusy(false);
  /* Operasyon structured source of truth'tur; Entry yalniz tarihsel izdir.
     Yalniz GERCEKTEN anlamli gecisler yazilir: kayit acilisi, fiilen
     baslama, tamamlanma ve iptal. Onceki durum bilinmiyorsa (kayit hicbir
     onbellekte yok) sahte bir gecis uydurulmaz - sessiz kalinir. */
  /* S4.4: operasyon hareketleri (olusturma, baslama, tamamlanma, iptal)
     artik trg_ops_hareket'ten gelir. Ayni anlamli-gecis kurali orada. */
  closeModal(); toast('Kaydedildi.');
  if(ui.section==='operasyon') renderSection(); else workAc(jid);
}
/* ============ TOPLU BASKI / MONTAJ GIRISI (S7.1 §26-§34) ==============
   Tek oturumda ayni Work icin N operasyon. Ust kisim ORTAK baglam (is,
   uygulayan, tarih, durum, not, ortak dosya); satirlar degisen alanlar
   (tur, pozisyon, aciklama, adet, olcu, serbest yer, maliyet).
   Kayit `operations_batch_create` RPC'siyle TEK islemdir: ya tum satirlar
   (+ ortak dosyanin her satira baglantisi) yazilir ya hicbiri. Dosya
   fiziksel olarak BIR kez yuklenir; N baglanti satiri alir.
   Pozisyon dizisi tek satirda SAKLANMAZ: her pozisyon kendi satiri. */
const OPB_TUR=[['baski','Baskı'],['montaj','Montaj'],['sokum','Söküm']];
async function opTopluForm(jobId){
  const veri=await guard(()=>Promise.all([api('jobs_list'),api('customers_list'),sozUnitYukle()]),'Form açılamadı');
  if(!veri) return;
  const [jobs,custs]=veri;
  islemYeni('opb');                               /* S14: yeni form = yeni oluşturma girişimi */
  const jid=jobId||((history.state&&history.state.v==='work'&&ui._work)?ui._work.id:0)||0;
  ui._opb={sec:new Set(),satir:[opbYeniSatir('baski')],ara:''};
  ekYeni('opb',opEkVarsayilan('baski'));
  const aktifIsler=(jobs||[]).filter(j=>j.lifecycle_status!=='kapandi'||String(j.id)===String(jid));
  modal(`<h3 style="margin:0 0 4px">Yeni Baskı / Montaj Kaydı</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">Birden çok yüzey ve iş türü tek seferde girilir; her satır ayrı bir kayıt olur.</p>
    <div class="opb-ort">
      <div class="field"><label class="flabel" for="opbJob">İş *</label>
        <select class="inp" id="opbJob">${jid?'':'<option value="">— iş seçin —</option>'}
          ${aktifIsler.map(j=>`<option value="${j.id}" ${String(jid)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opbSup">Uygulayan / tedarikçi</label>
        <select class="inp" id="opbSup" data-ara><option value="">— yok —</option>${(custs||[]).map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opbDate">Planlanan tarih</label><input class="inp" type="date" id="opbDate"></div>
      <div class="field"><label class="flabel" for="opbSt">Durum</label>
        <select class="inp" id="opbSt">${OPSTAT.map(t=>`<option value="${t[0]}" ${t[0]==='planned'?'selected':''}>${t[1]}</option>`).join('')}</select></div>
    </div>

    <details class="opb-pk" open>
      <summary>Pozisyonlardan satır üret <span class="chip" id="opbSecSay">0 seçili</span></summary>
      <div class="opb-pk-h">
        <input class="inp inp-sm" id="opbAra" placeholder="Pozisyon ara — P1, Megalight, M1…" aria-label="Pozisyon ara" oninput="opbAraDegis()">
        <span class="opb-pk-t" role="group" aria-label="Üretilecek tür">${OPB_TUR.map(([v,l])=>`<label><input type="checkbox" class="opbT" value="${v}" ${v==='baski'?'checked':''}> ${l}</label>`).join('')}</span>
        <button type="button" class="btn btn-outline btn-sm" onclick="opbUret()">Satır üret</button>
      </div>
      <div class="opb-pk-l" id="opbPkL"></div>
    </details>

    <div class="tc-h" style="margin-top:12px">Satırlar <span class="chip" id="opbSay"></span></div>
    <div class="opb-rows" id="opbRows"></div>
    <div style="display:flex;gap:8px;align-items:center;margin:6px 0 12px">
      <button type="button" class="btn btn-outline btn-sm" onclick="opbSatirEkle()">${ic('plus',15)} Satır ekle</button>
      <span class="fhint" id="opbOzet" style="margin:0 0 0 auto"></span></div>

    <div class="field"><label class="flabel" for="opbNote">Genel not (tüm satırlara)</label>
      <input class="inp" id="opbNote" placeholder="ör. Vinil germe, gece montajı"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opbMat">Malzeme / cins (tüm satırlara, isteğe bağlı)</label><input class="inp" id="opbMat" placeholder="ör. Avrupa vinil"></div>
      <div class="field"><label class="flabel" for="opbPb">Para birimi</label><select class="inp" id="opbPb">${OP_PB.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></div></div>
    <details class="opb-pk"><summary>Paket bedeli <span class="muted">— satırların ortak (tek) bedeli varsa</span></summary>
      <label class="rp2-chk" style="margin:8px 0"><input type="checkbox" id="opbPkOn"> <span>Bu satırların bedeli tek bir paket tutarıdır</span></label>
      <div class="row3">
        <div class="field"><label class="flabel" for="opbPkAd">Paket adı</label><input class="inp" id="opbPkAd" placeholder="ör. Fuar baskı + montaj paketi"></div>
        <div class="field"><label class="flabel" for="opbPkM">Paket maliyeti</label><input class="inp" type="number" min="0" step="0.01" id="opbPkM"></div>
        <div class="field"><label class="flabel" for="opbPkS">Paket satışı</label><input class="inp" type="number" min="0" step="0.01" id="opbPkS"></div></div>
      <p class="fhint">Paket tutarı bir kez saklanır ve raporlarda satırlara dağıtılmaz.</p></details>
    <div class="field"><span class="flabel">Ortak dosyalar — baskı provası, ölçü belgesi (tek dosya, tüm satırlara bağlanır)</span>
      ${ekAlan('opb')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="opbKaydetB" onclick="opbKaydet()">Kaydet</button></div>`);
  const m=document.getElementById('modal'); if(m) m.classList.add('mdl-gen');
  opbPkCiz(); opbSatirCiz();
}
let _opbSay=0;
function opbYeniSatir(t,unit){ return {k:'r'+(++_opbSay),operation_type:t||'baski',unit_id:unit||'',description:'',quantity:'',quantity_unit:'adet',dimensions:'',location_text:'',cost:''}; }
const opbBos=s=>!s.unit_id&&!String(s.description||'').trim()&&!String(s.location_text||'').trim()
  &&s.quantity===''&&!String(s.dimensions||'').trim()&&s.cost==='';
const opbUnitAd=u=>u?`${u.name}${u.urun?' · '+u.urun:''}`:'';
function opbPkCiz(){
  const box=document.getElementById('opbPkL'); if(!box||!ui._opb) return;
  const q=(ui._opb.ara||'').toLocaleLowerCase('tr').trim();
  const L=(ui._sozUnitList||[]).filter(u=>!q||[u.name,u.urun,u.mecra,u.konum].join(' ').toLocaleLowerCase('tr').includes(q));
  const gr={}; L.forEach(u=>{ const k=u.mecra||'—'; (gr[k]=gr[k]||[]).push(u); });
  box.innerHTML=Object.keys(gr).length?Object.entries(gr).map(([k,us])=>`<div class="opb-pk-g">
      <div class="opb-pk-gh">${esc(k)} <button type="button" class="btn-link" onclick="opbGrupSec(${esc(JSON.stringify(us.map(u=>u.id)))})">tümü</button></div>
      <div class="opb-pk-gl">${us.map(u=>`<label class="opb-pk-i ${ui._opb.sec.has(u.id)?'on':''}" title="${esc([u.mecra,u.urun,u.name,u.olcu].filter(Boolean).join(' · '))}">
        <input type="checkbox" ${ui._opb.sec.has(u.id)?'checked':''} onchange="opbSec(${u.id},this.checked)">
        <b>${esc(u.name)}</b><em>${esc(u.urun||'')}</em></label>`).join('')}</div></div>`).join('')
    :'<p class="tc-bos">Eşleşen pozisyon yok.</p>';
  const s=document.getElementById('opbSecSay'); if(s) s.textContent=ui._opb.sec.size+' seçili';
}
function opbAraDegis(){ ui._opb.ara=gv('opbAra'); opbPkCiz(); }
function opbSec(id,on){ if(on) ui._opb.sec.add(id); else ui._opb.sec.delete(id); opbPkCiz(); }
function opbGrupSec(ids){ const hepsi=ids.every(i=>ui._opb.sec.has(i));
  ids.forEach(i=>hepsi?ui._opb.sec.delete(i):ui._opb.sec.add(i)); opbPkCiz(); }
function opbOku(){
  document.querySelectorAll('#opbRows .opb-r').forEach(r=>{
    const s=ui._opb.satir.find(x=>x.k===r.dataset.k); if(!s) return;
    r.querySelectorAll('[data-f]').forEach(e=>{ s[e.dataset.f]=e.value; });
  });
}
/* Secili pozisyonlar x secili turler -> satir. Ayni pozisyon+tur zaten
   varsa tekrar eklenmez; hic doldurulmamis bos satirlar yer acar. */
function opbUret(){
  opbOku();
  const turler=[...document.querySelectorAll('.opbT:checked')].map(x=>x.value);
  if(!ui._opb.sec.size){ mpAlert('Önce listeden pozisyon seçin.','Pozisyon'); return; }
  if(!turler.length){ mpAlert('En az bir tür seçin (Baskı, Montaj ya da Söküm).','Tür'); return; }
  const U=ui._sozUnits||{};
  const sirali=[...ui._opb.sec].sort((a,b)=>String((U[a]||{}).name).localeCompare(String((U[b]||{}).name),'tr',{numeric:true}));
  let eklenen=0;
  ui._opb.satir=ui._opb.satir.filter(s=>!opbBos(s));
  turler.forEach(t=>sirali.forEach(uid=>{
    if(ui._opb.satir.some(s=>String(s.unit_id)===String(uid)&&s.operation_type===t)) return;
    const s=opbYeniSatir(t,uid); const u=U[uid]; if(u&&u.olcu) s.dimensions=u.olcu;
    ui._opb.satir.push(s); eklenen++; }));
  ui._opb.sec.clear(); opbPkCiz(); opbSatirCiz();
  toast(eklenen?eklenen+' satır eklendi.':'Seçilen pozisyonlar zaten satırlarda.');
}
function opbSatirEkle(){ opbOku(); const son=ui._opb.satir[ui._opb.satir.length-1];
  ui._opb.satir.push(opbYeniSatir(son?son.operation_type:'baski')); opbSatirCiz();
  const r=[...document.querySelectorAll('#opbRows .opb-r')].pop(); if(r){ const e=r.querySelector('[data-f="unit_id"]'); if(e) e.focus(); } }
function opbSatirSil(k){ opbOku(); ui._opb.satir=ui._opb.satir.filter(x=>x.k!==k); opbSatirCiz(); }
function opbSatirCiz(){
  const box=document.getElementById('opbRows'); if(!box) return;
  const L=ui._sozUnitList||[];
  const gr={}; L.forEach(u=>{ const k=u.mecra||'—'; (gr[k]=gr[k]||[]).push(u); });
  const uOpt=sel=>`<option value="">— pozisyon yok —</option>`+Object.entries(gr).map(([k,us])=>
    `<optgroup label="${esc(k)}">${us.map(u=>`<option value="${u.id}" ${String(sel)===String(u.id)?'selected':''}>${esc(opbUnitAd(u))}</option>`).join('')}</optgroup>`).join('');
  box.innerHTML=ui._opb.satir.length?ui._opb.satir.map((s,ix)=>`<div class="opb-r ${s._hata?'hata':''}" data-k="${s.k}">
      <span class="opb-n" aria-hidden="true">${ix+1}</span>
      <select class="inp inp-sm" data-f="operation_type" aria-label="Satır ${ix+1} tür" onchange="opbOzet()">${OPB_TUR.concat(s.operation_type==='diger'?[['diger','Diğer']]:[]).map(t=>`<option value="${t[0]}" ${s.operation_type===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select>
      <select class="inp inp-sm opb-u" data-f="unit_id" aria-label="Satır ${ix+1} pozisyon">${uOpt(s.unit_id)}</select>
      <input class="inp inp-sm opb-d" data-f="description" aria-label="Satır ${ix+1} açıklama" placeholder="Açıklama" value="${esc(s.description)}">
      <span class="opb-qu"><input class="inp inp-sm" data-f="quantity" type="number" min="0.01" step="0.01" aria-label="Satır ${ix+1} miktar" placeholder="Miktar" value="${esc(s.quantity)}">
        <select class="inp inp-sm" data-f="quantity_unit" aria-label="Satır ${ix+1} birim">${Object.entries(OP_BIRIM).map(([k,l])=>`<option value="${k}" ${(s.quantity_unit||'adet')===k?'selected':''}>${esc(l)}</option>`).join('')}</select></span>
      <input class="inp inp-sm" data-f="dimensions" aria-label="Satır ${ix+1} ölçü" placeholder="Ölçü" value="${esc(s.dimensions)}">
      <input class="inp inp-sm" data-f="location_text" aria-label="Satır ${ix+1} serbest yer" placeholder="Yer (serbest)" value="${esc(s.location_text)}">
      <input class="inp inp-sm" data-f="cost" type="number" min="0" step="0.01" aria-label="Satır ${ix+1} maliyet" placeholder="Maliyet ₺" value="${esc(s.cost)}">
      <button type="button" class="ek-x" aria-label="Satır ${ix+1} çıkar" onclick="opbSatirSil('${s.k}')">✕</button>
      ${s._hata?`<div class="opb-e" role="alert">${esc(s._hata)}</div>`:''}
    </div>`).join('')
    :'<p class="tc-bos">Satır yok. Pozisyon seçip “Satır üret” ya da “Satır ekle”.</p>';
  opbOzet();
}
function opbOzet(){
  opbOku();
  const n=ui._opb.satir.length, say={};
  ui._opb.satir.forEach(s=>{ say[s.operation_type]=(say[s.operation_type]||0)+1; });
  const e=document.getElementById('opbSay'); if(e) e.textContent=String(n);
  const o=document.getElementById('opbOzet');
  if(o) o.textContent=n?`${n} kayıt oluşacak: `+OPB_TUR.concat([['diger','Diğer']]).filter(t=>say[t[0]]).map(t=>`${t[1]} ×${say[t[0]]}`).join(', '):'';
}
/* Istemci dogrulamasi sunucudakiyle ayni kurallari satir numarasiyla
   gosterir; sunucu yine son soz sahibidir (RPC ayni kontrolleri yapar). */
function opbDogrula(){
  let ilk=null;
  ui._opb.satir.forEach((s,ix)=>{
    let h=null; const q=s.quantity===''?null:+s.quantity, c=s.cost===''?null:+s.cost;
    if(!s.unit_id&&!String(s.description).trim()&&!String(s.location_text).trim()) h='Pozisyon, yer ya da açıklama girilmeli.';
    else if(q!=null&&!(q>0)) h='Adet sıfırdan büyük olmalı.';
    else if(c!=null&&!(c>=0)) h='Maliyet negatif olamaz.';
    s._hata=h; if(h&&!ilk) ilk=`Satır ${ix+1}: ${h}`;
  });
  return ilk;
}
async function opbKaydet(){
  opbOku();
  const jid=+gv('opbJob');
  if(!jid){ mpAlert('İş seçimi zorunlu.','Baskı / Montaj'); return; }
  if(!ui._opb.satir.length){ mpAlert('En az bir satır ekleyin.','Baskı / Montaj'); return; }
  const hata=opbDogrula(); opbSatirCiz();
  if(hata){ mpAlert(hata+' Hiçbir kayıt oluşturulmadı.','Baskı / Montaj');
    const r=document.querySelector('#opbRows .opb-r.hata'); if(r) r.scrollIntoView({block:'center'}); return; }
  if(ekTurEksik('opb')){ mpAlert('Eklenen her dosya için belge türünü seçin.','Dosya'); return; }
  const num=v=>v===''||v==null?null:+v;
  const ort={supplier_org_id:+gv('opbSup')||null, planned_date:gv('opbDate')||null,
             status:gv('opbSt')||'planned', note:(gv('opbNote')||'').trim()||null,
             material:(gv('opbMat')||'').trim()||null, currency:gv('opbPb')||'TRY'};
  const rows=ui._opb.satir.map(s=>({...ort, operation_type:s.operation_type, unit_id:+s.unit_id||null,
    description:String(s.description).trim()||null, quantity:num(s.quantity), quantity_unit:s.quantity_unit||'adet',
    dimensions:String(s.dimensions).trim()||null, location_text:String(s.location_text).trim()||null,
    cost:num(s.cost)}));
  let paket=null;
  if((document.getElementById('opbPkOn')||{}).checked){
    paket={label:(gv('opbPkAd')||'').trim(),cost_amount:num(gv('opbPkM')),sale_amount:num(gv('opbPkS')),currency:ort.currency};
    if(!paket.label){ mpAlert('Paket bedeli için kısa bir ad girin. Hiçbir kayıt oluşturulmadı.','Paket bedeli'); return; }
    if(paket.cost_amount==null&&paket.sale_amount==null){ mpAlert('Paket için maliyet ya da satış tutarı girin. Hiçbir kayıt oluşturulmadı.','Paket bedeli'); return; }
  }
  modalBusy(true,'Kaydediliyor…');
  /* Once dosyalar (varsa) depolamaya; sonra TEK islem: satirlar + baglantilar. */
  if(!await ekYukle('opb')){ modalBusy(false); mpAlert('Bazı dosyalar yüklenemedi. Hiçbir kayıt oluşturulmadı; tekrar deneyin.','Dosya'); return; }
  const docs=ekGovde('opb',[]);
  /* S14: tekillik anahtarıyla. Kesin red → işlem geri alındı, yüklemeler
     temizlenir. Belirsiz → dosyalar ve yolları korunur; tekrar güvenli. */
  const s=await islemCalistir('opb','operations_batch_create','Baskı/Montaj: '+rows.length+' satır',
    k=>api('operations_batch',{job_id:jid,rows,docs,package:paket,islem:k}),'Baskı / Montaj');
  if(s.durum==='hata'&&!s.onceKayitli){ await ekGeriAl('opb','Kaydedilemedi.'); modalBusy(false); return; }
  if(s.durum!=='tamam'){ ekBekleyen('opb').forEach(i=>{ if(i.yol) i.belirsiz=true; }); modalBusy(false); return; }
  const r=s.sonuc;
  ekBekleyen('opb').forEach(i=>{ i.kaydedildi=true; });
  modalBusy(false); closeModal();
  const ids=(r&&r.ids)||[];
  toast(ids.length>1?ids.length+' kayıt eklendi.':'Kayıt eklendi.');
  if(ui.section==='operasyon'&&!(history.state&&history.state.v==='work')) renderSection();
  else workAc(jid,{bolum:'op',opId:ids[0]||null});
}

/* Modal icinden ise/guncellemeye gecis. Ikisi de kaydedilmemis form
   icerigini birakip gider; bu yuzden yalniz KAYITLI bir operasyonda
   gosterilir (opForm'da id&&jid kosulu). */
function opIse(jid){ closeModal(); workAc(jid); }
function opGuncelle(jid){ closeModal(); qcAc({jobId:jid}); }
async function opDel(id){
  if(!await mpConfirm('Bu baskı/montaj kaydı silinsin mi? Ekli dosyalar Hafıza > Belgeler\'de kalır.','Kaydı Sil'))return;
  const jid=(ui._ops||ui._workOps||[]).find(x=>x.id===id)?.job_id||(ui._work||{}).id;
  const r=await guard(()=>api('operation_delete&id='+id),'Silinemedi'); if(r===null)return;
  closeModal(); toast('Silindi.');
  if(ui.section==='operasyon') renderSection(); else workAc(jid);
}

/* ---------- Excel export / import (07 §16, BR-X02) ---------- */
const OP_COLS=[
  {key:'planned_date',label:'Tarih',w:12},
  {key:'is',label:'İş',w:28,get:o=>((ui._opJobs||{})[o.job_id]||{}).title||''},
  {key:'kurum',label:'Kurum',w:26,get:o=>(ui._opCust||{})[(((ui._opJobs||{})[o.job_id])||{}).customer_id]||''},
  {key:'operation_type',label:'Tür',w:10,get:o=>opTypeLbl(o.operation_type)},
  {key:'description',label:'Açıklama',w:32},
  {key:'quantity',label:'Miktar',w:8},
  {key:'quantity_unit',label:'Birim',w:8,get:o=>OP_BIRIM[o.quantity_unit]||''},
  {key:'dimensions',label:'Ölçü',w:14},
  {key:'yer',label:'Yer / Pozisyon',w:22,get:o=>((ui._opUnits||{})[o.unit_id]||{}).name||o.location_text||''},
  {key:'uygulayan',label:'Uygulayan',w:24,get:o=>(ui._opCust||{})[o.supplier_org_id]||''},
  {key:'status',label:'Durum',w:12,get:o=>opStatLbl(o.status)},
  {key:'cost',label:'Maliyet',w:12},
  {key:'note',label:'Not',w:30}];
async function opExport(){
  const list=ui._opFiltered||ui._ops||[];
  if(!list.length){ mpAlert('Aktarılacak kayıt yok.'); return; }
  const f=opFiltre();
  const [from,to]=f.donem==='ozel'?[f.from,f.to]:opDonem(f.donem);
  const donemAd={bugun:'Bugün',hafta:'Bu hafta',yaklasan:'Yaklaşan 30 gün',ay:'Bu ay',
                 gecen:'Geçen ay',yil:'Bu yıl',ozel:'Özel aralık',tum:'Tüm zamanlar'}[f.donem]||f.donem;
  await exportRows('baski-montaj','Baskı & Montaj',OP_COLS,list,[
    ['İş dönemi', donemAd + (from&&to?` (${trTarih(from)} – ${trTarih(to)})`:'')],
    ['Tür filtresi', f.type?opTypeLbl(f.type):'Tümü'],
    ['Durum filtresi', {aktif:'Aktif (planlandı + bekliyor + devam ediyor)',
      tamam:'Tamamlananlar',iptal:'İptal',tum:'Tüm durumlar'}[f.kapsam]||f.kapsam],
    ['Arama', f.q||'—']]);
}
function opImport(){
  importOpen({
    title:'Baskı & Montaj Kayıtlarını Excel\'den Al',
    hint:'İş başlığı ve tür zorunludur. Eşleşen iş bulunamazsa satır ATLANIR — hiçbir kayıt sessizce üzerine yazılmaz.',
    fields:[
      {key:'is',label:'İş başlığı',required:true,alias:['iş','is','work','proje','müşteri işi']},
      {key:'operation_type',label:'Tür',required:true,alias:['tür','tur','işlem','islem','tip']},
      {key:'planned_date',label:'Tarih',alias:['tarih','planlanan','gün']},
      {key:'description',label:'Açıklama',alias:['açıklama','aciklama','iş tanımı']},
      {key:'quantity',label:'Adet',alias:['adet','miktar']},
      {key:'dimensions',label:'Ölçü',alias:['ölçü','olcu','ebat','boyut']},
      {key:'location_text',label:'Yer',alias:['yer','lokasyon','konum','mecra']},
      {key:'uygulayan',label:'Uygulayan',alias:['uygulayan','tedarikçi','tedarikci','firma']},
      {key:'status',label:'Durum',alias:['durum','statü']},
      {key:'cost',label:'Maliyet',alias:['maliyet','tutar','fiyat']},
      {key:'note',label:'Not',alias:['not','açıklama2']}],
    modes:[['append','Yeni kayıt olarak EKLE (mevcut kayıtlara dokunma)']],
    onApply:async (data)=>{
      const jobs=await api('jobs_list');
      const custs=await api('customers_list');
      const jidx={}; jobs.forEach(j=>jidx[String(j.title||'').toLocaleLowerCase('tr').trim()]=j);
      const cidx={}; custs.forEach(x=>cidx[String(x.firma||'').toLocaleLowerCase('tr').trim()]=x);
      const tmap={}; OPTYPE.forEach(t=>{ tmap[t[0]]=t[0]; tmap[t[1].toLocaleLowerCase('tr')]=t[0]; });
      const smap={}; OPSTAT.forEach(t=>{ smap[t[0]]=t[0]; smap[t[1].toLocaleLowerCase('tr')]=t[0]; });
      let eklendi=0; const atlanan=[];
      for(const r of data){
        const j=jidx[String(r.is||'').toLocaleLowerCase('tr').trim()];
        if(!j){ atlanan.push(`"${r.is}" — eşleşen iş yok`); continue; }
        const tip=tmap[String(r.operation_type||'').toLocaleLowerCase('tr').trim()];
        if(!tip){ atlanan.push(`"${r.is}" — geçersiz tür: ${r.operation_type}`); continue; }
        const sup=cidx[String(r.uygulayan||'').toLocaleLowerCase('tr').trim()];
        let tarih=r.planned_date||null;
        if(tarih instanceof Date) tarih=_iso(tarih);
        else if(tarih) tarih=String(tarih).slice(0,10);
        const qty=(r.quantity!==''&&r.quantity!=null)?+r.quantity:null;
        const cost=(r.cost!==''&&r.cost!=null)?+r.cost:null;
        await api('operation_save',{id:0,job_id:j.id,operation_type:tip,
          status:smap[String(r.status||'').toLocaleLowerCase('tr').trim()]||'planned',
          description:r.description||null,quantity:isNaN(qty)?null:qty,dimensions:r.dimensions||null,
          supplier_org_id:sup?sup.id:null,location_text:r.location_text||null,
          planned_date:tarih,cost:isNaN(cost)?null:cost,note:r.note||null,evidence_urls:[]});
        eklendi++;
      }
      let rap=`Tamamlandı.\n${eklendi} kayıt eklendi.`;
      if(atlanan.length) rap+=`\n\n⚠ ${atlanan.length} satır ATLANDI (hiçbiri üzerine yazılmadı):\n· `+atlanan.slice(0,12).join('\n· ')+(atlanan.length>12?`\n· … +${atlanan.length-12} satır`:'');
      return rap;
    }});
}

/* ================= TEAM WORKSPACE (Sprint 06) =================
   Tek shell, iki surface (D-232 / 07 §2). Ayrı bir frontend yoktur;
   `team_member` sade Workspace navigasyonunu görür, `admin` mevcut
   Yönetim Paneli'ni korur ve iki yüzey arasında geçebilir.

   Surface tercihi localStorage'da tutulur ve YALNIZ görünümü belirler —
   yetkilendirme kaynağı değildir (07 §2.3, 08 §9). Gerçek koruma RLS'tedir.
   ============================================================== */
const WS_NAV=[
  ['workspace-home','Panelim','dashboard'],
  ['is-takibi','İşler','jobs'],
  ['kurumlar','Hafıza','customers'],
  ['ws-mecralar','Mecralar','media'],
  ['raporlar','Raporlar','report']];
/* Workspace'ten ulaşılabilen ek rotalar: ana navigasyona yeni birincil
   kavram eklemeden Baskı & Montaj tablosuna (07 §13) ve kendi profiline
   (header'daki kullanıcı chip'i üzerinden, 07 §16) geçiş. `ekip` zaten
   admin olmayan görüntüleyiciyi kendi profiline yönlendiriyor — bkz.
   ekip() içindeki yoneticiMi() kontrolü; burada yalnız rota izni açılır,
   ayrı bir profil renderer'ı eklenmez (parity audit S1 §7/§14). */
const WS_EXTRA=['operasyon','muhasebe','ekip'];
const WS_IZIN=new Set(WS_NAV.map(n=>n[0]).concat(WS_EXTRA));

/* Yıkıcı ve Admin-domain aksiyonları RLS'te admin'e kapalıdır (S07).
   UI'da da gizlenir ki team_member reddedilecek bir düğme görmesin —
   gizleme yetkilendirme değildir, yalnız tutarlı bir arayüzdür. */
const isAdmin=()=>ui._role==='admin';
function surfaceGet(){
  if(ui._role!=='admin') return 'workspace';
  try{ return localStorage.getItem('mp_surface')==='workspace'?'workspace':'yonetim'; }
  catch(e){ return 'yonetim'; }
}
function surfaceSet(v){
  try{ localStorage.setItem('mp_surface',v); }catch(e){}
  const sub=document.querySelector('.brand-sub');
  if(sub) sub.textContent=(v==='workspace'?'Team Workspace':'Yönetim Paneli');
  navCiz();
  go(v==='workspace'?'workspace-home':'dashboard');
}
function surfaceSwitchHtml(){
  if(ui._role!=='admin') return '';           /* team_member'a switch gösterilmez */
  const s=surfaceGet();
  return `<div class="ws-switch" role="group" aria-label="Yüzey seçimi">
    <button type="button" class="${s==='workspace'?'on':''}" aria-pressed="${s==='workspace'}"
      onclick="surfaceSet('workspace')">Workspace</button>
    <button type="button" class="${s==='yonetim'?'on':''}" aria-pressed="${s==='yonetim'}"
      onclick="surfaceSet('yonetim')">Yönetim</button></div>`;
}

/* ---------- PANELIM (PS1.1 §3-§7, §12-§13, §17) -----------------------
   Sprint 1 sirket panosunu kaldirdi ama ekran hala "dashboard + aktivite
   listesi + gorev kenar cubugu" gibi duruyordu: tepede dort buyuk KPI
   karti, genis bir feed ve dar bir kenar sutunu.

   PS1.1 hedefi: gunluk Medyapark calisma alani.
     · Buyuk KPI kartlari YOK (§3). Yerine yalnizca gercekten yardim eden
       yerde kompakt sayac chip'i.
     · Dengeli iki sutun (§4): Guncellemeler | gunluk sutun.
     · Feed kompakt ve KRONOLOJIK (§6) - varsayilan siralama kisisel
       ilgiye gore DEGIL, olusturma zamanina gore.
     · Her satirda olusturma tarih/saati acikca gorunur (§2.A).
     · Son tarih AYRI gosterilir; hicbir zaman olusturma tarihiyle
       karistirilmaz.

   Sirket panosu bilesenleri (dash*Card) burada CAGRILMAZ; Admin
   Dashboard onlari aynen kullanmaya devam eder. */
/* S4.3.1 — BUG DUZELTMESI. Eskiden `d.toISOString().slice(0,10)` idi, yani
   UTC takvim gunu. Turkiye UTC+3 oldugu icin her gece 00:00-03:00 arasi
   Panelim "bugun"u DUN olarak hesapliyordu: bugun terminli `15:30 Dişçi`
   Ajandam Listesinde "Yarın" altinda gorunuyor, ayni anda Ajandam
   Takviminde (yerel `_cIso` kullanan) dogru gunde duruyordu - ayni veri
   kumesinin iki gorunumu "bugun" konusunda anlasamiyordu. QA 01:14'te
   calistigi icin ortaya cikti. Tum cagiranlar (bugun, yarin, 14 gunluk
   ufuk, ISO hafta araligi) YEREL takvim gunu istiyor. */
const _wsIso=d=>_cIso(d);
const PS_AY=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
/* Olusturma zamani: "14 Eyl · 11:50". Belirsizlik birakmaz, hover
   gerektirmez (§6). */
function psZaman(t){
  if(!t) return '';
  const d=new Date(t);
  /* S13: bu yılın dışındaki tarih yılıyla yazılır ("5 Mar" hangi yıl?). */
  return `${d.getDate()} ${PS_AY[d.getMonth()]}${d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():''} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
/* §8: uzun resmi unvanlar akışı ezmesin. Bu YALNIZCA GÖRÜNTÜLEME içindir —
   kimlik verisine dokunmaz, hiçbir yere geri yazılmaz, tam unvan `title`
   ile erişilebilir kalır. `customers` tablosunda kısa/ticari ad kolonu YOK
   (bakıldı), o yüzden yaygın tüzel kişilik eklerinden kısaltılır. */
const ORG_EK=/\s+(a\.?\s?ş|ltd\.?\s?şti|limited şirketi|anonim şirketi|san\.?\s?ve\s?tic|sanayi ve ticaret|tic\.?\s?ltd|ve tic|tic\.?|san\.?|sanayi|ticaret|organizasyon|pazarlama|reklamcılık|hizmetleri|grup|day\.?tük\.?mal\.?)[\s.]*/i;
function orgKisa(ad,max){
  const tam=String(ad||'').trim(); if(!tam) return '';
  max=max||32;
  let k=tam;
  const m=k.search(ORG_EK);
  if(m>2) k=k.slice(0,m).trim().replace(/[.,·-]+$/,'');
  if(k.length<3) k=tam;
  if(k.length>max) k=k.slice(0,max-1).trim()+'…';
  return k;
}
/* "3 gün gecikti" / "Son tarih: 18 Eyl" (§5). */
/* S4.2 §5 — "uzun kurum adlari baglam alanini ele gecirmesin".
   Medyapark is basliklari cogunlukla `Kurum · Kampanya` bicimindedir
   (`ADN Lezzet · Ürün lansmanı`), yaninda bir de `ADN LEZZET GIDA`
   chip'i koymak ayni bilgiyi iki kez yazip Is basliginin %30'unu
   kirptiriyordu. Baslik kurumu ZATEN tasiyorsa kurum chip'i dusulur.
   Muhafazakar kural: kurumun ilk anlamli kelimesi (>=4 harf) is
   basliginin BASINDA geciyorsa. Kurum baglami kaybolmaz - is
   basliginda okunur ve kurum detayina Work uzerinden ulasilir. */
function orgBaslikTekrari(baslik,org){
  if(!baslik||!org) return false;
  const nrm=v=>String(v).toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
  /* Onek, >=4 harfe ulasana kadar kelime ekler (en fazla 2 kelime):
     "ADN LEZZET GIDA" -> "adn lezzet" (tek basina "adn" cok kisa ve
     yanlis eslesme riski tasir), "ACIBADEM SAGLIK..." -> "acibadem". */
  const kel=nrm(org).split(' ').filter(Boolean);
  if(!kel.length) return false;
  let onek=kel[0];
  if(onek.length<4 && kel[1]) onek+=' '+kel[1];
  if(onek.replace(/\s/g,'').length<4) return false;
  return nrm(baslik).startsWith(onek);
}
function psGecikme(due){
  const d=new Date(String(due).slice(0,10)+'T00:00:00');
  const b=new Date(); b.setHours(0,0,0,0);
  return Math.round((b-d)/86400000);
}
/* Son tarih: yalnizca gun. "18 Eyl". */
function psGun(t){
  if(!t) return '';
  const d=new Date(t);
  return `${d.getDate()} ${PS_AY[d.getMonth()]}${d.getFullYear()!==new Date().getFullYear()?' '+d.getFullYear():''}`;
}
function wsHafta(){
  const n=new Date(), g=n.getDay();
  const pzt=new Date(n); pzt.setDate(n.getDate()-((g+6)%7));
  const paz=new Date(pzt); paz.setDate(pzt.getDate()+6);
  return [_wsIso(pzt),_wsIso(paz)];
}

/* ---- Panelim gorunum durumu ---- */
/* Akis artik sayfa sayfa (S4.1 §4). Onceki model `n`'i 30'ar artiran
   "Daha fazla goster" idi; Panelim sinirsiz uzuyordu. */
const PS_SAYFA=20;
const PS_DEF={p:1,job:'',org:'',kisi:'',acil:false,gec:false,benim:false};
function psDurum(){
  let d; try{ d=JSON.parse(sessionStorage.getItem('mp_panelim')||'null'); }catch(e){ d=null; }
  d={...PS_DEF,...(d||{})};
  delete d.n;                          /* eski surumden kalan alan */
  d.p=Math.max(1,+d.p||1);
  return d;
}
function psYaz(d){ try{ sessionStorage.setItem('mp_panelim',JSON.stringify(d)); }catch(e){} }
/* Filtre degisimi HER ZAMAN 1. sayfaya doner: 3. sayfadayken filtre
   daraltilinca bos ekrana bakmak "sonuc yok" gibi okunurdu (§27). */
function psFiltre(patch){ psYaz({...psDurum(),...patch,p:1}); renderSection(); }
function psTemizle(){ psYaz({...PS_DEF}); renderSection(); }
function psSayfa(p){ psYaz({...psDurum(),p:Math.max(1,p)}); renderSection();
  const b=document.querySelector('.pnl-a .card'); if(b) b.scrollIntoView({block:'start'}); }
function psAc(el){ if(el)el.classList.toggle('acik'); }
function psFiltreDegis(){
  psFiltre({ job:gv('psJob')||'', org:gv('psOrg')||'', kisi:gv('psKisi')||'' });
}

/* ============ HAREKETLER (S4.4) ======================================
   Insan yazimi Güncellemeler'den AYRI, makine uretimi durum degisiklikleri.
   Salt-okunur. Okundu/okunmadi, rozet sayaci, abonelik YOK (§18) - bu bir
   onaylanmasi gereken gelen kutusu degil, farkindalik akisi. */
const HR_DEF={gor:'guncelleme',p:1,tur:''};
function hrDurum(){
  let d; try{ d=JSON.parse(sessionStorage.getItem('mp_hareket')||'null'); }catch(e){ d=null; }
  d={...HR_DEF,...(d||{})};
  d.p=Math.max(1,+d.p||1);
  if(!['',...Object.keys(HR_GRUP)].includes(d.tur)) d.tur='';
  return d;
}
function hrYaz(d){ try{ sessionStorage.setItem('mp_hareket',JSON.stringify(d)); }catch(e){} }
function hrGor(g){ hrYaz({...hrDurum(),gor:g}); renderSection(); }
function hrTur(t){ hrYaz({...hrDurum(),tur:t,p:1}); renderSection(); }   /* filtre -> 1. sayfa */
function hrSayfa(p){ hrYaz({...hrDurum(),p:Math.max(1,p)}); renderSection();
  const b=document.querySelector('.pnl-a .card'); if(b) b.scrollIntoView({block:'start'}); }
/* S7.1 §35-§37 — sistem hareketi taksonomisi. Her `system_kind` TAM OLARAK
   bir kategoriye duser (Tümü hepsini gosterir). Tablo basina sekme YOK;
   yapisal sozlesme olaylari ayri bir "Ticari" sekmesi acmaz - is akisi
   belge-oncelikli oldugu icin Belgeler altinda. Legacy NULL tur yalniz Tümü. */
const HR_GRUP={
  isler:['work_created','work_renamed','work_phase','work_lifecycle','quote_revised','quote_approved'],
  operasyon:['operation_created','operation_status','price_group_changed'],
  muhasebe:['work_accounting'],
  belgeler:['document_added','document_linked','document_unlinked','document_changed',
            'contract_created','contract_signed','contract_cancelled','work_contract'],
  /* S8: gercek, guvenilir medya olaylari (yerlesim/kampanya olusturma,
     anlamli donem/durum degisikligi, iptal). Hedef yapisal:
     entries.media_placement_id. */
  mecralar:['media_created','media_changed','media_cancelled']};
const HR_TUR=[['','Tümü'],['isler','İşler'],['operasyon','Operasyon'],['muhasebe','Muhasebe'],['belgeler','Belgeler'],['mecralar','Mecralar']];
/* Olay -> Work Detail'de acilacak baglam. Yalniz YAPISAL alanlar okunur. */
function hareketHedef(h){
  const k=h.system_kind||'';
  if(k.startsWith('media_')) return {bolum:'medya',placementId:h.media_placement_id||null};
  if(k==='operation_created'||k==='operation_status') return {bolum:'op',opId:h.work_operation_id||null};
  if(k==='price_group_changed') return {bolum:'op'};
  if(k==='work_accounting') return {bolum:'muhasebe'};
  if(k.startsWith('document_')) return {bolum:'belge',docId:h.document_id||null};
  if(k.startsWith('contract_')||k.startsWith('quote_')||k==='work_contract') return {bolum:'ticari'};
  if(k==='work_lifecycle') return {bolum:'durum'};
  return {bolum:'faz'};
}
function hareketAc(id){
  const h=(ui._hrSatir||{})[id]; if(!h) return;
  /* S8: medya olayi Mecralar'da ILGILI kayda gider (yapisal hedef). Geri
     tusu ayni Hareketler filtre/sayfasina doner (sessionStorage). */
  if(String(h.system_kind||'').startsWith('media_')&&h.media_placement_id){ medyaOdak(h.media_placement_id); return; }
  /* S10 §7: belge hareketi BELGEYE gider (ilişkisiz belge dahil); iş ve
     kurum çipleri kendi hedeflerine gider. */
  if(String(h.system_kind||'').startsWith('document_')&&h.document_id){ belgeDetay(h.document_id); return; }
  if(!h.job_id) return;
  workAc(h.job_id,{...hareketHedef(h),entryId:h.id});
}
const HR_ROZET={work_created:'Yeni iş',work_renamed:'İş adı',work_phase:'Aşama',work_lifecycle:'Durum',work_contract:'Sözleşme',
  work_accounting:'Muhasebe',operation_created:'Operasyon',operation_status:'Operasyon',price_group_changed:'Paket',
  quote_revised:'Teklif',quote_approved:'Teklif',document_added:'Belge',
  document_linked:'Belge',document_unlinked:'Belge',document_changed:'Belge',
  contract_created:'Sözleşme',contract_signed:'Sözleşme',contract_cancelled:'Sözleşme',
  media_created:'Mecra',media_changed:'Mecra',media_cancelled:'Mecra'};

function hareketGovde(veri,hg,jm,cm,tm){
  const filtre=`<div class="pf hr-f">
    <div class="ws-switch inline" role="group" aria-label="Hareket türü">
      ${HR_TUR.map(([k,l])=>`<button type="button" class="${hg.tur===k?'on':''}" aria-pressed="${hg.tur===k}" onclick="hrTur('${k}')">${esc(l)}</button>`).join('')}
    </div>
    <span class="fhint" style="margin:0 0 0 auto">Sistemin kaydettiği durum değişiklikleri — elle yazılmaz.</span>
  </div>`;
  if(!veri||veri.hata) return filtre+`<div class="card-b"><p class="empty">Hareketler okunamadı${veri&&veri.hata?': '+esc(veri.hata):''}.</p></div>`;
  const {satirlar,toplam,adet}=veri;
  const sayfaAdet=Math.max(1,Math.ceil(toplam/adet));
  const sayfa=Math.min(hg.p,sayfaAdet);
  const bas=(sayfa-1)*adet;
  /* §14: aktor GERCEK kimliktir - tetikleyici `current_team_id()` ile JWT'den
     damgalar. Oturumsuz (otomatik/tohum) kayitlarda insan UYDURULMAZ. */
  const satir=h=>{
    const j=h.jobs||(h.job_id?jm[h.job_id]:null);
    /* Isi olmayan (kurum duzeyi) medya olayinda kurum entries.customer_id'den. */
    const orgId=j?j.customer_id:(h.customer_id||null);
    const org=orgId?(cm[orgId]||''):'';
    const orgGoster=org&&!(j&&orgBaslikTekrari(j.title,org));
    const aktor=h.created_by_team_id&&tm[h.created_by_team_id]?tm[h.created_by_team_id]:null;
    /* S7.1 §39: satir bir baglanti - olayin anlasilacagi yere gider. Ic
       chip'ler kendi hedefine gider ve satir tiklamasini tetiklemez. */
    const git=!!h.job_id||!!(h.media_placement_id&&String(h.system_kind||'').startsWith('media_'))
      ||!!(h.document_id&&String(h.system_kind||'').startsWith('document_'));
    const hedefAd={op:'operasyonu',belge:'belgeyi',muhasebe:'muhasebe bilgisini',ticari:'ticari bölümü',durum:'işin durumunu',faz:'işi',medya:'mecra kaydını'}[hareketHedef(h).bolum];
    return `<article class="pu hr ${git?'hr-git':''}" ${git?`role="link" tabindex="0" title="${esc(hedefAd?'İlgili '+hedefAd+' aç':'Aç')}"
        onclick="hareketAc(${h.id})" onkeydown="if(event.key==='Enter')hareketAc(${h.id})"`:''}>
      <div class="pu-h">
        <div class="pu-hl">
          <b class="${aktor?'':'hr-oto'}">${aktor?esc(aktor):'Sistem'}</b>
          <time datetime="${esc(String(h.occurred_at||''))}">${esc(psZaman(h.occurred_at))}</time>
          <span class="hr-k">${esc(HR_ROZET[h.system_kind]||'Hareket')}</span>
        </div>
        ${(j||orgGoster)?`<div class="pu-hr">
          ${j&&h.job_id?`<button type="button" class="pu-chip is" onclick="event.stopPropagation();workAc(${h.job_id})" title="${esc(j.title)}">${esc(orgKisa(j.title,40))}</button>`:''}
          ${orgGoster?`<button type="button" class="pu-chip org" onclick="event.stopPropagation();orgAc(${orgId})" title="${esc(org)}">${esc(orgKisa(org,26))}</button>`:''}
        </div>`:''}
      </div>
      <p class="hr-t">${esc(h.body)}${git?'<span class="hr-git-o" aria-hidden="true"> ›</span>':''}</p>
    </article>`;
  };
  ui._hrSatir={}; satirlar.forEach(h=>ui._hrSatir[h.id]=h);
  /* Saklanan sayfa, veri azaldigi icin artik yoksa bos ekran "hareket yok"
     gibi okunmasin: 1. sayfaya donus sunulur. */
  const liste=satirlar.length?satirlar.map(satir).join('')
    : toplam?`<p class="empty">Bu sayfa artık boş. <button type="button" class="btn-link" onclick="hrSayfa(1)">İlk sayfaya dön</button></p>`
    :`<p class="empty">${hg.tur?'Bu türde hareket yok.':'Henüz sistem hareketi yok.'}</p>`;
  return filtre+`<div class="card-b pu-list">${liste}</div>
    ${toplam?`<div class="pgr">
      <button class="btn btn-outline btn-sm" ${sayfa<=1?'disabled':''} onclick="hrSayfa(${sayfa-1})" aria-label="Önceki sayfa">‹ Önceki</button>
      <span class="pgr-n" aria-live="polite"><b>${sayfa}</b> / ${sayfaAdet}
        <em>${bas+1}–${bas+satirlar.length} · ${toplam} hareket</em></span>
      <button class="btn btn-outline btn-sm" ${sayfa>=sayfaAdet?'disabled':''} onclick="hrSayfa(${sayfa+1})" aria-label="Sonraki sayfa">Sonraki ›</button>
    </div>`:''}`;
}

/* Kisisel ilgi: feed SIRASINI degistirmez (§6), yalnizca vurgular. */
function psBenimMi(e,benim,ilgiSet,takipJobs){
  if(!benim) return false;
  return ilgiSet.has(e.id) || e.assignee_id===benim
      || (e.job_id&&takipJobs.has(e.job_id));
}

async function workspaceHome(c){
  /* S4.3.1: Ajandam Takvim gorunumu Panelim'in bir DURUMU. Yeni bir yan
     menu modulu ya da ayri bir takvim uygulamasi degil. */
  if(ui._ajGor==='takvim') return ajandaTakvim(c);
  const [h1,h2]=wsHafta();
  const st=psDurum();
  const benim=(ui._me&&ui._me.id)||0;
  const bugun=_wsIso(new Date());
  const ufuk=new Date(); ufuk.setDate(ufuk.getDate()+14); const ufukIso=_wsIso(ufuk);
  const opBas=h1<bugun?h1:bugun;

  /* Tek turda paralel cekim; kart/gun/Work basina sorgu YOK (07 §20).
     entry_relevance TUM satirlariyla cekilir cunku feed etiketlenen
     kisileri chip olarak gosterir (§5) - Entry basina sorgu N+1 olurdu. */
  /* S4.4 §12/§22: Güncellemeler | Hareketler gorunum durumu. Diger Panelim
     filtreleri gibi sessionStorage'da (S4.1 konvansiyonu). Hareketler
     yalnizca o gorunum acikken okunur. */
  const hg=hrDurum();
  const hareketP=hg.gor==='hareket'
    ? api(`hareketler_list&sayfa=${hg.p}&tur=${hg.tur}`).catch(e=>({hata:e.message||String(e)}))
    : Promise.resolve(null);
  const [jobs,ents,ops,custs,team,ilgi,takip,kisiler,kisisel,acikTerminli]=await Promise.all([
    api('jobs_list'),
    api('entries_list&limit=400&insan=1&belge=1'),
    api(`operations_list&from=${opBas}&to=${ufukIso}`),
    api('customers_list'),
    api('team_list'),
    api('entry_relevance_all').catch(()=>[]),
    benim?api('work_followers_all&team_id='+benim).catch(()=>[]):Promise.resolve([]),
    /* Kişi chip'i için (§5 bağlam satırı). Tek toplu okuma; Entry başına
       sorgu YOK. Soğuk açılışta ui._contactMap boş olurdu ve kişi bağlamı
       sessizce kaybolurdu. */
    api('contacts_list').catch(()=>[]),
    /* S4.3: kisisel etkinlikler. RLS zaten sahiplikle sinirlar. */
    api(`personal_events_list&from=${opBas}&to=${ufukIso}`).catch(()=>[]),
    /* S6 §47: Dikkat Gerekenler'in geciken kaynagi. Son 400 guncelleme
       penceresinden DEGIL, terminli acik aksiyonlardan okunur. */
    api(`entries_list&action_status=open&due_to=${bugun}&limit=1000`).catch(()=>[])]);
  ui._team=team||[]; ui._jobs=jobs||[]; ui._cust=custs||[];
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  const cm={}; (custs||[]).forEach(x=>cm[x.id]=x.firma);
  const tm={}; (team||[]).forEach(t=>tm[t.id]=t.name);
  ui._opJobs=jm; ui._opCust=cm;
  ui._kisisel=kisisel||[];                   /* keForm duzenlemede buradan okur */

  /* entry_id -> [team_id] ve benim etiketlerim */
  ui._contactMap={}; (kisiler||[]).forEach(k=>ui._contactMap[k.id]=k);
  const ilgiMap={}; (ilgi||[]).forEach(r=>{ (ilgiMap[r.entry_id]=ilgiMap[r.entry_id]||[]).push(r.team_id); });
  const ilgiSet=new Set((ilgi||[]).filter(r=>r.team_id===benim).map(r=>r.entry_id));
  ui._ilgiMap=ilgiMap;
  const takipJobs=new Set((takip||[]).map(r=>r.job_id));
  ui._takipJobs=takipJobs;
  const orgAdi=j=>cm[(j||{}).customer_id]||'';
  const gecmis=d=>!!d&&String(d).slice(0,10)<bugun;

  /* ---- KRONOLOJIK feed (§6) ---- */
  /* Sunucu ayni sirayi verir; burada da AYNI toplam siralama kullanilir
     ki istemci tarafi suzme sayfa sinirinda kaymasin (§27). */
  const tumEnt=(ents||[]).slice()
    .sort((a,b)=>String(b.occurred_at||'').localeCompare(String(a.occurred_at||''))
                 || (b.id-a.id));
  ui._feedEnt=tumEnt;                        /* satir menusu buradan okur */
  tumEnt.forEach(e=>{ e._benim=psBenimMi(e,benim,ilgiSet,takipJobs); });

  /* ---- Filtreler (§7) - hizli, calisan kontroller ---- */
  let suz=tumEnt;
  if(st.job)   suz=suz.filter(e=>String(e.job_id)===String(st.job));
  if(st.org)   suz=suz.filter(e=>{ const j=jm[e.job_id];
                 return String(j?j.customer_id:e.customer_id)===String(st.org); });
  if(st.kisi)  suz=suz.filter(e=>(ilgiMap[e.id]||[]).some(t=>String(t)===String(st.kisi)));
  /* PS9 gorsel kabul §7 — KULLANICI KARARI DEGISTI.
     Onceki surum iki filtre ARASINDA da VEYA kullaniyordu; yeni karar
     KESISIM:

       Acil/Geciken   = acil VEYA gecikmis          (grup ICINDE VEYA)
       Benimle ilgili = etiketlendiklerim VEYA takip ettigim isler
       Ikisi de acik  = (benimle ilgili) VE (acil/geciken)
       Yalniz biri    = yalniz o grubun kosulu
       Ikisi de kapali= secili kapsamin tum kayitlari

     Is / kurum / kisi / arama daraltici olmaya devam eder ve yukarida
     zaten uygulandi. Yetki sinirlari her durumda RLS'tedir. */
  const dikkatSecili=!!(st.acil||st.gec);
  const dikkatMi=e=>(st.acil&&!!e.is_urgent)
    /* Tamamlanmis kayit sirf termini gectigi icin gecikmis SAYILMAZ. */
    ||(st.gec&&e.action_status==='open'&&gecmis(e.due_at));
  if(dikkatSecili) suz=suz.filter(dikkatMi);
  if(st.benim)     suz=suz.filter(e=>e._benim);
  const filtreAktif=!!(st.job||st.org||st.kisi||st.acil||st.gec||st.benim);
  /* Suzme SAYFALAMADAN ONCE biter (§4): sayfa sayisi filtrelenmis
     kumeden hesaplanir, ham kumeden degil. */
  const sayfaAdet=Math.max(1,Math.ceil(suz.length/PS_SAYFA));
  const sayfa=Math.min(st.p,sayfaAdet);          /* filtre daralinca tasma duzelt */
  const bas=(sayfa-1)*PS_SAYFA;
  const gosterilen=suz.slice(bas,bas+PS_SAYFA);

  /* ---- Feed satiri: kompakt, metin odakli (§5) ---- */
  /* §4/§5 — satır şu sırayla cevap verir:
       1 kim yazdı · 2 ne zaman · 3 ne oldu · 4 neye bağlı · 5 aciliyet/termin
     Başlık satırı kim+ne zaman (+Acil, +kişisel ilgi), sonra EN GÜÇLÜ öğe
     olan metin, sonra bağlam chip'leri, en sonda AYRI bir son tarih satırı.
     Son tarih hiçbir zaman oluşturma zamanıyla aynı yerde durmaz (§5/§6). */
  /* ---- Guncelleme satiri (S4.2 §5-§10) -------------------------------
     Bilgi SINIFLARI artik ayri gorsel bolgelerde yasiyor. Once hepsi
     metnin altinda tek bir chip kalabaligiydi; son tarih, kurum,
     etiketlenen kisi ve "sistem" ayni siraya diziliyordu ve hicbiri
     otekinden ayirt edilemiyordu.

       BASLIK  sol: kim + ne zaman (+ACIL)   sag: Is · Kurum · Kisi
       GOVDE   guncelleme metni - satirin en guclu ogesi
       ALT     sol: SON TARIH                sag: etiketlenen kisiler

     Entry semantigi ve depolama DEGISMEDI (§5). */
  const feedSatir=e=>{
    const j=jm[e.job_id]||null;
    const orgId=j?j.customer_id:e.customer_id;
    const org=cm[orgId]||'';
    const kisi=(ui._contactMap&&ui._contactMap[e.contact_id])||null;
    const sys=e.source==='system';
    const kim=sys?'Sistem':(tm[e.created_by_team_id]||'—');
    /* S4.3 §3 — TEK zihinsel model: her ilgi iliskisi `@Kisi` olarak
       cizilir. Onceki surum oturum sahibini "Sana özel" diye AYRI bir
       kavramla gosteriyordu; kullanici ayni listede iki farkli dil
       goruyordu. Artik oturum sahibi de `@Adi` olarak cikar, yalnizca
       fark edilsin diye vurgulanir. Bir iliski -> bir gorunur etiket. */
    const etiketler=(ilgiMap[e.id]||[])
      .map(t=>({id:t,ad:tm[t]})).filter(x=>x.ad);
    const acikAks=e.action_status==='open';
    const gecGun=e.due_at?psGecikme(e.due_at):null;
    const gecikti=acikAks&&gecGun>0;
    const orgTekrar=!!(j&&org&&orgBaslikTekrari(j.title,org));
    const orgGoster=org&&!orgTekrar;
    /* §4: satir eylemi YALNIZ kendi yazdigi, insan yazimi bir guncellemede.
       Sistem Entry'si ve baskasinin guncellemesi normal UI'da duzenlenemez;
       ayni kural RLS ile sunucuda da zorlanir (migration A). */
    const yazarim=!sys&&benim&&e.created_by_team_id===benim;
    const baglam=(j||orgGoster||kisi)?`
        ${j?`<button type="button" class="pu-chip is" onclick="workAc(${j.id})" title="${esc(j.title)}">${esc(orgKisa(j.title,40))}</button>`:''}
        ${orgGoster?`<button type="button" class="pu-chip org" onclick="orgAc(${orgId})" title="${esc(org)}">${esc(orgKisa(org,26))}</button>`:''}
        ${kisi?`<button type="button" class="pu-chip" onclick="personAc(${kisi.id})" title="${esc(kisi.name)}">${esc(kisi.name)}</button>`:''}
      `:'';
    /* §7: son tarih KENDI yerinde (alt-sol) ve siradan bir etiket gibi
       gorunmuyor. §9: ACIL bagimsiz bir kavram, basliktadir. */
    const sonTarih=e.due_at?`<span class="pu-son ${gecikti?'gec':''}">${gecikti
        ? `⚠ ${gecGun} gün gecikti <i>· Son tarih ${esc(psGun(e.due_at))}</i>`
        : `Son tarih: <b>${esc(psGun(e.due_at))}</b>`}</span>`:'';
    const ikincil=[
      ...etiketler.map(x=>`<span class="pu-who ${x.id===benim?'ben':''}">@${esc(x.ad)}</span>`),
      sys?'<span class="pu-sys">sistem</span>':''
    ].filter(Boolean).join('');
    /* §26: `mine` sinifi satira kirmizi bir sol cizgi ciziyordu ve UC
       farkli seyden biri anlamina geliyordu - etiketlendin VEYA sana
       atanmis VEYA isi takip ediyorsun. Ucu de baska yerde acikca
       temsil ediliyor: etiket artik vurgulu `@Adin`, takip/atama ise
       `Benimle ilgili` filtresi. Aciklanamayan dekoratif bir durum
       sinyali birakilmaz. `_benim` HESAPLANMAYA devam ediyor cunku o
       filtre onu kullaniyor. */
    return `<article class="pu ${sys?'sys':''}">
      <div class="pu-h">
        <div class="pu-hl">
          <b>${esc(kim)}</b>
          <time datetime="${esc(String(e.occurred_at||''))}">${esc(psZaman(e.occurred_at))}</time>
          ${e.updated_at?'<span class="pu-duz" title="Bu güncelleme sonradan değiştirildi">düzenlendi</span>':''}
          ${e.is_urgent?'<span class="pu-b acil">ACİL</span>':''}
        </div>
        ${(baglam||yazarim)?`<div class="pu-hr">${baglam}${yazarim
          ? `<button type="button" class="pu-mb" title="Seçenekler" aria-label="Seçenekler"
               onclick="puMenu(event,${e.id})">⋯</button>` : ''}</div>`:''}
      </div>
      ${String(e.body||'').trim()?`<p class="pu-t" onclick="psAc(this)">${esc(e.body)}</p>`:''}
      ${ekSeridi(e.document_links)}
      ${(sonTarih||ikincil)?`<div class="pu-f">
        <div class="pu-fl">${sonTarih}</div>
        <div class="pu-fr">${ikincil}</div>
      </div>`:''}
    </article>`;};

  const feedHtml=gosterilen.length?gosterilen.map(feedSatir).join('')
    :`<p class="empty">${filtreAktif?'Bu filtreye uyan güncelleme yok.':'Henüz güncelleme yok.'}</p>`;

  /* ---- DIKKAT GEREKENLER (§12) ----
     Deterministik: (a) gecmis SON TARIHI olan acik aksiyonlar,
     (b) Acil isaretli guncellemeler, (c) Acil isaretli acik Work'ler.
     YASTAN urgency CIKARILMAZ; eski bir guncelleme sirf eski diye
     dikkat gerektirmez. "Bekleyen" ADI KULLANILMAZ - lifecycle
     `bekliyor` bambaska bir kavramdir (§2.C). */
  /* S6 §47 — kart ve hedefi AYNI Work evreni: Görüntüle İşler/Liste'yi
     `Acil + Geciken` (VEYA) ile acar; bu kart da artik yalniz Work sayar:
       · Acil isaretli aktif Work (jobs.is_urgent), VEYA
       · termini gecmis acik aksiyonu olan aktif Work.
     Yalniz ACIL bir GUNCELLEMESI olan ama kendisi acil olmayan Work
     buraya GIRMEZ (Liste'deki `Acil` filtresi de onu gostermez). Isten
     bagimsiz terminli aksiyonlar Ajandam'da yasar. Guncelleme aciliyeti
     baska hicbir yerde degismedi. Aktif = acik + bekliyor (Liste varsayilani). */
  const gecAks={};
  (acikTerminli||[]).forEach(e=>{ if(!e.job_id||!gecmis(e.due_at)) return;
    const c=gecAks[e.job_id]; if(!c||String(e.due_at)<String(c.due_at)) gecAks[e.job_id]=e; });
  const dikkatIsler=(jobs||[]).filter(j=>(j.lifecycle_status||'acik')!=='kapandi'&&(j.is_urgent||gecAks[j.id]))
    .map(j=>({j,e:gecAks[j.id]||null}))
    .sort((a,b)=>(b.e?psGecikme(b.e.due_at):-1)-(a.e?psGecikme(a.e.due_at):-1)
                 ||(b.j.is_urgent?1:0)-(a.j.is_urgent?1:0)||a.j.id-b.j.id);
  const dikkatN=dikkatIsler.length;

  const dikkatSatir=(ikon,cls,metin,alt,sag,tik)=>
    `<button type="button" class="pd-row" onclick="${tik}">
       <span class="pd-i ${cls}">${ikon}</span>
       <span class="pd-b"><span class="pd-t">${metin}</span><span class="pd-s">${alt}</span></span>
       <span class="pd-r">${sag}</span></button>`;
  const dikkatHtml=dikkatN?[
    /* §12: NEDEN burada olduğu okunur olsun — küçük kırmızı bir ikona
       bakıp çıkarım yapmak zorunda kalınmasın. */
    ...dikkatIsler.slice(0,8).map(({j,e})=>{
      const g=e?psGecikme(e.due_at):0;
      const alt=[orgKisa(orgAdi(j)), e?e.body:(JOBLBL[j.status]||'')].filter(Boolean).join(' · ');
      return dikkatSatir(e?'⚠':'⚡',e?'gec':'acil',esc(j.title),esc(alt),
        `${j.is_urgent?'<span class="pill clay">ACİL İŞ</span>':''}${e?`<span class="pill clay">${g} gün gecikti</span>`:''}`,
        `workAc(${j.id})`); }),
    dikkatN>8?`<button type="button" class="pa-more" onclick="dikkatGoruntule()">+${dikkatN-8} iş daha →</button>`:''
  ].join('') : '<p class="empty">Dikkat gerektiren bir şey yok.</p>';

  /* ---- BUGUN & YAKLASAN (§13) ----
     Kaynaklar zaten onaylanmis yapisal tarihler: Entry son tarihleri ve
     work_operations.planned_date. Work'e sirf burayi doldurmak icin
     termin EKLENMEZ (§14). */
  /* ---- AJANDAM: kisisel ilgi kurallari (S4.3 §19) ------------------
     Sirket takviminin filtresi DEGIL. Bu kart "benim gunum"u gosterir,
     bu yuzden hangi sirket olayinin kisisel oldugu DETERMINISTIK olarak
     tanimlanir. Bir tarihli Entry benim ajandamdadir eger:
       (a) o guncellemede ETIKETLIYSEM        (entry_relevance)
       (b) BANA ATANMISSA                     (legacy assignee_id)
       (c) onu BEN YAZDIYSAM                  (kendi verdigim soz)
       (d) bagli oldugu Work'u TAKIP EDIYORSAM (work_followers)
     Bir operasyon ajandamdadir eger Work'unu takip ediyorsam (d).
     Kisisel etkinlikler her zaman dahildir - zaten yalniz benim.
     Sirketin geri kalani `İşler → Takvim`de kalir (§24). */
  /* Kisisel ilgi kurallari artik TEK yerde: `ajandaOlaylar` (S4.3.1).
     Liste ve Takvim ayni veri kumesinin iki gorunumu; kurallar iki kez
     yazilirsa bir gun ayrisirlar. Liste yalniz kendi sunum kurallarini
     uygular: gecikmis GUNC. bugunun ustunde toplanir, gecmis operasyon
     ve gecmis kisisel etkinlik listede yer tutmaz, ufuk 14 gun. */
  const ajanda={};
  ajandaOlaylar({ents:tumEnt,ops,kisisel,ilgiSet,takipJobs,benim}).forEach(x=>{
    if(x.d>ufukIso) return;
    if(x.t==='takip'){ const k=x.d<bugun?bugun:x.d; (ajanda[k]=ajanda[k]||[]).push(x); return; }
    if(x.d<bugun) return;
    (ajanda[x.d]=ajanda[x.d]||[]).push(x);
  });
  Object.keys(ajanda).forEach(d=>ajanda[d].sort((a,b)=>
    (a.t==='ozel'?(a.k.event_time||'99'):'00').localeCompare(b.t==='ozel'?(b.k.event_time||'99'):'00')));
  const gunler=Object.keys(ajanda).filter(d=>d>=bugun).sort().slice(0,7);
  /* GUN BASINA tavan. Kart 7 GUN ile sinirliydi ama "Bugün" kovasi TUM
     gecikmisleri yutuyor (yukaridaki `d<bugun?bugun:d`), dolayisiyla
     yogun veride tek basina 20+ satir cizip Panelim'i yine sonsuz
     uzatiyordu (§31). Kartin ANLAMI degismedi (§5): ayni kayitlar, ayni
     siralama - yalnizca tasan kisim tek satirlik bir baglantiya dondu. */
  const PA_GUN_TAVAN=5;
  const tkvHtml=gunler.length?gunler.map(d=>{
    const yarin=new Date(); yarin.setDate(yarin.getDate()+1);
    const et=d===bugun?'Bugün':(d===_wsIso(yarin)?'Yarın':psGun(d));
    /* S4.3: KISISEL etkinlikler gun tavanindan MUAF. Aksi halde gecikmis
       sirket olaylari "Bugün" kovasini doldurunca kullanicinin az once
       ekledigi kendi randevusu "+N kayıt daha"nin arkasinda kayboluyordu -
       kisisel bir ajandada kabul edilemez. Tavan yalniz SIRKET
       satirlarina uygulanir; gunun kendi ogeleri her zaman gorunur. */
    const ozelG=ajanda[d].filter(x=>x.t==='ozel');
    const sirketG=ajanda[d].filter(x=>x.t!=='ozel');
    const tasma=sirketG.length-PA_GUN_TAVAN;
    const hepsi=[...ozelG,...sirketG.slice(0,PA_GUN_TAVAN)];
    return `<div class="pa-d"><div class="pa-dh ${d===bugun?'now':''}">${esc(et)}</div>
      ${hepsi.map(x=>x.t==='takip'
        ? `<button type="button" class="pa-e ${x.gec?'gec':''}" onclick="${x.e.job_id?`workAc(${x.e.job_id})`:'void 0'}">
             <span class="pa-k takip">Günc.</span>
             <span class="pa-x">${esc(String(x.e.body).slice(0,64))}</span>
             ${x.gec?`<em>${psGecikme(x.d)} gün gecikti</em>`:''}</button>`
        : x.t==='ozel'
        ? `<button type="button" class="pa-e ozel" onclick="keAc(${x.k.id})" title="Kişisel etkinlik — yalnız siz görürsünüz">
             ${/* §23: kisisel oge notr/kisisel bir rozet tasir; gurultulu
                  bir gizlilik uyarisi YOK, ama "bu benim" anlasilir. */''}
             <span class="pa-k ozel">Kişisel</span>
             <span class="pa-x">${x.k.event_time?`<b>${esc(String(x.k.event_time).slice(0,5))}</b> `:''}${esc(x.k.title)}</span></button>`
        : `<button type="button" class="pa-e" onclick="workAc(${x.o.job_id})">
             ${/* §16: Baski/Montaj/Sokum ayni yesili paylasiyordu ve ayirt
                  edilemiyordu. Her operasyon turu kendi tonunu alir. */''}
             <span class="pa-k op op-${esc(x.o.operation_type)}">${esc(opTypeLbl(x.o.operation_type))}</span>
             <span class="pa-x">${esc(x.o.description||(jm[x.o.job_id]||{}).title||'')}</span></button>`).join('')}
      ${tasma>0?`<button type="button" class="pa-more" onclick="${d===bugun?'dikkatGoruntule()':`isGo('takvim',{})`}">
        +${tasma} kayıt daha →</button>`:''}
      </div>`;}).join('')
    :'<p class="empty">Önümüzdeki günlerde planlı bir şey yok.</p>';

  /* ---- TAKIP ETTIGIM ISLER (§17) ----
     Acikca work_followers ile beslenir - "ilgili olabilir" tahmini DEGIL. */
  const takipIs=(jobs||[]).filter(j=>takipJobs.has(j.id));
  const sonEntryOf=jid=>tumEnt.find(e=>e.job_id===jid);
  takipIs.sort((a,b)=>{ if(!!b.is_urgent!==!!a.is_urgent) return b.is_urgent?1:-1;
    const ea=sonEntryOf(a.id),eb=sonEntryOf(b.id);
    return String((eb||{}).occurred_at||'').localeCompare(String((ea||{}).occurred_at||'')); });
  const takipHtml=takipIs.length?takipIs.slice(0,8).map(j=>{
    const son=sonEntryOf(j.id);
    return `<button type="button" class="pd-row" onclick="workAc(${j.id})">
      <span class="pd-b"><span class="pd-t">${esc(j.title)}${j.is_urgent?' <span class="pu-b acil">⚡</span>':''}</span>
        <span class="pd-s">${esc(orgKisa(orgAdi(j))||'—')}${son?' · '+esc(String(son.body).slice(0,40)):''}</span></span>
      <span class="pd-r"><span class="pill">${esc(JOBLBL[j.status]||j.status)}</span>
        ${j.lifecycle_status==='bekliyor'?'<span class="pill sand">Bekliyor</span>':''}</span></button>`;}).join('')
    :'<p class="empty">Henüz bir işi takibe almadın. Bir iş açıp <b>Takibe Al</b> diyebilirsin.</p>';

  /* ---- Filtre cubugu (§7) ---- */
  const jobOpt=(jobs||[]).filter(j=>(j.lifecycle_status||'acik')!=='kapandi')
    .map(j=>`<option value="${j.id}" ${String(st.job)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('');
  const orgIds=[...new Set((ents||[]).map(e=>{const j=jm[e.job_id];return j?j.customer_id:e.customer_id;}).filter(Boolean))];
  const orgOpt=orgIds.map(id=>[id,cm[id]||('#'+id)]).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'tr'))
    .map(([id,nm])=>`<option value="${id}" ${String(st.org)===String(id)?'selected':''}>${esc(nm)}</option>`).join('');
  const kisiOpt=(team||[]).filter(t=>t.active!==false)
    .map(t=>`<option value="${t.id}" ${String(st.kisi)===String(t.id)?'selected':''}>${esc(t.name)}</option>`).join('');

  const ozet=[];
  if(st.job)   ozet.push('İş: '+esc((jm[st.job]||{}).title||('#'+st.job)));
  if(st.org)   ozet.push('Kurum: '+esc(cm[st.org]||('#'+st.org)));
  if(st.kisi)  ozet.push('İlgili: '+esc(tm[st.kisi]||('#'+st.kisi)));
  /* Iki filtre KESISIR (§7): ozet de bunu soyler. */
  if(dikkatSecili&&st.benim) ozet.push('Benimle ilgili VE Acil/Geciken');
  else if(dikkatSecili)      ozet.push('Acil/Geciken');
  else if(st.benim)          ozet.push('Benimle ilgili');

  c.innerHTML=`
    <div class="pnl-grid">
      <div class="pnl-a">
        <section class="card">
          <div class="card-h">
            ${/* §12: iki AKIS, tek kart. Varsayilan Güncellemeler. Ikisi tek bir
                 ayirt edilemez feed'de BIRLESTIRILMEZ. */''}
            <div class="ws-switch inline hr-sw" role="group" aria-label="Akış">
              <button type="button" class="${hg.gor!=='hareket'?'on':''}" aria-pressed="${hg.gor!=='hareket'}" onclick="hrGor('guncelleme')">Güncellemeler</button>
              <button type="button" class="${hg.gor==='hareket'?'on':''}" aria-pressed="${hg.gor==='hareket'}" onclick="hrGor('hareket')">Hareketler</button>
            </div>
            <button class="btn btn-sm act act-upd" onclick="qcAc({})">${ic('plus',15)} Güncelleme</button>
          </div>
          ${hg.gor==='hareket' ? hareketGovde(await hareketP, hg, jm, cm, tm) : `
          ${/* §12: kontroller artik "yan yana konmus alakasiz ogeler" degil,
               iki acik gruptan olusan TEK bir bilesen: once "neye gore
               daralt" (acilir kutular), sonra hizli anahtarlar. Yeni
               filtre EKLENMEDI, kavramlar aynen korundu. */''}
          <div class="pf">
            <div class="pf-sel">
              <select class="inp inp-sm ${st.job?'inp-on':''}" id="psJob" aria-label="İşe göre süz" onchange="psFiltreDegis()">
                <option value="">Tüm işler</option>${jobOpt}</select>
              <select class="inp inp-sm ${st.org?'inp-on':''}" id="psOrg" aria-label="Kuruma göre süz" onchange="psFiltreDegis()">
                <option value="">Tüm kurumlar</option>${orgOpt}</select>
              <select class="inp inp-sm ${st.kisi?'inp-on':''}" id="psKisi" aria-label="İlgili kişiye göre süz" onchange="psFiltreDegis()">
                <option value="">Tüm ilgililer</option>${kisiOpt}</select>
            </div>
            <div class="pf-tog">
              ${/* PS9 §9: Acil ve Geciken TEK kontroldur. Ikisi zaten ayni
                   soruyu soruyor ("dikkat gerekiyor mu?") ve ayri ayri
                   sunuldugunda kullanici ucuncu bir kombinasyon
                   ariyordu. Depolanan anahtarlar (`acil`,`gec`)
                   DEGISMEDI: Isler/Liste ve `dikkatGoruntule()` ayni
                   ikiliyi kullanmaya devam eder. */''}
              <button type="button" class="pf-t ${dikkatSecili?'on':''}" aria-pressed="${dikkatSecili}"
                title="Acil işaretli VEYA termini geçmiş açık aksiyonu olan güncellemeler"
                onclick="psFiltre({acil:${!dikkatSecili},gec:${!dikkatSecili}})">⚡ Acil/Geciken</button>
              <button type="button" class="pf-t ${st.benim?'on':''}" aria-pressed="${st.benim}"
                title="Etiketlendiğim güncellemeler veya takip ettiğim işlerin güncellemeleri"
                onclick="psFiltre({benim:${!st.benim}})">Benimle ilgili</button>
              ${filtreAktif?`<button type="button" class="pf-x" onclick="psTemizle()"
                title="Tüm filtreleri temizle">Temizle ✕</button>`:''}
            </div>
          </div>
          ${filtreAktif?`<div class="afilt">
            <span class="afilt-l">Aktif filtre</span>
            <span class="afilt-v">${ozet.join(' · ')}</span>
            <span class="afilt-n">${suz.length} güncelleme</span>
            <button type="button" class="afilt-x" onclick="psTemizle()">Temizle ✕</button></div>`:''}
          <div class="card-b pu-list">${feedHtml}</div>
          ${suz.length?`<div class="pgr">
            <button class="btn btn-outline btn-sm" ${sayfa<=1?'disabled':''}
              onclick="psSayfa(${sayfa-1})" aria-label="Önceki sayfa">‹ Önceki</button>
            <span class="pgr-n" aria-live="polite">
              <b>${sayfa}</b> / ${sayfaAdet}
              <em>${bas+1}–${bas+gosterilen.length} · ${suz.length} güncelleme</em></span>
            <button class="btn btn-outline btn-sm" ${sayfa>=sayfaAdet?'disabled':''}
              onclick="psSayfa(${sayfa+1})" aria-label="Sonraki sayfa">Sonraki ›</button>
          </div>`:''}`}</section>
      </div>

      <div class="pnl-b">
        <section class="card">
          ${/* §20: kart artik KISISEL. Ust-sag eylem kullaniciyi dogrudan
               sirket operasyon takvimine atmiyor; kendi genisletilmis
               kisisel takvimini aciyor (§21). */''}
          ${/* S4.3.1 §2: Ajandam'in IKI gorunumu var. Onceki "Takvim"
               baglantisi ayni kronolojik listeyi buyuk bir modalde
               aciyordu - takvim degildi. Artik gercek bir ay izgarasina
               gecen gorunur bir anahtar. */''}
          <div class="card-h"><h3>Ajandam</h3>
            <div style="display:flex;gap:8px;align-items:center">
              <button class="btn-link ekle" onclick="keForm(0)" title="Yalnız sizin göreceğiniz bir etkinlik ekleyin">+ Kişisel</button>
              <button class="btn-link" onclick="rpAc('plan')" title="Günlük ya da haftalık planı PDF olarak indirin">Plan PDF</button>
              ${ajandaAnahtar('liste')}
            </div></div>
          <div class="card-b pa-list">${tkvHtml}</div></section>

        <section class="card">
          <div class="card-h"><h3>Dikkat Gerekenler ${dikkatN?`<span class="chip clay">${dikkatN}</span>`:''}</h3>
            ${dikkatN?`<button class="btn-link" onclick="dikkatGoruntule()"
              title="Acil veya termini geçmiş işleri İşler / Liste'de aç">Görüntüle</button>`:''}</div>
          <div class="card-b">${dikkatHtml}</div></section>

        <section class="card">
          <div class="card-h"><h3>Takip Ettiğim İşler ${takipIs.length?`<span class="chip">${takipIs.length}</span>`:''}</h3>
            <button class="btn-link" onclick="wsTakipTumu()">Tümü</button></div>
          <div class="card-b">${takipHtml}</div></section>
      </div>
    </div>`;
}
/* ============ KISISEL ETKINLIK + AJANDAM (S4.3 §16-§24) =============
   Ayri bir yan menu modulu ACILMADI (§21): genisletilmis kisisel takvim
   Panelim'in icinde bir modal yuzeydir. `İşler → Takvim` paylasilan
   SIRKET operasyon takvimi olarak aynen kalir ve kisisel etkinlikleri
   ASLA gostermez (§24). */
/* ---- Kisisel ilgi kurallari — TEK kaynak (S4.3 §19, S4.3.1 §4) ----
   Liste ve Takvim bu fonksiyonu kullanir. Olaylar GERCEK tarihlerinde
   doner; gecikmisleri bugune toplamak gibi sunum kararlari cagirana aittir.
   Tarihli bir Entry benimdir eger:
     (a) o guncellemede ETIKETLIYSEM        (entry_relevance)
     (b) BANA ATANMISSA                     (legacy assignee_id)
     (c) onu BEN YAZDIYSAM                  (kendi verdigim soz)
     (d) bagli oldugu Work'u TAKIP EDIYORSAM (work_followers)
   Operasyon benimdir eger Work'unu takip ediyorsam (d).
   Kisisel etkinlikler her zaman dahildir - RLS zaten yalniz benimkileri verir.
   Kapali aksiyonlar ve IPTAL edilmis operasyonlar kisisel takvimde yer tutmaz.
   Sirketin geri kalani `İşler → Takvim`de kalir. */
function ajandaOlaylar(x){
  const benim=x.benim||0;
  const bugun=_cIso(new Date());
  const ilgili=e=> x.ilgiSet.has(e.id) || (benim&&e.assignee_id===benim)
                || (benim&&e.created_by_team_id===benim)
                || (e.job_id&&x.takipJobs.has(e.job_id));
  const ev=[];
  (x.ents||[]).forEach(e=>{
    if(!e.due_at||!ilgili(e)) return;
    if(e.action_status==='done'||e.action_status==='cancelled') return;
    const d=String(e.due_at).slice(0,10);
    ev.push({t:'takip',d,e,baslik:e.body,gec:d<bugun,acil:!!e.is_urgent});
  });
  (x.ops||[]).forEach(o=>{
    if(!o.planned_date||!o.job_id||!x.takipJobs.has(o.job_id)) return;
    if(o.status==='cancelled') return;
    const d=String(o.planned_date).slice(0,10);
    ev.push({t:'op',d,o,baslik:o.description||opTypeLbl(o.operation_type),
      gec:d<bugun&&['planned','waiting','in_progress'].includes(o.status)});
  });
  (x.kisisel||[]).forEach(k=>{
    ev.push({t:'ozel',d:k.event_date,k,
      baslik:(k.event_time?String(k.event_time).slice(0,5)+' ':'')+k.title});
  });
  return ev;
}

/* ---- Liste | Takvim anahtari (S4.3.1 §2) ---- */
function ajandaAnahtar(aktif){
  return `<div class="ws-switch inline aj-sw" role="group" aria-label="Ajandam görünümü">
    <button type="button" class="${aktif==='liste'?'on':''}" aria-pressed="${aktif==='liste'}" onclick="ajandaGor('liste')">Liste</button>
    <button type="button" class="${aktif==='takvim'?'on':''}" aria-pressed="${aktif==='takvim'}" onclick="ajandaGor('takvim')">Takvim</button>
  </div>`;
}
/* Gorunum degisimi S4.1 gecmis mekanizmasiyla kaydedilir; yeni router YOK.
   Takvim'e gecis bir girdi ekler, boylece tarayici Geri Listeye doner.
   Takvim'den Liste'ye gecis, girdi zaten bizimse GERI sarar (ikinci bir
   ileri girdi biriktirmez). */
function ajandaGor(v){
  if(v==='takvim'){
    if(ui._ajGor==='takvim') return;
    ui._ajGor='takvim';
    ui._ajTkv=ui._ajTkv||{ay:0,gun:null};
    navKayit('ajanda','workspace-home',0);
    renderSection(); window.scrollTo(0,0);
    return;
  }
  const st=history.state;
  if(st&&st.mp&&st.v==='ajanda'&&(st.i||0)>0){ history.back(); return; }
  ui._ajGor='liste'; renderSection();
}
function ajTkvAy(delta){ const t=ui._ajTkv||{ay:0,gun:null}; ui._ajTkv={ay:t.ay+delta,gun:null}; renderSection(); }
function ajTkvBugun(){ ui._ajTkv={ay:0,gun:_cIso(new Date())}; renderSection(); }
function ajTkvGun(iso){ ui._ajTkv={...(ui._ajTkv||{ay:0}),gun:iso}; renderSection(); }

/* ---- Ajandam Takvim: GERCEK ay izgarasi (S4.3.1 §1, §6-§8) ----
   Isler -> Takvim ile AYNI `takvimIzgara` renderer'i; yalniz veri kapsami
   farkli (`ajandaOlaylar`). Tek tur toplu okuma; gun ya da Work basina
   sorgu YOK. */
async function ajandaTakvim(c){
  const t=ui._ajTkv||{ay:0,gun:null};
  const [from,to,ayBase]=tkvAralik(t.ay);
  const benim=(ui._me&&ui._me.id)||0;
  const veri=await guard(()=>Promise.all([
    api(`personal_events_list&from=${from}&to=${to}`),
    /* Termin araligina gore okunur: "son 400 guncelleme" penceresi gecmis
       ya da ileri bir ayin terminlerini kacirabilirdi. */
    api(`entries_list&due_from=${from}&due_to=${to}&limit=1000`),
    api(`operations_list&from=${from}&to=${to}&limit=1000`),
    api('jobs_list'),
    api('entry_relevance_all&team_id='+benim).catch(()=>[]),
    api('work_followers_all&team_id='+benim).catch(()=>[])
  ]),'Ajanda açılamadı');
  if(!veri) return;
  const [ozel,ents,ops,jobs,ilgi,takip]=veri;
  ui._kisisel=ozel||[];
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  const ev=ajandaOlaylar({ents,ops,kisisel:ozel,benim,
    ilgiSet:new Set((ilgi||[]).map(r=>r.entry_id)),
    takipJobs:new Set((takip||[]).map(r=>r.job_id))});

  const gunMap={}; ev.forEach(x=>(gunMap[x.d]=gunMap[x.d]||[]).push(x));
  /* Hucre icinde de gun listesinde de ONCE kendi etkinliklerim (saate
     gore), sonra sirket olaylari - kompakt Liste ile ayni sira. */
  const sira=(a,b)=>{ const oa=a.t==='ozel'?0:1, ob=b.t==='ozel'?0:1;
    if(oa!==ob) return oa-ob;
    return oa===0?String(a.k.event_time||'99').localeCompare(String(b.k.event_time||'99')):0; };
  Object.keys(gunMap).forEach(d=>gunMap[d].sort(sira));

  const y=ayBase.getFullYear(), m=ayBase.getMonth();
  const bugun=_cIso(new Date());
  const ayIci=d=>d&&d.slice(0,7)===y+'-'+pad(m+1);
  const secili=(t.gun&&ayIci(t.gun))?t.gun:(ayIci(bugun)?bugun:null);

  const izgara=takvimIzgara({y,m,gunMap,secili,
    gunTik:'ajTkvGun',
    evSinif:x=>x.t==='ozel'?'ozel':(x.t==='op'?'op op-'+x.o.operation_type:'takip'),
    navOnceki:'ajTkvAy(-1)', navSonraki:'ajTkvAy(1)', navBugun:'ajTkvBugun()',
    sagHtml:`<div class="tk-f">${ajandaAnahtar('takvim')}</div>`,
    lejantHtml:`<span><i class="tk-p tk-ozel"></i> Kişisel (yalnız siz)</span>
      <span><i class="tk-p tk-takip"></i> Güncelleme (size bağlı termin)</span>
      <span><i class="tk-p tk-op"></i> Baskı & Montaj (takip ettiğiniz iş)</span>`});

  /* §8: secili gunun kisisel gorunumu + o tarihle on-dolu `+ Kişisel etkinlik`. */
  const gunList=secili?(gunMap[secili]||[]):[];
  const satir=x=>x.t==='ozel'
    ? `<button type="button" class="tk-i" onclick="keForm(${x.k.id})">
         <span class="tk-i-k tk-ozel">Kişisel</span>
         <span class="tk-i-b"><b>${x.k.event_time?esc(String(x.k.event_time).slice(0,5))+' · ':''}${esc(x.k.title)}</b>
           <em>${x.k.note?esc(x.k.note):'yalnız siz görürsünüz'}</em></span>
         <span class="tk-i-r"><span class="muted">düzenle</span></span></button>`
    : x.t==='takip'
    ? `<button type="button" class="tk-i" onclick="${x.e.job_id?`workAc(${x.e.job_id})`:'void 0'}">
         <span class="tk-i-k tk-takip">Günc.</span>
         <span class="tk-i-b"><b>${esc(x.e.body)}</b>
           <em>${x.e.job_id&&jm[x.e.job_id]?esc(jm[x.e.job_id].title):'<i>işe bağlı değil</i>'}</em></span>
         <span class="tk-i-r">${x.gec?'<span class="pill clay">gecikti</span>':(x.acil?'<span class="pill clay">ACİL</span>':'')}</span></button>`
    : `<button type="button" class="tk-i" onclick="workAc(${x.o.job_id})">
         <span class="tk-i-k tk-op">${esc(opTypeLbl(x.o.operation_type))}</span>
         <span class="tk-i-b"><b>${esc(x.baslik)}</b>
           <em>${jm[x.o.job_id]?esc(jm[x.o.job_id].title):''}</em></span>
         <span class="tk-i-r"><span class="badge-st st-${esc(x.o.status)}">${esc(opStatLbl(x.o.status))}</span></span></button>`;

  c.innerHTML=`<div class="sec-head">
      <div><h3>Ajandam</h3>
        <p class="sub">Kişisel takviminiz — kendi etkinlikleriniz ve size bağlı şirket tarihleri.
          Şirketin tamamı <button type="button" class="btn-link" style="padding:0 2px;min-height:0" onclick="isGo('takvim',{})">İşler → Takvim</button>'de.</p></div>
      <button class="btn btn-sm act act-work" onclick="keForm(0,'${secili||bugun}')">${ic('plus',15)} Kişisel etkinlik</button>
    </div>
    ${izgara}
    <section class="sec-card">
      <div class="sec-head" style="margin-bottom:8px">
        <h4 style="font-size:14px;margin:0">${secili?esc(psGun(secili)+' '+String(secili).slice(0,4)):'Gün seçin'} <span class="chip">${gunList.length}</span></h4>
        ${secili?`<button class="btn btn-outline btn-sm" onclick="keForm(0,'${secili}')">${ic('plus',15)} Kişisel etkinlik</button>`:''}
      </div>
      ${gunList.length?gunList.map(satir).join('')
        :`<p class="empty">${secili?'Bu gün için size bağlı bir şey yok.':'Takvimden bir gün seçin.'}</p>`}
    </section>`;
}

/* ---- Kisisel etkinlik formu — Liste ve Takvim AYNI formu kullanir (§9) ---- */
function keForm(id,tarih){
  const k=(ui._kisisel||[]).find(x=>x.id===id)||{};
  const bugun=_cIso(new Date());
  modal(`<h3 style="margin:0 0 4px">${id?'Kişisel etkinlik':'Kişisel etkinlik ekle'}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">
      Yalnız siz görürsünüz. Ekip akışına, iş zaman çizelgesine veya
      şirket takvimine düşmez.</p>
    <input type="hidden" id="keId" value="${id||0}">
    <div class="field"><label class="flabel" for="keTitle">Ne?</label>
      <input class="inp" id="keTitle" value="${esc(k.title)}" placeholder="ör. Dişçi" autocomplete="off"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="keDate">Tarih</label>
        <input class="inp" type="date" id="keDate" value="${esc(k.event_date||tarih||bugun)}"></div>
      <div class="field"><label class="flabel" for="keTime">Saat <span class="fhint" style="display:inline">(isteğe bağlı)</span></label>
        <input class="inp" type="time" id="keTime" value="${esc(k.event_time?String(k.event_time).slice(0,5):'')}"></div>
    </div>
    <div class="field"><label class="flabel" for="keNote">Not</label>
      <input class="inp" id="keNote" value="${esc(k.note)}" placeholder="isteğe bağlı"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      ${id?`<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="keSil(${id})">Sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="keKaydet()">Kaydet</button></div>`);
  const t=document.getElementById('keTitle'); if(t)t.focus();
}
function keAc(id){ keForm(id); }
async function keKaydet(){
  const title=(gv('keTitle')||'').trim();
  if(!title){ mpAlert('Başlık zorunlu.'); return; }
  const tarih=gv('keDate'); if(!tarih){ mpAlert('Tarih zorunlu.'); return; }
  const saat=gv('keTime')||null;
  modalBusy(true);
  const r=await guard(()=>api('personal_event_save',{id:+gv('keId')||0,title,
    event_date:tarih, event_time:saat, note:gv('keNote')||null}),'Kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Kişisel etkinlik kaydedildi.');
  /* Takvimde yeni etkinligin gununu sec ve ayina git. */
  if(ui._ajGor==='takvim'){
    const b=new Date(); const hedef=new Date(tarih+'T12:00:00');
    ui._ajTkv={ay:(hedef.getFullYear()-b.getFullYear())*12+(hedef.getMonth()-b.getMonth()),gun:tarih};
  }
  renderSection();
}
async function keSil(id){
  if(!await mpConfirm('Bu kişisel etkinlik silinsin mi?','Etkinliği Sil'))return;
  const r=await guard(()=>api('personal_event_delete&id='+id),'Silinemedi'); if(r===null)return;
  closeModal(); toast('Silindi.');
  renderSection();
}

/* Panelim kisayollari - ayni kayda Isler ekranindaki filtreyle gider,
   ayri bir liste kopyasi uretmez (BR-V01). Hedef ekranda filtrenin AKTIF
   oldugu acikca gorunur (§8/§20). */
/* "Dikkat Gerekenler" -> tek ve HER ZAMAN AYNI hedef: Isler / Liste,
   `Acil` VE `Geciken` kontrolleri birlikte acik (S5.1 §6). Ikili VEYA ile
   birlestigi icin sonuc tum dikkat kumesidir; ayri bir filtre YOK. */
function dikkatGoruntule(){
  isGo('liste',{q:'',org:'',phase:'',ilgili:'',acil:true,gec:true,
                life:['acik','bekliyor']});
}
function wsTakipTumu(){
  isGo('liste',{q:'',org:'',phase:'',ilgili:String((ui._me&&ui._me.id)||''),
                acil:false,gec:false,life:['acik','bekliyor']});
}

/* ---------- Workspace Mecralar hub (parity audit S1 §2/§9) ----------
   Retired: the old flat-list `wsMecralar` (Sprint 06) duplicated a
   sliver of what `listeler` already computed, worse. This hub renders
   NO business data itself — it is pure routing chrome (a 3-way tab)
   that delegates entirely to the same renderers Admin uses:
   listeler (Doluluk, default), harita, mecralar. Each of those already
   gates its own mutation surface via isAdmin() (see their definitions);
   nothing new is gated here. */
function wsMecSub(){ const v=ui._mecSub||'doluluk'; return (v==='harita')?v:'doluluk'; }
async function wsMecTab(sub){ if(ui._dirty&&!(await dirtyGuard())) return;
  /* S14: ekran-numarası korumalı yol — hızlı sekme değişiminde geç gelen
     Doluluk verisi Harita'nın üstüne (ya da tersi) çizilmez. */
  ui._mecSub=sub; navUrlTazele(); renderSection(); }
async function wsMecralarHub(c){
  const sub=wsMecSub();
  const tab=(key,label)=>`<button type="button" class="${sub===key?'on':''}" aria-pressed="${sub===key}" onclick="wsMecTab('${key}')">${esc(label)}</button>`;
  /* §22: Team medya IA'sı Doluluk | Harita. Üçüncü sekme Admin'in CMS
     mecra-hiyerarşisi ekranıydı; Sprint 2'de Doluluk'a eklenen "mecra türü"
     filtresi onun karşıladığı keşfedilebilirlik ihtiyacını zaten kapatıyor.
     `mecralar()` SİLİNMEDİ - Admin navigasyonunda aynen duruyor. */
  c.innerHTML=`<div class="ws-switch inline" role="group" aria-label="Mecra görünümü">
      ${tab('doluluk','Doluluk')}${tab('harita','Harita')}</div>
    <div id="mecSubBody"><p class="muted">Yükleniyor…</p></div>`;
  const body=document.getElementById('mecSubBody');
  if(sub==='harita') await harita(body);
  else await listeler(body);
}

/* ---------- ÜRÜNLER ---------- */
async function urunler(c){
  const list=await api('products_list');
  ui._products=list;
  const rows=list.map(p=>`<div class="list-item"><div class="nm">${esc(p.name)}</div><div class="meta">${esc(p.olcu||'')}</div>
    <button class="btn btn-outline btn-sm" onclick="prodEdit(${p.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="prodDel(${p.id})">Sil</button></div>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Ürünler (çekirdek)</h3><button class="btn btn-primary btn-sm" onclick="prodEdit(0)">+ Ürün ekle</button></div>${rows||'<p class="muted">Ürün yok.</p>'}<div id="prodEd"></div>`;
}
async function prodEdit(id){
  let p={prices:{}};
  if(id){ const r=await guard(()=>kayitTazeOku('products','id',id),'Ürün açılamadı'); if(r===null) return;
    if(!r){ mpAlert('Ürün bulunamadı.','Ürün'); return; } p=r; }
  ui._prodIlk=id?p:null;
  const priceText=Object.entries(p.prices||{}).map(([k,v])=>`${k} = ${v}`).join('\n');
  document.getElementById('prodEd').innerHTML=`<div class="sec-card" style="margin-top:16px"><h3 style="margin:0 0 14px;font-size:16px">${id?'Ürünü Düzenle':'Yeni Ürün'}</h3>
    <input type="hidden" id="pid" value="${id||0}">
    <div class="row2"><div class="field"><label class="flabel">İsim</label><input class="inp" id="pname" value="${esc(p.name)}"></div>
    <div class="field"><label class="flabel">Ölçü</label><input class="inp" id="polcu" value="${esc(p.olcu)}"></div></div>
    <div class="row3"><div class="field"><label class="flabel">Yüzey</label><input class="inp" id="pyuzey" value="${esc(p.yuzey)}"></div>
    <div class="field"><label class="flabel">Aydınlatma</label><input class="inp" id="pisikli" value="${esc(p.isikli)}"></div>
    <div class="field"><label class="flabel">Baskı Malzemesi</label><input class="inp" id="pbm" value="${esc(p.baski_malzemesi)}"></div></div>
    <div class="field"><label class="flabel">İkon (filtre düğmelerinde görünür)</label>
      ${ikonSecici('pikon',p.ikon)}</div>
    <div class="field"><label class="flabel">Arama etiketleri</label>
      <input class="inp" id="petiket" value="${esc(p.etiketler)}" placeholder="billboard, bilbord, dev pano">
      <p class="muted" style="font-size:11.5px;margin:5px 0 0">Müşterinin arama kutusuna yazabileceği diğer isimler. Virgülle ayırın; sitede görünmez, yalnızca aramada kullanılır.</p></div>
    <div class="row3"><div class="field"><label class="flabel">Baskı Formatı</label><input class="inp" id="pbf" value="${esc(p.baski_format)}"></div>
    <div class="field"><label class="flabel">Yayın Formatı</label><input class="inp" id="pyf" value="${esc(p.yayin_format)}"></div>
    <div class="field"><label class="flabel">Baskı Ücreti</label><input class="inp" id="pbu" value="${esc(p.baski_ucreti)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">Montaj Ücreti</label><input class="inp" id="pmu" value="${esc(p.montaj_ucreti)}"></div>
    <div class="field"><label class="flabel">Extra Değişim</label><input class="inp" id="pex" value="${esc(p.extra_ucret)}"></div></div>
    <div class="field"><label class="flabel">Fiyatlar (Etiket = Değer)</label><textarea class="inp" id="pprices" placeholder="1 Ay = 40000">${esc(priceText)}</textarea></div>
    <button class="btn btn-primary btn-sm" onclick="prodSave()">Kaydet</button></div>`;
  document.getElementById('prodEd').scrollIntoView({behavior:'smooth'});
}
function parsePrices(v){ const o={}; v.split('\n').forEach(l=>{const x=l.indexOf('=');if(x<0)return;const k=l.slice(0,x).trim();let val=l.slice(x+1).trim();const n=val.replace(/[.\s₺]/g,'');if(/^\d+$/.test(n))val=Number(n);if(k)o[k]=val;}); return o; }
/* S14: önceden hata yakalanmıyor (başarısız kayıt sessiz kalıyordu), satırın
   tamamı yazılıyor ve eşzamanlı fiyat değişikliği eziliyordu. */
let _prodKayit=false;
async function prodSave(){
  if(_prodKayit) return;
  const id=+gv('pid');
  const yeni={name:gv('pname').trim(),olcu:gv('polcu'),yuzey:gv('pyuzey'),isikli:gv('pisikli'),baski_malzemesi:gv('pbm'),baski_format:gv('pbf'),
    yayin_format:gv('pyf'),etiketler:gv('petiket'),ikon:gv('pikon'),baski_ucreti:gv('pbu'),montaj_ucreti:gv('pmu'),extra_ucret:gv('pex'),
    prices:parsePrices(gv('pprices'))};
  if(!yeni.name){ mpAlert('Ürün adı zorunlu.','Ürün'); return; }
  _prodKayit=true;
  const b=document.querySelector('#prodEd .btn-primary'); if(b){ b.disabled=true; }
  try{
    if(id){ const r=await kosulluGuncelle('products',ui._prodIlk||{},yeni);
      if(r.bos){ toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); renderSection(); return; } }
    else await api('product_save',{id:0,...yeni});
  }catch(e){ kayitHata(e,'Ürün kaydedilemedi'); return; }
  finally{ _prodKayit=false; if(b&&b.isConnected) b.disabled=false; }
  toast('Ürün kaydedildi.'); renderSection();
}
async function prodDel(id){ if(await mpConfirm('Ürün silinsin mi? Bu ürünü kullanan alanlarda ürün bağlantısı boşalır.','Ürünü Sil')){ await api('product_delete&id='+id); renderSection(); } }


/* Görünürlük seçici: her ikisi / sadece masaüstü / sadece mobil / gizle */
const VIS_OPTS=[['both','Her ikisinde göster'],['desktop','Sadece masaüstü'],['mobile','Sadece mobil (760px altı)'],['off','Gizle']];
function visVal(o,key){ const v=o&&o.visible&&o.visible[key];
  if(v===undefined||v===null||v===true) return 'both';
  if(v===false) return 'off';
  return ['both','desktop','mobile','off'].includes(v)?v:'both'; }
function visSel(idPrefix,o,key,label){
  const cur=visVal(o,key);
  return `<div class="vis-sel"><span>${esc(label||'Görünürlük')}</span>
    <select class="inp" id="${idPrefix}vis_${key}">${VIS_OPTS.map(x=>
      `<option value="${x[0]}" ${cur===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>`; }
function collectVis(idPrefix,keys,prev){
  const out={...(prev||{})};
  keys.forEach(k=>{ const el=document.getElementById(idPrefix+'vis_'+k); if(el) out[k]=el.value; });
  return out; }
/* görsel alanı + mobil sürümü */
function imgField(id,val,label,hint,opt){
  const o=JSON.stringify(opt||upOpt(id)).replace(/"/g,'&quot;');
  return `<div class="field"><label class="flabel">${esc(label)}</label>
    <div class="imgf">
    <span class="imgf-pv${val?'':' bos'}" id="${id}_pv" onclick="imgAc('${id}')" title="Önizleme — tıklayınca tam boyut açılır">${val?`<img src="${esc(val)}" alt="">`:''}</span>
    <input class="inp" id="${id}" value="${esc(val)}" placeholder="${esc(hint||'https://...')}" oninput="imgPv('${id}')">
    <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('${id}').value=u;imgPv('${id}');},${o})">Yükle</button>
    <button class="btn btn-ghost btn-sm imgf-x" title="Görseli kaldır" onclick="imgSil('${id}')">✕</button></div></div>`; }
function imgPv(id){ const v=(gv(id)||'').trim(), pv=document.getElementById(id+'_pv'); if(!pv)return;
  pv.innerHTML=v?`<img src="${esc(v)}" alt="">`:''; pv.classList.toggle('bos',!v); }
function imgAc(id){ const v=(gv(id)||'').trim(); if(v)window.open(v,'_blank'); }
function imgSil(id){ const e=document.getElementById(id); if(!e)return; e.value=''; imgPv(id);
  e.dispatchEvent(new Event('input',{bubbles:true})); }
/* alan tipine göre en uzun kenar sınırı */
function upOpt(id){
  const s=String(id||'').toLowerCase();
  if(s.includes('kroki')) return {max:2600,q:.88};          /* ince çizgiler okunsun */
  if(s.includes('logo')) return {max:800,q:.92};
  if(s.includes('kapak')||s.includes('bd'))  return {max:2000,q:.82};
  if(s.includes('m'))    return {max:1200,q:.82};           /* mobil sürümler */
  return {max:1600,q:.82};
}


/* adres (slug) yardımcıları */
function pslug(t){ return String(t||'').toLocaleLowerCase('tr')
  .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70) || 'sayfa'; }
function slugHint(srcId,dstId){ const d=document.getElementById(dstId); if(d) d.placeholder='otomatik: '+pslug(gv(srcId)); }

/* sitemap.xml üret ve indir */
async function buildSitemap(){
  const base=(gv('siteUrl')||'https://medyaparkadana.com').replace(/\/+$/,'');
  const [mc,al,pg]=await Promise.all([api('mecra_list'), sb.from('alt_mecralar').select('*').order('sort'), api('pages_list')]);
  const alts=(al.data||[]);
  const today=new Date().toISOString().slice(0,10);
  const urls=[[base+'/',1.0],[base+'/harita',0.8],[base+'/medya-planlama',0.7]];
  mc.forEach(m=>{ const ms=m.slug||pslug(m.name); urls.push([base+'/mecra/'+ms,0.9]);
    alts.filter(a=>a.mecra_id===m.id).forEach(a=>urls.push([base+'/mecra/'+ms+'/'+(a.slug||pslug(a.name)),0.7])); });
  (pg||[]).forEach(p=>urls.push([base+'/sayfa/'+p.slug,0.5]));
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u=>`  <url><loc>${u[0]}</loc><lastmod>${today}</lastmod><priority>${u[1]}</priority></url>`).join('\n')
    + '\n</urlset>';
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([xml],{type:'application/xml'}));
  a.download='sitemap.xml'; a.click(); URL.revokeObjectURL(a.href);
  mpAlert(urls.length+' adres içeren sitemap.xml indirildi.\nBu dosyayı sitenin ana klasörüne yükleyin.');
}


/* ==========================================================
   EXCEL / CSV — DIŞA VE İÇE AKTARMA ALTYAPISI
   ========================================================== */
let _xlsxP=null;
function xlsxLoad(){                       /* SheetJS sadece gerektiğinde yüklenir */
  if(window.XLSX) return Promise.resolve();
  if(_xlsxP) return _xlsxP;
  _xlsxP=new Promise((res,rej)=>{
    const sc=document.createElement('script');
    sc.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    sc.onload=()=>res(); sc.onerror=()=>rej(new Error('Excel kütüphanesi yüklenemedi'));
    document.head.appendChild(sc);
  });
  return _xlsxP;
}
/* S5 — dosya adindaki tarih YEREL gundur. `toISOString()` UTC verir; TR'de
   gece 00:00-03:00 arasi uretilen dosya bir onceki gunun adini aliyordu. */
const _dt=()=>_cIso(new Date());

/* --- DIŞA AKTAR --- */
/* S2 §5/§13 — tarih anlambilimi.
   Çalışma referansı Excel'lerin hepsinde dosya adında bir tarih var
   ("... 21.11.2025.xlsx") ve o tarih İŞ DÖNEMİ DEĞİL, dosyanın alındığı
   AN'dır: 21.11.2025 tarihli baskı/montaj dosyasının satırları Ekim
   2025'e aittir. Uygulama bu iki şeyi artık asla tek bir tarihe
   karıştırmaz ve dışa aktarımda ÜÇÜNÜ AYRI AYRI yazar:
     · İş dönemi / filtre  → hangi işlere bakıyoruz
     · Veri okunma anı      → ekrandaki verinin çekildiği an
     · Dışa aktarım anı     → bu dosyanın üretildiği an

   Meta AYRI BİR SAYFAYA ve DATA SAYFASINDAN SONRA yazılır. İki neden:
   içe aktarım `SheetNames[0]`ı ve onun 1. satırını başlık kabul eder
   (bkz. importOpen), dolayısıyla başlığın üstüne satır eklemek kendi
   çıktımızı geri alınamaz hale getirirdi; meta sayfasını başa koymak da
   aynı şeyi yapardı. Bu haliyle gidiş-dönüş bozulmaz. */
/* Veri sayfasi - TEK yazar (ekran disa aktarimlari + Raporlar).
   · Baslik satiri 1. satir; ice aktarim (`importOpen`) bunu bekler.
   · `tip:'tarih'` sutunlari GERCEK Excel tarihi olur (siralanir/suzulur),
     yerel gun olarak kurulur: 'YYYY-MM-DD' -> new Date(y,m-1,d). UTC'den
     kurmak TR'de gunu bir geri kaydirirdi.
   · `tip:'sayi'` sutunlari sayi hucresi olur (metin "91.000 TL" degil).
   · Otomatik filtre: calisma tablosu gibi suzulur. */
/* Excel tarih seri numarasi, TAM gun. JS Date vermek SheetJS'in yerel saat
   dilimi donusumunden gecer ve Istanbul'un tarihi LMT ofseti hucreye
   saniyeler ekliyordu (14.09.2026 00:00:5x). Gun takvim aritmetigiyle
   hesaplanir; saat dilimi hic devreye girmez. */
function _xlsxTarih(v){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));
  return m?(Date.UTC(+m[1],+m[2]-1,+m[3])-Date.UTC(1899,11,30))/864e5:v;
}
function exportVeriSayfasi(cols, rows){
  const head=cols.map(c=>c.label);
  const body=rows.map(r=>cols.map(c=>{
    let v=typeof c.get==='function'?c.get(r):r[c.key];
    if(v===null||v===undefined||v==='') return '';
    if(c.tip==='tarih') v=_xlsxTarih(v);   /* sayi; bicim asagida */
    else if(c.tip==='sayi'){ const n=Number(v); v=Number.isFinite(n)?n:v; }
    return v; }));
  /* Nokta SSF'te ondalik saniye belirtecidir; literal olarak kacislanir. */
  const TARIH_NF='dd\\.mm\\.yyyy';
  const ws=XLSX.utils.aoa_to_sheet([head,...body],{dateNF:TARIH_NF});
  cols.forEach((c,ci)=>{ if(c.tip!=='tarih') return;
    for(let ri=1;ri<=body.length;ri++){ const cell=ws[XLSX.utils.encode_cell({r:ri,c:ci})];
      if(cell&&cell.t==='n') cell.z=TARIH_NF; } });
  ws['!cols']=cols.map(c=>({wch:c.w||18}));
  if(body.length) ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:body.length,c:head.length-1}})};
  /* Ust satiri sabitleme (freeze pane) SheetJS 0.18.5 topluluk surumunde
     YAZILMIYOR (openpyxl ile dogrulandi); bu yuzden denenmiyor. */
  return ws;
}
/* Dosya adi: dosya sistemi guvenli, Turkce harfler ASCII'ye iner. */
function exportDosyaAdi(...parca){
  const tr={'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U'};
  return parca.filter(Boolean).map(x=>String(x).replace(/[çÇğĞıİöÖşŞüÜ]/g,ch=>tr[ch])
    .replace(/&/g,'ve').replace(/[^A-Za-z0-9\-]+/g,'_').replace(/^_+|_+$/g,'')).join('_');
}
async function exportRows(dosyaAdi, sheetAdi, cols, rows, meta){
  try{ await xlsxLoad(); }catch(e){ mpAlert(e.message); return; }
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,exportVeriSayfasi(cols,rows),sheetAdi.slice(0,30));
  XLSX.utils.book_append_sheet(wb,exportMetaSheet(sheetAdi,rows.length,meta),'Bilgi');
  XLSX.writeFile(wb,`${dosyaAdi}-${_dt()}.xlsx`);
}
/* Dışa aktarım künyesi. `meta` = [[etiket,değer], ...] — ekranın o anki
   filtresi. Buradaki hiçbir satır iş tarihi DEĞİLDİR; iş tarihleri veri
   sayfasının kendi sütunlarındadır. `okunma` verilmezse ekranin son
   okuma ani (ui._veriOkunma) kullanilir. */
function exportMetaSheet(sheetAdi, adet, meta, okunma, dosyaNotu){
  const now=new Date();
  const okundu=okunma instanceof Date?okunma:(ui._veriOkunma instanceof Date?ui._veriOkunma:now);
  const aoa=[
    ['Medyapark — dışa aktarım künyesi'],
    [],
    ['Görünüm', sheetAdi]];
  if(adet!==null&&adet!==undefined) aoa.push(['Kayıt sayısı', adet]);
  aoa.push([]);
  (meta||[]).forEach(m=>aoa.push([m[0], m[1]]));
  aoa.push([]);
  aoa.push(['Veri okunma anı', okundu.toLocaleString('tr-TR')]);
  aoa.push(['Dışa aktarım anı', now.toLocaleString('tr-TR')]);
  aoa.push([]);
  aoa.push(['Not','Bu dosya yukarıdaki filtrenin O ANKİ durumunun anlık görüntüsüdür.']);
  aoa.push(['','Canlı kayıt uygulamadadır; bu dosya kaynak tablo değildir.']);
  aoa.push(['',dosyaNotu||'Dosya adındaki tarih dışa aktarım günüdür; iş dönemi değildir.']);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:26},{wch:70}];
  return ws;
}

/* --- İÇE AKTAR --- */
let _imp=null;   /* {cfg, headers, rows, map} */
function importOpen(cfg){
  _imp={cfg,headers:[],rows:[],map:{}};
  modal(`<h3 style="margin:0 0 6px">${esc(cfg.title)}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">${esc(cfg.hint||'Excel (.xlsx) veya CSV dosyası seçin. Sütunlarınızı bir sonraki adımda eşleştireceksiniz.')}</p>
    <div class="imp-drop" id="impDrop">
      <input type="file" id="impFile" accept=".xlsx,.xls,.csv" style="display:none" onchange="importParse(this.files[0])">
      <button class="btn btn-outline btn-sm" onclick="document.getElementById('impFile').click()">Dosya Seç</button>
      <p class="muted" style="font-size:12px;margin:9px 0 0">.xlsx · .xls · .csv</p>
    </div>
    <div id="impBody"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="impGo" onclick="importApply()" disabled>İçe Aktar</button></div>`);
}
async function importParse(file){
  if(!file)return;
  try{ await xlsxLoad(); }catch(e){ mpAlert(e.message); return; }
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true});
  const ws=wb.Sheets[wb.SheetNames[0]];
  const aoa=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',blankrows:false});
  if(!aoa.length){ mpAlert('Dosya boş görünüyor.'); return; }
  /* başlık satırını bul: en çok dolu hücreye sahip ilk 5 satırdan biri */
  let hi=0,best=-1;
  aoa.slice(0,5).forEach((r,i)=>{ const n=r.filter(x=>String(x).trim()!=='').length; if(n>best){best=n;hi=i;} });
  _imp.headers=aoa[hi].map((h,i)=>String(h).trim()||('Sütun '+(i+1)));
  _imp.rows=aoa.slice(hi+1).filter(r=>r.some(x=>String(x).trim()!==''));
  /* otomatik eşleştirme */
  const norm=t=>String(t||'').toLocaleLowerCase('tr').replace(/[^a-z0-9çğıöşü]/g,'');
  _imp.map={};
  _imp.cfg.fields.forEach(f=>{
    const cands=[f.label,...(f.alias||[])].map(norm);
    const idx=_imp.headers.findIndex(h=>cands.includes(norm(h)));
    const idx2=idx>=0?idx:_imp.headers.findIndex(h=>cands.some(c=>norm(h).includes(c)&&c.length>3));
    _imp.map[f.key]=idx2;
  });
  importRenderMap();
}
function importRenderMap(){
  const {cfg,headers,rows,map}=_imp;
  const opts=i=>headers.map((h,n)=>`<option value="${n}" ${i===n?'selected':''}>${esc(h)}</option>`).join('');
  const sel=cfg.fields.map(f=>`<div class="imp-row">
    <span class="imp-f">${esc(f.label)}${f.required?' <b>*</b>':''}</span>
    <select class="inp" onchange="_imp.map['${f.key}']=+this.value;importPreview()">
      <option value="-1" ${map[f.key]==null||map[f.key]<0?'selected':''}>— eşleştirme —</option>${opts(map[f.key])}</select>
    ${f.hint?`<span class="imp-h">${esc(f.hint)}</span>`:''}</div>`).join('');
  document.getElementById('impBody').innerHTML=`
    <div class="imp-info">${rows.length} satır okundu · ${headers.length} sütun bulundu</div>
    <div class="imp-map">${sel}</div>
    ${cfg.modes?`<div class="field" style="margin-top:12px"><label class="flabel">Mevcut kayıtlar</label>
      <select class="inp" id="impMode">${cfg.modes.map(m=>`<option value="${m[0]}">${m[1]}</option>`).join('')}</select></div>`:''}
    <div id="impPrev"></div>`;
  importPreview();
}
function importMapped(){
  const {cfg,rows,map}=_imp;
  return rows.map(r=>{ const o={};
    cfg.fields.forEach(f=>{ const i=map[f.key];
      let v=(i!=null&&i>=0)?r[i]:'';
      if(v instanceof Date) v=v.toISOString().slice(0,10);
      o[f.key]=typeof v==='string'?v.trim():v; });
    return o; });
}
function importPreview(){
  const {cfg}=_imp; const data=importMapped();
  const eksik=cfg.fields.filter(f=>f.required&&(_imp.map[f.key]==null||_imp.map[f.key]<0));
  const gecerli=data.filter(r=>cfg.fields.filter(f=>f.required).every(f=>String(r[f.key]||'').trim()!==''));
  const el=document.getElementById('impPrev');
  const cols=cfg.fields.slice(0,5);
  el.innerHTML=`${eksik.length?`<div class="imp-warn">Zorunlu alan eşleştirilmedi: ${eksik.map(f=>esc(f.label)).join(', ')}</div>`:''}
    <div class="imp-info">${gecerli.length} satır aktarılacak${data.length-gecerli.length?` · ${data.length-gecerli.length} satır atlanacak (zorunlu alan boş)`:''}</div>
    <div class="imp-prev"><table class="tbl"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${gecerli.slice(0,5).map(r=>`<tr>${cols.map(c=>`<td>${esc(String(r[c.key]||''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  document.getElementById('impGo').disabled = eksik.length>0 || gecerli.length===0;
}
async function importApply(){
  const {cfg}=_imp; const btn=document.getElementById('impGo');
  const data=importMapped().filter(r=>cfg.fields.filter(f=>f.required).every(f=>String(r[f.key]||'').trim()!==''));
  btn.disabled=true; btn.textContent='Aktarılıyor…';
  try{
    const mode=document.getElementById('impMode')?document.getElementById('impMode').value:'';
    const rap=await cfg.onApply(data,mode);
    closeModal(); renderSection();
    mpAlert(rap||'İçe aktarma tamamlandı.');
  }catch(e){
    btn.disabled=false; btn.textContent='İçe Aktar';
    mpAlert('Aktarma hatası: '+(e.message||e));
  }
}



/* ==========================================================
   KATLANABİLİR BÖLÜMLER
   Uzun formlar varsayılan olarak KAPALI gelir; başlığa veya
   sağdaki oka tıklayınca açılır. Kapalıyken de alanlar DOM'da
   durduğu için kaydetme işlemleri etkilenmez.
   ========================================================== */
function grpWrap(box,title){
  if(!title) return;
  const inner=document.createElement('div'); inner.className='grp-b';
  while(box.firstChild) inner.appendChild(box.firstChild);
  const d=document.createElement('details'); d.className='grp';
  const sm=document.createElement('summary');
  sm.innerHTML='<span class="grp-t"></span><i class="chev" aria-hidden="true"></i>';
  sm.querySelector('.grp-t').textContent=title;
  d.appendChild(sm); d.appendChild(inner);
  box.appendChild(d); box.classList.add('is-grp');
}
function collapsify(root,sec){
  if(!root)return;
  /* form blokları */
  root.querySelectorAll('.fld-box:not([data-cx])').forEach(box=>{
    const lab=box.querySelector(':scope > .flabel');
    if(!lab)return;
    box.dataset.cx='1';
    const t=lab.textContent.trim(); lab.remove();
    grpWrap(box,t);
  });
  /* ayar/anasayfa kartları — harita ve grafik içerenler hariç */
  if(sec==='ayarlar'||sec==='anasayfa'){
    root.querySelectorAll('.sec-card:not([data-cx])').forEach(card=>{
      if(card.querySelector('#hMapCanvas,#hubMap,canvas,.chart,.donut'))return;
      const h=card.querySelector(':scope > h3, :scope > h4');
      if(!h)return;
      card.dataset.cx='1';
      const t=h.textContent.trim(); h.remove();
      grpWrap(card,t);
    });
  }
  /* üstte tümünü aç/kapat */
  const n=root.querySelectorAll('details.grp').length;
  if(n>1 && !root.querySelector('.grp-all')){
    const bar=document.createElement('div'); bar.className='grp-all';
    bar.innerHTML=`<button type="button" onclick="grpAll(this,true)">Tümünü aç</button>
      <span>·</span><button type="button" onclick="grpAll(this,false)">Tümünü kapat</button>`;
    const first=root.querySelector('details.grp');
    if(first&&first.parentElement) first.parentElement.parentElement.insertBefore(bar,first.parentElement);
    else root.insertBefore(bar,root.firstChild);
  }
}
function grpAll(btn,open){
  const scope=btn.closest('#mecEd, #altEd, .content')||document;
  scope.querySelectorAll('details.grp, details.lgrp').forEach(d=>{ d.open=open; });
}




/* ---- HEADER MENÜSÜ ---- */
const MNU_TIP=[['sayfa','İçerik sayfası'],['plan','Medya Planlama'],['nerede','Nerelerdeyiz'],['anasayfa','Anasayfa'],
               ['mecra','Lokasyon'],['pdf','PDF katalog'],['url','Serbest bağlantı']];
function mnuInit(st){
  const m=(st.menu&&Array.isArray(st.menu.items))?JSON.parse(JSON.stringify(st.menu)):null;
  ui._mnu = m || {items:(ui._pages||[]).filter(p=>p.in_menu!==false)
    .map(p=>({label:p.title||p.slug,type:'sayfa',value:p.slug,show:true}))};
  if(!ui._mnu.items.length) ui._mnu.items=[{label:'',type:'sayfa',value:'',show:true}];
}
function mnuRender(){
  const box=document.getElementById('mnuBox'); if(!box)return;
  const pages=ui._pages||[], mecs=ui._mecralar||[];
  box.innerHTML=ui._mnu.items.map((it,i)=>`
    <div class="ftr-item">
      <input class="inp" placeholder="Menüde görünecek yazı" value="${esc(it.label)}"
        oninput="ui._mnu.items[${i}].label=this.value">
      <select class="inp" onchange="ui._mnu.items[${i}].type=this.value;ui._mnu.items[${i}].value='';mnuRender()">
        ${MNU_TIP.map(t=>`<option value="${t[0]}" ${(it.type||'sayfa')===t[0]?'selected':''}>${t[1]}</option>`).join('')}
      </select>
      ${it.type==='sayfa'
        ? `<select class="inp" onchange="ui._mnu.items[${i}].value=this.value">
             <option value="">— sayfa seç —</option>${pages.map(p=>`<option value="${esc(p.slug)}" ${it.value===p.slug?'selected':''}>${esc(p.title||p.slug)}</option>`).join('')}</select>`
        : it.type==='mecra'
        ? `<select class="inp" onchange="ui._mnu.items[${i}].value=this.value">
             <option value="">— seç —</option>${mecs.map(m=>`<option value="${m.id}" ${String(it.value)===String(m.id)?'selected':''}>${esc(m.name)}</option>`).join('')}</select>`
        : ['nerede','anasayfa','pdf','plan'].includes(it.type)
        ? `<input class="inp" value="" placeholder="ek bilgi gerekmiyor" disabled>`
        : `<input class="inp" value="${esc(it.value)}" placeholder="https://..." oninput="ui._mnu.items[${i}].value=this.value">`}
      <label class="mini" title="Menüde göster"><input type="checkbox" ${it.show!==false?'checked':''} onchange="ui._mnu.items[${i}].show=this.checked"></label>
      <button class="btn btn-ghost btn-sm" title="Yukarı" onclick="mnuMove(${i},-1)">↑</button>
      <button class="btn btn-ghost btn-sm" title="Aşağı" onclick="mnuMove(${i},1)">↓</button>
      <button class="btn btn-danger btn-sm" title="Sil" onclick="mnuDel(${i})">×</button>
    </div>`).join('')
    + `<button class="btn btn-outline btn-sm" onclick="mnuAdd()">+ Menü öğesi</button>`;
}
function mnuAdd(){ ui._mnu.items.push({label:'',type:'sayfa',value:'',show:true}); mnuRender(); }
function mnuDel(i){ ui._mnu.items.splice(i,1); if(!ui._mnu.items.length)mnuAdd(); else mnuRender(); }
function mnuMove(i,d){ const a=ui._mnu.items, j=i+d; if(j<0||j>=a.length)return; [a[i],a[j]]=[a[j],a[i]]; mnuRender(); }
async function mnuSave(){
  const temiz={items:ui._mnu.items.filter(i=>i.label||(['nerede','anasayfa','pdf','plan'].includes(i.type))||i.value)};
  await api('settings_save',{menu:temiz});
  toast('Menü kaydedildi. Siteyi Ctrl+F5 ile yenileyin.');
}
async function mnuReset(){ if(!await mpConfirm('Menü varsayılana dönsün mü?','Menüyü Sıfırla',{danger:false,ok:'Sıfırla'}))return;
  await api('settings_save',{menu:null}); renderSection(); }

/* ==========================================================
   FOOTER MENÜ DÜZENLEYİCİ
   ========================================================== */
const FTR_TIP=[['sayfa','İçerik sayfası'],['mecra','Mecra'],['harita','Harita sayfası'],
               ['anasayfa','Anasayfa'],['pdf','PDF katalog'],['tel','Telefon'],['url','Serbest bağlantı']];
function ftrInit(st){
  const f=(st.footer&&Array.isArray(st.footer.cols))?JSON.parse(JSON.stringify(st.footer)):null;
  ui._ftr = f || {cols:[
    {title:'SAYFALAR',grid:false,items:(ui._pages||[]).filter(p=>p.in_menu!==false).map(p=>({label:p.title||p.slug,type:'sayfa',value:p.slug}))},
    {title:'MECRALARIMIZ',grid:true,items:(ui._mecralar||[]).map(m=>({label:m.name,type:'mecra',value:String(m.id)}))}
  ],hideContact:false,hideNews:false};
  if(!ui._ftr.cols.length) ui._ftr.cols=[{title:'',grid:false,items:[]}];
}
function ftrRender(){
  const box=document.getElementById('ftrBox'); if(!box)return;
  const pages=ui._pages||[], mecs=ui._mecralar||[];
  box.innerHTML=ui._ftr.cols.map((c,ci)=>`
    <div class="blk">
      <div class="blk-head">
        <input class="inp" style="max-width:230px;font-weight:600" value="${esc(c.title)}"
          placeholder="Sütun başlığı" oninput="ui._ftr.cols[${ci}].title=this.value">
        <div style="display:flex;gap:6px;align-items:center">
          <label class="mini"><input type="checkbox" ${c.grid?'checked':''} onchange="ui._ftr.cols[${ci}].grid=this.checked;ftrRender()"> 2 sütun</label>
          <button class="btn btn-danger btn-sm" onclick="ftrColDel(${ci})">Sütunu sil</button>
        </div>
      </div>
      ${(c.items||[]).map((it,ii)=>`
        <div class="ftr-item">
          <input class="inp" placeholder="Görünecek yazı" value="${esc(it.label)}"
            oninput="ui._ftr.cols[${ci}].items[${ii}].label=this.value">
          <select class="inp" onchange="ui._ftr.cols[${ci}].items[${ii}].type=this.value;ui._ftr.cols[${ci}].items[${ii}].value='';ftrRender()">
            ${FTR_TIP.map(t=>`<option value="${t[0]}" ${(it.type||'url')===t[0]?'selected':''}>${t[1]}</option>`).join('')}
          </select>
          ${it.type==='sayfa'
            ? `<select class="inp" onchange="ui._ftr.cols[${ci}].items[${ii}].value=this.value">
                 <option value="">— seç —</option>${pages.map(p=>`<option value="${esc(p.slug)}" ${it.value===p.slug?'selected':''}>${esc(p.title||p.slug)}</option>`).join('')}</select>`
            : it.type==='mecra'
            ? `<select class="inp" onchange="ui._ftr.cols[${ci}].items[${ii}].value=this.value">
                 <option value="">— seç —</option>${mecs.map(m=>`<option value="${m.id}" ${String(it.value)===String(m.id)?'selected':''}>${esc(m.name)}</option>`).join('')}</select>`
            : ['harita','anasayfa','pdf','tel'].includes(it.type)
            ? `<input class="inp" value="" placeholder="ek bilgi gerekmiyor" disabled>`
            : `<input class="inp" value="${esc(it.value)}" placeholder="https://..." oninput="ui._ftr.cols[${ci}].items[${ii}].value=this.value">`}
          <button class="btn btn-ghost btn-sm" title="Yukarı" onclick="ftrMove(${ci},${ii},-1)">↑</button>
          <button class="btn btn-ghost btn-sm" title="Aşağı" onclick="ftrMove(${ci},${ii},1)">↓</button>
          <button class="btn btn-danger btn-sm" title="Sil" onclick="ftrDel(${ci},${ii})">×</button>
        </div>`).join('')}
      <button class="btn btn-outline btn-sm" onclick="ftrAdd(${ci})">+ Bağlantı</button>
    </div>`).join('')
    + `<button class="btn btn-outline btn-sm" onclick="ftrColAdd()">+ Sütun ekle</button>`;
}
function ftrAdd(ci){ ui._ftr.cols[ci].items.push({label:'',type:'sayfa',value:''}); ftrRender(); }
function ftrDel(ci,ii){ ui._ftr.cols[ci].items.splice(ii,1); ftrRender(); }
function ftrMove(ci,ii,d){ const a=ui._ftr.cols[ci].items, j=ii+d; if(j<0||j>=a.length)return;
  [a[ii],a[j]]=[a[j],a[ii]]; ftrRender(); }
function ftrColAdd(){ if(ui._ftr.cols.length>=4){mpAlert('En fazla 4 sütun eklenebilir.');return;}
  ui._ftr.cols.push({title:'YENİ SÜTUN',grid:false,items:[]}); ftrRender(); }
async function ftrColDel(ci){ if(!await mpConfirm('Bu sütun silinsin mi?','Sütunu Sil'))return; ui._ftr.cols.splice(ci,1);
  if(!ui._ftr.cols.length)ui._ftr.cols=[{title:'',grid:false,items:[]}]; ftrRender(); }
async function ftrSave(){
  ui._ftr.hideContact=document.getElementById('ftrHideC').checked;
  ui._ftr.hideNews=document.getElementById('ftrHideN').checked;
  const temiz={...ui._ftr, cols:ui._ftr.cols
    .map(c=>({...c,items:(c.items||[]).filter(i=>i.type&&(['harita','anasayfa','pdf','tel'].includes(i.type)||i.value))}))
    .filter(c=>c.title||c.items.length)};
  await api('settings_save',{footer:temiz});
  toast('Footer menüsü kaydedildi. Siteyi Ctrl+F5 ile yenileyin.');
}
async function ftrReset(){ if(!await mpConfirm('Footer menüsü varsayılana dönsün mü?','Footer Sıfırla',{danger:false,ok:'Sıfırla'}))return;
  await api('settings_save',{footer:null}); renderSection(); }

/* ==========================================================
   RAPORLAR
   ========================================================== */
/* Canonical Work phase etiketleri (D-206). Legacy anahtarlar geçiş
   süresince okunabilir kalsın diye korunur. */
const JOBLBL={...FAZ_ETIKET,
  tasarim:'Tasarım (eski)',yayin:'Yayın (eski)',arsiv:'Arşiv (eski)'};
function haftaAraligi(off){
  const d=new Date(); const g=(d.getDay()+6)%7;           /* pazartesi = 0 */
  const bas=new Date(d.getFullYear(),d.getMonth(),d.getDate()-g+(off||0)*7);
  const bit=new Date(bas); bit.setDate(bas.getDate()+6);
  /* S5: YEREL gun. `toISOString()` TR'de pazartesi 00:00-03:00 arasi haftayi
     bir onceki haftaya, ay preset'ini ise gun boyu bir gun geriye kaydiriyordu. */
  return [_cIso(bas),_cIso(bit)];
}

/* ============ RAPORLAR (Sprint 5) ====================================
   Raporlar ikinci bir veri sistemi DEGILDIR. Her rapor kanonik kayitlarin
   bir PROJEKSIYONUDUR; rapora ozel tablo / elle tutulan durum YOK.

   Tek kural: BIR RAPOR = BIR VERI KUMESI URETICISI.
     rapBaglam(b,e)          -> kanonik kayitlar tek turda okunur
     RAPOR[i].satirlar(ctx)  -> normalize satirlar
       ├─ rapOnizle()        -> ayni satirlar, ayni sutun `get`leri
       └─ rapUret()          -> ayni satirlar, ayni sutun `get`leri
   Onizleme ile Excel ayri sorgu ya da ayri alan turetimi KULLANMAZ.

   Uc zaman kavrami ayri tutulur (S2 §5):
     is donemi   -> satirin kendi tarih sutunlari + Bilgi'deki aralik
     okunma ani  -> ctx.okunma (rapBaglam'in veriyi cektigi an)
     uretim ani  -> Bilgi sayfasi + dosya adi
   Dosya adindaki tarih asla is donemi yerine okunmaz. */

/* Yerel gun sinirlari -> timestamptz filtresi. [b 00:00, e+1 00:00) */
function rapSinir(b,e){
  const bas=new Date(b+'T00:00:00'); const son=new Date(e+'T00:00:00'); son.setDate(son.getDate()+1);
  return [bas.toISOString(), son.toISOString()];
}
/* PostgREST yaniti `max_rows` (1000) ile SESSIZCE kesilir. Rapor eksik
   veriyle "tamam" gorunmemeli: sayfa sayfa sonuna kadar okunur.
   S5.1: Panelim'in toplu okumalari (entry_relevance_all,
   work_followers_all) da bunu kullanir. `kur()` KARARLI bir siralama
   (benzersiz anahtarla biten) vermelidir, yoksa sayfa sinirinda satir
   kayar. Sayfa boyu sunucu tavanina esittir: daha buyuk secilirse
   ilk sayfa kisa gelir ve dongu erken biterdi. */
async function rapHepsi(kur){
  const out=[]; const N=1000;
  for(let i=0;i<200;i++){
    const {data,error}=await kur().range(i*N,i*N+N-1);
    if(error) throw error;
    out.push(...(data||[]));
    if(!data||data.length<N) break;
  }
  return out;
}
const RAP_AY=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
const rapTr=iso=>{ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m?`${m[3]}.${m[2]}.${m[1]}`:''; };
/* timestamptz -> yerel 'YYYY-MM-DD' */
const rapGun=ts=>ts?_cIso(new Date(ts)):'';
const RAP_MUH={yok:'Yok',hazir:'Hazır',gonderildi:'Gönderildi',islendi:'İşlendi'};
const RAP_TEKLIF={yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'};
/* Calisan icin iki kategori: Aktif / Arsiv. `bekliyor` saklanan deger
   olarak kalir, raporda Aktif'in ikincil baglamidir. */
const rapYasam=j=>(j&&j.lifecycle_status==='kapandi')?'Arşiv':'Aktif';
const rapBekliyor=j=>(j&&j.lifecycle_status==='bekliyor')?'Bekliyor':'';
/* Operasyon: gunluk UI kapsami + AYRINTI kaybolmaz. */
const rapOpKapsam=s=>s==='done'?'Tamamlandı':s==='cancelled'?'İptal':'Aktif';
const RAP_LED_NOT='LED kısa dönem/yayın rotasyonlarının tamamı V0 aylık doluluk modelinde temsil edilmeyebilir.';

async function rapBaglam(b,e){
  const [ts0,ts1]=rapSinir(b,e);
  /* Ay listesi: araligin kapsadigi aylar (yerel). */
  const aylar=[]; { const d=new Date(+b.slice(0,4),+b.slice(5,7)-1,1); const son=e.slice(0,7);
    for(let i=0;i<60;i++){ const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      aylar.push(ym); if(ym>=son)break; d.setMonth(d.getMonth()+1); } }
  const [jobs,cust,team,cts,fol,rel,aksiyon,sonGunc,ops,mec,alt,uni,prod,book,teklif]=await Promise.all([
    rapHepsi(()=>sb.from('jobs').select('*').order('id')),
    rapHepsi(()=>sb.from('customers').select('id,firma').order('id')),
    api('team_list'),
    rapHepsi(()=>sb.from('contacts').select('id,name').order('id')),
    rapHepsi(()=>sb.from('work_followers').select('job_id,team_id').order('job_id').order('team_id')),
    rapHepsi(()=>sb.from('entry_relevance').select('entry_id,team_id').order('entry_id').order('team_id')),
    /* Aksiyon Plani: TARIHLI insan Entry'leri. Sistem hareketi YOK,
       tarihsiz duz guncelleme YOK, kisisel etkinlik (ayri tablo) YOK. */
    rapHepsi(()=>sb.from('entries').select('id,job_id,customer_id,contact_id,body,action_status,assignee_id,due_at,is_urgent,created_by_team_id')
      .neq('source','system').not('due_at','is',null).gte('due_at',ts0).lt('due_at',ts1)
      .order('due_at').order('id')),
    /* Is Takibi "son guncelleme": yalniz INSAN yazimi, en yeni once. */
    rapHepsi(()=>sb.from('entries').select('id,job_id,body,occurred_at').neq('source','system')
      .not('job_id','is',null).order('occurred_at',{ascending:false}).order('id',{ascending:false})),
    rapHepsi(()=>sb.from('work_operations').select('*').gte('planned_date',b).lte('planned_date',e)
      .order('planned_date').order('id')),
    rapHepsi(()=>sb.from('mecralar').select('id,name,sort').order('sort').order('id')),
    rapHepsi(()=>sb.from('alt_mecralar').select('id,name,mecra_id,product_id,occupancy_mode,creative_seconds,sort').order('id')),
    rapHepsi(()=>sb.from('units').select('id,name,mecra_id,alt_mecra_id,product_id,active,sort').order('sort').order('id')),
    rapHepsi(()=>sb.from('products').select('id,name').order('id')),
    /* S8: doluluk kaynağı TEK normalleştirilmiş yüzey (kesin yerleşim +
       hâlâ geçerli eski kayıt). Ekran ve dışa aktarımla AYNI üretici. */
    rapHepsi(()=>sb.from('media_schedule').select('*').neq('commitment','cancelled')
      .or(`block_end.is.null,block_end.gte.${b}`).lte('block_start',e)
      .order('block_start').order('placement_id',{nullsFirst:false}).order('booking_id',{nullsFirst:false})),
    rapHepsi(()=>sb.from('quotes').select('id,customer_id,customer_name,firma,telefon,eposta,total,status,created_at,kaynak,gecerlilik,work_id,revision_no')
      .gte('created_at',ts0).lt('created_at',ts1).order('created_at').order('id'))
  ]);
  const idx=(arr,f)=>{ const m={}; (arr||[]).forEach(x=>m[x.id]=f?f(x):x); return m; };
  const grup=(arr,k,v)=>{ const m={}; (arr||[]).forEach(x=>(m[x[k]]=m[x[k]]||[]).push(v(x))); return m; };
  const son={}; sonGunc.forEach(x=>{ if(!son[x.job_id]) son[x.job_id]=x; });
  return {b,e,aylar,okunma:new Date(),
    jobs, jm:idx(jobs), cm:idx(cust,x=>x.firma||''), tm:idx(team||[],x=>x.name||''),
    km:idx(cts,x=>x.name||''), folJ:grup(fol,'job_id',x=>x.team_id), relE:grup(rel,'entry_id',x=>x.team_id),
    aksiyon, sonGunc:son, ops, mec, am:idx(alt), mm:idx(mec), uni, um:idx(uni), pm:idx(prod,x=>x.name||''),
    book, teklif, medya:mdModel({mecs:mec,alts:alt,units:uni,prods:prod,recs:book})};
}
const rapAdlar=(tm,ids)=>[...new Set((ids||[]).filter(Boolean))].map(id=>tm[id]).filter(Boolean)
  .sort((a,b)=>a.localeCompare(b,'tr')).join(', ');

/* ---- Rapor tanimlari. Sutun `get`leri onizleme VE Excel icin ORTAK. ---- */
const RAPOR=[
 {id:'aksiyon', ad:'Aksiyon Planı', sayfa:'Aksiyon Planı', dosya:'Aksiyon_Plani', varsayilan:1, donemli:true,
  aciklama:'Son tarihi seçilen aralıkta olan güncellemeler — acil ve gecikenler öne çıkar',
  kapsam:'Son tarihi aralıkta olan insan güncellemeleri. Sistem hareketleri, tarihsiz güncellemeler, iptal edilenler ve kişisel etkinlikler dahil değildir.',
  satirlar:c=>{
    const bugun=_cIso(new Date());
    return c.aksiyon.filter(x=>x.action_status!=='cancelled').map(x=>{
      const j=c.jm[x.job_id]||null; const gun=rapGun(x.due_at);
      const kapali=x.action_status==='done';
      const fark=Math.round((new Date(bugun+'T00:00:00')-new Date(gun+'T00:00:00'))/864e5);
      /* Mevcut deterministik tanim: gun gecmeden gecikme yok (gecikti()). */
      const gec=kapali?'Tamamlandı':fark>0?`${fark} gün gecikti`:fark===0?'Bugün':'';
      /* Bir Entry = bir satir. Ilgili = etiketlenenler; eski `assignee_id`
         varsa ayni kumeye katilir ama ayri "Sorumlu" kavrami DONDURMEZ. */
      const ilgili=rapAdlar(c.tm,[...(c.relE[x.id]||[]),x.assignee_id]);
      return {gun,gec,acil:!!x.is_urgent,metin:x.body||'',ilgili,
        is:j?j.title||'':'', kurum:c.cm[j?j.customer_id:x.customer_id]||'',
        asama:j?(FAZ_ETIKET[j.status]||JOBLBL[j.status]||j.status||''):'',
        durum:j?[rapYasam(j),rapBekliyor(j)].filter(Boolean).join(' · '):'',
        kisi:c.km[x.contact_id]||'', yazan:c.tm[x.created_by_team_id]||''};
    }).sort((p,q)=>p.gun.localeCompare(q.gun)||(q.acil-p.acil));
  },
  cols:[{key:'gun',label:'Son tarih',w:12,tip:'tarih'},{key:'gec',label:'Gecikme',w:14},
    {label:'Acil',w:7,get:r=>r.acil?'Acil':''},{key:'metin',label:'Güncelleme',w:56},
    {key:'ilgili',label:'İlgili',w:26},{key:'is',label:'İş',w:32},{key:'kurum',label:'Kurum',w:30},
    {key:'asama',label:'Aşama',w:10},{key:'durum',label:'İş durumu',w:16},{key:'kisi',label:'Kişi',w:18},
    {key:'yazan',label:'Yazan',w:16}]},

 {id:'is', ad:'İş Takibi', sayfa:'İş Takibi', dosya:'Is_Takibi', varsayilan:1, donemli:false,
  aciklama:'Şirketin iş tablosu: aktif işler önce, arşiv sonra — tarih aralığından bağımsız',
  kapsam:'Tüm işler (aktif + arşiv). "Son güncelleme" yalnız insan yazımı güncellemedir.',
  satirlar:c=>{
    const FS=Object.fromEntries(FAZ_SIRA.map((k,i)=>[k,i]));
    return c.jobs.map(j=>{ const sg=c.sonGunc[j.id];
      return {j, ilgili:rapAdlar(c.tm,c.folJ[j.id]), kurum:c.cm[j.customer_id]||'', is:j.title||'',
        asama:FAZ_ETIKET[j.status]||JOBLBL[j.status]||j.status||'', durum:rapYasam(j), bek:rapBekliyor(j),
        acil:!!j.is_urgent, son:sg?sg.body||'':'', sonTarih:sg?rapGun(sg.occurred_at):'',
        kisi:c.km[j.primary_contact_id]||'', muh:RAP_MUH[j.accounting_status||'yok']||j.accounting_status||''};
    }).sort((p,q)=>(p.durum==='Arşiv')-(q.durum==='Arşiv')||(q.acil-p.acil)
      ||((FS[p.j.status]??9)-(FS[q.j.status]??9))||p.is.localeCompare(q.is,'tr'));
  },
  cols:[{key:'ilgili',label:'İlgili',w:24},{key:'kurum',label:'Kurum',w:30},{key:'is',label:'İş',w:36},
    {key:'asama',label:'Aşama',w:10},{key:'durum',label:'Durum',w:9},{key:'bek',label:'Bekliyor',w:10},
    {label:'Acil',w:7,get:r=>r.acil?'Acil':''},{key:'son',label:'Son güncelleme',w:56},
    {key:'sonTarih',label:'Son güncelleme tarihi',w:14,tip:'tarih'},{key:'kisi',label:'Kişi',w:18},
    {key:'muh',label:'Muhasebe',w:12}]},

 {id:'op', ad:'Baskı & Montaj', sayfa:'Baskı & Montaj', dosya:'Baski_Montaj', varsayilan:1, donemli:true,
  aciklama:'Planlanan tarihi seçilen aralıkta olan baskı, montaj ve söküm kayıtları',
  kapsam:'Planlanan tarihi aralıkta olan operasyonlar. Tarihi girilmemiş operasyonlar bu aralığa girmez.',
  satirlar:c=>c.ops.map(o=>{ const j=c.jm[o.job_id]||{}; const u=c.um[o.unit_id]||null;
    const m=u?(c.mm[(c.am[u.alt_mecra_id]||{}).mecra_id||u.mecra_id]||{}):{};
    return {tarih:o.planned_date||'', tur:opTypeLbl(o.operation_type), kurum:c.cm[j.customer_id]||'', is:j.title||'',
      aciklama:o.description||'', adet:o.quantity, olcu:o.dimensions||'',
      poz:u?[m.name,u.name].filter(Boolean).join(' · '):'', yer:o.location_text||'',
      uygulayan:c.cm[o.supplier_org_id]||'', kapsam:rapOpKapsam(o.status), durum:opStatLbl(o.status),
      bitti:o.completed_at?rapGun(o.completed_at):'', maliyet:o.cost, not:o.note||''}; }),
  cols:[{key:'tarih',label:'Tarih',w:12,tip:'tarih'},{key:'tur',label:'Tür',w:9},{key:'kurum',label:'Kurum',w:26},
    {key:'is',label:'İş',w:30},{key:'aciklama',label:'Açıklama / Ürün',w:32},{key:'adet',label:'Adet',w:7,tip:'sayi'},
    {key:'olcu',label:'Ölçü',w:12},{key:'poz',label:'Pozisyon / Mecra',w:22},{key:'yer',label:'Yer',w:22},
    {key:'uygulayan',label:'Uygulayan',w:22},{key:'kapsam',label:'Durum',w:11},{key:'durum',label:'Durum ayrıntısı',w:14},
    {key:'bitti',label:'Tamamlanma',w:12,tip:'tarih'},{key:'maliyet',label:'Maliyet',w:11,tip:'sayi'},{key:'not',label:'Not',w:36}]},

 {id:'dol', ad:'Mecra Doluluk Detayı', sayfa:'Doluluk Detayı', dosya:'Doluluk_Detay', varsayilan:1, donemli:true,
  aciklama:'Aralığın kapsadığı her ay için statik yüz durumu ve LED kampanyaları; kurum, iş, gerçek dönem ve kesinlik',
  kapsam:'Aylık PROJEKSİYON: ay hücresi bir iş kaydı değildir. Gerçek dönem ve kesinlik ayrı sütunlardadır; ay bazlı eski kayda gün uydurulmaz. LED eşzamanlı yayındır: her satır bir kampanyadır, "dolu" değildir.',
  /* S8: Doluluk ekranının dışa aktarımıyla AYNI üretici (mdAylikSatirlar). */
  satirlar:c=>mdAylikSatirlar(c.medya,c.aylar).map(r=>({...r,
    ay:`${RAP_AY[+r.ay.slice(5,7)-1]} ${r.ay.slice(0,4)}`})),
  cols:[{key:'mecra',label:'Mecra',w:22},{key:'alan',label:'Alan',w:22},{key:'poz',label:'Pozisyon',w:11},
    {key:'yuzey',label:'Yüz',w:6},{key:'tur',label:'Mecra türü',w:14},{key:'davranis',label:'Davranış',w:20},
    {key:'ay',label:'Ay',w:10},{key:'durum',label:'Durum',w:10},{key:'kurum',label:'Kurum',w:28},{key:'is',label:'İş',w:28},
    {key:'donem',label:'Gerçek dönem',w:24},{key:'kesinlik',label:'Kesinlik',w:26},{key:'bosalma',label:'Boşalma (statik)',w:16},
    {key:'sure',label:'Kreatif süre',w:10},{key:'kaynak',label:'Kaynak ifade / şerit',w:22},{key:'not',label:'Not',w:28}]},

 {id:'ozet', ad:'Doluluk Özeti', sayfa:'Doluluk Özeti', dosya:'Doluluk_Ozet', varsayilan:1, donemli:true,
  aciklama:'Mecra bazında statik yüzlerin dolu / opsiyon / boş ay sayısı ve doluluk oranı',
  kapsam:'Yalnız STATİK (münhasır) yüzler, yüz × ay sayımı. LED eşzamanlı yayın olduğundan doluluk oranına katılmaz. Doluluk = (dolu + opsiyon) / (dolu + opsiyon + boş).',
  /* Ozet, Detay'in AYNI satirlarindan sayilir: iki rapor asla celismez. */
  satirlar:c=>{ const o={};
    RAPOR.find(r=>r.id==='dol').satirlar(c).filter(r=>r.statik).forEach(r=>{
      const x=o[r.mecra]=o[r.mecra]||{mecra:r.mecra||'—',pozSet:new Set(),dolu:0,rez:0,bos:0};
      x.pozSet.add(r.alan+'|'+r.poz+'|'+r.yuzey);
      if(r.durum==='Yayın'||r.durum==='Dolu')x.dolu++; else if(r.durum==='Opsiyon')x.rez++; else if(r.durum==='Müsait'||r.durum==='Boş')x.bos++; });
    const sira=Object.fromEntries(c.mec.map((m,i)=>[m.name,i]));
    return Object.values(o).map(x=>{ const t=x.dolu+x.rez+x.bos;
      return {mecra:x.mecra,poz:x.pozSet.size,dolu:x.dolu,rez:x.rez,bos:x.bos,toplam:t,
        oran:t?Math.round((x.dolu+x.rez)*100/t):0}; })
      .sort((p,q)=>(sira[p.mecra]??99)-(sira[q.mecra]??99)); },
  cols:[{key:'mecra',label:'Mecra',w:26},{key:'poz',label:'Yüz',w:10,tip:'sayi'},{key:'dolu',label:'Dolu (ay)',w:10,tip:'sayi'},
    {key:'rez',label:'Opsiyon (ay)',w:12,tip:'sayi'},{key:'bos',label:'Boş (ay)',w:10,tip:'sayi'},
    {key:'toplam',label:'Toplam (ay)',w:11,tip:'sayi'},
    {label:'Doluluk',w:10,get:r=>r.oran+'%'}]},

 {id:'teklif', ad:'Teklifler', sayfa:'Teklifler', dosya:'Teklifler', varsayilan:0, donemli:true,
  aciklama:'Seçilen aralıkta oluşturulan teklifler; kurum, bağlı iş, durum ve tutar',
  kapsam:'Oluşturulma tarihi aralıkta olan teklifler. Kurum ve iş yalnız AÇIK bağlantıdan okunur; isim benzerliğiyle eşleştirme yapılmaz.',
  satirlar:c=>c.teklif.map(q=>({no:'#'+q.id+(q.revision_no>1?` (rev ${q.revision_no})`:''), tarih:rapGun(q.created_at),
    kurum:q.customer_id&&c.cm[q.customer_id]?c.cm[q.customer_id]:'', firmaForm:q.firma||'',
    talepEden:q.customer_name||'', is:q.work_id&&c.jm[q.work_id]?c.jm[q.work_id].title||'':'',
    durum:RAP_TEKLIF[q.status]||q.status||'Yeni', tutar:q.total, gecerlilik:q.gecerlilik||'',
    kaynak:q.kaynak||'', tel:q.telefon||'', mail:q.eposta||''})),
  cols:[{key:'no',label:'Teklif',w:10},{key:'tarih',label:'Tarih',w:12,tip:'tarih'},{key:'kurum',label:'Kurum (bağlı)',w:28},
    {key:'firmaForm',label:'Firma (talepte yazılan)',w:24},{key:'talepEden',label:'Talep eden',w:20},{key:'is',label:'İş',w:30},
    {key:'durum',label:'Durum',w:11},{key:'tutar',label:'Tutar',w:12,tip:'sayi'},{key:'gecerlilik',label:'Geçerlilik',w:12,tip:'tarih'},
    {key:'kaynak',label:'Kaynak',w:12},{key:'tel',label:'Telefon',w:15},{key:'mail',label:'E-posta',w:24}]}
];

/* S12: eski S5 çoklu Excel sayfası. Raporlar girişinde "Hızlı Excel
   tabloları" altında ikincil olarak yaşar (iş takibi, aksiyon planı,
   teklifler, aylık doluluk). Yeni biçimli raporlar assets/rapor.js'te. */
async function raporTablolari(c){
  const [b,e]=haftaAraligi(0);
  c.innerHTML=`<div class="sec-head">
      <div><h3>Raporlar</h3><p class="sub">Uygulamadaki kayıtların seçtiğiniz dönem için anlık görüntüsü — önizleyin, Excel'e aktarın</p></div></div>

    <div class="sec-card">
      <label class="flabel" style="font-weight:700">İş dönemi</label>
      <div class="row2" style="max-width:460px">
        <div class="field"><label class="flabel" for="rb">Başlangıç</label><input class="inp" type="date" id="rb" value="${b}" onchange="rapDonemCiz()"></div>
        <div class="field"><label class="flabel" for="re">Bitiş</label><input class="inp" type="date" id="re" value="${e}" onchange="rapDonemCiz()"></div>
      </div>
      <div class="rp-quick">
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(0)">Bu hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(1)">Gelecek hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(-1)">Geçen hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapAy()">Bu ay</button>
        <button class="btn btn-ghost btn-sm" onclick="rapAy(1)">Gelecek ay</button>
      </div>
      <p class="rp-donem" id="rpDonem" aria-live="polite"></p>
    </div>

    <div class="sec-card">
      <label class="flabel" style="font-weight:700">Raporlar</label>
      <div class="rp-list">
        ${RAPOR.map(r=>`<label class="rp-item"><input type="checkbox" id="r_${r.id}" ${r.varsayilan?'checked':''}>
            <span><b>${esc(r.ad)}</b><em>${esc(r.aciklama)}</em></span></label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-outline btn-sm" onclick="rapOnizle()">Önizleme</button>
        <button class="btn btn-primary btn-sm" onclick="rapUret()">${ic('download',15)} Excel'e Aktar</button>
      </div>
      <div id="rapOut"></div>
    </div>`;
  rapDonemCiz();
}
function rapDonemCiz(){ const el=document.getElementById('rpDonem'); if(!el) return;
  const b=gv('rb'), e=gv('re');
  el.innerHTML=b&&e?`<b>İş dönemi:</b> ${esc(rapTr(b))} – ${esc(rapTr(e))}`:'İş dönemi seçilmedi.'; }
function rapHafta(o){ const [b,e]=haftaAraligi(o);
  document.getElementById('rb').value=b; document.getElementById('re').value=e; rapDonemCiz(); }
function rapAy(o){ const d=new Date(); const m=d.getMonth()+(o||0);
  const b=new Date(d.getFullYear(),m,1), e=new Date(d.getFullYear(),m+1,0);
  document.getElementById('rb').value=_cIso(b); document.getElementById('re').value=_cIso(e); rapDonemCiz(); }

/* Tek veri yolu: aralik dogrula -> baglam oku -> secili raporlarin satirlari. */
async function rapHazirla(){
  const b=gv('rb'), e=gv('re');
  if(!b||!e){ mpAlert('Tarih aralığı seçin.'); return null; }
  if(b>e){ mpAlert('Başlangıç tarihi bitişten sonra olamaz.'); return null; }
  const secili=RAPOR.filter(r=>(document.getElementById('r_'+r.id)||{}).checked);
  if(!secili.length) return {b,e,S:[]};
  const ctx=await rapBaglam(b,e);
  const S=secili.map(r=>({r, rows:r.satirlar(ctx)}));
  ui._rapSon={b,e,S,okunma:ctx.okunma};   /* QA/kanit icin: son onizleme/aktarim verisi */
  return {b,e,ctx,S};
}
function rapHucre(col,row){
  const v=typeof col.get==='function'?col.get(row):row[col.key];
  if(v===null||v===undefined) return '';
  if(col.tip==='tarih') return rapTr(v);
  if(col.tip==='sayi'&&v!==''&&Number.isFinite(Number(v))) return Number(v).toLocaleString('tr-TR');
  return String(v);
}
const RAP_ONIZLE_SATIR=10;
const rapLedVar=S=>S.some(x=>x.r.id==='dol'&&x.rows.some(r=>r.led));
async function rapOnizle(){
  const out=document.getElementById('rapOut'); out.innerHTML='<p class="muted" style="margin-top:14px">Hazırlanıyor…</p>';
  let d; try{ d=await rapHazirla(); }catch(err){ out.innerHTML=`<div class="imp-warn" style="margin-top:14px">Rapor okunamadı: ${esc(err.message||err)}</div>`; return; }
  if(!d){ out.innerHTML=''; return; }
  if(!d.S.length){ out.innerHTML='<div class="banner" style="margin-top:14px">En az bir rapor seçin.</div>'; return; }
  out.innerHTML=`<div class="rp-prev">
    <div class="rp-prev-h"><b>İş dönemi: ${esc(rapTr(d.b))} – ${esc(rapTr(d.e))}</b>
      <span>Veri okunma: ${esc(d.ctx.okunma.toLocaleString('tr-TR'))}</span></div>
    ${d.S.map(({r,rows})=>`<section class="rp-sec">
      <div class="rp-line"><b>${esc(r.ad)}</b><span>${rows.length} satır</span></div>
      <p class="rp-kapsam">${r.donemli?'':'<b>Tarih aralığından bağımsız.</b> '}${esc(r.kapsam)}</p>
      ${r.id==='dol'&&rapLedVar(d.S)?`<p class="rp-kapsam">${esc(RAP_LED_NOT)}</p>`:''}
      ${rows.length?`<div class="tbl-wrap rp-tbl"><table class="tbl"><thead><tr>${r.cols.map(cl=>`<th>${esc(cl.label)}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0,RAP_ONIZLE_SATIR).map(row=>`<tr>${r.cols.map(cl=>`<td>${esc(rapHucre(cl,row))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        ${rows.length>RAP_ONIZLE_SATIR?`<p class="rp-kapsam">İlk ${RAP_ONIZLE_SATIR} satır gösteriliyor; Excel'de ${rows.length} satırın tamamı var.</p>`:''}`
        :'<p class="empty" style="margin:6px 0 0">Bu dönemde kayıt yok.</p>'}
    </section>`).join('')}</div>`;
}
/* Calisma kitabi olusturma - dosyaya yazmadan. QA ayni kitabi okuyabilsin
   diye rapUret'ten ayri. */
function rapKitap(d){
  /* Veri sayfalari ONCE, Bilgi SONRA (ice aktarim ilk sayfayi okur).
     Bos rapor da sayfa olarak yazilir: "bu donemde kayit yok" bir bilgidir,
     sayfanin sessizce kaybolmasi degil. */
  const wb=XLSX.utils.book_new();
  d.S.forEach(({r,rows})=>XLSX.utils.book_append_sheet(wb,exportVeriSayfasi(r.cols,rows),r.sayfa.slice(0,31)));
  const meta=[['Raporlar', d.S.map(x=>x.r.ad).join(', ')],
    ['İş dönemi', `${rapTr(d.b)} – ${rapTr(d.e)}`], []];
  d.S.forEach(({r,rows})=>{ meta.push([r.ad, `${rows.length} satır`]);
    meta.push(['', (r.donemli?'':'Tarih aralığından bağımsız. ')+r.kapsam]); });
  if(rapLedVar(d.S)){ meta.push([]); meta.push(['LED', RAP_LED_NOT]); }
  /* Dosya adi: tek rapor -> rapor adi; donemsiz tek rapor -> uretim gunu;
     aksi halde is donemi. Tarih daima baglamiyla - ve Bilgi o tarihin
     NE oldugunu acikca yazar. */
  const tek=d.S.length===1?d.S[0].r:null;
  const uretimGunlu=!!(tek&&!tek.donemli);
  const ad=uretimGunlu ? exportDosyaAdi('Medyapark',tek.dosya,_dt())
    : exportDosyaAdi('Medyapark', tek?tek.dosya:'Rapor', d.b, d.e);
  XLSX.utils.book_append_sheet(wb,exportMetaSheet('Medyapark Raporları',null,meta,d.ctx.okunma,
    uretimGunlu?'Dosya adındaki tarih dışa aktarım günüdür; iş dönemi değildir.'
               :'Dosya adındaki tarih aralığı iş dönemidir; dosyanın üretildiği gün değildir.'),'Bilgi');
  return {wb, ad:ad+'.xlsx'};
}
async function rapUret(){
  const out=document.getElementById('rapOut'); out.innerHTML='<p class="muted" style="margin-top:14px">Rapor hazırlanıyor…</p>';
  let d; try{ d=await rapHazirla(); }catch(err){ out.innerHTML=`<div class="imp-warn" style="margin-top:14px">Rapor okunamadı: ${esc(err.message||err)}</div>`; return; }
  if(!d){ out.innerHTML=''; return; }
  if(!d.S.length){ out.innerHTML='<div class="banner" style="margin-top:14px">En az bir rapor seçin.</div>'; return; }
  try{ await xlsxLoad(); }catch(err){ mpAlert(err.message); out.innerHTML=''; return; }
  const {wb,ad}=rapKitap(d);
  XLSX.writeFile(wb, ad);
  const toplam=d.S.reduce((t,x)=>t+x.rows.length,0);
  out.innerHTML=`<div class="imp-info" style="margin-top:14px">İndirildi: <b>${esc(ad)}</b> · ${d.S.length} rapor, ${toplam} satır</div>`;
  return ad;
}

/* ---------- ANASAYFA ---------- */
const URUN_IKONLAR=[['billboard','Billboard / Megalight'],['raket','Raket / CLP'],['led','LED Ekran'],
  ['durak','Akıllı Durak'],['megaboard','Megaboard'],['duvar','Duvar / Cephe'],['totem','Totem'],['diger','Diğer']];
async function anasayfaBolum(c){
  const st=await api('settings_get'); ui._settings=st;
  const H=st.home||{};
  const g=H.grid||{}, m=H.map||{}, se=H.search||{}, ka=H.katalog||{}, sa=H.stats||{}, nd=H.nerede||{};
  const sayac=i=>{ const x=(sa.items||[])[i]||{};
    return `<div class="row2" style="margin-bottom:8px">
      <input class="inp" id="hn${i}" value="${esc(x.n)}" placeholder="Sayı — ör. 250+">
      <input class="inp" id="hl${i}" value="${esc(x.label)}" placeholder="Etiket — ör. Reklam Alanı"></div>`; };
  c.innerHTML=`<div class="sec-head">
      <div><h3>Anasayfa</h3><p class="sub">Ziyaretçinin ilk gördüğü ekranı buradan yönetin</p></div>
      <button class="btn btn-primary btn-sm" onclick="hmSave()">Kaydet</button></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Harita</label>
      <label class="switch" style="margin-bottom:12px"><input type="checkbox" id="hmap" ${m.enabled!==false?'checked':''}><span class="sl"></span><span class="txt">Anasayfada haritayı göster</span></label>
      <div class="row2">
        <div class="field"><label class="flabel">Yükseklik (piksel)</label><input class="inp" type="number" id="hmh" value="${esc(m.height||800)}" min="300" max="1200"></div>
        <div class="field"><label class="flabel">Altyapı</label>
          <select class="inp" id="hmeng">
            <option value="auto" ${(m.engine||'auto')==='auto'?'selected':''}>Google Maps (anahtar varsa)</option>
            <option value="osm" ${m.engine==='osm'?'selected':''}>OpenStreetMap (kota harcamaz)</option>
          </select></div></div>
      <p class="muted" style="font-size:12px;margin:0">Anasayfa en çok açılan sayfadır; Google seçilirse her ziyaret kotadan düşer. Kota dolarsa otomatik OpenStreetMap'e döner.</p></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Arama kartı (haritanın alt kenarında)</label>
      <div class="field"><label class="flabel">Üstteki adımlar</label><input class="inp" id="hsad" value="${esc(se.adimlar||'Alanı Seç - Sepete Ekle - Teklif Al')}" placeholder="Alanı Seç - Sepete Ekle - Teklif Al">
        <p class="muted" style="font-size:11.5px;margin:5px 0 0">Tire ile ayırın; her parça bir adım olarak görünür.</p></div>
      <div class="field"><label class="flabel">Arama kutusu ipucu</label><input class="inp" id="hsp" value="${esc(se.placeholder||'')}" placeholder="Ürün, Lokasyon, Pozisyon"></div>
      <p class="muted" style="font-size:12px;margin:0">Filtre düğmeleri ürünlerden otomatik oluşur; ikonlarını <b>Ürünler</b> bölümünden seçin.</p></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Sayaç</label>
      <div class="field"><label class="flabel">Üst etiket</label><input class="inp" id="hse" value="${esc(sa.eyebrow)}" placeholder="RAKAMLARLA MEDYAPARK"></div>
      ${[0,1,2,3].map(sayac).join('')}
      <div class="field"><label class="flabel">Açıklama (opsiyonel)</label><textarea class="inp" id="hsd">${esc(sa.alt)}</textarea></div></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Kart bölümü</label>
      <div class="field"><label class="flabel">Başlık</label><input class="inp" id="hkb" value="${esc(ka.baslik)}" placeholder="Adana'nın En Stratejik Noktalarında Markanızı Konumlandırın"></div>
      <div class="field"><label class="flabel">Alt metin</label><textarea class="inp" id="hka">${esc(ka.alt)}</textarea></div>
      <div class="row2">
        <div class="field"><label class="flabel">Sütun sayısı</label>
          <select class="inp" id="hgc">${[2,3,4].map(n=>`<option value="${n}" ${(+g.cols||3)===n?'selected':''}>${n} sütun</option>`).join('')}</select></div>
        <div class="field"><label class="flabel">Satır sayısı</label>
          <select class="inp" id="hgr">${[1,2,3,4].map(n=>`<option value="${n}" ${(+g.rows||2)===n?'selected':''}>${n} satır</option>`).join('')}</select></div></div>
      <p class="muted" style="font-size:12px;margin:0">Anasayfada gösterilecek kart sayısı = sütun × satır. Kalanlar için "TÜMÜNÜ GÖR" bağlantısı çıkar. Sıralamayı <b>Mecralar</b> bölümündeki ↑↓ ile yaparsınız.</p></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Nerelerdeyiz sayfası</label>
      <div class="field"><label class="flabel">Başlık</label><input class="inp" id="hnb" value="${esc(nd.baslik)}" placeholder="Nerelerdeyiz"></div>
      <div class="field"><label class="flabel">Açıklama</label><textarea class="inp" id="hna">${esc(nd.alt)}</textarea></div>
      <p class="muted" style="font-size:12px;margin:0">Harita ve tüm lokasyon kartları bu sayfada birlikte gösterilir. Adres: /nerelerdeyiz</p></div>

    <button class="btn btn-primary btn-sm" onclick="hmSave()">Kaydet</button>`;
}
async function hmSave(){
  const items=[];
  for(let i=0;i<4;i++){ const n=gv('hn'+i).trim(), l=gv('hl'+i).trim(); if(n||l) items.push({n,label:l}); }
  await api('settings_save',{home:{
    map:{enabled:document.getElementById('hmap').checked,height:parseInt(gv('hmh')||'800',10),engine:gv('hmeng')||'auto'},
    search:{adimlar:gv('hsad'),placeholder:gv('hsp')},
    katalog:{baslik:gv('hkb'),alt:gv('hka')},
    grid:{cols:+gv('hgc')||3,rows:+gv('hgr')||2},
    stats:{eyebrow:gv('hse'),alt:gv('hsd'),items},
    nerede:{baslik:gv('hnb'),alt:gv('hna')}
  }});
  toast('Anasayfa kaydedildi. Siteyi Ctrl+F5 ile yenileyin.');
}

/* ---------- MECRALAR ---------- */
async function mecralar(c){
  const list=await api('mecra_list'); ui._mecralar=list; ui._products=await api('products_list');
  const alls=await api('alt_all'); const cnt={}; alls.forEach(a=>cnt[a.mecra_id]=(cnt[a.mecra_id]||0)+1);
  /* mecEdit() içerik/görsel/koordinat düzenleme formudur (site CMS'i),
     salt okuma modu taşımaz; team_member için hiyerarşi/alan sayısı
     görünür kalır, düzenleme/sıralama/silme ve yeni mecra oluşturma
     admin'e kapalıdır. Pozisyon/doluluk detayı zaten Doluluk sekmesinde
     (parity audit S1 §5). */
  const rows=list.map(m=>`<div class="list-item"><span class="dot" style="background:${esc(m.theme_color)}"></span><div class="nm">${esc(m.name)}</div><div class="meta">${cnt[m.id]||0} alt mecra</div>
    ${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="mecReorder(${m.id},-1)" title="Yukarı">↑</button><button class="btn btn-outline btn-sm" onclick="mecReorder(${m.id},1)" title="Aşağı">↓</button><button class="btn btn-outline btn-sm" onclick="mecEdit(${m.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="mecDel(${m.id})">Sil</button>`:''}</div>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Mecralar</h3>${isAdmin()?`<button class="btn btn-primary btn-sm" onclick="mecEdit(0)">+ Mecra ekle</button>`:''}</div>
    ${!isAdmin()?'<p class="muted" style="margin:-4px 0 12px">Mecra içerik/görsel düzenlemesi Yönetim yüzeyindedir; pozisyon ve doluluk detayı için Doluluk sekmesine bakın.</p>':''}
    ${rows||'<p class="muted">Mecra yok.</p>'}<div id="mecEd"></div>`;
}

async function mecEdit(id){ if(ui._dirty && !(await dirtyGuard())) return;
  const m=(ui._mecralar||[]).find(x=>x.id===id)||{theme_color:'#0071e3'};
  const T=(i,ad)=>`<button type="button" class="mtab-btn${i===0?' on':''}" data-mt="${i}" onclick="mecTab(${i})">${ad} <span class="mtab-badge" id="mtb${i}">–</span></button>`;
  const slug=m.slug||pslug(m.name||'');
  document.getElementById('mecEd').innerHTML=`<div class="sec-card" style="margin-top:16px">
    <div class="mec-head">
      <h3 style="margin:0;font-size:16px">${id?'Mecrayı Düzenle':'Yeni Mecra'}</h3>
      ${id?`<span class="pill ${m.hidden?'':'pil-on'}">${m.hidden?'○ Taslak':'● Yayında'}</span>
      <a class="btn btn-ghost btn-sm" href="mecra/${esc(slug)}" target="_blank" rel="noopener" style="margin-left:auto">Sayfayı Gör ↗</a>`:''}
    </div>
    ${id?`<div class="hazir" id="mecHazirBar"></div>`:''}
    <input type="hidden" id="mid" value="${id||0}">
    <div class="mtabs">${T(0,'Genel')}${T(1,'Görseller')}${T(2,'Tanıtım')}${T(3,'Alanlar')}${T(4,'Bölümler')}</div>

    <div class="mtab-p on" data-mp="0">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Temel Bilgiler</label>
    <div class="row2"><div class="field"><label class="flabel">İsim (kart başlığı)</label><input class="inp" id="mname" value="${esc(m.name)}" oninput="slugHint('mname','mslug')"></div>
    <div class="field"><label class="flabel">Tema rengi</label><div class="colorwrap"><input type="color" id="mcolor" value="${esc(m.theme_color||'#0071e3')}" oninput="document.getElementById('mcolor2').value=this.value"><input class="inp" id="mcolor2" value="${esc(m.theme_color)}" oninput="document.getElementById('mcolor').value=this.value"></div></div></div>
    <div class="field"><label class="flabel">Sayfa adresi</label>
      <div class="slug-row"><span>/mecra/</span><input class="inp" id="mslug" value="${esc(m.slug)}" placeholder="otomatik: ${esc(pslug(m.name))}"></div>
      <p class="muted" style="font-size:11.5px;margin:5px 0 0">Boş bırakırsan isimden otomatik üretilir. Sonradan değiştirirsen eski linkler kırılır.</p></div>
    <div class="row2"><div class="field"><label class="flabel">Ziyaretçi / gösterim rakamı (künye kartında başlığın altında)</label><input class="inp" id="mgg" value="${esc(m.gunluk_gosterim)}" placeholder="Yıllık 15 Milyon Ziyaretçi"></div>
    <div class="field"><label class="flabel">Toplam reklam alanı</label><input class="inp" id="mta" value="${esc(m.toplam_alan)}" placeholder="3 alt mecra"></div></div>
    <div class="field" style="margin-top:4px"><label class="flabel">Rozet (kart üzerinde küçük etiket)</label><input class="inp" id="mbadge" value="${esc(m.badge)}"></div>
    </div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Yayın durumu</label>
      <label class="switch"><input type="checkbox" id="mpub" ${m.hidden===true?'':'checked'}><span class="sl"></span><span class="txt">Sitede yayında</span></label>
      <p class="muted" style="font-size:12px;margin:6px 0 0">Kapalıyken bu mecra ve tüm alanları sitede hiç görünmez (taslak). Panelde çalışmaya devam edebilirsiniz.</p></div>
    </div>

    <div class="mtab-p" data-mp="1">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Görseller ve Kapak</label>
    ${imgField('mimage', m.image, 'Kart görseli (yükle veya URL)', 'https://...')}
    ${imgField('mkapak', m.kapak, 'Kapak görseli (1920×400 — mecra sayfası üstü)', 'https://...')}
    <div class="row2"><div class="field"><label class="flabel">Kapak kaplama rengi</label><input type="color" id="mkcolor" value="${esc(m.kapak_color||'#101014')}"></div><div class="field"><label class="flabel">Kapak opasite (0–1)</label><input class="inp" type="number" min="0" max="1" step="0.05" id="mkop" value="${m.kapak_opacity!=null?m.kapak_opacity:0.4}"></div></div>
    <div class="field"><label class="flabel">Kapak yüksekliği (px)</label><input class="inp" type="number" id="mkh" value="${m.kapak_height!=null?m.kapak_height:350}" placeholder="350"></div>
    ${imgField('mkapakm', m.kapak_mobil, 'Kapak görseli — MOBİL sürüm (opsiyonel, 760px altı)', 'boş = masaüstü görseli kullanılır')}
    ${imgField('mimagem', m.image_mobil, 'Kart görseli — MOBİL sürüm (opsiyonel)', 'boş = masaüstü görseli kullanılır')}
    ${visSel('m',m,'kapak','Kapak görünürlüğü')}
    </div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Yerleşim krokisi</label>
      <p class="muted" style="font-size:12px;margin:0 0 10px">Kendi hazırladığınız kroki. Kırpılmaz, kutuya sığdırılır; ziyaretçi tıklayınca tam ekran büyür.</p>
      ${imgField('mkroki', m.yerlesim_plani, 'Kroki görseli', 'https://...')}
      ${imgField('mkrokim', m.kroki_mobil, 'Kroki — MOBİL sürüm (opsiyonel)', 'boş = masaüstü krokisi kullanılır')}
      ${visSel('m',m,'kroki','Kroki')}</div>
    </div>

    <div class="mtab-p" data-mp="2">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Kapak altı tanıtım (mecra sayfasında kapağın hemen altında görünür)</label>
      <input class="inp" id="mintro" value="${esc(m.intro_baslik)}" placeholder="Başlık — ör. Adana'nın Kalbinde Reklam" style="margin-bottom:8px">
      <textarea class="inp" id="macik" placeholder="Açıklama metni…" style="min-height:90px">${esc(m.aciklama)}</textarea>
      ${visSel('m',m,'aciklama','Bu bölüm')}</div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Tanıtım görseli ve katalog</label>
      ${imgField('mintroimg', m.intro_image, 'Tanıtım görseli (başlık + açıklamanın altında, tıklayınca büyür)', 'https://...')}
      <div class="field" style="margin-top:12px"><label class="flabel">PDF Katalog (sidebar\'daki buton — boşsa genel katalog kullanılır)</label>
        <div style="display:flex;gap:8px"><input class="inp" id="mkatalog" value="${esc(m.katalog||'')}" placeholder="uploads/katalog.pdf">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('application/pdf',u=>{document.getElementById('mkatalog').value=u;})">Yükle</button></div></div></div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Avantajlar (mecra sayfasında kutucuklar)</label>
      ${[0,1,2,3].map(i=>{const a=(Array.isArray(m.avantajlar)?m.avantajlar:[])[i]||{};
        return `<div class="row3av" style="margin-bottom:8px">
          ${ikonSecici('mav_i'+i,a.i||'',' av-ic')}
          <input class="inp" id="mav_t${i}" value="${esc(a.t||a.title||'')}" placeholder="Başlık ${i+1}">
          <input class="inp" id="mav_d${i}" value="${esc(a.d||a.desc||'')}" placeholder="Kısa açıklama"></div>`;}).join('')}
      <p class="muted" style="font-size:11.5px;margin:2px 0 0">Soldaki seçici avantajın ikonu; kendi SVG'lerinizi <b>Site İçeriği › İkonlar</b>'dan yükleyin.</p>
      ${visSel('m',m,'avantajlar','Avantajlar')}</div>
    </div>

    <div class="mtab-p" data-mp="3" data-nobadge="1">
    ${id?`<div class="sec-head" style="margin-top:0"><div><h4 style="font-size:14px;margin:0">Reklam alanları</h4>
        <p class="muted" style="font-size:12px;margin:4px 0 0">Her alan sitede bir sekme olur (tek alan varsa sekme görünmez). Pozisyonlar alanın içinden yönetilir.</p></div>
        <button class="btn btn-primary btn-sm" onclick="altAdd(${id})">+ Alan</button></div>
      <div id="altList">Yükleniyor…</div>`
      :'<p class="muted">Alanları, mecrayı kaydettikten sonra ekleyebilirsiniz.</p>'}
    </div>

    <div class="mtab-p" data-mp="4">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Sayfa bölümleri</label>
      <p class="muted" style="font-size:12px;margin:0 0 10px">Duvar reklamı gibi tekli mecralarda gereksiz bölümleri kapatın; sayfa sadece açık bölümlerle çizilir.</p>
      ${visSel('m',m,'bar','Künye şeridi (gösterim · pozisyon · butonlar)')}
      ${visSel('m',m,'konum','Konum bilgisi bölümü')}
      ${visSel('m',m,'maps','— Harita')}
      ${visSel('m',m,'kroki','— Kroki (yüklüyse)')}
      ${visSel('m',m,'kunye','— Künye kartı (ad, açıklama, avantajlar)')}
      ${visSel('m',m,'alanlar','Reklam alanları (ürün kartları)')}
      ${visSel('m',m,'tablo','Rezervasyon tablosu')}
      ${visSel('m',m,'bant','Teklif bandı (Teklif Al · WhatsApp · Katalog · Biz Planlayalım)')}
      ${visSel('m',m,'diger','Diğer lokasyonlar slider')}
      ${visSel('m',m,'sticky','Yapışkan üst çubuk')}</div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Logo</label>
      ${imgField('mlogo', m.logo, 'Lokasyon logosu (künye şeridinde)', 'https://...')}
      ${visSel('m',m,'logo','Logo')}</div>
    </div>

    <div class="stickybar"><span class="dirty-msg" id="mecDirtyMsg"></span>
      <button class="btn btn-ghost btn-sm" onclick="mecVazgec(${id||0})">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="mecSave()">Mecrayı Kaydet</button></div>
    </div>`;
  collapsify(document.getElementById('mecEd'),'form');
  const kok=document.getElementById('mecEd');
  ui._dirty=false;
  const tazele=()=>{ mecTabSay(); mecHazir(m); };
  kok.oninput=()=>{ mecKirlet(); tazele(); };
  kok.onchange=()=>{ mecKirlet(); tazele(); };
  tazele();
  kok.scrollIntoView({behavior:'smooth'});
  if(id) loadAltList(id);
}
function mecKirlet(){ ui._dirty=true;
  const m=document.getElementById('mecDirtyMsg'); if(m)m.textContent='Kaydedilmemiş değişiklik var'; }
function mecTemizle(){ ui._dirty=false;
  const m=document.getElementById('mecDirtyMsg'); if(m)m.textContent=''; }
async function mecVazgec(id){ if(ui._dirty && !await mpConfirm('Değişiklikler kaydedilmedi. Vazgeçilsin mi?','Vazgeç',{danger:false,ok:'Evet, Vazgeç'}))return;
  ui._dirty=false; mecEdit(id); }
async function dirtyGuard(){ if(!ui._dirty) return true;
  if(await mpConfirm('Kaydedilmemiş değişiklikler var. Kaydetmeden ayrılmak istiyor musunuz?','Kaydedilmedi',{danger:false,ok:'Ayrıl'})){ ui._dirty=false; return true; }
  return false; }
/* Yayına hazırlık şeridi — kritik alanlar + koordinat sayısı */
function mecHazir(m){
  const bar=document.getElementById('mecHazirBar'); if(!bar)return;
  const dolu=id=>String(gv(id)||'').trim()!=='';
  const units=(m&&m.units)||[];
  const koorD=units.filter(u=>u.lat!=null).length, koorT=units.length;
  const items=[
    ['Kapak', dolu('mkapak'), 1],
    ['Kart görseli', dolu('mimage'), 1],
    ['Açıklama', dolu('macik'), 2],
    ['Avantajlar', [0,1,2,3].some(i=>dolu('mav_t'+i)), 2],
    ['Katalog', dolu('mkatalog'), 2]];
  bar.innerHTML=items.map(([ad,ok,tab])=>`<button type="button" class="hz ${ok?'ok':'no'}" onclick="mecTab(${tab})">${ok?'✓':'✗'} ${ad}</button>`).join('')
    + (koorT?`<button type="button" class="hz ${koorD===koorT?'ok':(koorD?'yari':'no')}" onclick="dirtyGuard().then(t=>{if(t)go('harita')})">${koorD===koorT?'✓':'◔'} Koordinat ${koorD}/${koorT}</button>`:'');
}
function mecTab(i){
  document.querySelectorAll('#mecEd .mtab-btn').forEach(b=>b.classList.toggle('on',+b.dataset.mt===i));
  document.querySelectorAll('#mecEd .mtab-p').forEach(p=>p.classList.toggle('on',+p.dataset.mp===i));
}
/* Sekme rozetleri: her panelde dolu alan / toplam alan (renk seçiciler ve anahtarlar sayılmaz) */
function mecTabSay(){
  document.querySelectorAll('#mecEd .mtab-p').forEach(p=>{
    if(p.dataset.nobadge){ const bb=document.getElementById('mtb'+p.dataset.mp); if(bb){ bb.textContent=(ui._alts||[]).length+' alan'; bb.classList.remove('tam'); } return; }
    const alanlar=[...p.querySelectorAll('input.inp,textarea.inp')].filter(e=>e.type!=='color');
    const dolu=alanlar.filter(e=>String(e.value||'').trim()!=='').length;
    const b=document.getElementById('mtb'+p.dataset.mp); if(!b)return;
    b.textContent=dolu+'/'+alanlar.length;
    b.classList.toggle('tam', dolu===alanlar.length && alanlar.length>0);
  });
}
async function mecSave(){ const id=+gv('mid');
  const prev=((ui._mecralar||[]).find(x=>x.id===id)||{}).visible||{};
  const visible=collectVis('m',['kapak','aciklama','kroki','avantajlar','logo','gosterim','maps','bar','konum','kunye','alanlar','tablo','bant','diger','sticky'],prev);
  const avantajlar=[]; for(let i=0;i<4;i++){ const t=(gv('mav_t'+i)||'').trim(), d=(gv('mav_d'+i)||'').trim(), ik=(gv('mav_i'+i)||'').trim(); if(t||d)avantajlar.push({t,d,i:(ik&&ik!=='diger')?ik:''}); }
  const r=await guard(()=>api('mecra_save',{id,name:gv('mname'),theme_color:gv('mcolor'),badge:gv('mbadge'),
    hidden:!(document.getElementById('mpub')||{checked:true}).checked,
    intro_image:gv('mintroimg'),katalog:gv('mkatalog'),
    gunluk_gosterim:gv('mgg'),toplam_alan:gv('mta'),slug:(gv('mslug').trim()||pslug(gv('mname'))),
    image:gv('mimage'),image_mobil:gv('mimagem'),
    kapak:gv('mkapak'),kapak_mobil:gv('mkapakm'),
    kapak_color:gv('mkcolor'),kapak_opacity:parseFloat(gv('mkop')||'0.4'),kapak_height:parseInt(gv('mkh')||'600',10),
    aciklama:gv('macik'),intro_baslik:gv('mintro'),
    yerlesim_plani:gv('mkroki'),kroki_mobil:gv('mkrokim'),
    logo:gv('mlogo'),avantajlar,
    hub:true,
    visible}),'Mecra kaydedilemedi');
  if(r===null) return;
  mecTemizle(); toast('Mecra kaydedildi.');
  ui._mecralar=await api('mecra_list'); mecEdit(id||(r&&r.id)||0); }
async function mecDel(id){ if(await mpConfirm('Mecra, tüm alt mecraları, pozisyonları ve DOLULUK GEÇMİŞİ birlikte silinir. Bu işlem geri alınamaz.','Mecrayı Sil')){ await api('mecra_delete&id='+id); renderSection(); } }
async function mecReorder(id,dir){ let list=(ui._mecralar||[]).slice(); const idx=list.findIndex(x=>x.id===id); const j=idx+dir; if(idx<0||j<0||j>=list.length)return; [list[idx],list[j]]=[list[j],list[idx]]; for(let k=0;k<list.length;k++){ if((list[k].sort||0)!==k) await api('mecra_save',{id:list[k].id,sort:k}); } ui._mecralar=await api('mecra_list'); renderSection(); }

async function loadAltList(mid){ const alts=await api('alt_list&mecra_id='+mid); ui._alts=alts;
  const box=document.getElementById('altList'); if(!box)return;
  box.innerHTML = alts.length? alts.map(a=>`<div class="list-item"><div class="nm">${esc(a.name)}</div><div class="meta">${esc((ui._products.find(p=>p.id==a.product_id)||{}).name||'ürün?')}</div>
    <button class="btn btn-outline btn-sm" onclick="altEdit(${a.id},${mid})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="altDel(${a.id},${mid})">Sil</button></div>`).join('') : '<p class="muted">Alt mecra yok.</p>';
}
async function altAdd(mid){ const pid=(ui._products[0]||{}).id||null; const r=await api('alt_save',{mecra_id:mid,product_id:pid,name:'Yeni Alan'}); ui._alts=await api('alt_list&mecra_id='+mid); altEdit(r.id,mid); }
async function altDel(id,mid){ if(await mpConfirm('Alt mecra, pozisyonları ve doluluk geçmişiyle birlikte silinir.','Alt Mecrayı Sil')){ await api('alt_delete&id='+id); loadAltList(mid); } }

async function altEdit(id,mid){ if(ui._dirty && !(await dirtyGuard())) return;
  const alts=await api('alt_list&mecra_id='+mid); ui._alts=alts; const a=alts.find(x=>x.id===id)||{galeri:[]};
  const gal=Array.isArray(a.galeri)?a.galeri:[];
  const mlist=await api('mecra_list'); const mec=(mlist||[]).find(x=>x.id===mid)||{};
  const units=((mec.units||[]).filter(u=>u.alt_mecra_id===id)).sort((x,y)=>(x.sort||0)-(y.sort||0)||x.id-y.id);
  const galRows=gal.map((g,i)=>`<div class="ga-t"><img src="${esc(g)}" alt=""><button class="btn btn-danger btn-sm" onclick="altGalDel(${id},${mid},${i})">×</button></div>`).join('');
  const unitRows=units.map(u=>`<tr>
      <td><input class="inp inp-sm" value="${esc(u.name)}" onchange="unitSave(${u.id},'name',this.value)"></td>
      <td><input class="inp inp-sm" value="${esc(u.olcu||'')}" placeholder="120×185 cm" onchange="unitSave(${u.id},'olcu',this.value)"></td>
      <td><input class="inp inp-sm" value="${esc(u.konum||'')}" placeholder="Ana giriş" onchange="unitSave(${u.id},'konum',this.value)"></td>
      <td><span class="uf ${u.image?'':'bos'}" onclick="unitFoto(${u.id},${id},${mid})" title="${u.image?'Fotoğrafı değiştir':'Fotoğraf yükle'}">${u.image?`<img src="${esc(u.image)}" alt="">`:'+'}</span></td>
      <td class="muted" style="font-size:11.5px">${u.lat!=null?'📍':'—'}</td>
      <td><button class="btn btn-danger btn-sm" onclick="unitDel(${u.id},${id},${mid})">×</button></td></tr>`).join('');
  document.getElementById('mecEd').innerHTML=`<div class="sec-card" style="margin-top:16px">
    <div class="mec-head"><button class="btn btn-ghost btn-sm" onclick="mecEdit(${mid})">‹ ${esc(mec.name||'Mecra')}</button>
      <h3 style="margin:0;font-size:16px">Reklam Alanı</h3></div>
    <input type="hidden" id="aid" value="${id}"><input type="hidden" id="amid" value="${mid}">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Alan bilgisi</label>
      <div class="row2"><div class="field"><label class="flabel">Alan adı</label><input class="inp" id="aname" value="${esc(a.name)}" placeholder="M1 Adana Raketler"></div>
        <div class="field"><label class="flabel">Ürün tipi</label><select class="inp" id="aprod">${ui._products.map(p=>`<option value="${p.id}" ${p.id==a.product_id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div></div>
      <div class="field"><label class="flabel">Kısa açıklama (ürün kartında, 2–3 cümle)</label><textarea class="inp" id="aacik" style="min-height:76px">${esc(a.aciklama)}</textarea></div>
      <input type="hidden" id="aslug" value="${esc(a.slug||'')}">
      <label class="switch"><input type="checkbox" id="apub" ${a.hidden===true?'':'checked'}><span class="sl"></span><span class="txt">Sitede yayında</span></label></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Görseller</label>
      ${imgField('aimage', a.image, 'Ürün fotoğrafı (kart + harita pini + slider ilk kare)', 'https://...')}
      <div class="field"><label class="flabel">Slider görselleri</label>
        <div class="ga-grid">${galRows||'<p class="muted" style="font-size:12px;margin:0">Henüz yok — ürün fotoğrafı tek kare olarak kullanılır.</p>'}</div>
        <button class="btn btn-outline btn-sm" style="margin-top:8px" onclick="pickUpload('image/*',u=>altGalAdd(${id},${mid},u))">+ Görsel ekle</button></div></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Fiyat (boşsa ürünün fiyatları kullanılır)</label>
      <div class="row2"><input class="inp" id="afbaz" type="number" placeholder="Aylık baz ₺" value="${(a.fiyat&&a.fiyat.baz!=null)?a.fiyat.baz:''}">
        <input class="inp" id="afhafta" type="number" placeholder="Haftalık ₺ (opsiyonel)" value="${(a.fiyat&&a.fiyat.hafta!=null)?a.fiyat.hafta:''}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px">
        <input class="inp" id="afind3" type="number" placeholder="3 ay indirim %" value="${(a.fiyat&&a.fiyat.ind3)||''}">
        <input class="inp" id="afind6" type="number" placeholder="6 ay indirim %" value="${(a.fiyat&&a.fiyat.ind6)||''}">
        <input class="inp" id="afind12" type="number" placeholder="12 ay indirim %" value="${(a.fiyat&&a.fiyat.ind12)||''}"></div></div>

    <div class="fld-box"><label class="flabel" style="font-weight:700">Pozisyonlar <span class="muted" style="font-weight:400">· ${units.length}</span></label>
      <p class="muted" style="font-size:12px;margin:0 0 10px">Çift yüzlü panolarda ad <b>P1-A / P1-B</b>; tek yüzeylilerde düz <b>P1</b>. Tek yüzeyli adı A veya B harfiyle bitirmeyin. Koordinatlar Harita bölümünden işaretlenir (📍 = işaretli).</p>
      ${units.length?`<table class="tbl"><thead><tr><th>Ad</th><th>Ölçü</th><th>Konum</th><th>Foto</th><th></th><th></th></tr></thead><tbody>${unitRows}</tbody></table>`:''}
      <p class="muted" style="font-size:11.5px;margin:6px 0 0">Foto: haritadaki pin kartında görünür. Çift yüzlü panolarda A ve B için ayrı fotoğraf yükleyin ki ziyaretçi yüzleri ayırt edebilsin.</p>
      <div class="ub-row">
        <button class="btn btn-outline btn-sm" onclick="unitAdd(${id},${mid})">+ Tek pozisyon</button>
        <span class="ub-sep"></span>
        <input class="inp inp-sm" id="ubAdet" type="number" min="1" max="200" value="10" style="width:76px">
        <label class="ub-chk"><input type="checkbox" id="ubCift"> çift yüzlü (A/B)</label>
        <input class="inp inp-sm" id="ubOlcu" placeholder="Ortak ölçü (opsiyonel)" style="width:170px">
        <button class="btn btn-primary btn-sm" onclick="unitToplu(${id},${mid})">Toplu üret</button></div></div>

    <div class="stickybar"><span class="dirty-msg" id="mecDirtyMsg"></span>
      <button class="btn btn-ghost btn-sm" onclick="mecEdit(${mid})">Kapat</button>
      <button class="btn btn-primary btn-sm" onclick="altSave()">Alanı Kaydet</button></div>
    </div>`;
  collapsify(document.getElementById('mecEd'),'form');
  document.getElementById('mecEd').scrollIntoView({behavior:'smooth'});
}
/* Toplu pozisyon üretici: P{n} ya da P{n}-A/-B, mevcut son numaradan devam eder */
async function unitToplu(altId,mid){
  const adet=Math.max(1,Math.min(200,+gv('ubAdet')||0)); const cift=document.getElementById('ubCift').checked; const olcu=(gv('ubOlcu')||'').trim();
  const alt=(ui._alts||[]).find(x=>x.id===altId)||{};
  const mlist=await api('mecra_list'); const mec=(mlist||[]).find(x=>x.id===mid)||{};
  const mevcut=(mec.units||[]).filter(u=>u.alt_mecra_id===altId);
  let son=0; mevcut.forEach(u=>{ const mm=String(u.name||'').match(/^P(\d+)/i); if(mm)son=Math.max(son,+mm[1]); });
  if(!await mpConfirm(`${adet} pozisyon ${cift?'(her biri A/B, toplam '+(adet*2)+' yüzey) ':''}P${son+1}'den başlayarak oluşturulacak. Devam?`,'Toplu Üret',{danger:false,ok:'Oluştur'}))return;
  let sira=mevcut.length;
  for(let i=1;i<=adet;i++){ const n=son+i;
    const adlar=cift?[`P${n}-A`,`P${n}-B`]:[`P${n}`];
    for(const ad of adlar){ await api('unit_save',{alt_mecra_id:altId,mecra_id:mid,product_id:alt.product_id,name:ad,olcu:olcu||null,sort:sira++}); }
  }
  toast(`${cift?adet*2:adet} pozisyon oluşturuldu.`); altEdit(altId,mid);
}
async function altSave(){ const id=+gv('aid'), mid=+gv('amid'); mecTemizle();
  const bz=gv('afbaz'); const fiyat = bz!==''? {baz:+bz, hafta:(gv('afhafta')!==''?+gv('afhafta'):null), ind3:+gv('afind3')||0, ind6:+gv('afind6')||0, ind12:+gv('afind12')||0} : null;
  const r=await guard(()=>api('alt_save',{id,name:gv('aname'),product_id:+gv('aprod'),slug:(gv('aslug').trim()||pslug(gv('aname'))),
    aciklama:gv('aacik'),image:gv('aimage'),fiyat,hidden:!(document.getElementById('apub')||{checked:true}).checked}),'Alan kaydedilemedi');
  if(r===null)return; toast('Alan kaydedildi.'); altEdit(id,mid); }
async function altGalAdd(id,mid,url){ const alts=await api('alt_list&mecra_id='+mid); const a=alts.find(x=>x.id===id)||{}; const gal=Array.isArray(a.galeri)?a.galeri:[]; gal.push(url); await api('alt_save',{id,galeri:gal}); altEdit(id,mid); }
async function altGalDel(id,mid,idx){ const alts=await api('alt_list&mecra_id='+mid); const a=alts.find(x=>x.id===id)||{}; const gal=Array.isArray(a.galeri)?a.galeri:[]; gal.splice(idx,1); await api('alt_save',{id,galeri:gal}); altEdit(id,mid); }

async function unitAdd(altId,mid){ const alt=(ui._alts||await api('alt_list&mecra_id='+mid)).find(x=>x.id===altId)||{};
  await api('unit_save',{alt_mecra_id:altId,mecra_id:mid,product_id:alt.product_id,name:'Yeni Pozisyon'}); altEdit(altId,mid); }
async function unitSave(id,field,value){ const body={id}; body[field]=value; await api('unit_save',body); }
function unitFoto(uid,altId,mid){ pickUpload('image/*',async u=>{ await api('unit_save',{id:uid,image:u}); altEdit(altId,mid); }); }
async function unitDel(id,altId,mid){ if(await mpConfirm('Pozisyon ve doluluk geçmişi silinsin mi?','Pozisyonu Sil')){ await api('unit_delete&id='+id); altEdit(altId,mid); } }
/* S8: eski birim takvimi (`loadUnitCal/drawUnitCal/cycleMonth`) KALDIRILDI.
   Çağıranı yoktu ve tıklamada aylık `bookings` yazıyordu — gizli ikinci
   bir doluluk yazarı olarak kalamazdı. */


/* ---------- HARİTA (S11 §4) ----------
   Doluluk sekmesiyle AYNI aktif kapsam ve AYNI durum hesabı (medya.js:
   mdYukle / mdKapsamda / mdArsiv / mdYuzeyDurum / mdRefGun). Satır birimi
   FİZİKSEL pano ya da LED ekranıdır:
     · A/B yüzleri aynı panonun iki yüzüdür → tek satır, tek konum;
     · LED kampanyaları pin DEĞİLDİR; fiziksel LED ekranları ayrı listelenir;
     · kapsam dışı lokasyon, eski modelleme alanı ve pasif (ör. eski LED
       yer tutucusu) envanter listeye girmez.
   Koordinat uydurulmaz: konumu olmayan "Konum eklenmemiş" yazar.
   Konum düzenleme yalnız yönetici ve yalnız "Konumu kaydet" ile yazılır;
   bir panonun tüm yüzleri TEK istekte güncellenir. */
let hMap=null, hCluster=null, hMarker=null, hRows=[], hSel=null, hQ='', hTaslak=null;
async function harita(c){
  let st={}, M=null, hata=null;
  try{ [st,M]=await Promise.all([api('settings_get'),(typeof mdYukle==='function')?mdYukle():null]); }
  catch(e){ hata=e; }
  if(hata||!M){
    c.innerHTML=`<div class="sec-card"><div class="banner" role="alert">Harita verisi okunamadı${hata?': '+esc(hata.message||hata):''}.
      <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="renderSection()">Yeniden dene</button></div></div>`;
    return; }
  ui._settings=st;
  hRows=hFizikselListe(M); hSel=null; hTaslak=null; ui._dirty=false;
  const pano=hRows.filter(r=>r.tip==='pano'), ekran=hRows.filter(r=>r.tip==='ekran');
  const yuz=pano.reduce((n,r)=>n+r.faces.length,0);
  const ref=mdRefGun(mdDurum());

  /* Harita sayfası metinleri, Google anahtarı ve koordinat işaretleme
     mutation'dır — yöneticiye açık. Liste + harita herkese salt okuma. */
  c.innerHTML=`
  ${isAdmin()?`<div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Harita Sayfası Metinleri</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Header'daki <b>Maps</b> butonuyla açılan sayfanın başlığı ve açıklaması.</p>
    <div class="field"><label class="flabel" for="mapTitle">Sayfa başlığı</label><input class="inp" id="mapTitle" value="${esc(st.mapTitle||'')}" placeholder="Reklam Alanlarımız — Adana Haritası"></div>
    <div class="field"><label class="flabel" for="mapDesc">Açıklama</label><textarea class="inp" id="mapDesc" placeholder="Kısa tanıtım metni…">${esc(st.mapDesc||'')}</textarea></div>
    <div class="field"><label class="flabel" for="mapKapak">Kapak görseli (sayfa üstü şerit)</label><div style="display:flex;gap:8px"><input class="inp" id="mapKapak" value="${esc(st.mapKapak||'')}"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('mapKapak').value=u;})">Yükle</button></div></div>
    <button class="btn btn-primary btn-sm" onclick="saveMapTexts()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Google Maps Anahtarı</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Buraya bir Google Maps API anahtarı yazarsanız site haritası <b>Google Maps</b> ile çalışır. Boş bırakırsanız ücretsiz OpenStreetMap kullanılır. Anahtar bu adreste reddedilirse panel haritası kendiliğinden OpenStreetMap'e geçer.
      <br><b>Önemli:</b> Google Cloud'da anahtara “HTTP yönlendiren” kısıtı koyun ve günlük kota sınırı tanımlayın.</p>
    <div class="field"><label class="flabel" for="gmKey">API anahtarı</label><input class="inp" id="gmKey" value="${esc(st.googleMapsKey||'')}" placeholder="AIza… (boş = OpenStreetMap)"></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="saveGmKey()">Kaydet</button>
      <span class="muted" style="font-size:12.5px">Tanımlı motor: <b>${st.googleMapsKey?'Google Maps':'OpenStreetMap (ücretsiz)'}</b></span></div></div>`:''}

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">${isAdmin()?'Konumlar ve konum işaretleme':'Konumlar'}</h3>
    <p class="muted hmap-kap">Aktif kapsam: <b>${pano.length} fiziksel pano</b> (${yuz} statik yüz)${ekran.length?` · <b>${ekran.length} LED ekranı</b>`:''}.
      Konumu eklenmiş: <b id="hCount">${hRows.filter(r=>r.lat!=null).length}</b> / ${hRows.length} pano/ekran.
      Yüz durumları <b>${esc(mdKisa(ref,true))}</b> tarihine göredir.
      ${isAdmin()?'<br>Bir pano seçin, haritaya tıklayarak yerini işaretleyin ve <b>Konumu kaydet</b>e basın; A/B yüzleri aynı konumu paylaşır.'
        :'<br>Bir pano seçin veya haritadaki pinlere tıklayın; konum işaretleme yönetici yetkisindedir.'}</p>
    <div class="hmap-grid">
      <div class="hmap-side">
        <input class="inp" id="hSearch" placeholder="Pano / lokasyon / ürün ara…" oninput="hFilter(this.value)" style="margin-bottom:10px" aria-label="Harita listesinde ara">
        <div id="hList" class="hlist"></div>
      </div>
      <div>
        <div id="hMapNote" class="hmap-not" style="display:none" role="status"></div>
        ${isAdmin()?`<div class="hbar">
          <input class="inp" id="hGeo" placeholder="Adres / yer ara — ör. M1 Adana AVM" onkeydown="if(event.key==='Enter'){event.preventDefault();hGeoSearch()}" aria-label="Adres ara">
          <button class="btn btn-outline btn-sm" onclick="hGeoSearch()">Bul</button>
          <input class="inp" id="hPaste" placeholder="Koordinat veya Maps linki yapıştır" onkeydown="if(event.key==='Enter'){event.preventDefault();hPasteCoord()}" aria-label="Koordinat yapıştır">
          <button class="btn btn-outline btn-sm" onclick="hPasteCoord()">Uygula</button>
        </div>
        <div id="hGeoRes" class="hgeores" style="display:none"></div>`:''}
        <div id="hSelBar" class="hselbar">Bir pano ya da LED ekranı seçin.</div>
        <div class="hmap-kutu"><div id="hMapCanvas" class="hmap"></div><div id="hMapBos" class="hmap-bos" hidden></div></div>
      </div>
    </div></div>`;
  hRenderList();
  setTimeout(hInitMap,80);
}
/* Fiziksel pano / ekran listesi — Doluluk ile aynı kapsam kuralları. */
function hFizikselListe(M){
  const out=[];
  M.mecs.filter(mdKapsamda).forEach(m=>{
    const alanlar=(M.altByMec[m.id]||[]).filter(a=>!mdArsiv(a));
    const yetim=(M.orphanByMec[m.id]||[]).filter(u=>u.active!==false);
    const ekle=(a,us)=>{
      const esz=mdEszamanli(a);
      const grp=esz?us.map(u=>({base:u.name,faces:[u]}))
                   :groupUnits(us).map(g=>({base:g.base,faces:[g.A,g.B].filter(Boolean)}));
      grp.forEach(g=>{
        const k=g.faces.find(u=>u.lat!=null&&u.lng!=null)||null;
        out.push({id:g.faces[0].id, tip:esz?'ekran':'pano', ad:g.base, faces:g.faces,
          mec:m.name||'—', mecId:m.id, mecSort:m.sort||0, theme:m.theme_color||'#0071e3',
          alt:a.name||'Diğer pozisyonlar', urun:(a.product_id!=null&&M.pm[a.product_id])||a.name||'',
          altId:a.id, altSort:a.sort||0, lat:k?+k.lat:null, lng:k?+k.lng:null,
          konum:(g.faces.find(u=>u.konum)||{}).konum||''});
      });
    };
    alanlar.forEach(a=>{ const us=(M.unitsByAlt[a.id]||[]).filter(u=>u.active!==false); if(us.length) ekle(a,us); });
    if(yetim.length) ekle({id:'x'+m.id,name:'Diğer pozisyonlar',sort:9999},yetim);
  });
  return out;
}
function hFilter(q){ hQ=(q||'').toLocaleLowerCase('tr'); hRenderList(); }
function hGrupAcik(){ if(!ui._hOpen) ui._hOpen={}; return ui._hOpen; }
function hGrupTog(k){ const o=hGrupAcik(); o[k]=!(o[k]!==false); if(o[k]===true)delete o[k]; else o[k]=false; hRenderList(); }
function hGrupHepsi(ac){ const o=hGrupAcik(); Object.keys(o).forEach(k=>delete o[k]); if(!ac){ hRows.forEach(r=>{ o['m'+r.mecId]=false; }); } hRenderList(); }
function hVisible(){
  return hRows.filter(r=>!hQ||[r.ad,r.alt,r.urun,r.mec,r.konum,...r.faces.map(u=>u.name)].some(x=>String(x||'').toLocaleLowerCase('tr').includes(hQ)));
}
function hRenderList(){ const box=document.getElementById('hList'); if(!box)return;
  const cn=document.getElementById('hCount');
  if(cn) cn.textContent=hRows.filter(r=>r.lat!=null).length;
  const list=hVisible();
  if(!list.length){ box.innerHTML='<p class="muted" style="font-size:13px;padding:8px">Sonuç yok.</p>'; return; }
  const acik=hGrupAcik(); const aramaVar=!!hQ;
  /* Lokasyon → ürün → fiziksel pano / ekran */
  const mecs=new Map();
  list.forEach(r=>{ if(!mecs.has(r.mecId)) mecs.set(r.mecId,{ad:r.mec,theme:r.theme,sort:r.mecSort,alts:new Map()});
    const G=mecs.get(r.mecId); if(!G.alts.has(r.altId)) G.alts.set(r.altId,{ad:r.urun||r.alt,alan:r.alt,sort:r.altSort,rows:[],ekran:r.tip==='ekran'}); G.alts.get(r.altId).rows.push(r); });
  const sayac=rows=>{ const ok=rows.filter(r=>r.lat!=null).length;
    return `<span class="hsay ${ok===rows.length?'tam':(ok?'yari':'')}" title="Konumu eklenmiş / toplam">${ok}/${rows.length} konum</span>`; };
  let html='';
  [...mecs.entries()].sort((x,y)=>(x[1].sort-y[1].sort)||x[1].ad.localeCompare(y[1].ad,'tr')).forEach(([mid,G])=>{
    const tum=[...G.alts.values()].flatMap(A=>A.rows);
    const mOpen=aramaVar||acik['m'+mid]!==false;
    html+=`<div class="hg ${mOpen?'open':''}"><button class="hg-h" onclick="hGrupTog('m${mid}')" aria-expanded="${mOpen}"><i class="hdot" style="background:${G.theme}"></i><b>${esc(G.ad)}</b>${sayac(tum)}<em class="chev"></em></button>`;
    if(mOpen){
      [...G.alts.entries()].sort((x,y)=>(x[1].sort-y[1].sort)||x[1].ad.localeCompare(y[1].ad,'tr')).forEach(([aid,A])=>{
        const aOpen=aramaVar||acik['a'+aid]!==false;
        const yuzN=A.rows.reduce((n,r)=>n+r.faces.length,0);
        const ne=A.ekran?`${A.rows.length} LED ekranı`:`${A.rows.length} pano · ${yuzN} yüz`;
        html+=`<div class="hga ${aOpen?'open':''}"><button class="hga-h" onclick="hGrupTog('a${aid}')" aria-expanded="${aOpen}"><span>${esc(A.ad)} <em class="hga-n">${esc(ne)}</em></span>${sayac(A.rows)}<em class="chev"></em></button>`;
        if(aOpen) html+=A.rows.map(r=>{ const ok=r.lat!=null;
          return `<button type="button" class="hrow ${hSel===r.id?'on':''}" onclick="hPick(${r.id})" aria-pressed="${hSel===r.id}">
            <span class="hdot" style="background:${ok?r.theme:'#d2d2d7'}"></span>
            <span class="hnm"><b>${esc(r.ad)}</b><span>${r.tip==='ekran'?'LED ekranı':r.faces.length>1?r.faces.map(u=>posParts(u.name).surf).join(' · ')+' yüz':'tek yüz'}${r.konum?' · '+esc(r.konum):''}</span></span>
            <span class="hst ${ok?'ok':''}">${ok?'✓ konum':'Konum eklenmemiş'}</span></button>`;}).join('');
        html+=`</div>`; });
    }
    html+=`</div>`; });
  box.innerHTML=`<div class="hg-tools"><button onclick="hGrupHepsi(true)">Tümünü aç</button><span>·</span><button onclick="hGrupHepsi(false)">Tümünü kapat</button></div>`+html;
}
/* Google Maps yükleyici. Anahtar bu adreste REDDEDİLİRSE (ör. yönlendiren
   kısıtı) Google bunu harita kurulduktan SONRA `gm_authFailure` ile
   bildirir; önceki kod bu anda artık dinlemiyordu ve gri "Hata! Bir sorun
   oluştu" alanı kalıyordu. Artık her durumda OpenStreetMap'e geçilir. */
let hGoogleLoading=null, hEngine='leaflet', hgMap=null, hgMarkers=[], hgSel=null;
function hLoadGoogle(key){
  if(hGoogleLoading) return hGoogleLoading;
  hGoogleLoading=new Promise((res,rej)=>{
    if(window.google&&window.google.maps) return res();
    const t=setTimeout(()=>rej(new Error('zaman aşımı')),15000);
    window.__gmPanelReady=()=>{ clearTimeout(t); res(); };
    const g=document.createElement('script'); g.async=true;
    g.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&callback=__gmPanelReady&language=tr&region=TR';
    g.onerror=()=>{ clearTimeout(t); rej(new Error('yüklenemedi')); };
    document.head.appendChild(g);
  });
  return hGoogleLoading;
}
function hNot(msg,yeniden){ const n=document.getElementById('hMapNote'); if(!n) return;
  if(!msg){ n.style.display='none'; n.innerHTML=''; return; }
  n.innerHTML=esc(msg)+(yeniden?' <button class="btn btn-outline btn-sm" style="margin-left:8px" onclick="hInitMap(true)">Yeniden dene</button>':'');
  n.style.display='block'; }
let _hGoogleRed=false;
window.gm_authFailure=()=>{ _hGoogleRed=true;
  if(document.getElementById('hMapCanvas')&&hEngine==='google'){
    hNot('Google Maps anahtarı bu adreste kullanılamıyor — harita OpenStreetMap ile gösteriliyor.');
    hInitLeaflet(); } };
function hInitMap(yeniden){
  const el=document.getElementById('hMapCanvas'); if(!el)return;
  if(yeniden){ hNot(''); if(hMap){ try{ hMap.remove(); }catch(e){} hMap=null; } el.innerHTML=''; }
  const key=String((ui._settings||{}).googleMapsKey||'').trim();
  if(key&&!_hGoogleRed){
    hLoadGoogle(key).then(()=>{ if(_hGoogleRed) hInitLeaflet(); else hInitGoogle(); })
      .catch(err=>{ console.warn('Panel Google Maps:',err.message);
        hNot('Google Maps yüklenemedi ('+err.message+') — OpenStreetMap kullanılıyor.');
        hInitLeaflet(); });
  } else hInitLeaflet();
}
function hInitGoogle(){
  hEngine='google';
  hgMap=new google.maps.Map(document.getElementById('hMapCanvas'),{
    center:{lat:37.0000,lng:35.3213}, zoom:12, mapTypeId:'hybrid',
    mapTypeControl:true, streetViewControl:true, fullscreenControl:true, tilt:0});
  hgMap.addListener('click',e=>{ if(!isAdmin())return;
    if(hSel==null){ mpAlert('Önce listeden bir pano seçin.'); return; }
    hPlace(e.latLng.lat(), e.latLng.lng()); });
  hDrawAll();
}
function hInitLeaflet(){
  const el=document.getElementById('hMapCanvas'); if(!el) return;
  if(typeof L==='undefined'){ el.innerHTML=''; hNot('Harita kütüphanesi yüklenemedi.',true); return; }
  if(hMap){ try{ hMap.remove(); }catch(e){} hMap=null; }
  el.innerHTML=''; hgMap=null; hgMarkers=[]; hgSel=null;
  hEngine='leaflet';
  hMap=L.map('hMapCanvas').setView([37.0000,35.3213],12);
  let tileHata=0;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'})
    .on('tileerror',()=>{ if(++tileHata===4) hNot('Harita katmanı yüklenemiyor (internet bağlantısı?).',true); })
    .addTo(hMap);
  hCluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50});
  hMap.addLayer(hCluster);
  hMap.on('click',e=>{ if(!isAdmin())return; if(hSel==null){ mpAlert('Önce listeden bir pano seçin.'); return; } hPlace(e.latlng.lat,e.latlng.lng); });
  hDrawAll(); setTimeout(()=>hMap&&hMap.invalidateSize(),200);
}
function hDrawAll(){
  const list=hRows.filter(r=>r.lat!=null&&r.id!==hSel);
  const bos=document.getElementById('hMapBos');
  if(bos){ const n=hRows.filter(r=>r.lat!=null).length;
    bos.hidden=!!n||!!hTaslak;
    bos.textContent=n?'':'Bu kapsamda konumu eklenmiş pano yok. Konumlar eklendikçe burada pin olarak görünür; liste “Konum eklenmemiş” olanları gösterir.'; }
  if(hEngine==='google'){
    if(!hgMap)return;
    hgMarkers.forEach(m=>m.setMap(null)); hgMarkers=[];
    hgMarkers=list.map(r=>{ const mk=new google.maps.Marker({position:{lat:r.lat,lng:r.lng},map:hgMap,
        title:r.mec+' · '+r.ad, icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,
        fillColor:r.theme,fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
      mk.addListener('click',()=>hPick(r.id)); return mk; });
    return;
  }
  if(!hCluster)return; hCluster.clearLayers();
  hCluster.addLayers(list.map(r=>{ const mk=L.marker([r.lat,r.lng],{title:r.mec+' · '+r.ad});
    mk.on('click',()=>hPick(r.id)); return mk; }));
}
/* Seçili pano: yüzlerin durum tarihindeki durumu + takvime geçiş. */
async function hPick(id){
  if(hSel!==id&&ui._dirty&&!(await dirtyGuard())) return;
  hSel=id; hTaslak=null; ui._dirty=false; hRenderList();
  const r=hRows.find(x=>x.id===id); if(!r)return;
  const M=ui._M; const ref=mdRefGun(mdDurum());
  const bar=document.getElementById('hSelBar');
  const yuzler=r.tip==='ekran'
    ?(()=>{ const a=M&&M.altById[r.altId]; const y=a?mdYayinlar(M,a.id,ref):{aktif:[]};
        return `<li><span class="hsel-y">LED</span><span>${y.aktif.length?`${y.aktif.length} kampanya yayında`:'Yayında kampanya yok'} <em class="muted">· eşzamanlı yayın alanı</em></span>
          <button class="btn-link" onclick="hTakvimde(${r.faces[0].id},true)">Takvimde göster</button></li>`; })()
    :r.faces.map(u=>{ const d=M?mdYuzeyDurum(M,u,ref):{etiket:'—',alt:''};
        return `<li><span class="hsel-y">${esc(posParts(u.name).surf)}</span>
          <span><span class="md-st md-st-${esc(d.kod||'bos')}">${esc(d.etiket)}</span>${d.alt?` <em class="muted">${esc(d.alt)}</em>`:''}${d.kayit&&d.kayit.customer_name?` · ${esc(orgKisa(d.kayit.customer_name,28))}`:''}</span>
          <button class="btn-link" onclick="hTakvimde(${u.id})">Takvimde göster</button></li>`; }).join('');
  bar.innerHTML=`<div class="hsel-h"><b>${esc(r.ad)}</b> <span class="muted">— ${esc(r.mec)} › ${esc(r.urun||r.alt)}</span>
      <span class="hcoord" id="hCoord">${r.lat!=null?r.lat.toFixed(6)+', '+r.lng.toFixed(6):'Konum eklenmemiş'}</span>
      ${isAdmin()?`<span class="hsel-a" id="hSelA"></span>`:''}</div>
    <ul class="hsel-l" aria-label="Yüzlerin ${esc(mdKisa(ref,true))} tarihindeki durumu">${yuzler}</ul>`;
  hSelEylem();
  hDrawAll();
  if(hEngine==='google'){
    if(hgSel){ hgSel.setMap(null); hgSel=null; }
    if(r.lat!=null){ hPlace(r.lat,r.lng,true); hgMap&&(hgMap.panTo({lat:r.lat,lng:r.lng}),hgMap.setZoom(18)); }
    return;
  }
  if(hMarker&&hMap){ hMap.removeLayer(hMarker); hMarker=null; }
  if(r.lat!=null&&hMap){ hPlace(r.lat,r.lng,true); hMap.setView([r.lat,r.lng],16); }
}
/* Konum eylemleri: yalnız yönetici; taslak varken Kaydet / Vazgeç. */
function hSelEylem(){
  const a=document.getElementById('hSelA'); if(!a) return;
  const r=hRows.find(x=>x.id===hSel); if(!r){ a.innerHTML=''; return; }
  a.innerHTML=hTaslak
    ?`<em class="hsel-kirli">Kaydedilmemiş konum</em>
      <button class="btn btn-ghost btn-sm" onclick="hVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" id="hKaydetB" onclick="hSave()">Konumu kaydet</button>`
    :(r.lat!=null?`<button class="btn btn-ghost btn-sm" onclick="hClear()">Konumu kaldır</button>`:'<em class="muted">Haritaya tıklayarak konum işaretleyin</em>');
}
function hTakvimde(uid,led){
  if(led){ const M=ui._M, u=M&&M.unitById[uid]; if(u&&typeof medyaAlanOdak==='function') return medyaAlanOdak(u.alt_mecra_id); }
  if(typeof medyaYuzeyOdak==='function') medyaYuzeyOdak(uid);
}
function hPlace(lat,lng,quiet){
  if(!quiet){ hTaslak={lat:+lat,lng:+lng}; ui._dirty=true; hSelEylem();
    const bos=document.getElementById('hMapBos'); if(bos) bos.hidden=true; }
  if(hEngine==='google'){
    if(hgSel) hgSel.setMap(null);
    hgSel=new google.maps.Marker({position:{lat:+lat,lng:+lng},map:hgMap,draggable:isAdmin(),
      icon:{path:google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,scale:6,fillColor:'#3455e6',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
    hgSel.addListener('dragend',()=>{ const p=hgSel.getPosition(); hTaslak={lat:p.lat(),lng:p.lng()}; ui._dirty=true; hSetCoordText(p.lat(),p.lng()); hSelEylem(); });
    hSetCoordText(lat,lng);
    if(!quiet&&hgMap) hgMap.panTo({lat:+lat,lng:+lng});
    return;
  }
  if(!hMap) return;
  if(hMarker) hMap.removeLayer(hMarker);
  hMarker=L.marker([lat,lng],{draggable:isAdmin()}).addTo(hMap);
  hMarker.on('dragend',()=>{ const p=hMarker.getLatLng(); hTaslak={lat:p.lat,lng:p.lng}; ui._dirty=true; hSetCoordText(p.lat,p.lng); hSelEylem(); });
  hSetCoordText(lat,lng);
  if(!quiet) hMap.panTo([lat,lng]);
}
function hSetCoordText(lat,lng){ const el=document.getElementById('hCoord'); if(el)el.textContent=(+lat).toFixed(6)+', '+(+lng).toFixed(6)+(hTaslak?' (kaydedilmedi)':''); }
function hVazgec(){ hTaslak=null; ui._dirty=false; const id=hSel; hSel=null; hPick(id); }
/* Konum yalnız "Konumu kaydet" ile yazılır; panonun TÜM yüzleri tek istekte. */
async function hSave(){
  const r=hRows.find(x=>x.id===hSel); if(!r||!hTaslak){ mpAlert('Haritaya tıklayarak konumu işaretleyin.'); return; }
  const b=document.getElementById('hKaydetB'); if(b&&b.disabled) return; if(b){ b.disabled=true; b.textContent='Kaydediliyor…'; }
  const p=hTaslak;
  const sonuc=await guard(()=>api('units_konum',{ids:r.faces.map(u=>u.id),lat:p.lat,lng:p.lng}),'Konum kaydedilemedi');
  if(sonuc===null){ if(b){ b.disabled=false; b.textContent='Konumu kaydet'; } return; }
  r.lat=p.lat; r.lng=p.lng; r.faces.forEach(u=>{ u.lat=p.lat; u.lng=p.lng; });
  hTaslak=null; ui._dirty=false;
  toast(r.faces.length>1?`Konum kaydedildi — ${r.faces.length} yüz.`:'Konum kaydedildi.');
  const id=hSel; hSel=null; hPick(id); hNext();
}
async function hClear(){
  const r=hRows.find(x=>x.id===hSel); if(!r) return;
  if(!await mpConfirm(`${r.ad} konumu kaldırılsın mı?${r.faces.length>1?' Panonun tüm yüzlerinden kaldırılır.':''}`,'Konumu kaldır',{danger:true,ok:'Kaldır'})) return;
  const sonuc=await guard(()=>api('units_konum',{ids:r.faces.map(u=>u.id),lat:null,lng:null}),'Konum kaldırılamadı'); if(sonuc===null) return;
  r.lat=null; r.lng=null; r.faces.forEach(u=>{ u.lat=null; u.lng=null; });
  if(hEngine==='google'){ if(hgSel){hgSel.setMap(null);hgSel=null;} }
  else if(hMarker&&hMap){ hMap.removeLayer(hMarker); hMarker=null; }
  toast('Konum kaldırıldı.');
  const id=hSel; hSel=null; hPick(id);
}
function hNext(){
  const list=hVisible();
  const i=list.findIndex(r=>r.id===hSel);
  const nx=list.slice(i+1).find(r=>r.lat==null) || list.find(r=>r.lat==null);
  if(nx && nx.id!==hSel) hPick(nx.id);
}
async function saveGmKey(){ await api('settings_save',{googleMapsKey:gv('gmKey').trim()}); mpAlert('Kaydedildi. Siteyi Ctrl+F5 ile yenileyin.'); renderSection(); }
async function logYukle(){
  const box=document.getElementById('logBox'); box.innerHTML='<p class="muted" style="font-size:12.5px">Yükleniyor…</p>';
  const lim=(document.getElementById('logLim')||{}).value||200;
  let list=[];
  try{ list=await api('log_list&limit='+lim); }
  catch(e){ box.innerHTML='<div class="banner">Kayıtlar okunamadı: '+esc(e.message||e)+'</div>'; return; }
  if(!list.length){ box.innerHTML='<p class="empty">Henüz kayıt yok. Panelde bir değişiklik yaptıktan sonra burada görünecek.</p>'; return; }
  const gun=x=>{ const d=new Date(x); const b=new Date(); const f=y=>y.toISOString().slice(0,10);
    if(f(d)===f(b))return 'Bugün';
    const dun=new Date(b.getTime()-864e5); if(f(d)===f(dun))return 'Dün';
    return d.toLocaleDateString('tr-TR',{day:'2-digit',month:'long',year:'numeric'}); };
  const saat=x=>new Date(x).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
  const grup={}; list.forEach(r=>{ const g=gun(r.created_at); (grup[g]=grup[g]||[]).push(r); });
  box.innerHTML=Object.entries(grup).map(([g,rs])=>`
    <div class="log-g">${esc(g)}</div>
    ${rs.map(r=>`<div class="log-r">
      <span class="log-t mono">${esc(saat(r.created_at))}</span>
      <span class="log-u">${esc(r.kullanici||'—')}</span>
      <span class="log-a"><b>${esc(r.bolum||'')}</b> ${esc(r.islem||'')}${r.detay?` <em>${esc(r.detay)}</em>`:''}</span>
    </div>`).join('')}`).join('');
}
async function logTemizle(){
  if(!await mpConfirm('30 günden eski işlem kayıtları silinsin mi?','Günlüğü Temizle'))return;
  await api('log_clear',{gun:30}); toast('Eski kayıtlar silindi.'); logYukle();
}
async function saveGa(){
  const v=gv('gaId').trim();
  if(v && !/^G-[A-Z0-9]+$/i.test(v)){ mpAlert('Ölçüm kimliği G- ile başlamalı. Örnek: G-ABC123XYZ'); return; }
  await api('settings_save',{gaId:v}); toast(v?'Analytics açıldı. Siteyi Ctrl+F5 ile yenileyin.':'Analytics kapatıldı.'); renderSection();
}
async function saveMapTexts(){ await api('settings_save',{mapTitle:gv('mapTitle'),mapDesc:gv('mapDesc'),mapKapak:gv('mapKapak')}); mpAlert('Kaydedildi.'); }
/* Haritayı bir noktaya uçur (motordan bağımsız) */
function hFly(lat,lng,z){
  if(hEngine==='google'){ if(hgMap){ hgMap.panTo({lat:+lat,lng:+lng}); hgMap.setZoom(z||18); } }
  else if(hMap){ hMap.setView([+lat,+lng],z||18); }
}
/* Adres / yer arama — Google varsa Geocoder, yoksa OpenStreetMap Nominatim */
let hGeoHits=[];
async function hGeoSearch(){
  const q=(gv('hGeo')||'').trim(), box=document.getElementById('hGeoRes');
  if(!box) return;
  if(!q){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block'; box.innerHTML='<div class="muted">Aranıyor…</div>';
  let res=[];
  try{
    if(hEngine==='google'){
      res=await new Promise(ok=>{
        new google.maps.Geocoder().geocode({address:q,region:'TR'},(r,st)=>{
          ok(st==='OK'&&r ? r.slice(0,5).map(x=>({t:x.formatted_address,lat:x.geometry.location.lat(),lng:x.geometry.location.lng()})) : []);
        });
      });
    }else{
      const rr=await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=tr&q='+encodeURIComponent(q));
      res=(await rr.json()).map(x=>({t:x.display_name,lat:+x.lat,lng:+x.lon}));
    }
  }catch(e){ res=[]; }
  if(!res.length){ box.innerHTML='<div class="muted">Sonuç bulunamadı. Adresi biraz daha açık yazmayı deneyin.</div>'; return; }
  hGeoHits=res;
  box.innerHTML=res.map((x,i)=>'<div onclick="hGeoGo('+i+')">'+esc(x.t)+'</div>').join('');
  hGeoGo(0);
}
function hGeoGo(i){ const x=hGeoHits[i]; if(x) hFly(x.lat,x.lng,17); }
/* "37.015902, 35.249627" ya da Google Maps linkinden koordinat ayıkla */
function hParseLL(s){
  s=String(s||'').trim(); if(!s) return null;
  const m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
         || s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
         || s.match(/[?&](?:q|ll|query|center|daddr|saddr)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
         || s.match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if(!m) return null;
  const la=+m[1], ln=+m[2];
  if(!isFinite(la)||!isFinite(ln)||Math.abs(la)>90||Math.abs(ln)>180) return null;
  return {lat:la,lng:ln};
}
function hPasteCoord(){
  if(hSel==null){ mpAlert('Önce listeden bir pano seçin.'); return; }
  const p=hParseLL(gv('hPaste'));
  if(!p){ mpAlert('Koordinat okunamadı.\n\nÖrnek: 37.015902, 35.249627\nveya Google Maps adres çubuğundaki linkin tamamı.\n\nNot: maps.app.goo.gl ile başlayan kısa linkler koordinat içermez; linki tarayıcıda açıp adres çubuğundakini kopyalayın.'); return; }
  hPlace(p.lat,p.lng); hFly(p.lat,p.lng,18);
}


/* ---- pozisyon gruplama (P1-A / P1-B -> P1 satırı, A ve B yüzeyleri) ---- */
function posParts(name){ const t=String(name||'').trim();
  const m=t.match(/^(.*[^\s._-])[\s._-]*([ABab])$/);
  if(m) return {base:m[1], surf:m[2].toUpperCase()};
  return {base:t, surf:'A'}; }
function groupUnits(list){ const map=new Map();
  (list||[]).forEach(u=>{ const p=posParts(u.name);
    if(!map.has(p.base)) map.set(p.base,{base:p.base,A:null,B:null});
    const g=map.get(p.base);
    if(!g[p.surf]) g[p.surf]=u; else if(!g.B) g.B=u; });
  return [...map.values()]; }

/* ============ S8 — MECRALAR ==========================================
   Doluluk ekranı (Bugün | Yıl), yerleşim formu, detay pencereleri ve
   paylaşılan kapsam katmanı `assets/medya.js` içindedir. Eski aylık
   ızgaranın yazan yolları (hücre penceresi `rezAc/rezKaydet`, `lFiltre`,
   `booking_toggle`) KALDIRILDI: operasyonel yazma gerçeği artık kesin
   dönemli `media_placements`dır. Burada yalnız iki şey kalır:
     - eski ay bazlı Excel içe aktarımı (yönetici, açıkça "eski" etiketli;
       kesin dönemli yerleşim OLUŞTURMAZ, gün uydurmaz)
     - envantere pozisyon ekleme (yönetici)                               */
/* ---------- DOLULUK: Excel aktarımı ---------- */
const AY_TR=['ocak','şubat','mart','nisan','mayıs','haziran','temmuz','ağustos','eylül','ekim','kasım','aralık'];
function ymParse(v,varsayilanYil){
  if(v==null)return null;
  if(v instanceof Date) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0');
  let t=String(v).trim(); if(!t)return null;
  let m=t.match(/^(\d{4})[-./](\d{1,2})/);                       /* 2026-03 , 2026/3 */
  if(m) return m[1]+'-'+String(+m[2]).padStart(2,'0');
  m=t.match(/^(\d{1,2})[-./](\d{4})$/);                          /* 03-2026 */
  if(m) return m[2]+'-'+String(+m[1]).padStart(2,'0');
  m=t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);            /* 01.03.2026 */
  if(m) return m[3]+'-'+String(+m[2]).padStart(2,'0');
  const low=t.toLocaleLowerCase('tr');                            /* "Mart 2026" / "Mart" */
  const ai=AY_TR.findIndex(a=>low.startsWith(a.slice(0,3)));
  if(ai>=0){ const yy=(low.match(/(\d{4})/)||[])[1]||varsayilanYil; return yy+'-'+String(ai+1).padStart(2,'0'); }
  return null;
}
function durumParse(v){
  const t=String(v||'').toLocaleLowerCase('tr').trim();
  if(!t) return null;
  if(/^(dolu|kirali|kiralı|satıldı|satildi|full|1|evet|x)$/.test(t)) return 'dolu';
  if(/^(rezerve|opsiyon|rezervasyon|beklemede)$/.test(t)) return 'rezerve';
  if(/^(boş|bos|müsait|musait|empty|0|hayır|hayir)$/.test(t)) return 'bos';
  return null;
}
function bookImport(){
  const y=ui._lyear||new Date().getFullYear();
  importOpen({
    title:'Doluluk Verisini Excel\'den Al',
    hint:`Eski tablolardan AY BAZLI kayıt aktarımıdır: kesin dönemli yerleşim oluşturmaz ve gün uydurmaz. Güncel bir yerleşimin kapsadığı ay reddedilir. Her satır bir pozisyon-ay kaydıdır. Pozisyon "P1-A" gibi tek sütunda olabilir ya da Pozisyon + Yüzey ayrı sütunlarda. Ay boşsa ${y} varsayılır.`,
    fields:[
      {key:'mecra',label:'Mecra',required:true,alias:['lokasyon','yer','bölge']},
      {key:'alt',label:'Alt Mecra',alias:['ürün','urun','tip','reklam alanı'],hint:'opsiyonel'},
      {key:'pozisyon',label:'Pozisyon',required:true,alias:['ünite','unite','alan','no','kod']},
      {key:'yuzey',label:'Yüzey',alias:['yön','yon','cephe','a/b'],hint:'boşsa pozisyon adından okunur'},
      {key:'ay',label:'Ay',required:true,alias:['dönem','donem','tarih','periyot']},
      {key:'durum',label:'Durum',required:true,alias:['statü','statu','durumu','kiralama']},
      {key:'firma',label:'Firma',alias:['müşteri','musteri','kiralayan','cari'],hint:'opsiyonel'},
      {key:'not',label:'Not',alias:['açıklama','aciklama']}
    ],
    modes:[['ow','Mevcut kaydın ÜZERİNE yaz'],['keep','Mevcut kayıt varsa DOKUNMA']],
    onApply:async (data,mode)=>{
      const [mc,al,un,cu]=await Promise.all([
        api('mecra_list'), sb.from('alt_mecralar').select('*'), sb.from('units').select('*'), api('customers_list')]);
      const norm=t=>String(t||'').toLocaleLowerCase('tr').replace(/\s+/g,' ').trim();
      const alt={}; (al.data||[]).forEach(a=>alt[a.id]=a);
      /* pozisyon dizini: mecra adı + taban + yüzey */
      const uidx={};
      (un.data||[]).forEach(u=>{ const a=alt[u.alt_mecra_id]||{};
        const m=mc.find(x=>x.id===(a.mecra_id||u.mecra_id))||{};
        const p=posParts(u.name);
        uidx[norm(m.name)+'|'+norm(p.base)+'|'+p.surf]=u.id; });
      const cidx={}; cu.forEach(c=>cidx[norm(c.firma)]=c.id);
      const mevcut={}; 
      const {data:bk}=await sb.from('bookings').select('unit_id,ym,id');
      (bk||[]).forEach(b=>mevcut[b.unit_id+'|'+b.ym]=b.id);

      let ok=0,atla=0; const hatalar=[];
      for(const r of data){
        const ym=ymParse(r.ay,y);
        const st=durumParse(r.durum);
        if(!ym){ hatalar.push(`Ay okunamadı: "${r.ay}" (${r.mecra}/${r.pozisyon})`); continue; }
        if(st===null){ hatalar.push(`Durum okunamadı: "${r.durum}" (${r.mecra}/${r.pozisyon})`); continue; }
        /* pozisyon + yüzey çöz */
        let base=r.pozisyon, surf=String(r.yuzey||'').trim().toUpperCase();
        if(!surf){ const p=posParts(r.pozisyon); base=p.base; surf=p.surf; }
        const key=norm(r.mecra)+'|'+norm(base)+'|'+(surf==='B'?'B':'A');
        const uid=uidx[key];
        if(!uid){ hatalar.push(`Pozisyon bulunamadı: ${r.mecra} › ${base}-${surf}`); continue; }
        const varMi=mevcut[uid+'|'+ym];
        if(varMi && mode==='keep'){ atla++; continue; }
        if(st==='bos'){ if(varMi){ await sb.from('bookings').delete().eq('id',varMi); ok++; } else atla++; continue; }
        const cid=r.firma?(cidx[norm(r.firma)]||null):null;
        /* Satır başına hata toplanır: güncel yerleşimle çakışan ay sunucuda
           reddedilir ve aktarımın geri kalanını DURDURMAZ, sessizce de
           geçilmez — özet mesajda satır satır yazılır. */
        try{ await api('legacy_booking_upsert',{unit_id:uid,ym,status:st,customer_id:cid,note:r.not||null}); ok++; }
        catch(e){ hatalar.push(`${r.mecra} › ${base}-${surf} · ${ym}: ${e.message||e}`); }
      }
      let msg=`Tamamlandı.\n${ok} kayıt işlendi.\n${atla} satır atlandı.`;
      if(hatalar.length) msg+=`\n\n${hatalar.length} satır aktarılamadı:\n`+hatalar.slice(0,12).join('\n')+(hatalar.length>12?`\n… ve ${hatalar.length-12} tane daha`:'');
      return msg;
    }});
}

/* lAddPos: PS9 kapanış §3 ile `prompt()` tek satırından gerçek bir
   forma çevrildi. Eski sürüm mecra/ürün kimliğini ÇAĞIRANDAN alıyordu,
   A/B yüz yapısını bilmiyordu, dijital ekranı statik yüzeyden ayırmıyordu
   ve mükerrer kodu hiç kontrol etmiyordu. Uygulaması `assets/medya.js`
   içindedir (mecra alanıdır); bu ad yalnız geriye dönük çağrı yüzeyidir. */
async function lAddPos(altId){ return mdPozEkle(altId); }

/* ---------- MÜŞTERİLER ---------- */
async function musteriler(c){
  const list=await api('customers_list'); ui._cust=list;
  c.innerHTML=`<div class="sec-head">
      <div><h3>Müşteriler</h3><p class="sub">${list.length} kayıt</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="custExport()">${ic('download',15)} Excel'e Aktar</button>
        <button class="btn btn-outline btn-sm" onclick="custImport()">${ic('upload',15)} Excel'den Al</button>
        <button class="btn btn-primary btn-sm" onclick="custForm(0)">${ic('plus',15)} Müşteri</button></div>
    </div>
    <div class="sec-card fbar">
      <div class="fbar-row">
        <input class="inp" id="cQ" placeholder="Ara: firma, kişi, telefon, e-posta, vergi no, adres…" oninput="custListe()">
        <select class="inp" id="cSort" onchange="custListe()">
          <option value="ad">Ada göre (A→Z)</option>
          <option value="adz">Ada göre (Z→A)</option>
          <option value="yeni">Önce en yeni</option>
          <option value="eski">Önce en eski</option>
          <option value="puan">Puana göre</option></select>
        <select class="inp" id="cFiltre" onchange="custListe()">
          <option value="">Filtre yok</option>
          <option value="tel">Telefonu olanlar</option>
          <option value="mail">E-postası olanlar</option>
          <option value="eksik">İletişim bilgisi eksik</option>
          <option value="fatura">Fatura bilgisi tam</option>
          <option value="fatura-eksik">Fatura bilgisi eksik</option></select>
        <button class="btn btn-ghost btn-sm" onclick="custTemizle()">Temizle</button>
      </div>
      <p class="muted" id="cSayi" style="font-size:12px;margin:8px 2px 0"></p>
    </div>
    <div id="cRows"></div>`;
  custListe();
}
function custTemizle(){ ['cQ'].forEach(i=>{const e=document.getElementById(i);if(e)e.value='';});
  document.getElementById('cSort').value='ad'; document.getElementById('cFiltre').value=''; custListe(); }
function custListe(){
  const box=document.getElementById('cRows'); if(!box)return;
  const q=(gv('cQ')||'').trim().toLocaleLowerCase('tr');
  const srt=gv('cSort')||'ad', flt=gv('cFiltre')||'';
  let list=(ui._cust||[]).slice();
  /* S02_001: ilgili_kisi provenance etiketidir, kişi arama alanı değildir. */
  if(q) list=list.filter(x=>[x.firma,x.telefon,x.eposta,x.vergi_no,x.vergi_dairesi,x.adres,x.birim,x.fatura_basligi]
    .some(v=>String(v||'').toLocaleLowerCase('tr').includes(q)));
  if(flt==='tel') list=list.filter(x=>x.telefon);
  else if(flt==='mail') list=list.filter(x=>x.eposta);
  else if(flt==='eksik') list=list.filter(x=>!x.telefon&&!x.eposta);
  else if(flt==='fatura') list=list.filter(x=>x.vergi_no&&x.vergi_dairesi);
  else if(flt==='fatura-eksik') list=list.filter(x=>!x.vergi_no||!x.vergi_dairesi);
  const ad=x=>String(x.firma||'').toLocaleLowerCase('tr');
  if(srt==='ad') list.sort((a,b)=>ad(a).localeCompare(ad(b),'tr'));
  else if(srt==='adz') list.sort((a,b)=>ad(b).localeCompare(ad(a),'tr'));
  else if(srt==='yeni') list.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  else if(srt==='eski') list.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  else if(srt==='puan') list.sort((a,b)=>(b.puan||0)-(a.puan||0));
  const say=document.getElementById('cSayi');
  if(say) say.textContent=(q||flt)?`${list.length} / ${(ui._cust||[]).length} müşteri gösteriliyor`:`${list.length} müşteri`;
  box.innerHTML=list.map(x=>`<div class="list-item"><div class="nm">${esc(x.firma||('#'+x.id))}${x.puan?` <span class="pill" title="Puan">${'★'.repeat(Math.min(5,+x.puan||0))}</span>`:''}${evidencePill(x.relationship_evidence)}</div>
    <div class="meta">${x.telefon?esc(x.telefon):''}${x.telefon&&x.eposta?' · ':''}${x.eposta?esc(x.eposta):''}${(!x.telefon&&!x.eposta)?'<span style="color:#b3261e">iletişim yok</span>':''}</div>
    <button class="btn btn-outline btn-sm" onclick="custForm(${x.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="custDel(${x.id})">Sil</button></div>`).join('')
    ||'<p class="empty">Eşleşen müşteri yok.</p>';
}
/* S02_001 — `customers.ilgili_kisi` bir kişi değil, Organization Memory
   provenance etiketidir. Kullanıcıya "Kayıt Niteliği" olarak gösterilir ve
   asla Contact satırı gibi render edilmez. Gerçek kişiler `contacts`'tadır. */
const EVIDENCE_LBL={
  external_directory_only:'Dış dizin kaydı',
  confirmed_historical:'Geçmiş ilişki doğrulanmış',
  observed_historical:'Geçmişte gözlemlenmiş'};
const evidenceLabel=v=>EVIDENCE_LBL[v]||'';
const evidencePill=v=>v?` <span class="pill" title="Kayıt Niteliği">${esc(evidenceLabel(v))}</span>`:'';

/* ilgili_kisi bilinçli olarak bu listede yok: export/import sütunu değildir. */
const CUST_COLS=[
  {key:'firma',label:'Firma',w:28},
  {key:'birim',label:'Birim',w:16},{key:'telefon',label:'Telefon',w:16},
  {key:'eposta',label:'E-posta',w:24},{key:'adres',label:'Adres',w:34},
  {key:'vergi_no',label:'Vergi No',w:14},{key:'vergi_dairesi',label:'Vergi Dairesi',w:18},
  {key:'mersis',label:'Mersis',w:16},{key:'fatura_basligi',label:'Fatura Başlığı',w:24},
  {key:'puan',label:'Puan',w:8}];
async function custExport(){
  const list=ui._cust||await api('customers_list');
  if(!list.length){ mpAlert('Aktarılacak müşteri yok.'); return; }
  await exportRows('musteriler','Müşteriler',CUST_COLS,list);
}
function custImport(){
  importOpen({
    title:'Müşterileri Excel\'den Al',
    hint:'Firma adı zorunlu. Aynı firma adı varsa seçiminize göre güncellenir veya atlanır.',
    fields:CUST_COLS.map(c=>({key:c.key,label:c.label,required:c.key==='firma',
      alias:{firma:['unvan','müşteri','musteri','firma adı','cari'],
             telefon:['tel','gsm','cep'],eposta:['email','mail','e posta'],adres:['adress','address'],
             vergi_no:['vkn','vergi numarası'],vergi_dairesi:['vd'],fatura_basligi:['fatura ünvanı','fatura unvani'],
             birim:['departman'],puan:['yıldız']}[c.key]||[]})),
    modes:[['update','Aynı firma varsa GÜNCELLE'],['skip','Aynı firma varsa ATLA']],
    onApply:async (data,mode)=>{
      const mevcut=await api('customers_list');
      const idx={}; mevcut.forEach(x=>idx[String(x.firma||'').toLocaleLowerCase('tr').trim()]=x);
      let eklendi=0,guncellendi=0,atlandi=0;
      for(const r of data){
        const k=String(r.firma).toLocaleLowerCase('tr').trim();
        const body={...r}; if(body.puan!=='' && body.puan!=null) body.puan=parseInt(body.puan,10)||0; else delete body.puan;
        if(idx[k]){
          if(mode==='skip'){ atlandi++; continue; }
          await api('customer_save',{...body,id:idx[k].id}); guncellendi++;
        } else { await api('customer_save',{...body,id:0}); eklendi++; }
      }
      return `Tamamlandı.\n${eklendi} yeni kayıt eklendi.\n${guncellendi} kayıt güncellendi.\n${atlandi} kayıt atlandı.`;
    }});
}
/* custDel tek tanima indirildi — asagiya bakin */

/* ---------- TEDARİKÇİLER ---------- */
const SUP_COLS=[
  {key:'firma',label:'Firma',w:28},{key:'kategori',label:'Kategori',w:18},
  {key:'ilgili_kisi',label:'İlgili Kişi',w:20},{key:'telefon',label:'Telefon',w:16},
  {key:'eposta',label:'E-posta',w:24},{key:'adres',label:'Adres',w:34},
  {key:'vergi_no',label:'Vergi No',w:14},{key:'vergi_dairesi',label:'Vergi Dairesi',w:18},
  {key:'iban',label:'IBAN',w:30},{key:'notlar',label:'Notlar',w:34}];
async function tedarikciler(c){
  const list=await api('suppliers_list'); ui._sup=list;
  const kat={}; list.forEach(x=>{ x.firma=x.firma||x.name||''; x.kategori=x.kategori||x.type||''; const k=x.kategori||'Diğer'; (kat[k]=kat[k]||[]).push(x); });
  const bloklar=Object.keys(kat).sort().map(k=>`
    <div class="sec-card"><div class="sec-head" style="margin-bottom:10px">
      <h4 style="font-size:14px;margin:0">${esc(k)} <span class="chip">${kat[k].length}</span></h4></div>
      ${kat[k].map(x=>`<div class="list-item">
        <div class="nm">${esc(x.firma)}${x.aktif===false?' <span class="pill">pasif</span>':''}</div>
        <div class="meta">${esc(x.ilgili_kisi||'')}${x.telefon?' · '+esc(x.telefon):''}${x.eposta?' · '+esc(x.eposta):''}</div>
        <button class="btn btn-outline btn-sm" onclick="supForm(${x.id})">Düzenle</button>
        <button class="btn btn-danger btn-sm" onclick="supDel(${x.id})">Sil</button></div>`).join('')}
    </div>`).join('');
  c.innerHTML=`<div class="sec-head">
      <div><h3>Tedarikçiler</h3><p class="sub">${list.length} kayıt · baskı, montaj, malzeme vb.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="supExport()">${ic('download',15)} Excel'e Aktar</button>
        <button class="btn btn-outline btn-sm" onclick="supImport()">${ic('upload',15)} Excel'den Al</button>
        <button class="btn btn-primary btn-sm" onclick="supForm(0)">${ic('plus',15)} Tedarikçi</button></div>
    </div>${bloklar||`<div class="sec-card" style="text-align:center;padding:38px 20px">
      <div style="font-size:15px;font-weight:600;margin-bottom:6px">Henüz tedarikçi eklenmedi</div>
      <p class="muted" style="font-size:13px;margin:0 0 16px">Baskı, montaj, malzeme ve nakliye firmalarını buraya ekleyin.<br>İş Takibi'nde işlere tedarikçi atayabilir, raporlarda takip edebilirsiniz.</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="supForm(0)">${ic('plus',15)} İlk tedarikçiyi ekle</button>
        <button class="btn btn-outline btn-sm" onclick="supImport()">${ic('upload',15)} Excel'den toplu ekle</button></div></div>`}`;
}
/* ===== S14 — yönetim formları: TEK koşullu kayıt yolu ======================
   Form kaydı VERİTABANINDAN tam okur; Kaydet yalnız değişen alanları, form
   açıldığındaki sürüm damgası (updated_at) hâlâ yerindeyse yazar. Değişiklik
   yoksa yazma ve kayıt günlüğü yok. Çakışma/yetki/doğrulama hatasında form
   açık kalır, taslak kaybolmaz. Tedarikçi, ürün, sayfa, not aynı yolu kullanır. */
async function kayitTazeOku(tablo,alan,deger){
  const {data,error}=await sb.from(tablo).select('*').eq(alan,deger).maybeSingle(); if(error) throw error; return data; }
async function kosulluGuncelle(tablo,ilk,yeni,anahtar){
  anahtar=anahtar||'id';
  const f=formFark(ilk,yeni); if(f.bos) return {bos:true};
  const ilkAlan={}; Object.keys(yeni).forEach(k=>{ if(k!=='id') ilkAlan[k]=ilk[k]===undefined?null:ilk[k]; });
  const satir=await api('row_update_cas',{tablo,anahtar,id:ilk[anahtar],patch:f.patch,
    eski:{updated_at:ilk.updated_at===undefined?null:ilk.updated_at},ilk:ilkAlan});
  return {satir};
}
/* Kaydet düğmesinin ortak hata yolu: form açık kalır. */
function kayitHata(e,baslik){ if(!casHata(e)) mpAlert(e&&e.kod==='yetki'?'Bu kaydı değiştirme yetkiniz yok. Değişiklik kaydedilmedi.':hataMetni(e),baslik); }

async function supForm(id){
  let x={aktif:true};
  if(id){ const r=await guard(()=>kayitTazeOku('suppliers','id',id),'Tedarikçi açılamadı'); if(r===null) return;
    if(!r){ mpAlert('Tedarikçi bulunamadı ya da görme yetkiniz yok.','Tedarikçi'); return; } x=r; }
  ui._supIlk=id?x:null;
  const kats=['Baskı','Montaj','Malzeme','Nakliye','Elektrik','Tasarım','Diğer'];
  modal(`<h3 style="margin:0 0 14px">${id?'Tedarikçi Düzenle':'Yeni Tedarikçi'}</h3><input type="hidden" id="sid" value="${id||0}">
    <div class="row2"><div class="field"><label class="flabel">Firma *</label><input class="inp" id="sf" value="${esc(x.firma)}"></div>
    <div class="field"><label class="flabel">Kategori</label><input class="inp" id="sk" list="supkat" value="${esc(x.kategori)}" placeholder="Baskı, Montaj…">
      <datalist id="supkat">${kats.map(k=>`<option value="${k}">`).join('')}</datalist></div></div>
    <div class="row2"><div class="field"><label class="flabel">İlgili Kişi</label><input class="inp" id="sik" value="${esc(x.ilgili_kisi)}"></div>
    <div class="field"><label class="flabel">Telefon</label><input class="inp" id="st" value="${esc(x.telefon)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">E-posta</label><input class="inp" id="se" value="${esc(x.eposta)}"></div>
    <div class="field"><label class="flabel">IBAN</label><input class="inp" id="sib" value="${esc(x.iban)}"></div></div>
    <div class="field"><label class="flabel">Adres</label><input class="inp" id="sa" value="${esc(x.adres)}"></div>
    <div class="row2"><div class="field"><label class="flabel">Vergi No</label><input class="inp" id="sv" value="${esc(x.vergi_no)}"></div>
    <div class="field"><label class="flabel">Vergi Dairesi</label><input class="inp" id="svd" value="${esc(x.vergi_dairesi)}"></div></div>
    <div class="field"><label class="flabel">Notlar</label><textarea class="inp" id="sn">${esc(x.notlar)}</textarea></div>
    <label class="switch" style="margin-bottom:14px"><input type="checkbox" id="sak" ${x.aktif===false?'':'checked'}><span class="sl"></span><span class="txt">Aktif tedarikçi</span></label>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="supSave()">Kaydet</button></div>`);
}
async function supSave(){
  if(!gv('sf').trim()){ mpAlert('Firma adı zorunlu.'); return; }
  const btn=document.querySelector('#modal .btn-primary'); if(btn&&btn.disabled) return;
  const id=+gv('sid');
  const yeni={firma:gv('sf').trim(),kategori:gv('sk'),ilgili_kisi:gv('sik'),telefon:gv('st'),
    eposta:gv('se'),iban:gv('sib'),adres:gv('sa'),vergi_no:gv('sv'),vergi_dairesi:gv('svd'),notlar:gv('sn'),
    aktif:document.getElementById('sak').checked};
  modalBusy(true);
  try{
    if(id){ const r=await kosulluGuncelle('suppliers',ui._supIlk||{},yeni);
      if(r.bos){ modalBusy(false); closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; } }
    else await api('supplier_save',{id:0,...yeni});
  }catch(e){ modalBusy(false); kayitHata(e,'Tedarikçi kaydedilemedi'); return; }
  modalBusy(false); closeModal(); renderSection(); toast('Tedarikçi kaydedildi.');
}
async function supDel(id){ if(!await mpConfirm('Bu tedarikçi silinsin mi?','Tedarikçiyi Sil'))return;
  await guard(()=>api('supplier_delete',{id}),'Tedarikçi silinemedi'); renderSection(); }
async function supExport(){
  const list=ui._sup||await api('suppliers_list');
  if(!list.length){ mpAlert('Aktarılacak tedarikçi yok.'); return; }
  await exportRows('tedarikciler','Tedarikçiler',SUP_COLS,list);
}
function supImport(){
  importOpen({
    title:'Tedarikçileri Excel\'den Al',
    fields:SUP_COLS.map(c=>({key:c.key,label:c.label,required:c.key==='firma',
      alias:{firma:['unvan','tedarikçi','tedarikci','cari'],kategori:['tür','tur','grup','hizmet'],
             ilgili_kisi:['yetkili','kişi','ilgili'],telefon:['tel','gsm','cep'],eposta:['email','mail'],
             vergi_no:['vkn'],vergi_dairesi:['vd'],notlar:['açıklama','aciklama','not']}[c.key]||[]})),
    modes:[['update','Aynı firma varsa GÜNCELLE'],['skip','Aynı firma varsa ATLA']],
    onApply:async (data,mode)=>{
      const mevcut=await api('suppliers_list');
      const idx={}; mevcut.forEach(x=>idx[String(x.firma||'').toLocaleLowerCase('tr').trim()]=x);
      let e=0,g=0,a=0;
      for(const r of data){
        const k=String(r.firma).toLocaleLowerCase('tr').trim();
        if(idx[k]){ if(mode==='skip'){a++;continue;} await api('supplier_save',{...r,id:idx[k].id}); g++; }
        else { await api('supplier_save',{...r,id:0}); e++; }
      }
      return `Tamamlandı.\n${e} yeni tedarikçi eklendi.\n${g} kayıt güncellendi.\n${a} kayıt atlandı.`;
    }});
}

/* S13: düzenleme formu kaydı VERİTABANINDAN tam okur. Önceden ekranın
   önbelleğinden (ui._cust) okuyordu; Hafıza'nın özet sorgusu vergi dairesini
   taşımadığı için form o alanı boş açıyor ve Kaydet vergi dairesini
   sessizce siliyordu. Kaydet artık yalnız değişen alanları, form
   açıldığındaki değerler hâlâ yerindeyse yazar. */
async function custForm(id){
  let x={};
  if(id){ const r=await guard(async()=>{ const {data,error}=await sb.from('customers').select('*').eq('id',id).maybeSingle(); if(error) throw error; return data; },'Kurum açılamadı');
    if(r===null) return; if(!r){ mpAlert('Kurum bulunamadı ya da görme yetkiniz yok.','Kurum'); return; } x=r; }
  ui._custIlk=id?{firma:x.firma,telefon:x.telefon,eposta:x.eposta,adres:x.adres,vergi_no:x.vergi_no,vergi_dairesi:x.vergi_dairesi,puan:x.puan||0}:null;
  modal(`<h3 style="margin:0 0 14px">${id?'Müşteri Düzenle':'Yeni Müşteri'}</h3><input type="hidden" id="cid" value="${id||0}">
    <div class="row2"><div class="field"><label class="flabel" for="cf">Firma</label><input class="inp" id="cf" value="${esc(x.firma)}"></div>
    <div class="field"><label class="flabel" for="cEvid">Kayıt Niteliği</label>
      <input class="inp" id="cEvid" value="${esc(evidenceLabel(x.relationship_evidence)||'—')}" disabled title="Organization Memory kayıt kanıtı (S02_001). Kişi bilgisi değildir; kişiler Kurumlar ekranından eklenir."></div></div>
    <div class="row2"><div class="field"><label class="flabel" for="ct">Telefon</label><input class="inp" id="ct" value="${esc(x.telefon)}"></div>
    <div class="field"><label class="flabel" for="ce">E-posta</label><input class="inp" id="ce" value="${esc(x.eposta)}"></div></div>
    <div class="field"><label class="flabel" for="ca">Adres</label><input class="inp" id="ca" value="${esc(x.adres)}"></div>
    <div class="row3"><div class="field"><label class="flabel" for="cv">Vergi No</label><input class="inp" id="cv" value="${esc(x.vergi_no)}"></div>
    <div class="field"><label class="flabel" for="cvd">Vergi Dairesi</label><input class="inp" id="cvd" value="${esc(x.vergi_dairesi)}"></div>
    <div class="field"><label class="flabel" for="cp">Puan (0-5)</label><input class="inp" id="cp" type="number" min="0" max="5" value="${esc(x.puan||0)}"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="custSave()">Kaydet</button></div>`);
}
/* ilgili_kisi bilinçli olarak gönderilmez: raw provenance evidence olarak
   dokunulmadan kalır (S02_001 §2.4). */
/* S13: önceden hata yakalanmıyordu (başarısız kayıt sessiz kalıyordu), çift
   tıklama iki istek gönderiyordu ve kurum detayından düzenleyen kullanıcı
   listeye atılıyordu. */
async function custSave(){
  const id=+gv('cid'), firma=(gv('cf')||'').trim();
  if(!firma){ mpAlert('Kurum adı zorunlu.','Kurum'); return; }
  const btn=document.querySelector('#modal .btn-primary'); if(btn&&btn.disabled) return;
  const row={firma,telefon:gv('ct'),eposta:gv('ce'),adres:gv('ca'),vergi_no:gv('cv'),vergi_dairesi:gv('cvd'),puan:+gv('cp')};
  let r;
  if(id){
    const f=formFark(ui._custIlk||{},row);
    if(f.bos){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
    modalBusy(true);
    try{ r=await api('row_update_cas',{tablo:'customers',id,patch:f.patch,eski:f.eski}); }
    catch(e){ modalBusy(false); if(!casHata(e)) mpAlert(hataMetni(e),'Kurum kaydedilemedi'); return; }
  } else {
    modalBusy(true);
    r=await guard(()=>api('customer_save',{id:0,...row}),'Kurum kaydedilemedi');
  }
  modalBusy(false);
  if(r===null) return;
  closeModal(); toast('Kurum kaydedildi.');
  if(id&&history.state&&history.state.v==='org'&&ui._org&&String(ui._org.id)===String(id)) orgAc(id);
  else renderSection();
}
async function custDel(id){ if(!await mpConfirm('Bu müşteri silinsin mi? Doluluk ve iş kayıtlarındaki bağlantıları boşalır.','Müşteriyi Sil'))return;
  await guard(()=>api('customer_delete',{id}),'Müşteri silinemedi'); renderSection(); }

/* ================= KURUMLAR (Sprint 02) =================
   Canonical Organization surface. Physical backing = `customers`
   (D-212 / D-227) — yeni `organizations` tablosu yoktur.

   Gerçek iş kişileri YALNIZ `contacts` tablosundan gelir. Legacy
   `customers.ilgili_kisi` bir kişi değil, Organization Memory kayıt
   kanıtıdır ve burada "Kayıt Niteliği" olarak gösterilir (S02_001).
   ======================================================== */
const ORG_ROLES=[['customer','Müşteri'],['advertiser','Reklamveren'],['agency','Ajans'],
  ['supplier','Tedarikçi'],['media_partner','Mecra/Venue'],['public_body','Kamu/STK'],['other','Diğer']];
const orgRoleLabel=v=>(ORG_ROLES.find(r=>r[0]===v)||[null,v])[1];

/* ================= HAFIZA (PS3) =====================================
   Eski `Kurumlar` ekranı düz bir 531 satırlık kurum arşiviydi: kişi
   yalnızca bir kurumun altında yaşıyordu ve "bu numara kimin?" sorusunun
   cevabı yoktu.

   Hafıza, Medyapark'ın kurumsal belleğidir — CRM DEĞİLDİR. Cevapladığı
   sorular: Bu numara kimin? Bu mail kime ait? Bu kişi hangi kurumlarla
   ilişkili? Bu kurumda kimi tanıyoruz? Şu anda hangi işler var? En son ne
   olmuş?

   Fiziksel tablolar değişmedi: Organization = `customers`, Person =
   `contacts`, ilişki = yeni `contact_affiliations` (D-227/§4/§5). */
const HAFTABS=[['tumu','Tümü'],['kurumlar','Kurumlar'],['kisiler','Kişiler'],['belgeler','Belgeler']];

/* Telefon normalizasyonu (§12): "0532 123 45 67" ile "+90 (532) 123-4567"
   aynı numaradır. Rakam dışı her şey atılır, Türkiye için baştaki 90/0
   düşürülür; böylece iki yazım aynı 10 haneye iner. Tam bir telefon
   kütüphanesi DEĞİLDİR ve olmaya çalışmaz - V0 ölçeğinde yerel
   normalizasyon yeterlidir. */
function telNorm(v){
  let d=String(v||'').replace(/\D+/g,'');
  if(d.length>10 && d.startsWith('90')) d=d.slice(2);
  if(d.length>10 && d.startsWith('0'))  d=d.slice(1);
  if(d.length===11 && d.startsWith('0')) d=d.slice(1);
  return d;
}
const mailNorm=v=>String(v||'').trim().toLocaleLowerCase('tr');
const trLower=v=>String(v||'').toLocaleLowerCase('tr');

function hafDurum(){
  try{ return JSON.parse(sessionStorage.getItem('mp_haf')||'null')||{tab:'tumu',q:'',rol:''}; }
  catch(e){ return {tab:'tumu',q:'',rol:''}; }
}
function hafYaz(d){ try{ sessionStorage.setItem('mp_haf',JSON.stringify(d)); }catch(e){} navUrlTazele(); }
function hafTab(t){ hafYaz({...hafDurum(),tab:t}); renderSection(); }
function hafAra(){ hafYaz({...hafDurum(),q:gv('hafQ')||''}); hafCiz(); }
function hafRol(){ hafYaz({...hafDurum(),rol:gv('hafRol')||''}); hafCiz(); }
function hafTemizle(){ hafYaz({...hafDurum(),q:'',rol:''}); renderSection(); }

/* Tek turda dört toplu okuma; kurum/kişi başına sorgu YOK (§14/§35). */
async function kurumlar(c){
  const st=hafDurum();
  if(st.tab==='belgeler') return hafBelgeler(c);
  const [orgs,kisiler,affs,jobs,ents]=await Promise.all([
    api('orgs_overview'), api('contacts_list'), api('affiliations_all'),
    api('jobs_list').catch(()=>[]), api('entries_list&limit=400').catch(()=>[])]);

  const isSay={}, sonAkt={};
  (jobs||[]).forEach(j=>{ if(!j.customer_id) return;
    if((j.lifecycle_status||'acik')!=='kapandi') isSay[j.customer_id]=(isSay[j.customer_id]||0)+1; });
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  (ents||[]).forEach(e=>{ const cid=e.customer_id||(jm[e.job_id]||{}).customer_id;
    if(!cid) return; const t=String(e.occurred_at||'');
    if(!sonAkt[cid]||t>sonAkt[cid]) sonAkt[cid]=t; });

  /* contact_id -> bağlantılar; customer_id -> bağlantılar */
  const affByK={}, affByO={};
  (affs||[]).forEach(a=>{ (affByK[a.contact_id]=affByK[a.contact_id]||[]).push(a);
                          (affByO[a.customer_id]=affByO[a.customer_id]||[]).push(a); });
  const om={}; (orgs||[]).forEach(o=>om[o.id]=o.firma);

  ui._affByKisi=affByK;
  ui._contacts=kisiler||[];
  ui._cust=orgs||[];
  ui._contactMap={}; (kisiler||[]).forEach(k=>ui._contactMap[k.id]=k);
  ui._haf={
    orgs:(orgs||[]).map(o=>({...o, is_sayisi:isSay[o.id]||0, son:sonAkt[o.id]||'',
                             kisi_sayisi:(affByO[o.id]||[]).length||o.contact_count||0})),
    kisiler:(kisiler||[]).map(k=>{ const as=affByK[k.id]||[];
      const pr=as.find(a=>a.is_primary&&a.active)||as[0]||null;
      return {...k, affs:as, primaryAff:pr,
              primaryOrg:pr?(om[pr.customer_id]||''):'',
              telN:telNorm(k.phone), mailN:mailNorm(k.email)}; }),
    om};

  /* §26: hiçbir kurumda rol yoksa kocaman boş bir filtre gösterme. */
  const roller=[...new Set((orgs||[]).flatMap(o=>Array.isArray(o.relationship_roles)?o.relationship_roles:[]))];

  const tab=(k,l,say)=>`<button type="button" class="${st.tab===k?'on':''}" aria-pressed="${st.tab===k}"
    onclick="hafTab('${k}')">${esc(l)}${say!=null?` <span class="tabn mono">${say}</span>`:''}</button>`;

  c.innerHTML=`<div class="sec-head">
      <div><h3>Hafıza</h3><p class="sub">Kurumlar, kişiler ve aralarındaki ilişkiler — kurumsal bellek</p></div>
      <button class="btn btn-sm act act-mem" onclick="hafEkle()">${ic('plus',15)} Hafızaya Ekle</button></div>

    <div class="haf-search">
      <input class="inp haf-q" id="hafQ" value="${esc(st.q)}" autocomplete="off"
        placeholder="İsim, kurum, telefon veya e-posta ara…  ör. 0532 123 45 67"
        oninput="hafAra()" aria-label="Hafızada ara">
      ${roller.length?`<select class="inp inp-sm ${st.rol?'inp-on':''}" id="hafRol" onchange="hafRol()" aria-label="İlişki rolü">
        <option value="">Tüm roller</option>
        ${roller.map(r=>`<option value="${esc(r)}" ${st.rol===r?'selected':''}>${esc(orgRoleLabel(r))}</option>`).join('')}</select>`:''}
      ${(st.q||st.rol)?`<button class="btn btn-ghost btn-sm" onclick="hafTemizle()">Temizle ✕</button>`:''}
    </div>

    <div class="ws-switch inline" role="group" aria-label="Hafıza görünümü" style="margin-bottom:10px">
      ${tab('tumu','Tümü')}${tab('kurumlar','Kurumlar',ui._haf.orgs.length)}${tab('kisiler','Kişiler',ui._haf.kisiler.length)}${tab('belgeler','Belgeler')}
    </div>
    <div id="hafBody"></div>`;
  hafCiz();
  const f=document.getElementById('hafQ'); if(f&&st.q){ f.focus(); f.setSelectionRange(st.q.length,st.q.length); }
}

/* Eşleştirme: isim/kurum metinsel, telefon ve e-posta NORMALİZE (§12). */
function hafKisiEsles(k,q,qTel,qMail){
  if(qTel && k.telN && k.telN.includes(qTel)) return true;
  if(qMail && k.mailN && k.mailN.includes(qMail)) return true;
  return [k.name,k.primaryOrg,k.title,k.department,
          ...(k.affs||[]).map(a=>a.title)].some(v=>trLower(v).includes(q));
}
function hafOrgEsles(o,q,qTel){
  if(qTel && telNorm(o.telefon).includes(qTel)) return true;
  return [o.firma,o.primary_contact,o.eposta,o.vergi_no].some(v=>trLower(v).includes(q));
}

function hafCiz(){
  const box=document.getElementById('hafBody'); if(!box||!ui._haf)return;
  const st=hafDurum();
  const q=trLower(st.q).trim();
  const qTel=telNorm(st.q), qMail=mailNorm(st.q);
  /* Rakam sayısı çok azsa telefon eşleşmesi gürültü olur. */
  const telAra=qTel.length>=4?qTel:'';

  let orgs=ui._haf.orgs, kisiler=ui._haf.kisiler;
  if(st.rol) orgs=orgs.filter(o=>Array.isArray(o.relationship_roles)&&o.relationship_roles.includes(st.rol));
  if(q){ orgs=orgs.filter(o=>hafOrgEsles(o,q,telAra));
         kisiler=kisiler.filter(k=>hafKisiEsles(k,q,telAra,qMail.includes('@')?qMail:'')); }
  else if(st.rol){ kisiler=[]; }

  /* §19 — KISI satiri onem sirasi: 1 ad · 2 kurum baglantilari ·
     3 telefon/e-posta · 4 unvan. Unvan en sona dustu ve sustu; once
     ortada durup kurum adiyla yarisiyordu. */
  const kisiSatir=k=>`<button type="button" class="haf-row" onclick="personAc(${k.id})"
      title="${esc(k.name)}${k.primaryOrg?' · '+esc(k.primaryOrg):''}">
      <span class="haf-k kisi">Kişi</span>
      <span class="haf-b"><span class="haf-t">${esc(k.name)}${k.active===false?' <span class="pill">pasif</span>':''}</span>
        <span class="haf-s">${k.primaryOrg?`<b>${esc(orgKisa(k.primaryOrg))}</b>`:'<span class="muted">kurum bağlantısı yok</span>'}${
          (k.affs||[]).length>1?` <span class="chip">+${k.affs.length-1} kurum</span>`:''}${
          k.primaryAff&&k.primaryAff.title?` <span class="haf-ev">· ${esc(k.primaryAff.title)}</span>`:''}</span></span>
      <span class="haf-r">${k.phone?esc(k.phone):''}${k.phone&&k.email?'<br>':''}${k.email?`<em>${esc(k.email)}</em>`:''}</span></button>`;

  /* §19 — KURUM satiri onem sirasi: 1 gorunen ad · 2 anlamli iliski /
     aktif is baglami · 3 birincil kisi/telefon · 4 KOKEN EN SONDA.
     ONCE: uzun tuzel unvan satiri yutuyor, iliski rolleri ve koken
     rozeti "3 acik is"ten once geliyordu. Ad artik `orgKisa` ile
     kisaltilir; TAM unvan `title` ile erisilebilir kalir ve kimlik
     verisine DOKUNULMAZ (S3.1 §8 ile ayni karar). */
  const orgSatir=o=>{
    const roles=Array.isArray(o.relationship_roles)?o.relationship_roles:[];
    const baglam=[];
    if(o.is_sayisi) baglam.push(`<b>${o.is_sayisi} açık iş</b>`);
    if(o.son)       baglam.push(`son hareket ${esc(trTarih(o.son))}`);
    if(o.kisi_sayisi) baglam.push(`${o.kisi_sayisi} kişi`);
    if(!baglam.length) baglam.push('<span class="muted">aktif bağlam yok</span>');
    return `<button type="button" class="haf-row" onclick="orgAc(${o.id})"
      title="${esc(o.firma||('#'+o.id))}">
      <span class="haf-k kurum">Kurum</span>
      <span class="haf-b"><span class="haf-t">${esc(orgKisa(o.firma||('#'+o.id),54))}${o.active===false?' <span class="pill">arşiv</span>':''}</span>
        <span class="haf-s">${baglam.join(' · ')}${
          roles.length?' '+roles.map(r=>`<span class="chip">${esc(orgRoleLabel(r))}</span>`).join(' '):''}${
          o.relationship_evidence?` <span class="haf-ev">· ${esc(evidenceLabel(o.relationship_evidence))}</span>`:''}</span></span>
      <span class="haf-r">${o.primary_contact?esc(o.primary_contact):''}${o.primary_contact&&o.telefon?'<br>':''}${o.telefon?`<em>${esc(o.telefon)}</em>`:''}</span></button>`;};

  if(st.tab==='kisiler'){
    kisiler=kisiler.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'tr'));
    box.innerHTML=hafSay(kisiler.length,'kişi')+(kisiler.length
      ?kisiler.slice(0,300).map(kisiSatir).join('')
      :'<p class="empty">Eşleşen kişi yok.</p>');
    return;
  }
  if(st.tab==='kurumlar'){
    /* §14/§32: varsayılan sıralama arşiv dökümü gibi değil, operasyonel
       olarak yararlı olanı öne alır — açık işi olan, sonra son hareketi
       olan, sonra kişisi olan. Otomatik "önem skoru" YOK, sadece bilinen
       gerçekler. Arşiv kayıtları GİZLENMEZ, sadece sona düşer. */
    const sirali=orgs.slice().sort((a,b)=>
      (b.is_sayisi-a.is_sayisi) ||
      String(b.son||'').localeCompare(String(a.son||'')) ||
      (b.kisi_sayisi-a.kisi_sayisi) ||
      String(a.firma||'').localeCompare(String(b.firma||''),'tr'));
    box.innerHTML=(q?'':'<p class="haf-hint">Tüm kurumlar — açık işi olan ve son hareket eden önce.</p>')
      +hafSay(sirali.length,'kurum')+(sirali.length
      ?sirali.slice(0,300).map(orgSatir).join('')+(sirali.length>300
        ?'<p class="muted" style="font-size:12.5px;padding:8px 2px">İlk 300 kayıt gösteriliyor — aramayı daraltın.</p>':'')
      :'<p class="empty">Eşleşen kurum yok.</p>');
    return;
  }
  /* Tümü: karışık sonuç. Arama yokken devasa liste dökmek yerine kısa bir
     "işe yarayan" kesit gösterilir (§11). */
  if(!q && !st.rol){
    /* §18: arama yokken PSEUDO-DIZIN dokulmez. 531 kurum + 22 kisi
       gorunum yuksekligini doldurmaz; yalniz "isine yarayan" kisa bir
       kesit gosterilir. Tam dolasim `Kurumlar` sekmesinde (§20). */
    const aktifOrg=orgs.filter(o=>o.is_sayisi>0)
      .sort((a,b)=>String(b.son||'').localeCompare(String(a.son||''))).slice(0,6);
    const sonKisi=kisiler.slice().sort((a,b)=>b.id-a.id).slice(0,5);
    box.innerHTML=`<p class="haf-hint"><b>Aramaya başlayın.</b>
        İsim, kurum, telefon ya da e-posta yazın — telefonu nasıl yazdığınız önemli değil.
        ${orgs.length} kurum ve ${kisiler.length} kişi aranıyor.</p>
      ${aktifOrg.length?`<div class="haf-grp">Aktif işi olan kurumlar</div>`+aktifOrg.map(orgSatir).join(''):''}
      ${sonKisi.length?`<div class="haf-grp">Son eklenen kişiler</div>`+sonKisi.map(kisiSatir).join(''):''}
      ${orgs.length>aktifOrg.length?`<p class="haf-hint" style="margin:12px 0 0">
        Tüm kurumları gezmek için <button type="button" class="btn-link" onclick="hafTab('kurumlar')">Kurumlar</button> sekmesini kullanın.</p>`:''}`;
    return;
  }
  const toplam=orgs.length+kisiler.length;
  const kSira=kisiler.slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'tr')).slice(0,80);
  const oSira=orgs.slice().sort((a,b)=>(b.is_sayisi-a.is_sayisi)||String(a.firma||'').localeCompare(String(b.firma||''),'tr')).slice(0,80);
  box.innerHTML=hafSay(toplam,'sonuç')+(toplam
    ?(kSira.length?`<div class="haf-grp">Kişiler <span class="chip">${kisiler.length}</span></div>`+kSira.map(kisiSatir).join(''):'')
     +(oSira.length?`<div class="haf-grp">Kurumlar <span class="chip">${orgs.length}</span></div>`+oSira.map(orgSatir).join(''):'')
    :'<p class="empty">Eşleşen kayıt yok.</p>');
}
function hafSay(n,birim){ return `<p class="haf-say">${n} ${esc(birim)}</p>`; }

/* ============ HAFIZA > BELGELER (S10 §3) ================================
   Ayrı bir modül ya da ikinci dosya deposu DEĞİL: mevcut `documents` +
   `document_links` kayıtları, aynı kimlik ve bağlantılarla, `document_index`
   görünümünden okunur. Bir dosyanın her görünüm için ayrı kopyası yoktur.
   Varsayılan kompakt liste; resimde küçük önizleme, diğerlerinde biçim
   simgesi. Sunucu tarafı süzme + sayfalama (20/sayfa). */
const BL_DEF={q:'',kat:'',kurum:'',is:'',iliskisiz:false,from:'',to:'',p:1};
function blDurum(){ let d; try{ d=JSON.parse(sessionStorage.getItem('mp_belge')||'null'); }catch(e){ d=null; }
  d={...BL_DEF,...(d||{})}; d.p=Math.max(1,+d.p||1); return d; }
function blYaz(d){ try{ sessionStorage.setItem('mp_belge',JSON.stringify(d)); }catch(e){} }
/* Süzgeç değişimi 1. sayfaya döner (S4.1 kuralı); yalnız liste yeniden
   çizilir — arama kutusu odağını kaybetmez. */
function blFiltre(patch){ blYaz({...blDurum(),...patch,p:1}); blKontrolTazele(); blListeCiz(); }
let _blAraT=null;
function blAra(v){ clearTimeout(_blAraT); _blAraT=setTimeout(()=>blFiltre({q:v}),250); }
function blSayfa(p){ blYaz({...blDurum(),p:Math.max(1,p)}); blListeCiz();
  const b=document.getElementById('blListe'); if(b) b.scrollIntoView({block:'start'}); }
function blTemizle(){ blYaz({...BL_DEF}); renderSection(); }
function blListeTazele(){ if(document.getElementById('blListe')) blListeCiz(); }
/* Tarih süzgeci: yarım/geçersiz değer UYGULANMAZ (S10 §1 ile aynı kural). */
function blTarih(el,k){
  const h=document.getElementById('blTarihHata');
  if(!el.value&&el.validity&&el.validity.badInput){ if(h){ h.textContent='Tarih eksik yazıldı.'; h.hidden=false; } return; }
  if(el.value){ const v=mdTarihDogrula(el.value,k==='from'?'Başlangıç':'Bitiş');
    if(v.hata){ if(h){ h.textContent=v.hata; h.hidden=false; } return; } }
  const st=blDurum(); const y={...st,[k]:el.value||''};
  if(y.from&&y.to&&y.from>y.to){ if(h){ h.textContent='Başlangıç bitişten sonra olamaz.'; h.hidden=false; } return; }
  if(h){ h.hidden=true; h.textContent=''; }
  blFiltre({[k]:el.value||''});
}

async function hafBelgeler(c){
  const st=blDurum();
  const [cu,jobs,team,fac]=await Promise.all([api('customers_min'),api('jobs_list'),
    (ui._team&&ui._team.length)?Promise.resolve(ui._team):api('team_list'),
    api('documents_facets').catch(()=>({kurumlar:[],isler:[],toplam:0}))]);
  ui._team=team||ui._team;
  const cm={}; (cu||[]).forEach(x=>cm[x.id]=x.firma);
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  ui._bl={cm,jm,fac};
  const tab=(k,l,say)=>`<button type="button" class="${k==='belgeler'?'on':''}" aria-pressed="${k==='belgeler'}"
    onclick="hafTab('${k}')">${esc(l)}${say!=null?` <span class="tabn mono">${say}</span>`:''}</button>`;
  c.innerHTML=`<div class="sec-head">
      <div><h3>Hafıza</h3><p class="sub">Kurumlar, kişiler, ilişkiler ve belgeler — kurumsal bellek</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm act act-mem" onclick="belgeForm()">${ic('plus',15)} Belge ekle</button></div></div>
    <div class="ws-switch inline" role="group" aria-label="Hafıza görünümü" style="margin-bottom:10px">
      ${tab('tumu','Tümü')}${tab('kurumlar','Kurumlar')}${tab('kisiler','Kişiler')}${tab('belgeler','Belgeler',fac.toplam)}
    </div>
    <div class="sec-card fbar bl-fbar">
      <div class="fbar-row">
        <input class="inp bl-q" id="blQ" value="${esc(st.q)}" autocomplete="off" oninput="blAra(this.value)"
          placeholder="Belge adı, açıklama, iş ya da kurum adı…" aria-label="Belgelerde ara">
        <select class="inp" id="blKat" onchange="blFiltre({kat:this.value})" aria-label="Belge kategorisi"></select>
        <select class="inp" id="blKurum" onchange="blFiltre({kurum:this.value,is:''})" aria-label="Kurum"></select>
        <select class="inp" id="blIs" onchange="blFiltre({is:this.value})" aria-label="İş"></select>
      </div>
      <div class="fbar-row bl-f2">
        <label class="md-ms-f"><span>Eklenme · başlangıç</span>
          <input class="inp inp-sm" type="date" id="blFrom" value="${esc(st.from)}" min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" onchange="blTarih(this,'from')"></label>
        <label class="md-ms-f"><span>Bitiş</span>
          <input class="inp inp-sm" type="date" id="blTo" value="${esc(st.to)}" min="${MD_TARIH_MIN}" max="${MD_TARIH_MAX}" onchange="blTarih(this,'to')"></label>
        <label class="qc-who bl-il"><input type="checkbox" id="blIl" ${st.iliskisiz?'checked':''} onchange="blFiltre({iliskisiz:this.checked})">
          <span>Yalnız ilişkilendirilmemiş</span></label>
        <span class="fhint bl-not">Arama belge adı, açıklama ve bağlı iş/kurum/sözleşme adlarında yapılır; dosya içeriği aranmaz.</span>
      </div>
      <p class="md-ms-hata" id="blTarihHata" role="alert" hidden></p>
    </div>
    <div id="blAfilt"></div>
    <div id="blYarim"></div>
    <div id="blListe" class="sec-card bl-kart" aria-live="polite"></div>`;
  blKontrolTazele();
  blListeCiz();
  blYarimCiz();
  const f=document.getElementById('blQ'); if(f&&st.q){ f.focus(); f.setSelectionRange(st.q.length,st.q.length); }
}
/* S14 — yarım kalmış yüklemeler: depoya ulaşmış ama hiçbir belge kaydına
   bağlanmamış (form kapanırken temizlenememiş) dosyalar. Yalnız kullanıcının
   kendi yüklemeleri (yönetici: tümü), 2 saatten eskiler. Temizleme açık
   onayla yapılır; depo politikası belge kaydına bağlı bir dosyanın bu
   yoldan silinmesine izin vermez (mevcut belgeler korunur). */
async function blYarimCiz(){
  const box=document.getElementById('blYarim'); if(!box) return;
  let l; try{ const {data,error}=await sb.rpc('yarim_yuklemeler'); if(error) throw error; l=data||[]; }catch(e){ return; }
  if(!box.isConnected) return;
  box.innerHTML=l.length?`<div class="rp2-not uyari" role="status">Kayda bağlanmamış <b>${l.length}</b> yükleme var
      (tamamlanmamış bir kaydetmeden kalmış olabilir; hiçbir belgede görünmez).
      <button type="button" class="btn-link" onclick="blYarimTemizle()">Temizle</button></div>`:'';
  ui._blYarim=l.map(x=>x.name);
}
async function blYarimTemizle(){
  const l=ui._blYarim||[]; if(!l.length) return;
  if(!await mpConfirm(`${l.length} dosya depodan silinsin mi? Bu dosyalar hiçbir belge kaydına bağlı değil. Belgelerdeki dosyalar etkilenmez.`,'Yarım yüklemeleri temizle',{danger:true,ok:'Temizle'})) return;
  const {data,error}=await sb.storage.from('documents').remove(l);
  if(error){ mpAlert(hataMetni(error),'Temizlenemedi'); return; }
  toast(`${(data||[]).length} dosya temizlendi.`); blYarimCiz();
}
/* Seçenekler: yalnız belgesi OLAN kurum/işler; İş kurumla daralır. */
function blKontrolTazele(){
  const st=blDurum(), B=ui._bl; if(!B) return;
  const kat=document.getElementById('blKat');
  if(kat) kat.innerHTML='<option value="">Tüm kategoriler</option>'+BELGE_KAT.map(k=>
    `<option value="${k[0]}" ${st.kat===k[0]?'selected':''}>${esc(k[1])}</option>`).join('');
  const kr=document.getElementById('blKurum');
  if(kr) kr.innerHTML='<option value="">Tüm kurumlar</option>'+(B.fac.kurumlar||[])
    .map(id=>({id,ad:B.cm[id]||('#'+id)})).sort((a,b)=>a.ad.localeCompare(b.ad,'tr'))
    .map(x=>`<option value="${x.id}" ${String(st.kurum)===String(x.id)?'selected':''}>${esc(orgKisa(x.ad,44))}</option>`).join('');
  const is=document.getElementById('blIs');
  if(is) is.innerHTML='<option value="">Tüm işler</option>'+(B.fac.isler||[])
    .map(id=>B.jm[id]).filter(Boolean).filter(j=>!st.kurum||String(j.customer_id)===String(st.kurum))
    .sort((a,b)=>String(a.title).localeCompare(String(b.title),'tr'))
    .map(j=>`<option value="${j.id}" ${String(st.is)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('');
  [['blKat','kat'],['blKurum','kurum'],['blIs','is']].forEach(([id,k])=>{ const el=document.getElementById(id); if(el) el.classList.toggle('inp-on',!!st[k]); });
  const il=document.getElementById('blIl'); if(il) il.checked=!!st.iliskisiz;
  /* Aktif süzgeçler: tek tek kaldırılabilir (S9 kompakt etiket kalıbı). */
  const box=document.getElementById('blAfilt'); if(!box) return;
  const p=[];
  if(st.q) p.push(['Arama',st.q,'q']);
  if(st.kat) p.push(['Kategori',(BELGE_KAT.find(k=>k[0]===st.kat)||[])[1]||st.kat,'kat']);
  if(st.kurum) p.push(['Kurum',orgKisa(B.cm[st.kurum]||('#'+st.kurum),40),'kurum']);
  if(st.is) p.push(['İş',(B.jm[st.is]||{}).title||('#'+st.is),'is']);
  if(st.from||st.to) p.push(['Eklenme',`${st.from?trTarih(st.from):'…'} – ${st.to?trTarih(st.to):'…'}`,'tarih']);
  if(st.iliskisiz) p.push(['Durum','İlişkilendirilmemiş','iliskisiz']);
  box.innerHTML=p.length?`<div class="md-filtreler">
    ${p.map(([k,v,a])=>`<span class="md-fchip">${esc(k)}: <b>${esc(v)}</b>
      <button type="button" aria-label="${esc(k)} süzgecini kaldır" onclick="blFiltreKaldir('${a}')">✕</button></span>`).join('')}
    ${p.length>1?`<button type="button" class="btn-link" onclick="blTemizle()">Tümünü temizle</button>`:''}</div>`:'';
}
function blFiltreKaldir(a){
  const y=a==='tarih'?{from:'',to:''}:a==='iliskisiz'?{iliskisiz:false}:{[a]:''};
  if(a==='q'){ const f=document.getElementById('blQ'); if(f) f.value=''; }
  if(a==='tarih'){ ['blFrom','blTo'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); }
  blFiltre(y);
}
let _blIstek=0;
async function blListeCiz(){
  const box=document.getElementById('blListe'); if(!box) return;
  const st=blDurum(), B=ui._bl||{cm:{},jm:{}};
  const benim=++_blIstek;
  /* encodeURIComponent: URLSearchParams boşluğu "+" yapar, api() ise
     decodeURIComponent ile çözer ("+" boşluğa DÖNMEZ) — çok kelimeli arama
     tek kelime sanılıyordu. */
  const qs=Object.entries({sayfa:st.p,adet:20,q:st.q||'',kat:st.kat||'',kurum:st.kurum||'',is:st.is||'',
    iliskisiz:st.iliskisiz?'1':'',from:st.from||'',to:st.to||''})
    .map(([a,v])=>a+'='+encodeURIComponent(v)).join('&');
  box.classList.add('yukleniyor');
  let v;
  try{ v=await api('documents_index&'+qs); }
  catch(e){ if(benim!==_blIstek) return; box.classList.remove('yukleniyor');
    box.innerHTML=`<p class="empty">Belgeler okunamadı: ${esc(e.message||String(e))}</p>`; return; }
  if(benim!==_blIstek) return;                 // eski istek yeni sonucu ezmesin
  box.classList.remove('yukleniyor');
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const {satirlar,toplam,adet}=v;
  const sayfaAdet=Math.max(1,Math.ceil(toplam/adet)), sayfa=Math.min(st.p,sayfaAdet), bas=(sayfa-1)*adet;
  const suzgecli=!!(st.q||st.kat||st.kurum||st.is||st.from||st.to||st.iliskisiz);
  if(!satirlar.length){
    box.innerHTML=toplam?`<p class="empty">Bu sayfa artık boş. <button type="button" class="btn-link" onclick="blSayfa(1)">İlk sayfaya dön</button></p>`
      :suzgecli?`<p class="empty">Bu süzgeçlerle eşleşen belge yok. <button type="button" class="btn-link" onclick="blTemizle()">Süzgeçleri temizle</button></p>`
      :`<p class="empty">Henüz belge yok. <button type="button" class="btn-link" onclick="belgeForm()">Belge ekle</button></p>`;
    return;
  }
  const ad=(ids,map,f)=>{ const l=(ids||[]).map(id=>map[id]).filter(Boolean); if(!l.length) return '';
    return esc(f(l[0]))+(l.length>1?` <span class="muted">+${l.length-1}</span>`:''); };
  const satir=d=>{ belgeKaydet(d);
    const resim=belgeResimMi(d), kat=belgeKat(d.doc_type);
    const kur=ad(d.customer_ids,B.cm,x=>orgKisa(x,34)), is=ad(d.job_ids,B.jm,j=>j.title);
    return `<div class="bx-row" role="listitem">
      <button type="button" class="bx-main" onclick="belgeDetay(${d.id})" title="${esc(d.ad)}${d.ad!==d.original_name?' · '+esc(d.original_name):''}">
        ${resim?`<span class="bl-th sm bx-th"><img data-belge-yol="${esc(d.storage_path)}" alt="" loading="lazy"></span>`
          :`<span class="bl-ext ${d.provider==='external'?'dis':belgeTurSinif(d)}">${esc(belgeUzanti(d))}</span>`}
        <span class="bx-b"><span class="bx-t">${esc(d.ad)}</span>
          <span class="bx-s"><span class="pill">${esc(kat[1])}</span>
            ${d.iliskisiz?'<span class="pill sand">İlişkilendirilmemiş</span>'
              :`${kur?`<span class="bx-k">${kur}</span>`:''}${is?`<span class="bx-i">${is}</span>`:''}${!kur&&!is&&(d.contract_ids||[]).length?'<span class="bx-k">Sözleşme kaydı</span>':''}`}
          </span></span>
        <span class="bx-m"><time datetime="${esc(d.created_at)}">${esc(trTarih(d.created_at))}</time>${tm[d.uploaded_by_team_id]?`<em>${esc(tm[d.uploaded_by_team_id])}</em>`:''}</span>
      </button>
      <button type="button" class="btn btn-outline btn-sm bx-ac" onclick="belgeAc(${d.id})"
        aria-label="${esc(d.ad)} — ${resim?'önizle':'aç'}">${resim?'Önizle':d.provider==='external'?'Aç ↗':'Aç'}</button>
    </div>`; };
  box.innerHTML=`<p class="haf-say">${toplam} belge${suzgecli?' · süzgeçli':''}</p>
    <div class="bx-list" role="list">${satirlar.map(satir).join('')}</div>
    ${toplam>adet?`<div class="pgr">
      <button class="btn btn-outline btn-sm" ${sayfa<=1?'disabled':''} onclick="blSayfa(${sayfa-1})" aria-label="Önceki sayfa">‹ Önceki</button>
      <span class="pgr-n" aria-live="polite"><b>${sayfa}</b> / ${sayfaAdet}<em>${bas+1}–${bas+satirlar.length} · ${toplam} belge</em></span>
      <button class="btn btn-outline btn-sm" ${sayfa>=sayfaAdet?'disabled':''} onclick="blSayfa(${sayfa+1})" aria-label="Sonraki sayfa">Sonraki ›</button>
    </div>`:''}`;
}

/* Eski `orgListe` çağrıları (varsa) Hafıza çizimine yönlendirilir. */
function orgListe(){ hafCiz(); }

/* ---- Kurum Detayı (PS3 §16) — mevcut renderer GENİŞLETİLDİ, paralel bir
   kurum ekranı açılmadı. Bilgi hiyerarşisi: Kimlik → Kişiler → Aktif İşler
   → Son Güncellemeler → Geçmiş. Boş bölümler gizlenir (§33). */
async function orgAc(id){
  const ekran=ekranBasla();
  let d;
  try{ [d]=await Promise.all([api('org_detail&id='+id),sozUnitYukle()]); }
  catch(e){ if(ekran===_ekranNo) kayitYok('kurum',id,e); return; }
  if(ekran!==_ekranNo)return;
  if(!d||!d.org){ kayitYok('kurum',id); return; }
  ui._org=d.org; ui._orgContacts=d.contacts; ui._orgDetay=d;
  navKayit('org',ui.section,d.org.id,orgKisa(d.org.firma,30));
  const o=d.org, roles=Array.isArray(o.relationship_roles)?o.relationship_roles:[];
  /* S4.4 §19: "Son Güncellemeler" insan yazimidir; sistem hareketleri
     Work zaman cizelgesinde ve Panelim > Hareketler'de kalir. */
  const jobs=d.jobs||[], ents=(d.entries||[]).filter(e=>e.source!=='system'), quotes=d.quotes||[];
  const acik=jobs.filter(j=>(j.lifecycle_status||'acik')!=='kapandi');
  const kapali=jobs.filter(j=>(j.lifecycle_status||'acik')==='kapandi');
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const jm={}; jobs.forEach(j=>jm[j.id]=j);
  const c=document.getElementById('content');

  const kimlik=[o.telefon?`Telefon: ${esc(o.telefon)}`:'', o.eposta?`E-posta: ${esc(o.eposta)}`:'',
                o.adres?`Adres: ${esc(o.adres)}`:'', o.vergi_no?`Vergi No: ${esc(o.vergi_no)}`:'']
               .filter(Boolean).join('<br>');

  c.innerHTML=`<div class="sec-head">
      <div><h3>${geriBtn('kurumlar')} ${esc(o.firma||('#'+o.id))}</h3>
        <p class="sub">${roles.length?roles.map(r=>`<span class="chip">${esc(orgRoleLabel(r))}</span>`).join(' ')
            :'<span class="muted">ilişki rolü tanımlı değil</span>'}${
          acik.length?` · <b>${acik.length} açık iş</b>`:''}${d.contacts.length?` · ${d.contacts.length} kişi`:''}</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="qcAc({custId:${o.id}})">${ic('plus',15)} Güncelleme</button>
        <button class="btn btn-sm act act-work" onclick="jobForm(null,null,{custId:${o.id}})">${ic('plus',15)} Yeni İş</button>
        <button class="btn btn-outline btn-sm" onclick="custForm(${o.id})">Düzenle</button>
        <button class="btn btn-ghost btn-sm" onclick="rpAc('baski',{kurum:${o.id}})" title="Bu kurumun baskı/montaj dökümü">${ic('download',15)} Baskı/montaj dökümü</button></div></div>

    ${kimlik||o.relationship_evidence?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:8px"><h4 style="font-size:14px;margin:0">Kimlik</h4>
        <button class="btn btn-ghost btn-sm" onclick="orgRolForm(${o.id})">Rolleri düzenle</button></div>
      <div class="meta" style="line-height:1.9">${kimlik}${kimlik?'<br>':''}
        ${/* §27: köken/kanıt İKİNCİL. Kimliğin üstünü kaplamaz. */''}
        ${o.relationship_evidence?`<span class="haf-ev">kayıt niteliği: ${esc(evidenceLabel(o.relationship_evidence))}</span>`:''}
      </div></div>`:''}

    ${orgTicariKart(d)}
    ${orgBelgeKart(d)}

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Kişiler <span class="chip">${d.contacts.length}</span></h4>
        <button class="btn btn-outline btn-sm" onclick="contactForm(0,${o.id})">${ic('plus',15)} Kişi Ekle</button></div>
      <div id="orgKisiler"></div></div>

    ${medyaBolumu(d.medya,{kurum:o.id,id:'orgMedya',baslik:'Aktif Mecralar'})}

    ${acik.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Aktif İşler <span class="chip">${acik.length}</span></h4></div>
      ${acik.map(j=>`<button type="button" class="pd-row" onclick="workAc(${j.id})">
        <span class="pd-b"><span class="pd-t">${j.is_urgent?'<span class="pu-b acil">⚡</span> ':''}${esc(j.title)}</span>
          <span class="pd-s">${esc(JOBLBL[j.status]||j.status)}${j.primary_contact_id&&ui._contactMap&&ui._contactMap[j.primary_contact_id]?' · '+esc(ui._contactMap[j.primary_contact_id].name):''}</span></span>
        <span class="pd-r">${j.lifecycle_status==='bekliyor'?'<span class="pill sand">Bekliyor</span>':'<span class="pill">Açık</span>'}</span></button>`).join('')}
    </div>`:''}

    ${ents.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Son Güncellemeler <span class="chip">${ents.length}</span></h4></div>
      <div class="pu-list">${ents.slice(0,15).map(e=>{
        const j=jm[e.job_id]||null;
        return `<article class="pu ${e.source==='system'?'sys':''}">
          <div class="pu-h"><b>${esc(e.source==='system'?'Sistem':(tm[e.created_by_team_id]||'—'))}</b>
            <time>${esc(psZaman(e.occurred_at))}</time>
            ${e.is_urgent?'<span class="pu-b acil">⚡ Acil</span>':''}</div>
          ${String(e.body||'').trim()?`<p class="pu-t" onclick="psAc(this)">${esc(e.body)}</p>`:''}
          ${ekSeridi(e.document_links)}
          ${j?`<div class="pu-c"><button type="button" class="pu-chip" onclick="workAc(${j.id})">${esc(j.title)}</button></div>`:''}
        </article>`;}).join('')}</div></div>`:''}

    ${(kapali.length||quotes.length)?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Geçmiş</h4></div>
      ${kapali.length?`<div class="meta" style="margin-bottom:6px">Kapanan işler <span class="chip">${kapali.length}</span></div>
        ${kapali.slice(0,8).map(j=>`<button type="button" class="pd-row" onclick="workAc(${j.id})">
          <span class="pd-b"><span class="pd-t">${esc(j.title)}</span>
            <span class="pd-s">${esc(CLOSELBL[j.closed_reason]||j.closed_reason||'kapandı')}</span></span></button>`).join('')}`:''}
      ${quotes.length?`<div class="meta" style="margin:10px 0 6px">Teklifler <span class="chip">${quotes.length}</span></div>
        ${quotes.slice(0,8).map(t=>`<div class="list-item"><div class="nm">Teklif #${t.id}${t.revision_no>1?` <span class="pill">rev ${t.revision_no}</span>`:''}</div>
          <div class="meta">${esc(money(t.total))}${t.created_at?' · '+esc(trTarih(t.created_at)):''}</div>
          <button class="btn btn-outline btn-sm" onclick="quoteView(${t.id})">Aç</button></div>`).join('')}`:''}
    </div>`:''}`;
  orgKisiCiz();
}
/* Kişi satırı artık BAĞLANTIYA özgü unvan/birim gösterir: aynı kişi başka
   kurumda başka unvan taşıyabilir (§6/§31). */
function orgKisiCiz(){
  const box=document.getElementById('orgKisiler'); if(!box)return;
  const list=ui._orgContacts||[];
  box.innerHTML=list.map(k=>{
    const digerleri=(k.aff_count||0);
    const unvan=[k.aff_title||k.title,k.aff_department||k.department].filter(Boolean).map(esc).join(' · ');
    /* `aff.is_primary` = bu KİŞİNİN ana kurumu burasıdır. Kurumun ana
       muhatabı DEĞİLDİR (o ayrı bir eksen: contacts.is_primary /
       contacts_one_primary_per_customer). Aynı kurumdaki herkesin ana
       kurumu burası olabilir, dolayısıyla "birincil" demek yanıltıcıydı. */
    return `<div class="list-item" style="cursor:pointer" onclick="personAc(${k.id})">
      <div class="nm">${esc(k.name)}${k.is_primary?' <span class="pill" title="Bu kişinin ana kurumu burası">ana kurumu</span>':''}${k.aff_active===false?' <span class="pill">pasif</span>':''}</div>
      <div class="meta">${unvan}${unvan&&(k.phone||k.email)?' · ':''}${k.phone?esc(k.phone):''}${k.phone&&k.email?' · ':''}${k.email?esc(k.email):''}</div>
      <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();contactForm(${k.id},${ui._org.id})">Düzenle</button>
      ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();contactDel(${k.id})">Sil</button>`:''}</div>`;}).join('')
    ||'<p class="empty">Henüz kişi eklenmedi.</p>';
}

/* ---- + Hafızaya Ekle (PS3 §19-§22) ----
   Sihirbaz YOK: tek seçim, sonra tek kısa form. */
function hafEkle(){
  modal(`<h3 style="margin:0 0 6px">Hafızaya Ekle</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 16px">Ne eklemek istiyorsun?</p>
    <div class="haf-pick">
      <button type="button" class="haf-pick-b" onclick="personForm()">
        <b>Kişi</b><span>Bir insan — telefon, e-posta, kurum bağlantıları</span></button>
      <button type="button" class="haf-pick-b" onclick="orgQuickForm()">
        <b>Kurum</b><span>Bir şirket, ajans, kurum veya işletme</span></button>
      <button type="button" class="haf-pick-b" onclick="belgeForm()">
        <b>Belge</b><span>Sözleşme, teklif, tasarım, fotoğraf, fatura, katalog — işe bağlamak zorunlu değil</span></button>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button></div>`);
}

/* Kurum: TEK zorunlu alan ad (§20). Rol, adres, vergi, fatura bilgisi
   oluşturmada SORULMAZ — sonradan zenginleştirilir. */
function orgQuickForm(ctx){
  ctx=ctx||{};
  modal(`<h3 style="margin:0 0 14px">Yeni Kurum</h3>
    <input type="hidden" id="oqRet" value="${ctx.ret||''}">
    <div class="field"><label class="flabel" for="oqAd">Kurum adı *</label>
      <input class="inp" id="oqAd" autocomplete="off" oninput="orgDupKontrol()"
        placeholder="ör. ABC Reklam Ajansı"></div>
    <div id="oqDup"></div>
    <p class="fhint">Telefon, adres, vergi ve ilişki rolü sonradan eklenebilir.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="orgQuickSave()">Oluştur</button></div>`);
  const f=document.getElementById('oqAd'); if(f)f.focus();
}
/* §22: isim benzerliğinde UYAR, engelleme. Sessiz birleştirme YOK. */
function orgDupKontrol(){
  const box=document.getElementById('oqDup'); if(!box)return;
  const q=trLower(gv('oqAd')).trim();
  if(q.length<3){ box.innerHTML=''; return; }
  const hit=(ui._cust||[]).filter(x=>trLower(x.firma).includes(q)).slice(0,4);
  box.innerHTML=hit.length?`<div class="haf-dup"><b>Benzer kayıt var:</b>
    ${hit.map(x=>`<button type="button" class="btn-link" onclick="closeModal();orgAc(${x.id})">${esc(x.firma)}</button>`).join(' · ')}
    <span class="muted">— yine de yeni kurum oluşturabilirsin.</span></div>`:'';
}
async function orgQuickSave(){
  const ad=(gv('oqAd')||'').trim();
  if(!ad){ mpAlert('Kurum adı zorunlu.'); return; }
  modalBusy(true);
  const r=await guard(()=>api('customer_save',{id:0,firma:ad}),'Kurum eklenemedi');
  modalBusy(false);
  if(r===null)return;
  ui._cust=await api('customers_list')||[];
  const ret=gv('oqRet')||'';
  closeModal(); toast('Kurum eklendi.');
  if(ret==='job'){ const st=ui._jobDraft||{}; ui._jobDraft=null;
    await jobFormGeriYukle(st,{custId:r&&r.id}); return; }
  if(r&&r.id) orgAc(r.id); else renderSection();
}

/* Kişi: TEK zorunlu alan ad (§21). Telefon/e-posta/kurum opsiyonel.
   Kurum verilmezse kişi YİNE kaydedilir — sahte kurum uydurulmaz. */
function personForm(ctx){
  ctx=ctx||{};
  const custs=(ui._cust||[]).slice().sort((a,b)=>String(a.firma||'').localeCompare(String(b.firma||''),'tr'));
  modal(`<h3 style="margin:0 0 14px">Yeni Kişi</h3>
    <input type="hidden" id="pfRet" value="${ctx.ret||''}">
    <div class="field"><label class="flabel" for="pfAd">Ad Soyad *</label>
      <input class="inp" id="pfAd" autocomplete="off" placeholder="ör. Ahmet Yılmaz"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="pfTel">Telefon</label>
        <input class="inp" id="pfTel" autocomplete="off" oninput="personDupKontrol()" placeholder="0532 …"></div>
      <div class="field"><label class="flabel" for="pfMail">E-posta</label>
        <input class="inp" id="pfMail" autocomplete="off" oninput="personDupKontrol()"></div></div>
    <div id="pfDup"></div>
    <div class="field"><label class="flabel" for="pfOrg">Kurum (opsiyonel)</label>
      <select class="inp" id="pfOrg" data-ara><option value="">— kurum bağlantısı yok —</option>
        ${custs.map(x=>`<option value="${x.id}" ${String(ctx.custId)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}
      </select></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="pfUnvan">Unvan</label>
        <input class="inp" id="pfUnvan" placeholder="ör. Pazarlama Müdürü"></div>
      <div class="field"><label class="flabel" for="pfBirim">Birim</label>
        <input class="inp" id="pfBirim"></div></div>
    <p class="fhint">Kurum seçmezsen kişi yine kaydedilir; bağlantıyı sonra ekleyebilirsin.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="personSave()">Oluştur</button></div>`);
  const f=document.getElementById('pfAd'); if(f)f.focus();
}
/* §22: GÜÇLÜ sinyaller — normalize telefon ve e-posta. İsim tek başına
   yeterli DEĞİL ve hiçbir şey engellenmez; mevcut kişi gösterilir. */
function personDupKontrol(){
  const box=document.getElementById('pfDup'); if(!box)return;
  const t=telNorm(gv('pfTel')), m=mailNorm(gv('pfMail'));
  let hit=[];
  if(t.length>=7) hit=(ui._contacts||[]).filter(k=>telNorm(k.phone)===t);
  if(!hit.length && m.includes('@')) hit=(ui._contacts||[]).filter(k=>mailNorm(k.email)===m);
  box.innerHTML=hit.length?`<div class="haf-dup"><b>Bu iletişim bilgisi zaten kayıtlı:</b>
    ${hit.slice(0,3).map(k=>`<button type="button" class="btn-link" onclick="closeModal();personAc(${k.id})">${esc(k.name)}</button>`).join(' · ')}
    <span class="muted">— mevcut kişiyi açabilir ya da yeni kayıt oluşturabilirsin.</span></div>`:'';
}
async function personSave(){
  const ad=(gv('pfAd')||'').trim();
  if(!ad){ mpAlert('Ad Soyad zorunlu.'); return; }
  const oid=+gv('pfOrg')||null;
  modalBusy(true);
  /* contacts.customer_id doğrudan YAZILMAZ: bağlantı yazılır, tetikleyici
     uyumluluk kolonunu aynalar (§9). Kurum yoksa kolon NULL kalır. */
  const r=await guard(()=>api('contact_save',{id:0,name:ad,
    phone:gv('pfTel')||null, email:gv('pfMail')||null,
    title:oid?(gv('pfUnvan')||null):null, department:oid?(gv('pfBirim')||null):null,
    customer_id:null, active:true}),'Kişi kaydedilemedi');
  if(r===null){ modalBusy(false); return; }
  if(oid && r && r.id){
    await guard(()=>api('affiliation_save',{id:0,contact_id:r.id,customer_id:oid,
      title:gv('pfUnvan')||null, department:gv('pfBirim')||null,
      is_primary:true, active:true}),'Kurum bağlantısı eklenemedi');
  }
  modalBusy(false);
  ui._contacts=await api('contacts_list')||[];
  const ret=gv('pfRet')||'';
  closeModal(); toast('Kişi eklendi.');
  if(ret==='job'){ personJobDonus(r&&r.id, oid); return; }
  if(r&&r.id) personAc(r.id); else renderSection();
}

/* ---- Kişi Detayı (PS3 §17) ----
   "Bu kişi kim ve Medyapark bağlamında nerelerle ilişkili?" */
async function personAc(id){
  const ekran=ekranBasla();
  let d;
  try{ d=await api('person_detail&id='+id); }
  catch(e){ if(ekran===_ekranNo) kayitYok('kisi',id,e); return; }
  if(ekran!==_ekranNo)return;
  if(!d||!d.person){ kayitYok('kisi',id); return; }
  ui._person=d.person; ui._personAffs=d.affiliations;
  navKayit('kisi',ui.section,d.person.id,d.person.name);
  const k=d.person, affs=d.affiliations||[], jobs=d.jobs||[], ents=d.entries||[];
  const tm={}; (ui._team||[]).forEach(t=>tm[t.id]=t.name);
  const pr=affs.find(a=>a.is_primary&&a.active)||affs[0]||null;
  const c=document.getElementById('content');
  c.innerHTML=`<div class="sec-head">
      <div><h3>${geriBtn('kurumlar')} ${esc(k.name)}</h3>
        <p class="sub">${pr?`${esc(pr.firma)}${pr.title?' · '+esc(pr.title):''}`:'<span class="muted">kurum bağlantısı yok</span>'}${
          affs.length>1?` · <span class="chip">${affs.length} kurum</span>`:''}${k.active===false?' · <span class="pill">pasif</span>':''}</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="qcAc({contactId:${k.id}${pr?`,custId:${pr.customer_id}`:''}})">${ic('plus',15)} Güncelleme</button>
        <button class="btn btn-sm act act-work" onclick="personYeniIs(${k.id})">${ic('plus',15)} Yeni İş</button>
        <button class="btn btn-outline btn-sm" onclick="contactForm(${k.id},${pr?pr.customer_id:0})">Düzenle</button></div></div>

    ${(k.phone||k.email||k.notes)?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:8px"><h4 style="font-size:14px;margin:0">İletişim</h4></div>
      <div class="meta" style="line-height:1.9">
        ${k.phone?`Telefon: <a href="tel:${esc(k.phone)}">${esc(k.phone)}</a><br>`:''}
        ${k.email?`E-posta: <a href="mailto:${esc(k.email)}">${esc(k.email)}</a><br>`:''}
        ${k.notes?`Not: ${esc(k.notes)}`:''}</div></div>`:''}

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Kurum Bağlantıları <span class="chip">${affs.length}</span></h4>
        <button class="btn btn-outline btn-sm" onclick="affForm(0,${k.id})">${ic('plus',15)} Kurum Ekle</button></div>
      ${affs.length?affs.map(a=>`<div class="list-item">
        <div class="nm"><button type="button" class="btn-link" onclick="orgAc(${a.customer_id})">${esc(a.firma)}</button>
          ${a.is_primary?' <span class="pill">birincil</span>':''}${a.active===false?' <span class="pill">pasif</span>':''}</div>
        <div class="meta">${[a.title,a.department].filter(Boolean).map(esc).join(' · ')||'<span class="muted">unvan girilmedi</span>'}</div>
        <button class="btn btn-outline btn-sm" onclick="affForm(${a.id},${k.id})">Düzenle</button>
        ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="affDel(${a.id},${k.id})">Kaldır</button>`:''}</div>`).join('')
      :'<p class="empty">Bu kişi henüz bir kuruma bağlanmadı. <b>Kurum Ekle</b> ile bağlayabilirsin.</p>'}
    </div>

    ${jobs.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">İlgili İşler <span class="chip">${jobs.length}</span></h4>
        <p class="sub" style="margin:0">bu kişinin birincil kişi olduğu işler</p></div>
      ${jobs.map(j=>`<button type="button" class="pd-row" onclick="workAc(${j.id})">
        <span class="pd-b"><span class="pd-t">${j.is_urgent?'<span class="pu-b acil">⚡</span> ':''}${esc(j.title)}</span>
          <span class="pd-s">${esc(JOBLBL[j.status]||j.status)}</span></span>
        <span class="pd-r"><span class="pill">${esc(LIFELBL[j.lifecycle_status||'acik'])}</span></span></button>`).join('')}
    </div>`:''}

    ${ents.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Son Güncellemeler <span class="chip">${ents.length}</span></h4></div>
      <div class="pu-list">${ents.slice(0,15).map(e=>`<article class="pu ${e.source==='system'?'sys':''}">
        <div class="pu-h"><b>${esc(e.source==='system'?'Sistem':(tm[e.created_by_team_id]||'—'))}</b>
          <time>${esc(psZaman(e.occurred_at))}</time>
          ${e.is_urgent?'<span class="pu-b acil">⚡ Acil</span>':''}</div>
        <p class="pu-t" onclick="psAc(this)">${esc(e.body)}</p>
        ${e.job_id?`<div class="pu-c"><button type="button" class="pu-chip" onclick="workAc(${e.job_id})">İşi aç</button></div>`:''}
      </article>`).join('')}</div></div>`:''}`;
}
/* Kişiden yeni iş (§30): tek birincil bağlantı varsa önerilir, birden çok
   varsa KEYFİ seçim yapılmaz — kullanıcı seçer. */
function personYeniIs(kid){
  const affs=ui._personAffs||[];
  const pr=affs.filter(a=>a.active!==false);
  const ctx={contactId:kid};
  if(pr.length===1) ctx.custId=pr[0].customer_id;
  jobForm(null,null,ctx);
}
/* Bağlantı formu — unvan/birim BAĞLANTIYA aittir (§31). */
function affForm(id,contactId){
  const a=(ui._personAffs||[]).find(x=>x.id===id)||{};
  const custs=(ui._cust||[]).slice().sort((x,y)=>String(x.firma||'').localeCompare(String(y.firma||''),'tr'));
  modal(`<h3 style="margin:0 0 14px">${id?'Kurum Bağlantısını Düzenle':'Kurum Bağlantısı Ekle'}</h3>
    <input type="hidden" id="afId" value="${id||0}"><input type="hidden" id="afK" value="${contactId}">
    <div class="field"><label class="flabel" for="afOrg">Kurum *</label>
      <div class="inp-add">
        <select class="inp" id="afOrg" data-ara ${id?'disabled':''}>
          ${custs.map(x=>`<option value="${x.id}" ${String(a.customer_id)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}
        </select>
        ${id?'':`<button type="button" class="add-b" title="Yeni kurum" onclick="affYeniKurum()">+</button>`}</div></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="afT">Unvan</label>
        <input class="inp" id="afT" value="${esc(a.title)}" placeholder="ör. Pazarlama Müdürü"></div>
      <div class="field"><label class="flabel" for="afD">Birim</label>
        <input class="inp" id="afD" value="${esc(a.department)}" placeholder="ör. Pazarlama"></div></div>
    <label class="switch" style="margin-bottom:8px"><input type="checkbox" id="afP" ${a.is_primary?'checked':''}><span class="sl"></span><span class="txt">Birincil kurum</span></label>
    <label class="switch" style="margin-bottom:14px"><input type="checkbox" id="afA" ${a.active===false?'':'checked'}><span class="sl"></span><span class="txt">Aktif</span></label>
    <p class="fhint">Unvan ve birim bu KURUMDAKİ rolü anlatır; kişinin telefonu ve e-postası kendi kaydındadır.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="affSave()">Kaydet</button></div>`);
}
async function affYeniKurum(){
  const ad=await mpPrompt('Kurum adı','Yeni Kurum');
  if(!ad||!ad.trim()) return;
  const r=await guard(()=>api('customer_save',{id:0,firma:ad.trim()}),'Kurum eklenemedi');
  if(r===null) return;
  ui._cust=await api('customers_list')||[];
  const sel=document.getElementById('afOrg');
  if(sel){ sel.innerHTML=(ui._cust||[]).slice().sort((x,y)=>String(x.firma||'').localeCompare(String(y.firma||''),'tr'))
      .map(x=>`<option value="${x.id}" ${r&&String(r.id)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join(''); }
  toast('Kurum eklendi.');
}
async function affSave(){
  const kid=+gv('afK'), oid=+gv('afOrg');
  if(!oid){ mpAlert('Kurum seçin.'); return; }
  modalBusy(true);
  const r=await guard(()=>api('affiliation_save',{id:+gv('afId')||0,contact_id:kid,customer_id:oid,
    title:gv('afT')||null, department:gv('afD')||null,
    is_primary:document.getElementById('afP').checked,
    active:document.getElementById('afA').checked}),'Bağlantı kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Kurum bağlantısı kaydedildi.'); personAc(kid);
}
async function affDel(id,kid){
  /* §37: bağlantı silmek KİŞİYİ ya da KURUMU silmez. */
  if(!await mpConfirm('Bu kurum bağlantısı kaldırılsın mı? Kişi ve kurum kayıtları silinmez.','Bağlantıyı Kaldır'))return;
  const r=await guard(()=>api('affiliation_delete&id='+id),'Bağlantı kaldırılamadı'); if(r===null)return;
  toast('Bağlantı kaldırıldı.'); personAc(kid);
}

/* S13: düzenlemede kişi VERİTABANINDAN okunur. Önceden son açılan kurumun
   kişi önbelleğinden okunuyordu: kişi sayfasından "Düzenle" formu BOŞ
   açıyor, Kaydet telefon/e-posta/unvanı siliyordu; kurum sayfasında ise
   "Birincil kişi" kutusu bağlantının (kişinin ana kurumu) bayrağını gösterip
   kurumun ana kişisi bayrağına yazıyordu. Kaydet yalnız değişen alanları
   yazar ve kullanıcı bulunduğu ekranda kalır. */
async function contactForm(id,customerId){
  let x={};
  if(id){ const r=await guard(async()=>{ const {data,error}=await sb.from('contacts').select('*').eq('id',id).maybeSingle(); if(error) throw error; return data; },'Kişi açılamadı');
    if(r===null) return; if(!r){ mpAlert('Kişi bulunamadı ya da görme yetkiniz yok.','Kişi'); return; } x=r; }
  ui._kisiIlk=id?{name:x.name,title:x.title,department:x.department,phone:x.phone,email:x.email,notes:x.notes,is_primary:!!x.is_primary,active:x.active!==false,_kurum:x.customer_id}:null;
  modal(`<h3 style="margin:0 0 14px">${id?'Kişi Düzenle':'Yeni Kişi'}</h3>
    <input type="hidden" id="kid" value="${id||0}"><input type="hidden" id="kcid" value="${customerId||0}">
    <div class="row2"><div class="field"><label class="flabel" for="kn">Ad Soyad *</label><input class="inp" id="kn" value="${esc(x.name)}"></div>
    <div class="field"><label class="flabel" for="kt">Unvan</label><input class="inp" id="kt" value="${esc(x.title)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel" for="kd">Birim</label><input class="inp" id="kd" value="${esc(x.department)}"></div>
    <div class="field"><label class="flabel" for="kp">Telefon</label><input class="inp" id="kp" value="${esc(x.phone)}"></div></div>
    <div class="field"><label class="flabel" for="ke">E-posta</label><input class="inp" id="ke" value="${esc(x.email)}"></div>
    <div class="field"><label class="flabel" for="kno">Not</label><textarea class="inp" id="kno">${esc(x.notes)}</textarea></div>
    <label class="switch" style="margin-bottom:8px"><input type="checkbox" id="kpr" ${x.is_primary?'checked':''}><span class="sl"></span><span class="txt">Kurumun ana kişisi</span></label>
    <label class="switch" style="margin-bottom:14px"><input type="checkbox" id="kak" ${x.active===false?'':'checked'}><span class="sl"></span><span class="txt">Aktif</span></label>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="contactSave()">Kaydet</button></div>`);
  const f=document.getElementById('kn'); if(f)f.focus();
}
async function contactSave(){
  const ad=(gv('kn')||'').trim();
  if(!ad){ mpAlert('Ad Soyad zorunlu.'); return; }
  const cid=+gv('kcid')||null, id=+gv('kid');
  const btn=document.querySelector('#modal .btn-primary'); if(btn&&btn.disabled) return;
  const alan={name:ad,title:gv('kt')||null,department:gv('kd')||null,phone:gv('kp')||null,email:gv('ke')||null,notes:gv('kno')||null,
    is_primary:document.getElementById('kpr').checked,active:document.getElementById('kak').checked};
  let govde;
  if(id){
    const ilk=ui._kisiIlk||{}; const f=formFark(ilk,alan);
    if(f.bos){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
    govde={id,...f.patch,ana_kurum:ilk._kurum||null};
  } else govde={id:0,customer_id:cid,...alan};
  modalBusy(true);
  const r=await guard(()=>api('contact_save',govde),'Kişi kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Kişi kaydedildi.');
  const st=history.state&&history.state.mp?history.state:null;
  if(st&&st.v==='kisi'&&id&&String(st.id)===String(id)) personAc(id);
  else orgAc(cid||(ui._org||{}).id);
}
async function contactDel(id){
  if(!await mpConfirm('Bu kişi silinsin mi?','Kişiyi Sil'))return;
  const r=await guard(()=>api('contact_delete&id='+id),'Kişi silinemedi'); if(r===null)return;
  toast('Kişi silindi.'); orgAc((ui._org||{}).id);
}
function orgRolForm(id){
  const o=ui._org||{}; const cur=Array.isArray(o.relationship_roles)?o.relationship_roles:[];
  modal(`<h3 style="margin:0 0 6px">İlişki Rolleri</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Kurumun uzun dönemli, tanımlayıcı rolleri. Belirli bir işteki taraf rolü ayrıdır.</p>
    <input type="hidden" id="orid" value="${id}">
    ${ORG_ROLES.map(r=>`<label class="switch" style="margin-bottom:8px">
      <input type="checkbox" class="orgRol" value="${r[0]}" ${cur.includes(r[0])?'checked':''}>
      <span class="sl"></span><span class="txt">${esc(r[1])}</span></label>`).join('')}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="orgRolSave()">Kaydet</button></div>`);
}
async function orgRolSave(){
  const id=+gv('orid');
  const roles=[...document.querySelectorAll('.orgRol')].filter(x=>x.checked).map(x=>x.value);
  modalBusy(true);
  const r=await guard(()=>api('customer_save',{id,relationship_roles:roles}),'Roller kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Roller kaydedildi.'); orgAc(id);
}

/* ---------- TEKLİFLER ---------- */
async function teklifler(c){
  const list=await api('quotes_list');
  ui._quotes=list;
  const rows=list.map(q=>`<tr><td>#${q.id}</td><td>${esc(q.customer_name||'-')}<br><span class="muted" style="font-size:12px">${esc(q.firma||'')}</span></td>
    <td>${esc(q.telefon||'')}</td><td>${money(q.total)}</td><td><span class="badge-st st-${q.status}">${q.status}</span></td><td>${(q.created_at||'').slice(0,10)}</td>
    <td>${q.kaynak==='panel'?'<span class="pill">panel</span> ':''}<button class="btn btn-outline btn-sm" onclick="${'${q.kaynak===\'panel\'?`qbEdit(${q.id})`:`quoteView(${q.id})`}'}">Aç</button> <button class="btn btn-danger btn-sm" onclick="quoteDel(${q.id})">Sil</button></td></tr>`).join('');
  c.innerHTML=`<div class="sec-card"><div class="sec-head">
      <div><h3>Teklifler</h3><p class="sub">${list.length} kayıt · siteden gelenler ve panelde hazırlananlar</p></div>
      <button class="btn btn-primary btn-sm" onclick="qbNew()">${ic('plus',15)} Yeni Teklif Hazırla</button></div>
    ${rows?`<table class="tbl"><thead><tr><th>#</th><th>Müşteri</th><th>Telefon</th><th>Tutar</th><th>Durum</th><th>Tarih</th><th></th></tr></thead><tbody>${rows}</tbody></table>`:'<p class="muted">Henüz teklif yok.</p>'}</div>`;
}
async function quoteView(id){
  /* Offer durum yönetimi Yönetim'e aittir (quotes RLS: write/modify =
     is_admin). team_member Offer'ı Work bağlamında okur; ona RLS'in
     reddedeceği bir kaydetme düğmesi gösterilmez (07 §11). */
  if(isAdmin()) sb.from('quotes').update({okundu:true}).eq('id',id).then(()=>yeniTeklifKontrol(),()=>{});
  const d=await api('quote_get&id='+id); const q=d.quote;
  const QL={yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'};
  const items=d.items.map(i=>`<tr><td>${esc(i.mecra_name)} — ${esc(i.unit_name)}</td><td>${esc(i.period)}</td><td>${esc(i.start_day||'-')}</td><td style="text-align:right">${money(i.price)}</td></tr>`).join('');
  modal(`<h3 style="margin:0 0 4px">Teklif #${q.id}</h3><p class="muted" style="margin:0 0 14px">${esc(q.customer_name||'')} · ${esc(q.firma||'')} · ${esc(q.telefon||'')} · ${esc(q.eposta||'')}</p>
    <table class="tbl"><thead><tr><th>Alan</th><th>Dönem</th><th>Başlangıç</th><th style="text-align:right">Fiyat</th></tr></thead><tbody>${items}</tbody></table>
    <div style="display:flex;justify-content:space-between;margin:14px 0;font-weight:700"><span>Toplam</span><span>${money(q.total)}</span></div>
    ${isAdmin()
      ?`<div class="field"><label class="flabel">Durum</label><select class="inp" id="qs">${['yeni','gorusuldu','onaylandi','iptal'].map(s=>`<option value="${s}" ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button><button class="btn btn-primary btn-sm" onclick="quoteStatus(${q.id})">Durumu Kaydet</button></div>`
      :`<div class="meta" style="margin-bottom:14px">Durum: <span class="badge-st st-${esc(q.status||'yeni')}">${esc(QL[q.status]||'Yeni')}</span></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button></div>`}`);
}
async function quoteStatus(id){
  const r=await guard(()=>api('quote_status',{id,status:gv('qs')}),'Durum kaydedilemedi');
  if(r===null) return;
  closeModal();
  if(r && r.done!==undefined){
    let msg;
    if(r.already_approved){
      msg='Bu teklif zaten onaylanmis. Tekrar uygulanmadi.';
    }else{
      msg='\u2713 '+(r.reserved||0)+' ay rezerve edildi (dolu isaretlendi).';
      msg+=r.created_work?'\nYeni is karti olusturuldu.':'\nMevcut is kartina baglandi.';
      if(r.conflicts && r.conflicts.length){
        msg+='\n\n\u26a0 Cakisma - bu aylar baska bir kurumda dolu/rezerve oldugu icin ATLANDI (uzerine yazilmadi):\n\u00b7 '+r.conflicts.join('\n\u00b7 ');
      }
    }
    mpAlert(msg);
  }
  renderSection(); }
/* ================= TEKLİF OLUŞTURUCU (panel) ================= */
let QB={id:0,customer_id:null,customer_name:'',firma:'',telefon:'',eposta:'',note:'',
        gecerlilik:'',indirim:0,kdv:20,items:[]};

async function qbNew(){ QB={id:0,customer_id:null,customer_name:'',firma:'',telefon:'',eposta:'',note:'',
  gecerlilik:qbTarih(15),indirim:0,kdv:20,items:[]}; await qbRender(); }

async function qbEdit(id){
  const d=await guard(()=>api('quote_get&id='+id),'Teklif açılamadı'); if(!d)return;
  const q=d.quote;
  QB={id:q.id,customer_id:q.customer_id||null,customer_name:q.customer_name||'',firma:q.firma||'',
      telefon:q.telefon||'',eposta:q.eposta||'',note:q.note||'',gecerlilik:q.gecerlilik||'',
      indirim:+q.indirim||0,kdv:q.kdv!=null?+q.kdv:20,
      items:(d.items||[]).map(i=>({unit_id:i.unit_id,mecra_name:i.mecra_name,unit_name:i.unit_name,
        product_name:i.product_name,olcu:i.olcu,period:i.period,start_day:i.start_day,
        adet:i.adet||1,price:+i.price||0,aciklama:i.aciklama||''}))};
  await qbRender();
}
function qbTarih(gunSonra){ const d=new Date(Date.now()+(gunSonra||0)*864e5); return d.toISOString().slice(0,10); }
function qbAra(){ const t=(gv('qbUnitQ')||'').toLocaleLowerCase('tr'); return (ui._qbUnits||[]).filter(u=>
  !t || [u.mecra,u.alt,u.name,u.konum].some(x=>String(x||'').toLocaleLowerCase('tr').includes(t))); }

async function qbRender(){
  const c=document.getElementById('content');
  if(!ui._qbUnits){
    const veri=await guard(()=>Promise.all([api('units_full'),api('customers_list'),api('contacts_list')]),'Veriler yüklenemedi');
    if(!veri) return;
    ui._qbUnits=veri[0]; ui._qbCust=veri[1];
    /* Yetkili kisi artik gercek Contact'tan gelir (S02_001). */
    ui._qbKisi={}; (veri[2]||[]).forEach(k=>{ if(k.active!==false && (!ui._qbKisi[k.customer_id]||k.is_primary)) ui._qbKisi[k.customer_id]=k; });
  }
  const cu=ui._qbCust||[];
  c.innerHTML=`<div class="sec-head">
      <div><h3>${QB.id?'Teklif #'+QB.id:'Yeni Teklif'}</h3><p class="sub">Alanları ekleyin, fiyatları girin; çıktıyı yazdırın veya PDF kaydedin.</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="go('teklifler')">‹ Listeye dön</button>
        <button class="btn btn-outline btn-sm" onclick="qbPrint()">${ic('download',15)} Yazdır / PDF</button>
        <button class="btn btn-primary btn-sm" onclick="qbSave()">Kaydet</button></div></div>

    <div class="sec-card"><h4 style="margin:0 0 12px;font-size:14px">Müşteri</h4>
      <div class="field" style="max-width:420px"><label class="flabel">Kayıtlı müşteriden seç</label>
        <select class="inp" id="qbCust" data-ara onchange="qbCustPick(this.value)">
          <option value="">— elle gireceğim —</option>
          ${cu.map(x=>`<option value="${x.id}" ${String(QB.customer_id)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}
        </select></div>
      <div class="row2"><div class="field"><label class="flabel">Yetkili kişi</label><input class="inp" id="qbAd" value="${esc(QB.customer_name)}"></div>
      <div class="field"><label class="flabel">Firma</label><input class="inp" id="qbFirma" value="${esc(QB.firma)}"></div></div>
      <div class="row2"><div class="field"><label class="flabel">Telefon</label><input class="inp" id="qbTel" value="${esc(QB.telefon)}"></div>
      <div class="field"><label class="flabel">E-posta</label><input class="inp" id="qbMail" value="${esc(QB.eposta)}"></div></div>
    </div>

    <div class="sec-card"><h4 style="margin:0 0 10px;font-size:14px">Teklif Kalemleri</h4>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <input class="inp" id="qbUnitQ" placeholder="Alan ara — mecra, pozisyon veya konum" oninput="qbListe()" style="flex:1;min-width:220px">
        <button class="btn btn-outline btn-sm" onclick="qbAddSerbest()">+ Serbest satır</button></div>
      <div id="qbBulunan" class="qb-found"></div>
      <div id="qbItems"></div>
    </div>

    <div class="sec-card"><h4 style="margin:0 0 12px;font-size:14px">Özet ve Koşullar</h4>
      <div class="row2">
        <div class="field"><label class="flabel">İndirim (%)</label><input class="inp" type="number" id="qbInd" min="0" max="100" step="0.5" value="${QB.indirim}" oninput="qbToplam()"></div>
        <div class="field"><label class="flabel">KDV (%)</label><input class="inp" type="number" id="qbKdv" min="0" max="100" step="1" value="${QB.kdv}" oninput="qbToplam()"></div></div>
      <div class="field" style="max-width:260px"><label class="flabel">Geçerlilik tarihi</label><input class="inp" type="date" id="qbGec" value="${esc(QB.gecerlilik)}"></div>
      <div class="field"><label class="flabel">Not / koşullar</label><textarea class="inp" id="qbNot" placeholder="Baskı ve montaj dahildir. Fiyatlar aylıktır…">${esc(QB.note)}</textarea></div>
      <div id="qbOzet" class="qb-ozet"></div>
    </div>`;
  qbListe(); qbItems();
}
function qbCustPick(id){
  const x=(ui._qbCust||[]).find(c=>String(c.id)===String(id));
  QB.customer_id=x?x.id:null;
  const k=x?((ui._qbKisi||{})[x.id]||null):null;
  if(x){ document.getElementById('qbAd').value=(k&&k.name)||''; document.getElementById('qbFirma').value=x.firma||'';
         document.getElementById('qbTel').value=(k&&k.phone)||x.telefon||''; document.getElementById('qbMail').value=(k&&k.email)||x.eposta||''; }
}
function qbListe(){
  const box=document.getElementById('qbBulunan'); if(!box)return;
  const t=(gv('qbUnitQ')||'').trim();
  if(!t){ box.innerHTML='<p class="muted" style="font-size:12.5px;margin:0">Eklemek için yukarıdan alan arayın (ör. "M1", "raket", "stadyum").</p>'; return; }
  const list=qbAra().slice(0,40);
  box.innerHTML=list.length?list.map(u=>`<button class="qb-f" onclick="qbAdd(${u.id})">
      <b>${esc(u.mecra)} · ${esc(u.name)}</b><span>${esc(u.alt||'')}${u.olcu?' · '+esc(u.olcu):''}${u.konum?' · '+esc(u.konum):''}</span></button>`).join('')
    :'<p class="muted" style="font-size:12.5px;margin:0">Eşleşen alan yok.</p>';
}
function qbAdd(unitId){
  const u=(ui._qbUnits||[]).find(x=>x.id===unitId); if(!u)return;
  if(QB.items.some(i=>i.unit_id===unitId)){ toast('Bu alan zaten listede.'); return; }
  QB.items.push({unit_id:u.id,mecra_name:u.mecra,unit_name:u.name,product_name:u.urun||'',olcu:u.olcu||'',
    period:'1 ay',start_day:'',adet:1,price:0,aciklama:u.konum||''});
  qbItems();
}
function qbAddSerbest(){
  QB.items.push({unit_id:null,mecra_name:'',unit_name:'Serbest kalem',product_name:'',olcu:'',
    period:'1 ay',start_day:'',adet:1,price:0,aciklama:''});
  qbItems();
}
function qbDel(i){ QB.items.splice(i,1); qbItems(); }
function qbSet(i,k,v){ QB.items[i][k]=(k==='price'||k==='adet')?(parseFloat(v)||0):v; qbToplam(); }
function qbItems(){
  const box=document.getElementById('qbItems'); if(!box)return;
  if(!QB.items.length){ box.innerHTML='<p class="muted" style="font-size:13px">Henüz kalem yok.</p>'; qbToplam(); return; }
  box.innerHTML=`<table class="tbl qb-tbl"><thead><tr>
      <th style="min-width:190px">Alan</th><th>Açıklama</th><th style="width:96px">Dönem</th>
      <th style="width:132px">Başlangıç</th><th style="width:70px">Adet</th>
      <th style="width:120px">Birim (₺)</th><th style="width:110px;text-align:right">Tutar</th><th style="width:44px"></th></tr></thead>
    <tbody>${QB.items.map((i,ix)=>`<tr>
      <td>${i.unit_id?`<b>${esc(i.mecra_name)}</b><br><span class="muted" style="font-size:12px">${esc(i.unit_name)}${i.olcu?' · '+esc(i.olcu):''}</span>`
        :`<input class="inp inp-sm" value="${esc(i.unit_name)}" oninput="qbSet(${ix},'unit_name',this.value)">`}</td>
      <td><input class="inp inp-sm" value="${esc(i.aciklama)}" oninput="qbSet(${ix},'aciklama',this.value)"></td>
      <td><input class="inp inp-sm" value="${esc(i.period)}" oninput="qbSet(${ix},'period',this.value)"></td>
      <td><input class="inp inp-sm" type="date" value="${esc(i.start_day)}" oninput="qbSet(${ix},'start_day',this.value)"></td>
      <td><input class="inp inp-sm" type="number" min="1" value="${i.adet}" oninput="qbSet(${ix},'adet',this.value)"></td>
      <td><input class="inp inp-sm" type="number" min="0" step="100" value="${i.price}" oninput="qbSet(${ix},'price',this.value)"></td>
      <td style="text-align:right" class="mono" id="qbT${ix}">${money(i.adet*i.price)}</td>
      <td><button class="btn btn-danger btn-sm" onclick="qbDel(${ix})">×</button></td></tr>`).join('')}</tbody></table>`;
  qbToplam();
}
function qbHesap(){
  const ara=QB.items.reduce((a,i)=>a+(i.adet||0)*(i.price||0),0);
  const ind=+((gv('qbInd')||0))||0, kdv=+((gv('qbKdv')||0))||0;
  const indTut=ara*ind/100, net=ara-indTut, kdvTut=net*kdv/100;
  return {ara,ind,indTut,net,kdv,kdvTut,genel:net+kdvTut};
}
function qbToplam(){
  QB.items.forEach((i,ix)=>{ const el=document.getElementById('qbT'+ix); if(el)el.textContent=money(i.adet*i.price); });
  const box=document.getElementById('qbOzet'); if(!box)return;
  const h=qbHesap();
  box.innerHTML=`<div class="qb-row"><span>Ara toplam</span><b>${money(h.ara)}</b></div>
    ${h.ind?`<div class="qb-row disc"><span>İndirim (%${h.ind})</span><b>− ${money(h.indTut)}</b></div>`:''}
    <div class="qb-row"><span>Net</span><b>${money(h.net)}</b></div>
    <div class="qb-row"><span>KDV (%${h.kdv})</span><b>${money(h.kdvTut)}</b></div>
    <div class="qb-row total"><span>Genel Toplam</span><b>${money(h.genel)}</b></div>`;
}
async function qbSave(){
  const ad=gv('qbAd').trim(), firma=gv('qbFirma').trim();
  if(!ad && !firma){ mpAlert('En az yetkili kişi veya firma adı girin.'); return; }
  if(!QB.items.length){ mpAlert('Teklife en az bir kalem ekleyin.'); return; }
  const h=qbHesap();
  const payload={id:QB.id||0,customer_id:QB.customer_id,customer_name:ad,firma,telefon:gv('qbTel'),eposta:gv('qbMail'),
    note:gv('qbNot'),gecerlilik:gv('qbGec')||null,indirim:h.ind,kdv:h.kdv,total:h.genel,
    kaynak:'panel',status:QB.id?undefined:'yeni',okundu:true};
  Object.keys(payload).forEach(k=>payload[k]===undefined&&delete payload[k]);
  const r=await guard(()=>api('quote_builder_save',{quote:payload,items:QB.items}),'Teklif kaydedilemedi');
  if(r===null) return;
  QB.id=r.id; toast('Teklif kaydedildi.'); go('teklifler');
}
function qbPrint(){
  const h=qbHesap(), st=ui._settings||{};
  const satir=QB.items.map(i=>`<tr><td><b>${esc(i.mecra_name||'')}</b>${i.unit_name?'<br>'+esc(i.unit_name):''}${i.olcu?'<br><i>'+esc(i.olcu)+'</i>':''}</td>
    <td>${esc(i.aciklama||'')}</td><td>${esc(i.period||'')}</td><td>${esc(i.start_day||'')}</td>
    <td style="text-align:center">${i.adet}</td><td style="text-align:right">${money(i.price)}</td>
    <td style="text-align:right">${money(i.adet*i.price)}</td></tr>`).join('');
  const w=window.open('','_blank'); if(!w){ mpAlert('Yazdırma penceresi engellendi. Tarayıcının açılır pencere iznini verin.'); return; }
  w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Teklif${QB.id?' #'+QB.id:''}</title>
  <style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#16233b;padding:32px;font-size:13px}
  h1{font-size:21px;margin:0 0 4px}.mut{color:#667;font-size:12px}
  .hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #16233b;padding-bottom:14px;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;margin:14px 0}th,td{border:1px solid #d6dbe6;padding:7px 9px;vertical-align:top}
  th{background:#f4f6fb;text-align:left;font-size:11.5px;letter-spacing:.04em;text-transform:uppercase}
  i{font-style:normal;color:#667;font-size:11.5px}
  .sum{width:320px;margin-left:auto}.sum td{border:0;padding:5px 0}.sum .tt{border-top:2px solid #16233b;font-weight:700;font-size:15px;padding-top:9px}
  .note{margin-top:18px;padding:12px 14px;background:#f4f6fb;border-radius:8px;white-space:pre-wrap}
  @media print{body{padding:0}}</style></head><body>
  <div class="hd"><div><h1>${esc(st.logoText||'Medyapark Adana')}</h1><div class="mut">Açıkhava Reklam Hizmetleri</div>
    <div class="mut">${esc(st.phone||'')}${st.email?' · '+esc(st.email):''}</div></div>
    <div style="text-align:right"><h1>TEKLİF${QB.id?' #'+QB.id:''}</h1>
      <div class="mut">Tarih: ${new Date().toLocaleDateString('tr-TR')}</div>
      ${gv('qbGec')?`<div class="mut">Geçerlilik: ${esc(gv('qbGec'))}</div>`:''}</div></div>
  <div><b>${esc(gv('qbFirma')||'')}</b><br><span class="mut">${esc(gv('qbAd')||'')}${gv('qbTel')?' · '+esc(gv('qbTel')):''}${gv('qbMail')?' · '+esc(gv('qbMail')):''}</span></div>
  <table><thead><tr><th>Reklam Alanı</th><th>Açıklama</th><th>Dönem</th><th>Başlangıç</th><th>Adet</th><th>Birim</th><th>Tutar</th></tr></thead><tbody>${satir}</tbody></table>
  <table class="sum"><tr><td>Ara toplam</td><td style="text-align:right">${money(h.ara)}</td></tr>
    ${h.ind?`<tr><td>İndirim (%${h.ind})</td><td style="text-align:right">− ${money(h.indTut)}</td></tr>`:''}
    <tr><td>Net</td><td style="text-align:right">${money(h.net)}</td></tr>
    <tr><td>KDV (%${h.kdv})</td><td style="text-align:right">${money(h.kdvTut)}</td></tr>
    <tr><td class="tt">Genel Toplam</td><td class="tt" style="text-align:right">${money(h.genel)}</td></tr></table>
  ${gv('qbNot')?`<div class="note">${esc(gv('qbNot'))}</div>`:''}
  </body></html>`);
  w.document.close(); setTimeout(()=>w.print(),400);
}

async function quoteDel(id){ if(await mpConfirm('Teklif ve kalemleri silinsin mi?','Teklifi Sil')){ await api('quote_delete&id='+id); renderSection(); } }

/* ---------- EKİP ---------- */
async function ekip(c){
  const list=await api('team_list'); ui._team=list;
  if(!yoneticiMi() && ui._me) ui._teamOpen=ui._me.id;
  if(ui._teamOpen){ const t=list.find(x=>x.id===ui._teamOpen); if(t){ return teamProfil(c,t); } ui._teamOpen=null; }
  const rows=list.map(x=>`<div class="tm-card" onclick="ui._teamOpen=${x.id};renderSection()">
    ${teamAvatar(x,44)}
    <div class="tm-b"><div class="tm-n">${esc(x.name)}${x.app_role==='admin'?'<span class="pill pil-on">yönetici</span>':''}</div>
      <div class="tm-r">${esc(x.unvan||x.role||'')}</div>
      <div class="tm-m">${esc(x.eposta||'e-posta yok')}${x.telefon?' · '+esc(x.telefon):''}</div></div>
    <span class="tm-go">›</span></div>`).join('');
  const epostasiz=list.filter(x=>!x.eposta).length;
  c.innerHTML=`<div class="sec-head"><div><h3>Ekip</h3><p class="sub">${list.length} üye · profile girmek için karta tıklayın</p></div>
      <button class="btn btn-primary btn-sm" onclick="teamForm(0)">+ Kişi</button></div>
    ${epostasiz?`<div class="banner">${epostasiz} üyenin e-posta adresi yok. Yetki sınırlaması ve bildirim e-postaları, panele giriş yapılan adresle eşleştiği için çalışmaz — profilden e-posta ekleyin.</div>`:''}
    <div class="tm-grid">${rows||'<p class="muted">Kişi yok.</p>'}</div>`;
}
function teamAvatar(x,sz){
  sz=sz||40;
  const bas=String(x.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toLocaleUpperCase('tr');
  return x.photo? `<img class="tm-av" src="${esc(x.photo)}" alt="" style="width:${sz}px;height:${sz}px">`
    : `<span class="tm-av tm-av-t" style="width:${sz}px;height:${sz}px;font-size:${Math.round(sz/2.6)}px">${esc(bas)}</span>`;
}
/* ---- Üye özet sayfası ---- */
async function teamProfil(c,t){
  const jobs=await api('jobs_list').catch(()=>[]);
  const mine=jobs.filter(j=>j.assignee_id===t.id);
  /* Kendi profili mi? team_member yalnız kendi güvenli alanlarını
     düzenleyebilir; asıl zorlama update_my_profile() RPC'sindedir,
     buradaki kontrol yalnız arayüzü tutarlı tutar (08 §9). */
  const kendiProfili=!!(ui._me && ui._me.id===t.id);
  const JL=JOBLBL;   /* canonical faz etiketleri (D-206) */
  const bugun=new Date().toISOString().slice(0,10);
  /* Canonical: "yapılan" phase değil LIFECYCLE ile belirlenir (D-207);
     kapanmamış her iş takiptedir. */
  const kapali=j=>(j.lifecycle_status||'acik')==='kapandi';
  const grup={
    takip:mine.filter(j=>!kapali(j)),
    yapilan:mine.filter(kapali),
    planli:mine.filter(j=>j.start_day&&j.start_day>bugun)};
  const kart=(baslik,list,bos)=>`<section class="card">
    <div class="card-h"><h3>${baslik}</h3><span class="chip">${list.length}</span></div>
    <div class="card-b">${list.length?list.map(j=>`<button class="tp-j" onclick="go('is-takibi')">
        <span class="tp-jt">${esc(j.title)}</span>
        <span class="badge-st st-${esc(j.status)}">${esc(JL[j.status]||j.status)}</span>
        ${j.start_day?`<span class="tp-jd">${esc(String(j.start_day).slice(0,10))}</span>`:''}</button>`).join('')
      :`<p class="empty">${bos}</p>`}</div></section>`;
  c.innerHTML=`
    <div class="sec-head">${yoneticiMi()?`<button class="btn btn-ghost btn-sm" onclick="ui._teamOpen=null;renderSection()">‹ Ekip listesi</button>
      <button class="btn btn-danger btn-sm" onclick="teamDel(${t.id})">Üyeyi Sil</button>`:'<h3>Profilim</h3>'}</div>
    <div class="tp-top">
      ${teamAvatar(t,78)}
      <div class="tp-i"><h2>${esc(t.name)}${t.app_role==='admin'?'<span class="pill pil-on">yönetici</span>':''}</h2>
        <div class="tp-r">${esc(t.unvan||t.role||'—')}</div>
        <div class="tp-m">${esc(t.eposta||'e-posta yok')}${t.telefon?' · '+esc(t.telefon):''}</div></div>
      ${(isAdmin()||kendiProfili)?`<button class="btn btn-outline btn-sm" onclick="teamForm(${t.id})">Profili Düzenle</button>`:''}
    </div>
    <div class="tp-kpi">
      <div class="tp-k"><b>${grup.takip.length}</b><span>Takip ettiği iş</span></div>
      <div class="tp-k"><b>${grup.yapilan.length}</b><span>Tamamlanan</span></div>
      <div class="tp-k"><b>${grup.planli.length}</b><span>Planlanan</span></div>
    </div>
    <div class="dash-grid"><div class="dash-l">
      ${kart('Takip Ettiği İşler',grup.takip,'Atanmış aktif iş yok.')}
      ${kart('Planlanan İşler',grup.planli,'İleri tarihli iş yok.')}
      ${kart('Tamamlananlar',grup.yapilan,'Henüz tamamlanan iş yok.')}
    </div><div class="dash-r">
      <section class="card"><div class="card-h"><h3>Not Defteri</h3>
        <span class="chip">kişisel</span></div>
        <div class="card-b">
          <textarea class="inp" id="tmNot" style="min-height:230px" placeholder="Günlük notlar, hatırlatmalar, görüşme özetleri…" ${(isAdmin()||kendiProfili)?'':'disabled'}>${esc(t.notlar||'')}</textarea>
          ${(isAdmin()||kendiProfili)?`<p class="muted" style="font-size:11.5px;margin:8px 0 10px">Bu defter yalnız bu profilde durur.${isAdmin()?' "Panoya Gönder" dediğinizde seçtiğiniz not, Dashboard\'daki Son Notlar bölümüne düşer ve tüm ekip görür.':''}</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="teamNotKaydet(${t.id})">Kaydet</button>
            ${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="teamNotPaylas(${t.id})">Panoya Gönder</button>`:''}</div>`
          :`<p class="muted" style="font-size:11.5px;margin:8px 0 0">Salt okunur.</p>`}
        </div></section>
    </div></div>`;
}
/* Güvenli self-profil RPC sarmalayıcısı (Correction Sprint 2 §10).
   NULL = alanı değiştirme, '' = alanı temizle. Çağıran auth.uid()'den
   çözülür; satır id'si parametre DEĞİLDİR. */
async function rpcProfil(p){
  const r=await sb.rpc('update_my_profile',p);
  if(r.error) throw r.error;
  if(r.data && r.data.ok===false) throw new Error(r.data.error||'profil_guncellenemedi');
  return r.data;
}
async function teamNotKaydet(id){
  /* Bu kart yalnız notlar'ı gönderir; diğer profil alanları NULL geçilir
     ve dokunulmadan kalır. team_member kendi satırını RPC ile, admin
     mevcut team_save yoluyla yazar. */
  const r=await guard(()=>isAdmin()
      ? api('team_save',{id,notlar:gv('tmNot')})
      : rpcProfil({p_name:null,p_unvan:null,p_telefon:null,p_photo:null,p_notlar:gv('tmNot')}),
    'Not kaydedilemedi');
  if(r===null)return;
  const t=(ui._team||[]).find(x=>x.id===id); if(t)t.notlar=gv('tmNot');
  if(ui._me && ui._me.id===id) ui._me.notlar=gv('tmNot');
  toast('Not defteri kaydedildi.');
}
async function teamNotPaylas(id){
  const t=(ui._team||[]).find(x=>x.id===id)||{};
  const tam=gv('tmNot')||'';
  modal(`<h3 style="margin:0 0 4px">Panoya Gönder</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Bu not Dashboard'daki Son Notlar bölümüne düşer, tüm ekip görür.</p>
    <div class="field"><label class="flabel">Başlık</label><input class="inp" id="pnK" placeholder="ör. Tüyap görüşmesi"></div>
    <div class="field"><label class="flabel">Not</label><textarea class="inp" id="pnB" style="min-height:120px">${esc(tam)}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="teamNotPaylasKaydet(${id})">Gönder</button></div>`);
}
async function teamNotPaylasKaydet(id){
  const t=(ui._team||[]).find(x=>x.id===id)||{};
  const konu=(gv('pnK')||'').trim(), body=(gv('pnB')||'').trim();
  if(!body){ mpAlert('Not boş olamaz.','Panoya Gönder'); return; }
  const r=await guard(()=>api('note_save',{konu:konu||('Not — '+(t.name||'')),body,
    ilgili_kisi:t.name||'',tarih:new Date().toISOString().slice(0,10)}),'Gönderilemedi');
  if(r===null)return; closeModal(); toast('Not panoya gönderildi.');
}
/* Tek form, iki mod (Correction Sprint 2 §11):
     admin      → mevcut tam ekip yönetimi formu (değişmedi)
     self/üye   → yalnız güvenli profil alanları; kimlik/yetki alanları
                  salt okunur gösterilir, forma hiç girmez.
   Ayrı bir workspaceProfile() yoktur. */
/* S14: yönetici formu kaydı VERİTABANINDAN okur; Kaydet yalnız değişen
   alanları, açılıştaki değerleri hâlâ yerindeyse yazar. Önceden önbellekten
   açılıp satırın tamamını (yetki `app_role` dahil) yazıyordu: başka bir
   yöneticinin yaptığı yetki değişikliği, eski formdan yapılan ilgisiz bir
   kayıtla sessizce geri alınabiliyordu. */
async function teamForm(id){
  let x=(ui._team||[]).find(t=>t.id===id)||{};
  if(id&&isAdmin()){ const r=await guard(()=>kayitTazeOku('team','id',id),'Profil açılamadı'); if(r===null) return;
    if(!r){ mpAlert('Ekip kaydı bulunamadı.','Ekip'); return; } x=r; }
  ui._teamIlk=(id&&isAdmin())?x:null;
  const foto=`<div class="field"><label class="flabel">Profil fotoğrafı</label>
      <div class="imgf">
        <span class="imgf-pv${x.photo?'':' bos'}" id="tph_pv" onclick="imgAc('tph')">${x.photo?`<img src="${esc(x.photo)}" alt="">`:''}</span>
        <input class="inp" id="tph" value="${esc(x.photo)}" placeholder="https://..." oninput="imgPv('tph')">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('tph').value=u;imgPv('tph');})">Yükle</button>
        <button class="btn btn-ghost btn-sm imgf-x" onclick="imgSil('tph')">✕</button></div></div>`;
  if(!isAdmin()){
    modal(`<h3 style="margin:0 0 14px">Profilimi Düzenle</h3><input type="hidden" id="tid" value="${id||0}">
    ${foto}
    <div class="row2"><div class="field"><label class="flabel">Ad Soyad *</label><input class="inp" id="tn" value="${esc(x.name)}"></div>
    <div class="field"><label class="flabel">Ünvan</label><input class="inp" id="tu" value="${esc(x.unvan||'')}" placeholder="Satış Uzmanı"></div></div>
    <div class="field" style="max-width:280px"><label class="flabel">Telefon</label><input class="inp" id="tt" value="${esc(x.telefon)}"></div>
    <div class="fld-box" style="margin-top:4px"><label class="flabel" style="font-weight:700">Kimlik ve yetki</label>
      <div class="meta" style="line-height:1.9">
        E-posta: <b>${esc(x.eposta||'—')}</b><br>
        Görev/Departman: <b>${esc(x.role||'—')}</b><br>
        Yetki: <span class="pill">${x.app_role==='admin'?'Yönetici':'Ekip Üyesi'}</span></div>
      <p class="muted" style="font-size:11.5px;margin:8px 0 0">Bu alanlar hesap kimliğini ve yetkiyi belirler; yalnız yönetici değiştirebilir.</p></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="teamSave()">Kaydet</button></div>`);
    const f=document.getElementById('tn'); if(f)f.focus();
    return;
  }
  modal(`<h3 style="margin:0 0 14px">${id?'Profili Düzenle':'Yeni Kişi'}</h3><input type="hidden" id="tid" value="${id||0}">
    ${foto}
    <div class="row2"><div class="field"><label class="flabel">Ad Soyad *</label><input class="inp" id="tn" value="${esc(x.name)}"></div>
    <div class="field"><label class="flabel">Ünvan</label><input class="inp" id="tu" value="${esc(x.unvan||x.role||'')}" placeholder="Satış Uzmanı"></div></div>
    <div class="row2"><div class="field"><label class="flabel">E-posta (panele giriş adresi)</label><input class="inp" id="te" value="${esc(x.eposta)}" placeholder="ad@medyapark.com"></div>
    <div class="field"><label class="flabel">Telefon</label><input class="inp" id="tt" value="${esc(x.telefon)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">Yetki seviyesi</label>
      <select class="inp" id="tsv">
        <option value="team_member" ${x.app_role!=='admin'?'selected':''}>Ekip Üyesi — Team Workspace</option>
        <option value="admin" ${x.app_role==='admin'?'selected':''}>Yönetici — Yönetim Paneli + Workspace</option></select></div>
    <div class="field"><label class="flabel">Görev/Departman</label><input class="inp" id="tr" value="${esc(x.role)}" placeholder="Satış &amp; Pazarlama"></div></div>
    <p class="muted" style="font-size:11.5px;margin:2px 0 14px">Yetki, panele giriş yapılan e-posta ile bu adres eşleştiğinde uygulanır. Bildirim e-postaları da Satış &amp; Pazarlama görevli üyelere ve yöneticilere gider.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="teamSave()">Kaydet</button></div>`);
}
async function teamSave(){
  if(!gv('tn').trim()){ mpAlert('Ad Soyad zorunlu.','Ekip'); return; }
  /* team_member kendi satırını yalnız update_my_profile() üzerinden
     düzenler: çağıran auth.uid()'den çözülür, SET listesi beş güvenli
     alanla sınırlıdır, app_role/active/eposta/auth_user_id bu yoldan
     erişilemez. team RLS'i gevşetilmedi (bkz. migration
     20260911120000_s08_self_profile_rpc.sql). */
  if(!isAdmin()){
    /* Bu form yalnız kendi alanlarını gönderir; notlar NULL geçilir,
       yani Not Defteri'ne dokunulmaz (RPC parametre sözleşmesi). */
    const r=await guard(()=>rpcProfil({
      p_name:gv('tn'), p_unvan:gv('tu'), p_telefon:gv('tt'), p_photo:gv('tph'), p_notlar:null
    }),'Profil kaydedilemedi');
    if(r===null)return;
    closeModal(); await loadIdentity(); renderSection(); toast('Profil kaydedildi.');
    return;
  }
  const body={id:+gv('tid'),name:gv('tn'),role:gv('tr'),unvan:gv('tu'),eposta:gv('te'),telefon:gv('tt'),photo:gv('tph')};
  /* Tek yetki otoritesi canonical app_role'dür (D-203). Legacy `seviye`
     yalnız ondan TÜRETİLEN bir ayna olarak yazılır: hiçbir yerde
     yetkilendirme için OKUNMAZ, sadece Halil'in eski ekranları tutarlı
     kalsın diye güncel tutulur. Çift otorite yoktur. */
  body.app_role=gv('tsv');
  body.seviye=(gv('tsv')==='admin')?'yonetici':'uye';
  const btn=document.querySelector('#modal .btn-primary'); if(btn&&btn.disabled) return;
  if(body.id){
    const {id,...yeni}=body;
    const f=formFark(ui._teamIlk||{},yeni);
    if(f.bos){ closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
    modalBusy(true);
    try{ await api('row_update_cas',{tablo:'team',id,patch:f.patch,eski:f.eski}); }
    catch(e){ modalBusy(false); kayitHata(e,'Kaydedilemedi'); return; }
    modalBusy(false); closeModal(); renderSection(); toast('Profil kaydedildi.'); return;
  }
  const r=await guard(()=>api('team_save',body),'Kaydedilemedi');
  if(r===null)return; closeModal(); renderSection(); toast('Profil kaydedildi.');
}
async function teamDel(id){ if(await mpConfirm('Ekip üyesi silinsin mi?','Üyeyi Sil')){ await api('team_delete&id='+id); ui._teamOpen=null; renderSection(); } }

/* ---------- SAYFALAR ---------- */
async function sayfalar(c){
  const st=await api('settings_get'); const pages=await api('pages_list'); ui._pages=pages;
  ui._siteUrl=(st.siteUrl||'https://medyaparkadana.com').replace(/\/+$/,'');
  if(!ui._mecralar) ui._mecralar=await api('mecra_list');
  const hero=st.hero||{};
  const pageRows=pages.map(p=>`<div class="list-item"><div class="nm">${esc(p.title||p.slug)}</div><div class="meta">/${esc(p.slug)} · ${(p.blocks||[]).length} blok${p.in_menu===false?' · menüde değil':''}</div>
    <button class="btn btn-outline btn-sm" onclick="pageEdit('${p.slug}')">Düzenle</button>${['biz-kimiz','neler-yapiyoruz','iletisim','referanslar'].includes(p.slug)?'':`<button class="btn btn-danger btn-sm" onclick="pageDel('${p.slug}')">Sil</button>`}</div>`).join('');
  c.innerHTML=`<div class="sec-card"><h3 style="margin:0 0 14px;font-size:16px">Logo & Anasayfa</h3>
    <div class="row2"><div class="field"><label class="flabel">Logo metni</label><input class="inp" id="logoText" value="${esc(st.logoText||'')}"></div>
    <div class="field"><label class="flabel">Üst etiket (sayaç yerine)</label><input class="inp" id="hEye" value="${esc(hero.eyebrow||'')}"></div></div>
    <div class="field"><label class="flabel">Logo görseli (yüklenirse metin yerine görsel)</label>
      <div style="display:flex;gap:8px"><input class="inp" id="logoImg" value="${esc(st.logoImage||'')}" placeholder="uploads/logo.png">
      <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('logoImg').value=u;})">Yükle</button></div></div>
    <div class="field"><label class="flabel">Anasayfa başlığı</label><input class="inp" id="hTitle" value="${esc(hero.title||'')}"></div>
    <div class="field"><label class="flabel">Anasayfa açıklaması</label><textarea class="inp" id="hDesc">${esc(hero.desc||'')}</textarea></div>
    <button class="btn btn-primary btn-sm" onclick="saveHero()">Kaydet</button></div>

    <div class="sec-card"><div class="sec-head"><h3>Sayfalar</h3><button class="btn btn-primary btn-sm" onclick="pageNew()">+ Yeni Sayfa</button></div>
    ${pageRows||'<p class="muted">Sayfa yok.</p>'}<div id="pageEd"></div></div>`;
}
async function saveHero(){ await api('settings_save',{logoText:gv('logoText'),logoImage:gv('logoImg'),hero:{eyebrow:gv('hEye'),title:gv('hTitle'),desc:gv('hDesc')}}); mpAlert('Kaydedildi.'); }

async function pageEdit(slug){
  const r=await guard(()=>kayitTazeOku('pages','slug',slug),'Sayfa açılamadı'); if(r===null) return;
  const p=r||{slug,blocks:[]}; ui._pageIlk=r||null; ui._pageSlug=slug; ui._blocks=JSON.parse(JSON.stringify(p.blocks||[])); ui._pageTitle=p.title||''; ui._pageMenu=p.in_menu!==false; renderPageEd(); document.getElementById('pageEd').scrollIntoView({behavior:'smooth'}); }
function blkLabel(t){ return {heading:'Başlık',text:'Metin',image:'Görsel',gallery:'Galeri',features:'Özellikler',faq:'S.S.S.',cta:'Çağrı (CTA)',spacer:'Boşluk',
  hero:'Kapak (Hero)',imagetext:'Görsel + Metin',counters:'Sayaçlar',logos:'Logo Şeridi',quote:'Alıntı / Vurgu',video:'Video',map:'Harita',contact:'İletişim Kartları',mecracards:'Mecra Kartları',divider:'İnce Çizgi'}[t]||t; }
function renderPageEd(){ const blocks=ui._blocks; const box=document.getElementById('pageEd'); if(!box)return;
  const blk=blocks.map((b,i)=>blockEditor(b,i)).join('');
  box.innerHTML=`<div class="sec-card" style="margin-top:14px">
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="renderSection()">‹ Sayfalara dön</button>
      <a class="btn btn-outline btn-sm" target="_blank" rel="noopener" href="${esc(ui._siteUrl||'')}/sayfa/${esc(ui._pageSlug)}">Sayfayı Gör ↗</a>
    </div>
    <div class="row2" style="margin-top:12px"><div class="field"><label class="flabel">Sayfa başlığı</label><input class="inp" id="pgTitle" value="${esc(ui._pageTitle)}"></div>
    <div class="field"><label class="flabel">Menüde göster</label><select class="inp" id="pgMenu"><option value="1" ${ui._pageMenu?'selected':''}>Evet</option><option value="0" ${!ui._pageMenu?'selected':''}>Hayır</option></select></div></div>
    ${!blocks.length?`<div class="banner" style="margin:4px 0 12px">Boş sayfa. İsterseniz hazır bir kurgudan başlayın:
      <button class="btn btn-outline btn-sm" onclick="tplInsert('hakkimizda')">Hakkımızda</button>
      <button class="btn btn-outline btn-sm" onclick="tplInsert('hizmetler')">Hizmetler</button>
      <button class="btn btn-outline btn-sm" onclick="tplInsert('iletisim')">İletişim</button></div>`:''}
    <h4 style="margin:10px 0 8px">Bloklar</h4>${blk||'<p class="muted">Henüz blok yok. Aşağıdan ekleyin.</p>'}
    <div class="addbar"><span class="abt">Bölümler:</span>
      <button onclick="blkAdd('hero')">Kapak</button><button onclick="blkAdd('imagetext')">Görsel+Metin</button><button onclick="blkAdd('counters')">Sayaçlar</button><button onclick="blkAdd('mecracards')">Mecra Kartları</button><button onclick="blkAdd('logos')">Logo Şeridi</button><button onclick="blkAdd('contact')">İletişim</button><button onclick="blkAdd('map')">Harita</button><button onclick="blkAdd('cta')">CTA</button></div>
    <div class="addbar"><span class="abt">İçerik:</span>
      <button onclick="blkAdd('heading')">Başlık</button><button onclick="blkAdd('text')">Metin</button><button onclick="blkAdd('image')">Görsel</button><button onclick="blkAdd('gallery')">Galeri</button><button onclick="blkAdd('features')">Özellikler</button><button onclick="blkAdd('faq')">SSS</button><button onclick="blkAdd('quote')">Alıntı</button><button onclick="blkAdd('video')">Video</button><button onclick="blkAdd('divider')">Çizgi</button><button onclick="blkAdd('spacer')">Boşluk</button></div>
    <div style="margin-top:16px"><button class="btn btn-primary" onclick="pageSaveBlocks()">Sayfayı Kaydet</button>
    <span class="muted" style="font-size:12px;margin-left:10px">Değişiklik sitede kaydettikten sonra görünür.</span></div></div>`;
}
const PG_TPL={
 hakkimizda:[
  {type:'hero',title:'Adana\'nın Açıkhava Reklam Ağı',eyebrow:'MEDYAPARK',sub:'Şehrin en değerli noktalarında, ölçülebilir görünürlük.',label:'Reklam Alanlarını İncele',link:'#',img:'',h:420,oc:'#0b1f2a',oo:0.45},
  {type:'text',text:'Medyapark Adana olarak şehrin alışveriş merkezlerinden stadyumuna, ana arterlerinden servis hatlarına uzanan açıkhava reklam envanterini tek elden yönetiyoruz.'},
  {type:'counters',items:[{n:'140+',label:'Reklam Yüzeyi'},{n:'7',label:'Ana Lokasyon'},{n:'15',label:'Yıllık Milyon Ziyaretçi'}]},
  {type:'imagetext',side:'left',url:'',title:'Neden Medyapark?',text:'Doğru lokasyon, doğru hedef kitle.\nBaskıdan montaja tek muhatap.',label:'',link:''},
  {type:'cta',title:'Markanızı şehirle buluşturalım',label:'Bize Ulaşın',link:''}],
 hizmetler:[
  {type:'hero',title:'Hizmetlerimiz',eyebrow:'MEDYAPARK',sub:'Planlamadan yayına uçtan uca açıkhava reklam yönetimi.',label:'',link:'',img:'',h:340,oc:'#0b1f2a',oo:0.45},
  {type:'features',items:[{title:'Mecra Planlama',desc:'Hedef kitlenize göre lokasyon ve dönem önerisi.'},{title:'Baskı & Üretim',desc:'Vinil, duratrans ve folyo üretimi.'},{title:'Montaj & Yayın',desc:'Uygulama, fotoğraflı raporlama ve takip.'}]},
  {type:'mecracards',ids:[]},
  {type:'cta',title:'Kampanyanız için teklif alın',label:'Teklif İste',link:''}],
 iletisim:[
  {type:'heading',text:'Bize Ulaşın'},
  {type:'contact',title:''},
  {type:'map',code:''},
  {type:'faq',items:[{q:'Minimum kiralama süresi nedir?',a:'LED ekranlarda 1 hafta, diğer mecralarda 1 aydır.'},{q:'Baskı ücrete dahil mi?',a:'Baskı ve montaj ayrı kalem olarak fiyatlandırılır.'}]},
  {type:'cta',title:'Aklınıza takılan bir şey mi var?',label:'Hemen Arayın',link:''}]};
async function tplInsert(k){ syncBlocks(); const t=PG_TPL[k]; if(!t)return;
  if(ui._blocks.length && !await mpConfirm('Şablon blokları mevcut blokların sonuna eklenecek. Devam edilsin mi?','Şablon Ekle',{danger:false,ok:'Ekle'})) return;
  ui._blocks.push(...JSON.parse(JSON.stringify(t))); renderPageEd(); }
function blockEditor(b,i){
  const off=b.off===true;
  const head=`<div class="blk-head"><span class="bt">${blkLabel(b.type)}${off?' <em style="font-style:normal;font-size:11px;color:#b3261e">(sitede gizli)</em>':''}</span>
    <button class="btn btn-outline btn-sm" title="Yukarı" onclick="blkMove(${i},-1)">↑</button>
    <button class="btn btn-outline btn-sm" title="Aşağı" onclick="blkMove(${i},1)">↓</button>
    <button class="btn btn-outline btn-sm" title="Kopyala" onclick="blkDup(${i})">⧉</button>
    <button class="btn btn-outline btn-sm" title="${off?'Sitede göster':'Sitede gizle'}" onclick="blkToggle(${i})">${off?'🚫':'👁'}</button>
    <button class="btn btn-danger btn-sm" onclick="blkDel(${i})">Sil</button></div>`;
  let body='';
  const up=(id)=>`<button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('${id}').value=u;})">Yükle</button>`;
  if(b.type==='hero') body=`<div class="row2"><input class="inp" id="blk${i}_title" value="${esc(b.title||'')}" placeholder="Büyük başlık"><input class="inp" id="blk${i}_eyebrow" value="${esc(b.eyebrow||'')}" placeholder="Üst etiket (ops)"></div>
    <textarea class="inp" id="blk${i}_sub" style="min-height:56px;margin-top:8px" placeholder="Alt açıklama (ops)">${esc(b.sub||'')}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="blk${i}_img" value="${esc(b.img||'')}" placeholder="Arka plan görseli">${up('blk'+i+'_img')}</div>
    <div style="display:flex;gap:8px;margin-top:8px"><input class="inp" id="blk${i}_imgMobil" value="${esc(b.imgMobil||'')}" placeholder="Mobil görsel (ops)">${up('blk'+i+'_imgMobil')}</div>
    <div class="row2" style="margin-top:8px"><input class="inp" id="blk${i}_label" value="${esc(b.label||'')}" placeholder="Buton yazısı (ops)"><input class="inp" id="blk${i}_link" value="${esc(b.link||'')}" placeholder="Buton linki"></div>
    <div style="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap">
      <label class="muted" style="font-size:12px">Yükseklik <input class="inp" id="blk${i}_h" type="number" value="${b.h||420}" style="width:86px;display:inline-block"> px</label>
      <label class="muted" style="font-size:12px">Karartma <input id="blk${i}_oc" type="color" value="${esc(b.oc||'#0b1f2a')}" style="vertical-align:middle"></label>
      <label class="muted" style="font-size:12px">Yoğunluk <input class="inp" id="blk${i}_oo" type="number" step="0.05" min="0" max="1" value="${b.oo!=null?b.oo:0.45}" style="width:76px;display:inline-block"></label></div>`;
  else if(b.type==='imagetext') body=`<div style="display:flex;gap:8px"><input class="inp" id="blk${i}_url" value="${esc(b.url||'')}" placeholder="Görsel">${up('blk'+i+'_url')}
      <select class="inp" id="blk${i}_side" style="flex:0 0 130px"><option value="left" ${b.side!=='right'?'selected':''}>Görsel solda</option><option value="right" ${b.side==='right'?'selected':''}>Görsel sağda</option></select></div>
    <input class="inp" id="blk${i}_title" value="${esc(b.title||'')}" placeholder="Başlık" style="margin-top:8px">
    <textarea class="inp" id="blk${i}_text" style="min-height:90px;margin-top:8px" placeholder="Metin (her satır bir paragraf)">${esc(b.text||'')}</textarea>
    <div class="row2" style="margin-top:8px"><input class="inp" id="blk${i}_label" value="${esc(b.label||'')}" placeholder="Buton yazısı (ops)"><input class="inp" id="blk${i}_link" value="${esc(b.link||'')}" placeholder="Buton linki"></div>`;
  else if(b.type==='counters'){ const it=Array.isArray(b.items)?b.items:[]; body=`<textarea class="inp" id="blk${i}_items" style="min-height:90px" placeholder="150+ | Reklam Yüzeyi">${esc(it.map(x=>`${x.n||''} | ${x.label||''}`).join('\n'))}</textarea><p class="muted" style="font-size:11px">Her satıra bir sayaç: <b>Rakam | Etiket</b> — rakamın yanına +, %, M gibi ek yazabilirsiniz, sayı kısmı animasyonla sayılır.</p>`; }
  else if(b.type==='logos'){ const imgs=Array.isArray(b.images)?b.images:[]; body=`<input class="inp" id="blk${i}_title" value="${esc(b.title||'')}" placeholder="Bölüm başlığı (ops, ör. Referanslarımız)" style="margin-bottom:8px">
    ${imgs.map((g,k)=>`<div class="list-item" style="padding:8px 10px"><div class="nm" style="font-size:12px;word-break:break-all">${esc(g)}</div><button class="btn btn-danger btn-sm" onclick="blkGalDel(${i},${k})">Sil</button></div>`).join('')||'<p class="muted" style="font-size:12px">Logo yok.</p>'}
    <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="pickUpload('image/*',u=>blkGalAdd(${i},u))">+ Logo ekle</button>`; }
  else if(b.type==='quote') body=`<textarea class="inp" id="blk${i}_text" style="min-height:70px" placeholder="Alıntı / vurgu cümlesi">${esc(b.text||'')}</textarea><input class="inp" id="blk${i}_who" value="${esc(b.who||'')}" placeholder="Kaynak / kişi (ops)" style="margin-top:8px">`;
  else if(b.type==='video') body=`<input class="inp" id="blk${i}_url" value="${esc(b.url||'')}" placeholder="YouTube linki veya .mp4 adresi"><p class="muted" style="font-size:11px">YouTube linkini olduğu gibi yapıştırın (youtu.be/... veya watch?v=...).</p>`;
  else if(b.type==='map') body=`<textarea class="inp" id="blk${i}_code" style="min-height:70px" placeholder="Google Maps > Paylaş > Harita yerleştir kodunu yapıştırın">${esc(b.code||'')}</textarea>`;
  else if(b.type==='contact') body=`<input class="inp" id="blk${i}_title" value="${esc(b.title||'')}" placeholder="Bölüm başlığı (ops)"><p class="muted" style="font-size:11px">Telefon, e-posta ve adres <b>Ayarlar</b> bölümünden otomatik gelir; tıklanınca arama/mail açılır.</p>`;
  else if(b.type==='mecracards'){ const ids=(Array.isArray(b.ids)?b.ids:[]).map(String); const ms=(ui._mecralar||[]).filter(m=>m.hidden!==true);
    body=`<p class="muted" style="font-size:11.5px;margin:0 0 8px">Kart olarak gösterilecek mecraları seçin. <b>Hiçbiri seçilmezse yayındaki tüm mecralar</b> gösterilir.</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:6px">${ms.map(m=>`<label style="display:flex;gap:7px;align-items:center;font-size:13px"><input type="checkbox" class="blk${i}_mid" value="${m.id}" ${ids.includes(String(m.id))?'checked':''}> ${esc(m.name)}</label>`).join('')}</div>`; }
  else if(b.type==='divider') body=`<p class="muted" style="font-size:12px;margin:0">İnce yatay ayırıcı çizgi — ayar gerektirmez.</p>`;
  if(b.type==='heading') body=`<input class="inp" id="blk${i}_text" value="${esc(b.text||'')}" placeholder="Başlık metni">`;
  else if(b.type==='text') body=`<textarea class="inp" id="blk${i}_text" style="min-height:90px" placeholder="Paragraf metni">${esc(b.text||'')}</textarea>`;
  else if(b.type==='image') body=`<div style="display:flex;gap:8px"><input class="inp" id="blk${i}_url" value="${esc(b.url||'')}" placeholder="Görsel URL"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('blk${i}_url').value=u;})">Yükle</button></div><input class="inp" id="blk${i}_caption" value="${esc(b.caption||'')}" placeholder="Alt yazı (ops)" style="margin-top:8px">`;
  else if(b.type==='gallery'){ const imgs=Array.isArray(b.images)?b.images:[]; body=`${imgs.map((g,k)=>`<div class="list-item" style="padding:8px 10px"><div class="nm" style="font-size:12px;word-break:break-all">${esc(g)}</div><button class="btn btn-danger btn-sm" onclick="blkGalDel(${i},${k})">Sil</button></div>`).join('')||'<p class="muted" style="font-size:12px">Görsel yok.</p>'}<button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="pickUpload('image/*',u=>blkGalAdd(${i},u))">+ Görsel ekle</button>`; }
  else if(b.type==='features'){ const items=Array.isArray(b.items)?b.items:[]; body=`<textarea class="inp" id="blk${i}_items" style="min-height:100px" placeholder="Her satır: Başlık | Açıklama">${esc(items.map(x=>`${x.title||''} | ${x.desc||''}`).join('\n'))}</textarea><p class="muted" style="font-size:11px">Her satıra bir özellik: <b>Başlık | Açıklama</b></p>`; }
  else if(b.type==='faq'){ const items=Array.isArray(b.items)?b.items:[]; body=`<textarea class="inp" id="blk${i}_items" style="min-height:120px" placeholder="Her satır: Soru | Cevap">${esc(items.map(x=>`${x.q||''} | ${x.a||''}`).join('\n'))}</textarea><p class="muted" style="font-size:11px">Her satıra bir S.S.S.: <b>Soru | Cevap</b></p>`; }
  else if(b.type==='cta') body=`<input class="inp" id="blk${i}_title" value="${esc(b.title||'')}" placeholder="Başlık" style="margin-bottom:8px"><div class="row2"><input class="inp" id="blk${i}_label" value="${esc(b.label||'')}" placeholder="Buton yazısı"><input class="inp" id="blk${i}_link" value="${esc(b.link||'')}" placeholder="Link (tel: / https:)"></div>`;
  else if(b.type==='spacer') body=`<input class="inp" id="blk${i}_size" type="number" value="${b.size||40}" placeholder="Yükseklik px">`;
  return `<div class="blk${off?' blk-off':''}">${head}${body}</div>`;
}
function blkDup(i){ syncBlocks(); ui._blocks.splice(i+1,0,JSON.parse(JSON.stringify(ui._blocks[i]))); renderPageEd(); }
function blkToggle(i){ syncBlocks(); ui._blocks[i].off=ui._blocks[i].off===true?undefined:true; renderPageEd(); }
function readBlocks(){ return ui._blocks.map((b,i)=>{ const g=id=>{const e=document.getElementById('blk'+i+'_'+id);return e?e.value:'';};
  let o;
  if(b.type==='heading')o={type:'heading',text:g('text')};
  else if(b.type==='text')o={type:'text',text:g('text')};
  else if(b.type==='image')o={type:'image',url:g('url'),caption:g('caption')};
  else if(b.type==='gallery')o={type:'gallery',images:(Array.isArray(b.images)?b.images:[])};
  else if(b.type==='features')o={type:'features',items:g('items').split('\n').map(l=>l.split('|')).filter(a=>a[0]&&a[0].trim()).map(a=>({title:(a[0]||'').trim(),desc:(a[1]||'').trim()}))};
  else if(b.type==='faq')o={type:'faq',items:g('items').split('\n').map(l=>l.split('|')).filter(a=>a[0]&&a[0].trim()).map(a=>({q:(a[0]||'').trim(),a:(a[1]||'').trim()}))};
  else if(b.type==='cta')o={type:'cta',title:g('title'),label:g('label'),link:g('link')};
  else if(b.type==='spacer')o={type:'spacer',size:+g('size')||40};
  else if(b.type==='hero')o={type:'hero',title:g('title'),eyebrow:g('eyebrow'),sub:g('sub'),img:g('img'),imgMobil:g('imgMobil'),label:g('label'),link:g('link'),h:+g('h')||420,oc:g('oc')||'#0b1f2a',oo:Math.min(1,Math.max(0,parseFloat(g('oo'))||0))};
  else if(b.type==='imagetext')o={type:'imagetext',url:g('url'),side:g('side')||'left',title:g('title'),text:g('text'),label:g('label'),link:g('link')};
  else if(b.type==='counters')o={type:'counters',items:g('items').split('\n').map(l=>l.split('|')).filter(a=>a[0]&&a[0].trim()).map(a=>({n:(a[0]||'').trim(),label:(a[1]||'').trim()}))};
  else if(b.type==='logos')o={type:'logos',title:g('title'),images:(Array.isArray(b.images)?b.images:[])};
  else if(b.type==='quote')o={type:'quote',text:g('text'),who:g('who')};
  else if(b.type==='video')o={type:'video',url:g('url')};
  else if(b.type==='map')o={type:'map',code:g('code')};
  else if(b.type==='contact')o={type:'contact',title:g('title')};
  else if(b.type==='mecracards')o={type:'mecracards',ids:[...document.querySelectorAll('.blk'+i+'_mid:checked')].map(e=>+e.value)};
  else if(b.type==='divider')o={type:'divider'};
  else o={...b};
  if(b.off===true)o.off=true;
  return o; }); }
function syncBlocks(){ if(document.getElementById('pageEd')&&ui._blocks) ui._blocks=readBlocks(); }
function blkAdd(t){ syncBlocks(); const def={heading:{type:'heading',text:'Başlık'},text:{type:'text',text:''},image:{type:'image',url:'',caption:''},gallery:{type:'gallery',images:[]},features:{type:'features',items:[]},faq:{type:'faq',items:[]},cta:{type:'cta',title:'',label:'',link:''},spacer:{type:'spacer',size:40},
  hero:{type:'hero',title:'',eyebrow:'',sub:'',img:'',imgMobil:'',label:'',link:'',h:420,oc:'#0b1f2a',oo:0.45},
  imagetext:{type:'imagetext',url:'',side:'left',title:'',text:'',label:'',link:''},
  counters:{type:'counters',items:[]},logos:{type:'logos',title:'',images:[]},
  quote:{type:'quote',text:'',who:''},video:{type:'video',url:''},map:{type:'map',code:''},
  contact:{type:'contact',title:''},mecracards:{type:'mecracards',ids:[]},divider:{type:'divider'}}[t]; ui._blocks.push(def); renderPageEd(); }
function blkMove(i,d){ syncBlocks(); const j=i+d; if(j<0||j>=ui._blocks.length)return; [ui._blocks[i],ui._blocks[j]]=[ui._blocks[j],ui._blocks[i]]; renderPageEd(); }
function blkDel(i){ syncBlocks(); ui._blocks.splice(i,1); renderPageEd(); }
function blkGalAdd(i,url){ syncBlocks(); ui._blocks[i].images=ui._blocks[i].images||[]; ui._blocks[i].images.push(url); renderPageEd(); }
function blkGalDel(i,k){ syncBlocks(); ui._blocks[i].images.splice(k,1); renderPageEd(); }
/* S14: sayfa içeriği public sitede yayındadır. Kaydet yalnız açılıştaki
   sürüm hâlâ yerindeyse yazar (başka yöneticinin değişikliği ezilmez);
   başarısızlıkta düzenleyici ve bloklar olduğu gibi kalır. */
let _pageKayit=false;
async function pageSaveBlocks(){
  if(_pageKayit) return; syncBlocks();
  const yeni={title:(gv('pgTitle')||'').trim(),in_menu:gv('pgMenu')==='1',blocks:JSON.parse(JSON.stringify(ui._blocks||[]))};
  if(!yeni.title){ mpAlert('Sayfa başlığı zorunlu.','Sayfa'); return; }
  _pageKayit=true;
  try{
    if(ui._pageIlk){ const r=await kosulluGuncelle('pages',ui._pageIlk,yeni,'slug');
      if(r.bos){ toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; }
      ui._pageIlk=r.satir; }
    else { const {data,error}=await sb.from('pages').insert({slug:ui._pageSlug,...yeni}).select('*').single();
      if(error) throw error; ui._pageIlk=data; }
  }catch(e){ kayitHata(e,'Sayfa kaydedilemedi'); return; }
  finally{ _pageKayit=false; }
  ui._pages=await api('pages_list').catch(()=>ui._pages); toast('Sayfa kaydedildi.');
}
async function pageDel(slug){ if(await mpConfirm('Sayfa silinsin mi?','Sayfayı Sil')){ await api('page_delete&slug='+encodeURIComponent(slug)); renderSection(); } }
/* S14: yeni sayfa artık upsert DEĞİL insert: aynı adresli bir sayfa varsa
   önceki davranış onun başlığını ve içeriğini BOŞ sayfayla eziyordu. */
async function pageNew(){
  const t=((await mpPrompt('Yeni sayfa başlığı:','Yeni sayfa'))||'').trim(); if(!t) return;
  const slug=t.toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||('sayfa-'+Date.now());
  const {error}=await sb.from('pages').insert({slug,title:t,blocks:[],in_menu:true,sort:9});
  if(error){ mpAlert(error.code==='23505'?`“${slug}” adresli bir sayfa zaten var. Farklı bir başlık seçin ya da mevcut sayfayı düzenleyin.`:hataMetni(error),'Sayfa oluşturulamadı'); return; }
  ui._pages=await api('pages_list'); pageEdit(slug); }


/* ---------- MEDYA PLANLAMA TALEPLERİ ---------- */
async function talepler(c){
  const st=await api('settings_get'); ui._settings=st; const pl=st.plan||{};
  const {data:rows,error}=await sb.from('leads').select('*').order('created_at',{ascending:false}).limit(300);
  if(error){ c.innerHTML='<div class="banner">Talepler okunamadı: '+esc(error.message)+'</div>'; return; }
  ui._leads=rows||[];
  const yeni=ui._leads.filter(x=>!x.okundu).length;
  const list=ui._leads.map(l=>`<div class="list-item" style="${l.okundu?'':'border-left:3px solid var(--c-accent)'}">
    <div class="nm">${esc(l.ad||'—')}${l.firma?` <span class="muted" style="font-weight:400">· ${esc(l.firma)}</span>`:''}</div>
    <div class="meta">${esc(String(l.created_at||'').slice(0,16).replace('T',' '))}${l.butce?' · '+esc(l.butce):''}</div>
    <button class="btn btn-outline btn-sm" onclick="leadView(${l.id})">Aç</button>
    <button class="btn btn-danger btn-sm" onclick="leadDel(${l.id})">Sil</button></div>`).join('');
  c.innerHTML=`
  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Form Ayarları</h3>
    <p class="muted" style="font-size:13px;margin:0 0 14px">Sitedeki <b>Medya Planlama</b> sayfasının başlığı, açıklaması ve bildirim adresi. Sayfayı menüye eklemek için Ayarlar &gt; Header Menüsü'nde tür olarak "Medya Planlama"yı seçin.</p>
    <div class="row2"><div class="field"><label class="flabel">Sayfa başlığı</label><input class="inp" id="plT" value="${esc(pl.title||'Medya Planlama')}"></div>
    <div class="field"><label class="flabel">Bildirim e-postası</label><input class="inp" id="plM" value="${esc(st.leadMail||'')}" placeholder="talep@medyaparkadana.com"></div></div>
    <div class="field"><label class="flabel">Form üstü açıklama</label><textarea class="inp" id="plD">${esc(pl.desc||'Kampanya hedefinizi paylaşın; ekibimiz bütçenize en uygun mecra karmasını ücretsiz planlasın.')}</textarea></div>
    <div class="field"><label class="flabel">Teşekkür mesajı (gönderim sonrası)</label><textarea class="inp" id="plTk">${esc(pl.thanks||'')}</textarea>
      <p class="muted" style="font-size:11.5px;margin:4px 0 0">Boş bırakılırsa kişiye adıyla hitap eden hazır bir karşılama gösterilir.</p></div>
    <button class="btn btn-primary btn-sm" onclick="planAyarKaydet()">Kaydet</button>
    <p class="muted" style="font-size:12px;margin:12px 0 0"><b>E-posta bildirimi hakkında:</b> Ücretsiz FormSubmit servisi kullanılır. Adresi ilk kez kaydedip siteden bir deneme talebi gönderdiğinizde FormSubmit size tek seferlik bir <b>onay e-postası</b> yollar — içindeki bağlantıya tıklayın, sonrası otomatiktir. Talepler her durumda bu panele düşer.</p></div>
  <div class="sec-card"><div class="sec-head"><h3>Gelen Talepler ${yeni?`<span class="nav-badge" style="position:static;display:inline-flex;margin-left:8px">${yeni}</span>`:''}</h3></div>
    ${list||'<p class="muted">Henüz talep yok.</p>'}</div>`;
}
async function planAyarKaydet(){
  await api('settings_save',{leadMail:gv('plM').trim(),plan:{title:gv('plT'),desc:gv('plD'),thanks:gv('plTk')}});
  toast('Kaydedildi. Sitede Ctrl+F5 ile görünür.');
}
async function leadView(id){
  const l=(ui._leads||[]).find(x=>x.id===id); if(!l)return;
  if(!l.okundu){ await sb.from('leads').update({okundu:true}).eq('id',id); l.okundu=true; }
  const mecs=Array.isArray(l.mecralar)?l.mecralar.join(', '):'';
  modal(`<h3 style="margin:0 0 4px">${esc(l.ad||'—')}</h3>
    <div class="muted" style="font-size:12.5px;margin-bottom:14px">${esc(String(l.created_at||'').slice(0,16).replace('T',' '))}</div>
    <div class="nv-body" style="line-height:1.9">
      ${l.firma?`<b>Firma:</b> ${esc(l.firma)}<br>`:''}
      <b>Telefon:</b> ${l.telefon?`<a href="tel:${esc(String(l.telefon).replace(/\s/g,''))}">${esc(l.telefon)}</a>`:'—'}<br>
      <b>E-posta:</b> ${l.eposta?`<a href="mailto:${esc(l.eposta)}">${esc(l.eposta)}</a>`:'—'}<br>
      <b>Bütçe:</b> ${esc(l.butce||'—')}<br>
      <b>İlgilenilen mecralar:</b> ${esc(mecs||'—')}<br>
      <b>Hedef kitle:</b> ${esc(l.hedef_kitle||'—')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button>
      <button class="btn btn-outline btn-sm" onclick="leadMusteri(${l.id})">Müşteri olarak ekle</button></div>`);
  renderSection();
}
async function leadMusteri(id){
  const l=(ui._leads||[]).find(x=>x.id===id); if(!l)return;
  /* S02_001: talepteki kisi adi provenance kolonuna degil, gercek bir
     Contact kaydina yazilir. */
  const r=await api('customer_save',{firma:l.firma||l.ad,telefon:l.telefon,eposta:l.eposta,not:'Medya planlama talebinden: '+[l.butce,(Array.isArray(l.mecralar)?l.mecralar.join(', '):'')].filter(Boolean).join(' · ')});
  const ad=String(l.ad||'').trim();
  if(r && r.id && ad){ await api('contact_save',{id:0,customer_id:r.id,name:ad,phone:l.telefon||null,email:l.eposta||null,is_primary:true,source_type:'lead',source_ref:'leads#'+l.id}); }
  closeModal(); toast('Kurum ve ilgili kişi kaydı oluşturuldu.');
}
async function leadDel(id){ if(!await mpConfirm('Talep silinsin mi?','Talebi Sil'))return; await sb.from('leads').delete().eq('id',id); renderSection(); }

/* ---------- BÜLTEN ABONELERİ ---------- */
async function aboneler(c){
  const {data,error}=await sb.from('aboneler').select('*').order('created_at',{ascending:false});
  if(error){ c.innerHTML='<div class="banner">Okunamadı: '+esc(error.message)+'</div>'; return; }
  const list=data||[];
  c.innerHTML=`<div class="sec-head"><div><h3>Bülten Aboneleri</h3><p class="sub">${list.length} adres · sitedeki footer formundan gelir</p></div>
      <button class="btn btn-outline btn-sm" onclick="aboneDisa()">${ic('download',15)} CSV indir</button></div>
    ${list.length?`<table class="tbl"><thead><tr><th>E-posta</th><th>Kaynak</th><th>Tarih</th><th></th></tr></thead><tbody>
      ${list.map(a=>`<tr><td>${esc(a.eposta)}</td><td>${esc(a.kaynak||'')}</td><td>${esc(String(a.created_at||'').slice(0,10))}</td>
        <td><button class="btn btn-danger btn-sm" onclick="aboneSil(${a.id})">Sil</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Henüz abone yok.</p>'}`;
  ui._aboneler=list;
}
async function aboneSil(id){ if(!await mpConfirm('Abone silinsin mi?','Aboneyi Sil'))return; await sb.from('aboneler').delete().eq('id',id); renderSection(); }
function aboneDisa(){ const rows=[['E-posta','Kaynak','Tarih'],...(ui._aboneler||[]).map(a=>[a.eposta,a.kaynak||'',String(a.created_at||'').slice(0,10)])];
  const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(';')).join('\n');
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='aboneler.csv'; a.click(); }

/* ---------- İKON KÜTÜPHANESİ ---------- */
function ikonListe(){ const st=ui._settings||{}; return Array.isArray(st.icons)?st.icons:[]; }
async function ikonlar(c){
  const st=await api('settings_get'); ui._settings=st; const list=ikonListe();
  const kart=list.map((ic,i)=>`<div class="ik-card">
      <div class="ik-pv"><img src="${esc(ic.url)}" alt=""></div>
      <input class="inp inp-sm" value="${esc(ic.name||'')}" placeholder="İkon adı" onchange="ikonAd(${i},this.value)">
      <div class="ik-act">
        <button class="btn btn-ghost btn-sm" title="Bu ikonun anahtarını kopyala" onclick="navigator.clipboard&&navigator.clipboard.writeText('svg:${esc(ic.id)}');toast('Kopyalandı: svg:${esc(ic.id)}')">svg:${esc(ic.id)}</button>
        <button class="btn btn-danger btn-sm" onclick="ikonSil(${i})">Sil</button></div></div>`).join('');
  c.innerHTML=`<div class="sec-head"><div><h3>İkon Kütüphanesi</h3><p class="sub">${list.length} ikon · SVG yükleyin, ürünlerde ve mecra avantajlarında seçin</p></div>
      <button class="btn btn-primary btn-sm" onclick="ikonYukle()">+ SVG Yükle</button></div>
    <div class="banner">Yüklediğiniz ikonlar <b>Ürünler</b> formundaki ikon seçicide ve <b>Mecra &gt; Tanıtım &gt; Avantajlar</b> satırlarında "Yüklenen ikonlar" başlığıyla listelenir. Sitede ürün sekmelerinde, filtre düğmelerinde ve avantaj kutularında görünürler. Tek renk, 24×24 kare, çizgi tabanlı SVG'ler siteyle en uyumlu sonucu verir; birden fazla dosyayı aynı anda seçebilirsiniz.</div>
    <div class="ik-grid">${kart||'<p class="muted">Henüz ikon yok. "+ SVG Yükle" ile başlayın.</p>'}</div>`;
}
function ikonYukle(){
  const inp=document.createElement('input'); inp.type='file'; inp.accept='image/svg+xml,.svg'; inp.multiple=true;
  inp.onchange=async()=>{ const files=[...inp.files]; if(!files.length)return;
    toast(files.length+' ikon yükleniyor…');
    const list=ikonListe().slice();
    for(const f of files){
      if(!/svg/i.test(f.type)&&!/\.svg$/i.test(f.name)){ toast(f.name+' SVG değil, atlandı'); continue; }
      try{ const url=await uploadFile(f,{});
        const ad=f.name.replace(/\.svg$/i,'').replace(/[-_]+/g,' ');
        list.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:ad,url}); }
      catch(e){ mpAlert(f.name+': '+(e.message||e),'Yükleme'); }
    }
    ui._settings.icons=list; await api('settings_save',{icons:list}); renderSection(); toast('İkonlar kaydedildi.');
  };
  inp.click();
}
async function ikonAd(i,v){ const list=ikonListe().slice(); if(!list[i])return; list[i].name=v.trim(); ui._settings.icons=list; await api('settings_save',{icons:list}); }
async function ikonSil(i){ const list=ikonListe().slice(); const ic=list[i]; if(!ic)return;
  if(!await mpConfirm(`"${ic.name||ic.id}" ikonu kütüphaneden silinsin mi? Bu ikonu kullanan ürün/avantajlar varsayılan ikona döner.`,'İkonu Sil'))return;
  list.splice(i,1); ui._settings.icons=list; await api('settings_save',{icons:list}); renderSection(); }
/* Ürün ve avantaj formları için ikon seçici: hazır set + yüklenenler */
function ikonSecici(id,secili,ekstraClass){
  const yuk=ikonListe();
  return `<select class="inp ${ekstraClass||''}" id="${id}">
    <optgroup label="Hazır ikonlar">${URUN_IKONLAR.map(x=>`<option value="${x[0]}" ${(secili||'diger')===x[0]?'selected':''}>${x[1]}</option>`).join('')}</optgroup>
    ${yuk.length?`<optgroup label="Yüklenen ikonlar">${yuk.map(x=>`<option value="svg:${esc(x.id)}" ${secili==='svg:'+x.id?'selected':''}>${esc(x.name||x.id)}</option>`).join('')}</optgroup>`:''}
  </select>`;
}

/* ---------- NOTLAR ---------- */
async function notlar(c){
  const list=await api('notes_list'); ui._notes=list;
  const rows=list.map(n=>`<div class="list-item note-row" onclick="noteView(${n.id})">
    <div class="nm">${esc(n.konu)}</div>
    <div class="meta">${esc(n.ilgili_kisi||'')}${n.tarih?' · '+esc(n.tarih):''} — ${esc(String(n.body||'').slice(0,70))}${String(n.body||'').length>70?'…':''}</div>
    <button class="btn btn-outline btn-sm" onclick="event.stopPropagation();noteForm(${n.id})">Düzenle</button>
    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();noteDel(${n.id})">Sil</button></div>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Notlar</h3><button class="btn btn-primary btn-sm" onclick="noteForm(0)">+ Not</button></div>${rows||'<p class="muted">Not yok.</p>'}`;
}
function noteView(id){ const n=(ui._notes||[]).find(x=>x.id===id); if(!n)return;
  modal(`<div class="nv-head"><h3 style="margin:0">${esc(n.konu||'Not')}</h3>
      <div class="nv-meta">${esc(n.ilgili_kisi||'')}${n.tarih?' · '+esc(n.tarih):''}${n.created_at?' · eklendi '+esc(String(n.created_at).slice(0,10)):''}</div></div>
    <div class="nv-body">${esc(n.body||'—')}</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
      <button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Kapat</button>
      <button class="btn btn-outline btn-sm" onclick="noteForm(${n.id})">Düzenle</button></div>`);
}
async function noteForm(id){
  let n={};
  if(id){ const r=await guard(()=>kayitTazeOku('notes','id',id),'Not açılamadı'); if(r===null) return;
    if(!r){ mpAlert('Not bulunamadı.','Not'); return; } n=r; }
  ui._noteIlk=id?n:null;
  modal(`<h3 style="margin:0 0 14px">${id?'Not':'Yeni Not'}</h3><input type="hidden" id="nid" value="${id||0}">
    <div class="field"><label class="flabel">Konu</label><input class="inp" id="nk" value="${esc(n.konu)}"></div>
    <div class="row2"><div class="field"><label class="flabel">İlgili Kişi</label><input class="inp" id="nik" value="${esc(n.ilgili_kisi)}"></div>
    <div class="field"><label class="flabel">Tarih</label><input class="inp" id="nt" type="date" value="${esc(n.tarih)}"></div></div>
    <div class="field"><label class="flabel">İçerik</label><textarea class="inp" style="min-height:120px" id="nb">${esc(n.body)}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="modalVazgec()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="noteSave()">Kaydet</button></div>`);
}
async function noteSave(){
  const btn=document.querySelector('#modal .btn-primary'); if(btn&&btn.disabled) return;
  const id=+gv('nid'), yeni={konu:gv('nk'),ilgili_kisi:gv('nik'),tarih:gv('nt')||null,body:gv('nb')};
  if(!(yeni.konu.trim()||yeni.body.trim())){ mpAlert('Konu ya da içerik girin.','Not'); return; }
  modalBusy(true);
  try{
    if(id){ const r=await kosulluGuncelle('notes',ui._noteIlk||{},yeni);
      if(r.bos){ modalBusy(false); closeModal(); toast('Değişiklik yok — kaydedilecek bir şey olmadı.'); return; } }
    else await api('note_save',{id:0,...yeni});
  }catch(e){ modalBusy(false); kayitHata(e,'Not kaydedilemedi'); return; }
  modalBusy(false); closeModal(); renderSection(); toast('Not kaydedildi.');
}
async function noteDel(id){ if(await mpConfirm('Not silinsin mi?','Notu Sil')){ await api('note_delete&id='+id); renderSection(); } }

/* ---------- AYARLAR ---------- */
async function ayarlar(c){
  const [st,pg,mc]=await Promise.all([api('settings_get'),api('pages_list'),api('mecra_list')]);
  ui._settings=st; ui._pages=pg; ui._mecralar=mc; ftrInit(st); mnuInit(st);
  c.innerHTML=`
  <div class="sec-card"><h3 style="margin:0 0 14px;font-size:16px">Ajans Bilgileri</h3>
    <div class="row2"><div class="field"><label class="flabel">Site adı</label><input class="inp" id="sName" value="${esc(st.siteName||'')}"></div>
    <div class="field"><label class="flabel">Telefon</label><input class="inp" id="sPhone" value="${esc(st.phone||'')}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">E-posta</label><input class="inp" id="sMail" value="${esc(st.email||'')}"></div>
    <div class="field"><label class="flabel">Adres</label><input class="inp" id="sAddr" value="${esc(st.address||'')}"></div></div>
    <div class="field"><label class="flabel">Katalog PDF (yükle veya yol)</label><div style="display:flex;gap:8px"><input class="inp" id="sPdf" value="${esc(st.catalogPdf||'')}"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('application/pdf',u=>{document.getElementById('sPdf').value=u;})">Yükle</button></div></div>
    <button class="btn btn-primary btn-sm" onclick="saveSettings()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 12px;font-size:16px">Sosyal Medya Linkleri</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">Doldurduklarınız sitenin üst çubuğunda ikon olarak görünür; WhatsApp ayrıca mecra sayfalarındaki teklif kutusunda çıkar.</p>
    <div class="row2"><div class="field"><label class="flabel">WhatsApp</label><input class="inp" id="soWa" value="${esc(st.social_whatsapp||'')}" placeholder="https://wa.me/90..."></div>
    <div class="field"><label class="flabel">Instagram</label><input class="inp" id="soIg" value="${esc(st.social_instagram||'')}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">LinkedIn</label><input class="inp" id="soLi" value="${esc(st.social_linkedin||'')}"></div>
    <div class="field"><label class="flabel">Facebook</label><input class="inp" id="soFb" value="${esc(st.social_facebook||'')}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">X (Twitter)</label><input class="inp" id="soTw" value="${esc(st.social_x||'')}"></div>
    <div class="field"><label class="flabel">YouTube</label><input class="inp" id="soYt" value="${esc(st.social_youtube||'')}"></div></div>
    <button class="btn btn-primary btn-sm" onclick="saveSocial()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 12px;font-size:16px">Site Görünümü — Logo & Favicon</h3>
    <div class="row2">
      <div class="field"><label class="flabel">Logo metni</label><input class="inp" id="gLogoT" value="${esc(st.logoText||'')}" placeholder="medyapark"></div>
      <div class="field"><label class="flabel">Logo görseli (yüklenirse metin yerine geçer)</label>
        <div style="display:flex;gap:8px"><input class="inp" id="gLogoI" value="${esc(st.logoImage||'')}">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('gLogoI').value=u;})">Yükle</button></div></div></div>
    <div class="field"><label class="flabel">Favicon (sekme simgesi — kare PNG/ICO, 64×64 önerilir)</label>
      <div style="display:flex;gap:8px;align-items:center">
        ${st.favicon?`<img src="${esc(st.favicon)}" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--c-line)">`:''}
        <input class="inp" id="gFav" value="${esc(st.favicon||'')}">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('gFav').value=u;})">Yükle</button></div></div>
    <div class="field" style="max-width:360px"><label class="flabel">Künye şeridi — ziyaretçi/gösterim ikonu (lokasyon sayfası kapak altı)</label>
      ${ikonSecici('gBarIk',st.barIkon||'diger')}
      <p class="muted" style="font-size:11.5px;margin:4px 0 0">Aynı şeritteki alan rozetlerinin ikonları (Megalight, Raket, LED…) <b>Envanter › Ürünler</b>'de her ürünün kendi ikon seçiminden gelir; kendi SVG'lerinizi <b>Site İçeriği › İkonlar</b>'dan yükleyin.</p></div>
    <div class="field"><label class="flabel">Teklif bandı görseli (lokasyon sayfalarının altındaki siyah bant — genel açıkhava fotoğrafı, yatay, min. 1600px)</label>
      <div class="imgf">
        <span class="imgf-pv${st.bantImage?'':' bos'}" id="gBant_pv" onclick="imgAc('gBant')">${st.bantImage?`<img src="${esc(st.bantImage)}" alt="">`:''}</span>
        <input class="inp" id="gBant" value="${esc(st.bantImage||'')}" placeholder="https://..." oninput="imgPv('gBant')">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('gBant').value=u;imgPv('gBant');})">Yükle</button>
        <button class="btn btn-ghost btn-sm imgf-x" onclick="imgSil('gBant')">✕</button></div>
      <p class="muted" style="font-size:11.5px;margin:4px 0 0">Boşsa her mecranın kendi tanıtım/kart görseli kullanılır.</p></div>
    <button class="btn btn-primary btn-sm" onclick="saveGorunum()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 12px;font-size:16px">Panel Görünümü</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">Yalnızca bu yönetim panelini etkiler; siteye dokunmaz.</p>
    <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap">
      <div class="field" style="margin:0"><label class="flabel">Vurgu rengi</label>
        <input id="pTColor" type="color" value="${esc((st.panelTheme||{}).accent||'#e11d48')}" style="width:64px;height:38px;border:1px solid var(--c-line);border-radius:10px;background:#fff;padding:3px"></div>
      <div class="field" style="margin:0;flex:1;min-width:240px"><label class="flabel">Panel logosu (sol üst)</label>
        <div style="display:flex;gap:8px"><input class="inp" id="pTLogo" value="${esc((st.panelTheme||{}).logo||'')}">
        <button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('pTLogo').value=u;})">Yükle</button></div></div>
      <button class="btn btn-primary btn-sm" onclick="savePanelTheme()">Kaydet</button>
      <button class="btn btn-ghost btn-sm" onclick="savePanelTheme(true)">Varsayılana dön</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Referans Logoları</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">Anasayfada mecra kartlarının altında "Referanslar" başlığıyla sağa doğru akan logo şeridi. Şeffaf zeminli PNG önerilir. Logo eklenmezse bölüm hiç görünmez.</p>
    <div class="field" style="max-width:340px"><label class="flabel">Bölüm başlığı</label><input class="inp" id="refT" value="${esc(st.refTitle||'Referanslar')}"></div>
    <div id="refBox">${(Array.isArray(st.refLogos)?st.refLogos:[]).map((u,i)=>`<div class="list-item" style="padding:8px 10px"><img src="${esc(u)}" style="height:30px;max-width:110px;object-fit:contain"><div class="nm" style="font-size:11.5px;word-break:break-all">${esc(u)}</div><button class="btn btn-danger btn-sm" onclick="refDel(${i})">Sil</button></div>`).join('')||'<p class="muted" style="font-size:12px">Henüz logo yok.</p>'}</div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-outline btn-sm" onclick="pickUpload('image/*',u=>refAdd(u))">+ Logo yükle</button>
      <button class="btn btn-primary btn-sm" onclick="refSave()">Kaydet</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 12px;font-size:16px">SEO Meta Etiketleri</h3>
    <div class="field"><label class="flabel">Başlık (title)</label><input class="inp" id="seoT" value="${esc(st.seoTitle||'')}"></div>
    <div class="field"><label class="flabel">Açıklama (description)</label><textarea class="inp" id="seoD">${esc(st.seoDesc||'')}</textarea></div>
    <div class="field"><label class="flabel">Anahtar kelimeler</label><input class="inp" id="seoK" value="${esc(st.seoKeywords||'')}"></div>
    <button class="btn btn-primary btn-sm" onclick="saveSeo()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Yedekleme</h3>
    <p class="muted" style="font-size:13px;margin:0 0 4px">Supabase'in ücretsiz planında otomatik yedek yoktur. Bütün tablolarınızı tek bir dosyaya indirip bilgisayarınızda saklayabilirsiniz.</p>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px"><b>Veri girişi yaptığınız günlerde her akşam bir yedek almanızı öneririm.</b> Dosyayı bilgisayarınızda ya da bulut diskinizde saklayın.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="bkBtn" onclick="yedekAl()">${ic('download',15)} Yedek Al (JSON)</button>
      <button class="btn btn-outline btn-sm" onclick="yedekYukleAc()">${ic('upload',15)} Yedekten Geri Yükle</button></div>
    <div id="bkInfo"></div>
    <p class="muted" style="font-size:12px;margin:12px 0 0"><b>Not:</b> Yedek dosyası metin verilerini içerir; yüklediğiniz görseller Supabase deposunda kalır. Yedek içinde görsel bağlantılarının listesi de bulunur.</p></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">İşlem Kayıtları</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Panelde kim ne yaptı, en yeniden eskiye doğru listelenir. Girişler, kaydetmeler, silmeler ve doluluk değişiklikleri kaydedilir.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <button class="btn btn-outline btn-sm" onclick="logYukle()">${ic('clock',15)} Kayıtları Getir</button>
      <select class="inp" id="logLim" style="max-width:150px" onchange="logYukle()">
        <option value="50">son 50 kayıt</option><option value="200" selected>son 200 kayıt</option>
        <option value="500">son 500 kayıt</option></select>
      <button class="btn btn-ghost btn-sm" onclick="logTemizle()">30 günden eskileri sil</button>
    </div>
    <div id="logBox"><p class="muted" style="font-size:12.5px">Görüntülemek için "Kayıtları Getir" deyin.</p></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Google Analytics</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Ziyaretçi istatistiklerini görmek için Google Analytics 4 ölçüm kimliğini girin. Boş bırakırsanız hiçbir takip kodu yüklenmez.
      <br>Kimliği almak için: analytics.google.com → Yönetici → Veri akışları → web akışınız → <b>Ölçüm Kimliği</b> (G- ile başlar).</p>
    <div class="field" style="max-width:320px"><label class="flabel">Ölçüm Kimliği</label>
      <input class="inp" id="gaId" value="${esc(st.gaId||'')}" placeholder="G-XXXXXXXXXX"></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="saveGa()">Kaydet</button>
      <span class="muted" style="font-size:12.5px">Durum: <b>${st.gaId?'Takip açık':'Kapalı'}</b></span></div>
    <p class="muted" style="font-size:12px;margin:10px 0 0">Sayfa geçişleri tek sayfalık sitelerde otomatik sayılmaz; bu yüzden her sayfa değişiminde görüntüleme kaydı ayrıca gönderilir.</p></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Header Menüsü</h3>
    <p class="muted" style="font-size:13px;margin:0 0 14px">Sitenin üst kısmındaki menü. Sırayı oklarla değiştirin, onay kutusuyla gizleyip gösterin. Dar ekranlarda bu menü otomatik olarak ☰ düğmesinin içine geçer.</p>
    <div id="mnuBox"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn btn-primary btn-sm" onclick="mnuSave()">Menüyü Kaydet</button>
      <button class="btn btn-ghost btn-sm" onclick="mnuReset()">Varsayılana dön</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Footer Menüleri</h3>
    <p class="muted" style="font-size:13px;margin:0 0 14px">Sitenin altındaki bağlantı sütunlarını buradan düzenleyin. Sütun ekleyip silebilir, bağlantıları sıralayabilirsiniz. Marka açıklaması, iletişim ve bülten blokları ayrı ayarlardan gelir.</p>
    <div id="ftrBox"></div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin:14px 0 4px">
      <label class="mini"><input type="checkbox" id="ftrHideC" ${st.footer&&st.footer.hideContact?'checked':''}> İletişim bloğunu gizle</label>
      <label class="mini"><input type="checkbox" id="ftrHideN" ${st.footer&&st.footer.hideNews?'checked':''}> Bülten bloğunu gizle</label>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <button class="btn btn-primary btn-sm" onclick="ftrSave()">Footer'ı Kaydet</button>
      <button class="btn btn-ghost btn-sm" onclick="ftrReset()">Varsayılana dön</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Site Haritası (SEO)</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Google'a hangi sayfaların var olduğunu bildiren dosya. Mecra veya sayfa ekledikçe yeniden üretip sitenin ana klasörüne yükleyin.</p>
    <div class="field"><label class="flabel">Site adresi</label><input class="inp" id="siteUrl" value="${esc(st.siteUrl||'https://medyaparkadana.com')}"></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-outline btn-sm" onclick="api('settings_save',{siteUrl:gv('siteUrl')}).then(()=>mpAlert('Kaydedildi.'))">Adresi Kaydet</button>
      <button class="btn btn-primary btn-sm" onclick="buildSitemap()">sitemap.xml Üret ve İndir</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Fiyat Gösterimi</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Kapalıyken sitede hiçbir yerde fiyat görünmez: mecra detayındaki <b>Fiyatlar</b> kutusu, sepetteki tutarlar ve toplam, PDF/Excel çıktılarındaki fiyat sütunu. Müşteri yine ay seçip <b>Teklif Al</b> ile talep gönderebilir.</p>
    <label class="switch"><input type="checkbox" id="showPrices" ${st.showPrices!==false?'checked':''}><span class="sl"></span><span class="txt">Fiyatları sitede göster</span></label>
    <div><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="savePrices()">Kaydet</button></div></div>

  <div class="sec-card"><h3 style="margin:0 0 10px;font-size:16px">Yedek</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Tüm verilerin (mecralar, alt mecralar, doluluk, teklifler, müşteriler…) JSON yedeğini indir.</p>
    <button class="btn btn-outline btn-sm" onclick="exportBackup()">Yedek indir (JSON)</button></div>

  <div class="sec-card"><h3 style="margin:0 0 12px;font-size:16px">Footer</h3>
    <div class="field"><label class="flabel">Hakkımızda (logo altı kısa metin)</label><textarea class="inp" id="fAbout">${esc(st.footer_about||'')}</textarea></div>
    <div class="field"><label class="flabel">Bülten başlığı</label><input class="inp" id="fNews" value="${esc(st.footer_news||'')}"></div>
    <div class="field"><label class="flabel">Alt telif metni</label><input class="inp" id="fNote" value="${esc(st.footer_note||'')}"></div>
    <button class="btn btn-primary btn-sm" onclick="saveFooter()">Kaydet</button></div>
  <div class="sec-card"><h3 style="margin:0 0 8px;font-size:16px">Panel Şifresi</h3>
    <div class="row2"><div class="field"><input class="inp" id="npw" type="password" placeholder="Yeni şifre"></div>
    <div class="field"><button class="btn btn-primary" onclick="changePw()">Şifreyi Güncelle</button></div></div></div>`;
  ftrRender(); mnuRender();
}
async function savePrices(){ await api('settings_save',{showPrices:document.getElementById('showPrices').checked}); mpAlert('Kaydedildi. Siteyi yenileyin.'); }
async function saveSettings(){ await api('settings_save',{siteName:gv('sName'),phone:gv('sPhone'),email:gv('sMail'),address:gv('sAddr'),catalogPdf:gv('sPdf')}); mpAlert('Kaydedildi.'); }
async function saveGorunum(){ await api('settings_save',{logoText:gv('gLogoT'),logoImage:gv('gLogoI'),favicon:gv('gFav'),bantImage:gv('gBant'),barIkon:gv('gBarIk')}); toast('Kaydedildi. Sitede Ctrl+F5 ile görünür.'); }
async function savePanelTheme(reset){
  const t=reset?null:{accent:gv('pTColor'),logo:gv('pTLogo')};
  await api('settings_save',{panelTheme:t}); applyPanelTheme(t||{}); if(reset)renderSection();
  toast(reset?'Panel varsayılana döndü.':'Panel görünümü kaydedildi.');
}
function _shade(hex,f){ const m=String(hex||'').match(/^#([0-9a-f]{6})$/i); if(!m)return hex;
  const n=parseInt(m[1],16); const r=Math.round(((n>>16)&255)*f), g=Math.round(((n>>8)&255)*f), b=Math.round((n&255)*f);
  return '#'+[r,g,b].map(x=>Math.max(0,Math.min(255,x)).toString(16).padStart(2,'0')).join(''); }
function applyPanelTheme(t){
  t=t||{}; const r=document.documentElement.style;
  if(t.accent){ r.setProperty('--c-accent',t.accent); r.setProperty('--c-accent-d',_shade(t.accent,.8));
    r.setProperty('--c-brand',t.accent); r.setProperty('--c-brand-d',_shade(t.accent,.72)); r.setProperty('--c-brand-dk',_shade(t.accent,.4)); }
  else ['--c-accent','--c-accent-d','--c-brand','--c-brand-d','--c-brand-dk'].forEach(k=>r.removeProperty(k));
  const br=document.querySelector('.side .brand');
  /* Tema logosu uygulanırken yüzey etiketi korunur — aksi halde
     showApp'ten sonra çalışıp Workspace başlığını eziyordu. */
  if(br){ if(t.logo) br.innerHTML=`<img src="${esc(t.logo)}" alt="" style="max-height:34px;max-width:160px;object-fit:contain"><span class="brand-sub">${surfaceGet()==='workspace'?'Team Workspace':'Yönetim Paneli'}</span>`; }
}
function refAdd(u){ ui._settings.refLogos=Array.isArray(ui._settings.refLogos)?ui._settings.refLogos:[]; ui._settings.refLogos.push(u); refSave(true); }
function refDel(i){ (ui._settings.refLogos||[]).splice(i,1); refSave(true); }
async function refSave(sessiz){ await api('settings_save',{refTitle:gv('refT')||'Referanslar',refLogos:ui._settings.refLogos||[]}); if(sessiz){renderSection();} else toast('Kaydedildi. Sitede Ctrl+F5 ile görünür.'); }
async function saveSocial(){ await api('settings_save',{social_whatsapp:gv('soWa'),social_instagram:gv('soIg'),social_linkedin:gv('soLi'),social_facebook:gv('soFb'),social_x:gv('soTw'),social_youtube:gv('soYt')}); mpAlert('Kaydedildi.'); }
async function saveSeo(){ await api('settings_save',{seoTitle:gv('seoT'),seoDesc:gv('seoD'),seoKeywords:gv('seoK')}); mpAlert('Kaydedildi.'); }
async function saveFooter(){ await api('settings_save',{footer_about:gv('fAbout'),footer_news:gv('fNews'),footer_note:gv('fNote')}); mpAlert('Kaydedildi.'); }
async function exportBackup(){ const tables=['settings','pages','products','mecralar','alt_mecralar','units','bookings','customers','contacts','quotes','quote_items','jobs','work_parties','entries','work_operations','team','notes','suppliers'];
  const out={_exported:new Date().toISOString()}; for(const t of tables){ try{ const {data}=await sb.from(t).select('*'); out[t]=data||[]; }catch(e){ out[t]='HATA'; } }
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='medyapark-yedek-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href); }
async function changePw(){ const p=gv('npw'); if(p.length<4){mpAlert('En az 4 karakter.');return;} await api('password_change',{password:p}); mpAlert('Şifre güncellendi.'); }

boot();
