# Catálogo IA - Obras Hergon

Catálogo interno de herramientas de IA para Obras Hergon.

## Qué incluye

- Vista pública del catálogo en `index.html`
- Panel de administración en `admin/index.html`
- Funciones serverless para guardar, eliminar, generar con IA y chat (`netlify/functions`)

## Arquitectura

- Frontend: HTML/CSS/JS estático
- Base de datos: Firestore (colección `tools`)
- Backend: Netlify Functions
- Auth admin: Firebase Auth + validación JWT en funciones protegidas

## URLs

- Viewer (público): [https://hergon-catalogo-ia.netlify.app](https://hergon-catalogo-ia.netlify.app)
- Admin: [https://hergon-catalogo-ia.netlify.app/admin](https://hergon-catalogo-ia.netlify.app/admin)
- Netlify dashboard: [https://app.netlify.com/projects/hergon-catalogo-ia](https://app.netlify.com/projects/hergon-catalogo-ia)

## Funcionalidades principales

- Gestión de herramientas desde Admin (crear/editar/eliminar)
- Generación de fichas con IA (`generate-tool`)
- Chatbot asistente de solo lectura (`chat-tool`)
- Filtrado client-side para enviar contexto relevante al chatbot

## Estructura del proyecto

```text
hg-catalog-ai/
├── index.html
├── admin/
│   └── index.html
├── assets/
│   ├── css/
│   │   ├── variables.css
│   │   ├── layout.css
│   │   ├── cards.css
│   │   ├── modal.css
│   │   └── chat.css
│   └── js/
│       ├── env.js
│       ├── firebase-init.js
│       ├── auth.js
│       ├── catalog.js
│       ├── admin.js
│       └── chat.js
├── netlify/
│   └── functions/
│       ├── save-tool.js
│       ├── delete-tool.js
│       ├── generate-tool.js
│       └── chat-tool.js
├── .env.example
├── netlify.toml
└── package.json
```

## Variables de entorno

Usa `.env.example` como base.

Variables principales:

- `FIREBASE_API_KEY`
- `FIREBASE_SA_KEY`
- `AI_PROVIDER` (`gemini | openai | anthropic | openrouter`)
- `GEMINI_API_KEY` (o la API key del proveedor elegido)
- `AI_MODEL` (opcional)

## Desarrollo local

Requisitos:

- Node.js 18+
- Netlify CLI

Pasos:

1. Instalar dependencias:
   - `npm install`
2. Crear `.env` a partir de `.env.example`
3. Levantar entorno local:
   - `netlify dev`
4. Abrir en navegador:
   - [http://localhost:8888](http://localhost:8888)

## Seguridad

- No subir `.env` ni secretos al repositorio
- No documentar credenciales de usuarios en el README
- Las escrituras en Firestore deben pasar por funciones con validación de token
- El chatbot es solo lectura y no ejecuta operaciones de escritura