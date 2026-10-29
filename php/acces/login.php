<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';

$retour = acces_retour($_GET['retour'] ?? $_POST['retour'] ?? '/');
$u = acces_utilisateur();
if ($u && empty($u['a_changer'])) { header('Location: ' . $retour); exit; }

$erreur = '';
if (!acces_installe()) {
    $erreur = 'Aktivisda n\'est pas encore installé. <a href="/acces/installation.php">Lancer l\'installation</a>.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!acces_csrf_ok($_POST['csrf'] ?? null)) {
        $erreur = acces_h('Session expirée, veuillez réessayer.');
    } else {
        $e = acces_connecter((string)($_POST['identifiant'] ?? ''), (string)($_POST['mdp'] ?? ''));
        if ($e === null) {
            $c = acces_compte((string)$_POST['identifiant']);
            header('Location: ' . (!empty($c['a_changer']) ? '/acces/motdepasse.php' : $retour));
            exit;
        }
        $erreur = acces_h($e);
    }
}

acces_page('Connexion', function () use ($erreur, $retour) {
    if ($erreur !== '') echo '<p class="err" role="alert">' . $erreur . '</p>';
    ?>
  <form method="post" action="/acces/login.php">
    <?= acces_champ_csrf() ?>
    <input type="hidden" name="retour" value="<?= acces_h($retour) ?>">
    <label for="identifiant">Identifiant</label>
    <input id="identifiant" name="identifiant" type="text" autocomplete="username" autocapitalize="none" required autofocus>
    <label for="mdp">Mot de passe</label>
    <input id="mdp" name="mdp" type="password" autocomplete="current-password" required>
    <button type="submit">Se connecter</button>
  </form>
  <p class="aide">Outil réservé aux militantes et militants de la CGT FT Occitanie. Mot de passe perdu : contactez l'administrateur.</p>
<?php });
