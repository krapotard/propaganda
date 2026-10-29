<template>
    <canvas ref="canvas" class="color-wheel" :width="size" :height="size" :style="{ width: size + 'px', height: size + 'px' }"
        @pointerdown.prevent="down" @pointermove.prevent="move" @pointerup="up" @pointercancel="up"></canvas>
</template>

<script>
// Roue chromatique : anneau de teinte + carré saturation/luminosité. Tout est dessiné dans le navigateur.
const hsvToRgb = (h, s, v) => {
    const f = (n) => {
        const k = (n + h / 60) % 6;
        return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    };
    return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
};

export default {
    name: 'color-wheel',
    props: {
        h: { type: Number, default: 0 }, // 0..360
        s: { type: Number, default: 0 }, // 0..1
        v: { type: Number, default: 1 }, // 0..1
        size: { type: Number, default: 220 },
    },
    data() {
        return { drag: undefined };
    },
    computed: {
        outer() { return this.size / 2 - 2; },
        inner() { return this.outer - 22; },
        half() { return Math.floor((this.inner - 6) / Math.SQRT2); }, // demi-côté du carré
    },
    mounted() { this.draw(); },
    watch: {
        h() { this.draw(); },
        s() { this.draw(); },
        v() { this.draw(); },
    },
    methods: {
        draw() {
            const c = this.$refs.canvas;
            if (!c) return;
            const ctx = c.getContext('2d');
            const mid = this.size / 2;
            ctx.clearRect(0, 0, this.size, this.size);
            // anneau
            const grad = ctx.createConicGradient(-Math.PI / 2, mid, mid);
            for (let i = 0; i <= 12; i++) grad.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
            ctx.beginPath();
            ctx.arc(mid, mid, this.outer, 0, Math.PI * 2);
            ctx.arc(mid, mid, this.inner, 0, Math.PI * 2, true);
            ctx.fillStyle = grad;
            ctx.fill('evenodd');
            // carré S/V
            const x0 = mid - this.half, y0 = mid - this.half, w = this.half * 2;
            ctx.fillStyle = `hsl(${this.h},100%,50%)`;
            ctx.fillRect(x0, y0, w, w);
            const gw = ctx.createLinearGradient(x0, 0, x0 + w, 0);
            gw.addColorStop(0, '#fff'); gw.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = gw; ctx.fillRect(x0, y0, w, w);
            const gb = ctx.createLinearGradient(0, y0, 0, y0 + w);
            gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000');
            ctx.fillStyle = gb; ctx.fillRect(x0, y0, w, w);
            // repères
            const a = ((this.h - 90) * Math.PI) / 180;
            const rm = (this.outer + this.inner) / 2;
            this.marker(ctx, mid + Math.cos(a) * rm, mid + Math.sin(a) * rm, `hsl(${this.h},100%,50%)`);
            const [r, g, b] = hsvToRgb(this.h, this.s, this.v);
            this.marker(ctx, x0 + this.s * w, y0 + (1 - this.v) * w, `rgb(${r},${g},${b})`);
        },
        marker(ctx, x, y, fill) {
            ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fillStyle = fill; ctx.fill();
            ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
            ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2);
            ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
        },
        pos(evt) {
            const r = this.$refs.canvas.getBoundingClientRect();
            return { x: ((evt.clientX - r.left) * this.size) / r.width, y: ((evt.clientY - r.top) * this.size) / r.height };
        },
        apply(evt) {
            const { x, y } = this.pos(evt);
            const mid = this.size / 2;
            if (this.drag === 'ring') {
                const deg = (Math.atan2(y - mid, x - mid) * 180) / Math.PI + 90;
                this.$emit('change', { h: (deg + 360) % 360, s: this.s, v: this.v });
            } else {
                const w = this.half * 2;
                const s = Math.min(1, Math.max(0, (x - (mid - this.half)) / w));
                const v = 1 - Math.min(1, Math.max(0, (y - (mid - this.half)) / w));
                this.$emit('change', { h: this.h, s, v });
            }
        },
        down(evt) {
            const { x, y } = this.pos(evt);
            const mid = this.size / 2;
            const d = Math.hypot(x - mid, y - mid);
            if (d >= this.inner - 4 && d <= this.outer + 2) this.drag = 'ring';
            else if (Math.abs(x - mid) <= this.half + 4 && Math.abs(y - mid) <= this.half + 4) this.drag = 'square';
            else return;
            this.$refs.canvas.setPointerCapture(evt.pointerId);
            this.apply(evt);
        },
        move(evt) { if (this.drag) this.apply(evt); },
        up() { this.drag = undefined; },
    },
};
</script>

<style scoped>
.color-wheel { cursor: crosshair; touch-action: none; display: block; }
</style>
