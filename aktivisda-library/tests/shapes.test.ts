import { expect, test } from 'vitest';
import { buildShape, normalizeShapeOptions, shapePoints, DEFAULT_SHAPE_OPTIONS } from '../lib/utils/shapes';

test('options are always valid, even from untrusted input', () => {
    const o = normalizeShapeOptions({ sides: 999, points: -4, fill: '"/><script>alert(1)</script>' as any, stroke: 'red' as any, ratio: 0 });
    expect(o.sides).toBe(30);
    expect(o.points).toBe(3);
    expect(o.ratio).toBe(0.2);
    expect(o.fill).toBe(DEFAULT_SHAPE_OPTIONS.fill);
    expect(o.stroke).toBe(DEFAULT_SHAPE_OPTIONS.stroke);
});

test('every shape builds a valid svg with integer dimensions', () => {
    for (const shape of ['rect', 'ellipse', 'polygon', 'star'] as const) {
        const built = buildShape({ shape, ratio: 1.7, sides: 7, points: 6, irregularity: 40, seed: 9 });
        expect(built.svg.startsWith('<svg')).toBe(true);
        expect(Number.isInteger(built.width) && Number.isInteger(built.height)).toBe(true);
        expect(Math.max(built.width, built.height)).toBeLessThanOrEqual(400);
        expect(built.hitform.startsWith('M')).toBe(true);
    }
});

test('border is optional', () => {
    expect(buildShape({ shape: 'rect', border: false }).svg).not.toContain('stroke');
    expect(buildShape({ shape: 'rect', border: true, stroke: '#00ff00', strokeWidth: 10 }).svg).toContain('stroke="#00ff00"');
});

test('the bordered shape stays inside its viewBox', () => {
    const built = buildShape({ shape: 'star', border: true, strokeWidth: 40 });
    const nums = [...built.svg.matchAll(/points="([^"]+)"/g)][0][1].split(/[ ,]/).map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(20 - 1);
    expect(Math.max(...nums)).toBeLessThanOrEqual(Math.max(built.width, built.height) - 20 + 1);
});

test('irregularity is seeded: same seed same drawing, another seed another drawing', () => {
    const base = { shape: 'polygon' as const, sides: 8, irregularity: 60 };
    const a = shapePoints(normalizeShapeOptions({ ...base, seed: 5 }));
    const b = shapePoints(normalizeShapeOptions({ ...base, seed: 5 }));
    const c = shapePoints(normalizeShapeOptions({ ...base, seed: 6 }));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(shapePoints(normalizeShapeOptions({ ...base, irregularity: 0 })).length).toBe(8);
});

test('without irregularity a regular polygon has equal radii', () => {
    const pts = shapePoints(normalizeShapeOptions({ shape: 'polygon', sides: 6, irregularity: 0 }));
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
});
