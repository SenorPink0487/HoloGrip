# HoloGrip iPad 版本打包规范

本文件是后续所有 iPad 版本的固定打包、安装和验收规则。除非产品需求明确变更，否则不得回退。

## 产品范围

- iPad 独立 App 启动后直接进入白板。
- 仅保留白板、数学、物理、化学四个板块。
- 白板必须使用原版 `AppleDock`，不得复制、重绘或替换 Dock 的布局、图标和交互。
- 账户页必须可以在未登录状态打开；登录失败只能显示页面内提示，不得阻断页面进入。
- 实验室返回白板按钮固定在左上角。
- 账户页不额外添加返回白板按钮。
- 实验室不得显示“准星焦点/空置区域/无法交互”悬浮卡片。

## iPad 交互

- 实验室不使用移动摇杆。
- 单指滑动控制镜头转向。
- 双指距离增大：前进。
- 双指距离减小：后退。
- 任意手指松开后立即停止移动。
- AR 模式的手势交互优先；普通双指移动不能抢占 AR 输入。
- 所有触控区域必须考虑安全区和横竖屏尺寸，不得依赖鼠标 hover。

## 画质与性能

- 默认目标为稳定 30 FPS，不以 60 FPS 为硬性验收条件。
- iPad 默认保持清晰画质：DPR 1.5、抗锯齿开启、阴影 1024；只有持续严重超预算时才允许动态降级。
- 优先使用 Worker 分担物理和实验计算，启用双计算 Worker 槽位。
- WebGL 使用 `powerPreference: 'high-performance'`。
- 不得通过永久降低 DPR、关闭抗锯齿或删除阴影来掩盖主线程阻塞问题。
- 性能诊断数据不得以悬浮卡片遮挡实验画面；需要展示时必须提供可关闭的诊断面板。
- CPU/GPU 系统级占用率若无法由 WebView 直接取得，必须明确标注为估算值，不得伪装成系统真实百分比。

## 网络与独立运行

- iPad 生产包 API 固定使用 `https://hologrip.cn` 反代。
- 生产包内不得出现 `localhost:3002`、开发服务器地址或临时测试接口。
- App 必须在没有本地 Vite/Node 服务时启动白板和实验室页面。
- 账户、同步和实验数据请求失败时，页面仍可进入并给出离线/错误提示。

## 标准构建命令

```bash
npm run lint
npm run build:ipad
npx tauri ios build --ci --export-method debugging
```

产物位置：

```text
src-tauri/gen/apple/build/arm64/HoloGrip.ipa
src-tauri/gen/apple/build/app_iOS.xcarchive/Products/Applications/HoloGrip.app
```

## 设备安装与验收

目标设备：iPad 11，UDID 以当前 Xcode/`devicectl` 识别结果为准。

```bash
xcrun devicectl device install app \
  --device <UDID> \
  src-tauri/gen/apple/build/app_iOS.xcarchive/Products/Applications/HoloGrip.app

xcrun devicectl device process launch \
  --device <UDID> \
  com.hologrip.app
```

每次交付前必须人工确认：

1. App 可脱离本地开发服务启动并进入白板。
2. 原版 AppleDock 的功能和交互完整可用。
3. 点击账户可以进入账户页，未登录不被锁屏拦截。
4. 物理、化学页面没有摇杆，单指镜头和双指前进/后退可用。
5. 实验室返回按钮在左上角，账户页没有额外返回按钮。
6. 画面没有准星焦点悬浮卡片，性能诊断不遮挡主画面。
7. 物理/化学实验室连续运行 30 FPS 目标下画面清晰，无明显卡顿。
8. 生产 API 请求指向 `https://hologrip.cn`。

## 禁止事项

- 不得把桌面预览地址、localhost 或开发模式作为 iPad 交付包。
- 不得修改原版 AppleDock 来适配 iPad。
- 不得重新引入移动摇杆。
- 不得重新引入顶部/中上方准星焦点卡片。
- 不得为了追求表面 FPS 永久牺牲画质，必须先排查主线程、Worker、GPU 提交和资源加载问题。
