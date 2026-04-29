/**
 * Configuración de rate limiting
 * Solo se aplica a la API pública (/api/public/*)
 * El panel admin no tiene rate limit
 */

const rateLimit = require('express-rate-limit');

const publicApiLimit = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
    max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        error:    'Demasiadas consultas. Intente en un minuto.',
        contacto: process.env.CONTACT_EMAIL || 'datospublicos@comodoro.gov.ar'
    }
});

// Rate limit más estricto para login (evitar fuerza bruta)
const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 10,
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        error: 'Demasiados intentos de login. Intente en 15 minutos.'
    }
});

module.exports = { publicApiLimit, loginLimit };
