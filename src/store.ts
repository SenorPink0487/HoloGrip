import { create } from 'zustand';
import type { Vector2 } from 'three';
import type { AIVertex } from './lib/gemini';

export type MathShape = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid';
export type AppTab = 'launcher' | 'whiteboard' | 'function' | 'calculator3d' | 'ar_3d' | 'physics' | 'chem' | 'rocket' | 'pool';

// `holomath.html` 始终保持为原有数学白板入口；启动器使用独立的
// `launcher.html` 入口，避免桌面壳替代原应用页面。
const isLauncherEntry =
  typeof window !== 'undefined' &&
  window.location.pathname.endsWith('/launcher.html');

export interface UserProfile {
  name: string;
  avatar: string;
  role: string;
  email: string;
}

export interface HandState {
  cursor: Vector2;
  pixelCursor: { x: number, y: number };
  isPinched: boolean;
  isVisible: boolean;
  pinchDistance: number;
}

export interface Point3D {
  x: number; y: number; z: number;
}

/**
 * 用户通过 AI 识别生成的自定义模型
 */
export interface CustomModel {
  id: string;
  name: string;
  vertices: AIVertex[];   // 带标签的顶点
  faces: number[][];      // 面索引
  edges: number[][];      // 棱边索引对
}

/**
 * 写在 3D 模型表面的笔迹（一笔由多个采样点组成，存于模型局部坐标系，
 * 因此模型旋转/平移/缩放时笔迹会跟随）。
 */
export interface SurfaceStroke {
  id: string;
  points: Point3D[];
  color: string;
  thickness: number;
}

/**
 * 辅助线/连线：支持延伸到模型外、长度标注等
 */
export interface AuxiliaryLine {
  id: string;
  p1: Point3D;
  p2: Point3D;
  isAuxiliary: boolean;   // true=辅助线(虚线,可延伸到模型外)
  extendBefore: number;   // 向p1方向延伸的长度(局部坐标单位)
  extendAfter: number;    // 向p2方向延伸的长度(局部坐标单位)
  showLength: boolean;    // 是否显示长度标注
}

/**
 * 剖切面：按顺序拾取若干点后，用半透明面把它们连成多边形截面
 */
export interface SectionPlane {
  id: string;
  points: Point3D[];  // 按拾取顺序排列的多边形顶点（局部坐标）
  color: string;
}

export interface PageData {
  id: string;
  whiteboardDataUrl: string | null;
  boardWidth?: number;
  boardHeight?: number;
  geometry: {
    points: any[];
    segments: any[];
    circles: any[];
  };
}

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;

class StoreVector2 {
  constructor(public x: number, public y: number) {}

  copy(value: { x: number; y: number }) {
    this.x = value.x;
    this.y = value.y;
    return this;
  }

  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    return this;
  }

  clone() {
    return new StoreVector2(this.x, this.y) as unknown as Vector2;
  }
}

const createHandCursor = () => new StoreVector2(-999, -999) as unknown as Vector2;

interface ARState {
  leftHand: HandState;
  rightHand: HandState;
  activeModel: MathShape | null;
  activeCustomModelId: string | null;  // 当前选中的自定义模型 ID
  customModels: CustomModel[];         // 所有自定义模型列表
  isLoaderVisible: boolean;
  isAnalyzing: boolean;                // AI 解析中的 loading 状态
  modelScale: number;
  
  activeTab: AppTab;
  isModelPanelOpen: boolean;
  isPenPanelOpen: boolean;
  isPenActive: boolean;
  penColor: string;
  penThickness: number;
  isEraser: boolean;
  triggerClearCanvas: number;
  interactMode: 'draw' | 'interact';
  
  isLineDrawingActive: boolean;
  isXYZDrawingActive: boolean;
  isSectionPlaneActive: boolean;   // 剖切面：多点拾取后成面
  showAllLengths: boolean;         // 全局开关：显示所有线段长度

  presetDimensions: Record<MathShape, Record<string, number>>;

  modelLines: AuxiliaryLine[];
  activeLineStart: Point3D | null;
  snappedPointInfo: string | null;

  // 剖切面：草稿点 + 已完成的截面
  sectionDraftPoints: Point3D[];
  sectionPlanes: SectionPlane[];

  // 写在模型表面的笔迹（局部坐标系，跟随模型变换）
  surfaceStrokes: SurfaceStroke[];
  // 当前一笔正在落到模型表面（由 MathModel useFrame 维护）
  // Canvas2D 用它来暂停 2D 写字，避免在表面写字时同时画在 2D 画布上。
  isWritingOnSurface: boolean;

  // 新增多页面管理状态
  pages: PageData[];
  currentPageIndex: number;
  whiteboardRestoreVersion: number;
  
  // 新增多窗口与工具状态管理
  isToolboxOpen: boolean;
  focusedWindow: string | null;

  showRuler: boolean;
  showTriangleRuler: boolean;
  showProtractor: boolean;
  showCompass: boolean;

  updateHands: (left: Partial<HandState>, right: Partial<HandState>) => void;
  setActiveModel: (m: MathShape | null) => void;
  setActiveCustomModel: (id: string | null) => void;
  addCustomModel: (model: CustomModel) => void;
  removeCustomModel: (id: string) => void;
  setLoaderVisible: (v: boolean) => void;
  setAnalyzing: (v: boolean) => void;
  setModelScale: (s: number) => void;
  
  setActiveTab: (t: AppTab) => void;
  setModelPanelOpen: (o: boolean) => void;
  setPenPanelOpen: (o: boolean) => void;
  setPenActive: (a: boolean) => void;
  setPenColor: (c: string) => void;
  setPenThickness: (t: number) => void;
  setIsEraser: (e: boolean) => void;
  clearCanvas: () => void;
  setInteractMode: (m: 'draw' | 'interact') => void;
  
  setLineDrawingActive: (a: boolean) => void;
  setXYZDrawingActive: (a: boolean) => void;
  setSectionPlaneActive: (a: boolean) => void;
  toggleShowAllLengths: () => void;
  updatePresetDimension: (shape: MathShape, key: string, value: number) => void;

  addModelLine: (p1: Point3D, p2: Point3D, isAuxiliary?: boolean) => void;
  setActiveLineStart: (p: Point3D | null) => void;
  clearModelLines: () => void;
  removeModelLine: (index: number) => void;
  updateLineExtension: (index: number, before: number, after: number) => void;
  toggleLineLength: (index: number) => void;
  toggleLineAuxiliary: (index: number) => void;
  setSnappedPointInfo: (info: string | null) => void;

  addSectionDraftPoint: (p: Point3D) => void;
  undoSectionDraftPoint: () => void;
  clearSectionDraft: () => void;
  completeSectionPlane: (color?: string) => boolean;
  removeSectionPlane: (id: string) => void;
  clearSectionPlanes: () => void;

  // 模型表面笔迹
  beginSurfaceStroke: (color: string, thickness: number) => string;
  appendSurfaceStrokePoint: (id: string, p: Point3D) => void;
  endSurfaceStroke: () => void;
  clearSurfaceStrokes: () => void;
  setWritingOnSurface: (v: boolean) => void;

  // 多页面管理方法
  addPage: () => void;
  removePage: (index: number) => void;
  switchPage: (index: number) => void;
  saveCurrentPageWhiteboard: (dataUrl: string | null, size?: { width: number; height: number }) => void;
  clearPageWhiteboard: (pageIndex: number) => void;
  saveCurrentPageGeometry: (points: any[], segments: any[], circles: any[]) => void;
  restoreWhiteboardSnapshot: (pages: PageData[], currentPageIndex: number) => void;

  // 控制方法
  setToolboxOpen: (o: boolean) => void;
  setFocusedWindow: (id: string | null) => void;

  setShowRuler: (s: boolean) => void;
  setShowTriangleRuler: (s: boolean) => void;
  setShowProtractor: (s: boolean) => void;
  setShowCompass: (s: boolean) => void;

  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;

  // macOS 桌面端 Splash & 认证状态
  currentUser: UserProfile | null;
  isLoggedIn: boolean;
  isLocked: boolean;
  isSplashActive: boolean;

  setCurrentUser: (user: UserProfile | null) => void;
  login: (username?: string) => void;
  logout: () => void;
  lockScreen: () => void;
  unlockScreen: () => void;
  dismissSplash: () => void;
}

export const useARStore = create<ARState>((set) => ({
  leftHand: { cursor: createHandCursor(), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  rightHand: { cursor: createHandCursor(), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  activeModel: null,
  activeCustomModelId: null,
  customModels: [],
  isLoaderVisible: false,
  isAnalyzing: false,
  modelScale: 2.5,

  activeTab: isLauncherEntry ? 'launcher' : 'whiteboard',

  isModelPanelOpen: false,
  isPenPanelOpen: false,
  isPenActive: false,
  penColor: '#ffffff',
  penThickness: 3,
  isEraser: false,
  triggerClearCanvas: 0,
  interactMode: 'draw',
  
  isLineDrawingActive: false,
  isXYZDrawingActive: false,
  isSectionPlaneActive: false,
  showAllLengths: false,

  presetDimensions: {
    cube: { size: 10 },
    sphere: { radius: 10 },
    cylinder: { radius: 10, height: 20 },
    cone: { radius: 10, height: 20 },
    pyramid: { radius: 10 },
  },

  modelLines: [],
  activeLineStart: null,
  snappedPointInfo: null,

  sectionDraftPoints: [],
  sectionPlanes: [],

  surfaceStrokes: [],
  isWritingOnSurface: false,

  pages: [{
    id: 'page_0',
    whiteboardDataUrl: null,
    boardWidth: WHITEBOARD_WIDTH,
    boardHeight: WHITEBOARD_HEIGHT,
    geometry: { points: [], segments: [], circles: [] },
  }],
  currentPageIndex: 0,
  whiteboardRestoreVersion: 0,

  isToolboxOpen: false,
  focusedWindow: null,

  showRuler: false,
  showTriangleRuler: false,
  showProtractor: false,
  showCompass: false,

  theme: 'dark',

  updateHands: (left, right) => set((state) => {
    // 注意：必须返回**新的**leftHand/rightHand对象引用，否则 zustand 浅比较会认为
    // 状态未变化，从而不会触发 useARStore.subscribe(...) 回调。
    // Canvas2D 中的写字逻辑完全依赖 subscribe 触发，因此原地 mutate 会导致
    // “空间 AR 下无法写字” 的 bug。
    const nextLeftCursor = state.leftHand.cursor;
    if (left.cursor) nextLeftCursor.copy(left.cursor);

    const nextRightCursor = state.rightHand.cursor;
    if (right.cursor) nextRightCursor.copy(right.cursor);

    const nextLeftHand: HandState = {
      cursor: nextLeftCursor,
      pixelCursor: left.pixelCursor ?? state.leftHand.pixelCursor,
      isPinched: left.isPinched ?? state.leftHand.isPinched,
      isVisible: left.isVisible ?? state.leftHand.isVisible,
      pinchDistance: left.pinchDistance ?? state.leftHand.pinchDistance,
    };

    const nextRightHand: HandState = {
      cursor: nextRightCursor,
      pixelCursor: right.pixelCursor ?? state.rightHand.pixelCursor,
      isPinched: right.isPinched ?? state.rightHand.isPinched,
      isVisible: right.isVisible ?? state.rightHand.isVisible,
      pinchDistance: right.pinchDistance ?? state.rightHand.pinchDistance,
    };

    return { leftHand: nextLeftHand, rightHand: nextRightHand };
  }),
  setActiveModel: (m) => set({ activeModel: m, activeCustomModelId: null, modelScale: 2.5, modelLines: [] as AuxiliaryLine[], activeLineStart: null, surfaceStrokes: [], sectionDraftPoints: [], sectionPlanes: [] }),
  setActiveCustomModel: (id) => set({ activeCustomModelId: id, activeModel: null, modelScale: 2.5, modelLines: [] as AuxiliaryLine[], activeLineStart: null, surfaceStrokes: [], sectionDraftPoints: [], sectionPlanes: [] }),
  addCustomModel: (model) => set((state) => ({
    customModels: [...state.customModels, model],
    activeCustomModelId: model.id,
    activeModel: null,
    modelScale: 2.5,
    modelLines: [] as AuxiliaryLine[],
    activeLineStart: null,
    surfaceStrokes: [],
    sectionDraftPoints: [],
    sectionPlanes: [],
  })),
  removeCustomModel: (id) => set((state) => ({
    customModels: state.customModels.filter(m => m.id !== id),
    activeCustomModelId: state.activeCustomModelId === id ? null : state.activeCustomModelId,
  })),
  setLoaderVisible: (v) => set({ isLoaderVisible: v }),
  setAnalyzing: (v) => set({ isAnalyzing: v }),
  setModelScale: (s) => set({ modelScale: s }),
  
  setActiveTab: (t) => set({ activeTab: t }),
  setModelPanelOpen: (o) => set({ isModelPanelOpen: o }),
  setPenPanelOpen: (o) => set({ isPenPanelOpen: o }),
  // 画笔与连线/剖切互斥：启用画笔时自动关闭其它 3D 绘制模式，避免捏合手势同时触发多种行为
  setPenActive: (a) => set(() => a
    ? {
        isPenActive: true,
        isLineDrawingActive: false,
        isXYZDrawingActive: false,
        isSectionPlaneActive: false,
        isEraser: false,
        sectionDraftPoints: [] as Point3D[],
      }
    : { isPenActive: false }
  ),
  setPenColor: (c) => set({ penColor: c, isEraser: false }),
  setPenThickness: (t) => set({ penThickness: t }),
  setIsEraser: (e) => set(() => e
    ? {
        isEraser: true,
        isPenActive: false,
        isLineDrawingActive: false,
        isXYZDrawingActive: false,
        isSectionPlaneActive: false,
        sectionDraftPoints: [] as Point3D[],
      }
    : { isEraser: false }
  ),
  clearCanvas: () => set((state) => ({ triggerClearCanvas: state.triggerClearCanvas + 1 })),
  setInteractMode: (m) => set({ interactMode: m }),

  // 启用连线时同步关闭画笔 / XYZ / 剖切；面板保持打开，用户仍可在面板内切换工具
  setLineDrawingActive: (a) => set(() => a
    ? {
        isLineDrawingActive: true,
        isPenActive: false,
        isXYZDrawingActive: false,
        isSectionPlaneActive: false,
        isEraser: false,
        activeLineStart: null,
        sectionDraftPoints: [] as Point3D[],
      }
    : { isLineDrawingActive: false, activeLineStart: null }
  ),
  setXYZDrawingActive: (a) => set(() => a
    ? {
        isXYZDrawingActive: true,
        isLineDrawingActive: false,
        isPenActive: false,
        isSectionPlaneActive: false,
        isEraser: false,
        activeLineStart: null,
        sectionDraftPoints: [] as Point3D[],
      }
    : { isXYZDrawingActive: false, activeLineStart: null }
  ),
  setSectionPlaneActive: (a) => set(() => a
    ? {
        isSectionPlaneActive: true,
        isPenActive: false,
        isLineDrawingActive: false,
        isXYZDrawingActive: false,
        isEraser: false,
        activeLineStart: null,
      }
    : { isSectionPlaneActive: false, sectionDraftPoints: [] as Point3D[] }
  ),
  toggleShowAllLengths: () => set((state) => ({ showAllLengths: !state.showAllLengths })),
  
  updatePresetDimension: (shape, key, value) => set((state) => ({
    presetDimensions: {
      ...state.presetDimensions,
      [shape]: {
        ...state.presetDimensions[shape],
        [key]: value
      }
    }
  })),

  addModelLine: (p1, p2, isAuxiliary = false) => set((state) => {
    const line: AuxiliaryLine = {
      id: `ml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      p1, p2,
      isAuxiliary,
      extendBefore: 0,
      extendAfter: 0,
      showLength: true,
    };
    return { modelLines: [...state.modelLines, line] };
  }),
  setActiveLineStart: (p) => set({ activeLineStart: p }),
  clearModelLines: () => set({ modelLines: [] as AuxiliaryLine[], activeLineStart: null }),
  removeModelLine: (index) => set((state) => ({ modelLines: state.modelLines.filter((_, i) => i !== index) })),
  updateLineExtension: (index, before, after) => set((state) => ({
    modelLines: state.modelLines.map((l, i) => i === index ? { ...l, extendBefore: before, extendAfter: after } : l),
  })),
  toggleLineLength: (index) => set((state) => ({
    modelLines: state.modelLines.map((l, i) => i === index ? { ...l, showLength: !l.showLength } : l),
  })),
  toggleLineAuxiliary: (index) => set((state) => ({
    modelLines: state.modelLines.map((l, i) => i === index ? { ...l, isAuxiliary: !l.isAuxiliary } : l),
  })),
  setSnappedPointInfo: (info) => set({ snappedPointInfo: info }),

  addSectionDraftPoint: (p) => set((state) => {
    const draft = state.sectionDraftPoints;
    if (draft.length > 0) {
      const last = draft[draft.length - 1];
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const dz = p.z - last.z;
      // 忽略与上一点几乎重合的重复拾取
      if (dx * dx + dy * dy + dz * dz < 1e-6) return state;
    }
    return { sectionDraftPoints: [...draft, p] };
  }),
  undoSectionDraftPoint: () => set((state) => ({
    sectionDraftPoints: state.sectionDraftPoints.slice(0, -1),
  })),
  clearSectionDraft: () => set({ sectionDraftPoints: [] }),
  completeSectionPlane: (color) => {
    let ok = false;
    set((state) => {
      if (state.sectionDraftPoints.length < 3) return state;
      ok = true;
      const plane: SectionPlane = {
        id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        points: [...state.sectionDraftPoints],
        // 剖切面固定黄色（color 参数忽略，保留签名兼容）
        color: '#facc15',
      };
      // 成功生成一面后自动退出剖切模式，避免继续误取点
      return {
        sectionPlanes: [...state.sectionPlanes, plane],
        sectionDraftPoints: [] as Point3D[],
        isSectionPlaneActive: false,
        snappedPointInfo: null,
      };
    });
    return ok;
  },
  removeSectionPlane: (id) => set((state) => ({
    sectionPlanes: state.sectionPlanes.filter((p) => p.id !== id),
  })),
  /** 仅清空已生成的剖切面，不影响草稿点 */
  clearSectionPlanes: () => set({ sectionPlanes: [] }),

  beginSurfaceStroke: (color, thickness) => {
    const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({
      surfaceStrokes: [...state.surfaceStrokes, { id, points: [], color, thickness }],
    }));
    return id;
  },
  appendSurfaceStrokePoint: (id, p) => set((state) => ({
    surfaceStrokes: state.surfaceStrokes.map((s) =>
      s.id === id ? { ...s, points: [...s.points, p] } : s
    ),
  })),
  endSurfaceStroke: () => {
    // 收尾时不做特殊处理；保留 hook 以便日后做笔尾平滑或合并
  },
  clearSurfaceStrokes: () => set({ surfaceStrokes: [] }),
  setWritingOnSurface: (v) => set({ isWritingOnSurface: v }),

  addPage: () => set((state) => {
    const newPage: PageData = {
      id: `page_${Date.now()}`,
      whiteboardDataUrl: null,
      boardWidth: WHITEBOARD_WIDTH,
      boardHeight: WHITEBOARD_HEIGHT,
      geometry: { points: [], segments: [], circles: [] },
    };
    return {
      pages: [...state.pages, newPage],
      currentPageIndex: state.pages.length,
      triggerClearCanvas: state.triggerClearCanvas + 1, // trigger clear for new page
    };
  }),
  removePage: (index) => set((state) => {
    if (state.pages.length <= 1) return state; // don't remove last page
    const newPages = state.pages.filter((_, i) => i !== index);
    const newIndex = Math.min(state.currentPageIndex, newPages.length - 1);
    return {
      pages: newPages,
      currentPageIndex: newIndex,
    };
  }),
  switchPage: (index) => set((state) => {
    if (index < 0 || index >= state.pages.length) return state;
    return {
      currentPageIndex: index,
    };
  }),
  saveCurrentPageWhiteboard: (dataUrl, size) => set((state) => {
    const newPages = [...state.pages];
    newPages[state.currentPageIndex] = {
      ...newPages[state.currentPageIndex],
      whiteboardDataUrl: dataUrl,
      boardWidth: size?.width ?? WHITEBOARD_WIDTH,
      boardHeight: size?.height ?? WHITEBOARD_HEIGHT,
    };
    return { pages: newPages };
  }),
  clearPageWhiteboard: (pageIndex) => set((state) => {
    if (pageIndex < 0 || pageIndex >= state.pages.length) return state;
    const newPages = [...state.pages];
    newPages[pageIndex] = {
      ...newPages[pageIndex],
      whiteboardDataUrl: null,
      boardWidth: WHITEBOARD_WIDTH,
      boardHeight: WHITEBOARD_HEIGHT,
    };
    return { pages: newPages };
  }),
  saveCurrentPageGeometry: (points, segments, circles) => set((state) => {
    const newPages = [...state.pages];
    newPages[state.currentPageIndex] = {
      ...newPages[state.currentPageIndex],
      geometry: { points, segments, circles },
    };
    return { pages: newPages };
  }),
  restoreWhiteboardSnapshot: (pages, currentPageIndex) => set((state) => {
    const safePages = pages.length > 0
      ? pages.map((page, index) => ({
          id: typeof page.id === 'string' && page.id ? page.id : `page_${index}`,
          whiteboardDataUrl: typeof page.whiteboardDataUrl === 'string' ? page.whiteboardDataUrl : null,
          boardWidth: typeof page.boardWidth === 'number' ? page.boardWidth : undefined,
          boardHeight: typeof page.boardHeight === 'number' ? page.boardHeight : undefined,
          geometry: {
            points: Array.isArray(page.geometry?.points) ? page.geometry.points : [],
            segments: Array.isArray(page.geometry?.segments) ? page.geometry.segments : [],
            circles: Array.isArray(page.geometry?.circles) ? page.geometry.circles : [],
          },
        }))
      : [{
          id: 'page_0',
          whiteboardDataUrl: null,
          boardWidth: WHITEBOARD_WIDTH,
          boardHeight: WHITEBOARD_HEIGHT,
          geometry: { points: [], segments: [], circles: [] },
        }];

    return {
      pages: safePages,
      currentPageIndex: Math.min(Math.max(currentPageIndex, 0), safePages.length - 1),
      whiteboardRestoreVersion: state.whiteboardRestoreVersion + 1,
    };
  }),

  setToolboxOpen: (o) => set({ isToolboxOpen: o }),
  setFocusedWindow: (id) => set({ focusedWindow: id }),

  setShowRuler: (s) => set({ showRuler: s }),
  setShowTriangleRuler: (s) => set({ showTriangleRuler: s }),
  setShowProtractor: (s) => set({ showProtractor: s }),
  setShowCompass: (s) => set({ showCompass: s }),

  setTheme: (t) => set({ theme: t }),

  // macOS 桌面端 Splash & 认证状态初始值与操作
  currentUser: {
    name: 'Holo Explorer',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
    role: '首席科学家 / 实验室研究员',
    email: 'scientist@hologrip.com',
  },
  isLoggedIn: typeof window !== 'undefined' ? Boolean(localStorage.getItem('hg_token')) : false,
  isLocked: false,
  isSplashActive: true,

  setCurrentUser: (user) => set({ currentUser: user }),
  login: (username) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hologrip_logged_in', 'true');
    }
    set((state) => ({
      isLoggedIn: true,
      isLocked: false,
      currentUser: state.currentUser ? { ...state.currentUser, name: username || state.currentUser.name } : {
        name: username || 'Holo Explorer',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&q=80',
        role: '首席科学家 / 实验室研究员',
        email: 'scientist@hologrip.com',
      }
    }));
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hologrip_logged_in', 'false');
    }
    set({ isLoggedIn: false, isLocked: false });
  },
  lockScreen: () => set({ isLocked: true }),
  unlockScreen: () => set({ isLocked: false }),
  dismissSplash: () => set({ isSplashActive: false }),
}));
