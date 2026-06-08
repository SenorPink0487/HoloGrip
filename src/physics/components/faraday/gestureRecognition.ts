export type HandLandmark = {
  x: number;
  y: number;
  z?: number;
};

export type GestureKind = 'open' | 'pinch' | 'fist';

export type GestureClassification = {
  kind: GestureKind;
  curledFingers: number;
  thumbIndexDistance: number;
  fistScore: number;
};

type GestureStabilizerOptions = {
  startFrames?: number;
  stopFrames?: number;
};

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

const distance3D = (a: HandLandmark, b: HandLandmark) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const distance2D = (a: HandLandmark, b: HandLandmark) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
};

const averagePoint = (points: HandLandmark[]): HandLandmark => {
  const total = points.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
      z: (acc.z ?? 0) + (point.z ?? 0),
    }),
    { x: 0, y: 0, z: 0 }
  );

  return {
    x: total.x / points.length,
    y: total.y / points.length,
    z: (total.z ?? 0) / points.length,
  };
};

const fingerCurlRatio = (landmarks: HandLandmark[], joints: readonly number[]) => {
  const [mcpIndex, pipIndex, dipIndex, tipIndex] = joints;
  const mcp = landmarks[mcpIndex];
  const pip = landmarks[pipIndex];
  const dip = landmarks[dipIndex];
  const tip = landmarks[tipIndex];

  const totalLength = distance3D(mcp, pip) + distance3D(pip, dip) + distance3D(dip, tip);
  if (totalLength === 0) return 1;

  return distance3D(mcp, tip) / totalLength;
};

export const classifyHandGesture = (landmarks: HandLandmark[]): GestureClassification => {
  if (landmarks.length < 21) {
    return {
      kind: 'open',
      curledFingers: 0,
      thumbIndexDistance: Number.POSITIVE_INFINITY,
      fistScore: 0,
    };
  }

  const palmCenter = averagePoint([landmarks[0], landmarks[5], landmarks[9], landmarks[13], landmarks[17]]);
  const palmWidth = Math.max(distance3D(landmarks[5], landmarks[17]), 0.001);
  const thumbIndexDistance = distance3D(landmarks[4], landmarks[8]) / palmWidth;
  const thumbIndexScreenDistance = distance2D(landmarks[4], landmarks[8]);
  const thumbPalmDistance = distance3D(landmarks[4], palmCenter) / palmWidth;

  const curlRatios = FINGERS.map((joints) => fingerCurlRatio(landmarks, joints));
  const curledFingers = curlRatios.filter((ratio) => ratio < 0.72).length;
  const tightlyCurledFingers = curlRatios.filter((ratio) => ratio < 0.64).length;
  const thumbFolded = thumbPalmDistance < 0.46;
  const isFist = curledFingers >= 4 || (curledFingers >= 3 && thumbFolded);

  if (isFist) {
    return {
      kind: 'fist',
      curledFingers,
      thumbIndexDistance,
      fistScore: tightlyCurledFingers + (thumbFolded ? 1 : 0),
    };
  }

  const isThumbIndexClose = thumbIndexScreenDistance < 0.08 || thumbIndexDistance < 0.34;
  const isPinch = isThumbIndexClose && curledFingers <= 1;
  return {
    kind: isPinch ? 'pinch' : 'open',
    curledFingers,
    thumbIndexDistance,
    fistScore: tightlyCurledFingers + (thumbFolded ? 1 : 0),
  };
};

export const createGestureStabilizer = ({
  startFrames = 3,
  stopFrames = 3,
}: GestureStabilizerOptions = {}) => {
  let active = false;
  let fistFrames = 0;
  let nonFistFrames = 0;

  return {
    update(kind: GestureKind) {
      if (kind === 'fist') {
        fistFrames += 1;
        nonFistFrames = 0;
      } else {
        nonFistFrames += 1;
        fistFrames = 0;
      }

      if (!active && fistFrames >= startFrames) {
        active = true;
      }

      if (active && nonFistFrames >= stopFrames) {
        active = false;
      }

      return active;
    },
    reset() {
      active = false;
      fistFrames = 0;
      nonFistFrames = 0;
    },
  };
};
