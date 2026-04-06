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

- Viewer (público): [https://hergon-catalog-ai.web.app](https://hergon-catalog-ai.web.app)
- Admin: [https://hergon-catalog-ai.web.app/admin](https://hergon-catalog-ai.web.app/admin)
- Firebase console: [https://console.firebase.google.com/project/hergon-catalog-ai](https://console.firebase.google.com/project/hergon-catalog-ai)

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
- Firebase CLI (`npm install -g firebase-tools`)

Pasos:

1. Instalar dependencias del proyecto raíz y de las functions:
   ```bash
   npm install
   cd functions && npm install && cd ..
   ```
2. Crear `.env` a partir de `.env.example` (para `generate-env.js`)
3. Crear `functions/.env` a partir de `functions/.env.example` (para las Cloud Functions)
4. Levantar el emulador local:
   ```bash
   npm run dev
   ```
5. Abrir en navegador:
   - Catálogo público: [http://localhost:5000](http://localhost:5000)
   - Admin: [http://localhost:5000/admin](http://localhost:5000/admin)
   - Emulator UI: [http://localhost:4000](http://localhost:4000)

## Seguridad

- No subir `.env` ni secretos al repositorio
- No documentar credenciales de usuarios en el README
- Las escrituras en Firestore deben pasar por funciones con validación de token
- El chatbot es solo lectura y no ejecuta operaciones de escritura