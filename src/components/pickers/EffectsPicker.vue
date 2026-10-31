<template>
    <picker-container label="Effets">
        <template v-slot:pickers>
            <div class="effects-picker" style="text-align: left">
                <div class="effects-label" style="margin: 10px 0 2px; font-size: 0.9em">Opacité : {{ opacityPct }} %</div>
                <b-slider size="is-small" :tooltip="false" :min="0" :max="100" v-model="opacityPct"
                    @change="(v) => $emit('update', { opacity: v / 100 })" />
                <div class="effects-label" style="margin: 10px 0 2px; font-size: 0.9em">Flou : {{ blurValue }}</div>
                <b-slider size="is-small" :tooltip="false" :min="0" :max="100" v-model="blurValue"
                    @change="(v) => $emit('update', { blur: v })" />
                <b-button v-if="opacityPct !== 100 || blurValue !== 0" size="is-small" type="is-text"
                    @click="reset">Supprimer les effets</b-button>
            </div>
        </template>
    </picker-container>
</template>

<script>
import PickerContainer from '@/components/pickers/PickerContainer.vue';

export default {
    name: 'effects-picker',
    components: { PickerContainer },
    props: { options: { type: Object, default: () => ({}) } },
    data() {
        return {
            opacityPct: Math.round((typeof this.options.opacity === 'number' ? this.options.opacity : 1) * 100),
            blurValue: Math.round(this.options.blur || 0),
        };
    },
    methods: {
        reset() {
            this.opacityPct = 100;
            this.blurValue = 0;
            this.$emit('update', { opacity: 1, blur: 0 });
        },
    },
};
</script>
