'use strict';

// Les polices d'Aktivisda sont des familles séparées : « Barlow », « Barlow Gras », « Barlow Italique »,
// « Barlow Gras Italique »… Le gras et l'italique consistent donc à passer d'une famille à l'autre.

export function parseFontStyle(fontName) {
    const m = /^(.*?)( Gras)?( Italique)?$/.exec(fontName || '');
    return { base: m[1], bold: !!m[2], italic: !!m[3] };
}

export function buildFontName(base, bold, italic) {
    return base + (bold ? ' Gras' : '') + (italic ? ' Italique' : '');
}

// Variantes ajoutées à la liste des polices si l'instance ne les déclare pas (fichiers dans static/fonts/)
const BARLOW_SEMI = 'Barlow-Semi-Condensed';
export const EXTRA_FONTS = [
    ['Barlow Semi Condensed Italique', 'Barlow-Semi-Condensed-Italique'],
    ['Barlow Semi Condensed Gras Italique', 'Barlow-Semi-Condensed-Gras-Italique'],
].map(([fontName, file]) => ({
    css: { 'font-style': 'normal', 'font-weight': 'normal', 'font-display': null, 'unicode-range': null },
    fontName,
    directory: BARLOW_SEMI,
    formats: { ttf: `${file}.ttf`, woff2: `${file}.woff2` },
    name: fontName,
    loaded: false,
    italic: false,
    bold: false,
    alwaysLoaded: true,
    default: false,
}));

export function withExtraFonts(fonts) {
    const known = new Set(fonts.map((f) => f.fontName));
    return fonts.concat(EXTRA_FONTS.filter((f) => !known.has(f.fontName)).map((f) => JSON.parse(JSON.stringify(f))));
}
