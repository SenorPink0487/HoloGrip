import { useEffect, useRef } from 'react';
import { useARStore } from '../store';
import { cn } from '../lib/utils';

export function Canvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const isDrawing = useRef(false);
  const smoothedCursor = useRef<{ x: number, y: number } | null>(null);
  const lastMid = useRef<{ x: number, y: number } | null>(null);
  const lastControl = useRef<{ x: number, y: number } | null>(null);

  const activeTab = useARStore(state => state.activeTab);
  const penColor = useARStore(state => state.penColor);
  const penThickness = useARStore(state => state.penThickness);
  const isEraser = useARStore(state => state.isEraser);
  const triggerClearCanvas = useARStore(state => state.triggerClearCanvas);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctxRef.current = canvas.getContext('2d');
      if (ctxRef.current) {
        ctxRef.current.lineCap = 'round';
        ctxRef.current.lineJoin = 'round';
      }
    }

    const handleResize = () => {
      if (!canvas) return;
      // Save content
      let tempCanvas: HTMLCanvasElement | null = null;
      if (canvas.width > 0 && canvas.height > 0) {
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        tempCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
      }

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      
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
    const unsub = useARStore.subscribe((state) => {
      if (state.activeTab !== 'pen') {
        isDrawing.current = false;
        smoothedCursor.current = null;
        lastControl.current = null;
        lastMid.current = null;
        return;
      }

      const rightHand = state.rightHand; // Right hand for drawing
      if (!rightHand.isVisible) {
        isDrawing.current = false;
        smoothedCursor.current = null;
        lastControl.current = null;
        lastMid.current = null;
        return;
      }

      const { x, y } = rightHand.pixelCursor;

      const isScalingModel = state.activeModel !== null && state.leftHand.isVisible && state.leftHand.isPinched;

      if (rightHand.isPinched && !isScalingModel) {
        if (!isDrawing.current) {
          isDrawing.current = true;
          smoothedCursor.current = { x, y };
          lastControl.current = { x, y };
          lastMid.current = { x, y };
        } else if (smoothedCursor.current && lastControl.current && lastMid.current && ctxRef.current) {
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
          
          // Map pinch distance (0 - 0.05) to a thickness modifier
          const pinchFactor = Math.max(0, 1 - (rightHand.pinchDistance / 0.05));
          const dynamicThickness = state.penThickness + (pinchFactor * 10);
          ctx.lineWidth = dynamicThickness;
          
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
        isDrawing.current = false;
        smoothedCursor.current = null;
        lastControl.current = null;
        lastMid.current = null;
      }
    });

    return unsub;
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={cn(
        "absolute inset-0 pointer-events-none z-20 transition-opacity duration-300",
        activeTab === 'pen' ? "opacity-100" : "opacity-0"
      )}
    />
  );
}
