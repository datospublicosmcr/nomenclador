/**
 * Script de inicialización del usuario administrador
 * Genera el hash bcrypt real y lo inserta/actualiza en la BD
 *
 * Uso: npm run init-admin
 * Ejecutar después de correr data/seed.sql
 */

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('../config/database');

const USUARIO   = process.env.ADMIN_USERNAME || 'admin';
const PASSWORD  = process.env.ADMIN_PASSWORD  || 'nomenclador2026';
const NOMBRE    = 'Administrador';
const EMAIL     = process.env.CONTACT_EMAIL   || 'datospublicos@comodoro.gov.ar';
const ROUNDS    = parseInt(process.env.BCRYPT_ROUNDS) || 12;

async function init() {
    console.log(`→ Generando hash bcrypt (rounds=${ROUNDS})...`);
    const hash = await bcrypt.hash(PASSWORD, ROUNDS);

    await db.query(
        `INSERT INTO usuarios (username, password_hash, nombre, email, es_superadmin, debe_cambiar_password)
         VALUES (?, ?, ?, ?, 1, 1)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
        [USUARIO, hash, NOMBRE, EMAIL]
    );

    console.log(`✓ Usuario admin "${USUARIO}" creado/actualizado`);
    console.log(`→ Contraseña inicial: ${PASSWORD}`);
    console.log(`→ El usuario deberá cambiarla en el primer login`);
    process.exit(0);
}

init().catch(err => {
    console.error('✗ Error al inicializar admin:', err);
    process.exit(1);
});
