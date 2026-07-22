/**
 * Math derivation for teach mode — equations only.
 */
import { BALL_R, MIN_POWER, MAX_POWER, PHYSICS } from '../constants.js';
import { cueVelocityFromAim } from './shot-predictor.js';

function fmt(n, d = 3) {
  if (!Number.isFinite(n)) return '—';
  return Number(n).toFixed(d);
}

function ballLabel(id, meta = []) {
  const m = meta.find((b) => b.id === id);
  if (m?.isCue || id === 0) return '母球';
  if (m?.def?.name) return `${m.def.name}#`;
  return `#${id}`;
}

/**
 * @param {object} result
 * @param {number} power01
 * @param {Array} ballMeta
 * @param {{ dirX: number, dirZ: number }} dir
 */
export function buildFormulaBoard(result, power01, ballMeta = [], dir = { dirX: 1, dirZ: 0 }) {
  const p = Math.min(1, Math.max(0, power01));
  const vel = cueVelocityFromAim(dir.dirX, dir.dirZ, p);
  const v0 = Math.hypot(vel.x, vel.z);
  const m = PHYSICS.ballMass;
  const strength = MIN_POWER + p * (MAX_POWER - MIN_POWER);
  const speedScale = 1.05 + p * 0.35;
  const Ek0 = 0.5 * m * v0 * v0;
  const px = m * vel.x;
  const pz = m * vel.z;
  const I = 0.4 * m * BALL_R * BALL_R;
  const hit = result?.firstHit ?? null;
  const cueId = result?.cueId ?? 0;

  const blocks = [];

  blocks.push({
    title: '① 力度 → 初速度',
    lines: [
      `p = ${fmt(p * 100, 0)} %`,
      `v_imp = v_min + p (v_max − v_min)`,
      `      = ${fmt(MIN_POWER)} + ${fmt(p, 2)} × (${fmt(MAX_POWER)} − ${fmt(MIN_POWER)})`,
      `      = ${fmt(strength)} m/s`,
      `k = 1.05 + 0.35 p = ${fmt(speedScale, 3)}`,
      `|v₀| = k · v_imp = ${fmt(v0)} m/s`,
      `d̂ = (${fmt(dir.dirX, 3)}, ${fmt(dir.dirZ, 3)})`,
      `v₀ = |v₀| d̂ = (${fmt(vel.x, 3)}, ${fmt(vel.z, 3)}) m/s`,
    ],
  });

  blocks.push({
    title: '② 初动能 · 初动量',
    lines: [
      `m = ${fmt(m, 3)} kg`,
      `E_k0 = ½ m |v₀|² = ${fmt(Ek0, 4)} J`,
      `p₀ = m v₀ = (${fmt(px, 4)}, ${fmt(pz, 4)}) kg·m/s`,
      `|p₀| = ${fmt(Math.hypot(px, pz), 4)} kg·m/s`,
    ],
  });

  if (hit?.kind === 'ball-ball') {
    const theta = hit.cutAngleDeg ?? 0;
    const e = PHYSICS.ballRestitution;
    const n = hit.normal || { x: 1, z: 0 };
    blocks.push({
      title: '③ 首碰（球–球）',
      lines: [
        `目标 = ${ballLabel(hit.otherId, ballMeta)}`,
        `θ_cut = ${fmt(theta, 1)}°  （相对速度与连心线夹角）`,
        `n̂ = (${fmt(n.x, 3)}, ${fmt(n.z, 3)})  连心线法向`,
        `e = ${fmt(e, 2)}  恢复系数`,
        `等质量一维正碰极限：`,
        `  v₁′ = (1−e)/2 · u ,  v₂′ = (1+e)/2 · u`,
        `u_∥ = v · n̂`,
        hit.speedIn != null ? `|v_rel|_in = ${fmt(hit.speedIn)} m/s` : '',
        hit.cueSpeedOut != null ? `|v_cue|_out ≈ ${fmt(hit.cueSpeedOut)} m/s` : '',
        hit.objSpeedOut != null ? `|v_obj|_out ≈ ${fmt(hit.objSpeedOut)} m/s` : '',
      ].filter(Boolean),
    });
  } else if (hit?.kind === 'cushion') {
    blocks.push({
      title: '③ 首碰（球–库）',
      lines: [
        `e_c = ${fmt(PHYSICS.cushionRestitution, 2)}`,
        `v_n′ = −e_c v_n ,  v_t′ ≈ v_t（摩擦修正）`,
        hit.speedIn != null ? `|v|_in = ${fmt(hit.speedIn)} m/s` : '',
      ].filter(Boolean),
    });
  } else {
    blocks.push({
      title: '③ 首碰',
      lines: ['无球–球首碰'],
    });
  }

  const mu = PHYSICS.slidingFriction;
  const aSlide = mu * PHYSICS.gravity;
  const aRoll = PHYSICS.rollingDeceleration;
  blocks.push({
    title: '④ 台呢：滑动 → 滚动',
    lines: [
      `I = ⅖ m R² = ${fmt(I, 6)} kg·m²`,
      `R = ${fmt(BALL_R, 4)} m`,
      `v_slip = v_cm + ω × r_contact`,
      `f_s = μ_s m g ,  μ_s = ${fmt(mu, 2)}`,
      `a_slide ∼ μ_s g = ${fmt(aSlide, 3)} m/s²`,
      `纯滚后 a_roll = ${fmt(aRoll, 2)} m/s²`,
      `路程数量级 s ∼ v² / (2a)`,
    ],
  });

  const finals = (result?.finals || []).filter((f) => f.moved || f.pocketed || f.id === cueId);
  const landLines = finals.length
    ? finals.slice(0, 14).map((f) => {
      const name = ballLabel(f.id, ballMeta);
      if (f.pocketed) return `${name} → 入袋`;
      return `${name} → (${fmt(f.x, 3)}, ${fmt(f.z, 3)}) m`;
    })
    : ['无位移'];

  blocks.push({
    title: '⑤ 数值积分落点',
    lines: [
      `Δt = ${fmt(PHYSICS.fixedTimeStep, 4)} s（固定子步）`,
      `N_steps = ${result?.steps ?? '—'}`,
      ...landLines,
    ],
  });

  return { power01: p, v0, Ek0, blocks };
}

export function formulaBoardToHtml(board) {
  if (!board) return '';
  return board.blocks.map((b) => {
    const body = b.lines
      .map((line) => `<div class="formula-line"><code>${escapeHtml(line)}</code></div>`)
      .join('');
    return `<section class="formula-block"><h4>${escapeHtml(b.title)}</h4>${body}</section>`;
  }).join('');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Landing rows for the teach panel list (balls that were on the table). */
export function buildLandingRows(result, ballMeta = []) {
  if (!result?.finals) return [];
  return result.finals
    .filter((f) => {
      const live = ballMeta.find((b) => b.id === f.id);
      // Skip balls already pocketed before this shot
      if (live?.pocketed) return false;
      return true;
    })
    .map((f) => {
      const live = ballMeta.find((b) => b.id === f.id);
      const label = live?.isCue || f.id === 0
        ? '母球'
        : (live?.def?.name ? `${live.def.name} 号` : `${f.id} 号`);
      if (f.pocketed) {
        return { id: f.id, label, text: '入袋', pocketed: true };
      }
      if (!f.moved) {
        return { id: f.id, label, text: '静止（未动）', pocketed: false };
      }
      return {
        id: f.id,
        label,
        text: `(${f.x.toFixed(3)}, ${f.z.toFixed(3)}) m`,
        pocketed: false,
      };
    });
}
