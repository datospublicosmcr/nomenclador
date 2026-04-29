/**
 * Importación masiva de calles desde CSV
 *
 * POST /api/calles/importar/preview  — analiza CSV y retorna preview de cambios
 * POST /api/calles/importar/aplicar  — aplica los cambios seleccionados
 *
 * Clave única: orden_carga (nullable).
 * Registros sin OC en el CSV no tienen clave → siempre se tratan como nuevos.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { verificarToken, verificarPermiso } = require('../middleware/auth.middleware');

router.use(verificarToken);
router.use(verificarPermiso('calles', 'editar'));

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function normalizarParaComparar(texto) {
    if (!texto) return '';
    return texto.toString().toUpperCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*-\s*/g, '-')
        .trim();
}

function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function formatearParaBD(texto) {
    if (!texto || !texto.toString().trim()) return null;
    return toTitleCase(texto.toString().trim());
}

function sonDiferentes(v1, v2) {
    return normalizarParaComparar(v1) !== normalizarParaComparar(v2);
}

// ──────────────────────────────────────────────
// POST /api/calles/importar/preview
// ──────────────────────────────────────────────
router.post('/preview', async (req, res) => {
    try {
        const { registros } = req.body;
        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({ error: 'No se recibieron registros para procesar' });
        }

        const callesBD = await db.query(
            'SELECT id_calle, orden_carga, nombre_calle, observacion_calle, activo FROM calles'
        );

        const activasPorOC    = new Map();
        const eliminadasPorOC = new Map();
        callesBD.forEach(c => {
            if (c.activo) activasPorOC.set(c.orden_carga, c);
            else          eliminadasPorOC.set(c.orden_carga, c);
        });

        // Detectar OC duplicados dentro del CSV (solo para registros con OC)
        const ocEnCSV = new Map();
        registros.forEach((reg, i) => {
            const oc = parseInt(reg.orden_carga);
            if (!isNaN(oc) && oc > 0) {
                if (!ocEnCSV.has(oc)) ocEnCSV.set(oc, []);
                ocEnCSV.get(oc).push(i);
            }
        });

        const resultado = {
            nuevos: [], actualizar: [], sinCambios: [],
            duplicadosCSV: [], eliminados: [], errores: [],
            estadisticas: {
                total_csv: registros.length,
                nuevos: 0, actualizar: 0, sin_cambios: 0,
                duplicados_csv: 0, eliminados: 0, errores: 0
            }
        };

        const ocProcesados = new Set();

        for (let i = 0; i < registros.length; i++) {
            const reg = registros[i];
            try {
                if (!reg.nombre_calle || !reg.nombre_calle.trim()) {
                    resultado.errores.push({ fila: i + 2, registro: reg, error: 'nombre_calle es requerido' });
                    resultado.estadisticas.errores++;
                    continue;
                }

                const ocRaw    = reg.orden_carga;
                const ordenCarga = (ocRaw !== undefined && ocRaw !== null && ocRaw.toString().trim() !== '')
                    ? parseInt(ocRaw) : null;

                const datosCSV = {
                    orden_carga:       ordenCarga,
                    nombre_calle:      formatearParaBD(reg.nombre_calle),
                    observacion_calle: formatearParaBD(reg.observacion_calle)
                };

                // Sin OC → siempre nuevo (no hay clave para buscar en BD)
                if (ordenCarga === null || isNaN(ordenCarga)) {
                    resultado.nuevos.push({ datosCSV });
                    resultado.estadisticas.nuevos++;
                    continue;
                }

                // Verificar duplicado en CSV
                if ((ocEnCSV.get(ordenCarga) || []).length > 1) {
                    if (!ocProcesados.has(ordenCarga)) {
                        resultado.duplicadosCSV.push({
                            orden_carga: ordenCarga,
                            registros: ocEnCSV.get(ordenCarga).map(idx => ({ fila: idx + 2, ...registros[idx] }))
                        });
                        resultado.estadisticas.duplicados_csv++;
                        ocProcesados.add(ordenCarga);
                    }
                    continue;
                }

                // Verificar si está en eliminadas
                if (eliminadasPorOC.has(ordenCarga)) {
                    const c = eliminadasPorOC.get(ordenCarga);
                    resultado.eliminados.push({
                        id_calle: c.id_calle,
                        datosBD:  { orden_carga: c.orden_carga, nombre_calle: c.nombre_calle, observacion_calle: c.observacion_calle },
                        datosCSV
                    });
                    resultado.estadisticas.eliminados++;
                    continue;
                }

                // Verificar si está activa
                if (activasPorOC.has(ordenCarga)) {
                    const c = activasPorOC.get(ordenCarga);
                    const cambios = [];

                    if (sonDiferentes(c.nombre_calle, datosCSV.nombre_calle)) {
                        cambios.push({ campo: 'nombre_calle', label: 'Nombre', valorBD: c.nombre_calle, valorCSV: datosCSV.nombre_calle });
                    }
                    if (sonDiferentes(c.observacion_calle, datosCSV.observacion_calle)) {
                        cambios.push({ campo: 'observacion_calle', label: 'Observaciones',
                            valorBD: c.observacion_calle || '(vacío)', valorCSV: datosCSV.observacion_calle || '(vacío)' });
                    }

                    if (cambios.length > 0) {
                        resultado.actualizar.push({
                            id_calle: c.id_calle,
                            datosBD:  { orden_carga: c.orden_carga, nombre_calle: c.nombre_calle, observacion_calle: c.observacion_calle },
                            datosCSV, cambios
                        });
                        resultado.estadisticas.actualizar++;
                    } else {
                        resultado.sinCambios.push({ orden_carga: c.orden_carga, nombre_calle: c.nombre_calle });
                        resultado.estadisticas.sin_cambios++;
                    }
                    continue;
                }

                // Nueva calle con OC
                resultado.nuevos.push({ datosCSV });
                resultado.estadisticas.nuevos++;

            } catch (err) {
                resultado.errores.push({ fila: i + 2, registro: reg, error: err.message });
                resultado.estadisticas.errores++;
            }
        }

        res.json(resultado);
    } catch (err) {
        console.error('✗ Error en preview importar calles:', err);
        res.status(500).json({ error: 'Error al procesar el preview de importación' });
    }
});

// ──────────────────────────────────────────────
// POST /api/calles/importar/aplicar
// ──────────────────────────────────────────────
router.post('/aplicar', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { nuevos = [], actualizar = [], reactivar = [] } = req.body;
        await connection.beginTransaction();

        const resultados = {
            insertados: [], actualizados: [], reactivados: [], errores: [],
            resumen: { total_insertados: 0, total_actualizados: 0, total_reactivados: 0, total_errores: 0 }
        };

        for (const item of nuevos) {
            try {
                const d = item.datosCSV;
                await connection.execute(
                    'INSERT INTO calles (orden_carga, nombre_calle, observacion_calle, created_by) VALUES (?, ?, ?, ?)',
                    [d.orden_carga, d.nombre_calle, d.observacion_calle, req.user.id_usuario]
                );
                resultados.insertados.push({ orden_carga: d.orden_carga, nombre_calle: d.nombre_calle });
                resultados.resumen.total_insertados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'insertar', orden_carga: item.datosCSV?.orden_carga, nombre: item.datosCSV?.nombre_calle, error: err.message });
                resultados.resumen.total_errores++;
            }
        }

        for (const item of actualizar) {
            try {
                const sets   = [];
                const vals   = [];
                const detalle = [];
                for (const cambio of item.cambios) {
                    sets.push(`${cambio.campo} = ?`);
                    vals.push(cambio.valorCSV === '(vacío)' ? null : cambio.valorCSV);
                    detalle.push({ campo: cambio.label, valor_anterior: cambio.valorBD, valor_nuevo: cambio.valorCSV });
                }
                sets.push('updated_by = ?', 'updated_at = NOW()');
                vals.push(req.user.id_usuario, item.id_calle);
                await connection.execute(`UPDATE calles SET ${sets.join(', ')} WHERE id_calle = ?`, vals);
                resultados.actualizados.push({ orden_carga: item.datosBD.orden_carga, nombre_calle: item.datosBD.nombre_calle, cambios: detalle });
                resultados.resumen.total_actualizados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'actualizar', orden_carga: item.datosBD?.orden_carga, nombre: item.datosBD?.nombre_calle, error: err.message });
                resultados.resumen.total_errores++;
            }
        }

        for (const item of reactivar) {
            try {
                const d = item.datosCSV;
                await connection.execute(
                    'UPDATE calles SET activo = TRUE, nombre_calle = ?, observacion_calle = ?, updated_by = ?, updated_at = NOW() WHERE id_calle = ?',
                    [d.nombre_calle, d.observacion_calle, req.user.id_usuario, item.id_calle]
                );
                resultados.reactivados.push({ orden_carga: d.orden_carga, nombre_calle: d.nombre_calle });
                resultados.resumen.total_reactivados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'reactivar', orden_carga: item.datosCSV?.orden_carga, nombre: item.datosCSV?.nombre_calle, error: err.message });
                resultados.resumen.total_errores++;
            }
        }

        await connection.commit();

        const r = resultados.resumen;
        res.json({
            success: true,
            mensaje: `Importación completada: ${r.total_insertados} insertadas, ${r.total_actualizados} actualizadas, ${r.total_reactivados} reactivadas`,
            resultados
        });
    } catch (err) {
        await connection.rollback();
        console.error('✗ Error al aplicar importar calles:', err);
        res.status(500).json({ error: 'Error al aplicar la importación' });
    } finally {
        connection.release();
    }
});

module.exports = router;
