# API, intégrations et flux

## 1. Conventions AS-IS

Les routes internes sont des route handlers Next.js dans `src/app/api`. Elles renvoient du JSON, sauf les lecteurs FStream/démo qui renvoient une redirection ou du HTML. Le profil actif est retrouvé à partir du cookie de session par `src/lib/active-profile.ts` et `src/lib/store.ts`.

Constats transversaux :

- validation manuelle des chaînes, nombres et enums ;
- erreurs généralement `{ error: string }`, sans code métier commun ni request ID ;
- absence de rate limiting applicatif détecté ;
- absence d'en-tête ou clé d'idempotence générique ;
- unicités SQL et fenêtres de déduplication limitent certains doublons ;
- routes personnalisées marquées `no-store` ou rendues dynamiquement selon le cas.

## 2. Inventaire des routes internes

| Route ou service | Rôle | Entrées | Sorties | Authentification | Cache | Erreurs principales |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /api/profiles` | Lister profils/session active | aucune | `{items, activeProfileId}` | Non | `no-store` | 500 stockage |
| `POST /api/profiles` | Créer et activer | `name`, `color?`, `pin?` | profil créé, 201 | Non | Non | 400 validation/limite, 500 |
| `PATCH /api/profiles` | Activer ou modifier | `id`, `activate?`, `pin?`, `name?`, `color?`, `newPin?`, `removePin?` | profil/session | PIN selon profil | Non | 400, 403 PIN, 404 |
| `DELETE /api/profiles` | Supprimer un profil et ses données | `id`, `pin?` | confirmation | PIN selon profil | Non | 400, 403, 404 |
| `GET /api/progress` | Lire une progression ou la reprise | query média/S/E optionnelle | état unique ou liste | Profil actif | `no-store` | 400, 401 |
| `POST /api/progress` | Upsert progression et événement | média, position, durée, terminé, métadonnées | état courant | Profil actif | Non | 400, 401, 500 |
| `GET /api/likes` | Lister les likes | aucune | items | Profil actif | `no-store` | 401 |
| `POST /api/likes` | Basculer un like | média + métadonnées | état de réaction | Profil actif | Non | 400, 401 |
| `GET /api/dislikes` | Lister les dislikes | aucune | items | Profil actif | `no-store` | 401 |
| `POST /api/dislikes` | Basculer un dislike | média + genres/langue | état de réaction | Profil actif | Non | 400, 401 |
| `GET /api/watchlist` | Lister la watchlist | aucune | items | Profil actif | `no-store` | 401 |
| `POST /api/watchlist` | Basculer un item | média + métadonnées | état watchlist | Profil actif | Non | 400, 401 |
| `POST /api/events` | Enregistrer une interaction analytique | événement typé, média/contexte | confirmation | Profil actif | Non | 400 type/payload, 401 |
| `GET /api/recommendations` | Calculer les recommandations du profil | aucune | stratégie + items | Profil actif | `no-store` | 401, dépendances externes |
| `POST /api/recommendations/impressions` | Enregistrer une liste affichée | session + impressions | confirmation | Profil actif | Non | 400, 401 |
| `PATCH /api/recommendations/impressions` | Marquer clic/lecture/fin/rejet | impression ou média/session + action | confirmation | Profil actif | Non | 400, 401, 404 possible |
| `GET /api/search/suggestions` | Suggestions regroupées | `q` (min. 2 caractères) | titres et personnes | Non | privé, 60 s | 400/retour vide, TMDB |
| `GET /api/media/episode` | Métadonnées et progression d'épisodes | `tmdbId`, `season`, `episode`, `totalEpisodes?` | épisode/liste/progression | Profil actif pour progression | court/externe | 400, 404, TMDB |
| `GET /api/fstream-player` | Revalider et rediriger vers un embed | `host`, `language`, `mediaType`, `tmdbId`, `season?`, `episode?`, `autoplay?` | 307 ou HTML erreur | Non observée | privé, 60 s | 400, 404/502 résolution |
| `GET /api/demo-player` | Player local coopératif | paramètres de démo | HTML avec `postMessage` | Non | développement/local | 400 éventuel |

## 3. Contrats détaillés

### Profils

Preuve : `src/app/api/profiles/route.ts`, `src/lib/store.ts`.

- `name` est normalisé et doit être présent à la création.
- Le PIN est facultatif et contraint à quatre chiffres par `src/lib/profile-constants.ts`.
- La création active immédiatement le profil et pose le cookie de session.
- L'activation d'un profil protégé vérifie le PIN avant de créer un nouveau token.
- La suppression efface manuellement les tables personnelles dans une transaction.

**TO-BE :** rate limit par IP/session sur la vérification du PIN, jeton CSRF pour mutations et erreur stable `PROFILE_PIN_INVALID`.

### Progression

Preuve : `src/app/api/progress/route.ts`, `src/lib/types.ts`, `src/lib/store.ts:recordViewingEvent`.

Le corps contient au minimum l'identité TMDB/type, le titre et l'état de lecture ; selon le média : saison, épisode, images, position, durée, complétion, provider, langue et compte d'épisodes. La route associe toujours l'écriture au profil résolu côté serveur.

Le store :

1. normalise position et durée ;
2. calcule un incrément de temps borné par l'écart de position et le temps mural ;
3. déduplique les événements très proches ;
4. met à jour `watch_history` ;
5. écrit un événement de visionnage.

**Limite :** la requête AS-IS ne transporte pas une provenance/confiance formelle. **TO-BE :** ajouter `idempotencyKey`, `measurementSource`, `confidence`, `completionReason` et refuser une régression obsolète.

### Événements

Preuve : `src/app/api/events/route.ts`, `src/lib/client-events.ts`.

Vocabulaire accepté :

```text
VIEW_DETAILS, PLAY_STARTED, PROGRESS_UPDATED, PAUSED, COMPLETED,
ABANDONED, WATCHLIST_ADDED, RATED, RECOMMENDATION_CLICKED,
SEARCHED, FILTER_APPLIED
```

Le payload peut inclure média, S/E, position/durée, langue, provider, genres, offset de fuseau et métadonnées. Les champs non pertinents sont optionnels, ce qui facilite l'instrumentation mais accroît le risque d'événements incohérents.

### Likes, dislikes et watchlist

Preuve : routes homonymes et tables `user_likes`, `user_dislikes`, `user_watchlist`.

Les POST agissent comme des bascules. Le store conserve les métadonnées minimales nécessaires aux cartes et au moteur. Un dislike stocke aussi genres/langue pour construire des signaux négatifs. Le comportement d'exclusivité like/dislike doit rester atomique ; il est **À vérifier dynamiquement** en cas d'envois concurrents.

### Recommandations et impressions

Preuve : `src/app/api/recommendations/route.ts`, `src/lib/recommendations.ts`, route `impressions`.

`GET /api/recommendations` charge les signaux, effectue plusieurs requêtes TMDB mises en cache, classe et diversifie jusqu'à 18 résultats. Les impressions enregistrent `sessionId`, rangée, position, score et média. Le PATCH attribue ensuite clic, lecture, complétion ou rejet.

L'unicité `(profile, session, media, shelf)` rend l'enregistrement d'impression essentiellement idempotent. Les actions booléennes doivent être monotones. Il n'y a pas de version de modèle ni de détail des caractéristiques persisté.

### Recherche et épisodes

`/api/search/suggestions` sépare titres et personnes et s'appuie sur TMDB/Fuse. La page `/browse` exécute ses recherches/découvertes côté serveur via `src/lib/tmdb.ts`.

`/api/media/episode` récupère les épisodes réels d'une saison et joint la progression locale. Il évite ainsi un numéro arbitraire ; le code de la page watch filtre les saisons non positives.

### Lecteur FStream

`/api/fstream-player` n'accepte pas une URL fournie par le client. Il reçoit une identité logique, relance le résolveur, sélectionne host/langue et redirige seulement vers une source validée. Cette indirection réduit les URLs périmées et les redirections ouvertes, au prix d'un nouvel appel de résolution.

## 4. Authentification, validation et abus

| Aspect | AS-IS | TO-BE recommandé |
| --- | --- | --- |
| Session | token opaque, hash DB, cookie HttpOnly/SameSite | rotation, révocation visible, nettoyage expiré |
| Autorisation | profil actif sur routes personnelles | helper obligatoire et tests négatifs par route |
| Validation | contrôles TypeScript/runtime locaux | schémas DTO partagés et enums fermés |
| CSRF | SameSite Lax uniquement | token synchronisé ou vérification stricte Origin/Host |
| Rate limiting | non détecté | PIN, recherche, résolution, événements et recommandations |
| Idempotence | uniques ciblés/UPSERT | clé sur progression/événement et réponses rejouables |
| Taille corps | limite framework implicite | limites explicites, JSON metadata borné |

## 5. Intégration TMDB

### Rôle et criticité

TMDB est **critique** pour recherche, filtres, détails, crédits, saisons, images et candidats de recommandation. Le dépôt possède toutefois des données de secours et des métadonnées locales permettant un affichage dégradé.

### Authentification

`src/lib/tmdb.ts` utilise `TMDB_ACCESS_TOKEN` ou `TMDB_API_KEY`, exclusivement côté serveur. En leur absence, les appels réels ne sont pas disponibles et le code peut recourir au cache/fallback.

### Cache, timeout et retry

- coalescence de promesses en mémoire ;
- cache persistant `external_api_cache` ;
- cache `fetch` Next pour certaines requêtes ;
- TTL dépendant de la famille d'endpoint via `tmdbCacheTtl` ;
- timeout explicite d'environ huit secondes ;
- jusqu'à trois tentatives ;
- repli sur cache périmé ou données locales.

**Limites :** pas de backoff exponentiel/jitter, circuit breaker, budget global de requêtes ni métriques du quota. Les détails personnalisés utilisent une stratégie plus fraîche que les listes.

### Erreurs

Statut HTTP non réussi, timeout, JSON invalide, secret absent ou quota. Le module normalise vers liste vide/fallback dans plusieurs parcours ; l'interface ne distingue pas toujours « aucun résultat » de « service indisponible ».

## 6. Intégration FStream

### Rôle et dépendance

FStream est une source de catalogue et de résolution. Il est **facultatif pour naviguer** si TMDB/fallback suffit, mais **critique pour lancer** les contenus dont aucune autre source n'est configurée.

### Domaine dynamique

`src/lib/fstream.ts` part de `FSTREAM_INDEX_URL`, découvre un domaine et ne l'accepte que s'il correspond aux origines autorisées. Une origine explicite peut être ajoutée via `FSTREAM_ALLOWED_ORIGINS`. Le défaut observé cible des domaines HTTPS numérotés.

### Correspondance TMDB

Le catalogue HTML fournit titre, image et identifiant FStream. CineVerse rapproche ensuite par affiche, titre, année et type/saison. TMDB reste la référence canonique. Un résultat ambigu doit être rejeté plutôt que transformé en autre film.

### Cache et résilience

- domaine et catalogues : cache de l'ordre de dizaines de minutes ;
- correspondances stables FStream/TMDB : cache long, jusqu'à plusieurs jours ;
- liens player : TTL court, de l'ordre de 15 à 30 minutes selon le chemin ;
- timeout explicite et recours à une valeur stale ;
- erreurs isolées par `stream-resolver.ts`.

Le retry est limité et ne constitue pas un circuit breaker. Une panne FStream retire les nouvelles résolutions, mais le catalogue TMDB, les profils et les sources encore valides peuvent continuer.

### Risques

- modification des classes/structures HTML ;
- domaine de découverte compromis ou redirection inattendue ;
- faux rapprochement de titre ;
- latence et blocage anti-bot ;
- conditions d'utilisation, droits d'auteur et licéité des contenus à faire examiner avant toute diffusion publique.

## 7. Providers vidéo

### Inventaire vérifié

| Provider | Présence dans le registre | Capacités déclarées/observées dans le code | Remarque |
| --- | --- | --- | --- |
| Uqload | Implémenté | autoplay et suivi/message déclarés, fiabilité relative élevée | Contrat réel à tester régulièrement |
| Voe | Implémenté | embed validé, suivi non garanti par défaut | Domaines susceptibles d'évoluer |
| Dood | Implémenté | embed validé, suivi non garanti | Fallback |
| Filmoon | Implémenté | embed validé, suivi non garanti | Fallback |
| Netu | Implémenté | embed validé, suivi non garanti | Fallback |
| Provider JSON | Implémenté | template/capacités configurables | Une configuration ne prouve pas la disponibilité |

La langue est normalisée entre `vf`, `vff`, `vfq`, `vostfr`, `vo`. L'ordre préféré donne priorité aux variantes françaises lorsqu'elles existent, mais il ne doit jamais inventer une variante absente.

### Sélection et fallback

Les candidats portent host, langue, qualité déclarée, fiabilité, date de vérification et capacités. La page permet un choix explicite. La résolution attrape les erreurs d'un adaptateur pour ne pas interrompre les autres.

### Disponibilité

`src/lib/provider-availability.ts` peut appeler un endpoint de disponibilité facultatif avec timeout, validation manuelle, cache positif plus long que négatif et stale fallback. Sans endpoint, l'état reste inconnu ; il ne doit pas être présenté comme vérifié.

### Sécurité iframe

- allowlist HTTPS/hôte/path avant rendu ;
- CSP `frame-src` construite depuis les origines autorisées ;
- filtrage des `postMessage` par fenêtre/origine ;
- aucun accès au DOM interne cross-origin ;
- flux, publicités et scripts s'exécutent chez le tiers.

Une sandbox restrictive est difficile pour ces players et n'a pas été confirmée dans l'iframe observée. Il faut isoler autant que possible les permissions (`allow`) et considérer tout message comme non fiable avant validation.

## 8. Cache

Preuve : `external_api_cache` et helpers de `src/lib/store.ts`.

La clé encode le service et les paramètres. Le payload JSON possède expiration et date de mise à jour. Une purge opportuniste supprime les entrées largement périmées. Le cache n'est pas segmenté par profil pour les données externes publiques ; les réponses personnelles ne doivent jamais y être stockées.

**TO-BE :** ajouter namespace, version de schéma, statut frais/stale, nombre d'accès, taille, stale maximal et invalidation ciblée. Ne jamais cacher une erreur d'authentification comme un succès vide.

## 9. Statistiques

Il n'existe pas d'API de statistiques dédiée : `src/app/stats/page.tsx` appelle directement `src/lib/profile-statistics.ts` côté serveur. Le service agrège événements et historique du profil, puis fournit vue d'ensemble, habitudes, goûts, progression, découverte et régularité.

Les métriques de temps sont limitées aux événements avec `watch_seconds`. Les complétions manuelles peuvent compter un titre sans ajouter sa durée. C'est cohérent, mais la cible doit afficher la couverture et le niveau de confiance de chaque indicateur.

## 10. Politique d'erreur TO-BE

Réponse interne recommandée :

```json
{
  "error": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "Cette source est temporairement indisponible.",
    "requestId": "req_...",
    "retryable": true
  }
}
```

Règles :

1. timeout externe → `504` ou résultat dégradé explicite ;
2. URL refusée → `422`, jamais redirection ;
3. absence de profil → `401` ;
4. profil valide mais action interdite → `403` ;
5. ressource TMDB/provider absente → `404` ;
6. quota externe → `503` avec `Retry-After` si connu ;
7. erreur disque → `503`, log sans données personnelles ;
8. retry uniquement sur erreurs transitoires et méthodes sûres/idempotentes ;
9. fallback stale signalé dans les logs/métriques ;
10. aucune panne technique ne produit un événement comportemental négatif.

## 11. Conformité et aspects juridiques

À examiner avant une mise à disposition publique :

- conditions d'utilisation et attribution TMDB ;
- autorisation de scraper FStream et stabilité de son modèle d'accès ;
- droits de diffusion des contenus intégrés ;
- cookies, données de profil et obligations de suppression/export ;
- responsabilité liée aux publicités, traceurs ou scripts des iframes ;
- politique de sécurité et de confidentialité exposée à l'utilisateur.

Cette documentation identifie les risques techniques ; elle ne constitue pas un avis juridique.
