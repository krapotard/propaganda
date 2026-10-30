// Sauvegarde automatique du travail en cours, dans le navigateur de la personne (IndexedDB).
// Rien n'est envoyé au serveur. On garde les derniers travaux (un par visuel) pour ne jamais en perdre un.
const BASE = 'propaganda-brouillons';
const MAGASIN = 'travaux';
const MAX_TRAVAUX = 5;

function ouvrir() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('indexedDB indisponible'));
        const req = indexedDB.open(BASE, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(MAGASIN, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function transaction(mode, action) {
    return ouvrir().then(
        (db) =>
            new Promise((resolve, reject) => {
                const tx = db.transaction(MAGASIN, mode);
                const magasin = tx.objectStore(MAGASIN);
                let resultat;
                action(magasin, (v) => (resultat = v));
                tx.oncomplete = () => {
                    db.close();
                    resolve(resultat);
                };
                tx.onerror = tx.onabort = () => {
                    db.close();
                    reject(tx.error);
                };
            }),
    );
}

export function tousLesTravaux() {
    return transaction('readonly', (m, ret) => {
        const req = m.getAll();
        req.onsuccess = () => ret((req.result || []).sort((a, b) => b.date - a.date));
    }).catch(() => []);
}

export function dernierTravail() {
    return tousLesTravaux().then((l) => (l.length ? l[0] : undefined));
}

export function enregistrerTravail(id, json, resume) {
    return transaction('readwrite', (m) => {
        m.put({ id, date: Date.now(), json, resume });
        const req = m.getAll();
        req.onsuccess = () => {
            (req.result || [])
                .sort((a, b) => b.date - a.date)
                .slice(MAX_TRAVAUX)
                .forEach((t) => m.delete(t.id));
        };
    });
}
