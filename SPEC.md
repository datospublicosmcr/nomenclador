# Nomenclador de Calles y Barrios — Especificación Técnica

**Proyecto:** Nomenclador de Calles y Barrios de Comodoro Rivadavia
**Organización:** Dirección de Datos Públicos y Comunicación (DDPC) — Municipalidad de Comodoro Rivadavia
**Repositorio:** `github.com/datospublicosmcr/nomenclador`
**Despliegue inicial:** `http://167.86.71.102:3006`
**Despliegue futuro:** `https://nomenclador.mcrmodernizacion.gob.ar`
**Licencia:** MIT (código) / CC BY 4.0 (datos)

---

## 1. Resumen del proyecto

Sistema web público de consulta del nomenclador oficial de calles y barrios de la ciudad de Comodoro Rivadavia, con panel de administración interno para gestión de los datasets y API pública JSON para consumo por otros sistemas municipales (Catastro, IDE, RPAD).

El sistema tiene **tres caras**:

1. **Cara pública (`/`)** — Buscador con dos pestañas (Calles / Barrios). Sin login. Es la cara principal del sistema.
2. **API pública (`/api/public/*`)** — Endpoints JSON sin auth, con rate limiting, pensados para ser consumidos por otros sistemas municipales y por la ciudadanía.
3. **Panel admin (`/admin`)** — CRUD completo + importación masiva CSV. Requiere login. Replica el patrón del SIR (Sistema Integrado de Relevamientos).

---

## 2. Stack y decisiones de arquitectura

### Stack tecnológico

- **Backend:** Node.js + Express
- **Base de datos:** MariaDB (nueva BD: `nomenclador`)
- **Driver DB:** `mysql2/promise` con pool de conexiones
- **Auth:** JWT + bcrypt (replicado del SIR)
- **Frontend:** Vanilla HTML/CSS/JS (sin frameworks)
- **Iconografía:** Lucide Icons (SVG inline)
- **Tipografía:** Inter (Google Fonts)
- **Importación CSV:** Procesamiento en frontend + envío de JSON al backend
- **Exportación XLSX:** SheetJS (`xlsx-0.20.1`) vía CDN
- **Rate limiting:** `express-rate-limit`

### Decisiones clave

| Decisión | Resolución |
|---|---|
| ¿Una app o dos? | **Una sola app** que sirve público + admin + API |
| ¿Login en cara pública? | **No.** Solo el panel `/admin` requiere login |
| ¿Reutilizar auth del SIR? | **Sí.** Tablas `usuarios`, `modulos`, `permisos_usuarios` con misma estructura |
| ¿Módulos en el sistema de permisos? | Solo dos: `calles` y `barrios` |
| ¿Búsqueda con normalización? | **Sí**, replicando la lógica del SIR (sin agregar columnas extra ni triggers) |
| ¿IDs de barrios autoincrementales? | **No.** Se preservan los IDs originales del CSV de migración |
| ¿`orden_carga` puede ser NULL? | **Sí.** Las rutas no tienen orden de carga |
| ¿Relación calles ↔ barrios? | **No.** Las tablas son independientes en v1 |
| ¿Auditoría / historial? | **No** en v1. Solo `created_at`, `updated_at`, `created_by`, `updated_by` |
| ¿Soft delete? | **Sí.** Columna `activo` en ambas tablas |
| ¿Codificación BD? | `utf8mb4` / `utf8mb4_unicode_ci` |
| ¿Relación con Andino/datos.comodoro? | **No** en v1. La sincronización se hace manualmente |

---

## 3. Estructura de carpetas

```
nomenclador/
├── _reference/                    # Carpeta de referencia, NO se sube a Git
│   └── sir/                       # Copia completa del SIR para consulta
│
├── config/
│   ├── auth.js                    # Configuración JWT y bcrypt
│   ├── database.js                # Pool MariaDB con mysql2/promise
│   └── rateLimits.js              # Configuración de rate limiting
│
├── middleware/
│   ├── auth.middleware.js         # verificarToken, verificarPermiso
│   └── error.middleware.js        # Manejo centralizado de errores
│
├── routes/
│   ├── public.routes.js           # API pública (sin auth)
│   ├── auth.routes.js             # Login / cambiar password / me
│   ├── calles.routes.js           # CRUD admin de calles
│   ├── barrios.routes.js          # CRUD admin de barrios
│   ├── importarCalles.routes.js   # Importación masiva calles
│   └── importarBarrios.routes.js  # Importación masiva barrios
│
├── public/
│   ├── index.html                 # Cara pública (buscador)
│   ├── acerca.html                # Página "Acerca" / "Sobre el sistema"
│   ├── admin/
│   │   ├── index.html             # Login admin
│   │   ├── dashboard.html         # Panel principal admin
│   │   ├── calles.html            # CRUD calles
│   │   ├── barrios.html           # CRUD barrios
│   │   └── perfil.html            # Perfil del usuario
│   ├── css/
│   │   ├── public.css             # Estilos cara pública
│   │   ├── admin.css              # Estilos panel admin (heredados del SIR)
│   │   └── importar.css           # Estilos modal de importación
│   ├── js/
│   │   ├── public.js              # Lógica cara pública
│   │   ├── admin/
│   │   │   ├── main.js            # Utilidades comunes (api, toast, auth)
│   │   │   ├── calles.js          # Lógica admin calles
│   │   │   └── barrios.js         # Lógica admin barrios
│   │   └── importacion/
│   │       ├── calles-importar.js
│   │       └── barrios-importar.js
│   └── images/
│       ├── logo-mcr.png           # Logo a color
│       └── logo-mcr-blanco.png    # Logo blanco para header
│
├── data/
│   ├── seed.sql                   # Schema completo + datos iniciales
│   ├── calles_inicial.csv         # CSV de calles (3.142 filas)
│   └── barrios_inicial.csv        # CSV de barrios (80 filas)
│
├── docs/
│   ├── README.md                  # Documentación principal
│   ├── API.md                     # Documentación de la API pública
│   └── DEPLOY.md                  # Instrucciones de despliegue
│
├── .env.example                   # Plantilla de variables de entorno
├── .gitignore                     # Incluye _reference/ y .env
├── package.json
├── server.js                      # Punto de entrada Express
└── README.md                      # README público del repo
```

### `.gitignore`

```
node_modules/
.env
_reference/
*.log
.DS_Store
.vscode/
.idea/
```

---

## 4. Variables de entorno (`.env.example`)

```bash
# Servidor
PORT=3006
NODE_ENV=production

# Base de datos
DB_HOST=localhost
DB_PORT=3306
DB_USER=nomenclador_user
DB_PASSWORD=<cambiar_en_produccion>
DB_NAME=nomenclador

# Auth (JWT)
JWT_SECRET=<generar_con_openssl_rand_hex_64>
JWT_EXPIRES_IN=8h

# bcrypt
BCRYPT_ROUNDS=12

# Rate limiting (API pública)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Datos públicos
APP_NAME="Nomenclador de Calles y Barrios"
APP_ORG="Municipalidad de Comodoro Rivadavia"
CONTACT_EMAIL=datospublicos@comodoro.gov.ar
```

---

## 5. Schema de base de datos

### `data/seed.sql` (schema completo)

```sql
-- ============================================
-- Nomenclador de Calles y Barrios
-- Schema completo
-- Codificación: utf8mb4_unicode_ci
-- ============================================

CREATE DATABASE IF NOT EXISTS nomenclador
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE nomenclador;

-- --------------------------------------------
-- Tabla: calles
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS calles (
    id_calle INT(11) NOT NULL AUTO_INCREMENT,
    orden_carga INT(11) DEFAULT NULL COMMENT 'Orden oficial de carga (puede ser NULL para rutas)',
    nombre_calle VARCHAR(150) NOT NULL COMMENT 'Nombre oficial de la calle',
    observacion_calle TEXT DEFAULT NULL COMMENT 'Notas adicionales (zona, referencias, ex-nombres)',
    activo TINYINT(1) DEFAULT 1 COMMENT 'Soft delete',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT(11) DEFAULT NULL,
    updated_by INT(11) DEFAULT NULL,
    PRIMARY KEY (id_calle),
    UNIQUE KEY uk_orden_carga_activo (orden_carga, activo),
    KEY idx_nombre_calle (nombre_calle),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Nomenclatura de calles';

-- Nota sobre uk_orden_carga_activo:
-- MariaDB permite múltiples NULLs en una UNIQUE KEY, así que las rutas
-- (orden_carga = NULL) no entran en conflicto entre sí.
-- El "activo" en el índice permite reactivar calles eliminadas.

-- --------------------------------------------
-- Tabla: barrios
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS barrios (
    id_barrio INT(11) NOT NULL,  -- NO autoincremental, se preserva del CSV
    zona_barrio ENUM('Norte','Sur','Sin zona') NOT NULL DEFAULT 'Sin zona' COMMENT 'Zona geográfica',
    nombre_barrio VARCHAR(100) NOT NULL COMMENT 'Nombre del barrio',
    ordenanza_barrio VARCHAR(50) DEFAULT NULL COMMENT 'Ordenanza de creación',
    resolucion_barrio VARCHAR(50) DEFAULT NULL COMMENT 'Resolución asociada',
    observaciones_barrio TEXT DEFAULT NULL COMMENT 'Notas adicionales',
    activo TINYINT(1) DEFAULT 1 COMMENT 'Soft delete',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT(11) DEFAULT NULL,
    updated_by INT(11) DEFAULT NULL,
    PRIMARY KEY (id_barrio),
    KEY idx_nombre_barrio (nombre_barrio),
    KEY idx_zona_barrio (zona_barrio),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Barrios y zonas de la ciudad';

-- --------------------------------------------
-- Tabla: usuarios (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario INT(11) NOT NULL AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) DEFAULT NULL,
    email VARCHAR(100) DEFAULT NULL,
    sexo ENUM('Varon','Mujer','No Binario') DEFAULT NULL,
    es_superadmin TINYINT(1) DEFAULT 0,
    debe_cambiar_password TINYINT(1) DEFAULT 1,
    activo TINYINT(1) DEFAULT 1,
    ultimo_login DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by INT(11) DEFAULT NULL,
    updated_by INT(11) DEFAULT NULL,
    PRIMARY KEY (id_usuario),
    KEY idx_username (username),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------
-- Tabla: modulos (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS modulos (
    id_modulo INT(11) NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT DEFAULT NULL,
    icono VARCHAR(50) DEFAULT NULL,
    color VARCHAR(20) DEFAULT NULL,
    ruta VARCHAR(100) DEFAULT NULL,
    orden INT(11) DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_modulo),
    KEY idx_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------
-- Tabla: permisos_usuarios (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS permisos_usuarios (
    id_permiso INT(11) NOT NULL AUTO_INCREMENT,
    id_usuario INT(11) NOT NULL,
    id_modulo INT(11) NOT NULL,
    puede_ver TINYINT(1) DEFAULT 1,
    puede_editar TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_permiso),
    UNIQUE KEY uk_usuario_modulo (id_usuario, id_modulo),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_modulo) REFERENCES modulos(id_modulo) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Datos iniciales
-- ============================================

-- Módulos del sistema
INSERT INTO modulos (codigo, nombre, descripcion, icono, color, ruta, orden) VALUES
    ('calles', 'Calles', 'Gestión de nomenclatura de calles', 'signpost', '#0F6E56', '/admin/calles.html', 1),
    ('barrios', 'Barrios', 'Gestión de barrios y zonas', 'home', '#0F6E56', '/admin/barrios.html', 2);

-- Usuario superadmin inicial
-- Contraseña: nomenclador2026 (debe cambiarse en primer login)
-- Hash generado con bcrypt rounds=12
INSERT INTO usuarios (username, password_hash, nombre, email, es_superadmin, debe_cambiar_password)
VALUES ('admin', '$2b$12$REEMPLAZAR_CON_HASH_REAL', 'Administrador', 'datospublicos@comodoro.gov.ar', 1, 1);
```

> **Nota para Claude Code:** El hash de bcrypt para la contraseña `nomenclador2026` debe generarse con el script de inicialización (`npm run init-admin`) y reemplazarse en `seed.sql` antes de ejecutarlo, o bien correrse con un script separado post-creación de schema.

### Importación de datos iniciales

Hay dos archivos CSV en `data/`:

- **`calles_inicial.csv`** — 3.142 filas. Headers: `id_calle, orden_carga, nombre_calle, observacion_calle`.
  - **IGNORAR** la columna `id_calle` del CSV (es residual del sistema previo).
  - Cargar con `id_calle` autoincremental nuevo.
  - Las primeras 3 filas (Rutas Provinciales / Nacional) tienen `orden_carga` vacío → cargar como `NULL`.

- **`barrios_inicial.csv`** — 80 filas. Headers: `id_barrio, zona_barrio, nombre_barrio, ordenanza_barrio, resolucion_barrio, observaciones_barrio`.
  - **PRESERVAR** el `id_barrio` del CSV (no autogenerar).
  - El archivo tiene **BOM UTF-8** (`\ufeff`) al inicio: limpiar antes de parsear.
  - El `id_barrio` 1000 era un error en el sistema previo; en el CSV ya está corregido.
  - El enum `zona_barrio` solo acepta `Norte`, `Sur`, `Sin zona` (Rada Tilly fue eliminado por ser otro municipio).

Crear un script `data/import-initial.js` que:
1. Lea ambos CSV (manejando BOM).
2. Ejecute `INSERT` masivos en transacción.
3. Aplique `toTitleCase` a `nombre_calle`, `nombre_barrio` y observaciones.
4. Para barrios, use el `id_barrio` del CSV como PK explícita.

---

## 6. Endpoints de la API

### Tabla resumen

| Método | Endpoint | Descripción | Auth |
|---|---|---|---|
| **API Pública (con rate limit)** | | | |
| GET | `/api/public/calles?q={texto}&limit={n}&offset={n}` | Buscar calles | No |
| GET | `/api/public/calles/:orden_carga` | Detalle de calle por OC | No |
| GET | `/api/public/barrios?q={texto}&zona={zona}&limit={n}&offset={n}` | Buscar barrios | No |
| GET | `/api/public/barrios/:id_barrio` | Detalle de barrio por ID | No |
| GET | `/api/public/stats` | Conteos totales (para footer) | No |
| **Auth admin** | | | |
| POST | `/api/auth/login` | Login | No |
| POST | `/api/auth/cambiar-password` | Cambiar password | Sí |
| GET | `/api/auth/me` | Datos del usuario actual + permisos | Sí |
| PUT | `/api/auth/perfil` | Actualizar perfil | Sí |
| **Calles (admin)** | | | |
| GET | `/api/calles?buscar={t}&pagina={n}&limite={n}` | Listar paginado | Sí (ver) |
| GET | `/api/calles/proximo-oc` | Próximo orden de carga disponible | Sí (ver) |
| GET | `/api/calles/exportar` | Exportar todas para CSV/XLSX | Sí (ver) |
| GET | `/api/calles/:id` | Detalle por id | Sí (ver) |
| POST | `/api/calles` | Crear | Sí (editar) |
| PUT | `/api/calles/:id` | Actualizar | Sí (editar) |
| DELETE | `/api/calles/:id` | Soft delete | Sí (editar) |
| POST | `/api/calles/importar/preview` | Preview de importación CSV | Sí (editar) |
| POST | `/api/calles/importar/aplicar` | Aplicar importación CSV | Sí (editar) |
| **Barrios (admin)** | | | |
| GET | `/api/barrios?buscar={t}&zona={z}&pagina={n}&limite={n}` | Listar paginado | Sí (ver) |
| GET | `/api/barrios/exportar` | Exportar todas para CSV/XLSX | Sí (ver) |
| GET | `/api/barrios/:id` | Detalle por id | Sí (ver) |
| POST | `/api/barrios` | Crear | Sí (editar) |
| PUT | `/api/barrios/:id` | Actualizar | Sí (editar) |
| DELETE | `/api/barrios/:id` | Soft delete | Sí (editar) |
| POST | `/api/barrios/importar/preview` | Preview de importación CSV | Sí (editar) |
| POST | `/api/barrios/importar/aplicar` | Aplicar importación CSV | Sí (editar) |

### Detalle: API pública

#### `GET /api/public/calles`

Parámetros de query:
- `q` (string, opcional): texto a buscar (matchea contra `nombre_calle` normalizado y contra `orden_carga`)
- `limit` (int, opcional, default 50, max 100)
- `offset` (int, opcional, default 0)

Respuesta:
```json
{
  "data": [
    {
      "orden_carga": 47,
      "nombre_calle": "Yrigoyen, Hipolito",
      "observacion_calle": "Centro"
    }
  ],
  "total": 3,
  "limit": 50,
  "offset": 0
}
```

#### `GET /api/public/calles/:orden_carga`

Si `orden_carga` es numérico válido y existe activo, devuelve la calle. Si no, 404.

#### `GET /api/public/barrios`

Parámetros:
- `q` (string, opcional)
- `zona` (string, opcional, valores: `Norte`, `Sur`, `Sin zona`)
- `limit`, `offset`

Respuesta similar a calles, con campos `id_barrio`, `zona_barrio`, `nombre_barrio`, `ordenanza_barrio`, `resolucion_barrio`, `observaciones_barrio`.

#### `GET /api/public/stats`

```json
{
  "calles": 3142,
  "barrios": 80,
  "actualizado": "2026-04-28T10:30:00Z"
}
```

### Rate limiting

Aplicar `express-rate-limit` solo a `/api/public/*`:

```js
// config/rateLimits.js
const rateLimit = require('express-rate-limit');

module.exports.publicApiLimit = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Demasiadas consultas. Intente en un minuto.',
        contacto: 'datospublicos@comodoro.gov.ar'
    }
});
```

El admin NO tiene rate limit (sería contraproducente para el flujo de trabajo).

---

## 7. Lógica de auth (replicada del SIR)

### Resumen del flujo

1. Usuario ingresa username + password en `/admin/index.html`.
2. POST a `/api/auth/login` → valida con bcrypt → genera JWT (8h) → devuelve `{ token, usuario, permisos }`.
3. Frontend guarda en `localStorage`: `nomenclador_token`, `nomenclador_usuario`, `nomenclador_permisos`.
4. Cada request al admin incluye `Authorization: Bearer <token>`.
5. Middleware `verificarToken` decodifica el JWT y carga el usuario.
6. Middleware `verificarPermiso(modulo, tipo)` verifica acceso al módulo (`calles` o `barrios`).
7. Superadmin (`es_superadmin=1`) tiene acceso total sin chequear `permisos_usuarios`.

### Diferencias vs SIR

- Cambian solo los nombres de las claves en `localStorage`: `nomenclador_token` en lugar de `sir_token`.
- El resto es idéntico al SIR. Ver `_reference/sir/middleware/auth.middleware.js` y `_reference/sir/routes/auth.routes.js`.

### Crear usuario admin inicial

Script `scripts/init-admin.js`:

```js
const bcrypt = require('bcrypt');
const db = require('../config/database');

async function init() {
    const hash = await bcrypt.hash('nomenclador2026', 12);
    await db.query(
        `INSERT INTO usuarios (username, password_hash, nombre, email, es_superadmin, debe_cambiar_password)
         VALUES (?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
        [process.env.ADMIN_USERNAME || 'admin', hash, 'Administrador', process.env.CONTACT_EMAIL, 1, 1]
    );
    console.log('✓ Usuario admin creado/actualizado');
    process.exit(0);
}
init().catch(err => { console.error(err); process.exit(1); });
```

Ejecutar tras crear el schema: `node scripts/init-admin.js`.

---

## 8. Lógica de búsqueda

### Estrategia

Replicar la lógica de búsqueda del SIR sin agregar columnas extra ni triggers. El SIR usa `LIKE %texto%` directo sobre las columnas, y MariaDB con `utf8mb4_unicode_ci` ya hace coincidencia case-insensitive. Para tildes, MariaDB con esa colación trata "á" como "a" en comparaciones.

### Implementación SQL

#### Calles

```sql
-- Búsqueda admin (paginada)
SELECT * FROM calles
WHERE activo = TRUE
  AND (CAST(orden_carga AS CHAR) LIKE ? OR nombre_calle LIKE ?)
ORDER BY
  CASE WHEN orden_carga IS NULL THEN 1 ELSE 0 END,  -- rutas al final
  orden_carga ASC,
  nombre_calle ASC
LIMIT ? OFFSET ?;

-- Búsqueda pública (mismo patrón, solo cambia el límite max)
```

#### Barrios

```sql
SELECT * FROM barrios
WHERE activo = TRUE
  AND (
    nombre_barrio LIKE ?
    OR ordenanza_barrio LIKE ?
    OR resolucion_barrio LIKE ?
  )
  AND (? IS NULL OR zona_barrio = ?)
ORDER BY nombre_barrio ASC
LIMIT ? OFFSET ?;
```

### Comportamiento esperado

| Query del usuario | Matchea con |
|---|---|
| `hipolito` | "Hipolito Yrigoyen", "Bouchard, Hipolito", "Pasaje Hipólito Vieytes" |
| `Hipólito` | mismo resultado (la colación ignora tildes) |
| `25` | "25 de Mayo", calle con `orden_carga=25` |
| `47` | calle con `orden_carga=47` (CAST a CHAR) |
| `bella` | "Bella Vista Sur", "Bella Vista Oeste" |

### Ordenamiento

- **Calles:** primero las que tienen `orden_carga` (ordenadas asc), luego las rutas (`orden_carga IS NULL`) al final, ordenadas alfabéticamente.
- **Barrios:** alfabético por `nombre_barrio`.

---

## 9. Importación CSV (admin)

### Estrategia

Replicar **fielmente** el flujo de 3 pasos del SIR: subir → preview → confirmar. Toda la lógica está en `_reference/sir/routes/importarCalles.routes.js` y `_reference/sir/public/js/importacion/calles-importar.js`. Adaptar a las dos entidades de este proyecto.

### Flujo

1. **Paso 1: Subir CSV** — Frontend lee el archivo, parsea con manejo de BOM, comillas y comas internas, valida estructura mínima.
2. **Paso 2: Preview** — Backend recibe los registros en JSON, los compara con la BD, y devuelve clasificación: `nuevos`, `actualizar`, `sinCambios`, `eliminados` (calles eliminadas que pueden reactivarse), `duplicadosCSV`, `errores`.
3. **Paso 3: Confirmar** — Usuario revisa, scrollea hasta el final, marca checkbox de confirmación, y aplica.
4. **Resultado:** mensaje de éxito con estadísticas + botón para descargar reporte XLSX detallado (insertados, actualizados, reactivados, errores en hojas separadas).

### Headers aceptados

#### Calles

| Campo BD | Headers aceptados (case-insensitive) |
|---|---|
| `orden_carga` | `orden_carga`, `orden`, `oc` |
| `nombre_calle` | `nombre_calle`, `nombre`, `calle` |
| `observacion_calle` | `observacion_calle`, `observaciones_calle`, `observacion`, `observaciones`, `obs` |

> Si el CSV tiene la columna `id_calle` (como el archivo de migración inicial), **se ignora**.

#### Barrios

| Campo BD | Headers aceptados |
|---|---|
| `id_barrio` | `id_barrio`, `id` |
| `zona_barrio` | `zona_barrio`, `zona` |
| `nombre_barrio` | `nombre_barrio`, `nombre`, `barrio` |
| `ordenanza_barrio` | `ordenanza_barrio`, `ordenanza` |
| `resolucion_barrio` | `resolucion_barrio`, `resolucion` |
| `observaciones_barrio` | `observaciones_barrio`, `observaciones`, `obs` |

> Para barrios, el `id_barrio` **es requerido** y se preserva (es la clave de matching).

### Reglas de negocio

#### Calles

- **Clave única:** `orden_carga` (cuando no es NULL).
- Las filas con `orden_carga` vacío en el CSV (rutas) se importan como **nuevas** sin posibilidad de actualización por OC. Se identifican como duplicadas si ya existe una calle activa con el mismo `nombre_calle` normalizado.
- Validación: `nombre_calle` es obligatorio. `orden_carga` puede ser NULL.

#### Barrios

- **Clave única:** `id_barrio` (preservado del CSV).
- Validación: `id_barrio` y `nombre_barrio` son obligatorios. `zona_barrio` debe ser uno de los valores del enum.

### Normalización para comparación

```js
function normalizarParaComparar(texto) {
    if (!texto) return '';
    return texto
        .toString()
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // tildes
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*-\s*/g, '-')
        .trim();
}
```

### Formato de guardado (Title Case)

```js
function formatearParaBD(texto) {
    if (!texto) return null;
    return texto
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}
```

> Excepción: los campos `ordenanza_barrio` y `resolucion_barrio` NO se aplica title case — son códigos como `17.662/23`.

### Manejo de BOM

Antes de parsear el CSV en frontend:

```js
function leerArchivo(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            let texto = e.target.result;
            // Quitar BOM si existe
            if (texto.charCodeAt(0) === 0xFEFF) {
                texto = texto.substring(1);
            }
            resolve(texto);
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsText(file, 'UTF-8');
    });
}
```

---

## 10. Diseño UI: cara pública (`/`)

### Especificación visual

- **Tipografía:** Inter (300, 400, 500, 600, 700) desde Google Fonts.
- **Color principal:** `#0F6E56` (verde teal institucional para datos abiertos).
- **Fondo del header:** `#0F6E56` con texto blanco.
- **Logo:** `logo-mcr-blanco.png` (provisto, blanco sobre fondo oscuro/teal).
- **Iconografía:** Lucide Icons inline como SVG.
- **Paleta de zonas:**
  - Sur: badge `#E6F1FB` con texto `#0C447C` (azul claro)
  - Norte: badge `#FAEEDA` con texto `#854F0B` (ámbar)
  - Sin zona: badge `#F1EFE8` con texto `#5F5E5A` (gris)
- **Esquinas:** `border-radius: 8px` general, `12px` para tarjetas grandes.
- **Bordes:** `0.5px solid rgba(0,0,0,0.1)`.
- **Sin sombras decorativas** — solo focus rings en inputs.

### Estructura HTML (resumen)

```
[Header verde teal]
  [Logo MCR blanco] | [Municipalidad de Comodoro Rivadavia / Nomenclador de calles y barrios]
  [Links: API pública | Acerca]

[Body con padding y max-width 880px centrado]
  [Tabs: Calles | Barrios]
  [Input de búsqueda con icono lucide:search]
  [Filtros de zona (solo en tab Barrios): Todas / Norte / Sur / Sin zona]
  [Texto: "X resultados"]
  [Lista de tarjetas de resultado]
  [Paginación / "Cargar más" si hay > limit]

[Footer]
  [Conteo total: X calles · Y barrios] [Datos abiertos · CC BY 4.0]
```

### Tarjeta de calle

```
┌─────────────────────────────────────────────────────────────┐
│  [47]  Yrigoyen, Hipolito                  [📋 47] [📋 nombre] │
│        Centro                                                │
└─────────────────────────────────────────────────────────────┘
```

- Badge del orden de carga: número grande en verde teal sobre fondo `#E1F5EE`. Sin texto "OC" antes.
- Calles sin `orden_carga`: badge muestra `—` (em dash) en gris.
- Botón "Copiar OC": ícono `lucide:copy` + número. Solo visible si tiene `orden_carga`.
- Botón "Copiar nombre": ícono `lucide:copy` + texto "nombre".
- Click en los botones: copia al portapapeles + toast confirmación + cambio temporal del ícono a `lucide:check`.

### Tarjeta de barrio

```
┌─────────────────────────────────────────────────────────────┐
│  Bella Vista Oeste                                  [Sur]   │
│  Ordenanza 17.200/24    Resolución 1.793/24                 │
└─────────────────────────────────────────────────────────────┘
```

- Sin badge de OC (los barrios no tienen `orden_carga`).
- Badge de zona a la derecha.
- Si no tiene `ordenanza_barrio` y `resolucion_barrio` (o ambos son `No posee`), mostrar "Sin ordenanza registrada" en gris.
- Sin botones de copiar en v1 (los nombres de barrios son menos críticos para copiar/pegar).

### Behavior

- Búsqueda con debounce de 300ms (replicar `buscarConDelay` del SIR).
- Tabs: el cambio de tab resetea el input pero mantiene foco.
- Estado vacío: "No se encontraron calles" / "No se encontraron barrios" con ícono `lucide:search-x`.
- Paginación: 50 resultados por página. Botón "Cargar más" en lugar de paginación numerada (UX más simple para público general).
- Loading: skeleton cards animadas mientras espera respuesta.

### Responsive

- En mobile (≤640px):
  - Header: solo logo + título (sin descripción).
  - Tarjetas: badge de OC arriba, info debajo, botones copiar al final en una fila.
  - Tabs: ancho completo.
  - Input: full width con padding reducido.

### Accesibilidad

- Todos los botones tienen `aria-label`.
- Input de búsqueda con `aria-describedby` apuntando al contador de resultados.
- Tabs con `role="tablist"` y `role="tab"` con `aria-selected`.
- Focus visible con outline de 2px en color `#0F6E56` con offset.
- Skip link "Ir al contenido" al inicio.

### Mockup de referencia (HTML)

> El mockup completo en HTML está incluido al final de este documento como anexo `MOCKUP-PUBLICO.html`. Usar como referencia visual exacta del diseño.

---

## 11. Diseño UI: panel admin (`/admin`)

### Estrategia

Replicar la UI del SIR adaptada a este sistema, manteniendo:
- Layout lista + detalle (panel izquierdo de 380px con lista, panel derecho con detalle/edición).
- Header oscuro con logo y datos del usuario.
- Sidebar lateral con navegación entre módulos.
- Modos: visualización / edición / creación.
- Modal de importación de 3 pasos.
- Modal de confirmación de eliminación.

### Adaptaciones específicas

#### Header
- Cambiar `SIR / Sistema Integrado de Relevamientos` por `Nomenclador / Panel de Administración`.
- Mantener gradiente azul oscuro del SIR (es panel interno, no necesita ser teal).

#### Sidebar
- Solo dos links de módulos: **Calles** y **Barrios**.
- Mantener "Mi Perfil" e "Inicio" (dashboard).

#### Dashboard (`/admin/dashboard.html`)
- Dos tarjetas grandes: una para Calles, otra para Barrios.
- Cada una muestra: total activos, última actualización, link "Gestionar →".
- Sin gráficos ni dashboards complejos en v1.

#### Calles admin (`/admin/calles.html`)
- Igual al `_reference/sir/public/calles.html` pero adaptando textos.
- Soporte para `orden_carga = NULL` en formulario (checkbox "Sin orden de carga (ruta)").
- En la lista: mostrar `—` cuando `orden_carga` es NULL.

#### Barrios admin (`/admin/barrios.html`)
- Mismo layout que calles.
- En el formulario: campo `id_barrio` (requerido, numérico, no editable después de crear).
- Selector de `zona_barrio` (dropdown con tres opciones).
- Campos de ordenanza/resolución: text inputs simples.

### Importación CSV (admin)

- Misma lógica visual que SIR: modal con 3 pasos, indicadores de progreso, tabs en preview, scroll obligatorio + checkbox en confirmación.
- Reportes XLSX descargables al final.

---

## 12. Página "Acerca" (`/acerca.html`)

Página estática con:

### Contenido

```
[Header igual a la cara pública]

[Body con padding generoso]

  ¿Qué es este sistema?

  El Nomenclador de Calles y Barrios es la fuente oficial de consulta
  de las calles y barrios de Comodoro Rivadavia. Es mantenido por la
  Dirección de Datos Públicos y Comunicación, dependiente de la
  Dirección General de Modernización e Investigación Territorial.

  Este sistema cumple con lo establecido en la Ordenanza N° 17.662/23
  de Gobierno Abierto de la ciudad, que garantiza el acceso libre y
  gratuito a la información pública municipal.

  ¿Qué es el "orden de carga"?

  El orden de carga (OC) es el número oficial asignado por la
  Municipalidad para identificar a cada calle en el catastro municipal.
  Algunas vías —como las rutas nacionales y provinciales— no poseen
  orden de carga.

  Datos abiertos

  Todos los datos publicados están disponibles bajo licencia
  Creative Commons Atribución 4.0 Internacional (CC BY 4.0).
  Pueden ser reutilizados libremente con la atribución correspondiente.

  [Botón: Descargar dataset completo (CSV)]
  [Botón: Acceder a la API pública]

  API pública

  Para consumo programático de los datos, ofrecemos una API REST
  documentada. Permite a otros sistemas, aplicaciones y desarrolladores
  acceder a la información del nomenclador.

  Endpoints principales:
  - GET /api/public/calles?q={texto}
  - GET /api/public/calles/:orden_carga
  - GET /api/public/barrios?q={texto}&zona={zona}
  - GET /api/public/barrios/:id

  Limite: 100 consultas por minuto por IP.

  [Botón: Ver documentación completa]

  Marco normativo

  - Ordenanza N° 17.662/23: Gobierno Abierto y Datos Abiertos
  - Ley Provincial I N° 156: Acceso a la Información Pública
  - Ley 25.506: Firma Digital

  Contacto

  Dirección de Datos Públicos y Comunicación
  Dirección General de Modernización e Investigación Territorial
  Municipalidad de Comodoro Rivadavia

  Email: datospublicos@comodoro.gov.ar
  Sitio web: datos.comodoro.gov.ar

[Footer]
```

### Botones funcionales

- **Descargar dataset completo (CSV):** descarga ZIP con `calles.csv` y `barrios.csv`. Ruta: `/api/public/dataset.zip`. Sin auth, con rate limit más estricto (5/hora).
- **Acceder a la API pública:** scroll a la sección API.
- **Ver documentación completa:** link a `docs/API.md` renderizado como HTML estático en `/docs/api.html`.

---

## 13. Datos iniciales

### Procedimiento de carga inicial

Crear `scripts/seed-initial-data.js`:

```js
// Pseudo-código
async function seed() {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    try {
        // 1. Importar barrios primero (preservando IDs)
        const barrios = parseCSV('data/barrios_inicial.csv');
        for (const b of barrios) {
            await conn.query(
                `INSERT INTO barrios (id_barrio, zona_barrio, nombre_barrio,
                 ordenanza_barrio, resolucion_barrio, observaciones_barrio,
                 created_by) VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    b.id_barrio,
                    normalizarZona(b.zona_barrio),  // valida enum
                    formatearParaBD(b.nombre_barrio),
                    b.ordenanza_barrio === 'No posee' ? null : b.ordenanza_barrio,
                    b.resolucion_barrio === 'No posee' ? null : b.resolucion_barrio,
                    b.observaciones_barrio || null
                ]
            );
        }

        // 2. Importar calles (descartar id_calle del CSV)
        const calles = parseCSV('data/calles_inicial.csv');
        for (const c of calles) {
            await conn.query(
                `INSERT INTO calles (orden_carga, nombre_calle,
                 observacion_calle, created_by) VALUES (?, ?, ?, 1)`,
                [
                    c.orden_carga ? parseInt(c.orden_carga) : null,
                    formatearParaBD(c.nombre_calle),
                    formatearParaBD(c.observacion_calle)
                ]
            );
        }

        await conn.commit();
        console.log(`✓ ${barrios.length} barrios + ${calles.length} calles importados`);
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}
```

Ejecutar después de `init-admin.js`: `node scripts/seed-initial-data.js`.

### Manejo de "No posee"

En el CSV original, los campos `ordenanza_barrio` y `resolucion_barrio` que no tienen valor están marcados como `"No posee"`. Convertir a `NULL` en BD y mostrar "Sin ordenanza registrada" / "Sin resolución registrada" en UI.

---

## 14. Despliegue en VPS

### Prerequisitos en el VPS

- Node.js 20.x LTS
- MariaDB 10.6+
- nginx (para reverse proxy futuro)
- pm2 (para gestión de procesos)

### Pasos

```bash
# 1. Clonar el repositorio
cd /var/www
git clone https://github.com/datospublicosmcr/nomenclador.git
cd nomenclador

# 2. Instalar dependencias
npm install --production

# 3. Configurar variables de entorno
cp .env.example .env
nano .env  # editar con valores reales

# 4. Crear base de datos y schema
mysql -u root -p < data/seed.sql

# 5. Crear usuario admin inicial
node scripts/init-admin.js

# 6. Cargar datos iniciales
node scripts/seed-initial-data.js

# 7. Iniciar con pm2
pm2 start server.js --name nomenclador
pm2 save
pm2 startup

# 8. Verificar
curl http://localhost:3006/api/public/stats
```

### Acceso temporal por IP

`http://167.86.71.102:3006`

### Migración futura a dominio

Cuando se configure `nomenclador.mcrmodernizacion.gob.ar`:

1. Configurar nginx como reverse proxy hacia `localhost:3006`.
2. Generar certificado SSL con Let's Encrypt.
3. Actualizar variables de entorno si corresponde.
4. Sin cambios en el código.

---

## 15. `package.json` sugerido

```json
{
  "name": "nomenclador",
  "version": "1.0.0",
  "description": "Nomenclador oficial de calles y barrios de Comodoro Rivadavia",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "init-admin": "node scripts/init-admin.js",
    "seed": "node scripts/seed-initial-data.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.6.5",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1",
    "express-rate-limit": "^7.1.5",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "compression": "^1.7.4",
    "archiver": "^6.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/datospublicosmcr/nomenclador"
  }
}
```

### Por qué cada dependencia

- `helmet` — headers de seguridad básicos (CSP, X-Frame-Options, etc.)
- `cors` — habilitar CORS abierto en `/api/public/*` para que cualquier sistema pueda consumirlo.
- `compression` — comprimir respuestas (sobre todo importante para listados grandes).
- `archiver` — generar el ZIP del dataset completo en la página Acerca.

---

## 16. `server.js` (estructura de referencia)

```js
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const path = require('path');

const db = require('./config/database');
const { publicApiLimit } = require('./config/rateLimits');

const app = express();

// Middleware base
app.use(helmet({ contentSecurityPolicy: false })); // CSP custom si hace falta
app.use(compression());
app.use(express.json({ limit: '10mb' })); // 10mb para CSVs grandes
app.use(express.urlencoded({ extended: true }));

// CORS solo para /api/public/*
app.use('/api/public', cors());
app.use('/api/public', publicApiLimit);

// Rutas API
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/calles', require('./routes/calles.routes'));
app.use('/api/calles/importar', require('./routes/importarCalles.routes'));
app.use('/api/barrios', require('./routes/barrios.routes'));
app.use('/api/barrios/importar', require('./routes/importarBarrios.routes'));

// Archivos estáticos (cara pública + admin)
app.use(express.static(path.join(__dirname, 'public')));

// Error handler centralizado
app.use(require('./middleware/error.middleware'));

// Iniciar
const PORT = process.env.PORT || 3006;
db.testConnection()
    .then(() => {
        app.listen(PORT, () => {
            console.log(`✓ Nomenclador escuchando en puerto ${PORT}`);
        });
    })
    .catch(err => {
        console.error('✗ Error al conectar a la base de datos:', err);
        process.exit(1);
    });
```

---

## 17. Pasos de implementación recomendados

Para Claude Code, este es el orden sugerido de construcción:

1. **Setup inicial:** `package.json`, `.env.example`, `.gitignore`, estructura de carpetas vacía.
2. **Base de datos:** crear `data/seed.sql` con schema completo. Ejecutar y verificar.
3. **Configuración:** `config/database.js`, `config/auth.js`, `config/rateLimits.js`.
4. **Auth:** middleware `auth.middleware.js`, routes `auth.routes.js`. Crear `scripts/init-admin.js`. Probar login.
5. **API pública:** `routes/public.routes.js` con los 5 endpoints. Probar con curl.
6. **Datos iniciales:** `scripts/seed-initial-data.js`. Cargar los CSV.
7. **CRUD admin de calles:** `routes/calles.routes.js` (sin importación todavía).
8. **CRUD admin de barrios:** `routes/barrios.routes.js`.
9. **Cara pública (HTML/CSS/JS):** `public/index.html`, `public/css/public.css`, `public/js/public.js`. Esta es la parte más visible — pulir bien el diseño.
10. **Página Acerca:** `public/acerca.html`.
11. **Login admin:** `public/admin/index.html`.
12. **Dashboard admin:** `public/admin/dashboard.html`.
13. **Admin calles:** `public/admin/calles.html` + `public/js/admin/calles.js` (replicando del SIR).
14. **Admin barrios:** `public/admin/barrios.html` + `public/js/admin/barrios.js`.
15. **Importación CSV de calles:** rutas + frontend del modal.
16. **Importación CSV de barrios:** rutas + frontend del modal.
17. **Documentación:** `docs/README.md`, `docs/API.md`, `docs/DEPLOY.md`.
18. **Deploy en VPS** y prueba end-to-end.

> **Importante para Claude Code:** Antes de programar la importación, **leer en detalle** los archivos `_reference/sir/routes/importarCalles.routes.js` y `_reference/sir/public/js/importacion/calles-importar.js`. La lógica es densa y muy bien probada. Replicarla con mínimas adaptaciones en lugar de reinventarla.

---

## 18. Consideraciones de calidad

### Código

- **Comentarios en español** siguiendo el estilo del SIR.
- **Funciones con docstring JSDoc** para las complejas (importación, normalización).
- **Sin variables en inglés mezcladas con español** — mantener consistencia con el SIR.
- **Logs informativos** con prefijos `✓` (éxito), `✗` (error), `→` (acción).

### Seguridad

- Nunca exponer `password_hash` en respuestas JSON.
- Validar tipos en todos los endpoints (no confiar en `req.body`).
- Sanitizar entrada de usuario antes de logs (evitar log injection).
- Rate limit más estricto en `/api/auth/login` (10 intentos por 15 min por IP).
- Headers de seguridad con `helmet`.

### Performance

- Pool de conexiones MariaDB con `connectionLimit: 10`.
- `compression` para respuestas > 1KB.
- Índices en columnas de búsqueda (`nombre_calle`, `nombre_barrio`, `orden_carga`, `activo`, `zona_barrio`).
- Pagination obligatoria en endpoints que devuelvan listas (límite max 100).

### Accesibilidad

- Etiquetas `<label>` asociadas a todos los inputs.
- `aria-label` en botones con solo iconos.
- Contraste WCAG AA mínimo en toda la UI pública.
- Soporte completo de navegación por teclado.

---

## 19. Anexo: Mockup HTML de la cara pública

> Este HTML está pensado como **referencia visual exacta** del diseño de la cara pública. Claude Code debe usarlo como base y adaptarlo para hacerlo dinámico (conectándolo con la API pública) y responsive.

El archivo `MOCKUP-PUBLICO.html` se entrega junto a este documento.

---

## 20. Resumen de entregables esperados

Al finalizar la implementación, el proyecto debe tener:

- ✅ Repositorio en `github.com/datospublicosmcr/nomenclador` (público, MIT).
- ✅ Schema SQL ejecutable (`data/seed.sql`).
- ✅ Datos iniciales cargados (3.142 calles + 80 barrios).
- ✅ Cara pública funcional en `http://167.86.71.102:3006/`.
- ✅ Página Acerca funcional en `http://167.86.71.102:3006/acerca.html`.
- ✅ Panel admin funcional en `http://167.86.71.102:3006/admin/`.
- ✅ API pública documentada y funcional con rate limit.
- ✅ Importación CSV funcional para calles y barrios.
- ✅ README, API.md y DEPLOY.md en `docs/`.
- ✅ Código limpio, comentado en español, siguiendo el estilo del SIR.

---

**Documento generado para uso con Claude Code.**
**Autor de la solicitud:** Mariano Ariel Pérez — Director DDPC.
**Fecha de spec:** Abril 2026.
