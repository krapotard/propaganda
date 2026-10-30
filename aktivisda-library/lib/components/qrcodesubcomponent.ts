'use strict';

import { ImageOptions, GalleryInternalSvg } from "../typing";

import { Canvg } from 'canvg';

import { createSvgQrcode } from '../utils/qrcode.ts';
import { QrStyle } from '../utils/qrstyles.ts';
import { colorSvgString, svgToDom, colorsChanged, makeHitformFunction, loadSvg } from '../utils/svgutils.ts';

import ImageVidaSubComponent from './imagevidasubcomponent';
import Vida from '../vida.ts';
import InvalidDataError from "../invaliddataerror.ts";

export default class QrcodeVidaSubComponent extends ImageVidaSubComponent {

    recomputeMergeSvg: boolean;
    symbolSvgString: string | undefined;
    symbolColoredString: string | undefined;
    options: Partial<ImageOptions>;
    qrcodeResultDom: HTMLDivElement | undefined;
    baseQrcodeString: string | undefined;
    canvas: HTMLCanvasElement | undefined;
    canvgElement: Canvg | undefined;
    hitform: string | undefined;
    type: 'qrcode'

    constructor(vida: Vida) {
        super(vida);
        this.recomputePosition = false;
        this.recomputeImage = false;
        this.recomputeMergeSvg = false;
        this.type = 'qrcode';
        this.options = {};
    }

    randomOptions(): Partial<ImageOptions> {
        if (this.vida.gallery === undefined) {
            throw new InvalidDataError('Please provide a gallery if you use internalsvg!')
        }
        const randomOptions: Partial<ImageOptions> = {
            type: this.type,
            url: 'https://cgtftocc.org',
            color: '#000000',
            backgroundColor: '#ffffff',
            bodyShape: 'square',
            frameShape: 'square',
            ballShape: 'square',
            eyeColor: undefined,
            colorEnd: undefined,
            margin: 16,
            symbol: {},
        };
        return randomOptions;
    }

    toJson() {
        const symbol = this.options.symbol && this.options.symbol.id ? { id: this.options.symbol.id, colors: this.options.symbol.colors } : {};
        return {
            type: this.type,
            url: this.options.url,
            color: this.options.color,
            backgroundColor: this.options.backgroundColor,
            bodyShape: this.options.bodyShape || 'square',
            frameShape: this.options.frameShape || 'square',
            ballShape: this.options.ballShape || 'square',
            eyeColor: this.options.eyeColor,
            colorEnd: this.options.colorEnd,
            margin: this.options.margin || 0,
            symbol,
        };
    }

    qrStyle(): QrStyle {
        return {
            bodyShape: this.options.bodyShape || 'square',
            frameShape: this.options.frameShape || 'square',
            ballShape: this.options.ballShape || 'square',
        };
    }

    async imageToSvg(): Promise<string | undefined | any> {
        return this.toSvg();
    }

    mergeSvg() {
        if (!this.recomputeMergeSvg) return;
        if (this.baseQrcodeString === undefined) return;

        this.recomputeMergeSvg = false;
        this.originalSize = { width: 300, height: 300 };
        const fullSize = Math.min(this.originalSize.width, this.originalSize.height);
        // Marge (zone calme) : bande de la couleur de fond autour du QR code, indispensable à la lecture.
        const margin = Math.min(Math.max(this.options.margin || 0, 0), 60);
        const resultSize = fullSize - 2 * margin;
        const qrDom = svgToDom(this.baseQrcodeString!);
        if (qrDom == undefined) throw new Error();
        if (qrDom.documentElement == null) throw new Error();
        const svgElement = <SVGSVGElement><any>qrDom.documentElement;
        const viewBox = svgElement.getAttribute('viewBox')?.split(' ');
        if (viewBox == undefined)
            throw new Error('Undefined viewbox');

        let symbolGroup = undefined;
        if (this.symbolColoredString != undefined) {
            const symbolDom = svgToDom(this.symbolColoredString);
            const symbolSvgElement = <SVGSVGElement><any>symbolDom.documentElement;

            const symbolViewBox = symbolSvgElement.getAttribute('viewBox')?.split(' ')
                .map((x) => parseFloat(x));

            if (symbolViewBox?.length != 4)
                throw new InvalidDataError('Viewbox is not a valid viewbox')

            console.assert(this.originalSize.width === this.originalSize.height);
            const symbolMaxSize = 0.5 * resultSize;

            const symbolScale = symbolMaxSize / Math.max(symbolViewBox[2], symbolViewBox[3]);

            const translateX = (300 - symbolViewBox[2] * symbolScale) / 2;
            const translateY = (300 - symbolViewBox[3] * symbolScale) / 2;

            symbolGroup = document.createElement('g');
            symbolGroup.setAttribute('transform', `translate(${translateX}, ${translateY}) scale(${symbolScale})`);

            const symbolBackground = document.createElement('path');
            symbolBackground.setAttribute('d', this.options.symbol!.backgroundHull!);
            symbolBackground.setAttribute('style', `fill:${this.options.backgroundColor}`);

            symbolGroup.replaceChildren(symbolBackground, ...symbolDom.documentElement.children);
        }

        const qrcodeBackground = document.createElement('rect');
        qrcodeBackground.setAttribute('style', `fill:${this.options.backgroundColor}`);
        qrcodeBackground.setAttribute('width', String(this.originalSize.width));
        qrcodeBackground.setAttribute('height', String(this.originalSize.height));
        qrcodeBackground.setAttribute('x', '0');
        qrcodeBackground.setAttribute('y', '0');

        const qrcodeSize = parseFloat(viewBox[2]); // Width
        const bodyPath = svgElement.querySelector('path[data-role="body"]');
        const eyePath = svgElement.querySelector('path[data-role="eye"]');
        if (eyePath) eyePath.setAttribute('fill', this.options.eyeColor || this.options.color || '#000000');
        if (bodyPath && this.options.colorEnd && this.options.colorEnd !== this.options.color) {
            const svgns = 'http://www.w3.org/2000/svg';
            const defs = qrDom.createElementNS(svgns, 'defs');
            const gradient = qrDom.createElementNS(svgns, 'linearGradient');
            gradient.setAttribute('id', 'qrgradient');
            gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
            gradient.setAttribute('x1', '0');
            gradient.setAttribute('y1', '0');
            gradient.setAttribute('x2', String(qrcodeSize));
            gradient.setAttribute('y2', String(qrcodeSize));
            for (const [offset, color] of [['0', this.options.color], ['1', this.options.colorEnd]]) {
                const stop = qrDom.createElementNS(svgns, 'stop');
                stop.setAttribute('offset', offset!);
                stop.setAttribute('stop-color', color!);
                gradient.appendChild(stop);
            }
            defs.appendChild(gradient);
            svgElement.insertBefore(defs, svgElement.firstChild);
            bodyPath.setAttribute('fill', 'url(#qrgradient)');
        }

        const qrcodeGroup = document.createElement('g');
        qrcodeGroup.setAttribute('transform', `translate(${margin}, ${margin}) scale(${resultSize / qrcodeSize})`);
        qrcodeGroup.setAttribute('style', `fill:${this.options.color}`);

        qrcodeGroup.replaceChildren(...qrDom.documentElement.children);

        this.qrcodeResultDom = document.createElement('div');
        const svgns = 'http://www.w3.org/2000/svg';
        const svgResult = document.createElementNS(svgns, 'svg');
        svgResult.setAttribute('viewBox', `0 0 ${this.originalSize.width} ${this.originalSize.height}`);
        svgResult.setAttribute('width', String(this.originalSize.width));
        svgResult.setAttribute('height', String(this.originalSize.height));
        svgResult.setAttribute('style', `background-color:${this.options.backgroundColor}`);
        svgResult.setAttribute('xmlns:dc', 'http://purl.org/dc/elements/1.1/');
        svgResult.setAttribute('xmlns:cc', 'http://creativecommons.org/ns#');
        svgResult.setAttribute('xmlns:rdf', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#');
        svgResult.setAttribute('xmlns:svg', 'http://www.w3.org/2000/svg');
        svgResult.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgResult.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        svgResult.setAttribute('xmlns:sodipodi', 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd');
        svgResult.setAttribute('xmlns:inkscape', 'http://www.inkscape.org/namespaces/inkscape');
        svgResult.setAttribute('xml:space', 'preserve');
        svgResult.setAttribute('version', '1.1');

        svgResult.appendChild(qrcodeBackground);
        svgResult.appendChild(qrcodeGroup);
        if (symbolGroup) svgResult.appendChild(symbolGroup);

        this.qrcodeResultDom.appendChild(svgResult);
    }

    update(options: Partial<ImageOptions>): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!this.options.url) this.options.url = undefined;
            if (!this.options.color) this.options.color = undefined;
            if (!this.options.backgroundColor) this.options.backgroundColor = undefined;
            if (!this.options.symbol) this.options.symbol = {};
            let recreate_qrcode = false;

            if (options && options.color && this.options.color !== options.color) {
                this.options.color = options.color;
                this.recomputeImage = true;
                this.recomputeMergeSvg = true;
            }

            if (options && options.backgroundColor && this.options.backgroundColor !== options.backgroundColor) {
                this.options.backgroundColor = options.backgroundColor;
                this.recomputeImage = true;
                this.recomputeMergeSvg = true;
            }

            if (options && options.url && options.url !== this.options.url) {
                this.options.url = options.url;
                recreate_qrcode = true;
            }

            // Formes : il faut redessiner le QR code
            for (const key of <const>['bodyShape', 'frameShape', 'ballShape']) {
                if (options && options[key] && options[key] !== this.options[key]) {
                    (<any>this.options)[key] = options[key];
                    recreate_qrcode = true;
                }
            }
            if (options && options.margin !== undefined && options.margin !== this.options.margin) {
                this.options.margin = options.margin;
                this.recomputeImage = true;
                this.recomputeMergeSvg = true;
            }
            // Couleurs des repères et du dégradé ('' ou null = retour à la couleur du corps)
            for (const key of <const>['eyeColor', 'colorEnd']) {
                if (options && options[key] !== undefined && (options[key] || undefined) !== this.options[key]) {
                    this.options[key] = options[key] || undefined;
                    this.recomputeImage = true;
                    this.recomputeMergeSvg = true;
                }
            }

            if (recreate_qrcode && this.options.url) {
                createSvgQrcode(this.options.url!, this.qrStyle()).then((svgString: string) => {
                    this.baseQrcodeString = svgString;
                    this.update(options).then(() => {
                        this.recomputeImage = true;
                        this.recomputeMergeSvg = true;
                        resolve();
                    });
                });
                return;
            }

            if (
                options &&
                options.symbol &&
                Object.keys(options.symbol).length === 0 &&
                (!this.options.symbol || Object.keys(this.options.symbol).length > 0)
            ) {
                this.options.symbol = {};
                this.recomputeMergeSvg = true;
                this.symbolSvgString = undefined;
                this.symbolColoredString = undefined;
                this.recomputeImage = true;
            }

            if (options && options.symbol && options.symbol.id && options.symbol.id !== this.options.symbol.id) {
                if (this.options.symbol === undefined) this.options.symbol = {};
                this.options.symbol.id = options.symbol.id;

                if (this.vida.gallery === undefined) {
                    throw new InvalidDataError('Please provide a gallery if you use internalsvg!')
                }

                const image = <GalleryInternalSvg>this.vida.gallery.elementById(options.symbol.id);

                this.options.symbol.backgroundHull = image.backgroundHull ? image.backgroundHull : image.hitform;
                this.options.symbol.colors = image.colors;

                this.vida.gallery.fileUrl(options.symbol.id).then((symbolUrl: string) => {
                    loadSvg(symbolUrl, { prepareColors: true }).then((svgString: string) => {
                        this.recomputeMergeSvg = true;
                        this.recomputeImage = true;
                        this.symbolSvgString = svgString;
                        this.symbolColoredString = colorSvgString(this.symbolSvgString, image.colors).string;
                        this.update({}).then(() => {
                            resolve();
                        });
                    });
                });
                return;
            }

            if (options && options.symbol && options.symbol.colors && colorsChanged(this.options.symbol.colors!, options.symbol.colors!)) {
                this.options.symbol.colors = options.symbol.colors;
                this.symbolColoredString = colorSvgString(this.symbolSvgString!, options.symbol.colors).string;
                this.recomputeMergeSvg = true;
                this.recomputeImage = true;
            }
            this.originalSize = { width: 300, height: 300 };

            resolve();
        });
    }

    toSvg() {
        this.mergeSvg();
        if (!this.qrcodeResultDom) return '<svg></svg>';
        return this.qrcodeResultDom.innerHTML;
    }

    makeImage(imageWidth: number, imageHeight: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.inResize) reject();

            this.inResize = true;

            if (!this.canvas) this.canvas = window.document.createElement('canvas');
            const ctx = this.canvas.getContext('2d');

            try {
                this.canvgElement = Canvg.fromString(ctx!, this.toSvg());
            } catch (err) {
                reject(err);
                return;
            }

            this.canvgElement.resize(imageWidth, imageHeight, 'xMidYMid meet');
            this.canvgElement
                .render()
                .then(() => {
                    this.inResize = false;
                    resolve();
                })
                .catch((err) => reject(err));
        });
    }

    image(): HTMLCanvasElement | undefined {
        console.assert(this.canvas);
        return this.canvas;
    }

    makeHitformFunction(scale: number) {
        return makeHitformFunction(this.hitform!, scale);
    }
}
