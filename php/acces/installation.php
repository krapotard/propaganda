<?php
// Assistant d'installation : crée les deux premiers comptes (administrateur et utilisateur).
// Accès : créer le fichier acces/data/cle_installation.txt (une phrase aléatoire d'au moins 16 caractères),
// puis ouvrir /acces/installation.php et la saisir. À supprimer du serveur une fois terminé.
declare(strict_types=1);
require __DIR__ . '/lib.php';

$cleF = ACCES_DATA . '/cle_installation.txt';
$msg = '';
if (acces_installe()) {
    acces_page('Installation', function () { echo '<p class="ok"><strong>Installation terminée et verrouillée.</strong></p><p>Supprimez <code>acces/installation.php</code> et <code>acces/data/cle_installation.txt</code> du serveur.</p><p><a class="btn" href="/acces/login.php">Aller à la connexion</a></p>'; });
}
if (!is_file($cleF) || strlen(trim((string)file_get_contents($cleF))) < 16) {
    acces_page('Installation', function () { echo '<p class="err">Pour sécuriser l\'installation, créez sur le serveur le fichier <code>acces/data/cle_installation.txt</code> contenant une phrase aléatoire d\'au moins 16 caractères (et rien d\'autre), puis rechargez cette page.</p>'; }, null, '560px');
}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $ida = strtolower(trim((string)($_POST['id_admin'] ?? ''))); $idu = strtolower(trim((string)($_POST['id_user'] ?? '')));
    $ma = (string)($_POST['mdp_admin'] ?? ''); $mu = (string)($_POST['mdp_user'] ?? '');
    if (!acces_csrf_ok($_POST['csrf'] ?? null)) $msg = 'Session expirée, veuillez réessayer.';
    elseif (!hash_equals(trim((string)file_get_contents($cleF)), trim((string)($_POST['cle'] ?? '')))) { usleep(800000); $msg = 'Phrase d\'installation incorrecte.'; }
    elseif (!preg_match('/^[a-z0-9._-]{3,30}$/', $ida) || !preg_match('/^[a-z0-9._-]{3,30}$/', $idu) || $ida === $idu) $msg = 'Deux identifiants différents sont nécessaires (3 à 30 caractères : lettres minuscules, chiffres, . _ -).';
    elseif (strlen($ma) < 12 || strlen($mu) < 12) $msg = 'Chaque mot de passe doit faire au moins 12 caractères.';
    else {
        acces_ecrire_comptes([
            ['identifiant' => $ida, 'nom' => 'Administrateur', 'role' => 'admin', 'hash' => acces_hash($ma), 'a_changer' => false, 'actif' => true, 'version' => 1, 'derniere' => ''],
            ['identifiant' => $idu, 'nom' => 'Utilisateur', 'role' => 'user', 'hash' => acces_hash($mu), 'a_changer' => false, 'actif' => true, 'version' => 1, 'derniere' => ''],
        ]);
        header('Location: /acces/login.php'); exit;
    }
}
acces_page('Installation', function () use ($msg) {
    if ($msg !== '') echo '<p class="err" role="alert">' . acces_h($msg) . '</p>';
    ?>
  <p>Création des deux premiers comptes. D'autres comptes pourront être ajoutés ensuite depuis la page « Comptes ».</p>
  <form method="post" action="/acces/installation.php" autocomplete="off">
    <?= acces_champ_csrf() ?>
    <label for="cle">Phrase du fichier acces/data/cle_installation.txt</label>
    <input id="cle" name="cle" type="password" required autofocus>
    <h2>Compte administrateur</h2>
    <label for="id_admin">Identifiant</label><input id="id_admin" name="id_admin" type="text" value="admin" required>
    <label for="mdp_admin">Mot de passe (12 caractères minimum)</label><input id="mdp_admin" name="mdp_admin" type="password" minlength="12" required>
    <h2>Compte utilisateur</h2>
    <label for="id_user">Identifiant</label><input id="id_user" name="id_user" type="text" value="utilisateur" required>
    <label for="mdp_user">Mot de passe (12 caractères minimum)</label><input id="mdp_user" name="mdp_user" type="password" minlength="12" required>
    <button type="submit">Créer les comptes</button>
  </form>
<?php }, null, '560px');
