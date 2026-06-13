use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    Extension,
};
use chrono::{NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::warn;

use crate::user_auth::{Claims, UserAuthState};

#[derive(Deserialize)]
pub struct CreateLessonReq {
    pub title: String,
    pub lesson_date: String,
}

#[derive(Deserialize)]
pub struct ListLessonsQuery {
    pub date: Option<String>,
}

#[derive(Serialize)]
pub struct LessonListResp {
    pub lessons: Vec<crate::db::LessonRow>,
}

#[derive(Serialize)]
pub struct LessonCreateResp {
    pub lesson_id: u64,
}

#[derive(Serialize)]
pub struct LessonWhiteboardResp {
    pub snapshot: Option<Value>,
    pub version: u64,
}

#[derive(Deserialize)]
pub struct SaveLessonWhiteboardReq {
    pub snapshot: Value,
    pub base_version: u64,
}

pub async fn create_lesson(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Path(class_id): Path<u64>,
    Json(req): Json<CreateLessonReq>,
) -> Response {
    if req.title.trim().is_empty() {
        return err(StatusCode::BAD_REQUEST, "lesson title is required");
    }
    let lesson_date = match parse_date(&req.lesson_date) {
        Some(d) => d,
        None => return err(StatusCode::BAD_REQUEST, "lesson_date must be YYYY-MM-DD"),
    };

    match crate::db::is_class_teacher(&state.pool, class_id, claims.sub).await {
        Ok(true) => {}
        Ok(false) => {
            return err(
                StatusCode::FORBIDDEN,
                "only class teacher can create lessons",
            )
        }
        Err(e) => {
            warn!("check class teacher failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "permission check failed");
        }
    }

    match crate::db::create_lesson(
        &state.pool,
        class_id,
        req.title.trim(),
        lesson_date,
        claims.sub,
    )
    .await
    {
        Ok(lesson_id) => Json(LessonCreateResp { lesson_id }).into_response(),
        Err(e) => {
            warn!("create lesson failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "create lesson failed")
        }
    }
}

pub async fn list_lessons(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Path(class_id): Path<u64>,
    Query(query): Query<ListLessonsQuery>,
) -> Response {
    match crate::db::is_class_member(&state.pool, class_id, claims.sub).await {
        Ok(true) => {}
        Ok(false) => return err(StatusCode::FORBIDDEN, "class access denied"),
        Err(e) => {
            warn!("check class member failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "permission check failed");
        }
    }

    let date = query.date.unwrap_or_else(today_string);
    let lesson_date = match parse_date(&date) {
        Some(d) => d,
        None => return err(StatusCode::BAD_REQUEST, "date must be YYYY-MM-DD"),
    };

    match crate::db::list_lessons_by_date(&state.pool, class_id, lesson_date).await {
        Ok(lessons) => Json(LessonListResp { lessons }).into_response(),
        Err(e) => {
            warn!("list lessons failed: {e}");
            err(StatusCode::INTERNAL_SERVER_ERROR, "list lessons failed")
        }
    }
}

pub async fn get_lesson_whiteboard(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Path(lesson_id): Path<u64>,
) -> Response {
    if let Err(resp) = ensure_lesson_member(&state, claims.sub, lesson_id).await {
        return resp;
    }

    match crate::db::find_lesson_whiteboard(&state.pool, lesson_id).await {
        Ok(Some(row)) => {
            let snapshot = parse_snapshot(&row.data_json);
            Json(LessonWhiteboardResp {
                snapshot,
                version: row.version,
            })
            .into_response()
        }
        Ok(None) => Json(LessonWhiteboardResp {
            snapshot: None,
            version: 0,
        })
        .into_response(),
        Err(e) => {
            warn!("load lesson whiteboard failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "load lesson whiteboard failed",
            )
        }
    }
}

pub async fn put_lesson_whiteboard(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Path(lesson_id): Path<u64>,
    Json(req): Json<SaveLessonWhiteboardReq>,
) -> Response {
    if !req.snapshot.is_object() {
        return err(StatusCode::BAD_REQUEST, "snapshot must be a JSON object");
    }
    if let Err(resp) = ensure_lesson_member(&state, claims.sub, lesson_id).await {
        return resp;
    }

    let current = match crate::db::find_lesson_whiteboard(&state.pool, lesson_id).await {
        Ok(v) => v,
        Err(e) => {
            warn!("load lesson whiteboard before save failed: {e}");
            return err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "load lesson whiteboard failed",
            );
        }
    };
    let current_version = current.as_ref().map(|row| row.version).unwrap_or(0);
    if current_version != req.base_version {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": "whiteboard has been updated",
                "version": current_version,
                "snapshot": current.and_then(|row| parse_snapshot(&row.data_json))
            })),
        )
            .into_response();
    }

    let data_json = match serde_json::to_string(&req.snapshot) {
        Ok(s) => s,
        Err(e) => {
            warn!("serialize lesson whiteboard failed: {e}");
            return err(StatusCode::BAD_REQUEST, "invalid snapshot");
        }
    };
    let next_version = current_version + 1;
    match crate::db::upsert_lesson_whiteboard(
        &state.pool,
        lesson_id,
        claims.sub,
        &data_json,
        next_version,
    )
    .await
    {
        Ok(()) => Json(serde_json::json!({ "version": next_version })).into_response(),
        Err(e) => {
            warn!("save lesson whiteboard failed: {e}");
            err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "save lesson whiteboard failed",
            )
        }
    }
}

async fn ensure_lesson_member(
    state: &UserAuthState,
    user_id: u64,
    lesson_id: u64,
) -> Result<u64, Response> {
    let class_id = match crate::db::find_lesson_class_id(&state.pool, lesson_id).await {
        Ok(Some(id)) => id,
        Ok(None) => return Err(err(StatusCode::NOT_FOUND, "lesson not found")),
        Err(e) => {
            warn!("find lesson class failed: {e}");
            return Err(err(StatusCode::INTERNAL_SERVER_ERROR, "load lesson failed"));
        }
    };

    match crate::db::is_class_member(&state.pool, class_id, user_id).await {
        Ok(true) => Ok(class_id),
        Ok(false) => Err(err(StatusCode::FORBIDDEN, "lesson access denied")),
        Err(e) => {
            warn!("check lesson member failed: {e}");
            Err(err(
                StatusCode::INTERNAL_SERVER_ERROR,
                "permission check failed",
            ))
        }
    }
}

fn parse_snapshot(raw: &str) -> Option<Value> {
    match serde_json::from_str::<Value>(raw) {
        Ok(Value::Object(obj)) => Some(Value::Object(obj)),
        _ => None,
    }
}

fn parse_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d").ok()
}

fn today_string() -> String {
    Utc::now().date_naive().format("%Y-%m-%d").to_string()
}

fn err(status: StatusCode, message: &'static str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}
