import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

export type HandData = {
  // 注意：使用前置摄像头时，由于画面往往是被镜像的，左右手的识别结果可能刚好相反。
  // 这里我们保留 MediaPipe 的原始输出。
  handedness: 'Left' | 'Right';
  landmarks: { x: number; y: number; z: number }[];
};

export const useHandTracking = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const handsDataRef = useRef<HandData[]>([]);
  
  const lastVideoTime = useRef(-1);
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameId = useRef<number>(0);

  useEffect(() => {
    let active = true;
    
    const init = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/mediapipe/hand_landmarker.task',
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5
        });
        
        if (!active) return;
        landmarkerRef.current = landmarker;
        setIsReady(true);
        startCamera();
      } catch (err) {
        console.error("Failed to initialize hand landmarker:", err);
      }
    };
    
    init();

    return () => {
      active = false;
      stopCamera();
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 1280, height: 720, facingMode: 'user' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const predictWebcam = () => {
    if (!videoRef.current || !landmarkerRef.current) return;
    const video = videoRef.current;
    
    if (video.currentTime !== lastVideoTime.current) {
      lastVideoTime.current = video.currentTime;
      const results = landmarkerRef.current.detectForVideo(video, performance.now());
      
      const parsedHands: HandData[] = [];
      if (results.landmarks && results.handednesses) {
        for (let i = 0; i < results.landmarks.length; i++) {
          const landmarks = results.landmarks[i];
          const handedness = results.handednesses[i][0].categoryName as 'Left' | 'Right';
          parsedHands.push({ handedness, landmarks });
        }
      }
      handsDataRef.current = parsedHands;
    }
    
    animationFrameId.current = requestAnimationFrame(predictWebcam);
  };

  useEffect(() => {
    if (isReady && videoRef.current) {
      videoRef.current.addEventListener('loadeddata', predictWebcam);
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadeddata', predictWebcam);
      }
    };
  }, [isReady]);

  return {
    videoRef,
    isReady,
    handsDataRef
  };
};
