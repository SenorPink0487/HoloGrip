import { useEffect, useRef, useState } from 'react';
import { useARStore, HandState, MathShape } from '../store';
import { cn } from '../lib/utils';
import { Box, Circle, Cylinder, Cone, Triangle, PenTool, Cuboid, Palette, Eraser, Trash2, Unplug, Upload, X, Network, Ruler } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  const isPenActive = useARStore(state => state.isPenActive);
  const setPenActive = useARStore(state => state.setPenActive);
  
  const penColor = useARStore(state => state.penColor);
  const setPenColor = useARStore(state => state.setPenColor);
  const penThickness = useARStore(state => state.penThickness);
  const setPenThickness = useARStore(state => state.setPenThickness);
  const isEraser = useARStore(state => state.isEraser);
  const setIsEraser = useARStore(state => state.setIsEraser);
  const clearCanvas = useARStore(state => state.clearCanvas);
  const isLineDrawingActive = useARStore(state => state.isLineDrawingActive);
  const setLineDrawingActive = useARStore(state => state.setLineDrawingActive);
  const isXYZDrawingActive = useARStore(state => state.isXYZDrawingActive);
  const setXYZDrawingActive = useARStore(state => state.setXYZDrawingActive);
  const snappedPointInfo = useARStore(state => state.snappedPointInfo);
  const activeLineStart = useARStore(state => state.activeLineStart);
  const showAllLengths = useARStore(state => state.showAllLengths);
  const toggleShowAllLengths = useARStore(state => state.toggleShowAllLengths);

  const customModels = useARStore(state => state.customModels);
  const activeCustomModelId = useARStore(state => state.activeCustomModelId);
  const setActiveCustomModel = useARStore(state => state.setActiveCustomModel);
  const removeCustomModel = useARStore(state => state.removeCustomModel);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursor1Ref = useRef<HTMLDivElement>(null);
  const cursor2Ref = useRef<HTMLDivElement>(null);

  // 待删除的自定义模型 ID（非 null 时弹出二次确认弹窗）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const pendingDeleteModel = pendingDeleteId
    ? customModels.find(m => m.id === pendingDeleteId) ?? null
    : null;

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

  // 工具按钮 3 态循环：
  //   未激活+面板关 → 激活+面板开 → 激活+面板关 → 未激活+面板关
  // “激活”定义：
  //   - 绘图：isPenActive=true 或 isLineDrawingActive=true
  //     （任一开启都视为绘图体系激活；面板内可在画笔/连线/橡皮擦间切换，
  //      切换不影响 dock 三段式的激活态）
  //   - 模型：已选中某个模型（activeModel 或 activeCustomModelId）
  const handleTabClick = (tab: 'model' | 'pen') => {
    if (tab === 'pen') {
      // dock 视角下，画笔与连线同属"绘图体系"，共享同一个三段式循环
      const drawingActive = isPenActive || isLineDrawingActive || isXYZDrawingActive;

      // 同时只展开一个面板：开画笔时关掉模型面板
      if (!drawingActive && !isPenPanelOpen) {
        // 第一态 → 第二态：默认激活画笔并展开面板，用户可在面板内切到连线
        setPenActive(true);
        setPenPanelOpen(true);
        setModelPanelOpen(false);
      } else if (drawingActive && isPenPanelOpen) {
        // 第二态 → 第三态：保持当前工具(画笔或连线)激活，仅收起面板
        setPenPanelOpen(false);
      } else if (drawingActive && !isPenPanelOpen) {
        // 第三态 → 第一态：彻底取消绘图体系激活
        setPenActive(false);
        setLineDrawingActive(false);
        setXYZDrawingActive(false);
        setPenPanelOpen(false);
      } else {
        // 边界态：未激活但面板开着 → 收起面板回到第一态
        setPenPanelOpen(false);
      }
    } else if (tab === 'model') {
      const hasModel = activeModel !== null || activeCustomModelId !== null;
      // 模型按钮 3 态循环：
      //   未选中 + 面板关 → 选中 + 面板开 → 选中 + 面板关 → 未选中 + 面板关
      // 由于"未选中 + 面板开"是用户从面板里没选就再点的边界情况，
      // 视为第 3 态结束态，再点直接回到第 1 态（关面板）。
      if (!hasModel && !isModelPanelOpen) {
        // 第 1 态 → 展开面板，让用户从中选模型（不强制选第一个）
        setModelPanelOpen(true);
        setPenPanelOpen(false);
      } else if (hasModel && isModelPanelOpen) {
        // 第 2 态 → 第 3 态：保留模型，仅收起面板
        setModelPanelOpen(false);
      } else if (hasModel && !isModelPanelOpen) {
        // 第 3 态 → 第 1 态：清除选中模型
        setActiveModel(null);
        setActiveCustomModel(null);
      } else {
        // 没选模型但面板已开：直接收起，回到第 1 态
        setModelPanelOpen(false);
      }
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
      {/* 用 absolute 而非 fixed：AR 舞台 div 自身已建立定位上下文，
          桌面端有 36px 标题栏，fixed 会让光标跑到 viewport 顶部，
          与画布（舞台局部坐标系）落点失配 */}
      <div 
        ref={cursor1Ref} 
        className="absolute top-0 left-0 w-10 h-10 -ml-5 -mt-5 rounded-full border-[3px] shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-none z-50 backdrop-blur-sm"
        style={{ opacity: 0 }}
      />

      {/* 2D Hand Tracking Cursor 2 - Right Hand */}
      <div 
        ref={cursor2Ref} 
        className="absolute top-0 left-0 w-8 h-8 -ml-4 -mt-4 rounded-full border-[3px] shadow-[0_0_15px_rgba(255,255,255,0.4)] pointer-events-none z-50 backdrop-blur-sm border-blue-400"
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
              正在初始化空间环境
            </h2>
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
        <div className="flex items-center gap-4 p-4 rounded-[3rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl">
          <div className="flex gap-4 px-2">
            <DockButton 
              active={activeModel !== null || activeCustomModelId !== null} 
              onClick={() => handleTabClick('model')}
              label="3D 模型"
            >
              <Cuboid className="w-10 h-10" />
            </DockButton>

            <div className="w-px h-14 bg-white/20 mx-2 self-center rounded-full" />

            <DockButton 
              active={isPenActive || isLineDrawingActive || isXYZDrawingActive} 
              onClick={() => handleTabClick('pen')}
              label="画笔工具"
            >
              <PenTool className="w-10 h-10" />
            </DockButton>
          </div>
        </div>
      </div>

      {/* Model Selection Panel */}
      <div 
        className={cn(
          "absolute bottom-64 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isModelPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex items-center bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[3rem] p-3 gap-3">
          {/* 预设模型按钮 */}
          <DockButton active={activeModel === 'cube'} onClick={() => handleModelSelect('cube')} label="正方体">
            <Box className="w-8 h-8" />
          </DockButton>
          <DockButton active={activeModel === 'sphere'} onClick={() => handleModelSelect('sphere')} label="球体">
            <Circle className="w-8 h-8" />
          </DockButton>
          <DockButton active={activeModel === 'cylinder'} onClick={() => handleModelSelect('cylinder')} label="圆柱体">
            <Cylinder className="w-8 h-8" />
          </DockButton>
          <DockButton active={activeModel === 'cone'} onClick={() => handleModelSelect('cone')} label="圆锥体">
            <Cone className="w-8 h-8" />
          </DockButton>
          <DockButton active={activeModel === 'pyramid'} onClick={() => handleModelSelect('pyramid')} label="棱锥体">
            <Triangle className="w-8 h-8" />
          </DockButton>

          {/* 自定义模型按钮（如果有） */}
          {customModels.length > 0 && (
            <>
              <div className="w-px h-10 bg-white/20 mx-2 self-center rounded-full" />
              {customModels.map((cm, idx) => (
                <div key={cm.id} className="relative group">
                  <DockButton
                    active={activeCustomModelId === cm.id}
                    onClick={() => handleCustomModelSelect(cm.id)}
                    label={cm.name}
                  >
                    <span className="text-base font-bold w-8 h-8 flex items-center justify-center">
                      {cm.name.charAt(0).toUpperCase() || `M${idx + 1}`}
                    </span>
                  </DockButton>
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(cm.id);
                    }}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="删除模型"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </>
          )}

          <div className="w-px h-10 bg-white/20 mx-2 self-center rounded-full" />

          {/* 上传按钮 */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-5 text-white/60 hover:text-cyan-400 hover:bg-cyan-500/20 rounded-full transition-colors active:scale-95"
            title="上传几何图片"
          >
            <Upload className="w-8 h-8" />
          </button>
        </div>
      </div>

      {/* Pen Settings Panel */}
      <div 
        className={cn(
          "absolute bottom-64 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isPenPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex flex-col bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[2.5rem] p-6 gap-6">
          {/* Colors */}
          <div className="flex gap-5">
             {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
                <button
                  key={color}
                  onClick={() => setPenColor(color)}
                  className={cn(
                    "w-12 h-12 rounded-full border-2 transition-all",
                    penColor === color && !isEraser ? "border-white scale-110" : "border-transparent scale-100 hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                />
             ))}
          </div>
          
          <div className="h-px bg-white/10 w-full" />

          {/* Tools */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex gap-3 items-center bg-white/5 rounded-full p-2">
              <button 
                onClick={() => setPenThickness(1)}
                className={cn("w-10 h-10 rounded-full transition-colors flex items-center justify-center", penThickness === 1 ? "bg-white/20" : "")}
              >
                <div className="w-1 h-1 bg-white rounded-full"/>
              </button>
              <button 
                onClick={() => setPenThickness(3)}
                className={cn("w-10 h-10 rounded-full transition-colors flex items-center justify-center", penThickness === 3 ? "bg-white/20" : "")}
              >
                <div className="w-2 h-2 bg-white rounded-full"/>
              </button>
              <button 
                onClick={() => setPenThickness(6)}
                className={cn("w-10 h-10 rounded-full transition-colors flex items-center justify-center", penThickness === 6 ? "bg-white/20" : "")}
              >
                <div className="w-4 h-4 bg-white rounded-full"/>
              </button>
            </div>

            <div className="flex gap-2 items-center">
              {/* Draw Lines */}
              <button 
                onClick={() => {
                  setLineDrawingActive(!isLineDrawingActive);
                  if (!isLineDrawingActive && isEraser) setIsEraser(false);
                }}
                className={cn(
                  "relative group p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  isLineDrawingActive ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
              >
                <Network className="w-8 h-8" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  3D 连线绘制
                </span>
              </button>

              <button 
                onClick={() => {
                  setXYZDrawingActive(!isXYZDrawingActive);
                  if (!isXYZDrawingActive && isEraser) setIsEraser(false);
                }}
                className={cn(
                  "relative group p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  isXYZDrawingActive ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
              >
                <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                  <line x1="12" y1="12" x2="20" y2="17" stroke="#ef4444" strokeWidth="2.5" />
                  <line x1="12" y1="12" x2="4" y2="17" stroke="#10b981" strokeWidth="2.5" />
                  <line x1="12" y1="12" x2="12" y2="3" stroke="#3b82f6" strokeWidth="2.5" />
                </svg>
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  XYZ 轴辅助线
                </span>
              </button>

              <button 
                onClick={() => toggleShowAllLengths()}
                className={cn(
                  "relative group p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  showAllLengths ? "bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
              >
                <Ruler className="w-8 h-8" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  显示线段长度
                </span>
              </button>

              <div className="w-px h-8 bg-white/10 mx-2 rounded-full" />

              <button 
                onClick={() => {
                  setIsEraser(!isEraser);
                  if (!isEraser && isLineDrawingActive) setLineDrawingActive(false);
                }}
                className={cn(
                  "relative group p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                  isEraser ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]" : "text-white/60 hover:bg-white/10"
                )}
              >
                <Eraser className="w-8 h-8" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  橡皮擦
                </span>
              </button>
              <button 
                onClick={() => {
                  clearCanvas();
                  window.dispatchEvent(new CustomEvent('holomath:whiteboard-local-clear'));
                  useARStore.getState().clearModelLines();
                  useARStore.getState().clearSurfaceStrokes();
                }}
                className="relative group p-4 rounded-full text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90"
              >
                <Trash2 className="w-8 h-8" />
                <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                  清空全部
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 删除自定义模型的二次确认弹窗 */}
      <AnimatePresence>
        {pendingDeleteModel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="w-[360px] p-6 rounded-2xl bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border border-black/10 dark:border-white/10 text-center shadow-2xl flex flex-col gap-4 text-zinc-800 dark:text-zinc-100"
            >
              <div className="flex justify-center text-red-500">
                <Trash2 className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-bold">删除该模型？</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                即将删除自定义模型「{pendingDeleteModel.name}」。删除后模型上的所有笔迹与连线也会一并清除，且不可撤销。
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setPendingDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5 active:scale-95 transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    const id = pendingDeleteId;
                    setPendingDeleteId(null);
                    if (id) removeCustomModel(id);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white text-sm font-medium shadow-lg shadow-red-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Info hidden per requirements */}
    </>
  );
}

function DockButton({ children, active, onClick, label }: { children: React.ReactNode, active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative group p-6 rounded-full transition-all duration-300 ease-out",
        active ? "bg-white/15 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/90"
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_10px_white]" />
      )}
      {/* Custom Tooltip */}
      <span className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        {label}
      </span>
    </button>
  );
}
