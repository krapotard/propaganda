<template>
    <canvas
        ref="canvas"
        class="textframe-overlay"
        :style="{ position: 'fixed', zIndex: 4, cursor: 'crosshair', touchAction: 'none', outline: 'none', left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' }"
        tabindex="0"
        @pointerdown.prevent="down"
        @pointermove.prevent="move"
        @pointerup.prevent="up"
        @pointercancel="cancelDrag"></canvas>
</template>

<script>
// Dessin d'une zone de texte : on tire un cadre sur le visuel ; au relâchement, l'éditeur crée un texte
// dont la largeur et la hauteur sont celles du cadre (coordonnées du visuel, bornées à la page).
const MIN_SIDE = 12; // pixels de l'écran

export default {
    name: 'textframe-overlay',
    props: {
        vida: { type: Object, required: true },
        zoom: { type: Number, default: 1 },
    },
    data() {
        return { box: { left: 0, top: 0, width: 0, height: 0 }, start: undefined, current: undefined };
    },
    mounted() {
        this.render();
        window.addEventListener('resize', this.render);
        window.addEventListener('keydown', this.onKey);
        this.$refs.canvas.focus();
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.render);
        window.removeEventListener('keydown', this.onKey);
    },
    watch: {
        zoom() {
            this.$nextTick(this.render);
        },
    },
    methods: {
        onKey(evt) {
            if (evt.key === 'Escape') this.$emit('cancel');
        },
        render() {
            const container = document.getElementById('whiteboard');
            const canvas = this.$refs.canvas;
            if (!container || !canvas) return;
            const rect = container.getBoundingClientRect();
            this.box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            this.$nextTick(this.paint);
        },
        paint() {
            const canvas = this.$refs.canvas;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const ratio = window.devicePixelRatio || 1;
            canvas.width = Math.round(rect.width * ratio);
            canvas.height = Math.round(rect.height * ratio);
            const ctx = canvas.getContext('2d');
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            ctx.clearRect(0, 0, rect.width, rect.height);
            // cadre du visuel, pour savoir où l'on peut dessiner
            const m = this.vida.documentMatrix();
            const doc = this.vida.documentParams();
            ctx.strokeStyle = 'rgba(195,12,7,0.8)';
            ctx.lineWidth = 1;
            ctx.strokeRect(m[4], m[5], doc.width * m[0], doc.height * m[3]);
            if (this.start && this.current) {
                const x = Math.min(this.start.sx, this.current.sx);
                const y = Math.min(this.start.sy, this.current.sy);
                const w = Math.abs(this.start.sx - this.current.sx);
                const h = Math.abs(this.start.sy - this.current.sy);
                ctx.fillStyle = 'rgba(195,12,7,0.10)';
                ctx.fillRect(x, y, w, h);
                ctx.setLineDash([6, 4]);
                ctx.strokeStyle = '#c30c07';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
                ctx.setLineDash([]);
            }
        },
        screen(evt) {
            const rect = this.$refs.canvas.getBoundingClientRect();
            return { sx: evt.clientX - rect.left, sy: evt.clientY - rect.top };
        },
        // écran -> coordonnées du visuel
        toDoc(p) {
            const m = this.vida.documentMatrix();
            const det = m[0] * m[3] - m[1] * m[2];
            return {
                x: (m[3] * (p.sx - m[4]) - m[2] * (p.sy - m[5])) / det,
                y: (-m[1] * (p.sx - m[4]) + m[0] * (p.sy - m[5])) / det,
            };
        },
        down(evt) {
            this.$refs.canvas.setPointerCapture(evt.pointerId);
            this.start = this.screen(evt);
            this.current = this.start;
            this.paint();
        },
        move(evt) {
            if (!this.start) return;
            this.current = this.screen(evt);
            this.paint();
        },
        up(evt) {
            if (!this.start) return;
            this.current = this.screen(evt);
            const a = this.start;
            const b = this.current;
            this.start = undefined;
            this.current = undefined;
            if (Math.abs(a.sx - b.sx) < MIN_SIDE || Math.abs(a.sy - b.sy) < MIN_SIDE) {
                this.paint();
                this.$emit('too-small');
                return;
            }
            const doc = this.vida.documentParams();
            const p1 = this.toDoc(a);
            const p2 = this.toDoc(b);
            const clamp = (v, max) => Math.min(Math.max(v, 0), max);
            const x1 = clamp(Math.min(p1.x, p2.x), doc.width);
            const x2 = clamp(Math.max(p1.x, p2.x), doc.width);
            const y1 = clamp(Math.min(p1.y, p2.y), doc.height);
            const y2 = clamp(Math.max(p1.y, p2.y), doc.height);
            if (x2 - x1 < 5 || y2 - y1 < 5) {
                this.paint();
                this.$emit('too-small');
                return;
            }
            this.$emit('done', { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
        },
        cancelDrag() {
            this.start = undefined;
            this.current = undefined;
            this.paint();
        },
    },
};
</script>
