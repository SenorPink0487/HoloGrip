import { useLayoutEffect, useRef } from 'react';
import { ARExperience } from '../components/ARExperience';
import { LoginModal } from '../components/desktop/LoginModal';
import { TitleBar } from '../components/desktop/TitleBar';
import { isDesktop } from '../lib/platform';

export function HoloMathApp() {
  const stageRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    document.documentElement.classList.add('dark');
    return () => document.documentElement.classList.remove('dark');
  }, []);

  return (
    <div
      className={[
        'relative w-full h-[100dvh] overflow-hidden bg-[#f4f6fa] dark:bg-[#121316] select-none text-zinc-800 dark:text-white flex flex-col',
        isDesktop ? 'rounded-xl' : '',
      ].join(' ')}
    >
      {isDesktop && <TitleBar activeTab="ar_3d" onNavigate={() => window.location.assign('whiteboard.html')} />}
      <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden">
        <ARExperience stageRef={stageRef} />
        <LoginModal />
      </div>
    </div>
  );
}
