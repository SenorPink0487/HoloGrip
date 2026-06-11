<div align="center">
  <h1>HoloGrip 👐 免穿戴式 AR 教辅平台</h1>
  <p><b>融合 AI 与空间计算，打破物理界限的新一代沉浸式教育体验</b></p>
</div>

## 🌟 项目简介

**HoloGrip** 是一款前沿的**免穿戴式 AR（增强现实）教辅平台**。与传统的需要昂贵 VR/AR 头显的平台不同，HoloGrip 仅需依赖普通的电脑摄像头，通过引入先进的 **MediaPipe 手势追踪技术** 与 **3D 引擎渲染**，让用户通过自然手势即可在三维空间中与虚拟物体进行交互。

本项目不仅旨在通过直观的三维可视化手段降低理工科学习的认知门槛，更深度集成了 **Google Gemini大模型**，提供实时的实验指导和原理解析。无论是抽象的数学几何，还是复杂的物理电磁学，HoloGrip 都能将书本上的知识变为触手可及的交互体验。

---

## 🚀 核心功能模块

### 1. ⚛️ 高级物理仿真实验室
HoloGrip 将经典而难以直接观察的物理现象具象化。
- **法拉第电磁感应实验**：通过手势拖拽磁铁穿过线圈，实时计算磁通量变化，并可视化生成的感应电流、安培力和空间磁感线。
- **霍尔效应实验**：支持调节磁场强度与电流方向，粒子级演示洛伦兹力如何驱动电子偏转，直观展现霍尔电压的产生过程。
- **动态数据大屏**：内置动态折线图与仪表盘，实时输出安培力、磁通量等物理量，实现实验结果的可量化观察。

### 2. 📐 3D 几何与数学工具箱
- **全息几何黑板**：在 3D 空间中自由绘制点、线、面，生成立体几何模型（如多面体、旋转体）。
- **空间量角器与直尺**：支持通过手势在 3D 坐标系内抓取工具，实时测量夹角与距离。
- **交互式函数计算器**：输入复杂的三维函数，即可在眼前生成动态渲染的曲面图像。

### 3. 🤖 AI 智能助教 (Gemini 驱动)
- 集成了 Google 的大语言模型。在遇到卡壳或疑惑时，智能助教可即时提供：
  - 实验原理的推导说明。
  - 数学公式的详细计算步骤。
  - 实验操作的纠错与纠偏提示。

### 4. ✋ 裸眼手势与空间交互
- 无需手柄或头显，基于 **MediaPipe** 获取 21 个手部关键点。
- 支持抓取、捏合缩放、手势旋转等符合物理直觉的自然交互方案。

---

## 🛠️ 技术栈架构

HoloGrip 采用现代化的 Web 和客户端技术，确保极致的性能与多端兼容。

- **前端架构**：`React 18` + `TypeScript` + `Vite`。
- **3D 渲染层**：基于 `Three.js` 与 `@react-three/fiber`，结合自定义 Shader 提供极佳的视觉表现。
- **计算机视觉**：`Google MediaPipe Hand Landmarker`。
- **桌面端封装**：基于 `Tauri` + `Rust`，打包轻量级、跨平台的原生桌面客户端。
- **后端反向代理/服务**：独立的 Rust 服务端，提供安全的 Gemini API 请求转发与验证。
- **大语言模型**：`Google Gemini Pro / Flash` API。

---

## 💻 本地运行与开发指南

## 🍎 macOS 安装包

当前仓库已提供 Apple Silicon / M 系列 Mac 安装包：

- [HoloGrip_0.1.1_aarch64.dmg](./releases/macos/HoloGrip_0.1.1_aarch64.dmg)

SHA-256:

```text
10a959760a6c32b055ee6a96701ccb0d68bff4f7b2f52a1884775282397670a7
```

### 安装步骤

1. 下载 `HoloGrip_0.1.1_aarch64.dmg`。
2. 双击打开 DMG。
3. 将 `HoloGrip.app` 拖入 `Applications` 文件夹。
4. 从 `Applications` 启动 HoloGrip。
5. 首次进入 AR / 手势识别模块时，允许 macOS 的摄像头权限请求。

### 摄像头权限

HoloGrip 依赖摄像头进行 MediaPipe 手势识别。macOS 版本已包含：

- `NSCameraUsageDescription`
- `com.apple.security.device.camera`

如果安装旧版本后摄像头权限状态异常，可以在终端执行：

```bash
tccutil reset Camera com.hologrip.holomath
```

然后重新打开 HoloGrip，并在进入 AR 模块时允许摄像头权限。

### 安全提示

当前 DMG 使用 ad-hoc 签名，尚未接入 Apple Developer ID 签名与 notarization 公证。若 macOS 提示“无法验证开发者”，可在 Finder 中右键点击 `HoloGrip.app`，选择“打开”，再按系统提示确认。正式公开分发建议后续接入 Developer ID 签名和公证。

### 前置条件
- **Node.js**: v18 及以上版本 (推荐使用 LTS)。
- **Rust**: 最新版本 (用于编译后端代理或 Tauri 客户端)。
- **摄像头**: 一台可正常工作的网络摄像头。

### 1. Web 端开发与调试

这是最快捷的体验方式。
```bash
# 1. 克隆代码仓库并进入目录
git clone https://github.com/SenorPink0487/HoloGrip.git
cd HoloGrip

# 2. 安装前端依赖
npm install

# 3. 配置环境变量
# 复制示例文件并重命名为 .env.local
cp .env.example .env.local
# 在 .env.local 中填入你的 VITE_GEMINI_API_KEY

# 4. 启动 Vite 开发服务器
npm run dev
```

### 2. Rust 独立服务端 (安全反代模式)

若不想在前端暴露 API Key，可启动配套的 Rust 服务端进行请求中转：
```bash
cd server
cp .env.example .env
# 在 server/.env 中配置 UPSTREAM_API_KEY
cargo run
```

### 3. Tauri 桌面客户端编译

提供更深度的系统集成（无边框窗口、原生 API 调用）：
```bash
# 确保在根目录下
npm install
npm run tauri dev
```
*(编译 Tauri 可能需要配置相应的 C++ 开发工具链及 Windows SDK，请参阅 [Tauri 官方文档](https://tauri.app/v1/guides/getting-started/prerequisites))。*

---

## 📄 许可证
本项目采用 [GPL-3.0 License](./LICENSE) 授权。欢迎开发者提交 Pull Request 共建这个次世代教育平台！
