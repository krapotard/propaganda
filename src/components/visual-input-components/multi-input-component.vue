<template>
    <div class="input-components multi-input-components" data-multi-panel="1">
        <picker-container label="Sélection multiple">
            <template v-slot:pickers>
                <p :style="textStyle" data-multi-count="1">{{ info.count }} éléments sélectionnés<template v-if="info.oneGroup"> (groupés)</template></p>
                <p :style="hintStyle">Flèches du clavier : déplacer (Maj = par 10 px). Maj + clic : ajouter ou retirer un élément. Maj + glisser sur une zone vide : cadre de sélection.</p>
                <div :style="rowStyle">
                    <b-button size="is-small" type="is-primary" data-act="group" :disabled="info.count < 2 || info.oneGroup" title="Grouper (Ctrl+G)" @click="$emit('group')">Grouper</b-button>
                    <b-button size="is-small" data-act="ungroup" :disabled="info.grouped === 0" title="Dégrouper (Ctrl+Maj+G)" @click="$emit('ungroup')">Dégrouper</b-button>
                    <b-button size="is-small" type="is-danger" outlined data-act="remove" title="Supprimer la sélection" @click="$emit('remove')">Supprimer</b-button>
                </div>
            </template>
        </picker-container>

        <picker-container label="Aligner">
            <template v-slot:pickers>
                <div :style="rowStyle">
                    <span :style="labelStyle">Relativement à :</span>
                    <b-select size="is-small" v-model="relativeTo" data-act="relative">
                        <option value="page">Page</option>
                        <option value="selection">Sélection</option>
                        <option value="first">Premier sélectionné</option>
                        <option value="last">Dernier sélectionné</option>
                    </b-select>
                </div>
                <div :style="rowStyle">
                    <button v-for="b in alignX" :key="'ax' + b.mode" type="button" :style="btnStyle" :title="b.title" :data-act="'align-x-' + b.mode" @click="$emit('align', 'x', b.mode, relativeTo)" v-html="icon('alignx', b.mode)"></button>
                </div>
                <div :style="rowStyle">
                    <button v-for="b in alignY" :key="'ay' + b.mode" type="button" :style="btnStyle" :title="b.title" :data-act="'align-y-' + b.mode" @click="$emit('align', 'y', b.mode, relativeTo)" v-html="icon('aligny', b.mode)"></button>
                </div>
            </template>
        </picker-container>

        <picker-container label="Distribuer">
            <template v-slot:pickers>
                <p v-if="info.count < 3" :style="hintStyle">Il faut au moins trois éléments sélectionnés pour les répartir.</p>
                <div :style="rowStyle">
                    <button v-for="b in distX" :key="'dx' + b.mode" type="button" :style="btnStyle" :disabled="info.count < 3" :title="b.title" :data-act="'dist-x-' + b.mode" @click="$emit('distribute', 'x', b.mode)" v-html="icon('distx', b.mode)"></button>
                </div>
                <div :style="rowStyle">
                    <button v-for="b in distY" :key="'dy' + b.mode" type="button" :style="btnStyle" :disabled="info.count < 3" :title="b.title" :data-act="'dist-y-' + b.mode" @click="$emit('distribute', 'y', b.mode)" v-html="icon('disty', b.mode)"></button>
                </div>
            </template>
        </picker-container>
    </div>
</template>

<script>
import PickerContainer from '@/components/pickers/PickerContainer.vue';

// Icônes 24x24 dans l'esprit des panneaux d'alignement d'Inkscape (formes pleines, trait rouge = repère)
const BAR = '#1d1c1d';
const MARK = '#c30c07';
const r = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="${BAR}"/>`;
const l = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MARK}" stroke-width="2" stroke-linecap="round"/>`;
const svg = (body) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${body}</svg>`;
const flip = (body) => svg(`<g transform="translate(24 0) rotate(90)">${body}</g>`);

// Alignement horizontal (axe x) : le dessin est tourné de 90° pour l'axe y
const alignDraw = {
    start: l(3, 3, 3, 21) + r(5, 6, 14, 4) + r(5, 14, 9, 4),
    center: l(12, 3, 12, 21) + r(5, 6, 14, 4) + r(7.5, 14, 9, 4),
    end: l(21, 3, 21, 21) + r(5, 6, 14, 4) + r(10, 14, 9, 4),
};
const distDraw = {
    start: r(3, 5, 4, 14) + r(10, 8, 4, 8) + r(17, 6, 4, 12) + l(3, 22, 3, 22.01) + l(10, 22, 10, 22.01) + l(17, 22, 17, 22.01),
    center: r(3, 5, 4, 14) + r(10, 8, 4, 8) + r(17, 6, 4, 12) + l(5, 22, 5, 22.01) + l(12, 22, 12, 22.01) + l(19, 22, 19, 22.01),
    end: r(3, 5, 4, 14) + r(10, 8, 4, 8) + r(17, 6, 4, 12) + l(7, 22, 7, 22.01) + l(14, 22, 14, 22.01) + l(21, 22, 21, 22.01),
    gap: r(2, 5, 4, 14) + r(10, 8, 4, 8) + r(18, 6, 4, 12) + l(6.5, 12, 9.5, 12) + l(14.5, 12, 17.5, 12),
};

export default {
    name: 'multi-input-component',
    components: { PickerContainer },
    props: {
        info: { type: Object, default: () => ({ count: 0, grouped: 0, oneGroup: false }) },
    },
    data() {
        return {
            relativeTo: 'page',
            alignX: [
                { mode: 'start', title: 'Aligner les bords gauches' },
                { mode: 'center', title: 'Centrer sur un axe vertical' },
                { mode: 'end', title: 'Aligner les bords droits' },
            ],
            alignY: [
                { mode: 'start', title: 'Aligner les bords supérieurs' },
                { mode: 'center', title: 'Centrer sur un axe horizontal' },
                { mode: 'end', title: 'Aligner les bords inférieurs' },
            ],
            distX: [
                { mode: 'start', title: 'Répartir les bords gauches à intervalles réguliers' },
                { mode: 'center', title: 'Répartir les centres horizontalement à intervalles réguliers' },
                { mode: 'end', title: 'Répartir les bords droits à intervalles réguliers' },
                { mode: 'gap', title: 'Répartir des écarts égaux horizontalement' },
            ],
            distY: [
                { mode: 'start', title: 'Répartir les bords supérieurs à intervalles réguliers' },
                { mode: 'center', title: 'Répartir les centres verticalement à intervalles réguliers' },
                { mode: 'end', title: 'Répartir les bords inférieurs à intervalles réguliers' },
                { mode: 'gap', title: 'Répartir des écarts égaux verticalement' },
            ],
            // styles en ligne : la feuille de style de l'instance n'est pas rechargée par les mises à jour
            textStyle: { margin: '0 0 6px', fontWeight: 'bold' },
            hintStyle: { margin: '0 0 8px', fontSize: '12px', color: '#666', lineHeight: '1.35' },
            labelStyle: { fontSize: '13px', marginRight: '8px' },
            rowStyle: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', marginBottom: '8px' },
            btnStyle: { width: '38px', height: '34px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0', border: '1px solid #c8c8c8', borderRadius: '6px', background: '#fff', cursor: 'pointer' },
        };
    },
    methods: {
        icon(kind, mode) {
            if (kind === 'alignx') return svg(alignDraw[mode]);
            if (kind === 'aligny') return flip(alignDraw[mode]);
            if (kind === 'distx') return svg(distDraw[mode]);
            return flip(distDraw[mode]);
        },
    },
};
</script>
