/**
 * Middleware centralizado de manejo de errores
 * Debe registrarse como el último middleware en server.js
 */

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
    // Log completo en consola (nunca exponer stack al cliente)
    console.error('✗ Error no manejado:', err.message);
    if (process.env.NODE_ENV !== 'production') {
        console.error(err.stack);
    }

    // Si ya se inició la respuesta no podemos hacer nada más
    if (res.headersSent) {
        return next(err);
    }

    const status = err.status || err.statusCode || 500;

    res.status(status).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Error interno del servidor'
            : err.message
    });
};
