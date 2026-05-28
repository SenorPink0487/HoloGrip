import { Component, type ReactNode } from 'react';

interface Props {
  /** 出错时回退展示，默认渲染半透明黑底 + 提示文字 */
  fallback?: ReactNode;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * 兜底 AR 渲染失败的错误边界。
 *
 * 背景：`<Environment preset="city" />` 等 drei 组件通过 `useLoader`/`Suspense`
 * 加载远端 HDRI/cubemap 资源；在中国大陆，托管这些资源的
 * `raw.githack.com` 经常被墙或慢到超时，请求 stall 后 R3F 内部抛出，
 * 没有边界的话整棵 React 树会被卸载、整个页面变白屏。
 *
 * 该边界仅在 AR 画布层包一层，AR 模块内任何异步加载失败都不会扩散到
 * 整个应用，且仍能给老师展示一段友好提示而非白屏。
 */
export class ARErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // 留个日志方便老师/同学排错；不向上传播。
    console.error('[AR] render error caught by ErrorBoundary:', error, info);
  }

  reset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-zinc-900/70 backdrop-blur-md text-white pointer-events-auto">
        <div className="text-base font-medium">AR 空间渲染遇到问题</div>
        <div className="text-xs text-zinc-300 max-w-[420px] text-center leading-relaxed">
          已自动回退，避免白屏。你可以点击下方按钮重试，或退出 AR 切回白板。
        </div>
        <button
          onClick={this.reset}
          className="mt-1 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-sm transition-colors"
        >
          重试
        </button>
      </div>
    );
  }
}
