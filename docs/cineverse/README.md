# Documentation de référence CineVerse

> Analyse statique du dépôt générée le **31 juillet 2026**. Aucun build, test complet, serveur ou appel réseau externe n'a été lancé pour produire ces documents.

## Résumé

CineVerse est une application web locale de découverte et de visionnage de films, séries et animations. Le dépôt met en œuvre un monolithe modulaire Next.js : l'interface, les routes serveur, la persistance SQLite, l'intégration TMDB, la résolution FStream et les adaptateurs de lecteurs tiers vivent dans le même processus Node.js.

L'application dispose déjà d'un socle étendu : profils locaux, recherche et filtres, fiches détaillées, lecteurs tiers, progression prudente, watchlist, avis, recommandations hybrides, programmation personnalisée de l'accueil et statistiques par profil. Ses principaux risques ne sont pas l'absence de fonctionnalités, mais la fiabilité variable des iframes tierces, le couplage à l'HTML FStream, l'absence de tests automatisés et les limites opérationnelles d'une base SQLite locale.

## Statuts employés

- **Implémenté** : preuve directe et cohérente dans le code.
- **Partiellement implémenté** : mécanisme présent, mais incomplet, heuristique ou fragile.
- **Prévu** : annoncé dans le dépôt sans implémentation vérifiable.
- **Recommandé** : évolution proposée dans cette documentation.
- **À vérifier** : non confirmable par l'analyse statique actuelle.

Les constats **AS-IS** décrivent exclusivement le dépôt observé. Les propositions **TO-BE** sont explicitement séparées.

## Table des matières

1. [Audit du dépôt](./00-audit-repository.md)
2. [Spécification fonctionnelle](./01-product-functional-specification.md)
3. [Architecture technique](./02-technical-architecture.md)
4. [Données et Merise](./03-data-and-merise.md)
5. [Diagrammes](./04-diagrams.md)
6. [API, intégrations et flux](./05-api-integrations-and-flows.md)
7. [Qualité, sécurité et exploitation](./06-quality-security-operations.md)
8. [Roadmap](./07-roadmap.md)
9. [Schéma DBML](./schema.dbml)

## Conclusions principales

1. **Architecture actuelle** : monolithe modulaire Next.js 16 / React 19 / TypeScript, routes App Router côté serveur, SQLite via `better-sqlite3`, sans ORM.
2. **Métadonnées** : TMDB est la source canonique ; un cache mémoire, un cache SQLite et des données de repli limitent la dépendance réseau.
3. **Lecture** : FStream sert de résolveur de catalogue et de liens ; Uqload, Voe, Dood, Filmoon et Netu sont reconnus par un registre de providers. Leur présence ne garantit pas leur disponibilité pour un titre.
4. **Mesure** : une progression n'est fiable que si le lecteur envoie des messages exploitables. Le code évite une horloge simulée, mais le modèle persistant ne formalise pas encore le niveau de confiance.
5. **Personnalisation** : le moteur hybride exploite avis, contenus terminés, watchlist, exposition et signaux TMDB. Il reste dominé par des règles et les sources TMDB, ce qui est adapté au volume actuel.
6. **Profils** : les données sont cloisonnées par profil local ; le PIN est un verrou local, pas une authentification de compte.
7. **Exploitation** : le déploiement Docker est prévu pour une instance unique avec volume local. Il n'existe ni suite de tests, ni CI, ni health check, ni stratégie de sauvegarde vérifiable.

## Cinq priorités immédiates

1. Formaliser la provenance et la confiance de toute progression (`PLAYER_EXACT`, `PLAYER_SIGNAL`, `USER_DECLARED`, `SESSION_ONLY`, `UNKNOWN`).
2. Ajouter des tests de contrat autour de TMDB, FStream et des adaptateurs de providers, avec fixtures HTML et réponses simulées.
3. Corriger et migrer les contraintes d'unicité SQLite sensibles aux colonnes `NULL`, puis introduire des clés étrangères contrôlées.
4. Renforcer l'exploitation : health check, logs structurés homogènes, métriques de résolution, sauvegarde/restauration et CI minimale.
5. Durcir les mutations par session : protection CSRF explicite, limitation des essais de PIN et validation structurée des entrées.

## Limites de l'analyse

- Analyse statique uniquement : le fonctionnement réel des domaines, lecteurs, contenus et secrets n'a pas été testé.
- Les providers tiers et FStream peuvent changer sans modification du dépôt ; leur disponibilité actuelle est donc **À vérifier**.
- Aucun secret ni fichier de données local n'a été inspecté ; seules les variables documentées ont été inventoriées.
- Les branches d'erreur dépendant d'une iframe cross-origin ne sont pas entièrement observables sans lecteur coopératif.
- L'absence de tests dans les emplacements inspectés ne prouve pas qu'aucun test externe au dépôt n'existe.

