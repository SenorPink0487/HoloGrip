<div align="center">
  <h1>HoloGrip 👐 免穿戴式 AR 空间计算与全息教辅平台</h1>
  <p><b>融合 AI 与空间计算，打破物理界限的新一代沉浸式教育与三维仿真平台</b></p>
  <p>
    <img src="https://img.shields.io/badge/React-19.0-61DAFB?logo=react" alt="React 19" />
    <img src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Three.js-r184-000000?logo=three.js" alt="Three.js" />
    <img src="https://img.shields.io/badge/Tauri-v2.11-FFC131?logo=tauri" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/Rust-2021-000000?logo=rust" alt="Rust" />
    <img src="https://img.shields.io/badge/AI-Gemini_3.5_/_Pro-4285F4?logo=google" alt="Google Gemini" />
    <img src="https://img.shields.io/badge/Codebase-117k+_LOC-brightgreen" alt="117k+ Lines of Code" />
    <img src="https://img.shields.io/badge/License-GPL--3.0-blue.svg" alt="GPL-3.0 License" />
  </p>
</div>

---

## 🌟 项目简介

**HoloGrip** 是一款前沿的**免穿戴式 AR（增强现实）空间计算与全息教辅平台**。打破传统硬件对昂贵 VR/AR 头显的依赖，HoloGrip 仅需标准网络摄像头，即可基于 **MediaPipe 21 点手势追踪** 与 **Three.js 高性能 3D 渲染**，实现自然流畅的裸眼手势空间交互。

经过重大架构升级与多模块拓展，本项目已成长为代码规模超 **117,000+ 行** 的综合性全息教育与科学仿真系统。系统不仅涵盖数学立体几何与函数分析，还扩展到了**高级物理实验室**、**火箭航天动力学工坊**与**高精度 3D 物理碰撞实验室**，并深度集成了 **Google Gemini 多模态大模型** 与独立 **Rust 安全中转后端**。

---

## 🚀 核心功能模块

### 1. 📐 HoloMath 3D 几何与数学工具箱
- **全息几何黑板 (GeometryBoard & MathModel)**：支持在三维空间中自由绘制点、线、面及复杂多面体/旋转体，实时解算边长、角度与空间关系。
- **3D 隐/显式函数探索器 (FunctionExplorer)**：输入复杂三维数学方程，自动生成高精度动态渲染曲面，支持空间切平面推导与图像切片分析。
- **全息 3D 计算器 (Calculator3D)**：三维矩阵、向量几何与微积分运算的可视化交互计算器。
- **Gemini 多模态 2D 题目 3D 重构**：框选或上传 2D 几何题目截图，调用 Gemini 3.5 多模态模型解析空间拓扑关系，一键重构生成可旋转、拆解的 3D 几何实体模型。

### 2. ⚛️ Physics Lab 高级物理仿真实验室
- **电磁学仿真**：
  - **法拉第电磁感应**：实时解算磁通量变化率，动态可视化感应电流方向、安培力及空间磁感线。
  - **霍尔效应与洛伦兹力**：粒子级演示磁场对偏转电子的洛伦兹力作用及霍尔电压形成机制。
- **光学与热学模块**：光路折射/反射透镜仿真及热力学微观分子运动模拟。
- **力学与流体黏度实验 (Viscosity & Mechanics)**：流体力学阻力与黏度系数动态测试。
- **全息数据屏与公式板 (HoloScreen & FormulaBoard)**：内置高帧率数据图表与仪表盘，支持实验物理量的实时量化监测。
- **异步性能优化**：手势追踪基于 Web Worker 双线程解算，结合 `frameBudget.js` 帧预算调度引擎，保障 60 FPS 稳定渲染。

### 3. 🚀 Rocket Launch 航天动力学与飞船工坊
- **飞船自定义设计工坊 (Design Studio & Craft Mesh)**：模块化搭建火箭与飞船，自由调整质量分布、推进器推力向量与气动外形。
- **星际深空与轨道力学 (Space Scene)**：多天体引力场模拟、轨道转移（霍曼转移轨道）与逃逸速度推导。
- **气动力学与气动热测试**：在大气层穿梭与气动阻力、比冲（Isp）及热防护模拟中检验飞船设计。

### 4. 🎱 HoloPool 3D 物理碰撞实验室
- **高精度刚体物理**：基于 Cannon-es 与自定义物理引擎，精准模拟双球碰撞、库边反弹、摩擦力衰减与旋转动量传导。
- **裸眼手势控杆**：手势控制球杆击球角度与击球力度，实时预测击球碰撞轨迹。

### 5. 🧪 HoloChem 原子观象台
- **3D 分子结构**：基于 3Dmol.js 渲染球棍/空间填充等模型，支持旋转、缩放与原子标签。
- **PubChem + AI 拆解**：化学式 / SMILES / 中英文名直查；日常物品由 DeepSeek 拆为可检索纯分子并估算占比。
- **成分圆环**：多组分产品可点击扇区切换对应分子结构；支持 A+B 质量比混合。

### 6. 🌐 统一门户与多端响应式体验
- **Portal 交互中枢**：包含控制面板 (Dashboard)、物理/化学/火箭/台球独立场景导航、管理后台 (Admin)、个人中心 (Profile) 与项目展示 (Portfolio)。

---

## 🛠️ 技术栈架构

| 层级 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端框架** | `React 19` + `TypeScript 5.8` + `Vite 6` | 现代化响应式前端 UI 架构 |
| **样式与动画** | `Tailwind CSS v4` + `Motion` + `GSAP` | 现代视觉风格与细腻微交互动画 |
| **3D 渲染** | `Three.js r184` + `@react-three/fiber` | 高性能 WebGL/WebGPU 3D 图形渲染 |
| **物理引擎** | `Cannon-es` + 自研 Kinematics/Astrodynamics | 刚体碰撞、流体与航天轨道力学解算 |
| **计算机视觉** | `Google MediaPipe Hand Landmarker` | 21 点无标记裸眼手势识别（Worker 线程） |
| **桌面客户端** | `Tauri v2.11` + `Rust` | 跨平台无边框原生桌面端 (Win/macOS) |
| **移动/平板** | iOS / iPad 专项优化 (`HOLO_TARGET=ipad`) | 支持 iPad 触摸与移动端手势体验 |
| **后端 API 服务** | `Rust (Axum / Tokio)` (`server/`) | 提供安全 Gemini API 转发、JWT 鉴权与 DB 迁移 |
| **AI 大模型** | `Google Gemini 3.5 / Pro / Flash` | 多模态空间几何识别与智能解题重构 |

---

## 📊 代码规模与工程质量

根据 `scripts/count_loc.py` 代码统计数据：

- **总文件数**：275 个文件（其中源码文件 255+ 个）
- **总代码行数**：**117,932 行**（有效代码 **107,868 行**）
- **语言分布**：
  - JavaScript (`.js`): 158 个文件 / 76,171 行
  - TypeScript React (`.tsx`): 34 个文件 / 15,048 行
  - CSS (`.css`): 7 个文件 / 9,179 行
  - Rust (`.rs`): 20 个文件 / 4,514 行
  - TypeScript (`.ts`): 19 个文件 / 4,171 行
  - Python (`.py`): 4 个文件 / 1,639 行
- **自动化测试**：内置 Physics、Rocket、Pool 三大物理核心模块的自动化测试套件 (`node --test`)。

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

> **macOS 摄像头权限重置说明**：若遇到摄像头权限无法正常调起，可在终端执行：
> ```bash
> tccutil reset Camera com.hologrip.holomath
> ```

---

## 💻 本地运行与开发指南

### 1. 前置环境要求
- **Node.js**: `v18.0.0` 或更高版本
- **Rust Toolchain**: 最新稳定版 (用于编译 Server 代理或 Tauri 桌面端)
- **Python**: 3.x (可选，用于运行 `scripts/` 工具链)

### 2. 前端 Web 服务启动
```bash
# 1. 克隆项目仓库
git clone https://github.com/SenorPink0487/HoloGrip.git
cd HoloGrip

# 2. 安装项目依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 在 .env.local 中填入 VITE_GEMINI_API_KEY

# 4. 启动 Vite 开发服务器 (默认端口 3000)
npm run dev
```

### 3. iPad / iOS 模式编译与调试
```bash
# 启动 iPad 模式专属 Web 开发服务 (端口 3002)
npm run dev:ipad

# 构建 iPad 资产并自动同步
npm run build:ipad
```

### 4. 自动化测试套件运行
```bash
# 运行物理实验室测试
npm run test:physics

# 运行火箭沙盒测试
npm run test:rocket

# 运行台球碰撞测试
npm run test:pool
```

### 5. Rust 独立后端服务 (Server)
```bash
cd server
cp .env.example .env
# 配置 UPSTREAM_API_KEY 与数据库连接
cargo run
```

### 6. Tauri 桌面端开发与编译
```bash
# 启动 Tauri 桌面调试开发环境
npm run tauri:dev

# 打包 Native 桌面安装程序
npm run tauri:build
```

---

## 📂 项目目录结构概览

```text
HoloGrip/
├── src/                    # Web 与应用核心源码
│   ├── components/         # React UI 组件 (GeometryBoard, Calculator3D, FunctionExplorer 等)
│   ├── physics/            # 物理实验室核心引擎 (电磁、光学、热学、力学、Worker)
│   ├── chem/               # HoloChem 分子观象台 (3Dmol / PubChem / DeepSeek)
│   ├── pool/               # HoloPool 3D 台球物理碰撞引擎与测试
│   ├── rocket/             # 航天动力学、飞船工坊与深空轨道仿真
│   ├── hooks/ & lib/       # 通用 React Hooks 与工具库
│   └── store.ts            # Zustand 全局状态管理
├── server/                 # Rust (Axum/Tokio) 独立安全代理后端
├── src-tauri/              # Tauri v2 桌面客户端配置与 Rust 原生绑定
├── scripts/                # 架构生成、代码行统计与资产构建工具链
├── index.html              # HoloGrip 门户首页
├── holomath.html           # HoloMath 全息数学入口
├── physics.html            # 高级物理实验室入口
├── chem.html               # HoloChem 原子观象台入口
├── rocket.html             # 火箭沙盒入口
├── pool.html               # HoloPool 台球实验室入口
├── dashboard.html          # 平台控制面板
└── package.json            # 项目依赖与运行脚本
```

---

## 📄 许可证

本项目采用 [GPL-3.0 License](./LICENSE) 开源许可证。欢迎提交 Issue 与 Pull Request！
