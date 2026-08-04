import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronUp, GripVertical, Maximize2, Sigma, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useWhiteboardStore } from '../stores/whiteboardStore';
import { useSessionStore } from '../stores/sessionStore';
import type { WhiteboardEmbed, WhiteboardEmbedKind } from '../stores/types';
import { FunctionExplorer, type FunctionExplorerState } from './FunctionExplorer';
import { Calculator3D, type Calculator3DState } from './Calculator3D';

const BOARD_WIDTH = 1920;
const BOARD_HEIGHT = 1080;

type DragState = {
  mode: 'move' | 'resize';
  id: string;
  startClient: { x: number; y: number };
  start: WhiteboardEmbed;
};

export function createEmbed(kind: WhiteboardEmbedKind, zIndex: number = 10): WhiteboardEmbed {
  return {
    id: `embed_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    x: kind === 'function' ? 170 : 980,
    y: kind === 'function' ? 150 : 220,
    width: kind === 'function' ? 820 : 760,
    height: kind === 'function' ? 560 : 520,
    zIndex,
    minimized: false,
    state: {},
  };
}

export function WhiteboardEmbedsLayer() {
  const theme = useSessionStore(state => state.theme);
  const pages = useWhiteboardStore(state => state.pages);
  const currentPageIndex = useWhiteboardStore(state => state.currentPageIndex);
  const interactMode = useWhiteboardStore(state => state.interactMode);
  const addWhiteboardEmbed = useWhiteboardStore(state => state.addWhiteboardEmbed);
  const updateWhiteboardEmbed = useWhiteboardStore(state => state.updateWhiteboardEmbed);
  const removeWhiteboardEmbed = useWhiteboardStore(state => state.removeWhiteboardEmbed);
  const page = pages[currentPageIndex];
  const embeds = page?.embeds ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const rafRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDark = theme === 'dark';

  const maxZ = useMemo(() => embeds.reduce((max, embed) => Math.max(max, embed.zIndex), 0), [embeds]);

  useEffect(() => {
    if (selectedId && !embeds.some(embed => embed.id === selectedId)) setSelectedId(null);
    if (editingId && !embeds.some(embed => embed.id === editingId)) setEditingId(null);
  }, [embeds, selectedId, editingId]);

  useEffect(() => {
    const handleGlobalPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        !target.closest('[data-embed-card="true"]') &&
        !target.closest('[data-embed-controls="true"]') &&
        !target.closest('[data-mathkbd]')
      ) {
        setSelectedId(null);
        setEditingId(null);
      }
    };
    window.addEventListener('pointerdown', handleGlobalPointerDown);
    return () => window.removeEventListener('pointerdown', handleGlobalPointerDown);
  }, []);

  const bringToFront = useCallback((id: string) => {
    updateWhiteboardEmbed(id, { zIndex: maxZ + 1 });
    setSelectedId(id);
  }, [maxZ, updateWhiteboardEmbed]);

  const addEmbed = useCallback((kind: WhiteboardEmbedKind) => {
    const embed = createEmbed(kind, maxZ + 1);
    addWhiteboardEmbed(embed);
    setSelectedId(embed.id);
  }, [addWhiteboardEmbed, maxZ]);

  const handlePointerMoveWindow = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const clientX = event.clientX;
    const clientY = event.clientY;

    rafRef.current = requestAnimationFrame(() => {
      if (!dragRef.current || !stageRef.current) return;
      const rect = stageRef.current.getBoundingClientRect();
      const dx = ((clientX - drag.startClient.x) / rect.width) * BOARD_WIDTH;
      const dy = ((clientY - drag.startClient.y) / rect.height) * BOARD_HEIGHT;

      if (drag.mode === 'move') {
        updateWhiteboardEmbed(drag.id, {
          x: Math.max(0, Math.min(BOARD_WIDTH - drag.start.width, drag.start.x + dx)),
          y: Math.max(0, Math.min(BOARD_HEIGHT - (drag.start.minimized ? 48 : drag.start.height), drag.start.y + dy)),
        });
      } else {
        updateWhiteboardEmbed(drag.id, {
          width: Math.max(420, Math.min(BOARD_WIDTH - drag.start.x, drag.start.width + dx)),
          height: Math.max(260, Math.min(BOARD_HEIGHT - drag.start.y, drag.start.height + dy)),
        });
      }
    });
  }, [updateWhiteboardEmbed]);

  const stopDragWindow = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    dragRef.current = null;
    setActiveDragId(null);
    window.removeEventListener('pointermove', handlePointerMoveWindow);
    window.removeEventListener('pointerup', stopDragWindow);
    window.removeEventListener('pointercancel', stopDragWindow);
  }, [handlePointerMoveWindow]);

  const startDrag = useCallback((event: React.PointerEvent, embed: WhiteboardEmbed, mode: DragState['mode']) => {
    if (interactMode !== 'interact') return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(embed.id);
    setActiveDragId(embed.id);
    bringToFront(embed.id);
    dragRef.current = {
      mode,
      id: embed.id,
      startClient: { x: event.clientX, y: event.clientY },
      start: embed,
    };
    window.addEventListener('pointermove', handlePointerMoveWindow);
    window.addEventListener('pointerup', stopDragWindow);
    window.addEventListener('pointercancel', stopDragWindow);
  }, [bringToFront, interactMode, handlePointerMoveWindow, stopDragWindow]);

  const updateState = useCallback((id: string, state: FunctionExplorerState | Calculator3DState) => {
    updateWhiteboardEmbed(id, { state: state as unknown as Record<string, unknown> });
  }, [updateWhiteboardEmbed]);

  return (
    <div
      ref={stageRef}
      className={cn("absolute inset-0 pointer-events-none transition-colors duration-300", editingId ? "z-[200]" : "z-[37]")}
    >

      {embeds.map(embed => {
        const isSelected = selectedId === embed.id;
        const isEditing = editingId === embed.id;
        const isDraggingThis = activeDragId === embed.id;
        const state = embed.state;
        return (
          <div
            key={`${page?.id ?? 'page'}:${embed.id}`}
            data-embed-card="true"
            className={cn(
              'absolute overflow-hidden select-none',
              isDraggingThis ? 'transition-none will-change-transform' : 'transition-[border-color,box-shadow,background-color] duration-300',
              interactMode === 'interact' ? 'pointer-events-auto' : 'pointer-events-none',
              isEditing
                ? 'rounded-2xl border-2 border-cyan-400/80 ring-4 ring-cyan-400/20 bg-transparent shadow-xl'
                : isSelected
                  ? 'rounded-xl border-2 border-dashed border-cyan-400/70 bg-transparent shadow-none'
                  : 'rounded-xl border border-transparent bg-transparent hover:border-black/10 dark:hover:border-white/15'
            )}
            style={{
              left: `${(embed.x / BOARD_WIDTH) * 100}%`,
              top: `${(embed.y / BOARD_HEIGHT) * 100}%`,
              width: `${(embed.width / BOARD_WIDTH) * 100}%`,
              height: embed.minimized ? '40px' : `${(embed.height / BOARD_HEIGHT) * 100}%`,
              zIndex: embed.zIndex,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(embed.id);
              setEditingId(embed.id);
            }}
          >
            {/* 1. 画布主体：永久 100% 填充，绝对定位，切换模式时函数图像与坐标系位置零偏移零跳动 */}
            {!embed.minimized && (
              <div
                className="absolute inset-0 overflow-hidden"
                onPointerDown={event => {
                  event.stopPropagation();
                  setSelectedId(embed.id);
                  setEditingId(embed.id);
                }}
              >
                {embed.kind === 'function' ? (
                  <FunctionExplorer embedded preview initialState={state as unknown as FunctionExplorerState} onStateChange={next => updateState(embed.id, next)} />
                ) : (
                  <Calculator3D embedded preview initialState={state as unknown as Calculator3DState} onStateChange={next => updateState(embed.id, next)} />
                )}
              </div>
            )}

            {/* 2. 原版拖拽栏：absolute 浮层挂在框内顶端 (top-0)，与外框边框及圆角 100% 无缝契合，零挤压且弹出流畅 */}
            {interactMode === 'interact' && (
              <div
                className="group/dragbar absolute top-0 left-0 right-0 z-50 flex h-7 items-center justify-center bg-slate-200/80 dark:bg-zinc-800/80 border-b border-black/5 dark:border-white/10 rounded-t-[inherit] cursor-grab active:cursor-grabbing select-none transition-colors hover:bg-slate-300/90 dark:hover:bg-zinc-700/90 backdrop-blur-md animate-in fade-in slide-in-from-top-full duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                title="按住顶部拖拽窗口位置"
                onPointerDown={event => {
                  event.stopPropagation();
                  setSelectedId(embed.id);
                  setEditingId(embed.id);
                  startDrag(event, embed, 'move');
                }}
              >
                <div className="w-14 h-1.5 rounded-full bg-slate-400/80 dark:bg-white/50 group-hover/dragbar:bg-cyan-500 transition-colors shadow-sm" />
              </div>
            )}

            {isSelected && interactMode === 'interact' && !embed.minimized && (
              <button
                type="button"
                aria-label="调整对象大小"
                className="absolute bottom-1 right-1 z-50 flex h-7 w-7 touch-none cursor-nwse-resize items-center justify-center rounded-lg bg-cyan-500 text-white shadow-lg transition-transform active:scale-110"
                onPointerDown={event => startDrag(event, embed, 'resize')}
              >
                <Maximize2 className="h-3.5 w-3.5 rotate-90" />
              </button>
            )}
          </div>
        );
      })}

      {/* 底部弹出式编辑窗口 (覆盖 Dock 栏) */}
      {(() => {
        const editingEmbed = embeds.find(e => e.id === editingId);
        if (!editingEmbed) return null;
        const state = editingEmbed.state;
        return (
          <div
            data-embed-controls="true"
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] w-fit max-w-[96vw] h-[220px] rounded-[2rem] bg-white/85 dark:bg-zinc-950/90 backdrop-blur-3xl saturate-180 border border-white/60 dark:border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.2)] flex flex-col overflow-hidden pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] animate-in fade-in slide-in-from-bottom-8"
          >
            {/* Apple 抓手 & 顶栏 */}
            <div className="flex flex-col shrink-0 border-b border-black/5 dark:border-white/10 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md select-none">
              <div className="flex h-9 items-center justify-between px-5 pt-1">
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => removeWhiteboardEmbed(editingEmbed.id)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer"
                    title="删除对象"
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-3.5 py-1 rounded-full bg-[#007AFF] hover:bg-[#0062CC] active:scale-[0.97] text-white font-semibold text-[11px] shadow-sm transition-all cursor-pointer"
                    title="完成编辑"
                  >
                    完成
                  </button>
                </div>
              </div>
            </div>

            {/* 编辑主体 */}
            <div className="flex-1 min-h-0 overflow-hidden relative">
              {editingEmbed.kind === 'function' ? (
                <FunctionExplorer editorOnly initialState={state as unknown as FunctionExplorerState} onStateChange={next => updateState(editingEmbed.id, next)} />
              ) : (
                <Calculator3D editorOnly initialState={state as unknown as Calculator3DState} onStateChange={next => updateState(editingEmbed.id, next)} />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
