import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, ChevronDown, ChevronUp, GripVertical, Maximize2, Sigma, Trash2, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { useARStore, type WhiteboardEmbed, type WhiteboardEmbedKind } from '../store';
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

function createEmbed(kind: WhiteboardEmbedKind, zIndex: number): WhiteboardEmbed {
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
  const theme = useARStore(state => state.theme);
  const pages = useARStore(state => state.pages);
  const currentPageIndex = useARStore(state => state.currentPageIndex);
  const interactMode = useARStore(state => state.interactMode);
  const addWhiteboardEmbed = useARStore(state => state.addWhiteboardEmbed);
  const updateWhiteboardEmbed = useARStore(state => state.updateWhiteboardEmbed);
  const removeWhiteboardEmbed = useARStore(state => state.removeWhiteboardEmbed);
  const page = pages[currentPageIndex];
  const embeds = page?.embeds ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
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
      if (target && !target.closest('[data-embed-card="true"]') && !target.closest('[data-embed-controls="true"]')) {
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

  const startDrag = useCallback((event: React.PointerEvent, embed: WhiteboardEmbed, mode: DragState['mode']) => {
    if (interactMode !== 'interact') return;
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(embed.id);
    bringToFront(embed.id);
    dragRef.current = {
      mode,
      id: embed.id,
      startClient: { x: event.clientX, y: event.clientY },
      start: embed,
    };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
  }, [bringToFront, interactMode]);

  const handleDrag = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage) return;
    const rect = stage.getBoundingClientRect();
    const dx = ((event.clientX - drag.startClient.x) / rect.width) * BOARD_WIDTH;
    const dy = ((event.clientY - drag.startClient.y) / rect.height) * BOARD_HEIGHT;
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
  }, [updateWhiteboardEmbed]);

  const stopDrag = useCallback((event?: React.PointerEvent) => {
    if (event) {
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    dragRef.current = null;
  }, []);

  const updateState = useCallback((id: string, state: FunctionExplorerState | Calculator3DState) => {
    updateWhiteboardEmbed(id, { state: state as unknown as Record<string, unknown> });
  }, [updateWhiteboardEmbed]);

  return (
    <div
      ref={stageRef}
      className={cn("absolute inset-0 pointer-events-none transition-all duration-300", editingId ? "z-[200]" : "z-[37]")}
      onPointerMove={handleDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      <div data-embed-controls="true" className="absolute right-8 top-8 z-[80] flex items-center gap-2 rounded-2xl border border-black/5 bg-white/80 p-2 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/85 pointer-events-auto">
        <span className={cn('px-2 text-xs font-semibold', isDark ? 'text-zinc-400' : 'text-slate-500')}>白板对象</span>
        <button type="button" onClick={() => addEmbed('function')} className="flex h-9 items-center gap-1.5 rounded-xl bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/20 dark:text-cyan-300" title="插入函数探究">
          <Sigma className="h-4 w-4" /> 函数探究
        </button>
        <button type="button" onClick={() => addEmbed('calculator3d')} className="flex h-9 items-center gap-1.5 rounded-xl bg-violet-500/10 px-3 text-xs font-semibold text-violet-700 transition hover:bg-violet-500/20 dark:text-violet-300" title="插入 3D 计算器">
          <Box className="h-4 w-4" /> 3D 计算器
        </button>
      </div>

      {embeds.map(embed => {
        const isSelected = selectedId === embed.id;
        const isEditing = editingId === embed.id;
        const state = embed.state;
        return (
          <div
            key={`${page?.id ?? 'page'}:${embed.id}`}
            data-embed-card="true"
            className={cn(
              'absolute overflow-hidden transition-all duration-300',
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
              height: embed.minimized ? '48px' : `${(embed.height / BOARD_HEIGHT) * 100}%`,
              zIndex: embed.zIndex,
            }}
            onPointerDown={(e) => {
              setSelectedId(embed.id);
              if (interactMode === 'interact') {
                startDrag(e, embed, 'move');
              }
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingId(embed.id);
            }}
          >
            {!embed.minimized && (
              <div
                className="relative w-full h-full min-h-0"
                onPointerDown={event => event.stopPropagation()}
                onDoubleClick={(e) => {
                  e.stopPropagation();
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

            {isSelected && interactMode === 'interact' && !embed.minimized && (
              <button
                type="button"
                aria-label="调整对象大小"
                className="absolute bottom-1 right-1 z-50 flex h-6 w-6 cursor-nwse-resize items-center justify-center rounded-md bg-cyan-500 text-white shadow"
                onPointerDown={event => startDrag(event, embed, 'resize')}
              >
                <Maximize2 className="h-3 w-3 rotate-90" />
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
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[250] w-[920px] max-w-[96vw] h-[190px] rounded-[2rem] bg-white/85 dark:bg-zinc-950/90 backdrop-blur-3xl saturate-180 border border-white/60 dark:border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.25)] flex flex-col overflow-hidden pointer-events-auto transition-all duration-300 animate-in fade-in slide-in-from-bottom-8 duration-300"
          >
            {/* Apple 抓手 & 顶栏 */}
            <div className="flex flex-col shrink-0 border-b border-black/5 dark:border-white/10 bg-white/40 dark:bg-zinc-900/40 select-none">
              <div className="flex h-9 items-center justify-between px-5 pt-1">
                <div className="flex items-center gap-2.5 font-bold text-sm text-slate-800 dark:text-zinc-100 tracking-tight">
                  <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center font-black">
                    {editingEmbed.kind === 'function' ? <Sigma className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                  </div>
                  <span>{editingEmbed.kind === 'function' ? '函数与参数属性面板' : '3D 结构与模型面板'}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => removeWhiteboardEmbed(editingEmbed.id)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium text-rose-500 hover:bg-rose-500/10 active:scale-95 transition-all cursor-pointer"
                    title="删除对象"
                  >
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-4.5 py-1.5 rounded-full bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-white font-bold text-xs shadow-[0_4px_14px_rgba(6,182,212,0.35)] transition-all cursor-pointer"
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
                <Calculator3D embedded preview={false} initialState={state as unknown as Calculator3DState} onStateChange={next => updateState(editingEmbed.id, next)} />
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
