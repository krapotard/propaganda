<?php
// Qui est connecté ? Utilisé par la barre du haut de l'éditeur (bouton Déconnexion, lien Administration).
declare(strict_types=1);
require __DIR__ . '/lib.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
$u = acces_utilisateur();
if (!$u) { http_response_code(401); echo '{"connecte":false}'; exit; }
echo json_encode(['connecte' => true, 'identifiant' => $u['identifiant'], 'nom' => $u['nom'], 'role' => $u['role'], 'csrf' => acces_csrf()], JSON_UNESCAPED_UNICODE);
