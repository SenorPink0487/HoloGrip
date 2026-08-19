# HoloGrip iPad 构建规范

## 1. 目标设备与运行指标

- 目标设备：2024 款 iPad Pro 13 英寸，Apple M4。
- 目标壳层：iPadOS Tauri WebView，横屏优先；页面尺寸必须使用运行时 viewport 和 safe-area，不得写死物理像素尺寸。
- 设备参考分辨率：横屏 2752 × 2064 物理像素；布局按 CSS viewport 自适应。
- 帧率目标：60 FPS。
- 单帧预算：16.67 ms；物理固定步长使用 `1 / 60` 秒，渲染、输入和模拟不能阻塞主线程。
- 验收下限：白板和物理/化学场景在连续交互时稳定保持 60 FPS；出现持续低于 60 FPS 时，应优先降低渲染质量或延后非关键任务，不牺牲输入响应。

## 1.1 大模型 API 链路

- iPad 包内所有大模型请求统一走 `https://hologrip.cn` 的服务端代理，与网页生产版使用相同的 API origin 和鉴权链路。
- 数学几何识别使用 `https://hologrip.cn/api/gemini/...`，通过网页一致的短期 token，不在 iPad 包内放置真实模型密钥。
- 化学分子解析和反应判定使用 `https://hologrip.cn/api/resolve-molecule`、`https://hologrip.cn/api/resolve-reaction`。
- iPad 不直连 Gemini/DeepSeek 上游，也不使用本地 Tauri 化学模型命令作为首选路径。
- iOS Tauri 构建必须设置 `VITE_API_ORIGIN=https://hologrip.cn` 和 `VITE_GEMINI_BASE_URL=/api/gemini`；前端代码中的相对 `/api/*` 请求必须经过统一的 `apiUrl()` 解析。

## 2. 启动与导航

iPad App 启动后直接加载 `whiteboard.html`，不显示门户、启动器或桌面应用矩阵。

白板内允许的入口：

| 入口 | 页面/模式 | 构建要求 |
| --- | --- | --- |
| 数学白板 | `whiteboard.html` | 必须内置，包含画笔、橡皮、几何板、页面管理、工具箱、嵌入窗口、本地/云端白板同步等功能 |
| 数学空间 AR | `holomath.html` | 必须内置，由白板数学入口打开 |
| 物理 | `physics.html` | 必须内置，包含物理实验室与 iPad 触控/手势入口 |
| 化学 | `physics.html?mode=chem` | 与物理共享页面和运行时；必须内置化学模式所需的动态模块与资源 |

退出物理/化学 iframe 后必须回到白板，不得回到门户或打开不存在的页面。

## 3. iPad 包体白名单

### HTML 入口白名单

```text
whiteboard.html
holomath.html
physics.html
```

### 静态资源白名单

```text
public/assets/       # MediaPipe、手部模型
public/fonts/        # 白板 UI 字体
public/portraits/    # 物理实验室人物卡片
```

`src/physics/src/labShell.js` 使用的 `src/pool/touch-controls.js` 仅作为跨模块的 iPad 触控归一化工具进入依赖图；不得因此纳入台球页面、台球音效、台球纹理或台球业务模块。

## 4. 明确排除项

iPad 构建不得输出以下入口或静态资源目录：

```text
index.html
chem.html              # 化学由 physics.html?mode=chem 提供
rocket.html
pool.html
public/design-ui/
public/sounds/
public/textures/
public/pool/
```

同时不得通过白板导航暴露火箭和台球入口。桌面端和全量 Web 构建可继续保留这些模块，不得因 iPad 规范删改桌面端功能。

## 5. 构建与自动检查

```bash
npm run build:ipad
```

`build:ipad` 必须同时完成：

1. 使用 `HOLO_TARGET=ipad` 构建，并默认注入 `VITE_API_ORIGIN=https://hologrip.cn`、`VITE_GEMINI_BASE_URL=/api/gemini`。
2. 仅生成上述 3 个 HTML 入口。
3. 仅复制静态资源白名单。
4. 自动确认必需入口存在，并确认火箭、台球及未使用门户入口不存在；检查失败时构建退出码必须非 0。

## 6. 验收清单

- 冷启动进入白板，不出现门户/启动器闪屏。
- 白板画笔、橡皮、颜色/粗细、清空、页面新增/切换/删除、几何绘制、尺规工具、函数/计算器嵌入窗口均可用。
- 白板数学入口能打开 `holomath.html`，摄像头/手势权限失败时仍有可理解的降级提示。
- 白板物理入口能打开物理实验室；返回操作能回到白板。
- 白板化学入口能以 `mode=chem` 打开化学实验室；化学搜索、分子/实验交互可用；返回操作能回到白板。
- 在 iPad Pro 13 英寸 M4 真机上横屏连续操作，目标帧率为 60 FPS，且无明显触控丢帧、黑屏、页面溢出或 safe-area 遮挡。
- 构建产物中不存在火箭、台球 HTML 入口和对应静态资源目录。
