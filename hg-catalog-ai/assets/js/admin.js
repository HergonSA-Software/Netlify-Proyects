// ── Admin panel logic ─────────────────────────────────────────────────────────

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions';

let tools     = [];
let areasData = [];
let editingId = null;
let deletingId = null;

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
}

// ── Loading ───────────────────────────────────────────────────────────────────
function setLoading(on) {
  document.getElementById('loading-overlay').classList.toggle('open', on);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const session = Auth.init();
  if (!session) {
    showView('login');
    return;
  }
  showView('admin');
  await loadAreas();
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
    await loadAreas();
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
  areasData = [];
  showView('login');
}

// ── Load areas ────────────────────────────────────────────────────────────────
async function loadAreas() {
  try {
    const res = await fetch(`${API_BASE}/areas`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    areasData = data.areas || [];
    buildAreaSelects();
    renderAreasTable();
    const countEl = document.getElementById('admin-area-count');
    if (countEl) countEl.textContent = `${areasData.length} área${areasData.length !== 1 ? 's' : ''}`;
  } catch (err) {
    showToast('Error cargando áreas: ' + err.message, 'error');
  }
}

// ── Build area <select> options ───────────────────────────────────────────────
function buildAreaSelects() {
  const selectIds = ['f-area', 'f-area2', 'f-area3', 'f-area4'];
  selectIds.forEach((id, idx) => {
    const sel = document.getElementById(id);
    if (!sel) return;

    // Preserve current value before rebuild
    const current = sel.value;

    sel.innerHTML = idx === 0
      ? '<option value="">Seleccionar área…</option>'
      : '<option value="">— ninguna —</option>';

    areasData.forEach(area => {
      const opt = document.createElement('option');
      opt.value       = area.key;
      opt.textContent = area.label;
      sel.appendChild(opt);
    });

    // Restore value if it still exists
    if (current) sel.value = current;
  });
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
    const areaObj = areasData.find(a => a.key === t.area);
    const color = areaObj ? areaObj.color : '#64748b';
    const label = areaObj ? areaObj.label : t.area;
    return `<tr>
      <td><span class="tool-code-badge">${escHtml(t.code)}</span></td>
      <td style="font-weight:600;max-width:220px">${escHtml(t.title)}</td>
      <td><span class="area-pill" style="background:${color}">${escHtml(label)}</span></td>
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
function openForm(id = null, payload = null) {
  editingId = id;
  const t = payload || (id ? tools.find(x => x.id === id) : null);
  const isAiGenerated = !!payload && !id;

  document.getElementById('form-modal-title').textContent =
    isAiGenerated ? '✨ Revisar Herramienta Generada' : (id ? 'Editar Herramienta' : 'Nueva Herramienta');

  setVal('f-code',   t?.code   || '');
  setVal('f-title',  t?.title  || '');
  setVal('f-area',   t?.area   || '');
  setVal('f-area2',  t?.area2  || '');
  setVal('f-area3',  t?.area3  || '');
  setVal('f-area4',  t?.area4  || '');
  setVal('f-desc',   t?.desc   || '');
  setVal('f-prompt', t?.prompt || '');

  renderDynamicList('reqs-list',      t?.reqs      || [], renderReqItem);
  renderDynamicList('flow-list',      t?.flow      || [], renderFlowItem);
  renderDynamicList('steps-list',     t?.steps     || [], renderStepItem);
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

// ── AI Generator ──────────────────────────────────────────────────────────────
function openAiModal() {
  document.getElementById('ai-rawtext').value = '';
  document.getElementById('ai-context').value = '';
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
  const rawText           = document.getElementById('ai-rawtext').value.trim();
  const additionalContext = document.getElementById('ai-context')?.value?.trim() || '';
  const errEl             = document.getElementById('ai-input-error');

  if (!rawText) {
    errEl.textContent = 'Escribe o pega una descripción antes de generar.';
    errEl.style.display = '';
    return;
  }
  errEl.style.display = 'none';

  document.getElementById('ai-input-state').style.display = 'none';
  document.getElementById('ai-loading-state').style.display = '';
  document.getElementById('ai-footer').style.display = 'none';

  const token         = Auth.getToken();
  const existingCodes = tools.map(t => t.code).filter(Boolean);

  try {
    const res = await fetch(`${API_BASE}/generate-tool`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ rawText, existingCodes, additionalContext }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    closeAiModal();
    openForm(null, data.payload);
    showToast('Herramienta generada — revisa y confirma los campos ✓');
  } catch (err) {
    document.getElementById('ai-loading-state').style.display = 'none';
    document.getElementById('ai-input-state').style.display = '';
    document.getElementById('ai-footer').style.display = '';
    errEl.textContent = `Error: ${err.message}. Puedes editar manualmente.`;
    errEl.style.display = '';
    showToast('Error al generar con IA: ' + err.message, 'error');
  }
}

// ── Areas management ──────────────────────────────────────────────────────────
let editingAreaId   = null;
let deletingAreaId  = null;

function renderAreasTable() {
  const tbody = document.getElementById('areas-tbody');
  if (!tbody) return;
  if (areasData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:1.5rem;color:var(--muted)">Sin áreas registradas.</td></tr>`;
    return;
  }
  tbody.innerHTML = areasData.map(a => `
    <tr>
      <td style="font-size:1.3rem;text-align:center">${escHtml(a.icon || '🔧')}</td>
      <td style="font-size:0.78rem;color:var(--muted)">${escHtml(a.key)}</td>
      <td style="font-weight:600">${escHtml(a.label)}</td>
      <td><span style="display:inline-block;width:18px;height:18px;border-radius:4px;background:${escHtml(a.color || '#64748b')};vertical-align:middle"></span> <code style="font-size:0.72rem">${escHtml(a.color || '')}</code></td>
      <td><code style="font-size:0.78rem">${escHtml(a.codePrefix || '—')}</code></td>
      <td style="text-align:center">${a.order ?? '—'}</td>
      <td>
        <div class="table-actions">
          <button class="btn-icon" onclick="openAreaForm('${a.id}')">✏️</button>
          <button class="btn-danger" onclick="confirmAreaDelete('${a.id}','${escHtml(a.label)}')">🗑️</button>
        </div>
      </td>
    </tr>`).join('');
}

function openAreaForm(id = null) {
  editingAreaId = id;
  const a = id ? areasData.find(x => x.id === id) : null;

  document.getElementById('area-form-title').textContent = id ? 'Editar Área' : 'Nueva Área';
  setVal('fa-key',      a?.key        || '');
  setVal('fa-label',    a?.label      || '');
  setVal('fa-icon',     a?.icon       || '🔧');
  setVal('fa-color',    a?.color      || '#64748b');
  setVal('fa-prefix',   a?.codePrefix || '');
  setVal('fa-keywords', (a?.keywords || []).join(', '));
  setVal('fa-order',    a?.order      ?? 99);

  const keyInput = document.getElementById('fa-key');
  if (keyInput) keyInput.readOnly = !!id; // key is immutable once created

  document.getElementById('area-form-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAreaForm() {
  document.getElementById('area-form-overlay').classList.remove('open');
  document.body.style.overflow = '';
  editingAreaId = null;
}

document.getElementById('area-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const key      = document.getElementById('fa-key').value.trim().toLowerCase();
  const label    = document.getElementById('fa-label').value.trim();
  const icon     = document.getElementById('fa-icon').value.trim() || '🔧';
  const color    = document.getElementById('fa-color').value.trim() || '#64748b';
  const prefix   = document.getElementById('fa-prefix').value.trim().toUpperCase();
  const kwRaw    = document.getElementById('fa-keywords').value.trim();
  const keywords = kwRaw ? kwRaw.split(',').map(k => k.trim()).filter(Boolean) : [];
  const order    = parseInt(document.getElementById('fa-order').value, 10) || 99;

  if (!key || !label) {
    showToast('Clave y nombre son requeridos', 'error');
    return;
  }

  const token = Auth.getToken();
  setLoading(true);

  try {
    let res;
    if (editingAreaId) {
      res = await fetch(`${API_BASE}/areas`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ id: editingAreaId, label, icon, color, codePrefix: prefix, keywords, order }),
      });
    } else {
      res = await fetch(`${API_BASE}/areas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ key, label, icon, color, codePrefix: prefix, keywords, order }),
      });
    }

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error al guardar área');
    }

    showToast(editingAreaId ? 'Área actualizada ✓' : 'Área creada ✓');
    closeAreaForm();
    await loadAreas();
    buildAreaSelects();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
});

function confirmAreaDelete(id, label) {
  deletingAreaId = id;
  document.getElementById('confirm-area-label').textContent = label;
  document.getElementById('area-confirm-overlay').classList.add('open');
}

function cancelAreaDelete() {
  deletingAreaId = null;
  document.getElementById('area-confirm-overlay').classList.remove('open');
}

async function executeAreaDelete() {
  if (!deletingAreaId) return;
  const id    = deletingAreaId;
  const token = Auth.getToken();
  cancelAreaDelete();
  setLoading(true);
  try {
    const res = await fetch(`${API_BASE}/areas?id=${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Delete failed');
    }
    showToast('Área eliminada ✓');
    await loadAreas();
    buildAreaSelects();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeForm();
    cancelDelete();
    closeAiModal();
    closeAreaForm();
    cancelAreaDelete();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
init();
