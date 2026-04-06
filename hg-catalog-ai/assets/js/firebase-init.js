// Firestore REST API helper — no SDK needed, public reads work without API key
const FIRESTORE_BASE = 'https://firestore.googleapis.com/v1/projects/hergon-catalog-ai/databases/(default)/documents';

// Convert a Firestore REST value object → plain JS value
function fsValueToJs(val) {
  if (val.stringValue  !== undefined) return val.stringValue;
  if (val.integerValue !== undefined) return parseInt(val.integerValue, 10);
  if (val.doubleValue  !== undefined) return val.doubleValue;
  if (val.booleanValue !== undefined) return val.booleanValue;
  if (val.nullValue    !== undefined) return null;
  if (val.timestampValue !== undefined) return val.timestampValue;
  if (val.arrayValue)  return (val.arrayValue.values || []).map(fsValueToJs);
  if (val.mapValue) {
    const obj = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      obj[k] = fsValueToJs(v);
    }
    return obj;
  }
  return null;
}

// Convert a Firestore REST document → plain JS object
function fsDocToObj(doc) {
  const id = doc.name.split('/').pop();
  const obj = { id };
  for (const [key, val] of Object.entries(doc.fields || {})) {
    obj[key] = fsValueToJs(val);
  }
  return obj;
}

// Fetch all tools from Firestore (public read) — paginado automático
async function fetchAllTools() {
  const MAX_PAGES = 20;  // techo de seguridad: máx 2000 tools
  const PAGE_SIZE = 100;
  let all         = [];
  let pageToken   = null;
  let page        = 0;

  while (page < MAX_PAGES) {
    const params = new URLSearchParams({ pageSize: PAGE_SIZE, orderBy: 'code' });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(`${FIRESTORE_BASE}/tools?${params}`);
    if (!res.ok) throw new Error(`Firestore fetch failed: ${res.status}`);

    const data = await res.json();
    const docs  = (data.documents || []).map(fsDocToObj);
    all.push(...docs);

    if (!data.nextPageToken || docs.length < PAGE_SIZE) break;
    pageToken = data.nextPageToken;
    page++;
  }

  return all;
}

// Fetch single tool by Firestore document ID
async function fetchTool(id) {
  const url = `${FIRESTORE_BASE}/tools/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tool fetch failed: ${res.status}`);
  const doc = await res.json();
  return fsDocToObj(doc);
}
