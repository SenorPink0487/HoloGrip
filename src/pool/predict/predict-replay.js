/**
 * Scrub ghost balls along predicted paths for a short teaching playback.
 */
export class PredictReplay {
  constructor(predictView) {
    this.view = predictView;
    this.playing = false;
    this.t = 0;
    this.duration = 2.4;
    this.result = null;
    this.ballMeta = [];
    this.onStep = null; // (stepId) => void
    this._lastStep = null;
  }

  /**
   * @param {object} result predict result with paths + finals
   * @param {Array} ballMeta
   */
  start(result, ballMeta = []) {
    if (!result?.paths || result.paths.size === 0) return false;
    this.result = result;
    this.ballMeta = ballMeta;
    this.playing = true;
    this.t = 0;
    this._lastStep = null;
    this.onStep?.('launch');
    return true;
  }

  stop() {
    this.playing = false;
    this.t = 0;
    this._lastStep = null;
    // Restore final ghosts
    if (this.result) this.view.show(this.result, this.ballMeta);
  }

  /**
   * @param {number} dt
   * @returns {boolean} still playing
   */
  update(dt) {
    if (!this.playing || !this.result) return false;
    this.t += dt;
    const u = Math.min(1, this.t / this.duration);

    // Highlight lesson phases by playback progress
    let step = 'launch';
    if (u > 0.22) step = 'contact';
    if (u > 0.62) step = 'rest';
    if (step !== this._lastStep) {
      this._lastStep = step;
      this.onStep?.(step);
    }

    this.view.showPlayback(this.result, this.ballMeta, u);

    if (u >= 1) {
      this.playing = false;
      this.view.show(this.result, this.ballMeta);
      this.onStep?.('rest');
      return false;
    }
    return true;
  }
}

/** Sample polyline at normalized u ∈ [0,1] by arc length. */
export function samplePath(points, u) {
  if (!points || points.length === 0) return null;
  if (points.length === 1 || u <= 0) return { ...points[0] };
  if (u >= 1) return { ...points[points.length - 1] };

  let total = 0;
  const seg = [];
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    seg.push(d);
    total += d;
  }
  if (total < 1e-9) return { ...points[points.length - 1] };

  let target = u * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const t = seg[i] > 1e-9 ? target / seg[i] : 1;
      const a = points[i];
      const b = points[i + 1];
      return {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      };
    }
    target -= seg[i];
  }
  return { ...points[points.length - 1] };
}
