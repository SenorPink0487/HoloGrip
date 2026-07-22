/** World units roughly = meters, scaled for a playable 3D view */

export const BALL_R = 0.0285;
export const BALL_D = BALL_R * 2;

// Standard 9-foot table playing area ~ 2.54m x 1.27m
export const TABLE_LENGTH = 2.54;
export const TABLE_WIDTH = 1.27;
export const RAIL_HEIGHT = 0.038;
export const RAIL_WIDTH = 0.065;
/**
 * Pocket sizing (world units ≈ meters), tuned to American 9-ft regulation mouths.
 * WPA/BCA-ish: corner opening ~4.5–4.625" (114–118 mm), side ~5–5.125" (127–130 mm).
 * Capture uses ball-center distance; radius ≈ mouth width / 2.
 */
export const POCKET_R = 0.058; // visual / geometry base (corner scale)
export const POCKET_CAPTURE_CORNER = 0.058; // ~116 mm effective mouth
export const POCKET_CAPTURE_SIDE = 0.0645; // ~129 mm effective mouth (sides larger)
export const CLOTH_Y = 0;
export const BALL_Y = BALL_R;

/** Capture radius for a pocket descriptor from getPocketPositions(). */
export function pocketCaptureRadius(pocket) {
  return pocket?.corner ? POCKET_CAPTURE_CORNER : POCKET_CAPTURE_SIDE;
}

// Visual extras
export const LEG_HEIGHT = 0.72;
export const APRON = 0.08;

// Pool-specific physics. cannon-es resolves impacts; the cloth model in
// physics.js handles sliding, rolling resistance, and spin decay explicitly.
export const PHYSICS = Object.freeze({
  ballMass: 0.17,
  gravity: 9.82,
  fixedTimeStep: 1 / 120,
  maxSubSteps: 8,
  maxFrameDelta: 1 / 15,
  ballRestitution: 0.93,
  cushionRestitution: 0.74,
  ballBallFriction: 0.035,
  cushionFriction: 0.09,
  slidingFriction: 0.20,
  rollingDeceleration: 0.14,
  spinDeceleration: 0.75,
  slipSpeedThreshold: 0.018,
  stopLinearSpeed: 0.018,
  stopSlipSpeed: 0.025,
  stopSpinSpeed: 0.16,
  settleTime: 0.20,
  surfaceTolerance: 0.004,
});

// Compatibility aliases for modules that only need material values.
export const RESTITUTION_BALL = PHYSICS.ballRestitution;
export const RESTITUTION_CUSHION = PHYSICS.cushionRestitution;
export const FRICTION_BALL = PHYSICS.ballBallFriction;
export const FRICTION_CLOTH = PHYSICS.slidingFriction;
export const SLEEP_SPEED = PHYSICS.stopLinearSpeed;

// Cue
export const MAX_POWER = 4.8;
export const MIN_POWER = 0.35;
export const CUE_LENGTH = 1.45;

// American-style pool ball colors
export const BALL_DEFS = [
  { id: 0, name: '母球', color: 0xf4efe6, stripe: false, isCue: true },
  { id: 1, name: '1', color: 0xf1c40f, stripe: false },
  { id: 2, name: '2', color: 0x1e5aaf, stripe: false },
  { id: 3, name: '3', color: 0xd32f2f, stripe: false },
  { id: 4, name: '4', color: 0x5b2c8a, stripe: false },
  { id: 5, name: '5', color: 0xe67e22, stripe: false },
  { id: 6, name: '6', color: 0x1b7a3d, stripe: false },
  { id: 7, name: '7', color: 0x7b1f1f, stripe: false },
  { id: 8, name: '8', color: 0x111111, stripe: false },
  { id: 9, name: '9', color: 0xf1c40f, stripe: true },
  { id: 10, name: '10', color: 0x1e5aaf, stripe: true },
  { id: 11, name: '11', color: 0xd32f2f, stripe: true },
  { id: 12, name: '12', color: 0x5b2c8a, stripe: true },
  { id: 13, name: '13', color: 0xe67e22, stripe: true },
  { id: 14, name: '14', color: 0x1b7a3d, stripe: true },
  { id: 15, name: '15', color: 0x7b1f1f, stripe: true },
];
