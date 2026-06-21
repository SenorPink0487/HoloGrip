import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PMREMGenerator } from 'three';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { LogOut } from 'lucide-react';
import { ARErrorBoundary } from './ARErrorBoundary';
import { CameraPermissionModal } from './CameraPermissionModal';
import { Canvas2D } from './Canvas2D';
import { MathModel } from './MathModel';
import { OverlayUI } from './OverlayUI';
import { useARStore } from '../store';
import { isIPadOS } from '../lib/platform';
import type { RawHandObservation } from '../lib/handTracking';

type HandTrackingModule = typeof import('../lib/handTracking');

interface ARExperienceProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
}

function getWebGLPixelRatio() {
  if (!isIPadOS) return window.devicePixelRatio || 1;
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

function OfflineRoomEnvironment() {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const envTexture = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04);
    pmrem.dispose();
    return target.texture;
  }, [gl]);

  useLayoutEffect(() => {
    const prev = scene.environment;
    scene.environment = envTexture;
    return () => {
      scene.environment = prev;
      envTexture.dispose();
    };
  }, [scene, envTexture]);

  return null;
}

export function ARExperience({ stageRef }: ARExperienceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestRef = useRef<number>(undefined);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const handTrackingModuleRef = useRef<HandTrackingModule | null>(null);
  const prevPinch1 = useRef(false);
  const prevPinch2 = useRef(false);

  const updateHands = useARStore(state => state.updateHands);
  const setLoaderVisible = useARStore(state => state.setLoaderVisible);

  const [showCameraPermissionModal, setShowCameraPermissionModal] = useState(false);
  const [cameraTrigger, setCameraTrigger] = useState(0);

  useEffect(() => {
    let active = true;

    const resetHands = () => {
      handTrackingModuleRef.current?.handTracker.reset();
      updateHands(
        { isVisible: false, isPinched: false, pinchDistance: 1 },
        { isVisible: false, isPinched: false, pinchDistance: 1 }
      );
    };

    const stopCamera = () => {
      if (!videoRef.current?.srcObject) return;
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    };

    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 1280, height: 720 }
        });

        if (!active || !videoRef.current) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const video = videoRef.current;
        stopCamera();
        video.srcObject = stream;

        let onReadyFired = false;
        const fireOnce = () => {
          if (onReadyFired) return;
          onReadyFired = true;
          video.removeEventListener("loadeddata", fireOnce);
          clearTimeout(fallbackTimer);
          if (active) initVision();
        };
        const fallbackTimer = setTimeout(() => {
          if (!onReadyFired && active) {
            console.warn("loadeddata not fired in 800ms, force initVision");
            fireOnce();
          }
        }, 800);
        if (video.readyState >= 2) {
          fireOnce();
        } else {
          video.addEventListener("loadeddata", fireOnce);
        }

        try {
          await video.play();
        } catch (playErr) {
          console.warn("video.play() failed, will retry on next entry", playErr);
        }
      } catch (err) {
        console.error("Camera access denied or failed", err);
        setLoaderVisible(false);
        setShowCameraPermissionModal(true);
      }
    }

    async function initVision() {
      const [{ initHandLandmarker }, handTracking] = await Promise.all([
        import('../lib/mediapipe'),
        import('../lib/handTracking'),
      ]);
      if (!active) return;
      handTrackingModuleRef.current = handTracking;
      const landmarker = await initHandLandmarker();
      if (!active) {
        landmarker.close();
        return;
      }
      handLandmarkerRef.current = landmarker;
      setLoaderVisible(false);
      detectContinuously(handTracking);
    }

    let lastVideoTime = -1;
    function detectContinuously(handTracking: HandTrackingModule) {
      if (!active || !videoRef.current || !handLandmarkerRef.current) return;

      const video = videoRef.current;
      const startTimeMs = performance.now();

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
        const nowMs = startTimeMs;
        const observations: RawHandObservation[] = [];

        if (results.landmarks && results.landmarks.length > 0) {
          for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            if (!landmarks) continue;
            const indexF = landmarks[8];
            const thumb = landmarks[4];
            if (!indexF || !thumb) continue;

            const videoX = 1.0 - ((indexF.x + thumb.x) / 2);
            const videoY = (indexF.y + thumb.y) / 2;
            const stage = stageRef.current;
            const stageW = stage?.clientWidth ?? window.innerWidth;
            const stageH = stage?.clientHeight ?? window.innerHeight;

            const videoAspect = 1280 / 720;
            const screenAspect = stageW / stageH;
            let renderWidth = stageW;
            let renderHeight = stageH;
            let offsetX = 0;
            let offsetY = 0;
            if (screenAspect > videoAspect) {
              renderHeight = stageW / videoAspect;
              offsetY = (renderHeight - stageH) / 2;
            } else {
              renderWidth = stageH * videoAspect;
              offsetX = (renderWidth - stageW) / 2;
            }
            const pixelX = videoX * renderWidth - offsetX;
            const pixelY = videoY * renderHeight - offsetY;
            const ndcX = (pixelX / stageW) * 2 - 1;
            const ndcY = -(pixelY / stageH) * 2 + 1;

            const dx = indexF.x - thumb.x;
            const dy = indexF.y - thumb.y;
            const dz = indexF.z - thumb.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

            const hCat = results.handednesses && results.handednesses[i] && results.handednesses[i][0];
            const rawHandedness =
              hCat?.categoryName === 'Left' ? 'Left'
              : hCat?.categoryName === 'Right' ? 'Right'
              : undefined;
            const confidence = hCat?.score ?? 0.5;

            observations.push({
              ndcX,
              ndcY,
              pixelX,
              pixelY,
              isPinched: distance < 0.05,
              pinchDistance: distance,
              rawHandedness,
              confidence,
            });
          }
        }

        const { left, right } = handTracking.handTracker.update(observations, nowMs);
        const leftNode = {
          isVisible: left.isVisible,
          isPinched: left.isPinched,
          pinchDistance: left.pinchDistance,
          cursor: { x: left.ndcX, y: left.ndcY },
          pixelCursor: { x: left.pixelX, y: left.pixelY },
        };
        const rightNode = {
          isVisible: right.isVisible,
          isPinched: right.isPinched,
          pinchDistance: right.pinchDistance,
          cursor: { x: right.ndcX, y: right.ndcY },
          pixelCursor: { x: right.pixelX, y: right.pixelY },
        };

        // @ts-expect-error - cursor is copied into THREE.Vector2 in the store.
        updateHands(leftNode, rightNode);

        const arState = useARStore.getState();
        const rightHandCanClick = !arState.isPenActive && !arState.isLineDrawingActive;
        const triggerSyntheticClick = (x: number, y: number) => {
          const stage = stageRef.current;
          const rect = stage?.getBoundingClientRect();
          const cx = (rect?.left ?? 0) + x;
          const cy = (rect?.top ?? 0) + y;
          const el = document.elementFromPoint(cx, cy);
          if (!el) return;
          const event = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: cx,
            clientY: cy,
          });
          el.dispatchEvent(event);
          if (el.tagName.toLowerCase() === 'button') {
            const htmlEl = el as HTMLElement;
            htmlEl.style.transform = 'scale(0.9)';
            setTimeout(() => (htmlEl.style.transform = ''), 150);
          }
        };

        const leftCanClick = left.isVisible && !left.isCoasting;
        const rightCanClick = right.isVisible && !right.isCoasting;

        if (leftCanClick && leftNode.isPinched && !prevPinch2.current) {
          triggerSyntheticClick(leftNode.pixelCursor.x, leftNode.pixelCursor.y);
        }
        if (rightHandCanClick && rightCanClick && rightNode.isPinched && !prevPinch1.current) {
          triggerSyntheticClick(rightNode.pixelCursor.x, rightNode.pixelCursor.y);
        }

        prevPinch1.current = rightNode.isPinched;
        prevPinch2.current = leftNode.isPinched;
      }

      requestRef.current = requestAnimationFrame(() => detectContinuously(handTracking));
    }

    const hasPermission = localStorage.getItem('camera_permission_granted') === 'true';
    if (!hasPermission) {
      setShowCameraPermissionModal(true);
      setLoaderVisible(false);
    } else {
      setLoaderVisible(true);
      setupCamera();
    }

    return () => {
      active = false;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      handLandmarkerRef.current?.close();
      handLandmarkerRef.current = null;
      stopCamera();
      resetHands();
      setLoaderVisible(false);
    };
  }, [cameraTrigger, setLoaderVisible, stageRef, updateHands]);

  const handleConfirmPermission = () => {
    localStorage.setItem('camera_permission_granted', 'true');
    setShowCameraPermissionModal(false);
    setLoaderVisible(true);
    setCameraTrigger(prev => prev + 1);
  };

  const handleCancelPermission = () => {
    setShowCameraPermissionModal(false);
    useARStore.getState().setActiveTab('whiteboard');
  };

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover -scale-x-100 opacity-60"
      />

      <div className="absolute inset-0 z-10 pointer-events-none">
        <ARErrorBoundary>
          <Canvas
            camera={{ position: [0, 0, 5], fov: 45 }}
            gl={{ antialias: !isIPadOS, powerPreference: 'high-performance' }}
            dpr={getWebGLPixelRatio()}
          >
            <ambientLight intensity={0.5} />
            <spotLight position={[10, 10, 10]} intensity={1.5} angle={0.2} penumbra={1} castShadow />
            <pointLight position={[-10, -10, -10]} intensity={0.5} />
            <OfflineRoomEnvironment />
            <MathModel />
          </Canvas>
        </ARErrorBoundary>
      </div>

      <Canvas2D />
      <OverlayUI />

      <button
        onClick={() => {
          useARStore.getState().setActiveTab('whiteboard');
        }}
        className="absolute top-[calc(env(safe-area-inset-top)+1rem)] right-[calc(env(safe-area-inset-right)+1rem)] z-50 flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-zinc-900/80 border border-white/10 text-zinc-200 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 active:scale-95 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.3)] backdrop-blur-md cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span className="text-xs sm:text-sm font-medium">退出 AR 空间</span>
      </button>

      {showCameraPermissionModal && (
        <CameraPermissionModal
          isOpen={showCameraPermissionModal}
          onClose={handleCancelPermission}
          onConfirm={handleConfirmPermission}
        />
      )}
    </>
  );
}
