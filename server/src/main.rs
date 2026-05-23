//! HoloGrip Gemini 反向代理服务
//!
//! ── 模块组成 ──────────────────────────────────────────────────────
//! - config :  环境变量 → 配置结构
//! - auth   :  HMAC-SHA256 token 签发与校验
//! - proxy  :  反代 handler、鉴权中间件、token 签发端点
//! - metrics:  Prometheus 指标定义与暴露
//!
//! ── 路由布局 ──────────────────────────────────────────────────────
//! 公开端点:
//!   GET  /healthz              ← 健康检查,systemd / 监控用
//!   POST /api/auth/issue       ← Origin 校验后签发短期 token
//!   *    /api/gemini/{*path}   ← 鉴权后透明转发到上游(支持任意 method)
//!
//! 内网端点(单独绑 127.0.0.1:9898,不通过 Nginx 暴露):
//!   GET  /metrics              ← Prometheus scrape

mod auth;
mod config;
mod metrics;
mod proxy;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderName, HeaderValue, Method},
    middleware,
    response::IntoResponse,
    routing::{any, get, post},
    Router,
};
use reqwest::Client;
use tower_governor::{
    governor::GovernorConfigBuilder, key_extractor::SmartIpKeyExtractor, GovernorLayer,
};
use tower_http::{
    cors::{AllowOrigin, CorsLayer},
    limit::RequestBodyLimitLayer,
    trace::TraceLayer,
};
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;

use crate::auth::TokenService;
use crate::config::Config;
use crate::metrics::Metrics;
use crate::proxy::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("hologrip_proxy=info,tower_http=info")))
        .with_target(false)
        .init();

    let cfg = Config::from_env()?;
    let bind = cfg.proxy_bind_addr();
    info!(%bind, upstream = %cfg.upstream_base(), "启动反代服务");

    // 安装 metrics recorder(必须在任何 metrics! 调用之前)
    let metrics = Metrics::install()?;

    // HTTP 客户端
    let http = Client::builder()
        .timeout(Duration::from_secs(cfg.upstream_timeout_secs))
        .pool_idle_timeout(Duration::from_secs(90))
        .build()
        .context("构建 HTTP 客户端失败")?;

    // Token 服务 + 后台清扫
    let token_svc = TokenService::new(
        &cfg.auth_hmac_secret,
        cfg.auth_token_ttl_secs,
        cfg.auth_token_quota,
    );
    auth::spawn_sweeper(token_svc.clone());

    let state = AppState {
        upstream_base: cfg.upstream_base().to_string(),
        upstream_key: Arc::new(cfg.upstream_api_key.clone()),
        http,
        token_svc,
        issue_allowed_origins: Arc::new(cfg.auth_issue_allowed_origins.clone()),
    };

    // CORS:浏览器 preflight 必须放行 Authorization
    let cors = build_cors(&cfg.cors_allowed_origins);

    // 限流配置(SmartIpKeyExtractor 优先读 X-Forwarded-For)
    let governor_cfg = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(cfg.rate_limit_per_second.max(1))
            .burst_size(cfg.rate_limit_burst.max(1))
            .key_extractor(SmartIpKeyExtractor)
            .finish()
            .context("构建限流配置失败")?,
    );

    // /api/gemini/* 子路由:套鉴权中间件
    let gemini_routes = Router::new()
        .route("/{*path}", any(proxy::proxy_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            proxy::require_token,
        ));

    let app = Router::new()
        .route("/healthz", get(health))
        .route("/api/auth/issue", post(proxy::issue_token))
        .nest("/api/gemini", gemini_routes)
        .with_state(state)
        // 层序:最先 .layer() 的最靠内,最后 .layer() 的最外层。
        // GovernorLayer 必须紧贴 Router,因为它要求下游响应体是 axum::body::Body。
        .layer(GovernorLayer::new(governor_cfg))
        .layer(RequestBodyLimitLayer::new(cfg.max_body_bytes))
        // axum 0.8 默认对 body 有 2MB 上限,与 RequestBodyLimitLayer 配合需显式放开
        .layer(DefaultBodyLimit::max(cfg.max_body_bytes))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    // 启动主反代监听
    let listener = tokio::net::TcpListener::bind(bind).await
        .with_context(|| format!("监听 {} 失败", bind))?;
    let serve_main = axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal());

    // 启动 metrics 端点(可选)
    let metrics_task = cfg.metrics_bind_addr().map(|metrics_bind| {
        tokio::spawn(metrics::serve_metrics_endpoint(
            metrics.clone(),
            metrics_bind,
        ))
    });

    // 主反代退出后再 abort metrics
    serve_main.await.context("主服务异常退出")?;
    if let Some(h) = metrics_task {
        h.abort();
    }

    info!("反代服务已优雅退出");
    Ok(())
}

// ── 辅助 ────────────────────────────────────────────────────────────

async fn health() -> impl IntoResponse { "ok" }

fn build_cors(spec: &str) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([
            header::CONTENT_TYPE,
            header::ACCEPT,
            header::AUTHORIZATION, // 浏览器 preflight 需要放行
            HeaderName::from_static("x-requested-with"),
        ])
        .max_age(Duration::from_secs(600));

    let trimmed = spec.trim();
    if trimmed == "*" || trimmed.is_empty() {
        return base.allow_origin(AllowOrigin::any());
    }

    let origins: Vec<HeaderValue> = trimmed
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .filter_map(|s| HeaderValue::from_str(s).ok())
        .collect();

    if origins.is_empty() {
        warn!("CORS_ALLOWED_ORIGINS 为空或全部非法,回退到 allow any");
        return base.allow_origin(AllowOrigin::any());
    }
    base.allow_origin(origins)
}

async fn shutdown_signal() {
    let ctrl_c = async { tokio::signal::ctrl_c().await.ok(); };

    #[cfg(unix)]
    let terminate = async {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut s) = signal(SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => info!("收到 Ctrl-C,准备退出"),
        _ = terminate => info!("收到 SIGTERM,准备退出"),
    }
}
