import React, { useRef, useEffect } from 'react';
import { HandData } from '../../hooks/useHandTracking';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

interface HandSkeletonProps {
  handsDataRef: React.MutableRefObject<HandData[]>;
  showSkeleton: boolean;
  skeletonDotSize: number;
}

export const HandSkeleton: React.FC<HandSkeletonProps> = ({ handsDataRef, showSkeleton, skeletonDotSize }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animationId: number;
    const renderLoop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (showSkeleton) {
            const hands = handsDataRef.current;
            hands.forEach((hand) => {
              // 统一颜色为浅蓝色
              const color = '#38bdf8';
              
              ctx.lineWidth = 3;
              ctx.strokeStyle = color;
              
              HAND_CONNECTIONS.forEach(([start, end]) => {
                const p1 = hand.landmarks[start];
                const p2 = hand.landmarks[end];
                if (p1 && p2) {
                  ctx.beginPath();
                  ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                  ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                  ctx.stroke();
                }
              });

              ctx.fillStyle = '#ffffff';
              hand.landmarks.forEach((p) => {
                ctx.beginPath();
                ctx.arc(p.x * canvas.width, p.y * canvas.height, skeletonDotSize, 0, 2 * Math.PI);
                ctx.fill();
              });
            });
          }
        }
      }
      animationId = requestAnimationFrame(renderLoop);
    };
    renderLoop();
    return () => cancelAnimationFrame(animationId);
  }, [showSkeleton]);

  return (
    <canvas 
      ref={canvasRef} 
      width={1280} 
      height={720} 
      style={{
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        pointerEvents: 'none', 
        zIndex: 1, 
        objectFit: 'cover', 
        transform: 'scaleX(-1)' // 和视频保持一致的镜像
      }} 
    />
  );
};
