<?php
// Passerelle : toute demande qui n'est pas publique (voir .htaccess) arrive ici.
// Sans connexion valide : page de connexion (ou erreur 401 pour un fichier). Avec : le fichier est servi tel quel,
// ou l'éditeur (index.html) pour une adresse de l'application. Le cache du navigateur évite de repasser ici.
declare(strict_types=1);
require __DIR__ . '/lib.php';

$racine = dirname(__DIR__);
$uri = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
$chemin = rawurldecode($uri);
$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($methode, ['GET', 'HEAD'], true)) { http_response_code(405); exit; }

// Dossiers et fichiers jamais servis
if (strpos($chemin, "\0") !== false || strpos($chemin, '..') !== false
    || preg_match('#(^|/)(\.|acces/|sauvegarde|deploiement)#', $chemin) || preg_match('#\.(php|phtml|sh|log|bak|sample|txt~)$#i', $chemin)) {
    http_response_code(404); exit;
}

$u = acces_utilisateur();
$html = strpos((string)($_SERVER['HTTP_ACCEPT'] ?? ''), 'text/html') !== false;
if (!$u) {
    if ($html) {
        // On garde la partie après « ? » : un lien de partage (/edit?b64Template=...) doit survivre à la connexion.
        $requete = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_QUERY);
        header('Cache-Control: no-store'); header('Location: /acces/login.php?retour=' . rawurlencode($requete !== '' ? $uri . '?' . $requete : $uri)); exit;
    }
    acces_refuser(401, 'Connexion requise.');
}
if (!empty($u['a_changer'])) {
    if ($html) { header('Location: /acces/motdepasse.php'); exit; }
    acces_refuser(403, 'Changez d\'abord votre mot de passe.');
}
// Bibliothèque d'administration : réservée au rôle administrateur
if (preg_match('#^/admin(/|$)#', rtrim($chemin, '/') . '/') && $u['role'] !== 'admin') { http_response_code(403); exit('Accès réservé à l\'administrateur.'); }

$types = ['html' => 'text/html; charset=utf-8', 'json' => 'application/json; charset=utf-8', 'svg' => 'image/svg+xml', 'webp' => 'image/webp',
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'ico' => 'image/x-icon', 'css' => 'text/css; charset=utf-8',
    'js' => 'application/javascript; charset=utf-8', 'woff2' => 'font/woff2', 'woff' => 'font/woff', 'ttf' => 'font/ttf', 'txt' => 'text/plain; charset=utf-8',
    'xml' => 'application/xml', 'wasm' => 'application/wasm', 'gz' => 'application/gzip', 'webmanifest' => 'application/manifest+json'];

$dossier = substr($chemin, -1) === '/';
if ($dossier) $chemin .= 'index.html'; // dossier : sa page d'accueil (éditeur ou administration)
$fichier = $racine . $chemin;
$reel = is_file($fichier) ? realpath($fichier) : false;
$base = realpath($racine);
if ($reel === false || strpos($reel, $base . DIRECTORY_SEPARATOR) !== 0) {
    // adresse de l'application (mode « history ») : on sert l'éditeur
    if (!$dossier && preg_match('#\.[a-z0-9]{2,5}$#i', $chemin)) { http_response_code(404); exit; }
    $reel = $base . '/index.html';
}
$ext = strtolower(pathinfo($reel, PATHINFO_EXTENSION));
if (!isset($types[$ext])) { http_response_code(404); exit; }

$taille = (int)filesize($reel); $mtime = (int)filemtime($reel);
$etag = '"' . dechex($mtime) . '-' . dechex($taille) . '"';
header('Content-Type: ' . $types[$ext]);
header('ETag: ' . $etag);
header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
header('X-Content-Type-Options: nosniff');
// données JSON et page de l'éditeur : toujours revalidées ; images : 1 jour dans le navigateur de la personne
header('Cache-Control: ' . (in_array($ext, ['json', 'html'], true) ? 'private, no-cache' : 'private, max-age=86400'));
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }
header('Content-Length: ' . $taille);
if ($methode === 'GET') readfile($reel);
