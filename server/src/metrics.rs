//! Prometheus 指标:
//!   - `proxy_requests_total{path,status}`         反代请求计数
//!   - `proxy_upstream_duration_seconds{path}`      上游往返耗时直方图
//!   - `proxy_in_flight_requests`                   当前在飞请求 gauge
//!   - `proxy_rate_limited_total`                   被 governor 拒绝的请求
//!   - `auth_token_issued_total`                    签发的 token 数
//!   - `auth_token_rejected_total{reason}`          鉴权失败计数
//!
//! `/metrics` 端点单独绑定到 127.0.0.1:9898,**不通过 Nginx 暴露给公网**,
//! 监控系统(Prometheus / 宝塔监控)如果在同机直接 scrape 即可;跨机的话用 SSH 隧道。

use std::net::SocketAddr;

use anyhow::{Context, Result};
use axum::{response::IntoResponse, routing::get, Router};
use metrics::{counter, describe_counter, describe_gauge, describe_histogram, gauge, histogram};
use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
use tracing::info;

/// 全局指标 handle:metrics crate 用这个把 `metrics!()` 调用渲染成 Prometheus 文本。
#[derive(Clone)]
pub struct Metrics {
    pub handle: PrometheusHandle,
}

impl Metrics {
    pub fn install() -> Result<Self> {
        let handle = PrometheusBuilder::new()
            // 上游耗时直方图的桶,覆盖 50ms~30s
            .set_buckets_for_metric(
                metrics_exporter_prometheus::Matcher::Full(
                    "proxy_upstream_duration_seconds".to_string(),
                ),
                &[0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0, 20.0, 30.0],
            )
            .context("配置 metrics 直方图桶失败")?
            .install_recorder()
            .context("安装 metrics recorder 失败")?;

        // 描述信息(Prometheus HELP 行)
        describe_counter!(
            "proxy_requests_total",
            "反代请求总数,按 path 与 status 切分"
        );
        describe_histogram!("proxy_upstream_duration_seconds", "上游请求往返耗时(秒)");
        describe_gauge!("proxy_in_flight_requests", "当前正在转发的请求数");
        describe_counter!("proxy_rate_limited_total", "被 tower_governor 拦截的请求数");
        describe_counter!("auth_token_issued_total", "成功签发的 token 总数");
        describe_counter!("auth_token_rejected_total", "鉴权失败次数,按 reason 切分");

        Ok(Self { handle })
    }
}

// ── 调用辅助函数 ─────────────────────────────────────────────────────
// 把 metrics crate 的宏包成函数,handler 里用起来更顺手。

pub fn record_request(path: &str, status: u16, duration_secs: f64) {
    counter!(
        "proxy_requests_total",
        "path" => path.to_string(),
        "status" => status.to_string()
    )
    .increment(1);
    histogram!(
        "proxy_upstream_duration_seconds",
        "path" => path.to_string()
    )
    .record(duration_secs);
}

pub fn inflight_inc() {
    gauge!("proxy_in_flight_requests").increment(1.0);
}

pub fn inflight_dec() {
    gauge!("proxy_in_flight_requests").decrement(1.0);
}

pub fn record_token_issued() {
    counter!("auth_token_issued_total").increment(1);
}

pub fn record_token_rejected(reason: &'static str) {
    counter!("auth_token_rejected_total", "reason" => reason).increment(1);
}

// ── 暴露端点 ─────────────────────────────────────────────────────────

pub async fn serve_metrics_endpoint(metrics: Metrics, bind: SocketAddr) -> Result<()> {
    let app = Router::new().route(
        "/metrics",
        get(move || {
            let handle = metrics.handle.clone();
            async move {
                // Prometheus 默认接受 text/plain
                (
                    [(
                        axum::http::header::CONTENT_TYPE,
                        "text/plain; version=0.0.4",
                    )],
                    handle.render(),
                )
                    .into_response()
            }
        }),
    );

    let listener = tokio::net::TcpListener::bind(bind)
        .await
        .with_context(|| format!("metrics 端点监听 {} 失败", bind))?;

    info!(%bind, "metrics 端点已启动");

    axum::serve(listener, app)
        .await
        .context("metrics 服务异常退出")?;
    Ok(())
}
