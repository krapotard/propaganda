<template>
    <canvas
        ref="canvas"
        class="drawing-overlay"
        :style="{ left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' }"
        @pointerdown.prevent="down"
        @pointermove.prevent="move"
        @pointerup.prevent="up"
        @pointercancel="up"
        @pointerleave="up"></canvas>
</template>

<script>
// Dessin à main levée (crayon, pinceau, aérosol, gomme).
// Les traits sont dessinés sur une image de la taille du visuel ; à la fin, la zone dessinée est
// découpée et ajoutée au visuel comme une photo PNG transparente (donc déplaçable, redimensionnable,
// recadrable, inclinable, et présente dans les exports PNG, JPEG et PDF).
const MAX_SIDE = 3000;

export default {
    name: 'drawing-overlay',
    props: {
        vida: { type: Object, required: true },
        settings: { type: Object, required: true }, // { tool, color, size }
        zoom: { type: Number, default: 1 },
    },
    data() {
        return { box: { left: 0, top: 0, width: 0, height: 0 }, strokes: [], current: undefined, timer: undefined };
    },
    mounted() {
        this.start();
        window.addEventListener('resize', this.render);
    },
    beforeDestroy() {
        window.removeEventListener('resize', this.render);
        clearInterval(this.timer);
    },
    watch: {
        zoom() {
            this.$nextTick(this.render);
        },
    },
    methods: {
        start() {
            const doc = this.vida.documentParams();
            this.docW = doc.width;
            this.docH = doc.height;
            this.k = Math.min(1, MAX_SIDE / Math.max(this.docW, this.docH)); // pixels de l'image par pixel du visuel
            this.buf = document.createElement('canvas');
            this.buf.width = Math.max(1, Math.round(this.docW * this.k));
            this.buf.height = Math.max(1, Math.round(this.docH * this.k));
            this.strokes = [];
            this.$nextTick(this.render);
        },
        /* ---------- affichage ---------- */
        render() {
            const container = document.getElementById('whiteboard');
            const canvas = this.$refs.canvas;
            if (!container || !canvas) return;
            const rect = container.getBoundingClientRect();
            this.box = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            this.$nextTick(() => {
                const ratio = window.devicePixelRatio || 1;
                canvas.width = Math.round(rect.width * ratio);
                canvas.height = Math.round(rect.height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const m = this.vida.documentMatrix();
                ctx.setTransform(m[0] * ratio, m[1] * ratio, m[2] * ratio, m[3] * ratio, m[4] * ratio, m[5] * ratio);
                ctx.drawImage(this.buf, 0, 0, this.docW, this.docH);
                // cadre du visuel, pour savoir où l'on peut dessiner
                ctx.lineWidth = 1 / (m[0] || 1);
                ctx.strokeStyle = 'rgba(195,12,7,0.8)';
                ctx.strokeRect(0, 0, this.docW, this.docH);
            });
        },
        point(evt) {
            const canvas = this.$refs.canvas;
            const rect = canvas.getBoundingClientRect();
            const m = this.vida.documentMatrix();
            const x = evt.clientX - rect.left;
            const y = evt.clientY - rect.top;
            const det = m[0] * m[3] - m[1] * m[2];
            return {
                x: (m[3] * (x - m[4]) - m[2] * (y - m[5])) / det,
                y: (-m[1] * (x - m[4]) + m[0] * (y - m[5])) / det,
            };
        },
        /* ---------- traits ---------- */
        down(evt) {
            this.$refs.canvas.setPointerCapture(evt.pointerId);
            const { tool, color, size } = this.settings;
            const p = this.point(evt);
            this.current = { tool, color, size, pts: [p], dots: [] };
            this.last = p;
            this.strokes.push(this.current);
            if (tool === 'spray') {
                this.addDots(p);
                // l'aérosol continue de pulvériser quand on reste appuyé
                this.timer = setInterval(() => {
                    if (this.current) {
                        this.addDots(this.last);
                        this.render();
                    }
                }, 40);
            } else {
                this.drawSegment(this.current, this.current.pts);
            }
            this.render();
        },
        move(evt) {
            if (!this.current) return;
            const p = this.point(evt);
            const s = this.current;
            if (s.tool === 'spray') {
                this.last = p;
                this.addDots(p);
            } else {
                s.pts.push(p);
                this.drawSegment(s, s.pts);
            }
            this.render();
        },
        up() {
            if (!this.current) return;
            clearInterval(this.timer);
            this.current = undefined;
            this.$emit('change', this.strokes.length);
        },
        radius(stroke) {
            return stroke.tool === 'spray' ? stroke.size * 3 : stroke.tool === 'brush' ? stroke.size : stroke.tool === 'eraser' ? stroke.size * 1.5 : Math.max(1, stroke.size * 0.6);
        },
        addDots(p) {
            const s = this.current;
            const r = this.radius(s);
            const n = Math.round(Math.max(6, r * 0.7));
            const dot = Math.max(1.5, s.size / 5);
            const ctx = this.buf.getContext('2d');
            ctx.save();
            ctx.scale(this.k, this.k);
            ctx.fillStyle = s.color;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const a = Math.random() * Math.PI * 2;
                const d = r * Math.sqrt(Math.random());
                const x = p.x + Math.cos(a) * d;
                const y = p.y + Math.sin(a) * d;
                s.dots.push([x, y]);
                ctx.moveTo(x + dot, y);
                ctx.arc(x, y, dot, 0, Math.PI * 2);
            }
            ctx.fill();
            ctx.restore();
        },
        // trace la fin du trait : courbe lissée entre les milieux des derniers points
        drawSegment(s, pts, from) {
            const ctx = this.buf.getContext('2d');
            ctx.save();
            ctx.scale(this.k, this.k);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = s.color;
            ctx.fillStyle = s.color;
            ctx.lineWidth = this.radius(s) * (s.tool === 'pencil' ? 1 : 2);
            if (s.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
            if (s.tool === 'brush') {
                ctx.shadowColor = s.color;
                ctx.shadowBlur = s.size * 0.5 * this.k; // en pixels de l'image, non touché par le zoom du contexte
            }
            const n = pts.length;
            const i = from === undefined ? n - 1 : from;
            if (n === 1) {
                ctx.beginPath();
                ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
            } else if (n >= 2) {
                const a = pts[Math.max(i - 2, 0)];
                const b = pts[Math.max(i - 1, 0)];
                const c = pts[i];
                ctx.beginPath();
                ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
                ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
                ctx.lineTo(c.x, c.y);
                ctx.stroke();
            }
            ctx.restore();
        },
        redraw() {
            const ctx = this.buf.getContext('2d');
            ctx.clearRect(0, 0, this.buf.width, this.buf.height);
            for (const s of this.strokes) {
                if (s.tool === 'spray') {
                    ctx.save();
                    ctx.scale(this.k, this.k);
                    ctx.fillStyle = s.color;
                    const dot = Math.max(1.5, s.size / 5);
                    ctx.beginPath();
                    for (const [x, y] of s.dots) {
                        ctx.moveTo(x + dot, y);
                        ctx.arc(x, y, dot, 0, Math.PI * 2);
                    }
                    ctx.fill();
                    ctx.restore();
                } else {
                    for (let i = 0; i < s.pts.length; i++) this.drawSegment(s, s.pts.slice(0, i + 1), i);
                }
            }
            this.render();
        },
        /* ---------- actions appelées par l'éditeur ---------- */
        undo() {
            this.strokes.pop();
            this.redraw();
            this.$emit('change', this.strokes.length);
        },
        clear() {
            this.strokes = [];
            this.redraw();
            this.$emit('change', 0);
        },
        // Découpe la zone dessinée et la renvoie sous forme de PNG transparent
        result() {
            const w = this.buf.width;
            const h = this.buf.height;
            const data = this.buf.getContext('2d').getImageData(0, 0, w, h).data;
            let x0 = w, y0 = h, x1 = -1, y1 = -1;
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    if (data[(y * w + x) * 4 + 3] > 0) {
                        if (x < x0) x0 = x;
                        if (x > x1) x1 = x;
                        if (y < y0) y0 = y;
                        if (y > y1) y1 = y;
                    }
                }
            }
            if (x1 < 0) return undefined;
            const out = document.createElement('canvas');
            out.width = x1 - x0 + 1;
            out.height = y1 - y0 + 1;
            out.getContext('2d').drawImage(this.buf, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
            return {
                dataUrl: out.toDataURL('image/png'),
                width: out.width,
                height: out.height,
                // centre du dessin, en pixels du visuel
                centerX: (x0 + out.width / 2) / this.k,
                centerY: (y0 + out.height / 2) / this.k,
                k: this.k,
                docWidth: this.docW,
                docHeight: this.docH,
            };
        },
    },
};
</script>

<style scoped>
.drawing-overlay {
    position: fixed;
    z-index: 4;
    cursor: crosshair;
    touch-action: none;
}
</style>
