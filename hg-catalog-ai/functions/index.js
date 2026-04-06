// Cloud Functions gen 2 — HG Catalog AI
// Adaptador Lambda→Express: envuelve los handlers de netlify/functions/
// sin reescribir su lógica de negocio.

const { onRequest }       = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const express              = require('express');
const rateLimit            = require('express-rate-limit');

setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

// ── Handlers (lógica de negocio sin modificar) ────────────────────────────────
const areasHandler        = require('./handlers/areas').handler;
const chatToolHandler     = require('./handlers/chat-tool').handler;
const generateToolHandler = require('./handlers/generate-tool').handler;
const saveToolHandler     = require('./handlers/save-tool').handler;
const deleteToolHandler   = require('./handlers/delete-tool').handler;

// ── Adaptador: req/res Express → event Lambda-style → llama handler → res ─────
// Los handlers existentes usan { httpMethod, headers, queryStringParameters, body }
// y devuelven { statusCode, headers, body }.
function wrap(handler) {
  return async (req, res) => {
    const event = {
      httpMethod:            req.method,
      headers:               req.headers,
      queryStringParameters: req.query || {},
      // rawBody es un Buffer provisto por Firebase Functions; los handlers
      // hacen JSON.parse(event.body) internamente, así que se pasa como string.
      body: req.rawBody ? req.rawBody.toString('utf8') : null,
    };
    try {
      const result = await handler(event);
      Object.entries(result.headers || {}).forEach(([k, v]) => res.set(k, v));
      res.status(result.statusCode).send(result.body);
    } catch (err) {
      console.error('[wrap] unhandled error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// ── Rate limiter para /api/chat-tool (10 req/min/IP, igual que netlify.toml) ──
const chatLimiter = rateLimit({
  windowMs:     60 * 1000,
  max:          10,
  keyGenerator: (req) => req.ip,
  handler:      (_req, res) =>
    res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' }),
});

// ── Router Express ────────────────────────────────────────────────────────────
const app = express();

// Firebase Functions ya parsea JSON y expone req.rawBody; no usar express.json()
// para no interferir con rawBody que el adaptador necesita.

app.all('/api/areas',         wrap(areasHandler));
app.post('/api/chat-tool',    chatLimiter, wrap(chatToolHandler));
app.options('/api/chat-tool', wrap(chatToolHandler));
app.all('/api/generate-tool', wrap(generateToolHandler));
app.all('/api/save-tool',     wrap(saveToolHandler));
app.all('/api/delete-tool',   wrap(deleteToolHandler));

// ── Exportar como única Cloud Function HTTP ───────────────────────────────────
exports.api = onRequest(app);
