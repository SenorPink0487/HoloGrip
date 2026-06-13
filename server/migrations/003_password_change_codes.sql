-- HoloGrip 修改密码邮箱验证码表
-- 执行: mysql -u hologrip -p hologrip_db < migrations/003_password_change_codes.sql

CREATE TABLE IF NOT EXISTS password_change_codes (
  user_id       BIGINT UNSIGNED  NOT NULL PRIMARY KEY,
  email         VARCHAR(255)     NOT NULL,
  code_hash     VARCHAR(255)     NOT NULL,
  attempts      INT              NOT NULL DEFAULT 0,
  expires_at    DATETIME         NOT NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_password_change_codes_expires_at (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
