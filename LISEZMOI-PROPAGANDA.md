# Propaganda | cgtftocc

Outil de création d'affiches, de visuels et de QR codes de la CGT France Travail Occitanie.
**Propaganda est basé sur [Aktivisda](https://framagit.org/aktivisda/aktivisda)** (logiciel libre, licence AGPL-3.0,
voir `LICENSE`). Ce dépôt contient le code de notre version adaptée, publié conformément à cette licence.

## Ce qui a été ajouté ou changé par rapport à Aktivisda
- Interface « Canva » : barre d'icônes à gauche et tiroirs (modèles, fonds, éléments, import, dessin, formes, texte, QR, taille).
- QR codes stylés (formes de points, cadres, centres, couleurs, dégradé, logo central).
- Recadrage et inclinaison des images, outils de dessin, formes avec opacité, roue chromatique.
- Recherche d'images Vecteezy via un petit relais PHP (`php/vecteezy/`, clé API à fournir).
- Connexion obligatoire avec deux rôles (utilisateur, administrateur) : `php/acces/`.
- Gestionnaire de bibliothèque (symboles, fonds, modèles, étiquettes) : `php/admin/`.

## Ce qui n'est volontairement PAS dans ce dépôt
- Les logos, visuels et fonds de la CGT et de ses structures (identité visuelle protégée, usage réservé).
- Les comptes, mots de passe, clés (`php/acces/data/`, `php/vecteezy/config.php`) : ils se créent à l'installation.
- Les données de notre instance (bibliothèque d'images, modèles).

## Construire l'application
1. `npm install --legacy-peer-deps --ignore-scripts`, puis `node node_modules/vue-demi/scripts/postinstall.js`.
2. Dans `aktivisda-library/` : `npm install --legacy-peer-deps` puis `npm run build`.
3. Copier `instance-exemple/local` vers `public/local` et créer `public/static/{backgrounds,symbols,templates}`
   (avec vos propres images ; les polices sont ajoutées au moment de la compilation).
4. `NODE_ENV=production VUE_APP_NAME=aktivisda npx vue-cli-service build --mode aktivisda src/aktivisda/main.js`
5. Publier le contenu de `dist/aktivisda/` sur un hébergement PHP 7.4+ avec Apache (`mod_rewrite`), puis copier le
   dossier `php/` (`acces/`, `admin/`, `vecteezy/`) et `php/htaccess-racine.txt` (à renommer `.htaccess`) à la racine du site.
6. Créer `acces/data/cle_installation.txt` (une phrase aléatoire), ouvrir `/acces/installation.php`, créer les comptes,
   puis supprimer ces deux fichiers.

## Sécurité
Aucune donnée sensible n'est dans le code. Si vous découvrez une faille, écrivez à contact@cgtftocc.org plutôt
que d'ouvrir un ticket public.
