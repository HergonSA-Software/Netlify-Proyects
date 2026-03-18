// ── Chatbot widget logic ──────────────────────────────────────────────────────
// Depends on: allTools (global, populated by catalog.js before this script loads)

(function ChatWidget() {
  // ── State ──────────────────────────────────────────────────────────────────
  let chatOpen    = false;
  let chatHistory = []; // [{role:'user'|'assistant', content:string}]
  let isLoading   = false;

  const API_BASE = window.location.hostname === 'localhost'
    ? 'http://localhost:8888/.netlify/functions'
    : '/.netlify/functions';

  // ── Injection patterns (client-side guardrail) ─────────────────────────────
  const INJECTION_PATTERNS = [
    /ignore\s+.*(instructions?|previous)/i,
    /system\s+prompt/i,
    /you\s+are\s+now/i,
    /forget\s+(everything|all)/i,
    /developer\s+mode/i,
    /pretend\s+(you\s+are|to\s+be)/i,
    /reveal\s+.*(prompt|instructions?)/i,
    /olvida\s+(todo|tus\s+instrucciones?)/i,
    /ahora\s+eres/i,
    /nuevo\s+rol/i,
    /act\s+as/i,
    /jailbreak/i,
    /DAN\s+mode/i,
  ];

  // ── Area keyword map for priority-2 filtering ─────────────────────────────
  const AREA_KEYWORDS = {
    'gestión de proyectos': ['gestión de proyectos', 'gestión proyectos', 'gestion proyectos', 'oxi', 'obra por impuesto', 'obras por impuesto', 'proyecto'],
    'costos':               ['costo', 'costos', 'presupuesto', 'apu', 'metrado', 'expediente', 'valorizacion', 'valorización'],
    'bim':                  ['bim', 'revit', 'modelo bim', 'navisworks', 'ifc'],
    'arquitectura':         ['arquitectura', 'plano', 'inspectmind', 'diseño'],
    'ssoma':                ['ssoma', 'seguridad', 'salud ocupacional', 'riesgo', 'accidente', 'epp', 'petar', 'ats'],
    'gestión obra':         ['gestión obra', 'gestion obra', 'campo', 'construcción', 'construccion', 'obra'],
    'rrhh':                 ['rrhh', 'recursos humanos', 'personal', 'trabajador', 'planilla', 'contrato'],
    'administración':       ['administración', 'administracion', 'administrativo', 'oficina'],
    'compras':              ['compras', 'adquisición', 'adquisicion', 'proveedor', 'logística', 'logistica', 'cotización'],
    'coordinación':         ['coordinación', 'coordinacion', 'coordinar', 'interdisciplinario'],
  };

  // ── Tool filtering — 4-priority strategy ──────────────────────────────────
  // 'allTools' is declared with `let` in catalog.js — it lives in script scope
  // but NOT on window, so we reference it directly as a global let.
  function getRelevantTools(query) {
    /* global allTools */
    const tools = (typeof allTools !== 'undefined') ? allTools : [];
    if (!tools || tools.length === 0) return [];

    const q = query.toLowerCase().trim();

    // Priority 1: exact code match (e.g. user typed "GP-003")
    const byCode = tools.filter(t => t.code && q.includes(t.code.toLowerCase()));
    if (byCode.length) return byCode.slice(0, 3);

    // Priority 2: area keyword match → return full tools of that area (max 5)
    for (const [area, keywords] of Object.entries(AREA_KEYWORDS)) {
      if (keywords.some(kw => q.includes(kw))) {
        const byArea = tools.filter(t =>
          t.area === area || t.area2 === area || t.area3 === area || t.area4 === area
        );
        if (byArea.length) return byArea.slice(0, 5);
      }
    }

    // Priority 3: keyword frequency score (handles 100+ tools correctly)
    const keywords = q.split(/\s+/).filter(w => w.length > 3);
    if (keywords.length > 0) {
      const scored = tools
        .map(t => {
          const haystack = `${t.title} ${t.desc} ${t.area}`.toLowerCase();
          const score = keywords.reduce(
            (acc, kw) => acc + (haystack.split(kw).length - 1),
            0
          );
          return { tool: t, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(x => x.tool);
      if (scored.length) return scored;
    }

    // Priority 4: fallback — light index of all tools
    // Sends only {code, title, area, desc[0:80]} so Gemini can still orient itself
    // without sending the full payload (~10KB for 100 tools — manageable)
    return tools.map(t => ({
      code:  t.code,
      title: t.title,
      area:  t.area,
      desc:  (t.desc || '').slice(0, 80),
    }));
  }

  // ── Input guardrail ────────────────────────────────────────────────────────
  function isInjectionAttempt(text) {
    return INJECTION_PATTERNS.some(p => p.test(text));
  }

  // ── DOM helpers ────────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }

  // Safe markdown renderer — escapes HTML first, then applies patterns.
  // Supports: **bold**, *italic*, `code`, URLs as links, leading - lists.
  function renderMarkdown(text) {
    // 1. Escape HTML to prevent XSS
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    return escaped
      // URLs → clickable links (open in new tab, rel noopener)
      .replace(
        /(https?:\/\/[^\s<>"]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="chat-link">$1</a>'
      )
      // **bold**
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // *italic*
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // `inline code`
      .replace(/`([^`]+)`/g, '<code class="chat-code">$1</code>')
      // Leading dash lists: "- item" → <li> wrapped in <ul>
      .replace(/^((?:- .+\n?)+)/gm, (block) => {
        const items = block
          .split('\n')
          .filter(l => l.startsWith('- '))
          .map(l => `<li>${l.slice(2)}</li>`)
          .join('');
        return `<ul class="chat-list">${items}</ul>`;
      })
      // Double newlines → paragraph breaks
      .replace(/\n{2,}/g, '</p><p>')
      // Single newlines → <br>
      .replace(/\n/g, '<br>');
  }

  function appendMessage(role, content) {
    const body = el('chat-body');
    if (!body) return;
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg--${role}`;
    if (role === 'assistant') {
      div.innerHTML = `<p>${renderMarkdown(content)}</p>`;
    } else {
      // User messages: plain text only (no need to render markdown)
      div.textContent = content;
    }
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  function setTypingIndicator(show) {
    const existing = el('chat-typing');
    if (show && !existing) {
      const div = document.createElement('div');
      div.id        = 'chat-typing';
      div.className = 'chat-msg chat-msg--assistant chat-msg--typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      el('chat-body').appendChild(div);
      el('chat-body').scrollTop = el('chat-body').scrollHeight;
    } else if (!show && existing) {
      existing.remove();
    }
  }

  function setInputDisabled(disabled) {
    const input = el('chat-input');
    const btn   = el('chat-send');
    if (input) input.disabled = disabled;
    if (btn)   btn.disabled   = disabled;
  }

  // ── Panel open / close ─────────────────────────────────────────────────────
  function openChat() {
    chatOpen = true;
    el('chat-panel').classList.add('open');
    el('chat-fab').setAttribute('aria-expanded', 'true');
    setTimeout(() => el('chat-input')?.focus(), 100);
  }

  function closeChat() {
    chatOpen = false;
    el('chat-panel').classList.remove('open');
    el('chat-fab').setAttribute('aria-expanded', 'false');
  }

  function toggleChat() {
    chatOpen ? closeChat() : openChat();
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage() {
    if (isLoading) return;
    const input = el('chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = '';

    // Client-side injection guard
    if (isInjectionAttempt(text)) {
      appendMessage('user', text);
      appendMessage('assistant', 'Solo puedo ayudarte con las herramientas del catálogo Hergon.');
      return;
    }

    appendMessage('user', text);
    isLoading = true;
    setInputDisabled(true);
    setTypingIndicator(true);

    const relevantTools  = getRelevantTools(text);
    const historyToSend  = chatHistory.slice(-6);

    try {
      const res  = await fetch(`${API_BASE}/chat-tool`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: historyToSend, relevantTools }),
      });

      const data = await res.json();
      setTypingIndicator(false);

      const reply = res.ok
        ? (data.reply || 'Sin respuesta del asistente.')
        : 'Error al procesar tu consulta. Intenta de nuevo.';

      appendMessage('assistant', reply);

      // Update in-memory history (cap at 12 entries = 6 turns)
      chatHistory.push({ role: 'user',      content: text  });
      chatHistory.push({ role: 'assistant', content: reply });
      if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    } catch {
      setTypingIndicator(false);
      appendMessage('assistant', 'Error de conexión. Verifica tu internet e intenta de nuevo.');
    } finally {
      isLoading = false;
      setInputDisabled(false);
      el('chat-input')?.focus();
    }
  }

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  function autoResizeInput(textarea) {
    textarea.style.height = '';
    textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    const fab   = el('chat-fab');
    const panel = el('chat-panel');
    const send  = el('chat-send');
    const input = el('chat-input');
    const close = el('chat-close');

    if (!fab || !panel) return; // widget not present in DOM

    fab.addEventListener('click', toggleChat);

    if (close) close.addEventListener('click', closeChat);

    if (send) send.addEventListener('click', sendMessage);

    if (input) {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      input.addEventListener('input', () => autoResizeInput(input));
    }

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && chatOpen) closeChat();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
