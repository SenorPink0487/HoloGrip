import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import { ARErrorBoundary } from './components/ARErrorBoundary';
import { initHandLandmarker } from './lib/mediapipe';
import { handTracker, type RawHandObservation } from './lib/handTracking';
import { useARStore } from './store';
import { OverlayUI } from './components/OverlayUI';
import { MathModel } from './components/MathModel';
import { Canvas2D } from './components/Canvas2D';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { BookOpen, Trash2, ZoomIn, ZoomOut, LogOut, Layers, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { Tooltip } from './components/Tooltip';
import { CameraPermissionModal } from './components/CameraPermissionModal';
import { PromptModal } from './components/PromptModal';
import { loadWhiteboardSnapshot, saveWhiteboardSnapshot } from './lib/whiteboardSync';
import {
  createLesson,
  LessonVersionConflictError,
  listClasses,
  listLessons,
  loadLessonWhiteboard,
  openLessonWhiteboardSocket,
  saveLessonWhiteboard,
  type ClassInfo,
  type LessonInfo,
  type LiveWhiteboardEvent,
} from './lib/lessonSync';

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

// 桌面端自绘标题栏(仅 Tauri 容器内挂载)
import { isDesktop } from './lib/platform';
import { TitleBar } from './components/desktop/TitleBar';

/**
 * 离线环境光：用 three 自带的 RoomEnvironment + PMREM 生成室内环境贴图。
 *
 * 替换原来的 `<Environment preset="city" />`。drei 的 preset 会从
 * `https://raw.githack.com/pmndrs/drei-assets/...` 拉 6 张 cubemap PNG，
 * 而该域名在中国大陆经常无法访问，请求挂起后 R3F 抛错、
 * AR 画布树整体卸载，表现为页面白屏。
 *
 * RoomEnvironment 完全由 three 内置生成（无网络），
 * 反射效果接近 `city` preset，在国内网络下可稳定加载。
 */
function OfflineRoomEnvironment() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const envTexture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return target.texture;
  }, [gl]);

  useLayoutEffect(() => {
    const prev = scene.environment;
    scene.environment = envTexture;
    return () => {
      scene.environment = prev;
      envTexture.dispose();
    };
  }, [scene, envTexture]);

  return null;
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05
    }
  }
} as const;

const cardVariants = {
  hidden: { opacity: 0, scale: 0.88, y: 8 },
  show: { 
    opacity: 1, 
    scale: 1, 
    y: 0,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 24
    }
  }
} as const;

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(undefined);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  // AR 舞台容器引用：所有 AR 相关的画布 / 视频 / 光标都挂在这个 div 内，
  // 它的 clientWidth/clientHeight 与 getBoundingClientRect 是 AR 坐标系的真值。
  // 桌面端因为有 36px 自绘标题栏，window.innerHeight ≠ stage.clientHeight，
  // 必须用此 ref 替换所有原先以 window 为参考的尺寸计算，否则
  // 打包后画笔落点会相对光标整体下移（开发模式因没有标题栏才看似正常）。
  const stageRef = useRef<HTMLDivElement>(null);

  const activeTab = useARStore(state => state.activeTab);
  const updateHands = useARStore(state => state.updateHands);
  const setLoaderVisible = useARStore(state => state.setLoaderVisible);
  const theme = useARStore(state => state.theme);
  const isDark = theme === 'dark';

  const [showCameraPermissionModal, setShowCameraPermissionModal] = useState(false);
  const [cameraTrigger, setCameraTrigger] = useState(0);

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
  const pages = useARStore(state => state.pages);
  const currentPageIndex = useARStore(state => state.currentPageIndex);
  const addPage = useARStore(state => state.addPage);
  const switchPage = useARStore(state => state.switchPage);
  const removePage = useARStore(state => state.removePage);
  const saveCurrentPageWhiteboard = useARStore(state => state.saveCurrentPageWhiteboard);
  const restoreWhiteboardSnapshot = useARStore(state => state.restoreWhiteboardSnapshot);

  const whiteboardHydratedRef = useRef(false);
  const skipNextWhiteboardPersistRef = useRef(false);
  const applyingRemoteWhiteboardRef = useRef(false);
  const lessonVersionRef = useRef(0);
  const liveSocketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(`wb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`);

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<number | null>(null);
  const [selectedLessonDate, setSelectedLessonDate] = useState(todayString());
  const [classroomMenuOpen, setClassroomMenuOpen] = useState(false);
  const classroomMenuRef = useRef<HTMLDivElement>(null);
  const menuToggleButtonRef = useRef<HTMLButtonElement>(null);
  const [lessonStatus, setLessonStatus] = useState('个人白板');
  const [createLessonPromptOpen, setCreateLessonPromptOpen] = useState(false);
  const [newLessonTitle, setNewLessonTitle] = useState('');

  useEffect(() => {
    if (!classroomMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (classroomMenuRef.current?.contains(target)) return;
      if (menuToggleButtonRef.current?.contains(target)) return;
      setClassroomMenuOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setClassroomMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [classroomMenuOpen]);

  useEffect(() => {
    let cancelled = false;
    whiteboardHydratedRef.current = false;
    skipNextWhiteboardPersistRef.current = false;

    const load = selectedLessonId
      ? loadLessonWhiteboard(selectedLessonId).then((data) => {
          lessonVersionRef.current = data.version;
          setLessonStatus(`课次白板 v${data.version}`);
          return data.snapshot;
        })
      : loadWhiteboardSnapshot();

    load
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        skipNextWhiteboardPersistRef.current = true;
        restoreWhiteboardSnapshot(snapshot.pages, snapshot.currentPageIndex);
      })
      .catch((error) => {
        console.warn('Whiteboard load failed; keeping local empty board for this session.', error);
      })
      .finally(() => {
        if (!cancelled) {
          whiteboardHydratedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [restoreWhiteboardSnapshot, selectedLessonId]);

  useEffect(() => {
    if (!whiteboardHydratedRef.current) return;
    if (skipNextWhiteboardPersistRef.current) {
      skipNextWhiteboardPersistRef.current = false;
      return;
    }
    if (applyingRemoteWhiteboardRef.current) {
      applyingRemoteWhiteboardRef.current = false;
      return;
    }

    const snapshot = {
      version: 1 as const,
      pages,
      currentPageIndex,
    };

    const timer = window.setTimeout(() => {
      if (selectedLessonId) {
        saveLessonWhiteboard(selectedLessonId, snapshot, lessonVersionRef.current)
          .then((version) => {
            lessonVersionRef.current = version;
            if (liveSocketRef.current?.readyState === WebSocket.OPEN) {
              const event: LiveWhiteboardEvent = {
                type: 'snapshot_saved',
                client_id: clientIdRef.current,
                snapshot,
                version,
              };
              liveSocketRef.current.send(JSON.stringify(event));
            }
            setLessonStatus(`课次白板 v${version}`);
          })
          .catch((error) => {
            if (error instanceof LessonVersionConflictError) {
              lessonVersionRef.current = error.version;
              if (error.snapshot) {
                applyingRemoteWhiteboardRef.current = true;
                restoreWhiteboardSnapshot(error.snapshot.pages, error.snapshot.currentPageIndex);
              }
              setLessonStatus(`课次已更新 v${error.version}`);
              return;
            }
            console.warn('Lesson whiteboard save failed; current session state was kept locally.', error);
            setLessonStatus('课次白板保存失败');
          });
      } else {
        saveWhiteboardSnapshot(snapshot).catch((error) => {
          console.warn('Whiteboard save failed; current session state was kept locally.', error);
        });
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [pages, currentPageIndex, selectedLessonId, restoreWhiteboardSnapshot]);

  const getWhiteboardCanvas = () =>
    document.querySelector('canvas[data-whiteboard-canvas="true"]') as HTMLCanvasElement | null;

  const toWhiteboardPoint = (canvas: HTMLCanvasElement, point: { x: number; y: number }) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((point.x - rect.left) / rect.width) * WHITEBOARD_WIDTH,
      y: ((point.y - rect.top) / rect.height) * WHITEBOARD_HEIGHT,
    };
  };

  useEffect(() => {
    const handleLocalStroke = (event: Event) => {
      if (!selectedLessonId || liveSocketRef.current?.readyState !== WebSocket.OPEN) return;
      const liveEvent: LiveWhiteboardEvent = {
        type: 'stroke_commit',
        client_id: clientIdRef.current,
        stroke: (event as CustomEvent<LiveWhiteboardEvent['stroke']>).detail,
      };
      liveSocketRef.current.send(JSON.stringify(liveEvent));
    };

    window.addEventListener('holomath:whiteboard-local-stroke', handleLocalStroke);
    return () => window.removeEventListener('holomath:whiteboard-local-stroke', handleLocalStroke);
  }, [selectedLessonId]);

  useEffect(() => {
    const handleLocalClear = () => {
      if (!selectedLessonId || liveSocketRef.current?.readyState !== WebSocket.OPEN) return;
      const liveEvent: LiveWhiteboardEvent = {
        type: 'canvas_clear',
        client_id: clientIdRef.current,
        pageIndex: currentPageIndex,
      };
      liveSocketRef.current.send(JSON.stringify(liveEvent));
    };

    window.addEventListener('holomath:whiteboard-local-clear', handleLocalClear);
    return () => window.removeEventListener('holomath:whiteboard-local-clear', handleLocalClear);
  }, [currentPageIndex, selectedLessonId]);

  useEffect(() => {
    listClasses()
      .then((data) => {
        const all = [...data.teaching, ...data.joined];
        setClasses(all);
        if (!selectedClassId && all.length > 0) {
          setSelectedClassId(all[0].id);
        }
      })
      .catch((error) => {
        console.warn('Load classes failed', error);
      });
  }, []);

  useEffect(() => {
    if (!selectedClassId) {
      setLessons([]);
      setSelectedLessonId(null);
      return;
    }
    listLessons(selectedClassId, selectedLessonDate)
      .then((items) => {
        setLessons(items);
        if (selectedLessonId && !items.some(item => item.id === selectedLessonId)) {
          setSelectedLessonId(null);
        }
      })
      .catch((error) => {
        console.warn('Load lessons failed', error);
        setLessons([]);
      });
  }, [selectedClassId, selectedLessonDate]);

  useEffect(() => {
    liveSocketRef.current?.close();
    liveSocketRef.current = null;
    if (!selectedLessonId) {
      setLessonStatus('个人白板');
      return;
    }

    const socket = openLessonWhiteboardSocket(selectedLessonId, (event) => {
      if (event.client_id === clientIdRef.current) return;
      if (event.type === 'stroke_commit' && event.stroke) {
        window.dispatchEvent(new CustomEvent('holomath:whiteboard-remote-stroke', { detail: event.stroke }));
        return;
      }
      if (event.type === 'canvas_clear') {
        applyingRemoteWhiteboardRef.current = true;
        window.dispatchEvent(new CustomEvent('holomath:whiteboard-remote-clear', {
          detail: { pageIndex: event.pageIndex ?? useARStore.getState().currentPageIndex },
        }));
        return;
      }
      if (event.type === 'snapshot_saved') {
        if (typeof event.version === 'number') {
          lessonVersionRef.current = event.version;
        }
        setLessonStatus(`课次白板 v${lessonVersionRef.current}`);
        return;
      }
      if (!event.snapshot) return;
      applyingRemoteWhiteboardRef.current = true;
      if (typeof event.version === 'number') {
        lessonVersionRef.current = event.version;
      }
      restoreWhiteboardSnapshot(event.snapshot.pages, event.snapshot.currentPageIndex);
      setLessonStatus(`收到协作更新 v${lessonVersionRef.current}`);
    });
    liveSocketRef.current = socket;
    if (socket) {
      socket.onopen = () => setLessonStatus(`课次白板 v${lessonVersionRef.current}`);
      socket.onclose = () => setLessonStatus('实时连接已断开');
      socket.onerror = () => setLessonStatus('实时连接异常');
    }

    return () => {
      socket?.close();
    };
  }, [selectedLessonId, restoreWhiteboardSnapshot]);

  const handleCreateLesson = () => {
    if (!selectedClassId) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    setNewLessonTitle(`课堂 ${month}月${date}日 ${hours}:${minutes}`);
    setCreateLessonPromptOpen(true);
  };

  const handleConfirmCreateLesson = async () => {
    if (!selectedClassId) return;
    const title = newLessonTitle.trim();
    if (!title) return;
    setCreateLessonPromptOpen(false);
    try {
      const lessonId = await createLesson(selectedClassId, title, selectedLessonDate);
      const items = await listLessons(selectedClassId, selectedLessonDate);
      setLessons(items);
      setSelectedLessonId(lessonId);
    } catch (error) {
      console.warn('Create lesson failed', error);
      alert('创建课次失败。请确认你是该班级教师。');
    }
  };

  // 1. 沿边画直线的回调 (由 Ruler 和 TriangleRuler 触发)
  const drawLineOnWhiteboard = (p1: { x: number; y: number }, p2: { x: number; y: number }) => {
    const canvas = getWhiteboardCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    const start = toWhiteboardPoint(canvas, p1);
    const end = toWhiteboardPoint(canvas, p2);
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
    saveCurrentPageWhiteboard(canvas.toDataURL(), { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
  };

  // 2. 印刻角度或圆弧的回调 (由 Protractor 和 Compass 触发)
  const drawArcOnWhiteboard = (
    center: { x: number; y: number },
    radius: number,
    startAngle: number,
    endAngle: number
  ) => {
    const canvas = getWhiteboardCanvas();
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    const logicalCenter = toWhiteboardPoint(canvas, center);
    const rect = canvas.getBoundingClientRect();
    const logicalRadius = radius * (WHITEBOARD_WIDTH / rect.width);
    ctx.arc(logicalCenter.x, logicalCenter.y, logicalRadius, startAngle, endAngle, startAngle > endAngle);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penThickness;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
    saveCurrentPageWhiteboard(canvas.toDataURL(), { width: WHITEBOARD_WIDTH, height: WHITEBOARD_HEIGHT });
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

        // 1) 异步返回时若 effect 已被卸载（用户已退出 AR / 切 tab），
        //    立刻释放轨道，避免摄像头被占用且不会误初始化 vision。
        if (!active || !videoRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const video = videoRef.current;
        // 先清掉残留 srcObject，让浏览器把 video 重置为 HAVE_NOTHING，
        // 否则新 stream 挂上去时 readyState 可能保留上一轮的高位
        // 而 loadeddata 不再触发，导致 initVision 不被调用 —— 表象正是
        // "首次进 AR 加载完却没真正进去，第二次才正常"。
        if (video.srcObject) {
          (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
          video.srcObject = null;
        }
        video.srcObject = stream;

        // 2) 用一次性 loadeddata 监听器，避免 React 重挂载导致的多次绑定。
        //    若 video 已经就绪（readyState >= HAVE_CURRENT_DATA），直接走。
        //    再额外加一个 800ms 的兜底定时器：极端情况下 WebView2 不发
        //    loadeddata 也能让 initVision 跑起来，避免 AR 永远卡在 loader。
        let onReadyFired = false;
        const fireOnce = () => {
          if (onReadyFired) return;
          onReadyFired = true;
          video.removeEventListener("loadeddata", fireOnce);
          clearTimeout(fallbackTimer);
          if (active) initVision();
        };
        const fallbackTimer = setTimeout(() => {
          if (!onReadyFired && active) {
            console.warn("loadeddata not fired in 800ms, force initVision");
            fireOnce();
          }
        }, 800);
        if (video.readyState >= 2) {
          fireOnce();
        } else {
          video.addEventListener("loadeddata", fireOnce);
        }

        // 3) 显式调用 play()。Tauri WebView2 在摄像头权限刚被授予的瞬间，
        //    autoPlay 偶发不触发，导致首次进入 AR 模块"加载完成却没进入"。
        //    play() 在用户已点击允许后是被允许的，且若已在播放会安静地 resolve。
        try {
          await video.play();
        } catch (playErr) {
          // 罕见：tab 切换太快或 srcObject 已被替换；下一次 effect 会重试。
          console.warn("video.play() failed, will retry on next entry", playErr);
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

            // ⚠️ 必须使用 AR 舞台容器自身的尺寸，而非 window.innerWidth/innerHeight。
            // 桌面端 Tauri 自绘标题栏占去顶部 36px，二者并不相等。
            // 用 window 高度算出的 pixelY 会把整套坐标系上移 36px，
            // 在打包安装后表现为：画笔写出的笔迹相对光标整体偏移。
            const stage = stageRef.current;
            const stageW = stage?.clientWidth ?? window.innerWidth;
            const stageH = stage?.clientHeight ?? window.innerHeight;

            const videoAspect = 1280 / 720;
            const screenAspect = stageW / stageH;
            let renderWidth = stageW;
            let renderHeight = stageH;
            let offsetX = 0;
            let offsetY = 0;
            if (screenAspect > videoAspect) {
              renderHeight = stageW / videoAspect;
              offsetY = (renderHeight - stageH) / 2;
            } else {
              renderWidth = stageH * videoAspect;
              offsetX = (renderWidth - stageW) / 2;
            }
            const pixelX = videoX * renderWidth - offsetX;
            const pixelY = videoY * renderHeight - offsetY;
            const ndcX = (pixelX / stageW) * 2 - 1;
            const ndcY = -(pixelY / stageH) * 2 + 1;

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
          // pixelX/pixelY 是 AR 舞台局部坐标，但 elementFromPoint / MouseEvent
          // 的 clientX/Y 都是 viewport 坐标系。桌面端 stage 顶部偏 36px（标题栏），
          // 必须把舞台相对视口的偏移加回去，否则 AR 顶部一带的按钮永远点不到。
          const stage = stageRef.current;
          const rect = stage?.getBoundingClientRect();
          const cx = (rect?.left ?? 0) + x;
          const cy = (rect?.top ?? 0) + y;
          const el = document.elementFromPoint(cx, cy);
          if (!el) return;
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
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

    const hasPermission = localStorage.getItem('camera_permission_granted') === 'true';
    if (!hasPermission) {
      setShowCameraPermissionModal(true);
      setLoaderVisible(false);
    } else {
      setupCamera();
    }

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
  }, [updateHands, setLoaderVisible, activeTab, cameraTrigger]);

  const handleConfirmPermission = () => {
    localStorage.setItem('camera_permission_granted', 'true');
    setShowCameraPermissionModal(false);
    setLoaderVisible(true);
    setCameraTrigger(prev => prev + 1);
  };

  const handleCancelPermission = () => {
    setShowCameraPermissionModal(false);
    useARStore.getState().setActiveTab('whiteboard');
  };


  return (
    <div
      className={[
        'relative w-full h-screen overflow-hidden bg-[#f4f6fa] dark:bg-[#121316]',
        'select-none text-zinc-800 dark:text-white transition-colors duration-500',
        // 始终用 flex column,这样内层 flex-1 在 web 与桌面端都能撑满高度;
        // 桌面端额外加圆角,让 OS 阴影显出来
        'flex flex-col',
        isDesktop ? 'rounded-xl' : '',
      ].join(' ')}
    >
      {/* 桌面端自绘标题栏(web 端 isDesktop=false,不渲染) */}
      {isDesktop && <TitleBar />}

      <div ref={stageRef} className="relative flex-1 min-h-0 overflow-hidden">
      {(activeTab === 'whiteboard' || activeTab === 'function') && (
        <motion.button
          ref={menuToggleButtonRef}
          type="button"
          onClick={() => setClassroomMenuOpen(open => !open)}
          whileHover={{ scale: 1.01, y: -1 }}
          whileTap={{ scale: 0.99, y: 0 }}
          className={cn(
            "absolute left-8 top-8 z-[65] flex h-12 items-center gap-3 rounded-full border px-4 shadow-xl backdrop-blur-md transition-all duration-300 focus:outline-none cursor-pointer",
            classroomMenuOpen
              ? "border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:border-cyan-400/40 dark:from-cyan-400/15 dark:to-blue-400/15 dark:text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.15)]"
              : "border-black/5 bg-white/70 text-zinc-800 hover:bg-white dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800"
          )}
          title="课堂与页面选择"
          aria-label="课堂与页面选择"
          aria-expanded={classroomMenuOpen}
        >
          <motion.div
            animate={{ 
              scale: classroomMenuOpen ? 1.08 : 1,
              rotate: classroomMenuOpen ? -5 : 0 
            }}
            className="flex items-center justify-center text-current opacity-90"
          >
            <BookOpen className="w-[18px] h-[18px]" strokeWidth={2.2} />
          </motion.div>

          <div className={cn(
            "h-4 w-px transition-colors duration-300",
            classroomMenuOpen ? "bg-cyan-500/20 dark:bg-cyan-400/30" : "bg-zinc-300 dark:bg-zinc-700"
          )} />

          <div className="flex items-center gap-1.5 font-semibold text-sm">
            <motion.div
              animate={{ 
                rotate: classroomMenuOpen ? 15 : 0,
                scale: classroomMenuOpen ? 1.1 : 1
              }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              className="flex items-center justify-center text-current opacity-80"
            >
              <Layers className="w-4 h-4" strokeWidth={2.2} />
            </motion.div>
            <span className="tabular-nums">
              {currentPageIndex + 1} / {pages.length}
            </span>
          </div>
        </motion.button>
      )}
      {(activeTab === 'whiteboard' || activeTab === 'function') && classroomMenuOpen && (
        <div
          ref={classroomMenuRef}
          className={cn(
            "absolute top-[92px] left-8 z-[60] flex flex-col gap-3 rounded-3xl border p-4 text-sm shadow-2xl backdrop-blur-xl transition-all duration-200",
            "w-[min(48rem,calc(100vw-4rem))]",
            isDark 
              ? "border-white/10 bg-zinc-900/90 text-zinc-100" 
              : "border-black/5 bg-white/90 text-zinc-800"
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedClassId ?? ''}
              onChange={(e) => {
                setSelectedClassId(e.target.value ? Number(e.target.value) : null);
                setSelectedLessonId(null);
              }}
              className="h-9 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 px-3 outline-none text-sm transition-all focus:border-cyan-500/50 dark:focus:border-cyan-400/50 w-full sm:w-auto"
              title="选择班级"
            >
              {classes.length === 0 && <option value="">暂无班级</option>}
              {classes.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>

            <input
              type="date"
              value={selectedLessonDate}
              onChange={(e) => {
                setSelectedLessonDate(e.target.value || todayString());
                setSelectedLessonId(null);
              }}
              className="h-9 rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 px-3 outline-none text-sm transition-all focus:border-cyan-500/50 dark:focus:border-cyan-400/50 w-full sm:w-auto"
              title="按日期查看课次"
            />

            <select
              value={selectedLessonId ?? ''}
              onChange={(e) => setSelectedLessonId(e.target.value ? Number(e.target.value) : null)}
              className="h-9 min-w-[140px] rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 px-3 outline-none text-sm transition-all focus:border-cyan-500/50 dark:focus:border-cyan-400/50 w-full sm:w-auto"
              title="选择课次"
            >
              <option value="">个人白板</option>
              {lessons.map(item => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>

            <button
              onClick={handleCreateLesson}
              disabled={!selectedClassId}
              className="h-9 rounded-xl bg-cyan-600 px-4 font-medium text-white transition-all hover:bg-cyan-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 w-full sm:w-auto"
              title="创建课次"
            >
              创建课次
            </button>
          </div>

          <div className="h-px w-full bg-black/5 dark:bg-white/10 my-1" />

          <div className="flex items-center gap-2">
            <Tooltip content="上一页" position="top">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => switchPage(currentPageIndex - 1)}
                disabled={currentPageIndex === 0}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  currentPageIndex === 0
                    ? "cursor-not-allowed opacity-30"
                    : (isDark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-black/5 hover:text-zinc-950")
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </motion.button>
            </Tooltip>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="flex max-w-[min(38rem,calc(100vw-12rem))] gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {pages.map((page, index) => {
                const isActive = index === currentPageIndex;
                const geometryCount =
                  (page.geometry?.points?.length ?? 0) +
                  (page.geometry?.segments?.length ?? 0) +
                  (page.geometry?.circles?.length ?? 0);
                const hasContent = Boolean(page.whiteboardDataUrl) || geometryCount > 0;

                return (
                  <motion.button
                    variants={cardVariants}
                    whileTap={{ scale: 0.96 }}
                    key={page.id}
                    onClick={() => switchPage(index)}
                    className={cn(
                      "group relative shrink-0 rounded-[1.15rem] p-1.5 text-left transition-all duration-200",
                      isActive
                        ? (isDark ? "bg-cyan-400/18 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_12px_34px_rgba(8,145,178,0.24)]" : "bg-cyan-500/12 shadow-[0_0_0_1px_rgba(8,145,178,0.28),0_12px_30px_rgba(8,145,178,0.16)]")
                        : (isDark ? "hover:bg-white/8" : "hover:bg-black/5")
                    )}
                    title={`第 ${index + 1} 页`}
                  >
                    <div className={cn(
                      "relative h-[3.8rem] w-[6.5rem] overflow-hidden rounded-xl border",
                      isActive
                        ? (isDark ? "border-cyan-300/65" : "border-cyan-500/55")
                        : (isDark ? "border-white/10" : "border-black/10")
                    )}>
                      <div className={cn("absolute inset-0", isDark ? "bg-zinc-950" : "bg-zinc-50")}>
                        <div
                          className={cn(
                            "absolute inset-0 opacity-60",
                            isDark
                              ? "bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)]"
                              : "bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)]"
                          )}
                          style={{ backgroundSize: '18px 18px' }}
                        />
                      </div>
                      {page.whiteboardDataUrl && (
                        <img
                          src={page.whiteboardDataUrl}
                          alt=""
                          className={cn("absolute inset-0 h-full w-full object-cover", !isDark && "invert hue-rotate-180")}
                          draggable={false}
                        />
                      )}
                      {!hasContent && (
                        <div className={cn("absolute inset-0 flex items-center justify-center text-[11px] font-medium", isDark ? "text-zinc-600" : "text-zinc-400")}>
                          空白
                        </div>
                      )}
                      {geometryCount > 0 && (
                        <div className={cn("absolute bottom-1.5 right-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-md", isDark ? "bg-zinc-950/70 text-cyan-200" : "bg-white/75 text-cyan-700")}>
                          {geometryCount}
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between px-1">
                      <span className={cn("text-[11px] font-semibold", isActive ? (isDark ? "text-cyan-200" : "text-cyan-700") : (isDark ? "text-zinc-400" : "text-zinc-500"))}>
                        {index + 1}
                      </span>
                      {isActive && pages.length > 1 && (
                        <Tooltip content="删除当前页" position="top">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => {
                              event.stopPropagation();
                              if (confirm('确定要删除当前页面吗？')) removePage(currentPageIndex);
                            }}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.stopPropagation();
                              if (confirm('确定要删除当前页面吗？')) removePage(currentPageIndex);
                            }}
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full opacity-80 transition-all hover:opacity-100 cursor-pointer",
                              isDark ? "text-rose-300 hover:bg-rose-400/15" : "text-rose-500 hover:bg-rose-500/10"
                            )}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </span>
                        </Tooltip>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>

            <Tooltip content="下一页" position="top">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => switchPage(currentPageIndex + 1)}
                disabled={currentPageIndex === pages.length - 1}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  currentPageIndex === pages.length - 1
                    ? "cursor-not-allowed opacity-30"
                    : (isDark ? "text-zinc-300 hover:bg-white/10 hover:text-white" : "text-zinc-600 hover:bg-black/5 hover:text-zinc-950")
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </motion.button>
            </Tooltip>
            <Tooltip content="添加新页面" position="top">
              <motion.button
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                onClick={addPage}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all",
                  isDark ? "bg-cyan-400/15 text-cyan-300 hover:bg-cyan-400/25" : "bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/15"
                )}
              >
                <Plus className="h-4 w-4" />
              </motion.button>
            </Tooltip>
          </div>
        </div>
      )}
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
          <ARErrorBoundary>
            <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
              <ambientLight intensity={0.5} />
              <spotLight position={[10, 10, 10]} intensity={1.5} angle={0.2} penumbra={1} castShadow />
              <pointLight position={[-10, -10, -10]} intensity={0.5} />

              {/* 离线环境贴图：替换原 <Environment preset="city" />，避免国内
                  网络访问 raw.githack.com 失败导致 AR 模块白屏。
                  注意：原先内嵌于 <Environment> 中的 <Lightformer /> 是
                  专为 EnvironmentPortal 提供"烤光"用的白色面片，脱离宿主后
                  会直接渲染在主场景里变成白色矩形，所以这里一并删除。
                  RoomEnvironment 自带的间接光已足够撑起金属/玻璃材质的反射感。 */}
              <OfflineRoomEnvironment />

              <MathModel />
            </Canvas>
          </ARErrorBoundary>
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

      <AnimatePresence>
        {showCameraPermissionModal && (
          <CameraPermissionModal
            isOpen={showCameraPermissionModal}
            onClose={handleCancelPermission}
            onConfirm={handleConfirmPermission}
          />
        )}
        <PromptModal
          isOpen={createLessonPromptOpen}
          title="请输入课次标题"
          value={newLessonTitle}
          onChange={setNewLessonTitle}
          onConfirm={handleConfirmCreateLesson}
          onCancel={() => setCreateLessonPromptOpen(false)}
        />
      </AnimatePresence>
    </div>
  );
}
