import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

/** Shared with HoloPhysics: single copy under public/assets/mediapipe/ */
export const MEDIAPIPE_BASE = `${import.meta.env.BASE_URL}assets/mediapipe`;
export const MEDIAPIPE_WASM_DIR = `${MEDIAPIPE_BASE}/wasm`;
export const MEDIAPIPE_MODEL_PATH = `${MEDIAPIPE_BASE}/hand_landmarker.task`;

export const initHandLandmarker = async () => {
  // 全站共用一份模型与 wasm（public/assets/mediapipe/），离线可用
  const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_DIR);

  const handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MEDIAPIPE_MODEL_PATH,
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
