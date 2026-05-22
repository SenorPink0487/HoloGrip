import { create } from 'zustand';
import * as THREE from 'three';
import type { AIVertex } from './lib/gemini';

export type MathShape = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'pyramid';
export type AppTab = 'whiteboard' | 'geometry' | 'function' | 'toolbox' | 'formula' | 'probability' | 'ar_3d';

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

export interface FormulaCard {
  id: string;
  mathML: string;
  x: number;
  y: number;
  scale: number;
}

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
  penColor: string;
  penThickness: number;
  isEraser: boolean;
  triggerClearCanvas: number;
  
  isLineDrawingActive: boolean;

  modelLines: Array<[Point3D, Point3D]>;
  activeLineStart: Point3D | null;

  // 新增多窗口与工具状态管理
  isToolboxOpen: boolean;
  isFormulaModalOpen: boolean;
  focusedWindow: string | null;

  showRuler: boolean;
  showTriangleRuler: boolean;
  showProtractor: boolean;
  showCompass: boolean;

  formulaCards: FormulaCard[];

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
  setPenColor: (c: string) => void;
  setPenThickness: (t: number) => void;
  setIsEraser: (e: boolean) => void;
  clearCanvas: () => void;
  
  setLineDrawingActive: (a: boolean) => void;

  addModelLine: (p1: Point3D, p2: Point3D) => void;
  setActiveLineStart: (p: Point3D | null) => void;
  clearModelLines: () => void;
  removeModelLine: (index: number) => void;

  // 新增控制方法
  setToolboxOpen: (o: boolean) => void;
  setFormulaModalOpen: (o: boolean) => void;
  setFocusedWindow: (id: string | null) => void;

  setShowRuler: (s: boolean) => void;
  setShowTriangleRuler: (s: boolean) => void;
  setShowProtractor: (s: boolean) => void;
  setShowCompass: (s: boolean) => void;

  addFormulaCard: (card: FormulaCard) => void;
  removeFormulaCard: (id: string) => void;
  updateFormulaCard: (id: string, partial: Partial<FormulaCard>) => void;
  clearFormulaCards: () => void;
}

export const useARStore = create<ARState>((set) => ({
  leftHand: { cursor: new THREE.Vector2(-999, -999), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  rightHand: { cursor: new THREE.Vector2(-999, -999), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  activeModel: null,
  activeCustomModelId: null,
  customModels: [],
  isLoaderVisible: false, // 默认隐藏 AI Spatial 初始化加载界面，防止卡住黑板
  isAnalyzing: false,
  modelScale: 2.5,

  activeTab: 'whiteboard',

  isModelPanelOpen: false,
  isPenPanelOpen: false,
  penColor: '#ffffff',
  penThickness: 3,
  isEraser: false,
  triggerClearCanvas: 0,
  
  isLineDrawingActive: false,

  modelLines: [],
  activeLineStart: null,

  // 新增状态初始值
  isToolboxOpen: false,
  isFormulaModalOpen: false,
  focusedWindow: null,

  showRuler: false,
  showTriangleRuler: false,
  showProtractor: false,
  showCompass: false,

  formulaCards: [],

  updateHands: (left, right) => set((state) => {
    if (left.cursor) state.leftHand.cursor.copy(left.cursor);
    if (left.pixelCursor) state.leftHand.pixelCursor = left.pixelCursor;
    if (left.isPinched !== undefined) state.leftHand.isPinched = left.isPinched;
    if (left.isVisible !== undefined) state.leftHand.isVisible = left.isVisible;
    if (left.pinchDistance !== undefined) state.leftHand.pinchDistance = left.pinchDistance;

    if (right.cursor) state.rightHand.cursor.copy(right.cursor);
    if (right.pixelCursor) state.rightHand.pixelCursor = right.pixelCursor;
    if (right.isPinched !== undefined) state.rightHand.isPinched = right.isPinched;
    if (right.isVisible !== undefined) state.rightHand.isVisible = right.isVisible;
    if (right.pinchDistance !== undefined) state.rightHand.pinchDistance = right.pinchDistance;

    return { leftHand: state.leftHand, rightHand: state.rightHand };
  }),
  setActiveModel: (m) => set({ activeModel: m, activeCustomModelId: null, modelScale: 2.5, modelLines: [], activeLineStart: null }),
  setActiveCustomModel: (id) => set({ activeCustomModelId: id, activeModel: null, modelScale: 2.5, modelLines: [], activeLineStart: null }),
  addCustomModel: (model) => set((state) => ({
    customModels: [...state.customModels, model],
    // 自动激活新生成的模型
    activeCustomModelId: model.id,
    activeModel: null,
    modelScale: 2.5,
    modelLines: [],
    activeLineStart: null,
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
  setPenColor: (c) => set({ penColor: c, isEraser: false }),
  setPenThickness: (t) => set({ penThickness: t }),
  setIsEraser: (e) => set({ isEraser: e }),
  clearCanvas: () => set((state) => ({ triggerClearCanvas: state.triggerClearCanvas + 1 })),
  
  setLineDrawingActive: (a) => set({ isLineDrawingActive: a }),

  addModelLine: (p1, p2) => set((state) => ({ modelLines: [...state.modelLines, [p1, p2]] })),
  setActiveLineStart: (p) => set({ activeLineStart: p }),
  clearModelLines: () => set({ modelLines: [], activeLineStart: null }),
  removeModelLine: (index) => set((state) => ({ modelLines: state.modelLines.filter((_, i) => i !== index) })),

  // 新增控制方法实现
  setToolboxOpen: (o) => set({ isToolboxOpen: o }),
  setFormulaModalOpen: (o) => set({ isFormulaModalOpen: o }),
  setFocusedWindow: (id) => set({ focusedWindow: id }),

  setShowRuler: (s) => set({ showRuler: s }),
  setShowTriangleRuler: (s) => set({ showTriangleRuler: s }),
  setShowProtractor: (s) => set({ showProtractor: s }),
  setShowCompass: (s) => set({ showCompass: s }),

  addFormulaCard: (card) => set((state) => ({ formulaCards: [...state.formulaCards, card] })),
  removeFormulaCard: (id) => set((state) => ({ formulaCards: state.formulaCards.filter(c => c.id !== id) })),
  updateFormulaCard: (id, partial) => set((state) => ({
    formulaCards: state.formulaCards.map(c => c.id === id ? { ...c, ...partial } : c)
  })),
  clearFormulaCards: () => set({ formulaCards: [] }),
}));
