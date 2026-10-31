'use strict';

/**
 * Geometric shapes (rectangle, ellipse, regular/irregular polygon, star).
 * A shape is described by a few options and turned into a self-contained SVG string,
 * so that it can be rendered, exported (png/svg/pdf) and saved like any other image.
 *
 * Randomness ("irregularity") is seeded: the same seed always gives the same drawing,
 * so a template can be saved and reloaded identically. Change the seed to draw a new one.
 */

export type ShapeType = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line';
export type LineCap = 'flat' | 'round' | 'ball' | 'arrow';
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface ShapeOptions {
    shape: ShapeType;
    sides: number; // polygon: 3..30
    points: number; // star: 3..30
    innerRatio: number; // star: inner radius / outer radius (0.1..0.95)
    irregularity: number; // polygon & star: 0..100 (0 = perfectly regular)
    seed: number; // integer driving the irregularity
    ratio: number; // rect & ellipse: width / height (0.2..5)
    cornerRadius: number; // rect: 0..100 (% of the max rounding)
    fill: string; // #rrggbb or 'none'
    border: boolean; // draw an outline or not
    stroke: string; // border color, #rrggbb
    strokeWidth: number; // border width, 1..50
    lineStyle: LineStyle; // line: solid, dashed or dotted
    capStart: LineCap; // line: left end (flat, round, ball, arrow)
    capEnd: LineCap; // line: right end
}

export interface BuiltShape {
    svg: string;
    width: number;
    height: number;
    hitform: string;
}

export const DEFAULT_SHAPE_OPTIONS: ShapeOptions = {
    shape: 'rect',
    sides: 5,
    points: 5,
    innerRatio: 0.45,
    irregularity: 0,
    seed: 1,
    ratio: 1,
    cornerRadius: 0,
    fill: '#cc0000',
    border: false,
    stroke: '#000000',
    strokeWidth: 8,
    lineStyle: 'solid',
    capStart: 'flat',
    capEnd: 'flat',
};

export const SHAPE_KEYS = Object.keys(DEFAULT_SHAPE_OPTIONS) as Array<keyof ShapeOptions>;

const BASE = 400; // longest side of the generated svg
const SHAPE_TYPES: ShapeType[] = ['rect', 'ellipse', 'polygon', 'star', 'line'];
const LINE_STYLES: LineStyle[] = ['solid', 'dashed', 'dotted'];
const LINE_CAPS: LineCap[] = ['flat', 'round', 'ball', 'arrow'];
const LINE_HEIGHT = 200; // fixed: the editor sizes an image from its aspect ratio, so the length must not change with the thickness
const LINE_HIT_MIN = 30; // a thin line stays easy to select

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const num = (value: unknown, fallback: number) => (typeof value === 'number' && isFinite(value) ? value : fallback);
const round = (value: number) => Math.round(value * 100) / 100;

/** svg paint attributes for #rrggbb[aa]: opacity goes in *-opacity (8-digit hex is not understood by every converter, e.g. PDF) */
const paintAttr = (name: 'fill' | 'stroke', value: string) => {
    if (value === 'none' || value.length < 9) return `${name}="${value}"`;
    return `${name}="${value.slice(0, 7)}" ${name}-opacity="${round(parseInt(value.slice(7, 9), 16) / 255)}"`;
};

const color = (value: unknown, fallback: string, allowNone: boolean) => {
    if (typeof value !== 'string') return fallback;
    if (allowNone && value === 'none') return value;
    // Only #rrggbb or #rrggbbaa (opacity): this string ends up inside an svg document.
    return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ? value.toLowerCase() : fallback;
};

/** Returns a complete, valid set of options from any (possibly partial or untrusted) input. */
export function normalizeShapeOptions(input: Partial<ShapeOptions> | undefined): ShapeOptions {
    const o = { ...DEFAULT_SHAPE_OPTIONS, ...(input || {}) } as ShapeOptions;
    return {
        shape: SHAPE_TYPES.includes(o.shape) ? o.shape : DEFAULT_SHAPE_OPTIONS.shape,
        sides: Math.round(clamp(num(o.sides, 5), 3, 30)),
        points: Math.round(clamp(num(o.points, 5), 3, 30)),
        innerRatio: clamp(num(o.innerRatio, 0.45), 0.1, 0.95),
        irregularity: clamp(num(o.irregularity, 0), 0, 100),
        seed: Math.round(num(o.seed, 1)) >>> 0,
        ratio: clamp(num(o.ratio, 1), 0.2, 5),
        cornerRadius: clamp(num(o.cornerRadius, 0), 0, 100),
        fill: color(o.fill, DEFAULT_SHAPE_OPTIONS.fill, true),
        border: o.border === true,
        stroke: color(o.stroke, DEFAULT_SHAPE_OPTIONS.stroke, false),
        strokeWidth: clamp(num(o.strokeWidth, 8), 1, 50),
        lineStyle: LINE_STYLES.includes(o.lineStyle) ? o.lineStyle : 'solid',
        capStart: LINE_CAPS.includes(o.capStart) ? o.capStart : 'flat',
        capEnd: LINE_CAPS.includes(o.capEnd) ? o.capEnd : 'flat',
    };
}

/** Small seeded random generator (mulberry32): same seed => same sequence. */
export function seededRandom(seed: number) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Vertices of the polygon / star on the unit circle, with optional seeded irregularity. */
export function shapePoints(o: ShapeOptions): Array<[number, number]> {
    const rnd = seededRandom(o.seed);
    const k = o.irregularity / 100;
    const count = o.shape === 'star' ? o.points * 2 : o.sides;
    const step = (2 * Math.PI) / count;
    // Even polygons get a flat top (a square stays a square, not a diamond)
    const offset = o.shape === 'polygon' && count % 2 === 0 ? step / 2 : 0;
    const points: Array<[number, number]> = [];
    for (let i = 0; i < count; ++i) {
        const inner = o.shape === 'star' && i % 2 === 1;
        // Two draws per vertex, always in the same order, so the seed stays stable when sliders move.
        const radial = rnd() * 2 - 1;
        const angular = rnd() * 2 - 1;
        let radius = inner ? o.innerRatio : 1;
        radius = Math.max(0.1, radius * (1 + radial * 0.45 * k));
        const angle = -Math.PI / 2 + offset + i * step + angular * 0.35 * k * step;
        points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
    }
    return points;
}

const hitformOf = (points: Array<[number, number]>) =>
    points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${round(x)} ${round(y)}`).join(' ') + ' Z';

/** Builds the svg of a shape. Colors and outline are part of the drawing. */
export function buildShape(input: Partial<ShapeOptions> | undefined): BuiltShape {
    const o = normalizeShapeOptions(input);
    const pad = o.border ? o.strokeWidth / 2 : 0;
    const paint =
        paintAttr('fill', o.fill) + (o.border ? ` ${paintAttr('stroke', o.stroke)} stroke-width="${round(o.strokeWidth)}" stroke-linejoin="round"` : '');
    const wrap = (width: number, height: number, element: string) =>
        `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}" viewBox="0 0 ${round(width)} ${round(height)}">${element}</svg>`;

    if (o.shape === 'line') {
        // Horizontal line; rotate / resize it in the editor. Integer sizes (see below).
        const t = Math.round(o.strokeWidth);
        const width = BASE;
        // Reach of each end beyond the body: round = t/2, ball = 1.5t, arrow = 3t
        // ball: the body starts where it exactly meets the circle; no overlap, so a semi-transparent line has no darker spots
        const reach = (cap: LineCap) => (cap === 'round' ? t / 2 : cap === 'ball' ? 1.5 * t + Math.sqrt(2) * t : cap === 'arrow' ? 3 * t : 0);
        const height = LINE_HEIGHT;
        const half = Math.max(t / 2, o.capStart === 'ball' || o.capEnd === 'ball' ? 1.5 * t : 0, o.capStart === 'arrow' || o.capEnd === 'arrow' ? 1.75 * t : 0);
        const y = height / 2;
        const dotted = o.lineStyle === 'dotted';
        const x0 = reach(o.capStart);
        const x1 = width - reach(o.capEnd);
        // Dotted: round dots centred on the body ends
        const b0 = x0 + (dotted && o.capStart === 'flat' ? t / 2 : 0);
        const b1 = x1 - (dotted && o.capEnd === 'flat' ? t / 2 : 0);
        const dash = o.lineStyle === 'dashed' ? `${round(t * 3)} ${round(t * 2)}` : dotted ? `0.01 ${round(t * 2)}` : '';
        const stroke = paintAttr('stroke', o.stroke);
        const fill = paintAttr('fill', o.stroke);
        const overlap = 0;
        let element =
            `<line x1="${round(b0)}" y1="${round(y)}" x2="${round(b1)}" y2="${round(y)}" ${stroke} stroke-width="${t}"` +
            (dotted ? ' stroke-linecap="round"' : '') +
            (dash ? ` stroke-dasharray="${dash}"` : '') +
            '/>';
        const endShape = (cap: LineCap, atStart: boolean) => {
            const dir = atStart ? 1 : -1;
            const edge = atStart ? x0 : x1;
            const tip = atStart ? 0 : width;
            if (cap === 'round') return `<path d="M ${round(edge)} ${round(y - t / 2)} A ${round(t / 2)} ${round(t / 2)} 0 0 ${atStart ? 0 : 1} ${round(edge)} ${round(y + t / 2)} Z" ${fill}/>`;
            if (cap === 'ball') return `<circle cx="${round(atStart ? 1.5 * t : width - 1.5 * t)}" cy="${round(y)}" r="${round(1.5 * t)}" ${fill}/>`;
            if (cap === 'arrow') {
                const bx = edge + dir * overlap;
                return `<polygon points="${round(tip)},${round(y)} ${round(bx)},${round(y - 1.75 * t)} ${round(bx)},${round(y + 1.75 * t)}" ${fill}/>`;
            }
            return '';
        };
        element += endShape(o.capStart, true) + endShape(o.capEnd, false);
        const hit = Math.max(LINE_HIT_MIN, Math.ceil(half * 2)) / 2;
        const box: Array<[number, number]> = [[0, y - hit], [width, y - hit], [width, y + hit], [0, y + hit]];
        return { svg: wrap(width, height, element), width, height, hitform: hitformOf(box) };
    }

    if (o.shape === 'rect' || o.shape === 'ellipse') {
        // Integer sizes: the pdf export of a rotated image reads the viewBox with parseInt
        const width = Math.round(o.ratio >= 1 ? BASE : BASE * o.ratio);
        const height = Math.round(o.ratio >= 1 ? BASE / o.ratio : BASE);
        const w = width - 2 * pad;
        const h = height - 2 * pad;
        if (o.shape === 'rect') {
            const r = (o.cornerRadius / 100) * (Math.min(w, h) / 2);
            const element = `<rect x="${round(pad)}" y="${round(pad)}" width="${round(w)}" height="${round(h)}" rx="${round(r)}" ry="${round(r)}" ${paint}/>`;
            const corners: Array<[number, number]> = [[pad, pad], [pad + w, pad], [pad + w, pad + h], [pad, pad + h]];
            return { svg: wrap(width, height, element), width: round(width), height: round(height), hitform: hitformOf(corners) };
        }
        const element = `<ellipse cx="${round(width / 2)}" cy="${round(height / 2)}" rx="${round(w / 2)}" ry="${round(h / 2)}" ${paint}/>`;
        const outline: Array<[number, number]> = [];
        for (let i = 0; i < 48; ++i) {
            const a = (i / 48) * 2 * Math.PI;
            outline.push([width / 2 + (w / 2) * Math.cos(a), height / 2 + (h / 2) * Math.sin(a)]);
        }
        return { svg: wrap(width, height, element), width: round(width), height: round(height), hitform: hitformOf(outline) };
    }

    const raw = shapePoints(o);
    const xs = raw.map((p) => p[0]);
    const ys = raw.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const boxW = Math.max(...xs) - minX;
    const boxH = Math.max(...ys) - minY;
    const scale = (BASE - 2 * pad) / Math.max(boxW, boxH);
    const points = raw.map(([x, y]): [number, number] => [(x - minX) * scale + pad, (y - minY) * scale + pad]);
    const width = Math.round(boxW * scale + 2 * pad);
    const height = Math.round(boxH * scale + 2 * pad);
    const element = `<polygon points="${points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')}" ${paint}/>`;
    return { svg: wrap(width, height, element), width: round(width), height: round(height), hitform: hitformOf(points) };
}
