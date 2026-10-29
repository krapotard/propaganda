<?php
/**
 * Aktivisda - API d'administration des images (symboles et images de fond).
 * Compatible PHP 7.4+. Écrit dans ../local/data/<categorie>.json et ../static/<categorie>/.
 *
 * Sécurité :
 *  - accès réservé à un utilisateur authentifié (REMOTE_USER, via .htaccess/.htpasswd),
 *    sauf si config.php autorise explicitement localhost (test en local uniquement) ;
 *  - toute requête qui modifie quelque chose exige l'en-tête X-Aktivisda-Admin (anti-CSRF) ;
 *  - les SVG sont nettoyés par liste blanche (pas de script, pas de ressource externe).
 */

$cfg = ['allow_localhost' => false, 'max_svg_bytes' => 3145728, 'max_raster_bytes' => 2097152];
if (is_file(__DIR__ . '/config.php')) {
    $cfg = array_merge($cfg, (array) require __DIR__ . '/config.php');
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

$ROOT = dirname(__DIR__);
$CATEGORIES = ['symbols', 'backgrounds', 'templates'];

function out($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail($message, $status = 400)
{
    out(['error' => $message], $status);
}

/* ---------- Authentification ---------- */
// Connexion commune à Aktivisda (cookie signé, voir ../acces/) : rôle administrateur obligatoire.

require dirname(__DIR__) . '/acces/lib.php';
$compte = acces_exiger('admin');
$user = $compte['identifiant'];

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
if ($_SERVER['REQUEST_METHOD'] !== 'GET' && !isset($_SERVER['HTTP_X_AKTIVISDA_ADMIN'])) {
    fail('Requête refusée (en-tête manquant).', 403);
}

/* ---------- Données ---------- */

function category_or_fail($value)
{
    global $CATEGORIES;
    if (!in_array($value, $CATEGORIES, true)) {
        fail('Catégorie inconnue.');
    }
    return $value;
}

function data_file($category)
{
    global $ROOT;
    return $ROOT . '/local/data/' . $category . '.json';
}

function static_dir($category)
{
    global $ROOT;
    return $ROOT . '/static/' . $category;
}

function load_data($category)
{
    $file = data_file($category);
    $data = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
    if (!is_array($data)) {
        $data = [];
    }
    if (!isset($data['version'])) {
        $data['version'] = '1.0.25';
    }
    if (!isset($data[$category]) || !is_array($data[$category])) {
        $data[$category] = [];
    }
    return $data;
}

function save_data($category, array $data)
{
    $file = data_file($category);
    if (is_file($file)) {
        @copy($file, $file . '.bak');
    }
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        fail('Impossible d\'écrire les données.', 500);
    }
    $tmp = $file . '.tmp';
    if (file_put_contents($tmp, $json) === false || !rename($tmp, $file)) {
        fail('Écriture impossible dans local/data (droits du dossier ?).', 500);
    }
}

/** Verrou global : une seule modification à la fois. */
function with_lock($callback)
{
    global $ROOT;
    $lock = fopen($ROOT . '/local/data/.admin.lock', 'c');
    if (!$lock) {
        fail('Impossible de verrouiller les données.', 500);
    }
    flock($lock, LOCK_EX);
    try {
        return $callback();
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }
}

function new_id(array $items)
{
    $taken = [];
    foreach ($items as $item) {
        $taken[isset($item['id']) ? $item['id'] : ''] = true;
    }
    do {
        $id = bin2hex(random_bytes(4));
    } while (isset($taken[$id]));
    return $id;
}

function clean_label($value)
{
    $cleaned = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $value);
    if ($cleaned === null) {
        fail('Nom invalide (caractères non UTF-8).');
    }
    $value = trim($cleaned);
    if ($value === '') {
        fail('Le nom ne peut pas être vide.');
    }
    return function_exists('mb_substr') ? mb_substr($value, 0, 120) : substr($value, 0, 120);
}

function clean_tags($value)
{
    $parts = preg_split('/[,;]+/u', (string) $value);
    $out = [];
    foreach ($parts as $part) {
        $part = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $part) ?? '');
        $part = function_exists('mb_strtolower') ? mb_strtolower($part, 'UTF-8') : strtolower($part);
        $part = function_exists('mb_substr') ? mb_substr($part, 0, 30) : substr($part, 0, 30);
        if ($part !== '' && !in_array($part, $out, true)) {
            $out[] = $part;
        }
    }
    return implode(',', array_slice($out, 0, 12));
}

function public_item($category, array $item)
{
    $id = isset($item['id']) ? $item['id'] : '';
    $label = '';
    if (isset($item['label']) && is_array($item['label'])) {
        $label = isset($item['label']['fr']) ? $item['label']['fr'] : (string) reset($item['label']);
    }
    return [
        'id' => $id,
        'label' => $label,
        'width' => isset($item['width']) ? $item['width'] : null,
        'height' => isset($item['height']) ? $item['height'] : null,
        'colors' => isset($item['colors']) && is_array($item['colors']) ? array_keys($item['colors']) : [],
        'tags' => isset($item['tags']) ? (string) $item['tags'] : '',
        'created' => isset($item['creation_date']) ? $item['creation_date'] : '',
        'thumbnail' => '../static/' . $category . '/' . (isset($item['thumbnail']) ? $item['thumbnail'] : 'thumbnails/' . $id . '.webp'),
        'file' => ($category === 'templates' ? '../local/templates/' : '../static/' . $category . '/') . (isset($item['filename']) ? $item['filename'] : $id . ($category === 'templates' ? '.json' : '.svg')),
    ];
}

/* ---------- Nettoyage SVG ---------- */

function css_length($value)
{
    if (!preg_match('/^\s*([0-9]*\.?[0-9]+)\s*(px|mm|cm|in|pt|pc)?\s*$/i', (string) $value, $m)) {
        return null;
    }
    $n = (float) $m[1];
    $unit = isset($m[2]) ? strtolower($m[2]) : 'px';
    $factors = ['px' => 1, 'mm' => 96 / 25.4, 'cm' => 96 / 2.54, 'in' => 96, 'pt' => 96 / 72, 'pc' => 16];
    return $n * $factors[$unit];
}

function safe_css($css)
{
    $css = preg_replace('/@import[^;]*;?/i', '', $css);
    $css = preg_replace('/url\(\s*(?!["\']?#)[^)]*\)/i', 'none', $css);
    $css = preg_replace('/expression\s*\(|javascript:|behavior\s*:|-moz-binding/i', '', $css);
    return $css;
}

function clean_element(DOMElement $el, array $allowed)
{
    // Attributs
    $attrs = [];
    foreach ($el->attributes as $attr) {
        $attrs[] = $attr;
    }
    foreach ($attrs as $attr) {
        $name = $attr->nodeName;
        $ns = $attr->namespaceURI;
        $local = strtolower($attr->localName);
        $value = $attr->value;
        $remove = false;
        if ($ns !== null && $ns !== '' && $ns !== XLINK_NS && $ns !== XML_NS) {
            $remove = true; // inkscape:, sodipodi:, etc.
        } elseif (strpos($local, 'on') === 0) {
            $remove = true; // gestionnaires d'événements
        } elseif ($local === 'href') {
            $isFragment = isset($value[0]) && $value[0] === '#';
            $isData = preg_match('#^data:image/(png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=\s]+$#i', $value) === 1;
            if (!$isFragment && !($isData && $el->localName === 'image')) {
                $remove = true;
            }
        } elseif ($local === 'style') {
            $el->setAttribute($name, safe_css($value));
            continue;
        } elseif (preg_match('/javascript:|data:text|<script/i', $value)) {
            $remove = true;
        } elseif (preg_match('/url\(\s*(?!["\']?#)/i', $value)) {
            $remove = true; // url() externe dans un attribut
        }
        if ($remove) {
            $el->removeAttributeNode($attr);
        }
    }

    // Enfants
    $children = [];
    foreach ($el->childNodes as $child) {
        $children[] = $child;
    }
    foreach ($children as $child) {
        if ($child instanceof DOMElement) {
            if ($child->namespaceURI !== SVG_NS || !in_array($child->localName, $allowed, true)) {
                $el->removeChild($child);
                continue;
            }
            if ($child->localName === 'style') {
                $child->textContent = safe_css($child->textContent);
            }
            clean_element($child, $allowed);
            // <image> ou <use> dont la référence a été refusée : inutile de les garder vides
            if (in_array($child->localName, ['image', 'use'], true)
                && !$child->hasAttribute('href') && !$child->hasAttributeNS(XLINK_NS, 'href')) {
                $el->removeChild($child);
            }
        } elseif ($child instanceof DOMComment || $child instanceof DOMProcessingInstruction) {
            $el->removeChild($child);
        }
    }
}

/** Retourne ['svg' => string, 'width' => float, 'height' => float, 'colors' => [], 'warnings' => []] ou appelle fail(). */
function sanitize_svg($raw)
{
    if (stripos($raw, '<!ENTITY') !== false || stripos($raw, '<!DOCTYPE') !== false && stripos($raw, '[') !== false) {
        fail('SVG refusé (déclarations d\'entités).');
    }
    $allowed = ['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'clipPath', 'mask',
        'linearGradient', 'radialGradient', 'stop', 'pattern', 'image', 'use', 'symbol', 'text', 'tspan', 'style', 'title', 'desc'];

    $previous = libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $ok = $dom->loadXML($raw, LIBXML_NONET | LIBXML_NOBLANKS);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$ok || !$dom->documentElement || $dom->documentElement->localName !== 'svg' || $dom->documentElement->namespaceURI !== SVG_NS) {
        fail('Ce fichier n\'est pas un SVG valide.');
    }
    $root = $dom->documentElement;
    clean_element($root, $allowed);

    // Dimensions
    $vb = null;
    if ($root->hasAttribute('viewBox') && preg_match('/^\s*(-?[0-9.]+)[\s,]+(-?[0-9.]+)[\s,]+([0-9.]+)[\s,]+([0-9.]+)\s*$/', $root->getAttribute('viewBox'), $m)) {
        $vb = [(float) $m[1], (float) $m[2], (float) $m[3], (float) $m[4]];
    }
    if ($vb === null) {
        $w = css_length($root->getAttribute('width'));
        $h = css_length($root->getAttribute('height'));
        if (!$w || !$h) {
            fail('SVG sans dimensions (ni viewBox, ni width/height).');
        }
        $vb = [0.0, 0.0, $w, $h];
        $root->setAttribute('viewBox', '0 0 ' . round($w, 2) . ' ' . round($h, 2));
    }
    if ($vb[2] <= 0 || $vb[3] <= 0) {
        fail('SVG sans dimensions valides.');
    }
    $width = round($vb[2], 2);
    $height = round($vb[3], 2);
    $root->setAttribute('width', (string) $width);
    $root->setAttribute('height', (string) $height);

    $svg = $dom->saveXML($root);
    $svg = preg_replace('/\sxmlns:(inkscape|sodipodi|dc|cc|rdf|sketch|serif)="[^"]*"/', '', $svg);
    $svg = preg_replace_callback('/#[0-9a-fA-F]{6}\b/', function ($m) {
        return strtolower($m[0]);
    }, $svg);

    // Couleurs modifiables (fill / stroke / stop-color), en #rrggbb uniquement
    $colors = [];
    if (preg_match_all('/(?:fill|stroke|stop-color|flood-color)\s*[:=]\s*["\']?\s*(#[0-9a-f]{6})\b/i', $svg, $mm)) {
        foreach ($mm[1] as $c) {
            $colors[strtolower($c)] = true;
        }
    }
    $warnings = [];
    if (preg_match('/(?:fill|stroke)\s*[:=]\s*["\']?\s*(#[0-9a-f]{3}(?![0-9a-f])|rgba?\(|hsla?\()/i', $svg)) {
        $warnings[] = 'Certaines couleurs (#rgb, rgb(), hsl()) ne seront pas modifiables : exporte le SVG avec des couleurs #rrggbb.';
    }
    if (!$colors) {
        $warnings[] = 'Aucune couleur #rrggbb détectée : ce symbole ne pourra pas être recoloré.';
    }
    if (strpos($svg, '<image') !== false) {
        $warnings[] = 'Ce SVG contient une image bitmap intégrée : elle ne sera pas recolorable.';
    }

    return [
        'svg' => '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . $svg . "\n",
        'width' => $width,
        'height' => $height,
        'colors' => array_keys($colors),
        'warnings' => $warnings,
    ];
}

function read_upload($field, $maxBytes, $label)
{
    if (!isset($_FILES[$field]) || !is_array($_FILES[$field]) || $_FILES[$field]['error'] !== UPLOAD_ERR_OK) {
        $code = isset($_FILES[$field]['error']) ? $_FILES[$field]['error'] : -1;
        if ($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE) {
            fail($label . ' trop volumineux pour le serveur (upload_max_filesize).', 413);
        }
        fail($label . ' manquant.');
    }
    if ($_FILES[$field]['size'] > $maxBytes) {
        fail($label . ' trop volumineux.', 413);
    }
    $content = file_get_contents($_FILES[$field]['tmp_name']);
    if ($content === false || $content === '') {
        fail($label . ' illisible.');
    }
    return $content;
}

function is_png_or_webp($bin)
{
    return substr($bin, 0, 8) === "\x89PNG\r\n\x1a\n" || (substr($bin, 0, 4) === 'RIFF' && substr($bin, 8, 4) === 'WEBP');
}

function safe_relpath($path, $pattern)
{
    return is_string($path) && preg_match($pattern, $path) === 1;
}

/* ---------- Actions ---------- */

if ($action === 'list') {
    $category = category_or_fail(isset($_GET['category']) ? $_GET['category'] : '');
    $data = load_data($category);
    $items = [];
    foreach ($data[$category] as $item) {
        $items[] = public_item($category, $item);
    }
    out(['items' => $items, 'user' => $user !== '' ? $user : 'localhost']);
}

if ($action === 'add' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $category = category_or_fail(isset($_POST['category']) ? $_POST['category'] : '');
    $label = clean_label(isset($_POST['label']) ? $_POST['label'] : '');
    $isTemplate = $category === 'templates';
    $tags = clean_tags(isset($_POST['tags']) ? $_POST['tags'] : '');
    if ($isTemplate) {
        $jsonRaw = read_upload('template', $cfg['max_svg_bytes'], 'Le modèle');
        $doc = json_decode($jsonRaw, true);
        if (!is_array($doc) || !isset($doc['document']['width'], $doc['document']['height']) || !isset($doc['components']) || !is_array($doc['components'])) {
            fail('Ce fichier n\'est pas un modèle Aktivisda valide.');
        }
        $clean = ['svg' => $jsonRaw, 'width' => (float) $doc['document']['width'], 'height' => (float) $doc['document']['height'], 'colors' => [], 'warnings' => []];
    } else {
        $svgRaw = read_upload('svg', $cfg['max_svg_bytes'], 'Le SVG');
    }
    $preview = read_upload('preview', $cfg['max_raster_bytes'], 'L\'aperçu');
    $thumb = read_upload('thumbnail', $cfg['max_raster_bytes'], 'La vignette');
    if (!is_png_or_webp($preview) || !is_png_or_webp($thumb)) {
        fail('Aperçu ou vignette invalide (PNG ou WebP attendu).');
    }
    if (!$isTemplate) {
        $clean = sanitize_svg($svgRaw);
    }

    $result = with_lock(function () use ($category, $label, $clean, $preview, $thumb, $isTemplate, $tags) {
        $data = load_data($category);
        $id = new_id($data[$category]);
        $dir = static_dir($category);
        foreach (['', '/previews', '/thumbnails'] as $sub) {
            if (!is_dir($dir . $sub) && !mkdir($dir . $sub, 0755, true)) {
                fail('Impossible de créer le dossier ' . $category . $sub, 500);
            }
        }
        $mainDir = $isTemplate ? $GLOBALS['ROOT'] . '/local/templates' : $dir;
        if (!is_dir($mainDir) && !mkdir($mainDir, 0755, true)) {
            fail('Impossible de créer le dossier ' . $mainDir, 500);
        }
        $ext = $isTemplate ? '.json' : '.svg';
        if (file_put_contents($mainDir . '/' . $id . $ext, $clean['svg']) === false
            || file_put_contents($dir . '/previews/' . $id . '.webp', $preview) === false
            || file_put_contents($dir . '/thumbnails/' . $id . '.webp', $thumb) === false) {
            fail('Écriture impossible dans static/' . $category . ' (droits du dossier ?).', 500);
        }
        $entry = [
            'id' => $id,
            'creation_date' => date('Y-m-d\TH:i:s'),
            'filename' => $id . $ext,
            'preview' => 'previews/' . $id . '.webp',
            'thumbnail' => 'thumbnails/' . $id . '.webp',
            'tags' => $tags,
            'width' => $clean['width'],
            'height' => $clean['height'],
            'label' => ['fr' => $label],
        ];
        if (!$isTemplate) {
            $entry = array_merge(['id' => $id, 'type' => 'internalsvg'], array_slice($entry, 1));
            $entry['colors'] = (object) array_combine($clean['colors'], $clean['colors']);
            $entry = array_merge(array_diff_key($entry, ['label' => 1]), ['label' => ['fr' => $label]]);
        }
        $data[$category][] = $entry;
        save_data($category, $data);
        return ['item' => public_item($category, json_decode(json_encode($entry), true)), 'warnings' => $clean['warnings']];
    });
    out($result);
}

if ($action === 'rename' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) {
        fail('Requête invalide.');
    }
    $category = category_or_fail(isset($body['category']) ? $body['category'] : '');
    $label = clean_label(isset($body['label']) ? $body['label'] : '');
    $id = isset($body['id']) ? (string) $body['id'] : '';
    out(with_lock(function () use ($category, $label, $id) {
        $data = load_data($category);
        foreach ($data[$category] as $i => $item) {
            if (isset($item['id']) && $item['id'] === $id) {
                $labels = isset($item['label']) && is_array($item['label']) ? $item['label'] : [];
                $labels['fr'] = $label;
                $data[$category][$i]['label'] = $labels;
                save_data($category, $data);
                return ['ok' => true, 'item' => public_item($category, $data[$category][$i])];
            }
        }
        fail('Élément introuvable.', 404);
    }));
}

if ($action === 'tags' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) {
        fail('Requête invalide.');
    }
    $category = category_or_fail(isset($body['category']) ? $body['category'] : '');
    $tags = clean_tags(isset($body['tags']) ? $body['tags'] : '');
    $id = isset($body['id']) ? (string) $body['id'] : '';
    out(with_lock(function () use ($category, $tags, $id) {
        $data = load_data($category);
        foreach ($data[$category] as $i => $item) {
            if (isset($item['id']) && $item['id'] === $id) {
                $data[$category][$i]['tags'] = $tags;
                save_data($category, $data);
                return ['ok' => true, 'item' => public_item($category, $data[$category][$i])];
            }
        }
        fail('Élément introuvable.', 404);
    }));
}

if ($action === 'delete' && $_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) {
        fail('Requête invalide.');
    }
    $category = category_or_fail(isset($body['category']) ? $body['category'] : '');
    $id = isset($body['id']) ? (string) $body['id'] : '';
    out(with_lock(function () use ($category, $id) {
        $data = load_data($category);
        foreach ($data[$category] as $i => $item) {
            if (isset($item['id']) && $item['id'] === $id) {
                $dir = static_dir($category);
                $mainPattern = $category === 'templates' ? '#^[A-Za-z0-9._-]+\.json$#' : '#^[A-Za-z0-9._-]+\.svgz?$#';
                $files = [
                    isset($item['filename']) ? $item['filename'] : '' => $mainPattern,
                    isset($item['preview']) ? $item['preview'] : '' => '#^previews/[A-Za-z0-9._-]+$#',
                    isset($item['thumbnail']) ? $item['thumbnail'] : '' => '#^thumbnails/[A-Za-z0-9._-]+$#',
                ];
                array_splice($data[$category], $i, 1);
                save_data($category, $data);
                foreach ($files as $rel => $pattern) {
                    $base = ($category === 'templates' && $pattern === $mainPattern) ? $GLOBALS['ROOT'] . '/local/templates' : $dir;
                    if (safe_relpath($rel, $pattern) && is_file($base . '/' . $rel)) {
                        @unlink($base . '/' . $rel);
                    }
                }
                return ['ok' => true];
            }
        }
        fail('Élément introuvable.', 404);
    }));
}

fail('Action inconnue.', 404);
