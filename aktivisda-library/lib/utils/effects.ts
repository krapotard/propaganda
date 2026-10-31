import Konva from 'konva';

/** Flou maximal proposé (en pixels du visuel). */
export const MAX_BLUR = 100;

/**
 * Applique l'opacité et le flou d'un élément à son noeud Konva.
 * Le flou est exprimé en pixels du visuel : le noeud est mis en cache (avec une marge pour le halo)
 * à sa résolution propre (pixelRatio 1), ce qui donne le même rendu à l'écran et dans les exports.
 */
export function applyNodeEffects(node: Konva.Node, opacity: number | undefined, blur: number | undefined) {
    const o = typeof opacity === 'number' && isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
    const b = typeof blur === 'number' && isFinite(blur) ? Math.min(MAX_BLUR, Math.max(0, blur)) : 0;
    node.opacity(o);
    // on repart d'un cache propre : le contenu a pu changer
    if (node.isCached()) node.clearCache();
    if (b <= 0) {
        node.filters([]);
        return;
    }
    const scale = (Math.abs(node.scaleX()) + Math.abs(node.scaleY())) / 2 || 1;
    const radius = Math.max(1, b / scale);
    const pad = Math.ceil(radius * 2) + 2;
    const rect = node.getClientRect({ skipTransform: true });
    if (rect.width <= 0 || rect.height <= 0) return;
    node.cache({
        x: Math.floor(rect.x - pad),
        y: Math.floor(rect.y - pad),
        width: Math.ceil(rect.width + 2 * pad),
        height: Math.ceil(rect.height + 2 * pad),
        pixelRatio: 1,
    });
    node.filters([Konva.Filters.Blur]);
    node.blurRadius(radius);
}

/** Marge (px du visuel) ajoutée autour d'un élément flou pour ne pas couper le halo. */
export function blurMargin(blur: number): number {
    return blur > 0 ? Math.ceil(Math.min(MAX_BLUR, blur) * 2) + 2 : 0;
}
