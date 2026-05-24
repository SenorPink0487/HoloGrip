import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export const initHandLandmarker = async () => {
  // 使用本地化资源（public/mediapipe/），离线可用
  // wasm 运行时由 vite 自动从 public 目录拷贝到 dist；模型文件 ~8MB
  const vision = await FilesetResolver.forVisionTasks(
    `${import.meta.env.BASE_URL}mediapipe/wasm`
  );

  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `${import.meta.env.BASE_URL}mediapipe/hand_landmarker.task`,
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
