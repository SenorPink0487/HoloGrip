import { useEffect, useRef } from 'react';
import { useARStore } from '../stores/arStore';
import { cn } from '../lib/utils';

export function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawing = useRef(false);
  const smoothedCursor = useRef<{ x: number, y: number } | null>(null);
  const lastMid = useRef<{ x: number, y: number } | null>(null);
  const lastControl = useRef<{ x: number, y: number } | null>(null);

  const activeTab = useARStore(state => state.activeTab);
  const triggerClearCanvas = useARStore(state => state.triggerClearCanvas);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      // ⚠️ 用 canvas 自身真实渲染尺寸（即父容器的 clientWidth/Height），
      // 而非 window.innerWidth/innerHeight。后者在 Tauri 桌面端比舞台多出
      // 36px 标题栏高度，会导致位图被纵向拉伸压缩，写出的笔迹相对光标
      // 偏移（这正是打包后画笔位置错位的根因）。
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || canvas.clientWidth || window.innerWidth;
      const h = parent?.clientHeight || canvas.clientHeight || window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      ctxRef.current = canvas.getContext('2d');
      if (ctxRef.current) {
        ctxRef.current.lineCap = 'round';
        ctxRef.current.lineJoin = 'round';
      }
    }

    const handleResize = () => {
      if (!canvas) return;
      const parent = canvas.parentElement;
      const w = parent?.clientWidth || canvas.clientWidth || window.innerWidth;
      const h = parent?.clientHeight || canvas.clientHeight || window.innerHeight;
      // Save content
      let tempCanvas: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
      }

      canvas.width = w;
      canvas.height = h;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (tempCanvas && tempCanvas.width > 0 && tempCanvas.height > 0) {
          ctx.drawImage(tempCanvas, 0, 0);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (ctxRef.current && canvasRef.current) {
      ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  }, [triggerClearCanvas]);

  useEffect(() => {
    // 笔画结束的容忍窗口：手部暂时消失或松开捏合后，
    // 在该时间内若重新捏上，则继续上一笔，避免 MediaPipe 偶发丢帧
    // 把一笔切成好几段。超过该时长才真正结束本笔。
    const STROKE_GRACE_MS = 150;
    let endStrokeTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleEnd = () => {
      if (endStrokeTimer !== null) return;
      endStrokeTimer = setTimeout(() => {
        isDrawing.current = false;
        smoothedCursor.current = null;
        lastControl.current = null;
        lastMid.current = null;
        endStrokeTimer = null;
      }, STROKE_GRACE_MS);
    };

    const cancelEnd = () => {
      if (endStrokeTimer !== null) {
        clearTimeout(endStrokeTimer);
        endStrokeTimer = null;
      }
    };

    const unsub = useARStore.subscribe((state) => {
      // 离开 AR 或画笔功能未激活：立即终止，不进入 grace
      if (state.activeTab !== 'ar_3d' || !state.isPenActive) {
        cancelEnd();
        isDrawing.current = false;
        smoothedCursor.current = null;
        lastControl.current = null;
        lastMid.current = null;
        return;
      }

      // 正在把字写到 3D 模型表面：暂停 2D 写字，避免同一笔同时落在两层
      if (state.isWritingOnSurface) {
        if (isDrawing.current) scheduleEnd();
        return;
      }
      const rightHand = state.rightHand; // Right hand for drawing
      if (!rightHand.isVisible) {
        // 手部短暂丢失：进入 grace，等待是否回来
        if (isDrawing.current) scheduleEnd();
        return;
      }

      const { x, y } = rightHand.pixelCursor;

      const isScalingModel = state.activeModel !== null && state.leftHand.isVisible && state.leftHand.isPinched;

      if (rightHand.isPinched && !isScalingModel) {
        // 重新捏上：取消 grace，继续上一笔
        cancelEnd();

        if (!isDrawing.current) {
          isDrawing.current = true;
          smoothedCursor.current = { x, y };
          lastControl.current = { x, y };
          lastMid.current = { x, y };
        } else if (smoothedCursor.current && lastControl.current && lastMid.current && ctxRef.current) {
          // 若再次捏合时光标距离上一位置过远，说明是真正的新笔画，
          // 重置锚点避免把两段连成一条横跨整个画布的直线。
          const JUMP_THRESHOLD = 120; // 像素
          const dx = x - smoothedCursor.current.x;
          const dy = y - smoothedCursor.current.y;
          if (dx * dx + dy * dy > JUMP_THRESHOLD * JUMP_THRESHOLD) {
            smoothedCursor.current = { x, y };
            lastControl.current = { x, y };
            lastMid.current = { x, y };
            return;
          }

          // 1. 低通滤波 (EWMA) 平滑原始坐标
          const alpha = 0.35; // 平滑系数，越小越平滑但会有延迟
          smoothedCursor.current.x += (x - smoothedCursor.current.x) * alpha;
          smoothedCursor.current.y += (y - smoothedCursor.current.y) * alpha;

          const sx = smoothedCursor.current.x;
          const sy = smoothedCursor.current.y;

          // 2. 贝塞尔曲线二次平滑
          const currentMid = {
            x: (lastControl.current.x + sx) / 2,
            y: (lastControl.current.y + sy) / 2
          };

          const ctx = ctxRef.current;
          ctx.beginPath();
          ctx.moveTo(lastMid.current.x, lastMid.current.y);
          ctx.quadraticCurveTo(lastControl.current.x, lastControl.current.y, currentMid.x, currentMid.y);
          
          ctx.strokeStyle = state.isEraser ? '#000000' : state.penColor;
          
          ctx.lineWidth = state.penThickness * 2;
          
          if (state.isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
          } else {
            ctx.globalCompositeOperation = 'source-over';
          }
          
          ctx.stroke();
          
          lastControl.current = { x: sx, y: sy };
          lastMid.current = currentMid;
        }
      } else {
        // 松开捏合或左手开始缩放：进入 grace，等待是否短时再次捏合
        if (isDrawing.current) scheduleEnd();
      }
    });

    return () => {
      cancelEnd();
      unsub();
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={cn(
        // 画布始终在 AR 模式下可见，关闭画笔功能后已写的笔迹保留显示。
        // isPenActive 只控制是否能写新字（在 subscribe 内判断），
        // 不再控制可见性。
        "absolute inset-0 pointer-events-none z-20 transition-opacity duration-300",
        activeTab === 'ar_3d' ? "opacity-100" : "opacity-0"
      )}
    />
  );
}
