# TizenSama

Interface télé façon Apple TV pour le catalogue anime-sama, conçue pour les Samsung Tizen via [TizenBrew](https://github.com/reisxd/TizenBrew). Tout se pilote à la télécommande : accueil avec mise en avant, étagères par genre, catalogue filtrable, recherche au clavier virtuel, liste personnelle, reprise de lecture et lecteur plein écran avec contrôles de transport.

Les vidéos sont lues depuis les lecteurs intégrés présents dans le catalogue (ansembed, Sibnet, Sendvid, Uqload, VK, etc.). L'application ne contacte jamais anime-sama : elle n'utilise que `catalogue.json` et les images publiques (vignettes du dépôt Anime-Sama/IMG, affiches TMDB).

## Installation sur la TV

1. Installer TizenBrew sur la TV (voir sa documentation) et le lancer.
2. Ouvrir le gestionnaire de modules, choisir **Ajouter un module GitHub** et saisir :

   ```
   OxiWanV2/TizenSama
   ```

3. Revenir à la liste des modules et lancer **TizenSama**.

TizenBrew charge les fichiers depuis jsDelivr (`cdn.jsdelivr.net/gh/OxiWanV2/TizenSama`). Après un push sur la branche principale, la mise à jour est visible sur la TV sous 12 heures au maximum (cache du CDN). Si le dépôt est renommé ou forké, adapter `websiteURL` dans `package.json` (le nom du module y est encodé : `gh%2FUtilisateur%2FDepot`).

Le lecteur affiche l'embed du site hébergeur en plein écran, sans rien par-dessus : ce sont ses propres commandes qui répondent à la télécommande (OK ou ▶❚❚ pour lecture/pause, flèches pour avancer ou reculer selon le lecteur). Le module est de type `mods` : TizenBrew injecte `app/agent.js` dans chaque page chargée, y compris les iframes des lecteurs. Ce script ne dessine rien ; il bloque les popups publicitaires, lance la lecture, reprend à la dernière position mémorisée et renvoie à l'application les touches qui lui sont réservées (Retour, couleurs, chaînes), sans quoi la télécommande resterait prisonnière de l'iframe. Cela suppose que TizenBrew tourne dans son mode habituel (mode développeur activé, IP hôte `127.0.0.1`).

## Télécommande

| Touche | Interface | Lecteur |
| --- | --- | --- |
| Flèches | Navigation | Transmises au lecteur intégré (avance / recul, volume) ; ±10 s si le lecteur ne les gère pas |
| OK | Ouvrir, maintenir pour le menu contextuel | Lecture / pause |
| Retour | Écran précédent, quitter depuis l'accueil | Quitter le lecteur |
| ▶❚❚, ▶, ❚❚, ■ | Lire directement l'élément sélectionné | Lecture / pause, lecture, pause, quitter |
| ◀◀ / ▶▶ | | Recule / avance de 10 s |
| ❚◀◀ / ▶▶❚, CH− / CH+ | | Épisode précédent / suivant |
| Rouge | | Lecteur suivant (ansembed, Sibnet, Sendvid, …) |
| Vert | | Changer de langue (VOSTFR / VF) |
| Jaune | | Panneau Épisodes / Lecteurs / Langue |
| Bleu | | Mode souris : un curseur apparaît dans le lecteur, flèches pour le déplacer (accélère en maintenant), OK pour cliquer (fermer une pub, bouton du lecteur), bleu ou Retour pour quitter |
| 0 à 9 | | Aller à 0 %, 10 %, … 90 % (lecteurs sans raccourcis) |

Le lecteur préféré se choisit dans les réglages ou sur la fiche de l'anime. À la fin d'un épisode, le suivant démarre automatiquement (désactivable dans les réglages).

## Données

`tools/build_catalogue.py` transforme `catalogue.json` en fichiers légers consommés par la TV :

```
python3 tools/build_catalogue.py catalogue.json
```

Sortie dans `app/data/` :

- `index.json` : un enregistrement compact par anime (titre, affiche, année, statut, genres, langues, nombre d'épisodes) ;
- `search.json` : titres et titres alternatifs normalisés pour la recherche ;
- `anime/<slug>.json` : fiche complète avec saisons, langues, épisodes et lecteurs, chargée à la demande.

Les entrées sans épisode lisible sont écartées, les artefacts du scraping sont nettoyés (saison `nom`, saisons vides, lecteurs aux identifiants vides) et les genres sont normalisés.

## Structure

```
package.json            manifeste TizenBrew (type mods, touches enregistrées)
app/index.html          page de l'application
app/css/app.css         styles (grille 1920×1080, unités rem basées sur la largeur)
app/js/core.js          utilitaires, icônes, stockage local
app/js/data.js          chargement et requêtes sur le catalogue
app/js/focus.js         navigation spatiale à la télécommande
app/js/ui.js            composants : cartes, étagères, boutons, modales, clavier
app/js/screens.js       écrans Accueil, Catalogue, Recherche, Ma liste, Réglages, Fiche
app/js/player.js        lecteur : iframe du lecteur tiers + interface de transport
app/js/app.js           routeur, barre d'onglets, gestion des touches
app/agent.js            script injecté dans les iframes des lecteurs (pont postMessage)
app/data/               données générées
tools/build_catalogue.py
```

Le code cible les moteurs Chromium des TV Tizen depuis 2017 (Chromium 47) : JavaScript ES5, flexbox, transformations CSS, sans dépendance externe hormis la police Inter servie par jsDelivr.

## Test sur un ordinateur

Servir le dossier `app/` avec n'importe quel serveur statique, par exemple :

```
cd app && python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/` dans Chrome. Les flèches, Entrée, Retour arrière (Retour), Espace (lecture/pause), N et P (épisode suivant/précédent), L (lecteur suivant), V (langue), O (panneau) et M (mode souris) sont mappés au clavier. Sans TizenBrew, aucun script n'est injecté dans les iframes : une fois le focus dans le lecteur (clic), les touches ne reviennent plus à l'application, il faut recharger la page.
