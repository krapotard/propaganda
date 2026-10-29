<?php
// Aktivisda - accès protégé : comptes dans un petit fichier JSON, cookie signé, aucune base de données
// ni session PHP (une vérification = un calcul, pas d'écriture disque). Inspiré de la connexion de Tracteur.
declare(strict_types=1);

const ACCES_DATA = __DIR__ . '/data';
const ACCES_COOKIE = 'aktiv_acces';
const ACCES_CSRF = 'aktiv_csrf';
const ACCES_DUREE = 43200; // 12 heures

function acces_https(): bool { return !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'; }

function acces_cookie(string $nom, string $valeur, int $expire): void {
    setcookie($nom, $valeur, ['expires' => $expire, 'path' => '/', 'secure' => acces_https(), 'httponly' => true, 'samesite' => 'Lax']);
}

function acces_secret(): string {
    static $s = null;
    if ($s !== null) return $s;
    $f = ACCES_DATA . '/secret.key';
    $s = is_file($f) ? trim((string)file_get_contents($f)) : '';
    if (strlen($s) < 32) {
        $s = bin2hex(random_bytes(32));
        file_put_contents($f, $s, LOCK_EX);
        @chmod($f, 0600);
    }
    return $s;
}

/* ---------- Comptes (data/comptes.json) ---------- */
function acces_installe(): bool { return is_file(ACCES_DATA . '/comptes.json'); }

function acces_comptes(): array {
    $f = ACCES_DATA . '/comptes.json';
    $j = is_file($f) ? json_decode((string)file_get_contents($f), true) : null;
    return is_array($j) && isset($j['comptes']) && is_array($j['comptes']) ? $j['comptes'] : [];
}

function acces_ecrire_comptes(array $comptes): void {
    $f = ACCES_DATA . '/comptes.json';
    $tmp = $f . '.tmp';
    file_put_contents($tmp, json_encode(['comptes' => array_values($comptes)], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    @chmod($tmp, 0600);
    rename($tmp, $f);
}

function acces_compte(string $identifiant): ?array {
    $identifiant = strtolower(trim($identifiant));
    foreach (acces_comptes() as $c) if (($c['identifiant'] ?? '') === $identifiant) return $c;
    return null;
}

function acces_hash(string $mdp): string { return password_hash($mdp, PASSWORD_DEFAULT); }

function acces_mdp_provisoire(): string {
    $alpha = 'abcdefghjkmnpqrstuvwxyz23456789';
    $m = '';
    for ($i = 0; $i < 16; $i++) $m .= $alpha[random_int(0, strlen($alpha) - 1)];
    return implode('-', str_split($m, 4));
}

/* ---------- Cookie signé ---------- */
function acces_b64(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function acces_unb64(string $s): string { return (string)base64_decode(strtr($s, '-_', '+/')); }

function acces_emettre(array $compte): void {
    $payload = acces_b64(json_encode(['i' => $compte['identifiant'], 'v' => (int)($compte['version'] ?? 1), 'e' => time() + ACCES_DUREE]));
    acces_cookie(ACCES_COOKIE, $payload . '.' . hash_hmac('sha256', $payload, acces_secret()), 0);
}

function acces_oublier(): void { acces_cookie(ACCES_COOKIE, '', time() - 3600); }

/** Compte connecté d'après le cookie (sans le hash), ou null. */
function acces_utilisateur(): ?array {
    static $cache = false;
    if ($cache !== false) return $cache;
    $cache = null;
    $v = $_COOKIE[ACCES_COOKIE] ?? '';
    if (!is_string($v) || substr_count($v, '.') !== 1 || !acces_installe()) return null;
    [$payload, $sig] = explode('.', $v);
    if (!hash_equals(hash_hmac('sha256', $payload, acces_secret()), $sig)) return null;
    $d = json_decode(acces_unb64($payload), true);
    if (!is_array($d) || ($d['e'] ?? 0) < time()) return null;
    $c = acces_compte((string)($d['i'] ?? ''));
    if (!$c || empty($c['actif']) || (int)($c['version'] ?? 1) !== (int)($d['v'] ?? 0)) return null;
    unset($c['hash']);
    return $cache = $c;
}

function acces_exiger(string $role = 'user'): array {
    $u = acces_utilisateur();
    if (!$u) { acces_refuser(401, 'Connexion requise.'); }
    if (!empty($u['a_changer'])) { acces_refuser(403, 'Changez d\'abord votre mot de passe.'); }
    if ($role === 'admin' && $u['role'] !== 'admin') { acces_refuser(403, 'Accès réservé à l\'administrateur.'); }
    return $u;
}

function acces_refuser(int $code, string $message): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

/* ---------- Essais de connexion limités (5 échecs / 15 min par identifiant + adresse) ---------- */
function acces_essais(callable $fn) {
    $f = ACCES_DATA . '/essais.json';
    $h = fopen($f, 'c+');
    flock($h, LOCK_EX);
    $j = json_decode((string)stream_get_contents($h), true);
    $liste = is_array($j) ? array_values(array_filter($j, fn($e) => ($e[1] ?? 0) > time() - 86400)) : [];
    $r = $fn($liste);
    if (is_array($r['liste'] ?? null)) { ftruncate($h, 0); rewind($h); fwrite($h, json_encode($r['liste'])); }
    flock($h, LOCK_UN); fclose($h);
    return $r['valeur'] ?? null;
}
function acces_trop_d_essais(string $cle): bool {
    return acces_essais(fn($l) => ['valeur' => count(array_filter($l, fn($e) => $e[0] === $cle && $e[1] > time() - 900)) >= 5]);
}
function acces_noter_echec(string $cle): void {
    acces_essais(function ($l) use ($cle) { $l[] = [$cle, time()]; return ['liste' => $l]; });
}

function acces_connecter(string $identifiant, string $mdp): ?string {
    $identifiant = strtolower(trim($identifiant));
    $cle = $identifiant . '|' . ($_SERVER['REMOTE_ADDR'] ?? '');
    if (acces_trop_d_essais($cle)) return 'Trop d\'essais. Réessayez dans 15 minutes.';
    $c = acces_compte($identifiant);
    static $faux = null;
    $faux ??= password_hash('inexistant', PASSWORD_DEFAULT); // temps constant même si le compte n'existe pas
    $ok = password_verify($mdp, $c['hash'] ?? $faux);
    if (!$c || !$ok || empty($c['actif'])) { acces_noter_echec($cle); return 'Identifiant ou mot de passe incorrect.'; }
    $comptes = acces_comptes();
    foreach ($comptes as &$x) if ($x['identifiant'] === $identifiant) { $x['derniere'] = date('Y-m-d H:i'); $c = $x; }
    unset($x);
    acces_ecrire_comptes($comptes);
    acces_emettre($c);
    return null;
}

/* ---------- Jeton anti-CSRF (cookie + champ caché identiques) ---------- */
function acces_csrf(): string {
    $v = $_COOKIE[ACCES_CSRF] ?? '';
    if (!is_string($v) || !preg_match('/^[0-9a-f]{32}$/', $v)) {
        $v = bin2hex(random_bytes(16));
        acces_cookie(ACCES_CSRF, $v, 0);
        $_COOKIE[ACCES_CSRF] = $v;
    }
    return $v;
}
function acces_csrf_ok(?string $jeton): bool {
    $v = $_COOKIE[ACCES_CSRF] ?? '';
    return is_string($v) && $v !== '' && is_string($jeton) && hash_equals($v, $jeton);
}

function acces_h(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }

/** Adresse de retour : uniquement un chemin du site. */
function acces_retour(?string $r): string {
    $r = (string)$r;
    if ($r === '' || $r[0] !== '/' || strpos($r, '//') === 0 || strpos($r, '\\') !== false || preg_match('#^/acces/#', $r)) return '/';
    return $r;
}

/* ---------- Gabarit de page (aspect de la connexion de Tracteur) ---------- */
function acces_page(string $titre, callable $corps, ?array $u = null, string $largeur = '420px'): never {
    acces_csrf(); // pose le cookie avant d'écrire la page
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    echo '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow">';
    echo '<title>' . acces_h($titre) . ' – Aktivisda</title><link rel="icon" href="/acces/logo.svg" type="image/svg+xml"><meta name="theme-color" content="#c30c07"><style>';
    echo ':root{--texte:#1a1a1a;--fond:#f3f3f3;--rouge:#c30c07;--bord:#767676}*{box-sizing:border-box}';
    echo 'body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:var(--texte);background:var(--fond);min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}';
    echo 'main{background:#fff;border:1px solid #c9c9c9;border-radius:6px;padding:28px;width:100%;max-width:' . $largeur . '}';
    echo '.marque{display:flex;align-items:center;gap:14px;margin:0 0 22px}.marque img{display:block;width:64px;height:64px;flex:none}';
    echo 'h1{font-size:16px;font-weight:normal;line-height:1.3;margin:0}h1 .nom{display:block;font-size:30px;font-weight:bold;color:var(--rouge);line-height:1.1}h2{font-size:18px;margin:26px 0 6px}';
    echo 'label{display:block;font-weight:bold;margin:14px 0 4px}input,select{width:100%;font:inherit;padding:9px 10px;border:2px solid var(--bord);border-radius:4px;background:#fff}';
    echo 'input:focus-visible,button:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid #0b4f9c;outline-offset:2px}';
    echo 'button,.btn{margin-top:18px;width:100%;font:inherit;font-weight:bold;padding:11px;border:0;border-radius:4px;background:var(--rouge);color:#fff;cursor:pointer;display:inline-block;text-align:center;text-decoration:none}';
    echo 'button.sec{background:#fff;color:var(--texte);border:2px solid var(--texte)}button.petit{width:auto;margin:0;padding:6px 10px;font-weight:normal}';
    echo '.err{background:#fde8e8;border:2px solid var(--rouge);border-radius:4px;padding:10px 12px;margin:0 0 8px}.ok{background:#e6f4ea;border:2px solid #0b6b2b;border-radius:4px;padding:10px 12px;margin:0 0 8px}';
    echo '.aide{font-size:14px;color:#444;margin:4px 0 0}table{width:100%;border-collapse:collapse;font-size:15px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:middle}';
    echo '.barre{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 14px;font-size:15px}.barre a{color:var(--rouge)}code{background:#f3f3f3;padding:1px 5px;border-radius:3px;font-size:17px}';
    echo '</style></head><body><main><div class="marque"><img src="/acces/logo.svg" alt="" width="64" height="64"><h1><span class="nom">Aktivisda</span> visuels et QR codes de la CGT FT Occitanie</h1></div>';
    if ($u) {
        echo '<div class="barre"><span>Connecté : <strong>' . acces_h($u['nom'] ?: $u['identifiant']) . '</strong></span><span>';
        echo '<a href="/">Éditeur</a>';
        if ($u['role'] === 'admin') echo ' · <a href="/admin/">Bibliothèque</a> · <a href="/acces/comptes.php">Comptes</a>';
        echo ' · <a href="/acces/motdepasse.php">Mot de passe</a></span></div>';
    }
    $corps();
    echo '</main></body></html>';
    exit;
}

function acces_champ_csrf(): string { return '<input type="hidden" name="csrf" value="' . acces_h(acces_csrf()) . '">'; }
