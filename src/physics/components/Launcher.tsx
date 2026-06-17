import React, { useRef, useEffect } from 'react';
import { Magnet, Zap, Activity, ArrowRight, ArrowLeft } from 'lucide-react';
import './Launcher.css';

interface LauncherProps {
  onSelectProject: (projectId: 'magnet' | 'faraday') => void;
}

export const Launcher: React.FC<LauncherProps> = ({ onSelectProject }) => {
  const cardsRef = useRef<(HTMLDivElement | null)[]>([]);

  // Add mouse tracking for the premium glowing hover effect
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cardsRef.current.forEach(card => {
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        card.style.setProperty('--mouse-x', `${x}px`);
        card.style.setProperty('--mouse-y', `${y}px`);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div className="launcher-container">
      <button 
        className="back-to-launcher-btn" 
        onClick={() => window.location.href = '/portfolio.html'}
      >
        <ArrowLeft size={20} />
        返回
      </button>

      <div className="launcher-background"></div>
      
      <div className="launcher-content">
        <header className="launcher-header">
          <h1>HoloPhysics</h1>
          <p>Next Generation Virtual Laboratory</p>
        </header>

        <div className="projects-grid">
          {/* 磁场可视化项目 */}
          <div 
            className="project-card magnet" 
            ref={el => { cardsRef.current[0] = el; }}
            onClick={() => onSelectProject('magnet')}
          >
            <div className="project-icon-wrapper">
              <Magnet size={36} className="project-icon" strokeWidth={1.5} />
            </div>
            <div className="project-info">
              <h2>磁场可视化</h2>
              <p>在极致的 3D 空间中探索多磁体相互作用下的磁场分布、实时磁感线追踪以及铁屑排布矩阵。</p>
            </div>
            <div className="project-action">
              <span className="status-badge">Simulation</span>
              <div className="arrow-btn"><ArrowRight size={20} /></div>
            </div>
          </div>

          {/* 法拉第电磁感应实验 */}
          <div 
            className="project-card faraday" 
            ref={el => { cardsRef.current[1] = el; }}
            onClick={() => onSelectProject('faraday')}
          >
            <div className="project-icon-wrapper">
              <Zap size={36} className="project-icon" strokeWidth={1.5} />
            </div>
            <div className="project-info">
              <h2>法拉第电磁感应</h2>
              <p>深度互动实验，探索时变磁场如何激发电场与感应电动势。实时反馈线圈与磁铁运动的多物理场耦合。</p>
            </div>
            <div className="project-action">
              <span className="status-badge">Experiment</span>
              <div className="arrow-btn"><ArrowRight size={20} /></div>
            </div>
          </div>

          {/* 霍尔效应仿真 */}
          <div 
            className="project-card hall" 
            ref={el => { cardsRef.current[2] = el; }}
            onClick={() => { window.location.href = '/hall.html'; }}
          >
            <div className="project-icon-wrapper">
              <Activity size={36} className="project-icon" strokeWidth={1.5} />
            </div>
            <div className="project-info">
              <h2>霍尔效应分析</h2>
              <p>高精度宏观仿真环境。测量标定磁场与工作电流的关系，通过交互图表推导材料载流子浓度与霍尔系数。</p>
            </div>
            <div className="project-action">
              <span className="status-badge">Lab Report</span>
              <div className="arrow-btn"><ArrowRight size={20} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
