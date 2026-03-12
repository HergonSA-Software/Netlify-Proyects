/**
 * Genera assets/js/env.js con las variables de entorno del cliente.
 * Se ejecuta en build (Netlify) y localmente antes de `netlify dev`.
 *
 * Uso local:  node scripts/generate-env.js
 * Uso build:  incluido en el comando de build de netlify.toml
 */

const fs   = require('fs');
const path = require('path');

// Leer .env manualmente para uso local (sin dependencias extra)
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || '';

if (!FIREBASE_API_KEY) {
  console.warn('[generate-env] ADVERTENCIA: FIREBASE_API_KEY no encontrada — env.js generado vacío');
}

const output = `// Auto-generado por scripts/generate-env.js — NO editar manualmente
window._env_ = {
  FIREBASE_API_KEY: '${FIREBASE_API_KEY}'
};
`;

const outPath = path.join(__dirname, '../assets/js/env.js');
fs.writeFileSync(outPath, output, 'utf8');
console.log('[generate-env] assets/js/env.js generado correctamente');
