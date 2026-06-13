-- 执行: mysql -u hologrip -p hologrip_db < migrations/005_lessons_whiteboards.sql

CREATE TABLE IF NOT EXISTS lessons (
  id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  class_id      BIGINT UNSIGNED  NOT NULL,
  title         VARCHAR(255)     NOT NULL,
  lesson_date   DATE             NOT NULL,
  created_by    BIGINT UNSIGNED  NOT NULL,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_lessons_class_date (class_id, lesson_date),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_whiteboard_snapshots (
  lesson_id     BIGINT UNSIGNED  NOT NULL PRIMARY KEY,
  data_json     LONGTEXT         NOT NULL,
  version       BIGINT UNSIGNED  NOT NULL DEFAULT 1,
  updated_by    BIGINT UNSIGNED  NOT NULL,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
