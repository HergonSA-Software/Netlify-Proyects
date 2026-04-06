// Cloud Function handler: delete-tool
// DELETE /api/delete-tool?id={docId}
// Verifies Firebase ID token, then deletes document from Firestore

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
  const decoded = await getAuth().verifyIdToken(token);
  return decoded;
}

exports.handler = async (event) => {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://hergon-catalog-ai.web.app';
  const headers = {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing token' }) };
  }

  try {
    await verifyFirebaseToken(token);
  } catch (e) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing document id' }) };
  }

  try { initFirebase(); } catch(e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Firebase init: ' + e.message }) };
  }
  const db = getFirestore();

  try {
    await db.collection('tools').doc(id).delete();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, id }),
    };
  } catch (err) {
    console.error('Firestore delete error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
