# CineVerse

Home cinema local auto-heberge, inspire des interfaces de streaming premium, avec catalogue TMDB, flux de nouveautes, recherche/filtrage, lecteur iframe configurable, suivi de progression et preferences persistantes.

## Stack

- Next.js App Router pour l'interface et l'API locale.
- Tailwind CSS pour l'UI sombre type cinema.
- SQLite via `better-sqlite3` pour l'historique, les likes/dislikes et le cache des API externes.
- Docker Compose pour un lancement local reproductible.
- TMDB pour les metadonnees, tendances, recherche, decouverte et recommandations.
- Cheerio pour lire les catalogues publics de nouveautes Films et Series.

## Lancer en local

```bash
cp .env.example .env
npm install
npm run dev
```

Ouvre ensuite `http://localhost:3000`.

Sans cle TMDB, CineVerse demarre avec un petit catalogue de secours. Pour les vraies donnees, renseigne `TMDB_ACCESS_TOKEN` ou `TMDB_API_KEY` dans `.env`.

## Lancer avec Docker

```bash
cp .env.example .env
docker compose up --build
```

La base SQLite est montee dans `./data/cineverse.sqlite`.

Les reponses TMDB deja consultees sont conservees dans `external_api_cache`.
Les tendances expirent rapidement, tandis que les fiches et credits restent en
cache plus longtemps. Une reponse expiree peut servir de secours si TMDB est
temporairement indisponible.

Les catalogues `Nouveautes Films` et `Nouveautes Series` suivent par defaut
`https://fs16.lol/films/` et `https://fs16.lol/s-tv/`. CineVerse ne reprend que
l'ordre, le titre et l'affiche, puis exige une correspondance TMDB avant
d'afficher une fiche cliquable. Le HTML source est garde 30 minutes et les
recherches TMDB 24 heures. `FS16_BASE_URL` permet de changer le domaine si
necessaire.

Le bloc `Pour vous` combine les recommandations et titres similaires TMDB avec
les genres, langues, notes et popularite. Un dislike exclut toujours le titre
concerne et applique seulement une penalite legere aux genres proches afin de
ne pas sur-apprendre a partir d'un seul avis.

## Sources video

Par defaut, CineVerse utilise un lecteur de demonstration local qui emet des evenements `postMessage` compatibles avec le suivi de progression. Pour brancher tes propres lecteurs ou services autorises, configure `CINEVERSE_EMBED_PROVIDERS_JSON` dans `.env`. Garde cette valeur sur une seule ligne, sinon Next et Docker ne liront que le premier `[` au runtime.

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

## Git

Le depot est initialise sur `main` avec des commits separes par etape: scaffold, dependances, application, puis packaging.
