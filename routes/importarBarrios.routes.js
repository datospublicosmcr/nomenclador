/**
 * Importación masiva de barrios desde CSV
 *
 * POST /api/barrios/importar/preview  — analiza CSV y retorna preview de cambios
 * POST /api/barrios/importar/aplicar  — aplica los cambios seleccionados
 *
 * Clave única: id_barrio (PK manual, requerido en el CSV).
 * Zonas válidas: 'Norte', 'Sur', 'Sin zona'.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { verificarToken, verificarPermiso } = require('../middleware/auth.middleware');

router.use(verificarToken);
router.use(verificarPermiso('barrios', 'editar'));

const ZONAS_VALIDAS = ['Norte', 'Sur', 'Sin zona'];

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

function formatearZona(zona) {
    if (!zona) return null;
    const z = zona.toString().trim().toLowerCase();
    if (z === 'norte')    return 'Norte';
    if (z === 'sur')      return 'Sur';
    if (z === 'sin zona' || z === 'sin_zona' || z === 'sinzona') return 'Sin zona';
    return zona.toString().trim(); // se validará después
}

function sonDiferentes(v1, v2) {
    return normalizarParaComparar(v1) !== normalizarParaComparar(v2);
}

// ──────────────────────────────────────────────
// POST /api/barrios/importar/preview
// ──────────────────────────────────────────────
router.post('/preview', async (req, res) => {
    try {
        const { registros } = req.body;
        if (!Array.isArray(registros) || registros.length === 0) {
            return res.status(400).json({ error: 'No se recibieron registros para procesar' });
        }

        const barriosBD = await db.query(
            `SELECT id_barrio, zona_barrio, nombre_barrio,
                    ordenanza_barrio, resolucion_barrio, observaciones_barrio, activo
             FROM barrios`
        );

        const activosPorId    = new Map();
        const eliminadosPorId = new Map();
        barriosBD.forEach(b => {
            if (b.activo) activosPorId.set(b.id_barrio, b);
            else          eliminadosPorId.set(b.id_barrio, b);
        });

        // Detectar id_barrio duplicados dentro del CSV
        const idEnCSV = new Map();
        registros.forEach((reg, i) => {
            const id = parseInt(reg.id_barrio);
            if (!isNaN(id) && id > 0) {
                if (!idEnCSV.has(id)) idEnCSV.set(id, []);
                idEnCSV.get(id).push(i);
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

        const idProcesados = new Set();

        for (let i = 0; i < registros.length; i++) {
            const reg = registros[i];
            try {
                // Validar id_barrio
                const idNum = parseInt(reg.id_barrio);
                if (!reg.id_barrio || isNaN(idNum) || idNum <= 0) {
                    resultado.errores.push({ fila: i + 2, registro: reg, error: 'id_barrio es requerido y debe ser entero positivo' });
                    resultado.estadisticas.errores++;
                    continue;
                }

                // Validar nombre
                if (!reg.nombre_barrio || !reg.nombre_barrio.trim()) {
                    resultado.errores.push({ fila: i + 2, registro: reg, error: 'nombre_barrio es requerido' });
                    resultado.estadisticas.errores++;
                    continue;
                }

                // Validar zona
                const zona = formatearZona(reg.zona_barrio);
                if (!zona || !ZONAS_VALIDAS.includes(zona)) {
                    resultado.errores.push({
                        fila: i + 2, registro: reg,
                        error: `zona_barrio inválida: "${reg.zona_barrio}". Válidas: ${ZONAS_VALIDAS.join(', ')}`
                    });
                    resultado.estadisticas.errores++;
                    continue;
                }

                // Verificar duplicado en CSV
                if ((idEnCSV.get(idNum) || []).length > 1) {
                    if (!idProcesados.has(idNum)) {
                        resultado.duplicadosCSV.push({
                            id_barrio: idNum,
                            registros: idEnCSV.get(idNum).map(idx => ({ fila: idx + 2, ...registros[idx] }))
                        });
                        resultado.estadisticas.duplicados_csv++;
                        idProcesados.add(idNum);
                    }
                    continue;
                }

                const datosCSV = {
                    id_barrio:            idNum,
                    zona_barrio:          zona,
                    nombre_barrio:        formatearParaBD(reg.nombre_barrio),
                    ordenanza_barrio:     formatearParaBD(reg.ordenanza_barrio),
                    resolucion_barrio:    formatearParaBD(reg.resolucion_barrio),
                    observaciones_barrio: formatearParaBD(reg.observaciones_barrio)
                };

                // Verificar si está en eliminados
                if (eliminadosPorId.has(idNum)) {
                    const b = eliminadosPorId.get(idNum);
                    resultado.eliminados.push({
                        id_barrio: b.id_barrio,
                        datosBD: {
                            id_barrio: b.id_barrio, zona_barrio: b.zona_barrio,
                            nombre_barrio: b.nombre_barrio, ordenanza_barrio: b.ordenanza_barrio,
                            resolucion_barrio: b.resolucion_barrio, observaciones_barrio: b.observaciones_barrio
                        },
                        datosCSV
                    });
                    resultado.estadisticas.eliminados++;
                    continue;
                }

                // Verificar si está activo
                if (activosPorId.has(idNum)) {
                    const b = activosPorId.get(idNum);
                    const cambios = [];

                    const campos = [
                        { campo: 'zona_barrio',          label: 'Zona' },
                        { campo: 'nombre_barrio',         label: 'Nombre' },
                        { campo: 'ordenanza_barrio',      label: 'Ordenanza' },
                        { campo: 'resolucion_barrio',     label: 'Resolución' },
                        { campo: 'observaciones_barrio',  label: 'Observaciones' }
                    ];

                    for (const { campo, label } of campos) {
                        if (sonDiferentes(b[campo], datosCSV[campo])) {
                            cambios.push({
                                campo, label,
                                valorBD:  b[campo]         || '(vacío)',
                                valorCSV: datosCSV[campo]  || '(vacío)'
                            });
                        }
                    }

                    if (cambios.length > 0) {
                        resultado.actualizar.push({
                            id_barrio: b.id_barrio,
                            datosBD: {
                                id_barrio: b.id_barrio, zona_barrio: b.zona_barrio,
                                nombre_barrio: b.nombre_barrio
                            },
                            datosCSV, cambios
                        });
                        resultado.estadisticas.actualizar++;
                    } else {
                        resultado.sinCambios.push({ id_barrio: b.id_barrio, nombre_barrio: b.nombre_barrio, zona_barrio: b.zona_barrio });
                        resultado.estadisticas.sin_cambios++;
                    }
                    continue;
                }

                // Barrio nuevo
                resultado.nuevos.push({ datosCSV });
                resultado.estadisticas.nuevos++;

            } catch (err) {
                resultado.errores.push({ fila: i + 2, registro: reg, error: err.message });
                resultado.estadisticas.errores++;
            }
        }

        res.json(resultado);
    } catch (err) {
        console.error('✗ Error en preview importar barrios:', err);
        res.status(500).json({ error: 'Error al procesar el preview de importación' });
    }
});

// ──────────────────────────────────────────────
// POST /api/barrios/importar/aplicar
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
                    `INSERT INTO barrios
                        (id_barrio, zona_barrio, nombre_barrio,
                         ordenanza_barrio, resolucion_barrio, observaciones_barrio, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [d.id_barrio, d.zona_barrio, d.nombre_barrio,
                     d.ordenanza_barrio, d.resolucion_barrio, d.observaciones_barrio,
                     req.user.id_usuario]
                );
                resultados.insertados.push({ id_barrio: d.id_barrio, nombre_barrio: d.nombre_barrio });
                resultados.resumen.total_insertados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'insertar', id_barrio: item.datosCSV?.id_barrio, nombre: item.datosCSV?.nombre_barrio, error: err.message });
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
                vals.push(req.user.id_usuario, item.id_barrio);
                await connection.execute(`UPDATE barrios SET ${sets.join(', ')} WHERE id_barrio = ?`, vals);
                resultados.actualizados.push({ id_barrio: item.datosBD.id_barrio, nombre_barrio: item.datosBD.nombre_barrio, cambios: detalle });
                resultados.resumen.total_actualizados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'actualizar', id_barrio: item.datosBD?.id_barrio, nombre: item.datosBD?.nombre_barrio, error: err.message });
                resultados.resumen.total_errores++;
            }
        }

        for (const item of reactivar) {
            try {
                const d = item.datosCSV;
                await connection.execute(
                    `UPDATE barrios SET
                        activo = TRUE,
                        zona_barrio          = ?,
                        nombre_barrio        = ?,
                        ordenanza_barrio     = ?,
                        resolucion_barrio    = ?,
                        observaciones_barrio = ?,
                        updated_by = ?, updated_at = NOW()
                     WHERE id_barrio = ?`,
                    [d.zona_barrio, d.nombre_barrio, d.ordenanza_barrio,
                     d.resolucion_barrio, d.observaciones_barrio,
                     req.user.id_usuario, item.id_barrio]
                );
                resultados.reactivados.push({ id_barrio: d.id_barrio, nombre_barrio: d.nombre_barrio });
                resultados.resumen.total_reactivados++;
            } catch (err) {
                resultados.errores.push({ tipo: 'reactivar', id_barrio: item.datosCSV?.id_barrio, nombre: item.datosCSV?.nombre_barrio, error: err.message });
                resultados.resumen.total_errores++;
            }
        }

        await connection.commit();

        const r = resultados.resumen;
        res.json({
            success: true,
            mensaje: `Importación completada: ${r.total_insertados} insertados, ${r.total_actualizados} actualizados, ${r.total_reactivados} reactivados`,
            resultados
        });
    } catch (err) {
        await connection.rollback();
        console.error('✗ Error al aplicar importar barrios:', err);
        res.status(500).json({ error: 'Error al aplicar la importación' });
    } finally {
        connection.release();
    }
});

module.exports = router;
