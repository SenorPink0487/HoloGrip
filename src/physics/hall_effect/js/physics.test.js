import { describe, expect, test } from 'vitest';
import {
  calibrateMagneticField,
  computeHallState,
  estimateCarrierDensity,
  fitHallLine,
  createReportHtml,
  MATERIALS,
  recordsToCsv,
  simulateMeasurement,
} from './physics.js';

const baseInput = {
  carrierType: 'N',
  materialId: 'N_Ge',
  currentMa: 3,
  magnetCurrentA: 0.8,
  thicknessMm: 0.5,
  measurementMode: 'ideal',
};

describe('Hall physics core', () => {
  test('assigns negative Hall coefficient to N type and positive to P type', () => {
    const nState = computeHallState({ ...baseInput, carrierType: 'N', materialId: 'N_Ge' });
    const pState = computeHallState({ ...baseInput, carrierType: 'P', materialId: 'P_Ge' });

    expect(nState.hallCoefficient).toBeLessThan(0);
    expect(pState.hallCoefficient).toBeGreaterThan(0);
    expect(nState.polarity).toBe('negative');
    expect(pState.polarity).toBe('positive');
  });

  test('Hall voltage scales with current and magnetic field and inversely with thickness', () => {
    const base = computeHallState({ ...baseInput, magneticFieldT: 0.35 });
    const doubleCurrent = computeHallState({ ...baseInput, currentMa: 6, magneticFieldT: 0.35 });
    const doubleField = computeHallState({ ...baseInput, magneticFieldT: 0.7 });
    const doubleThickness = computeHallState({ ...baseInput, thicknessMm: 1, magneticFieldT: 0.35 });

    expect(doubleCurrent.hallVoltageMv).toBeCloseTo(base.hallVoltageMv * 2, 8);
    expect(doubleField.hallVoltageMv).toBeCloseTo(base.hallVoltageMv * 2, 8);
    expect(doubleThickness.hallVoltageMv).toBeCloseTo(base.hallVoltageMv / 2, 8);
  });

  test('magnetic calibration is monotonic, limited, and saturating', () => {
    const low = calibrateMagneticField(0.5);
    const mid = calibrateMagneticField(1.5);
    const high = calibrateMagneticField(4);
    const extreme = calibrateMagneticField(20);

    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
    expect(extreme).toBeLessThanOrEqual(1.55);
    expect(extreme - high).toBeLessThan(0.25);
  });

  test('measurement simulation is exact when noise is disabled and bounded when enabled', () => {
    const state = computeHallState({ ...baseInput, magneticFieldT: 0.45 });
    const exact = simulateMeasurement(state.hallVoltageMv, { enabled: false });
    const noisy = simulateMeasurement(state.hallVoltageMv, {
      enabled: true,
      relativeNoise: 0.01,
      resolutionMv: 0.001,
      random: () => 0.75,
    });

    expect(exact.valueMv).toBe(state.hallVoltageMv);
    expect(exact.noiseMv).toBe(0);
    expect(Math.abs(noisy.valueMv - state.hallVoltageMv)).toBeLessThanOrEqual(Math.abs(state.hallVoltageMv) * 0.011);
  });

  test('fixed-field V_H-I records recover Hall coefficient and carrier density', () => {
    const records = [1, 2, 3, 4, 5].map((currentMa) => {
      const state = computeHallState({ ...baseInput, currentMa, magneticFieldT: 0.4 });
      return {
        currentMa,
        magneticFieldT: 0.4,
        thicknessMm: 0.5,
        carrierType: 'N',
        materialId: 'N_Ge',
        hallVoltageMv: state.hallVoltageMv,
        measuredHallVoltageMv: state.hallVoltageMv,
        carrierDensity: state.carrierDensity,
      };
    });

    const fit = fitHallLine(records);
    const expectedRh = computeHallState({ ...baseInput, currentMa: 1, magneticFieldT: 0.4 }).hallCoefficient;

    expect(fit.warnings).toEqual([]);
    expect(fit.rSquared).toBeCloseTo(1, 8);
    expect(fit.estimatedHallCoefficient).toBeCloseTo(expectedRh, 8);
    expect(fit.estimatedCarrierDensity).toBeCloseTo(MATERIALS.N_Ge.carrierDensity, -12);
    expect(fit.relativeErrorPercent).toBeLessThan(0.001);
  });

  test('fit warns when control variables are mixed', () => {
    const records = [
      { currentMa: 1, magneticFieldT: 0.4, thicknessMm: 0.5, carrierType: 'N', measuredHallVoltageMv: -2 },
      { currentMa: 2, magneticFieldT: 0.5, thicknessMm: 0.5, carrierType: 'N', measuredHallVoltageMv: -4 },
      { currentMa: 3, magneticFieldT: 0.4, thicknessMm: 0.7, carrierType: 'P', measuredHallVoltageMv: 6 },
    ];

    const fit = fitHallLine(records);

    expect(fit.warnings).toContain('磁场 B 不一致，V_H-I_S 拟合的斜率不能直接用于反推 R_H。');
    expect(fit.warnings).toContain('样品厚度 d 不一致，拟合结果仅作趋势参考。');
    expect(fit.warnings).toContain('载流子类型不一致，不能合并反推霍尔系数。');
  });

  test('carrier density estimate preserves the Hall coefficient sign convention', () => {
    const rh = computeHallState({ ...baseInput, magneticFieldT: 0.4 }).hallCoefficient;

    expect(estimateCarrierDensity(rh)).toBeCloseTo(MATERIALS.N_Ge.carrierDensity, -12);
    expect(estimateCarrierDensity(-rh)).toBeCloseTo(MATERIALS.N_Ge.carrierDensity, -12);
  });

  test('CSV and printable report include records and fitted experiment results', () => {
    const state = computeHallState({ ...baseInput, currentMa: 2, magneticFieldT: 0.4 });
    const records = [
      {
        timestamp: '2026-06-06T00:00:00.000Z',
        currentMa: 2,
        magnetCurrentA: 0.8,
        magneticFieldT: 0.4,
        thicknessMm: 0.5,
        carrierType: 'N',
        materialId: 'N_Ge',
        materialName: 'N 型锗',
        hallVoltageMv: state.hallVoltageMv,
        measuredHallVoltageMv: state.hallVoltageMv,
        measurementNoiseMv: 0,
        carrierDensity: state.carrierDensity,
      },
      {
        timestamp: '2026-06-06T00:01:00.000Z',
        currentMa: 4,
        magnetCurrentA: 0.8,
        magneticFieldT: 0.4,
        thicknessMm: 0.5,
        carrierType: 'N',
        materialId: 'N_Ge',
        materialName: 'N 型锗',
        hallVoltageMv: state.hallVoltageMv * 2,
        measuredHallVoltageMv: state.hallVoltageMv * 2,
        measurementNoiseMv: 0,
        carrierDensity: state.carrierDensity,
      },
    ];
    const fit = fitHallLine(records);
    const csv = recordsToCsv(records, fit);
    const html = createReportHtml({ state, records, fit });

    expect(csv).toContain('理论V_H/mV');
    expect(csv).toContain('拟合斜率 mV/mA');
    expect(html).toContain('霍尔效应虚拟实验报告');
    expect(html).toContain('反推 R_H');
    expect(html).toContain('N 型锗');
  });
});
