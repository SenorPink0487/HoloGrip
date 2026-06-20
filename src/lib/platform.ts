/**
 * 平台运行时检测。
 *
 * 单一真相源:页面运行在哪类壳层里。
 * - Tauri 运行时:`window.__TAURI_INTERNALS__` 由 Tauri 的 webview 注入
 * - iPadOS 版同样会注入 Tauri internals,所以不能把它直接等同于桌面端
 *
 * 使用约定:
 * - 仅在组件函数体里 / 事件处理里读取 `isDesktop`,避免顶层 import 时副作用
 * - 凡涉及 `@tauri-apps/api/*` 的模块,放进只在 `isDesktop=true` 时挂载的组件里
 */
export const isTauriRuntime =
  typeof window !== 'undefined' &&
  // Tauri 2.x 注入的内部对象
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  !!(window as any).__TAURI_INTERNALS__;

const isAppleTouchDevice =
  typeof navigator !== 'undefined' &&
  (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

export const isIPadOS =
  isAppleTouchDevice &&
  typeof window !== 'undefined' &&
  Math.min(window.screen.width, window.screen.height) >= 768;

export const isDesktop = isTauriRuntime && !isAppleTouchDevice;
