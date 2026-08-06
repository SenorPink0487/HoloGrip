<div align="center">
  <h1>HoloGrip 👐 免穿戴式 AR 空间计算与全息教辅平台</h1>
  <p><b>融合 AI 与空间计算，打破物理界限的新一代沉浸式教育与三维仿真平台</b></p>
  <p>
    <img src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Three.js-r184-000000?logo=three.js" alt="Three.js" />
    <img src="https://img.shields.io/badge/Tauri-v2.11-FFC131?logo=tauri" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust" alt="Rust" />
    <img src="https://img.shields.io/badge/AI-Gemini_3.5_/_DeepSeek-4285F4?logo=google" alt="Google Gemini & DeepSeek" />
    <img src="https://img.shields.io/badge/Codebase-220k+_LOC-brightgreen" alt="220k+ Lines of Code" />
    <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="GPL-3.0 License" />
  </p>
</div>

---

## 🌟 项目简介

**HoloGrip** 是一款前沿的**免穿戴式 AR（增强现实）空间计算与全息教辅/科学仿真平台**。无需昂贵且沉重的 VR/AR 头显设备，仅凭标准电脑或平板的摄像头，通过 **MediaPipe 21 点手势追踪** 与 **Three.js 高性能 3D 渲染引擎**，即可实现自然流畅的裸眼手势空间交互。

平台经过深度演进与模块扩展，全案代码规模已达 **220,000+ 行**（400+ 个源码文件），构建了涵盖**数学几何与全息白板**、**高级物理实验室**、**火箭航天动力学工坊**、**3D 刚体碰撞台球**与**化学分子观象台**的五位一体科学仿真生态系统，并深度集成了 **Google Gemini 多模态 AI** 与 **Rust (Axum + Tokio) 高性能安全后端**。

---

## 🚀 核心功能模块

### 1. 📐 HoloMath 3D 几何与全息交互黑板
- **全息几何画板 (`GeometryBoard` & `MathModel`)**：三维空间自由绘制点、线、面及立体几何实体，实时解算边长、夹角、相交与投影拓扑关系。
- **3D 隐/显式函数探索器 (`FunctionExplorer`)**：支持三维显式方程与隐式曲面方程的实时高精度渲染、动态切平面推导与空间平面切片分析。
- **全息 3D 可视化计算器 (`Calculator3D`)**：结合三维矩阵、向量几何与微积分运算的可视化计算器。
- **AI 2D 题目 3D 重构引擎**：框选或上传平面几何题目图片，调用 Gemini 多模态模型解析空间拓扑，一键重构生成可旋转、拆解与度量的 3D 几何实体。
- **全息协作白板 (`WhiteboardApp`)**：支持图层叠加、3D 组件嵌入与实时绘制协作。

### 2. ⚛️ Physics Lab 高级物理仿真实验室
- **电磁学场域仿真**：
  - **法拉第电磁感应**：磁通量变化率实时解算、感应电流方向与洛伦兹/安培力空间磁感线动态渲染。
  - **霍尔效应与粒子偏转**：粒子级模拟磁场对偏转电子束的作用机制及霍尔电压生成。
- **光学与热学仿真**：光路折射/反射透镜成像及热力学分子无规则运动微观模拟。
- **力学与流体黏度试验**：流体阻力、落球法黏度系数测量与动力学曲线监测。
- **性能调度与架构**：采用 Worker 线程解算手势与物理步进，结合 `frameBudget.js` 帧预算调度，保障 60 FPS 稳定流畅渲染。

### 3. 🚀 Rocket Launch 航天动力学与飞船工坊
- **3D 飞船自定义搭建工坊 (`Design Studio`)**：模块化拼装火箭与宇宙飞船，自定义推力向量、比冲（Isp）、质心分布与气动外形。
- **深空多天体引力场 (`Space Scene`)**：模拟多天体引力、霍曼转移轨道、逃逸速度推导与轨道转移捕获。
- **大气穿梭与气动热**：模拟高空大气阻力、气动加热与热防护系统表现。

### 4. 🎱 HoloPool 3D 刚体物理碰撞实验室
- **高精度物理引擎**：基于 Cannon-es 与自定义 Kinematics 引擎，精准解算双球碰撞、库边反弹、摩擦力衰减与旋转动量传递。
- **裸眼手势控杆**：手势实时控制球杆击球视角、倾角与击球力度，实时预测碰撞运动轨迹。
- **WebSocket 实时对局**：通过 Rust 后端 (`pool_live.rs`) 实现低延迟双人在线物理对战。

### 5. 🧪 HoloChem 3D 分子观象台
- **3D 分子结构渲染**：集成 3Dmol.js，支持球棍模型、空间填充模型与原子标签自由切换。
- **PubChem + DeepSeek AI 拆解**：支持化学式 / SMILES / 名称查询；日常物品由 DeepSeek 智能拆解为分子组成并估算质量占比。
- **多组分成分交互圆环**：交互式扇区图，点击直接切换对应三维分子结构，支持 A+B 混合配比模拟。

### 6. 🌐 统一门户与后台生态
- **Portal 交互中枢**：整合控制面板 (`Dashboard`)、用户中心 (`Profile`)、独立场景导航、项目展示 (`Portfolio`) 与管理后台 (`Admin`)。

---

## 🛠️ 技术栈架构

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端 UI 框架** | `React 19` + `TypeScript 5.8` + `Vite 6` | 高性能现代化响应式前端架构 |
| **视觉样式与动效** | `Tailwind CSS v4` + `Motion (v12)` + `GSAP` | 现代 UI 视觉风格与流畅微交互动画 |
| **3D 渲染引擎** | `Three.js r184` + `@react-three/fiber` + `@react-three/drei` + `3Dmol.js` | WebGL/WebGPU 高帧率 3D 图形与分子渲染 |
| **物理与碰撞解算** | `Cannon-es` + 自研 Kinematics & Astrodynamics 引擎 | 刚体碰撞、流体阻力与航天轨道力学解算 |
| **计算机视觉 (CV)** | `Google MediaPipe Hand Landmarker` | 21 点裸眼手势识别（Web Worker 多线程解算） |
| **桌面客户端** | `Tauri v2.11` + `Rust 2021` | 跨平台原生无边框桌面客户端 (Windows / macOS) |
| **移动 & 平板** | iPad / iOS 专项响应式优化 (`HOLO_TARGET=ipad`) | 支持触摸屏与平板手势控制 |
| **后端 API & 实时服务** | `Rust (Axum + Tokio + SQLx)` (`server/`) | 提供 Gemini/DeepSeek API 代理转发、JWT 鉴权与 WebSocket 实时服务 |
| **AI 大模型集成** | `Google Gemini 3.5/Pro/Flash` + `DeepSeek V3/R1` | 多模态空间几何识别、解题重构与化学成分拆解 |

---

## 📊 代码规模与语言分布

经统计，项目包含 **405 个文本源码文件**，总代码量为 **216,998 行**：

```text
Language Breakdown:
├── JavaScript (.js)       : 253 个文件 / 162,143 行
├── TypeScript React (.tsx):  36 个文件 /  16,483 行
├── CSS (.css)             :   7 个文件 /  10,079 行
├── JSON (.json)           :  18 个文件 /   8,865 行
├── HTML (.html)           :  15 个文件 /   6,971 行
├── Rust (.rs)             :  26 个文件 /   5,649 行
├── TypeScript (.ts)       :  20 个文件 /   4,027 行
├── Markdown (.md)         :   8 个文件 /   1,245 行
├── ESM Script (.mjs)      :   9 个文件 /   1,168 行
└── SQL / TOML / JSX       :  13 个文件 /     368 行
```

---

## 📦 客户端下载

### 🪟 Windows 安装包 (x64)
- **下载链接**: [HoloGrip_0.1.1_x64-setup.exe](https://github.com/SenorPink0487/HoloGrip/releases/download/v0.1.1/HoloGrip_0.1.1_x64-setup.exe)
- **SHA-256 Checksum**:
  ```text
  fd8c6f6eb22a4fb5ac6af1581b9d425db20fe4885923c95edcd37ae4f0147b6e
  ```

### 🍎 macOS 安装包 (Apple Silicon / ARM64)
- **下载链接**: [HoloGrip_0.1.1_aarch64.dmg](https://github.com/SenorPink0487/HoloGrip/releases/download/v0.1.1/HoloGrip_0.1.1_aarch64.dmg)
- **SHA-256 Checksum**:
  ```text
  10a959760a6c32b055ee6a96701ccb0d68bff4f7b2f52a1884775282397670a7
  ```

> **macOS 摄像头权限重置说明**：若应用无法调用摄像头，请在终端执行：
> ```bash
> tccutil reset Camera com.hologrip.holomath
> ```

---

## 💻 本地开发与编译指南

### 1. 环境准备
- **Node.js**: `v18.0.0` 或更高版本
- **Rust Toolchain**: 稳定版 `cargo` (用于后端服务器与 Tauri 编译)
- **Python**: 3.x (可选)

### 2. 前端 Web 开发
```bash
# 克隆仓库
git clone https://github.com/SenorPink0487/HoloGrip.git
cd HoloGrip

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 在 .env.local 中填入 VITE_GEMINI_API_KEY 与相关配置

# 启动 Vite 开发服务 (默认端口 3000)
npm run dev
```

### 3. iPad / iOS 模式
```bash
# 启动 iPad 开发服务 (端口 3002)
npm run dev:ipad

# 构建 iPad 资产
npm run build:ipad
```

### 4. 自动化测试套件
```bash
npm run test:physics   # 物理实验室自动化测试
npm run test:rocket    # 火箭沙盒测试
npm run test:pool      # 台球碰撞测试
```

### 5. Rust 后端代理服务器
```bash
cd server
cp .env.example .env
# 配置 UPSTREAM_API_KEY 与 DATABASE_URL
cargo run
```

### 6. Tauri 桌面端构建
```bash
npm run tauri:dev     # 启动 Tauri 桌面调试
npm run tauri:build   # 打包 Desktop 原生安装包
```

---

## 📂 项目目录结构

```text
HoloGrip/
├── src/                    # 前端与应用核心代码
│   ├── apps/               # 独立子应用 (HoloMathApp, WhiteboardApp)
│   ├── components/         # React 组件 (GeometryBoard, FunctionExplorer, Calculator3D 等)
│   ├── physics/            # 物理实验室核心引擎 (电磁/光学/热学/力学/Worker)
│   ├── chem/               # HoloChem 3D 分子观象台 (3Dmol / PubChem / DeepSeek)
│   ├── pool/               # HoloPool 3D 台球物理引擎与测试
│   ├── rocket/             # 航天动力学、飞船工坊与深空轨道仿真
│   ├── stores/             # Zustand 全局状态
│   └── hooks/ & lib/       # React Hooks 与通用工具函数
├── server/                 # Rust (Axum + Tokio + SQLx) 代理后端与 WebSocket 服务
├── src-tauri/              # Tauri v2 桌面端工程与原生 Rust 绑定
├── scripts/                # 编译构建与资产生成脚本
├── index.html              # 门户首页
├── holomath.html           # HoloMath 全息数学入口
├── physics.html            # Physics Lab 入口
├── chem.html               # HoloChem 入口
├── rocket.html             # Rocket Sandbox 入口
├── pool.html               # HoloPool 入口
├── dashboard.html          # 控制面板
└── package.json            # 项目依赖与运行脚本
```

---

## 📄 许可证

本项目基于 [GPL-3.0 License](./LICENSE) 许可协议开源。
