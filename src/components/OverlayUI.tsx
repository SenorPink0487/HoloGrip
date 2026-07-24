import { useEffect, useRef, useState } from 'react';
import { useARStore, HandState, MathShape } from '../store';
import { cn } from '../lib/utils';
import { Box, Cylinder, Cone, Triangle, PenTool, Cuboid, Palette, Eraser, Trash2, Unplug, Upload, X, Network, Ruler, Camera, Scan } from 'lucide-react';
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
  const isSectionPlaneActive = useARStore(state => state.isSectionPlaneActive);
  const setSectionPlaneActive = useARStore(state => state.setSectionPlaneActive);
  const sectionDraftPoints = useARStore(state => state.sectionDraftPoints);
  const sectionPlanes = useARStore(state => state.sectionPlanes);
  const clearSectionDraft = useARStore(state => state.clearSectionDraft);
  const clearSectionPlanes = useARStore(state => state.clearSectionPlanes);
  const snappedPointInfo = useARStore(state => state.snappedPointInfo);
  const activeLineStart = useARStore(state => state.activeLineStart);
  const showAllLengths = useARStore(state => state.showAllLengths);
  const toggleShowAllLengths = useARStore(state => state.toggleShowAllLengths);

  const customModels = useARStore(state => state.customModels);
  const activeCustomModelId = useARStore(state => state.activeCustomModelId);
  const setActiveCustomModel = useARStore(state => state.setActiveCustomModel);
  const removeCustomModel = useARStore(state => state.removeCustomModel);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const cursor1Ref = useRef<HTMLDivElement>(null);
  const cursor2Ref = useRef<HTMLDivElement>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const statusTimerRef = useRef<number | null>(null);

  // 待删除的自定义模型 ID（非 null 时弹出二次确认弹窗）
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
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

  useEffect(() => {
    return () => {
      analysisAbortRef.current?.abort();
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
      useARStore.getState().setAnalyzing(false);
    };
  }, []);

  // 工具按钮 3 态循环：
  //   未激活+面板关 → 激活+面板开 → 激活+面板关 → 未激活+面板关
  // “激活”定义：
  //   - 绘图：isPenActive / isLineDrawingActive / isXYZDrawingActive / isSectionPlaneActive
  //     （任一开启都视为绘图体系激活；面板内可在画笔/连线/剖切/橡皮擦间切换，
  //      切换不影响 dock 三段式的激活态）
  //   - 模型：已选中某个模型（activeModel 或 activeCustomModelId）
  const handleTabClick = (tab: 'model' | 'pen') => {
    if (tab === 'pen') {
      // dock 视角下，画笔与连线/剖切同属"绘图体系"，共享同一个三段式循环
      const drawingActive = isPenActive || isLineDrawingActive || isXYZDrawingActive || isSectionPlaneActive;

      // 同时只展开一个面板：开画笔时关掉模型面板
      if (!drawingActive && !isPenPanelOpen) {
        // 第一态 → 第二态：默认激活画笔并展开面板，用户可在面板内切到连线/剖切
        setPenActive(true);
        setPenPanelOpen(true);
        setModelPanelOpen(false);
      } else if (drawingActive && isPenPanelOpen) {
        // 第二态 → 第三态：保持当前工具激活，仅收起面板
        setPenPanelOpen(false);
      } else if (drawingActive && !isPenPanelOpen) {
        // 第三态 → 第一态：彻底取消绘图体系激活
        setPenActive(false);
        setLineDrawingActive(false);
        setXYZDrawingActive(false);
        setSectionPlaneActive(false);
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

  const showStatus = (type: 'success' | 'error' | 'info', text: string) => {
    setAnalysisStatus({ type, text });
    if (statusTimerRef.current !== null) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => {
      setAnalysisStatus(null);
      statusTimerRef.current = null;
    }, type === 'error' ? 6000 : 3200);
  };

  const analyzeGeometryImage = async (image: Blob, source: 'upload' | 'camera') => {
    const store = useARStore.getState();
    if (store.isAnalyzing) return;

    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    store.setAnalyzing(true);
    showStatus('info', source === 'camera' ? '已拍照，正在识别几何结构...' : '正在压缩并识别图片...');

    try {
      const { base64, mimeType } = await imageBlobToOptimizedBase64(image, controller.signal);
      const result = await parseGeometryImage(base64, mimeType, {
        signal: controller.signal,
        timeoutMs: 45_000,
      });
      if (controller.signal.aborted) return;

      const normalizedVertices = normalizeVertices(result.vertices);
      const nextIndex = useARStore.getState().customModels.length + 1;
      const customModel = {
        id: `custom_${Date.now()}`,
        name: result.name || `模型 ${nextIndex}`,
        vertices: normalizedVertices,
        faces: result.faces,
        edges: result.edges,
      };

      store.addCustomModel(customModel);
      store.setActiveCustomModel(customModel.id);
      store.setActiveModel(null);
      store.setModelPanelOpen(true);
      showStatus('success', `已生成模型：${customModel.name}`);
    } catch (err) {
      if (controller.signal.aborted) {
        showStatus('info', '识别已取消');
      } else {
        console.error('几何图解析失败:', err);
        showStatus('error', `解析失败：${(err as Error).message}`);
      }
    } finally {
      if (analysisAbortRef.current === controller) {
        analysisAbortRef.current = null;
      }
      useARStore.getState().setAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 重置 input，允许再次选择同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!file.type.startsWith('image/')) {
      showStatus('error', '请选择图片文件');
      return;
    }

    await analyzeGeometryImage(file, 'upload');
  };

  const handleCameraFileCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (cameraInputRef.current) cameraInputRef.current.value = '';

    if (!file.type.startsWith('image/')) {
      showStatus('error', '请拍摄或选择图片');
      return;
    }

    await analyzeGeometryImage(file, 'camera');
  };

  const handleRearCameraCapture = async () => {
    if (useARStore.getState().isAnalyzing) return;

    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
      return;
    }

    fileInputRef.current?.click();
  };

  async function imageBlobToOptimizedBase64(blob: Blob, signal: AbortSignal): Promise<{ base64: string; mimeType: string }> {
    const dataUrl = await blobToDataUrl(blob, signal);
    const image = await loadImage(dataUrl, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('当前设备无法处理图片');
    ctx.drawImage(image, 0, 0, width, height);

    const outputBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => {
        if (value) resolve(value);
        else reject(new Error('图片压缩失败'));
      }, 'image/jpeg', 0.85);
    });

    const optimizedDataUrl = await blobToDataUrl(outputBlob, signal);
    const base64 = optimizedDataUrl.split(',')[1];
    if (!base64) throw new Error('图片编码失败');
    return { base64, mimeType: 'image/jpeg' };
  }

  function blobToDataUrl(blob: Blob, signal: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const reader = new FileReader();
      const abort = () => {
        reader.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      reader.onload = () => {
        signal.removeEventListener('abort', abort);
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        signal.removeEventListener('abort', abort);
        reject(reader.error ?? new Error('图片读取失败'));
      };
      signal.addEventListener('abort', abort, { once: true });
      reader.readAsDataURL(blob);
    });
  }

  function loadImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }

      const image = new Image();
      const cleanup = () => {
        signal.removeEventListener('abort', abort);
        image.onload = null;
        image.onerror = null;
      };
      const abort = () => {
        cleanup();
        image.src = '';
        reject(new DOMException('Aborted', 'AbortError'));
      };
      image.onload = () => {
        cleanup();
        resolve(image);
      };
      image.onerror = () => {
        cleanup();
        reject(new Error('图片解码失败'));
      };
      signal.addEventListener('abort', abort, { once: true });
      image.src = src;
    });
  }

  async function captureRearCameraFrame(): Promise<Blob> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('当前设备不支持摄像头拍照');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1600 },
        height: { ideal: 1200 },
      },
      audio: false,
    });

    try {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      await waitForVideoFrame(video);

      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('当前设备无法生成拍照画面');
      ctx.drawImage(video, 0, 0, width, height);

      return await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('拍照失败'));
        }, 'image/jpeg', 0.9);
      });
    } finally {
      stream.getTracks().forEach(track => track.stop());
    }
  }

  function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('摄像头启动超时'));
      }, 5000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('canplay', ready);
        video.removeEventListener('error', fail);
      };
      const ready = () => {
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          cleanup();
          resolve();
        }
      };
      const fail = () => {
        cleanup();
        reject(new Error('摄像头画面不可用'));
      };
      video.addEventListener('loadeddata', ready);
      video.addEventListener('canplay', ready);
      video.addEventListener('error', fail);
      ready();
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
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleCameraFileCapture}
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
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-900/45 backdrop-blur-xl transition-opacity duration-500 pointer-events-none">
          <div className="flex flex-col items-center gap-5 rounded-3xl border border-white/10 bg-zinc-950/60 px-8 py-7 shadow-2xl">
            <div className="relative flex items-center justify-center w-16 h-16">
              <div className="absolute inset-0 border-4 border-cyan-500/30 rounded-full animate-spin border-t-cyan-400 duration-700" />
              <Upload className="w-7 h-7 text-cyan-400 animate-pulse" />
            </div>
            <h2 className="text-lg font-light text-white font-sans tracking-wide">
              正在分析几何结构...
            </h2>
            <p className="text-white/50 text-sm">AI 正在识别顶点坐标与拓扑关系</p>
          </div>
        </div>
      )}

      {analysisStatus && !isAnalyzing && (
        <div
          className={cn(
            "absolute left-1/2 top-[calc(env(safe-area-inset-top)+1rem)] z-50 -translate-x-1/2 rounded-2xl border px-4 py-2 text-sm font-medium shadow-2xl backdrop-blur-xl",
            analysisStatus.type === 'success' && "border-emerald-400/30 bg-emerald-500/15 text-emerald-100",
            analysisStatus.type === 'error' && "border-red-400/30 bg-red-500/15 text-red-100",
            analysisStatus.type === 'info' && "border-cyan-400/30 bg-cyan-500/15 text-cyan-100"
          )}
        >
          {analysisStatus.text}
        </div>
      )}

      {/* Main Categories Dock */}
      <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-2rem)]">
        <div className="flex items-center gap-3 p-3 sm:p-4 rounded-[3rem] bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl">
          <div className="flex gap-3 sm:gap-4 px-1 sm:px-2">
            <DockButton 
              active={activeModel !== null || activeCustomModelId !== null} 
              onClick={() => handleTabClick('model')}
              label="3D 模型"
            >
              <Cuboid className="w-10 h-10" />
            </DockButton>

            <div className="w-px h-14 bg-white/20 mx-2 self-center rounded-full" />

            <DockButton 
              active={isPenActive || isLineDrawingActive || isXYZDrawingActive || isSectionPlaneActive} 
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
          "absolute bottom-[calc(env(safe-area-inset-bottom)+12rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+14rem)] left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-2rem)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isModelPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex max-w-full flex-nowrap items-center justify-start overflow-x-auto overflow-y-hidden bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[2rem] sm:rounded-[3rem] p-2.5 sm:p-3 gap-2 sm:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* 预设模型按钮 */}
          <DockButton active={activeModel === 'cube'} onClick={() => handleModelSelect('cube')} label="正方体">
            <Box className="w-8 h-8" />
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

          <div className="flex shrink-0 items-center gap-2">
            {/* 上传按钮 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing}
              className="p-4 sm:p-5 text-white/60 hover:text-cyan-400 hover:bg-cyan-500/20 rounded-full transition-colors active:scale-95 disabled:cursor-wait disabled:opacity-40"
              title="上传几何图片"
              aria-label="上传几何图片"
            >
              <Upload className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>

            {/* 后置摄像头拍照识别按钮 */}
            <button
              onClick={handleRearCameraCapture}
              disabled={isAnalyzing}
              className="p-4 sm:p-5 text-white/60 hover:text-emerald-400 hover:bg-emerald-500/20 rounded-full transition-colors active:scale-95 disabled:cursor-wait disabled:opacity-40"
              title="后置摄像头拍照识别"
              aria-label="后置摄像头拍照识别"
            >
              <Camera className="w-7 h-7 sm:w-8 sm:h-8" />
            </button>
          </div>
        </div>
      </div>

      {/* Pen Settings Panel */}
      <div 
        className={cn(
          "absolute bottom-[calc(env(safe-area-inset-bottom)+12rem)] sm:bottom-[calc(env(safe-area-inset-bottom)+14rem)] left-1/2 -translate-x-1/2 z-30 pointer-events-auto max-w-[calc(100vw-2rem)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] will-change-transform origin-bottom",
          isPenPanelOpen ? "scale-100 opacity-100 translate-y-0" : "scale-90 opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex max-w-full flex-col bg-zinc-900/60 backdrop-blur-3xl border border-white/10 shadow-2xl rounded-[2rem] sm:rounded-[2.5rem] p-3 sm:p-4 gap-3">
          <div className="flex max-w-full flex-nowrap items-center justify-center gap-3 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Colors */}
            <div className="flex shrink-0 justify-center gap-3 sm:gap-4">
              {['#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b'].map(color => (
                  <button
                    key={color}
                    onClick={() => setPenColor(color)}
                    className={cn(
                      "w-11 h-11 sm:w-12 sm:h-12 rounded-full border-2 transition-all",
                      penColor === color && !isEraser ? "border-white scale-110" : "border-transparent scale-100 hover:scale-105"
                    )}
                    style={{ backgroundColor: color }}
                  />
              ))}
            </div>

            <div className="h-10 w-px shrink-0 bg-white/10 rounded-full" />

            {/* 画笔粗细 */}
            <div className="flex shrink-0 gap-3 items-center bg-white/5 rounded-full p-2">
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
          </div>

          <div className="h-px bg-white/10 w-full" />

          {/* Tools */}
          <div className="flex max-w-full flex-nowrap items-center justify-center gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Draw Lines */}
            <button 
              onClick={() => {
                setLineDrawingActive(!isLineDrawingActive);
                if (!isLineDrawingActive && isEraser) setIsEraser(false);
              }}
              className={cn(
                "relative group shrink-0 p-3 sm:p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                isLineDrawingActive ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]" : "text-white/60 hover:bg-white/10"
              )}
            >
              <Network className="w-7 h-7 sm:w-8 sm:h-8" />
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
                "relative group shrink-0 p-3 sm:p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                isXYZDrawingActive ? "bg-cyan-500/20 text-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.2)]" : "text-white/60 hover:bg-white/10"
              )}
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7 sm:w-8 sm:h-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
              onClick={() => {
                setSectionPlaneActive(!isSectionPlaneActive);
              }}
              className={cn(
                "relative group shrink-0 p-3 sm:p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                isSectionPlaneActive ? "bg-yellow-400/20 text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.3)]" : "text-white/60 hover:bg-white/10"
              )}
            >
              <Scan className="w-7 h-7 sm:w-8 sm:h-8" />
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                剖切面（仅线上取点）
              </span>
            </button>

            <button 
              onClick={() => toggleShowAllLengths()}
              className={cn(
                "relative group shrink-0 p-3 sm:p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                showAllLengths ? "bg-amber-500/20 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]" : "text-white/60 hover:bg-white/10"
              )}
            >
              <Ruler className="w-7 h-7 sm:w-8 sm:h-8" />
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                显示线段长度
              </span>
            </button>

            <div className="w-px h-8 shrink-0 bg-white/10 mx-1 rounded-full" />

            <button 
              onClick={() => {
                setIsEraser(!isEraser);
                if (!isEraser && isLineDrawingActive) setLineDrawingActive(false);
                if (!isEraser && isSectionPlaneActive) setSectionPlaneActive(false);
              }}
              className={cn(
                "relative group shrink-0 p-3 sm:p-4 rounded-full transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90",
                isEraser ? "bg-white/20 text-white shadow-[0_0_12px_rgba(255,255,255,0.2)]" : "text-white/60 hover:bg-white/10"
              )}
            >
              <Eraser className="w-7 h-7 sm:w-8 sm:h-8" />
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
                useARStore.getState().clearSectionDraft();
                useARStore.getState().clearSectionPlanes();
              }}
              className="relative group shrink-0 p-3 sm:p-4 rounded-full text-white/60 hover:bg-red-500/20 hover:text-red-400 transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90"
            >
              <Trash2 className="w-7 h-7 sm:w-8 sm:h-8" />
              <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-zinc-950/80 backdrop-blur-md border border-white/10 opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                清空全部
              </span>
            </button>
          </div>

          {/* 剖切工具：清空草稿点 / 清空已生成面 */}
          {isSectionPlaneActive && (
            <div className="flex max-w-full flex-nowrap items-center justify-center gap-2 pt-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button
                onClick={() => clearSectionDraft()}
                disabled={sectionDraftPoints.length === 0}
                className={cn(
                  "relative group shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-95",
                  sectionDraftPoints.length === 0
                    ? "bg-white/5 text-white/25 cursor-not-allowed"
                    : "bg-white/10 text-white/80 hover:bg-white/15 hover:text-white"
                )}
                title="清空当前未成面的取点"
              >
                <X className="w-4 h-4" />
                清空点
              </button>
              <button
                onClick={() => clearSectionPlanes()}
                disabled={sectionPlanes.length === 0}
                className={cn(
                  "relative group shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-medium transition-all active:scale-95",
                  sectionPlanes.length === 0
                    ? "bg-yellow-400/10 text-yellow-200/30 cursor-not-allowed"
                    : "bg-yellow-400/20 text-yellow-300 hover:bg-yellow-400/30 shadow-[0_0_10px_rgba(250,204,21,0.15)]"
                )}
                title="清空所有已生成的剖切面"
              >
                <Trash2 className="w-4 h-4" />
                清空面
              </button>
            </div>
          )}
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
        "relative group p-4 sm:p-5 lg:p-6 rounded-full transition-all duration-300 ease-out",
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
