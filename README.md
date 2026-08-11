# HoloGrip

HoloGrip 是一个面向数学、物理、化学与航天教学的沉浸式 3D 交互平台。项目以 Web 技术为核心，结合 Three.js、MediaPipe 手势识别和可选的 Tauri 桌面封装，让用户能够在浏览器、平板或桌面客户端中探索可视化实验与空间模型。

## 功能模块

- **HoloMath**：3D 几何、函数探索、计算器和白板式空间交互。
- **Physics Lab**：电磁学、光学、热学、力学与流体等实验模拟，包含 Worker 计算与实验数据导出。
- **Rocket Sandbox**：火箭设计、推进与深空轨道动力学交互实验。
- **HoloPool**：刚体碰撞、球杆运动与轨迹预测实验。
- **HoloChem**：基于 3Dmol.js 的分子结构可视化，以及 PubChem 数据查询接口。
- **统一门户**：Dashboard、Profile、Portfolio 与 Admin 等页面入口。

## 技术栈

| 领域 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript、Vite 6 |
| 3D 与动效 | Three.js、React Three Fiber、Drei、3Dmol.js、Motion、GSAP |
| 手势识别 | MediaPipe Hand Landmarker |
| 物理模拟 | Cannon-es、自定义运动学与天体动力学模块 |
| 状态与样式 | Zustand、Tailwind CSS、CSS |
| 桌面端 | Tauri 2、Rust 2021 |
| 服务端 | Rust、Axum、Tokio、SQLx（位于 `server/`） |

## 环境要求

- Node.js 18 或更高版本
- npm
- Rust 工具链（仅在运行后端或构建 Tauri 客户端时需要）
- Python 3（部分开发脚本可能使用）

## 快速开始

```bash
git clone https://github.com/SenorPink0487/HoloGrip.git
cd HoloGrip
npm install
cp .env.example .env.local
npm run dev
```

开发服务器默认监听 `http://localhost:3000`。请在 `.env.local` 中配置需要的 API 密钥；不要提交 `.env`、`.env.local` 或任何包含密钥的文件。

## 常用命令

```bash
# Web 开发
npm run dev
npm run dev:ipad
npm run build
npm run preview

# 类型检查
npm run lint

# 测试
npm run test:physics
npm run test:rocket
npm run test:pool
npm run test:chem

# 构建目标
npm run build:desktop
npm run build:ipad
npm run tauri:dev
npm run tauri:build

# 启动 Rust 服务端
npm run server:dev
```

## 项目结构

```text
HoloGrip/
├── src/                    # 前端应用与实验模块
│   ├── physics/            # 物理实验、运行时与测试
│   ├── rocket/             # 航天动力学与火箭实验
│   ├── pool/               # 刚体碰撞实验
│   ├── chem/               # 分子可视化与化学实验
│   ├── components/         # 通用 React 组件
│   ├── apps/               # 独立应用入口
│   └── hooks/、lib/、stores/ # Hooks、工具与全局状态
├── server/                 # Rust API 与实时服务
├── src-tauri/              # Tauri 桌面端工程
├── scripts/                # 构建与开发脚本
├── public/                 # 静态资源
├── *.html                  # 各实验与门户页面入口
└── package.json            # 依赖与 npm scripts
```

## 配置说明

项目支持通过环境变量切换运行目标：

- `HOLO_TARGET=desktop`：桌面端开发目标。
- `HOLO_TARGET=ipad`：iPad 适配目标。
- `VITE_API_ORIGIN`、`HOLOGRIP_API_ORIGIN`：前端访问服务端的地址。

服务端配置请参考 `server/` 下的示例文件。外部 AI 或数据服务的密钥只应保存在本地环境变量或安全的部署平台中。

## 贡献

提交代码前建议运行类型检查、相关实验测试和生产构建。提交信息请清楚描述变更范围，并避免把构建产物、密钥或本地配置文件加入版本库。

## 许可证

本项目基于 [GPL-3.0-or-later](./LICENSE) 许可证发布。
