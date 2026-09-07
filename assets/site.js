const MONTHS_LONG=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
let D={settings:{},pages:[],products:[],mecralar:[],altById:{}};
let view={type:'home',filter:null}, roll=0, cart=[];
let galImgs=[], galIdx=0, galTimer=null;

const app=()=>document.getElementById('app');
const money=n=> typeof n==='number'? n.toLocaleString('tr-TR')+' ₺' : (n||'');
const pad=n=>String(n).padStart(2,'0');
const curYm=()=> new Date().getFullYear()+'-'+pad(new Date().getMonth()+1);
const prod=id=>D.products.find(p=>String(p.id)===String(id))||{};
const mec=id=>D.mecralar.find(m=>String(m.id)===String(id));
/* aramada kullanılan eş anlamlılar: müşteri kendi diliyle arasın */
const ES_ANLAM={
  megalight:['bilbord','billboard','pano','büyük pano','megalight'],
  raket:['raket','clp','vitrin','küçük pano','durak panosu'],
  'led ekran':['led','ekran','dijital','digital','led ekran'],
  megaboard:['megaboard','dev pano','büyük board','board'],
  'akıllı durak':['durak','otobüs','otobus','duraklar','akıllı durak'],
  avm:['avm','alışveriş','alisveris','mall'],
  stadyum:['stat','stadyum','maç','mac','spor']
};
function esAnlamEslesti(q,metin){
  const m=String(metin||'').toLocaleLowerCase('tr');
  for(const [anahtar,kelimeler] of Object.entries(ES_ANLAM)){
    if(!m.includes(anahtar)) continue;
    if(kelimeler.some(k=>k.includes(q)||q.includes(k))) return true;
  }
  return false;
}
const esc=s=>(s==null?'':String(s)).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
/* Görünürlük: 'both' | 'desktop' | 'mobile' | 'off'  (eski true/false ile uyumlu) */
function visMode(o,key){ const v=o&&o.visible&&o.visible[key];
  if(v===undefined||v===null||v===true) return 'both';
  if(v===false) return 'off';
  return ['both','desktop','mobile','off'].includes(v)?v:'both'; }
const vis=(o,key,has)=> !!has && visMode(o,key)!=='off';
/* bölüme eklenecek sınıf: masaüstü/mobil kısıtı */
function visCls(o,key){ const m=visMode(o,key); return m==='desktop'?' only-desk':(m==='mobile'?' only-mob':''); }
/* Arka plan görseli: mobil sürümü varsa iki katman (gizli katmanın görseli indirilmez) */
function bgLayers(desk,mob,cls,style){
  cls=cls||''; style=style||'';
  if(mob&&mob!==desk) return `<div class="${cls} only-desk" style="${style}${desk?`background-image:url('${esc(desk)}')`:''}"></div>`+
                             `<div class="${cls} only-mob" style="${style}${`background-image:url('${esc(mob)}')`}"></div>`;
  return `<div class="${cls}" style="${style}${desk?`background-image:url('${esc(desk)}')`:''}"></div>`; }
/* <img> için mobil sürüm */
function picture(desk,mob,cls,alt){
  if(mob&&mob!==desk) return `<picture><source media="(max-width:760px)" srcset="${esc(mob)}"><img class="${cls||''}" src="${esc(desk)}" alt="${esc(alt||'')}" loading="lazy"></picture>`;
  return `<img class="${cls||''}" src="${esc(desk)}" alt="${esc(alt||'')}" loading="lazy">`; }
function perMonth(p){ const pr=p.prices||{}; if(typeof pr['1 Ay']==='number')return pr['1 Ay']; for(const v of Object.values(pr)){ if(typeof v==='number')return v; } return 0; }
function hexToRgb(h){ if(!h)return '63,111,99'; h=String(h).replace('#',''); if(h.length===3)h=h.split('').map(c=>c+c).join(''); if(h.length!==6)return '63,111,99'; const n=parseInt(h,16); return `${(n>>16)&255},${(n>>8)&255},${n&255}`; }
function gcard(onclick,title,sub,image,theme,label,imageM,href){ const rgb=hexToRgb(theme);
  return `<a class="tile" href="${esc(href||'#')}" onclick="${onclick};return false;" style="--tc-rgb:${rgb}">
    ${bgLayers(image,imageM,'bg','')}<div class="ov"></div>
    <div class="ct"><h3>${esc(title)}</h3>${sub?`<p class="tsub">${esc(sub)}</p>`:''}
      <div class="xp"><b>${esc(label||'Keşfet')}</b><span class="arw">→</span></div></div></a>`; }

async function load(){
  try{
    const [stg,pg,pr,mc,al,un,bk] = await Promise.all([
      sb.from('settings').select('k,v'), sb.from('pages').select('*').order('sort'),
      sb.from('products').select('*').order('sort'), sb.from('mecralar').select('*').order('sort'),
      sb.from('alt_mecralar').select('*').order('sort').order('id'),
      sb.from('units').select('*').order('sort').order('id'), sb.from('bookings').select('unit_id,ym,status')
    ]);
    const err=[stg,pg,pr,mc,al,un,bk].map(x=>x.error).find(Boolean); if(err) throw err;
    const settings={}; (stg.data||[]).forEach(r=>settings[r.k]=r.v);
    /* taslak (hidden) mecra ve alanlar sitede hiç görünmez */
    mc.data=(mc.data||[]).filter(m=>m.hidden!==true);
    al.data=(al.data||[]).filter(a=>a.hidden!==true);
    const products=pr.data||[]; const prodOf=id=>products.find(p=>String(p.id)===String(id))||{};
    const bmap={}; (bk.data||[]).forEach(b=>{(bmap[b.unit_id]=bmap[b.unit_id]||[]).push({ym:b.ym,status:b.status});});
    const uByAlt={}; (un.data||[]).forEach(u=>{u.booked=bmap[u.id]||[]; if(u.alt_mecra_id!=null)(uByAlt[u.alt_mecra_id]=uByAlt[u.alt_mecra_id]||[]).push(u);});
    const altById={}, altByMec={};
    (al.data||[]).forEach(a=>{ a.units=uByAlt[a.id]||[]; a.product=prodOf(a.product_id); altById[a.id]=a; (altByMec[a.mecra_id]=altByMec[a.mecra_id]||[]).push(a); });
    const mecralar=(mc.data||[]).map(m=>({...m, alts:altByMec[m.id]||[]}));
    D={settings, pages:pg.data||[], products, mecralar, altById};
  }catch(e){ app().innerHTML='<div class="loading">Veri yüklenemedi: '+esc(e.message||e)+'</div>'; return; }
  const s=D.settings||{};
  document.getElementById('brand').innerHTML = s.logoImage?`<img class="brandimg" src="${esc(s.logoImage)}" alt="logo">`:logo(s.logoText);
  if(s.seoTitle) document.title=s.seoTitle; if(s.seoDesc){ const md=document.getElementById('metaDesc'); if(md)md.setAttribute('content',s.seoDesc); }
  if(s.catalogPdf){ const b=document.getElementById('pdfBtn'); b.href=s.catalogPdf; b.style.display='flex'; }
  /* yukarı git oku */
  if(!document.getElementById('toTop')){ const t=document.createElement('button'); t.id='toTop'; t.title='Yukarı git';
    t.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5m0 0l-6 6m6-6l6 6"/></svg>';
    t.onclick=()=>window.scrollTo({top:0,behavior:'smooth'}); document.body.appendChild(t);
    window.addEventListener('scroll',()=>t.classList.toggle('on',window.scrollY>500),{passive:true}); }
  /* favicon (panelden yüklenir) */
  if(s.favicon){ let l=document.head.querySelector("link[rel~='icon']");
    if(!l){ l=document.createElement('link'); l.rel='icon'; document.head.appendChild(l); } l.href=s.favicon; }
  /* header: whatsapp + sosyal ikonlar */
  if(s.social_whatsapp){ const w=document.getElementById('waBtn'); if(w){ w.href=s.social_whatsapp; w.style.display='flex'; } }
  const sbx=document.getElementById('socialBtns');
  if(sbx){ const ic={
    instagram:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>',
    facebook:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7h2.4l.4-3h-2.8V9.1c0-.9.3-1.5 1.6-1.5h1.3V4.9c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3V11H9v3h2.3v7h2.2z"/></svg>',
    linkedin:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.4 8.6H3.7V20h2.7V8.6zM5 7.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2zM20.3 20h-2.7v-5.6c0-1.4-.5-2.3-1.7-2.3-.9 0-1.5.6-1.7 1.2-.1.2-.1.5-.1.8V20h-2.7V8.6h2.7v1.2c.4-.6 1.1-1.5 2.8-1.5 2 0 3.4 1.3 3.4 4.1V20z"/></svg>',
    x:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.3 3H20l-6.6 7.6L21 21h-5.9l-4.6-6-5.3 6H2.5l7.1-8.1L3 3h6l4.1 5.5L17.3 3zm-1 16.2h1.6L7.7 4.7H6l10.3 14.5z"/></svg>',
    youtube:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.6 7.2a2.8 2.8 0 0 0-2-2C17.9 4.8 12 4.8 12 4.8s-5.9 0-7.6.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 2 12a29 29 0 0 0 .4 4.8 2.8 2.8 0 0 0 2 2c1.7.4 7.6.4 7.6.4s5.9 0 7.6-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 22 12a29 29 0 0 0-.4-4.8zM10 15.2V8.8L15.5 12 10 15.2z"/></svg>'};
    const links=[[s.social_instagram,'instagram','Instagram'],[s.social_facebook,'facebook','Facebook'],
      [s.social_linkedin,'linkedin','LinkedIn'],[s.social_x,'x','X'],[s.social_youtube,'youtube','YouTube']]
      .filter(x=>x[0]);
    sbx.innerHTML=links.map(x=>`<a class="iconbtn soc" href="${esc(x[0])}" target="_blank" rel="noopener" title="${x[2]}">${ic[x[1]]}</a>`).join(''); }
  buildFilter(); renderFooter(); renderMenu(); initAnalytics();
  view=pathToView(location.pathname);
  render(); pushRoute(true);
}
function logo(t){ t=t||'medyapark'; return String(t).toLowerCase().startsWith('medya')?('medya<span>'+esc(String(t).slice(5))+'</span>'):esc(t); }

function render(fromHistory){
  if(view.type==='home')renderHome(); else if(view.type==='mec')renderMec();
  else if(view.type==='alt')renderAlt(); else if(view.type==='map')renderMap();
  else if(view.type==='plan')renderPlan();
  else renderPage(view.slug);
  badge();
  if(!fromHistory) pushRoute();
  else setMeta();
  window.scrollTo({top:0,behavior:'smooth'}); }
function goHome(){ view={type:'home',filter:view.filter||null}; const s=document.getElementById('search'); if(s)s.value=''; render(); }
function openMec(id){ view={type:'mec',id}; render(); }
function openAlt(mecId,altId){ view={type:'alt',mecId,altId,gidx:0}; roll=0; render(); }
function gPick(i){ view.gidx=i; renderAlt(); }
function gMove(d){ const a=D.altById[view.altId]; const n=(a&&Array.isArray(a.galeri)?a.galeri.length:0)||1; view.gidx=((view.gidx||0)+d+n)%n; renderAlt(); }
function openPage(slug){ view={type:'page',slug}; render(); }
function openPlan(){ view={type:'plan'}; render(); }
function onSearch(q){ if(view.type==='map'){ mapQuery=q||''; refreshPins(); return; }
  if(view.type!=='home')view={type:'home',filter:view.filter,filterLoc:view.filterLoc}; homeQ=q||''; renderHome(); }

/* ---- filtre (ürün türüne göre) ---- */
function buildFilter(){ const m=document.getElementById('filterMenu'); if(!m)return;
  m.innerHTML=`<a class="${!view.filter?'on':''}" onclick="setFilter(null)">Tümü</a>`+D.products.map(p=>`<a class="${String(view.filter)===String(p.id)?'on':''}" onclick="setFilter('${p.id}')">${esc(p.name)}</a>`).join(''); }
function toggleFilter(e){ e.stopPropagation(); const m=document.getElementById('filterMenu'); if(m)m.classList.toggle('open'); }
function setFilter(pid){ view.filter=pid; buildFilter(); const fm=document.getElementById('filterMenu'); if(fm)fm.classList.remove('open');
  if(view.type==='map'){ refreshPins(); return; }
  view.type='home'; renderHome(); }

function animateCounters(){ document.querySelectorAll('.cnt').forEach(el=>{ const to=+el.dataset.to,dur=1200,t0=performance.now();
  (function step(t){ const p=Math.min(1,(t-t0)/dur); el.textContent=Math.floor(p*to).toLocaleString('tr-TR'); if(p<1)requestAnimationFrame(step); })(t0); }); }


function galRender(){ const img=document.getElementById('galImg'); if(!img)return; img.style.backgroundImage=galImgs.length?`url('${galImgs[galIdx]}')`:''; if(galImgs.length)img.textContent=''; const dots=document.getElementById('galDots'); if(dots)[...dots.children].forEach((d,i)=>d.classList.toggle('on',i===galIdx)); }
function galGo(d){ if(galImgs.length<2)return; galIdx=(galIdx+d+galImgs.length)%galImgs.length; galRender(); resetGalTimer(); }
function galSet(i){ galIdx=i; galRender(); resetGalTimer(); }
function resetGalTimer(){ clearInterval(galTimer); if(galImgs.length>1) galTimer=setInterval(()=>{ if(view.type!=='alt'){clearInterval(galTimer);return;} galIdx=(galIdx+1)%galImgs.length; galRender(); },3000); }
function banner(obj,title,navHTML){ obj=obj||{}; const img=obj.kapak, imgM=obj.kapak_mobil;
  const h=(obj.kapak_height||600); const rgb=hexToRgb(obj.kapak_color||'#101014');
  const op=(obj.kapak_opacity!=null&&obj.kapak_opacity!==''?obj.kapak_opacity:0.4);
  const cls=img?'light':'dark';
  const layers=(img||imgM)?bgLayers(img,imgM,'cov-bg',''):'';
  const ov=img?`<div class="cov-ov" style="background:rgba(${rgb},${op})"></div>`:'';
  const ph=img?'':`<div class="cov-ph">KAPAK GÖRSELİ · ${h}px</div>`;
  return `<div class="cover-banner" style="height:${h}px">${layers}${ph}${ov}<div class="cov-inner"><nav class="cov-nav ${cls}" aria-label="Sayfa yolu">${navHTML||''}</nav></div></div>`; }
const showPrices=()=> (D.settings||{}).showPrices!==false;
/* Kapak altı: başlık + açıklama */
function introBlock(o,bare){ o=o||{};
  const t=o.intro_baslik||'', d=o.aciklama||'';
  if(!vis(o,'aciklama',!!(t||d))) return '';
  const inner=`${t?`<h1>${esc(t)}</h1>`:''}${d?`<p>${esc(d)}</p>`:''}`;
  return `<section class="intro${bare?' bare':''}${visCls(o,'aciklama')}">${inner}</section>`; }
function altPrices(alt,p){ const f=alt&&alt.fiyat; if(f&&f.baz!=null&&f.baz!==''){ const baz=+f.baz; const per=(mon,ind)=>Math.round(baz*mon*(1-(+ind||0)/100)); const rows=[]; if(f.hafta!=null&&f.hafta!=='')rows.push(['Haftalık',Math.round(+f.hafta)]); rows.push(['1 Ay',Math.round(baz)]); rows.push(['3 Ay',per(3,f.ind3)]); rows.push(['6 Ay',per(6,f.ind6)]); rows.push(['1 Yıl',per(12,f.ind12)]); return rows; } return Object.entries((p&&p.prices)||{}); }
function altPerMonth(alt,p){ const f=alt&&alt.fiyat; if(f&&f.baz!=null&&f.baz!=='')return Math.round(+f.baz); return perMonth(p); }


/* ================= ADRES YÖNETİMİ (temiz linkler) ================= */
/* Sitenin kök dizini script yolundan otomatik bulunur (alt klasörde de çalışır) */
const BASE=(function(){
  const p=location.pathname;
  const m=p.match(/^(.*?)\/(?:mecra|sayfa|harita|nerelerdeyiz)(?:\/|$)/);
  return m ? m[1]+'/' : p.replace(/[^\/]*$/,'');
})();

function slugify(t){ return String(t||'').toLocaleLowerCase('tr')
  .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
  .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70) || 'sayfa'; }
const mSlug=m=>(m&&m.slug)||slugify(m&&m.name);
const aSlug=a=>(a&&a.slug)||slugify((a&&a.product&&a.product.name)||(a&&a.name));

/* görünüm -> adres */
function viewPath(v){
  v=v||view;
  if(v.type==='mec'){ const m=mec(v.id); return m?`mecra/${mSlug(m)}`:''; }
  if(v.type==='alt'){ const m=mec(v.mecId), a=(D.altById||{})[v.altId];
    return (m&&a)?`mecra/${mSlug(m)}/${aSlug(a)}`:''; }
  if(v.type==='map') return 'nerelerdeyiz';
  if(v.type==='page') return `sayfa/${v.slug}`;
  if(v.type==='plan') return 'medya-planlama';
  return '';
}
/* adres -> görünüm */
function pathToView(pathname){
  let p=decodeURIComponent(pathname||'');
  if(p.startsWith(BASE)) p=p.slice(BASE.length);
  p=p.replace(/^\/+|\/+$/g,'').replace(/\.html$/,'');
  if(!p) return {type:'home'};
  const seg=p.split('/');
  if(seg[0]==='nerelerdeyiz'||seg[0]==='harita') return {type:'map'};
  if(seg[0]==='sayfa'&&seg[1]) return {type:'page',slug:seg[1]};
  if(seg[0]==='medya-planlama') return {type:'plan'};
  if(seg[0]==='mecra'&&seg[1]){
    const m=D.mecralar.find(x=>mSlug(x)===seg[1]);
    if(!m) return {type:'home'};
    if(seg[2]){ const a=(m.alts||[]).find(x=>aSlug(x)===seg[2]);
      if(a) return {type:'alt',mecId:m.id,altId:a.id,gidx:0}; }
    return {type:'mec',id:m.id};
  }
  return {type:'home'};
}
function pushRoute(replace){
  try{
    const url=BASE+viewPath();
    if(location.pathname!==url) history[replace?'replaceState':'pushState']({v:view},'',url);
  }catch(e){ /* file:// veya kısıtlı ortam — adres güncellenemese de site çalışır */ }
  try{ setMeta(); }catch(e){}
  gaPage();
}
window.addEventListener('popstate',()=>{ view=pathToView(location.pathname); render(true); });

/* ================= SAYFA BAŞLIĞI / META ================= */
function setMeta(){
  const st=D.settings||{}, site=st.logoText||'Medyapark Adana';
  let t=st.seoTitle||site, d=st.seoDesc||'', img=st.logoImage||'';
  if(view.type==='mec'){ const m=mec(view.id);
    if(m){ t=`${m.name} Reklam Alanları — ${site}`;
      d=(m.aciklama||'').slice(0,155)|| `${m.name} lokasyonundaki açık hava reklam alanları, pozisyonlar ve doluluk durumu.`;
      img=m.kapak||m.image||img; } }
  else if(view.type==='alt'){ const m=mec(view.mecId), a=(D.altById||{})[view.altId];
    if(m&&a){ const pn=(a.product&&a.product.name)||a.name;
      t=`${m.name} ${pn} — ${site}`;
      d=(a.aciklama||'').slice(0,155)|| `${m.name} ${pn} reklam alanları: ölçü, teknik özellik ve aylık doluluk durumu.`;
      img=a.image||a.kapak||m.image||img; } }
  else if(view.type==='map'){ t=`Reklam Alanları Haritası — ${site}`; d='Adana genelindeki tüm açık hava reklam alanlarımızı harita üzerinde inceleyin.'; }
  else if(view.type==='plan'){ const pl=(D.settings||{}).plan||{}; t=`${pl.title||'Medya Planlama'} — ${site}`; d=(pl.desc||'Kampanyanız için ücretsiz medya planlama talebi bırakın.').slice(0,155); }
  else if(view.type==='page'){ const pg=(D.pages||[]).find(p=>p.slug===view.slug);
    if(pg){ t=`${pg.title} — ${site}`; d=String(pg.body||'').replace(/<[^>]*>/g,'').slice(0,155); } }
  document.title=t;
  const setTag=(sel,attr,val)=>{ let el=document.head.querySelector(sel);
    if(!el){ el=document.createElement('meta');
      if(sel.includes('property')) el.setAttribute('property',sel.match(/"([^"]+)"/)[1]);
      else el.setAttribute('name',sel.match(/"([^"]+)"/)[1]);
      document.head.appendChild(el); }
    el.setAttribute(attr,val||''); };
  setTag('meta[name="description"]','content',d);
  setTag('meta[property="og:title"]','content',t);
  setTag('meta[property="og:description"]','content',d);
  setTag('meta[property="og:type"]','content','website');
  setTag('meta[property="og:image"]','content',img);
  setTag('meta[property="og:url"]','content',location.origin+BASE+viewPath());
  setTag('meta[name="twitter:card"]','content','summary_large_image');
  let cn=document.head.querySelector('link[rel="canonical"]');
  if(!cn){ cn=document.createElement('link'); cn.rel='canonical'; document.head.appendChild(cn); }
  cn.href=location.origin+BASE+viewPath();
}

/* ---- ANASAYFA ---- */
/* ---- reklam alanı ikonları ---- */
const URUN_IKON={
 billboard:'<rect x="3" y="4" width="18" height="11" rx="1.5"/><path d="M12 15v6M8.5 21h7"/>',
 raket:'<rect x="6.5" y="3" width="11" height="15" rx="1.5"/><path d="M12 18v3"/>',
 led:'<rect x="2.5" y="5" width="19" height="12" rx="1.5"/><path d="M7 21h10M12 17v4"/><path d="M7 9.5h3M7 12.5h6"/>',
 durak:'<path d="M3 17V8.5A2.5 2.5 0 0 1 5.5 6H15v11"/><path d="M15 9h3.2l2.3 3v5H15"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>',
 megaboard:'<rect x="2" y="5" width="20" height="9" rx="1"/><path d="M6 14v7M18 14v7"/>',
 duvar:'<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 15h18M9 4v5.5M15 9.5V15M9 15v5"/>',
 totem:'<rect x="8" y="2.5" width="8" height="14" rx="1.5"/><path d="M12 16.5v5M8.5 21.5h7"/>',
 diger:'<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5M12 16h.01"/>'
};
function uIkon(ad,sz){ const p=URUN_IKON[ad||'diger']||URUN_IKON.diger;
  return `<svg class="ui-ic" viewBox="0 0 24 24" width="${sz||17}" height="${sz||17}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`; }

function homeListe(){
  const q=(homeQ||'').trim().toLowerCase();
  let list=D.mecralar.slice();
  if(view.filter) list=list.filter(m=>(m.alts||[]).some(a=>String(a.product_id)===String(view.filter)));
  if(view.filterLoc) list=list.filter(m=>String(m.id)===String(view.filterLoc));
  if(q) list=list.filter(m=>{
    const havuz=[m.name,...(m.alts||[]).flatMap(a=>[a.name,(a.product||{}).name,(a.product||{}).etiketler])].filter(Boolean).join(' ');
    return havuz.toLocaleLowerCase('tr').includes(q) || esAnlamEslesti(q,havuz); });
  return list;
}
function homeKartlar(){
  const list=homeListe();
  return list.map(m=>{ const sub=[m.gunluk_gosterim,m.toplam_alan].filter(Boolean).join(' · ');
    return gcard(`openMec('${m.id}')`, m.name, sub, m.image, m.theme_color, 'Keşfet', m.image_mobil, BASE+'mecra/'+mSlug(m));}).join('')
    || '<p class="muted">Aramanıza uygun sonuç bulunamadı.</p>';
}
function renderHome(q){
  if(typeof q==='string') homeQ=q;
  const H=(D.settings||{}).home||{};
  const g=H.grid||{}; const sut=+g.cols||3, sat=+g.rows||2;
  const limit=Math.max(1,sut*sat);
  const list=homeListe();
  const cards=list.slice(0,limit).map(m=>{ const sub=[m.gunluk_gosterim,m.toplam_alan].filter(Boolean).join(' · ');
    return gcard(`openMec('${m.id}')`, m.name, sub, m.image, m.theme_color, 'Keşfet', m.image_mobil, BASE+'mecra/'+mSlug(m));}).join('')
    || '<p class="muted">Aramanıza uygun sonuç bulunamadı.</p>';
  const k=H.katalog||{};
  const daha = list.length>limit || D.mecralar.length>limit;

  app().innerHTML=`${homeMapBlock(H)}${statsBlock(H)}
    <div class="wrap">
      <section class="hero compact katbas">
        <h2>${esc(k.baslik||'Adana’nın En Stratejik Noktalarında Markanızı Konumlandırın')}</h2>
        ${k.alt?`<p>${esc(k.alt)}</p>`:''}
      </section>
      <div class="grid3" id="cardGrid" style="--cols:${sut}">${cards}</div>
      <div class="tumu"><a href="${BASE}nerelerdeyiz" onclick="openMapPage();return false;">TÜMÜNÜ GÖR <span>›</span></a></div>
      ${refsBlock()}
    </div>`;
  if(homeMapAktif(H)) initHomeMap(H);
  sayacBaslat();
}

/* ---- referans logoları şeridi (sağa akan) ---- */
function refsBlock(){
  const st=D.settings||{}; const logos=Array.isArray(st.refLogos)?st.refLogos.filter(Boolean):[];
  if(!logos.length) return '';
  const grup=logos.map(u=>`<span class="ref-l"><img loading="lazy" src="${esc(u)}" alt=""></span>`).join('');
  return `<section class="refs"><h2>${esc(st.refTitle||'Referanslar')}</h2>
    <div class="refs-mask"><div class="refs-track">${grup}${grup}${grup}</div></div></section>`;
}
/* ---- harita bloğu ---- */
function homeMapAktif(H){
  return !(H.map && H.map.enabled===false);   /* panelden kapatılmadıysa her zaman göster */
}
function homeMapBlock(H){
  if(!homeMapAktif(H)) return '';
  const s=H.search||{};
  const adim=(s.adimlar||'Reklam Alanı Seç - Sepete At - Teklif Al').split('-').map(x=>x.trim()).filter(Boolean);
  const yuk=parseInt((H.map||{}).height||800,10);
  const secili=view.filterLoc?(mec(view.filterLoc)||{}).name
    :(view.filter?(D.products.find(p=>String(p.id)===String(view.filter))||{}).name:'');
  return `<section class="homemap" style="--mh:${yuk}px">
      <div id="homeMap" class="hm-canvas"></div>
    </section>
    <div class="hm-dock">
      <div class="hm-card">
        ${adim.length?`<div class="hm-steps">${adim.map(a=>`<span>${esc(a)}</span>`).join('<i>-</i>')}</div>`:''}
        <div class="hm-row">
          <div class="hm-search">
            <input id="homeSearch" value="${esc(homeQ)}" placeholder="${esc(s.placeholder||'Ürün, Mecra, Lokasyon')}" oninput="homeAra(this.value)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          </div>
          <div class="hm-filt">
            <button class="hm-fbtn" onclick="homeFiltMenu(event)">
              <span>${esc(secili||'Filtrele')}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 5h18l-7 8v5l-4 2v-7z"/></svg>
            </button>
            <div class="hm-fmenu" id="homeFMenu">${homeFiltSecenek()}</div>
          </div>
        </div>
      </div>
    </div>`;
}
function homeFiltSecenek(){
  const kullanilan=new Set();
  D.mecralar.forEach(m=>(m.alts||[]).forEach(a=>{ if(a.product_id)kullanilan.add(String(a.product_id)); }));
  const urunler=D.products.filter(p=>kullanilan.has(String(p.id)));
  return `<button class="${(view.filter||view.filterLoc)?'':'on'}" onclick="homeFiltre('');homeFiltreLoc('')">Tümü</button>
    <div class="fm-h">ÜRÜN TİPİ</div>`
    + urunler.map(p=>`<button class="${String(view.filter)===String(p.id)?'on':''}" onclick="homeFiltre('${p.id}')">${esc(p.name)}</button>`).join('')
    + `<div class="fm-h">LOKASYON</div>`
    + D.mecralar.map(m=>`<button class="${String(view.filterLoc)===String(m.id)?'on':''}" onclick="homeFiltreLoc('${m.id}')">${esc(m.name)}</button>`).join('');
}
function homeFiltreLoc(id){ view.filterLoc=id||null;
  const m=document.getElementById('homeFMenu'); if(m)m.classList.remove('open');
  if(document.getElementById('homeMap')) homeTazele(); else renderHome(); }
function homeFiltMenu(e){ e.stopPropagation();
  const m=document.getElementById('homeFMenu'); if(m)m.classList.toggle('open'); }
let homeQ='', homeMapObj=null, homeCluster=null;
/* Arama/filtre değişince tüm sayfa yeniden çizilmez: yalnızca kartlar,
   pinler ve düğme durumları güncellenir. Harita yerinde kalır, sayaç sıfırlanmaz. */
function homeTazele(){
  const H=(D.settings||{}).home||{}; const gg=H.grid||{};
  const limit=Math.max(1,(+gg.cols||3)*(+gg.rows||2));
  const g=document.getElementById('cardGrid');
  if(g){ const list=homeListe();
    g.innerHTML=list.slice(0,limit).map(m=>{ const sub=[m.gunluk_gosterim,m.toplam_alan].filter(Boolean).join(' · ');
      return gcard(`openMec('${m.id}')`, m.name, sub, m.image, m.theme_color, 'Keşfet', m.image_mobil, BASE+'mecra/'+mSlug(m));}).join('')
      || '<p class="muted">Aramanıza uygun sonuç bulunamadı.</p>'; }
  homePinTazele();
  const fm=document.getElementById('homeFMenu'); if(fm) fm.innerHTML=homeFiltSecenek();
  const fb=document.querySelector('.hm-fbtn span');
  if(fb){ const p=view.filter?(D.products.find(x=>String(x.id)===String(view.filter))||{}).name:''; fb.textContent=p||'Filtrele'; }
  const x=document.querySelector('.hm-card .hm-x'); if(x) x.style.display=homeQ?'':'none';
}
function homeAra(v){ homeQ=v||'';
  if(document.getElementById('homeMap')) homeTazele(); else renderHome(); }
function homeFiltre(id){ view.filter=id||null;
  const m=document.getElementById('homeFMenu'); if(m)m.classList.remove('open');
  if(document.getElementById('homeMap')) homeTazele(); else renderHome(); }
function homePinler(){
  const q=(homeQ||'').trim().toLowerCase();
  return allPins().filter(p=>{
    if(view.filter && String(p.productId)!==String(view.filter)) return false;
    if(view.filterLoc && String(p.mecId)!==String(view.filterLoc)) return false;
    if(!q) return true;
    const havuz=[p.mec,p.alt,p.product,p.unit,p.konum,p.etiket].filter(Boolean).join(' ');
    return havuz.toLocaleLowerCase('tr').includes(q) || esAnlamEslesti(q,havuz); });
}
let homeEngine='leaflet', hgHome=null, hgHomeCl=null, hgHomeMk=[], hgHomeInfo=null;
function initHomeMap(H){
  const tercih=((H.map||{}).engine)||'auto';   /* auto | google | osm */
  const key=gKey();
  const googleKullan = key && tercih!=='osm';
  setTimeout(()=>{
    const el=document.getElementById('homeMap'); if(!el)return;
    if(googleKullan){
      loadGoogle().then(()=>initHomeGoogle())
        .catch(err=>{ console.warn('Anasayfa haritası Google ile açılamadı:',err.message); initHomeLeaflet(); });
    } else initHomeLeaflet();
  },70);
}
function initHomeGoogle(){
  homeEngine='google';
  hgHome=new google.maps.Map(document.getElementById('homeMap'),{
    center:{lat:ADANA[0],lng:ADANA[1]}, zoom:13,
    mapTypeControl:false, streetViewControl:false, fullscreenControl:true,
    scrollwheel:false, gestureHandling:'cooperative',
    styles:[{featureType:'poi.business',stylers:[{visibility:'off'}]},
            {featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}]}]});
  hgHomeInfo=new google.maps.InfoWindow({maxWidth:270});
  hgHomeCl=new markerClusterer.MarkerClusterer({map:hgHome,markers:[],renderer:{
    render:function(o){ const count=o.count, position=o.position; const sz=count<10?38:(count<50?46:54);
      return new google.maps.Marker({position:position,zIndex:1000+count,
        label:{text:String(count),color:'#fff',fontSize:'13px',fontWeight:'700'},
        icon:{url:gClusterSvg(sz),scaledSize:new google.maps.Size(sz,sz),anchor:new google.maps.Point(sz/2,sz/2)}}); }}});
  homePinTazele();
}
function initHomeLeaflet(){
  const el=document.getElementById('homeMap'); if(!el||typeof L==='undefined')return;
  homeEngine='leaflet';
  if(homeMapObj){ try{homeMapObj.remove();}catch(e){} homeMapObj=null; }
  homeMapObj=L.map('homeMap',{scrollWheelZoom:false,zoomControl:true,attributionControl:false}).setView(ADANA,13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(homeMapObj);
  homeCluster=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:52,
    iconCreateFunction:c=>{ const n=c.getChildCount(); const sz=n<10?36:(n<50?44:52);
      return L.divIcon({html:`<div class="cl-b" style="width:${sz}px;height:${sz}px;line-height:${sz}px">${n}</div>`,className:'cl-w',iconSize:[sz,sz]}); }});
  homeMapObj.addLayer(homeCluster);
  homePinTazele();
  setTimeout(()=>homeMapObj.invalidateSize(),180);
}
function homePinTazele(){
  const list=homePinler();
  const c=document.getElementById('hmCount'); if(c)c.textContent=list.length;
  const inf=document.getElementById('hmInfo');
  if(inf) inf.innerHTML = allPins().length
    ? `<b id="hmCount">${list.length}</b> alan`
    : 'Yakında haritada';
  if(homeEngine==='google'){
    if(!hgHome)return;
    if(hgHomeCl)hgHomeCl.clearMarkers();
    hgHomeMk.forEach(mk=>mk.setMap(null));
    hgHomeMk=list.map(p=>{
      const mk=new google.maps.Marker({position:{lat:p.lat,lng:p.lng},title:p.mec+' · '+p.unit,
        icon:{url:gPinSvg(p.theme),scaledSize:new google.maps.Size(32,42),anchor:new google.maps.Point(16,41)}});
      mk.addListener('click',()=>{ hgHomeInfo.setContent(popupHTML(p)); hgHomeInfo.open({anchor:mk,map:hgHome}); });
      return mk; });
    if(hgHomeCl)hgHomeCl.addMarkers(hgHomeMk);
    if(list.length){ const b=new google.maps.LatLngBounds();
      list.forEach(p=>b.extend({lat:p.lat,lng:p.lng}));
      hgHome.fitBounds(b,{top:60,bottom:60,left:60,right:60});
      google.maps.event.addListenerOnce(hgHome,'idle',()=>{ if(hgHome.getZoom()>15)hgHome.setZoom(15); }); }
    else { hgHome.setCenter({lat:ADANA[0],lng:ADANA[1]}); hgHome.setZoom(13); }
    return;
  }
  if(!homeCluster)return;
  homeCluster.clearLayers();
  if(!list.length){ homeMapObj.setView(ADANA,13); return; }
  homeCluster.addLayers(list.map(p=>L.marker([p.lat,p.lng],{icon:pinIcon(p.theme),title:p.mec+' · '+p.unit})
    .bindPopup(popupHTML(p),{maxWidth:270,minWidth:230})));
  try{ homeMapObj.fitBounds(L.latLngBounds(list.map(p=>[p.lat,p.lng])).pad(0.2),{maxZoom:15}); }catch(e){}
}

/* ---- sayaç + referanslar ---- */
function statsBlock(H){
  const st=H.stats||{};
  const sayac=(st.items||[]).filter(x=>x&&(x.n||x.label));
  if(!sayac.length) return '';
  return `<section class="statsrow">
    ${st.eyebrow?`<span class="sr-eye">${esc(st.eyebrow)}</span>`:''}
    <div class="sr-nums">${sayac.map(x=>`<div class="sr-n">
      <div class="sr-num"><b class="cnt2" data-to="${esc(String(x.n||'0').replace(/[^\d]/g,''))}">0</b><i>${esc(String(x.n||'').replace(/[\d.]/g,'').trim())}</i></div>
      <span>${esc(x.label||'')}</span></div>`).join('')}</div>
    ${st.alt?`<p class="sr-p">${esc(st.alt)}</p>`:''}
  </section>`;
}

function sayacBaslat(){
  const els=[...document.querySelectorAll('.cnt2')];
  if(!els.length)return;
  const anim=el=>{
    const hedef=parseInt(el.dataset.to||'0',10)||0; const sure=1400; const bas=performance.now();
    const adim=t=>{ const p=Math.min(1,(t-bas)/sure); const e=1-Math.pow(1-p,3);
      el.textContent=Math.round(hedef*e).toLocaleString('tr-TR');
      if(p<1)requestAnimationFrame(adim); };
    requestAnimationFrame(adim);
  };
  if(!('IntersectionObserver' in window)){ els.forEach(anim); return; }
  const io=new IntersectionObserver(es=>es.forEach(x=>{ if(x.isIntersecting){ anim(x.target); io.unobserve(x.target); } }),{threshold:.4});
  els.forEach(e=>io.observe(e));
}

/* ================= KARŞILAMA BÖLÜMÜ ================= */
function heroBlock(){
  const H=(D.settings||{}).hero2||{};
  if(H.enabled===false) return '';
  const board=H.board||'', boardM=H.boardMobil||'';
  if(!board && !(H.cards||[]).length && !H.title) return '';   /* içerik yoksa hiç basma */
  const kartlar=(H.cards||[]).filter(c=>c&&c.img).slice(0,4).map((c,i)=>{
    const m=c.mecraId?mec(c.mecraId):null;
    const href=m?BASE+'mecra/'+mSlug(m):'';
    const tag=m?`onclick="openMec('${m.id}');return false;"`:'onclick="heroScroll();return false;"';
    return `<a class="h2-ph p${i+1}" href="${esc(href||'#')}" ${tag} style="--d:${i*0.9}">
      ${bgLayers(c.img,c.imgMobil,'h2-ph-i','')}
      ${c.label?`<span class="h2-ph-l">${esc(c.label)}</span>`:''}</a>`;}).join('');
  const rozet=(H.stats||[]).filter(x=>x&&(x.n||x.l)).map(x=>
    `<div class="h2-st"><b>${esc(x.n||'')}</b><span>${esc(x.l||'')}</span></div>`).join('');
  return `<section class="hero2" id="hero2">
    <div class="h2-top">
      <h1>${esc(H.title||'Adana Açık Hava Reklam Mecralarını Keşfedin')}</h1>
      ${H.sub?`<p>${esc(H.sub)}</p>`:''}
      <button class="h2-btn" onclick="heroScroll()">${esc(H.btn||'Başla')}<span class="h2-ar">↓</span></button>
    </div>
    <div class="h2-stage">
      ${kartlar}
      <div class="h2-board-wrap"><div class="h2-board">
        ${board||boardM?bgLayers(board,boardM,'h2-board-i',''):'<div class="h2-board-i ph">Pano görseli</div>'}
        <div class="h2-board-glare"></div></div>
        <div class="h2-pole"></div></div>
    </div>
    ${rozet?`<div class="h2-stats">${rozet}</div>`:''}
  </section>`;
}
function heroScroll(){
  const t=document.getElementById('katalog');
  if(!t)return;
  const y=t.getBoundingClientRect().top+window.scrollY-70;
  window.scrollTo({top:y,behavior:'smooth'});
}
function heroInit(){
  const sec=document.getElementById('hero2'); if(!sec)return;
  const az=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(az||window.innerWidth<=760) return;      /* mobilde ve hareket azaltmada efekt yok */
  let raf=null;
  sec.addEventListener('mousemove',e=>{
    if(raf)return;
    raf=requestAnimationFrame(()=>{
      const r=sec.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-0.5, y=(e.clientY-r.top)/r.height-0.5;
      sec.style.setProperty('--mx',x.toFixed(3));
      sec.style.setProperty('--my',y.toFixed(3));
      raf=null;
    });
  });
  sec.addEventListener('mouseleave',()=>{ sec.style.setProperty('--mx',0); sec.style.setProperty('--my',0); });
}

function renderMec(){
  const m=mec(view.id); if(!m)return goHome();
  const alts=m.alts||[]; if(!alts.length) return renderMecPage(m,null);
  const aktif=view.tab && alts.some(a=>String(a.id)===String(view.tab)) ? view.tab : alts[0].id;
  renderMecPage(m,aktif);
}
/* ---- Lokasyon sayfası: her şey tek sayfada (lokasyon değeri → ürün → aksiyon) ---- */
function renderMecPage(m,aktifAltId){
  const alts=m.alts||[]; const st=D.settings||{};
  const nav=`<a href="${BASE}" onclick="goHome();return false;">Medyapark Adana</a> <i>/</i> <span>${esc(m.name)}</span>`;

  /* ① kapak altı kanıt şeridi */
  const units=alts.reduce((n,a)=>n+(a.units||[]).length,0);
  const yuzey=alts.reduce((n,a)=>n+groupUnits(a.units||[]).reduce((k,g)=>k+(g.A?1:0)+(g.B?1:0),0),0);
  const now=curYm(); let musait=0;
  alts.forEach(a=>(a.units||[]).forEach(u=>{ const mp={}; (u.booked||[]).forEach(b=>mp[b.ym]=b.status); if(!mp[now])musait++; }));
  const kanit=[
    m.gunluk_gosterim?[m.gunluk_gosterim,'Gösterim']:null,
    [alts.length+' tip','Reklam alanı'],
    [yuzey>units?(yuzey+' yüzey'):(units+' pozisyon'),'Envanter'],
    musait?[musait,'Bu ay müsait']:null,
    m.toplam_alan?[m.toplam_alan,'Kapsam']:null
  ].filter(Boolean).slice(0,4);
  const heroBar=`<div class="mp-bar"><div class="mp-bar-in">
      ${m.logo?`<div class="mp-logo">${picture(m.logo,null,'','logo')}</div>`:''}
      <div class="mp-kanit">${kanit.map(k=>`<div class="mp-k"><b>${esc(String(k[0]))}</b><span>${esc(k[1])}</span></div>`).join('')}</div>
      <div class="mp-bar-btn">
        ${alts.length?`<a class="btn btn-outline" href="#mp-alanlar" onclick="mpScroll('mp-alanlar');return false;">Müsait alanları gör ↓</a>`:''}
        <a class="btn btn-primary" href="#mp-teklif" onclick="mpScroll('mp-teklif');return false;">Teklif İste</a></div>
    </div></div>`;

  /* ② neden burası */
  const adv=Array.isArray(m.avantajlar)?m.avantajlar.filter(a=>a&&(a.t||a.title)):[];
  const advHTML = vis(m,'avantajlar',adv.length>0)
    ? `<div class="hub-adv mp-adv">${adv.map(a=>`<div class="adv"><b>${esc(a.t||a.title)}</b>${(a.d||a.desc)?`<span>${esc(a.d||a.desc)}</span>`:''}</div>`).join('')}</div>` : '';
  const fotolar=(Array.isArray(m.galeri)?m.galeri:[]).filter(Boolean);
  const fotoHTML=fotolar.length?`<div class="mp-photos">${fotolar.map(u=>`<figure onclick="lightbox('${esc(u)}')"><img loading="lazy" src="${esc(u)}" alt=""></figure>`).join('')}</div>`:'';
  const nedenIc=[introBlock(m,true),
    m.intro_image?`<figure class="hub-introimg" onclick="lightbox('${esc(m.intro_image)}')">${picture(m.intro_image,null,'','Tanıtım görseli')}<span class="kroki-zoom">Büyütmek için tıklayın</span></figure>`:'',
    advHTML, fotoHTML].join('');
  const neden = nedenIc.trim() ? `<section class="mp-sec" id="mp-neden"><h2 class="mp-h2">Neden bu lokasyon?</h2>${nedenIc}</section>` : '';

  /* ③ konum & yerleşim */
  const pts=[]; alts.forEach(a=>(a.units||[]).forEach(u=>{const la=parseFloat(u.lat),ln=parseFloat(u.lng);
    if(isFinite(la)&&isFinite(ln))pts.push({lat:la,lng:ln,name:u.name||'',alt:a.id});}));
  const haritaVar = pts.length>0 && visMode(m,'maps')!=='off';
  const krokiVar = vis(m,'kroki',!!m.yerlesim_plani);
  const lejant = alts.map((a,i)=>`<button class="kl-chip${String(a.id)===String(aktifAltId)?' on':''}" data-alt="${a.id}" style="--kc:${altRenk(i)}" onclick="mpTab('${a.id}')"><i></i>${esc((a.product||{}).name||a.name)}</button>`).join('');
  const konum = (haritaVar||krokiVar) ? `<section class="mp-sec" id="mp-konum"><h2 class="mp-h2">Konum ve yerleşim</h2>
    <div class="mp-loc${(haritaVar&&krokiVar)?'':' solo'}">
      ${haritaVar?`<div class="mp-map"><div id="hubMap"></div><button class="hs-mapall" onclick="openMapPage()">Tüm lokasyonları haritada gör →</button></div>`:''}
      ${krokiVar?`<div class="mp-kroki"><div class="kroki-box" onclick="lightbox('${esc(m.yerlesim_plani)}')">${picture(m.yerlesim_plani,m.kroki_mobil,'kroki-img','Yerleşim krokisi')}<span class="kroki-zoom">Büyütmek için tıklayın</span></div>
        ${alts.length>1?`<div class="kl">${lejant}</div>`:''}
        <p class="mp-not">Krokideki pozisyon numaraları, aşağıdaki rezervasyon tablosuyla aynıdır.</p></div>`:''}
    </div></section>` : '';

  /* ④ reklam alanları (sekmeli) */
  const tabs=alts.map((a,i)=>{ const p=a.product||{}; const n=(a.units||[]).length;
    return `<button class="mp-tab${String(a.id)===String(aktifAltId)?' on':''}" data-alt="${a.id}" style="--kc:${altRenk(i)}" onclick="mpTab('${a.id}')">
      <i></i><span>${esc(p.name||a.name)}</span><small>${n} pozisyon</small></button>`;}).join('');
  const paneller=alts.map((a,i)=>{ const p=a.product||{};
    const prices=altPrices(a,p);
    const capa=(showPrices()&&prices.length)?`<div class="mp-capa">Aylık <b>${money(prices.find(x=>/^1 Ay/i.test(x[0]))?prices.find(x=>/^1 Ay/i.test(x[0]))[1]:prices[0][1])}</b>'den başlayan fiyatlar</div>`:'';
    const specRows=[['Ölçü',p.olcu],['Yüzey',p.yuzey],['Aydınlatma',p.isikli],['Baskı malzemesi',p.baski_malzemesi],['Baskı formatı',p.baski_format],['Yayın formatı',p.yayin_format]]
      .filter(x=>x[1]&&x[1]!=='—').map(x=>`<div class="spec"><span class="k">${esc(x[0])}</span><span class="v">${esc(x[1])}</span></div>`).join('');
    const fiyatAcc=!showPrices()?'':`<details class="acc"><summary>Tüm fiyatlar</summary><div>${prices.map(([k,v])=>`<div class="priceitem"><span class="muted">${esc(k)}</span><span class="amt">${money(v)}</span></div>`).join('')||'<p class="muted">—</p>'}<p class="muted" style="font-size:12px;margin-top:8px">Belediye vergi dahil, dijital baskı hariç · KDV hariç.</p></div></details>`;
    const gal=(Array.isArray(a.galeri)?a.galeri:[]).filter(Boolean);
    const galHTML=gal.length?`<div class="mp-photos sm">${gal.map(u=>`<figure onclick="lightbox('${esc(u)}')"><img loading="lazy" src="${esc(u)}" alt=""></figure>`).join('')}</div>`:'';
    const foto=a.image||p.ikon||'';
    return `<div class="mp-panel${String(a.id)===String(aktifAltId)?' on':''}" data-alt="${a.id}">
      <div class="mp-prod">
        ${foto?`<div class="mp-prod-img"><img src="${esc(foto)}" alt="${esc(p.name||a.name)}" onclick="lightbox('${esc(foto)}')"></div>`:''}
        <div class="mp-prod-b">
          <h3>${esc(p.name||a.name)}</h3>
          ${a.aciklama?`<p>${esc(a.aciklama)}</p>`:''}
          ${capa}
          ${specRows?`<div class="mp-spec">${specRows}</div>`:''}
          ${fiyatAcc}
        </div></div>
      ${galHTML}
      ${rezTableHTML(a)}
    </div>`;}).join('');
  const alanlar = alts.length ? `<section class="mp-sec" id="mp-alanlar"><h2 class="mp-h2">Reklam alanları</h2>
      <div class="mp-tabs">${tabs}</div>${paneller}</section>`
    : `<section class="mp-sec" id="mp-alanlar"><p class="muted">Bu lokasyonda henüz alan tanımlı değil.</p></section>`;

  /* ⑤ teklif / iletişim */
  const katalogUrl=m.katalog||st.catalogPdf||'';
  const teklif=`<section class="mp-sec" id="mp-teklif"><div class="mp-cta">
      <div class="mp-cta-l"><h2 class="mp-h2" style="margin-top:0">Teklif alın</h2>
        <p>Tabloda ayları seçip sepete ekleyin; teklif talebiniz anında bize düşer. Ya da doğrudan arayın.</p>
        <div class="mp-cta-btn">
          ${st.phone?`<a class="hs-btn" href="tel:${esc(String(st.phone).replace(/\s/g,''))}">${esc(st.phone)}</a>`:''}
          ${st.social_whatsapp?`<a class="hs-btn wa" href="${esc(st.social_whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>`:''}
          ${katalogUrl?`<a class="hs-btn pdfk" href="${esc(katalogUrl)}" target="_blank" rel="noopener" download>PDF Katalog</a>`:''}
        </div></div>
      <div class="mp-cta-r"><div class="sepetbox"><h4>Sepet</h4><div id="sepetInner"></div></div></div>
    </div></section>`;

  /* ⑥ diğer lokasyonlar */
  const digerler=D.mecralar.filter(x=>String(x.id)!==String(m.id));
  const relCards=digerler.map(x=>`<div class="carslide">${gcard(`openMec('${x.id}')`,x.name,(x.gunluk_gosterim||((x.alts||[]).length+' reklam alanı')),x.image,x.theme_color,'Keşfet',x.image_mobil,BASE+'mecra/'+mSlug(x))}</div>`).join('');
  const diger = digerler.length ? `<section class="mp-sec" id="mp-diger"><h2 class="mp-h2">Diğer lokasyonlar</h2>
      <div class="carousel"><div class="cnav l" onclick="carScroll(-1)">‹</div><div class="cartrack" id="cartrack">${relCards}</div><div class="cnav r" onclick="carScroll(1)">›</div></div></section>` : '';

  /* yapışkan çubuk */
  const sticky=`<div class="mp-sticky" id="mpSticky"><div class="mp-sticky-in">
      <b class="mp-sn">${esc(m.name)}</b>
      <nav class="mp-anch">
        ${neden?'<a onclick="mpScroll(\'mp-neden\')">Neden burası</a>':''}
        ${konum?'<a onclick="mpScroll(\'mp-konum\')">Yerleşim</a>':''}
        ${alts.length?'<a onclick="mpScroll(\'mp-alanlar\')">Alanlar</a>':''}
        <a onclick="mpScroll('mp-teklif')">Teklif</a></nav>
      <span class="mp-cart" id="mpCart"></span>
      <a class="btn btn-primary btn-sm" onclick="mpScroll('mp-teklif')">Teklif İste</a>
    </div></div>`;

  app().innerHTML=`${banner(m,(m.baslik||m.name),nav)}${heroBar}${sticky}
    <div class="mp">${neden}${konum}${alanlar}${teklif}${diger}</div>`;
  renderSepetInline(); mpCartSay();
  if(haritaVar) initHubMap(pts, m.theme_color||'#0071e3', true);
  mpStickyKur();
}
function altRenk(i){ return ['#0e7c66','#2f6fe4','#c2410c','#7c3aed','#0891b2','#b91c1c'][i%6]; }
function mpScroll(id){ const el=document.getElementById(id); if(!el)return;
  const y=el.getBoundingClientRect().top+window.scrollY-70; window.scrollTo({top:y,behavior:'smooth'}); }
function mpTab(altId){
  view.tab=altId;
  document.querySelectorAll('.mp-tab,.kl-chip').forEach(b=>b.classList.toggle('on',String(b.dataset.alt)===String(altId)));
  document.querySelectorAll('.mp-panel').forEach(p=>p.classList.toggle('on',String(p.dataset.alt)===String(altId)));
  const m=mec(view.id||view.mecId); const a=m&&(m.alts||[]).find(x=>String(x.id)===String(altId));
  if(m&&a){ try{ history.replaceState(null,'',BASE+'mecra/'+mSlug(m)+'/'+aSlug(a)); }catch(e){} }
  const sec=document.getElementById('mp-alanlar');
  if(sec && sec.getBoundingClientRect().top<0) mpScroll('mp-alanlar');
}
function mpCartSay(){ const el=document.getElementById('mpCart'); if(!el)return;
  const n=(typeof cart!=='undefined'&&cart)?cart.length:0; el.textContent=n?`Sepet · ${n}`:''; }
function mpStickyKur(){
  const bar=document.getElementById('mpSticky'), ban=document.querySelector('.cover-banner'); if(!bar)return;
  const esik=()=>{ const h=ban?ban.getBoundingClientRect().bottom:200; bar.classList.toggle('on',h<0); };
  window.removeEventListener('scroll',window.__mpSt||(()=>{})); window.__mpSt=esik;
  window.addEventListener('scroll',esik,{passive:true}); esik();
}

function rezTableHTML(alt){
  const uList=alt.units||[];
  const months=rollMonths(); const now=curYm();
  const yr=months[0].y + (months[11].y!==months[0].y?(' – '+months[11].y):'');
  const groups=groupUnits(uList);

  const monHead=months.map(mo=>`<div class="rg-m rg-mh"><span>${esc(mo.label.slice(0,3))}</span></div>`).join('');
  const hasAB=groups.some(g=>!!g.B);      /* bu alanda çift yüzlü pozisyon var mı? */
  const surfCell=(u,ym,past,solo)=>{
    if(!u) return `<span class="rcell yok" title="Bu pozisyonda bu yüzey tanımlı değil">–</span>`;
    const mp={}; (u.booked||[]).forEach(b=>mp[b.ym]=b.status);
    const st=mp[ym], sel=cart.some(c=>String(c.unitId)===String(u.id)&&c.ym===ym);
    const {surf}=posParts(u.name);
    const ay=MONTHS_LONG[+ym.slice(5,7)-1]+' '+ym.slice(0,4);
    const yz=solo?'':(surf==='A'?' · A yüzey (ön yüz)':' · B yüzey (arka yüz)');
    let cls='rcell', durum;
    if(sel){cls+=' sel';durum='Sepette';}
    else if(st==='dolu'){cls+=' dolu';durum='Dolu';}
    else if(st==='rezerve'){cls+=' rezerve';durum='Rezerve';}
    else if(past){cls+=' past';durum='Geçmiş';}
    else {cls+=' bos';durum='Müsait';}
    const tik=(!st&&!past)||sel ? ` onclick="pick('${u.id}','${ym}')"` : '';
    return `<span class="${cls}" data-u="${u.id}" data-ym="${ym}"${tik} title="${esc(u.name)}${esc(yz)} · ${esc(ay)} — ${durum}"><i>${solo?'':surf}</i></span>`;
  };
  const rows=groups.map(g=>{
    const cells=months.map(mo=>`<div class="rg-m">${g.B
      ? surfCell(g.A,mo.ym,mo.ym<now)+surfCell(g.B,mo.ym,mo.ym<now)
      : surfCell(g.A,mo.ym,mo.ym<now,true)}</div>`).join('');
    return `<div class="rg-row"><div class="rg-lbl" title="${esc(g.base)}">${esc(g.base)}</div>${cells}</div>`;
  }).join('');
  /* bu ayın müsaitlik özeti */
  let musait=0; uList.forEach(u=>{ const mp={}; (u.booked||[]).forEach(b=>mp[b.ym]=b.status); if(!mp[now])musait++; });
  const availPill=musait>0?`<span class="rt-avail">Bu ay ${musait} ${hasAB?'yüzey':'pozisyon'} müsait</span>`:'';

  const table=`<div class="restable"><div class="rh">
      <div><span class="t">Rezervasyon Tablosu</span>${availPill}
        <span class="rt-help">${hasAB?'Panonun <b>ön (A)</b> veya <b>arka (B)</b> yüzünü ve kiralamak istediğiniz ayı seçin':'Kiralamak istediğiniz ayı seçmek için kutuya tıklayın'}</span></div>
      <div style="display:flex;align-items:center;gap:10px"><span class="yr">${yr}</span><div class="nav"><button onclick="rollNav(-1)" title="Önceki yıl">‹</button><button onclick="rollNav(1)" title="Sonraki yıl">›</button></div></div></div>
    <div class="rtwrap"><div class="rgrid">
      <div class="rg-row rg-head"><div class="rg-lbl">Pozisyon</div>${monHead}</div>
      ${rows||'<div class="rg-row"><div class="rg-lbl muted">Pozisyon yok</div></div>'}
    </div></div>
    <div class="rg-legend">
      ${hasAB?'<span class="lg-surf"><b>A</b> Ön yüz</span><span class="lg-surf"><b>B</b> Arka yüz</span><span class="lg-sep"></span>':''}
      <span><i class="sw bos"></i>Müsait</span><span><i class="sw dolu"></i>Dolu</span>
      <span><i class="sw rezerve"></i>Rezerve</span><span><i class="sw sel"></i>Seçili</span>
    </div></div>`;

  return table;
}

/* mecra sayfasındaki mini harita */
let hubMapObj=null;
function initHubMap(pts,color,buyuk){
  setTimeout(()=>{
    const el=document.getElementById('hubMap'); if(!el||typeof L==='undefined')return;
    if(hubMapObj){ try{hubMapObj.remove();}catch(e){} hubMapObj=null; }
    hubMapObj=L.map('hubMap',{scrollWheelZoom:false,zoomControl:!!buyuk,dragging:!!buyuk,attributionControl:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(hubMapObj);
    const ms=pts.map(p=>L.marker([p.lat,p.lng],{icon:pinIcon(color)}));
    const grp=L.featureGroup(ms).addTo(hubMapObj);
    try{ hubMapObj.fitBounds(grp.getBounds().pad(0.5),{maxZoom:15}); }
    catch(e){ hubMapObj.setView([pts[0].lat,pts[0].lng],14); }
    setTimeout(()=>hubMapObj.invalidateSize(),160);
  },60);
}

/* kroki büyütme */
function lightbox(src){
  if(!src)return;
  const d=document.createElement('div'); d.className='lbox';
  d.innerHTML=`<button class="lbox-x" aria-label="Kapat">×</button><img src="${esc(src)}" alt="Kroki">`;
  d.onclick=()=>d.remove();
  document.body.appendChild(d);
}

/* ---- ALT DETAY ---- */
/* "P1-A" -> {base:'P1', surf:'A'} ; eşleşmezse tek yüzey (A) sayılır */
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

function rollMonths(){ const b=new Date(); b.setDate(1); b.setMonth(b.getMonth()+roll*12);
  const arr=[]; for(let i=0;i<12;i++){ const d=new Date(b.getFullYear(),b.getMonth()+i,1); arr.push({ym:d.getFullYear()+'-'+pad(d.getMonth()+1),label:MONTHS_LONG[d.getMonth()],y:d.getFullYear()}); } return arr; }

function renderAlt(){
  const m=mec(view.mecId); if(!m)return goHome();
  const alts=m.alts||[]; const alt=alts.find(a=>String(a.id)===String(view.altId))||alts[0];
  view.tab=alt?alt.id:null;
  renderMecPage(m, view.tab);
}

/* Alt mecra detayındaki mini harita */
let altMapObj=null;
function initAltMap(pts,color){
  setTimeout(()=>{
    const el=document.getElementById('altMap'); if(!el)return;
    if(typeof L==='undefined'){ el.innerHTML='<div class="mapph">Harita yüklenemedi</div>'; return; }
    if(altMapObj){ try{altMapObj.remove();}catch(e){} altMapObj=null; }
    altMapObj=L.map('altMap',{scrollWheelZoom:false,zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(altMapObj);
    const ms=pts.map(p=>L.marker([p.lat,p.lng],{icon:pinIcon(color),title:p.name})
      .bindPopup(`<div class="pp"><div class="pp-b"><div class="pp-t">${esc(p.name)}</div>${p.konum?`<div class="pp-k">${esc(p.konum)}</div>`:''}
        <a class="pp-ext" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Google Haritalar'da aç ↗</a></div></div>`,{maxWidth:240}));
    const grp=L.featureGroup(ms).addTo(altMapObj);
    try{ altMapObj.fitBounds(grp.getBounds().pad(0.35),{maxZoom:16}); }catch(e){ altMapObj.setView([pts[0].lat,pts[0].lng],15); }
    setTimeout(()=>altMapObj.invalidateSize(),200);
  },80);
}
function rollNav(d){ roll+=d; render(); }
function carScroll(d){ const t=document.getElementById('cartrack'); if(t)t.scrollBy({left:d*340,behavior:'smooth'}); }
function pick(uid,ym){ toggleMonth(uid,ym); }
function toggleMonth(uid,ym){
  const alt=D.altById[view.altId]; if(!alt)return; const m=mec(view.mecId);
  const u=(alt.units||[]).find(x=>String(x.id)===String(uid)); if(!u)return; const p=alt.product||{};
  const i=cart.findIndex(c=>String(c.unitId)===String(uid)&&c.ym===ym);
  if(i>-1){ cart.splice(i,1); }
  else{ const [y,mm]=ym.split('-'); const price=altPerMonth(alt,p);
    const donem=MONTHS_LONG[+mm-1]+' '+y;
    cart.push({unitId:Number(uid),mecra:m.name,alt:alt.name,unit:u.name,product:p.name,olcu:u.olcu||p.olcu||'',ym,monthLabel:donem,price,priceLabel:money(price)});
    bildir(`<b>Sepete eklendi</b><span>${esc(m.name)} · ${esc(u.name)} · ${esc(donem)}</span>`,'ok');
    sepetCanlan(); }
  badge(); renderCart(); updateCell(uid,ym); renderSepetInline();
}
function updateCell(uid,ym){ const el=document.querySelector(`.rcell[data-u='${uid}'][data-ym='${ym}']`); if(!el)return;
  const sel=cart.some(c=>String(c.unitId)===String(uid)&&c.ym===ym);
  el.classList.remove('sel','bos'); el.classList.add(sel?'sel':'bos');
  if(el.title) el.title=el.title.replace(/—.*$/, '— '+(sel?'Sepette':'Müsait')); }

function renderSepetInline(){ if(typeof mpCartSay==='function')mpCartSay(); const box=document.getElementById('sepetInner'); if(!box)return;
  if(!cart.length){ box.innerHTML='<div class="empty2">Sepetiniz boş. Tablodan müsait ay seçtikçe burada güncellenir.</div>'; return; }
  box.innerHTML=cart.map((c,i)=>`<div class="si-item"><div><b>${esc(c.mecra)}</b><br><span class="muted" style="font-size:12.5px">${esc(c.product)}${c.unit?' › '+esc(c.unit):''} · ${esc(c.monthLabel)}</span></div><div style="text-align:right;white-space:nowrap">${showPrices()?c.priceLabel+'<br>':''}<span class="x" onclick="removeItem(${i})">kaldır ×</span></div></div>`).join('')
    +`${showPrices()?`<div class="tot"><span>Toplam</span><span>${money(cartTotal())}</span></div>`:'<div style="height:10px"></div>'}<button class="btn btn-primary" style="width:100%" onclick="toggleCart()">Teklif Al</button>`; }

/* ---- medya planlama ---- */
function renderPlan(){
  const st=D.settings||{}, pl=st.plan||{};
  const nav=`<a onclick="goHome()">Medyapark Adana</a> / ${esc(pl.title||'Medya Planlama')}`;
  const mecs=(D.mecralar||[]);
  const butceler=['50.000 TL altı','50.000 – 150.000 TL','150.000 – 500.000 TL','500.000 TL üzeri','Henüz belirlemedim'];
  app().innerHTML=`<div class="pg-top"><div class="pg-crumb">${nav}</div><h1 class="pg-title">${esc(pl.title||'Medya Planlama')}</h1></div>
  <div class="plan-wrap">
    ${pl.desc?`<p class="plan-desc">${esc(pl.desc)}</p>`:''}
    <div class="plan-card" id="planCard">
      <div class="plan-grid">
        <div class="field"><label>Ad Soyad *</label><input class="inp" id="plAd" autocomplete="name"></div>
        <div class="field"><label>Firma Adı</label><input class="inp" id="plFirma" autocomplete="organization"></div>
        <div class="field"><label>Telefon *</label><input class="inp" id="plTel" type="tel" autocomplete="tel" placeholder="05__ ___ __ __"></div>
        <div class="field"><label>E-Posta</label><input class="inp" id="plMail" type="email" autocomplete="email"></div>
      </div>
      <div class="field"><label>Hedef Kitleniz</label><textarea class="inp" id="plHedef" placeholder="Örn. Adana genelinde 25-45 yaş, AVM ziyaretçileri…"></textarea></div>
      <div class="field"><label>İlgilendiğiniz Mecralar</label>
        <div class="plan-mecs">${mecs.map(m=>`<label><input type="checkbox" class="plMec" value="${esc(m.name)}"> ${esc(m.name)}</label>`).join('')}</div></div>
      <div class="field" style="max-width:320px"><label>Ortalama Bütçe</label>
        <select class="inp" id="plButce"><option value="">— Seçin —</option>${butceler.map(b=>`<option>${b}</option>`).join('')}</select></div>
      <div id="planErr" class="plan-err" style="display:none"></div>
      <button class="btn btn-primary" id="planBtn" onclick="planSubmit()">Talebi Gönder</button>
      <p class="muted" style="font-size:12px;margin:10px 0 0">Bilgileriniz yalnızca size dönüş yapmak için kullanılır.</p>
    </div>
  </div>`;
}
async function planSubmit(){
  const g=id=>((document.getElementById(id)||{}).value||'').trim();
  const ad=g('plAd'), tel=g('plTel'), mail=g('plMail'), firma=g('plFirma'), hedef=g('plHedef'), butce=g('plButce');
  const secilen=[...document.querySelectorAll('.plMec:checked')].map(e=>e.value);
  const err=document.getElementById('planErr');
  if(!ad || !tel){ err.textContent='Lütfen ad soyad ve telefon alanlarını doldurun.'; err.style.display='block'; return; }
  err.style.display='none';
  const btn=document.getElementById('planBtn'); btn.disabled=true; btn.textContent='Gönderiliyor…';
  try{
    const {error}=await sb.from('leads').insert({ad,telefon:tel,eposta:mail||null,firma:firma||null,
      hedef_kitle:hedef||null,mecralar:secilen,butce:butce||null});
    if(error) throw error;
    const st=D.settings||{};
    if(st.leadMail){ /* e-posta bildirimi (FormSubmit) — başarısız olsa da talep kayıtlıdır */
      try{ await fetch('https://formsubmit.co/ajax/'+encodeURIComponent(st.leadMail),{method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body:JSON.stringify({_subject:'Yeni Medya Planlama Talebi — '+ad,
          'Ad Soyad':ad,'Telefon':tel,'E-Posta':mail||'-','Firma':firma||'-',
          'Hedef Kitle':hedef||'-','İlgilenilen Mecralar':secilen.join(', ')||'-','Bütçe':butce||'-'})}); }catch(e){}
    }
    const pl=st.plan||{};
    document.getElementById('planCard').innerHTML=`<div class="plan-ok">
      <div class="plan-ok-i">✓</div>
      <h3>${esc(pl.thanks_title||'Talebiniz bize ulaştı!')}</h3>
      <p>${esc(pl.thanks||('Teşekkürler '+ad.split(' ')[0]+'! Medya planlama ekibimiz hedefinize en uygun mecra karmasını hazırlayıp en kısa sürede sizinle iletişime geçecek.'))}</p>
      <a class="btn btn-outline" href="${BASE}" onclick="goHome();return false;">Reklam Alanlarını İncele</a></div>`;
  }catch(e){
    btn.disabled=false; btn.textContent='Talebi Gönder';
    err.textContent='Gönderilemedi: '+(e.message||e)+' — lütfen tekrar deneyin ya da bizi arayın.'; err.style.display='block';
  }
}

/* ---- sayfalar ---- */
function ytId(u){ const m=String(u||'').match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{6,})/); return m?m[1]:null; }
function mapSrc(code){ code=String(code||'').trim(); const m=code.match(/src="([^"]+)"/); if(m)return m[1]; if(/^https?:\/\//.test(code))return code; return null; }
function renderBlocks(blocks){ return (blocks||[]).filter(b=>b&&b.off!==true).map(b=>{
  if(b.type==='hero'){ const h=Math.max(220,+b.h||420);
    return `<section class="pg-hero" style="min-height:${h}px">
      ${bgLayers(b.img,b.imgMobil,'pg-hero-bg','')}
      <div class="pg-hero-ov" style="background:${esc(b.oc||'#0b1f2a')};opacity:${b.oo!=null?+b.oo:0.45}"></div>
      <div class="pg-hero-in">${b.eyebrow?`<span class="pg-hero-eye">${esc(b.eyebrow)}</span>`:''}
        ${b.title?`<h2>${esc(b.title)}</h2>`:''}${b.sub?`<p>${esc(b.sub)}</p>`:''}
        ${b.label?`<a class="btn btn-primary" href="${esc(b.link||'#')}">${esc(b.label)}</a>`:''}</div></section>`; }
  if(b.type==='imagetext'){ const rev=b.side==='right'?' rev':'';
    return `<div class="pg-it${rev}">
      <div class="pg-it-img" ${b.url?`style="background-image:url('${esc(b.url)}')" onclick="lightbox('${esc(b.url)}')"`:''}></div>
      <div class="pg-it-tx">${b.title?`<h3>${esc(b.title)}</h3>`:''}
        ${(b.text||'').split('\n').map(x=>x.trim()?`<p>${esc(x)}</p>`:'').join('')}
        ${b.label?`<a class="btn btn-outline" href="${esc(b.link||'#')}">${esc(b.label)}</a>`:''}</div></div>`; }
  if(b.type==='counters'){ const it=Array.isArray(b.items)?b.items:[]; return it.length?`<div class="pgc">${it.map(x=>{
      const num=String(x.n||'').replace(/[^\d]/g,'')||'0', suf=String(x.n||'').replace(/[\d.\s]/g,'');
      return `<div class="pgc-i"><b class="pgc-n" data-to="${esc(num)}">0</b><i>${esc(suf)}</i><span>${esc(x.label||'')}</span></div>`;}).join('')}</div>`:''; }
  if(b.type==='logos'){ const imgs=Array.isArray(b.images)?b.images:[]; return imgs.length?`${b.title?`<h2 class="pg-h" style="text-align:center">${esc(b.title)}</h2>`:''}<div class="pg-logos">${imgs.map(g=>`<div class="pg-lg"><img loading="lazy" src="${esc(g)}" alt=""></div>`).join('')}</div>`:''; }
  if(b.type==='quote')return `<blockquote class="pg-quote"><p>${esc(b.text||'')}</p>${b.who?`<cite>${esc(b.who)}</cite>`:''}</blockquote>`;
  if(b.type==='video'){ const id=ytId(b.url);
    if(id) return `<div class="pg-video"><iframe loading="lazy" src="https://www.youtube-nocookie.com/embed/${esc(id)}" title="Video" allowfullscreen frameborder="0"></iframe></div>`;
    if(/\.mp4(\?|$)/.test(b.url||'')) return `<div class="pg-video"><video controls preload="metadata" src="${esc(b.url)}"></video></div>`;
    return ''; }
  if(b.type==='map'){ const src=mapSrc(b.code); return src?`<div class="pg-mapblk"><iframe loading="lazy" src="${esc(src)}" frameborder="0" allowfullscreen></iframe></div>`:''; }
  if(b.type==='contact'){ const st=D.settings||{};
    return `<div class="pg-cn">${b.title?`<h3>${esc(b.title)}</h3>`:''}
      <div class="pg-cn-g">
      ${st.phone?`<a class="pg-cn-i" href="tel:${esc(String(st.phone).replace(/\s/g,''))}"><b>Telefon</b><span>${esc(st.phone)}</span></a>`:''}
      ${st.email?`<a class="pg-cn-i" href="mailto:${esc(st.email)}"><b>E-Posta</b><span>${esc(st.email)}</span></a>`:''}
      ${st.address?`<div class="pg-cn-i"><b>Adres</b><span>${esc(st.address)}</span></div>`:''}</div></div>`; }
  if(b.type==='mecracards'){ const ids=(Array.isArray(b.ids)?b.ids:[]).map(String);
    const list=(D.mecralar||[]).filter(m=>!ids.length||ids.includes(String(m.id)));
    return list.length?`<div class="pg-mc">${list.map(m=>`<a class="pg-mci" href="${BASE}mecra/${mSlug(m)}" onclick="openMec('${m.id}');return false;">
      <div class="pg-mci-im" style="background-image:url('${esc(m.image||m.kapak||'')}')"></div>
      <div class="pg-mci-tx"><b>${esc(m.name)}</b>${m.badge?`<em>${esc(m.badge)}</em>`:''}</div></a>`).join('')}</div>`:''; }
  if(b.type==='divider')return `<hr class="pg-div">`;
  if(b.type==='heading')return `<h2 class="pg-h">${esc(b.text||'')}</h2>`;
  if(b.type==='text')return `<div class="pg-t">${(b.text||'').split('\n').map(p=>p.trim()?`<p>${esc(p)}</p>`:'').join('')}</div>`;
  if(b.type==='image')return `<figure class="pg-img"><img loading="lazy" src="${esc(b.url||'')}" alt="${esc(b.caption||'')}" onclick="lightbox('${esc(b.url||'')}')" style="cursor:zoom-in">${b.caption?`<figcaption>${esc(b.caption)}</figcaption>`:''}</figure>`;
  if(b.type==='gallery'){ const imgs=Array.isArray(b.images)?b.images:[]; return imgs.length?`<div class="pg-gal">${imgs.map(g=>`<div class="pg-gi" style="background-image:url('${esc(g)}');cursor:zoom-in" onclick="lightbox('${esc(g)}')"></div>`).join('')}</div>`:''; }
  if(b.type==='features'){ const it=Array.isArray(b.items)?b.items:[]; return `<div class="pg-feat">${it.map(x=>`<div class="pg-fc"><h3>${esc(x.title||'')}</h3><p>${esc(x.desc||'')}</p></div>`).join('')}</div>`; }
  if(b.type==='faq'){ const it=Array.isArray(b.items)?b.items:[]; return `<div class="pg-faq">${it.map(x=>`<details class="acc"><summary>${esc(x.q||'')}</summary><div>${esc(x.a||'')}</div></details>`).join('')}</div>`; }
  if(b.type==='cta')return `<div class="pg-cta"><h3>${esc(b.title||'')}</h3>${b.label?`<a class="btn btn-primary" href="${esc(b.link||'#')}">${esc(b.label)}</a>`:''}</div>`;
  if(b.type==='spacer')return `<div style="height:${(+b.size||40)}px"></div>`;
  return ''; }).join(''); }

function renderPage(slug){
  const pg=(D.pages||[]).find(p=>p.slug===slug)||{};
  const nav=`<a onclick="goHome()">Medyapark Adana</a> / ${esc(pg.title||'')}`;
  let inner;
  if(Array.isArray(pg.blocks)&&pg.blocks.length){ inner=`<div class="pg-wrap">${renderBlocks(pg.blocks)}</div>`; }
  else { inner=`<div class="sechead"><h1>${esc(pg.title||'')}</h1></div><div class="page-body">${esc(pg.body||'')}</div>`; }
  if(slug==='iletisim'){ const s=D.settings; inner+=`<div class="pg-contact"><div><b>Telefon:</b> ${esc(s.phone||'')}</div><div><b>E-Posta:</b> ${esc(s.email||'')}</div><div><b>Adres:</b> ${esc(s.address||'')}</div></div>`; }
  app().innerHTML=`<div class="pg-top"><div class="pg-crumb">${nav}</div><h1 class="pg-title">${esc(pg.title||'')}</h1></div>${inner}`;
  pgCounters();
}
function pgCounters(){
  const els=[...document.querySelectorAll('.pgc-n')]; if(!els.length)return;
  const anim=el=>{ const to=+el.dataset.to||0, dur=1300, t0=performance.now();
    const step=t=>{ const p=Math.min(1,(t-t0)/dur), e=1-Math.pow(1-p,3);
      el.textContent=Math.round(to*e).toLocaleString('tr-TR'); if(p<1)requestAnimationFrame(step); };
    requestAnimationFrame(step); };
  if(!('IntersectionObserver' in window)){ els.forEach(anim); return; }
  const io=new IntersectionObserver(es=>es.forEach(x=>{ if(x.isIntersecting){ anim(x.target); io.unobserve(x.target); } }),{threshold:.4});
  els.forEach(e=>io.observe(e));
}
/* ---- header menüsü (panelden yönetilir) ---- */
function menuLink(it,kapat){
  const t=it.type||'sayfa', v=it.value||'', lbl=esc(it.label||'');
  const kp=kapat?'closeMenu();':'';
  if(t==='sayfa'){ const p=(D.pages||[]).find(x=>x.slug===v);
    return `<a href="${BASE}sayfa/${esc(v)}" onclick="openPage('${esc(v)}');${kp}return false;">${lbl||esc((p||{}).title||v)}</a>`; }
  if(t==='nerede') return `<a href="${BASE}nerelerdeyiz" onclick="openMapPage();${kp}return false;">${lbl||'Nerelerdeyiz'}</a>`;
  if(t==='anasayfa') return `<a href="${BASE}" onclick="goHome();${kp}return false;">${lbl||'Anasayfa'}</a>`;
  if(t==='mecra'){ const m=mec(v); if(!m)return '';
    return `<a href="${BASE}mecra/${mSlug(m)}" onclick="openMec('${m.id}');${kp}return false;">${lbl||esc(m.name)}</a>`; }
  if(t==='pdf'){ const u=(D.settings||{}).catalogPdf; return u?`<a href="${esc(u)}" download>${lbl||'PDF Katalog'}</a>`:''; }
  if(t==='plan') return `<a href="${BASE}medya-planlama" onclick="openPlan();${kp}return false;">${lbl||'Medya Planlama'}</a>`;
  if(!v) return '';
  return `<a href="${esc(v)}" target="_blank" rel="noopener">${lbl||esc(v)}</a>`;
}
function renderMenu(){
  const cfg=(D.settings||{}).menu;
  const items=(cfg&&Array.isArray(cfg.items)&&cfg.items.length)
    ? cfg.items.filter(i=>i&&i.show!==false)
    : (D.pages||[]).filter(p=>p.in_menu!==false).map(p=>({label:p.title||p.slug,type:'sayfa',value:p.slug}));
  const ust=document.getElementById('navMenu');
  if(ust) ust.innerHTML=items.map(i=>menuLink(i,false)).join('')
    +`<a class="nav-admin" href="admin.html" title="Yönetim Paneli">⚙</a>`;
  const el=document.getElementById('menuPages');
  if(el) el.innerHTML=items.map(i=>menuLink(i,true)).join('');
}
function removeItem(i){ const it=cart[i]; cart.splice(i,1); badge(); renderCart(); if(view.type==='alt'){ if(it)updateCell(it.unitId,it.ym); renderSepetInline(); } }
function badge(){ const b=document.getElementById('cbadge'); if(!b)return; if(cart.length){b.style.display='flex';b.textContent=cart.length;}else b.style.display='none'; }
const cartTotal=()=>cart.reduce((s,c)=>s+(c.price||0),0);
function renderCart(){
  const b=document.getElementById('cartBody'), f=document.getElementById('cartFoot'); if(!b)return;
  if(!cart.length){ b.innerHTML='<div class="empty">Sepetiniz boş.<br>Bir alanın rezervasyon tablosundan müsait ay(lar) seçin.</div>'; f.innerHTML=''; return; }
  b.innerHTML=cart.map((c,i)=>`<div class="citem"><span class="rm" onclick="removeItem(${i})">×</span><div class="cl">${esc(c.mecra)}</div><div class="cm">${esc(c.product)}${c.unit?' › '+esc(c.unit):''} · ${esc(c.monthLabel)}</div>${showPrices()?`<div class="camt">${c.priceLabel}</div>`:''}</div>`).join('');
  f.innerHTML=`${showPrices()?`<div style="display:flex;justify-content:space-between;margin-bottom:12px"><span>Tahmini toplam</span><b>${money(cartTotal())}</b></div>`:''}
    <div style="display:flex;gap:8px;margin-bottom:10px"><button class="btn btn-outline btn-sm" style="flex:1" onclick="exportPDF()">PDF</button><button class="btn btn-outline btn-sm" style="flex:1" onclick="exportExcel()">Excel</button></div>
    <input class="inp" id="qName" placeholder="Ad Soyad" style="margin-bottom:8px"><input class="inp" id="qFirma" placeholder="Firma" style="margin-bottom:8px">
    <input class="inp" id="qTel" placeholder="Telefon" style="margin-bottom:8px"><input class="inp" id="qMail" placeholder="E-posta" style="margin-bottom:10px">
    <button class="btn btn-primary" style="width:100%" onclick="sendQuote()">Teklif Al</button>`;
}
function toggleCart(){ document.getElementById('drawer').classList.toggle('open'); document.getElementById('overlay').classList.toggle('open'); renderCart(); }
async function sendQuote(){
  if(!cart.length)return; const total=cartTotal();
  const {data:q,error}=await sb.from('quotes').insert({customer_name:val('qName'),firma:val('qFirma'),telefon:val('qTel'),eposta:val('qMail'),total}).select('id').single();
  if(error){ alert('Gönderilemedi: '+error.message); return; }
  const items=cart.map(c=>({quote_id:q.id,unit_id:c.unitId,ym:c.ym,mecra_name:(c.mecra+(c.alt?' / '+c.alt:'')),unit_name:c.unit,product_name:c.product,olcu:c.olcu,start_day:c.ym+'-01',period:c.monthLabel,price:c.price}));
  const {error:e2}=await sb.from('quote_items').insert(items); if(e2){ alert('Kalemler kaydedilemedi: '+e2.message); return; }
  const st=D.settings||{}; const ad=val('qName')||val('qFirma')||'';
  const wa=st.social_whatsapp||'';
  const mesaj=encodeURIComponent(`Merhaba, ${ad} olarak #${q.id} numaralı teklif talebini gönderdim. Bilgi alabilir miyim?`);
  const waLink=wa?(wa.includes('?')?wa+'&text='+mesaj:wa+'?text='+mesaj):'';
  cart=[]; badge();
  document.getElementById('cartBody').innerHTML=`<div class="q-ok">
      <div class="q-ic">✓</div>
      <div class="q-t">Talebiniz alındı</div>
      <div class="q-no">Referans no: <b>#${q.id}</b></div>
      <p class="q-p">Ekibimiz <b>en geç 1 iş günü içinde</b> size özel fiyat teklifiyle dönecek.
        Acele ediyorsanız doğrudan ulaşabilirsiniz:</p>
      ${waLink?`<a class="q-wa" href="${esc(waLink)}" target="_blank" rel="noopener">WhatsApp'tan yaz</a>`:''}
      ${st.phone?`<a class="q-tel" href="tel:${esc(String(st.phone).replace(/\s/g,''))}">${esc(st.phone)}</a>`:''}
    </div>`;
  document.getElementById('cartFoot').innerHTML='';
  bildir('<b>Teklif talebiniz gönderildi</b><span>Referans no: #'+q.id+'</span>','ok');
  if(view.type==='alt')renderAlt();
}
const val=id=>{const e=document.getElementById(id);return e?e.value:'';};
function exportExcel(){ if(!cart.length)return; const sp=showPrices();
  const head=['Lokasyon','Alt Mecra','Ünite','Ürün','Dönem'].concat(sp?['Fiyat']:[]);
  const rows=cart.map(c=>[c.mecra,c.alt||'',c.unit,c.product,c.monthLabel].concat(sp?[c.priceLabel]:[]));
  if(sp)rows.push(['','','','','TOPLAM',money(cartTotal())]);
  const csv='\uFEFF'+[head,...rows].map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(';')).join('\r\n'); dl(new Blob([csv],{type:'text/csv;charset=utf-8'}),'teklif-medyapark.csv'); }
function exportPDF(){ if(!cart.length)return; const s=D.settings; const sp=showPrices();
  const rows=cart.map(c=>`<tr><td>${esc(c.mecra)}${c.alt?' / '+esc(c.alt):''}</td><td>${esc(c.unit)}</td><td>${esc(c.product)}</td><td>${esc(c.monthLabel)}</td>${sp?`<td style="text-align:right">${c.priceLabel}</td>`:''}</tr>`).join('');
  const w=window.open('','_blank'); w.document.write(`<html><head><meta charset="utf-8"><title>Teklif</title><style>body{font-family:-apple-system,Arial;padding:40px;color:#1d1d1f}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px;border-bottom:1px solid #eee;text-align:left}tfoot td{font-weight:700;border-top:2px solid #1d1d1f}</style></head><body><h1>${esc(s.logoText||'Medyapark')} — Teklif</h1><p style="color:#6e6e73">${new Date().toLocaleDateString('tr-TR')} · ${esc(s.phone||'')}</p><table><thead><tr><th>Lokasyon</th><th>Ünite</th><th>Ürün</th><th>Dönem</th>${sp?'<th style="text-align:right">Fiyat</th>':''}</tr></thead><tbody>${rows}</tbody>${sp?`<tfoot><tr><td colspan="4">TOPLAM</td><td style="text-align:right">${money(cartTotal())}</td></tr></tfoot>`:''}</table></body></html>`); w.document.close(); setTimeout(()=>w.print(),300); }
const dl=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);};


/* ================= HARİTA SAYFASI ================= */
const ADANA=[37.0000,35.3213];
let mapObj=null, clusterGrp=null, mapQuery='', mapPinsCache=[];
function openMapPage(){ view={type:'map',filter:view.filter||null}; mapQuery=''; const s=document.getElementById('search'); if(s)s.value=''; render(); }

/* Tüm işaretli konumları topla (koordinatı girilmiş pozisyonlar) */
function allPins(){ const out=[];
  D.mecralar.forEach(m=>{ (m.alts||[]).forEach(a=>{ const p=a.product||{};
    (a.units||[]).forEach(u=>{ const la=parseFloat(u.lat), ln=parseFloat(u.lng);
      if(!isFinite(la)||!isFinite(ln))return;
      const pp=posParts(u.name);
      const bk={}; (u.booked||[]).forEach(b=>bk[b.ym]=b.status);
      out.push({lat:la,lng:ln,mecId:m.id,altId:a.id,mec:m.name,alt:a.name,product:p.name||'',productId:a.product_id,
        unit:u.name||'',image:(u.image||a.image||m.image||''),theme:(m.theme_color||'#0071e3'),konum:(u.konum||''),
        yuzey:pp.surf, isikli:(p.isikli||''), etiket:(p.etiketler||''), olcu:(u.olcu||p.olcu||''), bk}); }); }); });
  return out; }

let mapF={urun:[],mecra:[],yuzey:[],isik:'',ay:'',durum:''};
function pinMatches(p){
  if(view.filter && String(p.productId)!==String(view.filter)) return false;
  if(mapF.urun.length && !mapF.urun.includes(String(p.productId))) return false;
  if(mapF.mecra.length && !mapF.mecra.includes(String(p.mecId))) return false;
  if(mapF.yuzey.length && !mapF.yuzey.includes(p.yuzey)) return false;
  if(mapF.isik){ const i=String(p.isikli||'').toLocaleLowerCase('tr');
    if(mapF.isik==='var' && !i.includes('ışık')) return false;
    if(mapF.isik==='yok' && i.includes('ışık')) return false;
    if(mapF.isik==='var' && i.includes('ışıksız')) return false; }
  if(mapF.ay && mapF.durum){
    const st=p.bk[mapF.ay]||'bos';
    if(mapF.durum==='musait' && st!=='bos') return false;
    if(mapF.durum==='dolu'  && st!=='dolu') return false;
    if(mapF.durum==='rezerve'&& st!=='rezerve') return false;
  }
  const q=(mapQuery||'').trim().toLowerCase(); if(!q) return true;
  const havuz=[p.mec,p.alt,p.product,p.unit,p.konum,p.etiket].filter(Boolean).join(' ');
  return havuz.toLocaleLowerCase('tr').includes(q) || esAnlamEslesti(q,havuz); }

/* --- filtre çubuğu --- */
function mapFilterBar(){
  const varPin=mapPinsCache.length>0;
  const kullanilanU=new Set(), kullanilanM=new Set();
  D.mecralar.forEach(m=>(m.alts||[]).forEach(a=>{ if(a.product_id){kullanilanU.add(String(a.product_id));kullanilanM.add(String(m.id));} }));
  const urunler=D.products.filter(p=>varPin
    ? mapPinsCache.some(x=>String(x.productId)===String(p.id)) : kullanilanU.has(String(p.id)));
  const mecralar=D.mecralar.filter(m=>varPin
    ? mapPinsCache.some(x=>String(x.mecId)===String(m.id)) : kullanilanM.has(String(m.id)));
  const aylar=rollMonths().map(mo=>`<option value="${mo.ym}" ${mapF.ay===mo.ym?'selected':''}>${esc(mo.label)} ${mo.y}</option>`).join('');
  const chip=(dizi,val,lbl,grup)=>`<button class="mf-chip ${dizi.includes(val)?'on':''}" onclick="mfTog('${grup}','${val}')">${esc(lbl)}</button>`;
  const aktif=mapF.urun.length+mapF.mecra.length+mapF.yuzey.length+(mapF.isik?1:0)+((mapF.ay&&mapF.durum)?1:0);
  return `<div class="mfilter${aktif?' has':''}">
    <button class="mf-toggle" onclick="document.querySelector('.mfilter').classList.toggle('open')">
      Filtreler${aktif?` <b>${aktif}</b>`:''} <span class="mf-ar">▾</span></button>
    <div class="mf-body">
      <div class="mf-grp"><span class="mf-l">Reklam alanı</span><div class="mf-chips">
        ${urunler.map(p=>`<button class="mf-chip ${mapF.urun.includes(String(p.id))?'on':''}"
          onclick="mfTog('urun','${p.id}')">${uIkon(p.ikon,15)}<span>${esc(p.name)}</span></button>`).join('')||'<i class="mf-none">—</i>'}</div></div>
      <div class="mf-grp"><span class="mf-l">Lokasyon</span><div class="mf-chips">
        ${mecralar.map(m=>chip(mapF.mecra,String(m.id),m.name,'mecra')).join('')||'<i class="mf-none">—</i>'}</div></div>
      <div class="mf-grp"><span class="mf-l">Yüzey</span><div class="mf-chips">
        ${chip(mapF.yuzey,'A','A · ön yüz','yuzey')}${chip(mapF.yuzey,'B','B · arka yüz','yuzey')}</div></div>
      <div class="mf-grp"><span class="mf-l">Aydınlatma</span><div class="mf-chips">
        <button class="mf-chip ${mapF.isik==='var'?'on':''}" onclick="mfSet('isik','var')">Işıklı</button>
        <button class="mf-chip ${mapF.isik==='yok'?'on':''}" onclick="mfSet('isik','yok')">Işıksız</button></div></div>
      <div class="mf-grp wide"><span class="mf-l">Döneme göre durum</span><div class="mf-row">
        <select class="mf-sel" onchange="mapF.ay=this.value;refreshPins();renderFilterBar()">
          <option value="">— ay seçin —</option>${aylar}</select>
        <select class="mf-sel" onchange="mapF.durum=this.value;refreshPins();renderFilterBar()" ${mapF.ay?'':'disabled'}>
          <option value="">— durum —</option>
          <option value="musait" ${mapF.durum==='musait'?'selected':''}>Müsait</option>
          <option value="dolu" ${mapF.durum==='dolu'?'selected':''}>Dolu</option>
          <option value="rezerve" ${mapF.durum==='rezerve'?'selected':''}>Rezerve</option>
        </select></div></div>
      <div class="mf-foot">
        <span class="mf-cnt"><b id="mapCount">0</b> alan bulundu</span>
        ${aktif?'<button class="mf-clear" onclick="mfClear()">Filtreleri temizle</button>':''}
      </div>
    </div></div>`;
}
function renderFilterBar(){
  try{
    const el=document.getElementById('mfWrap'); if(!el)return;
    let acik=false;
    if(typeof el.querySelector==='function'){ const c=el.querySelector('.mfilter'); acik=!!(c&&c.classList.contains('open')); }
    el.innerHTML=mapFilterBar();
    if(acik&&typeof el.querySelector==='function'){ const c=el.querySelector('.mfilter'); if(c)c.classList.add('open'); }
  }catch(e){ /* filtre çubuğu çizilemezse harita yine çalışsın */ }
  try{ setMapMeta(mapPinsCache.filter(pinMatches).length); }catch(e){}
}
function mfTog(grup,val){ const a=mapF[grup]; const i=a.indexOf(val);
  if(i>-1)a.splice(i,1); else a.push(val); refreshPins(); renderFilterBar(); ndKartTazele(); }
function mfSet(k,v){ mapF[k]=(mapF[k]===v)?'':v; refreshPins(); renderFilterBar(); ndKartTazele(); }
function mfClear(){ mapF={urun:[],mecra:[],yuzey:[],isik:'',ay:'',durum:''}; refreshPins(); renderFilterBar(); ndKartTazele(); }

function pinIcon(color){ return L.divIcon({className:'pin-wrap',iconSize:[30,40],iconAnchor:[15,38],popupAnchor:[0,-34],
  html:`<span class="pin" style="--pc:${color}"></span>`}); }

function popupHTML(p){
  const img=p.image?`<div class="pp-img" style="background-image:url('${esc(p.image)}')"></div>`:'';
  const sub=[p.product,p.unit].filter(Boolean).join(' › ');
  return `<div class="pp">${img}<div class="pp-b"><div class="pp-t">${esc(p.mec)}</div>
    <div class="pp-s">${esc(sub)}</div>${p.konum?`<div class="pp-k">${esc(p.konum)}</div>`:''}
    <button class="btn btn-primary btn-sm" style="width:100%;margin-top:10px" onclick="openAlt('${p.mecId}','${p.altId}')">Detaya Git →</button>
    <a class="pp-ext" href="https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}" target="_blank" rel="noopener">Google Haritalar'da aç ↗</a></div></div>`; }

/* ---- motor: anahtar varsa Google Maps, yoksa OpenStreetMap ---- */
let mapEngine='leaflet', gMap=null, gCluster=null, gInfo=null, gMarkers=[], gLoading=null;
function gKey(){ return String((D.settings||{}).googleMapsKey||'').trim(); }

function loadGoogle(){
  if(gLoading) return gLoading;
  gLoading=new Promise((res,rej)=>{
    const key=gKey(); if(!key) return rej(new Error('anahtar girilmemis'));
    if(window.google&&window.google.maps&&window.markerClusterer) return res();
    const t=setTimeout(()=>rej(new Error('zaman asimi')),15000);
    window.gm_authFailure=()=>{ clearTimeout(t); rej(new Error('anahtar reddedildi')); };
    window.__gmReady=()=>{
      const c=document.createElement('script');
      c.src='https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js';
      c.onload=()=>{ clearTimeout(t); res(); };
      c.onerror=()=>{ clearTimeout(t); rej(new Error('kumeleme kutuphanesi yuklenemedi')); };
      document.head.appendChild(c);
    };
    const g=document.createElement('script');
    g.async=true;
    g.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&callback=__gmReady&language=tr&region=TR';
    g.onerror=()=>{ clearTimeout(t); rej(new Error('google maps yuklenemedi')); };
    document.head.appendChild(g);
  });
  return gLoading;
}

function gPinSvg(color){ return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">'+
  '<path d="M16 41C16 41 30 25.5 30 15A14 14 0 1 0 2 15c0 10.5 14 26 14 26z" fill="'+color+'" stroke="#fff" stroke-width="3"/>'+
  '<circle cx="16" cy="15" r="5.2" fill="#fff"/></svg>'); }

function gClusterSvg(sz){ return 'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="'+sz+'" height="'+sz+'">'+
  '<circle cx="'+(sz/2)+'" cy="'+(sz/2)+'" r="'+(sz/2-3)+'" fill="#0071e3" stroke="rgba(255,255,255,.92)" stroke-width="3"/></svg>'); }

function setMapMeta(n){
  const c=document.getElementById('mapCount'); if(c)c.textContent=n;
  const e=document.getElementById('mapEmpty'); if(e)e.style.display=n?'none':'block'; }

function refreshPins(){
  const list=mapPinsCache.filter(pinMatches);
  setMapMeta(list.length);
  if(mapEngine==='google'){
    if(!gMap)return;
    if(gCluster)gCluster.clearMarkers();
    gMarkers.forEach(mk=>mk.setMap(null));
    gMarkers=list.map(p=>{
      const mk=new google.maps.Marker({position:{lat:p.lat,lng:p.lng},title:p.mec+' \u00b7 '+p.unit,
        icon:{url:gPinSvg(p.theme),scaledSize:new google.maps.Size(32,42),anchor:new google.maps.Point(16,41)}});
      mk.addListener('click',()=>{ gInfo.setContent(popupHTML(p)); gInfo.open({anchor:mk,map:gMap}); });
      return mk; });
    if(gCluster)gCluster.addMarkers(gMarkers);
    if(list.length){
      const b=new google.maps.LatLngBounds();
      list.forEach(p=>b.extend({lat:p.lat,lng:p.lng}));
      gMap.fitBounds(b,60);
      google.maps.event.addListenerOnce(gMap,'idle',()=>{ if(gMap.getZoom()>16)gMap.setZoom(16); });
    }
    return;
  }
  if(!clusterGrp)return;
  clusterGrp.clearLayers();
  const markers=list.map(p=>L.marker([p.lat,p.lng],{icon:pinIcon(p.theme),title:p.mec+' \u00b7 '+p.unit}).bindPopup(popupHTML(p),{maxWidth:280,minWidth:240}));
  clusterGrp.addLayers(markers);
  if(list.length){ try{ mapObj.fitBounds(L.latLngBounds(list.map(p=>[p.lat,p.lng])).pad(0.18),{maxZoom:15}); }catch(e){} }
}

function initGoogleMap(){
  gMap=new google.maps.Map(document.getElementById('mapCanvas'),{
    center:{lat:ADANA[0],lng:ADANA[1]}, zoom:13,
    mapTypeControl:true, streetViewControl:true, fullscreenControl:true,
    styles:[{featureType:'poi.business',stylers:[{visibility:'simplified'}]}]});
  gInfo=new google.maps.InfoWindow({maxWidth:280});
  gCluster=new markerClusterer.MarkerClusterer({map:gMap,markers:[],renderer:{
    render:function(o){ const count=o.count, position=o.position; const sz=count<10?38:(count<50?46:54);
      return new google.maps.Marker({position:position,zIndex:1000+count,
        label:{text:String(count),color:'#fff',fontSize:'13px',fontWeight:'700'},
        icon:{url:gClusterSvg(sz),scaledSize:new google.maps.Size(sz,sz),anchor:new google.maps.Point(sz/2,sz/2)}}); }}});
  mapEngine='google';
  refreshPins();
}

function initLeafletMap(note){
  const el=document.getElementById('mapCanvas'); if(!el)return;
  if(typeof L==='undefined'){ el.innerHTML='<div class="map-empty">Harita yuklenemedi. Baglantinizi kontrol edip sayfayi yenileyin.</div>'; return; }
  mapObj=L.map('mapCanvas',{scrollWheelZoom:true}).setView(ADANA,13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap katkida bulunanlar'}).addTo(mapObj);
  clusterGrp=L.markerClusterGroup({showCoverageOnHover:false,maxClusterRadius:55,spiderfyOnMaxZoom:true,
    iconCreateFunction:function(c){ const n=c.getChildCount(); const sz=n<10?36:(n<50?44:52);
      return L.divIcon({html:'<div class="cl-b" style="width:'+sz+'px;height:'+sz+'px;line-height:'+sz+'px">'+n+'</div>',className:'cl-w',iconSize:[sz,sz]}); }});
  mapObj.addLayer(clusterGrp);
  mapEngine='leaflet';
  refreshPins();
  setTimeout(function(){ mapObj.invalidateSize(); },200);
  if(note){ const w=document.getElementById('mapNote'); if(w){ w.textContent=note; w.style.display='block'; } }
}

function renderMap(){
  const H=(D.settings||{}).home||{};
  const nav=`<a href="${BASE}" onclick="goHome();return false;">Anasayfa</a> <i>/</i> <span>Nerelerdeyiz</span>`;
  const st=D.settings||{};
  const N=H.nerede||{};
  app().innerHTML=`
    <section class="mapintro nd-intro">
      <div class="crumbs" style="justify-content:center">${nav}</div>
      <h1>${esc(N.baslik||'Nerelerdeyiz')}</h1>
      ${(N.alt||'')?`<p>${esc(N.alt)}</p>`:`<p>Adana genelindeki tüm reklam alanlarımızı harita üzerinde inceleyin, aşağıdaki listeden detaylara geçin.</p>`}
    </section>
    <section class="homemap nd-map">
      <div id="mapCanvas" class="hm-canvas"></div>
      <div class="hm-bar">
        <div class="hm-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>
          <input id="ndSearch" value="${esc(mapQuery)}" placeholder="Lokasyon, reklam alanı veya pozisyon ara" oninput="ndAra(this.value)">
          <button class="hm-x" onclick="document.getElementById('ndSearch').value='';ndAra('')" title="Temizle" style="${mapQuery?'':'display:none'}">×</button>
        </div>
        <span class="hm-sep"></span>
        <span class="hm-info"><b id="mapCount">0</b> alan</span>
      </div>
      <div id="mapNote" class="map-note" style="display:none"></div>
    </section>
    <div class="wrap">
      <div id="mfWrap"></div>
      <section class="hero compact"><h2>Tüm Lokasyonlar</h2>
        <p id="ndSay">${D.mecralar.length} lokasyon</p></section>
      <div class="grid3" id="ndGrid">${ndKartlar()}</div>
      <div style="height:60px"></div>
    </div>`;
  mapPinsCache=allPins();
  renderFilterBar();
  setTimeout(function(){
    if(gKey()){
      loadGoogle().then(function(){ initGoogleMap(); })
        .catch(function(err){
          console.warn('Google Maps kullanilamadi:',err.message);
          initLeafletMap('Google Maps yuklenemedi ('+err.message+'). Harita gecici olarak OpenStreetMap ile gosteriliyor.');
        });
    } else { initLeafletMap(); }
  },60);
}
/* ortak çip satırı: hem anasayfa hem nerelerdeyiz kullanır */
function cipSatiri(fn){
  const pins=allPins();
  const kullanilan=new Set();
  D.mecralar.forEach(m=>(m.alts||[]).forEach(a=>{ if(a.product_id)kullanilan.add(String(a.product_id)); }));
  const urunler=D.products.filter(p=> pins.length
    ? pins.some(x=>String(x.productId)===String(p.id))
    : kullanilan.has(String(p.id)));
  if(!urunler.length) return '';
  return `<div class="hm-chips">
    <button class="hs-chip ${view.filter?'':'on'}" onclick="${fn}('')">Tümü</button>
    ${urunler.map(p=>`<button class="hs-chip ${String(view.filter)===String(p.id)?'on':''}"
      onclick="${fn}('${p.id}')">${uIkon(p.ikon,15)}<span>${esc(p.name)}</span></button>`).join('')}</div>`;
}
/* nerelerdeyiz: kart listesi haritayla birlikte süzülür */
function ndListe(){
  const q=(mapQuery||'').trim().toLowerCase();
  let list=D.mecralar.slice();
  if(view.filter) list=list.filter(m=>(m.alts||[]).some(a=>String(a.product_id)===String(view.filter)));
  if(view.filterLoc) list=list.filter(m=>String(m.id)===String(view.filterLoc));
  if(mapF.urun.length) list=list.filter(m=>(m.alts||[]).some(a=>mapF.urun.includes(String(a.product_id))));
  if(mapF.mecra.length) list=list.filter(m=>mapF.mecra.includes(String(m.id)));
  if(q) list=list.filter(m=>{
    const havuz=[m.name,...(m.alts||[]).flatMap(a=>[a.name,(a.product||{}).name,(a.product||{}).etiketler])].filter(Boolean).join(' ');
    return havuz.toLocaleLowerCase('tr').includes(q) || esAnlamEslesti(q,havuz); });
  return list;
}
function ndKartlar(){
  const list=ndListe();
  return list.map(m=>{ const sub=[m.gunluk_gosterim,m.toplam_alan].filter(Boolean).join(' · ');
    return gcard(`openMec('${m.id}')`, m.name, sub, m.image, m.theme_color, 'Keşfet', m.image_mobil, BASE+'mecra/'+mSlug(m));}).join('')
    || '<p class="muted">Aramanıza uygun lokasyon bulunamadı.</p>';
}
function ndKartTazele(){
  const g=document.getElementById('ndGrid'); if(g) g.innerHTML=ndKartlar();
  const c=document.getElementById('ndSay'); if(c) c.textContent=ndListe().length+' lokasyon';
}
function ndTazele(){
  ndKartTazele();
  refreshPins();
  document.querySelectorAll('.hm-bar .hs-chip').forEach(b=>{
    const t=(b.getAttribute('onclick')||'').match(/ndFiltre\('([^']*)'\)/);
    if(!t)return; const v=t[1];
    b.classList.toggle('on', v ? String(view.filter)===String(v) : !view.filter); });
  const x=document.querySelector('.nd-map .hm-x'); if(x) x.style.display=mapQuery?'':'none';
}
function ndAra(v){ mapQuery=v||''; ndTazele(); }
function ndFiltre(id){ view.filter=id||null; ndTazele(); buildFilter&&buildFilter(); }


/* ---- kısa bildirim ---- */
let _tT=null;
function bildir(msg,tip){
  let el=document.getElementById('sToast');
  if(!el){ el=document.createElement('div'); el.id='sToast'; el.className='s-toast'; document.body.appendChild(el); }
  el.className='s-toast'+(tip?' '+tip:''); el.innerHTML=msg; el.classList.add('on');
  clearTimeout(_tT); _tT=setTimeout(()=>el.classList.remove('on'),3200);
}
function sepetCanlan(){ const b=document.querySelector('.iconbtn.cart');
  if(!b)return; b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }

/* ---- footer ---- */
/* footer bağlantısı: panelde seçilen türe göre adres üretir */
function ftrLink(it){
  const t=it.type||'url', v=it.value||'';
  const lbl=esc(it.label||'');
  if(t==='sayfa'){ const p=(D.pages||[]).find(x=>x.slug===v);
    return `<a href="${BASE}sayfa/${esc(v)}" onclick="openPage('${esc(v)}');return false;">${lbl||esc((p||{}).title||v)}</a>`; }
  if(t==='mecra'){ const m=mec(v); if(!m)return '';
    return `<a href="${BASE}mecra/${mSlug(m)}" onclick="openMec('${m.id}');return false;">${lbl||esc(m.name)}</a>`; }
  if(t==='harita') return `<a href="${BASE}harita" onclick="openMapPage();return false;">${lbl||'Harita'}</a>`;
  if(t==='anasayfa') return `<a href="${BASE}" onclick="goHome();return false;">${lbl||'Anasayfa'}</a>`;
  if(t==='pdf'){ const u=(D.settings||{}).catalogPdf; return u?`<a href="${esc(u)}" download>${lbl||'PDF Katalog'}</a>`:''; }
  if(t==='tel'){ const u=(D.settings||{}).phone||v; return `<a href="tel:${esc(String(u).replace(/\s/g,''))}">${lbl||esc(u)}</a>`; }
  if(!v) return '';
  const dis=/^https?:/i.test(v);
  return `<a href="${esc(v)}"${dis?' target="_blank" rel="noopener"':''}>${lbl||esc(v)}</a>`;
}
function renderFooter(){ const s=D.settings||{};
  const cfg=s.footer&&Array.isArray(s.footer.cols)&&s.footer.cols.length?s.footer:null;
  let cols;
  if(cfg){
    cols=cfg.cols.filter(c=>c&&(c.title||(c.items||[]).length)).map(c=>{
      const links=(c.items||[]).map(ftrLink).filter(Boolean).join('');
      return `<div><h5>${esc(c.title||'')}</h5>${(c.grid?`<div class="meccols">${links}</div>`:links)}</div>`;
    }).join('');
  } else {
    /* panelde ayar yoksa eski davranış */
    const mecLinks=D.mecralar.map(m=>`<a href="${BASE}mecra/${mSlug(m)}" onclick="openMec('${m.id}');return false;">${esc(m.name)}</a>`).join('');
    const pdf=s.catalogPdf?`<a href="${esc(s.catalogPdf)}" download>PDF Katalog</a>`:'';
    cols=`<div><h5>SAYFALAR</h5>${(D.pages||[]).filter(p=>p.in_menu!==false).map(p=>`<a href="${BASE}sayfa/${esc(p.slug)}" onclick="openPage('${p.slug}');return false;">${esc(p.title||p.slug)}</a>`).join('')}${pdf}</div>
      <div><h5>MECRALARIMIZ</h5><div class="meccols">${mecLinks}</div></div>`;
  }
  const iletisim=(cfg&&cfg.hideContact)?'':`<div><h5>İLETİŞİM</h5><div class="il"><b>Adres:</b> ${esc(s.address||'')}<br><br><b>Telefon:</b> ${esc(s.phone||'')}<br><br><b>E-Posta:</b> ${esc(s.email||'')}<br><br>${esc(s.socials||'')}</div></div>`;
  const bulten=(cfg&&cfg.hideNews)?'':`<div class="news"><h5 style="text-align:center">${esc(s.footer_news||"Kampanya ve yeniliklerden haberdar olmak için;")}</h5><input class="inp" placeholder="E-Posta"><button class="abone" onclick="alert('Teşekkürler! Kaydınız alındı.')">Abone Ol</button></div>`;
  document.getElementById('foot').innerHTML=`<div class="ftr"><div class="ftr-in">
    <div><div class="brand">${logo(s.logoText)}</div><p style="font-size:13px;color:#8a8a90;max-width:26ch">${esc(s.footer_about||"Adana açık hava reklam çözümleri.")}</p></div>
    ${cols}${iletisim}${bulten}
  </div><div class="ftr-bottom"><div class="inner">${esc(s.footer_note||"Tüm hakları saklıdır. Polat Medya Tanıtım Paz. Org. San. ve Tic. Ltd. Şti.")}</div></div></div>`;
}

/* ---- Google Analytics (GA4) ---- */
function initAnalytics(){
  const id=String((D.settings||{}).gaId||'').trim();
  if(!id || !/^G-[A-Z0-9]+$/i.test(id)) return;
  if(window.__gaOn) return; window.__gaOn=true;
  const sc=document.createElement('script'); sc.async=true;
  sc.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(id);
  document.head.appendChild(sc);
  window.dataLayer=window.dataLayer||[];
  window.gtag=function(){ window.dataLayer.push(arguments); };
  gtag('js',new Date());
  gtag('config',id,{send_page_view:false});   /* sayfa görüntülemeyi biz gönderiyoruz */
  gaPage();
}
function gaPage(){
  if(!window.gtag)return;
  try{ gtag('event','page_view',{page_title:document.title,
    page_location:location.origin+BASE+viewPath(), page_path:BASE+viewPath()}); }catch(e){}
}

function toggleMenu(e){e.stopPropagation();document.getElementById('menu').classList.toggle('open');}
function closeMenu(){const m=document.getElementById('menu'); if(m)m.classList.remove('open'); const f=document.getElementById('filterMenu'); if(f)f.classList.remove('open');}
document.addEventListener('click',function(){const m=document.getElementById('homeFMenu');if(m)m.classList.remove('open');});
document.addEventListener('click',closeMenu);
load();
