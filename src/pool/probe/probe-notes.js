/**
 * Short observational captions — instrument tone, not lesson plans.
 * Cooldown is handled by the probe controller.
 */

export const NOTE_COOLDOWN = 5.0;
export const NOTE_DISPLAY = 2.2;

const NOTES = {
  headOn: '质量相近时，沿接触法线方向的速度交换得比较彻底。',
  cut: '目标球大致沿两球连心线离开；切得越薄，它分到的速度越小。',
  cushion: '库边碰撞削弱法向速度分量（恢复系数小于 1）。',
  toRolling: '台呢摩擦力一边减速，一边让球「转起来」，滑移逐渐消失。',
  momentum: '看 Σp：这一下系统水平动量几乎没变。',
};

/**
 * @param {'ball-ball' | 'ball-cushion'} kind
 * @param {{ cutAngleDeg?: number, relPChange?: number }} meta
 */
export function pickContactNote(kind, meta = {}) {
  if (kind === 'ball-cushion') return NOTES.cushion;

  const angle = meta.cutAngleDeg ?? 0;
  if (angle < 12) return NOTES.headOn;
  if ((meta.relPChange ?? 1) < 0.05) return NOTES.momentum;
  return NOTES.cut;
}

export function pickRollingNote() {
  return NOTES.toRolling;
}

export { NOTES };
