//! MySQL 连接池 + 用户 CRUD

use anyhow::{Context, Result};
use chrono::{NaiveDate, NaiveDateTime};
use sqlx::{mysql::MySqlPoolOptions, MySqlPool};

/// 用户数据库行
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: u64,
    pub username: String,
    pub email: String,
    pub password_hash: String,
}

/// 修改密码邮箱验证码记录
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PasswordChangeCodeRow {
    pub email: String,
    pub code_hash: String,
    pub attempts: i32,
    pub expires_at: NaiveDateTime,
}

/// 班级数据库行
#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct ClassRow {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub teacher_id: u64,
    pub invite_code: String,
}

/// 班级详细信息（包含教师名字）
#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct ClassDetailRow {
    pub id: u64,
    pub name: String,
    pub description: String,
    pub teacher_id: u64,
    pub teacher_name: String,
    pub invite_code: String,
}

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct LessonRow {
    pub id: u64,
    pub class_id: u64,
    pub title: String,
    pub lesson_date: NaiveDate,
    pub created_by: u64,
    pub creator_name: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LessonWhiteboardRow {
    pub data_json: String,
    pub version: u64,
}

/// 初始化连接池（最大 10 连接）
pub async fn init_pool(database_url: &str) -> Result<MySqlPool> {
    let pool = MySqlPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
        .context("连接 MySQL 失败，请检查 DATABASE_URL")?;

    // 自动建表（幂等）。MySQL/sqlx 默认不允许一次执行多条语句，需要拆开。
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
          id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
          username      VARCHAR(32)      NOT NULL UNIQUE,
          email         VARCHAR(255)     NOT NULL UNIQUE,
          password_hash VARCHAR(255)     NOT NULL,
          created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 users 表失败")?;

    sqlx::query(
        r#"
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 password_change_codes 表失败")?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS classes (
          id            BIGINT UNSIGNED  AUTO_INCREMENT PRIMARY KEY,
          name          VARCHAR(255)     NOT NULL,
          description   TEXT             NOT NULL,
          teacher_id    BIGINT UNSIGNED  NOT NULL,
          invite_code   VARCHAR(32)      NOT NULL UNIQUE,
          created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 classes 表失败")?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS class_members (
          class_id      BIGINT UNSIGNED  NOT NULL,
          user_id       BIGINT UNSIGNED  NOT NULL,
          joined_at     DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (class_id, user_id),
          FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 class_members 表失败")?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
          user_id       BIGINT UNSIGNED  NOT NULL PRIMARY KEY,
          data_json     LONGTEXT         NOT NULL,
          updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 whiteboard_snapshots 表失败")?;

    sqlx::query(
        r#"
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 lessons 表失败")?;

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS lesson_whiteboard_snapshots (
          lesson_id     BIGINT UNSIGNED  NOT NULL PRIMARY KEY,
          data_json     LONGTEXT         NOT NULL,
          version       BIGINT UNSIGNED  NOT NULL DEFAULT 1,
          updated_by    BIGINT UNSIGNED  NOT NULL,
          updated_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
          FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        "#,
    )
    .execute(&pool)
    .await
    .context("创建 lesson_whiteboard_snapshots 表失败")?;

    Ok(pool)
}

/// 创建用户，返回新用户 id
pub async fn create_user(
    pool: &MySqlPool,
    username: &str,
    email: &str,
    password_hash: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)")
        .bind(username)
        .bind(email)
        .bind(password_hash)
        .execute(pool)
        .await?;

    Ok(result.last_insert_id())
}

/// 按 email 查找用户
pub async fn find_by_email(pool: &MySqlPool, email: &str) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(
        "SELECT id, username, email, password_hash FROM users WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
}

/// 按 id 查找用户
pub async fn find_by_id(pool: &MySqlPool, id: u64) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as::<_, UserRow>(
        "SELECT id, username, email, password_hash FROM users WHERE id = ?",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

/// 更新用户密码
pub async fn update_user_password(
    pool: &MySqlPool,
    user_id: u64,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(password_hash)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 保存或覆盖修改密码邮箱验证码
pub async fn find_whiteboard_snapshot(
    pool: &MySqlPool,
    user_id: u64,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar::<_, String>("SELECT data_json FROM whiteboard_snapshots WHERE user_id = ?")
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn upsert_whiteboard_snapshot(
    pool: &MySqlPool,
    user_id: u64,
    data_json: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO whiteboard_snapshots (user_id, data_json)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          data_json = VALUES(data_json),
          updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(user_id)
    .bind(data_json)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn is_class_teacher(
    pool: &MySqlPool,
    class_id: u64,
    user_id: u64,
) -> Result<bool, sqlx::Error> {
    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM classes WHERE id = ? AND teacher_id = ?")
            .bind(class_id)
            .bind(user_id)
            .fetch_one(pool)
            .await?;
    Ok(count > 0)
}

pub async fn is_class_member(
    pool: &MySqlPool,
    class_id: u64,
    user_id: u64,
) -> Result<bool, sqlx::Error> {
    if is_class_teacher(pool, class_id, user_id).await? {
        return Ok(true);
    }

    let count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM class_members WHERE class_id = ? AND user_id = ?")
            .bind(class_id)
            .bind(user_id)
            .fetch_one(pool)
            .await?;
    Ok(count > 0)
}

pub async fn create_lesson(
    pool: &MySqlPool,
    class_id: u64,
    title: &str,
    lesson_date: NaiveDate,
    created_by: u64,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO lessons (class_id, title, lesson_date, created_by) VALUES (?, ?, ?, ?)",
    )
    .bind(class_id)
    .bind(title)
    .bind(lesson_date)
    .bind(created_by)
    .execute(pool)
    .await?;
    Ok(result.last_insert_id())
}

pub async fn list_lessons_by_date(
    pool: &MySqlPool,
    class_id: u64,
    lesson_date: NaiveDate,
) -> Result<Vec<LessonRow>, sqlx::Error> {
    sqlx::query_as::<_, LessonRow>(
        r#"
        SELECT l.id, l.class_id, l.title, l.lesson_date, l.created_by, u.username as creator_name
        FROM lessons l
        JOIN users u ON l.created_by = u.id
        WHERE l.class_id = ? AND l.lesson_date = ?
        ORDER BY l.created_at ASC, l.id ASC
        "#,
    )
    .bind(class_id)
    .bind(lesson_date)
    .fetch_all(pool)
    .await
}

pub async fn find_lesson_class_id(
    pool: &MySqlPool,
    lesson_id: u64,
) -> Result<Option<u64>, sqlx::Error> {
    sqlx::query_scalar::<_, u64>("SELECT class_id FROM lessons WHERE id = ?")
        .bind(lesson_id)
        .fetch_optional(pool)
        .await
}

pub async fn find_lesson_whiteboard(
    pool: &MySqlPool,
    lesson_id: u64,
) -> Result<Option<LessonWhiteboardRow>, sqlx::Error> {
    sqlx::query_as::<_, LessonWhiteboardRow>(
        "SELECT data_json, version FROM lesson_whiteboard_snapshots WHERE lesson_id = ?",
    )
    .bind(lesson_id)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_lesson_whiteboard(
    pool: &MySqlPool,
    lesson_id: u64,
    user_id: u64,
    data_json: &str,
    next_version: u64,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO lesson_whiteboard_snapshots (lesson_id, data_json, version, updated_by)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          data_json = VALUES(data_json),
          version = VALUES(version),
          updated_by = VALUES(updated_by),
          updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(lesson_id)
    .bind(data_json)
    .bind(next_version)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_password_change_code(
    pool: &MySqlPool,
    user_id: u64,
    email: &str,
    code_hash: &str,
    expires_at: NaiveDateTime,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        r#"
        INSERT INTO password_change_codes
          (user_id, email, code_hash, attempts, expires_at)
        VALUES (?, ?, ?, 0, ?)
        ON DUPLICATE KEY UPDATE
          email = VALUES(email),
          code_hash = VALUES(code_hash),
          attempts = 0,
          expires_at = VALUES(expires_at),
          updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(user_id)
    .bind(email)
    .bind(code_hash)
    .bind(expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

/// 按 user_id 查找修改密码验证码
pub async fn find_password_change_code(
    pool: &MySqlPool,
    user_id: u64,
) -> Result<Option<PasswordChangeCodeRow>, sqlx::Error> {
    sqlx::query_as::<_, PasswordChangeCodeRow>(
        r#"
        SELECT email, code_hash, attempts, expires_at
        FROM password_change_codes
        WHERE user_id = ?
        "#,
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

/// 增加修改密码验证码错误尝试次数
pub async fn increment_password_change_attempts(
    pool: &MySqlPool,
    user_id: u64,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE password_change_codes SET attempts = attempts + 1 WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 删除修改密码验证码
pub async fn delete_password_change_code(
    pool: &MySqlPool,
    user_id: u64,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM password_change_codes WHERE user_id = ?")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 创建班级
pub async fn create_class(
    pool: &MySqlPool,
    name: &str,
    description: &str,
    teacher_id: u64,
    invite_code: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query(
        "INSERT INTO classes (name, description, teacher_id, invite_code) VALUES (?, ?, ?, ?)",
    )
    .bind(name)
    .bind(description)
    .bind(teacher_id)
    .bind(invite_code)
    .execute(pool)
    .await?;

    Ok(result.last_insert_id())
}

/// 按邀请码查找班级
pub async fn find_class_by_invite_code(
    pool: &MySqlPool,
    invite_code: &str,
) -> Result<Option<ClassRow>, sqlx::Error> {
    sqlx::query_as::<_, ClassRow>(
        "SELECT id, name, description, teacher_id, invite_code FROM classes WHERE invite_code = ?",
    )
    .bind(invite_code)
    .fetch_optional(pool)
    .await
}

/// 加入班级
pub async fn join_class(pool: &MySqlPool, class_id: u64, user_id: u64) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT IGNORE INTO class_members (class_id, user_id) VALUES (?, ?)")
        .bind(class_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// 列出我教的课（作为教师）
pub async fn list_my_teaching_classes(
    pool: &MySqlPool,
    teacher_id: u64,
) -> Result<Vec<ClassDetailRow>, sqlx::Error> {
    sqlx::query_as::<_, ClassDetailRow>(
        r#"
        SELECT c.id, c.name, c.description, c.teacher_id, c.invite_code, u.username as teacher_name
        FROM classes c
        JOIN users u ON c.teacher_id = u.id
        WHERE c.teacher_id = ?
        ORDER BY c.created_at DESC
        "#,
    )
    .bind(teacher_id)
    .fetch_all(pool)
    .await
}

/// 列出我听的课（作为学生）
pub async fn list_my_joined_classes(
    pool: &MySqlPool,
    user_id: u64,
) -> Result<Vec<ClassDetailRow>, sqlx::Error> {
    sqlx::query_as::<_, ClassDetailRow>(
        r#"
        SELECT c.id, c.name, c.description, c.teacher_id, c.invite_code, u.username as teacher_name
        FROM classes c
        JOIN class_members cm ON c.id = cm.class_id
        JOIN users u ON c.teacher_id = u.id
        WHERE cm.user_id = ?
        ORDER BY cm.joined_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}
