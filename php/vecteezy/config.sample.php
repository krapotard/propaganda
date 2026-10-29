<?php
// Copier ce fichier en config.php et remplir les deux premières lignes.
// config.php ne contient que du PHP : si on l'ouvre dans un navigateur, il n'affiche rien.
return [
    'api_key'      => 'COLLER_ICI_LA_CLE_API',
    'account_id'   => 'COLLER_ICI_LE_NUMERO_DE_COMPTE',
    'monthly_max'  => 450,   // téléchargements par mois (le plan gratuit en offre 500) : on s'arrête avant
    'per_ip_daily' => 15,    // téléchargements par jour et par visiteur
];
