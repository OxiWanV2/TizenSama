# TizenSama

Interface télé façon Apple TV pour le catalogue anime-sama, conçue pour les Samsung Tizen via [TizenBrew](https://github.com/reisxd/TizenBrew). Tout se pilote à la télécommande : accueil avec mise en avant, étagères par genre, catalogue filtrable, recherche au clavier virtuel, liste personnelle, reprise de lecture et lecteur plein écran.

Les vidéos sont lues depuis les lecteurs présents dans le catalogue (VOE, ansembed, Uqload, VK, Sendvid, etc.), via le serveur du NAS ou leur embed. Les hébergeurs morts (OneUpload, Sibnet, movearnpre, mivalyo, uptostream, morencius) sont ignorés au chargement de chaque fiche. L'application ne contacte jamais anime-sama : elle n'utilise que les données générées depuis `catalogue.json` et les images publiques (vignettes du dépôt Anime-Sama/IMG, affiches TMDB).

Les données ne sont pas dans ce dépôt : elles sont chiffrées avec un code PIN, publiées sur `https://lorenzogallo.be/json/tizen/` et déchiffrées sur la TV après saisie du code (demandé une seule fois).

## Installation sur la TV

1. Installer TizenBrew sur la TV (voir sa documentation) et le lancer.
2. Ouvrir le gestionnaire de modules, choisir **Ajouter un module GitHub** et saisir :

   ```
   OxiWanV2/TizenSama@v1.4.6
   ```

3. Revenir à la liste des modules et lancer **TizenSama**.
4. Au premier lancement, saisir le code PIN du catalogue (touches chiffres de la télécommande, ou pavé à l'écran avec les flèches et OK). Le code est ensuite mémorisé sur la TV ; il peut être oublié depuis les réglages.

Le module est ajouté **avec le tag de la version** (`@v1.4.6`). TizenBrew charge alors `package.json`, `app/index.html`, les scripts, le CSS et `app/agent.js` depuis ce tag Git, que jsDelivr sert toujours à l'identique. Les branches (`@main` ou sans suffixe) sont à éviter : les serveurs de jsDelivr restent incohérents pendant des minutes, voire des heures, après un push, même après purge, et une TV pouvait recevoir un mélange d'anciens et de nouveaux fichiers. Hors TizenBrew (chemin sans `/module/`), `index.html` utilise les fichiers locaux.

Publier une version :

1. Mettre le même numéro dans `release` (`app/index.html`), `TS.VERSION` (`app/js/core.js`), `version` et `websiteURL` (`package.json`, `…TizenSama%40v1.4.7/app/index.html`).
2. Commiter, créer le tag (`git tag v1.4.7`) et pousser la branche et le tag (`git push origin main v1.4.7`).
3. Sur la TV, dans le gestionnaire de modules de TizenBrew, supprimer l'ancien module et ajouter `OxiWanV2/TizenSama@v1.4.7`, puis relancer. Aucune purge ni redémarrage à froid n'est nécessaire : le nom du module change, donc TizenBrew recharge aussi l'agent.

Le service TizenBrew garde le script `app/agent.js` en mémoire sous le nom du module, d'où l'intérêt de changer de tag à chaque version. Si le dépôt est renommé ou forké, adapter `websiteURL` dans `package.json` (le nom du module y est encodé : `gh%2FUtilisateur%2FDepot%40vX.Y.Z`).

Le lecteur affiche l'embed du site hébergeur en plein écran, sans rien par-dessus : ce sont ses propres commandes qui répondent à la télécommande. Le module est de type `mods` : TizenBrew injecte `app/agent.js` dans chaque page chargée, y compris les iframes des lecteurs. Sur les lecteurs ordinaires, ce script ne dessine rien ; il bloque les popups publicitaires, lance la lecture, reprend à la dernière position mémorisée et renvoie à l'application les touches qui lui sont réservées (Retour, couleurs, chaînes). Cas particulier des lecteurs VOE (derricknationtop.com et ses autres domaines, reconnus au contenu de la page et non au nom de domaine) : leur page contient un piège anti-débogage (instruction `debugger`) qui la fige sous TizenBrew, puisque celui-ci active le débogueur sans jamais relancer une page en pause. L'application n'ouvre donc jamais cette page : l'iframe charge le `robots.txt` du domaine (simple fichier texte, sans script), le script y relit la page de l'épisode par une requête interne au domaine, suit les redirections des miroirs, décode l'adresse du flux (mp4 direct, sinon HLS) et affiche une balise `<video>` native habillée d'une interface façon Apple TV : titre de l'épisode, barre de progression avec mémoire tampon, temps écoulé et restant, icônes de lecture et de pause, indicateurs de saut. Dans ce lecteur, OK met en pause ou relance, gauche et droite sautent de 10 s et maintenus font défiler la barre en accélérant (relâcher pour valider, Retour pour annuler), haut et bas affichent les informations. Les jetons du CDN étant liés à l'adresse IP qui a chargé la page, tout se passe sur la TV, sans serveur intermédiaire. Cela suppose que TizenBrew tourne dans son mode habituel (mode développeur activé, IP hôte `127.0.0.1`).

## Lecture via le NAS

Pour VOE, ansembed, Uqload, la famille callistanise (minochinos, dingtezuni, bingezove, smoothpre), VK, Vidmoly, YourUpload et Sendvid, l'application demande le flux au serveur `nas-stream` installé sur le NAS (`TS.NAS_URL` dans `app/js/core.js`, `http://192.168.0.79:8632` par défaut). Le NAS lit la page de l'embed, en extrait la vidéo et la renvoie en mp4 : mp4 relayé tel quel, ou HLS converti par ffmpeg sans réencodage. L'application la joue dans son propre lecteur façon Apple TV, dans sa page et non dans une iframe : titre et épisode, barre de progression, temps restant, sauts de 10 s, défilement accéléré en maintenant gauche ou droite, touches chiffres pour aller à 0 %, 10 %, … 90 %.

Ces lecteurs passent en tête de liste. Si le NAS répond que la vidéo est indisponible, l'application passe au lecteur suivant. Si le NAS est injoignable, elle revient au lecteur intégré de l'hébergeur. Le réglage **Lecture via le NAS** permet de désactiver ce mode. Le serveur n'est pas dans ce dépôt : voir son propre README.

## Télécommande

| Touche | Interface | Lecteur |
| --- | --- | --- |
| Flèches | Navigation | Transmises au lecteur intégré (avance / recul, volume) ; ±10 s si le lecteur ne les gère pas |
| OK | Ouvrir, maintenir pour le menu contextuel | Lecture / pause |
| Retour | Écran précédent, quitter depuis l'accueil | Quitter le lecteur |
| 0 à 9 | Saisie du code PIN | Aller à 0 %, 10 %, … 90 % (lecteurs sans raccourcis) |
| ▶❚❚, ▶, ❚❚, ■ | Lire directement l'élément sélectionné | Lecture / pause, lecture, pause, quitter |
| ◀◀ / ▶▶ | | Recule / avance de 10 s |
| ❚◀◀ / ▶▶❚, CH− / CH+ | | Épisode précédent / suivant |
| Rouge | | Lecteur suivant (ansembed, Sibnet, Sendvid, …) |
| Vert | | Changer de langue (VOSTFR / VF) |
| Jaune | | Panneau Épisodes / Lecteurs / Langue |
| Bleu | | Mode souris : un curseur apparaît dans le lecteur, flèches pour le déplacer (accélère en maintenant), OK pour cliquer, bleu ou Retour pour quitter |

Sur l'écran du code PIN : chiffres pour saisir (le focus passe alors sur OK), flèches et OK pour le pavé à l'écran, Retour pour effacer le dernier chiffre (Retour sur un code vide quitte l'application).

Ordre des lecteurs pour chaque épisode : d'abord celui retenu pour l'anime, puis les lecteurs VOE (lus en natif), puis le lecteur préféré des réglages, puis les autres. Le lecteur d'un anime se choisit sur sa fiche ; changer de lecteur pendant la lecture (touche rouge ou panneau jaune) le retient aussi pour cet anime, sans toucher au réglage global. Un changement automatique après une panne ne modifie rien. Les hébergeurs sont affichés sous un nom court (VOE pour tous ses miroirs, ansembed, Uqload, Sibnet…), le nom technique restant celui du catalogue.

Les synopsis trop longs pour leur cadre défilent lentement d'eux-mêmes, sur l'accueil comme sur la fiche ; le réglage **Défilement des synopsis** permet de les figer avec des points de suspension. À la fin d'un épisode, le suivant démarre automatiquement (désactivable dans les réglages).

## Données

Trois étapes : générer les JSON, les chiffrer avec un code PIN, publier le dossier chiffré. Aucun fichier JSON n'est versionné (`.gitignore`), seul `package.json` l'est.

### 1. Générer

`tools/build_catalogue.py` transforme `catalogue.json` en fichiers légers :

```
python3 tools/build_catalogue.py catalogue.json
```

Sortie dans `app/data/` (ignoré par git) :

- `index.json` : un enregistrement compact par anime (titre, affiche, année, statut, genres, langues, nombre d'épisodes) ;
- `search.json` : titres et titres alternatifs normalisés pour la recherche ;
- `anime/<slug>.json` : fiche complète avec saisons, langues, épisodes et lecteurs, chargée à la demande.

Les entrées sans épisode lisible sont écartées, les artefacts du scraping sont nettoyés et les genres sont normalisés.

Des animes absents de l'export peuvent être ajoutés à la main dans `tools/extras.json` (ignoré par git), sous la même forme qu'une entrée de `catalogue.json` : `slug`, `title`, `synopsis`, `genres`, `infos`, `poster`, `image`, `thumb` et `seasons` avec, par épisode, la liste des lecteurs `{ "player": "Vidmoly", "url": "https://…" }`. Un slug déjà présent dans l'export est remplacé. Les épisodes dont l'adresse n'est pas une URL valide sont ignorés.

### 2. Chiffrer avec un code PIN

```
python3 tools/lock_json.py
```

Le script demande le code PIN (4 à 12 chiffres, saisie masquée ; la variable d'environnement `TIZENSAMA_PIN` évite la question pour un usage scripté) et écrit dans `dist/tizen/` (ignoré par git) une copie chiffrée de chaque fichier plus un `manifest.json` public. Python 3 seul suffit ; si le paquet `cryptography` est installé il est utilisé, sinon une implémentation AES pure Python parallélisée prend le relais (quelques secondes).

Schéma : clé maître dérivée du PIN par PBKDF2-HMAC-SHA256 (100 000 itérations, sel aléatoire de 16 octets), sous-clés de chiffrement et d'authentification dérivées par HMAC, chaque fichier chiffré en AES-256-CTR avec un nonce aléatoire et authentifié par HMAC-SHA256 (nom du fichier inclus). Le manifeste contient le sel, le nombre d'itérations et une valeur de contrôle qui permet à la TV de distinguer un code faux d'un fichier corrompu. Un PIN court reste un PIN : la protection sert à ne pas exposer le catalogue en clair sur un serveur public, pas à résister à une attaque déterminée ; préférer 6 chiffres ou plus.

Le sel est réutilisé d'une exécution à l'autre tant que `dist/tizen/manifest.json` existe : en rechiffrant avec le même code, les TV déjà déverrouillées le restent. Avec un nouveau code, il est redemandé au prochain lancement. `--new-salt` force un nouveau sel, `--iterations N` change le coût de dérivation (nouveau sel uniquement).

Vérification ou récupération en clair :

```
python3 tools/lock_json.py --unlock --out /tmp/plain
```

### 3. Publier

Copier le contenu de `dist/tizen/` tel quel (manifest.json, index.json, search.json, anime/) à l'URL définie par `TS.DATA_URL` dans `app/js/core.js`, soit `https://lorenzogallo.be/json/tizen/` :

```
rsync -av --delete dist/tizen/ serveur:/var/www/lorenzogallo.be/json/tizen/
```

L'application tourne sur la TV depuis l'origine `http://127.0.0.1:8081`, les fichiers sont donc chargés en inter-origine : le serveur doit renvoyer l'en-tête `Access-Control-Allow-Origin`. Exemple nginx :

```
location /json/tizen/ {
    add_header Access-Control-Allow-Origin "*" always;
    add_header Cache-Control "public, max-age=3600" always;
    types { application/json json; }
}
```

Si le manifeste est absent (réponse 404), l'application considère les fichiers en clair et ne demande pas de code : pratique pour tester avec un dossier `app/data/` servi localement.

Sur la TV, le déchiffrement utilise WebCrypto lorsqu'il est disponible et une implémentation JavaScript de secours sinon (`app/js/crypto.js`, validée contre les mêmes vecteurs). Seule la clé dérivée est mémorisée dans le stockage local, jamais le code lui-même.

## Structure

```
package.json            manifeste TizenBrew (type mods, touches enregistrées)
app/index.html          page de l'application
app/css/app.css         styles (grille 1920×1080, unités rem basées sur la largeur)
app/js/core.js          utilitaires, icônes, stockage local, URL des données
app/js/crypto.js        SHA-256, HMAC, PBKDF2, AES-CTR (WebCrypto puis repli JavaScript)
app/js/vault.js         manifeste, dérivation et mémorisation de la clé, déchiffrement des fichiers
app/js/data.js          chargement et requêtes sur le catalogue
app/js/focus.js         navigation spatiale à la télécommande
app/js/ui.js            composants : cartes, étagères, boutons, modales, clavier, fonds flous
app/js/pin.js           écran de saisie du code PIN
app/js/screens.js       écrans Accueil, Catalogue, Recherche, Ma liste, Réglages, Fiche
app/js/player.js        lecteur : iframe du lecteur tiers + panneau à la demande
app/js/app.js           routeur, barre d'onglets, gestion des touches, démarrage
app/agent.js            script injecté dans les iframes des lecteurs (pont postMessage)
tools/build_catalogue.py
tools/lock_json.py
```

Le code cible les moteurs Chromium des TV Tizen depuis 2017 (Chromium 47) : JavaScript ES5, flexbox, transformations CSS, sans dépendance externe hormis la police Inter servie par jsDelivr.

Côté performances, l'interface évite tout ce qui coûte cher aux TV : les fonds flous sont calculés une fois dans de petits canvas plutôt qu'avec des filtres CSS plein écran, les ombres de focus sont animées par opacité d'un calque pré-rendu, les étagères de l'accueil sont remplies progressivement, le stockage local est mis en cache en mémoire et la navigation spatiale n'évalue que les rangées utiles (attribut `data-row`) au lieu de mesurer chaque élément de l'écran à chaque touche.

## Test sur un ordinateur

Servir le dossier `app/` avec n'importe quel serveur statique, par exemple :

```
cd app && python3 -m http.server 8000
```

puis ouvrir `http://localhost:8000/` dans Chrome : les données sont chargées depuis l'URL publique, le code PIN est demandé comme sur la TV. Pour utiliser d'autres données, ajouter `?data=` (hors TV uniquement) : `?data=data/` pour les fichiers en clair de `app/data/`, ou `?data=http://localhost:8001/` pour un dossier `dist/tizen/` servi avec l'en-tête CORS.

Les flèches, Entrée, Retour arrière (Retour), chiffres, Espace (lecture/pause), N et P (épisode suivant/précédent), L (lecteur suivant), V (langue), O (panneau) et M (mode souris) sont mappés au clavier. Sans TizenBrew, aucun script n'est injecté dans les iframes : une fois le focus dans le lecteur (clic), les touches ne reviennent plus à l'application, il faut recharger la page.

Pour reproduire l'injection de TizenBrew (lecture native VOE, touches renvoyées, reprise), installer `tools/agent.user.js` dans Tampermonkey ou Violentmonkey. Ce fichier est généré à partir de `app/agent.js` : après chaque modification de l'agent, relancer `python3 tools/build_userscript.py` puis mettre à jour le script dans l'extension.
