# Changelog

Les changements notables de CineVerse sont regroupes dans ce fichier.

## Non publie

### Lecture

- L'apprentissage des introductions conserve maintenant le cold open et peut
  reconnaitre une intro qui commence plusieurs minutes apres le debut.
- Les recherches successives de la fin d'une intro, y compris les retours en
  arriere apres un depassement, sont fusionnees en une seule observation par
  episode.
- Les seeks de reprise et ceux declenches par CineVerse sont exclus de
  l'apprentissage afin de ne pas contaminer le modele.

## 1.0.0 - 2026-08-04

Premiere version locale complete de CineVerse.

### Produit

- Profils independants avec PIN facultatif, historique, watchlist et avis.
- Accueil programme selon les reprises, les nouveautes et les recommandations.
- Catalogue TMDB avec recherche, suggestions et filtres combinables.
- Fiches films et series avec saisons, episodes, casting et metadonnees.
- Resolution multi-source et preference de langue.
- Suivi hybride, completions manuelles et Companion Chromium optionnel.
- Statistiques et recommandations separees par profil.
- Signature de lancement CineVerse jouee une fois par session, avec sortie
  immediate au clavier et mode de mouvement reduit.

### Plateforme

- Persistance et cache SQLite.
- Lancement local ou avec Docker Compose.
- Identite visuelle CineVerse unifiee sur le site, les metadonnees et le
  Companion.
- Documentation technique dans `docs/cineverse` et guide de marque dans
  `docs/brand`.

### Limites connues

- Les lecteurs tiers restent soumis a leur disponibilite, a leurs domaines et
  a leurs politiques d'iframe.
- Sans Companion ou API de player, une progression automatique reste une
  estimation et n'est pas presentee comme une mesure confirmee.
- Les catalogues et recommandations riches necessitent un acces TMDB valide.
