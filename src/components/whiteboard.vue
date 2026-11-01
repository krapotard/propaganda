<script setup>
import { useVidaStore } from '@/vida/store.js'

const vStore = useVidaStore();
</script>

<template>
    <div style="height: 100%">
        <div class="whiteboard-tools">
            <b-button @click="$emit('undo')" size="is-small" icon-left="undo" outlined :disabled="!canUndo" title="Annuler (Ctrl+Z)" data-act="undo"></b-button>
            <b-button @click="$emit('redo')" size="is-small" icon-left="redo" outlined :disabled="!canRedo" title="Rétablir (Ctrl+Y)" data-act="redo"></b-button>
            <span style="display:inline-block;width:10px"></span>
            <span id="zoom-box">
                <input type="text" inputmode="decimal" data-act="zoom-input" :value="zoomText" title="Saisir un zoom en % puis Entrée"
                    style="width:62px;text-align:right;font:inherit;font-weight:bold;border:1px solid #ccc;border-radius:4px;padding:1px 4px;background:#fff"
                    @focus="editing = true" @blur="editing = false; apply($event.target)" @keydown.enter.prevent="$event.target.blur()" @keydown.esc.prevent="$event.target.value = zoomText; $event.target.blur()" />%
            </span>
            <b-button @click="vStore.zoomOut()" size="is-small" icon-left="minus" outlined></b-button>
            <b-button @click="vStore.zoomIn()" size="is-small" icon-left="plus" outlined></b-button>
            <b-button @click="vStore.zoomFit()" type="is-primary" size="is-small" icon-left="arrow-expand-all" outlined></b-button>
        </div>
        <div class="canvas-container pa-4">
            <div :id="id" width="0" height="0"></div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'whiteboard',
    props: {
        id: String,
        canUndo: { type: Boolean, default: false },
        canRedo: { type: Boolean, default: false },
        zoom: { type: Number, default: 0 },
    },
    data() {
        return { editing: false };
    },
    computed: {
        zoomText() {
            return (this.vStore.zoom * 100).toFixed(1);
        },
    },
    created() {
        this.vStore = useVidaStore();
    },
    methods: {
        apply(input) {
            this.vStore.setZoomPercent(input.value);
            input.value = this.zoomText;
        },
    },
    filters: {
        toFixed: (val, precision) => val.toFixed(precision),
    },
};
</script>

<style lang="scss">
.canvas-container {
    background: #eee;
    border: none;
    height: calc(100vh - 60px);
    canvas {
        background-image: linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(135deg, transparent 75%, #ccc 75%) !important;
        background-size: 25px 25px !important;
        background-position:
            0 0,
            12.5px 0,
            12.5px -12.5px,
            0px 12.5px !important;
        background-repeat: repeat !important;
    }
}

#whiteboard {
    background: #eee;
}

.whiteboard-tools {
    position: absolute;
    bottom: 20px;
    right: 20px;
    padding: 7px;
    border-radius: 30px;
    border: 1px #493711 solid;
    font-size: 20px;
    background-color: white;
    padding: 15px;
    box-shadow: 0 0 1em rgba(0, 0, 0, 0.1);
    display: flex;
    justify-content: center;
    align-items: center;
    border: none;
    z-index: 10;
}

.whiteboard-tools button {
    margin: 5px;
}

.whiteboard-tools #zoom-box {
    font-size: smaller;
    color: #333;
    font-weight: bold;
}
</style>
