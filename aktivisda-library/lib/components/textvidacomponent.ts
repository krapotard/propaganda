'use strict';
import { Uuid, DocumentParams, ComponentOptions, Rule } from '../typing.ts';
import { assignValues, cleanUndefined, extractBestTranslation } from '../utils/utils.ts';

import AbstractVidaComponent from './abstractvidacomponent.ts';
import { computeAbsolutePosition, pxToPt } from '../utils/positionutils.ts';
import { scalePolygon, translatePolygon, computeRandomDistortedSquare, computeRotatedViewbox, degToRadian, computeBox, rotatePolygon } from '../utils/geometry.js';


import Konva from 'konva';
import Vida from '../vida.ts'
import { overrideValues, pSBC, encodeTextSvg, svgFillAttrs } from '../utils/utils.ts';
import _get from 'lodash.get'
import _set from 'lodash.set'
import InvalidDataError from '../invaliddataerror.ts';

const DEFAULT_DISTORTION = [[-1, 1], [1, 1], [1, -1], [-1, -1]]

// Image transparente de 1 pixel, support des liens cliquables dans le PDF
const TRANSPARENT_PIXEL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

/**
 * Adresse prête à être mise dans un PDF : ajoute https:// si besoin,
 * n'accepte que http, https, mailto et tel (jamais javascript:).
 */
export function normalizeLink(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    let link = value.trim();
    if (!link) return undefined;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(link)) link = 'https://' + link.replace(/^\/+/, '');
    return /^(https?|mailto|tel):/i.test(link) ? link : undefined;
}

export default class TextVidaComponent extends AbstractVidaComponent {
    type: 'emoji' | 'text' | 'textchoice';
    backgroundDistortion: Array<Array<number>> | undefined;
    backgroundDistortionAngle: number | undefined;
    backgroundPadding: number;
    backgroundMode: string;
    draw: boolean;
    text: string | undefined;
    textChoices: object = {};

    // We don't use directly konvaElementText.shadowX() because these
    // values are incorrect if angle != 0
    shadowX: number = 0;
    shadowY: number = 0;

    _recomputePosition: boolean;
    _inPromise: boolean;

    declare konvaElement: Konva.Group | undefined;
    declare konvaElementText: Konva.Text | undefined;
    declare konvaElementBackground: Konva.Shape | undefined;
    // Cadre invisible qui donne sa taille à la zone de texte (poignées de redimensionnement)
    konvaElementFrame: Konva.Rect | undefined;
    // Trait de soulignement / barré, dessiné par nos soins (identique à l'écran, en PNG/JPEG et en PDF)
    konvaElementDeco: Konva.Shape | undefined;
    boxH: number = 0;
    vAlign: string = 'top';
    underline: boolean = false;
    strikethrough: boolean = false;

    constructor(vida: Vida, componentId: Uuid, type: 'text' | 'emoji' | 'textchoice') {
        super(vida, componentId);
        assignValues(this.options, TextVidaComponent.internalDefaultOptions(), undefined);
        this.type = type;
        this.backgroundDistortionAngle = undefined;
        this.backgroundDistortion = undefined;
        this.backgroundPadding = 0;
        this.backgroundMode = 'disabled';
        this._recomputePosition = false;
        this._inPromise = false;
        this.draw = false;
    }

    /**
     *
     * Many text attributes should be randomnized directly from the
     * calling lib.
     *
     * @param {'text' | 'emoji'} type
     * @returns {ComponentOptions}
     * @example
     *
     * await componentId = vida.createRandomComponent('text');
     * const randomText = 'blabla'; // randomly generated ;)
     * await vida.updateComponent(componentId, { text: randomText })
     */
    randomOptions(type: 'text' | 'emoji' | 'textchoice'): ComponentOptions {
        const options: ComponentOptions = {
            type: type,
            angle: 0,
            size: Math.floor(20 + Math.random() * 180),
            position: { x: 0.5, y: 0.5 },
        };
        switch (type) {
            case 'textchoice':
            case 'text': {
                const angleDistortion = Math.floor(Math.random() * 40);
                // TODO remandommess here
                options['color'] = '#ffffff';
                const shadowColor = pSBC(0.4, options['color'], undefined, undefined); // x% darker
                (options['justification'] = 'left'),
                    (options['background'] = {
                        color: '#000000',
                        padding: 5,
                        // @ts-ignore
                        mode: ['normal', 'distorted', 'rounded', 'disabled'][Math.floor(Math.random() * 4)],
                        angleDistortion,
                        distortion: computeRandomDistortedSquare(angleDistortion),
                        radius: 30,
                    });
                options['shadow'] = {
                    enabled: Math.random() > 0.9,
                    color: shadowColor!,
                    offsetX: 5,
                    offsetY: 5,
                };
                options['font'] = 'Arial';
                options['text'] = 'Aktivisda';
                options['angle'] = 0;
                break;
            }
            case 'emoji': {
                options['angle'] = 15 * (Math.random() - 0.5);
                // TODO: use a random emoji list
                options['text'] = '🐘';
                break;
            }
            default:
                throw new InvalidDataError(`Type ${type} is not yet supported by randomoptions`);
        }
        return options;
    }

    async toPdf(): Promise<any> {
        if (!this.konvaElement || !this.konvaElementText || !this.konvaElementBackground) return undefined;
        // TODO support emoji.type === emoji
        let status = 'ok';
        const { x, y } = computeAbsolutePosition(this.displayedPosition, this.documentSize);
        const offset = Math.max(this.konvaElementText.fontSize(), this.konvaElement.height() * 0.1);

        const content = [];

        const textViewbox = computeRotatedViewbox(
            0,
            0,
            this.konvaElement.width() + 2 * offset,
            this.konvaElement.height() + 2 * offset,
            degToRadian(this.konvaElement.rotation()),
        );

        if (this.backgroundMode !== 'disabled') {
            const padding = Math.ceil((this.konvaElementText.fontSize() * this.backgroundPadding) / 100);

            const color = this.konvaElementBackground.fill();
            const boxHeight = this.frameHeight() + 2 * padding;
            const boxWidth = this.konvaElementText.width() + 2 * padding;

            // WARNING copy
            const distortion =
                this.backgroundMode === 'distorted'
                    ? this.backgroundDistortion!
                    : [
                          [-1, 1],
                          [1, 1],
                          [1, -1],
                          [-1, -1],
                      ];
            scalePolygon(distortion, boxWidth / 2, boxHeight / 2);
            rotatePolygon(distortion, degToRadian(this.konvaElement.rotation()));

            let svgString = '';

            const { bottom_left, width, height } = computeBox(distortion);

            if (this.backgroundMode === 'rounded') {
                const radius = _get(this.options, 'background.radius') || 0;
                svgString = `<svg width="${width}" height="${height}"
                viewBox="${bottom_left[0]} ${bottom_left[1]} ${width} ${height}">
                    <rect transform="rotate(${this.konvaElement.rotation()})"
                        x="${-boxWidth / 2}" y="${-boxHeight / 2}"
                        width="${boxWidth}" height="${boxHeight}" rx="${radius}" ry="${radius}" ${svgFillAttrs(color)}/>
                </svg>`;
            } else {
                const svgPath = `M${distortion[0][0]}, ${distortion[0][1]} \
                L${distortion[1][0]}, ${distortion[1][1]}\
                ${distortion[2][0]}, ${distortion[2][1]}\
                ${distortion[3][0]}, ${distortion[3][1]}\
                ${distortion[0][0]}, ${distortion[0][1]}Z`;

                svgString = `<svg width="${width}" height="${height}"
                viewBox="${bottom_left[0]} ${bottom_left[1]} ${width} ${height}">
                    <path ${svgFillAttrs(color)} d="${svgPath}"/>
                </svg>`;
            }

            content.push({
                svg: svgString,
                absolutePosition: {
                    x: pxToPt(x + bottom_left[0]),
                    y: pxToPt(y + bottom_left[1]),
                },
                width: pxToPt(width),
                height: pxToPt(height),
            });
        }

        // Lignes réellement affichées (retours à la ligne automatiques d'une zone de largeur fixe compris)
        const textArr: { text: string; lastInParagraph?: boolean }[] = (this.konvaElementText as any).textArr || [];
        const lines: string[] = textArr.length ? textArr.map((l) => l.text) : this.konvaElementText.text().split('\n');
        const lastInParagraph = (index: number): boolean => (textArr.length ? textArr[index].lastInParagraph !== false : true);

        const dy = this.konvaElementText.fontSize() * this.konvaElementText.lineHeight();

        const textY = offset + dy / 2 + this.konvaElementText.y();

        let computeTextX = (line: string, alignment: string) => {
            if (!this.konvaElementText) return 0;

            if (alignment === 'left' || alignment === 'justify') return this.konvaElementText.x();

            let context = this.vida.layer.getCanvas().getContext();

            let backupFont = context.font;

            context.font = this.konvaElementText._getContextFont();
            let lineMetrics = context.measureText(line);
            context.font = backupFont;

            if (alignment === 'right') {
                return this.konvaElementText.width() - lineMetrics.width + this.konvaElementText.x();
            } else if (alignment === 'center') {
                return this.konvaElementText.x() + (this.konvaElementText.width() - lineMetrics.width) / 2;
            }
        };

        const konvaAlignment = this.konvaElementText.align()!;

        let ascentRatio = 0.355;

        // Texte justifié : les mots d'une ligne (sauf la dernière du paragraphe) sont répartis sur toute la largeur de la zone
        const justifiedTspans = (line: string, index: number, dx: number): string => {
            const words = line.trim().split(/\s+/);
            const first = `dy="${index == 0 ? +ascentRatio * dy : dy}"`;
            if (konvaAlignment !== 'justify' || lastInParagraph(index) || words.length < 2) {
                return `<tspan x="${offset + dx + computeTextX(line, konvaAlignment)!}" ${first}>${encodeTextSvg(line)}</tspan>`;
            }
            const ctx = this.vida.layer.getCanvas().getContext();
            const backupFont = ctx.font;
            ctx.font = this.konvaElementText!._getContextFont();
            const widths = words.map((w) => ctx.measureText(w).width);
            ctx.font = backupFont;
            const gap = (this.konvaElementText!.width() - widths.reduce((a, b) => a + b, 0)) / (words.length - 1);
            let x = offset + dx + this.konvaElementText!.x();
            return words
                .map((w, i) => {
                    const t = `<tspan x="${x}" ${i == 0 ? first : ''}>${encodeTextSvg(w)}</tspan>`;
                    x += widths[i] + gap;
                    return t;
                })
                .join('');
        };
        // if (this.konvaElementText.fontFamily() === 'Roboto Medium')
        //     ascentRatio = 1536/2048.;
        // else
        if (this.konvaElementText.fontFamily() === 'Raleway Thin') ascentRatio = 0.355;
        else if (this.konvaElementText.fontFamily() === 'Roboto Medium') ascentRatio = 0.34;

        // const centerAndBaselineLines = `
        // <line x1="0" y1="${textY}" x2="${pxToPt(width)}" y2="${textY}" stroke="red" stroke-width="10"/>
        // <line x1="0" y1="${textY +ascentRatio*dy}" x2="${pxToPt(width)}" y2="${textY + ascentRatio*dy}" stroke="black" />
        // `;

        let shadowText = '';
        if (this.konvaElementText.hasShadow()) {
            shadowText = `
                <text
                    transform="rotate(${this.konvaElement.rotation()})"
                    font-size="${this.konvaElementText.fontSize()}"
                    ${svgFillAttrs(this.konvaElementText.shadowColor(), 0.5)}
                    style="font-family: ${this.konvaElementText.fontFamily()}"
                    alignment-baseline="alphabetic"
                    y="${textY + this.shadowY}">
                    ${lines.map((line: string, index: number) => justifiedTspans(line, index, this.shadowX)).join('')}
                </text>`;
        }

        // Soulignement et barré : traits dessinés à la même place qu'à l'écran
        let decorationSvg = '';
        const decorationLines = this.decorationLines();
        if (decorationLines.length) {
            const tx = offset + this.konvaElementText.x();
            const ty = offset + this.konvaElementText.y();
            const fill = svgFillAttrs(this.konvaElementText.fill());
            decorationSvg = `<g transform="rotate(${this.konvaElement.rotation()})">${decorationLines
                .map(
                    (l) =>
                        `<rect x="${tx + l.x1}" y="${ty + l.y - l.thickness / 2}" width="${Math.max(0, l.x2 - l.x1)}" height="${l.thickness}" ${fill}/>`,
                )
                .join('')}</g>`;
        }

        const textSvgString = `
        <svg width="${textViewbox.width}" height="${textViewbox.height}" viewBox="${textViewbox.bottom_left[0]} ${textViewbox.bottom_left[1]} ${textViewbox.width} ${textViewbox.height}">
        ${shadowText}
        <text
            transform="rotate(${this.konvaElement.rotation()})"
            font-size="${this.konvaElementText.fontSize()}"
            ${svgFillAttrs(this.konvaElementText.fill())}
            style="font-family: ${this.konvaElementText.fontFamily()}"
            alignment-baseline="alphabetic"
            y="${textY}">
            ${lines.map((line: string, index: number) => justifiedTspans(line, index, 0)).join('')}
        </text>
        ${decorationSvg}
         </svg>`;

        content.push({
            svg: textSvgString,
            absolutePosition: {
                x: pxToPt(x - textViewbox.width / 2),
                y: pxToPt(y - textViewbox.height / 2),
            },
            width: pxToPt(textViewbox.width),
            height: pxToPt(textViewbox.height),
        });

        // Lien cliquable : une image transparente portant le lien est posée sur toute la zone du texte
        const link = normalizeLink(this.options.link);
        if (link) {
            const box = computeRotatedViewbox(0, 0, this.konvaElement.width(), this.konvaElement.height(), degToRadian(this.konvaElement.rotation()));
            content.push({
                image: TRANSPARENT_PIXEL,
                link,
                absolutePosition: {
                    x: pxToPt(x - box.width / 2),
                    y: pxToPt(y - box.height / 2),
                },
                width: pxToPt(box.width),
                height: pxToPt(box.height),
            });
        }

        return { content, status };
    }

    static internalDefaultOptions(): ComponentOptions {
        return {
            textChoices: {},
            boxWidth: 0,
            boxHeight: 0,
            verticalAlign: 'top',
            underline: false,
            strikethrough: false,
        };
    }

    select() {
        if (_get(this.options.rules, 'self.fixed') === true) {
            return;
        }

        if (!this.konvaElement) return;
        if (!this.konvaTransformer) {
            this.konvaTransformer = new Konva.Transformer({
                rotateEnabled: true,
                draggable: true,
                // Coins : tout est agrandi, texte compris. Côtés : seule la zone change, la taille du texte reste.
                enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
                flipEnabled: false,
                boundBoxFunc: function (_oldBox, newBox) {
                    newBox.width = Math.max(1, newBox.width);
                    return newBox;
                },
                keepRatio: true,
            });
        }
        this.konvaTransformer.nodes([this.konvaElement]);
        this.vida.registerTransformer(this.konvaTransformer);

        this.konvaTransformer.resizeEnabled(_get(this.options.rules, 'size.fixed') !== true);
        this.konvaTransformer.rotateEnabled(_get(this.options.rules, 'angle.fixed') !== true);
        this.konvaElement.setDraggable(
            _get(this.options.rules, 'position.fixed') !== true &&
                (_get(this.options.rules, 'position.properties.x.fixed') !== true ||
                    _get(this.options.rules, 'position.properties.y.fixed') !== true),
        );

        this.vida.draw();
    }

    showTextEditor() {
        if (_get(this.options.rules, 'self.fixed') === true) return;
        if (_get(this.options.rules, 'text.fixed') === true) return;
        if (this.type !== 'text') return;
        if (!this.konvaElementText) return;
        this.konvaElementText.hide();
        if (this.konvaTransformer) this.konvaTransformer.hide();

        // at first lets find position of text node relative to the stage:
        const textPosition = this.konvaElementText.absolutePosition();

        const canvaScale = this.vida.stage.scaleX();

        // so position of textarea will be the sum of positions above:
        const areaPosition = {
            x: this.vida.stage.container().offsetLeft + textPosition.x - this.konvaElementText.offsetX() * canvaScale,
            y: this.vida.stage.container().offsetTop + textPosition.y + this.konvaElementText.offsetY() * canvaScale,
        };

        // create textarea and style it
        const textarea = document.createElement('textarea');
        document.body.appendChild(textarea);

        const textAreaFontSize = this.konvaElementText.fontSize() * canvaScale;

        // apply many styles to match text on canvas as close as possible
        // remember that text rendering on canvas and on the textarea can be different
        // and sometimes it is hard to make it 100% the same. But we will try...
        textarea.value = this.konvaElementText.text();
        textarea.style.position = 'absolute';
        textarea.style.top = areaPosition.y + 'px';
        textarea.style.left = areaPosition.x + 'px';
        textarea.style.width = (this.konvaElementText.width() - this.konvaElementText.padding() * 2 + 10) * canvaScale + 'px';
        textarea.style.height = (this.konvaElementText.height() - this.konvaElementText.padding() * 2) * canvaScale + 5 + 'px';
        textarea.style.fontSize = textAreaFontSize + 'px';
        textarea.style.border = '1px solid red';
        textarea.style.padding = '0px';
        textarea.style.margin = '0px';
        textarea.style.overflow = 'hidden';
        textarea.style.background = 'none';
        textarea.style.resize = 'none';
        textarea.style.outline = 'none';
        textarea.style.lineHeight = this.konvaElementText.lineHeight().toString();
        textarea.style.fontFamily = this.konvaElementText.fontFamily();
        textarea.style.transformOrigin = 'center';
        textarea.style.textAlign = this.konvaElementText.align();
        textarea.style.color = this.konvaElementText.fill();
        const rotation = this.konvaElementText.rotation();
        let transform = '';
        if (rotation) transform += 'rotateZ(' + rotation + 'deg)';

        let px = 0;
        // also we need to slightly move textarea on firefox
        // because it jumps a bit
        var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
        if (isFirefox) px += 2 + Math.round((this.konvaElementText.fontSize() * canvaScale) / 20);
        transform += 'translateY(-' + px + 'px)';

        textarea.style.transform = transform;

        // reset height
        textarea.style.height = 'auto';
        // after browsers resized it we can set actual value
        textarea.style.height = textarea.scrollHeight + 3 + 'px';

        textarea.focus();

        const removeTextarea = () => {
            textarea.parentNode!.removeChild(textarea);
            window.removeEventListener('click', handleOutsideClick);
            this.konvaElementText!.show();
            if (this.konvaTransformer) {
                this.konvaTransformer.show();
                this.konvaTransformer.forceUpdate();
            }
        };

        const setTextareaWidth = (newWidth: number) => {
            // TODO ?
            // if (!newWidth) {
            //     // set width for placeholder
            //     newWidth = this.konvaElementText!.() * this.konvaElementText!.fontSize();
            // }
            // some extra fixes on different browsers
            var isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            if (isSafari || isFirefox) {
                newWidth = Math.ceil(newWidth);
            }

            var isEdge = document.DOCUMENT_NODE || /Edge/.test(navigator.userAgent);
            if (isEdge) {
                newWidth += 1;
            }
            textarea.style.width = newWidth + 'px';
        };

        textarea.addEventListener('keydown', (e) => {
            // hide on enter
            // but don't hide on shift + enter
            if (e.key === 'Enter' && !e.shiftKey) {
                const options = this.editingLocale !== null ? { i18n: { [this.editingLocale]: { text: textarea.value } } } : { text: textarea.value };
                this.update(options, {}).then(() => this.vida.onComponentUpdated(this.id()));
                removeTextarea();
            }
            // on esc do not set value back to node
            if (e.key === 'Esc') {
                removeTextarea();
            }
        });

        textarea.addEventListener('keydown', () => {
            const scale = this.konvaElementText!.getAbsoluteScale().x;
            setTextareaWidth(this.konvaElementText!.width() * scale);
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + this.konvaElementText!.fontSize() + 'px';
        });

        const handleOutsideClick = (e: any) => {
            if (e.target !== textarea) {
                const options = this.editingLocale !== null ? { i18n: { [this.editingLocale]: { text: textarea.value } } } : { text: textarea.value };
                this.update(options, {}).then(() => this.vida.onComponentUpdated(this.id()));
                removeTextarea();
            }
        };
        setTimeout(() => {
            window.addEventListener('click', handleOutsideClick);
        }),
            0;
    }

    unselect() {
        if (this.konvaTransformer) this.konvaTransformer.detach();
    }

    destroy() {
        if (!this.konvaElement) return;
        if (this.konvaElementText) this.konvaElementText.destroy();
        if (this.konvaElementBackground) this.konvaElementBackground.destroy();
        if (this.konvaElementFrame) this.konvaElementFrame.destroy();
        if (this.konvaElementDeco) this.konvaElementDeco.destroy();
        this.konvaElement.destroy();
    }

    textValue(): string {
        switch (this.type) {
            case 'textchoice': {
                if (this.text === undefined) return '';
                // @ts-ignore
                const textOption = this.textChoices[this.text];
                const i18n = this.vida.document.i18n!;
                const locale = i18n.editingLocale ? i18n.editingLocale : i18n.displayedLocale;
                return extractBestTranslation(textOption, locale, this.vida.document.i18n.defaultLocale!) || '';
            }
            case 'text': {
                if (this.text === undefined) return this.konvaElementText!.text()!;
                return this.text;
            }
        }
        return '';
    }

    toJson(): ComponentOptions {
        const result = { ...this.options };
        if (this.type === 'text')
            delete result['textChoices'];
        return result;
    }

    internalUpdate(options: ComponentOptions, document: Partial<DocumentParams>): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this._inPromise) {
                resolve();
                return;
            }
            this._inPromise = true;

            let recomputeTextBackground = false;
            let raiseComponentUpdated = false;

            if (options.textChoices !== undefined && this.textChoices !== options.textChoices) {
                assignValues(this.textChoices, options.textChoices, undefined);
                cleanUndefined(this.textChoices);
            }

            if (options.type !== undefined && this.type !== options.type) {
                if (options.text === undefined) {
                    if (options.type === 'text') {
                        options.text = this.textValue();
                    } else if (options.type === 'textchoice') {
                        // TODO: it is possible to return the "good choice"
                        options.text = Object.keys(this.textChoices)[0] || '';
                    }

                    if (this.editingLocale) {
                        // @ts-ignore
                        _set(this.options.i18n![this.editingLocale], 'text', options.text);
                    } else {
                        _set(this.options, 'text', options.text);
                    }

                    raiseComponentUpdated = true;
                }
                // @ts-ignore
                this.type = options.type;
            }

            if (
                options.background !== undefined &&
                options.background.distortion !== undefined &&
                (!this.backgroundDistortion || this.backgroundDistortion !== options.background.distortion)
            ) {
                this.backgroundDistortion = options.background.distortion;
                this.backgroundDistortionAngle = options.background.angleDistortion;
                recomputeTextBackground = true;
            }

            if (options.text !== undefined && this.text !== options.text) {
                this.text = options.text;
            }

            if ((options.text !== undefined || options.textChoices !== undefined) && this.type === 'textchoice') {
                if (this.textValue() === '') {
                    this.text = Object.keys(this.textChoices)[0];

                    if (this.editingLocale) {
                        // @ts-ignore
                        _set(this.options.i18n![this.editingLocale], 'text', this.text);
                    } else {
                        _set(this.options, 'text', this.text);
                    }

                    raiseComponentUpdated = true;
                }
            }

            if (!this.konvaElement) {
                this.konvaElement = new Konva.Group();

                switch (this.type) {
                    case 'textchoice':
                    case 'text': {
                        this.konvaElementText = new Konva.Text({
                            draggable: false,
                            text: this.textValue(),
                            fill: options.color,
                            align: options.justification,
                            width: (options.boxWidth && options.boxWidth > 0 ? options.boxWidth : 'auto') as any,
                            wrap: 'word',
                            fontSize: options.size,
                            fontFamily: options.font,
                            padding: 0,
                            hasShadow: options.shadow?.enabled,
                            shadowColor: options.shadow?.color,
                            shadowOffsetX: options.shadow?.offsetX,
                            shadowOffsetY: options.shadow?.offsetY,
                            shadowOpacity: 0.5,
                        });
                        break;
                    }
                    case 'emoji': {
                        this.konvaElementText = new Konva.Text({
                            draggable: false,
                            text: options.text,
                            fontSize: 1,
                            padding: 0,
                            verticalAlign: 'top',
                        });

                        this.konvaElement.setAttrs({
                            scaleX: options.scale,
                            scaleY: options.scale,
                        });
                    }
                }

                this.konvaElement.on('pointerclick', (evt: any) => {
                    evt.cancelBubble = true;
                    if (this.vida.isSelected(this.id())) return;
                    this.vida.selectComponent(this.id());
                });

                if (this.supportBackground()) {
                    this.konvaElementText.on('dblclick dbltap', () => {
                        this.showTextEditor();
                    });
                }

                this.konvaElement.on('dragend', () => {
                    this.adjustPosition();
                });
                this.konvaElement.on('transformend', () => {
                    this.adjustSizeAndAngle();
                });

                this.konvaElementBackground = new Konva.Shape();
                this.konvaElementFrame = new Konva.Rect({ listening: false, x: 0, y: 0, width: 0, height: 0 });
                this.konvaElementDeco = new Konva.Shape({
                    listening: false,
                    sceneFunc: (context: any, shape: any) => this._drawDecoration(context, shape),
                });
                this.konvaElement.on('transform', () => this._onTransform());

                // console.assert(options.background !== undefined); // since 0.9.1
                if (options.background !== undefined) {
                    if (options.background.color !== undefined) this.konvaElementBackground.fill(options.background.color);

                    if (options.background.padding !== undefined) {
                        this.backgroundPadding = options.background.padding;
                    }
                }

                this.konvaElement.add(this.konvaElementFrame);
                this.konvaElement.add(this.konvaElementBackground);
                this.konvaElement.add(this.konvaElementText);
                this.konvaElement.add(this.konvaElementDeco);

                this._recomputePosition = true;

                this.vida.registerComponent(this.konvaElement);
            }

            if (!this.konvaElementText) throw new InvalidDataError('KonvaElementText does not exist');
            if (!this.konvaElementBackground) throw new InvalidDataError('KonvaElementBackground does not exist');

            // TODO refacto (getLocalizedValue)
            // TODO check if locale or text changed
            // TODO improve me
            if ((document !== null && document.i18n !== undefined && document.i18n.editingLocale !== undefined) || options.rules !== undefined) {
                if (_get(options.rules, 'self.fixed') === false) {
                    this.select();
                }
                if (this.konvaTransformer) {
                    this.konvaTransformer.resizeEnabled(_get(this.options.rules, 'size.fixed') !== true);
                    this.konvaTransformer.rotateEnabled(_get(this.options.rules, 'angle.fixed') !== true);
                    this.konvaElement.setDraggable(
                        _get(this.options.rules, 'position.fixed') !== true &&
                            (_get(this.options.rules, 'position.properties.x.fixed') !== true ||
                                _get(this.options.rules, 'position.properties.y.fixed') !== true),
                    );
                }
            }

            if (this.konvaElementText.text() !== this.textValue()) {
                this.konvaElementText.setText(this.textValue());
                // TODO: maybe not useful to recomputeposition here.
                // It depends on the orientation.
                this._recomputePosition = true;
                if (this.supportBackground()) recomputeTextBackground = true;
            }

            if (options.font !== undefined && this.konvaElementText.fontFamily() !== options.font) {
                this.konvaElementText.fontFamily(options.font);
                this._recomputePosition = true;
                if (this.supportBackground()) recomputeTextBackground = true;
            }

            if (options.size !== undefined && this.konvaElementText.fontSize() * this.konvaElement.scaleX() !== options.size) {
                this.konvaElementText.fontSize(options.size);
                this.konvaElement.scaleX(1);
                this.konvaElement.scaleY(1);
                this._recomputePosition = true;
                if (this.supportBackground()) recomputeTextBackground = true;
            }

            // For emojis
            if (options.scale !== undefined && this.konvaElement.scaleX() !== options.scale) {
                this.konvaElement.scaleX(options.scale);
                this.konvaElement.scaleY(options.scale);
                this._recomputePosition = true;
                if (this.supportBackground()) recomputeTextBackground = true;
            }

            if (options.color !== undefined && this.konvaElementText.fill() !== options.color) {
                this.konvaElementText.fill(options.color);
                this.draw = true;
            }

            if (options.justification !== undefined && this.konvaElementText.align() !== options.justification) {
                this.konvaElementText.align(options.justification);
                this.draw = true;
            }

            // Zone de texte de largeur fixe (retour à la ligne automatique) ou largeur automatique
            if (this.type !== 'emoji' && options.boxWidth !== undefined) {
                const wantedWidth = options.boxWidth && options.boxWidth > 0 ? options.boxWidth : 'auto';
                if ((this.konvaElementText.getAttr('width') ?? 'auto') !== wantedWidth) {
                    this.konvaElementText.width(wantedWidth as any);
                    this._recomputePosition = true;
                    if (this.supportBackground()) recomputeTextBackground = true;
                    this.draw = true;
                }
            }

            // Hauteur de la zone, alignement vertical, souligné et barré
            if (this.type !== 'emoji') {
                if (options.boxHeight !== undefined && (options.boxHeight || 0) !== this.boxH) {
                    this.boxH = options.boxHeight || 0;
                    this._recomputePosition = true;
                    if (this.supportBackground()) recomputeTextBackground = true;
                    this.draw = true;
                }
                if (options.verticalAlign !== undefined && options.verticalAlign !== this.vAlign) {
                    this.vAlign = options.verticalAlign;
                    this._recomputePosition = true;
                    this.draw = true;
                }
                if (options.underline !== undefined && !!options.underline !== this.underline) {
                    this.underline = !!options.underline;
                    this.draw = true;
                }
                if (options.strikethrough !== undefined && !!options.strikethrough !== this.strikethrough) {
                    this.strikethrough = !!options.strikethrough;
                    this.draw = true;
                }
            }

            let recomputeShadow = false;

            if (options.shadow !== undefined) {
                if (options.shadow.enabled !== undefined && this.konvaElementText.hasShadow() !== options.shadow.enabled) {
                    this.konvaElementText.shadowEnabled(options.shadow.enabled);
                    if (options.shadow.enabled) {
                        this.konvaElementText.shadowColor(options.shadow.color || '#000000');
                        this.konvaElementText.shadowOpacity(0.5);
                        recomputeShadow = true;
                    }
                    this.draw = true;
                }

                if (options.shadow.color !== undefined && this.konvaElementText.shadowColor() !== options.shadow.color) {
                    this.konvaElementText.shadowColor(options.shadow.color);
                    this.draw = true;
                }

                if (options.shadow.offsetX !== undefined && this.shadowX !== options.shadow.offsetX) {
                    this.shadowX = options.shadow.offsetX;
                    recomputeShadow = true;
                }

                if (options.shadow.offsetY !== undefined && this.shadowY !== options.shadow.offsetY) {
                    this.shadowY = options.shadow.offsetY;
                    recomputeShadow = true;
                }
            }

            if (options.background !== undefined) {
                if (options.background.color !== undefined && this.konvaElementBackground.fill() !== options.background.color) {
                    this.konvaElementBackground!.fill(options.background.color);
                    this.draw = true;
                }

                if (
                    options.background.distortion !== undefined &&
                    (!this.backgroundDistortion || this.backgroundDistortion !== options.background.distortion)
                ) {
                    this.backgroundDistortion = options.background.distortion;
                    this.backgroundDistortionAngle = options.background.angleDistortion;
                    recomputeTextBackground = true;
                }

                if (options.background.mode !== undefined && this.backgroundMode !== options.background.mode) {
                    this.backgroundMode = options.background.mode;
                    if (this.backgroundMode === 'disabled') {
                        this.konvaElementBackground.hide();
                    } else {
                        this.konvaElementBackground.show();
                    }
                    recomputeTextBackground = true;
                    this.draw = true;
                }

                if (options.background.radius !== undefined) {
                    recomputeTextBackground = true;
                    this.draw = true;
                }
            }

            if (options.angle !== undefined && options.angle !== this.currentAngle()) {
                this.konvaElement.rotation(options.angle);

                if (this.konvaElementText.hasShadow()) {
                    recomputeShadow = true;
                }

                this._recomputePosition = true;
            }

            if (recomputeShadow) {
                if (this.currentAngle() !== 0) {
                    const offset = [[this.konvaElementText.shadowOffsetX(), this.konvaElementText.shadowOffsetY()]];
                    rotatePolygon(offset, degToRadian(this.currentAngle()!));
                    this.konvaElementText.shadowOffset({ x: offset[0][0], y: offset[0][1] });
                } else {
                    this.konvaElementText.shadowOffsetX(this.shadowX);
                    this.konvaElementText.shadowOffsetY(this.shadowY);
                }
                this.draw = true;
            }

            if (
                options.background !== undefined &&
                options.background.padding !== undefined &&
                options.background.padding !== this.backgroundPadding
            ) {
                this.backgroundPadding = options.background.padding;

                if (this.backgroundMode !== 'disabled') {
                    const padding = options.background.padding;
                    this.konvaElement.setAttrs({
                        offsetX: this.konvaElementText.width() / 2 + padding,
                        offsetY: this.frameHeight() / 2 + padding,
                        width: this.konvaElementText.width() + 2 * padding,
                        height: this.frameHeight() + 2 * padding,
                    });
                    this.konvaElementText.setAttrs({
                        x: padding,
                        y: padding,
                    });
                    recomputeTextBackground = true;
                }
            }

            const documentDimensionChanged =
                !this.documentSize || (document && (this.documentSize.width !== document.width || this.documentSize.height !== document.height));
            const positionChanged =
                options.position !== undefined &&
                ((options.position.x !== undefined && this.displayedPosition.x !== options.position.x) ||
                    (options.position.y !== undefined && this.displayedPosition.y !== options.position.y));

            if (this._recomputePosition || positionChanged || documentDimensionChanged) {
                this._recomputePosition = false;
                if (!this.documentSize) this.documentSize = { width: 0, height: 0 };
                if (document && document.width) this.documentSize.width = document.width;
                if (document && document.height) this.documentSize.height = document.height;

                if (options.position) overrideValues(this.displayedPosition, options.position);

                const { x, y } = computeAbsolutePosition(this.displayedPosition, this.documentSize);

                const padding = this.backgroundMode !== 'disabled' ? Math.ceil((this.konvaElementText.fontSize() * this.backgroundPadding) / 100) : 0;

                const frameHeight = this.frameHeight();
                this.konvaElement.setAttrs({
                    x: x,
                    y: y,
                    offsetX: this.konvaElementText.width() / 2 + padding,
                    offsetY: frameHeight / 2 + padding,
                    width: this.konvaElementText.width() + 2 * padding,
                    height: frameHeight + 2 * padding,
                });

                this.konvaElementText.setAttrs({
                    x: padding,
                    y: padding + this.textTopOffset(),
                });
                this._syncFrame(padding);
                this._recomputePosition = true;
                this.draw = true;
            }

            if (recomputeTextBackground) {
                const padding = Math.ceil((this.konvaElementText.fontSize() * this.backgroundPadding) / 100);
                const height = this.frameHeight() + 2 * padding;
                const width = this.konvaElementText.width() + 2 * padding;
                const radius = this.options.background && this.options.background!.radius ? this.options.background!.radius : 0;
                const pi = Math.PI;

                if (this.backgroundMode === 'distorted' || this.backgroundMode === 'normal') {
                    let distortion = [...DEFAULT_DISTORTION];
                    if (this.backgroundMode === 'distorted') {
                        distortion = [...this.backgroundDistortion!];
                    }
                    translatePolygon(distortion, [1, 1]);
                    scalePolygon(distortion, width / 2, height / 2);

                    this.konvaElementBackground.setAttrs({
                        width: this.konvaElementText.width() + 2 * padding,
                        height: this.frameHeight() + 2 * padding,
                        sceneFunc(context: any, shape: any) {
                            context.beginPath();
                            context.moveTo(distortion[0][0], distortion[0][1]); // top-left
                            context.lineTo(distortion[1][0], distortion[1][1]); // top-right
                            context.lineTo(distortion[2][0], distortion[2][1]); // bottom-right
                            context.lineTo(distortion[3][0], distortion[3][1]); // bottom-left
                            context.lineTo(distortion[0][0], distortion[0][1]); // top-left
                            context.closePath();
                            // Konva specific method
                            context.fillStrokeShape(shape);
                        },
                    });
                } else if (this.backgroundMode === 'rounded') {
                    this.konvaElementBackground.setAttrs({
                        width: this.konvaElementText.width() + 2 * padding,
                        height: this.frameHeight() + 2 * padding,
                        sceneFunc(context: any, shape: any) {
                            context.beginPath();
                            // moving clockwise
                            context.moveTo(radius, 0); // top-left after arc
                            context.lineTo(width - radius, 0); // top-right before arc
                            context.arc(width - radius, radius, radius, (3 * pi) / 2, 0); // top right arc
                            context.lineTo(width, height - radius); // bottom right before are
                            context.arc(width - radius, height - radius, radius, 0, pi / 2); // bottom right arc
                            context.lineTo(radius, height); // bottom left before arc
                            context.arc(radius, height - radius, radius, pi / 2, pi); // bottom left arc
                            context.lineTo(0, radius); // top left before are
                            context.arc(radius, radius, radius, pi, (3 * pi) / 2); // top left arc
                            context.lineTo(radius, 0); // top-left after arc
                            context.closePath();
                            context.fillStrokeShape(shape);
                        },
                    });
                }

                this._recomputePosition = true;

                this.draw = true;
            }

            if (this.konvaTransformer !== undefined) {
                this.konvaTransformer.forceUpdate();
            }

            if (this.zIndex() !== this.konvaElement.zIndex()) {
                this.konvaElement.zIndex(this.zIndex());
                this.draw = true;
            }

            if (this.draw) {
                this.draw = false;
                this.vida.draw();
            }
            this._inPromise = false;
            if (raiseComponentUpdated) this.vida.onComponentUpdated(this.id());
            resolve();
        });
    }

    /** Marge autour du texte quand un fond est affiché (px). */
    _padding(): number {
        return this.backgroundMode !== 'disabled' && this.konvaElementText
            ? Math.ceil((this.konvaElementText.fontSize() * this.backgroundPadding) / 100)
            : 0;
    }

    /** Hauteur de la zone : celle du texte, ou la hauteur choisie si elle est plus grande. */
    frameHeight(): number {
        if (!this.konvaElementText) return 0;
        return Math.max(this.konvaElementText.height(), this.boxH || 0);
    }

    /** Décalage du texte dans une zone plus haute que lui (alignement vertical). */
    textTopOffset(): number {
        if (!this.konvaElementText) return 0;
        const free = this.frameHeight() - this.konvaElementText.height();
        if (free <= 0) return 0;
        if (this.vAlign === 'middle') return free / 2;
        if (this.vAlign === 'bottom') return free;
        return 0;
    }

    _syncFrame(padding: number) {
        if (!this.konvaElementText) return;
        if (this.konvaElementFrame) {
            this.konvaElementFrame.setAttrs({
                x: 0,
                y: 0,
                width: this.konvaElementText.width() + 2 * padding,
                height: this.frameHeight() + 2 * padding,
            });
        }
        if (this.konvaElementDeco) {
            this.konvaElementDeco.setAttrs({ x: this.konvaElementText.x(), y: this.konvaElementText.y() });
        }
    }

    /**
     * Traits de soulignement et de barré, en coordonnées du texte (origine = coin haut gauche du texte).
     * Une seule source pour l'écran, les images et le PDF.
     */
    decorationLines(): { x1: number; x2: number; y: number; thickness: number }[] {
        const lines: { x1: number; x2: number; y: number; thickness: number }[] = [];
        const t = this.konvaElementText;
        if (!t || (!this.underline && !this.strikethrough) || !t.text()) return lines;
        const textArr: { text: string; width: number; lastInParagraph?: boolean }[] = (t as any).textArr || [];
        const fontSize = t.fontSize();
        const lineHeightPx = t.lineHeight() * fontSize;
        const totalWidth = t.width();
        const align = t.align();
        const thickness = Math.max(1, fontSize / 15);
        textArr.forEach((line, i) => {
            if (!line.text || !line.text.trim()) return;
            const justified = align === 'justify' && line.lastInParagraph === false && line.text.trim().includes(' ');
            const w = justified ? totalWidth : line.width;
            let x1 = 0;
            if (align === 'right') x1 = totalWidth - w;
            else if (align === 'center') x1 = (totalWidth - w) / 2;
            const yc = lineHeightPx * (i + 0.5);
            if (this.underline) lines.push({ x1, x2: x1 + w, y: yc + 0.36 * fontSize, thickness });
            if (this.strikethrough) lines.push({ x1, x2: x1 + w, y: yc + 0.05 * fontSize, thickness });
        });
        return lines;
    }

    _drawDecoration(context: any, shape: any) {
        const lines = this.decorationLines();
        if (!lines.length || !this.konvaElementText) return;
        shape.fill(this.konvaElementText.fill());
        context.beginPath();
        for (const l of lines) context.rect(l.x1, l.y - l.thickness / 2, Math.max(0, l.x2 - l.x1), l.thickness);
        context.closePath();
        context.fillShape(shape);
    }

    boxWidthNow(): number {
        const w = this.konvaElementText ? this.konvaElementText.getAttr('width') : undefined;
        return typeof w === 'number' ? w : 0;
    }

    /**
     * Pendant le redimensionnement : les poignées des côtés changent la zone (largeur ou hauteur)
     * SANS changer la taille du texte ; les poignées des coins agrandissent tout (texte compris).
     */
    _onTransform() {
        const tr = this.konvaTransformer;
        const group = this.konvaElement;
        const text = this.konvaElementText;
        if (!tr || !group || !text || this.type === 'emoji') return;
        const anchor = tr.getActiveAnchor();
        const sideX = anchor === 'middle-left' || anchor === 'middle-right';
        const sideY = anchor === 'top-center' || anchor === 'bottom-center';
        if (!sideX && !sideY) return;
        const padding = this._padding();
        if (sideX) {
            const w = Math.max(20, Math.round(group.width() * Math.abs(group.scaleX()) - 2 * padding));
            text.width(w);
        }
        if (sideY) {
            this.boxH = Math.max(10, Math.round(group.height() * Math.abs(group.scaleY()) - 2 * padding));
        }
        group.scaleX(1);
        group.scaleY(1);
        // Les dimensions du groupe, du fond et du cadre sont recalculées à partir des nouvelles dimensions du texte
        this._relayout();
        tr.forceUpdate();
        this.vida.draw();
    }

    /** Recalcule groupe, texte, fond et cadre à partir de la taille actuelle du texte (le centre ne bouge pas). */
    _relayout() {
        const group = this.konvaElement;
        const text = this.konvaElementText;
        const bg = this.konvaElementBackground;
        if (!group || !text || !bg) return;
        const padding = this._padding();
        const frameHeight = this.frameHeight();
        group.setAttrs({
            offsetX: text.width() / 2 + padding,
            offsetY: frameHeight / 2 + padding,
            width: text.width() + 2 * padding,
            height: frameHeight + 2 * padding,
        });
        text.setAttrs({ x: padding, y: padding + this.textTopOffset() });
        this._syncFrame(padding);
        if (this.backgroundMode !== 'disabled') {
            const width = text.width() + 2 * padding;
            const height = frameHeight + 2 * padding;
            bg.setAttrs({ width, height });
            this._rebuildBackgroundShape(width, height);
        }
    }

    _rebuildBackgroundShape(width: number, height: number) {
        const bg = this.konvaElementBackground;
        if (!bg) return;
        const pi = Math.PI;
        if (this.backgroundMode === 'distorted' || this.backgroundMode === 'normal') {
            let distortion = [...DEFAULT_DISTORTION];
            if (this.backgroundMode === 'distorted' && this.backgroundDistortion) distortion = [...this.backgroundDistortion];
            translatePolygon(distortion, [1, 1]);
            scalePolygon(distortion, width / 2, height / 2);
            bg.setAttrs({
                sceneFunc(context: any, shape: any) {
                    context.beginPath();
                    context.moveTo(distortion[0][0], distortion[0][1]);
                    context.lineTo(distortion[1][0], distortion[1][1]);
                    context.lineTo(distortion[2][0], distortion[2][1]);
                    context.lineTo(distortion[3][0], distortion[3][1]);
                    context.lineTo(distortion[0][0], distortion[0][1]);
                    context.closePath();
                    context.fillStrokeShape(shape);
                },
            });
        } else if (this.backgroundMode === 'rounded') {
            const radius = this.options.background && this.options.background!.radius ? this.options.background!.radius : 0;
            bg.setAttrs({
                sceneFunc(context: any, shape: any) {
                    context.beginPath();
                    context.moveTo(radius, 0);
                    context.lineTo(width - radius, 0);
                    context.arc(width - radius, radius, radius, (3 * pi) / 2, 0);
                    context.lineTo(width, height - radius);
                    context.arc(width - radius, height - radius, radius, 0, pi / 2);
                    context.lineTo(radius, height);
                    context.arc(radius, height - radius, radius, pi / 2, pi);
                    context.lineTo(0, radius);
                    context.arc(radius, radius, radius, pi, (3 * pi) / 2);
                    context.lineTo(radius, 0);
                    context.closePath();
                    context.fillStrokeShape(shape);
                },
            });
        }
    }

    adjustPosition() {
        if (!this.konvaElementText || !this.konvaElementBackground) return;
        this._backupCurrentState({});
        this._adjustPosition();
        if (this._cleanUndoHistory()) return;
        this.vida.onComponentUpdated(this.id());
    }

    adjustSizeAndAngle() {
        this._backupCurrentState({});
        this._adjustAngle();
        this._adjustPosition();

        const text = this.konvaElementText!;
        const group = this.konvaElement!;
        // Taille de police après le redimensionnement (les coins ont modifié l'échelle du groupe)
        const scale = Math.abs(group.scaleX()) || 1;
        let currentFontSize = text.fontSize() * scale;

        const rule = _get(this.options.rules, 'size', <Rule>{});
        if (rule.fixed !== undefined && rule.fixed) {
            currentFontSize = this.optionsFontSize();
        } else {
            if (rule.min !== undefined && currentFontSize < rule.min) currentFontSize = rule.min;
            if (rule.max !== undefined && currentFontSize > rule.max) currentFontSize = rule.max;
        }

        // La zone de texte suit la taille du texte quand on l'agrandit par un coin
        const ratio = currentFontSize / text.fontSize();
        let newBoxWidth = this.boxWidthNow();
        let newBoxHeight = this.boxH || 0;
        if (Math.abs(ratio - 1) > 0.0001) {
            if (newBoxWidth > 0) newBoxWidth = Math.round(newBoxWidth * ratio);
            if (newBoxHeight > 0) newBoxHeight = Math.round(newBoxHeight * ratio);
        }

        const topLevel: any = {};
        if (Math.round(newBoxWidth) !== Math.round(this.options.boxWidth || 0)) topLevel.boxWidth = Math.round(newBoxWidth);
        if (Math.round(newBoxHeight) !== Math.round(this.options.boxHeight || 0)) topLevel.boxHeight = Math.round(newBoxHeight);
        if (Math.abs(currentFontSize - this.optionsFontSize()) > 0.1) {
            if (this.editingLocale !== null) {
                this._appendToCurrentBackup({ i18n: { [this.editingLocale]: { size: currentFontSize } } });
                assignValues(this.options.i18n, { [this.editingLocale]: { size: currentFontSize } }, undefined);
            } else {
                topLevel.size = currentFontSize;
            }
        }
        if (Object.keys(topLevel).length) {
            this._appendToCurrentBackup(topLevel);
            assignValues(this.options, topLevel, undefined);
        }

        // On « fige » le redimensionnement : la taille de police, la zone et le groupe sont recalculés (échelle = 1)
        if (Math.abs(group.scaleX() - 1) > 0.0001 || Math.abs(group.scaleY() - 1) > 0.0001 || Math.abs(ratio - 1) > 0.0001) {
            text.fontSize(currentFontSize);
            group.scaleX(1);
            group.scaleY(1);
            this._recomputePosition = true;
        }
        const apply: any = { size: currentFontSize, boxWidth: Math.round(newBoxWidth), boxHeight: Math.round(newBoxHeight) };
        this._inPromise = false;
        this.internalUpdate(apply, {});

        if (this._cleanUndoHistory()) return;
        this.vida.onComponentUpdated(this.id());
    }

    optionsFontSize(): number {
        return this.optionsValue('size');
    }

    supportBackground(): boolean {
        return this.type === 'text' || this.type === 'textchoice';
    }
};
