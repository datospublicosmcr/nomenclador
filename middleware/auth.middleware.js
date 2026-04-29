/**
 * Middleware de autenticación y autorización
 */

const jwt = require('jsonwebtoken');
const authConfig = require('../config/auth');
const db = require('../config/database');

/**
 * Verificar que el usuario esté autenticado (token JWT válido)
 */
const verificarToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                error: 'Acceso denegado. Token no proporcionado.'
            });
        }

        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, authConfig.jwt.secret);

        // Verificar que el usuario existe y está activo
        const usuarios = await db.query(
            'SELECT id_usuario, username, email, es_superadmin, debe_cambiar_password, activo FROM usuarios WHERE id_usuario = ?',
            [decoded.id_usuario]
        );

        if (usuarios.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }

        const usuario = usuarios[0];

        if (!usuario.activo) {
            return res.status(401).json({ error: 'Usuario desactivado' });
        }

        req.user = {
            id_usuario:            usuario.id_usuario,
            username:              usuario.username,
            email:                 usuario.email,
            es_superadmin:         usuario.es_superadmin,
            debe_cambiar_password: usuario.debe_cambiar_password
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        console.error('✗ Error en verificarToken:', error);
        return res.status(500).json({ error: 'Error al verificar autenticación' });
    }
};

/**
 * Verificar que el usuario sea superadmin
 */
const verificarSuperadmin = (req, res, next) => {
    if (!req.user.es_superadmin) {
        return res.status(403).json({
            error: 'Acceso denegado. Se requieren permisos de superadministrador.'
        });
    }
    next();
};

/**
 * Verificar permisos para un módulo específico
 * @param {string} codigoModulo - Código del módulo ('calles' | 'barrios')
 * @param {string} tipoPermiso  - 'ver' | 'editar'
 */
const verificarPermiso = (codigoModulo, tipoPermiso = 'ver') => {
    return async (req, res, next) => {
        try {
            // Superadmin tiene acceso total sin chequear permisos_usuarios
            if (req.user.es_superadmin) {
                return next();
            }

            const permisos = await db.query(`
                SELECT pu.puede_ver, pu.puede_editar
                FROM permisos_usuarios pu
                INNER JOIN modulos m ON pu.id_modulo = m.id_modulo
                WHERE pu.id_usuario = ? AND m.codigo = ? AND m.activo = TRUE
            `, [req.user.id_usuario, codigoModulo]);

            if (permisos.length === 0) {
                return res.status(403).json({
                    error: `No tienes permisos para acceder al módulo "${codigoModulo}"`
                });
            }

            const permiso = permisos[0];

            if (tipoPermiso === 'editar' && !permiso.puede_editar) {
                return res.status(403).json({
                    error: `No tienes permisos de edición en el módulo "${codigoModulo}"`
                });
            }

            if (tipoPermiso === 'ver' && !permiso.puede_ver) {
                return res.status(403).json({
                    error: `No tienes permisos de lectura en el módulo "${codigoModulo}"`
                });
            }

            next();
        } catch (error) {
            console.error('✗ Error en verificarPermiso:', error);
            return res.status(500).json({ error: 'Error al verificar permisos' });
        }
    };
};

module.exports = { verificarToken, verificarSuperadmin, verificarPermiso };
