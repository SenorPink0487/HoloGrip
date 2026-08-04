import { create } from 'zustand';
import type { AppTab, PageData, WhiteboardEmbed, WhiteboardEmbedKind } from './types';

const WHITEBOARD_WIDTH = 1920;
const WHITEBOARD_HEIGHT = 1080;

export interface WhiteboardState {
  activeTab: AppTab;
  isPenActive: boolean;
  penColor: string;
  penThickness: number;
  isEraser: boolean;
  triggerClearCanvas: number;
  interactMode: 'draw' | 'interact';
  pages: PageData[];
  currentPageIndex: number;
  whiteboardRestoreVersion: number;
  isToolboxOpen: boolean;
  focusedWindow: string | null;
  showRuler: boolean;
  showTriangleRuler: boolean;
  showProtractor: boolean;
  showCompass: boolean;
  setActiveTab: (tab: AppTab) => void;
  setPenActive: (active: boolean) => void;
  setPenColor: (color: string) => void;
  setPenThickness: (thickness: number) => void;
  setIsEraser: (eraser: boolean) => void;
  clearCanvas: () => void;
  setInteractMode: (mode: 'draw' | 'interact') => void;
  addPage: () => void;
  removePage: (index: number) => void;
  switchPage: (index: number) => void;
  saveCurrentPageWhiteboard: (dataUrl: string | null, size?: { width: number; height: number }) => void;
  clearPageWhiteboard: (pageIndex: number) => void;
  saveCurrentPageGeometry: (points: any[], segments: any[], circles: any[]) => void;
  addWhiteboardEmbed: (embed: WhiteboardEmbed) => void;
  updateWhiteboardEmbed: (id: string, patch: Partial<WhiteboardEmbed>) => void;
  removeWhiteboardEmbed: (id: string) => void;
  restoreWhiteboardSnapshot: (pages: PageData[], currentPageIndex: number) => void;
  setToolboxOpen: (open: boolean) => void;
  setFocusedWindow: (id: string | null) => void;
  setShowRuler: (show: boolean) => void;
  setShowTriangleRuler: (show: boolean) => void;
  setShowProtractor: (show: boolean) => void;
  setShowCompass: (show: boolean) => void;
}

const emptyPage = (): PageData => ({
  id: 'page_0',
  whiteboardDataUrl: null,
  boardWidth: WHITEBOARD_WIDTH,
  boardHeight: WHITEBOARD_HEIGHT,
  embeds: [],
  geometry: { points: [], segments: [], circles: [] },
});

export const useWhiteboardStore = create<WhiteboardState>((set) => ({
  activeTab: 'whiteboard',
  isPenActive: false,
  penColor: '#09090b',
  penThickness: 3,
  isEraser: false,
  triggerClearCanvas: 0,
  interactMode: 'draw',
  pages: [emptyPage()],
  currentPageIndex: 0,
  whiteboardRestoreVersion: 0,
  isToolboxOpen: false,
  focusedWindow: null,
  showRuler: false,
  showTriangleRuler: false,
  showProtractor: false,
  showCompass: false,

  setActiveTab: (tab) => set({ activeTab: (tab === 'function' || tab === 'calculator3d' || tab === 'launcher') ? 'whiteboard' : tab }),
  setPenActive: (active) => set(() => active
    ? { isPenActive: true, isEraser: false }
    : { isPenActive: false }),
  setPenColor: (color) => set({ penColor: color, isEraser: false }),
  setPenThickness: (thickness) => set({ penThickness: thickness }),
  setIsEraser: (eraser) => set(() => eraser
    ? { isEraser: true, isPenActive: false }
    : { isEraser: false }),
  clearCanvas: () => set((state) => ({ triggerClearCanvas: state.triggerClearCanvas + 1 })),
  setInteractMode: (mode) => set({ interactMode: mode }),

  addPage: () => set((state) => {
    const newPage: PageData = {
      id: `page_${Date.now()}`,
      whiteboardDataUrl: null,
      boardWidth: WHITEBOARD_WIDTH,
      boardHeight: WHITEBOARD_HEIGHT,
      embeds: [],
      geometry: { points: [], segments: [], circles: [] },
    };
    return { pages: [...state.pages, newPage], currentPageIndex: state.pages.length, triggerClearCanvas: state.triggerClearCanvas + 1 };
  }),
  removePage: (index) => set((state) => {
    if (state.pages.length <= 1) return state;
    const newPages = state.pages.filter((_, i) => i !== index);
    return { pages: newPages, currentPageIndex: Math.min(state.currentPageIndex, newPages.length - 1) };
  }),
  switchPage: (index) => set((state) => index < 0 || index >= state.pages.length ? state : { currentPageIndex: index }),
  saveCurrentPageWhiteboard: (dataUrl, size) => set((state) => {
    const pages = [...state.pages];
    pages[state.currentPageIndex] = { ...pages[state.currentPageIndex], whiteboardDataUrl: dataUrl, boardWidth: size?.width ?? WHITEBOARD_WIDTH, boardHeight: size?.height ?? WHITEBOARD_HEIGHT };
    return { pages };
  }),
  clearPageWhiteboard: (pageIndex) => set((state) => {
    if (pageIndex < 0 || pageIndex >= state.pages.length) return state;
    const pages = [...state.pages];
    pages[pageIndex] = { ...pages[pageIndex], whiteboardDataUrl: null, boardWidth: WHITEBOARD_WIDTH, boardHeight: WHITEBOARD_HEIGHT };
    return { pages };
  }),
  saveCurrentPageGeometry: (points, segments, circles) => set((state) => {
    const pages = [...state.pages];
    pages[state.currentPageIndex] = { ...pages[state.currentPageIndex], geometry: { points, segments, circles } };
    return { pages };
  }),
  addWhiteboardEmbed: (embed) => set((state) => {
    const pages = [...state.pages];
    const page = pages[state.currentPageIndex];
    if (!page) return state;
    pages[state.currentPageIndex] = { ...page, embeds: [...(page.embeds ?? []), embed] };
    return { pages };
  }),
  updateWhiteboardEmbed: (id, patch) => set((state) => {
    const pages = [...state.pages];
    const page = pages[state.currentPageIndex];
    if (!page) return state;
    pages[state.currentPageIndex] = { ...page, embeds: (page.embeds ?? []).map(embed => embed.id === id ? { ...embed, ...patch } : embed) };
    return { pages };
  }),
  removeWhiteboardEmbed: (id) => set((state) => {
    const pages = [...state.pages];
    const page = pages[state.currentPageIndex];
    if (!page) return state;
    pages[state.currentPageIndex] = { ...page, embeds: (page.embeds ?? []).filter(embed => embed.id !== id) };
    return { pages };
  }),
  restoreWhiteboardSnapshot: (pages, currentPageIndex) => set((state) => {
    const safePages = pages.length > 0
      ? pages.map((page, index) => ({
          id: typeof page.id === 'string' && page.id ? page.id : `page_${index}`,
          whiteboardDataUrl: typeof page.whiteboardDataUrl === 'string' ? page.whiteboardDataUrl : null,
          boardWidth: typeof page.boardWidth === 'number' ? page.boardWidth : undefined,
          boardHeight: typeof page.boardHeight === 'number' ? page.boardHeight : undefined,
          embeds: Array.isArray(page.embeds) ? page.embeds.filter(embed => embed && typeof embed === 'object').map((embed, embedIndex) => ({
            id: typeof embed.id === 'string' && embed.id ? embed.id : `embed_${index}_${embedIndex}`,
            kind: (embed.kind === 'calculator3d' ? 'calculator3d' : 'function') as WhiteboardEmbedKind,
            x: typeof embed.x === 'number' ? embed.x : 160,
            y: typeof embed.y === 'number' ? embed.y : 140,
            width: typeof embed.width === 'number' ? embed.width : 760,
            height: typeof embed.height === 'number' ? embed.height : 520,
            zIndex: typeof embed.zIndex === 'number' ? embed.zIndex : embedIndex + 1,
            minimized: Boolean(embed.minimized),
            state: embed.state && typeof embed.state === 'object' ? embed.state : {},
          })) : [],
          geometry: {
            points: Array.isArray(page.geometry?.points) ? page.geometry.points : [],
            segments: Array.isArray(page.geometry?.segments) ? page.geometry.segments : [],
            circles: Array.isArray(page.geometry?.circles) ? page.geometry.circles : [],
          },
        }))
      : [emptyPage()];
    return { pages: safePages, currentPageIndex: Math.min(Math.max(currentPageIndex, 0), safePages.length - 1), whiteboardRestoreVersion: state.whiteboardRestoreVersion + 1 };
  }),
  setToolboxOpen: (open) => set({ isToolboxOpen: open }),
  setFocusedWindow: (id) => set({ focusedWindow: id }),
  setShowRuler: (show) => set({ showRuler: show }),
  setShowTriangleRuler: (show) => set({ showTriangleRuler: show }),
  setShowProtractor: (show) => set({ showProtractor: show }),
  setShowCompass: (show) => set({ showCompass: show }),
}));
