# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nomenclador oficial de calles y barrios de Comodoro Rivadavia — Municipalidad de Comodoro Rivadavia (DDPC). Public URL: `http://167.86.71.102:3006`, future: `https://nomenclador.mcrmodernizacion.gob.ar`.

## Commands

```bash
npm run dev          # development (nodemon, auto-restart)
npm start            # production
npm run init-admin   # create/reset admin user in DB
npm run seed         # load initial CSV data (3142 calles + 80 barrios)
```

No test runner is configured. Manual testing against a running MariaDB instance is required.

## Architecture

Single Express app (`server.js`, port 3006) serving three faces:

- **Cara pública (`/`)** — `public/index.html` + `public/js/public.js` + `public/css/public.css`. Vanilla JS, no frameworks. Search with 300ms debounce, "Cargar más" pagination (50/page).
- **API pública (`/api/public/*`)** — `routes/public.routes.js`. No auth, CORS open, rate-limited via `config/rateLimits.js`.
- **Panel admin (`/admin`)** — `public/admin/*.html` + `public/js/admin/`. JWT auth required. Replicates the SIR pattern: list + detail side-by-side layout.

**Route mounting order is critical** in `server.js`: `/api/calles/importar` and `/api/barrios/importar` must be mounted _before_ `/api/calles` and `/api/barrios` to prevent `/:id` capturing the import paths.

## Stack

- **Backend:** Node.js ≥20 + Express 4
- **DB:** MariaDB via `mysql2/promise` pool (`config/database.js`)
- **Auth:** JWT (`jsonwebtoken`) + bcrypt. Tokens stored in `localStorage` as `nomenclador_token`, `nomenclador_usuario`, `nomenclador_permisos`
- **Frontend:** Vanilla HTML/CSS/JS — no bundler, no framework. Inter font (Google Fonts), Lucide Icons (inline SVG), SheetJS `xlsx-0.20.1` via CDN for XLSX export
- **Security:** `helmet` (CSP disabled — inline styles/scripts used), `compression`

## Database

DB name: `nomenclador`. Schema in `data/seed.sql`. Two main data tables:

- **`calles`** — `id_calle` (auto), `orden_carga` (INT, nullable for rutas), `nombre_calle`, `observacion_calle`, `activo` (soft delete). Unique key on `(orden_carga, activo)` — MariaDB allows multiple NULLs, so rutas don't conflict.
- **`barrios`** — `id_barrio` (NOT autoincremental — preserved from CSV), `zona_barrio` ENUM(`Norte`,`Sur`,`Sin zona`), `nombre_barrio`, `ordenanza_barrio`, `resolucion_barrio`, `observaciones_barrio`, `activo`.
- Auth tables: `usuarios`, `modulos`, `permisos_usuarios` (replicated from SIR).

Search uses `LIKE %texto%` — MariaDB's `utf8mb4_unicode_ci` collation handles case-insensitivity and tilde normalization natively (no extra columns or triggers needed).

Rutas (roads without a street number) have `orden_carga = NULL`. List ordering: calles with OC first (ASC), then rutas alphabetically.

## CSV Import Flow

3-step flow: upload → preview → confirm. Frontend parses CSV (handling UTF-8 BOM: `charCodeAt(0) === 0xFEFF`), sends JSON to backend. Backend classifies rows as `nuevos / actualizar / sinCambios / eliminados / duplicadosCSV / errores` and returns preview. User confirms, backend applies in a transaction. Result includes downloadable XLSX report (SheetJS).

Before touching import code, read `_reference/sir/routes/importarCalles.routes.js` and `_reference/sir/public/js/importacion/calles-importar.js` — the logic is dense and well-tested; adapt, don't reinvent.

Key import rules:
- **Calles:** ignore `id_calle` column from CSV; match on `orden_carga`; `nombre_calle` required.
- **Barrios:** preserve `id_barrio` from CSV as PK; `id_barrio` + `nombre_barrio` required; `zona_barrio` must be valid enum value; `"No posee"` values → store as `NULL`.

## Code Conventions

- All comments and variable names **in Spanish**, following SIR style.
- Log prefixes: `✓` success, `✗` error, `→` action.
- `_reference/sir/` — full SIR codebase for reference (excluded from git). Consult it before implementing auth, import, or admin UI patterns.
- Design tokens: primary color `#0F6E56` (verde teal institucional), `border-radius: 8px` general / `12px` cards, `border: 0.5px solid rgba(0,0,0,0.1)`.
- Normalization for comparison: strip accents via `normalize('NFD')`, uppercase, collapse whitespace.
- Title Case applied when saving to DB (except codes like `ordenanza_barrio` / `resolucion_barrio`).

## Environment Variables

Copy `.env.example` to `.env`. Required: `DB_*`, `JWT_SECRET`, `PORT` (default 3006). See `.env.example` for full list.

## Deployment

VPS via pm2. See `docs/DEPLOY.md`. Health check: `GET /api/health`.

## Pending Work

See `instrucciones.md` for active tasks (frontend redesign + fix copy buttons). `MOCKUP-PUBLICO.html` is the visual reference for the public face.
