use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json, Response},
    Extension,
};
use serde::Serialize;
use serde_json::Value;
use tracing::warn;

use crate::user_auth::{Claims, UserAuthState};

#[derive(Serialize)]
pub struct WhiteboardSnapshotResp {
    pub snapshot: Option<Value>,
}

pub async fn get_snapshot(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    let raw = match crate::db::find_whiteboard_snapshot(&state.pool, claims.sub).await {
        Ok(v) => v,
        Err(e) => {
            warn!("load whiteboard snapshot failed: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "读取白板失败");
        }
    };

    let snapshot = match raw {
        Some(s) => match serde_json::from_str::<Value>(&s) {
            Ok(Value::Object(obj)) => Some(Value::Object(obj)),
            Ok(_) => {
                warn!(
                    "whiteboard snapshot is not a JSON object for user {}",
                    claims.sub
                );
                None
            }
            Err(e) => {
                warn!(
                    "whiteboard snapshot JSON parse failed for user {}: {e}",
                    claims.sub
                );
                None
            }
        },
        None => None,
    };

    Json(WhiteboardSnapshotResp { snapshot }).into_response()
}

pub async fn put_snapshot(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Json(snapshot): Json<Value>,
) -> Response {
    if !snapshot.is_object() {
        return err(StatusCode::BAD_REQUEST, "白板快照必须是 JSON 对象");
    }

    let data_json = match serde_json::to_string(&snapshot) {
        Ok(s) => s,
        Err(e) => {
            warn!("serialize whiteboard snapshot failed: {e}");
            return err(StatusCode::BAD_REQUEST, "白板快照格式非法");
        }
    };

    if let Err(e) = crate::db::upsert_whiteboard_snapshot(&state.pool, claims.sub, &data_json).await
    {
        warn!("save whiteboard snapshot failed: {e}");
        return err(StatusCode::INTERNAL_SERVER_ERROR, "保存白板失败");
    }

    Json(serde_json::json!({ "message": "ok" })).into_response()
}

fn err(status: StatusCode, message: &'static str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}
