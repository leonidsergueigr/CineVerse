# CineVerse

Home cinema local auto-heberge, inspire des interfaces de streaming premium, avec catalogue TMDB, recherche/filtrage, lecteur iframe configurable, suivi de progression et likes persistants.

## Stack

- Next.js App Router pour l'interface et l'API locale.
- Tailwind CSS pour l'UI sombre type cinema.
- SQLite via `better-sqlite3` pour `watch_history` et `user_likes`.
- Docker Compose pour un lancement local reproductible.
- TMDB pour les metadonnees, tendances, recherche, decouverte et recommandations.

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

## Sources video

Par defaut, CineVerse utilise un lecteur de demonstration local qui emet des evenements `postMessage` compatibles avec le suivi de progression. Pour brancher tes propres lecteurs ou services autorises, configure `CINEVERSE_EMBED_PROVIDERS_JSON` dans `.env`. Garde cette valeur sur une seule ligne, sinon Next et Docker ne liront que le premier `[` au runtime.

Placeholders disponibles dans les templates:

- `{tmdbId}`
- `{mediaType}`
- `{title}`
- `{language}`
- `{season}`
- `{episode}`

Exemple:

```json
[
  {
    "id": "my-provider",
    "name": "My Provider",
    "template": "https://example.test/embed/{mediaType}/{tmdbId}?lang={language}&s={season}&e={episode}",
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
- `GET /api/recommendations` renvoie des recommandations basees sur les likes si possible.

## Git

Le depot est initialise sur `main` avec des commits separes par etape: scaffold, dependances, application, puis packaging.
