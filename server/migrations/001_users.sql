-- HoloGrip 用户表
-- 执行: mysql -u hologrip -p hologrip_db < migrations/001_users.sql

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(32)      NOT NULL UNIQUE,
  email         VARCHAR(255)     NOT NULL UNIQUE,
  password_hash VARCHAR(255)     NOT NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
