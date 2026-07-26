import fs from 'fs';

const p = 'src/experiments/optics.js';
let s = fs.readFileSync(p, 'utf8');
// Normalize to LF for reliable matching, write back with LF.
s = s.replace(/\r\n/g, '\n');

if (!s.includes("from '../frameBudget.js'")) {
  const marker = "import { isMirrorShape } from '../guangxue/shapes.js';\n";
  if (!s.includes(marker)) {
    console.error('import marker missing');
    process.exit(1);
  }
  s = s.replace(
    marker,
    `${marker}import { labFrameScheduler } from '../frameBudget.js';\n`,
  );
}

const oldUpdate = `  function update(_t, dt) {
    if (!state.data) return state.data;
    if (isGeometricOpticsExp(state.expId)) {
      const data = state.data;
      // Main loop runs exp update before station animators — flush deferred rays here.
      if (data._awaitRayFlush) {
        const snap = equipment.optics?.flushDeferredGeometry?.()
          || equipment.optics?.snapshotGeometric?.();
        if (snap) {
          data.theta1 = snap.theta1;
          data.theta2 = snap.theta2;
          data.thetaReflect = snap.thetaReflect;
          data.thetaRefract = snap.thetaRefract;
          applyVerifyFields(data);
        }
        data._awaitRayFlush = false;
      }
      // Only re-trace when interaction marked the optics dirty — never every frame.
      if (data._opticsDirty) syncGeometric(data, false);
      data._hudThrottle = (data._hudThrottle || 0) + dt;
      if (data._hudThrottle > 0.35) {
        data._hudThrottle = 0;
        pushHud();
      }
      return data;
    }
    if (state.expId !== 'multi_slit_diffraction') return state.data;
    const data = state.data;
    // Flush deferred fringe canvas paint from the switch frame.
    equipment.optics?.flushDeferredDiffraction?.();
    if (data._opticsDirty) syncDiffraction(data, false);
    if (data.demoOn) {
      data.demoElapsed = (data.demoElapsed || 0) + dt;
      if (data.demoElapsed >= 0.08) {
        data.demoElapsed = 0;
        data.demoPhase = (data.demoPhase || 0) + 0.06;
        data.lambdaNm = Math.round(555 + 125 * Math.sin(data.demoPhase));
        data.preset = 'custom';
        syncDiffraction(data, false);
      }
    }
    data._hudThrottle = (data._hudThrottle || 0) + dt;
    if (data._hudThrottle > 0.4) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }`;

const nextUpdate = `  function update(_t, dt) {
    if (!state.data) return state.data;
    if (isGeometricOpticsExp(state.expId)) {
      const data = state.data;
      // Heavy ray rebuild / dirty re-trace → frame budget (never pre-render hitch).
      if (data._awaitRayFlush) {
        data._awaitRayFlush = false;
        const expId = state.expId;
        labFrameScheduler.schedule('optics:ray-flush', () => {
          if (!state.running || state.expId !== expId || !state.data) return;
          const snap = equipment.optics?.flushDeferredGeometry?.()
            || equipment.optics?.snapshotGeometric?.();
          if (snap) {
            state.data.theta1 = snap.theta1;
            state.data.theta2 = snap.theta2;
            state.data.thetaReflect = snap.thetaReflect;
            state.data.thetaRefract = snap.thetaRefract;
            applyVerifyFields(state.data);
            pushHud();
          }
        }, { priority: 55 });
      }
      if (data._opticsDirty) {
        data._opticsDirty = false;
        const expId = state.expId;
        labFrameScheduler.schedule('optics:dirty-geo', () => {
          if (!state.running || state.expId !== expId || !state.data) return;
          syncGeometric(state.data, false);
        }, { priority: 50 });
      }
      data._hudThrottle = (data._hudThrottle || 0) + dt;
      if (data._hudThrottle > 0.35) {
        data._hudThrottle = 0;
        pushHud();
      }
      return data;
    }
    if (state.expId !== 'multi_slit_diffraction') return state.data;
    const data = state.data;
    // Fringe canvas + dirty diffraction paints are budgeted (640×240 fill can hitch).
    labFrameScheduler.schedule('optics:diff-flush', () => {
      if (!state.running || state.expId !== 'multi_slit_diffraction') return;
      equipment.optics?.flushDeferredDiffraction?.();
    }, { priority: 55 });
    if (data._opticsDirty) {
      data._opticsDirty = false;
      labFrameScheduler.schedule('optics:dirty-diff', () => {
        if (!state.running || state.expId !== 'multi_slit_diffraction' || !state.data) return;
        syncDiffraction(state.data, false);
      }, { priority: 50 });
    }
    if (data.demoOn) {
      data.demoElapsed = (data.demoElapsed || 0) + dt;
      if (data.demoElapsed >= 0.08) {
        data.demoElapsed = 0;
        data.demoPhase = (data.demoPhase || 0) + 0.06;
        data.lambdaNm = Math.round(555 + 125 * Math.sin(data.demoPhase));
        data.preset = 'custom';
        labFrameScheduler.schedule('optics:demo-diff', () => {
          if (!state.running || state.expId !== 'multi_slit_diffraction' || !state.data) return;
          syncDiffraction(state.data, false);
        }, { priority: 30 });
      }
    }
    data._hudThrottle = (data._hudThrottle || 0) + dt;
    if (data._hudThrottle > 0.4) {
      data._hudThrottle = 0;
      pushHud();
    }
    return data;
  }`;

if (!s.includes(oldUpdate)) {
  console.error('update() block not found');
  // help debug
  const i = s.indexOf('function update(_t, dt)');
  console.error(s.slice(i, i + 200));
  process.exit(1);
}
s = s.replace(oldUpdate, nextUpdate);
fs.writeFileSync(p, s);
console.log('optics budget patch ok');
