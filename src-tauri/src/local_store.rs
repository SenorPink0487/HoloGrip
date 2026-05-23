//! 本地 AI 模型仓库。
//!
//! 把 AI 解析出来的几何 JSON 持久化到 app data 目录下的 `ai-models/` 子目录。
//! 每个模型一个文件，文件名采用 `<id>.json` 形式，方便按 id 查找/删除。

use std::path::{Path, PathBuf};

use anyhow::{anyhow, Context, Result};
use serde_json::Value;

pub struct SavedModel {
    pub file_name: String,
    pub path: String,
}

/// 保证模型 JSON 至少携带 id / name / savedAt 字段，缺则补齐。
fn enrich_model(model: &Value) -> Result<Value> {
    let mut owned = model.clone();
    let obj = owned
        .as_object_mut()
        .ok_or_else(|| anyhow!("model 必须是 JSON 对象"))?;

    // id：缺失或不是字符串就生成一个时间戳 + 短随机
    let needs_id = !matches!(obj.get("id"), Some(Value::String(s)) if !s.is_empty());
    if needs_id {
        let id = format!(
            "custom_{}",
            chrono::Utc::now().format("%Y%m%d%H%M%S%3f")
        );
        obj.insert("id".to_string(), Value::String(id));
    }

    if !obj.contains_key("name") {
        obj.insert("name".to_string(), Value::String("AI 模型".to_string()));
    }

    obj.insert(
        "savedAt".to_string(),
        Value::String(chrono::Utc::now().to_rfc3339()),
    );

    Ok(owned)
}

fn id_to_filename(id: &str) -> String {
    // 文件名安全过滤：只保留 [A-Za-z0-9_-]
    let safe: String = id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    format!("{safe}.json")
}

pub fn save_model(dir: &Path, model: &Value) -> Result<SavedModel> {
    let enriched = enrich_model(model)?;
    let id = enriched
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("model.id 缺失"))?
        .to_string();

    let file_name = id_to_filename(&id);
    let path: PathBuf = dir.join(&file_name);

    let pretty =
        serde_json::to_string_pretty(&enriched).context("序列化模型 JSON 失败")?;
    std::fs::write(&path, pretty)
        .with_context(|| format!("写入文件 {} 失败", path.display()))?;

    Ok(SavedModel {
        file_name,
        path: path.to_string_lossy().to_string(),
    })
}

pub fn list_models(dir: &Path) -> Result<Vec<Value>> {
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut items: Vec<(String, Value)> = Vec::new();
    for entry in std::fs::read_dir(dir).with_context(|| format!("读取目录 {} 失败", dir.display()))?
    {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(_) => continue,
        };
        let value: Value = match serde_json::from_str(&raw) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let saved_at = value
            .get("savedAt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        items.push((saved_at, value));
    }

    // 按 savedAt 升序，前端拿到的列表保持插入顺序一致
    items.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(items.into_iter().map(|(_, v)| v).collect())
}

pub fn delete_model(dir: &Path, id: &str) -> Result<()> {
    let file_name = id_to_filename(id);
    let path = dir.join(&file_name);
    if path.exists() {
        std::fs::remove_file(&path)
            .with_context(|| format!("删除文件 {} 失败", path.display()))?;
    }
    Ok(())
}

pub fn clear_models(dir: &Path) -> Result<()> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in std::fs::read_dir(dir)? {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("json") {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}
