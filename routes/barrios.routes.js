/**
 * CRUD admin de barrios
 * Todas las rutas requieren autenticación y permiso sobre el módulo 'barrios'
 *
 * GET    /api/barrios              - Listar (paginado + búsqueda + filtro zona)
 * GET    /api/barrios/exportar     - Exportar todos (para CSV/XLSX)
 * GET    /api/barrios/:id          - Detalle por id_barrio
 * POST   /api/barrios              - Crear (id_barrio requerido y provisto por el usuario)
 * PUT    /api/barrios/:id          - Actualizar (id_barrio no editable)
 * DELETE /api/barrios/:id          - Soft delete
 *
 * Diferencias clave respecto al SIR:
 * - id_barrio es PK manual (no autoincremental), requerido al crear
 * - Zonas válidas: 'Norte', 'Sur', 'Sin zona' (sin 'Rada Tilly')
 * - Sin campos de población, superficie ni geometría
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { verificarToken, verificarPermiso } = require('../middleware/auth.middleware');

router.use(verificarToken);

const ZONAS_VALIDAS = ['Norte', 'Sur', 'Sin zona'];

// ──────────────────────────────────────────────
// GET /api/barrios
// ──────────────────────────────────────────────
router.get('/', verificarPermiso('barrios', 'ver'), async (req, res) => {
    try {
        const { buscar, zona, pagina = 1, limite = 25 } = req.query;
        const offset = (parseInt(pagina) - 1) * parseInt(limite);

        let whereSql   = 'WHERE activo = TRUE';
        const params      = [];
        const countParams = [];

        if (buscar && buscar.trim()) {
            const b = `%${buscar.trim()}%`;
            whereSql += ' AND (nombre_barrio LIKE ? OR ordenanza_barrio LIKE ? OR resolucion_barrio LIKE ?)';
            params.push(b, b, b);
            countParams.push(b, b, b);
        }

        if (zona && ZONAS_VALIDAS.includes(zona)) {
            whereSql += ' AND zona_barrio = ?';
            params.push(zona);
            countParams.push(zona);
        }

        const sql = `
            SELECT id_barrio, zona_barrio, nombre_barrio,
                   ordenanza_barrio, resolucion_barrio, observaciones_barrio,
                   activo, created_at, updated_at, created_by, updated_by
            FROM barrios ${whereSql}
            ORDER BY nombre_barrio ASC
            LIMIT ? OFFSET ?`;

        const countSql = `SELECT COUNT(*) AS total FROM barrios ${whereSql}`;

        params.push(parseInt(limite), parseInt(offset));

        const [barrios, countRows] = await Promise.all([
            db.query(sql, params),
            db.query(countSql, countParams)
        ]);

        res.json({
            data: barrios,
            paginacion: {
                total:        countRows[0].total,
                pagina:       parseInt(pagina),
                limite:       parseInt(limite),
                totalPaginas: Math.ceil(countRows[0].total / parseInt(limite))
            }
        });

    } catch (error) {
        console.error('✗ Error al listar barrios:', error);
        res.status(500).json({ error: 'Error al obtener barrios' });
    }
});

// ──────────────────────────────────────────────
// GET /api/barrios/exportar
// Debe ir ANTES de /:id
// ──────────────────────────────────────────────
router.get('/exportar', verificarPermiso('barrios', 'ver'), async (req, res) => {
    try {
        const barrios = await db.query(`
            SELECT id_barrio, zona_barrio, nombre_barrio,
                   ordenanza_barrio, resolucion_barrio, observaciones_barrio
            FROM barrios
            WHERE activo = TRUE
            ORDER BY nombre_barrio ASC
        `);
        res.json({ data: barrios });
    } catch (error) {
        console.error('✗ Error al exportar barrios:', error);
        res.status(500).json({ error: 'Error al exportar barrios' });
    }
});

// ──────────────────────────────────────────────
// GET /api/barrios/:id
// ──────────────────────────────────────────────
router.get('/:id', verificarPermiso('barrios', 'ver'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const barrios = await db.query(
            'SELECT * FROM barrios WHERE id_barrio = ? AND activo = TRUE',
            [id]
        );

        if (barrios.length === 0) {
            return res.status(404).json({ error: 'Barrio no encontrado' });
        }

        res.json(barrios[0]);

    } catch (error) {
        console.error('✗ Error al obtener barrio:', error);
        res.status(500).json({ error: 'Error al obtener barrio' });
    }
});

// ──────────────────────────────────────────────
// POST /api/barrios
// id_barrio es requerido y provisto por el usuario (PK no autoincremental)
// ──────────────────────────────────────────────
router.post('/', verificarPermiso('barrios', 'editar'), async (req, res) => {
    try {
        const {
            id_barrio,
            zona_barrio,
            nombre_barrio,
            ordenanza_barrio,
            resolucion_barrio,
            observaciones_barrio
        } = req.body;

        // Validaciones
        const idNum = parseInt(id_barrio);
        if (!id_barrio || isNaN(idNum) || idNum <= 0) {
            return res.status(400).json({ error: 'id_barrio es requerido y debe ser un número entero positivo' });
        }

        if (!nombre_barrio || !nombre_barrio.trim()) {
            return res.status(400).json({ error: 'El nombre del barrio es requerido' });
        }

        if (!zona_barrio || !ZONAS_VALIDAS.includes(zona_barrio)) {
            return res.status(400).json({
                error: `zona_barrio inválida. Valores aceptados: ${ZONAS_VALIDAS.join(', ')}`
            });
        }

        // Verificar que el id_barrio no exista (ni activo ni inactivo, para evitar conflicto de PK)
        const existe = await db.query(
            'SELECT id_barrio FROM barrios WHERE id_barrio = ?',
            [idNum]
        );
        if (existe.length > 0) {
            return res.status(409).json({ error: `Ya existe un barrio con id_barrio ${idNum}` });
        }

        await db.query(
            `INSERT INTO barrios
                (id_barrio, zona_barrio, nombre_barrio,
                 ordenanza_barrio, resolucion_barrio, observaciones_barrio, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                idNum,
                zona_barrio,
                nombre_barrio.trim(),
                ordenanza_barrio?.trim() || null,
                resolucion_barrio?.trim() || null,
                observaciones_barrio?.trim() || null,
                req.user.id_usuario
            ]
        );

        res.status(201).json({
            message:   'Barrio creado correctamente',
            id_barrio: idNum
        });

    } catch (error) {
        console.error('✗ Error al crear barrio:', error);
        res.status(500).json({ error: 'Error al crear barrio' });
    }
});

// ──────────────────────────────────────────────
// PUT /api/barrios/:id
// id_barrio no es editable (es la PK del sistema)
// ──────────────────────────────────────────────
router.put('/:id', verificarPermiso('barrios', 'editar'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const {
            zona_barrio,
            nombre_barrio,
            ordenanza_barrio,
            resolucion_barrio,
            observaciones_barrio
        } = req.body;

        if (!nombre_barrio || !nombre_barrio.trim()) {
            return res.status(400).json({ error: 'El nombre del barrio es requerido' });
        }

        if (!zona_barrio || !ZONAS_VALIDAS.includes(zona_barrio)) {
            return res.status(400).json({
                error: `zona_barrio inválida. Valores aceptados: ${ZONAS_VALIDAS.join(', ')}`
            });
        }

        const result = await db.query(
            `UPDATE barrios SET
                zona_barrio          = ?,
                nombre_barrio        = ?,
                ordenanza_barrio     = ?,
                resolucion_barrio    = ?,
                observaciones_barrio = ?,
                updated_by           = ?,
                updated_at           = NOW()
             WHERE id_barrio = ? AND activo = TRUE`,
            [
                zona_barrio,
                nombre_barrio.trim(),
                ordenanza_barrio?.trim() || null,
                resolucion_barrio?.trim() || null,
                observaciones_barrio?.trim() || null,
                req.user.id_usuario,
                id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Barrio no encontrado' });
        }

        res.json({ message: 'Barrio actualizado correctamente' });

    } catch (error) {
        console.error('✗ Error al actualizar barrio:', error);
        res.status(500).json({ error: 'Error al actualizar barrio' });
    }
});

// ──────────────────────────────────────────────
// DELETE /api/barrios/:id
// Soft delete — pone activo = FALSE
// ──────────────────────────────────────────────
router.delete('/:id', verificarPermiso('barrios', 'editar'), async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

        const result = await db.query(
            'UPDATE barrios SET activo = FALSE, updated_by = ?, updated_at = NOW() WHERE id_barrio = ? AND activo = TRUE',
            [req.user.id_usuario, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Barrio no encontrado' });
        }

        res.json({ message: 'Barrio eliminado correctamente' });

    } catch (error) {
        console.error('✗ Error al eliminar barrio:', error);
        res.status(500).json({ error: 'Error al eliminar barrio' });
    }
});

module.exports = router;
