<script setup>
import { useStore } from '@datastore';
import { useVidaStore } from '@/vida/store.js';

const store = useStore();
store.fetchTemplates();
store.fetchConfig();
</script>

<template>
    <div>
        <vida-navbar compact>
            <template v-slot:import>
                <vida-import-menu :disabled="isLoading || isExporting" @input="importFileTemplate" />
            </template>
            <template v-slot:export>
                <vida-export-menu :disabled="isLoading || isExporting" :templateId="templateId" :advanced="true" />
            </template>
        </vida-navbar>
        <section class="editor" :style="{ '--left-w': leftWidth + 'px', '--right-w': rightWidth + 'px' }">
            <vida-editor-library ref="library" @panel="(v) => (panelOpen = v)" :disabled="isLoading || isExporting" :currentFormat="cacheDocument.format"
                @template="chooseTemplate" @background="chooseBackground" @illustration="addIllustration"
                @text="addText" @photo="importPhoto" @vecteezy="useVecteezy" @qrcode="createComponent('qrcode')" @shape="addShape" @format="chooseFormat"
                @draw-start="startDrawing" @draw-settings="(v) => (drawSettings = { ...v })" @draw-undo="$refs.drawing && $refs.drawing.undo()"
                @draw-clear="$refs.drawing && $refs.drawing.clear()" @draw-finish="finishDrawing" @draw-cancel="stopDrawing"
                @resize="handleResize" />
            <drawing-overlay v-if="drawingActive" ref="drawing" :vida="vida" :settings="drawSettings" :zoom="vidaStore.zoom"
                @change="(n) => $refs.library && ($refs.library.strokes = n)" />
            <b-loading :is-full-page="true" :active="isLoading || isExporting" class="primary-loading"></b-loading>
            <button type="button" class="drawer-handle is-left" :style="{ left: leftWidth + 'px' }" :title="panelOpen ? 'Replier le panneau' : 'Ouvrir le panneau'" :aria-label="panelOpen ? 'Replier le panneau' : 'Ouvrir le panneau'" @click="$refs.library.toggleDrawer(); $nextTick(() => handleResize())"><span class="dots"></span></button>
            <button type="button" class="drawer-handle is-right" :style="{ right: rightWidth + 'px' }" :title="rightOpen ? 'Replier le panneau de droite' : 'Ouvrir le panneau de droite'" :aria-label="rightOpen ? 'Replier le panneau de droite' : 'Ouvrir le panneau de droite'" @click="toggleDrawer('right')"><span class="dots"></span></button>
            <aside class="options-sidebar" v-show="rightOpen">
                <!-- <div>
							<b-tooltip :label="$t('BUTTONS.UNDO')" style='padding: 0px 3px'>
								<b-button icon @click='$emit("undo")' size='is-small' icon-left="undo" :disabled='true'></b-button>
							</b-tooltip>
							<b-tooltip :label="$t('BUTTONS.REDO')" style='padding: 0px 3px'>
								<b-button icon @click='$emit("redo")' size='is-small' icon-left="redo" :disabled='true'></b-button>
							</b-tooltip>

							<vida-export-menu :advanced='false'/>

						</div> -->

                <nav class="navbar is-spaced" v-if="!isLoading && ($isBacktivisda || availableLocales.size > 1)">
                    <div class="navbar-brand toolbar">
                        <b-dropdown v-if="$isBacktivisda && !isLoading" append-to-body aria-role="list"
                            :max-height="500" scrollable trap-focus>
                            <template #trigger>
                                <a class="navbar-item" role="button">
                                    <b-icon size="is-small" icon="translate"></b-icon>
                                    <span v-if="inTranslationMode">{{ editingLang.flag }}</span>
                                </a>
                            </template>
                            <template v-if="inTranslationMode">
                                <b-dropdown-item @click="updateEditingLang(undefined)">
                                    🇫🇷 {{ $t('ADMIN.TRANSLATIONS.DEACTIVATE_MODE')}}
                                </b-dropdown-item>
                                <hr class="dropdown-divider" aria-role="menuitem" />
                            </template>
                            <b-dropdown-item
                                v-for="lang, key in store.langs.filter(({code}) => code != cacheDocument.i18n.defaultLocale)"
                                :key="key" @click="updateEditingLang(lang)"
                                :disabled="editingLang && lang.code === editingLang.code">
                                {{ lang.flag }} {{ lang.text }}
                            </b-dropdown-item>
                        </b-dropdown>
                        <b-dropdown v-if="!$isBacktivisda && !isLoading && availableLocales.size > 1" append-to-body
                            aria-role="list" :max-height="500" scrollable trap-focus>
                            <template #trigger>
                                <a class="navbar-item" role="button">
                                    <b-icon size="is-small" icon="translate"></b-icon>
                                    <span>{{ displayedLocale }}</span>
                                </a>
                            </template>
                            <b-dropdown-item v-for="lang, key in store.langs.filter(({code}) => availableLocales.has(code))"
                                :key="key" @click="updateDisplayedLocale(lang.code)"
                                :disabled="lang.code === displayedLocale">
                                {{ lang.flag }} {{ lang.text }}
                            </b-dropdown-item>
                            <hr />
                            <b-dropdown-item
                                @click="$buefy.dialog.alert($t('EDIT.TRANSLATIONS.HELP_MODAL', { email: store.config.email}))">
                                {{ $t('EDIT.TRANSLATIONS.HELP_CTA') }}
                            </b-dropdown-item>
                        </b-dropdown>


                    </div>
                </nav>
                <template v-if="!isLoading">
                    <span hidden id="document-id">{{ cacheDocument.id }}</span>
                    <b-message v-if="inTranslationMode" type="is-info" style="margin: 10px">
                        {{ $t('ADMIN.TRANSLATIONS.MESSAGE', { lang: editingLang.text }) }}
                    </b-message>


                    <vida-document-input-component v-if="selectedType === 'background'" :document="cacheDocument"
                        @update="updateDocument" :key="this.rerenderSelectedComponent" />
                    <vida-text-input-component v-else-if="selectedType === 'text'" :componentId="selectedComponent"
                        :width="cacheDocument.width" :height="cacheDocument.height" :options="selectedComponentOptions"
                        @update="(opts) => updateComponent(selectedComponent, opts)"
                        @remove="() => removeComponent(selectedComponent)"
                        @duplicate="() => duplicateComponent(selectedComponent)"
                        @undo="() => undoComponent(selectedComponent)" @redo="() => redoComponent(selectedComponent) "
                        :nbComponents="nbComponents" :editingLang="editingLang" :key="this.rerenderSelectedComponent" />

                    <vida-image-input-component v-else-if="selectedType === 'image'" :componentId="selectedComponent"
                        :options="selectedComponentOptions" @update="(opts) => updateComponent(selectedComponent, opts)"
                        @remove="() => removeComponent(selectedComponent)"
                        @duplicate="() => duplicateComponent(selectedComponent)"
                        @undo="() => undoComponent(selectedComponent) " @redo="() => redoComponent(selectedComponent) "
                        :nbComponents="nbComponents" :editingLang="editingLang" :key="this.rerenderSelectedComponent" />
                </template>
            </aside>
            <vida-whiteboard class="editor-whiteboard" id="whiteboard" />
        </section>
    </div>
</template>

<script>
import LZString from 'lz-string';

import { extractBestTranslation, generateId, compressImage, buildShape } from 'aktivisda-library';

import VidaWhiteboard from '@/components/whiteboard.vue';
import VidaNavbar from '@navbar';
import VidaEditorLibrary from '@/components/editor-library.vue';
import DrawingOverlay from '@/components/drawing-overlay.vue';

import { uriToJSON, showSnackbarOnRedirection } from '@/plugins/utils.js';

import { pdfMakeFonts, fontsLoaded } from '@/plugins/font-loader.js';

import VidaDocumentInputComponent from '@/components/visual-input-components/document-input-component.vue';
import VidaTextInputComponent from '@/components/visual-input-components/text-input-component.vue';
import VidaImageInputComponent from '@/components/visual-input-components/image-input-component.vue';
import VidaExportMenu from '@/components/exportmenu.vue';
import VidaImportMenu from '@/components/importmenu.vue';


import { isMobile } from '@/plugins/is-mobile.js';
import { DEFAULT_LOCALE } from "@/plugins/i18n-utils.js";

import _get from 'lodash.get'


// Tiroirs latéraux : l'état (ouvert ou replié) est retenu d'une visite à l'autre
function drawerState(side) {
    try {
        return localStorage.getItem('aktivisda-drawer-' + side) !== 'closed';
    } catch (e) {
        return true;
    }
}

export default {
    name: 'editor',
    metaInfo: function () {
        return {
            title: 'Propaganda|' + this.store.config.id,
            titleTemplate: '%s',
            meta: [
                { vmid: 'description', name: 'description', content: `${this.templateDescription}. | Propaganda, basé sur Aktivisda.` },
                { property: 'og:title', vmid: 'og:title', content: 'Propaganda|' + this.store.config.id },
                { property: 'og:type', vmid: 'og:type', content: 'website' },
                { property: 'og:url', vmid: 'og:url', content: this.store.config.url },
                { property: 'og:image', vmid: 'og:image', content: this.templatePreview },
                { property: 'og:description', vmid: 'og:description', content: `${this.templateDescription}. | Propaganda` },
                { property: 'og:site_name', vmid: 'og:site_name', content: "Propaganda|" + this.store.config.id },
            ],
        };
    },

    components: {
        VidaWhiteboard,
        VidaNavbar,
        VidaEditorLibrary,
        DrawingOverlay,
        VidaDocumentInputComponent,
        VidaTextInputComponent,
        VidaImageInputComponent,
        VidaExportMenu,
        VidaImportMenu,
    },
    data: function () {
        return {
            cacheDocument: {},
            cacheEmojis: {},
            cacheImage: {},
            cacheTexts: {},
            hasChanged: false,
            isExporting: false,
            isLoading: true,
            rerenderEmojisList: 0,
            rerenderImagesList: 0,
            rerenderSelectedComponent: 0,
            rerenderTextsList: 0,
            selectedComponent: undefined, // Id
            selectedComponentOptions: {},
            store: useStore(),
            templateId: this.$route.params.templateId,
            editingLang: null,
            displayedLocale: undefined,// TODO does not work if locale is broken
            vidaStore: useVidaStore(),
            rightOpen: drawerState('right'),
            panelOpen: true,
            drawingActive: false,
            drawSettings: { tool: 'pencil', color: '#1d1c1d', size: 10 },
        };
    },
    computed: {
        leftWidth() {
            return this.panelOpen ? 396 : 76;
        },
        rightWidth() {
            return this.rightOpen ? 380 : 0;
        },
        vida: function () {
            return this.vidaStore.vida;
        },
        locale: function() {
            return this.vidaStore.locale;
        },
        advanced: function () {
            return false || this.$route.query.advanced == 'true';
        },
        templatePreview: function () {
            if (this.templateId === undefined) return `${this.store.config.url}/static/rs-preview.png`;

            const previewUrl = this.store.imagePreview(this.templateId, 'templates');
            if (previewUrl === '' && !this.$isBacktivisda) console.error(`No image preview found for template ${this.templateId}`);

            return this.store.config.url + previewUrl;
        },
        templateDescription: function () {
            if (this.templateId === undefined) return '';
            const template = this.store.templates.find((temp) => temp.id === this.templateId);
            if (template == undefined) {
                if (!this.$isBacktivisda) console.error('No template description found, probably because you are using backtivisda?');
                return '';
            }
            return template.description;
        },
        inTranslationMode: function() {
            return this.editingLang != undefined;
        },
        selectedType: function () {
            if (this.selectedComponent === undefined) return 'background';
            if (Object.keys(this.cacheTexts).indexOf(this.selectedComponent) != -1) return 'text';
            if (Object.keys(this.cacheImage).indexOf(this.selectedComponent) != -1) return 'image';
            return 'background';
        },
        nbComponents: function () {
            this.rerenderImagesList; // for cache update
            this.rerenderTextsList; // for cache update
            return this.vida.nbComponents();
        },
        availableLocales() {
            if (this.loading) return new Set();
            return this.vida.computeAvailableLocales()
        },
        rule: function () {
            return (key) => { let r = _get(this.cacheDocument.rules, key); return r === undefined ? {} : r };
        },
    },
    methods: {
        toggleDrawer(side) {
            const key = 'rightOpen';
            this[key] = !this[key];
            try {
                localStorage.setItem('aktivisda-drawer-' + side, this[key] ? 'open' : 'closed');
            } catch (e) { /* stockage indisponible */ }
            // la zone de travail change de largeur : le visuel est recentré
            this.$nextTick(() => this.handleResize());
        },
        getTemplateJson: function () {
            return new Promise((resolve) => {
                this.store
                    .fetchTemplates()
                    .then(() => this.store.fetchBackgrounds())
                    .then(() => this.store.fetchImages())
                    .then(() => {
                        if (this.$router.currentRoute.query.b64Template) {
                            const b64Template = this.$router.currentRoute.query.b64Template;
                            const template = uriToJSON(LZString.decompressFromBase64(b64Template));
                            // Maybe only remove the template param
                            this.$router.replace({ query: {} });
                            resolve(template);
                            return;
                        } else if (this.$router.currentRoute.query.template) {
                            const template = uriToJSON(this.$router.currentRoute.query.template);
                            // Maybe only remove the template param
                            this.$router.replace({ query: {} });
                            resolve(template);
                            return;
                        }

                        if (this.templateId === undefined) {
                            resolve();
                            return;
                        }
                        this.store.fetchTemplate(this.templateId).then((template) => resolve(template));
                    });
            });
        },
        textPreview(txt) {
            if (txt === undefined) return;
            txt = txt.replaceAll('\n', ' ');
            if (txt.length === 0) return '...';
            if (txt.length < 20) return txt;
            return txt.slice(0, 20) + '...';
        },
        imagePreview(imageOptions) {
            switch (imageOptions.type) {
                case 'internalphoto':
                case 'internalsvg': {
                    return this.store.imagePreview(imageOptions.id, 'images');
                }
                case 'urlphoto': {
                    return imageOptions.url;
                }
                case 'qrcode':
                    return '/qrcode.png';
                case 'geometry':
                    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(buildShape(imageOptions).svg);
            }
        },
        handleResize() {
            // Handle resize is useless while vida is not loaded.
            if (!this.vida) return;
            this.vida.handleResize();
            },
        load(templateJson) {
            this.reset();
            return new Promise((resolve) => {
                this.isLoading = true;
                this.vida
                    .loadJson(templateJson)
                    .then(() => {
                        this.cacheDocument = this.vida.documentParams();
                        const has = {
                            'text': false,
                            'emoji': false,
                            'image': false,
                            'textchoice': false,
                        }
                        for (const key of this.vida.componentsKeys()) {
                            const options = this.vida.componentParams(key);
                            if (!this.$isBacktivisda && _get(options.rules, 'self.fixed') === true) {
                                continue;
                            }
                            has[options.type] = true;

                            if (options.type === 'text') {
                                this.cacheTexts[key] = this.textPreview(options.text);
                            } else if (options.type === 'textchoice') {
                                const vStore = useVidaStore();
                                this.cacheTexts[key] = this.textPreview(
                                    extractBestTranslation(options.textChoices[options.text], vStore.displayedOrEditingLang, DEFAULT_LOCALE));
                            } else if (options.type === 'image') {
                                this.cacheImage[key] = this.imagePreview(options.image);
                            } else if (options.type === 'emoji') {
                                this.cacheImage[key] = this.textPreview(options.text);
                            }
                        }
                        if (has['text']) ++this.rerenderTextsList;
                        if (has['textchoice']) ++this.rerenderTextsList;
                        if (has['emoji']) ++this.rerenderEmojisList;
                        if (has['image']) ++this.rerenderImagesList;
                        this.editingLang = !this.$isBacktivisda ? undefined : this.store.langs.find((lang) => lang.code === this.cacheDocument.i18n.editingLocale);

                        if (!this.$isBacktivisda) {
                            if (!this.availableLocales.has(this.$i18n.locale)) {
                                if (this.availableLocales.has('en'))
                                    this.displayedLocale = 'en';
                                else
                                    this.displayedLocale = this.cacheDocument.i18n.defaultLocale;
                            } else {
                                this.displayedLocale = this.$i18n.locale;
                            }

                            this.editingLang = undefined;
                        }

                        this.updateDocument(
                            {
                                i18n: {
                                    editingLocale: this.editingLang !== undefined ? this.editingLang.code : null,
                                    displayedLocale: this.displayedLocale
                                }
                            }
                        );


                        this.vida.onSelect = (id) => {
                            this.selectedComponent = id;
                            this.selectedComponentOptions = this.vida.componentParams(id);
                            ++this.rerenderSelectedComponent;
                        };

                        this.vida.onComponentUpdated = (id) => {
                            if (this.selectedComponent !== undefined && this.selectedComponent === id) {
                                this.selectedComponentOptions = this.vida.componentParams(id);
                                ++this.rerenderSelectedComponent;
                            }

                            this.updateCache(id);
                        };

                        this.vidaStore.zoomFit();
                        if (this.exportType(this.$route) !== undefined) {
                            this.isLoading = false;
                            this.exportVida(this.exportType(this.$route)).then(() => {
                                this.isExporting = false;

                                const templateId = this.templateIdGetter(this.$route);
                                if (!templateId) {
                                    this.$router.push({ name: 'editorNew', params: { templateId: undefined, lang: this.lang } });
                                } else {
                                    this.$router.push({ name: 'editor', params: { templateId: templateId, lang: this.lang } });
                                }
                                resolve();
                            });
                        } else {
                            resolve();
                            this.isLoading = false;
                        }
                    })
                    .catch((error) => {
                        this.$buefy.dialog.alert({
                            title: 'Erreur',
                            message: `Erreur inattendue dans le chargement du modèle.`,
                            type: 'is-danger',
                            hasIcon: true,
                            icon: 'times-circle',
                            iconPack: 'fa',
                            ariaRole: 'alertdialog',
                            ariaModal: true,
                            confirmText: "Aller sur la page d'accueil",
                            onConfirm: () => this.$router.push({ name: 'welcome' }),
                        });
                        console.error(error);
                        this.isLoading = false;
                        return;
                    });
            });
        },
        exportType(route) {
            if (route.params.exportType !== undefined) return route.params.exportType;

            if (route.params.templateId !== undefined) {
                const param = route.params.templateId;
                // TODO not the same for backtivisda and aktivisda
                if (
                    param === 'png' ||
                    param === 'pdf' ||
                    param === 'jpg' ||
                    param === 'template' ||
                    param === 'link' ||
                    (this.$isBacktivisda && param === 'database')
                )
                    return param;
            }
            return undefined;
        },
        templateIdGetter(route) {
            if (route.params.exportType !== undefined) return route.params.templateId;
            if (route.params.templateId !== undefined) {
                const param = route.params.templateId;
                if (
                    param === 'png' ||
                    param === 'pdf' ||
                    param === 'jpg' ||
                    param === 'template' ||
                    param === 'link' ||
                    (this.$isBacktivisda && param === 'database')
                )
                    return undefined;
            }
            return route.params.templateId;
        },
        reset() {
            if (this.vida) this.vida.destroy();
            this.isLoading = true;
            this.isExporting = false;
            this.hasChanged = false;
            this.vidaStore.setup('whiteboard');
            this.rerenderImagesList = 0;
            this.rerenderTextsList = 0;
            this.rerenderSelectedComponent = 0;
            this.cacheDocument = {};
            this.cacheTexts = {};
            this.cacheImage = {};
            this.selectedComponent = undefined;
            this.selectedComponentptions = {};
        },
        setup() {
            return new Promise((resolve) => {
                this.getTemplateJson().then((templateJson) => {
                    fontsLoaded().then(() => {
                        if (templateJson == undefined) {
                            this.reset();

                            // This is very ugly
                            // TODO: fixme
                            this.vida.randomInit().then(() => {

                                this.store.fetchBackgrounds().then(() => {
                                    const list = this.store.backgrounds;
                                    const randomIndex = Math.floor(Math.random() * list.length);
                                    const galleryItemId = list[randomIndex].id;
                                    const element = list.find((s) => s.id == galleryItemId);

                                    this.vida.updateDocument({ background: element }).then(() => {
                                        this.isLoading = false;
                                        this.load(this.vida.toJson())
                                        .then(() => resolve())
                                    });
                                });
                            });
                        } else {
                            this.load(templateJson).then(() => resolve());
                        }
                    });
                });
            });
        },
        updateDocument(options) {
            this.hasChanged = true;
            const rerender = options.rules !== undefined || _get(options, 'i18n.editingLocale') !== undefined;
            const fitCanvas = options.width !== undefined || options.height !== undefined;
            return new Promise((resolve) => {
                this.vida.updateDocument(options)
                .then(() => {
                    this.cacheDocument = this.vida.documentParams();
                    if (rerender) ++this.rerenderSelectedComponent;
                    if (fitCanvas) this.vidaStore.zoomFit()
                    resolve();
                })
            });
        },
        updateComponent(id, options) {
            this.hasChanged = true;
            const rerender = options.zIndex !== undefined
                || (options.image !== undefined && options.image.crop !== undefined)
                || (options.rules !== undefined && options.rules[Object.keys(options.rules)[0]].fixed !== undefined)
                || (this.editingLang !== undefined && _get(options.i18n[this.editingLang.code], 'text') === null)
                || (this.editingLang !== undefined && _get(options.i18n[this.editingLang.code], 'text') === '')
            this.vida.updateComponent(id, options).then(() => {
                if (this.selectedComponent === id && rerender) {
                    this.selectedComponentOptions = this.vida.componentParams(this.selectedComponent);
                    ++this.rerenderSelectedComponent;
                }
                this.updateCache(id);
            });
        },
        removeComponent(id) {
            this.hasChanged = true;
            this.vida.removeComponent(id);
            if (this.cacheImage[id]) {
                delete this.cacheImage[id];
                ++this.rerenderImagesList;
            } else if (this.cacheTexts[id]) {
                delete this.cacheTexts[id];
                ++this.rerenderTextsList;
            }
            if (this.selectedComponent === id) {
                this.selectedComponent = undefined;
            }
        },
        duplicateComponent(id) {
            this.hasChanged = true;
            const options = this.vida.componentParams(id);
            options.id = generateId();
            options.position.x *= 1.05;
            options.position.y *= 1.05;
            this.vida.createComponent(options).then(() => {
                if (options.type === 'text') {
                    this.cacheTexts[options.id] = this.textPreview(options.text);
                    ++this.rerenderTextsList;
                } else if (options.type === 'image') {
                    this.cacheImage[options.id] = this.imagePreview(options.image);
                    ++this.rerenderImagesList;
                } else if (options.type === 'emoji') {
                    this.cacheEmojis[options.id] = this.textPreview(options.text);
                    ++this.rerenderEmojisList;
                } else if (options.type === 'textchoice') {
                    this.cacheTexts[options.id] = this.cacheTexts[id];
                    ++this.rerenderTextsList;
                } else {
                    console.error(`Unknown type ${options.type}`)
                }
                this.vida.selectComponent(options.id);
            });
        },
        undoComponent(id) {
            this.hasChanged = true;
            this.vida.undoComponent(id);
            // TODO: rerender
        },
        redoComponent(id) {
            this.hasChanged = true;
            this.vida.redoComponent(id);
            // TODO: rerender
        },
        chooseTemplate(templateId) {
            this.$router.push({ name: 'editor', params: { lang: this.$i18n.locale, templateId } });
        },
        chooseBackground(element) {
            this.updateDocument({ background: { ...element, gallery: 'backgrounds', type: 'internalsvg' } }).then(() => {
                // le panneau de droite affiche les couleurs du nouveau fond seulement (sans celles de l'ancien)
                if (this.cacheDocument.background && element.colors) this.cacheDocument.background.colors = { ...element.colors };
                ++this.rerenderSelectedComponent;
            });
        },
        chooseFormat(format) {
            this.updateDocument({
                resolution: format.resolution,
                width: format.width,
                height: format.height,
                format: format.id,
            });
        },
        addIllustration(element) {
            this.hasChanged = true;
            this.vida.createRandomComponent('internalsvg').then((componentId) => {
                this.vida
                    .updateComponent(componentId, { image: { ...element, gallery: 'images', type: 'internalsvg' } })
                    .then(() => {
                        this.cacheImage[componentId] = this.imagePreview(this.vida.componentParams(componentId).image);
                        ++this.rerenderImagesList;
                        this.vida.selectComponent(componentId);
                    });
            });
        },
        // Photo importée : compressée dans le navigateur (rien n'est envoyé sur un serveur), puis ajoutée au visuel
        importPhoto(file, then) {
            const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
            const reader = new FileReader();
            const toast = this.$buefy.toast.open({ indefinite: true, message: 'Préparation de la photo…', type: 'is-black', position: 'is-bottom' });
            const finish = (dataUrl) => {
                const probe = new Image();
                probe.onload = () => {
                    toast.close();
                    this.addPhoto(dataUrl, probe.naturalWidth, probe.naturalHeight, then);
                };
                probe.onerror = () => {
                    toast.close();
                    this.$buefy.toast.open({ message: "Cette image n'a pas pu être lue.", type: 'is-danger' });
                };
                probe.src = dataUrl;
            };
            reader.onload = () => {
                if (file.type === 'image/webp') return finish(reader.result); // la compression ne gère que JPG et PNG
                compressImage(reader.result, mimeType, 75)
                    .then((r) => {
                        const blob = new Blob([r['resultData']], { type: mimeType });
                        const base64Reader = new FileReader();
                        base64Reader.onloadend = () => finish(base64Reader.result);
                        base64Reader.readAsDataURL(blob);
                    })
                    .catch(() => finish(reader.result));
            };
            reader.readAsDataURL(file);
        },
        // Image Vecteezy reçue du relais : PNG et photos passent par l'import ; les vecteurs sont transformés en PNG
        useVecteezy(blob) {
            const finish = (file) => {
                // la mention est ajoutée après l'image pour rester au-dessus
                this.importPhoto(file, () => this.addVecteezyCredit());
            };
            if (!/svg/.test(blob.type)) return finish(new File([blob], 'vecteezy', { type: blob.type || 'image/png' }));
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                const ratio = (img.naturalWidth || 1000) / (img.naturalHeight || 1000);
                const canvas = document.createElement('canvas');
                canvas.width = ratio >= 1 ? 2000 : Math.round(2000 * ratio);
                canvas.height = ratio >= 1 ? Math.round(2000 / ratio) : 2000;
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob((png) => finish(new File([png], 'vecteezy.png', { type: 'image/png' })), 'image/png');
            };
            img.onerror = () => this.$buefy.toast.open({ message: "Ce vecteur n'a pas pu être lu.", type: 'is-danger' });
            img.src = url;
        },
        // Mention exigée par la licence gratuite : ajoutée une seule fois, en bas du visuel (déplaçable ou supprimable)
        addVecteezyCredit() {
            const text = 'Contient des images vecteezy.com';
            if (Object.values(this.cacheTexts).some((t) => t && t.startsWith('Contient des images'))) return;
            const width = this.cacheDocument.width || 1000;
            const override = {
                text,
                font: 'Barlow Semi Condensed',
                color: '#ffffff',
                size: Math.max(10, Math.round(width * 0.016)),
                background: { mode: 'normal', color: '#1d1c1d', padding: 6 },
                position: { x: 0.5, y: 0.97 },
            };
            this.vida.createRandomComponent('text').then((componentId) => {
                this.vida.updateComponent(componentId, override).then(() => {
                    this.cacheTexts[componentId] = this.textPreview(text);
                    ++this.rerenderTextsList;
                });
            });
        },
        startDrawing(settings) {
            this.drawSettings = { ...settings };
            this.drawingActive = true;
        },
        stopDrawing() {
            this.drawingActive = false;
            if (this.$refs.library) this.$refs.library.drawEnded();
        },
        // Le dessin devient une image PNG transparente placée exactement là où il a été tracé
        finishDrawing() {
            const r = this.$refs.drawing && this.$refs.drawing.result();
            if (!r) {
                this.$buefy.toast.open({ message: "Rien n'a encore été dessiné.", type: 'is-warning' });
                return;
            }
            this.stopDrawing();
            this.hasChanged = true;
            const scale = 100 / (r.k * Math.max(r.docWidth / r.width, r.docHeight / r.height));
            this.vida.createRandomComponent('internalsvg').then((componentId) => {
                this.vida
                    .updateComponent(componentId, {
                        image: { type: 'urlphoto', url: r.dataUrl },
                        scale,
                        position: { x: r.centerX / r.docWidth, y: r.centerY / r.docHeight },
                    })
                    .then(() => {
                        this.cacheImage[componentId] = this.imagePreview(this.vida.componentParams(componentId).image);
                        ++this.rerenderImagesList;
                        this.vida.selectComponent(componentId);
                    });
            });
        },
        addPhoto(dataUrl, width, height, then) {
            this.hasChanged = true;
            const docWidth = this.cacheDocument.width || 1000;
            const docHeight = this.cacheDocument.height || 1000;
            // Échelle qui fait tenir toute la photo dans le visuel
            const scale = (100 * Math.min(docWidth / width, docHeight / height)) / Math.max(docWidth / width, docHeight / height);
            this.vida.createRandomComponent('internalsvg').then((componentId) => {
                this.vida
                    .updateComponent(componentId, { image: { type: 'urlphoto', url: dataUrl }, scale: Math.max(scale, 1) })
                    .then(() => {
                        this.cacheImage[componentId] = this.imagePreview(this.vida.componentParams(componentId).image);
                        ++this.rerenderImagesList;
                        this.vida.selectComponent(componentId);
                        if (then) then();
                    });
            });
        },
        addText(kind) {
            this.hasChanged = true;
            const isTitle = kind === 'title';
            const width = this.cacheDocument.width || 1000;
            const override = {
                text: isTitle ? 'Votre titre' : 'Votre texte',
                font: isTitle ? 'Barlow Semi Condensed Gras' : 'Barlow Semi Condensed',
                color: '#1d1c1d',
                size: Math.round(width * (isTitle ? 0.09 : 0.04)),
                background: { mode: 'disabled' },
            };
            this.vida.createRandomComponent('text').then((componentId) => {
                this.vida.updateComponent(componentId, override).then(() => {
                    this.cacheTexts[componentId] = this.textPreview(override.text);
                    ++this.rerenderTextsList;
                    this.vida.selectComponent(componentId);
                });
            });
        },
        addShape(kind) {
            const preset = kind === 'triangle' ? { shape: 'polygon', sides: 3 } : { shape: kind };
            this.createComponent('geometry', preset);
        },
        createComponent(type, extra) {
            this.hasChanged = true;
            const randomOverride = {};
            switch(type) {
                case 'text': {        // const font = fonts[Math.floor(Math.random() * fonts.length)];
                    randomOverride['text'] = this.$i18n.t('TEXTS.DEFAULT_TEXT');
                    const fonts = this.store.fonts;
                    randomOverride['font'] = fonts[Math.floor(Math.random() * fonts.length)].fontName;
                    randomOverride['color'] = this.store.randomElement('colors').html;
                    randomOverride['background'] = { 'color': this.store.randomElement('colors').html };
                    break;
                }
                case 'geometry': {
                    randomOverride['image'] = { type: 'geometry', fill: this.store.randomElement('colors').html, ...(extra || {}) };
                    break;
                }

            }
            this.vida.createRandomComponent(type).then((componentId) => {
                this.vida.updateComponent(componentId, randomOverride)
                .then(() => {
                    switch (type) {
                        case 'text': {
                            this.cacheTexts[componentId] = this.textPreview(this.vida.componentParams(componentId).text);
                            ++this.rerenderTextsList;
                            break;
                        }
                        case 'textchoice': {
                            const vStore = useVidaStore();
                            const options = this.vida.componentParams(componentId);
                            this.cacheTexts[componentId] = this.textPreview(
                                extractBestTranslation(options.textChoices[options.text], vStore.displayedOrEditingLang, DEFAULT_LOCALE));
                            ++this.rerenderTextsList;
                            break;
                        }
                        case 'image':
                        case 'internalsvg':
                        case 'internalphoto':
                        case 'geometry':
                        case 'qrcode': {
                            this.cacheImage[componentId] = this.imagePreview(this.vida.componentParams(componentId).image);
                            ++this.rerenderImagesList;
                            break;
                        }
                        case 'emoji': {
                            this.cacheEmojis[componentId] = this.textPreview(this.vida.componentParams(componentId).text);
                            ++this.rerenderEmojisList;
                        }
                    }
                    this.vida.selectComponent(componentId);
                });
            });
        },
        updateCache(id) {
            const options = this.vida.componentParams(id);
            if (options.type === 'text' || options.type === 'textchoice') {
                let preview = this.textPreview(options.text);
                if (options.type === 'textchoice') {
                    const vStore = useVidaStore();
                    if (options.text === undefined)
                        preview = '???';
                    else
                        preview = this.textPreview(
                            extractBestTranslation(options.textChoices[options.text], vStore.displayedOrEditingLang, DEFAULT_LOCALE));
                }

                if (preview !== this.cacheTexts[id]) {
                    this.cacheTexts[id] = preview;
                    ++this.rerenderTextsList;
                }
            } else if (options.type === 'image') {
                const preview = this.imagePreview(options.image);
                if (preview !== this.cacheImage[id]) {
                    this.cacheImage[id] = preview;
                    ++this.rerenderImagesList;
                }
            }
        },
        exportVida(format) {
            return new Promise((resolve, reject) => {
                if (this.isExporting || this.loading || !this.vida) {
                    reject();
                    return;
                }
                this.compressionToast = this.$buefy.toast.open({
                    indefinite: true,
                    message: `Export et compression en cours...`,
                    type: 'is-black',
                    position: 'is-bottom',
                });

                this.isExporting = true;
                switch (format) {
                    case 'pdf':
                        this.exportPdf().then(() => {
                            this.isExporting = false;
                            this.compressionToast.close();
                            resolve();
                        });
                        break;
                    case 'png':
                        this.exportImage('png').then(() => {
                            this.isExporting = false;
                            this.compressionToast.close();
                            resolve();
                        });
                        break;
                    case 'jpg':
                        this.exportImage('jpeg').then(() => {
                            this.$buefy.snackbar.open({
                                duration: 6000,
                                message: this.$t('EDIT.EXPORT.COMPRESSED_JPEG'),
                                type: 'is-danger',
                                cancelText: this.$t('BUTTONS.CANCEL'),
                                position: 'is-bottom',
                                actionText: null,
                            });
                            this.isExporting = false;
                            resolve();
                        });
                        break;
                    case 'template':
                        this.exportTemplate().then(() => {
                            this.hasChanged = false;
                            this.isExporting = false;
                            this.compressionToast.close();
                            resolve();
                        });
                        break;
                    case 'link':
                        this.exportLink().then(() => {
                            this.hasChanged = false;
                            this.compressionToast.close();
                            resolve();
                        });
                        break;
                    case 'database': {
                        this.exportDatabase()
                            .then(() => {
                                this.hasChanged = false;
                                this.compressionToast.close();
                                resolve();
                            })
                            .catch((err) => {
                                this.$buefy.snackbar.open({
                                    duration: 6000,
                                    message: `Erreur lors de la sauvegarde en base de données : ${err}. Vous pouvez écrire à dev@aktivisda.earth`,
                                    type: 'is-danger',
                                    cancelText: this.$t('BUTTONS.CANCEL'),
                                    position: 'is-bottom',
                                    actionText: null,
                                });
                                this.isExporting = false;
                                this.compressionToast.close();
                                reject();
                            });
                        break;
                    }
                    default:
                        this.isExporting = false;
                        console.warn('Export to ${format} is undefined');
                        reject();
                }
            });
        },
        exportImage(extension) {
            const mimeType = 'image/' + extension;

            return new Promise((resolve, reject) => {
                if (!this.vida) {
                    reject();
                    return;
                }

                const filename = `aktivisda-${this.vida.documentParams().id}.${extension}`;
                this.vida
                    .toImage(mimeType)
                    .then((url) => {
                        this.downloadUrl(url, filename);
                        resolve();
                    })
                    .catch((error) => reject(error));
            });
        },

        downloadUrl(url, filename) {
            const link = document.createElement('a');

            link.download = filename;
            link.href = url;
            document.body.appendChild(link);
            link.click();

            // // cleanup temporary elements
            document.body.removeChild(link);
        },

        exportTemplate() {
            this.warningExperimental();
            return new Promise((resolve) => {
                const str = JSON.stringify(this.vida.toJson(), null, 4);
                const bytes = new TextEncoder().encode(str);
                const blob = new Blob([bytes], {
                    type: 'application/json;charset=utf-8',
                });
                const url = window.URL.createObjectURL(blob);
                this.downloadUrl(url, this.vida.document.id + '.json');
                resolve();
            });
        },
        exportDatabase() {
            return new Promise((resolve, reject) => {
                if (!this.$isBacktivisda) reject();

                import('@/backtivisda/components/modaltemplate.vue').then((modaltemplate) => {
                    this.vida
                        .toImage('image/jpeg')
                        .then((jpegUrl) => {
                            this.isExporting = false;
                            this.$buefy.modal.open({
                                parent: this,
                                component: modaltemplate.default,
                                hasModalCard: true,
                                trapFocus: true,
                                width: 1080,
                                props: {
                                    json: this.vida.toJson(),
                                    jpegUrl,
                                    currentTemplateId: this.templateId,
                                },
                                events: {},
                                canCancel: true,
                                onCancel: () => {
                                    resolve();
                                },
                            });
                        })
                        .catch((error) => {
                            reject(error);
                        });
                });
            });
        },
        exportLink() {
            return new Promise((resolve) => {
                const link = this.store.config.url + 'edit' + this.vida.toLink();
                this.isExporting = false;
                this.$buefy.dialog.prompt({
                    message: `${this.$t('EDIT.EXPORT.CONFIRM_LINK')} <b-input value="${link}"></b-input>`,
                    inputAttrs: {
                        type: 'text',
                        value: link,
                    },
                    onConfirm: () => {
                        if (!navigator.clipboard) return;
                        navigator.clipboard.writeText(link);
                        this.$buefy.toast.open(this.$t('BUTTONS.COPIED_TO_CLIPBOARD'));
                        this.warningExperimental();
                        resolve();
                    },
                    onCancel: () => {
                        resolve();
                    },
                    confirmText: this.$t('BUTTONS.COPY'),
                    cancelText: this.$t('BUTTONS.CLOSE'),
                    ariaRole: 'copyLinkModal',
                });
            });
        },
        importTemplate(template) {
            return new Promise((resolve) => {
                this.$route.params.templateId = undefined;
                this.templateId = undefined;
                if (this.$router.currentRoute.name === 'editor') {
                    this.$router.push({ name: 'editorNew', params: { lang: this.lang } });
                }

                if (!this.hasChanged) {
                    this.warningExperimental();
                    this.load(template).then(() => resolve());
                    return;
                }

                this.$buefy.dialog.confirm({
                    title: this.$i18n.t('EDIT.IMPORT.CONFIRM.TITLE'),
                    message: this.$i18n.t('EDIT.IMPORT.CONFIRM.MESSAGE'),
                    confirmText: this.$i18n.t('EDIT.IMPORT.CONFIRM.CONFIRM'),
                    cancelText: this.$i18n.t('EDIT.IMPORT.CONFIRM.CANCEL'),
                    type: 'is-danger',
                    hasIcon: true,
                    onConfirm: () => {
                        this.load(template).then(() => resolve());
                        this.warningExperimental();
                    },
                    onCancel: () => {},
                });
            });
        },
        importLinkTemplate() {},
        importFileTemplate(file) {
            file.text().then((txt) => {
                window.history.replaceState({}, document.title, `/${this.$i18n.locale}/edit`);
                const template = JSON.parse(txt);

                this.importTemplate(template);
            });
        },
        warningExperimental() {
            this.$buefy.snackbar.open({
                duration: 6000,
                message: this.$t('EDIT.WARNING.EXPERIMENTAL'),
                type: 'is-danger',
                cancelText: this.$t('BUTTONS.CANCEL'),
                position: 'is-bottom',
                actionText: null,
            });
        },
        exportPdf() {
            return new Promise((resolve) => {
                // Do no load library if useless
                this.vida.toPdf(pdfMakeFonts(this.store.fonts))
                .then((url) => {
                    const link = document.createElement('a');
                    const { id } = this.vida.documentParams();
                    const filename = 'aktivisda-' + id;
                    link.download = `${filename}.pdf`;
                    link.href = url;
                    document.body.appendChild(link);
                    link.click();

                    // // cleanup temporary elements
                    document.body.removeChild(link);
                    resolve();

                }).catch(() => {
                    this.$buefy.snackbar.open({
                        duration: 6000,
                        message: this.$t('EDIT.EXPORT.PDF_ERROR'),
                        type: 'is-danger',
                        cancelText: this.$t('BUTTONS.CANCEL'),
                        position: 'is-bottom',
                        actionText: null,
                    });
                });
            });
        },
        raiseMobileConfirm() {
            this.isLoading = false;
            this.$buefy.dialog.confirm({
                title: this.$i18n.t('EDIT.SMARTPHONE_WARNING.TITLE'),
                message: this.$i18n.t('EDIT.SMARTPHONE_WARNING.MESSAGE'),
                confirmText: this.$i18n.t('EDIT.SMARTPHONE_WARNING.CONFIRM_TEXT'),
                cancelText: this.$i18n.t('EDIT.SMARTPHONE_WARNING.CANCEL_TEXT'),
                type: 'is-info',
                hasIcon: true,
                onConfirm: () => {
                    this.isLoading = true;
                    this.setup();
                },
                onCancel: () => this.$router.push({ name: 'welcome' }),
            });
        },
        updateEditingLang: function(value) {
            this.editingLang = value;
            let options = {
                i18n: { editingLocale: value === undefined ? null : value.code }
            };
            return this.updateDocument(options).then(() => {
                if (this.selectedComponent) {
                    this.selectedComponentOptions = this.vida.componentParams(this.selectedComponent);
                    ++this.rerenderSelectedComponent;
                }
            })
        },
        updateDisplayedLocale: function(value) {
            this.displayedLocale = value
            let options = {
                i18n: { displayedLocale: value }
            };
            return this.updateDocument(options).then(() => {
                if (this.selectedComponent) {
                    this.selectedComponentOptions = this.vida.componentParams(this.selectedComponent);
                    ++this.rerenderSelectedComponent;
                }
            })
        }
    },
    mounted: function () {
        showSnackbarOnRedirection(this);
        // We don’t want to render the canvas
        document.dispatchEvent(new Event('x-app-rendered'));

        window.addEventListener('resize', this.handleResize);

        if (isMobile()) {
            this.raiseMobileConfirm();
        } else {
            this.setup();
        }

        const errorHandling = (evt) => {
            this.$buefy.dialog.alert({
                title: this.$t('COMMON.ERROR'),
                message: this.$t('EDIT.WARNING.UNEXPECTED_ERROR'),
                type: 'is-danger',
                hasIcon: true,
                icon: 'times-circle',
                iconPack: 'fa',
                ariaRole: 'alertdialog',
                ariaModal: true,
            });
            this.isExporting = false;
            evt.preventDefault();
            return true;
        };
        window.addEventListener('unhandledrejection', errorHandling);

    },
    beforeDestroy: function () {
        window.removeEventListener('resize', this.handleResize);
        this.vida.destroy();
    },
    beforeRouteUpdate(to, from, next) {
        if (to.params.templateId !== from.params.templateId) {
            this.templateId = to.params.templateId;

            next(); // todo
            this.setup();
        } else {
            if (this.exportType(to) !== undefined) {
                // Does nothing (reject) if !this.vida
                // Then export vida is done at the end of loadJson promise.
                this.exportVida(this.exportType(to))
                    .then(() => {
                        next(from);
                    })
                    .catch(() => {});
            }
        }
        next();
    },
    beforeRouteLeave(to, from, next) {
        if (!this.hasChanged) {
            next();
            return;
        }

        this.$buefy.dialog.confirm({
            title: this.$i18n.t('EDIT.UNSAVED_WORK.TITLE'),
            message: this.$i18n.t('EDIT.UNSAVED_WORK.MESSAGE'),
            confirmText: this.$i18n.t('EDIT.UNSAVED_WORK.QUIT_BUTTON'),
            cancelText: this.$i18n.t('EDIT.UNSAVED_WORK.STAY_BUTTON'),
            type: 'is-danger',
            hasIcon: true,
            onConfirm: () => next(),
            onCancel: () => next(false),
        });
    },
};
</script>

<style lang="scss">
.editor {
    min-height: calc(100vh - 100px);
}

/* le bloc de zoom suit le bord du panneau de droite */
.editor .whiteboard-tools {
    right: calc(var(--right-w, 380px) + 36px);
}

.editor-whiteboard {
    margin-left: calc(var(--left-w, 396px) + 16px);
    margin-right: calc(var(--right-w, 380px) + 16px);
}

/* Poignée de tiroir : trois points, comme les panneaux d'Inkscape */
.drawer-handle {
    position: fixed;
    top: 50%;
    transform: translateY(-50%);
    z-index: 6;
    width: 16px;
    height: 64px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.12s ease;
    &:hover,
    &:focus-visible {
        background: #d9d9d9;
        outline: none;
    }
    .dots {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #666;
        box-shadow: 0 -8px 0 #666, 0 8px 0 #666;
    }
}

.options-sidebar {
    height: 100%;
    width: 380px;
    position: fixed;
    z-index: 1;
    top: 0;
    right: 0;
    border-left: 1px solid #ddd;
    background-color: white;
    overflow-x: hidden;
    padding-top: 70px;
}

.preview-card {
    width: 70px;
}

.dropdown-item figure {
    height: 50px;
}

.dropdown-item figure img {
    object-fit: contain;
    height: 100%;
}

.options-sidebar nav.navbar {
    border-bottom: 2px ridge gray;
    margin: 10px 27px 20px 35px;
    padding: 10px 7px 1px 7px;
}

.options-sidebar .navbar-item .left-icon:only-child {
    margin-right: 5px;
}

</style>
