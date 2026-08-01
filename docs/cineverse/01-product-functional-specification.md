# Spécification fonctionnelle CineVerse

## 1. Vision et périmètre

CineVerse vise à réduire le temps passé à chercher un contenu et à offrir une expérience locale personnalisée à plusieurs profils. Le produit rassemble des métadonnées TMDB, des catalogues externes, des lecteurs tiers, des préférences et un historique prudent.

**AS-IS :** le produit est une application locale sans compte distant. **TO-BE recommandé :** consolider la fiabilité et l'explicabilité avant d'élargir le périmètre fonctionnel.

## 2. Problème traité

- agréger films, séries et animations dans une interface unique ;
- trouver un titre par recherche, filtre ou recommandation ;
- choisir une version linguistique et une source disponible ;
- reprendre un contenu sans inventer une progression inaccessible ;
- séparer goûts, listes, historique et statistiques entre profils locaux ;
- renouveler l'accueil sans répéter mécaniquement le catalogue.

## 3. Utilisateurs, acteurs et rôles

| Acteur | Rôle actuel | Droits vérifiés |
| --- | --- | --- |
| Visiteur sans profil | Initialisation | Voir l'écran des profils, créer ou déverrouiller un profil |
| Profil actif | Utilisateur principal | Parcourir, lire, filtrer, gérer ses avis/liste/progression/statistiques |
| Profil protégé | Profil local avec PIN | Activation, modification ou suppression après validation du PIN |
| TMDB | Fournisseur de métadonnées | Recherche, détails, crédits, découverte, recommandations et images |
| FStream | Source externe facultative mais structurante pour la lecture | Catalogue et résolution vers des lecteurs |
| Provider vidéo | Lecteur cross-origin | Lecture ; progression seulement s'il communique |
| Mainteneur | Exploitation par code/configuration | Variables, volume SQLite et déploiement ; aucune UI d'administration |

Il n'existe pas de rôle administrateur persistant, de propriétaire de compte ou d'autorisation hiérarchique dans le modèle actuel.

## 4. Besoins fonctionnels

### Profils

- Au premier usage, créer un profil avant d'accéder au catalogue.
- Sélectionner un profil et, s'il est protégé, saisir son PIN.
- Modifier nom, couleur et PIN ; supprimer un profil avec ses données.
- Isoler historique, liste, avis, recommandations et statistiques.

### Catalogue et découverte

- Présenter un accueil composé de rangées dédupliquées et d'un héros.
- Séparer films, séries non animées et animations.
- Rechercher titres et personnes, avec suggestions et tolérance limitée aux fautes.
- Filtrer par type, genre, année, langue, personne et tri.
- Conserver les filtres actifs dans l'URL et les rendre visibles.

### Détail et lecture

- Afficher métadonnées, synopsis, genres, réalisateurs/créateurs et casting.
- Pour une série, sélectionner une saison strictement positive et un épisode existant.
- Résoudre les providers disponibles et préférer une variante française lorsqu'elle existe.
- Démarrer uniquement sur action de l'utilisateur ; un clic de fiche ne vaut pas visionnage.
- Reprendre seulement à partir d'une position suffisamment fiable.
- Permettre une complétion manuelle distincte d'une fin détectée.
- Passer à l'épisode suivant uniquement après signal de fin fiable ou action explicite.

### Personnalisation

- Gérer séparément watchlist, like et « pas pour moi ».
- Exclure ou pénaliser les contenus refusés.
- Expliquer brièvement une recommandation.
- Enregistrer les impressions et limiter les répétitions.
- Produire des statistiques uniquement à partir de signaux identifiables.

## 5. Besoins non fonctionnels

| Besoin | Exigence cible |
| --- | --- |
| Fiabilité | Une panne TMDB/FStream/provider ne doit pas corrompre l'historique ; utiliser cache/repli clairement signalé |
| Performance | Réponse catalogue issue du cache si disponible ; appels externes bornés par timeout |
| Confidentialité | Données locales par profil, secrets exclusivement côté serveur, aucune position dans les logs |
| Sécurité | URLs externes autorisées explicitement, CSP, validation serveur, mutations protégées |
| Accessibilité | Navigation clavier, contraste AA, focus visible, libellés explicites |
| Responsive | Parcours complet sur mobile sans dépendre du survol |
| Maintenabilité | Adaptateur par source, contrats testables, migrations versionnées |
| Explicabilité | Distinguer mesure, estimation, déclaration et état inconnu |
| Résilience | Cache périmé borné, fallback et erreur utilisateur actionnable |

## 6. Parcours utilisateur

### PU-01 — Premier démarrage

1. L'application ne trouve aucune session active.
2. Elle affiche la gestion des profils.
3. L'utilisateur crée un profil valide.
4. Une session locale est créée et l'accueil s'ouvre.

**Critère :** aucune donnée métier n'est créée sous un profil implicite.

### PU-02 — Rechercher et lancer un film

1. Le profil saisit au moins deux caractères ; les suggestions apparaissent.
2. Entrée ouvre les résultats et ferme le panneau de suggestions.
3. L'utilisateur ouvre une fiche, choisit source/langue, puis lance la lecture.
4. Un `PLAY_STARTED` est enregistré ; aucune complétion n'est supposée.
5. Si le player communique, des progressions bornées sont persistées.

### PU-03 — Suivre une série

1. La fiche propose les saisons positives et leurs épisodes connus.
2. L'utilisateur sélectionne S/E et lance le lecteur.
3. Une fin fiable marque l'épisode terminé.
4. Si auto-next est actif et un épisode suivant existe, un compte à rebours permet le passage.
5. Sinon, l'utilisateur déclenche manuellement l'épisode suivant.

### PU-04 — Recommandation

1. L'accueil charge préférences, historique et expositions du profil.
2. Il construit des candidats, les classe, les diversifie et déduplique la page.
3. L'impression est enregistrée avec rangée, position et score.
4. Clic, lancement et complétion peuvent être attribués à cette exposition.

### PU-05 — Provider indisponible

1. La résolution essaie la source et valide l'URL.
2. Timeout, HTML modifié ou URL refusée sont isolés.
3. Une autre source disponible peut être proposée.
4. Aucun abandon de contenu n'est déduit d'une erreur technique seule.

## 7. Règles métier

| ID | Règle |
| --- | --- |
| RM-01 | Toutes les données personnelles appartiennent exactement à un profil actif. |
| RM-02 | Un nom de profil est non vide ; un PIN éventuel contient exactement quatre chiffres. |
| RM-03 | Un profil est unique par identifiant, pas nécessairement par nom. |
| RM-04 | Un média est identifié localement par `(tmdb_id, media_type)` ; un épisode ajoute saison et épisode. |
| RM-05 | La saison 0 n'est pas proposée comme saison de lecture standard. |
| RM-06 | Watchlist, like et dislike sont mutuellement distincts ; un dislike doit fortement pénaliser la recommandation. |
| RM-07 | Le lancement n'est ni une vue terminée, ni une preuve de durée regardée. |
| RM-08 | Une progression ne doit avancer que par signal player, déclaration utilisateur ou import explicitement qualifié. |
| RM-09 | La fin automatique nécessite un signal de fin ou un seuil proche de la fin avec confiance suffisante. |
| RM-10 | Un saut temporel ne crée pas autant de temps regardé ; le temps est borné par le temps mural. |
| RM-11 | Une erreur provider n'est pas un signal négatif sur le contenu. |
| RM-12 | Un contenu explicitement refusé n'est plus proposé tant que le refus existe. |
| RM-13 | Une donnée externe périmée peut être utilisée comme repli, mais sa fraîcheur doit être observable. |
| RM-14 | Un résultat FStream n'est accepté qu'après rapprochement suffisant avec TMDB. |
| RM-15 | Les statistiques `0` et « non mesurable » sont deux états différents. |

## 8. Permissions

| Action | Sans session | Profil actif | PIN requis |
| --- | --- | --- | --- |
| Créer un profil | Oui | Oui | Non |
| Activer profil non protégé | Oui | Oui | Non |
| Activer profil protégé | Oui | Oui | Oui |
| Modifier/supprimer un profil protégé | Non | Oui | Oui |
| Lire catalogue public | Redirection profils dans les pages | Oui | Non après activation |
| Modifier progression/avis/liste | Non | Oui | Session valide |
| Voir statistiques | Non | Oui | Session valide |

**Limite AS-IS :** les API reposent sur la session active locale ; il n'existe pas de permission d'administration ni de partage.

## 9. Cas limites et erreurs

- identifiant TMDB invalide, média inexistant ou type incohérent ;
- absence de secret TMDB, quota atteint, timeout ou réponse mal formée ;
- domaine FStream introuvable, non autorisé, HTML modifié ou résultat ambigu ;
- source sans langue demandée ou sans épisode demandé ;
- URL de lecteur en HTTP, hôte/path non autorisé ou redirection inattendue ;
- iframe silencieuse, messages d'une origine non fiable, durée nulle ou position régressive ;
- saison vide, épisode hors plage, fin de saison ou fin de série ;
- double envoi d'un événement ou d'une impression ;
- cache corrompu, disque plein, volume SQLite non accessible ou verrouillage concurrent ;
- session expirée, profil supprimé, PIN erroné ou essais automatisés ;
- aucune donnée de recommandation (cold start) ;
- métadonnée indisponible : ne pas afficher `N/A` comme une note réelle.

## 10. Catalogue fonctionnel

| Domaine | Fonctionnalité | Statut actuel | Priorité | Dépendances | Critère d'acceptation |
| --- | --- | --- | --- | --- | --- |
| Profils | Création/sélection/édition/suppression | Implémenté | P0 | SQLite, cookie | Données isolées et PIN vérifié lorsque présent |
| Profils | Compte distant et récupération | À vérifier | P3 | Identité distante | Hors MVP tant qu'un besoin multi-appareil n'est pas validé |
| Catalogue | Accueil multi-rangées | Implémenté | P1 | TMDB, FStream, cache | Au moins les rangées disponibles, sans doublon global |
| Catalogue | Programmation contextuelle | Implémenté | P1 | Historique, expositions | Ordre/héros adaptés sans aléatoire incontrôlé |
| Recherche | Suggestions titres/personnes | Implémenté | P1 | TMDB, Fuse | Fermeture au submit/navigation/clic extérieur ; groupes distincts |
| Recherche | Tolérance aux fautes | Partiellement implémenté | P1 | Fuse/catalogue | Résultat pertinent pour variations proches sans bruit excessif |
| Filtres | Type/genre/année/langue/personne | Implémenté | P1 | TMDB discover/search | URL reproductible, filtres actifs visibles, pagination correcte |
| Détail | Métadonnées, casting et créateurs | Implémenté | P1 | TMDB | Liens personne/genre ouvrent le filtre correspondant |
| Films | Source/langue/lecture | Implémenté | P0 | FStream/providers | Aucun film incorrect après validation TMDB |
| Séries | Saisons/épisodes bornés | Implémenté | P0 | TMDB seasons | Pas de S0 ; impossible de choisir un épisode inexistant |
| Lecture | Suivi exact | Partiellement implémenté | P0 | `postMessage` provider | Marqué exact uniquement avec contrat contrôlé |
| Lecture | Reprise | Partiellement implémenté | P0 | Provider, historique | Position reprise si le provider accepte `seek` |
| Lecture | Auto-next | Partiellement implémenté | P1 | Signal de fin fiable | Un seul passage au prochain épisode, annulable |
| Avis | Like/dislike | Implémenté | P1 | Session, SQLite | États exclusifs, effet explicable sur recommandations |
| Liste | Watchlist et page dédiée | Implémenté | P1 | Session, SQLite | Ajout/retrait instantané et affichage par profil |
| Historique | Commencé/terminé | Partiellement implémenté | P0 | Signaux lecture | Provenance et confiance persistées |
| Recommandations | Hybride contenu/règles | Implémenté | P1 | TMDB, avis, historique | Exclut refus, diversifie et explique les résultats |
| Recommandations | ML prédictif | Recommandé plus tard | P3 | Volume d'événements fiable | Seulement après données suffisantes et évaluation hors ligne |
| Statistiques | Tableau de bord par profil | Partiellement implémenté | P2 | Événements fiables | Inconnu affiché comme tel, pas comme zéro |
| Cache | Mémoire + SQLite + stale | Implémenté | P1 | SQLite | TTL et repli mesurables, purge bornée |
| Provider | Adaptateurs et fallback | Partiellement implémenté | P0 | FStream, registre | Une panne n'échoue pas tout le parcours |
| Maintenance | Santé et observabilité | À vérifier | P0 | Logs, métriques | Health endpoint, métriques et alerte de résolution |
| Administration | Interface opérateur | À vérifier | P3 | Auth forte | Ne pas construire avant besoin multi-utilisateur |

## 11. MVP, version suivante et avancé

### MVP fiable

- profils locaux et session ;
- TMDB, catalogue, recherche, filtres et détail ;
- résolution provider avec validation ;
- lecture manuelle ;
- watchlist et avis ;
- progression déclarée ou qualifiée ;
- cache et erreurs compréhensibles.

### Version suivante

- modèle de confiance de progression ;
- tests de contrat providers/FStream ;
- santé des sources et fallback mesuré ;
- recommandations et statistiques nettoyées des signaux faibles ;
- exploitation et sauvegarde reproductibles.

### Fonctionnalités avancées

- synchronisation multi-appareil et comptes ;
- mode « Choisis pour moi » enrichi par durée/contexte ;
- compatibilité entre profils avec consentement ;
- modèle de classement appris après constitution d'un jeu fiable ;
- recap partageable respectueux de la confidentialité.

## 12. Critères transversaux d'acceptation

1. Aucune mutation personnelle n'est acceptée sans profil actif valide.
2. Aucune URL externe non autorisée n'est rendue ou redirigée.
3. Une erreur externe n'efface ni ne transforme une progression existante.
4. Une valeur inconnue n'est jamais agrégée comme zéro.
5. Toute complétion indique sa provenance et son niveau de confiance dans le modèle cible.
6. Un même événement envoyé deux fois ne double pas le temps regardé.
7. Les comportements essentiels sont testables sans réseau réel grâce à des fixtures.

