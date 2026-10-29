<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
// Déconnexion par POST + jeton : un lien externe ne peut pas déconnecter l'utilisateur.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && acces_csrf_ok($_POST['csrf'] ?? null)) acces_oublier();
header('Location: /acces/login.php');
