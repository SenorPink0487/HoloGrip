import { HandLandmark } from './gestureRecognition';

export type CoverTransformInput = {
  containerWidth: number;
  containerHeight: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type CoverTransform = {
  containerWidth: number;
  containerHeight: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
};

export const computeCoverTransform = ({
  containerWidth,
  containerHeight,
  sourceWidth,
  sourceHeight,
}: CoverTransformInput): CoverTransform => {
  const scale = Math.max(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  return {
    containerWidth,
    containerHeight,
    drawWidth,
    drawHeight,
    offsetX: (containerWidth - drawWidth) / 2,
    offsetY: (containerHeight - drawHeight) / 2,
  };
};

export const mapLandmarkToCanvas = (
  landmark: HandLandmark,
  transform: CoverTransform,
  mirrored: boolean
) => {
  const sourceX = transform.offsetX + landmark.x * transform.drawWidth;
  const x = mirrored ? transform.containerWidth - sourceX : sourceX;
  const y = transform.offsetY + landmark.y * transform.drawHeight;

  return { x, y };
};

const blendLandmark = (previous: HandLandmark, current: HandLandmark): HandLandmark => {
  const dx = current.x - previous.x;
  const dy = current.y - previous.y;
  const dz = (current.z ?? 0) - (previous.z ?? 0);
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  
  // At 60 FPS, the distance per frame is smaller. 
  // We increase the weights to make it much more responsive ("跟手").
  const currentWeight = distance > 0.03 ? 0.95 : 0.75;
  const previousWeight = 1 - currentWeight;

  return {
    x: previous.x * previousWeight + current.x * currentWeight,
    y: previous.y * previousWeight + current.y * currentWeight,
    z: (previous.z ?? 0) * previousWeight + (current.z ?? 0) * currentWeight,
  };
};

export const smoothLandmarks = (
  previous: HandLandmark[] | undefined,
  current: HandLandmark[]
): HandLandmark[] => {
  if (!previous || previous.length !== current.length) {
    return current.map((point) => ({ ...point }));
  }

  return current.map((point, index) => blendLandmark(previous[index], point));
};
