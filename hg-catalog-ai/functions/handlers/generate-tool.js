// Cloud Function handler: generate-tool
// POST → { rawText, existingCodes[] }
// Verifies Firebase JWT, calls configured AI provider via native fetch, returns structured JSON.
//
// Env vars:
//   AI_PROVIDER   = openrouter | anthropic | openai | gemini  (optional — auto-detected)
//   AI_MODEL      = model name override                        (optional — defaults per provider)
//   OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
//   FIREBASE_SA_KEY, ALLOWED_ORIGIN

// ── Load .env for local dev ───────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
(function loadDotEnv() {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '../../.env'),
    path.join(__dirname, '../../../.env'),
  ];
  const envPath = candidates.find(p => fs.existsSync(p));
  if (!envPath) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val; // local .env siempre tiene prioridad sobre site env vars
  }
})();

// ── fetch con timeout explícito ───────────────────────────────────────────────
function fetchWithTimeout(url, options, ms = 9000) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal })
    .finally(() => clearTimeout(tid));
}

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore }                  = require('firebase-admin/firestore');
const { getAuth }                       = require('firebase-admin/auth');

function initFirebase() {
  if (getApps().length) return;
  const sa = JSON.parse(process.env.FIREBASE_SA_KEY);
  initializeApp({ credential: cert(sa) });
}

async function verifyFirebaseToken(token) {
  initFirebase();
  return getAuth().verifyIdToken(token);
}

// ── System prompt (plantilla — áreas se inyectan dinámicamente desde Firestore)
// Para agregar/editar áreas: usar el Admin Panel > Gestionar Áreas, no editar este archivo.
const SYSTEM_PROMPT_TEMPLATE = `Eres el asistente de catalogación de herramientas IA de Obras Hergon (HERGONSA), empresa peruana de construcción e infraestructura especializada en proyectos Obras por Impuestos (OxI) bajo Ley N°29230. Tono: técnico-formal, español peruano, orientado a profesionales de construcción. Nunca uses jerga genérica ("solución innovadora", "poderosa herramienta", "de última generación").

═══ REGLAS DE CAMPO ═══

TÍTULO — máx 8 palabras, sin artículo inicial, siglas en MAYÚSCULA (EETT, APU, MD, ET). Patrones obligatorios:
• Auditores:   "Auditor de [Objeto] [Alcance]"            → Auditor de Compatibilidad Múltiple — ET, APU & MD
• Generadores: "Generador Automático [Objeto]"            → Generador Automático de APU Estándar
• Asistentes:  "Asistente de [Función] — [Subtítulo]"     → Asistente de Licitaciones — OxI
• SaaS tercero: incluir nombre comercial                  → Inspector de Planos con InspectMind
Guión largo — solo para subtítulos.

DESCRIPCIÓN — 2-4 oraciones, 80-180 palabras:
• Oración 1: verbo activo en 3ª persona SIN gerundio al inicio (Genera / Detecta / Analiza / Conecta / Audita)
• Oración 2: cómo lo hace / qué procesa / qué produce, con nombres exactos de documentos (APU, EETT, MD, ET)
• Oración 3: marco normativo si aplica (OxI — Ley N°29230, Ley 29783, G.050, RNE)
• Oración 4 (opt): principio rector técnico como oración separada, ej: "Principio rector: las EETT prevalecen sobre el APU en caso de conflicto."

REQUISITOS — array {key, value}, orden FIJO SIEMPRE:
1. Herramienta          → "Claude Desktop (Modo Chat / Cowork)" o nombre del SaaS externo
2. Modelo               → versión EXACTA: "Claude Sonnet 4.6", "Claude Haiku 4.5", "Claude Opus 4.6"
                          Si tiene Pensamiento Extendido: "Claude Sonnet 4.6 + Pensamiento Extendido"
                          NUNCA "claude-sonnet" ni "Sonnet" sin número de versión
3. MCPs                 → lista con · como separador, o "No habilitado"
4. Proyecto Claude      → nombre exacto del proyecto, o "No habilitado" si es SaaS
5. Documentos del proyecto → archivos cargados en el proyecto, o "Sin documentos adicionales"
6. Input requerido      → formato exacto del input por sesión
7+. Campos adicionales  → especialidades, normativa, restricciones, límites según corresponda

Reglas de valor: sin punto final. Listas usan · como separador: "Estructuras · Arquitectura · IISS · IIEE".
Si no aplica: "No habilitado" o "Sin documentos adicionales" (nunca dejar vacío).

FLUJO — array {stage, main, sub}, 3-4 etapas. Etapas estándar: Input → Análisis/Procesamiento → Output.
• main: sustantivo de 2-4 palabras SIN verbo conjugado
  ✅ "APU en PDF"  ✅ "Extracción + Redacción"  ❌ "Claude extrae el APU"
• sub: usa · para listas de ítems paralelos, → para secuencias de pasos
  ✅ "Lotes de 50 partidas · Consulta MCP · Verificación por lote"
  ✅ "Lectura completa · 3 checkpoints · Clasificación de incompatibilidades"

PASOS — array {title, tag, tagColor, desc}. Orden típico para herramientas Claude Desktop:
[Requisito] Instalar Claude Desktop → [Configuración] Activar modo → [MCP] Configurar MCP (uno por MCP)
→ [Proyecto] Acceder/crear proyecto → [Prompt] Copiar system prompt → [Input·orange] Preparar input
→ [Uso] Ejecutar → [Resultado] Revisar → [Avanzado] Casos opcionales

Tags válidos y tagColor:
  tagColor null (default): Requisito, Configuración, MCP, Proyecto, Prompt, Uso, Resultado, Avanzado, Aprobación, Acceso
  tagColor "orange":       Input, Costo

Descripción del step: 1-2 oraciones, imperativo o descripción directa. Incluir comandos, rutas o acciones exactas cuando corresponda.

CÓDIGO — patrón [PREFIJO]-[NNN] con ceros a la izquierda. Prefijos por área:
{{AREA_PREFIXES}}
El número siguiente se determina leyendo existingCodes[].

RECURSOS — {icon, name, url, desc}.
• Solo URLs proporcionadas por el usuario — NO inventar URLs.
• icon: emoji representativo del tipo de recurso
• name: nombre exacto de la plataforma, sin abreviaciones
• desc: 1 frase corta que explica para qué sirve ese link en el contexto de la tool
Si el usuario no proporciona URLs, devolver resources: [].

═══ RESTRICCIONES ABSOLUTAS ═══
• Responde SOLO con JSON válido. Sin markdown, sin bloques de código, sin explicaciones previas ni posteriores.
• No usar área "todas". Si falta info para un campo, campo = null.
• No inventar URLs en resources. Si no hay URLs → resources: [].
• No empezar desc con gerundio.
• No usar "Sonnet", "Haiku" u "Opus" sin número de versión exacto.
• costNotes: null salvo que el usuario proporcione info de costos.

═══ SCHEMA JSON EXACTO ═══
{
  "code":      "string (patrón PREFIJO-NNN)",
  "title":     "string",
  "area":      "string — una de las áreas válidas",
  "area2":     "string o null",
  "area3":     "string o null",
  "area4":     "string o null",
  "desc":      "string",
  "prompt":    "string o null",
  "reqs":      [{"key":"string","value":"string"}],
  "flow":      [{"stage":"string","main":"string","sub":"string"}],
  "steps":     [{"title":"string","tag":"string","tagColor":"orange|null","desc":"string"}],
  "resources": [{"icon":"emoji","name":"string","url":"string","desc":"string"}],
  "costNotes": "string o null"
}
Áreas válidas: {{VALID_AREAS}}.

═══ EJEMPLOS DE ESTILO (reqs + flow) ═══

Ejemplo A — Claude Desktop con MCPs, herramienta GP:
{
  "reqs": [
    {"key":"Herramienta","value":"Claude Desktop (Modo Cowork)"},
    {"key":"Modelo","value":"Claude Sonnet 4.6 + Pensamiento Extendido"},
    {"key":"MCPs","value":"filesystem · fetch"},
    {"key":"Proyecto Claude","value":"Gestión OxI — Costos"},
    {"key":"Documentos del proyecto","value":"Plantilla APU Hergon · Tarifario vigente"},
    {"key":"Input requerido","value":"APU en PDF por sesión"}
  ],
  "flow": [
    {"stage":"1","main":"APU en PDF","sub":"Carga del archivo · Validación de formato · Lectura de partidas"},
    {"stage":"2","main":"Análisis de Partidas","sub":"Lotes de 50 partidas · Consulta tarifario · Verificación por lote"},
    {"stage":"3","main":"Informe de Diferencias","sub":"Tabla comparativa → Resumen ejecutivo → Recomendaciones"}
  ]
}

Ejemplo B — SaaS externo sin MCPs, herramienta IM:
{
  "reqs": [
    {"key":"Herramienta","value":"InspectMind (plataforma web)"},
    {"key":"Modelo","value":"InspectMind AI — modelo interno"},
    {"key":"MCPs","value":"No habilitado"},
    {"key":"Proyecto Claude","value":"No habilitado"},
    {"key":"Documentos del proyecto","value":"Sin documentos adicionales"},
    {"key":"Input requerido","value":"Planos en PDF · Especificaciones técnicas por sesión"}
  ],
  "flow": [
    {"stage":"1","main":"Planos en PDF","sub":"Carga de archivos · Selección de especialidades"},
    {"stage":"2","main":"Detección Automática","sub":"Lectura completa · 3 checkpoints · Clasificación de incompatibilidades"},
    {"stage":"3","main":"Reporte de Interferencias","sub":"Lista priorizada → PDF exportable → Trazabilidad por elemento"}
  ]
}`;

// ── Build system prompt with areas from Firestore ─────────────────────────────
async function buildSystemPrompt() {
  initFirebase();
  const db = getFirestore();
  let areas = [];
  try {
    const snap = await db.collection('areas').orderBy('order').get();
    areas = snap.docs.map(d => d.data());
  } catch {
    // Fallback hardcodeado si Firestore no responde
    areas = [
      { key: 'gestión de proyectos', label: 'Gestión Proyectos', codePrefix: 'GP' },
      { key: 'costos',               label: 'Costos',            codePrefix: 'CO' },
      { key: 'bim',                  label: 'BIM',               codePrefix: 'BIM' },
      { key: 'arquitectura',         label: 'Arquitectura',      codePrefix: 'IM' },
      { key: 'ssoma',                label: 'SSOMA',             codePrefix: 'SSOMA' },
      { key: 'gestión obra',         label: 'Gestión Obra',      codePrefix: 'GO' },
      { key: 'rrhh',                 label: 'RRHH',              codePrefix: 'RH' },
      { key: 'administración',       label: 'Administración',    codePrefix: 'ADM' },
      { key: 'compras',              label: 'Compras',           codePrefix: 'COM' },
      { key: 'coordinación',         label: 'Coordinación',      codePrefix: 'COORD' },
    ];
  }

  const areaPrefixes = areas
    .filter(a => a.codePrefix)
    .map(a => `${a.codePrefix}=${a.label}`)
    .join(' · ');

  const validAreas = areas.map(a => a.key).join(', ');

  return SYSTEM_PROMPT_TEMPLATE
    .replace('{{AREA_PREFIXES}}', areaPrefixes)
    .replace('{{VALID_AREAS}}', validAreas);
}

// ── Provider auto-detection ───────────────────────────────────────────────────
function autoDetectProvider() {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY)  return 'anthropic';
  if (process.env.OPENAI_API_KEY)     return 'openai';
  if (process.env.GEMINI_API_KEY)     return 'gemini';
  return null;
}

// ── Provider implementations (native fetch, no SDKs) ─────────────────────────

async function callOpenRouter(systemPrompt, userPrompt) {
  const model = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';
  const res = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  process.env.ALLOWED_ORIGIN || 'https://hergon-catalog-ai.web.app',
      'X-Title':       'HG Catalog AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(systemPrompt, userPrompt) {
  const model  = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system:   systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(systemPrompt, userPrompt) {
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(systemPrompt, userPrompt) {
  const model  = process.env.AI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetchWithTimeout(url, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-goog-api-key':  apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig:   { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
async function callAI(systemPrompt, userPrompt) {
  const provider = (process.env.AI_PROVIDER || autoDetectProvider() || '').toLowerCase();
  switch (provider) {
    case 'openrouter': return callOpenRouter(systemPrompt, userPrompt);
    case 'anthropic':  return callAnthropic(systemPrompt, userPrompt);
    case 'openai':     return callOpenAI(systemPrompt, userPrompt);
    case 'gemini':     return callGemini(systemPrompt, userPrompt);
    default:
      throw new Error(
        'No AI provider configured. Set AI_PROVIDER (openrouter|anthropic|openai|gemini) ' +
        'and the corresponding API key in environment variables.'
      );
  }
}

// ── JSON parser & validator ───────────────────────────────────────────────────
function parseAIResponse(text) {
  let clean = text.trim();
  // Strip markdown code fences if the model added them despite instructions
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const parsed = JSON.parse(clean);

  if (!parsed.code || !parsed.title || !parsed.area) {
    throw new Error('AI response is missing required fields: code, title, area');
  }

  // Normalize optional arrays so the frontend never receives null
  parsed.reqs      = Array.isArray(parsed.reqs)      ? parsed.reqs      : [];
  parsed.flow      = Array.isArray(parsed.flow)       ? parsed.flow      : [];
  parsed.steps     = Array.isArray(parsed.steps)      ? parsed.steps     : [];
  parsed.resources = Array.isArray(parsed.resources)  ? parsed.resources : [];

  return parsed;
}

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://hergon-catalog-ai.web.app';
  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':           'Origin',
    'Content-Type':   'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Auth
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing token' }) };
  }
  try {
    await verifyFirebaseToken(token);
  } catch {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { rawText, existingCodes = [], additionalContext = '' } = body;
  if (!rawText?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'rawText is required' }) };
  }

  // ── Build user prompt
  const codesInfo     = existingCodes.length
    ? `\nCódigos ya existentes: ${existingCodes.join(', ')}\n`
    : '';
  const contextBlock  = additionalContext?.trim()
    ? `\nContexto adicional del administrador:\n${additionalContext.trim()}\n`
    : '';
  const userPrompt = `${codesInfo}${contextBlock}\nDescripción de la herramienta:\n---\n${rawText.trim()}`;

  // ── Build system prompt with live areas from Firestore
  const systemPrompt = await buildSystemPrompt();

  // ── Call AI + parse
  try {
    const aiText  = await callAI(systemPrompt, userPrompt);
    const payload = parseAIResponse(aiText);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, payload }) };
  } catch (err) {
    console.error('[generate-tool] error:', err.message);
    const isParseError = err instanceof SyntaxError || err.message.includes('missing required');
    return {
      statusCode: isParseError ? 422 : 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
