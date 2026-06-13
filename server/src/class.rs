//! 班级管理 API
//!
//! POST /api/class/create  → 创建班级
//! POST /api/class/join    → 加入班级
//! GET  /api/class/list    → 列出我教的和我听的课

use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
    Extension,
};
use serde::{Deserialize, Serialize};
use tracing::error;
use uuid::Uuid;

use crate::db;
use crate::user_auth::{Claims, UserAuthState};

#[derive(Deserialize)]
pub struct CreateClassReq {
    pub name: String,
    pub description: String,
}

#[derive(Serialize)]
pub struct CreateClassRes {
    pub class_id: u64,
    pub invite_code: String,
}

pub async fn create_class(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<CreateClassReq>,
) -> impl IntoResponse {
    let invite_code = Uuid::new_v4().simple().to_string()[..6].to_uppercase();
    match db::create_class(
        &state.pool,
        &req.name,
        &req.description,
        claims.sub,
        &invite_code,
    )
    .await
    {
        Ok(class_id) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "status": "success",
                "data": CreateClassRes { class_id, invite_code }
            })),
        ),
        Err(e) => {
            error!("创建班级失败: {:?}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"status": "error", "message": "Internal error"})),
            )
        }
    }
}

#[derive(Deserialize)]
pub struct JoinClassReq {
    pub invite_code: String,
}

pub async fn join_class(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Json(req): Json<JoinClassReq>,
) -> impl IntoResponse {
    let class_opt = match db::find_class_by_invite_code(&state.pool, &req.invite_code).await {
        Ok(c) => c,
        Err(e) => {
            error!("查询班级失败: {:?}", e);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"status": "error", "message": "Internal error"})),
            );
        }
    };

    if let Some(class) = class_opt {
        if class.teacher_id == claims.sub {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({"status": "error", "message": "您不能加入自己创建的班级"})),
            );
        }
        match db::join_class(&state.pool, class.id, claims.sub).await {
            Ok(_) => (
                StatusCode::OK,
                Json(serde_json::json!({"status": "success"})),
            ),
            Err(e) => {
                error!("加入班级失败: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({"status": "error", "message": "Internal error"})),
                )
            }
        }
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"status": "error", "message": "邀请码无效"})),
        )
    }
}

#[derive(Serialize)]
pub struct ListClassesRes {
    pub teaching: Vec<db::ClassDetailRow>,
    pub joined: Vec<db::ClassDetailRow>,
}

pub async fn list_classes(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
) -> impl IntoResponse {
    let teaching = db::list_my_teaching_classes(&state.pool, claims.sub)
        .await
        .unwrap_or_default();
    let joined = db::list_my_joined_classes(&state.pool, claims.sub)
        .await
        .unwrap_or_default();

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "status": "success",
            "data": ListClassesRes { teaching, joined }
        })),
    )
}
