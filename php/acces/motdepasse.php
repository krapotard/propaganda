<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
$u = acces_utilisateur();
if (!$u) { header('Location: /acces/login.php?retour=' . rawurlencode('/acces/motdepasse.php')); exit; }

$msg = ''; $ok = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $c = acces_compte($u['identifiant']);
    $a = (string)($_POST['actuel'] ?? ''); $n1 = (string)($_POST['nouveau'] ?? ''); $n2 = (string)($_POST['nouveau2'] ?? '');
    if (!acces_csrf_ok($_POST['csrf'] ?? null)) $msg = 'Session expirée, veuillez réessayer.';
    elseif (!password_verify($a, (string)($c['hash'] ?? ''))) $msg = 'Le mot de passe actuel est incorrect.';
    elseif (strlen($n1) < 12) $msg = 'Le nouveau mot de passe doit faire au moins 12 caractères.';
    elseif ($n1 !== $n2) $msg = 'Les deux saisies du nouveau mot de passe sont différentes.';
    elseif ($n1 === $a) $msg = 'Le nouveau mot de passe doit être différent de l\'ancien.';
    else {
        $comptes = acces_comptes();
        foreach ($comptes as &$x) if ($x['identifiant'] === $u['identifiant']) {
            $x['hash'] = acces_hash($n1); $x['a_changer'] = false; $x['version'] = (int)($x['version'] ?? 1) + 1; $c = $x;
        }
        unset($x);
        acces_ecrire_comptes($comptes);
        acces_emettre($c); // les autres sessions de ce compte sont fermées
        header('Location: /'); exit;
    }
}
acces_page('Mot de passe', function () use ($u, $msg) {
    if (!empty($u['a_changer'])) echo '<p class="err" role="alert"><strong>Mot de passe provisoire.</strong> Choisissez un mot de passe personnel pour continuer.</p>';
    if ($msg !== '') echo '<p class="err" role="alert">' . acces_h($msg) . '</p>';
    ?>
  <form method="post" action="/acces/motdepasse.php">
    <?= acces_champ_csrf() ?>
    <label for="actuel">Mot de passe actuel</label>
    <input id="actuel" name="actuel" type="password" autocomplete="current-password" required>
    <label for="nouveau">Nouveau mot de passe</label>
    <input id="nouveau" name="nouveau" type="password" autocomplete="new-password" minlength="12" required aria-describedby="aide-mdp">
    <p class="aide" id="aide-mdp">12 caractères minimum. Une phrase de plusieurs mots est plus facile à retenir qu'un mot de passe compliqué.</p>
    <label for="nouveau2">Confirmer le nouveau mot de passe</label>
    <input id="nouveau2" name="nouveau2" type="password" autocomplete="new-password" minlength="12" required>
    <button type="submit">Changer le mot de passe</button>
  </form>
<?php }, $u);
