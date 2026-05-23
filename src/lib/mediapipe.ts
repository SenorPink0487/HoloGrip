import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export const initHandLandmarker = async () => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  
  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    // 提高到 4：让 tracker 能"看见"画面里的所有手，
    // 然后通过主用户锁定逻辑过滤旁观者，避免 numHands=2 时 MediaPipe
    // 随机挑选 2 只导致控制权在多人间跳变。
    numHands: 4,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  return handLandmarker;
};
