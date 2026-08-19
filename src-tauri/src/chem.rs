//! Native chemistry API client for packaged Tauri builds.
//!
//! iPad WebViews can reject a direct cross-origin `fetch` even when the same
//! endpoint works from the website. The remote API remains the source of truth;
//! this only moves the request into the native network stack.

use std::time::Duration;

use reqwest::Client;
use serde_json::{json, Value};

const API_ORIGIN: &str = "https://hologrip.cn";

fn error_message(data: &Value, status: reqwest::StatusCode) -> String {
    data.get("error")
        .and_then(Value::as_str)
        .or_else(|| data.get("message").and_then(Value::as_str))
        .map(str::to_owned)
        .unwrap_or_else(|| format!("远程接口返回 HTTP {status}"))
}

async fn post_json(path: &str, body: Value) -> Result<Value, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(75))
        .build()
        .map_err(|e| format!("创建网络客户端失败: {e}"))?;
    let endpoint = format!("{API_ORIGIN}{path}");
    let response = client
        .post(&endpoint)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("请求远程 AI 服务失败: {e}"))?;
    let status = response.status();
    let raw = response
        .text()
        .await
        .map_err(|e| format!("读取远程 AI 响应失败: {e}"))?;
    let data: Value = serde_json::from_str(&raw).unwrap_or_else(|_| {
        json!({ "error": format!("远程响应不是合法 JSON: {}", raw.chars().take(240).collect::<String>()) })
    });
    if !status.is_success() {
        return Err(format!("{} (HTTP {})", error_message(&data, status), status.as_u16()));
    }
    Ok(data)
}

#[tauri::command]
pub async fn resolve_molecule(query: String) -> Result<Value, String> {
    let query = query.trim();
    if query.is_empty() {
        return Err("缺少 query".into());
    }
    post_json("/api/resolve-molecule", json!({ "query": query })).await
}

#[tauri::command]
pub async fn resolve_reaction(
    reactants: Vec<String>,
    condition: String,
) -> Result<Value, String> {
    if reactants.len() < 2 {
        return Err("至少需要两种反应物".into());
    }
    post_json(
        "/api/resolve-reaction",
        json!({ "reactants": reactants, "condition": condition }),
    )
    .await
}
