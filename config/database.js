/**
 * Configuración de conexión a MariaDB
 * Usa mysql2 con soporte para Promises
 */

const mysql = require('mysql2/promise');

// Pool de conexiones
const pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    port:     process.env.DB_PORT || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

/**
 * Prueba la conexión al iniciar el servidor
 */
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✓ Conexión a MariaDB establecida correctamente');
        connection.release();
        return true;
    } catch (error) {
        console.error('✗ Error al conectar con MariaDB:', error.message);
        throw error;
    }
}

/**
 * Ejecutar una consulta SQL
 * @param {string} sql    - Consulta SQL
 * @param {Array}  params - Parámetros para la consulta
 * @returns {Promise}     - Resultado de la consulta
 */
async function query(sql, params = []) {
    try {
        const [results] = await pool.execute(sql, params);
        return results;
    } catch (error) {
        console.error('✗ Error en consulta SQL:', error.message);
        console.error('→ Query:', sql);
        throw error;
    }
}

/**
 * Obtener una conexión del pool (para transacciones)
 * @returns {Promise<Connection>}
 */
async function getConnection() {
    return await pool.getConnection();
}

module.exports = { pool, query, getConnection, testConnection };
