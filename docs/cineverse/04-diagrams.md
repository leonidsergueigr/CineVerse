# Diagrammes CineVerse

Les diagrammes **AS-IS** décrivent les flux observés. Les diagrammes **TO-BE** explicitent uniquement la cible recommandée. Mermaid est utilisé pour rester rendable dans la plupart des forges Markdown.

## 1. Diagramme de contexte — AS-IS

CineVerse centralise l'expérience et les données de profil, mais ne transporte pas le flux vidéo.

```mermaid
flowchart LR
    P[Profil local] -->|navigation et préférences| C[CineVerse]
    M[Mainteneur] -->|configuration et déploiement| C
    C -->|métadonnées, recherche, images| T[TMDB]
    C -->|catalogue HTML et résolution| F[FStream]
    C -->|URL d'embed validée| B[Navigateur]
    B -->|charge directement l'iframe| V[Provider vidéo]
    V -.->|postMessage si supporté| B
    C -->|profils, historique, cache| D[(SQLite)]
```

## 2. Diagramme de cas d'utilisation — AS-IS

Les fonctions nécessitant un profil actif sont regroupées autour de l'acteur principal.

```mermaid
flowchart LR
    U([Profil])
    O([Mainteneur])
    subgraph CV[CineVerse]
      UC1((Créer ou sélectionner un profil))
      UC2((Parcourir le catalogue))
      UC3((Rechercher et filtrer))
      UC4((Consulter une fiche))
      UC5((Choisir langue et provider))
      UC6((Lancer ou reprendre))
      UC7((Choisir saison et épisode))
      UC8((Gérer liste et avis))
      UC9((Recevoir des recommandations))
      UC10((Consulter ses statistiques))
      UC11((Configurer secrets et providers))
      UC12((Sauvegarder le volume))
    end
    U --> UC1
    U --> UC2
    U --> UC3
    U --> UC4
    U --> UC5
    U --> UC6
    U --> UC7
    U --> UC8
    U --> UC9
    U --> UC10
    O --> UC11
    O --> UC12
    UC6 -. dépend de .-> UC5
    UC7 -. étend .-> UC6
```

## 3. Diagramme de composants — AS-IS

Les composants sont modulaires mais déployés dans un seul processus.

```mermaid
flowchart TB
    subgraph Browser[Navigateur]
      UI[Composants React client]
      IF[iframe provider]
    end
    subgraph Next[Processus Next.js]
      Pages[Pages App Router]
      API[Route handlers /api]
      Profile[active-profile et sessions]
      Store[store.ts]
      Reco[recommendations.ts]
      Home[home-programming.ts]
      Stats[profile-statistics.ts]
      TMDB[tmdb.ts]
      FS[fstream.ts]
      Resolver[stream-resolver.ts]
      Registry[streaming.ts et providers.ts]
      Proxy[proxy.ts CSP et en-têtes]
    end
    DB[(cineverse.sqlite)]
    ExtT[API TMDB]
    ExtF[Site FStream]
    ExtP[Providers vidéo]

    UI --> API
    UI --> IF
    Pages --> Profile
    Pages --> Home
    API --> Profile
    Profile --> Store
    Home --> Reco
    Home --> Store
    Reco --> TMDB
    Reco --> Store
    Stats --> Store
    Resolver --> FS
    Resolver --> Registry
    Store --> DB
    TMDB --> ExtT
    FS --> ExtF
    IF --> ExtP
    Proxy -. protège .-> Browser
```

## 4. Diagramme de classes du domaine — TO-BE

Cette vue reprend les concepts cibles sans imposer un ORM.

```mermaid
classDiagram
    class Profile {
      +string id
      +string name
      +string color
      +bool hasPin
    }
    class MediaItem {
      +int tmdbId
      +MediaType type
      +string title
    }
    class Season {
      +int number
      +int episodeCount
    }
    class PlayableItem {
      +int seasonNumber
      +int episodeNumber
      +PlayableKind kind
      +int runtimeSeconds
    }
    class StreamSource {
      +Language language
      +string quality
      +SourceStatus status
      +datetime expiresAt
    }
    class Provider {
      +string key
      +int reliability
      +Capabilities capabilities
    }
    class PlaybackSession {
      +PlaybackState state
      +MeasurementSource source
      +float confidence
    }
    class ViewingEvent {
      +EventType type
      +int positionSeconds
      +int watchSeconds
      +float confidence
    }
    class Progress {
      +int positionSeconds
      +bool completed
      +CompletionReason reason
      +float confidence
    }
    class Reaction {
      +ReactionType value
    }
    class RecommendationImpression {
      +string shelf
      +int position
      +float score
    }

    Profile "1" --> "0..*" PlaybackSession
    Profile "1" --> "0..*" Progress
    Profile "1" --> "0..*" Reaction
    Profile "1" --> "0..*" RecommendationImpression
    MediaItem "1" --> "0..*" Season
    MediaItem "1" --> "1..*" PlayableItem
    Season "0..1" --> "1..*" PlayableItem
    PlayableItem "1" --> "0..*" StreamSource
    Provider "1" --> "0..*" StreamSource
    PlaybackSession "1" --> "0..*" ViewingEvent
    PlaybackSession --> PlayableItem
    Progress --> PlayableItem
    Reaction --> MediaItem
    RecommendationImpression --> MediaItem
```

## 5. Diagramme de déploiement — AS-IS

Le stockage local rend le déploiement mono-instance.

```mermaid
flowchart TB
    subgraph Host[Hôte Docker]
      subgraph Container[Conteneur cineverse]
        Node[Node.js 22 et serveur Next.js]
      end
      Volume[(Volume ./data vers /app/data)]
      Node -->|better-sqlite3| Volume
    end
    Browser[Navigateur utilisateur] -->|HTTP 3000 ou HTTPS via proxy externe| Node
    Node -->|HTTPS| TMDB[TMDB]
    Node -->|HTTPS et parsing HTML| FStream[FStream]
    Browser -->|HTTPS iframe| Providers[Uqload, Voe, Dood, Filmoon, Netu]
```

## 6. Diagramme entité-association — TO-BE

Le détail des attributs est dans [03-data-and-merise.md](./03-data-and-merise.md) et [schema.dbml](./schema.dbml).

```mermaid
erDiagram
    PROFILE ||--o{ PROFILE_SESSION : ouvre
    PROFILE ||--o{ PLAYBACK_SESSION : demarre
    PROFILE ||--o{ VIEWING_EVENT : produit
    PROFILE ||--o{ PROFILE_PROGRESS : possede
    PROFILE ||--o{ REACTION : exprime
    PROFILE ||--o{ WATCHLIST_ITEM : ajoute
    PROFILE ||--o{ RECOMMENDATION_IMPRESSION : recoit
    MEDIA_ITEM ||--o{ SEASON : contient
    MEDIA_ITEM ||--|{ PLAYABLE_ITEM : definit
    SEASON o|--|{ PLAYABLE_ITEM : regroupe
    PLAYABLE_ITEM ||--o{ STREAM_SOURCE : propose
    PLAYABLE_ITEM ||--o{ PLAYBACK_SESSION : concerne
    PLAYABLE_ITEM ||--o{ VIEWING_EVENT : concerne
    PLAYABLE_ITEM ||--o{ PROFILE_PROGRESS : etat
    PROVIDER ||--o{ STREAM_SOURCE : fournit
    PROVIDER ||--o{ PROVIDER_HEALTH : observe
    PLAYBACK_SESSION ||--o{ VIEWING_EVENT : genere
    MEDIA_ITEM ||--o{ REACTION : cible
    MEDIA_ITEM ||--o{ WATCHLIST_ITEM : cible
    MEDIA_ITEM ||--o{ RECOMMENDATION_IMPRESSION : cible
```

## 7. Séquence de recherche d'un contenu — AS-IS

La recherche de page combine TMDB et classement local ; l'API de suggestions sert la saisie rapide.

```mermaid
sequenceDiagram
    actor U as Profil
    participant H as SiteHeader/Browse
    participant A as /api/search/suggestions
    participant T as tmdb.ts
    participant C as Cache SQLite/mémoire
    participant X as TMDB

    U->>H: saisit une requête
    H->>A: GET ?q=...
    A->>T: searchSuggestions(q)
    T->>C: lire clé de cache
    alt cache frais
      C-->>T: résultats
    else cache absent
      T->>X: /search/multi
      X-->>T: titres et personnes
      T->>T: normaliser et classer avec Fuse
      T->>C: écrire avec TTL
    end
    T-->>A: groupes titres/personnes
    A-->>H: JSON, cache privé court
    H-->>U: suggestions
    U->>H: Entrée ou Tous les résultats
    H->>H: fermer le panneau et naviguer /browse?q=...
```

## 8. Séquence de résolution d'un provider — AS-IS

La validation TMDB et l'allowlist empêchent d'accepter aveuglément un résultat FStream.

```mermaid
sequenceDiagram
    participant W as Page watch
    participant R as stream-resolver
    participant F as Adaptateur FStream
    participant C as Cache externe
    participant S as Site FStream
    participant T as TMDB
    participant V as Registre streaming

    W->>R: resolve(media, saison, épisode)
    R->>F: resolveStreamSources(request)
    F->>C: domaine, rapprochement et liens en cache
    alt données fraîches
      C-->>F: candidats
    else résolution nécessaire
      F->>S: découvrir domaine et rechercher titre
      S-->>F: HTML
      F->>T: confirmer titre, type, année ou affiche
      T-->>F: métadonnées canoniques
      F->>S: lire page/épisode et liens
      S-->>F: URLs candidates
      F->>C: mettre en cache avec TTL
    end
    loop chaque URL
      F->>V: identifier provider et valider HTTPS/hôte/path
      V-->>F: source normalisée ou rejet
    end
    F-->>R: sources valides, langues et capacités
    R-->>W: résultat aplati ou erreur isolée
```

## 9. Séquence de démarrage d'une lecture — AS-IS

Le démarrage prouve une intention, pas une durée regardée.

```mermaid
sequenceDiagram
    actor U as Profil
    participant UI as WatchExperience
    participant P as /api/progress et /api/events
    participant FP as /api/fstream-player
    participant R as Résolveur
    participant I as iframe provider

    U->>UI: clique Lecture
    UI->>P: PLAY_STARTED
    UI->>FP: GET source/langue/média/S/E
    FP->>R: résoudre à nouveau et valider
    R-->>FP: URL embed autorisée
    FP-->>I: 307 vers l'embed
    I-->>U: interface du provider
    Note over UI,I: CineVerse ne contrôle pas le flux vidéo.
    opt provider coopératif
      I-->>UI: postMessage durée/position
      UI->>P: progression qualifiée
    end
```

## 10. Séquence de sauvegarde de progression — AS-IS et limite TO-BE

Le temps ajouté est borné par le temps mural. La cible ajoute provenance, confiance et idempotence.

```mermaid
sequenceDiagram
    participant I as iframe autorisée
    participant UI as WatchExperience
    participant API as POST /api/progress
    participant S as store.ts
    participant DB as SQLite

    I-->>UI: postMessage timeupdate/ended
    UI->>UI: vérifier source, origine, position et durée
    UI->>API: progression média/S/E
    API->>S: recordViewingEvent et upsertProgress
    S->>S: borner watch_seconds par temps mural
    S->>DB: transaction événement + état
    DB-->>S: succès
    S-->>API: état courant
    API-->>UI: JSON
    Note over API,DB: TO-BE : idempotency_key, measurement_source, confidence et completion_reason obligatoires.
```

## 11. Séquence de génération des recommandations — AS-IS

Le moteur est hybride, basé sur des règles et des sources TMDB.

```mermaid
sequenceDiagram
    participant H as Page/Home programming
    participant S as store.ts
    participant R as recommendations.ts
    participant T as TMDB
    participant I as recommendation_impressions

    H->>S: likes, terminés, watchlist, dislikes, expositions
    S-->>H: signaux du profil
    H->>R: buildRecommendations(signaux)
    loop graines positives récentes
      R->>T: détail, recommendations, similar
      T-->>R: candidats
    end
    R->>T: discover par genres dominants
    T-->>R: candidats de découverte
    R->>R: score contenu, langue, type, qualité et exposition
    R->>R: exclure avis directs et diversifier
    R-->>H: 18 candidats expliqués
    H->>H: composer rangées, dédupliquer et choisir héros
    H-->>I: session et impressions à enregistrer côté client
```

## 12. Diagramme d'état d'une session de lecture — TO-BE

`PAUSE_ESTIMEE` et `INDETERMINE` sont nécessaires quand l'iframe ne révèle pas son état réel.

```mermaid
stateDiagram-v2
    [*] --> NON_COMMENCE
    NON_COMMENCE --> EN_CHARGEMENT: clic Lecture
    EN_CHARGEMENT --> EN_LECTURE: signal player fiable
    EN_CHARGEMENT --> INDETERMINE: iframe chargée sans signal
    EN_CHARGEMENT --> ERREUR: résolution ou chargement échoue
    EN_LECTURE --> PAUSE_ESTIMEE: signal pause ou silence court
    PAUSE_ESTIMEE --> EN_LECTURE: nouveau signal de progression
    EN_LECTURE --> TERMINE: ended ou seuil fiable
    EN_LECTURE --> INTERROMPU: navigation/fermeture connue
    INDETERMINE --> EN_LECTURE: premier signal exploitable
    INDETERMINE --> INTERROMPU: fermeture sans mesure
    ERREUR --> EN_CHARGEMENT: retry ou autre provider
    INTERROMPU --> EN_CHARGEMENT: reprise
    TERMINE --> EN_CHARGEMENT: relecture explicite
```

## 13. État d'un film ou épisode pour un profil — TO-BE

L'état personnel est une projection et non une copie brute de la session player.

```mermaid
stateDiagram-v2
    [*] --> JAMAIS_LANCE
    JAMAIS_LANCE --> COMMENCE: PLAY_STARTED + signal utile
    JAMAIS_LANCE --> TERMINE_DECLARE: Marquer vu
    COMMENCE --> EN_COURS: progression fiable sous seuil
    EN_COURS --> PRESQUE_TERMINE: seuil de proximité
    PRESQUE_TERMINE --> TERMINE_MESURE: ended ou seuil avec confiance
    EN_COURS --> INTERROMPU: session close
    INTERROMPU --> EN_COURS: reprise
    EN_COURS --> ABANDON_PROBABLE: inactivité longue + progression médiane
    ABANDON_PROBABLE --> EN_COURS: reprise ultérieure
    TERMINE_DECLARE --> EN_COURS: correction utilisateur
    TERMINE_MESURE --> EN_COURS: relecture explicite
    note right of JAMAIS_LANCE
      Une simple fiche consultée
      ne change pas cet état.
    end note
```

## 14. Flux de données TMDB, cache et providers — AS-IS

La base garde les données personnelles ; les réponses externes sont temporaires.

```mermaid
flowchart LR
    U[Profil] -->|recherche, clic, avis| CV[CineVerse]
    CV -->|clé de requête| Cache[(external_api_cache)]
    Cache -->|frais ou stale| CV
    CV -->|cache miss| TMDB[TMDB]
    TMDB -->|métadonnées JSON| CV
    CV -->|requête de résolution| FS[FStream]
    FS -->|HTML et liens candidats| CV
    CV -->|URL validée| I[iframe navigateur]
    I -->|flux direct| PV[Provider vidéo]
    PV -.->|signaux facultatifs| I
    I -->|événements filtrés| CV
    CV -->|profil, événements, progression| Personal[(Tables personnelles SQLite)]
    Personal -->|signaux| CV
    CV -->|accueil et recommandations| U
```
