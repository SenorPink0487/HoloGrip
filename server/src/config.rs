//! 配置加载:环境变量 → 强类型配置结构。
//!
//! 加载顺序:
//!   1. `.env` 文件(同 cwd)被 dotenvy 载入到 process env
//!   2. envy 从 process env 反序列化到本结构体
//!
//! 真实环境变量优先级 > .env 文件,所以 systemd 用 `Environment=` 注入的会覆盖 .env。

use std::net::SocketAddr;

use anyhow::{bail, Context, Result};
use serde::Deserialize;

#[derive(Debug, Deserialize, Clone)]
pub struct Config {
    // ── 监听 / 上游 ────────────────────────────────────────────────
    #[serde(default = "default_bind")]
    pub proxy_bind: String,

    pub upstream_base_url: String,
    pub upstream_api_key: String,

    // ── CORS / 限制 ───────────────────────────────────────────────
    #[serde(default = "default_cors")]
    pub cors_allowed_origins: String,

    #[serde(default = "default_rps")]
    pub rate_limit_per_second: u64,
    #[serde(default = "default_burst")]
    pub rate_limit_burst: u32,

    #[serde(default = "default_max_body")]
    pub max_body_bytes: usize,

    #[serde(default = "default_timeout")]
    pub upstream_timeout_secs: u64,

    // ── Token 鉴权 ────────────────────────────────────────────────
    /// HMAC 密钥。**必须配置**且至少 32 字节,否则启动失败。
    pub auth_hmac_secret: String,

    /// 单 token 总额度(超过即拒)
    #[serde(default = "default_token_quota")]
    pub auth_token_quota: u64,

    /// token 生命周期(秒)
    #[serde(default = "default_token_ttl")]
    pub auth_token_ttl_secs: u64,

    /// 允许签发 token 的 origin 白名单。逗号分隔。`*` 表示不校验。
    /// 注意:与 `cors_allowed_origins` 是不同维度的开关——
    /// CORS 决定浏览器是否放行,这里决定服务端是否签发。
    #[serde(default = "default_issue_origins")]
    pub auth_issue_allowed_origins: String,

    // ── Metrics ───────────────────────────────────────────────────
    /// metrics 端点的监听地址,只在 127.0.0.1 暴露。空字符串关闭。
    #[serde(default = "default_metrics_bind")]
    pub metrics_bind: String,
}

fn default_bind() -> String { "127.0.0.1:8787".into() }
fn default_cors() -> String { "*".into() }
fn default_rps() -> u64 { 2 }
fn default_burst() -> u32 { 10 }
fn default_max_body() -> usize { 16 * 1024 * 1024 }
fn default_timeout() -> u64 { 120 }
fn default_token_quota() -> u64 { 100 }
fn default_token_ttl() -> u64 { 3600 }
fn default_issue_origins() -> String { "*".into() }
fn default_metrics_bind() -> String { "127.0.0.1:9898".into() }

impl Config {
    pub fn from_env() -> Result<Self> {
        let cfg: Self = envy::from_env()
            .context("读取环境变量失败,请检查 .env 或 systemd Environment= 配置")?;
        cfg.validate()?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<()> {
        if self.upstream_api_key.trim().is_empty()
            || self.upstream_api_key.contains("替换成你自己的key")
        {
            bail!("UPSTREAM_API_KEY 未配置或仍是占位符");
        }
        if self.auth_hmac_secret.len() < 32 {
            bail!(
                "AUTH_HMAC_SECRET 长度不足 32 字节(当前 {} 字节)。\
                 推荐用 `openssl rand -hex 32` 生成",
                self.auth_hmac_secret.len()
            );
        }
        let _: SocketAddr = self.proxy_bind.parse()
            .with_context(|| format!("PROXY_BIND 不是合法地址: {}", self.proxy_bind))?;
        if !self.metrics_bind.is_empty() {
            let _: SocketAddr = self.metrics_bind.parse()
                .with_context(|| format!("METRICS_BIND 不是合法地址: {}", self.metrics_bind))?;
        }
        Ok(())
    }

    pub fn upstream_base(&self) -> &str {
        self.upstream_base_url.trim_end_matches('/')
    }

    pub fn proxy_bind_addr(&self) -> SocketAddr {
        self.proxy_bind.parse().expect("validated in from_env")
    }

    pub fn metrics_bind_addr(&self) -> Option<SocketAddr> {
        if self.metrics_bind.is_empty() {
            None
        } else {
            Some(self.metrics_bind.parse().expect("validated in from_env"))
        }
    }
}
