import { create } from 'zustand';
import type { Vector2 } from 'three';
import type {
  AuxiliaryLine,
  CustomModel,
  HandState,
  MathShape,
  Point3D,
  SectionPlane,
  SurfaceStroke,
} from './types';

interface ARState {
  leftHand: HandState;
  rightHand: HandState;
  activeModel: MathShape | null;
  activeCustomModelId: string | null;
  customModels: CustomModel[];
  isLoaderVisible: boolean;
  isAnalyzing: boolean;
  modelScale: number;
  activeTab: 'ar_3d';
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
  isSectionPlaneActive: boolean;
  showAllLengths: boolean;
  presetDimensions: Record<MathShape, Record<string, number>>;
  modelLines: AuxiliaryLine[];
  activeLineStart: Point3D | null;
  snappedPointInfo: string | null;
  sectionDraftPoints: Point3D[];
  sectionPlanes: SectionPlane[];
  surfaceStrokes: SurfaceStroke[];
  isWritingOnSurface: boolean;
  updateHands: (left: Partial<HandState>, right: Partial<HandState>) => void;
  setActiveModel: (model: MathShape | null) => void;
  setActiveCustomModel: (id: string | null) => void;
  addCustomModel: (model: CustomModel) => void;
  removeCustomModel: (id: string) => void;
  setLoaderVisible: (visible: boolean) => void;
  setAnalyzing: (analyzing: boolean) => void;
  setModelScale: (scale: number) => void;
  setActiveTab: (tab: string) => void;
  setModelPanelOpen: (open: boolean) => void;
  setPenPanelOpen: (open: boolean) => void;
  setPenActive: (active: boolean) => void;
  setPenColor: (color: string) => void;
  setPenThickness: (thickness: number) => void;
  setIsEraser: (eraser: boolean) => void;
  clearCanvas: () => void;
  setInteractMode: (mode: 'draw' | 'interact') => void;
  setLineDrawingActive: (active: boolean) => void;
  setXYZDrawingActive: (active: boolean) => void;
  setSectionPlaneActive: (active: boolean) => void;
  toggleShowAllLengths: () => void;
  updatePresetDimension: (shape: MathShape, key: string, value: number) => void;
  addModelLine: (p1: Point3D, p2: Point3D, isAuxiliary?: boolean) => void;
  setActiveLineStart: (point: Point3D | null) => void;
  clearModelLines: () => void;
  removeModelLine: (index: number) => void;
  updateLineExtension: (index: number, before: number, after: number) => void;
  toggleLineLength: (index: number) => void;
  toggleLineAuxiliary: (index: number) => void;
  setSnappedPointInfo: (info: string | null) => void;
  addSectionDraftPoint: (point: Point3D) => void;
  undoSectionDraftPoint: () => void;
  clearSectionDraft: () => void;
  completeSectionPlane: (color?: string) => boolean;
  removeSectionPlane: (id: string) => void;
  clearSectionPlanes: () => void;
  beginSurfaceStroke: (color: string, thickness: number) => string;
  appendSurfaceStrokePoint: (id: string, point: Point3D) => void;
  endSurfaceStroke: () => void;
  clearSurfaceStrokes: () => void;
  setWritingOnSurface: (writing: boolean) => void;
}

class StoreVector2 {
  constructor(public x: number, public y: number) {}
  copy(value: { x: number; y: number }) { this.x = value.x; this.y = value.y; return this; }
  clone() { return new StoreVector2(this.x, this.y) as unknown as Vector2; }
}

const createHandCursor = () => new StoreVector2(-999, -999) as unknown as Vector2;

const resetModelDrawing = () => ({
  modelLines: [] as AuxiliaryLine[],
  activeLineStart: null,
  surfaceStrokes: [] as SurfaceStroke[],
  sectionDraftPoints: [] as Point3D[],
  sectionPlanes: [] as SectionPlane[],
});

export const useARStore = create<ARState>((set) => ({
  leftHand: { cursor: createHandCursor(), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  rightHand: { cursor: createHandCursor(), pixelCursor: { x: 0, y: 0 }, isPinched: false, isVisible: false, pinchDistance: 1 },
  activeModel: null,
  activeCustomModelId: null,
  customModels: [],
  isLoaderVisible: false,
  isAnalyzing: false,
  modelScale: 2.5,
  activeTab: 'ar_3d',
  isModelPanelOpen: false,
  isPenPanelOpen: false,
  isPenActive: false,
  penColor: '#09090b',
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

  updateHands: (left, right) => set((state) => {
    const leftCursor = state.leftHand.cursor;
    if (left.cursor) leftCursor.copy(left.cursor);
    const rightCursor = state.rightHand.cursor;
    if (right.cursor) rightCursor.copy(right.cursor);
    return {
      leftHand: {
        cursor: leftCursor,
        pixelCursor: left.pixelCursor ?? state.leftHand.pixelCursor,
        isPinched: left.isPinched ?? state.leftHand.isPinched,
        isVisible: left.isVisible ?? state.leftHand.isVisible,
        pinchDistance: left.pinchDistance ?? state.leftHand.pinchDistance,
      },
      rightHand: {
        cursor: rightCursor,
        pixelCursor: right.pixelCursor ?? state.rightHand.pixelCursor,
        isPinched: right.isPinched ?? state.rightHand.isPinched,
        isVisible: right.isVisible ?? state.rightHand.isVisible,
        pinchDistance: right.pinchDistance ?? state.rightHand.pinchDistance,
      },
    };
  }),
  setActiveModel: (model) => set({ activeModel: model, activeCustomModelId: null, modelScale: 2.5, ...resetModelDrawing() }),
  setActiveCustomModel: (id) => set({ activeCustomModelId: id, activeModel: null, modelScale: 2.5, ...resetModelDrawing() }),
  addCustomModel: (model) => set((state) => ({ customModels: [...state.customModels, model], activeCustomModelId: model.id, activeModel: null, modelScale: 2.5, ...resetModelDrawing() })),
  removeCustomModel: (id) => set((state) => ({ customModels: state.customModels.filter(model => model.id !== id), activeCustomModelId: state.activeCustomModelId === id ? null : state.activeCustomModelId })),
  setLoaderVisible: (visible) => set({ isLoaderVisible: visible }),
  setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  setModelScale: (scale) => set({ modelScale: scale }),
  setActiveTab: (tab) => {
    if (tab !== 'ar_3d' && typeof window !== 'undefined') window.location.assign('whiteboard.html');
  },
  setModelPanelOpen: (open) => set({ isModelPanelOpen: open }),
  setPenPanelOpen: (open) => set({ isPenPanelOpen: open }),
  setPenActive: (active) => set(() => active
    ? { isPenActive: true, isLineDrawingActive: false, isXYZDrawingActive: false, isSectionPlaneActive: false, isEraser: false, sectionDraftPoints: [] }
    : { isPenActive: false }),
  setPenColor: (color) => set({ penColor: color, isEraser: false }),
  setPenThickness: (thickness) => set({ penThickness: thickness }),
  setIsEraser: (eraser) => set(() => eraser
    ? { isEraser: true, isPenActive: false, isLineDrawingActive: false, isXYZDrawingActive: false, isSectionPlaneActive: false, sectionDraftPoints: [] }
    : { isEraser: false }),
  clearCanvas: () => set((state) => ({ triggerClearCanvas: state.triggerClearCanvas + 1 })),
  setInteractMode: (mode) => set({ interactMode: mode }),
  setLineDrawingActive: (active) => set(() => active
    ? { isLineDrawingActive: true, isPenActive: false, isXYZDrawingActive: false, isSectionPlaneActive: false, isEraser: false, activeLineStart: null, sectionDraftPoints: [] }
    : { isLineDrawingActive: false, activeLineStart: null }),
  setXYZDrawingActive: (active) => set(() => active
    ? { isXYZDrawingActive: true, isLineDrawingActive: false, isPenActive: false, isSectionPlaneActive: false, isEraser: false, activeLineStart: null, sectionDraftPoints: [] }
    : { isXYZDrawingActive: false, activeLineStart: null }),
  setSectionPlaneActive: (active) => set(() => active
    ? { isSectionPlaneActive: true, isPenActive: false, isLineDrawingActive: false, isXYZDrawingActive: false, isEraser: false, activeLineStart: null }
    : { isSectionPlaneActive: false, sectionDraftPoints: [] }),
  toggleShowAllLengths: () => set((state) => ({ showAllLengths: !state.showAllLengths })),
  updatePresetDimension: (shape, key, value) => set((state) => ({ presetDimensions: { ...state.presetDimensions, [shape]: { ...state.presetDimensions[shape], [key]: value } } })),
  addModelLine: (p1, p2, isAuxiliary = false) => set((state) => ({ modelLines: [...state.modelLines, { id: `ml_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, p1, p2, isAuxiliary, extendBefore: 0, extendAfter: 0, showLength: true }] })),
  setActiveLineStart: (point) => set({ activeLineStart: point }),
  clearModelLines: () => set({ modelLines: [], activeLineStart: null }),
  removeModelLine: (index) => set((state) => ({ modelLines: state.modelLines.filter((_, i) => i !== index) })),
  updateLineExtension: (index, before, after) => set((state) => ({ modelLines: state.modelLines.map((line, i) => i === index ? { ...line, extendBefore: before, extendAfter: after } : line) })),
  toggleLineLength: (index) => set((state) => ({ modelLines: state.modelLines.map((line, i) => i === index ? { ...line, showLength: !line.showLength } : line) })),
  toggleLineAuxiliary: (index) => set((state) => ({ modelLines: state.modelLines.map((line, i) => i === index ? { ...line, isAuxiliary: !line.isAuxiliary } : line) })),
  setSnappedPointInfo: (info) => set({ snappedPointInfo: info }),
  addSectionDraftPoint: (point) => set((state) => {
    const last = state.sectionDraftPoints[state.sectionDraftPoints.length - 1];
    if (last) {
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      const dz = point.z - last.z;
      if (dx * dx + dy * dy + dz * dz < 1e-6) return state;
    }
    return { sectionDraftPoints: [...state.sectionDraftPoints, point] };
  }),
  undoSectionDraftPoint: () => set((state) => ({ sectionDraftPoints: state.sectionDraftPoints.slice(0, -1) })),
  clearSectionDraft: () => set({ sectionDraftPoints: [] }),
  completeSectionPlane: () => {
    let ok = false;
    set((state) => {
      if (state.sectionDraftPoints.length < 3) return state;
      ok = true;
      return {
        sectionPlanes: [...state.sectionPlanes, { id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, points: [...state.sectionDraftPoints], color: '#facc15' }],
        sectionDraftPoints: [],
        isSectionPlaneActive: false,
        snappedPointInfo: null,
      };
    });
    return ok;
  },
  removeSectionPlane: (id) => set((state) => ({ sectionPlanes: state.sectionPlanes.filter(plane => plane.id !== id) })),
  clearSectionPlanes: () => set({ sectionPlanes: [] }),
  beginSurfaceStroke: (color, thickness) => {
    const id = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    set((state) => ({ surfaceStrokes: [...state.surfaceStrokes, { id, points: [], color, thickness }] }));
    return id;
  },
  appendSurfaceStrokePoint: (id, point) => set((state) => ({ surfaceStrokes: state.surfaceStrokes.map(stroke => stroke.id === id ? { ...stroke, points: [...stroke.points, point] } : stroke) })),
  endSurfaceStroke: () => {},
  clearSurfaceStrokes: () => set({ surfaceStrokes: [] }),
  setWritingOnSurface: (writing) => set({ isWritingOnSurface: writing }),
}));
