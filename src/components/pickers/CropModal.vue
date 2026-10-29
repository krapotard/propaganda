<template>
    <div class="modal-card crop-modal">
        <header class="modal-card-head">
            <p class="modal-card-title">Recadrer la photo</p>
            <button class="delete" aria-label="Fermer" @click="$emit('close')" />
        </header>

        <section class="modal-card-body">
            <div class="crop-ratios">
                <span>Proportions :</span>
                <button v-for="preset in presets" :key="preset.label" type="button" class="button is-small"
                    :class="{ 'is-primary': activeRatio === preset.ratio && preset.ratio !== undefined && !isFree, 'is-light': isFree && preset.free }"
                    @click="setRatio(preset)">
                    {{ preset.label }}
                </button>
            </div>

            <div class="crop-stage" ref="stage" :style="{ width: displayWidth + 'px', height: displayHeight + 'px' }">
                <img v-if="url" :src="url" alt="" draggable="false" @load="onLoad" ref="image" />
                <template v-if="ready">
                    <div class="crop-shade" :style="shade('top')"></div>
                    <div class="crop-shade" :style="shade('bottom')"></div>
                    <div class="crop-shade" :style="shade('left')"></div>
                    <div class="crop-shade" :style="shade('right')"></div>
                    <div class="crop-rect" :style="rectStyle" @pointerdown.prevent="startDrag($event, 'move')">
                        <span v-for="corner in corners" :key="corner" class="crop-handle" :class="'is-' + corner"
                            @pointerdown.prevent.stop="startDrag($event, corner)"></span>
                    </div>
                </template>
            </div>
            <p class="crop-info" v-if="ready">{{ cropPixels }}</p>
        </section>

        <footer class="modal-card-foot">
            <b-button type="is-primary" :disabled="!ready" @click="apply">Appliquer</b-button>
            <b-button @click="$emit('close')">Annuler</b-button>
            <b-button v-if="hasCrop" type="is-text" @click="reset">Retirer le recadrage</b-button>
        </footer>
    </div>
</template>

<script>
const MIN = 24;

export default {
    name: 'crop-modal',
    props: {
        url: { type: String, required: true },
        crop: { type: Object, default: undefined }, // fractions de l'image d'origine
        documentRatio: { type: Number, default: undefined },
    },
    data() {
        return {
            naturalWidth: 0,
            naturalHeight: 0,
            displayWidth: 0,
            displayHeight: 0,
            rect: { x: 0, y: 0, w: 0, h: 0 },
            ready: false,
            activeRatio: undefined,
            isFree: true,
            drag: undefined,
            corners: ['nw', 'ne', 'sw', 'se'],
        };
    },
    computed: {
        hasCrop() {
            return !!(this.crop && this.crop.width);
        },
        presets() {
            const list = [
                { label: 'Libre', free: true },
                { label: '1:1', ratio: 1 },
                { label: '4:5', ratio: 4 / 5 },
                { label: '3:2', ratio: 3 / 2 },
                { label: '16:9', ratio: 16 / 9 },
            ];
            if (this.documentRatio) list.push({ label: 'Format du visuel', ratio: this.documentRatio });
            return list;
        },
        rectStyle() {
            const r = this.rect;
            return { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' };
        },
        cropPixels() {
            const sx = this.naturalWidth / this.displayWidth;
            return `${Math.round(this.rect.w * sx)} × ${Math.round(this.rect.h * sx)} px`;
        },
    },
    methods: {
        onLoad(evt) {
            this.naturalWidth = evt.target.naturalWidth;
            this.naturalHeight = evt.target.naturalHeight;
            const maxW = Math.min(window.innerWidth * 0.7, 760);
            const maxH = window.innerHeight * 0.55;
            const scale = Math.min(maxW / this.naturalWidth, maxH / this.naturalHeight, 1);
            this.displayWidth = Math.round(this.naturalWidth * scale);
            this.displayHeight = Math.round(this.naturalHeight * scale);
            const c = this.crop && this.crop.width ? this.crop : { x: 0, y: 0, width: 1, height: 1 };
            this.rect = {
                x: c.x * this.displayWidth,
                y: c.y * this.displayHeight,
                w: c.width * this.displayWidth,
                h: c.height * this.displayHeight,
            };
            this.ready = true;
        },
        shade(side) {
            const r = this.rect;
            const W = this.displayWidth;
            const H = this.displayHeight;
            switch (side) {
                case 'top':
                    return { left: 0, top: 0, width: W + 'px', height: r.y + 'px' };
                case 'bottom':
                    return { left: 0, top: r.y + r.h + 'px', width: W + 'px', height: H - r.y - r.h + 'px' };
                case 'left':
                    return { left: 0, top: r.y + 'px', width: r.x + 'px', height: r.h + 'px' };
                default:
                    return { left: r.x + r.w + 'px', top: r.y + 'px', width: W - r.x - r.w + 'px', height: r.h + 'px' };
            }
        },
        setRatio(preset) {
            if (preset.free) {
                this.isFree = true;
                this.activeRatio = undefined;
                return;
            }
            this.isFree = false;
            this.activeRatio = preset.ratio;
            // Plus grand rectangle de ces proportions, centré sur la sélection actuelle
            const cx = this.rect.x + this.rect.w / 2;
            const cy = this.rect.y + this.rect.h / 2;
            let w = this.displayWidth;
            let h = w / preset.ratio;
            if (h > this.displayHeight) {
                h = this.displayHeight;
                w = h * preset.ratio;
            }
            w = Math.min(w, this.rect.w > MIN ? Math.max(this.rect.w, MIN) : w);
            h = w / preset.ratio;
            if (h > this.displayHeight) {
                h = this.displayHeight;
                w = h * preset.ratio;
            }
            this.rect = {
                x: Math.min(Math.max(cx - w / 2, 0), this.displayWidth - w),
                y: Math.min(Math.max(cy - h / 2, 0), this.displayHeight - h),
                w,
                h,
            };
        },
        startDrag(evt, mode) {
            this.drag = { mode, px: evt.clientX, py: evt.clientY, rect: { ...this.rect } };
            window.addEventListener('pointermove', this.onMove);
            window.addEventListener('pointerup', this.stopDrag);
        },
        stopDrag() {
            this.drag = undefined;
            window.removeEventListener('pointermove', this.onMove);
            window.removeEventListener('pointerup', this.stopDrag);
        },
        onMove(evt) {
            if (!this.drag) return;
            const { mode, px, py, rect } = this.drag;
            const dx = evt.clientX - px;
            const dy = evt.clientY - py;
            const W = this.displayWidth;
            const H = this.displayHeight;

            if (mode === 'move') {
                this.rect = {
                    ...rect,
                    x: Math.min(Math.max(rect.x + dx, 0), W - rect.w),
                    y: Math.min(Math.max(rect.y + dy, 0), H - rect.h),
                };
                return;
            }

            // Coin opposé fixe
            const ax = mode.includes('w') ? rect.x + rect.w : rect.x;
            const ay = mode.includes('n') ? rect.y + rect.h : rect.y;
            let nx = (mode.includes('w') ? rect.x : rect.x + rect.w) + dx;
            let ny = (mode.includes('n') ? rect.y : rect.y + rect.h) + dy;
            nx = Math.min(Math.max(nx, 0), W);
            ny = Math.min(Math.max(ny, 0), H);
            let w = Math.max(Math.abs(nx - ax), MIN);
            let h = Math.max(Math.abs(ny - ay), MIN);

            if (!this.isFree && this.activeRatio) {
                // Proportions verrouillées : la largeur commande
                h = w / this.activeRatio;
                const maxW = mode.includes('w') ? ax : W - ax;
                const maxH = mode.includes('n') ? ay : H - ay;
                if (w > maxW) {
                    w = maxW;
                    h = w / this.activeRatio;
                }
                if (h > maxH) {
                    h = maxH;
                    w = h * this.activeRatio;
                }
            }

            this.rect = {
                x: mode.includes('w') ? ax - w : ax,
                y: mode.includes('n') ? ay - h : ay,
                w,
                h,
            };
        },
        apply() {
            const r = this.rect;
            const full = r.w >= this.displayWidth - 1 && r.h >= this.displayHeight - 1;
            this.$emit(
                'apply',
                full
                    ? undefined
                    : {
                          x: r.x / this.displayWidth,
                          y: r.y / this.displayHeight,
                          width: r.w / this.displayWidth,
                          height: r.h / this.displayHeight,
                      },
                { width: this.naturalWidth, height: this.naturalHeight },
            );
            this.$emit('close');
        },
        reset() {
            this.$emit('apply', undefined, { width: this.naturalWidth, height: this.naturalHeight });
            this.$emit('close');
        },
    },
    beforeDestroy() {
        this.stopDrag();
    },
};
</script>

<style scoped lang="scss">
.crop-modal {
    width: auto;
    max-width: 96vw;
}
.crop-ratios {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
}
.crop-stage {
    position: relative;
    margin: 0 auto;
    user-select: none;
    touch-action: none;
    img {
        width: 100%;
        height: 100%;
        display: block;
        pointer-events: none;
    }
}
.crop-shade {
    position: absolute;
    background: rgba(0, 0, 0, 0.55);
    pointer-events: none;
}
.crop-rect {
    position: absolute;
    border: 2px solid #f8e501;
    box-sizing: border-box;
    cursor: move;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.crop-handle {
    position: absolute;
    width: 16px;
    height: 16px;
    background: #fff;
    border: 2px solid #c30c07;
    box-sizing: border-box;
    &.is-nw {
        left: -9px;
        top: -9px;
        cursor: nwse-resize;
    }
    &.is-ne {
        right: -9px;
        top: -9px;
        cursor: nesw-resize;
    }
    &.is-sw {
        left: -9px;
        bottom: -9px;
        cursor: nesw-resize;
    }
    &.is-se {
        right: -9px;
        bottom: -9px;
        cursor: nwse-resize;
    }
}
.crop-info {
    text-align: center;
    margin-top: 8px;
    font-size: 0.85em;
    color: #666;
}
</style>
