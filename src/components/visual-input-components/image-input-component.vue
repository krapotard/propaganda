<script setup>
import { useVidaStore} from '@/vida/store.js'

const vStore = useVidaStore();
</script>

<template>
    <div class="input-components image-input-components">
        <template v-if="!isUndefined">
            <component-toolbar :componentId="componentId"
                @remove="removeComponent" @forward="++zIndexValue" @backward="--zIndexValue"
                @duplicate="$emit('duplicate')" @undo="$emit('undo')" @redo="$emit('redo')"
                :forwardEnabled="options.zIndex < nbComponents" :backwardEnabled="options.zIndex > 1"
                :zIndexRule="rule('zIndex')" :presenceRule="rule('presence')" :unicityRule="rule('unicity')" />

            <rule-picker v-if="!inTranslationMode" tipPosition="is-bottom" labelI18nKey="SELF" :value="rule('self')"
                @input="(r) => $emit('update', { rules: { self: r } })" :number="false" />
            <rule-picker v-if="!inTranslationMode" tipPosition="is-bottom" labelI18nKey="ZINDEX" :value="rule('zIndex')"
                @input="(r) => $emit('update', { rules: { zIndex: r } })" :number="false" />
            <rule-picker v-if="!inTranslationMode" tipPosition="is-bottom" labelI18nKey="UNICITY"
                :value="rule('unicity')" @input="(r) => $emit('update', { rules: { unicity: r } })" :number="false" />
            <rule-picker v-if="!inTranslationMode" tipPosition="is-bottom" labelI18nKey="PRESENCE"
                :value="rule('presence')" @input="(r) => $emit('update', { rules: { presence: r } }) "
                :number="false" />

            <template v-if="!rule('self').fixed">
                <picker-container :label="$t('COMMON.IMAGE')" :rule="rule('image')">
                    <template v-slot:enabled-switch>
                        <rule-picker v-if="!inTranslationMode" tipPosition="is-left" :value="rule('image')"
                            @input="(r) => $emit('update', { rules: { image: r } }) " :number="false" />
                    </template>
                    <template v-slot:pickers>
                        <image-picker :value="optionValue('image')" @input="(e) => emitValue('image')(e)"
                            :resettable="inTranslationMode" :defaultValue="options.image" />
                    </template>
                </picker-container>

                <picker-container v-if="isPhoto" label="Photo">
                    <template v-slot:pickers>
                        <div class="photo-tools">
                            <b-button icon-left="crop" :disabled="!canCrop" @click="openCrop">
                                {{ hasCrop ? 'Modifier le recadrage' : 'Recadrer' }}
                            </b-button>
                            <p class="photo-tool-label">Inclinaison horizontale : {{ skewXValue }}°</p>
                            <b-slider v-model="skewXValue" :min="-45" :max="45" :tooltip="false" size="is-small" />
                            <p class="photo-tool-label">Inclinaison verticale : {{ skewYValue }}°</p>
                            <b-slider v-model="skewYValue" :min="-45" :max="45" :tooltip="false" size="is-small" />
                            <b-button v-if="skewXValue !== 0 || skewYValue !== 0" size="is-small" type="is-text"
                                @click="resetSkew">Redresser la photo</b-button>
                        </div>
                    </template>
                </picker-container>

                <picker-container v-if="canMirror" label="Miroir">
                    <template v-slot:pickers>
                        <div class="photo-tools mirror-tools">
                            <b-button icon-left="flip-horizontal" :type="options.flipX ? 'is-primary' : ''"
                                @click="$emit('update', { flipX: !options.flipX })">Horizontal</b-button>
                            <b-button icon-left="flip-vertical" :type="options.flipY ? 'is-primary' : ''"
                                @click="$emit('update', { flipY: !options.flipY })">Vertical</b-button>
                        </div>
                    </template>
                </picker-container>

                <picker-container :label="$t('COMMON.SIZE')" :rule="rule('size')">
                    <template v-slot:enabled-switch>
                        <rule-picker v-if="!inTranslationMode" tipPosition="is-left" :value="rule('size')"
                            @input="(r) => $emit('update', { rules: { size: r } }) " :number="true" />
                    </template>
                    <template v-slot:pickers>
                        <number-picker :min="0" :max="200" :value="optionValue('scale')" unit="%"
                            :prepend="$t('COMMON.SMALL')" :append="$t('COMMON.BIG')" :rule="rule('scale')"
                            @input="(e) => emitValue('scale')(e)" :resettable="inTranslationMode" />
                    </template>
                </picker-container>

                <position-picker :width="vStore.document.width" :height="vStore.document.height" :value="optionValue('position')"
                    :rule="rule('position') " @updateRule="(r) => $emit('update', { rules: { position: r } }) "
                    @input="(e) => emitValue('position')(e) " :resettable="inTranslationMode" />

                <picker-container :label="$t('COMMON.ANGLE')">
                    <template v-slot:enabled-switch>
                        <rule-picker v-if="!inTranslationMode" tipPosition="is-left" :value="rule('angle')"
                            @input="(r) => $emit('update', { rules: { angle: r } }) " :number="true" />
                    </template>
                    <template v-slot:pickers>
                        <number-picker :rule="rule('angle')" :min="-180" :max="180" :value="optionValue('angle')"
                            unit="°" :prepend="'-180°'" :append="'+180°'" @input="(e) => emitValue('angle')(e)"
                            :resettable="inTranslationMode" />
                    </template>
                </picker-container>
            </template>
        </template>
    </div>
</template>

<script>
import ImagePicker from '@/components/pickers/ImagePicker.vue';
import PositionPicker from '@/components/pickers/PositionPicker.vue';
import NumberPicker from '@/components/pickers/NumberPicker.vue';
import PickerContainer from '@/components/pickers/PickerContainer.vue';
import ComponentToolbar from '@/components/pickers/ComponentToolbar.vue';
import CropModal from '@/components/pickers/CropModal.vue';
import { useVidaStore as useVidaStoreForCrop } from '@/vida/store.js';
import RulePicker from '@/components/pickers/RulePicker.vue';

import _get from 'lodash.get'
import _set from 'lodash.set'

export default {
    name: 'image-input-component',
    components: { ImagePicker, PositionPicker, NumberPicker, PickerContainer, ComponentToolbar, RulePicker },
    props: {
        componentId: String,
        fieldLabel: String,
        type: String, // internalsvg or qrcode
        // TODO add values validators
        options: {
            image: Object,
            scale: { type: Number, default: 10 },
            position: {
                x: { type: Number, default: 1 },
                y: { type: Number, default: 1 },
            },
            angle: { type: Number, default: 0 },
            zIndex: { type: Number, default: 1 },
        },
        nbComponents: { type: Number, defalut: 1 },
        editingLang: Object
    },
    data() {
        return { skew: { x: Math.round(this.options.skewX || 0), y: Math.round(this.options.skewY || 0) } };
    },
    computed: {
        isPhoto() {
            const type = _get(this.options, 'image.type');
            return type === 'urlphoto' || type === 'internalphoto';
        },
        canMirror() {
            return _get(this.options, 'image.type') !== 'qrcode';
        },
        canCrop() {
            return _get(this.options, 'image.type') === 'urlphoto' && !!_get(this.options, 'image.url');
        },
        hasCrop() {
            return !!_get(this.options, 'image.crop.width');
        },
        skewXValue: {
            get() {
                return this.skew.x;
            },
            set(value) {
                this.skew.x = value;
                this.$emit('update', { skewX: value });
            },
        },
        skewYValue: {
            get() {
                return this.skew.y;
            },
            set(value) {
                this.skew.y = value;
                this.$emit('update', { skewY: value });
            },
        },
        zIndexValue: {
            get() {
                return this.options.zIndex;
            },
            set(newValue) {
                newValue = Math.max(newValue, 1);
                newValue = Math.min(newValue, this.nbComponents);
                if (newValue === this.options.zIndex) return;
                this.$emit('update', { zIndex: newValue });
                this.options.zIndex = newValue;
            },
        },
        optionValue: function () {
            if (!this.inTranslationMode) {
                return (key) => _get(this.options, key);
            } else {
                return (key) => _get(this.options.i18n[this.editingLang.code], key);
            }
        },
        isUndefined: function () {
            return Object.keys(this.options).length === 1;
        },
        rule: function () {
            return (key) => { let r = _get(this.options.rules, key); return r === undefined ? {} : r };
        },
        inTranslationMode: function () {
            return this.editingLang != undefined;
        },
    },
    methods: {
        resetSkew() {
            this.skew = { x: 0, y: 0 };
            this.$emit('update', { skewX: 0, skewY: 0 });
        },
        openCrop() {
            const doc = useVidaStoreForCrop().document;
            this.$buefy.modal.open({
                parent: this,
                component: CropModal,
                hasModalCard: true,
                trapFocus: true,
                canCancel: ['escape'],
                props: {
                    url: this.options.image.url,
                    crop: this.options.image.crop,
                    documentRatio: doc && doc.width && doc.height ? doc.width / doc.height : undefined,
                },
                events: {
                    apply: (crop, natural) => this.applyCrop(crop, natural, doc),
                },
            });
        },
        // Après un recadrage, on ajuste l'échelle pour que les pixels gardent la même taille à l'écran
        applyCrop(crop, natural, doc) {
            const previous = this.options.image.crop;
            const size = (c) => ({
                width: (c && c.width ? c.width : 1) * natural.width,
                height: (c && c.height ? c.height : 1) * natural.height,
            });
            const ratio = (s) => Math.max(doc.width / s.width, doc.height / s.height);
            const scale = (this.options.scale * ratio(size(previous))) / ratio(size(crop));
            this.$emit('update', { image: { crop: crop || {} }, scale: Math.min(Math.max(scale, 1), 2000) });
        },
        removeComponent() {
            // TODO confirm box ? Oui en attendant le undo/redo
            this.$emit('remove');
        },
        emitValue: function (key) {
            // Todo check if we don’t emit this.options.value
            return (newValue) => {
                const _key = this.inTranslationMode ? `i18n.${this.editingLang.code}.${key}` : key;
                this.$emit('update', _set({}, _key, newValue));
            }
        },

    },
};
</script>

<style scoped>
.photo-tools {
    text-align: left;
}
.mirror-tools .button { margin-right: 6px; }
.photo-tool-label {
    margin: 12px 0 4px;
    font-size: 0.9em;
}
</style>
