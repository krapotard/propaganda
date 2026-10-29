'use strict';
import { GalleryInternalPhoto, ImageOptions, MimeType } from '../typing.ts';

import ImageVidaSubComponent from './imagevidasubcomponent.ts';

// @ts-ignore
if (import.meta.env.MODE === 'headless') {
    var Image = (await import('canvas')).Image;
    var createCanvas = (await import('canvas')).createCanvas;
    var resolveObjectURL = (await import('node:buffer')).resolveObjectURL;
}
import Vida from '../vida.ts';
import InvalidDataError from '../invaliddataerror.ts';
import { extractMimeTypeFromFilename } from '../utils/utils.ts';

export default class PhotoSubComponent extends ImageVidaSubComponent {

    photoUrl: string | undefined;
    _photo: any | undefined;
    mimeType: MimeType;
    type: 'internalphoto' | 'urlphoto';
    // Recadrage non destructif : fractions de l'image d'origine
    crop: { x: number; y: number; width: number; height: number } | undefined;
    _croppedCanvas: HTMLCanvasElement | undefined;

    constructor(vida: Vida, type: 'internalphoto' | 'urlphoto') {
        super(vida);
        this.type = type;
        this.originalSize = { width: 0, height: 0 };
        this.id = ''
        this.mimeType = 'image/jpeg';
        this.crop = undefined;
        this._croppedCanvas = undefined;
    }

    /**
     * Applique (ou retire) le recadrage : produit un canvas de la zone conservée
     * et fait de ses dimensions la taille de l'image pour le reste du composant.
     */
    applyCrop() {
        if (!this._photo) return;
        const fullWidth = this._photo.width;
        const fullHeight = this._photo.height;
        const c = this.crop;
        // @ts-ignore
        const headless = import.meta.env.MODE === 'headless';
        if (!c || headless || c.width <= 0 || c.height <= 0) {
            this._croppedCanvas = undefined;
            this.originalSize = { width: fullWidth, height: fullHeight };
            return;
        }
        const sx = Math.round(Math.min(Math.max(c.x, 0), 1) * fullWidth);
        const sy = Math.round(Math.min(Math.max(c.y, 0), 1) * fullHeight);
        const sw = Math.max(1, Math.min(Math.round(c.width * fullWidth), fullWidth - sx));
        const sh = Math.max(1, Math.min(Math.round(c.height * fullHeight), fullHeight - sy));
        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext('2d')!.drawImage(this._photo, sx, sy, sw, sh, 0, 0, sw, sh);
        this._croppedCanvas = canvas;
        this.originalSize = { width: sw, height: sh };
    }

    randomOptions(): Partial<ImageOptions> {
        if (this.vida.gallery === undefined) {
            throw new InvalidDataError('Please provide a gallery if you use internalsvg!')
        }

        const element = this.vida.gallery.randomInternalPhoto();
        return {
            type: this.type,
            id: element.id,
        };
    }

    toJson() {
        if (this.type === 'internalphoto') {
            return {
                type: this.type,
                id: this.id,
                width: this.originalSize.width,
                height: this.originalSize.height,
                crop: this.crop,
            };
        } else if (this.type === 'urlphoto') {
            return {
                type: this.type,
                url: this.photoUrl,
                width: this.originalSize.width,
                height: this.originalSize.height,
                crop: this.crop,
            };
        } else {
            throw Error(`toJson not implemented for type ${this.type}`);
        }
    }

    /**
     * Loads a base64 photoUrl locally in a HTMLImageElement.
     * Image can be accessed throug image() method
     *
     * @param photoUrl
     * @returns Promise<void>. Resolved once the image is loaded
     */
    loadPhoto(photoUrl: string): Promise<void>{
        return new Promise((resolve, reject) => {
            this.photoUrl = photoUrl;
            this.recomputeImage = true;
            if (this._photo !== undefined) delete this._photo;

            // @ts-ignore
            if (import.meta.env.MODE === 'headless')
                this._photo = new Image();
            else
                // Equivalent to this._photo = new Image() in plain JS
                this._photo = document.createElement('img')

            this._photo.onload = () => {
                this.originalSize = { width: this._photo!.width, height: this._photo!.height };
                this.applyCrop();
                resolve();
            };

            this._photo.onerror = (err: any) => reject(err);
            // @ts-ignore
            if (this.photoUrl.startsWith('blob:') && import.meta.env.MODE === 'headless') {
                // @ts-ignore
                resolveObjectURL(this.photoUrl)?.arrayBuffer()
                // @ts-ignore
                .then((arrayBuffer) => {
                    this._photo.src = Buffer.from(arrayBuffer);
                    resolve();
                });
            } else {
                this._photo.src = this.photoUrl;
            }
        });
    }

    update(options: ImageOptions): Promise<void> {
        return new Promise<void>((resolve) => {
            if (!options) {
                resolve();
                return;
            }
            // Recadrage seul (la photo est déjà chargée) : {} ou null pour le retirer
            if (options.crop !== undefined && !(options.id !== undefined && this.id !== options.id)
                && !(options.url !== undefined && this.photoUrl !== options.url)) {
                const next = options.crop && options.crop.width ? options.crop : undefined;
                const same = JSON.stringify(next) === JSON.stringify(this.crop);
                this.crop = next;
                if (!same) {
                    // sinon la mise à jour de l'image se relancerait sans fin
                    this.recomputeImage = true;
                    this.applyCrop();
                }
                resolve();
                return;
            }
            if (options.crop !== undefined) {
                // Nouvelle photo avec son recadrage : il sera appliqué au chargement
                this.crop = options.crop && options.crop.width ? options.crop : undefined;
            } else if ((options.id !== undefined && this.id !== options.id) || (options.url !== undefined && this.photoUrl !== options.url)) {
                this.crop = undefined; // nouvelle photo : on repart sans recadrage
            }
            if (options.id !== undefined && this.id !== options.id) {
                if (this.vida.gallery === undefined) {
                    throw new InvalidDataError('Please provide a gallery if you use internalphoto!')
                }

                const image = <GalleryInternalPhoto>this.vida.gallery.elementById(options.id);
                if (image === undefined || image.type !== 'internalphoto') {
                    throw new InvalidDataError(`Image ${ options.id } does not exist or is not an internalphoto.`)
                }

                this.mimeType = extractMimeTypeFromFilename(image.filename);
                this.id = options.id;
                this.originalSize = { width: 0, height: 0 };
                const self = this;
                this.vida.gallery.fileUrl(image.id).then((photoUrl: string) => {
                    self.loadPhoto(photoUrl).then(() => resolve());
                });
                return;
            } else if (options.url !== undefined && this.photoUrl !== options.url) {
                this.mimeType = /^data:image\/png/.test(options.url) ? 'image/png' : 'image/jpeg'; // le PNG garde sa transparence

                // Don't know if required
                // this.id = undefined;
                this.loadPhoto(options.url).then(() => resolve());
            } else {
                resolve();
                return;
            }

            return;
        });
    }

    makeImage(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.inResize = false;
            resolve();
        });
    }

    image(): HTMLImageElement|undefined | any{
        return this._croppedCanvas || this._photo;
    }

    async imageToSvg(): Promise<string | undefined | any> {
        let href:string = '';

        if (this._croppedCanvas) {
            // Photo recadrée : on exporte uniquement la zone conservée
            href = this._croppedCanvas.toDataURL(this.mimeType);
        } else if (this.type === 'internalphoto') {
            if (this.vida.gallery === undefined) {
                throw new InvalidDataError('Please provide a gallery if you use internalphoto!')
            }

            // @ts-ignore
            if (import.meta.env.MODE === 'headless') {
                const canvas = createCanvas(this._photo.width, this._photo.height);
                canvas.getContext('2d').drawImage(this._photo, 0, 0);
                // @ts-ignore
                href = canvas.toDataURL(this.mimeType);
            } else {
                const canvas = document.createElement('canvas');
                canvas.height = this._photo.height;
                canvas.width = this._photo.width;
                document.body.appendChild(canvas);
                canvas.getContext('2d')!.drawImage(this._photo, 0, 0);
                // @ts-ignore
                href = canvas.toDataURL(this.mimeType);
                document.body.removeChild(canvas);
                canvas.remove();
            }
        } else if (this.type === 'urlphoto') {
            href =  this.photoUrl!;
        }

        return `<svg width="${this.originalSize.width}" height="${this.originalSize.height}" viewBox="0 0 ${this.originalSize.width} ${this.originalSize.height}">
        <image href="${href}"/></svg>`
    }

    makeHitformFunction() {
        return undefined;
    }
}
