// Formes disponibles pour les QR codes stylés.
// Seules les formes lues par au moins deux décodeurs sur trois (jsQR, OpenCV, ZXing) ont été gardées :
// le cadre rond et le centre en losange, illisibles pour la plupart, ont été retirés.
// Tout est dessiné en chemins SVG : aucune dépendance, rendu identique à l'écran, en PNG, en SVG et en PDF.

export type QrBodyShape = 'square' | 'tiles' | 'rounded' | 'dots' | 'diamond' | 'vbars' | 'hbars';
export type QrFrameShape = 'square' | 'rounded' | 'leaf' | 'leaf2';
export type QrBallShape = 'square' | 'rounded' | 'circle' | 'leaf';

export interface QrStyle {
    bodyShape?: QrBodyShape;
    frameShape?: QrFrameShape;
    ballShape?: QrBallShape;
}

export const QR_BODY_SHAPES: QrBodyShape[] = ['square', 'tiles', 'rounded', 'dots', 'diamond', 'vbars', 'hbars'];
export const QR_FRAME_SHAPES: QrFrameShape[] = ['square', 'rounded', 'leaf', 'leaf2'];
export const QR_BALL_SHAPES: QrBallShape[] = ['square', 'rounded', 'circle', 'leaf'];

type Radii = [number, number, number, number]; // haut-gauche, haut-droite, bas-droite, bas-gauche

const FRAME_RADII: Record<QrFrameShape, Radii> = {
    square: [0, 0, 0, 0],
    rounded: [1.6, 1.6, 1.6, 1.6],
    leaf: [3.2, 0, 3.2, 0],
    leaf2: [0, 3.2, 0, 3.2],
};

const BALL_RADII: Record<QrBallShape, Radii> = {
    square: [0, 0, 0, 0],
    rounded: [0.9, 0.9, 0.9, 0.9],
    circle: [1.5, 1.5, 1.5, 1.5],
    leaf: [1.5, 0, 1.5, 0],
};

const n = (value: number): string => String(Math.round(value * 1000) / 1000);

function roundedRect(x: number, y: number, w: number, h: number, radii: Radii): string {
    const r = radii.map((v) => Math.min(Math.max(v, 0), w / 2, h / 2)) as Radii;
    const [tl, tr, br, bl] = r;
    let d = `M${n(x + tl)} ${n(y)}H${n(x + w - tr)}`;
    if (tr) d += `A${n(tr)} ${n(tr)} 0 0 1 ${n(x + w)} ${n(y + tr)}`;
    d += `V${n(y + h - br)}`;
    if (br) d += `A${n(br)} ${n(br)} 0 0 1 ${n(x + w - br)} ${n(y + h)}`;
    d += `H${n(x + bl)}`;
    if (bl) d += `A${n(bl)} ${n(bl)} 0 0 1 ${n(x)} ${n(y + h - bl)}`;
    d += `V${n(y + tl)}`;
    if (tl) d += `A${n(tl)} ${n(tl)} 0 0 1 ${n(x + tl)} ${n(y)}`;
    return d + 'Z';
}

function circle(cx: number, cy: number, r: number): string {
    return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`;
}

function diamond(cx: number, cy: number, half: number): string {
    return `M${n(cx)} ${n(cy - half)}L${n(cx + half)} ${n(cy)}L${n(cx)} ${n(cy + half)}L${n(cx - half)} ${n(cy)}Z`;
}

/** Dessine les modules sombres de la matrice (hors zone ignorée) selon la forme choisie. */
export function bodyPath(
    isDark: (row: number, col: number) => boolean,
    size: number,
    shape: QrBodyShape,
    skip: (row: number, col: number) => boolean = () => false,
): string {
    const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < size && c < size && isDark(r, c) && !skip(r, c);
    let d = '';

    if (shape === 'square' || shape === 'hbars') {
        // Lignes continues de modules : moins de formes, pas de coutures visibles.
        for (let row = 0; row < size; row++) {
            let col = 0;
            while (col < size) {
                if (!dark(row, col)) {
                    col++;
                    continue;
                }
                let end = col;
                while (dark(row, end + 1)) end++;
                const run = end - col + 1;
                d +=
                    shape === 'square'
                        ? `M${col} ${row}h${n(run + 0.02)}v1.02h${n(-(run + 0.02))}Z`
                        : roundedRect(col + 0.04, row + 0.1, run - 0.08, 0.8, [0.4, 0.4, 0.4, 0.4]);
                col = end + 1;
            }
        }
        return d;
    }

    if (shape === 'vbars') {
        for (let col = 0; col < size; col++) {
            let row = 0;
            while (row < size) {
                if (!dark(row, col)) {
                    row++;
                    continue;
                }
                let end = row;
                while (dark(end + 1, col)) end++;
                const run = end - row + 1;
                d += roundedRect(col + 0.1, row + 0.04, 0.8, run - 0.08, [0.4, 0.4, 0.4, 0.4]);
                row = end + 1;
            }
        }
        return d;
    }

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (!dark(row, col)) continue;
            switch (shape) {
                case 'tiles':
                    d += `M${n(col + 0.1)} ${n(row + 0.1)}h0.8v0.8h-0.8Z`;
                    break;
                case 'rounded':
                    d += roundedRect(col + 0.04, row + 0.04, 0.92, 0.92, [0.3, 0.3, 0.3, 0.3]);
                    break;
                case 'dots':
                    d += circle(col + 0.5, row + 0.5, 0.46);
                    break;
                case 'diamond':
                    d += diamond(col + 0.5, row + 0.5, 0.56);
                    break;
            }
        }
    }
    return d;
}

/** Anneau extérieur des repères (7 x 7 modules). */
export function framePath(x: number, y: number, shape: QrFrameShape): string {
    const radii = FRAME_RADII[shape] || FRAME_RADII.square;
    const inner = radii.map((v) => Math.max(v - 1, 0)) as Radii;
    return roundedRect(x, y, 7, 7, radii) + roundedRect(x + 1, y + 1, 5, 5, inner);
}

/** Centre des repères (3 x 3 modules). */
export function ballPath(x: number, y: number, shape: QrBallShape): string {
    const radii = BALL_RADII[shape] || BALL_RADII.square;
    return roundedRect(x, y, 3, 3, radii);
}

const FINDER_ORIGINS = (size: number): Array<[number, number]> => [
    [0, 0],
    [size - 7, 0],
    [0, size - 7],
];

export function isInFinder(row: number, col: number, size: number): boolean {
    return (row < 7 && col < 7) || (row < 7 && col >= size - 7) || (row >= size - 7 && col < 7);
}

export function eyesPath(size: number, style: QrStyle): string {
    const frame = style.frameShape || 'square';
    const ball = style.ballShape || 'square';
    return FINDER_ORIGINS(size)
        .map(([x, y]) => framePath(x, y, frame) + ballPath(x + 2, y + 2, ball))
        .join('');
}

/** Petite vignette pour le choix des formes dans l'interface. */
export function qrShapePreview(kind: 'body' | 'frame' | 'ball', shape: string): string {
    const svg = (box: number, d: string, rule = '') =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.5 -0.5 ${box + 1} ${box + 1}" width="40" height="40"><path fill="currentColor" ${rule} d="${d}"/></svg>`;

    if (kind === 'frame') return svg(7, framePath(0, 0, shape as QrFrameShape), 'fill-rule="evenodd"');
    if (kind === 'ball') return svg(3, ballPath(0, 0, shape as QrBallShape));

    const pattern = ['11010', '10111', '01101', '11011', '10110'];
    const d = bodyPath((r, c) => pattern[r][c] === '1', 5, shape as QrBodyShape);
    return svg(5, d);
}
