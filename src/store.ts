import { create } from 'zustand';
import * as THREE from 'three';
import type { AIVertex } from './lib/gemini';

export type MathShape = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid';
export type AppTab = 'whiteboard' | 'function' | 'calculator3d' | 'ar_3d';

export interface HandState {
  cursor: THREE.Vector2;
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

  modelLines: Array<[Point3D, Point3D]>;
  activeLineStart: Point3D | null;

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

  addModelLine: (p1: Point3D, p2: Point3D) => void;
  setActiveLineStart: (p: Point3D | null) => void;
  clearModelLines: () => void;
  removeModelLine: (index: number) => void;

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
  saveCurrentPageWhiteboard: (dataUrl: string, size?: { width: number; height: number }) => void;
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
}

export const useARStore = create<ARState>((set) => ({
  leftHand: { cursor: new THREE.Vector2(-999, -999), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  rightHand: { cursor: new THREE.Vector2(-999, -999), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  activeModel: null,
  activeCustomModelId: null,
  customModels: [],
  isLoaderVisible: false,
  isAnalyzing: false,
  modelScale: 2.5,

  activeTab: 'whiteboard',

  isModelPanelOpen: false,
  isPenPanelOpen: false,
  isPenActive: false,
  penColor: '#ffffff',
  penThickness: 3,
  isEraser: false,
  triggerClearCanvas: 0,
  interactMode: 'draw',
  
  isLineDrawingActive: false,

  modelLines: [],
  activeLineStart: null,

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
  setActiveModel: (m) => set({ activeModel: m, activeCustomModelId: null, modelScale: 2.5, modelLines: [], activeLineStart: null, surfaceStrokes: [] }),
  setActiveCustomModel: (id) => set({ activeCustomModelId: id, activeModel: null, modelScale: 2.5, modelLines: [], activeLineStart: null, surfaceStrokes: [] }),
  addCustomModel: (model) => set((state) => ({
    customModels: [...state.customModels, model],
    activeCustomModelId: model.id,
    activeModel: null,
    modelScale: 2.5,
    modelLines: [],
    activeLineStart: null,
    surfaceStrokes: [],
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
  // 画笔与连线互斥：启用画笔时自动关闭连线模式，避免捏合手势同时触发两种行为
  setPenActive: (a) => set(() => a
    ? { isPenActive: true, isLineDrawingActive: false }
    : { isPenActive: false }
  ),
  setPenColor: (c) => set({ penColor: c, isEraser: false }),
  setPenThickness: (t) => set({ penThickness: t }),
  setIsEraser: (e) => set({ isEraser: e }),
  clearCanvas: () => set((state) => ({ triggerClearCanvas: state.triggerClearCanvas + 1 })),
  setInteractMode: (m) => set({ interactMode: m }),

  // 启用连线时同步关闭画笔写字行为；面板保持打开，用户仍可在面板内切换工具
  setLineDrawingActive: (a) => set(() => a
    ? { isLineDrawingActive: true, isPenActive: false }
    : { isLineDrawingActive: false }
  ),

  addModelLine: (p1, p2) => set((state) => ({ modelLines: [...state.modelLines, [p1, p2]] })),
  setActiveLineStart: (p) => set({ activeLineStart: p }),
  clearModelLines: () => set({ modelLines: [], activeLineStart: null }),
  removeModelLine: (index) => set((state) => ({ modelLines: state.modelLines.filter((_, i) => i !== index) })),

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
}));
