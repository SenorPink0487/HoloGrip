import { useCallback, useRef } from 'react';
import { isIPadOS } from '../lib/platform';

export interface PencilPoint {
  x: number;
  y: number;
}

export interface PencilSample extends PencilPoint {
  pressure: number;
  tilt: number;
  pointerType: string;
}

export type AppleTouch = Touch & {
  altitudeAngle?: number;
  azimuthAngle?: number;
  force?: number;
  touchType?: string;
};

type ToPoint = (clientX: number, clientY: number) => PencilPoint;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function useApplePencilInput(toPoint: ToPoint) {
  const lastPenInputAt = useRef(0);

  const markPenInput = useCallback(() => {
    lastPenInputAt.current = Date.now();
  }, []);

  const isRecentPenInput = useCallback((windowMs = 700) => {
    return Date.now() - lastPenInputAt.current < windowMs;
  }, []);

  const getPointerSample = useCallback((e: PointerEvent): PencilSample => {
    const point = toPoint(e.clientX, e.clientY);
    const isPen = e.pointerType === 'pen';
    const pressure = isPen
      ? clamp(e.pressure || 0.35, 0.08, 1)
      : e.pointerType === 'touch'
        ? clamp(e.pressure || 0.5, 0.25, 1)
        : 0.55;
    const tilt = Math.hypot(e.tiltX || 0, e.tiltY || 0) / 90;

    if (isPen) markPenInput();

    return {
      ...point,
      pressure,
      tilt: clamp(tilt, 0, 1),
      pointerType: e.pointerType || 'mouse',
    };
  }, [markPenInput, toPoint]);

  const getTouchSample = useCallback((touch: AppleTouch): PencilSample => {
    const point = toPoint(touch.clientX, touch.clientY);
    const isStylus = touch.touchType === 'stylus';
    const pressure = clamp(touch.force || (isStylus ? 0.45 : 0.5), isStylus ? 0.08 : 0.25, 1);
    const tilt = typeof touch.altitudeAngle === 'number'
      ? clamp(1 - touch.altitudeAngle / (Math.PI / 2), 0, 1)
      : 0;

    if (isStylus) markPenInput();

    return {
      ...point,
      pressure,
      tilt,
      pointerType: isStylus ? 'pen' : 'touch',
    };
  }, [markPenInput, toPoint]);

  const shouldAcceptPointer = useCallback((e: PointerEvent) => {
    if (isIPadOS && (e.pointerType === 'pen' || e.pointerType === 'touch')) return false;
    if (e.pointerType === 'touch' && isRecentPenInput()) return false;
    return e.isPrimary || e.pointerType === 'pen' || e.pointerType === 'mouse';
  }, [isRecentPenInput]);

  const pickDrawingTouch = useCallback((touches: TouchList) => {
    for (let i = 0; i < touches.length; i += 1) {
      const touch = touches[i] as AppleTouch;
      if (touch.touchType === 'stylus') return touch;
    }
    if (isRecentPenInput()) return null;
    return touches[0] as AppleTouch | undefined;
  }, [isRecentPenInput]);

  return {
    getPointerSample,
    getTouchSample,
    shouldAcceptPointer,
    pickDrawingTouch,
    markPenInput,
    isRecentPenInput,
  };
}
