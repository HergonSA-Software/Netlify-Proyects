/**
 * seed-firestore.js
 * Migra las 10 herramientas del array original a Firestore (proyecto: hergon-catalog-ai)
 *
 * Uso:
 *   cd "C:\Users\ASUS\Archivos Proyectos\dev proyects\hg_catalog"
 *   node scripts/seed-firestore.js
 *
 * Requiere: npm install firebase-admin (en esta carpeta)
 */

const fs   = require('fs');
const path = require('path');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ── Init Firebase Admin ───────────────────────────────────────────────────────
const saKeyPath = path.join(
  'C:', 'Users', 'ASUS', 'Documents', 'claude-mcp-workspace', 'keys', 'hergon-catalog-ai-sa.json'
);

initializeApp({ credential: cert(require(saKeyPath)) });
const db = getFirestore();

// ── Load tools from extracted JS files ───────────────────────────────────────
const promptsCode = fs.readFileSync(path.join(__dirname, 'prompts-data.js'), 'utf8');
const toolsCode   = fs.readFileSync(path.join(__dirname, 'tools-data.js'),   'utf8');

// Use Function constructor to evaluate the data files and return tools
// (const/let aren't accessible via vm sandbox, but are accessible here via return)
const combined = promptsCode + '\n' + toolsCode + '\nreturn tools;';
const getTools = new Function(combined);
const tools = getTools();

if (!Array.isArray(tools)) {
  console.error('❌ Could not parse tools array');
  process.exit(1);
}

console.log(`\n📋 Found ${tools.length} tools to seed...\n`);

// ── Seed each tool ────────────────────────────────────────────────────────────
async function seed() {
  const batch = db.batch();
  let count = 0;

  for (const t of tools) {
    const docRef = db.collection('tools').doc(); // auto-generate ID

    // Clean undefined/null values and ensure all required fields
    const doc = {
      code:      t.code       || '',
      title:     t.title      || '',
      area:      t.area       || '',
      area2:     t.area2      || null,
      area3:     t.area3      || null,
      area4:     t.area4      || null,
      desc:      t.desc       || '',
      prompt:    t.prompt     || null,
      reqs:      (t.reqs      || []).map(r => Array.isArray(r) ? { key: r[0]||'', value: r[1]||'' } : r),
      flow:      (t.flow      || []).map(f => ({
        stage: f.stage || '', main: f.main || '', sub: f.sub || ''
      })),
      steps:     (t.steps     || []).map(s => ({
        title: s.title || '', tag: s.tag || '', tagColor: s.tagColor || '', desc: s.desc || ''
      })),
      resources: (t.resources || []).map(r => ({
        icon: r.icon || '', name: r.name || '', desc: r.desc || '', url: r.url || ''
      })),
      costNotes: t.costNotes ? {
        intro:   t.costNotes.intro   || '',
        warning: t.costNotes.warning || '',
        table: {
          headers: t.costNotes.table?.headers || [],
          rows: (t.costNotes.table?.rows || []).map(r =>
            // Convert array rows to named map to avoid nested arrays
            ({ c0: r[0]||'', c1: r[1]||'', c2: r[2]||'', c3: r[3]||'' })
          ),
        },
      } : null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    batch.set(docRef, doc);
    console.log(`  ✓ ${t.code} — ${t.title}`);
    count++;
  }

  await batch.commit();
  console.log(`\n✅ Seeded ${count} tools to Firestore successfully!\n`);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
