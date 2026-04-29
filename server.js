/**
 * Nomenclador de Calles y Barrios
 * Municipalidad de Comodoro Rivadavia — DDPC
 * Punto de entrada del servidor
 */

require('dotenv').config();

const express     = require('express');
const helmet      = require('helmet');
const cors        = require('cors');
const compression = require('compression');
const path        = require('path');

const db = require('./config/database');
const { publicApiLimit } = require('./config/rateLimits');

const app = express();

// ──────────────────────────────────────────────
// Middlewares globales
// ──────────────────────────────────────────────

// Headers de seguridad (CSP desactivado: el frontend usa inline styles/scripts)
app.use(helmet({ contentSecurityPolicy: false }));

// Compresión GZIP para respuestas > 1KB
app.use(compression());

// Body parsers (10mb para soportar CSVs grandes en importación)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Anti-caché para todas las rutas de API
app.use('/api', (req, res, next) => {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma':        'no-cache',
        'Expires':       '0'
    });
    next();
});

// CORS abierto solo para la API pública (consumo por terceros y datos abiertos)
app.use('/api/public', cors());

// Rate limiting para la API pública
app.use('/api/public', publicApiLimit);

// ──────────────────────────────────────────────
// Rutas de la API
// ──────────────────────────────────────────────

// Health check (útil para monitoreo en VPS)
app.get('/api/health', (req, res) => {
    res.json({
        status:      'OK',
        app:         process.env.APP_NAME || 'Nomenclador',
        timestamp:   new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// API pública (sin auth)
app.use('/api/public', require('./routes/public.routes'));

// Auth admin
app.use('/api/auth', require('./routes/auth.routes'));

// Estadísticas del dashboard admin
app.use('/api/stats', require('./routes/stats.routes'));

// CRUD admin — importar ANTES que el CRUD general para evitar que /:id capture la ruta
app.use('/api/calles/importar', require('./routes/importarCalles.routes'));
app.use('/api/calles',          require('./routes/calles.routes'));

app.use('/api/barrios/importar', require('./routes/importarBarrios.routes'));
app.use('/api/barrios',          require('./routes/barrios.routes'));

// ──────────────────────────────────────────────
// Archivos estáticos (cara pública + panel admin)
// ──────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// Fallback para rutas del frontend (SPA-style para el admin)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        res.status(404).json({ error: 'Endpoint no encontrado' });
    }
});

// ──────────────────────────────────────────────
// Error handler centralizado (debe ir al final)
// ──────────────────────────────────────────────

app.use(require('./middleware/error.middleware'));

// ──────────────────────────────────────────────
// Arranque
// ──────────────────────────────────────────────

const PORT = process.env.PORT || 3006;

db.testConnection()
    .then(() => {
        app.listen(PORT, () => {
            console.log('══════════════════════════════════════════');
            console.log('  Nomenclador de Calles y Barrios');
            console.log('  Municipalidad de Comodoro Rivadavia');
            console.log('══════════════════════════════════════════');
            console.log(`  Puerto:   ${PORT}`);
            console.log(`  Ambiente: ${process.env.NODE_ENV || 'development'}`);
            console.log('══════════════════════════════════════════');
        });
    })
    .catch(err => {
        console.error('✗ Error al conectar a la base de datos:', err.message);
        process.exit(1);
    });
