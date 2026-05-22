import { useEffect, useRef } from 'react';
import { useARStore, HandState, MathShape } from '../store';
import { cn } from '../lib/utils';
import { Box, Circle, Cylinder, Cone, Triangle, PenTool, Cuboid, Palette, Eraser, Trash2, Unplug, Upload, X, Network } from 'lucide-react';
import { parseGeometryImage } from '../lib/gemini';
import { normalizeVertices } from '../lib/geometry';

export function OverlayUI() {
  const activeModel = useARStore(state => state.activeModel);
  const setActiveModel = useARStore(state => state.setActiveModel);
  const isLoaderVisible = useARStore(state => state.isLoaderVisible);
  const isAnalyzing = useARStore(state => state.isAnalyzing);
  
  const activeTab = useARStore(state => state.activeTab);
  const setActiveTab = useARStore(state => state.setActiveTab);
  
  const isModelPanelOpen = useARStore(state => state.isModelPanelOpen);
  const setModelPanelOpen = useARStore(state => state.setModelPanelOpen);
  
  const isPenPanelOpen = useARStore(state => state.isPenPanelOpen);
  const setPenPanelOpen = useARStore(state => state.setPenPanelOpen);
  
  const penColor = useARStore(state => state.penColor);
  const setPenColor = useARStore(state => state.setPenColor);
  const penThickness = useARStore(state => state.penThickness);
  const setPenThickness = useARStore(state => state.setPenThickness);
  const isEraser = useARStore(state => state.isEraser);
  const setIsEraser = useARStore(state => state.setIsEraser);
  const clearCanvas = useARStore(state => state.clearCanvas);
  const isLineDrawingActive = useARStore(state => state.isLineDrawingActive);
  const setLineDrawingActive = useARStore(state => state.setLineDrawingActive);

  const customModels = useARStore(state => state.customModels);
  const activeCustomModelId = useARStore(state => state.activeCustomModelId);
  const setActiveCustomModel = useARStore(state => state.setActiveCustomModel);
  const removeCustomModel = useARStore(state => state.removeCustomModel);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursor1Ref = useRef<HTMLDivElement>(null);
  const cursor2Ref = useRef<HTMLDivElement>(null);

  // Sync cursor visual
  useEffect(() => {
    const unsub = useARStore.subscribe((state) => {
      const updateCursor = (element: HTMLDivElement | null, hand: HandState) => {
        if (!element) return;
        
        if (!hand.isVisible) {
          element.style.opacity = '0';
          return;
        }

        element.style.opacity = '1';
        const x = hand.pixelCursor.x;
        const y = hand.pixelCursor.y;
        
        // Size cursor dynamically based on pinch distance for visual feedback
        const pinchScale = hand.isPinched ? 0.75 : 1 + Math.max(0, (hand.pinchDistance - 0.05) * 2);
        element.style.transform = `translate(${x}px, ${y}px) scale(${pinchScale})`;
        
        if (hand.isPinched) {
          element.classList.add('bg-white', 'border-transparent');
          element.classList.remove('bg-white/20', 'border-white/80');
        } else {
          element.classList.remove('bg-white', 'border-transparent');
          element.classList.add('bg-white/20', 'border-white/80');
        }
      };

      updateCursor(cursor1Ref.current, state.leftHand);
      updateCursor(cursor2Ref.current, state.rightHand);
    });
    return unsub;
  }, []);

  const handleTabClick = (tab: 'model' | 'pen') => {
    if (tab === 'model') {
      const nextState = !isModelPanelOpen;
      setModelPanelOpen(nextState);
      if (nextState) setPenPanelOpen(false);
    } else if (tab === 'pen') {
      const nextState = !isPenPanelOpen;
      setPenPanelOpen(nextState);
      if (nextState) setModelPanelOpen(false);
    }
  };

  const handleModelSelect = (model: MathShape) => {
    if (activeModel === model) {
      setActiveModel(null);
    } else {
      setActiveModel(model);
    }
  };

  const handleCustomModelSelect = (id: string) => {
    if (activeCustomModelId === id) {
      setActiveCustomModel(null);
    } else {
      setActiveCustomModel(id);
    }
  };

  /**
   * 处理图片上传：读取文件 -> base64 -> 调用 Gemini -> 归一化 -> 存入 store
   */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input，允许再次选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';

    const store = useARStore.getState();
    store.setAnalyzing(true);

    try {
      // 读取文件为 base64
      const base64 = await fileToBase64(file);
      const mimeType = file.type || 'image/png';

      // 调用 Gemini API
      const result = await parseGeometryImage(base64, mimeType);

      // 归一化坐标
      const normalizedVertices = normalizeVertices(result.vertices);

      // 生成唯一 ID 并存入 store
      const customModel = {
        id: `custom_${Date.now()}`,
        name: result.name || `模型 ${store.customModels.length + 1}`,
        vertices: normalizedVertices,
        faces: result.faces,
        edges: result.edges,
      };

      store.addCustomModel(customModel);
    } catch (err) {
      console.error('几何图解析失败:', err);
      alert(`解析失败: ${(err as Error).message}`);
    } finally {
      store.setAnalyzing(false);
    }
  };

  /**
   * 将 File 对象转换为不含前缀的纯 base64 字符串
   */
  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        // 去除 "data:image/png;base64," 前缀
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* 2D Hand Tracking Cursor 1 - Left Hand */}
      <div 
        ref={cursor1Ref} 
        className="fixed top-0 left-0 w-10 h-10 -ml-5 -mt-5 rounded-full border-[3px] shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-none transition-transform duration-75 ease-out z-50 backdrop-blur-sm"
        style={{ opacity: 0 }}
      />

      {/* 2D Hand Tracking Cursor 2 - Right Hand */}
      <div 
        ref={cursor2Ref} 
        className="fixed top-0 left-0 w-8 h-8 -ml-4 -mt-4 rounded-full border-[3px] shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-none transition-transform duration-75 ease-out z-50 backdrop-blur-sm border-blue-400"
        style={{ opacity: 0 }}
      />

      {/* Loading Overlay */}
      {isLoaderVisible && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-900/80 backdrop-blur-3xl transition-opacity duration-1000">
          <div className="flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center w-24 h-24">
              <div className="absolute inset-0 border-4 border-white/20 rounded-full animate-spin border-t-white duration-1000" />
            </div>
            <h2 className="text-2xl font-light text-white font-sans tracking-wide">
              Initializing Spatial Environment
            </h2>
            <p className="text-white/60 text-sm">Please allow camera access and stand clearly visible.</p>
          </div>
        </div>
      )}

      {/* AI Analyzing Overlay */}
      {isAnalyzing && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-900/70 backdrop-blur-2xl transition-opacity duration-500">
          <div className="flex flex-col items-center gap-6">
            <div className="relative flex items-center justify-center w-20 h-20">
              <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-spin border-t-cyan-400 duration-700" />
              <Upload className="w-8 h-8 text-cyan-400 animate-pulse" />
            </div>
            <h2 className="text-xl font-light text-white font-sans tracking-wide">
              正在分析几何结构...
            </h2>
            <p className="text-white/50 text-sm">AI 正在识别顶点坐标与拓扑关系</p>
          </div>
        </div>
      )}

      {/* Main Categories Dock */}
      <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
        <div className="flex items-center gap-2 p-2 rounded-[2rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl">
          <div className="flex gap-2 px-2">
            <DockButton 
              active={isModelPanelOpen} 
              onClick={() => handleTabClick('model')}
              label="3D Models"
            >
              <Cuboid className="w-6 h-6" />
            </DockButton>

            <div className="w-px h-8 bg-white/20 mx-2 self-center rounded-full" />

            <DockButton 
              active={isPenPanelOpen} 
              onClick={() => handleTabClick('pen')}
              label="Drawing Pen"
            >
              <PenTool className="w-6 h-6" />
            </DockButton>
          </div>
        </div>
      </div>

      {/* Model Selection Panel */}
      <div 
        className={cn(
          "absolute bottom-48 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isModelPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex items-center bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[1.5rem] p-2 gap-2">
          {/* 预设模型按钮 */}
          <DockButton active={activeModel === 'cube'} onClick={() => handleModelSelect('cube')} label="Cube">
            <Box className="w-5 h-5" />
          </DockButton>
          <DockButton active={activeModel === 'sphere'} onClick={() => handleModelSelect('sphere')} label="Sphere">
            <Circle className="w-5 h-5" />
          </DockButton>
          <DockButton active={activeModel === 'cylinder'} onClick={() => handleModelSelect('cylinder')} label="Cylinder">
            <Cylinder className="w-5 h-5" />
          </DockButton>
          <DockButton active={activeModel === 'cone'} onClick={() => handleModelSelect('cone')} label="Cone">
            <Cone className="w-5 h-5" />
          </DockButton>
          <DockButton active={activeModel === 'pyramid'} onClick={() => handleModelSelect('pyramid')} label="Pyramid">
            <Triangle className="w-5 h-5" />
          </DockButton>

          {/* 自定义模型按钮（如果有） */}
          {customModels.length > 0 && (
            <>
              <div className="w-px h-6 bg-white/20 mx-1 self-center rounded-full" />
              {customModels.map((cm, idx) => (
                <div key={cm.id} className="relative group">
                  <DockButton
                    active={activeCustomModelId === cm.id}
                    onClick={() => handleCustomModelSelect(cm.id)}
                    label={cm.name}
                  >
                    <span className="text-xs font-bold w-5 h-5 flex items-center justify-center">
                      {cm.name.charAt(0).toUpperCase() || `M${idx + 1}`}
                    </span>
                  </DockButton>
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeCustomModel(cm.id);
                    }}
                    className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-2.5 h-2.5 text-white" />
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="w-px h-6 bg-white/20 mx-1 self-center rounded-full" />

          {/* 上传按钮 */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 text-white/60 hover:text-cyan-400 hover:bg-cyan-500/20 rounded-full transition-colors active:scale-95"
            title="上传几何图片"
          >
            <Upload className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pen Settings Panel */}
      <div 
        className={cn(
          "absolute bottom-48 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isPenPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex flex-col bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[1.5rem] p-4 gap-4">
          {/* Colors */}
          <div className="flex gap-3">
             {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
                <button
                  key={color}
                  onClick={() => setPenColor(color)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    penColor === color && !isEraser ? "border-white scale-110" : "border-transparent scale-100 hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
             ))}
          </div>
          
          <div className="h-px bg-white/10 w-full" />

          {/* Tools */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2 items-center bg-white/5 rounded-full p-1">
              <button 
                onClick={() => setPenThickness(1)}
                className={cn("w-6 h-6 rounded-full transition-colors flex items-center justify-center", penThickness === 1 ? "bg-white/20" : "")}
              >
                <div className="w-[2px] h-[2px] bg-white rounded-full"/>
              </button>
              <button 
                onClick={() => setPenThickness(3)}
                className={cn("w-6 h-6 rounded-full transition-colors flex items-center justify-center", penThickness === 3 ? "bg-white/20" : "")}
              >
                <div className="w-1 h-1 bg-white rounded-full"/>
              </button>
              <button 
                onClick={() => setPenThickness(6)}
                className={cn("w-6 h-6 rounded-full transition-colors flex items-center justify-center", penThickness === 6 ? "bg-white/20" : "")}
              >
                <div className="w-2 h-2 bg-white rounded-full"/>
              </button>
            </div>

            <div className="flex gap-1 items-center">
              {/* Draw Lines */}
              <button 
                onClick={() => {
                  setLineDrawingActive(!isLineDrawingActive);
                  if (!isLineDrawingActive && isEraser) setIsEraser(false);
                }}
                className={cn(
                  "p-2 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  isLineDrawingActive ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
                title="Toggle 3D Line Drawing"
              >
                <Network className="w-5 h-5" />
              </button>

              <div className="w-px h-5 bg-white/10 mx-1 rounded-full" />

              <button 
                onClick={() => {
                  setIsEraser(!isEraser);
                  if (!isEraser && isLineDrawingActive) setLineDrawingActive(false);
                }}
                className={cn(
                  "p-2 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  isEraser ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
              >
                <Eraser className="w-5 h-5" />
              </button>
              <button 
                onClick={() => { clearCanvas(); useARStore.getState().clearModelLines(); }}
                className="p-2 rounded-full text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90"
                title="Clear Everything"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info hidden per requirements */}
    </>
  );
}

function DockButton({ children, active, onClick, label }: { children: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative group p-4 rounded-full transition-all duration-300 ease-out",
        active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/90"
      )}
      title={label}
    >
      {children}
      {active && (
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full shadow-[0_0_10px_white]" />
      )}
    </button>
  );
}
