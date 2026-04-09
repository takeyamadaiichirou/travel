'use strict';

const REGIONS_ORDER = ["北海道","東北","関東","中部","近畿","中国","四国","九州","沖縄"];
const PREF_INFO = {
  "1":"北海道","2":"青森県","3":"岩手県","4":"宮城県","5":"秋田県","6":"山形県","7":"福島県",
  "8":"茨城県","9":"栃木県","10":"群馬県","11":"埼玉県","12":"千葉県","13":"東京都","14":"神奈川県",
  "15":"新潟県","16":"富山県","17":"石川県","18":"福井県","19":"山梨県","20":"長野県",
  "21":"岐阜県","22":"静岡県","23":"愛知県","24":"三重県","25":"滋賀県","26":"京都府",
  "27":"大阪府","28":"兵庫県","29":"奈良県","30":"和歌山県","31":"鳥取県","32":"島根県",
  "33":"岡山県","34":"広島県","35":"山口県","36":"徳島県","37":"香川県","38":"愛媛県",
  "39":"高知県","40":"福岡県","41":"佐賀県","42":"長崎県","43":"熊本県","44":"大分県",
  "45":"宮崎県","46":"鹿児島県","47":"沖縄県"
};
const PREF_REGION = {
  "1":"北海道","2":"東北","3":"東北","4":"東北","5":"東北","6":"東北","7":"東北",
  "8":"関東","9":"関東","10":"関東","11":"関東","12":"関東","13":"関東","14":"関東",
  "15":"中部","16":"中部","17":"中部","18":"中部","19":"中部","20":"中部",
  "21":"中部","22":"中部","23":"中部","24":"近畿","25":"近畿","26":"近畿",
  "27":"近畿","28":"近畿","29":"近畿","30":"近畿","31":"中国","32":"中国",
  "33":"中国","34":"中国","35":"中国","36":"四国","37":"四国","38":"四国",
  "39":"四国","40":"九州","41":"九州","42":"九州","43":"九州","44":"九州",
  "45":"九州","46":"九州","47":"沖縄"
};

const STORAGE_KEY = 'japan-travel-photos';
const padCode = c => String(c).padStart(2,'0');

// ── Web用 ストレージ（localStorage）────────────────────────────────
const webApi = {
  loadStore: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  },
  saveStore: (data) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
  },
  openImages: () => new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = async () => {
      const files = Array.from(input.files);
      const results = await Promise.all(files.map(f => new Promise(res => {
        const reader = new FileReader();
        reader.onload = e => res({ data: e.target.result, name: f.name });
        reader.readAsDataURL(f);
      })));
      resolve(results);
    };
    input.oncancel = () => resolve([]);
    input.click();
  })
};

let store = {};
let currentPref = null;
let lbIndex = 0, lbPhotos = [];
let scale = 1, offX = 0, offY = 0;
let dragging = false, dragStart = {x:0,y:0};
let prefEls = {};

const $ = id => document.getElementById(id);

function init() {
  store = webApi.loadStore();
  setupMap();
  buildNav('');
  bindDrag();
  bindZoom();
  bindLightbox();
  $('search-input').addEventListener('input', () => buildNav($('search-input').value));
}

function setupMap() {
  const groups = document.querySelectorAll('[data-code]');
  groups.forEach(g => {
    const raw = g.getAttribute('data-code');
    const name = PREF_INFO[raw];
    if (!name) return;
    g.classList.add('pref-group');
    if ((store[padCode(raw)]||[]).length > 0) g.classList.add('has-photos');
    g.addEventListener('mouseenter', () => {
      const count = (store[padCode(raw)]||[]).length;
      $('tooltip').innerHTML = name + (count ? `<span class="t-count">${count}枚</span>` : '');
      $('tooltip').style.opacity = '1';
    });
    g.addEventListener('mousemove', e => {
      const r = $('map-stage').getBoundingClientRect();
      $('tooltip').style.left = (e.clientX - r.left + 14) + 'px';
      $('tooltip').style.top  = (e.clientY - r.top - 36) + 'px';
    });
    g.addEventListener('mouseleave', () => $('tooltip').style.opacity = '0');
    g.addEventListener('click', () => openPref(raw));
    prefEls[raw] = g;
  });
}

function buildNav(query) {
  const sec = $('region-sections');
  sec.innerHTML = '';
  const q = query.trim();
  REGIONS_ORDER.forEach(region => {
    const codes = Object.keys(PREF_INFO).filter(c =>
      PREF_REGION[c] === region &&
      (!q || PREF_INFO[c].includes(q) || PREF_INFO[c].replace(/[都道府県]/g,'').includes(q))
    ).sort((a,b) => Number(a)-Number(b));
    if (!codes.length) return;
    const g = document.createElement('div');
    const lbl = document.createElement('div');
    lbl.className = 'region-group-label';
    lbl.textContent = region;
    g.appendChild(lbl);
    codes.forEach(raw => {
      const code = padCode(raw);
      const count = (store[code]||[]).length;
      const item = document.createElement('div');
      item.className = 'nav-item'+(count>0?' has-photos':'')+(currentPref===raw?' active':'');
      item.innerHTML = `<span class="nav-dot"></span><span class="nav-name">${PREF_INFO[raw]}</span><span class="nav-count">${count}</span>`;
      item.addEventListener('click', () => openPref(raw));
      g.appendChild(item);
    });
    sec.appendChild(g);
  });
  let total = 0;
  Object.values(store).forEach(a => total += a.length);
  $('total-count').textContent = total + ' 枚の写真';
}

function applyTransform() {
  $('map-inner').style.transform = `translate(${offX}px,${offY}px) scale(${scale})`;
}
function bindZoom() {
  $('zoom-in').addEventListener('click',  () => { scale=Math.min(5,scale*1.3); applyTransform(); });
  $('zoom-out').addEventListener('click', () => { scale=Math.max(0.4,scale/1.3); applyTransform(); });
  $('zoom-reset').addEventListener('click', () => { scale=1;offX=0;offY=0; applyTransform(); });
  $('map-stage').addEventListener('wheel', e => {
    e.preventDefault();
    scale = Math.min(5, Math.max(0.4, scale*(e.deltaY>0?0.85:1.18)));
    applyTransform();
  }, {passive:false});
}
function bindDrag() {
  const stage = $('map-stage');
  stage.addEventListener('mousedown', e => {
    if (e.target.closest('.pref-group')) return;
    dragging=true; dragStart={x:e.clientX-offX,y:e.clientY-offY};
    stage.classList.add('dragging');
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    offX=e.clientX-dragStart.x; offY=e.clientY-dragStart.y;
    applyTransform();
  });
  document.addEventListener('mouseup', () => { dragging=false; $('map-stage').classList.remove('dragging'); });
}

function showMapView() {
  $('map-view').classList.add('active');
  $('pref-view').classList.remove('active');
  Object.values(prefEls).forEach(el => el.classList.remove('active'));
  currentPref = null;
  buildNav($('search-input').value);
}
function openPref(raw) {
  currentPref = raw;
  $('pref-name-title').textContent = PREF_INFO[raw];
  $('pref-region-tag').textContent = PREF_REGION[raw];
  renderPhotos();
  $('map-view').classList.remove('active');
  $('pref-view').classList.add('active');
  Object.values(prefEls).forEach(el => el.classList.remove('active'));
  if (prefEls[raw]) prefEls[raw].classList.add('active');
  buildNav($('search-input').value);
}

function renderPhotos() {
  const code = padCode(currentPref);
  const photos = store[code]||[];
  const grid=$('photo-grid'), empty=$('empty-photos');
  grid.innerHTML='';
  if (!photos.length) { empty.classList.add('show'); grid.style.display='none'; return; }
  empty.classList.remove('show'); grid.style.display='';
  photos.forEach((src,i) => {
    const card=document.createElement('div'); card.className='photo-card';
    const img=document.createElement('img'); img.src=src; img.alt=''; img.loading='lazy';
    img.addEventListener('click', ()=>openLightbox(i));
    const del=document.createElement('button'); del.className='del-btn'; del.textContent='✕';
    del.addEventListener('click', e=>{e.stopPropagation();deletePhoto(i);});
    card.appendChild(img); card.appendChild(del); grid.appendChild(card);
  });
}
async function addPhotos() {
  const files = await webApi.openImages();
  if (!files.length) return;
  const code = padCode(currentPref);
  if (!store[code]) store[code]=[];
  files.forEach(f => store[code].push(f.data));
  webApi.saveStore(store);
  renderPhotos();
  if (prefEls[currentPref]) prefEls[currentPref].classList.toggle('has-photos', store[code].length>0);
  buildNav($('search-input').value);
}
function deletePhoto(i) {
  const code=padCode(currentPref);
  store[code].splice(i,1);
  webApi.saveStore(store);
  renderPhotos();
  if (prefEls[currentPref]) prefEls[currentPref].classList.toggle('has-photos',(store[code]||[]).length>0);
  buildNav($('search-input').value);
}

function openLightbox(i) { lbPhotos=store[padCode(currentPref)]||[]; lbIndex=i; showLb(); $('lightbox').classList.add('open'); }
function showLb() { $('lb-img').src=lbPhotos[lbIndex]; $('lb-caption').textContent=(lbIndex+1)+' / '+lbPhotos.length; }
function bindLightbox() {
  $('lb-close').addEventListener('click', ()=>$('lightbox').classList.remove('open'));
  $('lb-backdrop').addEventListener('click', ()=>$('lightbox').classList.remove('open'));
  $('lb-prev').addEventListener('click', ()=>{ lbIndex=(lbIndex-1+lbPhotos.length)%lbPhotos.length; showLb(); });
  $('lb-next').addEventListener('click', ()=>{ lbIndex=(lbIndex+1)%lbPhotos.length; showLb(); });
  document.addEventListener('keydown', e=>{
    if (!$('lightbox').classList.contains('open')) return;
    if (e.key==='Escape') $('lightbox').classList.remove('open');
    if (e.key==='ArrowLeft') { lbIndex=(lbIndex-1+lbPhotos.length)%lbPhotos.length; showLb(); }
    if (e.key==='ArrowRight') { lbIndex=(lbIndex+1)%lbPhotos.length; showLb(); }
  });
}

$('back-btn').addEventListener('click', showMapView);
$('add-photo-btn').addEventListener('click', addPhotos);
$('empty-add-btn').addEventListener('click', addPhotos);

init();
