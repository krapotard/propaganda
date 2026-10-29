'use strict';

import { ImageOptions } from '../typing';

import { Canvg } from 'canvg';

import { makeHitformFunction } from '../utils/svgutils.ts';
import { BuiltShape, DEFAULT_SHAPE_OPTIONS, SHAPE_KEYS, ShapeOptions, buildShape, normalizeShapeOptions } from '../utils/shapes.ts';

import ImageVidaSubComponent from './imagevidasubcomponent';
import Vida from '../vida.ts';

/**
 * Geometric shape (rectangle, ellipse, polygon, star) used as an "image".
 * The svg is generated from a few options (see utils/shapes.ts), so position, size,
 * angle, z-index, undo/redo, png/pdf export and template saving all work like for any image.
 */
export default class GeometryVidaSubComponent extends ImageVidaSubComponent {
    options: ShapeOptions;
    built: BuiltShape;
    canvas: HTMLCanvasElement | undefined;
    canvgElement: Canvg | undefined;
    hitform: string | undefined;
    type: 'geometry';

    constructor(vida: Vida) {
        super(vida);
        this.type = 'geometry';
        this.options = { ...DEFAULT_SHAPE_OPTIONS };
        this.built = buildShape(this.options);
        this.applyBuilt();
    }

    private applyBuilt() {
        this.originalSize = { width: this.built.width, height: this.built.height };
        this.hitform = this.built.hitform;
    }

    randomOptions(): Partial<ImageOptions> {
        return { type: this.type, ...DEFAULT_SHAPE_OPTIONS };
    }

    toJson() {
        return { type: this.type, ...this.options };
    }

    async imageToSvg(): Promise<string> {
        return this.built.svg;
    }

    update(options: Partial<ImageOptions> | undefined): Promise<void> {
        return new Promise<void>((resolve) => {
            if (options) {
                const partial: Partial<ShapeOptions> = {};
                for (const key of SHAPE_KEYS) {
                    if ((options as any)[key] !== undefined) (partial as any)[key] = (options as any)[key];
                }
                const merged = normalizeShapeOptions({ ...this.options, ...partial });
                const changed = SHAPE_KEYS.some((key) => merged[key] !== this.options[key]);
                if (changed || !this.canvas) {
                    this.options = merged;
                    this.built = buildShape(merged);
                    this.applyBuilt();
                    this.recomputeImage = true;
                    this.recomputePosition = true;
                }
            }
            resolve();
        });
    }

    makeImage(imageWidth: number, imageHeight: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.inResize) reject();

            this.inResize = true;
            if (!this.canvas) this.canvas = window.document.createElement('canvas');
            const ctx = this.canvas.getContext('2d');

            try {
                this.canvgElement = Canvg.fromString(ctx!, this.built.svg);
            } catch (err) {
                this.inResize = false;
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
                .catch((err) => {
                    this.inResize = false;
                    reject(err);
                });
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
