<script setup>
import { useStore } from '@datastore';
const store = useStore();

store.fetchTemplates();
store.fetchBackgrounds();
store.fetchImages();
store.fetchFormats();
const listOf = (id) => ({ templates: store.templates, backgrounds: store.backgrounds, illustrations: store.images })[id] || [];
</script>

<template>
    <div class="editor-library" :class="{ 'is-closed': !current }">
        <nav class="library-rail" aria-label="Bibliothèque">
            <button
                v-for="tab in tabs"
                :key="tab.id"
                type="button"
                class="rail-button"
                :class="{ 'is-active': current === tab.id }"
                :disabled="disabled"
                @click="toggle(tab.id)">
                <b-icon :icon="tab.icon" size="is-medium" />
                <span>{{ tab.label }}</span>
            </button>
            <div class="rail-spacer"></div>
            <a v-for="link in links" :key="link.name" class="rail-button rail-link" :href="linkHref(link)" target="_blank" rel="noopener">
                <b-icon :icon="link.icon" size="is-medium" />
                <span>{{ link.label }}</span>
            </a>
        </nav>

        <section v-if="current" class="library-panel">
            <header class="panel-head">
                <h2>{{ currentTab.title }}</h2>
            </header>

            <b-input
                v-if="currentTab.searchable"
                v-model="search"
                class="panel-search"
                icon="magnify"
                placeholder="Rechercher…"
                size="is-small"
                clearable />

            <div v-if="currentTab.searchable && tagsIn(listOf(current)).length" class="tag-chips">
                <button
                    v-for="tag in tagsIn(listOf(current))"
                    :key="tag"
                    type="button"
                    class="tag-chip"
                    :class="{ 'is-active': activeTag === tag }"
                    @click="activeTag = activeTag === tag ? '' : tag">
                    {{ tagLabel(tag) }}
                </button>
            </div>

            <div class="panel-body">
                <!-- Modèles -->
                <div v-if="current === 'templates'" class="tiles">
                    <button
                        v-for="element in filtered(store.templates)"
                        :key="element.id"
                        type="button"
                        class="tile"
                        :title="labelOf(element)"
                        @click="$emit('template', element.id)">
                        <img :src="store.imageThumbnail(element.id, 'templates')" :alt="labelOf(element)" loading="lazy" />
                        <span>{{ labelOf(element) }}</span>
                    </button>
                    <p v-if="!filtered(store.templates).length" class="empty">Aucun modèle pour l'instant.</p>
                </div>

                <!-- Fonds -->
                <div v-else-if="current === 'backgrounds'" class="tiles">
                    <button
                        v-for="element in filtered(store.backgrounds)"
                        :key="element.id"
                        type="button"
                        class="tile"
                        :title="labelOf(element)"
                        @click="$emit('background', element)">
                        <img :src="store.imageThumbnail(element.id, 'backgrounds')" :alt="labelOf(element)" loading="lazy" />
                        <span>{{ labelOf(element) }}</span>
                    </button>
                    <p v-if="!filtered(store.backgrounds).length" class="empty">Aucun fond pour l'instant.</p>
                </div>

                <!-- Illustrations -->
                <div v-else-if="current === 'illustrations'">
                    <div class="tiles">
                    <button
                        v-for="element in filtered(store.images)"
                        :key="element.id"
                        type="button"
                        class="tile"
                        :title="labelOf(element)"
                        @click="$emit('illustration', element)">
                        <img :src="store.imageThumbnail(element.id, 'images')" :alt="labelOf(element)" loading="lazy" />
                        <span>{{ labelOf(element) }}</span>
                    </button>
                    <p v-if="!filtered(store.images).length" class="empty">Aucune illustration pour l'instant.</p>
                    </div>
                </div>

                <!-- Importer -->
                <div v-else-if="current === 'import'" class="actions">
                    <b-upload accept=".jpeg,.jpg,.png,.webp" drag-drop expanded @input="(file) => file && $emit('photo', file)">
                        <div class="upload-zone">
                            <b-icon icon="image-plus" size="is-large" />
                            <p>Glisse une image ici ou clique pour la choisir</p>
                            <p class="hint">JPG, PNG ou WebP. Elle reste sur ton ordinateur : rien n'est envoyé sur Internet.</p>
                        </div>
                    </b-upload>
                    <p class="hint">Une fois l'image ajoutée, tu peux la recadrer et l'incliner dans le panneau de droite.</p>
                </div>

                <!-- Vecteezy : banque d'images externe, séparée de la bibliothèque maison -->
                <div v-else-if="current === 'vecteezy'" class="vecteezy-panel">
                    <p class="vz-badge">Banque d'images externe : Vecteezy</p>
                    <p v-if="vz.state === 'loading'" class="hint">Connexion à Vecteezy…</p>
                    <p v-else-if="vz.state === 'off'" class="hint">Vecteezy n'est pas activé sur ce serveur (clé API non installée).</p>
                    <template v-else>
                        <form class="vz-form" @submit.prevent="vzSearch(1)">
                            <b-input v-model="vz.term" placeholder="Rechercher (ex. poing, manifestation)…" size="is-small" icon="magnify" />
                            <div class="vz-types">
                                <button v-for="t in vzTypes" :key="t.id" type="button" class="vz-type" :class="{ 'is-active': vz.type === t.id }" @click="vz.type = t.id; vzSearch(1)">{{ t.label }}</button>
                            </div>
                        </form>
                        <p class="hint">Chaque image utilisée compte pour 1 sur {{ vz.max }} par mois ({{ vz.used }} utilisées). Une mention « Contient des images vecteezy.com » est ajoutée au visuel.</p>
                        <p v-if="vz.error" class="vz-error">{{ vz.error }}</p>
                        <div class="tiles">
                            <button v-for="item in vz.items" :key="item.id" type="button" class="tile" :title="item.title" :disabled="vz.busy" @click="vzUse(item)">
                                <img :src="item.thumb" :alt="item.title" loading="lazy" />
                                <span>{{ item.title }}</span>
                            </button>
                        </div>
                        <p v-if="vz.busy" class="hint">Un instant…</p>
                        <button v-if="vz.page < vz.lastPage" type="button" class="action" :disabled="vz.busy" @click="vzSearch(vz.page + 1)">Voir plus de résultats</button>
                        <p v-if="vz.searched && !vz.items.length && !vz.error && !vz.busy" class="empty">Aucun résultat.</p>
                    </template>
                </div>

                <!-- Dessin -->
                <div v-else-if="current === 'draw'" class="actions draw-panel">
                    <template v-if="!drawing">
                        <p class="hint">Dessine à main levée sur le visuel. À la fin, ton dessin devient une image que tu peux déplacer, agrandir, tourner ou incliner.</p>
                        <button type="button" class="action" @click="startDraw">
                            <b-icon icon="draw" size="is-small" /> Commencer à dessiner
                        </button>
                    </template>
                    <template v-else>
                        <div class="draw-tools">
                            <button v-for="t in drawTools" :key="t.id" type="button" class="draw-tool" :class="{ 'is-active': draw.tool === t.id }" @click="draw.tool = t.id" :title="t.hint">
                                <b-icon :icon="t.icon" size="is-medium" />
                                <span>{{ t.label }}</span>
                            </button>
                        </div>
                        <div v-if="draw.tool !== 'eraser'" class="draw-colors">
                            <button v-for="c in drawColors" :key="c" type="button" class="draw-color" :class="{ 'is-active': draw.color === c }" :style="{ background: c }" :aria-label="c" @click="draw.color = c"></button>
                            <input type="color" v-model="draw.color" class="draw-color-input" title="Autre couleur" />
                        </div>
                        <label class="draw-size">Taille : {{ draw.size }}
                            <input type="range" min="2" max="80" v-model.number="draw.size" />
                        </label>
                        <div class="draw-buttons">
                            <button type="button" class="action" :disabled="!strokes" @click="$emit('draw-undo')">
                                <b-icon icon="undo" size="is-small" /> Annuler le dernier trait
                            </button>
                            <button type="button" class="action" :disabled="!strokes" @click="$emit('draw-clear')">
                                <b-icon icon="delete-outline" size="is-small" /> Tout effacer
                            </button>
                            <button type="button" class="action action-primary" @click="finishDraw">
                                <b-icon icon="check" size="is-small" /> Terminer le dessin
                            </button>
                            <button type="button" class="action" @click="cancelDraw">Abandonner</button>
                        </div>
                    </template>
                </div>

                <!-- Texte -->
                <div v-else-if="current === 'text'" class="actions">
                    <button type="button" class="action action-title" @click="$emit('text', 'title')">Ajouter un titre</button>
                    <button type="button" class="action action-body" @click="$emit('text', 'body')">Ajouter un texte</button>
                </div>

                <!-- QR code -->
                <div v-else-if="current === 'shapes'" class="actions">
                    <p class="hint">Choisis une forme : elle s'ajoute au visuel. Couleur, opacité, bordure et hasard se règlent ensuite dans le panneau de droite.</p>
                    <button v-for="s in shapeKinds" :key="s.id" type="button" class="action" @click="$emit('shape', s.id)">
                        <b-icon :icon="s.icon" size="is-small" /> {{ s.label }}
                    </button>
                </div>

                <div v-else-if="current === 'qrcode'" class="actions">
                    <p class="hint">Un QR code s'ajoute au visuel. Saisis ensuite l'adresse du lien dans le panneau de droite.</p>
                    <button type="button" class="action" @click="$emit('qrcode')">
                        <b-icon icon="qrcode" size="is-small" /> Ajouter un QR code
                    </button>
                </div>

                <!-- Taille -->
                <div v-else-if="current === 'formats'" class="formats">
                    <button
                        v-for="format in store.formats"
                        :key="format.id"
                        type="button"
                        class="format"
                        :class="{ 'is-current': format.id === currentFormat }"
                        @click="$emit('format', format)">
                        <span class="format-shape" :style="shapeStyle(format)"></span>
                        <span class="format-label">{{ labelOf(format) }}</span>
                    </button>
                </div>
            </div>
        </section>
    </div>
</template>

<script>
export default {
    name: 'editor-library',
    props: {
        disabled: { type: Boolean, default: false },
        currentFormat: { type: String, default: undefined },
    },
    data() {
        return {
            current: (() => { try { return localStorage.getItem('aktivisda-drawer-left') === 'closed' ? null : 'templates'; } catch (e) { return 'templates'; } })(),
            lastTab: 'templates',
            search: '',
            activeTag: '',
            tabs: [
                { id: 'templates', label: 'Modèles', title: 'Modèles', icon: 'view-dashboard-outline', searchable: true },
                { id: 'backgrounds', label: 'Fonds', title: 'Fonds', icon: 'image-filter-hdr', searchable: true },
                { id: 'illustrations', label: 'Éléments', title: 'Illustrations', icon: 'shape-outline', searchable: true },
                { id: 'import', label: 'Importer', title: 'Importer une image', icon: 'cloud-upload-outline', searchable: false },
                { id: 'vecteezy', label: 'Vecteezy', title: 'Vecteezy (externe)', icon: 'image-search-outline', searchable: false },
                { id: 'draw', label: 'Dessin', title: 'Dessin', icon: 'brush', searchable: false },
                { id: 'shapes', label: 'Formes', title: 'Formes', icon: 'shape-plus-outline', searchable: false },
                { id: 'text', label: 'Texte', title: 'Texte', icon: 'format-title', searchable: false },
                { id: 'qrcode', label: 'QR code', title: 'QR code', icon: 'qrcode', searchable: false },
                { id: 'formats', label: 'Taille', title: 'Taille du visuel', icon: 'aspect-ratio', searchable: false },
            ],
            shapeKinds: [
                { id: 'rect', label: 'Rectangle', icon: 'rectangle-outline' },
                { id: 'ellipse', label: 'Cercle / ellipse', icon: 'circle-outline' },
                { id: 'triangle', label: 'Triangle', icon: 'triangle-outline' },
                { id: 'polygon', label: 'Polygone', icon: 'hexagon-outline' },
                { id: 'star', label: 'Étoile', icon: 'star-outline' },
            ],
            vz: { state: 'idle', term: '', type: 'png', items: [], page: 1, lastPage: 1, used: 0, max: 450, busy: false, error: '', searched: false },
            vzTypes: [
                { id: 'png', label: 'PNG détourés' },
                { id: 'photo', label: 'Photos' },
                { id: 'svg', label: 'Vecteurs' },
            ],
            drawing: false,
            strokes: 0,
            draw: { tool: 'pencil', color: '#1d1c1d', size: 10 },
            drawTools: [
                { id: 'pencil', label: 'Crayon', icon: 'lead-pencil', hint: 'Trait fin et net' },
                { id: 'brush', label: 'Pinceau', icon: 'brush', hint: 'Trait large aux bords doux' },
                { id: 'spray', label: 'Aérosol', icon: 'spray', hint: 'Pulvérisation : reste appuyé pour densifier' },
                { id: 'eraser', label: 'Gomme', icon: 'eraser', hint: 'Efface le dessin en cours' },
            ],
            drawColors: ['#1d1c1d', '#ffffff', '#c30c07', '#f8e501'],
            links: [
                { name: 'colors', label: 'Couleurs', icon: 'palette-outline' },
                { name: 'fonts', label: 'Polices', icon: 'format-font' },
                { name: 'qrcode', label: 'Créer un QR', icon: 'qrcode-scan' },
            ],
        };
    },
    computed: {
        currentTab() {
            return this.tabs.find((t) => t.id === this.current) || {};
        },
    },
    methods: {
        vzUrl(query) {
            return process.env.BASE_URL + 'vecteezy/api.php?' + new URLSearchParams(query).toString();
        },
        async vzStatus() {
            this.vz.state = 'loading';
            try {
                const r = await fetch(this.vzUrl({ action: 'status' }));
                const d = await r.json();
                if (!d.enabled) return (this.vz.state = 'off');
                this.vz.used = d.used;
                this.vz.max = d.max;
                this.vz.state = 'on';
            } catch (e) {
                this.vz.state = 'off';
            }
        },
        async vzSearch(page) {
            if (!this.vz.term.trim()) return;
            this.vz.busy = true;
            this.vz.error = '';
            try {
                const r = await fetch(this.vzUrl({ action: 'search', term: this.vz.term.trim(), type: this.vz.type, page }));
                const d = await r.json();
                if (!r.ok) throw new Error(d.error || 'Erreur');
                this.vz.items = page === 1 ? d.items : this.vz.items.concat(d.items);
                this.vz.page = d.page;
                this.vz.lastPage = d.last_page;
                this.vz.searched = true;
            } catch (e) {
                this.vz.error = e.message;
            }
            this.vz.busy = false;
        },
        async vzUse(item) {
            const fileType = this.vz.type === 'photo' ? 'jpg' : this.vz.type;
            this.vz.busy = true;
            this.vz.error = '';
            try {
                const r = await fetch(this.vzUrl({ action: 'use', id: item.id, file_type: fileType }));
                if (!r.ok) throw new Error((await r.json()).error || 'Erreur');
                const blob = await r.blob();
                this.vz.used++;
                this.$emit('vecteezy', blob);
            } catch (e) {
                this.vz.error = e.message;
            }
            this.vz.busy = false;
        },
        startDraw() {
            this.drawing = true;
            this.strokes = 0;
            this.$emit('draw-start', this.draw);
        },
        finishDraw() {
            this.$emit('draw-finish');
        },
        cancelDraw() {
            this.$emit('draw-cancel');
        },
        // appelé par l'éditeur
        drawEnded() {
            this.drawing = false;
            this.strokes = 0;
        },
        // ouvert dans un nouvel onglet : le visuel en cours n'est pas perdu
        linkHref(link) {
            return this.$router.resolve({ name: link.name, params: { lang: this.$i18n.locale } }).href;
        },
        // tiroir : replie ou rouvre le panneau, la barre d'icônes reste toujours visible
        toggleDrawer() {
            if (this.current) {
                this.lastTab = this.current;
                this.current = null;
            } else {
                this.current = this.lastTab || 'templates';
            }
        },
        toggle(id) {
            this.current = this.current === id ? null : id;
            this.search = '';
            this.activeTag = '';
            this.$nextTick(() => this.$emit('resize'));
        },
        labelOf(element) {
            if (element.localLabel) return element.localLabel;
            const label = element.label;
            if (typeof label === 'string') return label;
            if (label) return label.fr || label[Object.keys(label)[0]] || '';
            return '';
        },
        tagsOf(element) {
            return (element.tags || '')
                .split(',')
                .map((t) => t.trim().toLowerCase())
                .filter(Boolean);
        },
        tagLabel(tag) {
            return tag.charAt(0).toUpperCase() + tag.slice(1);
        },
        tagsIn(list) {
            const all = new Set();
            (list || []).forEach((e) => this.tagsOf(e).forEach((t) => all.add(t)));
            return [...all].sort((a, b) => a.localeCompare(b, 'fr'));
        },
        filtered(list) {
            const q = this.search.trim().toLowerCase();
            if (!list) return [];
            return list.filter((e) => {
                if (this.activeTag && !this.tagsOf(e).includes(this.activeTag)) return false;
                if (!q) return true;
                return this.labelOf(e).toLowerCase().includes(q) || this.tagsOf(e).some((t) => t.includes(q));
            });
        },
        shapeStyle(format) {
            const max = 44;
            const ratio = format.width / format.height;
            const width = ratio >= 1 ? max : Math.round(max * ratio);
            const height = ratio >= 1 ? Math.round(max / ratio) : max;
            return { width: `${width}px`, height: `${height}px` };
        },
    },
    watch: {
        draw: {
            deep: true,
            handler(value) {
                this.$emit('draw-settings', value);
            },
        },
        current: {
            immediate: true,
            handler(value) {
                this.$emit('panel', !!value);
                try { localStorage.setItem('aktivisda-drawer-left', value ? 'open' : 'closed'); } catch (e) { /* stockage indisponible */ }
                if (value === 'vecteezy' && this.vz.state === 'idle') this.vzStatus();
                this.$nextTick(() => this.$emit('resize'));
            },
        },
    },
};
</script>

<style lang="scss">
$rail: 76px;
$panel: 320px;
$cgt-red: #c30c07;
$cgt-dark: #1d1c1d;

.editor-library {
    position: fixed;
    top: 52px;
    bottom: 0;
    left: 0;
    z-index: 5;
    display: flex;
    text-align: left;

    .library-rail {
        width: $rail;
        background: $cgt-dark;
        display: flex;
        flex-direction: column;
        padding: 8px 0;
        overflow-y: auto;
    }

    .rail-spacer {
        flex: 1;
    }
    .rail-link {
        text-decoration: none;
        border-top: 1px solid #333;
    }
    .panel-subtitle {
        font-weight: 700;
        margin: 14px 0 8px;
    }
    .insert-image {
        width: 100%;
        margin-bottom: 8px;
    }

    .rail-button {
        background: transparent;
        border: 0;
        color: #d8d8d8;
        font-family: inherit;
        font-size: 12px;
        padding: 10px 4px 8px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        border-left: 4px solid transparent;
        transition: background 0.12s ease;

        &:hover:not(:disabled) {
            background: #333;
            color: #fff;
        }
        &.is-active {
            background: #333;
            color: #fff;
            border-left-color: #f8e501;
        }
        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }
    }

    .library-panel {
        width: $panel;
        box-sizing: border-box;
        background: #fff;
        border-right: 1px solid #ddd;
        display: flex;
        flex-direction: column;
        min-height: 0;
    }

    .panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 8px;

        h2 {
            font-size: 18px;
            font-weight: 700;
            color: $cgt-dark;
        }
    }

    .panel-close {
        background: #f2f2f2;
        border: 0;
        border-radius: 50%;
        width: 28px;
        height: 28px;
        cursor: pointer;
        &:hover {
            background: #e4e4e4;
        }
    }

    .tag-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0 16px 10px;
    }
    .tag-chip {
        border: 1px solid #d8d8d8;
        background: #fff;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        cursor: pointer;
        color: #333;
        &.is-active {
            background: #c30c07;
            border-color: #c30c07;
            color: #fff;
        }
    }
    .panel-search {
        padding: 0 16px 8px;
        .control.has-icons-left .input {
            padding-left: 2.25em;
        }
    }

    .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 16px 24px;
    }

    .tiles {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 10px;
    }

    .tile {
        background: #f5f5f5;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 6px;
        cursor: pointer;
        font-family: inherit;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        &:hover {
            border-color: $cgt-red;
        }
        img {
            width: 100%;
            height: 110px;
            object-fit: contain;
        }
        span {
            font-size: 12px;
            color: #444;
            line-height: 1.2;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .actions {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .action {
        background: #f5f5f5;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 14px;
        cursor: pointer;
        font-family: inherit;
        color: $cgt-dark;
        text-align: left;
        &:hover {
            border-color: $cgt-red;
        }
    }
    .upload-zone {
        text-align: center;
        padding: 28px 12px;
        border: 2px dashed #bbb;
        border-radius: 8px;
        cursor: pointer;
        color: #444;
        &:hover {
            border-color: $cgt-red;
        }
    }
    .action-primary {
        background: $cgt-red;
        color: #fff;
    }
    .action:disabled {
        opacity: 0.45;
        cursor: not-allowed;
    }
    .draw-panel {
        .draw-tools {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .draw-tool {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            background: #f5f5f5;
            border: 2px solid transparent;
            border-radius: 8px;
            padding: 8px 4px;
            cursor: pointer;
            font-family: inherit;
            &:hover,
            &.is-active {
                border-color: $cgt-red;
            }
        }
        .draw-colors {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .draw-color {
            width: 30px;
            height: 30px;
            border-radius: 50%;
            border: 2px solid #bbb;
            cursor: pointer;
            &.is-active {
                border-color: $cgt-red;
                box-shadow: 0 0 0 2px #fff inset;
            }
        }
        .draw-color-input {
            width: 34px;
            height: 34px;
            padding: 0;
            border: 0;
            background: none;
            cursor: pointer;
        }
        .draw-size {
            display: flex;
            flex-direction: column;
            gap: 4px;
            font-size: 14px;
        }
        .draw-buttons {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
    }
    .vz-badge {
        background: #1d1c1d;
        color: #f8e501;
        font-weight: 700;
        font-size: 12px;
        padding: 6px 10px;
        border-radius: 6px;
        margin-bottom: 10px;
    }
    .vz-types {
        display: flex;
        gap: 6px;
        margin-top: 8px;
    }
    .vz-type {
        border: 2px solid transparent;
        background: #f5f5f5;
        border-radius: 16px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
        font-family: inherit;
        &.is-active,
        &:hover {
            border-color: $cgt-red;
        }
    }
    .vz-error {
        color: $cgt-red;
        font-size: 13px;
        margin-bottom: 8px;
    }
    .action-title {
        font-size: 28px;
        font-weight: 700;
    }
    .action-body {
        font-size: 16px;
    }

    .hint,
    .empty {
        font-size: 13px;
        color: #666;
        margin-bottom: 8px;
    }

    .formats {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .format {
        display: flex;
        align-items: center;
        gap: 12px;
        background: #f5f5f5;
        border: 2px solid transparent;
        border-radius: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-family: inherit;
        text-align: left;
        &:hover,
        &.is-current {
            border-color: $cgt-red;
        }
    }
    .format-shape {
        background: $cgt-red;
        border-radius: 2px;
        flex: 0 0 auto;
    }
    .format-label {
        font-size: 14px;
        color: $cgt-dark;
    }
}
</style>
