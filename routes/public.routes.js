/**
 * API pública — sin autenticación, con rate limit
 *
 * GET /api/public/calles?q={texto}&limit={n}&offset={n}
 * GET /api/public/calles/:orden_carga
 * GET /api/public/barrios?q={texto}&zona={zona}&limit={n}&offset={n}
 * GET /api/public/barrios/:id_barrio
 * GET /api/public/stats
 */

const express = require('express');
const router = express.Router();
const db = require('../config/database');

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const LIMIT_DEFAULT = 50;
const LIMIT_MAX     = 100;

/** Parsea y acota el parámetro limit */
function parsearLimit(raw) {
    const n = parseInt(raw) || LIMIT_DEFAULT;
    return Math.min(Math.max(n, 1), LIMIT_MAX);
}

/** Parsea offset, mínimo 0 */
function parsearOffset(raw) {
    return Math.max(parseInt(raw) || 0, 0);
}

// ──────────────────────────────────────────────
// GET /api/public/calles
// ──────────────────────────────────────────────
router.get('/calles', async (req, res) => {
    try {
        const { q } = req.query;
        const limit  = parsearLimit(req.query.limit);
        const offset = parsearOffset(req.query.offset);

        let whereSql   = 'WHERE activo = TRUE';
        const params      = [];
        const countParams = [];

        if (q && q.trim()) {
            const busqueda = `%${q.trim()}%`;
            whereSql += ' AND (CAST(orden_carga AS CHAR) LIKE ? OR nombre_calle LIKE ?)';
            params.push(busqueda, busqueda);
            countParams.push(busqueda, busqueda);
        }

        // Rutas (orden_carga IS NULL) van al final; dentro de cada grupo, por orden_carga y nombre
        const orderSql = `ORDER BY
            CASE WHEN orden_carga IS NULL THEN 1 ELSE 0 END,
            orden_carga ASC,
            nombre_calle ASC`;

        const sql = `
            SELECT orden_carga, nombre_calle, observacion_calle
            FROM calles ${whereSql} ${orderSql}
            LIMIT ? OFFSET ?`;

        const countSql = `SELECT COUNT(*) AS total FROM calles ${whereSql}`;

        params.push(limit, offset);

        const [data, countRows] = await Promise.all([
            db.query(sql, params),
            db.query(countSql, countParams)
        ]);

        res.json({
            data,
            total:  countRows[0].total,
            limit,
            offset
        });

    } catch (error) {
        console.error('✗ Error en GET /api/public/calles:', error);
        res.status(500).json({ error: 'Error al obtener calles' });
    }
});

// ──────────────────────────────────────────────
// GET /api/public/calles/:orden_carga
// ──────────────────────────────────────────────
router.get('/calles/:orden_carga', async (req, res) => {
    try {
        const oc = parseInt(req.params.orden_carga);

        if (isNaN(oc) || oc <= 0) {
            return res.status(400).json({ error: 'orden_carga debe ser un número entero positivo' });
        }

        const calles = await db.query(
            'SELECT orden_carga, nombre_calle, observacion_calle FROM calles WHERE orden_carga = ? AND activo = TRUE',
            [oc]
        );

        if (calles.length === 0) {
            return res.status(404).json({ error: 'Calle no encontrada' });
        }

        res.json(calles[0]);

    } catch (error) {
        console.error('✗ Error en GET /api/public/calles/:orden_carga:', error);
        res.status(500).json({ error: 'Error al obtener calle' });
    }
});

// ──────────────────────────────────────────────
// GET /api/public/barrios
// ──────────────────────────────────────────────

const ZONAS_VALIDAS = ['Norte', 'Sur', 'Sin zona'];

router.get('/barrios', async (req, res) => {
    try {
        const { q, zona } = req.query;
        const limit  = parsearLimit(req.query.limit);
        const offset = parsearOffset(req.query.offset);

        let whereSql   = 'WHERE activo = TRUE';
        const params      = [];
        const countParams = [];

        if (q && q.trim()) {
            const busqueda = `%${q.trim()}%`;
            whereSql += ' AND (nombre_barrio LIKE ? OR ordenanza_barrio LIKE ? OR resolucion_barrio LIKE ?)';
            params.push(busqueda, busqueda, busqueda);
            countParams.push(busqueda, busqueda, busqueda);
        }

        if (zona && ZONAS_VALIDAS.includes(zona)) {
            whereSql += ' AND zona_barrio = ?';
            params.push(zona);
            countParams.push(zona);
        }

        const sql = `
            SELECT id_barrio, zona_barrio, nombre_barrio,
                   ordenanza_barrio, resolucion_barrio, observaciones_barrio
            FROM barrios ${whereSql}
            ORDER BY nombre_barrio ASC
            LIMIT ? OFFSET ?`;

        const countSql = `SELECT COUNT(*) AS total FROM barrios ${whereSql}`;

        params.push(limit, offset);

        const [data, countRows] = await Promise.all([
            db.query(sql, params),
            db.query(countSql, countParams)
        ]);

        res.json({
            data,
            total:  countRows[0].total,
            limit,
            offset
        });

    } catch (error) {
        console.error('✗ Error en GET /api/public/barrios:', error);
        res.status(500).json({ error: 'Error al obtener barrios' });
    }
});

// ──────────────────────────────────────────────
// GET /api/public/barrios/:id_barrio
// ──────────────────────────────────────────────
router.get('/barrios/:id_barrio', async (req, res) => {
    try {
        const id = parseInt(req.params.id_barrio);

        if (isNaN(id) || id <= 0) {
            return res.status(400).json({ error: 'id_barrio debe ser un número entero positivo' });
        }

        const barrios = await db.query(
            `SELECT id_barrio, zona_barrio, nombre_barrio,
                    ordenanza_barrio, resolucion_barrio, observaciones_barrio
             FROM barrios WHERE id_barrio = ? AND activo = TRUE`,
            [id]
        );

        if (barrios.length === 0) {
            return res.status(404).json({ error: 'Barrio no encontrado' });
        }

        res.json(barrios[0]);

    } catch (error) {
        console.error('✗ Error en GET /api/public/barrios/:id_barrio:', error);
        res.status(500).json({ error: 'Error al obtener barrio' });
    }
});

// ──────────────────────────────────────────────
// GET /api/public/stats
// ──────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [callesRow, barriosRow, ultimaRow] = await Promise.all([
            db.query('SELECT COUNT(*) AS total FROM calles  WHERE activo = TRUE'),
            db.query('SELECT COUNT(*) AS total FROM barrios WHERE activo = TRUE'),
            db.query(`SELECT GREATEST(
                        COALESCE((SELECT MAX(updated_at) FROM calles  WHERE activo = TRUE), '1970-01-01'),
                        COALESCE((SELECT MAX(updated_at) FROM barrios WHERE activo = TRUE), '1970-01-01')
                      ) AS ultima_actualizacion`)
        ]);

        res.json({
            calles:      callesRow[0].total,
            barrios:     barriosRow[0].total,
            actualizado: ultimaRow[0].ultima_actualizacion
        });

    } catch (error) {
        console.error('✗ Error en GET /api/public/stats:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

module.exports = router;
