# CineVerse

Home cinema local auto-heberge, inspire des interfaces de streaming premium, avec catalogue TMDB, flux de nouveautes, recherche/filtrage, lecteur iframe configurable, suivi de progression et preferences persistantes.

## Stack

- Next.js App Router pour l'interface et l'API locale.
- Tailwind CSS pour l'UI sombre type cinema.
- SQLite via `better-sqlite3` pour l'historique, les likes/dislikes et le cache des API externes.
- Docker Compose pour un lancement local reproductible.
- TMDB pour les metadonnees, tendances, recherche, decouverte et recommandations.
- Cheerio pour lire les catalogues publics de nouveautes Films et Series.

## Demarrage rapide

### Prerequis

Choisis un seul mode de lancement:

- local: Node.js 22 et npm;
- conteneur: Docker avec le plugin Docker Compose.

Ne lance pas simultanement la version locale et la version Docker: elles
utilisent toutes les deux le port `3000` et peuvent ouvrir le meme fichier
SQLite.

### Configuration

Depuis la racine du projet:

```bash
cp .env.example .env
```

Renseigne ensuite au moins `TMDB_ACCESS_TOKEN` ou `TMDB_API_KEY` dans `.env`
pour utiliser le catalogue reel. Sans cle TMDB, CineVerse demarre avec un petit
catalogue de secours. Le fichier `.env` est local et ne doit pas etre commite.

### Lancer en local

```bash
npm ci
npm run dev
```

`npm ci` suffit normalement. Utilise `npm install` uniquement lorsque tu
modifies les dependances.

Ouvre ensuite `http://localhost:3000`.

Pour tester le mode production sans Docker:

```bash
npm run build
npm run start
```

### Lancer avec Docker

```bash
mkdir -p data
docker compose up --build
```

Ouvre ensuite `http://localhost:3000`. La base SQLite est conservee dans
`./data/cineverse.sqlite`; un redemarrage ou une reconstruction de l'image ne
supprime donc pas les likes, l'historique ou le cache.

Commandes utiles:

```bash
# Voir les journaux
docker compose logs -f cineverse

# Arreter proprement
docker compose down

# Reconstruire apres une modification
docker compose up --build
```

### Erreur SQLite avec Docker

Si les journaux affichent `SQLITE_CANTOPEN` ou `unable to open database file`,
le conteneur ne peut pas ecrire dans `/app/data`. Le volume Compose utilise
`./data:/app/data:Z`: le suffixe `:Z` applique automatiquement le label requis
par SELinux sur Fedora, RHEL et les distributions apparentees.

Apres avoir recupere cette correction, redemarre completement le service:

```bash
docker compose down
mkdir -p data
docker compose up --build
```

Pour verifier le montage et les journaux:

```bash
docker compose config
docker compose logs -f cineverse
```

Sur une machine sans SELinux, `:Z` est sans effet particulier. Pour stocker la
base ailleurs en mode local, configure `CINEVERSE_DATA_DIR` avec un chemin
absolu accessible en lecture et en ecriture.

## Donnees et cache

Les reponses TMDB deja consultees sont conservees dans `external_api_cache`.
Les tendances expirent rapidement, tandis que les fiches et credits restent en
cache plus longtemps. Une reponse expiree peut servir de secours si TMDB est
temporairement indisponible.

Les catalogues `Nouveautes Films` et `Nouveautes Series` demandent d'abord a
`https://fstream.info/` quel est le domaine FStream courant, puis consultent les
rubriques Films et Series de ce domaine. CineVerse ne reprend que l'ordre, le
titre et l'affiche, puis exige une correspondance TMDB avant d'afficher une
fiche cliquable. TMDB reste donc la source canonique pour les identifiants,
notes, synopsis, genres, credits et filtres.

Le domaine courant et le HTML des catalogues sont gardes 30 minutes. Les
recherches TMDB sont gardees 24 heures. `FSTREAM_BASE_URL` peut forcer
temporairement un domaine en cas de panne de la page d'annonce. Par securite,
la decouverte accepte uniquement les origines HTTPS `fs<number>.lol`. Si le
domaine officiel change de suffixe, ajoute son origine exacte dans
`FSTREAM_ALLOWED_ORIGINS`, puis redemarre CineVerse.

Le bloc `Pour vous` combine les recommandations et titres similaires TMDB avec
les genres, langues, notes et popularite. Les likes explicites et les contenus
termines servent de signaux positifs; un simple lancement ne suffit pas. Un
dislike exclut toujours le titre concerne et applique seulement une penalite
legere aux genres proches afin de ne pas sur-apprendre a partir d'un seul avis.

## Profils et statistiques

Chaque profil possede ses propres reprises, likes, dislikes, evenements,
statistiques et recommandations. Le menu du profil donne acces a
`/stats`, avec:

- le temps de lecture reellement mesure cette semaine, ce mois et au total;
- les films, episodes et titres termines;
- les habitudes de visionnage et les jours actifs;
- les genres, langues et sources les plus utilises;
- la progression des series et les abandons probables;
- un recapitulatif mensuel.

Les evenements sont stockes dans `viewing_events` et les sessions detaillees
dans `watch_sessions`. Le suivi distingue la progression confirmee par un
lecteur, le temps estime lorsque l'onglet est visible et le marquage manuel. Un
marquage manuel compte comme une completion, mais n'ajoute jamais la duree
officielle au temps regarde.

Sans signal du lecteur, CineVerse envoie un heartbeat local toutes les 15
secondes. Les intervalles masques, en pause, en buffering ou superieurs a 45
secondes ne sont pas comptes. Cette mesure reste identifiee comme une
estimation, car une iframe cross-origin ne permet pas de prouver seule que la
video joue reellement.

### Extension de suivi optionnelle

Le dossier [`extensions/cineverse-companion`](extensions/cineverse-companion)
contient une extension Chrome/Chromium Manifest V3. Elle s'execute dans les
frames des providers autorises et transmet les vrais evenements du
`HTMLVideoElement`: position, duree, lecture, pause, buffering, seek et fin.
Elle calcule aussi un temps confirme en excluant les sauts dans la timeline.

Pour l'installer localement, ouvre `chrome://extensions`, active le mode
developpeur, choisis **Charger l'extension non empaquetee**, puis selectionne
`extensions/cineverse-companion`. Recharge ensuite CineVerse. Les details et
limites sont decrits dans le README de l'extension.

Avec cette extension, une fin reelle ou l'arrivee dans les 45 dernieres
secondes peut terminer le contenu et declencher l'auto-next. Le suivi hybride
reste actif comme fallback lorsque le provider ou son domaine n'est pas
observable.

Le compteur confirme avance avec la timeline du media et exclut les pauses,
le buffering et les sauts. Il continue en arriere-plan lorsque Chromium laisse
la lecture active. Un clic sur l'icone de l'extension affiche son diagnostic en
direct.

## Sources video

TMDB fournit le catalogue et les metadonnees. Fstream est un adaptateur de
source qui cherche une fiche correspondante et retourne des candidats de
lecture. Uqload, Voe, Dood, Filmoon et Netu sont des hebergeurs, pas cinq
sources independantes: si Fstream tombe, ces candidats ne peuvent plus etre
renouveles, mais le cache perime et les providers configures separement restent
disponibles.

Chaque candidat conserve sa source, son hebergeur, sa langue audio, ses
sous-titres, sa saison, son episode, ses capacites et un score de fiabilite.
Pour les films, VFF et VFQ restent distinctes; VOSTFR represente une piste
originale avec sous-titres francais. Pour une serie, le lien est resolu pour la
saison et l'episode selectionnes. Les lecteurs et langues absents ne sont pas
proposes.

Le `StreamResolver` interroge les adaptateurs de sources independamment,
ignore proprement une source en echec, puis regroupe et classe leurs candidats.
Ajouter une deuxieme source ne demande donc pas de modifier l'adaptateur
Fstream ni le registre des hebergeurs.

Les JSON distants sont valides a l'execution. Une URL de lecteur est acceptee
uniquement si son domaine et son chemin correspondent au registre de
l'hebergeur annonce. Pour approuver temporairement un nouveau domaine sans
modifier le code, utilise une valeur JSON sur une seule ligne:

```dotenv
CINEVERSE_PLAYER_HOST_ALLOWLIST_JSON={"voe":["nouveau-domaine.example"]}
```

Cette extension est volontairement explicite. Elle ajoute aussi l'origine a la
politique CSP des iframes et necessite un redemarrage de l'application.

Les correspondances FStream/TMDB sont gardees sept jours et les liens lecteurs
15 a 30 minutes dans SQLite. Cela limite les requetes sans conserver les flux
video eux-memes.

Le lecteur de demonstration local reste disponible lorsqu'aucun provider n'est
configure. Pour brancher d'autres lecteurs ou services autorises, configure
`CINEVERSE_EMBED_PROVIDERS_JSON` dans `.env`. Garde cette valeur sur une seule
ligne, sinon Next et Docker ne liront que le premier `[` au runtime.

Placeholders disponibles dans les templates:

- `{tmdbId}`
- `{mediaType}` ou `{providerMediaType}`: `movie` pour films, `serie` pour series
- `{tmdbMediaType}`: `movie` ou `tv`
- `{title}`
- `{language}`
- `{languagePath}`: vide pour VO, sinon `/vf` ou `/vostfr`
- `{season}`
- `{episode}`
- `{seasonEpisodePath}`: vide pour films, sinon `/{season}/{episode}`
- `{autoplay}` et `{autoNext}`: `1` ou `0`

Tu peux aussi declarer les langues exposees par un provider:

```json
"languages": [
  { "id": "vf", "label": "VF" },
  { "id": "vostfr", "label": "VOSTFR" }
]
```

Si `languages` est absent, CineVerse propose `VF`, `VOSTFR`, puis `VO`, avec `VF` preselectionne.

Un provider peut aussi exposer un endpoint de disponibilite avec
`"availabilityApi": "https://example.test/api/{tmdbId}"`. Si sa reponse contient
`available`, `detectedType`, `title`, `year`, `poster` et `languages`, CineVerse
masque les sources indisponibles, adapte les langues du lecteur et utilise ces
informations si TMDB est temporairement inaccessible.

Exemple:

```json
[
  {
    "id": "my-provider",
    "name": "My Provider",
    "template": "https://example.test/embed/{mediaType}/{tmdbId}{seasonEpisodePath}{languagePath}",
    "supportsTracking": true,
    "supportsLanguage": true,
    "priority": 1
  }
]
```

## Routes utiles

- `GET /api/progress` liste les reprises de lecture.
- `POST /api/progress` sauvegarde la progression.
- `GET /api/likes` liste les contenus aimes.
- `POST /api/likes` ajoute ou retire un like.
- `GET /api/dislikes` liste les contenus ignores.
- `POST /api/dislikes` ajoute ou retire un dislike.
- `GET /api/recommendations` renvoie des recommandations basees sur les likes et dislikes.
- `POST /api/events` enregistre un signal de navigation ou de lecture pour le profil actif.
- `POST /api/watch-sessions` valide les heartbeats et agrege le suivi hybride.
- `GET /stats` affiche les statistiques du profil actif.

## Git

Le depot est initialise sur `main` avec des commits separes par etape: scaffold, dependances, application, puis packaging.
