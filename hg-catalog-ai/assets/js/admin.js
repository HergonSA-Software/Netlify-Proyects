// ── Admin panel logic ─────────────────────────────────────────────────────────

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions';

const AREAS = [
  'gestión de proyectos','costos','bim','arquitectura',
  'ssoma','gestión obra','rrhh','administración','compras','coordinación',
];

const AREA_COLORS = {
  'gestión de proyectos': '#2563eb',
  'bim':                  '#7c3aed',
  'arquitectura':         '#0891b2',
  'costos':               '#d97706',
  'rrhh':                 '#059669',
  'administración':       '#64748b',
  'compras':              '#e11d48',
  'coordinación':         '#0f766e',
  'ssoma':                '#dc2626',
  'gestión obra':         '#7e5bef',
};

let tools = [];
let editingId = null;
let deletingId = null;

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  // Errors stay longer so the user can read them
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}

// ── Loading ───────────────────────────────────────────────────────────────────
function setLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('open', on);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Check auth
  const session = Auth.init();
  if (!session) {
    showView('login');
    return;
  }
  showView('admin');
  await loadTools();
}

function showView(view) {
  document.getElementById('view-login').style.display  = view === 'login'  ? '' : 'none';
  document.getElementById('view-admin').style.display  = view === 'admin'  ? '' : 'none';
}

// ── Auth ──────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Ingresando…';

  try {
    await Auth.signIn(email, password);
    showView('admin');
    await loadTools();
  } catch (err) {
    errEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
});

async function logout() {
  await Auth.signOut();
  tools = [];
  showView('login');
}

// ── Load tools ────────────────────────────────────────────────────────────────
async function loadTools() {
  setLoading(true);
  try {
    tools = await fetchAllTools();
    renderTable();
    document.getElementById('admin-tool-count').textContent =
      `${tools.length} herramienta${tools.length !== 1 ? 's' : ''}`;
  } catch (err) {
    showToast('Error cargando herramientas: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── Render tools table ────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('tools-tbody');
  if (tools.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--muted);">
      Sin herramientas registradas. <button class="btn-icon" onclick="openForm()">+ Agregar primera</button>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = tools.map(t => {
    const color = AREA_COLORS[t.area] || '#64748b';
    return `<tr>
      <td><span class="tool-code-badge">${escHtml(t.code)}</span></td>
      <td style="font-weight:600;max-width:220px">${escHtml(t.title)}</td>
      <td><span class="area-pill" style="background:${color}">${escHtml(t.area)}</span></td>
      <td style="font-size:0.72rem;color:var(--muted);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.desc?.substring(0,80) || '')}…</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" onclick="openForm('${t.id}')">✏️ Editar</button>
          <button class="btn-danger" onclick="confirmDelete('${t.id}','${escHtml(t.title)}')">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Tool Form ─────────────────────────────────────────────────────────────────
// payload (optional) — pre-fills the form with AI-generated data
function openForm(id = null, payload = null) {
  editingId = id;
  const t = payload || (id ? tools.find(x => x.id === id) : null);
  const isAiGenerated = !!payload && !id;

  document.getElementById('form-modal-title').textContent =
    isAiGenerated ? '✨ Revisar Herramienta Generada' : (id ? 'Editar Herramienta' : 'Nueva Herramienta');

  // Basic fields
  setVal('f-code',   t?.code   || '');
  setVal('f-title',  t?.title  || '');
  setVal('f-area',   t?.area   || '');
  setVal('f-area2',  t?.area2  || '');
  setVal('f-area3',  t?.area3  || '');
  setVal('f-area4',  t?.area4  || '');
  setVal('f-desc',   t?.desc   || '');
  setVal('f-prompt', t?.prompt || '');

  // Dynamic reqs
  renderDynamicList('reqs-list', t?.reqs || [], renderReqItem);
  // Dynamic flow
  renderDynamicList('flow-list', t?.flow || [], renderFlowItem);
  // Dynamic steps
  renderDynamicList('steps-list', t?.steps || [], renderStepItem);
  // Dynamic resources
  renderDynamicList('resources-list', t?.resources || [], renderResourceItem);

  document.getElementById('form-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeForm() {
  document.getElementById('form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  editingId = null;
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ── Dynamic list helpers ──────────────────────────────────────────────────────
function renderDynamicList(containerId, items, renderFn) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';
  if (!items || items.length === 0) return;
  items.forEach((item, i) => el.appendChild(renderFn(item, i)));
}

function addListItem(containerId, renderFn, emptyItem) {
  const el = document.getElementById(containerId);
  const idx = el.children.length;
  el.appendChild(renderFn(emptyItem, idx));
}

function removeListItem(btn) {
  btn.closest('.dynamic-item').remove();
}

// Req item: supports both {key, value} objects (Firestore) and legacy [key, val] arrays
function renderReqItem(item, i) {
  const k = Array.isArray(item) ? (item[0] || '') : (item.key   || '');
  const v = Array.isArray(item) ? (item[1] || '') : (item.value || '');
  const d = document.createElement('div');
  d.className = 'dynamic-item';
  d.innerHTML = `
    <input class="form-input" placeholder="Campo" value="${escHtml(k)}" data-req-key>
    <input class="form-input" placeholder="Valor" value="${escHtml(v)}" data-req-val>
    <button type="button" class="btn-remove-item" onclick="removeListItem(this)">✕</button>`;
  return d;
}

// Flow item: {stage, main, sub}
function renderFlowItem(item, i) {
  const d = document.createElement('div');
  d.className = 'dynamic-item';
  d.innerHTML = `
    <input class="form-input" placeholder="Etapa (ej: Input)" value="${escHtml(item.stage || '')}" data-flow-stage>
    <input class="form-input" placeholder="Principal" value="${escHtml(item.main || '')}" data-flow-main>
    <input class="form-input" placeholder="Subtítulo" value="${escHtml(item.sub || '')}" data-flow-sub>
    <button type="button" class="btn-remove-item" onclick="removeListItem(this)">✕</button>`;
  return d;
}

// Step item: {title, tag, tagColor, desc}
function renderStepItem(item, i) {
  const d = document.createElement('div');
  d.className = 'dynamic-item';
  d.style.flexDirection = 'column';
  d.innerHTML = `
    <div style="display:flex;gap:0.5rem;width:100%">
      <input class="form-input" placeholder="Título del paso" value="${escHtml(item.title || '')}" data-step-title style="flex:2">
      <input class="form-input" placeholder="Tag" value="${escHtml(item.tag || '')}" data-step-tag style="flex:1">
      <select class="form-input" data-step-tagcolor style="flex:1">
        <option value="" ${!item.tagColor ? 'selected':''}>Color tag</option>
        <option value="orange" ${item.tagColor==='orange'?'selected':''}>Naranja</option>
      </select>
      <button type="button" class="btn-remove-item" onclick="removeListItem(this)">✕</button>
    </div>
    <textarea class="form-input" placeholder="Descripción del paso" data-step-desc rows="2" style="width:100%">${escHtml(item.desc || '')}</textarea>`;
  return d;
}

// Resource item: {icon, name, desc, url}
function renderResourceItem(item, i) {
  const d = document.createElement('div');
  d.className = 'dynamic-item';
  d.style.flexDirection = 'column';
  d.innerHTML = `
    <div style="display:flex;gap:0.5rem;width:100%">
      <input class="form-input" placeholder="Ícono emoji" value="${escHtml(item.icon || '')}" data-res-icon style="flex:0 0 70px">
      <input class="form-input" placeholder="Nombre del recurso" value="${escHtml(item.name || '')}" data-res-name style="flex:2">
      <button type="button" class="btn-remove-item" onclick="removeListItem(this)">✕</button>
    </div>
    <div style="display:flex;gap:0.5rem;width:100%">
      <input class="form-input" placeholder="URL" value="${escHtml(item.url || '')}" data-res-url style="flex:2">
      <input class="form-input" placeholder="Descripción breve" value="${escHtml(item.desc || '')}" data-res-desc style="flex:2">
    </div>`;
  return d;
}

// Collect dynamic list values
// Returns [{key, value}] — Firestore doesn't allow nested arrays
function collectReqs() {
  return [...document.querySelectorAll('#reqs-list .dynamic-item')].map(d => ({
    key:   d.querySelector('[data-req-key]').value.trim(),
    value: d.querySelector('[data-req-val]').value.trim(),
  })).filter(r => r.key);
}

function collectFlow() {
  return [...document.querySelectorAll('#flow-list .dynamic-item')].map(d => ({
    stage: d.querySelector('[data-flow-stage]').value.trim(),
    main:  d.querySelector('[data-flow-main]').value.trim(),
    sub:   d.querySelector('[data-flow-sub]').value.trim(),
  })).filter(f => f.stage);
}

function collectSteps() {
  return [...document.querySelectorAll('#steps-list .dynamic-item')].map(d => ({
    title:    d.querySelector('[data-step-title]').value.trim(),
    tag:      d.querySelector('[data-step-tag]').value.trim(),
    tagColor: d.querySelector('[data-step-tagcolor]').value,
    desc:     d.querySelector('[data-step-desc]').value.trim(),
  })).filter(s => s.title);
}

function collectResources() {
  return [...document.querySelectorAll('#resources-list .dynamic-item')].map(d => ({
    icon: d.querySelector('[data-res-icon]').value.trim(),
    name: d.querySelector('[data-res-name]').value.trim(),
    url:  d.querySelector('[data-res-url]').value.trim(),
    desc: d.querySelector('[data-res-desc]').value.trim(),
  })).filter(r => r.name);
}

// ── Save tool ─────────────────────────────────────────────────────────────────
document.getElementById('tool-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const code  = document.getElementById('f-code').value.trim();
  const title = document.getElementById('f-title').value.trim();
  const area  = document.getElementById('f-area').value;

  if (!code || !title || !area) {
    showToast('Código, título y área son requeridos', 'error');
    return;
  }

  const payload = {
    code,
    title,
    area,
    area2:   document.getElementById('f-area2').value || null,
    area3:   document.getElementById('f-area3').value || null,
    area4:   document.getElementById('f-area4')?.value || null,
    desc:    document.getElementById('f-desc').value.trim(),
    prompt:  document.getElementById('f-prompt').value.trim() || null,
    reqs:      collectReqs(),
    flow:      collectFlow(),
    steps:     collectSteps(),
    resources: collectResources(),
    costNotes: null,
  };

  const token = Auth.getToken();
  setLoading(true);

  try {
    const method = editingId ? 'PUT' : 'POST';
    const body   = editingId ? { id: editingId, ...payload } : payload;

    const res = await fetch(`${API_BASE}/save-tool`, {
      method,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }

    showToast(editingId ? 'Herramienta actualizada ✓' : 'Herramienta creada ✓');
    closeForm();
    await loadTools();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
});

// ── Delete tool ───────────────────────────────────────────────────────────────
function confirmDelete(id, title) {
  deletingId = id;
  document.getElementById('confirm-tool-title').textContent = title;
  document.getElementById('confirm-overlay').classList.add('open');
}

function cancelDelete() {
  deletingId = null;
  document.getElementById('confirm-overlay').classList.remove('open');
}

async function executeDelete() {
  if (!deletingId) return;
  const idToDelete = deletingId;
  const token = Auth.getToken();
  cancelDelete();
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/delete-tool?id=${idToDelete}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showToast('Herramienta eliminada ✓');
    await loadTools();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── AI Generator ─────────────────────────────────────────────────────────────
function openAiModal() {
  document.getElementById('ai-rawtext').value = '';
  document.getElementById('ai-input-error').style.display = 'none';
  document.getElementById('ai-input-state').style.display = '';
  document.getElementById('ai-loading-state').style.display = 'none';
  document.getElementById('ai-footer').style.display = '';
  document.getElementById('ai-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('ai-rawtext').focus(), 80);
}

function closeAiModal() {
  document.getElementById('ai-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

async function generateTool() {
  const rawText = document.getElementById('ai-rawtext').value.trim();
  const errEl   = document.getElementById('ai-input-error');

  if (!rawText) {
    errEl.textContent = 'Escribe o pega una descripción antes de generar.';
    errEl.style.display = '';
    return;
  }
  errEl.style.display = 'none';

  // Switch to loading state
  document.getElementById('ai-input-state').style.display = 'none';
  document.getElementById('ai-loading-state').style.display = '';
  document.getElementById('ai-footer').style.display = 'none';

  const token        = Auth.getToken();
  const existingCodes = tools.map(t => t.code).filter(Boolean);

  try {
    const res = await fetch(`${API_BASE}/generate-tool`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ rawText, existingCodes }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Error ${res.status}`);
    }

    // Success — close AI modal and pre-load the standard form
    closeAiModal();
    openForm(null, data.payload);
    showToast('Herramienta generada — revisa y confirma los campos ✓');

  } catch (err) {
    // Restore input state so the user can try again or edit manually
    document.getElementById('ai-loading-state').style.display = 'none';
    document.getElementById('ai-input-state').style.display = '';
    document.getElementById('ai-footer').style.display = '';
    errEl.textContent = `Error: ${err.message}. Puedes editar manualmente.`;
    errEl.style.display = '';
    showToast('Error al generar con IA: ' + err.message, 'error');
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeForm();
    cancelDelete();
    closeAiModal();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
init();
