import * as pdfMake from 'pdfmake/build/pdfmake.js';
import { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

/**
 *
 * @param pdfDescription
 * @returns
 */
export function toPdfDataUrl(pdfDescription: TDocumentDefinitions, fonts: TFontDictionary): Promise<string> {
    return new Promise((resolve, reject) => {
        try {

            const pdfDocGenerator = pdfMake.createPdf(pdfDescription, undefined, fonts);

            // Pdfdocgenerator getDataUrl callback
            // sucks because it doesn’t catch
            // errors during callback
            // It will change in v3.x
            pdfDocGenerator.getDataUrl((url: string) => {
                resolve(url);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Charge une image (data URL) dans un HTMLImageElement.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image illisible'));
        img.src = src;
    });
}

/**
 * Réduit une image à targetWidth pixels de large (rapport conservé), par moitiés successives pour éviter le crénelage.
 * Renvoie un data URL : JPEG (qualité 0.85) si l'image est opaque, PNG si elle a de la transparence.
 * Renvoie undefined si la réduction n'est pas utile (résultat pas plus léger).
 */
async function shrinkDataUrl(original: string, img: HTMLImageElement, targetWidth: number): Promise<string | undefined> {
    const ratio = img.naturalHeight / img.naturalWidth;
    const targetHeight = Math.max(1, Math.round(targetWidth * ratio));
    let source: CanvasImageSource = img;
    let w = img.naturalWidth;
    let h = img.naturalHeight;
    while (w / 2 > targetWidth) {
        const c = document.createElement('canvas');
        w = Math.round(w / 2);
        h = Math.max(1, Math.round(h / 2));
        c.width = w;
        c.height = h;
        const cx = c.getContext('2d')!;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(source, 0, 0, w, h);
        source = c;
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    const pixels = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
    let hasAlpha = false;
    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] < 255) {
            hasAlpha = true;
            break;
        }
    }
    const result = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.85);
    return result.length < original.length ? result : undefined;
}

const MAX_SIDE_PX = 3000;
const MIN_SIDE_PX = 200;

/**
 * Version « web » du PDF : réduit, directement dans le navigateur, les images embarquées dans les SVG
 * (logos, illustrations, photos) et les images raster (éléments floutés) de la description pdfmake.
 * La résolution visée est dpi, calculée sur la taille réellement affichée sur la page. Les textes et les formes
 * restent vectoriels. Modifie la description en place.
 */
export async function reduceDescriptionImages(description: any, dpi: number): Promise<void> {
    // 1. Collecte des blocs concernés
    const blocks: any[] = [];
    const walk = (node: any) => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
            if (typeof node.svg === 'string' && node.svg.includes('data:image/')) blocks.push(node);
            else if (typeof node.image === 'string' && node.image.startsWith('data:image/') && node.width && node.height) blocks.push(node);
            for (const k of ['content', 'stack', 'columns']) if (node[k]) walk(node[k]);
        }
    };
    walk(description.content);

    // 2. Besoin en pixels de chaque image (la plus grande utilisation l'emporte)
    const needs = new Map<string, number>();
    const parsed: { block: any; doc: Document; items: { el: Element; href: string; attr: string }[] }[] = [];
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
    try {
        for (const block of blocks) {
            if (typeof block.image === 'string') {
                needs.set(block.image, Math.max(needs.get(block.image) || 0, (block.width * dpi) / 72));
                continue;
            }
            // Les SVG fabriqués par Propaganda n'ont pas toujours d'espace de noms : sans lui le navigateur ne les dessine pas
            const svgSource = /<svg\b[^>]*\bxmlns\s*=/.test(block.svg) ? block.svg : block.svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
            const doc = new DOMParser().parseFromString(svgSource, 'image/svg+xml');
            const root = doc.documentElement;
            if (doc.querySelector('parsererror') || root.nodeName.toLowerCase() !== 'svg') continue;
            // Affichage à l'échelle de la page (1 unité = 1 pt) pour mesurer la taille réelle de chaque image
            const probe = <SVGSVGElement><unknown>document.importNode(root, true);
            probe.setAttribute('width', String(block.width));
            probe.setAttribute('height', String(block.height));
            host.appendChild(probe);
            const probeImages = Array.from(probe.querySelectorAll('image'));
            const items: { el: Element; href: string; attr: string }[] = [];
            const rootImages = Array.from(root.querySelectorAll('image'));
            for (let i = 0; i < rootImages.length; i++) {
                const el = rootImages[i];
                const attr = el.hasAttribute('href') ? 'href' : 'xlink:href';
                const href = el.getAttribute(attr) || '';
                if (!href.startsWith('data:image/')) continue;
                // Sans largeur/hauteur explicites, la taille d'affichage dépend de l'image : on la fixe à l'originale
                // (avant la réduction, pour que l'affichage ne change pas)
                if (!el.hasAttribute('width') || !el.hasAttribute('height')) {
                    try {
                        const img = await loadImage(href);
                        for (const e of [el, probeImages[i]]) {
                            if (!e.hasAttribute('width')) e.setAttribute('width', String(img.naturalWidth));
                            if (!e.hasAttribute('height')) e.setAttribute('height', String(img.naturalHeight));
                        }
                    } catch (e) {
                        continue;
                    }
                }
                // Mesure impossible (élément non rendu comme une image SVG) : l'image est conservée telle quelle
                if (!(probeImages[i] instanceof SVGImageElement)) continue;
                const rect = probeImages[i].getBoundingClientRect();
                if (!(rect.width > 0)) continue;
                needs.set(href, Math.max(needs.get(href) || 0, (rect.width * dpi) / 72));
                items.push({ el, href, attr });
            }
            host.removeChild(probe);
            parsed.push({ block, doc, items });
        }
    } finally {
        document.body.removeChild(host);
    }

    // 3. Réduction (une seule fois par image distincte)
    const replaced = new Map<string, { href: string; naturalWidth: number; naturalHeight: number }>();
    for (const [href, need] of needs) {
        try {
            const img = await loadImage(href);
            // Plancher : jamais moins de MIN_SIDE_PX (ou la taille d'origine si elle est plus petite), même si la mesure est étrange
            const target = Math.min(Math.max(Math.ceil(need), MIN_SIDE_PX), MAX_SIDE_PX, img.naturalWidth);
            // Plafond aussi sur le grand côté
            const longest = Math.max(img.naturalWidth, img.naturalHeight);
            const cap = Math.floor((target * longest) / img.naturalWidth) > MAX_SIDE_PX ? Math.floor((MAX_SIDE_PX * img.naturalWidth) / longest) : target;
            if (cap >= img.naturalWidth * 0.9) continue;
            const small = await shrinkDataUrl(href, img, Math.max(1, cap));
            if (small) replaced.set(href, { href: small, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight });
        } catch (e) {
            // image conservée telle quelle
        }
    }

    // 4. Réécriture
    for (const block of blocks) {
        if (typeof block.image === 'string' && replaced.has(block.image)) block.image = replaced.get(block.image)!.href;
    }
    for (const { block, doc, items } of parsed) {
        let changed = false;
        for (const { el, href, attr } of items) {
            const r = replaced.get(href);
            if (!r) continue;
            el.setAttribute(attr, r.href);
            changed = true;
        }
        if (changed) block.svg = new XMLSerializer().serializeToString(doc.documentElement);
    }
}
