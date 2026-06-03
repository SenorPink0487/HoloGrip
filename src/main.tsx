import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {AppErrorBoundary} from './components/AppErrorBoundary';
import './index.css';

// 把全局错误显式打到 console,部署后用户截图反馈时能拿到第一手信息。
// 不调 preventDefault,所以默认行为(在控制台显示堆栈)依旧正常。
if (typeof window !== 'undefined') {
  window.addEventListener('error', (e) => {
    console.error('[global error]', e.error || e.message, e);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled promise rejection]', e.reason);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
