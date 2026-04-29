/**
 * Rutas de autenticación
 *
 * POST /api/auth/login           - Iniciar sesión
 * POST /api/auth/cambiar-password - Cambiar contraseña
 * GET  /api/auth/me              - Obtener usuario actual + permisos
 * PUT  /api/auth/perfil          - Actualizar perfil del usuario
 */

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const authConfig = require('../config/auth');
const { verificarToken } = require('../middleware/auth.middleware');
const { loginLimit } = require('../config/rateLimits');

/**
 * POST /api/auth/login
 * Rate limit estricto: 10 intentos por 15 minutos por IP
 */
router.post('/login', loginLimit, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Usuario y contraseña son requeridos'
            });
        }

        const usuarios = await db.query(
            'SELECT * FROM usuarios WHERE username = ? AND activo = TRUE',
            [username]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = usuarios[0];

        const passwordValido = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordValido) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // Actualizar último login
        await db.query(
            'UPDATE usuarios SET ultimo_login = NOW() WHERE id_usuario = ?',
            [usuario.id_usuario]
        );

        const token = jwt.sign(
            {
                id_usuario:    usuario.id_usuario,
                username:      usuario.username,
                es_superadmin: usuario.es_superadmin
            },
            authConfig.jwt.secret,
            { expiresIn: authConfig.jwt.expiresIn }
        );

        // Permisos: superadmin recibe 'all', el resto recibe su lista de módulos
        let permisos = [];
        if (!usuario.es_superadmin) {
            permisos = await db.query(`
                SELECT m.codigo, m.nombre, pu.puede_ver, pu.puede_editar
                FROM permisos_usuarios pu
                INNER JOIN modulos m ON pu.id_modulo = m.id_modulo
                WHERE pu.id_usuario = ? AND m.activo = TRUE
                ORDER BY m.orden
            `, [usuario.id_usuario]);
        }

        res.json({
            message: 'Login exitoso',
            token,
            usuario: {
                id_usuario:            usuario.id_usuario,
                username:              usuario.username,
                nombre:                usuario.nombre,
                email:                 usuario.email,
                sexo:                  usuario.sexo,
                es_superadmin:         usuario.es_superadmin,
                debe_cambiar_password: usuario.debe_cambiar_password
            },
            permisos: usuario.es_superadmin ? 'all' : permisos
        });

    } catch (error) {
        console.error('✗ Error en login:', error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

/**
 * POST /api/auth/cambiar-password
 */
router.post('/cambiar-password', verificarToken, async (req, res) => {
    try {
        const { password_actual, password_nuevo } = req.body;
        const id_usuario = req.user.id_usuario;

        if (!password_actual || !password_nuevo) {
            return res.status(400).json({
                error: 'Contraseña actual y nueva son requeridas'
            });
        }

        if (password_nuevo.length < 8) {
            return res.status(400).json({
                error: 'La nueva contraseña debe tener al menos 8 caracteres'
            });
        }

        const usuarios = await db.query(
            'SELECT password_hash FROM usuarios WHERE id_usuario = ?',
            [id_usuario]
        );

        const passwordValido = await bcrypt.compare(password_actual, usuarios[0].password_hash);

        if (!passwordValido) {
            return res.status(401).json({ error: 'Contraseña actual incorrecta' });
        }

        const nuevoHash = await bcrypt.hash(password_nuevo, authConfig.bcrypt.rounds);

        await db.query(
            'UPDATE usuarios SET password_hash = ?, debe_cambiar_password = FALSE, updated_at = NOW(), updated_by = ? WHERE id_usuario = ?',
            [nuevoHash, id_usuario, id_usuario]
        );

        res.json({ message: 'Contraseña actualizada correctamente' });

    } catch (error) {
        console.error('✗ Error al cambiar contraseña:', error);
        res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
});

/**
 * GET /api/auth/me
 */
router.get('/me', verificarToken, async (req, res) => {
    try {
        const usuarios = await db.query(`
            SELECT id_usuario, username, nombre, email, sexo,
                   es_superadmin, debe_cambiar_password, ultimo_login
            FROM usuarios WHERE id_usuario = ?
        `, [req.user.id_usuario]);

        if (usuarios.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const usuario = usuarios[0];
        let permisos = [];

        if (!usuario.es_superadmin) {
            permisos = await db.query(`
                SELECT m.codigo, m.nombre, m.icono, m.ruta, m.color,
                       pu.puede_ver, pu.puede_editar
                FROM permisos_usuarios pu
                INNER JOIN modulos m ON pu.id_modulo = m.id_modulo
                WHERE pu.id_usuario = ? AND m.activo = TRUE AND pu.puede_ver = TRUE
                ORDER BY m.orden
            `, [req.user.id_usuario]);
        } else {
            // Superadmin: todos los módulos activos con acceso total
            permisos = await db.query(`
                SELECT codigo, nombre, icono, ruta, color,
                       TRUE AS puede_ver, TRUE AS puede_editar
                FROM modulos WHERE activo = TRUE ORDER BY orden
            `);
        }

        res.json({ usuario, permisos });

    } catch (error) {
        console.error('✗ Error en /me:', error);
        res.status(500).json({ error: 'Error al obtener datos del usuario' });
    }
});

/**
 * PUT /api/auth/perfil
 */
router.put('/perfil', verificarToken, async (req, res) => {
    try {
        const { nombre, email, sexo } = req.body;
        const id_usuario = req.user.id_usuario;

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'Email inválido' });
        }

        if (sexo && !['Varon', 'Mujer', 'No Binario'].includes(sexo)) {
            return res.status(400).json({ error: 'Valor de sexo inválido' });
        }

        const updates = [];
        const values  = [];

        if (nombre !== undefined) { updates.push('nombre = ?'); values.push(nombre); }
        if (email  !== undefined) { updates.push('email = ?');  values.push(email);  }
        if (sexo   !== undefined) { updates.push('sexo = ?');   values.push(sexo);   }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No hay datos para actualizar' });
        }

        updates.push('updated_at = NOW()', 'updated_by = ?');
        values.push(id_usuario, id_usuario);

        await db.query(
            `UPDATE usuarios SET ${updates.join(', ')} WHERE id_usuario = ?`,
            values
        );

        const usuarios = await db.query(`
            SELECT id_usuario, username, nombre, email, sexo,
                   es_superadmin, debe_cambiar_password
            FROM usuarios WHERE id_usuario = ?
        `, [id_usuario]);

        res.json({
            message: 'Perfil actualizado correctamente',
            usuario: usuarios[0]
        });

    } catch (error) {
        console.error('✗ Error al actualizar perfil:', error);
        res.status(500).json({ error: 'Error al actualizar perfil' });
    }
});

module.exports = router;
