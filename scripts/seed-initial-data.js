/**
 * Script de carga de datos iniciales
 * Lee calles_inicial.csv y barrios_inicial.csv y los inserta en la BD
 *
 * Uso: npm run seed
 * Prerequisito: haber ejecutado data/seed.sql y npm run init-admin
 *
 * Manejo especial:
 * - BOM UTF-8 al inicio de ambos archivos
 * - CRLF en barrios_inicial.csv
 * - Campos entrecomillados con comas internas (calles)
 * - "No posee" → NULL en ordenanza/resolucion de barrios
 * - orden_carga vacío → NULL (rutas provinciales/nacional)
 * - id_calle del CSV se ignora (autoincremental nuevo)
 * - id_barrio del CSV se preserva como PK
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db   = require('../config/database');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ──────────────────────────────────────────────
// Helpers de texto
// ──────────────────────────────────────────────

/** Title Case: "BELLA VISTA OESTE" → "Bella Vista Oeste" */
function toTitleCase(str) {
    if (!str) return null;
    return str
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
}

const ZONAS_VALIDAS = ['Norte', 'Sur', 'Sin zona'];

/** Valida y normaliza el valor del enum zona_barrio */
function normalizarZona(zona) {
    if (!zona) return 'Sin zona';
    const z = zona.trim();
    if (ZONAS_VALIDAS.includes(z)) return z;
    // Intento case-insensitive
    const match = ZONAS_VALIDAS.find(v => v.toLowerCase() === z.toLowerCase());
    if (match) return match;
    console.warn(`  ⚠ Zona desconocida "${z}" → "Sin zona"`);
    return 'Sin zona';
}

/** "No posee" o vacío → NULL */
function nulificarNoPosee(valor) {
    if (!valor) return null;
    const v = valor.trim();
    if (v === '' || v.toLowerCase() === 'no posee') return null;
    return v;
}

// ──────────────────────────────────────────────
// Parser CSV (RFC-4180, maneja BOM y CRLF)
// ──────────────────────────────────────────────

/**
 * Parsea una línea CSV respetando campos entre comillas.
 * @param {string} linea
 * @returns {string[]}
 */
function parsearLinea(linea) {
    const campos = [];
    let campo     = '';
    let enComillas = false;

    for (let i = 0; i < linea.length; i++) {
        const c = linea[i];

        if (enComillas) {
            if (c === '"') {
                // Comilla escapada ("") → comilla literal
                if (linea[i + 1] === '"') {
                    campo += '"';
                    i++;
                } else {
                    enComillas = false;
                }
            } else {
                campo += c;
            }
        } else {
            if (c === '"') {
                enComillas = true;
            } else if (c === ',') {
                campos.push(campo.trim());
                campo = '';
            } else {
                campo += c;
            }
        }
    }

    campos.push(campo.trim());
    return campos;
}

/**
 * Parsea el contenido completo de un CSV.
 * Devuelve array de objetos usando la primera fila como headers.
 * @param {string} contenido - Texto crudo del archivo
 * @returns {{ headers: string[], rows: Object[] }}
 */
function parsearCSV(contenido) {
    // Quitar BOM si existe
    if (contenido.charCodeAt(0) === 0xFEFF) {
        contenido = contenido.slice(1);
    }

    // Normalizar CRLF → LF
    contenido = contenido.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const lineas = contenido.split('\n').filter(l => l.trim() !== '');

    if (lineas.length === 0) throw new Error('CSV vacío');

    const headers = parsearLinea(lineas[0]);
    const rows    = [];

    for (let i = 1; i < lineas.length; i++) {
        const campos = parsearLinea(lineas[i]);
        const obj    = {};
        headers.forEach((h, idx) => {
            obj[h] = campos[idx] !== undefined ? campos[idx] : '';
        });
        rows.push(obj);
    }

    return { headers, rows };
}

// ──────────────────────────────────────────────
// Carga de barrios
// ──────────────────────────────────────────────

async function cargarBarrios(conn) {
    const contenido = fs.readFileSync(path.join(DATA_DIR, 'barrios_inicial.csv'), 'utf-8');
    const { rows }  = parsearCSV(contenido);

    console.log(`→ ${rows.length} barrios leídos del CSV`);

    let insertados = 0;
    let errores    = 0;

    for (const b of rows) {
        const id_barrio = parseInt(b.id_barrio);

        if (isNaN(id_barrio)) {
            console.warn(`  ⚠ id_barrio inválido en fila: ${JSON.stringify(b)}`);
            errores++;
            continue;
        }

        const nombre = toTitleCase(b.nombre_barrio);
        if (!nombre) {
            console.warn(`  ⚠ nombre_barrio vacío para id_barrio=${id_barrio}`);
            errores++;
            continue;
        }

        try {
            await conn.query(
                `INSERT INTO barrios
                    (id_barrio, zona_barrio, nombre_barrio,
                     ordenanza_barrio, resolucion_barrio, observaciones_barrio, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, 1)`,
                [
                    id_barrio,
                    normalizarZona(b.zona_barrio),
                    nombre,
                    nulificarNoPosee(b.ordenanza_barrio),
                    nulificarNoPosee(b.resolucion_barrio),
                    toTitleCase(b.observaciones_barrio)
                ]
            );
            insertados++;
        } catch (err) {
            console.error(`  ✗ Error en barrio id=${id_barrio}: ${err.message}`);
            errores++;
        }
    }

    return { insertados, errores };
}

// ──────────────────────────────────────────────
// Carga de calles
// ──────────────────────────────────────────────

async function cargarCalles(conn) {
    const contenido = fs.readFileSync(path.join(DATA_DIR, 'calles_inicial.csv'), 'utf-8');
    const { rows }  = parsearCSV(contenido);

    console.log(`→ ${rows.length} calles leídas del CSV`);

    let insertadas = 0;
    let errores    = 0;

    for (const c of rows) {
        const nombre = toTitleCase(c.nombre_calle);
        if (!nombre) {
            console.warn(`  ⚠ nombre_calle vacío en fila: ${JSON.stringify(c)}`);
            errores++;
            continue;
        }

        // orden_carga vacío → NULL (rutas provinciales/nacional)
        const orden_carga = c.orden_carga && c.orden_carga.trim() !== ''
            ? parseInt(c.orden_carga)
            : null;

        if (orden_carga !== null && isNaN(orden_carga)) {
            console.warn(`  ⚠ orden_carga inválido "${c.orden_carga}" para "${nombre}"`);
            errores++;
            continue;
        }

        try {
            await conn.query(
                `INSERT INTO calles
                    (orden_carga, nombre_calle, observacion_calle, created_by)
                 VALUES (?, ?, ?, 1)`,
                [
                    orden_carga,
                    nombre,
                    toTitleCase(c.observacion_calle)
                ]
            );
            insertadas++;
        } catch (err) {
            // UNIQUE KEY (orden_carga, activo) puede dispararse si el CSV tiene duplicados
            console.error(`  ✗ Error en calle "${nombre}" (OC=${orden_carga}): ${err.message}`);
            errores++;
        }
    }

    return { insertadas, errores };
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────

async function seed() {
    console.log('→ Iniciando carga de datos iniciales...\n');

    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Barrios primero (tienen PK explícita, sin dependencias)
        console.log('[1/2] Cargando barrios...');
        const resBarrios = await cargarBarrios(conn);
        console.log(`✓ Barrios: ${resBarrios.insertados} insertados, ${resBarrios.errores} errores\n`);

        // 2. Calles (descartan id_calle del CSV, usan autoincremental)
        console.log('[2/2] Cargando calles...');
        const resCalles = await cargarCalles(conn);
        console.log(`✓ Calles: ${resCalles.insertadas} insertadas, ${resCalles.errores} errores\n`);

        await conn.commit();

        const totalErrores = resBarrios.errores + resCalles.errores;
        if (totalErrores > 0) {
            console.log(`⚠ Carga completada con ${totalErrores} errores. Revisar mensajes anteriores.`);
        } else {
            console.log('✓ Carga completada sin errores.');
        }

    } catch (err) {
        await conn.rollback();
        console.error('✗ Error durante la carga, rollback ejecutado:', err.message);
        throw err;
    } finally {
        conn.release();
    }
}

seed()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('✗ Error fatal:', err);
        process.exit(1);
    });
