# ATOMLAB · 原子观象台

基于 **Tauri 2 + Vite + 3Dmol.js + PubChem + DeepSeek** 的交互式 3D 分子结构观象台。

支持两种运行方式：

| 模式 | 命令 | 说明 |
|------|------|------|
| 桌面端（推荐） | `npm run tauri:dev` | Tauri 2 原生窗口，AI 密钥仅在 Rust 后端 |
| 纯 Web | `npm run dev` | 浏览器开发，DeepSeek 由 Vite 中间件代理 |

## 功能

- 日常物品描述（如「盐」「铁锈」「厨房白醋」）→ DeepSeek 识别主要成分 → 3D 结构
- 化学式、英文名、中文名、SMILES 直接检索
- 球棍 / 空间填充 / 线框 / 表面模型
- 自动旋转、原子标签、视角重置

## 环境要求

- **Node.js** 18+
- **Rust**（[rustup](https://rustup.rs/)）— 仅桌面端需要
- **Windows**：已安装 [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)（Win10/11 通常自带）
- **macOS / Linux**：见 [Tauri 前置依赖](https://v2.tauri.app/start/prerequisites/)

## 配置

复制环境变量并填入密钥（**不要提交 `.env`**）：

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_MODEL=deepseek-v4-flash
```

- **Web 模式**：密钥只在 Vite 开发/预览服务端使用，不会打进前端静态资源。
- **Tauri 桌面**：密钥由 Rust 从 `.env` / 系统环境变量读取，前端通过 `invoke('resolve_molecule')` 调用。

## 使用

```bash
npm install

# 桌面端开发（Vite + Tauri 热重载）
npm run tauri:dev

# 或仅浏览器
npm run dev
```

浏览器模式打开 `http://localhost:5173`。

### 生产构建

```bash
# Web 静态资源
npm run build

# 桌面安装包（Windows MSI/NSIS、macOS app、Linux deb/AppImage 等）
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/`。

## 项目结构

```
huaxue/
├── index.html              # 前端入口
├── src/                    # Web 前端（3Dmol 视图、PubChem、UI）
├── server/                 # Vite 中间件（Web 模式 DeepSeek 代理）
├── src-tauri/              # Tauri 2 桌面壳
│   ├── src/
│   │   ├── lib.rs          # 应用入口
│   │   ├── main.rs
│   │   └── deepseek.rs     # DeepSeek 命令（桌面端）
│   ├── capabilities/       # ACL 权限
│   ├── icons/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── vite.config.js
└── package.json
```

## 输入示例

| 类型 | 示例 |
|------|------|
| 日常物品 | `盐` `酒精` `铁锈` `小苏打` `厨房里的白醋` |
| 化学式 | `H2O` `C6H6` `C2H5OH` |
| 英文名 | `caffeine` `aspirin` `glucose` |
| SMILES | `CC(=O)O` `c1ccccc1` |

结构数据来自 [PubChem](https://pubchem.ncbi.nlm.nih.gov/)，自然语言解析使用 [DeepSeek](https://api-docs.deepseek.com/zh-cn/)。
