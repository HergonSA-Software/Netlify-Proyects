// Cloud Function handler: save-tool
// POST  → create new tool
// PUT   → update existing tool (body must include { id: "docId", ...fields })
// Verifies Firebase ID token, then writes to Firestore via Admin SDK

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
  const decoded = await getAuth().verifyIdToken(token);
  return decoded;
}

exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://hergon-catalog-ai.web.app';
  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PUT') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing token' }) };
  }

  try {
    await verifyFirebaseToken(token);
  } catch (verifyErr) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  try {
    initFirebase();
  } catch (fbInitErr) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase init error: ' + fbInitErr.message }) };
  }
  const db = getFirestore();

  try {
    const { id, ...fields } = body;

    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined)
    );

    let docRef;
    if (event.httpMethod === 'PUT' && id) {
      docRef = db.collection('tools').doc(id);
      await docRef.update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    } else {
      docRef = db.collection('tools').doc();
      await docRef.set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, id: docRef.id }),
    };
  } catch (err) {
    console.error('Firestore write error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
