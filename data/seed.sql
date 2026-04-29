-- ============================================
-- Nomenclador de Calles y Barrios
-- Schema completo
-- Codificación: utf8mb4_unicode_ci
-- ============================================

CREATE DATABASE IF NOT EXISTS nomenclador
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE nomenclador;

-- --------------------------------------------
-- Tabla: calles
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS calles (
    id_calle       INT(11)      NOT NULL AUTO_INCREMENT,
    orden_carga    INT(11)      DEFAULT NULL COMMENT 'Orden oficial de carga (puede ser NULL para rutas)',
    nombre_calle   VARCHAR(150) NOT NULL    COMMENT 'Nombre oficial de la calle',
    observacion_calle TEXT      DEFAULT NULL COMMENT 'Notas adicionales (zona, referencias, ex-nombres)',
    activo         TINYINT(1)   DEFAULT 1   COMMENT 'Soft delete',
    created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by     INT(11)      DEFAULT NULL,
    updated_by     INT(11)      DEFAULT NULL,
    PRIMARY KEY (id_calle),
    -- MariaDB permite múltiples NULLs en UNIQUE KEY, así las rutas
    -- (orden_carga = NULL) no entran en conflicto entre sí.
    -- El activo en el índice permite reactivar calles eliminadas.
    UNIQUE KEY uk_orden_carga_activo (orden_carga, activo),
    KEY idx_nombre_calle (nombre_calle),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Nomenclatura de calles';

-- --------------------------------------------
-- Tabla: barrios
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS barrios (
    id_barrio           INT(11)      NOT NULL,  -- NO autoincremental, se preserva del CSV
    zona_barrio         ENUM('Norte','Sur','Sin zona') NOT NULL DEFAULT 'Sin zona' COMMENT 'Zona geográfica',
    nombre_barrio       VARCHAR(100) NOT NULL    COMMENT 'Nombre del barrio',
    ordenanza_barrio    VARCHAR(50)  DEFAULT NULL COMMENT 'Ordenanza de creación',
    resolucion_barrio   VARCHAR(50)  DEFAULT NULL COMMENT 'Resolución asociada',
    observaciones_barrio TEXT        DEFAULT NULL COMMENT 'Notas adicionales',
    activo              TINYINT(1)   DEFAULT 1   COMMENT 'Soft delete',
    created_at          DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by          INT(11)      DEFAULT NULL,
    updated_by          INT(11)      DEFAULT NULL,
    PRIMARY KEY (id_barrio),
    KEY idx_nombre_barrio (nombre_barrio),
    KEY idx_zona_barrio (zona_barrio),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Barrios y zonas de la ciudad';

-- --------------------------------------------
-- Tabla: usuarios (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario           INT(11)      NOT NULL AUTO_INCREMENT,
    username             VARCHAR(50)  NOT NULL UNIQUE,
    password_hash        VARCHAR(255) NOT NULL,
    nombre               VARCHAR(100) DEFAULT NULL,
    email                VARCHAR(100) DEFAULT NULL,
    sexo                 ENUM('Varon','Mujer','No Binario') DEFAULT NULL,
    es_superadmin        TINYINT(1)   DEFAULT 0,
    debe_cambiar_password TINYINT(1)  DEFAULT 1,
    activo               TINYINT(1)   DEFAULT 1,
    ultimo_login         DATETIME     DEFAULT NULL,
    created_at           DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_by           INT(11)      DEFAULT NULL,
    updated_by           INT(11)      DEFAULT NULL,
    PRIMARY KEY (id_usuario),
    KEY idx_username (username),
    KEY idx_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------
-- Tabla: modulos (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS modulos (
    id_modulo   INT(11)      NOT NULL AUTO_INCREMENT,
    codigo      VARCHAR(50)  NOT NULL UNIQUE,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT         DEFAULT NULL,
    icono       VARCHAR(50)  DEFAULT NULL,
    color       VARCHAR(20)  DEFAULT NULL,
    ruta        VARCHAR(100) DEFAULT NULL,
    orden       INT(11)      DEFAULT 0,
    activo      TINYINT(1)   DEFAULT 1,
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_modulo),
    KEY idx_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------
-- Tabla: permisos_usuarios (replicada del SIR)
-- --------------------------------------------
CREATE TABLE IF NOT EXISTS permisos_usuarios (
    id_permiso  INT(11)    NOT NULL AUTO_INCREMENT,
    id_usuario  INT(11)    NOT NULL,
    id_modulo   INT(11)    NOT NULL,
    puede_ver   TINYINT(1) DEFAULT 1,
    puede_editar TINYINT(1) DEFAULT 0,
    created_at  DATETIME   DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id_permiso),
    UNIQUE KEY uk_usuario_modulo (id_usuario, id_modulo),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    FOREIGN KEY (id_modulo)  REFERENCES modulos(id_modulo)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Datos iniciales
-- ============================================

-- Módulos del sistema
INSERT INTO modulos (codigo, nombre, descripcion, icono, color, ruta, orden) VALUES
    ('calles',  'Calles',  'Gestión de nomenclatura de calles', 'signpost', '#0F6E56', '/admin/calles.html',  1),
    ('barrios', 'Barrios', 'Gestión de barrios y zonas',        'home',     '#0F6E56', '/admin/barrios.html', 2);

-- Usuario superadmin inicial
-- Contraseña inicial: nomenclador2026 (debe cambiarse en el primer login)
-- IMPORTANTE: este hash es un placeholder. Ejecutar `npm run init-admin` después
-- de correr este script para insertar el hash real con bcrypt rounds=12.
INSERT INTO usuarios (username, password_hash, nombre, email, es_superadmin, debe_cambiar_password)
VALUES ('admin', '$2b$12$REEMPLAZAR_CON_HASH_REAL', 'Administrador', 'datospublicos@comodoro.gov.ar', 1, 1);
