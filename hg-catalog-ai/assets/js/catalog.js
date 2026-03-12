// ── Catalog viewer logic ──────────────────────────────────────────────────────

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
  'todas':                '#1e4d9b',
};

function areaLabel(a) {
  const map = {
    'gestión de proyectos': 'Gestión Proyectos',
    'bim': 'BIM', 'arquitectura': 'Arquitectura',
    'costos': 'Costos', 'rrhh': 'RRHH',
    'administración': 'Administración', 'compras': 'Compras',
    'coordinación': 'Coordinación',
    'ssoma': 'SSOMA', 'gestión obra': 'Gestión Obra',
    'todas': 'Todas las áreas',
  };
  return map[a] || a;
}

// ── State ──────────────────────────────────────────────────────────────────
let allTools  = [];
let activeArea = 'todas';
let currentPromptText = '';

// ── Counts ──────────────────────────────────────────────────────────────────
function countByArea(area) {
  if (area === 'todas') return allTools.length;
  return allTools.filter(t =>
    t.area === area || t.area2 === area ||
    t.area3 === area || t.area4 === area
  ).length;
}

function updateCounts() {
  const ids = {
    'todas':                 'cnt-todas',
    'gestión de proyectos':  'cnt-gestion',
    'administración':        'cnt-admin',
    'compras':               'cnt-compras',
    'costos':                'cnt-costos',
    'bim':                   'cnt-bim',
    'arquitectura':          'cnt-arq',
    'coordinación':          'cnt-coord',
    'ssoma':                 'cnt-ssoma',
    'gestión obra':          'cnt-gobra',
    'rrhh':                  'cnt-rrhh',
  };
  for (const [area, id] of Object.entries(ids)) {
    const el = document.getElementById(id);
    if (el) el.textContent = countByArea(area);
  }
}

// ── Grid ────────────────────────────────────────────────────────────────────
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
    const color = AREA_COLORS[t.area] || '#1e4d9b';
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

// ── Modal ───────────────────────────────────────────────────────────────────
function openModal(idx) {
  const t = allTools[idx];
  const color = AREA_COLORS[t.area] || '#1e4d9b';
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
      <div class="m-flow-stage">${f.stage}</div>
      <div class="m-flow-main">${f.main}</div>
      <div class="m-flow-sub">${f.sub}</div>
    </div>`).join('');

  document.getElementById('m-steps').innerHTML = (t.steps || []).map((s, i) => {
    const tagHtml = s.tag
      ? `<span class="install-tag${s.tagColor === 'orange' ? ' orange' : ''}">${s.tag}</span>`
      : '';
    return `<div class="install-step">
      <div class="install-num">${i + 1}</div>
      <div class="install-content">
        <div class="install-title">${s.title}${tagHtml}</div>
        <div class="install-desc">${s.desc}</div>
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
      // Preserve all columns (including empty) to keep table alignment intact
      const cells = Array.isArray(r) ? r : [r.c0||'', r.c1||'', r.c2||'', r.c3||''];
      return `<tr>${cells.map((cell, ci) =>
        `<td>${ci === 2 ? `<span class="badge-cost">${cell}</span>` : cell}</td>`
      ).join('')}</tr>`;
    }).join('');
    document.getElementById('m-costnotes').innerHTML = `
      <p class="cost-intro">${cn.intro || ''}</p>
      <table class="cost-table">
        <thead><tr>${(cn.table?.headers || []).map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${cn.warning ? `<div class="cost-warning">⚠️ ${cn.warning}</div>` : ''}`;
  } else {
    costSection.style.display = 'none';
  }

  document.getElementById('m-resources').innerHTML = (t.resources || []).map(r =>
    `<a class="resource-item" href="${r.url}" target="_blank" rel="noopener">
      <div class="resource-icon">${r.icon}</div>
      <div class="resource-info">
        <div class="resource-name">${r.name}</div>
        <div class="resource-url">${r.url}</div>
      </div>
      <div class="resource-arrow">↗</div>
    </a>`).join('');

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
      // Fallback for non-HTTPS or permissions denied
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

// ── Mobile sidebar ───────────────────────────────────────────────────────────
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

// ── Init: load tools from Firestore ──────────────────────────────────────────
(async () => {
  renderSkeletons(6);
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
