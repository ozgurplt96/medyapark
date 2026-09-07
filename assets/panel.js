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
  'customers','suppliers','jobs','bookings','notes','team','quotes','quote_items'];
/* geri yükleme sırası: bağımlı tablolar sonra gelmeli */
const YEDEK_SIRA=['settings','pages','products','customers','suppliers','team',
  'mecralar','alt_mecralar','units','jobs','bookings','notes','quotes','quote_items'];

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
const DELMAP={product_delete:'products',mecra_delete:'mecralar',alt_delete:'alt_mecralar',unit_delete:'units',customer_delete:'customers',team_delete:'team',note_delete:'notes',quote_delete:'quotes',job_delete:'jobs'};
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
      const [un,mc,al,jb,qs,bk,rq,nt,tm,cu]=await Promise.all([
        sb.from('units').select('id,mecra_id'),
        sb.from('mecralar').select('id,name,theme_color').order('sort'),
        sb.from('alt_mecralar').select('id'),
        sb.from('jobs').select('id,title,status,start_day,end_day,created_at,mecra_id'),
        sb.from('quotes').select('id,status,created_at'),
        sb.from('bookings').select('unit_id,ym,status').gte('ym',roll[0]).lte('ym',roll[11]),
        sb.from('quotes').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('notes').select('*').order('created_at',{ascending:false}).limit(5),
        sb.from('team').select('id,name,role,photo,eposta'),
        sb.from('customers').select('id,firma,ilgili_kisi')
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
      const jeni={}; jobs.filter(j=>j.created_at&&j.created_at>d7).forEach(j=>{const k=j.status||'tasarim';jeni[k]=(jeni[k]||0)+1;});
      const ay30=new Date(Date.now()-30*864e5).toISOString();
      return ok({
        units:units.length, mecra:mecras.length, alts:alts.length,
        doluluk:Math.round(toplamDolu*100/slot), toplamDolu, toplamRez,
        bosSlot:Math.max(0,slot-toplamDolu-toplamRez), slot, aylik, mecraDagilim,
        quoteStat:say(quotes), jobStat:say(jobs), jobYeni:jeni,
        activeJobs:jobs.filter(j=>j.status!=='arsiv').length,
        newQuotes:quotes.filter(q=>(q.status||'yeni')==='yeni').length,
        son30Teklif:quotes.filter(q=>q.created_at&&q.created_at>ay30).length,
        yil:y, rollBas:roll[0], rollSon:roll[11], recentQuotes:rq.data||[], notes:nt.data||[], team:tm.data||[],
        takvim:jobs.filter(j=>j.start_day).map(j=>({d:j.start_day,t:j.title,s:j.status})),
        jobList:(()=>{ const cm={}; (cu.data||[]).forEach(x=>cm[x.id]=x);
          const mm={}; mecras.forEach(x=>mm[x.id]=x.name);
          const sira={tasarim:0,baski:1,montaj:2,yayin:3,arsiv:4};
          return jobs.filter(j=>j.status!=='arsiv')
            .sort((a,b)=>(sira[a.status]??9)-(sira[b.status]??9))
            .slice(0,8).map(j=>{ const c=cm[j.customer_id]||{};
              return {id:j.id,title:j.title,status:j.status,start:j.start_day,end:j.end_day,
                      assignee_id:j.assignee_id||null,
                      firma:c.firma||mm[j.mecra_id]||'—',kisi:c.ilgili_kisi||'',mecra:mm[j.mecra_id]||''}; }); })()
      });
    }
    case 'jobs_list':{ const {data,error}=await sb.from('jobs').select('*').order('sort').order('id'); if(error)throw error; return ok(data); }
    case 'job_move':{ const {error}=await sb.from('jobs').update({status:body.status}).eq('id',body.id); if(error)throw error; return ok(); }
    case 'job_save': {
      try{ const r=await saveRow('jobs',body); logYaz(act,body); return ok(r); }
      catch(e){
        if(body && body.assignee_id!==undefined && /assignee_id/.test(String(e.message||''))){
          const b={...body}; delete b.assignee_id;
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
    case 'bookings_all':{ const {data,error}=await sb.from('bookings').select('unit_id,ym,status,customer_id'); if(error)throw error; return ok(data); }

    case 'booking_list':{ const {data,error}=await sb.from('bookings').select('ym,status').eq('unit_id',q.unit_id); if(error)throw error; return ok(data); }
    case 'booking_toggle':{
      logYaz(act,body);
      if(body.status==='bos'){ const {error}=await sb.from('bookings').delete().eq('unit_id',body.unit_id).eq('ym',body.ym); if(error)throw error; }
      else { const row={unit_id:body.unit_id,ym:body.ym,status:body.status,customer_id:(body.customer_id!==undefined?body.customer_id:null)};
        if(body.note!==undefined) row.note=body.note;
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
async function boot(){ const {data}=await sb.auth.getSession();
  if(data.session){ ui._email=(data.session.user||{}).email||'';
    try{ ui._settings=await api('settings_get'); }catch(e){ ui._settings={}; }
    try{ const t=await api('team_list'); ui._me=(t||[]).find(x=>String(x.eposta||'').toLowerCase()===ui._email.toLowerCase())||null; }catch(e){}
    showApp(); }
  else showLogin(); }
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
  sb.from('activity_log').insert({kullanici:ui._email,islem:'giriş yaptı',bolum:'Oturum',detay:''}).then(()=>{},()=>{});
  try{ ui._settings=await api('settings_get'); }catch(e){ ui._settings={}; }
  try{ const t=await api('team_list'); ui._me=(t||[]).find(x=>String(x.eposta||'').toLowerCase()===ui._email.toLowerCase())||null; }catch(e){}
  showApp(); }
async function logout(){ await sb.auth.signOut(); showLogin(); }

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
   ['musteriler','Müşteriler','customers']]],
 ['Operasyon','jobs',[
   ['is-takibi','İş Takibi','jobs'],
   ['tedarikciler','Tedarikçiler','truck']]],
 ['Site İçeriği','home',[
   ['anasayfa','Anasayfa','home'],
   ['sayfalar','Sayfalar','pages']]],
 ['Yönetim','settings',[
   ['ekip','Ekip','team'],
   ['notlar','Notlar','notes'],
   ['ayarlar','Ayarlar','settings']]]];
const NAV=NAVG.flatMap(g=>g[2].map(n=>[n[0],n[1],n[2],'']));
/* Bir bölüm hangi grupta? */
function navGrupOf(sec){ const g=NAVG.find(g=>g[2].some(n=>n[0]===sec)); return g?g[0]:null; }
function navAcikGruplar(){
  try{ const v=JSON.parse(localStorage.getItem('mp_nav_acik')||'null'); if(Array.isArray(v))return new Set(v); }catch(e){}
  return new Set(NAVG.map(g=>g[0]));       /* ilk açılışta hepsi açık */
}
function navGrupTogle(ad){
  const set=navAcikGruplar(); set.has(ad)?set.delete(ad):set.add(ad);
  try{ localStorage.setItem('mp_nav_acik',JSON.stringify([...set])); }catch(e){}
  navCiz();
}
function navCiz(){
  const box=document.getElementById('navScroll'); if(!box)return;
  const acik=navAcikGruplar();
  box.innerHTML=NAVG.map(g=>{
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
const TITLES={dashboard:'Dashboard',anasayfa:'Anasayfa Karşılama','is-takibi':'İş Takibi',urunler:'Ürünler',mecralar:'Mecralar',harita:'Harita',listeler:'Doluluk',musteriler:'Müşteriler',tedarikciler:'Tedarikçiler',raporlar:'Raporlar',teklifler:'Teklifler',talepler:'Medya Planlama Talepleri',ekip:'Ekip',sayfalar:'Sayfalar',notlar:'Notlar',ayarlar:'Ayarlar'};
function userChip(){
  const me=ui._me||{}; const ad=me.name||(ui._email||'').split('@')[0]||'Kullanıcı';
  const rol=me.role||me.yetki||'Yönetici';
  const av=me.photo?`<img src="${esc(me.photo)}" alt="">`
    :`<span class="uc-i">${esc((ad.trim()[0]||'K').toLocaleUpperCase('tr'))}</span>`;
  return `<div class="uchip" title="${esc(ui._email||'')}">${av}
    <div class="uc-b"><b>${esc(ad)}</b><span>${esc(rol)}</span></div></div>`;
}
function showApp(){
  const st=ui._settings||{};
  const logo = st.logoImage
    ? `<img src="${esc(st.logoImage)}" alt="logo">`
    : `<span class="wm">medya<b>park</b></span>`;
  const nav='';
  root().innerHTML=`<div class="app">
    <nav class="side">
      <div class="brand">${logo}<span class="brand-sub">Yönetim Paneli</span></div>
      <div class="nav-scroll" id="navScroll"></div>
      <button class="navi logout" onclick="logout()">${ic('logout',17)}<span>Çıkış</span></button>
    </nav>
    <div class="main">
      <header class="topbar">
        <div class="tb-l"><h2 id="ttl">Dashboard</h2><span class="tb-crumb" id="tbc"></span></div>
        <div class="tb-r">
          <a class="btn btn-outline btn-sm" href="index.html" target="_blank">${ic('ext',15)} Siteyi Aç</a>
          ${userChip()}
        </div>
      </header>
      <div class="content" id="content"></div>
    </div></div>`;
  navCiz(); go('dashboard');
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
async function go(s){ if(typeof dirtyGuard==='function' && !(await dirtyGuard())) return;
  ui.section=s;
  const g=navGrupOf(s);                        /* kapali gruptaki bolume gidilirse grubu ac */
  if(g){ const set=navAcikGruplar(); if(!set.has(g)){ set.add(g); try{localStorage.setItem('mp_nav_acik',JSON.stringify([...set]));}catch(e){} } }
  navCiz();
  document.getElementById('ttl').textContent=TITLES[s]||''; renderSection(); yeniTeklifKontrol&&yeniTeklifKontrol(); }

async function renderSection(){
  const c=document.getElementById('content'); c.innerHTML='<p class="muted">Yükleniyor…</p>';
  const F={dashboard,'is-takibi':isTakibi,urunler,mecralar,listeler,musteriler,teklifler,ekip,
           sayfalar,notlar,anasayfa:anasayfaBolum,tedarikciler,raporlar,harita,ayarlar,talepler};
  try{
    const fn=F[ui.section]; if(!fn)return;
    await fn(c);
    collapsify(c,ui.section);
  }catch(e){ c.innerHTML='<div class="banner">Hata: '+esc(e.message||e)+'</div>'; }
}

/* modal */
function modal(html){ document.getElementById('modal').innerHTML=html; document.getElementById('modalBg').classList.add('open'); }
function closeModal(){ document.getElementById('modalBg').classList.remove('open'); }


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
          <stop offset="0%" stop-color="var(--c-brand)" stop-opacity=".38"/>
          <stop offset="100%" stop-color="var(--c-brand)" stop-opacity=".02"/></linearGradient></defs>
        <path d="${fill}" fill="url(#${gid})"/><path d="${d}" class="ag-line"/></svg>
      <span class="ac-max">${max}</span>
      ${noktalar}
    </div>
    <div class="ac-x">${etiketler}</div></div>`;
}

/* ---- İş akışı listesi: solda firma, sağda soldan sağa aşamalar ---- */
const JOB_STEPS=[['tasarim','Tasarım'],['baski','Baskı'],['montaj','Montaj'],['yayin','Yayın']];
/* Dashboard mini iş panosu: 4 aşama sütunu + atanan rozetleri */
function jobsBoard(jobs){
  const AS=[['tasarim','Tasarım','violet'],['baski','Baskı','amber'],['montaj','Montaj','cyan'],['yayin','Yayında','green']];
  if(!jobs||!jobs.length) return '<p class="empty">Devam eden iş yok. "+ Yeni İş" ile başlayın.</p>';
  return `<div class="jb">${AS.map(([st,lbl,cl])=>{
    const list=jobs.filter(j=>j.status===st);
    const kart=list.slice(0,3).map(j=>`<button class="jb-c" onclick="go('is-takibi')" title="${esc(j.title)}">
        <span class="jb-t">${esc(j.title)}</span>
        <span class="jb-m">${esc(j.firma||'')}</span>
        ${j.assignee_id?ekipRozet(j.assignee_id):''}</button>`).join('');
    return `<div class="jb-col ${cl}">
      <button class="jb-h" onclick="go('is-takibi')"><i></i>${lbl}<b>${list.length}</b></button>
      ${kart||'<div class="jb-bos">—</div>'}
      ${list.length>3?`<button class="jb-daha" onclick="go('is-takibi')">+${list.length-3} daha</button>`:''}
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
    if(dt.getFullYear()===y&&dt.getMonth()===m) (isMap[dt.getDate()]=isMap[dt.getDate()]||[]).push(e.t); });
  let hc=''; for(let i=0;i<kaydir;i++) hc+='<span></span>';
  for(let d=1;d<=gun;d++){ const ev=isMap[d];
    hc+=`<span class="cd${ev?' has':''}${bugunMu(d)?' today':''}"${ev?` title="${esc(ev.slice(0,3).join(' · '))}"`:''}>${d}</span>`; }
  return `<div class="calw">
    <div class="calh"><b>${AY[m]} ${y}</b>
      <span class="calnav"><button onclick="calNav(-1)">‹</button><button onclick="calNav(1)">›</button></span></div>
    <div class="calg calhead"><span>P</span><span>S</span><span>Ç</span><span>P</span><span>C</span><span>C</span><span>P</span></div>
    <div class="calg">${hc}</div></div>`;
}
function calNav(d){ calOffset+=d; const el=document.getElementById('calBox');
  if(el) el.innerHTML=calWidget(ui._dashEvents||[]); }

/* ---------- DASHBOARD ---------- */
async function dashboard(c){
  const s=await api('dashboard_stats');
  ui._dashEvents=s.takvim||[];
  const AY=['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
  const QL={yeni:'Yeni',gorusuldu:'Görüşüldü',onaylandi:'Onaylandı',iptal:'İptal'};
  const JL={tasarim:'Tasarım',baski:'Baskı',montaj:'Montaj',yayin:'Yayın',arsiv:'Arşiv'};

  const tm=await api('team_list').catch(()=>[]); ui._team=tm||[];
  const kpi=[
    ['%'+s.doluluk,'Doluluk', s.yil+' · '+s.toplamDolu+'/'+s.slot+' ay-alan','k-blue','listeler'],
    [s.activeJobs,'Devam eden iş',(s.jobStat.yayin||0)+' yayında','k-lime','is-takibi'],
    [s.newQuotes,'Yeni teklif','son 30 günde '+s.son30Teklif,'k-amber','teklifler'],
    [s.units,'Reklam alanı', s.mecra+' mecra · '+s.alts+' alt mecra','k-green','mecralar']
  ].map(k=>`<div class="kpi2 ${k[3]} tik" onclick="go('${k[4]}')" title="${esc(k[1])} bölümüne git"><div class="kpi2-n">${esc(k[0])}</div>
    <div class="kpi2-t">${esc(k[1])}</div><div class="kpi2-s">${esc(k[2])}</div></div>`).join('');

  /* yıl değişimini alt satırda göster (Oca'nın altında yıl yazar) */
  const area=chartArea((s.aylik||[]).map((a,i)=>({
      l:a.label, v:(a.dolu||0)+(a.rezerve||0),
      sub:(i===0||a.label==='Oca')?a.yil:''
    })),{h:150});
  const araligi=(s.rollBas&&s.rollSon)?(s.rollBas.replace('-','/')+' – '+s.rollSon.replace('-','/')):s.yil;

  const notlar=(s.notes||[]).length ? s.notes.map(n=>{
    const ad=n.ilgili_kisi||n.konu||'Not';
    const bas=(ad.trim()[0]||'N').toLocaleUpperCase('tr');
    return `<div class="msg" onclick="go('notlar')">
      <span class="msg-av">${esc(bas)}</span>
      <div class="msg-b"><div class="msg-t">${esc(n.konu||ad)}</div>
        <div class="msg-x">${esc(String(n.body||'').slice(0,58))}</div></div>
      <span class="msg-d">${esc(String(n.tarih||n.created_at||'').slice(5,10))}</span></div>`;}).join('')
    : '<p class="empty">Henüz not yok. Ekip notlarını Notlar bölümünden ekleyebilirsiniz.</p>';

  const rq=(s.recentQuotes||[]).map(q=>`<tr onclick="quoteView(${q.id})">
    <td class="mono dim">#${q.id}</td><td>${esc(q.customer_name||q.firma||'-')}</td>
    <td><span class="badge-st st-${esc(q.status||'yeni')}">${esc(QL[q.status]||'Yeni')}</span></td>
    <td class="mono dim">${(q.created_at||'').slice(0,10)}</td></tr>`).join('');

  c.innerHTML=`
  <div class="kpi2-row">${kpi}</div>
  <div class="dash-grid">
    <div class="dash-l">
      <section class="card">
        <div class="card-h"><h3>İş Takibi</h3>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="btn btn-outline btn-sm" onclick="go('is-takibi').then(()=>setTimeout(()=>jobForm(),200))">+ Yeni İş</button>
            <button class="btn-link" onclick="go('is-takibi')">Tümü</button></div></div>
        <div class="card-b">${jobsBoard(s.jobList||[])}</div>
      </section>
      <section class="card">
        <div class="card-h" style="cursor:pointer" onclick="go('listeler')" title="Doluluk bölümüne git"><h3>Doluluk Trendi</h3><span class="chip mono">${esc(araligi)}</span></div>
        <div class="card-b">${area}</div>
      </section>
      <section class="card">
        <div class="card-h"><h3>Son Teklifler</h3><button class="btn-link" onclick="go('teklifler')">Tümü</button></div>
        ${rq?`<table class="tbl rowlink"><thead><tr><th>#</th><th>Müşteri</th><th>Durum</th><th>Tarih</th></tr></thead><tbody>${rq}</tbody></table>`:'<div class="card-b"><p class="empty">Henüz teklif yok.</p></div>'}
      </section>
    </div>
    <div class="dash-r">
      <section class="card"><div class="card-b" id="calBox">${calWidget(ui._dashEvents)}</div></section>
      <section class="card">
        <div class="card-h"><h3>Son Notlar</h3><button class="btn-link" onclick="go('notlar')">Tümü</button></div>
        <div class="card-b msgs">${notlar}</div>
      </section>
      <section class="card">
        <div class="card-h" style="cursor:pointer" onclick="go('mecralar')" title="Mecralar bölümüne git"><h3>Mecra Dağılımı</h3><button class="btn-link">Tümü</button></div>
        <div class="card-b" style="cursor:pointer" onclick="go('mecralar')">${s.mecraDagilim.length?chartRows(s.mecraDagilim.map(m=>({l:m.name,v:m.adet,c:m.color}))):'<p class="empty">Mecra yok.</p>'}</div>
      </section>
    </div>
  </div>
`;
}

/* ---------- İŞ TAKİBİ (kanban) ---------- */
const JOBST=[['tasarim','Tasarımda'],['baski','Baskıda'],['montaj','Montajda'],['yayin','Yayında'],['arsiv','Arşiv']];
const JOBC={tasarim:'violet',baski:'amber',montaj:'cyan',yayin:'green',arsiv:'slate'};
function ekipRozet(aid){
  const t=(ui._team||[]).find(x=>x.id===aid); if(!t)return '';
  const bas=String(t.name||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toLocaleUpperCase('tr');
  return `<span class="asg" title="Atanan: ${esc(t.name)}">${esc(bas)}</span>`;
}
async function isTakibi(c){
  const [jobs,tm]=await Promise.all([api('jobs_list'),api('team_list')]); ui._team=tm||[];
  const toplam=jobs.filter(j=>j.status!=='arsiv').length;
  const cols=JOBST.map(([st,lbl],idx)=>{
    const list=jobs.filter(j=>j.status===st);
    const items=list.map(j=>`<article class="kcard">
      <div class="kc-t">${esc(j.title)}${j.assignee_id?ekipRozet(j.assignee_id):''}</div>
      ${j.note?`<div class="kc-m">${esc(j.note)}</div>`:''}
      <div class="kc-a">
        ${idx>0?`<button title="Geri al: ${esc(JOBST[idx-1][1])}" onclick="jobMove(${j.id},'${JOBST[idx-1][0]}')">${ic('left',15)}</button>`:'<span></span>'}
        ${idx<JOBST.length-1?`<button title="İlerlet: ${esc(JOBST[idx+1][1])}" onclick="jobMove(${j.id},'${JOBST[idx+1][0]}')">${ic('right',15)}</button>`:'<span></span>'}
        <button title="Düzenle" onclick="jobForm(null,${j.id})">${ic('pages',15)}</button>
        <button class="del" title="Sil" onclick="jobDelete(${j.id})">${ic('trash',15)}</button>
      </div></article>`).join('');
    return `<section class="kcol ${JOBC[st]||'slate'}">
      <header class="kcol-h"><span class="kdot"></span><h4>${esc(lbl)}</h4><span class="kcount mono">${list.length}</span></header>
      <div class="kcol-b">${items||'<p class="kempty">Kayıt yok</p>'}</div>
      <button class="kadd" onclick="jobForm('${st}')">${ic('plus',14)} Ekle</button>
    </section>`;
  }).join('');
  c.innerHTML=`<div class="sec-head">
      <div><h3>İş Akışı</h3><p class="sub">${toplam} aktif iş · aşamalar arasında oklarla taşıyın</p></div>
      <button class="btn btn-primary btn-sm" onclick="jobForm()">${ic('plus',15)} Yeni İş</button></div>
    <div class="kanban">${cols}</div>`;
}
async function jobMove(id,status){ await api('job_move',{id,status}); renderSection(); }
async function jobDelete(id){ if(await mpConfirm('Bu iş kaydı silinsin mi?','İşi Sil')){ await api('job_delete&id='+id); renderSection(); } }
async function jobForm(st,id){
  const veri=await guard(()=>Promise.all([api('customers_list'),api('suppliers_list'),api('mecra_list'),api('team_list')]),'Form açılamadı');
  if(!veri) return;
  const [cu,su,mc,tm]=veri; ui._team=tm||[];
  const j = id ? (await api('jobs_list')).find(x=>x.id===id)||{} : {};
  const opt=(arr,val,lbl)=>`<option value="">— yok —</option>`+arr.map(x=>
    `<option value="${x.id}" ${String(val)===String(x.id)?'selected':''}>${esc(lbl(x))}</option>`).join('');
  modal(`<h3 style="margin:0 0 14px">${id?'İşi Düzenle':'Yeni İş'}</h3>
  <input type="hidden" id="jid" value="${id||0}">
  <div class="field"><label class="flabel">Başlık *</label><input class="inp" id="jt" value="${esc(j.title)}" placeholder="ör. M1 AVM Megalight baskı"></div>
  <div class="row2">
    <div class="field"><label class="flabel">Müşteri</label><select class="inp" id="jc">${opt(cu,j.customer_id,x=>x.firma||x.ilgili_kisi)}</select></div>
    <div class="field"><label class="flabel">Mecra</label><select class="inp" id="jm">${opt(mc,j.mecra_id,x=>x.name)}</select></div>
  </div>
  <div class="row2">
    <div class="field"><label class="flabel">Tedarikçi (baskı/montaj)</label><select class="inp" id="jsup">${opt(su,j.supplier_id,x=>(x.firma||x.name||'—')+((x.kategori||x.type)?' · '+(x.kategori||x.type):''))}</select></div>
    <div class="field"><label class="flabel">Atanan ekip üyesi</label><select class="inp" id="jassg"><option value="">— Atanmadı —</option>${opt(tm,j.assignee_id,x=>x.name+(x.role?' · '+x.role:''))}</select></div>
    <div class="field"><label class="flabel">Aşama</label><select class="inp" id="js">${JOBST.map(x=>`<option value="${x[0]}" ${(j.status||st||'tasarim')===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
  </div>
  <div class="row2">
    <div class="field"><label class="flabel">Başlangıç</label><input class="inp" type="date" id="jsd" value="${esc(j.start_day)}"></div>
    <div class="field"><label class="flabel">Bitiş / teslim</label><input class="inp" type="date" id="jed" value="${esc(j.end_day)}"></div>
  </div>
  <div class="field"><label class="flabel">Not</label><textarea class="inp" id="jn">${esc(j.note)}</textarea></div>
  <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="jobSave()">Kaydet</button></div>`);
}
async function jobSave(){
  if(!gv('jt').trim()){ mpAlert('Başlık zorunlu.'); return; }
  const num=v=>v?+v:null;
  const r=await guard(()=>api('job_save',{id:+gv('jid')||0,title:gv('jt'),note:gv('jn'),status:gv('js')||'tasarim',
    customer_id:num(gv('jc')),mecra_id:num(gv('jm')),supplier_id:num(gv('jsup')),assignee_id:num(gv('jassg')),
    start_day:gv('jsd')||null,end_day:gv('jed')||null}),'İş kaydedilemedi');
  if(r===null) return;
  closeModal(); renderSection(); toast('İş kaydedildi.');
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
      <select class="inp" id="pikon" style="max-width:280px">${URUN_IKONLAR.map(x=>`<option value="${x[0]}" ${(p.ikon||'diger')===x[0]?'selected':''}>${x[1]}</option>`).join('')}</select></div>
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
async function exportRows(dosyaAdi, sheetAdi, cols, rows){
  try{ await xlsxLoad(); }catch(e){ mpAlert(e.message); return; }
  const head=cols.map(c=>c.label);
  const body=rows.map(r=>cols.map(c=>{
    const v=typeof c.get==='function'?c.get(r):r[c.key];
    return (v===null||v===undefined)?'':v; }));
  const ws=XLSX.utils.aoa_to_sheet([head,...body]);
  ws['!cols']=cols.map(c=>({wch:c.w||18}));
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheetAdi.slice(0,30));
  XLSX.writeFile(wb,`${dosyaAdi}-${_dt()}.xlsx`);
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
const JOBLBL={tasarim:'Tasarım',baski:'Baskı',montaj:'Montaj',yayin:'Yayın',arsiv:'Arşiv'};
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
  const [jb,cu,su,mc,al,un,bk,qs]=await Promise.all([
    sb.from('jobs').select('*').order('start_day'),
    api('customers_list'), api('suppliers_list'), api('mecra_list'),
    sb.from('alt_mecralar').select('*'), sb.from('units').select('*').order('sort').order('id'),
    sb.from('bookings').select('*'), sb.from('quotes').select('*').order('created_at',{ascending:false})
  ]);
  const cm={}; cu.forEach(x=>cm[x.id]=x);
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
    firma:(cm[j.customer_id]||{}).firma||'', kisi:(cm[j.customer_id]||{}).ilgili_kisi||'',
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
  const rows=list.map(m=>`<div class="list-item"><span class="dot" style="background:${esc(m.theme_color)}"></span><div class="nm">${esc(m.name)}</div><div class="meta">${cnt[m.id]||0} alt mecra</div>
    <button class="btn btn-outline btn-sm" onclick="mecReorder(${m.id},-1)" title="Yukarı">↑</button><button class="btn btn-outline btn-sm" onclick="mecReorder(${m.id},1)" title="Aşağı">↓</button><button class="btn btn-outline btn-sm" onclick="mecEdit(${m.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="mecDel(${m.id})">Sil</button></div>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Mecralar</h3><button class="btn btn-primary btn-sm" onclick="mecEdit(0)">+ Mecra ekle</button></div>${rows||'<p class="muted">Mecra yok.</p>'}<div id="mecEd"></div>`;
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
    <div class="mtabs">${T(0,'Genel')}${T(1,'Görseller')}${T(2,'Tanıtım')}${T(3,'Ayarlar')}</div>

    <div class="mtab-p on" data-mp="0">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Temel Bilgiler</label>
    <div class="row2"><div class="field"><label class="flabel">İsim (kart başlığı)</label><input class="inp" id="mname" value="${esc(m.name)}" oninput="slugHint('mname','mslug')"></div>
    <div class="field"><label class="flabel">Tema rengi</label><div class="colorwrap"><input type="color" id="mcolor" value="${esc(m.theme_color||'#0071e3')}" oninput="document.getElementById('mcolor2').value=this.value"><input class="inp" id="mcolor2" value="${esc(m.theme_color)}" oninput="document.getElementById('mcolor').value=this.value"></div></div></div>
    <div class="field"><label class="flabel">Sayfa adresi</label>
      <div class="slug-row"><span>/mecra/</span><input class="inp" id="mslug" value="${esc(m.slug)}" placeholder="otomatik: ${esc(pslug(m.name))}"></div>
      <p class="muted" style="font-size:11.5px;margin:5px 0 0">Boş bırakırsan isimden otomatik üretilir. Sonradan değiştirirsen eski linkler kırılır.</p></div>
    <div class="row2"><div class="field"><label class="flabel">Günlük gösterim</label><input class="inp" id="mgg" value="${esc(m.gunluk_gosterim)}" placeholder="≈ 250.000 gösterim"></div>
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
    <div class="field"><label class="flabel">Kapak yüksekliği (px)</label><input class="inp" type="number" id="mkh" value="${m.kapak_height!=null?m.kapak_height:600}"></div>
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
        return `<div class="row2" style="margin-bottom:8px">
          <input class="inp" id="mav_t${i}" value="${esc(a.t||a.title||'')}" placeholder="Başlık ${i+1}">
          <input class="inp" id="mav_d${i}" value="${esc(a.d||a.desc||'')}" placeholder="Kısa açıklama"></div>`;}).join('')}
      ${visSel('m',m,'avantajlar','Avantajlar')}</div>
    </div>

    <div class="mtab-p" data-mp="3">
    <div class="fld-box"><label class="flabel" style="font-weight:700">Logo ve bloklar</label>
      ${imgField('mlogo', m.logo, 'Logo (sidebar üstünde)', 'https://...')}
      ${visSel('m',m,'logo','Logo')}
      ${visSel('m',m,'gosterim','İstatistik bloğu')}
      ${visSel('m',m,'maps','Mini harita')}</div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Tanıtım sayfası</label>
      <p class="muted" style="font-size:12px;margin:0 0 10px">Kapalıyken ve bu mecrada tek bir alan varsa, ziyaretçi karta tıklayınca doğrudan o alanın detayına gider (duvar reklamı gibi tekil satılan yerler için).</p>
      <label class="switch"><input type="checkbox" id="mhub" ${m.hub===false?'':'checked'}><span class="sl"></span><span class="txt">Tanıtım sayfasını göster</span></label></div>
    </div>

    <div class="stickybar"><span class="dirty-msg" id="mecDirtyMsg"></span>
      <button class="btn btn-ghost btn-sm" onclick="mecVazgec(${id||0})">Vazgeç</button>
      <button class="btn btn-primary btn-sm" onclick="mecSave()">Mecrayı Kaydet</button></div>
    ${id?`<hr style="border:0;border-top:1px solid var(--line2);margin:18px 0"><div class="sec-head"><h3 style="font-size:15px">Alt Mecralar</h3><button class="btn btn-primary btn-sm" onclick="altAdd(${id})">+ Alt Mecra</button></div><div id="altList">Yükleniyor…</div>`:'<p class="muted" style="margin-top:12px">Alt mecraları, mecrayı kaydettikten sonra ekleyebilirsiniz.</p>'}
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
    const alanlar=[...p.querySelectorAll('input.inp,textarea.inp')].filter(e=>e.type!=='color');
    const dolu=alanlar.filter(e=>String(e.value||'').trim()!=='').length;
    const b=document.getElementById('mtb'+p.dataset.mp); if(!b)return;
    b.textContent=dolu+'/'+alanlar.length;
    b.classList.toggle('tam', dolu===alanlar.length && alanlar.length>0);
  });
}
async function mecSave(){ const id=+gv('mid');
  const prev=((ui._mecralar||[]).find(x=>x.id===id)||{}).visible||{};
  const visible=collectVis('m',['kapak','aciklama','kroki','avantajlar','logo','gosterim','maps'],prev);
  const avantajlar=[]; for(let i=0;i<4;i++){ const t=(gv('mav_t'+i)||'').trim(), d=(gv('mav_d'+i)||'').trim(); if(t||d)avantajlar.push({t,d}); }
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
    hub:document.getElementById('mhub').checked,
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
async function altAdd(mid){ const pid=(ui._products[0]||{}).id||null; const r=await api('alt_save',{mecra_id:mid,product_id:pid,name:'Yeni Alt Mecra'}); ui._alts=await api('alt_list&mecra_id='+mid); altEdit(r.id,mid); }
async function altDel(id,mid){ if(await mpConfirm('Alt mecra, pozisyonları ve doluluk geçmişiyle birlikte silinir.','Alt Mecrayı Sil')){ await api('alt_delete&id='+id); loadAltList(mid); } }

async function altEdit(id,mid){ if(ui._dirty && !(await dirtyGuard())) return;
  const alts=await api('alt_list&mecra_id='+mid); ui._alts=alts; const a=alts.find(x=>x.id===id)||{visible:{},avantajlar:[],galeri:[]};
  const vis=a.visible||{}; const adv=Array.isArray(a.avantajlar)?a.avantajlar:[]; const gal=Array.isArray(a.galeri)?a.galeri:[];
  const advInputs=[0,1,2,3].map(i=>{const x=adv[i]||{};return `<div class="row2"><div class="field"><input class="inp" id="av${i}t" value="${esc(x.t||x.title||'')}" placeholder="Avantaj ${i+1} başlık"></div><div class="field"><input class="inp" id="av${i}d" value="${esc(x.d||x.desc||'')}" placeholder="Açıklama"></div></div>`;}).join('');
  const galRows = gal.map((g,i)=>`<div class="list-item"><div class="nm" style="font-size:12px;word-break:break-all">${esc(g)}</div><button class="btn btn-danger btn-sm" onclick="altGalDel(${id},${mid},${i})">Sil</button></div>`).join('');
  const tog=(key,label)=>`<label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;margin:6px 0"><input type="checkbox" id="vis_${key}" ${vis[key]!==false?'checked':''}> ${label} ön yüzde göster</label>`;

  document.getElementById('mecEd').innerHTML=`<div class="sec-card" style="margin-top:16px">
    <button class="btn btn-outline btn-sm" onclick="mecEdit(${mid})">‹ Mecraya dön</button>
    <h3 style="margin:14px 0;font-size:16px">Alt Mecra</h3>
    <input type="hidden" id="aid" value="${id}"><input type="hidden" id="amid" value="${mid}">
    <div class="row2"><div class="field"><label class="flabel">Alt mecra adı</label><input class="inp" id="aname" value="${esc(a.name)}"></div>
      <div class="field"><label class="flabel">Ürün Seç</label><select class="inp" id="aprod">${ui._products.map(p=>`<option value="${p.id}" ${p.id==a.product_id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <div class="field"><label class="flabel">Sayfa adresi</label>
      <div class="slug-row"><span>/mecra/…/</span><input class="inp" id="aslug" value="${esc(a.slug)}" placeholder="otomatik"></div></div>
    <div class="field"><label class="flabel">Kapak başlığı (kapak görselinin üstünde)</label><input class="inp" id="abaslik" value="${esc(a.baslik)}"><br>${visSel('',a,'baslik','Kapak başlığı')}</div>
    <div class="fld-box"><label class="flabel" style="font-weight:700">Kapak altı tanıtım (kapağın hemen altında görünür)</label>
      <input class="inp" id="aintro" value="${esc(a.intro_baslik)}" placeholder="Başlık — ör. M1 AVM Megalight Alanları" style="margin-bottom:8px">
      <textarea class="inp" id="aacik" placeholder="Açıklama metni…" style="min-height:90px">${esc(a.aciklama)}</textarea>
      ${visSel('',a,'aciklama','Bu bölüm')}</div>
    <div class="row2"><div class="field"><label class="flabel">Günlük gösterim</label><input class="inp" id="agg" value="${esc(a.gunluk_gosterim)}"></div>
      <div class="field"><label class="flabel">Toplam alan</label><input class="inp" id="ata" value="${esc(a.toplam_alan)}"></div></div>
    ${imgField('aimage', a.image, 'Kart görseli', 'https://...')}
    <div class="field"><label class="flabel">Kapak görseli (1920×400 — detay üstü)</label><div style="display:flex;gap:8px"><input class="inp" id="akapak" value="${esc(a.kapak)}"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('akapak').value=u;})">Yükle</button></div></div>
    ${imgField('akapakm', a.kapak_mobil, 'Kapak — MOBİL sürüm (opsiyonel)', 'boş = masaüstü görseli kullanılır')}
    ${imgField('aimagem', a.image_mobil, 'Kart görseli — MOBİL sürüm (opsiyonel)', 'boş = masaüstü görseli kullanılır')}
    <div class="row2"><div class="field"><label class="flabel">Kapak kaplama rengi</label><input type="color" id="akcolor" value="${esc(a.kapak_color||'#101014')}"></div><div class="field"><label class="flabel">Kapak opasite (0–1)</label><input class="inp" type="number" min="0" max="1" step="0.05" id="akop" value="${a.kapak_opacity!=null?a.kapak_opacity:0.4}"></div></div>
    <div class="field"><label class="flabel">Kapak yüksekliği (px)</label><input class="inp" type="number" id="akh" value="${a.kapak_height!=null?a.kapak_height:600}"></div>
    <div class="field"><label class="flabel">Galeri görselleri</label>${galRows||'<p class="muted" style="font-size:12px">Henüz yok.</p>'}<div><button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="pickUpload('image/*',u=>altGalAdd(${id},${mid},u))">+ Galeri görseli ekle</button></div></div>
    <div class="field"><label class="flabel">Yerleşim planı görseli</label><div style="display:flex;gap:8px"><input class="inp" id="ayerlesim" value="${esc(a.yerlesim_plani)}"><button class="btn btn-outline btn-sm" style="flex:0 0 auto" onclick="pickUpload('image/*',u=>{document.getElementById('ayerlesim').value=u;})">Yükle</button></div></div>
    <div class="field"><label class="flabel">Marquee (kayan şerit — * ile ayır)</label><input class="inp" id="amarquee" value="${esc(a.marquee)}" placeholder="200+ Mağaza * 15M Ziyaretçi * ..."></div>
    <label class="switch" style="margin-bottom:10px"><input type="checkbox" id="apub" ${a.hidden===true?'':'checked'}><span class="sl"></span><span class="txt">Sitede yayında (kapalı = taslak)</span></label>
    <div class="field"><label class="flabel">Google Maps (iframe kodu)</label><textarea class="inp" id="amaps">${esc(a.maps)}</textarea>${visSel('',a,'maps','Harita')}</div>
    <div class="field"><label class="flabel">Avantajlar (4 mini kart)</label>${advInputs}${visSel('',a,'avantajlar','Avantajlar')}</div>
    <div class="field"><label class="flabel">Fiyatlandırma — Aylık baz (₺) + otomatik indirim %</label>
      <div class="row2"><input class="inp" id="afbaz" type="number" placeholder="Aylık baz ₺" value="${(a.fiyat&&a.fiyat.baz!=null)?a.fiyat.baz:''}"><input class="inp" id="afhafta" type="number" placeholder="Haftalık ₺ (ops)" value="${(a.fiyat&&a.fiyat.hafta!=null)?a.fiyat.hafta:''}"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:8px"><input class="inp" id="afind3" type="number" placeholder="3 Ay indirim %" value="${(a.fiyat&&a.fiyat.ind3!=null)?a.fiyat.ind3:''}"><input class="inp" id="afind6" type="number" placeholder="6 Ay indirim %" value="${(a.fiyat&&a.fiyat.ind6!=null)?a.fiyat.ind6:''}"><input class="inp" id="afind12" type="number" placeholder="1 Yıl indirim %" value="${(a.fiyat&&a.fiyat.ind12!=null)?a.fiyat.ind12:''}"></div>
      <p class="muted" style="font-size:12px;margin-top:6px">Boş bırakılırsa ürünün kendi fiyatları kullanılır. 3 Ay = baz×3×(1−%) · 1 Yıl = baz×12×(1−%). Pozisyonlar ve doluluk artık <b>Listeler</b> bölümünden yönetilir.</p></div>
    <button class="btn btn-primary btn-sm" onclick="altSave()">Alt Mecrayı Kaydet</button>
    </div>`;
  collapsify(document.getElementById('mecEd'),'form');
  document.getElementById('mecEd').scrollIntoView({behavior:'smooth'});
}
async function altSave(){ const id=+gv('aid'), mid=+gv('amid'); mecTemizle();
  const a0=(ui._alts||[]).find(x=>x.id===id)||{};
  const adv=[0,1,2,3].map(i=>({t:gv('av'+i+'t'),d:gv('av'+i+'d')})).filter(x=>x.t||x.d);
  const visible=collectVis('',['baslik','aciklama','maps','avantajlar','galeri'],a0.visible||{});
  const bz=gv('afbaz'); const fiyat = bz!==''? {baz:+bz, hafta:(gv('afhafta')!==''?+gv('afhafta'):null), ind3:+gv('afind3')||0, ind6:+gv('afind6')||0, ind12:+gv('afind12')||0} : null;
  await api('alt_save',{id,name:gv('aname'),product_id:+gv('aprod'),slug:(gv('aslug').trim()||pslug(gv('aname'))),baslik:gv('abaslik'),aciklama:gv('aacik'),intro_baslik:gv('aintro'),gunluk_gosterim:gv('agg'),toplam_alan:gv('ata'),image:gv('aimage'),image_mobil:gv('aimagem'),kapak:gv('akapak'),kapak_mobil:gv('akapakm'),kapak_color:gv('akcolor'),kapak_opacity:parseFloat(gv('akop')||'0.4'),kapak_height:parseInt(gv('akh')||'600',10),marquee:gv('amarquee'),yerlesim_plani:gv('ayerlesim'),maps:gv('amaps'),avantajlar:adv,fiyat,visible,hidden:!(document.getElementById('apub')||{checked:true}).checked});
  mpAlert('Alt mecra kaydedildi.'); altEdit(id,mid); }
async function altGalAdd(id,mid,url){ const alts=await api('alt_list&mecra_id='+mid); const a=alts.find(x=>x.id===id)||{}; const gal=Array.isArray(a.galeri)?a.galeri:[]; gal.push(url); await api('alt_save',{id,galeri:gal}); altEdit(id,mid); }
async function altGalDel(id,mid,idx){ const alts=await api('alt_list&mecra_id='+mid); const a=alts.find(x=>x.id===id)||{}; const gal=Array.isArray(a.galeri)?a.galeri:[]; gal.splice(idx,1); await api('alt_save',{id,galeri:gal}); altEdit(id,mid); }

async function unitAdd(altId,mid){ const alt=(ui._alts||await api('alt_list&mecra_id='+mid)).find(x=>x.id===altId)||{};
  await api('unit_save',{alt_mecra_id:altId,mecra_id:mid,product_id:alt.product_id,name:'Yeni Pozisyon'}); altEdit(altId,mid); }
async function unitSave(id,field,value){ const body={id}; body[field]=value; await api('unit_save',body); }
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
            lat:u.lat,lng:u.lng,konum:u.konum||''}; });
  const yes=hRows.filter(r=>r.lat!=null&&r.lng!=null).length;

  c.innerHTML=`
  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Harita Sayfası Metinleri</h3>
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
      <span class="muted" style="font-size:12.5px">Şu anki motor: <b>${st.googleMapsKey?'Google Maps':'OpenStreetMap (ücretsiz)'}</b></span></div></div>

  <div class="sec-card"><h3 style="margin:0 0 6px;font-size:16px">Konum İşaretleme</h3>
    <p class="muted" style="font-size:13px;margin:0 0 14px">Soldan bir pozisyon seçin, sonra <b>haritaya tıklayarak</b> yerini işaretleyin ve kaydedin. Kaydedince liste otomatik olarak <b>sıradaki işaretsiz pozisyona</b> geçer; aynı direğin A/B yüzeyleri için tek işaretleme yeter.
      <br>İşaretli konumlar sitedeki harita sayfasında pin olarak çıkar; yakın olanlar otomatik gruplanır.
      <br><b id="hCount">${yes}</b> / ${hRows.length} pozisyonun konumu işaretli.</p>
    <div class="hmap-grid">
      <div class="hmap-side">
        <input class="inp" id="hSearch" placeholder="Pozisyon / mecra ara…" oninput="hFilter(this.value)" style="margin-bottom:10px">
        <div id="hList" class="hlist"></div>
      </div>
      <div>
        <div id="hMapNote" class="banner" style="display:none;margin-bottom:10px"></div>
        <div class="hbar">
          <input class="inp" id="hGeo" placeholder="Adres / yer ara — ör. M1 Adana AVM" onkeydown="if(event.key==='Enter'){event.preventDefault();hGeoSearch()}">
          <button class="btn btn-outline btn-sm" onclick="hGeoSearch()">Bul</button>
          <input class="inp" id="hPaste" placeholder="Koordinat veya Maps linki yapıştır" onkeydown="if(event.key==='Enter'){event.preventDefault();hPasteCoord()}">
          <button class="btn btn-outline btn-sm" onclick="hPasteCoord()">Uygula</button>
        </div>
        <div id="hGeoRes" class="hgeores" style="display:none"></div>
        <div id="hSelBar" class="hselbar">Önce soldan bir pozisyon seçin.</div>
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
function hRenderList(){ const box=document.getElementById('hList'); if(!box)return;
  const cn=document.getElementById('hCount');
  if(cn) cn.textContent=hRows.filter(r=>r.lat!=null&&r.lng!=null).length;
  const list=hRows.filter(r=>!hQ||[r.unit,r.alt,r.mec,r.konum].some(x=>String(x||'').toLowerCase().includes(hQ)));
  box.innerHTML=list.length?list.map(r=>{ const ok=r.lat!=null&&r.lng!=null;
    return `<div class="hrow ${hSel===r.id?'on':''}" onclick="hPick(${r.id})">
      <span class="hdot" style="background:${ok?r.theme:'#d2d2d7'}"></span>
      <div class="hnm"><b>${esc(r.unit)}</b><span>${esc(r.mec)} › ${esc(r.alt)}</span></div>
      <span class="hst">${ok?'✓':'—'}</span></div>`;}).join(''):'<p class="muted" style="font-size:13px;padding:8px">Sonuç yok.</p>';
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
  hMap.on('click',e=>{ if(hSel==null){ mpAlert('Önce soldaki listeden bir pozisyon seçin.'); return; } hPlace(e.latlng.lat,e.latlng.lng); });
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
    <span class="hcoord" id="hCoord">${r.lat!=null?(+r.lat).toFixed(6)+', '+(+r.lng).toFixed(6):'konum yok — haritaya tıklayın'}</span>
    <button class="btn btn-primary btn-sm" onclick="hSave()">Konumu Kaydet</button>
    ${r.lat!=null?`<button class="btn btn-danger btn-sm" onclick="hClear()">Konumu Sil</button>`:''}`;
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

function lCell(u,ym,cmap,bmap,solo){
  if(!u) return `<span class="rcell yok" title="Bu yüzey tanımlı değil">–</span>`;
  const rec=(bmap[u.id]||{})[ym]; const st=rec?rec.s:'bos';
  const who=rec&&rec.c?(cmap[rec.c]||''):'';
  const surf=posParts(u.name).surf;
  const kod = who? String(who).trim().slice(0,3).toLocaleUpperCase('tr') : (solo?'':surf);
  return `<span class="rcell ${st}" data-u="${u.id}" data-ym="${ym}" data-surf="${surf}"
    onclick="rezAc(${u.id},'${ym}',event)"
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
  const bmap={}; (bk.data||[]).forEach(b=>{(bmap[b.unit_id]=bmap[b.unit_id]||{})[b.ym]={s:b.status,c:b.customer_id,n:b.note};});
  const rows=[];
  (un.data||[]).forEach(u=>{
    const a=alt[u.alt_mecra_id]||{}; const m=mm[a.mecra_id||u.mecra_id]||{};
    const p=posParts(u.name);
    for(let i=1;i<=12;i++){
      const ym=y+'-'+String(i).padStart(2,'0'); const r=(bmap[u.id]||{})[ym];
      rows.push({mecra:m.name||'',alt:a.name||'',pozisyon:p.base,yuzey:p.surf,ay:ym,
        durum:r?(r.s==='dolu'?'Dolu':'Rezerve'):'Boş',firma:r&&r.c?(cus[r.c]||''):'',not:r&&r.n?r.n:''});
    }
  });
  if(!rows.length){ mpAlert('Aktarılacak kayıt yok.'); return; }
  await exportRows('doluluk-'+y,'Doluluk '+y,[
    {key:'mecra',label:'Mecra',w:24},{key:'alt',label:'Alt Mecra',w:22},
    {key:'pozisyon',label:'Pozisyon',w:14},{key:'yuzey',label:'Yüzey',w:8},
    {key:'ay',label:'Ay',w:10},{key:'durum',label:'Durum',w:10},
    {key:'firma',label:'Firma',w:26},{key:'not',label:'Not',w:30}],rows);
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
  const cmap={}; custs.forEach(x=>cmap[x.id]=x.firma||x.ilgili_kisi||('#'+x.id)); window.__lcmap=cmap;
  const pmap={}; prods.forEach(p=>pmap[p.id]=p.name);
  const uByAlt={}; mlist.forEach(m=>(m.units||[]).forEach(u=>{ if(u.alt_mecra_id!=null)(uByAlt[u.alt_mecra_id]=uByAlt[u.alt_mecra_id]||[]).push(u); }));
  const altByMec={}; alts.forEach(a=>(altByMec[a.mecra_id]=altByMec[a.mecra_id]||[]).push(a));
  const bmap={}; bks.forEach(b=>{(bmap[b.unit_id]=bmap[b.unit_id]||{})[b.ym]={s:b.status,c:b.customer_id,n:b.note};}); window.__lbmap=bmap;
  const umap={}; mlist.forEach(m=>(m.units||[]).forEach(u=>umap[u.id]=u)); window.__lumap=umap;
  ui._L={mlist,altByMec,uByAlt,pmap,cmap,custs,y};

  const custOpts=custs.map(x=>`<option value="${x.id}">${esc(x.firma||x.ilgili_kisi||('#'+x.id))}</option>`).join('');
  const mecOpts=mlist.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Doluluk / Kiralama</h3>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn btn-ghost btn-sm" onclick="bookExport()">${ic('download',15)} Excel'e Aktar</button>
      <button class="btn btn-outline btn-sm" onclick="bookImport()">${ic('upload',15)} Excel'den Al</button>
      <div class="year-nav" style="margin:0"><button onclick="lYear(-1)">‹</button><span class="yr">${y}</span><button onclick="lYear(1)">›</button></div>
    </div></div>
    <div class="banner">Aya tıklayın: açılan pencereden <b>durumu seçin</b> (Boş / Dolu / Rezerve), <b>müşteri atayın</b> ya da oracıkta <b>yeni müşteri ekleyin</b> — eklenen müşteri, Müşteriler bölümünde de oluşur. Çift yüzlü pozisyonlarda (M1 megalight ve raketleri) her ayın altında iki kutu vardır: soldaki A (ön yüz), sağdaki B (arka yüz). Ziyaretçi firma adını görmez, yalnızca durumu görür.</div>
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
    if(e('lFd'))e('lFd').value=f.d||''; if(e('lFc'))e('lFc').value=f.c||''; }
  lFiltre();
}
function lTemizle(){ const e=id=>document.getElementById(id); if(e('lQ'))e('lQ').value='';
  ['lFm','lFd','lFc'].forEach(id=>{ if(e(id))e(id).value=''; }); lFiltre(); }
/* Bir A/B grubunun yıl içindeki durum kümesi ve kiralayan müşteri kümesi */
function lGrupBilgi(g,y,bmap){
  const st=new Set(), cs=new Set();
  for(const u of [g.A,g.B]){ if(!u)continue; const b=bmap[u.id]||{};
    for(let i=1;i<=12;i++){ const cell=b[y+'-'+pad(i)];
      if(cell){ st.add(cell.s); if(cell.c!=null)cs.add(String(cell.c)); } } }
  return {st,cs};
}
function lFiltre(){
  const L=ui._L, box=document.getElementById('lWrap'); if(!L||!box)return;
  const y=L.y, bmap=window.__lbmap;
  const q=(gv('lQ')||'').trim().toLocaleLowerCase('tr');
  const fm=gv('lFm')||'', fd=gv('lFd')||'', fc=gv('lFc')||'';
  const aktif=!!(q||fm||fd||fc);
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
        return true;
      });
      if(!groups.length && aktif) continue;    /* filtre varken boş alanları gizle */
      mecPoz+=groups.length;
      inner+=`<div class="sec-head" style="margin-top:10px"><h4 style="font-size:14px;margin:0">${esc(a.name)} <span class="muted">· ${esc(L.pmap[a.product_id]||'')}</span></h4><button class="btn btn-outline btn-sm" onclick="lAddPos(${a.id},${m.id},${a.product_id})">+ Pozisyon</button></div>`;
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
  ui._rez={uid,ym,st:cur?cur.s:'bos',cid:cur&&cur.c?cur.c:null,yeni:false};
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
  const bul=t?custs.filter(c=>[c.firma,c.ilgili_kisi,c.telefon].some(v=>String(v||'').toLocaleLowerCase('tr').includes(t))).slice(0,7):[];
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
          <input class="inp inp-sm" id="rzK" placeholder="İlgili kişi">
          <input class="inp inp-sm" id="rzT" placeholder="Telefon"></div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" onclick="rezYeniKaydet()">Müşteriyi Ekle</button>
          <button class="btn btn-ghost btn-sm" onclick="ui._rez.yeni=false;rezCiz()">Geri</button></div>`
      : `
        <input class="inp inp-sm" id="rzQ" placeholder="Müşteri ara — firma, kişi, telefon" value="${esc(q||'')}"
          oninput="ui._rez.q=this.value;rezCiz();document.getElementById('rzQ').focus();const v=this.value;const e=document.getElementById('rzQ');e.setSelectionRange(v.length,v.length)">
        ${bul.length?`<div class="rz-list">${bul.map(c=>`<button onclick="ui._rez.cid=${c.id};ui._rez.q='';rezCiz()">${esc(c.firma||c.ilgili_kisi||('#'+c.id))}${c.ilgili_kisi&&c.firma?`<span>${esc(c.ilgili_kisi)}</span>`:''}</button>`).join('')}</div>`
          :(t?'<p class="rz-not">Eşleşen müşteri yok.</p>':'')}
        <button class="btn btn-outline btn-sm" style="margin-top:6px" onclick="ui._rez.yeni=true;rezCiz()">＋ Yeni müşteri ekle</button>`}
    </div>`}
    <div class="rz-f">
      <button class="btn btn-ghost btn-sm" onclick="rezKapat()">Kapat</button>
      <button class="btn btn-primary btn-sm" onclick="rezKaydet()">Kaydet</button></div>`;
}
async function rezYeniKaydet(){
  const firma=(gv('rzF')||'').trim();
  if(!firma){ mpAlert('Firma adı gerekli.','Yeni Müşteri'); return; }
  const r=await guard(()=>api('customer_save',{firma,ilgili_kisi:gv('rzK'),telefon:gv('rzT')}),'Müşteri eklenemedi');
  if(r===null)return;
  const yeniM={id:r.id,firma,ilgili_kisi:gv('rzK'),telefon:gv('rzT')};
  if(ui._L){ ui._L.custs.push(yeniM); ui._L.cmap[r.id]=firma; }
  window.__lcmap[r.id]=firma;
  ui._rez.cid=r.id; ui._rez.yeni=false; ui._rez.q='';
  toast('Müşteri eklendi — Müşteriler bölümünde de görebilirsiniz.');
  rezCiz();
}
async function rezKaydet(){
  const {uid,ym,st}=ui._rez; const cid=st==='bos'?null:ui._rez.cid;
  const r=await guard(()=>api('booking_toggle',{unit_id:uid,ym,status:st,customer_id:cid}),'Kaydedilemedi');
  if(r===null)return;
  window.__lbmap[uid]=window.__lbmap[uid]||{};
  if(st==='bos')delete window.__lbmap[uid][ym]; else window.__lbmap[uid][ym]={s:st,c:cid};
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
  ui._lfSakla={q:gv('lQ'),m:gv('lFm'),d:gv('lFd'),c:gv('lFc')};   /* yıl değişince filtreler korunur */
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
  if(q) list=list.filter(x=>[x.firma,x.ilgili_kisi,x.telefon,x.eposta,x.vergi_no,x.vergi_dairesi,x.adres,x.birim,x.fatura_basligi]
    .some(v=>String(v||'').toLocaleLowerCase('tr').includes(q)));
  if(flt==='tel') list=list.filter(x=>x.telefon);
  else if(flt==='mail') list=list.filter(x=>x.eposta);
  else if(flt==='eksik') list=list.filter(x=>!x.telefon&&!x.eposta);
  else if(flt==='fatura') list=list.filter(x=>x.vergi_no&&x.vergi_dairesi);
  else if(flt==='fatura-eksik') list=list.filter(x=>!x.vergi_no||!x.vergi_dairesi);
  const ad=x=>String(x.firma||x.ilgili_kisi||'').toLocaleLowerCase('tr');
  if(srt==='ad') list.sort((a,b)=>ad(a).localeCompare(ad(b),'tr'));
  else if(srt==='adz') list.sort((a,b)=>ad(b).localeCompare(ad(a),'tr'));
  else if(srt==='yeni') list.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  else if(srt==='eski') list.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
  else if(srt==='puan') list.sort((a,b)=>(b.puan||0)-(a.puan||0));
  const say=document.getElementById('cSayi');
  if(say) say.textContent=(q||flt)?`${list.length} / ${(ui._cust||[]).length} müşteri gösteriliyor`:`${list.length} müşteri`;
  box.innerHTML=list.map(x=>`<div class="list-item"><div class="nm">${esc(x.firma||x.ilgili_kisi||('#'+x.id))}${x.puan?` <span class="pill" title="Puan">${'★'.repeat(Math.min(5,+x.puan||0))}</span>`:''}</div>
    <div class="meta">${esc(x.ilgili_kisi||'')}${x.telefon?' · '+esc(x.telefon):''}${x.eposta?' · '+esc(x.eposta):''}${(!x.telefon&&!x.eposta)?' · <span style="color:#b3261e">iletişim yok</span>':''}</div>
    <button class="btn btn-outline btn-sm" onclick="custForm(${x.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="custDel(${x.id})">Sil</button></div>`).join('')
    ||'<p class="empty">Eşleşen müşteri yok.</p>';
}
const CUST_COLS=[
  {key:'firma',label:'Firma',w:28},{key:'ilgili_kisi',label:'İlgili Kişi',w:20},
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
      alias:{firma:['unvan','müşteri','musteri','firma adı','cari'],ilgili_kisi:['yetkili','kişi','kisi','ilgili'],
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
    <div class="row2"><div class="field"><label class="flabel">Firma</label><input class="inp" id="cf" value="${esc(x.firma)}"></div>
    <div class="field"><label class="flabel">İlgili Kişi</label><input class="inp" id="cik" value="${esc(x.ilgili_kisi)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">Telefon</label><input class="inp" id="ct" value="${esc(x.telefon)}"></div>
    <div class="field"><label class="flabel">E-posta</label><input class="inp" id="ce" value="${esc(x.eposta)}"></div></div>
    <div class="field"><label class="flabel">Adres</label><input class="inp" id="ca" value="${esc(x.adres)}"></div>
    <div class="row3"><div class="field"><label class="flabel">Vergi No</label><input class="inp" id="cv" value="${esc(x.vergi_no)}"></div>
    <div class="field"><label class="flabel">Vergi Dairesi</label><input class="inp" id="cvd" value="${esc(x.vergi_dairesi)}"></div>
    <div class="field"><label class="flabel">Puan (0-5)</label><input class="inp" id="cp" type="number" min="0" max="5" value="${esc(x.puan||0)}"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="custSave()">Kaydet</button></div>`);
}
async function custSave(){ await api('customer_save',{id:+gv('cid'),firma:gv('cf'),ilgili_kisi:gv('cik'),telefon:gv('ct'),eposta:gv('ce'),adres:gv('ca'),vergi_no:gv('cv'),vergi_dairesi:gv('cvd'),puan:+gv('cp')}); closeModal(); renderSection(); }
async function custDel(id){ if(!await mpConfirm('Bu müşteri silinsin mi? Doluluk ve iş kayıtlarındaki bağlantıları boşalır.','Müşteriyi Sil'))return;
  await guard(()=>api('customer_delete',{id}),'Müşteri silinemedi'); renderSection(); }

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
  sb.from('quotes').update({okundu:true}).eq('id',id).then(()=>yeniTeklifKontrol(),()=>{}); const d=await api('quote_get&id='+id); const q=d.quote;
  const items=d.items.map(i=>`<tr><td>${esc(i.mecra_name)} — ${esc(i.unit_name)}</td><td>${esc(i.period)}</td><td>${esc(i.start_day||'-')}</td><td style="text-align:right">${money(i.price)}</td></tr>`).join('');
  modal(`<h3 style="margin:0 0 4px">Teklif #${q.id}</h3><p class="muted" style="margin:0 0 14px">${esc(q.customer_name||'')} · ${esc(q.firma||'')} · ${esc(q.telefon||'')} · ${esc(q.eposta||'')}</p>
    <table class="tbl"><thead><tr><th>Alan</th><th>Dönem</th><th>Başlangıç</th><th style="text-align:right">Fiyat</th></tr></thead><tbody>${items}</tbody></table>
    <div style="display:flex;justify-content:space-between;margin:14px 0;font-weight:700"><span>Toplam</span><span>${money(q.total)}</span></div>
    <div class="field"><label class="flabel">Durum</label><select class="inp" id="qs">${['yeni','gorusuldu','onaylandi','iptal'].map(s=>`<option value="${s}" ${q.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Kapat</button><button class="btn btn-primary btn-sm" onclick="quoteStatus(${q.id})">Durumu Kaydet</button></div>`);
}
async function quoteStatus(id){ const r=await api('quote_status',{id,status:gv('qs')}); closeModal();
  if(r && r.reserved!==undefined){ let msg='✓ '+r.reserved+' ay rezerve edildi (dolu işaretlendi). Müşteri ve İş Takibi kartı oluşturuldu.';
    if(r.conflicts && r.conflicts.length){ msg+='\n\n⚠ Çakışma (bu aylar başka müşteride dolu, atlandı):\n· '+r.conflicts.join('\n· '); }
    mpAlert(msg); }
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
    const veri=await guard(()=>Promise.all([api('units_full'),api('customers_list')]),'Veriler yüklenemedi');
    if(!veri) return;
    ui._qbUnits=veri[0]; ui._qbCust=veri[1];
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
          ${cu.map(x=>`<option value="${x.id}" ${String(QB.customer_id)===String(x.id)?'selected':''}>${esc(x.firma||x.ilgili_kisi||('#'+x.id))}</option>`).join('')}
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
  if(x){ document.getElementById('qbAd').value=x.ilgili_kisi||''; document.getElementById('qbFirma').value=x.firma||'';
         document.getElementById('qbTel').value=x.telefon||''; document.getElementById('qbMail').value=x.eposta||''; }
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
  const rows=list.map(x=>`<div class="list-item"><div class="nm">${esc(x.name)}</div><div class="meta">${esc(x.role||'')} · ${esc(x.yetki||'')}</div>
    <button class="btn btn-outline btn-sm" onclick="teamForm(${x.id})">Düzenle</button><button class="btn btn-danger btn-sm" onclick="teamDel(${x.id})">Sil</button></div>`).join('');
  c.innerHTML=`<div class="sec-head"><h3>Ekip</h3><button class="btn btn-primary btn-sm" onclick="teamForm(0)">+ Kişi</button></div>${rows||'<p class="muted">Kişi yok.</p>'}`;
}
function teamForm(id){ const x=(ui._team||[]).find(t=>t.id===id)||{};
  modal(`<h3 style="margin:0 0 14px">${id?'Kişi Düzenle':'Yeni Kişi'}</h3><input type="hidden" id="tid" value="${id||0}">
    <div class="row2"><div class="field"><label class="flabel">Ad Soyad</label><input class="inp" id="tn" value="${esc(x.name)}"></div>
    <div class="field"><label class="flabel">Görev</label><input class="inp" id="tr" value="${esc(x.role)}"></div></div>
    <div class="row2"><div class="field"><label class="flabel">Yetki</label><input class="inp" id="ty" value="${esc(x.yetki)}"></div>
    <div class="field"><label class="flabel">Telefon</label><input class="inp" id="tt" value="${esc(x.telefon)}"></div></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-ghost btn-sm" onclick="closeModal()">Vazgeç</button><button class="btn btn-primary btn-sm" onclick="teamSave()">Kaydet</button></div>`);
}
async function teamSave(){ await api('team_save',{id:+gv('tid'),name:gv('tn'),role:gv('tr'),yetki:gv('ty'),telefon:gv('tt')}); closeModal(); renderSection(); }
async function teamDel(id){ if(await mpConfirm('Ekip üyesi silinsin mi?','Üyeyi Sil')){ await api('team_delete&id='+id); renderSection(); } }

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
  await api('customer_save',{firma:l.firma||l.ad,ilgili_kisi:l.ad,telefon:l.telefon,eposta:l.eposta,not:'Medya planlama talebinden: '+[l.butce,(Array.isArray(l.mecralar)?l.mecralar.join(', '):'')].filter(Boolean).join(' · ')});
  closeModal(); toast('Müşteri kaydı oluşturuldu.');
}
async function leadDel(id){ if(!await mpConfirm('Talep silinsin mi?','Talebi Sil'))return; await sb.from('leads').delete().eq('id',id); renderSection(); }

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
async function saveGorunum(){ await api('settings_save',{logoText:gv('gLogoT'),logoImage:gv('gLogoI'),favicon:gv('gFav')}); toast('Kaydedildi. Sitede Ctrl+F5 ile görünür.'); }
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
  if(br){ if(t.logo) br.innerHTML=`<img src="${esc(t.logo)}" alt="" style="max-height:34px;max-width:160px;object-fit:contain"><span class="brand-sub">Yönetim Paneli</span>`; }
}
function refAdd(u){ ui._settings.refLogos=Array.isArray(ui._settings.refLogos)?ui._settings.refLogos:[]; ui._settings.refLogos.push(u); refSave(true); }
function refDel(i){ (ui._settings.refLogos||[]).splice(i,1); refSave(true); }
async function refSave(sessiz){ await api('settings_save',{refTitle:gv('refT')||'Referanslar',refLogos:ui._settings.refLogos||[]}); if(sessiz){renderSection();} else toast('Kaydedildi. Sitede Ctrl+F5 ile görünür.'); }
async function saveSocial(){ await api('settings_save',{social_whatsapp:gv('soWa'),social_instagram:gv('soIg'),social_linkedin:gv('soLi'),social_facebook:gv('soFb'),social_x:gv('soTw'),social_youtube:gv('soYt')}); mpAlert('Kaydedildi.'); }
async function saveSeo(){ await api('settings_save',{seoTitle:gv('seoT'),seoDesc:gv('seoD'),seoKeywords:gv('seoK')}); mpAlert('Kaydedildi.'); }
async function saveFooter(){ await api('settings_save',{footer_about:gv('fAbout'),footer_news:gv('fNews'),footer_note:gv('fNote')}); mpAlert('Kaydedildi.'); }
async function exportBackup(){ const tables=['settings','pages','products','mecralar','alt_mecralar','units','bookings','customers','quotes','quote_items','jobs','team','notes','suppliers'];
  const out={_exported:new Date().toISOString()}; for(const t of tables){ try{ const {data}=await sb.from(t).select('*'); out[t]=data||[]; }catch(e){ out[t]='HATA'; } }
  const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='medyapark-yedek-'+new Date().toISOString().slice(0,10)+'.json'; a.click(); URL.revokeObjectURL(a.href); }
async function changePw(){ const p=gv('npw'); if(p.length<4){mpAlert('En az 4 karakter.');return;} await api('password_change',{password:p}); mpAlert('Şifre güncellendi.'); }

boot();
