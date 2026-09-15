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



/* ==========================================================
   YEDEKLEME  (Supabase ücretsiz planda otomatik yedek yok)
   Tüm tablolar tek JSON dosyasına indirilir; aynı dosyadan
   geri yüklenebilir.
   ========================================================== */
const YEDEK_TABLO=['settings','pages','products','mecralar','alt_mecralar','units',
  'customers','contacts','suppliers','jobs','work_parties','entries','work_operations','bookings','notes','team','quotes','quote_items'];
/* geri yükleme sırası: bağımlı tablolar sonra gelmeli
   (contacts -> customers'a bağlı olduğu için ondan sonra gelir) */
const YEDEK_SIRA=['settings','pages','products','customers','contacts','suppliers','team',
  'mecralar','alt_mecralar','units','jobs','work_parties','entries','work_operations','bookings','notes','quotes','quote_items'];

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
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
  booking_toggle:['Doluluk','güncelledi'],
  settings_save:['Ayarlar','güncelledi'],
  password_change:['Şifre','değiştirdi']
};
/* Sistem tarafından bilinen olay ayrıca kullanıcıya yazdırılmaz; system
   Entry olarak timeline'a düşer (BR-E03, 08 §8). Başarısızlığı ana işlemi
   bozmaz fakat sessizce yutulmaz — konsola raporlanır. */
async function sysEntry(jobId, body, extra){
  if(!jobId||!body) return;
  const row={job_id:jobId, body, source:'system',
    created_by_team_id:(ui._me&&ui._me.id)||null, ...(extra||{})};
  /* await edilebilir: çağıran timeline'ı yeniden çizmeden önce bekler,
     yoksa kayıt DB'ye yazılsa bile ekranda bir tur geç görünür.
     Hata ana işlemi bozmaz fakat sessizce yutulmaz (08 §8). */
  try{
    const {error}=await sb.from('entries').insert(row);
    if(error) console.warn('system entry yazılamadı:', error.message, row);
  }catch(e){ console.warn('system entry yazılamadı:', e); }
}
function logYaz(act, body, q){
  const m=LOG_AD[act]; if(!m)return;
  let detay='';
  try{
    if(act==='booking_toggle') detay=`${body.ym} · ${body.status}`;
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
function mpDlg(o){ return new Promise(res=>{
  const eski=document.getElementById('mpDlgBg'); if(eski)eski.remove();
  const bg=document.createElement('div'); bg.id='mpDlgBg'; bg.className='mpdlg-bg';
  const dg=!!o.danger;
  bg.innerHTML=`<div class="mpdlg" role="dialog" aria-modal="true">
    <div class="mpdlg-ic ${dg?'dg':''}">${dg
      ?'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4m0 4h.01"/><path d="M10.3 3.6 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z"/></svg>'
      :'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>'}</div>
    <div class="mpdlg-t">${esc(o.baslik||'Onay')}</div>
    <div class="mpdlg-m">${esc(o.msg||'')}</div>
    <div class="mpdlg-b">
      ${o.tek?'':`<button class="btn btn-ghost" id="mpDlgNo">${esc(o.noText||'Vazgeç')}</button>`}
      <button class="btn ${dg?'btn-danger':'btn-primary'}" id="mpDlgOk">${esc(o.okText||'Tamam')}</button>
    </div></div>`;
  document.body.appendChild(bg);
  requestAnimationFrame(()=>bg.classList.add('on'));
  const kapat=v=>{ bg.classList.remove('on'); document.removeEventListener('keydown',tus);
    setTimeout(()=>bg.remove(),140); res(v); };
  const tus=e=>{ if(e.key==='Escape')kapat(!o.tek?false:true); if(e.key==='Enter')kapat(true); };
  document.addEventListener('keydown',tus);
  bg.addEventListener('mousedown',e=>{ if(e.target===bg && !o.tek)kapat(false); });
  const no=bg.querySelector('#mpDlgNo'); if(no)no.onclick=()=>kapat(false);
  const okB=bg.querySelector('#mpDlgOk'); okB.onclick=()=>kapat(true); okB.focus();
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
  return mpDlg({msg,baslik:baslik||(dg?'Emin misiniz?':'Onay'),danger:dg,
    okText:opt.ok||(dg?'Evet, Sil':'Evet'),noText:opt.no||'Vazgeç'}); }

/* Form kaydetmelerini saran ortak yardimci: hata olursa artik sessizce
   yutulmuyor, kullaniciya gosteriliyor. */
async function guard(fn, hataBasligi){
  try{ return await fn(); }
  catch(e){
    const msg=(e&&(e.message||e.hint||e.details))||String(e);
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
        sb.from('bookings').select('unit_id,ym,status').gte('ym',roll[0]).lte('ym',roll[11]),
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
    case 'alt_all':{ const {data,error}=await sb.from('alt_mecralar').select('id,mecra_id,name,product_id').order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'alt_list':{ const {data,error}=await sb.from('alt_mecralar').select('*').eq('mecra_id',q.mecra_id).order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'alt_save': { const r=await saveRow('alt_mecralar',body); logYaz(act,body); return ok(r); }
    case 'unit_list':{ const {data,error}=await sb.from('units').select('*').eq('alt_mecra_id',q.alt_id).order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'bookings_all':{ const {data,error}=await sb.from('bookings')
        .select('id,unit_id,ym,status,customer_id,note,period_start,period_end,period_note,work_id');
      if(error)throw error; return ok(data); }

    case 'booking_list':{ const {data,error}=await sb.from('bookings').select('ym,status').eq('unit_id',q.unit_id); if(error)throw error; return ok(data); }
    case 'booking_toggle':{
      logYaz(act,body);
      if(body.status==='bos'){ const {error}=await sb.from('bookings').delete().eq('unit_id',body.unit_id).eq('ym',body.ym); if(error)throw error; }
      else { const row={unit_id:body.unit_id,ym:body.ym,status:body.status,customer_id:(body.customer_id!==undefined?body.customer_id:null)};
        if(body.note!==undefined) row.note=body.note;
        /* PS4 §5/§16: gerçek dönem OPSİYONELDİR. Alan gönderilmediyse hiç
           yazılmaz — yani ay-bazlı mevcut kayıt yolları (bookImport, hızlı
           hücre değişimi) aynen çalışmaya devam eder ve var olan dönem
           bilgisini EZMEZ. `onConflict:'unit_id,ym'` dokunulmadı. */
        if(body.period_start!==undefined) row.period_start=body.period_start||null;
        if(body.period_end!==undefined)   row.period_end=body.period_end||null;
        if(body.period_note!==undefined)  row.period_note=body.period_note||null;
        const {error}=await sb.from('bookings').upsert(row,{onConflict:'unit_id,ym'}); if(error)throw error; }
      return ok();
    }

    case 'customers_list':{ const {data,error}=await sb.from('customers').select('*').order('id',{ascending:false}); if(error)throw error; return ok(data); }
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
      return ok((ur.data||[]).map(u=>({id:u.id,name:u.name,olcu:u.olcu,konum:u.konum,
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
      const [j,wp,en,qs,bk]=await Promise.all([
        sb.from('jobs').select('*').eq('id',q.id).single(),
        sb.from('work_parties').select('*').eq('job_id',q.id),
        sb.from('entries').select('*').eq('job_id',q.id).order('occurred_at',{ascending:false}),
        /* Offer ve Booking kendi domainlerinde kalır; burada yalnız
           Work bağlamında özet olarak yüzeye çıkar (07 §11/§12). */
        sb.from('quotes').select('id,status,total,created_at,revision_no,revision_of_id,gecerlilik')
          .eq('work_id',q.id).order('revision_no',{ascending:false}),
        sb.from('bookings').select('id,unit_id,ym,status,source_quote_id')
          .eq('work_id',q.id).order('ym')]);
      if(j.error)throw j.error; if(wp.error)throw wp.error; if(en.error)throw en.error;
      if(qs.error)throw qs.error; if(bk.error)throw bk.error;
      return ok({job:j.data, parties:wp.data||[], entries:en.data||[],
                 quotes:qs.data||[], bookings:bk.data||[]}); }
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
      let sel=sb.from('entries').select('*');
      if(q.job_id)        sel=sel.eq('job_id',q.job_id);
      if(q.assignee_id)   sel=sel.eq('assignee_id',q.assignee_id);
      if(q.action_status) sel=sel.eq('action_status',q.action_status);
      /* `occurred_at` tek basina BENZERSIZ DEGIL (gercek veride esit
         damgali satirlar var). Sayfalama geldikten sonra esitlik bir
         sayfa sinirina denk gelirse ayni satir iki sayfada gorunup
         baska bir satir hic gorunmeyebilirdi (S4.1 §27). `id` kirici
         olarak eklendi — siralama artik toplam ve tekrarlanabilir. */
      const {data,error}=await sel.order('occurred_at',{ascending:false})
        .order('id',{ascending:false})
        .limit(q.limit?+q.limit:200);
      if(error)throw error; return ok(data); }
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
      const r=await saveRow('entries',row);
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
      let self=sb.from('work_followers').select('job_id,team_id');
      if(q.team_id) self=self.eq('team_id',q.team_id);
      const {data,error}=await self.limit(q.limit?+q.limit:5000);
      if(error)throw error; return ok(data); }
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
    case 'entry_relevance_all':{
      let sel=sb.from('entry_relevance').select('entry_id,team_id');
      if(q.team_id) sel=sel.eq('team_id',q.team_id);
      const {data,error}=await sel.limit(q.limit?+q.limit:5000);
      if(error)throw error; return ok(data); }
    case 'job_lifecycle':{
      const patch={lifecycle_status:body.lifecycle_status};
      patch.closed_reason=(body.lifecycle_status==='kapandi')?(body.closed_reason||'tamamlandi'):null;
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
      let sel=sb.from('work_operations').select('*');
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
      const row={...body};
      /* Tek primary kuralı DB'de partial unique index ile korunur; burada
         önce eskisini düşürüp yarış durumunu engelliyoruz. */
      if(row.is_primary && row.customer_id){
        const {error:e0}=await sb.from('contacts').update({is_primary:false})
          .eq('customer_id',row.customer_id).neq('id',row.id||0);
        if(e0)throw e0; }
      const r=await saveRow('contacts',row); logYaz(act,body); return ok(r); }
    case 'org_detail':{
      /* PS3 §16: kurumun hafızası tek turda gelir - kimlik, kişiler
         (BAĞLANTILAR üzerinden), açık işler, son güncellemeler, geçmiş.
         Kurum başına ek sorgu YOK; ekran başına sabit sayıda okuma. */
      const [c,af,jb,qt]=await Promise.all([
        sb.from('customers').select('*').eq('id',q.id).single(),
        sb.from('contact_affiliations')
          .select('id,contact_id,customer_id,title,department,is_primary,active')
          .eq('customer_id',q.id),
        sb.from('jobs').select('id,title,status,lifecycle_status,is_urgent,closed_reason,primary_contact_id,created_at')
          .eq('customer_id',q.id).order('id',{ascending:false}),
        sb.from('quotes').select('id,status,total,created_at,revision_no,work_id')
          .eq('customer_id',q.id).order('id',{ascending:false}).limit(20)]);
      if(c.error)throw c.error; if(af.error)throw af.error; if(jb.error)throw jb.error;
      const afl=af.data||[];
      const kids=[...new Set(afl.map(a=>a.contact_id))];
      const jids=(jb.data||[]).map(j=>j.id);
      /* Kişi kayıtları ve güncellemeler iki toplu okumayla alınır. */
      const [kt,en]=await Promise.all([
        kids.length?sb.from('contacts').select('*').in('id',kids):Promise.resolve({data:[]}),
        sb.from('entries').select('*')
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
      return ok({org:c.data, contacts, jobs:jb.data||[], entries:en.data||[], quotes:qt.data||[]}); }

    /* ---- Hafıza: Kişi (PS3 §17) ----
       `contacts` Person kimliğidir; bağlantılar ayrı tabloda. Kişinin
       telefonu/e-postası kendisine, unvanı bağlantıya aittir (§6). */
    case 'person_detail':{
      const [k,af]=await Promise.all([
        sb.from('contacts').select('*').eq('id',q.id).single(),
        sb.from('contact_affiliations').select('*').eq('contact_id',q.id)
          .order('is_primary',{ascending:false}).order('id')]);
      if(k.error)throw k.error; if(af.error)throw af.error;
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
        sb.from('customers').select('id,firma,telefon,eposta,adres,vergi_no,active,relationship_evidence,relationship_roles,entity_kind,puan,created_at'),
        sb.from('contacts').select('id,customer_id,name,is_primary,active')]);
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
        <div class="field"><label class="flabel">E-posta</label>
          <input class="inp" id="lu" type="email" placeholder="ornek@medyapark.com" autocomplete="username"></div>
        <div class="field"><label class="flabel">Şifre</label>
          <div class="lg-pw"><input class="inp" id="lp" type="password" placeholder="••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter')doLogin()">
          <button type="button" class="lg-eye" onclick="const p=document.getElementById('lp');p.type=p.type==='password'?'text':'password';this.classList.toggle('on')" title="Şifreyi göster/gizle"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        ${err?`<div class="lg-err">${esc(err)}</div>`:''}
        <button class="btn btn-primary lg-btn" id="lgBtn" onclick="doLogin()">Giriş Yap</button>
      </div>
    </div></div>`;
  const u=document.getElementById('lu'); if(u)u.focus();
}
async function doLogin(){
  const b=document.getElementById('lgBtn'); if(b){b.disabled=true;b.textContent='Giriş yapılıyor…';}
  const {error}=await sb.auth.signInWithPassword({email:gv('lu'),password:gv('lp')});
  if(error){ showLogin(error.message); return; }
  ui._email=gv('lu');
  /* Kimlik önce çözülür: activity_log artık aktif iç kullanıcı ister,
     bu yüzden log kaydı kimlik doğrulandıktan sonra yazılır. */
  if(!await loadIdentity()) return;
  sb.from('activity_log').insert({kullanici:(ui._me&&ui._me.name)||ui._email,islem:'giriş yaptı',bolum:'Oturum',detay:''}).then(()=>{},()=>{});
  try{ ui._settings=await api('settings_get'); }catch(e){ ui._settings={}; }
  showApp(); }
async function logout(){ await sb.auth.signOut(); ui._me=null; ui._role=null; showLogin(); }

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
            <button class="btn btn-primary btn-sm" onclick="qcAc({})" title="Bir güncelleme paylaş">${ic('plus',15)} Güncelleme</button>
            <button class="btn btn-outline btn-sm" onclick="jobForm()" title="Yeni iş aç">${ic('plus',15)} Yeni İş</button>
            <button class="btn btn-outline btn-sm" onclick="hafEkle()" title="Hafızaya kişi veya kurum ekle">${ic('plus',15)} Hafızaya Ekle</button>
            ${/* §14: AYNI operasyon formu, ikinci bir modal YOK. Global
                 baglamda Is secimi zorunludur cunku operasyon bir Work'un
                 child'idir; Work Detail'den acildiginda Is on-secilidir. */''}
            <button class="btn btn-outline btn-sm" onclick="opForm(0)" title="Baskı veya montaj kaydı ekle">${ic('plus',15)} Baskı/Montaj</button>
          </div>
          <a class="btn btn-outline btn-sm" href="index.html" target="_blank">${ic('ext',15)} Siteyi Aç</a>
          ${userChip()}
        </div>
      </header>
      <div class="content" id="content"></div>
    </div></div>`;
  navCiz(); go(surfaceGet()==='workspace'?'workspace-home':'dashboard');
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
  return TITLES[s]||'Panel';
}
const navAyni=(a,b)=>!!a&&!!b&&a.v===b.v&&String(a.id||'')===String(b.id||'')&&a.s===b.s;

/* Ekranda ne olduğunu history'ye bildirir. Aynı görünümse replace. */
function navKayit(v,s,id,ad){
  if(_navPop) return;                  /* Geri'den geliyoruz: girdi zaten var */
  const onceki=(history.state&&history.state.mp)?history.state:null;
  const lbl=navEtiket(v,s,id,ad);
  const bu={mp:1,v,s,id:id||0,lbl};
  try{
    if(navAyni(onceki,bu)){            /* aynı görünümün tazelenmesi: PUSH YOK */
      _navSon={...onceki,lbl};
      history.replaceState(_navSon,'',location.href); return; }
    /* Ayrıldığımız görünümün kaydırma konumunu kendi girdisine yaz —
       §2 "tercihen scroll position". */
    if(onceki) history.replaceState({...onceki,sy:window.scrollY},'',location.href);
    _navSon=onceki?{...bu,i:(onceki.i||0)+1,gl:onceki.lbl}:{...bu,i:0,gl:''};
    if(onceki) history.pushState(_navSon,'',location.href);
    else       history.replaceState(_navSon,'',location.href);
  }catch(e){}
}

/* Geri'den gelen bir durumu ekrana uygular. Push YAPMAZ. */
async function navUygula(st){
  if(!document.getElementById('content')) return;   /* login ekranındayız */
  /* Mecra düzenleyicisinin kaydedilmemiş-değişiklik koruması `go()` içinde
     yaşıyordu; tarayıcı Geri'si onu atlamasın. Kullanıcı vazgeçerse
     ayrıldığımız girdiyi geri iterek gezinmeyi İPTAL ederiz. */
  if(ui._dirty && typeof dirtyGuard==='function' && !(await dirtyGuard())){
    if(_navSon){ try{ history.pushState(_navSon,'',location.href); }catch(e){} }
    return; }
  _navSon=st;
  _navPop=true;
  try{
    if(st.s&&ui.section!==st.s){ ui.section=st.s; navCiz();
      const t=document.getElementById('ttl'); if(t) t.textContent=TITLES[st.s]||''; }
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
  const g=navGrupOf(s);                        /* kapali gruptaki bolume gidilirse grubu ac */
  if(g){ const set=navAcikGruplar(); if(!set.has(g)){ set.add(g); try{localStorage.setItem('mp_nav_acik',JSON.stringify([...set]));}catch(e){} } }
  navCiz();
  navKayit('sec',s,0);
  document.getElementById('ttl').textContent=TITLES[s]||''; renderSection(); yeniTeklifKontrol&&yeniTeklifKontrol(); }

async function renderSection(){
  const c=document.getElementById('content'); c.innerHTML='<p class="muted">Yükleniyor…</p>';
  const F={dashboard,'is-takibi':isTakibi,urunler,mecralar,listeler,musteriler,kurumlar,teklifler,ekip,
           sayfalar,notlar,anasayfa:anasayfaBolum,tedarikciler,raporlar,harita,ayarlar,talepler,
           ikonlar,aboneler,operasyon,muhasebe,'workspace-home':workspaceHome,'ws-mecralar':wsMecralarHub};
  try{
    const fn=F[ui.section]; if(!fn)return;
    await fn(c);
    collapsify(c,ui.section);
  }catch(e){ c.innerHTML='<div class="banner">Hata: '+esc(e.message||e)+'</div>'; }
}

/* modal — 07 §19: role=dialog, Escape ile kapanır, odak yönetimi */
let _modalOnceki=null;
function modal(html){
  const m=document.getElementById('modal'), bg=document.getElementById('modalBg');
  m.innerHTML=html;
  m.setAttribute('role','dialog'); m.setAttribute('aria-modal','true'); m.setAttribute('tabindex','-1');
  const b=m.querySelector('h3');
  if(b){ if(!b.id) b.id='mdlTitle'; m.setAttribute('aria-labelledby',b.id); }
  else m.removeAttribute('aria-labelledby');
  _modalOnceki=document.activeElement;
  bg.classList.add('open');
  /* İlk anlamlı alana odaklan; yoksa diyaloğun kendisine. */
  const ilk=m.querySelector('input:not([type=hidden]):not([disabled]),textarea,select,button');
  setTimeout(()=>{ (ilk||m).focus(); },30);
}
function closeModal(){
  document.getElementById('modalBg').classList.remove('open');
  if(_modalOnceki&&document.body.contains(_modalOnceki)){ try{ _modalOnceki.focus(); }catch(e){} }
  _modalOnceki=null;
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
  if(bg&&bg.classList.contains('open')) closeModal();
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
const JOB_STEPS=[['temas_takip','Temas / Takip'],['teklif','Teklif'],['baski','Baskı'],['montaj','Montaj'],['yayinda_aktif','Yayında']];
/* ================= BİLDİRİMLER: rezervasyon bitişi (7 gün) ================= */
const AY_KISA=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
function bildirimAlicilar(){
  /* Alıcılar canonical role'den belirlenir; `unvan`/`role` yalnız
     tamamlayıcı bir ipucudur (S02_001 ile aynı ruhta: serbest metin
     yetki kaynağı değildir). */
  return [...new Set((ui._team||[]).filter(x=>x.eposta&&x.active!==false&&(x.app_role==='admin'||/sat[ıi]ş|pazarlama/i.test(x.unvan||x.role||'')))
    .map(x=>String(x.eposta).trim()))];
}
async function bildirimKontrol(){
  try{
    const bugun=new Date(); bugun.setHours(0,0,0,0);
    const yakin=new Date(bugun.getTime()+7*864e5);
    const ayKey=d=>d.getFullYear()+'-'+pad(d.getMonth()+1);
    const aylar=[...new Set([ayKey(bugun),ayKey(yakin)])];
    const br=await sb.from('bookings').select('unit_id,ym,status,customer_id').in('ym',aylar);
    if(br.error||!br.data||!br.data.length) return;
    /* ay sonu önümüzdeki 7 gün içinde olanlar */
    const adaylar=br.data.filter(b=>{ const [y,m]=b.ym.split('-').map(Number); const son=new Date(y,m,0); return son>=bugun&&son<=yakin; });
    if(!adaylar.length) return;
    /* sonraki ay aynı müşteriyle devam ediyorsa "bitiş" değil */
    const sonraki=b=>{ const [y,m]=b.ym.split('-').map(Number); return ayKey(new Date(y,m,1)); };
    const nr=await sb.from('bookings').select('unit_id,ym,customer_id').in('ym',[...new Set(adaylar.map(sonraki))]);
    const devam=new Set((nr.data||[]).map(n=>n.unit_id+':'+n.ym+':'+n.customer_id));
    const bitenler=adaylar.filter(b=>!devam.has(b.unit_id+':'+sonraki(b)+':'+b.customer_id));
    if(!bitenler.length) return;
    const [ur,mr,cr]=await Promise.all([
      sb.from('units').select('id,name,mecra_id').in('id',[...new Set(bitenler.map(b=>b.unit_id))]),
      sb.from('mecralar').select('id,name'),
      sb.from('customers').select('id,firma').in('id',[...new Set(bitenler.map(b=>b.customer_id).filter(x=>x!=null))])]);
    const um=Object.fromEntries((ur.data||[]).map(u=>[u.id,u])), mm=Object.fromEntries((mr.data||[]).map(m=>[m.id,m.name]));
    const cm=Object.fromEntries((cr.data||[]).map(c=>[c.id,c.firma||'']));   /* ilgili_kisi bir kişi değildir (S02_001) */
    const rows=bitenler.map(b=>{ const u=um[b.unit_id]||{}; const [y,m]=b.ym.split('-').map(Number);
      return {tur:'rezervasyon_bitis',anahtar:'rezbitis:'+b.unit_id+':'+b.ym,
        baslik:`${mm[u.mecra_id]||''} · ${u.name||'#'+b.unit_id} — ${AY_KISA[m-1]} ${y} sonunda bitiyor`,
        detay:`${cm[b.customer_id]||'Müşteri atanmamış'} · ${b.status==='dolu'?'Dolu':'Rezerve'}`}; });
    await sb.from('bildirimler').upsert(rows,{onConflict:'anahtar',ignoreDuplicates:true});
    /* e-posta: gönderilmemişleri tek özet mesajla alıcılara yolla */
    const gr=await sb.from('bildirimler').select('id,baslik,detay').eq('tur','rezervasyon_bitis').eq('eposta_gonderildi',false);
    const bekleyen=gr.data||[]; const alici=bildirimAlicilar();
    if(bekleyen.length && alici.length){
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
    }
  }catch(e){ console.warn('bildirimKontrol',e); }
}
async function bildirimCiz(){
  const box=document.getElementById('bildirimBox'), say=document.getElementById('bldSay'); if(!box)return;
  const r=await sb.from('bildirimler').select('*').eq('okundu',false).order('created_at',{ascending:false}).limit(20);
  const list=r.data||[];
  if(say) say.textContent=list.length?list.length+' yeni':'';
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button>
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
        <button class="btn btn-yes btn-sm" onclick="go('is-takibi').then(()=>setTimeout(()=>jobForm(),200))">+ Yeni İş</button>
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
/* Bildirimler — kabuk; içeriği bildirimCiz() doldurur.
   ÜRETİM (bildirimKontrol: upsert + e-posta) Yönetim tarafında kalır;
   Team yüzeyi yalnız okur, yoksa her Ana Sayfa açılışı mükerrer
   bildirim/e-posta üretirdi. */
function dashBildirimCard(){
  return `<section class="card"><div class="card-h"><h3>Bildirimler</h3><span class="chip" id="bldSay">…</span></div>
    <div class="card-b" id="bildirimBox"><p class="muted" style="font-size:12.5px;margin:0">Rezervasyonlar kontrol ediliyor…</p></div></section>`;
}
/* Takvim — mevcut calWidget() */
function dashTakvimCard(){
  return `<section class="card"><div class="card-b" id="calBox">${calWidget(ui._dashEvents)}</div></section>`;
}

/* ---------- DASHBOARD ---------- */
async function dashboard(c){
  const s=await api('dashboard_stats');
  ui._dashEvents=s.takvim||[];
  /* Bildirim ÜRETİMİ (upsert + e-posta) Yönetim tarafındadır; Team Ana
     Sayfa yalnız okur (bkz. dashBildirimCard / workspaceHome). */
  setTimeout(()=>bildirimKontrol().then(bildirimCiz),50);

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
}

/* ---------- İŞ TAKİBİ — canonical Work board (Sprint 03) ----------
   Phase rigid state machine DEĞİLDİR (BR-W02): atlanabilir, geri
   alınabilir, bazı Work'lerde hiç kullanılmaz. Lifecycle phase'den
   bağımsızdır (D-207). */
const JOBST=[['temas_takip','Temas / Takip'],['teklif','Teklif'],['baski','Baskı'],
             ['montaj','Montaj'],['yayinda_aktif','Yayında / Aktif']];
const JOBC={temas_takip:'violet',teklif:'amber',baski:'cyan',montaj:'green',yayinda_aktif:'slate'};
const LIFE=[['acik','Açık'],['bekliyor','Bekliyor'],['kapandi','Kapandı']];
const LIFELBL={acik:'Açık',bekliyor:'Bekliyor',kapandi:'Kapandı'};
const CLOSELBL={tamamlandi:'Tamamlandı',kaybedildi:'Kaybedildi / Reddedildi',iptal:'İptal'};
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
const ISF_DEF={life:['acik','bekliyor'],q:'',org:'',phase:'',ilgili:'',acil:false,gec:false};
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
  if(f.acil) list=list.filter(j=>!!j.is_urgent);
  if(f.gec){ const bg=_cIso(new Date());
    list=list.filter(j=>{ const nx=D.sonraki[j.id];
      return !!(nx&&nx.due_at&&String(nx.due_at).slice(0,10)<bg); }); }
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
        <select class="inp" id="isOrg" onchange="isFiltreDegis()"><option value="">Tümü</option>
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
        onclick="isFiltre2({acil:${!f.acil}})">⚡ Acil</button>
      <button type="button" class="pf-t ${f.gec?'on':''}" aria-pressed="${f.gec}"
        title="Termini geçmiş açık aksiyonu olan işler"
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
  if(f.acil)   p.push('Acil');
  if(f.gec)    p.push('Geciken');
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
  renderSection();
}
function isFiltreSifirla(){ isFiltreYaz({...ISF_DEF}); renderSection(); }

/* ---- HUB: tek rota, dört görünüm ---- */
async function isTakibi(c){
  const tab=isTab();
  const D=await coordVeri();
  ui._coord=D; ui._acikAks=D.acikAks;          /* mevcut okuyucular korunur */
  const f=isFiltre();
  const ust={pano:['Pano','aşamalar arasında oklarla taşıyın'],
             liste:['Liste','işler tek tabloda — sıralanabilir, filtrelenebilir'],
             takvim:['Takvim','son tarihler ve baskı/montaj planları']}[tab];
  c.innerHTML=`<div class="sec-head">
      <div><h3>İşler <span class="muted" style="font-weight:500">· ${esc(ust[0])}</span></h3>
        <p class="sub" id="coordSub">${esc(ust[1])}</p></div>
      <div style="display:flex;gap:8px">
        ${tab==='liste'?`<button class="btn btn-outline btn-sm" onclick="isListeExport()">${ic('download',15)} Excel'e Aktar</button>`:''}
        <button class="btn btn-primary btn-sm" onclick="jobForm()">${ic('plus',15)} Yeni İş</button></div></div>
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
        ${idx>0?`<button title="Geri al: ${esc(JOBST[idx-1][1])}" onclick="jobMove(${j.id},'${JOBST[idx-1][0]}')">${ic('left',15)}</button>`:'<span></span>'}
        ${idx<JOBST.length-1?`<button title="İlerlet: ${esc(JOBST[idx+1][1])}" onclick="jobMove(${j.id},'${JOBST[idx+1][0]}')">${ic('right',15)}</button>`:'<span></span>'}
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
  if(sub) sub.textContent=`${list.length} iş gösteriliyor · aşamalar arasında oklarla taşıyın`;
  box.innerHTML=`<div class="kanban">${cols}</div>`;
}

/* ============ LİSTE — operasyonel tablo (audit §6 İş Takip) ============
   Aynı `jobs` satırları; ikinci bir Work modeli değil. Sıralama tıklanan
   başlıkla değişir, oturumda korunur. */
function isListeSira(){ try{ return JSON.parse(sessionStorage.getItem('mp_is_sira')||'null')||{k:'akt',d:-1}; }catch(e){ return {k:'akt',d:-1}; } }
function isListeSiraSet(k){
  const s=isListeSira();
  isListeYaz(s.k===k?{k,d:-s.d}:{k,d:k==='title'||k==='org'?1:-1});
  renderSection();
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
  const th=(k,l,w)=>`<th class="srt${s.k===k?' on':''}" ${w?`style="width:${w}"`:''}
    onclick="isListeSiraSet('${k}')" title="Sırala">${esc(l)}<i>${s.k===k?(s.d>0?'▲':'▼'):''}</i></th>`;
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
const TKV_KAYNAK=[['takip','Takip'],['op','Baskı & Montaj']];

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
  const AY=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const ilk=new Date(y,m,1).getDay(), kaydir=(ilk+6)%7, gunSay=new Date(y,m+1,0).getDate();
  const bugun=_cIso(new Date());
  const secili=st.gun|| (gunMap[bugun]?bugun:null);

  let hc='';
  for(let i=0;i<kaydir;i++) hc+='<span class="tk-bos"></span>';
  for(let d=1;d<=gunSay;d++){
    const iso=y+'-'+pad(m+1)+'-'+pad(d);
    const list=gunMap[iso]||[];
    /* PS1.1 §21: eskiden burada yalnizca minik yesil/kirmizi sayi kareleri
       vardi - neyin oldugunu anlamak icin gune tiklamak gerekiyordu.
       Artik okunabilir kompakt olay satirlari var: tur, kisa metin ve
       gecikme/acil durumu. Hucre icinde dev kart YOK; yogun gunlerde
       ilk ikisi gosterilip gerisi "+N" ile ozetlenir. */
    const gec=list.some(x=>x.gec);
    const goster=list.slice(0,2), kalan=list.length-goster.length;
    hc+=`<button type="button" class="tk-d${iso===bugun?' tk-today':''}${iso===secili?' tk-sel':''}${list.length?' tk-has':''}"
      onclick="tkvGun('${iso}')" aria-pressed="${iso===secili}"
      title="${esc(list.map(x=>x.baslik).join(' · '))}">
      <span class="tk-n">${d}${list.length>1?`<em class="tk-c">${list.length}</em>`:''}</span>
      ${list.length?`<span class="tk-evs">
        ${goster.map(x=>`<span class="tk-ev ${x.tip==='op'?'op':'takip'}${x.gec?' gec':''}${x.acil?' acil':''}">
            <i></i><b>${esc(String(x.baslik||'').slice(0,26))}</b></span>`).join('')}
        ${kalan>0?`<span class="tk-ev more">+${kalan}</span>`:''}</span>`:''}
    </button>`;
  }

  /* Seçili günün ajandası — "Bugün ne yapmamız gerekiyor?" */
  const gunList=(secili?(gunMap[secili]||[]):[])
    .slice().sort((a,b)=>(a.tip===b.tip?0:(a.tip==='takip'?-1:1)));
  const ajanda=gunList.length?gunList.map(e=>e.tip==='takip'
    ? `<button type="button" class="tk-i" onclick="${e.jobId?`workAc(${e.jobId})`:(e.custId?`orgAc(${e.custId})`:'')}">
         <span class="tk-i-k tk-takip">Takip</span>
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
    : `<p class="empty">${secili?'Bu gün için planlanmış takip veya baskı/montaj yok.':'Bir gün seçin.'}</p>`;

  const sub=document.getElementById('coordSub');
  if(sub) sub.textContent=`${ev.length} kayıt · ${AY[m]} ${y} · takip terminleri ve baskı/montaj planları`;

  box.innerHTML=`
    <div class="sec-card tk-wrap">
      <div class="tk-h">
        <div class="tk-nav">
          <button class="btn btn-outline btn-sm" onclick="tkvAy(-1)" title="Önceki ay">‹</button>
          <b>${AY[m]} ${y}</b>
          <button class="btn btn-outline btn-sm" onclick="tkvAy(1)" title="Sonraki ay">›</button>
          <button class="btn btn-ghost btn-sm" onclick="tkvBugun()">Bugün</button>
        </div>
        <div class="tk-f">
          <div class="ws-switch inline tk-src" role="group" aria-label="Kaynak filtresi">
            <button type="button" class="${!st.kaynak?'on':''}" onclick="tkvKaynak('')">Tümü</button>
            ${TKV_KAYNAK.map(([k,l])=>`<button type="button" class="${st.kaynak===k?'on':''}" onclick="tkvKaynak('${k}')">${esc(l)}</button>`).join('')}
          </div>
          <select class="inp tk-who ${f.ilgili?'inp-on':''}" id="isIlgili" aria-label="Kimin takvimi" onchange="isFiltreDegis()">
            <option value="" ${!f.ilgili?'selected':''}>Tüm ekip</option>
            <option value="me" ${f.ilgili==='me'?'selected':''}>Benim</option>
            ${(D.team||[]).filter(t=>t.active!==false).map(t=>`<option value="${t.id}" ${String(f.ilgili)===String(t.id)?'selected':''}>${esc(t.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="tk-grid tk-head"><span>Pzt</span><span>Sal</span><span>Çar</span><span>Per</span><span>Cum</span><span>Cmt</span><span>Paz</span></div>
      <div class="tk-grid">${hc}</div>
      <div class="tk-lgnd">
        <span><i class="tk-p tk-takip"></i> Takip (aksiyon termini)</span>
        <span><i class="tk-p tk-op"></i> Baskı & Montaj (planlanan)</span>
      </div>
    </div>
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
function qcAc(a,b){
  const ctx=(a&&typeof a==='object')?a:(b||{});
  const D=ui._coord||null;
  const jobs=(D?D.jobs:(ui._jobs||[]))||[];
  const custs=(D?D.custs:(ui._cust||[]))||[];
  const team=(D?D.team:(ui._team||[]))||[];
  const kilitliJob=ctx.jobId||0;
  const kilitliOrg=ctx.custId||0;
  /* PS3 §18: Kişi artık geçerli bir Entry bağlamı. `entries.contact_id`
     Sprint 1'den beri vardı ama Person kimliği oturmadan açılmamıştı.
     ZORUNLU DEĞİL - bir güncelleme hâlâ bağlamsız olabilir. */
  const kilitliKisi=ctx.contactId||0;
  const j=kilitliJob?jobs.find(x=>x.id===kilitliJob):null;
  const orgId=kilitliOrg||(j?j.customer_id:0);
  const cm={}; custs.forEach(x=>cm[x.id]=x.firma);
  const kisiAd=kilitliKisi?((ui._contactMap&&ui._contactMap[kilitliKisi]||{}).name
      ||((ui._person&&ui._person.id===kilitliKisi)?ui._person.name:'')||'Kişi'):'';
  const benim=(ui._me&&ui._me.id)||0;

  const jobSec=(kilitliOrg&&!kilitliJob)
    ? jobs.filter(x=>String(x.customer_id)===String(kilitliOrg)&&(x.lifecycle_status||'acik')!=='kapandi')
    : jobs.filter(x=>(x.lifecycle_status||'acik')!=='kapandi');

  /* Kilitli baglam bilgi satiridir, secim istemez. */
  const baglam = kilitliJob
    ? `<div class="qc-ctx"><span class="qc-lbl">İş</span>
         <b>${esc(j?j.title:'#'+kilitliJob)}</b>
         ${orgId?`<em>${esc(cm[orgId]||'')}</em>`:''}
         <input type="hidden" id="qcJob" value="${kilitliJob}">
         <input type="hidden" id="qcOrg" value="${orgId||''}"></div>`
    : kilitliOrg
    ? `<div class="qc-ctx"><span class="qc-lbl">Kurum</span><b>${esc(cm[kilitliOrg]||'')}</b>
         ${kilitliKisi?`<em>${esc(kisiAd)}</em>`:''}
         <input type="hidden" id="qcOrg" value="${kilitliOrg}"></div>`
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
         <select class="inp inp-sm" id="qcOrg"><option value="">—</option>
           ${custs.slice().sort((a2,b2)=>String(a2.firma||'').localeCompare(String(b2.firma||''),'tr'))
             .map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('')}</select>
       </div>`);

  /* Kendini etiketlemek anlamsiz: kendi guncellemeni zaten biliyorsun. */
  const ekip=team.filter(t=>t.active!==false&&t.id!==benim);

  modal(`<h3 style="margin:0 0 12px">Bir güncelleme paylaş…</h3>
    ${kilitliKisi?`<input type="hidden" id="qcKisi" value="${kilitliKisi}">`:''}
    ${baglam}
    <div class="field" style="margin-bottom:10px">
      <textarea class="inp" id="qcBody" rows="3"
        placeholder="Ne oldu? ör. Müşteri M1'i onayladı, stadyumu almadı."
        onkeydown="qcTus(event)"></textarea></div>

    ${ekip.length?`<div class="qc-tags">
      <span class="qc-mini">İlgili</span>
      ${ekip.map(t=>`<label class="qc-who"><input type="checkbox" class="qcRel" value="${t.id}">
        <span>${esc(t.name)}</span></label>`).join('')}
    </div>`:''}

    ${secici}

    <div class="qc-line qc-opt">
      <label class="qc-mini" for="qcDue">Son tarih</label>
      <input class="inp inp-sm" type="date" id="qcDue" style="max-width:170px">
      <label class="qc-acil"><input type="checkbox" id="qcAcil"><span>⚡ Acil</span></label>
      <span class="fhint" style="margin:0 0 0 auto">Ctrl+Enter ile paylaş</span>
    </div>

    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="qcKaydet()">Paylaş</button></div>`);
  const t=document.getElementById('qcBody'); if(t)t.focus();
}
function qcTus(e){ if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){ e.preventDefault(); qcKaydet(); } }
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
  if(!body){ mpAlert('Metin zorunlu.'); return; }
  const jid=+gv('qcJob')||null;
  const oel=document.getElementById('qcOrg');
  const oid=(oel? (+oel.value||null) : null);
  const due=gv('qcDue')||'';
  const acil=!!(document.getElementById('qcAcil')||{}).checked;
  /* Work'e bagliysa kurum Work uzerinden okunur (06 §9). */
  const kisi=+gv('qcKisi')||null;
  const row={id:0, body, job_id:jid, customer_id: jid?null:oid, contact_id:kisi, is_urgent:acil};
  /* SON TARIH: yalnizca acikca secildiyse yazilir. Secilmediyse due_at
     NULL kalir - bugune ayarlanmaz (PS1.1 §2.A). action_status yalnizca
     gercek bir son tarih varsa anlamli olur; sorumlu ATANMAZ. */
  if(due){
    row.due_at=new Date(due+'T09:00:00').toISOString();
    row.action_status='open';
  }
  row._ilgili=Array.from(document.querySelectorAll('.qcRel:checked')).map(x=>+x.value);
  modalBusy(true);
  const r=await guard(()=>api('entry_save',row),'Kayıt oluşturulamadı');
  modalBusy(false);
  if(r===null)return;
  closeModal();
  toast(due?'Güncelleme paylaşıldı — son tarih eklendi.':'Güncelleme paylaşıldı.');
  /* Ayni Entry; nereden bakildigina gore farkli gorunum (BR-V01). */
  if(ui.section==='is-takibi'||ui.section==='workspace-home'||ui.section==='kurumlar') renderSection();
  else if(jid) workAc(jid);
  else renderSection();
}

/* ============ MUHASEBEYE GİDECEKLER (C4 §18-20) ======================
   Work üzerindeki mevcut accounting_* alanları üzerinde paylaşılan bir
   KUYRUK görünümü. Muhasebe tablosu, defter, fatura ekranı YOKTUR
   (01 §14, 06 §26). Medyapark bir cari/muhasebe sistemi değildir;
   burada yalnız "hangi iş muhasebeye gitmeye hazır" sorusu cevaplanır. */
/* Kanonik `jobs.accounting_status` sozlugu AYNEN korunur - CHECK
   kisiti tam olarak bunlari kabul eder (yok|hazir|gonderildi|islendi).
   Paralel bir durum kumesi UYDURULMAZ (§7). `Henuz yok` yalniz daha
   iyi okunan bir ETIKETTIR; depolanan deger hala 'yok'. */
const ACCST=[['hazir','Hazır'],['gonderildi','Gönderildi'],['islendi','İşlendi'],['yok','Henüz yok']];
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
function accAra(){ accYaz({...accFiltre(),q:gv('accQ')||''}); renderSection(); }

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
  /* Tumu gorunumunde duz tarih siralamasi 'Henuz yok' yigininin altina
     dikkat gerektirenleri gomerdi. Devir sirasi: Hazır -> Gönderildi ->
     Henüz yok -> İşlendi (biten en sonda), icinde tarihe gore. */
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
  const eski=j.accounting_status||'yok';
  /* Zaman damgaları tutarlı yazılır; kullanıcıdan tekrar istenmez (BR-E03).
     Yazar TEK: `accZaman` - modal yolu da aynısını kullanır. */
  const body={id, accounting_status:yeni, ...accZaman(j,yeni,'')};
  const r=await guard(()=>api('job_save',body),'Muhasebe durumu güncellenemedi');
  if(r===null)return;
  if(eski!==yeni) await sysEntry(id,`Muhasebe durumu: ${accLbl(eski)} → ${accLbl(yeni)}`);
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

async function jobMove(id,status){
  const j=(ui._jobs||[]).find(x=>x.id===id)||{};
  const eski=j.status;
  await api('job_move',{id,status});
  if(eski&&eski!==status) await sysEntry(id,`Aşama değişti: ${JOBLBL[eski]||eski} → ${JOBLBL[status]||status}`);
  renderSection();
}
async function jobDelete(id){ if(await mpConfirm('Bu iş kaydı silinsin mi? Bağlı güncellemeler de silinir.','İşi Sil')){ await api('job_delete&id='+id); renderSection(); } }

/* ---------- WORK DETAIL (07 §7) ---------- */
async function workAc(id){
  const veri=await guard(()=>Promise.all([api('work_detail&id='+id),api('team_list'),
    api('customers_list'),api('contacts_list'),
    api('work_followers_all&limit=5000').catch(()=>[])]),'İş açılamadı');
  if(!veri)return;
  const [d,tm,cu,ct,fol]=veri; ui._team=tm||[]; ui._cust=cu||[]; ui._contacts=ct||[];
  const benim=(ui._me&&ui._me.id)||0;
  const folBu=(fol||[]).filter(r=>String(r.job_id)===String(id));
  const takipEdiyorum=folBu.some(r=>r.team_id===benim);
  const folAdlari=folBu.map(r=>((tm||[]).find(t=>t.id===r.team_id)||{}).name).filter(Boolean);
  ui._work=d.job; ui._workParties=d.parties; ui._workEntries=d.entries;
  ui._workQuotes=d.quotes||[]; ui._workBookings=d.bookings||[];
  const j=d.job, org=(cu||[]).find(x=>x.id===j.customer_id);
  navKayit('work',ui.section,j.id,orgKisa(j.title,34));
  const ls=j.lifecycle_status||'acik';
  const c=document.getElementById('content');
  c.innerHTML=`<div class="sec-head">
      <div><h3>${geriBtn('is-takibi')} ${esc(j.title)}</h3>
        <p class="sub">${j.is_urgent?'<span class="pu-b acil">⚡ Acil</span> ':''}${org?esc(org.firma):'<span class="muted">kurum bağlı değil</span>'} · ${esc(JOBLBL[j.status]||j.status)} · ${esc(LIFELBL[ls])}${j.closed_reason?' · '+esc(CLOSELBL[j.closed_reason]||j.closed_reason):''}${folAdlari.length?' · ilgili: '+esc(folAdlari.join(', ')):''}</p></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="qcAc({jobId:${j.id}})">${ic('plus',15)} Güncelleme</button>
        <button class="btn ${takipEdiyorum?'btn-ghost':'btn-outline'} btn-sm" id="wFol"
          onclick="workTakip(${j.id},${takipEdiyorum?'false':'true'})"
          title="${takipEdiyorum?'Bu iş Panelim → Takip Ettiğim İşler listenden çıkar':'Bu iş Panelim → Takip Ettiğim İşler listene eklenir'}">
          ${takipEdiyorum?'★ Takibi Bırak':'☆ Takibe Al'}</button>
        <button class="btn btn-outline btn-sm" onclick="jobForm(null,${j.id})">Düzenle</button>
      </div></div>

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Durum</h4></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="wLife">Yaşam döngüsü</label>
          <select class="inp" id="wLife" onchange="workLifeDegis(${j.id})">
            ${LIFE.map(l=>`<option value="${l[0]}" ${ls===l[0]?'selected':''}>${l[1]}</option>`).join('')}
          </select></div>
        <div class="field"><label class="flabel" for="wClose">Kapanış nedeni</label>
          <select class="inp" id="wClose" ${ls!=='kapandi'?'disabled':''} onchange="workLifeDegis(${j.id})">
            ${Object.keys(CLOSELBL).map(k=>`<option value="${k}" ${j.closed_reason===k?'selected':''}>${CLOSELBL[k]}</option>`).join('')}
          </select></div>
      </div>
      <div class="meta" style="line-height:1.9">
        İlgili kişi: ${(()=>{ const k=(ct||[]).find(x=>x.id===j.primary_contact_id);
          return k?`<b>${esc(k.name)}</b>${k.title?' · '+esc(k.title):''}`
                   +`${k.phone?' · '+esc(k.phone):''}${k.email?` · <a href="mailto:${esc(k.email)}">${esc(k.email)}</a>`:''}`
                 :'<span class="muted">seçilmedi</span>'; })()}
        <button class="btn btn-ghost btn-sm" onclick="jobForm(null,${j.id})">Değiştir</button><br>
        İlgili ekip: ${folAdlari.length?folAdlari.map(x=>`<span class="pu-chip who">@${esc(x)}</span>`).join(' ')
          :'<span class="muted">henüz kimse takip etmiyor</span>'}<br>
        ${/* S2 §3: `jobs.assignee_id` şemada kalır ve doluysa İKİNCİL bağlam
             olarak görünür. Artık "Sorumlu" DEĞİL: genel koordinasyon kavramı
             İlgili'dir, bu yalnızca opsiyonel iş sahipliğidir. Boşsa hiç
             gösterilmez — doldurulması gereken bir alan gibi durmasın. */''}
        ${j.assignee_id?`İş sahibi: ${esc((tm||[]).find(t=>t.id===j.assignee_id)?.name||'—')}<br>`:''}
        Sözleşme: ${j.contract_status==='signed'?'<span class="pill">İmzalı</span>':j.contract_status==='pending'?'<span class="pill">Bekleniyor</span>':'<span class="pill">Eksik</span>'}
        ${j.contract_signed_at?' · '+esc(trTarih(j.contract_signed_at)):''}
        ${j.contract_url?` · <a href="${esc(j.contract_url)}" target="_blank" rel="noopener">Belge</a>`:''}<br>
        Muhasebe: <span class="pill">${esc({yok:'Yok',hazir:'Hazır',gonderildi:'Gönderildi',islendi:'İşlendi'}[j.accounting_status]||j.accounting_status)}</span>
        ${j.accounting_amount?' · '+esc(j.accounting_amount)+' ₺':''}
        <button class="btn btn-ghost btn-sm" onclick="workMetaForm(${j.id})">Sözleşme / Muhasebe</button>
      </div>
    </div>

    ${/* S2 §27: boş bölüm sessiz kalır. Hiç taraf yoksa koca bir boş kart
         yerine tek satırlık bir ekleme bağlantısı gösterilir. */''}
    ${d.parties.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Taraflar <span class="chip">${d.parties.length}</span></h4>
        <button class="btn btn-outline btn-sm" onclick="partyForm(${j.id})">${ic('plus',15)} Taraf Ekle</button></div>
      <div id="wParties"></div></div>`
    :`<p class="w-quiet"><span class="muted">Ek taraf (ajans, fatura, tedarikçi) tanımlı değil.</span>
       <button class="btn-link" onclick="partyForm(${j.id})">Taraf ekle</button></p>
      <div id="wParties" hidden></div>`}

    ${d.quotes.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Teklifler <span class="chip">${d.quotes.length}</span></h4></div>
      ${d.quotes.map(o=>`<div class="list-item">
        <div class="nm">Teklif #${o.id}${o.revision_no>1?` <span class="pill">rev ${o.revision_no}</span>`:''}</div>
        <div class="meta"><span class="badge-st st-${esc(o.status||'yeni')}">${esc(({yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'})[o.status]||o.status)}</span> · ${esc(money(o.total))}${o.gecerlilik?' · geçerlilik '+esc(trTarih(o.gecerlilik)):''}</div>
        <button class="btn btn-outline btn-sm" onclick="quoteView(${o.id})">Aç</button>
        ${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="quoteRevise(${o.id})">Revize</button>`:''}</div>`).join('')}
    </div>`:''}

    ${d.bookings.length?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Mecra / Doluluk <span class="chip">${d.bookings.length}</span></h4></div>
      <div class="meta" style="margin-bottom:8px">Rezervasyon medya domaininde yönetilir; burada yalnız bu işe bağlı aylar görünür (BR-M02).</div>
      ${d.bookings.map(b=>`<div class="list-item">
        <div class="nm">${esc((window.__lumap&&window.__lumap[b.unit_id]&&window.__lumap[b.unit_id].name)||('Pozisyon #'+b.unit_id))}</div>
        <div class="meta">${esc(b.ym)} · <span class="pill">${esc(b.status)}</span>${b.source_quote_id?' · Teklif #'+b.source_quote_id:''}</div></div>`).join('')}
      <button class="btn btn-ghost btn-sm" onclick="go('listeler')">Doluluk ekranında aç</button>
    </div>`:''}

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Baskı &amp; Montaj <span class="chip" id="wOpSayi">0</span></h4>
        <button class="btn btn-outline btn-sm" onclick="opForm(0,${j.id})">${ic('plus',15)} Kayıt Ekle</button></div>
      <div id="wOps"></div></div>

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px"><h4 style="font-size:14px;margin:0">Zaman Çizelgesi <span class="chip">${d.entries.length}</span></h4></div>
      <div id="wTimeline"></div></div>`;
  workPartyCiz(); workTimelineCiz(); workOpsCiz(j.id);
}
async function workOpsCiz(jobId){
  const box=document.getElementById('wOps'); if(!box)return;
  const [ops,custs,units]=await Promise.all([
    api('operations_list&job_id='+jobId), api('customers_list'), api('units_full').catch(()=>[])]);
  ui._workOps=ops||[];
  ui._opCust=ui._opCust||{}; (custs||[]).forEach(x=>ui._opCust[x.id]=x.firma);
  ui._opUnits=ui._opUnits||{}; (units||[]).forEach(u=>ui._opUnits[u.id]=u);
  const say=document.getElementById('wOpSayi'); if(say) say.textContent=String((ops||[]).length);
  box.innerHTML=(ops||[]).map(o=>`<div class="list-item" style="cursor:pointer" onclick="opForm(${o.id},${jobId})">
      <div class="nm"><span class="pill">${esc(opTypeLbl(o.operation_type))}</span> ${esc(o.description||'')}</div>
      <div class="meta">${o.planned_date?esc(trTarih(o.planned_date)):'tarihsiz'}
        ${o.quantity!=null?' · '+esc(o.quantity)+' adet':''}${o.dimensions?' · '+esc(o.dimensions):''}
        ${o.unit_id&&ui._opUnits[o.unit_id]?' · '+esc(ui._opUnits[o.unit_id].name):(o.location_text?' · '+esc(o.location_text):'')}
        ${o.supplier_org_id&&ui._opCust[o.supplier_org_id]?' · '+esc(ui._opCust[o.supplier_org_id]):''}
        · <span class="badge-st st-${esc(o.status)}">${esc(opStatLbl(o.status))}</span></div>
    </div>`).join('')
    ||'<p class="empty">Bu işe bağlı baskı/montaj kaydı yok.</p>';
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
  box.innerHTML=(ui._workEntries||[]).map(e=>{
    const sys=e.source==='system';
    const aks=e.action_status;
    return `<div class="list-item" style="${sys?'opacity:.72':''}">
      <div class="nm">${esc(e.body)}</div>
      <div class="meta">
        ${esc(trAnTarih(e.occurred_at))}${e.created_by_team_id&&tm[e.created_by_team_id]?' · '+esc(tm[e.created_by_team_id]):''}
        ${sys?' · <span class="pill">sistem</span>':''}
        ${aks?` · <span class="pill">${aks==='open'?'Açık aksiyon':aks==='done'?'Tamamlandı':'İptal'}</span>`:''}
        ${e.assignee_id&&tm[e.assignee_id]?' · atanan: '+esc(tm[e.assignee_id]):''}
        ${e.due_at?` · ${gecikti(e.due_at)&&aks==='open'?'<span style="color:#b3261e">⚠ gecikti </span>':''}termin ${esc(trTarih(e.due_at))}`:''}
      </div>
      ${aks==='open'?`<button class="btn btn-outline btn-sm" onclick="entryDone(${e.id})">Tamamla</button>`:''}
      ${sys?'':`<button class="btn btn-outline btn-sm" onclick="entryForm(${e.id},${e.job_id},${!!aks})">Düzenle</button>`}
      ${(sys||!isAdmin())?'':`<button class="btn btn-danger btn-sm" onclick="entryDel(${e.id})">Sil</button>`}
    </div>`;}).join('')
    ||'<p class="empty">Henüz güncelleme yok.</p>';
}
/* PS1.1 §16: acik niyet. Bildirim aboneligi, gorunurluk degisikligi ya
   da sorumluluk YARATMAZ - yalnizca Panelim listene ekler/cikarir. */
async function workTakip(id,takipEt){
  const r=await guard(()=>api(takipEt?'work_follow':'work_unfollow',{id}),
    takipEt?'Takibe alınamadı':'Takip bırakılamadı');
  if(r===null)return;
  toast(takipEt?'Takibe alındı.':'Takip bırakıldı.');
  workAc(id);
}
async function workLifeDegis(id){
  const ls=gv('wLife'), cr=gv('wClose');
  const eski=(ui._work||{}).lifecycle_status||'acik';
  await guard(()=>api('job_lifecycle',{id,lifecycle_status:ls,closed_reason:cr}),'Durum değiştirilemedi');
  if(eski!==ls) await sysEntry(id,`Durum değişti: ${LIFELBL[eski]||eski} → ${LIFELBL[ls]||ls}${ls==='kapandi'?' ('+(CLOSELBL[cr]||cr)+')':''}`);
  toast('Durum güncellendi.'); workAc(id);
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
  if(!await mpConfirm('Bu güncelleme silinsin mi?','Güncellemeyi Sil'))return;
  const jid=(ui._work||{}).id;
  const r=await guard(()=>api('entry_delete&id='+id),'Silinemedi'); if(r===null)return;
  toast('Silindi.'); workAc(jid);
}
async function quoteRevise(id){
  if(!await mpConfirm('Bu teklifin yeni bir revizyonu oluşturulsun mu? Mevcut teklif korunur.','Teklifi Revize Et'))return;
  const r=await guard(()=>api('quote_revise',{id}),'Revizyon oluşturulamadı'); if(r===null)return;
  await sysEntry((ui._work||{}).id,`Teklif #${id} revize edildi → #${r.id} (rev ${r.revision_no})`);
  toast(`Revizyon oluşturuldu: Teklif #${r.id}`); workAc((ui._work||{}).id);
}
function partyForm(jobId){
  modal(`<h3 style="margin:0 0 6px">Taraf Ekle</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Bu işteki rol, kurumun genel etiketinden bağımsızdır (BR-ORG01).</p>
    <input type="hidden" id="pjid" value="${jobId}">
    <div class="field"><label class="flabel" for="pcid">Kurum</label>
      <select class="inp" id="pcid">${(ui._cust||[]).slice(0,800).map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('')}</select></div>
    <div class="field"><label class="flabel" for="prole">Rol</label>
      <select class="inp" id="prole">
        <option value="account">Müşteri / hesap</option><option value="advertiser">Reklamveren</option>
        <option value="agency">Ajans</option><option value="bill_to">Fatura edilecek</option>
        <option value="supplier">Tedarikçi</option><option value="operator">İşletmeci</option>
        <option value="other">Diğer</option></select></div>
    <div class="field"><label class="flabel" for="pnote">Not</label><input class="inp" id="pnote"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
  modal(`<h3 style="margin:0 0 6px">Sözleşme ve Muhasebe</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Sözleşme eksikliği bir uyarıdır, engel değildir (D-218). Kapanmış iş muhasebenin işlendiği anlamına gelmez (BR-W04).</p>
    <input type="hidden" id="wmid" value="${id}">
    <div class="row2">
      <div class="field"><label class="flabel" for="wcs">Sözleşme durumu</label>
        <select class="inp" id="wcs">${[['missing','Eksik'],['pending','Bekleniyor'],['signed','İmzalı']].map(o=>`<option value="${o[0]}" ${j.contract_status===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="wcd">İmza tarihi</label>
        <input class="inp" type="date" id="wcd" value="${esc(j.contract_signed_at)}"></div></div>
    <div class="field"><label class="flabel" for="wcu">Sözleşme bağlantısı (Drive)</label><input class="inp" id="wcu" value="${esc(j.contract_url)}" placeholder="https://drive.google.com/..."></div>
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
  const cs=gv('wcs'), as=gv('was');
  modalBusy(true);
  const r=await guard(()=>api('job_save',{id,contract_status:cs,contract_signed_at:gv('wcd')||null,
    contract_url:gv('wcu')||null,accounting_status:as,
    accounting_amount:gv('waa')?+gv('waa'):null,accounting_note:gv('wan')||null,
    ...accZaman(j,as,gv('wasd'))}),'Kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  if(j.contract_status!==cs) await sysEntry(id,`Sözleşme durumu: ${({missing:'Eksik',pending:'Bekleniyor',signed:'İmzalı'})[cs]}`);
  if((j.accounting_status||'yok')!==as) await sysEntry(id,`Muhasebe durumu: ${accLbl(j.accounting_status||'yok')} → ${accLbl(as)}`);
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
  const opt=(arr,val,lbl)=>`<option value="">— yok —</option>`+arr.map(x=>
    `<option value="${x.id}" ${String(val)===String(x.id)?'selected':''}>${esc(lbl(x))}</option>`).join('');
  const benim=(ui._me&&ui._me.id)||0;
  const ekip=(tm||[]).filter(t=>t.active!==false);
  if(!id){
    const pc=(ctx&&ctx.custId)||0, pk=(ctx&&ctx.contactId)||0;
    if(pk && !ui._contacts.some(k=>k.id===pk)) ui._contacts=ct||[];
    modal(`<h3 style="margin:0 0 14px">Yeni İş</h3>
    <input type="hidden" id="jid" value="0">
    <div class="field"><label class="flabel" for="jt">Başlık *</label>
      <input class="inp" id="jt" placeholder="ör. M1 AVM sonbahar kampanyası"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="jc">Kurum</label>
        <div class="inp-add">
          <select class="inp" id="jc" onchange="jobKisiTazele()">${opt(cu,pc,x=>x.firma||('#'+x.id))}</select>
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
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="jobSave()">Oluştur</button></div>`);
    const t0=document.getElementById('jt'); if(t0)t0.focus();
    return;
  }
  modal(`<h3 style="margin:0 0 14px">İşi Düzenle</h3>
  <input type="hidden" id="jid" value="${id||0}">
  <div class="field"><label class="flabel" for="jt">Başlık *</label><input class="inp" id="jt" value="${esc(j.title)}" placeholder="ör. M1 AVM Megalight baskı"></div>
  <div class="row2">
    <div class="field"><label class="flabel" for="jc">Müşteri</label><select class="inp" id="jc" onchange="jobKisiTazele()">${opt(cu,j.customer_id,x=>x.firma||('#'+x.id))}</select></div>
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
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="jobSave()">Kaydet</button></div>`);
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
  await jobForm(st.asama||null, null, {custId:opt.custId||+st.cust||0, contactId:opt.contactId||+st.kisi||0});
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
async function jobSave(){
  if(!gv('jt').trim()){ mpAlert('Başlık zorunlu.'); return; }
  const num=v=>v?+v:null;
  const yeni=!(+gv('jid'));
  const cid=num(gv('jc'));
  modalBusy(true);
  /* Kısa oluşturma formunda mecra/tedarikçi/tarih alanları HİÇ YOKTUR;
     düzenleme formunda vardır. Yokken `undefined` göndermek yerine alanı
     hiç eklemiyoruz, böylece mevcut değerler ezilmez. */
  const row={id:+gv('jid')||0,title:gv('jt'),status:gv('js')||'temas_takip',
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
  const eskiFaz=yeni?null:((ui._jobs||[]).find(x=>x.id===+gv('jid'))||{}).status;
  const r=await guard(()=>api('job_save',row),'İş kaydedilemedi');
  modalBusy(false);
  if(r===null) return;
  if(!yeni && eskiFaz && eskiFaz!==row.status){
    await sysEntry(+gv('jid'),`Aşama değişti: ${JOBLBL[eskiFaz]||eskiFaz} → ${JOBLBL[row.status]||row.status}`);
  }
  /* Yeni Work: seçilen kurum compatibility alanına ve canonical
     work_parties account rolüne birlikte yazılır (06 §8). Seçilen
     "İlgili" kişiler work_followers'a yazılır — kimseye İŞ ATANMAZ. */
  if(yeni && r && r.id){
    if(cid) await api('work_party_save',{id:0,job_id:r.id,customer_id:cid,role:'account'}).catch(()=>{});
    const fol=Array.from(document.querySelectorAll('.jFol:checked')).map(x=>+x.value);
    if(fol.length) await api('work_follow_many',{id:r.id,team_ids:fol}).catch(()=>{});
    await sysEntry(r.id,'İş oluşturuldu.');
  }
  closeModal(); renderSection(); toast('İş kaydedildi.');
}

/* ================= BASKI & MONTAJ (Sprint 05) =================
   Ayrı bir source-of-truth modülü değil; work_operations üzerinde bir
   view'dır (07 §13). Aktif takip artık Excel'de değil burada yaşar
   (BR-X01); Excel yalnız import/export formatıdır (BR-X02).
   ============================================================== */
const OPTYPE=[['baski','Baskı'],['montaj','Montaj'],['sokum','Söküm'],['diger','Diğer']];
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
  if(kind==='hafta'){ const son=new Date(pzt); son.setDate(pzt.getDate()+6); return [_iso(pzt),_iso(son)]; }
  /* "Sırada ne var?" — gerçek tablonun cevapladığı ama ekranda karşılığı
     olmayan soruydu (S2 §8). Bugünden ileri 30 gün. */
  if(kind==='yaklasan'){ const son=new Date(n); son.setDate(n.getDate()+30); return [_cIso(n),_iso(son)]; }
  if(kind==='ay')   { return [_iso(new Date(n.getFullYear(),n.getMonth(),1)), _iso(new Date(n.getFullYear(),n.getMonth()+1,0))]; }
  if(kind==='gecen'){ return [_iso(new Date(n.getFullYear(),n.getMonth()-1,1)), _iso(new Date(n.getFullYear(),n.getMonth(),0))]; }
  if(kind==='yil')  { return [_iso(new Date(n.getFullYear(),0,1)), _iso(new Date(n.getFullYear(),11,31))]; }
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
    const gec=o.planned_date&&o.planned_date<_iso(new Date())&&['planned','waiting','in_progress'].includes(o.status);
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
      <td class="mono">${o.quantity!=null?esc(o.quantity):''}</td>
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
        <button class="btn btn-primary btn-sm" onclick="opForm(0)">${ic('plus',15)} Yeni Kayıt</button></div></div>

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
  renderSection();
}

/* ---------- Operation formu (hem shared view hem Work detail) ---------- */
async function opForm(id,jobId){
  const o=(ui._ops||ui._workOps||[]).find(x=>x.id===id)||{};
  const veri=await guard(()=>Promise.all([api('jobs_list'),api('customers_list'),api('units_full').catch(()=>[])]),'Form açılamadı');
  if(!veri)return;
  const [jobs,custs,units]=veri;
  const jid=jobId||o.job_id||((ui._work||{}).id)||0;
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
        <select class="inp" id="opJob">
          ${jid?'':'<option value="">— iş seçin —</option>'}
          ${(jobs||[]).map(j=>`<option value="${j.id}" ${String(jid)===String(j.id)?'selected':''}>${esc(j.title)}</option>`).join('')}</select></div>
      ${/* §13: `diger` gercek kullanimda SIFIR satir tasiyor (canli sayim);
           yeni kayitta bir "cop kutusu" secenegi sunmak siniflandirmayi
           bozardi. Backend degeri KALDIRILMADI - eski bir kayit onu
           tasiyorsa secenek gorunur ve kaydedilebilir. */''}
      <div class="field"><label class="flabel" for="opT">Tür *</label>
        <select class="inp" id="opT">${OPTYPE.filter(t=>t[0]!=='diger'||o.operation_type==='diger')
          .map(t=>`<option value="${t[0]}" ${o.operation_type===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label class="flabel" for="opDesc">Açıklama</label><input class="inp" id="opDesc" value="${esc(o.description)}" placeholder="ör. M1 AVM megalight baskı"></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opQty">Adet</label><input class="inp" type="number" step="0.01" id="opQty" value="${esc(o.quantity)}"></div>
      <div class="field"><label class="flabel" for="opDim">Ölçü</label><input class="inp" id="opDim" value="${esc(o.dimensions)}" placeholder="ör. 300x400 cm"></div>
    </div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opUnit">Pozisyon (mecra)</label>
        <select class="inp" id="opUnit"><option value="">— yok —</option>${(units||[]).map(u=>`<option value="${u.id}" ${String(o.unit_id)===String(u.id)?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opLoc">Yer (serbest)</label><input class="inp" id="opLoc" value="${esc(o.location_text)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opSup">Uygulayan / tedarikçi kurum</label>
        <select class="inp" id="opSup"><option value="">— yok —</option>${(custs||[]).slice(0,800).map(x=>`<option value="${x.id}" ${String(o.supplier_org_id)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opDate">Planlanan tarih</label><input class="inp" type="date" id="opDate" value="${esc(o.planned_date)}"></div>
    </div>
    <div class="row2">
      <div class="field"><label class="flabel" for="opSt">Durum</label>
        <select class="inp" id="opSt">${OPSTAT.map(t=>`<option value="${t[0]}" ${(o.status||'planned')===t[0]?'selected':''}>${t[1]}</option>`).join('')}</select></div>
      <div class="field"><label class="flabel" for="opCost">Maliyet (₺)</label><input class="inp" type="number" step="0.01" id="opCost" value="${esc(o.cost)}"></div>
    </div>
    <div class="field"><label class="flabel" for="opNote">Not</label><textarea class="inp" id="opNote">${esc(o.note)}</textarea></div>
    <div class="field"><label class="flabel" for="opEv">Kanıt görseli / belge bağlantıları (her satıra bir URL)</label>
      <textarea class="inp" id="opEv" rows="2" placeholder="https://drive.google.com/...">${esc((Array.isArray(o.evidence_urls)?o.evidence_urls:[]).join('\n'))}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      ${(id&&isAdmin())?`<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="opDel(${id})">Sil</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="opSave()">Kaydet</button></div>`);
}
/* Bir operasyonun ONCEKI halini iki ayri onbellekte de ara.
   Eski kod `ui._ops||ui._workOps` yaziyordu: kullanici bir kez Baski &
   Montaj ekranini actiysa `ui._ops` kalici olarak truthy kaliyor ve Work
   Detail'den yapilan duzenleme BAYAT operasyon listesinde araniyordu.
   Kayit o listenin donem filtresi disindaysa bulunamiyor, `eski.status`
   undefined oluyor ve her kaydetmede "durumu: undefined -> X" diye sahte
   bir sistem Entry'si yaziliyordu (C4 §16: idempotent kayitta mukerrer
   sistem Entry'si uretilmemeli). */
function opOncekiBul(id){
  if(!id) return null;
  const a=(ui._ops||[]).find(x=>x.id===id);
  if(a) return a;
  return (ui._workOps||[]).find(x=>x.id===id)||null;
}
async function opSave(){
  const jid=+gv('opJob');
  if(!jid){ mpAlert('İş seçimi zorunlu.'); return; }
  const ev=(gv('opEv')||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const num=v=>v!==''&&v!=null?+v:null;
  const id=+gv('opid');
  const eski=opOncekiBul(id);
  const st=gv('opSt')||'planned';
  modalBusy(true);
  const r=await guard(()=>api('operation_save',{id,job_id:jid,operation_type:gv('opT'),
    status:st,description:gv('opDesc')||null,quantity:num(gv('opQty')),dimensions:gv('opDim')||null,
    supplier_org_id:+gv('opSup')||null,unit_id:+gv('opUnit')||null,location_text:gv('opLoc')||null,
    planned_date:gv('opDate')||null,cost:num(gv('opCost')),note:gv('opNote')||null,
    evidence_urls:ev}),'Kayıt kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  /* Operasyon structured source of truth'tur; Entry yalniz tarihsel izdir.
     Yalniz GERCEKTEN anlamli gecisler yazilir: kayit acilisi, fiilen
     baslama, tamamlanma ve iptal. Onceki durum bilinmiyorsa (kayit hicbir
     onbellekte yok) sahte bir gecis uydurulmaz - sessiz kalinir. */
  const OP_IZLENEN={done:1,cancelled:1,in_progress:1};
  if(!id){
    await sysEntry(jid,`${opTypeLbl(gv('opT'))} kaydı eklendi${gv('opDate')?' · '+trTarih(gv('opDate')):''}`);
  } else if(eski && eski.status!==st && OP_IZLENEN[st]){
    const ad=opTypeLbl(gv('opT'));
    await sysEntry(jid, st==='done'      ? `${ad} tamamlandı.`
                      : st==='cancelled' ? `${ad} iptal edildi.`
                      : `${ad} başladı (${opStatLbl(eski.status)} → ${opStatLbl(st)}).`);
  }
  closeModal(); toast('Kaydedildi.');
  if(ui.section==='operasyon') renderSection(); else workAc(jid);
}
/* Modal icinden ise/guncellemeye gecis. Ikisi de kaydedilmemis form
   icerigini birakip gider; bu yuzden yalniz KAYITLI bir operasyonda
   gosterilir (opForm'da id&&jid kosulu). */
function opIse(jid){ closeModal(); workAc(jid); }
function opGuncelle(jid){ closeModal(); qcAc({jobId:jid}); }
async function opDel(id){
  if(!await mpConfirm('Bu baskı/montaj kaydı silinsin mi?','Kaydı Sil'))return;
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
  {key:'quantity',label:'Adet',w:8},
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
const _wsIso=d=>d.toISOString().slice(0,10);
const PS_AY=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
/* Olusturma zamani: "14 Eyl · 11:50". Belirsizlik birakmaz, hover
   gerektirmez (§6). */
function psZaman(t){
  if(!t) return '';
  const d=new Date(t);
  return `${d.getDate()} ${PS_AY[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
function psGecikme(due){
  const d=new Date(String(due).slice(0,10)+'T00:00:00');
  const b=new Date(); b.setHours(0,0,0,0);
  return Math.round((b-d)/86400000);
}
/* Son tarih: yalnizca gun. "18 Eyl". */
function psGun(t){
  if(!t) return '';
  const d=new Date(t);
  return `${d.getDate()} ${PS_AY[d.getMonth()]}`;
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

/* Kisisel ilgi: feed SIRASINI degistirmez (§6), yalnizca vurgular. */
function psBenimMi(e,benim,ilgiSet,takipJobs){
  if(!benim) return false;
  return ilgiSet.has(e.id) || e.assignee_id===benim
      || (e.job_id&&takipJobs.has(e.job_id));
}

async function workspaceHome(c){
  const [h1,h2]=wsHafta();
  const st=psDurum();
  const benim=(ui._me&&ui._me.id)||0;
  const bugun=_wsIso(new Date());
  const ufuk=new Date(); ufuk.setDate(ufuk.getDate()+14); const ufukIso=_wsIso(ufuk);
  const opBas=h1<bugun?h1:bugun;

  /* Tek turda paralel cekim; kart/gun/Work basina sorgu YOK (07 §20).
     entry_relevance TUM satirlariyla cekilir cunku feed etiketlenen
     kisileri chip olarak gosterir (§5) - Entry basina sorgu N+1 olurdu. */
  const [jobs,ents,ops,custs,team,ilgi,takip,kisiler]=await Promise.all([
    api('jobs_list'),
    api('entries_list&limit=400'),
    api(`operations_list&from=${opBas}&to=${ufukIso}`),
    api('customers_list'),
    api('team_list'),
    api('entry_relevance_all').catch(()=>[]),
    benim?api('work_followers_all&team_id='+benim).catch(()=>[]):Promise.resolve([]),
    /* Kişi chip'i için (§5 bağlam satırı). Tek toplu okuma; Entry başına
       sorgu YOK. Soğuk açılışta ui._contactMap boş olurdu ve kişi bağlamı
       sessizce kaybolurdu. */
    api('contacts_list').catch(()=>[])]);
  ui._team=team||[]; ui._jobs=jobs||[]; ui._cust=custs||[];
  const jm={}; (jobs||[]).forEach(j=>jm[j.id]=j);
  const cm={}; (custs||[]).forEach(x=>cm[x.id]=x.firma);
  const tm={}; (team||[]).forEach(t=>tm[t.id]=t.name);
  ui._opJobs=jm; ui._opCust=cm;

  /* entry_id -> [team_id] ve benim etiketlerim */
  ui._contactMap={}; (kisiler||[]).forEach(k=>ui._contactMap[k.id]=k);
  const ilgiMap={}; (ilgi||[]).forEach(r=>{ (ilgiMap[r.entry_id]=ilgiMap[r.entry_id]||[]).push(r.team_id); });
  const ilgiSet=new Set((ilgi||[]).filter(r=>r.team_id===benim).map(r=>r.entry_id));
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
  tumEnt.forEach(e=>{ e._benim=psBenimMi(e,benim,ilgiSet,takipJobs); });

  /* ---- Filtreler (§7) - hizli, calisan kontroller ---- */
  let suz=tumEnt;
  if(st.job)   suz=suz.filter(e=>String(e.job_id)===String(st.job));
  if(st.org)   suz=suz.filter(e=>{ const j=jm[e.job_id];
                 return String(j?j.customer_id:e.customer_id)===String(st.org); });
  if(st.kisi)  suz=suz.filter(e=>(ilgiMap[e.id]||[]).some(t=>String(t)===String(st.kisi)));
  if(st.acil)  suz=suz.filter(e=>e.is_urgent);
  if(st.gec)   suz=suz.filter(e=>e.action_status==='open'&&gecmis(e.due_at));
  if(st.benim) suz=suz.filter(e=>e._benim);
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
  const feedSatir=e=>{
    const j=jm[e.job_id]||null;
    const orgId=j?j.customer_id:e.customer_id;
    const org=cm[orgId]||'';
    const kisi=(ui._contactMap&&ui._contactMap[e.contact_id])||null;
    const sys=e.source==='system';
    const kim=sys?'Sistem':(tm[e.created_by_team_id]||'—');
    const etiket=(ilgiMap[e.id]||[]).map(t=>tm[t]).filter(Boolean);
    const acikAks=e.action_status==='open';
    const gecGun=e.due_at?psGecikme(e.due_at):null;
    const gecikti=acikAks&&gecGun>0;
    return `<article class="pu ${sys?'sys':''} ${e._benim?'mine':''}">
      <div class="pu-h">
        <b>${esc(kim)}</b>
        <time datetime="${esc(String(e.occurred_at||''))}">${esc(psZaman(e.occurred_at))}</time>
        ${e.is_urgent?'<span class="pu-b acil">ACİL</span>':''}
        ${e._benim&&ilgiSet.has(e.id)?'<span class="pu-b mine">Sana özel</span>':''}
      </div>
      <p class="pu-t" onclick="psAc(this)">${esc(e.body)}</p>
      ${(j||org||kisi||etiket.length||sys)?`<div class="pu-c">
        ${j?`<button type="button" class="pu-chip" onclick="workAc(${j.id})" title="${esc(j.title)}">${esc(orgKisa(j.title,38))}</button>`:''}
        ${org?`<button type="button" class="pu-chip org" onclick="orgAc(${orgId})" title="${esc(org)}">${esc(orgKisa(org))}</button>`:''}
        ${kisi?`<button type="button" class="pu-chip" onclick="personAc(${kisi.id})" title="${esc(kisi.name)}">${esc(kisi.name)}</button>`:''}
        ${etiket.map(nm=>`<span class="pu-chip who">@${esc(nm)}</span>`).join('')}
        ${sys?'<span class="pu-chip dim">sistem</span>':''}
      </div>`:''}
      ${e.due_at?`<div class="pu-due">${gecikti
        ? `<span class="g">⚠ ${gecGun} gün gecikti</span><span class="n">son tarih ${esc(psGun(e.due_at))}</span>`
        : `<span class="n">Son tarih: <b>${esc(psGun(e.due_at))}</b></span>`}</div>`:''}
    </article>`;};

  const feedHtml=gosterilen.length?gosterilen.map(feedSatir).join('')
    :`<p class="empty">${filtreAktif?'Bu filtreye uyan güncelleme yok.':'Henüz güncelleme yok.'}</p>`;

  /* ---- DIKKAT GEREKENLER (§12) ----
     Deterministik: (a) gecmis SON TARIHI olan acik aksiyonlar,
     (b) Acil isaretli guncellemeler, (c) Acil isaretli acik Work'ler.
     YASTAN urgency CIKARILMAZ; eski bir guncelleme sirf eski diye
     dikkat gerektirmez. "Bekleyen" ADI KULLANILMAZ - lifecycle
     `bekliyor` bambaska bir kavramdir (§2.C). */
  const dikkatAks=tumEnt.filter(e=>e.action_status==='open'&&gecmis(e.due_at));
  const dikkatAcil=tumEnt.filter(e=>e.is_urgent&&!(e.action_status==='open'&&gecmis(e.due_at)));
  const dikkatIs=(jobs||[]).filter(j=>j.is_urgent&&(j.lifecycle_status||'acik')!=='kapandi');
  const dikkatN=dikkatAks.length+dikkatAcil.length+dikkatIs.length;

  const dikkatSatir=(ikon,cls,metin,alt,sag,tik)=>
    `<button type="button" class="pd-row" onclick="${tik}">
       <span class="pd-i ${cls}">${ikon}</span>
       <span class="pd-b"><span class="pd-t">${metin}</span><span class="pd-s">${alt}</span></span>
       <span class="pd-r">${sag}</span></button>`;
  const dikkatHtml=dikkatN?[
    /* §12: NEDEN burada olduğu okunur olsun — küçük kırmızı bir ikona
       bakıp çıkarım yapmak zorunda kalınmasın. */
    ...dikkatAks.slice(0,6).map(e=>{ const j=jm[e.job_id]||{};
      const g=psGecikme(e.due_at);
      return dikkatSatir('⚠','gec',esc(e.body),
        esc(j.title||orgKisa(orgAdi(j))||'Şirket güncellemesi'),
        `<span class="pill clay">${g} gün gecikti</span><span class="pd-d">${esc(psGun(e.due_at))}</span>`,
        e.job_id?`workAc(${e.job_id})`:'void 0'); }),
    ...dikkatAcil.slice(0,4).map(e=>{ const j=jm[e.job_id]||{};
      return dikkatSatir('⚡','acil',esc(e.body),
        esc(j.title||orgKisa(orgAdi(j))||'Şirket güncellemesi'),
        `<span class="pill clay">ACİL</span>${e.due_at?`<span class="pd-d">${esc(psGun(e.due_at))}</span>`:''}`,
        e.job_id?`workAc(${e.job_id})`:'void 0'); }),
    ...dikkatIs.slice(0,4).map(j=>
      dikkatSatir('⚡','acil',esc(j.title),
        esc(orgKisa(orgAdi(j))||JOBLBL[j.status]||''),
        '<span class="pill clay">ACİL İŞ</span>',`workAc(${j.id})`))
  ].join('') : '<p class="empty">Dikkat gerektiren bir şey yok.</p>';

  /* ---- BUGUN & YAKLASAN (§13) ----
     Kaynaklar zaten onaylanmis yapisal tarihler: Entry son tarihleri ve
     work_operations.planned_date. Work'e sirf burayi doldurmak icin
     termin EKLENMEZ (§14). */
  const ajanda={};
  tumEnt.filter(e=>e.action_status==='open'&&e.due_at).forEach(e=>{
    const d=String(e.due_at).slice(0,10);
    if(d>ufukIso) return;
    const k=d<bugun?bugun:d;               /* gecikmisler bugunun ustunde toplanir */
    (ajanda[k]=ajanda[k]||[]).push({t:'takip',gec:d<bugun,d,e}); });
  (ops||[]).filter(o=>o.planned_date&&o.planned_date>=bugun&&o.planned_date<=ufukIso)
    .forEach(o=>{ (ajanda[o.planned_date]=ajanda[o.planned_date]||[]).push({t:'op',d:o.planned_date,o}); });
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
    const hepsi=ajanda[d], tasma=hepsi.length-PA_GUN_TAVAN;
    return `<div class="pa-d"><div class="pa-dh ${d===bugun?'now':''}">${esc(et)}</div>
      ${hepsi.slice(0,PA_GUN_TAVAN).map(x=>x.t==='takip'
        ? `<button type="button" class="pa-e ${x.gec?'gec':''}" onclick="${x.e.job_id?`workAc(${x.e.job_id})`:'void 0'}">
             <span class="pa-k takip">Takip</span>
             <span class="pa-x">${esc(String(x.e.body).slice(0,64))}</span>
             ${x.gec?`<em>${psGecikme(x.d)} gün gecikti</em>`:''}</button>`
        : `<button type="button" class="pa-e" onclick="workAc(${x.o.job_id})">
             <span class="pa-k op">${esc(opTypeLbl(x.o.operation_type))}</span>
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
  if(st.acil)  ozet.push('Acil');
  if(st.gec)   ozet.push('Geciken');
  if(st.benim) ozet.push('Benimle ilgili');

  c.innerHTML=`
    <div class="pnl-grid">
      <div class="pnl-a">
        <section class="card">
          <div class="card-h">
            <h3>Güncellemeler</h3>
            <button class="btn btn-primary btn-sm" onclick="qcAc({})">${ic('plus',15)} Güncelleme</button>
          </div>
          <div class="pf">
            <select class="inp inp-sm" id="psJob" aria-label="İşe göre süz" onchange="psFiltreDegis()">
              <option value="">Tüm işler</option>${jobOpt}</select>
            <select class="inp inp-sm" id="psOrg" aria-label="Kuruma göre süz" onchange="psFiltreDegis()">
              <option value="">Tüm kurumlar</option>${orgOpt}</select>
            <select class="inp inp-sm" id="psKisi" aria-label="İlgili kişiye göre süz" onchange="psFiltreDegis()">
              <option value="">Tüm ilgililer</option>${kisiOpt}</select>
            <button type="button" class="pf-t ${st.acil?'on':''}" aria-pressed="${st.acil}"
              onclick="psFiltre({acil:${!st.acil}})">⚡ Acil</button>
            <button type="button" class="pf-t ${st.gec?'on':''}" aria-pressed="${st.gec}"
              onclick="psFiltre({gec:${!st.gec}})">⚠ Geciken</button>
            <button type="button" class="pf-t ${st.benim?'on':''}" aria-pressed="${st.benim}"
              onclick="psFiltre({benim:${!st.benim}})">Benimle ilgili</button>
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
          </div>`:''}</section>
      </div>

      <div class="pnl-b">
        <section class="card">
          <div class="card-h"><h3>Bugün &amp; Yaklaşan</h3>
            <button class="btn-link" onclick="isGo('takvim',{})">Takvime git</button></div>
          <div class="card-b pa-list">${tkvHtml}</div></section>

        <section class="card">
          <div class="card-h"><h3>Dikkat Gerekenler ${dikkatN?`<span class="chip clay">${dikkatN}</span>`:''}</h3>
            ${dikkatN?`<button class="btn-link" onclick="dikkatGoruntule()"
              title="Termini geçmiş açık aksiyonu olan işleri İşler / Liste'de aç">Görüntüle</button>`:''}</div>
          <div class="card-b">${dikkatHtml}</div></section>

        <section class="card">
          <div class="card-h"><h3>Takip Ettiğim İşler ${takipIs.length?`<span class="chip">${takipIs.length}</span>`:''}</h3>
            <button class="btn-link" onclick="wsTakipTumu()">Tümü</button></div>
          <div class="card-b">${takipHtml}</div></section>
      </div>
    </div>`;
}
/* Panelim kisayollari - ayni kayda Isler ekranindaki filtreyle gider,
   ayri bir liste kopyasi uretmez (BR-V01). Hedef ekranda filtrenin AKTIF
   oldugu acikca gorunur (§8/§20). */
/* "Dikkat Gerekenler" -> tek ve HER ZAMAN AYNI hedef: Isler / Liste,
   `Geciken` filtresi acik. Yeni bir dikkat modulu YOK (§5); kart zaten
   BR-V01 geregi ayni kayitlarin bir goruntusu. Filtre hedef ekranda
   `Aktif filtre` seridinde acikca gorunur. Acil isler ayni satirdaki
   mevcut `⚡ Acil` anahtariyla tek tikla eklenir. */
function dikkatGoruntule(){
  isGo('liste',{q:'',org:'',phase:'',ilgili:'',acil:false,gec:true,life:['acik','bekliyor']});
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
function wsMecTab(sub){ ui._mecSub=sub; wsMecralarHub(document.getElementById('content')); }
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
function prodEdit(id){ const p=(ui._products||[]).find(x=>x.id===id)||{prices:{}};
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
async function prodSave(){ await api('product_save',{id:+gv('pid'),name:gv('pname'),olcu:gv('polcu'),yuzey:gv('pyuzey'),isikli:gv('pisikli'),baski_malzemesi:gv('pbm'),baski_format:gv('pbf'),yayin_format:gv('pyf'),etiketler:gv('petiket'),ikon:gv('pikon'),baski_ucreti:gv('pbu'),montaj_ucreti:gv('pmu'),extra_ucret:gv('pex'),prices:parsePrices(gv('pprices'))}); renderSection(); }
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
const _dt=()=>new Date().toISOString().slice(0,10);

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
async function exportRows(dosyaAdi, sheetAdi, cols, rows, meta){
  try{ await xlsxLoad(); }catch(e){ mpAlert(e.message); return; }
  const head=cols.map(c=>c.label);
  const body=rows.map(r=>cols.map(c=>{
    const v=typeof c.get==='function'?c.get(r):r[c.key];
    return (v===null||v===undefined)?'':v; }));
  const ws=XLSX.utils.aoa_to_sheet([head,...body]);
  ws['!cols']=cols.map(c=>({wch:c.w||18}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheetAdi.slice(0,30));
  XLSX.utils.book_append_sheet(wb,exportMetaSheet(sheetAdi,rows.length,meta),'Bilgi');
  XLSX.writeFile(wb,`${dosyaAdi}-${_dt()}.xlsx`);
}
/* Dışa aktarım künyesi. `meta` = [[etiket,değer], ...] — ekranın o anki
   filtresi. Buradaki hiçbir satır iş tarihi DEĞİLDİR; iş tarihleri veri
   sayfasının kendi sütunlarındadır. */
function exportMetaSheet(sheetAdi, adet, meta){
  const now=new Date();
  const okundu=ui._veriOkunma instanceof Date?ui._veriOkunma:now;
  const aoa=[
    ['Medyapark — dışa aktarım künyesi'],
    [],
    ['Görünüm', sheetAdi],
    ['Kayıt sayısı', adet],
    []];
  (meta||[]).forEach(m=>aoa.push([m[0], m[1]]));
  aoa.push([]);
  aoa.push(['Veri okunma anı', okundu.toLocaleString('tr-TR')]);
  aoa.push(['Dışa aktarım anı', now.toLocaleString('tr-TR')]);
  aoa.push([]);
  aoa.push(['Not','Bu dosya yukarıdaki filtrenin O ANKİ durumunun anlık görüntüsüdür.']);
  aoa.push(['','Canlı kayıt uygulamadadır; bu dosya kaynak tablo değildir.']);
  const ws=XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols']=[{wch:24},{wch:52}];
  return ws;
}

/* çok sayfalı Excel */
async function exportSheets(dosyaAdi, sheets){
  try{ await xlsxLoad(); }catch(e){ mpAlert(e.message); return 0; }
  const wb=XLSX.utils.book_new(); let toplam=0;
  sheets.forEach(sh=>{
    if(!sh.rows.length) return;
    const head=sh.cols.map(c=>c.label);
    const body=sh.rows.map(r=>sh.cols.map(c=>{
      const v=typeof c.get==='function'?c.get(r):r[c.key];
      return (v===null||v===undefined)?'':v; }));
    const ws=XLSX.utils.aoa_to_sheet([head,...body]);
    ws['!cols']=sh.cols.map(c=>({wch:c.w||18}));
    ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:body.length,c:head.length-1}})};
    XLSX.utils.book_append_sheet(wb,ws,sh.name.slice(0,30));
    toplam+=sh.rows.length;
  });
  if(!wb.SheetNames.length){ mpAlert('Seçtiğiniz aralıkta kayıt bulunamadı.'); return 0; }
  XLSX.writeFile(wb,`${dosyaAdi}-${_dt()}.xlsx`);
  return toplam;
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
const JOBLBL={temas_takip:'Temas / Takip',teklif:'Teklif',baski:'Baskı',montaj:'Montaj',yayinda_aktif:'Yayında / Aktif',
  tasarim:'Tasarım (eski)',yayin:'Yayın (eski)',arsiv:'Arşiv (eski)'};
function haftaAraligi(off){
  const d=new Date(); const g=(d.getDay()+6)%7;           /* pazartesi = 0 */
  const bas=new Date(d.getFullYear(),d.getMonth(),d.getDate()-g+(off||0)*7);
  const bit=new Date(bas); bit.setDate(bas.getDate()+6);
  const f=x=>x.toISOString().slice(0,10);
  return [f(bas),f(bit)];
}
async function raporlar(c){
  const [b,e]=haftaAraligi(0);
  c.innerHTML=`<div class="sec-head">
      <div><h3>Raporlar</h3><p class="sub">Seçtiğiniz aralık için Excel dosyası oluşturur</p></div></div>

    <div class="sec-card">
      <label class="flabel" style="font-weight:700">Tarih aralığı</label>
      <div class="row2" style="max-width:460px">
        <div class="field"><label class="flabel">Başlangıç</label><input class="inp" type="date" id="rb" value="${b}"></div>
        <div class="field"><label class="flabel">Bitiş</label><input class="inp" type="date" id="re" value="${e}"></div>
      </div>
      <div class="rp-quick">
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(0)">Bu hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(1)">Gelecek hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapHafta(-1)">Geçen hafta</button>
        <button class="btn btn-ghost btn-sm" onclick="rapAy()">Bu ay</button>
        <button class="btn btn-ghost btn-sm" onclick="rapAy(1)">Gelecek ay</button>
      </div>
    </div>

    <div class="sec-card">
      <label class="flabel" style="font-weight:700">Rapora eklenecek bölümler</label>
      <div class="rp-list">
        ${[['r_hafta','Haftalık Aksiyon Planı','Seçilen aralıkta başlayan veya biten tüm işler; aşama, tarih ve sorumlu firma ile',1],
           ['r_baski','Baskı & Montaj Takibi','Yalnızca baskı ve montaj aşamasındaki işler; atanan tedarikçi bilgisiyle',1],
           ['r_is','İş Takibi (tümü)','Arşiv dahil bütün işlerin listesi',0],
           ['r_dol','Mecra Doluluk Detayı','Pozisyon ve yüzey bazında ay ay durum ve kiralayan firma',1],
           ['r_ozet','Doluluk Özeti','Mecra bazında dolu/rezerve/boş ay sayısı ve doluluk yüzdesi',1],
           ['r_teklif','Teklifler','Seçilen aralıkta gelen teklifler ve durumları',0]
          ].map(x=>`<label class="rp-item"><input type="checkbox" id="${x[0]}" ${x[3]?'checked':''}>
            <span><b>${esc(x[1])}</b><em>${esc(x[2])}</em></span></label>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">
        <button class="btn btn-primary btn-sm" onclick="rapUret()">${ic('download',15)} Excel Raporu Oluştur</button>
        <button class="btn btn-outline btn-sm" onclick="rapOnizle()">Önizleme</button>
      </div>
      <div id="rapOut"></div>
    </div>`;
}
function rapHafta(o){ const [b,e]=haftaAraligi(o);
  document.getElementById('rb').value=b; document.getElementById('re').value=e; }
function rapAy(o){ const d=new Date(); const m=d.getMonth()+(o||0);
  const b=new Date(d.getFullYear(),m,1), e=new Date(d.getFullYear(),m+1,0);
  const f=x=>x.toISOString().slice(0,10);
  document.getElementById('rb').value=f(b); document.getElementById('re').value=f(e); }

async function rapVeri(){
  const b=gv('rb'), e=gv('re');
  if(!b||!e){ mpAlert('Tarih aralığı seçin.'); return null; }
  if(b>e){ mpAlert('Başlangıç tarihi bitişten sonra olamaz.'); return null; }
  const [jb,cu,su,mc,al,un,bk,qs,ct]=await Promise.all([
    sb.from('jobs').select('*').order('start_day'),
    api('customers_list'), api('suppliers_list'), api('mecra_list'),
    sb.from('alt_mecralar').select('*'), sb.from('units').select('*').order('sort').order('id'),
    sb.from('bookings').select('*'), sb.from('quotes').select('*').order('created_at',{ascending:false}),
    api('contacts_list')
  ]);
  const cm={}; cu.forEach(x=>cm[x.id]=x);
  /* "İlgili Kişi" sütunu artık gerçek Contact'tan gelir (S02_001). */
  const km={}; (ct||[]).forEach(k=>{ if(k.active!==false && (!km[k.customer_id]||k.is_primary)) km[k.customer_id]=k.name; });
  const sm={}; su.forEach(x=>sm[x.id]=x);
  const mm={}; mc.forEach(x=>mm[x.id]=x);
  const am={}; (al.data||[]).forEach(x=>am[x.id]=x);
  const jobs=(jb.data||[]);
  const araliktaMi=j=>{
    const s1=j.start_day||'', s2=j.end_day||j.start_day||'';
    if(!s1&&!s2) return false;
    return !(s2<b || s1>e);                         /* aralıkla kesişiyorsa */
  };
  const jrow=j=>({
    is:j.title||'', asama:JOBLBL[j.status]||j.status||'',
    firma:(cm[j.customer_id]||{}).firma||'', kisi:km[j.customer_id]||'',
    mecra:(mm[j.mecra_id]||{}).name||'', tedarikci:(sm[j.supplier_id]||{}).firma||'',
    bas:j.start_day||'', bit:j.end_day||'', not:j.note||''
  });
  /* ay listesi: aralığın kapsadığı aylar */
  const aylar=[]; { const d=new Date(b.slice(0,7)+'-01'); const son=e.slice(0,7);
    for(let i=0;i<36;i++){ const ym=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
      aylar.push(ym); if(ym>=son)break; d.setMonth(d.getMonth()+1); } }
  const bmap={}; (bk.data||[]).forEach(x=>{(bmap[x.unit_id]=bmap[x.unit_id]||{})[x.ym]=x;});
  const dolRows=[], ozet={};
  (un.data||[]).forEach(u=>{
    const a=am[u.alt_mecra_id]||{}; const m=mm[a.mecra_id||u.mecra_id]||{};
    const p=posParts(u.name);
    const o=ozet[m.id]=ozet[m.id]||{mecra:m.name||'—',poz:0,dolu:0,rez:0,bos:0};
    o.poz++;
    aylar.forEach(ym=>{ const r=(bmap[u.id]||{})[ym];
      const durum=r?(r.status==='dolu'?'Dolu':'Rezerve'):'Boş';
      if(durum==='Dolu')o.dolu++; else if(durum==='Rezerve')o.rez++; else o.bos++;
      dolRows.push({mecra:m.name||'',alt:a.name||'',poz:p.base,yuzey:p.surf,ay:ym,durum,
        firma:r&&r.customer_id?((cm[r.customer_id]||{}).firma||''):'', not:r&&r.note?r.note:''});
    });
  });
  const ozetRows=Object.values(ozet).map(o=>({...o,
    toplam:o.dolu+o.rez+o.bos,
    oran:(o.dolu+o.rez+o.bos)?Math.round((o.dolu+o.rez)*100/(o.dolu+o.rez+o.bos))+'%':'0%'}));
  const qrows=(qs.data||[]).filter(q=>{const d=(q.created_at||'').slice(0,10); return d>=b&&d<=e;})
    .map(q=>({no:'#'+q.id,musteri:q.customer_name||q.firma||'',tel:q.telefon||'',mail:q.eposta||'',
      durum:({yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'})[q.status]||q.status||'Yeni',
      tarih:(q.created_at||'').slice(0,10)}));
  return {b,e,
    hafta:jobs.filter(araliktaMi).map(jrow),
    baski:jobs.filter(j=>['baski','montaj'].includes(j.status)).map(jrow),
    tumIs:jobs.map(jrow), dolRows, ozetRows, qrows, ayAdet:aylar.length};
}
const RC={
  is:[{key:'is',label:'İş',w:32},{key:'asama',label:'Aşama',w:12},{key:'firma',label:'Müşteri',w:24},
      {key:'kisi',label:'İlgili Kişi',w:18},{key:'mecra',label:'Mecra',w:20},{key:'tedarikci',label:'Tedarikçi',w:22},
      {key:'bas',label:'Başlangıç',w:12},{key:'bit',label:'Bitiş',w:12},{key:'not',label:'Not',w:30}],
  dol:[{key:'mecra',label:'Mecra',w:22},{key:'alt',label:'Alt Mecra',w:20},{key:'poz',label:'Pozisyon',w:14},
       {key:'yuzey',label:'Yüzey',w:8},{key:'ay',label:'Ay',w:10},{key:'durum',label:'Durum',w:10},
       {key:'firma',label:'Kiralayan',w:24},{key:'not',label:'Not',w:26}],
  ozet:[{key:'mecra',label:'Mecra',w:24},{key:'poz',label:'Pozisyon',w:10},{key:'dolu',label:'Dolu (ay)',w:11},
        {key:'rez',label:'Rezerve (ay)',w:13},{key:'bos',label:'Boş (ay)',w:11},
        {key:'toplam',label:'Toplam (ay)',w:12},{key:'oran',label:'Doluluk',w:10}],
  q:[{key:'no',label:'No',w:8},{key:'musteri',label:'Müşteri',w:26},{key:'tel',label:'Telefon',w:16},
     {key:'mail',label:'E-posta',w:24},{key:'durum',label:'Durum',w:12},{key:'tarih',label:'Tarih',w:12}]
};
function rapSecim(d){
  const S=[];
  if(document.getElementById('r_hafta').checked) S.push({name:'Haftalık Aksiyon',cols:RC.is,rows:d.hafta});
  if(document.getElementById('r_baski').checked) S.push({name:'Baskı-Montaj',cols:RC.is,rows:d.baski});
  if(document.getElementById('r_is').checked)    S.push({name:'İş Takibi',cols:RC.is,rows:d.tumIs});
  if(document.getElementById('r_dol').checked)   S.push({name:'Doluluk Detay',cols:RC.dol,rows:d.dolRows});
  if(document.getElementById('r_ozet').checked)  S.push({name:'Doluluk Özet',cols:RC.ozet,rows:d.ozetRows});
  if(document.getElementById('r_teklif').checked)S.push({name:'Teklifler',cols:RC.q,rows:d.qrows});
  return S;
}
async function rapOnizle(){
  const out=document.getElementById('rapOut'); out.innerHTML='<p class="muted" style="margin-top:14px">Hazırlanıyor…</p>';
  const d=await rapVeri(); if(!d){ out.innerHTML=''; return; }
  const S=rapSecim(d);
  if(!S.length){ out.innerHTML='<div class="banner" style="margin-top:14px">En az bir bölüm seçin.</div>'; return; }
  out.innerHTML=`<div class="rp-prev"><div class="imp-info">${d.b} – ${d.e} · ${d.ayAdet} ay kapsanıyor</div>
    ${S.map(x=>`<div class="rp-line"><b>${esc(x.name)}</b><span>${x.rows.length} satır</span></div>`).join('')}
    ${S.every(x=>!x.rows.length)?'<div class="imp-warn">Bu aralıkta kayıt bulunamadı.</div>':''}</div>`;
}
async function rapUret(){
  const out=document.getElementById('rapOut'); out.innerHTML='<p class="muted" style="margin-top:14px">Rapor hazırlanıyor…</p>';
  const d=await rapVeri(); if(!d){ out.innerHTML=''; return; }
  const S=rapSecim(d);
  if(!S.length){ out.innerHTML='<div class="banner" style="margin-top:14px">En az bir bölüm seçin.</div>'; return; }
  const n=await exportSheets('medyapark-rapor-'+d.b+'_'+d.e, S);
  out.innerHTML=n?`<div class="imp-info" style="margin-top:14px">Rapor indirildi · ${S.filter(x=>x.rows.length).length} sayfa, ${n} satır</div>`:'';
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
async function loadUnitCal(uid){ try{ const bk=await api('booking_list&unit_id='+uid); const map={}; bk.forEach(b=>map[b.ym]=b.status);
  calData[uid]={map, y:new Date().getFullYear()}; drawUnitCal(uid); }catch(e){} }
function drawUnitCal(uid){ const box=document.getElementById('cal-'+uid); if(!box)return; const st=calData[uid]; const y=st.y;
  const cells=MONTHS_SHORT.map((mo,i)=>{ const ym=y+'-'+pad(i+1), s=st.map[ym]||'bos';
    return `<div class="ycell sm ${s}" onclick="cycleMonth(${uid},'${ym}')"><span class="ml">${mo}</span><span class="ms">${s==='dolu'?'Dolu':s==='rezerve'?'Rez':'Boş'}</span></div>`; }).join('');
  box.innerHTML=`<div class="year-nav"><button onclick="calMove(${uid},-1)">‹</button><span class="yr">${y}</span><button onclick="calMove(${uid},1)">›</button></div><div class="year-strip">${cells}</div>`;
}
function calMove(uid,d){ calData[uid].y+=d; drawUnitCal(uid); }
async function cycleMonth(uid,ym){ const st=calData[uid]; const cur=st.map[ym]; const next=cur==='dolu'?'rezerve':(cur==='rezerve'?'bos':'dolu');
  if(next==='bos')delete st.map[ym]; else st.map[ym]=next; drawUnitCal(uid); await api('booking_toggle',{unit_id:uid,ym,status:next}); }


/* ---------- HARİTA (konum işaretleme) ---------- */
let hMap=null, hCluster=null, hMarker=null, hRows=[], hSel=null, hQ='';
async function harita(c){
  const st=await api('settings_get'); ui._settings=st;
  const [al,un]=await Promise.all([
    sb.from('alt_mecralar').select('*').order('sort').order('id'),
    sb.from('units').select('*').order('sort').order('id')
  ]);
  const mecs=ui._mecralar||await api('mecra_list'); ui._mecralar=mecs;
  const altById={}; (al.data||[]).forEach(a=>altById[a.id]=a);
  const mecById={}; mecs.forEach(m=>mecById[m.id]=m);
  hRows=(un.data||[]).map(u=>{ const a=altById[u.alt_mecra_id]||{}; const m=mecById[a.mecra_id||u.mecra_id]||{};
    return {id:u.id,unit:u.name||'(pozisyon)',alt:a.name||'—',mec:m.name||'—',theme:m.theme_color||'#0071e3',
            mecId:a.mecra_id||u.mecra_id||0,altId:u.alt_mecra_id||0,mecSort:m.sort||0,altSort:a.sort||0,
            lat:u.lat,lng:u.lng,konum:u.konum||''}; });
  const yes=hRows.filter(r=>r.lat!=null&&r.lng!=null).length;

  /* Harita: sayfa metni CMS'i, Google Maps anahtarı ve koordinat
     işaretleme mutation'dır — admin'e kapalı. Pozisyon listesi + harita
     (pinler, arama, hover) salt okuma context'i olarak team_member'a
     da açık kalır (parity audit S1 §4). */
  c.innerHTML=`
  ${isAdmin()?`<div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Harita Sayfası Metinleri</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Header'daki <b>Maps</b> butonuyla açılan sayfanın başlığı ve açıklaması.</p>
    <div class="field"><label class="flabel">Sayfa başlığı</label><input class="inp" id="mapTitle" value="${esc(st.mapTitle||'')}" placeholder="Reklam Alanlarımız — Adana Haritası"></div>
    <div class="field"><label class="flabel">Açıklama</label><textarea class="inp" id="mapDesc" placeholder="Kısa tanıtım metni…">${esc(st.mapDesc||'')}</textarea></div>
    <div class="field"><label class="flabel">Kapak görseli (sayfa üstü şerit)</label><div style="display:flex;gap:8px"><input class="inp" id="mapKapak" value="${esc(st.mapKapak||'')}"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('mapKapak').value=u;})">Yükle</button></div></div>
    <button class="btn btn-primary btn-sm" onclick="saveMapTexts()">Kaydet</button></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Google Maps Anahtarı</h3>
    <p class="muted" style="font-size:13px;margin:0 0 12px">Buraya bir Google Maps API anahtarı yazarsanız site haritası <b>Google Maps</b> ile çalışır (uydu görünümü, Street View, tanıdık arayüz). Boş bırakırsanız ücretsiz OpenStreetMap kullanılır — özellikler aynıdır.
      <br><b>Önemli:</b> Google Cloud'da anahtara mutlaka “HTTP yönlendiren” kısıtı koyun (yalnızca kendi alan adınız) ve günlük kota sınırı tanımlayın; aksi halde anahtarınız başkalarınca kullanılabilir.</p>
    <div class="field"><label class="flabel">API anahtarı</label><input class="inp" id="gmKey" value="${esc(st.googleMapsKey||'')}" placeholder="AIza… (boş = OpenStreetMap)"></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="saveGmKey()">Kaydet</button>
      <span class="muted" style="font-size:12.5px">Şu anki motor: <b>${st.googleMapsKey?'Google Maps':'OpenStreetMap (ücretsiz)'}</b></span></div></div>`:''}

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">${isAdmin()?'Konum İşaretleme':'Konumlar'}</h3>
    <p class="muted" style="font-size:13px;margin:0 0 14px">${isAdmin()
      ?'Soldan bir pozisyon seçin, sonra <b>haritaya tıklayarak</b> yerini işaretleyin ve kaydedin. Kaydedince liste otomatik olarak <b>sıradaki işaretsiz pozisyona</b> geçer; aynı direğin A/B yüzeyleri için tek işaretleme yeter.<br>İşaretli konumlar sitedeki harita sayfasında pin olarak çıkar; yakın olanlar otomatik gruplanır.<br>'
      :'Soldan bir pozisyon seçin veya haritadaki pinlere tıklayın; konum işaretleme mecra yetkisindedir (BR-M03).<br>'}<b id="hCount">${yes}</b> / ${hRows.length} pozisyonun konumu işaretli.</p>
    <div class="hmap-grid">
      <div class="hmap-side">
        <input class="inp" id="hSearch" placeholder="Pozisyon / mecra ara…" oninput="hFilter(this.value)" style="margin-bottom:10px">
        <div id="hList" class="hlist"></div>
      </div>
      <div>
        <div id="hMapNote" class="banner" style="display:none;margin-bottom:10px"></div>
        ${isAdmin()?`<div class="hbar">
          <input class="inp" id="hGeo" placeholder="Adres / yer ara — ör. M1 Adana AVM" onkeydown="if(event.key==='Enter'){event.preventDefault();hGeoSearch()}">
          <button class="btn btn-outline btn-sm" onclick="hGeoSearch()">Bul</button>
          <input class="inp" id="hPaste" placeholder="Koordinat veya Maps linki yapıştır" onkeydown="if(event.key==='Enter'){event.preventDefault();hPasteCoord()}">
          <button class="btn btn-outline btn-sm" onclick="hPasteCoord()">Uygula</button>
        </div>
        <div id="hGeoRes" class="hgeores" style="display:none"></div>`:''}
        <div id="hSelBar" class="hselbar">${isAdmin()?'Önce soldan bir pozisyon seçin.':'Bir pozisyon seçin.'}</div>
        <div id="hMapCanvas" class="hmap"></div>
      </div>
    </div></div>`;
  hRenderList();
  setTimeout(hInitMap,80);
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
function hFilter(q){ hQ=(q||'').toLowerCase(); hRenderList(); }
function hGrupAcik(){ if(!ui._hOpen) ui._hOpen={}; return ui._hOpen; }
function hGrupTog(k){ const o=hGrupAcik(); o[k]=!(o[k]!==false); if(o[k]===true)delete o[k]; else o[k]=false; hRenderList(); }
function hGrupHepsi(ac){ const o=hGrupAcik(); Object.keys(o).forEach(k=>delete o[k]); if(!ac){ hRows.forEach(r=>{ o['m'+r.mecId]=false; }); } hRenderList(); }
function hRenderList(){ const box=document.getElementById('hList'); if(!box)return;
  const cn=document.getElementById('hCount');
  if(cn) cn.textContent=hRows.filter(r=>r.lat!=null&&r.lng!=null).length;
  const list=hRows.filter(r=>!hQ||[r.unit,r.alt,r.mec,r.konum].some(x=>String(x||'').toLowerCase().includes(hQ)));
  if(!list.length){ box.innerHTML='<p class="muted" style="font-size:13px;padding:8px">Sonuç yok.</p>'; return; }
  const acik=hGrupAcik(); const aramaVar=!!hQ;
  /* mecra → alan → pozisyon */
  const mecs=new Map();
  list.forEach(r=>{ if(!mecs.has(r.mecId)) mecs.set(r.mecId,{ad:r.mec,theme:r.theme,sort:r.mecSort,alts:new Map()});
    const M=mecs.get(r.mecId); if(!M.alts.has(r.altId)) M.alts.set(r.altId,{ad:r.alt,sort:r.altSort,rows:[]}); M.alts.get(r.altId).rows.push(r); });
  const sayac=rows=>{ const ok=rows.filter(r=>r.lat!=null&&r.lng!=null).length; return `<span class="hsay ${ok===rows.length?'tam':(ok?'yari':'')}">${ok}/${rows.length}</span>`; };
  let html='';
  [...mecs.entries()].sort((x,y)=>(x[1].sort-y[1].sort)||x[1].ad.localeCompare(y[1].ad,'tr')).forEach(([mid,M])=>{
    const tum=[...M.alts.values()].flatMap(A=>A.rows);
    const mOpen=aramaVar||acik['m'+mid]!==false;
    html+=`<div class="hg ${mOpen?'open':''}"><button class="hg-h" onclick="hGrupTog('m${mid}')"><i class="hdot" style="background:${M.theme}"></i><b>${esc(M.ad)}</b>${sayac(tum)}<em class="chev"></em></button>`;
    if(mOpen){
      [...M.alts.entries()].sort((x,y)=>(x[1].sort-y[1].sort)||x[1].ad.localeCompare(y[1].ad,'tr')).forEach(([aid,A])=>{
        const aOpen=aramaVar||acik['a'+aid]!==false;
        html+=`<div class="hga ${aOpen?'open':''}"><button class="hga-h" onclick="hGrupTog('a${aid}')"><span>${esc(A.ad)}</span>${sayac(A.rows)}<em class="chev"></em></button>`;
        if(aOpen) html+=A.rows.map(r=>{ const ok=r.lat!=null&&r.lng!=null;
          return `<div class="hrow ${hSel===r.id?'on':''}" onclick="hPick(${r.id})"><span class="hdot" style="background:${ok?r.theme:'#d2d2d7'}"></span>
            <div class="hnm"><b>${esc(r.unit)}</b>${r.konum?`<span>${esc(r.konum)}</span>`:''}</div><span class="hst">${ok?'✓':'—'}</span></div>`;}).join('');
        html+=`</div>`; });
    }
    html+=`</div>`; });
  box.innerHTML=`<div class="hg-tools"><button onclick="hGrupHepsi(true)">Tümünü aç</button><span>·</span><button onclick="hGrupHepsi(false)">Tümünü kapat</button></div>`+html;
}
/* Google Maps yükleyici (anahtar Ayarlar > Harita bölümünden) */
let hGoogleLoading=null, hEngine='leaflet', hgMap=null, hgMarkers=[], hgSel=null;
function hLoadGoogle(key){
  if(hGoogleLoading) return hGoogleLoading;
  hGoogleLoading=new Promise((res,rej)=>{
    if(window.google&&window.google.maps) return res();
    const t=setTimeout(()=>rej(new Error('zaman asimi')),15000);
    window.gm_authFailure=()=>{ clearTimeout(t); rej(new Error('anahtar reddedildi')); };
    window.__gmPanelReady=()=>{ clearTimeout(t); res(); };
    const g=document.createElement('script'); g.async=true;
    g.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&callback=__gmPanelReady&language=tr&region=TR';
    g.onerror=()=>{ clearTimeout(t); rej(new Error('yuklenemedi')); };
    document.head.appendChild(g);
  });
  return hGoogleLoading;
}
function hInitMap(){
  const el=document.getElementById('hMapCanvas'); if(!el)return;
  const key=String((ui._settings||{}).googleMapsKey||'').trim();
  if(key){
    hLoadGoogle(key).then(()=>hInitGoogle())
      .catch(err=>{ console.warn('Panel Google Maps:',err.message);
        const n=document.getElementById('hMapNote');
        if(n){ n.textContent='Google Maps yüklenemedi ('+err.message+') — OpenStreetMap kullanılıyor.'; n.style.display='block'; }
        hInitLeaflet(); });
  } else hInitLeaflet();
}
function hInitGoogle(){
  hEngine='google';
  hgMap=new google.maps.Map(document.getElementById('hMapCanvas'),{
    center:{lat:37.0000,lng:35.3213}, zoom:12, mapTypeId:'hybrid',
    mapTypeControl:true, streetViewControl:true, fullscreenControl:true, tilt:0});
  hgMap.addListener('click',e=>{
    if(!isAdmin())return;   /* konum işaretleme mutation'dır (parity audit S1 §4) */
    if(hSel==null){ mpAlert('Önce soldaki listeden bir pozisyon seçin.'); return; }
    hPlace(e.latLng.lat(), e.latLng.lng());
  });
  hDrawAll(); 
}
function hInitLeaflet(){
  const el=document.getElementById('hMapCanvas');
  if(typeof L==='undefined'){ el.innerHTML='<p class="muted" style="padding:20px">Harita yüklenemedi. Sayfayı yenileyin.</p>'; return; }
  hEngine='leaflet';
  hMap=L.map('hMapCanvas').setView([37.0000,35.3213],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(hMap);
  hCluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:50});
  hMap.addLayer(hCluster);
  hMap.on('click',e=>{ if(!isAdmin())return; if(hSel==null){ mpAlert('Önce soldaki listeden bir pozisyon seçin.'); return; } hPlace(e.latlng.lat,e.latlng.lng); });
  hDrawAll(); setTimeout(()=>hMap.invalidateSize(),200);
}
function hDrawAll(){
  const list=hRows.filter(r=>r.lat!=null&&r.lng!=null&&r.id!==hSel);
  if(hEngine==='google'){
    if(!hgMap)return;
    hgMarkers.forEach(m=>m.setMap(null)); hgMarkers=[];
    hgMarkers=list.map(r=>{ const mk=new google.maps.Marker({position:{lat:+r.lat,lng:+r.lng},map:hgMap,
        title:r.mec+' · '+r.unit, icon:{path:google.maps.SymbolPath.CIRCLE,scale:7,
        fillColor:r.theme,fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
      mk.addListener('click',()=>hPick(r.id)); return mk; });
    return;
  }
  if(!hCluster)return; hCluster.clearLayers();
  hCluster.addLayers(list.map(r=>L.marker([r.lat,r.lng],{title:r.mec+' · '+r.unit})
    .bindPopup(`<b>${esc(r.unit)}</b><br>${esc(r.mec)} › ${esc(r.alt)}`)));
}
function hPick(id){ hSel=id; hRenderList(); const r=hRows.find(x=>x.id===id); if(!r)return;
  const bar=document.getElementById('hSelBar');
  bar.innerHTML=`<b>${esc(r.unit)}</b> <span class="muted">— ${esc(r.mec)} › ${esc(r.alt)}</span>
    <span class="hcoord" id="hCoord">${r.lat!=null?(+r.lat).toFixed(6)+', '+(+r.lng).toFixed(6):'konum yok'}</span>
    ${isAdmin()?`<button class="btn btn-primary btn-sm" onclick="hSave()">Konumu Kaydet</button>
    ${r.lat!=null?`<button class="btn btn-danger btn-sm" onclick="hClear()">Konumu Sil</button>`:''}`:''}`;
  hDrawAll();
  if(hEngine==='google'){
    if(hgSel){ hgSel.setMap(null); hgSel=null; }
    if(r.lat!=null&&r.lng!=null){ hPlace(r.lat,r.lng,true); hgMap.panTo({lat:+r.lat,lng:+r.lng}); hgMap.setZoom(18); }
    return;
  }
  if(hMarker){ hMap.removeLayer(hMarker); hMarker=null; }
  if(r.lat!=null&&r.lng!=null){ hPlace(r.lat,r.lng,true); hMap.setView([r.lat,r.lng],16); }
}
function hPlace(lat,lng,quiet){
  if(hEngine==='google'){
    if(hgSel) hgSel.setMap(null);
    hgSel=new google.maps.Marker({position:{lat:+lat,lng:+lng},map:hgMap,draggable:true,
      icon:{path:google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,scale:6,fillColor:'#3455e6',fillOpacity:1,strokeColor:'#fff',strokeWeight:2}});
    hgSel.addListener('dragend',()=>{ const p=hgSel.getPosition(); hSetCoordText(p.lat(),p.lng()); });
    hSetCoordText(lat,lng);
    if(!quiet) hgMap.panTo({lat:+lat,lng:+lng});
    return;
  }
  if(hMarker) hMap.removeLayer(hMarker);
  hMarker=L.marker([lat,lng],{draggable:true}).addTo(hMap);
  hMarker.on('dragend',()=>{ const p=hMarker.getLatLng(); hSetCoordText(p.lat,p.lng); });
  hSetCoordText(lat,lng);
  if(!quiet) hMap.panTo([lat,lng]);
}
function hSetCoordText(lat,lng){ const el=document.getElementById('hCoord'); if(el)el.textContent=(+lat).toFixed(6)+', '+(+lng).toFixed(6); }
async function hSave(){
  const has = hEngine==='google' ? !!hgSel : !!hMarker;
  if(hSel==null||!has){ mpAlert('Haritaya tıklayarak konumu işaretleyin.'); return; }
  const p = hEngine==='google' ? {lat:hgSel.getPosition().lat(), lng:hgSel.getPosition().lng()} : hMarker.getLatLng();
  await api('unit_save',{id:hSel,lat:p.lat,lng:p.lng});
  const r=hRows.find(x=>x.id===hSel); if(r){ r.lat=p.lat; r.lng=p.lng; }
  let msg='Konum kaydedildi.';
  const tw=hTwins(r);
  if(tw.length && await mpConfirm(r.unit+' kaydedildi. Aynı yapının diğer yüzü olan '+tw.map(t=>t.unit).join(', ')+' için de aynı konum kullanılsın mı?','Diğer Yüz',{danger:false,ok:'Evet, Kullan'})){
    for(const t of tw){ await api('unit_save',{id:t.id,lat:p.lat,lng:p.lng}); t.lat=p.lat; t.lng=p.lng; }
    msg='Konum kaydedildi — '+(tw.length+1)+' yüzey.';
  }
  hRenderList(); hDrawAll();
  if(typeof toast==='function') toast(msg); else mpAlert(msg);
  hNext();
}
/* Aynı direğin A/B yüzeyleri: P1-A ile P1-B gibi. Yalnız A/B eki + ayraç ya da rakam şartı aranır,
   böylece "Megaboard" gibi 'd' ile biten adlar yanlışlıkla eşleşmez. */
function hAB(nm){
  const m=String(nm||'').match(/^(.*?)([-_ ])?([ABab])$/);
  if(!m) return null;
  if(!m[2] && !/[0-9]$/.test(m[1])) return null;
  return m[1].replace(/[-_ ]+$/,'').toLowerCase();
}
function hTwins(r){
  if(!r) return [];
  const key=hAB(r.unit); if(!key) return [];
  return hRows.filter(x=> x.id!==r.id && x.alt===r.alt && x.lat==null && hAB(x.unit)===key );
}
function hVisible(){
  return hRows.filter(r=>!hQ||[r.unit,r.alt,r.mec,r.konum].some(x=>String(x||'').toLowerCase().includes(hQ)));
}
function hNext(){
  const list=hVisible();
  const i=list.findIndex(r=>r.id===hSel);
  const nx=list.slice(i+1).find(r=>r.lat==null) || list.find(r=>r.lat==null);
  if(nx && nx.id!==hSel) hPick(nx.id);
}
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
  if(hSel==null){ mpAlert('Önce soldan bir pozisyon seçin.'); return; }
  const p=hParseLL(gv('hPaste'));
  if(!p){ mpAlert('Koordinat okunamadı.\n\nÖrnek: 37.015902, 35.249627\nveya Google Maps adres çubuğundaki linkin tamamı.\n\nNot: maps.app.goo.gl ile başlayan kısa linkler koordinat içermez; linki tarayıcıda açıp adres çubuğundakini kopyalayın.'); return; }
  hPlace(p.lat,p.lng); hFly(p.lat,p.lng,18);
}
async function hClear(){
  if(hSel==null)return; if(!await mpConfirm('Bu pozisyonun konumu silinsin mi?','Konumu Sil'))return;
  await api('unit_save',{id:hSel,lat:null,lng:null});
  const r=hRows.find(x=>x.id===hSel); if(r){ r.lat=null; r.lng=null; }
  if(hEngine==='google'){ if(hgSel){hgSel.setMap(null);hgSel=null;} }
  else if(hMarker){ hMap.removeLayer(hMarker); hMarker=null; }
  hRenderList(); hDrawAll(); hPick(hSel);
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

/* ============ PS4 — DOLULUK BUGÜN / NE ZAMAN BOŞALIYOR ==============
   `ym` ile `period_start/period_end` BİRBİRİNİN YERİNE GEÇMEZ (§6):
     ym        -> aylık doluluk kovası (uygunluk gerçeği)
     period_*  -> gerçek iş dönemi (bağlam gerçeği), biliniyorsa

   Bu yüzden iki farklı KESİNLİK seviyesi vardır ve UI bunları aynıymış
   gibi sunmaz (§11): gün bilgisi yalnızca gerçek tarih varsa verilir,
   yoksa dürüstçe ay seviyesinde kalınır. `ym`den gün üretilmez. */
const _bIso=d=>{const t=new Date(d);return new Date(t.getTime()-t.getTimezoneOffset()*6e4).toISOString().slice(0,10);};
const AY_ADI=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function ymAdi(ym){ if(!ym) return ''; const [y,m]=String(ym).split('-'); return `${AY_ADI[+m-1]} ${y}`; }
function ymBugun(){ const n=new Date(); return n.getFullYear()+'-'+pad(n.getMonth()+1); }
/* Bu yardımcılar İKİ farklı satır şekliyle çağrılır: ham `bookings` satırı
   (period_start/…) ve Doluluk'un bmap önbelleği (ps/pe/pn). Tek bir
   normalleştirici, her çağıranın kendi alan adını bilmek zorunda kalmasını
   önler — aksi halde biri sessizce "tarih yok" sanır. */
function bookPer(b){
  if(!b) return {ps:null,pe:null,pn:null,ym:null,st:null};
  return {ps:b.period_start||b.ps||null, pe:b.period_end||b.pe||null,
          pn:b.period_note||b.pn||null,  ym:b.ym||null, st:b.status||b.s||null};
}

/* Bir booking satırı BUGÜN aktif mi?
   kesinlik: 'gun'  -> gerçek tarihlerle belirlendi
             'ay'   -> yalnız aylık kova ile belirlendi (gün bilgisi YOK)  */
function bookAktif(b){
  if(!b) return {aktif:false,kesinlik:null};
  const q=bookPer(b), t=_bIso(new Date());
  if(q.ps){
    if(q.ps>t) return {aktif:false,kesinlik:'gun',durum:'gelecek'};
    if(q.pe && q.pe<t) return {aktif:false,kesinlik:'gun',durum:'gecmis'};
    return {aktif:true,kesinlik:'gun',acikUclu:!q.pe};
  }
  /* Tarih yoksa yalnız ay karşılaştırılır — uydurma gün üretilmez. */
  return {aktif:String(q.ym)===ymBugun(), kesinlik:'ay'};
}

/* "Ne zaman boşalıyor?" — yalnız bilinenden konuşur (§12). */
function bookBosalma(b){
  if(!b) return '';
  const q=bookPer(b);
  if(q.pe){
    const d=new Date(q.pe+'T00:00:00'); d.setDate(d.getDate()+1);
    return `${d.getDate()} ${AY_ADI[d.getMonth()]}'de boş`;
  }
  if(q.ps) return 'Bitiş bilinmiyor';
  /* Yalnız aylık kayıt: ay seviyesinde konuş, gün UYDURMA. */
  return q.ym?`${ymAdi(q.ym)} sonuna kadar dolu`:'';
}

/* Dönem metni: gerçek tarihler varsa onlar, yoksa ham kaynak ifade
   (ör. "20.09.2025 - ?" ya da "01.02. / 31.03.2026 2 AY") gösterilir —
   iki tarih kolonunun taşıyamadığı bilgi kaybolmasın diye (§5). */
function bookDonem(b){
  if(!b) return '';
  const q=bookPer(b);
  const g=d=>{ const x=new Date(d+'T00:00:00'); return `${String(x.getDate()).padStart(2,'0')}.${String(x.getMonth()+1).padStart(2,'0')}`; };
  if(q.ps&&q.pe) return `${g(q.ps)}–${g(q.pe)}`;
  if(q.ps) return `${g(q.ps)}–?`;
  if(q.pe) return `?–${g(q.pe)}`;
  return q.pn||'';
}
function lCell(u,ym,cmap,bmap,solo){
  if(!u) return `<span class="rcell yok" title="Bu yüzey tanımlı değil">–</span>`;
  const rec=(bmap[u.id]||{})[ym]; const st=rec?rec.s:'bos';
  const who=rec&&rec.c?(cmap[rec.c]||''):'';
  const surf=posParts(u.name).surf;
  const kod = who? String(who).trim().slice(0,3).toLocaleUpperCase('tr') : (solo?'':surf);
  /* Doluluk hücresi tıklaması rezervasyon/durum/müşteri mutation'ına
     açılan tek giriş noktasıdır (rezAc -> rezCiz). team_member için
     kapalı; hover bilgi kartı (salt okuma) her iki rol için de açık
     kalır (parity audit S1 §3/§9). */
  const tik=isAdmin()?` onclick="rezAc(${u.id},'${ym}',event)"`:'';
  return `<span class="rcell ${st}${isAdmin()?'':' ro'}" data-u="${u.id}" data-ym="${ym}" data-surf="${surf}"${tik}
    onmouseenter="lTip(this)" onmouseleave="lTipHide()"><i>${esc(kod)}</i></span>`;
}

/* ---- üzerine gelince bilgi kartı ---- */
let _tipEl=null;
function lTip(el){
  const uid=el.dataset.u, ym=el.dataset.ym;
  const rec=(window.__lbmap[uid]||{})[ym]; const st=rec?rec.s:'bos';
  const who=rec&&rec.c?(window.__lcmap[rec.c]||''):'';
  const u=(window.__lumap||{})[uid]||{};
  const durum= st==='dolu'?'Dolu':(st==='rezerve'?'Rezerve':'Boş');
  const ay=MONTHS_LONG_TR[+ym.slice(5,7)-1]+' '+ym.slice(0,4);
  const yz=el.dataset.surf==='A'?'A yüzey (ön yüz)':'B yüzey (arka yüz)';
  if(!_tipEl){ _tipEl=document.createElement('div'); _tipEl.className='rtip'; document.body.appendChild(_tipEl); }
  _tipEl.innerHTML=`<div class="rtip-t">${esc(u.name||'')} · ${esc(yz)}</div>
    <div class="rtip-r"><span>Dönem</span><b>${esc(ay)}</b></div>
    <div class="rtip-r"><span>Durum</span><b class="st-${st}">${durum}</b></div>
    ${who?`<div class="rtip-r"><span>Kiralayan</span><b>${esc(who)}</b></div>`:''}
    ${rec&&rec.n?`<div class="rtip-n">${esc(rec.n)}</div>`:''}`;
  const b=el.getBoundingClientRect();
  _tipEl.style.display='block';
  const tw=_tipEl.offsetWidth, th=_tipEl.offsetHeight;
  let left=b.left+b.width/2-tw/2; left=Math.max(8,Math.min(left,window.innerWidth-tw-8));
  let top=b.top-th-10; if(top<8) top=b.bottom+10;
  _tipEl.style.left=left+'px'; _tipEl.style.top=top+'px';
}
function lTipHide(){ if(_tipEl)_tipEl.style.display='none'; }
const MONTHS_LONG_TR=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];


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
async function bookExport(){
  const y=ui._lyear||new Date().getFullYear();
  const [mc,al,un,bk,cu]=await Promise.all([
    api('mecra_list'), sb.from('alt_mecralar').select('*'), sb.from('units').select('*').order('sort').order('id'),
    sb.from('bookings').select('*').like('ym',y+'-%'), api('customers_list')]);
  const alt={}; (al.data||[]).forEach(a=>alt[a.id]=a);
  const mm={}; mc.forEach(m=>mm[m.id]=m);
  const cus={}; cu.forEach(c=>cus[c.id]=c.firma);
  const bmap={}; (bk.data||[]).forEach(b=>{(bmap[b.unit_id]=bmap[b.unit_id]||{})[b.ym]={s:b.status,c:b.customer_id,n:b.note,
      ym:b.ym,ps:b.period_start,pe:b.period_end,pn:b.period_note,wid:b.work_id};});
  const rows=[];
  (un.data||[]).forEach(u=>{
    const a=alt[u.alt_mecra_id]||{}; const m=mm[a.mecra_id||u.mecra_id]||{};
    const p=posParts(u.name);
    for(let i=1;i<=12;i++){
      const ym=y+'-'+String(i).padStart(2,'0'); const r=(bmap[u.id]||{})[ym];
      rows.push({mecra:m.name||'',alt:a.name||'',pozisyon:p.base,yuzey:p.surf,ay:ym,
        durum:r?(r.s==='dolu'?'Dolu':'Rezerve'):'Boş',firma:r&&r.c?(cus[r.c]||''):'',
        /* Gerçek dönem AYRI sütunlarda; `ay` ile karıştırılmaz (§6/§18). */
        ps:r&&r.ps?r.ps:'', pe:r&&r.pe?r.pe:'', pnot:r&&r.pn?r.pn:'',
        bosalma:r?bookBosalma(r):'', not:r&&r.n?r.n:''});
    }
  });
  if(!rows.length){ mpAlert('Aktarılacak kayıt yok.'); return; }
  await exportRows('doluluk-'+y,'Doluluk '+y,[
    {key:'mecra',label:'Mecra',w:24},{key:'alt',label:'Alt Mecra',w:22},
    {key:'pozisyon',label:'Pozisyon',w:14},{key:'yuzey',label:'Yüzey',w:8},
    {key:'ay',label:'Ay',w:10},{key:'durum',label:'Durum',w:10},
    {key:'firma',label:'Firma',w:26},
    {key:'ps',label:'Dönem başlangıç',w:16},{key:'pe',label:'Dönem bitiş',w:16},
    {key:'pnot',label:'Kaynak dönem ifadesi',w:28},
    {key:'bosalma',label:'Ne zaman boşalıyor',w:24},
    {key:'not',label:'Not',w:30}],rows,[
    ['İş dönemi', y+' yılı aylık doluluk'],
    ['Kapsam','Tüm pozisyonlar (12 ay)'],
    ['Not','`Ay` aylık doluluk kovasıdır; `Dönem başlangıç/bitiş` gerçek iş dönemidir. Aynı değildirler.']]);
}
function bookImport(){
  const y=ui._lyear||new Date().getFullYear();
  importOpen({
    title:'Doluluk Verisini Excel\'den Al',
    hint:`Her satır bir pozisyon-ay kaydıdır. Pozisyon "P1-A" gibi tek sütunda olabilir ya da Pozisyon + Yüzey ayrı sütunlarda. Ay boşsa ${y} varsayılır.`,
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
        await api('booking_toggle',{unit_id:uid,ym,status:st,customer_id:cid,note:r.not||null});
        ok++;
      }
      let msg=`Tamamlandı.\n${ok} kayıt işlendi.\n${atla} satır atlandı.`;
      if(hatalar.length) msg+=`\n\n${hatalar.length} satır aktarılamadı:\n`+hatalar.slice(0,12).join('\n')+(hatalar.length>12?`\n… ve ${hatalar.length-12} tane daha`:'');
      return msg;
    }});
}

/* ---------- LİSTELER ---------- */
async function listeler(c){
  if(!ui._lyear) ui._lyear=new Date().getFullYear();
  const y=ui._lyear;
  const [mlist,alts,prods,custs,bks]=await Promise.all([api('mecra_list'),api('alt_all'),api('products_list'),api('customers_list'),api('bookings_all')]);
  const cmap={}; custs.forEach(x=>cmap[x.id]=x.firma||('#'+x.id)); window.__lcmap=cmap;
  const pmap={}; prods.forEach(p=>pmap[p.id]=p.name);
  const uByAlt={}; mlist.forEach(m=>(m.units||[]).forEach(u=>{ if(u.alt_mecra_id!=null)(uByAlt[u.alt_mecra_id]=uByAlt[u.alt_mecra_id]||[]).push(u); }));
  const altByMec={}; alts.forEach(a=>(altByMec[a.mecra_id]=altByMec[a.mecra_id]||[]).push(a));
  const bmap={}; bks.forEach(b=>{(bmap[b.unit_id]=bmap[b.unit_id]||{})[b.ym]={s:b.status,c:b.customer_id,n:b.note,
      ym:b.ym,ps:b.period_start,pe:b.period_end,pn:b.period_note,wid:b.work_id};}); window.__lbmap=bmap;
  const umap={}; mlist.forEach(m=>(m.units||[]).forEach(u=>umap[u.id]=u)); window.__lumap=umap;
  ui._L={mlist,altByMec,uByAlt,pmap,cmap,custs,y};
  ui._veriOkunma=new Date();                 /* PS4 §20 — veri okunma anı */

  const custOpts=custs.map(x=>`<option value="${x.id}">${esc(x.firma||('#'+x.id))}</option>`).join('');
  const mecOpts=mlist.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  /* S2 §11/§12 — keşfedilebilirlik.
     LED ekranlar envanterde VARDI ama bulunabilir değildi: onlara ulaşmak
     için ya "M1 Adana LED" alt mecrasını ya da "P3-A" gibi bir pozisyon
     kodunu önceden bilmek gerekiyordu. Ürün (mecra türü) zaten her
     `units.product_id` üzerinde duruyor; tek eksik onu süzebilmekti.
     Yeni tablo YOK, Team'e özel medya çatalı YOK - aynı paylaşılan
     renderer'a bir filtre eklendi. */
  const urunSay={}; mlist.forEach(m=>(m.units||[]).forEach(u=>{
    if(u.product_id!=null) urunSay[u.product_id]=(urunSay[u.product_id]||0)+1; }));
  const prodOpts=prods.filter(p=>urunSay[p.id])
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),'tr'))
    .map(p=>`<option value="${p.id}">${esc(p.name)} (${urunSay[p.id]})</option>`).join('');
  /* Excel içe aktarma değişiklik yazan bir mutation'dır; team_member'a
     kapalı. Dışa aktarma salt okuma/rapor işlemidir, her iki role de
     açık kalır (parity audit S1 §3). */
  c.innerHTML=`<div class="sec-head"><h3>Doluluk / Kiralama</h3>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="bookExport()">${ic('download',15)} Excel'e Aktar</button>
      ${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="bookImport()">${ic('upload',15)} Excel'den Al</button>`:''}
      <div class="ws-switch inline" role="group" aria-label="Doluluk görünümü">
        <button type="button" class="${lGorunum()==='bugun'?'on':''}" aria-pressed="${lGorunum()==='bugun'}"
          onclick="lGorunumSec('bugun')">Bugün</button>
        <button type="button" class="${lGorunum()==='yil'?'on':''}" aria-pressed="${lGorunum()==='yil'}"
          onclick="lGorunumSec('yil')">Yıl ızgarası</button>
      </div>
      <div class="year-nav" style="margin:0" ${lGorunum()==='bugun'?'hidden':''}><button onclick="lYear(-1)">‹</button><span class="yr">${y}</span><button onclick="lYear(1)">›</button></div>
    </div></div>
    ${lTazeBar()}
    <div class="banner">${isAdmin()
      ?'Aya tıklayın: açılan pencereden <b>durumu seçin</b> (Boş / Dolu / Rezerve), <b>müşteri atayın</b> ya da oracıkta <b>yeni müşteri ekleyin</b> — eklenen müşteri, Müşteriler bölümünde de oluşur. Çift yüzlü pozisyonlarda (M1 megalight ve raketleri) her ayın altında iki kutu vardır: soldaki A (ön yüz), sağdaki B (arka yüz). Ziyaretçi firma adını görmez, yalnızca durumu görür.'
      :'Bu görünüm salt okunurdur; durum/müşteri/pozisyon değişikliği mecra yetkisindedir (BR-M03). Çift yüzlü pozisyonlarda (M1 megalight ve raketleri) her ayın altında iki kutu vardır: soldaki A (ön yüz), sağdaki B (arka yüz).'}</div>
    <div class="sec-card fbar">
      <div class="fbar-row">
        <input class="inp" id="lQ" placeholder="Ara: pozisyon, alan, mecra veya kiralayan firma…" oninput="lFiltre()">
        <select class="inp" id="lFm" onchange="lFiltre()"><option value="">Tüm mecralar</option>${mecOpts}</select>
        <select class="inp" id="lFd" onchange="lFiltre()">
          <option value="">Tüm durumlar</option>
          <option value="dolu">Dolu ayı olanlar</option>
          <option value="rezerve">Rezerve ayı olanlar</option>
          <option value="doluveya">Dolu veya rezerve</option>
          <option value="bos">Tamamen boş (${y})</option></select>
        <select class="inp" id="lFp" onchange="lFiltre()"><option value="">Tüm mecra türleri</option>${prodOpts}</select>
        <select class="inp" id="lFc" onchange="lFiltre()"><option value="">Tüm müşteriler</option>${custOpts}</select>
        <button class="btn btn-ghost btn-sm" onclick="lTemizle()">Temizle</button>
      </div>
      <p class="muted" id="lSayi" style="font-size:12px;margin:8px 2px 0"></p>
    </div>
    <div class="grp-all"><button type="button" onclick="grpAll(this,true)">Tümünü aç</button><span>·</span><button type="button" onclick="grpAll(this,false)">Tümünü kapat</button></div>
    <div id="lWrap"></div>`;
  if(ui._lfSakla){ const f=ui._lfSakla; ui._lfSakla=null;
    const e=id=>document.getElementById(id);
    if(e('lQ'))e('lQ').value=f.q||''; if(e('lFm'))e('lFm').value=f.m||'';
    if(e('lFd'))e('lFd').value=f.d||''; if(e('lFc'))e('lFc').value=f.c||'';
    if(e('lFp'))e('lFp').value=f.p||''; }
  lFiltre();
}
function lTemizle(){ const e=id=>document.getElementById(id); if(e('lQ'))e('lQ').value='';
  ['lFm','lFd','lFc','lFp'].forEach(id=>{ if(e(id))e(id).value=''; }); lFiltre(); }
/* Bir A/B grubunun yıl içindeki durum kümesi ve kiralayan müşteri kümesi */
function lGrupBilgi(g,y,bmap){
  const st=new Set(), cs=new Set();
  for(const u of [g.A,g.B]){ if(!u)continue; const b=bmap[u.id]||{};
    for(let i=1;i<=12;i++){ const cell=b[y+'-'+pad(i)];
      if(cell){ st.add(cell.s); if(cell.c!=null)cs.add(String(cell.c)); } } }
  return {st,cs};
}
/* Görünüm tercihi oturumda kalır; varsayılan mevcut yıl ızgarasıdır, yani
   Admin'in çalışma yüzeyi DEĞİŞMEZ (§3/§29). */
function lGorunum(){ try{ return sessionStorage.getItem('mp_dol_g')==='bugun'?'bugun':'yil'; }catch(e){ return 'yil'; } }
function lGorunumSec(v){ try{ sessionStorage.setItem('mp_dol_g',v); }catch(e){} listeler(document.getElementById('content')); }

/* §20: "son güncelleme" UYDURULMAZ. `bookings` üzerinde updated_at kolonu
   YOK (bakıldı), o yüzden kayıt düzeyinde bir tazelik iddiası edilemez.
   Dürüst olan tek şey verinin NE ZAMAN OKUNDUĞUDUR — ekran düzeyinde,
   hücre başına değil. */
function lTazeBar(){
  const t=ui._veriOkunma instanceof Date?ui._veriOkunma:new Date();
  const ss=String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
  return `<div class="afilt neutral"><span class="afilt-l">Görünüm</span>
    <span class="afilt-v">${lGorunum()==='bugun'
      ? `Bugün · <b>${esc(trTarih(_bIso(new Date())))}</b> itibarıyla mevcut durum`
      : `Yıl ızgarası · <b>${ui._L?ui._L.y:''}</b> aylık doluluk`}</span>
    <span class="afilt-n">veri okunma ${esc(ss)}</span></div>`;
}

/* ---- BUGÜN görünümü (§10-§12) ----
   Yoğun, taranabilir bir tablo. Her satır §10'un sorduğu her şeyi verir:
   mecra · alan · pozisyon · bugünkü durum · kurum · gerçek dönem · ne zaman
   boşalıyor. KESİNLİK dürüstçe ayrılır (§11): gerçek tarihten gelen bilgi
   ile yalnız aylık kovadan çıkarılan bilgi aynı görünmez. */
function lBugunCiz(box){
  const L=ui._L, bmap=window.__lbmap;
  const q=(gv('lQ')||'').trim().toLocaleLowerCase('tr');
  const fm=gv('lFm')||'', fd=gv('lFd')||'', fc=gv('lFc')||'', fp=gv('lFp')||'';
  const bugunYm=ymBugun();
  const rows=[];
  for(const m of L.mlist){
    if(fm && String(m.id)!==fm) continue;
    for(const a of (L.altByMec[m.id]||[])){
      for(const u of (L.uByAlt[a.id]||[])){
        const pid=(u.product_id!=null)?u.product_id:a.product_id;
        if(fp && String(pid)!==fp) continue;
        const b=(bmap[u.id]||{})[bugunYm]||null;
        const ak=bookAktif(b);
        const dolu=!!(b&&ak.aktif);
        const firma=dolu&&b.c?(L.cmap[b.c]||('#'+b.c)):'';
        if(fc && String(b&&b.c)!==fc) continue;
        if(fd==='dolu'      && !(dolu&&b.s==='dolu'))   continue;
        if(fd==='rezerve'   && !(dolu&&b.s==='rezerve'))continue;
        if(fd==='doluveya'  && !dolu)                    continue;
        if(fd==='bos'       && dolu)                     continue;
        if(q){ const hay=[u.name,a.name,m.name,firma].join(' ').toLocaleLowerCase('tr');
               if(!hay.includes(q)) continue; }
        rows.push({m,a,u,b,ak,dolu,firma,pid});
      }
    }
  }
  const say=document.getElementById('lSayi');
  if(say) say.textContent=`${rows.length} pozisyon · bugünkü durum`;
  if(!rows.length){ box.innerHTML='<div class="sec-card"><p class="empty">Bu filtreye uyan pozisyon yok.</p></div>'; return; }

  const satir=r=>{
    const {u,a,m,b,ak,dolu,firma}=r;
    const pasif=u.active===false;
    const donem=dolu?bookDonem(b):'';
    const bosalma=dolu?bookBosalma(b):'';
    /* Bugün boş ama bu ay içinde başlayan gerçek bir dönem varsa bunu
       söylemek zorundayız: aksi halde operatör yüzeyi boş sanıp teklif
       verir, sonra çakışmayı keşfeder. */
    const per0=bookPer(b);
    const yakinda=(!dolu&&b&&ak.durum==='gelecek'&&per0.ps)?per0.ps:null;
    /* Yalnız aylık kayıttan gelen bilgi "yaklaşık" olarak işaretlenir —
       gün hassasiyeti varmış gibi sunulmaz (§11). */
    const yaklasik=dolu&&ak.kesinlik==='ay';
    const per=bookPer(b);
    return `<tr onclick="lBugunAc(${u.id})" style="cursor:pointer">
      <td><div class="lz-t">${esc(u.name||('#'+u.id))}</div>
          <div class="lz-s">${esc(m.name)} · ${esc(a.name)}</div></td>
      <td>${pasif?'<span class="pill">Pasif</span>'
            :dolu?`<span class="pill ${b.s==='rezerve'?'sand':'clay'}">${b.s==='rezerve'?'Rezerve':'Dolu'}</span>`
                 :`<span class="pill ok">Boş</span>${yakinda?'<div class="lz-s">yakında dolu</div>':''}`}</td>
      <td>${dolu?`<div class="lz-t" title="${esc(firma)}">${esc(orgKisa(firma,30))}</div>`:'<span class="muted">—</span>'}</td>
      <td>${donem?`<span class="mono">${esc(donem)}</span>`
            :dolu?`<span class="muted" title="Bu kayıtta gerçek tarih yok; yalnız aylık doluluk biliniyor">ay bazlı</span>`:''}
          ${per.pn&&!per.ps?`<div class="lz-s" title="Kaynak ifade">${esc(per.pn)}</div>`:''}</td>
      <td>${bosalma?`<span class="${yaklasik?'muted':''}">${esc(bosalma)}</span>`
            :yakinda?`<span class="lz-late">${esc(psGun(yakinda))}'de doluyor</span>`:''}</td>
    </tr>`;};

  box.innerHTML=`<div class="sec-card pad0"><div class="tbl-wrap">
    <table class="tbl rowlink lz"><thead><tr>
      <th>Pozisyon</th><th style="width:96px">Bugün</th><th style="width:210px">Kurum</th>
      <th style="width:150px">Gerçek dönem</th><th style="width:170px">Ne zaman boşalıyor</th>
    </tr></thead><tbody>${rows.map(satir).join('')}</tbody></table></div></div>`;
}

/* §14: pozisyonu Admin'e gitmeden incele. SALT OKUNUR — mecra mutasyon
   kontrolü eklenmez. */
function lBugunAc(uid){
  const L=ui._L, bmap=window.__lbmap;
  const u=(window.__lumap||{})[uid]||{};
  const a=(L.altByMec?Object.values(L.altByMec).flat():[]).find(x=>x.id===u.alt_mecra_id)||{};
  const m=(L.mlist||[]).find(x=>x.id===(a.mecra_id||u.mecra_id))||{};
  const aylar=bmap[uid]||{};
  const bugunYm=ymBugun();
  const b=aylar[bugunYm]||null;
  const ak=bookAktif(b); const dolu=!!(b&&ak.aktif);
  const sonraki=Object.keys(aylar).filter(k=>k>=bugunYm).sort().slice(0,6);
  modal(`<h3 style="margin:0 0 4px">${esc(u.name||('#'+uid))}</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">${esc(m.name||'')} · ${esc(a.name||'')}${
      u.olcu?' · '+esc(u.olcu):''}${L.pmap&&L.pmap[a.product_id]?' · '+esc(L.pmap[a.product_id]):''}</p>
    <div class="meta" style="line-height:1.9">
      Bugün: ${dolu?`<b>${b.s==='rezerve'?'Rezerve':'Dolu'}</b> — ${esc(L.cmap[b.c]||'kurum belirtilmemiş')}`
        :(u.active===false?'<b>Pasif</b> — ticari satışa kapalı':'<b>Boş</b>')}<br>
      ${(!dolu&&b&&ak.durum==='gelecek'&&bookPer(b).ps)
        ?`<span class="lz-late">${esc(psGun(bookPer(b).ps))} tarihinde doluyor</span> — ${esc(L.cmap[b.c]||'kurum belirtilmemiş')}<br>`:''}
      ${dolu&&bookDonem(b)?`Gerçek dönem: <b>${esc(bookDonem(b))}</b><br>`:''}
      ${dolu&&!bookPer(b).ps?'<span class="muted">Bu kayıtta gerçek tarih yok — yalnız aylık doluluk biliniyor.</span><br>':''}
      ${b&&bookPer(b).pn?`Kaynak ifade: <span class="mono">${esc(bookPer(b).pn)}</span><br>`:''}
      ${dolu?`Ne zaman boşalıyor: <b>${esc(bookBosalma(b))}</b><br>`:''}
      ${u.konum?`Konum: ${esc(u.konum)}<br>`:''}
    </div>
    ${sonraki.length?`<div class="field" style="margin-top:12px">
      <span class="flabel">Önümüzdeki aylar</span>
      <div class="rz-next">${sonraki.map(k=>{ const x=aylar[k];
        return `<span class="rz-next-i ${x.s}"><b>${esc(ymAdi(k))}</b>${x.c?`<em>${esc(orgKisa(L.cmap[x.c]||'',18))}</em>`:''}</span>`;}).join('')}</div></div>`:''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button></div>`);
}

function lFiltre(){
  const L=ui._L, box=document.getElementById('lWrap'); if(!L||!box)return;
  if(lGorunum()==='bugun'){ lBugunCiz(box); return; }
  const y=L.y, bmap=window.__lbmap;
  const q=(gv('lQ')||'').trim().toLocaleLowerCase('tr');
  const fm=gv('lFm')||'', fd=gv('lFd')||'', fc=gv('lFc')||'', fp=gv('lFp')||'';
  const aktif=!!(q||fm||fd||fc||fp);
  const monHead=MONTHS_SHORT.map(mo=>`<div class="rg-m rg-mh"><span>${mo}</span></div>`).join('');
  let html='', topPoz=0, topMecra=0;
  for(const m of L.mlist){
    if(fm && String(m.id)!==fm) continue;
    const as=L.altByMec[m.id]||[];
    let inner=''; let mecPoz=0; let mecAB=false;
    for(const a of as){
      const us=L.uByAlt[a.id]||[];
      const tumGruplar=groupUnits(us);
      if(tumGruplar.some(g=>!!g.B)) mecAB=true;
      const groups=tumGruplar.filter(g=>{
        const {st,cs}=lGrupBilgi(g,y,bmap);
        if(q){
          const kiralayan=[...cs].map(id=>L.cmap[id]||'').join(' ');
          const hay=(g.base+' '+a.name+' '+m.name+' '+kiralayan).toLocaleLowerCase('tr');
          if(!hay.includes(q)) return false;
        }
        if(fd==='dolu' && !st.has('dolu')) return false;
        if(fd==='rezerve' && !st.has('rezerve')) return false;
        if(fd==='doluveya' && !st.has('dolu') && !st.has('rezerve')) return false;
        if(fd==='bos' && st.size) return false;
        if(fc && !cs.has(fc)) return false;
        /* Ürün önce pozisyonun kendisinden, yoksa alt mecradan okunur. */
        if(fp){ const pid=(g.A&&g.A.product_id!=null)?g.A.product_id:a.product_id;
                if(String(pid)!==fp) return false; }
        return true;
      });
      if(!groups.length && aktif) continue;    /* filtre varken boş alanları gizle */
      mecPoz+=groups.length;
      inner+=`<div class="sec-head" style="margin-top:10px"><h4 style="font-size:14px;margin:0">${esc(a.name)} <span class="muted">· ${esc(L.pmap[a.product_id]||'')}</span></h4>${isAdmin()?`<button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id},${m.id},${a.product_id})">+ Pozisyon</button>`:''}</div>`;
      if(!us.length){ inner+='<p class="muted" style="font-size:12px">Pozisyon yok.</p>'; continue; }
      if(!groups.length){ inner+='<p class="muted" style="font-size:12px">Filtreyle eşleşen pozisyon yok.</p>'; continue; }
      const rows=groups.map(g=>{
        const cells=MONTHS_SHORT.map((mo,i)=>{ const ym=y+'-'+pad(i+1);
          return `<div class="rg-m">${g.B
            ? lCell(g.A,ym,L.cmap,bmap)+lCell(g.B,ym,L.cmap,bmap)
            : lCell(g.A,ym,L.cmap,bmap,true)}</div>`; }).join('');
        return `<div class="rg-row"><div class="rg-lbl" title="${esc(g.base)}">${esc(g.base)}</div>${cells}</div>`; }).join('');
      inner+=`<div class="rtwrap"><div class="rgrid">
        <div class="rg-row rg-head"><div class="rg-lbl">Pozisyon</div>${monHead}</div>${rows}</div></div>`;
    }
    if(!inner && aktif) continue;              /* mecrada hiç eşleşme yoksa grubu gizle */
    topMecra++; topPoz+=mecPoz;
    html+=`<details class="sec-card lgrp" ${aktif?'open':''}><summary><span class="grp-t">${esc(m.name)}</span>
      <span class="lgrp-m">${aktif?mecPoz+' eşleşen pozisyon':((as.length)+' alan · '+((L.uByAlt&&as.reduce((k,x)=>k+((L.uByAlt[x.id]||[]).length),0))+' pozisyon'))}</span><i class="chev"></i></summary>`;
    html+=inner||'<p class="muted">Alt mecra yok.</p>';
    html+=`<div class="rg-legend">
      ${mecAB?'<span class="lg-surf"><b>A</b> Ön yüz</span><span class="lg-surf"><b>B</b> Arka yüz</span><span class="lg-sep"></span>':''}
      <span><i class="sw bos"></i>Boş</span><span><i class="sw dolu"></i>Dolu</span><span><i class="sw rezerve"></i>Rezerve</span>
      </div></details>`;
  }
  const say=document.getElementById('lSayi');
  if(say) say.textContent=aktif?`${topPoz} pozisyon (${topMecra} mecrada) gösteriliyor — filtre etkin`:'';
  box.innerHTML=html||'<div class="sec-card"><p class="muted" style="margin:0">Filtrelerle eşleşen kayıt bulunamadı.</p></div>';
}
/* ---- Rezervasyon penceresi: durum + müşteri tek yerden ---- */
const AY_UZUN=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
function rezKapat(){ const p=document.getElementById('rezPop'); if(p)p.remove();
  document.removeEventListener('mousedown',rezDis,true); ui._rez=null; }
function rezDis(e){ const p=document.getElementById('rezPop'); if(p && !p.contains(e.target)) rezKapat(); }
function rezAc(uid,ym,ev){
  rezKapat();
  const u=window.__lumap[uid]||{}; const cur=(window.__lbmap[uid]||{})[ym];
  /* Mevcut dönem varsa forma taşınır ki düzenlerken kaybolmasın. */
  ui._rez={uid,ym,st:cur?cur.s:'bos',cid:cur&&cur.c?cur.c:null,yeni:false,
           ps:(cur&&cur.ps)||'',pe:(cur&&cur.pe)||'',pn:(cur&&cur.pn)||''};
  const p=document.createElement('div'); p.id='rezPop'; p.className='rezpop';
  document.body.appendChild(p);
  rezCiz();
  /* konumlandır: hücrenin altına, ekrandan taşmasın */
  const r=ev.target.closest('.rcell').getBoundingClientRect();
  const W=p.offsetWidth||300, H=p.offsetHeight||260;
  let x=r.left+r.width/2-W/2, y=r.bottom+8;
  x=Math.max(10,Math.min(x,window.innerWidth-W-10));
  if(y+H>window.innerHeight-10) y=r.top-H-8;
  p.style.left=x+'px'; p.style.top=Math.max(10,y)+'px';
  setTimeout(()=>document.addEventListener('mousedown',rezDis,true),0);
}
function rezCiz(){
  const p=document.getElementById('rezPop'); if(!p||!ui._rez)return;
  const {uid,ym,st,cid,yeni,q}=ui._rez;
  const u=window.__lumap[uid]||{};
  const ay=AY_UZUN[+ym.slice(5,7)-1]+' '+ym.slice(0,4);
  const custs=(ui._L&&ui._L.custs)||[];
  const t=(q||'').toLocaleLowerCase('tr');
  const bul=t?custs.filter(c=>[c.firma,c.telefon].some(v=>String(v||'').toLocaleLowerCase('tr').includes(t))).slice(0,7):[];
  const secili=cid?(window.__lcmap[cid]||('#'+cid)):null;
  p.innerHTML=`<div class="rz-h"><b>${esc(u.name||'')}</b><span>${esc(ay)}</span>
      <button class="rz-x" onclick="rezKapat()">✕</button></div>
    <div class="rz-seg">
      ${[['bos','Boş'],['dolu','Dolu'],['rezerve','Rezerve']].map(x=>
        `<button class="${st===x[0]?'on '+x[0]:''}" onclick="ui._rez.st='${x[0]}';rezCiz()">${x[1]}</button>`).join('')}
    </div>
    ${st==='bos'?'<p class="rz-not">Bu ay boşa çekilecek; varsa müşteri ataması kalkar.</p>':`
    <div class="rz-cust">
      <label class="flabel">Müşteri</label>
      ${secili?`<div class="rz-sec">${esc(secili)}<button onclick="ui._rez.cid=null;rezCiz()" title="Kaldır">✕</button></div>`
      : yeni? `
        <input class="inp inp-sm" id="rzF" placeholder="Firma adı *" style="margin-bottom:6px">
        <div style="display:flex;gap:6px;margin-bottom:6px">
          <input class="inp inp-sm" id="rzK" placeholder="İlgili kişi (Kişi kaydı açılır)">
          <input class="inp inp-sm" id="rzT" placeholder="Telefon"></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="rezYeniKaydet()">Müşteriyi Ekle</button>
          <button class="btn btn-ghost btn-sm" onclick="ui._rez.yeni=false;rezCiz()">Geri</button></div>`
      : `
        <input class="inp inp-sm" id="rzQ" placeholder="Müşteri ara — firma, kişi, telefon" value="${esc(q||'')}"
          oninput="ui._rez.q=this.value;rezCiz();document.getElementById('rzQ').focus();const v=this.value;const e=document.getElementById('rzQ');e.setSelectionRange(v.length,v.length)">
        ${bul.length?`<div class="rz-list">${bul.map(c=>`<button onclick="ui._rez.cid=${c.id};ui._rez.q='';rezCiz()">${esc(c.firma||('#'+c.id))}${c.telefon?`<span>${esc(c.telefon)}</span>`:''}</button>`).join('')}</div>`
          :(t?'<p class="rz-not">Eşleşen müşteri yok.</p>':'')}
        <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="ui._rez.yeni=true;rezCiz()">＋ Yeni müşteri ekle</button>`}
    </div>`}
    ${st==='bos'?'':`
    <div class="rz-per">
      <label class="flabel">Gerçek dönem <span class="muted">(opsiyonel)</span></label>
      <div class="rz-per-r">
        <input class="inp inp-sm" type="date" id="rzPs" value="${esc(ui._rez.ps||'')}" aria-label="Dönem başlangıcı">
        <span class="rz-per-d">–</span>
        <input class="inp inp-sm" type="date" id="rzPe" value="${esc(ui._rez.pe||'')}" aria-label="Dönem bitişi">
      </div>
      <input class="inp inp-sm" id="rzPn" value="${esc(ui._rez.pn||'')}" style="margin-top:6px"
        placeholder="Kaynak ifade — ör. 20.09.2025 - ?  ·  01.02./31.03.2026 2 AY">
      <label class="switch rz-per-y"><input type="checkbox" id="rzPy" checked><span class="sl"></span>
        <span class="txt">Dönemin kapsadığı tüm aylara uygula</span></label>
      <p class="rz-not" style="margin:4px 0 0">Bitiş boşsa dönem açık uçlu sayılır. Ay bazlı doluluk değişmez.</p>
    </div>`}
    <div class="rz-not" style="display:flex;align-items:center;gap:8px;justify-content:space-between;margin-top:8px">
      <span title="Ticari satisa kapatir. Kisa bakim otomatik pasife almaz (BR-M03).">Pozisyon durumu</span>
      <label class="switch" style="margin:0"><input type="checkbox" id="rzAktif" ${u.active===false?'':'checked'}
        onchange="unitAktifDegis(${uid},this.checked)"><span class="sl"></span>
        <span class="txt">${u.active===false?'Pasif':'Aktif'}</span></label>
    </div>
    <div class="rz-f">
      <button class="btn btn-ghost btn-sm" onclick="rezKapat()">Kapat</button>
      <button class="btn btn-primary btn-sm" onclick="rezKaydet()">Kaydet</button></div>`;
}
async function unitAktifDegis(uid,aktif){
  /* Pasife alinan pozisyon public availability view'indan da duser
     (06 s12.3/s12.4). Bakim nedeniyle otomatik degismez. */
  const r=await guard(()=>api('unit_save',{id:uid,active:aktif,
    inactive_note:aktif?null:'Panelden elle pasife alindi'}),'Pozisyon durumu degistirilemedi');
  if(r===null) return;
  if(window.__lumap&&window.__lumap[uid]) window.__lumap[uid].active=aktif;
  toast(aktif?'Pozisyon aktif.':'Pozisyon pasife alindi - satisa kapali.');
  rezCiz();
}
async function rezYeniKaydet(){
  const firma=(gv('rzF')||'').trim();
  if(!firma){ mpAlert('Firma adı gerekli.','Yeni Müşteri'); return; }
  /* S02_001: girilen kişi adı artık customers.ilgili_kisi'ye yazılmaz —
     gerçek bir Contact kaydı olarak `contacts` tablosuna gider. */
  const r=await guard(()=>api('customer_save',{firma,telefon:gv('rzT')}),'Müşteri eklenemedi');
  if(r===null)return;
  const kisi=(gv('rzK')||'').trim();
  if(kisi){ await guard(()=>api('contact_save',{id:0,customer_id:r.id,name:kisi,phone:gv('rzT')||null,is_primary:true}),'Kişi eklenemedi'); }
  const yeniM={id:r.id,firma,telefon:gv('rzT')};
  if(ui._L){ ui._L.custs.push(yeniM); ui._L.cmap[r.id]=firma; }
  window.__lcmap[r.id]=firma;
  ui._rez.cid=r.id; ui._rez.yeni=false; ui._rez.q='';
  toast('Müşteri eklendi — Müşteriler bölümünde de görebilirsiniz.');
  rezCiz();
}
/* Bir gerçek rezervasyon birden çok aylık kovayı kapsar (§6). Aynı dönemi
   her ay için elle yeniden girmek saçma olurdu (§16), bu yüzden kapsanan
   aylara aynı dönem yazılır. Bu MÜKERRER İŞ KAYDI DEĞİLDİR: aylık satır
   uygunluk gerçeği, dönem ise bağlam gerçeğidir ve ikisi ayrı şeylerdir.
   Yeni bir rezervasyon nesnesi/gruplama YARATILMAZ (§7). */
function rezAylar(ps,pe,ym){
  if(!ps) return [ym];
  const bas=new Date(ps+'T00:00:00');
  const son=pe?new Date(pe+'T00:00:00'):bas;
  const out=[]; const d=new Date(bas.getFullYear(),bas.getMonth(),1);
  /* Güvenlik sınırı: açık uçlu ya da hatalı aralıkta sonsuz döngü olmasın. */
  for(let i=0;i<36;i++){
    const k=d.getFullYear()+'-'+pad(d.getMonth()+1);
    out.push(k);
    if(d.getFullYear()===son.getFullYear()&&d.getMonth()===son.getMonth()) break;
    if(d>son) break;
    d.setMonth(d.getMonth()+1);
  }
  if(!out.includes(ym)) out.push(ym);
  return out;
}
async function rezKaydet(){
  const {uid,ym,st}=ui._rez; const cid=st==='bos'?null:ui._rez.cid;
  const ps=st==='bos'?null:(gv('rzPs')||null);
  const pe=st==='bos'?null:(gv('rzPe')||null);
  const pn=st==='bos'?null:(gv('rzPn')||null);
  if(ps&&pe&&pe<ps){ mpAlert('Dönem bitişi başlangıcından önce olamaz.','Geçersiz dönem'); return; }
  const yay=!!(document.getElementById('rzPy')||{}).checked;
  const hedef=(st!=='bos'&&ps&&yay)?rezAylar(ps,pe,ym):[ym];
  for(const k of hedef){
    const r=await guard(()=>api('booking_toggle',{unit_id:uid,ym:k,status:st,customer_id:cid,
      period_start:ps,period_end:pe,period_note:pn}),'Kaydedilemedi');
    if(r===null)return;
    window.__lbmap[uid]=window.__lbmap[uid]||{};
    if(st==='bos')delete window.__lbmap[uid][k];
    else window.__lbmap[uid][k]={s:st,c:cid,ym:k,ps,pe,pn};
  }
  if(hedef.length>1) toast(`${hedef.length} aya uygulandı.`);
  const el=document.querySelector(`.rcell[data-u='${uid}'][data-ym='${ym}']`);
  if(el){ el.className='rcell '+st;
    const who=cid?window.__lcmap[cid]:'';
    const solo=el.parentElement && el.parentElement.querySelectorAll('.rcell').length===1;
    const kod=(st!=='bos'&&who)?String(who).trim().slice(0,3).toLocaleUpperCase('tr'):(st==='bos'?(solo?'':(el.dataset.surf||'A')):(solo?'':(el.dataset.surf||'A')));
    el.innerHTML='<i>'+esc(kod)+'</i>'; }
  rezKapat();
}
async function lAddPos(altId,mid,pid){ const nm=prompt('Pozisyon adı (ör. P1-A):','P'); if(nm===null)return; await api('unit_save',{alt_mecra_id:altId,mecra_id:mid,product_id:pid,name:(nm||'Yeni Pozisyon')}); renderSection(); }
function lYear(d){ ui._lyear=(ui._lyear||new Date().getFullYear())+d;
  ui._lfSakla={q:gv('lQ'),m:gv('lFm'),d:gv('lFd'),c:gv('lFc'),p:gv('lFp')};  /* yıl değişince filtreler korunur */
  renderSection(); }

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
function supForm(id){ const x=(ui._sup||[]).find(s=>s.id===id)||{aktif:true};
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
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="supSave()">Kaydet</button></div>`);
}
async function supSave(){
  if(!gv('sf').trim()){ mpAlert('Firma adı zorunlu.'); return; }
  const r=await guard(()=>api('supplier_save',{id:+gv('sid'),firma:gv('sf'),kategori:gv('sk'),ilgili_kisi:gv('sik'),telefon:gv('st'),
    eposta:gv('se'),iban:gv('sib'),adres:gv('sa'),vergi_no:gv('sv'),vergi_dairesi:gv('svd'),notlar:gv('sn'),
    aktif:document.getElementById('sak').checked}),'Tedarikçi kaydedilemedi');
  if(r===null) return;
  closeModal(); renderSection(); toast('Tedarikçi kaydedildi.');
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

function custForm(id){ const x=(ui._cust||[]).find(c=>c.id===id)||{};
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
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="custSave()">Kaydet</button></div>`);
}
/* ilgili_kisi bilinçli olarak gönderilmez: raw provenance evidence olarak
   dokunulmadan kalır (S02_001 §2.4). */
async function custSave(){ await api('customer_save',{id:+gv('cid'),firma:gv('cf'),telefon:gv('ct'),eposta:gv('ce'),adres:gv('ca'),vergi_no:gv('cv'),vergi_dairesi:gv('cvd'),puan:+gv('cp')}); closeModal(); renderSection(); }
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
const HAFTABS=[['tumu','Tümü'],['kurumlar','Kurumlar'],['kisiler','Kişiler']];

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
function hafYaz(d){ try{ sessionStorage.setItem('mp_haf',JSON.stringify(d)); }catch(e){} }
function hafTab(t){ hafYaz({...hafDurum(),tab:t}); renderSection(); }
function hafAra(){ hafYaz({...hafDurum(),q:gv('hafQ')||''}); hafCiz(); }
function hafRol(){ hafYaz({...hafDurum(),rol:gv('hafRol')||''}); hafCiz(); }
function hafTemizle(){ hafYaz({...hafDurum(),q:'',rol:''}); renderSection(); }

/* Tek turda dört toplu okuma; kurum/kişi başına sorgu YOK (§14/§35). */
async function kurumlar(c){
  const st=hafDurum();
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
      <button class="btn btn-primary btn-sm" onclick="hafEkle()">${ic('plus',15)} Hafızaya Ekle</button></div>

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
      ${tab('tumu','Tümü')}${tab('kurumlar','Kurumlar',ui._haf.orgs.length)}${tab('kisiler','Kişiler',ui._haf.kisiler.length)}
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

/* Eski `orgListe` çağrıları (varsa) Hafıza çizimine yönlendirilir. */
function orgListe(){ hafCiz(); }

/* ---- Kurum Detayı (PS3 §16) — mevcut renderer GENİŞLETİLDİ, paralel bir
   kurum ekranı açılmadı. Bilgi hiyerarşisi: Kimlik → Kişiler → Aktif İşler
   → Son Güncellemeler → Geçmiş. Boş bölümler gizlenir (§33). */
async function orgAc(id){
  const d=await guard(()=>api('org_detail&id='+id),'Kurum açılamadı'); if(!d)return;
  ui._org=d.org; ui._orgContacts=d.contacts; ui._orgDetay=d;
  navKayit('org',ui.section,d.org.id,orgKisa(d.org.firma,30));
  const o=d.org, roles=Array.isArray(o.relationship_roles)?o.relationship_roles:[];
  const jobs=d.jobs||[], ents=d.entries||[], quotes=d.quotes||[];
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
        <button class="btn btn-outline btn-sm" onclick="jobForm(null,null,{custId:${o.id}})">${ic('plus',15)} Yeni İş</button>
        <button class="btn btn-outline btn-sm" onclick="custForm(${o.id})">Düzenle</button></div></div>

    ${kimlik||o.relationship_evidence?`<div class="sec-card">
      <div class="sec-head" style="margin-bottom:8px"><h4 style="font-size:14px;margin:0">Kimlik</h4>
        <button class="btn btn-ghost btn-sm" onclick="orgRolForm(${o.id})">Rolleri düzenle</button></div>
      <div class="meta" style="line-height:1.9">${kimlik}${kimlik?'<br>':''}
        ${/* §27: köken/kanıt İKİNCİL. Kimliğin üstünü kaplamaz. */''}
        ${o.relationship_evidence?`<span class="haf-ev">kayıt niteliği: ${esc(evidenceLabel(o.relationship_evidence))}</span>`:''}
      </div></div>`:''}

    <div class="sec-card">
      <div class="sec-head" style="margin-bottom:10px">
        <h4 style="font-size:14px;margin:0">Kişiler <span class="chip">${d.contacts.length}</span></h4>
        <button class="btn btn-outline btn-sm" onclick="contactForm(0,${o.id})">${ic('plus',15)} Kişi Ekle</button></div>
      <div id="orgKisiler"></div></div>

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
          <p class="pu-t" onclick="psAc(this)">${esc(e.body)}</p>
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
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button></div>`);
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
      <select class="inp" id="pfOrg"><option value="">— kurum bağlantısı yok —</option>
        ${custs.map(x=>`<option value="${x.id}" ${String(ctx.custId)===String(x.id)?'selected':''}>${esc(x.firma||('#'+x.id))}</option>`).join('')}
      </select></div>
    <div class="row2">
      <div class="field"><label class="flabel" for="pfUnvan">Unvan</label>
        <input class="inp" id="pfUnvan" placeholder="ör. Pazarlama Müdürü"></div>
      <div class="field"><label class="flabel" for="pfBirim">Birim</label>
        <input class="inp" id="pfBirim"></div></div>
    <p class="fhint">Kurum seçmezsen kişi yine kaydedilir; bağlantıyı sonra ekleyebilirsin.</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
  const d=await guard(()=>api('person_detail&id='+id),'Kişi açılamadı'); if(!d)return;
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
        <button class="btn btn-outline btn-sm" onclick="personYeniIs(${k.id})">${ic('plus',15)} Yeni İş</button>
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
        <select class="inp" id="afOrg" ${id?'disabled':''}>
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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

function contactForm(id,customerId){
  const x=(ui._orgContacts||[]).find(k=>k.id===id)||{};
  modal(`<h3 style="margin:0 0 14px">${id?'Kişi Düzenle':'Yeni Kişi'}</h3>
    <input type="hidden" id="kid" value="${id||0}"><input type="hidden" id="kcid" value="${customerId||0}">
    <div class="row2"><div class="field"><label class="flabel" for="kn">Ad Soyad *</label><input class="inp" id="kn" value="${esc(x.name)}"></div>
    <div class="field"><label class="flabel" for="kt">Unvan</label><input class="inp" id="kt" value="${esc(x.title)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel" for="kd">Birim</label><input class="inp" id="kd" value="${esc(x.department)}"></div>
    <div class="field"><label class="flabel" for="kp">Telefon</label><input class="inp" id="kp" value="${esc(x.phone)}"></div></div>
    <div class="field"><label class="flabel" for="ke">E-posta</label><input class="inp" id="ke" value="${esc(x.email)}"></div>
    <div class="field"><label class="flabel" for="kno">Not</label><textarea class="inp" id="kno">${esc(x.notes)}</textarea></div>
    <label class="switch" style="margin-bottom:8px"><input type="checkbox" id="kpr" ${x.is_primary?'checked':''}><span class="sl"></span><span class="txt">Birincil kişi</span></label>
    <label class="switch" style="margin-bottom:14px"><input type="checkbox" id="kak" ${x.active===false?'':'checked'}><span class="sl"></span><span class="txt">Aktif</span></label>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="contactSave()">Kaydet</button></div>`);
  const f=document.getElementById('kn'); if(f)f.focus();
}
async function contactSave(){
  const ad=(gv('kn')||'').trim();
  if(!ad){ mpAlert('Ad Soyad zorunlu.'); return; }
  const cid=+gv('kcid')||null;
  modalBusy(true);
  const r=await guard(()=>api('contact_save',{id:+gv('kid'),customer_id:cid,name:ad,
    title:gv('kt')||null,department:gv('kd')||null,phone:gv('kp')||null,email:gv('ke')||null,notes:gv('kno')||null,
    is_primary:document.getElementById('kpr').checked,active:document.getElementById('kak').checked}),'Kişi kaydedilemedi');
  modalBusy(false);
  if(r===null)return;
  closeModal(); toast('Kişi kaydedildi.'); orgAc(cid||(ui._org||{}).id);
}
async function contactDel(id){
  if(!await mpConfirm('Bu kişi silinsin mi?','Kişiyi Sil'))return;
  const r=await guard(()=>api('contact_delete&id='+id),'Kişi silinemedi'); if(r===null)return;
  toast('Kişi silindi.'); orgAc((ui._org||{}).id);
}
function orgRolForm(id){
  const o=ui._org||{}; const cur=Array.isArray(o.relationship_roles)?o.relationship_roles:[];
  modal(`<h3 style="margin:0 0 6px">İlişki Rolleri</h3>
    <p class="muted" style="font-size:12.5px;margin:0 0 14px">Kurumun uzun dönemli, tanımlayıcı rolleri. Belirli bir işteki taraf rolü ayrıdır (BR-ORG01).</p>
    <input type="hidden" id="orid" value="${id}">
    ${ORG_ROLES.map(r=>`<label class="switch" style="margin-bottom:8px">
      <input type="checkbox" class="orgRol" value="${r[0]}" ${cur.includes(r[0])?'checked':''}>
      <span class="sl"></span><span class="txt">${esc(r[1])}</span></label>`).join('')}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button><button class="btn btn-primary btn-sm" onclick="quoteStatus(${q.id})">Durumu Kaydet</button></div>`
      :`<div class="meta" style="margin-bottom:14px">Durum: <span class="badge-st st-${esc(q.status||'yeni')}">${esc(QL[q.status]||'Yeni')}</span></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button></div>`}`);
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
        <select class="inp" id="qbCust" onchange="qbCustPick(this.value)">
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button>
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
function teamForm(id){ const x=(ui._team||[]).find(t=>t.id===id)||{};
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
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="teamSave()">Kaydet</button></div>`);
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
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="teamSave()">Kaydet</button></div>`);
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

function pageEdit(slug){ const p=(ui._pages||[]).find(x=>x.slug===slug)||{slug,blocks:[]}; ui._pageSlug=slug; ui._blocks=JSON.parse(JSON.stringify(p.blocks||[])); ui._pageTitle=p.title||''; ui._pageMenu=p.in_menu!==false; renderPageEd(); document.getElementById('pageEd').scrollIntoView({behavior:'smooth'}); }
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
async function pageSaveBlocks(){ syncBlocks(); await api('page_save',{slug:ui._pageSlug,title:gv('pgTitle'),in_menu:gv('pgMenu')==='1',blocks:ui._blocks}); ui._pages=await api('pages_list'); mpAlert('Sayfa kaydedildi.'); }
async function pageDel(slug){ if(await mpConfirm('Sayfa silinsin mi?','Sayfayı Sil')){ await api('page_delete&slug='+encodeURIComponent(slug)); renderSection(); } }
function pageNew(){ const t=prompt('Yeni sayfa başlığı:'); if(!t)return; const slug=t.trim().toLowerCase().replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||('sayfa-'+Date.now()); api('page_save',{slug,title:t,blocks:[],in_menu:true,sort:9}).then(async()=>{ ui._pages=await api('pages_list'); pageEdit(slug); }); }


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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button>
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
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button>
      <button class="btn btn-outline btn-sm" onclick="noteForm(${n.id})">Düzenle</button></div>`);
}
function noteForm(id){ const n=(ui._notes||[]).find(x=>x.id===id)||{};
  modal(`<h3 style="margin:0 0 14px">${id?'Not':'Yeni Not'}</h3><input type="hidden" id="nid" value="${id||0}">
    <div class="field"><label class="flabel">Konu</label><input class="inp" id="nk" value="${esc(n.konu)}"></div>
    <div class="row2"><div class="field"><label class="flabel">İlgili Kişi</label><input class="inp" id="nik" value="${esc(n.ilgili_kisi)}"></div>
    <div class="field"><label class="flabel">Tarih</label><input class="inp" id="nt" type="date" value="${esc(n.tarih)}"></div></div>
    <div class="field"><label class="flabel">İçerik</label><textarea class="inp" style="min-height:120px" id="nb">${esc(n.body)}</textarea></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="noteSave()">Kaydet</button></div>`);
}
async function noteSave(){ await api('note_save',{id:+gv('nid'),konu:gv('nk'),ilgili_kisi:gv('nik'),tarih:gv('nt')||null,body:gv('nb')}); closeModal(); renderSection(); }
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
