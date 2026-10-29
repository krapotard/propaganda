<script setup>
import ResetPicker from '@/components/pickers/ResetPicker.vue';

import { useStore } from '@datastore';
const store = useStore();

store.fetchColors();
</script>

<template>
    <div style="flex-grow: 1">
        <reset-picker v-if="resettable" :defaultValue="store.randomElement('colors').html" v-model="inputValue" />
        <template v-if="inputValue !== undefined">
            <b-modal v-model="openedModal" :width="640" scroll="keep" has-modal-card>
                <div class="modal-card">
                    <header class="modal-card-head">
                        <div class="modal-card-title capitalize">
                            {{ $tc('COLORS.LABEL', 1) }}
                        </div>
                        <button class="delete" aria-label="close" @click="openedModal = false" />
                    </header>
                    <div class="modal-card-body">
                        <div class="content">
                            <div class="container">
                                <div class="row">
                                    <div :class="{ thumb: true, white: c.html === '#ffffff' }" v-for="c in store.colors"
                                        :key="c.name" :title="c.name" :style="{ backgroundColor: c.html }"
                                        @click="update(c)" />
                                </div>

                                <div class="row cp-main" v-if="rgb">
                                    <color-wheel :h="hsv.h" :s="hsv.s" :v="hsv.v" @change="onWheel" />
                                    <div class="cp-side">
                                        <div class="overview" :style="style"></div>
                                        <b-field>
                                            <b-input type="text" required v-model="inputValue"
                                                :validation-message="$t('COLORS.ERRORS.NOT_VALID_HTML')"
                                                pattern="^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})|()$">
                                            </b-input>
                                        </b-field>
                                        <div class="cp-rgb">
                                            <label>{{ $t('COLORS.RED') }}<input type="number" min="0" max="255" :value="rgb.r" @input="setChannel('r', $event)" /></label>
                                            <label>{{ $t('COLORS.GREEN') }}<input type="number" min="0" max="255" :value="rgb.g" @input="setChannel('g', $event)" /></label>
                                            <label>{{ $t('COLORS.BLUE') }}<input type="number" min="0" max="255" :value="rgb.b" @input="setChannel('b', $event)" /></label>
                                        </div>
                                        <div class="cp-alpha" v-if="alphaEnabled">
                                            <span>Opacité</span>
                                            <input type="range" min="0" max="100" :value="Math.round(alpha * 100)" @input="setAlpha($event.target.value / 100)"
                                                :style="{ background: alphaTrack }" />
                                            <input type="number" min="0" max="100" :value="Math.round(alpha * 100)" @input="setAlpha($event.target.value / 100)" /> %
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="row is-justify-content-center toolbar">
                                <b-tooltip :label="$t('EDIT.TIPS.RANDOM_SELECTION')">
                                    <b-button id="random-color-modal-button" @click="randomColor" icon size="is-medium"
                                        icon-left="dice-multiple"></b-button>
                                </b-tooltip>
                                <b-tooltip :label="$t('COLORS.TIPS.DROP_COLOR')" v-if="dropColorEnabled">
                                    <b-button @click="initDropColor" icon size="is-medium"
                                        icon-left="eyedropper"></b-button>
                                </b-tooltip>
                                <b-tooltip :label="$t('COLORS.TIPS.LIGHTEN')">
                                    <b-button @click="lighten" icon size="is-medium"
                                        icon-left="brightness-5"></b-button>
                                </b-tooltip>
                                <b-tooltip :label="$t('COLORS.TIPS.DARKEN')">
                                    <b-button @click="darken" icon size="is-medium" icon-left="brightness-7"></b-button>
                                </b-tooltip>
                            </div>
                        </div>
                    </div>
                </div>
            </b-modal>

            <div class="row" style="width: 100%">
                <div class="overview" :style="style" @click="openModalIfEnabled" :class="{ disabled: disabled }"></div>
                <div>
                    <b-tooltip v-if="randomShortcut" :label="$t('EDIT.TIPS.RANDOM_SELECTION')"
                        style="padding: 0px 10px">
                        <b-button id="random-color-button" @click="randomColor()" icon icon-left="dice-multiple"
                            :disabled="disabled"></b-button>
                    </b-tooltip>
                </div>
            </div>

            <div v-show="eyeDropMode" class="eye-drop-preview-wrapper">
                <div class="eye-drop-preview"
                    :style="'background-color:' + previewDropColor.color + ';top:' + previewDropColor.y + 'px;left:' + previewDropColor.x + 'px'">
                </div>
            </div>
        </template>
    </div>
</template>

<script>
import { HEX2RGB, grayScale } from '@/plugins/utils.js';
import { pSBC} from 'aktivisda-library';
import ColorWheel from '@/components/pickers/ColorWheel.vue';

const CHECKER = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 12px 12px';
const rgbToHsv = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
};
const hsvToRgb = (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
};

export const toHex = (v) => ('0' + v.toString(16)).slice(-2);
const toRGB = (r, g, b) => ['#', toHex(r), toHex(g), toHex(b)].join('');

export default {
    name: 'color-picker',
    components: { ColorWheel },
    props: {
        value: {
            type: undefined,
            // default: '#ffc11e'
            // validator: (value) => undefined || /^#[0-9A-Fa-f]{6}$/.test(value),
        },
        randomShortcut: {
            type: Boolean,
            default: true,
        },
        dropColorEnabled: { type: Boolean, default: false },
        alphaEnabled: { type: Boolean, default: false },
        disabled: { type: Boolean, default: false },
        resettable: { type: Boolean, default: false },
    },
    data() {
        return {
            openedModal: false,
            copyValue: this.value,
            previewDropColor: {
                color: '#FFFFFF',
                x: 0,
                y: 0,
            },
            eyeDropMode: false,
            hsv: { h: 0, s: 0, v: 1 },
        };
    },
    computed: {
        rgb: {
            set: function ({ r, g, b }) {
                const newValue = toRGB(r, g, b) + this.alphaHex;
                if (newValue === this.copyValue) return;
                this.copyValue = newValue;
                this.$emit('input', this.copyValue);
            },
            get: function () {
                return {
                    r: parseInt(this.copyValue.slice(1, 3), 16),
                    g: parseInt(this.copyValue.slice(3, 5), 16),
                    b: parseInt(this.copyValue.slice(5, 7), 16),
                };
            },
        },
        alpha() {
            return this.copyValue && this.copyValue.length === 9 ? parseInt(this.copyValue.slice(7, 9), 16) / 255 : 1;
        },
        alphaHex() {
            return this.alpha < 1 ? toHex(Math.round(this.alpha * 255)) : '';
        },
        alphaTrack() {
            const c = toRGB(this.rgb.r, this.rgb.g, this.rgb.b);
            return `linear-gradient(to right, ${c}00, ${c}), ${CHECKER}`;
        },
        style() {
            if (!this.disabled) {
                return { background: `linear-gradient(${this.copyValue}, ${this.copyValue}), ${CHECKER}` };
            }
            let gray = grayScale(this.rgb.r, this.rgb.g, this.rgb.b);
            if (gray <= 128) {
                gray = (gray + 30) * 1.3;
            } else {
                gray = (gray - 30) * 0.7;
            }
            const grayStr = `rgb(${gray}, ${gray}, ${gray})`;
            return {
                background: `repeating-linear-gradient( 45deg, ${this.copyValue}, ${this.copyValue} 10px, ${grayStr} 10px, ${grayStr} 20px )`,
            };
        },
        inputValue: {
            set: function (newValue) {
                if (newValue === null) {
                    this.copyValue = undefined;
                    this.$emit('input', null);
                    return;
                }
                if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(newValue)) return;
                this.copyValue = newValue;
                this.$emit('input', newValue);
            },
            get: function () {
                return this.copyValue;
            },
        },
    },
    methods: {
        update({ html }) {
            this.rgb = HEX2RGB(html);
        },
        onWheel({ h, s, v }) {
            this.hsv = { h, s, v };
            const [r, g, b] = hsvToRgb(h, s, v);
            this.rgb = { r, g, b };
        },
        setChannel(k, evt) {
            const n = Math.min(255, Math.max(0, parseInt(evt.target.value, 10)));
            if (isNaN(n)) return;
            this.rgb = { ...this.rgb, [k]: n };
        },
        setAlpha(a) {
            a = Math.min(1, Math.max(0, Number(a)));
            if (isNaN(a)) return;
            const hex = toRGB(this.rgb.r, this.rgb.g, this.rgb.b) + (a < 1 ? toHex(Math.round(a * 255)) : '');
            this.copyValue = hex;
            this.$emit('input', hex);
        },
        randomColor() {
            const randomHtmlColor = useStore().randomElement('colors').html;
            this.rgb = HEX2RGB(randomHtmlColor);
        },
        readDropColor(evt) {
            let x = 0;
            let y = 0;
            let canvas = document.getElementById('whiteboard').getElementsByTagName('canvas')[0];
            let o = canvas;
            while (o.offsetParent) {
                x += o.offsetLeft;
                y += o.offsetTop;
                o = o.offsetParent;
            }
            x = evt.pageX - x; // 36 = border width
            y = evt.pageY - y; // 36 = border width
            const imagesdata = canvas.getContext('2d').getImageData(x, y, 1, 1);
            let newColor = [imagesdata.data[0], imagesdata.data[1], imagesdata.data[2]];
            return { r: newColor[0], g: newColor[1], b: newColor[2] };
        },
        displayDropColor(evt) {
            const { r, g, b } = this.readDropColor(evt);
            this.previewDropColor.color = toRGB(r, g, b);
            this.previewDropColor.x = evt.x;
            this.previewDropColor.y = evt.y;
        },
        dropColor(evt) {
            this.rgb = this.readDropColor(evt);
            document.removeEventListener('click', this.dropColor);
            document.removeEventListener('mousemove', this.displayDropColor);
            document.body.style.cursor = 'unset';
            this.openedModal = true;
            this.eyeDropMode = false;
        },
        initDropColor(evt) {
            evt.stopPropagation();
            document.body.style.cursor = 'pointer';
            this.openedModal = false;
            this.eyeDropMode = true;
            document.addEventListener('click', this.dropColor);
            document.addEventListener('mousemove', this.displayDropColor);
        },
        darken() {
            this.copyValue = pSBC(-0.05, this.copyValue.slice(0, 7)) + this.alphaHex;
            this.$emit('input', this.copyValue);
        },
        lighten() {
            this.copyValue = pSBC(0.05, this.copyValue.slice(0, 7)) + this.alphaHex;
            this.$emit('input', this.copyValue);
        },
        openModalIfEnabled() {
            if (this.disabled) return;
            this.openedModal = true;
        },
    },
    mounted() {},
    unmounted() {},
    watch: {
        value: {
            immediate: true,
            handler(newValue) {
                this.copyValue = newValue;
            },
        },
        copyValue: {
            immediate: true,
            handler(v) {
                if (!v || !/^#[0-9A-Fa-f]{6}/.test(v)) return;
                const r = parseInt(v.slice(1, 3), 16), g = parseInt(v.slice(3, 5), 16), b = parseInt(v.slice(5, 7), 16);
                const cur = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
                if (cur[0] === r && cur[1] === g && cur[2] === b) return; // la teinte reste fixe pour les gris
                const n = rgbToHsv(r, g, b);
                this.hsv = { h: n.s && n.v ? n.h : this.hsv.h, s: n.s, v: n.v };
            },
        },
    },
};
</script>

<style scoped>
.thumb {
    cursor: pointer;
    height: 40px;
    width: 40px;
    margin: 3px;
    border-radius: 20%;
}

.thumb.white {
    border: 1px solid #aaa;
}

.thumb:hover {
    transform: scale(1.05);
    box-shadow: 0px 3px 10px -5px rgba(19, 19, 19, 0.3);
}

.overview {
    flex-grow: 1;
    height: 35px;
    border: 1px solid #aaa;
    cursor: pointer;
}

.eye-drop-preview-wrapper {
    width: 100vw;
    height: 100vw;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 50;
}

.eye-drop-preview {
    width: 30px;
    height: 30px;
    border: 1px solid gray;
    position: absolute;
    top: 100px;
    left: 300px;
}

.cp-main { display: flex; gap: 20px; align-items: flex-start; margin-top: 20px; }
.cp-side { flex-grow: 1; }
.cp-side .overview { margin-bottom: 8px; }
.cp-rgb { display: flex; gap: 8px; margin-bottom: 10px; }
.cp-rgb label { flex: 1; font-size: 0.8em; }
.cp-rgb input, .cp-alpha input[type='number'] { width: 100%; padding: 4px; border: 1px solid #ccc; border-radius: 4px; }
.cp-alpha { display: flex; align-items: center; gap: 8px; }
.cp-alpha input[type='number'] { width: 60px; }
.cp-alpha input[type='range'] { flex: 1; height: 14px; border-radius: 7px; border: 1px solid #aaa; -webkit-appearance: none; appearance: none; }
.cp-alpha input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #fff; border: 2px solid #555; cursor: pointer; }
.cp-alpha input[type='range']::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; background: #fff; border: 2px solid #555; cursor: pointer; }

.row.toolbar span {
    padding: 0px 10px;
}
</style>
