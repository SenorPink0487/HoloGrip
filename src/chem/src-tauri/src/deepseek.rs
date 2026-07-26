//! DeepSeek 分子成分解析（桌面端安全调用，密钥不进前端）

use serde_json::{json, Value};

const DEEPSEEK_URL: &str = "https://api.deepseek.com/chat/completions";

const REACTION_SYSTEM_PROMPT: &str = r#"You are a rigorous chemistry reaction evaluator. Return JSON only, never markdown.
For a valid reaction return: {"ok":true,"reacts":true,"equation":"balanced ASCII equation, e.g. 2H2 + O2 -> 2H2O","condition":"actual required condition","reason":"brief explanation","products":[{"name_zh":"水","name_en":"water","formula":"H2O","smiles":"O","role":"product or observable phenomenon"}]}.
For no reaction or insufficient conditions return: {"ok":true,"reacts":false,"equation":"","condition":"suggested condition","reason":"brief explanation","products":[]}.
The equation must be atom-balanced. Products must be actual right-side products, with PubChem-searchable English names and formulas. If uncertain, return reacts:false; never invent a reaction."#;

const SYSTEM_PROMPT: &str = r#"你是化学与配方分析助手。把用户描述的日常物品、食品饮料、材料、药品等解析成可在 PubChem 检索的**纯化学分子**清单。

规则：
1. 只输出一个 JSON 对象，不要 markdown，不要其它文字。
2. 混合物/商品（如可口可乐、酱油、空气、牛奶、糖浆）必须拆成多种**单一纯分子**，给出典型现实质量/体积百分比估算。
3. 单一纯净物则 components 仅一项，percent 为 100。
4. 百分比为公开资料或教科书中的典型估算，总和尽量接近 100；微量成分可合并或省略。
5. 每个成分必须给出 PubChem 友好的英文名 name_en，以及尽量给出 formula 与 smiles。
6. **禁止**把中间混合物/商品名当作成分，例如：
   - 禁止：高果糖玉米糖浆 / HFCS / corn syrup / 淀粉糖浆 / 植物油 / 蛋白质 / 脂肪 / 空气（整项）
   - 必须拆到纯分子：fructose、glucose、water、sucrose、oleic acid、nitrogen、oxygen 等
7. 聚合物/生物大分子用常见小分子代表并在 role 中注明，例如淀粉→glucose，蛋白质→glycine 或常见氨基酸。
8. 优先常见小分子（无机盐、单糖、有机酸、气体、溶剂），避免无法查 3D 结构的模糊条目。
9. 无法对应化学物质时：{"ok":false,"reason":"简短原因"}

成功 JSON：
{
  "ok": true,
  "kind": "mixture" 或 "pure",
  "product_zh": "中文物品名",
  "product_en": "English name",
  "note": "说明百分比为典型估算原型，非厂商精确配方",
  "reason": "一句话总述",
  "components": [
    {
      "name_zh": "水",
      "name_en": "water",
      "formula": "H2O",
      "smiles": "O",
      "percent": 89.0,
      "role": "溶剂"
    }
  ]
}

components 按 percent 从高到低排序，至少 1 项；混合物建议 3–8 项纯分子。"#;

fn extract_json(text: &str) -> Result<Value, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("模型返回为空".into());
    }

    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Ok(v);
    }

    // ```json ... ```
    if let Some(start) = trimmed.find("```") {
        let after = &trimmed[start + 3..];
        let after = after
            .strip_prefix("json")
            .or_else(|| after.strip_prefix("JSON"))
            .unwrap_or(after)
            .trim_start();
        if let Some(end) = after.find("```") {
            if let Ok(v) = serde_json::from_str::<Value>(after[..end].trim()) {
                return Ok(v);
            }
        }
    }

    if let (Some(s), Some(e)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if e > s {
            if let Ok(v) = serde_json::from_str::<Value>(&trimmed[s..=e]) {
                return Ok(v);
            }
        }
    }

    Err("无法解析模型返回的 JSON".into())
}

/// 解析日常用语 → 化学成分清单（与 Web 端 `/api/resolve-molecule` 同契约）
#[tauri::command]
pub async fn resolve_molecule(query: String) -> Result<Value, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err("缺少 query".into());
    }

    let api_key = std::env::var("DEEPSEEK_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Err("未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中设置，或设置系统环境变量".into());
    }

    let model =
        std::env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".to_string());

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;

    let user_prompt = format!("【待拆解目标物品/表达】：{query}\n请按规范严格只输出包含 \"ok\": true 和 \"components\" 数组的 JSON 对象：");

    // V4 默认开启 thinking，会先生成大量 reasoning_tokens 再出答案，体感比网页聊天慢很多。
    // 成分拆解是结构化抽取任务，关闭思考即可接近网页“非深度思考”速度。
    let body = json!({
        "model": model,
        "temperature": 0.2,
        "max_tokens": 1500,
        "thinking": { "type": "disabled" },
        "response_format": { "type": "json_object" },
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": user_prompt }
        ]
    });

    let upstream = client
        .post(DEEPSEEK_URL)
        .header("Content-Type", "application/json")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("AI 请求失败: {e}"))?;

    let status = upstream.status();
    let data: Value = upstream
        .json()
        .await
        .map_err(|e| format!("AI 响应解析失败: {e}"))?;

    if !status.is_success() {
        let msg = data
            .pointer("/error/message")
            .or_else(|| data.get("message"))
            .and_then(|v| v.as_str())
            .unwrap_or("AI 请求失败");
        return Err(if status.as_u16() == 401 {
            format!("AI 鉴权失败: {msg}")
        } else {
            format!("AI HTTP {}: {msg}", status.as_u16())
        });
    }

    let content = data
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .or_else(|| {
            data.pointer("/choices/0/message/reasoning_content")
                .and_then(|v| v.as_str())
        })
        .unwrap_or("")
        .to_string();

    let mut parsed = extract_json(&content)?;

    if let Some(obj) = parsed.as_object_mut() {
        let used_model = data
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or(&model)
            .to_string();
        obj.insert("model".into(), Value::String(used_model));
        obj.insert("raw".into(), Value::String(content));
    }

    Ok(parsed)
}

#[tauri::command]
pub async fn resolve_reaction(reactants: Vec<String>, condition: String) -> Result<Value, String> {
    let reactants: Vec<String> = reactants.into_iter().map(|item| item.trim().to_string()).filter(|item| !item.is_empty()).collect();
    if reactants.len() < 2 { return Err("至少需要两种反应物".into()); }
    let api_key = std::env::var("DEEPSEEK_API_KEY").unwrap_or_default();
    if api_key.is_empty() { return Err("未配置 DEEPSEEK_API_KEY，请在项目根目录 .env 中设置".into()); }
    let model = std::env::var("DEEPSEEK_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".to_string());
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(60)).build()
        .map_err(|e| format!("HTTP 客户端创建失败: {e}"))?;
    let prompt = format!("Reactants: {}\nSelected condition: {}\nReturn the reaction JSON contract.", reactants.join(" + "), if condition.trim().is_empty() { "unspecified" } else { condition.trim() });
    let body = json!({
        "model": model, "temperature": 0.1, "max_tokens": 1200,
        "thinking": { "type": "disabled" }, "response_format": { "type": "json_object" },
        "messages": [{ "role": "system", "content": REACTION_SYSTEM_PROMPT }, { "role": "user", "content": prompt }]
    });
    let upstream = client.post(DEEPSEEK_URL).header("Content-Type", "application/json").bearer_auth(&api_key).json(&body).send().await
        .map_err(|e| format!("AI 请求失败: {e}"))?;
    let status = upstream.status();
    let data: Value = upstream.json().await.map_err(|e| format!("AI 响应解析失败: {e}"))?;
    if !status.is_success() {
        let msg = data.pointer("/error/message").or_else(|| data.get("message")).and_then(|v| v.as_str()).unwrap_or("AI 请求失败");
        return Err(format!("AI HTTP {}: {msg}", status.as_u16()));
    }
    let content = data.pointer("/choices/0/message/content").and_then(|v| v.as_str())
        .or_else(|| data.pointer("/choices/0/message/reasoning_content").and_then(|v| v.as_str())).unwrap_or("").to_string();
    let mut parsed = extract_json(&content)?;
    if let Some(obj) = parsed.as_object_mut() {
        obj.insert("model".into(), Value::String(data.get("model").and_then(|v| v.as_str()).unwrap_or(&model).to_string()));
        obj.insert("raw".into(), Value::String(content));
    }
    Ok(parsed)
}
