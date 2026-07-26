//! 反向代理核心:鉴权中间件 + token 签发端点 + 透明转发 handler。

use std::{
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::Instant,
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Path, State},
    http::{header, HeaderMap, Method, Request, StatusCode, Uri},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use futures_util::TryStreamExt;
use reqwest::Client;
use serde::Serialize;
use tracing::{error, warn};

use crate::auth::{self, AuthError, TokenService};
use crate::metrics as proxy_metrics;

// ── 共享状态 ─────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub upstream_base: String,
    pub upstream_key: Arc<String>,
    pub http: Client,
    pub token_svc: TokenService,
    pub issue_allowed_origins: Arc<String>,
    pub deepseek_api_key: Arc<String>,
    pub deepseek_model: Arc<String>,
}

// ── header 白名单 ────────────────────────────────────────────────────

/// 入站 header 白名单:其余的(尤其是 host/authorization/cookie)一律不透传给上游。
const FORWARD_REQ_HEADERS: &[&str] = &["content-type", "accept", "accept-encoding"];

/// 出站 header 白名单:上游响应里只把这些回吐给浏览器。
const FORWARD_RESP_HEADERS: &[&str] = &[
    "content-type",
    "content-encoding",
    "content-length",
    "cache-control",
    "expires",
];

// ── token 签发端点 POST /api/auth/issue ─────────────────────────────

#[derive(Serialize)]
pub struct IssueResponse {
    pub token: String,
    pub expires_in: u64,
    pub quota: u64,
}

pub async fn issue_token(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Response {
    // 1. Origin 白名单
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    if !auth::origin_allowed(&state.issue_allowed_origins, origin) {
        proxy_metrics::record_token_rejected("origin_denied");
        warn!(?origin, "拒绝签发 token: origin 不在白名单");
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }

    // 2. 客户端 IP:优先 X-Forwarded-For(Nginx 反代场景),回退 peer
    let client_ip = client_ip_from(&headers, addr.ip());

    // 3. 签发
    match state.token_svc.issue(&client_ip.to_string()) {
        Ok((token, payload)) => {
            proxy_metrics::record_token_issued();
            let now = chrono::Utc::now().timestamp() as u64;
            let resp = IssueResponse {
                token,
                expires_in: payload.exp.saturating_sub(now),
                quota: payload.quota,
            };
            (StatusCode::OK, Json(resp)).into_response()
        }
        Err(e) => {
            error!(?e, "签发 token 失败");
            (StatusCode::INTERNAL_SERVER_ERROR, "issue failed").into_response()
        }
    }
}

// ── 鉴权中间件 ─────────────────────────────────────────────────────

/// 包在 /api/gemini/* 之前,验证 Bearer token。
pub async fn require_token(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let headers = req.headers();
    let token_str = match extract_bearer(headers) {
        Some(t) => t,
        None => {
            proxy_metrics::record_token_rejected("missing");
            return (StatusCode::UNAUTHORIZED, "missing bearer token").into_response();
        }
    };

    let client_ip = client_ip_from(headers, addr.ip()).to_string();

    match state.token_svc.verify_and_consume(&token_str, &client_ip) {
        Ok(_payload) => next.run(req).await,
        Err(e) => {
            let reason = match &e {
                AuthError::Malformed => "malformed",
                AuthError::BadSignature => "bad_signature",
                AuthError::Expired => "expired",
                AuthError::IpMismatch => "ip_mismatch",
                AuthError::QuotaExhausted => "quota_exhausted",
                AuthError::Internal(_) => "internal",
            };
            proxy_metrics::record_token_rejected(reason);
            warn!(reason, ?client_ip, "鉴权失败");
            let status = match e {
                AuthError::QuotaExhausted => StatusCode::TOO_MANY_REQUESTS,
                AuthError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
                _ => StatusCode::UNAUTHORIZED,
            };
            (status, format!("{e}")).into_response()
        }
    }
}

fn extract_bearer(headers: &HeaderMap) -> Option<String> {
    let v = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    v.strip_prefix("Bearer ").map(str::to_string)
}

/// 取真实客户端 IP:优先 X-Forwarded-For 的第一个,然后 X-Real-IP,最后 peer。
fn client_ip_from(headers: &HeaderMap, peer: IpAddr) -> IpAddr {
    if let Some(xff) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = xff.split(',').next() {
            if let Ok(ip) = first.trim().parse() {
                return ip;
            }
        }
    }
    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        if let Ok(ip) = real.parse() {
            return ip;
        }
    }
    peer
}

// ── 反代主 handler ──────────────────────────────────────────────────

/// 用一个轻量 extractor 一次性拿到 method / uri / headers。
pub struct MethodUriHeaders {
    pub method: Method,
    pub uri: Uri,
    pub headers: HeaderMap,
}

impl<S> axum::extract::FromRequestParts<S> for MethodUriHeaders
where
    S: Send + Sync,
{
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut axum::http::request::Parts,
        _state: &S,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self {
            method: parts.method.clone(),
            uri: parts.uri.clone(),
            headers: parts.headers.clone(),
        })
    }
}

pub async fn proxy_handler(
    State(state): State<AppState>,
    Path(rest): Path<String>,
    method_uri_headers: MethodUriHeaders,
    body: Body,
) -> Response {
    proxy_metrics::inflight_inc();
    let _guard = scopeguard_dec();

    let MethodUriHeaders {
        method,
        uri,
        headers,
    } = method_uri_headers;
    let path_for_metric = first_path_seg(&rest);

    // 拼上游 URL:base + 子路径 + 原 query
    let query = uri.query().map(|q| format!("?{q}")).unwrap_or_default();
    let upstream_url = format!("{}/{}{}", state.upstream_base, rest, query);

    let upstream_method = match reqwest::Method::from_bytes(method.as_str().as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            warn!(?e, "非法 HTTP method");
            proxy_metrics::record_request(&path_for_metric, 400, 0.0);
            return (StatusCode::BAD_REQUEST, "bad method").into_response();
        }
    };

    let body_bytes = match axum::body::to_bytes(body, usize::MAX).await {
        Ok(b) => b,
        Err(e) => {
            warn!(?e, "读取请求体失败");
            proxy_metrics::record_request(&path_for_metric, 400, 0.0);
            return (StatusCode::BAD_REQUEST, "invalid body").into_response();
        }
    };

    let mut req = state.http.request(upstream_method, &upstream_url);

    for (name, value) in headers.iter() {
        if FORWARD_REQ_HEADERS
            .iter()
            .any(|w| w.eq_ignore_ascii_case(name.as_str()))
        {
            req = req.header(name.as_str(), value);
        }
    }

    // 强制注入真实 key,前端的 Authorization 已经被中间件用掉了,这里覆盖也无所谓
    req = req.header(
        header::AUTHORIZATION,
        format!("Bearer {}", state.upstream_key),
    );

    if !body_bytes.is_empty() {
        req = req.body(body_bytes);
    }

    let started = Instant::now();
    let upstream_resp = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            error!(?e, url = %upstream_url, "上游请求失败");
            proxy_metrics::record_request(&path_for_metric, 502, started.elapsed().as_secs_f64());
            return (StatusCode::BAD_GATEWAY, format!("upstream error: {e}")).into_response();
        }
    };

    let status_u16 = upstream_resp.status().as_u16();
    let elapsed = started.elapsed().as_secs_f64();
    proxy_metrics::record_request(&path_for_metric, status_u16, elapsed);

    let mut out_headers = HeaderMap::new();
    for (name, value) in upstream_resp.headers().iter() {
        if FORWARD_RESP_HEADERS
            .iter()
            .any(|w| w.eq_ignore_ascii_case(name.as_str()))
        {
            out_headers.insert(name.clone(), value.clone());
        }
    }

    let stream = upstream_resp.bytes_stream().map_err(std::io::Error::other);
    let body = Body::from_stream(stream);

    let mut resp = Response::builder()
        .status(StatusCode::from_u16(status_u16).unwrap_or(StatusCode::BAD_GATEWAY))
        .body(body)
        .unwrap_or_else(|_| {
            (StatusCode::INTERNAL_SERVER_ERROR, "build response failed").into_response()
        });

    *resp.headers_mut() = out_headers;
    resp
}

/// 取路径首段做 metric label,避免 cardinality 爆炸。
/// 比如 `v1beta/models/foo:generateContent` → `v1beta`
fn first_path_seg(path: &str) -> String {
    path.split('/').next().unwrap_or("unknown").to_string()
}

/// 一个简单的 RAII guard:出作用域时把 inflight 计数 -1,
/// 即便 handler 中途 return 也能正确释放。
struct InflightGuard;
fn scopeguard_dec() -> InflightGuard {
    InflightGuard
}
impl Drop for InflightGuard {
    fn drop(&mut self) {
        proxy_metrics::inflight_dec();
    }
}
