import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { initHandLandmarker } from './lib/mediapipe';
import { useARStore } from './store';
import { OverlayUI } from './components/OverlayUI';
import { MathModel } from './components/MathModel';
import { Canvas2D } from './components/Canvas2D';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(undefined);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);

  const updateHands = useARStore(state => state.updateHands);
  const setLoaderVisible = useARStore(state => state.setLoaderVisible);

  // For synthetic clicks
  const prevPinch1 = useRef(false);
  const prevPinch2 = useRef(false);

  useEffect(() => {
    let active = true;

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.addEventListener("loadeddata", () => {
            initVision();
          });
        }
      } catch (err) {
        console.error("Camera access denied or failed", err);
        alert("Camera access is required for the AR experience.");
      }
    }

    async function initVision() {
      const landmarker = await initHandLandmarker();
      handLandmarkerRef.current = landmarker;
      
      if (active) {
        setLoaderVisible(false);
        detectContinuously();
      }
    }

    let lastVideoTime = -1;
    function detectContinuously() {
      if (!videoRef.current || !handLandmarkerRef.current) return;

      const video = videoRef.current;
      const startTimeMs = performance.now();
      
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
        
        if (results.landmarks && results.landmarks.length > 0) {
          const processHand = (landmarks: any) => {
            if (!landmarks) return { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
            
            const indexF = landmarks[8];
            const thumb = landmarks[4];
            
            if (indexF && thumb) {
              // Screen is mirrored. So mediaPipe X must be inverted.
              const videoX = 1.0 - ((indexF.x + thumb.x) / 2);
              const videoY = (indexF.y + thumb.y) / 2;
              
              const videoAspect = 1280 / 720;
              const screenAspect = window.innerWidth / window.innerHeight;
              let renderWidth = window.innerWidth;
              let renderHeight = window.innerHeight;
              let offsetX = 0;
              let offsetY = 0;

              if (screenAspect > videoAspect) {
                renderHeight = window.innerWidth / videoAspect;
                offsetY = (renderHeight - window.innerHeight) / 2;
              } else {
                renderWidth = window.innerHeight * videoAspect;
                offsetX = (renderWidth - window.innerWidth) / 2;
              }

              const pixelX = videoX * renderWidth - offsetX;
              const pixelY = videoY * renderHeight - offsetY;
              
              const ndcX = (pixelX / window.innerWidth) * 2 - 1;
              const ndcY = -(pixelY / window.innerHeight) * 2 + 1;

              const dx = indexF.x - thumb.x;
              const dy = indexF.y - thumb.y;
              const dz = indexF.z - thumb.z;
              const distance = Math.sqrt(dx*dx + dy*dy + dz*dz);
              
              return {
                isVisible: true,
                isPinched: distance < 0.05,
                pinchDistance: distance,
                // @ts-ignore
                cursor: { x: ndcX, y: ndcY }, // Using object literal, store copies it
                pixelCursor: { x: pixelX, y: pixelY }
              };
            }
            return { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
          };

          let leftNode = { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };
          let rightNode = { isVisible: false, isPinched: false, pixelCursor: { x: 0, y: 0 }, pinchDistance: 1 };

          // More reliable hand detection: Based on X position from the camera.
          // Since camera is mirrored (scale-x-100), smaller x means left side of the screen.
          const processedHands = results.landmarks.map(processHand);
          
          if (processedHands.length === 1) {
            // Default to right hand logic if one hand, or rely on category.
            const name = results.handednesses && results.handednesses[0] && results.handednesses[0][0] ? results.handednesses[0][0].categoryName : undefined; 
            if (name === 'Left') { // MediaPipe "Left" in mirrored selfie = User's Right hand
              rightNode = processedHands[0] as any;
            } else {
              leftNode = processedHands[0] as any;
            }
          } else if (processedHands.length >= 2) {
            // Sort by X coordinate (smaller X = left side of screen)
            processedHands.sort((a, b) => a.pixelCursor.x - b.pixelCursor.x);
            leftNode = processedHands[0] as any;
            rightNode = processedHands[1] as any;
          }
          
          updateHands(leftNode, rightNode);

          // Synthetic click logic (use both hands for clicking UI)
          [leftNode, rightNode].forEach(node => {
            if (node.isVisible && node.isPinched) {
              const prevPinchRef = node === rightNode ? prevPinch1 : prevPinch2;
              if (!prevPinchRef.current) {
                // Pinch started
                const el = document.elementFromPoint(node.pixelCursor.x, node.pixelCursor.y);
                if (el) {
                  const event = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX: node.pixelCursor.x,
                    clientY: node.pixelCursor.y
                  });
                  el.dispatchEvent(event);
                  
                  if (el.tagName.toLowerCase() === 'button') {
                    const htmlEl = el as HTMLElement;
                    htmlEl.style.transform = 'scale(0.9)';
                    setTimeout(() => htmlEl.style.transform = '', 150);
                  }
                }
              }
            }
          });
          
          prevPinch1.current = rightNode.isPinched;
          prevPinch2.current = leftNode.isPinched;
        } else {
          // Hands lost
          updateHands(
            { isVisible: false, isPinched: false, pinchDistance: 1 },
            { isVisible: false, isPinched: false, pinchDistance: 1 }
          );
        }
      }

      requestRef.current = requestAnimationFrame(detectContinuously);
    }

    setupCamera();

    return () => {
      active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [updateHands, setLoaderVisible]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-zinc-950 select-none">
      {/* Background Camera Feed */}
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-60"
      />
      
      <Canvas2D />
      
      {/* 3D AR Layer */}
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
          <ambientLight intensity={0.5} />
          <spotLight position={[10, 10, 10]} intensity={1.5} angle={0.2} penumbra={1} castShadow />
          <pointLight position={[-10, -10, -10]} intensity={0.5} />
          
          {/* Stunning reflections */}
          <Environment preset="city" background={false}>
            <Lightformer intensity={4} rotation-x={Math.PI / 2} position={[0, 5, -9]} scale={[10, 10, 1]} />
            <Lightformer intensity={2} rotation-y={Math.PI / 2} position={[-5, 1, -1]} scale={[10, 2, 1]} />
            <Lightformer intensity={2} rotation-y={-Math.PI / 2} position={[10, 1, 0]} scale={[10, 2, 1]} />
          </Environment>

          <MathModel />
        </Canvas>
      </div>

      {/* 2D Glass UI */}
      <OverlayUI />
    </div>
  );
}
