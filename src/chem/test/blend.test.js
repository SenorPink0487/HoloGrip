import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseAddExpression, parsePart, mergeProducts } from '../blend.js';

describe('HoloChem blend', () => {
  it('parses A + B expressions', () => {
    const parts = parseAddExpression('水 + 乙醇');
    assert.ok(parts);
    assert.equal(parts.length, 2);
    assert.equal(parts[0].name, '水');
    assert.equal(parts[1].name, '乙醇');
  });

  it('parses weighted parts', () => {
    const a = parsePart('水:2');
    assert.equal(a.name, '水');
    assert.equal(a.weight, 2);
  });

  it('merges component percents by weight', () => {
    const merged = mergeProducts(
      [
        {
          product_zh: 'A',
          components: [{ name_zh: '水', name_en: 'water', percent: 100 }],
        },
        {
          product_zh: 'B',
          components: [{ name_zh: '乙醇', name_en: 'ethanol', percent: 100 }],
        },
      ],
      [1, 1],
    );
    assert.equal(merged.kind, 'blend');
    assert.equal(merged.components.length, 2);
    const sum = merged.components.reduce((s, c) => s + c.percent, 0);
    assert.ok(Math.abs(sum - 100) < 0.2);
  });
});
