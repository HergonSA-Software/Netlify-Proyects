# Catálogo IA — Obras Hergon

Catálogo interno de herramientas de Inteligencia Artificial para Obras Hergon.

## Arquitectura

```
JAMstack: HTML estático + Firebase Firestore + Supabase Auth + Netlify Functions
```

## URLs

- **Viewer (público):** https://hergon-catalogo-ia.netlify.app
- **Admin:** https://hergon-catalogo-ia.netlify.app/admin
- **Netlify dashboard:** https://app.netlify.com/projects/hergon-catalogo-ia

## Credenciales Admin

- **Email:** admin@hergon.pe
- **Password:** Hergon2026!

## Estructura de archivos

```
hg_catalog/
├── index.html                   ← Viewer público
├── admin/
│   └── index.html               ← Panel admin
├── assets/
│   ├── css/                     ← Estilos separados por módulo
│   └── js/
│       ├── firebase-init.js     ← Firestore REST API helper
│       ├── supabase-init.js     ← Supabase Auth client
│       ├── catalog.js           ← Lógica del viewer
│       └── admin.js             ← Lógica del panel admin
├── netlify/
│   └── functions/
│       ├── save-tool.js         ← POST/PUT herramientas
│       └── delete-tool.js       ← DELETE herramientas
├── scripts/
│   └── seed-firestore.js        ← Migración inicial de datos
├── netlify.toml
└── package.json
```

## Agregar una nueva herramienta

1. Ingresar a https://hergon-catalogo-ia.netlify.app/admin
2. Login con las credenciales admin
3. Click en **+ Nueva Herramienta**
4. Completar todos los campos del formulario
5. Click en **Guardar Herramienta**

La herramienta aparece inmediatamente en el catálogo público.

## Variables de entorno (Netlify)

| Variable | Descripción |
|---|---|
| `FIREBASE_SA_KEY` | Service Account JSON de Firebase (proyectoshergon) |
| `SUPABASE_URL` | URL del proyecto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key de Supabase |

## Base de datos (Firestore)

- **Proyecto:** `proyectoshergon`
- **Colección:** `tools`
- **Reglas:** Lectura pública, escritura solo via Admin SDK (Netlify Functions)
