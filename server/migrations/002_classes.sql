-- HoloGrip 班级管理表
-- 执行: mysql -u hologrip -p hologrip_db < migrations/002_classes.sql

CREATE TABLE IF NOT EXISTS classes (
  id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(255)     NOT NULL,
  description   TEXT             NOT NULL,
  teacher_id    BIGINT UNSIGNED  NOT NULL,
  invite_code   VARCHAR(32)      NOT NULL UNIQUE,
  created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_members (
  class_id      BIGINT UNSIGNED  NOT NULL,
  user_id       BIGINT UNSIGNED  NOT NULL,
  joined_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, user_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
