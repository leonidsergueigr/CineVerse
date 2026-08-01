# Données et modélisation Merise

## 1. Périmètre et sources

### AS-IS

Le schéma réel est créé dans `src/lib/store.ts:getDb`. Il contient des profils locaux, sessions, historique, préférences, événements, impressions, cache externe et migrations. Les métadonnées riches restent chez TMDB ; certaines valeurs utiles à l'affichage sont dupliquées dans les lignes personnelles.

### TO-BE

Le modèle proposé conserve ce principe, mais introduit une identité non ambiguë de **contenu lisible**, une provenance de mesure et des relations contrôlées. Le [DBML](./schema.dbml) correspond à ce modèle cible, pas à une photographie littérale du SQLite actuel.

## 2. Dictionnaire de données

| Donnée | Type | Description | Source | Contraintes | Sensibilité |
| --- | --- | --- | --- | --- | --- |
| `profile_id` | UUID/texte | Identité du profil local | CineVerse | PK, non nul | Personnelle pseudonyme |
| `profile_name` | texte | Nom affiché | Utilisateur | 1–40 recommandé | Personnelle |
| `profile_color` | texte | Couleur d'avatar | Utilisateur | palette/hex validé | Faible |
| `pin_hash`, `pin_salt` | binaire/texte | Dérivé de protection locale | CineVerse | jamais renvoyer au client | Très sensible |
| `session_token_hash` | texte | Hash du jeton de profil | CineVerse | unique, expirant | Très sensible |
| `tmdb_id` | entier | Identifiant canonique du média | TMDB | positif avec `media_type` | Publique |
| `media_type` | enum | `movie` ou `tv` | TMDB/CineVerse | non nul | Publique |
| `title`, `original_title` | texte | Titres du média | TMDB/FStream validé | cache, nullable selon source | Publique |
| `poster_path`, `backdrop_path` | texte | Chemins d'images TMDB | TMDB | pas une URL arbitraire | Publique |
| `overview` | texte | Synopsis | TMDB | cache facultatif | Publique |
| `release_date` | date | Sortie/première diffusion | TMDB | nullable | Publique |
| `vote_average`, `vote_count` | réel/entier | Note et volume TMDB | TMDB | inconnus distincts de zéro | Publique |
| `genre_ids` | relation/JSON AS-IS | Genres TMDB | TMDB | IDs positifs | Publique |
| `original_language` | code | Langue originale | TMDB | ISO 639-1 si possible | Publique |
| `season_number` | entier | Saison d'une série | TMDB | `> 0` pour lecture standard | Publique |
| `episode_number` | entier | Numéro dans la saison | TMDB | `> 0` | Publique |
| `runtime_seconds` | entier | Durée film/épisode | TMDB/player | positif ou inconnu | Publique |
| `provider_key` | texte | Provider normalisé | FStream/CineVerse | registre autorisé | Technique |
| `embed_url` | URL | URL de lecteur validée | FStream/provider | HTTPS, hôte/path autorisé, expirante | Sensible technique |
| `audio_language` | enum/code | VF, VFF, VFQ, VOSTFR, VO | FStream/utilisateur | valeur normalisée | Préférence personnelle |
| `quality` | texte | Qualité déclarée | Provider | information non garantie | Publique |
| `provider_status` | enum | disponible/dégradé/indisponible/inconnu | Vérification | horodaté et expirant | Technique |
| `playback_session_id` | UUID | Session de lecture | CineVerse | unique, liée à un profil | Personnelle |
| `playback_state` | enum | État de lecture agrégé | CineVerse/player | transitions contrôlées | Personnelle |
| `position_seconds` | entier | Dernière position connue | Player/utilisateur | `>= 0`, bornée par durée | Personnelle |
| `duration_seconds` | entier | Durée signalée/connue | Player/TMDB | positive ou nulle si inconnue | Personnelle |
| `watch_seconds` | entier | Temps mesuré entre signaux | CineVerse | `>=0`, borné par temps mural | Personnelle |
| `measurement_source` | enum | Origine de la mesure | CineVerse | exacte/signal/déclarée/session/inconnue | Personnelle |
| `confidence` | réel | Confiance de 0 à 1 | Politique CineVerse | intervalle fermé | Personnelle dérivée |
| `completion_reason` | enum | Player, seuil, manuel, import | CineVerse | requis si terminé | Personnelle |
| `event_type` | enum | Interaction ou lecture | CineVerse | vocabulaire fermé | Personnelle |
| `event_timestamp` | instant UTC | Date de l'événement | CineVerse | non nul | Personnelle |
| `event_metadata` | JSON | Contexte non structurant | CineVerse | taille/clefs autorisées | Potentiellement sensible |
| `reaction` | enum | LIKE ou DISLIKE | Utilisateur | unique profil/média | Personnelle |
| `watchlist_added_at` | instant UTC | Ajout à la liste | Utilisateur | unique profil/média | Personnelle |
| `recommendation_score` | réel | Score au moment d'afficher | Moteur | snapshot explicable | Profilage |
| `shelf_type`, `position` | texte/entier | Contexte d'exposition | Compositeur accueil | non nul | Profilage |
| `clicked/played/completed/dismissed` | booléens | Suite donnée à une impression | CineVerse | monotones | Profilage |
| `cache_key` | texte | Clé de réponse externe | CineVerse | unique | Technique |
| `cache_payload` | JSON | Réponse normalisée | Externe | non personnelle par défaut | Technique |
| `expires_at` | instant UTC | Expiration cache/session/source | CineVerse | indexé | Technique |
| `timezone_offset` | entier | Décalage pour habitudes | Navigateur | plage valide | Personnelle |

## 3. Règles de gestion Merise

- **RG-01** — Un profil est identifié indépendamment de son nom et possède zéro ou un PIN.
- **RG-02** — Une session de profil appartient à un seul profil et expire ; un profil peut avoir plusieurs sessions historiques.
- **RG-03** — La suppression d'un profil supprime sessions, états, événements, avis, liste et impressions associés.
- **RG-04** — Un média TMDB est unique par couple `(tmdb_id, media_type)`.
- **RG-05** — Un média `movie` possède une unité lisible `(saison=0, épisode=0)` ; un média `tv` possède des unités d'épisode `(saison>0, épisode>0)`.
- **RG-06** — La saison 0 peut exister chez TMDB comme bonus, mais n'est pas incluse dans la lecture standard sans décision explicite.
- **RG-07** — Une unité lisible est unique par `(media_id, season_number, episode_number)` ; ces trois valeurs ne sont jamais nulles.
- **RG-08** — Un provider est défini dans un registre ; une source vidéo référence un provider et une unité lisible.
- **RG-09** — Une source n'est rendue que si son URL HTTPS respecte l'hôte et le chemin autorisés.
- **RG-10** — La disponibilité et la qualité sont des observations horodatées, jamais des propriétés éternelles.
- **RG-11** — Une session de lecture appartient à un profil, une unité lisible et au plus une source active.
- **RG-12** — Un événement de lecture conserve la provenance et la confiance de sa mesure.
- **RG-13** — Deux événements portant la même clé d'idempotence ont un seul effet.
- **RG-14** — Le temps regardé ne peut dépasser le temps mural plausible ni la durée du contenu.
- **RG-15** — Une position élevée obtenue par seek ne crée pas automatiquement un temps regardé équivalent.
- **RG-16** — Un état terminé nécessite soit une déclaration utilisateur, soit un signal de fin, soit un seuil proche de la fin assorti d'une confiance suffisante.
- **RG-17** — Un événement `PLAY_STARTED` seul ne rend pas le contenu terminé et ne prouve aucune durée.
- **RG-18** — Une erreur de source ne produit pas un abandon de contenu sans autre signal.
- **RG-19** — Un profil possède au plus un état de progression par unité lisible.
- **RG-20** — Un profil possède au plus une réaction par média, `LIKE` ou `DISLIKE`.
- **RG-21** — La watchlist indique une intention, pas une appréciation ni une complétion.
- **RG-22** — Une impression de recommandation est unique pour un profil, une session d'accueil, une rangée et un média.
- **RG-23** — Les indicateurs d'impression évoluent de faux à vrai et ne reviennent pas en arrière.
- **RG-24** — Un dislike explicite exclut le média des recommandations tant qu'il existe.
- **RG-25** — Une complétion de faible confiance ne peut avoir le même poids qu'un signal player fiable.
- **RG-26** — Les métadonnées TMDB peuvent être mises en cache ; l'identifiant et les données personnelles restent persistants.
- **RG-27** — Une entrée de cache expirée peut servir temporairement de repli, avec âge observable et limite de rétention.
- **RG-28** — Une valeur de durée inconnue est nulle/absente, jamais convertie en zéro métier.
- **RG-29** — Toute date persistée est en UTC ; l'offset local ne sert qu'à l'analyse d'habitude.
- **RG-30** — Les statistiques sont des projections recalculables ; les événements qualifiés en sont la source d'audit.

## 4. MCD — Modèle conceptuel TO-BE

### Entités

| Entité | Identifiant | Attributs principaux |
| --- | --- | --- |
| PROFIL | `profile_id` | nom, couleur, secret PIN, dates |
| SESSION_PROFIL | `session_id` | hash jeton, expiration |
| MEDIA | `media_id` | tmdb_id, type, métadonnées cache |
| SAISON | `season_id` | numéro, nom, nombre d'épisodes |
| UNITE_LISIBLE | `playable_id` | saison, épisode, titre, durée |
| PROVIDER | `provider_id` | clé, nom, fiabilité, capacités |
| SOURCE_VIDEO | `source_id` | langue, qualité, URL, expiration, statut |
| SESSION_LECTURE | `playback_id` | état, source de mesure, confiance, dates |
| EVENEMENT | `event_id` | type, position, durée, temps, contexte |
| PROGRESSION | `(profile_id, playable_id)` | position, durée, terminé, confiance |
| REACTION | `(profile_id, media_id)` | like/dislike, date |
| WATCHLIST | `(profile_id, media_id)` | date d'ajout |
| IMPRESSION_RECO | `impression_id` | rangée, position, score, suites |
| SANTE_PROVIDER | `health_id` | statut, latence, erreur, instant |
| CACHE_EXTERNE | `cache_key` | payload, expiration, mise à jour |

### Associations et cardinalités

- PROFIL `(1,1)` — ouvre — SESSION_PROFIL `(0,n)`.
- MEDIA série `(1,1)` — contient — SAISON `(0,n)`.
- MEDIA `(1,1)` — définit — UNITE_LISIBLE `(1,n)` ; un film en a exactement une, une série zéro ou plusieurs selon le cache.
- SAISON `(0,1)` — regroupe — UNITE_LISIBLE `(1,n)` pour les épisodes ; l'unité film n'a pas de saison.
- PROVIDER `(1,1)` — fournit — SOURCE_VIDEO `(0,n)`.
- UNITE_LISIBLE `(1,1)` — est proposée par — SOURCE_VIDEO `(0,n)`.
- PROFIL `(1,1)` — démarre — SESSION_LECTURE `(0,n)`.
- UNITE_LISIBLE `(1,1)` — concerne — SESSION_LECTURE `(0,n)`.
- SESSION_LECTURE `(1,1)` — produit — EVENEMENT `(0,n)`.
- PROFIL `(1,1)` — possède — PROGRESSION `(0,n)` — sur — UNITE_LISIBLE `(1,1)`.
- PROFIL `(1,1)` — exprime — REACTION `(0,n)` — sur — MEDIA `(1,1)`.
- PROFIL `(1,1)` — ajoute — WATCHLIST `(0,n)` — MEDIA `(1,1)`.
- PROFIL `(1,1)` — reçoit — IMPRESSION_RECO `(0,n)` — MEDIA `(1,1)`.
- PROVIDER `(1,1)` — possède — SANTE_PROVIDER `(0,n)`.

### Contraintes et normalisation

- 3NF pour les données personnelles et les identités.
- Métadonnées TMDB minimales dans `media_items`, avec JSON seulement pour attributs de cache non requêtés.
- Aucun JSON pour relations métier centrales (progression, réaction, unité lisible).
- `playable_items` élimine le polymorphisme nullable de l'historique AS-IS.
- Les URLs de sources sont éphémères et supprimables ; les événements/progressions ne dépendent pas de leur conservation.

## 5. MLD — Relations TO-BE

Notation : `#` clé primaire, `*` clé étrangère, `U` unique, `NN` non nul.

```text
PROFILE(#id, name NN, color NN, pin_hash?, pin_salt?, created_at NN, updated_at NN)
PROFILE_SESSION(#token_hash, profile_id* NN, expires_at NN, created_at NN)
MEDIA_ITEM(#id, tmdb_id NN, media_type NN, title NN, original_title?, poster_path?,
           backdrop_path?, overview?, release_date?, original_language?, vote_average?,
           vote_count?, metadata_json?, metadata_expires_at?, updated_at NN,
           U(tmdb_id, media_type))
SEASON(#id, media_id* NN, season_number NN, name?, episode_count?, metadata_expires_at?,
       U(media_id, season_number))
PLAYABLE_ITEM(#id, media_id* NN, season_id*?, season_number NN, episode_number NN,
              kind NN, title?, runtime_seconds?, metadata_expires_at?,
              U(media_id, season_number, episode_number))
PROVIDER(#id, provider_key NN U, name NN, base_host?, enabled NN, reliability?,
         capabilities_json?, created_at NN, updated_at NN)
STREAM_SOURCE(#id, playable_id* NN, provider_id* NN, language NN, quality?, embed_url NN,
              status NN, resolved_at NN, expires_at?, last_checked_at?,
              U(playable_id, provider_id, language, embed_url))
PROVIDER_HEALTH(#id, provider_id* NN, status NN, latency_ms?, error_code?, checked_at NN)
PLAYBACK_SESSION(#id, profile_id* NN, playable_id* NN, source_id*?, state NN,
                 measurement_source NN, confidence NN, started_at NN, last_signal_at?, ended_at?)
VIEWING_EVENT(#id, profile_id* NN, playback_session_id*?, playable_id* NN, event_type NN,
              occurred_at NN, position_seconds?, duration_seconds?, watch_seconds NN,
              measurement_source NN, confidence NN, audio_language?, subtitle_language?,
              provider_key?, timezone_offset?, metadata_json?, idempotency_key? U)
PROFILE_PROGRESS(#profile_id* NN, #playable_id* NN, position_seconds NN,
                 duration_seconds?, completed NN, completion_reason?, confidence NN,
                 last_session_id*?, first_started_at?, completed_at?, updated_at NN)
REACTION(#profile_id* NN, #media_id* NN, reaction NN, created_at NN, updated_at NN)
WATCHLIST_ITEM(#profile_id* NN, #media_id* NN, added_at NN)
RECOMMENDATION_IMPRESSION(#id, profile_id* NN, media_id* NN, session_key NN,
                          shelf_type NN, position NN, score?, shown_at NN,
                          clicked NN, played NN, completed NN, dismissed NN,
                          U(profile_id, session_key, media_id, shelf_type))
EXTERNAL_CACHE(#cache_key, payload NN, expires_at NN, updated_at NN)
SCHEMA_MIGRATION(#version, applied_at NN, checksum NN)
```

### Index recommandés

- `profile_sessions(profile_id)`, `profile_sessions(expires_at)` ;
- `media_items(tmdb_id, media_type)` unique et `metadata_expires_at` ;
- `stream_sources(playable_id, language, status)` et `expires_at` ;
- `viewing_events(profile_id, occurred_at DESC)`, `(profile_id, playable_id, occurred_at)` et `playback_session_id` ;
- `profile_progress(profile_id, completed, updated_at DESC)` ;
- `recommendation_impressions(profile_id, shown_at DESC)` et `(profile_id, media_id, shown_at)` ;
- `external_cache(expires_at)` ;
- `provider_health(provider_id, checked_at DESC)`.

### Suppression et mise à jour

- Profil : cascade vers sessions, playback, événements, progression, réactions, liste et impressions.
- Média : restriction en production tant que des données personnelles le référencent ; nettoyage explicite seulement.
- Saison/unité lisible : restriction si historique ; métadonnée obsolète marquée, pas supprimée brutalement.
- Provider : désactivation plutôt que suppression ; sources éphémères supprimables en cascade.
- Cache/santé : suppression par rétention.
- Identifiant TMDB/type : immuables après création ; corriger par fusion contrôlée.

## 6. MPD SQLite recommandé

Le DBML associé cible SQLite avec les règles suivantes :

- identifiants UUID stockés en `text`, entiers auto-incrémentés pour événements/caches volumineux ;
- timestamps UTC en `text` ISO-8601 ou `integer` epoch, mais une seule convention par schéma ;
- booléens en `integer` avec `CHECK (value IN (0,1))` ;
- enums en `text` avec `CHECK` ;
- JSON validé côté application et, si JSON1 est garanti, `CHECK(json_valid(...))` ;
- `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, `busy_timeout` explicite ;
- migrations transactionnelles, sauvegarde avant évolution destructive.

## 7. Politique TMDB et cache

### Référencer par identifiant

- média, film/série, saison et épisode : identifiant TMDB et numéros structurants ;
- personnes/genres : ne les persister localement que s'ils servent à un signal durable ou une requête fréquente.

### Mettre en cache

- titres, synopsis, dates, affiches, crédits, genres, durées, nombres d'épisodes ;
- résultats de recherche/découverte et recommandations TMDB ;
- rapprochements FStream ↔ TMDB et sources résolues avec TTL court.

### Persister durablement

- profils, sessions valides, réactions, liste ;
- événements qualifiés, progression et complétion ;
- impressions de recommandation nécessaires à l'évaluation ;
- version de schéma.

### Recalculer

- scores de recommandation, profil de goûts, statistiques et programmation de l'accueil ;
- santé agrégée d'un provider à partir d'observations récentes.

### Supprimer après expiration

- URL d'embed et réponses de disponibilité ;
- caches de recherche/catalogue dépassant la fenêtre stale maximale ;
- sessions expirées ;
- événements analytiques détaillés au-delà d'une rétention définie, après agrégation si nécessaire.

## 8. Intégrité, concurrence et cycle de vie

### Intégrité

Activer les FK, utiliser des clés composites non nulles, vérifier les enums et empêcher `completed=1` sans raison/confiance. Les écritures progression + événement doivent partager une transaction.

### Concurrence

Une mise à jour de progression doit être monotone par défaut, sauf action de reset explicite. Employer `updated_at` ou une version pour refuser une écriture client plus ancienne. SQLite convient à un writer modéré ; le déploiement reste mono-instance.

### Idempotence et déduplication

- clé d'idempotence fournie par le client pour événements/mutations sensibles ;
- unicité des impressions ;
- fenêtre de déduplication des heartbeats ;
- UPSERT de progression par `(profile_id, playable_id)` ;
- temps regardé calculé depuis la dernière observation acceptée, jamais additionné deux fois.

### Historique des changements

Les événements sont append-only ; l'état de progression est une projection. Les changements d'avis peuvent être audités par événement si l'analyse le nécessite, sans conserver indéfiniment toutes les métadonnées de navigation.

### Protection et conservation

- PIN et tokens : hash uniquement ; sessions expirées purgées rapidement.
- Événements détaillés : rétention recommandée de 12 à 24 mois en local, configurable.
- Impressions non suivies : 90 à 180 jours suffisent pour le cooldown et l'évaluation.
- Cache externe : TTL métier + stale maximal ; aucune donnée secrète dans le payload.
- Suppression de profil : transaction atomique et purge de toutes les données personnelles.
- Sauvegarde : fichier SQLite cohérent via API backup ou snapshot après checkpoint WAL, jamais simple copie incohérente des fichiers actifs.

