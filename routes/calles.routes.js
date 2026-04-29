/**
 * CRUD admin de calles
 * Todas las rutas requieren autenticación y permiso sobre el módulo 'calles'
 *
 * GET  /api/calles                    - Listar (paginado + búsqueda)
 * GET  /api/calles/proximo-oc         - Próximo orden_carga disponible
 * GET  /api/calles/exportar           - Exportar todas (para CSV/XLSX)
 * GET  /api/calles/:id                - Detalle por id_calle
 * POST /api/calles                    - Crear
 * PUT  /api/calles/:id                - Actualizar
 * DELETE /api/calles/:id              - Soft delete
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { verificarToken, verificarPermiso } = require('../middleware/auth.middleware');

router.use(verificarToken);

// Orden usado en listado y exportación:
// calles con OC primero (ASC), rutas sin OC al final (alfabético)
const ORDER_SQL = `ORDER BY
    CASE WHEN orden_carga IS NULL THEN 1 ELSE 0 END,
    orden_carga ASC,
    nombre_calle ASC`;

// ──────────────────────────────────────────────
// GET /api/calles
// ──────────────────────────────────────────────
router.get('/', verificarPermiso('calles', 'ver'), async (req, res) => {
    try {
        const { buscar, pagina = 1, limite = 25 } = req.query;
        const offset = (parseInt(pagina) - 1) * parseInt(limite);

        let whereSql   = 'WHERE activo = TRUE';
        const params      = [];
        const countParams = [];

        if (buscar && buscar.trim()) {
            const b = `%${buscar.trim()}%`;
            whereSql += ' AND (CAST(orden_carga AS CHAR) LIKE ? OR nombre_calle LIKE ?)';
            params.push(b, b);
            countParams.push(b, b);
        }

        const sql = `
            SELECT id_calle, orden_carga, nombre_calle, observacion_calle,
                   activo, created_at, updated_at, created_by, updated_by
            FROM calles ${whereSql} ${ORDER_SQL}
            LIMIT ? OFFSET ?`;

        const countSql = `SELECT COUNT(*) AS total FROM calles ${whereSql}`;

        params.push(parseInt(limite), parseInt(offset));

        const [calles, countRows] = await Promise.all([
            db.query(sql, params),
            db.query(countSql, countParams)
        ]);

        res.json({
            data: calles,
            paginacion: {
                total:       countRows[0].total,
                pagina:      parseInt(pagina),
                limite:      parseInt(limite),
                totalPaginas: Math.ceil(countRows[0].total / parseInt(limite))
            }
        });

    } catch (error) {
        console.error('✗ Error al listar calles:', error);
        res.status(500).json({ error: 'Error al obtener calles' });
    }
});

// ──────────────────────────────────────────────
// GET /api/calles/proximo-oc
// Debe ir ANTES de /:id para que Express no lo confunda con un ID
// ──────────────────────────────────────────────
router.get('/proximo-oc', verificarPermiso('calles', 'ver'), async (req, res) => {
    try {
        const rows = await db.query(
            'SELECT COALESCE(MAX(orden_carga), 0) + 1 AS proximo_oc FROM calles'
        );
        res.json({ proximo_oc: rows[0].proximo_oc });
    } catch (error) {
        console.error('✗ Error al obtener próximo OC:', error);
        res.status(500).json({ error: 'Error al obtener próximo orden de carga' });
    }
});

// ──────────────────────────────────────────────
// GET /api/calles/exportar
// ──────────────────────────────────────────────
router.get('/exportar', verificarPermiso('calles', 'ver'), async (req, res) => {
    try {
        const calles = await db.query(
            `SELECT orden_carga, nombre_calle, observacion_calle
             FROM calles WHERE activo = TRUE ${ORDER_SQL}`
        );
        res.json({ data: calles });
    } catch (error) {
        console.error('✗ Error al exportar calles:', error);
        res.status(500).json({ error: 'Error al exportar calles' });
    }
});

// ──────────────────────────────────────────────
// GET /api/calles/:id
// ──────────────────────────────────────────────
router.get('/:id', verificarPermiso('calles', 'ver'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const calles = await db.query(
            'SELECT * FROM calles WHERE id_calle = ? AND activo = TRUE',
            [id]
        );

        if (calles.length === 0) {
            return res.status(404).json({ error: 'Calle no encontrada' });
        }

        res.json(calles[0]);

    } catch (error) {
        console.error('✗ Error al obtener calle:', error);
        res.status(500).json({ error: 'Error al obtener calle' });
    }
});

// ──────────────────────────────────────────────
// POST /api/calles
// ──────────────────────────────────────────────
router.post('/', verificarPermiso('calles', 'editar'), async (req, res) => {
    try {
        const { nombre_calle, observacion_calle } = req.body;
        // orden_carga puede llegar como número, string numérico, o null/undefined (ruta)
        const orden_carga = req.body.orden_carga !== undefined && req.body.orden_carga !== ''
            ? parseInt(req.body.orden_carga)
            : null;

        if (!nombre_calle || !nombre_calle.trim()) {
            return res.status(400).json({ error: 'El nombre de la calle es requerido' });
        }

        if (orden_carga !== null && isNaN(orden_carga)) {
            return res.status(400).json({ error: 'orden_carga debe ser un número entero' });
        }

        // Solo verificar duplicado si se proporcionó un OC (NULLs son siempre permitidos)
        if (orden_carga !== null) {
            const existe = await db.query(
                'SELECT id_calle FROM calles WHERE orden_carga = ? AND activo = TRUE',
                [orden_carga]
            );
            if (existe.length > 0) {
                return res.status(409).json({
                    error: `Ya existe una calle activa con orden de carga ${orden_carga}`
                });
            }
        }

        const result = await db.query(
            `INSERT INTO calles (orden_carga, nombre_calle, observacion_calle, created_by)
             VALUES (?, ?, ?, ?)`,
            [orden_carga, nombre_calle.trim(), observacion_calle?.trim() || null, req.user.id_usuario]
        );

        res.status(201).json({
            message:  'Calle creada correctamente',
            id_calle: result.insertId
        });

    } catch (error) {
        console.error('✗ Error al crear calle:', error);
        res.status(500).json({ error: 'Error al crear calle' });
    }
});

// ──────────────────────────────────────────────
// PUT /api/calles/:id
// ──────────────────────────────────────────────
router.put('/:id', verificarPermiso('calles', 'editar'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const { nombre_calle, observacion_calle } = req.body;
        const orden_carga = req.body.orden_carga !== undefined && req.body.orden_carga !== ''
            ? parseInt(req.body.orden_carga)
            : null;

        if (!nombre_calle || !nombre_calle.trim()) {
            return res.status(400).json({ error: 'El nombre de la calle es requerido' });
        }

        if (orden_carga !== null && isNaN(orden_carga)) {
            return res.status(400).json({ error: 'orden_carga debe ser un número entero' });
        }

        // Verificar que el OC no lo use otra calle activa
        if (orden_carga !== null) {
            const existe = await db.query(
                'SELECT id_calle FROM calles WHERE orden_carga = ? AND id_calle != ? AND activo = TRUE',
                [orden_carga, id]
            );
            if (existe.length > 0) {
                return res.status(409).json({
                    error: `Ya existe otra calle activa con orden de carga ${orden_carga}`
                });
            }
        }

        const result = await db.query(
            `UPDATE calles
             SET orden_carga = ?, nombre_calle = ?, observacion_calle = ?,
                 updated_by = ?, updated_at = NOW()
             WHERE id_calle = ? AND activo = TRUE`,
            [orden_carga, nombre_calle.trim(), observacion_calle?.trim() || null,
             req.user.id_usuario, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Calle no encontrada' });
        }

        res.json({ message: 'Calle actualizada correctamente' });

    } catch (error) {
        console.error('✗ Error al actualizar calle:', error);
        res.status(500).json({ error: 'Error al actualizar calle' });
    }
});

// ──────────────────────────────────────────────
// DELETE /api/calles/:id
// Soft delete — pone activo = FALSE
// ──────────────────────────────────────────────
router.delete('/:id', verificarPermiso('calles', 'editar'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const result = await db.query(
            'UPDATE calles SET activo = FALSE, updated_by = ?, updated_at = NOW() WHERE id_calle = ? AND activo = TRUE',
            [req.user.id_usuario, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Calle no encontrada' });
        }

        res.json({ message: 'Calle eliminada correctamente' });

    } catch (error) {
        console.error('✗ Error al eliminar calle:', error);
        res.status(500).json({ error: 'Error al eliminar calle' });
    }
});

module.exports = router;
