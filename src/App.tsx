import { useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { initHandLandmarker } from './lib/mediapipe';
import { useARStore, FormulaCard } from './store';
import { OverlayUI } from './components/OverlayUI';
import { MathModel } from './components/MathModel';
import { Canvas2D } from './components/Canvas2D';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { Trash2, ZoomIn, ZoomOut } from 'lucide-react';

// New Apple Aesthetic tab components
import { AppleDock } from './components/AppleDock';
import { WhiteboardCanvas } from './components/WhiteboardCanvas';
import { GeometryBoard } from './components/GeometryBoard';
import { FunctionExplorer } from './components/FunctionExplorer';
import { ToolboxPanel } from './components/ToolboxPanel';
import { EquationEditor } from './components/EquationEditor';
import { ProbabilitySimulator } from './components/ProbabilitySimulator';
import { FloatingWindow } from './components/FloatingWindow';

// Import Ruler/Compass/Protractor/TriangleRuler for global whiteboard layer
import { Ruler } from './components/tools/Ruler';
import { TriangleRuler } from './components/tools/TriangleRuler';
import { Protractor } from './components/tools/Protractor';
import { Compass } from './components/tools/Compass';

function FormulaCardWidget({ card }: { card: FormulaCard }) {
  const removeFormulaCard = useARStore(state => state.removeFormulaCard);
  const updateFormulaCard = useARStore(state => state.updateFormulaCard);

  const [pos, setPos] = useState({ x: card.x, y: card.y });
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { x: pos.x, y: pos.y };
    e.stopPropagation();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPos({ x: posStart.current.x + dx, y: posStart.current.y + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    updateFormulaCard(card.id, { x: pos.x, y: pos.y });
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: `scale(${card.scale})`,
        transformOrigin: 'top left',
        zIndex: 25,
      }}
      className="p-5 rounded-2xl bg-zinc-950/80 backdrop-blur-2xl border border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.5)] flex flex-col gap-3 group pointer-events-auto select-none touch-none"
    >
      {/* Top bar with drag handle and delete button */}
      <div className="flex items-center justify-between gap-6 border-b border-white/5 pb-2 cursor-grab active:cursor-grabbing">
        <span className="text-[10px] text-zinc-500 font-bold tracking-wider">公式牌</span>
        <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 transition-opacity pointer-events-auto" onPointerDown={e => e.stopPropagation()}>
          <button
            onClick={(e) => { e.stopPropagation(); updateFormulaCard(card.id, { scale: Math.max(0.6, card.scale - 0.1) }); }}
            className="p-1 rounded bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="缩小"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); updateFormulaCard(card.id, { scale: Math.min(3, card.scale + 0.1) }); }}
            className="p-1 rounded bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="放大"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); removeFormulaCard(card.id); }}
            className="p-1 rounded bg-red-500/10 text-red-400 hover:text-red-300 hover:bg-red-500/20 transition-colors ml-1"
            title="删除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* MathML Display */}
      <div 
        className="flex items-center justify-center py-2 px-4 bg-black/30 rounded-xl border border-white/5 min-w-[120px] min-h-[60px]"
        dangerouslySetInnerHTML={{ __html: card.mathML }}
      />
    </div>
  );
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(undefined);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const activeTab = useARStore(state => state.activeTab);
  const updateHands = useARStore(state => state.updateHands);
  const setLoaderVisible = useARStore(state => state.setLoaderVisible);

  // Zustand states for floating windows and tools
  const isToolboxOpen = useARStore(state => state.isToolboxOpen);
  const setToolboxOpen = useARStore(state => state.setToolboxOpen);
  const isFormulaModalOpen = useARStore(state => state.isFormulaModalOpen);
  const setFormulaModalOpen = useARStore(state => state.setFormulaModalOpen);

  const showRuler = useARStore(state => state.showRuler);
  const showTriangleRuler = useARStore(state => state.showTriangleRuler);
  const showProtractor = useARStore(state => state.showProtractor);
  const showCompass = useARStore(state => state.showCompass);

  const formulaCards = useARStore(state => state.formulaCards);

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
        
        if (results.landmarks && results.landmarks.length > 0) {
          const processHand = (landmarks: any) => {
            if (!landmarks) return { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
            
            const indexF = landmarks[8];
            const thumb = landmarks[4];
            
            if (indexF && thumb) {
              // Screen is mirrored. So mediaPipe X must be inverted.
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
              const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
              
              return {
                isVisible: true,
                isPinched: distance < 0.05,
                pinchDistance: distance,
                // @ts-ignore
                cursor: { x: ndcX, y: ndcY }, // Using object literal, store copies it
                pixelCursor: { x: pixelX, y: pixelY }
              };
            }
            return { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
          };

          let leftNode = { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
          let rightNode = { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };

          // More reliable hand detection: Based on X position from the camera.
          // Since camera is mirrored (scale-x-100), smaller x means left side of the screen.
          const processedHands = results.landmarks.map(processHand);
          
          if (processedHands.length === 1) {
            // Default to right hand logic if one hand, or rely on category.
            const name = results.handednesses && results.handednesses[0] && results.handednesses[0][0] ? results.handednesses[0][0].categoryName : undefined; 
            if (name === 'Left') { // MediaPipe "Left" in mirrored selfie = User's Right hand
              rightNode = processedHands[0] as any;
            } else {
              leftNode = processedHands[0] as any;
            }
          } else if (processedHands.length >= 2) {
            // Sort by X coordinate (smaller X = left side of screen)
            processedHands.sort((a, b) => a.pixelCursor.x - b.pixelCursor.x);
            leftNode = processedHands[0] as any;
            rightNode = processedHands[1] as any;
          }
          
          updateHands(leftNode, rightNode);

          // Synthetic click logic (use both hands for clicking UI)
          [leftNode, rightNode].forEach(node => {
            if (node.isVisible && node.isPinched) {
              const prevPinchRef = node === rightNode ? prevPinch1 : prevPinch2;
              if (!prevPinchRef.current) {
                // Pinch started
                const el = document.elementFromPoint(node.pixelCursor.x, node.pixelCursor.y);
                if (el) {
                  const event = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: node.pixelCursor.x,
                    clientY: node.pixelCursor.y
                  });
                  el.dispatchEvent(event);
                  
                  if (el.tagName.toLowerCase() === 'button') {
                    const htmlEl = el as HTMLElement;
                    htmlEl.style.transform = 'scale(0.9)';
                    setTimeout(() => htmlEl.style.transform = '', 150);
                  }
                }
              }
            }
          });
          
          prevPinch1.current = rightNode.isPinched;
          prevPinch2.current = leftNode.isPinched;
        } else {
          // Hands lost
          updateHands(
            { isVisible: false, isPinched: false, pinchDistance: 1 },
            { isVisible: false, isPinched: false, pinchDistance: 1 }
          );
        }
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
    };
  }, [updateHands, setLoaderVisible, activeTab]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#121316] select-none text-white transition-colors duration-300">
      {/* 1. 微点底纹背景 (用于白板等 2D 教学模块) */}
      {activeTab !== 'ar_3d' && (
        <div 
          className="absolute inset-0 pointer-events-none opacity-20" 
          style={{ 
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.15) 1.5px, transparent 1.5px)', 
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
      {(activeTab === 'geometry' || activeTab === 'whiteboard') && (
        <div className="absolute inset-0 z-[35]">
          <GeometryBoard />
        </div>
      )}
      {activeTab === 'function' && (
        <div className="absolute inset-0 z-[35]">
          <FunctionExplorer />
        </div>
      )}
      {activeTab === 'probability' && (
        <div className="absolute inset-0 z-[35]">
          <ProbabilitySimulator />
        </div>
      )}

      {activeTab !== 'ar_3d' && (
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

          {/* 全局公式牌 */}
          {formulaCards.map(card => (
            <FormulaCardWidget key={card.id} card={card} />
          ))}

          {/* 全局作图工具层 (跨悬浮窗) */}
          {showRuler && <Ruler onDrawLine={drawLineOnWhiteboard} />}
          {showTriangleRuler && <TriangleRuler onDrawLine={drawLineOnWhiteboard} />}
          {showProtractor && <Protractor onDrawArc={drawArcOnWhiteboard} />}
          {showCompass && <Compass onDrawArc={drawArcOnWhiteboard} />}
        </>
      )}

      {/* 4. 公式选择器 (大屏居中遮罩模态框) */}
      {isFormulaModalOpen && <EquationEditor />}
      
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

      {/* 6. 顶层穿透白板书写画布 (在非 AR 模式下都可供老师任意书写或写字板) */}
      {activeTab !== 'ar_3d' && <WhiteboardCanvas />}

      {/* 7. 全新底部苹果 Dock 菜单 */}
      <AppleDock />
    </div>
  );
}
