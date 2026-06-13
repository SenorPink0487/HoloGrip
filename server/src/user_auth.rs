//! 用户注册 / 登录 / 个人信息 / 修改密码 API
//!
//! POST /api/user/register         → 注册
//! POST /api/user/login            → 登录，返回 JWT
//! GET  /api/user/me               → 鉴权后返回用户信息
//! POST /api/user/password/code    → 向当前登录邮箱发送修改密码验证码
//! POST /api/user/password/change  → 验证邮箱验证码后修改密码

use std::sync::Arc;

use anyhow::{Context, Result};
use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Request, State},
    http::{header, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
    Extension,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::MySqlPool;
use tracing::warn;

#[derive(Clone)]
pub struct UserAuthState {
    pub pool: MySqlPool,
    pub jwt_secret: Arc<String>,
    pub jwt_expires_secs: u64,
    pub mail: Arc<MailConfig>,
}

#[derive(Debug, Clone)]
pub struct MailConfig {
    pub smtp_host: String,
    pub smtp_port: u16,
    pub smtp_username: String,
    pub smtp_password: String,
    pub smtp_from: String,
    pub smtp_tls: bool,
    pub app_public_base_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: u64,
    pub username: String,
    pub email: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Deserialize)]
pub struct RegisterReq {
    pub username: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct LoginReq {
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordReq {
    pub current_password: String,
    pub new_password: String,
    pub code: String,
}

#[derive(Serialize)]
pub struct SimpleResp {
    pub message: &'static str,
}

#[derive(Serialize)]
pub struct CodeResp {
    pub message: &'static str,
    pub expires_in: u64,
}

#[derive(Serialize)]
pub struct AuthResp {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Serialize, Clone)]
pub struct UserInfo {
    pub id: u64,
    pub username: String,
    pub email: String,
}

fn now_secs() -> usize {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as usize)
        .unwrap_or(0)
}

fn make_jwt(
    state: &UserAuthState,
    user_id: u64,
    username: &str,
    email: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let now = now_secs();
    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        email: email.to_string(),
        iat: now,
        exp: now + state.jwt_expires_secs as usize,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
}

pub fn verify_jwt(secret: &str, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
    let data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )?;
    Ok(data.claims)
}

/// POST /api/user/register
pub async fn register(
    State(state): State<UserAuthState>,
    Json(body): Json<RegisterReq>,
) -> Response {
    let username = body.username.trim().to_string();
    let email = body.email.trim().to_lowercase();
    if username.len() < 2 || username.len() > 32 {
        return err(StatusCode::BAD_REQUEST, "用户名长度须在 2-32 之间");
    }
    if !email.contains('@') {
        return err(StatusCode::BAD_REQUEST, "邮箱格式不正确");
    }
    if body.password.len() < 6 {
        return err(StatusCode::BAD_REQUEST, "密码至少 6 位");
    }

    let hash = match hash_secret(&body.password) {
        Ok(h) => h,
        Err(e) => {
            warn!("密码哈希失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    let uid = match crate::db::create_user(&state.pool, &username, &email, &hash).await {
        Ok(id) => id,
        Err(sqlx::Error::Database(e)) if e.message().contains("Duplicate") => {
            return err(StatusCode::CONFLICT, "用户名或邮箱已被注册");
        }
        Err(e) => {
            warn!("注册写库失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    let token = match make_jwt(&state, uid, &username, &email) {
        Ok(t) => t,
        Err(e) => {
            warn!("JWT 签发失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    Json(AuthResp {
        token,
        user: UserInfo {
            id: uid,
            username,
            email,
        },
    })
    .into_response()
}

/// POST /api/user/login
pub async fn login(State(state): State<UserAuthState>, Json(body): Json<LoginReq>) -> Response {
    let email = body.email.trim().to_lowercase();

    let row = match crate::db::find_by_email(&state.pool, &email).await {
        Ok(Some(r)) => r,
        Ok(None) => return err(StatusCode::UNAUTHORIZED, "邮箱或密码错误"),
        Err(e) => {
            warn!("登录查库失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    if !verify_secret(&body.password, &row.password_hash) {
        return err(StatusCode::UNAUTHORIZED, "邮箱或密码错误");
    }

    let token = match make_jwt(&state, row.id, &row.username, &row.email) {
        Ok(t) => t,
        Err(e) => {
            warn!("JWT 签发失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    Json(AuthResp {
        token,
        user: UserInfo {
            id: row.id,
            username: row.username,
            email: row.email,
        },
    })
    .into_response()
}

/// GET /api/user/me
pub async fn me(Extension(claims): Extension<Claims>) -> impl IntoResponse {
    Json(UserInfo {
        id: claims.sub,
        username: claims.username,
        email: claims.email,
    })
}

/// POST /api/user/password/code
pub async fn send_password_code(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
) -> Response {
    let code = generate_verification_code();
    let code_hash = match hash_secret(&code) {
        Ok(h) => h,
        Err(e) => {
            warn!("验证码哈希失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };
    let expires_at = (Utc::now() + Duration::minutes(10)).naive_utc();

    if let Err(e) = crate::db::upsert_password_change_code(
        &state.pool,
        claims.sub,
        &claims.email,
        &code_hash,
        expires_at,
    )
    .await
    {
        warn!("保存修改密码验证码失败: {e}");
        return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
    }

    if let Err(e) = send_verification_email(&state.mail, &claims.email, &code).await {
        warn!("发送修改密码验证码失败: {e:#}");
        let _ = crate::db::delete_password_change_code(&state.pool, claims.sub).await;
        return err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "验证码发送失败，请稍后重试",
        );
    }

    Json(CodeResp {
        message: "验证码已发送",
        expires_in: 600,
    })
    .into_response()
}

/// POST /api/user/password/change
pub async fn change_password(
    State(state): State<UserAuthState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangePasswordReq>,
) -> Response {
    let code = body.code.trim();
    if code.len() != 6 || !code.chars().all(|c| c.is_ascii_digit()) {
        return err(StatusCode::BAD_REQUEST, "验证码格式不正确");
    }
    if body.new_password.len() < 6 {
        return err(StatusCode::BAD_REQUEST, "新密码至少 6 位");
    }

    let user = match crate::db::find_by_id(&state.pool, claims.sub).await {
        Ok(Some(u)) => u,
        Ok(None) => return err(StatusCode::UNAUTHORIZED, "账号不存在"),
        Err(e) => {
            warn!("修改密码查用户失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    if !verify_secret(&body.current_password, &user.password_hash) {
        return err(StatusCode::UNAUTHORIZED, "当前密码错误");
    }

    let row = match crate::db::find_password_change_code(&state.pool, claims.sub).await {
        Ok(Some(r)) => r,
        Ok(None) => return err(StatusCode::BAD_REQUEST, "请先获取邮箱验证码"),
        Err(e) => {
            warn!("查询修改密码验证码失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    if row.email != claims.email {
        let _ = crate::db::delete_password_change_code(&state.pool, claims.sub).await;
        return err(StatusCode::BAD_REQUEST, "验证码已失效，请重新获取");
    }
    if row.expires_at < Utc::now().naive_utc() {
        let _ = crate::db::delete_password_change_code(&state.pool, claims.sub).await;
        return err(StatusCode::BAD_REQUEST, "验证码已过期，请重新获取");
    }
    if row.attempts >= 5 {
        let _ = crate::db::delete_password_change_code(&state.pool, claims.sub).await;
        return err(
            StatusCode::TOO_MANY_REQUESTS,
            "验证码错误次数过多，请重新获取",
        );
    }
    if !verify_secret(code, &row.code_hash) {
        let _ = crate::db::increment_password_change_attempts(&state.pool, claims.sub).await;
        return err(StatusCode::BAD_REQUEST, "验证码错误");
    }

    let new_hash = match hash_secret(&body.new_password) {
        Ok(h) => h,
        Err(e) => {
            warn!("新密码哈希失败: {e}");
            return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
        }
    };

    if let Err(e) = crate::db::update_user_password(&state.pool, claims.sub, &new_hash).await {
        warn!("更新密码失败: {e}");
        return err(StatusCode::INTERNAL_SERVER_ERROR, "服务器内部错误");
    }
    let _ = crate::db::delete_password_change_code(&state.pool, claims.sub).await;

    Json(SimpleResp {
        message: "密码已更新",
    })
    .into_response()
}

pub async fn jwt_auth(
    State(state): State<UserAuthState>,
    mut req: Request,
    next: Next,
) -> Response {
    let header_val = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = if let Some(t) = header_val.strip_prefix("Bearer ") {
        t
    } else {
        return err(StatusCode::UNAUTHORIZED, "缺少 Authorization header");
    };

    let claims = match verify_jwt(&state.jwt_secret, token) {
        Ok(c) => c,
        Err(e) => {
            warn!("JWT 验证失败: {e}");
            return err(StatusCode::UNAUTHORIZED, "token 无效或已过期");
        }
    };

    req.extensions_mut().insert(claims);
    next.run(req).await
}

fn hash_secret(secret: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map(|h| h.to_string())
}

fn verify_secret(secret: &str, hash: &str) -> bool {
    let Ok(parsed_hash) = PasswordHash::new(hash) else {
        return false;
    };
    Argon2::default()
        .verify_password(secret.as_bytes(), &parsed_hash)
        .is_ok()
}

fn generate_verification_code() -> String {
    let n: u32 = rand::thread_rng().gen_range(0..=999_999);
    format!("{n:06}")
}

async fn send_verification_email(config: &MailConfig, to: &str, code: &str) -> Result<()> {
    let from: Mailbox = config
        .smtp_from
        .parse()
        .context("SMTP_FROM 不是合法邮箱地址")?;
    let to: Mailbox = to.parse().context("目标邮箱地址不合法")?;
    let body = format!(
        "你的 HoloGrip 修改密码验证码是: {code}\n\n验证码 10 分钟内有效。若非本人操作,请立即检查账号安全。\n\n来源: {}",
        config.app_public_base_url
    );

    let message = Message::builder()
        .from(from)
        .to(to)
        .subject("HoloGrip 修改密码验证码")
        .body(body)
        .context("构建验证码邮件失败")?;

    let creds = Credentials::new(config.smtp_username.clone(), config.smtp_password.clone());
    let mailer = if config.smtp_tls && config.smtp_port == 465 {
        AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .context("创建 SMTP 隐式 TLS 连接配置失败")?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    } else if config.smtp_tls {
        AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.smtp_host)
            .context("创建 SMTP STARTTLS 连接配置失败")?
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    } else {
        AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.smtp_host)
            .port(config.smtp_port)
            .credentials(creds)
            .build()
    };

    mailer.send(message).await.context("SMTP 发送失败")?;
    Ok(())
}

fn err(status: StatusCode, msg: &'static str) -> Response {
    #[derive(Serialize)]
    struct ErrBody {
        error: &'static str,
    }
    (status, Json(ErrBody { error: msg })).into_response()
}

#[cfg(test)]
mod tests {
    use super::generate_verification_code;

    #[test]
    fn verification_code_is_six_digits() {
        for _ in 0..100 {
            let code = generate_verification_code();
            assert_eq!(code.len(), 6);
            assert!(code.chars().all(|c| c.is_ascii_digit()));
        }
    }
}
