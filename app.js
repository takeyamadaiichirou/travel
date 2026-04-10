'use strict';

const CLIENT_ID = '585463306650-pqr0kjh8pibvqi6u0o92a83fcef52iov.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/photoslibrary.readonly';
const STORAGE_KEY = 'japan-travel-photos-v2';

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

const padCode = c => String(c).padStart(2,'0');

let store = {};
let currentPref = null;
let lbIndex = 0, lbPhotos = [];
let scale = 1, offX = 0, offY = 0;
let dragging = false, dragStart = {x:0,y:0};
let prefEls = {};
let accessToken = null;
let gpPhotos = []; // Google Photos picker results
let gpPage = 1;
let gpNextPageToken = null;
let gpLoading = false;

const $ = id => document.getElementById(id);

// ── ストレージ ────────────────────────────────────────────────────
function loadStore() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'); } catch(e) { return {}; }
}
function saveStore() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch(e) {}
}

// ── Google Identity Services ──────────────────────────────────────
function initGoogleAuth() {
  if (!window.google) return;
  window.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: (resp) => {
      if (resp.error) { showMsg('Googleログインに失敗しました'); return; }
      accessToken = resp.access_token;
      updateAuthUI(true);
      showMsg('Googleフォトに接続しました');
    }
  });
}

function loginGoogle() {
  if (!window.tokenClient) { showMsg('Google認証ライブラリを読み込み中です'); return; }
  window.tokenClient.requestAccessToken();
}

function logoutGoogle() {
  if (accessToken) {
    google.accounts.oauth2.revoke(accessToken, () => {});
    accessToken = null;
  }
  updateAuthUI(false);
  closeGpModal();
}

function updateAuthUI(loggedIn) {
  $('btn-login').style.display = loggedIn ? 'none' : 'flex';
  $('btn-logout').style.display = loggedIn ? 'flex' : 'none';
  $('btn-gp-pick').style.display = loggedIn ? 'flex' : 'none';
}

// ── Google Photos API ─────────────────────────────────────────────
async function fetchGpPhotos(pageToken) {
  if (!accessToken) return;
  gpLoading = true;
  updateGpLoading(true);
  try {
    let url = 'https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=50';
    if (pageToken) url += '&pageToken=' + pageToken;
    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    if (!res.ok) {
      if (res.status === 401) { accessToken = null; updateAuthUI(false); showMsg('再度ログインしてください'); return; }
      throw new Error('API error ' + res.status);
    }
    const data = await res.json();
    gpNextPageToken = data.nextPageToken || null;
    return data.mediaItems || [];
  } catch(e) {
    showMsg('写真の取得に失敗しました: ' + e.message);
    return [];
  } finally {
    gpLoading = false;
    updateGpLoading(false);
  }
}

function updateGpLoading(on) {
  const el = $('gp-loading');
  if (el) el.style.display = on ? 'flex' : 'none';
}

// ── Google Photos モーダル ────────────────────────────────────────
async function openGpModal() {
  if (!accessToken) { loginGoogle(); return; }
  $('gp-modal').style.display = 'flex';
  gpPhotos = [];
  gpNextPageToken = null;
  $('gp-grid').innerHTML = '';
  $('gp-load-more').style.display = 'none';
  const items = await fetchGpPhotos();
  if (items) appendGpItems(items);
}

function closeGpModal() {
  $('gp-modal').style.display = 'none';
}

function appendGpItems(items) {
  const grid = $('gp-grid');
  items.forEach(item => {
    gpPhotos.push(item);
    const div = document.createElement('div');
    div.className = 'gp-item';
    div.dataset.id = item.id;

    // サムネイル（画像・動画共通）
    const isVideo = item.mediaMetadata && item.mediaMetadata.video;
    const thumbUrl = item.baseUrl + '=w200-h200-c';
    div.innerHTML = `
      <img src="${thumbUrl}" alt="" loading="lazy">
      ${isVideo ? '<span class="gp-video-badge">▶ 動画</span>' : ''}
    `;
    div.addEventListener('click', () => toggleGpSelect(div, item));
    grid.appendChild(div);
  });

  // もっと読み込むボタン
  $('gp-load-more').style.display = gpNextPageToken ? 'block' : 'none';
}

function toggleGpSelect(div, item) {
  div.classList.toggle('selected');
}

async function loadMoreGp() {
  if (!gpNextPageToken || gpLoading) return;
  const items = await fetchGpPhotos(gpNextPageToken);
  if (items) appendGpItems(items);
}

async function addSelectedGpPhotos() {
  const selected = $('gp-grid').querySelectorAll('.gp-item.selected');
  if (!selected.length) { showMsg('写真を選択してください'); return; }

  const code = padCode(currentPref);
  if (!store[code]) store[code] = [];

  $('gp-add-btn').textContent = '追加中...';
  $('gp-add-btn').disabled = true;

  for (const div of selected) {
    const item = gpPhotos.find(p => p.id === div.dataset.id);
    if (!item) continue;
    const isVideo = item.mediaMetadata && item.mediaMetadata.video;
    // 動画はダウンロードURL、画像は高解像度URL
    const url = isVideo
      ? item.baseUrl + '=dv'
      : item.baseUrl + '=w1600-h1600';
    store[code].push({ type: isVideo ? 'video' : 'image', url, id: item.id });
  }

  saveStore();
  renderPhotos();
  if (prefEls[currentPref])
    prefEls[currentPref].classList.toggle('has-photos', store[code].length > 0);
  buildNav($('search-input').value);
  closeGpModal();
  $('gp-add-btn').textContent = '追加する';
  $('gp-add-btn').disabled = false;
  showMsg(selected.length + '件を追加しました');
}

// ── ローカルファイル追加 ──────────────────────────────────────────
function openLocalPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,.heic,.heif';
  input.multiple = true;
  input.onchange = async () => {
    const code = padCode(currentPref);
    if (!store[code]) store[code] = [];
    const files = Array.from(input.files);
    for (const f of files) {
      const isVideo = f.type.startsWith('video/');
      const data = await new Promise(res => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.readAsDataURL(f);
      });
      store[code].push({ type: isVideo ? 'video' : 'image', url: data, id: Date.now() + Math.random() });
    }
    saveStore();
    renderPhotos();
    if (prefEls[currentPref])
      prefEls[currentPref].classList.toggle('has-photos', store[code].length > 0);
    buildNav($('search-input').value);
  };
  input.click();
}

// ── トースト通知 ──────────────────────────────────────────────────
function showMsg(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── 地図セットアップ ──────────────────────────────────────────────
function setupMap() {
  document.querySelectorAll('[data-code]').forEach(g => {
    const raw = g.getAttribute('data-code');
    if (!PREF_INFO[raw]) return;
    g.classList.add('pref-group');
    const code = padCode(raw);
    if ((store[code]||[]).length > 0) g.classList.add('has-photos');
    g.addEventListener('mouseenter', () => {
      const count = (store[code]||[]).length;
      $('tooltip').innerHTML = PREF_INFO[raw] + (count ? `<span class="t-count">${count}件</span>` : '');
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

// ── ナビ ──────────────────────────────────────────────────────────
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
  $('total-count').textContent = total + ' 件';
}

// ── ズーム・ドラッグ ──────────────────────────────────────────────
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
    offX=e.clientX-dragStart.x; offY=e.clientY-dragStart.y; applyTransform();
  });
  document.addEventListener('mouseup', () => { dragging=false; $('map-stage').classList.remove('dragging'); });
}

// ── 画面遷移 ──────────────────────────────────────────────────────
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

// ── 写真表示 ──────────────────────────────────────────────────────
function renderPhotos() {
  const code = padCode(currentPref);
  const photos = store[code] || [];
  const grid = $('photo-grid'), empty = $('empty-photos');
  grid.innerHTML = '';
  if (!photos.length) { empty.classList.add('show'); grid.style.display='none'; return; }
  empty.classList.remove('show'); grid.style.display='';

  photos.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'photo-card';
    if (item.type === 'video') {
      const vid = document.createElement('video');
      vid.src = item.url;
      vid.controls = false;
      vid.muted = true;
      vid.loop = true;
      vid.setAttribute('playsinline','');
      vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
      vid.addEventListener('mouseenter', () => vid.play());
      vid.addEventListener('mouseleave', () => { vid.pause(); vid.currentTime=0; });
      vid.addEventListener('click', () => openLightbox(i));
      const badge = document.createElement('span');
      badge.className = 'video-badge';
      badge.textContent = '▶';
      card.appendChild(vid);
      card.appendChild(badge);
    } else {
      const img = document.createElement('img');
      img.src = item.url; img.alt=''; img.loading='lazy';
      img.addEventListener('click', () => openLightbox(i));
      card.appendChild(img);
    }
    const del = document.createElement('button');
    del.className = 'del-btn'; del.textContent = '✕';
    del.addEventListener('click', e => { e.stopPropagation(); deletePhoto(i); });
    card.appendChild(del);
    grid.appendChild(card);
  });
}

function deletePhoto(i) {
  const code = padCode(currentPref);
  store[code].splice(i,1);
  saveStore();
  renderPhotos();
  if (prefEls[currentPref])
    prefEls[currentPref].classList.toggle('has-photos',(store[code]||[]).length>0);
  buildNav($('search-input').value);
}

// ── ライトボックス ────────────────────────────────────────────────
function openLightbox(i) {
  lbPhotos = store[padCode(currentPref)] || [];
  lbIndex = i;
  showLb();
  $('lightbox').classList.add('open');
}
function showLb() {
  const item = lbPhotos[lbIndex];
  const lbContent = $('lb-content');
  lbContent.innerHTML = '';
  if (item.type === 'video') {
    const vid = document.createElement('video');
    vid.src = item.url;
    vid.controls = true;
    vid.autoplay = true;
    vid.style.cssText = 'max-width:82vw;max-height:82vh;border-radius:8px;display:block;';
    lbContent.appendChild(vid);
  } else {
    const img = document.createElement('img');
    img.src = item.url;
    img.style.cssText = 'max-width:82vw;max-height:82vh;border-radius:8px;display:block;object-fit:contain;';
    lbContent.appendChild(img);
  }
  $('lb-caption').textContent = (lbIndex+1) + ' / ' + lbPhotos.length;
}
function bindLightbox() {
  $('lb-close').addEventListener('click', () => $('lightbox').classList.remove('open'));
  $('lb-backdrop').addEventListener('click', () => $('lightbox').classList.remove('open'));
  $('lb-prev').addEventListener('click', () => { lbIndex=(lbIndex-1+lbPhotos.length)%lbPhotos.length; showLb(); });
  $('lb-next').addEventListener('click', () => { lbIndex=(lbIndex+1)%lbPhotos.length; showLb(); });
  document.addEventListener('keydown', e => {
    if (!$('lightbox').classList.contains('open')) return;
    if (e.key==='Escape') $('lightbox').classList.remove('open');
    if (e.key==='ArrowLeft') { lbIndex=(lbIndex-1+lbPhotos.length)%lbPhotos.length; showLb(); }
    if (e.key==='ArrowRight') { lbIndex=(lbIndex+1)%lbPhotos.length; showLb(); }
  });
}

// ── イベントバインド ──────────────────────────────────────────────
function bindEvents() {
  $('back-btn').addEventListener('click', showMapView);
  $('add-photo-btn').addEventListener('click', () => {
    $('add-menu').classList.toggle('open');
  });
  $('menu-local').addEventListener('click', () => { $('add-menu').classList.remove('open'); openLocalPicker(); });
  $('menu-gp').addEventListener('click', () => { $('add-menu').classList.remove('open'); openGpModal(); });
  $('empty-add-btn').addEventListener('click', () => {
    if (accessToken) openGpModal(); else openLocalPicker();
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#add-photo-btn') && !e.target.closest('#add-menu'))
      $('add-menu').classList.remove('open');
  });
  $('btn-login').addEventListener('click', loginGoogle);
  $('btn-logout').addEventListener('click', logoutGoogle);
  $('btn-gp-pick').addEventListener('click', openGpModal);
  $('gp-close').addEventListener('click', closeGpModal);
  $('gp-modal-backdrop').addEventListener('click', closeGpModal);
  $('gp-add-btn').addEventListener('click', addSelectedGpPhotos);
  $('gp-load-more').addEventListener('click', loadMoreGp);
  $('search-input').addEventListener('input', () => buildNav($('search-input').value));
}

// ── 初期化 ────────────────────────────────────────────────────────
function init() {
  store = loadStore();
  setupMap();
  buildNav('');
  bindZoom();
  bindDrag();
  bindLightbox();
  bindEvents();
  // Google Identity Services読み込み後に初期化
  if (window.google) initGoogleAuth();
  else window.addEventListener('google-loaded', initGoogleAuth);
}

window.addEventListener('load', () => {
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = () => { window.dispatchEvent(new Event('google-loaded')); initGoogleAuth(); };
  document.head.appendChild(s);
});

init();
