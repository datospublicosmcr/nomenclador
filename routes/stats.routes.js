const express = require('express');
const router  = express.Router();
const db      = require('../config/database');
const { verificarToken } = require('../middleware/auth.middleware');

router.get('/', verificarToken, async (req, res, next) => {
    try {
        const [callesResult, barriosResult] = await Promise.all([
            db.query('SELECT COUNT(*) AS total, MAX(updated_at) AS ultima_actualizacion FROM calles WHERE activo = 1'),
            db.query('SELECT COUNT(*) AS total, MAX(updated_at) AS ultima_actualizacion FROM barrios WHERE activo = 1')
        ]);
        const callesRow  = callesResult[0];
        const barriosRow = barriosResult[0];
        res.json({
            calles:  { total: Number(callesRow.total),  ultima_actualizacion: callesRow.ultima_actualizacion  },
            barrios: { total: Number(barriosRow.total), ultima_actualizacion: barriosRow.ultima_actualizacion }
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
