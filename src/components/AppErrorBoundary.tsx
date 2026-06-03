import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  info?: string;
}

/**
 * 顶层错误边界。
 *
 * 没有它的话:任何渲染期 / 生命周期内的同步抛出,React 都会卸载整棵树并把 root
 * 留成空 div,浏览器表现为"几秒后突然白屏"。线上排错时缺少日志会很被动。
 *
 * 这里只做最小事情:把错误兜住,渲染一份带 “复制错误信息” 按钮的兜底面板,
 * 同时把详情打到 console。任何在子组件内主动加的二级 ErrorBoundary
 * (例如 ARErrorBoundary)依然优先生效,这一层只接没人接的漏。
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // 把 React 提供的组件栈一并保存,方便用户截图反馈。
    console.error('[App] uncaught render error:', error);
    if (info?.componentStack) {
      console.error('[App] component stack:\n' + info.componentStack);
    }
    this.setState({ info: info?.componentStack ?? '' });
  }

  reset = () => this.setState({ hasError: false, error: undefined, info: undefined });

  copy = async () => {
    const text = [
      'HoloMath 渲染异常',
      'UA: ' + (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      'Time: ' + new Date().toISOString(),
      'Error: ' + (this.state.error?.message ?? ''),
      'Stack: ' + (this.state.error?.stack ?? ''),
      'Components: ' + (this.state.info ?? ''),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 退路:把文本塞进 textarea 让用户手动复制
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message ?? '未知错误';
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0b0d', color: '#e4e4e7', fontFamily: 'system-ui,sans-serif',
        padding: 24,
      }}>
        <div style={{ maxWidth: 560, width: '100%' }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            页面渲染异常
          </div>
          <div style={{ fontSize: 13, color: '#a1a1aa', marginBottom: 16, lineHeight: 1.6 }}>
            HoloMath 在运行中遇到一个未捕获的错误,已自动停止渲染避免完全白屏。
            可以尝试重新加载;若反复出现,请把下面的错误信息发给开发者。
          </div>
          <pre style={{
            fontSize: 12, lineHeight: 1.5, padding: 12,
            background: '#18181b', border: '1px solid #27272a', borderRadius: 8,
            color: '#fca5a5', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 220, overflow: 'auto',
          }}>{msg}</pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={this.copy}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                background: '#27272a', color: '#e4e4e7', border: '1px solid #3f3f46',
                cursor: 'pointer',
              }}
            >复制错误信息</button>
            <button
              onClick={() => location.reload()}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                background: '#0891b2', color: '#fff', border: '1px solid #0e7490',
                cursor: 'pointer',
              }}
            >重新加载</button>
            <button
              onClick={this.reset}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                background: 'transparent', color: '#a1a1aa', border: '1px solid #3f3f46',
                cursor: 'pointer',
              }}
            >仅关闭提示</button>
          </div>
        </div>
      </div>
    );
  }
}
