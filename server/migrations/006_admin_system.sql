-- Admin role and one-time admin invite codes.
-- Execute: mysql -u hologrip -p hologrip_db < migrations/006_admin_system.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user' AFTER password_hash;

CREATE TABLE IF NOT EXISTS admin_invites (
  id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  code          VARCHAR(32)      NULL,
  code_hash     VARCHAR(64)      NOT NULL UNIQUE,
  created_by    BIGINT UNSIGNED  NULL,
  used_by       BIGINT UNSIGNED  NULL,
  used_at       DATETIME         NULL,
  expires_at    DATETIME         NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_invites_used_at (used_at),
  INDEX idx_admin_invites_expires_at (expires_at),
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE admin_invites
  ADD COLUMN IF NOT EXISTS code VARCHAR(32) NULL AFTER id;
