<?php
// Gestion des comptes (administrateur uniquement).
declare(strict_types=1);
require __DIR__ . '/lib.php';
$u = acces_utilisateur();
if (!$u) { header('Location: /acces/login.php?retour=' . rawurlencode('/acces/comptes.php')); exit; }
if (!empty($u['a_changer'])) { header('Location: /acces/motdepasse.php'); exit; }
if ($u['role'] !== 'admin') { http_response_code(403); exit('Accès réservé à l\'administrateur.'); }

$msg = ''; $info = ''; $secret = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $act = (string)($_POST['action'] ?? ''); $id = strtolower(trim((string)($_POST['identifiant'] ?? '')));
    $comptes = acces_comptes();
    $admins = count(array_filter($comptes, fn($c) => $c['role'] === 'admin' && !empty($c['actif'])));
    $idx = null; foreach ($comptes as $i => $c) if ($c['identifiant'] === $id) $idx = $i;
    if (!acces_csrf_ok($_POST['csrf'] ?? null)) $msg = 'Session expirée, veuillez réessayer.';
    elseif ($act === 'ajouter') {
        $role = ($_POST['role'] ?? '') === 'admin' ? 'admin' : 'user';
        if (!preg_match('/^[a-z0-9._-]{3,30}$/', $id)) $msg = 'Identifiant : 3 à 30 caractères (lettres minuscules, chiffres, . _ -).';
        elseif ($idx !== null) $msg = 'Cet identifiant existe déjà.';
        else {
            $secret = acces_mdp_provisoire();
            $comptes[] = ['identifiant' => $id, 'nom' => trim((string)($_POST['nom'] ?? '')), 'role' => $role, 'hash' => acces_hash($secret), 'a_changer' => true, 'actif' => true, 'version' => 1, 'derniere' => ''];
            acces_ecrire_comptes($comptes);
            $info = 'Compte « ' . $id . ' » créé.';
        }
    } elseif ($idx === null) $msg = 'Compte introuvable.';
    elseif ($act === 'reinitialiser') {
        $secret = acces_mdp_provisoire();
        $comptes[$idx]['hash'] = acces_hash($secret); $comptes[$idx]['a_changer'] = true; $comptes[$idx]['version'] = (int)$comptes[$idx]['version'] + 1;
        acces_ecrire_comptes($comptes);
        $info = 'Mot de passe de « ' . $id . ' » réinitialisé.';
    } elseif ($act === 'basculer') {
        if ($id === $u['identifiant'] || (!empty($comptes[$idx]['actif']) && $comptes[$idx]['role'] === 'admin' && $admins < 2)) $msg = 'Impossible de désactiver ce compte (le vôtre, ou le dernier administrateur).';
        else {
            $comptes[$idx]['actif'] = empty($comptes[$idx]['actif']); $comptes[$idx]['version'] = (int)$comptes[$idx]['version'] + 1;
            acces_ecrire_comptes($comptes);
            $info = 'Compte « ' . $id . ' » ' . ($comptes[$idx]['actif'] ? 'réactivé' : 'désactivé (connexions fermées)') . '.';
        }
    } elseif ($act === 'supprimer') {
        if ($id === $u['identifiant'] || (!empty($comptes[$idx]['actif']) && $comptes[$idx]['role'] === 'admin' && $admins < 2)) $msg = 'Impossible de supprimer ce compte (le vôtre, ou le dernier administrateur).';
        else { array_splice($comptes, $idx, 1); acces_ecrire_comptes($comptes); $info = 'Compte « ' . $id . ' » supprimé.'; }
    }
}
acces_page('Comptes', function () use ($msg, $info, $secret, $u) {
    if ($msg !== '') echo '<p class="err" role="alert">' . acces_h($msg) . '</p>';
    if ($info !== '') echo '<p class="ok" role="status">' . acces_h($info) . '</p>';
    if ($secret !== '') echo '<p class="ok"><strong>Mot de passe provisoire (affiché une seule fois) :</strong> <code>' . acces_h($secret) . '</code><br>Transmettez-le à la personne : il lui sera demandé d\'en choisir un nouveau à la première connexion.</p>';
    echo '<table><tr><th>Identifiant</th><th>Nom</th><th>Rôle</th><th>État</th><th>Dernière connexion</th><th>Actions</th></tr>';
    foreach (acces_comptes() as $c) {
        $f = function (string $act, string $lib, string $cls = 'sec petit') use ($c) {
            return '<form method="post" action="/acces/comptes.php" style="display:inline">' . acces_champ_csrf() . '<input type="hidden" name="identifiant" value="' . acces_h($c['identifiant']) . '"><input type="hidden" name="action" value="' . $act . '"><button class="' . $cls . '" type="submit"' . ($act === 'supprimer' ? ' onclick="return confirm(\'Supprimer ce compte ?\')"' : '') . '>' . $lib . '</button></form> ';
        };
        echo '<tr><td>' . acces_h($c['identifiant']) . '</td><td>' . acces_h((string)$c['nom']) . '</td><td>' . ($c['role'] === 'admin' ? 'Administrateur' : 'Utilisateur') . '</td><td>' . (!empty($c['actif']) ? 'Actif' . (!empty($c['a_changer']) ? ' (mot de passe provisoire)' : '') : 'Désactivé') . '</td><td>' . acces_h((string)($c['derniere'] ?? '')) . '</td><td>';
        echo $f('reinitialiser', 'Nouveau mot de passe') . $f('basculer', !empty($c['actif']) ? 'Désactiver' : 'Réactiver');
        if ($c['identifiant'] !== $u['identifiant']) echo $f('supprimer', 'Supprimer');
        echo '</td></tr>';
    }
    echo '</table><h2>Ajouter un compte</h2>';
    ?>
  <form method="post" action="/acces/comptes.php" autocomplete="off">
    <?= acces_champ_csrf() ?><input type="hidden" name="action" value="ajouter">
    <label for="identifiant">Identifiant</label><input id="identifiant" name="identifiant" type="text" required>
    <label for="nom">Nom affiché (facultatif)</label><input id="nom" name="nom" type="text">
    <label for="role">Rôle</label>
    <select id="role" name="role"><option value="user">Utilisateur (utilise l'éditeur)</option><option value="admin">Administrateur (en plus : bibliothèque et comptes)</option></select>
    <button type="submit">Créer le compte</button>
  </form>
<?php }, $u, '960px');
