/**
 * 平台运行时检测。
 *
 * 单一真相源:页面在 Tauri 容器(桌面)还是普通浏览器(web)中运行。
 * - 桌面端:`window.__TAURI_INTERNALS__` 由 Tauri 的 webview 注入,布尔为真
 * - Web 端:全部分支永远为 false,Tree-shaking 后桌面专属代码不会进入 web bundle
 *
 * 使用约定:
 * - 仅在组件函数体里 / 事件处理里读取 `isDesktop`,避免顶层 import 时副作用
 * - 凡涉及 `@tauri-apps/api/*` 的模块,放进只在 `isDesktop=true` 时挂载的组件里
 */
export const isDesktop =
  typeof window !== 'undefined' &&
  // Tauri 2.x 注入的内部对象
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !!(window as any).__TAURI_INTERNALS__;
