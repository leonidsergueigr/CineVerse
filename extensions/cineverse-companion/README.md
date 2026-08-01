# CineVerse Companion

Extension Chrome/Chromium optionnelle qui observe les elements `video` dans les
iframes des providers autorises. Elle transmet a l'application :

- la position et la duree reelles du media ;
- les etats lecture, pause, buffering, seek et fin ;
- un temps confirme calcule uniquement lorsque la timeline avance normalement ;
- un evenement `ended` exploitable pour l'auto-next.
- des commandes de reprise et de saut d'introduction envoyees au media actif.

Vidzy utilise actuellement une page d'enveloppe sur `vidzy.org`, puis charge le
lecteur HTML5 reel depuis `vidzy.cc`. Les deux domaines sont autorises afin que
le suivi reste attache a la balise video et non a la simple page d'enveloppe.

Lorsqu'une page contient plusieurs videos, le compagnon privilegie le media
long, de grande taille et actif afin d'ecarter les clips publicitaires courts.
Un clic sur l'icone de l'extension affiche l'etat du lecteur, le provider, la
position, la duree, le temps effectivement lu, la vitesse et l'age du signal.

Elle ne lit pas le panneau multimedia du systeme et ne collecte pas l'URL du
fichier video. Les messages restent dans l'onglet CineVerse courant.

## Installation locale

1. Ouvrir `chrome://extensions` ou `brave://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur **Charger l'extension non empaquetee**.
4. Selectionner le dossier `extensions/cineverse-companion`.
5. Recharger l'onglet CineVerse.

Apres une mise a jour du dossier, utiliser le bouton **Recharger** de la fiche
de l'extension avant de recharger CineVerse.

Les patterns du manifeste couvrent `localhost`, `127.0.0.1` et les domaines de
providers inscrits dans `src/lib/streaming.ts`. Si un domaine de player est
ajoute par configuration, ajouter aussi son pattern HTTPS dans `manifest.json`,
puis recharger l'extension.

## Limites

- Une video placee dans un domaine non autorise ne peut pas etre observee.
- Une video implementee sans `HTMLVideoElement` accessible reste non suivie.
- Le backend conserve ses controles de bornes et l'estimation locale comme
  fallback ; les donnees de l'extension ne sont pas acceptees sans validation.
- Les pauses, le buffering et les sauts sont exclus. L'avancement naturel du
  media reste mesure lorsque l'onglet est en arriere-plan, tant que Chromium ne
  suspend pas ou ne decharge pas completement l'onglet.
- Une lecture confirmee prouve que la timeline video a avance, pas que la
  personne regardait effectivement l'ecran.
- L'extension est prevue pour une installation locale. Elle n'est pas publiee
  sur le Chrome Web Store.
