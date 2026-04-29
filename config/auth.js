/**
 * Configuración de autenticación
 * JWT y bcrypt settings
 */

module.exports = {
    jwt: {
        secret:    process.env.JWT_SECRET || 'default_secret_cambiar_en_produccion',
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    },
    bcrypt: {
        rounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
    }
};
