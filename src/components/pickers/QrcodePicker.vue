<template>
    <div style="flex-grow: 1">
        <b-input id="qrcode-input-url" style="margin-top: 10px; margin-bottom: 10px" v-model="urlValue"></b-input>
        <p class="qr-label">Couleur du QR code</p>
        <color-picker v-model="colorValue" :dropColorEnabled="true" />
        <p class="qr-label">Couleur du fond</p>
        <color-picker v-model="backgroundColorValue" :dropColorEnabled="true" />

        <p class="qr-label">Marge autour du QR code</p>
        <b-slider v-model="marginValue" :min="0" :max="60" :tooltip="false" size="is-small" />
        <p class="qr-hint">Une marge de la couleur du fond aide les téléphones à lire le code.</p>

        <p class="qr-label">Style des points</p>
        <div class="qr-shapes">
            <button v-for="shape in bodyShapes" :key="'body-' + shape" type="button" class="qr-shape"
                :class="{ 'is-selected': (value.bodyShape || 'square') === shape }" :title="bodyNames[shape]"
                @click="$emit('input', { type: 'qrcode', bodyShape: shape })" v-html="preview('body', shape)"></button>
        </div>
        <p class="qr-label">Cadre des repères</p>
        <div class="qr-shapes">
            <button v-for="shape in frameShapes" :key="'frame-' + shape" type="button" class="qr-shape"
                :class="{ 'is-selected': (value.frameShape || 'square') === shape }" :title="frameNames[shape]"
                @click="$emit('input', { type: 'qrcode', frameShape: shape })" v-html="preview('frame', shape)"></button>
        </div>
        <p class="qr-label">Centre des repères</p>
        <div class="qr-shapes">
            <button v-for="shape in ballShapes" :key="'ball-' + shape" type="button" class="qr-shape"
                :class="{ 'is-selected': (value.ballShape || 'square') === shape }" :title="ballNames[shape]"
                @click="$emit('input', { type: 'qrcode', ballShape: shape })" v-html="preview('ball', shape)"></button>
        </div>

        <p class="qr-label">
            Couleur des repères
            <a v-if="value.eyeColor" role="button" class="qr-reset" @click="$emit('input', { type: 'qrcode', eyeColor: '' })">
                (comme le QR code)
            </a>
        </p>
        <color-picker v-model="eyeColorValue" :dropColorEnabled="true" />

        <b-checkbox v-model="gradientEnabled" class="qr-gradient">Dégradé de couleur</b-checkbox>
        <color-picker v-if="gradientEnabled" v-model="colorEndValue" :dropColorEnabled="true" />

        <p class="qr-hint">
            Les styles très originaux sont plus difficiles à lire : testez toujours votre QR code avec un téléphone avant
            d'imprimer, et gardez un fort contraste entre la couleur et le fond.
        </p>

        <p class="qr-label">Logo au centre</p>
        <symbol-picker v-model="symbolValue" :symbolPicker="true" :allowCustomPhoto="false" :allowEmptyImage="true" />
    </div>
</template>

<script>
import ColorPicker from '@/components/pickers/ColorPicker.vue';
import SymbolPicker from '@/components/pickers/SymbolPicker.vue';
import { QR_BODY_SHAPES, QR_FRAME_SHAPES, QR_BALL_SHAPES, qrShapePreview } from 'aktivisda-library';

export default {
    name: 'qrcode-picker',
    components: { ColorPicker, SymbolPicker },
    props: {
        value: {
            /* type: String, TODO fix me*/
            url: String,
            color: String,
            backgroundColor: String,
            symbol: {
                id: String,
                colors: { type: Object },
            },
        },
    },
    data: () => ({
        rerenderColorComponent: 0,
        bodyShapes: QR_BODY_SHAPES,
        frameShapes: QR_FRAME_SHAPES,
        ballShapes: QR_BALL_SHAPES,
        bodyNames: {
            square: 'Carrés',
            tiles: 'Carreaux espacés',
            rounded: 'Carrés arrondis',
            dots: 'Points',
            diamond: 'Losanges',
            vbars: 'Barres verticales',
            hbars: 'Barres horizontales',
        },
        frameNames: { square: 'Carré', rounded: 'Arrondi', leaf: 'Feuille', leaf2: 'Feuille inversée' },
        ballNames: { square: 'Carré', rounded: 'Arrondi', circle: 'Rond', leaf: 'Feuille' },
    }),
    methods: {
        preview: (kind, shape) => qrShapePreview(kind, shape),
    },
    computed: {
        marginValue: {
            get: function () {
                return this.value.margin || 0;
            },
            set: function (newValue) {
                if (newValue === this.marginValue) return;
                this.$emit('input', { type: 'qrcode', margin: newValue });
            },
        },
        eyeColorValue: {
            get: function () {
                return this.value.eyeColor || this.value.color;
            },
            set: function (newValue) {
                if (newValue === this.eyeColorValue) return;
                this.$emit('input', { type: 'qrcode', eyeColor: newValue });
            },
        },
        gradientEnabled: {
            get: function () {
                return !!this.value.colorEnd && this.value.colorEnd !== this.value.color;
            },
            set: function (enabled) {
                const fallback = (this.value.color || '').toLowerCase() === '#c30c07' ? '#1d1c1d' : '#c30c07';
                this.$emit('input', { type: 'qrcode', colorEnd: enabled ? fallback : '' });
            },
        },
        colorEndValue: {
            get: function () {
                return this.value.colorEnd;
            },
            set: function (newValue) {
                if (newValue === this.value.colorEnd) return;
                this.$emit('input', { type: 'qrcode', colorEnd: newValue });
            },
        },
        symbolValue: {
            get: function () {
                return this.value.symbol;
            },
            set: function (newValue) {
                if (newValue === this.value.symbol) return;
                this.$emit('input', { type: 'qrcode', symbol: newValue });
            },
        },
        urlValue: {
            get: function () {
                return this.value.url;
            },
            set: function (newValue) {
                if (newValue === this.value.url) return;
                this.$emit('input', { type: 'qrcode', url: newValue });
            },
        },
        colorValue: {
            get: function () {
                return this.value.color;
            },
            set: function (newValue) {
                if (newValue === this.value.color) return;
                this.$emit('input', { type: 'qrcode', color: newValue });
            },
        },
        backgroundColorValue: {
            get: function () {
                return this.value.backgroundColor;
            },
            set: function (newValue) {
                if (newValue === this.value.backgroundColor) return;
                this.$emit('input', { type: 'qrcode', backgroundColor: newValue });
            },
        },
    },
};
</script>

<style scoped>
.qr-label {
    margin: 14px 0 4px;
    font-weight: 600;
    text-align: left;
}
.qr-hint {
    margin-top: 6px;
    font-size: 0.8em;
    color: #666;
    text-align: left;
}
.qr-reset {
    font-weight: 400;
    font-size: 0.85em;
}
.qr-shapes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}
.qr-shape {
    width: 52px;
    height: 52px;
    padding: 4px;
    background: #f5f5f5;
    border: 2px solid transparent;
    border-radius: 6px;
    color: #1d1c1d;
    cursor: pointer;
}
.qr-shape:hover {
    border-color: #c30c07;
}
.qr-shape.is-selected {
    border-color: #c30c07;
    background: #fbe9e8;
}
.qr-shape >>> svg {
    width: 100%;
    height: 100%;
    display: block;
}
.qr-gradient {
    margin-top: 14px;
}
</style>
