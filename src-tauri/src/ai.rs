//! AI 几何识别客户端。
//!
//! 走 Gemini 原生协议 `/v1beta/models/<model>:generateContent`，把 base64 图像和
//! 系统提示词一起送给模型，让其返回符合预设 JSON Schema 的几何结构。
//!
//! 配置通过环境变量读取：
//!  - `HOLOGRIP_API_ORIGIN`：服务器反代入口，默认 `https://hologrip.cn`
//!  - `GEMAI_MODEL`：模型名，默认 `[福利]gemini-3.5-flash`
//!
//! 桌面端绝不读取 API key 或直连上游；所有 AI 调用都经由与网页版相同的
//! `/api/gemini` 反向代理，由服务器注入真实凭据。

use std::path::PathBuf;
use std::time::Duration;

use anyhow::{anyhow, Context, Result};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{json, Value};

const DEFAULT_API_ORIGIN: &str = "https://hologrip.cn";
const DEFAULT_MODEL: &str = "[福利]gemini-3.5-flash";

const SYSTEM_PROMPT: &str = r#"你是一个精通中国高中立体几何的数学专家。你的任务是分析数学题目截图中的立体几何图形，输出精确的三维模型数据。

# 输出契约（必须严格遵守）
只返回一个合法 JSON 对象，禁止任何 markdown / 注释 / 多余文字。结构如下：
{
  "reasoning": string,
  "name": string,
  "vertices": [ { "label": string, "x": number, "y": number, "z": number } ],
  "faces":   [ [int, int, ...] ],
  "edges":   [ [int, int] ]
}

# 识图规则
中国教材立体几何图几乎全部使用斜二测画法：
- 画面水平 → X 轴；垂直 → Y 轴；左上 ~45° 倾斜方向 → Z 轴
- 沿 Z 轴的真实长度 = 视觉长度 × 2
- 实线为可见棱，虚线为被遮挡的棱
- 偏右下方顶点 z>0；偏左上方顶点 z<0

# 拓扑精简（重要）
1. 剔除辅助线、对角线、内部垂线，不进 edges
2. 剔除动点 / 截面连线，不进 vertices
3. 虚线只在它确实是后方外轮廓棱时才采纳

# 比例还原（重要）
- reasoning 中必须先写出长宽高比例测量结论
- Z 轴坐标差 = 倾斜视觉长度 × 2
- 坐标范围控制在 [-1.5, 1.5]
- 底面 y≈0，顶面/顶点 y>0
"#;

/// 兼容地从 .env 文件加载环境变量（仅开发期需要，生产环境用系统 env）。
pub fn load_env_from_workspace() -> Result<()> {
    let candidates = [
        std::env::current_dir().ok(),
        std::env::current_dir().ok().map(|p| p.join("..")),
    ];
    for base in candidates.into_iter().flatten() {
        let env_path: PathBuf = base.join(".env");
        if env_path.exists() {
            if let Ok(content) = std::fs::read_to_string(&env_path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if let Some((k, v)) = line.split_once('=') {
                        let k = k.trim();
                        let v = v.trim().trim_matches('"').trim_matches('\'');
                        if std::env::var(k).is_err() {
                            std::env::set_var(k, v);
                        }
                    }
                }
                return Ok(());
            }
        }
    }
    Ok(())
}

fn read_config() -> (String, String) {
    let api_origin = std::env::var("HOLOGRIP_API_ORIGIN")
        .or_else(|_| std::env::var("VITE_API_ORIGIN"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API_ORIGIN.to_string())
        .trim_end_matches('/')
        .to_string();
    let base_url = format!("{api_origin}/api/gemini");

    let model = std::env::var("GEMAI_MODEL")
        .or_else(|_| std::env::var("VITE_GEMINI_MODEL"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_MODEL.to_string());

    (base_url, model)
}

/// 给 Gemini 的 responseSchema：从 API 层强约束 JSON 结构，避免解析失败。
fn geometry_schema() -> Value {
    json!({
        "type": "OBJECT",
        "properties": {
            "reasoning": { "type": "STRING" },
            "name":      { "type": "STRING" },
            "vertices": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "label": { "type": "STRING" },
                        "x":     { "type": "NUMBER" },
                        "y":     { "type": "NUMBER" },
                        "z":     { "type": "NUMBER" }
                    },
                    "required": ["label", "x", "y", "z"]
                }
            },
            "faces": {
                "type": "ARRAY",
                "items": {
                    "type": "ARRAY",
                    "items": { "type": "INTEGER" }
                }
            },
            "edges": {
                "type": "ARRAY",
                "items": {
                    "type": "ARRAY",
                    "items": { "type": "INTEGER" }
                }
            }
        },
        "required": ["reasoning", "name", "vertices", "faces", "edges"]
    })
}

/// 发起一次几何识别请求并解析返回的 JSON。
pub async fn parse_geometry_image(image_base64: &str, mime_type: &str) -> Result<Value> {
    let (base_url, model) = read_config();

    let endpoint = format!(
        "{base_url}/v1beta/models/{}:generateContent",
        encode_path_segment(&model)
    );
    let mime = if mime_type.is_empty() {
        "image/png"
    } else {
        mime_type
    };

    let body = json!({
        "systemInstruction": {
            "role": "system",
            "parts": [ { "text": SYSTEM_PROMPT } ]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    { "text": "请分析这张图片中的立体几何图形，输出三维模型数据。注意区分虚线和实线来判断前后关系。只返回 JSON 对象。" },
                    {
                        "inlineData": {
                            "mimeType": mime,
                            "data": image_base64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema":   geometry_schema(),
            "temperature":      0.2
        }
    });

    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .context("构建 HTTP 客户端失败")?;

    let bearer = issue_proxy_token(&client, &base_url).await?;

    let resp = client
        .post(&endpoint)
        .bearer_auth(&bearer)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .with_context(|| format!("请求 {endpoint} 失败"))?;

    let status = resp.status();
    let raw_text = resp.text().await.context("读取响应体失败")?;

    if !status.is_success() {
        return Err(anyhow!(
            "AI 接口返回非 2xx ({status}): {}",
            truncate(&raw_text, 500)
        ));
    }

    let envelope: Value = serde_json::from_str(&raw_text)
        .with_context(|| format!("响应不是合法 JSON: {}", truncate(&raw_text, 500)))?;

    // Gemini 原生返回结构：
    //   { "candidates": [ { "content": { "parts": [ { "text": "..." } ] } } ] }
    let content = envelope
        .pointer("/candidates/0/content/parts/0/text")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            anyhow!(
                "响应缺少 candidates[0].content.parts[0].text: {}",
                truncate(&raw_text, 500)
            )
        })?;

    let cleaned = strip_json_fence(content);

    let parsed: Value = serde_json::from_str(cleaned)
        .with_context(|| format!("AI 返回内容不是合法 JSON: {content}"))?;

    validate_geometry(&parsed)?;
    Ok(parsed)
}

#[derive(Debug, Deserialize)]
struct IssueResponse {
    token: String,
}

async fn issue_proxy_token(client: &Client, proxy_base_url: &str) -> Result<String> {
    let issue_url = proxy_issue_url(proxy_base_url)?;
    let origin = proxy_origin(proxy_base_url)?;
    let resp = client
        .post(&issue_url)
        .header("Content-Type", "application/json")
        .header("Origin", origin)
        .body("{}")
        .send()
        .await
        .with_context(|| format!("请求 {issue_url} 失败"))?;

    let status = resp.status();
    let raw_text = resp.text().await.context("读取 token 响应体失败")?;
    if !status.is_success() {
        return Err(anyhow!(
            "AI token 签发失败 ({status}): {}",
            truncate(&raw_text, 500)
        ));
    }

    let issued: IssueResponse = serde_json::from_str(&raw_text)
        .with_context(|| format!("token 响应不是合法 JSON: {}", truncate(&raw_text, 500)))?;
    if issued.token.trim().is_empty() {
        return Err(anyhow!("token 签发响应缺少 token"));
    }
    Ok(issued.token)
}

fn proxy_issue_url(proxy_base_url: &str) -> Result<String> {
    let origin = proxy_origin(proxy_base_url)?;
    Ok(format!("{origin}/api/auth/issue"))
}

fn proxy_origin(proxy_base_url: &str) -> Result<String> {
    let parsed = reqwest::Url::parse(proxy_base_url)
        .with_context(|| format!("反代地址不是合法 URL: {proxy_base_url}"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| anyhow!("反代地址缺少 host: {proxy_base_url}"))?;
    let mut origin = format!("{}://{}", parsed.scheme(), host);
    if let Some(port) = parsed.port() {
        origin.push_str(&format!(":{port}"));
    }
    Ok(origin)
}

fn strip_json_fence(s: &str) -> &str {
    let trimmed = s.trim();
    if let Some(rest) = trimmed.strip_prefix("```json") {
        rest.trim().trim_end_matches("```").trim()
    } else if let Some(rest) = trimmed.strip_prefix("```") {
        rest.trim().trim_end_matches("```").trim()
    } else {
        trimmed
    }
}

fn validate_geometry(v: &Value) -> Result<()> {
    let vertices = v
        .get("vertices")
        .and_then(|x| x.as_array())
        .ok_or_else(|| anyhow!("缺少 vertices 数组"))?;
    if vertices.len() < 3 {
        return Err(anyhow!("顶点不足 3 个"));
    }
    let faces = v
        .get("faces")
        .and_then(|x| x.as_array())
        .ok_or_else(|| anyhow!("缺少 faces 数组"))?;
    if faces.is_empty() {
        return Err(anyhow!("faces 为空"));
    }
    Ok(())
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() > n {
        let cut: String = s.chars().take(n).collect();
        format!("{cut}…")
    } else {
        s.to_string()
    }
}

fn encode_path_segment(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len());
    for byte in input.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}
