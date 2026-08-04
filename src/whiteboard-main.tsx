import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { WhiteboardApp } from './apps/WhiteboardApp';
import { useWhiteboardStore } from './stores/whiteboardStore';
import './index.css';

useWhiteboardStore.setState({ activeTab: 'whiteboard' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <WhiteboardApp />
    </AppErrorBoundary>
  </StrictMode>,
);
