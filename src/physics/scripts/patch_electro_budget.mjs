import fs from 'fs';

const p = 'src/experiments/electro.js';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('frameBudget')) {
  s = `import { labFrameScheduler } from '../frameBudget.js';\n${s}`;
}

const old = `  function applyVisualDefaults(expId) {
    if (!equipment.electro) return;
    // Visibility-only on this frame (instant). Heavy field/line sync flushes on
    // the next animator tick so experiment switch does not stack with HUD paint.
    if (expId === 'faraday_induction') {
      equipment.electro.setMode?.('faraday');
      state.data._awaitElectroSync = 'faraday';
      return;
    }
    if (expId === 'induced_electric_field') {
      equipment.electro.setMode?.('induced-e');
      state.data._awaitElectroSync = 'induced-e';
      return;
    }
    if (expId === 'hall_effect') {
      equipment.electro.setMode?.('hall');
      state.data._awaitElectroSync = 'hall';
      return;
    }
    if (expId === 'hall_carrier_demo') {
      equipment.electro.setMode?.('hall-demo');
      state.data._awaitElectroSync = 'hall-demo';
      return;
    }
    if (expId === 'gauss_theorem') {
      equipment.electro.setMode?.('gauss');
      state.data._awaitElectroSync = 'gauss';
      return;
    }
    if (expId === 'electric_field') {
      equipment.electro.setMode?.('electric-field');
      state.data._awaitElectroSync = 'electric-field';
    }
  }`;

const next = `  function applyVisualDefaults(expId) {
    if (!equipment.electro) return;
    // Visibility only; heavy field rebuild is a separate frame-budget job.
    let kind = null;
    if (expId === 'faraday_induction') {
      equipment.electro.setMode?.('faraday');
      kind = 'faraday';
    } else if (expId === 'induced_electric_field') {
      equipment.electro.setMode?.('induced-e');
      kind = 'induced-e';
    } else if (expId === 'hall_effect') {
      equipment.electro.setMode?.('hall');
      kind = 'hall';
    } else if (expId === 'hall_carrier_demo') {
      equipment.electro.setMode?.('hall-demo');
      kind = 'hall-demo';
    } else if (expId === 'gauss_theorem') {
      equipment.electro.setMode?.('gauss');
      kind = 'gauss';
    } else if (expId === 'electric_field') {
      equipment.electro.setMode?.('electric-field');
      kind = 'electric-field';
    }
    if (!kind) return;
    state.data._awaitElectroSync = kind;
    labFrameScheduler.schedule('electro:sync', () => {
      if (!state.running || state.expId !== expId) return;
      if (flushDeferredElectroSync()) pushHud();
    }, { priority: 60 });
  }`;

if (!s.includes(old)) {
  console.error('applyVisualDefaults block not found');
  process.exit(1);
}
s = s.replace(old, next);
fs.writeFileSync(p, s);
console.log('electro budget patch ok');
