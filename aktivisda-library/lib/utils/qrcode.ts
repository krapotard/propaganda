import QRCode from 'qrcode';

import { bodyPath, eyesPath, isInFinder, QrStyle } from './qrstyles.ts';

/**
 * Génère le QR code en SVG : un chemin pour le corps (data-role="body") et un pour les trois repères
 * (data-role="eye"). Les couleurs sont appliquées ensuite, au moment de l'assemblage (voir qrcodesubcomponent).
 */
export function createSvgQrcode(value: string, style: QrStyle = {}): Promise<string> {
    return new Promise((resolve, reject) => {
        if (value == '') reject();

        const qrcode = QRCode.create(value, <QRCode.QRCodeOptions><any>{
            errorCorrectionLevel: 'H',
            width: 128, // it does not like this option:/
            version: 100,
        });

        const size = qrcode.modules.size;
        const data = qrcode.modules.data;

        const body = bodyPath((row, col) => !!data[row * size + col], size, style.bodyShape || 'square', (row, col) =>
            isInFinder(row, col, size),
        );
        const eyes = eyesPath(size, style);

        resolve(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
                `<path data-role="body" d="${body}"/>` +
                `<path data-role="eye" fill-rule="evenodd" d="${eyes}"/>` +
                `</svg>`,
        );
    });
}
