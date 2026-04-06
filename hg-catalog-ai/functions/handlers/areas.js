// Cloud Function handler: areas
// GET    → list all areas (public)
// POST   → create area  (auth required) body: { key, label, icon, color, codePrefix, keywords[], order }
// PUT    → update area  (auth required) body: { id, ...fields }
// DELETE → delete area  (auth required) query: ?id=docId

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
    process.env[key] = val;
  }
})();

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue }      = require('firebase-admin/firestore');
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

// ── Seed data: las 10 áreas originales del catálogo ──────────────────────────
const SEED_AREAS = [
  {
    key: 'gestión de proyectos', label: 'Gestión Proyectos', icon: '📋',
    color: '#2563eb', codePrefix: 'GP', order: 1,
    keywords: ['gestión de proyectos','gestión proyectos','gestion proyectos','oxi','obra por impuesto','obras por impuesto','proyecto'],
  },
  {
    key: 'costos', label: 'Costos', icon: '💰',
    color: '#d97706', codePrefix: 'CO', order: 2,
    keywords: ['costo','costos','presupuesto','apu','metrado','expediente','valorizacion','valorización'],
  },
  {
    key: 'bim', label: 'BIM', icon: '🧊',
    color: '#7c3aed', codePrefix: 'BIM', order: 3,
    keywords: ['bim','revit','modelo bim','navisworks','ifc'],
  },
  {
    key: 'arquitectura', label: 'Arquitectura', icon: '🏛️',
    color: '#0891b2', codePrefix: 'IM', order: 4,
    keywords: ['arquitectura','plano','inspectmind','diseño'],
  },
  {
    key: 'ssoma', label: 'SSOMA', icon: '🦺',
    color: '#dc2626', codePrefix: 'SSOMA', order: 5,
    keywords: ['ssoma','seguridad','salud ocupacional','riesgo','accidente','epp','petar','ats'],
  },
  {
    key: 'gestión obra', label: 'Gestión Obra', icon: '🏗️',
    color: '#7e5bef', codePrefix: 'GO', order: 6,
    keywords: ['gestión obra','gestion obra','campo','construcción','construccion','obra'],
  },
  {
    key: 'rrhh', label: 'RRHH', icon: '👥',
    color: '#059669', codePrefix: 'RH', order: 7,
    keywords: ['rrhh','recursos humanos','personal','trabajador','planilla','contrato'],
  },
  {
    key: 'administración', label: 'Administración', icon: '📁',
    color: '#64748b', codePrefix: 'ADM', order: 8,
    keywords: ['administración','administracion','administrativo','oficina'],
  },
  {
    key: 'compras', label: 'Compras', icon: '🛒',
    color: '#e11d48', codePrefix: 'COM', order: 9,
    keywords: ['compras','adquisición','adquisicion','proveedor','logística','logistica','cotización'],
  },
  {
    key: 'coordinación', label: 'Coordinación', icon: '🔗',
    color: '#0f766e', codePrefix: 'COORD', order: 10,
    keywords: ['coordinación','coordinacion','coordinar','interdisciplinario'],
  },
];

// ── Handler ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://hergon-catalog-ai.web.app';
  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Vary':         'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    initFirebase();
  } catch (fbErr) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase init error: ' + fbErr.message }) };
  }

  const db = getFirestore();

  // ── GET: list all areas (public, no auth) ───────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const snap = await db.collection('areas').orderBy('order').get();
      let areas = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      // Auto-seed on first run (empty collection)
      if (areas.length === 0) {
        const batch = db.batch();
        for (const area of SEED_AREAS) {
          const ref = db.collection('areas').doc();
          batch.set(ref, { ...area, createdAt: FieldValue.serverTimestamp() });
        }
        await batch.commit();
        const snap2 = await db.collection('areas').orderBy('order').get();
        areas = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      return { statusCode: 200, headers, body: JSON.stringify({ areas }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── Mutaciones requieren token admin ────────────────────────────────────────
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

  // ── POST: create area ───────────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { key, label, icon = '🔧', color = '#64748b', codePrefix = '', keywords = [], order = 99 } = body;
    if (!key || !label) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'key y label son requeridos' }) };
    }

    const existing = await db.collection('areas').where('key', '==', key.trim().toLowerCase()).limit(1).get();
    if (!existing.empty) {
      return { statusCode: 409, headers, body: JSON.stringify({ error: 'El área ya existe', id: existing.docs[0].id }) };
    }

    try {
      const ref = db.collection('areas').doc();
      await ref.set({
        key: key.trim().toLowerCase(),
        label: label.trim(),
        icon,
        color,
        codePrefix: codePrefix.trim().toUpperCase(),
        keywords: Array.isArray(keywords) ? keywords : [],
        order: Number(order) || 99,
        createdAt: FieldValue.serverTimestamp(),
      });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, id: ref.id }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── PUT: update area ────────────────────────────────────────────────────────
  if (event.httpMethod === 'PUT') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { id, ...fields } = body;
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id es requerido' }) };

    const data = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
    if (data.keywords && !Array.isArray(data.keywords)) {
      data.keywords = String(data.keywords).split(',').map(k => k.trim()).filter(Boolean);
    }

    try {
      await db.collection('areas').doc(id).update({ ...data, updatedAt: FieldValue.serverTimestamp() });
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  // ── DELETE: remove area ─────────────────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id query param requerido' }) };

    try {
      await db.collection('areas').doc(id).delete();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
