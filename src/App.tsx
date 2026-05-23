import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { initHandLandmarker } from './lib/mediapipe';
import { handTracker, type RawHandObservation } from './lib/handTracking';
import { useARStore } from './store';
import { OverlayUI } from './components/OverlayUI';
import { MathModel } from './components/MathModel';
import { Canvas2D } from './components/Canvas2D';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { Trash2, ZoomIn, ZoomOut, LogOut } from 'lucide-react';

// New Apple Aesthetic tab components
import { AppleDock } from './components/AppleDock';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { GeometryBoard } from './components/GeometryBoard';
import { FunctionExplorer } from './components/FunctionExplorer';
import { ToolboxPanel } from './components/ToolboxPanel';
import { FloatingWindow } from './components/FloatingWindow';
import { Calculator3D } from './components/Calculator3D';

// Import Ruler/Compass/Protractor/TriangleRuler for global whiteboard layer
import { Ruler } from './components/tools/Ruler';
import { TriangleRuler } from './components/tools/TriangleRuler';
import { Protractor } from './components/tools/Protractor';
import { Compass } from './components/tools/Compass';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(undefined);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const activeTab = useARStore(state => state.activeTab);
  const updateHands = useARStore(state => state.updateHands);
  const setLoaderVisible = useARStore(state => state.setLoaderVisible);
  const theme = useARStore(state => state.theme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    // AR 空间始终为暗色模式，不受全局主题切换的影响
    if (activeTab === 'ar_3d') {
      root.classList.add('dark');
      return;
    }

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme, activeTab]);

  // Zustand states for floating windows and tools
  const isToolboxOpen = useARStore(state => state.isToolboxOpen);
  const setToolboxOpen = useARStore(state => state.setToolboxOpen);

  const showRuler = useARStore(state => state.showRuler);
  const showTriangleRuler = useARStore(state => state.showTriangleRuler);
  const showProtractor = useARStore(state => state.showProtractor);
  const showCompass = useARStore(state => state.showCompass);

  const penColor = useARStore(state => state.penColor);
  const penThickness = useARStore(state => state.penThickness);

  // 1. 沿边画直线的回调 (由 Ruler 和 TriangleRuler 触发)
  const drawLineOnWhiteboard = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  };

  // 2. 印刻角度或圆弧的回调 (由 Protractor 和 Compass 触发)
  const drawArcOnWhiteboard = (
    center: { x: number; y: number },
    radius: number,
    startAngle: number,
    endAngle: number
  ) => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, startAngle, endAngle, startAngle > endAngle);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };

  // For synthetic clicks
  const prevPinch1 = useRef(false);
  const prevPinch2 = useRef(false);

  useEffect(() => {
    if (activeTab !== 'ar_3d') {
      // Clear hands state when leaving AR mode
      handTracker.reset();
      updateHands(
        { isVisible: false, isPinched: false, pinchDistance: 1 },
        { isVisible: false, isPinched: false, pinchDistance: 1 }
      );
      return;
    }

    let active = true;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", () => {
            initVision();
          });
        }
      } catch (err) {
        console.error("Camera access denied or failed", err);
        alert("Camera access is required for the AR experience.");
      }
    }

    async function initVision() {
      const landmarker = await initHandLandmarker();
      handLandmarkerRef.current = landmarker;
      
      if (active) {
        setLoaderVisible(false);
        detectContinuously();
      }
    }

    let lastVideoTime = -1;
    function detectContinuously() {
      if (!videoRef.current || !handLandmarkerRef.current) return;

      const video = videoRef.current;
      const startTimeMs = performance.now();
      
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
        const nowMs = startTimeMs;

        // ─── 把 MediaPipe 原始检测打包成 RawHandObservation ───
        // tracker 需要 NDC、像素坐标、捏合状态、handedness、置信度
        const observations: RawHandObservation[] = [];
        if (results.landmarks && results.landmarks.length > 0) {
          for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            if (!landmarks) continue;
            const indexF = landmarks[8];
            const thumb = landmarks[4];
            if (!indexF || !thumb) continue;

            // 镜像 selfie：x 取反
            const videoX = 1.0 - ((indexF.x + thumb.x) / 2);
            const videoY = (indexF.y + thumb.y) / 2;

            const videoAspect = 1280 / 720;
            const screenAspect = window.innerWidth / window.innerHeight;
            let renderWidth = window.innerWidth;
            let renderHeight = window.innerHeight;
            let offsetX = 0;
            let offsetY = 0;
            if (screenAspect > videoAspect) {
              renderHeight = window.innerWidth / videoAspect;
              offsetY = (renderHeight - window.innerHeight) / 2;
            } else {
              renderWidth = window.innerHeight * videoAspect;
              offsetX = (renderWidth - window.innerWidth) / 2;
            }
            const pixelX = videoX * renderWidth - offsetX;
            const pixelY = videoY * renderHeight - offsetY;
            const ndcX = (pixelX / window.innerWidth) * 2 - 1;
            const ndcY = -(pixelY / window.innerHeight) * 2 + 1;

            const dx = indexF.x - thumb.x;
            const dy = indexF.y - thumb.y;
            const dz = indexF.z - thumb.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            // handedness 与置信度
            const hCat = results.handednesses && results.handednesses[i] && results.handednesses[i][0];
            const rawHandedness =
              hCat?.categoryName === 'Left' ? 'Left'
              : hCat?.categoryName === 'Right' ? 'Right'
              : undefined;
            const confidence = hCat?.score ?? 0.5;

            observations.push({
              ndcX,
              ndcY,
              pixelX,
              pixelY,
              isPinched: distance < 0.05,
              pinchDistance: distance,
              rawHandedness,
              confidence,
            });
          }
        }

        // ─── 喂给 HandTracker，得到稳定的主用户左/右手快照 ───
        const { left, right } = handTracker.update(observations, nowMs);

        const leftNode = {
          isVisible: left.isVisible,
          isPinched: left.isPinched,
          pinchDistance: left.pinchDistance,
          cursor: { x: left.ndcX, y: left.ndcY },
          pixelCursor: { x: left.pixelX, y: left.pixelY },
        };
        const rightNode = {
          isVisible: right.isVisible,
          isPinched: right.isPinched,
          pinchDistance: right.pinchDistance,
          cursor: { x: right.ndcX, y: right.ndcY },
          pixelCursor: { x: right.pixelX, y: right.pixelY },
        };

        // store.updateHands 内部用 Vector2.copy({x,y}) 处理 cursor,
        // 类型上兼容,但需要 ts-expect-error 跳过严格检查
        // @ts-expect-error - cursor 是 {x,y} 字面量,store 用 Vector2.copy 处理
        updateHands(leftNode, rightNode);

        // ─── 合成点击：仅在"真实可见(非 coast)"时触发，避免 coast 误触发点击 ───
        // 交互分工：左手 = 控制手（点击 UI / 缩放模型），右手 = 写字手 / 连线手。
        // 左手始终可"捏合即点击"。
        // 右手仅在画笔与连线均未激活时可"捏合即点击"，避免写字 / 连线时
        // 误触下层按钮。
        const arState = useARStore.getState();
        const rightHandCanClick = !arState.isPenActive && !arState.isLineDrawingActive;

        const triggerSyntheticClick = (x: number, y: number) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return;
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          });
          el.dispatchEvent(event);
          if (el.tagName.toLowerCase() === 'button') {
            const htmlEl = el as HTMLElement;
            htmlEl.style.transform = 'scale(0.9)';
            setTimeout(() => (htmlEl.style.transform = ''), 150);
          }
        };

        // 关键：coast 期间(预测位置)绝不触发新点击，否则用户没动模型还会点击
        const leftCanClick = left.isVisible && !left.isCoasting;
        const rightCanClick = right.isVisible && !right.isCoasting;

        if (leftCanClick && leftNode.isPinched && !prevPinch2.current) {
          triggerSyntheticClick(leftNode.pixelCursor.x, leftNode.pixelCursor.y);
        }
        if (
          rightHandCanClick &&
          rightCanClick &&
          rightNode.isPinched &&
          !prevPinch1.current
        ) {
          triggerSyntheticClick(rightNode.pixelCursor.x, rightNode.pixelCursor.y);
        }

        prevPinch1.current = rightNode.isPinched;
        prevPinch2.current = leftNode.isPinched;
      }

      requestRef.current = requestAnimationFrame(detectContinuously);
    }

    setupCamera();

    return () => {
      active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      // 清理 tracker 状态
      handTracker.reset();
    };
  }, [updateHands, setLoaderVisible, activeTab]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#f4f6fa] dark:bg-[#121316] select-none text-zinc-800 dark:text-white transition-colors duration-500">
      {/* 1. 微点底纹背景 (用于白板等 2D 教学模块，不包括函数探究) */}
      {activeTab !== 'ar_3d' && activeTab !== 'function' && (
        <div 
          className="absolute inset-0 pointer-events-none opacity-20 transition-all duration-500" 
          style={{ 
            backgroundImage: theme === 'dark' 
              ? 'radial-gradient(circle, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)' 
              : 'radial-gradient(circle, rgba(0,0,0,0.08) 1.5px, transparent 1.5px)', 
            backgroundSize: '32px 32px' 
          }} 
        />
      )}
      
      {/* 2. 背景视频层 (仅在 AR 模式下开启) */}
      {activeTab === 'ar_3d' && (
        <video 
          ref={videoRef} 
          autoPlay 
          playsInline 
          muted 
          className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-60"
        />
      )}
      
      {/* 3. 各个功能面板 (作为黑板背景层在非 AR 3D 模式下直接平铺) */}
      {activeTab === 'whiteboard' && (
        <div className="absolute inset-0 z-[35]">
          <GeometryBoard />
        </div>
      )}
      {activeTab === 'function' && (
        <div className="absolute inset-0 z-[35]">
          <FunctionExplorer />
        </div>
      )}
      {activeTab === 'calculator3d' && (
        <div className="absolute inset-0 z-[35]">
          <Calculator3D />
        </div>
      )}
 
      {activeTab === 'whiteboard' && (
        <>
          <FloatingWindow 
            id="toolbox" 
            title="作图工具控制条" 
            isOpen={isToolboxOpen} 
            onClose={() => setToolboxOpen(false)}
            width="300px"
            height="460px"
            defaultPosition={{ x: 950, y: 80 }}
          >
            <ToolboxPanel />
          </FloatingWindow>

          {/* 全局作图工具层 (跨悬浮窗) */}
          {showRuler && <Ruler onDrawLine={drawLineOnWhiteboard} />}
          {showTriangleRuler && <TriangleRuler onDrawLine={drawLineOnWhiteboard} />}
          {showProtractor && <Protractor onDrawArc={drawArcOnWhiteboard} />}
          {showCompass && <Compass onDrawArc={drawArcOnWhiteboard} />}
        </>
      )}
      
      {/* 4. 原有 3D AR 空间几何 */}
      {activeTab === 'ar_3d' && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} intensity={1.5} angle={0.2} penumbra={1} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            
            {/* Stunning reflections */}
            <Environment preset="city" background={false}>
              <Lightformer intensity={4} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
              <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[10, 2, 1]} />
              <Lightformer intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[10, 2, 1]} />
            </Environment>

            <MathModel />
          </Canvas>
        </div>
      )}
 
      {/* 5. 原有 3D AR 绘图层与手势识别 UI */}
      {activeTab === 'ar_3d' && <Canvas2D />}
      {activeTab === 'ar_3d' && <OverlayUI />}
 
      {/* 6. 顶层穿透白板书写画布 (仅在超级白板下供老师书写,函数探究单独隔离) */}
      {activeTab === 'whiteboard' && <WhiteboardCanvas />}
 
      {/* 7. 全新底部苹果 Dock 菜单 */}
      {activeTab !== 'ar_3d' && <AppleDock />}

      {/* 8. AR 模式右上角退出按钮 */}
      {activeTab === 'ar_3d' && (
        <button
          onClick={() => {
            useARStore.getState().setActiveTab('whiteboard');
          }}
          className="absolute top-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-200 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 active:scale-95 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.3)] backdrop-blur-md cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">退出 AR 空间</span>
        </button>
      )}
    </div>
  );
}
