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

mod admin;
mod auth;
mod class;
mod chem;
mod config;
mod db;
mod lesson;
mod metrics;
mod pool_live;
mod proxy;
mod user_auth;
mod whiteboard;
mod whiteboard_live;

use std::{net::SocketAddr, sync::Arc, time::Duration};

use anyhow::{Context, Result};
use axum::{
    extract::DefaultBodyLimit,
    http::{header, HeaderName, HeaderValue, Method},
    middleware,
    response::IntoResponse,
    routing::{any, delete, get, post, put},
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
use crate::user_auth::{MailConfig, UserAuthState};
use crate::pool_live::PoolLiveState;
use crate::whiteboard_live::{WhiteboardLiveAppState, WhiteboardLiveState};

#[tokio::main]
async fn main() -> Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("hologrip_proxy=info,tower_http=info")),
        )
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

    // 数据库连接池
    let pool = db::init_pool(&cfg.database_url).await?;
    info!("数据库连接就绪");

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
        deepseek_api_key: Arc::new(cfg.deepseek_api_key.clone()),
        deepseek_model: Arc::new(cfg.deepseek_model.clone()),
    };

    let user_state = UserAuthState {
        pool,
        jwt_secret: Arc::new(cfg.jwt_secret.clone()),
        jwt_expires_secs: cfg.jwt_expires_secs,
        mail: Arc::new(MailConfig {
            smtp_host: cfg.smtp_host.clone(),
            smtp_port: cfg.smtp_port,
            smtp_username: cfg.smtp_username.clone(),
            smtp_password: cfg.smtp_password.clone(),
            smtp_from: cfg.smtp_from.clone(),
            smtp_tls: cfg.smtp_tls,
            app_public_base_url: cfg.app_public_base_url.clone(),
        }),
    };
    if !cfg.admin_bootstrap_invite_code.trim().is_empty() {
        admin::seed_bootstrap_invite(&user_state, &cfg.admin_bootstrap_invite_code)
            .await
            .context("seed admin bootstrap invite failed")?;
        info!("admin bootstrap invite seeded");
    }
    let live_state = WhiteboardLiveState::default();
    let pool_live_state = PoolLiveState::default();

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

    // /api/user/* 子路由:用户注册/登录/个人信息
    let me_routes = Router::new()
        .route("/me", axum::routing::get(user_auth::me))
        .route(
            "/password/code",
            axum::routing::post(user_auth::send_password_code),
        )
        .route(
            "/password/change",
            axum::routing::post(user_auth::change_password),
        )
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ));
    let user_routes = Router::new()
        .route("/register", axum::routing::post(user_auth::register))
        .route("/login", axum::routing::post(user_auth::login))
        .merge(me_routes)
        .with_state(user_state.clone());

    let class_routes = Router::new()
        .route("/create", axum::routing::post(class::create_class))
        .route("/join", axum::routing::post(class::join_class))
        .route("/list", axum::routing::get(class::list_classes))
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ))
        .with_state(user_state.clone());

    let whiteboard_routes = Router::new()
        .route(
            "/api/whiteboard",
            get(whiteboard::get_snapshot).put(whiteboard::put_snapshot),
        )
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ))
        .with_state(user_state.clone());

    let lesson_routes = Router::new()
        .route(
            "/api/classes/{class_id}/lessons",
            get(lesson::list_lessons).post(lesson::create_lesson),
        )
        .route(
            "/api/lessons/{lesson_id}/whiteboard",
            get(lesson::get_lesson_whiteboard).put(lesson::put_lesson_whiteboard),
        )
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ))
        .with_state(user_state.clone());

    let whiteboard_live_routes = Router::new()
        .route(
            "/api/lessons/{lesson_id}/whiteboard/live",
            get(whiteboard_live::live_ws),
        )
        .with_state(WhiteboardLiveAppState {
            auth: user_state.clone(),
            live: live_state,
        });

    let pool_live_routes = Router::new()
        .route("/api/pool/live", get(pool_live::live_ws))
        .with_state(pool_live_state);

    let admin_public_routes = Router::new()
        .route("/invites/redeem", post(admin::redeem_invite))
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ))
        .with_state(user_state.clone());

    let admin_protected_routes = Router::new()
        .route("/me", get(admin::me))
        .route("/overview", get(admin::overview))
        .route("/users", get(admin::list_users))
        .route("/users/{user_id}", delete(admin::delete_user))
        .route("/classes", get(admin::list_classes))
        .route("/classes/{class_id}", delete(admin::delete_class))
        .route(
            "/classes/{class_id}/members",
            get(admin::list_class_members),
        )
        .route("/lessons", get(admin::list_lessons))
        .route("/lessons/{lesson_id}", delete(admin::delete_lesson))
        .route("/whiteboards/users", get(admin::list_user_whiteboards))
        .route(
            "/whiteboards/users/{user_id}",
            delete(admin::clear_user_whiteboard),
        )
        .route("/whiteboards/lessons", get(admin::list_lesson_whiteboards))
        .route(
            "/whiteboards/lessons/{lesson_id}",
            delete(admin::clear_lesson_whiteboard),
        )
        .route(
            "/invites",
            get(admin::list_invites).post(admin::create_invite),
        )
        .route(
            "/invites/{invite_id}",
            put(admin::update_invite).delete(admin::delete_invite),
        )
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            admin::require_admin,
        ))
        .route_layer(middleware::from_fn_with_state(
            user_state.clone(),
            user_auth::jwt_auth,
        ))
        .with_state(user_state.clone());

    let admin_routes = Router::new()
        .merge(admin_public_routes)
        .merge(admin_protected_routes);

    let app = Router::new()
        .route("/healthz", get(health))
        .route("/api/auth/issue", post(proxy::issue_token))
        .route("/api/resolve-molecule", post(chem::resolve_molecule))
        .route("/api/resolve-reaction", post(chem::resolve_reaction))
        .nest("/api/gemini", gemini_routes)
        .nest("/api/user", user_routes)
        .nest("/api/class", class_routes)
        .nest("/api/admin", admin_routes)
        .merge(whiteboard_routes)
        .merge(lesson_routes)
        .merge(whiteboard_live_routes)
        .merge(pool_live_routes)
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
    let listener = tokio::net::TcpListener::bind(bind)
        .await
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

async fn health() -> impl IntoResponse {
    "ok"
}

fn build_cors(spec: &str) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::OPTIONS])
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
    let ctrl_c = async {
        tokio::signal::ctrl_c().await.ok();
    };

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
