'use strict';
import { TDocumentDefinitions } from 'pdfmake/interfaces';

import { DocumentParams, DocumentOptions, MimeType, Template, ComponentOptions, Dimensions, Uuid, ImageGallery } from './typing.ts';

import compressImage from './compress';
import { stringifyQuery, jsonToURI, generateId, assignValues, cleanUndefined } from './utils/utils.ts';

import LZString from 'lz-string';

import AbstractVidaComponent from './components/abstractvidacomponent.ts';
import BackgroundVidaComponent from './components/backgroundvidacomponent.ts';
import TextVidaComponent from './components/textvidacomponent.ts';
import ImageVidaComponent from './components/imagevidacomponent.ts';

import InvalidDataError from './invaliddataerror.js';
import { computeRelativePosition, pxToPt } from './utils/positionutils.ts';

import Konva from 'konva';
import { toPdfDataUrl, reduceDescriptionImages } from './utils/pdf.ts';

import packageFile from '../package.json';
import ShapeVidaComponent from './components/shapevidacomponent.ts';

import { Mutex } from 'async-mutex';

// @ts-ignore
import migrate from './migration/migrater.mjs';
import { Margins } from 'pdfmake/interfaces';

type HistoryEntry =
    | { kind: 'comp'; comp: AbstractVidaComponent; tx: number; t: number }
    | { kind: 'create'; comp: AbstractVidaComponent; index: number; tx: number; t: number }
    | { kind: 'remove'; comp: AbstractVidaComponent; index: number; tx: number; t: number }
    | { kind: 'doc'; before: any; after: any; tx: number; t: number };

type Box = { x: number; y: number; width: number; height: number };

/** Un élément figé par un modèle (self.fixed) ne peut pas être sélectionné. */
function _selectable(c: AbstractVidaComponent): boolean {
    return !(c.options.rules && (c.options.rules as any).self && (c.options.rules as any).self.fixed === true);
}

export default class Vida {
    document: DocumentParams;
    components: Array<AbstractVidaComponent>;
    background: BackgroundVidaComponent;
    documentSize: Dimensions;
    version: string | undefined;

    _selectedComponent: string | undefined;
    /** Sélection multiple (2 éléments ou plus, dans l'ordre de sélection). Vide si un seul élément (ou aucun) est sélectionné. */
    _multi: Uuid[] = [];
    multiTransformer: Konva.Transformer | undefined;
    _multiDrag: { primary: Uuid; start: Map<Uuid, { x: number; y: number }> } | undefined;
    _mods = { shift: false, ctrl: false, button: 0, t: 0 };
    _marquee: Konva.Rect | undefined;
    _marqueeEndedAt = 0;
    _viewSet = false;

    // Historique global (une seule pile pour tout le visuel)
    _gUndo: HistoryEntry[] = [];
    _gRedo: HistoryEntry[] = [];
    _txCounter = 0;
    _viewListeners: Array<() => void> = [];
    gallery: ImageGallery | undefined;

    layer: Konva.Layer;
    stage: Konva.Stage;

    _exportingLayerMutex: Mutex;

    constructor(canvasId: string) {
        const canvas = <HTMLCanvasElement>document.getElementById(canvasId);
        if (canvas === null) throw new InvalidDataError(`Please provid a valid HTML canvas. No element found with id: ${canvasId}`);
        const { width, height } = this.stageDimension(canvas);
        this.layer = new Konva.Layer({ draggable: true });

        this._exportingLayerMutex = new Mutex();

        // this.layer.toggleHitCanvas();
        this.stage = new Konva.Stage({
            container: canvasId,
            width: width,
            height: height,
        });
        const self = this;
        this.layer.on('pointerclick', function () {
            const pointerPos = self.layer.getRelativePointerPosition();
            if (pointerPos == null) return;
            const { x, y } = computeRelativePosition({ x: pointerPos.x, y: pointerPos.y }, self.documentSize);
            self.onClick(x, y);
        });

        this.stage.add(this.layer);
        this.layer.draw();
        this._setupPointerModifiers();
        this._setupViewControls();

        const id = generateId();
        this.background = new BackgroundVidaComponent(this, id);
        this.document = {
            width: undefined,
            height: undefined,
            id: id,
            i18n: {
                defaultLocale: 'fr',
                displayedLocale: undefined,
                editingLocale: undefined,
            },
        };
        this.components = [];

        this._selectedComponent = undefined;
        this.version = packageFile.version;

        this.documentSize = { width: 1, height: 1 };
    }

    setGallery(gallery: ImageGallery) {
        this.gallery = gallery;
    }

    stageDimension(canvas: HTMLCanvasElement): Dimensions {
        const canvasParent = canvas.parentElement;
        if (canvasParent === null || canvasParent.nodeName === 'BODY' || canvasParent.clientWidth === 0 || canvasParent.clientHeight === 0) {
            return { width: canvas.width, height: canvas.height };
        }
        return {
            width: canvasParent.clientWidth,
            height: canvasParent.clientHeight,
        };
    }

    selectedComponent() {
        return this._selectedComponent;
    }

    selectComponent(componentId: Uuid) {
        if (this._selectedComponent && componentId === this._selectedComponent) return;
        if (this._multi.length > 0 && Date.now() - this._marqueeEndedAt < 300 && componentId === this.document.id) {
            // le relâchement du cadre de sélection ne doit pas désélectionner
            return;
        }
        {
            const c0 = componentId ? this._findComponent(componentId) : undefined;
            if (c0 && c0._fresh) this._finalizeFresh();
        }
        // Un clic de molette ou de bouton droit ne sélectionne rien
        if (Date.now() - this._mods.t < 1500 && this._mods.button > 0 && componentId !== this.document.id) {
            this._mods.t = 0;
            return;
        }
        // Clic avec Maj : ajoute ou retire l'élément de la sélection. Clic sur un élément groupé : tout le groupe.
        if (componentId && componentId !== this.document.id && this._findComponent(componentId)) {
            const fresh = Date.now() - this._mods.t < 1500;
            if (fresh && this._mods.shift) {
                this._mods.t = 0;
                this.toggleInSelection(componentId);
                return;
            }
            const group = fresh && this._mods.ctrl ? [] : this.groupMembers(componentId);
            if (group.length > 1) {
                this.selectMany(group);
                return;
            }
        } else if (componentId === this.document.id && this._mods.shift && Date.now() - this._mods.t < 1500) {
            return;
        }
        this._clearMulti();
        if (this._selectedComponent && this._selectedComponent !== this.document.id) {
            this._findComponent(this._selectedComponent)?.unselect();
        }

        this._selectedComponent = componentId;
        this.onSelect(componentId);
        if (!componentId || componentId === this.document.id) return;
        this._findComponent(componentId)!.select();
    }

    isSelected(componentId: Uuid) {
        return this._selectedComponent && componentId === this._selectedComponent;
    }

    // ---------------------------------------------------------------------------------------------
    // Historique global : annuler / rétablir pour tout le visuel
    // ---------------------------------------------------------------------------------------------

    _finalizeFresh() {
        for (const c of this.components) {
            if (c._fresh) {
                c._fresh = false;
                this._record({ kind: 'create', comp: c, index: this.components.indexOf(c) });
            }
        }
    }

    _record(entry: any) {
        const now = Date.now();
        const prev = this._gUndo[this._gUndo.length - 1];
        // plusieurs éléments modifiés d'un même geste (déplacement de groupe, alignement...) = une seule étape
        if (prev && prev.kind === 'comp' && entry.kind === 'comp' && now - prev.t < 40 && prev.comp !== entry.comp) {
            entry.tx = prev.tx;
        } else {
            entry.tx = ++this._txCounter;
        }
        entry.t = now;
        this._gUndo.push(entry);
        this._gRedo = [];
        this.onHistoryChange();
    }

    /** Appelé par un élément qui sauvegarde son état avant modification. */
    recordChange(comp: AbstractVidaComponent) {
        if (comp._fresh || this.components.indexOf(comp) === -1) return; // (le fond du visuel a son propre suivi)
        this._record({ kind: 'comp', comp });
    }

    /** Annule l'enregistrement de la dernière modification d'un élément (modification sans effet). */
    dropChange(comp: AbstractVidaComponent) {
        for (let i = this._gUndo.length - 1; i >= 0; i--) {
            const e = this._gUndo[i];
            if (e.kind === 'comp' && e.comp === comp) {
                this._gUndo.splice(i, 1);
                break;
            }
        }
        this.onHistoryChange();
    }

    /** Enregistre une modification du visuel lui-même (taille, fond...). */
    recordDocumentChange(before: any, after: any) {
        this._finalizeFresh();
        this._record({ kind: 'doc', before, after });
    }

    canUndoGlobal(): boolean {
        return this._gUndo.length > 0 || this.components.some((c) => c._fresh);
    }

    canRedoGlobal(): boolean {
        return this._gRedo.length > 0;
    }

    _detach(comp: AbstractVidaComponent) {
        if (this._selectedComponent === comp.id()) {
            comp.unselect();
            this._selectedComponent = undefined;
        }
        if (this._multi.indexOf(comp.id()) !== -1) this._clearMulti();
        if (comp.konvaTransformer) {
            comp.konvaTransformer.destroy();
            comp.konvaTransformer = undefined;
        }
        if (comp.konvaElement) comp.konvaElement.remove();
        const i = this.components.indexOf(comp);
        if (i !== -1) this.components.splice(i, 1);
        this.draw();
    }

    _attach(comp: AbstractVidaComponent, index: number) {
        if (this.components.indexOf(comp) === -1) this.components.splice(Math.min(index, this.components.length), 0, comp);
        if (comp.konvaElement) this.layer.add(comp.konvaElement as Konva.Group);
        this.rearrangeZIndices();
        this.draw();
    }

    _applyEntry(e: HistoryEntry, undo: boolean) {
        switch (e.kind) {
            case 'comp': {
                if (undo) e.comp.undo();
                else e.comp.redo();
                break;
            }
            case 'create': {
                if (undo) {
                    e.index = this.components.indexOf(e.comp);
                    this._detach(e.comp);
                    this.onStructureChanged(e.comp.id(), false);
                } else {
                    this._attach(e.comp, e.index);
                    this.onStructureChanged(e.comp.id(), true);
                }
                break;
            }
            case 'remove': {
                if (undo) {
                    this._attach(e.comp, e.index);
                    this.onStructureChanged(e.comp.id(), true);
                } else {
                    e.index = this.components.indexOf(e.comp);
                    this._detach(e.comp);
                    this.onStructureChanged(e.comp.id(), false);
                }
                break;
            }
            case 'doc': {
                this.onDocumentHistory(undo ? e.before : e.after);
                break;
            }
        }
    }

    undoGlobal(): boolean {
        this._finalizeFresh();
        const last = this._gUndo[this._gUndo.length - 1];
        if (!last) return false;
        while (this._gUndo.length && this._gUndo[this._gUndo.length - 1].tx === last.tx) {
            const e = this._gUndo.pop()!;
            this._applyEntry(e, true);
            this._gRedo.push(e);
        }
        this.onHistoryChange();
        return true;
    }

    redoGlobal(): boolean {
        const last = this._gRedo[this._gRedo.length - 1];
        if (!last) return false;
        const batch: HistoryEntry[] = [];
        while (this._gRedo.length && this._gRedo[this._gRedo.length - 1].tx === last.tx) batch.push(this._gRedo.pop()!);
        // on rejoue dans l'ordre où les modifications ont été faites
        for (const e of batch.reverse()) {
            this._applyEntry(e, false);
            this._gUndo.push(e);
        }
        this.onHistoryChange();
        return true;
    }

    onHistoryChange() {
        // à surcharger : l'historique a changé (boutons annuler / rétablir)
    }

    onStructureChanged(_componentId: Uuid, _added: boolean) {
        // à surcharger : un élément a été ajouté ou retiré par annuler / rétablir
    }

    onDocumentHistory(_options: any) {
        // à surcharger : annuler / rétablir une modification du visuel
    }

    // ---------------------------------------------------------------------------------------------
    // Sélection multiple, déplacement au clavier, alignement, distribution, groupes
    // ---------------------------------------------------------------------------------------------

    /** Identifiants des éléments sélectionnés (un seul, ou plusieurs), dans l'ordre de sélection. */
    selectedIds(): Uuid[] {
        if (this._multi.length > 0) return [...this._multi];
        if (this._selectedComponent && this._selectedComponent !== this.document.id && this._findComponent(this._selectedComponent)) {
            return [this._selectedComponent];
        }
        return [];
    }

    isMultiSelected(): boolean {
        return this._multi.length > 1;
    }

    /** Éléments de même groupe que `componentId` (lui compris). Vide ou un seul : pas de groupe. */
    groupMembers(componentId: Uuid): Uuid[] {
        const c = this._findComponent(componentId);
        const g = c ? c.options.groupId : undefined;
        if (!g) return [];
        return this.components.filter((o) => o.options.groupId === g).map((o) => o.id());
    }

    /** Ajoute ou retire un élément de la sélection (clic avec Maj). */
    toggleInSelection(componentId: Uuid) {
        const current = this.selectedIds();
        const members = this.groupMembers(componentId);
        const group = members.length > 1 ? members : [componentId];
        const present = current.indexOf(componentId) !== -1;
        const next = present ? current.filter((id) => group.indexOf(id) === -1) : [...current, ...group.filter((id) => current.indexOf(id) === -1)];
        this.selectMany(next);
    }

    /**
     * Sélectionne plusieurs éléments. Un seul élément : sélection ordinaire ; aucun : le visuel.
     * Les éléments groupés entraînent tout leur groupe.
     */
    selectMany(ids: Uuid[]) {
        const wanted: Uuid[] = [];
        for (const id of ids) {
            const c = this._findComponent(id);
            if (!c || _selectable(c) === false || wanted.indexOf(id) !== -1) continue;
            wanted.push(id);
        }
        const withGroups: Uuid[] = [];
        for (const id of wanted) {
            const members = this.groupMembers(id);
            for (const m of members.length > 1 ? members : [id]) if (withGroups.indexOf(m) === -1) withGroups.push(m);
        }
        const finalIds = withGroups.filter((id) => {
            const c = this._findComponent(id);
            return c !== undefined && _selectable(c) !== false;
        });
        // ne pas rejouer la logique de clic (Maj, groupes) pour une sélection venant d'ici
        this._mods.t = 0;
        if (finalIds.length === 0) {
            this.selectComponent(this.document.id);
            return;
        }
        if (finalIds.length === 1) {
            this.selectComponent(finalIds[0]);
            return;
        }
        // on laisse l'ancienne sélection, simple ou multiple
        if (this._selectedComponent && this._selectedComponent !== this.document.id) {
            this._findComponent(this._selectedComponent)?.unselect();
        }
        this._clearMulti();
        this._selectedComponent = undefined;
        this._multi = finalIds;
        this._buildMultiTransformer();
        this.onMultiSelect(this.selectedIds());
        this.draw();
    }

    selectAll() {
        this.selectMany(this.components.map((c) => c.id()));
    }

    _clearMulti() {
        if (this._multi.length === 0) return;
        for (const id of this._multi) {
            const c = this._findComponent(id);
            if (c && c.konvaElement) {
                c.konvaElement.off('.multi');
                c.konvaElement.draggable(false);
            }
        }
        this._multi = [];
        this._multiDrag = undefined;
        if (this.multiTransformer) {
            this.multiTransformer.detach();
            this.multiTransformer.destroy();
            this.multiTransformer = undefined;
        }
        this.draw();
    }

    _buildMultiTransformer() {
        const nodes: Konva.Node[] = [];
        for (const id of this._multi) {
            const c = this._findComponent(id);
            if (!c || !c.konvaElement) continue;
            nodes.push(c.konvaElement);
            const node = c.konvaElement;
            node.off('.multi');
            node.draggable(c.canMove());
            // les autres éléments suivent celui qu'on fait glisser
            node.on('dragstart.multi', () => {
                const start = new Map<Uuid, { x: number; y: number }>();
                for (const o of this._multi) {
                    const oc = this._findComponent(o);
                    if (oc && oc.konvaElement) start.set(o, { x: oc.konvaElement.x(), y: oc.konvaElement.y() });
                }
                this._multiDrag = { primary: id, start };
            });
            node.on('dragmove.multi', () => {
                const d = this._multiDrag;
                if (!d || d.primary !== id) return;
                const s0 = d.start.get(id)!;
                const dx = node.x() - s0.x;
                const dy = node.y() - s0.y;
                for (const [o, s] of d.start) {
                    if (o === id) continue;
                    const oc = this._findComponent(o);
                    if (oc && oc.konvaElement && oc.canMove()) oc.konvaElement.position({ x: s.x + dx, y: s.y + dy });
                }
            });
            node.on('dragend.multi', () => {
                const d = this._multiDrag;
                this._multiDrag = undefined;
                if (!d || d.primary !== id) return;
                // l'élément glissé a déjà été enregistré par son propre gestionnaire : on enregistre les autres
                for (const o of d.start.keys()) {
                    if (o === id) continue;
                    const oc = this._findComponent(o);
                    if (oc) oc.adjustPosition();
                }
            });
        }
        this.multiTransformer = new Konva.Transformer({
            nodes,
            rotateEnabled: true,
            resizeEnabled: true,
            enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            keepRatio: true,
            flipEnabled: false,
            borderStroke: '#c30c07',
            anchorStroke: '#c30c07',
            boundBoxFunc: function (_oldBox, newBox) {
                newBox.width = Math.max(5, newBox.width);
                return newBox;
            },
        });
        this.layer.add(this.multiTransformer);
    }

    /** Décale les éléments sélectionnés de dx, dy pixels du visuel (flèches du clavier). */
    moveSelection(dx: number, dy: number, coalesce = true) {
        for (const id of this.selectedIds()) this._findComponent(id)?.moveByPx(dx, dy, coalesce);
        if (this.multiTransformer) this.multiTransformer.forceUpdate();
        this.draw();
    }

    /** Aligne les éléments sélectionnés. relativeTo : page, selection, first, last. */
    alignSelection(axis: 'x' | 'y', mode: 'start' | 'center' | 'end', relativeTo: 'page' | 'selection' | 'first' | 'last') {
        const items = this._selectionBoxes();
        if (items.length === 0) return;
        const span = (b: Box) => (axis === 'x' ? { s: b.x, l: b.width } : { s: b.y, l: b.height });
        let ref: { s: number; e: number };
        if (relativeTo === 'page') {
            const total = axis === 'x' ? this.document.width! : this.document.height!;
            ref = { s: 0, e: total };
        } else if (relativeTo === 'first' || relativeTo === 'last') {
            const it = relativeTo === 'first' ? items[0] : items[items.length - 1];
            const sp = span(it.box);
            ref = { s: sp.s, e: sp.s + sp.l };
        } else {
            ref = {
                s: Math.min(...items.map((i) => span(i.box).s)),
                e: Math.max(...items.map((i) => span(i.box).s + span(i.box).l)),
            };
        }
        for (const it of items) {
            const sp = span(it.box);
            let target: number;
            if (mode === 'start') target = ref.s;
            else if (mode === 'end') target = ref.e - sp.l;
            else target = (ref.s + ref.e) / 2 - sp.l / 2;
            const delta = target - sp.s;
            if (Math.abs(delta) < 0.01) continue;
            it.move(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
        }
        this._afterArrange();
    }

    /** Répartit les éléments sélectionnés (3 au moins). gap : écarts égaux entre les éléments. */
    distributeSelection(axis: 'x' | 'y', mode: 'start' | 'center' | 'end' | 'gap') {
        const items = this._selectionBoxes();
        if (items.length < 3) return;
        const pos = (b: Box) => (axis === 'x' ? b.x : b.y);
        const len = (b: Box) => (axis === 'x' ? b.width : b.height);
        const key = (b: Box) => (mode === 'center' ? pos(b) + len(b) / 2 : mode === 'end' ? pos(b) + len(b) : pos(b));
        const sorted = [...items].sort((a, b) => key(a.box) - key(b.box));
        const n = sorted.length;
        if (mode === 'gap') {
            const first = pos(sorted[0].box);
            const last = Math.max(...sorted.map((i) => pos(i.box) + len(i.box)));
            const total = sorted.reduce((a, i) => a + len(i.box), 0);
            const gap = (last - first - total) / (n - 1);
            let cursor = first;
            for (const it of sorted) {
                const delta = cursor - pos(it.box);
                if (Math.abs(delta) >= 0.01) it.move(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
                cursor += len(it.box) + gap;
            }
        } else {
            const k0 = key(sorted[0].box);
            const k1 = key(sorted[n - 1].box);
            sorted.forEach((it, i) => {
                const delta = k0 + ((k1 - k0) * i) / (n - 1) - key(it.box);
                if (Math.abs(delta) >= 0.01) it.move(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
            });
        }
        this._afterArrange();
    }

    /** Unités d'alignement : un groupe = un seul bloc (boîte englobante), un élément seul = lui-même. */
    _selectionBoxes(): Array<{ comp: AbstractVidaComponent; comps: AbstractVidaComponent[]; box: Box; move: (dx: number, dy: number) => void }> {
        const result: Array<{ comp: AbstractVidaComponent; comps: AbstractVidaComponent[]; box: Box; move: (dx: number, dy: number) => void }> = [];
        const byGroup: { [g: string]: (typeof result)[0] } = {};
        for (const id of this.selectedIds()) {
            const comp = this._findComponent(id);
            const box = comp ? comp.boundingBox() : undefined;
            if (!comp || !box) continue;
            const g = comp.options.groupId;
            const unit = g ? byGroup[g] : undefined;
            if (unit) {
                const x1 = Math.min(unit.box.x, box.x);
                const y1 = Math.min(unit.box.y, box.y);
                const x2 = Math.max(unit.box.x + unit.box.width, box.x + box.width);
                const y2 = Math.max(unit.box.y + unit.box.height, box.y + box.height);
                unit.box = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } as Box;
                unit.comps.push(comp);
            } else {
                const u: (typeof result)[0] = {
                    comp,
                    comps: [comp],
                    box: { ...box } as Box,
                    move: (dx: number, dy: number) => u.comps.forEach((c) => c.moveByPx(dx, dy)),
                };
                result.push(u);
                if (g) byGroup[g] = u;
            }
        }
        return result;
    }

    _afterArrange() {
        if (this.multiTransformer) this.multiTransformer.forceUpdate();
        this.draw();
    }

    /** Groupe les éléments sélectionnés (2 au moins) ; renvoie l'identifiant du groupe. */
    groupSelection(): string | undefined {
        const ids = this.selectedIds();
        if (ids.length < 2) return undefined;
        const g = 'g' + generateId();
        for (const id of ids) {
            const c = this._findComponent(id);
            if (c) {
                c.options.groupId = g;
                this.onComponentUpdated(id);
            }
        }
        this.onMultiSelect(this.selectedIds());
        return g;
    }

    /** Dégroupe les éléments sélectionnés (ils restent sélectionnés ensemble). */
    ungroupSelection() {
        for (const id of this.selectedIds()) {
            const c = this._findComponent(id);
            if (c && c.options.groupId) {
                delete c.options.groupId;
                this.onComponentUpdated(id);
            }
        }
        this.onMultiSelect(this.selectedIds());
    }

    /** Résumé de la sélection pour le panneau : nombre d'éléments, d'éléments groupés, un seul groupe ? */
    selectionInfo() {
        const ids = this.selectedIds();
        const groups = new Set<string>();
        let grouped = 0;
        for (const id of ids) {
            const g = this._findComponent(id)?.options.groupId;
            if (g) {
                grouped++;
                groups.add(g);
            }
        }
        return { count: ids.length, grouped, oneGroup: groups.size === 1 && grouped === ids.length };
    }

    // --- Maj/Ctrl au clic, cadre de sélection (Maj + glisser sur une zone vide)

    _setupPointerModifiers() {
        const remember = (e: any) => {
            const ev = e && e.evt ? e.evt : undefined;
            if (!ev) return;
            this._mods = { shift: !!ev.shiftKey, ctrl: !!(ev.ctrlKey || ev.metaKey), button: typeof ev.button === 'number' ? ev.button : 0, t: Date.now() };
        };
        this.stage.on('pointerdown pointerup', remember);
        let origin: { x: number; y: number } | undefined;
        let layerStart: { x: number; y: number } | undefined;
        this.stage.on('pointerdown', (e: any) => {
            origin = undefined;
            if (!e.evt || !e.evt.shiftKey || (e.evt.button !== undefined && e.evt.button !== 0)) return;
            const p = this.layer.getRelativePointerPosition();
            if (p) origin = { x: p.x, y: p.y };
            layerStart = { x: this.layer.x(), y: this.layer.y() };
            // zone vide, hors du visuel : aucun glissement du calque ne démarre, on lance le cadre tout de suite
            if (e.target === this.stage && origin) {
                this._startMarquee(origin);
                origin = undefined;
            }
        });
        this.layer.on('dragstart', (e: any) => {
            // seul le glissement du calque lui-même (pas d'un élément) devient un cadre de sélection
            if (e.target !== this.layer || !origin) return;
            this.layer.stopDrag();
            if (layerStart) this.layer.position(layerStart);
            this._startMarquee(origin);
            origin = undefined;
        });
    }

    _startMarquee(origin: { x: number; y: number }) {
        const zoom = this.stage.scaleX() || 1;
        const rect = new Konva.Rect({
            x: origin.x,
            y: origin.y,
            width: 0,
            height: 0,
            fill: 'rgba(195,12,7,0.08)',
            stroke: '#c30c07',
            strokeWidth: 1.5 / zoom,
            dash: [6 / zoom, 4 / zoom],
            listening: false,
        });
        this._marquee = rect;
        this.layer.add(rect);
        const keep = this.selectedIds();
        const toLayer = (ev: PointerEvent | MouseEvent) => {
            this.stage.setPointersPositions(ev);
            return this.layer.getRelativePointerPosition();
        };
        const move = (ev: PointerEvent | MouseEvent) => {
            const p = toLayer(ev);
            if (!p) return;
            rect.setAttrs({ x: Math.min(origin.x, p.x), y: Math.min(origin.y, p.y), width: Math.abs(p.x - origin.x), height: Math.abs(p.y - origin.y) });
            this.draw();
        };
        const up = (ev: PointerEvent | MouseEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            move(ev);
            const r = { x: rect.x(), y: rect.y(), w: rect.width(), h: rect.height() };
            rect.destroy();
            this._marquee = undefined;
            this._marqueeEndedAt = Date.now();
            const inside: Uuid[] = [];
            if (r.w > 3 && r.h > 3) {
                for (const c of this.components) {
                    const b = c.boundingBox();
                    if (!b || _selectable(c) === false) continue;
                    if (b.x >= r.x - 0.5 && b.y >= r.y - 0.5 && b.x + b.width <= r.x + r.w + 0.5 && b.y + b.height <= r.y + r.h + 0.5) inside.push(c.id());
                }
            }
            this.selectMany([...keep, ...inside.filter((i) => keep.indexOf(i) === -1)]);
            this.draw();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    }

    documentParams(): DocumentParams {
        return this.document;
    }

    componentsKeys(): Uuid[] {
        return this.components.map((component) => component.id());
    }

    componentExists(componentId: Uuid): boolean {
        if (componentId === this.document.id) return true;
        return this._findComponent(componentId) !== undefined;
    }

    componentParams(componentId: Uuid): ComponentOptions | DocumentParams {
        if (componentId === this.document.id) return this.documentParams();
        return this._findComponent(componentId)!.toJson();
    }

    componentAllowedActions(componentId: Uuid) {
        return this._findComponent(componentId)!.allowedActions();
    }

    toJson(): Template {
        const template = {
            version: this.version!,
            document: this.document,
            components: this.components.map((component) => component.toJson()),
        };
        cleanUndefined(template);
        return template;
    }

    /**
     * Create a representation of the current vida that can be
     * used by pdfmake to create a pdf representation of the
     * vida.
     * Should be used through toPdfDataUrl in utils/pdf.ts
     *
     * @returns a pdf representation
     */
    async _toPdfDescription() {
        let status = 'ok';


        const content = [];
        const bgPdf = await this.background.toPdf();
        console.assert(bgPdf !== undefined);
        content.push({ zIndex: -1, content: bgPdf!.content });
        if (bgPdf!.status === 'unsupported_option') status = 'unsupported_option';
        const result = await this.components.map(async (component) => {
            let componentPdf;
            if (component.effectBlur() > 0) {
                // Flou : image transparente de l'élément seul (le PDF ne sait pas flouter en vectoriel)
                componentPdf = await component.effectsToPdf();
            } else {
                componentPdf = await component.toPdf();
                const opacity = component.effectOpacity();
                if (componentPdf !== undefined && opacity < 1) {
                    for (const c of componentPdf.content) {
                        if (typeof c.svg === 'string') c.svg = c.svg.replace(/<svg\b/, `<svg opacity="${opacity}"`);
                        else c.opacity = opacity;
                    }
                }
            }
            if (componentPdf === undefined) return;
            for (const c of componentPdf.content) {
                content.push({ zIndex: component.zIndex(), content: c });
                if (c.status === 'unsupported_option') status = 'unsupported_option';
            }
            return undefined;
        });
        await Promise.all(result);

        content.sort((a, b) => a.zIndex - b.zIndex);
        const description: TDocumentDefinitions = {
            compress: false,
            pageSize: {
                width: pxToPt(this.document.width!),
                height: pxToPt(this.document.height!),
            },
            pageMargins: <Margins>[0, 0, 0, 0],
            // sort components by zindex ??
            content: content.map((a) => a.content),
        }
        return {
            description,
            status: status,
        };
    }

    /**
     * Export the vida image to a dataUrl pdf
     * using pdfmake.
     */
    toPdf(fonts: any, mode: 'print' | 'web' = 'print'): Promise<string> {
        return new Promise((resolve, reject) => {
            this._toPdfDescription().then(async (desc) => {
                if (desc.status !== 'ok') {
                    reject();
                }
                // Version « web » : images réduites à ~150 dpi côté navigateur (rien n'est calculé sur le serveur)
                if (mode === 'web') await reduceDescriptionImages(desc.description, 150);
                toPdfDataUrl(desc.description, fonts)
                    .then((r) => {
                        resolve(r);
                    })
                    .catch((err) => reject(err));
            });
        });
    }

    /**
     * Export the vida image to a dataUrl image in the given
     * MimeType (currently only support image/png and image/jpeg)
     *
     * Image is also compressed locally using JpegOptim or Oxipng.
     * Uncompressed image is returned in case of error.
     *
     * This is done internaly by creating a new Html5CanvasElement
     *
     */
    toImage(mimeType: MimeType): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            let { width, height } = this.documentParams();
            const canvas = document.createElement('canvas');
            canvas.id = 'temporary-canvas';
            canvas.width = width!;
            canvas.height = height!;
            document.body.appendChild(canvas);
            const exportedVida = new Vida('temporary-canvas');

            if (this.gallery !== undefined) exportedVida.setGallery(this.gallery);

            exportedVida
                .loadJson(this.toJson())
                .then(() => {
                    // generate the image and download it
                    // const ratio = window.devicePixelRatio || 1; // TODO

                    const initialDataUrl = exportedVida.stage.toDataURL({ mimeType: mimeType, quality: 1 });
                    document.body.removeChild(canvas);
                    canvas.remove();
                    exportedVida.destroy();

                    // @ts-ignore
                    if (import.meta.env.MODE === 'headless') {
                        resolve(initialDataUrl);
                        return;
                    }

                    compressImage(initialDataUrl, mimeType, 75)
                        .then((r: any) => {
                            const compressedImage = r['resultData'];
                            const compressedBlob = new Blob([compressedImage], { type: mimeType });
                            const url = URL.createObjectURL(compressedBlob);
                            resolve(url);
                        })
                        .catch((err: any) => {
                            console.error(`Compressed image failed: ${err}`);
                            // // cleanup temporary elements
                            resolve(initialDataUrl);
                        });
                })
                .catch((error) => reject(error));
        });
    }

    toLink() {
        const query: any = {};
        const originalTemplate = jsonToURI(this.toJson());

        if (originalTemplate.length < 1000) {
            query.template = originalTemplate;
        } else {
            const b64CompressedTemplate = LZString.compressToBase64(originalTemplate);
            query.b64Template = b64CompressedTemplate;
        }
        return stringifyQuery(query);
    }

    randomInit(): Promise<void> {
        this.version = packageFile.version;

        return new Promise((resolve) => {
            this.background
                .randomInit('internalsvg', this.document)
                .then(() => this.updateDocument({ width: 1950, height: 800 }).then(() => resolve()));
        });
    }

    /**
     * Initialize vida with all the data from template.
     * Reset everything.
     * @method
     * @name Vida.Vida#loadJson
     * @param {Template} template
     * @returns Promise<void>. Resolved once everything is setup
     * @example
     * const template = JSON.parse(...); // Load the template representation
     * const vida = new Vida(canvasId);
     * await vida.loadJson(); // or use vida.loadJson().then(() => ...);
     */
    loadJson(template: Template): Promise<void> {
        // Reset
        this._clearMulti();
        this._selectedComponent = undefined;
        this._gUndo = [];
        this._gRedo = [];
        this.components = [];

        const updatedTemplate: Template = migrate(template);
        // if (!validateTemplate(updatedTemplate))
        //     return new Promise((_, reject) => reject());

        this.version = updatedTemplate.version;

        return new Promise<void>((resolve, reject) => {
            const promises = [];
            console.assert(updatedTemplate.document.width !== undefined && updatedTemplate.document.height !== undefined);

            this.document.width = Math.max(1, updatedTemplate.document.width!);
            this.document.height = Math.max(1, updatedTemplate.document.height!);
            promises.push(this.updateDocument(updatedTemplate.document));

            updatedTemplate.components.sort((a, b) => (a.zIndex! > b.zIndex! ? 1 : -1));

            for (const component of updatedTemplate.components) {
                if (component.type === 'shape' && component.fill!.type === 'blur') continue;
                promises.push(this.setupComponent(component));
            }
            Promise.all(promises)
                .then(() => {
                    const bluredImagePromises = [];
                    for (const component of updatedTemplate.components) {
                        if (component.type !== 'shape' || component.fill!.type !== 'blur') continue;
                        bluredImagePromises.push(this.setupComponent(component));
                    }
                    Promise.all(bluredImagePromises).then(() => {
                        resolve();
                    });
                })
                .catch((error) => {
                    console.error(error);
                    reject(error);
                });
        });
    }

    /** Matrice [a, b, c, d, e, f] qui passe des coordonnées du visuel à celles de la zone d'affichage (zoom et décalage compris). */
    documentMatrix(): number[] {
        return this.layer.getAbsoluteTransform().getMatrix();
    }

    zoom(factor: number | null = null): number {
        // sans argument : le visuel entier est ajusté à la zone de travail et centré
        if (factor === null) {
            factor = Math.min(this.layer.width() / this.document.width!, this.layer.height() / this.document.height!);
            factor *= 0.95;
            this.stage.scale({ x: factor, y: factor });
            this.layer.x((this.layer.width() / factor - this.document.width!) / 2);
            this.layer.y((this.layer.height() / factor - this.document.height!) / 2);
        } else {
            // avec un facteur : on garde le point de vue (le centre de la zone visible reste en place)
            this.zoomAt(factor);
            return this.stage.scaleX();
        }
        this._viewSet = true;
        this.draw();
        this._viewChanged();
        return factor;
    }

    /** Zoome autour d'un point de la zone de travail (en pixels de l'écran ; le centre par défaut). */
    zoomAt(factor: number, px?: number, py?: number) {
        const f = Math.min(8, Math.max(0.02, factor));
        const s0 = this.stage.scaleX() || 1;
        const x = px === undefined ? this.stage.width() / 2 : px;
        const y = py === undefined ? this.stage.height() / 2 : py;
        const dx = x / s0 - this.layer.x();
        const dy = y / s0 - this.layer.y();
        this.stage.scale({ x: f, y: f });
        this.layer.x(x / f - dx);
        this.layer.y(y / f - dy);
        this.draw();
        this._viewChanged();
    }

    /** Déplace la page dans la zone de travail (dx, dy en pixels de l'écran). */
    panBy(dx: number, dy: number) {
        const s = this.stage.scaleX() || 1;
        this.layer.x(this.layer.x() + dx / s);
        this.layer.y(this.layer.y() + dy / s);
        this.draw();
        this._viewChanged();
    }

    /** Molette : déplace la page (Maj : horizontalement) ; Ctrl + molette : zoom autour du pointeur. */
    handleWheel(e: WheelEvent) {
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.stage.height() : 1;
        const dx = e.deltaX * unit;
        const dy = e.deltaY * unit;
        if (e.ctrlKey || e.metaKey) {
            const rect = this.stage.container().getBoundingClientRect();
            this.zoomAt(this.stage.scaleX() * Math.pow(1.0015, -dy), e.clientX - rect.left, e.clientY - rect.top);
        } else if (e.shiftKey && dx === 0) {
            this.panBy(-dy, 0);
        } else {
            this.panBy(-dx, -dy);
        }
    }

    _domCleanup: Array<() => void> = [];

    _setupViewControls() {
        const el = this.stage.container();
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            this.handleWheel(e);
        };
        // le bouton du milieu sert à déplacer la page : pas de défilement automatique du navigateur
        const onDown = (e: MouseEvent) => {
            if (e.button === 1) e.preventDefault();
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('mousedown', onDown);
        // quand un visuel est remplacé par un autre (changement de modèle), l'ancien doit lâcher la zone de travail
        this._domCleanup.push(() => {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('mousedown', onDown);
        });
        this.layer.on('dragmove', (e: any) => {
            if (e.target === this.layer) this._viewChanged();
        });
    }

    addViewListener(fn: () => void) {
        this._viewListeners.push(fn);
    }

    removeViewListener(fn: () => void) {
        this._viewListeners = this._viewListeners.filter((f) => f !== fn);
    }

    _viewChanged() {
        this.onZoomChange(this.stage.scaleX());
        for (const f of this._viewListeners) f();
    }

    onZoomChange(_factor: number) {
        // à surcharger : le zoom a changé
    }

    handleResize() {
        if (!this.stage) return;
        const canvas = this.stage.container();
        const canvasParent = canvas.parentElement;
        if (canvasParent === null) return;

        const height = canvasParent.clientHeight;
        const width = canvasParent.clientWidth;
        const oldW = this.stage.width();
        const oldH = this.stage.height();
        const s = this.stage.scaleX() || 1;
        if (oldW <= 1 || oldH <= 1 || !this._viewSet) {
            this.stage.setAttrs({ width, height });
            this.zoom();
            this._viewSet = true;
            return;
        }
        // On garde le zoom et le point de vue : le centre de la zone visible reste en place
        const cx = oldW / 2 / s - this.layer.x();
        const cy = oldH / 2 / s - this.layer.y();
        this.stage.setAttrs({ width, height });
        this.layer.x(width / 2 / s - cx);
        this.layer.y(height / 2 / s - cy);
        this.draw();
        this._viewChanged();
    }

    updateDocument(documentParams: DocumentOptions): Promise<void> {
        if (documentParams.width !== undefined) documentParams.width = Math.max(1, documentParams.width);
        if (documentParams.height !== undefined) documentParams.height = Math.max(1, documentParams.height);

        return new Promise<void>((resolve) => {
            assignValues(this.document, documentParams, undefined);

            if (documentParams.i18n !== undefined && documentParams.i18n.editingLocale === null) this.document.i18n.editingLocale = null;

            if (documentParams.width) {
                this.documentSize.width = documentParams.width;
            }

            if (documentParams.height) {
                this.documentSize.height = documentParams.height;
            }

            const promises = [];
            const copyDocumentParams = {};
            assignValues(copyDocumentParams, documentParams, undefined);

            promises.push(
                new Promise<void>((resolve2) => {
                    this.background.update(copyDocumentParams, this.document).then(() => {
                        resolve2();
                    });
                }),
            );

            if (
                documentParams.width !== undefined ||
                documentParams.height !== undefined ||
                (documentParams.i18n !== undefined && (documentParams.i18n.editingLocale !== undefined || documentParams.i18n.displayedLocale))
            ) {
                for (const component of this.components) {
                    promises.push(component.update({}, this.document));
                }
            }
            Promise.all<void | boolean>(promises).then(() => resolve());
        });
    }

    updateComponent(componentId: Uuid, options: ComponentOptions) {
        const component = this._findComponent(componentId);
        if (!component) return;
        if (options.zIndex !== undefined) {
            let newZIndex = options.zIndex;
            if (newZIndex < component.zIndex()) {
                newZIndex -= 0.1;
            } else {
                newZIndex += 0.1;
            }
            this.components = this.components.sort((a, b) => {
                return (a.id() == componentId ? newZIndex : a.zIndex()) > (b.id() == componentId ? newZIndex : b.zIndex()) ? 1 : -1;
            });
            this.rearrangeZIndices();
            delete options.zIndex;
        }

        return component.update(options, this.document);
    }

    canUndo(componentId: Uuid): boolean {
        const component = this._findComponent(componentId);
        if (!component) return false;
        return component.canUndo();
    }

    canRedo(componentId: Uuid): boolean {
        const component = this._findComponent(componentId);
        if (!component) return false;
        return component.canRedo();
    }

    undoComponent(componentId: Uuid) {
        const component = this._findComponent(componentId);
        if (!component) return;
        return component.undo();
    }

    redoComponent(componentId: Uuid) {
        const component = this._findComponent(componentId);
        if (!component) return;
        return component.redo();
    }

    removeComponent(componentId: Uuid) {
        const component = this._findComponent(componentId);
        if (!component) return;
        this._finalizeFresh();
        const indexOf = this.components.indexOf(component);
        this._record({ kind: 'remove', comp: component, index: indexOf });
        this._detach(component);
        if (componentId === this._selectedComponent) this._selectedComponent = undefined;
        if (this._multi.indexOf(componentId) !== -1) {
            const rest = this._multi.filter((i) => i !== componentId);
            this._clearMulti();
            if (rest.length > 1) this.selectMany(rest);
            else if (rest.length === 1) this.selectComponent(rest[0]);
            else this.selectComponent(this.document.id);
        }
    }

    createComponent(options: ComponentOptions) {
        if (options.id === undefined) {
            options.id = generateId();
        }
        options.zIndex =
            this.components.length === 0
                ? 1
                : Math.max.apply(
                      Math,
                      this.components.map((comp) => comp.toJson().zIndex!),
                  ) + 1;
        const created = this.setupComponent(options);
        const comp = this._findComponent(options.id!);
        if (comp) comp._fresh = true;
        return created;
    }

    createRandomComponent(type: 'text' | 'internalsvg' | 'qrcode' | 'geometry' | 'emoji' | 'internalphoto' | 'textchoice', initial?: Partial<ComponentOptions>): Promise<string> {
        return new Promise((resolve) => {
            let component = undefined;
            let randomId = generateId();

            switch (type) {
                case 'text':
                case 'textchoice':
                case 'emoji': {
                    component = new TextVidaComponent(this, randomId, type);
                    this.components.push(component);
                    break;
                }
                case 'qrcode':
                case 'geometry':
                case 'internalsvg':
                case 'internalphoto': {
                    component = new ImageVidaComponent(this, randomId);
                    this.components.push(component);
                    break;
                }
                default:
                    throw Error('Not implemented');
            }

            component._fresh = true;
            component.randomInit(type, this.documentSize, initial).then(() => {
                resolve(randomId);
            });
        });
    }

    setupComponent(componentParams: ComponentOptions) {
        if (componentParams.id === undefined) {
            throw new Error('invalid component params (id required)');
        }
        switch (componentParams.type) {
            case 'text':
            case 'textchoice':
            case 'emoji': {
                const textComponent = new TextVidaComponent(this, componentParams.id, componentParams.type);
                this.components.push(textComponent);
                return textComponent.update(componentParams, this.document);
            }
            case 'image': {
                const imageComponent = new ImageVidaComponent(this, componentParams.id);
                this.components.push(imageComponent);
                return imageComponent.update(componentParams, this.document);
            }
            case 'shape': {
                const shapeComponent = new ShapeVidaComponent(this, componentParams.id);
                this.components.push(shapeComponent);
                return shapeComponent.update(componentParams, this.document);
            }
            default:
                throw new InvalidDataError('Unknown componentParams.type');
        }
    }

    nbComponents() {
        return this.components.length;
    }

    computeAvailableLocales() {
        return this.components.reduce(
            (prev, comp) => {
                Object.keys(comp.toJson().i18n || {}).map((code) => prev.add(code));
                return prev;
            },
            new Set([this.document.i18n.defaultLocale]),
        );
    }

    registerComponent(konvaElement: Konva.Image | Konva.Group) {
        this.components.sort((a, b) => (a.zIndex() > b.zIndex() ? 1 : -1));
        this.layer.add(konvaElement);
    }

    registerTransformer(konvaElement: Konva.Image | Konva.Group) {
        this.layer.add(konvaElement);
    }

    rearrangeZIndices() {
        // TODO use promises ?
        this.background.sendBackward();
        let z = 1;
        for (const component of this.components) {
            component._skipBackup = true;
            try {
                component.update({ zIndex: z }, {});
            } finally {
                component._skipBackup = false;
            }
            ++z;
        }
        this.background.bringClipperForward();
    }

    draw() {
        // TODO: do not call many 'draw'
        this.layer.draw();
    }

    destroy() {
        for (const f of this._domCleanup) f();
        this._domCleanup = [];
        this._viewListeners = [];
        this.onZoomChange = () => {};
        this._clearMulti();
        this.background.destroy();
        for (let component of this.components) component.destroy();
        this.components = [];
    }

    onComponentUpdated(_componentId: Uuid) {
        console.assert(false, 'onComponentUpdated should be overriden');
    }

    onMultiSelect(_componentIds: Uuid[]) {
        // à surcharger : sélection de plusieurs éléments
    }

    onSelect(_componentId: Uuid) {
        console.assert(false, 'onSelect should be overriden by the calling code');
    }

    onClick(_x: number, _y: number) {
        console.assert(false, 'onClick should be overriden by the calling code');
    }

    _findComponent(componentId: Uuid): AbstractVidaComponent | undefined {
        return this.components.find((component) => component.id() == componentId);
    }
}
