use axum::{
    extract::{Path, Query, Request, State},
    http::StatusCode,
    middleware::Next,
    response::{IntoResponse, Json, Response},
    Extension,
};
use chrono::{Duration, Utc};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tracing::warn;

use crate::{
    db::{
        self, AdminClassMemberRow, AdminClassRow, AdminInviteRow, AdminLessonRow,
        AdminLessonWhiteboardRow, AdminUserRow, AdminUserWhiteboardRow,
    },
    user_auth::{Claims, UserAuthState},
};

#[derive(Deserialize)]
pub struct RedeemInviteReq {
    pub code: String,
}

#[derive(Deserialize)]
pub struct UpdateInviteReq {
    pub code: String,
}

#[derive(Serialize)]
pub struct AdminMeResp {
    pub id: u64,
    pub username: String,
    pub email: String,
    pub role: String,
}

#[derive(Serialize)]
pub struct CreateInviteResp {
    pub code: String,
    pub expires_in_days: i64,
}

#[derive(Serialize)]
pub struct OverviewResp {
    pub status: &'static str,
    pub users: i64,
    pub admins: i64,
    pub classes: i64,
    pub lessons: i64,
    pub user_whiteboards: i64,
    pub lesson_whiteboards: i64,
}

#[derive(Deserialize)]
pub struct PageQuery {
    pub query: Option<String>,
    pub page: Option<u32>,
    pub page_size: Option<u32>,
}

#[derive(Serialize)]
pub struct PageResp<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: u32,
    pub page_size: u32,
}

pub async fn require_admin(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    req: Request,
    next: Next,
) -> Response {
    match db::is_admin(&state.pool, claims.sub).await {
        Ok(true) => next.run(req).await,
        Ok(false) => err(StatusCode::FORBIDDEN, "admin access required"),
        Err(e) => {
            warn!("admin permission check failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "admin permission check failed",
            )
        }
    }
}

pub async fn seed_bootstrap_invite(state: &UserAuthState, code: &str) -> Result<(), sqlx::Error> {
    let normalized = normalize_code(code);
    if normalized.is_empty() {
        return Ok(());
    }
    let hash = hash_admin_invite_code(&normalized);
    db::insert_admin_invite_if_absent(&state.pool, &normalized, &hash, None).await
}

pub async fn redeem_invite(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<RedeemInviteReq>,
) -> Response {
    let code = normalize_code(&req.code);
    if code.is_empty() {
        return err(StatusCode::BAD_REQUEST, "invite code is required");
    }
    let hash = hash_admin_invite_code(&code);
    match db::redeem_admin_invite(&state.pool, &hash, claims.sub).await {
        Ok(true) => Json(serde_json::json!({ "status": "success" })).into_response(),
        Ok(false) => err(
            StatusCode::BAD_REQUEST,
            "invite code is invalid or already used",
        ),
        Err(e) => {
            warn!("redeem admin invite failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "redeem admin invite failed",
            )
        }
    }
}

pub async fn me(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    match db::find_by_id(&state.pool, claims.sub).await {
        Ok(Some(user)) => Json(AdminMeResp {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
        })
        .into_response(),
        Ok(None) => err(StatusCode::UNAUTHORIZED, "user not found"),
        Err(e) => {
            warn!("load admin me failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "load admin failed")
        }
    }
}

pub async fn create_invite(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    let code = generate_admin_invite_code();
    let expires_at = Utc::now().naive_utc() + Duration::days(30);
    let hash = hash_admin_invite_code(&code);
    match db::create_admin_invite(&state.pool, &code, &hash, claims.sub, Some(expires_at)).await {
        Ok(()) => Json(CreateInviteResp {
            code,
            expires_in_days: 30,
        })
        .into_response(),
        Err(e) => {
            warn!("create admin invite failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "create admin invite failed",
            )
        }
    }
}

pub async fn list_invites(State(state): State<UserAuthState>) -> Response {
    match sqlx::query_as::<_, AdminInviteRow>(
        r#"
        SELECT ai.id, ai.code, ai.created_by, cu.username AS creator_name,
               ai.used_by, uu.username AS used_by_name,
               ai.used_at, ai.expires_at, ai.created_at
        FROM admin_invites ai
        LEFT JOIN users cu ON ai.created_by = cu.id
        LEFT JOIN users uu ON ai.used_by = uu.id
        ORDER BY ai.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(serde_json::json!({ "items": items })).into_response(),
        Err(e) => {
            warn!("list admin invites failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "list admin invites failed",
            )
        }
    }
}

pub async fn update_invite(
    State(state): State<UserAuthState>,
    Path(invite_id): Path<u64>,
    Json(req): Json<UpdateInviteReq>,
) -> Response {
    let code = normalize_code(&req.code);
    if code.is_empty() || code.len() > 32 {
        return err(
            StatusCode::BAD_REQUEST,
            "invite code must be 1-32 characters",
        );
    }
    let hash = hash_admin_invite_code(&code);

    match sqlx::query(
        r#"
        UPDATE admin_invites
        SET code = ?, code_hash = ?
        WHERE id = ?
          AND used_at IS NULL
        "#,
    )
    .bind(&code)
    .bind(&hash)
    .bind(invite_id)
    .execute(&state.pool)
    .await
    {
        Ok(result) if result.rows_affected() > 0 => {
            Json(serde_json::json!({ "status": "success", "code": code })).into_response()
        }
        Ok(_) => err(StatusCode::NOT_FOUND, "unused invite not found"),
        Err(e) => {
            warn!("update admin invite failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "update admin invite failed",
            )
        }
    }
}

pub async fn delete_invite(
    State(state): State<UserAuthState>,
    Path(invite_id): Path<u64>,
) -> Response {
    match sqlx::query("DELETE FROM admin_invites WHERE id = ?")
        .bind(invite_id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() > 0 => {
            Json(serde_json::json!({ "status": "success" })).into_response()
        }
        Ok(_) => err(StatusCode::NOT_FOUND, "invite not found"),
        Err(e) => {
            warn!("delete admin invite failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "delete admin invite failed",
            )
        }
    }
}

pub async fn overview(State(state): State<UserAuthState>) -> Response {
    macro_rules! count {
        ($sql:expr) => {
            match sqlx::query_scalar::<_, i64>($sql)
                .fetch_one(&state.pool)
                .await
            {
                Ok(v) => v,
                Err(e) => {
                    warn!("overview count failed: {e}");
                    return err(StatusCode::INTERNAL_SERVER_ERROR, "overview failed");
                }
            }
        };
    }
    Json(OverviewResp {
        status: "ok",
        users: count!("SELECT COUNT(*) FROM users"),
        admins: count!("SELECT COUNT(*) FROM users WHERE role = 'admin'"),
        classes: count!("SELECT COUNT(*) FROM classes"),
        lessons: count!("SELECT COUNT(*) FROM lessons"),
        user_whiteboards: count!("SELECT COUNT(*) FROM whiteboard_snapshots"),
        lesson_whiteboards: count!("SELECT COUNT(*) FROM lesson_whiteboard_snapshots"),
    })
    .into_response()
}

pub async fn list_users(
    State(state): State<UserAuthState>,
    Query(query): Query<PageQuery>,
) -> Response {
    let (page, page_size, offset) = paging(&query);
    let term = format!("%{}%", query.query.unwrap_or_default().trim());

    let total = match sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM users WHERE username LIKE ? OR email LIKE ?",
    )
    .bind(&term)
    .bind(&term)
    .fetch_one(&state.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            warn!("count users failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "list users failed");
        }
    };

    match sqlx::query_as::<_, AdminUserRow>(
        r#"
        SELECT id, username, email, role, created_at, updated_at
        FROM users
        WHERE username LIKE ? OR email LIKE ?
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(&term)
    .bind(&term)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(PageResp {
            items,
            total,
            page,
            page_size,
        })
        .into_response(),
        Err(e) => {
            warn!("list users failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list users failed")
        }
    }
}

pub async fn delete_user(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Path(user_id): Path<u64>,
) -> Response {
    if user_id == claims.sub {
        return err(StatusCode::BAD_REQUEST, "cannot delete current admin");
    }
    delete_by_id(&state, "users", user_id, "delete user failed").await
}

pub async fn list_classes(
    State(state): State<UserAuthState>,
    Query(query): Query<PageQuery>,
) -> Response {
    let (page, page_size, offset) = paging(&query);
    let term = format!("%{}%", query.query.unwrap_or_default().trim());
    let total = match sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM classes c JOIN users u ON c.teacher_id = u.id WHERE c.name LIKE ? OR u.username LIKE ?",
    )
    .bind(&term)
    .bind(&term)
    .fetch_one(&state.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            warn!("count classes failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "list classes failed");
        }
    };

    match sqlx::query_as::<_, AdminClassRow>(
        r#"
        SELECT c.id, c.name, c.description, c.teacher_id, u.username AS teacher_name,
               c.invite_code,
               (SELECT COUNT(*) FROM class_members cm WHERE cm.class_id = c.id) AS member_count,
               (SELECT COUNT(*) FROM lessons l WHERE l.class_id = c.id) AS lesson_count,
               c.created_at, c.updated_at
        FROM classes c
        JOIN users u ON c.teacher_id = u.id
        WHERE c.name LIKE ? OR u.username LIKE ?
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(&term)
    .bind(&term)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(PageResp {
            items,
            total,
            page,
            page_size,
        })
        .into_response(),
        Err(e) => {
            warn!("list classes failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list classes failed")
        }
    }
}

pub async fn delete_class(
    State(state): State<UserAuthState>,
    Path(class_id): Path<u64>,
) -> Response {
    delete_by_id(&state, "classes", class_id, "delete class failed").await
}

pub async fn list_class_members(
    State(state): State<UserAuthState>,
    Path(class_id): Path<u64>,
) -> Response {
    match sqlx::query_as::<_, AdminClassMemberRow>(
        r#"
        SELECT cm.class_id, cm.user_id, u.username, u.email, cm.joined_at
        FROM class_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.class_id = ?
        ORDER BY cm.joined_at DESC
        "#,
    )
    .bind(class_id)
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(serde_json::json!({ "items": items })).into_response(),
        Err(e) => {
            warn!("list class members failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "list class members failed",
            )
        }
    }
}

pub async fn list_lessons(
    State(state): State<UserAuthState>,
    Query(query): Query<PageQuery>,
) -> Response {
    let (page, page_size, offset) = paging(&query);
    let term = format!("%{}%", query.query.unwrap_or_default().trim());
    let total = match sqlx::query_scalar::<_, i64>(
        r#"
        SELECT COUNT(*)
        FROM lessons l
        JOIN classes c ON l.class_id = c.id
        JOIN users u ON l.created_by = u.id
        WHERE l.title LIKE ? OR c.name LIKE ? OR u.username LIKE ?
        "#,
    )
    .bind(&term)
    .bind(&term)
    .bind(&term)
    .fetch_one(&state.pool)
    .await
    {
        Ok(v) => v,
        Err(e) => {
            warn!("count lessons failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "list lessons failed");
        }
    };

    match sqlx::query_as::<_, AdminLessonRow>(
        r#"
        SELECT l.id, l.class_id, c.name AS class_name, l.title, l.lesson_date,
               l.created_by, u.username AS creator_name,
               CASE WHEN lw.lesson_id IS NULL THEN false ELSE true END AS has_whiteboard,
               l.created_at, l.updated_at
        FROM lessons l
        JOIN classes c ON l.class_id = c.id
        JOIN users u ON l.created_by = u.id
        LEFT JOIN lesson_whiteboard_snapshots lw ON lw.lesson_id = l.id
        WHERE l.title LIKE ? OR c.name LIKE ? OR u.username LIKE ?
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ? OFFSET ?
        "#,
    )
    .bind(&term)
    .bind(&term)
    .bind(&term)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(PageResp {
            items,
            total,
            page,
            page_size,
        })
        .into_response(),
        Err(e) => {
            warn!("list lessons failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list lessons failed")
        }
    }
}

pub async fn delete_lesson(
    State(state): State<UserAuthState>,
    Path(lesson_id): Path<u64>,
) -> Response {
    delete_by_id(&state, "lessons", lesson_id, "delete lesson failed").await
}

pub async fn list_user_whiteboards(State(state): State<UserAuthState>) -> Response {
    match sqlx::query_as::<_, AdminUserWhiteboardRow>(
        r#"
        SELECT ws.user_id, u.username, u.email, ws.updated_at
        FROM whiteboard_snapshots ws
        JOIN users u ON ws.user_id = u.id
        ORDER BY ws.updated_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(serde_json::json!({ "items": items })).into_response(),
        Err(e) => {
            warn!("list user whiteboards failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list whiteboards failed")
        }
    }
}

pub async fn clear_user_whiteboard(
    State(state): State<UserAuthState>,
    Path(user_id): Path<u64>,
) -> Response {
    delete_by_id(
        &state,
        "whiteboard_snapshots",
        user_id,
        "clear whiteboard failed",
    )
    .await
}

pub async fn list_lesson_whiteboards(State(state): State<UserAuthState>) -> Response {
    match sqlx::query_as::<_, AdminLessonWhiteboardRow>(
        r#"
        SELECT lw.lesson_id, l.title, c.name AS class_name, lw.version,
               lw.updated_by, u.username AS updater_name, lw.updated_at
        FROM lesson_whiteboard_snapshots lw
        JOIN lessons l ON lw.lesson_id = l.id
        JOIN classes c ON l.class_id = c.id
        JOIN users u ON lw.updated_by = u.id
        ORDER BY lw.updated_at DESC
        LIMIT 200
        "#,
    )
    .fetch_all(&state.pool)
    .await
    {
        Ok(items) => Json(serde_json::json!({ "items": items })).into_response(),
        Err(e) => {
            warn!("list lesson whiteboards failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list whiteboards failed")
        }
    }
}

pub async fn clear_lesson_whiteboard(
    State(state): State<UserAuthState>,
    Path(lesson_id): Path<u64>,
) -> Response {
    delete_by_id(
        &state,
        "lesson_whiteboard_snapshots",
        lesson_id,
        "clear lesson whiteboard failed",
    )
    .await
}

async fn delete_by_id(
    state: &UserAuthState,
    table: &str,
    id: u64,
    error_message: &'static str,
) -> Response {
    let id_column = match table {
        "users" => "id",
        "classes" => "id",
        "lessons" => "id",
        "whiteboard_snapshots" => "user_id",
        "lesson_whiteboard_snapshots" => "lesson_id",
        _ => return err(StatusCode::BAD_REQUEST, "invalid delete target"),
    };
    let sql = format!("DELETE FROM {table} WHERE {id_column} = ?");
    match sqlx::query(&sql).bind(id).execute(&state.pool).await {
        Ok(result) if result.rows_affected() > 0 => {
            Json(serde_json::json!({ "status": "success" })).into_response()
        }
        Ok(_) => err(StatusCode::NOT_FOUND, "target not found"),
        Err(e) => {
            warn!("{error_message}: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, error_message)
        }
    }
}

fn paging(query: &PageQuery) -> (u32, u32, u32) {
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * page_size;
    (page, page_size, offset)
}

fn normalize_code(code: &str) -> String {
    code.trim().to_ascii_uppercase().replace(' ', "")
}

pub fn hash_admin_invite_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize_code(code).as_bytes());
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn generate_admin_invite_code() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(12)
        .map(char::from)
        .collect::<String>()
        .to_ascii_uppercase()
}

fn err(status: StatusCode, message: &'static str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

#[cfg(test)]
mod tests {
    use super::hash_admin_invite_code;

    #[test]
    fn invite_hash_normalizes_case_and_spaces() {
        assert_eq!(
            hash_admin_invite_code(" abcd-1234 "),
            hash_admin_invite_code("ABCD-1234")
        );
    }

    #[test]
    fn invite_hash_is_sha256_hex() {
        assert_eq!(hash_admin_invite_code("CODE").len(), 64);
    }
}
