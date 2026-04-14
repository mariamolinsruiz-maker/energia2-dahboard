// ═══════════════════════════════════════════════════════
//  ComunitatES · app.js
//  Generació Distribuïda · Gestió de Comunitats
// ═══════════════════════════════════════════════════════

// ─── STATE ───────────────────────────────────────────
let COMMUNITIES = [];
let CLIENTS     = [];
let currentView      = 'dashboard';
let currentCommunity = null;
let mapDashboard     = null;
const detailMaps     = {};
let charts           = {};
let editingCommId      = null;
let editingClientCodi  = null;
let editingClientCommId= null;
let selectedColor      = '#1B4D31';
let confirmCallback    = null;
let rowCounter         = 0;

// ─── AUTH ─────────────────────────────────────────────
const TOKEN_KEY = 'ce_token';
const USER_KEY  = 'ce_user';
function getToken() { return localStorage.getItem(TOKEN_KEY); }
function getUser()  { return JSON.parse(localStorage.getItem(USER_KEY) || '{}'); }
function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ─── API SERVICE ──────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  if (res.status === 401) { doLogout(); return; }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error desconegut' }));
    throw new Error(err.detail || 'Error ' + res.status);
  }
  return res.json();
}

// ─── LOGIN ────────────────────────────────────────────
async function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  const errEl = document.getElementById('l-err');
  const spin  = document.getElementById('l-spin');
  const txt   = document.getElementById('l-txt');
  errEl.style.display = 'none';
  ['l-user','l-pass'].forEach(id => document.getElementById(id).classList.remove('err'));
  if (!user || !pass) { errEl.textContent='Omple tots els camps.'; errEl.style.display='block'; return; }
  spin.style.display='block'; txt.style.display='none';
  try {
    const res = await fetch('/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:user, password:pass })
    });
    if (!res.ok) { const e=await res.json(); throw new Error(e.detail||'Error'); }
    const json = await res.json();
    setSession(json.token, { username:json.username, role:json.role, nom:json.nom });
    launchApp();
  } catch(e) {
    errEl.textContent = e.message || 'Error de connexió';
    errEl.style.display = 'block';
    ['l-user','l-pass'].forEach(id => document.getElementById(id).classList.add('err'));
    document.getElementById('l-pass').value = '';
  } finally {
    spin.style.display='none'; txt.style.display='block';
  }
}

function doLogout() {
  clearSession();
  COMMUNITIES.length=0; CLIENTS.length=0;
  Object.values(detailMaps).forEach(m => { try{m.remove();}catch(e){} });
  for (const k in detailMaps) delete detailMaps[k];
  mapDashboard=null;
  document.getElementById('app').classList.remove('on');
  const ls = document.getElementById('login-screen');
  ls.classList.remove('out'); ls.style.display='flex';
  document.getElementById('l-user').value='';
  document.getElementById('l-pass').value='';
  document.getElementById('l-err').style.display='none';
}

function launchApp() {
  const ls = document.getElementById('login-screen');
  ls.classList.add('out');
  setTimeout(() => {
    ls.style.display='none';
    document.getElementById('app').classList.add('on');
    const u = getUser();
    const el = document.getElementById('topbar-user-name');
    if (el) el.textContent = u.nom || u.username || '';
    loadDataAndInit();
  }, 400);
}

async function loadDataAndInit() {
  showLoading(true);
  try {
    const data = await api('GET', '/api/data');
    COMMUNITIES.length=0; CLIENTS.length=0;
    COMMUNITIES.push(...data.communities);
    CLIENTS.push(...data.clients);
    navigate('dashboard');
    renderClientsTable();
  } catch(e) {
    showToast('Error carregant dades: '+e.message, 'err');
  } finally {
    showLoading(false);
  }
}

function showLoading(on) {
  let el = document.getElementById('loading-overlay');
  if (on && !el) {
    el = document.createElement('div');
    el.id='loading-overlay'; el.className='loading-overlay';
    el.innerHTML='<div class="loading-box"><div class="loading-spin"></div>Carregant…</div>';
    document.body.appendChild(el);
  } else if (!on && el) el.remove();
}

function showToast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent=msg; t.className='toast '+type;
  void t.offsetWidth; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 3000);
}

function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  confirmCallback=cb;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCallback=null;
}

// ─── RELOAD HELPERS ───────────────────────────────────
async function reloadData() {
  const data = await api('GET','/api/data');
  COMMUNITIES.length=0; CLIENTS.length=0;
  COMMUNITIES.push(...data.communities);
  CLIENTS.push(...data.clients);
}
async function reloadAndRender() {
  await reloadData();
  reloadCurrentView();
  updateClientFilterSelect();
}
function reloadCurrentView() {
  if (currentView==='dashboard')       { mapDashboard=null; initDashboard(); }
  else if (currentView==='comunitats') renderCommunityCards();
  else if (currentView==='clients')    renderClientsTable();
  else if (currentView==='comunitat-detail') {
    if (COMMUNITIES.find(c=>c.id===currentCommunity)) renderCommunityDetail(currentCommunity);
    else navigate('comunitats');
  }
}
function updateClientFilterSelect() {
  const sel = document.getElementById('filter-comm-clients');
  if (!sel) return;
  sel.innerHTML = '<option value="">Totes les comunitats</option>' +
    COMMUNITIES.map(c => `<option value="${c.id}">${c.nom} (${c.id})</option>`).join('');
}

// ─── API CRUD HELPERS ──────────────────────────────────
async function apiSaveComm(method,id,obj) { return api(method, id?`/api/communities/${id}`:'/api/communities', obj); }
async function apiDelComm(id)  { return api('DELETE',`/api/communities/${id}`); }
async function apiSaveClient(method,codi,obj) { return api(method, codi?`/api/clients/${codi}`:'/api/clients', obj); }
async function apiDelClient(codi) { return api('DELETE',`/api/clients/${codi}`); }

function nextClientCodi_seq(commId, n) {
  return commId.replace('C','') + String(n).padStart(3,'0');
}

// ═══════════════════════════════════════════
function navigate(view, params) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const viewEl = document.getElementById('view-' + view);
  if (viewEl) { viewEl.classList.add('active'); viewEl.classList.remove('anim'); void viewEl.offsetWidth; viewEl.classList.add('anim'); }

  const navEl = document.querySelector(`.nav-item[data-view="${view.split('-')[0]}"]`);
  if (navEl) navEl.classList.add('active');

  currentView = view;
  updateBreadcrumb(view, params);

  if (view === 'dashboard') initDashboard();
  else if (view === 'comunitats') renderCommunityCards();
  else if (view === 'comunitat-detail' && params) renderCommunityDetail(params.id);
  else if (view === 'clients') { renderClientsTable(); }
  else if (view === 'acords') {}
  else if (view === 'errors') {}
}

function updateBreadcrumb(view, params) {
  const bc = document.getElementById('breadcrumb');
  const labels = {
    dashboard: 'Dashboard', comunitats: 'Comunitats',
    clients: 'Clients', acords: 'Acords pendents', errors: 'Errors de generació'
  };
  if (view === 'comunitat-detail' && params) {
    const comm = COMMUNITIES.find(c => c.id === params.id);
    bc.innerHTML = `<span class="crumb" onclick="navigate('comunitats')">Comunitats</span><span class="topbar-sep">›</span><span class="crumb active">${comm ? comm.nom : params.id}</span>`;
  } else {
    bc.innerHTML = `<span class="crumb active">${labels[view] || view}</span>`;
  }
}

// ═══════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════
function initDashboard() {
  renderDashboardCommunityCards();
  setTimeout(() => {
    initMapDashboard();
    initGlobalCharts();
  }, 100);
}

function renderDashboardCommunityCards() {
  const container = document.getElementById('dashboard-comm-cards');
  container.innerHTML = COMMUNITIES.map(c => commCardHTML(c)).join('');
}

function commCardHTML(c) {
  const onbBadge = c.onboarding === 'Obert' ? '<span class="badge badge-green">Obert</span>' : '<span class="badge badge-grey">Tancat</span>';
  const acordBadge = c.acord_reparto === 'Pendent' ? '<span class="badge badge-gold">Pendent</span>' : '<span class="badge badge-green">Firmat</span>';
  return `<div class="comm-card">
    <div class="comm-card-head" onclick="navigate('comunitat-detail',{id:'${c.id}'})" style="cursor:pointer;">
      <div>
        <div class="comm-card-id">${c.id}</div>
        <div class="comm-card-name">${c.nom}</div>
        <div class="comm-card-loc">📍 ${c.adreca}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;">
        ${onbBadge}${acordBadge}
      </div>
    </div>
    <div class="comm-card-body" onclick="navigate('comunitat-detail',{id:'${c.id}'})" style="cursor:pointer;">
      <div class="comm-stat"><div class="comm-stat-v">${c.total_clients}</div><div class="comm-stat-l">Clients</div></div>
      <div class="comm-stat"><div class="comm-stat-v">${c.total_kw} kW</div><div class="comm-stat-l">Potència</div></div>
      <div class="comm-stat"><div class="comm-stat-v">${(c.total_estalvi/1000).toFixed(0)}k€</div><div class="comm-stat-l">Estalvi</div></div>
    </div>
    <div class="comm-card-foot" style="gap:0.5rem;">
      <span style="color:var(--text-light);font-size:0.75rem;">Promotor: <strong>${c.promotor}</strong></span>
      <div style="display:flex;gap:5px;margin-left:auto;">
        <button class="btn btn-ghost btn-sm" style="font-size:0.72rem;padding:4px 8px;" onclick="openCommModal('${c.id}');event.stopPropagation();">✏️ Editar</button>
        <button class="btn btn-sm" style="font-size:0.72rem;padding:4px 8px;background:var(--red-bg);color:var(--red);border:1px solid #FEB2B2;" onclick="deleteComm('${c.id}',event)">🗑 Eliminar</button>
      </div>
    </div>
  </div>`;
}

function initMapDashboard() {
  if (mapDashboard) return;
  mapDashboard = L.map('map-dashboard').setView([41.62, 1.95], 9);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'© OpenStreetMap'}).addTo(mapDashboard);
  COMMUNITIES.forEach(c => {
    const icon = L.divIcon({
      html:`<div style="background:${c.color};width:36px;height:36px;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;font-weight:700">${c.total_kw}</div>`,
      className:'', iconSize:[36,36], iconAnchor:[18,18], popupAnchor:[0,-20]
    });
    L.marker([c.lat,c.lng],{icon}).addTo(mapDashboard)
     .bindPopup(`<div style="font-family:Outfit,sans-serif;min-width:160px"><strong>${c.nom}</strong><br><span style="color:#666;font-size:0.78rem">${c.adreca}</span><br><br>⚡ ${c.total_kw} kW · 👥 ${c.total_clients} clients<br>💶 ${c.total_estalvi.toLocaleString('ca-ES')} €/any<br><br><a href="#" onclick="event.preventDefault();navigate('comunitat-detail',{id:'${c.id}'})" style="color:#2D8452;font-weight:600">Veure detall →</a></div>`);
    L.circle([c.lat,c.lng],{radius:2500,color:c.color,fillColor:c.color,fillOpacity:0.08,weight:1}).addTo(mapDashboard);
  });
}

function initGlobalCharts() {
  if (charts.donutGlobal) {charts.donutGlobal.destroy();}
  if (charts.barGlobal) {charts.barGlobal.destroy();}
  const palette = ['#1B4D31','#2B5BA8','#8B5E00'];
  charts.donutGlobal = new Chart(document.getElementById('chart-donut-global'), {
    type:'doughnut',
    data:{labels:COMMUNITIES.map(c=>c.nom),datasets:[{data:COMMUNITIES.map(c=>c.total_kw),backgroundColor:palette,borderWidth:3,borderColor:'#fff',hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{size:11},boxWidth:12,padding:8}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} kW`}}},cutout:'60%'}
  });
  charts.barGlobal = new Chart(document.getElementById('chart-bar-global'), {
    type:'bar',
    data:{labels:COMMUNITIES.map(c=>c.nom),datasets:[{label:'Estalvi brut (€)',data:COMMUNITIES.map(c=>c.total_estalvi),backgroundColor:palette,borderRadius:6,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:11}}},y:{grid:{color:'#E3E8E3'},ticks:{callback:v=>v.toLocaleString('ca-ES')+'€',font:{size:10}}}}}
  });
}

// ═══════════════════════════════════════════
//  COMUNITATS LLISTA
// ═══════════════════════════════════════════
function renderCommunityCards() {
  const c1 = document.getElementById('comunitats-cards');
  c1.innerHTML = COMMUNITIES.map(c => commCardHTML(c)).join('');
}

// ═══════════════════════════════════════════
//  DETALL COMUNITAT
// ═══════════════════════════════════════════
function renderCommunityDetail(id) {
  currentCommunity = id;
  const comm = COMMUNITIES.find(c => c.id === id);
  if (!comm) return;
  const clients = CLIENTS.filter(c => c.comunitat === id);

  // Destroy any existing Leaflet map for this community
  if (detailMaps[id]) {
    try { detailMaps[id].remove(); } catch(e) {}
    delete detailMaps[id];
  }
  // Destroy old charts for this community
  [`chart-kw-${id}`,`estalvi-${id}`,`efic-${id}`].forEach(k => {
    if (charts[k]) { try { charts[k].destroy(); } catch(e) {} delete charts[k]; }
  });

  const acordBadge = comm.acord_reparto === 'Pendent'
    ? '<span class="chip-pend">Pendent</span>'
    : '<span class="chip-ok">Firmat</span>';
  const onbBadge = comm.onboarding === 'Obert'
    ? '<span class="chip-ok">Obert</span>'
    : '<span class="chip-grey">Tancat</span>';

  document.getElementById('detail-content').innerHTML = `
    <!-- COMMUNITY INFO HEADER -->
    <div class="comm-info-block">
      <div class="comm-info-top">
        <div>
          <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--g300);margin-bottom:4px;">
            ${id} · Codi client: ${id.replace('C','')}
          </div>
          <h2>${comm.nom}</h2>
          <div class="sub">📍 ${comm.adreca}</div>
        </div>
        <span class="badge badge-green" style="font-size:0.8rem;padding:6px 14px;">✓ OK</span>
      </div>
      <div class="comm-info-grid">
        <div class="info-cell"><div class="info-lbl">Promotor</div><div class="info-val">${comm.promotor}</div></div>
        <div class="info-cell"><div class="info-lbl">Contacte</div><div class="info-val">${comm.contacte}</div></div>
        <div class="info-cell"><div class="info-lbl">Email contacte</div><div class="info-val" style="font-size:0.78rem">${comm.email}</div></div>
        <div class="info-cell"><div class="info-lbl">Telèfon</div><div class="info-val">${comm.telefon}</div></div>
        <div class="info-cell"><div class="info-lbl">Clients actius</div><div class="info-val">${comm.clients_actius}</div></div>
        <div class="info-cell"><div class="info-lbl">Inscrits</div><div class="info-val">${comm.inscrits}</div></div>
        <div class="info-cell"><div class="info-lbl">Connexió</div><div class="info-val">—</div></div>
        <div class="info-cell"><div class="info-lbl">Acord repartiment</div><div class="info-val">${acordBadge}</div></div>
        <div class="info-cell"><div class="info-lbl">Potència</div><div class="info-val">${comm.potencia}</div></div>
        <div class="info-cell"><div class="info-lbl">Marca blanca</div><div class="info-val">${comm.marca_blanca}</div></div>
        <div class="info-cell"><div class="info-lbl">Fi inscripcions</div><div class="info-val">${comm.fi_inscripcions}</div></div>
        <div class="info-cell"><div class="info-lbl">Informe automàtic</div><div class="info-val">${comm.informe_auto}</div></div>
        <div class="info-cell"><div class="info-lbl">Onboarding</div><div class="info-val">${onbBadge}</div></div>
        <div class="info-cell"><div class="info-lbl">Adreça (CP)</div><div class="info-val">${comm.adreca.split('–')[0].trim()}</div></div>
      </div>
    </div>

    <!-- MINI KPI GRID -->
    <div class="mini-kpi-grid">
      <div class="mini-kpi ok"><div class="mini-kpi-icon">👥</div><div class="mini-kpi-val">${comm.clients_actius}</div><div class="mini-kpi-lbl">Clients actius</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">⚡</div><div class="mini-kpi-val">${comm.cups_auth_actius}</div><div class="mini-kpi-lbl">CUPS autoritz. Actius</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">⚡</div><div class="mini-kpi-val">${comm.cups_auth_proposats}</div><div class="mini-kpi-lbl">CUPS autoritz. Proposats</div></div>
      <div class="mini-kpi ${comm.sense_auth>0?'warn':'ok'}"><div class="mini-kpi-icon">🔴</div><div class="mini-kpi-val">${comm.sense_auth}</div><div class="mini-kpi-lbl">Sense autoritz. CUPS</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">📡</div><div class="mini-kpi-val">${comm.datadis_actius}</div><div class="mini-kpi-lbl">Datadis actius</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">⚡</div><div class="mini-kpi-val">${comm.autoconsumos}</div><div class="mini-kpi-lbl">Autoconsumos actius</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">📱</div><div class="mini-kpi-val">${comm.clients_app}</div><div class="mini-kpi-lbl">Clients amb App</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">📊</div><div class="mini-kpi-val">${comm.sense_dades}</div><div class="mini-kpi-lbl">Sense dades recents</div></div>
      <div class="mini-kpi"><div class="mini-kpi-icon">📋</div><div class="mini-kpi-val">${comm.sol_licituds}</div><div class="mini-kpi-lbl">Sol·licituds</div></div>
    </div>

    <!-- MAP + CHARTS -->
    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">🗺️ Localització</span></div>
        <div class="card-body" style="padding:0.75rem;">
          <div class="map-box map-box-sm" id="map-detail-${id}"></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">⚡ Distribució kW per client</span></div>
        <div class="card-body">
          <div style="position:relative;height:240px;"><canvas id="chart-kw-${id}"></canvas></div>
        </div>
      </div>
    </div>

    <!-- TABS -->
    <div class="tabs">
      <button class="tab-btn active" onclick="switchDetailTab(this,'tab-clients-${id}')">👥 Clients de la comunitat</button>
      <button class="tab-btn" onclick="switchDetailTab(this,'tab-estalvi-${id}')">💰 Estalvi i autoconsum</button>
      <button class="tab-btn" onclick="switchDetailTab(this,'tab-rendiment-${id}')">📈 Rendiment clients</button>
    </div>

    <!-- TAB: CLIENTS -->
    <div id="tab-clients-${id}" class="tab-panel active">
      <div class="card" style="margin-bottom:0">
        <div class="card-header">
          <span class="card-title">👥 Clients de la comunitat</span>
          <div style="display:flex;gap:6px">
            <input type="text" placeholder="Cerca client, CUPS o NIF..." id="search-detail-${id}" oninput="filterDetailTable('${id}')" style="border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-family:Outfit,sans-serif;font-size:0.8rem;min-width:200px;outline:none;">
            <select class="sel" style="font-size:0.78rem;" onchange="filterDetailTable('${id}')">
              <option>Tots</option><option>Actiu</option><option>Proposat</option><option>Reserva</option>
            </select>
            <button class="btn btn-export btn-sm">⬇ CSV</button>
            <button class="btn btn-primary btn-sm" onclick="openClientModal('${id}')">+ Afegir participant</button>
          </div>
        </div>
        <div class="table-wrap">
          <table id="detail-clients-table-${id}">
            <thead>
              <tr>
                <th>Codi</th><th>Nom</th><th>CUPS</th><th>NIF</th>
                <th>Telèfon</th><th>Email</th><th>Inici Fact.</th>
                <th>App</th><th>Estat</th><th>Modalitat</th><th>Perfil</th>
                <th>Comercialitz.</th><th>Import</th><th>kWN</th>
                <th>Preu llum</th><th>Estalvi brut</th><th>% Estalvi</th>
                <th>Accions</th>
              </tr>
            </thead>
            <tbody>${clients.map(c => clientRowHTML(c)).join('')}</tbody>
          </table>
        </div>
        <div style="padding:0.6rem 1.2rem;font-size:0.75rem;color:var(--text-light);border-top:1px solid var(--border);">
          ${clients.length} de ${clients.length} clients · Pàgina 1 de 1
        </div>
      </div>
    </div>

    <!-- TAB: ESTALVI -->
    <div id="tab-estalvi-${id}" class="tab-panel">

      <div class="grid-2">

        <!-- AHORRO DELS USUARIS -->
        <div class="card" style="margin-bottom:0">
          <div class="card-header">
            <span class="card-title">🌱 Estalvi dels usuaris</span>
            <span style="font-size:0.75rem;font-weight:600;color:var(--text-light)">${comm.nom.toUpperCase()}</span>
          </div>
          <div class="card-body">
            <!-- Date filters -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:0.9rem;">
              <div>
                <div style="font-size:0.68rem;color:var(--text-light);margin-bottom:2px;">Mes inici</div>
                <input type="month" class="date-input" id="estalvi-start-${id}">
              </div>
              <div>
                <div style="font-size:0.68rem;color:var(--text-light);margin-bottom:2px;">Mes fi</div>
                <input type="month" class="date-input" id="estalvi-end-${id}">
              </div>
              <button class="btn btn-ghost btn-sm" style="margin-top:14px;" onclick="clearDates('estalvi-'+id)">Netejar</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1rem;">
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)" onclick="setDateRange('estalvi-start-${id}','estalvi-end-${id}',1)">Últim mes</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)" onclick="setDateRange('estalvi-start-${id}','estalvi-end-${id}',3)">Últims 3 mesos</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)" onclick="setDateRange('estalvi-start-${id}','estalvi-end-${id}',12)">Últims 12 mesos</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)" onclick="setDateRange('estalvi-start-${id}','estalvi-end-${id}',0)">Any actual</button>
            </div>
            <!-- Summary stats -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;margin-bottom:1rem;">
              <div style="border:1px solid var(--g200);border-radius:var(--radius-sm);padding:0.75rem;background:var(--g50);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Estalvi total</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--g700)">0,00 €</div>
              </div>
              <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.75rem;">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Autoconsum</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;">0,00 €</div>
                <div style="font-size:0.7rem;color:var(--text-light)">0,0%</div>
              </div>
              <div style="border:1px solid var(--blue-bg);border-radius:var(--radius-sm);padding:0.75rem;background:var(--blue-bg);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Excedent</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--blue)">0,00 €</div>
                <div style="font-size:0.7rem;color:var(--text-light)">0,0%</div>
              </div>
            </div>
            <!-- Chart -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div>
                <div style="font-weight:600;font-size:0.85rem;">Estalvi mensual</div>
                <div style="font-size:0.75rem;color:var(--text-light)">Autoconsum i excedent</div>
              </div>
              <button class="btn btn-export btn-sm">⬇ CSV</button>
            </div>
            <div style="position:relative;height:180px;"><canvas id="chart-estalvi-${id}"></canvas></div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:0.75rem;color:var(--text-light);">
              <span><span style="display:inline-block;width:10px;height:10px;background:var(--g400);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Autoconsum</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:var(--blue);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Excedent</span>
            </div>
          </div>
        </div>

        <!-- EFICIÈNCIA ENERGÈTICA -->
        <div class="card" style="margin-bottom:0">
          <div class="card-header">
            <span class="card-title">⚡ Eficiència Energètica</span>
            <span style="font-size:0.75rem;font-weight:600;color:var(--text-light)">${comm.nom.toUpperCase()}</span>
          </div>
          <div class="card-body">
            <!-- Date filters -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:0.9rem;">
              <div>
                <div style="font-size:0.68rem;color:var(--text-light);margin-bottom:2px;">Mes inici</div>
                <input type="month" class="date-input" id="efic-start-${id}">
              </div>
              <div>
                <div style="font-size:0.68rem;color:var(--text-light);margin-bottom:2px;">Mes fi</div>
                <input type="month" class="date-input" id="efic-end-${id}">
              </div>
              <button class="btn btn-ghost btn-sm" style="margin-top:14px;">Netejar</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:1rem;">
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)">Últim mes</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)">Últims 3 mesos</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)">Últims 12 mesos</button>
              <button class="btn btn-ghost btn-sm" style="border-color:var(--g300);color:var(--g700)">Any actual</button>
            </div>
            <!-- Summary stats -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.6rem;margin-bottom:1rem;">
              <div style="border:1px solid var(--g200);border-radius:var(--radius-sm);padding:0.75rem;background:var(--g50);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">% Autoconsum</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--g700)">0,0%</div>
              </div>
              <div style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:0.75rem;">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Autoconsum</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;">0,00 kWh</div>
                <div style="font-size:0.7rem;color:var(--text-light)">0,0%</div>
              </div>
              <div style="border:1px solid var(--blue-bg);border-radius:var(--radius-sm);padding:0.75rem;background:var(--blue-bg);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:3px;">Excedent</div>
                <div style="font-family:'DM Mono',monospace;font-size:1rem;font-weight:500;color:var(--blue)">0,00 kWh</div>
                <div style="font-size:0.7rem;color:var(--text-light)">0,0%</div>
              </div>
            </div>
            <!-- Chart -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
              <div>
                <div style="font-weight:600;font-size:0.85rem;">Autoconsum i excedent</div>
                <div style="font-size:0.75rem;color:var(--text-light)">Energia mensual (kWh)</div>
              </div>
              <button class="btn btn-export btn-sm">⬇ CSV</button>
            </div>
            <div style="position:relative;height:180px;"><canvas id="chart-efic-${id}"></canvas></div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:0.75rem;color:var(--text-light);">
              <span><span style="display:inline-block;width:10px;height:10px;background:var(--g400);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Autoconsum</span>
              <span><span style="display:inline-block;width:10px;height:10px;background:var(--blue);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Excedent</span>
            </div>
          </div>
        </div>

      </div><!-- /grid-2 -->

      <!-- ESTALVI PER CLIENT -->
      <div class="card" style="margin-top:1.2rem">
        <div class="card-header">
          <span class="card-title">💰 Estalvi i autoconsum per client</span>
          <button class="btn btn-export btn-sm">⬇ CSV</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codi Client</th><th>CUPS</th><th>Nom</th>
                <th>kWN</th><th>Modalitat</th><th>Periode</th>
                <th>Import</th><th>Estalvi Autoconsum</th><th>Estalvi Excedent</th>
              </tr>
            </thead>
            <tbody>
              ${clients.map(c => `<tr>
                <td class="mono"><strong>${c.codi}</strong></td>
                <td class="td-cups">${c.cups}</td>
                <td class="td-name">${c.nom}</td>
                <td class="mono">${c.kw.toLocaleString('ca-ES')}</td>
                <td>${c.modalitat}</td>
                <td class="mono">${c.periode}</td>
                <td class="mono" style="color:${c.import_eur>0?'var(--g600)':'var(--text-light)'}">${c.import_eur>0?c.import_eur.toLocaleString('ca-ES')+' €':'0,00 €'}</td>
                <td class="mono" style="color:var(--text-light)">0,00 €</td>
                <td class="mono" style="color:var(--text-light)">0,00 €</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB: RENDIMENT -->
    <div id="tab-rendiment-${id}" class="tab-panel">
      <div class="rendiment-header">
        <div class="rend-card"><div class="rend-val" style="color:var(--g600)">0,00 €</div><div class="rend-lbl">Estalvi total</div></div>
        <div class="rend-card"><div class="rend-val">0,00 €</div><div class="rend-lbl">Facturació total</div></div>
        <div class="rend-card"><div class="rend-val">0,0%</div><div class="rend-lbl">% Autoconsum</div></div>
        <div class="rend-card"><div class="rend-val" style="color:var(--text-light)">—</div><div class="rend-lbl">Cobertura estalvi/base</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:1rem;flex-wrap:wrap;">
        <input type="text" placeholder="Cerca client, CUPS o NIF..." style="border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-family:Outfit,sans-serif;font-size:0.8rem;outline:none;min-width:200px;">
        <select class="sel" style="font-size:0.78rem;"><option>Tots els estats</option><option>Actiu</option><option>Proposat</option></select>
        <div style="margin-left:auto;display:flex;gap:4px;">
          <button class="btn btn-ghost btn-sm" style="background:var(--g50);border-color:var(--g200);color:var(--g700)">HIST.</button>
          <button class="btn btn-ghost btn-sm">1M</button><button class="btn btn-ghost btn-sm">3M</button>
          <button class="btn btn-ghost btn-sm">6M</button><button class="btn btn-ghost btn-sm">12M</button>
          <button class="btn btn-ghost btn-sm">RANG</button>
          <button class="btn btn-export btn-sm">⬇ CSV</button>
        </div>
      </div>
      <div class="table-wrap" style="border:1px solid var(--border);border-radius:var(--radius-sm);">
        <table>
          <thead>
            <tr>
              <th>Codi Client</th><th>CUPS</th><th>Nom</th>
              <th>Estat</th><th>kWN</th>
              <th>Gen. (kWh)</th><th>Auto. (kWh)</th><th>Excedent (kWh)</th>
              <th>% Autoconsum</th><th>Estalvi Total</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `<tr>
              <td class="mono"><strong>${c.codi}</strong></td>
              <td class="td-cups">${c.cups}</td>
              <td class="td-name">${c.nom}</td>
              <td>${estatBadge(c.estat)}</td>
              <td class="mono">${c.kw.toLocaleString('ca-ES')}</td>
              <td class="mono" style="color:var(--text-light)">—</td>
              <td class="mono" style="color:var(--text-light)">—</td>
              <td class="mono" style="color:var(--text-light)">—</td>
              <td class="mono" style="color:var(--text-light)">0,0%</td>
              <td class="mono" style="color:var(--text-light)">0,00 €</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- TECHNICAL TABLE -->
    <div class="section-lbl">Dades tècniques dels CUPS</div>
    <div class="card">
      <div class="card-header"><span class="card-title">🔌 Estat tècnic per client</span></div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Codi</th><th>Nom</th><th>Periode</th><th>Distribuidora</th>
              <th>kWN</th><th>Alta</th><th>CUPS Auth</th>
              <th>Autoconsum</th><th>Datadis</th><th>Dades recents</th><th>Sense auto</th>
            </tr>
          </thead>
          <tbody>
            ${clients.map(c => `<tr>
              <td class="mono"><strong>${c.codi}</strong></td>
              <td class="td-name">${c.nom}</td>
              <td class="mono">${c.periode}</td>
              <td class="mono">${c.distribuidora}</td>
              <td class="mono">${c.kw.toLocaleString('ca-ES')}</td>
              <td class="mono">—</td>
              <td>${c.cups_auth==='OK'?`<span class="chip-ok">OK</span>`:`<span class="chip-warn">Falten${c.cups_auth_note?' ('+c.cups_auth_note+')':''}</span>`}</td>
              <td>${c.autoconsum==='Actiu'?`<span class="chip-ok">Actiu</span>`:`<span class="chip-grey">—</span>`}</td>
              <td>${c.datadis==='Actiu'?`<span class="chip-ok">Actiu</span>`:`<span class="chip-grey">—</span>`}</td>
              <td>${c.dades_recents==='OK'?`<span class="chip-ok">OK</span>`:`<span class="chip-pend">Sense dades</span>`}</td>
              <td><span class="chip-ok">${c.sense_auto}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Init map + charts — wait for DOM to be fully painted
  setTimeout(() => {
    initDetailMap(comm);
    initDetailChart(comm, clients);
    initSavingsCharts(id);
  }, 250);
}

function clientRowHTML(c) {
  const pct = c.pct_estalvi;
  return `<tr>
    <td class="mono"><strong>${c.codi}</strong></td>
    <td class="td-name">${c.nom}</td>
    <td class="td-cups">${c.cups}</td>
    <td class="mono">${c.nif}</td>
    <td class="mono">${c.tel}</td>
    <td style="font-size:0.78rem">${c.email}</td>
    <td class="mono">${c.inici_fact}</td>
    <td>${c.app==='Sí'?'<span class="chip-ok">Sí</span>':'<span class="chip-grey">No</span>'}</td>
    <td>${estatBadge(c.estat)}</td>
    <td style="font-size:0.78rem;white-space:normal;max-width:140px">${c.modalitat}</td>
    <td class="mono">${c.perfil}</td>
    <td class="mono">${c.comercialitz}</td>
    <td class="mono" style="color:${c.import_eur>0?'var(--g600)':'var(--text-light)'}">${c.import_eur>0?c.import_eur.toLocaleString('ca-ES')+' €':'0,00 €'}</td>
    <td class="mono">${c.kw}</td>
    <td class="mono">${c.preu_llum?c.preu_llum.toFixed(4)+' €':'—'}</td>
    <td class="mono" style="color:var(--g600)">${c.estalvi_brut>0?(c.estalvi_brut.toLocaleString('ca-ES',{minimumFractionDigits:2})+' €'):'—'}</td>
    <td>${pct?`<div class="progress-wrap"><div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div><span class="pct-label">${pct.toFixed(1)}%</span></div>`:'—'}</td>
    <td>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-sm" style="font-size:0.7rem;padding:3px 7px;" onclick="openClientModal('${c.comunitat}','${c.codi}')">✏️</button>
        <button class="btn btn-sm" style="font-size:0.7rem;padding:3px 7px;background:var(--red-bg);color:var(--red);border:1px solid #FEB2B2;" onclick="deleteClient('${c.codi}',event)">🗑</button>
      </div>
    </td>
  </tr>`;
}

function estatBadge(estat) {
  if (estat==='Actiu') return '<span class="badge badge-green">Actiu</span>';
  if (estat==='Proposat') return '<span class="badge badge-gold">Proposat</span>';
  if (estat==='Reserva') return '<span class="badge badge-blue">Reserva</span>';
  return `<span class="badge badge-grey">${estat}</span>`;
}

// Deterministic pseudo-random offsets per community so participants
// always appear within ~1.8km of the installation.
const PARTICIPANT_OFFSETS = {
  'C059': [[0.008,0.011],[-0.006,0.015],[0.013,-0.007],[-0.010,-0.012],[0.005,-0.016],[0.016,0.004]],
  'C042': [[0.007,0.009],[-0.008,0.013],[0.012,-0.005],[-0.004,-0.014]],
  'C031': [[0.006,0.010],[-0.009,0.007],[0.011,-0.008],[-0.005,0.013],[0.014,0.003]]
};

function initDetailMap(comm) {
  const mapId = `map-detail-${comm.id}`;
  const mapEl = document.getElementById(mapId);
  if (!mapEl) return;
  // Destroy previous Leaflet instance for this community if it exists
  if (detailMaps[comm.id]) {
    try { detailMaps[comm.id].remove(); } catch(e) {}
    delete detailMaps[comm.id];
  }

  // Radius in metres for the community coverage zone
  const RADIUS_M = 2200;
  const m = L.map(mapId).setView([comm.lat, comm.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {attribution:'© OpenStreetMap'}).addTo(m);

  // ── Coverage circle ──
  L.circle([comm.lat, comm.lng], {
    radius: RADIUS_M, color: comm.color,
    fillColor: comm.color, fillOpacity: 0.07, weight: 2, dashArray: '6 4'
  }).addTo(m);

  // ── Solar installation marker (star pin) ──
  const installIcon = L.divIcon({
    html:`<div title="Instal·lació solar" style="
      background:${comm.color};width:44px;height:44px;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      border:3px solid #fff;box-shadow:0 3px 12px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;">
      <span style="transform:rotate(45deg);font-size:18px;line-height:1">☀</span>
    </div>`,
    className:'', iconSize:[44,44], iconAnchor:[22,44], popupAnchor:[0,-46]
  });
  L.marker([comm.lat, comm.lng], {icon: installIcon})
   .addTo(m)
   .bindPopup(`<div style="font-family:Outfit,sans-serif;min-width:180px">
     <strong style="font-size:0.95rem">${comm.nom}</strong><br>
     <span style="color:#666;font-size:0.78rem">☀ Instal·lació solar · ${comm.potencia}</span><br>
     <span style="color:#666;font-size:0.78rem">📍 ${comm.adreca}</span>
   </div>`);

  // ── Participant markers ──
  const clients = CLIENTS.filter(c => c.comunitat === comm.id);
  const offsets  = PARTICIPANT_OFFSETS[comm.id] || [];
  // Roughly 1° lat ≈ 111 km → 0.018° ≈ 2 km
  const rawOff = [
    [0.008, 0.011],[-0.006, 0.015],[0.013,-0.007],
    [-0.010,-0.012],[0.005,-0.016],[0.016, 0.004],
    [-0.013, 0.008],[0.009,-0.014],[-0.007, 0.010],
    [0.014,-0.005],[-0.011, 0.013],[0.006,-0.018]
  ];

  clients.forEach((c, i) => {
    const off = rawOff[i % rawOff.length];
    const lat = comm.lat + off[0];
    const lng = comm.lng + off[1];

    // Colour-code by status
    const dotColor = c.estat==='Actiu'?'#2D8452': c.estat==='Proposat'?'#C8973A':'#2B6CB0';
    const borderColor = c.cups_auth!=='OK'?'#C53030':'#fff';
    const warningDot = c.cups_auth!=='OK'?'<div style="position:absolute;top:-3px;right:-3px;width:10px;height:10px;border-radius:50%;background:#C53030;border:1.5px solid #fff;"></div>':''

    const pIcon = L.divIcon({
      html:`<div style="position:relative">
        <div title="${c.nom}" style="
          background:${dotColor};width:30px;height:30px;
          border-radius:50%;border:2.5px solid ${borderColor};
          box-shadow:0 2px 8px rgba(0,0,0,0.25);
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;color:#fff;
          font-family:DM Mono,monospace;">${c.kw}</div>
        ${warningDot}
      </div>`,
      className:'', iconSize:[30,30], iconAnchor:[15,15], popupAnchor:[0,-16]
    });

    L.marker([lat, lng], {icon: pIcon})
     .addTo(m)
     .bindPopup(`<div style="font-family:Outfit,sans-serif;min-width:200px">
       <div style="font-weight:700;font-size:0.88rem;margin-bottom:5px">${c.nom}</div>
       <div style="font-size:0.76rem;color:#555;line-height:1.6">
         📋 Codi: <strong>${c.codi}</strong><br>
         ⚡ ${c.kw} kW assignats · ${c.kwh.toLocaleString('ca-ES')} kWh/any<br>
         🔌 CUPS: <span style="font-family:monospace;font-size:0.7rem">${c.cups}</span><br>
         ${c.cups_auth!=='OK'?`<span style="color:#C53030;font-weight:600">⚠ CUPS no autoritzat${c.cups_auth_note?' ('+c.cups_auth_note+')':''}</span><br>`:''}
         📊 Estat: ${c.estat} · ${c.modalitat}<br>
         ${c.pct_estalvi?`💶 Estalvi estimat: ${c.pct_estalvi}%`:''}
       </div>
       <div style="margin-top:6px;padding-top:6px;border-top:1px solid #eee;font-size:0.75rem;color:#666">
         📞 ${c.tel} · ✉ ${c.email}
       </div>
     </div>`);

    // Line from installation to participant
    L.polyline([[comm.lat, comm.lng],[lat, lng]], {
      color: dotColor, weight: 1.5, opacity: 0.35, dashArray: '4 4'
    }).addTo(m);
  });

  // Legend
  const legend = L.control({position:'bottomright'});
  legend.onAdd = () => {
    const d = L.DomUtil.create('div');
    d.style.cssText='background:#fff;border:1px solid #ddd;border-radius:6px;padding:8px 10px;font-family:Outfit,sans-serif;font-size:11px;line-height:1.8;box-shadow:0 2px 8px rgba(0,0,0,0.1)';
    d.innerHTML=`
      <div style="font-weight:700;margin-bottom:4px;font-size:11px;">Llegenda</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:${comm.color};border-radius:50%;vertical-align:middle;margin-right:5px"></span>Instal·lació solar</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#2D8452;border-radius:50%;vertical-align:middle;margin-right:5px"></span>Client actiu</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#C8973A;border-radius:50%;vertical-align:middle;margin-right:5px"></span>Client proposat</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#2B6CB0;border-radius:50%;vertical-align:middle;margin-right:5px"></span>Client reserva</div>
      <div><span style="display:inline-block;width:12px;height:12px;background:#C53030;border-radius:50%;vertical-align:middle;margin-right:5px"></span>⚠ CUPS pendent</div>
      <div style="margin-top:4px;border-top:1px solid #eee;padding-top:4px;color:#888">El número = kW assignats</div>`;
    return d;
  };
  legend.addTo(m);
  detailMaps[comm.id] = m;
}

function initDetailChart(comm, clients) {
  const canvasId = `chart-kw-${comm.id}`;
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  const GREEN_PALETTE = ['#153522','#1B4D31','#236640','#2D8452','#3EAB6B','#6DC98F','#A8DFB8'];
  const BLUE_PALETTE  = ['#1A365D','#2B5BA8','#3B82C4','#63B3ED'];
  const GOLD_PALETTE  = ['#6B4400','#8B5E00','#C8973A','#E2B55A','#F6C96A'];
  const pal = comm.id==='C042'?BLUE_PALETTE:comm.id==='C031'?GOLD_PALETTE:GREEN_PALETTE;
  const names = clients.map(c => c.nom.split(' ').slice(0,2).join(' '));
  charts[canvasId] = new Chart(el, {
    type:'bar',
    data:{labels:names,datasets:[{label:'kW assignats',data:clients.map(c=>c.kw),backgroundColor:pal,borderRadius:5,borderSkipped:false}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{font:{size:10}}},y:{grid:{color:'#E3E8E3'},ticks:{font:{size:10}}}}}
  });
}

function switchDetailTab(btn, tabId) {
  const parent = btn.closest('.tabs').parentElement;
  parent.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  parent.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  const panel = document.getElementById(tabId);
  if (panel) panel.classList.add('active');
}

// ═══════════════════════════════════════════
//  CLIENTS TABLE
// ═══════════════════════════════════════════
function renderClientsTable(communityFilter) {
  const sel = document.getElementById('filter-comm-clients');
  const cf = communityFilter || (sel ? sel.value : '');
  const data = cf ? CLIENTS.filter(c => c.comunitat === cf) : CLIENTS;
  const tbody = document.getElementById('clients-tbody');
  tbody.innerHTML = data.map(c => {
    const comm = COMMUNITIES.find(x => x.id === c.comunitat);
    return `<tr>
      <td class="mono"><strong>${c.codi}</strong></td>
      <td class="td-name">${c.nom}</td>
      <td class="td-cups">${c.cups}</td>
      <td class="mono">${c.nif}</td>
      <td class="mono">${c.tel}</td>
      <td style="font-size:0.78rem">${c.email}</td>
      <td class="mono">${c.inici_fact}</td>
      <td>${c.baixa}</td>
      <td>${c.app==='Sí'?'<span class="chip-ok">Sí</span>':'<span class="chip-grey">No</span>'}</td>
      <td>${estatBadge(c.estat)}</td>
      <td style="font-size:0.78rem">${c.modalitat}</td>
      <td class="mono">${c.perfil}</td>
      <td class="mono">${c.comercialitz}</td>
      <td class="mono">${c.import_eur>0?c.import_eur.toLocaleString('ca-ES')+' €':'0,00 €'}</td>
      <td><span onclick="navigate('comunitat-detail',{id:'${c.comunitat}'})" style="cursor:pointer;color:var(--g600);font-weight:600;">${comm?comm.nom:c.comunitat}</span></td>
    </tr>`;
  }).join('');
  document.getElementById('stat-total-clients').textContent = data.length;
  document.getElementById('stat-actius').textContent = data.filter(c=>c.estat==='Actiu').length;
}

function filterClientsTable() {
  const term = document.getElementById('search-clients').value.toLowerCase();
  const cf = document.getElementById('filter-comm-clients').value;
  const rows = document.querySelectorAll('#clients-tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    const show = (!term || text.includes(term)) && (!cf || row.textContent.includes(COMMUNITIES.find(c=>c.id===cf)?.nom||''));
    row.style.display = show ? '' : 'none';
  });
}

function filterDetailTable(id) {
  const input = document.getElementById(`search-detail-${id}`);
  if (!input) return;
  const term = input.value.toLowerCase();
  const rows = document.querySelectorAll(`#detail-clients-table-${id} tbody tr`);
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
}

// ═══════════════════════════════════════════
//  SIDEBAR
// ═══════════════════════════════════════════
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
  setTimeout(() => { if (mapDashboard) mapDashboard.invalidateSize(); }, 250);
}

// ═══════════════════════════════════════════
//  GLOBAL SEARCH
// ═══════════════════════════════════════════
function globalSearch(val) {
  if (!val || val.length < 2) return;
  // Simple: navigate to clients and filter
  navigate('clients');
  setTimeout(() => {
    const el = document.getElementById('search-clients');
    if (el) { el.value = val; filterClientsTable(); }
  }, 100);
}

function initSavingsCharts(id) {
  // Placeholder empty charts (no real data yet — zeros)
  const months = ['Oct','Nov','Des','Gen','Feb','Mar','Abr','Mai','Jun','Jul','Ago','Set'];
  const zeros = months.map(()=>0);
  const chartOpts = (yLabel) => ({
    responsive:true, maintainAspectRatio:false,
    plugins:{legend:{display:false}},
    scales:{
      x:{grid:{display:false},ticks:{font:{size:10}}},
      y:{grid:{color:'#E3E8E3'},ticks:{font:{size:10},callback:v=>v+(yLabel==='kWh'?' kWh':'€')},
         title:{display:true,text:yLabel,font:{size:10}}}
    }
  });
  const mkDatasets = () => ([
    {label:'Autoconsum',data:zeros,backgroundColor:'rgba(62,171,107,0.7)',borderRadius:4,borderSkipped:false},
    {label:'Excedent',data:zeros,backgroundColor:'rgba(43,108,176,0.6)',borderRadius:4,borderSkipped:false}
  ]);

  const cEst = document.getElementById(`chart-estalvi-${id}`);
  const cEfic = document.getElementById(`chart-efic-${id}`);
  if (cEst && !charts[`estalvi-${id}`]) {
    charts[`estalvi-${id}`] = new Chart(cEst,{type:'bar',data:{labels:months,datasets:mkDatasets()},options:chartOpts('€')});
  }
  if (cEfic && !charts[`efic-${id}`]) {
    charts[`efic-${id}`] = new Chart(cEfic,{type:'bar',data:{labels:months,datasets:mkDatasets()},options:chartOpts('kWh')});
  }
}

function setDateRange(startId, endId, months) {
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  let startD;
  if (months === 0) {
    startD = `${now.getFullYear()}-01`;
  } else {
    const s = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
    startD = `${s.getFullYear()}-${String(s.getMonth()+1).padStart(2,'0')}`;
  }
  const sEl = document.getElementById(startId);
  const eEl = document.getElementById(endId);
  if (sEl) sEl.value = startD;
  if (eEl) eEl.value = end;
}

function selectIncidentType(el, type) {
  document.querySelectorAll('.incident-type-item').forEach(item => {
    item.style.background='';item.style.borderColor='var(--border)';
    item.querySelector('div div:first-child').style.color='';
  });
  el.style.background='var(--red-bg)';el.style.borderColor='var(--red)';
  el.querySelector('div div:first-child').style.color='var(--red)';
}

function refreshData() {
  const btn = event.target;
  btn.textContent = '⏳ Actualitzant...';
  setTimeout(() => { btn.textContent = '🔄 Actualitzar'; }, 1200);
}

// ═══════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  navigate('dashboard');
  renderClientsTable();
});

// ═══════════════════════════════════════════════════════════════
//  CRUD — COMUNITATS & CLIENTS
function nextCommId() {
  const nums = COMMUNITIES.map(c => parseInt(c.id.replace('C',''))).filter(n => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return 'C' + String(max + 1).padStart(3, '0');
}
function nextClientCodi(commId) {
  const prefix = commId.replace('C','');
  const existing = CLIENTS.filter(c => c.comunitat === commId)
    .map(c => parseInt(c.codi.slice(-3))).filter(n => !isNaN(n));
  const max = existing.length ? Math.max(...existing) : 0;
  return prefix + String(max + 1).padStart(3, '0');
}

// ── Toast ──
function showToast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast ' + type;
  void t.offsetWidth;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Modal helpers ──
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// ── Confirm dialog ──
function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  confirmCallback = cb;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() {
  document.getElementById('confirm-overlay').classList.remove('open');
  confirmCallback = null;
}
document.getElementById('confirm-ok-btn').onclick = () => {
  if (confirmCallback) confirmCallback();
  closeConfirm();
};

// ─────────────────────────────────────────────
//  COMUNITAT: OBRIR MODAL (nova o editar)
// ─────────────────────────────────────────────
function openCommModal(id) {
  editingCommId = id || null;
  rowCounter = 0;
  document.getElementById('modal-comm-title').textContent = id ? '✏️ Editar comunitat' : '+ Nova comunitat';
  document.getElementById('modal-comm-err').textContent = '';

  if (id) {
    // Fill form with existing data
    const c = COMMUNITIES.find(x => x.id === id);
    if (!c) return;
    document.getElementById('c-nom').value      = c.nom;
    document.getElementById('c-id').value       = c.id;
    document.getElementById('c-promotor').value = c.promotor;
    document.getElementById('c-contacte').value = c.contacte || '';
    document.getElementById('c-email').value    = c.email;
    document.getElementById('c-tel').value      = c.telefon;
    document.getElementById('c-adreca').value   = c.adreca;
    document.getElementById('c-potencia').value = c.total_kw;
    document.getElementById('c-onboarding').value = c.onboarding;
    document.getElementById('c-acord').value    = c.acord_reparto;
    document.getElementById('c-informe').value  = c.informe_auto;
    document.getElementById('c-marca').value    = c.marca_blanca;
    document.getElementById('c-lat').value      = c.lat;
    document.getElementById('c-lng').value      = c.lng;
    document.getElementById('c-fi').value       = '';
    pickColorVal(c.color);
    // Pre-fill existing clients
    const clients = CLIENTS.filter(cl => cl.comunitat === id);
    document.getElementById('client-rows-body').innerHTML = '';
    clients.forEach(cl => addClientRowFilled(cl));
  } else {
    // Clear form
    ['c-nom','c-promotor','c-contacte','c-email','c-tel','c-adreca','c-potencia','c-lat','c-lng','c-fi']
      .forEach(f => document.getElementById(f).value = '');
    document.getElementById('c-id').value = nextCommId();
    document.getElementById('c-onboarding').value = 'Obert';
    document.getElementById('c-acord').value = 'Pendent';
    document.getElementById('c-informe').value = 'Sense informe auto';
    document.getElementById('c-marca').value = 'Sense informe auto';
    pickColorVal('#1B4D31');
    document.getElementById('client-rows-body').innerHTML = '';
    addClientRow(); addClientRow(); // start with 2 blank rows
  }

  goStep(1);
  openModal('modal-comm');
}

// ─────────────────────────────────────────────
//  MODAL STEPS
// ─────────────────────────────────────────────
function goStep(n) {
  [1,2].forEach(i => {
    document.getElementById('step-panel-' + i).classList.toggle('active', i === n);
    document.getElementById('step-lbl-' + i).className = 'modal-step' + (i === n ? ' active' : (i < n ? ' done' : ''));
  });
  document.getElementById('btn-prev-step').style.display = n === 2 ? '' : 'none';
  document.getElementById('btn-next-step').style.display = n === 1 ? '' : 'none';
  document.getElementById('btn-save-comm').style.display = n === 2 ? '' : 'none';
}

// ─────────────────────────────────────────────
//  COLOR PICKER
// ─────────────────────────────────────────────
function pickColor(el) {
  document.querySelectorAll('#c-color-swatches .swatch').forEach(s => s.classList.remove('sel'));
  el.classList.add('sel');
  selectedColor = el.dataset.color;
  document.getElementById('c-color').value = selectedColor;
}
function pickColorVal(val) {
  selectedColor = val;
  document.getElementById('c-color').value = val;
  document.querySelectorAll('#c-color-swatches .swatch').forEach(s => {
    s.classList.toggle('sel', s.dataset.color === val);
  });
}

// ─────────────────────────────────────────────
//  CLIENT ROWS IN MODAL
// ─────────────────────────────────────────────
function addClientRow() {
  rowCounter++;
  const r = rowCounter;
  const div = document.createElement('div');
  div.className = 'client-table-row';
  div.id = 'crow-' + r;
  div.innerHTML = `
    <input placeholder="Nom / Empresa" id="cr-nom-${r}">
    <input placeholder="B12345678" id="cr-nif-${r}">
    <input placeholder="ES003140..." id="cr-cups-${r}">
    <input type="number" min="0" step="0.5" placeholder="kW" id="cr-kw-${r}">
    <input type="email" placeholder="correu@..." id="cr-email-${r}">
    <input placeholder="9XXXXXXXX" id="cr-tel-${r}">
    <select id="cr-estat-${r}">
      <option value="Proposat">Proposat</option>
      <option value="Reserva">Reserva</option>
      <option value="Actiu">Actiu</option>
    </select>
    <button class="del-row" onclick="removeClientRow(${r})">✕</button>`;
  document.getElementById('client-rows-body').appendChild(div);
}

function addClientRowFilled(cl) {
  rowCounter++;
  const r = rowCounter;
  const div = document.createElement('div');
  div.className = 'client-table-row';
  div.id = 'crow-' + r;
  div.dataset.codi = cl.codi;
  div.innerHTML = `
    <input value="${cl.nom}" id="cr-nom-${r}">
    <input value="${cl.nif}" id="cr-nif-${r}">
    <input value="${cl.cups}" id="cr-cups-${r}">
    <input type="number" value="${cl.kw}" id="cr-kw-${r}">
    <input type="email" value="${cl.email}" id="cr-email-${r}">
    <input value="${cl.tel}" id="cr-tel-${r}">
    <select id="cr-estat-${r}">
      <option value="Proposat" ${cl.estat==='Proposat'?'selected':''}>Proposat</option>
      <option value="Reserva" ${cl.estat==='Reserva'?'selected':''}>Reserva</option>
      <option value="Actiu" ${cl.estat==='Actiu'?'selected':''}>Actiu</option>
    </select>
    <button class="del-row" onclick="removeClientRow(${r})">✕</button>`;
  document.getElementById('client-rows-body').appendChild(div);
}

function removeClientRow(r) {
  const el = document.getElementById('crow-' + r);
  if (el) el.remove();
}

// ─────────────────────────────────────────────
//  GUARDAR COMUNITAT
// ─────────────────────────────────────────────
function saveComm() {
  const nom      = document.getElementById('c-nom').value.trim();
  const promotor = document.getElementById('c-promotor').value.trim();
  const potencia = parseFloat(document.getElementById('c-potencia').value) || 0;
  const errEl    = document.getElementById('modal-comm-err');

  if (!nom || !promotor || !potencia) {
    errEl.textContent = '⚠ Omple els camps obligatoris: Nom, Promotor i Potència.';
    goStep(1); return;
  }
  errEl.textContent = '';

  const id = editingCommId || document.getElementById('c-id').value;
  const lat = parseFloat(document.getElementById('c-lat').value) || 41.50;
  const lng = parseFloat(document.getElementById('c-lng').value) || 2.00;
  const fiRaw = document.getElementById('c-fi').value;
  const fiFormatted = fiRaw ? fiRaw.split('-').reverse().join('/') : '31/12/2026';

  const commObj = {
    id, nom,
    promotor,
    contacte: document.getElementById('c-contacte').value.trim() || promotor,
    email:    document.getElementById('c-email').value.trim(),
    telefon:  document.getElementById('c-tel').value.trim(),
    adreca:   document.getElementById('c-adreca').value.trim(),
    potencia: potencia + ',0 kW',
    onboarding:   document.getElementById('c-onboarding').value,
    acord_reparto: document.getElementById('c-acord').value,
    fi_inscripcions: fiFormatted,
    informe_auto: document.getElementById('c-informe').value,
    marca_blanca: document.getElementById('c-marca').value,
    lat, lng,
    color: document.getElementById('c-color').value || '#1B4D31',
    clients_actius:0, inscrits:0,
    cups_auth_actius:0, cups_auth_proposats:0,
    sense_auth:0, datadis_actius:0,
    autoconsumos:'0/0', clients_app:0,
    sense_dades:0, sol_licituds:0,
    total_estalvi:0, total_kw: potencia, total_clients:0,
  };

  // ── Process client rows ──
  const rows = document.querySelectorAll('#client-rows-body .client-table-row');
  const newClients = [];
  rows.forEach((row, i) => {
    const r = row.id.replace('crow-', '');
    const nom_cl = document.getElementById('cr-nom-' + r)?.value.trim();
    if (!nom_cl) return; // skip empty rows
    const codi = row.dataset.codi || nextClientCodi_seq(id, i + 1);
    const kw = parseFloat(document.getElementById('cr-kw-' + r)?.value) || 0;
    const cups = document.getElementById('cr-cups-' + r)?.value.trim();
    newClients.push({
      codi,
      nom: nom_cl,
      nif: document.getElementById('cr-nif-' + r)?.value.trim() || '',
      cups: cups || '—',
      tel: document.getElementById('cr-tel-' + r)?.value.trim() || '',
      email: document.getElementById('cr-email-' + r)?.value.trim() || '',
      inici_fact: '-', baixa: '-', app: 'No',
      estat: document.getElementById('cr-estat-' + r)?.value || 'Proposat',
      modalitat: 'Ahorra sempre', perfil: 'F',
      comercialitz: '0091', import_eur: 0,
      comunitat: id, kw, kwh: kw * 1500,
      preu_llum: 0, estalvi_brut: 0,
      cost_fix: kw * 12, preu_kwh: 0.088,
      pct_estalvi: null, periode: 0,
      distribuidora: '031',
      cups_auth: cups ? 'OK' : 'Falten',
      cups_auth_note: cups ? '' : 'Pendent',
      autoconsum: '-', datadis: 'Actiu',
      dades_recents: 'Sense dades', sense_auto: 'OK'
    });
  });

  commObj.total_clients = newClients.length;
  commObj.total_kw      = newClients.reduce((s, c) => s + c.kw, 0) || potencia;

  if (editingCommId) {
    // UPDATE
    const idx = COMMUNITIES.findIndex(c => c.id === editingCommId);
    if (idx > -1) COMMUNITIES[idx] = { ...COMMUNITIES[idx], ...commObj };
    // Remove old clients and add new ones
    COMMUNITIES[idx].total_clients = newClients.length;
    const otherClients = CLIENTS.filter(c => c.comunitat !== editingCommId);
    CLIENTS.length = 0;
    otherClients.concat(newClients).forEach(c => CLIENTS.push(c));
    showToast('✅ Comunitat actualitzada correctament');
  } else {
    // CREATE
    COMMUNITIES.push(commObj);
    newClients.forEach(c => CLIENTS.push(c));
    showToast('✅ Comunitat creada correctament');
  }

  closeModal('modal-comm');
  reloadCurrentView();
}

function nextClientCodi_seq(commId, n) {
  const prefix = commId.replace('C', '');
  return prefix + String(n).padStart(3, '0');
}

// ─────────────────────────────────────────────
//  ELIMINAR COMUNITAT
// ─────────────────────────────────────────────
function deleteComm(id, event) {
  event.stopPropagation();
  const comm = COMMUNITIES.find(c => c.id === id);
  if (!comm) return;
  showConfirm(
    'Eliminar comunitat',
    `Segur que vols eliminar "${comm.nom}" i tots els seus clients (${comm.total_clients})? Aquesta acció no es pot desfer.`,
    () => {
      const idx = COMMUNITIES.findIndex(c => c.id === id);
      if (idx > -1) COMMUNITIES.splice(idx, 1);
      // Remove clients
      for (let i = CLIENTS.length - 1; i >= 0; i--) {
        if (CLIENTS[i].comunitat === id) CLIENTS.splice(i, 1);
      }
      // Destroy map if exists
      if (detailMaps[id]) {
        try { detailMaps[id].remove(); } catch(e) {}
        delete detailMaps[id];
      }
      showToast('🗑 Comunitat eliminada');
      reloadCurrentView();
    }
  );
}

// ─────────────────────────────────────────────
//  AFEGIR CLIENT DES DEL DETALL
// ─────────────────────────────────────────────
function openClientModal(commId, clientCodi) {
  editingClientCommId = commId;
  editingClientCodi   = clientCodi || null;
  document.getElementById('modal-client-err').textContent = '';
  document.getElementById('modal-client-title').textContent = clientCodi ? '✏️ Editar participant' : '+ Nou participant';

  if (clientCodi) {
    const cl = CLIENTS.find(c => c.codi === clientCodi);
    if (!cl) return;
    document.getElementById('cl-nom').value  = cl.nom;
    document.getElementById('cl-nif').value  = cl.nif;
    document.getElementById('cl-cups').value = cl.cups === '—' ? '' : cl.cups;
    document.getElementById('cl-email').value = cl.email;
    document.getElementById('cl-tel').value  = cl.tel;
    document.getElementById('cl-kw').value   = cl.kw;
    document.getElementById('cl-estat').value = cl.estat;
    document.getElementById('cl-modalitat').value = cl.modalitat;
    document.getElementById('cl-preu').value = cl.preu_llum || '';
    document.getElementById('cl-perfil').value = cl.perfil || 'F';
  } else {
    ['cl-nom','cl-nif','cl-cups','cl-email','cl-tel','cl-kw','cl-preu'].forEach(f => {
      document.getElementById(f).value = '';
    });
    document.getElementById('cl-estat').value = 'Proposat';
    document.getElementById('cl-modalitat').value = 'Ahorra sempre';
    document.getElementById('cl-perfil').value = 'F';
  }
  openModal('modal-client');
}

function saveClient() {
  const nom  = document.getElementById('cl-nom').value.trim();
  const nif  = document.getElementById('cl-nif').value.trim();
  const kw   = parseFloat(document.getElementById('cl-kw').value) || 0;
  const errEl = document.getElementById('modal-client-err');

  if (!nom || !nif || !kw) {
    errEl.textContent = '⚠ Omple els camps: Nom, NIF i kW assignats.';
    return;
  }
  errEl.textContent = '';

  const cups = document.getElementById('cl-cups').value.trim();
  const newCl = {
    codi: editingClientCodi || nextClientCodi(editingClientCommId),
    nom, nif,
    cups: cups || '—',
    tel:   document.getElementById('cl-tel').value.trim(),
    email: document.getElementById('cl-email').value.trim(),
    inici_fact: '-', baixa: '-', app: 'No',
    estat:    document.getElementById('cl-estat').value,
    modalitat: document.getElementById('cl-modalitat').value,
    perfil: document.getElementById('cl-perfil').value,
    comercialitz: '0091', import_eur: 0,
    comunitat: editingClientCommId,
    kw, kwh: kw * 1500,
    preu_llum: parseFloat(document.getElementById('cl-preu').value) || 0,
    estalvi_brut: 0, cost_fix: kw * 12,
    preu_kwh: 0.088, pct_estalvi: null,
    periode: 0, distribuidora: '031',
    cups_auth: cups ? 'OK' : 'Falten',
    cups_auth_note: cups ? '' : 'Pendent',
    autoconsum: '-', datadis: 'Actiu',
    dades_recents: 'Sense dades', sense_auto: 'OK'
  };

  if (editingClientCodi) {
    const idx = CLIENTS.findIndex(c => c.codi === editingClientCodi);
    if (idx > -1) CLIENTS[idx] = newCl;
    showToast('✅ Participant actualitzat');
  } else {
    CLIENTS.push(newCl);
    // Update community totals
    const comm = COMMUNITIES.find(c => c.id === editingClientCommId);
    if (comm) {
      const commClients = CLIENTS.filter(c => c.comunitat === editingClientCommId);
      comm.total_clients = commClients.length;
      comm.total_kw = commClients.reduce((s, c) => s + c.kw, 0);
    }
    showToast('✅ Participant afegit correctament');
  }

  closeModal('modal-client');
  // Re-render detail if we're on it
  if (currentView === 'comunitat-detail' && currentCommunity === editingClientCommId) {
    renderCommunityDetail(editingClientCommId);
  }
  renderClientsTable();
}

// ─────────────────────────────────────────────
//  ELIMINAR CLIENT
// ─────────────────────────────────────────────
function deleteClient(codi, event) {
  if (event) event.stopPropagation();
  const cl = CLIENTS.find(c => c.codi === codi);
  if (!cl) return;
  showConfirm(
    'Eliminar participant',
    `Segur que vols eliminar "${cl.nom}"?`,
    () => {
      const idx = CLIENTS.findIndex(c => c.codi === codi);
      if (idx > -1) CLIENTS.splice(idx, 1);
      // Update community totals
      const comm = COMMUNITIES.find(c => c.id === cl.comunitat);
      if (comm) {
        const commClients = CLIENTS.filter(c => c.comunitat === comm.id);
        comm.total_clients = commClients.length;
        comm.total_kw = commClients.reduce((s, c) => s + c.kw, 0);
      }
      showToast('🗑 Participant eliminat');
      if (currentView === 'comunitat-detail' && currentCommunity === cl.comunitat) {
        renderCommunityDetail(cl.comunitat);
      }
      renderClientsTable();
    }
  );
}

// ─────────────────────────────────────────────
//  RELOAD VIEW AFTER CHANGES
// ─────────────────────────────────────────────
function reloadCurrentView() {
  if (currentView === 'dashboard')        { mapDashboard = null; initDashboard(); }
  else if (currentView === 'comunitats')  { renderCommunityCards(); }
  else if (currentView === 'clients')     { renderClientsTable(); }
  else if (currentView === 'comunitat-detail') {
    const comm = COMMUNITIES.find(c => c.id === currentCommunity);
    if (comm) renderCommunityDetail(currentCommunity);
    else navigate('comunitats');
  }
  // Sync dashboard community filter select
  const sel = document.getElementById('filter-comm-clients');
  if (sel) {
    sel.innerHTML = '<option value="">Totes les comunitats</option>' +
      COMMUNITIES.map(c => `<option value="${c.id}">${c.nom} (${c.id})</option>`).join('');
  }
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});
document.getElementById('confirm-overlay').addEventListener('click', e => {
  if (e.target === document.getElementById('confirm-overlay')) closeConfirm();
});


// ─── CRUD OVERRIDES — persist to API ──────────────────
window.saveComm = async function() {
  const nom=document.getElementById('c-nom').value.trim();
  const promotor=document.getElementById('c-promotor').value.trim();
  const potencia=parseFloat(document.getElementById('c-potencia').value)||0;
  const errEl=document.getElementById('modal-comm-err');
  if(!nom||!promotor||!potencia){errEl.textContent='⚠ Omple: Nom, Promotor i Potència.';goStep(1);return;}
  errEl.textContent='';
  const id=editingCommId||document.getElementById('c-id').value;
  const lat=parseFloat(document.getElementById('c-lat').value)||41.50;
  const lng=parseFloat(document.getElementById('c-lng').value)||2.00;
  const fiRaw=document.getElementById('c-fi').value;
  const fiF=fiRaw?fiRaw.split('-').reverse().join('/'):'31/12/2026';
  const commObj={
    id,nom,promotor,
    contacte:document.getElementById('c-contacte').value.trim()||promotor,
    email:document.getElementById('c-email').value.trim(),
    telefon:document.getElementById('c-tel').value.trim(),
    adreca:document.getElementById('c-adreca').value.trim(),
    potencia:potencia+',0 kW',
    onboarding:document.getElementById('c-onboarding').value,
    acord_reparto:document.getElementById('c-acord').value,
    fi_inscripcions:fiF,
    informe_auto:document.getElementById('c-informe').value,
    marca_blanca:document.getElementById('c-marca').value,
    lat,lng,color:document.getElementById('c-color').value||'#1B4D31',
    clients_actius:0,inscrits:0,cups_auth_actius:0,cups_auth_proposats:0,
    sense_auth:0,datadis_actius:0,autoconsumos:'0/0',clients_app:0,
    sense_dades:0,sol_licituds:0,total_estalvi:0,total_kw:potencia,total_clients:0
  };
  const rows=document.querySelectorAll('#client-rows-body .client-table-row');
  const newClients=[];
  rows.forEach((row,i)=>{
    const r=row.id.replace('crow-','');
    const nomCl=document.getElementById('cr-nom-'+r)?.value.trim();
    if(!nomCl)return;
    const codi=row.dataset.codi||nextClientCodi_seq(id,i+1);
    const kw=parseFloat(document.getElementById('cr-kw-'+r)?.value)||0;
    const cups=document.getElementById('cr-cups-'+r)?.value.trim();
    newClients.push({
      codi,nom:nomCl,nif:document.getElementById('cr-nif-'+r)?.value.trim()||'',
      cups:cups||'—',tel:document.getElementById('cr-tel-'+r)?.value.trim()||'',
      email:document.getElementById('cr-email-'+r)?.value.trim()||'',
      inici_fact:'-',baixa:'-',app:'No',estat:document.getElementById('cr-estat-'+r)?.value||'Proposat',
      modalitat:'Ahorra sempre',perfil:'F',comercialitz:'0091',import_eur:0,
      comunitat:id,kw,kwh:kw*1500,preu_llum:0,estalvi_brut:0,cost_fix:kw*12,
      preu_kwh:0.088,pct_estalvi:null,periode:0,distribuidora:'031',
      cups_auth:cups?'OK':'Falten',cups_auth_note:cups?'':'Pendent',
      autoconsum:'-',datadis:'Actiu',dades_recents:'Sense dades',sense_auto:'OK'
    });
  });
  commObj.total_clients=newClients.length;
  commObj.total_kw=newClients.reduce((s,c)=>s+c.kw,0)||potencia;
  showLoading(true);
  try {
    if(editingCommId){
      await apiSaveComm('PUT',editingCommId,commObj);
      for(const cl of newClients){
        const ex=CLIENTS.find(c=>c.codi===cl.codi);
        await apiSaveClient(ex?'PUT':'POST',ex?cl.codi:null,cl);
      }
      showToast('✅ Comunitat actualitzada');
    } else {
      await apiSaveComm('POST',null,commObj);
      for(const cl of newClients) await apiSaveClient('POST',null,cl);
      showToast('✅ Comunitat creada');
    }
    closeModal('modal-comm');
    await reloadAndRender();
  } catch(e){ errEl.textContent='⚠ '+e.message; }
  finally { showLoading(false); }
};

window.deleteComm = async function(id, event) {
  if(event) event.stopPropagation();
  const comm=COMMUNITIES.find(c=>c.id===id);
  if(!comm)return;
  showConfirm('Eliminar comunitat',`Segur que vols eliminar "${comm.nom}" i tots els clients (${comm.total_clients})?`, async()=>{
    showLoading(true);
    try{
      await apiDelComm(id);
      if(detailMaps[id]){try{detailMaps[id].remove();}catch(e){}delete detailMaps[id];}
      showToast('🗑 Comunitat eliminada');
      await reloadAndRender();
    }catch(e){showToast('Error: '+e.message,'err');}
    finally{showLoading(false);}
  });
};

window.saveClient = async function() {
  const nom=document.getElementById('cl-nom').value.trim();
  const nif=document.getElementById('cl-nif').value.trim();
  const kw=parseFloat(document.getElementById('cl-kw').value)||0;
  const errEl=document.getElementById('modal-client-err');
  if(!nom||!nif||!kw){errEl.textContent='⚠ Omple: Nom, NIF i kW.';return;}
  errEl.textContent='';
  const cups=document.getElementById('cl-cups').value.trim();
  const newCl={
    codi:editingClientCodi||nextClientCodi(editingClientCommId),
    nom,nif,cups:cups||'—',
    tel:document.getElementById('cl-tel').value.trim(),
    email:document.getElementById('cl-email').value.trim(),
    inici_fact:'-',baixa:'-',app:'No',
    estat:document.getElementById('cl-estat').value,
    modalitat:document.getElementById('cl-modalitat').value,
    perfil:document.getElementById('cl-perfil').value,
    comercialitz:'0091',import_eur:0,
    comunitat:editingClientCommId,kw,kwh:kw*1500,
    preu_llum:parseFloat(document.getElementById('cl-preu').value)||0,
    estalvi_brut:0,cost_fix:kw*12,preu_kwh:0.088,pct_estalvi:null,
    periode:0,distribuidora:'031',
    cups_auth:cups?'OK':'Falten',cups_auth_note:cups?'':'Pendent',
    autoconsum:'-',datadis:'Actiu',dades_recents:'Sense dades',sense_auto:'OK'
  };
  showLoading(true);
  try{
    if(editingClientCodi){
      await apiSaveClient('PUT',editingClientCodi,newCl);
      showToast('✅ Participant actualitzat');
    } else {
      await apiSaveClient('POST',null,newCl);
      showToast('✅ Participant afegit');
    }
    closeModal('modal-client');
    await reloadAndRender();
    if(currentView==='comunitat-detail'&&currentCommunity===editingClientCommId)
      renderCommunityDetail(editingClientCommId);
  }catch(e){errEl.textContent='⚠ '+e.message;}
  finally{showLoading(false);}
};

window.deleteClient = async function(codi, event) {
  if(event) event.stopPropagation();
  const cl=CLIENTS.find(c=>c.codi===codi);
  if(!cl)return;
  showConfirm('Eliminar participant',`Segur que vols eliminar "${cl.nom}"?`, async()=>{
    showLoading(true);
    try{
      await apiDelClient(codi);
      showToast('🗑 Participant eliminat');
      const commId=cl.comunitat;
      await reloadAndRender();
      if(currentView==='comunitat-detail'&&currentCommunity===commId)
        renderCommunityDetail(commId);
    }catch(e){showToast('Error: '+e.message,'err');}
    finally{showLoading(false);}
  });
};

// ─── DOM READY ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const okBtn=document.getElementById('confirm-ok-btn');
  if(okBtn) okBtn.onclick=()=>{if(confirmCallback)confirmCallback();closeConfirm();};
  document.querySelectorAll('.modal-overlay').forEach(o=>{
    o.addEventListener('click',e=>{if(e.target===o)o.classList.remove('open');});
  });
  const co=document.getElementById('confirm-overlay');
  if(co) co.addEventListener('click',e=>{if(e.target===co)closeConfirm();});
  const lp=document.getElementById('l-pass');
  if(lp) lp.addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  const lu=document.getElementById('l-user');
  if(lu) lu.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('l-pass').focus();});
  // Auto-login
  if(getToken()) launchApp();
});
