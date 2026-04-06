// ── Catalog viewer logic ──────────────────────────────────────────────────────

const CATALOG_API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8888/.netlify/functions'
  : '/.netlify/functions';

// ── Sanitización HTML — previene XSS al insertar datos de Firestore en el DOM ─
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── State ─────────────────────────────────────────────────────────────────────
let areasData  = [];        // loaded from Firestore via /areas
let allTools   = [];
let activeArea = 'todas';
let currentPromptText = '';

// Exposed on window so chat.js can build AREA_KEYWORDS without a second fetch
window.areasData = areasData;

// ── Area helpers ──────────────────────────────────────────────────────────────
function getAreaColor(key) {
  if (key === 'todas') return '#1e4d9b';
  const a = areasData.find(x => x.key === key);
  return a ? a.color : '#64748b';
}

function areaLabel(key) {
  if (key === 'todas') return 'Todas las áreas';
  const a = areasData.find(x => x.key === key);
  return a ? a.label : key;
}

// ── Build sidebar dynamically ─────────────────────────────────────────────────
function buildSidebar() {
  const container = document.getElementById('area-list');
  if (!container) return;

  container.innerHTML = '';

  // "Todas" button
  const todaBtn = document.createElement('button');
  todaBtn.className = `area-btn${activeArea === 'todas' ? ' active' : ''}`;
  todaBtn.dataset.area = 'todas';
  todaBtn.onclick = () => setArea('todas');
  todaBtn.innerHTML = `
    <div class="area-icon">🗂️</div>
    <span class="area-name">Todas</span>
    <span class="area-count" id="cnt-todas">0</span>`;
  container.appendChild(todaBtn);

  const hr = document.createElement('hr');
  hr.className = 'area-divider';
  container.appendChild(hr);

  // One button per area
  areasData.forEach(area => {
    const btn = document.createElement('button');
    btn.className = `area-btn${activeArea === area.key ? ' active' : ''}`;
    btn.dataset.area = area.key;
    btn.onclick = () => setArea(area.key);
    btn.innerHTML = `
      <div class="area-icon">${area.icon || '🔧'}</div>
      <span class="area-name">${area.label}</span>
      <span class="area-count" id="cnt-area-${area.id}">0</span>`;
    container.appendChild(btn);
  });
}

// ── Counts ────────────────────────────────────────────────────────────────────
function countByArea(area) {
  if (area === 'todas') return allTools.length;
  return allTools.filter(t =>
    t.area === area || t.area2 === area ||
    t.area3 === area || t.area4 === area
  ).length;
}

function updateCounts() {
  const totalEl = document.getElementById('cnt-todas');
  if (totalEl) totalEl.textContent = allTools.length;

  areasData.forEach(area => {
    const el = document.getElementById(`cnt-area-${area.id}`);
    if (el) el.textContent = countByArea(area.key);
  });
}

// ── Grid ──────────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid = document.getElementById('tool-grid');
  const filtered = activeArea === 'todas'
    ? allTools
    : allTools.filter(t =>
        t.area === activeArea || t.area2 === activeArea ||
        t.area3 === activeArea || t.area4 === activeArea
      );

  document.getElementById('topbar-area').textContent = areaLabel(activeArea).toUpperCase();
  document.getElementById('topbar-count').textContent =
    filtered.length + (filtered.length === 1 ? ' herramienta' : ' herramientas');

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔧</div>
        <div class="empty-state-title">Sin herramientas registradas</div>
        <div class="empty-state-sub">Próximamente se agregarán herramientas para esta área.</div>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map((t) => {
    const idx   = allTools.indexOf(t);
    const color = getAreaColor(t.area);
    const allAreas = [t.area, t.area2, t.area3, t.area4].filter(Boolean);
    const tagsHtml = allAreas.map((a, ai) =>
      `<span class="card-tag ${ai === 0 ? 'primary' : 'secondary'}">${areaLabel(a)}</span>`
    ).join('');
    const shortDesc = t.desc && t.desc.length > 90 ? t.desc.substring(0, 87) + '…' : (t.desc || '');
    return `
    <div class="tool-card" onclick="openModal(${idx})" style="--card-accent:${color}" role="button" tabindex="0"
         onkeydown="if(event.key==='Enter')openModal(${idx})">
      <div class="calc-screen">
        <div class="calc-code">${t.code}</div>
        <div class="calc-title">${t.title}</div>
      </div>
      <div class="card-body">
        <div class="card-desc">${shortDesc}</div>
        <div class="card-tags">${tagsHtml}</div>
      </div>
    </div>`;
  }).join('');
}

function renderSkeletons(n = 6) {
  const grid = document.getElementById('tool-grid');
  grid.innerHTML = Array(n).fill('<div class="card-skeleton"></div>').join('');
}

function setArea(area) {
  activeArea = area;
  document.querySelectorAll('.area-btn').forEach(b => {
    b.classList.remove('active');
    if (b.dataset.area === area) b.classList.add('active');
  });
  renderGrid();
  if (window.innerWidth <= 600) closeSidebar();
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(idx) {
  const t = allTools[idx];
  const color = getAreaColor(t.area);
  currentPromptText = t.prompt || '';

  const modal = document.getElementById('modal');
  modal.scrollTop = 0;

  const pt = document.getElementById('m-prompt');
  if (pt) pt.classList.remove('expanded');
  const eb = document.getElementById('expand-btn');
  if (eb) eb.textContent = '⤢ Expandir';

  document.getElementById('m-code').textContent  = t.code;
  document.getElementById('m-area').textContent  = areaLabel(t.area).toUpperCase();
  document.getElementById('m-title').textContent = t.title;
  document.getElementById('m-desc').textContent  = t.desc;

  document.getElementById('m-reqs').innerHTML = (t.reqs || []).map(r => {
    const k = Array.isArray(r) ? r[0] : (r.key   || '');
    const v = Array.isArray(r) ? r[1] : (r.value || '');
    return `<tr><td>${k}</td><td>${v}</td></tr>`;
  }).join('');

  document.getElementById('m-flow').innerHTML = (t.flow || []).map(f =>
    `<div class="m-flow-cell">
      <div class="m-flow-stage">${escHtml(f.stage)}</div>
      <div class="m-flow-main">${escHtml(f.main)}</div>
      <div class="m-flow-sub">${escHtml(f.sub)}</div>
    </div>`).join('');

  document.getElementById('m-steps').innerHTML = (t.steps || []).map((s, i) => {
    const tagHtml = s.tag
      ? `<span class="install-tag${s.tagColor === 'orange' ? ' orange' : ''}">${escHtml(s.tag)}</span>`
      : '';
    return `<div class="install-step">
      <div class="install-num">${i + 1}</div>
      <div class="install-content">
        <div class="install-title">${escHtml(s.title)}${tagHtml}</div>
        <div class="install-desc">${escHtml(s.desc)}</div>
      </div>
    </div>`;
  }).join('');

  const promptSection = document.getElementById('m-prompt-section');
  if (t.prompt) {
    promptSection.style.display = '';
    document.getElementById('m-prompt').textContent = t.prompt;
    const cb = document.getElementById('copy-btn');
    cb.classList.remove('copied');
    document.getElementById('copy-label').textContent = 'Copiar';
    document.getElementById('copy-icon').textContent  = '⎘';
  } else {
    promptSection.style.display = 'none';
  }

  const costSection = document.getElementById('m-costnotes-section');
  if (t.costNotes) {
    costSection.style.display = '';
    const cn = t.costNotes;
    const rows = (cn.table?.rows || []).map(r => {
      const cells = Array.isArray(r) ? r : [r.c0||'', r.c1||'', r.c2||'', r.c3||''];
      return `<tr>${cells.map((cell, ci) =>
        `<td>${ci === 2 ? `<span class="badge-cost">${cell}</span>` : cell}</td>`
      ).join('')}</tr>`;
    }).join('');
    document.getElementById('m-costnotes').innerHTML = `
      <p class="cost-intro">${escHtml(cn.intro || '')}</p>
      <table class="cost-table">
        <thead><tr>${(cn.table?.headers || []).map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${cn.warning ? `<div class="cost-warning">⚠️ ${escHtml(cn.warning)}</div>` : ''}`;
  } else {
    costSection.style.display = 'none';
  }

  document.getElementById('m-resources').innerHTML = (t.resources || []).map(r => {
    const safeUrl = /^https?:\/\//i.test(r.url) ? r.url : '#';
    return `<a class="resource-item" href="${escHtml(safeUrl)}" target="_blank" rel="noopener">
      <div class="resource-icon">${escHtml(r.icon)}</div>
      <div class="resource-info">
        <div class="resource-name">${escHtml(r.name)}</div>
        <div class="resource-url">${escHtml(safeUrl)}</div>
      </div>
      <div class="resource-arrow">↗</div>
    </a>`;
  }).join('');

  document.getElementById('modal-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModalDirect();
}

function closeModalDirect() {
  document.getElementById('modal-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

function copyPrompt() {
  if (!currentPromptText) return;
  const applySuccess = () => {
    const btn = document.getElementById('copy-btn');
    const lbl = document.getElementById('copy-label');
    const ico = document.getElementById('copy-icon');
    btn.classList.add('copied');
    lbl.textContent = 'Copiado';
    ico.textContent = '✓';
    setTimeout(() => {
      btn.classList.remove('copied');
      lbl.textContent = 'Copiar';
      ico.textContent = '⎘';
    }, 2500);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(currentPromptText).then(applySuccess).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = currentPromptText;
      ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      applySuccess();
    });
  } else {
    const ta = document.createElement('textarea');
    ta.value = currentPromptText;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    applySuccess();
  }
}

function toggleExpand() {
  const pt = document.getElementById('m-prompt');
  const eb = document.getElementById('expand-btn');
  if (pt.classList.toggle('expanded')) {
    eb.textContent = '⤡ Contraer';
  } else {
    eb.textContent = '⤢ Expandir';
  }
}

// ── Mobile sidebar ────────────────────────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('open');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModalDirect();
});

// ── Init: load areas then tools ───────────────────────────────────────────────
(async () => {
  renderSkeletons(6);

  // 1. Load areas from Firestore (fast, small payload)
  try {
    const res = await fetch(`${CATALOG_API_BASE}/areas`);
    if (res.ok) {
      const data = await res.json();
      areasData.push(...(data.areas || []));
      window.areasData = areasData; // refresh reference for chat.js
    }
  } catch (err) {
    console.warn('No se pudieron cargar las áreas:', err.message);
  }

  buildSidebar();

  // 2. Load tools
  try {
    allTools = await fetchAllTools();
  } catch (err) {
    console.error('Error loading tools:', err);
    document.getElementById('tool-grid').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Error al cargar herramientas</div>
        <div class="empty-state-sub">${err.message}</div>
      </div>`;
    return;
  }

  updateCounts();
  renderGrid();
})();
