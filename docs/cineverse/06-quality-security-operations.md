# Qualité, sécurité et exploitation

## 1. Position actuelle

**AS-IS :** CineVerse dispose de protections utiles dans `src/proxy.ts`, `src/lib/store.ts`, `src/lib/streaming.ts` et `watch-experience.tsx`, mais aucun test automatisé, pipeline CI, health check, sauvegarde ou monitoring n'a été détecté. Les propositions ci-dessous constituent le plan **TO-BE**.

## 2. Sécurité

### Authentification et autorisation

- Conserver le token opaque de profil, son hash en base et le cookie HttpOnly.
- Régénérer le token lors de l'activation et purger les sessions expirées.
- Centraliser un garde de profil sur toutes les routes personnelles.
- Limiter les tentatives de PIN par profil/IP et journaliser uniquement le résultat, jamais le PIN.
- Afficher clairement qu'un PIN est un verrou local, pas une protection de compte en ligne.
- Si un compte distant est ajouté, séparer compte, foyer, profil et rôles ; ne pas étendre le modèle PIN.

### Validation des entrées

- Schémas runtime pour paramètres, query et JSON ; rejeter les clés inconnues sensibles.
- Bornes strictes sur identifiants, positions, durées, saison, épisode, taille des titres et metadata JSON.
- Enum fermé pour média, langue, provider, événement et action d'impression.
- Normaliser les chaînes Unicode avant comparaison de titres, sans les injecter dans une URL arbitraire.

### XSS et contenu externe

- Ne pas rendre d'HTML FStream/TMDB avec `dangerouslySetInnerHTML`.
- Échapper toutes les métadonnées externes dans React.
- Maintenir la CSP de `src/proxy.ts`; supprimer progressivement `unsafe-inline` si présent/nécessaire.
- Interdire `javascript:`, `data:` et HTTP dans toute URL de player.

### CSRF, cookies et sessions

- `SameSite=Lax` est une première barrière, pas une preuve suffisante.
- Vérifier `Origin`/`Host` sur POST/PATCH/DELETE et introduire un token CSRF si l'application est publiée.
- Conserver `Secure` sous HTTPS, fixer une durée maximale, révoquer les anciens tokens et ne jamais exposer le hash.

### SSRF et redirections

- Continuer à accepter des identités logiques, jamais une URL externe fournie au proxy player.
- Résoudre uniquement des domaines HTTPS allowlistés et revalider après chaque redirection.
- Bloquer adresses loopback, link-local, privées et résultats DNS rebinding pour les URLs configurables.
- Borner taille, temps et nombre de redirections des fetchs FStream/disponibilité.

### Injection et SQLite

- Toutes les valeurs doivent utiliser des statements préparés.
- Les noms de table/colonne ne viennent jamais du client.
- Activer `foreign_keys`, vérifier les contraintes et limiter les payloads JSON.
- Ne pas inclure position, titres personnels ou tokens dans les erreurs SQL renvoyées.

### Iframes

- Construire `frame-src` depuis le même registre que la validation serveur.
- Réduire `allow` à autoplay/fullscreen et capacités réellement requises.
- Utiliser `sandbox` si un provider reste fonctionnel avec les permissions minimales ; documenter chaque exception.
- Vérifier `event.source`, `event.origin`, type et bornes de chaque `postMessage`.
- Ne jamais considérer un message provider comme exact sans contrat/version testée.
- Afficher que le provider tiers peut avoir ses propres cookies, publicités et traceurs.

### Secrets et journalisation

- Secrets TMDB/FStream uniquement dans variables ou secret manager, jamais dans le bundle client.
- Rotation documentée et `.env` hors Git.
- Logs structurés sans token, PIN, URL d'embed complète, synopsis ou historique détaillé.
- Redaction automatique des query strings sensibles.

### Scraping et abus

- User-Agent explicite, fréquence raisonnable, cache et respect des conditions applicables.
- Rate limiting sur recherche/résolution pour éviter de relayer un abus vers les tiers.
- Kill switch par adaptateur et domaine.
- Vérification juridique avant déploiement public.

## 3. Stratégie de tests

### Pyramide proposée

| Niveau | Cible | Exemples prioritaires |
| --- | --- | --- |
| Unitaire | Politiques pures | seuil de fin, bornage du temps, normalisation langue, score/diversité, état session |
| Intégration | Store/routes avec SQLite temporaire | profils/PIN, cascade, UPSERT progression, idempotence, cache stale |
| Contrat | Adaptateurs externes sur fixtures | réponses TMDB, HTML FStream, URLs de chaque provider, disponibilité |
| E2E | Parcours critiques sans réseau réel | premier profil, recherche, fiche, lecture démo, auto-next, liste, stats |
| Sécurité | Entrées et frontières | URL SSRF, origine postMessage, CSRF, PIN brute force, CSP |

### Tests unitaires

- `isNearPlaybackEnd` : films, épisodes, durée inconnue, seek à 99 %, seuils.
- `recordViewingEvent` : delta position supérieur au temps mural, heartbeat dupliqué, position régressive.
- recommandation : poids positif/négatif, exclusion dislike, cooldown, diversité et cold start.
- programmation : aucune duplication globale, héros valide, ordre horaire déterministe avec horloge injectée.
- statistiques : inconnu distinct de zéro, complétion manuelle sans temps, fuseau et sessions.

### Tests d'intégration

- base vide → schéma/migrations ; migration depuis une copie de chaque version supportée ;
- contrainte unique film/épisode et concurrence de deux progressions ;
- suppression d'un profil sans orphelin ;
- cookie expiré, profil absent, mauvais PIN ;
- cache frais, expiré, stale, payload corrompu et purge ;
- erreurs HTTP homogènes et absence de fuite de secret.

### Tests de contrat externes

Conserver des fixtures versionnées et nettoyées :

- TMDB : recherche, détail film/série, crédits, saison vide, 404, 429 et JSON incomplet ;
- FStream : page index, catalogue, résultat film, série multi-saisons, domaine changé, sélecteurs absents ;
- provider : URL valide/invalide, hôte voisin malveillant, langue, capacités et redirection ;
- `postMessage` : événements documentés, données absurdes, mauvaise origine et fin.

Les tests ne doivent pas dépendre du réseau. Un job planifié non bloquant peut contrôler les contrats réels et alerter sur dérive.

### Tests E2E

Utiliser le player local `/api/demo-player` pour un scénario déterministe :

1. créer/activer un profil ;
2. rechercher puis fermer les suggestions ;
3. ouvrir un média et lancer ;
4. envoyer position, pause et fin ;
5. vérifier reprise, complétion et auto-next ;
6. vérifier isolation en changeant de profil ;
7. ajouter/retirer watchlist, like et dislike ;
8. contrôler les états mobile et clavier.

### Tests de recommandation

- jeu synthétique par profil avec attentes de classement ;
- invariants : aucun dislike, aucun doublon, limites de franchise/genre ;
- snapshot des explications ;
- mesure hors ligne : précision des clics/lectures/complétions uniquement sur événements de confiance ;
- test de biais popularité/langue/type et vérification du cold start.

## 4. Exploitation

### Logs structurés

Chaque log serveur devrait contenir :

```text
timestamp, level, request_id, route, operation, dependency,
duration_ms, outcome, error_code, cache_status, provider_key
```

Le `profile_id` doit être hashé ou omis sauf nécessité de diagnostic local. Les logs d'accès ne doivent pas contenir PIN, token ou URL d'embed signée.

### Métriques

- HTTP : volume, latence p50/p95, erreurs par route ;
- TMDB/FStream : requêtes, timeout, retry, cache hit/stale/miss ;
- providers : résolution réussie, URL refusée, latence, signal de progression reçu ;
- SQLite : taille, durée requête, busy/locked, échec sauvegarde ;
- lecture : sessions lancées, part mesurable, complétions par provenance, auto-next réussi ;
- recommandations : impressions, clics, lectures, complétions, répétitions.

### Traces

Un request ID propagé suffit d'abord. Ajouter OpenTelemetry uniquement si le diagnostic multi-dépendances le justifie. Une trace de résolution doit relier cache, FStream, TMDB et validation provider sans stocker l'URL complète.

### Alertes

- FStream découverte/résolution sous seuil sur plusieurs contrôles ;
- taux d'erreur TMDB/429 élevé ;
- tous les providers d'une langue indisponibles ;
- SQLite non inscriptible, verrouillé ou disque presque plein ;
- backup trop ancien ou restauration de contrôle échouée ;
- chute du taux de sessions player mesurables.

### Health checks

- `/api/health/live` : processus vivant, aucune dépendance externe.
- `/api/health/ready` : répertoire accessible, SQLite lisible/inscriptible, migration à jour.
- `/api/health/dependencies` protégé : âge cache/domaine et derniers contrôles, sans faire un appel externe à chaque probe.

### Sauvegarde et restauration

- sauvegarde SQLite via API backup/checkpoint cohérent ;
- chiffrement si stockage hors hôte ;
- rétention quotidienne/hebdomadaire configurable ;
- test de restauration mensuel vers une base temporaire ;
- documenter RPO (24 h recommandé) et RTO (1 h pour usage personnel) ;
- inclure version du schéma et checksum, exclure caches régénérables si souhaité.

### CI/CD

Pipeline minimal :

1. installation verrouillée (`npm ci`) ;
2. lint et typecheck ;
3. tests unitaires/intégration ;
4. vérification DBML/diagrammes si outil déjà disponible ;
5. build Next ;
6. construction et scan de l'image ;
7. E2E smoke sur player démo ;
8. publication immuable ;
9. sauvegarde puis migration au déploiement ;
10. readiness et rollback automatique si échec.

### Environnements, migrations et rollback

- `development` : SQLite jetable et providers démo par défaut ;
- `test` : réseau interdit, fixtures uniquement ;
- `production` : secrets injectés, volume sauvegardé, providers allowlistés ;
- migration transactionnelle avec checksum et test sur copie ;
- changements destructifs en deux versions (expand/contract) ;
- rollback applicatif compatible avec le schéma précédent ou restauration documentée.

## 5. Matrice des risques

| Risque | Probabilité | Impact | Détection | Prévention | Réponse |
| --- | --- | --- | --- | --- | --- |
| HTML/domaine FStream modifié | Élevée | Élevé | Tests de contrat et taux de résolution | Adaptateur isolé, cache, fixtures | Désactiver source, servir TMDB/stale, corriger sélecteurs |
| Provider indisponible | Élevée | Moyen/élevé | Santé, erreurs iframe, résolution | Plusieurs providers, timeout, fallback | Proposer autre source/langue, ne pas pénaliser le contenu |
| Faux contenu après rapprochement | Moyenne | Élevé | Logs de score, contrôle titre/année/affiche | Seuil strict et TMDB canonique | Rejeter, invalider cache, signalement |
| Progression iframe fausse | Élevée | Élevé | Couverture/confiance, incohérences | Pas d'horloge simulée, provenance | Déclasser signal, permettre correction utilisateur |
| Double comptage d'événements | Moyenne | Élevé | IDs/volumes anormaux | Idempotency key, transaction, unique | Recalculer projection, dédupliquer |
| Base SQLite inaccessible | Moyenne | Élevé | Readiness, `SQLITE_CANTOPEN` | volume/UID documentés, test écriture | Arrêt propre, corriger permissions, restaurer |
| Corruption/perte SQLite | Faible/moyenne | Très élevé | integrity_check, backup tests | WAL/checkpoint, sauvegardes | Restaurer dernier snapshot, rejouer migration |
| Concurrence/multi-instance | Moyenne si scale | Élevé | locks et divergences | Imposer mono-instance | Revenir à une instance ou migrer PostgreSQL |
| Épuisement quota TMDB | Moyenne | Moyen | 429, métriques miss | cache/coalescence/rate limit | stale/fallback, ralentissement contrôlé |
| SSRF via config/source | Faible/moyenne | Très élevé | logs URL refusée, tests sécurité | allowlist, DNS/IP, redirections bornées | Bloquer provider, rotation secrets, analyse incident |
| Script/publicité iframe hostile | Moyenne | Élevé | CSP reports, signalements | permissions minimales, domaines dédiés | Retirer domaine/provider, informer utilisateur |
| Brute force PIN | Élevée si public | Moyen | compteurs d'échec | rate limit/verrou temporaire | Révoquer sessions, imposer délai |
| CSRF sur mutation locale | Moyenne | Moyen | logs Origin | SameSite + token/Origin | Révoquer session, corriger état |
| Biais recommandation | Élevée | Moyen | exposition/diversité/conversion | confiance, cooldown, évaluations | Rééquilibrer poids et recalculer |
| Risque juridique des embeds | À évaluer | Très élevé | revue juridique | autorisations/conditions | Désactiver intégration ou limiter usage |

## 6. Critères opérationnels minimaux

- restauration testée d'une sauvegarde récente ;
- zéro secret dans le client ou les logs ;
- 100 % des routes personnelles couvertes par le garde de profil ;
- toutes les sources externes ont timeout, validation et erreur typée ;
- progression et complétion exposent leur niveau de confiance ;
- contrats providers testés par fixtures et contrôlés périodiquement ;
- rollback documenté avant toute migration de données.

