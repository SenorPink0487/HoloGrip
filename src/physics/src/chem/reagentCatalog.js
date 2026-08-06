/**
 * Curated element → common reagent catalog for the chemistry island.
 * Each reagent has a PubChem-friendly query key and a display color.
 */

/** @typedef {{ id: string, symbol: string, name_zh: string, Z: number, group: number, period: number }} ChemElement */
/** @typedef {{ id: string, formula: string, name_zh: string, color: number, query: string, element: string }} ChemReagent */

/** @type {ChemElement[]} */
export const CHEM_ELEMENTS = Object.freeze([
  { id: 'H', symbol: 'H', name_zh: '氢', Z: 1, group: 1, period: 1 },
  { id: 'C', symbol: 'C', name_zh: '碳', Z: 6, group: 14, period: 2 },
  { id: 'N', symbol: 'N', name_zh: '氮', Z: 7, group: 15, period: 2 },
  { id: 'O', symbol: 'O', name_zh: '氧', Z: 8, group: 16, period: 2 },
  { id: 'Na', symbol: 'Na', name_zh: '钠', Z: 11, group: 1, period: 3 },
  { id: 'Mg', symbol: 'Mg', name_zh: '镁', Z: 12, group: 2, period: 3 },
  { id: 'Al', symbol: 'Al', name_zh: '铝', Z: 13, group: 13, period: 3 },
  { id: 'Si', symbol: 'Si', name_zh: '硅', Z: 14, group: 14, period: 3 },
  { id: 'P', symbol: 'P', name_zh: '磷', Z: 15, group: 15, period: 3 },
  { id: 'S', symbol: 'S', name_zh: '硫', Z: 16, group: 16, period: 3 },
  { id: 'Cl', symbol: 'Cl', name_zh: '氯', Z: 17, group: 17, period: 3 },
  { id: 'K', symbol: 'K', name_zh: '钾', Z: 19, group: 1, period: 4 },
  { id: 'Ca', symbol: 'Ca', name_zh: '钙', Z: 20, group: 2, period: 4 },
  { id: 'Fe', symbol: 'Fe', name_zh: '铁', Z: 26, group: 8, period: 4 },
  { id: 'Cu', symbol: 'Cu', name_zh: '铜', Z: 29, group: 11, period: 4 },
  { id: 'Zn', symbol: 'Zn', name_zh: '锌', Z: 30, group: 12, period: 4 },
  { id: 'Ag', symbol: 'Ag', name_zh: '银', Z: 47, group: 11, period: 5 },
  { id: 'I', symbol: 'I', name_zh: '碘', Z: 53, group: 17, period: 5 },
]);

/** @type {Record<string, ChemReagent[]>} */
export const REAGENTS_BY_ELEMENT = Object.freeze({
  H: [
    { id: 'h2o', formula: 'H2O', name_zh: '水', color: 0x38bdf8, query: 'water', element: 'H' },
    { id: 'hcl', formula: 'HCl', name_zh: '盐酸', color: 0xfbbf24, query: 'hydrochloric acid', element: 'H' },
    { id: 'h2so4', formula: 'H2SO4', name_zh: '硫酸', color: 0xf59e0b, query: 'sulfuric acid', element: 'H' },
    { id: 'h2o2', formula: 'H2O2', name_zh: '过氧化氢', color: 0xa5b4fc, query: 'hydrogen peroxide', element: 'H' },
  ],
  C: [
    { id: 'c6h12o6', formula: 'C6H12O6', name_zh: '葡萄糖', color: 0xfcd34d, query: 'glucose', element: 'C' },
    { id: 'c2h5oh', formula: 'C2H5OH', name_zh: '乙醇', color: 0x67e8f9, query: 'ethanol', element: 'C' },
    { id: 'ch3cooh', formula: 'CH3COOH', name_zh: '乙酸', color: 0xfda4af, query: 'acetic acid', element: 'C' },
    { id: 'co2', formula: 'CO2', name_zh: '二氧化碳', color: 0x94a3b8, query: 'carbon dioxide', element: 'C' },
  ],
  N: [
    { id: 'nh3', formula: 'NH3', name_zh: '氨', color: 0xa78bfa, query: 'ammonia', element: 'N' },
    { id: 'hno3', formula: 'HNO3', name_zh: '硝酸', color: 0xfb7185, query: 'nitric acid', element: 'N' },
    { id: 'nacl_n', formula: 'NaNO3', name_zh: '硝酸钠', color: 0xf9a8d4, query: 'sodium nitrate', element: 'N' },
  ],
  O: [
    { id: 'h2o_o', formula: 'H2O', name_zh: '水', color: 0x38bdf8, query: 'water', element: 'O' },
    { id: 'h2o2_o', formula: 'H2O2', name_zh: '过氧化氢', color: 0xa5b4fc, query: 'hydrogen peroxide', element: 'O' },
    { id: 'o2', formula: 'O2', name_zh: '氧气', color: 0x7dd3fc, query: 'oxygen', element: 'O' },
  ],
  Na: [
    { id: 'nacl', formula: 'NaCl', name_zh: '氯化钠', color: 0xe2e8f0, query: 'sodium chloride', element: 'Na' },
    { id: 'naoh', formula: 'NaOH', name_zh: '氢氧化钠', color: 0x86efac, query: 'sodium hydroxide', element: 'Na' },
    { id: 'na2co3', formula: 'Na2CO3', name_zh: '碳酸钠', color: 0xfdba74, query: 'sodium carbonate', element: 'Na' },
    { id: 'nahco3', formula: 'NaHCO3', name_zh: '碳酸氢钠', color: 0xfde68a, query: 'sodium bicarbonate', element: 'Na' },
  ],
  Mg: [
    { id: 'mgso4', formula: 'MgSO4', name_zh: '硫酸镁', color: 0xc4b5fd, query: 'magnesium sulfate', element: 'Mg' },
    { id: 'mgcl2', formula: 'MgCl2', name_zh: '氯化镁', color: 0x99f6e4, query: 'magnesium chloride', element: 'Mg' },
  ],
  Al: [
    { id: 'alcl3', formula: 'AlCl3', name_zh: '氯化铝', color: 0xd4d4d8, query: 'aluminum chloride', element: 'Al' },
    { id: 'al2o3', formula: 'Al2O3', name_zh: '氧化铝', color: 0xfafafa, query: 'aluminum oxide', element: 'Al' },
  ],
  Si: [
    { id: 'sio2', formula: 'SiO2', name_zh: '二氧化硅', color: 0xe7e5e4, query: 'silicon dioxide', element: 'Si' },
  ],
  P: [
    { id: 'h3po4', formula: 'H3PO4', name_zh: '磷酸', color: 0xfbbf24, query: 'phosphoric acid', element: 'P' },
  ],
  S: [
    { id: 'h2so4_s', formula: 'H2SO4', name_zh: '硫酸', color: 0xf59e0b, query: 'sulfuric acid', element: 'S' },
    { id: 'na2so4', formula: 'Na2SO4', name_zh: '硫酸钠', color: 0xfef08a, query: 'sodium sulfate', element: 'S' },
  ],
  Cl: [
    { id: 'hcl_cl', formula: 'HCl', name_zh: '盐酸', color: 0xfbbf24, query: 'hydrochloric acid', element: 'Cl' },
    { id: 'nacl_cl', formula: 'NaCl', name_zh: '氯化钠', color: 0xe2e8f0, query: 'sodium chloride', element: 'Cl' },
    { id: 'cacl2', formula: 'CaCl2', name_zh: '氯化钙', color: 0xbae6fd, query: 'calcium chloride', element: 'Cl' },
  ],
  K: [
    { id: 'kcl', formula: 'KCl', name_zh: '氯化钾', color: 0xe0e7ff, query: 'potassium chloride', element: 'K' },
    { id: 'kmno4', formula: 'KMnO4', name_zh: '高锰酸钾', color: 0xa21caf, query: 'potassium permanganate', element: 'K' },
    { id: 'koh', formula: 'KOH', name_zh: '氢氧化钾', color: 0x6ee7b7, query: 'potassium hydroxide', element: 'K' },
  ],
  Ca: [
    { id: 'cacl2_ca', formula: 'CaCl2', name_zh: '氯化钙', color: 0xbae6fd, query: 'calcium chloride', element: 'Ca' },
    { id: 'caco3', formula: 'CaCO3', name_zh: '碳酸钙', color: 0xf5f5f4, query: 'calcium carbonate', element: 'Ca' },
    { id: 'caoh2', formula: 'Ca(OH)2', name_zh: '氢氧化钙', color: 0xd9f99d, query: 'calcium hydroxide', element: 'Ca' },
  ],
  Fe: [
    { id: 'fecl3', formula: 'FeCl3', name_zh: '氯化铁', color: 0xea580c, query: 'iron(III) chloride', element: 'Fe' },
    { id: 'fes04', formula: 'FeSO4', name_zh: '硫酸亚铁', color: 0x65a30d, query: 'iron(II) sulfate', element: 'Fe' },
  ],
  Cu: [
    { id: 'cuso4', formula: 'CuSO4', name_zh: '硫酸铜', color: 0x2563eb, query: 'copper sulfate', element: 'Cu' },
    { id: 'cucl2', formula: 'CuCl2', name_zh: '氯化铜', color: 0x22c55e, query: 'copper(II) chloride', element: 'Cu' },
  ],
  Zn: [
    { id: 'zncl2', formula: 'ZnCl2', name_zh: '氯化锌', color: 0xd4d4d8, query: 'zinc chloride', element: 'Zn' },
    { id: 'znso4', formula: 'ZnSO4', name_zh: '硫酸锌', color: 0xa1a1aa, query: 'zinc sulfate', element: 'Zn' },
  ],
  Ag: [
    { id: 'agno3', formula: 'AgNO3', name_zh: '硝酸银', color: 0xf8fafc, query: 'silver nitrate', element: 'Ag' },
  ],
  I: [
    { id: 'i2', formula: 'I2', name_zh: '碘', color: 0x6b21a8, query: 'iodine', element: 'I' },
    { id: 'ki', formula: 'KI', name_zh: '碘化钾', color: 0xc4b5fd, query: 'potassium iodide', element: 'I' },
  ],
});

/** Compact grid positions for the curated set (period, group → cell). */
export function elementGridCell(el) {
  // Map real group numbers into a compact 0..17 display column for our subset.
  const groupCol = {
    1: 0, 2: 1, 8: 7, 11: 10, 12: 11, 13: 12, 14: 13, 15: 14, 16: 15, 17: 16,
  };
  return {
    col: groupCol[el.group] ?? Math.min(16, el.group - 1),
    row: el.period - 1,
  };
}

export function getElement(symbol) {
  return CHEM_ELEMENTS.find((e) => e.id === symbol || e.symbol === symbol) || null;
}

export function getReagentsForElement(symbol) {
  return REAGENTS_BY_ELEMENT[symbol] || [];
}

export function getReagent(id) {
  for (const list of Object.values(REAGENTS_BY_ELEMENT)) {
    const hit = list.find((r) => r.id === id);
    if (hit) return hit;
  }
  return null;
}

/** Blend two hex colors by weight in [0,1]. */
export function blendColors(a, b, t = 0.5) {
  const u = Math.max(0, Math.min(1, t));
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * u);
  const g = Math.round(ag + (bg - ag) * u);
  const bl = Math.round(ab + (bb - ab) * u);
  return (r << 16) | (g << 8) | bl;
}
