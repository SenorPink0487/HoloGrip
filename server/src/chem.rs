//! HoloChem 的 DeepSeek 服务端接口。
//! 前端契约与 Vite 开发中间件一致，生产环境不再把 AI 密钥交给前端。

use axum::{extract::State, http::StatusCode, response::{IntoResponse, Response}, Json};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::proxy::AppState;

const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

const MOLECULE_PROMPT: &str = r#"你是化学与配方分析助手。把用户描述的日常物品、食品饮料、材料、药品等解析成可在 PubChem 检索的纯化学分子清单。
只输出 JSON，不要 markdown。混合物必须拆成多个纯分子，给出典型现实质量/体积百分比估算；单一纯净物 components 仅一项且 percent 为 100。每个成分必须提供 PubChem 友好的英文名 name_en，并尽量给出 formula 和 smiles。禁止把商品名、空气、植物油、蛋白质、脂肪等混合物作为单一成分。无法对应化学物质时返回 {\"ok\":false,\"reason\":\"简短原因\"}。
成功格式：{\"ok\":true,\"kind\":\"mixture\"或\"pure\",\"product_zh\":\"中文名\",\"product_en\":\"English name\",\"note\":\"百分比为典型公开估算原型，非厂商精确配方\",\"reason\":\"一句话总述\",\"components\":[{\"name_zh\":\"水\",\"name_en\":\"water\",\"formula\":\"H2O\",\"smiles\":\"O\",\"percent\":89.0,\"role\":\"溶剂\"}]}。components 按 percent 从高到低排序。"#;

const REACTION_PROMPT: &str = r#"你是严谨的化学反应判定助手。根据给定反应物与实验条件判断是否发生化学反应。只输出 JSON，不要 markdown。方程式必须守恒且配平；products 只列右侧实际产物，每个产物必须提供 PubChem 可检索英文名和分子式；不确定时返回 reacts:false，绝不臆造反应。
反应格式：{\"ok\":true,\"reacts\":true,\"equation\":\"2H2 + O2 -> 2H2O\",\"condition\":\"条件\",\"reason\":\"简短说明\",\"products\":[{\"name_zh\":\"水\",\"name_en\":\"water\",\"formula\":\"H2O\",\"smiles\":\"O\",\"role\":\"产物/现象\"}]}；无反应或条件不足：{\"ok\":true,\"reacts\":false,\"reason\":\"原因及建议条件\",\"condition\":\"...\",\"equation\":\"\",\"products\":[]}。"#;

#[derive(Deserialize)]
pub struct MoleculeRequest {
    query: String,
}

#[derive(Deserialize)]
pub struct ReactionRequest {
    #[serde(default)]
    reactants: Vec<String>,
    #[serde(default)]
    condition: String,
}

pub async fn resolve_molecule(
    State(state): State<AppState>,
    Json(request): Json<MoleculeRequest>,
) -> Response {
    let query = request.query.trim();
    if query.is_empty() {
        return error(StatusCode::BAD_REQUEST, "缺少 query");
    }
    resolve(&state, MOLECULE_PROMPT, format!("【待拆解目标物品/表达】：{query}\n请严格只输出包含 ok 和 components 数组的 JSON 对象：")).await
}

pub async fn resolve_reaction(
    State(state): State<AppState>,
    Json(request): Json<ReactionRequest>,
) -> Response {
    let reactants: Vec<_> = request.reactants.iter().map(|item| item.trim()).filter(|item| !item.is_empty()).collect();
    if reactants.len() < 2 {
        return error(StatusCode::BAD_REQUEST, "至少需要两种反应物");
    }
    let condition = request.condition.trim();
    let condition = if condition.is_empty() { "未指定" } else { condition };
    resolve(&state, REACTION_PROMPT, format!("【反应物】：{}\n【用户选择条件】：{}\n请严格按反应 JSON 契约返回。", reactants.join(" + "), condition)).await
}

async fn resolve(state: &AppState, system: &str, user: String) -> Response {
    if state.deepseek_api_key.trim().is_empty() {
        return error(StatusCode::SERVICE_UNAVAILABLE, "未配置 DEEPSEEK_API_KEY");
    }
    let payload = json!({
        "model": state.deepseek_model.as_str(),
        "temperature": 0.2,
        "max_tokens": 1500,
        "thinking": { "type": "disabled" },
        "response_format": { "type": "json_object" },
        "messages": [{ "role": "system", "content": system }, { "role": "user", "content": user }]
    });
    let upstream = match state.http.post(DEEPSEEK_URL)
        .bearer_auth(state.deepseek_api_key.as_str())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .body(payload.to_string())
        .send().await {
        Ok(response) => response,
        Err(_) => return error(StatusCode::BAD_GATEWAY, "无法连接 DeepSeek 服务"),
    };
    let status = upstream.status();
    let data: Value = upstream
        .text()
        .await
        .ok()
        .and_then(|body| serde_json::from_str(&body).ok())
        .unwrap_or_else(|| json!({}));
    if !status.is_success() {
        let message = data.pointer("/error/message").and_then(Value::as_str).or_else(|| data.get("message").and_then(Value::as_str)).unwrap_or("DeepSeek 请求失败");
        return error(if status == reqwest::StatusCode::UNAUTHORIZED { StatusCode::UNAUTHORIZED } else { StatusCode::BAD_GATEWAY }, message);
    }
    let content = data.pointer("/choices/0/message/content").and_then(Value::as_str).or_else(|| data.pointer("/choices/0/message/reasoning_content").and_then(Value::as_str)).unwrap_or("");
    let mut result: Value = match serde_json::from_str(content.trim()) {
        Ok(value) => value,
        Err(_) => return error(StatusCode::BAD_GATEWAY, "无法解析 DeepSeek 返回的 JSON"),
    };
    if let Some(object) = result.as_object_mut() {
        object.insert("model".into(), data.get("model").cloned().unwrap_or_else(|| Value::String(state.deepseek_model.to_string())));
    }
    Json(result).into_response()
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}
