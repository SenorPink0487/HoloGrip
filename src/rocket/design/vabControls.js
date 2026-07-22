/**
 * KSP-like VAB camera / pointer conventions while placing parts.
 *
 * Place mode:
 *   LMB  — place part (if snapped)
 *   RMB  — orbit camera
 *   MMB / wheel — dolly
 *   Esc / RMB click without drag — cancel (handled by host)
 *
 * Browse mode:
 *   LMB  — orbit
 *   RMB  — pan
 *   MMB / wheel — dolly
 */

import { MOUSE, TOUCH } from 'three';

/**
 * @param {import('three/examples/jsm/controls/OrbitControls.js').OrbitControls} controls
 * @param {boolean} placing
 */
export function applyVabCameraButtons(controls, placing) {
  if (!controls) return;
  if (placing) {
    // Disable LMB orbit so left-click is free for place
    controls.mouseButtons.LEFT = -1;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = MOUSE.ROTATE;
    if (controls.touches) {
      controls.touches.ONE = TOUCH.ROTATE;
      controls.touches.TWO = TOUCH.DOLLY_PAN;
    }
  } else {
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = MOUSE.PAN;
    if (controls.touches) {
      controls.touches.ONE = TOUCH.ROTATE;
      controls.touches.TWO = TOUCH.DOLLY_PAN;
    }
  }
}

/**
 * Movement threshold (px) above which a pointer gesture is treated as camera drag, not a click.
 */
export const VAB_CLICK_SLOP_PX = 6;
