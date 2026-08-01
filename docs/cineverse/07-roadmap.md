# Roadmap CineVerse

## Principes

La roadmap privilégie l'intégrité des données et la résilience des dépendances avant l'ajout de fonctions. Priorités : **P0** bloquant, **P1** important, **P2** amélioration, **P3** expérimental. Complexités : **XS**, **S**, **M**, **L**, **XL**.

## Phase 0 — Stabilisation et clarification

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P0-01 | Geler et documenter les contrats actuels | Comportements implicites | P0 | Aucune | S | DTO/routes/providers inventoriés et exemples versionnés |
| P0-02 | Ajouter logger JSON et request ID | Diagnostic impossible | P0 | P0-01 | S | Une résolution se suit de bout en bout sans donnée sensible |
| P0-03 | Health live/ready | Pannes disque invisibles | P0 | P0-02 | XS | Processus et SQLite vérifiés sans appel externe |
| P0-04 | Corriger l'unicité de l'historique | Doublons films dus aux `NULL` | P0 | Backup/migration | M | Un seul état par film/épisode, migration idempotente |
| P0-05 | Activer/tester l'intégrité relationnelle | Orphelins et cascade manuelle | P0 | P0-04 | M | FK actives, suppression profil atomique testée |
| P0-06 | Normaliser erreurs et validation HTTP | Payloads incohérents | P1 | P0-01 | M | Toutes les routes utilisent schémas et codes stables |
| P0-07 | Clarifier métriques inconnues | `0` trompeur | P1 | Aucune | XS | UI/statistiques distinguent zéro, inconnu et non mesurable |

## Phase 1 — Socle fiable

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P1-01 | Introduire `playable_item` | Identité polymorphe fragile | P0 | P0-04/05 | L | Film 0/0 et épisodes positifs migrés sans perte |
| P1-02 | Modéliser provenance et confiance | Mesures mélangées | P0 | P1-01 | M | Chaque progression/fin indique source, confiance et raison |
| P1-03 | Clé d'idempotence événements | Double comptage | P0 | P1-02 | M | Rejeu d'une requête sans nouvel effet |
| P1-04 | Adaptateurs externes contractuels | Couplage et erreurs non typées | P0 | P0-01/06 | M | Interfaces TMDB/FStream/provider testées sur fixtures |
| P1-05 | Suite de tests store/API | Régressions silencieuses | P0 | P0-04, P1-02 | M | Parcours profils/progression/cache couverts |
| P1-06 | Protection CSRF et rate limit PIN | Mutations/brute force | P1 | P0-06 | S | Tests Origin/CSRF et verrou temporaire réussis |
| P1-07 | Sauvegarde/restauration | Perte de données | P0 | P0-03/04 | S | Restauration automatisée vérifiée sur base temporaire |
| P1-08 | Instrumenter caches | Quota/latence opaques | P1 | P0-02 | S | Hit/miss/stale/âge/taille visibles par namespace |

## Phase 2 — Expérience de visionnage

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P2-01 | Machine d'état de lecture unique | États UI/store divergents | P0 | P1-02/03 | M | Transitions documentées et testées, `INDETERMINE` géré |
| P2-02 | Registre de capacités versionné | Capacités provider supposées | P0 | P1-04 | M | Capacité confirmée par contrat/date, sinon inconnue |
| P2-03 | Santé et fallback provider | Choix à l'aveugle | P1 | P0-02, P1-04 | M | Statut récent affiché, fallback sans perte d'état |
| P2-04 | Auto-next fiable | Fin cross-origin incertaine | P1 | P2-01/02 | M | Un seul next après signal admissible, annulable et E2E |
| P2-05 | Reprise qualifiée | Seek non garanti | P1 | P2-01/02 | M | Reprise seulement si capacité présente, fallback explicite |
| P2-06 | Liste d'épisodes complète | Série assimilée à une fiche film | P2 | P1-01 | M | Épisodes réels, progression, durée et prochain épisode visibles |
| P2-07 | Test E2E player démo | Aucun contrôle de parcours | P0 | P2-01/04/05 | M | Start, pause, seek, end et next reproductibles sans réseau |
| P2-08 | Permissions iframe minimales | Surface tiers large | P1 | P1-04 | S/M | Matrice sandbox/allow par provider testée |

## Phase 3 — Données et recommandations

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P3-01 | Recalcul des projections | Historique incohérent difficile à réparer | P1 | P1-02/03 | M | Progression/stats reconstructibles depuis événements |
| P3-02 | Pondérer par confiance | Signal fragile contaminant le profil | P0 | P1-02, P3-01 | M | Déclaré/estimé/exact ont des poids distincts testés |
| P3-03 | Profil long terme/session | Mémoire positive trop courte | P1 | P3-02 | L | Préférences stables séparées de l'intention récente |
| P3-04 | Normaliser les caractéristiques | Bonus fixes dominants | P1 | P3-02/03 | M | Score 0–1 documenté, tests de classement déterministes |
| P3-05 | Enrichir les générateurs | Répétition TMDB | P2 | P3-03 | L | Durée, créateurs, nouveautés, reprise et exploration disponibles |
| P3-06 | Évaluer les expositions | Qualité non mesurée | P1 | P1-03, impressions existantes | M | clic/lecture/fin attribués et tableau de métriques |
| P3-07 | Programmer l'accueil V2 | Rangées encore en partie statiques | P2 | P3-03/05/06 | L | rangées choisies par contexte avec diversité globale |
| P3-08 | Nettoyer les statistiques | Heuristiques trop affirmatives | P1 | P3-01/02 | M | couverture/confiance par indicateur, aucune durée inventée |

## Phase 4 — Qualité, sécurité et observabilité

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P4-01 | CI lint/type/tests/build | Régressions non bloquées | P0 | P1-05, P2-07 | S | pipeline requis et reproductible |
| P4-02 | Contrôles externes planifiés | Dérive HTML/API tardive | P1 | P1-04 | M | alerte sans bloquer CI sur changement réel |
| P4-03 | Métriques et alertes | Incidents invisibles | P1 | P0-02/03, P1-08 | M | seuils TMDB/FStream/provider/DB suivis |
| P4-04 | Audit CSP/SSRF/iframe | Frontières externes risquées | P0 | P1-04/06, P2-08 | M | tests d'abus passants et exceptions documentées |
| P4-05 | Scan dépendances/image | Vulnérabilités supply chain | P1 | P4-01 | S | alertes critiques bloquantes avec politique d'exception |
| P4-06 | Runbooks incident/rollback | Réponse improvisée | P1 | P1-07, P4-03 | S | panne TMDB/FStream/DB et restauration répétées |
| P4-07 | Accessibilité et responsive E2E | Parcours tactiles/clavier fragiles | P2 | P2-07 | M | WCAG AA ciblé, mobile et clavier testés |

## Phase 5 — Évolutions avancées

| ID | Tâche | Problème résolu | Priorité | Dépendances | Complexité | Critère de fin |
| --- | --- | --- | --- | --- | --- | --- |
| P5-01 | Mode « Choisis pour moi » | Fatigue de décision | P2 | P3-05/07 | M | Trois choix max, raisons et durée adaptés |
| P5-02 | Recap périodique | Valeur des stats peu actionnable | P2 | P3-08 | M | Résumé basé uniquement sur données mesurées |
| P5-03 | Compatibilité profils consentie | Choix de groupe | P3 | Modèle de consentement | L | Opt-in explicite, explication et suppression |
| P5-04 | Comptes/synchronisation | Usage multi-appareil | P3 | Besoin validé, auth, PostgreSQL | XL | Isolation multi-tenant et migration éprouvées |
| P5-05 | Learning-to-rank léger | Limite des règles | P3 | Volume fiable P3-06 | XL | Gain hors ligne/en ligne prouvé vs moteur règles |
| P5-06 | PostgreSQL/multi-instance | Limite SQLite | P3 | P5-04 ou charge réelle | L/XL | migration zéro perte et concurrence testée |

## Ordre recommandé et dépendances

```text
P0-01 → P0-04/05/06 → P1-01 → P1-02 → P1-03
                     ↘ P1-04 → P2-02/03/08
P1-02/03 → P2-01 → P2-04/05 → P2-07
P1-02/03 → P3-01/02 → P3-03/04 → P3-05/07
P1-05 + P2-07 → P4-01 → P4-02/04/05
```

Le modèle de confiance est le verrou central : statistiques, auto-next et recommandation avancée en dépendent.

## Quick wins

1. Afficher `—` pour une donnée inconnue et une seule note explicative globale.
2. Ajouter request ID et logs JSON aux résolutions externes.
3. Ajouter readiness SQLite et message clair sur permissions du volume.
4. Tester les normalisations de langue/URL et les seuils de fin comme fonctions pures.
5. Exposer la date de dernière vérification d'une source sans promettre sa disponibilité.

## Dette technique critique

- unicité nullable et absence de clés étrangères ;
- progression sans provenance/confiance ;
- zéro test automatisé détecté ;
- contrats FStream/providers non figés par fixtures ;
- absence de sauvegarde/restauration et de health check ;
- mutations sans protection CSRF/rate limit explicite.

## À ne pas développer maintenant

- microservices, Kubernetes ou queue distribuée ;
- modèle neuronal ou vector database pour recommandations ;
- scraping de nouveaux sites avant fiabilisation de l'adaptateur actuel ;
- compte cloud et partage social sans besoin confirmé ;
- statistiques prédictives affichées comme certaines ;
- proxy/transcodage du flux vidéo, qui changerait fortement risques et conformité.

## Définition de fini globale

Une tâche est finie lorsque :

- comportement et erreur sont documentés ;
- types et validation runtime concordent ;
- migrations avant/arrière sont répétées sur copie ;
- tests positifs, limites et échecs sont automatisés ;
- logs/métriques n'exposent aucune donnée sensible ;
- accessibilité et responsive sont vérifiés si UI ;
- cache, timeout et fallback sont définis si externe ;
- rollback est possible ;
- AS-IS documentaire est mis à jour.

## Jalons portfolio ou projet académique

### Jalon A — Audit reproductible

Documentation présente, diagrammes rendables, schéma cible et décisions justifiées. Le présent dossier constitue le point de départ.

### Jalon B — Socle démontrable

Base migrée, fixtures externes, tests du domaine, CI et restauration. Démonstration possible entièrement hors réseau avec player démo.

### Jalon C — Visionnage fiable

Machine d'état, confiance, auto-next et fallback provider instrumentés. Le mémoire peut comparer précision perçue et mesure réellement accessible.

### Jalon D — Personnalisation évaluée

Dataset synthétique, métriques d'exposition, moteur hybride explicable et étude de biais. Comparaison avec baseline TMDB documentée.

### Jalon E — Exploitation crédible

Image déployable, health/backup/monitoring, sécurité testée et runbooks. Une vidéo de démonstration doit montrer aussi les scénarios de panne, pas seulement le parcours nominal.
