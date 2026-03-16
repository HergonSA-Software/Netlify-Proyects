// Netlify Function: generate-tool
// POST → { rawText, existingCodes[] }
// Verifies Firebase JWT, calls configured AI provider via native fetch, returns structured JSON.
//
// Env vars (Netlify dashboard):
//   AI_PROVIDER   = openrouter | anthropic | openai | gemini  (optional — auto-detected)
//   AI_MODEL      = model name override                        (optional — defaults per provider)
//   OPENROUTER_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
//   FIREBASE_SA_KEY, URL

// ── Load .env for local dev (Netlify CLI doesn't always inject all vars into functions) ──
const fs   = require('fs');
const path = require('path');
(function loadDotEnv() {
  // En Lambda compat mode (esbuild), __dirname apunta a un dir temporal.
  // process.cwd() es siempre el directorio raíz del proyecto en netlify dev.
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

const { initializeApp, cert, getApps } = require('firebase-admin/app');
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

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un asistente que estructura herramientas IA para el catálogo de Obras Hergon.
Dado un texto libre, extrae y genera un JSON con este schema exacto:
{
  "code":      "string — patrón AREA-NNN, ej: GP-008",
  "title":     "string",
  "area":      "string — una de las áreas válidas",
  "area2":     "string o null",
  "area3":     "string o null",
  "area4":     "string o null",
  "desc":      "string — descripción completa",
  "prompt":    "string o null — system prompt si aplica",
  "reqs":      [{"key": "string", "value": "string"}],
  "flow":      [{"stage": "string", "main": "string", "sub": "string"}],
  "steps":     [{"title": "string", "tag": "string", "tagColor": "orange|null", "desc": "string"}],
  "resources": [{"icon": "emoji", "name": "string", "url": "string", "desc": "string"}],
  "costNotes": "string o null"
}
Áreas válidas: gestión de proyectos, costos, bim, arquitectura, ssoma, gestión obra, rrhh, administración, compras, coordinación.
El código sigue el patrón de los códigos existentes que se proporcionan (GP-001→GP-008 implica que el siguiente es GP-009).
Responde SOLO con el JSON. Sin markdown, sin bloques de código, sin explicaciones.`;

// ── Provider auto-detection ───────────────────────────────────────────────────
function autoDetectProvider() {
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY)  return 'anthropic';
  if (process.env.OPENAI_API_KEY)     return 'openai';
  if (process.env.GEMINI_API_KEY)     return 'gemini';
  return null;
}

// ── Provider implementations (native fetch, no SDKs) ─────────────────────────

async function callOpenRouter(userPrompt) {
  const model = process.env.AI_MODEL || 'anthropic/claude-haiku-4-5';
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  process.env.URL || 'https://hergon-catalogo-ia.netlify.app',
      'X-Title':       'HG Catalog AI',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callAnthropic(userPrompt) {
  const model  = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system:   SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content[0].text;
}

async function callOpenAI(userPrompt) {
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGemini(userPrompt) {
  const model  = process.env.AI_MODEL || 'gemini-2.5-flash';
  const apiKey = process.env.GEMINI_API_KEY;
  const url   = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':    'application/json',
      'x-goog-api-key':  apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents:           [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig:   { temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
async function callAI(userPrompt) {
  const provider = (process.env.AI_PROVIDER || autoDetectProvider() || '').toLowerCase();
  switch (provider) {
    case 'openrouter': return callOpenRouter(userPrompt);
    case 'anthropic':  return callAnthropic(userPrompt);
    case 'openai':     return callOpenAI(userPrompt);
    case 'gemini':     return callGemini(userPrompt);
    default:
      throw new Error(
        'No AI provider configured. Set AI_PROVIDER (openrouter|anthropic|openai|gemini) ' +
        'and the corresponding API key in Netlify environment variables.'
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
  const allowedOrigin = process.env.URL || 'https://hergon-catalogo-ia.netlify.app';
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

  const { rawText, existingCodes = [] } = body;
  if (!rawText?.trim()) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'rawText is required' }) };
  }

  // ── Build user prompt
  const codesInfo  = existingCodes.length
    ? `\nCódigos ya existentes: ${existingCodes.join(', ')}\n`
    : '';
  const userPrompt = `${codesInfo}\nDescripción de la herramienta:\n---\n${rawText.trim()}`;

  // ── Call AI + parse
  try {
    const aiText  = await callAI(userPrompt);
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
