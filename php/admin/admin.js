(() => {
    'use strict';

    const API = 'api.php';
    const $ = (selector) => document.querySelector(selector);

    let category = 'symbols';
    let staged = []; // { file, label, url, previewBlob, thumbBlob, state, message, warnings }

    /* ---------- Utilitaires ---------- */

    const toast = (message, isError = false) => {
        const el = $('#toast');
        el.textContent = message;
        el.className = 'toast' + (isError ? ' error' : '');
        el.hidden = false;
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
    };

    const api = async (action, { method = 'GET', body, query = {} } = {}) => {
        const qs = new URLSearchParams({ action, ...query });
        const response = await fetch(`${API}?${qs}`, {
            method,
            body,
            headers: { 'X-Aktivisda-Admin': '1', ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
            cache: 'no-store',
        });
        const data = await response.json().catch(() => ({ error: 'Réponse invalide du serveur.' }));
        if (!response.ok) throw new Error(data.error || `Erreur ${response.status}`);
        return data;
    };

    const prettify = (filename) =>
        filename
            .replace(/\.svg$/i, '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const loadImage = (url) =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('SVG illisible par le navigateur'));
            img.src = url;
        });

    // Rend l'image dans un canevas (WebP si le navigateur sait l'encoder, sinon PNG : le serveur accepte les deux).
    const rasterize = (img, max) => {
        const w0 = img.naturalWidth || 300;
        const h0 = img.naturalHeight || 300;
        const k = Math.min(max / w0, max / h0);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(w0 * k));
        canvas.height = Math.max(1, Math.round(h0 * k));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        return new Promise((resolve, reject) =>
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Miniature impossible'))), 'image/webp', 0.9),
        );
    };

    /* ---------- Fichiers en attente ---------- */

    const baseName = (name) => name.replace(/\.[^.]+$/, '').toLowerCase();

    // Modèles : un fichier .json (Sauvegarder > Modèle) accompagné d'une image du même nom (Sauvegarder > PNG).
    const addTemplateFiles = async (fileList) => {
        const all = [...fileList];
        const jsons = all.filter((f) => /\.json$/i.test(f.name));
        const images = all.filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name) || /^image\/(png|jpeg|webp)$/.test(f.type));
        if (!jsons.length) {
            toast('Dépose le fichier .json du modèle ET son image (même nom).', true);
            return;
        }
        for (const file of jsons) {
            const image = images.find((f) => baseName(f.name) === baseName(file.name)) || (jsons.length === 1 && images.length === 1 ? images[0] : null);
            const item = { file, label: prettify(file.name.replace(/\.json$/i, '')), url: image ? URL.createObjectURL(image) : '', state: 'prep', message: 'Préparation…', warnings: [] };
            staged.push(item);
            renderStaged();
            try {
                if (!image) throw new Error('Image manquante : dépose aussi le PNG du même nom');
                const doc = JSON.parse(await file.text());
                if (!doc || !doc.document || !Array.isArray(doc.components)) throw new Error('Ce fichier n\'est pas un modèle Aktivisda');
                const img = await loadImage(item.url);
                item.thumbBlob = await rasterize(img, 200);
                item.previewBlob = await rasterize(img, 600);
                item.state = 'ready';
                item.message = 'Prêt';
            } catch (error) {
                item.state = 'error';
                item.message = error.message;
            }
            renderStaged();
        }
    };

    const addFiles = async (fileList) => {
        if (category === 'templates') return addTemplateFiles(fileList);
        const files = [...fileList].filter((f) => /\.svg$/i.test(f.name) || f.type === 'image/svg+xml');
        const ignored = fileList.length - files.length;
        if (ignored) toast(`${ignored} fichier(s) ignoré(s) : seuls les .svg sont acceptés.`, true);

        for (const file of files) {
            const item = { file, label: prettify(file.name), url: URL.createObjectURL(file), state: 'prep', message: 'Préparation…', warnings: [] };
            staged.push(item);
            renderStaged();
            try {
                const img = await loadImage(item.url);
                item.thumbBlob = await rasterize(img, 200);
                item.previewBlob = await rasterize(img, 600);
                item.state = 'ready';
                item.message = 'Prêt';
            } catch (error) {
                item.state = 'error';
                item.message = error.message;
            }
            renderStaged();
        }
    };

    const renderStaged = () => {
        $('#staged').hidden = staged.length === 0;
        const list = $('#stagedList');
        list.textContent = '';
        staged.forEach((item, index) => {
            const li = document.createElement('li');

            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            if (item.url) {
                const img = document.createElement('img');
                img.src = item.url;
                img.alt = '';
                thumb.appendChild(img);
            }

            const input = document.createElement('input');
            input.type = 'text';
            input.value = item.label;
            input.maxLength = 120;
            input.setAttribute('aria-label', 'Nom de ' + item.file.name);
            input.addEventListener('input', () => (item.label = input.value));

            const tagsField = document.createElement('input');
            tagsField.type = 'text';
            tagsField.className = 'staged-tags';
            tagsField.value = item.tags || '';
            tagsField.maxLength = 200;
            tagsField.placeholder = 'Étiquettes';
            tagsField.setAttribute('aria-label', 'Étiquettes de ' + item.file.name);
            tagsField.addEventListener('input', () => (item.tags = tagsField.value));

            const state = document.createElement('span');
            state.className = 'state' + (item.state === 'done' ? ' ok' : item.state === 'error' ? ' err' : '');
            state.textContent = item.message;

            const remove = document.createElement('button');
            remove.className = 'danger';
            remove.textContent = 'Retirer';
            remove.addEventListener('click', () => {
                if (item.url) URL.revokeObjectURL(item.url);
                staged.splice(index, 1);
                renderStaged();
            });

            li.append(thumb, input, tagsField, state, remove);
            item.warnings.forEach((text) => {
                const warn = document.createElement('div');
                warn.className = 'warn';
                warn.textContent = '⚠ ' + text;
                li.appendChild(warn);
            });
            list.appendChild(li);
        });
        $('#send').disabled = !staged.some((i) => i.state === 'ready' || i.state === 'error-send');
    };

    const sendAll = async () => {
        const button = $('#send');
        button.disabled = true;
        let added = 0;
        for (const item of staged.filter((i) => i.state === 'ready' || i.state === 'error-send')) {
            item.message = 'Envoi…';
            renderStaged();
            const form = new FormData();
            form.append('category', category);
            form.append('label', item.label.trim());
            form.append('tags', item.tags || '');
            form.append(category === 'templates' ? 'template' : 'svg', item.file, item.file.name);
            form.append('preview', item.previewBlob, 'preview.webp');
            form.append('thumbnail', item.thumbBlob, 'thumbnail.webp');
            try {
                const result = await api('add', { method: 'POST', body: form });
                item.state = 'done';
                item.message = 'Ajouté ✔';
                item.warnings = result.warnings || [];
                added++;
            } catch (error) {
                item.state = 'error-send';
                item.message = error.message;
            }
            renderStaged();
        }
        // On garde à l'écran les avertissements ; les éléments ajoutés partent à la prochaine action.
        staged = staged.filter((i) => i.state !== 'done' || i.warnings.length);
        if (added) toast(`${added} élément(s) ajouté(s) à la bibliothèque.`);
        await refresh();
        renderStaged();
        button.disabled = false;
    };

    /* ---------- Bibliothèque ---------- */

    const renderGrid = (items) => {
        const grid = $('#grid');
        grid.textContent = '';
        $('#empty').hidden = items.length > 0;
        $('#count').textContent = `(${items.length})`;
        const stamp = Date.now();
        items.forEach((item) => {
            const li = document.createElement('li');
            li.className = 'card';

            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            const img = document.createElement('img');
            img.src = `${item.thumbnail}?v=${stamp}`;
            img.alt = item.label;
            img.loading = 'lazy';
            thumb.appendChild(img);

            const name = document.createElement('input');
            name.className = 'name';
            name.value = item.label;
            name.maxLength = 120;
            name.setAttribute('aria-label', 'Nom');
            const save = async () => {
                const value = name.value.trim();
                if (!value || value === item.label) {
                    name.value = item.label;
                    return;
                }
                try {
                    await api('rename', { method: 'POST', body: JSON.stringify({ category, id: item.id, label: value }) });
                    item.label = value;
                    toast('Nom enregistré.');
                } catch (error) {
                    name.value = item.label;
                    toast(error.message, true);
                }
            };
            name.addEventListener('change', save);
            name.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') name.blur();
            });

            const tagsInput = document.createElement('input');
            tagsInput.className = 'name tags';
            tagsInput.value = item.tags || '';
            tagsInput.maxLength = 200;
            tagsInput.placeholder = 'Étiquettes (ex. logos, rayons)';
            tagsInput.setAttribute('aria-label', 'Étiquettes');
            tagsInput.addEventListener('change', async () => {
                try {
                    const result = await api('tags', { method: 'POST', body: JSON.stringify({ category, id: item.id, tags: tagsInput.value }) });
                    item.tags = result.item.tags;
                    tagsInput.value = item.tags;
                    toast('Étiquettes enregistrées.');
                } catch (error) {
                    tagsInput.value = item.tags || '';
                    toast(error.message, true);
                }
            });
            tagsInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') tagsInput.blur();
            });

            const meta = document.createElement('div');
            meta.className = 'meta';
            const swatches = document.createElement('div');
            swatches.className = 'swatches';
            item.colors.slice(0, 8).forEach((color) => {
                const dot = document.createElement('span');
                dot.className = 'swatch';
                dot.style.background = color;
                dot.title = color;
                swatches.appendChild(dot);
            });
            const del = document.createElement('button');
            del.className = 'danger';
            del.textContent = 'Supprimer';
            del.addEventListener('click', async () => {
                if (!confirm(`Supprimer « ${item.label} » de la bibliothèque ?\n\nLes modèles qui l'utilisent ne l'afficheront plus.`)) return;
                try {
                    await api('delete', { method: 'POST', body: JSON.stringify({ category, id: item.id }) });
                    toast('Supprimé.');
                    refresh();
                } catch (error) {
                    toast(error.message, true);
                }
            });
            meta.append(swatches, del);

            li.append(thumb, name, tagsInput, meta);
            grid.appendChild(li);
        });
    };

    const refresh = async () => {
        try {
            const data = await api('list', { query: { category } });
            $('#who').textContent = data.user ? `Connecté : ${data.user}` : '';
            renderGrid(data.items);
        } catch (error) {
            toast(error.message, true);
            $('#grid').textContent = '';
            $('#empty').hidden = false;
            $('#empty').textContent = error.message;
        }
    };

    /* ---------- Événements ---------- */

    document.querySelectorAll('.tabs button').forEach((button) => {
        button.addEventListener('click', () => {
            category = button.dataset.category;
            staged.forEach((i) => i.url && URL.revokeObjectURL(i.url));
            staged = [];
            renderStaged();
            setTexts();
            document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b === button));
            refresh();
        });
    });

    const setTexts = () => {
        const tpl = category === 'templates';
        $('#addTitle').textContent = tpl ? 'Ajouter des modèles' : 'Ajouter des SVG';
        $('#dropMain').innerHTML = tpl
            ? '<strong>Glisse ici le fichier .json du modèle ET son image .png</strong> ou <label class="link" for="file">choisis-les</label>.'
            : '<strong>Glisse tes fichiers .svg ici</strong> ou <label class="link" for="file">choisis-les</label>.';
        $('#dropHint').textContent = tpl
            ? 'Dans l\'éditeur : Sauvegarder > Modèle (fichier .json), puis Sauvegarder > PNG. Donne le même nom aux deux fichiers (ex. affiche-agenda.json et affiche-agenda.png) : l\'image sert de vignette.'
            : 'Un nom, des couleurs modifiables et les miniatures sont préparés automatiquement. Prévois des couleurs au format #rrggbb pour pouvoir les changer dans l\'éditeur.';
        $('#file').accept = tpl ? '.json,application/json,.png,.jpg,.jpeg,.webp' : '.svg,image/svg+xml';
    };

    const drop = $('#drop');
    ['dragenter', 'dragover'].forEach((type) =>
        drop.addEventListener(type, (event) => {
            event.preventDefault();
            drop.classList.add('over');
        }),
    );
    ['dragleave', 'drop'].forEach((type) =>
        drop.addEventListener(type, (event) => {
            event.preventDefault();
            drop.classList.remove('over');
        }),
    );
    drop.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));
    $('#file').addEventListener('change', (event) => {
        addFiles(event.target.files);
        event.target.value = '';
    });
    $('#send').addEventListener('click', sendAll);
    $('#clear').addEventListener('click', () => {
        staged.forEach((i) => i.url && URL.revokeObjectURL(i.url));
        staged = [];
        renderStaged();
    });

    // Exposé pour les tests automatisés
    window.__admin = { addFiles, sendAll, refresh };

    refresh();
})();
