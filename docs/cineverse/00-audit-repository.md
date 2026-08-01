# Audit du dépôt CineVerse

## Résumé exécutif

**AS-IS.** CineVerse est un monolithe web local relativement riche. Next.js sert à la fois l'interface React et les routes HTTP. SQLite contient profils, préférences, historique, événements et caches. TMDB fournit les métadonnées canoniques. FStream est interrogé comme source de catalogue et comme résolveur vers des lecteurs externes ; un registre valide ensuite les URLs de providers.

Le dépôt présente une séparation de responsabilités réelle dans `src/lib`, mais pas de frontières d'exécution : toutes les fonctions serveur partagent le même processus et la même base. Cette simplicité convient à un usage local ou à une petite instance. Les zones les plus fragiles sont les contrats externes, la mesure cross-origin, la validation ad hoc, la persistance synchrone et l'absence de couverture automatisée.

## Objectif actuel

Les parcours et textes observés montrent l'objectif suivant : permettre à plusieurs profils locaux de découvrir, sélectionner et lancer des contenus, puis d'individualiser historique, liste, avis, recommandations et statistiques. Les preuves principales sont les routes de pages dans `src/app`, la persistance par `profile_id`/`user_id` dans `src/lib/store.ts` et le compositeur d'accueil `src/lib/home-programming.ts`.

Une fonction d'apprentissage de l'anglais ou de niveau linguistique n'a été trouvée ni dans les routes, ni dans les types, ni dans la persistance : **À vérifier / absente du périmètre observé**.

## Structure générale

```text
src/app/                 Pages et routes HTTP App Router
src/components/          Expériences client et composants d'interface
src/lib/                 Domaine, persistance et intégrations
src/proxy.ts             En-têtes de sécurité et politique de contenu
public/                  Ressources statiques
data/                    Volume local d'exécution, non analysé
Dockerfile               Image Node de production
docker-compose.yml       Instance unique et volume SQLite
```

Les dossiers générés (`node_modules`, `.next`) et les données locales n'ont pas été parcourus.

## Stack réellement utilisée

| Couche | Technologie | Preuve |
| --- | --- | --- |
| Framework | Next.js 16.2.12, App Router | `package.json`, `src/app/**` |
| Interface | React 19.2.4, composants serveur et client | `package.json`, directives `use client` |
| Langage | TypeScript strict | `tsconfig.json` |
| Style | Tailwind CSS 4 et CSS global | `postcss.config.mjs`, `src/app/globals.css` |
| Persistance | SQLite synchrone | `better-sqlite3` dans `src/lib/store.ts` |
| Scraping | Cheerio | `src/lib/fstream.ts` |
| Recherche locale | Fuse.js | `src/lib/tmdb.ts` |
| Icônes | Lucide React | `package.json`, composants |
| Exécution | Node.js 22, image Debian slim | `Dockerfile` |
| Conteneur | Docker Compose, volume `./data:/app/data` | `docker-compose.yml` |

Il n'y a pas d'ORM, de bibliothèque de validation de schéma, de framework de test, de file de tâches, ni de SDK d'observabilité déclaré dans `package.json`.

## Points d'entrée et routes principales

### Pages

| Route | Responsabilité | Preuve |
| --- | --- | --- |
| `/` | Accueil programmé par profil, héros, reprise, recommandations et catalogues | `src/app/page.tsx`, `src/components/cineverse-home.tsx` |
| `/browse` | Recherche, découverte TMDB et filtres | `src/app/browse/page.tsx` |
| `/watch/[mediaType]/[id]` | Détail, lecteur, langues, sources, saisons et progression | `src/app/watch/[mediaType]/[id]/page.tsx`, `watch-experience.tsx` |
| `/profiles` | Sélection, création, modification et suppression de profils | `src/app/profiles/page.tsx`, `profile-hub.tsx` |
| `/list` | Watchlist du profil actif | `src/app/list/page.tsx`, `saved-list-experience.tsx` |
| `/stats` | Statistiques du profil actif | `src/app/stats/page.tsx`, `profile-stats-dashboard.tsx` |

### Routes API

Les routes sous `src/app/api` couvrent : profils, historique/progression, likes, dislikes, watchlist, événements, recommandations, impressions, suggestions de recherche, épisodes TMDB et résolution de lecteur FStream. L'inventaire contractuel figure dans [05-api-integrations-and-flows.md](./05-api-integrations-and-flows.md).

## Modules et responsabilités

| Module | Responsabilité observée |
| --- | --- |
| `src/lib/store.ts` | Initialisation SQLite, migrations légères, profils, sessions, préférences, historique, événements, impressions et cache externe |
| `src/lib/tmdb.ts` | Appels TMDB, retry borné, cache, recherche floue, découverte, détails et données de repli |
| `src/lib/fstream.ts` | Découverte du domaine, parsing HTML, catalogue, recherche et résolution de liens |
| `src/lib/stream-resolver.ts` | Interface d'adaptateur de source et isolation des échecs de résolution |
| `src/lib/streaming.ts` | Registre des providers, validation des URLs, capacités, langue et fiabilité |
| `src/lib/provider-availability.ts` | Vérification facultative de disponibilité avec cache et repli périmé |
| `src/lib/recommendations.ts` | Génération et classement hybride par contenu |
| `src/lib/home-programming.ts` | Sélection dynamique des rangées, déduplication, rotation et héros |
| `src/lib/profile-statistics.ts` | Agrégation synchrone des événements et historiques par profil |
| `src/lib/client-events.ts` | Émission d'événements analytiques depuis le client |
| `src/lib/active-profile.ts` | Résolution du profil depuis la session |
| `src/proxy.ts` | En-têtes HTTP de sécurité et CSP adaptée aux domaines externes |

## Services externes

### TMDB

**Implémenté.** `src/lib/tmdb.ts` appelle l'API v3, privilégie le français, accepte un bearer token ou une clé API, annule les requêtes lentes, réessaie jusqu'à trois fois et revient sur une valeur en cache périmée ou des données de secours. Les affiches proviennent de `image.tmdb.org`, autorisé dans `next.config.ts`.

### FStream

**Partiellement implémenté.** `src/lib/fstream.ts` découvre un domaine depuis `FSTREAM_INDEX_URL` (valeur documentée `https://fstream.info/`), vérifie une liste d'origines autorisées, parse l'HTML et rapproche les résultats de TMDB. Ce fonctionnement est réel, mais intrinsèquement fragile face aux changements d'HTML et de domaine.

### Providers vidéo

**Implémenté au niveau intégration.** `src/lib/streaming.ts` enregistre explicitement Uqload, Voe, Dood, Filmoon et Netu, ainsi que des providers configurables par JSON. Les options de langue comprennent VF, VFF, VFQ, VOSTFR et VO selon les données résolues. La disponibilité effective d'un titre reste **À vérifier** à l'exécution.

## Persistance des données

**Implémenté.** `src/lib/store.ts:getDb` crée le répertoire, ouvre `cineverse.sqlite`, active WAL et installe les tables à la volée. Les données persistées sont :

- profils et sessions locales ;
- historique et état de progression ;
- likes, dislikes et watchlist ;
- événements analytiques ;
- impressions de recommandations ;
- cache JSON des API externes ;
- identifiants de migrations applicatives.

Les statistiques et scores de recommandation sont recalculés ; ils ne sont pas des sources de vérité persistées. Plusieurs métadonnées TMDB sont volontairement dénormalisées dans l'historique et les préférences pour permettre un affichage résilient.

Points d'attention : aucune clé étrangère SQL n'est déclarée ; les suppressions sont assurées manuellement dans une transaction. L'unicité de `watch_history` porte sur des colonnes de saison/épisode nullables : en SQLite, plusieurs lignes contenant `NULL` peuvent contourner une contrainte `UNIQUE`, notamment pour les films.

## Authentification et profils

**Partiellement implémenté.** Il n'existe pas de compte utilisateur distant. Chaque profil possède un identifiant, un nom, une couleur et éventuellement un PIN à quatre chiffres. Le PIN est dérivé avec `scrypt` et sel dans `src/lib/store.ts`. Après activation, un jeton aléatoire est stocké sous forme de hash et envoyé dans un cookie `HttpOnly`, `SameSite=Lax`, sécurisé sous HTTPS, valable trente jours.

Cette protection sépare correctement les profils d'une installation, mais ne constitue ni une identité forte, ni un contrôle d'accès multi-tenant. Aucun verrouillage ou rate limiting des essais de PIN n'a été trouvé.

## Fonctionnalités détectées

| Élément | Statut | Preuve dans le dépôt | Risque ou remarque |
| --- | --- | --- | --- |
| Profils multiples | Implémenté | `profile-hub.tsx`, tables `profiles`, `profile_sessions` | Limite locale de huit profils ; pas de compte distant |
| Catalogue films/séries/animes | Implémenté | `page.tsx`, `tmdb.ts`, `fstream.ts` | Dépend de TMDB/FStream ; données de repli limitées |
| Recherche et suggestions | Implémenté | `browse/page.tsx`, `/api/search/suggestions`, Fuse.js | Pertinence heuristique |
| Filtres TMDB | Implémenté | `tmdb.ts:discoverMedia`, `browse/page.tsx` | Séparation anime basée sur genre 16/langue japonaise |
| Fiches détails | Implémenté | `/watch/[mediaType]/[id]` | Qualité dépendante de TMDB |
| Saisons et épisodes | Implémenté | `/api/media/episode`, `watch-experience.tsx` | Saison 0 exclue de l'interface de lecture |
| Providers multiples | Implémenté | `streaming.ts:HOST_REGISTRY` | Disponibilité réelle variable |
| Langues VF/VFF/VFQ/VOSTFR/VO | Implémenté | types et normalisation dans `streaming.ts`/`providers.ts` | Offre dictée par la source |
| Progression iframe | Partiellement implémenté | écoute `postMessage` dans `watch-experience.tsx` | Impossible sans lecteur coopératif ; confiance non persistée |
| Reprise de lecture | Partiellement implémenté | `watch_history`, commandes `seek`/fragment temporel | Le seek peut ne pas être pris en charge |
| Auto-next | Partiellement implémenté | compte à rebours et épisode suivant dans `watch-experience.tsx` | Nécessite un signal de fin fiable |
| Watchlist | Implémenté | `/api/watchlist`, `user_watchlist`, `/list` | Signal de recommandation faible, pas un avis |
| Likes/dislikes | Implémenté | routes, tables et composants | Pas de note graduée |
| Recommandations | Implémenté | `recommendations.ts`, impressions | Heuristique, dépendance TMDB, mémoire positive bornée |
| Accueil dynamique | Implémenté | `home-programming.ts` | Contexte horaire côté serveur ; pas de modèle prédictif |
| Statistiques par profil | Partiellement implémenté | `profile-statistics.ts`, `/stats` | Mesures fiables uniquement pour lecteurs communicants |
| Cache externe persistant | Implémenté | `external_api_cache`, helpers de `store.ts` | Cache global sans quota précis par famille |
| Retry et stale fallback | Partiellement implémenté | `tmdb.ts`, `fstream.ts`, `provider-availability.ts` | Backoff/jitter/circuit breaker absents |
| Administration | À vérifier | aucune route ou rôle administrateur trouvé | Maintenance uniquement par configuration et logs |
| Apprentissage de l'anglais | À vérifier | aucun symbole, route ou modèle observé | Ne pas annoncer cette fonction |

## Recommandation actuelle : constat vérifié

`src/lib/recommendations.ts` met en œuvre un moteur hybride explicable, sans apprentissage automatique :

- jusqu'à huit signaux positifs forts et quatre éléments de watchlist plus faibles ;
- signaux négatifs issus des dislikes récents ;
- candidats TMDB `recommendations`, `similar` et découverte par genres ;
- pondération de récence et d'intensité ;
- bonus de genres, langue, affinité film/série, qualité, popularité et votes ;
- pénalités d'exposition et refroidissement après ignorances répétées ;
- exclusion des likes/dislikes directs et diversification finale ;
- explications courtes dérivées des sources ou genres.

**Limites.** Le bonus des recommandations TMDB est dominant, la mémoire forte est bornée, un dislike peut pénaliser trop largement un genre, et une complétion déclarée ou faiblement mesurée peut peser comme un signal réel. Le cold start repose surtout sur les catalogues éditoriaux de l'accueil.

## Progression : ce qui est réellement mesuré

| Nature du signal | Traitement AS-IS | Fiabilité |
| --- | --- | --- |
| Message `timeupdate/currentTime` d'un player autorisé | Position et durée sauvegardées | Moyenne à forte selon le contrat du provider |
| Message `ended/videoCompleted` | Contenu marqué terminé ; auto-next possible | Moyenne, dépend du message cross-origin |
| Clic « Marquer vu » | Complétion déclarée | Forte pour l'intention, aucune preuve de temps regardé |
| Ouverture/lancement | Événement sans temps inventé | Faible pour conclure à un visionnage |
| Iframe silencieuse | Pas d'horloge simulée | État indéterminé |

Le calcul de `watch_seconds` borne la progression par le temps mural entre messages dans `src/lib/store.ts:recordViewingEvent`, ce qui limite les sauts artificiels. En revanche, aucune colonne ne distingue encore explicitement mesure exacte, message provider, déclaration et estimation.

## État des tests et qualité

- **Tests automatisés : non détectés.** Aucun fichier de test ni configuration de runner n'a été trouvé dans les emplacements structurants.
- **Lint : configuré comme script** (`npm run lint`), mais non exécuté pour cet audit.
- **Validation : partielle.** Les routes vérifient les types et valeurs avec des fonctions locales ; aucun schéma partagé n'est présent.
- **Migrations : artisanales.** `app_migrations` et `ensureColumn` remplacent un outil de migration formel.
- **Typage : solide au niveau compilateur.** TypeScript strict est activé, sans garantie sur les payloads réseau.

## Configuration et déploiement

Les variables sont décrites dans `.env.example`. Elles couvrent TMDB, le chemin de données, le domaine FStream, les origines autorisées et les providers configurables. Le `Dockerfile` produit une application standalone ; `docker-compose.yml` monte un volume local, expose le port 3000 et relance le conteneur sauf arrêt manuel.

Le modèle cible actuel est donc une instance unique. Aucun reverse proxy, certificat TLS, health check, sauvegarde, restauration, pipeline CI/CD ou orchestration de migrations n'a été observé.

## Dette technique et incohérences

1. **Confiance de progression non modélisée** : l'interface connaît l'indisponibilité du suivi, mais la base ne porte pas cette sémantique.
2. **Intégrité SQL faible** : pas de FK ; risque de doublons `NULL` dans l'historique ; cascades applicatives.
3. **Contrats externes fragiles** : parsing FStream et messages de lecteurs sans tests de contrat.
4. **Validation dispersée** : logique répétée dans les routes, réponses d'erreur non normalisées.
5. **Accès SQLite synchrone** : acceptable en local, mais limite la concurrence et le déploiement horizontal.
6. **Observabilité parcellaire** : quelques logs JSON de résolution, aucune corrélation, métrique ou alerte.
7. **Sécurité locale seulement** : PIN sans limitation d'essais, pas de CSRF explicite, iframes nécessairement permissives.
8. **Caches sans gouvernance globale** : TTL par service, mais pas de métriques de hit/miss ni de limite de taille par classe.

## Annoncé mais absent ou non confirmé

- Aucun rôle d'administration ou panneau de maintenance.
- Aucun système de compte, courriel, récupération de PIN ou synchronisation multi-appareil.
- Aucun moteur de sous-titres ou d'apprentissage linguistique.
- Aucun modèle ML entraîné ; la recommandation est volontairement basée sur des règles et le contenu.
- Aucun suivi universel exact des iframes ; seuls les lecteurs coopératifs peuvent le permettre.
- La qualité/HD déclarée par un provider n'est pas vérifiée par analyse du flux vidéo.

## Zones impossibles à confirmer statiquement

- Disponibilité actuelle et légalité des contenus exposés par les domaines tiers.
- Stabilité des sélecteurs HTML FStream et des domaines découverts.
- Événements `postMessage` réellement envoyés par chaque provider.
- Respect effectif de l'autoplay, du seek et de l'auto-next selon navigateur/provider.
- Exactitude des métadonnées de langue et qualité fournies par FStream.
- Comportement en charge et croissance réelle de la base sans mesures d'exploitation.
