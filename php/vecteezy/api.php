<?php
// Relais Vecteezy pour Aktivisda.
// - la clé API reste sur le serveur (config.php) et n'est jamais envoyée au navigateur ;
// - recherches : gardées 10 minutes seulement ; les images Vecteezy ne sont JAMAIS stockées ici ;
// - téléchargements : comptés (plafond mensuel et par visiteur) pour ne jamais passer au plan payant.
// Actions : status, search, use.

header('Cache-Control: no-store');

// Réservé aux personnes connectées (cookie signé d'Aktivisda) : sinon n'importe qui consommerait le quota Vecteezy.
require dirname(__DIR__) . '/acces/lib.php';
acces_exiger('user');

$configFile = __DIR__ . '/config.php';
$config = is_file($configFile) ? include $configFile : [];
$dataDir = __DIR__ . '/data';
$apiKey = $config['api_key'] ?? '';
$account = preg_replace('/\D/', '', (string)($config['account_id'] ?? ''));
$configured = $apiKey !== '' && strpos($apiKey, 'COLLER_ICI') === false && $account !== '';

function fail($code, $message) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
function out($data) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}
function vz_get($url, $key, &$status, $raw = false) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_HTTPHEADER => $key ? ['Authorization: Bearer ' . $key, 'Accept: application/json'] : [],
    ]);
    $body = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $type = (string)curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);
    return $raw ? [$body, $type] : json_decode((string)$body, true);
}
// Compteur : mois en cours + visiteurs du jour (adresse IP mélangée, jamais stockée en clair)
function quota_update($dataDir, $ip, $monthlyMax, $perIp, $commit) {
    $file = $dataDir . '/quota.json';
    $fh = fopen($file, 'c+');
    if (!$fh) return [false, 'compteur illisible'];
    flock($fh, LOCK_EX);
    $q = json_decode((string)stream_get_contents($fh), true) ?: [];
    $month = date('Y-m');
    $day = date('Y-m-d');
    if (($q['month'] ?? '') !== $month) $q = ['month' => $month, 'count' => 0, 'day' => $day, 'ips' => []];
    if (($q['day'] ?? '') !== $day) { $q['day'] = $day; $q['ips'] = []; }
    $who = substr(hash('sha256', $ip . '|' . $month . '|aktivisda'), 0, 16);
    $ok = true; $why = '';
    if ($q['count'] >= $monthlyMax) { $ok = false; $why = 'Le quota mensuel d’images Vecteezy est atteint.'; }
    elseif (($q['ips'][$who] ?? 0) >= $perIp) { $ok = false; $why = 'Limite journalière atteinte pour ce poste.'; }
    if ($ok && $commit) { $q['count']++; $q['ips'][$who] = ($q['ips'][$who] ?? 0) + 1; }
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($q)); fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return [$ok, $why, $q['count'], $monthlyMax];
}

$action = $_GET['action'] ?? 'status';
$monthlyMax = (int)($config['monthly_max'] ?? 450);
$perIp = (int)($config['per_ip_daily'] ?? 15);
$ip = $_SERVER['REMOTE_ADDR'] ?? '0';

if ($action === 'status') {
    if (!$configured) out(['enabled' => false]);
    [, , $count, $max] = quota_update($dataDir, $ip, $monthlyMax, $perIp, false) + [2 => 0, 3 => $monthlyMax];
    out(['enabled' => true, 'used' => $count, 'max' => $max]);
}
if (!$configured) fail(503, 'Vecteezy n’est pas configuré sur ce serveur.');
$base = ($config['api_base'] ?? 'https://api.vecteezy.com') . '/v2/' . $account;   // api_base : pour les tests uniquement

if ($action === 'search') {
    $term = trim((string)($_GET['term'] ?? ''));
    $type = $_GET['type'] ?? 'png';
    $page = max(1, min(50, (int)($_GET['page'] ?? 1)));
    if ($term === '' || mb_strlen($term) > 80) fail(400, 'Mot-clé invalide.');
    if (!in_array($type, ['png', 'photo', 'svg', 'vector'], true)) fail(400, 'Type invalide.');
    $query = http_build_query(['term' => $term, 'content_type' => $type, 'page' => $page, 'per_page' => 30, 'license_type' => 'commercial', 'family_friendly' => 'true', 'sort_by' => 'relevance']);
    $cacheFile = $dataDir . '/s_' . md5($query) . '.json';
    if (is_file($cacheFile) && time() - filemtime($cacheFile) < 600) out(json_decode(file_get_contents($cacheFile), true));
    $data = vz_get($base . '/resources?' . $query, $apiKey, $status);
    if ($status === 402) fail(402, 'Quota de recherches Vecteezy atteint.');
    if ($status !== 200 || !is_array($data)) fail(502, 'Vecteezy a répondu par une erreur (' . $status . ')' . (isset($data['errors'][0]['message']) ? ' : ' . $data['errors'][0]['message'] : '') . '.');
    $items = [];
    foreach (($data['resources'] ?? []) as $r) {
        $types = array_map(function ($t) { return $t['extension'] ?? ''; }, $r['file_metadata']['available_file_types'] ?? []);
        $items[] = ['id' => $r['id'], 'title' => $r['title'] ?? '', 'type' => $r['content_type'] ?? $type, 'thumb' => $r['thumbnail_2x_url'] ?? ($r['thumbnail_url'] ?? ''), 'types' => $types];
    }
    $result = ['page' => $data['page'] ?? $page, 'last_page' => $data['last_page'] ?? 1, 'total' => $data['total_resources'] ?? count($items), 'items' => $items];
    file_put_contents($cacheFile, json_encode($result), LOCK_EX);
    if (mt_rand(1, 50) === 1) {   // ménage : on ne garde rien plus d'une heure
        foreach (glob($dataDir . '/s_*.json') ?: [] as $f) if (time() - filemtime($f) > 3600) @unlink($f);
    }
    out($result);
}

if ($action === 'use') {
    $id = (int)($_GET['id'] ?? 0);
    $fileType = preg_replace('/[^a-z0-9]/', '', strtolower((string)($_GET['file_type'] ?? '')));
    if ($id <= 0) fail(400, 'Identifiant invalide.');
    [$ok, $why] = quota_update($dataDir, $ip, $monthlyMax, $perIp, false);
    if (!$ok) fail(429, $why);
    $url = $base . '/resources/' . $id . '/download' . ($fileType !== '' ? '?file_type=' . $fileType : '');
    $info = vz_get($url, $apiKey, $status);
    if ($status === 402) fail(402, 'Quota de téléchargements Vecteezy atteint.');
    if ($status !== 200 || empty($info['url'])) fail(502, 'Téléchargement refusé par Vecteezy (' . $status . ')' . (isset($info['errors'][0]['message']) ? ' : ' . $info['errors'][0]['message'] : '') . '.');
    quota_update($dataDir, $ip, $monthlyMax, $perIp, true);   // compté dès que Vecteezy l'a accordé
    // L'image est relayée telle quelle (le navigateur ne peut pas la lire directement) ; rien n'est gardé ici.
    [$bytes, $type] = vz_get($info['url'], null, $s2, true);
    if ($s2 !== 200 || $bytes === false || $bytes === '') fail(502, 'Image Vecteezy illisible.');
    header('Content-Type: ' . ($type ?: 'application/octet-stream'));
    header('X-Vecteezy-Attribution: ' . (!empty($info['requires_attribution']) ? '1' : '0'));
    header('Content-Length: ' . strlen($bytes));
    echo $bytes;
    exit;
}
fail(400, 'Action inconnue.');
