mod deepseek;

/// 从项目根或当前目录加载 .env（密钥仅在 Rust 侧使用）
fn load_dotenv() {
    // `tauri dev` 时 cwd 通常是项目根；`cargo run` 时可能在 src-tauri
    let candidates = [
        std::path::Path::new(".env"),
        std::path::Path::new("../.env"),
    ];
    for path in candidates {
        if path.is_file() {
            if let Err(e) = dotenvy::from_path(path) {
                log::warn!("加载 {:?} 失败: {}", path, e);
            } else {
                log::info!("已加载环境变量: {:?}", path);
                return;
            }
        }
    }
    // 系统环境变量仍可用
    let _ = dotenvy::dotenv();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    load_dotenv();

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![deepseek::resolve_molecule, deepseek::resolve_reaction])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
