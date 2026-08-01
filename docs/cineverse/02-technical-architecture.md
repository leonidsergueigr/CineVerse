# Architecture technique CineVerse

## 1. Architecture AS-IS

### Style architectural

CineVerse est un **monolithe modulaire orienté serveur** :

- pages React serveur pour charger catalogue et données de profil ;
- composants client pour les interactions, le player et les mutations ;
- route handlers Next.js comme API interne ;
- modules `src/lib` pour la persistance, le domaine et les intégrations ;
- base SQLite et caches dans le même processus Node.js.

Ce choix est proportionné à une application locale ou une petite équipe. Il évite une infrastructure distribuée sans empêcher la séparation future des adaptateurs.

### Frontend

- App Router dans `src/app` ; pages dynamiques pour les données personnalisées.
- Composants serveur : chargement initial, vérification du profil, composition de l'accueil.
- Composants client : `cineverse-home.tsx`, `watch-experience.tsx`, `profile-hub.tsx`, recherche, liste et statistiques animées.
- État local React et URL pour filtres ; pas de store global externe.
- CSS global/Tailwind ; ressources TMDB via `next/image` et `next.config.ts`.

### Backend et routes serveur

Les route handlers sous `src/app/api` exposent les mutations et lectures requises par les composants client. Les pages serveur appellent aussi directement `src/lib`, ce qui évite un aller-retour HTTP interne mais crée deux façades d'accès au même domaine.

### Données

`src/lib/store.ts` centralise schéma et requêtes SQL manuelles. L'accès `better-sqlite3` est synchrone et mis en singleton de processus. WAL réduit les blocages lecteur/rédacteur, mais l'architecture reste mono-instance avec stockage local.

Les métadonnées externes ne sont pas toutes répliquées : l'identifiant TMDB est canonique, tandis que titre et chemins d'images sont conservés dans les enregistrements personnels pour affichage résilient.

### Services externes et flux réseau

1. L'application demande les métadonnées à TMDB depuis le serveur.
2. Elle consulte FStream pour le catalogue et la résolution de sources.
3. Elle valide chaque URL selon le registre de providers.
4. Le navigateur charge directement l'iframe du provider.
5. Les messages éventuels de l'iframe sont filtrés puis transformés en événements/progression.

Le flux vidéo ne transite pas par CineVerse.

### Cache

- promesses en mémoire pour coalescer certains appels TMDB ;
- cache Next `fetch` pour des réponses non personnalisées ;
- table SQLite `external_api_cache` avec expiration et repli périmé ;
- TTL propres à TMDB, domaine/catalogue/liens FStream et disponibilité provider ;
- purge opportuniste quotidienne des entrées très anciennes.

**Limite :** aucune métrique hit/miss, taille, âge du stale ou invalidation opérateur.

### Gestion des états

- profil actif : cookie de session résolu côté serveur ;
- préférences et historique : SQLite ;
- filtres : paramètres de requête ;
- player : état React local, messages cross-origin et écritures API ;
- recommandations : recalcul serveur + impressions persistées ;
- statistiques : agrégation à la demande.

### Authentification et autorisation

Il s'agit d'une session de **profil local**, pas d'une authentification utilisateur distante. Le cookie contient un token opaque dont seul le hash est stocké. Les routes récupèrent le profil depuis la session ; la possession du navigateur après activation accorde l'accès au profil.

### Sécurité

Mesures observées :

- secrets TMDB côté serveur ;
- dérivation `scrypt` des PIN ;
- cookie HttpOnly/SameSite ;
- validation HTTPS, hôtes et chemins des embeds ;
- politique CSP et en-têtes dans `src/proxy.ts` ;
- filtrage des origines/messages player ;
- `referrerPolicy` restrictif sur l'iframe.

Mesures incomplètes : validation de payload ad hoc, pas de CSRF dédié, pas de limitation d'essais, pas de sandbox iframe stricte observée, scraping externe à forte surface de confiance.

### Observabilité

Quelques chemins de résolution journalisent des objets JSON avec `console`. Il n'existe pas de logger commun, corrélation de requête, métrique, trace, alerte ou tableau de santé.

### Déploiement

Le `Dockerfile` construit un serveur standalone Node 22. `docker-compose.yml` monte `./data` dans `/app/data`, expose 3000 et fixe `CINEVERSE_DATA_DIR`. Le répertoire doit être accessible à l'utilisateur du conteneur, sinon SQLite renvoie `SQLITE_CANTOPEN`.

Ce déploiement n'est pas horizontalement scalable : deux conteneurs avec des volumes distincts divergeraient ; un volume partagé SQLite serait risqué.

### Dépendances critiques

| Dépendance | Nature | Criticité |
| --- | --- | --- |
| Next.js/React | Runtime applicatif | Critique |
| better-sqlite3 | Données locales | Critique |
| TMDB | Métadonnées/recherche | Critique avec repli partiel |
| FStream | Catalogue enrichi et résolution | Critique pour de nombreuses lectures, non pour toute navigation |
| Providers vidéo | Lecture | Critique par titre, remplaçable par fallback |
| Cheerio | Parsing FStream | Critique pour l'adaptateur FStream |
| Fuse.js | Tolérance locale aux fautes | Facultative |

## 2. Architecture TO-BE recommandée

### Principe

Conserver le monolithe, mais rendre ses frontières explicites :

```text
UI / Route handlers
        ↓
Services applicatifs
        ↓
Domaine et politiques
        ↓
Repositories / Adapters externes
        ↓
SQLite/PostgreSQL, TMDB, FStream, providers
```

Ni microservices ni bus distribué ne sont justifiés maintenant.

### R1 — Service de progression qualifiée

**Problème :** `watch_history` mélange position, complétion détectée et déclaration sans provenance.

**Choix :** introduire `measurement_source`, `confidence`, `completion_reason` et une politique unique de transition. Conserver les événements bruts, matérialiser seulement un état agrégé.

- Avantages : statistiques et recommandations fiables, audit possible, auto-next prudent.
- Inconvénients : migration de schéma et adaptation des agrégats.
- Difficulté : **M**.
- Quand : **maintenant (P0)**.

### R2 — Contrats d'adaptateurs externes

**Problème :** TMDB/FStream/providers évoluent indépendamment et renvoient des formes non fiables.

**Choix :** interfaces explicites (`MetadataProvider`, `CatalogSource`, `StreamResolver`, `PlaybackSignalAdapter`) et validation des DTO à la frontière.

- Avantages : fixtures, fallback, erreurs typées, remplacement ciblé.
- Inconvénients : code de mapping supplémentaire.
- Difficulté : **M**.
- Quand : **maintenant**.

### R3 — Migrations SQL versionnées

**Problème :** le schéma est créé/modifié dans `getDb`, sans FK et avec une unicité fragile.

**Choix :** scripts SQL ordonnés exécutés dans une transaction, table de versions, sauvegarde préalable. Rester sans ORM au départ.

- Avantages : reproductibilité, rollback documenté, contraintes testables.
- Inconvénients : discipline de migration obligatoire.
- Difficulté : **M**.
- Quand : **maintenant**.

### R4 — Validation structurée et erreurs communes

**Problème :** chaque route interprète manuellement les corps et produit ses propres erreurs.

**Choix :** schémas partagés à la frontière HTTP et enveloppe d'erreur stable (`code`, `message`, `requestId`, `details?`). Une petite bibliothèque de validation est acceptable lors d'une phase d'implémentation, mais n'est pas requise pour cette documentation.

- Avantages : sécurité, contrats, tests simples.
- Inconvénients : migration de toutes les routes.
- Difficulté : **S/M**.
- Quand : **maintenant**.

### R5 — Observabilité locale d'abord

**Problème :** impossible de savoir si une panne vient de TMDB, FStream, d'un provider ou du disque.

**Choix :** logger JSON commun, request ID, métriques en mémoire/endpoint protégé, health/readiness, journal de santé provider.

- Avantages : diagnostic et alertes possibles sans plateforme lourde.
- Inconvénients : stockage/rétention à définir.
- Difficulté : **S**.
- Quand : **maintenant**.

### R6 — Tâches asynchrones légères

**Problème :** les statistiques et recommandations sont calculées à la demande ; les vérifications externes peuvent allonger les réponses.

**Choix :** ne pas installer de queue distribuée. Utiliser d'abord recalcul différé/idempotent dans le processus ou cron externe mono-instance pour purge, préchauffage et santé. Une vraie queue seulement en cas de déploiement multi-instance.

- Avantages : faible coût, cohérent avec SQLite.
- Inconvénients : tâches perdues au redémarrage si non persistées.
- Difficulté : **S/M**.
- Quand : **plus tard**.

### R7 — PostgreSQL conditionnel

**Problème :** SQLite limite concurrence, réplication et hébergement sans disque persistant.

**Choix :** conserver SQLite pour usage local/portfolio. Migrer vers PostgreSQL uniquement si multi-instance, multi-appareil ou charge concurrente deviennent des exigences.

- Avantages du maintien : simplicité, sauvegarde fichier, coût nul.
- Inconvénients : mono-instance et migrations plus délicates.
- Difficulté de migration : **L**.
- Quand : **plus tard, conditionnel**.

### R8 — Recommandation hybride V2, sans ML prématuré

**Problème :** les poids fixes et signaux de complétion non qualifiés peuvent biaiser le classement.

**Choix :** normaliser les caractéristiques, appliquer la confiance des événements, séparer goûts long terme/intention de session et évaluer les résultats sur impressions. Conserver un moteur déterministe explicable.

- Avantages : testable, peu de données requises, explications fiables.
- Inconvénients : réglage manuel et métriques nécessaires.
- Difficulté : **M/L**.
- Quand : après R1 et instrumentation.

## 3. Matrice de décision technologique

| Domaine | Technologie actuelle | Technologie recommandée | Conserver ou changer | Justification | Coût de migration |
| --- | --- | --- | --- | --- | --- |
| Framework web | Next.js 16 App Router | Next.js, version maintenue | Conserver | SSR, routes et standalone déjà intégrés | Faible |
| Langage | TypeScript strict | TypeScript strict | Conserver | Typage partagé UI/serveur | Nul |
| UI | React 19 + Tailwind/CSS | Identique, composants accessibles | Conserver | Cohérent et suffisant | Faible |
| Base locale | SQLite | SQLite maintenant ; PostgreSQL conditionnel | Conserver | Adapté à l'instance unique | Élevé si changement |
| Accès données | SQL `better-sqlite3` | Repository + migrations SQL | Faire évoluer | Pas besoin d'un ORM pour ce volume | Moyen |
| ORM | Aucun | Aucun imposé | Conserver | Un ORM ajouterait peu avant clarification du schéma | Nul |
| Validation | Fonctions ad hoc | Schémas DTO partagés | Changer | Frontières externes nombreuses | Moyen |
| Authentification | Session locale + PIN | Identique en local ; vraie identité si cloud | Conserver maintenant | Le besoin actuel est profil local | Élevé si cloud |
| Cache | Mémoire + Next + SQLite | Cache unifié instrumenté | Faire évoluer | Résilience déjà bonne, gouvernance manquante | Moyen |
| Tâches async | Aucune | Cron/processus léger | Ajouter plus tard | Éviter Redis/queue prématurés | Faible/moyen |
| Logs | `console` partiel | Logger JSON + request ID | Changer | Diagnostic des dépendances | Faible |
| Monitoring | Aucun | Health + métriques, export optionnel | Ajouter | Visibilité minimale requise | Moyen |
| Tests | Aucun détecté | Vitest/runner équivalent + Playwright + contrats | Ajouter | Risque externe et progression élevés | Moyen |
| CI/CD | Aucun détecté | Lint, typecheck, tests, build, image | Ajouter | Empêche les régressions | Faible/moyen |
| Hébergement | Docker mono-instance | Docker mono-instance avec volume/backup | Conserver | Correspond à SQLite | Faible |
| Stockage | Volume local | Volume persistant + snapshots | Faire évoluer | Données de profil irremplaçables | Faible |
| Sécurité | CSP/allowlist/session | CSP testée, CSRF, rate limit local | Renforcer | Mutations et iframes sensibles | Moyen |
| Secrets | Variables d'environnement | Secret manager selon hébergeur | Faire évoluer au déploiement | Aucun secret dans l'image/dépôt | Faible |

## 4. Cible de déploiement progressive

### Court terme

Un conteneur CineVerse, un volume SQLite sauvegardé, une sortie de logs JSON, un endpoint de santé et des appels HTTPS vers TMDB/FStream/providers.

### Si le produit devient partagé

Un processus web stateless, PostgreSQL managé, secrets managés, cache facultatif et stockage des sauvegardes hors hôte. Cette évolution doit être déclenchée par un besoin réel de concurrence ou de multi-appareil, pas par anticipation.
