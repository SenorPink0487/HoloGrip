import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { HoloMathApp } from './apps/HoloMathApp';
import { useARStore } from './stores/arStore';
import './index.css';

useARStore.setState({ activeTab: 'ar_3d' });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <HoloMathApp />
    </AppErrorBoundary>
  </StrictMode>,
);
