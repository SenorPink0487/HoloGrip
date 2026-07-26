/**
 * strokeEngine.ts — GoodNotes-quality stroke rendering engine
 *
 * Core algorithms:
 * 1. One-Euro Filter for jitter suppression
 * 2. Catmull-Rom → Cubic Bézier spline fitting
 * 3. Variable-width Bézier stroke rendering via filled polygons
 * 4. Speed-based width modulation + taper (起收笔锥形)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
  tilt: number;
  timestamp: number;      // performance.now()
  pointerType: string;
}

export interface BezierSegment {
  p0: Vec2;
  cp1: Vec2;
  cp2: Vec2;
  p3: Vec2;
  w0: number;  // width at p0
  w3: number;  // width at p3
}

interface Vec2 {
  x: number;
  y: number;
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function vec2Dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function vec2Lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function vec2Normal(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: -dy / len, y: dx / len };
}

/** Evaluate cubic Bézier at parameter t */
function bezierPoint(p0: Vec2, cp1: Vec2, cp2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const uu = u * u;
  const uuu = uu * u;
  const tt = t * t;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * cp1.x + 3 * u * tt * cp2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * cp1.y + 3 * u * tt * cp2.y + ttt * p3.y,
  };
}

/** Tangent of cubic Bézier at t (not normalized) */
function bezierTangent(p0: Vec2, cp1: Vec2, cp2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  return {
    x: 3 * u * u * (cp1.x - p0.x) + 6 * u * t * (cp2.x - cp1.x) + 3 * t * t * (p3.x - cp2.x),
    y: 3 * u * u * (cp1.y - p0.y) + 6 * u * t * (cp2.y - cp1.y) + 3 * t * t * (p3.y - cp2.y),
  };
}

// ─── One-Euro Filter ────────────────────────────────────────────────────────

/**
 * Jitter-reduction filter that adapts its cutoff frequency based on speed.
 * Low speed → strong smoothing (remove jitter)
 * High speed → weak smoothing (preserve responsiveness)
 *
 * Reference: Casiez et al. "1€ Filter" CHI 2012
 */
class LowPassFilter {
  private y = 0;
  private s = 0;
  private initialized = false;

  filter(value: number, alpha: number): number {
    if (!this.initialized) {
      this.s = value;
      this.initialized = true;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = this.s;
    return this.y;
  }

  last(): number {
    return this.y;
  }

  reset(): void {
    this.initialized = false;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private lastTime = -1;
  private frequency: number;

  /**
   * @param frequency  Expected sample rate (Hz). Apple Pencil ≈ 240Hz
   * @param minCutoff  Minimum cutoff frequency. Lower → more smoothing
   * @param beta       Speed coefficient. Higher → less lag at fast motion
   * @param dCutoff    Derivative cutoff frequency
   */
  constructor(frequency = 120, minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.frequency = frequency;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(value: number, timestamp: number): number {
    let dt = this.lastTime < 0 ? 1.0 / this.frequency : (timestamp - this.lastTime);
    if (dt <= 0) dt = 1.0 / this.frequency;
    this.lastTime = timestamp;

    // Estimate derivative
    const dValue = this.xFilter.last() !== undefined
      ? (value - this.xFilter.last()) / dt
      : 0;

    const edValue = this.dxFilter.filter(dValue, this.alpha(this.dCutoff, dt));

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(edValue);
    return this.xFilter.filter(value, this.alpha(cutoff, dt));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTime = -1;
  }
}

// ─── Catmull-Rom → Cubic Bézier ─────────────────────────────────────────────

/**
 * Convert 4 Catmull-Rom control points to a cubic Bézier segment.
 * Tension α = 0.5 (centripetal parameterization feels most natural).
 */
function catmullToBezier(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2,
  alpha = 0.5,
): { cp1: Vec2; cp2: Vec2 } {
  // Simplified: use standard Catmull-Rom → Bézier conversion
  const d1 = vec2Dist(p0, p1);
  const d2 = vec2Dist(p1, p2);
  const d3 = vec2Dist(p2, p3);

  const d1a = Math.pow(d1, alpha);
  const d2a = Math.pow(d2, alpha);
  const d3a = Math.pow(d3, alpha);

  const d1_2a = Math.pow(d1, 2 * alpha);
  const d2_2a = Math.pow(d2, 2 * alpha);
  const d3_2a = Math.pow(d3, 2 * alpha);

  // Guard degenerate cases
  const eps = 1e-6;
  const b1x = d1_2a + 2 * d1a * d2a + d2_2a > eps
    ? (d1_2a * p2.x - d2_2a * p0.x + (2 * d1_2a + 3 * d1a * d2a + d2_2a) * p1.x) /
      (3 * d1a * (d1a + d2a))
    : p1.x + (p2.x - p0.x) / 6;
  const b1y = d1_2a + 2 * d1a * d2a + d2_2a > eps
    ? (d1_2a * p2.y - d2_2a * p0.y + (2 * d1_2a + 3 * d1a * d2a + d2_2a) * p1.y) /
      (3 * d1a * (d1a + d2a))
    : p1.y + (p2.y - p0.y) / 6;

  const b2x = d3_2a + 2 * d3a * d2a + d2_2a > eps
    ? (d3_2a * p1.x - d2_2a * p3.x + (2 * d3_2a + 3 * d3a * d2a + d2_2a) * p2.x) /
      (3 * d3a * (d3a + d2a))
    : p2.x - (p3.x - p1.x) / 6;
  const b2y = d3_2a + 2 * d3a * d2a + d2_2a > eps
    ? (d3_2a * p1.y - d2_2a * p3.y + (2 * d3_2a + 3 * d3a * d2a + d2_2a) * p2.y) /
      (3 * d3a * (d3a + d2a))
    : p2.y - (p3.y - p1.y) / 6;

  return {
    cp1: { x: b1x, y: b1y },
    cp2: { x: b2x, y: b2y },
  };
}

// ─── Variable-Width Bézier Rendering ────────────────────────────────────────

/** Number of sub-divisions per Bézier segment for polygon approximation */
const SUBDIVISIONS = 12;

/**
 * Render a single Bézier segment with smoothly varying width.
 * Instead of ctx.stroke(), we build a filled polygon from the left and right
 * offset curves (the "outline" of the stroke).
 */
export function renderBezierSegment(
  ctx: CanvasRenderingContext2D,
  seg: BezierSegment,
  color: string,
  eraser: boolean,
): void {
  const { p0, cp1, cp2, p3, w0, w3 } = seg;

  const leftContour: Vec2[] = [];
  const rightContour: Vec2[] = [];

  for (let i = 0; i <= SUBDIVISIONS; i++) {
    const t = i / SUBDIVISIONS;
    const pt = bezierPoint(p0, cp1, cp2, p3, t);
    const tan = bezierTangent(p0, cp1, cp2, p3, t);

    // Normal perpendicular to tangent
    const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
    const nx = -tan.y / len;
    const ny = tan.x / len;

    // Interpolate width with easing for smoother transitions
    const w = w0 + (w3 - w0) * t;
    const halfW = w / 2;

    leftContour.push({ x: pt.x + nx * halfW, y: pt.y + ny * halfW });
    rightContour.push({ x: pt.x - nx * halfW, y: pt.y - ny * halfW });
  }

  // Build filled polygon: left contour forward, right contour backward
  ctx.beginPath();
  ctx.moveTo(leftContour[0].x, leftContour[0].y);
  for (let i = 1; i < leftContour.length; i++) {
    ctx.lineTo(leftContour[i].x, leftContour[i].y);
  }
  for (let i = rightContour.length - 1; i >= 0; i--) {
    ctx.lineTo(rightContour[i].x, rightContour[i].y);
  }
  ctx.closePath();

  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill();
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Also draw round caps at start and end for clean termination
  ctx.beginPath();
  ctx.arc(leftContour[0].x / 2 + rightContour[0].x / 2,
          leftContour[0].y / 2 + rightContour[0].y / 2,
          w0 / 2, 0, Math.PI * 2);
  ctx.fill();

  const last = leftContour.length - 1;
  ctx.beginPath();
  ctx.arc(leftContour[last].x / 2 + rightContour[last].x / 2,
          leftContour[last].y / 2 + rightContour[last].y / 2,
          w3 / 2, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Stroke Width Computation ───────────────────────────────────────────────

/** How much velocity affects width: higher = thinner at speed */
const SPEED_SENSITIVITY = 0.0018;

/** Minimum width ratio relative to base width */
const MIN_WIDTH_RATIO = 0.25;

/** Maximum width ratio relative to base width */
const MAX_WIDTH_RATIO = 1.6;

/**
 * Compute the desired stroke width for a given sample.
 * Combines pressure, tilt, and velocity.
 */
export function computeStrokeWidth(
  sample: StrokePoint,
  velocity: number,
  baseThickness: number,
  isEraser: boolean,
): number {
  if (isEraser) {
    return baseThickness * (5.5 + sample.pressure * 3);
  }

  if (sample.pointerType === 'pen') {
    // Restrained pressure keeps mathematical handwriting legible instead of
    // turning natural grip changes into a calligraphy effect.
    const pressureFactor = 0.72 + sample.pressure * 0.45;

    // Tilt contribution: slight broadening when tilted (侧锋)
    const tiltFactor = 1.0 + sample.tilt * 0.12;

    // Speed contribution: faster → thinner (like real ink)
    const speedFactor = clamp(1.0 - velocity * SPEED_SENSITIVITY, MIN_WIDTH_RATIO, MAX_WIDTH_RATIO);

    return clamp(
      baseThickness * pressureFactor * tiltFactor * speedFactor,
      baseThickness * 0.65,
      baseThickness * 1.35,
    );
  }

  // Touch / mouse: light speed modulation only
  const speedFactor = clamp(1.0 - velocity * SPEED_SENSITIVITY * 0.5, 0.6, 1.2);
  return baseThickness * speedFactor;
}

// ─── Stroke Builder ─────────────────────────────────────────────────────────

/** Minimum distance² to accept a new sample (dedup) */
const MIN_SAMPLE_DIST_SQ = 0.35;

interface ProcessedPoint extends Vec2 {
  width: number;
  timestamp: number;
}

/**
 * StrokeBuilder accumulates filtered samples, fits Catmull-Rom curves,
 * and outputs renderable Bézier segments in real-time.
 *
 * Usage:
 *   const builder = new StrokeBuilder(baseThickness, isEraser);
 *   // on each pointer event:
 *   const segments = builder.addSample(sample);
 *   for (const seg of segments) renderBezierSegment(ctx, seg, color, eraser);
 *   // on pointer up:
 *   const finalSegs = builder.finish();
 *   for (const seg of finalSegs) renderBezierSegment(ctx, seg, color, eraser);
 */
export class StrokeBuilder {
  private points: ProcessedPoint[] = [];
  private filterX: OneEuroFilter;
  private filterY: OneEuroFilter;
  private filterW: OneEuroFilter;
  private baseThickness: number;
  private isEraser: boolean;
  private lastVelocity = 0;
  private emittedUpTo = 0;  // how many segments have been emitted

  // Width smoothing buffer for temporal consistency
  private widthBuffer: number[] = [];
  private readonly widthBufferSize = 4;

  constructor(baseThickness: number, isEraser: boolean) {
    this.baseThickness = baseThickness;
    this.isEraser = isEraser;

    // Keep handwriting stable at slow speed without making the ink trail the tip.
    // The previous 1Hz cutoff looked smooth in a demo, but added noticeable lag
    // during normal-sized Chinese characters and equations.
    const freq = 120;
    const minCutoff = isEraser ? 6.0 : 4.0;
    const beta = isEraser ? 0.0 : 0.018;
    this.filterX = new OneEuroFilter(freq, minCutoff, beta);
    this.filterY = new OneEuroFilter(freq, minCutoff, beta);
    this.filterW = new OneEuroFilter(freq, 5.0, 0.01);
  }

  /**
   * Feed a new raw sample. Returns newly generated Bézier segments
   * that should be rendered immediately.
   */
  addSample(sample: StrokePoint): BezierSegment[] {
    const t = sample.timestamp;

    // Compute velocity from last point
    let velocity = 0;
    if (this.points.length > 0) {
      const prev = this.points[this.points.length - 1];
      const dt = t - prev.timestamp;
      if (dt > 0) {
        const dist = vec2Dist(prev, { x: sample.x, y: sample.y });
        velocity = dist / dt;  // px/ms
      }
    }
    // Smooth velocity
    this.lastVelocity = this.lastVelocity * 0.6 + velocity * 0.4;

    // Filter position
    const fx = this.filterX.filter(sample.x, t);
    const fy = this.filterY.filter(sample.y, t);

    // Compute and smooth width
    const rawWidth = computeStrokeWidth(sample, this.lastVelocity, this.baseThickness, this.isEraser);
    this.widthBuffer.push(rawWidth);
    if (this.widthBuffer.length > this.widthBufferSize) this.widthBuffer.shift();
    const avgWidth = this.widthBuffer.reduce((a, b) => a + b, 0) / this.widthBuffer.length;
    const fw = this.filterW.filter(avgWidth, t);

    // Dedup: skip if too close to last point
    if (this.points.length > 0) {
      const prev = this.points[this.points.length - 1];
      const dx = fx - prev.x;
      const dy = fy - prev.y;
      if (dx * dx + dy * dy < MIN_SAMPLE_DIST_SQ) {
        return [];
      }
    }

    this.points.push({ x: fx, y: fy, width: fw, timestamp: t });

    // Start emitting after the third point. Duplicating the first control point
    // gives the stroke a clean rounded start and avoids the visible "ink gap"
    // that the old four-point window produced.
    return this.emitNewSegments();
  }

  /**
   * Called when stroke ends. Emits final segments including taper-out.
   */
  finish(): BezierSegment[] {
    if (this.points.length < 2) return [];

    // Emit any remaining segments
    const segments = this.emitNewSegments(true);

    return segments;
  }

  /**
   * Get all accumulated points (for debug / snapshot).
   */
  getPointCount(): number {
    return this.points.length;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private emitNewSegments(flush = false): BezierSegment[] {
    const pts = this.points;
    const segments: BezierSegment[] = [];

    // Catmull-Rom needs window of 4 points: p[i-1], p[i], p[i+1], p[i+2]
    // Emit segment for the curve between p[i] and p[i+1]
    const limit = flush ? pts.length - 1 : pts.length - 2;

    for (let i = Math.max(0, this.emittedUpTo); i < limit; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[Math.min(i + 1, pts.length - 1)];
      const p3 = pts[Math.min(i + 2, pts.length - 1)];

      const { cp1, cp2 } = catmullToBezier(p0, p1, p2, p3);

      segments.push({
        p0: p1,
        cp1,
        cp2,
        p3: p2,
        w0: p1.width,
        w3: p2.width,
      });
    }

    this.emittedUpTo = Math.max(this.emittedUpTo, limit);
    return segments;
  }

  /** Fallback for very short strokes (dots, short taps) */
  private buildFallbackSegments(): BezierSegment[] {
    const pts = this.points;
    if (pts.length === 0) return [];

    if (pts.length === 1) {
      // Single dot — emit a tiny circle-like segment
      const p = pts[0];
      const r = p.width / 2;
      return [{
        p0: { x: p.x - r, y: p.y },
        cp1: { x: p.x - r, y: p.y - r * 0.55 },
        cp2: { x: p.x + r, y: p.y - r * 0.55 },
        p3: { x: p.x + r, y: p.y },
        w0: p.width * 0.3,
        w3: p.width * 0.3,
      }];
    }

    // 2-3 points: simple linear Bézier
    const segments: BezierSegment[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = vec2Lerp(a, b, 0.5);
      segments.push({
        p0: a,
        cp1: vec2Lerp(a, mid, 0.5),
        cp2: vec2Lerp(mid, b, 0.5),
        p3: b,
        w0: a.width,
        w3: b.width,
      });
    }
    return segments;
  }
}

// ─── Batch Renderer ─────────────────────────────────────────────────────────

/**
 * Render an array of Bézier segments efficiently with shared canvas state.
 */
export function renderStrokeSegments(
  ctx: CanvasRenderingContext2D,
  segments: BezierSegment[],
  color: string,
  eraser: boolean,
): void {
  if (segments.length === 0) return;

  // Set composite operation once
  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = color;
  }

  for (const seg of segments) {
    renderBezierSegmentFast(ctx, seg);
  }
}

/**
 * Optimized version: assumes fillStyle / globalCompositeOperation already set.
 */
function renderBezierSegmentFast(
  ctx: CanvasRenderingContext2D,
  seg: BezierSegment,
): void {
  const { p0, cp1, cp2, p3, w0, w3 } = seg;

  // Adaptive subdivision count based on segment length
  const chordLen = vec2Dist(p0, p3);
  const subdivisions = clamp(Math.ceil(chordLen / 3), 4, 20);

  ctx.beginPath();

  // Build outline in one pass: left contour, then right contour reversed
  let firstLx = 0, firstLy = 0;
  let lastRx = 0, lastRy = 0;
  const rightXs: number[] = new Array(subdivisions + 1);
  const rightYs: number[] = new Array(subdivisions + 1);

  for (let i = 0; i <= subdivisions; i++) {
    const t = i / subdivisions;
    const pt = bezierPoint(p0, cp1, cp2, p3, t);
    const tan = bezierTangent(p0, cp1, cp2, p3, t);

    const len = Math.sqrt(tan.x * tan.x + tan.y * tan.y) || 1;
    const nx = -tan.y / len;
    const ny = tan.x / len;

    const w = w0 + (w3 - w0) * t;
    const halfW = w / 2;

    const lx = pt.x + nx * halfW;
    const ly = pt.y + ny * halfW;
    rightXs[i] = pt.x - nx * halfW;
    rightYs[i] = pt.y - ny * halfW;

    if (i === 0) {
      ctx.moveTo(lx, ly);
      firstLx = lx;
      firstLy = ly;
    } else {
      ctx.lineTo(lx, ly);
    }
  }

  // Right contour in reverse
  for (let i = subdivisions; i >= 0; i--) {
    ctx.lineTo(rightXs[i], rightYs[i]);
  }

  ctx.closePath();
  ctx.fill();

  // Round cap at start
  const startCx = (firstLx + rightXs[0]) / 2;
  const startCy = (firstLy + rightYs[0]) / 2;
  if (w0 > 0.5) {
    ctx.beginPath();
    ctx.arc(startCx, startCy, w0 / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Round cap at end
  if (w3 > 0.5) {
    const endPt = bezierPoint(p0, cp1, cp2, p3, 1);
    ctx.beginPath();
    ctx.arc(endPt.x, endPt.y, w3 / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
