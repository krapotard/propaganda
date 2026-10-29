<template>
    <div class="geometry-picker">
        <p class="label is-small">{{ $t('SHAPES.LABEL') }}</p>
        <div class="buttons has-addons shape-buttons">
            <b-button
                v-for="kind in kinds"
                :key="kind.id"
                size="is-small"
                :type="isKind(kind.id) ? 'is-primary' : ''"
                :icon-left="kind.icon"
                :title="$t('SHAPES.' + kind.id.toUpperCase())"
                :data-shape="kind.id"
                @click="selectKind(kind.id)">
                {{ $t('SHAPES.' + kind.id.toUpperCase()) }}
            </b-button>
        </div>

        <!-- Rectangle & ellipse -->
        <template v-if="shape === 'rect' || shape === 'ellipse'">
            <b-field :label="$t('SHAPES.RATIO')" class="shape-field">
                <b-slider :min="0.2" :max="5" :step="0.1" :value="ratio" :tooltip="true" size="is-small"
                    :custom-formatter="(v) => v.toFixed(1)" @change="(v) => emit({ ratio: v })" />
            </b-field>
            <b-button size="is-small" class="shape-square" @click="emit({ ratio: 1 })">{{ $t('SHAPES.SQUARE') }}</b-button>
        </template>
        <b-field v-if="shape === 'rect'" :label="$t('SHAPES.ROUNDING')" class="shape-field">
            <b-slider :min="0" :max="100" :value="cornerRadius" :tooltip="true" size="is-small"
                @change="(v) => emit({ cornerRadius: v })" />
        </b-field>

        <!-- Polygon -->
        <b-field v-if="shape === 'polygon'" :label="$t('SHAPES.SIDES')" class="shape-field">
            <b-slider :min="3" :max="30" :step="1" :value="sides" :tooltip="true" size="is-small"
                @change="(v) => emit({ sides: v })" />
        </b-field>

        <!-- Star -->
        <template v-if="shape === 'star'">
            <b-field :label="$t('SHAPES.POINTS')" class="shape-field">
                <b-slider :min="3" :max="30" :step="1" :value="points" :tooltip="true" size="is-small"
                    @change="(v) => emit({ points: v })" />
            </b-field>
            <b-field :label="$t('SHAPES.DEPTH')" class="shape-field">
                <b-slider :min="10" :max="95" :step="1" :value="Math.round(innerRatio * 100)" :tooltip="true" size="is-small"
                    @change="(v) => emit({ innerRatio: v / 100 })" />
            </b-field>
        </template>

        <!-- Randomness (polygon & star) -->
        <template v-if="shape === 'polygon' || shape === 'star'">
            <b-field :label="$t('SHAPES.IRREGULARITY')" class="shape-field">
                <b-slider :min="0" :max="100" :step="1" :value="irregularity" :tooltip="true" size="is-small"
                    @change="(v) => emit({ irregularity: v })" />
            </b-field>
            <b-button size="is-small" icon-left="dice-multiple" class="shape-random" :disabled="irregularity === 0"
                @click="newSeed">
                {{ $t('SHAPES.RANDOMIZE') }}
            </b-button>
        </template>

        <!-- Fill -->
        <div class="shape-section">
            <b-switch :value="hasFill" size="is-small" class="shape-switch" @input="(v) => emit({ fill: v ? lastFill : 'none' })">
                {{ $t('SHAPES.FILL') }}
            </b-switch>
            <color-picker v-if="hasFill" :value="fill" :alphaEnabled="true" :dropColorEnabled="true" @input="(c) => { lastFill = c; emit({ fill: c }); }" />
        </div>

        <!-- Border -->
        <div class="shape-section">
            <b-switch :value="border" size="is-small" class="shape-switch" @input="(v) => emit({ border: v })">
                {{ $t('SHAPES.BORDER') }}
            </b-switch>
            <template v-if="border">
                <color-picker :value="stroke" :alphaEnabled="true" :dropColorEnabled="true" @input="(c) => emit({ stroke: c })" />
                <b-field :label="$t('SHAPES.BORDER_WIDTH')" class="shape-field">
                    <b-slider :min="1" :max="40" :step="1" :value="strokeWidth" :tooltip="true" size="is-small"
                        @change="(v) => emit({ strokeWidth: v })" />
                </b-field>
            </template>
        </div>
    </div>
</template>

<script>
import ColorPicker from '@/components/pickers/ColorPicker.vue';

export default {
    name: 'geometry-picker',
    components: { ColorPicker },
    props: {
        value: { type: Object, default: () => ({}) },
    },
    data() {
        return {
            kinds: [
                { id: 'rect', icon: 'rectangle-outline' },
                { id: 'ellipse', icon: 'circle-outline' },
                { id: 'triangle', icon: 'triangle-outline' },
                { id: 'polygon', icon: 'hexagon-outline' },
                { id: 'star', icon: 'star-outline' },
            ],
            // Remembers the fill color while "no fill" is selected
            lastFill: this.value.fill && this.value.fill !== 'none' ? this.value.fill : '#cc0000',
        };
    },
    computed: {
        shape() { return this.value.shape || 'rect'; },
        sides() { return this.value.sides === undefined ? 5 : this.value.sides; },
        points() { return this.value.points === undefined ? 5 : this.value.points; },
        innerRatio() { return this.value.innerRatio === undefined ? 0.45 : this.value.innerRatio; },
        irregularity() { return this.value.irregularity === undefined ? 0 : this.value.irregularity; },
        ratio() { return this.value.ratio === undefined ? 1 : this.value.ratio; },
        cornerRadius() { return this.value.cornerRadius === undefined ? 0 : this.value.cornerRadius; },
        fill() { return this.value.fill || '#cc0000'; },
        hasFill() { return this.value.fill !== 'none'; },
        border() { return this.value.border === true; },
        stroke() { return this.value.stroke || '#000000'; },
        strokeWidth() { return this.value.strokeWidth === undefined ? 8 : this.value.strokeWidth; },
    },
    methods: {
        emit(partial) {
            this.$emit('input', { type: 'geometry', ...partial });
        },
        isKind(id) {
            if (id === 'triangle') return this.shape === 'polygon' && this.sides === 3;
            if (id === 'polygon') return this.shape === 'polygon' && this.sides !== 3;
            return this.shape === id;
        },
        selectKind(id) {
            switch (id) {
                case 'rect':
                case 'ellipse':
                case 'star':
                    this.emit({ shape: id });
                    break;
                case 'triangle':
                    this.emit({ shape: 'polygon', sides: 3 });
                    break;
                case 'polygon':
                    this.emit({ shape: 'polygon', sides: this.sides === 3 ? 6 : this.sides });
                    break;
            }
        },
        newSeed() {
            this.emit({ seed: Math.floor(Math.random() * 1000000) + 1 });
        },
    },
};
</script>

<style scoped>
.geometry-picker { margin-top: 10px; }
.shape-buttons { margin-bottom: 14px; flex-wrap: wrap; }
.shape-field { margin: 14px 8px 18px; }
.shape-field >>> .label { font-size: 0.85rem; font-weight: 600; margin-bottom: 6px; }
.shape-square, .shape-random { margin: 0 0 8px 8px; }
.shape-section { margin-top: 14px; padding-top: 10px; border-top: 1px solid #eee; }
.shape-switch { margin-bottom: 8px; }
</style>
