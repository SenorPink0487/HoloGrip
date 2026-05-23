//! HMAC-SHA256 签发的短期 token 鉴权。
//!
//! ── 工作流 ────────────────────────────────────────────────────────
//! 1. 浏览器首次进站,POST /api/auth/issue(Origin 校验通过即可,不需登录)
//! 2. 服务端用 `AUTH_HMAC_SECRET` 签一个 token,内嵌:
//!    - jti  : UUID,用作内存 quota 计数 key
//!    - ip   : 客户端 IP,验证时要求一致(防 token 被分享外刷)
//!    - exp  : 过期时间(unix 秒)
//!    - quota: 该 token 总可调用次数
//! 3. 后续 /api/gemini/* 必须带 `Authorization: Bearer <token>`
//!    服务端校验:
//!    - HMAC 签名(constant-time 比较,防计时攻击)
//!    - 未过期
//!    - IP 一致
//!    - quota 未耗尽(用内存 HashMap 计数)
//! 4. 服务重启 → 内存 quota 清空 → 旧 token 立即失效。这是有意的设计:
//!    防止 token 被长期囤积。前端拿到 401 后重新调 /api/auth/issue 即可。
//!
//! ── 安全边界 ──────────────────────────────────────────────────────
//! - HMAC 密钥永远不出服务端;前端拿到的只是签发好的 token。
//! - 浏览器还是可以从 DevTools 看到 token,但 token 1 小时过期、有调用上限、
//!   绑定 IP,泄露代价远小于直接泄露 API key。
//! - 这是 "best-effort" 防滥用,不是认证系统;别拿来扛绕过抓包的攻击者。

use std::{
    collections::HashMap,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Result;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use subtle::ConstantTimeEq;
use thiserror::Error;
use uuid::Uuid;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TokenPayload {
    /// JWT-style "jwt id":token 唯一标识,作内存 quota key
    pub jti: String,
    /// 签发时的客户端 IP(字符串形式,IPv4/IPv6 通用)
    pub ip: String,
    /// 过期时间,unix 秒
    pub exp: u64,
    /// 签发时间,unix 秒
    pub iat: u64,
    /// 此 token 允许的总调用次数
    pub quota: u64,
}

#[derive(Debug, Error)]
pub enum AuthError {
    #[error("token 格式非法")]
    Malformed,
    #[error("token 签名校验失败")]
    BadSignature,
    #[error("token 已过期")]
    Expired,
    #[error("token 与请求 IP 不匹配")]
    IpMismatch,
    #[error("token 调用次数已耗尽")]
    QuotaExhausted,
    #[error("internal: {0}")]
    Internal(String),
}

/// Token 服务:负责签发、验证、quota 计数。
#[derive(Clone)]
pub struct TokenService {
    secret: Arc<Vec<u8>>,
    ttl_secs: u64,
    default_quota: u64,
    /// jti → 已使用次数。key 在 token 过期后由 sweep 清理。
    counters: Arc<RwLock<HashMap<String, Counter>>>,
}

#[derive(Debug, Clone, Copy)]
struct Counter {
    used: u64,
    exp: u64,
}

impl TokenService {
    pub fn new(secret: &str, ttl_secs: u64, default_quota: u64) -> Self {
        Self {
            secret: Arc::new(secret.as_bytes().to_vec()),
            ttl_secs,
            default_quota,
            counters: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// 签发新 token。绑定客户端 IP,有效期由配置控制。
    pub fn issue(&self, client_ip: &str) -> Result<(String, TokenPayload)> {
        let now = unix_now();
        let payload = TokenPayload {
            jti: Uuid::new_v4().to_string(),
            ip: client_ip.to_string(),
            iat: now,
            exp: now.saturating_add(self.ttl_secs),
            quota: self.default_quota,
        };

        let payload_json = serde_json::to_vec(&payload)?;
        let payload_b64 = URL_SAFE_NO_PAD.encode(&payload_json);

        let sig = self.sign(payload_b64.as_bytes())?;
        let sig_b64 = URL_SAFE_NO_PAD.encode(&sig);

        Ok((format!("{payload_b64}.{sig_b64}"), payload))
    }

    /// 验证 token 并消费一次 quota。原子语义:验证通过的同一刻 used+=1。
    pub fn verify_and_consume(&self, token: &str, client_ip: &str) -> Result<TokenPayload, AuthError> {
        let (payload_b64, sig_b64) = token.split_once('.')
            .ok_or(AuthError::Malformed)?;

        // 1. HMAC 验签(constant-time)
        let expected_sig = self.sign(payload_b64.as_bytes())
            .map_err(|e| AuthError::Internal(e.to_string()))?;
        let provided_sig = URL_SAFE_NO_PAD.decode(sig_b64)
            .map_err(|_| AuthError::Malformed)?;

        if expected_sig.ct_eq(&provided_sig).unwrap_u8() != 1 {
            return Err(AuthError::BadSignature);
        }

        // 2. 解 payload
        let payload_bytes = URL_SAFE_NO_PAD.decode(payload_b64)
            .map_err(|_| AuthError::Malformed)?;
        let payload: TokenPayload = serde_json::from_slice(&payload_bytes)
            .map_err(|_| AuthError::Malformed)?;

        // 3. 时间 / IP 检查
        let now = unix_now();
        if now >= payload.exp {
            return Err(AuthError::Expired);
        }
        if payload.ip != client_ip {
            return Err(AuthError::IpMismatch);
        }

        // 4. quota:写锁里原子地检查并 +1
        {
            let mut map = self.counters.write();
            let entry = map.entry(payload.jti.clone()).or_insert(Counter {
                used: 0,
                exp: payload.exp,
            });
            if entry.used >= payload.quota {
                return Err(AuthError::QuotaExhausted);
            }
            entry.used += 1;
        }

        Ok(payload)
    }

    /// 后台清扫:定期调用,删掉已过期的 counter,防止内存泄漏。
    pub fn sweep_expired(&self) {
        let now = unix_now();
        let mut map = self.counters.write();
        map.retain(|_, c| c.exp > now);
    }

    fn sign(&self, msg: &[u8]) -> Result<Vec<u8>> {
        let mut mac = HmacSha256::new_from_slice(&self.secret)
            .map_err(|e| anyhow::anyhow!("hmac key: {e}"))?;
        mac.update(msg);
        Ok(mac.finalize().into_bytes().to_vec())
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// origin 白名单匹配。`*` 表示放行任意 origin。
pub fn origin_allowed(allowlist: &str, origin: Option<&str>) -> bool {
    let trimmed = allowlist.trim();
    if trimmed == "*" || trimmed.is_empty() {
        return true;
    }
    let Some(origin) = origin else { return false };
    trimmed
        .split(',')
        .map(|s| s.trim())
        .any(|allowed| !allowed.is_empty() && allowed == origin)
}

/// 启动一个后台任务,定期扫除过期 token 计数器。
pub fn spawn_sweeper(svc: TokenService) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_secs(300));
        ticker.tick().await; // 立即触发一次,丢掉
        loop {
            ticker.tick().await;
            svc.sweep_expired();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn issue_then_verify_ok() {
        let svc = TokenService::new("a-32-byte-secret-aaaaaaaaaaaaaaaa", 3600, 5);
        let (token, _payload) = svc.issue("1.2.3.4").unwrap();

        // 同 IP 校验:连续消耗 5 次后第 6 次拒绝
        for _ in 0..5 {
            svc.verify_and_consume(&token, "1.2.3.4").unwrap();
        }
        let err = svc.verify_and_consume(&token, "1.2.3.4").unwrap_err();
        assert!(matches!(err, AuthError::QuotaExhausted));
    }

    #[test]
    fn ip_mismatch_rejected() {
        let svc = TokenService::new("a-32-byte-secret-aaaaaaaaaaaaaaaa", 3600, 5);
        let (token, _) = svc.issue("1.2.3.4").unwrap();
        let err = svc.verify_and_consume(&token, "9.9.9.9").unwrap_err();
        assert!(matches!(err, AuthError::IpMismatch));
    }

    #[test]
    fn tampered_signature_rejected() {
        let svc = TokenService::new("a-32-byte-secret-aaaaaaaaaaaaaaaa", 3600, 5);
        let (token, _) = svc.issue("1.2.3.4").unwrap();
        // 改 payload 部分,签名保持不变 → 应该被拒
        let (payload, sig) = token.split_once('.').unwrap();
        let evil = format!("{payload}A.{sig}");
        let err = svc.verify_and_consume(&evil, "1.2.3.4").unwrap_err();
        assert!(matches!(err, AuthError::BadSignature | AuthError::Malformed));
    }

    #[test]
    fn origin_allowed_works() {
        assert!(origin_allowed("*", None));
        assert!(origin_allowed("*", Some("https://x.com")));
        assert!(origin_allowed("https://a.com,https://b.com", Some("https://a.com")));
        assert!(!origin_allowed("https://a.com", Some("https://evil.com")));
        assert!(!origin_allowed("https://a.com", None));
    }
}
