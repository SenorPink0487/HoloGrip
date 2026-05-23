//! Tauri 后端入口。
//!
//! 提供两类前端命令：
//!  1. AI 几何识别 (`parse_geometry_image`)：走 OpenAI 兼容协议
//!     POST https://api.gemai.cc/v1/chat/completions，让模型把图片识别成结构化的
//!     立体几何 JSON，再返回给前端。所有密钥都只在 Rust 进程里使用，不暴露给 webview。
//!  2. 本地模型仓库 (`list_ai_models` / `save_ai_model` / `delete_ai_model` /
//!     `clear_ai_models`)：把 AI 解析得到的几何结果以 JSON 文件形式存到 app
//!     的本地数据目录下的 `ai-models/` 子目录，方便重启后回灌到自定义模型列表。

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

mod ai;
mod local_store;

/// 把任何错误映射成可序列化的字符串，方便前端 invoke 直接拿到。
#[derive(Debug, thiserror::Error)]
pub enum CommandError {
    #[error("{0}")]
    Msg(String),
}

impl serde::Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<anyhow::Error> for CommandError {
    fn from(value: anyhow::Error) -> Self {
        CommandError::Msg(format!("{value:#}"))
    }
}

impl From<std::io::Error> for CommandError {
    fn from(value: std::io::Error) -> Self {
        CommandError::Msg(value.to_string())
    }
}

pub type CmdResult<T> = Result<T, CommandError>;

/// 计算并保证 ai-models 目录存在。
fn ensure_ai_models_dir<R: Runtime>(app: &tauri::AppHandle<R>) -> CmdResult<PathBuf> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| CommandError::Msg(format!("无法定位应用数据目录: {e}")))?;
    let dir = base.join("ai-models");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// 调 AI 接口，把图片解析成几何结构。
#[tauri::command]
async fn parse_geometry_image(
    image_base64: String,
    mime_type: String,
) -> CmdResult<serde_json::Value> {
    let result = ai::parse_geometry_image(&image_base64, &mime_type)
        .await
        .map_err(CommandError::from)?;
    Ok(result)
}

/// 列出本地 ai-models 目录下所有已保存的模型 JSON。
#[tauri::command]
async fn list_ai_models<R: Runtime>(app: tauri::AppHandle<R>) -> CmdResult<Vec<serde_json::Value>> {
    let dir = ensure_ai_models_dir(&app)?;
    Ok(local_store::list_models(&dir).map_err(CommandError::from)?)
}

/// 保存一个模型到本地，返回它在磁盘上的相对文件名。
#[derive(Debug, Deserialize)]
struct SaveAiModelArgs {
    model: serde_json::Value,
}

#[derive(Debug, Serialize)]
struct SaveAiModelOutput {
    file_name: String,
    path: String,
}

#[tauri::command]
async fn save_ai_model<R: Runtime>(
    app: tauri::AppHandle<R>,
    args: SaveAiModelArgs,
) -> CmdResult<SaveAiModelOutput> {
    let dir = ensure_ai_models_dir(&app)?;
    let saved = local_store::save_model(&dir, &args.model).map_err(CommandError::from)?;
    Ok(SaveAiModelOutput {
        file_name: saved.file_name,
        path: saved.path,
    })
}

#[derive(Debug, Deserialize)]
struct DeleteAiModelArgs {
    id: String,
}

#[tauri::command]
async fn delete_ai_model<R: Runtime>(
    app: tauri::AppHandle<R>,
    args: DeleteAiModelArgs,
) -> CmdResult<()> {
    let dir = ensure_ai_models_dir(&app)?;
    local_store::delete_model(&dir, &args.id).map_err(CommandError::from)?;
    Ok(())
}

#[tauri::command]
async fn clear_ai_models<R: Runtime>(app: tauri::AppHandle<R>) -> CmdResult<()> {
    let dir = ensure_ai_models_dir(&app)?;
    local_store::clear_models(&dir).map_err(CommandError::from)?;
    Ok(())
}

#[tauri::command]
async fn ai_models_dir<R: Runtime>(app: tauri::AppHandle<R>) -> CmdResult<String> {
    let dir = ensure_ai_models_dir(&app)?;
    Ok(dir.to_string_lossy().to_string())
}

/// 打开 HoloMath 仿真窗口。
///
/// 如果窗口已经存在（label = "simulation"），就把它带回前台、focus；
/// 否则用 `WebviewWindowBuilder` 新建并加载 `app.html`。该路径会被 Tauri
/// 自动解析：开发期解析到 vite dev server 的 `/app.html`，发布期解析到
/// `frontendDist` 中的对应文件。
#[tauri::command]
async fn open_simulation_window<R: Runtime>(app: tauri::AppHandle<R>) -> CmdResult<()> {
    const LABEL: &str = "simulation";

    if let Some(existing) = app.get_webview_window(LABEL) {
        existing
            .show()
            .map_err(|e| CommandError::Msg(format!("show 失败: {e}")))?;
        existing
            .set_focus()
            .map_err(|e| CommandError::Msg(format!("set_focus 失败: {e}")))?;
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, LABEL, WebviewUrl::App("app.html".into()))
        .title("HoloMath - 空间三维几何画板")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .resizable(true)
        .build()
        .map_err(|e| CommandError::Msg(format!("打开仿真窗口失败: {e}")))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // 启动时尝试读取一次 .env，便于开发期把密钥放在 .env 里。
            let _ = ai::load_env_from_workspace();
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_geometry_image,
            list_ai_models,
            save_ai_model,
            delete_ai_model,
            clear_ai_models,
            ai_models_dir,
            open_simulation_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
