-- 执行: mysql -u hologrip -p hologrip_db < migrations/004_whiteboard_snapshots.sql

CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
  user_id       BIGINT UNSIGNED  NOT NULL PRIMARY KEY,
  data_json     LONGTEXT         NOT NULL,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
