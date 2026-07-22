import * as THREE from 'three';
import { BALL_R, BALL_Y } from '../constants.js';
import { samplePath } from './predict-replay.js';

const GHOST_Y = BALL_Y;
const PATH_Y = BALL_Y + 0.003;

/**
 * Renders predicted rest positions (ghosts), paths, and first-hit teaching marks.
 */
export class PredictView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'predict-view';
    this.group.visible = false;
    scene.add(this.group);

    this.ghosts = new Map();
    this.pathLines = new Map();

    this.ghostGeo = new THREE.SphereGeometry(BALL_R * 0.98, 20, 16);
    this.ghostMatCue = new THREE.MeshBasicMaterial({
      color: 0x9ad7ff,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    this.ghostMatObj = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    });
    this.ghostMatPocket = new THREE.MeshBasicMaterial({
      color: 0xff6b6b,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });

    this.ringGeo = new THREE.RingGeometry(BALL_R * 1.05, BALL_R * 1.22, 28);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.contactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R * 0.22, 12, 10),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
      }),
    );
    this.contactMarker.visible = false;
    this.group.add(this.contactMarker);

    // Line of centres at first ball-ball hit (teaching: impulse along this line)
    this.normalLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: 0x7ef0c3,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    this.normalLine.visible = false;
    this.normalLine.renderOrder = 4;
    this.group.add(this.normalLine);

    this.objDirArrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, GHOST_Y, 0),
      0.18,
      0xffd27a,
      0.05,
      0.03,
    );
    this.objDirArrow.visible = false;
    this.group.add(this.objDirArrow);

    // Soft / hard power ladder markers (cue rest under same aim)
    this.ladderMarkers = [];
    const ladderGeo = new THREE.SphereGeometry(BALL_R * 0.55, 14, 12);
    for (const spec of [
      { key: 'soft', color: 0xa8c8ff, opacity: 0.4 },
      { key: 'hard', color: 0xff8a5c, opacity: 0.42 },
    ]) {
      const mat = new THREE.MeshBasicMaterial({
        color: spec.color,
        transparent: true,
        opacity: spec.opacity,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(ladderGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 3;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(BALL_R * 0.7, BALL_R * 0.95, 20),
        new THREE.MeshBasicMaterial({
          color: spec.color,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -BALL_R * 0.35;
      mesh.add(ring);
      this.group.add(mesh);
      this.ladderMarkers.push({ key: spec.key, mesh });
    }
  }

  setVisible(on) {
    this.group.visible = !!on;
    if (!on) this.clear();
  }

  clear() {
    for (const g of this.ghosts.values()) g.visible = false;
    for (const line of this.pathLines.values()) line.visible = false;
    this.contactMarker.visible = false;
    this.normalLine.visible = false;
    this.objDirArrow.visible = false;
    for (const m of this.ladderMarkers) m.mesh.visible = false;
  }

  /**
   * @param {object} result
   * @param {Array<{ id: number, isCue?: boolean }>} ballMeta
   */
  show(result, ballMeta = []) {
    this.group.visible = true;
    const cueId = result.cueId ?? 0;
    const seenGhost = new Set();
    const seenPath = new Set();

    for (const f of result.finals) {
      if (!f.moved && !f.pocketed) continue;

      const meta = ballMeta.find((b) => b.id === f.id);
      const isCue = meta?.isCue || f.id === cueId;
      let ghost = this.ghosts.get(f.id);
      if (!ghost) {
        ghost = this._makeGhost(isCue);
        this.ghosts.set(f.id, ghost);
      }

      ghost.position.set(f.x, GHOST_Y, f.z);
      ghost.visible = true;
      if (f.pocketed) {
        ghost.material = this.ghostMatPocket;
        ghost.scale.setScalar(0.55);
      } else {
        ghost.material = isCue ? this.ghostMatCue : this.ghostMatObj;
        ghost.scale.setScalar(1);
      }
      seenGhost.add(f.id);

      const path = result.paths?.get(f.id);
      if (path && path.length >= 2) {
        let line = this.pathLines.get(f.id);
        if (!line) {
          line = this._makePath(isCue);
          this.pathLines.set(f.id, line);
        }
        const pts = path.map((p) => new THREE.Vector3(p.x, PATH_Y, p.z));
        const last = pts[pts.length - 1];
        if (Math.hypot(last.x - f.x, last.z - f.z) > 1e-4) {
          pts.push(new THREE.Vector3(f.x, PATH_Y, f.z));
        }
        line.geometry.dispose();
        line.geometry = new THREE.BufferGeometry().setFromPoints(pts);
        line.material.color.setHex(f.pocketed ? 0xff6b6b : isCue ? 0x7ec8ff : 0xffd27a);
        line.material.opacity = 0.55;
        line.visible = true;
        seenPath.add(f.id);
      }
    }

    for (const [id, g] of this.ghosts) {
      if (!seenGhost.has(id)) g.visible = false;
    }
    for (const [id, line] of this.pathLines) {
      if (!seenPath.has(id)) line.visible = false;
    }

    this._showFirstHit(result.firstHit);
  }

  /**
   * Show soft/hard cue rest positions for the same aim (power as unknown).
   * @param {{ soft?: { x:number, z:number, pocketed?: boolean } | null, hard?: { x:number, z:number, pocketed?: boolean } | null }} ladderPos
   */
  showPowerLadder(ladderPos = {}) {
    for (const m of this.ladderMarkers) {
      const pos = ladderPos[m.key];
      if (!pos || pos.pocketed) {
        m.mesh.visible = false;
        continue;
      }
      m.mesh.position.set(pos.x, GHOST_Y, pos.z);
      m.mesh.visible = true;
      m.mesh.scale.setScalar(pos.pocketed ? 0.5 : 1);
    }
  }

  /**
   * Playback frame: ghosts slide along paths (u in 0..1), finals dimmed as targets.
   */
  showPlayback(result, ballMeta, u) {
    this.group.visible = true;
    const cueId = result.cueId ?? 0;
    const seen = new Set();

    // Keep path lines visible
    this.show(result, ballMeta);

    for (const f of result.finals) {
      if (!f.moved && !f.pocketed) continue;
      const path = result.paths?.get(f.id);
      const start = result.starts?.get?.(f.id) ?? path?.[0];
      const pos = path && path.length
        ? samplePath(path, u)
        : start
          ? { x: start.x + (f.x - start.x) * u, z: start.z + (f.z - start.z) * u }
          : { x: f.x, z: f.z };
      if (!pos) continue;

      const meta = ballMeta.find((b) => b.id === f.id);
      const isCue = meta?.isCue || f.id === cueId;
      let ghost = this.ghosts.get(f.id);
      if (!ghost) {
        ghost = this._makeGhost(isCue);
        this.ghosts.set(f.id, ghost);
      }
      // During pocketed end, shrink near the end of playback
      ghost.position.set(pos.x, GHOST_Y, pos.z);
      ghost.visible = true;
      ghost.material = isCue ? this.ghostMatCue : this.ghostMatObj;
      ghost.scale.setScalar(f.pocketed && u > 0.85 ? 0.55 : 1);
      if (f.pocketed && u > 0.85) ghost.material = this.ghostMatPocket;
      seen.add(f.id);
    }

    // Dim "target" rings: show final positions as small rings only via second pass
    // (finals already drawn as paths end — playback ghost is the moving one)
  }

  _showFirstHit(hit) {
    if (!hit || !hit.point) {
      this.contactMarker.visible = false;
      this.normalLine.visible = false;
      this.objDirArrow.visible = false;
      return;
    }

    this.contactMarker.position.set(hit.point.x, GHOST_Y + 0.01, hit.point.z);
    this.contactMarker.visible = true;

    if (hit.kind === 'ball-ball' && hit.normal) {
      const L = 0.16;
      const n = hit.normal;
      const a = new THREE.Vector3(
        hit.point.x - n.x * L,
        PATH_Y + 0.008,
        hit.point.z - n.z * L,
      );
      const b = new THREE.Vector3(
        hit.point.x + n.x * L,
        PATH_Y + 0.008,
        hit.point.z + n.z * L,
      );
      this.normalLine.geometry.dispose();
      this.normalLine.geometry = new THREE.BufferGeometry().setFromPoints([a, b]);
      this.normalLine.visible = true;

      this.objDirArrow.position.set(hit.point.x, GHOST_Y + 0.012, hit.point.z);
      this.objDirArrow.setDirection(new THREE.Vector3(n.x, 0, n.z).normalize());
      this.objDirArrow.setLength(0.2, 0.055, 0.035);
      this.objDirArrow.visible = true;
    } else {
      this.normalLine.visible = false;
      this.objDirArrow.visible = false;
    }
  }

  setContactPoint(point) {
    if (!point) {
      this.contactMarker.visible = false;
      return;
    }
    this.contactMarker.position.set(point.x, GHOST_Y, point.z);
    this.contactMarker.visible = true;
  }

  _makeGhost(isCue) {
    const mesh = new THREE.Mesh(
      this.ghostGeo,
      isCue ? this.ghostMatCue : this.ghostMatObj,
    );
    mesh.renderOrder = 3;
    const ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -BALL_R + 0.002;
    mesh.add(ring);
    this.group.add(mesh);
    return mesh;
  }

  _makePath(isCue) {
    const mat = new THREE.LineBasicMaterial({
      color: isCue ? 0x7ec8ff : 0xffd27a,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const line = new THREE.Line(new THREE.BufferGeometry(), mat);
    line.renderOrder = 2;
    this.group.add(line);
    return line;
  }

  dispose() {
    this.scene.remove(this.group);
    this.ghostGeo.dispose();
    this.ringGeo.dispose();
    this.ghostMatCue.dispose();
    this.ghostMatObj.dispose();
    this.ghostMatPocket.dispose();
    this.ringMat.dispose();
  }
}
